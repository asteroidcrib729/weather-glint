"use client";

import { useEffect, useRef, useState } from "react";
import { apiErrorMessage, searchLocations, type Location } from "@/lib/weather";

export function useLocationSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const version = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const currentVersion = version.current;
    const timer = window.setTimeout(() => {
      searchLocations(text, controller.signal)
        .then((matches) => {
          if (controller.signal.aborted || currentVersion !== version.current) return;
          setResults(matches); setActiveIndex(0); setSearchError("");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || currentVersion !== version.current) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]); setSearchError(apiErrorMessage(error));
        })
        .finally(() => {
          if (!controller.signal.aborted && currentVersion === version.current) setSearching(false);
        });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function updateQuery(value: string) {
    version.current += 1;
    setQuery(value); setResults([]); setSearchError(""); setSearching(value.trim().length >= 2);
  }

  function clearSearch() {
    version.current += 1;
    setQuery(""); setResults([]); setSearchError(""); setSearching(false);
  }

  return { query, results, searchError, searching, activeIndex, setActiveIndex, setSearchError, updateQuery, clearSearch };
}
