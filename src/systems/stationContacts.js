// Event-owned contact continuity and recent berth traffic. This system never writes economy,
// faction, cargo, credits, heat, missions, or traffic; it records conversations and receipts.

import { COMMODITIES } from '../data/commodities.js';
import {
  CONTACT_COUNTER_DEFS,
  createInitialStationContactCounters,
  normalizeStationContactCounters,
  normalizeStationContactRecord,
} from '../data/stationContacts.js';
import {
  VONN_FREIGHT_CASE_VERSION,
  VONN_FREIGHT_CONTACT_ID,
  VONN_FREIGHT_SECTOR_ID,
  VONN_FREIGHT_SHAPE_ID,
  VONN_FREIGHT_STATION_ID,
  VONN_FREIGHT_ZONE_ID,
  normalizeVonnFreightCustody,
  normalizeVonnFreightLoss,
  vonnFreightLossFor,
} from '../data/vonnFreightLoss.js';
import {
  DOSS_ARCHIVE_CONTACT_ID,
  DOSS_ARCHIVE_COUNTER_ID,
  DOSS_ARCHIVE_SOURCES,
  dossArchiveEvidence,
} from '../data/dossArchive.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((def) => [def.id, def]));
const MAX_TRAFFIC_RECEIPTS = 8;
const MAX_PENDING_VONN_RECEIPTS = 8;

function ensureContactBag(state) {
  const player = state.player || (state.player = {});
  if (!player.stationContacts || typeof player.stationContacts !== 'object' || Array.isArray(player.stationContacts)) {
    player.stationContacts = {};
  }
  return player.stationContacts;
}

function ensureCounterBag(state) {
  const player = state.player || (state.player = {});
  player.stationContactCounters = normalizeStationContactCounters(player.stationContactCounters);
  return player.stationContactCounters;
}

function ensureLifeState(state) {
  if (!state.stationLife || typeof state.stationLife !== 'object') state.stationLife = {};
  if (!Array.isArray(state.stationLife.traffic)) state.stationLife.traffic = [];
  return state.stationLife;
}

function commodityLabel(id) {
  const def = id && COMMODITY_BY_ID.get(id);
  return def && def.name ? def.name : String(id || 'cargo').replace(/^cmdty_/, '').replace(/_/g, ' ');
}

function freightCommodity(payload) {
  if (!payload) return null;
  if (payload.primaryCommodityId) return payload.primaryCommodityId;
  const trade = Array.isArray(payload.trades) && payload.trades[0];
  if (trade && trade.commodityId) return trade.commodityId;
  const pressure = Array.isArray(payload.pressures) && payload.pressures[0];
  return pressure && (pressure.commodityId || pressure.good) || null;
}

function sameFlags(a, b) {
  const left = a || {};
  const right = b || {};
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => left[key] === true && right[key] === true);
}

function isDossDiscoveryPlate(payload) {
  const sectorId = String(payload && payload.sectorId || '');
  const poiId = String(payload && payload.poiId || '');
  return (sectorId === 'sector_veil_nebula' && poiId === 'poi_anomaly')
    || (sectorId === 'sector_charon_expanse' && poiId === 'poi_charon_tether_wreck');
}

function sameVonnCase(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function validVonnLossPayload(payload) {
  return !!(payload && typeof payload === 'object'
    && typeof payload.intentId === 'string' && payload.intentId
    && typeof payload.encounterId === 'string' && payload.encounterId
    && payload.stationId === VONN_FREIGHT_STATION_ID
    && payload.sectorId === VONN_FREIGHT_SECTOR_ID
    && typeof payload.manifestId === 'string' && payload.manifestId
    && typeof payload.freighterKey === 'string' && payload.freighterKey
    && typeof payload.primaryCommodityId === 'string' && payload.primaryCommodityId
    && Number.isFinite(payload.totalQty) && payload.totalQty > 0);
}

function matchingVonnMarker(state, live, custody, payload) {
  const markers = state && state.aftermathWrecks && state.aftermathWrecks.bySector
    && state.aftermathWrecks.bySector[VONN_FREIGHT_SECTOR_ID];
  if (!Array.isArray(markers)) return null;
  const matches = markers.filter((marker) => {
    const freight = marker && marker.freightIdentity;
    const pos = marker && marker.pos;
    return marker && freight && pos
      && marker.sectorId === VONN_FREIGHT_SECTOR_ID
      && marker.zoneId === VONN_FREIGHT_ZONE_ID
      && marker.encounterId === live.id
      && freight.manifestId === custody.manifestId
      && freight.freighterKey === custody.freighterKey
      && freight.role === 'hauler'
      && Number.isFinite(pos.x) && Number.isFinite(pos.z)
      && payload.manifestId === custody.manifestId
      && payload.freighterKey === custody.freighterKey;
  });
  return matches.length === 1 ? matches[0] : null;
}

function qualifyingVonnLoss(state, payload) {
  if (!validVonnLossPayload(payload)) return null;
  const live = state && state.encounterDirector && state.encounterDirector.live
    && state.encounterDirector.live[payload.encounterId];
  const custody = live && live.data && live.data.freightCargoCustody;
  if (!live || !custody
    || live.shapeId !== VONN_FREIGHT_SHAPE_ID
    || live.sectorId !== VONN_FREIGHT_SECTOR_ID
    || live.zoneId !== VONN_FREIGHT_ZONE_ID
    || live.data.destId !== VONN_FREIGHT_STATION_ID
    || custody.encounterId !== live.id
    || custody.manifestId !== payload.manifestId
    || custody.freighterKey !== payload.freighterKey
    || custody.commodityId !== payload.primaryCommodityId
    || typeof custody.custodyId !== 'string' || !custody.custodyId
    || typeof custody.carrierIdentityKey !== 'string' || !custody.carrierIdentityKey) return null;
  const marker = matchingVonnMarker(state, live, custody, payload);
  if (!marker || typeof marker.markerId !== 'string' || !marker.markerId) return null;
  const caseFile = normalizeVonnFreightLoss({
    schemaVersion: VONN_FREIGHT_CASE_VERSION,
    lossIntentId: payload.intentId,
    encounterId: live.id,
    custodyId: custody.custodyId,
    manifestId: custody.manifestId,
    freighterKey: custody.freighterKey,
    carrierIdentityKey: custody.carrierIdentityKey,
    markerId: marker.markerId,
    stationId: VONN_FREIGHT_STATION_ID,
    sectorId: VONN_FREIGHT_SECTOR_ID,
    zoneId: VONN_FREIGHT_ZONE_ID,
    commodityId: custody.commodityId,
    lossQty: Math.floor(payload.totalQty),
    markerPos: { x: marker.pos.x, z: marker.pos.z },
    wreckStatus: 'open',
    followupHeard: false,
    custody: null,
  });
  return caseFile;
}

export const stationContacts = {
  name: 'stationContacts',
  state: null,
  bus: null,
  _subs: null,
  _vonnFreightReceipts: null,

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._subs = [];
    this._vonnFreightReceipts = new Map();
    ensureContactBag(this.state);
    ensureCounterBag(this.state);
    ensureLifeState(this.state);
    const on = (event, handler) => {
      this.bus.on(event, handler);
      this._subs.push([event, handler]);
    };
    on('ui:talkContact', (payload = {}) => this._recordTalk(payload));
    on('stationContact:counterDelta', (payload = {}) => this._recordCounterDelta(payload));
    on('economy:tradeCompleted', (payload = {}) => {
      if (payload.stationId === 'station_beltout' && payload.side === 'buy'
        && String(payload.commodityId || '').startsWith('cmdty_ore_')) {
        this._recordCounterDelta({ trackerId: 'voss.purchases', delta: 1, reason: 'ore-purchase' });
      }
    });
    on('customs:breakScan', (payload = {}) => {
      if (payload.factionId === 'faction_scn') {
        this._recordCounterDelta({ trackerId: 'hale.scanBreaks', delta: 1, reason: 'scan-break' });
      }
    });
    on('freight:arrival', (payload = {}) => this._recordFreight(payload, 'arrival'));
    on('freight:loss', (payload = {}) => {
      this._recordFreight(payload, 'loss');
      this._recordVonnFreightLoss(payload);
    });
    on('freight:custodyReceipt', (payload = {}) => this._recordVonnFreightCustody(payload));
    on('aftermathWreck:completed', (payload = {}) => this._recordVonnWreckCompletion(payload));
    on('save:restoring', () => this._clearVonnFreightReceipts());
    on('vestaOreCache:resolved', (payload = {}) => {
      if (payload.recordId === 'vesta-ore-cache:shift-end:v1') this._reconcileDossArchive('vesta-resolved');
    });
    on('discovery:plateUnlocked', (payload = {}) => {
      if (isDossDiscoveryPlate(payload)) this._reconcileDossArchive('discovery-plate');
    });
    on('save:loaded', () => {
      this._reconcileDossArchive('save-loaded');
      this._normalizeVonnFreightLoss('save-loaded');
    });
    this._reconcileDossArchive('init');
  },

  newGame() {
    if (!this.state) return;
    this.state.player.stationContacts = {};
    this.state.player.stationContactCounters = createInitialStationContactCounters();
    this.state.stationLife = { traffic: [] };
    this._clearVonnFreightReceipts();
  },

  _recordCounterDelta(payload) {
    const trackerId = String(payload.trackerId || '');
    const def = CONTACT_COUNTER_DEFS[trackerId];
    const delta = Math.trunc(Number(payload.delta) || 0);
    if (!def || !delta) return;
    const previous = ensureCounterBag(this.state);
    const next = normalizeStationContactCounters({
      ...previous,
      [trackerId]: previous[trackerId] + delta,
    });
    this.state.player.stationContactCounters = next;
    this.bus.emit('stationContact:counterChanged', {
      trackerId,
      contactId: def.contactId,
      previous: previous[trackerId],
      value: next[trackerId],
      reason: String(payload.reason || '').slice(0, 96) || null,
    });
  },

  _recordTalk(payload) {
    const contactId = String(payload.contactId || '').slice(0, 96);
    if (!contactId) return;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[contactId]);
    const choice = String(payload.choiceId || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 48);
    const choiceFlag = choice ? `choice_${choice}` : null;
    const meaningful = choice && choice !== 'dismiss' && choice !== 'bye';
    const firstMeaningfulChoice = meaningful && !previous.flags[choiceFlag];
    const flags = { ...previous.flags };
    if (choiceFlag) flags[choiceFlag] = true;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const vonnFreightLoss = contactId === VONN_FREIGHT_CONTACT_ID && choice === 'wrecks'
      && previous.vonnFreightLoss && !previous.vonnFreightLoss.followupHeard
      ? { ...previous.vonnFreightLoss, followupHeard: true }
      : previous.vonnFreightLoss;
    const next = normalizeStationContactRecord({
      ...previous,
      met: true,
      talkCount: previous.talkCount + 1,
      standing: previous.standing + (firstMeaningfulChoice ? 1 : 0),
      stationId: payload.stationId || previous.stationId,
      canonicalKey: payload.canonicalKey || previous.canonicalKey,
      name: payload.name || previous.name,
      lastChoice: choice || previous.lastChoice,
      lastTalkSimTime: now,
      lastDockSimTime: now,
      flags,
      ...(vonnFreightLoss ? { vonnFreightLoss } : {}),
    });
    bag[contactId] = next;
    this.bus.emit('stationContact:changed', { contactId, record: { ...next, flags: { ...next.flags } } });
  },

  _recordFreight(payload, kind) {
    const stationId = payload && payload.stationId ? String(payload.stationId) : null;
    if (!stationId) return;
    const commodityId = freightCommodity(payload);
    const qty = Math.max(0, Math.round(Number(payload.totalQty) || 0));
    const cargo = commodityLabel(commodityId);
    const text = kind === 'arrival'
      ? `${cargo} shipment cleared berth${qty ? ` · ${qty}u` : ''}.`
      : `Inbound ${cargo} delayed after a freight loss.`;
    const model = ensureLifeState(this.state);
    const rec = {
      kind,
      stationId,
      commodityId,
      text,
      simTime: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      intentId: payload.intentId || null,
    };
    if (rec.intentId && model.traffic.some((entry) => entry.intentId === rec.intentId)) return;
    model.traffic.unshift(rec);
    if (model.traffic.length > MAX_TRAFFIC_RECEIPTS) model.traffic.length = MAX_TRAFFIC_RECEIPTS;
    this.bus.emit('stationLife:trafficChanged', { ...rec });
  },

  _writeVonnFreightLoss(caseFile, reason) {
    const normalizedCase = normalizeVonnFreightLoss(caseFile);
    if (!normalizedCase) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[VONN_FREIGHT_CONTACT_ID]);
    if (sameVonnCase(previous.vonnFreightLoss, normalizedCase)) return false;
    const next = normalizeStationContactRecord({ ...previous, vonnFreightLoss: normalizedCase });
    if (!next.vonnFreightLoss) return false;
    bag[VONN_FREIGHT_CONTACT_ID] = next;
    this.bus.emit('stationContact:changed', {
      contactId: VONN_FREIGHT_CONTACT_ID,
      record: { ...next, flags: { ...next.flags }, vonnFreightLoss: { ...next.vonnFreightLoss } },
      reason,
    });
    return true;
  },

  // This observes the one already-applied loss. It neither changes the manifest nor asks the
  // economy/law/cargo owners to do anything; a missing or mismatched durable wreck simply fails.
  _recordVonnFreightLoss(payload) {
    if (vonnFreightLossFor(this.state)) return false;
    const caseFile = qualifyingVonnLoss(this.state, payload);
    if (!caseFile || !this._writeVonnFreightLoss(caseFile, 'freight-loss')) return false;
    this._applyVonnFreightCustody(caseFile, this._vonnFreightReceipts && this._vonnFreightReceipts.get(caseFile.custodyId));
    return true;
  },

  _recordVonnFreightCustody(payload) {
    const receipt = normalizeVonnFreightCustody(payload);
    if (!receipt) return false;
    const pending = this._vonnFreightReceipts || (this._vonnFreightReceipts = new Map());
    pending.set(receipt.custodyId, receipt);
    while (pending.size > MAX_PENDING_VONN_RECEIPTS) pending.delete(pending.keys().next().value);
    return this._applyVonnFreightCustody(vonnFreightLossFor(this.state), receipt);
  },

  _applyVonnFreightCustody(caseFile, receipt) {
    if (!caseFile || !receipt) return false;
    const custody = normalizeVonnFreightCustody(receipt, caseFile);
    if (!custody || sameVonnCase(caseFile.custody, custody)) return false;
    const wrote = this._writeVonnFreightLoss({ ...caseFile, custody }, 'freight-custody-receipt');
    if (wrote && this._vonnFreightReceipts) this._vonnFreightReceipts.delete(custody.custodyId);
    return wrote;
  },

  _clearVonnFreightReceipts() {
    if (this._vonnFreightReceipts) this._vonnFreightReceipts.clear();
  },

  _recordVonnWreckCompletion(payload) {
    const caseFile = vonnFreightLossFor(this.state);
    if (!caseFile || caseFile.wreckStatus !== 'open'
      || !payload || payload.markerId !== caseFile.markerId
      || payload.sectorId !== caseFile.sectorId) return false;
    return this._writeVonnFreightLoss({ ...caseFile, wreckStatus: 'completed' }, 'aftermath-wreck-completed');
  },

  _normalizeVonnFreightLoss(reason) {
    const bag = ensureContactBag(this.state);
    if (!bag[VONN_FREIGHT_CONTACT_ID]) return false;
    const previous = bag[VONN_FREIGHT_CONTACT_ID];
    const next = normalizeStationContactRecord(previous);
    if (sameVonnCase(previous.vonnFreightLoss, next.vonnFreightLoss)) return false;
    bag[VONN_FREIGHT_CONTACT_ID] = next;
    this.bus.emit('stationContact:changed', {
      contactId: VONN_FREIGHT_CONTACT_ID,
      record: { ...next, flags: { ...next.flags } },
      reason,
    });
    return true;
  },

  // Doss's source count is a projection of independently owned physical receipts. Never send it
  // through the generic delta path: duplicate/replayed events must leave exactly the same record.
  _reconcileDossArchive(reason = 'reconcile') {
    if (!this.state) return 0;
    const evidence = dossArchiveEvidence(this.state);
    const evidenceFlags = new Set(evidence.map((entry) => entry.flag));
    const bag = ensureContactBag(this.state);
    const hadRecord = !!bag[DOSS_ARCHIVE_CONTACT_ID];
    const previous = normalizeStationContactRecord(bag[DOSS_ARCHIVE_CONTACT_ID]);
    const flags = { ...previous.flags };
    for (const source of DOSS_ARCHIVE_SOURCES) delete flags[source.flag];
    for (const flag of evidenceFlags) flags[flag] = true;
    const next = normalizeStationContactRecord({ ...previous, flags });
    if (hadRecord || evidence.length) {
      bag[DOSS_ARCHIVE_CONTACT_ID] = next;
      if (!sameFlags(previous.flags, next.flags)) {
        this.bus.emit('stationContact:changed', {
          contactId: DOSS_ARCHIVE_CONTACT_ID,
          record: { ...next, flags: { ...next.flags } },
          reason,
        });
      }
    }

    const previousCounters = ensureCounterBag(this.state);
    const previousCount = previousCounters[DOSS_ARCHIVE_COUNTER_ID];
    const nextCounters = normalizeStationContactCounters({
      ...previousCounters,
      [DOSS_ARCHIVE_COUNTER_ID]: evidence.length,
    });
    this.state.player.stationContactCounters = nextCounters;
    if (previousCount !== nextCounters[DOSS_ARCHIVE_COUNTER_ID]) {
      const def = CONTACT_COUNTER_DEFS[DOSS_ARCHIVE_COUNTER_ID];
      this.bus.emit('stationContact:counterChanged', {
        trackerId: DOSS_ARCHIVE_COUNTER_ID,
        contactId: def.contactId,
        previous: previousCount,
        value: nextCounters[DOSS_ARCHIVE_COUNTER_ID],
        reason,
      });
    }
    return evidence.length;
  },

  destroy() {
    for (const [event, handler] of (this._subs || [])) this.bus.off(event, handler);
    this._subs = [];
    this._clearVonnFreightReceipts();
  },
};
