// Vercel serverless function: proxies the NASA FIRMS area API so the
// MAP_KEY stays server-side. Set FIRMS_MAP_KEY in your Vercel project
// settings (or in .env when running `vercel dev`). See README.md.
// Without the key this returns HTTP 501 and the dashboard falls back
// to clearly labeled demo hotspots.
//
// The upstream 5-day feed can hold far more rows than a browser map can
// draw, so this function returns two things:
//   - hotspots:   the newest MAP_SAMPLE rows, for the map only
//   - provHourly: per-province per-hour counts over the FULL feed, so
//                 totals, ranking and charts are true 5-day numbers
// The UI is expected to say this honestly (map = recent sample).

import { PROVINCES } from '../src/data-provinces';

declare const process: { env: Record<string, string | undefined> };

const SENSORS: Record<string, string> = {
  viirs: 'VIIRS_SNPP_NRT',
  modis: 'MODIS_NRT',
};

const SAT_NAMES: Record<string, string> = {
  N: 'VIIRS SNPP',
  N20: 'VIIRS NOAA-20',
  N21: 'VIIRS NOAA-21',
  T: 'MODIS Terra',
  A: 'MODIS Aqua',
};

// Indonesia bounding box: west, south, east, north
const BBOX = '94,-12,142,7';
// How many of the newest detections are shipped for the map layer.
// Counts/charts never use this sample; they use the aggregates below.
const MAP_SAMPLE = 3000;

function confClass(raw: string): 'low' | 'nominal' | 'high' {
  const c = String(raw || '').trim().toLowerCase();
  if (c === 'h') return 'high';
  if (c === 'n') return 'nominal';
  if (c === 'l') return 'low';
  const n = Number(c); // MODIS numeric confidence 0-100
  if (!isNaN(n) && c !== '') return n >= 80 ? 'high' : n >= 30 ? 'nominal' : 'low';
  return 'nominal';
}

// --- province lookup (raw lon/lat rings; bbox is projected, so project for the prefilter)
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function provinceOf(lon: number, lat: number): string {
  const px = (lon - 95) * 20, py = (6.5 - lat) * 20;
  for (const p of PROVINCES) {
    const b = p.bbox;
    if (px < b[0] - 3 || px > b[2] + 3 || py < b[1] - 3 || py > b[3] + 3) continue;
    for (const ring of p.rings) if (pointInRing(lon, lat, ring)) return p.name;
  }
  // offshore point: nearest province bbox center
  let best = '', bd = 1e9;
  for (const p of PROVINCES) {
    const cx = (p.bbox[0] + p.bbox[2]) / 2, cy = (p.bbox[1] + p.bbox[3]) / 2;
    const d = (cx - px) ** 2 + (cy - py) ** 2;
    if (d < bd) { bd = d; best = p.name; }
  }
  return best;
}

export default async function handler(req: any, res: any) {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    res.status(501).json({ error: 'FIRMS_MAP_KEY is not configured. The dashboard falls back to demo hotspots.' });
    return;
  }
  const q = req.query || {};
  const sensor = SENSORS[String(q.sensor || 'viirs')] || SENSORS.viirs;
  // Upstream FIRMS currently rejects day ranges above 5 for this feed (HTTP 400), so clamp here.
  const days = Math.min(5, Math.max(1, parseInt(String(q.days || '5'), 10) || 5));
  const upstream = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${sensor}/${BBOX}/${days}`;
  try {
    const r = await fetch(upstream);
    if (!r.ok) {
      res.status(502).json({ error: 'FIRMS upstream returned HTTP ' + r.status });
      return;
    }
    const text = await r.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const header = (lines.shift() || '').split(',');
    const idx = (name: string) => header.indexOf(name);
    const iLat = idx('latitude');
    const iLon = idx('longitude');
    const iDate = idx('acq_date');
    const iTime = idx('acq_time');
    const iSat = idx('satellite');
    const iConf = idx('confidence');
    const iFrp = idx('frp');
    if (iLat < 0 || iLon < 0) {
      res.status(502).json({ error: 'Unexpected FIRMS payload format' });
      return;
    }
    const hotspots: any[] = [];
    // Aggregates over the FULL feed (never truncated):
    // province -> hourStartMs -> [count, high, low]
    const provAgg = new Map<string, Map<number, number[]>>();
    let oldest: number | null = null;
    let newest: number | null = null;
    for (const line of lines) {
      const p = line.split(',');
      const lat = Number(p[iLat]);
      const lon = Number(p[iLon]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const hhmm = String(p[iTime] || '0').padStart(4, '0');
      const ts = Date.parse(`${p[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
      const t = isNaN(ts) ? null : ts;
      const conf = confClass(p[iConf]);
      hotspots.push({
        id: 0,
        lat,
        lon,
        ts: t,
        conf,
        frp: Math.round(Number(p[iFrp]) * 10) / 10 || 0,
        sat: SAT_NAMES[String(p[iSat])] || sensor,
      });
      if (t !== null) {
        if (oldest === null || t < oldest) oldest = t;
        if (newest === null || t > newest) newest = t;
        const hour = Math.floor(t / 3600e3) * 3600e3;
        const prov = provinceOf(lon, lat);
        let pm = provAgg.get(prov);
        if (!pm) { pm = new Map(); provAgg.set(prov, pm); }
        const cell = pm.get(hour) || [0, 0, 0];
        cell[0]++;
        if (conf === 'high') cell[1]++;
        else if (conf === 'low') cell[2]++;
        pm.set(hour, cell);
      }
    }
    hotspots.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const sample = hotspots.slice(0, MAP_SAMPLE);
    sample.forEach((h, i) => { h.id = i + 1; });
    const provHourly: Record<string, number[][]> = {};
    for (const [prov, pm] of provAgg) {
      provHourly[prov] = [...pm.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t, c]) => [t, c[0], c[1], c[2]]);
    }
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({
      source: 'NASA FIRMS ' + sensor,
      area: BBOX,
      days,
      // Full-feed truth:
      total: hotspots.length,
      oldest,
      newest,
      // Map sample:
      truncated: hotspots.length > MAP_SAMPLE,
      count: sample.length,
      sampleOldest: sample.length ? sample[sample.length - 1].ts : null,
      hotspots: sample,
      // Aggregates: province -> [[hourStartMs, count, highConf, lowConf], ...] ascending
      provHourly,
    });
  } catch (e: any) {
    res.status(502).json({ error: 'FIRMS upstream failed: ' + (e && e.message ? e.message : String(e)) });
  }
}
