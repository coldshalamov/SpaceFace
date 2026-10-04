// NXI-015 / NXI-016 / NXI-025 / NXI-062 — tow release, repair basis,
// unowned collision credit, and a damaged capital that stays a target.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { SIM_DT } from '../src/core/sim.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import {
  applyPendingSubsystemTransitions,
  damageSubsystem,
  repairSubsystem,
} from '../src/combat/subsystems.js';
import {
  clearImpulseProvenance,
  recordImpulseProvenance,
  resolveCollisionConsequence,
} from '../src/combat/impulseKernel.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { DAMAGED_DRIVE_AUTHORITY_FLOOR } from '../src/core/flight/driveAuthority.js';
import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { flightV3 } from '../src/systems/flightV3.js';

const DT = SIM_DT;
const PROFILE = PROPULSION_PROFILES.drive_reaction_m;

function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} vs ${expected}`);
}

function craft(id) {
  return {
    id,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 3, z: 5 },
    vel: { x: 40, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 28,
    radius: 12,
    physicsBody: {
      schemaVersion: 1,
      mass: 28,
      inertiaY: 90,
      radius: 12,
      dynamic: true,
      revision: 1,
      thrusters: [
        { id: 'drive-port', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8, health: 1 },
        { id: 'drive-starboard', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8, health: 1 },
        { id: 'rcs-port', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1, health: 1 },
        { id: 'rcs-starboard', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1, health: 1 },
      ],
    },
    flightModel: { inertia: 90 },
    flags: {},
    data: { combatProfileId: 'combat_profile_standard_ship', derived: { marker: 'kept' } },
    boost: { energy: 40, max: 40, drainRate: 40, regenRate: 18, dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0 },
  };
}

function flightState(entity, tether) {
  const state = {
    seed: 4242,
    tick: 60,
    simTime: 1,
    rng: rngFrom(4242),
    mode: 'flight',
    playerId: entity.id,
    player: { tether },
    entities: new Map([[entity.id, entity]]),
    entityList: [entity],
    input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: false, brake: false, assistMode: 'newtonian' },
    settings: {
      gameplay: { physicsBackend: 'rapier-dynamic', velocityVectoring: false, orbitAssistStrength: 'off' },
      controls: { flightMode: 'newtonian' },
    },
    combat: { entities: {} },
  };
  ensureCombatState(state);
  return state;
}

function boot(entity, state) {
  const flight = Object.create(flightV3);
  flight.init({ state, bus: createBus() });
  return flight;
}

function step(flight, entity, state) {
  flight._stepCraft(entity, {
    throttle: 1, strafe: 0, turn: 0, brake: false, assistMode: 'newtonian',
  }, DT, state, true);
  return consumePhysicsCommand(entity);
}

function disableDrive(runtime) {
  const drive = runtime.subsystems.subsystem_drive;
  drive.health = 0;
  drive.destroyed = true;
  drive.effectiveDisabled = true;
  runtime.capabilities.drive = false;
  runtime.multipliers.movement = 0;
  return drive;
}

test('NXI-015 a tow cut drops the load and leaves the dead drive dead', () => {
  const catalogMain = PROFILE.mainAccel;
  const damaged = craft(7);
  const healthy = craft(8);
  const damagedTether = { active: true, targetId: 40, load: 0.82, attachmentId: 'tow-1' };
  const healthyTether = { active: true, targetId: 41, load: 0.82, attachmentId: 'tow-2' };
  const damagedState = flightState(damaged, damagedTether);
  const healthyState = flightState(healthy, healthyTether);
  const catalog = createCombatCatalog();
  const damagedRuntime = ensureCombatant(damagedState, damaged, catalog);
  ensureCombatant(healthyState, healthy, catalog);
  const drive = disableDrive(damagedRuntime);
  const damagedFlight = boot(damaged, damagedState);
  const healthyFlight = boot(healthy, healthyState);

  const hurtLoaded = step(damagedFlight, damaged, damagedState);
  const fineLoaded = step(healthyFlight, healthy, healthyState);
  assert.ok(hurtLoaded.control.force.x > 0, 'a dead drive still pushes while towing');
  near(
    hurtLoaded.control.force.x / fineLoaded.control.force.x,
    DAMAGED_DRIVE_AUTHORITY_FLOOR,
    'towing does not restore catalog thrust',
  );

  damagedTether.active = false;
  damagedTether.load = 0;
  damagedTether.attachmentId = null;
  damagedTether.targetId = null;
  healthyTether.active = false;
  healthyTether.load = 0;
  healthyTether.attachmentId = null;
  healthyTether.targetId = null;

  const hurtCut = step(damagedFlight, damaged, damagedState);
  const fineCut = step(healthyFlight, healthy, healthyState);

  assert.equal(damagedTether.load, 0, 'the cut clears the attachment load');
  assert.equal(damagedTether.active, false);
  assert.equal(drive.destroyed, true, 'the cut does not repair the drive');
  assert.equal(drive.effectiveDisabled, true);
  assert.equal(drive.health, 0);
  assert.equal(damagedRuntime.capabilities.drive, false);
  assert.equal(damaged.data.derived.marker, 'kept', 'the cut does not rebuild derived stats');
  assert.equal(PROFILE.mainAccel, catalogMain, 'the hull catalog is not rewritten on release');
  near(hurtCut.control.authority.forward, DAMAGED_DRIVE_AUTHORITY_FLOOR, 'authority stays damaged');
  near(hurtCut.control.force.x, hurtLoaded.control.force.x, 'thrust does not jump when the tow drops');
  near(fineCut.control.authority.forward, 1, 'a healthy drive stays healthy after the same cut');
  assert.ok(fineCut.control.force.x > hurtCut.control.force.x, 'the healthy hull still out-accelerates the damaged one');
  assert.equal(healthyState.combat.entities[String(healthy.id)].subsystems.subsystem_drive.effectiveDisabled, false);
});

test('NXI-016 a repair changes achieved thrust, not the request or the scale', () => {
  const body = {
    pos: { x: 0, z: 0 },
    vel: { x: 40, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 28,
    inertia: 90,
    radius: 12,
  };
  const input = { throttle: 1, strafe: 0, turn: 0, brake: false, assistMode: 'newtonian' };
  const damagedAuthority = { forward: DAMAGED_DRIVE_AUTHORITY_FLOOR, reverse: DAMAGED_DRIVE_AUTHORITY_FLOOR, strafe: 1, yaw: 1 };
  const damagedStep = stepPropulsion({
    dt: DT, body, input, profile: PROFILE, runtime: createPropulsionRuntime(PROFILE), authority: damagedAuthority,
  });
  const repairedStep = stepPropulsion({
    dt: DT, body, input, profile: PROFILE, runtime: createPropulsionRuntime(PROFILE), authority: null,
  });
  const damagedRead = computeFlightTelemetry({
    body, profile: PROFILE, control: { telemetry: damagedStep.telemetry, authority: damagedAuthority },
  });
  const repairedRead = computeFlightTelemetry({
    body, profile: PROFILE, control: { telemetry: repairedStep.telemetry, authority: { forward: 1, reverse: 1, strafe: 1, yaw: 1 } },
  });

  near(damagedRead.actuators.manual.forward, repairedRead.actuators.manual.forward, 'requested input');
  near(damagedRead.actuators.manual.lateral, repairedRead.actuators.manual.lateral, 'requested lateral');
  near(damagedRead.braking.flipBurnAccel, repairedRead.braking.flipBurnAccel, 'scale denominator');
  near(damagedRead.braking.directAccel, repairedRead.braking.directAccel, 'stop scale');
  assert.ok(repairedRead.actuators.forward > damagedRead.actuators.forward, 'repair raises achieved thrust');
  assert.ok(damagedStep.telemetry.manualLocal.forward < damagedRead.actuators.manual.forward,
    'the readout is not the authority-scaled request');
  assert.equal(damagedRead.hullHealth, undefined);
  assert.equal(repairedRead.hull, undefined);
  assert.equal(damagedRead.actuators.hullHealth, undefined);

  const entity = craft(15);
  const state = flightState(entity, { active: false, targetId: null, load: 0, attachmentId: null });
  const runtime = ensureCombatant(state, entity, createCombatCatalog());
  const drive = disableDrive(runtime);
  const flight = boot(entity, state);
  step(flight, entity, state);
  const scaledRequest = entity._flightFrame.manualLocal.forward;
  flight._publishPlayerDiagnostics(entity, state);
  const before = state.flightRuntime.telemetry;
  drive.health = drive.maxHealth;
  drive.destroyed = false;
  drive.effectiveDisabled = false;
  runtime.capabilities.drive = true;
  runtime.multipliers.movement = 1;
  step(flight, entity, state);
  flight._publishPlayerDiagnostics(entity, state);
  const after = state.flightRuntime.telemetry;

  near(before.actuators.manual.forward, after.actuators.manual.forward, 'live requested input');
  near(before.braking.flipBurnAccel, after.braking.flipBurnAccel, 'live scale denominator');
  near(before.braking.directAccel, after.braking.directAccel, 'live stop scale');
  assert.ok(after.actuators.forward > before.actuators.forward, 'the live repair raises achieved thrust');
  assert.ok(scaledRequest < before.actuators.manual.forward, 'the live instrument undoes the damage scale');
  assert.equal(before.hullHealth, undefined);
  assert.ok(after.actuators.forward > 0, 'a repaired drive still answers the stick');
});

test('NXI-025 an unowned drifting rock is not credited to the nearest player', () => {
  const playerId = 1;
  const rock = {
    id: 9, type: 'asteroid', mass: 400,
    physicsBody: { mass: 400, material: 'rock', dynamic: true },
  };
  const ship = {
    id: 4, type: 'ship', mass: 20,
    physicsBody: { mass: 20, material: 'ship' },
  };
  const hit = {
    target: ship,
    other: rock,
    exchangedMomentum: 4000,
    tick: 30,
    preSolveClosingSpeed: 80,
    pos: { x: 10, z: 4 },
    normal: { x: 1, z: 0 },
    nearestActorId: playerId,
  };
  try {
    const guessed = resolveCollisionConsequence({
      ...hit,
      provenance: { actorId: playerId, tag: 'environment', appliedTick: 30 },
    });
    assert.equal(guessed.provenance.actorId, null);
    assert.equal(guessed.provenance.weaponId, null);
    assert.equal(guessed.provenance.tag, 'environment');
    assert.equal(guessed.surface, 'terrain');
    assert.ok(guessed.impactDamage > 0, 'a natural rock hit still hurts');

    const nearestOnly = resolveCollisionConsequence({ ...hit, provenance: null });
    assert.equal(nearestOnly.provenance.actorId, null);
    assert.ok(nearestOnly.impactDamage > 0, 'dropping the guess does not drop the damage');

    const thrown = resolveCollisionConsequence({
      ...hit,
      provenance: { actorId: playerId, weaponId: 'massline', tag: 'massline', appliedTick: 30 },
    });
    assert.equal(thrown.provenance.actorId, playerId);
    assert.equal(thrown.provenance.tag, 'massline');
    assert.ok(thrown.impactDamage > 0);
    near(thrown.impactDamage, guessed.impactDamage, 'a real throw uses the same rock damage');

    recordImpulseProvenance(rock, {
      actorId: playerId, tag: 'massline', weaponId: 'massline', appliedTick: 30, magnitude: 80,
    });
    const recorded = resolveCollisionConsequence({
      ...hit,
      provenance: { actorId: playerId, tag: 'environment', appliedTick: 30 },
    });
    assert.equal(recorded.provenance.actorId, playerId, 'a recorded throw keeps its actor');
    assert.ok(recorded.impactDamage > 0);
  } finally {
    clearImpulseProvenance(rock);
    clearImpulseProvenance(ship);
  }
});

test('NXI-062 a damaged capital stays targetable and collidable', () => {
  const catalog = createCombatCatalog();
  const state = { tick: 4, simTime: 4 / 60, rng: rngFrom(7), combat: {} };
  ensureCombatState(state);
  const entity = {
    id: 21,
    type: 'ship',
    alive: true,
    collides: true,
    targetable: true,
    mass: 420,
    hull: 800,
    hullMax: 800,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    physicsBody: { mass: 420, collides: true, dynamic: true, material: 'ship' },
  };
  const runtime = ensureCombatant(state, entity, catalog);
  const context = { state, catalog, bus: null, attachments: null, currentAttackerId: 1 };

  assert.equal(runtime.capabilities.weapon, true);
  assert.equal(runtime.capabilities.drive, true);
  damageSubsystem(context, entity, runtime, 'subsystem_weapon', 1000, { kinetic: 1 }, 0);
  state.tick += 1;
  state.simTime = state.tick / 60;
  applyPendingSubsystemTransitions(context, entity, runtime);

  assert.equal(entity.alive, true, 'subsystem failure is not entity death');
  assert.equal(entity.collides, true);
  assert.equal(entity.targetable, true);
  assert.equal(entity.type, 'ship');
  assert.equal(entity.hull, 800);
  assert.equal(entity.physicsBody.collides, true);
  assert.equal(entity.physicsBody.mass, 420);
  assert.equal(runtime.capabilities.weapon, false, 'the damaged weapon is the capability that changes');
  assert.equal(runtime.capabilities.drive, true);
  assert.equal(runtime.capabilities.sensor, true);
  assert.equal(runtime.physicsResponse.massScale, 1, 'the hull stays physically collidable');
  assert.equal(runtime.subsystems.subsystem_weapon.destroyed, true);
  assert.equal(runtime.subsystems.subsystem_drive.destroyed, false);

  repairSubsystem(context, entity, runtime, 'subsystem_weapon', 1000);
  state.tick += 1;
  state.simTime = state.tick / 60;
  applyPendingSubsystemTransitions(context, entity, runtime);
  assert.equal(runtime.capabilities.weapon, true, 'repair restores the weapon, not a new hull');
  assert.equal(entity.alive, true);
  assert.equal(entity.collides, true);
  assert.equal(entity.targetable, true);
  assert.equal(entity.type, 'ship');
});
