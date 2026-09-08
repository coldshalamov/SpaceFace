// PQ-141.00 — deterministic 60-second proof instrument (B12).
//
// This module is an INSTRUMENT. It boots the shipping Node-safe production runtime on the Ceres
// proof pocket set (Refinery + Ambush Run), plays a short player input tape of already-wired verbs
// (boost, fire, Massline), and detects the eleven VISION / FEEL B12 beats from bus receipts that
// already exist.
//
// Census/boot/camera look at authored pockets. The default 60s run boots at Ambush Run so
// intercept/spill/patrol can fire; Refinery and Seam job receipts stay on the sector bus.
// It does not script NPC combat, emit beat events, or loosen a miss into "any collision".
// A red table is a valid reading.

import { SIM_DT } from '../../core/sim.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../../data/featureFlags.js';
import {
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
} from '../../data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { THRESHOLD as WANTED_THRESHOLD } from '../../systems/heat.js';
import { makeShipEntitySpec } from '../../systems/ships.js';
import { stuntGrammar } from '../../systems/stuntGrammar.js';
import { createAuthoritativeRuntime } from '../../runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../../runtime/nodeSystemFactoryTable.js';
import { createInputTapeDriver } from './inputTape.js';

export const PROOF_SCENARIO_ID = 'proof.sixty_seconds';
export const PROOF_SECTOR_ID = CERES_ACTIVITY_SECTOR_ID;
export const PROOF_SEEDS = Object.freeze([47, 4242, 8008, 1337, 2026]);
export const PROOF_WINDOW_S = 60;
export const PROOF_HARD_CAP_S = 90;
export const PROOF_REQUIRED_BEATS = 9;
export const PROOF_PLAYER_HULL_ID = 'ship_hornet';
export const PROOF_SHOVE_WEAPON_ID = 'wpn_concussion_cannon_m';
export const PROOF_REFINERY_POCKET_ID = CERES_REFERENCE_ACCEPTANCE_ENTRY.pocketId;
export const PROOF_AMBUSH_POCKET_ID = 'ceres_ambush_run';
/** Default 60s tape boot. Census still covers the Refinery + Ambush pocket set. */
export const PROOF_SIXTY_SECONDS_BOOT_POCKET_ID = PROOF_AMBUSH_POCKET_ID;
export const PROOF_POCKET_IDS = Object.freeze([
  PROOF_REFINERY_POCKET_ID,
  PROOF_AMBUSH_POCKET_ID,
]);
export const PROOF_CENSUS_SETTLE_TICKS = 120;

const TICKS_PER_S = 60;
const HARD_CAP_TICKS = PROOF_HARD_CAP_S * TICKS_PER_S;
const WINDOW_TICKS = PROOF_WINDOW_S * TICKS_PER_S;
const POCKET_RADIUS_WU = 750;
const PROJECTILE_SPEED_WU = 50;
const COLLATERAL_DELTA_V = 8;
const INTERCEPT_RADIUS_WU = 300;

const HAULER_ROLES = new Set(['hauler', 'ore_carrier', 'freighter', 'courier']);
const WORK_ROLES = new Set(['miner', 'ore_carrier', 'tender']);
const PIRATE_ROLES = new Set(['pirate', 'raider', 'scavenger']);
const PATROL_ROLES = new Set(['patrol', 'escort']);
const FLEE_EVENTS = new Set(['ai:flee', 'npcjobs:truncated']);

/** The eleven B12 beats, in VISION order. Receipt names are the shipping bus events. */
export const SIXTY_SECOND_BEATS = Object.freeze([
  Object.freeze({
    id: 'op_working',
    label: 'op working',
    owner: 'PQ-045 / PQ-143',
    receipts: Object.freeze(['traffic:jobActionReceipt', 'npcjobs:work', 'mining:npcExtraction']),
    vision: 'A brightly painted mining operation is working around several asteroids.',
  }),
  Object.freeze({
    id: 'hauler_leaves',
    label: 'hauler leaves',
    owner: 'PQ-045 / PQ-143',
    receipts: Object.freeze(['npcjobs:depart', 'npcjobs:transit', 'npcjobs:load', 'traffic:jobActionReceipt']),
    vision: 'A freighter leaves.',
  }),
  Object.freeze({
    id: 'pirates_intercept',
    label: 'pirates intercept',
    owner: 'PQ-045 (ambush / encounterDirector)',
    receipts: Object.freeze([
      'combat:fire', 'combat:damage', 'encounter:spawned', 'encounter:telegraph',
      'interdiction:triggered', 'pirateParley:started',
    ]),
    vision: 'Pirates intercept it.',
  }),
  Object.freeze({
    id: 'shove_spins_one',
    label: 'shove spins one',
    owner: 'PQ-137.04 / PQ-137.05',
    receipts: Object.freeze(['combat:tumbled']),
    vision: 'One pirate takes an impulse hit and spins violently off course.',
  }),
  Object.freeze({
    id: 'rope_projectile',
    label: 'rope-swing-release projectile',
    owner: 'PQ-137.07',
    receipts: Object.freeze(['massline:throw', 'tether:released', 'massline:releaseValidated']),
    vision: 'The player Masslines another, swings, and releases. The pirate becomes a projectile.',
  }),
  Object.freeze({
    id: 'collateral',
    label: 'collateral',
    owner: 'PQ-137.09 / PQ-140',
    receipts: Object.freeze(['combat:collisionConsequence']),
    vision: 'It tears through another ship.',
  }),
  Object.freeze({
    id: 'cargo_spills',
    label: 'cargo spills',
    owner: 'PQ-138.01',
    receipts: Object.freeze(['freight:cargoSpilled', 'cargo:jettisoned']),
    vision: 'Loose cargo spills everywhere.',
  }),
  Object.freeze({
    id: 'hauler_flees',
    label: 'hauler flees',
    owner: 'PQ-138.02',
    receipts: Object.freeze(['ai:flee', 'npcjobs:truncated']),
    vision: 'The civilian freighter starts fleeing.',
  }),
  Object.freeze({
    id: 'patrol_arrives',
    label: 'patrol arrives',
    owner: 'PQ-138.00',
    receipts: Object.freeze(['law:dispatchStarted', 'law:incidentOpened', 'law:distressRaised']),
    vision: 'A patrol enters from offscreen because somebody witnessed the disaster.',
  }),
  Object.freeze({
    id: 'grab_pod',
    label: 'grab pod',
    owner: 'mining / massline (pickup:collected, tether:latched)',
    receipts: Object.freeze(['pickup:collected', 'tether:latched']),
    vision: 'The player grabs one valuable cargo pod with the Massline.',
  }),
  Object.freeze({
    id: 'run_wanted',
    label: 'run WANTED',
    owner: 'heat / PQ-138',
    receipts: Object.freeze(['heat:changed']),
    vision: '…and accelerates away while WANTED.',
  }),
]);

const WATCHED_EVENTS = Object.freeze([
  ...new Set(SIXTY_SECOND_BEATS.flatMap((beat) => beat.receipts)),
  'tether:latched',
  'massline:tumbled',
]);

function finite(n, fallback = 0) {
  return Number.isFinite(Number(n)) ? Number(n) : fallback;
}

function dist(a, b) {
  return Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
}

function speedOf(entity) {
  return Math.hypot(finite(entity && entity.vel && entity.vel.x), finite(entity && entity.vel && entity.vel.z));
}

function live(state) {
  return (state.entityList || []).filter((e) => e && e.alive !== false);
}

function roleOf(entity) {
  const data = entity && entity.data;
  return String((data && (data.trafficRole || data.role || data.jobKind)) || '').toLowerCase();
}

function slotOf(entity) {
  return String((entity && entity.data && entity.data.activityActorSlotId) || '');
}

export function isHaulerEntity(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const role = roleOf(entity);
  const slot = slotOf(entity);
  return HAULER_ROLES.has(role)
    || slot === 'ceres_refinery_hauler'
    || slot.includes('hauler');
}

export function isWorkEntity(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const role = roleOf(entity);
  const slot = slotOf(entity);
  return WORK_ROLES.has(role)
    || slot === 'ceres_seam_miner'
    || slot.includes('miner')
    || slot.includes('tender');
}

export function isPirateEntity(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  const role = roleOf(entity);
  const faction = String(entity.factionId || data.factionId || '');
  return PIRATE_ROLES.has(role)
    || ai.pirate === true
    || ai.hostile === true
    || String(ai.spawnContext || '').includes('ambush')
    || String(ai.zoneId || '').includes('ambush')
    || faction === 'faction_reach';
}

export function isPatrolEntity(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const ai = (entity.data && entity.data.ai) || {};
  const role = roleOf(entity);
  return PATROL_ROLES.has(role) || ai.lawful === true;
}

export function isCargoPickup(entity, payload) {
  const data = (entity && entity.data) || payload || {};
  const kind = String(data.kind || payload && payload.kind || '');
  return kind === 'cargo'
    || !!(data.freightCustodyPod)
    || String(data.commodityId || payload && payload.commodityId || '').startsWith('cmdty_');
}

/** Spilled pods are type:'payload' via spawnJettisonedCargoPod; pickups still count. */
export function isGrabCargoTarget(entity, payload) {
  if (!entity && !payload) return false;
  const type = entity && entity.type;
  if (type && type !== 'pickup' && type !== 'payload') return false;
  return isCargoPickup(entity, payload);
}

function entityById(state, id) {
  if (id == null || !state || !state.entities) return null;
  return state.entities.get(id) || null;
}

function withFeatures(runtime, fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

function realPathProof(runtime) {
  const physicsSys = runtime && typeof runtime.getSystem === 'function'
    ? runtime.getSystem('physics') : null;
  const diag = (physicsSys && physicsSys._diag) || {};
  const gameplay = (runtime && runtime.state && runtime.state.settings
    && runtime.state.settings.gameplay) || {};
  return {
    backend: String(diag.backend || 'none'),
    sg02Ready: diag.sg02Ready === true,
    sg02Bodies: Number.isFinite(diag.sg02Bodies) ? diag.sg02Bodies : 0,
    contactCaptureEnabled: !!(physicsSys && physicsSys._sg02 && physicsSys._sg02.captureContactImpacts),
    physicsBackend: String(gameplay.physicsBackend || 'none'),
    flightBackend: String(gameplay.flightBackend || 'none'),
    aiBackend: String(gameplay.aiBackend || 'none'),
    profileId: String((runtime && runtime.config && runtime.config.profileId) || 'unknown'),
  };
}

export function pocketAnchorGlobal(pocketId) {
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID[pocketId];
  if (!pocket || !pocket.activityAnchor || !pocket.activityAnchor.localPos) {
    throw new Error(`proof.sixty_seconds: pocket "${pocketId}" has no activity anchor`);
  }
  return sectorLocalToGlobalForSector(pocket.activityAnchor.localPos, CERES_ACTIVITY_SECTOR_ID);
}

export function pocketEntryGlobal(pocketId = PROOF_REFINERY_POCKET_ID) {
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID[pocketId];
  if (!pocket || !pocket.activityAnchor || !pocket.activityAnchor.localPos) {
    throw new Error(`proof.sixty_seconds: pocket "${pocketId}" has no activity anchor`);
  }
  const offset = pocketId === CERES_REFERENCE_ACCEPTANCE_ENTRY.pocketId
    ? (CERES_REFERENCE_ACCEPTANCE_ENTRY.entryOffset || { x: 0, z: 0 })
    : { x: 0, z: 0 };
  const local = {
    x: finite(pocket.activityAnchor.localPos.x) + finite(offset.x),
    z: finite(pocket.activityAnchor.localPos.z) + finite(offset.z),
  };
  return sectorLocalToGlobalForSector(local, CERES_ACTIVITY_SECTOR_ID);
}

/**
 * Static keyboard tape of a few simple verbs. Aim is applied live; this tape never writes NPC
 * intent, never emits beat events, and never teleports anyone.
 */
export function buildProofInputTape() {
  const events = [];
  const press = (tick, code, pressed) => {
    events.push({ tick: tick | 0, device: 'keyboard', code, pressed: !!pressed });
  };
  press(0, 'KeyW', true);

  press(180, 'ShiftLeft', true);
  press(480, 'ShiftLeft', false);

  // Spill is at ~1.5 s. Hold the Massline on the pod while still in the killbox;
  // the 40 s grab window used to aim at cargo with KeyJ already released.
  press(200, 'KeyJ', true);
  press(900, 'KeyJ', false);

  press(900, 'KeyF', true);
  press(960, 'KeyA', true);
  press(1500, 'KeyA', false);
  press(1500, 'KeyF', false);

  press(1680, 'KeyJ', true);
  press(2400, 'KeyJ', false);
  press(2420, 'KeyJ', true);
  press(3000, 'KeyJ', false);

  press(2400, 'KeyF', true);
  press(3000, 'KeyF', false);

  press(3000, 'ShiftLeft', true);
  press(3600, 'ShiftLeft', false);

  press(3720, 'KeyJ', true);
  press(4200, 'KeyJ', false);
  press(4320, 'KeyF', true);
  press(4800, 'KeyF', false);
  press(5400, 'KeyW', false);
  return { events, frames: [] };
}

function nearest(state, player, predicate) {
  let best = null;
  let bestD = Infinity;
  for (const entity of live(state)) {
    if (!entity || entity === player || entity.id === state.playerId) continue;
    if (!predicate(entity)) continue;
    const d = dist(player.pos, entity.pos);
    if (d < bestD) {
      best = entity;
      bestD = d;
    }
  }
  return best;
}

export function aimTargetForTick(state, player, tick) {
  if ((tick >= 200 && tick < 480) || (tick >= 2400 && tick < 3000)) {
    return nearest(state, player, (e) => isGrabCargoTarget(e))
      || nearest(state, player, (e) => e.type === 'pickup' || e.type === 'payload');
  }
  if (tick >= 900 && tick < 1500) {
    return nearest(state, player, isPirateEntity)
      || nearest(state, player, (e) => e.type === 'asteroid')
      || nearest(state, player, (e) => e.type === 'ship' && e.id !== state.playerId);
  }
  if ((tick >= 480 && tick < 900) || (tick >= 1680 && tick < 2400) || (tick >= 3720 && tick < 4200)) {
    return nearest(state, player, isPirateEntity)
      || nearest(state, player, (e) => e.type === 'ship' && e.team === 1)
      || nearest(state, player, (e) => e.type === 'ship' && e.id !== state.playerId);
  }
  return nearest(state, player, isHaulerEntity)
    || nearest(state, player, isPirateEntity)
    || nearest(state, player, (e) => e.type === 'ship' && e.id !== state.playerId);
}

function pointAt(state, player, target) {
  if (!target || !target.pos || !player || !player.pos) return;
  const dx = finite(target.pos.x) - finite(player.pos.x);
  const dz = finite(target.pos.z) - finite(player.pos.z);
  const angle = Math.atan2(dz, dx);
  state.input = state.input || {};
  state.input.aimAngle = angle;
  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
}

function emptyCensus() {
  return { ships: 0, workers: 0, haulers: 0, pirates: 0, patrols: 0, cargoPods: 0 };
}

export function censusAround(state, origin) {
  const here = live(state).filter((e) => dist(e.pos, origin) <= POCKET_RADIUS_WU);
  return {
    ships: here.filter((e) => e.type === 'ship').length,
    workers: here.filter(isWorkEntity).length,
    haulers: here.filter(isHaulerEntity).length,
    pirates: here.filter(isPirateEntity).length,
    patrols: here.filter(isPatrolEntity).length,
    cargoPods: here.filter((e) => isGrabCargoTarget(e)).length,
  };
}

function addCensus(into, part) {
  into.ships += part.ships;
  into.workers += part.workers;
  into.haulers += part.haulers;
  into.pirates += part.pirates;
  into.patrols += part.patrols;
  into.cargoPods += part.cargoPods;
  return into;
}

export function censusProofPocket(state, pocketId) {
  return censusAround(state, pocketAnchorGlobal(pocketId));
}

export function censusProofPockets(state, pocketIds = PROOF_POCKET_IDS) {
  const byPocket = {};
  const combined = emptyCensus();
  for (const pocketId of pocketIds) {
    const row = censusProofPocket(state, pocketId);
    byPocket[pocketId] = row;
    addCensus(combined, row);
  }
  return { ...combined, byPocket };
}

function censusPocket(state, player) {
  return censusAround(state, player && player.pos);
}

function jobKindOf(payload) {
  return String((payload && (payload.jobKind || payload.kind)) || '').toLowerCase();
}

function jobActionOf(payload) {
  return String((payload && (payload.action || payload.event)) || '').toLowerCase();
}

/**
 * Classify one shipping receipt into at most one beat. Collateral is not "any collision":
 * the spun / thrown hull must be in the pair, ΔV must be shove-scale, and the player hull
 * must not be the only other body.
 */
export function classifyReceipt(name, payload, ctx) {
  const state = ctx.state;
  const playerId = state.playerId;
  const entity = (id) => entityById(state, id);

  if (name === 'traffic:jobActionReceipt') {
    const action = jobActionOf(payload);
    const slot = String((payload && payload.actorSlotId) || '');
    const kind = jobKindOf(payload);
    const effect = String((payload && payload.effectType) || '');
    const miningOp = effect === 'mining:npcExtraction'
      || kind === 'miner'
      || slot === 'ceres_seam_miner'
      || slot.endsWith('_miner')
      || slot.includes('ore_carrier');
    if (miningOp && (action === 'work' || effect === 'mining:npcExtraction')) {
      return { beat: 'op_working', detail: `${slot || kind}:${action || effect}` };
    }
    if ((slot === 'ceres_refinery_hauler' || kind === 'hauler' || slot.includes('hauler'))
      && (action === 'depart' || action === 'load' || action === 'transit' || action === 'approach'
        || action === 'unload' || effect === 'freight:arrival' || effect === 'traffic:emptyHauler')) {
      return { beat: 'hauler_leaves', detail: `${slot || kind}:${action || effect}` };
    }
  }

  if (name === 'mining:npcExtraction') {
    return { beat: 'op_working', detail: name };
  }
  if (name === 'npcjobs:work') {
    const kind = jobKindOf(payload);
    if (kind === 'miner') return { beat: 'op_working', detail: `${name}:${kind}` };
  }

  if (name === 'npcjobs:depart' || name === 'npcjobs:transit' || name === 'npcjobs:load') {
    const kind = jobKindOf(payload);
    if (kind === 'hauler' || HAULER_ROLES.has(kind)) {
      return { beat: 'hauler_leaves', detail: `${name}:${kind}` };
    }
  }

  if (name === 'encounter:spawned' || name === 'encounter:telegraph') {
    const id = String((payload && (payload.encounterId || payload.id || payload.shapeId)) || '');
    if (id.includes('ambush') || id.includes('pirate') || id.includes('intercept')) {
      return { beat: 'pirates_intercept', detail: id || name };
    }
  }

  if (name === 'interdiction:triggered' || name === 'pirateParley:started') {
    return { beat: 'pirates_intercept', detail: name };
  }

  if (name === 'combat:fire' || name === 'combat:damage') {
    const owner = entity(payload && (payload.ownerId || payload.attackerId || payload.sourceId));
    const victim = entity(payload && (payload.targetId || payload.id));
    if (owner && isPirateEntity(owner)) {
      const hauler = victim && isHaulerEntity(victim)
        ? victim
        : live(state).find((e) => isHaulerEntity(e)
          && dist(e.pos, (payload && payload.pos) || owner.pos) <= INTERCEPT_RADIUS_WU);
      if (hauler) return { beat: 'pirates_intercept', detail: `${name} pirate#${owner.id}→hauler#${hauler.id}` };
    }
  }

  if (name === 'combat:tumbled') {
    const victim = entity(payload && payload.victimId);
    const attackerIsPlayer = (payload && payload.attackerId) === playerId;
    const source = String((payload && payload.source) || '');
    const duration = finite(payload && payload.durationS);
    const spin = finite(payload && payload.spin);
    const massline = source.includes('massline') || name === 'massline:tumbled';
    if (attackerIsPlayer && victim && victim.id !== playerId && !massline
      && (duration > 0 || spin > 0)) {
      if (victim.id != null) ctx.spunIds.add(victim.id);
      return { beat: 'shove_spins_one', detail: `tumble #${victim.id} ${duration}s` };
    }
  }

  if (name === 'tether:latched') {
    const target = entity(payload && payload.targetId);
    if (target && target.id !== playerId) ctx.latchedIds.add(target.id);
    if (target && isGrabCargoTarget(target, payload)) {
      return { beat: 'grab_pod', detail: `tether latch ${target.type}#${target.id}` };
    }
  }

  if (name === 'massline:throw') {
    const target = entity(payload && (payload.targetId || payload.victimId || payload.id));
    if (target && target.id !== playerId) {
      ctx.projectileIds.add(target.id);
      return { beat: 'rope_projectile', detail: `massline:throw #${target.id}` };
    }
  }

  if (name === 'tether:released' || name === 'massline:releaseValidated') {
    const targetId = payload && (payload.targetId || payload.victimId);
    const target = entity(targetId);
    if (target && target.id !== playerId && (ctx.latchedIds.has(target.id) || target.type === 'ship')) {
      const spd = speedOf(target);
      if (spd >= PROJECTILE_SPEED_WU) {
        ctx.projectileIds.add(target.id);
        return { beat: 'rope_projectile', detail: `${name} #${target.id} @ ${spd.toFixed(1)} WU/s` };
      }
    }
  }

  if (name === 'combat:collisionConsequence') {
    const aId = payload && (payload.targetId || payload.aId);
    const bId = payload && (payload.otherId || payload.bId);
    const a = entity(aId);
    const b = entity(bId);
    const deltaV = finite(payload && payload.deltaV);
    const causal = (id) => ctx.spunIds.has(id) || ctx.projectileIds.has(id);
    const shipShip = a && b && a.type === 'ship' && b.type === 'ship';
    const playerInPair = aId === playerId || bId === playerId;
    if (shipShip && !playerInPair && deltaV >= COLLATERAL_DELTA_V
      && (causal(aId) || causal(bId))) {
      return { beat: 'collateral', detail: `ship#${aId}×ship#${bId} ΔV=${deltaV.toFixed(1)}` };
    }
  }

  if (name === 'freight:cargoSpilled') {
    return { beat: 'cargo_spills', detail: `pods=${payload && payload.podCount}` };
  }
  if (name === 'cargo:jettisoned') {
    const ownerId = payload && payload.ownerId;
    if (ownerId != null && ownerId !== playerId) {
      return { beat: 'cargo_spills', detail: `jettison #${ownerId}` };
    }
    if (ownerId == null && ctx.lastNpcCargoOwner) {
      return { beat: 'cargo_spills', detail: 'jettison (npc)' };
    }
  }

  if (FLEE_EVENTS.has(name)) {
    const subject = entity(payload && (payload.entityId || payload.id || payload.jobId && payload.entityId));
    const kind = jobKindOf(payload);
    if ((subject && isHaulerEntity(subject)) || kind === 'hauler' || HAULER_ROLES.has(kind)) {
      return { beat: 'hauler_flees', detail: `${name} ${kind || (subject && subject.id)}` };
    }
  }

  if (name === 'law:dispatchStarted' || name === 'law:incidentOpened' || name === 'law:distressRaised') {
    return { beat: 'patrol_arrives', detail: name };
  }

  if (name === 'pickup:collected') {
    const collector = payload && (payload.collectorId || payload.playerId);
    if ((collector == null || collector === playerId) && isCargoPickup(null, payload)) {
      return { beat: 'grab_pod', detail: `collect ${payload && payload.commodityId}` };
    }
  }

  if (name === 'heat:changed') {
    const wanted = payload && (payload.wanted === true
      || (Number(payload.value) >= WANTED_THRESHOLD)
      || payload.wantedCrossed === true && payload.wanted === true);
    if (wanted) return { beat: 'run_wanted', detail: `heat=${payload && payload.value}` };
  }

  return null;
}

export function emptyBeatTimes() {
  const times = {};
  for (const beat of SIXTY_SECOND_BEATS) times[beat.id] = null;
  return times;
}

export function countDetected(times) {
  return SIXTY_SECOND_BEATS.reduce((n, beat) => n + (times[beat.id] != null ? 1 : 0), 0);
}

export function missingBeats(times) {
  return SIXTY_SECOND_BEATS.filter((beat) => times[beat.id] == null);
}

function productionNodeLookup() {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  // Production init/update name stuntGrammar; the Node factory table does not yet
  // materialize it. Fill the gap here so the instrument boots the shipping order
  // instead of dropping to a focused system list.
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  return table;
}

async function bootCeresPocket(seed, options = {}) {
  const systemLookup = productionNodeLookup();
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    systemLookup,
    slots: {
      aiSlot: systemLookup.get('aiSlot'),
      flightSlot: systemLookup.get('flightSlot'),
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
  });
  const state = runtime.state;
  if (!state) throw new Error('proof.sixty_seconds: runtime has no simulation state');
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    fittings: [PROOF_SHOVE_WEAPON_ID],
    factionId: 'faction_free',
  }));
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  if (!world || typeof world.enterSector !== 'function') {
    throw new Error('proof.sixty_seconds: world.enterSector missing — not the real path');
  }
  world.enterSector(PROOF_SECTOR_ID);
  if (typeof world.relocatePlayerInSector !== 'function') {
    throw new Error('proof.sixty_seconds: world.relocatePlayerInSector missing');
  }
  const pocketId = options.pocketId || PROOF_SIXTY_SECONDS_BOOT_POCKET_ID;
  const at = pocketEntryGlobal(pocketId);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'proof:sixty_seconds' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  if (!physics || typeof physics.prepareBackend !== 'function') {
    throw new Error('proof.sixty_seconds: physics.prepareBackend missing — not the real path');
  }
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  if (ready !== true) throw new Error('proof.sixty_seconds: SG-02 failed to come up');

  for (const name of [
    'traffic', 'npcJobsRuntime', 'lawSecurity', 'heat',
    'collisionConsequences', 'tetherGameplay', 'weapons',
  ]) {
    if (!runtime.getSystem(name)) {
      throw new Error(`proof.sixty_seconds: system "${name}" is not registered`);
    }
  }

  return { runtime, state, bus: runtime.bus, player, pocketId };
}

function takeSetupCensus(state, player, pocketIds) {
  const pockets = censusProofPockets(state, pocketIds);
  return {
    ...pockets,
    playerLocal: censusPocket(state, player),
  };
}

/**
 * Short real-path boot pointed at one pocket. Settles just long enough for the authored
 * census to exist. Does not play the 60s tape or invent combat receipts.
 */
export async function runProofPocketCensus(seed, options = {}) {
  const pocketId = options.pocketId || PROOF_AMBUSH_POCKET_ID;
  const pocketIds = options.pocketIds || PROOF_POCKET_IDS;
  const settleTicks = Number.isFinite(options.settleTicks)
    ? options.settleTicks
    : PROOF_CENSUS_SETTLE_TICKS;
  const host = await bootCeresPocket(seed, { pocketId });
  const { runtime, state, player } = host;
  try {
    const proof = realPathProof(runtime);
    if (proof.sg02Ready !== true || proof.backend !== 'rapier-dynamic') {
      throw new Error(`proof.sixty_seconds: not the real path (sg02Ready=${proof.sg02Ready}, backend=${proof.backend})`);
    }
    for (let i = 0; i < settleTicks; i++) {
      runtime.step(SIM_DT);
    }
    const pockets = censusProofPockets(state, pocketIds);
    return {
      scenarioId: PROOF_SCENARIO_ID,
      seed,
      sectorId: PROOF_SECTOR_ID,
      pocketId,
      pocketIds: pocketIds.slice(),
      ticks: settleTicks,
      setup: censusProofPocket(state, pocketId),
      pockets,
      playerLocal: censusPocket(state, player),
      realPath: proof,
    };
  } finally {
    runtime.dispose();
  }
}

/**
 * Run one seeded proof. Returns beat times in seconds, setup census, and real-path proof.
 * Stops early when all 11 beats are seen. Hard-aborts at 90 s of sim time.
 */
function relocatePlayerToPocket(runtime, player, pocketId, reason) {
  const world = runtime && typeof runtime.getSystem === 'function' ? runtime.getSystem('world') : null;
  if (!world || typeof world.relocatePlayerInSector !== 'function') {
    throw new Error('proof.sixty_seconds: relocatePlayerInSector missing');
  }
  const at = pocketEntryGlobal(pocketId);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason });
  if (player && player.vel) {
    player.vel.x = 0;
    player.vel.z = 0;
  }
}

export async function runProofSixtySeconds(seed, options = {}) {
  const windowTicks = Number.isFinite(options.windowTicks) ? options.windowTicks : WINDOW_TICKS;
  const hardCapTicks = Number.isFinite(options.hardCapTicks) ? options.hardCapTicks : HARD_CAP_TICKS;
  const bootPocketId = options.pocketId || PROOF_SIXTY_SECONDS_BOOT_POCKET_ID;
  const censusPocketIds = options.pocketIds || PROOF_POCKET_IDS;
  const relocateAfterTicks = Number.isFinite(options.relocateAfterTicks)
    ? options.relocateAfterTicks
    : null;
  const relocatePocketId = options.relocatePocketId || PROOF_AMBUSH_POCKET_ID;
  const host = await bootCeresPocket(seed, { pocketId: bootPocketId });
  const { runtime, state, bus, player } = host;
  const driver = createInputTapeDriver(options.tape || buildProofInputTape());
  const times = emptyBeatTimes();
  const details = {};
  const receipts = [];
  const ctx = {
    state,
    spunIds: new Set(),
    projectileIds: new Set(),
    latchedIds: new Set(),
    lastNpcCargoOwner: false,
  };

  const off = [];
  for (const name of WATCHED_EVENTS) {
    off.push(bus.on(name, (payload) => {
      const t = finite(state.simTime);
      receipts.push({ t, name });
      if (receipts.length > 4000) receipts.splice(0, receipts.length - 4000);
      const hit = classifyReceipt(name, payload || {}, ctx);
      if (!hit || times[hit.beat] != null) return;
      times[hit.beat] = Number(t.toFixed(3));
      details[hit.beat] = hit.detail;
    }));
  }

  let setup = null;
  let ticks = 0;
  try {
    const proof = realPathProof(runtime);
    if (proof.sg02Ready !== true || proof.backend !== 'rapier-dynamic') {
      throw new Error(`proof.sixty_seconds: not the real path (sg02Ready=${proof.sg02Ready}, backend=${proof.backend})`);
    }

    const limit = Math.min(windowTicks, hardCapTicks);
    for (let i = 0; i < limit; i++) {
      const tick = state.tick | 0;
      if (relocateAfterTicks != null && ticks === relocateAfterTicks && bootPocketId !== relocatePocketId) {
        relocatePlayerToPocket(runtime, player, relocatePocketId, 'proof:sixty_seconds:relocate');
      }
      const tether = !!(player && player.tether && player.tether.active);
      driver.apply(state, tick, SIM_DT, { playerEntity: player, tetherAttached: tether });
      const aim = aimTargetForTick(state, player, tick);
      pointAt(state, player, aim);
      runtime.step(SIM_DT);
      ticks += 1;
      if (ticks === PROOF_CENSUS_SETTLE_TICKS) setup = takeSetupCensus(state, player, censusPocketIds);
      if (countDetected(times) >= SIXTY_SECOND_BEATS.length) break;
      if (finite(state.simTime) >= PROOF_HARD_CAP_S) break;
    }
    if (!setup) setup = takeSetupCensus(state, player, censusPocketIds);

    const simS = finite(state.simTime);
    const detected = countDetected(times);
    const missing = missingBeats(times).map((beat) => ({
      id: beat.id,
      label: beat.label,
      owner: beat.owner,
      receipts: beat.receipts.slice(),
    }));

    return {
      scenarioId: PROOF_SCENARIO_ID,
      seed,
      sectorId: PROOF_SECTOR_ID,
      pocketId: relocateAfterTicks != null ? relocatePocketId : bootPocketId,
      bootPocketId,
      relocatedAtTick: relocateAfterTicks,
      pocketIds: censusPocketIds.slice(),
      simS: Number(simS.toFixed(3)),
      ticks,
      exceededHardCap: simS > PROOF_HARD_CAP_S + 1e-6,
      detected,
      required: PROOF_REQUIRED_BEATS,
      total: SIXTY_SECOND_BEATS.length,
      gateMet: detected >= PROOF_REQUIRED_BEATS && simS <= PROOF_HARD_CAP_S,
      times,
      details,
      missing,
      setup,
      realPath: proof,
      receiptCount: receipts.length,
      shields: host.shields || [],
    };
  } finally {
    for (const unsub of off) if (typeof unsub === 'function') unsub();
    runtime.dispose();
  }
}

export function formatBeatTable(runs) {
  const header = [
    'seed',
    ...SIXTY_SECOND_BEATS.map((b) => b.id),
    'n/11',
    'simS',
    'gate',
  ];
  const lines = [];
  lines.push('PQ-141.00 proof.sixty_seconds — B12 60-second proof (receipts only, no NPC scripting)');
  lines.push(header.join('\t'));
  for (const run of runs) {
    const cells = [String(run.seed)];
    for (const beat of SIXTY_SECOND_BEATS) {
      const t = run.times[beat.id];
      cells.push(t == null ? '—' : t.toFixed(2));
    }
    cells.push(`${run.detected}/11`);
    cells.push(run.simS.toFixed(2));
    cells.push(run.gateMet ? 'PASS' : 'MISS');
    lines.push(cells.join('\t'));
  }
  const worst = runs.reduce((m, r) => Math.min(m, r.detected), 11);
  const allCap = runs.every((r) => r.exceededHardCap !== true && r.simS <= PROOF_HARD_CAP_S);
  const gate = worst >= PROOF_REQUIRED_BEATS && allCap;
  lines.push('');
  lines.push(`ALPHA GATE: ≥ ${PROOF_REQUIRED_BEATS} of 11 on each of ${runs.length} seeds; sim ≤ ${PROOF_HARD_CAP_S}s.`);
  lines.push(`Worst seed: ${worst}/11. Hard-cap honored: ${allCap ? 'yes' : 'NO'}.`);
  lines.push(`RESULT: ${gate ? 'DONE' : 'NOT DONE'}`);
  const missingRows = [];
  for (const run of runs) {
    for (const miss of run.missing || []) {
      missingRows.push(`  seed ${run.seed}: ${miss.label} (${miss.id}) — owner ${miss.owner}`);
    }
  }
  if (missingRows.length) {
    lines.push('MISSING BEATS (packet that owns the gap):');
    lines.push(...missingRows);
  }
  for (const run of runs) {
    const s = run.setup || {};
    const hits = SIXTY_SECOND_BEATS
      .filter((b) => run.times[b.id] != null)
      .map((b) => `${b.id}=${(run.details && run.details[b.id]) || run.times[b.id]}`);
    const local = s.playerLocal || {};
    const refinery = s.byPocket && s.byPocket[PROOF_REFINERY_POCKET_ID];
    const ambush = s.byPocket && s.byPocket[PROOF_AMBUSH_POCKET_ID];
    lines.push(
      `  setup seed ${run.seed}: workers=${s.workers ?? '?'} haulers=${s.haulers ?? '?'} `
      + `pirates=${s.pirates ?? '?'} patrols=${s.patrols ?? '?'} pods=${s.cargoPods ?? '?'} `
      + `playerLocal.pirates=${local.pirates ?? '?'} `
      + `refinery.pirates=${refinery ? refinery.pirates : '?'} `
      + `ambush.pirates=${ambush ? ambush.pirates : '?'} `
      + `boot=${run.bootPocketId || run.pocketId || '?'} `
      + `pockets=${(run.pocketIds || PROOF_POCKET_IDS).join('+')} `
      + `realPath=${run.realPath && run.realPath.backend}/${run.realPath && run.realPath.sg02Ready}`,
    );
    if (hits.length) lines.push(`  hits seed ${run.seed}: ${hits.join('; ')}`);
    if (run.shields && run.shields.length) lines.push(`  shields seed ${run.seed}: ${run.shields.join('; ')}`);
  }
  return lines.join('\n');
}

export async function runProofSixtySecondsSuite(seeds = PROOF_SEEDS, options = {}) {
  const runs = [];
  for (const seed of seeds) {
    runs.push(await runProofSixtySeconds(seed, options));
  }
  const table = formatBeatTable(runs);
  const worst = runs.reduce((m, r) => Math.min(m, r.detected), 11);
  const allCap = runs.every((r) => r.exceededHardCap !== true && r.simS <= PROOF_HARD_CAP_S);
  return {
    scenarioId: PROOF_SCENARIO_ID,
    runs,
    table,
    worst,
    required: PROOF_REQUIRED_BEATS,
    gateMet: worst >= PROOF_REQUIRED_BEATS && allCap,
  };
}
