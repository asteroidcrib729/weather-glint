# Weather Glint reliability and release runbook

Last checked: 2026-09-28. This is an operating reference for a small public hobby app, not an enterprise-scale availability promise or evidence that public rollout and privacy/security/accessibility checks are complete. Keep the [Vercel + Render deployment guide](DEPLOYMENT.md) as the active deployment path. The [VM restore kit](../deployment-backups/virtual-machine/README.md) is archival only.

## Forecast age and failure contract

`generated_at` is when FastAPI successfully assembled the response, including when it reused a still-valid MET Norway cache entry or received a 304 revalidation response. The UI computes elapsed time since that successful check and updates it once per minute. Its display windows are **current 15 minutes**, **hourly 2 hours**, and **daily 6 hours**. Exactly at each boundary that section is stale. A failed refresh, offline state, invalid response time, or clock skew over one minute marks all sections stale immediately. Last-success time, elapsed age, and the stale sections remain visible beside the refresh control. The location-local forecast time is shown separately; the response timestamp does **not** prove when the underlying weather model was updated. MET Norway's provider-controlled cache expiry can make model data older than the displayed response age. Forecasts are informational, never emergency warnings.

If no successful forecast exists, show an actionable error and retry button. If one exists for the **same selected place**, preserve it on failure with a stale label. Selecting another place clears the previous place's forecast first. Reconnection requests a fresh forecast. An unsuccessful refresh must never reset the last-success timestamp. Searches show an empty state for zero locations and a separate error for provider failure. Tests cover offline, timeout, malformed response, empty search, 429, stale preservation, recovery, arrays, missing probability, concurrent requests, cache expiry, and DST fall-back.

## Provider envelope and observability

The opt-in live check is `uv run python -m backend.scripts.live_provider_smoke --live` from the repository root. It sends **two requests** for the fixed city of Karachi: one Open-Meteo geocode and one MET Norway forecast. Never put it in routine CI or run it in a tight loop. Deterministic CI uses mocked provider responses. Provider payloads are validated **before** insertion into the cache, so a malformed 200 response cannot poison a cache key until its TTL expires.

[MET Norway's terms](https://api.met.no/doc/TermsOfService) require an identifying User-Agent and reuse of responses until their Expires time. The forecast client sends `WeatherGlint/1.0 (+https://github.com/asteroidcrib729/weather-glint)`, paces starts at one per second, and limits itself to 86,400 starts in a rolling 24 hours **per backend process**. It coalesces identical requests, caches up to 256 forecast keys, and conditionally revalidates expired responses with `If-Modified-Since` when available. This is not a hard cap across restarts or multiple instances, and it cannot control other Render tenants on shared outbound IPs. Open-Meteo serves geocoding only: its separate process-local conservative quota and 24-hour search cache still apply. Neither provider has a guaranteed uptime commitment for this app.

Every minute, Render application logs include an `operational_summary` with counts by bounded route/status, provider outcome, cache hit/miss, average/max latency, cache-hit rate, and upstream requests per active client **key**. The key count is the number of in-memory rate-limit IP buckets seen in the prior 60 seconds; it is a rough traffic denominator, **not** unique people or sessions. On Render, the key comes from the edge-overwritten `CF-Connecting-IP` header if it contains one valid IP; otherwise it falls back to the connection peer. Uvicorn ignores `X-Forwarded-*` headers. Vercel-rewritten traffic may share a Vercel egress address and rate-limit bucket, so this is a best-effort hobby limit, not a unique-visitor count or distributed abuse control. No IP, exact GPS, typed search, query string, or request body is emitted in these summaries. Per-request API and provider log lines also omit them. Do not enable URL/body logging or third-party log drains without revisiting the privacy notice and hosting review.

For a low-traffic launch, use these **investigation thresholds**, not SLA promises:

- `/api/v1/health` fails twice five minutes apart while the service is expected to be awake, or does not recover within two minutes after an idle wake-up: investigate Render deployment and service status.
- At least 20 API requests in ten minutes and more than 5% non-health 5xx responses, or three consecutive provider failures: investigate MET Norway, Open-Meteo geocoding, and Render logs. A provider `429` or local quota event deserves immediate quota review.
- Warm p75 weather API latency over 2 seconds or search API latency over 1.5 seconds for a meaningful sample: inspect upstream latency and cache hit rate. Record Render Free wake-up **separately**; do not fold its ~minute cold start into warm latency.

The summary is process-local and vanishes on restart. No automatic alerting service or long-term analytics store is connected; Faraz must inspect Render health/logs during a hobby launch, or set up a reviewed external monitor before promising alert delivery. A successful `/health` response proves only that FastAPI is running, not that the provider works. Run the opt-in smoke and a harmless public search/forecast when diagnosing upstream issues. Add a second weather provider **only after** repeated, measured outages justify its integration, licensing, data-mapping, and privacy costs.

## Performance budget and baseline

Initial targets for the primary journey: field p75 [LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1](https://web.dev/articles/vitals); compressed page JavaScript ≤200 KiB; warm search result ≤1.5 s from input; warm forecast and manual refresh ≤2 s from action. These are starting budgets, not certified field results. Do not compare a sleeping Render Free service against the warm target. [Render documents](https://render.com/docs/free) spin-down after 15 idle minutes and roughly one-minute wake-up.

`cd frontend && npm run build && npm run measure:local` runs five Chromium passes each on desktop and **emulated** mobile with a mocked API. It reports synthetic p75 navigation, LCP, CLS, compressed JS bytes, search interaction and refresh response. The 2026-09-24 local Windows baseline was:

| Synthetic p75 | Desktop | Mobile emulation |
| --- | ---: | ---: |
| Navigation | 189 ms | 173 ms |
| LCP | 156 ms | 132 ms |
| CLS | 0.0055 | 0.0152 |
| Encoded JS | 151,130 B | 151,130 B |
| Search to result, including debounce | 850 ms | 846 ms |
| Refresh API response, mocked | 47 ms | 51 ms |

The one-off 2026-09-24 Open-Meteo smoke took 618 ms for geocoding and 552 ms for the then-active Open-Meteo forecast; those historical numbers do not describe MET Norway, Render/Vercel latency, or a p75. INP was not measured by the synthetic script. No optimization should be justified solely by these small samples.

After the first deployment, check page load, search, forecast, and refresh on a real phone and laptop; note whether Render was waking from idle. If a delay or layout shift is noticeable, capture device/browser and timings here, investigate with browser performance tools, then fix and retest. The synthetic budgets above are diagnostic guides, not a mandatory sample count or first-launch gate. Avoid collecting visitor locations. If field analytics are later enabled, review consent and retention first.

## Release and incident checklist

1. Run locked backend lint, format, mypy, unit/coverage, and `python -m backend.scripts.check_api_types`; run frontend lint, typecheck, unit, production build, desktop/mobile E2E, and `npm run test:met-integration`. CI runs these on push/PR. Live provider checks are opt-in only.
2. Record a known-good Git commit and the exact Render and Vercel deployment IDs/URLs **outside public logs**. There is no application database to back up; preserve source, lockfiles, Render/Vercel configuration and environment-variable names/values in a secure owner-controlled location. Do not put secrets in Git. Browser preferences remain browser-local and cannot be restored server-side.
3. Deploy a backward-compatible backend first, then the frontend. Check Render health, direct Render search/forecast, Vercel `/api/v1/health`, place search, weather, refresh, stale display, attribution footer and `/data-use`. Check logs for non-health 5xx, local quota, provider 429 and cache-hit rate. Verify correct `API_PROXY_TARGET` at the Vercel **build**; rewrites are build-time configuration.
4. On incident, note time, affected route, deploy IDs, and whether the backend was cold. Check Render service/health and application `operational_summary`, then Vercel deployment/rewrite status. For upstream failure, separate MET forecast from Open-Meteo geocoding in provider logs; check the appropriate provider's status and run the opt-in fixed-city smoke once only after respecting MET's Expires header. Do not paste exact user coordinates/search text into tickets. Keep the stale label visible while the provider is unavailable; never imply emergency coverage.
5. If a later update causes an issue, fix and redeploy it or use the rollback contingency below when restoring a known-good version is safer. If an API contract changed, preserve compatibility between frontend and backend during recovery. Re-check public health/search/weather and document the fix with a regression test.

### Rollback contingency for later updates

No rollback is required or possible to a prior live version on the very first deployment. Keep these steps for a later bad update; a rehearsal is optional, not a condition of launching this hobby app. Never deliberately break the public service to test recovery.

1. Confirm a known-good pair of deployed commits and both production URLs. Render Free supports rollback only to the [two most recent previous deploys](https://render.com/docs/free); [Vercel Hobby](https://vercel.com/docs/deployments/rollback-production-deployment) supports the immediately preceding production deploy. Keep the Git commit as a fallback if either artifact ages out.
2. Render Dashboard → service → **Deploys** → a recent successful deploy → **Rollback** → confirm. [Render's rollback guide](https://render.com/docs/rollbacks) says dashboard rollback disables autodeploy. Wait for healthy, then test `/api/v1/health`, locations and weather. Record duration, target deploy, and whether autodeploy is disabled.
3. Vercel project → Production Deployment → **Instant Rollback** → previous production deployment → confirm. [Vercel's guide](https://vercel.com/docs/instant-rollback) notes the old build's environment/configuration may be stale and automatic assignment of production domains is paused after rollback. Check the production page, rewrite health, search, and refresh. Re-enable normal deployment behavior only after the fix is ready.
4. Restore the intended good release pair (promote/redeploy or push a corrected commit), confirm both autodeploy settings, and rerun public smoke. Record result/date here. Do not delete local uncommitted work or use the archived VM kit for an ordinary release rollback.

**Current state:** The MET adapter has passed local backend, frontend, and production-build integration tests, but no Render-origin or public Vercel path has been verified for this revision. Earlier public deployments do not establish this revision's behavior. Record the first MET deployment self-test separately; use these rollback steps only if a later update makes them necessary.
