"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentLink } from "@/components/document-link";
import { useLocationSearch } from "@/components/use-location-search";
import type { SavedRecentLocation } from "@/lib/browser-storage";
import type { Location } from "@/lib/weather";

const kicker = "text-[10px] font-extrabold tracking-[.17em]";

function placeLabel(location: Location): string {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");
}

export function LocationPicker({
  recent,
  onSelect,
  onForget,
}: {
  recent: SavedRecentLocation[];
  onSelect: (location: Location, saveRecent?: boolean) => void;
  onForget: (id: number) => void;
}) {
  const {
    query,
    results,
    searchError,
    searching,
    activeIndex,
    setActiveIndex,
    setSearchError,
    updateQuery,
    clearSearch,
  } = useLocationSearch();
  const showResults = query.trim().length >= 2;
  const recentScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRecentLeft, setCanScrollRecentLeft] = useState(false);
  const [canScrollRecentRight, setCanScrollRecentRight] = useState(false);

  const updateRecentScroll = useCallback(() => {
    const list = recentScrollRef.current;
    if (!list) return;
    setCanScrollRecentLeft(list.scrollLeft > 1);
    setCanScrollRecentRight(
      list.scrollLeft + list.clientWidth < list.scrollWidth - 1,
    );
  }, []);

  useEffect(() => {
    updateRecentScroll();
    const list = recentScrollRef.current;
    if (!list) return;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateRecentScroll);
    observer?.observe(list);
    window.addEventListener("resize", updateRecentScroll);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateRecentScroll);
    };
  }, [recent, showResults, updateRecentScroll]);

  function scrollRecent(direction: -1 | 1) {
    const list = recentScrollRef.current;
    if (!list) return;
    list.scrollBy({
      left: direction * Math.max(160, list.clientWidth * 0.7),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  function selectLocation(location: Location, saveRecent = true) {
    clearSearch();
    onSelect(location, saveRecent);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setSearchError("Geolocation is unavailable in this browser.");
      return;
    }
    setSearchError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        selectLocation(
          {
            id: -1,
            name: "Your location",
            country: "",
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
          false,
        ),
      () =>
        setSearchError(
          "Location access was denied or unavailable. Search for a place instead.",
        ),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <section
      className="intro mb-[22px] grid grid-cols-[minmax(0,1fr)_400px] items-start gap-11 max-[950px]:grid-cols-1 max-[950px]:gap-[30px] max-[670px]:mb-[16px]"
      aria-labelledby="intro-title"
    >
      <div className="intro-copy">
        <div
          className={`eyebrow ${kicker} mb-[15px] flex items-center gap-2 text-[#0a766e] dark:text-[#74e1ce]`}
        >
          <span className="live-dot size-[7px] rounded-full bg-[#1bc5a9] shadow-[0_0_0_4px_#1bc5a921]" />{" "}
          WEATHER, SIMPLIFIED
        </div>
        <h1
          id="intro-title"
          className="m-0 max-w-[680px] text-[clamp(34px,4vw,57px)] leading-[1.16] font-extrabold tracking-[-.055em] text-[#153d4b] max-[670px]:text-[clamp(33px,9vw,46px)] dark:text-[#e9f6f4]"
        >
          Know what the day{" "}
          <em className="not-italic text-[#0a766e] dark:text-[#74e1ce]">
            feels like.
          </em>
        </h1>
        <p className="mt-4 max-w-[580px] text-[15px] leading-[1.65] text-[#47656d] max-[670px]:text-sm dark:text-[#b0cbd0]">
          Beautifully simple weather for wherever life takes you. Search a place
          to see the sky ahead.
        </p>
      </div>
      <div className="search-area relative z-5 mt-[61px] pb-[7px] max-[950px]:mt-0 max-[950px]:max-w-[530px]">
        <label
          className={`search-label ${kicker} mb-[10px] block text-[#47656d] dark:text-[#b0cbd0]`}
          htmlFor="location-search"
        >
          FIND A LOCATION
        </label>
        <div className="search-box flex h-[58px] items-center gap-[11px] rounded-[14px] border border-[#d7e6e6] bg-white pr-[10px] pl-[18px] shadow-[0_8px_25px_#30616a0b] focus-within:border-[#075f5a] focus-within:ring-[3px] focus-within:ring-[#075f5a] dark:border-[#36515b] dark:bg-[#172a35] dark:shadow-none dark:focus-within:border-[#74e1ce] dark:focus-within:ring-[#74e1ce]">
          <svg
            className="search-icon size-[22px] flex-none text-[#85a0a7]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" />
          </svg>
          <input
            id="location-search"
            type="search"
            autoComplete="off"
            placeholder="Search a city or place..."
            value={query}
            className="h-full min-w-0 w-full border-0 bg-transparent text-sm text-[#274b58] outline-none focus-visible:outline-none placeholder:text-[#47656d] dark:text-[#e4f4f2] dark:placeholder:text-[#a9c5cb]"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showResults && results.length > 0}
            aria-controls={
              showResults && results.length > 0 ? "location-results" : undefined
            }
            aria-activedescendant={
              showResults && results[activeIndex]
                ? `location-option-${results[activeIndex].id}`
                : undefined
            }
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && results.length) {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % results.length);
              } else if (event.key === "ArrowUp" && results.length) {
                event.preventDefault();
                setActiveIndex(
                  (index) => (index - 1 + results.length) % results.length,
                );
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                selectLocation(results[activeIndex]);
              } else if (event.key === "Escape") clearSearch();
            }}
          />
          <button
            className="locate-button size-[37px] flex-none rounded-[10px] border-0 bg-[#e8f7f3] text-[26px] leading-none text-[#159e97] hover:bg-[#d3f1eb] focus-visible:bg-[#d3f1eb] dark:bg-[#27535a] dark:text-[#94f0dc]"
            type="button"
            onClick={useMyLocation}
            title="Use my location"
            aria-label="Use my location"
          >
            ◎
          </button>
        </div>
        <p className="data-hint mt-[9px] text-xs leading-normal text-[#365761] dark:text-[#bcd4d7]">
          Searches are sent to Open-Meteo through this app. “Use my location”
          asks browser permission; exact device coordinates are not saved or put
          in a share link.{" "}
          {/* A document navigation lets browser reading tools extract the destination afresh. */}
          <DocumentLink
            className="text-[#075f5a] underline-offset-[3px] dark:text-[#74e1ce]"
            href="/data-use"
          >
            How location data is used
          </DocumentLink>
        </p>
        {showResults && results.length > 0 && (
          <div
            id="location-results"
            className="search-results absolute top-[81px] right-0 left-0 z-20 overflow-hidden rounded-[13px] border border-[#dce9e9] bg-white shadow-[0_18px_45px_#1c4a5824] dark:border-[#36515b] dark:bg-[#172a35] dark:shadow-none"
            role="listbox"
            aria-label="Matching locations"
          >
            {results.map((item, index) => (
              <button
                key={item.id}
                id={`location-option-${item.id}`}
                role="option"
                aria-selected={index === activeIndex}
                type="button"
                tabIndex={-1}
                className={`result flex w-full items-center border-0 px-4 py-[13px] text-left text-[13px] text-[#31515b] hover:bg-[#edf9f6] dark:bg-[#172a35] dark:text-[#e4f4f2] dark:hover:bg-[#24515a] ${index === activeIndex ? "active bg-[#edf9f6] dark:bg-[#24515a]" : "bg-white"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectLocation(item)}
              >
                <span className="wrap-anywhere" dir="auto">
                  {placeLabel(item)}
                </span>
              </button>
            ))}
          </div>
        )}
        <p
          className={
            showResults && !searching && (searchError || results.length === 0)
              ? "search-hint mt-2 text-xs"
              : "sr-only"
          }
          role="status"
          aria-live="polite"
        >
          {showResults
            ? searching
              ? "Searching places…"
              : searchError ||
                (results.length
                  ? `${results.length} matching places. Use arrow keys to choose.`
                  : "No matching places found.")
            : ""}
        </p>
        {!showResults && searchError && (
          <p
            className="search-hint error-text mt-2 text-xs text-[#b54545]"
            role="alert"
          >
            {searchError}
          </p>
        )}
        <div
          className="recent-locations mt-[9px] flex h-11 min-w-0 items-center gap-2 whitespace-nowrap"
          role="group"
          aria-label="Recent places"
        >
          <span
            className={`${kicker} flex-none text-[#47656d] dark:text-[#b0cbd0]`}
          >
            RECENT
          </span>
          <div className="relative min-w-0 flex-1">
            <div
              ref={recentScrollRef}
              className="recent-place-list flex h-11 items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="region"
              aria-label="Recently searched locations"
              tabIndex={recent.length ? 0 : undefined}
              onScroll={updateRecentScroll}
            >
              {!showResults && recent.length === 0 && (
                <span className="text-[11px] text-[#627e85] dark:text-[#9bb6bc]">
                  Places you choose will appear here.
                </span>
              )}
              {!showResults &&
                recent.slice(0, 3).map(({ location: item }) => (
                  <span
                    className="recent-place inline-flex max-w-[min(100%,310px)] flex-none items-center gap-0.5 rounded-[20px] bg-[#e6f2f0] dark:bg-[#263e49]"
                    key={item.id}
                  >
                    <button
                      className="min-w-0 truncate rounded-[20px] bg-transparent px-[10px] py-[5px] text-[11px] text-[#35545d] dark:text-[#c5dcdf]"
                      type="button"
                      dir="auto"
                      onClick={() => selectLocation(item)}
                      title={placeLabel(item)}
                    >
                      {placeLabel(item)}
                    </button>
                    <button
                      className="recent-remove flex-none rounded-[20px] bg-transparent px-[9px] py-[5px] text-sm font-bold text-[#35545d] dark:text-[#c5dcdf]"
                      type="button"
                      aria-label={`Remove ${placeLabel(item)} from recent places`}
                      onClick={() => onForget(item.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
            {canScrollRecentLeft && (
              <button
                type="button"
                aria-label="Scroll recent places left"
                className="absolute top-1/2 left-0 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#c9e3df] bg-[#e6f2f0] text-[#075f5a] shadow-sm hover:bg-[#d3eee8] dark:border-[#365b60] dark:bg-[#263e49] dark:text-[#74e1ce] dark:hover:bg-[#31545c]"
                onClick={() => scrollRecent(-1)}
              >
                <span aria-hidden="true">‹</span>
              </button>
            )}
            {canScrollRecentRight && (
              <button
                type="button"
                aria-label="Scroll recent places right"
                className="absolute top-1/2 right-0 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#c9e3df] bg-[#e6f2f0] text-[#075f5a] shadow-sm hover:bg-[#d3eee8] dark:border-[#365b60] dark:bg-[#263e49] dark:text-[#74e1ce] dark:hover:bg-[#31545c]"
                onClick={() => scrollRecent(1)}
              >
                <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
