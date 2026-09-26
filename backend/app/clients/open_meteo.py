import asyncio
import json
import logging
import random
import time
from collections import OrderedDict, deque
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from pydantic import ValidationError

from backend.app.core.config import Settings
from backend.app.core.errors import PROVIDER_RATE_LIMITED, PROVIDER_UNAVAILABLE, ProviderError
from backend.app.core.metrics import OperationalMetrics
from backend.app.schemas.provider import ProviderForecast
from backend.app.services.weather import map_locations

logger = logging.getLogger("uvicorn.error")


class ProviderQuota:
    """Conservative per-process call budget; every retry consumes a slot."""

    def __init__(self, limits: tuple[int, int, int] = (450, 3750, 7500)) -> None:
        self.windows: tuple[tuple[float, int, deque[float]], ...] = (
            (60, limits[0], deque()),
            (3600, limits[1], deque()),
            (86400, limits[2], deque()),
        )

    def allow(self, now: float) -> bool:
        for period, _limit, entries in self.windows:
            while entries and now - entries[0] >= period:
                entries.popleft()
        if any(len(entries) >= limit for _period, limit, entries in self.windows):
            return False
        for _period, _limit, entries in self.windows:
            entries.append(now)
        return True


class OpenMeteoClient:
    def __init__(
        self, http: httpx.AsyncClient, settings: Settings, metrics: OperationalMetrics | None = None
    ) -> None:
        self.http = http
        self.settings = settings
        self.cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
        self.cache_limit = 256
        self.inflight: dict[str, asyncio.Task[dict[str, Any]]] = {}
        self.metrics = metrics
        self.quota = ProviderQuota()

    def prune_expired(self, now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        for key, (expires_at, _) in list(self.cache.items()):
            if expires_at <= current:
                del self.cache[key]

    async def geocode(self, query: str, limit: int) -> dict[str, Any]:
        return await self._fetch(
            self.settings.open_meteo_geocoding_url,
            {"name": query, "count": limit, "language": "en", "format": "json"},
            ttl=24 * 60 * 60,
            kind="geocode",
        )

    async def forecast(self, latitude: float, longitude: float, units: str) -> dict[str, Any]:
        return await self._fetch(
            self.settings.open_meteo_forecast_url,
            {
                "latitude": latitude,
                "longitude": longitude,
                "timezone": "auto",
                "forecast_days": 7,
                "current": (
                    "temperature_2m,apparent_temperature,relative_humidity_2m,"
                    "precipitation,wind_speed_10m,wind_direction_10m,is_day,weather_code"
                ),
                "hourly": "temperature_2m,precipitation_probability,weather_code,is_day",
                "daily": (
                    "weather_code,temperature_2m_max,temperature_2m_min,"
                    "precipitation_probability_max,sunrise,sunset,uv_index_max"
                ),
                "temperature_unit": "fahrenheit" if units == "imperial" else "celsius",
                "wind_speed_unit": "mph" if units == "imperial" else "kmh",
                "precipitation_unit": "inch" if units == "imperial" else "mm",
            },
            ttl=5 * 60,
            kind="forecast",
        )

    async def _fetch(
        self, url: str, params: dict[str, str | int | float], ttl: int, kind: str
    ) -> dict[str, Any]:
        key = json.dumps([url, params], sort_keys=True)
        now = time.monotonic()
        self.prune_expired(now)
        cached = self.cache.get(key)
        if cached is not None and cached[0] > now:
            self.cache.move_to_end(key)
            if self.metrics:
                self.metrics.record_cache(kind, True)
            logger.info(json.dumps({"event": "provider_cache_hit", "kind": kind}))
            return cached[1]

        if self.metrics:
            self.metrics.record_cache(kind, False)

        task = self.inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._fetch_uncached(url, params, ttl, kind, key))
            self.inflight[key] = task
            task.add_done_callback(lambda done: self._clear_inflight(key, done))
        return await asyncio.shield(task)

    def _clear_inflight(self, key: str, task: asyncio.Task[dict[str, Any]]) -> None:
        if self.inflight.get(key) is task:
            del self.inflight[key]
        if not task.cancelled():
            task.exception()  # Consume an error if every waiting request was cancelled.

    async def _fetch_uncached(
        self, url: str, params: dict[str, str | int | float], ttl: int, kind: str, key: str
    ) -> dict[str, Any]:

        for attempt in range(3):
            if not self.quota.allow(time.monotonic()):
                if self.metrics:
                    self.metrics.record_provider(kind, "local_quota", 0)
                logger.warning(json.dumps({"event": "provider_local_quota", "kind": kind}))
                raise PROVIDER_RATE_LIMITED
            started = time.monotonic()
            try:
                response = await self.http.get(url, params=params)
            except httpx.RequestError as exc:
                duration_ms = round((time.monotonic() - started) * 1000, 1)
                if self.metrics:
                    self.metrics.record_provider(kind, "network_error", duration_ms)
                logger.info(
                    json.dumps(
                        {
                            "event": "provider_request",
                            "kind": kind,
                            "status": "network_error",
                            "duration_ms": duration_ms,
                        }
                    )
                )
                if attempt == 2:
                    raise PROVIDER_UNAVAILABLE from exc
                await asyncio.sleep(0.2 * 2**attempt + random.uniform(0, 0.1))
                continue

            duration_ms = round((time.monotonic() - started) * 1000, 1)
            if self.metrics:
                self.metrics.record_provider(kind, response.status_code, duration_ms)
            logger.info(
                json.dumps(
                    {
                        "event": "provider_request",
                        "kind": kind,
                        "status": response.status_code,
                        "duration_ms": duration_ms,
                    }
                )
            )

            if response.status_code == 429 or 500 <= response.status_code <= 599:
                if attempt == 2:
                    error = (
                        PROVIDER_RATE_LIMITED
                        if response.status_code == 429
                        else PROVIDER_UNAVAILABLE
                    )
                    raise error
                delay = _retry_after(response.headers.get("retry-after"))
                if delay is not None and delay > 2:
                    error = (
                        PROVIDER_RATE_LIMITED
                        if response.status_code == 429
                        else PROVIDER_UNAVAILABLE
                    )
                    raise error
                await asyncio.sleep(
                    delay if delay is not None else 0.2 * 2**attempt + random.uniform(0, 0.1)
                )
                continue

            if response.is_error:
                raise PROVIDER_UNAVAILABLE

            try:
                payload = response.json()
            except ValueError as exc:
                raise PROVIDER_UNAVAILABLE from exc
            if not isinstance(payload, dict) or payload.get("error"):
                raise PROVIDER_UNAVAILABLE
            try:
                if kind == "forecast":
                    ProviderForecast.model_validate(payload)
                else:
                    map_locations(payload)
            except (ValidationError, ValueError, TypeError) as exc:
                raise PROVIDER_UNAVAILABLE from exc
            self.cache[key] = (time.monotonic() + ttl, payload)
            self.cache.move_to_end(key)
            if len(self.cache) > self.cache_limit:
                self.cache.popitem(last=False)
            return payload
        raise ProviderError("provider_unavailable", "Weather service is temporarily unavailable.")


def _retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            delay = (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds()
            return max(0.0, delay)
        except TypeError, ValueError, OverflowError:
            return None
