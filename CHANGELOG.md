# Changelog

## Unreleased — 2026-09-25

- Removed wildcard proxy-header trust from the backend container and hardened the rate-limit key to use only Render's validated edge client IP or the connection peer; added spoofing and deployment-command regression tests.

## Unreleased — 2026-09-24
- Added a local-time solar outlook with nullable sunrise, sunset, and daily maximum UV index, plus an optional 12-hour comparison trend.
- Added locale-aware date/number/temperature formatting, safer place-link copying, removable recent places, and long/RTL place-name handling.
- Added explicit current/hourly/daily forecast age windows and a visible last-success/stale state.
- Added process-local provider call budgets and privacy-conscious minute summaries for errors, latency and cache effectiveness; malformed provider responses are no longer cached.
- Added an opt-in two-call Open-Meteo smoke, DST fall-back validation, additional failure/recovery tests, and a CI API-contract check.
- Split dashboard search, forecast loading and browser preference logic into testable hooks; added a repeatable local performance baseline and reliability runbook.
