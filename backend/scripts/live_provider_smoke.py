"""Opt-in place-search and MET forecast smoke; never run in routine CI."""

import asyncio
import sys
import time

import httpx

from backend.app.clients.met_norway import MetNorwayClient
from backend.app.clients.open_meteo import OpenMeteoClient
from backend.app.core.config import get_settings
from backend.app.services.met_weather import map_met_weather
from backend.app.services.weather import map_locations


async def check() -> None:
    timeout = httpx.Timeout(connect=3.0, read=8.0, write=3.0, pool=3.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
        geocoder = OpenMeteoClient(http, get_settings())
        provider = MetNorwayClient(http, get_settings())
        started = time.monotonic()
        places = map_locations(await geocoder.geocode("Karachi", 1))
        geocode_ms = round((time.monotonic() - started) * 1000)
        if not places:
            raise RuntimeError("Geocoding returned no Karachi result")
        # Fixed city coordinates only; no visitor search or device location.
        started = time.monotonic()
        forecast = map_met_weather(
            await provider.forecast(24.8608, 67.0104),
            24.8608,
            67.0104,
            "Asia/Karachi",
            "metric",
        )
        forecast_ms = round((time.monotonic() - started) * 1000)
    if len(forecast.hourly) != 24 or len(forecast.daily) != 7:
        raise RuntimeError("Forecast shape was incomplete")
    print(
        f"Live smoke passed: Open-Meteo geocoding {geocode_ms} ms; "
        f"MET Norway forecast {forecast_ms} ms; 24 hourly and seven daily entries."
    )


if __name__ == "__main__":
    if sys.argv[1:] != ["--live"]:
        raise SystemExit(
            "Live check is opt-in: uv run python -m backend.scripts.live_provider_smoke --live"
        )
    asyncio.run(check())
