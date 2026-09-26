import type { Weather } from "@/lib/weather";

// These are display-age budgets, not a guarantee of observation accuracy. The
// upstream forecast may already be up to five minutes old when served from cache.
export const FRESHNESS_WINDOWS_MS = {
  current: 15 * 60_000,
  hourly: 2 * 60 * 60_000,
  daily: 6 * 60 * 60_000,
} as const;

export type ForecastFreshness = {
  ageMinutes: number | null;
  currentStale: boolean;
  hourlyStale: boolean;
  dailyStale: boolean;
  stale: boolean;
};

export function forecastFreshness(weather: Weather, now: number, refreshFailed = false): ForecastFreshness {
  const received = Date.parse(weather.generated_at);
  const ageMs = Number.isFinite(received) && received <= now + 60_000 ? Math.max(0, now - received) : null;
  const currentStale = refreshFailed || ageMs === null || ageMs >= FRESHNESS_WINDOWS_MS.current;
  const hourlyStale = refreshFailed || ageMs === null || ageMs >= FRESHNESS_WINDOWS_MS.hourly;
  const dailyStale = refreshFailed || ageMs === null || ageMs >= FRESHNESS_WINDOWS_MS.daily;
  return {
    ageMinutes: ageMs === null ? null : Math.floor(ageMs / 60_000),
    currentStale, hourlyStale, dailyStale,
    stale: currentStale || hourlyStale || dailyStale,
  };
}

export function formatForecastAge(minutes: number | null): string {
  if (minutes === null) return "age unavailable";
  if (minutes < 1) return "less than a minute old";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} old`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} old`;
}
