// aftermathWrecks.js - BP-01/C11 Battle-Aftermath Persistence.
//
// Event-sourced battle residue. Live `entity:killed` events inside named sector zones become
// bounded, durable aftermath markers. On sector entry those markers materialize as ordinary wreck
// entities so the shipped scanner/mining/salvage-action paths can read them without combat,
// salvage, or sectorSim edits.

import { hash32 } from '../core/rng.js';
import { zoneAt, zoneThreat } from '../data/sectorZones.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { wreckClassById } from '../data/wreckClasses.js';
import { SECTORS } from '../data/sectors.js';
import {
  causalAftermath,
  causeContractOffer,
  normalizeCausalAftermath,
} from '../world/encounterCausality.js';

const STATE_VERSION = 3;
const MAX_PER_SECTOR = 8;
const MAX_SPAWNED_PER_SECTOR = 6;
const MAX_CAUSES = 24;
const MAX_WRECK_DRIFT_SPEED = 400;
const MAX_WRECK_TUMBLE = 3.0;
const WRECK_RADIUS = 9;
// Same 10-sim-minute day as coreSystem / sectorSim / encounterDirector. Wreck fields age on
// this clock, never wall time. Ecology is a finite budget that decays — never a respawn loop.
export const WRECK_ECOLOGY_DAY_S = 600;
export const WRECK_ECOLOGY_BUDGET = 2;
export const WRECK_ECOLOGY_DECAY_S = WRECK_ECOLOGY_DAY_S * 4;
export const PLAYER_WRECK_KIND = 'player_wreck';
export const PLAYER_WRECK_ENCOUNTER_ID = 'scavengers_fresh_wreck';
const ECOLOGY_SCAVENGER_ARCHETYPES = Object.freeze(['wasp_swarmer', 'reaver_pirate']);
const ECOLOGY_ROLES = Object.freeze(['scavenger', 'squatter', 'trap']);
const WRECK_SALVAGE_TIME = 8;
const FREIGHT_IDENTITY_TEXT_MAX = 160;
const STRUCTURE_PATCH_RANGE_WU = 2400;
const SHIPLIKE_TYPES = new Set(['ship', 'drone']);
const DEFAULT_POOL = Object.freeze({ cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 });
const STATION_INFO = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_INFO.set(station.id, {
      id: station.id,
      factionId: station.factionId || sector.factionId || null,
      sectorId: sector.id,
    });
  }
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function ensureAftermathState(state) {
  if (!state) return null;
  if (!state.aftermathWrecks || typeof state.aftermathWrecks !== 'object') {
    state.aftermathWrecks = { schemaVersion: STATE_VERSION, bySector: {}, causes: {}, ecology: {}, seed: seedOf(state) };
  }
  const own = state.aftermathWrecks;
  own.schemaVersion = STATE_VERSION;
  if (!own.bySector || typeof own.bySector !== 'object' || Array.isArray(own.bySector)) own.bySector = {};
  if (!own.causes || typeof own.causes !== 'object' || Array.isArray(own.causes)) own.causes = {};
  if (!own.ecology || typeof own.ecology !== 'object' || Array.isArray(own.ecology)) own.ecology = {};
  if (typeof own.seed !== 'number') own.seed = seedOf(state);
  return own;
}

export function aftermathForSector(state, sectorId) {
  const own = ensureAftermathState(state);
  if (!own || !sectorId || !Array.isArray(own.bySector[sectorId])) return [];
  return own.bySector[sectorId].slice();
}

export function isPlayerWreckMarker(marker) {
  return !!(marker && (marker.playerWreck === true || marker.kind === PLAYER_WRECK_KIND));
}

export function playerWreckMarker(state) {
  const own = ensureAftermathState(state);
  if (!own) return null;
  const sectorIds = Object.keys(own.bySector);
  for (let i = 0; i < sectorIds.length; i++) {
    const list = own.bySector[sectorIds[i]];
    if (!Array.isArray(list)) continue;
    for (let j = 0; j < list.length; j++) {
      if (isPlayerWreckMarker(list[j])) return list[j];
    }
  }
  return null;
}

export function aftermathFieldId(sectorId, zoneId) {
  return `aft:${sectorId || 'unknown'}:${zoneId || 'zone'}`;
}

export function isWreckEcologyInhabitant(entity, fieldId = null) {
  const data = entity && entity.data;
  if (!entity || entity.alive === false || !data) return false;
  if (!data.wreckFieldId || !ECOLOGY_ROLES.includes(data.wreckEcologyRole)) return false;
  return fieldId == null || data.wreckFieldId === fieldId;
}

export function wreckFieldEcology(state, fieldId) {
  const own = ensureAftermathState(state);
  if (!own || !fieldId || !own.ecology[fieldId]) return null;
  return own.ecology[fieldId];
}

export function listWreckFieldInhabitants(state, fieldId = null) {
  const out = [];
  const list = state && state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (isWreckEcologyInhabitant(entity, fieldId)) out.push(entity);
  }
  return out;
}

export function countWreckFieldInhabitants(state, fieldId = null) {
  return listWreckFieldInhabitants(state, fieldId).length;
}

function ecologySlotKey(fieldId, slotId) {
  return `${fieldId}::${slotId}`;
}

function normalizeEcologyPos(input) {
  if (!input || typeof input !== 'object') return null;
  const x = Number(input.x);
  const z = Number(input.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function inhabitantOffset(seed, fieldId, slotId, role) {
  const ang = (hash32(seed, fieldId, slotId, role, 'ang') % 360) * (Math.PI / 180);
  const radius = 32 + (hash32(seed, fieldId, slotId, role, 'r') % 28);
  return { x: Math.cos(ang) * radius, z: Math.sin(ang) * radius };
}

function secondEcologyRole(seed, fieldId) {
  return (hash32(seed, fieldId, 'wreckEcologySecond') % 2) === 0 ? 'squatter' : 'trap';
}

function normalizeEcologySlot(input) {
  if (!input || typeof input !== 'object') return null;
  const role = ECOLOGY_ROLES.includes(input.role) ? input.role : null;
  if (!role || !input.id) return null;
  const status = input.status === 'gone' ? 'gone' : 'live';
  return {
    id: String(input.id),
    role,
    status,
    spawnedAt: Number.isFinite(input.spawnedAt) ? input.spawnedAt : 0,
  };
}

function normalizeEcologyField(input) {
  if (!input || typeof input !== 'object' || !input.fieldId || !input.sectorId) return null;
  const pos = normalizeEcologyPos(input.pos) || { x: 0, z: 0 };
  const roster = (Array.isArray(input.roster) ? input.roster : [])
    .map(normalizeEcologySlot)
    .filter(Boolean)
    .slice(0, WRECK_ECOLOGY_BUDGET);
  const spent = Math.max(0, Math.floor(Number(input.spent) || roster.length));
  const budget = Math.max(0, Math.min(WRECK_ECOLOGY_BUDGET, Math.floor(
    Number.isFinite(input.budget) ? input.budget : Math.max(0, WRECK_ECOLOGY_BUDGET - spent),
  )));
  return {
    fieldId: String(input.fieldId),
    sectorId: String(input.sectorId),
    zoneId: input.zoneId == null ? null : String(input.zoneId),
    kind: typeof input.kind === 'string' ? input.kind : 'aftermath',
    pos,
    bornAt: Number.isFinite(input.bornAt) ? input.bornAt : 0,
    inhabitedAt: Number.isFinite(input.inhabitedAt) ? input.inhabitedAt : null,
    decayed: input.decayed === true,
    budget,
    spent,
    roster,
  };
}

function serializeEcology(ecology) {
  const out = {};
  for (const fieldId of Object.keys(ecology || {}).sort((a, b) => a.localeCompare(b))) {
    const field = normalizeEcologyField(ecology[fieldId]);
    if (field) out[fieldId] = field;
  }
  return out;
}

function seedOf(state) {
  return (state && state.meta && state.meta.seed >>> 0) || 1;
}

function entityFor(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function posFrom(payload, entity) {
  const pos = payload && payload.pos || entity && entity.pos;
  if (!pos) return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

// Bounds on momentum the wreck ALREADY inherited. Not drag, not damping: the vector is scaled
// whole (never per-axis, which would rotate the direction) and the spin by magnitude, sign kept.
function boundedDriftVel(vel) {
  const x = Number(vel && vel.x);
  const z = Number(vel && vel.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const speed = Math.hypot(x, z);
  if (!(speed > 0)) return { x: 0, z: 0 };
  if (speed <= MAX_WRECK_DRIFT_SPEED) return { x, z };
  const scale = MAX_WRECK_DRIFT_SPEED / speed;
  return { x: x * scale, z: z * scale };
}

function boundedTumble(angVel) {
  const w = Number(angVel);
  if (!Number.isFinite(w)) return 0;
  if (w > MAX_WRECK_TUMBLE) return MAX_WRECK_TUMBLE;
  if (w < -MAX_WRECK_TUMBLE) return -MAX_WRECK_TUMBLE;
  return w;
}

function boundedVictimMass(mass) {
  const m = Number(mass);
  return Number.isFinite(m) && m > 0 ? m : null;
}

// Pose is inherited as-is. Finite-or-zero only — not a new clamp, not drag.
function boundedPoseAngle(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function poseIsFlat(entity) {
  const pitch = Number(entity && entity.pitch) || 0;
  const bank = Number(entity && entity.bank) || 0;
  return !(Math.abs(pitch) > 1e-6 || Math.abs(bank) > 1e-6);
}

function sectorIdFrom(state, payload) {
  return payload && payload.sectorId || state && state.world && state.world.currentSectorId || null;
}

function markerIdFor(state, sectorId, payload) {
  const victimId = payload && (payload.id != null ? payload.id : payload.entityId);
  const fingerprint = payload && payload.encounterFingerprint;
  return 'aft_' + hash32(seedOf(state), sectorId, fingerprint || victimId, victimId, payload && payload.killerId, state && state.tick || 0, 'aftermath').toString(36);
}

function victimClassFor(entity, payload) {
  const data = entity && entity.data || {};
  return payload && payload.victimClass || data.shipClass || data.defId || entity && entity.type || 'ship';
}

function victimLabelFor(entity, payload) {
  const data = entity && entity.data || {};
  return data.name || data.shipName || data.callsign || data.callSign || payload && payload.label || victimClassFor(entity, payload);
}

function classForVictim(victimClass) {
  const key = String(victimClass || '').toLowerCase();
  if (key.includes('patrol') || key.includes('law') || key.includes('military')) return 'military';
  if (key.includes('drone')) return 'fresh';
  return 'battlefield';
}

function initialPoolForMarker(marker) {
  const cls = marker && marker.victimClass || '';
  if (String(cls).toLowerCase().includes('drone')) return { cmdty_scrap_metal: 2, cmdty_ore_iron: 1 };
  if (marker && marker.wreckClass === 'military') {
    return { cmdty_scrap_metal: 2, cmdty_salvage_electronics: 2 };
  }
  return { ...DEFAULT_POOL };
}

function normalizeSalvagePool(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const pool = {};
  for (const [commodityId, rawQty] of Object.entries(input)) {
    const qty = Math.max(0, Math.floor(Number(rawQty) || 0));
    if (qty > 0) pool[commodityId] = qty;
  }
  return pool;
}

function boundedIdentityText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, FREIGHT_IDENTITY_TEXT_MAX) : null;
}

function freightIdentityFor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const manifestId = boundedIdentityText(input.manifestId);
  const freighterKey = boundedIdentityText(input.freighterKey);
  const role = boundedIdentityText(input.role);
  if (!manifestId && !freighterKey && !role) return null;
  return { manifestId, freighterKey, role };
}

function isBoundWreck(entity, markerId) {
  const data = entity && entity.data;
  return !!(entity && entity.alive !== false && entity.type === 'wreck' && data
    && data.markerId === markerId
    && data.provenance && data.provenance.markerId === markerId);
}

// The marker owns the pool. Live immediate/rematerialized wrecks receive this same object, so
// partial salvage cannot fork an anonymous combat pool from the durable aftermath pool.
function poolForMarker(marker) {
  if (!marker) return { ...DEFAULT_POOL };
  if (!Object.prototype.hasOwnProperty.call(marker, 'salvagePool')) {
    marker.salvagePool = initialPoolForMarker(marker);
  }
  return marker.salvagePool;
}

function aftermathLine(marker) {
  const zone = marker.zoneName || 'a local zone';
  if (isPlayerWreckMarker(marker)) return `Your wreck and pod remain in ${zone}.`;
  const victim = marker.victimLabel || marker.victimClass || 'ship';
  const cause = marker.cause;
  if (cause && cause.actor) return `${victim} destroyed in ${zone}; evidence links ${cause.actor} to ${cause.motiveId}.`;
  return `${victim} destroyed in ${zone}; black box lists killer ${marker.killerId == null ? 'unknown' : marker.killerId}.`;
}

function newsLine(marker) {
  const zone = marker.zoneName || 'a local zone';
  if (isPlayerWreckMarker(marker)) return `Your hull still drifts in ${zone}.`;
  const victim = marker.victimClass || 'ship';
  return `Aftermath reported in ${zone}: ${victim} wreckage now drifting on the lane.`;
}

function normalizeStructurePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const receiptId = boundedIdentityText(input.receiptId || (input.data && input.data.receiptId));
  const text = boundedIdentityText(input.text);
  if (!receiptId || !text) return null;
  const markerId = boundedIdentityText(input.markerId || (input.data && input.data.markerId));
  const stationId = boundedIdentityText(input.stationId || (input.data && input.data.stationId));
  const placeId = boundedIdentityText(input.placeId || (input.data && input.data.placeId));
  return {
    t: Number.isFinite(input.t) ? input.t : 0,
    kind: boundedIdentityText(input.kind) || 'patched',
    text,
    receiptId,
    markerId,
    stationId,
    placeId,
    data: { receiptId, markerId, stationId, placeId },
  };
}

function nearestStructure(state, pos) {
  if (!pos || !state) return null;
  let best = null;
  let bestD = Infinity;
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || !entity.pos) continue;
    const data = entity.data || {};
    const isStation = entity.type === 'station' && !!data.stationId;
    const isPlace = !!(data.placeId || data.worldOneOff);
    if (!isStation && !isPlace) continue;
    const d = Math.hypot(entity.pos.x - pos.x, entity.pos.z - pos.z);
    if (!(d < bestD) || d > STRUCTURE_PATCH_RANGE_WU) continue;
    bestD = d;
    best = entity;
  }
  return best;
}

function makeMarker(state, payload, entity) {
  const sectorId = sectorIdFrom(state, payload);
  if (!sectorId) return null;
  const pos = posFrom(payload, entity);
  if (!pos) return null;
  const local = globalToSectorLocalForSector(pos, sectorId);
  const zone = zoneAt(sectorId, local.x, local.z);
  if (!zone) return null;
  const type = entity && entity.type || payload && payload.type;
  if (!SHIPLIKE_TYPES.has(type)) return null;
  const victimId = entity && entity.id != null ? entity.id : payload && payload.id;
  if (victimId == null || victimId === state.playerId) return null;

  const victimClass = victimClassFor(entity, payload);
  const data = entity && entity.data || {};
  const encounterCausality = data.encounterCausality && typeof data.encounterCausality === 'object'
    ? clonePlain(data.encounterCausality) : null;
  const encounterFingerprint = data.encounterFingerprint
    || encounterCausality && encounterCausality.fingerprint
    || null;
  const wreckClass = classForVictim(victimClass);
  const cls = wreckClassById(wreckClass) || wreckClassById('battlefield');
  const marker = {
    schemaVersion: STATE_VERSION,
    markerId: markerIdFor(state, sectorId, { ...payload, id: victimId, encounterFingerprint }),
    sectorId,
    zoneId: zone.id,
    zoneName: zone.name || zone.id,
    zoneType: zone.type || null,
    zoneThreat: zoneThreat(zone),
    pos,
    victimId,
    victimClass,
    victimVel: boundedDriftVel(entity && entity.vel),
    victimAngVel: boundedTumble(entity && entity.angVel),
    victimMass: boundedVictimMass(entity && entity.mass),
    victimRot: boundedPoseAngle(entity && entity.rot),
    victimPitch: boundedPoseAngle(entity && entity.pitch),
    victimBank: boundedPoseAngle(entity && entity.bank),
    victimLabel: victimLabelFor(entity, payload),
    victimFactionId: entity && entity.factionId || payload && payload.factionId || null,
    killerId: payload && payload.killerId != null ? payload.killerId : null,
    tick: state.tick || 0,
    t: Number(state.simTime || 0),
    wreckClass: cls ? cls.id : 'battlefield',
    wreckClassLabel: cls ? cls.label : 'Battlefield Wreck',
    source: 'entity:killed',
    encounterId: encounterCausality && encounterCausality.encounterId || data.ai && data.ai.encounterId || null,
    encounterFingerprint,
    motiveId: encounterCausality && encounterCausality.motiveId || null,
    freightIdentity: freightIdentityFor(data.cargoManifest),
    cause: null,
    headline: null,
    structurePatch: null,
  };
  marker.salvagePool = initialPoolForMarker(marker);
  return marker;
}

function playerWreckMarkerId(state) {
  return 'pwreck_' + hash32(seedOf(state), 'player_wreck').toString(36);
}

function makePlayerWreckMarker(state, payload, entity) {
  const sectorId = sectorIdFrom(state, payload);
  if (!sectorId) return null;
  const pos = posFrom(payload, entity);
  if (!pos) return null;
  const local = globalToSectorLocalForSector(pos, sectorId);
  const zone = zoneAt(sectorId, local.x, local.z);
  const victimClass = victimClassFor(entity, payload);
  const wreckClass = classForVictim(victimClass);
  const cls = wreckClassById(wreckClass) || wreckClassById('fresh');
  const marker = {
    schemaVersion: STATE_VERSION,
    markerId: playerWreckMarkerId(state),
    sectorId,
    zoneId: zone && zone.id || null,
    zoneName: zone && (zone.name || zone.id) || 'open space',
    zoneType: zone && zone.type || null,
    zoneThreat: zone ? zoneThreat(zone) : 0,
    pos,
    victimId: state.playerId,
    victimClass,
    victimVel: boundedDriftVel(entity && entity.vel),
    victimAngVel: boundedTumble(entity && entity.angVel),
    victimMass: boundedVictimMass(entity && entity.mass),
    victimRot: boundedPoseAngle(entity && entity.rot),
    victimPitch: boundedPoseAngle(entity && entity.pitch),
    victimBank: boundedPoseAngle(entity && entity.bank),
    victimLabel: victimLabelFor(entity, payload) || 'Your Hull',
    victimFactionId: entity && entity.factionId || payload && payload.factionId || null,
    killerId: payload && payload.killerId != null ? payload.killerId : null,
    tick: state.tick || 0,
    t: Number(state.simTime || 0),
    wreckClass: cls ? cls.id : 'fresh',
    wreckClassLabel: cls ? cls.label : 'Your Hull',
    source: 'player:death',
    encounterId: PLAYER_WRECK_ENCOUNTER_ID,
    encounterFingerprint: null,
    motiveId: null,
    freightIdentity: null,
    cause: null,
    headline: null,
    structurePatch: null,
    playerWreck: true,
    kind: PLAYER_WRECK_KIND,
  };
  marker.salvagePool = initialPoolForMarker(marker);
  return marker;
}

function trimCauses(causes) {
  const priority = { active: 5, offered: 4, open: 3, contained: 2, remedied: 1, exhausted: 0 };
  const list = Object.values(causes || {})
    .map(normalizeCausalAftermath)
    .filter(Boolean)
    .sort((a, b) => ((priority[b.status] || 0) - (priority[a.status] || 0))
      || (b.createdTick - a.createdTick)
      || (b.createdAt - a.createdAt)
      || String(a.fingerprint).localeCompare(String(b.fingerprint)))
    .slice(0, MAX_CAUSES);
  return Object.fromEntries(list.map((cause) => [cause.fingerprint, cause]));
}

export function causalAftermathForSector(state, sectorId) {
  const own = ensureAftermathState(state);
  if (!own || !sectorId) return [];
  return Object.values(own.causes)
    .filter((cause) => cause && cause.sectorId === sectorId)
    .map((cause) => clonePlain(cause))
    .sort((a, b) => (b.createdTick - a.createdTick) || String(a.fingerprint).localeCompare(String(b.fingerprint)));
}

function rememberCause(state, bus, payload) {
  const own = ensureAftermathState(state);
  const cause = causalAftermath(payload && payload.causality, payload && payload.outcome, {
    tick: state && state.tick,
    t: payload && payload.t,
  });
  if (!cause) return null;
  const prior = own.causes[cause.fingerprint];
  if (prior && (prior.status === 'remedied' || prior.status === 'exhausted')) return prior;
  const merged = normalizeCausalAftermath({ ...cause, ...(prior || {}) });
  own.causes[merged.fingerprint] = merged;
  own.causes = trimCauses(own.causes);
  for (const marker of own.bySector[merged.sectorId] || []) {
    if (marker && marker.encounterFingerprint === merged.fingerprint) marker.cause = clonePlain(merged);
  }
  if (bus && typeof bus.emit === 'function') {
    bus.emit('aftermath:causeRecorded', clonePlain(merged));
  }
  return merged;
}

function rememberMarker(state, bus, marker, onEvicted = null) {
  const own = ensureAftermathState(state);
  if (!own || !marker || !marker.sectorId || !marker.markerId) return null;
  const arr = own.bySector[marker.sectorId] || (own.bySector[marker.sectorId] = []);
  if (arr.some((item) => item && item.markerId === marker.markerId)) return marker;
  if (marker.encounterFingerprint && own.causes[marker.encounterFingerprint]) {
    marker.cause = clonePlain(own.causes[marker.encounterFingerprint]);
  }
  arr.unshift(marker);
  if (arr.length > MAX_PER_SECTOR) {
    const evicted = [];
    while (arr.length > MAX_PER_SECTOR) {
      let idx = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (!isPlayerWreckMarker(arr[i])) {
          idx = i;
          break;
        }
      }
      if (idx < 0) break;
      evicted.push(arr.splice(idx, 1)[0]);
    }
    if (evicted.length && typeof onEvicted === 'function') onEvicted(evicted);
  }
  if (bus && typeof bus.emit === 'function') {
    const headline = marker.headline || newsLine(marker);
    marker.headline = headline;
    bus.emit('aftermathWreck:recorded', clonePlain(marker));
    bus.emit('news:headline', {
      headline,
      text: headline,
      kind: 'battle-aftermath',
      sectorId: marker.sectorId,
      zoneId: marker.zoneId,
      zoneName: marker.zoneName,
      markerId: marker.markerId,
    });
  }
  return marker;
}

function normalizeMarker(input) {
  if (!input || typeof input !== 'object') return null;
  if (!input.markerId || !input.sectorId || !input.pos) return null;
  const x = Number(input.pos.x);
  const z = Number(input.pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const marker = {
    schemaVersion: STATE_VERSION,
    markerId: String(input.markerId),
    sectorId: String(input.sectorId),
    zoneId: input.zoneId || null,
    zoneName: input.zoneName || input.zoneId || 'Unknown Zone',
    zoneType: input.zoneType || null,
    zoneThreat: Number.isFinite(input.zoneThreat) ? input.zoneThreat : 0,
    pos: { x, z },
    victimId: input.victimId == null ? null : input.victimId,
    victimClass: input.victimClass || 'ship',
    victimVel: boundedDriftVel(input.victimVel),
    victimAngVel: boundedTumble(input.victimAngVel),
    victimMass: boundedVictimMass(input.victimMass),
    victimRot: boundedPoseAngle(input.victimRot),
    victimPitch: boundedPoseAngle(input.victimPitch),
    victimBank: boundedPoseAngle(input.victimBank),
    victimLabel: input.victimLabel || input.victimClass || 'ship',
    victimFactionId: input.victimFactionId || null,
    killerId: input.killerId == null ? null : input.killerId,
    tick: Number.isFinite(input.tick) ? input.tick : 0,
    t: Number.isFinite(input.t) ? input.t : 0,
    wreckClass: input.wreckClass || 'battlefield',
    wreckClassLabel: input.wreckClassLabel || 'Battlefield Wreck',
    source: input.source || 'entity:killed',
    encounterId: input.encounterId || null,
    encounterFingerprint: input.encounterFingerprint || null,
    motiveId: input.motiveId || null,
    freightIdentity: freightIdentityFor(input.freightIdentity),
    cause: normalizeCausalAftermath(input.cause),
    headline: boundedIdentityText(input.headline),
    structurePatch: normalizeStructurePatch(input.structurePatch),
  };
  if (input.playerWreck === true || input.kind === PLAYER_WRECK_KIND) {
    marker.playerWreck = true;
    marker.kind = PLAYER_WRECK_KIND;
    if (!marker.encounterId) marker.encounterId = PLAYER_WRECK_ENCOUNTER_ID;
  }
  const savedPool = normalizeSalvagePool(input.salvagePool);
  marker.salvagePool = savedPool == null ? initialPoolForMarker(marker) : savedPool;
  return marker;
}

function trimAndSort(markers) {
  const normalized = markers.map(normalizeMarker).filter(Boolean);
  const player = normalized.filter(isPlayerWreckMarker);
  const rest = normalized
    .filter((marker) => !isPlayerWreckMarker(marker))
    .sort((a, b) => (b.tick - a.tick) || (b.t - a.t) || String(a.markerId).localeCompare(String(b.markerId)))
    .slice(0, Math.max(0, MAX_PER_SECTOR - player.length));
  return [...player, ...rest].sort((a, b) => (b.tick - a.tick) || (b.t - a.t)
    || String(a.markerId).localeCompare(String(b.markerId)));
}

export const aftermathWrecks = {
  name: 'aftermathWrecks',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.helpers = ctx && ctx.helpers || {};
    this.registry = ctx && ctx.registry || null;
    this._spawned = new Map();
    this._ecologySpawned = new Map();
    this._pendingOffers = new Map();
    this._saveRestoring = false;
    ensureAftermathState(this.state);

    this._onKilled = (payload) => {
      this._noteInhabitantGone(payload && payload.id);
      this._recordKill(payload || {});
    };
    this._onPlayerDeath = (payload) => this._recordPlayerDeath(payload || {});
    this._onDestroyed = (payload) => this._noteInhabitantGone(payload && payload.id);
    this._onFieldSource = (payload) => this.registerWreckFieldSource(payload || {});
    this._onSectorEnter = (payload) => this._spawnForSector(payload && payload.sectorId);
    this._onSectorExit = (payload) => this._clearLiveRefs(payload && payload.sectorId);
    this._onSalvageCompleted = (payload) => this._completeByEntity(payload || {});
    this._onEncounterResolved = (payload) => rememberCause(this.state, this.bus, payload || {});
    this._onDocked = (payload) => this._offerAtStation(payload && payload.stationId);
    this._onOfferBoarded = (payload) => this._markOfferBoarded(payload || {});
    this._onMissionAccepted = (payload) => this._markMissionActive(payload || {});
    this._onMissionCompleted = (payload) => this._settleMission(payload || {}, true);
    this._onMissionFailed = (payload) => this._settleMission(payload || {}, false);
    this._onNewGame = () => this.newGame();
    this._onSaveRestoring = () => { this._saveRestoring = true; };
    this._onSaveLoaded = () => {
      this._saveRestoring = false;
      this._spawned.clear();
      this._spawnForSector(this.state && this.state.world && this.state.world.currentSectorId);
    };
    this._onSaveError = () => { this._saveRestoring = false; };

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('entity:killed', this._onKilled);
      this.bus.on('player:death', this._onPlayerDeath);
      this.bus.on('entity:destroyed', this._onDestroyed);
      this.bus.on('wreckField:source', this._onFieldSource);
      this.bus.on('sector:enter', this._onSectorEnter);
      this.bus.on('sector:exit', this._onSectorExit);
      this.bus.on('salvage:completed', this._onSalvageCompleted);
      this.bus.on('encounter:resolved', this._onEncounterResolved);
      this.bus.on('dock:docked', this._onDocked);
      this.bus.on('mission:offerBoarded', this._onOfferBoarded);
      this.bus.on('mission:accepted', this._onMissionAccepted);
      this.bus.on('mission:completed', this._onMissionCompleted);
      this.bus.on('mission:failed', this._onMissionFailed);
      this.bus.on('mission:expired', this._onMissionFailed);
      this.bus.on('game:new', this._onNewGame);
      this.bus.on('game:newGame', this._onNewGame);
      this.bus.on('save:restoring', this._onSaveRestoring);
      this.bus.on('save:loaded', this._onSaveLoaded);
      this.bus.on('save:error', this._onSaveError);
    }
  },

  newGame() {
    this._saveRestoring = false;
    if (this.state) {
      this.state.aftermathWrecks = {
        schemaVersion: STATE_VERSION, bySector: {}, causes: {}, ecology: {}, seed: seedOf(this.state),
      };
    }
    if (this._spawned) this._spawned.clear();
    if (this._ecologySpawned) this._ecologySpawned.clear();
    if (this._pendingOffers) this._pendingOffers.clear();
  },

  update(_dt, state) {
    const sectorId = state && state.world && state.world.currentSectorId;
    if (!sectorId || this._saveRestoring) return;
    this._syncEcologyForSector(sectorId);
  },

  _recordKill(payload) {
    const entity = entityFor(this.state, payload.id);
    const marker = makeMarker(this.state, payload, entity);
    if (marker) marker.headline = newsLine(marker);
    const remembered = rememberMarker(this.state, this.bus, marker, (evicted) => {
      if (!this._spawned) return;
      for (const item of evicted) {
        if (item && item.markerId) this._spawned.delete(item.markerId);
      }
    });
    if (remembered) {
      this._stampNearbyStructurePatch(remembered, payload);
      const current = this.state && this.state.world && this.state.world.currentSectorId;
      if (remembered.sectorId && remembered.sectorId === current) {
        this._spawnForSector(remembered.sectorId);
        this._syncEcologyForSector(remembered.sectorId);
      }
    }
    return remembered;
  },

  _forgetPlayerWrecks() {
    const own = ensureAftermathState(this.state);
    if (!own) return;
    for (const sectorId of Object.keys(own.bySector)) {
      const before = own.bySector[sectorId] || [];
      const after = before.filter((marker) => !isPlayerWreckMarker(marker));
      if (after.length === before.length) continue;
      if (this._spawned) {
        for (const marker of before) {
          if (isPlayerWreckMarker(marker) && marker.markerId) this._spawned.delete(marker.markerId);
        }
      }
      own.bySector[sectorId] = after;
    }
  },

  _recordPlayerDeath(payload) {
    const entity = entityFor(this.state, this.state && this.state.playerId);
    const marker = makePlayerWreckMarker(this.state, payload || {}, entity);
    if (!marker) return null;
    this._forgetPlayerWrecks();
    marker.headline = newsLine(marker);
    const remembered = rememberMarker(this.state, this.bus, marker, (evicted) => {
      if (!this._spawned) return;
      for (const item of evicted) {
        if (item && item.markerId) this._spawned.delete(item.markerId);
      }
    });
    if (remembered) {
      const current = this.state && this.state.world && this.state.world.currentSectorId;
      if (remembered.sectorId && remembered.sectorId === current) {
        this._spawnForSector(remembered.sectorId);
        this._syncEcologyForSector(remembered.sectorId);
      }
    }
    return remembered;
  },

  // Claims already keep `{ t, kind, text, data }` receipts on a body. A player-caused kill
  // near a station or place writes that same receipt onto the nearest structure so the yard
  // patch is world state, not a checklist flag.
  _stampNearbyStructurePatch(marker, payload) {
    if (!marker || !this.state) return null;
    const killerId = payload && payload.killerId;
    if (killerId == null || killerId !== this.state.playerId) return null;
    if (marker.structurePatch && marker.structurePatch.receiptId) return marker.structurePatch;
    const structure = nearestStructure(this.state, marker.pos);
    if (!structure) return null;
    const data = structure.data || (structure.data = {});
    const receiptId = `aft_patch:${marker.markerId}`;
    const label = data.name || data.stationId || data.placeId || 'the structure';
    const receipt = normalizeStructurePatch({
      t: marker.t,
      kind: 'patched',
      text: `Yard crews patch ${label} after the ${marker.zoneName || 'local'} loss.`,
      receiptId,
      markerId: marker.markerId,
      stationId: data.stationId || null,
      placeId: data.placeId || null,
    });
    if (!receipt) return null;
    marker.structurePatch = receipt;
    if (!Array.isArray(data.receipts)) data.receipts = [];
    if (!data.receipts.some((row) => row && row.data && row.data.receiptId === receiptId)) {
      data.receipts.push(receipt);
    }
    data.structurePatch = receipt;
    return receipt;
  },

  // Production init order registers this system before mining. By the time mining observes the same
  // entity:killed event, the durable marker therefore exists and can author the one immediate wreck
  // spec. Returning null is deliberate: kills outside named zones keep mining's ordinary fallback.
  immediateWreckPlan(payload) {
    const entity = entityFor(this.state, payload && payload.id);
    const candidate = makeMarker(this.state, payload || {}, entity);
    if (!candidate) return null;
    const marker = aftermathForSector(this.state, candidate.sectorId)
      .find((item) => item && item.markerId === candidate.markerId);
    if (!marker) return null;
    const existing = this._resolveBoundWreck(marker.markerId);
    return {
      markerId: marker.markerId,
      entityId: existing && existing.alive !== false ? existing.id : null,
      spec: existing && existing.alive !== false ? null : this._specForMarker(marker),
    };
  },

  // Mining remains the immediate wreck spawner; aftermath owns identity and persistence. This bind
  // adopts the durable provenance/pool defensively, then teaches sector-entry rematerialization that
  // this marker is already live.
  bindImmediateWreck(markerId, entity) {
    if (!markerId || !entity || !this.state || !this._spawned) return null;
    const marker = this._markerById(markerId);
    if (!marker) return null;
    const existing = this._resolveBoundWreck(markerId);
    if (existing && existing.alive !== false && existing.id !== entity.id) return existing;

    const identity = this._specForMarker(marker);
    entity.data = Object.assign(entity.data || {}, identity.data);
    entity.data.salvagePool = poolForMarker(marker);
    // Adopt dead-man's motion only onto a wreck that is not already moving. A wreck mining spawned
    // from this same spec already carries the inherited momentum and must never be overwritten.
    const vx = Number(entity.vel && entity.vel.x) || 0;
    const vz = Number(entity.vel && entity.vel.z) || 0;
    if (!(Math.hypot(vx, vz) > 1e-6)) {
      entity.vel = { x: identity.vel.x, z: identity.vel.z };
      entity.angVel = identity.angVel;
      entity.mass = identity.mass;
    }
    // Same rule for pose: a parked-flat wreck may take the inherited tilt; a wreck that already
    // left the plane keeps the pose it spawned with.
    if (poseIsFlat(entity)) {
      entity.rot = identity.rot;
      entity.pitch = identity.pitch;
      entity.bank = identity.bank;
    }
    return this._bindLiveMarker(marker, entity) ? entity : null;
  },

  _resolveBoundWreck(markerId) {
    if (!markerId || !this._spawned) return null;
    const entityId = this._spawned.get(markerId);
    if (entityId == null) return null;
    const entity = entityFor(this.state, entityId);
    if (!isBoundWreck(entity, markerId)) {
      this._spawned.delete(markerId);
      return null;
    }
    return entity;
  },

  _markerById(markerId) {
    const own = ensureAftermathState(this.state);
    for (const markers of Object.values(own && own.bySector || {})) {
      const marker = Array.isArray(markers)
        ? markers.find((item) => item && item.markerId === markerId)
        : null;
      if (marker) return marker;
    }
    return null;
  },

  _offerAtStation(stationId) {
    const station = STATION_INFO.get(stationId);
    if (!station || !this.state || !this.bus) return null;
    const own = ensureAftermathState(this.state);
    const candidates = causalAftermathForSector(this.state, station.sectorId)
      .filter((cause) => cause.status === 'open' && (cause.attempts | 0) < 3)
      .sort((a, b) => (a.createdTick - b.createdTick) || String(a.fingerprint).localeCompare(String(b.fingerprint)));
    for (const cause of candidates) {
      if (this._pendingOffers.has(cause.fingerprint)) continue;
      const offer = causeContractOffer(cause, station, seedOf(this.state));
      if (!offer) continue;
      this._pendingOffers.set(cause.fingerprint, offer.id);
      this.bus.emit('mission:offered', offer);
      // Event delivery is synchronous. No mission:offerBoarded acknowledgement means the board
      // declined this slot (for example, one same-source offer is already visible); retry next dock.
      if (this._pendingOffers.get(cause.fingerprint) === offer.id) this._pendingOffers.delete(cause.fingerprint);
      return offer;
    }
    return null;
  },

  _causeForMissionPayload(payload) {
    if (!payload || payload.source !== 'encounterAftermath') return null;
    const fingerprint = payload.causeFingerprint || payload.fingerprint
      || payload.cause && payload.cause.fingerprint;
    const own = ensureAftermathState(this.state);
    return fingerprint && own.causes[fingerprint] || null;
  },

  _markOfferBoarded(payload) {
    const cause = this._causeForMissionPayload(payload);
    if (!cause) return false;
    cause.status = 'offered';
    cause.offerId = payload.offerId || this._pendingOffers.get(cause.fingerprint) || null;
    this._pendingOffers.delete(cause.fingerprint);
    return true;
  },

  _markMissionActive(payload) {
    const cause = this._causeForMissionPayload(payload);
    if (!cause || cause.status === 'remedied') return false;
    cause.status = 'active';
    cause.missionId = payload.missionId || null;
    return true;
  },

  _settleMission(payload, completed) {
    const cause = this._causeForMissionPayload(payload);
    if (!cause) return false;
    if (completed) {
      if (cause.rewardSettled) return false;
      cause.status = 'remedied';
      cause.rewardSettled = true;
      cause.resolvedAt = Number(this.state && this.state.simTime || 0);
      if (this.bus && typeof this.bus.emit === 'function') {
        const impulse = cause.consequenceKind === 'economic'
          ? { danger: -0.01, pricePressure: -0.06 }
          : cause.consequenceKind === 'security'
            ? { danger: -0.05, pricePressure: 0 }
            : cause.consequenceKind === 'distress'
              ? { danger: -0.025, pricePressure: -0.01 }
              : { danger: -0.015, pricePressure: -0.02 };
        this.bus.emit('sectorsim:impulse', {
          kind: `aftermath_remedy:${cause.consequenceKind}`,
          sectorId: cause.sectorId,
          danger: impulse.danger,
          pricePressure: impulse.pricePressure,
          fingerprint: cause.fingerprint,
        });
        this.bus.emit('aftermath:remedied', {
          fingerprint: cause.fingerprint,
          causeId: cause.causeId,
          missionId: payload.missionId || cause.missionId,
          consequenceKind: cause.consequenceKind,
          evidence: cause.evidence,
          remedy: cause.remedy,
        });
      }
    } else {
      cause.attempts = (cause.attempts | 0) + 1;
      cause.status = cause.attempts >= 3 ? 'exhausted' : 'open';
      cause.offerId = null;
      cause.missionId = null;
    }
    const own = ensureAftermathState(this.state);
    for (const marker of own.bySector[cause.sectorId] || []) {
      if (marker && marker.encounterFingerprint === cause.fingerprint) marker.cause = clonePlain(cause);
    }
    return true;
  },

  _spawnForSector(sectorId) {
    const state = this.state;
    // Save restore re-enters the incoming sector before this system receives/deserializes the
    // incoming aftermath bag. Spawning in that window would materialize the outgoing run's markers
    // as orphaned, salvageable wrecks. The save:loaded edge below owns the one post-deserialize spawn.
    if (this._saveRestoring) return 0;
    if (!state || !sectorId || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return 0;
    const listed = aftermathForSector(state, sectorId);
    const player = listed.filter(isPlayerWreckMarker);
    const rest = listed.filter((marker) => !isPlayerWreckMarker(marker))
      .slice(0, Math.max(0, MAX_SPAWNED_PER_SECTOR - player.length));
    const markers = [...player, ...rest];
    let count = 0;
    for (const marker of markers) {
      if (this._resolveBoundWreck(marker.markerId)) continue;
      const entity = this.helpers.spawnEntity(this._specForMarker(marker));
      if (!entity) continue;
      this._bindLiveMarker(marker, entity);
      count++;
    }
    this._syncEcologyForSector(sectorId);
    return count;
  },

  _bindLiveMarker(marker, entity) {
    if (!marker || !entity || !this._spawned) return false;
    if (!isBoundWreck(entity, marker.markerId)) return false;
    const alreadyBound = this._spawned.get(marker.markerId) === entity.id;
    this._spawned.set(marker.markerId, entity.id);
    if (!alreadyBound && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('aftermathWreck:spawned', {
        markerId: marker.markerId,
        entityId: entity.id,
        sectorId: marker.sectorId,
        zoneId: marker.zoneId,
      });
    }
    return true;
  },

  _specForMarker(marker) {
    const cls = wreckClassById(marker.wreckClass) || wreckClassById('battlefield');
    const line = aftermathLine(marker);
    const vel = boundedDriftVel(marker.victimVel);
    const angVel = boundedTumble(marker.victimAngVel);
    const mass = boundedVictimMass(marker.victimMass);
    const rot = boundedPoseAngle(marker.victimRot);
    const pitch = boundedPoseAngle(marker.victimPitch);
    const bank = boundedPoseAngle(marker.victimBank);
    return {
      type: 'wreck',
      pos: { x: marker.pos.x, z: marker.pos.z },
      vel: { x: vel.x, z: vel.z },
      angVel,
      rot,
      pitch,
      bank,
      radius: WRECK_RADIUS,
      // Dead man's mass: the victim's real mass so the wreck is shoveable. 1e6 only when no mass
      // was ever recorded (legacy markers).
      mass: mass != null ? mass : 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: marker.wreckClass === 'military' ? 'military' : 'ship',
        loot: [],
        salvagePool: poolForMarker(marker),
        salvageTimeLeft: WRECK_SALVAGE_TIME,
        scanLabel: isPlayerWreckMarker(marker) ? 'Your Hull' : (cls ? cls.scanLabel : 'Battle-scarred Hulk'),
        wreckClass: marker.wreckClass || 'battlefield',
        wreckClassLabel: isPlayerWreckMarker(marker)
          ? (marker.wreckClassLabel || 'Your Hull')
          : (cls ? cls.label : marker.wreckClassLabel || 'Battlefield Wreck'),
        playerWreck: isPlayerWreckMarker(marker),
        wreckClassBlurb: cls ? cls.blurb : null,
        provenanceLine: line,
        provenance: {
          source: isPlayerWreckMarker(marker) ? PLAYER_WRECK_KIND : 'battle-aftermath',
          markerId: marker.markerId,
          sectorId: marker.sectorId,
          zoneId: marker.zoneId,
          zoneName: marker.zoneName,
          victimClass: marker.victimClass,
          victimLabel: marker.victimLabel,
          victimFactionId: marker.victimFactionId,
          killerId: marker.killerId,
          tick: marker.tick,
          encounterId: marker.encounterId,
          fingerprint: marker.encounterFingerprint,
          motiveId: marker.motiveId,
          freightIdentity: clonePlain(marker.freightIdentity),
          evidence: marker.cause && marker.cause.evidence || null,
          remedy: marker.cause && marker.cause.remedy || null,
        },
        aftermath: clonePlain(marker),
        markerId: marker.markerId,
        encounterFingerprint: marker.encounterFingerprint,
        causeContract: marker.cause ? clonePlain(marker.cause) : null,
      },
    };
  },

  _clearLiveRefs(sectorId) {
    if (!sectorId || !this._spawned) {
      if (this._spawned) {
        this._writeBackAllBound();
        this._spawned.clear();
      }
      if (this._ecologySpawned) this._ecologySpawned.clear();
      return;
    }
    const markers = aftermathForSector(this.state, sectorId);
    for (const marker of markers) {
      // Once-per-unbind receipt of where the body actually is. Without this a drifted wreck would
      // teleport back to its kill point on sector re-entry / Continue.
      if (marker && this._spawned.has(marker.markerId)) this._writeBackBoundWreck(marker);
      this._spawned.delete(marker.markerId);
    }
    this._clearEcologyLiveRefs(sectorId);
  },

  // Unbind/save-time marker refresh (never per-tick): the marker remembers the live body's current
  // global position, momentum, and off-plane pose so rematerialization continues the drift instead
  // of restarting it. vel/angVel are frame-independent translations and are never offset by a
  // sector origin.
  _writeBackBoundWreck(marker) {
    if (!marker || !marker.markerId) return false;
    const entity = this._resolveBoundWreck(marker.markerId);
    if (!entity) return false;
    if (entity.pos && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)) {
      marker.pos = { x: entity.pos.x, z: entity.pos.z };
    }
    marker.victimVel = boundedDriftVel(entity.vel);
    marker.victimAngVel = boundedTumble(entity.angVel);
    marker.victimRot = boundedPoseAngle(entity.rot);
    marker.victimPitch = boundedPoseAngle(entity.pitch);
    marker.victimBank = boundedPoseAngle(entity.bank);
    return true;
  },

  _writeBackAllBound() {
    if (!this._spawned || !this._spawned.size || !this.state) return;
    const own = ensureAftermathState(this.state);
    if (!own) return;
    for (const markers of Object.values(own.bySector)) {
      if (!Array.isArray(markers)) continue;
      for (const marker of markers) {
        if (marker && this._spawned.has(marker.markerId)) this._writeBackBoundWreck(marker);
      }
    }
  },

  _completeByEntity(payload) {
    const wreckId = payload && typeof payload === 'object' ? payload.wreckId : payload;
    const claimedMarkerId = payload && typeof payload === 'object' ? payload.markerId : null;
    // The producer includes markerId for durable aftermath wrecks. A numeric entity ID alone is not
    // proof: IDs are recycled across New Game/travel and a delayed event could otherwise consume a
    // different wreck that happens to inherit the same number.
    if (wreckId == null || !claimedMarkerId || !this._spawned || !this.state) return false;
    if (this._spawned.get(claimedMarkerId) !== wreckId) return false;
    const live = this._resolveBoundWreck(claimedMarkerId);
    if (!live || live.id !== wreckId) return false;
    const markerId = claimedMarkerId;
    const own = ensureAftermathState(this.state);
    for (const sectorId of Object.keys(own.bySector)) {
      const before = own.bySector[sectorId] || [];
      const after = before.filter((marker) => marker && marker.markerId !== markerId);
      if (after.length !== before.length) {
        own.bySector[sectorId] = after;
        this._spawned.delete(markerId);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('aftermathWreck:completed', { markerId, wreckId, sectorId });
        }
        return true;
      }
    }
    return false;
  },

  serialize() {
    const own = ensureAftermathState(this.state);
    this._writeBackAllBound();
    const bySector = {};
    for (const sectorId of Object.keys(own.bySector)) {
      const markers = trimAndSort(Array.isArray(own.bySector[sectorId]) ? own.bySector[sectorId] : []);
      if (markers.length) bySector[sectorId] = markers;
    }
    return {
      schemaVersion: STATE_VERSION,
      seed: own.seed,
      bySector,
      causes: trimCauses(own.causes),
      ecology: serializeEcology(own.ecology),
    };
  },

  deserialize(data) {
    const own = ensureAftermathState(this.state);
    own.seed = data && typeof data.seed === 'number' ? data.seed >>> 0 : seedOf(this.state);
    own.bySector = {};
    own.causes = trimCauses(data && data.causes);
    own.ecology = serializeEcology(data && data.ecology);
    const bySector = data && data.bySector && typeof data.bySector === 'object' ? data.bySector : {};
    for (const sectorId of Object.keys(bySector)) {
      const markers = trimAndSort(Array.isArray(bySector[sectorId]) ? bySector[sectorId] : []);
      for (const marker of markers) {
        if (marker.encounterFingerprint && own.causes[marker.encounterFingerprint]) {
          marker.cause = clonePlain(own.causes[marker.encounterFingerprint]);
        }
      }
      if (markers.length) own.bySector[sectorId] = markers;
    }
    if (this._spawned) this._spawned.clear();
    if (this._ecologySpawned) this._ecologySpawned.clear();
    if (this._pendingOffers) this._pendingOffers.clear();
  },

  registerWreckFieldSource(source) {
    const state = this.state;
    const own = ensureAftermathState(state);
    if (!own || !source || !source.fieldId || !source.sectorId) return null;
    const pos = normalizeEcologyPos(source.pos);
    if (!pos) return null;
    const existing = own.ecology[source.fieldId];
    if (existing) {
      existing.pos = pos;
      if (source.zoneId && !existing.zoneId) existing.zoneId = String(source.zoneId);
      this._populateField(existing);
      return existing;
    }
    const field = normalizeEcologyField({
      fieldId: source.fieldId,
      sectorId: source.sectorId,
      zoneId: source.zoneId || null,
      kind: source.kind || 'aftermath',
      pos,
      bornAt: Number.isFinite(source.bornAt) ? source.bornAt : (Number(state && state.simTime) || 0),
      inhabitedAt: null,
      decayed: false,
      budget: WRECK_ECOLOGY_BUDGET,
      spent: 0,
      roster: [],
    });
    own.ecology[field.fieldId] = field;
    this._populateField(field);
    return field;
  },

  _syncEcologyForSector(sectorId) {
    if (!sectorId || this._saveRestoring) return 0;
    this._registerAftermathFields(sectorId);
    const own = ensureAftermathState(this.state);
    let live = 0;
    for (const field of Object.values(own.ecology || {})) {
      if (!field || field.sectorId !== sectorId) continue;
      live += this._populateField(field);
    }
    return live;
  },

  _registerAftermathFields(sectorId) {
    const markers = aftermathForSector(this.state, sectorId);
    if (!markers.length) return;
    const groups = new Map();
    for (const marker of markers) {
      if (!marker || !marker.zoneId) continue;
      const key = aftermathFieldId(marker.sectorId, marker.zoneId);
      const group = groups.get(key) || [];
      group.push(marker);
      groups.set(key, group);
    }
    for (const [fieldId, group] of groups) {
      let bornAt = Infinity;
      let pos = null;
      for (const marker of group) {
        const t = Number(marker.t);
        if (Number.isFinite(t) && t < bornAt) bornAt = t;
        if (!pos && marker.pos) pos = marker.pos;
      }
      if (!Number.isFinite(bornAt)) bornAt = Number(this.state && this.state.simTime) || 0;
      this.registerWreckFieldSource({
        fieldId,
        sectorId,
        zoneId: group[0].zoneId,
        kind: 'aftermath',
        pos,
        bornAt,
      });
    }
  },

  _populateField(field) {
    if (!field || this._saveRestoring) return 0;
    const now = Number(this.state && this.state.simTime) || 0;
    const age = now - (Number.isFinite(field.bornAt) ? field.bornAt : 0);
    if (field.decayed || age >= WRECK_ECOLOGY_DECAY_S) {
      this._decayField(field);
      return 0;
    }
    if (age < WRECK_ECOLOGY_DAY_S) return 0;
    if (!field.roster.length && field.spent === 0 && field.budget > 0 && !field.decayed) {
      this._seedRoster(field, now);
    }
    return this._materializeRoster(field);
  },

  _seedRoster(field, now) {
    const seed = seedOf(this.state);
    const roles = ['scavenger', secondEcologyRole(seed, field.fieldId)];
    field.roster = roles.slice(0, field.budget).map((role, index) => ({
      id: `${role}:${index}`,
      role,
      status: 'live',
      spawnedAt: now,
    }));
    field.spent = field.roster.length;
    field.budget = 0;
    field.inhabitedAt = now;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('wreckEcology:seeded', {
        fieldId: field.fieldId,
        sectorId: field.sectorId,
        zoneId: field.zoneId,
        roles: field.roster.map((slot) => slot.role),
        bornAt: field.bornAt,
        inhabitedAt: field.inhabitedAt,
      });
    }
  },

  _materializeRoster(field) {
    if (!field || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return 0;
    const current = this.state && this.state.world && this.state.world.currentSectorId;
    if (field.sectorId !== current) return 0;
    let live = 0;
    for (const slot of field.roster) {
      if (!slot || slot.status !== 'live') continue;
      if (this._resolveEcologySlot(field, slot)) {
        live += 1;
        continue;
      }
      const entity = this._spawnInhabitant(field, slot);
      if (!entity) continue;
      this._bindEcologySlot(field, slot, entity);
      live += 1;
    }
    return live;
  },

  _spawnInhabitant(field, slot) {
    const seed = seedOf(this.state);
    const offset = inhabitantOffset(seed, field.fieldId, slot.id, slot.role);
    const pos = {
      x: field.pos.x + offset.x,
      z: field.pos.z + offset.z,
    };
    if (slot.role === 'scavenger') return this._spawnScavenger(field, pos);
    if (slot.role === 'squatter') return this._spawnSquatter(field, pos);
    if (slot.role === 'trap') return this._spawnTrap(field, pos);
    return null;
  },

  _stampEcologyData(entity, field, role) {
    if (!entity) return null;
    const data = entity.data || (entity.data = {});
    data.wreckFieldId = field.fieldId;
    data.wreckEcologyRole = role;
    data.wreckEcology = { fieldId: field.fieldId, role, sectorId: field.sectorId, zoneId: field.zoneId };
    return entity;
  },

  _spawnScavenger(field, pos) {
    const seed = seedOf(this.state);
    const pick = hash32(seed, field.fieldId, 'scavengerArchetype') % ECOLOGY_SCAVENGER_ARCHETYPES.length;
    const archetype = ECOLOGY_SCAVENGER_ARCHETYPES[pick];
    const entity = this.helpers.spawnEntity({
      type: 'ship',
      team: 1,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 8,
      mass: 14,
      hull: 48,
      hullMax: 48,
      factionId: 'faction_reach',
      data: {
        defId: archetype === 'reaver_pirate' ? 'ship_corsair' : 'ship_wasp',
        shipClass: 'fighter',
        trafficRole: 'scavenger',
        ai: {
          doctrine: 'scavenger',
          archetype: 'reaver',
          motive: 'wreck_scavenge',
          engagementTrigger: 'wreck_field_claim',
          zoneId: field.zoneId,
          passive: true,
        },
      },
    });
    return this._stampEcologyData(entity, field, 'scavenger');
  },

  _spawnSquatter(field, pos) {
    const pods = this.registry && this.registry.get && this.registry.get('survivorPod');
    if (pods && typeof pods.spawnWreckSquatter === 'function') {
      const entity = pods.spawnWreckSquatter({
        fieldId: field.fieldId,
        sectorId: field.sectorId,
        zoneId: field.zoneId,
        pos,
        factionId: 'faction_reach',
      });
      return this._stampEcologyData(entity, field, 'squatter');
    }
    const entity = this.helpers.spawnEntity({
      type: 'ship',
      team: 1,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 7,
      mass: 16,
      hull: 36,
      hullMax: 36,
      factionId: 'faction_reach',
      data: {
        defId: 'ship_wasp',
        shipClass: 'fighter',
        trafficRole: 'squatter',
        ai: {
          doctrine: 'scavenger',
          archetype: 'reaver',
          motive: 'wreck_squat',
          engagementTrigger: 'wreck_field_claim',
          zoneId: field.zoneId,
          passive: true,
        },
      },
    });
    return this._stampEcologyData(entity, field, 'squatter');
  },

  _spawnTrap(field, pos) {
    const placeMine = this.helpers && this.helpers.placeMine;
    let entity = null;
    if (typeof placeMine === 'function') {
      entity = placeMine({
        pos: { x: pos.x, z: pos.z },
        team: 1,
        factionId: 'faction_reach',
        armDelayS: 0,
        telegraph: false,
      });
    }
    if (!entity) {
      entity = this.helpers.spawnEntity({
        type: 'mine',
        pos: { x: pos.x, z: pos.z },
        vel: { x: 0, z: 0 },
        radius: 6,
        mass: 8,
        hull: 28,
        hullMax: 28,
        team: 1,
        factionId: 'faction_reach',
        data: {
          kind: 'mine',
          mine: true,
          armed: true,
          armedAt: 0,
          triggerRadius: 55,
        },
      });
    }
    return this._stampEcologyData(entity, field, 'trap');
  },

  _bindEcologySlot(field, slot, entity) {
    if (!field || !slot || !entity || !this._ecologySpawned) return false;
    slot.status = 'live';
    this._ecologySpawned.set(ecologySlotKey(field.fieldId, slot.id), entity.id);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('wreckEcology:spawned', {
        fieldId: field.fieldId,
        slotId: slot.id,
        role: slot.role,
        entityId: entity.id,
        sectorId: field.sectorId,
        zoneId: field.zoneId,
      });
    }
    return true;
  },

  _resolveEcologySlot(field, slot) {
    if (!field || !slot || !this._ecologySpawned) return null;
    const entityId = this._ecologySpawned.get(ecologySlotKey(field.fieldId, slot.id));
    if (entityId == null) return null;
    const entity = entityFor(this.state, entityId);
    if (!isWreckEcologyInhabitant(entity, field.fieldId)) {
      this._ecologySpawned.delete(ecologySlotKey(field.fieldId, slot.id));
      return null;
    }
    return entity;
  },

  _noteInhabitantGone(entityId) {
    if (entityId == null || !this._ecologySpawned) return false;
    const own = ensureAftermathState(this.state);
    for (const [key, liveId] of this._ecologySpawned) {
      if (liveId !== entityId) continue;
      this._ecologySpawned.delete(key);
      const sep = key.indexOf('::');
      const fieldId = key.slice(0, sep);
      const slotId = key.slice(sep + 2);
      const field = own.ecology[fieldId];
      if (!field) return true;
      const slot = (field.roster || []).find((row) => row && row.id === slotId);
      if (slot) slot.status = 'gone';
      return true;
    }
    return false;
  },

  _clearEcologyLiveRefs(sectorId) {
    const own = ensureAftermathState(this.state);
    if (!this._ecologySpawned) return;
    for (const field of Object.values(own.ecology || {})) {
      if (!field || (sectorId && field.sectorId !== sectorId)) continue;
      for (const slot of field.roster || []) {
        this._ecologySpawned.delete(ecologySlotKey(field.fieldId, slot.id));
      }
    }
  },

  _decayField(field) {
    if (!field || field.decayed) {
      if (field) field.budget = 0;
      return 0;
    }
    field.decayed = true;
    field.budget = 0;
    let removed = 0;
    for (const slot of field.roster || []) {
      if (!slot || slot.status !== 'live') continue;
      const entity = this._resolveEcologySlot(field, slot);
      slot.status = 'gone';
      if (entity) {
        entity.alive = false;
        removed += 1;
      }
      this._ecologySpawned.delete(ecologySlotKey(field.fieldId, slot.id));
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('wreckEcology:decayed', {
        fieldId: field.fieldId,
        sectorId: field.sectorId,
        zoneId: field.zoneId,
        removed,
      });
    }
    return removed;
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
      if (this._onPlayerDeath) this.bus.off('player:death', this._onPlayerDeath);
      if (this._onDestroyed) this.bus.off('entity:destroyed', this._onDestroyed);
      if (this._onFieldSource) this.bus.off('wreckField:source', this._onFieldSource);
      if (this._onSectorEnter) this.bus.off('sector:enter', this._onSectorEnter);
      if (this._onSectorExit) this.bus.off('sector:exit', this._onSectorExit);
      if (this._onSalvageCompleted) this.bus.off('salvage:completed', this._onSalvageCompleted);
      if (this._onEncounterResolved) this.bus.off('encounter:resolved', this._onEncounterResolved);
      if (this._onDocked) this.bus.off('dock:docked', this._onDocked);
      if (this._onOfferBoarded) this.bus.off('mission:offerBoarded', this._onOfferBoarded);
      if (this._onMissionAccepted) this.bus.off('mission:accepted', this._onMissionAccepted);
      if (this._onMissionCompleted) this.bus.off('mission:completed', this._onMissionCompleted);
      if (this._onMissionFailed) this.bus.off('mission:failed', this._onMissionFailed);
      if (this._onMissionFailed) this.bus.off('mission:expired', this._onMissionFailed);
      if (this._onNewGame) this.bus.off('game:new', this._onNewGame);
      if (this._onNewGame) this.bus.off('game:newGame', this._onNewGame);
      if (this._onSaveRestoring) this.bus.off('save:restoring', this._onSaveRestoring);
      if (this._onSaveLoaded) this.bus.off('save:loaded', this._onSaveLoaded);
      if (this._onSaveError) this.bus.off('save:error', this._onSaveError);
    }
    this._onKilled = this._onPlayerDeath = this._onDestroyed = this._onFieldSource = this._onSectorEnter = this._onSectorExit = null;
    this._onSalvageCompleted = this._onEncounterResolved = this._onDocked = null;
    this._onOfferBoarded = this._onMissionAccepted = this._onMissionCompleted = this._onMissionFailed = null;
    this._onNewGame = this._onSaveRestoring = this._onSaveLoaded = this._onSaveError = null;
    this._saveRestoring = false;
    if (this._spawned) this._spawned.clear();
    if (this._ecologySpawned) this._ecologySpawned.clear();
    if (this._pendingOffers) this._pendingOffers.clear();
  },
};

export default aftermathWrecks;
