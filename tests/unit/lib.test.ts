import { describe, it, expect } from 'vitest';
import {
  mulberry32, haversineKm, nearestCity, compass, pm25Band,
  proj, unproj, parseWIBNaive, fmtWIB, latestIdx, provinceOf, genDemoHotspots,
} from '../../src/lib';
import { PROVINCES } from '../../src/data-provinces';

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
  it('stays in [0, 1) and differs across seeds', () => {
    const r = mulberry32(7);
    const vals = Array.from({ length: 500 }, () => r());
    for (const v of vals) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
    expect(mulberry32(7)()).not.toBe(mulberry32(8)());
  });
});

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(-6.21, 106.85, -6.21, 106.85)).toBe(0);
  });
  it('matches one degree of longitude at the equator (~111 km)', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 0);
  });
  it('is symmetric', () => {
    expect(haversineKm(-6.21, 106.85, 3.59, 98.67)).toBeCloseTo(haversineKm(3.59, 98.67, -6.21, 106.85), 10);
  });
});

describe('nearestCity', () => {
  it('returns Jakarta for a point inside the city', () => {
    expect(nearestCity(-6.2, 106.84).id).toBe('jakarta');
  });
  it('returns Makassar for a point just outside the city', () => {
    expect(nearestCity(-5.1, 119.4).id).toBe('makassar');
  });
});

describe('compass', () => {
  it('maps cardinal and intercardinal degrees', () => {
    expect(compass(0)).toBe('N');
    expect(compass(90)).toBe('E');
    expect(compass(180)).toBe('S');
    expect(compass(225)).toBe('SW');
    expect(compass(270)).toBe('W');
  });
  it('wraps around past 360', () => {
    expect(compass(359)).toBe('N');
    expect(compass(371)).toBe('N');
  });
});

describe('pm25Band', () => {
  it('labels missing data honestly', () => {
    expect(pm25Band(null).label).toBe('No data');
    expect(pm25Band(undefined).label).toBe('No data');
    expect(pm25Band(NaN).label).toBe('No data');
  });
  it('follows US EPA breakpoints at the edges', () => {
    expect(pm25Band(0).label).toBe('Good');
    expect(pm25Band(12).label).toBe('Good');
    expect(pm25Band(12.1).label).toBe('Moderate');
    expect(pm25Band(35.4).label).toBe('Moderate');
    expect(pm25Band(35.5).label).toBe('Unhealthy for sensitive groups');
    expect(pm25Band(55.5).label).toBe('Unhealthy');
    expect(pm25Band(150.5).label).toBe('Very unhealthy');
    expect(pm25Band(250.5).label).toBe('Hazardous');
  });
});

describe('proj/unproj', () => {
  it('round-trips coordinates', () => {
    const [x, y] = proj(106.85, -6.21);
    const [lon, lat] = unproj(x, y);
    expect(lon).toBeCloseTo(106.85, 10);
    expect(lat).toBeCloseTo(-6.21, 10);
  });
});

describe('WIB time helpers', () => {
  it('parses naive WIB strings as UTC+7', () => {
    expect(parseWIBNaive('2026-10-22T13:30')).toBe(Date.parse('2026-10-22T13:30:00+07:00'));
  });
  it('formats in Asia/Jakarta regardless of host timezone', () => {
    const ts = Date.parse('2026-10-22T13:30:00+07:00');
    expect(fmtWIB(ts, false)).toBe('13:30 WIB');
  });
});

describe('latestIdx', () => {
  const times = ['2026-10-22T00:00', '2026-10-22T06:00', '2026-10-22T12:00'];
  it('picks the last time not after now', () => {
    expect(latestIdx(times, Date.parse('2026-10-22T08:00:00+07:00'))).toBe(1);
  });
  it('returns -1 when everything is in the future', () => {
    expect(latestIdx(times, Date.parse('2026-10-21T23:00:00+07:00'))).toBe(-1);
  });
});

describe('provinceOf', () => {
  it('places Palu in Sulawesi Tengah', () => {
    expect(provinceOf(119.87, -0.9, PROVINCES)).toBe('Sulawesi Tengah');
  });
  it('places Pekanbaru in Riau', () => {
    expect(provinceOf(101.45, 0.51, PROVINCES)).toBe('Riau');
  });
});

describe('genDemoHotspots', () => {
  const now = Date.parse('2026-10-22T04:00:00Z');
  it('is deterministic for the same inputs', () => {
    const a = genDemoHotspots(now, PROVINCES);
    const b = genDemoHotspots(now, PROVINCES);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
  it('produces honest demo rows, newest first', () => {
    const spots = genDemoHotspots(now, PROVINCES);
    for (const h of spots) {
      expect(h.demo).toBe(true);
      expect(['low', 'nominal', 'high']).toContain(h.conf);
      expect(h.ts).toBeLessThanOrEqual(now);
      expect(h.frp).toBeGreaterThan(0);
    }
    for (let i = 1; i < spots.length; i++) expect(spots[i - 1].ts).toBeGreaterThanOrEqual(spots[i].ts);
  });
  it('assigns every hotspot to a province', () => {
    const spots = genDemoHotspots(now, PROVINCES);
    const names = new Set(PROVINCES.map((p) => p.name));
    for (const h of spots) expect(names.has(h.province)).toBe(true);
  });
});
