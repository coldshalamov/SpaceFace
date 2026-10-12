// Frame-measured readability: for each screenshot, sample the pixels inside each on-screen enemy,
// asteroid and projectile (screen positions from the telemetry sample nearest the shot), then ask
// whether the classes separate in colour (CIELAB) and apparent size. Uses sharp (already a dep).

import sharp from 'sharp';
import { E, CLS, VIS } from './checks.mjs';

const CLASSES = ['enemy', 'asteroid', 'projectile', 'pickup'];
// Play-space bodies that are none of the combat classes (stations, neutral hulls, props): census only.
const BODY_CLASSES = ['station', 'neutral', 'other'];

function srgbToLab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r); const G = lin(g); const B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** Mean Lab of the pixels inside a box, and of a ring around it (background). Exported for tests. */
export function sampleBox(raw, W, H, ch, cx, cy, r) {
  const inner = Math.max(1, Math.round(r * 0.7)); const ring = Math.round(Math.max(r * 1.6, r + 4));
  const acc = [0, 0, 0]; let n = 0; const bg = [0, 0, 0]; let nb = 0; const inn = [];
  for (let y = Math.max(0, cy - ring); y <= Math.min(H - 1, cy + ring); y++) {
    for (let x = Math.max(0, cx - ring); x <= Math.min(W - 1, cx + ring); x++) {
      const dx = x - cx; const dy = y - cy; const d = Math.max(Math.abs(dx), Math.abs(dy));
      const i = (y * W + x) * ch;
      if (d <= inner) { const L = srgbToLab(raw[i], raw[i + 1], raw[i + 2]); acc[0] += L[0]; acc[1] += L[1]; acc[2] += L[2]; n++; inn.push(L); } else if (d > r * 1.2) { const L = srgbToLab(raw[i], raw[i + 1], raw[i + 2]); bg[0] += L[0]; bg[1] += L[1]; bg[2] += L[2]; nb++; }
    }
  }
  if (!n) return null;
  // The lit quarter of the body: what the eye calls its colour ("white sphere", "orange blob").
  inn.sort((p, q) => q[0] - p[0]); const top = inn.slice(0, Math.max(1, Math.ceil(inn.length / 4)));
  const lit = [0, 1, 2].map((k) => top.reduce((sum, L) => sum + L[k], 0) / top.length);
  return { lab: acc.map((v) => v / n), lit, bg: nb ? bg.map((v) => v / nb) : null };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Separation index between two sample sets: centroid distance / pooled spread, plus size. */
export function separation(A, B) {
  const mean = (S) => [0, 1, 2].map((k) => S.reduce((s, x) => s + x.lab[k], 0) / S.length);
  const mA = mean(A); const mB = mean(B);
  const spread = (S, m) => Math.sqrt(S.reduce((s, x) => s + dist(x.lab, m) ** 2, 0) / S.length);
  const pooled = Math.sqrt((spread(A, mA) ** 2 + spread(B, mB) ** 2) / 2) || 1;
  const dColor = dist(mA, mB);
  const med = (S) => { const v = S.map((x) => x.r).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 1; };
  const sizeRatio = Math.max(med(A), med(B)) / Math.max(1, Math.min(med(A), med(B)));
  // Size separates classes as much as colour does on a top-down screen: credit log size ratio.
  const sep = dColor / pooled + Math.max(0, Math.log2(sizeRatio) - 0.5);
  return { sep, dColor, sizeRatio };
}

export async function analyzeReadability(shots, nearestSample) {
  const per = Object.fromEntries([...CLASSES, ...BODY_CLASSES].map((c) => [c, []]));
  for (const shot of shots) {
    if (!shot.play) continue;
    const s = nearestSample(shot.t); if (!s) continue;
    let img;
    try { img = await sharp(shot.file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); } catch { continue; }
    const { data, info } = img; const W = info.width; const H = info.height; const sc = W / s.vw;
    for (const e of s.e) {
      const cls = [...CLASSES, ...BODY_CLASSES].find((c) => CLS[c] === e[E.cls]); if (!cls) continue;
      if (!(e[E.vis] === VIS.onscreen || e[E.vis] === VIS.pooled)) continue;
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
  for (const c of CLASSES) {
    const S = per[c];
    const low = S.filter((x) => x.bg && Math.abs(x.lab[0] - x.bg[0]) < 8);
    classes[c] = { n: S.length, lowContrastFrac: S.length ? low.length / S.length : 0, exampleT: (low[0] || S[0] || {}).t, exampleBox: (low[0] || S[0] || {}).box,
      meanLab: S.length ? [0, 1, 2].map((k) => +(S.reduce((s, x) => s + x.lab[k], 0) / S.length).toFixed(1)) : null };
  }
  const pairs = [];
  for (const [a, b] of [['enemy', 'asteroid'], ['enemy', 'projectile'], ['asteroid', 'projectile'], ['enemy', 'pickup']]) {
    if (!per[a].length || !per[b].length) { pairs.push({ a, b, nA: per[a].length, nB: per[b].length, sep: null }); continue; }
    const s = separation(per[a], per[b]);
    pairs.push({ a, b, nA: per[a].length, nB: per[b].length, ...s, exampleT: per[a][0].t, exampleBox: per[a][0].box });
  }
  // What each kind of body looks like on screen: the census that names "the white sphere" and "the orange blobs".
  const types = new Map();
  for (const c of [...CLASSES, ...BODY_CLASSES]) for (const x of per[c]) {
    const k = `${c}|${x.ty}`; const r = types.get(k) || { cls: c, ty: x.ty, n: 0, L: 0, a: 0, b: 0, r: 0, over: 0, t: x.t, box: x.box };
    if (x.overPlayer) { r.over++; if (!r.overT) { r.overT = x.t; r.overBox = x.box; } }
    r.n++; r.L += x.lit[0]; r.a += x.lit[1]; r.b += x.lit[2]; r.r += x.r; types.set(k, r);
  }
  const census = [...types.values()].sort((p, q) => q.n - p.n).slice(0, 16).map((r) => {
    const L = r.L / r.n; const a = r.a / r.n; const b = r.b / r.n; const chroma = Math.hypot(a, b);
    const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    const look = chroma < 12 ? (L > 70 ? 'white' : L > 40 ? 'grey' : 'dark') : hue < 35 || hue > 340 ? 'red' : hue < 85 ? 'orange' : hue < 110 ? 'yellow' : hue < 200 ? 'green' : hue < 260 ? 'cyan/blue' : 'violet';
    return { cls: r.cls, ty: r.ty, n: r.n, litLab: [+L.toFixed(1), +a.toFixed(1), +b.toFixed(1)], look, meanRadiusPx: +(r.r / r.n).toFixed(1), overPlayerFrac: +(r.over / r.n).toFixed(3), exampleT: r.overT || r.t, exampleBox: r.overBox || r.box };
  });
  return { classes, pairs, census };
}
