import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createGpuBudgetResolution,
  createAutoPresentationGovernor,
  autoPresentationCapFor,
  GPU_FRAME_BUDGET_MS,
} from '../src/render/adaptiveQuality.js';

// A GPU whose frame costs fixed + pixel * scale^2 ms, measured two frames late.
// Deterministic noise: single GPU frames at one scale spread about a third either way in the game.
function noiseSource(seed) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

function rig({ fixed = 1, pixel = 40, fps = 30, floor = 0.5, latency = 2, costAt = null, noise = 0, seed = 7 } = {}) {
  const rand = noiseSource(seed);
  const applied = [];
  const governor = createGpuBudgetResolution({ floor, apply: (s) => applied.push(s) });
  const cost = { fixed, pixel };
  const pipeline = [];
  let frame = 0;
  let clock = 0;
  const step = () => {
    frame++;
    clock += 1 / fps;
    const ready = pipeline.length > latency ? pipeline.shift() : null;
    governor.update(1 / fps, ready ? ready.ms : null, ready ? ready.frame : 0, frame);
    const s = governor.getScale();
    pipeline.push({ frame, ms: (costAt ? costAt(s) : cost.fixed + cost.pixel * s * s) * (1 + noise * (rand() * 2 - 1)) });
    return s;
  };
  const run = (seconds) => { const n = Math.round(seconds * fps); for (let i = 0; i < n; i++) step(); };
  const gpuMs = () => cost.fixed + cost.pixel * governor.getScale() ** 2;
  return { governor, applied, cost, run, gpuMs, clock: () => clock };
}

test('an over-budget GPU frame loses most of its excess within half a second and is on budget within one', () => {
  const r = rig({ fixed: 1, pixel: 40, fps: 30 });
  r.run(0.5);
  assert.ok(r.gpuMs() <= 41 * 0.45, `GPU ${r.gpuMs().toFixed(1)} ms after 0.5 s at scale ${r.governor.getScale()}`);
  r.run(0.5);
  assert.ok(r.gpuMs() <= GPU_FRAME_BUDGET_MS * 1.08, `GPU ${r.gpuMs().toFixed(1)} ms at scale ${r.governor.getScale()}`);
  assert.ok(r.applied.length <= 2, `changes ${r.applied.join(',')}`);
  assert.ok(r.governor.getScale() >= 0.5);
});

test('responds within half a second at 10 presented frames a second too', () => {
  const r = rig({ fixed: 1, pixel: 30, fps: 10, latency: 1 });
  r.run(0.6);
  assert.ok(r.gpuMs() <= GPU_FRAME_BUDGET_MS * 1.1, `GPU ${r.gpuMs().toFixed(1)} ms`);
});

test('a steady load settles and never pumps', () => {
  const r = rig({ fixed: 1.5, pixel: 26, fps: 30 });
  r.run(3);
  const settled = r.applied.length;
  r.run(60);
  assert.ok(r.applied.length - settled <= 1, `changes after settling: ${r.applied.slice(settled).join(',')}`);
  assert.ok(r.gpuMs() <= GPU_FRAME_BUDGET_MS * 1.08);
});

test('headroom brings resolution back one band at a time, to native', () => {
  const r = rig({ fixed: 1, pixel: 40, fps: 30 });
  r.run(2);
  assert.ok(r.governor.getScale() < 0.6);
  r.cost.pixel = 6; // the fight ended
  const before = r.applied.length;
  r.run(40);
  assert.equal(r.governor.getScale(), 1);
  const steps = r.applied.slice(before);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] <= 0.0501, `band step ${steps}`);
});

test('GPU time that resolution cannot move puts native back and stops trying for a while', () => {
  const r = rig({ fixed: 30, pixel: 0.01, fps: 30 });
  r.run(1.5);
  assert.equal(r.governor.getScale(), 1, 'the drop bought nothing, so sharpness is restored');
  const tries = r.applied.length;
  r.run(10);
  assert.equal(r.applied.length, tries, 'no retry inside the hold');
});

test('never below the floor, and a native-fast GPU never leaves native', () => {
  const heavy = rig({ fixed: 0, pixel: 200, fps: 30, floor: 0.5 });
  heavy.run(3);
  assert.equal(heavy.governor.getScale(), 0.5);
  assert.equal(heavy.governor.atFloor(), true);
  const light = rig({ fixed: 1, pixel: 8, fps: 60 });
  light.run(10);
  assert.equal(light.applied.length, 0);
});

test('samples rendered at the old scale are ignored after a change', () => {
  const applied = [];
  const g = createGpuBudgetResolution({ floor: 0.5, apply: (s) => applied.push(s) });
  g.update(0.033, 30, 1, 3);
  g.update(0.033, 30, 2, 4);
  g.update(0.033, 30, 3, 5);
  g.update(0.033, 30, 4, 6); // fourth sample (over budget for 0.13 s): drop, valid from frame 6
  assert.equal(applied.length, 1);
  const scale = g.getScale();
  for (let i = 0; i < 20; i++) g.update(0.033, 30, 5, 7 + i); // stale frame-5 totals keep arriving
  assert.equal(g.getScale(), scale, 'stale samples did not drive a second drop');
});

// The display delivers a present every 1/cap seconds when the frame fits, and every third 60 Hz
// beat (45 a second on average) when 60 is asked for but the frame does not fit.
test('a pass the main thread feeds slowly stops the descent where pixels stop paying', () => {
  // The timer reads the span of the pass: the longer of the pixel work and the 35 ms it takes
  // the main thread to submit the scene. Below about 0.73 a lower scale buys nothing.
  const r = rig({ fps: 10, latency: 1, costAt: (s) => Math.max(35, 66 * s * s) });
  let atFloorFrames = 0;
  let frames = 0;
  for (let i = 0; i < 600; i++) { r.run(0.1); frames++; if (r.governor.atFloor()) atFloorFrames++; }
  assert.ok(r.governor.getScale() >= 0.6 && r.governor.getScale() < 1, `scale ${r.governor.getScale()}`);
  assert.ok(atFloorFrames / frames < 0.1, `share of time at the floor: ${(atFloorFrames / frames).toFixed(2)}`);
});

test('noisy GPU samples: reaches the right scale, stays there, and never parks at native', () => {
  for (const seed of [3, 11, 29, 71]) {
    const r = rig({ fixed: 1, pixel: 34, fps: 20, noise: 0.35, seed });
    r.run(4);
    const settled = r.applied.length;
    assert.ok(r.governor.getScale() <= 0.7, `seed ${seed}: scale after 4 s ${r.governor.getScale()}`);
    let nativeFrames = 0;
    let frames = 0;
    for (let i = 0; i < 1200; i++) { r.run(0.1); frames++; if (r.governor.getScale() > 0.95) nativeFrames++; }
    assert.ok(nativeFrames / frames < 0.02, `seed ${seed}: share of two minutes at native ${(nativeFrames / frames).toFixed(2)}`);
    assert.ok(r.applied.length - settled <= 24, `seed ${seed}: changes in two minutes ${r.applied.length - settled}`);
    assert.ok(r.governor.getScale() >= 0.5 && r.governor.getScale() <= 0.7, `seed ${seed}: final scale ${r.governor.getScale()}`);
  }
});

test('noisy samples on a pass the main thread feeds slowly: not the floor, not native', () => {
  for (const seed of [5, 13, 47]) {
    const r = rig({ fps: 10, latency: 1, noise: 0.35, seed, costAt: (s) => Math.max(35, 66 * s * s) });
    let floorFrames = 0;
    let nativeFrames = 0;
    let frames = 0;
    for (let i = 0; i < 1200; i++) { r.run(0.1); frames++; if (r.governor.atFloor()) floorFrames++; if (r.governor.getScale() > 0.95) nativeFrames++; }
    assert.ok(floorFrames / frames < 0.15, `seed ${seed}: share at the floor ${(floorFrames / frames).toFixed(2)}`);
    assert.ok(nativeFrames / frames < 0.1, `seed ${seed}: share at native ${(nativeFrames / frames).toFixed(2)}`);
  }
});

function runCadence(governor, seconds, { workMs, gpuMs = null, atFloor = false, gpuBound = false }) {
  let t = 0;
  while (t < seconds) {
    const cap = governor.getCap();
    const fits = workMs <= 15 && !gpuBound;
    const dt = cap === 60 && !fits ? 1 / 45 : 1 / cap;
    governor.update(dt, workMs, gpuMs, atFloor);
    t += dt;
  }
  return governor.getCap();
}

test('Auto cadence: 30 until the frame proves it holds 60, then 60', () => {
  const g = createAutoPresentationGovernor();
  assert.equal(g.getCap(), 30);
  assert.equal(runCadence(g, 3, { workMs: 9 }), 30, 'three clean seconds are not enough');
  assert.equal(runCadence(g, 20, { workMs: 9 }), 60);
  assert.equal(runCadence(g, 60, { workMs: 9 }), 60, 'it stays');
});

test('Auto cadence: a frame that cannot hold 60 drops to a steady 30 and does not pump', () => {
  const g = createAutoPresentationGovernor();
  runCadence(g, 25, { workMs: 9 });
  assert.equal(g.getCap(), 60);
  assert.equal(runCadence(g, 4, { workMs: 21 }), 30);
  // Marginal load: 12 ms of work at 30, but 19 ms when asked for 60. Count switches in five minutes.
  let switches = 0;
  let last = g.getCap();
  let t = 0;
  while (t < 300) {
    const dt = last === 60 ? 1 / 45 : 1 / 30;
    const cap = g.update(dt, last === 60 ? 19 : 12, null, false);
    if (cap !== last) { switches++; last = cap; }
    t += dt;
  }
  assert.ok(switches <= 8, `switches in five minutes: ${switches}`);
});

test('Auto cadence: an over-budget GPU only counts once resolution is at its floor', () => {
  const g = createAutoPresentationGovernor();
  runCadence(g, 25, { workMs: 9, gpuMs: 10 });
  assert.equal(g.getCap(), 60);
  assert.equal(runCadence(g, 6, { workMs: 9, gpuMs: 20, atFloor: false, gpuBound: true }), 60, 'resolution gives way first');
  assert.equal(runCadence(g, 6, { workMs: 9, gpuMs: 20, atFloor: true, gpuBound: true }), 30);
});

test('the Auto cap applies only to integrated GPUs on the Auto policy; explicit caps never read it', () => {
  const auto = { qualityMode: 'auto' };
  assert.equal(autoPresentationCapFor({ tier: 'integrated' }, auto, {}), 30);
  assert.equal(autoPresentationCapFor({ tier: 'integrated' }, auto, { autoPresentCap: 60 }), 60);
  assert.equal(autoPresentationCapFor({ tier: 'integrated' }, auto, { autoPresentCap: 45 }), 30);
  assert.equal(autoPresentationCapFor({ tier: 'discrete' }, auto, { autoPresentCap: 60 }), 0);
  assert.equal(autoPresentationCapFor({ tier: 'integrated' }, { qualityMode: 'manual' }, { autoPresentCap: 60 }), 0);
});
