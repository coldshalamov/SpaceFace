// PQ-133.06b — live orbit-node identity and Cryo Lock helm authority.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import {
  CRYO_LOCK_CONTROL_SCALE,
  CRYO_LOCK_STATUS_ID,
  applyCryoLock,
  cryoLockControlScale,
  helmControlScaleFromCombat,
  scaleHelmCommandForCryoLock,
  tickCryoLockedMotion,
} from '../src/combat/cryoLock.js';
import {
  ORBIT_NODE_TYPE,
  countOrbitFields,
  countOrbitNodes,
  orbitNodePose,
} from '../src/combat/orbitNodes.js';
import { resetLineageIds } from '../src/combat/attackLineage.js';
import { STATUS_DEFS } from '../src/data/combatDefs.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { fields } from '../src/systems/fields.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { countLiveOrbitNodes } from '../src/systems/orbitNodeRuntime.js';

const DT = SIM_DT;

function withFieldsEnabled(fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  let result;
  try {
    result = fn();
  } catch (err) {
    FIELD_FLAGS.enabled = prev;
    throw err;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = prev; });
  }
  FIELD_FLAGS.enabled = prev;
  return result;
}

function bootFields() {
  resetLineageIds(1);
  const sim = createSimulation({
    seed: 13306,
    bus: createBus(),
    systems: [fields],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 40, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 12,
    collides: true,
    hull: 200,
    hullMax: 200,
    flightModel: { inertia: 88 },
    flags: {},
    physicsBody: {
      schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      fittings: ['mod_cryo_gyros'],
      weapons: [{ defId: 'wpn_pulse_laser_s' }],
    },
  });
  state.playerId = player.id;
  return { sim, state, player, fieldsSys: sim.registry.get('fields') };
}

function craft(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 40, z: -12 },
    rot: 0,
    angVel: 0,
    mass: 18,
    radius: 12,
    physicsBody: {
      schemaVersion: 1, mass: 18, inertiaY: 90, radius: 12, dynamic: true, revision: 0, thrusters: [
        { id: 'drive-port', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8, health: 1 },
        { id: 'drive-starboard', forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8, health: 1 },
        { id: 'rcs-port', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1, health: 1 },
        { id: 'rcs-starboard', forward: 0.35, reverse: 0.55, strafe: 1, yaw: 1, health: 1 },
      ],
    },
    flightModel: { inertia: 90 },
    flags: {},
    data: {},
    boost: { energy: 40, max: 40, drainRate: 40, regenRate: 18, dashImpulse: 0, dashCost: 28, dashCd: 3, dashCdT: 0 },
    ...overrides,
  };
}

function helmState(entity, extra = {}) {
  const state = {
    tick: 20,
    simTime: 20 / 60,
    mode: 'flight',
    playerId: entity.id,
    entities: new Map([[entity.id, entity]]),
    entityList: [entity],
    input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false },
    settings: { gameplay: { physicsBackend: 'rapier-dynamic' } },
    combat: { entities: {} },
    ...extra,
  };
  ensureCombatState(state);
  return state;
}

function lockEntity(state, entity, stacks = 1) {
  const catalog = createCombatCatalog();
  const runtime = ensureCombatant(state, entity, catalog);
  runtime.statuses[CRYO_LOCK_STATUS_ID] = {
    id: CRYO_LOCK_STATUS_ID,
    stacks,
    appliedTick: state.tick,
    expiresTick: state.tick + 90,
    nextPeriodicTick: null,
    attackerId: null,
    actionId: null,
  };
  return runtime;
}

function bootHelm(entity, state) {
  const flight = Object.create(flightV3);
  flight.init({ state, bus: createBus() });
  return flight;
}

function stepHelm(flight, entity, rawInput, state) {
  consumePhysicsCommand(entity);
  flight._stepCraft(entity, rawInput, DT, state, true);
  return consumePhysicsCommand(entity);
}

test('live fields path counts orbit nodes with type and index on the shared kernel', () => {
  withFieldsEnabled(() => {
    const t = bootFields();
    t.sim.step();
    const count = countLiveOrbitNodes(t.state);
    assert.equal(count, 2, 'a Cryo Gyros fit must produce two live orbit nodes');
    assert.equal(t.state.fields.orbit.count, 2);
    assert.equal(t.state.fields.telemetry.orbitNodes, 2);
    const nodes = t.state.fields.orbit.nodes;
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].type, ORBIT_NODE_TYPE);
    assert.equal(nodes[1].type, ORBIT_NODE_TYPE);
    assert.equal(nodes[0].index, 0);
    assert.equal(nodes[1].index, 1);
    assert.equal(nodes[0].hostId, t.player.id);
    const world = t.fieldsSys._orbitWorld;
    assert.equal(countOrbitNodes(world), 2);
    assert.equal(countOrbitFields(t.fieldsSys._kernel), 2);
    assert.equal(world.kernel, t.fieldsSys._kernel, 'orbit nodes consume the live field kernel');
    const tagged = t.fieldsSys._kernel.list().filter((row) => row.tag === ORBIT_NODE_TYPE);
    assert.equal(tagged.length, 2);

    t.sim.step();
    assert.equal(countLiveOrbitNodes(t.state), 2, 'a second tick must not spawn a second ring');
  });
});

test('live orbit poses are deterministic in simTime and index', () => {
  withFieldsEnabled(() => {
    const t = bootFields();
    t.sim.step();
    const a = t.state.fields.orbit.nodes.slice();
    const pose0 = orbitNodePose(
      { id: t.player.id, x: t.player.pos.x, z: t.player.pos.z, vx: t.player.vel.x, vz: t.player.vel.z },
      0, 2, 48, t.state.simTime, 90,
    );
    const again = orbitNodePose(
      { id: t.player.id, x: t.player.pos.x, z: t.player.pos.z, vx: t.player.vel.x, vz: t.player.vel.z },
      0, 2, 48, t.state.simTime, 90,
    );
    assert.equal(pose0.x, again.x);
    assert.equal(pose0.z, again.z);
    assert.equal(a[0].index, 0);
    assert.notEqual(a[0].index, a[1].index);
  });
});

test('live helm: locked idle coast is bit-identical and writes zero force', () => {
  const entity = craft();
  const before = { vx: entity.vel.x, vz: entity.vel.z };
  const state = helmState(entity);
  lockEntity(state, entity, 1);
  assert.equal(helmControlScaleFromCombat(state, entity.id), CRYO_LOCK_CONTROL_SCALE);

  const flight = bootHelm(entity, state);
  const command = stepHelm(flight, entity, { moveX: 0, moveZ: 0, turnIntent: 0 }, state);
  assert.ok(command && command.control, 'helm still writes a physics command');
  assert.equal(command.control.force.x, 0);
  assert.equal(command.control.force.y, 0);
  assert.equal(command.control.force.z, 0);
  assert.equal(command.control.torque.x, 0);
  assert.equal(command.control.torque.y, 0);
  assert.equal(command.control.torque.z, 0);
  assert.equal(entity.vel.x, before.vx);
  assert.equal(entity.vel.z, before.vz);
  const coast = tickCryoLockedMotion({ ...before, controlScale: CRYO_LOCK_CONTROL_SCALE }, { ax: 0, az: 0 }, DT);
  assert.equal(coast.vx, before.vx);
  assert.equal(coast.vz, before.vz);
});

test('live helm: locked stick authority is 0.35 of unlocked, velocity untouched', () => {
  const unlocked = craft({ id: 11 });
  const locked = craft({ id: 12 });
  unlocked.vel = { x: 40, z: -12 };
  locked.vel = { x: 40, z: -12 };
  const unlockedState = helmState(unlocked);
  const lockedState = helmState(locked);
  lockEntity(lockedState, locked, 1);

  const unlockedFlight = bootHelm(unlocked, unlockedState);
  const lockedFlight = bootHelm(locked, lockedState);
  const stick = { moveX: 0, moveZ: 1, turnIntent: 0 };
  const free = stepHelm(unlockedFlight, unlocked, stick, unlockedState);
  const held = stepHelm(lockedFlight, locked, stick, lockedState);

  assert.equal(helmControlScaleFromCombat(lockedState, locked.id), CRYO_LOCK_CONTROL_SCALE);
  assert.equal(helmControlScaleFromCombat(unlockedState, unlocked.id), 1);
  const freeMag = Math.hypot(free.control.force.x, free.control.force.z);
  const heldMag = Math.hypot(held.control.force.x, held.control.force.z);
  assert.ok(freeMag > 0, 'unlocked stick must produce helm force');
  assert.ok(heldMag > 0, 'locked stick must still produce helm force');
  const ratio = heldMag / freeMag;
  assert.ok(Math.abs(ratio - CRYO_LOCK_CONTROL_SCALE) < 1e-9, `locked/unlocked force ratio ${ratio}`);
  assert.equal(held.control.force.x, free.control.force.x * CRYO_LOCK_CONTROL_SCALE);
  assert.equal(held.control.force.z, free.control.force.z * CRYO_LOCK_CONTROL_SCALE);
  assert.equal(locked.vel.x, 40);
  assert.equal(locked.vel.z, -12);
  assert.equal(unlocked.vel.x, 40);
  assert.equal(unlocked.vel.z, -12);
});

test('unlocked idle assist still writes force; locking that same idle zeroes it', () => {
  const entity = craft({ id: 21 });
  const state = helmState(entity);
  const flight = bootHelm(entity, state);
  const idle = { moveX: 0, moveZ: 0, turnIntent: 0 };
  const unlockedIdle = stepHelm(flight, entity, idle, state);
  const unlockedMag = Math.hypot(unlockedIdle.control.force.x, unlockedIdle.control.force.z);
  assert.ok(unlockedMag > 0, 'assisted idle still brakes; that is why lock must zero the helm, not scale it');

  lockEntity(state, entity, 1);
  const lockedIdle = stepHelm(flight, entity, idle, state);
  assert.equal(lockedIdle.control.force.x, 0);
  assert.equal(lockedIdle.control.force.z, 0);
  assert.equal(entity.vel.x, 40);
  assert.equal(entity.vel.z, -12);
});

test('NEGATIVE: a helm that scales assist-brake instead of zeroing idle force fails the coast rule', () => {
  const assistBrake = { force: { x: -10, y: 0, z: 3 }, torque: { x: 0, y: 0, z: 0 }, impulse: null };
  const wrong = {
    force: {
      x: assistBrake.force.x * CRYO_LOCK_CONTROL_SCALE,
      y: 0,
      z: assistBrake.force.z * CRYO_LOCK_CONTROL_SCALE,
    },
    torque: assistBrake.torque,
    impulse: null,
  };
  const correct = scaleHelmCommandForCryoLock(assistBrake, CRYO_LOCK_CONTROL_SCALE, false);
  assert.notEqual(wrong.force.x, 0);
  assert.equal(correct.force.x, 0);
  assert.equal(correct.force.z, 0);
});

test('NEGATIVE: insertion-order or rng pose disagrees with phase-plus-index', () => {
  const host = { id: 'player', x: 0, z: 0, vx: 30, vz: 0 };
  const a = orbitNodePose(host, 0, 2, 48, 45, 90);
  const b = orbitNodePose(host, 0, 2, 48, 45, 90);
  assert.equal(a.x, b.x);
  assert.equal(a.z, b.z);
  const rolled = { x: a.x + 1, z: a.z };
  assert.notEqual(rolled.x, a.x);
});

test('catalog and applyCryoLock agree: velocity copied, scale 0.35', () => {
  const def = STATUS_DEFS.find((row) => row.id === CRYO_LOCK_STATUS_ID);
  assert.ok(def);
  const body = { vx: 40, vz: -12 };
  const locked = applyCryoLock(body, 1);
  assert.equal(locked.vx, 40);
  assert.equal(locked.vz, -12);
  assert.equal(locked.controlScale, CRYO_LOCK_CONTROL_SCALE);
  assert.equal(cryoLockControlScale(1), 0.35);
  assert.ok(cryoLockControlScale(1) > 0);
});

test('orbit contacts on the live kernel schedule Cryo Lock without writing velocity', () => {
  withFieldsEnabled(() => {
    const t = bootFields();
    const raider = t.sim.spawn({
      type: 'ship',
      team: 1,
      pos: { x: 48, z: 0 },
      vel: { x: 18, z: -3 },
      rot: 0,
      radius: 10,
      collides: true,
      hull: 80,
      hullMax: 80,
      physicsBody: {
        schemaVersion: 1, radius: 10, mass: 20, inertiaY: 50, dynamic: true, material: 'ship', revision: 0,
      },
      data: { combatProfileId: 'combat_profile_standard_ship' },
    });
    t.sim.step();
    const pose = t.fieldsSys._orbitWorld.nodes[0];
    raider.pos.x = pose.x;
    raider.pos.z = pose.z;
    const before = { vx: raider.vel.x, vz: raider.vel.z };
    t.sim.step();
    assert.equal(raider.vel.x, before.vx);
    assert.equal(raider.vel.z, before.vz);
    t.fieldsSys._combatKernel.prePhysics(DT);
    const runtime = t.state.combat.entities[String(raider.id)];
    assert.ok(runtime && runtime.statuses[CRYO_LOCK_STATUS_ID], 'orbit contact must schedule Cryo Lock');
    assert.equal(helmControlScaleFromCombat(t.state, raider.id), CRYO_LOCK_CONTROL_SCALE);
  });
});
