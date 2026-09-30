# Third-party credits and asset record

Reviewed against the current repository and linked provider terms on 2026-09-28. This records the sources used by Weather Glint; it does not replace their own licenses or service terms.

## Data and services shown to visitors

| Source | Use and credit | Governing information |
| --- | --- | --- |
| [MET Norway](https://api.met.no/) | Locationforecast weather data. Weather Glint selects fields, maps conditions, derives local-day high/low values from forecast periods, converts units, and formats the data for display. | [Forecast license](https://api.met.no/doc/License), [service terms](https://api.met.no/doc/TermsOfService), and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution does not imply MET Norway endorses this app. |
| [Open-Meteo](https://open-meteo.com/) | Place search/geocoding only; not the active forecast source. | [API terms](https://open-meteo.com/en/terms) and [CC BY 4.0 data license](https://creativecommons.org/licenses/by/4.0/). The free API service is for non-commercial use under published limits; the data license is a separate matter. |
| [GeoNames](https://www.geonames.org/) | Location data supplied through [Open-Meteo's geocoding API](https://open-meteo.com/en/docs/geocoding-api). Weather Glint uses selected result fields to build search labels and place links. | [GeoNames data and web-service terms](https://www.geonames.org/export/) state that the data is CC BY and request credit. See also [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). |

The forecast footer displays linked MET Norway, Open-Meteo, GeoNames, and CC BY 4.0 credits and says that data is adapted for display. The app does not use Open-Meteo's example country flags or its server source code. Credit does not imply that any provider endorses Weather Glint.

## Original project assets

At Faraz Hussain's direction, the original Weather Glint implementation and visual assets are attributed to him and made reusable under the separate MIT and CC BY 4.0 terms in [LICENSE.md](LICENSE.md). The current source inventory found:

- `frontend/src/app/icon.svg`: project favicon.
- `frontend/src/components/theme-toggle.tsx`: inline sun and moon SVGs.
- `frontend/src/components/current-conditions.tsx`: CSS/Tailwind-drawn weather illustration.
- Other interface artwork: code, CSS, and text/Unicode symbols, rather than downloaded image, icon, or font assets.

The project uses system Arial/Helvetica fallbacks; it does not bundle those typefaces. This is a repository inventory and owner attribution, not independent proof of authorship for every historical contribution. Check provenance before adding any new external artwork, fonts, or copied text.

## Software dependencies

The application uses third-party software, including [Next.js](https://nextjs.org/), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [FastAPI](https://fastapi.tiangolo.com/), [HTTPX](https://www.python-httpx.org/), [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/), and [Uvicorn](https://www.uvicorn.org/). Their copyrights and licenses remain with their respective owners. See `frontend/package.json`, `frontend/package-lock.json`, `pyproject.toml`, and `uv.lock` for the direct and resolved dependency inventory, then each package's own license for its terms. This list is not an exhaustive notice for every transitive package.

Before public release, verify that the deployed footer displays its credits and that its links work. Recheck provider terms if the app is monetized or its data sources change.
