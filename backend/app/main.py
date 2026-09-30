import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, suppress
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from backend.app.clients.met_norway import MetNorwayClient, MetNorwayPilot
from backend.app.clients.open_meteo import OpenMeteoClient
from backend.app.core.client_ip import rate_limit_client_key
from backend.app.core.config import get_settings
from backend.app.core.errors import ProviderError
from backend.app.core.metrics import OperationalMetrics
from backend.app.schemas.weather import ErrorResponse, Location, WeatherResponse
from backend.app.services.met_weather import map_met_weather
from backend.app.services.weather import map_locations

settings = get_settings()
logger = logging.getLogger("uvicorn.error")


async def _run_met_norway_pilot() -> None:
    timeout = httpx.Timeout(connect=3.0, read=8.0, write=3.0, pool=3.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
        await MetNorwayPilot(http, settings).run()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    timeout = httpx.Timeout(connect=3.0, read=6.0, write=3.0, pool=3.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
        app.state.metrics = OperationalMetrics()
        app.state.geocoder = OpenMeteoClient(http, settings, app.state.metrics)
        app.state.weather_provider = MetNorwayClient(http, settings, app.state.metrics)
        cleanup = asyncio.create_task(
            _prune_periodically(app.state.geocoder, app.state.weather_provider, app.state.metrics)
        )
        pilot = (
            asyncio.create_task(_run_met_norway_pilot())
            if settings.met_norway_pilot_on_startup
            else None
        )
        try:
            yield
        finally:
            cleanup.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup
            if pilot is not None:
                pilot.cancel()
                with suppress(asyncio.CancelledError):
                    await pilot


app = FastAPI(
    title="Weather Glint API",
    version="1.0.0",
    description="Current conditions and a seven-day forecast from MET Norway.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_request_counts: dict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))


def _prune_rate_limits(now: float) -> None:
    for ip, (started, _) in list(_request_counts.items()):
        if now - started >= 60:
            del _request_counts[ip]


async def _prune_periodically(
    geocoder: OpenMeteoClient,
    weather_provider: MetNorwayClient,
    metrics: OperationalMetrics,
) -> None:
    while True:
        await asyncio.sleep(60)
        now = time.monotonic()
        _prune_rate_limits(now)
        geocoder.prune_expired(now)
        weather_provider.prune_expired(now)
        logger.info(json.dumps(metrics.drain(len(_request_counts))))


@app.middleware("http")
async def request_policy(request: Request, call_next: RequestResponseEndpoint) -> Response:
    request_id = str(uuid.uuid4())
    started = time.monotonic()
    blocked_response: Response | None = None
    if request.url.path.startswith("/api/") and request.url.path != "/api/v1/health":
        client_key = rate_limit_client_key(request)
        window_start, count = _request_counts[client_key]
        now = time.monotonic()
        if len(_request_counts) > 5000:
            _prune_rate_limits(now)
            while len(_request_counts) > 5000:
                _request_counts.pop(next(iter(_request_counts)))
        if now - window_start >= 60:
            window_start, count = now, 0
        count += 1
        _request_counts[client_key] = (window_start, count)
        if count > settings.rate_limit_per_minute:
            blocked_response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limited",
                    "message": "Too many requests. Try again shortly.",
                },
                headers={"Retry-After": "60"},
            )
    response = blocked_response if blocked_response is not None else await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        duration_ms = round((time.monotonic() - started) * 1000, 1)
        request.app.state.metrics.record_api(request.url.path, response.status_code, duration_ms)
        logger.info(
            json.dumps(
                {
                    "event": "api_request",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path
                    if request.url.path
                    in {"/api/v1/health", "/api/v1/locations", "/api/v1/weather"}
                    else "other",
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                }
            )
        )
    return response


@app.exception_handler(ProviderError)
async def provider_error_handler(_request: Request, exc: ProviderError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code, content={"error": exc.code, "message": exc.message}
    )


def get_provider(request: Request) -> OpenMeteoClient:
    return request.app.state.geocoder  # type: ignore[no-any-return]


def get_weather_provider(request: Request) -> MetNorwayClient:
    return request.app.state.weather_provider  # type: ignore[no-any-return]


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/api/v1/locations",
    response_model=list[Location],
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def locations(
    query: Annotated[str, Query(min_length=2, max_length=100, examples=["Karachi"])],
    provider: Annotated[OpenMeteoClient, Depends(get_provider)],
    limit: Annotated[int, Query(ge=1, le=10, examples=[5])] = 5,
) -> list[Location]:
    return await _locations(query, limit, provider)


class LocationRequest(BaseModel):
    query: str = Field(min_length=2, max_length=100)
    limit: int = Field(default=5, ge=1, le=10)


@app.post(
    "/api/v1/locations",
    response_model=list[Location],
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def locations_post(
    request: LocationRequest, provider: Annotated[OpenMeteoClient, Depends(get_provider)]
) -> list[Location]:
    return await _locations(request.query, request.limit, provider)


async def _locations(query: str, limit: int, provider: OpenMeteoClient) -> list[Location]:
    normalized = query.strip()
    if len(normalized) < 2:
        raise HTTPException(status_code=422, detail="Search query must contain two characters.")
    payload = await provider.geocode(normalized, limit)
    return map_locations(payload)


@app.get(
    "/api/v1/weather",
    response_model=WeatherResponse,
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def weather(
    latitude: Annotated[float, Query(ge=-90, le=90, examples=[24.8608])],
    longitude: Annotated[float, Query(ge=-180, le=180, examples=[67.0104])],
    provider: Annotated[MetNorwayClient, Depends(get_weather_provider)],
    timezone: Annotated[str, Query(min_length=1, max_length=100)] = "UTC",
    units: Literal["metric", "imperial"] = "metric",
) -> WeatherResponse:
    return await _weather(latitude, longitude, units, timezone, provider)


class WeatherRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    timezone: str = Field(default="UTC", min_length=1, max_length=100)
    units: Literal["metric", "imperial"] = "metric"


@app.post(
    "/api/v1/weather",
    response_model=WeatherResponse,
    responses={502: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def weather_post(
    request: WeatherRequest, provider: Annotated[MetNorwayClient, Depends(get_weather_provider)]
) -> WeatherResponse:
    return await _weather(
        request.latitude, request.longitude, request.units, request.timezone, provider
    )


async def _weather(
    latitude: float,
    longitude: float,
    units: Literal["metric", "imperial"],
    timezone: str,
    provider: MetNorwayClient,
) -> WeatherResponse:
    try:
        ZoneInfo(timezone)
    except (ValueError, ZoneInfoNotFoundError) as exc:
        raise HTTPException(status_code=422, detail="Unknown time zone.") from exc
    forecast = await provider.forecast(latitude, longitude)
    return map_met_weather(forecast, latitude, longitude, timezone, units)
