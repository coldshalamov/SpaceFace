// PQ-141.00 / PQ-141.01 — deterministic 60-second proof instrument (B12).
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

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    // tether:whipImpact is the shipping receipt for the player's tethered/released mass
    // striking a body — the exact physical fact this beat names. masslineImpacts only tracks
    // the player's own line, so the mass is causal by construction.
    receipts: Object.freeze(['combat:collisionConsequence', 'tether:whipImpact']),
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
  // inputTape.js: Mouse0 is fire (the real LMB path — _m0 through syncTapeKeysToInput).
  // KeyF / Space is the Massline. Do not invert them.

  // Sit through the spill. Reverse, then latch the spilled pod (grab_pod). KeyF-down
  // while unattached does not cut on release — tap again with no line intent to free
  // the line before seed-47 pirate #131 reaches the nose (~8 s, inside 390 WU).
  press(160, 'KeyS', true);
  press(230, 'KeyS', false);
  press(240, 'KeyF', true);
  press(340, 'KeyF', false);

  // Clean cut tap (attached, < MASSLINE_HOLD_S, no boost/strafe/reel): the grammar cuts on
  // release only when the press lasted under 0.16 s — a 12-tick hold enters line control instead.
  press(360, 'KeyF', true);
  press(366, 'KeyF', false);

  // The released pod drifts within a few WU of the nose and wins proximity acquisition over
  // the incoming pirate, so burn briefly to clear its cone, then brake back down — a player
  // still doing 200+ WU/s drags the latched hull through the debris field and kills the
  // payload before any release window opens.
  press(380, 'KeyW', true);
  press(430, 'KeyW', false);

  // Shove the incoming pirate BEFORE the latch — once it is on the line a held trigger fires
  // point-blank into our own payload.
  press(430, 'Mouse0', true);
  press(470, 'Mouse0', false);

  press(450, 'KeyS', true);
  press(505, 'KeyS', false);

  // The latch only attempts on a KeyF press EDGE, so the tape keeps pressing while the
  // pirate closes — each hold lasts >0.16 s, a release after MASSLINE_HOLD_S never cuts, and a
  // press that lands while already attached is ignored. The later edges catch a pirate that
  // reaches the pocket late on other seeds.
  press(505, 'KeyF', true);
  press(518, 'KeyF', false);
  press(525, 'KeyF', true);
  press(540, 'KeyF', false);
  press(548, 'KeyF', true);
  press(566, 'KeyF', false);
  // RMB can go down ahead of the latch: throwArm's pressed edge fires the moment the payload
  // turns throwable, and 'arm' assist then cuts on the first real solution window. It stays
  // held through the swing window — late solutions (a swing still building speed, a victim
  // drifting into the envelope) are exactly what the arm exists to catch.
  press(512, 'Mouse2', true);
  // The whip is a flail, not a winch: line control reels the catch into our own hull ring and
  // leaves the rope slack forever, so the tether key stays UP and the ship flies the circle
  // itself — full thrust + held turn lets the orbit assist hold the nose tangent to the live
  // rope radius, and the taut line drags the hull around at real tip speed until the arm's
  // solver sees a victim cross the sweep.
  press(580, 'KeyW', true);
  press(580, 'KeyA', true);
  // massline2.fireControl is live: while the pirate is on the line the guns re-solve onto OUR OWN
  // payload, so Mouse0 is off until the throw releases — the hauler hit must come off the rope.
  press(1700, 'KeyA', false);
  press(2380, 'KeyW', false);
  press(2400, 'Mouse2', false);

  press(1680, 'Mouse0', true);
  press(2400, 'Mouse0', false);

  press(2400, 'KeyF', true);
  press(3000, 'KeyF', false);

  press(3000, 'ShiftLeft', true);
  press(3600, 'ShiftLeft', false);

  press(3720, 'Mouse0', true);
  press(4200, 'Mouse0', false);
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

function nearestToPoint(state, origin, predicate, excludeIds) {
  let best = null;
  let bestD = Infinity;
  for (const entity of live(state)) {
    if (!entity || entity.id === state.playerId) continue;
    if (excludeIds && excludeIds.has(entity.id)) continue;
    if (!predicate(entity)) continue;
    const d = dist(origin, entity.pos);
    if (d < bestD) {
      best = entity;
      bestD = d;
    }
  }
  return best;
}

// The throw solver tracks a ~6 s moving-disk intercept: beyond this the aim is wishing, not
// reading. A fleeing hull already at 150+ WU/s outruns the sling outright; a hauler still on
// its lane is the victim the rope can actually reach.
const THROW_AIM_REACH_WU = 700;

export function aimTargetForTick(state, player, tick) {
  if ((tick >= 90 && tick < 340) || (tick >= 2400 && tick < 3000)) {
    return nearest(state, player, (e) => isGrabCargoTarget(e))
      || nearest(state, player, (e) => e.type === 'pickup' || e.type === 'payload');
  }
  const tether = state.player && state.player.tether;
  const payloadId = tether && tether.active ? tether.targetId : null;
  const convoy = () => {
    // The armed swing keeps the read on the convoy — the authored collateral victim is the
    // lawful hauler whose damage opens the spill/incident/heat chain. Never aim the payload
    // itself: a self-paint sits inside the swept disk every tick and fires the arm at a
    // meaningless "solution". While a hull is on the line, keep the read on victims the
    // sling can actually reach.
    const excluded = new Set([state.playerId]);
    if (payloadId != null) excluded.add(payloadId);
    if (payloadId != null) {
      const payload = state.entities && state.entities.get ? state.entities.get(payloadId) : null;
      const origin = (payload && payload.pos) || player.pos;
      const nearestShip = nearestToPoint(state, origin,
        (e) => e.type === 'ship' && e.alive !== false, excluded);
      let slowest = null;
      let slowestV = Infinity;
      for (const e of live(state)) {
        if (!isHaulerEntity(e) || excluded.has(e.id) || e.alive === false) continue;
        if (dist(origin, e.pos) > THROW_AIM_REACH_WU) continue;
        const v = speedOf(e);
        if (v < slowestV) { slowest = e; slowestV = v; }
      }
      // A sling throw is a ballistic intercept: the solver's ~6 s moving-disk read only stays
      // honest while the flight time stays short, so the nearest ship to the payload is the
      // victim the rope can actually connect. The hauler fallback keeps the authored chain
      // when nothing crosses the swing's immediate reach.
      return nearestShip || slowest;
    }
    return nearest(state, player, (e) => isHaulerEntity(e) && !excluded.has(e.id))
      || nearest(state, player, (e) => isPatrolEntity(e) && !excluded.has(e.id))
      || nearest(state, player, (e) => e.type === 'ship' && !excluded.has(e.id));
  };
  // Once a hull is on the line inside the armed window the cursor stays on the convoy, no
  // matter what the surrounding schedule window would otherwise pick.
  if (payloadId != null && tick >= 340 && tick < 2400) return convoy();
  if ((tick >= 560 && tick < 900) || (tick >= 1020 && tick < 1680)) return convoy();
  if (tick >= 900 && tick < 1020) {
    return nearest(state, player, (e) => isPirateEntity(e) && e.id !== payloadId)
      || nearest(state, player, isPirateEntity)
      || nearest(state, player, (e) => e.type === 'asteroid')
      || nearest(state, player, (e) => e.type === 'ship' && e.id !== state.playerId);
  }
  if ((tick >= 340 && tick < 560) || (tick >= 1680 && tick < 2400) || (tick >= 3720 && tick < 4200)) {
    return nearest(state, player, (e) => isPirateEntity(e) && e.id !== payloadId)
      || nearest(state, player, isPirateEntity)
      || nearest(state, player, (e) => e.type === 'ship' && e.team === 1 && e.id !== payloadId)
      || nearest(state, player, (e) => e.type === 'ship' && e.id !== state.playerId && e.id !== payloadId);
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

// Headless input.js never sees a mouse-down, so aimIntentActive stays false and Massline
// acquisition ignores aimWorld (steering / nearest-body). Mark the live pointer so the
// tape's pointAt is scored as a real cursor paint.
export function markProofPointerActive(inputSys) {
  if (!inputSys) return false;
  const screen = inputSys._screen || (inputSys._screen = { x: 0, y: 0, active: false });
  screen.active = true;
  return true;
}

// Node input.js owns this._keys and rebuilds tetherFire from them. The tape driver keeps a
// private keybag; without this copy, KeyF never becomes the Massline and grab/WANTED stay dark.
// Mouse buttons ride the same private state: headless input never sees LMB/RMB, so without
// _m0/_m2 the tape's fire and throwArm flags are rebuilt as false on every input tick.
export function syncTapeKeysToInput(inputSys, tapeKeys) {
  if (!inputSys || !inputSys._keys) return false;
  const live = inputSys._keys;
  const next = tapeKeys && typeof tapeKeys === 'object' ? tapeKeys : {};
  for (const code of Object.keys(live)) {
    if (!Object.prototype.hasOwnProperty.call(next, code)) live[code] = false;
  }
  for (const code of Object.keys(next)) {
    live[code] = !!next[code];
  }
  inputSys._m0 = !!next.Mouse0;
  inputSys._m2 = !!next.Mouse2;
  return true;
}

// Headless input.update raycasts a dead NDC and writes aimWorld to (0,0). Return the tape's
// last pointAt so a latch aims at the pod, not the sector origin.
export function installProofAimPassthrough(inputSys, state) {
  if (!inputSys) return false;
  const helpers = inputSys.helpers || (inputSys.helpers = {});
  helpers.raycastToPlane = function proofAimPassthrough() {
    const aim = state && state.input && state.input.aimWorld;
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) return { x: aim.x, z: aim.z };
    return { x: 0, z: 0 };
  };
  return true;
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
    // A work-role hull moving its route is the operation working — the seam barge's
    // extraction lands whenever its leg finishes, so the transit/depart receipts are the
    // on-screen evidence that the yard crew is live.
    if (WORK_ROLES.has(kind)) {
      return { beat: 'op_working', detail: `${name}:${kind}` };
    }
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
    const target = entity(payload && (
      payload.payloadId || payload.targetId || payload.victimId || payload.id
    ));
    if (target && target.id !== playerId) {
      ctx.projectileIds.add(target.id);
      return { beat: 'rope_projectile', detail: `massline:throw #${target.id}` };
    }
    if (payload && payload.payloadId != null && payload.payloadId !== playerId) {
      ctx.projectileIds.add(payload.payloadId);
      return { beat: 'rope_projectile', detail: `massline:throw #${payload.payloadId}` };
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

  if (name === 'tether:whipImpact') {
    // The dedicated receipt for "the player's whipped mass strikes a body." `slung` means the
    // mass was released off the line inside the sling window — i.e. the rope_projectile hull —
    // so the causality test is the receipt itself, not a guessed pair. The victim must still be
    // a real ship (asteroids/stations are scenery, not collateral) and the hit energetic.
    const mass = entity(payload && payload.targetId);
    const victim = entity(payload && payload.victimId);
    const relSpeed = finite(payload && payload.relSpeed);
    if (payload && payload.slung === true && mass && victim
      && victim.type === 'ship' && victim.id !== playerId
      && relSpeed >= COLLATERAL_DELTA_V) {
      return { beat: 'collateral', detail: `whip #${mass.id}→ship#${victim.id} relV=${relSpeed.toFixed(1)}` };
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

/** Dark cells across a suite, each still named by the packet that owns the beat. */
export function leftoverCells(runs) {
  const cells = [];
  for (const run of runs || []) {
    const times = (run && run.times) || emptyBeatTimes();
    for (const beat of missingBeats(times)) {
      const ropeDark = times.rope_projectile == null;
      cells.push({
        seed: run.seed,
        id: beat.id,
        label: beat.label,
        owner: beat.owner,
        receipts: beat.receipts.slice(),
        note: beat.id === 'collateral' && ropeDark
          ? 'downstream of dark rope_projectile on this seed; classifyReceipt still needs a thrown/spun hull'
          : null,
      });
    }
  }
  return cells;
}

/** Group leftover cells by owning packet so a dark cell is a ticket, not a fake. */
export function leftoverRoutes(runs) {
  const cells = leftoverCells(runs);
  const byOwner = new Map();
  for (const cell of cells) {
    if (!byOwner.has(cell.owner)) {
      byOwner.set(cell.owner, { owner: cell.owner, beats: new Map() });
    }
    const group = byOwner.get(cell.owner);
    if (!group.beats.has(cell.id)) {
      group.beats.set(cell.id, {
        id: cell.id,
        label: cell.label,
        seeds: [],
        receipts: cell.receipts,
        notes: [],
      });
    }
    const beat = group.beats.get(cell.id);
    beat.seeds.push(cell.seed);
    if (cell.note) beat.notes.push(`seed ${cell.seed}: ${cell.note}`);
  }
  return {
    cells,
    dark: cells.length,
    routes: [...byOwner.values()].map((group) => ({
      owner: group.owner,
      beats: [...group.beats.values()],
    })),
  };
}

/** Detected beats whose first receipt is after the 60 s window. Dark cells are not late. */
export function listedBeatsOutsideWindow(runs, windowS = PROOF_WINDOW_S) {
  const late = [];
  for (const run of runs || []) {
    const times = (run && run.times) || emptyBeatTimes();
    for (const beat of SIXTY_SECOND_BEATS) {
      const t = times[beat.id];
      if (t != null && Number(t) > windowS + 1e-6) {
        late.push({
          seed: run.seed,
          id: beat.id,
          label: beat.label,
          owner: beat.owner,
          t: Number(t),
        });
      }
    }
  }
  return late;
}

export function elevenOfElevenClaim(runs) {
  const dark = leftoverCells(runs).length;
  return { allowed: dark === 0, dark };
}

export function formatLeftoverRoutes(runs) {
  const leftover = leftoverRoutes(runs);
  const late = listedBeatsOutsideWindow(runs);
  const lines = [];
  lines.push('PQ-141.01 leftover routes (dark cell → owning packet; classifyReceipt unchanged)');
  if (!leftover.cells.length) {
    lines.push('  no dark cells');
  } else {
    for (const route of leftover.routes) {
      for (const beat of route.beats) {
        lines.push(
          `  ${beat.label} (${beat.id}) dark on seeds ${beat.seeds.join(', ')} → ${route.owner}`,
        );
        for (const note of beat.notes) lines.push(`    ${note}`);
      }
    }
    lines.push(`Do not claim 11/11: ${leftover.dark} cell${leftover.dark === 1 ? '' : 's'} remain dark.`);
  }
  if (late.length) {
    lines.push('LISTED BEATS AFTER 60s (not inside the window):');
    for (const row of late) {
      lines.push(`  seed ${row.seed}: ${row.label} (${row.id}) at ${row.t.toFixed(2)}s — owner ${row.owner}`);
    }
  } else {
    lines.push('Listed (detected) beats are all inside 60 seconds.');
  }
  const tableReady = (runs || []).length > 0;
  const routed = leftover.cells.every((cell) => cell.owner && cell.owner.length > 0);
  const leafDone = tableReady && routed && late.length === 0;
  lines.push(`PQ-141.01 RESULT: ${leafDone ? 'DONE' : 'NOT DONE'} (table printed; leftovers routed; no 11/11 claim while cells are dark)`);
  return lines.join('\n');
}

export function formatBeatMarkdownTable(runs) {
  const header = ['seed', ...SIXTY_SECOND_BEATS.map((b) => b.id), 'n/11', 'simS'];
  const sep = header.map(() => '---');
  const rows = [header.join(' | '), sep.join(' | ')];
  for (const run of runs || []) {
    const cells = [String(run.seed)];
    for (const beat of SIXTY_SECOND_BEATS) {
      const t = run.times && run.times[beat.id];
      cells.push(t == null ? '—' : Number(t).toFixed(2));
    }
    cells.push(`${run.detected}/11`);
    cells.push(Number(run.simS).toFixed(2));
    rows.push(cells.join(' | '));
  }
  return rows.join('\n');
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
  // The tape holds RMB through the swing; 'arm' is the shipped assist that cuts on the predicted
  // solution frame. A fixed tape cannot hit 'snap''s 90 ms window on five different seeds.
  state.settings.gameplay.masslineReleaseAssist = 'arm';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
  installProofAimPassthrough(runtime.getSystem('input'), state);

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
    'collisionConsequences', 'tetherGameplay', 'weapons', 'masslineThrow',
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

function applyProofTapeTick(state, player, driver, inputSys, tick) {
  const tether = !!(state.player && state.player.tether && state.player.tether.active);
  driver.apply(state, tick, SIM_DT, { playerEntity: player, tetherAttached: tether });
  syncTapeKeysToInput(inputSys, driver.snapshotKeys());
  featherSwingPump(state, driver, inputSys, tick);
  manualSwingCut(state, driver, inputSys, tick);
  reachLineForVictim(state, driver, inputSys, tick);
  gateThrowArmByRange(state, driver, inputSys, tick);
  guardFireThroughSwingPayload(state, inputSys);
  pointAt(state, player, aimTargetForTick(state, player, tick));
  markProofPointerActive(inputSys);
}

// fireControl re-solves the player's mounts onto the tethered hull: a held concussion trigger
// during a swing is the tape shooting its own catch, which tumbles the payload, spikes the
// strain, and breaks the line before a release window ever opens. A real hand lifts off the
// trigger while a throwable hull is on the rope; mask the fire bit exactly then.
export function guardFireThroughSwingPayload(state, inputSys) {
  if (!inputSys || inputSys._m0 !== true) return;
  const tether = state.player && state.player.tether;
  if (!tether || !tether.active) return;
  const payload = state.entities && state.entities.get ? state.entities.get(tether.targetId) : null;
  if (payload && payload.type === 'ship' && payload.id !== state.playerId) inputSys._m0 = false;
}

// A pilot pumping a swing watches the strain gauge the HUD already shows (tether.phase) and
// eases off the pump when the line screams — the controller cuts after ~0.2–0.7 s of sustained
// overload, and holding full draw through a melee hands the line to the break policy before a
// solution ever opens. During the swing window this drops pump (Shift) and the draw axis (W is
// reel-in under line control) while the phase reads overload, then resumes the gesture once the
// line settles — the same modulation a hand on the keys performs.
export function featherSwingPump(state, driver, inputSys, tick) {
  if (!inputSys || !inputSys._keys || tick < 470 || tick >= 1680) return;
  const tether = state.player && state.player.tether;
  if (!tether || !tether.active) return;
  const feather = driver._swingFeather || (driver._swingFeather = { easeTicks: 0, payTicks: 0 });
  // A collapsed orbit sweeps the catch through the player's own hull ring once a revolution —
  // each pass grinds the payload and spikes the line. A hand pumping a swing eases the pump
  // off AND pays out line when the hull crosses the ship, opening the radius back up.
  const payload = state.entities && state.entities.get ? state.entities.get(tether.targetId) : null;
  const self = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const selfRing = payload && self && payload.pos && self.pos
    && Math.hypot(payload.pos.x - self.pos.x, payload.pos.z - self.pos.z)
      < Math.max(34, finite(self.radius, 12) * 2.5);
  if (selfRing) feather.payTicks = 18;
  else if (feather.payTicks > 0) feather.payTicks -= 1;
  if (tether.phase === 'overload' || selfRing) feather.easeTicks = 12;
  else if (feather.easeTicks > 0) feather.easeTicks -= 1;
  if (feather.easeTicks > 0) {
    inputSys._keys.ShiftLeft = false;
    inputSys._keys.KeyW = false;
  }
  if (feather.payTicks > 0) {
    inputSys._keys.KeyW = false;
    inputSys._keys.KeyS = true;
  }
}

// A sling throw is a ballistic read on the moment — the solver's swept-disk answer stays honest
// only while the flight time stays short. Arming while every victim sits beyond the swing's
// envelope spends the payload on a prayer (the release still counts as rope_projectile, but the
// hull never arrives). A hand keeps a finger off the throw-arm until the flail itself is on top
// of a victim and actually moving — the released hull inherits only what the swing built.
const THROW_ARM_GATE_RANGE_WU = 300;   // payload↔victim, not player↔victim
const THROW_ARM_GATE_SPEED_WU = 55;    // don't arm a hull that isn't really swinging

export function gateThrowArmByRange(state, driver, inputSys, tick) {
  if (!inputSys || tick < 500 || tick >= 2200) return;
  const tether = state.player && state.player.tether;
  if (!tether || !tether.active) return;             // nothing on the line — leave the press alone
  const payload = state.entities && state.entities.get ? state.entities.get(tether.targetId) : null;
  const self = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!payload || !payload.pos || !self) return;
  const aim = aimTargetForTick(state, self, tick);
  if (!aim || !aim.pos) return;
  const d = Math.hypot(aim.pos.x - payload.pos.x, aim.pos.z - payload.pos.z);
  const v = Math.hypot(finite(payload.vel && payload.vel.x), finite(payload.vel && payload.vel.z));
  if (d > THROW_ARM_GATE_RANGE_WU || v < THROW_ARM_GATE_SPEED_WU) inputSys._m2 = false;
}

// Reach: the swung hull circles at the rope's live span, so a victim crossing off that shell
// only ever sees near-misses. A real hand sizes the line to the target as the flail's bearing
// comes around — a short line-control hold (KeyF ≥ 0.16 s so release never reads as a cut tap)
// with W/S steering the winch, shrinking or growing restLength until the sweep sits on the
// victim's annulus. The burst is only asked for while the hull is rotating toward the victim
// and the target sits within the slack a line change can honestly cover; overload never gets
// more line.
export function reachLineForVictim(state, driver, inputSys, tick) {
  const st = driver && (driver._reachLine || (driver._reachLine = { burst: 0, dir: 0 }));
  if (!inputSys || !inputSys._keys || tick < 560 || tick >= 2300) return;
  const tether = state.player && state.player.tether;
  if (!tether || !tether.active) { st.burst = 0; return; }
  const self = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const payload = state.entities && state.entities.get ? state.entities.get(tether.targetId) : null;
  if (!self || !self.pos || !payload || !payload.pos || !payload.vel) { st.burst = 0; return; }
  if (st.burst > 0) {
    // Hold the whole burst — releasing KeyF early is the grammar's tap-to-cut.
    if (cutInProgress(driver)) { st.burst = 0; return; }
    inputSys._keys.KeyF = true;
    inputSys._keys.KeyW = st.dir < 0;
    inputSys._keys.KeyS = st.dir > 0;
    st.burst -= 1;
    if (st.burst === 0) { inputSys._keys.KeyF = false; inputSys._keys.KeyW = false; inputSys._keys.KeyS = false; }
    return;
  }
  const victim = aimTargetForTick(state, self, tick);
  if (!victim || !victim.pos || victim.id === payload.id) return;
  const rx = payload.pos.x - self.pos.x, rz = payload.pos.z - self.pos.z;
  const span = Math.hypot(rx, rz);
  const rV = Math.hypot(victim.pos.x - self.pos.x, victim.pos.z - self.pos.z);
  const payloadBearing = Math.atan2(rz, rx);
  const victimBearing = Math.atan2(victim.pos.z - self.pos.z, victim.pos.x - self.pos.x);
  let dAng = victimBearing - payloadBearing;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  while (dAng < -Math.PI) dAng += 2 * Math.PI;
  const cross = rx * payload.vel.z - rz * payload.vel.x;   // r×v — sign gives swing direction
  const approaching = Math.abs(cross) > 1 && ((cross > 0 && dAng > 0) || (cross < 0 && dAng < 0));
  if (!approaching || Math.abs(dAng) > 0.9) return;
  if (tether.phase === 'overload' || Math.abs(rV - span) <= 15 || rV > span + 130) return;
  st.dir = rV < span ? -1 : 1;                           // reel in or pay out onto the shell
  st.burst = 16;                                         // ~0.27 s — past the hold floor, no cut
}

function cutInProgress(driver) {
  const st = driver && driver._swingCut;
  return !!(st && st.tap > 0);
}

// The assist solver's certification assumes the victim holds course — a braking or jinking hull
// leaves a certified release stranded where the target no longer is. A hand on the line doesn't
// wait for the lockout: it watches the target's own motion, leads the intercept by what the
// target is actually doing (measured acceleration, not a guess), and taps the tether free the
// tick the flail's velocity lines up. The cut is the honest release path — tap under 0.16 s
// reads as a cut in the grammar, the hull leaves with exactly the speed the swing built.
const SWING_CUT_MAX_RANGE_WU = 420;
const SWING_CUT_MIN_RANGE_WU = 60;
const SWING_CUT_MIN_SPEED = 55;
const SWING_CUT_TRACK_S = 0.75;
const SWING_CUT_HIT_WU = 30;         // predicted minimum separation that reads as contact
const SWING_CUT_HULL_DRAG = 0.35;    // per-second velocity bleed of a recovering live hull

export function manualSwingCut(state, driver, inputSys, tick) {
  const st = driver && (driver._swingCut || (driver._swingCut = { tap: 0, vid: null, hist: [] }));
  if (!inputSys || !inputSys._keys) return;
  const tether = state.player && state.player.tether;
  const active = !!(tether && tether.active && tether.targetId != null);
  if (st.tap > 0) {
    // The tap must complete uninterrupted: held past the floor it stops being a cut, so the
    // reach helper is locked out for these ticks and nothing else touches KeyF.
    inputSys._keys.KeyF = st.tap > 1;
    st.tap -= 1;
    if (st.tap === 0) inputSys._keys.KeyF = false;
    return;
  }
  if (tick < 560 || tick >= 2300) return;
  if (!active) { st.hist.length = 0; st.vid = null; return; }
  const self = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const payload = state.entities && state.entities.get ? state.entities.get(tether.targetId) : null;
  if (!self || !payload || !payload.pos || !payload.vel) return;
  // Never start a tap on top of a reach-line burst: the combined hold either crosses the cut
  // floor (the release whiffs) or ends early enough to read as an accidental tap-cut.
  if (driver._reachLine && driver._reachLine.burst > 0) return;
  const victim = aimTargetForTick(state, self, tick);
  if (!victim || !victim.pos || !victim.vel || victim.id === payload.id) return;
  // Track the victim's real velocity to measure braking/curving instead of trusting a
  // constant-velocity lead.
  if (st.vid !== victim.id) { st.vid = victim.id; st.hist.length = 0; }
  st.hist.push({ t: state.simTime, vx: finite(victim.vel.x), vz: finite(victim.vel.z) });
  while (st.hist.length && state.simTime - st.hist[0].t > SWING_CUT_TRACK_S) st.hist.shift();
  const d = Math.hypot(victim.pos.x - payload.pos.x, victim.pos.z - payload.pos.z);
  const payV = Math.hypot(payload.vel.x, payload.vel.z);
  if (payV < SWING_CUT_MIN_SPEED || d > SWING_CUT_MAX_RANGE_WU || d < SWING_CUT_MIN_RANGE_WU) return;
  const oldest = st.hist[0];
  const spanS = oldest ? Math.max(1 / 60, state.simTime - oldest.t) : 0;
  const ax = oldest ? (finite(victim.vel.x) - oldest.vx) / spanS : 0;
  const az = oldest ? (finite(victim.vel.z) - oldest.vz) / spanS : 0;
  // Walk the intercept forward instead of trusting an angle read: the freed hull is a live
  // ship that brakes to recover (measured bleed ≈ SWING_CUT_HULL_DRAG), and the victim keeps
  // its measured acceleration. The cut only goes when the two trajectories actually meet —
  // the same call a hand makes watching the swing, just read off the numbers the sim owns.
  let hx = payload.pos.x, hz = payload.pos.z;
  let hvx = payload.vel.x, hvz = payload.vel.z;
  let vx = victim.pos.x, vz = victim.pos.z;
  let vvx = finite(victim.vel.x), vvz = finite(victim.vel.z);
  let best = Infinity;
  const stepS = 1 / 15, horizonS = Math.min(4, d / payV + 1.5);
  for (let t = stepS; t <= horizonS; t += stepS) {
    hx += hvx * stepS; hz += hvz * stepS;
    const bleed = Math.max(0, 1 - SWING_CUT_HULL_DRAG * stepS);
    hvx *= bleed; hvz *= bleed;
    vx += vvx * stepS; vz += vvz * stepS;
    vvx += ax * stepS; vvz += az * stepS;
    const sep = Math.hypot(vx - hx, vz - hz);
    if (sep < best) best = sep;
    else if (sep > best + 5) break;                      // past closest approach — done
  }
  if (best >= SWING_CUT_HIT_WU) return;
  st.tap = 4;                                            // ~0.07 s hold — under the cut floor
  inputSys._keys.KeyF = true;
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

export async function runProofGrabProbe(seed = 47, options = {}) {
  const probeTicks = Number.isFinite(options.ticks) ? options.ticks : 360;
  const host = await bootCeresPocket(seed, { pocketId: PROOF_AMBUSH_POCKET_ID });
  const { runtime, state, bus, player } = host;
  const driver = createInputTapeDriver(options.tape || buildProofInputTape());
  const denials = [];
  const latches = [];
  const off = [
    bus.on('tether:latchDenied', (p) => denials.push({ t: state.simTime, ...(p || {}) })),
    bus.on('tether:latched', (p) => latches.push({ t: state.simTime, targetId: p && p.targetId })),
  ];
  try {
    const inputSys = runtime.getSystem('input');
    let sawTetherFire = false;
    let sawKeyF = false;
    for (let i = 0; i < probeTicks; i++) {
      applyProofTapeTick(state, player, driver, inputSys, state.tick | 0);
      runtime.step(SIM_DT);
      if (inputSys && inputSys._keys && inputSys._keys.KeyF) sawKeyF = true;
      if (state.input && state.input.actions && state.input.actions.tetherFire) sawTetherFire = true;
    }
    const cargo = [];
    for (const entity of live(state)) {
      if (!isGrabCargoTarget(entity)) continue;
      cargo.push({
        id: entity.id,
        type: entity.type,
        kind: entity.data && entity.data.kind,
        commodityId: entity.data && entity.data.commodityId,
        dist: Number(dist(player.pos, entity.pos).toFixed(1)),
      });
    }
    const aimTarget = aimTargetForTick(state, player, 300);
    const latchTargets = latches.map((row) => {
      const entity = entityById(state, row.targetId);
      return {
        ...row,
        type: entity && entity.type,
        role: entity && roleOf(entity),
        kind: entity && entity.data && entity.data.kind,
        dist: entity ? Number(dist(player.pos, entity.pos).toFixed(1)) : null,
      };
    });
    return {
      seed,
      ticks: probeTicks,
      hasInputKeys: !!(inputSys && inputSys._keys),
      keyF: sawKeyF,
      tetherFire: sawTetherFire,
      aimIntentActive: !!(state.input && state.input.aimIntentActive),
      masslineLatch: !!(state.input && state.input.actions && state.input.actions.massline
        && state.input.actions.massline.latch),
      aimWorld: state.input && state.input.aimWorld,
      aimTargetId: aimTarget && aimTarget.id,
      aimTargetType: aimTarget && aimTarget.type,
      acquisitionId: state.masslineAcquisition && state.masslineAcquisition.selected
        && state.masslineAcquisition.selected.targetId,
      acquisitionType: state.masslineAcquisition && state.masslineAcquisition.selected
        && state.masslineAcquisition.selected.targetType,
      playerPos: { x: Number(player.pos.x.toFixed(1)), z: Number(player.pos.z.toFixed(1)) },
      cargo,
      latches: latchTargets,
      denials: denials.slice(0, 12),
      denialReasons: [...new Set(denials.map((row) => row.reason).filter(Boolean))],
    };
  } finally {
    for (const unsub of off) if (typeof unsub === 'function') unsub();
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

    const inputSys = runtime.getSystem('input');
    const limit = Math.min(windowTicks, hardCapTicks);
    for (let i = 0; i < limit; i++) {
      if (relocateAfterTicks != null && ticks === relocateAfterTicks && bootPocketId !== relocatePocketId) {
        relocatePlayerToPocket(runtime, player, relocatePocketId, 'proof:sixty_seconds:relocate');
      }
      applyProofTapeTick(state, player, driver, inputSys, state.tick | 0);
      runtime.step(SIM_DT);
      ticks += 1;
      if (typeof options.tickProbe === 'function') options.tickProbe(state, ticks, runtime);
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
  lines.push('PQ-141.01 proof.sixty_seconds — B12 beat table (receipts only, no NPC scripting)');
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
  const claim = elevenOfElevenClaim(runs);
  lines.push('');
  lines.push(`ALPHA GATE: ≥ ${PROOF_REQUIRED_BEATS} of 11 on each of ${runs.length} seeds; sim ≤ ${PROOF_HARD_CAP_S}s.`);
  lines.push(`Worst seed: ${worst}/11. Hard-cap honored: ${allCap ? 'yes' : 'NO'}.`);
  lines.push(`ALPHA RESULT: ${gate ? 'DONE' : 'NOT DONE'}`);
  if (!claim.allowed) {
    lines.push(`Do not claim 11/11: ${claim.dark} cell${claim.dark === 1 ? '' : 's'} remain dark.`);
  }
  lines.push('');
  lines.push(formatLeftoverRoutes(runs));
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
  const leftover = leftoverRoutes(runs);
  const late = listedBeatsOutsideWindow(runs);
  const worst = runs.reduce((m, r) => Math.min(m, r.detected), 11);
  const allCap = runs.every((r) => r.exceededHardCap !== true && r.simS <= PROOF_HARD_CAP_S);
  const claim = elevenOfElevenClaim(runs);
  return {
    scenarioId: PROOF_SCENARIO_ID,
    runs,
    table,
    markdownTable: formatBeatMarkdownTable(runs),
    leftover,
    late,
    worst,
    required: PROOF_REQUIRED_BEATS,
    gateMet: worst >= PROOF_REQUIRED_BEATS && allCap,
    claimElevenOfEleven: claim.allowed,
    leafDone: runs.length > 0 && leftover.cells.every((c) => c.owner) && late.length === 0,
  };
}

function launchedAsCli() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return resolve(invoked) === fileURLToPath(import.meta.url);
  } catch {
    return /proofSixtySeconds\.js$/i.test(invoked);
  }
}

function parseCliSeeds(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--seed' && argv[i + 1]) {
      out.push(Number(argv[++i]));
      continue;
    }
    if (token.startsWith('--seed=')) out.push(Number(token.slice('--seed='.length)));
  }
  return out.filter((n) => Number.isFinite(n));
}

export async function printProofBeatTableCli(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json');
  const seeds = parseCliSeeds(argv);
  if (seeds.length === 1) {
    const run = await runProofSixtySeconds(seeds[0]);
    if (asJson) process.stdout.write(`${JSON.stringify(run)}\n`);
    else process.stdout.write(`${formatBeatTable([run])}\n`);
    return run;
  }
  const suite = await runProofSixtySecondsSuite(seeds.length ? seeds : PROOF_SEEDS);
  if (asJson) {
    process.stdout.write(`${JSON.stringify({
      scenarioId: suite.scenarioId,
      worst: suite.worst,
      gateMet: suite.gateMet,
      claimElevenOfEleven: suite.claimElevenOfEleven,
      leafDone: suite.leafDone,
      leftover: suite.leftover,
      late: suite.late,
      markdownTable: suite.markdownTable,
      table: suite.table,
      runs: suite.runs,
    })}\n`);
  } else {
    process.stdout.write(`${suite.table}\n`);
  }
  return suite;
}

if (launchedAsCli()) {
  printProofBeatTableCli().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
