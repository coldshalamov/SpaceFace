// PQ-133.04 R3 — the Foundry room lane. Restates both shared-owner R3 acceptances and pins the
// authored-room machinery behind them: seeded install determinism, materialization agreement
// (authored geometry vs materialized body vs surface response), owned tag-checked teardown,
// field-slot/toy caps, the eligibility gate (no room-side bank reflection or feedback on any
// tick), and Stage C shutter pose/command/jam determinism through the SG-02 membrane.
// Deterministic numbers only — agreement checks, never screenshots (2026-09-16 owner ruling).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import {
  isSurfaceContactReceipt,
  surfaceContactFromBodies,
  surfaceResponseFor,
} from '../src/core/surfaceContact.js';
import { resolveRicochet } from '../src/combat/surfaceReflection.js';
import { consumePhysicsCommand, writePhysicsTelemetry } from '../src/core/physicsAuthority.js';
import {
  ARENA_FIELD_SLOT_IDS,
  SURVIVAL_ARENA_PHASES,
  dominantGate,
  planArenaInstall,
  survivalArena,
} from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  ARENA_TOY_MAX,
  SHUTTER_CYCLE,
  SHUTTER_SERVO,
  SHUTTER_SURGE_DISTANCE,
  bankShotOffPlate,
  shutterJammed,
  shutterPose,
  validateArenaToys,
} from '../src/data/arenaModuleLibrary.js';

const ARENA = 'helios_core';
const SEED = 13304;
const ANCHOR = { x: 400, z: -120 };

function boot({ seed = SEED, anchor = ANCHOR } = {}) {
  const state = createGameState(seed);
  state.simTime = 0;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++,
    alive: true,
    type: 'ship',
    team: 0,
    pos: { ...anchor },
    vel: { x: 0, z: 0 },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  survivalArena.init(ctx);
  return { state, bus, emitted, helpers, ctx, player };
}

/** Drive a live Foundry wave; `phase` overrides the authored plan phase so all rooms are reachable. */
function installFoundryWave(h, { wave = 1, phase = 'idle', seed = SEED } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed });
  run.arenaId = ARENA;
  run.phase = 'active';
  run.wave = wave;
  h.state.run = run;
  const plan = planWave({ seed, arenaId: ARENA, wave });
  assert.notEqual(plan.ok, false, `wave ${wave} must plan`);
  plan.arenaPhase = phase;
  h.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return plan;
}

function roomSolids(h) {
  return h.state.entityList.filter((e) => e && e.data && e.data.roomOwner === 'survival-arena');
}

function compiledBankSpec() {
  const result = compileAttackSpec({
    weaponId: 'wpn_pulse_laser_s',
    modifiers: [['mod_bank_shot', 1]],
  });
  assert.equal(result.ok, true);
  return result.spec;
}

// ---------------------------------------------------------------------------------------------
// The two shared-owner R3 acceptances, restated against the implemented lane.
// ---------------------------------------------------------------------------------------------

test('shared-owner R3: the plate helper cannot reflect an ordinary direct shot — no_spec, every room', () => {
  for (const phase of SURVIVAL_ARENA_PHASES) {
    const install = planArenaInstall({ arenaId: ARENA, arenaPhase: phase, wave: 1, seed: SEED });
    const plates = install.toys.filter((toy) => toy.kind === 'plate');
    assert.ok(plates.length > 0, `${phase} carries bank plates`);
    for (const plate of plates) {
      const refused = bankShotOffPlate(plate, {
        id: 'bolt', type: 'projectile', alive: true, radius: 0.7,
        pos: { x: plate.pos.x + plate.normal.x * 30, z: plate.pos.z + plate.normal.z * 30 },
        vel: { x: -plate.normal.x * 90, z: -plate.normal.z * 90 },
      });
      assert.equal(refused.ok, false, `${phase} ${plate.id}`);
      assert.equal(refused.reason, 'no_spec', `${phase} ${plate.id}`);
      assert.equal(refused.vel, undefined);
      assert.equal(refused.receipt, undefined);
    }
  }
});

test('shared-owner R3: Foundry idle installs authored reflective geometry from wave one', () => {
  const install = planArenaInstall({ arenaId: ARENA, arenaPhase: 'idle', wave: 1, seed: SEED });
  const plates = install.toys.filter((toy) => toy.kind === 'plate');
  assert.ok(plates.length >= 2, 'Foundry must teach banks in its first room');
  const check = validateArenaToys(install.toys);
  assert.equal(check.ok, true, JSON.stringify(check.issues));
  for (const toy of install.toys) {
    if (toy.kind === 'plate') {
      assert.equal(toy.verb, 'bank');
      assert.equal(surfaceResponseFor(toy.material), 'reflect', `${toy.id} must reflect`);
    } else if (toy.kind === 'gate') {
      assert.equal(toy.verb, undefined, 'a gate verbs nothing');
      assert.equal(surfaceResponseFor(toy.material), 'none', `${toy.id} must not respond`);
    } else if (toy.kind === 'furnace') {
      assert.equal(toy.verb, 'consume');
      assert.equal(surfaceResponseFor(toy.material), 'absorb', `${toy.id} must absorb`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Seeded install determinism + caps.
// ---------------------------------------------------------------------------------------------

test('same seed + wave installs the same Foundry room; a different seed moves it', () => {
  for (const phase of SURVIVAL_ARENA_PHASES) {
    const a = planArenaInstall({ arenaId: ARENA, arenaPhase: phase, wave: 4, seed: SEED, anchor: ANCHOR, laneGate: 'ne' });
    const b = planArenaInstall({ arenaId: ARENA, arenaPhase: phase, wave: 4, seed: SEED, anchor: ANCHOR, laneGate: 'ne' });
    assert.deepEqual(a, b, `${phase} is not reproducible`);
    assert.ok(a.toys.length >= 5, `${phase} authored too little room`);
    assert.ok(a.toys.length <= ARENA_TOY_MAX, `${phase} exceeds the toy budget`);
    assert.ok(a.fields.length <= ARENA_FIELD_SLOT_IDS.length, `${phase} asked for a third slot`);
    const other = planArenaInstall({ arenaId: ARENA, arenaPhase: phase, wave: 4, seed: SEED + 1, anchor: ANCHOR, laneGate: 'ne' });
    assert.notDeepEqual(a.toys, other.toys, `${phase} ignored the seed`);
  }
});

test('the wave ladder keeps every Foundry room inside the caps and valid', () => {
  for (let wave = 1; wave <= 10; wave++) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave });
    assert.notEqual(plan.ok, false);
    const install = planArenaInstall({
      arenaId: ARENA, arenaPhase: plan.arenaPhase, wave, seed: SEED, anchor: ANCHOR,
      laneGate: 'front',
    });
    assert.ok(install.fields.length <= ARENA_FIELD_SLOT_IDS.length, `w${wave} fields`);
    assert.ok(install.toys.length <= ARENA_TOY_MAX, `w${wave} toys`);
    const check = validateArenaToys(install.toys);
    assert.equal(check.ok, true, `w${wave} ${JSON.stringify(check.issues)}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Materialization agreement: authored geometry vs materialized body vs surface response.
// ---------------------------------------------------------------------------------------------

test('materialization agrees with the authored geometry, tag for tag, on every phase', () => {
  for (const phase of SURVIVAL_ARENA_PHASES) {
    const h = boot();
    // The live system plans with the wave's dominant gate and the player anchor — mirror that.
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 2 });
    const expected = planArenaInstall({
      arenaId: ARENA, arenaPhase: phase, wave: 2, seed: SEED, anchor: ANCHOR,
      laneGate: dominantGate(plan),
    });
    installFoundryWave(h, { wave: 2, phase });
    const installed = h.emitted.filter((e) => e.event === 'survivalArena:installed').at(-1).payload;
    const solidToys = expected.toys.filter((toy) => toy.solid === true);
    assert.equal(installed.solids, solidToys.length, `${phase} solid count`);
    assert.ok(installed.frame, `${phase} publishes an authored frame extent`);
    assert.ok(installed.frame.maxX > installed.frame.minX && installed.frame.maxZ > installed.frame.minZ);
    for (const toy of solidToys) {
      const solidId = `survival-room-w2-${toy.id}`;
      const entity = h.state.entityList.find((e) => e.data && e.data.roomSolidId === solidId);
      assert.ok(entity, `${phase} ${toy.id} materialized`);
      assert.equal(entity.type, 'station', `${phase} ${toy.id} type`);
      assert.equal(entity.pos.x, toy.pos.x, `${phase} ${toy.id} pos x`);
      assert.equal(entity.pos.z, toy.pos.z, `${phase} ${toy.id} pos z`);
      assert.equal(entity.radius, toy.radius, `${phase} ${toy.id} radius`);
      assert.equal(entity.physicsBody.dynamic, toy.kind === 'shutter', `${phase} ${toy.id} dynamic`);
      assert.equal(entity.data.surfaceMaterial, toy.material, `${phase} ${toy.id} material tag`);
      const wanted = toy.kind === 'plate' ? 'reflect'
        : (toy.kind === 'furnace' ? 'absorb' : 'none');
      assert.equal(surfaceResponseFor(entity.data.surfaceMaterial), wanted, `${phase} ${toy.id} surface response`);
    }
    h.bus.emit('run:waveCleared', { wave: 2 });
  }
});

test('materialization is idempotent: the same room never doubles a solid', () => {
  const h = boot();
  installFoundryWave(h, { wave: 2, phase: 'idle' });
  const before = h.state.entityList.length;
  survivalArena._materializeRoom(survivalArena._toys, 2);
  assert.equal(h.state.entityList.length, before, 'a second materialization spawned duplicates');
  h.bus.emit('run:waveCleared', { wave: 2 });
});

// ---------------------------------------------------------------------------------------------
// Owned teardown: every path releases the room's solids, and only the room's.
// ---------------------------------------------------------------------------------------------

for (const [why, finish] of [
  ['run:waveCleared', (h) => h.bus.emit('run:waveCleared', { wave: 2 })],
  ['run:ended', (h) => h.bus.emit('run:ended', { outcome: 'defeat' })],
  ['newGame', () => survivalArena.newGame()],
  ['destroy', () => survivalArena.destroy()],
]) {
  test(`room solids are released on ${why}, and the release is tag-checked`, () => {
    const h = boot();
    installFoundryWave(h, { wave: 2, phase: 'idle' });
    const solids = roomSolids(h);
    assert.ok(solids.length >= 5, 'the idle room materialized its solids');
    const bystander = h.helpers.spawnEntity({
      type: 'station', pos: { x: 1, z: 1 }, radius: 5, data: { roomOwner: 'someone-else' },
    });
    finish(h);
    assert.ok(solids.every((e) => e.alive === false), `${why}: a room solid survived`);
    assert.equal(bystander.alive, true, `${why}: the release took a foreign body`);
    const released = h.emitted.filter((e) => e.event === 'survivalArena:released').at(-1);
    assert.ok(released, `${why}: release event`);
    assert.ok(released.payload.solids >= 5, `${why}: released payload names the solids`);
  });
}

// ---------------------------------------------------------------------------------------------
// Eligibility gate: the room never banks a shot, never emits bank feedback, never writes a
// projectile. The same contact banks through the kernel — and only for an eligible runtime.
// ---------------------------------------------------------------------------------------------

test('eligibility gate: no room-side combat:bankShot or velocity write on any tick; kernel owns the bank', () => {
  const h = boot();
  installFoundryWave(h, { wave: 1, phase: 'idle' });
  const expected = planArenaInstall({ arenaId: ARENA, arenaPhase: 'idle', wave: 1, seed: SEED, anchor: ANCHOR });
  const plate = expected.toys.find((toy) => toy.kind === 'plate');
  const shots = [];
  for (let i = 0; i < 4; i++) {
    shots.push(h.helpers.spawnEntity({
      type: 'projectile',
      pos: {
        x: plate.pos.x + plate.normal.x * (12 + i),
        z: plate.pos.z + plate.normal.z * (12 + i),
      },
      vel: { x: -plate.normal.x * 90, z: -plate.normal.z * 90 },
      radius: 0.7,
      data: {},
    }));
  }
  const velBefore = shots.map((s) => ({ ...s.vel }));
  h.state.tick = 0;
  for (let t = 0; t < 120; t++) {
    survivalArena.update(1 / 60, h.state);
    h.state.tick++;
    h.state.simTime = h.state.tick / 60;
  }
  assert.equal(h.emitted.filter((e) => e.event === 'combat:bankShot').length, 0,
    'room-side bank feedback must not exist');
  assert.deepEqual(shots.map((s) => ({ ...s.vel })), velBefore, 'the room wrote a projectile velocity');
  assert.ok(shots.every((s) => s.alive !== false), 'the room killed a shot');

  // The same contact is bankable through the kernel, only for an eligible bank runtime.
  const spec = compiledBankSpec();
  const runtime = createLineage({ spec });
  const body = {
    id: 'foundry-bolt', type: 'projectile', alive: true, radius: 0.7,
    pos: { x: plate.pos.x + plate.normal.x * 30, z: plate.pos.z + plate.normal.z * 30 },
    vel: { x: -plate.normal.x * 90, z: -plate.normal.z * 90 },
  };
  const incomingNormalComponent = body.vel.x * plate.normal.x + body.vel.z * plate.normal.z;
  const geometry = bankShotOffPlate(plate, {
    id: body.id, type: 'projectile', spec, runtime, pos: { ...body.pos }, vel: { ...body.vel },
  });
  assert.equal(geometry.ok, true, 'an eligible runtime gets the plate geometry');
  assert.equal(geometry.vel, undefined, 'geometry only: no velocity leaves the helper');
  assert.equal(geometry.receipt, undefined, 'geometry only: no receipt leaves the helper');
  const surface = {
    id: 'foundry-plate-under-test', pos: { ...plate.pos }, vel: { x: 0, z: 0 }, angVel: 0,
    surfaceMaterial: 'plate',
  };
  const receipt = surfaceContactFromBodies(body, surface, {
    point: geometry.point, normal: geometry.normal, material: 'plate', velocity: body.vel,
  }, 10);
  assert.ok(isSurfaceContactReceipt(receipt), 'the receipt is physics-issued shape');
  const result = resolveRicochet(runtime, spec, receipt, body);
  assert.equal(result.ok, true);
  assert.equal(result.consume, false, 'an eligible bank continues the same body');
  const outgoingNormalComponent = result.velocity.x * plate.normal.x + result.velocity.z * plate.normal.z;
  assert.ok(incomingNormalComponent < 0 && outgoingNormalComponent > 0, 'the shot left along +normal');
  // The kernel quantizes the contact normal to 1e-6, so an off-axis reflection drifts ~1e-4.
  assert.ok(Math.abs(Math.hypot(result.velocity.x, result.velocity.z) - 90) < 1e-3, 'speed preserved');
});

// ---------------------------------------------------------------------------------------------
// Stage C: moving shutters. Pure pose determinism, membrane-only commands, deterministic jams.
// ---------------------------------------------------------------------------------------------

test('Stage C: shutter poses are pure, deterministic and continuous across the cycle', () => {
  const expected = planArenaInstall({ arenaId: ARENA, arenaPhase: 'shutter_slow', wave: 3, seed: SEED, anchor: ANCHOR, laneGate: 'front' });
  const shutters = expected.toys.filter((toy) => toy.kind === 'shutter');
  assert.equal(shutters.length, 2, 'the shutter room carries two moving shutters');
  const shutter = shutters[0];
  const rest = shutterPose(shutter, 0);
  for (const t of [0, 1, 2.5, 5.4, 9]) {
    assert.deepEqual(shutterPose(shutter, t), shutterPose(shutter, t), `pose at ${t} is pure`);
  }
  assert.deepEqual(shutterPose(shutter, SHUTTER_CYCLE.warningS).pos, rest.pos, 'surge starts at rest');
  const extended = shutterPose(shutter, SHUTTER_CYCLE.warningS + SHUTTER_CYCLE.surgeS - 1e-9).pos;
  const travel = Math.hypot(extended.x - rest.pos.x, extended.z - rest.pos.z);
  assert.ok(Math.abs(travel - SHUTTER_SURGE_DISTANCE) < 1e-6, `full surge travel, got ${travel}`);
  const period = SHUTTER_CYCLE.warningS + SHUTTER_CYCLE.surgeS + SHUTTER_CYCLE.calmS;
  assert.deepEqual(shutterPose(shutter, period).pos, rest.pos, 'the cycle returns home');
});

test('Stage C: the room commands materialized shutters through the membrane, never their pose', () => {
  const h = boot();
  installFoundryWave(h, { wave: 3, phase: 'shutter_slow' });
  const entity = h.state.entityList.find((e) => e.data && e.data.roomKind === 'shutter');
  assert.ok(entity, 'the shutter materialized');
  assert.equal(entity.physicsBody.dynamic, true, 'the shutter is a dynamic body');
  const posBefore = { x: entity.pos.x, z: entity.pos.z };
  const velBefore = { x: entity.vel.x, z: entity.vel.z };

  // Fresh measured truth mid-surge -> a surge command with real force, and no pose writes.
  h.state.tick = 180;   // 3 s in: 2 s warning + 1 s into the surge
  h.state.simTime = 3;
  writePhysicsTelemetry(entity, {
    tick: 180, dynamic: true, mass: entity.mass, linearAcceleration: { x: 30, y: 0, z: 40 },
  });
  survivalArena.update(1 / 60, h.state);
  const command = consumePhysicsCommand(entity);
  assert.ok(command, 'the room must command the shutter through the SG-02 membrane');
  assert.equal(command.control.mode, 'shutter_surge');
  assert.ok(command.control.source === 'survival-arena');
  assert.ok(Math.hypot(command.control.force.x, command.control.force.z) > 0, 'the servo pushes');
  assert.equal(command.control.maxSpeed, SHUTTER_SERVO.maxSpeed);
  assert.deepEqual([entity.pos.x, entity.pos.z], [posBefore.x, posBefore.z], 'the room wrote shutter pos');
  assert.deepEqual([entity.vel.x, entity.vel.z], [velBefore.x, velBefore.z], 'the room wrote shutter vel');
  h.bus.emit('run:waveCleared', { wave: 3 });
});

test('Stage C: jam rules are deterministic and fail closed, live and pure', () => {
  // Pure: same inputs -> same verdict, forever.
  const fresh = { tick: 200, dynamic: true, linearAcceleration: { x: 30, y: 0, z: 40 } };
  const welded = { tick: 200, dynamic: true, linearAcceleration: { x: 0, y: 0, z: 0 } };
  const stale = { tick: 100, dynamic: true, linearAcceleration: { x: 30, y: 0, z: 40 } };
  for (let i = 0; i < 3; i++) {
    assert.equal(shutterJammed(null, { tick: 210, phase: 'surge', phaseElapsedS: 3 }), true, 'no truth -> hold');
    assert.equal(shutterJammed(fresh, { tick: 210, phase: 'surge', phaseElapsedS: 3 }), false);
    assert.equal(shutterJammed(welded, { tick: 210, phase: 'surge', phaseElapsedS: 3 }), true, 'welded surge -> hold');
    assert.equal(shutterJammed(stale, { tick: 210, phase: 'surge', phaseElapsedS: 3 }), true, 'stale truth -> hold');
    assert.equal(shutterJammed(welded, { tick: 210, phase: 'warning', phaseElapsedS: 0.5 }), false, 'weld check fires mid-surge only');
    assert.equal(shutterJammed(welded, { tick: 210, phase: 'surge', phaseElapsedS: 0.2 }), false, 'surge grace window');
  }

  // Live: missing telemetry holds, fresh truth surges, a welded body holds again.
  const h = boot();
  installFoundryWave(h, { wave: 3, phase: 'shutter_slow' });
  const entity = h.state.entityList.find((e) => e.data && e.data.roomKind === 'shutter');
  h.state.tick = 210;
  h.state.simTime = 3.5;
  survivalArena.update(1 / 60, h.state);
  assert.equal(consumePhysicsCommand(entity).control.mode, 'shutter_hold', 'no measured truth -> hold');
  writePhysicsTelemetry(entity, {
    tick: 210, dynamic: true, mass: entity.mass, linearAcceleration: { x: 30, y: 0, z: 0 },
  });
  survivalArena.update(1 / 60, h.state);
  assert.equal(consumePhysicsCommand(entity).control.mode, 'shutter_surge', 'fresh truth -> surge');
  writePhysicsTelemetry(entity, {
    tick: 211, dynamic: true, mass: entity.mass, linearAcceleration: { x: 0, y: 0, z: 0 },
  });
  h.state.tick = 211;
  h.state.simTime = 3.5 + 1 / 60;
  survivalArena.update(1 / 60, h.state);
  assert.equal(consumePhysicsCommand(entity).control.mode, 'shutter_hold', 'welded mid-surge -> hold');
  h.bus.emit('run:waveCleared', { wave: 3 });
});
