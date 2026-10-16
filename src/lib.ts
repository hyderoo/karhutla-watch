// KARHUTLA WATCH - core library
import { PROVINCES } from './data-provinces';

export interface CityPoint { id: string; name: string; province: string; region: string; lat: number; lon: number; }
export interface Hotspot { id: number; lat: number; lon: number; ts: number; conf: 'low' | 'nominal' | 'high'; frp: number; sat: string; province: string; demo?: boolean; }
export interface EonetEvent { id: string; title: string; date: string; lat: number; lon: number; }
export interface SourceState { key: string; label: string; kind: 'live' | 'demo' | 'off'; status: 'loading' | 'ok' | 'error' | 'off'; lastOk?: number; detail?: string; }
export interface WeatherHourly { time: string[]; wind_speed_10m: number[]; wind_direction_10m: number[]; precipitation: number[]; }
export interface AqHourly { time: string[]; pm2_5: (number | null)[]; pm10: (number | null)[]; }

export const CITIES: CityPoint[] = [
  { id: 'jakarta', name: 'Jakarta', province: 'DKI Jakarta', region: 'Java', lat: -6.21, lon: 106.85 },
  { id: 'medan', name: 'Medan', province: 'Sumatera Utara', region: 'Sumatra', lat: 3.59, lon: 98.67 },
  { id: 'pekanbaru', name: 'Pekanbaru', province: 'Riau', region: 'Sumatra', lat: 0.51, lon: 101.45 },
  { id: 'jambi', name: 'Jambi City', province: 'Jambi', region: 'Sumatra', lat: -1.61, lon: 103.61 },
  { id: 'palembang', name: 'Palembang', province: 'Sumatera Selatan', region: 'Sumatra', lat: -2.99, lon: 104.76 },
  { id: 'padang', name: 'Padang', province: 'Sumatera Barat', region: 'Sumatra', lat: -0.95, lon: 100.35 },
  { id: 'pontianak', name: 'Pontianak', province: 'Kalimantan Barat', region: 'Kalimantan', lat: -0.03, lon: 109.32 },
  { id: 'palangkaraya', name: 'Palangkaraya', province: 'Kalimantan Tengah', region: 'Kalimantan', lat: -2.21, lon: 113.92 },
  { id: 'banjarmasin', name: 'Banjarmasin', province: 'Kalimantan Selatan', region: 'Kalimantan', lat: -3.32, lon: 114.59 },
  { id: 'samarinda', name: 'Samarinda', province: 'Kalimantan Timur', region: 'Kalimantan', lat: -0.5, lon: 117.14 },
  { id: 'surabaya', name: 'Surabaya', province: 'Jawa Timur', region: 'Java', lat: -7.25, lon: 112.75 },
  { id: 'makassar', name: 'Makassar', province: 'Sulawesi Selatan', region: 'Sulawesi', lat: -5.15, lon: 119.43 },
  { id: 'manado', name: 'Manado', province: 'Sulawesi Utara', region: 'Sulawesi', lat: 1.47, lon: 124.84 },
  { id: 'kupang', name: 'Kupang', province: 'Nusa Tenggara Timur', region: 'Bali & Nusa Tenggara', lat: -10.17, lon: 123.61 },
  { id: 'sorong', name: 'Sorong', province: 'Papua Barat Daya', region: 'Papua', lat: -0.88, lon: 131.25 },
  { id: 'jayapura', name: 'Jayapura', province: 'Papua', region: 'Papua', lat: -2.53, lon: 140.72 },
];

export const REGIONS = ['Sumatra', 'Kalimantan', 'Java', 'Sulawesi', 'Papua', 'Maluku', 'Bali & Nusa Tenggara'];

export const PROVINCE_REGION: Record<string, string> = {
  'Aceh': 'Sumatra', 'Sumatera Utara': 'Sumatra', 'Sumatera Barat': 'Sumatra', 'Riau': 'Sumatra', 'Kepulauan Riau': 'Sumatra',
  'Jambi': 'Sumatra', 'Sumatera Selatan': 'Sumatra', 'Kepulauan Bangka Belitung': 'Sumatra', 'Bengkulu': 'Sumatra', 'Lampung': 'Sumatra',
  'Kalimantan Barat': 'Kalimantan', 'Kalimantan Tengah': 'Kalimantan', 'Kalimantan Selatan': 'Kalimantan', 'Kalimantan Timur': 'Kalimantan', 'Kalimantan Utara': 'Kalimantan',
  'DKI Jakarta': 'Java', 'Jawa Barat': 'Java', 'Banten': 'Java', 'Jawa Tengah': 'Java', 'Daerah Istimewa Yogyakarta': 'Java', 'Jawa Timur': 'Java',
  'Sulawesi Utara': 'Sulawesi', 'Gorontalo': 'Sulawesi', 'Sulawesi Tengah': 'Sulawesi', 'Sulawesi Barat': 'Sulawesi', 'Sulawesi Selatan': 'Sulawesi', 'Sulawesi Tenggara': 'Sulawesi',
  'Papua': 'Papua', 'Papua Barat': 'Papua', 'Papua Barat Daya': 'Papua', 'Papua Selatan': 'Papua', 'Papua Tengah': 'Papua', 'Papua Pegunungan': 'Papua',
  'Maluku': 'Maluku', 'Maluku Utara': 'Maluku',
  'Bali': 'Bali & Nusa Tenggara', 'Nusa Tenggara Barat': 'Bali & Nusa Tenggara', 'Nusa Tenggara Timur': 'Bali & Nusa Tenggara',
};

// --- seeded RNG so the demo dataset is stable within a session
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd: () => number) { return (rnd() + rnd() + rnd() + rnd() - 2) / 1.2; }

const CLUSTERS: { lat: number; lon: number; w: number }[] = [
  { lat: 0.6, lon: 102.4, w: 20 },   // Riau
  { lat: -1.5, lon: 103.7, w: 14 },  // Jambi
  { lat: -2.9, lon: 104.6, w: 14 },  // South Sumatra
  { lat: 0.1, lon: 110.6, w: 12 },   // West Kalimantan
  { lat: -1.9, lon: 113.6, w: 16 },  // Central Kalimantan
  { lat: -2.6, lon: 115.4, w: 8 },   // South Kalimantan
  { lat: 0.3, lon: 116.9, w: 7 },    // East Kalimantan
  { lat: 2.4, lon: 99.2, w: 4 },     // North Sumatra
  { lat: -4.6, lon: 105.4, w: 3 },   // Lampung
  { lat: -1.2, lon: 121.4, w: 3 },   // Central Sulawesi
  { lat: -9.6, lon: 120.2, w: 3 },   // NTT
  { lat: -6.6, lon: 139.3, w: 5 },   // South Papua
  { lat: -3.6, lon: 136.5, w: 3 },   // Central Papua
];

const SATS = ['VIIRS SNPP', 'VIIRS NOAA-21', 'MODIS Terra', 'MODIS Aqua'];

export interface ProvinceGeo { id: string; name: string; d: string[]; rings: number[][][]; bbox: [number, number, number, number]; }

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function provinceOf(lon: number, lat: number, provinces: ProvinceGeo[]): string {
  for (const p of provinces) for (const ring of p.rings) if (pointInRing(lon, lat, ring)) return p.name;
  // offshore point: nearest bbox center
  let best = '', bd = 1e9;
  for (const p of provinces) {
    const cx = (p.bbox[0] + p.bbox[2]) / 2, cy = (p.bbox[1] + p.bbox[3]) / 2;
    const d = (cx - ((lon - 95) * 20)) ** 2 + (cy - ((6.5 - lat) * 20)) ** 2;
    if (d < bd) { bd = d; best = p.name; }
  }
  return best;
}

export function genDemoHotspots(now: number, provinces: ProvinceGeo[]): Hotspot[] {
  const rnd = mulberry32(20261016);
  const totalW = CLUSTERS.reduce((s, c) => s + c.w, 0);
  const out: Hotspot[] = [];
  for (let i = 0; i < 420; i++) {
    let pick = rnd() * totalW; let cl = CLUSTERS[0];
    for (const c of CLUSTERS) { pick -= c.w; if (pick <= 0) { cl = c; break; } }
    const lat = cl.lat + gauss(rnd) * 0.55;
    const lon = cl.lon + gauss(rnd) * 0.65;
    // recency-weighted: more in the last 24h
    const ageH = Math.pow(rnd(), 2.2) * 168;
    const ts = now - ageH * 3600e3 - rnd() * 3600e3;
    const rc = rnd();
    const conf: Hotspot['conf'] = rc < 0.22 ? 'high' : rc < 0.75 ? 'nominal' : 'low';
    const frp = Math.round((conf === 'high' ? 25 + rnd() * 95 : conf === 'nominal' ? 8 + rnd() * 35 : 1 + rnd() * 10) * 10) / 10;
    out.push({ id: i + 1, lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000, ts, conf, frp, sat: SATS[Math.floor(rnd() * SATS.length)], province: provinceOf(lon, lat, provinces), demo: true });
  }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

// --- geo helpers
export const LON0 = 95, LAT0 = 6.5, SCALE = 20;
export const proj = (lon: number, lat: number): [number, number] => [(lon - LON0) * SCALE, (LAT0 - lat) * SCALE];
export const unproj = (x: number, y: number): [number, number] => [x / SCALE + LON0, LAT0 - y / SCALE];
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, dLa = (lat2 - lat1) * Math.PI / 180, dLo = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function nearestCity(lat: number, lon: number): CityPoint {
  let best = CITIES[0], bd = 1e9;
  for (const c of CITIES) { const d = haversineKm(lat, lon, c.lat, c.lon); if (d < bd) { bd = d; best = c; } }
  return best;
}
export function compass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// --- PM2.5 bands (US EPA breakpoints, ug/m3)
export function pm25Band(v: number | null | undefined): { label: string; color: string } {
  if (v === null || v === undefined || isNaN(v)) return { label: 'No data', color: '#5b6474' };
  if (v <= 12) return { label: 'Good', color: '#34d399' };
  if (v <= 35.4) return { label: 'Moderate', color: '#fbbf24' };
  if (v <= 55.4) return { label: 'Unhealthy for sensitive groups', color: '#fb923c' };
  if (v <= 150.4) return { label: 'Unhealthy', color: '#ef4444' };
  if (v <= 250.4) return { label: 'Very unhealthy', color: '#a855f7' };
  return { label: 'Hazardous', color: '#7f1d1d' };
}

// --- time formatting
export function fmtWIB(ts: number | Date, withDate = true): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const o: Intl.DateTimeFormatOptions = withDate
    ? { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
  return d.toLocaleString('en-GB', o).replace(',', '') + ' WIB';
}
export function fmtUTC(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return d.toLocaleString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '') + ' UTC';
}
export function parseWIBNaive(s: string): number { return new Date(s + ':00+07:00').getTime(); }

export function latestIdx(times: string[], nowTs: number): number {
  for (let i = times.length - 1; i >= 0; i--) if (parseWIBNaive(times[i]) <= nowTs) return i;
  return -1;
}

// --- API layer (keyless, CORS-enabled public APIs)
async function fetchJson(url: string, timeoutMs = 15000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function fetchWeather(): Promise<Record<string, WeatherHourly>> {
  const lat = CITIES.map(c => c.lat).join(',');
  const lon = CITIES.map(c => c.lon).join(',');
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&hourly=wind_speed_10m,wind_direction_10m,precipitation&past_days=7&forecast_days=1&timezone=Asia%2FJakarta';
  const data = await fetchJson(url);
  const arr = Array.isArray(data) ? data : [data];
  const out: Record<string, WeatherHourly> = {};
  arr.forEach((loc: any, i: number) => { if (CITIES[i] && loc.hourly) out[CITIES[i].id] = loc.hourly as WeatherHourly; });
  if (Object.keys(out).length === 0) throw new Error('empty weather payload');
  return out;
}

export async function fetchAQ(): Promise<Record<string, AqHourly>> {
  const lat = CITIES.map(c => c.lat).join(',');
  const lon = CITIES.map(c => c.lon).join(',');
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon +
    '&hourly=pm2_5,pm10&past_days=7&forecast_days=1&timezone=Asia%2FJakarta';
  const data = await fetchJson(url);
  const arr = Array.isArray(data) ? data : [data];
  const out: Record<string, AqHourly> = {};
  arr.forEach((loc: any, i: number) => { if (CITIES[i] && loc.hourly) out[CITIES[i].id] = loc.hourly as AqHourly; });
  if (Object.keys(out).length === 0) throw new Error('empty air quality payload');
  return out;
}

export async function fetchEonet(): Promise<EonetEvent[]> {
  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=60';
  const data = await fetchJson(url);
  const out: EonetEvent[] = [];
  for (const e of data.events || []) {
    const gs = e.geometry || [];
    if (!gs.length) continue;
    const g = gs[gs.length - 1];
    const lon = g.coordinates[0], lat = g.coordinates[1];
    if (lon >= 94 && lon <= 142 && lat >= -12 && lat <= 7) out.push({ id: e.id, title: e.title, date: g.date, lat, lon });
  }
  return out;
}

// --- NASA FIRMS through the server-side proxy (optional; see README)
// Returns live VIIRS detections tagged with their province, or throws when
// the proxy is unavailable / not configured (caller falls back to demo data).
export async function fetchFirms(): Promise<Hotspot[]> {
  const r = await fetch('/api/firms?days=5');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  if (!data || !Array.isArray(data.hotspots)) throw new Error('bad FIRMS payload');
  const out: Hotspot[] = [];
  for (const h of data.hotspots) {
    if (typeof h.lat !== 'number' || typeof h.lon !== 'number' || typeof h.ts !== 'number') continue;
    out.push({
      id: out.length + 1,
      lat: h.lat, lon: h.lon, ts: h.ts,
      conf: h.conf === 'high' || h.conf === 'low' ? h.conf : 'nominal',
      frp: typeof h.frp === 'number' ? h.frp : 0,
      sat: typeof h.sat === 'string' ? h.sat : 'VIIRS',
      province: provinceOf(h.lon, h.lat, PROVINCES as any),
    });
  }
  if (out.length === 0) throw new Error('FIRMS returned 0 detections');
  return out;
}
