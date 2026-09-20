#!/usr/bin/env node
// Offline deep-sky plate baker — the authoring pipeline for far-sky painted plates.
//
//   assets/background/deep-sky/sources/<id>.json   editable source (shape primitives, budgets)
//        -> node tools/art/bake_deep_sky_plates.mjs
//   assets/background/deep-sky/<id>.png            baked plate (POT, edge-faded, dithered)
//   assets/background/deep-sky/manifest.json       dimensions, sha256, residency, measured stats
//
// WHY A BAKER AND NOT RUNTIME NOISE
// A painted plate is mixed across the WHOLE frame (`mix(sky, plate, strength)` in
// src/render/deepFieldDesign.js). Earlier review rejected exactly that when it was a procedural
// full-field wash, and four of the five sector profiles still carry the comment. A plate is only
// legitimate when it is a small number of LARGE authored forms with real negative space around
// them, so every source is built from shape primitives and every bake is measured against a
// composition budget calibrated on the one reviewed plate (helios-amber-estuary):
//
//     median 0.039 | coverage>0.10 0.250 | coverage>0.25 ~0.09 | lower-left corridor 0.0000
//
// A bake that exceeds its budget FAILS. Noise never creates a form here; it only textures the
// inside of one, because every detail term is multiplied by its primitive's envelope.
//
// SOURCE FORMAT
// Coordinates are screen units: x in [-aspect, +aspect], y in [-1, +1], y UP (row 0 = y = +1,
// which is what three's default flipY gives the shader). aspect = width / height.
//
//   { id, title, notes, width, height, seed,
//     floor: [r,g,b],            // the quiet base value; edges fade to exactly this
//     edgeFade: 0.11,            // outer fraction of each axis that returns to `floor`
//     exposure: 1.0, knee: 0.72, // highlight roll-off, so cores do not clip to a flat disc
//     budgets: { median, coverage10, coverage25, corridorCoverage05, edgeMean },
//     layers: [ ... ] }
//
// Layer kinds (applied in order; `mass|arc|glow` add light, `lane|void` remove it):
//
//   mass  { center:[x,y], radius, squash, rotation, falloff, gain, color,
//           coreRadius, coreGain, coreColor, grain, warp, filament, contrast }
//         An ellipsoidal cloud mass. `filament` turns the interior detail from soft mottling
//         into ridged veins. All detail is multiplied by the envelope, never added globally.
//   arc   { center, radius, squash, rotation, halfSpan, width, gain, color, taper,
//           grain, warp, contrast }
//         A swept shell / tidal band. Both ends dissolve through the `taper` envelope, so there
//         is never a shared straight cut-off (rejection register B9).
//   glow  { center, radius, squash, rotation, gain, color, falloff }
//         One broad low-amplitude gradient — a distant halo. No internal detail by design.
//   lane  { points:[[x,y],...], widths:[...], strength, feather }
//         A dark dust lane that OCCLUDES what is behind it. Depth cue and value separation.
//   void  { center, radius, squash, rotation, strength, falloff }
//         Protected negative space. The play corridor is kept quiet by an explicit primitive,
//         not by hoping the noise stays dark.
//
// Everything is deterministic: integer hashing, no Math.random, no wall clock. Re-running the
// baker on an unchanged source reproduces the plate byte for byte.
//
// Usage:  node tools/art/bake_deep_sky_plates.mjs [--only=id,id] [--check] [--quiet]
//         --check re-bakes into memory and fails if a shipped PNG would change (CI/reproducibility)

import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');
export const PLATE_DIR = resolve(REPO_ROOT, 'assets', 'background', 'deep-sky');
export const SOURCE_DIR = resolve(PLATE_DIR, 'sources');
export const MANIFEST_PATH = resolve(PLATE_DIR, 'manifest.json');

/** Plates that pre-date this pipeline: reviewed art with no editable source, measured not re-baked. */
export const IMPORTED_PLATES = Object.freeze([
  Object.freeze({
    id: 'helios-amber-estuary',
    file: 'assets/background/helios-amber-estuary.png',
    title: 'Helios amber estuary',
    imported: true,
    note: 'Reviewed 2026-09-19. No editable source; measured and budget-checked, never re-baked.',
  }),
]);

// ---------------------------------------------------------------------------------------------
// Deterministic value noise. Integer hash, smoothstep interpolation, optional domain warp.
// ---------------------------------------------------------------------------------------------

function hash2i(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const fx = x - x0; const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2i(x0, y0, seed);
  const b = hash2i(x0 + 1, y0, seed);
  const c = hash2i(x0, y0 + 1, seed);
  const d = hash2i(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

function fbm(x, y, seed, octaves) {
  let sum = 0; let amp = 0.5; let norm = 0; let fx = x; let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(fx, fy, (seed + i * 1013) | 0);
    norm += amp;
    amp *= 0.5;
    fx *= 2.0137; fy *= 2.0137;   // irrational-ish lacunarity: no octave lattice alignment
  }
  return sum / (norm || 1);
}

/** Billow fBm: round lobes with dark gaps between them, the shape family real dust makes. */
function billow(x, y, seed, octaves) {
  let sum = 0; let amp = 0.5; let norm = 0; let fx = x; let fy = y;
  for (let i = 0; i < octaves; i++) {
    const v = valueNoise(fx, fy, (seed + i * 2609) | 0);
    sum += amp * (1 - Math.abs(2 * v - 1));
    norm += amp;
    amp *= 0.54;
    fx *= 2.0237; fy *= 2.0237;
  }
  return sum / (norm || 1);
}

/** Ridged fBm: bright veins separated by dark interior — filaments, not mottling. */
function ridged(x, y, seed, octaves) {
  let sum = 0; let amp = 0.5; let norm = 0; let fx = x; let fy = y;
  for (let i = 0; i < octaves; i++) {
    const v = valueNoise(fx, fy, (seed + i * 3119) | 0);
    const r = 1 - Math.abs(2 * v - 1);
    sum += amp * r * r;
    norm += amp;
    amp *= 0.52;
    fx *= 2.0311; fy *= 2.0311;
  }
  return sum / (norm || 1);
}

/**
 * Cloud DENSITY at one point: the authored large-scale envelope gates a domain-warped billow/ridge
 * field. Density is never larger than the envelope allows, which is the structural reason a plate
 * cannot turn into full-field fog however the detail terms are tuned.
 */
function cloudDensity(x, y, layer, seed, envelope) {
  if (envelope <= 1e-4) return 0;
  const grain = Number.isFinite(layer.grain) ? layer.grain : 2.4;
  const warp = Number.isFinite(layer.warp) ? layer.warp : 0.42;
  const octaves = Math.max(2, Math.min(7, Math.round(layer.octaves ?? 6)));
  let sx = x * grain;
  let sy = y * grain;
  if (warp > 0) {
    const wx = fbm(sx * 0.47 + 17.31, sy * 0.47 - 4.07, (seed ^ 0x51a7) | 0, 2) - 0.5;
    const wy = fbm(sx * 0.47 - 9.11, sy * 0.47 + 23.77, (seed ^ 0x2f13) | 0, 2) - 0.5;
    sx += wx * warp * 3.1;
    sy += wy * warp * 3.1;
  }
  // Two fields, not one. A single threshold on a single fBm can only give wisps (high frequency)
  // or a blob (low frequency). Real cloud shaping needs a LOW-frequency base that owns the big
  // lobes and a HIGH-frequency field that erodes them — and erodes them only where the base is
  // already weak, so the interior stays solid and bright while the rim is shredded into detail.
  const base = billow(sx, sy, seed, Math.max(2, octaves - 2));
  const erode = Math.max(0, Math.min(0.98, layer.erode ?? 0.55));
  let shaped = base;
  if (erode > 0) {
    const filament = Math.max(0, Math.min(1, layer.filament ?? 0));
    const fineSeed = (seed ^ 0x7a31) | 0;
    const fx = sx * (layer.detailGrain ?? 4.3);
    const fy = sy * (layer.detailGrain ?? 4.3);
    let fine = billow(fx, fy, fineSeed, octaves);
    if (filament > 0) fine = fine * (1 - filament) + ridged(fx * 1.27, fy * 1.27, (fineSeed ^ 0x2b9) | 0, octaves) * filament;
    const cut = erode * fine * (1 - base);
    shaped = Math.max(0, (base - cut) / Math.max(1e-4, 1 - cut));
  }
  // `bias` is how much of the mass survives where the shaped field is empty. Low bias = torn,
  // lobed silhouette with real gaps; high bias = a continuous sheet. Authored per layer.
  const bias = Number.isFinite(layer.bias) ? layer.bias : 0.10;
  return envelope * (bias + (1 - bias) * shaped);
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------

function hexToRgb(hex, fallback = [1, 1, 1]) {
  if (typeof hex !== 'string') return fallback;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return fallback;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Local coordinates of `p` in the primitive's rotated, squashed ellipse frame, normalised by radius. */
function localEllipse(px, py, layer) {
  const cx = layer.center?.[0] ?? 0;
  const cy = layer.center?.[1] ?? 0;
  const rot = Number.isFinite(layer.rotation) ? layer.rotation : 0;
  const cos = Math.cos(-rot); const sin = Math.sin(-rot);
  const dx = px - cx; const dy = py - cy;
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  const radius = Math.max(1e-5, Number.isFinite(layer.radius) ? layer.radius : 0.5);
  const squash = Math.max(1e-3, Number.isFinite(layer.squash) ? layer.squash : 1);
  return [rx / radius, ry / (radius * squash)];
}

/** Axis-aligned bounds of a rotated ellipse, padded, in screen units. */
function ellipseBounds(layer, pad = 1.06) {
  const cx = layer.center?.[0] ?? 0;
  const cy = layer.center?.[1] ?? 0;
  const radius = Math.max(1e-5, Number.isFinite(layer.radius) ? layer.radius : 0.5);
  const squash = Math.max(1e-3, Number.isFinite(layer.squash) ? layer.squash : 1);
  const rot = Number.isFinite(layer.rotation) ? layer.rotation : 0;
  const a = radius * pad; const b = radius * squash * pad;
  const cos = Math.abs(Math.cos(rot)); const sin = Math.abs(Math.sin(rot));
  const ex = a * cos + b * sin;
  const ey = a * sin + b * cos;
  return [cx - ex, cy - ey, cx + ex, cy + ey];
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax; const vy = by - ay;
  const wx = px - ax; const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 1e-12 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  const dx = wx - vx * t; const dy = wy - vy * t;
  return [Math.hypot(dx, dy), t];
}

// ---------------------------------------------------------------------------------------------
// Plate rendering
// ---------------------------------------------------------------------------------------------

/**
 * Render one source to a Float32Array of RGB triplets in display space (0..1, pre-quantisation).
 * Resolution-independent: every primitive is evaluated in screen units, so a proof render at
 * 256x128 and the shipped 2048x1024 describe the same composition.
 */
export function renderDeepSkyPlate(source, widthOverride, heightOverride) {
  const width = Math.max(4, Math.floor(widthOverride || source.width || 2048));
  const height = Math.max(4, Math.floor(heightOverride || source.height || 1024));
  const aspect = width / height;
  const seed = (source.seed >>> 0) || 0x5eed;
  const rgb = new Float32Array(width * height * 3);
  const gain = new Float32Array(width * height);   // scalar occlusion / void multiplier
  gain.fill(1);

  const toPxX = (x) => ((x / aspect) * 0.5 + 0.5) * (width - 1);
  const toPxY = (y) => (0.5 - y * 0.5) * (height - 1);
  const fromPxX = (px) => ((px / (width - 1)) * 2 - 1) * aspect;
  const fromPxY = (py) => 1 - (py / (height - 1)) * 2;

  const layers = Array.isArray(source.layers) ? source.layers : [];
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const layerSeed = (seed + li * 7919) | 0;
    if (!layer || layer.enabled === false) continue;

    if (layer.kind === 'lane') {
      applyLane(layer, { width, height, gain, toPxX, toPxY, fromPxX, fromPxY });
      continue;
    }
    if (layer.kind === 'void') {
      applyVoid(layer, { width, height, gain, toPxX, toPxY, fromPxX, fromPxY });
      continue;
    }

    applyCloud(layer, layerSeed, { width, height, rgb, toPxX, toPxY, fromPxX, fromPxY });
  }

  // Occlusion and protected void apply to everything authored above them.
  for (let p = 0, n = width * height; p < n; p++) {
    const g = gain[p];
    if (g >= 0.99999) continue;
    const i = p * 3;
    rgb[i] *= g; rgb[i + 1] *= g; rgb[i + 2] *= g;
  }

  finishPlate(rgb, width, height, source);
  return { rgb, width, height };
}

/**
 * The authored large-scale form: an ellipsoidal mass, or a swept shell band.
 *
 * The envelope is a PLATEAU, not a bell. `edge` is the fraction of the form over which it falls
 * away; inside that the envelope is a flat 1. This matters more than it looks: with a bell, the
 * envelope always crosses the density threshold before the noise does, so every mass ends up an
 * ellipse with soft sides — the camera-facing soft disc the rejection register bans. With a
 * plateau, the threshold is crossed by the NOISE, so the silhouette is torn and lobed and the
 * authored ellipse only says where the material may be.
 */
function layerEnvelope(wx, wy, layer) {
  const [lx, ly] = localEllipse(wx, wy, layer);
  const edge = Math.max(0.02, Math.min(1, Number.isFinite(layer.edge) ? layer.edge : 1));
  const falloff = Number.isFinite(layer.falloff) ? layer.falloff : 2.0;
  if (layer.kind === 'arc') {
    const r = Math.hypot(lx, ly);
    const halfSpan = Math.max(0.02, Number.isFinite(layer.halfSpan) ? layer.halfSpan : Math.PI);
    let delta = Math.atan2(ly, lx) - (Number.isFinite(layer.arcCenter) ? layer.arcCenter : 0);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) > halfSpan) return 0;
    const bandWidth = Math.max(1e-4, (layer.width || 0.08) / Math.max(1e-5, layer.radius || 0.5));
    const across = Math.abs(r - 1) / bandWidth;
    if (across > 2.2) return 0;
    const t = 0.5 + delta / (2 * halfSpan);
    const taper = Number.isFinite(layer.taper) ? layer.taper : 1.4;
    const band = Math.pow(Math.min(1, (1 - across / 2.2) / edge), falloff);
    return Math.max(0, band) * Math.pow(Math.sin(Math.PI * t), taper);
  }
  const d = Math.hypot(lx, ly);
  if (d >= 1) return 0;
  return Math.pow(Math.max(0, Math.min(1, (1 - d) / edge)), falloff);
}

/**
 * Light a cloud layer. Two passes: rasterise the density field into a local buffer, then shade it
 * by marching two steps toward the light and reading that buffer back.
 *
 * The march is what makes this matter rather than haze. A lobe that has cloud between it and the
 * light goes dark; a lobe facing the light keeps a bright edge. That produces the deep canyons and
 * lit rims a real dust mass has, from ONE authored form — instead of the soft ellipse that the
 * rejection register calls a blurry stand-in.
 */
function applyCloud(layer, seed, ctx) {
  const { width, height, rgb, toPxX, toPxY, fromPxX, fromPxY } = ctx;
  const smooth = layer.kind === 'glow';
  const amount = Number.isFinite(layer.gain) ? layer.gain : 0.5;
  const body = hexToRgb(layer.color, [1, 1, 1]);
  const shadowColor = hexToRgb(layer.shadowColor,
    [body[0] * 0.14, body[1] * 0.16, body[2] * 0.22]);
  const rimColor = hexToRgb(layer.rimColor, hexToRgb(layer.coreColor, body));
  const rimGain = Number.isFinite(layer.rimGain) ? layer.rimGain : (smooth ? 0 : 0.45);
  const rimPow = Number.isFinite(layer.rimPow) ? layer.rimPow : 3.0;
  const absorb = Number.isFinite(layer.absorb) ? layer.absorb : 4.2;
  const lightAngle = Number.isFinite(layer.lightAngle) ? layer.lightAngle : 2.35;
  const lightStep = Number.isFinite(layer.lightStep) ? layer.lightStep : 0.040;
  const lo = Number.isFinite(layer.thresholdLo) ? layer.thresholdLo : 0.06;
  const hi = Number.isFinite(layer.thresholdHi) ? layer.thresholdHi : 0.52;
  const lx = Math.cos(lightAngle) * lightStep;
  const ly = Math.sin(lightAngle) * lightStep;

  const padded = layer.kind === 'arc'
    ? { ...layer, radius: (layer.radius || 0.5) + (layer.width || 0.1) * 3.2 }
    : layer;
  const bounds = ellipseBounds(padded, 1.05);
  const x0 = Math.max(0, Math.floor(toPxX(bounds[0])));
  const x1 = Math.min(width - 1, Math.ceil(toPxX(bounds[2])));
  const y0 = Math.max(0, Math.floor(toPxY(bounds[3])));
  const y1 = Math.min(height - 1, Math.ceil(toPxY(bounds[1])));
  if (x1 < x0 || y1 < y0) return;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const density = new Float32Array(bw * bh);

  for (let py = y0; py <= y1; py++) {
    const wy = fromPxY(py);
    for (let px = x0; px <= x1; px++) {
      const wx = fromPxX(px);
      const env = layerEnvelope(wx, wy, layer);
      if (env <= 1e-4) continue;
      density[(py - y0) * bw + (px - x0)] = smooth ? env : cloudDensity(wx, wy, layer, seed, env);
    }
  }

  // Bilinear read of the local density buffer; anything outside the mass is genuinely empty.
  const sampleDensity = (wx, wy) => {
    const fx = toPxX(wx) - x0;
    const fy = toPxY(wy) - y0;
    if (fx < 0 || fy < 0 || fx > bw - 1 || fy > bh - 1) return 0;
    const ix = Math.floor(fx); const iy = Math.floor(fy);
    const tx = fx - ix; const ty = fy - iy;
    const ix1 = Math.min(bw - 1, ix + 1); const iy1 = Math.min(bh - 1, iy + 1);
    const a = density[iy * bw + ix]; const b = density[iy * bw + ix1];
    const c = density[iy1 * bw + ix]; const d = density[iy1 * bw + ix1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };

  const coreRadius = Number.isFinite(layer.coreRadius) ? layer.coreRadius : 0;
  const coreGain = Number.isFinite(layer.coreGain) ? layer.coreGain : 0;
  const coreColor = hexToRgb(layer.coreColor, body);

  for (let py = y0; py <= y1; py++) {
    const wy = fromPxY(py);
    for (let px = x0; px <= x1; px++) {
      const D = density[(py - y0) * bw + (px - x0)];
      let core = 0;
      const wx = fromPxX(px);
      if (coreRadius > 0 && coreGain > 0 && layer.kind !== 'arc') {
        const [ex, ey] = localEllipse(wx, wy, layer);
        const cd2 = (ex * ex + ey * ey) / (coreRadius * coreRadius);
        if (cd2 < 1) core = coreGain * Math.pow(1 - cd2, 3);
      }
      if (D <= 1e-4 && core <= 1e-5) continue;
      const alpha = smooth ? D : smoothstep(lo, hi, D);
      let value = alpha * amount;
      const i = (py * width + px) * 3;
      if (value > 1e-5) {
        let lit = 1;
        if (!smooth) {
          const d1 = sampleDensity(wx + lx, wy + ly);
          const d2 = sampleDensity(wx + lx * 2.1, wy + ly * 2.1);
          lit = Math.exp(-absorb * (d1 + 0.55 * d2));
        }
        const rim = rimGain > 0 ? rimGain * Math.pow(lit, rimPow) : 0;
        rgb[i] += (shadowColor[0] + (body[0] - shadowColor[0]) * lit + rimColor[0] * rim) * value;
        rgb[i + 1] += (shadowColor[1] + (body[1] - shadowColor[1]) * lit + rimColor[1] * rim) * value;
        rgb[i + 2] += (shadowColor[2] + (body[2] - shadowColor[2]) * lit + rimColor[2] * rim) * value;
      }
      if (core > 1e-5) {
        // The hot core is embedded IN the cloud: a gap in the dust still lets less of it through.
        const seen = core * (0.35 + 0.65 * alpha);
        rgb[i] += coreColor[0] * seen;
        rgb[i + 1] += coreColor[1] * seen;
        rgb[i + 2] += coreColor[2] * seen;
      }
    }
  }
}

function applyLane(layer, ctx) {
  const { width, height, gain, toPxX, toPxY, fromPxX, fromPxY } = ctx;
  const points = Array.isArray(layer.points) ? layer.points : [];
  if (points.length < 2) return;
  const widths = Array.isArray(layer.widths) ? layer.widths : [];
  const strength = Math.max(0, Math.min(1, Number.isFinite(layer.strength) ? layer.strength : 0.5));
  const feather = Number.isFinite(layer.feather) ? layer.feather : 2.2;
  let maxW = 0;
  for (let i = 0; i < points.length; i++) maxW = Math.max(maxW, widths[i] ?? 0.08);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const pad = maxW * 3.2;
  const x0 = Math.max(0, Math.floor(toPxX(minX - pad)));
  const x1 = Math.min(width - 1, Math.ceil(toPxX(maxX + pad)));
  const y0 = Math.max(0, Math.floor(toPxY(maxY + pad)));
  const y1 = Math.min(height - 1, Math.ceil(toPxY(minY - pad)));
  for (let py = y0; py <= y1; py++) {
    const wy = fromPxY(py);
    for (let px = x0; px <= x1; px++) {
      const wx = fromPxX(px);
      let best = Infinity;
      let bestU = 0;
      for (let s = 0; s < points.length - 1; s++) {
        const [d, t] = segmentDistance(wx, wy, points[s][0], points[s][1], points[s + 1][0], points[s + 1][1]);
        const w = ((widths[s] ?? 0.08) * (1 - t) + (widths[s + 1] ?? 0.08) * t);
        const dn = d / Math.max(1e-5, w);
        if (dn < best) { best = dn; bestU = (s + t) / (points.length - 1); }
      }
      if (best > 3.2) continue;
      // Both ends of a lane dissolve; a dust lane never terminates on a straight edge.
      const ends = Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, bestU))), 0.65);
      // A smooth stroke reads as ink. Break the lane's own density up so it reads as dust that
      // happens to lie along a path: ragged edges, thin patches, a few places it clears entirely.
      const grain = Number.isFinite(layer.grain) ? layer.grain : 3.4;
      const roughness = Number.isFinite(layer.roughness) ? layer.roughness : 0.65;
      const tex = billow(wx * grain, wy * grain, (layer.seed | 0) ^ 0x3c17, 5);
      const broken = (1 - roughness) + roughness * Math.max(0, Math.min(1, tex * 2.4 - 0.35));
      const occl = strength * Math.exp(-best * best * feather) * ends * broken;
      if (occl <= 1e-4) continue;
      const p = py * width + px;
      gain[p] *= (1 - occl);
    }
  }
}

function applyVoid(layer, ctx) {
  const { width, height, gain, toPxX, toPxY, fromPxX, fromPxY } = ctx;
  const strength = Math.max(0, Math.min(1, Number.isFinite(layer.strength) ? layer.strength : 1));
  const falloff = Number.isFinite(layer.falloff) ? layer.falloff : 1.2;
  const bounds = ellipseBounds(layer, 1.02);
  const x0 = Math.max(0, Math.floor(toPxX(bounds[0])));
  const x1 = Math.min(width - 1, Math.ceil(toPxX(bounds[2])));
  const y0 = Math.max(0, Math.floor(toPxY(bounds[3])));
  const y1 = Math.min(height - 1, Math.ceil(toPxY(bounds[1])));
  for (let py = y0; py <= y1; py++) {
    const wy = fromPxY(py);
    for (let px = x0; px <= x1; px++) {
      const wx = fromPxX(px);
      const [lx, ly] = localEllipse(wx, wy, layer);
      const d2 = lx * lx + ly * ly;
      if (d2 >= 1) continue;
      const env = Math.pow(1 - d2, falloff);
      const p = py * width + px;
      gain[p] *= (1 - strength * env);
    }
  }
}

const BAYER8 = (() => {
  const m = new Float32Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let v = 0; let mask = 4; let bit = 0;
      let xc = x; let yc = y;
      while (mask > 0) {
        v |= (((yc ^ xc) & mask) ? 1 : 0) << (bit * 2);
        v |= ((yc & mask) ? 1 : 0) << (bit * 2 + 1);
        mask >>= 1; bit++;
      }
      m[y * 8 + x] = v / 64 - 0.5;
    }
  }
  return m;
})();

/** Floor, protected edge fade, highlight knee. Called by renderDeepSkyPlate; separate for clarity. */
function finishPlate(rgb, width, height, source) {
  const floor = Array.isArray(source.floor) ? source.floor : [0.018, 0.024, 0.033];
  const fade = Math.max(0, Math.min(0.45, Number.isFinite(source.edgeFade) ? source.edgeFade : 0.11));
  const exposure = Number.isFinite(source.exposure) ? source.exposure : 1;
  const knee = Math.max(0.05, Math.min(0.98, Number.isFinite(source.knee) ? source.knee : 0.72));
  for (let py = 0; py < height; py++) {
    const v = height > 1 ? py / (height - 1) : 0.5;
    const ey = fade > 0 ? smoothstep(0, fade, Math.min(v, 1 - v)) : 1;
    for (let px = 0; px < width; px++) {
      const u = width > 1 ? px / (width - 1) : 0.5;
      const ex = fade > 0 ? smoothstep(0, fade, Math.min(u, 1 - u)) : 1;
      // Edge-fade toward the FLOOR, not toward black: the wrap/clamp boundary then has no step.
      const k = ex * ey;
      const i = (py * width + px) * 3;
      for (let c = 0; c < 3; c++) {
        let value = floor[c] + rgb[i + c] * k;
        value *= exposure;
        if (value > knee) {
          value = knee + (1 - knee) * (1 - Math.exp(-(value - knee) / Math.max(1e-4, 1 - knee)));
        }
        rgb[i + c] = Math.max(0, Math.min(1, value));
      }
    }
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-9, b - a)));
  return t * t * (3 - 2 * t);
}

/** Quantise with a deterministic 8x8 ordered dither, so the dark base never bands. */
export function quantisePlate(rgb, width, height) {
  const out = Buffer.allocUnsafe(width * height * 3);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const d = BAYER8[(py & 7) * 8 + (px & 7)];
      const i = (py * width + px) * 3;
      for (let c = 0; c < 3; c++) {
        const v = rgb[i + c] * 255 + d;
        out[i + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Measurement — the composition budget, calibrated on the reviewed helios plate.
// ---------------------------------------------------------------------------------------------

export const CORRIDOR = Object.freeze({ xMax: 0.55, yMin: 0.5 });   // fractions: left 55%, bottom 50%

/**
 * Luminance statistics for one plate. `corridorCoverage05` is the share of the lower-left play
 * corridor above a visible threshold: the number that keeps the sky out of the fight.
 */
export function measurePlate(rgb8, width, height) {
  const n = width * height;
  const lum = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 3;
    lum[p] = (0.2126 * rgb8[i] + 0.7152 * rgb8[i + 1] + 0.0722 * rgb8[i + 2]) / 255;
  }
  let above10 = 0; let above25 = 0; let sum = 0;
  for (let p = 0; p < n; p++) {
    sum += lum[p];
    if (lum[p] > 0.10) above10++;
    if (lum[p] > 0.25) above25++;
  }
  const sorted = Float32Array.from(lum).sort();
  const median = sorted[n >> 1];
  const corridorX = Math.max(1, Math.floor(width * CORRIDOR.xMax));
  const corridorY0 = Math.floor(height * CORRIDOR.yMin);
  let corridorAbove = 0; let corridorCount = 0;
  for (let py = corridorY0; py < height; py++) {
    for (let px = 0; px < corridorX; px++) {
      corridorCount++;
      if (lum[py * width + px] > 0.05) corridorAbove++;
    }
  }
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.02));
  let edgeSum = 0; let edgeCount = 0;
  for (let py = 0; py < height; py++) {
    const vertical = py < band || py >= height - band;
    for (let px = 0; px < width; px++) {
      if (!vertical && px >= band && px < width - band) continue;
      edgeSum += lum[py * width + px];
      edgeCount++;
    }
  }
  const quadrant = (qx, qy) => {
    let qsum = 0; let qn = 0;
    const px0 = qx ? width >> 1 : 0; const px1 = qx ? width : width >> 1;
    const py0 = qy ? height >> 1 : 0; const py1 = qy ? height : height >> 1;
    for (let py = py0; py < py1; py++) for (let px = px0; px < px1; px++) { qsum += lum[py * width + px]; qn++; }
    return round4(qsum / Math.max(1, qn));
  };
  return {
    mean: round4(sum / n),
    median: round4(median),
    coverage10: round4(above10 / n),
    coverage25: round4(above25 / n),
    corridorCoverage05: round4(corridorAbove / Math.max(1, corridorCount)),
    edgeMean: round4(edgeSum / Math.max(1, edgeCount)),
    quadrantMean: {
      upperLeft: quadrant(0, 0), upperRight: quadrant(1, 0),
      lowerLeft: quadrant(0, 1), lowerRight: quadrant(1, 1),
    },
  };
}

function round4(v) { return Math.round(v * 10000) / 10000; }

export const DEFAULT_BUDGETS = Object.freeze({
  median: 0.06,
  coverage10: 0.32,
  coverage25: 0.16,
  corridorCoverage05: 0.02,
  edgeMean: 0.05,
});

/** Returns an array of human-readable budget violations; empty means the plate may ship. */
export function checkPlateBudget(stats, budgets = DEFAULT_BUDGETS) {
  const limits = { ...DEFAULT_BUDGETS, ...(budgets || {}) };
  const failures = [];
  for (const key of Object.keys(DEFAULT_BUDGETS)) {
    if (stats[key] > limits[key]) {
      failures.push(`${key} ${stats[key]} exceeds budget ${limits[key]}`);
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------
// Minimal PNG codec (8-bit RGB, no interlace). Encode is adaptive-filtered; decode is used by the
// test so the SHIPPED bytes, not a re-render, are what the composition budget is measured against.
// ---------------------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer) {
  let c = ~0;
  for (let i = 0; i < buffer.length; i++) {
    c ^= buffer[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function encodePng(rgb8, width, height) {
  const bpp = 3;
  const stride = width * bpp;
  const raw = Buffer.allocUnsafe((stride + 1) * height);
  const candidates = [Buffer.allocUnsafe(stride), Buffer.allocUnsafe(stride), Buffer.allocUnsafe(stride),
    Buffer.allocUnsafe(stride), Buffer.allocUnsafe(stride)];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const line = rgb8.subarray(y * stride, (y + 1) * stride);
    let best = 0; let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = candidates[f];
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? line[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        let v;
        if (f === 0) v = line[x];
        else if (f === 1) v = line[x] - a;
        else if (f === 2) v = line[x] - b;
        else if (f === 3) v = line[x] - ((a + b) >> 1);
        else v = line[x] - paeth(a, b, c);
        v &= 255;
        out[x] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    raw[y * (stride + 1)] = best;
    candidates[best].copy(raw, y * (stride + 1) + 1);
    prev = Buffer.from(line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** Decode an 8-bit non-interlaced PNG (RGB or RGBA) to { rgb8, width, height, channels }. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0; let height = 0; let colorType = 2; let bitDepth = 8;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : -1;
  if (channels < 0) throw new Error(`unsupported PNG color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.allocUnsafe(width * height * 3);
  const line = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = src[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      line[x] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 3;
      out[d] = line[s];
      out[d + 1] = channels === 1 ? line[s] : line[s + 1];
      out[d + 2] = channels === 1 ? line[s] : line[s + 2];
    }
    prev = Buffer.from(line);
  }
  return { rgb8: out, width, height, channels };
}

// ---------------------------------------------------------------------------------------------
// Residency
// ---------------------------------------------------------------------------------------------

/** Exact RGBA8 residency with the full mip tail — the number the runtime budget is set from. */
export function plateResidentBytes(width, height) {
  let w = width; let h = height; let bytes = 0;
  while (w >= 1 && h >= 1) {
    bytes += w * h * 4;
    if (w === 1 && h === 1) break;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  return bytes;
}

export function isPowerOfTwo(v) { return v > 0 && (v & (v - 1)) === 0; }

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export function loadSources(only = null) {
  if (!existsSync(SOURCE_DIR)) return [];
  return readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const source = JSON.parse(readFileSync(resolve(SOURCE_DIR, f), 'utf8'));
      source.id = source.id || basename(f, '.json');
      source.__file = `assets/background/deep-sky/sources/${f}`;
      return source;
    })
    .filter((s) => !only || only.includes(s.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }

function main(argv) {
  const only = (argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
  const checkOnly = argv.includes('--check');
  const quiet = argv.includes('--quiet');
  const log = (...a) => { if (!quiet) console.log(...a); };

  const sources = loadSources(only.length ? only : null);
  if (!sources.length) {
    console.error(`No plate sources found in ${SOURCE_DIR}`);
    return 1;
  }
  mkdirSync(PLATE_DIR, { recursive: true });

  const entries = [];
  let failed = 0;
  for (const source of sources) {
    const started = Date.now();
    const { rgb, width, height } = renderDeepSkyPlate(source);
    if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) {
      console.error(`FAIL ${source.id}: ${width}x${height} is not power-of-two (the mip chain must halve cleanly)`);
      failed++;
      continue;
    }
    const rgb8 = quantisePlate(rgb, width, height);
    const stats = measurePlate(rgb8, width, height);
    const violations = checkPlateBudget(stats, source.budgets);
    if (violations.length) {
      console.error(`FAIL ${source.id}: composition budget exceeded`);
      for (const v of violations) console.error(`     ${v}`);
      failed++;
      continue;
    }
    const png = encodePng(rgb8, width, height);
    const file = `assets/background/deep-sky/${source.id}.png`;
    const target = resolve(REPO_ROOT, file);
    const existing = existsSync(target) ? readFileSync(target) : null;
    const changed = !existing || !existing.equals(png);
    if (changed && checkOnly) {
      console.error(`FAIL ${source.id}: shipped PNG differs from a fresh bake (run without --check)`);
      failed++;
    } else if (changed) {
      writeFileSync(target, png);
    }
    entries.push({
      id: source.id,
      title: source.title || source.id,
      file,
      source: source.__file,
      width,
      height,
      sha256: sha256(png),
      fileBytes: png.length,
      residentBytes: plateResidentBytes(width, height),
      stats,
      budgets: { ...DEFAULT_BUDGETS, ...(source.budgets || {}) },
    });
    log(`${changed ? 'baked ' : 'stable'} ${source.id}  ${width}x${height}  `
      + `${(png.length / 1048576).toFixed(2)} MB file  ${(plateResidentBytes(width, height) / 1048576).toFixed(2)} MB resident  `
      + `cov10 ${stats.coverage10}  corridor ${stats.corridorCoverage05}  ${Date.now() - started} ms`);
  }

  for (const imported of IMPORTED_PLATES) {
    const target = resolve(REPO_ROOT, imported.file);
    if (!existsSync(target)) { console.error(`FAIL imported plate missing: ${imported.file}`); failed++; continue; }
    const bytes = readFileSync(target);
    const { rgb8, width, height } = decodePng(bytes);
    const stats = measurePlate(rgb8, width, height);
    const violations = checkPlateBudget(stats);
    if (violations.length) {
      console.error(`FAIL ${imported.id}: composition budget exceeded`);
      for (const v of violations) console.error(`     ${v}`);
      failed++;
    }
    entries.push({
      id: imported.id,
      title: imported.title,
      file: imported.file,
      source: null,
      imported: true,
      note: imported.note,
      width,
      height,
      sha256: sha256(bytes),
      fileBytes: bytes.length,
      residentBytes: plateResidentBytes(width, height),
      stats,
      budgets: { ...DEFAULT_BUDGETS },
    });
    log(`import ${imported.id}  ${width}x${height}  `
      + `${(bytes.length / 1048576).toFixed(2)} MB file  ${(plateResidentBytes(width, height) / 1048576).toFixed(2)} MB resident  `
      + `cov10 ${stats.coverage10}  corridor ${stats.corridorCoverage05}`);
  }

  if (failed) {
    console.error(`${failed} plate(s) failed; manifest not written.`);
    return 1;
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const manifest = {
    schema: 'spaceface.deepSkyPlateManifest.v1',
    generator: 'tools/art/bake_deep_sky_plates.mjs',
    note: 'Regenerate with `node tools/art/bake_deep_sky_plates.mjs`. Verify with --check.',
    corridor: CORRIDOR,
    defaultBudgets: DEFAULT_BUDGETS,
    peakResidentBytes: maxPairResidency(entries),
    plates: entries,
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (checkOnly) {
    const current = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error('FAIL manifest.json differs from a fresh bake');
      return 1;
    }
  } else {
    writeFileSync(MANIFEST_PATH, text);
  }
  log(`${entries.length} plates; peak residency (active + incoming) `
    + `${(manifest.peakResidentBytes / 1048576).toFixed(2)} MB`);
  return 0;
}

/** The runtime keeps at most one active plate plus one incoming: the worst pair is the real peak. */
function maxPairResidency(entries) {
  const sorted = entries.map((e) => e.residentBytes).sort((a, b) => b - a);
  return (sorted[0] || 0) + (sorted[1] || 0);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
