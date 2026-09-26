"""Opt-in two-call Open-Meteo smoke check; never run in routine CI."""

import asyncio
import sys
import time

import httpx

from backend.app.clients.open_meteo import OpenMeteoClient
from backend.app.core.config import get_settings
from backend.app.services.weather import map_locations, map_weather


async def check() -> None:
    timeout = httpx.Timeout(connect=3.0, read=8.0, write=3.0, pool=3.0)
    async with httpx.AsyncClient(timeout=timeout) as http:
        provider = OpenMeteoClient(http, get_settings())
        started = time.monotonic()
        places = map_locations(await provider.geocode("Karachi", 1))
        geocode_ms = round((time.monotonic() - started) * 1000)
        if not places:
            raise RuntimeError("Geocoding returned no Karachi result")
        # Fixed city coordinates only; no visitor search or device location.
        started = time.monotonic()
        forecast = map_weather(await provider.forecast(24.8608, 67.0104, "metric"), "metric")
        forecast_ms = round((time.monotonic() - started) * 1000)
    if len(forecast.hourly) != 24 or len(forecast.daily) != 7:
        raise RuntimeError("Forecast shape was incomplete")
    solar = forecast.daily[0]
    solar_available = sum(
        value is not None for value in (solar.sunrise, solar.sunset, solar.uv_index_max)
    )
    print(
        f"Open-Meteo live smoke passed: geocoding {geocode_ms} ms; "
        f"forecast {forecast_ms} ms; today's solar fields available {solar_available}/3."
    )


if __name__ == "__main__":
    if sys.argv[1:] != ["--live"]:
        raise SystemExit(
            "Live check is opt-in: uv run python -m backend.scripts.live_provider_smoke --live"
        )
    asyncio.run(check())
