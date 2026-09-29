import type { NextConfig } from "next";

function apiOrigin(): string {
  const configured = process.env.API_PROXY_TARGET;
  if (!configured && process.env.VERCEL) {
    throw new Error(
      "Set API_PROXY_TARGET to the HTTPS Render service origin in Vercel.",
    );
  }

  const target = new URL(configured ?? "http://127.0.0.1:8000");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (
    target.protocol !== "https:" &&
    !(local && target.protocol === "http:" && !process.env.VERCEL)
  ) {
    throw new Error(
      "API_PROXY_TARGET must use HTTPS outside local development.",
    );
  }
  if (
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "API_PROXY_TARGET must be an origin without credentials, path, query, or fragment.",
    );
  }
  return target.origin;
}

const nextConfig: NextConfig = {
  distDir:
    process.env.MET_INTEGRATION_BUILD === "1"
      ? ".next-met-integration"
      : undefined,
  reactCompiler: true,
  // The development badge obscures content in long full-page zoom captures.
  devIndicators: false,
  async headers() {
    const development = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self'${development ? " ws: wss:" : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiOrigin()}/api/:path*` },
    ];
  },
};

export default nextConfig;
