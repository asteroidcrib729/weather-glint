import { expect, test } from "@playwright/test";

async function upstreamCount(): Promise<number> {
  const response = await fetch(
    (process.env.MET_STUB_ORIGIN ?? "http://127.0.0.1:8123") + "/stats",
  );
  const stats = (await response.json()) as { weather_requests: number };
  return stats.weather_requests;
}

test("Next.js to FastAPI to MET adapter renders a forecast and caches refreshes", async ({
  page,
}) => {
  const before = await upstreamCount();
  const browserWeatherRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/weather"))
      browserWeatherRequests.push(request.url());
  });

  const initialWeatherResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/weather"),
  );
  await page.goto("/");
  const initialWeather = (await (await initialWeatherResponse).json()) as {
    generated_at: string;
  };
  await expect(page.getByRole("heading", { name: /Karachi/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hourly forecast" }),
  ).toBeVisible();
  await expect(page.locator(".hourly-item")).toHaveCount(24);
  await expect(page.locator(".day-row")).toHaveCount(7);
  await expect(
    page.getByText("Feels-like temperature not available"),
  ).toBeVisible();
  await expect(page.getByText("NEXT-HOUR PRECIPITATION")).toBeVisible();
  await expect(page.getByText("0.2 mm")).toBeVisible();
  await expect(page.locator(".solar-unavailable")).toContainText("MET Norway");
  await expect(page.locator(".solar-values")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "MET Norway" })).toHaveAttribute(
    "href",
    "https://api.met.no/doc/License",
  );
  if (process.env.MET_CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({
      path: "test-results/met-home-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/met-home-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    if ((await page.locator("html").getAttribute("data-theme")) !== "dark") {
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
      path: "test-results/met-home-dark.png",
      fullPage: true,
    });
  }
  expect(await upstreamCount()).toBe(before + 1);

  const refreshedWeatherResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/weather"),
  );
  await page.getByRole("button", { name: "Refresh forecast" }).click();
  const refreshedWeather = (await (await refreshedWeatherResponse).json()) as {
    generated_at: string;
  };
  await expect(
    page.getByRole("button", { name: "Refresh forecast" }),
  ).toBeEnabled();
  expect(Date.parse(refreshedWeather.generated_at)).toBeGreaterThan(
    Date.parse(initialWeather.generated_at),
  );
  expect(await upstreamCount()).toBe(before + 1);

  await page.getByRole("combobox", { name: "FIND A LOCATION" }).fill("London");
  await page.getByRole("option", { name: /London/ }).click();
  await expect(page.getByRole("heading", { name: /London/ })).toBeVisible();
  await expect(page.getByText("1.4 mm")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "7-day forecast" }),
  ).toBeVisible();
  expect(await upstreamCount()).toBe(before + 2);
  expect(browserWeatherRequests.length).toBeGreaterThanOrEqual(3);
  expect(
    browserWeatherRequests.every((url) => !url.includes("latitude=")),
  ).toBe(true);

  await page.goto("/data-use");
  await expect(
    page.getByRole("heading", { name: "How location data is used" }),
  ).toBeVisible();
  await expect(
    page.getByText(/asks Open-Meteo for matching places/),
  ).toBeVisible();
  await expect(page.getByText(/asks MET Norway for a forecast/)).toBeVisible();
  if (process.env.MET_CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({
      path: "test-results/met-data-use.png",
      fullPage: true,
    });
  }
});
