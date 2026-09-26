# Deployment guide: local preview and Vercel + Render

This is the active deployment guide. **Part A** runs a production-build preview on a laptop without Docker. **Part B** publishes the Next.js frontend on Vercel and the FastAPI backend on Render. Follow the parts separately; local preview does not create cloud resources. The [reliability runbook](RELIABILITY.md) covers forecast-age rules and recovery. The old Docker Compose/Caddy approach is preserved in the [VM restore kit](../deployment-backups/virtual-machine/README.md). Development plans use `development-plan-NN.md`; this runbook is not a numbered plan.

The browser always calls relative `/api/v1/...` URLs. Next.js rewrites those requests to local FastAPI in Part A or to the Render origin in Part B. The Render API is still publicly reachable at its own URL; the rewrite is routing, **not authentication or an access-control boundary**. The app has no accounts or API keys.

**Branch workflow:** Develop and push on `pre-production`, then open a pull request into `main`. The local checkout should remain on `pre-production`; GitHub's default branch need not change. For the first **public production** deployment below, merge the reviewed PR and select `main` in Render and Vercel. A deployment made directly from `pre-production` is a preview/test release until you deliberately change the platform's production branch. Merely pushing this repository does **not** create or configure either hosted service. [Vercel distinguishes Preview and Production branches](https://vercel.com/docs/git#production-branch), and a [Render Blueprint is linked to a selected Git branch](https://render.com/docs/infrastructure-as-code#setup).

## Part A — Local preview on the laptop

### A1. Prerequisites and checkout

1. Install Python 3.14, Node.js 24, [uv](https://docs.astral.sh/uv/), and npm. Use either native Windows or Ubuntu in WSL 2; install the tools **inside the environment where you run the commands**. Docker and Docker Desktop are not needed. In PowerShell, use `npm.cmd` if `npm.ps1` is blocked by execution policy.
2. Clone `https://github.com/asteroidcrib729/weather-app.git` if needed. In a new clone, run `git switch --track origin/pre-production`; in an existing clone, run `git switch pre-production`. Run `git status --short --branch` and ensure the first line names `pre-production`. Do not run these commands with unsaved local edits on another branch.
3. Open a shell at the repository root. Confirm `pyproject.toml`, `uv.lock`, `.python-version`, and `frontend/package-lock.json` exist. Check `uv --version`, `node --version`, and `npm --version`; `uv run python --version` should report 3.14 after the sync in A2. A WSL checkout under its Linux filesystem generally performs better than one under `/mnt/c/`.
4. Ensure ports 8000 and 3000 are free. The preview makes real outbound calls to Open-Meteo; it needs internet access. No provider key or local database is required.

### A2. Start the backend

In terminal 1, from the repository root, install the locked Python dependencies and start FastAPI. This is the preview command, not the hot-reloading development command:

```bash
uv sync --locked
uv run --locked python --version
uv run --locked uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --no-access-log --no-proxy-headers
```

Leave terminal 1 running. The two `--no-*` flags avoid routine URL access logs and prevent local clients from spoofing proxy headers. A repository-root `.env` file is optional; use [.env.example](../.env.example) only if overriding backend defaults, and never commit `.env`.

Verify the backend directly:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS -X POST -H 'Content-Type: application/json' -d '{"query":"Karachi","limit":1}' http://127.0.0.1:8000/api/v1/locations
```

The health response should include `"status":"ok"`; search verifies outbound provider access. In **PowerShell**, use the following equivalent commands instead of relying on `curl` alias/native quoting:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
Invoke-RestMethod http://127.0.0.1:8000/api/v1/locations -Method Post -ContentType 'application/json' -Body (@{ query = 'Karachi'; limit = 1 } | ConvertTo-Json -Compress)
```

### A3. Start the frontend

In terminal 2, enter `frontend/`, install exactly the lockfile dependencies, **build** Next.js, then start its production server:

```bash
npm ci
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

On native Windows, substitute `npm.cmd` for `npm` if necessary. Open `http://127.0.0.1:3000` or `http://localhost:3000`. Without `API_PROXY_TARGET`, `next.config.ts` rewrites `/api/*` to `http://127.0.0.1:8000/api/*`. If the backend uses another port, set `API_PROXY_TARGET` to that **origin only** (such as `http://127.0.0.1:8001`) **before `npm run build`** and use the same setting when starting Next.js; the rewrite is fixed at build time. Do not append `/api`, credentials, a query, or a trailing path. Do not set `VERCEL=1` for local builds. For browser geolocation, `localhost` is the most predictable local secure context; manual search works without permission.

### A4. Exercise the preview and stop

1. In a third terminal, request `http://127.0.0.1:3000/api/v1/health`; it should return the same `status: ok` as the backend. Use `curl -fsS` on WSL or `Invoke-RestMethod` on PowerShell. A 502/503 here with healthy direct backend usually means the frontend build points at the wrong `API_PROXY_TARGET` or the backend is not running.
2. In the browser, wait for Karachi weather, search for a different city, switch °C/°F, refresh, open `/data-use`, and test a place-sharing link. Try both granting and denying browser location permission; exact device coordinates should not appear in the share URL or recent places. Check that the footer credits Open-Meteo and GeoNames.
3. Run the checks in [README.md](../README.md#checks). `npm run test:e2e` is a separate automated suite: it starts its own production server on port 3100 with mocked API responses after `npm run build`; it does **not** verify live Open-Meteo or the already-running preview on port 3000. Install Playwright Chromium first if needed (`npx playwright install chromium`).
4. Stop the frontend and backend with Ctrl+C in terminals 2 and 1. There is no database or container to shut down. For ordinary coding with hot reload, use `npm run dev` and add `--reload` to the Uvicorn command; that is development mode, not this preview procedure.

Stop the dev servers with Ctrl+C in their respective terminals. There is no container or persistent application database to stop.

## Part B — Public deployment: Render API, then Vercel frontend

This path uses two managed services and does not require a VM, Caddy, Docker on the laptop, or Docker Desktop. The committed [render.yaml](../render.yaml) describes a Render **web service** built from the root-context [backend Dockerfile](../backend/Dockerfile). Vercel imports `frontend/` as a Next.js project. The backend container pins Python 3.14 and uses Render's `PORT` at runtime; Vercel should use Node.js 24.

The committed Render Blueprint selects the **Free** web-service plan. Render says Free services spin down after 15 idle minutes, can take about a minute to wake, have a monthly Free-instance-hour allowance, and are intended for hobby/testing rather than dependable production. Vercel's free Hobby plan is restricted to personal, non-commercial use. Limits, billing rules, plan availability, and provider terms can change: review [Render Free limitations](https://render.com/docs/free), [Vercel Hobby terms](https://vercel.com/docs/plans/hobby), and [Open-Meteo terms](https://open-meteo.com/en/terms) immediately before launch. A truly always-on backend requires a suitable paid plan or host. This guide does not promise zero cost or uptime.

### B1. Prepare the release

1. The old OpenWeather key was revoked two years ago, as confirmed by Faraz Hussain after a GitGuardian alert. Its old value may remain in Git history, but no further rotation is pending; never put it in either platform's environment settings.
2. The owner has deferred qualified privacy/legal review. Do not describe this release as legally compliant or the `/data-use` page as a reviewed privacy notice. Before launch, check that its factual description of operator/contact (**Faraz Hussain, Karachi, Pakistan; [farazhussain5000@gmail.com](mailto:farazhussain5000@gmail.com)**), browser storage, provider requests, and known retention still matches the app; inspect live hosting settings when available. Worldwide legal obligations remain an open risk for the owner to assess, and a license does not resolve them. See the [audit update](AUDIT.md#13-owner-confirmation-and-phase-1-research-2026-09-24).
3. Run the backend checks, frontend lint/type/unit tests, production build, and Playwright tests in the repository README. Resolve failures before publishing.
4. Review `git status --short --branch`, [licenses](../LICENSE.md), [third-party credits](../THIRD_PARTY_NOTICES.md), `render.yaml`, Next.js config, and both lockfiles. On `pre-production`, push with `git push -u origin pre-production`. On GitHub choose **Pull requests → New pull request**, set **base: `main`** and **compare: `pre-production`**, wait for CI, review, and merge. Do not deploy the old `main` before the merge. In GitHub, record the merge commit's hash; a local `main` may still be stale because this workflow deliberately keeps the local checkout on `pre-production`. **Git imports cannot deploy uncommitted local files.** Keep developing on `pre-production` and use further PRs.
5. Create or sign in to Render and Vercel, connect GitHub with access to this repository, and confirm the chosen plans and any payment method/spend limits. A payment method can change how usage overages are handled. No domain purchase is required for initial `onrender.com` and `vercel.app` URLs. Do not create duplicate Render Blueprints for one service.

### B2. Deploy the FastAPI service on Render first

1. After the PR has merged, open the [Render Dashboard](https://dashboard.render.com/) and choose **New > Blueprint**. Connect this GitHub repository using the Git-provider integration, select branch **`main`** for the public service, and keep Blueprint Path `render.yaml` at repository root. A Blueprint on `pre-production` instead follows that branch and is only a preview/test service. If an existing Blueprint already manages `atmos-weather-api`, update it rather than creating a second manager. Review the proposed resources and select **Deploy Blueprint**. [Render's Blueprint setup guide](https://render.com/docs/infrastructure-as-code) explains branch selection.
2. Before confirming creation, check that it will create **one Web Service**, with `runtime: docker`, the chosen `plan: free`, Dockerfile path `backend/Dockerfile`, build context `.`, and HTTP health-check path `/api/v1/health`. Do not set a Render root directory to `backend`: the Dockerfile copies root-level `pyproject.toml`, `uv.lock`, and `README.md`. The container binds `0.0.0.0:$PORT`, disables Uvicorn access/proxy-header handling, and installs locked dependencies on Python 3.14. Watch Build and Deploy logs until health checks pass. [Render's port](https://render.com/docs/web-services) and [HTTP health-check](https://render.com/docs/health-checks) rules apply.
3. Wait until the deployment is live and copy its exact HTTPS origin, for example `https://atmos-weather-api.onrender.com`. The Blueprint retains `atmos-weather-api` as a legacy infrastructure identifier so an existing Render service is not unintentionally replaced during the Weather Glint rebrand. It does not affect the app's public name. The hostname may differ if Render assigns or you choose another one. Do not add `/api` to this origin.
4. From your laptop, verify the public API directly. Replace the example origin:

   ```bash
   curl -fsS https://YOUR-SERVICE.onrender.com/api/v1/health
   curl -fsS -X POST -H 'Content-Type: application/json' -d '{"query":"Karachi","limit":1}' https://YOUR-SERVICE.onrender.com/api/v1/locations
   curl -fsS -X POST -H 'Content-Type: application/json' -d '{"latitude":24.8608,"longitude":67.0104,"units":"metric"}' https://YOUR-SERVICE.onrender.com/api/v1/weather
   ```

   Health checks prove only that the application responds; search and weather calls also test Open-Meteo. In PowerShell, set `$renderOrigin = 'https://YOUR-SERVICE.onrender.com'` and use `Invoke-RestMethod` as shown in B4, replacing the base URL. If the first request is slow, wait for a Free service wake-up and check its Deploys/Logs before diagnosing an application failure.

5. Leave the Open-Meteo URL defaults unless intentionally using approved endpoints. `RATE_LIMIT_PER_MINUTE` defaults to 120 per process. `ALLOWED_ORIGINS` is only for direct cross-origin browser calls; the intended browser path is Vercel's same-origin rewrite, so changing it is optional. If direct browser calls are needed, set exact HTTPS origins after Vercel gives you its URL; CORS is **not authentication**. Never set the revoked OpenWeather key. Check Render Environment, billing/usage, and log-retention settings; do not paste real coordinates or private data into support tickets. See [Render's environment-variable guide](https://render.com/docs/configure-environment-variables).

### B3. Deploy the Next.js frontend on Vercel

1. After the merge, in the [Vercel Dashboard](https://vercel.com/dashboard), select **Add New > Project** and import the **same Git repository**. Set **Root Directory** to `frontend` before deploying. Confirm Framework Preset **Next.js**; use Node.js **24.x** in project settings and the lockfile-driven npm install. Leave standard output detection in place; `npm run build` uses Turbopack. This is a Next.js server deployment, not a static export or Docker bundle. See [Vercel's monorepo guide](https://vercel.com/docs/monorepos).
2. Check **Settings → Environments → Production → Branch Tracking**: it should point to **`main`**, which now contains the merged app. Vercel normally chooses `main` when present; verify rather than assume. Commits pushed to `pre-production` should produce **Preview** deployments, not change the public production URL. See [Vercel's branch rules](https://vercel.com/docs/git#production-branch).
3. **Before the first build**, add the project environment variable `API_PROXY_TARGET` with the exact Render HTTPS **origin** from B2 (for example `https://YOUR-SERVICE.onrender.com`). Select **Production**, and also **Preview** if PR previews should use that API. Do not append `/api`, a slash-path, query, or credentials. Do not prefix the variable with `NEXT_PUBLIC_`; the browser calls relative URLs. The config rejects missing/invalid targets when running on Vercel. Environment changes only affect **new** deployments; redeploy after changing a value. See [Vercel's environment-variable guide](https://vercel.com/docs/environment-variables).
4. Deploy and wait for a successful build. `next.config.ts` rewrites `/api/:path*` to `${API_PROXY_TARGET}/api/:path*`, keeping the Vercel hostname in browser requests. This is routing, not API secrecy. Copy the production `https://YOUR-PROJECT.vercel.app` URL. If you chose to set `ALLOWED_ORIGINS` for **direct** Render calls, update it to the exact Vercel origin and redeploy the backend; Preview URLs need not be added solely for same-origin rewrites. [Next.js documents external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).

### B4. Verify the public path end to end

Replace the example Vercel hostname. Test the rewrite and provider integration **through Vercel**, not only directly through Render:

```bash
curl -fsS https://YOUR-PROJECT.vercel.app/api/v1/health
curl -fsS -X POST -H 'Content-Type: application/json' -d '{"query":"Karachi","limit":1}' https://YOUR-PROJECT.vercel.app/api/v1/locations
curl -fsS -X POST -H 'Content-Type: application/json' -d '{"latitude":24.8608,"longitude":67.0104,"units":"metric"}' https://YOUR-PROJECT.vercel.app/api/v1/weather
```

Open the Vercel page in a browser and test initial weather, place search, unit switch, manual refresh, browser-location permission/denial, a shared place URL, and the stale-data state. Confirm the page and API requests use HTTPS and that the browser requests `/api/v1/...` on the Vercel hostname. A direct Render URL remains public for diagnostics; never treat CORS or the rewrite as a secret firewall.

For **PowerShell**, use `Invoke-RestMethod` to avoid shell-specific JSON quoting. Replace both example origins before running; these are public city coordinates, not device-location data:

```powershell
$renderOrigin = 'https://YOUR-SERVICE.onrender.com'
$vercelOrigin = 'https://YOUR-PROJECT.vercel.app'
Invoke-RestMethod "$renderOrigin/api/v1/health"
Invoke-RestMethod "$renderOrigin/api/v1/locations" -Method Post -ContentType 'application/json' -Body (@{ query = 'Karachi'; limit = 1 } | ConvertTo-Json -Compress)
Invoke-RestMethod "$renderOrigin/api/v1/weather" -Method Post -ContentType 'application/json' -Body (@{ latitude = 24.8608; longitude = 67.0104; units = 'metric' } | ConvertTo-Json -Compress)
Invoke-RestMethod "$vercelOrigin/api/v1/health"
Invoke-RestMethod "$vercelOrigin/api/v1/locations" -Method Post -ContentType 'application/json' -Body (@{ query = 'Karachi'; limit = 1 } | ConvertTo-Json -Compress)
Invoke-RestMethod "$vercelOrigin/api/v1/weather" -Method Post -ContentType 'application/json' -Body (@{ latitude = 24.8608; longitude = 67.0104; units = 'metric' } | ConvertTo-Json -Compress)
```

Check these user journeys at the **production Vercel URL** after the backend is awake:

1. Open `/` and `/data-use` directly; both should load, and the weather should eventually show a current-conditions time. Open Chrome Reading Mode *after* each page loads if checking its extracted text. A full-document link closes Reading Mode by design; reopen it on the destination.
2. Search for a city; choose one result with mouse, and another with keyboard (Tab, text entry, arrow, Enter). Check an invalid/no-results search, recent-place removal, and that a shared place URL resolves without containing exact device coordinates.
3. Switch units without a blank forecast or second fetch, toggle theme, refresh the forecast, and inspect the timestamp/stale notice. Deny device-location permission and confirm manual search still works. For a failure scenario, disconnect locally or use a disposable preview; do not deliberately break the live Render service.
4. In browser DevTools **Network**, confirm browser search and weather requests use `POST /api/v1/...` on the Vercel hostname over HTTPS. The Render origin remains reachable directly; the Open-Meteo upstream API and compatibility GET routes can still use query parameters. Confirm the visible Open-Meteo/GeoNames/CC BY attribution.
5. Check the response headers of the main page and API with `curl -I` in WSL or `(Invoke-WebRequest $vercelOrigin).Headers` in PowerShell. Confirm the configured CSP, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on the page, and a request ID on API responses. Compare actual behavior with the source config, not just a dashboard green check.

Inspect both platforms' request logging settings and update the public data-use text to match verified behavior. A complete, legally reviewed privacy notice remains open work; do not claim one exists. Browser searches and weather requests use JSON POST bodies without location data in their URLs, but the compatibility GET routes and Open-Meteo provider calls still use URL query parameters. The backend disables Uvicorn access logs and logs only paths in its own request event; upstream edge/proxy and provider logging require separate review. Confirm the deployed footer links to Open-Meteo, GeoNames, and CC BY 4.0. The old OpenWeather credential must remain revoked.

The backend explicitly ignores `X-Forwarded-*` headers in Uvicorn. Its rate limiter expects Render's ingress to supply an owned `CF-Connecting-IP` value, falling back to the connection peer if missing or invalid. This ownership assumption still needs **live verification**; source code alone does not prove what the edge overwrites. Do not re-enable wildcard forwarded-header trust. Vercel-rewritten requests may share a proxy egress IP and rate-limit bucket. If you create a disposable preview deployment, test spoof resistance there with a temporarily low `RATE_LIMIT_PER_MINUTE` and harmless requests carrying different forged forwarding-header values; check that changing the headers does not evade throttling, then restore the normal limit. Never perform a disruptive throttle test on the public service or use real device coordinates.

### B5. Operate, update, and roll back

- Monitor Render health, deploy/log status, representative search/weather requests, Vercel deployment status, and the user-facing page. Render's Free service can sleep and its in-memory cache/rate limiter resets on restart; no database or Redis is used. If predictable first-request latency is required, change to a suitable paid plan instead of attempting to keep a Free instance artificially awake.
- For an update, commit and push on local `pre-production`, check CI and its Vercel Preview deployment, then merge a PR into `main`; verify **both** production platform deployments after merge. Render may auto-deploy from its linked branch on each push. If the backend API contract changes, make it backward compatible across the two independent deployments and keep the generated TypeScript contract in sync with `uv run python -m backend.scripts.check_api_types --write` before committing.
- To recover from a bad release, use the platforms' deployment/rollback controls or redeploy a known-good Git commit, then re-test the three public `/api/v1` routes. Render's Free rollback history is limited; record a known-good commit yourself. Changing the Vercel env variable requires another frontend deployment. Do not use `git reset --hard` to discard local work.
- To revert **the deployment approach** rather than only a release, follow the [VM restore kit](../deployment-backups/virtual-machine/README.md). Restoring files does not shut down Vercel or Render resources; disconnect or decommission those services and their domains deliberately in the dashboards.

### B6. Troubleshooting

| Symptom | Check |
| --- | --- |
| Vercel build fails with `API_PROXY_TARGET` error | Set the Production/Preview environment variable to the Render HTTPS origin only, then redeploy. |
| Page loads but `/api/v1/health` fails on Vercel | Check the generated rewrite, Render service URL, Render health, and whether `API_PROXY_TARGET` was present during that deployment's build. |
| Direct Render health works but weather/search fails | Inspect backend logs and outbound access or limits for both Open-Meteo endpoints. Health does not call the provider. |
| First weather request takes a long time | Check whether the Render Free instance spun down after idle; review [Free service behavior](https://render.com/docs/free). |
| Browser location fails | Use HTTPS, check browser/device permission, and keep manual place search available. |
| Direct browser call to Render has a CORS error | Add the exact browser origin to `ALLOWED_ORIGINS`, or use the intended same-origin Vercel `/api/v1/...` path. CORS is not API authentication. |
| Vercel shows the old internship app or cannot find `frontend/package.json` | Confirm the PR was merged to the tracked Production branch and Vercel Root Directory is `frontend`; redeploy the correct commit. |
| Render Docker build cannot find root lockfiles | Keep Docker build context `.` and no `backend` root-directory override; confirm the selected Git branch contains `pyproject.toml` and `uv.lock`. |
| API returns `429` through Vercel while direct Render use seems fine | Inspect rate-limit settings and whether rewritten requests share a proxy address; wait for the 60-second window and verify with non-sensitive requests. |
| No new deployment after changing a Vercel environment variable | Redeploy or push a new commit; existing deployments retain the values used at build time. |
