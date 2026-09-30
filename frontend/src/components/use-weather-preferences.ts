"use client";

import { useEffect, useState } from "react";
import {
  LEGACY_RECENT_STORAGE_KEY,
  LEGACY_UNITS_STORAGE_KEY,
  RECENT_STORAGE_KEY,
  UNITS_STORAGE_KEY,
  restoreRecentLocations,
  restoreUnitPreference,
  type SavedRecentLocation,
} from "@/lib/browser-storage";
import type { Location, UnitSystem } from "@/lib/weather";

export function useWeatherPreferences() {
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [recent, setRecent] = useState<SavedRecentLocation[]>([]);

  useEffect(() => {
    // Restore after hydration; browser storage can be unavailable or malformed.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const now = Date.now();
      const rawUnits =
        localStorage.getItem(UNITS_STORAGE_KEY) ??
        localStorage.getItem(LEGACY_UNITS_STORAGE_KEY);
      const savedUnits = restoreUnitPreference(rawUnits, now);
      if (savedUnits) {
        setUnits(savedUnits.value);
        localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(savedUnits));
      } else if (rawUnits !== null) localStorage.removeItem(UNITS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_UNITS_STORAGE_KEY);
      const rawRecent =
        localStorage.getItem(RECENT_STORAGE_KEY) ??
        localStorage.getItem(LEGACY_RECENT_STORAGE_KEY);
      let parsedRecent: unknown = [];
      try {
        parsedRecent = JSON.parse(rawRecent ?? "[]") as unknown;
      } catch {
        /* invalid storage */
      }
      const safeRecent = restoreRecentLocations(parsedRecent, now);
      setRecent(safeRecent);
      if (rawRecent !== null) {
        if (safeRecent.length)
          localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(safeRecent));
        else localStorage.removeItem(RECENT_STORAGE_KEY);
      }
      localStorage.removeItem(LEGACY_RECENT_STORAGE_KEY);
    } catch {
      /* Weather remains usable when storage is disabled. */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function changeUnits(next: UnitSystem) {
    if (next === units) return;
    setUnits(next);
    try {
      localStorage.setItem(
        UNITS_STORAGE_KEY,
        JSON.stringify({ value: next, savedAt: Date.now() }),
      );
    } catch {
      /* optional */
    }
  }

  function rememberLocation(selected: Location) {
    const now = Date.now();
    const freshRecent = restoreRecentLocations(recent, now);
    const nextRecent = [
      { location: selected, savedAt: now },
      ...freshRecent.filter((item) => item.location.id !== selected.id),
    ].slice(0, 5);
    setRecent(nextRecent);
    try {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(nextRecent));
    } catch {
      /* optional */
    }
  }

  function forgetLocation(id: number) {
    const nextRecent = recent.filter((item) => item.location.id !== id);
    setRecent(nextRecent);
    try {
      if (nextRecent.length)
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(nextRecent));
      else localStorage.removeItem(RECENT_STORAGE_KEY);
    } catch {
      /* Optional storage. */
    }
  }

  function clearPreferences() {
    setUnits("metric");
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_STORAGE_KEY);
      localStorage.removeItem(UNITS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_RECENT_STORAGE_KEY);
      localStorage.removeItem(LEGACY_UNITS_STORAGE_KEY);
    } catch {
      /* Storage may be disabled. */
    }
  }

  return {
    units,
    recent,
    changeUnits,
    rememberLocation,
    forgetLocation,
    clearPreferences,
  };
}
