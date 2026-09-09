import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { MOMENTUM_SINK_FRAME_KIND } from '../src/combat/momentumSink.js';
import { createBus } from '../src/core/eventBus.js';
import { MOMENTUM_SINK_STATUS_ID } from '../src/data/combatDefs.js';
import {
  MOMENTUM_SINK_VFX_HZ,
  MOMENTUM_SINK_VFX_TARGET_CAPACITY,
  createMomentumSinkVfxPlanScratch,
  resolveMomentumSinkVfxPlan,
} from '../src/render/momentumSinkVfx.js';
import { vfx } from '../src/render/vfx.js';

function plannerInput(overrides = {}) {
  return {
    targetPosition: { x: 1200, z: -640 },
    targetVelocity: { x: 70, z: 40 },
    frameVelocity: { x: 10, z: 0 },
    frameReady: true,
    radius: 8,
    motionReduce: false,
    flashReduce: false,
    playerCaused: true,
    targetRelevant: false,
    ...overrides,
  };
}

test('planner uses the stored frame velocity and preserves galactic-global coordinates', () => {
  const input = plannerInput();
  const originalPosition = { ...input.targetPosition };
  const scratch = createMomentumSinkVfxPlanScratch();
  const keys = Object.keys(scratch).sort();
  const plan = resolveMomentumSinkVfxPlan(scratch, input);

  assert.strictEqual(plan, scratch, 'the caller owns the retained plan record');
  assert.deepEqual(Object.keys(plan).sort(), keys, 'resolution cannot grow the hot record shape');
  assert.equal(plan.active, true);
  assert.deepEqual(input.targetPosition, originalPosition, 'the planner never localizes or mutates world truth');
  assert.equal(plan.targetX, 1200);
  assert.equal(plan.targetZ, -640);
  assert.equal(plan.relativeVelocityX, 60);
  assert.equal(plan.relativeVelocityZ, 40);
  assert.ok(Math.abs(plan.relativeSpeed - Math.hypot(60, 40)) < 1e-12);
  assert.ok(Math.abs(plan.axisX - (-60 / Math.hypot(60, 40))) < 1e-12);
  assert.ok(Math.abs(plan.axisZ - (-40 / Math.hypot(60, 40))) < 1e-12,
    'convergence points from target velocity toward the stored frame velocity');
  assert.ok(Math.abs(plan.axisX * plan.perpX + plan.axisZ * plan.perpZ) < 1e-12);
  assert.equal(plan.admissionPriority, 0.92, 'strict player causality reuses the hero priority');
  assert.ok(plan.life > 0 && plan.life <= 1 / MOMENTUM_SINK_VFX_HZ,
    'shared-pool residue drains within one cadence when the status clears');

  const near = resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(), plannerInput({
    targetVelocity: { x: 10.5, z: 0 },
    frameVelocity: { x: 10, z: 0 },
  }));
  assert.equal(near.active, true);
  assert.ok(near.length < plan.length, 'the compression trail shortens as real velocity error closes');

  const rotated = resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(), plannerInput({
    targetVelocity: { x: -40, z: 70 },
    frameVelocity: { x: 0, z: 10 },
    targetRelevant: true,
  }));
  assert.ok(Math.abs(rotated.axisX - (-plan.axisZ)) < 1e-12);
  assert.ok(Math.abs(rotated.axisZ - plan.axisX) < 1e-12,
    'a 90-degree rotation of both velocities rotates the authored axis exactly');
  assert.equal(rotated.admissionPriority, 0.98, 'the current target reuses the strongest existing tier');
});

test('planner suppresses missing truth and keeps reduced settings directional', () => {
  const full = resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(), plannerInput());
  const reduced = resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(), plannerInput({
    motionReduce: true,
  }));
  const flash = resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(), plannerInput({
    flashReduce: true,
  }));

  assert.equal(full.streakCount, 3);
  assert.equal(full.particleCount, 2);
  assert.equal(reduced.active, true, 'reduced motion retains the directional compression read');
  assert.equal(reduced.streakCount, 1);
  assert.equal(reduced.particleCount, 0);
  assert.equal(reduced.convergenceSpeed, 0, 'the reduced cue holds a static compressed pose');
  assert.ok(reduced.opacity < full.opacity);
  assert.ok(reduced.length < full.length);
  assert.equal(flash.streakCount, full.streakCount, 'flash reduction keeps structural geometry');
  assert.equal(flash.particleCount, 0, 'flash reduction removes the sparkling accent');
  assert.ok(flash.opacity < full.opacity);

  const invalidCases = [
    ['unbound frame', { frameReady: false }],
    ['zero error', { targetVelocity: { x: 10, z: 0 }, frameVelocity: { x: 10, z: 0 } }],
    ['deadband error', { targetVelocity: { x: 10.25, z: 0 }, frameVelocity: { x: 10, z: 0 } }],
    ['nonfinite position', { targetPosition: { x: Number.NaN, z: 0 } }],
    ['nonfinite target velocity', { targetVelocity: { x: 0, z: Number.POSITIVE_INFINITY } }],
    ['nonfinite frame velocity', { frameVelocity: { x: Number.NEGATIVE_INFINITY, z: 0 } }],
  ];
  for (const [label, overrides] of invalidCases) {
    const plan = resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(), plannerInput(overrides));
    assert.equal(plan.active, false, label);
    assert.equal(plan.axisX, 0, `${label}: never fabricate +X`);
    assert.equal(plan.axisZ, 0, `${label}: never fabricate +X`);
    assert.equal(plan.streakCount, 0, label);
    assert.equal(plan.particleCount, 0, label);
  }
});

function makeShip(id, {
  pos = { x: id * 20, z: 0 },
  vel = { x: 70, z: 40 },
  alive = true,
} = {}) {
  return {
    id,
    type: 'ship',
    alive,
    team: id === 1 ? 0 : 1,
    pos: { x: pos.x, z: pos.z },
    vel: { x: vel.x, z: vel.z },
    rot: 0,
    radius: 8,
    maxSpeed: 180,
    flags: { docked: false },
    data: {},
  };
}

function makeStatus({
  attackerId = 1,
  expiresTick = 200,
  frameKind = MOMENTUM_SINK_FRAME_KIND,
  frameReady = true,
  frameVelocity = { x: 10, z: 0 },
} = {}) {
  return {
    id: MOMENTUM_SINK_STATUS_ID,
    attackerId,
    appliedTick: 20,
    expiresTick,
    data: {
      frameKind,
      frameReady,
      frameVelocity: { x: frameVelocity.x, z: frameVelocity.z },
    },
  };
}

function makeHarness({
  targetCount = 1,
  playerTargetId = 2,
  attackerId = 1,
  origin = { x: 0, z: 0 },
  motionReduce = false,
  flashReduce = false,
} = {}) {
  const player = makeShip(1, { pos: { x: origin.x, z: origin.z }, vel: { x: -400, z: 700 } });
  const targets = [];
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  const runtimes = {};
  for (let index = 0; index < targetCount; index++) {
    const target = makeShip(index + 2, {
      pos: { x: origin.x + 100 + index * 16, z: origin.z + 50 - index * 3 },
      vel: { x: 70 + index * 2, z: 40 - index },
    });
    targets.push(target);
    entities.set(target.id, target);
    entityList.push(target);
    runtimes[String(target.id)] = {
      statuses: { [MOMENTUM_SINK_STATUS_ID]: makeStatus({ attackerId }) },
    };
  }
  const state = {
    mode: 'flight',
    tick: 30,
    simTime: 0.5,
    playerId: player.id,
    player: { targetId: playerTargetId, tether: { active: false } },
    entities,
    entityList,
    entityIndex: { __spacefaceEntityIndexV1: true, shipLike: entityList },
    combat: { entities: runtimes, attachments: { byId: {} }, beams: [] },
    settings: {
      video: {
        particleQuality: 'low',
        engineTrails: false,
        energyMaterials: false,
        motionReduce,
        flashReduce,
      },
      accessibility: { flashReduce },
    },
    input: { turnIntent: 0 },
    render: { scene: new THREE.Scene() },
    world: { frameOrigin: { x: origin.x, z: origin.z }, frameOriginSeq: 1 },
    content: {},
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { bus, player, state, system, targets };
}

function liveStreaks(system) {
  const result = [];
  for (let cursor = 0; cursor < system._liveTrailStreakCount; cursor++) {
    result.push(system._ts[system._activeTrailStreaks[cursor]]);
  }
  return result;
}

function spawnResident(system, priority) {
  return system._spawnProjectileTrailStreak(
    0, 0, 0, 10, 0.2, 3, 0.5, '#ffffff', 0, 0, 1, 0, priority,
  );
}

test('production pull uses the retained frame after attacker disappearance and localizes once', () => {
  const origin = { x: 1000, z: -500 };
  const harness = makeHarness({ origin });
  const { state, system, targets } = harness;
  const target = targets[0];
  const status = state.combat.entities[String(target.id)].statuses[MOMENTUM_SINK_STATUS_ID];
  const combatBefore = structuredClone(state.combat);
  const targetBefore = structuredClone({ pos: target.pos, vel: target.vel });
  const expected = resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(), plannerInput({
    targetPosition: target.pos,
    targetVelocity: target.vel,
    frameVelocity: status.data.frameVelocity,
    radius: target.radius,
    targetRelevant: true,
  }));

  assert.equal(system._updateMomentumSinkPresentation(), 1);
  assert.equal(system._liveTrailStreakCount, 3);
  const main = liveStreaks(system)[0];
  const expectedGlobalX = target.pos.x - expected.axisX * expected.centerOffset;
  const expectedGlobalZ = target.pos.z - expected.axisZ * expected.centerOffset;
  assert.ok(Math.abs(main.x - (expectedGlobalX - origin.x)) < 1e-9);
  assert.ok(Math.abs(main.z - (expectedGlobalZ - origin.z)) < 1e-9,
    'the planner stays global and the existing spawner performs exactly one localization');
  assert.ok(Math.abs(main.ax - expected.axisX) < 1e-12);
  assert.ok(Math.abs(main.az - expected.axisZ) < 1e-12);
  assert.equal(main.admissionPriority, 0.98);
  assert.deepEqual(state.combat, combatBefore, 'presentation cannot update stored combat truth');
  assert.deepEqual({ pos: target.pos, vel: target.vel }, targetBefore, 'presentation cannot write motion');
  assert.equal(system._momentumSinkInputScratch.targetPosition, null,
    'the retained scratch cannot keep a removed world entity alive between pulls');

  const attacker = makeShip(status.attackerId, { vel: { x: 900, z: -900 } });
  state.entities.set(attacker.id, attacker);
  system._clearTrailStreaks();
  system._updateMomentumSinkPresentation();
  const withContradictoryAttacker = liveStreaks(system)[0];
  assert.ok(Math.abs(withContradictoryAttacker.ax - expected.axisX) < 1e-12,
    'a live attacker with contradictory velocity cannot replace the stored frame');
  state.entities.delete(attacker.id);
  system._clearTrailStreaks();
  system._updateMomentumSinkPresentation();
  const afterAttackerDisappears = liveStreaks(system)[0];
  assert.ok(Math.abs(afterAttackerDisappears.ax - expected.axisX) < 1e-12,
    'attacker disappearance preserves the retained frame used by Continue');
});

test('pull validation fails closed without mutating shared pools', () => {
  const cases = [
    ['dead target', ({ target }) => { target.alive = false; }],
    ['expired status', ({ status, state }) => { status.expiresTick = state.tick; }],
    ['missing status data', ({ status }) => { status.data = undefined; }],
    ['unready frame', ({ status }) => { status.data.frameReady = false; }],
    ['wrong frame kind', ({ status }) => { status.data.frameKind = 'world_zero'; }],
    ['nonfinite position', ({ target }) => { target.pos.x = Number.NaN; }],
    ['nonfinite target velocity', ({ target }) => { target.vel.z = Number.POSITIVE_INFINITY; }],
    ['nonfinite stored frame', ({ status }) => { status.data.frameVelocity.x = Number.NaN; }],
    ['matched velocity', ({ target, status }) => {
      target.vel.x = status.data.frameVelocity.x;
      target.vel.z = status.data.frameVelocity.z;
    }],
  ];
  for (const [label, mutate] of cases) {
    const harness = makeHarness();
    const target = harness.targets[0];
    const status = harness.state.combat.entities[String(target.id)].statuses[MOMENTUM_SINK_STATUS_ID];
    mutate({ ...harness, target, status });
    const particlesBefore = harness.system._liveCount;
    const streaksBefore = harness.system._liveTrailStreakCount;
    assert.equal(harness.system._updateMomentumSinkPresentation(), 0, label);
    assert.equal(harness.system._liveCount, particlesBefore, `${label}: particle pool`);
    assert.equal(harness.system._liveTrailStreakCount, streaksBefore, `${label}: streak pool`);
  }
});

test('reduced settings retain one static pooled direction cue and bound full emissions', () => {
  const full = makeHarness();
  assert.equal(full.system._updateMomentumSinkPresentation(), 1);
  assert.equal(full.system._liveTrailStreakCount, 3);
  assert.equal(full.system._liveCount, 2);

  const reduced = makeHarness({ motionReduce: true });
  assert.equal(reduced.system._updateMomentumSinkPresentation(), 1);
  assert.equal(reduced.system._liveTrailStreakCount, 1);
  assert.equal(reduced.system._liveCount, 0);
  const reducedStreak = liveStreaks(reduced.system)[0];
  assert.ok(Math.hypot(reducedStreak.ax, reducedStreak.az) > 0.999);
  assert.equal(reducedStreak.vx, reduced.targets[0].vel.x,
    'static compression carries with the target but adds no animated convergence travel');
  assert.equal(reducedStreak.vz, reduced.targets[0].vel.z);
  assert.ok(reducedStreak.life <= 1 / MOMENTUM_SINK_VFX_HZ);

  const flash = makeHarness({ flashReduce: true });
  flash.system._updateMomentumSinkPresentation();
  assert.equal(flash.system._liveTrailStreakCount, 3);
  assert.equal(flash.system._liveCount, 0);
  assert.ok(liveStreaks(flash.system)[0].op0 < liveStreaks(full.system)[0].op0);

  const timeline = makeHarness({ motionReduce: true });
  for (let frame = 0; frame < 10; frame++) timeline.system.update(1 / 120);
  assert.ok(timeline.system._liveTrailStreakCount > 0, 'the reduced cue wakes at its bounded cadence');
  for (let frame = 0; frame < 30; frame++) {
    timeline.system.update(1 / 120);
    assert.ok(timeline.system._liveTrailStreakCount > 0,
      `the static reduced marker has no between-cadence blackout at frame ${frame}`);
  }
});

test('hard target cap and existing priority pool protect causal work without a new tier', () => {
  const capped = makeHarness({ targetCount: 8, playerTargetId: 9 });
  assert.equal(capped.system._updateMomentumSinkPresentation(), MOMENTUM_SINK_VFX_TARGET_CAPACITY);
  assert.equal(capped.system._liveTrailStreakCount, MOMENTUM_SINK_VFX_TARGET_CAPACITY * 3);
  assert.equal(capped.system._liveCount, MOMENTUM_SINK_VFX_TARGET_CAPACITY * 2);
  assert.equal(capped.system._ts.length, 96, 'Momentum Sink reuses the fixed structural streak pool');
  assert.equal(liveStreaks(capped.system).filter((slot) => slot.admissionPriority === 0.98).length, 3,
    'the late current target displaces the lower-priority tail from the retained top six');

  const admitted = makeHarness();
  for (let index = 0; index < admitted.system._ts.length; index++) spawnResident(admitted.system, 0.1);
  admitted.system._updateMomentumSinkPresentation();
  assert.equal(admitted.system._liveTrailStreakCount, 96);
  assert.ok(admitted.system._ts.some((slot) => slot.alive && slot.admissionPriority === 0.98));

  const strict = makeHarness({ playerTargetId: 99, attackerId: '1' });
  for (let index = 0; index < strict.system._ts.length; index++) spawnResident(strict.system, 0.99);
  strict.system._updateMomentumSinkPresentation();
  assert.equal(strict.system._ts.some((slot) => slot.alive && slot.admissionPriority === 0.92), false,
    'string attacker identity cannot become numeric player causality');
  assert.equal(strict.system._ts.some((slot) => slot.alive && slot.admissionPriority === 0.5), false,
    'ambient work loses to stronger residents under saturation');
});

test('post-integration emission survives a clamped hitch and status clear drains within one cadence', () => {
  const { bus, state, system, targets } = makeHarness();
  const target = targets[0];
  const runtime = state.combat.entities[String(target.id)];

  system.update(0.1);
  assert.ok(system._liveTrailStreakCount > 0,
    'new <=cadence residue is emitted after integration and survives the 100 ms clamped frame');
  assert.equal(system.inspect().subsystems.lastFrame.momentumSink, 1);
  delete runtime.statuses[MOMENTUM_SINK_STATUS_ID];
  assert.ok(system._liveTrailStreakCount > 0,
    'status clear does not destructively clear a shared VFX pool');
  system.update(0.1);
  assert.equal(system._liveTrailStreakCount, 0, 'clear stops new work and prior residue drains by one cadence');
  assert.equal(system.inspect().subsystems.lastFrame.momentumSink, 0);

  runtime.statuses[MOMENTUM_SINK_STATUS_ID] = makeStatus();
  system._cadenceMomentumSink = 0.05;
  bus.emit('sector:exit');
  assert.equal(system._cadenceMomentumSink, 0);
  system._cadenceMomentumSink = 0.05;
  bus.emit('player:death', { pos: target.pos });
  assert.equal(system._cadenceMomentumSink, 0);

  for (const event of ['sector:enter', 'game:newGame', 'save:loaded']) {
    system._cadenceMomentumSink = 0.05;
    spawnResident(system, 0.2);
    bus.emit(event);
    assert.equal(system._cadenceMomentumSink, 0, `${event}: cadence reset`);
    assert.equal(system._liveTrailStreakCount, 0, `${event}: existing boundary pool reset remains authoritative`);
  }
  const planScratch = system._momentumSinkPlanScratch;
  const inputScratch = system._momentumSinkInputScratch;
  const candidateScratch = system._momentumSinkCandidates;
  system.update(0.1);
  assert.ok(system._liveTrailStreakCount > 0,
    'a restored stored frame resumes through the normal post-Continue pull');
  assert.strictEqual(system._momentumSinkPlanScratch, planScratch);
  assert.strictEqual(system._momentumSinkInputScratch, inputScratch);
  assert.strictEqual(system._momentumSinkCandidates, candidateScratch,
    'cadence pulls reuse their retained plan, input, and top-six storage');

  system._onKilled = () => {};
  system._onDestroyed = () => {};
  system._clearTrailStreaks();
  system._cadenceMomentumSink = 0;
  for (let frame = 0; frame < 8; frame++) {
    bus.emit('entity:killed', { id: 900 + frame, type: 'ship' });
    bus.emit('entity:destroyed', { id: 1900 + frame, type: 'ship' });
    system.update(1 / 60);
  }
  assert.ok(system._liveTrailStreakCount > 0,
    'repeated unrelated combat removals cannot starve the live current-target cadence');

  system._momentumSinkCandidates[0] = target;
  system._momentumSinkCandidateStatuses[0] = runtime.statuses[MOMENTUM_SINK_STATUS_ID];
  system._momentumSinkCandidatePriorities[0] = 0.98;
  system._momentumSinkCandidateCount = 1;
  const cadenceBeforeRemoval = system._cadenceMomentumSink;
  bus.emit('entity:killed', { id: target.id, type: 'ship' });
  assert.equal(system._momentumSinkCandidateCount, 0, 'exact target removal drops a retained reference');
  assert.equal(system._cadenceMomentumSink, cadenceBeforeRemoval,
    'exact removal cannot postpone other active Momentum Sink candidates');
});
