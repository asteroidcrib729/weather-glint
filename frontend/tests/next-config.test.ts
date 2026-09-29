import { afterEach, expect, it, vi } from "vitest";
import config from "../next.config";

afterEach(() => vi.unstubAllEnvs());

it("does not cover zoomed content with the development indicator", () => {
  expect(config.devIndicators).toBe(false);
});

it("routes production API requests to the configured Render origin", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("API_PROXY_TARGET", "https://example.onrender.com");
  await expect(config.rewrites?.()).resolves.toEqual([
    {
      source: "/api/:path*",
      destination: "https://example.onrender.com/api/:path*",
    },
  ]);
});

it("fails a Vercel build rather than silently routing to localhost", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("API_PROXY_TARGET", undefined);
  await expect(config.rewrites?.()).rejects.toThrow("Set API_PROXY_TARGET");
});

it("rejects a non-HTTPS or path-bearing public target", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("API_PROXY_TARGET", "http://example.onrender.com");
  await expect(config.rewrites?.()).rejects.toThrow("must use HTTPS");
  vi.stubEnv("API_PROXY_TARGET", "https://example.onrender.com/api");
  await expect(config.rewrites?.()).rejects.toThrow("must be an origin");
});
