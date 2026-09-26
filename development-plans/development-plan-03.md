# Development Plan 03 — Open Problems

**Updated:** 2026-09-25. This file tracks unresolved work for a small public, accountless app—not an enterprise-scale service. Add capacity only when demand justifies it; authentication is out of scope. Worldwide availability does not imply multilingual support: English is the supported interface language. Issue numbers are retained after removing the deferred legal-review item.

## Open problems

### 2. Live hosting behavior is unverified

**Problem:** Source configuration does not prove what Vercel and Render log, retain, export, or return at the public URLs.

**Solution:** Inspect both dashboards for plans, analytics, log drains, retention, and environment settings. Test HTTPS, security headers, rewrite, direct API, health, rate limits, cold starts, and resistance to forged forwarding headers on both public paths with non-sensitive requests. The wildcard proxy trust has been removed in source; the live edge still needs verification. Record results in [DEPLOYMENT.md](DEPLOYMENT.md) and align the privacy notice with them.

### 3. Screen-reader verification remains

**Problem:** Zoom and automated browser checks pass, and a subsequent Chrome Reading Mode retest showed the correct `/data-use` page. A real screen-reader session is still unverified; Reading Mode does not replace it.

**Solution:** Use NVDA with Chrome or Narrator with Edge for search, theme, units, refresh, hourly scrolling, clear-data, geolocation denial, loading, stale/offline, and error states. Fix and retest any announcement or focus failures before making a full accessibility claim.

### 4. Real-device and deployed performance are unknown

**Problem:** The [reliability baseline](RELIABILITY.md) is synthetic and local, not a real-device or public-path measurement.

**Solution:** After deployment, try page load, search, forecast, and refresh on a phone and laptop. Note whether Render was waking from idle; fix delays or layout shifts you actually observe. Use [Core Web Vitals](https://web.dev/articles/vitals) diagnostics if a problem needs investigation, not as an enterprise-scale launch gate.

### 5. Provider use lacks real-traffic evidence

**Problem:** Local smoke checks and process-level quotas do not reveal cache effectiveness or upstream calls under actual use.

**Solution:** After launch, periodically review existing privacy-conscious summaries for provider errors, throttling, cache hits, and quota use. Fix observed problems and increase resources only when demand warrants it; do not add a monitoring stack or log search text/coordinates just for an initial hobby release.

### 6. First public deployment needs verification

**Problem:** The Vercel + Render app has not yet been checked at its public URL. A first deployment has no earlier working release to roll back to.

**Solution:** Deploy, then personally test page load, search, forecast, refresh, unit/theme controls, location permission and denial, sharing, and error states. Verify the deployed Open-Meteo/GeoNames/CC BY footer credits and links. Record issues and fix/redeploy them. Keep the deployed Git commit for reference; rollback is a contingency for later bad updates, not a first-deployment requirement. Use [DEPLOYMENT.md](DEPLOYMENT.md) for the launch steps.

### 7. Core-task clarity needs a hands-on check

**Problem:** Automated tests cannot tell whether the forecast and controls feel clear when used on the deployed site.

**Solution:** After deployment, personally use the hourly cards and optional trend, then complete search, recent-place removal, geolocation-denial recovery, theme/unit switching, refresh, and sharing on phone and desktop. Fix anything confusing and retest it. External user research is optional, not a release gate.
