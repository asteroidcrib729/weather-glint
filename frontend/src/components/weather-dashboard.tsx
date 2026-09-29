"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CurrentConditions } from "@/components/current-conditions";
import { DocumentLink } from "@/components/document-link";
import {
  DailyForecast,
  HourlyForecast,
  SolarDetails,
} from "@/components/forecast-panels";
import { LocationPicker } from "@/components/location-picker";
import { useTheme } from "@/components/theme-provider";
import { useForecast } from "@/components/use-forecast";
import { useWeatherPreferences } from "@/components/use-weather-preferences";
import { forecastFreshness, formatForecastAge } from "@/lib/freshness";
import { wrap } from "@/lib/layout-classes";
import {
  displayWeatherInUnits,
  formatClock,
  formatDate,
  formatGeneratedAt,
  searchLocations,
  type Location,
} from "@/lib/weather";

const DEFAULT_LOCATION: Location = {
  id: 1174872,
  name: "Karachi",
  admin1: "Sindh",
  country: "Pakistan",
  country_code: "PK",
  latitude: 24.8608,
  longitude: 67.0104,
  timezone: "Asia/Karachi",
};

const forecastButton =
  "min-h-[38px] flex-none rounded-[9px] border px-[13px] py-2 font-bold whitespace-nowrap hover:brightness-[.94] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#075f5a] dark:focus-visible:outline-[#74e1ce] disabled:cursor-not-allowed max-[670px]:min-w-0 max-[670px]:whitespace-normal";
const footerLink = "text-[#0a766e] underline-offset-[3px] dark:text-[#74e1ce]";

export function WeatherDashboard() {
  const { chooseTheme } = useTheme();
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);
  const {
    units,
    recent,
    changeUnits,
    rememberLocation,
    forgetLocation,
    clearPreferences,
  } = useWeatherPreferences();
  const [now, setNow] = useState(0);
  const { weather, weatherError, loading, clearForecast, refresh, reconnect } =
    useForecast(location, setNow);
  const [offline, setOffline] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string } | null>(null);
  const locale =
    typeof navigator === "undefined" ? "en" : navigator.language || "en";

  useEffect(() => {
    let timer: number;
    const updateClock = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      window.clearTimeout(timer);
      timer = window.setTimeout(
        updateClock,
        60_000 - (timestamp % 60_000) + 20,
      );
    };
    const onVisibilityChange = () => {
      if (!document.hidden) updateClock();
    };
    updateClock();
    window.addEventListener("focus", updateClock);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", updateClock);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    const onOnline = () => {
      updateConnection();
      reconnect();
    };
    updateConnection();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", updateConnection);
    };
  }, [reconnect]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("place");
    const id = Number(params.get("place_id"));
    if (
      !name ||
      name.length < 2 ||
      name.length > 100 ||
      !Number.isSafeInteger(id) ||
      id <= 0
    )
      return;
    const controller = new AbortController();
    searchLocations(name, controller.signal)
      .then((matches) => {
        if (controller.signal.aborted) return;
        const match = matches.find((item) => item.id === id);
        if (match) {
          clearForecast();
          setLocation(match);
        }
      })
      .catch(() => {
        /* Invalid or unavailable shared place falls back to Karachi. */
      });
    return () => controller.abort();
  }, [clearForecast]);

  function selectLocation(selected: Location, saveRecent = true) {
    clearForecast();
    setLocation({ ...selected });
    setFeedback(null);
    if (saveRecent && selected.id > 0) rememberLocation(selected);
    const url = new URL(window.location.href);
    if (saveRecent && selected.id > 0) {
      url.searchParams.set("place", selected.name);
      url.searchParams.set("place_id", String(selected.id));
    } else {
      url.searchParams.delete("place");
      url.searchParams.delete("place_id");
    }
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function clearSavedData() {
    clearPreferences();
    chooseTheme("device");
    setFeedback({
      text: "Saved units, recent places, and theme choice cleared from this browser.",
    });
  }

  function refreshWeather() {
    refresh(offline);
  }

  async function copyShareLink() {
    try {
      const link = new URL(window.location.pathname, window.location.origin);
      link.searchParams.set("place", location.name);
      link.searchParams.set("place_id", String(location.id));
      await navigator.clipboard.writeText(link.href);
      setFeedback({
        text: "Place link copied. It contains a place ID, not device coordinates.",
      });
    } catch {
      setFeedback({
        text: "Clipboard unavailable. Copy this page's address from your browser instead.",
      });
    }
  }

  const displayedWeather = weather
    ? displayWeatherInUnits(weather, units)
    : null;
  const freshness = weather
    ? forecastFreshness(
        weather,
        now || Date.parse(weather.generated_at),
        Boolean(weatherError) || offline,
      )
    : null;
  const current = displayedWeather?.current;
  const today = displayedWeather?.daily[0];

  return (
    <>
      <main
        className={`${wrap} main-content pt-[58px] pb-[70px] max-[670px]:pt-[38px] max-[670px]:pb-[50px]`}
      >
        <LocationPicker
          recent={recent}
          onSelect={selectLocation}
          onForget={forgetLocation}
        />

        <p
          className="forecast-announcement sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {loading
            ? `Loading forecast for ${location.name}.`
            : weatherError && !weather
              ? `Forecast unavailable for ${location.name}.`
              : weather
                ? `${freshness?.stale ? "Stale forecast" : "Forecast available"} for ${location.name}.`
                : ""}
        </p>

        <section className="forecast-content min-h-[400px]" aria-busy={loading}>
          {offline && (
            <div className="notice mb-4 rounded-[10px] border border-[#f4d6a1] bg-[#fff1d9] px-4 py-3 text-[13px] text-[#865a17] dark:border-[#8b652e] dark:bg-[#49371d] dark:text-[#ffe0a6]">
              You are offline. Reconnect to refresh the forecast.
            </div>
          )}
          {loading && !weather && (
            <div className="loading-card flex min-h-[360px] items-center justify-center gap-[13px] rounded-[20px] border border-[#dce9e9] bg-white text-[15px] text-[#365761] dark:border-[#36515b] dark:bg-[#172a35] dark:text-[#bcd4d7]">
              <span className="spinner size-6 animate-spin rounded-full border-[3px] border-[#d5eae6] border-t-[#16ae9f] motion-reduce:animate-none" />{" "}
              Loading weather for {location.name}…
            </div>
          )}
          {!weather && !loading && weatherError && (
            <div
              className="error-card flex min-h-[360px] flex-col items-center justify-center gap-[13px] rounded-[20px] border border-[#dce9e9] bg-white p-[30px] text-center text-[15px] text-[#365761] dark:border-[#36515b] dark:bg-[#172a35] dark:text-[#bcd4d7]"
              role="alert"
            >
              <div
                className="error-symbol text-[50px] text-[#4c9da2]"
                aria-hidden="true"
              >
                ☁
              </div>
              <h2 className="text-[22px] text-[#254653] dark:text-[#e9f6f4]">
                We couldn&apos;t load the weather
              </h2>
              <p className="max-w-[450px] leading-normal">{weatherError}</p>
              <button
                className="rounded-[9px] bg-[#086b66] px-[18px] py-[10px] font-bold text-white"
                type="button"
                onClick={refreshWeather}
              >
                Try again
              </button>
            </div>
          )}
          {displayedWeather && current && today && (
            <>
              <div className="forecast-toolbar mb-[14px] flex items-end justify-between gap-[18px] text-[13px] text-[#3c626e] max-[670px]:flex-col max-[670px]:items-stretch max-[670px]:gap-[11px] dark:text-[#b0cbd0]">
                <div className="min-w-0 flex-1">
                  <span
                    className={`forecast-state inline-flex items-center gap-2 rounded-full px-[11px] py-[7px] leading-[1.3] font-bold ${freshness?.stale ? "is-stale bg-[#fff0d9] text-[#825613] dark:bg-[#473b2a] dark:text-[#f6d29b]" : "bg-[#e0f3ee] text-[#086b62] dark:bg-[#204e51] dark:text-[#9af0df]"}`}
                  >
                    <span
                      className={`size-[7px] flex-none rounded-full ${freshness?.stale ? "bg-[#c7841f]" : "bg-[#0da892]"}`}
                      aria-hidden="true"
                    />
                    {freshness?.stale ? "Stale forecast" : "Forecast available"}
                  </span>
                  <p className="forecast-meta mt-[9px] leading-normal">
                    Last successful update:{" "}
                    {formatGeneratedAt(
                      displayedWeather.generated_at,
                      displayedWeather.timezone,
                      locale,
                    )}{" "}
                    ({formatForecastAge(freshness?.ageMinutes ?? null)})
                    <span aria-hidden="true"> · </span>
                    Forecast valid: {formatDate(current.time, locale)} at{" "}
                    {formatClock(current.time, locale)} local time
                    {freshness?.stale && (
                      <span className="forecast-breakdown hidden">
                        {" "}
                        · Current {freshness.currentStale ? "stale" : "fresh"} ·
                        Hourly {freshness.hourlyStale ? "stale" : "fresh"} ·
                        Daily {freshness.dailyStale ? "stale" : "fresh"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="forecast-actions flex flex-none gap-2 max-[670px]:grid max-[670px]:grid-cols-2">
                  <button
                    type="button"
                    className={`${forecastButton} forecast-refresh inline-flex min-w-[158px] items-center justify-center border-[#087d78] bg-[#087d78] text-white max-[670px]:min-w-0 dark:border-[#74e1ce] dark:bg-[#74e1ce] dark:text-[#123a41] ${offline ? "opacity-65" : ""}`}
                    onClick={refreshWeather}
                    disabled={loading || offline}
                  >
                    {loading ? "Refreshing…" : "Refresh forecast"}
                  </button>
                  {location.id > 0 && (
                    <button
                      className={`${forecastButton} border-[#087d78] bg-transparent text-[#075d5b] dark:border-[#52727a] dark:bg-[#203d49] dark:text-[#e9f6f4]`}
                      type="button"
                      onClick={copyShareLink}
                    >
                      Copy place link
                    </button>
                  )}
                </div>
              </div>
              {weatherError && (
                <div
                  className="notice mb-4 rounded-[10px] border border-[#f4d6a1] bg-[#fff1d9] px-4 py-3 text-[13px] text-[#865a17] dark:border-[#8b652e] dark:bg-[#49371d] dark:text-[#ffe0a6]"
                  role="alert"
                >
                  Could not refresh: {weatherError} Showing the last available
                  forecast.
                </div>
              )}
              <CurrentConditions
                weather={displayedWeather}
                location={location}
                units={units}
                locale={locale}
                now={now}
                onChangeUnits={changeUnits}
              />

              <SolarDetails
                day={today}
                source={displayedWeather.source ?? "MET Norway"}
                locale={locale}
              />
              <div className="forecast-grid grid grid-cols-[minmax(0,1fr)] gap-[18px]">
                <HourlyForecast
                  hours={displayedWeather.hourly}
                  units={units}
                  locale={locale}
                />
                <DailyForecast
                  days={displayedWeather.daily}
                  units={units}
                  locale={locale}
                />
              </div>
            </>
          )}
        </section>
      </main>
      <footer
        className={`site-footer ${wrap} flex min-h-[91px] items-center justify-between gap-5 border-t border-[#dde9e7] text-xs text-[#365761] max-[670px]:flex-col max-[670px]:items-start max-[670px]:gap-[10px] max-[670px]:py-[22px] dark:border-[#34505a] dark:text-[#b0cbd0]`}
      >
        <span className="text-[17px] font-extrabold tracking-[-.8px] text-[#2b5360] dark:text-[#e9f6f4]">
          Weather{" "}
          <span className="brand-glint text-[#0a766e] dark:text-[#74e1ce]">
            Glint
          </span>
          <span className="brand-dot text-[#16b6aa]">.</span>{" "}
          <span className="footer-soft ml-[7px] text-[11px] font-normal tracking-normal text-[#47656d] dark:text-[#b0cbd0]">
            Weather, clearly.
          </span>
        </span>
        <span>
          Weather data by{" "}
          <Link
            className={footerLink}
            href={
              displayedWeather?.attribution_url ??
              "https://api.met.no/doc/License"
            }
            target="_blank"
            rel="noreferrer"
          >
            {displayedWeather?.source ?? "MET Norway"}
          </Link>{" "}
          · Place search via{" "}
          <Link
            className={footerLink}
            href="https://open-meteo.com/en/docs/geocoding-api"
            target="_blank"
            rel="noreferrer"
          >
            Open-Meteo
          </Link>{" "}
          · Location data by{" "}
          <Link
            className={footerLink}
            href="https://www.geonames.org/"
            target="_blank"
            rel="noreferrer"
          >
            GeoNames
          </Link>{" "}
          ·{" "}
          <Link
            className={footerLink}
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </Link>{" "}
          (data adapted for display)
        </span>
        <span>
          <DocumentLink className={footerLink} href="/data-use">
            Data use
          </DocumentLink>{" "}
          ·{" "}
          <button
            type="button"
            title="Remove saved recent places, units, and theme preference"
            className="footer-action bg-transparent p-0 text-[#075f5a] underline underline-offset-[3px] hover:decoration-2 dark:text-[#74e1ce]"
            onClick={clearSavedData}
          >
            Clear saved data
          </button>
        </span>
      </footer>
      <div
        className={
          feedback
            ? "feedback-toast pointer-events-none fixed right-6 bottom-6 z-50 max-w-[420px] rounded-xl border border-[#2a6b70] bg-[#143e48] px-4 py-3 text-sm leading-normal text-white shadow-[0_12px_34px_#092b3966] max-[670px]:right-4 max-[670px]:bottom-4 max-[670px]:left-4 dark:border-[#52727a] dark:bg-[#203d49]"
            : "sr-only"
        }
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback?.text}
      </div>
    </>
  );
}
