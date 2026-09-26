"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { restoreThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/browser-storage";

type ThemeContextValue = {
  preference: ThemePreference;
  chooseTheme: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(preference: ThemePreference) {
  const deviceIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = preference === "device" ? (deviceIsDark ? "dark" : "light") : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("device");

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved: ReturnType<typeof restoreThemePreference> = null;
      try {
        saved = restoreThemePreference(localStorage.getItem(THEME_STORAGE_KEY), Date.now());
        if (!saved) localStorage.removeItem(THEME_STORAGE_KEY);
      } catch { /* Storage may be disabled. */ }
      const next = saved?.value ?? "device";
      setPreference(next);
      applyTheme(next);
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function chooseTheme(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
    try {
      if (next === "device") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ value: next, savedAt: Date.now() }));
    } catch { /* Theme still works for this visit. */ }
  }

  return <ThemeContext value={{ preference, chooseTheme }}>{children}</ThemeContext>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
