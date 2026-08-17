// Event-owned contact continuity and recent berth traffic. This system never writes economy,
// faction, cargo, credits, heat, missions, or traffic; it records conversations and receipts.

import { COMMODITIES } from '../data/commodities.js';
import {
  CONTACT_COUNTER_DEFS,
  FIXER_CONTACT,
  QUARTERMASTER_CONTACT,
  createInitialStationContactCounters,
  normalizeFixerMemory,
  normalizeQuartermasterMemory,
  normalizeStationContactCounters,
  normalizeStationContactRecord,
} from '../data/stationContacts.js';
import { shipworksStationAccess } from './ships.js';
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
const FIXER_PRIVATE_SOURCE = 'fixerPrivate';

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
  helpers: null,
  _subs: null,
  _vonnFreightReceipts: null,

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
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
    on('module:equipped', (payload = {}) => this._recordQuartermasterFit(payload));
    on('tech:researched', (payload = {}) => this._recordQuartermasterTech(payload));
    on('ship:livingHullChanged', (payload = {}) => this._recordQuartermasterScar(payload));
    on('frontierRumor:acquired', (payload = {}) => this._recordFixerAcquired(payload));
    on('frontierRumor:resolved', (payload = {}) => this._recordFixerResolved(payload));
    on('mission:accepted', (payload = {}) => this._recordFixerJobAccepted(payload));
    on('mission:completed', (payload = {}) => this._recordFixerJobOutcome(payload, 'completed'));
    on('mission:failed', (payload = {}) => this._recordFixerJobOutcome(payload, 'failed'));
    on('mission:expired', (payload = {}) => this._recordFixerJobOutcome(payload, 'expired'));
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

  // Plan 52 Quartermaster: the successful fit receipt is the causal introduction. This record
  // remembers only what Iri herself witnessed; ships/livingHull/tech remain their own writers.
  _recordQuartermasterFit(payload) {
    const access = shipworksStationAccess(this.state);
    const moduleId = String(payload && payload.defId || '').trim();
    if (!access.outfit || !moduleId) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[QUARTERMASTER_CONTACT.id]);
    const priorMemory = normalizeQuartermasterMemory(previous.quartermaster);
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const owned = this.state.player && this.state.player.ownedShips
      && this.state.player.ownedShips[this.state.player.activeShipIndex || 0];
    const memory = normalizeQuartermasterMemory({
      ...priorMemory,
      unlocked: true,
      fitCount: priorMemory.fitCount + 1,
      firstStationId: priorMemory.firstStationId || access.stationId,
      lastStationId: access.stationId,
      lastShipDefId: owned && owned.defId,
      lastModuleId: moduleId,
      lastEvent: 'fit',
      unlockedAt: priorMemory.unlocked ? priorMemory.unlockedAt : now,
      lastSeenAt: now,
    });
    this._writeQuartermaster(previous, memory, priorMemory.unlocked ? 'fit-witnessed' : 'introduced');
    this._speakQuartermaster(
      priorMemory.unlocked
        ? 'IRI MARCH: Seated. Make the rest of the loadout agree.'
        : 'IRI MARCH: Good. Bring me choices, not empty slots.',
      priorMemory.unlocked ? `fit:${memory.fitCount}` : 'introduced',
    );
    return true;
  },

  _recordQuartermasterTech(payload) {
    const nodeId = String(payload && payload.nodeId || '').trim();
    if (!nodeId) return false;
    const access = shipworksStationAccess(this.state);
    if (!access.outfit) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[QUARTERMASTER_CONTACT.id]);
    const priorMemory = normalizeQuartermasterMemory(previous.quartermaster);
    if (!priorMemory.unlocked) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const memory = normalizeQuartermasterMemory({
      ...priorMemory,
      techCount: priorMemory.techCount + 1,
      lastTechNodeId: nodeId,
      lastStationId: access.stationId,
      lastEvent: 'tech',
      lastSeenAt: now,
    });
    this._writeQuartermaster(previous, memory, 'tech-witnessed');
    this._speakQuartermaster(
      "IRI MARCH: New line's open. Fit for it, not around it.",
      `tech:${nodeId}`,
    );
    return true;
  },

  _recordQuartermasterScar(payload) {
    const hull = payload && payload.livingHull;
    const source = String(payload && payload.source || '').trim();
    const hasScar = !!(hull && (Number(hull.killTally) > 0 || Number(hull.repairPatches) > 0
      || Number(hull.heatScorch) > 0 || hull.graffitiLine));
    if (!hasScar || !source || source === 'reconciled') return false;
    const access = shipworksStationAccess(this.state);
    if (!access.outfit) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[QUARTERMASTER_CONTACT.id]);
    const priorMemory = normalizeQuartermasterMemory(previous.quartermaster);
    if (!priorMemory.unlocked) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const memory = normalizeQuartermasterMemory({
      ...priorMemory,
      scarCount: priorMemory.scarCount + 1,
      lastStationId: access.stationId,
      lastShipDefId: payload.defId || priorMemory.lastShipDefId,
      lastScarSource: source,
      lastEvent: 'scar',
      lastSeenAt: now,
    });
    this._writeQuartermaster(previous, memory, 'scar-witnessed');
    this._speakQuartermaster(
      'IRI MARCH: Keep the patch visible. It shows where the frame moved.',
      `scar:${memory.scarCount}`,
    );
    return true;
  },

  _writeQuartermaster(previous, memory, reason) {
    const bag = ensureContactBag(this.state);
    const next = normalizeStationContactRecord({
      ...previous,
      met: true,
      name: QUARTERMASTER_CONTACT.name,
      canonicalKey: QUARTERMASTER_CONTACT.canonicalKey,
      stationId: memory.lastStationId || memory.firstStationId,
      standing: Math.min(3, Math.floor(memory.fitCount / 3)),
      quartermaster: memory,
    });
    bag[QUARTERMASTER_CONTACT.id] = next;
    this.bus.emit('stationContact:changed', {
      contactId: QUARTERMASTER_CONTACT.id,
      record: { ...next, flags: { ...next.flags }, quartermaster: { ...next.quartermaster } },
      reason,
    });
    return next;
  },

  _speakQuartermaster(text, eventKey) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        kind: 'quartermaster',
        id: `quartermaster:${QUARTERMASTER_CONTACT.id}:${eventKey}`,
        text,
        ttl: 3,
      });
    }
    this.bus.emit('quartermaster:voice', {
      contactId: QUARTERMASTER_CONTACT.id,
      eventKey,
      text,
    });
  },

  // Plan 52 Fixer. The first paid ordinary bar card is only the causal introduction; purchase
  // memory starts when the player later buys Nera's `source: fixer` cache card.
  _recordFixerAcquired(payload) {
    const source = String(payload && payload.source || '');
    const rumorId = String(payload && payload.id || payload && payload.rumorId || '').trim();
    const stationId = String(payload && payload.sourceStationId || '').trim();
    if (!rumorId || (source !== 'bar' && source !== 'fixer')) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[FIXER_CONTACT.id]);
    const priorMemory = normalizeFixerMemory(previous.fixer);
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    if (!priorMemory.unlocked) {
      if (source !== 'bar' || !stationId) return false;
      const memory = normalizeFixerMemory({
        ...priorMemory,
        unlocked: true,
        homeStationId: stationId,
        triggerRumorId: rumorId,
        unlockedAt: now,
        lastSeenAt: now,
      });
      this._writeFixer(previous, memory, 'introduced');
      this._speakFixer(
        'NERA QUILL: You bought a whisper. Next time, buy the source.',
        'introduced',
      );
      return true;
    }
    if (source !== 'fixer') return false;
    const openLeadIds = [
      ...priorMemory.openLeadIds.filter((id) => id !== rumorId),
      rumorId,
    ].slice(-8);
    const memory = normalizeFixerMemory({
      ...priorMemory,
      purchaseCount: priorMemory.purchaseCount + 1,
      lastPurchasedRumorId: rumorId,
      lastPurchaseKind: payload.kind,
      openLeadIds,
      lastSeenAt: now,
    });
    this._writeFixer(previous, memory, 'lead-purchased');
    this._speakFixer(
      'NERA QUILL: Amber ring only. Find the cache yourself.',
      `purchase:${memory.purchaseCount}`,
    );
    return true;
  },

  _recordFixerResolved(payload) {
    const rumorId = String(payload && payload.rumorId || '').trim();
    if (!rumorId) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[FIXER_CONTACT.id]);
    const priorMemory = normalizeFixerMemory(previous.fixer);
    if (!priorMemory.unlocked || !priorMemory.openLeadIds.includes(rumorId)) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const memory = normalizeFixerMemory({
      ...priorMemory,
      outcomeCount: priorMemory.outcomeCount + 1,
      lastOutcomeRumorId: rumorId,
      lastOutcomeReason: payload.reason,
      openLeadIds: priorMemory.openLeadIds.filter((id) => id !== rumorId),
      lastSeenAt: now,
    });
    this._writeFixer(previous, memory, 'lead-resolved');
    this.bus.emit('fixer:outcomeRemembered', {
      contactId: FIXER_CONTACT.id,
      rumorId,
      reason: memory.lastOutcomeReason,
      outcomeCount: memory.outcomeCount,
    });
    return true;
  },

  _recordFixerJobAccepted(payload) {
    if (!payload || payload.source !== FIXER_PRIVATE_SOURCE) return false;
    const missionId = String(payload && payload.missionId || '').trim();
    const offerId = String(payload && payload.sourceOfferId || '').trim();
    if (!missionId || !offerId) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[FIXER_CONTACT.id]);
    const priorMemory = normalizeFixerMemory(previous.fixer);
    if (!priorMemory.unlocked || priorMemory.activePrivateJobMissionId) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const memory = normalizeFixerMemory({
      ...priorMemory,
      privateJobCount: priorMemory.privateJobCount + 1,
      activePrivateJobMissionId: missionId,
      lastPrivateJobMissionId: missionId,
      lastPrivateJobOfferId: offerId,
      lastPrivateJobOutcome: 'active',
      lastSeenAt: now,
    });
    this._writeFixer(previous, memory, 'private-job-accepted');
    this._speakFixer('NERA QUILL: No board. One wreck. Beat the other cutter.', `job:${missionId}`);
    return true;
  },

  _recordFixerJobOutcome(payload, outcome) {
    if (!payload || payload.source !== FIXER_PRIVATE_SOURCE) return false;
    const missionId = String(payload && payload.missionId || '').trim();
    if (!missionId) return false;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[FIXER_CONTACT.id]);
    const priorMemory = normalizeFixerMemory(previous.fixer);
    if (!priorMemory.unlocked || priorMemory.activePrivateJobMissionId !== missionId) return false;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const memory = normalizeFixerMemory({
      ...priorMemory,
      privateJobOutcomeCount: priorMemory.privateJobOutcomeCount + 1,
      activePrivateJobMissionId: null,
      lastPrivateJobMissionId: missionId,
      lastPrivateJobOutcome: outcome,
      lastSeenAt: now,
    });
    this._writeFixer(previous, memory, 'private-job-settled');
    this.bus.emit('fixer:jobRemembered', {
      contactId: FIXER_CONTACT.id,
      missionId,
      outcome,
      privateJobOutcomeCount: memory.privateJobOutcomeCount,
    });
    return true;
  },

  _writeFixer(previous, memory, reason) {
    const bag = ensureContactBag(this.state);
    const next = normalizeStationContactRecord({
      ...previous,
      met: true,
      name: FIXER_CONTACT.name,
      canonicalKey: FIXER_CONTACT.canonicalKey,
      stationId: memory.homeStationId,
      standing: Math.min(3, Math.floor((memory.purchaseCount + memory.outcomeCount
        + memory.privateJobCount + memory.privateJobOutcomeCount) / 2)),
      fixer: memory,
    });
    bag[FIXER_CONTACT.id] = next;
    this.bus.emit('stationContact:changed', {
      contactId: FIXER_CONTACT.id,
      record: { ...next, flags: { ...next.flags }, fixer: { ...next.fixer } },
      reason,
    });
    return next;
  },

  _speakFixer(text, eventKey) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        kind: 'fixer',
        id: `fixer:${FIXER_CONTACT.id}:${eventKey}`,
        text,
        ttl: 3,
      });
    }
    this.bus.emit('fixer:voice', {
      contactId: FIXER_CONTACT.id,
      eventKey,
      text,
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
    this.helpers = null;
  },
};
