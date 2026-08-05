// Depth Program V2 flavor reachability.
//
// This observer binds authored flavor only to verified gameplay carriers. It never creates a
// landmark, proximity sample, encounter, trade, or scanner result, and every surfaced line goes
// through the one-voice helper. Packs whose physical actors do not yet exist therefore remain
// deliberately silent until an entity carries their explicit flavor identity.

import { hash32 } from '../core/rng.js';
import { FLAVOR_PACKS } from '../data/flavor/index.generated.js';

const SCHEMA_VERSION = 1;
const RECEIPT_CAP = 256;
const ROAMING_CAP = 32;
const ROAMING_SHAPES = new Set(['convoy_departure', 'trader_run']);
const ROAMING_FAMILY = 'convoy_industrial_route';
const HUSH_SOURCE_REF = 'planet_hush';
const HUSH_SECTOR_ID = 'sector_eunomia_gulf';
const QUIESSENCE_TARGET_REF = 'landmark_c14_quiessence';
const QUIESSENCE_SECTOR_ID = 'sector_pallas_drift';

const ROAMING_PACK = requirePack('roaming_events');
const HUSH_PACK = requirePack('hush');
const QUIESSENCE_PACK = requirePack('quiessence');
const LANDMARK_PACK = requirePack('landmark_lore');

const ROAMING_BY_EVENT_ID = new Map(ROAMING_PACK.entries.map((entry) => [entry.eventId, entry]));
const LANDMARK_BY_TARGET_REF = new Map(LANDMARK_PACK.entries.map((entry) => [entry.targetRef, entry]));
const LANDMARK_BY_PHYSICAL_POI = new Map(LANDMARK_PACK.entries
  .filter((entry) => entry.location && entry.location.poiId)
  .map((entry) => [`${entry.location.sectorId}:${entry.location.poiId}`, entry]));
const QUIESSENCE_BY_SHIP_INDEX = new Map(QUIESSENCE_PACK.entries
  .map((entry) => [entry.shipIndex | 0, entry]));

function requirePack(id) {
  const pack = FLAVOR_PACKS[id];
  if (!pack || !Array.isArray(pack.entries)) throw new Error(`V2 flavor runtime requires pack ${id}`);
  return pack;
}

function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    sequence: 0,
    roamingByEncounter: {},
    presentedReceipts: [],
  };
}

function normalizeState(input) {
  const source = input && typeof input === 'object' ? input : {};
  const roamingByEncounter = {};
  const records = source.roamingByEncounter && typeof source.roamingByEncounter === 'object'
    ? Object.entries(source.roamingByEncounter)
    : [];
  for (const [encounterId, record] of records.slice(-ROAMING_CAP)) {
    if (!encounterId || !record || !ROAMING_BY_EVENT_ID.has(record.eventId)) continue;
    roamingByEncounter[String(encounterId)] = {
      encounterId: String(encounterId),
      eventId: String(record.eventId),
      sectorId: stringOrNull(record.sectorId),
      zoneId: stringOrNull(record.zoneId),
      fingerprint: stringOrNull(record.fingerprint),
      boundSequence: nonnegativeInt(record.boundSequence),
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    sequence: nonnegativeInt(source.sequence),
    roamingByEncounter,
    presentedReceipts: uniqueStrings(source.presentedReceipts, RECEIPT_CAP),
  };
}

export const v2FlavorRuntime = {
  name: 'v2Flavor',

  init(ctx) {
    for (const off of this._unsubs || []) {
      try { off(); } catch (_) {}
    }
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ensureState();
    this._listen('encounter:spawned', (payload) => this._onEncounterSpawned(payload));
    this._listen('encounter:resolved', (payload) => this._onEncounterResolved(payload));
    this._listen('contactHail:offer', (payload) => this._onContactHail(payload));
    this._listen('signal:scanResults', (payload) => this._onSignalResults(payload));
    this._listen('economy:tradeCompleted', (payload) => this._onTradeCompleted(payload));
    this._listen('poi:identified', (payload) => this._onPoiIdentified(payload));
  },

  newGame() {
    this.state.v2Flavor = freshState();
  },

  serialize() {
    return clonePlain(normalizeState(this._ensureState()));
  },

  deserialize(data) {
    this.state.v2Flavor = normalizeState(data);
    return this.state.v2Flavor;
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (_) {}
    }
    this._unsubs = [];
  },

  _listen(event, handler) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(event, handler);
    if (typeof off === 'function') this._unsubs.push(off);
  },

  _ensureState() {
    if (!this.state.v2Flavor || typeof this.state.v2Flavor !== 'object') {
      this.state.v2Flavor = freshState();
    }
    return this.state.v2Flavor;
  },

  _onEncounterSpawned(payload) {
    if (!payload || !ROAMING_SHAPES.has(payload.kind) || !this._isFlight()) return;
    const encounterId = stringOrNull(payload.encounterId);
    const sectorId = stringOrNull(payload.sectorId) || currentSectorId(this.state);
    const zoneId = stringOrNull(payload.zoneId);
    if (!encounterId || !sectorId || !zoneId || sectorId !== currentSectorId(this.state)) return;
    if (!hasLiveConvoyCarrier(this.state, sectorId, zoneId)) return;
    if (!hasLiveEncounterEntity(this.state, encounterId, sectorId, zoneId)) return;

    const own = this._ensureState();
    let record = own.roamingByEncounter[encounterId];
    if (!record) {
      const fingerprint = stringOrNull(payload.fingerprint);
      const index = hash32(
        seedOf(this.state), encounterId, fingerprint || '', sectorId, zoneId, 'v2-roaming-event',
      ) % ROAMING_PACK.entries.length;
      const entry = ROAMING_PACK.entries[index];
      record = {
        encounterId,
        eventId: entry.eventId,
        sectorId,
        zoneId,
        fingerprint,
        boundSequence: own.sequence,
      };
      own.roamingByEncounter[encounterId] = record;
      pruneRoaming(own);
    }

    if (this.state.bandRadio && this.state.bandRadio.channelId) {
      this._presentRoaming(record, 'band', { eventId: encounterId });
    }
  },

  _onEncounterResolved(payload) {
    if (!payload || String(payload.outcome || '').startsWith('aborted:')) return;
    const record = this._recordForEncounter(payload.encounterId);
    if (record) this._presentRoaming(record, 'news', { eventId: record.encounterId });
  },

  _onContactHail(payload) {
    const entity = physicalEntity(this.state, payload && payload.targetId);
    const record = roamingRecordForEntity(this._ensureState(), entity);
    if (record) this._presentRoaming(record, 'hail', { entityId: entity.id, eventId: record.encounterId });
  },

  _onTradeCompleted(payload) {
    if (!payload) return;
    const direct = this._recordForEncounter(payload.encounterId || payload.sourceEncounterId);
    const entity = physicalEntity(this.state, payload.targetId || payload.entityId);
    const record = direct || roamingRecordForEntity(this._ensureState(), entity);
    if (record) this._presentRoaming(record, 'trade', {
      entityId: entity && entity.id,
      eventId: record.encounterId,
    });
  },

  _onSignalResults(payload) {
    if (!payload || !Array.isArray(payload.signals) || !this._isCurrentSector(payload.sectorId)) return;
    for (const signal of payload.signals) {
      const entity = physicalSignalEntity(this.state, signal);
      if (!entity) continue;

      const roaming = roamingRecordForEntity(this._ensureState(), entity);
      if (roaming && this._presentRoaming(roaming, 'scan', {
        entityId: entity.id,
        eventId: roaming.encounterId,
      })) return;

      const data = entity.data || {};
      if (data.flavorSourceId === HUSH_SOURCE_REF
          && currentSectorId(this.state) === HUSH_SECTOR_ID) {
        if (this._presentHush(entity, signal)) return;
        continue;
      }
      if (data.flavorTargetRef === QUIESSENCE_TARGET_REF
          && currentSectorId(this.state) === QUIESSENCE_SECTOR_ID) {
        if (this._presentQuiessence(entity)) return;
        continue;
      }
      if (data.flavorTargetRef
          && this._presentLandmarkEntity(entity, data.flavorTargetRef)) return;
    }
  },

  _onPoiIdentified(payload) {
    const sectorId = currentSectorId(this.state);
    const poiId = stringOrNull(payload && payload.poiId);
    if (!sectorId || !poiId) return;
    const entry = LANDMARK_BY_PHYSICAL_POI.get(`${sectorId}:${poiId}`);
    if (!entry || !physicalPoiEntity(this.state, poiId)) return;
    this._presentLandmark(entry, { sourceRef: entry.targetRef });
  },

  _presentRoaming(record, surface, context) {
    const entry = record && ROAMING_BY_EVENT_ID.get(record.eventId);
    if (!entry) return false;
    const candidates = entry.lines.filter((line) => line.surface === surface);
    if (!candidates.length) return false;
    const line = candidates[hash32(
      seedOf(this.state), record.encounterId, record.fingerprint || '', surface, 'v2-roaming-line',
    ) % candidates.length];
    return this._say({
      packId: ROAMING_PACK.id,
      sourceRef: record.eventId,
      surface,
      line,
      channel: channelForSurface(surface),
      receipt: `${ROAMING_PACK.id}:${record.encounterId}:${surface}`,
      context,
    });
  },

  _presentHush(entity, signal) {
    const phase = hushPhase(signal);
    const candidates = HUSH_PACK.entries.filter((entry) => entry.phase === phase);
    if (!candidates.length) return false;
    const line = candidates[hash32(
      seedOf(this.state), entity.id, phase, nonnegativeInt(signal.scanCount), 'v2-hush-line',
    ) % candidates.length];
    return this._say({
      packId: HUSH_PACK.id,
      sourceRef: HUSH_SOURCE_REF,
      surface: 'scan',
      line,
      channel: 'info',
      receipt: `${HUSH_PACK.id}:${entity.id}:${phase}`,
      context: { entityId: entity.id },
    });
  },

  _presentQuiessence(entity) {
    const index = entity && entity.data && nonnegativeInt(entity.data.quiessenceShipIndex);
    const line = QUIESSENCE_BY_SHIP_INDEX.get(index);
    if (!line) return false;
    return this._say({
      packId: QUIESSENCE_PACK.id,
      sourceRef: QUIESSENCE_TARGET_REF,
      surface: 'scan',
      line,
      channel: 'info',
      receipt: `${QUIESSENCE_PACK.id}:${entity.id}:${index}`,
      context: { entityId: entity.id },
    });
  },

  _presentLandmarkEntity(entity, targetRef) {
    const entry = LANDMARK_BY_TARGET_REF.get(targetRef);
    const sectorId = currentSectorId(this.state);
    if (!entry || !entry.location || entry.location.sectorId !== sectorId) return false;
    return this._presentLandmark(entry, { sourceRef: entry.targetRef, entityId: entity.id });
  },

  _presentLandmark(entry, context) {
    const line = entry.lines[hash32(
      seedOf(this.state), entry.targetRef, 'v2-landmark-line',
    ) % entry.lines.length];
    return this._say({
      packId: LANDMARK_PACK.id,
      sourceRef: entry.targetRef,
      surface: 'scan',
      line,
      channel: 'info',
      receipt: `${LANDMARK_PACK.id}:${entry.targetRef}:scan`,
      context,
    });
  },

  _say({ packId, sourceRef, surface, line, channel, receipt, context = {} }) {
    const own = this._ensureState();
    if (!line || !line.text || own.presentedReceipts.includes(receipt)) return false;
    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return false;
    const accepted = voice.say({
      id: `v2:${receipt}`,
      channel,
      priority: channel === 'band' ? 5 : undefined,
      kind: 'v2Flavor',
      ttl: channel === 'band' ? 7 : 5,
      text: line.text,
    });
    if (accepted === false) return false;
    own.presentedReceipts.push(receipt);
    if (own.presentedReceipts.length > RECEIPT_CAP) {
      own.presentedReceipts.splice(0, own.presentedReceipts.length - RECEIPT_CAP);
    }
    own.sequence++;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('v2:flavorPresented', {
        packId,
        sourceRef,
        surface,
        lineId: line.id,
        sequence: own.sequence,
        ...context,
      });
    }
    return true;
  },

  _recordForEncounter(encounterId) {
    const id = stringOrNull(encounterId);
    return id ? this._ensureState().roamingByEncounter[id] || null : null;
  },

  _isFlight() {
    return !!this.state && this.state.mode === 'flight' && !(this.state.ui && this.state.ui.docked);
  },

  _isCurrentSector(sectorId) {
    const current = currentSectorId(this.state);
    return !!current && (!sectorId || sectorId === current);
  },
};

function hasLiveConvoyCarrier(state, sectorId, zoneId) {
  const active = state && state.livingPoiBehaviors && state.livingPoiBehaviors.activeByZone;
  const row = active && active[zoneId];
  return !!(row
    && row.familyId === ROAMING_FAMILY
    && row.sectorId === sectorId
    && row.zoneId === zoneId
    && row.status !== 'resolved'
    && row.status !== 'closed');
}

function hasLiveEncounterEntity(state, encounterId, sectorId, zoneId) {
  for (const entity of state && state.entityList || []) {
    const ai = entity && entity.data && entity.data.ai;
    if (!ai || entity.alive === false || !finitePos(entity.pos)) continue;
    if (String(ai.encounterId || '') !== encounterId) continue;
    if (ai.sectorId !== sectorId || ai.zoneId !== zoneId) continue;
    return true;
  }
  return false;
}

function roamingRecordForEntity(own, entity) {
  const encounterId = entity && entity.data && entity.data.ai && entity.data.ai.encounterId;
  return encounterId != null ? own.roamingByEncounter[String(encounterId)] || null : null;
}

function physicalSignalEntity(state, signal) {
  if (!signal || signal.entityId == null) return null;
  return physicalEntity(state, signal.entityId);
}

function physicalEntity(state, entityId) {
  if (entityId == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  let entity = state.entities.get(entityId);
  if (!entity && typeof entityId === 'string' && /^\d+$/.test(entityId)) {
    entity = state.entities.get(Number(entityId));
  }
  if (!entity || entity.alive === false || !finitePos(entity.pos)) return null;
  const data = entity.data || {};
  const entitySector = data.sectorId || data.ai && data.ai.sectorId;
  if (entitySector && entitySector !== currentSectorId(state)) return null;
  return entity;
}

function physicalPoiEntity(state, poiId) {
  const active = state && state.world && state.world.activeSector;
  if (!active || active.id && active.id !== currentSectorId(state) || !Array.isArray(active.pois)) return null;
  const row = active.pois.find((poi) => poi && poi.poiId === poiId && poi.id != null);
  if (!row) return null;
  const entity = physicalEntity(state, row.id);
  if (!entity || !entity.data || entity.data.poiId !== poiId) return null;
  return entity;
}

function hushPhase(signal) {
  const stage = Math.max(1, nonnegativeInt(signal && signal.stage));
  const scans = Math.max(1, nonnegativeInt(signal && signal.scanCount));
  if (scans > stage) return 'repeat';
  if (stage <= 1) return 'passive';
  if (stage === 2) return 'focused';
  return 'complete';
}

function channelForSurface(surface) {
  if (surface === 'hail') return 'comms';
  if (surface === 'news' || surface === 'trade') return 'news';
  if (surface === 'band') return 'band';
  return 'info';
}

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || null;
}

function seedOf(state) {
  return state && state.meta && Number.isFinite(Number(state.meta.seed)) ? Number(state.meta.seed) : 1;
}

function pruneRoaming(own) {
  const keys = Object.keys(own.roamingByEncounter);
  if (keys.length <= ROAMING_CAP) return;
  keys.sort((a, b) => (
    nonnegativeInt(own.roamingByEncounter[a].boundSequence)
    - nonnegativeInt(own.roamingByEncounter[b].boundSequence)
  ) || a.localeCompare(b));
  for (const key of keys.slice(0, keys.length - ROAMING_CAP)) delete own.roamingByEncounter[key];
}

function uniqueStrings(value, cap) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const text = stringOrNull(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result.slice(-cap);
}

function stringOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function nonnegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function finitePos(pos) {
  return !!pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.z));
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

export default v2FlavorRuntime;
