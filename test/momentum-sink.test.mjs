import assert from 'node:assert/strict';
import test from 'node:test';

import { createCombatKernel } from '../src/combat/kernel.js';
import {
  fillMomentumSinkImpulse,
  MOMENTUM_SINK_FRAME_KIND,
  MOMENTUM_SINK_TUNING,
} from '../src/combat/momentumSink.js';
import { restoreCombatState, serializeCombatState } from '../src/combat/persistence.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { SIM_DT } from '../src/core/sim.js';
import {
  MOMENTUM_SINK_STATUS_ID,
  MOMENTUM_SINK_WEAPON_ID,
  STATUS_DEFS,
} from '../src/data/combatDefs.js';
import { TECH_NODES } from '../src/data/tech.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  buildWeaponDamagePacket,
  createMomentumSinkPlantScratch,
  isMomentumSinkAnchor,
  plantMomentumSinkBungee,
  releaseMomentumSinkBungee,
  tensionMomentumSinkBungee,
  tickMomentumSinkPlant,
  tryPlantMomentumSinkFromHit,
  weapons,
} from '../src/systems/weapons.js';
import { fillActiveMassCouplingTargets } from '../src/ui/momentumSinkOverlay.js';

const WEAPON_ID = 'wpn_momentum_sink_s';

test('Momentum Sink is a reachable small-slot setup weapon with no control effect', () => {
  const weapon = WEAPONS.find((entry) => entry.id === WEAPON_ID);
  const status = STATUS_DEFS.find((entry) => entry.id === MOMENTUM_SINK_STATUS_ID);
  const graviton = TECH_NODES.find((entry) => entry.id === 'tech_graviton_drives');

  assert.ok(weapon);
  assert.equal(weapon.size, 'S');
  assert.equal(weapon.requiresTech, 'tech_graviton_drives');
  assert.ok(weapon.dmg > 0 && weapon.dmg < 10);
  assert.ok(weapon.impulsePerHit > 0 && weapon.impulsePerHit <= 1,
    'the setup round has a readable hit ping, not a displacement payoff');
  assert.equal(weapon.impulseProvenance, 'momentum_sink_latch');
  assert.deepEqual(weapon.statuses, [{ id: MOMENTUM_SINK_STATUS_ID, stacks: 1 }]);
  assert.ok(graviton.unlocks.modules.includes(WEAPON_ID));

  assert.ok(status);
  assert.equal(status.stacking.mode, 'replace', 'a new hit explicitly owns the reference frame');
  assert.deepEqual(status.effects, {}, 'the status itself cannot suppress movement or controls');
  const packet = buildWeaponDamagePacket({ defId: weapon.id }, weapon, weapon.dmg, weapon.damageType);
  assert.deepEqual(packet.statuses, weapon.statuses);
});

test('the capped impulse converges on a moving frame and heavy bodies resist it', () => {
  const light = { x: 0, y: 0, z: 0 };
  const heavy = { x: 0, y: 0, z: 0 };
  const unmoored = { x: 0, y: 0, z: 0 };
  const stillFrame = { x: 0, z: 0 };
  const movingFrame = { x: 60, z: 20 };

  assert.equal(fillMomentumSinkImpulse(light, { x: 0, z: 0 }, stillFrame, 40, SIM_DT), false,
    'a matched frame creates no force');
  assert.equal(fillMomentumSinkImpulse(light, { x: 0, z: 0 }, movingFrame, 40, SIM_DT), true);
  assert.ok(light.x > 0 && light.z > 0, 'a moving frame pulls velocity toward itself, not world zero');
  const lightDeltaV = Math.hypot(light.x, light.z) / 40;
  assert.ok(lightDeltaV <= MOMENTUM_SINK_TUNING.maxAcceleration * SIM_DT + 1e-9);

  assert.equal(fillMomentumSinkImpulse(heavy, { x: 0, z: 0 }, movingFrame, 640, SIM_DT), true);
  const heavyDeltaV = Math.hypot(heavy.x, heavy.z) / 640;
  assert.ok(heavyDeltaV < lightDeltaV, 'authored heavy mass resists the same sink window');

  assert.equal(fillMomentumSinkImpulse(unmoored, { x: 0.4, z: 0 }, stillFrame, 40, SIM_DT, 0.3), true);
  const unmooredActualDeltaV = Math.abs(unmoored.x) / (40 * 0.3);
  assert.ok(unmooredActualDeltaV <= 0.4 + 1e-9,
    'low effective mass strengthens the sink without overshooting through the reference frame');
});

test('a landed sink uses the live physics owner without taking over flight state', async () => {
  const attacker = bodyEntity(1, 0, 40, { x: 60, z: 20 });
  const target = bodyEntity(2, 1, 40, { x: -40, z: -10 });
  const state = combatState(attacker, target);
  state.input = { axes: { thrust: 0.8, strafe: -0.25 }, actions: { brake: false } };
  state.player = { tether: { attachmentId: 'att_keep' } };
  const kernel = createCombatKernel({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  owner.syncFromEntities(state.entityList);
  owner.step(SIM_DT);
  const flightBefore = structuredClone({
    input: state.input,
    tether: state.player.tether,
    maxSpeed: target.maxSpeed,
  });

  try {
    const relativeBefore = relativeSpeed(target.vel, attacker.vel);
    const routed = landWeapon(kernel, attacker.id, target.id);
    assert.equal(routed.ok, true);
    state.tick += 1;
    state.simTime += SIM_DT;
    kernel.prePhysics(SIM_DT);

    const runtime = state.combat.entities[String(target.id)];
    const active = runtime.statuses[MOMENTUM_SINK_STATUS_ID];
    assert.ok(active);
    assert.equal(active.data.frameKind, MOMENTUM_SINK_FRAME_KIND);
    assert.deepEqual(active.data.frameVelocity, attacker.vel);
    assert.ok(state.combat.trace.events.some((entry) => entry.kind === 'momentumSink.frameBound'));

    const command = consumePhysicsCommand(target);
    assert.equal(command.control, null, 'the sink does not write a thrust/brake/steering controller');
    assert.deepEqual(command.torqueImpulses, [], 'the sink does not write facing torque');
    assert.equal(command.impulses.length, 1, 'the status queues one additive linear impulse');
    queuePhysicsImpulse(target, command.impulses[0]);

    owner.step(SIM_DT);
    assert.ok(relativeSpeed(target.vel, attacker.vel) < relativeBefore,
      'the production Rapier owner applies the bounded frame-relative impulse');
    assert.deepEqual({
      input: state.input,
      tether: state.player.tether,
      maxSpeed: target.maxSpeed,
    }, flightBefore, 'Momentum Sink owns no thrust, brake, facing, speed, or tether state');
  } finally {
    owner.dispose();
  }
});

test('the explicit frame survives Continue, expires cleanly, and drives a bounded HUD marker', () => {
  const attacker = bodyEntity(1, 0, 40, { x: 35, z: -15 });
  const target = bodyEntity(2, 1, 80, { x: 100, z: 0 });
  target.flags.persistent = true;
  const state = combatState(attacker, target);
  const kernel = createCombatKernel({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  landWeapon(kernel, attacker.id, target.id);
  landWeapon(kernel, attacker.id, target.id, 'wpn_gravity_marker_s');
  state.tick += 1;
  state.simTime += SIM_DT;
  kernel.prePhysics(SIM_DT);
  consumePhysicsCommand(target);

  const markers = [];
  const gravityMarkers = [];
  fillActiveMassCouplingTargets(state, attacker.id, gravityMarkers, markers, 6, 6);
  assert.deepEqual(gravityMarkers.map((entity) => entity.id), [target.id],
    'the shared traversal preserves the existing Gravity Mark overlay route');
  assert.deepEqual(markers.map((entity) => entity.id), [target.id]);

  const saved = serializeCombatState(state);
  const restoredAttacker = bodyEntity(11, 0, 40, { x: 35, z: -15 });
  const restoredTarget = bodyEntity(22, 1, 80, { x: 100, z: 0 });
  restoredTarget.flags.persistent = true;
  const restored = combatState(restoredAttacker, restoredTarget);
  restored.tick = state.tick;
  restored.simTime = state.simTime;
  const summary = restoreCombatState(restored, saved, (ref) => {
    if (ref && ref.kind === 'player') return restoredAttacker.id;
    if (ref && ref.kind === 'persistent' && ref.saveId === String(target.id)) return restoredTarget.id;
    return null;
  });
  assert.equal(summary.restoredEntities, 2);
  const active = restored.combat.entities[String(restoredTarget.id)].statuses[MOMENTUM_SINK_STATUS_ID];
  assert.equal(active.attackerId, restoredAttacker.id);
  assert.equal(active.data.frameKind, MOMENTUM_SINK_FRAME_KIND);
  assert.deepEqual(active.data.frameVelocity, attacker.vel);

  const restoredKernel = createCombatKernel({ state: restored, bus: createBus(), helpers: {}, registry: { get: () => null } });
  restored.tick = active.expiresTick;
  restored.simTime = restored.tick * SIM_DT;
  restoredKernel.prePhysics(SIM_DT);
  assert.equal(restored.combat.entities[String(restoredTarget.id)].statuses[MOMENTUM_SINK_STATUS_ID], undefined);
  assert.equal(consumePhysicsCommand(restoredTarget), null, 'expiry queues no hidden recovery impulse');
});

test('plant → tension → release exits at ≥ 2× cruise and keeps earned speed', () => {
  const cruise = 105;
  const mass = 40;
  const player = bodyEntity(1, 0, mass, { x: 0, z: 0 });
  player.combatSpeed = cruise;
  player.pos = { x: 12, z: 0 };
  const rock = rockEntity(99, 800);
  const plant = createMomentumSinkPlantScratch();
  const flightBefore = structuredClone({
    input: { axes: { thrust: 1, strafe: 0 }, actions: { brake: false } },
    maxSpeed: player.maxSpeed,
    combatSpeed: player.combatSpeed,
  });

  assert.equal(isMomentumSinkAnchor(rock, player), true);
  assert.equal(isMomentumSinkAnchor(bodyEntity(2, 1, 40, { x: 0, z: 0 }), player), false,
    'a light hostile stays an offensive damper target, not a bungee post');
  assert.equal(plantMomentumSinkBungee(plant, player, rock, 20), true);

  player.vel.x = cruise;
  player.vel.z = 0;
  player.pos.x = 90;
  assert.equal(tensionMomentumSinkBungee(plant, player, rock), true);
  assert.ok(plant.storedReceding >= cruise - 1e-9, 'tension stores the receding burn, not a nerfed cruise');

  const impulse = { x: 0, y: 0, z: 0 };
  assert.equal(releaseMomentumSinkBungee(impulse, plant, player), true);
  player.vel.x += impulse.x / mass;
  player.vel.z += impulse.z / mass;
  const exitSpeed = Math.hypot(player.vel.x, player.vel.z);
  const ratio = exitSpeed / cruise;
  console.log(`PQ-026.00 plant-tension-release exitSpeed=${exitSpeed.toFixed(3)} cruise=${cruise} ratio=${ratio.toFixed(3)}`);
  assert.ok(exitSpeed >= 2 * cruise,
    `If I swing well I EARN speed and I KEEP it: exit ${exitSpeed.toFixed(3)} must be ≥ 2× cruise ${2 * cruise}`);
  assert.ok(player.vel.x < 0, 'the snap slingshots back through the plant, not further away');
  assert.equal(player.maxSpeed, flightBefore.maxSpeed, 'the bungee does not write a speed cap');
  assert.equal(player.combatSpeed, flightBefore.combatSpeed);
});

test('a rock hit plants the bungee and the second trigger queues the snap', () => {
  const cruise = 105;
  const player = bodyEntity(1, 0, 40, { x: 0, z: 0 });
  player.combatSpeed = cruise;
  player.pos = { x: 16, z: 0 };
  player.data.weapons = [{ defId: WEAPON_ID, _cooldown: 0 }];
  const rock = rockEntity(99, 900);
  const state = combatState(player, rock);
  const planted = tryPlantMomentumSinkFromHit(state, {
    ownerId: player.id,
    targetId: rock.id,
    weaponId: MOMENTUM_SINK_WEAPON_ID,
  }, (id) => state.entities.get(id));
  assert.equal(planted, true);
  assert.equal(player.data.momentumSinkPlant.active, true);

  player.vel.x = cruise;
  player.pos.x = 80;
  const host = Object.create(weapons);
  host.state = state;
  host.bus = createBus();
  host._momentumSinkImpulse = { x: 0, y: 0, z: 0 };
  host._entityGetter = (id) => state.entities.get(id);
  tickMomentumSinkPlant(state, player, host._momentumSinkImpulse, host._entityGetter);
  assert.ok(player.data.momentumSinkPlant.storedReceding >= cruise - 1e-9);

  const released = host._releaseMomentumSinkIfReady(player, player.data.weapons[0], { id: WEAPON_ID }, state);
  assert.equal(released, true);
  const command = consumePhysicsCommand(player);
  assert.ok(command && command.impulses.length === 1, 'release is one additive impulse, not a velocity write');
  const impulse = command.impulses[0];
  player.vel.x += impulse.x / 40;
  player.vel.z += impulse.z / 40;
  const exitSpeed = Math.hypot(player.vel.x, player.vel.z);
  console.log(`PQ-026.00 second-trigger exitSpeed=${exitSpeed.toFixed(3)} cruise=${cruise} ratio=${(exitSpeed / cruise).toFixed(3)}`);
  assert.ok(exitSpeed >= 2 * cruise);
  assert.equal(player.data.momentumSinkPlant.active, false);
  assert.ok(player.data.weapons[0]._cooldown > 0, 'release spends the weapon cadence, not capacitor');
});

test('Rapier applies the bungee snap without taking over flight state', async () => {
  const cruise = 105;
  const player = bodyEntity(1, 0, 40, { x: 0, z: 0 });
  player.combatSpeed = cruise;
  player.pos = { x: 20, z: 0 };
  player.vel.x = cruise;
  const rock = rockEntity(99, 800);
  const plant = createMomentumSinkPlantScratch();
  assert.equal(plantMomentumSinkBungee(plant, player, rock, 20), true);
  player.pos.x = 100;
  assert.equal(tensionMomentumSinkBungee(plant, player, rock), true);

  const impulse = { x: 0, y: 0, z: 0 };
  assert.equal(releaseMomentumSinkBungee(impulse, plant, player), true);
  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  const flightBefore = structuredClone({
    maxSpeed: player.maxSpeed,
    combatSpeed: player.combatSpeed,
  });
  try {
    owner.syncFromEntities([player, rock]);
    owner.step(SIM_DT);
    queuePhysicsImpulse(player, impulse);
    owner.step(SIM_DT);
    const exitSpeed = Math.hypot(player.vel.x, player.vel.z);
    console.log(`PQ-026.00 rapier-release exitSpeed=${exitSpeed.toFixed(3)} cruise=${cruise} ratio=${(exitSpeed / cruise).toFixed(3)}`);
    assert.ok(exitSpeed >= 2 * cruise, 'the production Rapier owner keeps the returned momentum');
    assert.deepEqual({
      maxSpeed: player.maxSpeed,
      combatSpeed: player.combatSpeed,
    }, flightBefore, 'Momentum Sink owns no speed-cap state');
  } finally {
    owner.dispose();
  }
});

function rockEntity(id, mass) {
  const rock = bodyEntity(id, 1, mass, { x: 0, z: 0 });
  rock.type = 'asteroid';
  rock.pos = { x: 0, z: 0 };
  rock.maxSpeed = 0;
  rock.combatSpeed = 0;
  return rock;
}

function landWeapon(kernel, attackerId, targetId, weaponId = WEAPON_ID) {
  const weapon = WEAPONS.find((entry) => entry.id === weaponId);
  return kernel.routeDamage({
    attackerId,
    targetId,
    packet: buildWeaponDamagePacket({ defId: weapon.id }, weapon, weapon.dmg, weapon.damageType),
    origin: { kind: 'weapon', id: weapon.id, weaponId: weapon.id },
  });
}

function combatState(...entities) {
  return {
    tick: 20,
    simTime: 20 * SIM_DT,
    mode: 'flight',
    playerId: entities[0].id,
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    entityList: entities,
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 26029 },
  };
}

function bodyEntity(id, team, mass, vel) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    collides: true,
    pos: { x: id * 20, z: 0 },
    vel: { x: vel.x, z: vel.z },
    rot: 0.35,
    angVel: 0.12,
    radius: 10,
    mass,
    maxSpeed: 180,
    hull: 200,
    hullMax: 200,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass,
      inertiaY: mass * 4,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: {
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

function relativeSpeed(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
