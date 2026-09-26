# Weather Glint

Original project code is available under MIT; original artwork and documentation are available under CC BY 4.0, with credit to Faraz Hussain. See [LICENSE.md](LICENSE.md) and [third-party credits](THIRD_PARTY_NOTICES.md). Weather and location data retain their providers' terms.

Phase 2 reliability rules, operating metrics, performance baseline, and the still-pending live release checks are in [the reliability runbook](development-plans/RELIABILITY.md). Recent changes are in [CHANGELOG.md](CHANGELOG.md).

Remaining product work is tracked in [Development Plan 03](development-plans/development-plan-03.md#open-problems).

A weather application with a FastAPI backend and a Next.js frontend. It shows current conditions, the next 24 hours, and a seven-day forecast. Weather comes from [Open-Meteo](https://open-meteo.com/); place search uses its [GeoNames-based geocoding service](https://open-meteo.com/en/docs/geocoding-api). The service is public and has no authentication.

The original internship script has been removed. The current application does not need an API key.

## Requirements

- Python 3.14 (required; pinned in `.python-version`)
- Node.js 24 LTS
- [uv](https://docs.astral.sh/uv/)
- npm 11 (included with Node.js 24)

## Run locally

From the repository root:

```bash
uv sync --locked
uv run uvicorn backend.app.main:app --reload --port 8000 --no-access-log
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. Next.js proxies `/api/*` to FastAPI at `http://127.0.0.1:8000` during development. Set `API_PROXY_TARGET` in the frontend process if your API runs elsewhere. FastAPI's interactive API documentation is at `http://localhost:8000/docs`.

The frontend uses Next.js App Router with React Compiler, TypeScript, Tailwind CSS, ESLint, and Turbopack for development and production builds.
Frontend styling is Tailwind-first: put layout, responsive, state, and theme styles in component utility classes. `frontend/src/app/globals.css` is reserved for the Tailwind import, the `data-theme` dark variant, and the shared keyboard-focus indicator. The only inline style sets the data-driven width of the hourly trend bar.

Search a place with the keyboard or mouse. Selecting a searched place adds its name and provider ID to a shareable URL; it does not put its coordinates in the URL. The “Use my location” button requests browser permission only when clicked. Its exact coordinates are used for the current forecast request but are not saved in recent places. Previously saved browser-location entries are removed from local storage on load. Searched recent places expire after 30 days; unit and explicit Light/Dark theme preferences expire after 180 days, checked on the next visit. Device appearance is the default and follows the operating-system setting without a stored theme choice. Switching °C/°F converts the displayed forecast immediately without another API request. Saved choices can be cleared sooner with the footer control or browser site-data controls. The public [data-use explanation](frontend/src/app/data-use/page.tsx) describes these flows; it is not yet a complete privacy policy.

The forecast shows the provider's location-local current-conditions time and the backend response-generation time in the location's time zone. Use “Refresh forecast” to request an update; a failed refresh keeps the previous result visible with a stale-data warning. The backend caches forecasts for five minutes, so refreshing may return a cached response. The page does not poll in the background.

On Windows PowerShell, use `npm.cmd` if the `npm.ps1` execution policy blocks `npm`.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/v1/health` | Application liveness |
| `POST /api/v1/locations` with JSON `{"query":"Karachi","limit":5}` | Search places and postal codes |
| `POST /api/v1/weather` with JSON `{"latitude":24.8608,"longitude":67.0104,"units":"metric"}` | Current, hourly, and daily weather |

The browser uses the POST routes so searches and coordinates do not appear in its request URLs. The existing GET variants remain available for compatibility; callers should avoid them for sensitive location data. The Open-Meteo API itself still uses query parameters. `units` accepts `metric` or `imperial`. The API returns application-owned response models, with location-local timestamps and an explicit time zone and unit labels. Errors from the provider are mapped to stable `error` and `message` fields.

## Configuration

Copy `.env.example` to `.env` only if you need to change backend defaults. The backend reads `OPEN_METEO_FORECAST_URL`, `OPEN_METEO_GEOCODING_URL`, `ALLOWED_ORIGINS`, and `RATE_LIMIT_PER_MINUTE`. Do not commit `.env` files. Browser requests use relative `/api/v1/...` URLs and never receive a provider credential.

The free Open-Meteo service permits non-commercial use within its published limits. Attribution to [Open-Meteo](https://open-meteo.com/) is displayed in the UI. Check the [current terms](https://open-meteo.com/en/terms) before commercial deployment or adding advertising. Forecasts are model-based and may differ from local observations.

## Checks

```bash
uv run ruff check backend
uv run ruff format --check backend
uv run mypy backend
uv run pytest backend/tests --cov=backend.app --cov-report=term-missing
uv run python -m backend.scripts.check_api_types
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build
```

End-to-end tests use Playwright and run against the built Next.js production server with mocked API responses. Install its Chromium browser once with `npx playwright install chromium`, then run `npm run build` followed by `npm run test:e2e` in `frontend/`. The test command starts and stops its own server.

When backend response models change, regenerate the frontend TypeScript contract with `uv run python -m backend.scripts.check_api_types --write`, then run the check command above and the frontend tests. Do not edit `frontend/src/lib/api-types.ts` by hand.

## Deployment

The active public target is **Vercel for Next.js** (`frontend/`) and **Render for FastAPI** (`render.yaml` and `backend/Dockerfile`). Vercel rewrites `/api/*` to the Render HTTPS origin using the build-time `API_PROXY_TARGET` setting. The browser still uses one Vercel origin. See the separate [local-preview and public-deployment steps](development-plans/DEPLOYMENT.md). The earlier VM/Compose/Caddy approach is preserved in the [VM restore kit](deployment-backups/virtual-machine/README.md), including its original detailed guide and deployment files.

The backend disables access logs in its container command. Review Vercel and Render edge/request logging before public use; browser requests now use POST bodies, but the compatibility GET routes and Open-Meteo upstream requests still use query strings. The in-memory cache and app rate limiter are per backend process; expired entries are pruned periodically.

## Legacy credential

An OpenWeather API key was committed in the initial version of this repository. Faraz Hussain confirms that he revoked it two years ago after a GitGuardian alert, so no further key rotation is pending. The obsolete script has been removed from the working tree, but the old value may remain in Git history; do not reuse or print it. Rewriting Git history is a separate, disruptive decision, not a prerequisite for treating the revoked key as inactive.

## Development plans

Plans live in `development-plans/` and use the sequential naming convention `development-plan-NN.md`. See [development-plan-01.md](development-plans/development-plan-01.md) for the original modernization scope, [development-plan-02.md](development-plans/development-plan-02.md) for the development improvements, and [development-plan-03.md](development-plans/development-plan-03.md) for the finished-product roadmap and Phase 1 research checkpoint. Plan 02 initially paused deployment; the subsequent Vercel + Render decision supersedes that pause.
