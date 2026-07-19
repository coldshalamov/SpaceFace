#!/usr/bin/env node
// Bounding probe for the high-speed speed-line overlay (src/render/feel.js).
//
// The defect this pins: `intensity` was documented as a 0..1 drive but never clamped. It is
// speed/maxSpeed, and cruise/long-distance travel push that ratio well past 1 — ratio 10 produced
// intensity 15.5, opacity 4.65, 231 streaks, and a per-streak alpha of ~4.4 that saturated the
// 'lighter' composite to fully opaque white. The screen washed out at exactly the moment the player
// most needs to see where they are going.
//
// This probe imports the shipped drive function rather than replicating it, so it cannot drift from
// the code it guards. It asserts two different things at once:
//   1. HARD CEILINGS hold across absurd inputs (including Infinity and NaN) — nothing runs away.
//   2. ORDINARY GAMEPLAY IS UNCHANGED — the values at speedRatio 0.5 and 1.0 are pinned as literals
//      against the pre-fix formulas, so the bounding work cannot quietly restyle normal flight.
import assert from 'node:assert/strict';
import {
  speedLineDrive,
  speedLineCenterGate,
  SL_STREAK_MAX,
  SL_OPACITY_MAX,
  SL_ALPHA_MAX,
  SL_LEN_SCALE_MAX,
  SL_FLOW_MAX,
} from '../src/render/feel.js';

const MAX_SPEED = 150;   // a representative hull maxSpeed (propulsionCatalog: 150-168)
const BRIGHT_MAX = 0.95; // largest per-streak brightness `b` that _newStreak can roll (0.40 + 0.55)
const RATIOS = [0, 0.3, 0.38, 0.5, 1, 2, 5, 10, 25, 50, 100, 1000, Infinity, NaN];

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`ok    ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${label}\n      ${error?.message || error}`);
  }
}

// The ORIGINAL, unbounded formulas — kept here only so the before/after table reports real numbers
// instead of remembered ones. Never imported by the game.
function driveBefore(speed, maxSpeed, boosting, motionReduce) {
  const maxSpd = Math.max(1, maxSpeed || 1);
  const speedRatio = speed / maxSpd;
  let intensity = 0;
  let targetOpacity = 0;
  if (boosting) { targetOpacity = 0.55; intensity = 1; }
  else if (speedRatio > 0.38) { intensity = (speedRatio - 0.38) / 0.62; targetOpacity = intensity * 0.30; }
  if (motionReduce) { targetOpacity *= 0.45; intensity *= 0.55; }
  const baseFlow = 220 + speed * 1.2;
  const flowSpeed = baseFlow * (0.55 + 0.75 * intensity) * (boosting ? 1.55 : 1.0);
  const lenScale = (0.18 + 1.1 * speedRatio) * (boosting ? 1.15 : 1.0);
  const count = Math.round((boosting ? 46 : 28) * (0.50 + 0.50 * intensity));
  return { intensity, targetOpacity, count, lenScale, flowSpeed, maxAlpha: targetOpacity * BRIGHT_MAX };
}

const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(4)) : String(v));

// ---------------------------------------------------------------- ceilings hold everywhere
for (const boosting of [false, true]) {
  for (const motionReduce of [false, true]) {
    check(`ceilings hold (boost=${boosting} motionReduce=${motionReduce})`, () => {
      for (const ratio of RATIOS) {
        const speed = ratio * MAX_SPEED;
        const d = speedLineDrive(speed, MAX_SPEED, boosting, motionReduce);
        const where = `ratio=${ratio}`;

        for (const [key, value] of Object.entries(d)) {
          assert.ok(Number.isFinite(value), `${where}: ${key} must be finite, got ${value}`);
        }
        assert.ok(d.intensity >= 0 && d.intensity <= 1, `${where}: intensity ${d.intensity} outside [0,1]`);
        assert.ok(Number.isInteger(d.count), `${where}: count ${d.count} is not an integer`);
        assert.ok(d.count >= 0 && d.count <= SL_STREAK_MAX, `${where}: count ${d.count} > SL_STREAK_MAX ${SL_STREAK_MAX}`);
        assert.ok(d.targetOpacity <= SL_OPACITY_MAX, `${where}: targetOpacity ${d.targetOpacity} > SL_OPACITY_MAX`);
        assert.ok(d.maxAlpha <= SL_ALPHA_MAX, `${where}: maxAlpha ${d.maxAlpha} > SL_ALPHA_MAX`);
        assert.ok(d.maxAlpha < 1.0, `${where}: maxAlpha ${d.maxAlpha} reaches opaque — additive whiteout`);
        assert.ok(d.lenScale <= SL_LEN_SCALE_MAX, `${where}: lenScale ${d.lenScale} > SL_LEN_SCALE_MAX`);
        assert.ok(d.flowSpeed <= SL_FLOW_MAX, `${where}: flowSpeed ${d.flowSpeed} > SL_FLOW_MAX`);
      }
    });
  }
}

// ---------------------------------------------------------------- ordinary gameplay unchanged
// If any of these move, the bounding work has restyled normal flight and the change is not a fix.
const TOL = 1e-6;
function pin(label, actual, expected) {
  check(label, () => {
    assert.equal(actual.count, expected.count, `count ${actual.count} != ${expected.count}`);
    for (const key of ['intensity', 'targetOpacity', 'lenScale', 'maxAlpha', 'flowSpeed']) {
      assert.ok(Math.abs(actual[key] - expected[key]) < TOL,
        `${key} ${actual[key]} != ${expected[key]} (tol ${TOL})`);
    }
  });
}

pin('unchanged: cruise at speedRatio 0.5', speedLineDrive(0.5 * MAX_SPEED, MAX_SPEED, false, false), {
  intensity: 0.1935483870967742,
  targetOpacity: 0.058064516129032254,
  count: 17,
  lenScale: 0.73,
  flowSpeed: 215.5,
  maxAlpha: 0.05516129032258064,
});
pin('unchanged: top of ordinary range, speedRatio 1.0', speedLineDrive(MAX_SPEED, MAX_SPEED, false, false), {
  intensity: 1,
  targetOpacity: 0.3,
  count: 28,
  lenScale: 1.28,
  flowSpeed: 520,
  maxAlpha: 0.285,
});
pin('unchanged: boosting at speedRatio 1.0', speedLineDrive(MAX_SPEED, MAX_SPEED, true, false), {
  intensity: 1,
  targetOpacity: 0.55,
  count: 46,
  lenScale: 1.472,
  flowSpeed: 806,
  maxAlpha: 0.5225,
});

check('no ceiling binds on legitimate flight (boost at full speed)', () => {
  const boost = speedLineDrive(MAX_SPEED, MAX_SPEED, true, false);
  assert.equal(boost.count, SL_STREAK_MAX, 'boost count should reach the ceiling exactly, not be cut by it');
  assert.ok(boost.lenScale < SL_LEN_SCALE_MAX, `lenScale ceiling ${SL_LEN_SCALE_MAX} must not bind at ${boost.lenScale}`);
  assert.ok(boost.maxAlpha <= SL_ALPHA_MAX, `alpha ceiling must not cut the designed boost look`);
  assert.ok(boost.flowSpeed < SL_FLOW_MAX, `flow ceiling ${SL_FLOW_MAX} must not bind at ${boost.flowSpeed}`);
});

// ---------------------------------------------------------------- motion-reduce stays reduced
check('motionReduce stays strictly quieter than full motion at every speed', () => {
  for (const boosting of [false, true]) {
    for (const ratio of RATIOS) {
      const speed = ratio * MAX_SPEED;
      const full = speedLineDrive(speed, MAX_SPEED, boosting, false);
      const reduced = speedLineDrive(speed, MAX_SPEED, boosting, true);
      assert.ok(reduced.intensity <= full.intensity, `ratio=${ratio}: mr intensity ${reduced.intensity} > ${full.intensity}`);
      assert.ok(reduced.targetOpacity <= full.targetOpacity, `ratio=${ratio}: mr opacity rose`);
      assert.ok(reduced.count <= full.count, `ratio=${ratio}: mr streak count rose`);
      assert.ok(reduced.maxAlpha <= full.maxAlpha, `ratio=${ratio}: mr alpha rose`);
    }
  }
  // the historical 0.45 / 0.55 split, applied as two separate factors
  const mr = speedLineDrive(MAX_SPEED, MAX_SPEED, false, true);
  assert.ok(Math.abs(mr.targetOpacity - 0.3 * 0.45) < TOL, `mr opacity ${mr.targetOpacity} != 0.135`);
  assert.ok(Math.abs(mr.intensity - 0.55) < TOL, `mr intensity ${mr.intensity} != 0.55`);
});

// ---------------------------------------------------------------- degenerate inputs
check('degenerate maxSpeed / velocity inputs stay finite and silent', () => {
  for (const [speed, maxSpeed] of [[0, 0], [10, 0], [NaN, NaN], [Infinity, Infinity], [-50, 150], [1e12, 1]]) {
    const d = speedLineDrive(speed, maxSpeed, false, false);
    for (const [key, value] of Object.entries(d)) {
      assert.ok(Number.isFinite(value), `speed=${speed} maxSpeed=${maxSpeed}: ${key} = ${value}`);
    }
    assert.ok(d.maxAlpha <= SL_ALPHA_MAX && d.count <= SL_STREAK_MAX,
      `speed=${speed} maxSpeed=${maxSpeed}: ceilings breached`);
  }
});

// ---------------------------------------------------------------- centre exclusion
// The ship, reticle and tracked destination must stay legible at every speed.
const CLEAR_R = 1080 * 0.075;
const FADE_W = 1080 * 0.085;
check('centre exclusion: a streak lying across the ship draws nothing', () => {
  // lead exactly at centre
  assert.equal(speedLineCenterGate(0, 200, 0, CLEAR_R, FADE_W), 0, 'lead at centre must gate to 0');
  // lead has cleared the disc but the TAIL still crosses it — the case a lead-point-only test misses
  assert.equal(speedLineCenterGate(CLEAR_R * 0.9, 400, 0, CLEAR_R, FADE_W), 0, 'tail across centre must gate to 0');
  // exactly on the clear radius, laterally
  assert.equal(speedLineCenterGate(0, 200, CLEAR_R, CLEAR_R, FADE_W), 0, 'on the clear radius must gate to 0');
});
check('centre exclusion: streaks well clear of the ship are untouched', () => {
  assert.equal(speedLineCenterGate(900, 200, 400, CLEAR_R, FADE_W), 1, 'far streak must gate to 1 (no dimming)');
  assert.equal(speedLineCenterGate(-900, 200, 0, CLEAR_R, FADE_W), 1, 'far approaching streak must gate to 1');
  const mid = speedLineCenterGate(0, 0, CLEAR_R + FADE_W * 0.5, CLEAR_R, FADE_W);
  assert.ok(Math.abs(mid - 0.5) < TOL, `fade band should be linear, got ${mid}`);
});
check('centre exclusion: non-finite geometry fails dark, never bright', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(speedLineCenterGate(bad, 100, 0, CLEAR_R, FADE_W), 0, `uv=${bad} must gate to 0`);
    assert.equal(speedLineCenterGate(0, 100, bad, CLEAR_R, FADE_W), 0, `p=${bad} must gate to 0`);
  }
  assert.equal(speedLineCenterGate(500, 100, 0, CLEAR_R, 0), 0, 'zero-width fade band must gate to 0');
});

// ---------------------------------------------------------------- before/after evidence table
console.log('\nBEFORE (unbounded) vs AFTER (bounded) — maxSpeed=150, motionReduce=off');
for (const boosting of [false, true]) {
  console.log(`\n  boosting=${boosting}`);
  console.log('  ratio     | intensity          | targetOpacity      | count     | lenScale           | maxAlpha');
  console.log('  ----------+--------------------+--------------------+-----------+--------------------+-------------------');
  for (const ratio of RATIOS) {
    const speed = ratio * MAX_SPEED;
    const b = driveBefore(speed, MAX_SPEED, boosting, false);
    const a = speedLineDrive(speed, MAX_SPEED, boosting, false);
    const col = (before, after) => `${fmt(before).padStart(8)}→${fmt(after).padStart(9)}`;
    const intCol = (before, after) => `${String(before).padStart(4)}→${String(after).padStart(4)}`;
    console.log(`  ${String(ratio).padEnd(9)} | ${col(b.intensity, a.intensity)} | ${col(b.targetOpacity, a.targetOpacity)} | ${intCol(b.count, a.count)} | ${col(b.lenScale, a.lenScale)} | ${col(b.maxAlpha, a.maxAlpha)}`);
  }
}

console.log(`\nceilings: streaks<=${SL_STREAK_MAX} opacity<=${SL_OPACITY_MAX} alpha<=${SL_ALPHA_MAX} lenScale<=${SL_LEN_SCALE_MAX} flow<=${SL_FLOW_MAX}px/s`);
if (failures > 0) {
  console.error(`\nFAIL check:speed-lines — ${failures} failing group(s)`);
  process.exit(1);
}
console.log('\nPASS check:speed-lines');
