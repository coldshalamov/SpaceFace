// survivorPod.js — BP-01.1 salvage communicator + U09 causal eject loop.
//
// ── Stage-1 characterization (U09-CHARACTERIZE) — CUT ──────────────────────────────────────────
// Proposed verb: "pin a temporary anchor to any asteroid/heavy body; slingshot/tow from geometry
// that had no natural anchor." Live bench already delivers that decision surface:
//   • terrainAnchors — encounter-owned large rocks (r≥26) on telegraph; immovable + tether socket.
//   • tetherGameplay.isAttachable — physical command: any non-transient body is latchable
//     (asteroid/station/planet/wreck/ship/payload). massSeed gated only by frame-lock phase.
//   • massSeed (PQ-011) — player-deployed temporary static anchor with cooldown + lifetime.
//   • masslineThrow — slingshot/release assist on latched massive anchors.
//   • beacons — claim/lure marker (not a massline anchor); mines — hostile deployable pattern.
// Added "anchor beacon" decision is therefore MARGINAL vs massSeed + natural heavy bodies → CUT.
// Stage 2 lands here: causal survivor pods on crewed-hull death.
//
// ── Salvage communicator path (existing) ───────────────────────────────────────────────────────
// One salvage point per sector can promote to wm_survivor_pod. Rescue/strip via mission choice.
//
// ── Causal eject path (U09 Stage 2) ────────────────────────────────────────────────────────────
// Destroyed/disabled crewed ships may eject a tetherable survivor payload. Player can:
//   rescue — tow into lawful station protection, or hand to a traffic rescue hull;
//   ransom — tow fence-adjacent (blackmarket/pirate_base);
//   ignore — TTL expires with a moralMemory note.
// Credits are never minted here (single writer). Rescue reward is moralMemory + faction rep
// intent; ransom is moralMemory only. Spawn gated out of curated scenarios (salvor pattern).

import { spawnPayloadEntity } from '../combat/industrialBeam.js';
import { hash32 } from '../core/rng.js';
import { SECTORS } from '../data/sectors.js';
import { wreckMissionById } from '../data/wreckMissions.js';
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { rememberMoralDebt } from './moralMemory.js';

const MISSION_ID = 'wm_survivor_pod';
const CONCORD_FACTION_ID = 'faction_scn';
const OXYGEN_WINDOW_S = 210;
const OXYGEN_DECAY_WINDOW_S = 240;
const MIN_REWARD_MULTIPLIER = 0.45;
const RESCUE_DISTANCE_WU = 600;
const STRIP_POOL = Object.freeze({
  cmdty_salvage_electronics: 2,
  cmdty_medical: 1,
});
const STRIP_BASE_CREDITS = 260;
const STRIP_REP_DELTA = -8;

// ── Causal eject dials ─────────────────────────────────────────────────────────────────────────
export const CAUSAL_SURVIVOR_PAYLOAD_TYPE = 'survivor_pod';
/** Live concurrent physical pods (cap + TTL — same bounded-residency idea as civilian manifests). */
export const MAX_CAUSAL_SURVIVOR_PODS = 4;
/** Soft life of an unrescued pod before moralMemory abandon note + despawn. */
export const CAUSAL_POD_TTL_S = 180;
/** Deterministic eject chance (percent) from (seed, victim identity). */
export const CAUSAL_EJECT_CHANCE_PCT = 42;
/** Player must reel the pod this close for station/fence/rescue handoff. */
export const CAUSAL_HANDOFF_RANGE_WU = 90;
/** Ambient rescue hull auto-claims an unattended pod inside this radius. */
export const CAUSAL_RESCUE_HULL_CLAIM_WU = 70;
const CAUSAL_RESCUE_REP_DELTA = 3;
const CAUSAL_RECEIPT_CAP = 24;

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const ALL_STATIONS = [];
for (const sec of SECTORS) {
  for (const st of (sec.stations || [])) {
    ALL_STATIONS.push({ ...st, sectorId: sec.id });
  }
}

function ensureState(state) {
  if (!state) return null;
  if (!state.survivorPod || typeof state.survivorPod !== 'object') {
    state.survivorPod = freshState();
  }
  const own = state.survivorPod;
  if (!own.promotedBySector || typeof own.promotedBySector !== 'object') own.promotedBySector = {};
  if (!own.promotedByPoint || typeof own.promotedByPoint !== 'object') own.promotedByPoint = {};
  if (!own.causal || typeof own.causal !== 'object') own.causal = { byEntityId: {}, receipts: [] };
  if (!own.causal.byEntityId || typeof own.causal.byEntityId !== 'object') own.causal.byEntityId = {};
  if (!Array.isArray(own.causal.receipts)) own.causal.receipts = [];
  return own;
}

function freshState() {
  return {
    promotedBySector: {},
    promotedByPoint: {},
    causal: { byEntityId: {}, receipts: [] },
  };
}

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function entityForPoint(state, point) {
  if (!state || !point || point.entityId == null || !state.entities) return null;
  if (typeof state.entities.get === 'function') return state.entities.get(point.entityId) || null;
  return state.entities[point.entityId] || null;
}

function pointForRec(state, rec) {
  const points = state && state.salvage && Array.isArray(state.salvage.points) ? state.salvage.points : [];
  return points.find((p) => p && p.id === rec.salvagePointId) || null;
}

function choosePoint(seed, sectorId, candidates) {
  if (!candidates.length) return null;
  const ordered = candidates.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const idx = hash32(seed || 1, sectorId || '', 'survivorPodPoint') % ordered.length;
  return ordered[idx] || ordered[0];
}

function rescueStationForSector(sectorId) {
  const sec = SECTOR_BY_ID.get(sectorId);
  const local = (sec && sec.stations) || [];
  return local.find((s) => s.factionId === CONCORD_FACTION_ID)
    || local.find((s) => s.services && s.services.includes('missions'))
    || local[0]
    || ALL_STATIONS.find((s) => s.factionId === CONCORD_FACTION_ID)
    || ALL_STATIONS[0]
    || null;
}

function secondsLeft(state, rec) {
  return Math.max(0, Math.ceil((rec.oxygenDueAt || 0) - (state.simTime || 0)));
}

function rewardMultiplier(state, rec) {
  const overdue = Math.max(0, (state.simTime || 0) - (rec.oxygenDueAt || 0));
  if (overdue <= 0) return 1;
  const span = Math.max(1, rec.oxygenDecayWindow_s || OXYGEN_DECAY_WINDOW_S);
  const min = Math.max(0, Math.min(1, rec.minRewardMultiplier || MIN_REWARD_MULTIPLIER));
  return Math.max(min, 1 - (overdue / span) * (1 - min));
}

function countdownLabel(state, rec) {
  const left = secondsLeft(state, rec);
  if (left <= 0) return 'oxygen depleted - survivor stable, payout decaying';
  return `oxygen ${left}s`;
}

function publicMeta(state, rec) {
  const mult = rewardMultiplier(state, rec);
  const left = secondsLeft(state, rec);
  return {
    salvagePointId: rec.salvagePointId,
    entityId: rec.entityId,
    sectorId: rec.sectorId,
    destStationId: rec.destStationId,
    destSectorId: rec.destSectorId,
    factionId: rec.factionId,
    oxygenDueAt: rec.oxygenDueAt,
    oxygenRemaining_s: left,
    oxygenExpired: left <= 0,
    rewardMultiplier: mult,
    minRewardMultiplier: rec.minRewardMultiplier,
    stripPool: clone(rec.stripPool),
    stripCredits: rec.stripCredits,
    rescueSelected: !!rec.rescueSelected,
    stripped: !!rec.stripped,
    label: countdownLabel(state, rec),
  };
}

function mirrorMeta(state, rec, point, ent) {
  const meta = publicMeta(state, rec);
  rec.oxygenRemaining_s = meta.oxygenRemaining_s;
  rec.oxygenExpired = meta.oxygenExpired;
  rec.rewardMultiplier = meta.rewardMultiplier;
  if (point) point.survivorPod = { ...meta };
  if (ent && ent.data) {
    ent.data.survivorPod = { ...meta };
    ent.data.scanLabel = meta.oxygenExpired ? 'Survivor Pod - oxygen depleted' : `Survivor Pod - ${meta.label}`;
  }
  return meta;
}

function stripCreditsFor(seed, pointId) {
  return STRIP_BASE_CREDITS + (hash32(seed || 1, pointId || '', 'survivorPodStrip') % 90);
}

// ── Causal helpers ─────────────────────────────────────────────────────────────────────────────

/**
 * Curated scenario / golden gate — same idea as general salvors:
 * ambient death-eject never runs while a scenario contract is active, so 47a and authored scenes
 * keep their exact entity lists. Demand-driven only on the ordinary free-flight route.
 */
export function causalSurvivorPodsGatedOut(state) {
  if (!state) return true;
  const scenario = state.scenario;
  if (scenario && scenario.active) return true;
  if (scenario && typeof scenario.scenarioId === 'string' && scenario.scenarioId) return true;
  return false;
}

export function isCausalSurvivorPod(entity) {
  return !!(entity
    && entity.alive !== false
    && entity.type === 'payload'
    && entity.data
    && entity.data.payloadType === CAUSAL_SURVIVOR_PAYLOAD_TYPE);
}

export function isCrewedHullForPodEject(entity) {
  if (!entity || entity.type !== 'ship') return false;
  if (entity.alive === false) return false;
  const data = entity.data || {};
  if (data.uncrewed === true || data.drone === true || data.isWingman === true) return false;
  if (data.echoOfPlayer === true) return false;
  if (data.scenarioActorId) return false;
  return true;
}

/** Deterministic eject roll — pure; does not touch state.rng. */
export function shouldEjectCausalSurvivorPod(state, victim) {
  if (!victim || victim.id == null) return false;
  const seed = (state && state.meta && state.meta.seed) || 1;
  const identity = victim.data && (victim.data.worldRecordId || victim.data.predationIdentityKey || '');
  const roll = hash32(seed, victim.id, identity, 'causalSurvivorEject') % 100;
  return roll < CAUSAL_EJECT_CHANCE_PCT;
}

export function countLiveCausalSurvivorPods(state) {
  let n = 0;
  const list = state && state.entityList;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      if (isCausalSurvivorPod(list[i])) n += 1;
    }
    return n;
  }
  if (state && state.entities && typeof state.entities.values === 'function') {
    for (const e of state.entities.values()) {
      if (isCausalSurvivorPod(e)) n += 1;
    }
  }
  return n;
}

function disposeEntity(state, bus, entity, reason) {
  if (!entity) return;
  entity.alive = false;
  if (state.entities && typeof state.entities.delete === 'function') {
    state.entities.delete(entity.id);
  }
  if (Array.isArray(state.entityList)) {
    const idx = state.entityList.indexOf(entity);
    if (idx >= 0) state.entityList.splice(idx, 1);
  }
  if (bus && typeof bus.emit === 'function') {
    bus.emit('entity:destroyed', { id: entity.id, type: entity.type, reason });
  }
}

export function enforceCausalSurvivorPodCap(state, bus, max = MAX_CAUSAL_SURVIVOR_PODS) {
  if (!state || !Number.isFinite(max) || max < 0) return 0;
  const found = [];
  const list = state.entityList;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      if (isCausalSurvivorPod(list[i])) found.push(list[i]);
    }
  } else if (state.entities && typeof state.entities.values === 'function') {
    for (const entity of state.entities.values()) {
      if (isCausalSurvivorPod(entity)) found.push(entity);
    }
  }
  if (found.length <= max) return 0;
  found.sort((a, b) => (a.id | 0) - (b.id | 0));
  const drop = found.length - max;
  let removed = 0;
  for (let i = 0; i < drop; i++) {
    disposeEntity(state, bus, found[i], 'survivor_pod_cap');
    removed += 1;
  }
  return removed;
}

function isFenceStation(station) {
  if (!station) return false;
  const data = station.data || {};
  const type = data.stationType || data.type || station.stationType || station.type;
  return type === 'blackmarket' || type === 'pirate_base';
}

function fenceStationAt(state, entity) {
  if (!state || !entity || !entity.pos) return null;
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const station = list[i];
    if (!station || station.alive === false || station.type !== 'station' || !station.pos) continue;
    if (!isFenceStation(station)) continue;
    const dx = entity.pos.x - station.pos.x;
    const dz = entity.pos.z - station.pos.z;
    const radius = Math.max(CAUSAL_HANDOFF_RANGE_WU, Number(station.radius) || 40) + CAUSAL_HANDOFF_RANGE_WU;
    if (dx * dx + dz * dz <= radius * radius) {
      return {
        stationId: String(station.data && station.data.stationId || station.stationId || station.id),
        entityId: station.id,
        factionId: station.factionId || (station.data && station.data.factionId) || null,
      };
    }
  }
  return null;
}

function playerLatchedTo(state, targetId) {
  const tether = state && state.player && state.player.tether;
  return !!(tether && tether.active === true && tether.targetId === targetId);
}

function distance2(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return dx * dx + dz * dz;
}

function findRescueHullNear(state, pos, radius) {
  if (!state || !pos) return null;
  const r2 = radius * radius;
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.alive === false || e.type !== 'ship' || !e.pos) continue;
    if (e.id === state.playerId) continue;
    const data = e.data || {};
    const role = data.trafficRole || data.role;
    if (role !== 'rescue') continue;
    if (distance2(e.pos, pos) <= r2) return e;
  }
  return null;
}

function causalPublic(entity, rec) {
  return {
    entityId: entity && entity.id,
    victimId: rec && rec.victimId,
    sectorId: rec && rec.sectorId,
    factionId: rec && rec.factionId,
    expireAt: rec && rec.expireAt,
    phase: rec && rec.phase,
    playerOccupied: rec && rec.playerOccupied === true,
    lossId: rec && rec.lossId || null,
    sourceMarkerId: rec && rec.sourceMarkerId || null,
    rescueAuthorized: rec && rec.rescueAuthorized === true,
    source: rec && rec.source
      || (rec && rec.playerOccupied === true ? 'player_defeat' : 'causal_eject'),
  };
}

export const survivorPod = {
  name: 'survivorPod',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    ensureState(this._state);
    this._onPlaced = (p) => this._promoteSector(p && p.sectorId);
    this._onSectorEnter = (p) => this._promoteSector(p && p.sectorId);
    this._onMissionOffered = (offer) => this._stampOffer(offer);
    this._onChoice = (p) => this._handleChoice(p);
    this._onNewGame = () => this.newGame();
    this._onKilled = (p) => this._onEntityKilled(p || {});
    this._onLatched = (p) => this._onTetherLatched(p || {});
    if (this._bus && this._bus.on) {
      this._bus.on('salvage:placed', this._onPlaced);
      this._bus.on('sector:enter', this._onSectorEnter);
      this._bus.on('mission:offered', this._onMissionOffered);
      this._bus.on('survivorPod:choose', this._onChoice);
      this._bus.on('game:newGame', this._onNewGame);
      this._bus.on('game:new', this._onNewGame);
      this._bus.on('save:loaded', this._onNewGame);
      this._bus.on('entity:killed', this._onKilled);
      this._bus.on('tether:latched', this._onLatched);
    }
  },

  newGame() {
    if (this._state) this._state.survivorPod = freshState();
  },

  update(_dt, state) {
    const own = ensureState(state);
    if (!own) return;
    const currentSectorId = state.world && state.world.currentSectorId;
    let visible = null;
    for (const rec of Object.values(own.promotedByPoint)) {
      if (!rec || rec.stripped) continue;
      const point = pointForRec(state, rec);
      const ent = entityForPoint(state, point || rec);
      const meta = mirrorMeta(state, rec, point, ent);
      if (!visible && rec.sectorId === currentSectorId) visible = meta;
    }
    if (!state.ui) state.ui = {};
    if (visible) state.ui.survivorPod = visible;
    else if (state.ui.survivorPod && state.ui.survivorPod.salvagePointId) state.ui.survivorPod = null;

    // Causal path: re-adopt + settle + TTL.
    this._tickCausal(state, own);
  },

  /** Transform the canonical player entity into the survival pod instead of spawning a spectator
   * prop. state.playerId therefore remains the body followed by the camera, physics and save route;
   * the inherited ship velocity becomes a visibly drifting, low-mass Rapier payload. */
  convertPlayerToPod(entity, { lossId, receipt } = {}) {
    const state = this._state;
    if (!state || !entity || entity.id !== state.playerId || !lossId || entity.type !== 'ship') return null;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const vx = Number(entity.vel && entity.vel.x) || 0;
    const vz = Number(entity.vel && entity.vel.z) || 0;
    const speed = Math.hypot(vx, vz);
    const angleSeed = hash32((state.meta && state.meta.seed) || 1, lossId, receipt && receipt.tick || 0, 'playerPodDrift');
    const angle = (angleSeed / 0x100000000) * Math.PI * 2;
    const driftSpeed = Math.max(12, speed * 0.22);
    const dirX = speed > 1e-4 ? vx / speed : Math.cos(angle);
    const dirZ = speed > 1e-4 ? vz / speed : Math.sin(angle);
    entity.type = 'payload';
    entity.alive = true;
    entity.collides = true;
    entity.radius = 5;
    entity.mass = 24;
    entity.hull = 40;
    entity.hullMax = 40;
    entity.armorHp = 0;
    entity.armorMax = 0;
    entity.shield = 0;
    entity.shieldMax = 0;
    entity.cap = 0;
    entity.capMax = 0;
    entity.vel.x = dirX * driftSpeed;
    entity.vel.z = dirZ * driftSpeed;
    entity.intent = null;
    entity.flightModel = null;
    entity.physicsBody = {
      dynamic: true,
      ccd: true,
      radius: 5,
      mass: 24,
      inertiaY: 300,
      material: 'payload',
      shape: 'ball',
    };
    entity.flags = Object.assign({}, entity.flags, { persistent: true, defeated: true });
    const sectorId = state.world && state.world.currentSectorId || null;
    const rec = {
      entityId: entity.id,
      victimId: entity.id,
      sectorId,
      factionId: 'player',
      memoryId: `player-pod:${lossId}`,
      lossId,
      playerOccupied: true,
      rescueAuthorized: false,
      phase: 'adrift',
      ejectedAt: now,
      expireAt: null,
      resolved: false,
    };
    entity.data = {
      kind: 'payload',
      payloadType: CAUSAL_SURVIVOR_PAYLOAD_TYPE,
      ownerId: entity.id,
      factionId: 'player',
      ownership: { ownerId: entity.id, factionId: 'player' },
      transientSector: false,
      sourceVictimId: entity.id,
      survivorPodCausal: { ...rec },
      tetherRole: 'survivor_pod',
      scanLabel: 'Your Survival Pod',
      masslineTetherable: true,
      playerOccupied: true,
      lossId,
    };
    const own = ensureState(state);
    own.causal.byEntityId[entity.id] = rec;
    if (this._bus && typeof this._bus.emit === 'function') {
      this._bus.emit('survivorPod:ejected', causalPublic(entity, rec));
      this._bus.emit('playerDefeat:podDrifting', {
        lossId,
        entityId: entity.id,
        pos: { x: entity.pos.x, z: entity.pos.z },
        vel: { x: entity.vel.x, z: entity.vel.z },
      });
    }
    return entity;
  },

  // ── Causal eject ─────────────────────────────────────────────────────────────────────────────

  spawnFromColdDerelict({ markerId, wreck, victimId = null, factionId = null } = {}) {
    const state = this._state;
    if (!state || !markerId || !wreck || wreck.alive === false || wreck.type !== 'wreck'
      || !wreck.data || wreck.data.markerId !== markerId) return null;
    const existing = (state.entityList || []).find((entity) => isCausalSurvivorPod(entity)
      && entity.data && entity.data.survivorPodCausal
      && entity.data.survivorPodCausal.sourceMarkerId === markerId);
    if (existing) return existing;

    const angleHash = hash32((state.meta && state.meta.seed) || 1, markerId, 'coldDerelictPodHatch');
    const angle = (angleHash / 0x100000000) * Math.PI * 2;
    const clearance = Math.max(8, Number(wreck.radius) || 9);
    const source = {
      id: victimId == null ? wreck.id : victimId,
      type: 'ship',
      pos: {
        x: (Number(wreck.pos && wreck.pos.x) || 0) + Math.cos(angle) * clearance,
        z: (Number(wreck.pos && wreck.pos.z) || 0) + Math.sin(angle) * clearance,
      },
      vel: {
        x: (Number(wreck.vel && wreck.vel.x) || 0) + Math.cos(angle) * 8,
        z: (Number(wreck.vel && wreck.vel.z) || 0) + Math.sin(angle) * 8,
      },
      factionId: factionId || wreck.factionId || (wreck.data && wreck.data.factionId) || 'neutral',
      data: { worldRecordId: markerId },
    };
    return this._spawnCausalPod(state, source, { pos: source.pos, vel: source.vel }, {
      source: 'cold_derelict_boarding',
      sourceMarkerId: markerId,
      memoryId: `survivor:wreck:${markerId}`,
    });
  },

  _onEntityKilled(payload) {
    const state = this._state;
    if (!state || causalSurvivorPodsGatedOut(state)) return null;
    if (state.mode && state.mode !== 'flight') return null;
    const id = payload && payload.id;
    if (id == null || id === state.playerId) return null;
    const victim = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(id)
      : null;
    // Prefer live entity; fall back to payload snapshot for same-tick disposal.
    const hull = victim || {
      id,
      type: payload.type,
      pos: payload.pos,
      vel: payload.vel,
      data: payload.data || {},
      factionId: payload.factionId,
      alive: false,
    };
    if (hull.type !== 'ship' && payload.type !== 'ship') return null;
    if (!isCrewedHullForPodEject({ ...hull, type: 'ship', alive: true })) return null;
    if (victim && victim.data && victim.data.survivorPodEjected === true) return null;
    if (payload.data && payload.data.survivorPodEjected === true) return null;
    if (!shouldEjectCausalSurvivorPod(state, hull)) return null;
    return this._spawnCausalPod(state, hull, payload);
  },

  _spawnCausalPod(state, victim, payload, options = {}) {
    const pos = (victim && victim.pos) || (payload && payload.pos);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    if (victim && victim.data) victim.data.survivorPodEjected = true;

    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const velSrc = (victim && victim.vel) || (payload && payload.vel) || { x: 0, z: 0 };
    const vel = {
      x: Number.isFinite(velSrc.x) ? velSrc.x * 0.2 : 0,
      z: Number.isFinite(velSrc.z) ? velSrc.z * 0.2 : 0,
    };
    const factionId = victim.factionId
      || (victim.data && victim.data.factionId)
      || 'neutral';
    const sectorId = state.world && state.world.currentSectorId || null;
    const memoryId = options.memoryId
      || `survivor:${victim.id}:${hash32((state.meta && state.meta.seed) || 1, victim.id, 'podId').toString(36)}`;

    const entity = spawnPayloadEntity(state, {
      pos: { x: pos.x, z: pos.z },
      vel,
      radius: 5,
      mass: 24,
      hull: 40,
      hullMax: 40,
      ownerId: null,
      factionId,
      salvagePool: {},
      payloadType: CAUSAL_SURVIVOR_PAYLOAD_TYPE,
      worldRecordId: null,
      transientSector: false,
    });
    entity.flags = Object.assign({}, entity.flags, { persistent: true });
    const rec = {
      entityId: entity.id,
      victimId: victim.id,
      sectorId,
      factionId,
      memoryId,
      source: options.source || 'causal_eject',
      sourceMarkerId: options.sourceMarkerId || null,
      phase: 'adrift',
      ejectedAt: now,
      expireAt: now + CAUSAL_POD_TTL_S,
      resolved: false,
    };
    entity.data.sourceVictimId = victim.id;
    entity.data.sourceMarkerId = options.sourceMarkerId || null;
    entity.data.survivorPodCausal = { ...rec };
    entity.data.tetherRole = 'survivor_pod';
    entity.data.scanLabel = 'Survivor Pod';
    entity.data.masslineTetherable = true;

    const own = ensureState(state);
    own.causal.byEntityId[entity.id] = rec;
    enforceCausalSurvivorPodCap(state, this._bus, MAX_CAUSAL_SURVIVOR_PODS);
    // Cap may have disposed this entity if we were over; drop stale record.
    if (entity.alive === false) {
      delete own.causal.byEntityId[entity.id];
      return null;
    }
    if (this._bus && typeof this._bus.emit === 'function') {
      this._bus.emit('survivorPod:ejected', causalPublic(entity, rec));
    }
    return entity;
  },

  _tickCausal(state, own) {
    if (!own || !own.causal) return;
    // Re-adopt pods restored via flags.persistent after save:loaded wiped coordinator state.
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (!isCausalSurvivorPod(entity)) continue;
      const stamp = entity.data && entity.data.survivorPodCausal;
      if (!stamp || stamp.resolved) continue;
      if (!own.causal.byEntityId[entity.id]) {
        own.causal.byEntityId[entity.id] = {
          entityId: entity.id,
          victimId: stamp.victimId,
          sectorId: stamp.sectorId || (state.world && state.world.currentSectorId) || null,
          factionId: stamp.factionId || entity.factionId || 'neutral',
          memoryId: stamp.memoryId || `survivor:${entity.id}`,
          source: stamp.source || (stamp.playerOccupied === true ? 'player_defeat' : 'causal_eject'),
          sourceMarkerId: stamp.sourceMarkerId || null,
          lossId: stamp.lossId || null,
          playerOccupied: stamp.playerOccupied === true,
          rescueAuthorized: stamp.rescueAuthorized === true,
          phase: stamp.phase || 'adrift',
          ejectedAt: stamp.ejectedAt || 0,
          expireAt: stamp.playerOccupied === true
            ? null
            : (stamp.expireAt || ((Number(state.simTime) || 0) + CAUSAL_POD_TTL_S)),
          resolved: false,
        };
      }
    }

    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const player = state.entities && state.entities.get
      ? state.entities.get(state.playerId)
      : null;

    for (const id of Object.keys(own.causal.byEntityId)) {
      const rec = own.causal.byEntityId[id];
      if (!rec || rec.resolved) {
        delete own.causal.byEntityId[id];
        continue;
      }
      const entity = state.entities && state.entities.get
        ? state.entities.get(Number(id) === Number(id) ? Number(id) : id) || state.entities.get(id)
        : null;
      if (!entity || entity.alive === false || !isCausalSurvivorPod(entity)) {
        delete own.causal.byEntityId[id];
        continue;
      }
      // Keep entity annotation in sync for save/Continue.
      entity.data.survivorPodCausal = { ...rec, entityId: entity.id };

      if (rec.playerOccupied !== true && Number.isFinite(rec.expireAt) && now >= rec.expireAt) {
        this._resolveCausal(state, own, rec, entity, 'abandoned', {
          reason: 'ttl_expired',
        });
        continue;
      }

      // Ambient rescue hull claim (unattended pod).
      const rescuer = rec.playerOccupied === true && rec.rescueAuthorized !== true
        ? null
        : findRescueHullNear(state, entity.pos, CAUSAL_RESCUE_HULL_CLAIM_WU);
      if (rescuer && !playerLatchedTo(state, entity.id)) {
        this._resolveCausal(state, own, rec, entity, 'rescued', {
          reason: 'rescue_hull',
          rescueHullId: rescuer.id,
          stationId: null,
        });
        continue;
      }

      // Player must be latched for handoff decisions (tow agency).
      if (!player || !playerLatchedTo(state, entity.id)) continue;
      if (distance2(player.pos, entity.pos) > CAUSAL_HANDOFF_RANGE_WU * CAUSAL_HANDOFF_RANGE_WU) {
        continue;
      }

      // Hand to nearby rescue hull while latched.
      const handoffHull = findRescueHullNear(state, entity.pos, CAUSAL_HANDOFF_RANGE_WU);
      if (handoffHull) {
        this._resolveCausal(state, own, rec, entity, 'rescued', {
          reason: 'player_handoff_rescue_hull',
          rescueHullId: handoffHull.id,
          stationId: null,
        });
        continue;
      }

      // Lawful station custody (same protection bubble as nonlethal recovery).
      const jurisdiction = protectedStationAt(state, entity) || protectedStationAt(state, player);
      if (jurisdiction) {
        this._resolveCausal(state, own, rec, entity, 'rescued', {
          reason: 'station_delivery',
          stationId: jurisdiction.stationId,
          authorityFactionId: jurisdiction.factionId || CONCORD_FACTION_ID,
        });
        continue;
      }

      // Fence-adjacent ransom.
      const fence = fenceStationAt(state, entity) || fenceStationAt(state, player);
      if (fence) {
        this._resolveCausal(state, own, rec, entity, 'ransomed', {
          reason: 'fence_delivery',
          stationId: fence.stationId,
          authorityFactionId: fence.factionId,
        });
      }
    }
  },

  _onTetherLatched(payload) {
    // Immediate settle attempt on the same tick as latch if already in a bubble.
    const state = this._state;
    if (!state || !payload || payload.targetId == null) return;
    const own = ensureState(state);
    if (!own) return;
    this._tickCausal(state, own);
  },

  _resolveCausal(state, own, rec, entity, outcome, detail = {}) {
    if (!rec || rec.resolved) return false;
    rec.resolved = true;
    rec.phase = outcome;
    rec.resolvedAt = Number.isFinite(state.simTime) ? state.simTime : 0;
    const receipt = {
      id: rec.memoryId || `survivor:${entity && entity.id}`,
      outcome,
      entityId: entity && entity.id,
      victimId: rec.victimId,
      sectorId: rec.sectorId,
      source: rec.source || (rec.playerOccupied === true ? 'player_defeat' : 'causal_eject'),
      sourceMarkerId: rec.sourceMarkerId || null,
      t: rec.resolvedAt,
      ...detail,
    };
    own.causal.receipts.push(receipt);
    if (own.causal.receipts.length > CAUSAL_RECEIPT_CAP) {
      own.causal.receipts.splice(0, own.causal.receipts.length - CAUSAL_RECEIPT_CAP);
    }
    delete own.causal.byEntityId[entity.id];

    if (rec.playerOccupied === true) {
      entity.data.survivorPodCausal = { ...rec, entityId: entity.id };
      if (this._bus && typeof this._bus.emit === 'function') {
        this._bus.emit('survivorPod:resolved', { ...receipt, playerOccupied: true, lossId: rec.lossId });
        this._bus.emit('playerDefeat:podRescued', {
          ...receipt,
          playerOccupied: true,
          lossId: rec.lossId,
        });
      }
      return true;
    }

    // moralMemory is the durable world memory; credits stay with economy (never written here).
    const cause = outcome === 'rescued'
      ? 'rescued_survivors'
      : outcome === 'ransomed'
        ? 'ransomed_survivors'
        : 'abandoned_survivors';
    rememberMoralDebt(state, {
      id: rec.memoryId || `survivor:${entity.id}`,
      name: 'Survivor Pod',
      cause,
      factionId: rec.factionId || CONCORD_FACTION_ID,
      archetype: 'survivor_pod',
      t: rec.resolvedAt,
      source: `survivorPod:${outcome}`,
    });

    if (outcome === 'rescued' && this._bus && typeof this._bus.emit === 'function') {
      const factionId = detail.authorityFactionId || CONCORD_FACTION_ID;
      this._bus.emit('faction:repDelta', {
        factionId,
        delta: CAUSAL_RESCUE_REP_DELTA,
        reason: 'survivorPod:rescued',
        entityId: entity.id,
        victimId: rec.victimId,
      });
    }

    if (this._bus && typeof this._bus.emit === 'function') {
      this._bus.emit(`survivorPod:${outcome}`, { ...receipt });
      this._bus.emit('survivorPod:resolved', { ...receipt });
    }

    disposeEntity(state, this._bus, entity, `survivor_pod_${outcome}`);
    return true;
  },

  // ── Salvage communicator path (unchanged ownership) ──────────────────────────────────────────

  _promoteSector(sectorId) {
    const state = this._state;
    if (!state || !sectorId) return null;
    const own = ensureState(state);
    const existing = own.promotedBySector[sectorId];
    if (existing && own.promotedByPoint[existing.salvagePointId]) return existing;

    const points = state.salvage && Array.isArray(state.salvage.points) ? state.salvage.points : [];
    const eligible = points.filter((p) => {
      if (!p || p.sectorId !== sectorId || p.offered || p.survivorPod || p.lossInvestigation) return false;
      return !!entityForPoint(state, p);
    });
    const preferred = eligible.filter((p) => !p.isCommunicator && !p.wreckMissionId);
    const point = choosePoint(state.meta && state.meta.seed, sectorId, preferred.length ? preferred : eligible);
    if (!point) return null;

    const dest = rescueStationForSector(sectorId);
    const startedAt = state.simTime || 0;
    const rec = {
      salvagePointId: point.id,
      entityId: point.entityId == null ? null : point.entityId,
      sectorId,
      zoneId: point.zoneId || null,
      wreckMissionId: MISSION_ID,
      factionId: CONCORD_FACTION_ID,
      destStationId: dest ? dest.id : null,
      destSectorId: dest ? dest.sectorId : sectorId,
      oxygenStartedAt: startedAt,
      oxygenDueAt: startedAt + OXYGEN_WINDOW_S,
      oxygenDecayWindow_s: OXYGEN_DECAY_WINDOW_S,
      minRewardMultiplier: MIN_REWARD_MULTIPLIER,
      rewardMultiplier: 1,
      stripPool: clone(STRIP_POOL),
      stripCredits: stripCreditsFor(state.meta && state.meta.seed, point.id),
      rescueSelected: false,
      stripped: false,
    };

    point.isCommunicator = true;
    point.wreckMissionId = MISSION_ID;
    point.survivorPod = publicMeta(state, rec);

    const ent = entityForPoint(state, point);
    if (ent && ent.data) {
      ent.data.parentType = 'survivor_pod';
      ent.data.isCommunicator = true;
      ent.data.wreckMissionId = MISSION_ID;
      ent.data.salvagePointId = point.id;
      ent.data.salvagePool = clone(STRIP_POOL);
      ent.data.tetherRole = 'survivor_pod';
      ent.data.survivorPod = { ...point.survivorPod };
      ent.data.scanLabel = `Survivor Pod - ${countdownLabel(state, rec)}`;
    }

    own.promotedBySector[sectorId] = rec;
    own.promotedByPoint[point.id] = rec;
    if (this._bus && this._bus.emit) {
      this._bus.emit('survivorPod:promoted', { ...publicMeta(state, rec), zoneId: point.zoneId || null });
    }
    return rec;
  },

  _stampOffer(offer) {
    const state = this._state;
    if (!state || !offer || offer.source !== 'salvage' || !offer.salvagePointId) return;
    const own = ensureState(state);
    const rec = own.promotedByPoint[offer.salvagePointId];
    if (!rec || rec.stripped) return;
    const template = wreckMissionById(MISSION_ID);
    if (!template) return;

    const point = pointForRec(state, rec);
    const ent = entityForPoint(state, point || rec);
    const meta = mirrorMeta(state, rec, point, ent);
    const reward = Math.max(
      Math.round((template.reward_cr || 0) * meta.minRewardMultiplier),
      Math.round((template.reward_cr || 0) * meta.rewardMultiplier),
    );

    offer.id = offer.id || offer.offerId || `survivor_${rec.salvagePointId}`;
    offer.offerId = offer.offerId || offer.id;
    offer.wreckMissionId = MISSION_ID;
    offer.type = 'passenger_transport';
    offer.title = template.title;
    offer.giver = template.giver;
    offer.log = template.log;
    offer.summary = `${template.summary} ${meta.label}.`;
    offer.reward_cr = reward;
    offer.collateral_cr = 0;
    offer.riskTier = offer.riskTier == null ? 1 : offer.riskTier;
    offer.time_limit_s = offer.time_limit_s || (meta.oxygenRemaining_s + 300);
    offer.choice = clone(template.choice);
    offer.tag = template.tag || 'wreck_salvage';
    offer.factionId = CONCORD_FACTION_ID;
    offer.stationId = offer.stationId || null;
    offer.destStationId = rec.destStationId;
    offer.destSectorId = rec.destSectorId || rec.sectorId;
    offer.distance = offer.distance || RESCUE_DISTANCE_WU;
    offer.params = {
      cmdtyId: null,
      qty: 1,
      cargoValue: 0,
      fValue: 1,
      taskTime: 20,
      passengers: 1,
      survivorPodId: rec.salvagePointId,
    };
    offer.survivorPod = {
      ...meta,
      oxygenCountdownLabel: meta.label,
      rescueRoute: {
        type: 'passenger_transport',
        factionId: CONCORD_FACTION_ID,
        destStationId: rec.destStationId,
        destSectorId: rec.destSectorId || rec.sectorId,
      },
      stripRoute: {
        credits: rec.stripCredits,
        repDelta: STRIP_REP_DELTA,
        salvagePool: clone(rec.stripPool),
      },
    };
  },

  _handleChoice(payload) {
    if (!payload) return false;
    const state = this._state;
    const own = ensureState(state);
    const point = this._pointFromChoice(payload);
    if (!point || !point.survivorPod) return false;
    const rec = own.promotedByPoint[point.id];
    if (!rec || rec.stripped) return false;
    const optionId = payload.optionId || payload.choiceId || payload.id;
    if (optionId === 'rescue') return this._chooseRescue(point, rec);
    if (optionId === 'strip') return this._chooseStrip(point, rec);
    return false;
  },

  _pointFromChoice(payload) {
    const state = this._state;
    const points = state && state.salvage && Array.isArray(state.salvage.points) ? state.salvage.points : [];
    if (payload.salvagePointId) return points.find((p) => p && p.id === payload.salvagePointId) || null;
    if (payload.entityId != null) return points.find((p) => p && p.entityId === payload.entityId) || null;
    return null;
  },

  _chooseRescue(point, rec) {
    const state = this._state;
    const tether = state && state.player && state.player.tether;
    if (!tether || tether.active !== true || tether.targetId !== point.entityId) {
      if (this._bus && this._bus.emit) {
        this._bus.emit('survivorPod:rescueBlocked', {
          salvagePointId: point.id,
          entityId: point.entityId,
          reason: 'tow_required',
        });
      }
      return false;
    }
    rec.rescueSelected = true;
    const ent = entityForPoint(state, point);
    const meta = mirrorMeta(state, rec, point, ent);
    if (this._bus && this._bus.emit) {
      this._bus.emit('survivorPod:rescueSelected', {
        ...meta,
        missionType: 'passenger_transport',
        factionId: CONCORD_FACTION_ID,
        destStationId: rec.destStationId,
        destSectorId: rec.destSectorId || rec.sectorId,
      });
    }
    return true;
  },

  _chooseStrip(point, rec) {
    const state = this._state;
    rec.stripped = true;
    rec.rescueSelected = false;
    point.offered = true;
    const ent = entityForPoint(state, point);
    if (ent) {
      ent.alive = false;
      if (ent.data) {
        ent.data.survivorPod = { ...publicMeta(state, rec), stripped: true };
        ent.data.salvagePool = clone(rec.stripPool);
      }
    }
    point.survivorPod = { ...publicMeta(state, rec), stripped: true };

    if (this._bus && this._bus.emit) {
      this._bus.emit('economy:grantCredits', {
        amount: rec.stripCredits,
        reason: 'survivorPod:strip',
        salvagePointId: point.id,
        salvagePool: clone(rec.stripPool),
      });
      this._bus.emit('faction:repDelta', {
        factionId: CONCORD_FACTION_ID,
        delta: STRIP_REP_DELTA,
        reason: 'survivorPod:strip',
        salvagePointId: point.id,
      });
      this._bus.emit('survivorPod:stripped', {
        salvagePointId: point.id,
        entityId: point.entityId,
        amount: rec.stripCredits,
        salvagePool: clone(rec.stripPool),
        factionId: CONCORD_FACTION_ID,
        repDelta: STRIP_REP_DELTA,
      });
    }
    return true;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onPlaced) this._bus.off('salvage:placed', this._onPlaced);
      if (this._onSectorEnter) this._bus.off('sector:enter', this._onSectorEnter);
      if (this._onMissionOffered) this._bus.off('mission:offered', this._onMissionOffered);
      if (this._onChoice) this._bus.off('survivorPod:choose', this._onChoice);
      if (this._onNewGame) {
        this._bus.off('game:newGame', this._onNewGame);
        this._bus.off('game:new', this._onNewGame);
        this._bus.off('save:loaded', this._onNewGame);
      }
      if (this._onKilled) this._bus.off('entity:killed', this._onKilled);
      if (this._onLatched) this._bus.off('tether:latched', this._onLatched);
    }
    this._onPlaced = null;
    this._onSectorEnter = null;
    this._onMissionOffered = null;
    this._onChoice = null;
    this._onNewGame = null;
    this._onKilled = null;
    this._onLatched = null;
  },
};

export default survivorPod;
