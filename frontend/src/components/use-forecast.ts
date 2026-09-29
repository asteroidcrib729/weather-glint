"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiErrorMessage,
  getWeather,
  type Location,
  type Weather,
} from "@/lib/weather";

export function useForecast(
  location: Location,
  onSuccess: (receivedAt: number) => void,
) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const version = requestVersion.current;
    getWeather(location, "metric", controller.signal)
      .then((value) => {
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        setWeather(value);
        onSuccess(Date.now());
        setWeatherError("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setWeatherError(apiErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersion.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [location, refreshKey, onSuccess]);

  const clearForecast = useCallback(() => {
    requestVersion.current += 1;
    setWeather(null);
    setWeatherError("");
    setLoading(true);
  }, []);

  function refresh(offline: boolean) {
    if (offline) {
      setWeatherError("You are offline. Reconnect before refreshing.");
      return;
    }
    requestVersion.current += 1;
    setWeatherError("");
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  const reconnect = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  return {
    weather,
    weatherError,
    loading,
    clearForecast,
    refresh,
    reconnect,
  };
}
