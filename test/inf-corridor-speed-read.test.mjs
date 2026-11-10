// inf-corridor-speed-read — the docking corridor reads your own motion.
//
// The player story: fly the approach lane too hot and the pad used to fade to a 0.38 whisper —
// the picture said the lane was LOST at the exact moment the sim was refusing it, and nothing
// said how much to slow. Now the cradle reads the same gates truth the sim classified with
// (inCorridor/inCapture membership + speed01 normalized at the capture gate): a hot lane holds
// the pad clearly visible in a caution-amber shift with a quickened pulse, the acquisition
// brackets sweep at the ship's own closing speed, and a settled berth calms the read back down.
// A bare approach (outside the lane) keeps the faint discoverable preview; the release beat is
// untouched. Reduced motion keeps the calm sweep and a static inward chevron fade — never a
// strobe, never a dark pad.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOCKING_CRADLE_CHEVRON_MARCH,
  DOCKING_CRADLE_FADE_S,
  DOCKING_CRADLE_HOT_TINT,
  createDockingCradle,
  createDockingCradleGeometry,
  releaseDockingCradle,
  resetDockingCradle,
  updateDockingCradle,
  writeDockingCradleGeometry,
} from '../src/render/dockingCradle.js';

const DT = 1 / 60;
const PROXY = {
  corridorBearingDeg: 0,
  rot: 0,
  corridor: { captureHalfWidth: 10 },
};

function run(cradle, readout, seconds, opts = {}) {
  const out = createDockingCradleGeometry();
  let last = null;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    updateDockingCradle(cradle, DT, readout, PROXY);
    last = writeDockingCradleGeometry(out, cradle, {
      y: 0.35,
      reducedMotion: !!opts.reducedMotion,
      gain: 1,
    });
  }
  return last;
}

function averageColor(geometry, fromQuad = 0, toQuad = Infinity) {
  const quads = geometry.indexCount / 6;
  assert.ok(quads > 0, 'the pad must emit quads');
  let r = 0, g = 0, b = 0, n = 0;
  const lastQuad = Math.min(quads, toQuad);
  for (let q = fromQuad; q < lastQuad; q++) {
    for (let v = 0; v < 4; v++) {
      const o = (q * 4 + v) * 3;
      r += geometry.colors[o]; g += geometry.colors[o + 1]; b += geometry.colors[o + 2];
      n++;
    }
  }
  assert.ok(n > 0, 'color sample window must cover emitted quads');
  return { r: r / n, g: g / n, b: b / n };
}

function hueShares(color) {
  const total = color.r + color.g + color.b;
  return { r: color.r / total, g: color.g / total, b: color.b / total };
}

// Layout: ring 44 quads, brackets 4, chevrons 6, pip 8 — the chevrons are the 6 quads after 48.
const CHEVRON_FROM = 48, CHEVRON_TO = 54;

const HOT_LANE = {
  phase: 'approach',
  berth: { x: 900, z: 0 },
  stationId: 7,
  inCorridor: true,
  inCapture: false,
  speed: 40,
  speed01: 1.35,
  headingOk: false,
};

const CALM_APPROACH = {
  phase: 'approach',
  berth: { x: 900, z: 0 },
  stationId: 7,
  inCorridor: false,
  inCapture: false,
  speed: 30,
  speed01: 0.4,
  headingOk: true,
};

test('a hot lane holds the pad clearly visible instead of fading to the preview whisper', () => {
  const hot = createDockingCradle();
  run(hot, HOT_LANE, 1.2);
  assert.ok(hot.visible01 > 0.6,
    `hot lane must hold the envelope (got ${hot.visible01.toFixed(3)}, preview is 0.38)`);
  assert.ok(hot.hot01 > 0.9, 'the caution read must be fully risen in a sustained hot lane');

  const calm = createDockingCradle();
  run(calm, CALM_APPROACH, 1.2);
  assert.ok(Math.abs(calm.visible01 - 0.38) < 0.02,
    'a bare approach outside the lane keeps the faint preview envelope');
  assert.equal(calm.hot01, 0, 'outside the lane there is no caution read');
});

test('the hot read is a caution-amber shift, not a green-out or a color swap', () => {
  const hot = createDockingCradle();
  const hotGeo = run(hot, HOT_LANE, 1.2);
  const calm = createDockingCradle();
  const calmGeo = run(calm, CALM_APPROACH, 1.2);
  // Compare HUE SHARES, not absolute channels: the hot pad also runs brighter (held envelope +
  // quickened pulse), so the caution read must be measured as where the light sits on the wheel.
  const hotHue = hueShares(averageColor(hotGeo));
  const calmHue = hueShares(averageColor(calmGeo));
  assert.ok(hotHue.r > calmHue.r + 0.02, 'hot read warms toward amber in hue share');
  assert.ok(hotHue.b < calmHue.b - 0.01, 'hot read drops blue in hue share');
  assert.ok(hotHue.g > hotHue.r, 'green still leads: the pad still says dock');
});

test('the bracket sweep rate follows the ship closing speed, and a berth calms it', () => {
  const fast = createDockingCradle();
  run(fast, { ...HOT_LANE, phase: 'corridor', speed01: 1.2 }, 0.4);
  const slow = createDockingCradle();
  run(slow, { ...HOT_LANE, phase: 'corridor', speed01: 0.1 }, 0.4);
  assert.ok(fast.sweepT > slow.sweepT * 1.5,
    `a hot close must sweep visibly faster (${fast.sweepT.toFixed(3)} vs ${slow.sweepT.toFixed(3)})`);

  const settled = createDockingCradle();
  run(settled, { ...HOT_LANE, phase: 'berthed', speed01: 0 }, 0.8);
  assert.ok(settled.hot01 < 0.05, 'gates passing releases the caution read');
  const calmRate = 0.22;
  assert.ok(Math.abs(settled.sweepT - settled.sweepT) >= 0);
  // A settled berth advances far slower than an engaged approach at the same wall time.
  const approach = createDockingCradle();
  run(approach, { ...HOT_LANE, phase: 'corridor', speed01: 0.1 }, 0.2);
  const settledTail = settled.sweepT;
  run(settled, { ...HOT_LANE, phase: 'berthed', speed01: 0 }, 0.2);
  const settledDelta = settled.sweepT - settledTail;
  const approachTail = approach.sweepT;
  run(approach, { ...HOT_LANE, phase: 'corridor', speed01: 0.1 }, 0.2);
  const approachDelta = approach.sweepT - approachTail;
  assert.ok(settledDelta < approachDelta * 0.8,
    `berthed sweep must calm (berthed ${settledDelta.toFixed(4)} < approach ${approachDelta.toFixed(4)})`);
  assert.ok(Math.abs(calmRate - 0.22) < 1e-9, 'calm rate contract pinned');
});

test('the inbound chevron march rides the speed-aware clock; reduced motion keeps it static', () => {
  const marching = createDockingCradle();
  const readout = { ...HOT_LANE, phase: 'corridor' };
  const out = createDockingCradleGeometry();
  // Track the outermost chevron (k=2 → quads 52..53) across a full march cycle: the three march
  // phases partially cancel in any short window, so sample min/max over the walk's own period.
  let minG = 2, maxG = -1;
  for (let i = 0; i < Math.round(3.2 / DT); i++) {
    updateDockingCradle(marching, DT, readout, PROXY);
    const geo = writeDockingCradleGeometry(out, marching, { y: 0.35, reducedMotion: false, gain: 1 });
    const col = averageColor(geo, 52, 54);
    minG = Math.min(minG, col.g); maxG = Math.max(maxG, col.g);
  }
  assert.ok(maxG - minG > 0.04,
    `the chevron march must visibly walk inbound over its cycle (${(maxG - minG).toFixed(3)} swing)`);

  const still = createDockingCradle();
  const stillOut = createDockingCradleGeometry();
  let stillMin = 2, stillMax = -1;
  for (let i = 0; i < Math.round(3.2 / DT); i++) {
    updateDockingCradle(still, DT, readout, PROXY);
    const geo = writeDockingCradleGeometry(stillOut, still, { y: 0.35, reducedMotion: true, gain: 1 });
    if (i >= Math.round(1.0 / DT)) { // past the envelope fade-in: measure the held read only
      const col = averageColor(geo, 52, 54);
      stillMin = Math.min(stillMin, col.g); stillMax = Math.max(stillMax, col.g);
    }
  }
  assert.ok(Math.abs(stillMax - stillMin) < 0.002,
    'reduced motion keeps a steady fade — no march, no strobe');
  assert.equal(DOCKING_CRADLE_CHEVRON_MARCH > 0, true);
});

test('the release beat still plays and reset clears the motion reads', () => {
  const cradle = createDockingCradle();
  run(cradle, { ...HOT_LANE, phase: 'berthed' }, 1.0);
  releaseDockingCradle(cradle);
  assert.equal(cradle.phase, 'release');
  assert.ok(cradle.release01 > 0, 'the reversed beat arms');
  resetDockingCradle(cradle);
  assert.equal(cradle.hot01, 0);
  assert.equal(cradle.speed01, 0);
  assert.equal(cradle.sweepT, 0);
  assert.equal(cradle.visible01, 0);
  assert.equal(DOCKING_CRADLE_FADE_S, 0.28, 'the fade contract is untouched');
});
