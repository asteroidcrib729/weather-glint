// Generated from backend Pydantic response schemas. Run: uv run python -m backend.scripts.check_api_types --write

export type Location = {
  id: number;
  name: string;
  admin1?: string | null;
  country: string;
  country_code?: string | null;
  latitude: number;
  longitude: number;
  timezone?: string | null;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type CurrentWeather = {
  time: string;
  temperature: number;
  apparent_temperature: number;
  humidity_percent: number;
  precipitation: number;
  wind_speed: number;
  wind_direction_degrees: number;
  is_day: boolean;
  weather_code: number;
  condition: string;
};

export type DailyWeather = {
  date: string;
  temperature_max: number;
  temperature_min: number;
  precipitation_probability_max_percent: number | null;
  weather_code: number;
  condition: string;
  sunrise?: string | null;
  sunset?: string | null;
  uv_index_max?: number | null;
};

export type HourlyWeather = {
  time: string;
  temperature: number;
  precipitation_probability_percent: number | null;
  is_day: boolean;
  weather_code: number;
  condition: string;
};

export type WeatherUnits = {
  temperature: "°C" | "°F";
  wind_speed: "km/h" | "mph";
  precipitation: "mm" | "in";
};

export type Weather = {
  location: Coordinates;
  timezone: string;
  generated_at: string;
  units: WeatherUnits;
  current: CurrentWeather;
  hourly: Array<HourlyWeather>;
  daily: Array<DailyWeather>;
  source?: string;
  attribution_url?: string;
};
