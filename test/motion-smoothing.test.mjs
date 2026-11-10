// GFX-16 smooth interpolation: sparse authored motion banks used to be piecewise linear, so every key
// was a velocity corner ("a scripted move just got called"). The runtime sampler now evaluates a
// sparse channel (mean key spacing > 1/15 s) as a C1 cubic that passes exactly through its keys:
// monotone Hermite for translation, angular-velocity tangents for rotation, rest-to-rest ends,
// periodic loop seams. Dense bakes keep the exact old linear/slerp path. These tests pin each clause.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';

import * as THREE from 'three';

import {
  MOTION_BANK_SCHEMA,
  MOTION_SPARSE_SPACING_S,
  bindAuthoredMotion,
  evaluateMotionClip,
  motionChannelInterpolation,
  sampleChannelInto,
  slerp,
  validateMotionBank,
} from '../src/contracts/motionBank.js';

// ---- helpers ----------------------------------------------------------------------------------

function quatAxisAngle(axis, angle) {
  const n = Math.hypot(axis[0], axis[1], axis[2]);
  const s = Math.sin(angle / 2) / n;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

// Angle between two unit quaternions from the relative rotation's vector part (stays accurate for
// the tiny steps a finite-difference velocity takes, where acos(dot) rounds to zero).
function angleBetween(p, q) {
  const rx = p[3] * q[0] - p[0] * q[3] - p[1] * q[2] + p[2] * q[1];
  const ry = p[3] * q[1] + p[0] * q[2] - p[1] * q[3] - p[2] * q[0];
  const rz = p[3] * q[2] - p[0] * q[1] + p[1] * q[0] - p[2] * q[3];
  const rw = p[3] * q[3] + p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return 2 * Math.atan2(Math.hypot(rx, ry, rz), Math.abs(rw));
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function channel(path, times, values, extra = {}) {
  return { group: 'g', path, times, values: values.flat(), ...extra };
}

function clipOf(channels, { durationS, loop = false, endMode = 'rest', name = 'c' } = {}) {
  const last = Math.max(...channels.map((c) => c.times[c.times.length - 1]));
  return { name, durationS: durationS ?? last, loop, endMode, channels };
}

const sampleT = (clip, t) => Array.from(evaluateMotionClip({}, clip, t).get('g').translation);
const sampleR = (clip, t) => Array.from(evaluateMotionClip({}, clip, t).get('g').rotation);

// Deterministic PRNG so the property tests are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPARSE_TIMES = [0, 0.4, 1.1, 1.5, 2.6];

// ---- the curve passes through its keys --------------------------------------------------------

test('smooth: a sparse translation channel passes exactly through every key', () => {
  const values = [[0, 0, 0], [1, 2, -1], [0.5, 2.5, 3], [-2, 0, 3.2], [4, -1, 0]];
  const clip = clipOf([channel('translation', SPARSE_TIMES, values)]);
  assert.equal(motionChannelInterpolation(clip.channels[0]), 'cubic');
  SPARSE_TIMES.forEach((t, i) => {
    const p = sampleT(clip, t);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(p[c] - values[i][c]) < 1e-12, `key ${i} axis ${c}`);
    if (i > 0 && i < SPARSE_TIMES.length - 1) {
      // continuous across the key from both sides
      assert.ok(dist(sampleT(clip, t - 1e-9), values[i]) < 1e-6);
      assert.ok(dist(sampleT(clip, t + 1e-9), values[i]) < 1e-6);
    }
  });
});

test('smooth: a sparse rotation channel passes exactly through every key, short arc, unit length', () => {
  const rng = mulberry32(7);
  const keys = SPARSE_TIMES.map(() => quatAxisAngle([rng() - 0.5, rng() - 0.5, rng() - 0.5 + 0.2], rng() * 5));
  const clip = clipOf([channel('rotation', SPARSE_TIMES, keys)]);
  assert.equal(motionChannelInterpolation(clip.channels[0]), 'cubic');
  SPARSE_TIMES.forEach((t, i) => {
    const q = sampleR(clip, t);
    assert.ok(angleBetween(q, keys[i]) < 1e-9, `key ${i}`);
  });
  for (let k = 0; k <= 400; k++) {
    const q = sampleR(clip, (2.6 * k) / 400);
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-9, 'unit length');
  }
});

test('smooth: a key stored with the opposite quaternion sign takes the short arc, not the long way', () => {
  const a = quatAxisAngle([0, 1, 0], 0.2);
  const b = quatAxisAngle([0, 1, 0], 0.6);
  const bFlipped = b.map((v) => -v);
  const times = [0, 1];
  const plain = clipOf([channel('rotation', times, [a, b])]);
  const flipped = clipOf([channel('rotation', times, [a, bFlipped])]);
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    assert.ok(angleBetween(sampleR(plain, t), sampleR(flipped, t)) < 1e-9);
    // never swings through the long arc: the angle from the start grows monotonically to 0.4 rad
    assert.ok(angleBetween(sampleR(flipped, t), a) <= 0.4 + 1e-9);
  }
});

// ---- no overshoot ------------------------------------------------------------------------------

test('smooth: monotone data never overshoots and stays monotone, flat runs stay flat', () => {
  const times = [0, 0.3, 0.35, 1.2, 2.0, 2.1, 3.0];
  const xs = [0, 1, 1.05, 4, 4, 4.5, 9];
  const ys = [5, 5, 4, 2, -3, -3.2, -8];
  const clip = clipOf([channel('translation', times, xs.map((x, i) => [x, ys[i], 0]))]);
  let prev = null;
  for (let k = 0; k <= 3000; k++) {
    const t = (3.0 * k) / 3000;
    const p = sampleT(clip, t);
    if (prev) {
      assert.ok(p[0] >= prev[0] - 1e-12, `x non-decreasing at t=${t}`);
      assert.ok(p[1] <= prev[1] + 1e-12, `y non-increasing at t=${t}`);
    }
    prev = p;
    assert.ok(p[0] >= -1e-12 && p[0] <= 9 + 1e-12);
    if (t >= 1.2 && t <= 2.0) assert.ok(Math.abs(p[0] - 4) < 1e-12, 'a flat run between equal keys stays flat');
  }
});

test('smooth: random keys never leave their segment bracket on any axis', () => {
  const rng = mulberry32(42);
  for (let trial = 0; trial < 25; trial++) {
    const n = 3 + Math.floor(rng() * 6);
    const times = [0];
    for (let i = 1; i < n; i++) times.push(times[i - 1] + 0.1 + rng() * 1.5);
    const values = times.map(() => [rng() * 10 - 5, rng() * 10 - 5, rng() * 10 - 5]);
    const clip = clipOf([channel('translation', times, values)]);
    if (motionChannelInterpolation(clip.channels[0]) !== 'cubic') continue;
    for (let seg = 0; seg < n - 1; seg++) {
      for (let k = 0; k <= 40; k++) {
        const t = times[seg] + ((times[seg + 1] - times[seg]) * k) / 40;
        const p = sampleT(clip, t);
        for (let c = 0; c < 3; c++) {
          const lo = Math.min(values[seg][c], values[seg + 1][c]);
          const hi = Math.max(values[seg][c], values[seg + 1][c]);
          assert.ok(p[c] >= lo - 1e-9 && p[c] <= hi + 1e-9, `trial ${trial} seg ${seg} axis ${c}`);
        }
      }
    }
  }
});

// ---- extrema, ends, loops ----------------------------------------------------------------------

test('smooth: a key that reverses direction has zero velocity (eases in and out), a pass-through key does not', () => {
  const times = [0, 0.5, 1, 1.5, 2];
  const clip = clipOf([channel('translation', times, [[0, 0, 0], [1, 0, 0], [0, 0, 0], [1, 0, 0], [0, 0, 0]])]);
  const e = 1e-6;
  for (const t of [0.5, 1, 1.5]) {
    const v = (sampleT(clip, t + e)[0] - sampleT(clip, t - e)[0]) / (2 * e);
    assert.ok(Math.abs(v) < 1e-4, `reversal at ${t}: v=${v}`);
  }
  const ramp = clipOf([channel('translation', [0, 1, 2, 3], [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])]);
  const vMid = (sampleT(ramp, 1.5 + e)[0] - sampleT(ramp, 1.5 - e)[0]) / (2 * e);
  assert.ok(vMid > 0.9 && vMid < 1.1, `a uniform ramp keeps its speed through interior keys (v=${vMid})`);
  const vKey = (sampleT(ramp, 1 + e)[0] - sampleT(ramp, 1 - e)[0]) / (2 * e);
  assert.ok(Math.abs(vKey - 1) < 1e-6, 'uniform ramp: tangent equals the secant at an interior key');
});

test('smooth: a rotation reversal has zero angular velocity at the key', () => {
  const times = [0, 0.7, 1.4];
  const clip = clipOf([channel('rotation', times, [quatAxisAngle([0, 0, 1], 0), quatAxisAngle([0, 0, 1], 0.9), quatAxisAngle([0, 0, 1], 0)])]);
  const e = 1e-6;
  const w = angleBetween(sampleR(clip, 0.7 - e), sampleR(clip, 0.7 + e)) / (2 * e);
  assert.ok(w < 1e-4, `angular speed at reversal ${w}`);
  const wMid = angleBetween(sampleR(clip, 0.35 - e), sampleR(clip, 0.35 + e)) / (2 * e);
  assert.ok(wMid > 0.5, `moving mid-segment (${wMid} rad/s)`);
});

test('smooth: a non-loop clip starts and ends at rest (zero velocity at both ends)', () => {
  const times = [0, 0.8, 1.9, 2.4];
  const t3 = clipOf([channel('translation', times, [[0, 0, 0], [1, 0.5, 0], [2, 0.7, 0], [3, 1, 0]])]);
  const r4 = clipOf([channel('rotation', times, [0, 0.6, 1.4, 2.2].map((a) => quatAxisAngle([0.3, 1, 0.2], a)))]);
  const e = 1e-6;
  const D = 2.4;
  assert.ok(dist(sampleT(t3, e), sampleT(t3, 0)) / e < 1e-4, 'translation start velocity');
  assert.ok(dist(sampleT(t3, D), sampleT(t3, D - e)) / e < 1e-4, 'translation end velocity');
  assert.ok(angleBetween(sampleR(r4, e), sampleR(r4, 0)) / e < 1e-4, 'rotation start velocity');
  assert.ok(angleBetween(sampleR(r4, D), sampleR(r4, D - e)) / e < 1e-4, 'rotation end velocity');
});

test('smooth: a loop clip has equal pose AND velocity at its seam', () => {
  const times = [0, 1, 2.5, 4];
  const D = 4;
  const trans = clipOf([channel('translation', times, [[0, 0, 0], [1, 0.5, -0.2], [-0.5, 1.2, 0.3], [0, 0, 0]])], { durationS: D, loop: true });
  const e = 1e-6;
  const p0 = sampleT(trans, 0);
  const pBefore = sampleT(trans, D - e);
  const pAfter = sampleT(trans, e);
  assert.ok(dist(p0, pBefore) < 1e-5, 'pose continuous across the seam');
  const vBefore = [0, 1, 2].map((c) => (p0[c] - pBefore[c]) / e);
  const vAfter = [0, 1, 2].map((c) => (pAfter[c] - p0[c]) / e);
  assert.ok(dist(vBefore, vAfter) < 1e-3, `velocity continuous across the seam: ${vBefore} vs ${vAfter}`);
  assert.ok(Math.hypot(...vAfter) > 0.05, 'the seam is not just a stop');

  const keysR = [0, 1.1, 2.0, 0].map((a) => quatAxisAngle([0.2, 1, 0.4], a));
  const rot = clipOf([channel('rotation', times, keysR)], { durationS: D, loop: true });
  const q0 = sampleR(rot, 0);
  const wBefore = angleBetween(sampleR(rot, D - e), q0) / e;
  const wAfter = angleBetween(q0, sampleR(rot, e)) / e;
  assert.ok(angleBetween(sampleR(rot, D - e), q0) < 1e-5, 'rotation pose continuous');
  assert.ok(Math.abs(wBefore - wAfter) < 1e-3, `angular speed continuous: ${wBefore} vs ${wAfter}`);
});

test('smooth: a keyed constant spin stays a constant spin (120 degree steps, both closure signs)', () => {
  // The drill string / snare core / drum loops are 4-key 360 degree spins. A per-component quaternion
  // spline would wobble them; geodesic tangents keep the speed flat.
  const times = [0, 0.5, 1, 1.5];
  const D = 1.5;
  for (const closeSign of [1, -1]) {
    const keys = [0, 1, 2, 3].map((k) => quatAxisAngle([0.3, 1, -0.2], (k * 2 * Math.PI) / 3));
    keys[3] = keys[3].map((v) => v * closeSign * (keys[0][3] > 0 ? 1 : -1)); // +q0 or -q0 closure
    const clip = clipOf([channel('rotation', times, keys)], { durationS: D, loop: true });
    const dt = 1e-4;
    const expected = (2 * Math.PI) / D;
    let lo = Infinity; let hi = -Infinity;
    for (let t = 0; t < D; t += 0.0137) {
      const w = angleBetween(sampleR(clip, t), sampleR(clip, t + dt)) / dt;
      lo = Math.min(lo, w); hi = Math.max(hi, w);
    }
    assert.ok(lo > expected * 0.985 && hi < expected * 1.015, `spin speed stays within 1.5% of ${expected.toFixed(3)} (got ${lo.toFixed(3)}..${hi.toFixed(3)}, closeSign ${closeSign})`);
    const e = 1e-6;
    const q0 = sampleR(clip, 0);
    const wB = angleBetween(sampleR(clip, D - e), q0) / e;
    const wA = angleBetween(q0, sampleR(clip, e)) / e;
    assert.ok(Math.abs(wB - wA) < 1e-3 * expected, `seam speed continuous (${wB} vs ${wA})`);
  }
});

// ---- dense channels are untouched --------------------------------------------------------------

test('smooth: dense channels (>= 30 keys per second) keep the exact old linear/slerp evaluation', () => {
  const fps = 60;
  const n = 121;
  const times = Array.from({ length: n }, (_, i) => i / fps);
  const tVals = times.map((t) => [Math.sin(t * 3), Math.cos(t * 5) * 0.5, t * 0.1]);
  const rVals = times.map((t) => quatAxisAngle([0.2, 1, 0.1], Math.sin(t * 2) * 0.8));
  const tCh = channel('translation', times, tVals);
  const rCh = channel('rotation', times, rVals);
  assert.ok((times[n - 1] - times[0]) / (n - 1) <= MOTION_SPARSE_SPACING_S);
  assert.equal(motionChannelInterpolation(tCh), 'linear');
  assert.equal(motionChannelInterpolation(rCh), 'slerp');
  const clip = clipOf([tCh, rCh]);
  const rng = mulberry32(99);
  for (let k = 0; k < 500; k++) {
    const t = rng() * 2;
    let hi = 1;
    while (times[hi] < t) hi++;
    const lo = hi - 1;
    const f = (t - times[lo]) / (times[hi] - times[lo]);
    const expectT = [0, 1, 2].map((c) => tVals[lo][c] + (tVals[hi][c] - tVals[lo][c]) * f);
    assert.deepEqual(sampleT(clip, t), expectT, `translation bit-identical at t=${t}`);
    assert.deepEqual(sampleR(clip, t), slerp(rVals[lo], rVals[hi], f), `rotation bit-identical at t=${t}`);
  }
});

test('smooth: the auto-upgrade decision follows key density and the declared cubic flag', () => {
  const sparse = channel('translation', [0, 0.1, 0.2], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(motionChannelInterpolation(sparse), 'cubic', 'declared-less sparse channel is upgraded');
  assert.equal(motionChannelInterpolation({ ...sparse, interpolation: 'linear' }), 'cubic', 'declared linear, sparse: upgraded');
  const justDense = channel('translation', [0, 0.06, 0.12], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(motionChannelInterpolation(justDense), 'linear', 'denser than 15 keys per second stays linear');
  assert.equal(motionChannelInterpolation({ ...justDense, interpolation: 'cubic' }), 'cubic', 'declared cubic is honoured even when dense');
  const single = channel('translation', [0.5], [[1, 2, 3]]);
  assert.equal(motionChannelInterpolation(single), 'linear', 'a single key is a constant, never a spline');
  const rotSparse = channel('rotation', [0, 1], [[0, 0, 0, 1], quatAxisAngle([0, 1, 0], 1)]);
  assert.equal(motionChannelInterpolation(rotSparse), 'cubic');
});

// ---- plumbing ----------------------------------------------------------------------------------

test('smooth: banks may declare cubic; a translation slerp is still rejected', () => {
  const bank = {
    schema: MOTION_BANK_SCHEMA,
    rigId: 'cubic_rig',
    sourceAssetId: 'SF_CUBIC',
    sourceGlbSha256: 'a'.repeat(64),
    fps: 60,
    bindings: [{ id: 'g', node: 'MOTION_G', parent: null, restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, requiredAtLod: [0] }],
    clips: [{
      name: 'go', durationS: 1, loop: false, endMode: 'rest',
      channels: [
        { group: 'g', path: 'translation', times: [0, 1], values: [0, 0, 0, 1, 0, 0], interpolation: 'cubic' },
        { group: 'g', path: 'rotation', times: [0, 1], values: [0, 0, 0, 1, 0, 0, 0, 1], interpolation: 'cubic' },
      ],
    }],
  };
  assert.doesNotThrow(() => validateMotionBank(structuredClone(bank)));
  const bad = structuredClone(bank);
  bad.clips[0].channels[0].interpolation = 'slerp';
  assert.throws(() => validateMotionBank(bad), /translation cannot slerp/);
});

test('smooth: a deeply frozen bank evaluates (the plan lives beside the bank, never on it)', () => {
  const ch = channel('translation', SPARSE_TIMES, [[0, 0, 0], [1, 0, 0], [2, 1, 0], [3, 1, 0], [4, 0, 0]]);
  const clip = clipOf([ch]);
  Object.freeze(ch.times); Object.freeze(ch.values); Object.freeze(ch); Object.freeze(clip.channels); Object.freeze(clip);
  assert.doesNotThrow(() => sampleT(clip, 1.3));
  assert.equal(motionChannelInterpolation(ch), 'cubic');
});

test('smooth: the per-frame sampler allocates nothing (sparse translation and rotation)', (t) => {
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  if (typeof gc !== 'function') { t.skip('gc unavailable'); return; }
  const tCh = channel('translation', SPARSE_TIMES, [[0, 0, 0], [1, 0, 0], [2, 1, 0], [3, 1, 0], [4, 0, 0]]);
  const rCh = channel('rotation', SPARSE_TIMES, [0, 1, 2, 1, 0].map((a) => quatAxisAngle([0, 1, 0.3], a)));
  const outT = [0, 0, 0]; const outR = [0, 0, 0, 1];
  // warm up: builds the plans, lets the JIT settle
  for (let i = 0; i < 20000; i++) { sampleChannelInto(tCh, (i % 2600) / 1000, outT, 0); sampleChannelInto(rCh, (i % 2600) / 1000, outR, 0); }
  gc();
  const before = process.memoryUsage().heapUsed;
  let sink = 0;
  for (let i = 0; i < 300000; i++) {
    sampleChannelInto(tCh, (i % 2600) / 1000, outT, 0);
    sampleChannelInto(rCh, (i % 2600) / 1000, outR, 0);
    sink += outT[0] + outR[1];
  }
  gc();
  const grown = process.memoryUsage().heapUsed - before;
  assert.ok(Number.isFinite(sink));
  // 600k samples at even 32 bytes each would be ~19 MB; allow measurement noise only.
  assert.ok(grown < 1.5e6, `heap grew ${grown} bytes over 600k samples`);
});

function pivotTree() {
  const root = new THREE.Object3D();
  const pivot = new THREE.Object3D();
  pivot.name = 'MOTION_SMOOTH_RIG';
  pivot.position.set(1, 2, 3);
  pivot.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
  root.add(pivot);
  return { root, pivot };
}

function smoothBank({ endMode = 'rest' } = {}) {
  return {
    schema: MOTION_BANK_SCHEMA,
    rigId: 'smooth_rig',
    sourceAssetId: 'SF_SMOOTH_RIG',
    sourceGlbSha256: 'b'.repeat(64),
    fps: 60,
    bindings: [{ id: 'smooth_rig', node: 'MOTION_SMOOTH_RIG', parent: null, restPose: { translation: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, requiredAtLod: [0] }],
    clips: [{
      name: 'swing', durationS: 2, loop: false, endMode,
      channels: [{ group: 'smooth_rig', path: 'translation', times: [0, 0.5, 1.2, 2], values: [0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 2, 0] }],
    }],
  };
}

test('smooth: reduced motion halves the cubic delta exactly and endMode rest/hold keep their meaning', () => {
  const full = pivotTree();
  const reduced = pivotTree();
  const a = bindAuthoredMotion(full.root, smoothBank());
  const b = bindAuthoredMotion(reduced.root, smoothBank());
  a.setState({ state: 'swing', startTimeS: 0 });
  b.setState({ state: 'swing', startTimeS: 0 });
  for (const t of [0.2, 0.7, 1.5]) {
    a.update(t);
    b.update(t, { reducedMotion: true });
    const dFull = full.pivot.position.y - 2;
    const dReduced = reduced.pivot.position.y - 2;
    assert.ok(Math.abs(dFull) > 0.05, 'the part really moves');
    assert.ok(Math.abs(dReduced - dFull * 0.5) < 1e-12, `reduced = half at t=${t}`);
  }
  // rest: parks at the authored rest pose once the clip has run out
  a.update(2.2);
  assert.deepEqual([full.pivot.position.x, full.pivot.position.y, full.pivot.position.z], [1, 2, 3]);
  // hold: the clip's last key stays posed
  const held = pivotTree();
  const h = bindAuthoredMotion(held.root, smoothBank({ endMode: 'hold' }));
  h.setState({ state: 'swing', startTimeS: 0 });
  h.update(2.5);
  assert.ok(Math.abs(held.pivot.position.y - (2 + 2)) < 1e-12, 'hold keeps the last key (2) on top of rest');
  // and the curve is not linear between keys: mid-segment is above the chord to prove cubic is live
  const probe = pivotTree();
  const p = bindAuthoredMotion(probe.root, smoothBank());
  p.setState({ state: 'swing', startTimeS: 0 });
  p.update(0.25);
  const linearMid = 0.5; // linear between key 0 (0) and key 0.5 (1) at t=0.25
  assert.ok(Math.abs((probe.pivot.position.y - 2) - linearMid) > 0.02, 'first half-segment is eased, not linear');
});

// ---- the shipped banks -------------------------------------------------------------------------

test('smooth: every shipped bank channel still hits its authored keys and never produces NaN', () => {
  const dir = new URL('../assets/ships/motions/', import.meta.url);
  let channels = 0; let cubic = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.motion.json'))) {
    const bank = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    validateMotionBank(bank);
    for (const clip of bank.clips) {
      for (const ch of clip.channels) {
        channels++;
        const period = clip.loop === true ? clip.durationS : 0;
        if (motionChannelInterpolation(ch, period) === 'cubic') cubic++;
        const stride = ch.path === 'translation' ? 3 : 4;
        const out = new Array(stride).fill(0);
        ch.times.forEach((t, i) => {
          // a loop clip never samples its own period end (t % duration wraps to 0): skip that key
          if (clip.loop === true && t >= clip.durationS - 1e-9) return;
          sampleChannelInto(ch, t, out, period);
          const key = ch.values.slice(i * stride, i * stride + stride);
          if (stride === 3) assert.ok(dist(out, key) < 1e-9, `${bank.rigId}/${clip.name} ${ch.group} key ${i}`);
          else assert.ok(angleBetween(out, key) < 1e-6, `${bank.rigId}/${clip.name} ${ch.group} key ${i}`);
        });
        for (let k = 0; k <= 30; k++) {
          sampleChannelInto(ch, (clip.durationS * k) / 30, out, period);
          for (const v of out) assert.ok(Number.isFinite(v), `${bank.rigId}/${clip.name} ${ch.group} finite`);
        }
      }
    }
  }
  assert.ok(channels > 700, `scanned ${channels} channels`);
  assert.ok(cubic / channels > 0.9, `most shipped channels are sparse hand-keys (${cubic}/${channels})`);
});
