// SpaceFace — baked 3D noise volume for the raymarched engine plume.
//
// The plume shader needs two fields, and both have to be sampled dozens of times per pixel, so
// neither can be evaluated analytically at runtime:
//
//   RGB  a divergence-free curl field, used to domain-warp the density coordinate. This is what
//        makes exhaust filaments braid and roll around each other. A gradient field would push
//        everything outward and read as smoke; only a curl field swirls.
//   A    the finished ridged-FBM filament field — crests already sharpened and veins already cut.
//
// The alpha channel used to hold plain value noise and the shader ran a three-octave ridged FBM
// over it. That cost three 3D texture fetches per raymarch sample, and measurement showed the march
// is texture-fetch bound, not ALU bound: those two extra fetches were most of the shader's cost.
// Baking the octaves down to one channel makes a sample one fetch. It is exactly the same field —
// the ridge and the octave weights moved from the inner loop to init, where they are paid once.
//
// Both fields tile, so the shader can scroll the sample coordinate downstream forever without a
// seam and without growing the texture. The bake runs once per process during VFX init (inside the
// loading shell, never during flight) and the result is shared by every plume system.

import * as THREE from 'three';

// 64^3 RGBA8 is 1 MB. Bigger than it needs to be for the curl field, and exactly what the baked
// filament field needs: with the octaves now resolved into the texture rather than re-sampled at
// three scales in the shader, the finest octave has to actually fit in the grid.
const VOLUME_SIZE = 64;

// Curl needs a smooth potential: the warp field is differentiated, so the potential must be at
// least C1 or the swirl shows lattice creases. Two low octaves give large coherent eddies; the
// fine structure comes from the filament field, not from the warp.
const POTENTIAL_PERIOD = 3;
const POTENTIAL_OCTAVES = 2;

// Filament field octaves. Periods must be integers, or the field stops tiling and the shader's
// endless downstream scroll shows a seam. Two octaves at a 1:2 ratio with a steep 0.42 falloff:
// the second contributes about a fifth, which is the grain on the strands. A third at period 24
// would land near the texel grid and alias into sparkle at gameplay framing, which is the exact
// speckle this replaced.
const FILAMENT_PERIODS = [6, 12];
const FILAMENT_GAIN = 0.42;

function hashLattice(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
    ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function wrap(i, period) {
  const m = i % period;
  return m < 0 ? m + period : m;
}

// Quintic fade: C2 continuous, so the curl derived from this stays smooth instead of showing the
// lattice as faceted ridges.
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Tileable 3D value noise. `u,v,w` are in [0,1); the lattice wraps every `period` cells. */
function valueNoise(u, v, w, period, seed) {
  const x = u * period;
  const y = v * period;
  const z = w * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const sx = fade(x - xi);
  const sy = fade(y - yi);
  const sz = fade(z - zi);
  const x0 = wrap(xi, period);
  const y0 = wrap(yi, period);
  const z0 = wrap(zi, period);
  const x1 = wrap(xi + 1, period);
  const y1 = wrap(yi + 1, period);
  const z1 = wrap(zi + 1, period);

  const n000 = hashLattice(x0, y0, z0, seed);
  const n100 = hashLattice(x1, y0, z0, seed);
  const n010 = hashLattice(x0, y1, z0, seed);
  const n110 = hashLattice(x1, y1, z0, seed);
  const n001 = hashLattice(x0, y0, z1, seed);
  const n101 = hashLattice(x1, y0, z1, seed);
  const n011 = hashLattice(x0, y1, z1, seed);
  const n111 = hashLattice(x1, y1, z1, seed);

  const a = n000 + (n100 - n000) * sx;
  const b = n010 + (n110 - n010) * sx;
  const c = n001 + (n101 - n001) * sx;
  const d = n011 + (n111 - n011) * sx;
  const e = a + (b - a) * sy;
  const f = c + (d - c) * sy;
  return e + (f - e) * sz;
}

function fbm(u, v, w, basePeriod, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(u, v, w, period, seed + o * 101) * amp;
    norm += amp;
    period *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

/**
 * Ridged FBM: `1 - |2n-1|` folds the noise so its midline becomes a crest, and squaring sharpens
 * that crest while deepening the gap either side. That fold is the whole reason the plume reads as
 * distinct strands with dark veins between them rather than as a cloud of smoke.
 */
function ridgedFilament(u, v, w) {
  let sum = 0;
  let norm = 0;
  let amp = 0.5;
  for (let o = 0; o < FILAMENT_PERIODS.length; o++) {
    const n = valueNoise(u, v, w, FILAMENT_PERIODS[o], 199 + o * 313);
    const ridge = 1 - Math.abs(n * 2 - 1);
    sum += ridge * ridge * amp;
    norm += amp;
    amp *= FILAMENT_GAIN;
  }
  return sum / norm;
}

/**
 * Curl of a scalar-triple potential, by central difference on the baked grid.
 *
 * curl(A) is divergence-free by construction, which is the whole point: warping a density field by
 * a divergence-free vector field stirs it without compressing or inflating it, so filaments braid
 * instead of bunching into blobs.
 */
function bakeCurlInto(out, pot, n) {
  const nn = n * n;
  const idx = (x, y, z) => (wrap(z, n) * nn) + (wrap(y, n) * n) + wrap(x, n);
  const [ax, ay, az] = pot;
  let peak = 1e-6;
  const cx = new Float32Array(n * nn);
  const cy = new Float32Array(n * nn);
  const cz = new Float32Array(n * nn);

  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (z * nn) + (y * n) + x;
        const dAzdy = (az[idx(x, y + 1, z)] - az[idx(x, y - 1, z)]) * 0.5;
        const dAydz = (ay[idx(x, y, z + 1)] - ay[idx(x, y, z - 1)]) * 0.5;
        const dAxdz = (ax[idx(x, y, z + 1)] - ax[idx(x, y, z - 1)]) * 0.5;
        const dAzdx = (az[idx(x + 1, y, z)] - az[idx(x - 1, y, z)]) * 0.5;
        const dAydx = (ay[idx(x + 1, y, z)] - ay[idx(x - 1, y, z)]) * 0.5;
        const dAxdy = (ax[idx(x, y + 1, z)] - ax[idx(x, y - 1, z)]) * 0.5;
        const vx = dAzdy - dAydz;
        const vy = dAxdz - dAzdx;
        const vz = dAydx - dAxdy;
        cx[i] = vx; cy[i] = vy; cz[i] = vz;
        const m = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz));
        if (m > peak) peak = m;
      }
    }
  }

  // Normalize to the byte range so the shader can decode with a plain *2-1 and get a unit-ish
  // swirl regardless of the potential's arbitrary amplitude.
  const scale = 0.5 / peak;
  for (let i = 0; i < n * nn; i++) {
    const o = i * 4;
    out[o] = Math.max(0, Math.min(255, Math.round((cx[i] * scale + 0.5) * 255)));
    out[o + 1] = Math.max(0, Math.min(255, Math.round((cy[i] * scale + 0.5) * 255)));
    out[o + 2] = Math.max(0, Math.min(255, Math.round((cz[i] * scale + 0.5) * 255)));
  }
}

let sharedTexture = null;
let sharedRefs = 0;
let lastBakeMs = 0;
let bakeCount = 0;

function bakeVolumeTexture(THREE_NS) {
  const T = THREE_NS || THREE;
  const n = VOLUME_SIZE;
  const nn = n * n;
  const count = n * nn;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const pot = [new Float32Array(count), new Float32Array(count), new Float32Array(count)];
  for (let z = 0; z < n; z++) {
    const w = z / n;
    for (let y = 0; y < n; y++) {
      const v = y / n;
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const i = (z * nn) + (y * n) + x;
        pot[0][i] = fbm(u, v, w, POTENTIAL_PERIOD, POTENTIAL_OCTAVES, 11);
        pot[1][i] = fbm(u, v, w, POTENTIAL_PERIOD, POTENTIAL_OCTAVES, 37);
        pot[2][i] = fbm(u, v, w, POTENTIAL_PERIOD, POTENTIAL_OCTAVES, 71);
      }
    }
  }

  const data = new Uint8Array(count * 4);
  bakeCurlInto(data, pot, n);

  for (let z = 0; z < n; z++) {
    const w = z / n;
    for (let y = 0; y < n; y++) {
      const v = y / n;
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const i = (z * nn) + (y * n) + x;
        const d = ridgedFilament(u, v, w);
        data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(d * 255)));
      }
    }
  }

  const tex = new T.Data3DTexture(data, n, n, n);
  tex.format = T.RGBAFormat;
  tex.type = T.UnsignedByteType;
  // Mipmaps are not an optimisation here, they are what makes a cheap march look clean. Step count
  // is capped by a sample budget, so at close framing the steps are wider than the field's finest
  // features and point-sampling them turns filaments into crawling speckle. The shader picks the
  // mip that matches its step size, so the field is band-limited to what the march can resolve
  // instead of being aliased by it.
  tex.generateMipmaps = true;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.RepeatWrapping;
  tex.wrapR = T.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.name = 'sf-plume-noise-volume';

  const finished = typeof performance !== 'undefined' ? performance.now() : Date.now();
  lastBakeMs = finished - started;
  bakeCount++;
  return tex;
}

/**
 * Acquire the shared plume noise volume, baking it on first use.
 *
 * Every caller must pair this with `releasePlumeNoiseVolume()`. The texture outlives individual
 * plume systems on purpose: re-baking costs ~150 ms and the field is identical for every engine.
 */
export function acquirePlumeNoiseVolume(THREE_NS = THREE) {
  if (!sharedTexture) sharedTexture = bakeVolumeTexture(THREE_NS);
  sharedRefs++;
  return sharedTexture;
}

export function releasePlumeNoiseVolume() {
  if (!sharedTexture) return;
  sharedRefs = Math.max(0, sharedRefs - 1);
  if (sharedRefs > 0) return;
  sharedTexture.dispose();
  sharedTexture = null;
}

export function inspectPlumeNoiseVolume() {
  return {
    size: VOLUME_SIZE,
    baked: !!sharedTexture,
    refs: sharedRefs,
    bakes: bakeCount,
    bakeMs: lastBakeMs,
    bytes: VOLUME_SIZE * VOLUME_SIZE * VOLUME_SIZE * 4,
    channels: 'rgb=curl,a=ridged-filaments',
  };
}

export const PLUME_VOLUME_SIZE = VOLUME_SIZE;

// Exported for the unit gate: the bake is pure, so its field properties are testable without a GPU.
export const __testables = { valueNoise, fbm, ridgedFilament, hashLattice, bakeCurlInto, wrap, fade };
