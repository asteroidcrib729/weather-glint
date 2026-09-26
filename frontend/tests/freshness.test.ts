import { expect, test } from "vitest";
import { FRESHNESS_WINDOWS_MS, forecastFreshness, formatForecastAge } from "@/lib/freshness";
import type { Weather } from "@/lib/weather";

const received = Date.parse("2026-09-24T12:00:00Z");
const weather = { generated_at: "2026-09-24T12:00:00Z" } as Weather;

test("current, hourly, and daily age windows are independent", () => {
  expect(forecastFreshness(weather, received).stale).toBe(false);
  const current = forecastFreshness(weather, received + FRESHNESS_WINDOWS_MS.current);
  expect([current.currentStale, current.hourlyStale, current.dailyStale]).toEqual([true, false, false]);
  const hourly = forecastFreshness(weather, received + FRESHNESS_WINDOWS_MS.hourly);
  expect([hourly.currentStale, hourly.hourlyStale, hourly.dailyStale]).toEqual([true, true, false]);
  expect(forecastFreshness(weather, received + FRESHNESS_WINDOWS_MS.daily).dailyStale).toBe(true);
});

test("failure, unknown age, and clock skew cannot masquerade as fresh", () => {
  expect(forecastFreshness(weather, received, true).stale).toBe(true);
  expect(forecastFreshness({ generated_at: "invalid" } as Weather, received).stale).toBe(true);
  expect(forecastFreshness(weather, received - 120_000).stale).toBe(true);
  expect(formatForecastAge(0)).toBe("less than a minute old");
  expect(formatForecastAge(61)).toBe("1 hour old");
});
