# Development Plan 01: Modern Weather Application Rebuild

- **Status:** Implemented locally; release prerequisites pending
- **Created:** 2026-09-22
- **Scope:** Replace the original single-file CLI with a tested FastAPI backend and a responsive web frontend.

## Development-plan naming convention

All future development plans for this repository must:

- live in `development-plans/`;
- use the exact filename pattern `development-plan-NN.md`;
- use a two-digit, sequential number beginning with `01`;
- never reuse a number, even if an earlier plan is superseded; and
- link to the plan it supersedes when applicable.

The next plan should therefore be named `development-plan-02.md`.

## Execution record — 2026-09-23

- Replaced the hard-coded legacy credential in the working tree with an environment variable.
- Implemented the FastAPI geocoding and forecast API, Open-Meteo adapter, validated response models, caching, bounded retries, rate limiting, request IDs, and privacy-safe structured logs.
- Implemented the Next.js App Router frontend with search, browser location, current/hourly/daily views, unit switching, recent places, mobile layout, and attribution.
- Added locked Python and npm dependencies, automated tests, CI, dependency audits, Dockerfiles, Compose, a Caddy proxy, and setup documentation.
- Standardized local development, CI, and deployment on Python 3.14. Enabled Tailwind CSS alongside Next.js React Compiler, TypeScript, ESLint, and Turbopack. Removed the obsolete internship script after verifying feature parity.
- Verified the API against live Open-Meteo data. Local checks pass: 13 backend tests with 90.75% coverage, five frontend unit tests, four desktop/mobile browser scenarios, frontend production build, strict typing/linting, and Python/npm advisory audits with no known findings.

Release prerequisites that cannot be completed from this workspace:

- The repository owner must revoke the old OpenWeather key in their account. Removing it from the current file does not invalidate the key or erase Git history.
- A decision is needed before rewriting shared Git history to remove the old key from earlier commits.
- Docker is not installed on this machine, so the Compose deployment still needs a build and smoke test on a Docker-capable host.
- A public hostname and HTTPS configuration are needed before an internet-facing deployment.

## 1. Goals

- Preserve the original project's purpose while rebuilding it as a maintainable application.
- Provide current conditions, hourly weather, and a seven-day forecast.
- Support location search, metric/imperial units, and location-aware time zones.
- Expose a stable, documented FastAPI API instead of exposing a third-party provider directly to the browser.
- Add a polished, accessible, responsive frontend after the backend contract is stable.
- Use current stable dependencies, automated tests, linting, type checking, and reproducible lockfiles.
- Keep the design small enough for a portfolio project and avoid unnecessary infrastructure.

## 2. Decisions and recommended baseline

### Runtime and framework

- **Python:** 3.14 for local development, CI, and deployment.
- **Backend:** FastAPI, initially based on the current stable 0.141.x series.
- **Dependency management:** `uv` with dependencies declared in `pyproject.toml` and exact resolutions committed in `uv.lock`.
- **HTTP client:** `httpx.AsyncClient`, owned through FastAPI lifespan state and reused across requests.
- **Validation/configuration:** Pydantic models and `pydantic-settings`.
- **Frontend:** Next.js App Router with React and TypeScript, added after the backend MVP. Use Next.js 16.3.6 or a newer security-patched Active LTS release.
- **JavaScript runtime:** Node.js 24 LTS, initially 24.21.x. Do not use the newer Node.js 26 Current line for production until it reaches LTS and the application has been verified against it.
- **Frontend dependencies:** npm with an exact `package-lock.json`. Use native CSS or CSS Modules initially; do not add a large component library without a demonstrated need.
- **Production topology:** run Next.js and FastAPI as separate application processes behind one reverse proxy/public origin. Route `/api/*` to FastAPI and all page/static requests to Next.js.

Versions above are the researched baseline, not permanent pins. At implementation time, install the newest stable, mutually compatible releases, run the full test suite, and commit the resulting lockfiles. Avoid floating production installs and pre-release dependencies.

### Weather provider

Use **Open-Meteo** as the initial provider.

Reasons:

- no API key, signup, or credit card is required for non-commercial usage;
- the published free allowance is up to 10,000 calls per day for non-commercial use;
- forecast, current, historical, air-quality, and geocoding APIs use a consistent JSON-oriented interface;
- its default "best match" mode combines/selects suitable weather models by location; and
- its server is open source and a public service-status page is available.

This is the best fit for this project's requirements, not a claim that any free provider can guarantee universal accuracy or uptime. Forecast quality varies by location and weather model. Reliability must also be created within this application through timeouts, bounded retries, caching, validation, and graceful degradation.

Important constraints:

- Open-Meteo attribution is required under its CC BY 4.0 data license.
- The hosted free API is intended for non-commercial use. Recheck the current terms before any commercial launch.
- Commercial traffic or higher volume may require a paid customer endpoint or a different provider.
- Hide provider-specific fields behind an internal adapter so another provider can be introduced without changing the public API.

Alternatives considered:

| Provider | Strength | Trade-off |
| --- | --- | --- |
| Open-Meteo | No key, broad model/data coverage, generous non-commercial allowance | Attribution required; free hosted tier is non-commercial |
| WeatherAPI.com | Simple API and a published 100,000-call monthly free tier | Requires a key; free forecast is limited to three days |
| OpenWeather | Familiar current-weather product and existing project history | Requires a key; the old key is already committed and must be revoked |

## 3. Product scope

### MVP

- Search for locations by city/place name and present disambiguated results with region and country.
- Select a result by latitude and longitude rather than passing ambiguous free text to the forecast provider.
- Display:
  - current temperature and apparent temperature;
  - weather condition;
  - humidity, precipitation, wind speed/direction, and daylight state;
  - the next 24 hours; and
  - a seven-day summary with highs, lows, and precipitation probability.
- Switch between metric and imperial units.
- Use the selected location's time zone.
- Provide loading, empty, invalid-location, rate-limit, provider-unavailable, and offline states.
- Persist recent locations and unit preference in browser storage.
- Show required Open-Meteo attribution in the interface and documentation.

### Explicitly deferred

- User accounts and authentication.
- A database or server-side saved locations.
- Weather maps, radar, push notifications, and severe-weather alerts.
- Native mobile applications.
- Multiple active weather providers or automatic provider failover.
- Historical analytics beyond what is needed by the core forecast experience.

These features should only enter scope through a later numbered development plan.

## 4. Proposed repository structure

```text
weather-app/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   ├── clients/
│   │   │   └── open_meteo.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── errors.py
│   │   ├── schemas/
│   │   ├── services/
│   │   └── main.py
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   ├── public/
│   ├── tests/
│   ├── next.config.ts
│   ├── package.json
│   └── package-lock.json
├── development-plans/
├── .github/workflows/
├── .env.example
├── .gitignore
├── pyproject.toml
├── uv.lock
└── README.md
```

The original `Weather_Application.py` was removed after the replacement passed API, frontend, and browser tests. Its previously committed credential may still exist in Git history and must be revoked separately.

## 5. Backend design

### Public endpoints

- `GET /api/v1/health` — local application liveness; must not depend on Open-Meteo.
- `GET /api/v1/locations?query=...&limit=...` — validated proxy over geocoding results.
- `GET /api/v1/weather?latitude=...&longitude=...&units=metric|imperial` — normalized current, hourly, and daily weather.

The weather response should contain stable application-owned models such as:

- `location`;
- `current`;
- `hourly`;
- `daily`;
- `units`;
- `timezone`;
- `generated_at`; and
- `source`/attribution metadata.

Do not return the provider's raw payload as the public contract. Validate upstream responses before mapping them into typed Pydantic response models.

### Provider client behavior

- Use structured query parameters, never string-built URLs.
- Set explicit connect/read/write/pool timeouts.
- Retry only safe transient failures (`429` where appropriate and selected `5xx` responses), with a small bounded exponential backoff and jitter.
- Respect `Retry-After` when supplied.
- Never retry validation errors or other permanent `4xx` responses.
- Translate upstream failures into consistent application errors without leaking internals.
- Cache geocoding responses longer than forecasts; proposed starting TTLs are 24 hours and 5 minutes respectively.
- Coalesce identical in-flight requests if traffic warrants it.
- Keep provider base URLs configurable for testing, but reject arbitrary user-supplied upstream URLs.

Start with an in-memory bounded TTL cache. Do not add Redis until multiple application instances or measured traffic make shared caching necessary.

## 6. Frontend design

- Use the Next.js App Router, TypeScript strict mode, and the current stable React version supported by the selected Next.js release.
- Keep FastAPI as the sole public application API and owner of provider access, normalization, caching, and weather-domain rules.
- Do not duplicate the FastAPI endpoints in Next.js Route Handlers or turn Next.js into a second backend. Introduce a Route Handler only when a concrete frontend-specific server concern requires it.
- Use Server Components for the static page shell, metadata, and content that does not require browser APIs or interaction.
- Use focused Client Components for search autocomplete, unit preference, recent locations, browser geolocation, and interactive forecast views.
- Mobile-first responsive layout with a prominent location search.
- Current-weather summary followed by hourly and daily forecast sections.
- Keyboard-accessible search suggestions and controls.
- Semantic markup, visible focus states, sufficient contrast, reduced-motion support, and screen-reader-friendly status messages.
- Weather condition text must remain visible; icons must not carry meaning alone.
- Use the backend's units and timestamps rather than duplicating conversion/time-zone logic in the browser.
- Abort stale searches and debounce autocomplete input.
- Prefer a typed API client and ordinary React state initially. Add a server-state library only if caching/refetch complexity demonstrates the need.
- Use relative `/api/v1/...` URLs in the browser so production stays same-origin. A server-only internal FastAPI URL may be configured for Server Component requests, but it must never be exposed as a `NEXT_PUBLIC_*` secret.
- Treat FastAPI's short-lived cache as the authoritative weather cache. Avoid accidental long-lived Next.js data caching for volatile forecasts; document any `revalidate` policy explicitly.

### Next.js rendering and deployment decision

Start with a self-hosted Next.js Node.js runtime using its production build, packaged independently from FastAPI. This preserves App Router capabilities such as Server Components, streaming, runtime metadata, and future server-side rendering. Place a reverse proxy in front of both services to provide one public origin and operational protections.

A static export remains a later optimization if the finished frontend uses no runtime Next.js features. Static export can be served by any static host, but it disables features that require the Next.js server. Do not select export mode merely to simplify the first deployment; make the choice after the implemented routes and data-fetching behavior are known.

## 7. Security and privacy work

Before feature development:

1. Revoke and rotate the OpenWeather key committed in `Weather_Application.py`.
2. Remove the key from the working tree and, if this repository has ever been public or shared, rewrite the Git history using an appropriate secret-removal procedure.
3. Add `.env*` exclusions while retaining a safe `.env.example`.
4. Never send provider credentials to the frontend if a future provider requires them.

Application controls:

- Validate coordinate ranges, unit enums, query length, and result limits.
- Restrict CORS to known development origins; prefer same-origin production deployment.
- Add sensible request/body limits and API rate limiting before public deployment.
- Avoid logging precise user locations at info level.
- Escape/render location names as text and set secure response headers.
- Run dependency and secret scanning in CI.

## 8. Testing and quality gates

### Backend

- `pytest`, `pytest-asyncio`, `httpx`, and `respx` for unit and mocked integration tests.
- Test provider mapping, missing fields, timeouts, retries, rate limits, malformed JSON, caching, units, time zones, and API error responses.
- Add contract fixtures representative of actual provider payloads without calling the live service in the normal test suite.
- Maintain at least 85% meaningful backend coverage; critical mapping/error paths should be fully exercised.

### Frontend

- Vitest and Testing Library for pure utilities and Client Component interactions.
- Playwright tests against the built Next.js and FastAPI applications for routing, Server/Client Component integration, location search, forecast display, unit switching, and failure states.
- Test narrow/mobile layouts and keyboard navigation.

### Automated checks

- Ruff formatting and linting.
- A strict Python type checker supported by the chosen dependency set.
- TypeScript strict mode, Next.js ESLint rules, and frontend formatting checks.
- Backend tests, frontend tests, a Next.js production build, and Python/npm dependency audits in CI.
- Pin the Node.js major version in local tooling, CI, and deployment configuration.
- Renovate or Dependabot updates in small, test-verified pull requests rather than unreviewed automatic upgrades.

## 9. Delivery phases

### Phase 0 — Security and project decisions

- Revoke the exposed key and decide whether Git history must be rewritten.
- Confirm Open-Meteo's terms match the intended non-commercial use.
- Confirm Python 3.14 compatibility across the selected packages.
- Record the final MVP fields and units.

**Exit criterion:** no active credential remains exposed, and provider/scope decisions are documented.

### Phase 1 — Repository foundation

- Create the `uv` Python project, backend package, test layout, configuration, and lockfile.
- Expand `.gitignore`, `.env.example`, README, and contributor commands.
- Add Ruff, type checking, pytest, and CI.
- Implement application startup and the health endpoint.

**Exit criterion:** a clean checkout can install, lint, type-check, test, and start the API using documented commands.

### Phase 2 — Weather integration

- Implement the async Open-Meteo geocoding and forecast client.
- Add normalized domain/response models and weather-code mapping.
- Add timeouts, error translation, bounded retry behavior, caching, and tests.

**Exit criterion:** mocked provider tests cover success and failure paths without requiring internet access or secrets.

### Phase 3 — API MVP

- Implement versioned location and weather routes.
- Add validation, consistent error responses, OpenAPI examples, and attribution metadata.
- Perform a small manual live-provider smoke test separately from CI.

**Exit criterion:** the versioned API contract is documented and stable enough for frontend development.

### Phase 4 — Frontend MVP

- Scaffold the Next.js App Router application with TypeScript, ESLint, a `src/` directory, and current security-patched stable dependencies recorded in `package-lock.json`.
- Establish the Server/Client Component boundary, a typed FastAPI client, environment validation, and local `/api` proxying before building feature components.
- Implement search, current/hourly/daily views, units, preferences, accessibility, and error states.
- Add component tests and end-to-end smoke tests.

**Exit criterion:** the complete primary journey works on mobile and desktop and does not expose provider implementation details.

### Phase 5 — Hardening and release

- Add separate production container/build configuration for Next.js and FastAPI.
- Put both services behind a reverse proxy that sends `/api/*` to FastAPI and other traffic to Next.js under one origin.
- Add structured logs, request IDs, health checks, cache metrics, and provider latency/error metrics.
- Apply rate limiting and secure headers.
- Document deployment, attribution, operational limits, and rollback.
- Run accessibility, dependency, secret, and end-to-end checks.

**Exit criterion:** a tagged release can be reproduced from a clean checkout and deployed using documented steps.

## 10. Definition of done

- No active secrets exist in tracked files or distributable frontend assets.
- All public inputs and upstream responses are validated.
- API models are provider-independent and documented through OpenAPI.
- Expected upstream failures return useful, consistent responses.
- Automated formatting, linting, typing, tests, and builds pass in CI.
- The main user journey is responsive and keyboard accessible.
- Open-Meteo attribution and relevant usage limitations are visible.
- Setup, development, testing, and deployment instructions work from a clean clone.
- Direct dependencies are current stable releases at delivery time and exact resolved versions are locked.

## 11. Risks and decision triggers

| Risk | Mitigation / trigger |
| --- | --- |
| Free-provider terms or limits change | Keep a provider interface; reassess before deployment and in later plans |
| Provider outage or throttling | Timeouts, bounded retries, cache, graceful stale/error UI; add fallback only after measured need |
| Forecast accuracy varies by region | Use best-match models, preserve source information, and test representative locations |
| Python 3.14 ecosystem incompatibility | Verify before scaffolding; use Python 3.13 only if a required dependency has a documented blocker |
| Frontend expands the scope excessively | Stabilize backend first and enforce the MVP/deferred boundary |
| Next.js introduces a second runtime and deployment process | Pin Node.js LTS, keep a strict FastAPI/Next.js boundary, provide one development command, and containerize both services |
| Next.js security releases require prompt upgrades | Track the Active LTS line, enable automated update pull requests, and treat framework security patches as urgent |
| Conflicting FastAPI and Next.js caches serve stale weather | Make FastAPI authoritative and explicitly test/document every Next.js cache or revalidation setting |
| Exact "latest" pins become stale | Resolve stable versions during implementation, commit lockfiles, and automate reviewed updates |

## 12. Research references

Checked on 2026-09-23:

- [Python version documentation](https://www.python.org/doc/versions/)
- [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/)
- [Next.js release news and security updates](https://nextjs.org/blog)
- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Next.js installation and system requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js static export guide](https://nextjs.org/docs/app/guides/static-exports)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Open-Meteo overview, licensing, and free-use limits](https://open-meteo.com/)
- [Open-Meteo forecast API documentation](https://open-meteo.com/en/docs)
- [Open-Meteo geocoding API documentation](https://open-meteo.com/en/docs/geocoding-api)
- [Open-Meteo terms](https://open-meteo.com/en/terms)
- [Open-Meteo service status](https://status.open-meteo.com/)
- [WeatherAPI.com pricing](https://www.weatherapi.com/pricing.aspx)
- [OpenWeather pricing](https://openweathermap.org/price)
