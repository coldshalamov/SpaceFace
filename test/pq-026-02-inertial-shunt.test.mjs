// PQ-026.02 — Inertial shunt: the ram that stops you and launches them.
// Live writer: weapons.js listens on physics:impact and calls
// applyInertialShuntFromImpact. Relative closing is the ram floor. The dump
// is the shunter's own speed along the contact, fully redirected, equal-and-
// opposite. Status without visible motion fails.
//
// Before (library dump of relative closing, dumpVsLight 0.95, 1 s coast):
//   Hitch@cruise 95 → light 101.531 WU, player 4.750 WU. Screen miss.
//   Hornet@cruise 84 → light 119.700 WU, player 4.200 WU. Screen miss.
//   Head-on reversed the player 95 WU.
// After: dump the shunter's own normal speed at liveDumpVsLight 1. Travel is
// measured over B3's 1.2 s screen-crossing (126 WU at Wasp cruise).
//
// Seed 26002. Ballistic coast — no Rapier bounce, no drive, no AI brake.

import assert from 'node:assert/strict';
import test from 'node:test';

import { HITSTUN_IMPULSE_EVENT, readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
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
import {
  resolveInertialShuntVfxPlan,
  createInertialShuntVfxPlanScratch,
} from '../src/render/momentumSinkVfx.js';
import { buildSlotList, fits } from '../src/systems/ships.js';
import { weapons } from '../src/systems/weapons.js';

const SEED = 26002;
const SCREEN = INERTIAL_SHUNT_TUNING.screenDepthWu;
const COAST_S = INERTIAL_SHUNT_TUNING.screenCoastS;
const PLAYER_STOP = INERTIAL_SHUNT_TUNING.playerStopWu;
const MOMENTUM_TOLERANCE = INERTIAL_SHUNT_TUNING.momentumTolerance;
const HITCH = SHIPS.find((entry) => entry.id === 'ship_kestrel');
const HORNET = SHIPS.find((entry) => entry.id === 'ship_hornet');
const WASP = SHIPS.find((entry) => entry.id === 'ship_wasp');

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
    angVel: 0,
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
    return {
      applied: false,
      before,
      after: { x: entity.vel.x, z: entity.vel.z },
      deltaV: 0,
      torque: 0,
    };
  }
  for (const impulse of command.impulses) {
    entity.vel.x += impulse.x / mass;
    entity.vel.z += impulse.z / mass;
  }
  let torque = 0;
  if (Array.isArray(command.torqueImpulses)) {
    for (const twist of command.torqueImpulses) {
      torque += twist.y || 0;
      entity.angVel = (entity.angVel || 0) + (twist.y || 0) / mass;
    }
  }
  const after = { x: entity.vel.x, z: entity.vel.z };
  return {
    applied: true,
    before,
    after,
    deltaV: Math.hypot(after.x - before.x, after.z - before.z),
    torque,
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

function pairMomentumX(a, b) {
  return a.physicsBody.mass * a.vel.x + b.physicsBody.mass * b.vel.x;
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

function ram(shunterShip, shunterVelX, targetVelX, {
  causalIsTarget = false,
  plateOnTarget = false,
} = {}) {
  const playerFit = plateOnTarget ? [] : [INERTIAL_SHUNT_WEAPON_ID];
  const targetFit = plateOnTarget ? [INERTIAL_SHUNT_WEAPON_ID] : [];
  const player = hull(1, shunterShip, shunterVelX, playerFit);
  const light = hull(2, WASP, targetVelX, targetFit);
  player.pos.x = 0;
  light.pos.x = shunterShip.collisionRadius + WASP.collisionRadius;
  const state = combatState(player, light);
  const { bus } = armWeapons(state);

  let receipt = null;
  let vfxCue = null;
  let hitstun = null;
  bus.on('weapons:inertialShunt', (payload) => { receipt = payload; });
  bus.on('presentation:vfxCue', (payload) => { vfxCue = payload; });
  bus.on(HITSTUN_IMPULSE_EVENT, (payload) => { hitstun = payload; });

  const closing = preSolveRadialClosingSpeed(player.vel.x, player.vel.z, light.vel.x, light.vel.z, 1, 0);
  const momentumBefore = pairMomentumX(player, light);
  bus.emit('physics:impact', headOnImpact(
    state,
    player,
    light,
    closing,
    causalIsTarget ? light.id : player.id,
  ));

  const playerKick = applyQueuedDeltaV(player);
  const lightKick = applyQueuedDeltaV(light);
  const momentumAfter = pairMomentumX(player, light);
  return {
    receipt,
    vfxCue,
    hitstun,
    closing,
    player,
    light,
    playerKick,
    lightKick,
    momentumBefore,
    momentumAfter,
    momentumResidual: Math.abs(momentumAfter - momentumBefore),
    playerRemainSpeed: Math.hypot(player.vel.x, player.vel.z),
    lightSpeed: Math.hypot(light.vel.x, light.vel.z),
    playerVelAfterX: player.vel.x,
    lightVelAfterX: light.vel.x,
    lightTravel: coast(light, COAST_S),
    playerTravel: coast(player, COAST_S),
    lightProvenance: readRecentImpulseProvenance(light, state.tick),
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
  assert.equal(INERTIAL_SHUNT_TUNING.screenCoastS, 1.2);
  assert.equal(INERTIAL_SHUNT_TUNING.liveDumpVsLight, 1);

  const hitchWeapon = buildSlotList(HITCH).find((slot) => slot.type === 'weapon');
  const hornetWeapon = buildSlotList(HORNET).find((slot) => slot.type === 'weapon');
  assert.equal(hitchWeapon && hitchWeapon.size, 'S', 'Hitch weapon slot is S');
  assert.equal(hornetWeapon && hornetWeapon.size, 'M', 'Hornet weapon slot is M');
  assert.equal(fits(hitchWeapon, weapon), true, 'the Hitch S slot takes the S shunt');
  assert.equal(fits(hornetWeapon, weapon), true, 'the Hornet M slot takes the S plate');
  assert.equal(
    buildSlotList(HITCH).filter((slot) => slot.type === 'weapon').length,
    1,
    'the Hitch has one weapon slot, so the plate replaces the only gun',
  );
});

test('PQ-026.02 route cruise numbers are the live catalog, not a constructed 105', () => {
  assert.equal(governedCruise(WASP), 105, 'Wasp governed cruise is 105');
  assert.equal(governedCruise(HITCH), 95, 'Hitch governed cruise is 95');
  assert.equal(governedCruise(HORNET), 84, 'Hornet governed cruise is 84');
  near(SCREEN / governedCruise(WASP), COAST_S, 'B3 screen-crossing time');
  assert.equal(driveProfile(HITCH).boostSpeedMult, 1.55, 'Hitch boost cap multiplier');
  assert.equal(preSolveRadialClosingSpeed(95, 0, 0, 0, 1, 0), 95);
  assert.equal(preSolveRadialClosingSpeed(95, 0, -105, 0, 1, 0), 200);
});

test('PQ-026.02 ROUTE seed 26002: Hitch@cruise ram sends a Wasp ≥ 1 screen and stops the player', () => {
  const cruise = governedCruise(HITCH);
  const result = ram(HITCH, cruise, 0);
  assert.ok(result.receipt, 'weapons.js must fire weapons:inertialShunt on a ship x ship ram');
  assert.equal(result.receipt.shunterId, 1);
  assert.equal(result.receipt.targetId, 2);
  assert.equal(result.playerKick.applied, true);
  assert.equal(result.lightKick.applied, true);
  assert.ok(result.playerKick.torque === 0, 'the shunter does not get a gyro');
  assert.ok(result.lightKick.torque > 0, 'the light tumbles as it flies — second consequence');
  assert.ok(result.hitstun && result.hitstun.victimId === 2, 'the light loses the helm');
  assert.ok(result.vfxCue && result.vfxCue.id === 'combat.inertialShunt.contact');
  assert.equal(result.lightProvenance && result.lightProvenance.tag, 'inertial_shunt');
  assert.ok(result.momentumResidual < MOMENTUM_TOLERANCE,
    `momentum residual ${result.momentumResidual} must stay under ${MOMENTUM_TOLERANCE}`);

  console.log(
    `PQ-026.02 ROUTE Hitch@cruise seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU / ${COAST_S}s`
    + ` (${(result.lightTravel / SCREEN).toFixed(3)} screens)`
    + ` lightDeltaV=${result.lightKick.deltaV.toFixed(3)}WU/s`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU`
    + ` residual=${result.momentumResidual.toExponential(2)}`
    + ` hull=Hitch mass=${HITCH.mass}`,
  );

  assert.equal(result.closing, 95);
  near(result.lightKick.deltaV, 106.875, 'Hitch dumps its own 95 into the Wasp');
  near(result.lightTravel, 128.25, 'B3 1.2 s coast');
  near(result.playerTravel, 0, 'player remaining travel');
  assert.ok(result.lightTravel >= SCREEN,
    `light must cover ≥ 1 screen: ${result.lightTravel.toFixed(3)} of ${SCREEN} WU`);
  assert.ok(result.playerTravel <= PLAYER_STOP,
    `player must stop within ${PLAYER_STOP} WU: ${result.playerTravel.toFixed(3)}`);
});

test('PQ-026.02 ROUTE seed 26002: Hornet@cruise also clears the screen and stops', () => {
  const result = ram(HORNET, governedCruise(HORNET), 0);
  console.log(
    `PQ-026.02 ROUTE Hornet@cruise seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` lightTravel=${result.lightTravel.toFixed(3)}WU / ${COAST_S}s`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU`,
  );
  assert.equal(result.closing, 84);
  near(result.lightKick.deltaV, 126, 'Hornet mass 24 at 84 dumps exactly one screen/s');
  near(result.lightTravel, 151.2, 'Hornet 1.2 s coast');
  assert.ok(result.lightTravel >= SCREEN);
  assert.ok(result.playerTravel <= PLAYER_STOP);
  assert.ok(result.momentumResidual < MOMENTUM_TOLERANCE);
});

test('PQ-026.02 conservation: equal-and-opposite within named tolerance', () => {
  const result = ram(HITCH, governedCruise(HITCH), 0);
  assert.ok(result.receipt);
  near(result.receipt.momentumResidual, 0, 'impulse pair residual', MOMENTUM_TOLERANCE);
  assert.ok(result.momentumResidual < MOMENTUM_TOLERANCE);
  const boosted = ram(HITCH, governedCruise(HITCH) * driveProfile(HITCH).boostSpeedMult, 0);
  assert.ok(boosted.momentumResidual < MOMENTUM_TOLERANCE, 'boosted ram still conserves');
  const headOn = ram(HITCH, governedCruise(HITCH), -governedCruise(WASP));
  assert.ok(headOn.momentumResidual < MOMENTUM_TOLERANCE, 'head-on ram still conserves');
});

test('PQ-026.02 head-on dumps YOUR speed, not relative closing — player stops, no reverse throw', () => {
  const result = ram(HITCH, governedCruise(HITCH), -governedCruise(WASP));
  console.log(
    `PQ-026.02 ROUTE head-on seed=${SEED} closing=${result.closing.toFixed(3)}`
    + ` playerVelAfter=${result.playerVelAfterX.toFixed(3)}`
    + ` lightVelAfter=${result.lightVelAfterX.toFixed(3)}`
    + ` playerTravel=${result.playerTravel.toFixed(3)}WU`,
  );
  assert.equal(result.closing, 200, 'engine still publishes relative 200');
  assert.ok(result.receipt, 'the ram still fires');
  near(result.playerVelAfterX, 0, 'player dumped their own 95, not the 200 relative');
  assert.ok(result.playerTravel <= PLAYER_STOP, 'player does not reverse through the contact');
  assert.ok(result.momentumResidual < MOMENTUM_TOLERANCE);
});

test('PQ-026.02 parked plate does not invent closing speed', () => {
  const result = ram(HITCH, 0, -governedCruise(WASP), { causalIsTarget: true });
  assert.equal(result.receipt, null, 'a parked plate has nothing of its own to dump');
  assert.equal(result.playerKick.applied, false);
  assert.equal(result.lightKick.applied, false);
});

test('PQ-026.02 NPC plate-wearer is a shunter: Wasp ram stops the Wasp and throws the Hitch', () => {
  const result = ram(HITCH, 0, -governedCruise(WASP), { plateOnTarget: true, causalIsTarget: true });
  assert.ok(result.receipt, 'an NPC with the plate fitted uses the same live hook');
  assert.equal(result.receipt.shunterId, 2, 'the Wasp is the shunter');
  assert.equal(result.receipt.targetId, 1);
  near(result.lightVelAfterX, 0, 'the NPC dumps its own speed and stops');
  assert.ok(result.playerKick.deltaV > 80, 'the player is the launched body');
  assert.ok(result.hitstun && result.hitstun.victimId === 1, 'the thrown player loses the helm');
  assert.ok(result.momentumResidual < MOMENTUM_TOLERANCE);
});

test('PQ-026.02 throw path crosses a rock — the redirect goes somewhere that matters', () => {
  const result = ram(HITCH, governedCruise(HITCH), 0);
  const rockX = 70;
  const startX = result.light.pos.x - result.light.vel.x * COAST_S;
  assert.ok(startX < rockX, 'the Wasp starts short of the rock');
  assert.ok(result.light.pos.x > rockX, 'after the 1.2 s coast the Wasp has flown through the rock');
  assert.equal(result.lightProvenance.weaponId, INERTIAL_SHUNT_WEAPON_ID);
});

test('PQ-026.02 heavy shrugs — couple, not a free thruster', () => {
  const player = hull(1, HITCH, governedCruise(HITCH), [INERTIAL_SHUNT_WEAPON_ID]);
  const heavy = hull(2, HORNET, 0);
  heavy.mass = 150;
  heavy.physicsBody.mass = 150;
  heavy.pos.x = HITCH.collisionRadius + HORNET.collisionRadius;
  const state = combatState(player, heavy);
  const { bus } = armWeapons(state);
  let receipt = null;
  bus.on('weapons:inertialShunt', (payload) => { receipt = payload; });
  const closing = preSolveRadialClosingSpeed(player.vel.x, 0, 0, 0, 1, 0);
  bus.emit('physics:impact', headOnImpact(state, player, heavy, closing));
  const playerKick = applyQueuedDeltaV(player);
  const heavyKick = applyQueuedDeltaV(heavy);
  assert.ok(receipt);
  assert.ok(heavyKick.deltaV < 20, `heavy shrugs, got ${heavyKick.deltaV.toFixed(3)}`);
  assert.ok(playerKick.deltaV < governedCruise(HITCH) * 0.4, 'player keeps speed against a heavy');
});

test('PQ-026.02 live hook ignores a scrape under the closing floor', () => {
  const player = hull(1, HORNET, 95, [INERTIAL_SHUNT_WEAPON_ID]);
  const scrape = hull(3, WASP, 90);
  scrape.pos.x = HORNET.collisionRadius + WASP.collisionRadius;
  const state = combatState(player, scrape);
  const { bus } = armWeapons(state);
  let receipt = null;
  bus.on('weapons:inertialShunt', (payload) => { receipt = payload; });
  bus.emit('physics:impact', headOnImpact(state, player, scrape, 5));
  assert.equal(receipt, null, 'a scrape must not emit weapons:inertialShunt');
  assert.equal(consumePhysicsCommand(player), null);
  assert.equal(consumePhysicsCommand(scrape), null);
});

test('PQ-026.02 shunt VFX plan is a transfer streak, not a camera-facing card', () => {
  const plan = createInertialShuntVfxPlanScratch();
  resolveInertialShuntVfxPlan(plan, {
    position: { x: 28, z: 0 },
    axisX: 1,
    axisZ: 0,
    targetDeltaV: 106.875,
    radius: 14,
    playerCaused: true,
  });
  assert.equal(plan.active, true);
  assert.ok(plan.length > plan.width * 8, 'the streak is a line along the dump, not a blob');
  near(plan.axisX, 1, 'axis follows the transfer');
  assert.equal(plan.particleCount, 3);
  resolveInertialShuntVfxPlan(plan, {
    position: { x: 28, z: 0 },
    axisX: 1,
    axisZ: 0,
    targetDeltaV: 106.875,
    motionReduce: true,
  });
  assert.equal(plan.active, true);
  assert.equal(plan.particleCount, 0);
  assert.ok(plan.length < 20);
});
