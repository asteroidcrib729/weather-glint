# Development Plan 04 - Free weather-provider migration

**Updated:** 2026-09-30

**Status:** MET Norway forecast migration implemented and tested locally; not deployed or verified from Render/Vercel.

**Constraint:** No paid weather API, billing-enabled overage, or expiring trial as the production solution.

**Render-origin status:** The opt-in MET Norway probe and process-local one-request-per-second limiter are implemented. No Render-origin result has been recorded for the new forecast path; production still runs the previously deployed code until this revision is released.

**Local validation (2026-09-30):** Backend Ruff, mypy and 45 tests passed. Frontend formatting, lint, typecheck, 27 unit tests, production build and 58 browser regression tests passed. A separate production-build browser integration test passed through Next.js → FastAPI → the MET adapter, using a deterministic MET-format upstream stub; it checked Karachi, search-to-London, 24 hours, seven days, source credit, and cache reuse on refresh. An identified, paced live MET request also returned a usable forecast from this laptop. None of these tests establishes Render-origin access or production Vercel behavior.

## Incident and recommendation

The deployed Vercel frontend reaches the Render backend, but Open-Meteo returns HTTP 429 to the backend's forecast request. After bounded retries, the backend returns HTTP 503. A healthy backend or working place search does not prove the separate forecast path works. [Render shares outbound IP ranges](https://render.com/docs/outbound-ip-addresses), so shared-egress limiting is plausible, not confirmed. A Vercel rewrite change or more retries will not change Render's outbound IP.

**Chosen provider:** Verify [MET Norway Locationforecast 2.0](https://api.met.no/doc/locationforecast/HowTO) from the *running Render service*. It covers the world for about nine days, allows [commercial reuse with attribution](https://api.met.no/doc/License), and publishes no daily-call quota. Its [terms](https://api.met.no/doc/TermsOfService) require identification and caching; more than 20 requests/second *per application* requires special agreement. That threshold is not an unlimited-use guarantee or SLA.

This is a capacity-first choice, **not full feature parity**. MET Norway's [global forecast](https://docs.api.met.no/doc/locationforecast/datamodel.html) does not provide precipitation probability. Its UV field is a clear-sky estimate, not the app's current daily-maximum UV metric; it also lacks a direct feels-like value. These must not be fabricated or silently relabeled.

**Shared-IP finding:** [Render says outbound IP ranges are shared by services in a region](https://render.com/docs/outbound-ip-addresses). MET Norway documents [403/429 responses for missing identification and excessive traffic](https://api.met.no/doc/FAQ) and asks callers to provide both IP and User-Agent when investigating 429s. It does not publish an exemption or isolation guarantee for shared cloud IPs. Therefore, another Render tenant could plausibly affect access, but no MET Norway block on this Render service has been observed. Only the live Render-origin pilot can establish current reachability; it cannot guarantee future availability. The one-request-per-second limiter bounds this process's own starts, not other tenants' traffic. Its rolling 86,400-request counter resets on process restart; a hard cross-restart or multi-instance cap would require durable shared coordination.

## Free options assessed

| Provider | Free capacity and fit | Limitation |
| --- | --- | --- |
| [MET Norway](https://api.met.no/doc/locationforecast/HowTO) | One worldwide forecast response per place; about nine days; no published daily quota. | No global rain probability or equivalent daily maximum UV; no direct feels-like value. Requires separate search, identifying User-Agent and cache-header compliance. No SLA. |
| [Visual Crossing Free](https://www.visualcrossing.com/weather-data-pricing/) | 1,000 records/day; a single-location full 15-day forecast [counts as one record](https://www.visualcrossing.com/resources/documentation/weather-data/what-exactly-is-a-weather-record/). Its [fields](https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/) closely match the UI; free plan permits commercial use. | One concurrent request. [Current terms](https://www.visualcrossing.com/weather-service-terms/) restrict public raw-data API access and storage by license level. Clarify Weather Glint's JSON backend/cache rights or verify a compliant design before adopting. Keep any key server-side and billing disabled. |
| [Foreca Freemium](https://business.foreca.com/weather-api/pricing) | 2,000 requests/day and 10 requests/second; [current, hourly and daily endpoints](https://developer.foreca.com/docs/point-forecasts) document many needed fields. | Strictly non-commercial; deactivates after 30 days idle. Multiple endpoints consume several requests per forecast. Confirm the permanent free entitlement includes the full dataset needed for daily rain probability, UV and sunrise/sunset. Its separate 30-day trial is not a production solution. |
| [WeatherAPI.com Free](https://www.weatherapi.com/pricing.aspx) | Current weather and search, 100,000 calls/month. | Only three forecast days, so it cannot retain Weather Glint's seven-day view. |

[Open-Meteo Free](https://open-meteo.com/en/pricing) advertises 10,000 calls/day. No verified permanently free candidate above simultaneously matches that quota, every current field and Weather Glint's public-API pattern without qualification. Paid tiers are excluded. Recheck terms and entitlements at sign-up and release.

## Product contract and honest degradation

Weather Glint remains worldwide, English-language and accountless, with place search, seven local forecast dates, the next 24 forecast hours, unit switching, share links, freshness/stale status and privacy-safe device location. Preserve the existing frontend API and numeric GeoNames-derived place IDs where possible. The active MET forecast cache honors provider expiry and conditional revalidation; the Open-Meteo search cache remains at 24 hours.

The local MET migration implements these field rules:

- Map temperature, humidity, wind and conditions correctly. A next-one-hour precipitation amount is a *forecast for the next hour*, not precipitation occurring now. Relabel or omit the current-amount tile.
- Assemble 24 hourly points and seven local dates from one-hour short-range and six-hour medium-range steps using the place's time zone. Verify daily high/low aggregation and do not represent a partial interval as a complete day.
- Show rain probability as unavailable or hide it in hourly and daily views globally. Do not turn precipitation amount or weather symbols into invented percentages.
- Omit the current maximum UV index until an equivalent source exists. An optional clear-sky-potential display needs different wording and coverage checks; [MET's field](https://docs.api.met.no/doc/locationforecast/datamodel.html) is not interchangeable with a cloud-adjusted daily maximum.
- Omit feels-like temperature initially, or calculate it locally with a documented, tested method and label it as an estimate.
- Calculate sunrise/sunset locally from coordinates, date and time zone, including polar-day/night cases, or evaluate MET's [separate Sunrise API](https://api.met.no/weatherapi/sunrise/3.0/documentation). Avoid seven extra uncached requests per forecast view.
- Map MET symbol codes to existing icons/conditions with an unknown-code fallback. Do not pass them into the WMO-code mapper unchanged.

Keep the working Open-Meteo geocoding endpoint temporarily if Render-origin search remains reliable. The forecast-provider switch does not require changing search simultaneously; this is a staged migration, **not full independence from Open-Meteo**. If search also fails, evaluate [GeoNames search](https://www.geonames.org/export/geonames-search.html), whose [free service](https://www.geonames.org/export/) publishes 10,000 credits/day and 1,000/hour and can retain compatible place IDs. Test secure HTTPS access and the registered account from Render first; do not use the demo username. Preserve ambiguous-city disambiguation and old share/recent-place links. Never store exact device coordinates in recent places or share URLs.

## Gate 1 - Render-origin verification still pending

1. Review current provider terms. For MET Norway, use HTTPS, coordinates with at most four decimals, gzip/redirect support, and an identifying User-Agent with Weather Glint plus a reachable contact address or website. No generic or fictitious identity. These are [service requirements](https://api.met.no/doc/TermsOfService).
2. [Render Free has no shell or one-off jobs](https://render.com/docs/free). Add a temporary, opt-in, **one-shot** backend diagnostic that runs only when deliberately enabled on the deployed service. Use fixed cities (Karachi, London, one Southern Hemisphere location) and sanitized logs. Do not expose a public diagnostic endpoint or log device coordinates, typed searches, full provider URLs or response bodies.
3. From the running Render instance, request MET forecasts sparingly. Record status, latency, Expires/Last-Modified, response size, horizon, usable fields and a request ID. Verify seven local dates and 24 hourly points at each test location.
4. Repeat a small test after restart and later in the day. Distinguish cold-start delay from warm upstream latency. Confirm no 403/429 and test conditional revalidation after expiry. Then disable and remove the diagnostic. A local laptop test is insufficient.
5. Promote the locally tested adapter only if Render consistently receives usable forecasts and the reduced rain-probability/UV/feels-like presentation remains acceptable. If not, assess the conditional free alternatives without creating a retry storm.

## Gate 2 - Local implementation completed; Render verification pending

1. Add a provider-specific backend client, response validation and adapter behind the existing frontend API. Use bounded timeouts, conservative retries honoring Retry-After, request coalescing, sanitized errors and a local call budget. Distinguish 403 identification failure, 429 throttling, malformed data and outage. Do not automatically fall back to a persistently blocked Open-Meteo forecast endpoint.
2. Honor MET's Expires and Last-Modified headers: reuse data until expiry and revalidate conditionally afterwards. Keep observation time, fetch time and stale state distinct. Avoid scheduled refresh bursts. Follow [MET's cache rules](https://api.met.no/doc/TermsOfService).
3. Make absent metrics nullable in the API, then update the frontend so missing rain chance or UV never appears as zero. Test dates, units and the field behavior above.
4. Retain current geocoding and legacy IDs until a separate search migration is proven. Credit MET Norway near the forecast, link its [license](https://api.met.no/doc/License), identify transformed/derived values and do not imply endorsement. Keep GeoNames credit where its data remains in use.
5. Update the data-use page, README, API description, deployment/reliability runbooks and opt-in live smoke to reflect the actual provider and its coordinate/logging behavior. Remove inaccurate Open-Meteo-only claims after the switch.

## Gate 3 - Verification and release

- Test success, absent global fields, unknown conditions, 304 revalidation, 403, 429 with/without Retry-After, 5xx, timeout, malformed dates, units, local midnight, daylight-saving transitions and polar sunrise/sunset. Keep routine CI offline and live checks opt-in.
- Check old share links, duplicate cities, recent places, manual search, GPS permission, seven-day/hourly views, refresh, stale/offline behavior, source credit and data-use text on desktop, mobile and high zoom.
- Deploy a compatible backend to pre-production first, then the frontend. Verify direct Render health **and** search/forecast, followed by Vercel's same-origin API path after cold start and refresh. Record deployment IDs and sanitized results.
- Promote only after the public path works. Monitor provider 429/5xx, cache hits, upstream volume and user-visible stale states. Keep a known-good Git revision; rolling back to Open-Meteo alone may not restore forecasts.

## Open decision and completion criteria

**Decision:** The requested local MET adapter uses honest unavailable states for global rain probability, daily maximum UV, and feels-like temperature. No paid API is a fallback. Alternative providers remain research options if Render-origin MET access fails.

The local migration is complete, but the production incident is not resolved yet. It requires a successful MET forecast from Render and production search plus seven-day forecasts through Vercel after cold start and refresh. No deployment was performed during the local test pass.
