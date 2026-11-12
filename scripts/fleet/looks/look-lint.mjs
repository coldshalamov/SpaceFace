// LOOK-04: the two numbers the look bench reports per frame. Pure functions over decoded RGBA
// (pngjs shape: { width, height, data }) so the maths is testable with synthetic images.
//
//   blownStats      fraction of the frame above display luma 240, plus the biggest connected
//                   region. Emissives cannot be known from pixels, so this is an upper bound on
//                   "blown non-emissive area": read the regions and decide what is a lamp.
//   ringContrast    mean luma just INSIDE a body's silhouette vs just OUTSIDE it.
//   summarizeBodies median contrast and the worst (lowest) bodies.
//
// Luma is Rec.709 on DISPLAY values (what look-03-pixels.mjs uses), not scene-linear radiance.
import { PNG } from 'pngjs';
import { brightRegions } from './look-03-pixels.mjs';

export const BLOWN_LUMA = 240;

export function lumaAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return img.data[i] * 0.2126 + img.data[i + 1] * 0.7152 + img.data[i + 2] * 0.0722;
}

/** Fraction of pixels above `threshold` luma. */
export function blownFraction(img, threshold = BLOWN_LUMA) {
  let n = 0;
  const total = img.width * img.height;
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (img.data[p] * 0.2126 + img.data[p + 1] * 0.7152 + img.data[p + 2] * 0.0722 > threshold) n++;
  }
  return total ? n / total : 0;
}

/**
 * @param {Buffer} pngBytes
 * @returns {{ blownArea:number, largestRegion:number, largestRegionBounds:object|null, regions:object[] }}
 */
export function blownStats(pngBytes, { minRegionPixels = 1 } = {}) {
  const img = PNG.sync.read(pngBytes);
  const total = img.width * img.height;
  const regions = brightRegions(pngBytes, minRegionPixels);
  const top = regions[0] || null;
  return {
    blownArea: blownFraction(img),
    largestRegion: top ? top.pixels / total : 0,
    largestRegionBounds: top ? top.bounds : null,
    regions: regions.slice(0, 5).map((r) => ({ pixels: r.pixels, fraction: r.pixels / total, meanLuma: r.meanLuma, bounds: r.bounds })),
  };
}

/**
 * Mean luma in an inner annulus (just inside the silhouette) and an outer annulus (just outside),
 * for an elliptical silhouette centred at (cx, cy) with semi-axes (rx, ry) in pixels.
 * Normalised distance d = sqrt((dx/rx)^2 + (dy/ry)^2): inner band [innerLo, innerHi], outer [outerLo, outerHi].
 * Returns null when either ring has too few on-screen pixels to mean anything.
 */
export function ringContrast(img, cx, cy, rx, ry, opts = {}) {
  const { innerLo = 0.7, innerHi = 0.95, outerLo = 1.08, outerHi = 1.35, minPixels = 24, minCoverage = 0.4 } = opts;
  if (!(rx > 1) || !(ry > 1)) return null;
  const x0 = Math.max(0, Math.floor(cx - rx * outerHi)), x1 = Math.min(img.width - 1, Math.ceil(cx + rx * outerHi));
  const y0 = Math.max(0, Math.floor(cy - ry * outerHi)), y1 = Math.min(img.height - 1, Math.ceil(cy + ry * outerHi));
  let inSum = 0, inN = 0, outSum = 0, outN = 0;
  for (let y = y0; y <= y1; y++) {
    const ey = (y + 0.5 - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const ex = (x + 0.5 - cx) / rx;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d >= innerLo && d <= innerHi) { inSum += lumaAt(img, x, y); inN++; }
      else if (d >= outerLo && d <= outerHi) { outSum += lumaAt(img, x, y); outN++; }
    }
  }
  // Full annulus area in pixels, to know how much of each ring is on screen.
  const fullIn = Math.PI * rx * ry * (innerHi * innerHi - innerLo * innerLo);
  const fullOut = Math.PI * rx * ry * (outerHi * outerHi - outerLo * outerLo);
  if (inN < minPixels || outN < minPixels || inN < fullIn * minCoverage || outN < fullOut * minCoverage) return null;
  const inside = inSum / inN, outside = outSum / outN;
  return {
    inside, outside,
    contrast: Math.abs(inside - outside),                                  // 0..255 luma difference
    michelson: Math.abs(inside - outside) / (inside + outside || 1),       // 0..1, scale-free
    signed: inside - outside,                                              // + = body brighter than surroundings
  };
}

/** Median + worst-N by Michelson contrast. `bodies` rows carry { id, type, michelson, contrast, ... }. */
export function summarizeBodies(bodies, worstN = 3) {
  const rows = bodies.filter((b) => b && Number.isFinite(b.michelson));
  if (!rows.length) return { count: 0, median: null, medianMichelson: null, worst: [] };
  const sorted = [...rows].sort((a, b) => a.michelson - b.michelson);
  const mid = (key) => {
    const v = rows.map((r) => r[key]).sort((a, b) => a - b);
    const h = v.length >> 1;
    return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
  };
  return { count: rows.length, median: mid('contrast'), medianMichelson: mid('michelson'), worst: sorted.slice(0, worstN) };
}

/** bodies: [{ id, type, defId, cx, cy, rx, ry }] in frame pixels. */
export function lintFrame(pngBytes, bodies) {
  const img = PNG.sync.read(pngBytes);
  const rows = [];
  for (const b of bodies || []) {
    const c = ringContrast(img, b.cx, b.cy, b.rx, b.ry);
    if (c) rows.push({ id: b.id, type: b.type, defId: b.defId, cx: Math.round(b.cx), cy: Math.round(b.cy), rx: +b.rx.toFixed(1), ry: +b.ry.toFixed(1), ...c });
  }
  const blown = blownStats(pngBytes);
  return { ...blown, bodyContrast: summarizeBodies(rows), bodiesMeasured: rows.length, bodiesOnScreen: (bodies || []).length };
}
