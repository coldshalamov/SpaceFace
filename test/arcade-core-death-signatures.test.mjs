// AC-09: five cause-readable death signatures on the live phased VFX route.
//
// Proof is motion grammar through the real queue → resident → emitter facade.
// Color may support a cue (cyan chain core, reentry heat) but cannot be the identity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PhasedExplosionLifecycle } from '../src/render/combat/phasedExplosions.js';
import { vfx } from '../src/render/vfx.js';

const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const flashKind = Number(source.match(/const SPR_FLASH = (\d+);/)[1]);
const ringKind = Number(source.match(/const SPR_RING = (\d+);/)[1]);

const STYLES = Object.freeze([
  'ordinary',
  'terrain_smash',
  'chain',
  'well_collapse',
  'burn_up',
]);

const ORIGIN = Object.freeze({ x: 4, z: -2 });
const FORWARD = Object.freeze({ x: 1, z: 0 });
const DESCENT = Object.freeze({ x: 0.6, z: 0.8 });

function spriteKind(call) {
  return call.type === 'sprite' ? call.args[0] : null;
}

function streakAxis(call) {
  return { x: Number(call.args[10]), z: Number(call.args[11]) };
}

function streakVelocity(call) {
  return { x: Number(call.args[8]), z: Number(call.args[9]) };
}

function meanDot(calls, axis) {
  const streaks = calls.filter((call) => call.type === 'streak');
  assert.ok(streaks.length > 0, 'motion grammar needs structural streaks');
  let sum = 0;
  for (const call of streaks) {
    const axisVec = streakAxis(call);
    const vel = streakVelocity(call);
    const heading = Math.hypot(vel.x, vel.z) > 1e-8 ? vel : axisVec;
    const len = Math.hypot(heading.x, heading.z) || 1;
    sum += (heading.x * axis.x + heading.z * axis.z) / len;
  }
  return sum / streaks.length;
}

function inwardShare(calls, origin = ORIGIN) {
  const streaks = calls.filter((call) => call.type === 'streak');
  assert.ok(streaks.length > 0);
  let inward = 0;
  for (const call of streaks) {
    const px = Number(call.args[0]) - origin.x;
    const pz = Number(call.args[2]) - origin.z;
    const vel = streakVelocity(call);
    if (px * vel.x + pz * vel.z < -1e-6) inward += 1;
  }
  return inward / streaks.length;
}

function maxSpread(calls, axis) {
  const axisAngle = Math.atan2(axis.z, axis.x);
  let max = 0;
  for (const call of calls.filter((entry) => entry.type === 'streak')) {
    const heading = streakAxis(call);
    const angle = Math.atan2(heading.z, heading.x);
    const delta = Math.abs(Math.atan2(Math.sin(angle - axisAngle), Math.cos(angle - axisAngle)));
    if (delta > max) max = delta;
  }
  return max;
}

function longestStreakLife(calls) {
  return Math.max(0, ...calls.filter((call) => call.type === 'streak').map((call) => Number(call.args[3])));
}

function motionFingerprint(calls, axis) {
  return [
    `streaks:${calls.filter((call) => call.type === 'streak').length}`,
    `inward:${inwardShare(calls).toFixed(2)}`,
    `dot:${meanDot(calls, axis).toFixed(2)}`,
    `spread:${maxSpread(calls, axis).toFixed(2)}`,
    `life:${longestStreakLife(calls).toFixed(2)}`,
    `phases:${[...new Set(calls.map((call) => call.phase))].join(',')}`,
  ].join('|');
}

function presentationFor(styleId, overrides = {}) {
  const causeByStyle = {
    ordinary: 'kinetic',
    terrain_smash: 'terrain_collision',
    chain: 'ship_collision',
    well_collapse: 'generic',
    burn_up: 'generic',
  };
  const direction = overrides.direction || (styleId === 'burn_up' ? DESCENT : FORWARD);
  const targetVelocity = overrides.targetVelocity || (
    styleId === 'burn_up' ? { x: 18, z: 24 } : { x: 16, z: 0 }
  );
  return {
    version: 1,
    cause: overrides.cause ?? causeByStyle[styleId],
    position: overrides.position || { ...ORIGIN },
    direction,
    normal: overrides.normal || { x: -1, z: 0 },
    targetVelocity,
    style: {
      version: 1,
      id: styleId,
      multiplier: 1,
      chainDepth: overrides.chainDepth ?? (styleId === 'chain' ? 1 : 0),
    },
  };
}

function makeHarness({ reduced = false, motionReduce = reduced, flashReduce = reduced } = {}) {
  const calls = [];
  let phase = null;
  const harness = Object.create(vfx);
  harness._scene = true;
  harness._burst = 1;
  harness.state = {
    playerId: 1,
    settings: {
      video: { particleQuality: 'low', motionReduce },
      accessibility: { flashReduce },
    },
  };
  harness.bus = { emit: (...args) => calls.push({ type: 'bus', phase, args }) };
  harness._spawnSprite = (...args) => calls.push({ type: 'sprite', phase, args });
  harness._spawnProjectileTrailStreak = (...args) => calls.push({ type: 'streak', phase, args });
  harness._spawnParticle = (...args) => calls.push({ type: 'particle', phase, args });
  harness._impactParticleCone = (...args) => calls.push({ type: 'cone', phase, args });
  harness._flashLight = (...args) => calls.push({ type: 'light', phase, args });
  harness._explosions = new PhasedExplosionLifecycle({ capacity: 24 });
  harness._explosionEmitter = (emitPhase, entry) => {
    phase = emitPhase;
    return harness._emitExplosionPhase(emitPhase, entry);
  };
  return { harness, calls };
}

function playStyle(styleId, options = {}) {
  const { harness, calls } = makeHarness(options);
  const payload = {
    id: 9,
    type: 'ship',
    radius: options.radius ?? 10,
    presentation: options.presentation || presentationFor(styleId, options),
  };
  assert.equal(harness._queueExplosion(payload, options.classId || 'ordinary'), true);
  const live = harness._explosions.entries.find((candidate) => candidate.active);
  const entry = {
    cause: live.cause,
    styleId: live.styleId,
    chainDepth: live.chainDepth,
    x: live.x,
    z: live.z,
    dirX: live.dirX,
    dirZ: live.dirZ,
    radius: live.radius,
    capacity: harness._explosions.capacity,
  };
  harness._explosions.update(10, harness._explosionEmitter);
  return { harness, calls, entry, payload };
}

test('queue carries style separately from legacy cause and fails malformed style to ordinary', () => {
  const smash = playStyle('terrain_smash');
  assert.equal(smash.entry.cause, 'terrain_collision');
  assert.equal(smash.entry.styleId, 'terrain_smash');
  assert.deepEqual({ x: smash.entry.x, z: smash.entry.z }, ORIGIN);
  assert.ok(smash.entry.dirX > 0.9);

  const swapped = playStyle('terrain_smash', {
    presentation: presentationFor('terrain_smash', { cause: 'kinetic' }),
  });
  assert.equal(swapped.entry.cause, 'kinetic', 'legacy cause is never overwritten by style');
  assert.equal(swapped.entry.styleId, 'terrain_smash');
  assert.notDeepEqual(
    smash.calls.map((call) => `${call.type}:${call.phase}`),
    playStyle('ordinary', {
      presentation: presentationFor('ordinary', { cause: 'terrain_collision' }),
    }).calls.map((call) => `${call.type}:${call.phase}`),
    'terrain smash must not reuse the ordinary terrain-collision recipe',
  );

  const { harness } = makeHarness();
  assert.equal(harness._queueExplosion({
    id: 11,
    radius: 8,
    presentation: {
      cause: 'ship_collision',
      position: { x: 1, z: 2 },
      direction: { x: 0, z: 1 },
      style: { id: 'not-a-real-style', chainDepth: 9 },
    },
  }, 'ordinary'), true);
  const bad = harness._explosions.entries.find((candidate) => candidate.active);
  assert.equal(bad.cause, 'ship_collision');
  assert.equal(bad.styleId, 'ordinary');
  assert.equal(bad.chainDepth, 0);

  const { harness: missing } = makeHarness();
  assert.equal(missing._queueExplosion({
    id: 12,
    pos: { x: 3, z: 4 },
    direction: { x: 1, z: 0 },
    cause: 'explosive',
  }, 'ordinary'), true);
  const legacy = missing._explosions.entries.find((candidate) => candidate.active);
  assert.equal(legacy.cause, 'explosive');
  assert.equal(legacy.styleId, 'ordinary');
});

test('five styles produce distinct motion grammars on the live queue/resident/emitter facade', () => {
  const fingerprints = [];
  const plays = {};
  for (const styleId of STYLES) {
    const result = playStyle(styleId);
    plays[styleId] = result;
    assert.equal(result.entry.styleId, styleId);
    assert.equal(result.harness._explosions.capacity, 24);
    assert.equal(result.calls.some((call) => spriteKind(call) === ringKind), false,
      `${styleId} may not use a circular ring as its signature`);
    fingerprints.push(motionFingerprint(result.calls, styleId === 'burn_up' ? DESCENT : FORWARD));
  }
  assert.equal(new Set(fingerprints).size, STYLES.length,
    'shape, axis, inward share, and duration must distinguish the five deaths without color');

  const ordinary = plays.ordinary.calls;
  const smash = plays.terrain_smash.calls;
  const chain = plays.chain.calls;
  const well = plays.well_collapse.calls;
  const burn = plays.burn_up.calls;

  assert.ok(meanDot(smash, FORWARD) > 0.72, 'terrain smash sprays forward along the impact');
  assert.ok(maxSpread(smash, FORWARD) < 1.05, 'terrain smash stays a cone, not a radial flower');
  assert.ok(meanDot(smash, FORWARD) > meanDot(ordinary, FORWARD),
    'terrain smash is more forward-biased than the ordinary tear');

  assert.ok(maxSpread(chain, FORWARD) < 0.45, 'chain transfer stays a narrow body-to-body shear');
  assert.ok(meanDot(chain, FORWARD) > 0.85, 'chain shear follows the incoming direction');
  assert.ok(maxSpread(chain, FORWARD) < maxSpread(ordinary, FORWARD));

  const wellEarly = well.filter((call) => call.phase === 'well-implode' || call.phase === 'internal');
  assert.ok(inwardShare(wellEarly) > 0.8, 'well collapse is identified by inward motion before rupture');
  assert.ok(inwardShare(wellEarly) > inwardShare(ordinary) + 0.4);

  assert.ok(longestStreakLife(burn) > longestStreakLife(ordinary),
    'burn-up holds a sustained shroud rather than a short burst');
  assert.ok(meanDot(burn, DESCENT) > 0.8, 'burn-up fragments continue along the descent vector');
  assert.ok(maxSpread(burn, DESCENT) < 0.7);
});

test('identical receipts replay and rotate with the real impact or descent direction', () => {
  for (const styleId of STYLES) {
    const first = playStyle(styleId).calls;
    const replay = playStyle(styleId).calls;
    assert.deepEqual(replay, first, `${styleId} must replay from the immutable receipt`);
  }

  const smash = playStyle('terrain_smash').calls.filter((call) => call.type === 'streak');
  const smashTurned = playStyle('terrain_smash', {
    direction: { x: 0, z: 1 },
    targetVelocity: { x: 0, z: 16 },
    normal: { x: 0, z: -1 },
  }).calls.filter((call) => call.type === 'streak');
  assert.equal(smashTurned.length, smash.length);
  for (let i = 0; i < smash.length; i++) {
    assert.ok(Math.abs(smashTurned[i].args[10] + smash[i].args[11]) < 1e-9);
    assert.ok(Math.abs(smashTurned[i].args[11] - smash[i].args[10]) < 1e-9);
  }

  const burn = playStyle('burn_up').calls.filter((call) => call.type === 'streak');
  const burnTurned = playStyle('burn_up', {
    direction: { x: -0.8, z: 0.6 },
    targetVelocity: { x: -24, z: 18 },
  }).calls.filter((call) => call.type === 'streak');
  assert.equal(burnTurned.length, burn.length);
  assert.ok(meanDot(burnTurned.map((call) => ({ type: 'streak', args: call.args })), { x: -0.8, z: 0.6 }) > 0.8);
});

test('reduced-flash and reduced-motion keep each style identity with fewer slower dimmer elements', () => {
  for (const styleId of STYLES) {
    const normal = playStyle(styleId);
    const reduced = playStyle(styleId, { reduced: true });
    const normalStreaks = normal.calls.filter((call) => call.type === 'streak');
    const reducedStreaks = reduced.calls.filter((call) => call.type === 'streak');
    assert.ok(reducedStreaks.length > 0, `${styleId} reduced mode still has structural streaks`);
    assert.ok(reducedStreaks.length <= normalStreaks.length,
      `${styleId} reduced mode never adds coverage`);
    const axis = styleId === 'burn_up' ? DESCENT : FORWARD;
    if (styleId === 'well_collapse') {
      const reducedEarly = reduced.calls.filter((call) => (
        call.phase === 'well-implode' || call.phase === 'internal'
      ));
      assert.ok(inwardShare(reducedEarly) > 0.75, 'reduced well collapse still converges inward');
    } else {
      assert.ok(meanDot(reduced.calls, axis) > (styleId === 'ordinary' ? 0.15 : 0.65),
        `${styleId} reduced mode keeps its directional grammar`);
    }
    const reducedCores = reduced.calls.filter((call) => (
      spriteKind(call) === flashKind && Number(call.args[4]) <= 0.16
    ));
    const normalCores = normal.calls.filter((call) => (
      spriteKind(call) === flashKind && Number(call.args[4]) <= 0.16
    ));
    if (normalCores.length && reducedCores.length) {
      assert.ok(Math.max(...reducedCores.map((call) => call.args[7]))
        <= Math.max(...normalCores.map((call) => call.args[7])),
      `${styleId} reduced core is not brighter than the full cue`);
    }
    const reducedTravel = Math.max(...reducedStreaks.map((call) => Math.hypot(call.args[8], call.args[9])));
    const normalTravel = Math.max(...normalStreaks.map((call) => Math.hypot(call.args[8], call.args[9])));
    assert.ok(reducedTravel < normalTravel, `${styleId} reduced travel is slower`);
  }
});

test('white cores stay compact and one-frame; no new pool or parallel explosion route', () => {
  assert.match(source, /new PhasedExplosionLifecycle\(\{ capacity: 24 \}\)/);
  assert.equal((source.match(/new PhasedExplosionLifecycle/g) || []).length, 1);
  assert.match(source, /_onKilled\(p\)[\s\S]{0,250}_queueExplosion/);
  assert.match(source, /_emitStyleExplosionPhase/);
  assert.doesNotMatch(source, /createDeathSignature|DeathSignaturePool|StyleExplosionPool/);
  assert.doesNotMatch(
    source.slice(source.indexOf('  _emitStyleExplosionPhase('), source.indexOf('  _explode(p, big)')),
    /Math\.random/,
  );

  for (const styleId of STYLES) {
    const { calls, entry } = playStyle(styleId);
    const cores = calls.filter((call) => spriteKind(call) === flashKind && Number(call.args[4]) <= 0.16);
    assert.ok(cores.length > 0, `${styleId} still has a compact heat core`);
    for (const core of cores) {
      assert.ok(Number(core.args[5]) <= entry.radius * 0.14,
        `${styleId} core width must stay inside the victim, not fill the frame`);
      assert.ok(Number(core.args[6]) <= entry.radius * 0.36,
        `${styleId} core length must stay compact`);
      assert.ok(Number(core.args[12]) > 1 && Number.isFinite(core.args[13]),
        `${styleId} core stays anisotropic and direction-locked`);
    }
    assert.equal(calls.some((call) => spriteKind(call) === ringKind), false);
  }
});

test('chain depth raises density and radiance inside existing caps without growing coverage', () => {
  const shallow = playStyle('chain', { chainDepth: 1 });
  const deep = playStyle('chain', { chainDepth: 4 });
  const shallowStreaks = shallow.calls.filter((call) => call.type === 'streak');
  const deepStreaks = deep.calls.filter((call) => call.type === 'streak');
  assert.ok(deepStreaks.length >= shallowStreaks.length);
  assert.ok(deepStreaks.length - shallowStreaks.length <= 6,
    'depth may add density, not a second explosion');
  assert.ok(maxSpread(deep.calls, FORWARD) < 0.5, 'deeper chains stay a transfer shear');
  const shallowFlash = shallow.calls.filter((call) => spriteKind(call) === flashKind && Number(call.args[4]) <= 0.16);
  const deepFlash = deep.calls.filter((call) => spriteKind(call) === flashKind && Number(call.args[4]) <= 0.16);
  assert.equal(deepFlash.length, shallowFlash.length);
  assert.ok(Math.max(...deepFlash.map((call) => call.args[5]))
    <= Math.max(...shallowFlash.map((call) => call.args[5])) + 1e-9,
    'depth must not grow the compact core');
  assert.ok(Math.max(...deepStreaks.map((call) => call.args[6]))
    >= Math.max(...shallowStreaks.map((call) => call.args[6])) - 1e-9);
});
