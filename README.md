# KARHUTLA WATCH

**Indonesia Fire & Smoke Intelligence** — an interactive monitoring dashboard for forest and land fires (*kebakaran hutan dan lahan*, "karhutla") in Indonesia.

## Live demo

[Open the live dashboard](https://karhutla-watch.vercel.app/)

Built with React, TypeScript, and Vite. Deploys cleanly on Vercel, including an optional serverless proxy for NASA FIRMS so the API key never reaches the browser.

## What is live, what is demo

This dashboard is honest about its data. Every panel is labeled, and the data-source panel at the bottom shows the real connection status and last-successful-update timestamp of each feed.

| Layer / panel | Status | Source | Notes |
|---|---|---|---|
| Wind speed & direction | **LIVE** | [Open-Meteo](https://open-meteo.com) | Keyless, CORS-enabled, 16 monitoring points |
| Rainfall | **LIVE** | Open-Meteo | Same feed as wind |
| PM2.5 / PM10 (model) | **LIVE (model)** | Open-Meteo air quality (CAMS) | Atmospheric **model output, not ground-station readings**. Treat extreme values as a model signal, not a measurement |
| PM2.5 / PM10 (ground) | **LIVE when configured, otherwise NOT CONNECTED** | [OpenAQ](https://openaq.org) ground stations | Real measured readings from monitoring stations in Indonesia. Requires a free `OPENAQ_API_KEY` (see below). Shown as a "ground check" next to the CAMS model chart and in ground-station alerts |
| Wildfire events | **LIVE** | [NASA EONET](https://eonet.gsfc.nasa.gov) | Open wildfire events in Indonesia; often zero |
| Hotspots | **LIVE when configured, otherwise DEMO** | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) VIIRS SNPP | Requires a free `FIRMS_MAP_KEY` (see below). Without it, the dashboard shows clearly labeled **simulated** hotspots so the UI can be evaluated |
| Smoke plumes | **MODELED** | Derived from live wind | Directional estimate only — **not** a measured plume |
| Alerts | Evaluated in-page | — | No notifications are sent anywhere |

Until FIRMS is configured, all hotspot-driven panels (map points, KPIs, ranking, charts, the detail drawer) are tagged **DEMO**. Once the key is set and the feed answers, those same panels switch to **LIVE — NASA FIRMS** automatically.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (hotspots fall back to demo; /api needs Vercel)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project → Import** this repo.
3. Vercel auto-detects Vite — no settings to change. **Deploy**.

The site works immediately with demo hotspots. To go live:

## Enable real NASA FIRMS hotspots

1. Get a free MAP_KEY: <https://firms.modaps.eosdis.nasa.gov/api/area/> (sign up with an email; the key arrives immediately).
2. In your Vercel project: **Settings → Environment Variables → `FIRMS_MAP_KEY`** = your key.
3. Redeploy. The dashboard will call `/api/firms` (a serverless function in `api/firms.ts`), which proxies FIRMS server-side — the key is never exposed to the browser.

## Enable OpenAQ ground stations

1. Get a free API key: <https://explore.openaq.org> (create an account; the key is in your account settings).
2. In your Vercel project: **Settings → Environment Variables → `OPENAQ_API_KEY`** = your key.
3. Redeploy. The dashboard calls `/api/openaq` (a serverless function in `api/openaq.ts`), which proxies OpenAQ server-side — the key is never exposed to the browser.

Proxy details: OpenAQ v3, Indonesia bbox `94,-12,142,7`, lists locations measuring PM2.5 and fetches the latest readings for the 30 with the most recent data, edge-cached 15 minutes. OpenAQ's free tier (60 requests/minute, 2,000/hour per key) stays comfortably out of reach at that cache rate. Ground-station readings are real measurements and can differ sharply from the CAMS model — the UI labels them as such. Data attribution: [OpenAQ](https://openaq.org), as required by its Terms of Use.

Local testing of the proxy uses the Vercel CLI:

```bash
cp .env.example .env   # paste your key into .env (gitignored)
npx vercel dev         # serves the site AND /api/firms locally
```

Proxy details: VIIRS SNPP near-real-time, Indonesia bbox `94,-12,142,7`, 5-day feed, edge-cached 15 minutes. The 5-day feed is far larger than a browser map can draw, so the proxy splits it in two: the **map sample** (the 3,000 most recent detections, which during active fire periods covers only the last several hours) and **full-feed aggregates** (per-province, per-hour detection counts, including high/low confidence splits, computed server-side over every row). KPIs, the regional ranking, and the charts are computed from those aggregates, so they are true 5-day numbers; only the map points are a recent sample. The UI states this under the map whenever the feed is truncated, and range totals are hour-resolution aggregates (a range starting mid-hour includes that whole hour).

## Data sources & attribution

- Weather & air quality: [Open-Meteo](https://open-meteo.com) (CAMS / forecast models)
- Wildfire events: [NASA EONET](https://eonet.gsfc.nasa.gov)
- Active fire hotspots (optional): [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov)
- Ground-station air quality (optional): [OpenAQ](https://openaq.org)
- Province boundaries (38 provinces): [denyherianto/indonesia-geojson-topojson-maps-with-38-provinces](https://github.com/denyherianto/indonesia-geojson-topojson-maps-with-38-provinces)
- PM2.5 bands: US EPA breakpoints

## Honest limitations

- The map is a custom SVG projection of Indonesia's 38 province boundaries — there is **no satellite basemap**. Now that the project runs on a normal host, upgrading to Leaflet with a free dark tile layer (e.g. CARTO) is a clean next step; the map component is isolated in `src/MapView.tsx`.
- Satellite hotspot counts are **detections, not confirmed fires**, and the 7D range is served by a 5-day feed (FIRMS rejects longer ranges for this API), so 6D-7D adds no extra hotspot history.
- Air-quality numbers are CAMS **model** values. They can diverge sharply from ground stations (BMKG / OpenAQ); a model reading of "hazardous" is a signal to check official sources, not a measurement.
- Demo hotspots are generated by a seeded RNG clustered on known fire regions (Riau, Jambi, South Sumatra, Central Kalimantan, …). They look plausible by design — that is exactly why they are labeled DEMO everywhere.
- Satellite hotspot detections (live or demo) indicate *possible* fires, never confirmed incidents.
- Alerts are evaluated in the page from the feeds above. Nothing sends emails, messages, or notifications.

## Project structure

```
api/firms.ts          Vercel serverless proxy for NASA FIRMS (keeps the key server-side)
api/openaq.ts         Vercel serverless proxy for OpenAQ v3 (keeps the key server-side)
src/
  App.tsx             dashboard shell, data loading, KPIs, ranking, alerts, charts
  MapView.tsx         SVG map: provinces, layers, pan/zoom, timeline playback
  charts.tsx          lightweight SVG line/bar/donut charts
  lib.ts              types, API clients, geo + formatting helpers, demo generator
  data-provinces.ts   38-province boundary geometry
  style.css           dark/light theme, responsive layout
```

## Tech stack

React 18 · TypeScript · Vite · Vercel serverless functions · zero UI-framework dependencies (all charts and the map are hand-rolled SVG)

## License

MIT — see [LICENSE](LICENSE).
