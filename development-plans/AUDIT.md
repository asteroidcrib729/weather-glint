# Web application compliance audit

- **Audit date:** 2026-09-23
- **Audit basis:** *Web Application Compliance Audit Master Prompt.pdf* (the 16-page brief supplied for this project)
- **Scope:** Current local working tree of the FastAPI and Next.js weather application
- **Access mode:** Read-only application audit; this report was written afterward
- **Conclusion:** Findings and gaps are documented below. This is not a legal opinion, penetration test, accessibility certification, or declaration of compliance.

**Update:** Sections 1–8 preserve the original pre-remediation audit. See section 9 for changes and remaining release blockers after the requested remediation.

## 1. Executive summary

The application is a public weather dashboard with place search, optional browser geolocation, current conditions, hourly and seven-day forecasts. It intentionally has no authentication or payments. Its planned public deployment is Next.js on Vercel and FastAPI on Render; no live deployment was available for this audit.

The highest-priority findings are:

1. **Location-data transparency:** No public privacy notice was found, although the application processes search text, client IP addresses, selected locations, and optional device coordinates. The browser sends search text and coordinates in GET query strings. A local browser check confirmed this with synthetic values. Open-Meteo states that its API logs may contain coordinates and that it deletes those logs after 90 days. [Open-Meteo terms](https://open-meteo.com/en/terms)
2. **Accessibility:** Automated checks found text-contrast failures in both the normal forecast and the error state. Several measured pairs are below the [WCAG 2.2 Level AA 4.5:1 minimum for ordinary text](https://www.w3.org/TR/WCAG22/#contrast-minimum).
3. **Retention:** Expired in-memory IP rate-limit entries can remain until the map exceeds 5,000 keys. Expired location-related cache entries can also remain until accessed again or evicted. The stated cache TTLs control freshness, not guaranteed deletion.
4. **Historical credential:** A credential-looking assignment remains in the committed legacy script, although that script is deleted from the current working tree. Its value was not printed or copied. Whether it has been revoked is unknown; if still valid, this is urgent.

Existing strengths include bounded API inputs, generic provider errors, no device-coordinate persistence in recent places or share URLs, backend logs that omit query strings, attribution links, and passing application tests. None of these substitutes for a production privacy or accessibility assessment.

## 2. Scope and evidence

The inspected branch was `main` at `90ff4a5`, plus the then-current working tree. At audit time, the modern application was largely untracked and `Weather_Application.py` was deleted only in the working tree. The Git commit alone did not represent the audited application. No Vercel or Render account, production URL, actual host logs, contracts, analytics dashboard, or production response headers were inspected.

**Route and feature inventory:** Next.js exposes `/`, `/icon.svg`, and its not-found page. FastAPI exposes `/api/v1/health`, `/api/v1/locations`, `/api/v1/weather`, and generated `/docs`, `/redoc`, and `/openapi.json` routes. The UI has place search, unit switching, optional geolocation, recent searched places, a shareable selected-place URL, refresh, and loading/error states. There are no account, checkout, subscription, upload, or administrative application flows in the inspected source.

Key source evidence: [dashboard UI](../frontend/src/components/weather-dashboard.tsx), [browser API client](../frontend/src/lib/weather.ts), [API and request policy](../backend/app/main.py), [provider/cache](../backend/app/clients/open_meteo.py), [styles](../frontend/src/app/globals.css), [forecast panels](../frontend/src/components/forecast-panels.tsx), [Next.js routing](../frontend/next.config.ts), and [backend container command](../backend/Dockerfile). Line numbers below refer to these files as inspected on the audit date.

### Data inventory

| Data and source | Purpose and recipient | Storage, retention, and deletion evidence |
| --- | --- | --- |
| Place or postal-code search from the search input | `/api/v1/locations` forwards the search term to Open-Meteo geocoding. Vercel and Render would also receive the request in the planned deployment. | Provider cache has a 24-hour freshness TTL and a 256-entry maximum, but expired entries are not proactively deleted. Host logging and deletion settings were not inspected. |
| Selected-place or device coordinates | `/api/v1/weather` forwards coordinates to Open-Meteo forecast. Device coordinates are requested only after the user clicks **Use my location**. | Forecast cache has a five-minute freshness TTL, not a guaranteed deletion deadline. Device coordinates are not saved in recent places or the share URL. Exact coordinates are sent in a browser GET URL. |
| Client IP address | Backend per-IP rate limiting. Hosting providers necessarily receive a request, but their actual handling was not inspected. | The `_request_counts` map has no periodic expiry below its 5,000-key cleanup threshold. A synthetic one-hour-old entry remained in a local probe. |
| API request ID, path, method, status, duration | Backend operational logging. | The application's structured request log omits the query string; upstream logging is unverified. |
| Unit preference and up to five searched locations | First-party browser preference and recent-place features. | `localStorage` persists until site data is cleared or overwritten. There is no in-app expiry or clear-recent control. Browser-location entries are filtered from restored recent places. |
| Selected place name and provider ID | Shareable page URL. | Stored in browser history and potentially host request records; no exact coordinates are put in that share URL. Actual host retention is unknown. |

### Tracker and storage inventory

| Key or technology | Provider, purpose, scope, trigger | Observed lifetime and consent question |
| --- | --- | --- |
| `atmos-units` | First-party functional `localStorage`; remembers unit choice when changed. | Persistent without an application-set expiry. Whether notice or consent is required depends on jurisdiction and necessity. |
| `atmos-recent` | First-party functional `localStorage`; up to five provider-selected recent places, written after a selection and sanitized on load. | Persistent without an application-set expiry or in-app clearing control. |
| HTTP cookies, analytics pixels, advertising SDKs | None found in inspected application source; no cookies appeared in a fresh local browser session with mocked API calls. | Production injection or vendor settings remain unverified. Do not infer that a consent banner is needed—or that it is never needed—without those facts. |

**Third parties and subprocessors:** Open-Meteo directly receives geocoding terms and forecast coordinates from the backend. GeoNames is identified by Open-Meteo as underlying location data, but this application does not call GeoNames directly. Vercel and Render are planned hosts and could receive browser IPs and request URLs; their actual project settings, regions, contracts, and logging were unavailable. No third-party embeds or remote fonts were found in application source. [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api), [Render logging](https://render.com/docs/logging), [Vercel runtime logs](https://vercel.com/docs/logs/runtime)

**Form inventory:** The location input accepts a city or postal-code search and sends text after at least two characters; it has a visible label and an accessible combobox role, but no just-in-time data-transfer notice. The geolocation button invokes the browser permission prompt and sends coordinates for a forecast; it has an accessible name, but no corresponding public privacy explanation. No contact, registration, newsletter, payment, or upload forms were found.

**Asset provenance register:** The UI uses a local [SVG favicon](../frontend/src/app/icon.svg), CSS-drawn weather art, system Arial/Helvetica fonts, text weather symbols, and provider data. Ownership history for the favicon and artwork was not supplied. The footer links to Open-Meteo and GeoNames, but does not identify the CC BY 4.0 license or document changes to licensed material. Attribution sufficiency needs review against the [Open-Meteo terms](https://open-meteo.com/en/terms), [GeoNames guidance](https://www.geonames.org/export/), and [CC BY 4.0 conditions](https://creativecommons.org/licenses/by/4.0/legalcode.en); no ownership or legal conclusion is inferred.

**Accessibility coverage map:** Automated axe-core checks covered a desktop forecast state and a 320px mobile error state in Chromium. Existing Playwright tests covered keyboard search, a 320px viewport, loading/error recovery, units, and forecasts. An additional local check inspected focus styles and 320px overflow. Screen-reader operation, actual browser zoom, text-spacing overrides, forced-colors/high-contrast mode, other browsers, and the live site were not tested.

Current authoritative material checked on 2026-09-23: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), [UK ICO guidance on storage and access technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/), [OWASP Secure Headers Project](https://owasp.org/projects/secure-headers-project), the provider and license sources linked above, and the hosting-log documentation linked above. The UK guidance is conditional: the application's target jurisdictions were not established.

## 3. Applicability matrix

These statuses evaluate the PDF's controls within the inspected scope; **Non-compliant** does not, by itself, assert a legal violation. Risk is shown as **severity / confidence**. “Local” verification does not establish production behavior.

| # Requirement | Status | Applicability basis | Evidence | Risk | Action recommended | Verification | Owner input needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Privacy policy | **Non-compliant** | IP, searches, and optional device location are processed. | Dashboard 159–166; API 56–83; no public policy route. | High / high | Prepare an accurate, discoverable notice before public release. | Source and synthetic browser flow; no production test. | Operator identity, contact, markets, retention. |
| 2. Terms and conditions | **Unable to verify** | Free public site and API; no accounts or sales. | Route and UI inventory; no terms page. | Low / medium | Decide whether site/API terms are needed; legally review substantive clauses. | Source only. | Intended use and business terms. |
| 3. Cookie/similar-tech policy | **Partially compliant** | Two persistent functional storage keys. | Dashboard 47–54 and 133–156; no user-facing explanation. | Medium / high | Disclose keys, purposes, duration, and removal method. | Code and fresh-browser check. | Retention choice. |
| 4. Consent controls | **Unable to verify** | No tracker found; necessity of preference storage and production integrations is jurisdiction-dependent. | Source scan; no local cookies. | Medium / medium | Decide whether any technology needs consent; add controls only if justified. | Local network/storage only. | Target markets and platform-added tools. |
| 5. Refund/return/cancellation | **Not applicable** | No products, payments, or subscriptions. | Route, package, and UI inventory. | None / high | Reassess if monetized. | Source review. | Any planned sales. |
| 6. Form notice and consent | **Partially compliant** | Search text and optional coordinates are transmitted. | Dashboard 159–166 and 197–216; synthetic GET test. | Medium / high | Add concise, timely purpose/recipient notice. | Browser and source. | Approved wording and legal basis, if required. |
| 7. Data minimization/retention/deletion | **Partially compliant** | Coordinates, searches, IPs, and recent places persist. | Provider 23–66; API 48–70; dashboard 47–54. | High / high | Prune expired memory entries; review URL method, coordinate precision, and clear-recent control. | Stale-IP probe and browser test. | Retention and forecast-accuracy trade-off. |
| 8. Analytics/advertising | **Not applicable** to inspected source | No integration or outbound tracker found locally. | Imports, package, mocked-page network. | Low / medium | Confirm live dashboards do not inject tracking. | Local only. | Actual hosting integrations. |
| 9. Third-party resources | **Partially compliant** | Open-Meteo receives data; GeoNames is credited; no embeds found. | Provider 27–56; dashboard footer 248. | Medium / high | Explain recipients and verify deployment transfers. | Source and provider docs. | Hosting regions and contracts. |
| 10. WCAG accessibility | **Partially compliant** | Semantic controls exist, but confirmed contrast failures remain. | Dashboard, styles, axe scans. | High / high | Fix verified failures; complete assistive-technology review. | Automated and keyboard checks, not full conformance test. | None for code fix. |
| 11. Non-text alternatives | **Compliant** in inspected UI | Decorative art/symbols are hidden and weather conditions have text. | Dashboard 231–234; forecast panels 9–24. | Low / medium | Preserve text equivalents as visuals change. | Source and axe scan. | Asset provenance under item 18. |
| 12. Color contrast | **Non-compliant** | Several small-text combinations fail. | Styles 19, 55–61, 96, 123; ratios below. | High / high | Darken affected colors and retest all states. | Axe and calculated ratios. | None. |
| 13. Keyboard/focus/forms | **Partially compliant** | Keyboard search works; input outline is absent and focused parent border is weak. | Dashboard 200–211; styles 31–34, 127. | Medium / high | Strengthen focus indication; test combobox with a screen reader. | E2E keyboard and computed CSS; no AT test. | None. |
| 14. Labels and calls to action | **Compliant** in inspected UI | Search, location, retry, and refresh have understandable names. | Dashboard 197–209 and 223–225. | Low / high | Preserve naming in later changes. | Source, browser, axe. | None. |
| 15. Reviews/trust signals | **Not applicable** | No reviews, ratings, customer counts, or seals. | UI/content inventory. | None / high | Reassess if added. | Source review. | None. |
| 16. Unsupported claims | **Compliant** in inspected copy | No objective superiority, safety, or accuracy guarantee found. | Dashboard copy and README. | Low / medium | Substantiate any future accuracy or “live” claim. | Source review; forecast accuracy not independently tested. | Future marketing claims. |
| 17. Business identity/contact | **Unable to verify** | Footer credits providers but gives no operator/contact channel. | Dashboard footer 248; no contact route. | Medium / high | Add appropriate real operator/contact information after confirmation. | Source only. | Legal identity and working contact. |
| 18. Copyright/licensing/provenance | **Partially compliant** | Provider links exist; license details and local-asset history are undocumented. | Footer 248; SVG/CSS; no supplied provenance record. | Medium / medium | Verify ownership and complete any required license notice. | Source and official license terms. | Ownership records. |
| 19. Applicable laws/standards | **Unable to verify** | Establishment, audience, age group, and commercial plans unknown. | Repository context only. | Medium / low | Map jurisdictions with owner/counsel; keep technical fixes separate. | Official sources reviewed; no applicability conclusion. | Markets and business facts. |
| 20. Additional material risks | **Partially compliant** | Legacy committed credential, absent local frontend security headers, proxy-trust question. | Redacted Git check; local response; Dockerfile command. | High / high for historical exposure | Confirm revocation; test headers and forwarded-IP trust in production. | Local checks; live settings unavailable. | Rotation and host settings. |
| 21. Accuracy/evidence | **Partially compliant** | Source documentation acknowledges risks, but deployment facts are unverified. | README/deployment guide compared with code/tests. | Medium / medium | Maintain a release evidence record reconciled with live settings. | Bounded audit and tests; no production inspection. | Deployment access and approval. |

For item 12, measured examples were **3.38:1** for the unselected unit button, **3.74:1** for metric-unit labels, and **3.27:1** for white text on the error-state **Try again** button. The focused search-box border measured **2.60:1** against white; that observation warrants focused visual/assistive-technology testing rather than, by itself, a blanket WCAG conclusion. The desktop forecast and mobile error-state axe scans each reported three `color-contrast` nodes. Other axe checks were marked incomplete, so this is not an exhaustive contrast inventory.

## 4. Changes made

No application source, legal page, account setting, or deployment was changed during the read-only audit. This `AUDIT.md` was created afterward to preserve the findings. No placeholder policy, consent banner, or authentication feature was added.

## 5. Items requiring owner, legal, security, or business input

1. **Credential:** Has the old OpenWeather credential been revoked or rotated? If still valid, revoke it promptly; deleting the working-tree file does not erase Git history.
2. **Actual deployment:** Is there a public Vercel/Render URL? Which analytics, protection, edge logging, log streaming, and retention settings are enabled there?
3. **Jurisdiction and purpose:** Where is the operator established, which markets and age groups are targeted, and will the application remain strictly non-commercial? These facts determine which legal requirements need a qualified review.
4. **Identity and requests:** What real operator name and contact method should receive privacy and support requests? What retention periods and request-handling process can be supported in practice?
5. **Location precision and licenses:** Is exact device-location precision necessary for the product goal? Who owns the favicon/artwork, and is there supporting license evidence for all displayed data and assets?

The [UK ICO guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/) treats local storage as a storage/access technology, but UK applicability and any exception cannot be inferred from this repository. Do not add a cookie banner solely because `localStorage` exists.

## 6. Remaining risks and deferred work

| Priority and confidence | Affected users or data; reason unresolved | Recommended owner and next validation |
| --- | --- | --- |
| **Potentially critical if active / medium** | Credential-looking value is present in committed legacy source; validity and rotation are unknown. | Owner/security: verify revocation without copying the value into reports; rotate if needed and decide whether coordinated Git-history remediation is warranted. |
| **High / high** | Search text and optional exact device coordinates appear in GET URLs; no public privacy explanation. Production logs and legal basis are unknown. | Owner + engineering: agree on disclosure and precision; evaluate body-based browser API requests, inspect host logs, then test real data flow. Open-Meteo's API itself uses query parameters, so changing the browser hop will not remove every downstream URL risk. |
| **High / high** | Confirmed contrast failures affect forecast controls, metric units, and error recovery. | Frontend engineering: adjust color tokens and verify normal, error, focus, mobile, and high-contrast states with automation and manual review. |
| **Medium / high** | Stale raw IP and cached location-related data can persist beyond freshness windows. | Backend engineering: add bounded expiry/cleanup tests and document actual retention behavior. |
| **Medium / medium** | Local Next.js HTML response lacked CSP, frame, referrer, permissions, and nosniff headers; actual Vercel headers and forwarded-IP trust were not observed. | Engineering/security: design proportionate headers, review `--forwarded-allow-ips='*'` against the real proxy boundary, and inspect production responses. [OWASP secure-header guidance](https://owasp.org/projects/secure-headers-project) |
| **Medium / low** | Business identity, target markets, processor terms, and full attribution sufficiency are unknown. | Owner/legal: resolve facts before publishing definitive policy or compliance claims. |

The audit found no basis for adding authentication, payment/refund flows, or an analytics consent interface to the current feature set.

## 7. Verification results

| Check or method actually performed | Observed result and limit |
| --- | --- |
| `.\.venv\Scripts\python.exe -m pytest backend/tests -q` | **20 passed**. |
| `.\.venv\Scripts\ruff.exe check backend` and `ruff.exe format --check backend` | Passed; 17 files already formatted. |
| `.\.venv\Scripts\mypy.exe backend` | Passed; no issues in 17 source files. |
| `.\.venv\Scripts\python.exe -m backend.scripts.check_api_types` | Passed; frontend API types matched Pydantic schemas. |
| `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test` | Passed; 15 unit tests across three files. |
| `npm.cmd run build`, `npm.cmd run test:e2e` | Production build passed; 10 Chromium desktop/mobile browser tests passed against mocked API responses. |
| `npm.cmd audit --omit=dev --audit-level=high --offline` | Reported zero vulnerabilities from available **offline** advisory data; this is not current online assurance. |
| `uv audit --offline` | **Not verified:** cache initialization failed with an access-denied error outside the workspace. |
| axe-core on local built app | One `color-contrast` violation affecting three nodes in desktop forecast; one affecting three nodes in 320px mobile error state. Other nodes were marked incomplete. |
| Local Chromium synthetic-data probe | Exact synthetic device coordinates and a synthetic search string appeared in GET URLs. No cookies or storage keys appeared on a fresh page; the browser API responses were mocked. |
| CSS contrast/focus and 320px reflow checks | Ratios above were calculated; search input computed outline was `none`; body width equaled the 320px viewport. No full zoom or screen-reader test was performed. |
| Local Next.js response-header inspection | No CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, or `X-Content-Type-Options` on the inspected local HTML response. Production may differ. |
| Backend synthetic stale-IP probe | A one-hour-old key remained after another API request. The initial ad-hoc probe failed because its test client did not start FastAPI lifespan; the corrected probe passed. |
| Production, legal, penetration, and assistive-technology review | **Not performed / unable to verify.** No live account or deployment was inspected. |

No test result here should be read as proof that every route, browser, jurisdiction, or production setting is safe or compliant.

## 8. Change summary

This follow-up adds only `development-plans/AUDIT.md`. No application code, dependency, environment variable, migration, vendor setting, or deployed service was changed. The pre-existing dirty working tree was left intact.

## 9. Remediation follow-up (2026-09-23)

The following work addresses code-level findings in the audited working tree. The historical status matrix above remains the baseline, not a claim about the updated application.

| Audit finding | Change made | Remaining limit |
| --- | --- | --- |
| 3, 6, 9 — no timely data-use explanation or removal control | Added a concise search/location notice, a discoverable `/data-use` explanation, and a footer control that deletes both app-owned browser-storage keys. | This is a factual technical explanation, **not** a complete legal privacy notice. Host settings, operator identity, contact, jurisdiction, and approved retention policy remain unknown. |
| 7 — search terms and coordinates in browser GET URLs | Browser API calls now use JSON POST bodies. Backend POST endpoints validate the same inputs as the existing GET routes. Tests assert that browser API URLs have no query strings. | The public compatibility GET routes and Open-Meteo upstream calls still use query parameters. POST bodies can also be logged by a host if configured to do so; live platform settings were not inspected. Exact device coordinates remain necessary for the present forecast behavior pending a product decision. |
| 7 — stale IP and cache entries | A running backend prunes expired rate-limit entries and expired provider-cache entries every 60 seconds. Cache entries are also pruned on provider-cache access. Added unit coverage for both cleanup functions. | In-memory state is per process. Host and provider retention are independent and unverified. |
| 10, 12, 13 — contrast and focus | Darkened affected text/button colors and gave the focused search box a high-contrast ring. Added repeatable axe-core contrast checks for desktop/mobile forecast, error, and data-use pages. | These checks found zero automated text-contrast violations in those states, but cannot establish full WCAG 2.2 conformance. Screen-reader, zoom/text-spacing, forced-colors, and live-browser reviews remain. |
| 18 — incomplete provider license credit | Footer now links to Open-Meteo, GeoNames, and CC BY 4.0 and notes that source data are adapted for display. | Local favicon/art provenance and the sufficiency of all attribution still require owner/license review. |
| 20 — missing local HTML security headers | Next.js now serves CSP, frame-denial, no-referrer, nosniff, and feature-permissions headers. Browser tests verify the built HTML response. | CSP permits inline Next.js scripts to preserve static rendering; this is not a strict nonce-based CSP. Production edge behavior remains unverified. Wildcard proxy trust was removed in section 14; the public-path check is pending. |

**Still blocked before a truthful public compliance claim:** confirm and, if needed, revoke the historical credential; supply the real operator/contact, target markets, and a supportable storage/log-retention policy; inspect live Vercel/Render logging, forwarding, analytics, and response headers; decide whether site terms or storage consent are required; verify local-asset provenance and provider licensing; perform manual assistive-technology testing. No credential was printed, Git history was not rewritten, and no hosting account was changed. The application's intentional lack of authentication remains unchanged.

**Follow-up verification:** 23 backend pytest tests, Ruff, mypy, and API-type checks passed; frontend lint, typecheck, 16 unit tests, production build, and 14 Playwright desktop/mobile tests passed. The new axe-core checks reported no automated `color-contrast` violations in the tested forecast, error, or data-use states. These are local results with mocked browser API responses, not production or legal validation.

## 10. Owner facts and retention clarification (2026-09-23)

The owner provided the public app-contact name **Faraz Hussain** and email **farazhussain5000@gmail.com**. These now appear on `/data-use`. The intended audience was described provisionally as worldwide; that does not establish the operator's country of establishment or prove compliance with every country's rules.

Here, **retention** means the time a data item remains in each place it is stored, plus how it is removed. The code currently gives forecast cache entries a five-minute lifetime, geocoding cache entries a 24-hour lifetime, and IP rate-limit entries a 60-second window. A running backend cleans expired entries every 60 seconds, and a restart clears all in-memory state. Browser `atmos-units` and `atmos-recent` entries do **not** expire automatically; the user can clear them from the app or browser. Open-Meteo states that its free-API webserver logs may include coordinates and are deleted after 90 days. Actual Vercel/Render logging, plan-dependent retention, and any log exports remain unverified. See [Open-Meteo terms](https://open-meteo.com/en/terms), [Vercel runtime logs](https://vercel.com/docs/logs/runtime), and [Render logging](https://render.com/docs/logging).

**Decision at that point (resolved in section 11):** whether saved recent places and units should persist until the visitor clears them, expire after a chosen period, or be limited to a browser session. There is no universally correct number of days; the choice should match the feature's purpose and the audience. Separately, inspect live hosting settings before stating any host-log deadline. The owner's country of establishment and historical-credential revocation status also remain unconfirmed.

## 11. Browser retention decision and forecast layout (2026-09-23)

The owner delegated the browser-retention choice. The application now keeps a selected recent place for **30 days from its selection** and a temperature-unit preference for **180 days from its change**. Entries are timestamped, validated, and removed when the app is next opened after expiry; visitors may clear both sooner. The previous untimed format is migrated once with a fresh timestamp rather than silently discarding existing choices, so migrated entries have at most one new retention window. This is a product choice, not a universal legal threshold. Backend and third-party retention described above did not change.

The hourly and seven-day forecast panels now stack vertically at all widths, matching the owner's requested layout. Automated browser tests verify their top-to-bottom order. The public data-use explanation and README now state the chosen browser periods. Live host-log retention, full legal notice, operator jurisdiction, and historical-credential status remain unverified.

## 12. Weather Glint naming follow-up (2026-09-23)

The owner selected **Weather Glint** as the app name. Current UI branding, page metadata, the backend API title, package names, and current README text now use it. Browser storage uses `weather-glint-recent` and `weather-glint-units`; a one-time migration preserves valid `atmos-recent` and `atmos-units` values, then removes the old keys. The clear-data control removes both generations of keys. Sections above retain their original audit wording as a historical record.

The Render Blueprint's `atmos-weather-api` service identifier remains unchanged to avoid accidentally creating a replacement service or changing an existing deployment URL. This is an infrastructure name, not public branding. The VM deployment backup is likewise historical. No live Vercel or Render settings were changed by this naming update.

## 13. Owner confirmation and Phase 1 research (2026-09-24)

Faraz Hussain reports that the exposed OpenWeather key was **revoked two years ago after a GitGuardian alert**. Treat the active-credential risk as resolved on the owner's confirmation; no secret was used or printed in this follow-up. Older sections preserve what was unknown at their audit date. The owner also confirmed that he is the sole operator, established in **Karachi, Pakistan**, intends a **worldwide** audience, and accepts Render Free's idle spin-down for a low-traffic hobby launch.

The [Plan 03 open problems](development-plan-03.md#open-problems) track the remaining legal, hosting, licensing, live proxy-boundary, and accessibility checks. Research did **not** inspect live Vercel or Render accounts, resolve all jurisdiction-specific legal questions, establish asset authorship, or complete a manual screen-reader/zoom audit. The wildcard forwarded-header setting noted at this checkpoint was subsequently removed; see the update below. Historical key revocation is no longer an open issue.

## 14. Proxy-trust hardening (2026-09-25)

The backend Docker command now uses Uvicorn `--no-proxy-headers`, so caller-supplied `X-Forwarded-For` cannot rewrite `request.client.host`. On Render only, the rate-limit key uses a single validated `CF-Connecting-IP` value that [Render says its edge overwrites](https://render.com/articles/host-pocketbase-on-render); missing, duplicate, or invalid values fall back to the connection peer. [Uvicorn documents](https://uvicorn.dev/settings/) that proxy headers otherwise populate the apparent client address. Local tests cover forged `X-Forwarded-For`, non-Render header rejection, and invalid Render header fallback.

This closes the source-level wildcard-trust finding, **not** the live-platform verification. Vercel-rewritten traffic may share a Vercel egress address and one rate-limit bucket; the actual public chain and spoof resistance still need harmless preview tests under [Plan 03's hosting problem](development-plan-03.md#2-live-hosting-behavior-is-unverified). No public Render or Vercel deployment was accessed for this update.
