# Development Plan 02: Improve the Public Weather Experience

- **Status:** Core implementation in progress; manual accessibility and performance review remain
- **Created:** 2026-09-23
- **Scope:** Improve correctness, privacy, accessibility, usefulness, and maintainability of the existing FastAPI and Next.js application.
- **Relationship:** Builds on [Development Plan 01](development-plan-01.md); it does not replace the completed local rebuild.

## Direction and boundaries

The app remains a publicly accessible, anonymous weather service. **Do not add authentication**: no sign-up, login, passwords, OAuth, sessions, accounts, user roles, profile pages, or per-user server-side data. Recent places and unit preferences may remain browser-local, subject to the privacy rules below. Anonymous use still needs ordinary input validation, caching, and abuse controls.

Deployment selection and execution are **paused**. This plan does not choose a cloud provider, change the public hosting topology, configure DNS/TLS, add deployment automation, or require a database or Redis. The existing [deployment runbook](DEPLOYMENT.md) remains reference material; it is not a workstream for Plan 02. Revoking the previously exposed OpenWeather key remains a separate security obligation and should not wait for a later release.

**Later decision:** After this plan was written, deployment work was separately authorized for Vercel + Render. The current [deployment guide](DEPLOYMENT.md) now covers that path; the original VM guide was preserved in the [VM restore kit](../deployment-backups/virtual-machine/README.md). The development scope and no-authentication rule of Plan 02 are unchanged.

Keep Python 3.14, FastAPI, Open-Meteo, Next.js, React Compiler, TypeScript, Tailwind CSS, ESLint, Turbopack, the `/api/v1` contract, and the current anonymous browser experience unless a specific task below calls for a change. Avoid a wholesale UI rewrite or a new state-management library without measured need.

## Current baseline and observed gaps

- The application already offers place search, current conditions, 24 hourly entries, seven daily entries, metric/imperial units, recent places, browser location, attribution, and a responsive layout. Backend tests, frontend unit tests, and desktop/mobile browser tests exist.
- The hourly UI calls `weatherSymbol()` without an hourly day/night value, so a clear nighttime hour can receive a daytime symbol. Open-Meteo exposes hourly `is_day`; use provider data rather than the viewer's time zone. [Open-Meteo forecast documentation](https://open-meteo.com/en/docs).
- When precipitation probability is absent, the hourly and daily views append `%` to the placeholder and show `—%`.
- Selecting browser geolocation passes exact coordinates through the same recent-place persistence path as searched cities. Existing `atmos-recent` entries may therefore contain precise locations in `localStorage`, despite the interface not asking to save them.
- The UI labels weather as “LIVE” but does not expose forecast age or a manual refresh control. A failed weather request clears the displayed forecast, even if a previous successful result could be shown with an explicit stale label.
- The search box has partial combobox semantics and keyboard handling, but lacks comprehensive keyboard, focus, and screen-reader tests against the [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). Frontend component tests currently cover only a narrow portion of the interactions.
- Backend provider mapping relies on nested untyped payload access and assumes aligned time/value arrays. Tests cover main errors but not all malformed arrays, time boundaries, or concurrent identical requests.
- The frontend hand-maintains TypeScript API types separately from FastAPI's Pydantic models. `WeatherDashboard` currently owns fetching, search, preferences, geolocation, and presentation in one component.

These are planning observations, not claims that every listed edge case currently fails. Write a regression test before changing each behavior.

## Priority and execution order

| Priority | Outcome | Why first |
| --- | --- | --- |
| P0 | Correct weather meaning and protect precise location | Visible inaccuracies and unexpected persistence are more important than new features. |
| P1 | Accessible, resilient primary journey | Everyone should be able to search and understand the forecast when data is loading, stale, or unavailable. |
| P2 | Better forecast context and maintainable contracts | Add useful detail without increasing provider traffic or API drift unnecessarily. |
| P3 | Optional enhancements after measurement | Add only features justified by user value, performance, and provider limits. |

Implement each phase in small, reviewable changes. Keep existing API fields backward-compatible unless a contract change is clearly documented and both frontend and backend are updated together. Tests and documentation are part of each phase, not a final cleanup task.

## Phase 1 — Correctness and location privacy (P0)

1. **Fix hourly day/night presentation.** Request Open-Meteo's hourly `is_day`, validate and map it through the backend response, update the frontend type, and pass it to weather-symbol rendering. Test the same clear-sky code at daytime and nighttime hours for the selected location. Keep condition text visible so symbols never carry meaning alone.
2. **Fix missing precipitation values.** Render `—` or “Not available” without a percent sign when a probability is `null`. Apply this to both hourly and daily views and add unit tests.
3. **Stop silently persisting precise browser location.** A geolocation result may be used for the current in-memory forecast, but must not be written to recent places or a shareable URL by default. On loading existing preferences, remove previously saved geolocation entries (currently identifiable by the synthetic location ID) without deleting ordinary searched-city history. Keep the permission request tied to the user's “Use my location” action; explain denial and offer search. The browser's geolocation API is permission-gated and privacy-sensitive. [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).
4. **Make forecast time semantics explicit.** Distinguish the provider's current-observation time from the application's `generated_at` response time. Show a clear “updated” or “as of” label in the selected location's time zone; remove or qualify “LIVE” if freshness cannot be established. Add tests for local midnight, daylight-saving transitions where applicable, and a 24-hour span crossing a date boundary.
5. **Validate upstream shape before rendering.** Add typed/validated provider input models or focused validators for required fields, parallel hourly/daily array lengths, finite numeric values, probability ranges, and time ordering. Translate malformed data to the existing safe provider error rather than a partial or misleading forecast. Preserve stable `/api/v1` response fields.

**Phase exit:** Regression tests demonstrate correct night icons, missing-value labels, location-local time, rejected malformed provider data, and no persistence of precise geolocation. Search and manual location selection continue to work on mobile and desktop.

## Phase 2 — Accessibility and resilient interactions (P1)

1. **Complete the location combobox.** Review `aria-expanded`, `aria-controls`, active option IDs, focus, results/status announcements, and Escape/Enter/arrow behavior against the WAI-ARIA pattern. Test with keyboard alone and at least one screen-reader/browser combination. Preserve normal text-editing keys; never require a mouse to choose a result. [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
2. **Make states understandable.** Separate loading, empty results, offline notice, rate limit, provider failure, and retry states. Keep the previous successful forecast visible during a refresh; if refresh fails, mark it stale with its timestamp and show a non-blocking error. Never present stale data as current. Prevent a stale search or forecast response from replacing a newer selection.
3. **Audit visual access.** Test focus visibility, text/control contrast, 320px width, 200%/400% zoom, keyboard scrolling through the hourly strip, and reduced-motion behavior. Do not use color or an icon as the only signal. Treat automated accessibility checks as a supplement to manual keyboard and screen-reader review. [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/).
4. **Simplify the component boundary after behavior is covered.** Extract focused components/hooks for search, forecast state, current conditions, hourly forecast, and daily forecast. Keep data fetching and preference logic testable without snapshot-heavy tests. Tailwind and existing CSS may coexist; remove dead or duplicated styles incrementally rather than restyling the page for its own sake.

**Phase exit:** Search, geolocation denial, unit switching, retry, and offline/stale states pass keyboard, screen-reader, mobile, and automated browser tests. No essential control loses focus or becomes unusable at the tested viewport/zoom sizes.

## Phase 3 — Freshness, useful detail, and API contracts (P2)

1. **Add an intentional refresh policy.** Provide a manual refresh action and, if useful, refresh an active tab after a documented interval. Avoid background polling while hidden/offline and avoid duplicate requests after rapid location/unit changes. Keep backend caching authoritative and show freshness honestly.
2. **Make the 24-hour trend easier to scan.** Add a compact temperature/precipitation visualization only if it improves comprehension over the existing cards. Pair any chart with readable values or an accessible textual/table alternative. Do not add a large chart dependency for a small graphic without a measured benefit.
3. **Add a small set of high-value weather fields.** Evaluate sunrise/sunset and UV index before adding them, with location-local labels, units, data availability rules, and explicit provider/test cost. Open-Meteo documents these variables, but not every additional field needs to appear in the first iteration. [Open-Meteo forecast documentation](https://open-meteo.com/en/docs).
4. **Make searched places shareable without exposing GPS.** Consider a URL based on a selected place identifier or a deliberately coarse place reference; validate it on load and fall back to search if invalid. Do not place exact browser-geolocation coordinates in the URL, analytics, or logs. Preserve anonymous use and browser-local preferences.
5. **Reduce frontend/backend contract drift.** Generate or verify TypeScript API types from FastAPI's OpenAPI schema in a reproducible development check, or add equivalent contract tests if generation adds too much tooling. Keep provider-specific fields behind the backend adapter and retain the versioned API.

**Phase exit:** Forecast age and refresh behavior are clear, the primary view remains fast and accessible, any added fields have validated provider mappings, and a backend schema change cannot silently break the frontend type contract.

## Phase 4 — Reliability and verification (P2)

1. Add focused backend tests for null/short/misaligned provider arrays, unexpected weather codes, invalid geocoding items, coordinates, time-zone boundaries, cache expiry, retry limits, and `Retry-After` parsing. Keep normal tests fully mocked; run a live Open-Meteo smoke test separately when explicitly needed.
2. Add frontend tests for corrupted/stale browser storage, geolocation consent/denial, search races and keyboard selection, offline recovery, refresh failures, missing values, and local-time formatting. Expand Playwright coverage beyond the existing happy path and provider-error checks.
3. Measure provider calls for repeated and concurrent identical searches/forecasts. If duplicate in-flight calls are observed, coalesce them within the existing backend process; keep the cache bounded. Do not add Redis or a database for a single-instance development build.
4. Review bundle size, page-loading behavior, API latency, and build output before selecting optimization targets. Keep dependency updates deliberate: refresh lockfiles in small batches, review advisories, and run the full test suite. Avoid “latest” upgrades that are not verified against Python 3.14 and the current Next.js setup.
5. Update README/API examples and test fixtures to match the implemented behavior. Preserve Open-Meteo and location-data attribution.

**Phase exit:** All existing quality checks pass; new edge-case tests pass; no avoidable duplicate provider calls remain in the tested scenarios; documentation matches the actual UI and API. Do not claim a performance gain without a before/after measurement.

## Optional later ideas (P3; require a separate decision)

- More locale-aware labels and date formats for a global audience, while keeping provider timestamps location-local.
- A favorites experience stored **only in the browser**, if recent places prove insufficient; no account or server profile.
- Air-quality or historical views only after validating provider terms, data availability, attribution, user value, and call volume.

Do not add severe-weather alerts or safety-critical claims until a suitable authoritative alert source and region coverage are identified and tested. This plan does not include push notifications, maps/radar, provider failover, or native apps.

## Definition of done for Plan 02

- The app remains usable anonymously; there are **no authentication features or dependencies**.
- Exact browser-geolocation coordinates are neither persisted by default nor placed in shareable URLs or routine logs.
- Nighttime/hourly icons, missing values, time labels, stale-data handling, and error states are accurate and understandable.
- The primary journey works with keyboard and screen reader, at mobile widths and high zoom, with meaningful automated regression coverage.
- Backend/frontend contracts and provider mappings are validated, documented, and backward-compatible within `/api/v1`.
- Ruff, Python type checking and tests, frontend ESLint/type checks/unit tests, production build, and browser tests pass after each phase. Deployment work remains paused.

## Execution checkpoint (2026-09-23)

Implemented in the working tree: hourly day/night data and symbols; missing-value rendering; browser-location storage cleanup; location-local freshness labels and manual refresh with stale-data preservation; stronger provider input validation; keyboard search improvements; shareable searched-place URLs without GPS coordinates; generated frontend API types; in-flight provider request coalescing; and backend, frontend, and desktop/mobile browser regression tests. No authentication or deployment work was added.

The conditional chart, sunrise/sunset, and UV additions were not made: the existing cards already expose the basic trend, and additional fields should follow a user-value and provider-call review. Dependency versions were not changed without a compatibility/security reason. Remaining work before declaring the plan complete is a hands-on screen-reader and high-zoom/contrast audit, plus measured bundle/API performance review on representative hardware. Do not mark those manual checks as passed based solely on automated tests.
