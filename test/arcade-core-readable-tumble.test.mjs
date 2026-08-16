import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCombatKernel } from '../src/combat/kernel.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import {
  COLLISION_TUMBLE_KIND,
  MASSLINE_TUMBLE_KIND,
  overwhelmsAttitudeControl,
  readTumbleStatus,
} from '../src/combat/tumbleStatus.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { createBus } from '../src/core/eventBus.js';
import {
  consumePhysicsCommand,
  queuePhysicsImpulse,
} from '../src/core/physicsAuthority.js';

test('the canonical physical threshold flips a light hull while the same impulse leaves a heavy hull in control', () => {
  const concussion = WEAPONS.find((weapon) => weapon.id === 'wpn_concussion_cannon_m');
  assert.ok(concussion, 'the shipped Concussion Cannon must exist');
  assert.equal(overwhelmsAttitudeControl(concussion.impulsePerHit / 16), true);
  assert.equal(overwhelmsAttitudeControl(concussion.impulsePerHit / 150), false);
});

test('an authored weapon impulse schedules the shared tumble only for the light hull and uses angular authority', (t) => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; });

  const concussion = WEAPONS.find((weapon) => weapon.id === 'wpn_concussion_cannon_m');
  const light = routeConcussion(concussion, 16, 2);
  const heavy = routeConcussion(concussion, 150, 3);

  const lightRuntime = light.state.combat.entities[String(light.target.id)];
  const heavyRuntime = heavy.state.combat.entities[String(heavy.target.id)];
  const lightTumble = lightRuntime.pendingStatuses.find((status) => status.id === 'status_tumbling');
  const heavyTumble = heavyRuntime.pendingStatuses.find((status) => status.id === 'status_tumbling');
  assert.equal(lightTumble?.data.kind, 'impulse_tumble');
  assert.equal(lightTumble?.data.source, 'weapon_impulse');
  assert.equal(lightTumble?.data.cause, 'concussion_slug');
  assert.equal(heavyTumble, undefined, 'mass—not a target tag—makes the heavy hull shrug');
  assert.ok(light.torque.some((call) => call.reason === 'weapon_impulse_tumble_entry'),
    'the light hull entry spin crosses the angular physics port');
  assert.equal(heavy.torque.some((call) => call.reason === 'weapon_impulse_tumble_entry'), false);
  assert.equal(light.target.rot, 0, 'combat routing never writes rotation directly');
  assert.equal(light.target.angVel, 0, 'combat routing never writes angular velocity directly');
});

test('collision and Massline records share one zero-control owner without losing provenance or external impulses', () => {
  const bus = createBus();
  const collisionShip = ship(2, 20);
  const masslineShip = ship(3, 20);
  const player = ship(1, 20);
  const playerBefore = { ...player.vel };
  const state = {
    tick: 60,
    simTime: 1,
    mode: 'flight',
    playerId: player.id,
    entities: new Map([[player.id, player], [collisionShip.id, collisionShip], [masslineShip.id, masslineShip]]),
    combat: {
      entities: {
        [collisionShip.id]: combatRuntime(tumble(COLLISION_TUMBLE_KIND, 'collision', 'terrain', 0, 4)),
        [masslineShip.id]: combatRuntime(tumble(MASSLINE_TUMBLE_KIND, 'massline', 'thrown', 0, 4)),
        [player.id]: combatRuntime(tumble(COLLISION_TUMBLE_KIND, 'collision', 'terrain', 0, 4)),
      },
      trace: [],
      threatTables: new Map(),
    },
  };
  const clears = [];
  const kernel = {
    catalog: createCombatCatalog(),
    statuses: {
      clear(entity, runtime, id, reason) {
        clears.push({ entityId: entity.id, id, reason });
        delete runtime.statuses[id];
        runtime.pendingStatuses = (runtime.pendingStatuses || []).filter((status) => status.id !== id);
        return true;
      },
    },
  };
  tumbleStates.init({
    state,
    bus,
    helpers: {},
    registry: { get: (id) => id === 'combat' ? { kernel } : null },
  });
  try {
    queuePhysicsImpulse(collisionShip, { x: 9, y: 0, z: -4 });
    tumbleStates.update(1 / 60, state);

    const collisionCommand = consumePhysicsCommand(collisionShip);
    const masslineCommand = consumePhysicsCommand(masslineShip);
    assert.equal(collisionCommand.control.mode, 'tumbling');
    assert.equal(collisionCommand.control.source, COLLISION_TUMBLE_KIND);
    assert.deepEqual(collisionCommand.impulses, [{ x: 9, y: 0, z: -4 }],
      'zero drive authority leaves authored external impulses intact');
    assert.equal(masslineCommand.control.mode, 'tumbling');
    assert.equal(masslineCommand.control.source, MASSLINE_TUMBLE_KIND);
    assert.equal(collisionShip.data.intent.fire, false);
    assert.equal(collisionShip.data.intent.moveX, 0);
    assert.equal(collisionShip.data.intent.moveZ, 0);
    assert.equal(masslineShip.data.intent.fire, false);
    assert.equal(readTumbleStatus(state, collisionShip)?.data.source, 'collision');
    assert.equal(readTumbleStatus(state, masslineShip)?.data.source, 'massline');
    assert.deepEqual(player.vel, playerBefore, 'player immunity never changes motion');
    assert.equal(clears.some((entry) => entry.entityId === player.id && entry.reason === 'player_immune'), true);
    assert.equal(consumePhysicsCommand(player), null, 'the shared owner never suppresses player control');
  } finally {
    tumbleStates.destroy();
    bus.clear();
  }
});

test('real spin decay clears tumble without a velocity, rotation, or angular-velocity write', () => {
  const bus = createBus();
  const victim = ship(2, 20);
  victim.vel = { x: 31, z: -12 };
  victim.rot = 0.7;
  victim.angVel = 0.8;
  const before = { vel: { ...victim.vel }, rot: victim.rot, angVel: victim.angVel };
  const runtime = combatRuntime(tumble(COLLISION_TUMBLE_KIND, 'collision', 'structure', 0, 6));
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    entities: new Map([[victim.id, victim]]),
    combat: { entities: { [victim.id]: runtime }, trace: [], threatTables: new Map() },
  };
  const ended = [];
  bus.on('combat:tumbleEnd', (payload) => ended.push(payload));
  const kernel = {
    catalog: createCombatCatalog(),
    statuses: {
      clear(_entity, targetRuntime, id) {
        delete targetRuntime.statuses[id];
        return true;
      },
    },
  };
  tumbleStates.init({ state, bus, helpers: {}, registry: { get: () => ({ kernel }) } });
  try {
    tumbleStates.update(1 / 60, state);
    assert.equal(readTumbleStatus(state, victim), null);
    assert.deepEqual(victim.vel, before.vel);
    assert.equal(victim.rot, before.rot);
    assert.equal(victim.angVel, before.angVel);
    assert.equal(consumePhysicsCommand(victim), null, 'recovery clears status instead of writing a corrective command');
    assert.equal(ended.length, 1);
    assert.equal(ended[0].source, 'collision');
    assert.equal(ended[0].recovered, true);
  } finally {
    tumbleStates.destroy();
    bus.clear();
  }
});

function routeConcussion(definition, targetMass, targetId) {
  const attacker = ship(1, 20);
  const target = ship(targetId, targetMass);
  target.pos.x = 40;
  target.angVel = 0;
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: attacker.id,
    entities: new Map([[attacker.id, attacker], [target.id, target]]),
    entityList: [attacker, target],
    combat: { beams: [], threatTables: new Map(), trace: [] },
    meta: { seed: 47 },
  };
  const linear = [];
  const torque = [];
  const kernel = createCombatKernel({
    state,
    bus: createBus(),
    registry: { get: () => null },
    helpers: {
      combatPhysics: {
        applyImpulse(input) { linear.push(structuredClone(input)); return true; },
        applyTorqueImpulse(input) { torque.push(structuredClone(input)); return true; },
      },
    },
  });
  const packet = buildWeaponDamagePacket({ defId: definition.id }, definition, definition.dmg, definition.damageType);
  packet.hit = {
    pos: { x: target.pos.x, z: target.pos.z + target.radius * 0.75 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
  };
  const result = kernel.routeDamage({
    attackerId: attacker.id,
    targetId: target.id,
    packet,
    origin: { kind: 'weapon', id: definition.id, weaponId: definition.id },
  });
  assert.equal(result.ok, true);
  assert.equal(linear.length, 1);
  return { state, target, linear, torque };
}

function ship(id, mass) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: id === 1 ? 0 : 1,
    factionId: `faction_test_${id}`,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 2.2,
    radius: 10,
    mass,
    hull: 500,
    hullMax: 500,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: {
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_standard_ship',
      intent: { fire: true, moveX: 1, moveZ: -1 },
    },
  };
}

function tumble(kind, source, cause, startedAt, until) {
  return {
    id: 'status_tumbling',
    expiresTick: Math.ceil(until * 60),
    data: { kind, source, cause, startedAt, until, spin: 2.2 },
  };
}

function combatRuntime(status) {
  return {
    statuses: { status_tumbling: status },
    pendingStatuses: [],
    capabilities: { drive: true },
  };
}
