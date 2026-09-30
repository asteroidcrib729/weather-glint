import asyncio
import time
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime

import httpx
import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app.clients.met_norway import MetNorwayClient, MetNorwayPilot, MetNorwayRateLimiter
from backend.app.core.config import Settings
from backend.app.core.errors import ProviderError


def forecast_payload() -> dict[str, object]:
    start = datetime(2026, 9, 28, tzinfo=UTC)
    return {
        "properties": {
            "timeseries": [
                {"time": (start + timedelta(hours=index)).isoformat()} for index in range(217)
            ]
        }
    }


def valid_forecast_payload() -> dict[str, object]:
    start = datetime(2026, 9, 28, tzinfo=UTC)
    return {
        "properties": {
            "meta": {
                "units": {
                    "air_temperature": "celsius",
                    "wind_speed": "m/s",
                    "precipitation_amount": "mm",
                }
            },
            "timeseries": [
                {
                    "time": (start + timedelta(hours=index)).isoformat(),
                    "data": {
                        "instant": {
                            "details": {
                                "air_temperature": 27,
                                "relative_humidity": 75,
                                "wind_speed": 2,
                                "wind_from_direction": 250,
                            }
                        }
                    },
                }
                for index in range(217)
            ],
        },
    }


@pytest.mark.asyncio
async def test_met_limiter_spaces_concurrent_starts_and_caps_window() -> None:
    limiter = MetNorwayRateLimiter(interval_seconds=0.03, window_seconds=0.11, window_limit=2)
    starts: list[float] = []

    async def take_turn() -> None:
        await limiter.wait_turn()
        starts.append(time.monotonic())

    await asyncio.gather(*(take_turn() for _ in range(3)))
    assert starts[1] - starts[0] >= 0.025
    assert starts[2] - starts[0] >= 0.10


@pytest.mark.asyncio
async def test_default_met_limiter_spaces_starts_by_one_second() -> None:
    limiter = MetNorwayRateLimiter()
    first = time.monotonic()
    await limiter.wait_turn()
    await limiter.wait_turn()
    assert time.monotonic() - first >= 0.99


def test_opt_in_pilot_runs_during_backend_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    async def fake_pilot() -> None:
        calls.append("started")

    monkeypatch.setattr(main.settings, "met_norway_pilot_on_startup", True)
    monkeypatch.setattr(main, "_run_met_norway_pilot", fake_pilot)
    with TestClient(main.app) as client:
        assert client.get("/api/v1/health").status_code == 200
    assert calls == ["started"]


@pytest.mark.asyncio
async def test_met_pilot_identifies_app_and_paces_all_requests() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            headers={"Expires": "Tue, 29 Sep 2026 00:00:00 GMT"},
            json=forecast_payload(),
        )

    settings = Settings(
        met_norway_user_agent="WeatherGlint/0.1 (https://github.com/asteroidcrib729/weather-glint)",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        pilot = MetNorwayPilot(http, settings, MetNorwayRateLimiter(interval_seconds=0))
        await pilot.run()
    assert len(requests) == 3
    assert all(
        request.headers["user-agent"] == settings.met_norway_user_agent for request in requests
    )
    assert requests[0].url.params["lat"] == "24.8608"
    assert requests[0].url.params["lon"] == "67.0104"


@pytest.mark.asyncio
async def test_met_pilot_stops_on_429_without_retrying() -> None:
    requests = 0

    def respond(_request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(429)

    settings = Settings(met_norway_user_agent="WeatherGlint/0.1 contact@example.com")
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        await MetNorwayPilot(http, settings).run()
    assert requests == 1


@pytest.mark.asyncio
async def test_met_pilot_skips_without_identity() -> None:
    def respond(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("network must not be used without identity")

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        await MetNorwayPilot(http, Settings(met_norway_user_agent="")).run()


@pytest.mark.asyncio
async def test_met_cache_honors_expires_and_revalidates_with_last_modified() -> None:
    requests: list[httpx.Request] = []
    expires = format_datetime(datetime.now(UTC) + timedelta(hours=1), usegmt=True)
    modified = "Mon, 28 Sep 2026 00:00:00 GMT"

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(
                200,
                json=valid_forecast_payload(),
                headers={"Expires": expires, "Last-Modified": modified},
            )
        return httpx.Response(304, headers={"Expires": expires})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        provider = MetNorwayClient(
            http, Settings(), limiter=MetNorwayRateLimiter(interval_seconds=0)
        )
        first = await provider.forecast(24.8608, 67.0104)
        assert await provider.forecast(24.8608, 67.0104) is first
        assert len(requests) == 1
        entry = next(iter(provider.cache.values()))
        entry.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        assert await provider.forecast(24.8608, 67.0104) is first
        assert requests[1].headers["if-modified-since"] == modified
        assert requests[1].headers["user-agent"] == (
            "WeatherGlint/1.0 (+https://github.com/asteroidcrib729/weather-glint)"
        )
        assert await provider.forecast(24.8608, 67.0104) is first
        assert len(requests) == 2


@pytest.mark.asyncio
async def test_met_429_stops_without_retry() -> None:
    requests = 0

    def respond(_request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(429)

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        provider = MetNorwayClient(
            http, Settings(), limiter=MetNorwayRateLimiter(interval_seconds=0)
        )
        with pytest.raises(ProviderError) as error:
            await provider.forecast(24.8608, 67.0104)
    assert error.value.code == "provider_rate_limited"
    assert requests == 1
