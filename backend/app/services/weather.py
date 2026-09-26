from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from backend.app.core.errors import PROVIDER_UNAVAILABLE
from backend.app.schemas.provider import ProviderForecast
from backend.app.schemas.weather import (
    Coordinates,
    CurrentWeather,
    DailyWeather,
    HourlyWeather,
    Location,
    WeatherResponse,
    WeatherUnits,
)


def condition_for(code: int) -> str:
    conditions = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Dense drizzle",
        56: "Freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        66: "Freezing rain",
        67: "Heavy freezing rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        77: "Snow grains",
        80: "Light rain showers",
        81: "Rain showers",
        82: "Heavy rain showers",
        85: "Snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Severe thunderstorm with hail",
    }
    return conditions.get(code, "Unknown conditions")


def map_locations(payload: dict[str, Any]) -> list[Location]:
    try:
        results = payload.get("results", [])
        if not isinstance(results, list):
            raise TypeError("results is not a list")
        return [Location.model_validate(item) for item in results]
    except (TypeError, ValidationError) as exc:
        raise PROVIDER_UNAVAILABLE from exc


def map_weather(payload: dict[str, Any], units: str) -> WeatherResponse:
    try:
        forecast = ProviderForecast.model_validate(payload)
        current = forecast.current
        hourly = forecast.hourly
        daily = forecast.daily
        start = datetime.fromisoformat(current.time).replace(minute=0, second=0, microsecond=0)
        hour_indices = [
            i for i, value in enumerate(hourly.time) if datetime.fromisoformat(value) >= start
        ][:24]
        if len(hour_indices) != 24:
            raise ValueError("expected 24 forecast hours")

        current_code = current.weather_code
        return WeatherResponse(
            location=Coordinates(latitude=forecast.latitude, longitude=forecast.longitude),
            timezone=forecast.timezone,
            generated_at=datetime.now(UTC),
            units=WeatherUnits(
                temperature="°F" if units == "imperial" else "°C",
                wind_speed="mph" if units == "imperial" else "km/h",
                precipitation="in" if units == "imperial" else "mm",
            ),
            current=CurrentWeather(
                time=current.time,
                temperature=current.temperature_2m,
                apparent_temperature=current.apparent_temperature,
                humidity_percent=current.relative_humidity_2m,
                precipitation=current.precipitation,
                wind_speed=current.wind_speed_10m,
                wind_direction_degrees=current.wind_direction_10m,
                is_day=bool(current.is_day),
                weather_code=current_code,
                condition=condition_for(current_code),
            ),
            hourly=[
                HourlyWeather(
                    time=hourly.time[i],
                    temperature=hourly.temperature_2m[i],
                    precipitation_probability_percent=hourly.precipitation_probability[i],
                    is_day=bool(hourly.is_day[i]),
                    weather_code=hourly.weather_code[i],
                    condition=condition_for(hourly.weather_code[i]),
                )
                for i in hour_indices
            ],
            daily=[
                DailyWeather(
                    date=daily.time[i],
                    temperature_max=daily.temperature_2m_max[i],
                    temperature_min=daily.temperature_2m_min[i],
                    precipitation_probability_max_percent=daily.precipitation_probability_max[i],
                    weather_code=daily.weather_code[i],
                    condition=condition_for(daily.weather_code[i]),
                    sunrise=daily.sunrise[i] if daily.sunrise is not None else None,
                    sunset=daily.sunset[i] if daily.sunset is not None else None,
                    uv_index_max=daily.uv_index_max[i] if daily.uv_index_max is not None else None,
                )
                for i in range(7)
            ],
        )
    except (KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
        raise PROVIDER_UNAVAILABLE from exc
