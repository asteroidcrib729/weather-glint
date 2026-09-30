import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Home from "@/app/page";
import { ThemeProvider } from "@/components/theme-provider";
import { getWeather, searchLocations, type Weather } from "@/lib/weather";

const forecast: Weather = {
  location: { latitude: 24.8608, longitude: 67.0104 },
  timezone: "Asia/Karachi",
  generated_at: "2026-09-23T07:00:00Z",
  units: { temperature: "°C", wind_speed: "km/h", precipitation: "mm" },
  current: {
    time: "2026-09-23T12:15",
    temperature: 31,
    apparent_temperature: 36,
    humidity_percent: 69,
    precipitation: 2.54,
    wind_speed: 16.09344,
    wind_direction_degrees: 220,
    is_day: true,
    weather_code: 2,
    condition: "Partly cloudy",
  },
  hourly: [
    {
      time: "2026-09-23T12:00",
      temperature: 31,
      precipitation_probability_percent: 20,
      is_day: true,
      weather_code: 2,
      condition: "Partly cloudy",
    },
  ],
  daily: [
    {
      date: "2026-09-23",
      temperature_max: 35,
      temperature_min: 27,
      precipitation_probability_max_percent: 40,
      weather_code: 2,
      condition: "Partly cloudy",
    },
  ],
};

vi.mock("@/lib/weather", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/weather")>();
  return {
    ...original,
    getWeather: vi.fn().mockResolvedValue(null),
    searchLocations: vi.fn().mockResolvedValue([]),
  };
});

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  vi.mocked(getWeather).mockResolvedValue(forecast);
});

function renderDashboard() {
  return render(
    <ThemeProvider>
      <Home />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

it("migrates old-brand storage while scrubbing precise geolocation and invalid places", async () => {
  const city = {
    id: 2643743,
    name: "London",
    country: "United Kingdom",
    latitude: 51.5085,
    longitude: -0.1257,
  };
  localStorage.setItem(
    "atmos-recent",
    JSON.stringify([{ ...city, id: -1 }, city, { ...city, latitude: 1000 }]),
  );
  renderDashboard();
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem("weather-glint-recent") ?? "[]"),
    ).toEqual([{ location: city, savedAt: expect.any(Number) }]),
  );
  expect(localStorage.getItem("atmos-recent")).toBeNull();
});

it("recovers from corrupted recent-place storage", async () => {
  localStorage.setItem("weather-glint-recent", "not-json");
  renderDashboard();
  await waitFor(() =>
    expect(localStorage.getItem("weather-glint-recent")).toBeNull(),
  );
});

it("never persists or shares the exact browser location", async () => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: { latitude: 24.123456, longitude: 67.123456 },
        } as GeolocationPosition),
    },
  });
  renderDashboard();
  fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
  await waitFor(() =>
    expect(getWeather).toHaveBeenCalledWith(
      expect.objectContaining({ id: -1 }),
      "metric",
      expect.anything(),
    ),
  );
  expect(localStorage.getItem("weather-glint-recent")).toBeNull();
  expect(window.location.search).toBe("");
});

it("selects a search result with the keyboard and shares only its place ID", async () => {
  vi.mocked(searchLocations).mockResolvedValueOnce([
    {
      id: 2643743,
      name: "London",
      country: "United Kingdom",
      latitude: 51.5085,
      longitude: -0.1257,
    },
  ]);
  renderDashboard();
  const search = screen.getByRole("combobox", { name: "FIND A LOCATION" });
  fireEvent.change(search, { target: { value: "London" } });
  await screen.findByRole("option", { name: /London, United Kingdom/ });
  fireEvent.keyDown(search, { key: "Enter" });
  await waitFor(() =>
    expect(window.location.search).toContain("place_id=2643743"),
  );
  expect(window.location.search).not.toContain("51.5085");
  expect(localStorage.getItem("weather-glint-recent")).toContain("London");
});

it("switches every displayed unit immediately without another weather request", async () => {
  renderDashboard();
  await screen.findByText("Feels like 36°C");
  expect(getWeather).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "°F" }));
  expect(screen.getByText("Feels like 97°F")).toBeTruthy();
  expect(screen.getByText("WIND").closest(".metric")?.textContent).toContain(
    "10 mph",
  );
  expect(
    screen.getByText("PRECIPITATION").closest(".metric")?.textContent,
  ).toContain("0.1 in");
  expect(screen.getAllByText("88°").length).toBeGreaterThan(0);
  expect(getWeather).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "°C" }));
  expect(screen.getByText("Feels like 36°C")).toBeTruthy();
  expect(getWeather).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(localStorage.getItem("weather-glint-units") ?? "null"),
  ).toEqual({ value: "metric", savedAt: expect.any(Number) });
  expect(
    screen.getByRole("button", { name: "°C" }).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("clears both saved browser entries and resets units", async () => {
  localStorage.setItem(
    "atmos-recent",
    JSON.stringify([
      { id: 1, name: "London", country: "UK", latitude: 51.5, longitude: -0.1 },
    ]),
  );
  localStorage.setItem("atmos-units", "imperial");
  renderDashboard();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "°F" }).getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  expect(localStorage.getItem("atmos-units")).toBeNull();
  expect(localStorage.getItem("atmos-recent")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Toggle color theme" }));
  expect(localStorage.getItem("weather-glint-theme")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear saved data" }));
  expect(localStorage.getItem("weather-glint-recent")).toBeNull();
  expect(localStorage.getItem("weather-glint-units")).toBeNull();
  expect(localStorage.getItem("atmos-recent")).toBeNull();
  expect(localStorage.getItem("atmos-units")).toBeNull();
  expect(localStorage.getItem("weather-glint-theme")).toBeNull();
  expect(
    screen.getByRole("button", { name: "°C" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("stores explicit appearance and returns to the device default on clear", async () => {
  renderDashboard();
  const toggle = screen.getByRole("button", { name: "Toggle color theme" });
  expect(localStorage.getItem("weather-glint-theme")).toBeNull();
  fireEvent.click(toggle);
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(
    JSON.parse(localStorage.getItem("weather-glint-theme") ?? "null"),
  ).toEqual({ value: "dark", savedAt: expect.any(Number) });
  fireEvent.click(toggle);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(
    JSON.parse(localStorage.getItem("weather-glint-theme") ?? "null"),
  ).toEqual({ value: "light", savedAt: expect.any(Number) });
  fireEvent.click(screen.getByRole("button", { name: "Clear saved data" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("weather-glint-theme")).toBeNull();
});

it("removes expired browser entries on return to the app", async () => {
  const old = Date.now() - 200 * 24 * 60 * 60 * 1000;
  localStorage.setItem(
    "weather-glint-recent",
    JSON.stringify([
      {
        location: {
          id: 1,
          name: "London",
          country: "UK",
          latitude: 51.5,
          longitude: -0.1,
        },
        savedAt: old,
      },
    ]),
  );
  localStorage.setItem(
    "weather-glint-units",
    JSON.stringify({ value: "imperial", savedAt: old }),
  );
  renderDashboard();
  await waitFor(() => {
    expect(localStorage.getItem("weather-glint-recent")).toBeNull();
    expect(localStorage.getItem("weather-glint-units")).toBeNull();
  });
  expect(
    screen.getByRole("button", { name: "°C" }).getAttribute("aria-pressed"),
  ).toBe("true");
});
