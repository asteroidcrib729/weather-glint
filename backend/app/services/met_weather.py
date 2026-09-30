"""Validate MET Norway Locationforecast data and adapt it to the public API."""

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from backend.app.core.errors import PROVIDER_UNAVAILABLE
from backend.app.schemas.weather import (
    Coordinates,
    CurrentWeather,
    DailyWeather,
    HourlyWeather,
    WeatherResponse,
    WeatherUnits,
)
from backend.app.services.weather import condition_for


@dataclass(frozen=True)
class MetPoint:
    time: datetime
    temperature: float
    humidity: int
    wind_kmh: float
    wind_direction: int
    data: dict[str, Any]


@dataclass(frozen=True)
class MetForecast:
    points: list[MetPoint]
    fetched_at: datetime


def _number(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("missing numeric MET field")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("non-finite MET field")
    return result


def parse_met_forecast(payload: Any, fetched_at: datetime | None = None) -> MetForecast:
    try:
        properties = payload["properties"]
        units = properties["meta"]["units"]
        if (
            units["air_temperature"] != "celsius"
            or units["wind_speed"] != "m/s"
            or units["precipitation_amount"] != "mm"
        ):
            raise ValueError("unexpected MET units")
        entries = properties["timeseries"]
        if not isinstance(entries, list) or len(entries) < 25:
            raise ValueError("insufficient MET forecast")
        points: list[MetPoint] = []
        for entry in entries:
            instant = entry["data"]["instant"]["details"]
            time = datetime.fromisoformat(entry["time"].replace("Z", "+00:00"))
            if time.tzinfo is None:
                raise ValueError("MET time lacks UTC offset")
            points.append(
                MetPoint(
                    time=time.astimezone(UTC),
                    temperature=_number(instant["air_temperature"]),
                    humidity=round(_number(instant["relative_humidity"])),
                    wind_kmh=_number(instant["wind_speed"]) * 3.6,
                    wind_direction=round(_number(instant["wind_from_direction"])) % 360,
                    data=entry["data"],
                )
            )
        if any(left.time >= right.time for left, right in zip(points, points[1:], strict=False)):
            raise ValueError("MET times are not increasing")
        if any(
            right.time - left.time != timedelta(hours=1)
            for left, right in zip(points[:24], points[1:24], strict=False)
        ):
            raise ValueError("MET short range lacks 24 hourly points")
        if points[-1].time - points[0].time < timedelta(days=7):
            raise ValueError("MET horizon is shorter than seven days")
        return MetForecast(points, fetched_at or datetime.now(UTC))
    except (KeyError, IndexError, TypeError, ValueError, OverflowError) as exc:
        raise PROVIDER_UNAVAILABLE from exc


def _period(point: MetPoint, name: str) -> dict[str, Any]:
    value = point.data.get(name)
    return value if isinstance(value, dict) else {}


def _symbol(point: MetPoint) -> str:
    for period in ("next_1_hours", "next_6_hours", "next_12_hours"):
        summary = _period(point, period).get("summary")
        if isinstance(summary, dict) and isinstance(summary.get("symbol_code"), str):
            return str(summary["symbol_code"])
    return ""


def _code(symbol: str) -> int:
    base = symbol.removesuffix("_day").removesuffix("_night").removesuffix("_polartwilight")
    if base == "clearsky":
        return 0
    if base == "fair":
        return 1
    if base == "partlycloudy":
        return 2
    if base == "cloudy":
        return 3
    if base == "fog":
        return 45
    if "thunder" in base:
        return 95
    if "snow" in base:
        return 85 if "showers" in base else 73
    if "sleet" in base:
        return 67
    if "rain" in base:
        if "showers" in base:
            return 80
        return 65 if "heavy" in base else 61 if "light" in base else 63
    return -1


def _day(symbol: str, local_time: datetime) -> bool:
    if symbol.endswith("_day"):
        return True
    if symbol.endswith(("_night", "_polartwilight")):
        return False
    return 6 <= local_time.hour < 18


def _probability(point: MetPoint) -> int | None:
    details = _period(point, "next_1_hours").get("details")
    if not isinstance(details, dict) or "probability_of_precipitation" not in details:
        return None
    value = _number(details["probability_of_precipitation"])
    return round(value) if 0 <= value <= 100 else None


def _local(time: datetime, zone: ZoneInfo) -> str:
    return time.astimezone(zone).replace(tzinfo=None).isoformat(timespec="minutes")


def map_met_weather(
    forecast: MetForecast,
    latitude: float,
    longitude: float,
    timezone: str,
    units: str,
    *,
    now: datetime | None = None,
) -> WeatherResponse:
    try:
        zone = ZoneInfo(timezone)
        response_time = now or datetime.now(UTC)
        current_hour = response_time.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
        points = [point for point in forecast.points if point.time >= current_hour]
        if (
            not points
            or points[0].time != current_hour
            or len(points) < 24
            or points[-1].time - points[0].time < timedelta(days=7)
        ):
            raise ValueError("MET forecast has no current seven-day horizon")
        first = points[0]
        current_symbol = _symbol(first)
        period_details = _period(first, "next_1_hours").get("details")
        next_hour_precipitation = (
            _number(period_details["precipitation_amount"])
            if isinstance(period_details, dict) and "precipitation_amount" in period_details
            else None
        )
        hourly = []
        for point in points[:24]:
            symbol = _symbol(point)
            code = _code(symbol)
            local_time = point.time.astimezone(zone)
            hourly.append(
                HourlyWeather(
                    time=_local(point.time, zone),
                    temperature=point.temperature,
                    precipitation_probability_percent=_probability(point),
                    is_day=_day(symbol, local_time),
                    weather_code=code,
                    condition=condition_for(code),
                )
            )

        first_date = first.time.astimezone(zone).date()
        daily = []
        for offset in range(7):
            local_date: date = first_date + timedelta(days=offset)
            day_points = [
                point for point in points if point.time.astimezone(zone).date() == local_date
            ]
            if not day_points:
                raise ValueError("missing local forecast day")
            temperatures = [point.temperature for point in day_points]
            for point in day_points:
                details = _period(point, "next_6_hours").get("details")
                period_end = (point.time + timedelta(hours=6)).astimezone(zone).date()
                if not isinstance(details, dict) or period_end != local_date:
                    continue
                for name in ("air_temperature_max", "air_temperature_min"):
                    if name in details:
                        temperatures.append(_number(details[name]))
            display_point = min(
                day_points, key=lambda point: abs(point.time.astimezone(zone).hour - 12)
            )
            code = _code(_symbol(display_point))
            daily.append(
                DailyWeather(
                    date=local_date.isoformat(),
                    temperature_max=max(temperatures),
                    temperature_min=min(temperatures),
                    precipitation_probability_max_percent=None,
                    weather_code=code,
                    condition=condition_for(code),
                    sunrise=None,
                    sunset=None,
                    uv_index_max=None,
                )
            )

        result = WeatherResponse(
            location=Coordinates(latitude=latitude, longitude=longitude),
            timezone=timezone,
            generated_at=response_time,
            units=WeatherUnits(
                temperature="°F" if units == "imperial" else "°C",
                wind_speed="mph" if units == "imperial" else "km/h",
                precipitation="in" if units == "imperial" else "mm",
            ),
            current=CurrentWeather(
                time=_local(first.time, zone),
                temperature=first.temperature,
                apparent_temperature=None,
                humidity_percent=first.humidity,
                precipitation=next_hour_precipitation,
                wind_speed=first.wind_kmh,
                wind_direction_degrees=first.wind_direction,
                is_day=_day(current_symbol, first.time.astimezone(zone)),
                weather_code=_code(current_symbol),
                condition=condition_for(_code(current_symbol)),
            ),
            hourly=hourly,
            daily=daily,
            source="MET Norway",
            attribution_url="https://api.met.no/doc/License",
        )
        if units == "imperial":

            def convert_temperature(value: float) -> float:
                return value * 9 / 5 + 32

            result.current.temperature = convert_temperature(result.current.temperature)
            result.current.wind_speed /= 1.609344
            if result.current.precipitation is not None:
                result.current.precipitation /= 25.4
            for hour in result.hourly:
                hour.temperature = convert_temperature(hour.temperature)
            for day in result.daily:
                day.temperature_max = convert_temperature(day.temperature_max)
                day.temperature_min = convert_temperature(day.temperature_min)
        return result
    except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError) as exc:
        raise PROVIDER_UNAVAILABLE from exc
