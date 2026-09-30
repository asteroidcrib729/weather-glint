from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from backend.app.main import _prune_rate_limits, _request_counts, app, settings


def met_forecast_payload() -> dict[str, object]:
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    hours = list(range(49)) + list(range(54, 223, 6))
    series = []
    for hour in hours:
        instant = start + timedelta(hours=hour)
        local_hour = (instant.hour + 5) % 24
        symbol = "partlycloudy_day" if 6 <= local_hour < 18 else "partlycloudy_night"
        period = "next_1_hours" if hour < 49 else "next_6_hours"
        series.append(
            {
                "time": instant.isoformat().replace("+00:00", "Z"),
                "data": {
                    "instant": {
                        "details": {
                            "air_temperature": 30.0,
                            "relative_humidity": 70.0,
                            "wind_speed": 3.0,
                            "wind_from_direction": 220.0,
                        }
                    },
                    period: {
                        "summary": {"symbol_code": symbol},
                        "details": {
                            "precipitation_amount": (
                                0.1 if hour == 0 else 0.6 if hour == 1 else 0.2
                            ),
                            "air_temperature_max": 33.0,
                            "air_temperature_min": 27.0,
                        },
                    },
                },
            }
        )
    return {
        "properties": {
            "meta": {
                "units": {
                    "air_temperature": "celsius",
                    "wind_speed": "m/s",
                    "precipitation_amount": "mm",
                }
            },
            "timeseries": series,
        }
    }


def forecast_payload() -> dict[str, object]:
    start = datetime(2026, 9, 23)
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(168)]
    days = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    return {
        "latitude": 24.86,
        "longitude": 67.01,
        "timezone": "Asia/Karachi",
        "current": {
            "time": "2026-09-23T12:15",
            "temperature_2m": 31.2,
            "apparent_temperature": 36.1,
            "relative_humidity_2m": 69,
            "precipitation": 0.1,
            "wind_speed_10m": 12.0,
            "wind_direction_10m": 220,
            "is_day": 1,
            "weather_code": 2,
        },
        "hourly": {
            "time": times,
            "temperature_2m": [31.0] * 168,
            "precipitation_probability": [20] * 168,
            "weather_code": [2] * 168,
            "is_day": [1 if 6 <= (i % 24) < 18 else 0 for i in range(168)],
        },
        "daily": {
            "time": days,
            "temperature_2m_max": [35.0] * 7,
            "temperature_2m_min": [27.0] * 7,
            "precipitation_probability_max": [40] * 7,
            "weather_code": [2] * 7,
        },
    }


def test_health_has_no_provider_dependency() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@respx.mock
def test_locations_are_normalized_and_cached() -> None:
    route = respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 1174872,
                        "name": "Karachi",
                        "admin1": "Sindh",
                        "country": "Pakistan",
                        "country_code": "PK",
                        "latitude": 24.8608,
                        "longitude": 67.0104,
                        "timezone": "Asia/Karachi",
                    }
                ]
            },
        )
    )
    with TestClient(app) as client:
        first = client.get("/api/v1/locations", params={"query": "Karachi"})
        second = client.get("/api/v1/locations", params={"query": "Karachi"})
    assert first.status_code == second.status_code == 200
    assert first.json()[0]["name"] == "Karachi"
    assert route.call_count == 1


@respx.mock
def test_weather_has_24_hours_and_seven_days() -> None:
    payload = met_forecast_payload()
    respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").mock(
        return_value=httpx.Response(200, json=payload)
    )
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/weather",
            params={
                "latitude": 24.86,
                "longitude": 67.01,
                "timezone": "Asia/Karachi",
                "units": "metric",
            },
        )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["timezone"] == "Asia/Karachi"
    assert data["current"]["condition"] == "Partly cloudy"
    properties = payload["properties"]
    assert isinstance(properties, dict)
    series = properties["timeseries"]
    assert isinstance(series, list)
    next_entry = series[1]
    assert isinstance(next_entry, dict)
    next_time = next_entry["time"]
    assert isinstance(next_time, str)
    expected_time = datetime.fromisoformat(next_time.replace("Z", "+00:00"))
    expected_local = expected_time.astimezone(ZoneInfo("Asia/Karachi")).strftime("%Y-%m-%dT%H:%M")
    assert data["current"]["time"] == expected_local
    assert data["hourly"][0]["time"] == expected_local
    assert len(data["hourly"]) == 24
    assert data["hourly"][0]["is_day"] is (
        6 <= expected_time.astimezone(ZoneInfo("Asia/Karachi")).hour < 18
    )
    assert datetime.fromisoformat(data["hourly"][-1]["time"]) == (
        datetime.fromisoformat(expected_local) + timedelta(hours=23)
    )
    assert len(data["daily"]) == 7
    assert data["units"]["temperature"] == "\u00b0C"
    assert data["current"]["apparent_temperature"] is None
    assert data["current"]["precipitation"] == 0.6
    assert data["hourly"][0]["precipitation_probability_percent"] is None
    assert data["daily"][0]["uv_index_max"] is None
    assert data["source"] == "MET Norway"


def test_met_mapper_advances_the_next_hour_as_cached_forecast_ages() -> None:
    from backend.app.core.errors import ProviderError
    from backend.app.services.met_weather import map_met_weather, parse_met_forecast

    forecast = parse_met_forecast(met_forecast_payload())
    first_hour = forecast.points[0].time

    def mapped(at: datetime) -> float | None:
        return map_met_weather(
            forecast, 24.8608, 67.0104, "Asia/Karachi", "metric", now=at
        ).current.precipitation

    assert mapped(first_hour + timedelta(hours=1)) == 0.6
    assert mapped(first_hour + timedelta(hours=1, minutes=59)) == 0.6
    assert mapped(first_hour + timedelta(hours=2)) == 0.2
    with pytest.raises(ProviderError):
        mapped(forecast.points[-1].time + timedelta(hours=1))


def test_met_mapper_updates_response_time_when_cached_forecast_is_reused() -> None:
    from backend.app.services.met_weather import map_met_weather, parse_met_forecast

    forecast = parse_met_forecast(met_forecast_payload())
    checked_at = forecast.points[0].time + timedelta(hours=1, minutes=10)
    refreshed_at = checked_at + timedelta(minutes=18)

    first = map_met_weather(forecast, 24.8608, 67.0104, "Asia/Karachi", "metric", now=checked_at)
    refreshed = map_met_weather(
        forecast, 24.8608, 67.0104, "Asia/Karachi", "metric", now=refreshed_at
    )

    assert first.generated_at == checked_at
    assert refreshed.generated_at == refreshed_at
    assert refreshed.generated_at > first.generated_at
    assert refreshed.current == first.current
    assert forecast.fetched_at != refreshed.generated_at


@respx.mock
def test_forecast_identifies_app_and_limits_coordinate_precision() -> None:
    route = respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").mock(
        return_value=httpx.Response(200, json=met_forecast_payload())
    )
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/weather",
            params={
                "latitude": 24.86081,
                "longitude": 67.01041,
                "timezone": "Asia/Karachi",
            },
        )
    assert response.status_code == 200
    upstream = route.calls[0].request
    assert upstream.headers["user-agent"] == settings.met_norway_user_agent
    assert upstream.url.params["lat"] == "24.8608"
    assert upstream.url.params["lon"] == "67.0104"


def test_solar_fields_map_with_local_date_and_missing_values() -> None:
    from backend.app.services.weather import map_weather

    payload = forecast_payload()
    daily = payload["daily"]
    assert isinstance(daily, dict)
    dates = daily["time"]
    assert isinstance(dates, list)
    daily["sunrise"] = [f"{day}T06:10" for day in dates]
    daily["sunset"] = [f"{day}T18:20" for day in dates]
    daily["uv_index_max"] = [8.4] * 7
    daily["sunrise"][1] = None
    daily["uv_index_max"][1] = None
    result = map_weather(payload, "metric")
    assert result.daily[0].sunrise == "2026-09-23T06:10"
    assert result.daily[0].sunset == "2026-09-23T18:20"
    assert result.daily[0].uv_index_max == 8.4
    assert result.daily[1].sunrise is None
    assert result.daily[1].uv_index_max is None
    assert result.daily[1].sunset == "2026-09-24T18:20"


def test_invalid_solar_fields_are_rejected() -> None:
    import pytest

    from backend.app.core.errors import ProviderError
    from backend.app.services.weather import map_weather

    for field, value in (
        ("sunrise", ["2026-09-22T06:00"] * 7),
        ("sunset", ["2026-09-23T18:00"]),
        ("uv_index_max", [-1.0] * 7),
    ):
        payload = forecast_payload()
        daily = payload["daily"]
        assert isinstance(daily, dict)
        daily[field] = value
        with pytest.raises(ProviderError):
            map_weather(payload, "metric")


@respx.mock
def test_misaligned_or_invalid_provider_data_becomes_safe_error() -> None:
    for change in ("short_hourly", "bad_temperature"):
        payload = met_forecast_payload()
        properties = payload["properties"]
        assert isinstance(properties, dict)
        series = properties["timeseries"]
        assert isinstance(series, list)
        if change == "short_hourly":
            del series[5]
        else:
            series[0]["data"]["instant"]["details"]["air_temperature"] = "not-a-number"
        respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").mock(
            return_value=httpx.Response(200, json=payload)
        )
        with TestClient(app) as client:
            response = client.get("/api/v1/weather", params={"latitude": 24.86, "longitude": 67.01})
        assert response.status_code == 502
        assert response.json()["error"] == "provider_unavailable"


def test_nonfinite_provider_number_becomes_safe_error() -> None:
    from backend.app.core.errors import ProviderError
    from backend.app.services.weather import map_weather

    payload = forecast_payload()
    hourly = payload["hourly"]
    assert isinstance(hourly, dict)
    hourly["temperature_2m"] = [float("nan")] * 168
    import pytest

    with pytest.raises(ProviderError) as error:
        map_weather(payload, "metric")
    assert error.value.code == "provider_unavailable"


def test_missing_probability_and_unknown_weather_code_are_safe_to_display() -> None:
    from backend.app.services.weather import map_weather

    payload = forecast_payload()
    hourly = payload["hourly"]
    daily = payload["daily"]
    assert isinstance(hourly, dict) and isinstance(daily, dict)
    hourly["precipitation_probability"] = [None] * 168
    daily["precipitation_probability_max"] = [None] * 7
    hourly["weather_code"] = [999] * 168
    response = map_weather(payload, "metric")
    assert response.hourly[0].precipitation_probability_percent is None
    assert response.daily[0].precipitation_probability_max_percent is None
    assert response.hourly[0].condition == "Unknown conditions"


def test_hourly_dst_fall_back_keeps_both_real_hours() -> None:
    from backend.app.services.weather import map_weather

    payload = forecast_payload()
    payload["timezone"] = "Europe/London"
    current = payload["current"]
    hourly = payload["hourly"]
    daily = payload["daily"]
    assert isinstance(current, dict) and isinstance(hourly, dict) and isinstance(daily, dict)
    start = datetime(2026, 10, 24, tzinfo=UTC)
    zone = ZoneInfo("Europe/London")
    times = [
        (start + timedelta(hours=index)).astimezone(zone).strftime("%Y-%m-%dT%H:%M")
        for index in range(168)
    ]
    hourly["time"] = times
    daily["time"] = [f"2026-10-{day:02d}" for day in range(24, 31)]
    current["time"] = "2026-10-25T00:15"
    result = map_weather(payload, "metric")
    assert result.hourly[1].time == "2026-10-25T01:00"
    assert result.hourly[2].time == "2026-10-25T01:00"
    assert len(result.hourly) == 24


def test_duplicate_hour_outside_dst_is_rejected() -> None:
    import pytest

    from backend.app.core.errors import ProviderError
    from backend.app.services.weather import map_weather

    payload = forecast_payload()
    hourly = payload["hourly"]
    assert isinstance(hourly, dict)
    times = hourly["time"]
    assert isinstance(times, list)
    times[1] = times[0]
    with pytest.raises(ProviderError):
        map_weather(payload, "metric")


@respx.mock
def test_invalid_geocoding_item_is_safe_error() -> None:
    respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {"id": 1, "name": "Invalid", "country": "X", "latitude": 999, "longitude": 0}
                ]
            },
        )
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/locations", params={"query": "Invalid"})
    assert response.status_code == 502


def test_invalid_coordinates_are_rejected() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/weather", params={"latitude": 120, "longitude": 0})
    assert response.status_code == 422


def test_invalid_timezone_is_rejected_before_provider_request() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/weather",
            json={"latitude": 24.86, "longitude": 67.01, "timezone": "Mars/Olympus"},
        )
    assert response.status_code == 422


def test_whitespace_only_search_is_rejected() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/locations", params={"query": "   "})
    assert response.status_code == 422


@respx.mock
def test_imperial_request_uses_provider_units() -> None:
    route = respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").mock(
        return_value=httpx.Response(200, json=met_forecast_payload())
    )
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/weather", params={"latitude": 24.86, "longitude": 67.01, "units": "imperial"}
        )
    assert response.status_code == 200
    assert response.json()["units"] == {
        "temperature": "\u00b0F",
        "wind_speed": "mph",
        "precipitation": "in",
    }
    assert response.json()["current"]["temperature"] == 86
    assert response.json()["current"]["wind_speed"] == pytest.approx(6.71, rel=0.01)
    assert "temperature_unit" not in route.calls[0].request.url.params


@respx.mock
def test_empty_geocoding_results_are_valid() -> None:
    respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(200, json={"results": []})
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/locations", params={"query": "Not a real place"})
    assert response.status_code == 200
    assert response.json() == []


@respx.mock
def test_malformed_provider_payload_is_safe_error() -> None:
    respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").mock(
        return_value=httpx.Response(200, json={"current": {}})
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/weather", params={"latitude": 24.86, "longitude": 67.01})
    assert response.status_code == 502
    assert response.json()["error"] == "provider_unavailable"


@respx.mock
def test_provider_rate_limit_is_translated() -> None:
    route = respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(429, headers={"Retry-After": "0"})
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/locations", params={"query": "Lahore"})
    assert response.status_code == 503
    assert response.json()["error"] == "provider_rate_limited"
    assert route.call_count == 3


@respx.mock
def test_long_retry_after_fails_fast_without_violating_provider_wait() -> None:
    route = respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(429, headers={"Retry-After": "60"})
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/locations", params={"query": "Lahore"})
    assert response.status_code == 503
    assert route.call_count == 1


@respx.mock
def test_provider_timeout_becomes_safe_error() -> None:
    route = respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        side_effect=httpx.ReadTimeout("timeout")
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/locations", params={"query": "Islamabad"})
    assert response.status_code == 502
    assert response.json()["error"] == "provider_unavailable"
    assert route.call_count == 3


@respx.mock
def test_provider_invalid_json_becomes_safe_error() -> None:
    respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(200, text="not json")
    )
    with TestClient(app) as client:
        response = client.get("/api/v1/locations", params={"query": "Peshawar"})
    assert response.status_code == 502
    assert response.json()["error"] == "provider_unavailable"


@respx.mock
def test_application_rate_limit_has_consistent_headers() -> None:
    respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(200, json={"results": []})
    )
    original_limit = settings.rate_limit_per_minute
    _request_counts.clear()
    settings.rate_limit_per_minute = 1
    try:
        with TestClient(app) as client:
            first = client.get("/api/v1/locations", params={"query": "Karachi"})
            blocked = client.get("/api/v1/locations", params={"query": "Lahore"})
        assert first.status_code == 200
        assert blocked.status_code == 429
        assert blocked.headers["retry-after"] == "60"
        assert blocked.headers["x-content-type-options"] == "nosniff"
        assert blocked.headers["x-request-id"]
    finally:
        settings.rate_limit_per_minute = original_limit
        _request_counts.clear()


def test_untrusted_forwarding_headers_cannot_change_local_rate_limit_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RENDER", raising=False)
    original_limit = settings.rate_limit_per_minute
    _request_counts.clear()
    settings.rate_limit_per_minute = 1
    try:
        with TestClient(app) as client:
            first = client.get(
                "/api/v1/missing",
                headers={"X-Forwarded-For": "192.0.2.10", "CF-Connecting-IP": "192.0.2.10"},
            )
            blocked = client.get(
                "/api/v1/missing",
                headers={"X-Forwarded-For": "192.0.2.11", "CF-Connecting-IP": "192.0.2.11"},
            )
        assert first.status_code == 404
        assert blocked.status_code == 429
        assert set(_request_counts) == {"connection:testclient"}
    finally:
        settings.rate_limit_per_minute = original_limit
        _request_counts.clear()


def test_render_rate_limit_uses_only_valid_edge_client_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RENDER", "true")
    original_limit = settings.rate_limit_per_minute
    _request_counts.clear()
    settings.rate_limit_per_minute = 1
    try:
        with TestClient(app) as client:
            first = client.get(
                "/api/v1/missing",
                headers={"CF-Connecting-IP": "192.0.2.10", "X-Forwarded-For": "198.51.100.1"},
            )
            spoofed = client.get(
                "/api/v1/missing",
                headers={"CF-Connecting-IP": "192.0.2.10", "X-Forwarded-For": "198.51.100.2"},
            )
            other_client = client.get(
                "/api/v1/missing",
                headers={"CF-Connecting-IP": "192.0.2.11", "X-Forwarded-For": "198.51.100.1"},
            )
            invalid = client.get(
                "/api/v1/missing",
                headers={"CF-Connecting-IP": "not-an-ip", "X-Forwarded-For": "198.51.100.3"},
            )
            invalid_again = client.get(
                "/api/v1/missing", headers={"CF-Connecting-IP": "also-invalid"}
            )
            duplicate = client.get(
                "/api/v1/missing",
                headers=[("CF-Connecting-IP", "192.0.2.12"), ("CF-Connecting-IP", "192.0.2.13")],
            )
        assert [response.status_code for response in (first, spoofed, other_client)] == [
            404,
            429,
            404,
        ]
        assert invalid.status_code == 404
        assert invalid_again.status_code == 429
        assert duplicate.status_code == 429
        assert set(_request_counts) == {
            "render-client:192.0.2.10",
            "render-client:192.0.2.11",
            "connection:testclient",
        }
    finally:
        settings.rate_limit_per_minute = original_limit
        _request_counts.clear()


def test_stale_rate_limit_entries_are_pruned() -> None:
    _request_counts.clear()
    _request_counts["192.0.2.1"] = (10.0, 1)
    _request_counts["192.0.2.2"] = (75.0, 1)
    _prune_rate_limits(76.0)
    assert "192.0.2.1" not in _request_counts
    assert "192.0.2.2" in _request_counts
    _request_counts.clear()


@respx.mock
def test_post_endpoints_avoid_sensitive_query_strings() -> None:
    respx.get("https://geocoding-api.open-meteo.com/v1/search").mock(
        return_value=httpx.Response(200, json={"results": []})
    )
    respx.get("https://api.met.no/weatherapi/locationforecast/2.0/compact").mock(
        return_value=httpx.Response(200, json=met_forecast_payload())
    )
    with TestClient(app) as client:
        places = client.post("/api/v1/locations", json={"query": "Karachi", "limit": 6})
        forecast = client.post(
            "/api/v1/weather", json={"latitude": 24.86, "longitude": 67.01, "units": "metric"}
        )
        invalid = client.post("/api/v1/weather", json={"latitude": 100, "longitude": 67.01})
    assert places.status_code == 200
    assert forecast.status_code == 200
    assert invalid.status_code == 422
