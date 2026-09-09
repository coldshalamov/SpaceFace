#!/usr/bin/env node
// BP-02 mining fold: SPIN-AND-DRIFT data contract.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { deriveAsteroidSeams } from '../src/data/mining.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  ASTEROID_MOTION_PROFILE_IDS,
  ASTEROID_MOTION_PROFILES,
  DEFAULT_ASTEROID_MOTION_PROFILE_ID,
  FIELD_ASTEROID_MOTION,
  SEAM_TRACK_RADIUS,
  angularVelocityCapForRadius,
  asteroidMotionProfileById,
  asteroidMotionProfileForField,
  asteroidMotionProfileIdForField,
  distanceSq2D,
  integrateAsteroidMotion,
  projectSeamWorldPoint,
  seamYieldAtContact,
  seededAsteroidMotion,
} from '../src/data/asteroidMotion.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/asteroidMotion.js', import.meta.url)),
  'src/data/asteroidMotion.js exists');

const ROOT = new URL('..', import.meta.url);

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in asteroid-motion path'); };
  Date.now = () => { throw new Error('Date.now in asteroid-motion path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testProfileRosterAndCaps);
guarded(testFieldCoverage);
guarded(testSeededMotionDeterminism);
guarded(testRadiusCap);
guarded(testSeamTracksMovingRock);
testSourceAndPackageContracts();

console.log(`[check-asteroid-motion] PASS - ${sections} sections green`);

function testProfileRosterAndCaps() {
  assert.deepEqual(ASTEROID_MOTION_PROFILE_IDS, Object.keys(ASTEROID_MOTION_PROFILES),
    'profile id list stays in exported object order');
  assert.equal(DEFAULT_ASTEROID_MOTION_PROFILE_ID, 'steady', 'unknown fields default to steady motion');
  assert.equal(asteroidMotionProfileById('missing'), null, 'unknown profile id returns null');
  assert.equal(asteroidMotionProfileIdForField('unknown_field'), 'steady', 'unknown field falls back safely');

  for (const id of ASTEROID_MOTION_PROFILE_IDS) {
    const profile = asteroidMotionProfileById(id);
    assert.equal(profile.id, id, `${id}: lookup returns the exported profile`);
    assert.ok(profile.label.length >= 8, `${id}: readable label exists`);
    assert.ok(profile.fieldTell.length >= 16, `${id}: field tell is meaningful`);
    assert.ok(profile.maxAngularVelocityRadS <= 0.08, `${id}: raw spin cap stays playable`);
    assert.ok(profile.maxDriftSpeed <= 3.5, `${id}: drift cap stays playable`);
    assert.ok(profile.minAngularVelocityRadS <= profile.maxAngularVelocityRadS,
      `${id}: min spin does not exceed max spin`);
  }
  assert.equal(ASTEROID_MOTION_PROFILES.steady.maxAngularVelocityRadS, 0,
    'steady profile is a true no-spin fallback');
  assert.ok(ASTEROID_MOTION_PROFILES.frontier_roll.maxAngularVelocityRadS >
    ASTEROID_MOTION_PROFILES.starter_tumble.maxAngularVelocityRadS,
    'frontier fields demand more seam tracking than starter fields');
  ok('motion profile roster and playability caps are pinned');
}

function testFieldCoverage() {
  const liveFields = new Map();
  for (const sector of SECTORS) {
    for (const field of sector.fields || []) {
      liveFields.set(field.id, { sectorId: sector.id, field });
    }
  }
  assert.equal(liveFields.size, 20, 'all 20 live asteroid fields are discoverable from sectors.js');
  assert.deepEqual([...Object.keys(FIELD_ASTEROID_MOTION)].sort(), [...liveFields.keys()].sort(),
    'the SPIN-AND-DRIFT field table covers every live field and no stale ids');

  const usedProfiles = new Set();
  for (const [fieldId, profileId] of Object.entries(FIELD_ASTEROID_MOTION)) {
    assert.ok(liveFields.has(fieldId), `${fieldId}: field exists in live sector data`);
    assert.ok(ASTEROID_MOTION_PROFILES[profileId], `${fieldId}: profile id exists`);
    usedProfiles.add(profileId);
  }
  assert.ok(usedProfiles.has('starter_tumble'), 'starter-safe fields are explicitly flagged');
  assert.ok(usedProfiles.has('frontier_roll'), 'frontier tracking fields are explicitly flagged');
  assert.ok(usedProfiles.has('anomaly_wobble'), 'anomaly fields are explicitly flagged');
  ok('per-field motion table matches live sector fields');
}

function testSeededMotionDeterminism() {
  const a = seededAsteroidMotion(7317, 'ast_motion_check', 'f_ash_1', 12);
  const b = seededAsteroidMotion(7317, 'ast_motion_check', 'f_ash_1', 12);
  const c = seededAsteroidMotion(7317, 'ast_motion_other', 'f_ash_1', 12);
  assert.deepEqual(b, a, 'same seed/asteroid/field/radius returns identical motion');
  assert.notDeepEqual(c, a, 'different asteroid id changes the seeded spin/drift');
  assert.equal(a.profileId, 'anomaly_wobble', 'field profile is surfaced in the motion readout');
  assert.ok(Math.abs(a.angVel) <= a.angularVelocityCap, 'seeded angular velocity respects its cap');
  assert.ok(Number.isInteger(a.spinSeed) && Number.isInteger(a.driftSeed), 'seed domains are exposed');

  const calls = [];
  seededAsteroidMotion(12, 'ast_probe', 'f_ceres_1', 10, {
    hash32: (...args) => { calls.push(args); return calls.length === 1 ? 101 : 202; },
    mulberry32: (seed) => {
      let n = seed % 3;
      return () => ((++n % 3) + 1) / 4;
    },
  });
  assert.deepEqual(calls[0], [12, 'ast_probe', 'spin'],
    "spin seed uses hash32(seed, asteroidId, 'spin')");
  assert.deepEqual(calls[1], [12, 'ast_probe', 'drift'],
    "drift seed uses hash32(seed, asteroidId, 'drift')");
  ok('seeded spin/drift is deterministic and domain-separated');
}

function testRadiusCap() {
  const smallCap = angularVelocityCapForRadius(6, 'frontier_roll');
  const midCap = angularVelocityCapForRadius(12, 'frontier_roll');
  const largeCap = angularVelocityCapForRadius(30, 'frontier_roll');
  assert.ok(smallCap > midCap, 'small rocks may tumble faster than medium rocks');
  assert.ok(midCap > largeCap, 'large rocks are capped lower than medium rocks');

  const large = seededAsteroidMotion(7317, 'ast_large', 'f_charon_1', 30);
  const small = seededAsteroidMotion(7317, 'ast_small', 'f_charon_1', 6);
  assert.ok(Math.abs(large.angVel) <= largeCap, 'large seeded rock honors the large-rock cap');
  assert.ok(Math.abs(small.angVel) <= smallCap, 'small seeded rock honors the small-rock cap');
  assert.ok(Math.abs(small.angVel) > Math.abs(large.angVel) || smallCap > largeCap,
    'the cap contract allows readable but livelier small rocks');
  ok('angular velocity is capped by asteroid radius');
}

function testSeamTracksMovingRock() {
  const asteroid = {
    id: 'ast_motion_check',
    pos: { x: 140, z: -60 },
    radius: 14,
    rot: 0.15,
  };
  const seams = deriveAsteroidSeams(7317, asteroid.id, asteroid.radius, { count: 1 });
  assert.equal(seams.length, 1, 'test asteroid has a deterministic seam');
  const motion = seededAsteroidMotion(7317, asteroid.id, 'f_ash_1', asteroid.radius);
  assert.notEqual(motion.angVel, 0, 'flagged anomaly field produces spin');

  const initialPoint = projectSeamWorldPoint(asteroid, seams[0]);
  let moved = asteroid;
  let movedPoint = initialPoint;
  let movedDistance = 0;
  for (let dt = 10; dt <= 300; dt += 10) {
    moved = integrateAsteroidMotion(asteroid, motion, dt);
    movedPoint = projectSeamWorldPoint(moved, seams[0]);
    movedDistance = Math.sqrt(distanceSq2D(initialPoint, movedPoint));
    if (movedDistance > SEAM_TRACK_RADIUS + 1) break;
  }

  assert.ok(movedDistance > SEAM_TRACK_RADIUS + 1,
    'a spun/drifting seam moves beyond the hit radius over sustained mining');
  assert.deepEqual(seamYieldAtContact(moved, seams, movedPoint),
    { onSeam: true, mult: 1 },
    'contacting the moved seam still resolves as on-seam yield');
  assert.deepEqual(seamYieldAtContact(moved, seams, initialPoint),
    { onSeam: false, mult: 0.35 },
    'holding the stale contact point falls off the moving seam');

  const integratedAgain = integrateAsteroidMotion(asteroid, motion, 30);
  assert.deepEqual(integratedAgain, integrateAsteroidMotion(asteroid, motion, 30),
    'integration helper is pure and deterministic');
  ok('moving seam geometry still resolves the mining yield multiplier');
}

function testSourceAndPackageContracts() {
  const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));
  assert.equal(pkg.scripts['check:asteroid-motion'], 'node scripts/check-asteroid-motion.mjs',
    'package exposes check:asteroid-motion');

  const dataSource = readFileSync(new URL('src/data/asteroidMotion.js', ROOT), 'utf8');
  assert.doesNotMatch(dataSource, /^import\s/m, 'asteroid motion data has no runtime imports');
  assert.doesNotMatch(dataSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'asteroid motion data does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(dataSource, /credits|cargo\s*=|faction:repDelta|economy:|combat:onHit|new\s+THREE/,
    'asteroid motion data does not write economy, cargo, reputation, combat, or render state');

  const worldSource = readFileSync(new URL('src/systems/world.js', ROOT), 'utf8');
  const miningSource = readFileSync(new URL('src/systems/mining.js', ROOT), 'utf8');
  const miningDataSource = readFileSync(new URL('src/data/mining.js', ROOT), 'utf8');
  const registrySource = readFileSync(new URL('src/core/registry.js', ROOT), 'utf8');
  const hudSource = readFileSync(new URL('src/ui/hud.js', ROOT), 'utf8');
  assert.doesNotMatch(worldSource, /asteroidMotion/, 'packet did not edit the world spawner owner');
  assert.doesNotMatch(miningSource, /asteroidMotion/, 'packet did not edit the mining owner');
  assert.doesNotMatch(miningDataSource, /asteroidMotion/, 'packet did not edit base mining data');
  assert.doesNotMatch(registrySource, /asteroidMotion/, 'data-only packet registers no runtime system');
  assert.doesNotMatch(hudSource, /asteroidMotion/, 'data-only packet does not touch HUD wiring');
  assert.match(miningSource, /const SEAM_HIT_RADIUS = 14;/,
    'check stays aligned to the live seam-hit radius');
  assert.match(miningSource, /function seamWorldPoint\(ast, seam\)[\s\S]*const rot = ast\.rot \|\| 0;/,
    'live seam projection remains rotation-based');
  ok('package script and backend-only scope are pinned');
}
