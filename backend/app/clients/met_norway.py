import asyncio
import json
import logging
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from backend.app.core.config import Settings
from backend.app.core.errors import PROVIDER_RATE_LIMITED, PROVIDER_UNAVAILABLE
from backend.app.core.metrics import OperationalMetrics
from backend.app.services.met_weather import MetForecast, parse_met_forecast

logger = logging.getLogger("uvicorn.error")

PILOT_PLACES = (
    ("Karachi", 24.8608, 67.0104),
    ("London", 51.5072, -0.1276),
    ("Sydney", -33.8688, 151.2093),
)


class MetNorwayRateLimiter:
    """Space starts by one second and cap starts in a rolling 24-hour window.

    This is process-local. Render Free currently runs one instance, but restarts
    reset the counters; a durable shared store is needed for a hard global cap.
    """

    def __init__(
        self,
        interval_seconds: float = 1.0,
        window_seconds: float = 86400.0,
        window_limit: int = 86400,
    ) -> None:
        self.interval_seconds = interval_seconds
        self.window_seconds = window_seconds
        self.window_limit = window_limit
        self.starts: deque[float] = deque()
        self.next_start = 0.0
        self.lock = asyncio.Lock()

    async def wait_turn(self) -> None:
        async with self.lock:
            while True:
                now = time.monotonic()
                while self.starts and now - self.starts[0] >= self.window_seconds:
                    self.starts.popleft()
                delay = max(0.0, self.next_start - now)
                if len(self.starts) >= self.window_limit:
                    delay = max(delay, self.starts[0] + self.window_seconds - now)
                if delay > 0:
                    await asyncio.sleep(delay)
                    continue
                self.starts.append(now)
                self.next_start = now + self.interval_seconds
                return


SHARED_MET_NORWAY_LIMITER = MetNorwayRateLimiter()


@dataclass
class ForecastCacheEntry:
    forecast: MetForecast
    expires_at: datetime
    last_modified: str | None


def _http_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).astimezone(UTC)
    except TypeError, ValueError, OverflowError:
        return None


class MetNorwayClient:
    """Identified, paced, cache-aware forecast client. Geocoding stays separate."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        settings: Settings,
        metrics: OperationalMetrics | None = None,
        limiter: MetNorwayRateLimiter | None = None,
    ) -> None:
        self.http = http
        self.settings = settings
        self.metrics = metrics
        self.limiter = limiter if limiter is not None else SHARED_MET_NORWAY_LIMITER
        self.cache: OrderedDict[tuple[str, str], ForecastCacheEntry] = OrderedDict()
        self.inflight: dict[tuple[str, str], asyncio.Task[MetForecast]] = {}
        self.cache_limit = 256

    def prune_expired(self, now: float | None = None) -> None:
        # Keep expired data for conditional revalidation; evict only old entries.
        cutoff = datetime.now(UTC) - timedelta(days=1)
        for key, entry in list(self.cache.items()):
            if entry.expires_at < cutoff:
                del self.cache[key]

    async def forecast(self, latitude: float, longitude: float) -> MetForecast:
        key = (f"{latitude:.4f}", f"{longitude:.4f}")
        cached = self.cache.get(key)
        if cached is not None and datetime.now(UTC) < cached.expires_at:
            self.cache.move_to_end(key)
            if self.metrics:
                self.metrics.record_cache("forecast", True)
            return cached.forecast
        if self.metrics:
            self.metrics.record_cache("forecast", False)
        task = self.inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._fetch(key, cached))
            self.inflight[key] = task
            task.add_done_callback(lambda done: self._clear_inflight(key, done))
        return await asyncio.shield(task)

    def _clear_inflight(self, key: tuple[str, str], task: asyncio.Task[MetForecast]) -> None:
        if self.inflight.get(key) is task:
            del self.inflight[key]
        if not task.cancelled():
            task.exception()

    async def _fetch(self, key: tuple[str, str], cached: ForecastCacheEntry | None) -> MetForecast:
        try:
            await asyncio.wait_for(self.limiter.wait_turn(), timeout=3)
        except TimeoutError as exc:
            if self.metrics:
                self.metrics.record_provider("forecast", "local_quota", 0)
            raise PROVIDER_RATE_LIMITED from exc
        headers = {
            "User-Agent": self.settings.met_norway_user_agent,
            "Accept": "application/json",
        }
        if cached is not None and cached.last_modified:
            headers["If-Modified-Since"] = cached.last_modified
        started = time.monotonic()
        try:
            response = await self.http.get(
                self.settings.met_norway_forecast_url,
                params={"lat": key[0], "lon": key[1]},
                headers=headers,
            )
        except httpx.RequestError as exc:
            self._record("network_error", started)
            raise PROVIDER_UNAVAILABLE from exc
        self._record(response.status_code, started)
        if response.status_code == 429:
            raise PROVIDER_RATE_LIMITED
        if response.status_code == 304:
            if cached is None:
                raise PROVIDER_UNAVAILABLE
            cached.expires_at = self._expiry(response, datetime.now(UTC))
            self.cache[key] = cached
            self.cache.move_to_end(key)
            return cached.forecast
        if response.status_code not in (200, 203):
            raise PROVIDER_UNAVAILABLE
        if response.status_code == 203:
            logger.warning(json.dumps({"event": "met_norway_deprecated_product"}))
        try:
            forecast = parse_met_forecast(response.json())
        except ValueError as exc:
            raise PROVIDER_UNAVAILABLE from exc
        entry = ForecastCacheEntry(
            forecast=forecast,
            expires_at=self._expiry(response, datetime.now(UTC)),
            last_modified=response.headers.get("last-modified"),
        )
        self.cache[key] = entry
        self.cache.move_to_end(key)
        if len(self.cache) > self.cache_limit:
            self.cache.popitem(last=False)
        return forecast

    @staticmethod
    def _expiry(response: httpx.Response, now: datetime) -> datetime:
        expires = _http_date(response.headers.get("expires"))
        return expires if expires is not None and expires > now else now + timedelta(minutes=5)

    def _record(self, status: int | str, started: float) -> None:
        duration = round((time.monotonic() - started) * 1000, 1)
        if self.metrics:
            self.metrics.record_provider("forecast", status, duration)
        logger.info(
            json.dumps(
                {
                    "event": "provider_request",
                    "kind": "forecast",
                    "provider": "met_norway",
                    "status": status,
                    "duration_ms": duration,
                }
            )
        )


class MetNorwayPilot:
    def __init__(
        self,
        http: httpx.AsyncClient,
        settings: Settings,
        limiter: MetNorwayRateLimiter | None = None,
    ) -> None:
        self.http = http
        self.settings = settings
        self.limiter = limiter if limiter is not None else SHARED_MET_NORWAY_LIMITER

    async def probe(self, place: str, latitude: float, longitude: float) -> bool:
        await self.limiter.wait_turn()
        started = time.monotonic()
        try:
            response = await self.http.get(
                self.settings.met_norway_forecast_url,
                params={"lat": f"{latitude:.4f}", "lon": f"{longitude:.4f}"},
                headers={
                    "User-Agent": self.settings.met_norway_user_agent,
                    "Accept": "application/json",
                },
            )
        except httpx.RequestError:
            logger.warning(
                json.dumps(
                    {
                        "event": "met_norway_pilot",
                        "place": place,
                        "status": "network_error",
                        "duration_ms": round((time.monotonic() - started) * 1000, 1),
                    }
                )
            )
            return False

        result: dict[str, Any] = {
            "event": "met_norway_pilot",
            "place": place,
            "status": response.status_code,
            "duration_ms": round((time.monotonic() - started) * 1000, 1),
            "response_bytes": len(response.content),
            "has_expires": "expires" in response.headers,
            "has_last_modified": "last-modified" in response.headers,
        }
        if response.status_code == 200:
            try:
                payload = response.json()
                entries = payload["properties"]["timeseries"]
                if not isinstance(entries, list) or len(entries) < 24:
                    raise ValueError("incomplete time series")
                times = [datetime.fromisoformat(item["time"]) for item in entries]
                if any(left >= right for left, right in zip(times, times[1:], strict=False)):
                    raise ValueError("unordered time series")
                result["points"] = len(entries)
                result["horizon_hours"] = round((times[-1] - times[0]).total_seconds() / 3600)
                result["has_24_hourly_points"] = all(
                    (right - left).total_seconds() == 3600
                    for left, right in zip(times[:24], times[1:24], strict=False)
                )
                result["has_seven_day_horizon"] = result["horizon_hours"] >= 168
                first_data = entries[0].get("data")
                instant = first_data.get("instant") if isinstance(first_data, dict) else None
                details = instant.get("details") if isinstance(instant, dict) else None
                expected_fields = (
                    "air_temperature",
                    "relative_humidity",
                    "wind_speed",
                    "wind_from_direction",
                )
                result["first_instant_fields"] = [
                    field
                    for field in expected_fields
                    if isinstance(details, dict) and field in details
                ]
            except KeyError, TypeError, ValueError:
                result["shape"] = "invalid"
                logger.warning(json.dumps(result))
                return False
        logger.info(json.dumps(result))
        return response.status_code == 200 and bool(
            result["has_24_hourly_points"] and result["has_seven_day_horizon"]
        )

    async def run(self) -> None:
        if not self.settings.met_norway_user_agent:
            logger.warning(
                json.dumps({"event": "met_norway_pilot_skipped", "reason": "user_agent_missing"})
            )
            return
        for place, latitude, longitude in PILOT_PLACES:
            if not await self.probe(place, latitude, longitude):
                break
