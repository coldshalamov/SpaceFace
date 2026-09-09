// PQ-026.02 — Inertial shunt: the ram that stops you and launches them.
// Live writer: weapons.js listens on physics:impact and calls
// tryApplyInertialShuntFromImpact. Status without visible motion fails.
//
// Honesty (review 2026-09-09). Two separate things are proven here, and the file
// used to blur them:
//
//   1. THE LAW. The planner takes the impact receipt's `preSolveClosingSpeed`,
//      spends 95 % of it (`dumpVsLight`) off the shunter, and hands the whole
//      momentum m_shunter x lostSpeed to the target. Those tests are the
//      CONSTRUCTED-input tests below: they feed a closing speed by hand and pin
//      what the law does with it. They are honest about the law and say nothing
//      about the route.
//
//   2. THE ROUTE. The leaf's done-when is displacement on the default route:
//      "a shunt ram on a light hostile sends it >= 1 screen; the player stops
//      within 20 WU". The route's own numbers are the governed combat speeds in
//      src/core/flight/propulsionCatalog.js — Hitch 95, Hornet 84, Wasp 105 —
//      and the closing speed the engine actually publishes is the RELATIVE
//      radial closure (sg02DynamicBodyOwner.preSolveRadialClosingSpeed), not the
//      player's ground speed. The first pass of this file fed both proof hulls
//      105 WU/s. 105 is the WASP's cruise. Neither proof hull can hold it
//      unboosted, and no test covered a target that was moving.
//
// The route tests below therefore pin what the live inputs produce, including
// where that misses the leaf's bars. They assert the CURRENT numbers, never the
// aspirational ones, so a drive retune or a planner fix breaks them loudly.
//
// All travel figures are a 1 s no-drag ballistic coast of the queued impulses —
// no Rapier bounce, no drive authority, no AI braking. That is an UPPER bound on
// what the light actually covers and a LOWER bound on how far the reversal case
// throws the player.

import assert from 'node:assert/strict';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createBus } from '../src/core/eventBus.js';
import {
  resolvePropulsionProfile,
  resolveGovernedCombatSpeed,
} from '../src/core/flight/propulsionCatalog.js';
import { preSolveRadialClosingSpeed } from '../src/core/sg02DynamicBodyOwner.js';
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
// The first pass called this CRUISE and gave it to a Hornet and a Hitch. It is
// the Wasp's governed cruise. Kept as the constructed input it always was.
const CONSTRUCTED_CLOSING = 105;
const SCREEN = INERTIAL_SHUNT_TUNING.screenDepthWu;
const PLAYER_STOP = INERTIAL_SHUNT_TUNING.playerStopWu;
const HITCH = SHIPS.find((entry) => entry.id === 'ship_kestrel');
const HORNET = SHIPS.find((entry) => entry.id === 'ship_hornet');
const WASP = SHIPS.find((entry) => entry.id === 'ship_wasp');

/** The route's own governed cruise for a hull, straight off the live catalog. */
function governedCruise(ship) {
  return resolveGovernedCombatSpeed({
    id: `probe_${ship.id}`,
    type: 'ship',
    driveId: ship.driveId,
    mass: ship.mass,
  }, null, 0);
}

function driveProfile(ship) {
  return resolvePropulsionProfile({
    id: `probe_${ship.id}`,
    type: 'ship',
    driveId: ship.driveId,
    mass: ship.mass,
  }, null);
}

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

function headOnImpact(state, player, target, closingSpeed, causalActorId = player.id) {
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
    causalActorId,
    pos: { x: target.pos.x, z: 0 },
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: closingSpeed,
  };
}

/**
 * One head-on ram through the live hook.
 *
 * `shunterVelX` / `targetVelX` are ground speeds on +x; the target sits ahead of
 * the shunter, so a NEGATIVE target speed is a hostile flying INTO the player.
 * The closing speed handed to the hook is the live engine's own radial-closure
 * formula, not a hand-typed number: `preSolveRadialClosingSpeed`.
 */
function ram(shunterShip, shunterVelX, targetVelX, { causalIsTarget = false } = {}) {
  const player = hull(1, shunterShip, shunterVelX, [INERTIAL_SHUNT_WEAPON_ID]);
  const light = hull(2, WASP, targetVelX);
  player.pos.x = 0;
  light.pos.x = shunterShip.collisionRadius + WASP.collisionRadius;
  const state = combatState(player, light);
  const { bus } = armWeapons(state);

  let receipt = null;
  bus.on('weapons:inertialShunt', (payload) => { receipt = payload; });

  const closing = preSolveRadialClosingSpeed(player.vel.x, player.vel.z, light.vel.x, light.vel.z, 1, 0);
  bus.emit('physics:impact', headOnImpact(
    state,
    player,
    light,
    closing,
    causalIsTarget ? light.id : player.id,
  ));

  const playerKick = applyQueuedDeltaV(player);
  const lightKick = applyQueuedDeltaV(light);
  const playerRemainSpeed = Math.hypot(player.vel.x, player.vel.z);
  const lightSpeed = Math.hypot(light.vel.x, light.vel.z);
  return {
    receipt,
    closing,
    playerKick,
    lightKick,
    playerRemainSpeed,
    lightSpeed,
    playerVelAfterX: player.vel.x,
    lightVelAfterX: light.vel.x,
    lightTravel: coast(light, 1),
    playerTravel: coast(player, 1),
  };
}

function near(actual, expected, label, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${label}: expected ${expected}, got ${actual.toFixed(3)}`,
  );
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
  assert.equal(hitchWeapon && hitchWeapon.size, 'S', 'Hitch weapon slot is S');
  assert.equal(hornetWeapon && hornetWeapon.size, 'M', 'Hornet weapon slot is M');
  assert.equal(fits(hitchWeapon, weapon), true, 'the Hitch S slot takes the S shunt');
  assert.equal(fits(hornetWeapon, weapon), true, 'the Hornet M slot takes the S plate');
  // The starter has exactly ONE weapon slot. Wearing the plate means flying unarmed.
  assert.equal(
    buildSlotList(HITCH).filter((slot) => slot.type === 'weapon').length,
    1,
    'the Hitch has one weapon slot, so the plate replaces the only gun',
  );
});

test('PQ-026.02 route cruise: 105 WU/s is the WASP\'s governed cruise, not either proof hull\'s', () => {
  // The number the first pass of this proof called "cruise" and handed to a
  // Hornet and a Hitch. The live catalog disagrees; that disagreement is the
  // whole reason the receipt's headline was not a route number.
  assert.equal(governedCruise(WASP), CONSTRUCTED_CLOSING, 'Wasp governed cruise is 105');
  assert.equal(governedCruise(HITCH), 95, 'Hitch governed cruise is 95 (drive_reaction_m)');
  assert.equal(governedCruise(HORNET), 84, 'Hornet governed cruise is 84 (drive_gravimetric_s)');
  assert.ok(governedCruise(HITCH) < CONSTRUCTED_CLOSING, 'the starter cannot hold 105 unboosted');
  assert.ok(governedCruise(HORNET) < CONSTRUCTED_CLOSING, 'the Hornet cannot hold 105 unboosted');

  // Boost raises the governed cap (propulsionKernel.js:319-320, reaction family;
  // :413-415, gravimetric family). These are the only speeds above cruise a pilot
  // can hold on the drive alone.
  assert.equal(driveProfile(HITCH).boostSpeedMult, 1.55, 'Hitch boost cap multiplier');
  assert.equal(driveProfile(HORNET).boostMaxSpeed, 122, 'Hornet gravimetric boost ceiling');

  // And the closing speed the engine publishes is RELATIVE, so a hostile flying
  // at the player adds its own cruise to the number the planner spends.
  assert.equal(preSolveRadialClosingSpeed(95, 0, 0, 0, 1, 0), 95, 'parked target: closing == player speed');
  assert.equal(preSolveRadialClosingSpeed(95, 0, -105, 0, 1, 0), 200, 'oncoming target: closing == the sum');
});

test('PQ-026.02 the law, at a constructed 105 WU/s closing on a Hornet (not a route speed)', () => {
  const result = ram(HORNET, CONSTRUCTED_CLOSING, 0);
  assert.ok(result.receipt, 'weapons.js must fire weapons:inertialShunt on a ship x ship ram');
  assert.equal(result.receipt.shunterId, 1);
  assert.equal(result.receipt.targetId, 2);
  assert.equal(result.playerKick.applied, true, 'the live hook queued a player impulse');
  assert.equal(result.lightKick.applied, true, 'the live hook queued a target impulse');

  console.log(
    `PQ-026.02 constructed seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` lightDeltaV=${result.lightKick.deltaV.toFixed(3)}WU/s`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU / 1s`
    + ` hull=Hornet mass=${HORNET.mass} hook=weapons:inertialShunt`,
  );

  near(result.lightTravel, 149.625, 'constructed Hornet light travel');
  near(result.playerTravel, 5.250, 'constructed Hornet player travel');
  assert.ok(result.lightTravel >= SCREEN, 'at a constructed 105 the law clears one screen');
  assert.ok(result.playerTravel <= PLAYER_STOP, 'at a constructed 105 the law stops the shunter');
});

test('PQ-026.02 the law, at a constructed 105 WU/s closing on a Hitch (not a route speed)', () => {
  const result = ram(HITCH, CONSTRUCTED_CLOSING, 0);
  assert.ok(result.receipt, 'the Hitch still fires the live hook');
  console.log(
    `PQ-026.02 constructed Hitch seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU / 1s hull=Hitch mass=${HITCH.mass}`,
  );
  near(result.lightTravel, 112.219, 'constructed Hitch light travel');
  assert.ok(result.lightTravel < SCREEN, 'the lighter hull carries less momentum into the plate');
  near(result.playerTravel, 5.250, 'constructed Hitch player travel');
});

test('PQ-026.02 ROUTE: a Hitch at its own governed cruise misses the screen bar on a parked light', () => {
  const cruise = governedCruise(HITCH);
  const result = ram(HITCH, cruise, 0);
  assert.ok(result.receipt, 'the route ram fires the live hook');
  console.log(
    `PQ-026.02 ROUTE Hitch@cruise seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU / 1s`,
  );
  assert.equal(result.closing, 95, 'the starter arrives at its governed cruise');
  near(result.lightTravel, 101.531, 'route Hitch light travel');
  near(result.playerTravel, 4.750, 'route Hitch player travel');
  // The leaf's bars, measured. One met, one missed.
  assert.ok(result.playerTravel <= PLAYER_STOP, 'the player DOES stop within 20 WU here');
  assert.ok(
    result.lightTravel < SCREEN,
    `the light does NOT reach one screen at route cruise: ${result.lightTravel.toFixed(3)} of ${SCREEN} WU`,
  );
});

test('PQ-026.02 ROUTE: a Hornet at its own governed cruise also misses the screen bar', () => {
  const result = ram(HORNET, governedCruise(HORNET), 0);
  console.log(
    `PQ-026.02 ROUTE Hornet@cruise seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU / 1s`,
  );
  assert.equal(result.closing, 84, 'the Hornet arrives at its governed cruise');
  near(result.lightTravel, 119.700, 'route Hornet light travel');
  near(result.playerTravel, 4.200, 'route Hornet player travel');
  assert.ok(
    result.lightTravel < SCREEN,
    `the receipt's headline hull misses one screen at its OWN cruise: ${result.lightTravel.toFixed(3)}`,
  );
});

test('PQ-026.02 ROUTE: a boosted Hitch on a parked light is the one shape that meets both bars', () => {
  // Boost is the only pilot-held speed above the governed cruise
  // (propulsionKernel.js:319-320: baseCap = commandFraction x combatSpeed x boostSpeedMult).
  const boostedCruise = governedCruise(HITCH) * driveProfile(HITCH).boostSpeedMult;
  const result = ram(HITCH, boostedCruise, 0);
  console.log(
    `PQ-026.02 ROUTE Hitch@boost seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU / 1s`,
  );
  near(result.closing, 147.25, 'boosted starter cap');
  near(result.lightTravel, 157.373, 'boosted Hitch light travel');
  near(result.playerTravel, 7.363, 'boosted Hitch player travel');
  assert.ok(result.lightTravel >= SCREEN, 'boosted: the light clears one screen');
  assert.ok(result.playerTravel <= PLAYER_STOP, 'boosted: the player still stops');
});

test('PQ-026.02 ROUTE: head-on into an oncoming light REVERSES the player and still misses the screen', () => {
  // The engine publishes RELATIVE closure. The planner spends 95 % of it off the
  // shunter's own velocity, so a target flying at the player buys the light's
  // launch with the player's hull going backwards.
  const result = ram(HITCH, governedCruise(HITCH), -governedCruise(WASP));
  console.log(
    `PQ-026.02 ROUTE head-on seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` playerVelAfter=${result.playerVelAfterX.toFixed(3)}WU/s`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU / 1s`,
  );
  assert.equal(result.closing, 200, 'Hitch 95 + Wasp 105 of relative closure');
  // The light spends half its kick cancelling its own approach: displacement, not delta-v.
  near(result.lightTravel, 108.750, 'head-on light travel');
  assert.ok(
    result.lightTravel < SCREEN,
    `head-on still misses one screen in displacement: ${result.lightTravel.toFixed(3)}`,
  );
  // The player half is the defect, not a shortfall.
  assert.ok(result.playerVelAfterX < 0, 'the shunter is thrown BACKWARD through the contact');
  near(result.playerTravel, 95.000, 'head-on player travel');
  assert.ok(
    result.playerTravel > PLAYER_STOP,
    `the player travels ${result.playerTravel.toFixed(3)} WU, over the ${PLAYER_STOP} WU bar`,
  );
});

test('PQ-026.02 ROUTE: a parked plate-wearer rammed by a light is launched without touching a control', () => {
  // hullCarriesInertialShunt picks the shunter by FITTING, not by who rammed
  // whom (inertialShunt.js:126-137). A hostile that flies into a parked player
  // wearing the plate spends the player's momentum budget for them.
  const result = ram(HITCH, 0, -governedCruise(WASP), { causalIsTarget: true });
  console.log(
    `PQ-026.02 ROUTE rammed-while-parked seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens / 1s)`
    + ` playerVelAfter=${result.playerVelAfterX.toFixed(3)}WU/s`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU / 1s`,
  );
  assert.ok(result.receipt, 'the hook fires for the hull that WEARS the plate, whoever rammed');
  assert.equal(result.receipt.shunterId, 1, 'the parked player is the shunter');
  near(result.playerTravel, 99.750, 'parked player travel');
  assert.ok(
    result.playerTravel > PLAYER_STOP,
    `a parked player is thrown ${result.playerTravel.toFixed(3)} WU, over the ${PLAYER_STOP} WU bar`,
  );
  near(result.lightTravel, 7.219, 'the light barely moves');
  assert.ok(result.lightTravel < SCREEN, 'and the light does not go a screen either');
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
