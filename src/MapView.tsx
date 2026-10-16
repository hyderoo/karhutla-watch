import React, { useEffect, useRef, useState } from 'react';
import { CITIES, CityPoint, EonetEvent, Hotspot, WeatherHourly, AqHourly, proj, compass, pm25Band, latestIdx } from './lib';
import { PROVINCES } from './data-provinces';

export interface ViewState { cx: number; cy: number; k: number; }
export interface Layers { hotspots: boolean; heat: boolean; smoke: boolean; wind: boolean; aq: boolean; cities: boolean; bounds: boolean; eonet: boolean; }

const FULL_W = 46.5 * 20; // 930
const FULL_H = 18 * 20;   // 360
export const FULL_VIEW: ViewState = { cx: FULL_W / 2, cy: FULL_H / 2, k: 1 };

const CONF_COLOR: Record<string, string> = { high: '#ef4444', nominal: '#f59e0b', low: '#38bdf8' };

interface Props {
  hotspots: Hotspot[];
  eonet: EonetEvent[];
  layers: Layers;
  view: ViewState;
  setView: (v: ViewState) => void;
  weather: Record<string, WeatherHourly>;
  aq: Record<string, AqHourly>;
  now: number;
  provinceFilter: string;
  onHotspot: (h: Hotspot) => void;
  onCity: (c: CityPoint) => void;
  onProvince: (name: string) => void;
  selectedHotspotId?: number | null;
}

export function MapView(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [hoverProv, setHoverProv] = useState<string>('');
  const [aspect, setAspect] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 1 / 1.3 : 1 / 1.7));

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setAspect(r.height / r.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const kMin = Math.max(1, (aspect * FULL_W) / FULL_H);
  const kEff = Math.max(p.view.k, kMin);
  const vw = FULL_W / kEff, vh = vw * aspect;
  const vx = Math.min(Math.max(p.view.cx - vw / 2, -vw * 0.25), FULL_W - vw * 0.75);
  const vy = Math.min(Math.max(p.view.cy - vh / 2, -vh * 0.25), FULL_H - vh * 0.75);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = vx + ((e.clientX - rect.left) / rect.width) * vw;
      const my = vy + ((e.clientY - rect.top) / rect.height) * vh;
      const f = e.deltaY < 0 ? 1.25 : 0.8;
      const k = Math.min(Math.max(p.view.k * f, 1), 14);
      p.setView({ cx: mx - (mx - p.view.cx) * (p.view.k / k), cy: my - (my - p.view.cy) * (p.view.k / k), k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [p.view, vx, vy, vw, vh]);

  const zoom = (f: number) => p.setView({ ...p.view, k: Math.min(Math.max(p.view.k * f, 1), 14) });

  // heatmap grid
  const heatCells: { x: number; y: number; n: number }[] = [];
  if (p.layers.heat) {
    const grid = new Map<string, { x: number; y: number; n: number }>();
    for (const h of p.hotspots) {
      const [x, y] = proj(h.lon, h.lat);
      const key = Math.floor(x / 16) + ':' + Math.floor(y / 16);
      const cell = grid.get(key) || { x: (Math.floor(x / 16) + 0.5) * 16, y: (Math.floor(y / 16) + 0.5) * 16, n: 0 };
      cell.n++; grid.set(key, cell);
    }
    heatCells.push(...grid.values());
  }
  const heatMax = Math.max(1, ...heatCells.map(c => c.n));

  // smoke plumes from top-FRP hotspots + live wind (modeled, not measured)
  const plumes: { x: number; y: number; rot: number; len: number; wid: number; key: number }[] = [];
  if (p.layers.smoke) {
    const top = [...p.hotspots].sort((a, b) => b.frp - a.frp).slice(0, 14);
    for (const h of top) {
      const city = CITIES.reduce((b, c) => (Math.hypot(c.lat - h.lat, c.lon - h.lon) < Math.hypot(b.lat - h.lat, b.lon - h.lon) ? c : b), CITIES[0]);
      const w = p.weather[city.id];
      if (!w) continue;
      const li = latestIdx(w.time, p.now);
      if (li < 0) continue;
      const dirFrom = w.wind_direction_10m[li];
      const speed = w.wind_speed_10m[li];
      const to = (dirFrom + 180) % 360;
      const [x, y] = proj(h.lon, h.lat);
      const len = Math.min(46, (10 + h.frp * 0.45) * (0.7 + Math.min(speed, 40) / 40));
      plumes.push({ x, y, rot: to - 90, len, wid: len * 0.42, key: h.id });
    }
  }

  return (
    <div className="map-shell" ref={shellRef}>
      <svg ref={svgRef} className="map" viewBox={vx + ' ' + vy + ' ' + vw + ' ' + vh} role="application" aria-label="Indonesia fire monitoring map"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: p.view.cx, cy: p.view.cy, moved: false }; }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const rect = svgRef.current!.getBoundingClientRect();
          const dx = ((e.clientX - drag.current.x) / rect.width) * vw;
          const dy = ((e.clientY - drag.current.y) / rect.height) * vh;
          if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 4) drag.current.moved = true;
          p.setView({ cx: drag.current.cx - dx, cy: drag.current.cy - dy, k: p.view.k });
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <defs>
          <radialGradient id="heat" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="plume" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d6a04a" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#d6a04a" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <rect x={vx - vw} y={vy - vh} width={vw * 3} height={vh * 3} className="ocean" />

        {/* province boundaries */}
        <g className="provinces">
          {PROVINCES.map((prov) => (
            <path key={prov.id} d={prov.d.join('')} className={'province' + (p.provinceFilter === prov.name ? ' is-selected' : '') + (hoverProv === prov.name ? ' is-hover' : '')}
              onPointerEnter={() => setHoverProv(prov.name)} onPointerLeave={() => setHoverProv('')}
              onClick={() => { if (!drag.current?.moved) p.onProvince(prov.name); }} />
          ))}
        </g>

        {/* heatmap */}
        {p.layers.heat && heatCells.map((c, i) => (
          <circle key={'h' + i} cx={c.x} cy={c.y} r={10 + (c.n / heatMax) * 30} fill="url(#heat)" opacity={0.35 + 0.5 * (c.n / heatMax)} />
        ))}

        {/* smoke plumes */}
        {p.layers.smoke && plumes.map((pl) => (
          <ellipse key={'p' + pl.key} cx={pl.x} cy={pl.y} rx={pl.len} ry={pl.wid / 2} fill="url(#plume)"
            transform={'rotate(' + pl.rot + ' ' + pl.x + ' ' + pl.y + ') translate(' + pl.len * 0.55 + ' 0)'} />
        ))}

        {/* wind arrows */}
        {p.layers.wind && CITIES.map((c) => {
          const w = p.weather[c.id];
          if (!w) return null;
          const li = latestIdx(w.time, p.now);
          if (li < 0) return null;
          const dir = (w.wind_direction_10m[li] + 180) % 360;
          const sp = w.wind_speed_10m[li];
          const [x, y] = proj(c.lon, c.lat);
          const len = Math.min(16, 5 + sp * 0.5);
          return (
            <g key={'w' + c.id} transform={'translate(' + x + ' ' + y + ') rotate(' + (dir - 90) + ')'} className="wind">
              <line x1={-len * 0.4} y1={0} x2={len} y2={0} />
              <path d={'M' + len + ' 0 l-4 -2.4 v4.8 z'} className="wind-head" />
              <text x={-len * 0.4} y={-3} transform={'rotate(' + (90 - dir) + ' ' + (-len * 0.4) + ' -3)'} className="wind-label">{Math.round(sp)}</text>
            </g>
          );
        })}

        {/* AQ points */}
        {p.layers.aq && CITIES.map((c) => {
          const a = p.aq[c.id];
          if (!a) return null;
          const li = latestIdx(a.time, p.now);
          const v = li >= 0 ? a.pm2_5[li] : null;
          const band = pm25Band(v);
          const [x, y] = proj(c.lon, c.lat);
          return (
            <g key={'a' + c.id} className="aq-point" onClick={(e) => { e.stopPropagation(); p.onCity(c); }}>
              <circle cx={x} cy={y} r={5.2} fill={band.color} fillOpacity={0.9} stroke="var(--map-bg)" strokeWidth={1.2} />
              <text x={x} y={y + 2.6} textAnchor="middle" className="aq-num">{v === null ? '?' : Math.round(v)}</text>
            </g>
          );
        })}

        {/* EONET live wildfire events */}
        {p.layers.eonet && p.eonet.map((e) => {
          const [x, y] = proj(e.lon, e.lat);
          return (
            <g key={'e' + e.id} className="eonet">
              <circle cx={x} cy={y} r={7} fill="none" stroke="#22d3ee" strokeWidth={1.4} strokeDasharray="3 2" />
              <circle cx={x} cy={y} r={2.6} fill="#22d3ee" />
            </g>
          );
        })}

        {/* demo hotspots */}
        {p.layers.hotspots && p.hotspots.map((h) => {
          const [x, y] = proj(h.lon, h.lat);
          const r = h.conf === 'high' ? 3.1 : h.conf === 'nominal' ? 2.3 : 1.7;
          return (
            <circle key={'s' + h.id} cx={x} cy={y} r={r} fill={CONF_COLOR[h.conf]}
              className={'hotspot' + (p.selectedHotspotId === h.id ? ' is-selected' : '')}
              onClick={(ev) => { ev.stopPropagation(); if (!drag.current?.moved) p.onHotspot(h); }} />
          );
        })}

        {/* cities */}
        {p.layers.cities && CITIES.map((c) => {
          const [x, y] = proj(c.lon, c.lat);
          return (
            <g key={'c' + c.id} className="city" onClick={(e) => { e.stopPropagation(); p.onCity(c); }}>
              <circle cx={x} cy={y} r={1.6} />
              <text x={x + 3} y={y + 2.4}>{c.name}</text>
            </g>
          );
        })}
      </svg>

      <div className="map-controls">
        <button onClick={() => zoom(1.4)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">-</button>
        <button onClick={() => p.setView(FULL_VIEW)} aria-label="Reset view">&#x2302;</button>
      </div>

      <div className="map-legend">
        {p.layers.hotspots && <span className="lg"><i style={{ background: CONF_COLOR.high }} />High</span>}
        {p.layers.hotspots && <span className="lg"><i style={{ background: CONF_COLOR.nominal }} />Nominal</span>}
        {p.layers.hotspots && <span className="lg"><i style={{ background: CONF_COLOR.low }} />Low</span>}
        {p.layers.eonet && <span className="lg"><i style={{ background: '#22d3ee' }} />EONET live</span>}
        {p.layers.aq && <span className="lg"><i style={{ background: '#34d399' }} />PM2.5 ug/m3</span>}
        {p.layers.smoke && <span className="lg"><i style={{ background: '#d6a04a' }} />Smoke (modeled)</span>}
        {p.layers.wind && <span className="lg"><i style={{ background: '#7dd3fc' }} />Wind km/h</span>}
      </div>
      {hoverProv ? <div className="map-hover-name">{hoverProv}</div> : null}
    </div>
  );
}
