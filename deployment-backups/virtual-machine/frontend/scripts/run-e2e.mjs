import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const serverPath = join(process.cwd(), ".next", "standalone", "server.js");
if (!existsSync(serverPath)) {
  throw new Error("Run npm run build before npm run test:e2e.");
}

const server = spawn(process.execPath, [serverPath], {
  env: { ...process.env, PORT: "3100", HOSTNAME: "127.0.0.1" },
  stdio: "ignore",
  windowsHide: true,
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Next.js server stopped before becoming ready.");
    try {
      const response = await fetch("http://127.0.0.1:3100/");
      if (response.ok) { ready = true; break; }
    } catch { /* Server is still starting. */ }
    await delay(500);
  }
  if (!ready) throw new Error("Next.js server did not become ready within 30 seconds.");

  const runner = spawn(process.execPath, [join(process.cwd(), "node_modules", "@playwright", "test", "cli.js"), "test"], {
    stdio: "inherit",
    windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => {
    runner.on("error", reject);
    runner.on("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
} finally {
  server.kill();
}
