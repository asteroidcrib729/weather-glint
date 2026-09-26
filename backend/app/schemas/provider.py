"""Validate the Open-Meteo boundary before mapping it to our public API."""

from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

FiniteNumber = Annotated[float, Field(allow_inf_nan=False)]
Probability = Annotated[int, Field(ge=0, le=100)]
DayFlag = Annotated[int, Field(ge=0, le=1)]


def _local_times(values: list[str]) -> list[datetime]:
    parsed = [datetime.fromisoformat(value) for value in values]
    if any(value.tzinfo is not None for value in parsed):
        raise ValueError("expected local timestamps without offsets")
    if any(left > right for left, right in zip(parsed, parsed[1:], strict=False)):
        raise ValueError("forecast times must not go backwards")
    return parsed


class ProviderCurrent(BaseModel):
    time: str
    temperature_2m: FiniteNumber
    apparent_temperature: FiniteNumber
    relative_humidity_2m: Probability
    precipitation: FiniteNumber
    wind_speed_10m: FiniteNumber
    wind_direction_10m: Annotated[int, Field(ge=0, le=360)]
    is_day: DayFlag
    weather_code: int

    @field_validator("time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        _local_times([value])
        return value


class ProviderHourly(BaseModel):
    time: list[str]
    temperature_2m: list[FiniteNumber]
    precipitation_probability: list[Probability | None]
    weather_code: list[int]
    is_day: list[DayFlag]

    @model_validator(mode="after")
    def aligned(self) -> ProviderHourly:
        count = len(self.time)
        if count < 24 or any(
            len(values) != count
            for values in (
                self.temperature_2m,
                self.precipitation_probability,
                self.weather_code,
                self.is_day,
            )
        ):
            raise ValueError("hourly arrays must align")
        _local_times(self.time)
        return self


class ProviderDaily(BaseModel):
    time: list[str]
    temperature_2m_max: list[FiniteNumber]
    temperature_2m_min: list[FiniteNumber]
    precipitation_probability_max: list[Probability | None]
    weather_code: list[int]
    sunrise: list[str | None] | None = None
    sunset: list[str | None] | None = None
    uv_index_max: list[Annotated[FiniteNumber, Field(ge=0)] | None] | None = None

    @model_validator(mode="after")
    def aligned(self) -> ProviderDaily:
        count = len(self.time)
        if count != 7 or any(
            len(values) != count
            for values in (
                self.temperature_2m_max,
                self.temperature_2m_min,
                self.precipitation_probability_max,
                self.weather_code,
            )
        ):
            raise ValueError("daily arrays must align")
        if any(
            values is not None and len(values) != count
            for values in (self.sunrise, self.sunset, self.uv_index_max)
        ):
            raise ValueError("optional daily arrays must align")
        days = [date.fromisoformat(value) for value in self.time]
        if any(left >= right for left, right in zip(days, days[1:], strict=False)):
            raise ValueError("forecast days must be increasing")
        for values in (self.sunrise, self.sunset):
            if values is None:
                continue
            for day, value in zip(days, values, strict=True):
                if value is None:
                    continue
                parsed = datetime.fromisoformat(value)
                if parsed.tzinfo is not None or parsed.date() != day:
                    raise ValueError("solar event must be local and match the forecast day")
        return self


class ProviderForecast(BaseModel):
    latitude: Annotated[FiniteNumber, Field(ge=-90, le=90)]
    longitude: Annotated[FiniteNumber, Field(ge=-180, le=180)]
    timezone: Annotated[str, Field(min_length=1, pattern=r"^[A-Za-z_]+(?:/[A-Za-z_+-]+)*$")]
    current: ProviderCurrent
    hourly: ProviderHourly
    daily: ProviderDaily

    @model_validator(mode="after")
    def valid_dst_folds(self) -> ProviderForecast:
        try:
            zone = ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("unknown provider timezone") from exc
        timestamps = _local_times(self.hourly.time)
        for left, right in zip(timestamps, timestamps[1:], strict=False):
            if left != right:
                continue
            first_offset = left.replace(tzinfo=zone, fold=0).utcoffset()
            second_offset = right.replace(tzinfo=zone, fold=1).utcoffset()
            if first_offset is None or second_offset is None or first_offset <= second_offset:
                raise ValueError("repeated hourly timestamp outside a DST fall-back")
        return self
