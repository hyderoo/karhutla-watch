import React from 'react';

export interface Series { label: string; color: string; values: (number | null)[]; dashed?: boolean; }

export function LineChart(props: { series: Series[]; labels: string[]; height?: number; unit?: string; maxTicks?: number }) {
  const W = 560, H = props.height || 170, PL = 42, PR = 10, PT = 12, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const all = props.series.flatMap(s => s.values.filter((v): v is number => v !== null && !isNaN(v)));
  if (!all.length) return <div className="chart-empty">No data for this selection.</div>;
  const max = Math.max(...all, 1) * 1.15, min = Math.min(0, ...all);
  const n = props.labels.length;
  const x = (i: number) => PL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PT + ih - ((v - min) / (max - min)) * ih;
  const tickEvery = Math.ceil(n / (props.maxTicks || 6));
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => min + f * (max - min));
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className="chart" role="img">
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={y(g)} y2={y(g)} className="chart-grid" />
          <text x={PL - 6} y={y(g) + 3.5} className="chart-tick" textAnchor="end">{Math.round(g * 10) / 10}</text>
        </g>
      ))}
      {props.series.map((s, si) => {
        const pts = s.values.map((v, i) => (v === null || isNaN(v)) ? null : [x(i), y(v)] as [number, number]);
        let d = '', pen = false;
        pts.forEach(p => { if (!p) { pen = false; return; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); pen = true; });
        return <path key={si} d={d} fill="none" stroke={s.color} strokeWidth={1.8} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />;
      })}
      {props.labels.map((l, i) => i % tickEvery === 0 ? <text key={i} x={x(i)} y={H - 8} className="chart-tick" textAnchor="middle">{l}</text> : null)}
      {props.unit ? <text x={PL} y={PT - 2} className="chart-unit">{props.unit}</text> : null}
    </svg>
  );
}

export function BarChart(props: { items: { label: string; value: number; color?: string }[]; height?: number; unit?: string; maxLabels?: number }) {
  const W = 560, H = props.height || 170, PL = 42, PR = 10, PT = 12, PB = 30;
  const iw = W - PL - PR, ih = H - PT - PB;
  if (!props.items.length) return <div className="chart-empty">No data for this selection.</div>;
  const max = Math.max(...props.items.map(i => i.value), 1) * 1.12;
  const bw = iw / props.items.length;
  const labelEvery = Math.ceil(props.items.length / (props.maxLabels || 8));
  const grid = [0, 0.5, 1].map(f => f * max);
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className="chart" role="img">
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={PL} x2={W - PR} y1={PT + ih - (g / max) * ih} y2={PT + ih - (g / max) * ih} className="chart-grid" />
          <text x={PL - 6} y={PT + ih - (g / max) * ih + 3.5} className="chart-tick" textAnchor="end">{Math.round(g)}</text>
        </g>
      ))}
      {props.items.map((it, i) => {
        const h = (it.value / max) * ih;
        return (
          <g key={i}>
            <rect x={PL + i * bw + bw * 0.18} y={PT + ih - h} width={bw * 0.64} height={Math.max(h, 0.5)} rx={2} fill={it.color || 'var(--accent)'} opacity={0.9} />
            {props.items.length <= 16 ? <text x={PL + i * bw + bw / 2} y={PT + ih - h - 4} className="chart-tick chart-val" textAnchor="middle">{it.value}</text> : null}
            {i % labelEvery === 0 ? <text x={PL + i * bw + bw / 2} y={H - 14} className="chart-tick" textAnchor="middle">{it.label}</text> : null}
          </g>
        );
      })}
      {props.unit ? <text x={PL} y={PT - 2} className="chart-unit">{props.unit}</text> : null}
    </svg>
  );
}

export function Donut(props: { items: { label: string; value: number; color: string }[]; height?: number }) {
  const total = props.items.reduce((s, i) => s + i.value, 0);
  if (!total) return <div className="chart-empty">No data for this selection.</div>;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="chart donut" role="img">
        <circle cx={70} cy={70} r={R} fill="none" stroke="var(--panel-2)" strokeWidth={16} />
        {props.items.map((it, i) => {
          const frac = it.value / total;
          const el = <circle key={i} cx={70} cy={70} r={R} fill="none" stroke={it.color} strokeWidth={16}
            strokeDasharray={(frac * C).toFixed(1) + ' ' + C.toFixed(1)} strokeDashoffset={(-acc * C).toFixed(1)} transform="rotate(-90 70 70)" />;
          acc += frac;
          return el;
        })}
        <text x={70} y={66} textAnchor="middle" className="donut-num">{total}</text>
        <text x={70} y={82} textAnchor="middle" className="donut-cap">detections</text>
      </svg>
      <div className="donut-legend">
        {props.items.map((it, i) => (
          <div key={i} className="legend-row"><span className="sw" style={{ background: it.color }} />{it.label}<b>{it.value}</b><span className="legend-pct">{Math.round((it.value / total) * 100)}%</span></div>
        ))}
      </div>
    </div>
  );
}
