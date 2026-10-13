// Frame-measured readability: for each screenshot, sample the pixels inside each on-screen enemy,
// asteroid and projectile (screen positions from the telemetry sample nearest the shot), then ask
// whether the classes separate in colour (CIELAB) and apparent size. Uses sharp (already a dep).

import sharp from 'sharp';
import { E, CLS, VIS, THRESHOLDS } from './checks.mjs';

const CLASSES = ['enemy', 'asteroid', 'projectile', 'pickup'];
// Play-space bodies that are none of the combat classes (stations, neutral hulls, props): census only.
const BODY_CLASSES = ['station', 'neutral', 'other'];
const INNER_SCALE = 0.7;

function srgbToLab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r); const G = lin(g); const B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function labOfRgb(rgb) {
  const lab = srgbToLab((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
  const chroma = Math.hypot(lab[1], lab[2]);
  const hueDeg = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
  return {
    rgb,
    lab: Object.freeze([+lab[0].toFixed(2), +lab[1].toFixed(2), +lab[2].toFixed(2)]),
    hueDeg: +hueDeg.toFixed(2),
    chroma: +chroma.toFixed(2),
  };
}

/** Crimson of `getMaterial('swarm:threat-ring')` in src/render/visualFactory.js. Lab comes from that rgb.
 *  L is about 54, so a brightness test (L≥75) never sees this ring. A drift test reads the source literal. */
export const THREAT_MARKER = Object.freeze(labOfRgb(0xff1a3a));
export const THREAT_HUE_TOLERANCE_DEG = 18;
export const THREAT_CHROMA_MIN = 40;
/** Mid-band pixels closer than this to the backdrop are the backdrop, not a mark. */
export const RIM_BG_DE_MIN = 12;
/** Share of the mid band that must clear the chroma floor and the backdrop ΔE before the sample has a threat rim. */
export const RIM_THREAT_SHARE = 0.08;

export function rimHue(lab) {
  if (!lab) return null;
  return { chroma: Math.hypot(lab[1], lab[2]), hue: (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360 };
}

/** True when this Lab is the declared threat hue and chromatic enough to be a mark. */
export function rimMatchesThreat(lab) {
  const h = rimHue(lab);
  if (!h || h.chroma < THREAT_CHROMA_MIN) return false;
  let d = Math.abs(h.hue - THREAT_MARKER.hueDeg);
  if (d > 180) d = 360 - d;
  return d <= THREAT_HUE_TOLERANCE_DEG;
}

/** +1.5 only when one class wears the threat hue and the other does not. Pass threat-match rates, not L≥75 rates. */
export function threatMarkerCredit(rateA, rateB) {
  const a = Number(rateA) || 0; const b = Number(rateB) || 0;
  if (Math.max(a, b) >= THRESHOLDS.readabilityMarkerOn && Math.abs(a - b) >= THRESHOLDS.readabilityMarkerSplit) return THRESHOLDS.readabilityMarkerCredit;
  return 0;
}

/** Mean Lab of the pixels inside a box, and of a ring around it (background). Exported for tests.
 *  `marker` is the share of the mid rim whose L is ≥ 75. It does not buy credit.
 *  `rim` is the mean Lab of mid-band pixels that pass the chroma floor and differ from the backdrop
 *  by at least `RIM_BG_DE_MIN`. A warm backdrop therefore cannot paint the mean into the threat hue.
 *  `rim` is null when those pixels are under `RIM_THREAT_SHARE` of the band. */
export function sampleBox(raw, W, H, ch, cx, cy, r) {
  const inner = Math.max(1, Math.round(r * INNER_SCALE)); const ring = Math.round(Math.max(r * 1.6, r + 4));
  const acc = [0, 0, 0]; let n = 0; const bg = [0, 0, 0]; let nb = 0; const inn = [];
  let markerN = 0; let midN = 0; const mid = [];
  for (let y = Math.max(0, cy - ring); y <= Math.min(H - 1, cy + ring); y++) {
    for (let x = Math.max(0, cx - ring); x <= Math.min(W - 1, cx + ring); x++) {
      const dx = x - cx; const dy = y - cy; const d = Math.max(Math.abs(dx), Math.abs(dy));
      const i = (y * W + x) * ch;
      const L = srgbToLab(raw[i], raw[i + 1], raw[i + 2]);
      if (d <= inner) { acc[0] += L[0]; acc[1] += L[1]; acc[2] += L[2]; n++; inn.push(L); }
      else if (d <= r * 1.15) { midN++; mid.push(L); if (L[0] >= 75) markerN++; }
      else if (d > r * 1.2) { bg[0] += L[0]; bg[1] += L[1]; bg[2] += L[2]; nb++; }
    }
  }
  if (!n) return null;
  // The lit quarter of the body: what the eye calls its colour ("white sphere", "orange blob").
  inn.sort((p, q) => q[0] - p[0]); const top = inn.slice(0, Math.max(1, Math.ceil(inn.length / 4)));
  const lit = [0, 1, 2].map((k) => top.reduce((sum, L) => sum + L[k], 0) / top.length);
  const bgLab = nb ? bg.map((v) => v / nb) : null;
  const qualified = [];
  for (const L of mid) {
    if (Math.hypot(L[1], L[2]) < THREAT_CHROMA_MIN) continue;
    if (bgLab && dist(L, bgLab) < RIM_BG_DE_MIN) continue;
    qualified.push(L);
  }
  const share = midN ? qualified.length / midN : 0;
  const rim = share >= RIM_THREAT_SHARE
    ? [0, 1, 2].map((k) => qualified.reduce((sum, L) => sum + L[k], 0) / qualified.length)
    : null;
  return { lab: acc.map((v) => v / n), lit, bg: bgLab, marker: midN ? markerN / midN : 0, rim };
}

/** Separation index between two sample sets: centroid distance / pooled spread, plus size.
 *  `markerCredit` is added by the caller when one class wears the declared threat hue and the other does not. */
export function separation(A, B, { markerCredit = 0 } = {}) {
  const mean = (S) => [0, 1, 2].map((k) => S.reduce((s, x) => s + x.lab[k], 0) / S.length);
  const mA = mean(A); const mB = mean(B);
  const spread = (S, m) => Math.sqrt(S.reduce((s, x) => s + dist(x.lab, m) ** 2, 0) / S.length);
  const pooled = Math.sqrt((spread(A, mA) ** 2 + spread(B, mB) ** 2) / 2) || 1;
  const dColor = dist(mA, mB);
  const med = (S) => { const v = S.map((x) => x.r).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 1; };
  const sizeRatio = Math.max(med(A), med(B)) / Math.max(1, Math.min(med(A), med(B)));
  // Size separates classes as much as colour does on a top-down screen: credit log size ratio (the silhouette term).
  const sep = dColor / pooled + Math.max(0, Math.log2(sizeRatio) - 0.5) + markerCredit;
  return { sep, dColor, sizeRatio, markerCredit };
}

function captureWindow(shot, nearestSample, samples) {
  if (!Number.isFinite(shot.endT) || shot.endT < shot.t) return null;
  const start = nearestSample(shot.t); const end = nearestSample(shot.endT);
  if (!start || !end) return null;
  return [...new Set([start, ...samples.filter((s) => s.t >= shot.t && s.t <= shot.endT), end])];
}

function capturePose(entity, window) {
  const entries = window.map((s) => s.e.find((e) => e[E.id] === entity[E.id]));
  if (entries.some((e, i) => !e || e[E.cls] !== entity[E.cls]
      || e[E.key] !== entity[E.key] || e[E.type] !== entity[E.type]
      || ![VIS.onscreen, VIS.pooled].includes(e[E.vis])
      || window[i].vw !== window[0].vw || window[i].vh !== window[0].vh)) {
    return { reason: 'capture-identity-or-visibility' };
  }
  const radius = Math.min(...entries.map((e) => e[E.pr]));
  const xs = entries.map((e) => e[E.sx]); const ys = entries.map((e) => e[E.sy]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  // The sampled inner patch occupies 70% of the body radius. Require the observed
  // motion to fit within its remaining margin throughout capture, including out-and-back
  // motion. Screenshot encoding has no exact exposed frame timestamp; unstable images
  // cannot honestly assign their pixels to one of these poses.
  if (!Number.isFinite(radius) || radius <= 0
      || Math.hypot(x1 - x0, y1 - y0) > radius * (1 - INNER_SCALE)) {
    return { reason: 'capture-motion' };
  }
  const pose = [...entity];
  pose[E.sx] = (x0 + x1) / 2; pose[E.sy] = (y0 + y1) / 2; pose[E.pr] = radius;
  return { pose };
}

/** Native rendered geometry owns cover; screenshot radius boxes are only diagnostics. */
export function summarizeBodyOcclusion(samples) {
  const types = new Map();
  for (const sample of samples) {
    if (sample.mode !== 'flight' || (sample.run && sample.run.ph !== 'active')) continue;
    const receipt = sample.px?.bodyOcclusion;
    if (receipt?.version !== 1 || receipt.method !== 'native-opaque-id-depth') continue;
    for (const row of receipt.rows || []) {
      if (!BODY_CLASSES.includes(row.cls)) continue;
      const entity = sample.e?.find(e => e[E.id] === row.id && e[E.type] === row.ty && e[E.cls] === CLS[row.cls]);
      const key = `${row.cls}|${row.ty}`;
      const group = types.get(key) || { cls: row.cls, ty: row.ty, n: 0, covered: 0, unknown: 0,
        reasons: {}, radiusSum: 0, exampleT: null, exampleBox: null };
      const measured = entity && row.status === 'measured' && Number.isFinite(row.pixels) && row.pixels >= 0;
      if (measured) {
        group.n++; group.radiusSum += entity[E.pr];
        if (row.pixels > 0) {
          group.covered++;
          if (group.exampleT == null) { group.exampleT = sample.t; group.exampleBox = row.box; }
        }
      } else {
        group.unknown++;
        const reason = entity ? row.reason || 'unmeasured' : 'stale-body-identity';
        group.reasons[reason] = (group.reasons[reason] || 0) + 1;
      }
      types.set(key, group);
    }
  }
  return types;
}

export async function analyzeReadability(shots, nearestSample, samples = []) {
  const per = Object.fromEntries([...CLASSES, ...BODY_CLASSES].map((c) => [c, []]));
  const rejected = Object.fromEntries([...CLASSES, ...BODY_CLASSES].map((c) => [c, {}]));
  let unboundedShots = 0;
  for (const shot of shots) {
    if (!shot.play) continue;
    const window = captureWindow(shot, nearestSample, samples);
    if (!window) { unboundedShots++; continue; }
    const s = window[0];
    let img;
    try { img = await sharp(shot.file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); } catch { continue; }
    const { data, info } = img; const W = info.width; const H = info.height; const sc = W / s.vw;
    for (const entity of s.e) {
      const aligned = capturePose(entity, window);
      const e = aligned.pose || entity;
      const cls = [...CLASSES, ...BODY_CLASSES].find((c) => CLS[c] === e[E.cls]); if (!cls) continue;
      if (!(e[E.vis] === VIS.onscreen || e[E.vis] === VIS.pooled)) continue;
      if (!aligned.pose) {
        rejected[cls][aligned.reason] = (rejected[cls][aligned.reason] || 0) + 1;
        continue;
      }
      const r = e[E.pr] * sc; if (r < 2.5) continue;
      const cx = Math.round(e[E.sx] * sc); const cy = Math.round(e[E.sy] * sc);
      if (cx < r || cy < r || cx > W - r || cy > H - r) continue;
      const m = sampleBox(data, W, H, info.channels, cx, cy, Math.min(r, 60));
      if (!m) continue;
      const box = [e[E.sx] - e[E.pr], e[E.sy] - e[E.pr], e[E.sx] + e[E.pr], e[E.sy] + e[E.pr]]; const pb = s.p && s.p.onScreen ? s.p.box : null;
      const overPlayer = !!(pb && box[0] < pb[2] && box[2] > pb[0] && box[1] < pb[3] && box[3] > pb[1]);
      per[cls].push({ ...m, r: e[E.pr], ty: e[E.type], t: shot.t, box, overPlayer });
    }
  }
  const classes = {};
  const deltaL = (x) => (x.bg ? Math.abs(x.lab[0] - x.bg[0]) : null);
  for (const c of CLASSES) {
    const S = per[c];
    const low = S.filter((x) => deltaL(x) != null && deltaL(x) < THRESHOLDS.readabilityLowDeltaL);
    const worst = S.slice().sort((a, b) => (deltaL(a) ?? 99) - (deltaL(b) ?? 99)).slice(0, 2)
      .map((x) => ({ t: x.t, box: x.box, deltaL: deltaL(x) == null ? null : +deltaL(x).toFixed(1) }));
    const marked = S.filter((x) => (x.marker || 0) >= 0.08).length;
    const threat = S.filter((x) => rimMatchesThreat(x.rim)).length;
    classes[c] = { n: S.length, lowContrastFrac: S.length ? low.length / S.length : 0, exampleT: (low[0] || S[0] || {}).t, exampleBox: (low[0] || S[0] || {}).box,
      markerRate: S.length ? marked / S.length : 0, threatRate: S.length ? threat / S.length : 0, worst,
      meanLab: S.length ? [0, 1, 2].map((k) => +(S.reduce((s, x) => s + x.lab[k], 0) / S.length).toFixed(1)) : null };
  }
  const markerCreditFor = (a, b) => threatMarkerCredit(classes[a] ? classes[a].threatRate : 0, classes[b] ? classes[b].threatRate : 0);
  const pairs = [];
  for (const [a, b] of [['enemy', 'asteroid'], ['enemy', 'projectile'], ['asteroid', 'projectile'], ['enemy', 'pickup']]) {
    if (!per[a].length || !per[b].length) { pairs.push({ a, b, nA: per[a].length, nB: per[b].length, sep: null }); continue; }
    const credit = markerCreditFor(a, b);
    const s = separation(per[a], per[b], { markerCredit: credit });
    pairs.push({ a, b, nA: per[a].length, nB: per[b].length, ...s, exampleT: per[a][0].t, exampleBox: per[a][0].box });
  }
  // What each kind of body looks like on screen: the census that names "the white sphere" and "the orange blobs".
  const types = new Map();
  for (const c of [...CLASSES, ...BODY_CLASSES]) for (const x of per[c]) {
    const k = `${c}|${x.ty}`; const r = types.get(k) || { cls: c, ty: x.ty, n: 0, L: 0, a: 0, b: 0, r: 0, over: 0, t: x.t, box: x.box };
    if (x.overPlayer) { r.over++; if (!r.overT) { r.overT = x.t; r.overBox = x.box; } }
    r.n++; r.L += x.lit[0]; r.a += x.lit[1]; r.b += x.lit[2]; r.r += x.r; types.set(k, r);
  }
  const occlusion = summarizeBodyOcclusion(samples);
  const census = [...types.values()].sort((p, q) => q.n - p.n).slice(0, 16).map((r) => {
    const L = r.L / r.n; const a = r.a / r.n; const b = r.b / r.n; const chroma = Math.hypot(a, b);
    const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    const look = chroma < 12 ? (L > 70 ? 'white' : L > 40 ? 'grey' : 'dark') : hue < 35 || hue > 340 ? 'red' : hue < 85 ? 'orange' : hue < 110 ? 'yellow' : hue < 200 ? 'green' : hue < 260 ? 'cyan/blue' : 'violet';
    return { cls: r.cls, ty: r.ty, n: r.n, litLab: [+L.toFixed(1), +a.toFixed(1), +b.toFixed(1)], look, meanRadiusPx: +(r.r / r.n).toFixed(1), overPlayerFrac: +(r.over / r.n).toFixed(3), exampleT: r.overT || r.t, exampleBox: r.overBox || r.box,
      ...(occlusion.has(`${r.cls}|${r.ty}`) ? { occlusion: occlusion.get(`${r.cls}|${r.ty}`) } : {}) };
  });
  for (const [key, group] of occlusion) if (!census.some(c => `${c.cls}|${c.ty}` === key)) {
    census.push({ cls: group.cls, ty: group.ty, n: 0, look: 'unmeasured',
      meanRadiusPx: group.n ? group.radiusSum / group.n : 0, occlusion: group });
  }
  const rejectedCount = Object.values(rejected).reduce((n, reasons) => n + Object.values(reasons).reduce((a, b) => a + b, 0), 0);
  const measurementNote = `capture coherence: ${rejectedCount} body samples rejected for capture-motion or identity/visibility changes; ${unboundedShots} screenshots lack a recorded capture interval; body/player coverage uses native opaque ID/depth pixels, radius-box overlap remains diagnostic`;
  return { classes, pairs, census, captureCoherence: { rejected, unboundedShots }, measurementNote };
}
