import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const frontend = process.cwd();
const root = resolve(frontend, "..");
const python =
  process.env.PYTHON ||
  join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
if (!existsSync(python)) {
  throw new Error(
    "Create the repository .venv before the MET integration test.",
  );
}

const children = [];
const selectedPorts = new Set();
async function freePort() {
  while (true) {
    const port = await new Promise((resolvePort, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Could not reserve a loopback port."));
          return;
        }
        server.close(() => resolvePort(address.port));
      });
    });
    if (!selectedPorts.has(port)) {
      selectedPorts.add(port);
      return port;
    }
  }
}
function launch(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Local server exited before " + url + " was ready.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* Wait for the local server. */
    }
    await delay(500);
  }
  throw new Error("Local server did not become ready: " + url);
}

try {
  const stubPort = await freePort();
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const stubOrigin = "http://127.0.0.1:" + stubPort;
  const backendOrigin = "http://127.0.0.1:" + backendPort;
  const frontendOrigin = "http://127.0.0.1:" + frontendPort;
  const stub = launch(
    python,
    [
      "-m",
      "uvicorn",
      "backend.tests.integration_stub:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(stubPort),
      "--no-access-log",
    ],
    root,
  );
  await waitFor(stubOrigin + "/stats", stub);

  const backend = launch(
    python,
    [
      "-m",
      "uvicorn",
      "backend.app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(backendPort),
      "--no-access-log",
    ],
    root,
    {
      MET_NORWAY_FORECAST_URL: stubOrigin + "/met",
      OPEN_METEO_GEOCODING_URL: stubOrigin + "/search",
      MET_NORWAY_PILOT_ON_STARTUP: "false",
    },
  );
  await waitFor(backendOrigin + "/api/v1/health", backend);

  const nextBinary = join(
    frontend,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const nextEnv = {
    API_PROXY_TARGET: backendOrigin,
    MET_INTEGRATION_BUILD: "1",
  };
  const build = launch(
    process.execPath,
    [nextBinary, "build", "--turbopack"],
    frontend,
    nextEnv,
  );
  const buildExit = await new Promise((resolveExit, reject) => {
    build.on("error", reject);
    build.on("exit", (status) => resolveExit(status ?? 1));
  });
  if (buildExit !== 0)
    throw new Error("MET integration production build failed.");

  const next = launch(
    process.execPath,
    [
      nextBinary,
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(frontendPort),
    ],
    frontend,
    nextEnv,
  );
  await waitFor(frontendOrigin + "/", next);

  const runner = launch(
    process.execPath,
    [
      join(frontend, "node_modules", "@playwright", "test", "cli.js"),
      "test",
      "--config",
      "playwright.met-integration.config.ts",
    ],
    frontend,
    {
      MET_STUB_ORIGIN: stubOrigin,
      MET_FRONTEND_ORIGIN: frontendOrigin,
    },
  );
  process.exitCode = await new Promise((resolveExit, reject) => {
    runner.on("error", reject);
    runner.on("exit", (status) => resolveExit(status ?? 1));
  });
} finally {
  for (const child of children.reverse()) child.kill();
}
