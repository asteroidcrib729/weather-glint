import { describe, expect, it } from "vitest";
import {
  RECENT_RETENTION_MS,
  THEME_RETENTION_MS,
  UNITS_RETENTION_MS,
  restoreRecentLocations,
  restoreThemePreference,
  restoreUnitPreference,
} from "@/lib/browser-storage";

const city = {
  id: 10,
  name: "London",
  country: "UK",
  latitude: 51.5,
  longitude: -0.1,
};
const now = Date.UTC(2026, 8, 23);

describe("browser-storage retention", () => {
  it("keeps recent places younger than 30 days and removes entries at the boundary", () => {
    expect(
      restoreRecentLocations(
        [
          { location: city, savedAt: now - RECENT_RETENTION_MS + 1 },
          { location: { ...city, id: 11 }, savedAt: now - RECENT_RETENTION_MS },
          { location: { ...city, id: 12 }, savedAt: now + 1 },
        ],
        now,
      ),
    ).toEqual([{ location: city, savedAt: now - RECENT_RETENTION_MS + 1 }]);
  });

  it("migrates old places once and still rejects malformed or device locations", () => {
    expect(
      restoreRecentLocations(
        [{ ...city, id: -1 }, city, { ...city, latitude: 1000 }],
        now,
      ),
    ).toEqual([{ location: city, savedAt: now }]);
    expect(restoreRecentLocations({ location: city }, now)).toEqual([]);
  });

  it("expires a unit preference after 180 days and migrates old strings", () => {
    expect(restoreUnitPreference("imperial", now)).toEqual({
      value: "imperial",
      savedAt: now,
    });
    expect(
      restoreUnitPreference(
        JSON.stringify({
          value: "imperial",
          savedAt: now - UNITS_RETENTION_MS + 1,
        }),
        now,
      ),
    ).toEqual({ value: "imperial", savedAt: now - UNITS_RETENTION_MS + 1 });
    expect(
      restoreUnitPreference(
        JSON.stringify({
          value: "imperial",
          savedAt: now - UNITS_RETENTION_MS,
        }),
        now,
      ),
    ).toBeNull();
    expect(
      restoreUnitPreference(
        JSON.stringify({ value: "metric", savedAt: now + 1 }),
        now,
      ),
    ).toBeNull();
    expect(restoreUnitPreference("not-json", now)).toBeNull();
  });

  it("keeps only valid explicit themes within the 180-day window", () => {
    expect(
      restoreThemePreference(
        JSON.stringify({
          value: "dark",
          savedAt: now - THEME_RETENTION_MS + 1,
        }),
        now,
      ),
    ).toEqual({ value: "dark", savedAt: now - THEME_RETENTION_MS + 1 });
    expect(
      restoreThemePreference(
        JSON.stringify({ value: "light", savedAt: now - THEME_RETENTION_MS }),
        now,
      ),
    ).toBeNull();
    expect(
      restoreThemePreference(
        JSON.stringify({ value: "device", savedAt: now }),
        now,
      ),
    ).toBeNull();
    expect(restoreThemePreference("not-json", now)).toBeNull();
  });
});
