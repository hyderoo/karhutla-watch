// Vercel serverless function: proxies the OpenAQ v3 API so the API key
// stays server-side. Set OPENAQ_API_KEY in your Vercel project settings
// (or in .env when running `vercel dev`). See README.md.
// Without the key this returns HTTP 501 and the dashboard marks OpenAQ
// as not connected.
//
// Flow: list Indonesia locations that measure PM2.5, take the 30 with
// the most recent data, then fetch each location's latest readings.
// OpenAQ free tier allows 60 requests/minute and 2,000/hour per key;
// this endpoint is edge-cached 15 minutes, so usage stays far below that.
// Attribution required by the OpenAQ Terms of Use: data from openaq.org.

declare const process: { env: Record<string, string | undefined> };

const BBOX = '94,-12,142,7'; // Indonesia: minLon, minLat, maxLon, maxLat
const MAX_STATIONS = 30;

export default async function handler(req: any, res: any) {
  const key = process.env.OPENAQ_API_KEY;
  if (!key) {
    res.status(501).json({ error: 'OPENAQ_API_KEY is not configured. The dashboard marks OpenAQ ground stations as not connected.' });
    return;
  }
  const headers = { 'X-API-Key': key };
  try {
    const locUrl = 'https://api.openaq.org/v3/locations?iso=ID&bbox=' + encodeURIComponent(BBOX) + '&parameters_id=2&limit=200';
    const lr = await fetch(locUrl, { headers });
    if (!lr.ok) {
      res.status(502).json({ error: 'OpenAQ upstream returned HTTP ' + lr.status });
      return;
    }
    const locData = await lr.json();
    const locs: any[] = Array.isArray(locData && locData.results) ? locData.results : [];
    const usable = locs.filter((l: any) =>
      l && typeof l.id === 'number' && l.coordinates &&
      typeof l.coordinates.latitude === 'number' && typeof l.coordinates.longitude === 'number' &&
      Array.isArray(l.sensors) && l.sensors.some((s: any) => s && s.parameter && s.parameter.name === 'pm25'));
    const picked = usable
      .sort((a: any, b: any) => Date.parse((b.datetimeLast && b.datetimeLast.utc) || 0) - Date.parse((a.datetimeLast && a.datetimeLast.utc) || 0))
      .slice(0, MAX_STATIONS);

    const stations = await Promise.all(picked.map(async (loc: any) => {
      const paramBySensor = new Map<number, { name: string; units: string }>();
      for (const s of loc.sensors) {
        if (s && s.parameter && typeof s.id === 'number') paramBySensor.set(s.id, { name: s.parameter.name, units: s.parameter.units || 'ug/m3' });
      }
      let latest: any = null;
      try {
        const r = await fetch('https://api.openaq.org/v3/locations/' + loc.id + '/latest', { headers });
        if (r.ok) latest = await r.json();
      } catch { /* leave latest null; station returns with no readings */ }
      let pm25: number | null = null, pm25Time: number | null = null;
      let pm10: number | null = null, pm10Time: number | null = null;
      let unit = 'ug/m3';
      const rows: any[] = latest && Array.isArray(latest.results) ? latest.results : [];
      for (const m of rows) {
        const p = paramBySensor.get(m.sensorsId);
        if (!p || typeof m.value !== 'number') continue;
        const t = Date.parse((m.datetime && m.datetime.utc) || '');
        if (p.name === 'pm25') { pm25 = m.value; pm25Time = isNaN(t) ? null : t; unit = p.units; }
        if (p.name === 'pm10') { pm10 = m.value; pm10Time = isNaN(t) ? null : t; }
      }
      return {
        id: loc.id,
        name: typeof loc.name === 'string' && loc.name ? loc.name : 'Station ' + loc.id,
        locality: typeof loc.locality === 'string' ? loc.locality : '',
        lat: loc.coordinates.latitude,
        lon: loc.coordinates.longitude,
        provider: (loc.provider && loc.provider.name) || 'unknown',
        monitor: !!loc.isMonitor,
        pm25, pm25Time, pm10, pm10Time, unit,
      };
    }));

    const withData = stations.filter((s) => s.pm25 !== null || s.pm10 !== null);
    if (withData.length === 0) {
      res.status(502).json({ error: 'OpenAQ returned ' + locs.length + ' locations but no current readings' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({
      source: 'OpenAQ v3',
      attribution: 'Air quality data from OpenAQ (openaq.org)',
      totalLocations: locs.length,
      sampled: picked.length,
      count: withData.length,
      stations: withData,
    });
  } catch (e: any) {
    res.status(502).json({ error: 'OpenAQ upstream failed: ' + (e && e.message ? e.message : String(e)) });
  }
}
