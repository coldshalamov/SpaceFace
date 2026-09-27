// src/ui/orrery/chartInstruments.js — the Chart's instruments (design/frontend/ORRERY.md §6 Chart).
//
// The chart is a canvas, so most of its light is drawn here with the 2D context rather than SVG.
// The grammar is the library's (tokens.js WEIGHT): a structure is a BAND of light under a crisp
// EDGE, a value is a LIT core over a bloom with a BEAD at its end, the Hand is the one warm light,
// ice moves only when data moves. Every helper takes CSS pixels (the chart's context is already
// scaled by devicePixelRatio) and restores the context it borrowed.
//
// Also here: the sector TOKENS (produced art per sector at assets/ui/generated/chart/<sector id>.webp,
// loaded once, pre-scaled per size so a 256 px source is never squeezed straight to 60 px), and the
// three DOM instruments of the chart's chrome: the zoom lever, the ruled tab scale and the reading
// laid beside the pointer while a course is laid.

import { svg } from './svg.js';
import { createSpring } from './motion.js';

const BONE = '236,230,216';
const LIT = '248,244,234';
const HAND = '242,185,80';
const HAND_HOT = '255,217,140';
const ICE = '143,203,255';
const PHOS = '223,238,255';
const DANGER = '255,80,56';

export const CHART_INK = Object.freeze({
  bone: (a = 1) => `rgba(${BONE},${a})`,
  lit: (a = 1) => `rgba(${LIT},${a})`,
  hand: (a = 1) => `rgba(${HAND},${a})`,
  handHot: (a = 1) => `rgba(${HAND_HOT},${a})`,
  ice: (a = 1) => `rgba(${ICE},${a})`,
  phos: (a = 1) => `rgba(${PHOS},${a})`,
  danger: (a = 1) => `rgba(${DANGER},${a})`,
  glass: (a = 0.86) => `rgba(5,7,10,${a})`,
});

/** Chart type on canvas: Archivo for labels and names (the library's label voice), never below 12 px. */
export function chartFont(weight, px, { stretch = 'semi-expanded' } = {}) {
  const size = Math.max(12, Number.isFinite(px) ? px : 12);
  return `${weight} ${stretch} ${size}px "Archivo", "Instrument Sans", system-ui, sans-serif`;
}

/** Letter-spacing on a canvas that supports it (Chrome 99+); a no-op elsewhere. */
export function setTracking(g, em, px) {
  if (!g || !('letterSpacing' in g)) return;
  try { g.letterSpacing = `${(Number(em) || 0) * (Number(px) || 12)}px`; } catch (_) { /* unsupported */ }
}

function rgbaOf(rgb, a) { return `rgba(${rgb},${a})`; }

/**
 * A structure drawn as light with body: an optional soft halo, a BAND (wide, low alpha — the body the
 * owner asked for; measured at >= 2:1 on the glass at .27), and a crisp EDGE on top.
 * `trace(g)` must describe the path (beginPath is done here).
 */
export function drawBand(g, trace, {
  rgb = BONE, band = 7, bandA = 0.27, edge = 1.5, edgeA = 0.62, halo = 0, haloA = 0.06, dash = null,
} = {}) {
  if (!g || typeof trace !== 'function') return;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (halo > 0) {
    g.strokeStyle = rgbaOf(rgb, haloA);
    g.lineWidth = halo;
    g.beginPath(); trace(g); g.stroke();
  }
  if (band > 0 && bandA > 0) {
    g.strokeStyle = rgbaOf(rgb, bandA);
    g.lineWidth = band;
    g.beginPath(); trace(g); g.stroke();
  }
  if (edge > 0 && edgeA > 0) {
    if (dash) g.setLineDash(dash);
    g.strokeStyle = rgbaOf(rgb, edgeA);
    g.lineWidth = edge;
    g.beginPath(); trace(g); g.stroke();
    if (dash) g.setLineDash([]);
  }
  g.restore();
}

/** A ring drawn as a band (range rings, zone rims, selection). */
export function drawBandRing(g, x, y, r, opts = {}) {
  if (!(r > 0)) return;
  drawBand(g, (c) => c.arc(x, y, r, opts.from || 0, opts.to == null ? Math.PI * 2 : opts.to), opts);
}

/** A bead: a filled disc with a bloom disc under it. */
export function drawBead(g, x, y, r = 3.5, { rgb = LIT, a = 1, bloom = 2.6, bloomA = 0.26 } = {}) {
  if (!g || !Number.isFinite(x) || !Number.isFinite(y)) return;
  g.save();
  if (bloom > 0 && bloomA > 0) {
    g.fillStyle = rgbaOf(rgb === LIT ? '255,240,214' : rgb, bloomA);
    g.beginPath(); g.arc(x, y, r * bloom, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = rgbaOf(rgb, a);
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** Polyline geometry: cumulative lengths, and the point at a distance along it. */
export function polylineMeasure(pts) {
  const lens = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(total);
  }
  return { lens, total };
}

export function pointAlong(pts, measure, dist) {
  const { lens, total } = measure;
  if (!pts.length) return null;
  if (!(total > 0)) return { x: pts[0].x, y: pts[0].y, i: 0, angle: 0 };
  const d = Math.max(0, Math.min(total, dist));
  let i = 1;
  while (i < lens.length - 1 && lens[i] < d) i += 1;
  const seg = lens[i] - lens[i - 1] || 1;
  const t = (d - lens[i - 1]) / seg;
  const a = pts[i - 1];
  const b = pts[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, i, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function tracePartial(g, pts, measure, upto) {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) {
    if (measure.lens[i] <= upto) { g.lineTo(pts[i].x, pts[i].y); continue; }
    const p = pointAlong(pts, measure, upto);
    if (p) g.lineTo(p.x, p.y);
    break;
  }
}

/**
 * THE HAND as a beam: the chosen course, the one warm light on the chart. A wide bloom, a body, a
 * hot core, a bead at its head; `progress` draws it in (0..1); `pulseT` (seconds) runs a bright
 * packet along it — omitted under reduced motion. `alpha` < 1 is the preview (laid, not committed).
 */
/** A polyline cut back from every vertex by `trim` px (so a beam stops at each disc's rim). */
export function trimPolylineSegments(pts, trim) {
  const segs = [];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(L > trim * 2 + 2)) continue;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    segs.push([{ x: a.x + ux * trim, y: a.y + uy * trim }, { x: b.x - ux * trim, y: b.y - uy * trim }]);
  }
  return segs;
}

export function drawHandBeam(g, pts, {
  progress = 1, pulseT = null, alpha = 1, head = true, headR = 4.2, width = 1, tone = 'hand', lock = 0,
} = {}) {
  const BODY = tone === 'bone' ? BONE : HAND;
  const HOT = tone === 'bone' ? LIT : HAND_HOT;
  if (!g || !Array.isArray(pts) || pts.length < 2) return null;
  const measure = polylineMeasure(pts);
  if (!(measure.total > 0.5)) return null;
  const upto = measure.total * Math.max(0, Math.min(1, progress));
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const pass = (rgb, a, w) => {
    g.strokeStyle = rgbaOf(rgb, a * alpha);
    g.lineWidth = w * width;
    g.beginPath(); tracePartial(g, pts, measure, upto); g.stroke();
  };
  // `lock` (0..1) is the moment a laid line becomes the course: the core swells and burns hot.
  const k = Math.max(0, Math.min(1, lock));
  pass(BODY, 0.13 + 0.12 * k, 16 + 10 * k);
  pass(BODY, 0.30 + 0.2 * k, 7 + 3 * k);
  pass(BODY, 0.95, 3 + 1.5 * k);
  pass(HOT, 0.85 + 0.15 * k, 1.2 + 1.2 * k);
  // The packet: a short bright run with its bead, travelling from the ship to the head.
  if (pulseT != null && upto > 40) {
    const speed = 150;
    const len = 38;
    const at = (pulseT * speed) % (upto + len);
    const from = Math.max(0, at - len);
    const to = Math.min(upto, at);
    if (to > from) {
      const a0 = pointAlong(pts, measure, from);
      const a1 = pointAlong(pts, measure, to);
      const grad = g.createLinearGradient ? g.createLinearGradient(a0.x, a0.y, a1.x, a1.y) : null;
      if (grad) {
        grad.addColorStop(0, rgbaOf(HOT, 0));
        grad.addColorStop(1, rgbaOf(HOT, 0.95 * alpha));
      }
      g.strokeStyle = grad || rgbaOf(HOT, 0.9 * alpha);
      g.lineWidth = 4.5 * width;
      g.beginPath();
      g.moveTo(a0.x, a0.y);
      // follow the corners inside the packet
      for (let i = a0.i; i < a1.i; i += 1) g.lineTo(pts[i].x, pts[i].y);
      g.lineTo(a1.x, a1.y);
      g.stroke();
      if (to < upto - 2) drawBead(g, a1.x, a1.y, 2.6, { rgb: HOT, a: alpha, bloom: 2.8, bloomA: 0.35 * alpha });
    }
  }
  g.restore();
  const end = pointAlong(pts, measure, upto);
  if (head && end) {
    drawBead(g, end.x, end.y, headR, { rgb: HOT, a: alpha, bloom: 2.6, bloomA: 0.34 * alpha });
  }
  return end;
}

/** One ice packet running a whole path (the course locking in): `u` 0..1 along it. */
export function drawPathPulse(g, pts, u, { len = 70, a = 1 } = {}) {
  if (!g || !Array.isArray(pts) || pts.length < 2) return;
  const measure = polylineMeasure(pts);
  if (!(measure.total > 1)) return;
  const head = measure.total * Math.max(0, Math.min(1, u));
  const tail = Math.max(0, head - len);
  const a0 = pointAlong(pts, measure, tail);
  const a1 = pointAlong(pts, measure, head);
  if (!a0 || !a1) return;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const grad = g.createLinearGradient ? g.createLinearGradient(a0.x, a0.y, a1.x, a1.y) : null;
  if (grad) { grad.addColorStop(0, rgbaOf(ICE, 0)); grad.addColorStop(1, rgbaOf('236,246,255', a)); }
  g.strokeStyle = grad || rgbaOf(ICE, 0.8 * a);
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(a0.x, a0.y);
  for (let i = a0.i; i < a1.i; i += 1) g.lineTo(pts[i].x, pts[i].y);
  g.lineTo(a1.x, a1.y);
  g.stroke();
  g.restore();
  drawBead(g, a1.x, a1.y, 3.4, { rgb: '236,246,255', a, bloom: 3.2, bloomA: 0.4 * a });
}

/**
 * Traffic on a lane: an ice comet (data in motion) running from a to b at phase u (0..1).
 * Its tail fades to nothing; its head is a small bright point.
 */
export function drawLaneComet(g, ax, ay, bx, by, u, { len = 46, a = 0.9, trim = 0 } = {}) {
  const L = Math.hypot(bx - ax, by - ay);
  if (!(L > trim * 2 + 8)) return;
  const usable = L - trim * 2;
  const dx = (bx - ax) / L;
  const dy = (by - ay) / L;
  const headD = trim + usable * Math.max(0, Math.min(1, u));
  const tailD = Math.max(trim, headD - len);
  const hx = ax + dx * headD;
  const hy = ay + dy * headD;
  const tx = ax + dx * tailD;
  const ty = ay + dy * tailD;
  // fade in near the start, out near the end, so a packet never pops
  const env = Math.min(1, Math.min(u, 1 - u) / 0.12);
  g.save();
  g.lineCap = 'round';
  const grad = g.createLinearGradient ? g.createLinearGradient(tx, ty, hx, hy) : null;
  if (grad) {
    grad.addColorStop(0, rgbaOf(ICE, 0));
    grad.addColorStop(1, rgbaOf(ICE, a * env));
  }
  g.strokeStyle = grad || rgbaOf(ICE, 0.6 * a * env);
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
  g.fillStyle = rgbaOf(ICE, 0.22 * env * a);
  g.beginPath(); g.arc(hx, hy, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = rgbaOf('236,246,255', a * env);
  g.beginPath(); g.arc(hx, hy, 1.9, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** A label's leader: out of the mark on its diagonal, an elbow, then flat into the words. */
export function drawLabelLeader(g, leader, { a = 1 } = {}) {
  if (!leader) return;
  drawBand(g, (c) => { c.moveTo(leader.sx, leader.sy); c.lineTo(leader.ex, leader.ey); c.lineTo(leader.lx, leader.ly); },
    { band: 5, bandA: 0.2 * a, edge: 1.5, edgeA: 0.72 * a });
  drawBead(g, leader.sx, leader.sy, 1.8, { a, bloom: 2, bloomA: 0.24 * a });
}

/** An unknown sector: a faint star glint, never a question mark. */
export function drawGlint(g, x, y, { size = 6, a = 0.42, rgb = BONE } = {}) {
  drawBandRing(g, x, y, size + 4, { band: 4, bandA: 0.1 * a / 0.42, edge: 1, edgeA: 0.3 * a / 0.42 });
  g.save();
  g.strokeStyle = rgbaOf(rgb, a * 0.7);
  g.lineWidth = 1;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - size, y); g.lineTo(x + size, y);
  g.moveTo(x, y - size); g.lineTo(x, y + size);
  g.stroke();
  g.fillStyle = rgbaOf(rgb, a * 0.18);
  g.beginPath(); g.arc(x, y, size * 0.75, 0, Math.PI * 2); g.fill();
  g.fillStyle = rgbaOf(rgb, Math.min(1, a * 1.6));
  g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill();
  g.restore();
}

/**
 * The sensor lattice (ORRERY §4 #14): a field of faint points behind the chart that brightens in a
 * soft lens under the pointer. Cheap: one fillRect per point, points on a fixed screen pitch.
 */
export function drawSensorLattice(g, w, h, { pointer = null, pitch = 30, a = 0.07, lensR = 190, lensA = 0.34, clip = null } = {}) {
  g.save();
  if (clip) {
    g.beginPath();
    g.rect(clip.x, clip.y, clip.width, clip.height);
    g.clip();
  }
  const px = pointer && Number.isFinite(pointer.x) ? pointer.x : -1e9;
  const py = pointer && Number.isFinite(pointer.y) ? pointer.y : -1e9;
  const r2 = lensR * lensR;
  const x0 = (w % pitch) / 2;
  const y0 = (h % pitch) / 2;
  g.fillStyle = rgbaOf(BONE, a);
  const near = [];
  for (let y = y0; y < h; y += pitch) {
    for (let x = x0; x < w; x += pitch) {
      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) { near.push(x, y, 1 - Math.sqrt(d2) / lensR); continue; }
      g.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
  }
  for (let i = 0; i < near.length; i += 3) {
    const k = near[i + 2];
    g.fillStyle = rgbaOf(BONE, a + (lensA - a) * k * k);
    const s = 1.5 + k * 1.2;
    g.fillRect(near[i] - s / 2, near[i + 1] - s / 2, s, s);
  }
  g.restore();
}

/** A lens halo under the token the pointer rests on: a soft lit ring, the token lifted. */
export function drawLensHalo(g, x, y, r, { a = 1 } = {}) {
  g.save();
  const grad = g.createRadialGradient ? g.createRadialGradient(x, y, r * 0.55, x, y, r * 1.35) : null;
  if (grad) {
    grad.addColorStop(0, rgbaOf('255,240,214', 0));
    grad.addColorStop(0.55, rgbaOf('255,240,214', 0.10 * a));
    grad.addColorStop(1, rgbaOf('255,240,214', 0));
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r * 1.35, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  drawBandRing(g, x, y, r + 3, { band: 6, bandA: 0.2 * a, edge: 1.5, edgeA: 0.7 * a });
}

// ─── Sector tokens ─────────────────────────────────────────────────────────────────────────────

const TOKEN_ROOT = (() => {
  try { return new URL('../../../assets/ui/generated/chart/', import.meta.url).href; } catch (_) { return ''; }
})();

/** The produced token for a sector: its file name IS the sector id. */
export function sectorTokenUrl(sectorId) {
  const id = String(sectorId || '').trim();
  return id && TOKEN_ROOT ? `${TOKEN_ROOT}${id}.webp` : '';
}

const tokens = new Map();

/** Forget tokens that were missing, so a render that landed since the last open is picked up. */
export function retrySectorTokens() {
  for (const [id, t] of tokens) if (t.state === 'missing') tokens.delete(id);
}

function tokenRecord(sectorId, onReady, url = sectorTokenUrl(sectorId)) {
  let t = tokens.get(sectorId);
  if (!t) {
    t = { state: 'loading', img: null, sizes: new Map(), waiters: new Set() };
    tokens.set(sectorId, t);
    if (typeof Image !== 'function' || !url) {
      t.state = 'missing';
    } else {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        t.state = img.naturalWidth > 0 ? 'ready' : 'missing';
        t.img = img;
        for (const w of t.waiters) { try { w(); } catch (_) { /* a waiter is a repaint request */ } }
        t.waiters.clear();
      };
      img.onerror = () => { t.state = 'missing'; t.waiters.clear(); };
      img.src = url;
    }
  }
  if (t.state === 'loading' && typeof onReady === 'function') t.waiters.add(onReady);
  return t;
}

function stepDown(img, size) {
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== 'function') return null;
  let src = img;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  // Halve until one more halving would pass the target: each pass averages 2x2, so detail survives.
  while (w / 2 >= size && h / 2 >= size) {
    const c = doc.createElement('canvas');
    c.width = Math.max(1, Math.round(w / 2));
    c.height = Math.max(1, Math.round(h / 2));
    const cx = c.getContext('2d');
    if (!cx) return null;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, c.width, c.height);
    src = c; w = c.width; h = c.height;
  }
  const out = doc.createElement('canvas');
  out.width = size;
  out.height = size;
  const ox = out.getContext('2d');
  if (!ox) return null;
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(src, 0, 0, size, size);
  return out;
}

/** The token as a canvas at `devicePx` (pre-scaled, cached per size), or null while it has none. */
export function sectorTokenCanvas(sectorId, devicePx, onReady) {
  if (!sectorId) return null;
  return artCanvas(sectorId, devicePx, onReady, sectorTokenUrl(sectorId));
}

function artCanvas(artKey, devicePx, onReady, url) {
  const t = tokenRecord(artKey, onReady, url);
  if (t.state !== 'ready' || !t.img) return null;
  const px = Math.max(8, Math.round(devicePx));
  let c = t.sizes.get(px);
  if (!c) {
    c = stepDown(t.img, px);
    if (!c) return null;
    t.sizes.set(px, c);
  }
  return c;
}

const CREST_ROOT = (() => {
  try { return new URL('../../../assets/ui/generated/crests/', import.meta.url).href; } catch (_) { return ''; }
})();

/** The URL of a faction's cut crest (assets/ui/generated/crests/faction_<id>.webp). */
export function factionCrestUrl(factionId) {
  const id = String(factionId || '').replace(/^faction[_-]/, '');
  return id && CREST_ROOT ? `${CREST_ROOT}faction_${id}.webp` : '';
}

/** A faction's cut crest (the produced art in assets/ui/generated/crests/), as a canvas, or null. */
export function factionCrestCanvas(factionId, devicePx, onReady) {
  const id = String(factionId || '').replace(/^faction[_-]/, '');
  if (!id || !CREST_ROOT) return null;
  return artCanvas(`crest:${id}`, devicePx, onReady, `${CREST_ROOT}faction_${id}.webp`);
}

/**
 * A faction's crest worn on a token's shoulder: the bone mark in a small well of glass with a lit
 * rim — who holds the sector, said with the faction's own emblem instead of a coloured ring.
 */
export function drawFactionCrest(g, factionId, x, y, size = 22, { dpr = 1, onReady = null } = {}) {
  const r = size / 2 + 3;
  g.save();
  g.fillStyle = 'rgba(5,7,10,0.9)';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
  drawBandRing(g, x, y, r, { band: 4, bandA: 0.22, edge: 1.3, edgeA: 0.7 });
  const art = factionCrestCanvas(factionId, size * dpr, onReady);
  if (art) {
    g.drawImage(art, x - size / 2, y - size / 2, size, size);
    return true;
  }
  drawBead(g, x, y, 2.6, { bloom: 2 });
  return false;
}

function hash01(text) {
  let h = 2166136261;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * The fallback token — the chart's old sector sigil re-weighted in bone until the sector's render
 * lands: a lit dish, an inclined orbit drawn as a band with its berths as beads, a star at its heart.
 */
export function drawFallbackToken(g, x, y, size, { seedId = 'sector', berths = 0, stale = false } = {}) {
  const r = size / 2;
  const dim = stale ? 0.55 : 1;
  g.save();
  // the dish: glass with a lit rim band
  const dish = g.createRadialGradient ? g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r * 0.95) : null;
  if (dish) {
    dish.addColorStop(0, 'rgba(26,30,38,0.96)');
    dish.addColorStop(1, 'rgba(8,10,14,0.94)');
  }
  g.fillStyle = dish || 'rgba(10,12,16,0.94)';
  g.beginPath(); g.arc(x, y, r * 0.92, 0, Math.PI * 2); g.fill();
  g.restore();
  drawBandRing(g, x, y, r * 0.92, { band: Math.max(3, size * 0.07), bandA: 0.16 * dim, edge: 1.4, edgeA: 0.5 * dim });
  const incl = -0.28 - hash01(seedId + ':incl') * 0.6;
  const squash = 0.3 + hash01(seedId + ':squash') * 0.22;
  const orbR = r * 0.66;
  const ell = (c) => c.ellipse(0, 0, orbR, orbR * squash, 0, 0, Math.PI * 2);
  g.save();
  g.translate(x, y);
  g.rotate(incl);
  drawBand(g, ell, { band: Math.max(3, size * 0.06), bandA: 0.3 * dim, edge: 1.6, edgeA: 0.85 * dim });
  const beads = Math.max(0, Math.min(4, Math.round(Number(berths) || 0)));
  for (let i = 0; i < beads; i += 1) {
    const a = hash01(seedId + ':berth' + i) * Math.PI * 2;
    drawBead(g, Math.cos(a) * orbR, Math.sin(a) * orbR * squash, Math.max(2, size * 0.035), { a: dim, bloom: 2.2, bloomA: 0.3 * dim });
  }
  g.restore();
  // the primary star
  const star = g.createRadialGradient ? g.createRadialGradient(x, y, 0, x, y, r * 0.42) : null;
  if (star) {
    star.addColorStop(0, `rgba(255,246,228,${0.95 * dim})`);
    star.addColorStop(0.28, `rgba(255,236,200,${0.5 * dim})`);
    star.addColorStop(1, 'rgba(255,236,200,0)');
    g.save();
    g.fillStyle = star;
    g.beginPath(); g.arc(x, y, r * 0.42, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  drawBead(g, x, y, Math.max(2.4, size * 0.05), { a: dim, bloom: 1.8, bloomA: 0.4 * dim });
}

/**
 * Draw a sector token: the produced render when it has landed, else the bone fallback. `lift`
 * (0..1) is the lens under the pointer: the token grows a little and a halo rises under it.
 * Returns the drawn radius, so marks around it can sit on its rim.
 */
export function drawSectorToken(g, sectorId, x, y, size, {
  dpr = 1, lift = 0, stale = false, berths = 0, onReady = null, a = 1,
} = {}) {
  const s = size * (1 + 0.1 * Math.max(0, Math.min(1, lift)));
  if (lift > 0.01) drawLensHalo(g, x, y, s / 2, { a: lift });
  // The produced render fills the token's disc a little past its rim (the art carries its own
  // transparent margin), standing in a well of glass so the lanes stop at the token instead of
  // running through its empty corners, inside one ring of light with body.
  const artSize = s * 1.02;
  const art = sectorTokenCanvas(sectorId, artSize * dpr, onReady);
  if (art) {
    const r = s / 2;
    g.save();
    const well = g.createRadialGradient ? g.createRadialGradient(x, y, r * 0.2, x, y, r * 1.02) : null;
    if (well) {
      well.addColorStop(0, 'rgba(5,7,10,0.94)');
      well.addColorStop(0.82, 'rgba(5,7,10,0.9)');
      well.addColorStop(1, 'rgba(5,7,10,0)');
    }
    g.fillStyle = well || 'rgba(5,7,10,0.9)';
    g.beginPath(); g.arc(x, y, r * 1.02, 0, Math.PI * 2); g.fill();
    g.restore();
    drawBandRing(g, x, y, r, { band: 6, bandA: (stale ? 0.2 : 0.36) * a, edge: 1.6, edgeA: (stale ? 0.36 : 0.62) * a });
    g.save();
    g.globalAlpha = (stale ? 0.6 : 1) * a;
    g.drawImage(art, x - artSize / 2, y - artSize / 2, artSize, artSize);
    g.restore();
  } else {
    g.save();
    g.globalAlpha = a;
    drawFallbackToken(g, x, y, s, { seedId: sectorId, berths, stale });
    g.restore();
  }
  return s / 2;
}

/**
 * The reading that rides a laid line: a name, then the figures, as bone and phosphor light over a
 * knocked-out halo — no plate. Anchored beside (x, y), flipped to stay inside `bounds`.
 */
/**
 * The reading that rides a laid line, as an instrument: the destination's name in the label voice,
 * then its figures as large thin numerals each with a small unit (`numerals`: [{ value, unit }]),
 * then a quiet line of secondary figures and a note. Hangs off a 45-degree leader from the mark.
 */
/**
 * A pool of shade with feathered edges (a solid core, then a smooth fall to nothing over
 * `feather` px on every side, rounded at the corners): glass under a reading, never a box.
 */
export function drawFeatherPool(g, x, y, w, h, { a = 0.5, feather = 24, rgb = '5,7,10' } = {}) {
  if (!(w > 0) || !(h > 0) || !(a > 0)) return;
  const F = Math.max(1, feather);
  const stops = (grad) => {
    grad.addColorStop(0, rgbaOf(rgb, a));
    grad.addColorStop(0.35, rgbaOf(rgb, a * 0.72));
    grad.addColorStop(0.7, rgbaOf(rgb, a * 0.26));
    grad.addColorStop(1, rgbaOf(rgb, 0));
    return grad;
  };
  g.save();
  g.fillStyle = rgbaOf(rgb, a);
  g.fillRect(x, y, w, h);
  if (typeof g.createLinearGradient === 'function' && typeof g.createRadialGradient === 'function') {
    // edges
    g.fillStyle = stops(g.createLinearGradient(0, y, 0, y - F)); g.fillRect(x, y - F, w, F);
    g.fillStyle = stops(g.createLinearGradient(0, y + h, 0, y + h + F)); g.fillRect(x, y + h, w, F);
    g.fillStyle = stops(g.createLinearGradient(x, 0, x - F, 0)); g.fillRect(x - F, y, F, h);
    g.fillStyle = stops(g.createLinearGradient(x + w, 0, x + w + F, 0)); g.fillRect(x + w, y, F, h);
    // corners
    for (const [cx, cy, qx, qy] of [[x, y, x - F, y - F], [x + w, y, x + w, y - F], [x, y + h, x - F, y + h], [x + w, y + h, x + w, y + h]]) {
      g.fillStyle = stops(g.createRadialGradient(cx, cy, 0, cx, cy, F));
      g.fillRect(qx, qy, F, F);
    }
  }
  g.restore();
}

export function drawLineReadingLarge(g, x, y, { title = '', numerals = [], figures = '', note = '', bounds = null, clear = 12, avoid = [], seat = null, measureOnly = false } = {}) {
  if (!title && !numerals.length) return null;
  const NUM_PX = 44;
  g.save();
  g.textBaseline = 'alphabetic';
  g.font = chartFont(700, 14);
  setTracking(g, 0.16, 14);
  const tw = title ? g.measureText(title).width : 0;
  const parts = [];
  let nw = 0;
  for (const n of numerals) {
    g.font = `250 ${NUM_PX}px "Archivo", "Instrument Sans", system-ui, sans-serif`;
    setTracking(g, -0.01, NUM_PX);
    const vw = g.measureText(String(n.value)).width;
    g.font = chartFont(650, 12);
    setTracking(g, 0.16, 12);
    const uw = n.unit ? g.measureText(String(n.unit)).width : 0;
    parts.push({ ...n, vw, uw });
    nw += vw + 6 + uw + 22;
  }
  nw = Math.max(0, nw - 22);
  g.font = chartFont(560, 13, { stretch: 'normal' });
  setTracking(g, 0.04, 13);
  const fw = figures ? g.measureText(figures).width : 0;
  g.font = chartFont(600, 12);
  setTracking(g, 0.12, 12);
  const ow = note ? g.measureText(note).width : 0;
  const width = Math.max(tw, nw, fw, ow);
  const height = (title ? 20 : 0) + (parts.length ? NUM_PX + 2 : 0) + (figures ? 20 : 0) + (note ? 18 : 0);
  if (measureOnly) { g.restore(); return { width, height }; }
  const d = Math.max(8, clear) * 0.7071;
  const elbow = 26;
  const place = (sxn, syn) => {
    const ex = x + sxn * (d + elbow);
    const ey = y + syn * (d + elbow);
    const left = sxn > 0 ? ex + 10 : ex - 10 - width;
    const top = syn < 0 ? ey - height + 6 : ey - 6;
    return { ex, ey, left, top, sxn, syn };
  };
  let at = null;
  let best = Infinity;
  // A seat chosen by the chart's anchored placer (chartLabels.js) wins over the local search.
  if (seat && seat.leader) {
    const L = seat.leader;
    at = { ex: L.ex, ey: L.ey, left: seat.x, top: seat.y, sxn: L.ex >= x ? 1 : -1, syn: L.ey >= y ? 1 : -1, start: { x: L.sx, y: L.sy }, lx: L.lx };
    best = -1;
  }
  if (!at) for (const [cx, cy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
    const c = place(cx, cy);
    let cost = 0;
    if (bounds) {
      const over = Math.max(0, bounds.x + 8 - c.left) + Math.max(0, c.left + width - (bounds.x + bounds.width - 8))
        + Math.max(0, bounds.y + 8 - c.top) + Math.max(0, c.top + height - (bounds.y + bounds.height - 8));
      cost += over * 20;
    }
    for (const m of avoid || []) {
      const px = Math.max(c.left - 4, Math.min(m.x, c.left + width + 4));
      const py = Math.max(c.top - 4, Math.min(m.y, c.top + height + 4));
      const dd = Math.hypot(m.x - px, m.y - py);
      if (dd < m.r) cost += (m.r - dd) * (m.w || 1) * 6;
    }
    if (cost < best - 0.01) { best = cost; at = c; }
  }
  // a feathered pool of shade under the reading so it reads over lanes and tokens: no plate and no
  // edge, and never dark enough to knock out a ring it lies across (at most 52% dim)
  drawFeatherPool(g, at.left - 10, at.top - 6, width + 20, height + 12, { a: 0.52, feather: 26 });
  // the leader: out of the mark at 45 degrees, then flat into the reading
  const s0 = at.start || { x: x + at.sxn * d, y: y + at.syn * d };
  const lx = Number.isFinite(at.lx) ? at.lx : at.ex + at.sxn * 8;
  drawBand(g, (c) => { c.moveTo(s0.x, s0.y); c.lineTo(at.ex, at.ey); c.lineTo(lx, at.ey); },
    { band: 4, bandA: 0.24, edge: 1.5, edgeA: 0.8 });
  drawBead(g, s0.x, s0.y, 2.2, { bloom: 2.2 });
  let row = at.top;
  const ink = (text, font, fill, em, px, xx, yy) => {
    g.font = font;
    setTracking(g, em, px);
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(5,7,10,0.9)';
    g.lineWidth = 5;
    g.strokeText(text, xx, yy);
    g.fillStyle = fill;
    g.fillText(text, xx, yy);
  };
  if (title) { row += 15; ink(title, chartFont(700, 14), rgbaOf(LIT, 1), 0.16, 14, at.left, row); row += 5; }
  if (parts.length) {
    row += NUM_PX - 4;
    let cx = at.left;
    for (const pt of parts) {
      ink(String(pt.value), `250 ${NUM_PX}px "Archivo", "Instrument Sans", system-ui, sans-serif`, rgbaOf(PHOS, 1), -0.01, NUM_PX, cx, row);
      cx += pt.vw + 6;
      if (pt.unit) ink(String(pt.unit), chartFont(650, 12), rgbaOf(BONE, 0.82), 0.16, 12, cx, row);
      cx += pt.uw + 22;
    }
    row += 6;
  }
  if (figures) { row += 16; ink(figures, chartFont(560, 13, { stretch: 'normal' }), rgbaOf(PHOS, 0.92), 0.04, 13, at.left, row); row += 4; }
  if (note) { row += 16; ink(note, chartFont(600, 12), rgbaOf(BONE, 0.72), 0.12, 12, at.left, row); }
  setTracking(g, 0, 12);
  g.restore();
  return { x: at.left, y: at.top, width, height };
}

export function drawLineReading(g, x, y, { title = '', figures = '', note = '', bounds = null, clear = 12, avoid = [] } = {}) {
  if (!title && !(Array.isArray(figures) ? figures.length : figures)) return null;
  g.save();
  g.textBaseline = 'alphabetic';
  g.font = chartFont(700, 15);
  setTracking(g, 0.04, 15);
  const tw = title ? g.measureText(title).width : 0;
  // figures may be one line or several (a short column reads better than one long rule of text)
  const figs = (Array.isArray(figures) ? figures : [figures]).filter(Boolean);
  g.font = chartFont(560, 13, { stretch: 'normal' });
  setTracking(g, 0.02, 13);
  let fw = 0;
  for (const line of figs) fw = Math.max(fw, g.measureText(line).width);
  g.font = chartFont(560, 12, { stretch: 'normal' });
  const nw = note ? g.measureText(note).width : 0;
  const width = Math.max(tw, fw, nw);
  const lineH = 18;
  const lines = (title ? 1 : 0) + figs.length + (note ? 1 : 0);
  const height = lines * lineH;
  // A leader leaves the mark at 45 degrees, clear of it, and the reading hangs off its elbow
  // (up and right; flipped to stay inside the clear field).
  const d = Math.max(8, clear) * 0.7071;
  let sxn = 1;
  let syn = -1;
  const elbow = 22;
  const place = () => {
    const ex = x + sxn * (d + elbow);
    const ey = y + syn * (d + elbow);
    const left = sxn > 0 ? ex + 8 : ex - 8 - width;
    const top = syn < 0 ? ey - height + 4 : ey + 4;
    return { ex, ey, left, top };
  };
  // Of the four diagonals, take the one that stays in the field and covers the fewest marks.
  let at = null;
  let best = Infinity;
  for (const [cx, cy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
    sxn = cx; syn = cy;
    const c = place();
    let cost = 0;
    if (bounds) {
      const over = Math.max(0, bounds.x + 8 - c.left) + Math.max(0, c.left + width - (bounds.x + bounds.width - 8))
        + Math.max(0, bounds.y + 8 - c.top) + Math.max(0, c.top + height - (bounds.y + bounds.height - 8));
      cost += over * 20;
    }
    for (const m of avoid || []) {
      const nx = Math.max(c.left - 4, Math.min(m.x, c.left + width + 4));
      const ny = Math.max(c.top - 4, Math.min(m.y, c.top + height + 4));
      const dd = Math.hypot(m.x - nx, m.y - ny);
      if (dd < m.r) cost += (m.r - dd) * (m.w || 1) * 6;
    }
    if (cost < best - 0.01) { best = cost; at = { ...c, sxn, syn }; }
  }
  sxn = at.sxn; syn = at.syn;
  const ox = at.left;
  const oy = at.top + lineH - 4;
  g.strokeStyle = rgbaOf(BONE, 0.62);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + sxn * d, y + syn * d);
  g.lineTo(at.ex, at.ey);
  g.lineTo(sxn > 0 ? at.ex + 6 : at.ex - 6, at.ey);
  g.stroke();
  let row = oy;
  const put = (text, font, fill, em, px) => {
    g.font = font;
    setTracking(g, em, px);
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(5,7,10,0.92)';
    g.lineWidth = 5;
    g.strokeText(text, ox, row);
    g.fillStyle = fill;
    g.fillText(text, ox, row);
    row += lineH;
  };
  if (title) put(title, chartFont(700, 15), rgbaOf(LIT, 1), 0.04, 15);
  for (const line of figs) put(line, chartFont(560, 13, { stretch: 'normal' }), rgbaOf(PHOS, 1), 0.02, 13);
  if (note) put(note, chartFont(560, 12, { stretch: 'normal' }), rgbaOf(BONE, 0.72), 0.02, 12);
  g.restore();
  return { x: ox, y: oy - lineH, width, height };
}

/** The hold ring that fills under the pointer while a still press turns into laying a line. */
export function drawHoldRing(g, x, y, p) {
  if (!(p > 0)) return;
  drawBandRing(g, x, y, 15, { band: 5, bandA: 0.16, edge: 1.2, edgeA: 0.4 });
  drawBand(g, (c) => c.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p)), {
    rgb: HAND, band: 6, bandA: 0.3, edge: 2.2, edgeA: 0.95,
  });
}

// ─── DOM instruments ───────────────────────────────────────────────────────────────────────────

const f2 = (n) => Math.round(n * 100) / 100;

/**
 * THE ZOOM LEVER: the three scale words stand on one ruled scale; a lit bone needle rides it at the chart's
 * continuous zoom (it follows the wheel between the words, and eases when a word is pressed).
 * `sync(pos)` takes a position in word units: 0 = the first word, 1 = the second, 2 = the third,
 * fractions between (and a little past either end).
 */
export function createZoomLever(group) {
  const doc = group && group.ownerDocument;
  const inert = { sync() {}, layout() {}, dispose() {} };
  if (!group || !doc || typeof doc.createElementNS !== 'function') return inert;
  const face = svg('svg', { class: 'orr-svg orr-chart-lever', 'aria-hidden': 'true', focusable: 'false' });
  const base = svg('g');
  const hand = svg('g', { class: 'orr-chart-lever__hand' });
  hand.append(
    svg('path', { d: 'M 0 -3 L 0 -17', class: 'orr-lit-bloom', style: '--orr-w-lit-bloom:8px' }),
    svg('path', { d: 'M 0 -3 L 0 -17', class: 'orr-lit', style: '--orr-w-lit:2px' }),
    svg('circle', { r: 7, class: 'orr-bead-bloom' }),
    svg('circle', { r: 3.4, class: 'orr-bead' }),
  );
  face.append(base, hand);
  group.appendChild(face);
  let centers = [];
  let ruleY = 0;
  let x0 = 0;
  let x1 = 0;
  let pos = 0;
  const xFor = (p) => {
    if (!centers.length) return 0;
    if (centers.length === 1) return centers[0];
    const i = Math.max(0, Math.min(centers.length - 2, Math.floor(p)));
    const t = p - i;
    const x = centers[i] + (centers[i + 1] - centers[i]) * t;
    return Math.max(x0 + 4, Math.min(x1 - 4, x));
  };
  const spring = createSpring({ value: 0, preset: { k: 190, c: 20 }, onUpdate: (x) => hand.setAttribute('transform', `translate(${f2(x)} ${f2(ruleY)})`) });
  let placed = false;
  function layout() {
    const gr = group.getBoundingClientRect();
    const words = [...group.querySelectorAll('button')];
    if (!(gr.width > 0) || !words.length) return;
    const pad = 16;
    const H = gr.height + 14;
    face.setAttribute('viewBox', `${-pad} 0 ${f2(gr.width + pad * 2)} ${f2(H)}`);
    face.style.left = `${-pad}px`;
    face.style.width = `${gr.width + pad * 2}px`;
    face.style.height = `${H}px`;
    centers = words.map((b) => { const r = b.getBoundingClientRect(); return r.left - gr.left + r.width / 2; });
    ruleY = gr.height + 5;
    x0 = -pad + 2;
    x1 = gr.width + pad - 2;
    base.textContent = '';
    base.appendChild(svg('path', { d: `M ${f2(x0)} ${f2(ruleY)} L ${f2(x1)} ${f2(ruleY)}`, class: 'orr-band', style: '--orr-w-band:8px; --orr-band-a:.34' }));
    base.appendChild(svg('path', { d: `M ${f2(x0)} ${f2(ruleY)} L ${f2(x1)} ${f2(ruleY)}`, class: 'orr-edge', style: '--orr-edge-a:.62' }));
    const fine = [];
    for (let x = x0 + 5; x < x1 - 2; x += 6) fine.push(`M ${f2(x)} ${f2(ruleY + 2)} L ${f2(x)} ${f2(ruleY + 5)}`);
    base.appendChild(svg('path', { d: fine.join(' '), class: 'orr-tick', style: 'stroke:rgb(236 230 216 / .34)' }));
    const majors = centers.map((x) => `M ${f2(x)} ${f2(ruleY - 1)} L ${f2(x)} ${f2(ruleY + 8)}`);
    base.appendChild(svg('path', { d: majors.join(' '), class: 'orr-tick orr-tick--major' }));
    spring.set(xFor(pos), { instant: true });
    placed = true;
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => layout()); ro.observe(group); }
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === 'function') raf(() => layout()); else layout();
  return {
    layout,
    sync(p, { instant = false } = {}) {
      if (!Number.isFinite(p)) return;
      pos = p;
      if (!centers.length) return;
      spring.set(xFor(p), { instant: instant || !placed });
    },
    dispose() { spring.stop(); if (ro) { try { ro.disconnect(); } catch (_) { /* gone */ } } face.remove(); },
  };
}

/**
 * THE TAB SCALE: the inspector's tabs as words standing on ruled scales (one per row the words wrap
 * into), fine graduations, a tick under each word, and a lit bone cursor — a bright bar and bead —
 * under the open one, springing to it when the tab changes. (Bone, not amber: a tab is a view of the
 * chart, not a choice about the world; the warm light stays with the course and the zoom lever.)
 */
export function createTabScale(host) {
  const doc = host && host.ownerDocument;
  const inert = { sync() {}, dispose() {} };
  if (!host || !doc || typeof doc.createElementNS !== 'function') return inert;
  const face = svg('svg', { class: 'orr-svg orr-chart-tabscale', 'aria-hidden': 'true', focusable: 'false' });
  const base = svg('g');
  const hand = svg('g', { class: 'orr-chart-tabscale__hand' });
  hand.append(
    svg('path', { d: 'M -16 0 L 16 0', class: 'orr-lit-bloom', style: '--orr-w-lit-bloom:8px' }),
    svg('path', { d: 'M -16 0 L 16 0', class: 'orr-lit', style: '--orr-w-lit:2.5px' }),
    svg('circle', { r: 3.2, class: 'orr-bead' }),
  );
  face.append(base, hand);
  host.appendChild(face);
  const xs = createSpring({ value: 0, preset: { k: 240, c: 24 }, onUpdate: () => place() });
  const ys = createSpring({ value: 0, preset: { k: 240, c: 26 }, onUpdate: () => place() });
  function place() { hand.setAttribute('transform', `translate(${f2(xs.value)} ${f2(ys.value)})`); }
  let placed = false;
  function sync({ instant = false } = {}) {
    const hr = host.getBoundingClientRect();
    const words = [...host.querySelectorAll('[role="tab"]')];
    if (!(hr.width > 0) || !words.length) return;
    face.setAttribute('viewBox', `0 0 ${f2(hr.width)} ${f2(hr.height)}`);
    base.textContent = '';
    const rows = new Map();
    for (const b of words) {
      const r = b.getBoundingClientRect();
      const key = Math.round(r.bottom - hr.top);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ b, x: r.left - hr.left, w: r.width, cx: r.left - hr.left + r.width / 2 });
    }
    let target = null;
    for (const [bottom, items] of rows) {
      const y = bottom - 2;
      const a = 0;
      const b = hr.width;
      base.appendChild(svg('path', { d: `M ${a} ${f2(y)} L ${f2(b)} ${f2(y)}`, class: 'orr-band', style: '--orr-w-band:6px; --orr-band-a:.34' }));
      base.appendChild(svg('path', { d: `M ${a} ${f2(y)} L ${f2(b)} ${f2(y)}`, class: 'orr-edge', style: '--orr-edge-a:.42' }));
      const fine = [];
      for (let x = 3; x < b; x += 7) fine.push(`M ${f2(x)} ${f2(y + 2)} L ${f2(x)} ${f2(y + 4.5)}`);
      base.appendChild(svg('path', { d: fine.join(' '), class: 'orr-tick', style: 'stroke:rgb(236 230 216 / .26)' }));
      for (const it of items) {
        const lit = it.b.getAttribute('aria-selected') === 'true';
        const empty = it.b.getAttribute('aria-disabled') === 'true';
        base.appendChild(svg('path', {
          d: `M ${f2(it.cx)} ${f2(y - 1)} L ${f2(it.cx)} ${f2(y + 7)}`,
          class: 'orr-tick orr-tick--major',
          style: empty ? 'stroke:rgb(236 230 216 / .36)' : lit ? 'stroke:rgb(248 244 234)' : null,
        }));
        if (lit) target = { x: it.cx, y };
      }
    }
    if (target) {
      xs.set(target.x, { instant: instant || !placed });
      ys.set(target.y, { instant: instant || !placed });
      hand.style.display = '';
      placed = true;
    } else hand.style.display = 'none';
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => sync({ instant: true })); ro.observe(host); }
  return {
    sync,
    dispose() { xs.stop(); ys.stop(); if (ro) { try { ro.disconnect(); } catch (_) { /* gone */ } } face.remove(); },
  };
}
