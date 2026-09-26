export type UnitSystem = "metric" | "imperial";

import type { Location, Weather } from "@/lib/api-types";
export type { Location, Weather } from "@/lib/api-types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return "Too many requests. Please wait a minute, then try again.";
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

async function readApi<T>(url: string, data: object, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data), signal, cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Could not connect to the weather service. Check your connection.", 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message : "The weather service could not complete this request.";
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export function searchLocations(query: string, signal?: AbortSignal): Promise<Location[]> {
  return readApi<Location[]>("/api/v1/locations", { query, limit: 6 }, signal);
}

export function getWeather(location: Location, units: UnitSystem, signal?: AbortSignal): Promise<Weather> {
  return readApi<Weather>("/api/v1/weather", {
    latitude: location.latitude, longitude: location.longitude, units,
  }, signal);
}

// Unit changes are presentation-only: convert the response already on screen instead of
// clearing it and waiting for another provider request. Keep the original response untouched.
export function displayWeatherInUnits(weather: Weather, target: UnitSystem): Weather {
  const source: UnitSystem = weather.units.temperature === "°F" ? "imperial" : "metric";
  if (source === target) return weather;
  const toImperial = target === "imperial";
  const temperature = (value: number) => toImperial ? value * 9 / 5 + 32 : (value - 32) * 5 / 9;
  const wind = (value: number) => toImperial ? value / 1.609344 : value * 1.609344;
  const precipitation = (value: number) => toImperial ? value / 25.4 : value * 25.4;
  return {
    ...weather,
    units: { temperature: toImperial ? "°F" : "°C", wind_speed: toImperial ? "mph" : "km/h", precipitation: toImperial ? "in" : "mm" },
    current: {
      ...weather.current,
      temperature: temperature(weather.current.temperature),
      apparent_temperature: temperature(weather.current.apparent_temperature),
      wind_speed: wind(weather.current.wind_speed),
      precipitation: precipitation(weather.current.precipitation),
    },
    hourly: weather.hourly.map((hour) => ({ ...hour, temperature: temperature(hour.temperature) })),
    daily: weather.daily.map((day) => ({ ...day, temperature_max: temperature(day.temperature_max), temperature_min: temperature(day.temperature_min) })),
  };
}

export function weatherSymbol(code: number, isDay = true): string {
  if (code === 0 || code === 1) return isDay ? "☀" : "☾";
  if (code === 2 || code === 3) return "☁";
  if (code === 45 || code === 48) return "≋";
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return "❄";
  if (code === 95 || code === 96 || code === 99) return "ϟ";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "☂";
  return "?";
}

export function formatClock(localTime: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(`${localTime.slice(0, 16)}:00Z`),
  );
}

export function formatHour(localTime: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(
    new Date(`${localTime.slice(0, 13)}:00:00Z`),
  );
}

export function formatDay(localDate: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${localDate}T12:00:00Z`),
  );
}

export function formatDate(localTime: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${localTime.slice(0, 10)}T12:00:00Z`),
  );
}

export function formatNumber(value: number, locale = "en", maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatTemperature(value: number, units: UnitSystem, locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    style: "unit", unit: units === "imperial" ? "fahrenheit" : "celsius", unitDisplay: "short", maximumFractionDigits: 0,
  }).format(value);
}

export function formatProbability(value: number | null, locale = "en"): string {
  return value === null ? "Not available" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value / 100);
}

export function formatPrecipitation(value: number, units: UnitSystem, locale = "en"): string {
  if (units === "imperial" && value > 0 && value < 0.01) return `<${formatNumber(0.01, locale, 2)}`;
  return formatNumber(units === "imperial" ? Math.round(value * 100) / 100 : value, locale, units === "imperial" ? 2 : 1);
}

export function formatGeneratedAt(utcTime: string, timeZone: string, locale = "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short",
    }).format(new Date(utcTime));
  } catch {
    return "time unavailable";
  }
}

export function savedLocations(value: unknown): Location[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Location =>
    typeof item === "object" && item !== null &&
    Number.isSafeInteger(item.id) && item.id > 0 &&
    typeof item.name === "string" && item.name.length > 0 &&
    typeof item.country === "string" &&
    typeof item.latitude === "number" && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90 &&
    typeof item.longitude === "number" && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180,
  ).slice(0, 5);
}
