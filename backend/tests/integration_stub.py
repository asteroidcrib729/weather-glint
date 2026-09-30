"""Loopback-only upstream fixture for the local browser integration check."""

from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

app = FastAPI()
weather_requests = 0


@app.get("/search")
def search(name: str) -> dict[str, object]:
    if "lon" not in name.lower():
        return {"results": []}
    return {
        "results": [
            {
                "id": 2643743,
                "name": "London",
                "admin1": "England",
                "country": "United Kingdom",
                "country_code": "GB",
                "latitude": 51.5085,
                "longitude": -0.1257,
                "timezone": "Europe/London",
            }
        ]
    }


@app.get("/stats")
def stats() -> dict[str, int]:
    return {"weather_requests": weather_requests}


@app.get("/met")
def met(
    request: Request,
    lat: str = Query(),
    lon: str = Query(),
) -> JSONResponse:
    global weather_requests
    expected = "WeatherGlint/1.0 (+https://github.com/asteroidcrib729/weather-glint)"
    if request.headers.get("user-agent") != expected:
        raise HTTPException(status_code=403, detail="identifying User-Agent required")
    if len(lat.partition(".")[2]) > 4 or len(lon.partition(".")[2]) > 4:
        raise HTTPException(status_code=403, detail="coordinate precision exceeded")
    weather_requests += 1
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    hours = list(range(49)) + list(range(54, 223, 6))
    local_zone = ZoneInfo("Europe/London" if float(lat) > 40 else "Asia/Karachi")
    series = []
    for hour in hours:
        time = start + timedelta(hours=hour)
        local_hour = time.astimezone(local_zone).hour
        symbol = "partlycloudy_day" if 6 <= local_hour < 18 else "partlycloudy_night"
        period = "next_1_hours" if hour < 49 else "next_6_hours"
        series.append(
            {
                "time": time.isoformat().replace("+00:00", "Z"),
                "data": {
                    "instant": {
                        "details": {
                            "air_temperature": 28.0,
                            "relative_humidity": 70.0,
                            "wind_speed": 3.0,
                            "wind_from_direction": 250.0,
                        }
                    },
                    period: {
                        "summary": {"symbol_code": symbol},
                        "details": {
                            "precipitation_amount": (
                                9.9 if hour == 0 else 1.4 if float(lat) > 40 else 0.2
                            ),
                            "air_temperature_max": 32.0,
                            "air_temperature_min": 26.0,
                        },
                    },
                },
            }
        )
    payload = {
        "properties": {
            "meta": {
                "units": {
                    "air_temperature": "celsius",
                    "wind_speed": "m/s",
                    "precipitation_amount": "mm",
                }
            },
            "timeseries": series,
        }
    }
    expires = format_datetime(datetime.now(UTC) + timedelta(hours=1), usegmt=True)
    modified = format_datetime(datetime.now(UTC) - timedelta(hours=1), usegmt=True)
    return JSONResponse(
        payload,
        headers={
            "Expires": expires,
            "Last-Modified": modified,
        },
    )
