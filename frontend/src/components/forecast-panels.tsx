import { formatClock, formatDate, formatDay, formatHour, formatNumber, formatProbability, formatTemperature, weatherSymbol, type UnitSystem, type Weather } from "@/lib/weather";

const panel = "panel min-w-0 rounded-[17px] border border-[#e3edeb] bg-white px-[26px] pt-[25px] pb-[21px] shadow-[0_4px_16px_#20576307] max-[670px]:px-[19px] max-[670px]:pt-[21px] dark:border-[#36515b] dark:bg-[#172a35] dark:shadow-none";
const heading = "panel-heading mb-6 flex items-start justify-between gap-3";
const kicker = "section-kicker text-[10px] font-extrabold tracking-[.17em] text-[#0a766e] dark:text-[#74e1ce]";
const headingText = "mt-[5px] text-xl leading-[1.3] tracking-[-.04em] text-[#214551] dark:text-[#e9f6f4]";
const tag = "panel-tag rounded-[7px] bg-[#f3f8f7] px-[10px] py-2 text-[10px] font-extrabold tracking-[.1em] whitespace-nowrap text-[#47656d] max-[670px]:text-[9px] max-[390px]:hidden dark:bg-[#263e49] dark:text-[#c5dcdf]";
const solarValue = "flex min-w-0 flex-col gap-[7px] rounded-xl border border-[#dce9e9] p-[15px] max-[670px]:px-[14px] max-[670px]:py-3 dark:border-[#35515b]";

export function HourlyForecast({ hours, units, locale = "en" }: { hours: Weather["hourly"]; units: UnitSystem; locale?: string }) {
  const trend = hours.slice(0, 12);
  const min = Math.min(...trend.map((hour) => hour.temperature));
  const max = Math.max(...trend.map((hour) => hour.temperature));
  return <section className={`${panel} hourly-panel`} aria-labelledby="hourly-heading">
    <div className={heading}><div><span className={kicker}>UP NEXT</span><h2 className={headingText} id="hourly-heading">Hourly forecast</h2></div><span className={tag}>NEXT 24 HOURS</span></div>
    <div className="hourly-scroll contain-paint overflow-x-auto pb-2 [scrollbar-color:#b8dbd8_transparent] [scrollbar-width:thin] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#074c66] dark:focus-visible:outline-[#74e1ce]" tabIndex={0} aria-label="Scrollable 24-hour forecast"><div className="hourly-list flex min-w-max">
      {hours.map((hour, index) => <div className="hourly-item flex min-w-[73px] flex-col items-center gap-[11px] border-r border-[#e9f0ef] px-[10px] py-0.5 first:pl-0 last:border-r-0 dark:border-[#35515a]" key={`${hour.time}-${index}`}>
        <span className="hour-label text-[11px] whitespace-nowrap text-[#47656d] dark:text-[#b0cbd0]">{index === 0 ? "Now" : formatHour(hour.time, locale)}</span>
        <span className="hour-icon h-[31px] text-[29px] leading-none text-[#e9af40]" aria-hidden="true">{weatherSymbol(hour.weather_code, hour.is_day)}</span>
        <span className="sr-only">{hour.condition}</span>
        <strong className="text-[15px] text-[#234856] dark:text-[#e9f6f4]">{formatTemperature(hour.temperature, units, locale)}</strong>
        <span className="hour-rain text-[10px] text-[#0d726c] dark:text-[#85dfd7]"><span aria-hidden="true">☂ </span><span className="sr-only">Rain chance</span>{" "}{formatProbability(hour.precipitation_probability_percent, locale)}</span>
      </div>)}
    </div></div>
    <details className="hourly-trend mt-4 border-t border-[#dce9e9] pt-[13px] dark:border-[#35515b]"><summary className="w-max max-w-full cursor-pointer text-[13px] font-bold text-[#075f5a] dark:text-[#74e1ce]">Compare the next 12 hours as a compact trend</summary>
      <p className="my-[10px] text-xs leading-normal text-[#47656d] dark:text-[#bcd4d7]">Temperature position is relative to the next 12 hours; the numbers and rain chances are the exact forecast values.</p>
      <div className="trend-list grid gap-1" role="list">{trend.map((hour, index) => {
        const fraction = max === min ? 0.5 : (hour.temperature - min) / (max - min);
        return <div className="trend-row flex min-h-[27px] items-center gap-[7px] text-xs" role="listitem" key={`${hour.time}-${index}`}>
          <span className="trend-time w-12 flex-none">{formatHour(hour.time, locale)}</span>
          <strong className="w-12 flex-none whitespace-nowrap text-[#234856] dark:text-[#e9f6f4]">{formatTemperature(hour.temperature, units, locale)}</strong>
          <span className="trend-track h-2 min-w-[22px] flex-1 overflow-hidden rounded-lg bg-[#e0efed] dark:bg-[#35515a]" aria-hidden="true"><span className="block h-full rounded-lg bg-[#0a8980] dark:bg-[#74e1ce]" style={{ width: `${Math.round(12 + fraction * 88)}%` }} /></span>
          <span className="trend-rain w-[52px] flex-none text-right whitespace-nowrap text-[#0d726c] dark:text-[#85dfd7]"><span aria-hidden="true">☂ </span><span className="sr-only">Rain chance</span>{" "}{formatProbability(hour.precipitation_probability_percent, locale)}</span>
        </div>;
      })}</div>
    </details>
  </section>;
}

export function DailyForecast({ days, units, locale = "en" }: { days: Weather["daily"]; units: UnitSystem; locale?: string }) {
  return <section className={`${panel} week-panel`} aria-labelledby="week-heading">
    <div className={heading}><div><span className={kicker}>LOOKING AHEAD</span><h2 className={headingText} id="week-heading">7-day forecast</h2></div><span className={tag}>THIS WEEK</span></div>
    <div className="week-list -mt-[6px]">{days.map((day, index) => <div className="day-row grid min-h-11 grid-cols-[55px_1fr_77px_120px] items-center gap-2 border-b border-[#edf2f1] text-xs last:border-0 max-[390px]:grid-cols-[45px_1fr_54px_100px] max-[390px]:gap-1 dark:border-[#35515a]" key={day.date}>
      <span className="day-name font-bold text-[#41606b] dark:text-[#b0cbd0]">{index === 0 ? "Today" : formatDay(day.date, locale)}</span>
      <span className="day-icon text-center text-[23px] leading-none text-[#eab24d]" aria-hidden="true">{weatherSymbol(day.weather_code)}</span>
      <span className="sr-only">{day.condition}</span>
      <span className="day-rain text-[11px] text-[#0d726c] dark:text-[#85dfd7]"><span aria-hidden="true">☂ </span><span className="sr-only">Maximum rain chance</span>{" "}{formatProbability(day.precipitation_probability_max_percent, locale)}</span>
      <span className="day-temperatures flex justify-end gap-3"><strong className="text-[#2b4b57] dark:text-[#e9f6f4]"><span className="sr-only">High: </span>{formatTemperature(day.temperature_max, units, locale)}</strong>{" "}<span className="text-[#47656d] dark:text-[#b0cbd0]"><span className="sr-only">Low: </span>{formatTemperature(day.temperature_min, units, locale)}</span></span>
    </div>)}</div>
  </section>;
}

export function SolarDetails({ day, source, locale = "en" }: { day: Weather["daily"][number]; source: string; locale?: string }) {
  return <section className={`${panel} solar-panel mb-[18px]`} aria-labelledby="solar-heading">
    <div className={heading}><div><span className={kicker}>DAYLIGHT & UV</span><h2 className={headingText} id="solar-heading">Today&apos;s solar outlook</h2></div><span className={tag}>{formatDate(day.date, locale)}</span></div>
    <div className="solar-values grid grid-cols-3 gap-[14px] max-[670px]:grid-cols-1 max-[670px]:gap-2">
      <div className={solarValue}><span className="text-[11px] font-bold text-[#47656d] dark:text-[#bcd4d7]">Sunrise</span><strong className="text-[19px] text-[#214551] dark:text-[#e9f6f4]">{day.sunrise ? formatClock(day.sunrise, locale) : "Not available"}</strong><small className="text-[11px] leading-normal text-[#47656d] dark:text-[#bcd4d7]">Local time</small></div>
      <div className={solarValue}><span className="text-[11px] font-bold text-[#47656d] dark:text-[#bcd4d7]">Sunset</span><strong className="text-[19px] text-[#214551] dark:text-[#e9f6f4]">{day.sunset ? formatClock(day.sunset, locale) : "Not available"}</strong><small className="text-[11px] leading-normal text-[#47656d] dark:text-[#bcd4d7]">Local time</small></div>
      <div className={solarValue}><span className="text-[11px] font-bold text-[#47656d] dark:text-[#bcd4d7]">Maximum UV index</span><strong className="text-[19px] text-[#214551] dark:text-[#e9f6f4]">{day.uv_index_max == null ? "Not available" : formatNumber(day.uv_index_max, locale, 1)}</strong><small className="text-[11px] leading-normal text-[#47656d] dark:text-[#bcd4d7]">Forecast daily maximum · index</small></div>
    </div>
    <p className="solar-note mt-[14px] text-[11px] leading-normal text-[#47656d] dark:text-[#bcd4d7]">Forecast for {formatDate(day.date, locale)} at the selected location · Source: {source}. UV is not a current exposure reading or a safety alert.</p>
  </section>;
}
