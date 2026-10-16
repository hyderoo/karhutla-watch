// Vercel serverless function: proxies the NASA FIRMS area API so the
// MAP_KEY stays server-side. Set FIRMS_MAP_KEY in your Vercel project
// settings (or in .env when running `vercel dev`). See README.md.
// Without the key this returns HTTP 501 and the dashboard falls back
// to clearly labeled demo hotspots.

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
const MAX_ROWS = 3000;

function confClass(raw: string): 'low' | 'nominal' | 'high' {
  const c = String(raw || '').trim().toLowerCase();
  if (c === 'h') return 'high';
  if (c === 'n') return 'nominal';
  if (c === 'l') return 'low';
  const n = Number(c); // MODIS numeric confidence 0-100
  if (!isNaN(n) && c !== '') return n >= 80 ? 'high' : n >= 30 ? 'nominal' : 'low';
  return 'nominal';
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
    for (const line of lines) {
      const p = line.split(',');
      const lat = Number(p[iLat]);
      const lon = Number(p[iLon]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const hhmm = String(p[iTime] || '0').padStart(4, '0');
      const ts = Date.parse(`${p[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
      hotspots.push({
        id: 0,
        lat,
        lon,
        ts: isNaN(ts) ? null : ts,
        conf: confClass(p[iConf]),
        frp: Math.round(Number(p[iFrp]) * 10) / 10 || 0,
        sat: SAT_NAMES[String(p[iSat])] || sensor,
      });
    }
    hotspots.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const trimmed = hotspots.slice(0, MAX_ROWS);
    trimmed.forEach((h, i) => { h.id = i + 1; });
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({
      source: 'NASA FIRMS ' + sensor,
      area: BBOX,
      days,
      count: trimmed.length,
      truncated: hotspots.length > MAX_ROWS,
      hotspots: trimmed,
    });
  } catch (e: any) {
    res.status(502).json({ error: 'FIRMS upstream failed: ' + (e && e.message ? e.message : String(e)) });
  }
}
