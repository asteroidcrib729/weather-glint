import { expect, test } from "@playwright/test";
import axe from "axe-core";

const weather = {
  location: { latitude: 24.8608, longitude: 67.0104 },
  timezone: "Asia/Karachi",
  generated_at: "2026-09-23T07:00:00Z",
  units: { temperature: "°C", wind_speed: "km/h", precipitation: "mm" },
  current: {
    time: "2026-09-23T12:15",
    temperature: 31,
    apparent_temperature: 36,
    humidity_percent: 69,
    precipitation: 0.1,
    wind_speed: 12,
    wind_direction_degrees: 220,
    is_day: true,
    weather_code: 2,
    condition: "Partly cloudy",
  },
  hourly: Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 8, 23, 12 + i)).toISOString().slice(0, 16),
    temperature: 31,
    precipitation_probability_percent: 20,
    is_day: i < 6,
    weather_code: 2,
    condition: "Partly cloudy",
  })),
  daily: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-09-${String(23 + i).padStart(2, "0")}`,
    temperature_max: 35,
    temperature_min: 27,
    precipitation_probability_max_percent: 40,
    weather_code: 2,
    condition: "Partly cloudy",
    sunrise: `2026-09-${String(23 + i).padStart(2, "0")}T06:10`,
    sunset: `2026-09-${String(23 + i).padStart(2, "0")}T18:20`,
    uv_index_max: 8.4,
  })),
  source: "Open-Meteo",
  attribution_url: "https://open-meteo.com/",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/weather", async (route) => {
    const body = route.request().postDataJSON();
    const imperial = body.units === "imperial";
    const london = body.latitude === 51.5085;
    await route.fulfill({
      json: {
        ...weather,
        timezone: london ? "Europe/London" : "Asia/Karachi",
        location: london
          ? { latitude: 51.5085, longitude: -0.1257 }
          : weather.location,
        units: imperial
          ? { temperature: "°F", wind_speed: "mph", precipitation: "in" }
          : weather.units,
        current: imperial
          ? { ...weather.current, temperature: 88, apparent_temperature: 97 }
          : weather.current,
        hourly: imperial
          ? weather.hourly.map((hour) => ({ ...hour, temperature: 88 }))
          : weather.hourly,
        daily: imperial
          ? weather.daily.map((day) => ({
              ...day,
              temperature_max: 95,
              temperature_min: 81,
            }))
          : weather.daily,
      },
    });
  });
  await page.route("**/api/v1/locations", async (route) => {
    await route.fulfill({
      json: [
        {
          id: 2643743,
          name: "London",
          admin1: "England",
          country: "United Kingdom",
          country_code: "GB",
          latitude: 51.5085,
          longitude: -0.1257,
          timezone: "Europe/London",
        },
      ],
    });
  });
});

test("shows Karachi's live clock across midnight without relabeling an hourly forecast", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-29T18:59:50Z") });
  await page.route("**/api/v1/weather", (route) =>
    route.fulfill({
      json: {
        ...weather,
        generated_at: "2026-09-29T18:59:45Z",
        current: { ...weather.current, time: "2026-09-29T23:00" },
      },
    }),
  );

  await page.goto("/");
  await expect(page.locator(".hero-date")).toHaveText(
    "Tuesday, September 29 · 11:59 PM local time",
  );
  await expect(page.locator(".hero-forecast-time")).toContainText(
    "Forecast valid: Tuesday, September 29 at 11:00 PM local time",
  );

  await page.clock.runFor(71_000);
  await expect(page.locator(".hero-date")).toHaveText(
    "Wednesday, September 30 · 12:01 AM local time",
  );
  await expect(page.locator(".hero-forecast-time")).toContainText(
    "Forecast valid: Tuesday, September 29 at 11:00 PM local time",
  );
});

test("loads the data-use page as a fresh document for browser reading tools", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await expect(page.locator(".sun-disc")).toBeVisible();
  await expect(page.locator(".moon-disc")).toHaveCount(0);
  await page.evaluate(
    () =>
      ((window as typeof window & { readerProbe?: number }).readerProbe = 1),
  );
  await page.getByRole("link", { name: "How location data is used" }).click();
  await expect(page).toHaveURL(/\/data-use$/);
  await expect(
    page.getByRole("heading", { name: "How location data is used" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { readerProbe?: number }).readerProbe,
    ),
  ).toBeUndefined();
  await expect(page.getByText("Hourly forecast")).toHaveCount(0);

  await page.evaluate(
    () =>
      ((window as typeof window & { readerProbe?: number }).readerProbe = 2),
  );
  await page.getByRole("link", { name: "Back to forecast" }).click();
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { readerProbe?: number }).readerProbe,
    ),
  ).toBeUndefined();

  await page.evaluate(
    () =>
      ((window as typeof window & { readerProbe?: number }).readerProbe = 3),
  );
  await page.getByRole("link", { name: "Data use" }).click();
  await expect(
    page.getByRole("heading", { name: "How location data is used" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { readerProbe?: number }).readerProbe,
    ),
  ).toBeUndefined();
});

test("keeps forecast labels separated in extracted text", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await expect(page.locator("#current-heading")).toHaveText(
    "Karachi, Sindh, Pakistan",
  );
  await expect(page.locator(".hour-rain").first()).toHaveText(
    /Rain chance\s+20%/,
  );
  await expect(page.locator(".day-rain").first()).toHaveText(
    /Maximum rain chance\s+40%/,
  );
  await expect(page.locator(".day-temperatures").first()).toContainText(
    /High:\s*35°C/,
  );
  await expect(page.locator(".day-temperatures").first()).toContainText(
    /Low:\s*27°C/,
  );
  await expect(
    page.locator(".day-temperatures").first().locator("[aria-hidden=true]"),
  ).toHaveText(["↑", "↓"]);
});

test("shows the forecast, location search, and unit switch", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Weather Glint - Weather, clearly");
  await expect(
    page.getByRole("link", { name: "Weather Glint home" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await expect(page.locator(".search-icon")).toHaveAttribute(
    "viewBox",
    "0 0 24 24",
  );
  const scale = page.getByRole("group", { name: "Temperature units" });
  await expect(scale).toBeVisible();
  await expect(scale.getByRole("button", { name: "°C" })).toHaveCSS(
    "color",
    "rgb(18, 86, 102)",
  );
  for (const unit of ["°C", "°F"]) {
    const button = scale.getByRole("button", { name: unit });
    await expect(button).toHaveCSS("display", /flex$/);
    await expect(button).toHaveCSS("align-items", "center");
    await expect(button).toHaveCSS("justify-content", "center");
  }
  await expect(page.locator(".site-shell")).toHaveCSS(
    "background-image",
    /radial-gradient/,
  );
  expect(
    await scale.evaluate(
      (element) => element.closest(".temperature-row") !== null,
    ),
  ).toBe(true);
  await expect(page.locator(".site-header .unit-switch")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "7-day forecast" }),
  ).toBeVisible();
  const panels = page.locator(".forecast-grid > .panel");
  const hourlyBox = await panels.nth(0).boundingBox();
  const dailyBox = await panels.nth(1).boundingBox();
  expect(hourlyBox).not.toBeNull();
  expect(dailyBox).not.toBeNull();
  expect(dailyBox!.y).toBeGreaterThanOrEqual(hourlyBox!.y + hourlyBox!.height);
  await page.getByRole("combobox", { name: "FIND A LOCATION" }).fill("London");
  await expect(page.locator(".result-pin")).toHaveCount(0);
  await page
    .getByRole("option", { name: /London, England, United Kingdom/ })
    .click();
  await expect(page.getByRole("heading", { name: /London/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.getByRole("button", { name: "°F" }).click();
  await expect(scale.getByRole("button", { name: "°F" })).toHaveCSS(
    "color",
    "rgb(18, 86, 102)",
  );
  await expect(page.getByText("Feels like 97°F")).toBeVisible();
});

test("keeps forecast actions together and close to the forecast card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const refresh = page.getByRole("button", { name: "Refresh forecast" });
  const copy = page.getByRole("button", { name: "Copy place link" });
  await expect(refresh).toBeVisible();
  await expect(copy).toBeVisible();
  const desktopRefresh = await refresh.boundingBox();
  const desktopCopy = await copy.boundingBox();
  const desktopMeta = await page.locator(".forecast-meta").boundingBox();
  const desktopCard = await page.locator(".hero-weather").boundingBox();
  expect(desktopRefresh).not.toBeNull();
  expect(desktopCopy).not.toBeNull();
  expect(desktopMeta).not.toBeNull();
  expect(desktopCard).not.toBeNull();
  expect(desktopCopy!.x).toBeGreaterThanOrEqual(
    desktopRefresh!.x + desktopRefresh!.width,
  );
  expect(Math.abs(desktopCopy!.y - desktopRefresh!.y)).toBeLessThan(2);
  expect(
    Math.abs(
      desktopMeta!.y +
        desktopMeta!.height -
        desktopRefresh!.y -
        desktopRefresh!.height,
    ),
  ).toBeLessThan(3);
  expect(
    desktopCard!.y - desktopRefresh!.y - desktopRefresh!.height,
  ).toBeLessThanOrEqual(20);

  await page.setViewportSize({ width: 320, height: 700 });
  const mobileRefresh = await refresh.boundingBox();
  const mobileCopy = await copy.boundingBox();
  const mobileCard = await page.locator(".hero-weather").boundingBox();
  expect(mobileRefresh).not.toBeNull();
  expect(mobileCopy).not.toBeNull();
  expect(mobileCard).not.toBeNull();
  expect(mobileCopy!.x).toBeGreaterThanOrEqual(
    mobileRefresh!.x + mobileRefresh!.width,
  );
  expect(Math.abs(mobileCopy!.y - mobileRefresh!.y)).toBeLessThan(2);
  expect(
    mobileCard!.y - mobileRefresh!.y - mobileRefresh!.height,
  ).toBeLessThanOrEqual(20);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("shows local sunrise, sunset and daily maximum UV with a compact accessible trend", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const solar = page.getByRole("region", { name: "Today's solar outlook" });
  await expect(solar).toContainText("6:10 AM");
  await expect(solar).toContainText("6:20 PM");
  await expect(solar).toContainText("8.4");
  await expect(solar).toContainText("Forecast daily maximum");
  await page.getByText("Compare the next 12 hours as a compact trend").click();
  await expect(page.locator(".trend-row")).toHaveCount(12);
  await expect(page.locator(".trend-row").first()).toContainText("31°C");
  expect(
    await page
      .locator(".hourly-scroll")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  expect(
    await page
      .locator(".trend-list")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("summarizes unavailable solar fields without three empty cards", async ({
  page,
}) => {
  await page.route("**/api/v1/weather", (route) =>
    route.fulfill({
      json: {
        ...weather,
        daily: weather.daily.map((day) => ({
          ...day,
          sunrise: null,
          sunset: null,
          uv_index_max: null,
        })),
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".solar-values")).toHaveCount(0);
  await expect(page.locator(".solar-unavailable")).toContainText(
    "Sunrise, sunset, and a comparable daily UV forecast",
  );
});

test("distinguishes same-name places, copies a safe place link and removes a recent place", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/v1/locations", (route) =>
    route.fulfill({
      json: [
        {
          id: 101,
          name: "Springfield",
          admin1: "Illinois",
          country: "United States",
          latitude: 39.78,
          longitude: -89.64,
        },
        {
          id: 102,
          name: "Springfield",
          admin1: "Massachusetts",
          country: "United States",
          latitude: 42.1,
          longitude: -72.59,
        },
      ],
    }),
  );
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "FIND A LOCATION" })
    .fill("Springfield");
  await page
    .getByRole("option", { name: "Springfield, Massachusetts, United States" })
    .click();
  await expect(page).toHaveURL(/place_id=102/);
  await expect(
    page.getByRole("heading", { name: /Springfield.*Massachusetts/ }),
  ).toBeVisible();
  await page.evaluate(() =>
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}&latitude=24.8608`,
    ),
  );
  const cardBeforeCopy = await page.locator(".hero-weather").boundingBox();
  await page.getByRole("button", { name: "Copy place link" }).click();
  await expect(page.getByText(/Place link copied/)).toBeVisible();
  await expect(page.locator(".feedback-toast")).toHaveCSS("position", "fixed");
  const cardAfterCopy = await page.locator(".hero-weather").boundingBox();
  expect(cardAfterCopy?.y).toBe(cardBeforeCopy?.y);
  const copied = new URL(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(copied.searchParams.get("place_id")).toBe("102");
  expect(copied.searchParams.has("latitude")).toBe(false);
  await page
    .getByRole("button", {
      name: "Remove Springfield, Massachusetts, United States from recent places",
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Springfield, Massachusetts, United States from recent places",
    }),
  ).toHaveCount(0);
});

test("keeps recent places on one reserved row without shifting the forecast", async ({
  page,
}) => {
  await page.route("**/api/v1/locations", (route) =>
    route.fulfill({
      json: [
        {
          id: 101,
          name: "Springfield",
          admin1: "Illinois",
          country: "United States",
          latitude: 39.78,
          longitude: -89.64,
        },
        {
          id: 102,
          name: "Springfield",
          admin1: "Massachusetts",
          country: "United States",
          latitude: 42.1,
          longitude: -72.59,
        },
      ],
    }),
  );
  await page.goto("/");
  await expect(page.locator(".recent-locations")).toContainText(
    "Places you choose will appear here.",
  );
  const initialHeight = await page
    .locator(".search-area")
    .evaluate((element) => element.getBoundingClientRect().height);
  const initialCard = await page.locator(".hero-weather").boundingBox();
  const search = page.getByRole("combobox", { name: "FIND A LOCATION" });
  await search.fill("Springfield");
  await page
    .getByRole("option", { name: "Springfield, Massachusetts, United States" })
    .click();
  await search.fill("Springfield");
  await page
    .getByRole("option", { name: "Springfield, Illinois, United States" })
    .click();
  await expect(page.locator(".recent-place")).toHaveCount(2);
  const recentList = page.getByRole("region", {
    name: "Recently searched locations",
  });
  await expect(recentList).toHaveCSS("scrollbar-width", "none");
  await page
    .getByRole("button", { name: "Scroll recent places right" })
    .click();
  await expect
    .poll(() => recentList.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Scroll recent places left" }).click();
  await expect
    .poll(() => recentList.evaluate((element) => element.scrollLeft))
    .toBe(0);
  const finalHeight = await page
    .locator(".search-area")
    .evaluate((element) => element.getBoundingClientRect().height);
  const finalCard = await page.locator(".hero-weather").boundingBox();
  expect(finalHeight).toBe(initialHeight);
  expect(finalCard?.y).toBe(initialCard?.y);
  expect(
    await page
      .locator(".recent-locations")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
});

test("announces search progress without displaying its loading text", async ({
  page,
}) => {
  await page.route("**/api/v1/locations", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: [] });
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "FIND A LOCATION" }).fill("London");
  const status = page.locator(".search-area [role=status]");
  await expect(status).toContainText("Searching places");
  await expect(status).toHaveClass(/sr-only/);
});

test("clears browser preferences and confirms what was removed", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("combobox", { name: "FIND A LOCATION" }).fill("London");
  await page
    .getByRole("option", { name: /London, England, United Kingdom/ })
    .click();
  await page.getByRole("button", { name: "°F" }).click();
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".recent-place")).toHaveCount(1);

  await page.getByRole("button", { name: "Clear saved data" }).click();
  await expect(
    page.getByText(
      "Saved units, recent places, and theme choice cleared from this browser.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "°C" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".recent-place")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /London/ })).toBeVisible();
  expect(
    await page.evaluate(() =>
      [
        "weather-glint-recent",
        "weather-glint-units",
        "weather-glint-theme",
        "atmos-recent",
        "atmos-units",
      ].map((key) => localStorage.getItem(key)),
    ),
  ).toEqual([null, null, null, null, null]);
});

test("keeps long right-to-left place names readable at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/api/v1/locations", (route) =>
    route.fulfill({
      json: [
        {
          id: 900,
          name: "مدينة طويلة الاسم للاختبار مدينة طويلة الاسم",
          admin1: "منطقة طويلة الاسم",
          country: "بلد تجريبي",
          latitude: 25,
          longitude: 55,
        },
      ],
    }),
  );
  await page.goto("/");
  await page.getByRole("combobox", { name: "FIND A LOCATION" }).fill("مدينة");
  const option = page.getByRole("option", { name: /مدينة طويلة الاسم/ });
  await expect(option.locator("[dir=auto]")).toBeVisible();
  await option.click();
  const heading = page.getByRole("heading", { name: /مدينة طويلة الاسم/ });
  await expect(heading).toHaveAttribute("dir", "auto");
  await expect(heading).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("explains geolocation denial without saving coordinates", async ({
  page,
  context,
}) => {
  await context.grantPermissions([]);
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "FIND A LOCATION" });
  await search.focus();
  await expect(search).toHaveCSS("outline-style", "none");
  const searchBoxBefore = await page.locator(".search-box").boundingBox();
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.locator(".search-hint[role=alert]")).toContainText(
    "Location access was denied or unavailable",
  );
  const searchBoxAfter = await page.locator(".search-box").boundingBox();
  expect(searchBoxAfter?.y).toBe(searchBoxBefore?.y);
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("weather-glint-recent")),
  ).toBeNull();
});

test("keeps the refresh action steady while a forecast request is pending", async ({
  page,
}) => {
  let requests = 0;
  let releaseRefresh: (() => void) | undefined;
  await page.route("**/api/v1/weather", async (route) => {
    requests += 1;
    if (requests === 2)
      await new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
    await route.fulfill({ json: weather });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  const refresh = page.locator(".forecast-refresh");
  const copy = page.getByRole("button", { name: "Copy place link" });
  const refreshBefore = await refresh.boundingBox();
  const copyBefore = await copy.boundingBox();
  try {
    await refresh.click();
    await expect(refresh).toHaveText("Refreshing…");
    const refreshDuring = await refresh.boundingBox();
    const copyDuring = await copy.boundingBox();
    expect(refreshDuring?.x).toBe(refreshBefore?.x);
    expect(refreshDuring?.width).toBe(refreshBefore?.width);
    expect(copyDuring?.x).toBe(copyBefore?.x);
  } finally {
    releaseRefresh?.();
  }
  await expect(refresh).toHaveText("Refresh forecast");
});

test("shows an actionable provider error", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/weather", (route) => {
    requests += 1;
    return requests === 1
      ? route.fulfill({
          status: 503,
          json: {
            error: "provider_unavailable",
            message: "Weather is unavailable.",
          },
        })
      : route.fulfill({ json: weather });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn't load the weather" }),
  ).toBeVisible();
  await expect(page.locator(".forecast-announcement")).toHaveText(
    "Forecast unavailable for Karachi.",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await expect(page.locator(".forecast-announcement")).toContainText(
    "forecast for Karachi.",
  );
});

test("switches units without blanking or refetching the forecast", async ({
  page,
}) => {
  let weatherRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/weather")) weatherRequests += 1;
  });
  await page.goto("/");
  await expect(page.getByText("Feels like 36°C")).toBeVisible();
  expect(weatherRequests).toBe(1);
  await page.getByRole("button", { name: "°F" }).click();
  await expect(page.getByText("Feels like 97°F")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await page.getByRole("button", { name: "°C" }).click();
  await expect(page.getByText("Feels like 36°C")).toBeVisible();
  expect(weatherRequests).toBe(1);
});

test("defaults to device appearance and remembers explicit choices", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Toggle color theme" });
  await expect(toggle).toHaveAttribute("aria-describedby", "theme-help");
  await expect(toggle).toHaveCSS("width", "48px");
  await expect(toggle.locator(".theme-icon-sun")).toBeVisible();
  await expect(toggle.locator(".theme-icon-moon")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("weather-glint-theme")),
  ).toBeNull();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle.locator(".theme-icon-moon")).toBeVisible();
  await expect(toggle.locator(".theme-icon-sun")).toBeHidden();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() => localStorage.getItem("weather-glint-theme")),
  ).not.toBeNull();
  await page.goto("/data-use");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("uses nighttime symbols and never displays a percent sign for missing rain", async ({
  page,
}) => {
  await page.route("**/api/v1/weather", (route) =>
    route.fulfill({
      json: {
        ...weather,
        hourly: weather.hourly.map((hour, index) => ({
          ...hour,
          weather_code: 0,
          condition: "Clear sky",
          is_day: index === 0,
          precipitation_probability_percent: null,
        })),
        daily: weather.daily.map((day) => ({
          ...day,
          precipitation_probability_max_percent: null,
        })),
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hourly forecast" }),
  ).toBeVisible();
  const hours = page.locator(".hourly-item");
  await expect(hours.nth(0).locator(".hour-icon")).toHaveText("☀");
  await expect(hours.nth(1).locator(".hour-icon")).toHaveText("☾");
  await expect(page.getByText("—%", { exact: true })).toHaveCount(0);
  await expect(hours.nth(0)).not.toContainText("Not available");
  await expect(
    page
      .locator(".hourly-panel")
      .getByText("Rain chance is not available from this forecast source."),
  ).toHaveCount(1);
});

test("shows a moon without clouds for a clear night", async ({ page }) => {
  await page.route("**/api/v1/weather", (route) =>
    route.fulfill({
      json: {
        ...weather,
        current: {
          ...weather.current,
          is_day: false,
          weather_code: 0,
          condition: "Clear sky",
        },
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Night-Time")).toBeVisible();
  await expect(page.locator(".moon-disc")).toBeVisible();
  await expect(page.locator(".sun-disc")).toHaveCount(0);
  await expect(page.locator(".hero-art .cloud")).toHaveCount(0);
});

test("keeps the last successful forecast visibly stale after a failed refresh", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/v1/weather", (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ json: weather })
      : route.fulfill({
          status: 503,
          json: {
            error: "provider_unavailable",
            message: "Weather is unavailable.",
          },
        });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await page.getByRole("button", { name: "Refresh forecast" }).click();
  await expect(
    page.getByText(/Showing the last available forecast/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
});

test("clears a stale badge after a successful cached forecast refresh", async ({
  page,
}) => {
  const earlier = new Date(Date.now() - 20 * 60_000).toISOString();
  let requests = 0;
  await page.route("**/api/v1/weather", (route) => {
    requests += 1;
    return route.fulfill({
      json: {
        ...weather,
        generated_at: requests === 1 ? earlier : new Date().toISOString(),
      },
    });
  });

  await page.goto("/");
  await expect(page.locator(".forecast-state")).toHaveText("Stale forecast");
  const before = await page.locator(".forecast-meta").textContent();
  await page.getByRole("button", { name: "Refresh forecast" }).click();
  await expect(page.locator(".forecast-state")).toHaveText(
    "Forecast available",
  );
  await expect(page.locator(".forecast-meta")).toContainText(
    "less than a minute old",
  );
  expect(await page.locator(".forecast-meta").textContent()).not.toBe(before);
  expect(requests).toBe(2);
});

test("marks offline data stale and recovers when connectivity returns", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText(/You are offline. Reconnect/)).toBeVisible();
  await expect(page.locator(".forecast-state")).toHaveText("Stale forecast");
  await expect(
    page.getByRole("button", { name: "Refresh forecast" }),
  ).toBeDisabled();
  await page.context().setOffline(false);
  await expect(
    page.getByRole("button", { name: "Refresh forecast" }),
  ).toBeEnabled();
});

test("preserves the last forecast through provider throttling and clears the warning after recovery", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/v1/weather", (route) => {
    requests += 1;
    return requests === 2
      ? route.fulfill({
          status: 503,
          json: {
            error: "provider_rate_limited",
            message: "Provider is busy.",
          },
        })
      : route.fulfill({
          json: { ...weather, generated_at: new Date().toISOString() },
        });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await page.getByRole("button", { name: "Refresh forecast" }).click();
  await expect(
    page.getByText(/Showing the last available forecast/),
  ).toBeVisible();
  await expect(page.locator(".forecast-state")).toHaveText("Stale forecast");
  await page.getByRole("button", { name: "Refresh forecast" }).click();
  await expect(page.locator(".forecast-state")).toHaveText(
    "Forecast available",
  );
  await expect(
    page.getByText(/Showing the last available forecast/),
  ).toHaveCount(0);
});

test("supports keyboard search and a narrow 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "FIND A LOCATION" });
  await search.fill("London");
  await expect(
    page.getByRole("option", { name: /London, England, United Kingdom/ }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: /London/ })).toBeVisible();
  await expect(page).toHaveURL(/place_id=2643743/);
  await expect(
    page.getByRole("heading", { name: "Hourly forecast" }),
  ).toBeVisible();
  const degrees = await page.locator(".hero-temp").boundingBox();
  const scale = await page
    .getByRole("group", { name: "Temperature units" })
    .boundingBox();
  expect(degrees).not.toBeNull();
  expect(scale).not.toBeNull();
  expect(scale!.x).toBeGreaterThan(degrees!.x);
  expect(Math.abs(scale!.y - degrees!.y)).toBeLessThan(35);
  const scroll = page.getByLabel("Scrollable 24-hour forecast");
  await scroll.focus();
  await expect(scroll).toBeFocused();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(320);
  expect(
    await scroll.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
});

test("keeps browser API values out of URLs and serves security headers", async ({
  page,
}) => {
  const apiRequests: Array<{ method: string; url: string; body: unknown }> = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) {
      apiRequests.push({
        method: request.method(),
        url: request.url(),
        body: request.postDataJSON(),
      });
    }
  });
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["permissions-policy"]).toContain(
    "geolocation=(self)",
  );
  await page.getByRole("combobox", { name: "FIND A LOCATION" }).fill("London");
  await expect(
    page.getByRole("option", { name: /London, England, United Kingdom/ }),
  ).toBeVisible();
  expect(apiRequests.length).toBeGreaterThanOrEqual(2);
  for (const request of apiRequests) {
    expect(request.method).toBe("POST");
    expect(new URL(request.url).search).toBe("");
  }
  expect(
    apiRequests.some((request) =>
      JSON.stringify(request.body).includes("London"),
    ),
  ).toBe(true);
});

test("has no automated text-contrast failures in forecast and error states", async ({
  page,
}) => {
  async function contrastViolations() {
    await page.addScriptTag({ content: axe.source });
    return page.evaluate(async () => {
      const engine = (window as typeof window & { axe: typeof axe }).axe;
      const result = await engine.run(document, {
        runOnly: { type: "rule", values: ["color-contrast"] },
      });
      return result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      }));
    });
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  expect(await contrastViolations()).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await contrastViolations()).toEqual([]);

  await page.route("**/api/v1/weather", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "provider_unavailable",
        message: "Weather is unavailable.",
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "We couldn't load the weather" }),
  ).toBeVisible();
  expect(await contrastViolations()).toEqual([]);

  await page.goto("/data-use");
  await expect(page).toHaveTitle("How location data is used | Weather Glint");
  await expect(
    page.getByRole("heading", { name: "How location data is used" }),
  ).toBeVisible();
  await expect(
    page.getByText(/operates the app from Karachi, Pakistan/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "farazhussain5000@gmail.com" }),
  ).toHaveAttribute("href", "mailto:farazhussain5000@gmail.com");
  expect(await contrastViolations()).toEqual([]);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await contrastViolations()).toEqual([]);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn't load the weather" }),
  ).toBeVisible();
  expect(await contrastViolations()).toEqual([]);
});

test("has no automated WCAG A/AA violations in key page states", async ({
  page,
}) => {
  async function violations() {
    await page.addScriptTag({ content: axe.source });
    return page.evaluate(async () => {
      const engine = (window as typeof window & { axe: typeof axe }).axe;
      const result = await engine.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      });
      return result.violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      }));
    });
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.getByRole("combobox", { name: "FIND A LOCATION" }).fill("London");
  await expect(page.getByRole("option", { name: /London/ })).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.goto("/data-use");
  expect(await violations()).toEqual([]);

  await page.route("**/api/v1/weather", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "provider_unavailable",
        message: "Weather is unavailable.",
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn't load the weather" }),
  ).toBeVisible();
  expect(await violations()).toEqual([]);
});

test("keeps controls usable with narrow reflow, text spacing, forced colors and reduced motion", async ({
  page,
}) => {
  for (const width of [640, 420, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("button", { name: "Refresh forecast" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear saved data" }),
    ).toBeVisible();
    const cards = page.locator(".metrics-grid .metric");
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (width <= 500)
      expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
    for (const card of await cards.all()) {
      const label = await card.locator(".metric-label").boundingBox();
      const icon = await card.locator(".metric-icon").boundingBox();
      expect(label).not.toBeNull();
      expect(icon).not.toBeNull();
      expect(label!.x + label!.width).toBeLessThanOrEqual(icon!.x);
    }
    await page.goto("/data-use");
    await expect(
      page.getByRole("heading", { name: "How location data is used" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }

  await page.goto("/");
  await page.addStyleTag({
    content: `* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }`,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await expect(
    page.getByRole("combobox", { name: "FIND A LOCATION" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh forecast" }),
  ).toBeVisible();

  await page.emulateMedia({
    forcedColors: "active",
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  await page.getByRole("combobox", { name: "FIND A LOCATION" }).focus();
  await expect(page.locator(".search-box")).toHaveCSS("outline-style", "none");
  await expect(
    page.getByRole("button", { name: "Use my location" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh forecast" }).focus();
  await expect(
    page.getByRole("button", { name: "Refresh forecast" }),
  ).toHaveCSS("outline-style", "solid");
  await page.goto("/data-use");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await expect(
    page.getByRole("link", { name: "farazhussain5000@gmail.com" }),
  ).toBeVisible();
});

test("supports a keyboard-only path through the main forecast controls", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Weather Glint home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Toggle color theme" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Tab");
  const search = page.getByRole("combobox", { name: "FIND A LOCATION" });
  await expect(search).toBeFocused();
  await search.fill("London");
  await expect(page.getByRole("option", { name: /London/ })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: /London/ })).toBeVisible();
  await expect(page.locator(".forecast-announcement")).toContainText(
    "forecast for London.",
  );

  const units = page.getByRole("group", { name: "Temperature units" });
  await units.getByRole("button", { name: "°F" }).focus();
  await page.keyboard.press("Space");
  await expect(units.getByRole("button", { name: "°F" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const refresh = page.getByRole("button", { name: "Refresh forecast" });
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect(refresh).toBeEnabled();
  const trend = page.getByText("Compare the next 12 hours as a compact trend");
  await trend.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".trend-row")).toHaveCount(12);
  const hourly = page.getByLabel("Scrollable 24-hour forecast");
  await hourly.focus();
  const before = await hourly.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => hourly.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(before);
  await page.getByRole("button", { name: "Clear saved data" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/Saved units, recent places, and theme choice cleared/),
  ).toBeVisible();
});
