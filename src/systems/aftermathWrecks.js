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

const STATE_VERSION = 2;
const MAX_PER_SECTOR = 8;
const MAX_SPAWNED_PER_SECTOR = 6;
const MAX_CAUSES = 24;
const WRECK_RADIUS = 9;
const WRECK_SALVAGE_TIME = 8;
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
  const victim = marker.victimLabel || marker.victimClass || 'ship';
  const cause = marker.cause;
  if (cause && cause.actor) return `${victim} destroyed in ${zone}; evidence links ${cause.actor} to ${cause.motiveId}.`;
  return `${victim} destroyed in ${zone}; black box lists killer ${marker.killerId == null ? 'unknown' : marker.killerId}.`;
}

function newsLine(marker) {
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
    const evicted = arr.splice(MAX_PER_SECTOR);
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
  };
  const savedPool = normalizeSalvagePool(input.salvagePool);
  marker.salvagePool = savedPool == null ? initialPoolForMarker(marker) : savedPool;
  return marker;
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
    this._spawned = new Map();
    this._pendingOffers = new Map();
    this._saveRestoring = false;
    ensureAftermathState(this.state);

    this._onKilled = (payload) => this._recordKill(payload || {});
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
    const entity = entityFor(this.state, payload.id);
    const marker = makeMarker(this.state, payload, entity);
    return rememberMarker(this.state, this.bus, marker, (evicted) => {
      if (!this._spawned) return;
      for (const item of evicted) {
        if (item && item.markerId) this._spawned.delete(item.markerId);
      }
    });
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
    const cls = wreckClassById(marker.wreckClass) || wreckClassById('battlefield');
    const line = aftermathLine(marker);
    return {
      type: 'wreck',
      pos: { x: marker.pos.x, z: marker.pos.z },
      radius: WRECK_RADIUS,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: marker.wreckClass === 'military' ? 'military' : 'ship',
        loot: [],
        salvagePool: poolForMarker(marker),
        salvageTimeLeft: WRECK_SALVAGE_TIME,
        scanLabel: cls ? cls.scanLabel : 'Battle-scarred Hulk',
        wreckClass: marker.wreckClass || 'battlefield',
        wreckClassLabel: cls ? cls.label : marker.wreckClassLabel || 'Battlefield Wreck',
        wreckClassBlurb: cls ? cls.blurb : null,
        provenanceLine: line,
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
      },
    };
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
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
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
    this._onKilled = this._onSectorEnter = this._onSectorExit = null;
    this._onSalvageCompleted = this._onEncounterResolved = this._onDocked = null;
    this._onOfferBoarded = this._onMissionAccepted = this._onMissionCompleted = this._onMissionFailed = null;
    this._onNewGame = this._onSaveRestoring = this._onSaveLoaded = this._onSaveError = null;
    this._saveRestoring = false;
    if (this._spawned) this._spawned.clear();
    if (this._pendingOffers) this._pendingOffers.clear();
  },
};

export default aftermathWrecks;
