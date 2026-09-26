This is the Next.js frontend for Weather Glint. See the [repository README](../README.md) for setup, architecture, and test commands.

The frontend uses the App Router, React, and TypeScript. It calls the versioned FastAPI endpoints through relative `/api/v1/...` URLs. In local development, `next.config.ts` proxies those paths to the local backend. On Vercel, the same rewrite targets the Render HTTPS origin supplied by the build-time `API_PROXY_TARGET` environment variable.

Run `npm ci` and `npm run dev` here after starting the backend. Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before submitting changes. Browser tests require a production build and Playwright Chromium; run `npm run test:e2e` after installing the browser. Vercel must import this `frontend/` directory as the project root; see the [deployment guide](../development-plans/DEPLOYMENT.md).
