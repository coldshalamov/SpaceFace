// Deterministic Arcade Core pacing route.
//
// This is deliberately a game-loop measurement, not a DPS spreadsheet. The contact arm enters a
// real Ceres island through encounterDirector. The combat arm drives the shipped starter ship with
// tick-indexed player inputs while the production weapon, physics, combat, reward, pickup, cargo,
// economy, flight, and Tactical AI owners run in their production-relative order.

import { createGameState } from '../../core/gameState.js';
import { wrapAngle } from '../../core/rng.js';
import { createSimulation, SIM_DT } from '../../core/sim.js';
import { physics } from '../../core/physics.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../../data/featureFlags.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { zonesForSector } from '../../data/sectorZones.js';
import { PRODUCTION_FEATURES } from '../../runtime/runtimeProfiles.js';
import { aiPorts } from '../../systems/aiPorts.js';
import { cargo } from '../../systems/cargo.js';
import { combat, makeEnemySpawnSpec } from '../../systems/combat.js';
import { economy } from '../../systems/economy.js';
import {
  ARCADE_ISLAND_CONTACT_SHAPE_ID,
  encounterDirector,
} from '../../systems/encounterDirector.js';
import { flightV3 } from '../../systems/flightV3.js';
import { lootShards } from '../../systems/lootShards.js';
import { mining } from '../../systems/mining.js';
import { spawnBudget } from '../../systems/spawnBudget.js';
import {
  fittingsFromDefaultModules,
  makeShipEntitySpec,
} from '../../systems/ships.js';
import { createTacticalAISystem } from '../../systems/tacticalAI.js';
import { solveLeadAngle, weapons } from '../../systems/weapons.js';

export const ARCADE_CORE_PACING_ROUTE_SCHEMA = 'spaceface.arcadeCore.pacingRoute.v1';
export const ARCADE_CORE_PACING_SEEDS = Object.freeze([0xac0901, 0xac0902, 0xac0903]);

const CERES_SECTOR_ID = 'sector_ceres_belt';
const CERES_ZONE_ID = 'zone_ceres_belt';
const START_DELAY_S = 1.5;
const WING_GAP_S = 1.0;
const ROUTE_LIMIT_S = 240;
const WING_COUNT = 3;
const HOSTILES_PER_WING = 3;
const SENSOR_RANGE_WU = 900;
const COLLECT_SETTLE_S = 1.25;

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function liveEntity(state, id) {
  const entity = state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

function nearestEntity(state, player, predicate) {
  let found = null;
  let foundDistance = Infinity;
  for (const entity of state.entityList) {
    if (!entity || entity.alive === false || !predicate(entity)) continue;
    const distance = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
    if (distance < foundDistance || (distance === foundDistance && entity.id < found.id)) {
      found = entity;
      foundDistance = distance;
    }
  }
  return found ? { entity: found, distance: foundDistance } : null;
}

function playerSpec(pos) {
  return makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos,
    rot: 0,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
  });
}

function productionState(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world.currentSectorId = CERES_SECTOR_ID;
  state.runtime = Object.freeze({
    profileId: 'production',
    features: PRODUCTION_FEATURES,
    evidenceClass: 'focused-explicit',
    exclusions: Object.freeze(['production-manifest-claim', 'renderer']),
  });
  return state;
}

function contactSystems() {
  const tacticalAI = createTacticalAISystem();
  const systems = [
    tacticalAI,
    physics,
    aiPorts,
    flightV3,
    weapons,
    combat,
    spawnBudget,
    encounterDirector,
  ];
  const updateOrder = [
    tacticalAI,
    flightV3,
    aiPorts,
    weapons,
    physics,
    combat,
    spawnBudget,
    encounterDirector,
  ];
  return { systems, updateOrder };
}

/** Measure real encounter admission and first hostile fire after entering the canonical island. */
export async function runArcadeIslandContactRoute(seed) {
  const state = productionState(seed);
  const { systems, updateOrder } = contactSystems();
  const sim = createSimulation({ seed, state, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  if (!await physicsSystem.prepareBackend(state, { reset: true })) {
    throw new Error('Arcade island contact route could not initialize rapier-dynamic physics');
  }
  const zone = zonesForSector(CERES_SECTOR_ID).find((candidate) => candidate.id === CERES_ZONE_ID);
  if (!zone) throw new Error(`Missing pacing fixture zone: ${CERES_ZONE_ID}`);
  const center = sectorLocalToGlobalForSector(zone.center, CERES_SECTOR_ID);
  const player = sim.spawn(playerSpec({ x: center.x - Math.min(200, zone.radius * 0.25), z: center.z }));
  state.playerId = player.id;

  let admittedAtS = null;
  let firstHostileFireAtS = null;
  let admittedCount = 0;
  sim.bus.on('encounter:spawned', (payload) => {
    if (payload?.kind !== ARCADE_ISLAND_CONTACT_SHAPE_ID) return;
    if (admittedAtS == null) admittedAtS = state.simTime;
    admittedCount += 1;
  });
  sim.bus.on('combat:fire', (payload) => {
    if (payload?.ownerId === state.playerId || firstHostileFireAtS != null) return;
    const owner = liveEntity(state, payload?.ownerId);
    if (owner?.team === 1) firstHostileFireAtS = state.simTime;
  });

  sim.bus.emit('sector:enter', { sectorId: CERES_SECTOR_ID });
  sim.bus.emit('world:zoneEntered', { sectorId: CERES_SECTOR_ID, zoneId: CERES_ZONE_ID });
  const maxTicks = Math.ceil(20 / SIM_DT);
  for (let tick = 0; tick < maxTicks && firstHostileFireAtS == null; tick++) sim.step(SIM_DT);

  const receipt = {
    seed: seed >>> 0,
    zoneId: CERES_ZONE_ID,
    shapeId: ARCADE_ISLAND_CONTACT_SHAPE_ID,
    timeToFirstContactS: admittedAtS == null ? null : round(admittedAtS),
    timeToFirstHostileFireS: firstHostileFireAtS == null ? null : round(firstHostileFireAtS),
    admittedCount,
    usedNormalZoneEntry: true,
    systemIds: sim.evidenceClassification.systemIds,
  };
  state.settings.gameplay.physicsBackend = 'custom';
  await physicsSystem.prepareBackend(state, { reset: true });
  sim.dispose();
  return receipt;
}

function combatSystems() {
  const tacticalAI = createTacticalAISystem();
  const systems = [
    tacticalAI,
    physics,
    aiPorts,
    flightV3,
    weapons,
    combat,
    lootShards,
    mining,
    cargo,
    economy,
  ];
  const updateOrder = [
    tacticalAI,
    flightV3,
    aiPorts,
    weapons,
    physics,
    combat,
    lootShards,
    mining,
    cargo,
    economy,
  ];
  return { systems, updateOrder };
}

function spawnWing(sim, wingIndex, player) {
  const ids = [];
  const phase = wingIndex * 0.73;
  for (let index = 0; index < HOSTILES_PER_WING; index++) {
    const angle = phase + index * (Math.PI * 2 / HOSTILES_PER_WING);
    const radius = 155 + index * 12;
    const enemyTypeId = 'wasp_swarmer';
    const spec = makeEnemySpawnSpec(enemyTypeId, 1, {
      x: player.pos.x + Math.cos(angle) * radius,
      z: player.pos.z + Math.sin(angle) * radius,
    }, {
      zoneId: CERES_ZONE_ID,
      startedTick: sim.state.tick,
      motive: 'arcade_pacing_route',
      engagementTrigger: 'scripted_wing_contact',
      noFireResponseWindowS: 1,
    });
    spec.data.worldRecordId = `ac09:${sim.state.meta.seed}:wing:${wingIndex + 1}:hostile:${index + 1}`;
    spec.data.pacingRouteWing = wingIndex + 1;
    spec.data.encounter = true;
    spec.data.ai = {
      ...spec.data.ai,
      forcePlayerTarget: true,
      activity: {
        ...spec.data.ai.activity,
        anchor: { x: player.pos.x, z: player.pos.z },
        leashRadius: 520,
      },
    };
    spec.data.combat = {
      ...spec.data.combat,
      targetId: player.id,
      lockTarget: player.id,
    };
    ids.push(sim.spawn(spec).id);
  }
  sim.bus.emit('arcade:pacingWingSpawned', {
    wing: wingIndex + 1,
    ids: ids.slice(),
    atS: sim.state.simTime,
  });
  return ids;
}

function driveCompetentBot(state, player, inputReceipt, botState) {
  const locked = liveEntity(state, botState.targetId);
  const lockedHostile = locked && (locked.type === 'ship' || locked.type === 'drone') && locked.team === 1
    ? locked
    : null;
  let hostile = null;
  if (lockedHostile) {
    hostile = {
      entity: lockedHostile,
      distance: Math.hypot(lockedHostile.pos.x - player.pos.x, lockedHostile.pos.z - player.pos.z),
    };
  } else {
    hostile = nearestEntity(state, player, (entity) => (
      (entity.type === 'ship' || entity.type === 'drone') && entity.team === 1
    ));
    botState.targetId = hostile?.entity.id ?? null;
  }
  const pickup = hostile ? null : nearestEntity(state, player, (entity) => entity.type === 'pickup');
  const target = hostile || pickup;
  const input = state.input;
  input.fire = false;
  input.moveX = 0;
  input.moveZ = 0;
  input.turnIntent = 0;
  input.boost = false;
  input.brake = false;
  input.actions ||= {};
  input.actions.brake = false;
  if (!target) return;

  const dx = target.entity.pos.x - player.pos.x;
  const dz = target.entity.pos.z - player.pos.z;
  const directBearing = Math.atan2(dz, dx);
  const bearing = hostile
    ? solveLeadAngle(player, hostile.entity, player.data?.weapons?.[0]?.projSpeed || 320)
    : directBearing;
  const turnError = wrapAngle(bearing - player.rot);
  input.aimAngle = bearing;
  input.aimWorld = { x: target.entity.pos.x, z: target.entity.pos.z };
  input.turnIntent = clamp(turnError / 0.42, -1, 1);

  if (hostile) {
    input.moveZ = hostile.distance > 210 ? 1 : hostile.distance < 85 ? -0.28 : 0.08;
    input.moveX = hostile.distance < 230 ? (target.entity.id % 2 === 0 ? 0.22 : -0.22) : 0;
    input.boost = hostile.distance > 280 && Math.abs(turnError) < 0.45;
    input.fire = hostile.distance <= 720 && Math.abs(turnError) <= 0.34;
    if (input.fire) inputReceipt.fireHeldTicks += 1;
  } else {
    input.moveZ = pickup.distance > 24 ? 0.62 : 0;
    input.brake = pickup.distance <= 24;
    input.actions.brake = input.brake;
    inputReceipt.pickupPursuitTicks += 1;
  }
  if (Math.abs(input.turnIntent) > 0.01 || Math.abs(input.moveZ) > 0.01 || Math.abs(input.moveX) > 0.01) {
    inputReceipt.steeringTicks += 1;
  }
}

/** Run three successive physical wings against a tick-scripted starter pilot. */
export async function runScriptedCompetentBotRoute(seed) {
  const state = productionState(seed);
  const { systems, updateOrder } = combatSystems();
  const sim = createSimulation({ seed, state, systems, updateOrder });
  const physicsSystem = sim.registry.get('physics');
  if (!await physicsSystem.prepareBackend(state, { reset: true })) {
    throw new Error('Scripted competent-bot route could not initialize rapier-dynamic physics');
  }
  const player = sim.spawn(playerSpec({ x: 0, z: 0 }));
  state.playerId = player.id;
  state.player.credits = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 400 };
  sim.registry.get('economy').newGame();

  const routeEvents = [];
  const killEvents = [];
  const creditEvents = [];
  const inputReceipt = { fireHeldTicks: 0, steeringTicks: 0, pickupPursuitTicks: 0 };
  const botState = { targetId: null };
  let playerDeaths = 0;
  let projectileFires = 0;
  let projectileHits = 0;
  let hostileProjectileFires = 0;
  let hostileHitsOnPlayer = 0;
  let firstSensedContactAtS = null;
  let firstWingAtS = null;
  let lastKillAtS = null;
  sim.bus.on('arcade:pacingWingSpawned', (payload) => routeEvents.push({ ...payload }));
  sim.bus.on('entity:killed', (payload) => {
    if (payload?.killerId !== state.playerId || payload?.id === state.playerId) return;
    const victim = state.entities.get(payload.id);
    killEvents.push({
      id: payload.id,
      wing: victim?.data?.pacingRouteWing ?? null,
      actorKey: victim?.data?.worldRecordId ?? null,
      atS: round(state.simTime),
    });
    lastKillAtS = state.simTime;
  });
  sim.bus.on('credits:changed', (payload) => {
    if ((payload?.delta || 0) > 0) creditEvents.push({ ...payload, atS: round(state.simTime) });
  });
  sim.bus.on('player:death', () => { playerDeaths += 1; });
  sim.bus.on('combat:fire', (payload) => {
    if (payload?.ownerId === state.playerId) projectileFires += 1;
    else if (liveEntity(state, payload?.ownerId)?.team === 1) hostileProjectileFires += 1;
  });
  sim.bus.on('projectile:hit', (payload) => {
    const projectile = state.entities.get(payload?.projectileId);
    const ownerId = payload?.ownerId ?? projectile?.data?.ownerId ?? projectile?.ownerId;
    if (ownerId === state.playerId) projectileHits += 1;
    else if (payload?.targetId === state.playerId && liveEntity(state, ownerId)?.team === 1) {
      hostileHitsOnPlayer += 1;
    }
  });

  let wingIndex = 0;
  let activeWingIds = [];
  let nextWingAtS = START_DELAY_S;
  let allClearAtS = null;
  const maxTicks = Math.ceil(ROUTE_LIMIT_S / SIM_DT);

  for (let tick = 0; tick < maxTicks; tick++) {
    const currentPlayer = liveEntity(state, state.playerId) || player;
    const activeAlive = activeWingIds.some((id) => {
      const entity = liveEntity(state, id);
      return !!entity && (entity.type === 'ship' || entity.type === 'drone') && entity.team === 1;
    });
    const livePickups = state.entityList.some((entity) => entity?.alive !== false && entity.type === 'pickup');

    if (!activeAlive && wingIndex < WING_COUNT && state.simTime + 1e-9 >= nextWingAtS) {
      activeWingIds = spawnWing(sim, wingIndex, currentPlayer);
      if (firstWingAtS == null) firstWingAtS = state.simTime;
      wingIndex += 1;
      allClearAtS = null;
    } else if (!activeAlive && activeWingIds.length && wingIndex < WING_COUNT && !livePickups) {
      nextWingAtS = Math.max(nextWingAtS, state.simTime + WING_GAP_S);
      activeWingIds = [];
    }

    const sensed = nearestEntity(state, currentPlayer, (entity) => (
      (entity.type === 'ship' || entity.type === 'drone') && entity.team === 1
    ));
    if (firstSensedContactAtS == null && sensed && sensed.distance <= SENSOR_RANGE_WU) {
      firstSensedContactAtS = state.simTime;
    }

    driveCompetentBot(state, currentPlayer, inputReceipt, botState);
    sim.step(SIM_DT);

    const expectedKills = WING_COUNT * HOSTILES_PER_WING;
    const noHostiles = !state.entityList.some((entity) => (
      entity?.alive !== false && (entity.type === 'ship' || entity.type === 'drone') && entity.team === 1
    ));
    const noPickups = !state.entityList.some((entity) => entity?.alive !== false && entity.type === 'pickup');
    if (wingIndex === WING_COUNT && killEvents.length === expectedKills && noHostiles && noPickups) {
      allClearAtS ??= state.simTime;
      if (state.simTime - allClearAtS >= COLLECT_SETTLE_S) break;
    } else {
      allClearAtS = null;
    }
  }

  state.input.fire = false;
  const elapsedS = Math.max(SIM_DT, (allClearAtS ?? state.simTime) - (firstSensedContactAtS ?? firstWingAtS ?? 0));
  const elapsedMin = elapsedS / 60;
  const credits = state.player.credits;
  const physicalCreditChipEvents = creditEvents.filter((event) => (
    String(event.reason || '').startsWith('kill:credit_chip:')
  ));
  const remainingPickups = state.entityList.filter((entity) => entity?.alive !== false && entity.type === 'pickup');
  const remainingHostiles = state.entityList.filter((entity) => (
    entity?.alive !== false && (entity.type === 'ship' || entity.type === 'drone') && entity.team === 1
  ));
  const completedWings = Array.from({ length: WING_COUNT }, (_, index) => index + 1)
    .filter((wing) => killEvents.filter((kill) => kill.wing === wing).length === HOSTILES_PER_WING)
    .length;
  const survived = playerDeaths === 0 && player.alive !== false;
  const receipt = {
    seed: seed >>> 0,
    wingCount: routeEvents.length,
    completedWings,
    hostilesPerWing: HOSTILES_PER_WING,
    kills: killEvents.length,
    credits,
    elapsedS: round(elapsedS),
    firstSensedContactS: firstSensedContactAtS == null ? null : round(firstSensedContactAtS),
    lastKillS: lastKillAtS == null ? null : round(lastKillAtS),
    killsPerMinute: round(killEvents.length / elapsedMin),
    creditsPerMinute: round(credits / elapsedMin),
    survived,
    playerDeaths,
    endingHull: round(player.hull),
    endingShield: round(player.shield),
    routeEvents,
    killEvents,
    creditEvents,
    physicalCreditChipCollections: physicalCreditChipEvents.length,
    physicalCreditChipCredits: physicalCreditChipEvents.reduce((sum, event) => sum + event.delta, 0),
    uncollectedPickupCount: remainingPickups.length,
    nearestUncollectedPickupDistance: remainingPickups.length
      ? round(Math.min(...remainingPickups.map((entity) => Math.hypot(
        entity.pos.x - player.pos.x,
        entity.pos.z - player.pos.z,
      ))))
      : null,
    remainingHostiles: remainingHostiles.map((entity) => ({
      actorKey: entity.data?.worldRecordId ?? null,
      hull: round(entity.hull),
      armor: round(entity.armorHp),
      shield: round(entity.shield),
      distance: round(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)),
    })),
    inputReceipt,
    projectileFires,
    projectileHits,
    hostileProjectileFires,
    hostileHitsOnPlayer,
    usedProductionOwners: true,
    systemIds: sim.evidenceClassification.systemIds,
  };
  state.settings.gameplay.physicsBackend = 'custom';
  await physicsSystem.prepareBackend(state, { reset: true });
  sim.dispose();
  return receipt;
}

/**
 * Run the complete pacing metric over fixed deterministic seeds. Feature-map changes mirror the
 * production boot and are restored even when a route fails, keeping adjacent tests isolated.
 */
export async function measureArcadeCorePacingRoute(options = {}) {
  const seeds = Array.isArray(options.seeds) && options.seeds.length
    ? options.seeds.map((seed) => Number(seed) >>> 0)
    : [...ARCADE_CORE_PACING_SEEDS];
  const priorFeatures = snapshotFeatureMaps();
  try {
    applyFeatureConfigToMaps(PRODUCTION_FEATURES);
    const cells = [];
    for (const seed of seeds) {
      cells.push({
        seed,
        contact: await runArcadeIslandContactRoute(seed),
        bot: await runScriptedCompetentBotRoute(seed),
      });
    }
    const botElapsedMin = cells.reduce((sum, cell) => sum + cell.bot.elapsedS / 60, 0);
    const totalKills = cells.reduce((sum, cell) => sum + cell.bot.kills, 0);
    const totalCredits = cells.reduce((sum, cell) => sum + cell.bot.credits, 0);
    const contactTimes = cells.map((cell) => cell.contact.timeToFirstContactS);
    return {
      schema: ARCADE_CORE_PACING_ROUTE_SCHEMA,
      seeds,
      timeToFirstContactS: contactTimes.every(Number.isFinite)
        ? round(contactTimes.reduce((sum, value) => sum + value, 0) / contactTimes.length)
        : null,
      killsPerMinute: round(totalKills / Math.max(botElapsedMin, SIM_DT / 60)),
      creditsPerMinute: round(totalCredits / Math.max(botElapsedMin, SIM_DT / 60)),
      survivalRate: round(cells.filter((cell) => cell.bot.survived).length / cells.length),
      wingsCompleted: cells.reduce((sum, cell) => sum + cell.bot.completedWings, 0),
      cells,
    };
  } finally {
    restoreFeatureMaps(priorFeatures);
  }
}
