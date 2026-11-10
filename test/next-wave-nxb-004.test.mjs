// NXB-004 — a damaged loaded ship stays controllable through the real propulsion stack.
// Damage changes the force and torque the thrusters can still make. It does not
// rewrite the stick, and it does not teleport the ship when the drive is repaired.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { SIM_DT } from '../src/core/sim.js';
import {
  consumePhysicsCommand,
  measureThrusterAuthority,
  queuePhysicsImpulse,
} from '../src/core/physicsAuthority.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import {
  combatDriveScale,
  composePlayerDriveAuthority,
} from '../src/core/flight/driveAuthority.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { getDerivedStats } from '../src/systems/ships.js';

const DT = SIM_DT;
const PROFILE = PROPULSION_PROFILES.drive_reaction_m;

function body(overrides = {}) {
  return {
    pos: { x: 12, z: -4 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 28,
    inertia: 90,
    radius: 12,
    ...overrides,
  };
}

function step(profile, authority, input, craft = body()) {
  const callerInput = { throttle: 1, strafe: 0, turn: 0, brake: false, assistMode: 'newtonian', ...input };
  const throttleBefore = callerInput.throttle;
  const posBefore = { x: craft.pos.x, z: craft.pos.z };
  const velBefore = { x: craft.vel.x, z: craft.vel.z };
  const result = stepPropulsion({
    dt: DT,
    body: craft,
    input: callerInput,
    profile,
    runtime: createPropulsionRuntime(profile),
    authority,
  });
  return { result, callerInput, throttleBefore, posBefore, velBefore, craft };
}

function planarAccel(result, mass) {
  return Math.hypot(result.force.x, result.force.z) / mass;
}

test('damage scales the thrust channel and leaves the stick and the speed cap alone', () => {
  const sharedMain = PROFILE.mainAccel;
  const healthy = step(PROFILE, null, { assistMode: 'assisted' });
  const damaged = step(PROFILE, { forward: 0.4, reverse: 1, strafe: 1, yaw: 1 }, { turn: 1, assistMode: 'assisted' });
  const healthyTurn = step(PROFILE, null, { turn: 1, assistMode: 'assisted' });
  assert.equal(PROFILE.mainAccel, sharedMain, 'channel scaling must not rewrite the shared drive profile');
  assert.equal(damaged.callerInput.throttle, 1, 'the stick magnitude stays commanded');
  assert.equal(damaged.throttleBefore, damaged.callerInput.throttle);
  assert.ok(damaged.result.force.x > 0, 'a damaged drive still pushes');
  assert.ok(Math.abs(damaged.result.force.x / healthy.result.force.x - 0.4) < 1e-6,
    'forward damage scales forward force, not some other channel');
  assert.equal(damaged.result.maxSpeed, healthy.result.maxSpeed,
    'a damaged drive keeps the speed it can coast at');
  assert.ok(Math.abs(damaged.result.torque.y - healthyTurn.result.torque.y) < 1e-6,
    'forward damage does not steal yaw torque');
});

test('a movement-zero dead drive stays steerable, and a hurt weapon does not', () => {
  const deadDrive = {
    subsystems: { subsystem_drive: { health: 0, maxHealth: 45, effectiveDisabled: true } },
    multipliers: { movement: 0 },
    capabilities: { drive: false },
  };
  const hurtWeapon = {
    subsystems: {
      subsystem_drive: { health: 45, maxHealth: 45 },
      subsystem_weapon: { health: 0, maxHealth: 38, effectiveDisabled: true },
    },
    multipliers: { movement: 0 },
    capabilities: { weapon: false },
  };
  const dead = composePlayerDriveAuthority(null, deadDrive);
  const weapon = composePlayerDriveAuthority(null, hurtWeapon);
  const reactorDown = {
    subsystems: { subsystem_drive: { health: 45, maxHealth: 45, effectiveDisabled: true } },
    multipliers: { movement: 0 },
  };
  const reactor = composePlayerDriveAuthority(null, reactorDown);
  assert.equal(reactor.forward, combatDriveScale(reactorDown));
  assert.ok(reactor.forward > 0 && reactor.forward < 1, 'a dead reactor disables the drive without a stun');
  assert.equal(reactor.yaw, 1);
  assert.equal(weapon.forward, 1, 'weapon damage and a movement multiplier are not the drive');
  assert.equal(weapon.yaw, 1);
  assert.ok(dead.forward > 0 && dead.forward < 0.5, 'a dead drive keeps a steer floor and is not a stun');
  assert.equal(dead.forward, combatDriveScale(deadDrive));
  assert.ok(dead.yaw > dead.forward, 'a drive hit does not dim yaw by the same fraction as thrust');
  const pushed = step(PROFILE, dead, { turn: 1 });
  const healthy = step(PROFILE, null, { turn: 1 });
  assert.ok(pushed.result.force.x > 0);
  assert.ok(Math.abs(pushed.result.torque.y) > 0, 'deliberate steering still produces torque');
  assert.ok(Math.abs(pushed.result.force.x / healthy.result.force.x - dead.forward) < 1e-6);
  const invalid = step(PROFILE, { forward: -2, reverse: 1, strafe: 1, yaw: 1 }, { turn: 1 });
  assert.ok(Math.abs(invalid.result.force.x) < 1e-9, 'a negative forward channel cannot push');
  assert.ok(Math.abs(invalid.result.torque.y) > 0, 'the invalid forward channel does not zero yaw');
});

test('repair changes the next force and does not move the ship', () => {
  const craft = body({ vel: { x: 80, z: -15 } });
  const deadRuntime = { subsystems: { subsystem_drive: { health: 0, maxHealth: 45, effectiveDisabled: true } } };
  const dead = composePlayerDriveAuthority(null, deadRuntime);
  const before = step(PROFILE, dead, { throttle: 0 }, craft);
  assert.equal(craft.pos.x, before.posBefore.x);
  assert.equal(craft.pos.z, before.posBefore.z);
  assert.equal(craft.vel.x, before.velBefore.x);
  assert.equal(craft.vel.z, before.velBefore.z);
  assert.equal(dead.forward, composePlayerDriveAuthority(null, deadRuntime).forward,
    'reading the drive again after the load is unchanged does not heal it');
  const repaired = step(PROFILE, null, { throttle: 1 }, craft);
  const damagedPush = step(PROFILE, dead, { throttle: 1 }, craft);
  assert.ok(repaired.result.force.x > damagedPush.result.force.x);
  assert.equal(craft.vel.x, 80, 'repair does not write velocity');
  assert.equal(craft.pos.x, 12, 'repair does not write position');
  const mass = craft.mass;
  const v0 = 80;
  const v1 = v0 + damagedPush.result.force.x / mass * DT;
  const v2 = v1 + repaired.result.force.x / mass * DT;
  assert.ok(Math.abs((v2 - v1) - (repaired.result.force.x / mass * DT)) < 1e-9,
    'the only velocity change across a repair is the new force over that tick');
});

test('a light hull and a loaded hull stay different and both still steer while damaged', () => {
  const light = getDerivedStats('ship_kestrel', [], { cargo: { usedMass: 0 } });
  const loaded = getDerivedStats('ship_kestrel', [], { cargo: { usedMass: 800 } });
  assert.ok(loaded.operationalMass > light.operationalMass);
  assert.ok(loaded.propulsion.mainAccel < light.propulsion.mainAccel,
    'cargo mass is already in the derived drive');
  const authority = { forward: 0.55, reverse: 0.55, strafe: 0.55, yaw: 0.55 };
  const lightStep = step(light.propulsion, authority, { turn: 1 }, body({ mass: light.operationalMass }));
  const loadedStep = step(loaded.propulsion, authority, { turn: 1 }, body({ mass: loaded.operationalMass }));
  const lightAccel = planarAccel(lightStep.result, light.operationalMass);
  const loadedAccel = planarAccel(loadedStep.result, loaded.operationalMass);
  assert.ok(lightAccel > loadedAccel, 'the loaded hull still accelerates less');
  assert.ok(lightAccel > 0 && loadedAccel > 0);
  assert.ok(Math.abs(lightStep.result.torque.y) > 0);
  assert.ok(Math.abs(loadedStep.result.torque.y) > 0);
  assert.ok(Math.abs(loadedStep.result.torque.y) < Math.abs(lightStep.result.torque.y)
    || loaded.propulsion.yawAccel < light.propulsion.yawAccel);
});

test('assisted braking spends damaged reverse authority instead of a hidden full brake', () => {
  // Fast enough that both brakes saturate on reverse authority, so the
  // assist cannot keep the healthy brake once that channel is reduced.
  const moving = { vel: { x: 400, z: 0 } };
  const healthy = step(PROFILE, null, { throttle: 0, brake: true, assistMode: 'assisted' }, body(moving));
  const damaged = step(PROFILE, { forward: 1, reverse: 0.35, strafe: 1, yaw: 1 }, { throttle: 0, brake: true, assistMode: 'assisted' }, body(moving));
  assert.ok(healthy.result.force.x < 0, 'braking pushes against travel');
  assert.ok(damaged.result.force.x < 0, 'a damaged drive can still brake');
  assert.ok(Math.abs(damaged.result.force.x / healthy.result.force.x - 0.35) < 1e-6,
    'the assist cannot spend reverse authority the drive no longer has');
});

function liveCraft(id, health = 1) {
  return {
    id,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 3, z: 5 },
    vel: { x: 40, z: -8 },
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
        { id: 'drive-port', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8, health },
        { id: 'drive-starboard', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8, health },
        { id: 'rcs-port', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1, health: 1 },
        { id: 'rcs-starboard', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1, health: 1 },
      ],
    },
    flightModel: { inertia: 90 },
    flags: {},
    data: { combatProfileId: 'combat_profile_standard_ship' },
    boost: { energy: 40, max: 40, drainRate: 40, regenRate: 18, dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0 },
  };
}

function liveState(entity) {
  const state = {
    seed: 4242,
    tick: 8,
    simTime: 8 / 60,
    mode: 'flight',
    playerId: entity.id,
    entities: new Map([[entity.id, entity]]),
    entityList: [entity],
    input: { moveX: 0, moveZ: 1, turnIntent: 1, boost: false, brake: false, assistMode: 'newtonian' },
    settings: { gameplay: { physicsBackend: 'rapier-dynamic', velocityVectoring: false }, controls: { flightMode: 'newtonian' } },
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

function stepLive(flight, entity, state) {
  const pos = { x: entity.pos.x, z: entity.pos.z };
  const vel = { x: entity.vel.x, z: entity.vel.z };
  flight._stepCraft(entity, { throttle: 1, turn: 1, brake: false, assistMode: 'newtonian' }, DT, state, true);
  return { command: consumePhysicsCommand(entity), pos, vel };
}

test('the live flight stack keeps a dead loaded drive controllable and keeps an outside shove', () => {
  const catalog = createCombatCatalog();
  const damaged = liveCraft(7);
  const healthy = liveCraft(8);
  const damagedState = liveState(damaged);
  const healthyState = liveState(healthy);
  const damagedRuntime = ensureCombatant(damagedState, damaged, catalog);
  ensureCombatant(healthyState, healthy, catalog);
  const drive = damagedRuntime.subsystems.subsystem_drive;
  drive.health = 0;
  drive.effectiveDisabled = true;
  damagedRuntime.multipliers.movement = 0;
  damagedRuntime.capabilities.drive = false;
  measureThrusterAuthority(damaged);
  const expected = composePlayerDriveAuthority(damaged.physicsBody.thrusters, damagedRuntime);
  assert.ok(expected.yaw > expected.forward, 'main-drive damage leaves more yaw than forward');
  queuePhysicsImpulse(damaged, { x: 25, y: 0, z: -4 });
  const damagedFlight = boot(damaged, damagedState);
  const healthyFlight = boot(healthy, healthyState);
  const hurt = stepLive(damagedFlight, damaged, damagedState);
  const fine = stepLive(healthyFlight, healthy, healthyState);
  assert.equal(damaged.vel.x, hurt.vel.x, 'the flight step does not write velocity');
  assert.equal(damaged.pos.z, hurt.pos.z, 'the flight step does not write position');
  assert.ok(hurt.command.impulses.length >= 1, 'an outside shove stays queued');
  assert.equal(hurt.command.impulses[0].x, 25);
  assert.ok(hurt.command.control.force.x > 0, 'the dead drive still answers the throttle');
  assert.ok(Math.abs(hurt.command.control.force.x / fine.command.control.force.x - expected.forward) < 1e-6);
  assert.ok(Math.abs(hurt.command.control.torque.y / fine.command.control.torque.y - expected.yaw) < 1e-6,
    'yaw keeps the RCS fraction instead of the main-drive fraction');
  assert.ok(Math.abs(hurt.command.control.torque.y) > 0, 'the dead drive still answers the turn');
  assert.equal(drive.effectiveDisabled, true, 'stepping the helm does not repair the drive');
  drive.health = drive.maxHealth;
  drive.effectiveDisabled = false;
  damagedRuntime.capabilities.drive = true;
  const healed = stepLive(damagedFlight, damaged, damagedState);
  assert.equal(damaged.vel.x, hurt.vel.x, 'repair does not snap velocity');
  assert.ok(Math.abs(healed.command.control.force.x - fine.command.control.force.x) < 1e-6,
    'restoring only the drive restores only that force');
  assert.ok(Math.abs(hurt.command.control.torque.y / fine.command.control.torque.y - 1) < 1e-6,
    'undamaged turn thrusters keep their torque when only the drive is hurt');
});

test('a dash on a hurt drive is the same fraction of the shove, not a full kick', () => {
  const hurt = liveCraft(11);
  const fine = liveCraft(12);
  const hurtState = liveState(hurt);
  const fineState = liveState(fine);
  const catalog = createCombatCatalog();
  const runtime = ensureCombatant(hurtState, hurt, catalog);
  ensureCombatant(fineState, fine, catalog);
  runtime.subsystems.subsystem_drive.health = 0;
  runtime.subsystems.subsystem_drive.effectiveDisabled = true;
  const hurtFlight = boot(hurt, hurtState);
  const fineFlight = boot(fine, fineState);
  hurt.boost.dashImpulse = 80;
  fine.boost.dashImpulse = 80;
  hurt.boost.energy = 80;
  fine.boost.energy = 80;
  hurt.boost.dashCost = 10;
  fine.boost.dashCost = 10;
  measureThrusterAuthority(hurt);
  measureThrusterAuthority(fine);
  hurtFlight._driveAuthority = composePlayerDriveAuthority(hurt.physicsBody.thrusters, runtime);
  fineFlight._driveAuthority = composePlayerDriveAuthority(fine.physicsBody.thrusters, fineState.combat.entities[String(fine.id)]);
  consumePhysicsCommand(hurt);
  consumePhysicsCommand(fine);
  assert.equal(hurtFlight._triggerDash(hurt, hurt.boost, hurtState), true);
  assert.equal(fineFlight._triggerDash(fine, fine.boost, fineState), true);
  const hurtCmd = consumePhysicsCommand(hurt);
  const fineCmd = consumePhysicsCommand(fine);
  const hurtImpulse = Math.hypot(hurtCmd.impulses[0].x, hurtCmd.impulses[0].z);
  const fineImpulse = Math.hypot(fineCmd.impulses[0].x, fineCmd.impulses[0].z);
  assert.ok(Math.abs(hurtImpulse / fineImpulse - hurtFlight._driveAuthority.forward) < 1e-6);
  assert.ok(hurtImpulse > 0);
  assert.equal(hurt.vel.x, 40, 'the dash queues an impulse and does not write velocity');
});
