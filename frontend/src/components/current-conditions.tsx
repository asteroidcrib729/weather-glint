"use client";

import {
  formatClock,
  formatDate,
  formatNumber,
  formatPrecipitation,
  formatProbability,
  formatTemperature,
  weatherSymbol,
  type Location,
  type UnitSystem,
  type Weather,
} from "@/lib/weather";

const kicker = "text-[10px] font-extrabold tracking-[.17em]";
const metric =
  "metric relative flex min-h-[149px] flex-col items-start rounded-2xl border border-[#e3edeb] bg-white px-[23px] pt-[23px] pb-[17px] shadow-[0_4px_16px_#20576308] max-[670px]:min-h-[127px] max-[670px]:px-4 max-[670px]:pt-[19px] dark:border-[#36515b] dark:bg-[#172a35] dark:shadow-none";
const metricIcon =
  "metric-icon absolute top-[17px] right-5 grid size-[33px] place-items-center rounded-[10px] bg-[#e8f6f2] text-[25px] leading-none text-[#1a9f99] max-[670px]:top-3 max-[670px]:right-3 max-[670px]:size-[27px] max-[670px]:text-xl dark:bg-[#27535a] dark:text-[#94f0dc]";
const metricLabel = `${kicker} metric-label mb-[13px] text-[#47656d] dark:text-[#b0cbd0]`;
const metricValue =
  "text-[27px] leading-[1.1] font-bold tracking-[-.045em] text-[#1d4654] max-[670px]:text-[23px] dark:text-[#e9f6f4]";
const metricDetail =
  "metric-detail mt-[7px] text-[11px] text-[#47656d] dark:text-[#b0cbd0]";
const unitButton =
  "inline-flex h-8 min-w-[42px] items-center justify-center rounded-[17px] border-0 text-[13px] leading-none font-bold";
const unitSelected =
  "selected bg-white text-[#125666] shadow-[0_2px_7px_#102f401c] dark:bg-[#e9f6f4]";
const unitUnselected = "bg-transparent text-[#e8f6f4]";
const cloud =
  "cloud absolute rounded-[110px_110px_80px_80px] bg-[#e8ffffe9] drop-shadow-[0_20px_20px_#053f5760] before:absolute before:rounded-full before:bg-inherit before:content-[''] after:absolute after:rounded-full after:bg-inherit after:content-['']";

export function CurrentConditions({
  weather,
  location,
  units,
  locale,
  onChangeUnits,
}: {
  weather: Weather;
  location: Location;
  units: UnitSystem;
  locale: string;
  onChangeUnits: (units: UnitSystem) => void;
}) {
  const current = weather.current;
  const today = weather.daily[0];
  const region = [location.admin1, location.country].filter(Boolean).join(", ");
  if (!today) return null;

  return (
    <>
      <section
        className="hero-weather relative min-h-[376px] overflow-hidden rounded-[22px] bg-[linear-gradient(113deg,#086579_0%,#08788a_52%,#0a9b9b_100%)] text-white shadow-[0_18px_34px_#075a7320] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_82%_46%,#64d6bc44_0,transparent_30%)] before:content-[''] max-[950px]:min-h-[375px] max-[670px]:min-h-[376px] dark:bg-[linear-gradient(113deg,#123c55_0%,#125d6e_52%,#147a79_100%)]"
        aria-labelledby="current-heading"
      >
        <div className="hero-main relative z-2 px-10 pt-[34px] pb-[65px] max-[670px]:px-[25px] max-[670px]:pt-[25px]">
          {/*
          <div className={`hero-overline ${kicker} mb-[15px] text-[#9fe3da]`}>
            <span
              className="location-pin mr-[5px] align-[-3px] text-xl font-normal"
              aria-hidden="true"
            >
              ⌖
            </span>{" "}
            CURRENT CONDITIONS
          </div>
          */}
          <h2
            id="current-heading"
            className="m-0 text-[31px] leading-[1.2] font-extrabold tracking-[-.035em] wrap-anywhere max-[670px]:text-[27px] max-[390px]:text-2xl"
            dir="auto"
          >
            {location.name}{region ? "," : ""}
            {region && <span
              className="location-region ml-3 text-[13px] font-medium tracking-normal text-[#b7ece5] wrap-anywhere max-[670px]:mt-1 max-[670px]:ml-0 max-[670px]:block"
              dir="auto"
            >
              {" "}{region}
            </span>}
          </h2>
          <p className="hero-date mt-2 mb-[17px] text-[13px] text-[#b9e5e4]">
            {formatDate(current.time, locale)} ·{" "}
            {formatClock(current.time, locale)} local time
          </p>
          <div className="temperature-row flex min-h-[115px] flex-wrap items-center gap-3 max-[670px]:h-[98px]">
            <span className="hero-temp text-[100px] leading-none font-bold tracking-[-.085em] max-[670px]:text-[80px] max-[390px]:text-[70px]">
              {formatNumber(current.temperature, locale)}°
            </span>
            <div
              className="unit-switch hero-unit-switch ml-[5px] flex flex-none items-center gap-0.5 rounded-[22px] border border-[#b7e9e577] bg-[#103f57a6] p-1"
              role="group"
              aria-label="Temperature units"
            >
              <button
                type="button"
                className={`${unitButton} ${units === "metric" ? unitSelected : unitUnselected}`}
                onClick={() => onChangeUnits("metric")}
                aria-pressed={units === "metric"}
              >
                °C
              </button>
              <button
                type="button"
                className={`${unitButton} ${units === "imperial" ? unitSelected : unitUnselected}`}
                onClick={() => onChangeUnits("imperial")}
                aria-pressed={units === "imperial"}
              >
                °F
              </button>
            </div>
            <span
              className="hero-symbol hidden text-[82px] text-[#ffe8a1]"
              aria-hidden="true"
            >
              {weatherSymbol(current.weather_code, current.is_day)}
            </span>
          </div>
          <p className="hero-condition mt-[6px] mb-0.5 text-[21px] font-bold">
            {current.condition}
          </p>
          <p className="hero-feels text-[13px] text-[#c0e8e8]">
            Feels like{" "}
            {formatTemperature(current.apparent_temperature, units, locale)}
          </p>
          <div className="hero-range mt-[17px] flex gap-[17px] text-[13px] font-bold">
            <span>
              ↑ {formatTemperature(today.temperature_max, units, locale)}
            </span>
            <span className="text-[#b8e7e7]">
              ↓ {formatTemperature(today.temperature_min, units, locale)}
            </span>
          </div>
        </div>
        <div
          className="hero-art absolute top-[11%] right-[7%] z-1 h-[295px] w-[380px] max-[950px]:-right-[6%] max-[670px]:top-[100px] max-[670px]:-right-[130px] max-[670px]:origin-top-right max-[670px]:scale-[.72] max-[670px]:opacity-60 max-[390px]:opacity-50"
          aria-hidden="true"
        >
          <div className="sun-glow absolute top-0 right-[53px] size-[270px] rounded-full bg-[#dafbe162] blur-[22px]" />
          <div className="sun-disc absolute top-7 right-[71px] size-[207px] rounded-full bg-[linear-gradient(135deg,#fff6d3,#ffce79)] shadow-[0_0_45px_#f8e4ac8c]" />
          <div
            className={`${cloud} cloud-back right-[-15px] bottom-[52px] h-[60px] w-[210px] opacity-[.58] before:top-[-50px] before:left-[27px] before:size-[100px] after:top-[-27px] after:right-[26px] after:size-[74px]`}
          />
          <div
            className={`${cloud} cloud-front right-[105px] bottom-[18px] h-[66px] w-[220px] before:top-[-55px] before:left-[25px] before:size-[112px] after:top-[-30px] after:right-[23px] after:size-[83px]`}
          />
        </div>
        <div className="hero-bottom absolute right-0 bottom-0 left-0 z-3 flex h-[43px] items-center justify-between border-t border-[#b4f3eb32] bg-[#053d5536] px-10 text-[11px] text-[#bae3e2] max-[670px]:px-6">
          A fresh perspective on your forecast{" "}
          <span className="text-[#d9f4ed] max-[670px]:hidden">
            {weather.timezone.replaceAll("_", " ")}
          </span>
        </div>
      </section>

      <section
        className="metrics-grid mt-[18px] mb-[27px] grid grid-cols-4 gap-4 max-[670px]:mt-3 max-[670px]:mb-[17px] max-[670px]:grid-cols-2 max-[670px]:gap-[10px] max-[500px]:grid-cols-1"
        aria-label="Current weather details"
      >
        <div className={metric}>
          <span className={metricIcon} aria-hidden="true">
            ◌
          </span>
          <span className={metricLabel}>HUMIDITY</span>
          <strong className={metricValue}>
            {formatProbability(current.humidity_percent, locale)}
          </strong>
          <span className={metricDetail}>Moisture in the air</span>
        </div>
        <div className={metric}>
          <span className={metricIcon} aria-hidden="true">
            ↝
          </span>
          <span className={metricLabel}>WIND</span>
          <strong className={metricValue}>
            {formatNumber(current.wind_speed, locale)}{" "}
            <small className="text-[13px] font-semibold tracking-normal text-[#365761] dark:text-[#bcd4d7]">
              {weather.units.wind_speed}
            </small>
          </strong>
          <span className={metricDetail}>
            From {formatNumber(current.wind_direction_degrees, locale)}°
          </span>
        </div>
        <div className={metric}>
          <span className={metricIcon} aria-hidden="true">
            ◈
          </span>
          <span className={metricLabel}>PRECIPITATION</span>
          <strong className={metricValue}>
            {formatPrecipitation(current.precipitation, units, locale)}{" "}
            <small className="text-[13px] font-semibold tracking-normal text-[#365761] dark:text-[#bcd4d7]">
              {weather.units.precipitation}
            </small>
          </strong>
          <span className={metricDetail}>Current amount</span>
        </div>
        <div className={metric}>
          <span className={metricIcon} aria-hidden="true">
            ◐
          </span>
          <span className={metricLabel}>DAYLIGHT</span>
          <strong className={metricValue}>
            {current.is_day ? "Daytime" : "Nighttime"}
          </strong>
          <span className={metricDetail}>At this location</span>
        </div>
      </section>
    </>
  );
}
