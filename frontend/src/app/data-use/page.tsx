import type { Metadata } from "next";

export const metadata: Metadata = { title: "How location data is used | Weather Glint" };

export default function DataUsePage() {
  return (
    <main className="data-page mx-auto w-[calc(100%_-_48px)] max-w-[760px] pt-12 pb-20 text-base leading-[1.65] max-[670px]:w-[calc(100%_-_32px)] [&_a]:text-[#075f5a] [&_a]:underline [&_a]:underline-offset-[3px] [&_code]:text-[.9em] [&_h1]:text-[clamp(32px,5vw,48px)] [&_h1]:leading-[1.15] [&_h2]:mt-[34px] [&_h2]:text-[23px] [&_h2]:leading-[1.3] dark:[&_a]:text-[#74e1ce] dark:[&_code]:text-[#eaf8f6]">
      {/* Keep a document navigation here for browser reading tools. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/">← Back to forecast</a>
      <h1>How location data is used</h1>
      <p>This page explains Weather Glint’s current data flow. Faraz Hussain operates the app from Karachi, Pakistan, and is the contact for its worldwide audience. It is not a complete legal privacy notice: live hosting settings and applicable rules have not yet been fully verified.</p>
      <h2>Search and forecast</h2>
      <p>When you type at least two characters in the search box, the app sends that search to its backend, which asks Open-Meteo for matching places. Selecting a place sends its coordinates to the backend, which asks Open-Meteo for a forecast. Search text and coordinates are sent in the body of browser requests to this app, but the backend still calls Open-Meteo using URL query parameters.</p>
      <h2>Device location</h2>
      <p>The app asks for browser location permission only after you select “Use my location.” If permitted, it sends the returned coordinates for a forecast. It does not add device-location coordinates to recent places or to a shareable page URL. You can deny permission and search manually instead.</p>
      <h2>Data saved on this device</h2>
      <p>This browser stores your temperature-unit preference (<code>weather-glint-units</code>) and up to five recent selected places (<code>weather-glint-recent</code>) in local storage. If you choose Light or Dark appearance, that preference is stored as <code>weather-glint-theme</code>; Device uses no saved theme entry. Recent places expire 30 days after each selection; unit and theme preferences expire 180 days after you change them. Expired entries are removed when you next open the app. Saved entries from the previous app name are migrated once and then removed, so existing choices can expire within the new periods. You can remove these entries sooner with “Clear saved data” in the forecast footer or your browser’s site-data controls. Clearing them does not erase data already received by the backend, hosting providers, or Open-Meteo.</p>
      <h2>How long data remains</h2>
      <p>While the backend is running, forecast responses are cached for up to five minutes and place-search responses for up to 24 hours. Expired cache entries are removed by a cleanup task that runs every 60 seconds. IP-based rate-limit records have a 60-second window and are removed by that cleanup task after expiry; continued use can renew a record. A backend restart clears these in-memory records.</p>
      <p>Vercel and Render may retain their own request or runtime logs; their actual settings and retention have not been verified for this app. Open-Meteo states that its free API webserver logs may contain coordinates and are deleted after 90 days; see its <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">terms</a>.</p>
      <h2>Other recipients</h2>
      <p>On Render, the backend uses a client IP supplied by Render’s edge for short-lived rate limiting. Requests forwarded through Vercel may share a proxy IP and therefore a rate-limit bucket. If the edge IP is missing or invalid, the backend uses the connection address instead. The app logs request method, path, status, timing, and a request ID, but not the rate-limit IP. It does not currently include an analytics or advertising SDK in its source.</p>
      <h2>Contact</h2>
      <p>Questions about this app or its use of location data can be sent to Faraz Hussain at <a href="mailto:farazhussain5000@gmail.com">farazhussain5000@gmail.com</a>.</p>
    </main>
  );
}
