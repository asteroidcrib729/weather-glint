from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Location(BaseModel):
    id: int = Field(gt=0)
    name: str = Field(min_length=1)
    admin1: str | None = None
    country: str
    country_code: str | None = None
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    timezone: str | None = None


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class CurrentWeather(BaseModel):
    time: str
    temperature: float
    apparent_temperature: float | None
    humidity_percent: int
    precipitation: float | None
    wind_speed: float
    wind_direction_degrees: int
    is_day: bool
    weather_code: int
    condition: str


class HourlyWeather(BaseModel):
    time: str
    temperature: float
    precipitation_probability_percent: int | None
    is_day: bool
    weather_code: int
    condition: str


class DailyWeather(BaseModel):
    date: str
    temperature_max: float
    temperature_min: float
    precipitation_probability_max_percent: int | None
    weather_code: int
    condition: str
    sunrise: str | None = None
    sunset: str | None = None
    uv_index_max: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class WeatherUnits(BaseModel):
    temperature: Literal["°C", "°F"]
    wind_speed: Literal["km/h", "mph"]
    precipitation: Literal["mm", "in"]


class WeatherResponse(BaseModel):
    location: Coordinates
    timezone: str
    generated_at: datetime
    units: WeatherUnits
    current: CurrentWeather
    hourly: list[HourlyWeather] = Field(min_length=1, max_length=24)
    daily: list[DailyWeather] = Field(min_length=7, max_length=7)
    source: str = "MET Norway"
    attribution_url: str = "https://api.met.no/doc/License"


class ErrorResponse(BaseModel):
    error: str
    message: str
