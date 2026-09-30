// Synthetic render/interaction baseline only. API is mocked; use the runbook
// for real-device and deployed cold/warm measurements.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, devices } from "@playwright/test";

if (!existsSync(join(process.cwd(), ".next", "BUILD_ID")))
  throw new Error("Run npm run build first.");
const base = "http://127.0.0.1:3101";
const server = spawn(
  process.execPath,
  [
    join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3101",
  ],
  { stdio: "ignore", windowsHide: true },
);
const browser = await chromium.launch();

const stamp = new Date().toISOString();
const local = stamp.slice(0, 16);
const fixture = {
  location: { latitude: 24.8608, longitude: 67.0104 },
  timezone: "Asia/Karachi",
  generated_at: stamp,
  units: { temperature: "°C", wind_speed: "km/h", precipitation: "mm" },
  current: {
    time: local,
    temperature: 31,
    apparent_temperature: 35,
    humidity_percent: 60,
    precipitation: 0,
    wind_speed: 12,
    wind_direction_degrees: 220,
    is_day: true,
    weather_code: 0,
    condition: "Clear sky",
  },
  hourly: Array.from({ length: 24 }, (_, index) => ({
    time: new Date(Date.now() + index * 3_600_000).toISOString().slice(0, 16),
    temperature: 31,
    precipitation_probability_percent: 0,
    is_day: true,
    weather_code: 0,
    condition: "Clear sky",
  })),
  daily: Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      temperature_max: 34,
      temperature_min: 25,
      precipitation_probability_max_percent: 0,
      weather_code: 0,
      condition: "Clear sky",
      sunrise: `${date}T06:10`,
      sunset: `${date}T18:20`,
      uv_index_max: 8.4,
    };
  }),
};

function p75(values) {
  return values.sort((a, b) => a - b)[Math.ceil(values.length * 0.75) - 1];
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await delay(500);
  }
  if (!ready) throw new Error("Local production server did not start.");
  for (const [name, device] of [
    ["desktop", {}],
    ["mobile-emulated", devices["iPhone 13"]],
  ]) {
    const samples = [];
    for (let run = 0; run < 5; run++) {
      const context = await browser.newContext(device);
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__vitals = { lcp: 0, cls: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__vitals.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.route("**/api/v1/weather", (route) =>
        route.fulfill({ json: fixture }),
      );
      await page.route("**/api/v1/locations", (route) =>
        route.fulfill({
          json: [
            {
              id: 2643743,
              name: "London",
              country: "United Kingdom",
              latitude: 51.5085,
              longitude: -0.1257,
            },
          ],
        }),
      );
      await page.goto(base);
      await page.getByRole("heading", { name: /Karachi/ }).waitFor();
      const searchStart = Date.now();
      await page
        .getByRole("combobox", { name: "FIND A LOCATION" })
        .fill("London");
      await page.getByRole("option", { name: /London/ }).waitFor();
      const searchMs = Date.now() - searchStart;
      const response = page.waitForResponse((item) =>
        item.url().endsWith("/api/v1/weather"),
      );
      const refreshStart = Date.now();
      await page.getByRole("button", { name: "Refresh forecast" }).click();
      await response;
      const refreshMs = Date.now() - refreshStart;
      const vitals = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const jsBytes = performance
          .getEntriesByType("resource")
          .filter(
            (item) =>
              item.name.includes("/_next/static/") && item.name.endsWith(".js"),
          )
          .reduce((sum, item) => sum + item.encodedBodySize, 0);
        return {
          navigationMs: Math.round(navigation.duration),
          lcpMs: Math.round(window.__vitals.lcp),
          cls: window.__vitals.cls,
          jsBytes,
        };
      });
      samples.push({ ...vitals, searchMs, refreshMs });
      await context.close();
    }
    console.log(
      JSON.stringify({
        mode: name,
        runs: samples.length,
        p75: Object.fromEntries(
          Object.keys(samples[0]).map((key) => [
            key,
            p75(samples.map((sample) => sample[key])),
          ]),
        ),
      }),
    );
  }
} finally {
  await browser.close();
  server.kill();
}
