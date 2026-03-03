import * as maptalks from "maptalks";
import * as mgrs from "mgrs";
import { useEffect } from "react";
import { settingsStore } from "../stores/SettingsStore";

const MGRS_BANDS = "CDEFGHJKLMNPQRSTUVWX";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function interpolateByZoom(
  zoom: number,
  zoomStart: number,
  zoomEnd: number,
  sizeStart: number,
  sizeEnd: number
) {
  if (zoomEnd <= zoomStart) return sizeEnd;
  const t = clamp((zoom - zoomStart) / (zoomEnd - zoomStart), 0, 1);
  return Math.round(sizeStart + (sizeEnd - sizeStart) * t);
}

function getBandLetter(lat: number): string {
  const idx = clamp(Math.floor((lat + 80) / 8), 0, MGRS_BANDS.length - 1);
  return MGRS_BANDS[idx];
}

function getZoneBandLabel(lon: number, lat: number): string {
  const zone = clamp(Math.floor((lon + 180) / 6) + 1, 1, 60);
  return `${zone}${getBandLetter(lat)}`;
}

type ParsedMgrs = {
  zoneBand: string;
  square: string;
  easting: string;
  northing: string;
};

type LatBand = {
  start: number;
  end: number;
  letter: string;
};

type ZoneSegment = {
  zone: number;
  startLon: number;
  endLon: number;
};

function parseMgrsAt(lon: number, lat: number): ParsedMgrs | null {
  try {
    const raw = mgrs.forward([lon, lat], 5).replace(/\s+/g, "").toUpperCase();
    const match = raw.match(/^(\d{1,2}[C-X])([A-Z]{2})(\d+)$/);
    if (!match) return null;
    const digits = match[3];
    if (digits.length < 2 || digits.length % 2 !== 0) return null;
    const half = digits.length / 2;
    return {
      zoneBand: match[1],
      square: match[2],
      easting: digits.slice(0, half),
      northing: digits.slice(half),
    };
  } catch (_err) {
    return null;
  }
}

function getMgrsAnchorPoint(
  lon: number,
  lat: number,
  eastingDigitsToKeep: number
): [number, number] | null {
  const parsed = parseMgrsAt(lon, lat);
  if (!parsed) return null;

  const keep = clamp(eastingDigitsToKeep, 0, 5);
  const e = parsed.easting.slice(0, keep).padEnd(5, "0");
  const n = parsed.northing.slice(0, keep).padEnd(5, "0");
  try {
    const point = mgrs.toPoint(`${parsed.zoneBand}${parsed.square}${e}${n}`);
    return [point[0], point[1]];
  } catch (_err) {
    return null;
  }
}

function toFiveDigits(value: number): string {
  const clamped = clamp(Math.round(value), 0, 99999);
  return clamped.toString().padStart(5, "0");
}

function mgrsPoint(
  zoneBand: string,
  square: string,
  easting: number,
  northing: number
): [number, number] | null {
  try {
    const raw = `${zoneBand}${square}${toFiveDigits(easting)}${toFiveDigits(northing)}`;
    const p = mgrs.toPoint(raw);
    return [p[0], p[1]];
  } catch (_err) {
    return null;
  }
}

function sampleCellEdge(
  zoneBand: string,
  square: string,
  edge: "S" | "N" | "W" | "E",
  segments = 24
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const t = (99999 * i) / segments;
    let p: [number, number] | null = null;
    if (edge === "S") p = mgrsPoint(zoneBand, square, t, 0);
    if (edge === "N") p = mgrsPoint(zoneBand, square, t, 99999);
    if (edge === "W") p = mgrsPoint(zoneBand, square, 0, t);
    if (edge === "E") p = mgrsPoint(zoneBand, square, 99999, t);
    if (p) points.push(p);
  }
  return points;
}

function sampleSubCellEdge(
  zoneBand: string,
  square: string,
  eStart: number,
  eEnd: number,
  nStart: number,
  nEnd: number,
  edge: "S" | "N" | "W" | "E",
  segments = 16
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let e = eStart;
    let n = nStart;
    if (edge === "S") {
      e = eStart + (eEnd - eStart) * t;
      n = nStart;
    } else if (edge === "N") {
      e = eStart + (eEnd - eStart) * t;
      n = nEnd;
    } else if (edge === "W") {
      e = eStart;
      n = nStart + (nEnd - nStart) * t;
    } else if (edge === "E") {
      e = eEnd;
      n = nStart + (nEnd - nStart) * t;
    }
    const p = mgrsPoint(zoneBand, square, e, n);
    if (p) points.push(p);
  }
  return points;
}

function clipEdgeToZoneBand(
  points: Array<[number, number]>,
  zoneBand: string
): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  if (points.length < 2) return out;

  const isInZone = (p: [number, number]) => {
    const parsed = parseMgrsAt(p[0], p[1]);
    return !!parsed && parsed.zoneBand === zoneBand;
  };

  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];

  // Find a transition point between two samples with opposite in/out status.
  // Keeps the point on the requested side of the boundary.
  const findTransitionPoint = (
    a: [number, number],
    b: [number, number],
    keepInsideFromA: boolean
  ): [number, number] => {
    let lo = a;
    let hi = b;
    for (let i = 0; i < 22; i++) {
      const mid = lerp(lo, hi, 0.5);
      const midIn = isInZone(mid);
      if (midIn === keepInsideFromA) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return keepInsideFromA ? lo : hi;
  };

  let current: Array<[number, number]> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const aIn = isInZone(a);
    const bIn = isInZone(b);

    if (aIn && bIn) {
      if (current.length === 0) current.push(a);
      current.push(b);
      continue;
    }

    if (aIn && !bIn) {
      if (current.length === 0) current.push(a);
      current.push(findTransitionPoint(a, b, true));
      if (current.length >= 2) out.push(current);
      current = [];
      continue;
    }

    if (!aIn && bIn) {
      const enter = findTransitionPoint(a, b, false);
      current = [enter, b];
      continue;
    }

    // both outside -> nothing to keep
  }

  if (current.length >= 2) out.push(current);
  return out;
}

function lineFromPoints(points: Array<[number, number]>, symbol: Record<string, unknown>) {
  return new maptalks.LineString(points, {
    symbol,
    draggable: false,
    editable: false,
    interactive: false,
  });
}

function polygonCentroid(points: Array<[number, number]>): [number, number] | null {
  if (points.length < 3) return null;
  let area2 = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    area2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  if (Math.abs(area2) < 1e-12) {
    const avgX = points.reduce((acc, p) => acc + p[0], 0) / points.length;
    const avgY = points.reduce((acc, p) => acc + p[1], 0) / points.length;
    return [avgX, avgY];
  }

  const factor = 1 / (3 * area2);
  return [cx * factor, cy * factor];
}

function getZoneBandConstrainedCellCenter(
  zoneBand: string,
  square: string
): [number, number] | null {
  // Use interior samples (not borders) to compute a stable barycenter that
  // stays inside the requested zone/band even near regional boundaries.
  const ticks = [10000, 30000, 50000, 70000, 90000];
  const inside: Array<[number, number]> = [];
  for (const n of ticks) {
    for (const e of ticks) {
      const p = mgrsPoint(zoneBand, square, e, n);
      if (!p) continue;
      const parsed = parseMgrsAt(p[0], p[1]);
      if (!parsed || parsed.zoneBand !== zoneBand) continue;
      inside.push(p);
    }
  }
  if (inside.length === 0) return null;

  const cLon = inside.reduce((acc, p) => acc + p[0], 0) / inside.length;
  const cLat = inside.reduce((acc, p) => acc + p[1], 0) / inside.length;
  return [cLon, cLat];
}

function getZoneBandConstrainedSubCellCenter(
  zoneBand: string,
  square: string,
  eStart: number,
  eEnd: number,
  nStart: number,
  nEnd: number
): [number, number] | null {
  const ratios = [0.2, 0.5, 0.8];
  const inside: Array<[number, number]> = [];
  for (const rn of ratios) {
    for (const re of ratios) {
      const e = eStart + (eEnd - eStart) * re;
      const n = nStart + (nEnd - nStart) * rn;
      const p = mgrsPoint(zoneBand, square, e, n);
      if (!p) continue;
      const parsed = parseMgrsAt(p[0], p[1]);
      if (!parsed || parsed.zoneBand !== zoneBand) continue;
      inside.push(p);
    }
  }
  if (inside.length === 0) return null;
  const cLon = inside.reduce((acc, p) => acc + p[0], 0) / inside.length;
  const cLat = inside.reduce((acc, p) => acc + p[1], 0) / inside.length;
  return [cLon, cLat];
}

function getExactSubCellCenter(
  zoneBand: string,
  square: string,
  ePrefix: string,
  nPrefix: string
): [number, number] | null {
  const eStart = parseInt(ePrefix.padEnd(5, "0"), 10);
  const nStart = parseInt(nPrefix.padEnd(5, "0"), 10);
  const eStep = ePrefix.length === 2 ? 999 : 9999;
  const nStep = nPrefix.length === 2 ? 999 : 9999;
  const eEnd = Math.min(99999, eStart + eStep);
  const nEnd = Math.min(99999, nStart + nStep);

  const ratios = [0.15, 0.35, 0.5, 0.65, 0.85];
  const inside: Array<[number, number]> = [];
  for (const rn of ratios) {
    for (const re of ratios) {
      const e = eStart + (eEnd - eStart) * re;
      const n = nStart + (nEnd - nStart) * rn;
      const p = mgrsPoint(zoneBand, square, e, n);
      if (!p) continue;
      const parsed = parseMgrsAt(p[0], p[1]);
      if (!parsed) continue;
      if (parsed.zoneBand !== zoneBand) continue;
      if (parsed.square !== square) continue;
      if (!parsed.easting.startsWith(ePrefix)) continue;
      if (!parsed.northing.startsWith(nPrefix)) continue;
      inside.push(p);
    }
  }
  if (inside.length === 0) return null;

  const cLon = inside.reduce((acc, p) => acc + p[0], 0) / inside.length;
  const cLat = inside.reduce((acc, p) => acc + p[1], 0) / inside.length;
  return [cLon, cLat];
}

function collectMgrsSubCellKeys(
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
  digits: 1 | 2
): Set<string> {
  const keySet = new Set<string>();
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  const is1km = digits === 2;
  const lonStep = Math.max(is1km ? 0.004 : 0.02, lonSpan / (is1km ? 260 : 140));
  const latStep = Math.max(is1km ? 0.004 : 0.02, latSpan / (is1km ? 260 : 140));
  const sampleKey = (lon: number, lat: number) => {
    const parsed = parseMgrsAt(lon, lat);
    if (!parsed) return;
    if (parsed.easting.length < digits || parsed.northing.length < digits) return;
    const e = parsed.easting.slice(0, digits);
    const n = parsed.northing.slice(0, digits);
    keySet.add(`${parsed.zoneBand}|${parsed.square}|${e}|${n}`);
  };

  const lonOffsets = is1km ? [0, lonStep * 0.33, lonStep * 0.66] : [0, lonStep * 0.5];
  const latOffsets = is1km ? [0, latStep * 0.33, latStep * 0.66] : [0, latStep * 0.5];
  for (const latOffset of latOffsets) {
    for (const lonOffset of lonOffsets) {
      for (let lat = minLat + latOffset; lat <= maxLat; lat += latStep) {
        for (let lon = minLon + lonOffset; lon <= maxLon; lon += lonStep) {
          sampleKey(lon, lat);
        }
      }
    }
  }

  const borderStep = Math.max(is1km ? 0.0025 : 0.015, Math.min(lonStep, latStep) * 0.5);
  for (let lat = minLat; lat <= maxLat; lat += borderStep) {
    sampleKey(minLon, lat);
    sampleKey(maxLon, lat);
  }
  for (let lon = minLon; lon <= maxLon; lon += borderStep) {
    sampleKey(lon, minLat);
    sampleKey(lon, maxLat);
  }

  // Fill occasional 1km holes caused by sparse sampling by adding immediate
  // numeric neighbors in the same 100km square (filtered later by extent).
  if (is1km) {
    const expanded = new Set<string>(keySet);
    for (const key of keySet) {
      const [zoneBand, square, ePrefix, nPrefix] = key.split("|");
      if (!zoneBand || !square || !ePrefix || !nPrefix) continue;
      const e = parseInt(ePrefix, 10);
      const n = parseInt(nPrefix, 10);
      if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
      for (let de = -1; de <= 1; de++) {
        for (let dn = -1; dn <= 1; dn++) {
          const ee = e + de;
          const nn = n + dn;
          if (ee < 0 || ee > 99 || nn < 0 || nn > 99) continue;
          expanded.add(
            `${zoneBand}|${square}|${ee.toString().padStart(2, "0")}|${nn.toString().padStart(2, "0")}`
          );
        }
      }
    }
    return expanded;
  }

  return keySet;
}

function edgeFingerprint(points: Array<[number, number]>): string {
  // Tolerant full-shape fingerprint:
  // round each sampled point so near-identical curves from adjacent regions collapse.
  const norm = points.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`);
  const forward = norm.join(";");
  const reverse = [...norm].reverse().join(";");
  return forward < reverse ? forward : reverse;
}

type EdgeOrientation = "vertical" | "horizontal";
type EdgeCandidate = {
  points: Array<[number, number]>;
  orientation: EdgeOrientation;
  avgLon: number;
  avgLat: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
};

function toEdgeCandidate(points: Array<[number, number]>): EdgeCandidate {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const dLon = Math.abs(points[0][0] - points[points.length - 1][0]);
  const dLat = Math.abs(points[0][1] - points[points.length - 1][1]);
  return {
    points,
    orientation: dLat >= dLon ? "vertical" : "horizontal",
    avgLon: lons.reduce((a, b) => a + b, 0) / lons.length,
    avgLat: lats.reduce((a, b) => a + b, 0) / lats.length,
    minLon,
    maxLon,
    minLat,
    maxLat,
  };
}

function overlapRatio(a1: number, a2: number, b1: number, b2: number): number {
  const left = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const right = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  const overlap = Math.max(0, right - left);
  const lenA = Math.max(1e-9, Math.abs(a2 - a1));
  const lenB = Math.max(1e-9, Math.abs(b2 - b1));
  return overlap / Math.min(lenA, lenB);
}

function shouldMergeAsSameBoundary(a: EdgeCandidate, b: EdgeCandidate): boolean {
  if (a.orientation !== b.orientation) return false;
  if (a.orientation === "vertical") {
    const closeLon = Math.abs(a.avgLon - b.avgLon) < 0.04;
    const enoughOverlap = overlapRatio(a.minLat, a.maxLat, b.minLat, b.maxLat) > 0.6;
    return closeLon && enoughOverlap;
  }
  const closeLat = Math.abs(a.avgLat - b.avgLat) < 0.04;
  const enoughOverlap = overlapRatio(a.minLon, a.maxLon, b.minLon, b.maxLon) > 0.6;
  return closeLat && enoughOverlap;
}

function keepPreferredEdge(a: EdgeCandidate, b: EdgeCandidate): EdgeCandidate {
  // User rule: when overlapping, keep the rightmost or upper one.
  if (a.orientation === "vertical") {
    return a.avgLon >= b.avgLon ? a : b;
  }
  return a.avgLat >= b.avgLat ? a : b;
}

function suppressOverlappingEdges(edges: Array<EdgeCandidate>): Array<EdgeCandidate> {
  const kept: Array<EdgeCandidate> = [];
  for (const edge of edges) {
    let merged = false;
    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];
      if (!shouldMergeAsSameBoundary(existing, edge)) continue;
      kept[i] = keepPreferredEdge(existing, edge);
      merged = true;
      break;
    }
    if (!merged) kept.push(edge);
  }
  return kept;
}

function intersectsExtent(
  corners: Array<[number, number]>,
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number
): boolean {
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const cMinLon = Math.min(...lons);
  const cMaxLon = Math.max(...lons);
  const cMinLat = Math.min(...lats);
  const cMaxLat = Math.max(...lats);
  return !(cMaxLon < minLon || cMinLon > maxLon || cMaxLat < minLat || cMinLat > maxLat);
}

function edgeKey(a: [number, number], b: [number, number]): string {
  const fmt = (p: [number, number]) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const pa = fmt(a);
  const pb = fmt(b);
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
}

function getLatBands(): LatBand[] {
  const bands: LatBand[] = [];
  for (let i = 0; i < MGRS_BANDS.length; i++) {
    const letter = MGRS_BANDS[i];
    const start = -80 + i * 8;
    const end = letter === "X" ? 84 : start + 8;
    bands.push({ start, end, letter });
  }
  return bands;
}

function getZoneSegmentsForBand(bandLetter: string): ZoneSegment[] {
  const zones = new Map<number, ZoneSegment>();
  for (let zone = 1; zone <= 60; zone++) {
    zones.set(zone, {
      zone,
      startLon: -180 + (zone - 1) * 6,
      endLon: -180 + zone * 6,
    });
  }

  // Norway exception: in band V, zone 32 extends west to 3E.
  if (bandLetter === "V") {
    const z31 = zones.get(31);
    const z32 = zones.get(32);
    if (z31) z31.endLon = 3;
    if (z32) z32.startLon = 3;
  }

  // Svalbard exceptions: in band X, adjusted zone widths between 0E and 42E.
  if (bandLetter === "X") {
    const z31 = zones.get(31);
    const z32 = zones.get(32);
    const z33 = zones.get(33);
    const z34 = zones.get(34);
    const z35 = zones.get(35);
    const z36 = zones.get(36);
    const z37 = zones.get(37);

    if (z31) {
      z31.startLon = 0;
      z31.endLon = 9;
    }
    if (z32) {
      z32.startLon = 0;
      z32.endLon = 0; // removed
    }
    if (z33) {
      z33.startLon = 9;
      z33.endLon = 21;
    }
    if (z34) {
      z34.startLon = 0;
      z34.endLon = 0; // removed
    }
    if (z35) {
      z35.startLon = 21;
      z35.endLon = 33;
    }
    if (z36) {
      z36.startLon = 0;
      z36.endLon = 0; // removed
    }
    if (z37) {
      z37.startLon = 33;
      z37.endLon = 42;
    }
  }

  return [...zones.values()].filter((z) => z.endLon > z.startLon);
}

function createLine(
  a: [number, number],
  b: [number, number],
  symbol: Record<string, unknown>
) {
  return new maptalks.LineString([a, b], {
    symbol,
    draggable: false,
    editable: false,
    interactive: false,
  });
}

function createLabel(
  text: string,
  coord: [number, number],
  symbol: Record<string, unknown>
) {
  return new maptalks.Label(text, coord, {
    draggable: false,
    editable: false,
    interactive: false,
    textSymbol: symbol,
  });
}

export default function useRenderMgrsGrid(map: maptalks.Map | null) {
  useEffect(() => {
    if (!map) return;
    const layer = map.getLayer("mgrs-grid") as maptalks.VectorLayer | undefined;
    if (!layer) return;
    let zoomingRenderTimer: ReturnType<typeof setTimeout> | null = null;

    const renderGrid = () => {
      const extent = map.getExtent();
      if (!extent) return;

      const minLon = clamp(extent.xmin, -180, 180);
      const maxLon = clamp(extent.xmax, -180, 180);
      const minLat = clamp(extent.ymin, -80, 84);
      const maxLat = clamp(extent.ymax, -80, 84);
      const zoom = map.getZoom();
      const mgrsGridBrightness = settingsStore.getState().map?.mgrsGridBrightness ?? 1;
      const mgrsGridOpacity = settingsStore.getState().map?.mgrsGridOpacity ?? 1;
      const opacity = (base: number) =>
        clamp(base * mgrsGridBrightness * mgrsGridOpacity, 0, 1);

      const geos: Array<maptalks.Geometry> = [];

      // 1) Base UTM-like zone grid: 6° x 8° with labels like 37S
      if (zoom >= 0) {
        const zoneLabelSize = interpolateByZoom(zoom, 0, 14, 14, 26);
        const zoneLineSymbol = {
          lineColor: "#ef4444",
          lineWidth: 1.2,
          lineOpacity: opacity(0.5),
        };
        const zoneLabelSymbol = {
          textSize: zoneLabelSize,
          textFill: "#ef4444",
          textOpacity: opacity(0.92),
          textHaloFill: "#ffffff",
          textHaloRadius: 1.5,
          textWeight: "bold",
        };
        const bands = getLatBands().filter((b) => b.end > minLat && b.start < maxLat);
        let zoneLabelCount = 0;
        for (const band of bands) {
          const bandMinLat = Math.max(minLat, band.start);
          const bandMaxLat = Math.min(maxLat, band.end);
          const zones = getZoneSegmentsForBand(band.letter).filter(
            (z) => z.endLon > minLon && z.startLon < maxLon
          );

          for (const z of zones) {
            const zMinLon = Math.max(minLon, z.startLon);
            const zMaxLon = Math.min(maxLon, z.endLon);

            // Draw cell borders; overlap is acceptable at this zoom level.
            geos.push(createLine([zMinLon, bandMinLat], [zMaxLon, bandMinLat], zoneLineSymbol));
            geos.push(createLine([zMinLon, bandMaxLat], [zMaxLon, bandMaxLat], zoneLineSymbol));
            geos.push(createLine([zMinLon, bandMinLat], [zMinLon, bandMaxLat], zoneLineSymbol));
            geos.push(createLine([zMaxLon, bandMinLat], [zMaxLon, bandMaxLat], zoneLineSymbol));

            const cLon = (z.startLon + z.endLon) / 2;
            const cLat = (band.start + band.end) / 2;
            if (cLon >= minLon && cLon <= maxLon && cLat >= minLat && cLat <= maxLat) {
              geos.push(createLabel(`${z.zone}${band.letter}`, [cLon, cLat], zoneLabelSymbol));
              zoneLabelCount += 1;
            }
            if (zoneLabelCount > 140) break;
          }
          if (zoneLabelCount > 140) break;
        }
      }

      // 2) 100km grid + labels (e.g. 37SDU)
      if (zoom >= 9 && zoom < 11.5) {
        const labelSize100km = interpolateByZoom(zoom, 9, 11.5, 15, 24);
        const lineOutlineSymbol = {
          lineColor: "#000000",
          lineWidth: 2.2,
          lineOpacity: opacity(0.35),
        };
        const lineSymbol = {
          lineColor: "#d97706",
          lineWidth: 1.2,
          lineOpacity: opacity(0.58),
        };
        const labelSymbol = {
          textSize: labelSize100km,
          textFill: "#d97706",
          textOpacity: opacity(0.95),
          textHaloFill: "#000000",
          textHaloRadius: 1.3,
        };
        const keySet = new Set<string>();
        const drawnEdges = new Set<string>();
        const lonSpan = maxLon - minLon;
        const latSpan = maxLat - minLat;
        const lonStep = Math.max(0.03, lonSpan / 120);
        const latStep = Math.max(0.03, latSpan / 120);
        const sampleKey = (lon: number, lat: number) => {
          const parsed = parseMgrsAt(lon, lat);
          if (!parsed) return;
          keySet.add(`${parsed.zoneBand}${parsed.square}`);
        };

        // Multi-pass interior sampling (phase-shifted) to catch narrow cells.
        const lonOffsets = [0, lonStep * 0.5];
        const latOffsets = [0, latStep * 0.5];
        for (const latOffset of latOffsets) {
          for (const lonOffset of lonOffsets) {
            for (let lat = minLat + latOffset; lat <= maxLat; lat += latStep) {
              for (let lon = minLon + lonOffset; lon <= maxLon; lon += lonStep) {
                sampleKey(lon, lat);
              }
            }
          }
        }

        // Border sampling to catch cells that only intersect view edges.
        const borderStep = Math.max(0.02, Math.min(lonStep, latStep));
        for (let lat = minLat; lat <= maxLat; lat += borderStep) {
          sampleKey(minLon, lat);
          sampleKey(maxLon, lat);
        }
        for (let lon = minLon; lon <= maxLon; lon += borderStep) {
          sampleKey(lon, minLat);
          sampleKey(lon, maxLat);
        }

        let labels = 0;
        for (const key of keySet) {
          const zoneBand = key.slice(0, key.length - 2);
          const square = key.slice(-2);

          const sw = mgrsPoint(zoneBand, square, 0, 0);
          const se = mgrsPoint(zoneBand, square, 99999, 0);
          const nw = mgrsPoint(zoneBand, square, 0, 99999);
          const ne = mgrsPoint(zoneBand, square, 99999, 99999);
          if (!sw || !se || !nw || !ne) continue;

          const corners: Array<[number, number]> = [sw, se, nw, ne];
          if (!intersectsExtent(corners, minLon, maxLon, minLat, maxLat)) continue;

          const edges = [
            // Draw only canonical edges to avoid double-tracing shared borders:
            // south + east are enough to represent the full tessellation.
            sampleCellEdge(zoneBand, square, "S"),
            sampleCellEdge(zoneBand, square, "E"),
          ];
          for (const edge of edges) {
            const clippedSegments = clipEdgeToZoneBand(edge, zoneBand);
            for (const segment of clippedSegments) {
              const fp = edgeFingerprint(segment);
              if (drawnEdges.has(fp)) continue;
              drawnEdges.add(fp);
              // Delay adding lines: we run an extra overlap suppression pass after collection.
              const candidate = toEdgeCandidate(segment);
              geos.push(lineFromPoints(candidate.points, { ...lineSymbol, lineOpacity: 0 }));
            }
          }

          const center =
            getZoneBandConstrainedCellCenter(zoneBand, square) ?? polygonCentroid([sw, se, ne, nw]);
          if (!center) continue;
          const cLon = center[0];
          const cLat = center[1];
          if (cLon < minLon || cLon > maxLon || cLat < minLat || cLat > maxLat) continue;

          geos.push(createLabel(`${zoneBand}${square}`, [cLon, cLat], labelSymbol));
          labels += 1;
          if (labels > 220) break;
        }

        // Replace provisional 100km line geometries with filtered canonical set.
        const provisional = geos.filter(
          (g) => g instanceof maptalks.LineString && ((g as any).getSymbol?.().lineOpacity === 0)
        ) as Array<maptalks.LineString>;
        if (provisional.length > 0) {
          for (const g of provisional) {
            g.remove();
          }
          const candidates = provisional
            .map((g) => g.getCoordinates() as Array<{ x: number; y: number }>)
            .map((coords) => coords.map((c) => [c.x, c.y] as [number, number]))
            .filter((pts) => pts.length >= 2)
            .map(toEdgeCandidate);
          const filtered = suppressOverlappingEdges(candidates);
          for (const edge of filtered) {
            geos.push(lineFromPoints(edge.points, lineOutlineSymbol));
            geos.push(lineFromPoints(edge.points, lineSymbol));
          }
        }
      }

      // 3) 10km grid + labels without zone prefix (e.g. DU 48)
      if (zoom >= 10.5 && zoom < 14.5) {
        const labelSize10km = interpolateByZoom(zoom, 10.5, 14.5, 16, 25);
        const lineOutlineSymbol = {
          lineColor: "#000000",
          lineWidth: 1.55,
          lineOpacity: opacity(0.26),
        };
        const lineSymbol = {
          lineColor: "#fee2e2",
          lineWidth: 1.1,
          lineOpacity: opacity(0.4),
        };
        const labelSymbol = {
          textSize: labelSize10km,
          textFill: "#ef4444",
          textOpacity: opacity(0.9),
          textHaloFill: "#000000",
          textHaloRadius: 0.7,
        };
        const keySet = collectMgrsSubCellKeys(minLon, maxLon, minLat, maxLat, 1);
        const drawnEdges = new Set<string>();
        const candidates: Array<EdgeCandidate> = [];
        let labels = 0;
        for (const key of keySet) {
          const [zoneBand, square, ePrefix, nPrefix] = key.split("|");
          if (!zoneBand || !square || !ePrefix || !nPrefix) continue;
          const eStart = parseInt(ePrefix.padEnd(5, "0"), 10);
          const nStart = parseInt(nPrefix.padEnd(5, "0"), 10);
          const eEnd = Math.min(99999, eStart + 9999);
          const nEnd = Math.min(99999, nStart + 9999);

          const sw = mgrsPoint(zoneBand, square, eStart, nStart);
          const se = mgrsPoint(zoneBand, square, eEnd, nStart);
          const nw = mgrsPoint(zoneBand, square, eStart, nEnd);
          const ne = mgrsPoint(zoneBand, square, eEnd, nEnd);
          if (!sw || !se || !nw || !ne) continue;

          const corners: Array<[number, number]> = [sw, se, nw, ne];
          if (!intersectsExtent(corners, minLon, maxLon, minLat, maxLat)) continue;

          const edges = [
            sampleSubCellEdge(zoneBand, square, eStart, eEnd, nStart, nEnd, "S", 14),
            sampleSubCellEdge(zoneBand, square, eStart, eEnd, nStart, nEnd, "E", 14),
          ];
          for (const edge of edges) {
            const clippedSegments = clipEdgeToZoneBand(edge, zoneBand);
            for (const segment of clippedSegments) {
              const fp = edgeFingerprint(segment);
              if (drawnEdges.has(fp)) continue;
              drawnEdges.add(fp);
              candidates.push(toEdgeCandidate(segment));
            }
          }

          const center =
            getZoneBandConstrainedSubCellCenter(zoneBand, square, eStart, eEnd, nStart, nEnd) ??
            polygonCentroid([sw, se, ne, nw]);
          if (!center) continue;
          const cLon = center[0];
          const cLat = center[1];
          if (cLon < minLon || cLon > maxLon || cLat < minLat || cLat > maxLat) continue;

          geos.push(createLabel(`${square} ${ePrefix}${nPrefix}`, [cLon, cLat], labelSymbol));
          labels += 1;
          if (labels > 300) break;
        }
        const filtered = suppressOverlappingEdges(candidates);
        for (const edge of filtered) {
          geos.push(lineFromPoints(edge.points, lineOutlineSymbol));
          geos.push(lineFromPoints(edge.points, lineSymbol));
        }
      }

      // 4) 1km grid + labels without zone prefix (e.g. DU 4823)
      if (zoom >= 14) {
        const labelSize1km = interpolateByZoom(zoom, 14, 16, 17, 28);
        const lineOutlineSymbol = {
          lineColor: "#000000",
          lineWidth: 1.24,
          lineOpacity: opacity(0.2),
        };
        const lineSymbol = {
          lineColor: "#fca5a5",
          lineWidth: 1,
          lineOpacity: opacity(0.22),
        };
        const labelSymbol = {
          textSize: labelSize1km,
          textFill: "#f87171",
          textOpacity: opacity(0.62),
          textHaloFill: "#000000",
          textHaloRadius: 0.45,
        };
        const keySet = collectMgrsSubCellKeys(minLon, maxLon, minLat, maxLat, 2);
        // Guardrails: avoid very dense 1km rendering on wide extents.
        if (keySet.size <= 2400) {
          const drawnEdges = new Set<string>();
          let labels = 0;
          for (const key of keySet) {
            const [zoneBand, square, ePrefix, nPrefix] = key.split("|");
            if (!zoneBand || !square || !ePrefix || !nPrefix) continue;
            const eStart = parseInt(ePrefix.padEnd(5, "0"), 10);
            const nStart = parseInt(nPrefix.padEnd(5, "0"), 10);
            const eEnd = Math.min(99999, eStart + 999);
            const nEnd = Math.min(99999, nStart + 999);

            const sw = mgrsPoint(zoneBand, square, eStart, nStart);
            const se = mgrsPoint(zoneBand, square, eEnd, nStart);
            const nw = mgrsPoint(zoneBand, square, eStart, nEnd);
            const ne = mgrsPoint(zoneBand, square, eEnd, nEnd);
            if (!sw || !se || !nw || !ne) continue;

            const corners: Array<[number, number]> = [sw, se, nw, ne];
            if (!intersectsExtent(corners, minLon, maxLon, minLat, maxLat)) continue;

            const edges = [
              sampleSubCellEdge(zoneBand, square, eStart, eEnd, nStart, nEnd, "S", 8),
              sampleSubCellEdge(zoneBand, square, eStart, eEnd, nStart, nEnd, "N", 8),
              sampleSubCellEdge(zoneBand, square, eStart, eEnd, nStart, nEnd, "W", 8),
              sampleSubCellEdge(zoneBand, square, eStart, eEnd, nStart, nEnd, "E", 8),
            ];
            for (const edge of edges) {
              const clippedSegments = clipEdgeToZoneBand(edge, zoneBand);
              for (const segment of clippedSegments) {
                const fp = edgeFingerprint(segment);
                if (drawnEdges.has(fp)) continue;
                drawnEdges.add(fp);
                geos.push(lineFromPoints(segment, lineOutlineSymbol));
                geos.push(lineFromPoints(segment, lineSymbol));
              }
            }

            const center = getExactSubCellCenter(zoneBand, square, ePrefix, nPrefix);
            if (!center) continue;
            const cLon = center[0];
            const cLat = center[1];
            if (cLon < minLon || cLon > maxLon || cLat < minLat || cLat > maxLat) continue;

            geos.push(createLabel(`${square} ${ePrefix}${nPrefix}`, [cLon, cLat], labelSymbol));
            labels += 1;
            if (labels > 360) break;
          }
        }
      }

      layer.clear();
      if (geos.length > 0) {
        layer.addGeometry(geos);
      }
    };

    const scheduleZoomingRender = () => {
      // Debounce heavy MGRS recompute while mouse wheel emits many zoom steps.
      if (zoomingRenderTimer) {
        clearTimeout(zoomingRenderTimer);
      }
      zoomingRenderTimer = setTimeout(() => {
        zoomingRenderTimer = null;
        renderGrid();
      }, 140);
    };

    const handleZoomEnd = () => {
      if (zoomingRenderTimer) {
        clearTimeout(zoomingRenderTimer);
        zoomingRenderTimer = null;
      }
      renderGrid();
    };

    renderGrid();
    map.on("moveend", renderGrid);
    map.on("zoomend", handleZoomEnd);
    map.on("zooming", scheduleZoomingRender);
    const unsubscribeSettings = settingsStore.subscribe(
      () => {
        renderGrid();
      },
      (state) =>
        `${state.map?.mgrsGridBrightness ?? 1}|${state.map?.mgrsGridOpacity ?? 1}`
    );

    return () => {
      if (zoomingRenderTimer) {
        clearTimeout(zoomingRenderTimer);
        zoomingRenderTimer = null;
      }
      unsubscribeSettings();
      map.off("moveend", renderGrid);
      map.off("zoomend", handleZoomEnd);
      map.off("zooming", scheduleZoomingRender);
      layer.clear();
    };
  }, [map]);
}
