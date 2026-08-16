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
import { protectedStationAt } from '../ai/engagementAuthority.js';
import {
  causalAftermath,
  causeContractOffer,
  normalizeCausalAftermath,
} from '../world/encounterCausality.js';

const STATE_VERSION = 5;
const MAX_PER_SECTOR = 8;
const MAX_SPAWNED_PER_SECTOR = 6;
const MAX_CAUSES = 24;
const WRECK_RADIUS = 9;
const WRECK_SALVAGE_TIME = 8;
export const AFTERMATH_FRESH_WINDOW_S = 120;
const COLD_HULK_SALVAGE_TIME = 12;
export const COLD_DERELICT_CUT_THRESHOLD = 54;
export const COLD_DERELICT_SURVIVOR_CHANCE_PCT = 45;
const COLD_DERELICT_BOARDING_VERSION = 2;
const COLD_DERELICT_OUTCOMES = new Set(['survivor', 'cargo', 'black_box']);
const FREIGHT_IDENTITY_TEXT_MAX = 160;
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
    state.aftermathWrecks = { schemaVersion: STATE_VERSION, bySector: {}, causes: {}, seed: seedOf(state) };
  }
  const own = state.aftermathWrecks;
  own.schemaVersion = STATE_VERSION;
  if (!own.bySector || typeof own.bySector !== 'object' || Array.isArray(own.bySector)) own.bySector = {};
  if (!own.causes || typeof own.causes !== 'object' || Array.isArray(own.causes)) own.causes = {};
  if (typeof own.seed !== 'number') own.seed = seedOf(state);
  return own;
}

export function aftermathForSector(state, sectorId) {
  const own = ensureAftermathState(state);
  if (!own || !sectorId || !Array.isArray(own.bySector[sectorId])) return [];
  return own.bySector[sectorId].slice();
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
  if (marker && marker.playerLoss) return {};
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

function playerTetheredTo(state, targetId) {
  const tether = state && state.player && state.player.tether;
  return !!(tether && tether.active === true && tether.targetId === targetId);
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

export function aftermathLifecycleForMarker(marker, simTime = 0) {
  const bornAt = Math.max(0, Number(marker && marker.t) || 0);
  const ageS = Math.max(0, (Number(simTime) || 0) - bornAt);
  const stage = ageS >= AFTERMATH_FRESH_WINDOW_S ? 'cold' : 'fresh';
  return {
    stage,
    ageS,
    freshUntil: bornAt + AFTERMATH_FRESH_WINDOW_S,
    cooledAt: stage === 'cold' ? bornAt + AFTERMATH_FRESH_WINDOW_S : null,
  };
}

function normalizeColdDerelictBoarding(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const phase = ['sealed', 'hatch_open', 'extracted'].includes(input.phase) ? input.phase : 'sealed';
  return {
    schemaVersion: COLD_DERELICT_BOARDING_VERSION,
    phase,
    cutProgress: Math.max(0, Math.min(COLD_DERELICT_CUT_THRESHOLD, Number(input.cutProgress) || 0)),
    stabilizedAt: Number.isFinite(Number(input.stabilizedAt)) ? Math.max(0, Number(input.stabilizedAt)) : null,
    hatchOpenedAt: Number.isFinite(Number(input.hatchOpenedAt)) ? Math.max(0, Number(input.hatchOpenedAt)) : null,
    extractedAt: Number.isFinite(Number(input.extractedAt)) ? Math.max(0, Number(input.extractedAt)) : null,
    outcome: COLD_DERELICT_OUTCOMES.has(input.outcome) ? input.outcome : null,
    hatchPlatePayloadId: input.hatchPlatePayloadId == null ? null : input.hatchPlatePayloadId,
    blackBoxPickupId: input.blackBoxPickupId == null ? null : input.blackBoxPickupId,
    podEntityId: input.podEntityId == null ? null : input.podEntityId,
  };
}

function coldDerelictBoardingEligible(marker) {
  if (!marker || marker.playerLoss) return false;
  return !String(marker.victimClass || '').toLowerCase().includes('drone');
}

export function coldDerelictHasSurvivor(state, marker) {
  if (!coldDerelictBoardingEligible(marker) || marker.survivorPodEjected === true) return false;
  return hash32(seedOf(state), marker.markerId, marker.victimId, 'cold-derelict-survivor') % 100
    < COLD_DERELICT_SURVIVOR_CHANCE_PCT;
}

export function coldDerelictOutcomeFor(state, marker) {
  if (!coldDerelictBoardingEligible(marker)) return null;
  if (coldDerelictHasSurvivor(state, marker)) return 'survivor';
  return hash32(seedOf(state), marker.markerId, marker.victimId, 'cold-derelict-extraction') % 2 === 0
    ? 'cargo'
    : 'black_box';
}

function ensureColdDerelictBoarding(state, marker) {
  if (!marker || marker.lifecycleStage !== 'cold') return null;
  const existing = normalizeColdDerelictBoarding(marker.coldDerelictBoarding);
  if (existing) {
    // v1 boarding saves were survivor-only. Preserve a completed/partially opened survivor branch
    // even though its successful extraction already stamped survivorPodEjected on the marker.
    existing.outcome = existing.outcome
      || (existing.podEntityId != null || (existing.phase !== 'sealed' && marker.survivorPodEjected === true)
        ? 'survivor'
        : coldDerelictOutcomeFor(state, marker));
    marker.coldDerelictBoarding = existing;
    return existing;
  }
  const outcome = coldDerelictOutcomeFor(state, marker);
  if (!outcome) return null;
  marker.coldDerelictBoarding = normalizeColdDerelictBoarding({ phase: 'sealed', outcome });
  return marker.coldDerelictBoarding;
}

function coldDerelictSignal(boarding) {
  if (!boarding || boarding.phase === 'extracted') return 'HATCH OPEN';
  if (boarding.outcome === 'survivor') return 'FAINT LIFE SIGN';
  if (boarding.outcome === 'black_box') return 'FLIGHT RECORDER PING';
  return null;
}

function coldDerelictScanLabel(baseScanLabel, boarding) {
  const signal = coldDerelictSignal(boarding);
  return signal ? `${baseScanLabel} · ${signal}` : baseScanLabel;
}

function coldDerelictProvenance(boarding) {
  if (!boarding || boarding.phase === 'extracted') return 'The hull is cold; only deliberate salvage remains.';
  if (boarding.outcome === 'cargo') {
    return 'The hull is cold; a sealed cargo signature remains behind the marked hatch.';
  }
  return 'The hull is cold; only deliberate salvage remains.';
}

function aftermathLine(marker) {
  if (marker && marker.playerLoss) {
    return `Your ${marker.victimLabel || 'ship'} is adrift with ${marker.playerLoss.cargoQty || 0}u cargo in custody.`;
  }
  const zone = marker.zoneName || 'a local zone';
  const victim = marker.victimLabel || marker.victimClass || 'ship';
  const cause = marker.cause;
  if (cause && cause.actor) return `${victim} destroyed in ${zone}; evidence links ${cause.actor} to ${cause.motiveId}.`;
  return `${victim} destroyed in ${zone}; black box lists killer ${marker.killerId == null ? 'unknown' : marker.killerId}.`;
}

function lifecycleScanLabel(marker, cls, stage) {
  const rawIdentity = marker && (marker.victimLabel || marker.victimClass)
    || cls && cls.label
    || 'Wreck';
  const identity = String(rawIdentity).replace(/\s+(?:wreck|hulk)$/i, '');
  return stage === 'cold' ? `Cold ${identity} Hulk` : `Fresh ${identity} Wreck`;
}

function newsLine(marker) {
  if (marker && marker.playerLoss) return `Recovery tow posted for your ${marker.victimLabel || 'lost hull'}.`;
  const zone = marker.zoneName || 'a local zone';
  const victim = marker.victimClass || 'ship';
  return `Aftermath reported in ${zone}: ${victim} wreckage now drifting on the lane.`;
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
    lifecycleStage: 'fresh',
    cooledAt: null,
    survivorPodEjected: data.survivorPodEjected === true,
    coldDerelictBoarding: null,
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
      let index = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (!arr[i] || !arr[i].playerLoss) { index = i; break; }
      }
      if (index < 0) index = arr.length - 1;
      evicted.push(...arr.splice(index, 1));
    }
    if (typeof onEvicted === 'function') onEvicted(evicted);
  }
  if (bus && typeof bus.emit === 'function') {
    const headline = newsLine(marker);
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
    lifecycleStage: input.lifecycleStage === 'cold' ? 'cold' : 'fresh',
    cooledAt: Number.isFinite(Number(input.cooledAt)) ? Math.max(0, Number(input.cooledAt)) : null,
    survivorPodEjected: input.survivorPodEjected === true,
    coldDerelictBoarding: normalizeColdDerelictBoarding(input.coldDerelictBoarding),
    playerLoss: normalizePlayerLoss(input.playerLoss),
  };
  const savedPool = normalizeSalvagePool(input.salvagePool);
  marker.salvagePool = savedPool == null ? initialPoolForMarker(marker) : savedPool;
  return marker;
}

function normalizeCargoManifest(input) {
  const rows = [];
  for (const row of Array.isArray(input) ? input : []) {
    const commodityId = row && typeof row.commodityId === 'string' ? row.commodityId : null;
    const qty = Math.max(0, Math.floor(Number(row && row.qty) || 0));
    if (commodityId && qty > 0) rows.push({ commodityId, qty });
  }
  rows.sort((a, b) => a.commodityId.localeCompare(b.commodityId));
  return rows;
}

function normalizePlayerLoss(input) {
  if (!input || typeof input !== 'object' || !input.lossId || !input.shipSnapshot) return null;
  const cargoManifest = normalizeCargoManifest(input.cargoManifest);
  return {
    schemaVersion: 1,
    lossId: String(input.lossId),
    shipSnapshot: clonePlain(input.shipSnapshot),
    cargoManifest,
    cargoQty: cargoManifest.reduce((sum, row) => sum + row.qty, 0),
    towStatus: ['held', 'offered', 'active', 'recovered'].includes(input.towStatus)
      ? input.towStatus : 'held',
    offeredAt: Number.isFinite(Number(input.offeredAt)) ? Number(input.offeredAt) : null,
    offeredStationId: input.offeredStationId || null,
  };
}

function trimAndSort(markers) {
  return markers
    .map(normalizeMarker)
    .filter(Boolean)
    .sort((a, b) => (b.tick - a.tick) || (b.t - a.t) || String(a.markerId).localeCompare(String(b.markerId)))
    .slice(0, MAX_PER_SECTOR);
}

export const aftermathWrecks = {
  name: 'aftermathWrecks',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.helpers = ctx && ctx.helpers || {};
    this.registry = ctx && ctx.registry || null;
    this._spawned = new Map();
    this._pendingOffers = new Map();
    this._playerTowDeliveries = new WeakSet();
    this._saveRestoring = false;
    ensureAftermathState(this.state);

    this._onKilled = (payload) => this._recordKill(payload || {});
    this._onSurvivorPodEjected = (payload) => this._noteSurvivorPodEjected(payload || {});
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
      this.bus.on('survivorPod:ejected', this._onSurvivorPodEjected);
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
    if (this.state) this.state.aftermathWrecks = { schemaVersion: STATE_VERSION, bySector: {}, causes: {}, seed: seedOf(this.state) };
    if (this._spawned) this._spawned.clear();
    if (this._pendingOffers) this._pendingOffers.clear();
  },

  _recordKill(payload) {
    if (payload.ordinaryRewardsSuppressed === true) return null;
    const entity = entityFor(this.state, payload.id);
    const marker = makeMarker(this.state, payload, entity);
    return rememberMarker(this.state, this.bus, marker, (evicted) => {
      if (!this._spawned) return;
      for (const item of evicted) {
        if (item && item.markerId) this._spawned.delete(item.markerId);
      }
    });
  },

  _noteSurvivorPodEjected(payload) {
    if (!payload || payload.source === 'cold_derelict_boarding' || payload.victimId == null) return false;
    const own = ensureAftermathState(this.state);
    let changed = false;
    for (const markers of Object.values(own.bySector)) {
      for (const marker of markers || []) {
        if (!marker || marker.victimId !== payload.victimId) continue;
        marker.survivorPodEjected = true;
        changed = true;
      }
    }
    return changed;
  },

  /** Create the one conserved player hulk outside the ordinary entity:killed filter. Cargo remains
   * a manifest in this existing aftermath marker until the real Massline tow reaches protection. */
  recordPlayerLoss({ lossId, receipt, shipSnapshot, cargoManifest } = {}) {
    if (!this.state || !lossId || !shipSnapshot || !receipt || !receipt.pos) return null;
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (!sectorId) return null;
    const pos = { x: Number(receipt.pos.x) || 0, z: Number(receipt.pos.z) || 0 };
    const local = globalToSectorLocalForSector(pos, sectorId);
    const zone = zoneAt(sectorId, local.x, local.z);
    const playerLoss = normalizePlayerLoss({
      lossId,
      shipSnapshot,
      cargoManifest,
      towStatus: 'held',
    });
    if (!playerLoss) return null;
    const marker = {
      schemaVersion: STATE_VERSION,
      markerId: `aft_player_${hash32(seedOf(this.state), lossId, sectorId, 'player-hulk').toString(36)}`,
      sectorId,
      zoneId: zone && zone.id || null,
      zoneName: zone && (zone.name || zone.id) || 'open space',
      zoneType: zone && zone.type || null,
      zoneThreat: zone ? zoneThreat(zone) : 0,
      pos,
      victimId: this.state.playerId,
      victimClass: shipSnapshot.defId || 'player ship',
      victimLabel: shipSnapshot.shipName || shipSnapshot.defId || 'player ship',
      victimFactionId: 'player',
      killerId: receipt.killerId == null ? null : receipt.killerId,
      tick: this.state.tick || 0,
      t: Number(this.state.simTime || 0),
      wreckClass: 'battlefield',
      wreckClassLabel: 'Player Hulk',
      source: 'playerDefeat',
      encounterId: null,
      encounterFingerprint: null,
      motiveId: null,
      freightIdentity: null,
      cause: null,
      lifecycleStage: 'fresh',
      cooledAt: null,
      salvagePool: {},
      playerLoss,
    };
    const remembered = rememberMarker(this.state, this.bus, marker, (evicted) => {
      for (const item of evicted || []) if (item && item.markerId) this._spawned.delete(item.markerId);
    });
    if (!remembered) return null;
    let entity = this._resolveBoundWreck(marker.markerId);
    if (!entity && this.helpers && typeof this.helpers.spawnEntity === 'function') {
      entity = this.helpers.spawnEntity(this._specForMarker(marker));
      if (entity) this._bindLiveMarker(marker, entity);
    }
    return { ...clonePlain(marker), liveEntityId: entity && entity.id != null ? entity.id : null };
  },

  playerLossForMarker(markerId) {
    const marker = this._markerById(markerId);
    return marker && marker.playerLoss ? clonePlain(marker.playerLoss) : null;
  },

  offerPlayerRecoveryTow(markerId, { stationId = null } = {}) {
    const marker = this._markerById(markerId);
    if (!marker || !marker.playerLoss || marker.playerLoss.towStatus === 'recovered') return null;
    marker.playerLoss.towStatus = 'offered';
    marker.playerLoss.offeredAt = Number(this.state && this.state.simTime) || 0;
    marker.playerLoss.offeredStationId = stationId || null;
    const payload = {
      lossId: marker.playerLoss.lossId,
      markerId: marker.markerId,
      hulkEntityId: this._resolveBoundWreck(marker.markerId)?.id ?? null,
      stationId,
      cargoQty: marker.playerLoss.cargoQty,
      requirement: 'Massline attachment + physical station delivery',
    };
    this.bus.emit('playerDefeat:recoveryTowOffered', payload);
    this.bus.emit('toast', {
      text: `Recovery tow offered: bring your hulk and ${marker.playerLoss.cargoQty}u cargo into a lawful berth.`,
      kind: 'info',
      ttl: 6,
    });
    return payload;
  },

  cancelPlayerLoss(markerId, reason = 'cancelled') {
    const marker = this._markerById(markerId);
    if (!marker || !marker.playerLoss) return false;
    return this._removePlayerLossMarker(marker, reason);
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
    const markers = aftermathForSector(state, sectorId).slice(0, MAX_SPAWNED_PER_SECTOR);
    let count = 0;
    for (const marker of markers) {
      if (this._resolveBoundWreck(marker.markerId)) continue;
      const entity = this.helpers.spawnEntity(this._specForMarker(marker));
      if (!entity) continue;
      this._bindLiveMarker(marker, entity);
      count++;
    }
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
    const lifecycle = this._refreshLifecycle(marker, false);
    const cls = wreckClassById(marker.wreckClass) || wreckClassById('battlefield');
    const line = aftermathLine(marker);
    const cold = lifecycle.stage === 'cold';
    const boarding = cold ? ensureColdDerelictBoarding(this.state, marker) : null;
    const baseScanLabel = lifecycleScanLabel(marker, cls, lifecycle.stage);
    const scanLabel = boarding ? coldDerelictScanLabel(baseScanLabel, boarding) : baseScanLabel;
    const playerLoss = marker.playerLoss;
    const runtimeMass = Math.max(90, Math.min(5000,
      Number(playerLoss && playerLoss.shipSnapshot && playerLoss.shipSnapshot.runtimeMass) || 650));
    return {
      type: 'wreck',
      pos: { x: marker.pos.x, z: marker.pos.z },
      radius: WRECK_RADIUS,
      mass: playerLoss ? runtimeMass : 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: marker.wreckClass === 'military' ? 'military' : 'ship',
        loot: [],
        salvagePool: playerLoss ? {} : poolForMarker(marker),
        salvageTimeLeft: cold ? COLD_HULK_SALVAGE_TIME : WRECK_SALVAGE_TIME,
        scanLabel,
        authoredScanLabel: scanLabel,
        wreckLifecycle: lifecycle.stage,
        lifecycleStage: lifecycle.stage,
        freshUntil: lifecycle.freshUntil,
        cooledAt: lifecycle.cooledAt,
        coldDerelictBoarding: clonePlain(boarding),
        masslineTetherable: true,
        wreckClass: marker.wreckClass || 'battlefield',
        wreckClassLabel: cls ? cls.label : marker.wreckClassLabel || 'Battlefield Wreck',
        wreckClassBlurb: cls ? cls.blurb : null,
        provenanceLine: cold ? `${line} ${coldDerelictProvenance(boarding)}` : line,
        provenance: {
          source: 'battle-aftermath',
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
        ...(playerLoss ? {
          ownedPlayerWreck: true,
          playerLoss: clonePlain(playerLoss),
          cargoManifest: clonePlain(playerLoss.cargoManifest),
          tetherRole: 'player_hulk',
          masslineTetherable: true,
          scanLabel: `YOUR HULK · ${playerLoss.cargoQty}u CARGO IN CUSTODY`,
          authoredScanLabel: `YOUR HULK · ${playerLoss.cargoQty}u CARGO IN CUSTODY`,
        } : {}),
      },
    };
  },

  _refreshLifecycle(marker, announce = true) {
    const lifecycle = aftermathLifecycleForMarker(marker, this.state && this.state.simTime);
    const changed = marker.lifecycleStage !== lifecycle.stage;
    marker.lifecycleStage = lifecycle.stage;
    marker.cooledAt = lifecycle.cooledAt;
    if (changed && lifecycle.stage === 'cold' && announce && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('aftermathWreck:cooled', {
        markerId: marker.markerId,
        sectorId: marker.sectorId,
        wreckClass: marker.wreckClass,
        cooledAt: lifecycle.cooledAt,
      });
    }
    return lifecycle;
  },

  _syncLiveLifecycle(marker) {
    const lifecycle = this._refreshLifecycle(marker, true);
    const entity = this._resolveBoundWreck(marker && marker.markerId);
    if (!entity || !entity.data) return lifecycle;
    const cls = wreckClassById(marker.wreckClass) || wreckClassById('battlefield');
    const cold = lifecycle.stage === 'cold';
    const boarding = cold ? ensureColdDerelictBoarding(this.state, marker) : null;
    const baseScanLabel = marker.playerLoss
      ? `YOUR HULK · ${marker.playerLoss.cargoQty}u CARGO IN CUSTODY`
      : lifecycleScanLabel(marker, cls, lifecycle.stage);
    const scanLabel = boarding ? coldDerelictScanLabel(baseScanLabel, boarding) : baseScanLabel;
    entity.data.wreckLifecycle = lifecycle.stage;
    entity.data.lifecycleStage = lifecycle.stage;
    entity.data.freshUntil = lifecycle.freshUntil;
    entity.data.cooledAt = lifecycle.cooledAt;
    entity.data.coldDerelictBoarding = clonePlain(boarding);
    entity.data.scanLabel = scanLabel;
    entity.data.authoredScanLabel = scanLabel;
    entity.data.provenanceLine = marker.playerLoss
      ? aftermathLine(marker)
      : cold
      ? `${aftermathLine(marker)} ${coldDerelictProvenance(boarding)}`
      : aftermathLine(marker);
    if (cold && entity.data.salvageTimeLeft === WRECK_SALVAGE_TIME) {
      entity.data.salvageTimeLeft = COLD_HULK_SALVAGE_TIME;
    }
    return lifecycle;
  },

  applyColdDerelictBoardingBeam({ wreck, minerId, dps, dt } = {}) {
    if (!wreck || wreck.alive === false || wreck.type !== 'wreck' || !wreck.data || !wreck.data.markerId) {
      return { handled: false, reason: 'not-aftermath-wreck' };
    }
    if (minerId !== this.state.playerId) return { handled: false, reason: 'not-player' };
    const marker = this._markerById(wreck.data.markerId);
    if (!marker || this._resolveBoundWreck(marker.markerId)?.id !== wreck.id) {
      return { handled: false, reason: 'not-bound' };
    }
    this._refreshLifecycle(marker, true);
    const boarding = ensureColdDerelictBoarding(this.state, marker);
    if (!boarding || boarding.phase === 'extracted') return { handled: false, reason: 'no-pending-boarding' };

    if (!playerTetheredTo(this.state, wreck.id)) {
      if (wreck.data._coldBoardingTetherWarned !== true) {
        wreck.data._coldBoardingTetherWarned = true;
        this.bus.emit('derelictBoarding:requiresStabilization', {
          markerId: marker.markerId,
          wreckId: wreck.id,
          requirement: 'Massline attachment',
        });
        this.bus.emit('toast', {
          text: 'Cold hull tumbling — hold it on the Massline before cutting the hatch.',
          kind: 'info',
          ttl: 4,
        });
      }
      return { handled: true, status: boarding.phase, reason: 'requires-stabilization' };
    }

    delete wreck.data._coldBoardingTetherWarned;
    const now = Number(this.state.simTime) || 0;
    if (boarding.stabilizedAt == null) {
      boarding.stabilizedAt = now;
      this.bus.emit('derelictBoarding:stabilized', {
        markerId: marker.markerId,
        wreckId: wreck.id,
        minerId,
      });
    }

    if (boarding.phase === 'sealed') {
      boarding.cutProgress = Math.min(
        COLD_DERELICT_CUT_THRESHOLD,
        boarding.cutProgress + Math.max(0, Number(dps) || 0) * Math.max(0, Number(dt) || 0),
      );
      if (boarding.cutProgress < COLD_DERELICT_CUT_THRESHOLD) {
        wreck.data.coldDerelictBoarding = clonePlain(boarding);
        return { handled: true, status: boarding.phase, progress: boarding.cutProgress };
      }
      boarding.phase = 'hatch_open';
      boarding.hatchOpenedAt = now;
      this.bus.emit('derelictBoarding:hatchOpened', {
        markerId: marker.markerId,
        wreckId: wreck.id,
        minerId,
      });
    }

    const miningOwner = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('mining') : null;
    const pool = poolForMarker(marker);
    if (boarding.outcome === 'black_box' && !(pool.cmdty_salvage_electronics > 0)) {
      // A hull partially stripped while still fresh cannot mint a recorder later. Its remaining
      // conserved pool is still reachable through the ordinary cargo extraction branch.
      boarding.outcome = 'cargo';
    }
    const materialized = miningOwner
      && typeof miningOwner.materializeColdDerelictBoarding === 'function'
      ? miningOwner.materializeColdDerelictBoarding({
        wreck,
        markerId: marker.markerId,
        spawnHatchPlate: boarding.hatchPlatePayloadId == null,
        blackBoxCommodityId: boarding.outcome === 'black_box' && boarding.blackBoxPickupId == null
          ? 'cmdty_salvage_electronics'
          : null,
      })
      : null;
    if (!materialized || (boarding.hatchPlatePayloadId == null && materialized.hatchPlatePayloadId == null)) {
      wreck.data.coldDerelictBoarding = clonePlain(boarding);
      return { handled: true, status: boarding.phase, reason: 'extraction-owner-unavailable' };
    }
    if (materialized.hatchPlatePayloadId != null) {
      boarding.hatchPlatePayloadId = materialized.hatchPlatePayloadId;
    }
    if (boarding.outcome === 'black_box' && boarding.blackBoxPickupId == null) {
      if (materialized.blackBoxPickupId == null) {
        wreck.data.coldDerelictBoarding = clonePlain(boarding);
        return { handled: true, status: boarding.phase, reason: 'black-box-not-materialized' };
      }
      boarding.blackBoxPickupId = materialized.blackBoxPickupId;
      pool.cmdty_salvage_electronics -= 1;
      if (pool.cmdty_salvage_electronics <= 0) delete pool.cmdty_salvage_electronics;
    }

    if (boarding.outcome === 'survivor') {
      const survivorOwner = this.registry && typeof this.registry.get === 'function'
        ? this.registry.get('survivorPod') : null;
      const pod = survivorOwner && typeof survivorOwner.spawnFromColdDerelict === 'function'
        ? survivorOwner.spawnFromColdDerelict({
          markerId: marker.markerId,
          wreck,
          victimId: marker.victimId,
          factionId: marker.victimFactionId,
        })
        : null;
      if (!pod) {
        wreck.data.coldDerelictBoarding = clonePlain(boarding);
        return { handled: true, status: boarding.phase, reason: 'survivor-owner-unavailable' };
      }

      boarding.phase = 'extracted';
      boarding.extractedAt = now;
      boarding.podEntityId = pod.id;
      marker.survivorPodEjected = true;
      this._syncLiveLifecycle(marker);
      this.bus.emit('derelictBoarding:survivorExtracted', {
        markerId: marker.markerId,
        wreckId: wreck.id,
        podEntityId: pod.id,
        hatchPlatePayloadId: boarding.hatchPlatePayloadId,
        minerId,
      });
      this.bus.emit('toast', {
        text: 'Hatch open — survivor pod clear. Keep it on the Massline and reach lawful protection.',
        kind: 'info',
        ttl: 6,
      });
      return { handled: true, status: boarding.phase, podEntityId: pod.id };
    }

    boarding.phase = 'extracted';
    boarding.extractedAt = now;
    this._syncLiveLifecycle(marker);
    const remainingQty = Object.values(pool).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    this.bus.emit(boarding.outcome === 'black_box'
      ? 'derelictBoarding:blackBoxExtracted'
      : 'derelictBoarding:cargoOpened', {
      markerId: marker.markerId,
      wreckId: wreck.id,
      outcome: boarding.outcome,
      hatchPlatePayloadId: boarding.hatchPlatePayloadId,
      blackBoxPickupId: boarding.blackBoxPickupId,
      remainingQty,
      minerId,
    });
    this.bus.emit('toast', {
      text: boarding.outcome === 'black_box'
        ? 'Hatch open — flight recorder clear. Bring it aboard; the remaining hold is still physical.'
        : `Hatch open — ${remainingQty}u still aboard. Hold the beam and pull it out piece by piece.`,
      kind: 'info',
      ttl: 6,
    });
    return {
      handled: true,
      status: boarding.phase,
      outcome: boarding.outcome,
      hatchPlatePayloadId: boarding.hatchPlatePayloadId,
      blackBoxPickupId: boarding.blackBoxPickupId,
    };
  },

  update(_dt, state) {
    if (!state || !this._spawned || (state.tick | 0) % 30 !== 0) return;
    const sectorId = state.world && state.world.currentSectorId;
    for (const marker of aftermathForSector(state, sectorId)) {
      this._syncLiveLifecycle(marker);
      if (marker.playerLoss && ['offered', 'active'].includes(marker.playerLoss.towStatus)) {
        this._tryCompletePlayerTow(marker);
      }
    }
  },

  _activePlayerTowAttachment(wreck) {
    const tether = this.state && this.state.player && this.state.player.tether;
    if (!tether || tether.active !== true || tether.targetId !== wreck.id || !tether.attachmentId) return null;
    const registeredCombat = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('combat') : null;
    const kernel = registeredCombat && (registeredCombat.kernel
      || (typeof registeredCombat.ensureKernel === 'function' ? registeredCombat.ensureKernel() : null));
    const attachments = kernel && kernel.attachments;
    const attachment = attachments && typeof attachments.get === 'function'
      ? attachments.get(tether.attachmentId) : null;
    return attachment && attachment.state === 'active'
      && attachment.ownerId === this.state.playerId && attachment.targetId === wreck.id
      ? attachment : null;
  },

  validatePlayerTowDelivery(payload = {}) {
    const marker = this._markerById(payload.markerId);
    if (!marker || !marker.playerLoss || marker.playerLoss.lossId !== payload.lossId) return false;
    const wreck = this._resolveBoundWreck(marker.markerId);
    if (!wreck || wreck.id !== payload.hulkEntityId || !wreck.pos
      || !this._activePlayerTowAttachment(wreck)) return false;
    const displaced = Math.hypot(wreck.pos.x - marker.pos.x, wreck.pos.z - marker.pos.z);
    if (displaced < 80) return false;
    const jurisdiction = protectedStationAt(this.state, wreck);
    return Boolean(jurisdiction && jurisdiction.stationId === payload.stationId);
  },

  consumePlayerTowDelivery(payload) {
    if (!payload || !this._playerTowDeliveries || !this._playerTowDeliveries.has(payload)) return false;
    this._playerTowDeliveries.delete(payload);
    return true;
  },

  _tryCompletePlayerTow(marker) {
    const wreck = this._resolveBoundWreck(marker.markerId);
    if (!wreck || !wreck.pos || !this._activePlayerTowAttachment(wreck)) return false;
    const displaced = Math.hypot(wreck.pos.x - marker.pos.x, wreck.pos.z - marker.pos.z);
    if (displaced < 80) return false;
    const jurisdiction = protectedStationAt(this.state, wreck);
    if (!jurisdiction) return false;
    marker.playerLoss.towStatus = 'active';
    const delivery = {
      lossId: marker.playerLoss.lossId,
      markerId: marker.markerId,
      hulkEntityId: wreck.id,
      stationId: jurisdiction.stationId,
      shipSnapshot: clonePlain(marker.playerLoss.shipSnapshot),
      cargoManifest: clonePlain(marker.playerLoss.cargoManifest),
      result: null,
    };
    // Object identity is the synchronous commit capability. Only this owner can mint it, and it is
    // minted only after the live attachment, displacement, and station jurisdiction checks above.
    // It is deliberately transient: a save cannot replay an old delivery receipt.
    this._playerTowDeliveries.add(delivery);
    this.bus.emit('playerDefeat:wreckDelivered', delivery);
    if (Array.isArray(delivery.remainingCargoManifest)) {
      marker.playerLoss.cargoManifest = normalizeCargoManifest(delivery.remainingCargoManifest);
      marker.playerLoss.cargoQty = marker.playerLoss.cargoManifest.reduce((sum, row) => sum + row.qty, 0);
      if (wreck.data) {
        wreck.data.cargoManifest = clonePlain(marker.playerLoss.cargoManifest);
        wreck.data.playerLoss = clonePlain(marker.playerLoss);
      }
    }
    if (!delivery.result || delivery.result.ok !== true) return false;
    marker.playerLoss.towStatus = 'recovered';
    this.bus.emit('playerDefeat:wreckRecovered', {
      lossId: marker.playerLoss.lossId,
      markerId: marker.markerId,
      hulkEntityId: wreck.id,
      stationId: jurisdiction.stationId,
      shipId: delivery.result.shipId || null,
    });
    return this._removePlayerLossMarker(marker, 'player_hulk_recovered');
  },

  _removePlayerLossMarker(marker, reason) {
    if (!marker || !marker.markerId) return false;
    const own = ensureAftermathState(this.state);
    const list = own.bySector[marker.sectorId] || [];
    own.bySector[marker.sectorId] = list.filter((item) => item && item.markerId !== marker.markerId);
    const wreck = this._resolveBoundWreck(marker.markerId);
    this._spawned.delete(marker.markerId);
    if (wreck) {
      if (this.helpers && typeof this.helpers.removeEntity === 'function') {
        // Core owns entity retirement. Its lifetime sweep removes every entity-index entry,
        // publishes destruction once, and lets the physics owner retire the body next tick.
        this.helpers.removeEntity(wreck.id);
      } else {
        // Isolated low-level owners can omit core helpers. Preserve the established fallback there,
        // while production always takes the indexed lifetime path above.
        wreck.alive = false;
        if (this.state.entities && typeof this.state.entities.delete === 'function') this.state.entities.delete(wreck.id);
        if (Array.isArray(this.state.entityList)) {
          const index = this.state.entityList.indexOf(wreck);
          if (index >= 0) this.state.entityList.splice(index, 1);
        }
        this.bus.emit('entity:destroyed', { id: wreck.id, type: wreck.type, reason });
      }
    }
    return true;
  },

  _clearLiveRefs(sectorId) {
    if (!sectorId || !this._spawned) {
      if (this._spawned) this._spawned.clear();
      return;
    }
    const markers = aftermathForSector(this.state, sectorId);
    for (const marker of markers) this._spawned.delete(marker.markerId);
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
    const playerLossMarker = this._markerById(markerId);
    if (playerLossMarker && playerLossMarker.playerLoss) return false;
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
    const bySector = {};
    for (const sectorId of Object.keys(own.bySector)) {
      const markers = trimAndSort(Array.isArray(own.bySector[sectorId]) ? own.bySector[sectorId] : []);
      if (markers.length) bySector[sectorId] = markers;
    }
    return { schemaVersion: STATE_VERSION, seed: own.seed, bySector, causes: trimCauses(own.causes) };
  },

  deserialize(data) {
    const own = ensureAftermathState(this.state);
    own.seed = data && typeof data.seed === 'number' ? data.seed >>> 0 : seedOf(this.state);
    own.bySector = {};
    own.causes = trimCauses(data && data.causes);
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
    if (this._pendingOffers) this._pendingOffers.clear();
    this._playerTowDeliveries = new WeakSet();
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
      if (this._onSurvivorPodEjected) this.bus.off('survivorPod:ejected', this._onSurvivorPodEjected);
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
    this._onKilled = this._onSurvivorPodEjected = this._onSectorEnter = this._onSectorExit = null;
    this._onSalvageCompleted = this._onEncounterResolved = this._onDocked = null;
    this._onOfferBoarded = this._onMissionAccepted = this._onMissionCompleted = this._onMissionFailed = null;
    this._onNewGame = this._onSaveRestoring = this._onSaveLoaded = this._onSaveError = null;
    this._saveRestoring = false;
    if (this._spawned) this._spawned.clear();
    if (this._pendingOffers) this._pendingOffers.clear();
  },
};

export default aftermathWrecks;
