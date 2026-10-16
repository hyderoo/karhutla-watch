import React, { useEffect, useMemo, useRef, useState } from 'react';
import './style.css';
import { PROVINCES } from './data-provinces';
import { MapView, Layers, FULL_VIEW, ViewState } from './MapView';
import { LineChart, BarChart, Donut } from './charts';
import {
  CITIES, CityPoint, Hotspot, EonetEvent, SourceState, WeatherHourly, AqHourly,
  genDemoHotspots, proj, haversineKm, nearestCity, compass, pm25Band,
  fmtWIB, fmtUTC, parseWIBNaive, latestIdx, fetchWeather, fetchAQ, fetchEonet, fetchFirms, PROVINCE_REGION, REGIONS,
} from './lib';

const RANGES = [
  { k: '1h', label: '1H', ms: 3600e3 },
  { k: '6h', label: '6H', ms: 6 * 3600e3 },
  { k: '24h', label: '24H', ms: 24 * 3600e3 },
  { k: '7d', label: '7D', ms: 7 * 86400e3 },
];

const PROV_BBOX = new Map(PROVINCES.map((p) => [p.name, p.bbox]));

export function App() {
  const [now, setNow] = useState(() => Date.now());
  const [rangeKey, setRangeKey] = useState('24h');
  const [region, setRegion] = useState('all');
  const [province, setProvince] = useState('all');
  const [layers, setLayers] = useState<Layers>({ hotspots: true, heat: true, smoke: true, wind: true, aq: true, cities: true, bounds: true, eonet: true });
  const [view, setView] = useState<ViewState>(FULL_VIEW);
  const [cursor, setCursor] = useState<number | null>(null); // timeline playback cursor
  const [playing, setPlaying] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [query, setQuery] = useState('');
  const [searchNote, setSearchNote] = useState('');
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [chartCity, setChartCity] = useState<string>('palembang');
  const [refreshMin, setRefreshMin] = useState(5);
  const [firmsData, setFirmsData] = useState<Hotspot[] | null>(null);

  const [weather, setWeather] = useState<Record<string, WeatherHourly>>({});
  const [aq, setAq] = useState<Record<string, AqHourly>>({});
  const [eonet, setEonet] = useState<EonetEvent[]>([]);
  const [sources, setSources] = useState<SourceState[]>([
    { key: 'om-wx', label: 'Open-Meteo weather (wind, rain)', kind: 'live', status: 'loading' },
    { key: 'om-aq', label: 'Open-Meteo air quality (CAMS model)', kind: 'live', status: 'loading' },
    { key: 'eonet', label: 'NASA EONET wildfire events', kind: 'live', status: 'loading' },
    { key: 'demo', label: 'Hotspot layer (simulated demo)', kind: 'demo', status: 'ok', detail: 'FIRMS feed requires a free MAP_KEY; not connected.' },
    { key: 'firms', label: 'NASA FIRMS active fire', kind: 'off', status: 'off', detail: 'Needs a free MAP_KEY. firms.modaps.eosdis.nasa.gov' },
    { key: 'openaq', label: 'OpenAQ ground stations', kind: 'off', status: 'off', detail: 'v3 API needs a key; not connected.' },
    { key: 'bmkg', label: 'BMKG advisories', kind: 'off', status: 'off', detail: 'No public CORS-enabled hotspot API; not connected.' },
  ]);

  const demoHotspots = useMemo(() => genDemoHotspots(Date.now(), PROVINCES as any), []);
  const hotspots = firmsData ?? demoHotspots;
  const hotspotsLive = firmsData !== null;
  const hTag = hotspotsLive
    ? <span className="tag tag-live">LIVE - NASA FIRMS</span>
    : <span className="tag tag-demo">DEMO</span>;

  const mark = (key: string, patch: Partial<SourceState>) =>
    setSources((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const load = () => {
    fetchWeather()
      .then((w) => { setWeather(w); mark('om-wx', { status: 'ok', lastOk: Date.now(), detail: CITIES.length + ' monitoring points' }); })
      .catch((e) => mark('om-wx', { status: 'error', detail: String(e && e.message || e) }));
    fetchAQ()
      .then((a) => { setAq(a); mark('om-aq', { status: 'ok', lastOk: Date.now(), detail: 'CAMS model, ' + CITIES.length + ' points' }); })
      .catch((e) => mark('om-aq', { status: 'error', detail: String(e && e.message || e) }));
    fetchEonet()
      .then((ev) => { setEonet(ev); mark('eonet', { status: 'ok', lastOk: Date.now(), detail: ev.length + ' open events in Indonesia' }); })
      .catch((e) => mark('eonet', { status: 'error', detail: String(e && e.message || e) }));
    fetchFirms()
      .then((hs) => {
        setFirmsData(hs);
        mark('firms', { kind: 'live', status: 'ok', lastOk: Date.now(), detail: hs.length + ' VIIRS SNPP detections, 7-day feed' });
        mark('demo', { status: 'off', detail: 'Replaced by the live NASA FIRMS feed.' });
      })
      .catch(() => mark('firms', { status: 'off', detail: 'No FIRMS_MAP_KEY configured (see README); showing demo hotspots' }));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (refreshMin <= 0) return;
    const t = setInterval(load, refreshMin * 60e3);
    return () => clearInterval(t);
  }, [refreshMin]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30e3); return () => clearInterval(t); }, []);

  const range = RANGES.find((r) => r.k === rangeKey)!;
  const rangeStart = now - range.ms;
  const cursorTs = cursor ?? now;

  // timeline playback
  useEffect(() => {
    if (!playing) return;
    const step = range.ms / 120;
    const t = setInterval(() => {
      setCursor((c) => {
        const next = (c ?? rangeStart) + step;
        if (next >= now) { setPlaying(false); return null; }
        return next;
      });
    }, 180);
    return () => clearInterval(t);
  }, [playing, rangeKey, now, rangeStart]);

  const visible = useMemo(() => hotspots.filter((h) =>
    h.ts >= rangeStart && h.ts <= cursorTs &&
    (region === 'all' || PROVINCE_REGION[h.province] === region) &&
    (province === 'all' || h.province === province)
  ), [hotspots, rangeStart, cursorTs, region, province]);

  const highConf = visible.filter((h) => h.conf === 'high');
  const affected = new Set(visible.map((h) => h.province));

  // live AQ KPI: worst current PM2.5
  let worstPm: { v: number; city: CityPoint; t: string } | null = null;
  for (const c of CITIES) {
    const a = aq[c.id]; if (!a) continue;
    const li = latestIdx(a.time, now); if (li < 0) continue;
    const v = a.pm2_5[li];
    if (v !== null && (!worstPm || v > worstPm.v)) worstPm = { v, city: c, t: a.time[li] };
  }

  const liveOkTimes = sources.filter((s) => s.kind === 'live' && s.status === 'ok' && s.lastOk).map((s) => s.lastOk!);
  const freshest = liveOkTimes.length ? Math.max(...liveOkTimes) : null;
  const freshMin = freshest ? Math.max(0, Math.round((now - freshest) / 60e3)) : null;

  const anyLiveOk = sources.some((s) => s.kind === 'live' && s.status === 'ok');
  const anyErr = sources.some((s) => s.kind === 'live' && s.status === 'error');

  // ranking by province
  const ranking = useMemo(() => {
    const m = new Map<string, { n: number; hi: number; latest: number }>();
    for (const h of visible) {
      const r = m.get(h.province) || { n: 0, hi: 0, latest: 0 };
      r.n++; if (h.conf === 'high') r.hi++; r.latest = Math.max(r.latest, h.ts);
      m.set(h.province, r);
    }
    return [...m.entries()].map(([name, r]) => {
      const bb = PROV_BBOX.get(name);
      const cx = bb ? (bb[0] + bb[2]) / 2 : 0, cy = bb ? (bb[1] + bb[3]) / 2 : 0;
      const lon = cx / 20 + 95, lat = 6.5 - cy / 20;
      const city = nearestCity(lat, lon);
      const a = aq[city.id]; const li = a ? latestIdx(a.time, now) : -1;
      const w = weather[city.id]; const wi = w ? latestIdx(w.time, now) : -1;
      return {
        name, n: r.n, hi: r.hi, latest: r.latest, city,
        pm: li >= 0 ? a!.pm2_5[li] : null,
        windDir: wi >= 0 ? w!.wind_direction_10m[wi] : null,
        windSpd: wi >= 0 ? w!.wind_speed_10m[wi] : null,
      };
    }).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [visible, aq, weather, now]);

  // alerts
  const alerts: { tone: 'danger' | 'warn' | 'info'; tag: string; text: string }[] = [];
  for (const c of CITIES) {
    const a = aq[c.id]; if (!a) continue;
    const li = latestIdx(a.time, now); if (li < 0) continue;
    const v = a.pm2_5[li];
    if (v !== null && v > 55.4) alerts.push({ tone: 'danger', tag: 'LIVE', text: 'PM2.5 ' + Math.round(v) + ' ug/m3 (' + pm25Band(v).label + ') at ' + c.name + ', ' + a.time[li].replace('T', ' ') + ' WIB. Source: CAMS model via Open-Meteo.' });
    else if (v !== null && v > 35.4) alerts.push({ tone: 'warn', tag: 'LIVE', text: 'PM2.5 ' + Math.round(v) + ' ug/m3 (unhealthy for sensitive groups) at ' + c.name + '. Source: CAMS model via Open-Meteo.' });
  }
  for (const s of sources) if (s.kind === 'live' && s.status === 'error') alerts.push({ tone: 'danger', tag: 'FEED', text: s.label + ' feed failed: ' + (s.detail || 'network error') + '. Showing last known or empty state.' });
  if (ranking[0]) alerts.push({ tone: 'warn', tag: hotspotsLive ? 'LIVE' : 'DEMO RULE', text: (hotspotsLive ? 'Surge rule: ' : 'Simulated surge rule: ') + ranking[0].name + ' shows ' + ranking[0].n + (hotspotsLive ? ' FIRMS detections' : ' demo hotspots') + ' (' + ranking[0].hi + ' high-confidence) in the selected range.' + (hotspotsLive ? '' : ' Demonstration data only.') });
  if (eonet.length === 0 && sources.find((s) => s.key === 'eonet')?.status === 'ok') alerts.push({ tone: 'info', tag: 'LIVE', text: 'NASA EONET reports no open wildfire events in Indonesia right now.' });
  alerts.slice(0, 12);

  // charts data
  const bucketHourly = range.ms <= 24 * 3600e3;
  const buckets = useMemo(() => {
    const n = bucketHourly ? Math.max(1, Math.round(range.ms / 3600e3)) : 7;
    const arr = new Array(n).fill(0);
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = rangeStart + ((i + 1) / n) * range.ms;
      labels.push(new Date(t0).toLocaleString('en-GB', bucketHourly ? { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false } : { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short' }));
    }
    for (const h of visible) {
      const f = (h.ts - rangeStart) / range.ms;
      if (f >= 0 && f < 1) arr[Math.min(n - 1, Math.floor(f * n))]++;
    }
    return { arr, labels };
  }, [visible, rangeKey, rangeStart]);

  const provBars = ranking.slice(0, 8).map((r) => ({ label: r.name.replace('Kalimantan', 'Kal.').replace('Sumatera', 'Sum.').replace('Nusa Tenggara', 'NT').replace('Daerah Istimewa Yogyakarta', 'DIY'), value: r.n }));

  const confDonut = [
    { label: 'High confidence', value: visible.filter((h) => h.conf === 'high').length, color: '#ef4444' },
    { label: 'Nominal', value: visible.filter((h) => h.conf === 'nominal').length, color: '#f59e0b' },
    { label: 'Low', value: visible.filter((h) => h.conf === 'low').length, color: '#38bdf8' },
  ];

  const chartCityObj = CITIES.find((c) => c.id === chartCity) || CITIES[0];
  const aqCity = aq[chartCityObj.id];
  const wxCity = weather[chartCityObj.id];
  const rangeSeries = (times: string[], vals: (number | null)[]) => {
    const outV: (number | null)[] = [], outL: string[] = [];
    times.forEach((t, i) => {
      const ts = parseWIBNaive(t);
      if (ts >= rangeStart && ts <= now) {
        outV.push(vals[i]);
        outL.push(new Date(ts).toLocaleString('en-GB', bucketHourly ? { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false } : { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', hour12: false }));
      }
    });
    return { outV, outL };
  };
  const pmS = aqCity ? rangeSeries(aqCity.time, aqCity.pm2_5) : { outV: [], outL: [] };
  const pm10S = aqCity ? rangeSeries(aqCity.time, aqCity.pm10) : { outV: [], outL: [] };
  const windS = wxCity ? rangeSeries(wxCity.time, wxCity.wind_speed_10m) : { outV: [], outL: [] };
  const rainS = wxCity ? rangeSeries(wxCity.time, wxCity.precipitation) : { outV: [], outL: [] };

  const flyTo = (cx: number, cy: number, k: number) => setView({ cx, cy, k });

  const doSearch = () => {
    const q = query.trim();
    if (!q) return;
    const coord = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (coord) {
      const lat = parseFloat(coord[1]), lon = parseFloat(coord[2]);
      if (lat >= -12 && lat <= 7 && lon >= 94 && lon <= 142) {
        const [x, y] = proj(lon, lat);
        flyTo(x, y, 6);
        setSearchNote('Showing coordinates ' + lat + ', ' + lon);
        return;
      }
      setSearchNote('Coordinates outside Indonesia.');
      return;
    }
    const ql = q.toLowerCase();
    const city = CITIES.find((c) => c.name.toLowerCase().includes(ql));
    if (city) {
      const [x, y] = proj(city.lon, city.lat);
      flyTo(x, y, 6); setChartCity(city.id);
      setSearchNote('Showing ' + city.name + ', ' + city.province);
      return;
    }
    const prov = PROVINCES.find((p) => p.name.toLowerCase().includes(ql));
    if (prov) {
      const bb = prov.bbox;
      setProvince(prov.name);
      flyTo((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, Math.min(10, 0.8 * Math.min(930 / (bb[2] - bb[0] + 8), 360 / (bb[3] - bb[1] + 8))));
      setSearchNote('Showing ' + prov.name);
      return;
    }
    setSearchNote('No province, city, or coordinates match "' + q + '".');
  };

  const zoomProvince = (name: string) => {
    const bb = PROV_BBOX.get(name); if (!bb) return;
    setProvince(name);
    flyTo((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, Math.min(10, 0.8 * Math.min(930 / (bb[2] - bb[0] + 8), 360 / (bb[3] - bb[1] + 8))));
  };

  const selCity = selected ? nearestCity(selected.lat, selected.lon) : null;
  const selDist = selected && selCity ? haversineKm(selected.lat, selected.lon, selCity.lat, selCity.lon) : 0;
  const related = selected ? visible.filter((h) => h.id !== selected.id && Math.abs(h.lat - selected.lat) < 1 && Math.abs(h.lon - selected.lon) < 1).slice(0, 5) : [];

  const lastUpd = freshest ? fmtWIB(freshest) : 'no live data yet';

  return (
    <div className={'kw ' + theme}>
      {/* ===== Header ===== */}
      <header className="kw-header">
        <div className="kw-title-block">
          <div className="kw-title">KARHUTLA WATCH <span className={'live-dot ' + (anyLiveOk ? 'on' : 'off')} title={anyLiveOk ? 'Live feeds connected' : 'No live feed'} /></div>
          <div className="kw-sub">Indonesia Fire &amp; Smoke Intelligence</div>
        </div>
        <div className="kw-header-right">
          <div className="kw-meta">
            <div>Updated <b>{lastUpd}</b></div>
            <div className="kw-src-line">
              <span className="chip chip-live">{"LIVE: wind, air quality, EONET" + (hotspotsLive ? ", FIRMS hotspots" : "")}</span>
              <span className="chip chip-demo">{hotspotsLive ? "DEMO: smoke plumes only" : "DEMO: hotspots, smoke"}</span>
            </div>
          </div>
          <div className="kw-controls">
            <div className="seg">
              {RANGES.map((r) => <button key={r.k} className={rangeKey === r.k ? 'on' : ''} onClick={() => { setRangeKey(r.k); setCursor(null); }}>{r.label}</button>)}
            </div>
            <form className="kw-search" onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Province, city, or lat, lon" aria-label="Search location" />
            </form>
            <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark or light mode">{theme === 'dark' ? 'Light' : 'Dark'} mode</button>
          </div>
        </div>
        {searchNote ? <div className="kw-search-note">{searchNote}<button onClick={() => setSearchNote('')} aria-label="Dismiss">x</button></div> : null}
      </header>

      {/* ===== KPI cards ===== */}
      <section className="kpis">
        <div className="kpi"><div className="kpi-label">Active hotspots {hTag}</div><div className="kpi-val">{visible.length}</div><div className="kpi-sub">{hotspotsLive ? 'NASA FIRMS VIIRS detections' : 'simulated detections'}, {range.label} range</div></div>
        <div className="kpi"><div className="kpi-label">High confidence {hTag}</div><div className="kpi-val kpi-red">{highConf.length}</div><div className="kpi-sub">{hotspotsLive ? 'FIRMS confidence class' : 'simulated, FIRMS-style class'}</div></div>
        <div className="kpi"><div className="kpi-label">Provinces affected {hTag}</div><div className="kpi-val">{affected.size}</div><div className="kpi-sub">of 38 provinces</div></div>
        <div className="kpi"><div className="kpi-label">Worst PM2.5 <span className="tag tag-live">LIVE</span></div>
          {worstPm ? (<><div className="kpi-val" style={{ color: pm25Band(worstPm.v).color }}>{Math.round(worstPm.v)}<span className="kpi-unit">ug/m3</span></div><div className="kpi-sub">{worstPm.city.name} - {pm25Band(worstPm.v).label} - {worstPm.t.replace('T', ' ')} WIB (CAMS model)</div></>)
            : <div className="kpi-val kpi-na">--</div>}
        </div>
        <div className="kpi"><div className="kpi-label">Smoke risk</div><div className="kpi-val kpi-na">n/a</div><div className="kpi-sub">no official assessment connected; not estimated</div></div>
        <div className="kpi"><div className="kpi-label">Data freshness <span className="tag tag-live">LIVE</span></div>
          {freshMin !== null ? <><div className="kpi-val">{freshMin}<span className="kpi-unit">min</span></div><div className="kpi-sub">since latest live update</div></> : <div className="kpi-val kpi-na">--</div>}
        </div>
      </section>

      {/* ===== Main: map + side ===== */}
      <main className="kw-main">
        <section className="map-panel panel">
          <div className="panel-head">
            <h2>Fire &amp; smoke map</h2>
            <div className="layer-toggles">
              {([['hotspots', 'Hotspots (demo)'], ['heat', 'Heatmap'], ['smoke', 'Smoke (modeled)'], ['wind', 'Wind'], ['aq', 'PM2.5'], ['cities', 'Cities'], ['eonet', 'EONET']] as [keyof Layers, string][]).map(([k, label]) => (
                <button key={k} className={layers[k] ? 'on' : ''} onClick={() => setLayers({ ...layers, [k]: !layers[k] })}>{label}</button>
              ))}
            </div>
          </div>
          <MapView hotspots={visible} eonet={eonet} layers={layers} view={view} setView={setView}
            weather={weather} aq={aq} now={now} provinceFilter={province}
            selectedHotspotId={selected?.id ?? null}
            onHotspot={(h) => setSelected(h)}
            onCity={(c) => setChartCity(c.id)}
            onProvince={(name) => zoomProvince(name)} />
          <div className="timeline">
            <button className="play" onClick={() => { if (cursor === null) setCursor(rangeStart); setPlaying(!playing); }}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={0} max={1000} value={cursor === null ? 1000 : Math.round(((cursor - rangeStart) / range.ms) * 1000)}
              onChange={(e) => { setPlaying(false); const f = Number(e.target.value) / 1000; setCursor(f >= 1 ? null : rangeStart + f * range.ms); }}
              aria-label="Timeline" />
            <span className="timeline-label">{cursor === null ? 'Latest: ' + fmtWIB(now) : fmtWIB(cursorTs)}</span>
          </div>
          <div className="map-note">{hotspotsLive ? <>Hotspots are <b>live NASA FIRMS detections</b>; smoke drift is a directional estimate from live wind, not a measured plume.</> : <>Hotspots and smoke on this map are <b>simulated demo data</b>; smoke drift uses live wind but is a directional estimate, not a measured plume.</>} Wind, PM2.5 and EONET markers are live.</div>
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-head"><h2>Regional ranking</h2>{hotspotsLive ? <span className="tag tag-live">LIVE counts</span> : <span className="tag tag-demo">DEMO counts</span>}</div>
            <div className="region-filters">
              <button className={region === 'all' ? 'on' : ''} onClick={() => setRegion('all')}>All</button>
              {REGIONS.map((r) => <button key={r} className={region === r ? 'on' : ''} onClick={() => setRegion(r)}>{r}</button>)}
            </div>
            {province !== 'all' && <div className="prov-filter">Province: <b>{province}</b> <button onClick={() => setProvince('all')}>clear</button></div>}
            <div className="rank-list">
              {ranking.length === 0 && <div className="empty">{hotspotsLive ? 'No FIRMS detections in this selection.' : 'No demo hotspots in this selection.'}</div>}
              {ranking.map((r, i) => (
                <button key={r.name} className="rank-row" onClick={() => zoomProvince(r.name)}>
                  <span className="rank-num">{i + 1}</span>
                  <span className="rank-body">
                    <span className="rank-name">{r.name}</span>
                    <span className="rank-sub">latest {fmtWIB(r.latest)} - {r.hi} high-conf
                      {r.pm !== null ? ' - PM2.5 ' + Math.round(r.pm!) + ' (' + r.city.name + ')' : ''}
                      {r.windSpd !== null ? ' - wind ' + compass(r.windDir!) + ' ' + Math.round(r.windSpd!) + ' km/h' : ''}
                    </span>
                  </span>
                  <span className="rank-count">{r.n}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Alert center</h2></div>
            <div className="alert-list">
              {alerts.length === 0 && <div className="empty">No alerts for the current selection.</div>}
              {alerts.slice(0, 10).map((a, i) => (
                <div key={i} className={'alert alert-' + a.tone}>
                  <span className={'alert-tag tag-' + (a.tag === 'LIVE' ? 'live' : a.tag === 'FEED' ? 'feed' : 'demo')}>{a.tag}</span>
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
            <div className="alert-note">Alerts are evaluated in this page from the feeds above. No notifications are sent anywhere.</div>
          </section>
        </aside>
      </main>

      {/* ===== Charts ===== */}
      <section className="charts">
        <div className="panel">
          <div className="panel-head"><h2>Hotspot detections over time</h2>{hTag}</div>
          <BarChart items={buckets.arr.map((v, i) => ({ label: buckets.labels[i], value: v }))} unit="detections" height={150} />
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Hotspots by province</h2>{hTag}</div>
          <BarChart items={provBars} unit="detections" height={150} />
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Confidence distribution</h2>{hTag}</div>
          <Donut items={confDonut} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>PM2.5 &amp; PM10 - {chartCityObj.name}</h2><span className="tag tag-live">LIVE - CAMS model</span>
          </div>
          <CityPicker value={chartCity} onChange={setChartCity} />
          <LineChart labels={pmS.outL} series={[
            { label: 'PM2.5', color: '#fbbf24', values: pmS.outV },
            { label: 'PM10', color: '#7dd3fc', values: pm10S.outV, dashed: true },
          ]} unit="ug/m3" height={150} />
          <div className="chart-src">CAMS atmospheric model via Open-Meteo - not ground-station readings.</div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Wind speed - {chartCityObj.name}</h2><span className="tag tag-live">LIVE</span></div>
          <LineChart labels={windS.outL} series={[{ label: 'Wind', color: '#7dd3fc', values: windS.outV }]} unit="km/h, 10 m" height={150} />
          <div className="chart-src">Open-Meteo forecast model, 10 m wind.</div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Rainfall - {chartCityObj.name}</h2><span className="tag tag-live">LIVE</span></div>
          <BarChart items={rainS.outV.map((v, i) => ({ label: rainS.outL[i], value: Math.round((v || 0) * 10) / 10 }))} unit="mm/h" height={150} />
          <div className="chart-src">Open-Meteo precipitation. Historical comparison unavailable: no baseline bundled.</div>
        </div>
      </section>

      {/* ===== Data sources ===== */}
      <section className="panel sources">
        <div className="panel-head">
          <h2>Data sources</h2>
          <label className="refresh">Refresh
            <select value={refreshMin} onChange={(e) => setRefreshMin(Number(e.target.value))}>
              <option value={0}>off</option><option value={1}>1 min</option><option value={5}>5 min</option><option value={15}>15 min</option>
            </select>
          </label>
        </div>
        <div className="source-grid">
          {sources.map((s) => (
            <div key={s.key} className="source-card">
              <div className="source-top">
                <span className={'status-dot ' + (s.status === 'ok' ? 'ok' : s.status === 'error' ? 'err' : s.status === 'loading' ? 'load' : 'off')} />
                <b>{s.label}</b>
                <span className={'tag tag-' + s.kind}>{s.kind === 'live' ? 'LIVE' : s.kind === 'demo' ? 'DEMO' : 'NOT CONNECTED'}</span>
              </div>
              <div className="source-detail">
                {s.status === 'ok' && s.kind === 'live' ? 'Last update ' + (s.lastOk ? fmtWIB(s.lastOk) : '-') + (s.detail ? ' - ' + s.detail : '')
                  : s.status === 'loading' ? 'Connecting...'
                  : s.status === 'error' ? 'Feed failed: ' + s.detail
                  : s.detail || ''}
              </div>
            </div>
          ))}
        </div>
        <div className="source-note">
          Satellite hotspot detections indicate possible fires, not confirmed incidents. AQI bands use US EPA PM2.5 breakpoints on CAMS model values.
          Real hotspot data: <a href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noreferrer">NASA FIRMS</a> (free key), <a href="https://www.bmkg.go.id" target="_blank" rel="noreferrer">BMKG</a>, <a href="https://openaq.org" target="_blank" rel="noreferrer">OpenAQ</a>, <a href="https://eonet.gsfc.nasa.gov" target="_blank" rel="noreferrer">NASA EONET</a>.
        </div>
      </section>

      <footer className="kw-footer">
        KARHUTLA WATCH - Indonesia fire & smoke intelligence. Boundaries: 38 provinces (denyherianto/indonesia-geojson-topojson-maps-with-38-provinces). Hotspots: NASA FIRMS when configured, otherwise simulated demo data. Nothing on this page sends alerts, emails, or notifications.
      </footer>

      {/* ===== Hotspot drawer ===== */}
      {selected && (
        <div className="drawer-back" onClick={() => setSelected(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h3>Hotspot #{selected.id} {selected.demo ? <span className="tag tag-demo">SIMULATED</span> : <span className="tag tag-live">LIVE - NASA FIRMS</span>}</h3>
              <button onClick={() => setSelected(null)} aria-label="Close">x</button>
            </div>
            <dl className="drawer-facts">
              <div><dt>Coordinates</dt><dd>{selected.lat}, {selected.lon}</dd></div>
              <div><dt>Detected</dt><dd>{fmtWIB(selected.ts)}<br />{fmtUTC(selected.ts)}</dd></div>
              <div><dt>Satellite</dt><dd>{selected.sat}{selected.demo ? ' (simulated label)' : ''}</dd></div>
              <div><dt>Confidence</dt><dd><span className={'conf conf-' + selected.conf}>{selected.conf}</span>{selected.demo ? ' (FIRMS-style class, simulated)' : ' (FIRMS class)'}</dd></div>
              <div><dt>Fire radiative power</dt><dd>{selected.frp} MW{selected.demo ? ' (simulated)' : ''}</dd></div>
              <div><dt>Province</dt><dd>{selected.province}</dd></div>
              <div><dt>Nearest city</dt><dd>{selCity?.name} - about {Math.round(selDist)} km</dd></div>
              <div><dt>Nearest AQ point</dt><dd>{selCity?.name}{aq[selCity!.id] ? (() => { const a = aq[selCity!.id]; const li = latestIdx(a.time, now); const v = li >= 0 ? a.pm2_5[li] : null; return v !== null ? ': PM2.5 ' + Math.round(v) + ' ug/m3 (CAMS, live)' : ': no current reading'; })() : ''}</dd></div>
              <div><dt>Nearby detections</dt><dd>{related.length ? related.map((h) => '#' + h.id + ' (' + h.conf + ')').join(', ') : 'none within 1 deg in range'}</dd></div>
            </dl>
            <div className="drawer-note">
              {selected.demo
                ? <>This point is generated demonstration data for UI development. It is not a real detection. Real detections: <a href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noreferrer">NASA FIRMS map</a>.</>
                : <>Live detection from NASA FIRMS (VIIRS SNPP near-real-time feed). Satellite hotspots indicate possible fires, not confirmed incidents. Cross-check with <a href="https://www.bmkg.go.id" target="_blank" rel="noreferrer">BMKG</a> for official advisories.</>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function CityPicker(props: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="city-picker" value={props.value} onChange={(e) => props.onChange(e.target.value)} aria-label="Chart monitoring point">
      {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
