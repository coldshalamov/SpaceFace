#!/usr/bin/env node
// Offline gas-volume authoring bake.  GAS / SMOKE / DUST lane.
//
//   node tools/bake-gas-volumes.mjs            re-bake and rewrite the runtime payload
//   node tools/bake-gas-volumes.mjs --verify    re-bake and FAIL if the payload would change
//
// WHAT THIS IS
// ------------
// A deterministic, re-runnable fluid solve.  The editable simulation inputs live in
// assets/vfx/gas-sim/*.json; this script turns them into one packed runtime module,
// src/render/combat/gas/gasVolumeData.js.  Edit the JSON, re-run, commit both.
//
// Blender/Mantaflow is the standard's named source-art route (VFX_TECHNIQUE_STANDARD.md M4,
// tools/AGENTS.md, assets/AGENTS.md).  Blender is not drivable from this lane's environment, so
// this is the standard's accepted alternative: a scripted, deterministic, re-runnable solver.
// It is a real transport solve - semi-Lagrangian advection, incompressible pressure projection,
// compact injection, thermal/condensation chemistry - not hash noise dressed as smoke.  No RNG is
// used anywhere: the same inputs always produce byte-identical output, which --verify asserts.
//
// WHY FOUR SOLVES AND NOT ONE
// ---------------------------
// The shipped 48^3 film (src/render/combat/densityVolumeData.js) is ONE body tinted two ways by
// the explosion buckets.  Combustion, fracture dust, pressurised coolant and environmental
// particulate are different MATTER, so they get different force terms, different dissipation
// ratios and a differently-meaning second channel:
//
//   family                aux channel    behaviour that distinguishes it
//   combustion-bloom      temperature    thermal expansion; heat decays ~8x faster than density,
//                                        so cavities open cold inside a still-dense body
//   fracture-dust         grain          no thermal drive, heavy drag, a sharpening term that
//                                        lets material clump; coarse grain falls out first
//   coolant-plume         condensate     sustained narrow nozzle; aux is ZERO at the breach and
//                                        grows downstream - the inverse of combustion
//   environmental-drift   particulate    large lobes with authored openings, slow vortex pair
//
// COST DISCIPLINE
// ---------------
// 32 atlas cells at 32^3, RG8 = 2.00 MiB resident for FOUR families, against 2.53 MiB for the one
// shipped 48^3 film.  Per-frame tight bounds and a coarse motion field (8^3 per cell, 64 KiB) are
// carried in the same payload: the bounds shrink the rasterised proxy and the march span, and the
// motion field gives motion-vector frame interpolation so 8-12 frames do not read as a slideshow.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_DIR = ROOT + 'assets/vfx/gas-sim/';
const OUTPUT = ROOT + 'src/render/combat/gas/gasVolumeData.js';

// Fixed order: the atlas cell offsets are part of the runtime contract, so directory iteration
// order must never decide them.
const RECIPES = ['combustion-bloom', 'fracture-dust', 'coolant-plume', 'environmental-drift'];

const G = 32;                 // density/temperature grid per cell
const MG = 8;                 // motion grid per cell (G/MG must be an integer)
const ATLAS = [4, 4, 2];      // cells across the 3D atlas -> 32 slots, 128 x 128 x 64 texels
const MOTION_MAX_CELLS = 6;   // encoded motion clamp, in G-grid cells per frame interval
const N = G * G * G;
const DX = 2 / G;
const BOUND_EDGE = 0.96;      // solver container; density is forced to zero outside it
const BOUND_SOFT = 0.18;

// ---------------------------------------------------------------------------------------------
// Grid helpers.  Everything is a flat Float32Array in z,y,x order, which matches the tightly
// packed 3D texture convention three.js expects.
// ---------------------------------------------------------------------------------------------

function field() { return new Float32Array(N); }

function axisCoords() {
  const cx = new Float32Array(N), cy = new Float32Array(N), cz = new Float32Array(N);
  for (let z = 0; z < G; z++) {
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = (z * G + y) * G + x;
        cx[i] = (x + 0.5) * DX - 1;
        cy[i] = (y + 0.5) * DX - 1;
        cz[i] = (z + 0.5) * DX - 1;
      }
    }
  }
  return { cx, cy, cz };
}

function boundaryMask(cx, cy, cz) {
  const b = field();
  for (let i = 0; i < N; i++) {
    const far = Math.max(Math.abs(cx[i]), Math.max(Math.abs(cy[i]), Math.abs(cz[i])));
    b[i] = Math.min(1, Math.max(0, (BOUND_EDGE - far) / BOUND_SOFT));
  }
  return b;
}

/** Trilinear read at fractional grid coordinates, clamped at the container walls. */
function sampleAt(src, gx, gy, gz) {
  let x = gx < 0 ? 0 : (gx > G - 1 ? G - 1 : gx);
  let y = gy < 0 ? 0 : (gy > G - 1 ? G - 1 : gy);
  let z = gz < 0 ? 0 : (gz > G - 1 ? G - 1 : gz);
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = x0 + 1 < G ? x0 + 1 : x0, y1 = y0 + 1 < G ? y0 + 1 : y0, z1 = z0 + 1 < G ? z0 + 1 : z0;
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const r0 = z0 * G * G, r1 = z1 * G * G, c0 = y0 * G, c1 = y1 * G;
  const v000 = src[r0 + c0 + x0], v100 = src[r0 + c0 + x1];
  const v010 = src[r0 + c1 + x0], v110 = src[r0 + c1 + x1];
  const v001 = src[r1 + c0 + x0], v101 = src[r1 + c0 + x1];
  const v011 = src[r1 + c1 + x0], v111 = src[r1 + c1 + x1];
  const a = v000 + (v100 - v000) * fx, b = v010 + (v110 - v010) * fx;
  const c = v001 + (v101 - v001) * fx, d = v011 + (v111 - v011) * fx;
  const e = a + (b - a) * fy, f = c + (d - c) * fy;
  return e + (f - e) * fz;
}

function advect(dst, src, vx, vy, vz, dt) {
  const k = dt / DX;
  for (let z = 0; z < G; z++) {
    for (let y = 0; y < G; y++) {
      const row = (z * G + y) * G;
      for (let x = 0; x < G; x++) {
        const i = row + x;
        dst[i] = sampleAt(src, x - vx[i] * k, y - vy[i] * k, z - vz[i] * k);
      }
    }
  }
}

/** One separable [1,2,1]/4 pass.  `scratch` is reused so a bake allocates nothing per step. */
function blurOnce(f, scratch) {
  const S = G, SS = G * G;
  for (let z = 0; z < G; z++) for (let y = 0; y < G; y++) {
    const row = (z * S + y) * S;
    for (let x = 0; x < G; x++) {
      const l = f[row + (x > 0 ? x - 1 : 0)], r = f[row + (x < G - 1 ? x + 1 : G - 1)];
      scratch[row + x] = (l + 2 * f[row + x] + r) * 0.25;
    }
  }
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    const base = z * SS + x;
    for (let y = 0; y < G; y++) {
      const l = scratch[base + (y > 0 ? y - 1 : 0) * S], r = scratch[base + (y < G - 1 ? y + 1 : G - 1) * S];
      f[base + y * S] = (l + 2 * scratch[base + y * S] + r) * 0.25;
    }
  }
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const base = y * S + x;
    for (let z = 0; z < G; z++) {
      const l = f[base + (z > 0 ? z - 1 : 0) * SS], r = f[base + (z < G - 1 ? z + 1 : G - 1) * SS];
      scratch[base + z * SS] = (l + 2 * f[base + z * SS] + r) * 0.25;
    }
  }
  f.set(scratch);
}

/** Blend `amount` of one blur pass into the field in place. `hold` is a second scratch buffer. */
function blurMix(f, amount, scratch, hold) {
  if (!(amount > 0)) return;
  hold.set(f);
  blurOnce(hold, scratch);
  const keep = 1 - amount;
  for (let i = 0; i < N; i++) f[i] = f[i] * keep + hold[i] * amount;
}

function project(vx, vy, vz, boundary, iterations, div, pressure, nextPressure) {
  const S = G, SS = G * G;
  const inv = 1 / (2 * DX);
  for (let z = 0; z < G; z++) for (let y = 0; y < G; y++) {
    const row = (z * S + y) * S;
    for (let x = 0; x < G; x++) {
      const i = row + x;
      const xp = row + (x < G - 1 ? x + 1 : x), xm = row + (x > 0 ? x - 1 : x);
      const yp = i + (y < G - 1 ? S : 0), ym = i - (y > 0 ? S : 0);
      const zp = i + (z < G - 1 ? SS : 0), zm = i - (z > 0 ? SS : 0);
      div[i] = (vx[xp] - vx[xm] + vy[yp] - vy[ym] + vz[zp] - vz[zm]) * inv;
    }
  }
  pressure.fill(0);
  const scale = DX * DX;
  for (let it = 0; it < iterations; it++) {
    for (let z = 0; z < G; z++) for (let y = 0; y < G; y++) {
      const row = (z * S + y) * S;
      for (let x = 0; x < G; x++) {
        const i = row + x;
        const xp = row + (x < G - 1 ? x + 1 : x), xm = row + (x > 0 ? x - 1 : x);
        const yp = i + (y < G - 1 ? S : 0), ym = i - (y > 0 ? S : 0);
        const zp = i + (z < G - 1 ? SS : 0), zm = i - (z > 0 ? SS : 0);
        nextPressure[i] = (pressure[xp] + pressure[xm] + pressure[yp] + pressure[ym]
          + pressure[zp] + pressure[zm] - div[i] * scale) * (1 / 6) * boundary[i];
      }
    }
    pressure.set(nextPressure);
  }
  for (let z = 0; z < G; z++) for (let y = 0; y < G; y++) {
    const row = (z * S + y) * S;
    for (let x = 0; x < G; x++) {
      const i = row + x;
      const xp = row + (x < G - 1 ? x + 1 : x), xm = row + (x > 0 ? x - 1 : x);
      const yp = i + (y < G - 1 ? S : 0), ym = i - (y > 0 ? S : 0);
      const zp = i + (z < G - 1 ? SS : 0), zm = i - (z > 0 ? SS : 0);
      vx[i] -= (pressure[xp] - pressure[xm]) * inv;
      vy[i] -= (pressure[yp] - pressure[ym]) * inv;
      vz[i] -= (pressure[zp] - pressure[zm]) * inv;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The solve
// ---------------------------------------------------------------------------------------------

function solve(recipe) {
  const { cx, cy, cz } = axisCoords();
  const boundary = boundaryMask(cx, cy, cz);
  const rho = field(), aux = field();
  const vx = field(), vy = field(), vz = field();
  const tmpA = field(), tmpB = field(), tmpC = field();
  const scratch = field(), div = field(), pressure = field(), nextPressure = field();
  const sharpen = field();

  // ---- authored source: unequal compact lobes, minus authored cavities ----------------------
  // Squared-radius falloff preserves density shoulders.  Broad overlapping gaussians collapse
  // into a featureless ball, which is exactly the failure the standard calls out.
  const source = field();
  const lobeFields = [];
  for (const lobe of recipe.sources) {
    const [lx, ly, lz] = lobe.c;
    const inv = 1 / (lobe.r * lobe.r);
    const own = field();
    for (let i = 0; i < N; i++) {
      const dx = cx[i] - lx, dy = cy[i] - ly, dz = cz[i] - lz;
      const radial = (dx * dx + dy * dy + dz * dz) * inv;
      const v = lobe.amount * Math.exp(-radial * radial * lobe.sharp);
      own[i] = v;
      if (v > source[i]) source[i] = v;
    }
    lobeFields.push(own);
  }
  for (const cav of recipe.cavities || []) {
    const [ax, ay, az] = cav.c, [rx, ry, rz] = cav.r;
    for (let i = 0; i < N; i++) {
      const dx = (cx[i] - ax) / rx, dy = (cy[i] - ay) / ry, dz = (cz[i] - az) / rz;
      source[i] *= 1 - cav.cut * Math.exp(-(dx * dx + dy * dy + dz * dz));
    }
  }

  // ---- initial momentum ---------------------------------------------------------------------
  const iv = recipe.initialVelocity || {};
  const push = iv.push || [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const x = cx[i], y = cy[i], z = cz[i];
    const r2 = x * x + y * y + z * z;
    const r = Math.sqrt(r2) + 1e-5;
    const envelope = Math.exp(-r2 / 0.5);
    if (iv.radial) { const k = iv.radial * envelope / r; vx[i] += k * x; vy[i] += k * y; vz[i] += k * z; }
    if (push[0] || push[1] || push[2]) {
      const e = Math.exp(-(y * y + z * z) / 0.24);
      vx[i] += push[0] * e; vy[i] += push[1] * e; vz[i] += push[2] * e;
    }
    if (iv.shearAxis) { vy[i] += -iv.shearAxis * z * envelope; vz[i] += iv.shearAxis * y * envelope; }
    // A fan spreads the ejecta across the contact face instead of firing one straight column.
    if (iv.fan) {
      const t = Math.sqrt(y * y + z * z) + 1e-5;
      const e = Math.exp(-((x + 0.3) * (x + 0.3)) / 0.10);
      vy[i] += iv.fan * (y / t) * e; vz[i] += iv.fan * (z / t) * e;
    }
    // Two counter-rotating large cells: slow, coherent, and it never repeats on a tight period.
    if (iv.vortexPair) {
      const s = x > 0 ? 1 : -1;
      vy[i] += iv.vortexPair * s * -z * Math.exp(-((Math.abs(x) - 0.45) ** 2) / 0.30);
      vz[i] += iv.vortexPair * s * y * Math.exp(-((Math.abs(x) - 0.45) ** 2) / 0.30);
    }
  }

  const F = recipe.forces || {};
  const inj = recipe.injection || {};
  const dis = recipe.dissipation || {};
  const blur = recipe.blur || {};
  const cond = recipe.condense || null;
  const dt = recipe.dt;
  const loop = !!recipe.loop;
  // Looping families ping-pong at runtime rather than wrapping, so the bake captures exactly the
  // frames it ships. A cross-faded wrap was tried first and measured a loop seam 5x an ordinary
  // frame step on the coolant jet and 3x on the environmental drift: for a quasi-steady turbulent
  // field there is no cross-fade that makes a wrap seamless, while a triangle-wave phase is
  // seamless by construction and still always interpolates an ASCENDING frame pair, so the baked
  // motion vectors stay valid in both directions of travel.
  const wanted = recipe.frames;
  const last = recipe.steps - 1;
  const captureAt = [];
  for (let k = 0; k < wanted; k++) {
    const span = last - recipe.captureStart;
    captureAt.push(Math.round(recipe.captureStart + (wanted === 1 ? 0 : (span * k) / (wanted - 1))));
  }
  const captureSet = new Set(captureAt);
  const captureStride = wanted > 1 ? (captureAt[1] - captureAt[0]) : 1;

  const frames = [];
  for (let step = 0; step < recipe.steps; step++) {
    // ---- forces ------------------------------------------------------------------------------
    const drift = (F.swirlDrift || 0) * step;
    for (let i = 0; i < N; i++) {
      const x = cx[i], y = cy[i], z = cz[i];
      const r2 = x * x + y * y + z * z;
      const r = Math.sqrt(r2) + 1e-5;
      // Thermal expansion (radial, because this is space - there is no up to rise toward) minus
      // cohesion, which is what keeps dust lumpy while hot gas keeps inflating.
      const radialAccel = (F.buoyancy || 0) * aux[i] - (F.weight || 0) * rho[i];
      if (radialAccel !== 0) {
        const k = dt * radialAccel / r;
        vx[i] += k * x; vy[i] += k * y; vz[i] += k * z;
      }
      const tangential = y * y + z * z;
      if (F.jet) {
        const ox = x - (F.jetOrigin || 0);
        vx[i] += dt * F.jet * Math.exp(-tangential / (F.jetRadius || 0.1)) * Math.exp(-(ox * ox) / 0.18);
      }
      if (F.swirl) {
        const ox = x - (F.jetOrigin || 0) - drift;
        const ring = Math.exp(-((ox * ox) / 0.14 + tangential / (F.swirlRadius || 0.14)));
        const s = dt * F.swirl * ring;
        vy[i] += -z * s; vz[i] += y * s;
      }
    }

    project(vx, vy, vz, boundary, recipe.jacobi, div, pressure, nextPressure);

    advect(tmpA, vx, vx, vy, vz, dt);
    advect(tmpB, vy, vx, vy, vz, dt);
    advect(tmpC, vz, vx, vy, vz, dt);
    const drag = recipe.drag;
    for (let i = 0; i < N; i++) {
      const b = boundary[i] * drag;
      vx[i] = tmpA[i] * b; vy[i] = tmpB[i] * b; vz[i] = tmpC[i] * b;
    }
    advect(tmpA, rho, vx, vy, vz, dt); rho.set(tmpA);
    advect(tmpA, aux, vx, vy, vz, dt); aux.set(tmpA);

    // ---- injection and channel chemistry -----------------------------------------------------
    if (step < (inj.steps || 0)) {
      const rate = step < (inj.hold || 0) ? inj.rate : inj.lateRate;
      const auxRate = rate * (inj.auxScale != null ? inj.auxScale : 1);
      for (let i = 0; i < N; i++) { rho[i] += source[i] * rate; aux[i] += source[i] * auxRate; }
    }
    // Discrete ejecta parcels. Granular matter is lumpy because it leaves the fracture as separate
    // slugs at separate moments with separate speeds, so that is how it is authored here: each
    // pulse deposits one lobe's material AND its momentum on one named step. The first cut tried to
    // manufacture the same look with a repeated unsharp mask, which is a runaway concentration
    // process - it drove the peak to 3.3e7 and then, once renormalised, to a static film.
    for (const pulse of recipe.pulses || []) {
      if (pulse.at !== step) continue;
      const lobe = lobeFields[pulse.lobe];
      const amount = pulse.amount != null ? pulse.amount : 1;
      const auxAmount = amount * (pulse.auxScale != null ? pulse.auxScale : (inj.auxScale != null ? inj.auxScale : 1));
      const pv = pulse.vel || [0, 0, 0];
      for (let i = 0; i < N; i++) {
        const w = lobe[i];
        if (w <= 1e-4) continue;
        rho[i] += w * amount;
        aux[i] += w * auxAmount;
        vx[i] += w * pv[0]; vy[i] += w * pv[1]; vz[i] += w * pv[2];
      }
    }
    if (cond) {
      // Coolant flashes to condensate as it leaves the nozzle: the second channel is created by
      // the flow, downstream, instead of being injected with the material.
      const span = 1 / Math.max(1e-4, cond.end - cond.start);
      for (let i = 0; i < N; i++) {
        let t = (cx[i] - cond.start) * span;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        aux[i] += rho[i] * cond.rate * (t * t * (3 - 2 * t));
      }
    }
    for (let i = 0; i < N; i++) { rho[i] *= dis.rho; aux[i] *= dis.aux; }

    // ---- clumping ----------------------------------------------------------------------------
    // Unsharp mask against the solver's own field, not against noise: material migrates from the
    // shoulders into the cores, which is what makes fractured rock read as grains and not haze.
    // Mass is renormalised afterwards, because an unconstrained sharpen is a positive feedback
    // loop - the first cut of this bake ran fracture dust to a peak density of 3.3e7.
    if (recipe.clump) {
      sharpen.set(rho);
      blurOnce(sharpen, scratch);
      let before = 0, after = 0;
      for (let i = 0; i < N; i++) {
        before += rho[i];
        const v = rho[i] + recipe.clump * (rho[i] - sharpen[i]);
        rho[i] = v > 0 ? v : 0;
        after += rho[i];
      }
      if (after > 1e-9) {
        const renorm = before / after;
        for (let i = 0; i < N; i++) rho[i] *= renorm;
      }
    }
    // Viscous smoothing is a per-step BLEND fraction toward the blurred field, not whole passes.
    // A full [1,2,1] pass is sigma ~0.7 voxels; running one every step for a hundred steps
    // integrates to sigma ~7 voxels at grid 32, which is the whole body - the first cut of this
    // bake did exactly that and produced a featureless ball with no lobes and no cavity.
    blurMix(rho, blur.rho || 0, scratch, tmpA);
    blurMix(aux, blur.aux || 0, scratch, tmpA);
    for (let i = 0; i < N; i++) { rho[i] *= boundary[i]; aux[i] *= boundary[i]; }

    if (captureSet.has(step)) {
      frames.push({
        rho: Float32Array.from(rho),
        aux: Float32Array.from(aux),
        motion: downsampleMotion(vx, vy, vz, captureStride * dt),
      });
    }
  }
  return { frames, loop, captureStride };
}

/** Box-average the velocity into an MG^3 field, in G-grid cells travelled per frame interval. */
function downsampleMotion(vx, vy, vz, frameSeconds) {
  const block = G / MG;
  const out = new Float32Array(MG * MG * MG * 3);
  const norm = frameSeconds / DX / (block * block * block);
  for (let mz = 0; mz < MG; mz++) for (let my = 0; my < MG; my++) for (let mx = 0; mx < MG; mx++) {
    let sx = 0, sy = 0, sz = 0;
    for (let z = 0; z < block; z++) for (let y = 0; y < block; y++) for (let x = 0; x < block; x++) {
      const i = ((mz * block + z) * G + (my * block + y)) * G + (mx * block + x);
      sx += vx[i]; sy += vy[i]; sz += vz[i];
    }
    const o = ((mz * MG + my) * MG + mx) * 3;
    out[o] = sx * norm; out[o + 1] = sy * norm; out[o + 2] = sz * norm;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Quantisation, bounds, packing
// ---------------------------------------------------------------------------------------------

/**
 * Normalising by the absolute maximum throws the 4-bit range away whenever a handful of voxels run
 * hot: the first fracture-dust bake normalised against a clumped spike and quantised the entire
 * film to levels 0-1, a frame delta of 0.005 - a static volume. A high percentile of the OCCUPIED
 * voxels keeps the body inside the range and lets the few brightest cores clip.
 */
function peakOf(frames, key, percentile = 0.998) {
  let peak = 0;
  for (const f of frames) for (let i = 0; i < N; i++) if (f[key][i] > peak) peak = f[key][i];
  if (peak <= 1e-9) return 1;
  const BINS = 4096;
  const histogram = new Int32Array(BINS);
  let occupied = 0;
  const floor = peak * 1e-4;
  for (const f of frames) for (let i = 0; i < N; i++) {
    const v = f[key][i];
    if (v <= floor) continue;
    occupied++;
    const bin = Math.min(BINS - 1, Math.floor((v / peak) * BINS));
    histogram[bin]++;
  }
  if (!occupied) return peak;
  const want = occupied * percentile;
  let seen = 0;
  for (let b = 0; b < BINS; b++) {
    seen += histogram[b];
    if (seen >= want) return Math.max(peak * ((b + 1) / BINS), 1e-6);
  }
  return peak;
}

/** Square-root companding keeps tenuous edge material alive in four bits per channel. */
function quantise(frames) {
  const rhoPeak = peakOf(frames, 'rho');
  const auxPeak = peakOf(frames, 'aux');
  const cells = [];
  for (const f of frames) {
    const cell = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const d = Math.round(Math.sqrt(Math.min(1, Math.max(0, f.rho[i] / rhoPeak))) * 15);
      const a = Math.round(Math.sqrt(Math.min(1, Math.max(0, f.aux[i] / auxPeak))) * 15);
      cell[i] = (d << 4) | a;
    }
    cells.push(cell);
  }
  return { cells, rhoPeak, auxPeak };
}

/**
 * Tight occupied box per frame, in normalised cell space, padded by one voxel so trilinear
 * filtering still has a zero shoulder to fade into.  The runtime rasterises and marches THIS box
 * instead of the unit cube, which is where most of the covered-pixel and sample saving comes from.
 */
function boundsOf(cell) {
  let x0 = G, y0 = G, z0 = G, x1 = -1, y1 = -1, z1 = -1;
  for (let z = 0; z < G; z++) for (let y = 0; y < G; y++) {
    const row = (z * G + y) * G;
    for (let x = 0; x < G; x++) {
      if ((cell[row + x] >> 4) === 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  if (x1 < 0) return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const lo = (v) => Math.max(0, (v - 1)) / (G - 1);
  const hi = (v) => Math.min(G - 1, (v + 1)) / (G - 1);
  return [lo(x0), lo(y0), lo(z0), hi(x1), hi(y1), hi(z1)].map((v) => Math.round(v * 1000) / 1000);
}

function encodeMotion(motion) {
  const out = new Uint8Array(MG * MG * MG * 3);
  for (let i = 0; i < out.length; i++) {
    const v = motion[i] / MOTION_MAX_CELLS;
    const c = v < -1 ? -1 : (v > 1 ? 1 : v);
    out[i] = Math.round(c * 127 + 128);
  }
  return out;
}

/** PackBits.  0..127 -> copy n+1 literals; 129..255 -> repeat the next byte 257-n times. */
function packBits(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === bytes[i] && run < 128) run++;
    if (run >= 3) { out.push(257 - run, bytes[i]); i += run; continue; }
    let lit = 0;
    while (i + lit < bytes.length && lit < 128) {
      if (lit + 2 < 128 && i + lit + 2 < bytes.length
        && bytes[i + lit] === bytes[i + lit + 1] && bytes[i + lit] === bytes[i + lit + 2]) break;
      lit++;
    }
    out.push(lit - 1);
    for (let k = 0; k < lit; k++) out.push(bytes[i + k]);
    i += lit;
  }
  return Uint8Array.from(out);
}

function unpackBits(packed, expected) {
  const out = new Uint8Array(expected);
  let i = 0, o = 0;
  while (i < packed.length && o < expected) {
    const control = packed[i++];
    if (control < 128) {
      for (let k = 0; k <= control; k++) out[o++] = packed[i++];
    } else if (control > 128) {
      const value = packed[i++];
      for (let k = 0; k < 257 - control; k++) out[o++] = value;
    }
  }
  if (o !== expected) throw new Error('packBits round trip mismatch: ' + o + ' of ' + expected);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

/**
 * Mean absolute density change between adjacent frames, in 4-bit levels. A film that reads as a
 * slideshow has a large number here; a film that is effectively static has ~0. Reported so a
 * re-bake shows at a glance whether the recipe still evolves.
 */
function stepDelta(cells) {
  if (cells.length < 2) return 0;
  let total = 0;
  for (let f = 1; f < cells.length; f++) {
    let s = 0;
    for (let i = 0; i < N; i++) s += Math.abs((cells[f][i] >> 4) - (cells[f - 1][i] >> 4));
    total += s / N;
  }
  return Math.round((total / (cells.length - 1)) * 1000) / 1000;
}

function main() {
  const verify = process.argv.includes('--verify');
  const families = [];
  const densityChunks = [];
  const motionChunks = [];
  let cellOffset = 0;

  for (const id of RECIPES) {
    const recipe = JSON.parse(readFileSync(SOURCE_DIR + id + '.json', 'utf8'));
    const started = Date.now();
    const solved = solve(recipe);
    const frames = solved.frames;
    const { cells, rhoPeak, auxPeak } = quantise(frames);
    const bounds = [];
    for (let f = 0; f < cells.length; f++) {
      densityChunks.push(cells[f]);
      motionChunks.push(encodeMotion(frames[f].motion));
      bounds.push(...boundsOf(cells[f]));
    }
    families.push({
      id, auxChannel: recipe.auxChannel, cellOffset, frames: cells.length,
      loop: !!recipe.loop, bounds,
    });
    process.stdout.write('  ' + id.padEnd(22)
      + 'cells ' + String(cellOffset).padStart(2) + '..' + (cellOffset + cells.length - 1)
      + (recipe.loop ? ' pingpong' : '         ')
      + '  peak rho ' + rhoPeak.toFixed(3) + ' aux ' + auxPeak.toFixed(3)
      + '  frame delta ' + stepDelta(cells).toFixed(3)
      + '  (' + ((Date.now() - started) / 1000).toFixed(1) + 's)\n');
    cellOffset += cells.length;
  }

  const slots = ATLAS[0] * ATLAS[1] * ATLAS[2];
  if (cellOffset > slots) throw new Error('gas atlas overflow: ' + cellOffset + ' cells > ' + slots);

  const density = new Uint8Array(cellOffset * N);
  for (let c = 0; c < densityChunks.length; c++) density.set(densityChunks[c], c * N);
  const motionBytes = MG * MG * MG * 3;
  const motion = new Uint8Array(cellOffset * motionBytes);
  for (let c = 0; c < motionChunks.length; c++) motion.set(motionChunks[c], c * motionBytes);

  const densityPacked = packBits(density);
  const motionPacked = packBits(motion);
  unpackBits(densityPacked, density.length);
  unpackBits(motionPacked, motion.length);

  const meta = {
    grid: G, motionGrid: MG, atlas: ATLAS, slots, usedCells: cellOffset,
    motionMaxCells: MOTION_MAX_CELLS,
    densitySha256: createHash('sha256').update(density).digest('hex'),
    motionSha256: createHash('sha256').update(motion).digest('hex'),
    densityRawBytes: density.length, motionRawBytes: motion.length,
    densityPackedBytes: densityPacked.length, motionPackedBytes: motionPacked.length,
    // What the GPU actually holds: RG8 for the film, RGBA8 for the motion field.
    densityTextureBytes: slots * N * 2,
    motionTextureBytes: slots * MG * MG * MG * 4,
  };

  const source = renderModule(meta, families, densityPacked, motionPacked);
  if (verify) {
    if (!existsSync(OUTPUT)) { console.error('gas bake --verify: no payload on disk'); process.exit(1); }
    if (readFileSync(OUTPUT, 'utf8') !== source) {
      console.error('gas bake --verify: payload differs from the committed module');
      process.exit(1);
    }
    console.log('gas bake --verify: byte-identical');
    return;
  }
  writeFileSync(OUTPUT, source, 'utf8');
  console.log(JSON.stringify(meta, null, 2));
  console.log('module bytes:', Buffer.byteLength(source, 'utf8'));
}

function base64Lines(bytes, indent) {
  const text = Buffer.from(bytes).toString('base64');
  const parts = [];
  for (let i = 0; i < text.length; i += 116) parts.push(indent + JSON.stringify(text.slice(i, i + 116)));
  return parts.join('\n  + ');
}

function renderModule(meta, families, densityPacked, motionPacked) {
  const familyJson = families.map((f) => '  ' + JSON.stringify(f)).join(',\n');
  return [
    '// GENERATED by tools/bake-gas-volumes.mjs. Edit assets/vfx/gas-sim/*.json and re-run;',
    '// never hand-edit this payload. `node tools/bake-gas-volumes.mjs --verify` asserts it matches.',
    '// Original SpaceFace source-art bake: a deterministic transport solve, no third-party asset.',
    '',
    'export const GAS_FILM = Object.freeze(' + JSON.stringify(meta) + ');',
    '',
    '/** Atlas cell assignment per family. `bounds` is 6 floats per frame: min xyz then max xyz. */',
    'export const GAS_FAMILY_FILMS = Object.freeze([',
    familyJson,
    '].map(Object.freeze));',
    '',
    'const DENSITY_PACKED =',
    '  ' + base64Lines(densityPacked, '') + ';',
    '',
    'const MOTION_PACKED =',
    '  ' + base64Lines(motionPacked, '') + ';',
    '',
    'function unpack(text, expected) {',
    '  const bytes = atob(text);',
    '  const out = new Uint8Array(expected);',
    '  let i = 0;',
    '  let o = 0;',
    '  while (i < bytes.length && o < expected) {',
    '    const control = bytes.charCodeAt(i++);',
    '    if (control < 128) {',
    '      const run = control + 1;',
    '      if (o + run > expected) throw new Error(\'Corrupt gas volume payload\');',
    '      for (let k = 0; k < run; k++) out[o++] = bytes.charCodeAt(i++);',
    '    } else if (control > 128) {',
    '      const run = 257 - control;',
    '      if (o + run > expected) throw new Error(\'Corrupt gas volume payload\');',
    '      const value = bytes.charCodeAt(i++);',
    '      for (let k = 0; k < run; k++) out[o++] = value;',
    '    }',
    '  }',
    '  if (o !== expected) throw new Error(\'Incomplete gas volume payload\');',
    '  return out;',
    '}',
    '',
    '/**',
    ' * Decode straight into ATLAS layout, so the caller can hand the arrays to Data3DTexture with',
    ' * no second copy. Density is RG8 (r = density, g = the family aux channel); motion is RGBA8',
    ' * with rgb a signed displacement in grid cells per frame interval.',
    ' */',
    'export function decodeGasFilm() {',
    '  const g = GAS_FILM.grid;',
    '  const mg = GAS_FILM.motionGrid;',
    '  const [ax, ay] = GAS_FILM.atlas;',
    '  const cellVoxels = g * g * g;',
    '  const packedDensity = unpack(DENSITY_PACKED, GAS_FILM.usedCells * cellVoxels);',
    '  const packedMotion = unpack(MOTION_PACKED, GAS_FILM.usedCells * mg * mg * mg * 3);',
    '  const density = new Uint8Array(GAS_FILM.densityTextureBytes);',
    '  const motion = new Uint8Array(GAS_FILM.motionTextureBytes);',
    '  motion.fill(128);',
    '  const dw = ax * g;',
    '  const dh = ay * g;',
    '  const mw = ax * mg;',
    '  const mh = ay * mg;',
    '  for (let c = 0; c < GAS_FILM.usedCells; c++) {',
    '    const cx = c % ax;',
    '    const cy = Math.floor(c / ax) % ay;',
    '    const cz = Math.floor(c / (ax * ay));',
    '    for (let z = 0; z < g; z++) {',
    '      for (let y = 0; y < g; y++) {',
    '        let src = c * cellVoxels + (z * g + y) * g;',
    '        let dst = (((cz * g + z) * dh + (cy * g + y)) * dw + cx * g) * 2;',
    '        for (let x = 0; x < g; x++) {',
    '          const byte = packedDensity[src++];',
    '          density[dst++] = (byte >>> 4) * 17;',
    '          density[dst++] = (byte & 15) * 17;',
    '        }',
    '      }',
    '    }',
    '    for (let z = 0; z < mg; z++) {',
    '      for (let y = 0; y < mg; y++) {',
    '        let src = (c * mg * mg * mg + (z * mg + y) * mg) * 3;',
    '        let dst = (((cz * mg + z) * mh + (cy * mg + y)) * mw + cx * mg) * 4;',
    '        for (let x = 0; x < mg; x++) {',
    '          motion[dst] = packedMotion[src];',
    '          motion[dst + 1] = packedMotion[src + 1];',
    '          motion[dst + 2] = packedMotion[src + 2];',
    '          motion[dst + 3] = 255;',
    '          src += 3;',
    '          dst += 4;',
    '        }',
    '      }',
    '    }',
    '  }',
    '  return { density, motion };',
    '}',
    '',
  ].join('\n');
}

main();
