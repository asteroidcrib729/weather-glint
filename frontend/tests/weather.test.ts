import { describe, expect, it, vi } from "vitest";
import { ApiError, formatClock, formatDate, formatDay, formatGeneratedAt, formatHour, formatNumber, formatPrecipitation, formatProbability, formatTemperature, getWeather, savedLocations, searchLocations, weatherSymbol } from "@/lib/weather";

describe("location-local weather formatting", () => {
  it("uses the provider's local timestamp without applying the browser time zone", () => {
    expect(formatClock("2026-09-23T00:15")).toBe("12:15 AM");
    expect(formatHour("2026-09-23T15:00")).toBe("3 PM");
    expect(formatDay("2026-09-23")).toBe("Wed");
    expect(formatDate("2026-09-23T15:00")).toBe("Wednesday, September 23");
  });

  it("maps weather codes to visible symbols", () => {
    expect(weatherSymbol(0, true)).toBe("☀");
    expect(weatherSymbol(0, false)).toBe("☾");
    expect(weatherSymbol(75)).toBe("❄");
    expect(weatherSymbol(999)).toBe("?");
  });

  it("formats missing precipitation without a percent sign", () => {
    expect(formatProbability(null)).toBe("Not available");
    expect(formatProbability(0)).toBe("0%");
    expect(formatPrecipitation(0.1 / 25.4, "imperial")).toBe("<0.01");
  });

  it("formats response generation in the selected location's time zone", () => {
    expect(formatGeneratedAt("2026-09-23T23:30:00Z", "Asia/Karachi")).toContain("4:30");
    expect(formatGeneratedAt("2026-09-23T23:30:00Z", "Europe/London")).toContain("12:30");
    const beforeFallback = formatGeneratedAt("2026-10-25T00:30:00Z", "Europe/London");
    const afterFallback = formatGeneratedAt("2026-10-25T01:30:00Z", "Europe/London");
    expect(beforeFallback).toContain("1:30");
    expect(afterFallback).toContain("1:30");
    expect(beforeFallback).not.toBe(afterFallback);
  });

  it("localizes wall-clock dates and numbers without moving the provider's local hour", () => {
    expect(formatClock("2026-09-23T15:30", "de-DE")).toBe("15:30");
    expect(formatDate("2026-09-23", "de-DE")).toContain("September");
    expect(formatNumber(1234.5, "de-DE", 1)).toContain("1.234,5");
    expect(formatTemperature(97, "imperial", "en")).toBe("97°F");
    expect(formatTemperature(36, "metric", "en")).toBe("36°C");
    expect(formatProbability(20, "de-DE")).toContain("20");
  });

  it("removes saved geolocation and malformed recent places", () => {
    const city = { id: 10, name: "London", country: "UK", latitude: 51.5, longitude: -0.1 };
    expect(savedLocations([{ ...city, id: -1 }, city, { ...city, latitude: Infinity }])).toEqual([city]);
    expect(savedLocations({ id: 1 })).toEqual([]);
  });
});

describe("API client", () => {
  it("sends place searches in a JSON body without a query URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchLocations("New York, US")).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/locations");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ query: "New York, US", limit: 6 }) });
    vi.unstubAllGlobals();
  });

  it("surfaces a rate-limit response and sends coordinates in a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ message: "Try later" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(getWeather({ id: 1, name: "Test", country: "", latitude: 24.86, longitude: 67.01 }, "metric")).rejects.toEqual(new ApiError("Try later", 429));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/weather");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ latitude: 24.86, longitude: 67.01, units: "metric" }) });
    vi.unstubAllGlobals();
  });
});
