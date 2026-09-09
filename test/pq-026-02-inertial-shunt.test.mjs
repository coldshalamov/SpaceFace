// PQ-026.02 — Inertial shunt: the ram that stops you and launches them.
// Live writer: weapons.js listens on physics:impact and calls
// tryApplyInertialShuntFromImpact. Status without visible motion fails.
//
// Honesty: the older inertial-shunt tests treat "1 screen" as leftover SPEED
// (deltaV ≥ 126 WU/s) and "stops within 20 WU" as leftover SPEED. The packet
// wording is displacement. This proof applies the queued impulses as
// instantaneous Δv (the same J/m physics will apply) and coasts both hulls
// for 1 s with no drag and no Rapier bounce. That 1 s window is one FEEL
// screen at 126 WU/s. If you only have the speed proxy, the printed travel
// numbers are that ballistic coast, not a headed capture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import {
  INERTIAL_SHUNT_TUNING,
  INERTIAL_SHUNT_WEAPON_ID,
} from '../src/data/combatDefs.js';
import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buildSlotList, fits } from '../src/systems/ships.js';
import { weapons } from '../src/systems/weapons.js';

const SEED = 26002;
const CRUISE = 105;
const SCREEN = INERTIAL_SHUNT_TUNING.screenDepthWu;
const PLAYER_STOP = INERTIAL_SHUNT_TUNING.playerStopWu;
const HITCH = SHIPS.find((entry) => entry.id === 'ship_kestrel');
const HORNET = SHIPS.find((entry) => entry.id === 'ship_hornet');
const WASP = SHIPS.find((entry) => entry.id === 'ship_wasp');

function hull(id, ship, velX, fittings = []) {
  const mass = ship.mass;
  const radius = ship.collisionRadius;
  return {
    id,
    type: 'ship',
    alive: true,
    mass,
    radius,
    pos: { x: 0, z: 0 },
    vel: { x: velX, z: 0 },
    physicsBody: {
      schemaVersion: 1,
      mass,
      radius,
      inertiaY: mass,
      dynamic: true,
      revision: 0,
    },
    data: {
      fittings,
      weapons: fittings.map((defId, slotIndex) => ({ defId, slotIndex })),
    },
  };
}

function combatState(player, target) {
  const entities = [player, target];
  return {
    tick: 40,
    simTime: 40 * SIM_DT,
    mode: 'flight',
    playerId: player.id,
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    entityList: entities,
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: SEED },
    rng: { next: () => 0.5 },
  };
}

function armWeapons(state) {
  const bus = createBus();
  const host = Object.create(weapons);
  host.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      getEntity(id) {
        return state.entities.get(id);
      },
    },
    registry: { get: () => null },
  });
  return { bus, host };
}

function applyQueuedDeltaV(entity) {
  const command = consumePhysicsCommand(entity);
  const mass = entity.physicsBody.mass;
  const before = { x: entity.vel.x, z: entity.vel.z };
  if (!command || !command.impulses.length) {
    return { applied: false, before, after: { x: entity.vel.x, z: entity.vel.z }, deltaV: 0 };
  }
  for (const impulse of command.impulses) {
    entity.vel.x += impulse.x / mass;
    entity.vel.z += impulse.z / mass;
  }
  const after = { x: entity.vel.x, z: entity.vel.z };
  return {
    applied: true,
    before,
    after,
    deltaV: Math.hypot(after.x - before.x, after.z - before.z),
  };
}

function coast(entity, seconds) {
  const start = { x: entity.pos.x, z: entity.pos.z };
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    entity.pos.x += entity.vel.x * SIM_DT;
    entity.pos.z += entity.vel.z * SIM_DT;
  }
  return Math.hypot(entity.pos.x - start.x, entity.pos.z - start.z);
}

function headOnImpact(state, player, target, closingSpeed) {
  return {
    consequenceKernelVersion: 1,
    backend: 'custom',
    tick: state.tick,
    aId: player.id,
    bId: target.id,
    dp: 800,
    trauma: 0.1,
    impulse: 800,
    playerInvolved: true,
    playerDeltaV: closingSpeed,
    causalActorId: player.id,
    pos: { x: target.pos.x, z: 0 },
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: closingSpeed,
  };
}

test('PQ-026.02 shunt catalog is a ping-only ram plate on graviton drives', () => {
  const weapon = WEAPONS.find((entry) => entry.id === INERTIAL_SHUNT_WEAPON_ID);
  const graviton = TECH_NODES.find((entry) => entry.id === 'tech_graviton_drives');
  assert.ok(weapon, 'Inertial Shunt S is in the catalog');
  assert.ok(HITCH && HORNET && WASP, 'Hitch / Hornet / Wasp hulls exist');
  assert.equal(weapon.size, 'S');
  assert.equal(weapon.requiresTech, 'tech_graviton_drives');
  assert.ok(weapon.impulsePerHit <= 1, 'the ping is not the shove');
  assert.ok(graviton.unlocks.modules.includes(INERTIAL_SHUNT_WEAPON_ID));
  assert.equal(INERTIAL_SHUNT_TUNING.screenDepthWu, 126);
  assert.equal(INERTIAL_SHUNT_TUNING.playerStopWu, 20);

  const hitchWeapon = buildSlotList(HITCH).find((slot) => slot.type === 'weapon');
  const hornetWeapon = buildSlotList(HORNET).find((slot) => slot.type === 'weapon');
  assert.equal(hitchWeapon && hitchWeapon.size, 'S', 'leftover Hitch weapon slot is S');
  assert.equal(hornetWeapon && hornetWeapon.size, 'M', 'leftover Hornet weapon slot is M');
  assert.equal(fits(hitchWeapon, weapon), true, 'leftover Hitch S slot takes the S shunt');
  assert.equal(fits(hornetWeapon, weapon), true, 'leftover Hornet M slot takes the S shunt');
});

test('PQ-026.02 live physics:impact hook shunts a Wasp ≥ 1 screen and stops the Hornet on seed 26002', () => {
  const player = hull(1, HORNET, CRUISE, [INERTIAL_SHUNT_WEAPON_ID]);
  const wasp = hull(2, WASP, 0);
  player.pos.x = 0;
  wasp.pos.x = HORNET.collisionRadius + WASP.collisionRadius;
  const state = combatState(player, wasp);
  const { bus } = armWeapons(state);

  let receipt = null;
  bus.on('weapons:inertialShunt', (payload) => {
    receipt = payload;
  });

  const closing = CRUISE;
  bus.emit('physics:impact', headOnImpact(state, player, wasp, closing));
  assert.ok(receipt, 'weapons.js must fire weapons:inertialShunt on a ship×ship ram');
  assert.equal(receipt.shunterId, player.id);
  assert.equal(receipt.targetId, wasp.id);

  const playerKick = applyQueuedDeltaV(player);
  const waspKick = applyQueuedDeltaV(wasp);
  assert.equal(playerKick.applied, true, 'the live hook queued a player impulse');
  assert.equal(waspKick.applied, true, 'the live hook queued a target impulse');

  const playerRemainSpeed = Math.hypot(player.vel.x, player.vel.z);
  const waspSpeed = Math.hypot(wasp.vel.x, wasp.vel.z);
  const lightTravel = coast(wasp, 1);
  const playerTravel = coast(player, 1);
  const timeToScreen = waspSpeed > 0 ? SCREEN / waspSpeed : Infinity;
  const playerTravelToScreen = playerRemainSpeed * timeToScreen;

  console.log(
    `PQ-026.02 seed=${SEED} lightTravel=${lightTravel.toFixed(3)}WU`
    + ` (${(lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` lightDeltaV=${waspKick.deltaV.toFixed(3)}WU/s`
    + ` playerTravel=${playerTravel.toFixed(3)}WU / 1s`
    + ` playerRemainSpeed=${playerRemainSpeed.toFixed(3)}WU/s`
    + ` playerTravelTo1Screen=${playerTravelToScreen.toFixed(3)}WU`
    + ` hook=weapons:inertialShunt`,
  );

  assert.ok(
    waspKick.deltaV >= SCREEN,
    `speed proxy: light Δv ${waspKick.deltaV.toFixed(3)} must be ≥ ${SCREEN} WU/s`,
  );
  assert.ok(
    playerRemainSpeed <= PLAYER_STOP,
    `speed proxy: player leftover ${playerRemainSpeed.toFixed(3)} must be ≤ ${PLAYER_STOP} WU/s`,
  );
  assert.ok(
    lightTravel >= SCREEN,
    `displacement: Wasp must fly ≥ 1 screen in 1s, got ${lightTravel.toFixed(3)} WU`,
  );
  assert.ok(
    playerTravel <= PLAYER_STOP,
    `displacement: Hornet must stay within ${PLAYER_STOP} WU in 1s, got ${playerTravel.toFixed(3)} WU`,
  );
});

test('PQ-026.02 leftover Hitch fit: S shunt rams a Wasp but leftover Hitch mass stays short of 1 screen', () => {
  const player = hull(1, HITCH, CRUISE, [INERTIAL_SHUNT_WEAPON_ID]);
  const wasp = hull(2, WASP, 0);
  player.pos.x = 0;
  wasp.pos.x = HITCH.collisionRadius + WASP.collisionRadius;
  const state = combatState(player, wasp);
  const { bus } = armWeapons(state);
  let receipt = null;
  bus.on('weapons:inertialShunt', (payload) => {
    receipt = payload;
  });
  bus.emit('physics:impact', headOnImpact(state, player, wasp, CRUISE));
  assert.ok(receipt, 'leftover Hitch still fires the live hook');
  applyQueuedDeltaV(player);
  const waspKick = applyQueuedDeltaV(wasp);
  const lightTravel = coast(wasp, 1);
  const playerTravel = coast(player, 1);
  console.log(
    `PQ-026.02 leftover Hitch seed=${SEED} lightTravel=${lightTravel.toFixed(3)}WU`
    + ` (${(lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` lightDeltaV=${waspKick.deltaV.toFixed(3)}WU/s`
    + ` playerTravel=${playerTravel.toFixed(3)}WU / 1s`
    + ` hull=Hitch mass=${HITCH.mass}`,
  );
  assert.ok(
    Math.abs(lightTravel - 112.219) < 0.01,
    `leftover Hitch cruise ram stays 112.219 WU / 1s, got ${lightTravel.toFixed(3)}`,
  );
  assert.ok(
    lightTravel < SCREEN,
    `leftover Hitch does not meet the Hornet screen bar, got ${lightTravel.toFixed(3)} WU`,
  );
  assert.ok(
    playerTravel <= PLAYER_STOP,
    `leftover Hitch still stops within ${PLAYER_STOP} WU, got ${playerTravel.toFixed(3)} WU`,
  );
});

test('PQ-026.02 live hook ignores a scrape under the closing floor', () => {
  const player = hull(1, HORNET, 95, [INERTIAL_SHUNT_WEAPON_ID]);
  const scrape = hull(3, WASP, 90);
  scrape.pos.x = HORNET.collisionRadius + WASP.collisionRadius;
  const state = combatState(player, scrape);
  const { bus } = armWeapons(state);
  let receipt = null;
  bus.on('weapons:inertialShunt', (payload) => {
    receipt = payload;
  });
  bus.emit('physics:impact', headOnImpact(state, player, scrape, 5));
  assert.equal(receipt, null, 'a scrape must not emit weapons:inertialShunt');
  assert.equal(consumePhysicsCommand(player), null);
  assert.equal(consumePhysicsCommand(scrape), null);
});
