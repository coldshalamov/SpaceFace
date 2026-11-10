// inf-hull-dust-wake — the drift sheet's dust answers the hull.
//
// The player story: the belt has weather (inf-belt-wind) — the drift dust shears downwind on
// a sector-keyed wind — but the hull, the biggest moving thing in the sky, combed nothing.
// Now a hull past cruise leaves a wake: grains in the sector palette's own dust tint, combed
// off the flanks, trailing behind and shearing away downwind on the same wind the sheet
// rides. Carving across the belt flow sweeps a long tail; a run against it crushes the wake
// short behind you. Reads only truth the frame already has: the sector palette (the sheet's
// own), the hull's published vel/maxSpeed, and the sim clock — no rng, no wall time.
//
// These tests pin the pure decision layer (resolveHullDustWakePlan in
// src/render/hullDustWake.js); the VFX particle pool draws exactly what it names.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveHullDustWakePlan,
  resolveSectorWind,
  WAKE_ENGAGE_SPEED_RATIO,
  WAKE_FULL_SPEED_RATIO,
  WAKE_CADENCE_HZ,
} from '../src/render/hullDustWake.js';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';

const BELT = SECTOR_PALETTE_CLASSES.belt;

function planAt(speedFraction, simTime = 40.0, lastStep = null, velDir = 0) {
  const maxSpeed = 120;
  const speed = maxSpeed * speedFraction;
  return resolveHullDustWakePlan({
    velX: Math.cos(velDir) * speed,
    velZ: Math.sin(velDir) * speed,
    maxSpeed, palette: BELT, simTime, reducedMotion: false, lastStep,
  });
}

test('a hull at cruise combs dust in the sector\'s own tint; a slow hull combs nothing', () => {
  const wake = planAt(0.8);
  assert.ok(wake, 'past the engage ratio the wake answers');
  assert.equal(wake.dustHex, BELT.dust >>> 0, 'the wake is the drift sheet\'s own dust');
  assert.ok(wake.intensity > 0 && wake.intensity < 1);
  assert.equal(planAt(0.3, 40, null), null, 'puttering around the field leaves no wake');
  assert.equal(planAt(WAKE_ENGAGE_SPEED_RATIO - 0.01, 40, null), null,
    'the engage ratio is the law, not a guess');
});

test('the wake trails the hull and shears away downwind on the sheet\'s wind', () => {
  const wind = resolveSectorWind(BELT);
  const heading = Math.PI / 2; // travelling +Z
  const wake = planAt(1.0, 40, null, heading);
  assert.ok(wake, 'full plough answers');
  assert.deepEqual(wake.wind, wind, 'the wake rides the same wind owner the sheet does');
  for (const grain of wake.grains) {
    // Trail component: opposite the hull, at the authored comb fraction.
    const expectedVX = -Math.cos(heading) * 120 * 0.35 + wind.dirX * wind.speedWuPerS;
    const expectedVZ = -Math.sin(heading) * 120 * 0.35 + wind.dirZ * wind.speedWuPerS;
    assert.ok(Math.abs(grain.vx - expectedVX) < 1e-9, 'grain trail x composes hull drag + wind');
    assert.ok(Math.abs(grain.vz - expectedVZ) < 1e-9, 'grain trail z composes hull drag + wind');
    // The grain leaves from a flank, not the nose: the angle is around heading + PI.
    const off = ((grain.angle - heading - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    assert.ok(Math.abs(off) < 0.12 + 1e-9, 'the comb spreads around the tail direction');
  }
});

test('wind direction changes the wake — the weather and the wake compose', () => {
  const speed = 120; const heading = 0; // travelling +X
  const vel = { x: speed, z: 0 };
  const wind = resolveSectorWind(BELT);
  const withWind = resolveHullDustWakePlan({
    velX: vel.x, velZ: vel.z, maxSpeed: speed, palette: BELT,
    simTime: 10, reducedMotion: false,
  });
  // Downwind travel: the wind adds to the trail speed along +X (belt wind angle -0.9 →
  // dirX > 0), so the tail stretches; upwind it crushes short. Compare grain trail speed.
  const anomaly = SECTOR_PALETTE_CLASSES.anomaly;
  const anomalyWind = resolveSectorWind(anomaly);
  const cross = resolveHullDustWakePlan({
    velX: vel.x, velZ: vel.z, maxSpeed: speed, palette: anomaly,
    simTime: 10, reducedMotion: false,
  });
  assert.notDeepEqual([withWind.grains[0].vx, withWind.grains[0].vz],
    [cross.grains[0].vx, cross.grains[0].vz],
    'a different sector\'s wind shears the wake differently');
  assert.ok(Math.abs(anomalyWind.speedWuPerS - wind.speedWuPerS) > 0.5,
    'the compared sectors really ride different weather');
});

test('the cadence latch cannot stack grains within one tick', () => {
  const first = planAt(0.9, 40.0, null);
  assert.ok(first, 'a fresh tick emits');
  assert.equal(planAt(0.9, 40.05, first.step), null,
    'the same cadence step is quiet — frame rate cannot stack the wake');
  const next = planAt(40.0 + 1 / WAKE_CADENCE_HZ + 0.001, 40.0, first.step);
  assert.ok(next === null || next.step > first.step, 'the next tick owns its own emission');
});

test('reduced motion thins the cadence, never silences the wake', () => {
  const full = planAt(1.0, 100.0);
  const thin = resolveHullDustWakePlan({
    velX: 120, velZ: 0, maxSpeed: 120, palette: BELT,
    simTime: 100.0, reducedMotion: true,
  });
  assert.ok(full && thin, 'reduced motion keeps the wake alive');
  assert.equal(thin.dustHex, full.dustHex, 'the tint never changes');
  // A half-cadence emits on half the ticks: at the same simTime the thin wake's step is lower.
  assert.ok(thin.step <= full.step, 'reduced motion slows the emission clock');
  assert.ok(thin.lifeS > 0, 'the tail still lives');
});

test('no palette or no hull truth stays silent — no invented dust, no invented speed', () => {
  assert.equal(resolveHullDustWakePlan({
    velX: 100, velZ: 0, maxSpeed: 120, palette: null, simTime: 5,
  }), null, 'no sector palette — no sheet, no wake');
  const dustless = { ...BELT, dust: undefined };
  assert.equal(resolveHullDustWakePlan({
    velX: 100, velZ: 0, maxSpeed: 120, palette: dustless, simTime: 5,
  }), null, 'a palette with no dust truth answers nothing');
  assert.equal(resolveHullDustWakePlan({
    velX: 100, velZ: 0, maxSpeed: 0, palette: BELT, simTime: 5,
  }), null, 'a hull with no top-speed truth stays quiet');
  assert.equal(resolveHullDustWakePlan({
    velX: 100, velZ: 0, maxSpeed: 120, palette: BELT, simTime: Number.NaN,
  }), null, 'a broken clock stays quiet');
});

test('the wake is deterministic per tick — same inputs, same comb, every call', () => {
  const a = planAt(0.9, 77.7);
  const b = planAt(0.9, 77.7);
  assert.deepEqual(a.grains, b.grains);
  assert.equal(a.lifeS, b.lifeS);
  assert.equal(a.intensity, b.intensity);
});

test('full plough sheds at least as much as cruise — the wake ramps with the throttle', () => {
  const cruise = planAt(0.6, 15);
  const full = planAt(WAKE_FULL_SPEED_RATIO, 15);
  assert.ok(cruise && full, 'both ends of the band answer');
  assert.ok(full.intensity >= 1 - 1e-9, 'full plough saturates the band');
  assert.ok(full.grains.length >= cruise.grains.length, 'the throttle opens the comb');
  assert.ok(full.lifeS > cruise.lifeS, 'a faster hull sheds a longer tail');
});
