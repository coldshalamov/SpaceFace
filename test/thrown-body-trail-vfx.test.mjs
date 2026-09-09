import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { resolveThrownBodyTrailPlan } from '../src/render/masslinePresentation.js';
import { updateShipPitchPresentation } from '../src/render/shipPitchPresentation.js';
import { vfx } from '../src/render/vfx.js';

function resolve(overrides = {}, out = {}) {
  return resolveThrownBodyTrailPlan({
    mode: 'tumbling',
    cause: 'thrown',
    playerCaused: true,
    isPlayer: false,
    alive: true,
    velocityX: 120,
    velocityZ: 0,
    radius: 6,
    reduced: false,
    targetRelevant: false,
    ...overrides,
  }, out);
}

test('thrown-body trail is a bounded actual-velocity plan with strict causal gates', () => {
  const plan = resolve();
  assert.equal(plan.active, true);
  assert.equal(plan.axisX, 1);
  assert.equal(plan.axisZ, 0);
  assert.equal(plan.sourceVelocityX, 120);
  assert.equal(plan.sourceVelocityZ, 0);
  assert.equal(plan.residentVelocityX, 42, 'normal residue carries exactly 35% of target velocity');
  assert.equal(plan.residentVelocityZ, 0);
  assert.equal(plan.admissionPriority, 0.92);
  assert.ok(plan.length >= 14 && plan.length <= 52);
  assert.ok(plan.width >= 0.4 && plan.width <= 1.4);
  assert.ok(plan.opacity >= 0.55 && plan.opacity <= 0.85);
  assert.ok(plan.cadenceHz >= 8 && plan.cadenceHz <= 12);

  const rotated = resolve({ velocityX: 0, velocityZ: -120, targetRelevant: true });
  assert.equal(rotated.axisX, 0);
  assert.equal(rotated.axisZ, -1, 'axis rotates exactly with live velocity');
  assert.equal(rotated.residentVelocityX, 0);
  assert.equal(rotated.residentVelocityZ, -42);
  assert.equal(rotated.admissionPriority, 0.98);

  for (const [label, input] of [
    ['wrong cause', { cause: 'struck' }],
    ['generic tumble', { cause: 'generic' }],
    ['collision tumble', { cause: 'collision' }],
    ['drifting', { mode: 'drifting' }],
    ['recovering', { mode: 'recovering' }],
    ['not player caused', { playerCaused: false }],
    ['player craft', { isPlayer: true }],
    ['dead craft', { alive: false }],
    ['threshold speed', { velocityX: 48 }],
    ['nonfinite x', { velocityX: Number.NaN }],
    ['nonfinite z', { velocityZ: Number.POSITIVE_INFINITY }],
    ['overflow speed', { velocityX: Number.MAX_VALUE, velocityZ: Number.MAX_VALUE }],
  ]) {
    assert.equal(resolve(input).active, false, label);
  }
});

test('reduced thrown-body marker remains directional and clears a resident plan in place', () => {
  const resident = resolve({}, {});
  const fullLength = resident.length;
  const fullOpacity = resident.opacity;
  const reduced = resolve({ reduced: true }, resident);
  assert.equal(reduced, resident, 'presentation record stays resident');
  assert.equal(reduced.active, true, 'reduced settings keep one directional marker');
  assert.equal(reduced.axisX, 1);
  assert.equal(reduced.axisZ, 0);
  assert.ok(Math.abs(reduced.residentVelocityX - 21.6) < 1e-12,
    'reduced residue carries exactly 18% of target velocity');
  assert.ok(reduced.length < fullLength && reduced.length <= 22);
  assert.ok(reduced.opacity < fullOpacity && reduced.opacity <= 0.32);
  assert.equal(reduced.cadenceHz, 4);
  assert.ok(reduced.life > 0.25 && reduced.life <= 0.32,
    'the 4 Hz reduced marker overlaps continuously without becoming a bright long-lived streak');

  const cleared = resolve({ mode: 'idle' }, resident);
  assert.equal(cleared, resident);
  assert.equal(cleared.active, false);
  assert.equal(cleared.speed, 0);
  assert.equal(cleared.axisX, 0);
  assert.equal(cleared.axisZ, 0);
  assert.equal(cleared.residentVelocityX, 0);
  assert.equal(cleared.residentVelocityZ, 0);
});

function makeVfxHarness({
  reduced = false,
  targetRelevant = true,
  motionReduce = reduced,
  flashReduce = reduced,
} = {}) {
  const target = {
    id: 2,
    type: 'ship',
    alive: true,
    pos: { x: 30, z: -10 },
    vel: { x: 120, z: 0 },
    rot: 0,
    angVel: 3,
    radius: 6,
    maxSpeed: 140,
    pitch: 0,
    bank: 0,
    flags: { docked: false },
  };
  const state = {
    mode: 'flight',
    playerId: 1,
    player: { targetId: targetRelevant ? target.id : 99 },
    simTime: 2,
    entities: new Map([[target.id, target]]),
    entityList: [target],
    entityIndex: { __spacefaceEntityIndexV1: true, shipLike: [target] },
    combat: {
      entities: {
        2: {
          statuses: {
            status_tumbling: {
              id: 'status_tumbling',
              attackerId: 1,
              data: { cause: 'thrown', startedAt: 1, until: 5, spin: 3 },
            },
          },
        },
      },
    },
    settings: {
      video: {
        particleQuality: 'low',
        engineTrails: false,
        motionReduce,
        flashReduce,
      },
      accessibility: { flashReduce },
    },
    render: { scene: new THREE.Scene() },
    content: {},
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  updateShipPitchPresentation(state, 1 / 60);
  return { bus, state, system, target };
}

function firstStreak(system) {
  assert.ok(system._liveTrailStreakCount > 0, 'expected a live structural streak');
  return system._ts[system._activeTrailStreaks[0]];
}

function spawnResident(system, priority) {
  return system._spawnProjectileTrailStreak(
    0, 0, 0, 10, 0.2, 3, 0.5, '#ffffff', 0, 0, 1, 0, priority,
  );
}

test('VFX emits a cyan-white pooled streak behind the hull with truthful axis and carry', () => {
  const { system, target } = makeVfxHarness();
  const plan = target.presentation.thrownTrail;
  system._updateTumbleBodyLanguageVfx(0.3);

  const streak = firstStreak(system);
  assert.equal(system._liveTrailStreakCount, 1,
    'engineTrails=false and low quality do not delete the causal direction marker');
  assert.ok(Math.abs(streak.x - (target.pos.x - plan.centerOffset)) < 1e-9);
  assert.ok(Math.abs(streak.z - target.pos.z) < 1e-9);
  assert.equal(streak.ax, 1);
  assert.equal(streak.az, 0);
  assert.equal(streak.vx, 42);
  assert.equal(streak.vz, 0);
  assert.equal(streak.admissionPriority, 0.98);
  assert.ok(streak.b > streak.r && streak.g > streak.r, 'marker reads cyan-white, not orange spin');
  assert.ok(target.presentation.tumble.spinRibbon > 0,
    'angular spin remains an independent particle cue rather than trail geometry');
});

test('reduced settings retain one shorter slower marker through low-quality trail suppression', () => {
  const full = makeVfxHarness();
  full.system._updateTumbleBodyLanguageVfx(0.3);
  const fullPlan = full.target.presentation.thrownTrail;
  const fullStreak = firstStreak(full.system);

  const reduced = makeVfxHarness({ reduced: true });
  reduced.system._updateTumbleBodyLanguageVfx(0.3);
  const reducedPlan = reduced.target.presentation.thrownTrail;
  const reducedStreak = firstStreak(reduced.system);

  assert.equal(reduced.system._liveTrailStreakCount, 1);
  assert.ok(reducedPlan.length < fullPlan.length);
  assert.ok(reducedStreak.op0 < fullStreak.op0);
  assert.ok(Math.abs(reducedStreak.vx - 21.6) < 1e-12);
  assert.equal(reducedPlan.cadenceHz, 4);

  const flashOnly = makeVfxHarness({ flashReduce: true });
  for (let frame = 0; frame < 75; frame++) {
    flashOnly.system._updateTumbleBodyLanguageVfx(1 / 60);
    flashOnly.system._integrateTrailStreaks(1 / 60);
    assert.ok(flashOnly.system._liveTrailStreakCount > 0,
      `reduced marker remains visible without a blackout at frame ${frame}`);
  }
});

test('thrown translation emits immediately and honors its own 8-12 Hz cadence beside 16 Hz spin', () => {
  const immediate = makeVfxHarness();
  immediate.system._updateTumbleBodyLanguageVfx(1 / 120);
  assert.equal(immediate.system._liveTrailStreakCount, 1,
    'the first truthful thrown plan produces a marker on its first VFX update');

  const { system, target } = makeVfxHarness();
  target.presentation.tumble.thrashCadenceHz = 16;
  let thrownEmissions = 0;
  let spinEmissions = 0;
  const spawnTrail = system._spawnProjectileTrailStreak;
  const spawnParticle = system._spawnParticle;
  system._spawnProjectileTrailStreak = function (...args) {
    thrownEmissions++;
    return spawnTrail.apply(this, args);
  };
  system._spawnParticle = function (...args) {
    spinEmissions++;
    return spawnParticle.apply(this, args);
  };

  for (let frame = 0; frame < 60; frame++) {
    system._updateTumbleBodyLanguageVfx(1 / 60);
  }

  assert.ok(thrownEmissions >= 8 && thrownEmissions <= 12,
    `authored translational cadence stays within 8-12 Hz, got ${thrownEmissions}`);
  assert.ok(spinEmissions > thrownEmissions,
    'the independent 16 Hz angular ribbon cannot pull translation up to its cadence');
});

test('hero thrown marker survives ambient saturation and loses to stronger residents', () => {
  const admitted = makeVfxHarness();
  for (let i = 0; i < admitted.system._ts.length; i++) spawnResident(admitted.system, 0.1);
  admitted.system._updateTumbleBodyLanguageVfx(0.3);
  assert.equal(admitted.system._liveTrailStreakCount, 96);
  assert.ok(admitted.system._ts.some((slot) => slot.alive && slot.admissionPriority === 0.98));

  const rejected = makeVfxHarness({ targetRelevant: false });
  for (let i = 0; i < rejected.system._ts.length; i++) spawnResident(rejected.system, 0.99);
  rejected.system._updateTumbleBodyLanguageVfx(0.3);
  assert.equal(rejected.system._liveTrailStreakCount, 96);
  assert.equal(rejected.system._ts.some((slot) => slot.alive && slot.admissionPriority === 0.92), false,
    'priority admission rejects the marker when every resident is stronger');
});

test('thrown cadence and streak pools clear at boundaries and entity removal', () => {
  const { bus, system, target } = makeVfxHarness();
  system._updateTumbleBodyLanguageVfx(1 / 60);
  assert.equal(system._tumbleVfxCd.has(target.id), true);
  assert.equal(system._tumbleVfxCd.has(target), true,
    'translation owns a separate entity-keyed accumulator in the existing cadence map');
  bus.emit('save:loaded');
  assert.equal(system._tumbleVfxCd.size, 0);
  assert.equal(system._liveTrailStreakCount, 0);

  for (const event of ['sector:enter', 'game:newGame']) {
    system._tumbleVfxCd.set(target.id, 0.1);
    spawnResident(system, 0.2);
    bus.emit(event);
    assert.equal(system._tumbleVfxCd.size, 0, `${event} clears tumble cadence`);
    assert.equal(system._liveTrailStreakCount, 0, `${event} clears resident streaks`);
  }

  system._onKilled = () => {};
  system._tumbleVfxCd.set(target.id, 0.1);
  system._tumbleVfxCd.set(target, 0.1);
  bus.emit('entity:killed', { id: target.id });
  assert.equal(system._tumbleVfxCd.has(target.id), false);
  assert.equal(system._tumbleVfxCd.has(target), false);

  system._onDestroyed = () => {};
  system._tumbleVfxCd.set(target.id, 0.1);
  system._tumbleVfxCd.set(target, 0.1);
  bus.emit('entity:destroyed', { id: target.id });
  assert.equal(system._tumbleVfxCd.has(target.id), false);
  assert.equal(system._tumbleVfxCd.has(target), false);

  target.presentation.tumble = { mode: 'idle' };
  target.presentation.thrownTrail.active = false;
  system._tumbleVfxCd.set(target.id, 0.1);
  system._tumbleVfxCd.set(target, 0.1);
  system._updateTumbleBodyLanguageVfx(1 / 60);
  assert.equal(system._tumbleVfxCd.has(target.id), false, 'inactivity clears angular cadence');
  assert.equal(system._tumbleVfxCd.has(target), false, 'inactivity clears translational cadence');

  target.alive = false;
  system._tumbleVfxCd.set(target.id, 0.1);
  system._tumbleVfxCd.set(target, 0.1);
  system._updateTumbleBodyLanguageVfx(1 / 60);
  assert.equal(system._tumbleVfxCd.has(target.id), false, 'death clears angular cadence');
  assert.equal(system._tumbleVfxCd.has(target), false, 'death clears translational cadence');

  spawnResident(system, 0.2);
  system._integrateTrailStreaks(11);
  assert.equal(system._liveTrailStreakCount, 0, 'resident streaks expire naturally');
});
