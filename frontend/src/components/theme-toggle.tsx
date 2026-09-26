"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { chooseTheme } = useTheme();

  return <button
    className="theme-button grid size-12 place-items-center rounded-[15px] border-2 border-[#74849a] bg-[#151c25] text-white hover:border-[#9aacc3] hover:bg-[#253142] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#e2b963]"
    type="button"
    aria-label="Toggle color theme"
    aria-describedby="theme-help"
    title="Toggle light and dark theme"
    onClick={() => chooseTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")}
  >
    <span id="theme-help" className="sr-only">The first visit follows your device theme. Press to switch and remember a light or dark choice.</span>
    <svg className="theme-icon-sun hidden dark:block" viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="16" cy="16" r="5" />
      <path d="M16 2.5v3M16 26.5v3M2.5 16h3M26.5 16h3M6.45 6.45l2.1 2.1M23.45 23.45l2.1 2.1M25.55 6.45l-2.1 2.1M8.55 23.45l-2.1 2.1" />
    </svg>
    <svg className="theme-icon-moon block dark:hidden" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <mask id="theme-moon-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <circle cx="15.5" cy="16.5" r="11" fill="white" />
        <circle cx="21.5" cy="10.5" r="10.5" fill="black" />
      </mask>
      <circle cx="15.5" cy="16.5" r="11" fill="currentColor" mask="url(#theme-moon-mask)" />
    </svg>
  </button>;
}
