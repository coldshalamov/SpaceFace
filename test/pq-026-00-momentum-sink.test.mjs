// PQ-026.00 — Momentum sink as the bungee.
// Plant on a rock, burn away, release: exit at ≥ 2× cruise and keep that speed.
// Live writers: weapons.js plant / tension / second-trigger release; Rapier applies the snap.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { SIM_DT } from '../src/core/sim.js';
import { MOMENTUM_SINK_WEAPON_ID } from '../src/data/combatDefs.js';
import {
  tickMomentumSinkPlant,
  tryPlantMomentumSinkFromHit,
  weapons,
} from '../src/systems/weapons.js';

const SEED = 26029;
const CRUISE = 105;
const MASS = 40;
const WEAPON_ID = MOMENTUM_SINK_WEAPON_ID;

test('PQ-026.00 plant → tension → release exits at ≥ 2× cruise on seed 26029', async () => {
  const player = bodyEntity(1, 0, MASS, { x: 0, z: 0 });
  player.combatSpeed = CRUISE;
  player.pos = { x: 16, z: 0 };
  player.data.weapons = [{ defId: WEAPON_ID, _cooldown: 0 }];
  const rock = rockEntity(99, 900);
  const state = combatState(player, rock);

  const planted = tryPlantMomentumSinkFromHit(state, {
    ownerId: player.id,
    targetId: rock.id,
    weaponId: WEAPON_ID,
  }, (id) => state.entities.get(id));
  assert.equal(planted, true, 'a rock hit plants the bungee on the shooter');

  player.vel.x = CRUISE;
  player.pos.x = 80;
  const host = Object.create(weapons);
  host.state = state;
  host.bus = createBus();
  host._momentumSinkImpulse = { x: 0, y: 0, z: 0 };
  host._entityGetter = (id) => state.entities.get(id);
  tickMomentumSinkPlant(state, player, host._momentumSinkImpulse, host._entityGetter);
  assert.ok(player.data.momentumSinkPlant.storedReceding >= CRUISE - 1e-9,
    'tension stores the receding burn, not a nerfed cruise');

  const flightBefore = {
    maxSpeed: player.maxSpeed,
    combatSpeed: player.combatSpeed,
  };
  assert.equal(host._releaseMomentumSinkIfReady(player, player.data.weapons[0], { id: WEAPON_ID }, state), true);
  const command = consumePhysicsCommand(player);
  assert.ok(command && command.impulses.length === 1, 'release is one additive impulse');

  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  try {
    owner.syncFromEntities([player, rock]);
    owner.step(SIM_DT);
    queuePhysicsImpulse(player, command.impulses[0]);
    owner.step(SIM_DT);
    const exitSpeed = Math.hypot(player.vel.x, player.vel.z);
    const ratio = exitSpeed / CRUISE;
    console.log(`PQ-026.00 seed=${SEED} exitSpeed=${exitSpeed.toFixed(3)} cruise=${CRUISE} ratio=${ratio.toFixed(3)}`);
    assert.ok(exitSpeed >= 2 * CRUISE,
      `If I swing well I EARN speed and I KEEP it: exit ${exitSpeed.toFixed(3)} must be ≥ 2× cruise ${2 * CRUISE}`);
    assert.ok(player.vel.x < 0, 'the snap slingshots back through the plant');
    assert.equal(player.maxSpeed, flightBefore.maxSpeed, 'the bungee does not write a speed cap');
    assert.equal(player.combatSpeed, flightBefore.combatSpeed);
    assert.equal(player.data.momentumSinkPlant.active, false);
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

function combatState(...entities) {
  return {
    tick: 20,
    simTime: 20 * SIM_DT,
    mode: 'flight',
    playerId: entities[0].id,
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    entityList: entities,
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: SEED },
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
