import { savedLocations, type Location, type UnitSystem } from "@/lib/weather";

const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_STORAGE_KEY = "weather-glint-recent";
export const UNITS_STORAGE_KEY = "weather-glint-units";
export const THEME_STORAGE_KEY = "weather-glint-theme";
export const LEGACY_RECENT_STORAGE_KEY = "atmos-recent";
export const LEGACY_UNITS_STORAGE_KEY = "atmos-units";

export const RECENT_RETENTION_MS = 30 * DAY_MS;
export const UNITS_RETENTION_MS = 180 * DAY_MS;
export const THEME_RETENTION_MS = 180 * DAY_MS;

export type ThemePreference = "device" | "light" | "dark";

export type SavedRecentLocation = { location: Location; savedAt: number };
export type SavedUnitPreference = { value: UnitSystem; savedAt: number };
export type SavedThemePreference = { value: "light" | "dark"; savedAt: number };

function isFresh(savedAt: unknown, now: number, retention: number): savedAt is number {
  return typeof savedAt === "number" && Number.isFinite(savedAt) &&
    savedAt <= now && now - savedAt < retention;
}

export function restoreRecentLocations(value: unknown, now: number): SavedRecentLocation[] {
  if (!Array.isArray(value)) return [];
  const restored: SavedRecentLocation[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const stamped = "location" in record || "savedAt" in record;
    const location = savedLocations([stamped ? record.location : item])[0];
    // Old entries lack timestamps. Preserve them once, starting a 30-day migration window.
    const savedAt = stamped ? record.savedAt : now;
    if (!location || !isFresh(savedAt, now, RECENT_RETENTION_MS) || seen.has(location.id)) continue;
    restored.push({ location, savedAt });
    seen.add(location.id);
    if (restored.length === 5) break;
  }
  return restored;
}

export function restoreUnitPreference(raw: string | null, now: number): SavedUnitPreference | null {
  if (raw === null) return null;
  // Migrate the original plain-string preference without discarding the visitor's choice.
  if (raw === "metric" || raw === "imperial") return { value: raw, savedAt: now };
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if ((record.value !== "metric" && record.value !== "imperial") ||
      !isFresh(record.savedAt, now, UNITS_RETENTION_MS)) return null;
  return { value: record.value, savedAt: record.savedAt };
}

export function restoreThemePreference(raw: string | null, now: number): SavedThemePreference | null {
  if (raw === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return null; }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if ((record.value !== "light" && record.value !== "dark") ||
      !isFresh(record.savedAt, now, THEME_RETENTION_MS)) return null;
  return { value: record.value, savedAt: record.savedAt };
}
