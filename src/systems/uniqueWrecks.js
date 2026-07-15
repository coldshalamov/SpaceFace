// R1 authored unique-wreck runtime and canonical bearing authority.
// Owns only state.player.uniqueWrecks: what the player has read, fixed, recovered, and received.
// It does not write credits, cargo, ship inventory, lossLedger, world discovery, or T4c aftermath
// state. Rewards route through cargo's pickup:collected seam and ships.grantModule().

import { FLAVOR_SOURCE_BY_REF } from '../data/flavor/index.generated.js';
import { ENCOUNTERS } from '../data/encounters/index.generated.js';
import { salvagePoolForWreck } from '../data/salvageLegality.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { fittedModuleDefs } from '../core/fittedModules.js';
import {
  complicationEncounterId,
  deterministicTimer,
  movingRadiationGate,
  rewardDescriptors,
} from '../core/uniqueWreckComplications.js';
import {
  UNIQUE_WRECK_RECEIPT_LIMIT,
  UNIQUE_WRECK_SCAN_RADIUS,
  UNIQUE_WRECK_STATE_SCHEMA_VERSION,
  UNIQUE_WRECKS,
  placementForUniqueWreck,
  programSeedFor,
  promoteToAuthored,
  uniqueWreckById,
  uniqueWreckForSource,
} from '../data/uniqueWrecks.js';
import { planEncounterShape } from './encounterDirector.js';

const VALID_PHASES = new Set(['rumored', 'fixed', 'decision', 'salvaged']);

// The seven canon rumor channels remain native surfaces. A carrier event is only a transport:
// `_recordRumor` additionally requires the exact primary sourceRef and matching channel.
export const RUMOR_EVENT_BY_CHANNEL = Object.freeze({
  news: 'news:headline',
  comms_intercept: 'comms:popup',
  bark: 'barkDirector:voice',
  mission: 'mission:accepted',
  campaign: 'story:beatAdvanced',
  loss_investigation: 'lossInvestigation:authoredRead',
  bar: 'uniqueWreck:rumorHeard',
});

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function copyPoint(value, fallback) {
  const base = fallback || { x: 0, z: 0 };
  return {
    x: finite(value && value.x, base.x),
    z: finite(value && value.z, base.z),
  };
}

export function createUniqueWreckState(metaSeed) {
  return {
    schemaVersion: UNIQUE_WRECK_STATE_SCHEMA_VERSION,
    programSeed: programSeedFor(metaSeed),
    bearings: {},
    grants: {},
    storyRewards: {},
    complications: {},
    pingCounts: {},
    pingRisks: {},
    offers: {},
    published: {},
    receipts: [],
  };
}

export function normalizeUniqueWreckState(value, metaSeed) {
  const input = value && typeof value === 'object' ? value : {};
  const fallback = createUniqueWreckState(metaSeed);
  const programSeed = (Number(input.programSeed) >>> 0) || fallback.programSeed;
  const out = {
    schemaVersion: UNIQUE_WRECK_STATE_SCHEMA_VERSION,
    programSeed,
    bearings: {},
    grants: {},
    storyRewards: {},
    complications: {},
    pingCounts: {},
    pingRisks: {},
    offers: {},
    published: {},
    receipts: [],
  };
  const bearings = input.bearings && typeof input.bearings === 'object' ? input.bearings : {};
  for (const def of UNIQUE_WRECKS) {
    const record = bearings[def.id];
    if (!record || typeof record !== 'object') continue;
    const placement = placementForUniqueWreck(programSeed, def.id, def.sectorId);
    const phase = VALID_PHASES.has(record.phase) ? record.phase : 'rumored';
    out.bearings[def.id] = {
      wreckId: def.id,
      name: def.name,
      sectorId: def.sectorId,
      phase,
      sourceRef: typeof record.sourceRef === 'string' ? record.sourceRef : def.bearingSourceRef,
      channelId: typeof record.channelId === 'string' ? record.channelId : null,
      heardAtS: Math.max(0, finite(record.heardAtS, 0)),
      coordSpace: 'global_v1',
      bearingCenter: copyPoint(record.bearingCenter, placement.bearingCenterGlobal),
      radius: Math.max(1, finite(record.radius, placement.radius)),
      exactPos: copyPoint(record.exactPos, placement.exactGlobal),
      fixedPos: phase === 'rumored' ? null : copyPoint(record.fixedPos, placement.exactGlobal),
      fixedAtS: phase === 'rumored' ? null : Math.max(0, finite(record.fixedAtS, 0)),
      reactorDueAt: record.reactorDueAt == null ? null : Math.max(0, finite(record.reactorDueAt, 0)),
      decisionReadyAtS: phase === 'decision' || phase === 'salvaged'
        ? Math.max(0, finite(record.decisionReadyAtS, record.fixedAtS))
        : null,
      choiceId: phase === 'salvaged' && typeof record.choiceId === 'string' ? record.choiceId : null,
      outcome: phase === 'salvaged' && typeof record.outcome === 'string' ? record.outcome : null,
      resolvedAtS: phase === 'salvaged' ? Math.max(0, finite(record.resolvedAtS, record.salvagedAtS)) : null,
      rewardReceipt: phase === 'salvaged' && record.rewardReceipt && typeof record.rewardReceipt === 'object'
        ? clonePlain(record.rewardReceipt)
        : null,
      salvagedAtS: phase === 'salvaged' ? Math.max(0, finite(record.salvagedAtS, 0)) : null,
    };
  }
  const dropIds = new Set(UNIQUE_WRECKS.flatMap((def) => rewardDescriptors(def)
    .filter((reward) => reward.kind === 'weapon' || reward.kind === 'module')
    .map((reward) => reward.id)));
  const grants = input.grants && typeof input.grants === 'object' ? input.grants : {};
  for (const dropId of dropIds) {
    const grant = grants[dropId];
    if (!grant || typeof grant !== 'object') continue;
    out.grants[dropId] = {
      wreckId: uniqueWreckById(grant.wreckId) ? grant.wreckId : null,
      grantedAtS: Math.max(0, finite(grant.grantedAtS, 0)),
    };
  }
  const storyRewardIds = new Set(UNIQUE_WRECKS.flatMap((def) => rewardDescriptors(def)
    .filter((reward) => reward.kind === 'story_commodity' || reward.kind === 'story_data')
    .map((reward) => reward.id)));
  const storyRewards = input.storyRewards && typeof input.storyRewards === 'object' ? input.storyRewards : {};
  for (const rewardId of storyRewardIds) {
    const reward = storyRewards[rewardId];
    if (!reward || typeof reward !== 'object') continue;
    out.storyRewards[rewardId] = {
      wreckId: uniqueWreckById(reward.wreckId) ? reward.wreckId : null,
      kind: String(reward.kind || 'story_data'),
      flagKey: typeof reward.flagKey === 'string' ? reward.flagKey : null,
      grantedAtS: Math.max(0, finite(reward.grantedAtS, 0)),
    };
  }
  const complications = input.complications && typeof input.complications === 'object' ? input.complications : {};
  for (const [key, rec] of Object.entries(complications)) {
    const recDef = rec && uniqueWreckById(rec.wreckId);
    if (!rec || typeof rec !== 'object' || !recDef) continue;
    out.complications[key] = {
      id: String(rec.id || key),
      wreckId: rec.wreckId,
      timerId: rec.timerId == null ? null : String(rec.timerId),
      kind: String(rec.kind || 'complication'),
      trigger: rec.trigger == null ? null : String(rec.trigger),
      status: String(rec.status || 'scheduled'),
      scheduledAt: Math.max(0, finite(rec.scheduledAt, 0)),
      dueAt: rec.dueAt == null ? null : Math.max(0, finite(rec.dueAt, 0)),
      triggeredAt: rec.triggeredAt == null ? null : Math.max(0, finite(rec.triggeredAt, 0)),
      encounterId: rec.encounterId == null ? null : String(rec.encounterId),
      sectorId: typeof rec.sectorId === 'string' ? rec.sectorId : recDef.sectorId,
      anchor: rec.anchor && typeof rec.anchor === 'object' ? copyPoint(rec.anchor) : null,
    };
  }
  const pingCounts = input.pingCounts && typeof input.pingCounts === 'object' ? input.pingCounts : {};
  for (const def of UNIQUE_WRECKS) {
    if (Number.isFinite(Number(pingCounts[def.id]))) out.pingCounts[def.id] = Math.max(0, Math.floor(Number(pingCounts[def.id])));
  }
  const pingRisks = input.pingRisks && typeof input.pingRisks === 'object' ? input.pingRisks : {};
  for (const def of UNIQUE_WRECKS) {
    const risk = pingRisks[def.id];
    if (!risk || typeof risk !== 'object') continue;
    out.pingRisks[def.id] = {
      count: Math.max(0, Math.floor(finite(risk.count, 0))),
      cooldownUntil: Math.max(0, finite(risk.cooldownUntil, 0)),
      triggerCount: Math.max(0, Math.floor(finite(risk.triggerCount, 0))),
      lastTriggeredAt: risk.lastTriggeredAt == null
        ? null
        : Math.max(0, finite(risk.lastTriggeredAt, 0)),
    };
  }
  const offers = input.offers && typeof input.offers === 'object' ? input.offers : {};
  for (const [key, value] of Object.entries(offers)) if (value) out.offers[key] = true;
  const published = input.published && typeof input.published === 'object' ? input.published : {};
  for (const def of UNIQUE_WRECKS) if (published[def.id]) out.published[def.id] = true;
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  out.receipts = receipts.slice(-UNIQUE_WRECK_RECEIPT_LIMIT).map((receipt) => ({
    type: String(receipt && receipt.type || 'receipt'),
    wreckId: uniqueWreckById(receipt && receipt.wreckId) ? receipt.wreckId : null,
    t: Math.max(0, finite(receipt && receipt.t, 0)),
  }));
  return out;
}

function ensurePlayer(state) {
  if (!state.player || typeof state.player !== 'object') state.player = {};
  if (!state.player.flags || typeof state.player.flags !== 'object') state.player.flags = {};
  if (!Array.isArray(state.player.flags.uniqueWrecksVisited)) state.player.flags.uniqueWrecksVisited = [];
  return state.player;
}

function sourceLine(sourceRef) {
  const source = FLAVOR_SOURCE_BY_REF[sourceRef];
  const line = source && Array.isArray(source.lines) ? source.lines[0] : null;
  return line && typeof line.text === 'string' ? line.text : '';
}

function sourceText(sourceRef) {
  const source = FLAVOR_SOURCE_BY_REF[sourceRef];
  if (!source || !Array.isArray(source.lines)) return '';
  return source.lines
    .map((line) => line && typeof line.text === 'string' ? line.text.trim() : '')
    .filter(Boolean)
    .join(' ');
}

function distance(a, b) {
  return Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
}

function hasModule(state, defId) {
  if (!defId) return true;
  const player = state && state.player || {};
  if ((player.moduleInventory || []).some((item) => item && item.defId === defId)) return true;
  const owned = player.ownedShips && player.ownedShips[player.activeShipIndex || 0];
  return !!(owned && Array.isArray(owned.fittings) && owned.fittings.includes(defId));
}

export const uniqueWrecks = {
  name: 'uniqueWrecks',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._entityByWreck = new Map();
    this._wreckByEntity = new Map();
    this._bandRequestResolutions = new Map();
    this._subscriptions = [];
    this._ensureState();

    this._listen('game:started', () => this._onGameStarted());
    this._listen('save:loaded', () => this._onSaveLoaded());
    this._listen('save:restoring', () => this._clearRuntime());
    this._listen('sector:enter', (payload) => this._onSectorEnter(payload));
    this._listen('dock:docked', (payload) => this._onDocked(payload));
    for (const [channelId, event] of Object.entries(RUMOR_EVENT_BY_CHANNEL)) {
      this._listen(event, (payload) => this._onNativeRumor(channelId, payload));
    }
    this._listen('lossInvestigation:promoted', (payload) => this._onLossPromoted(payload));
    this._listen('scan:pulse', (payload) => this._onScanPulse(payload));
    this._listen('economy:tick', () => this._pumpComplications());
    this._listen('salvage:completed', (payload) => this._onSalvageCompleted(payload));
    this._listen('uniqueWreck:choose', (payload) => this._onChoose(payload));
    this._listen('uniqueWreck:decisionRequest', (payload) => this._republishPendingDecisions(payload));
    this._listen('band:bearingRequest', (payload) => this._onBandBearingRequest(payload));
    this._listen('encounter:resolved', (payload) => this._onEncounterResolved(payload));
    this._listen('entity:destroyed', (payload) => this._onEntityDestroyed(payload));
  },

  _listen(event, handler) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this.bus.on(event, handler);
    this._subscriptions.push([event, handler]);
  },

  _ensureState() {
    const player = ensurePlayer(this.state);
    const current = player.uniqueWrecks;
    if (!current || typeof current !== 'object'
      || current.schemaVersion !== UNIQUE_WRECK_STATE_SCHEMA_VERSION
      || !current.bearings || typeof current.bearings !== 'object'
      || !current.grants || typeof current.grants !== 'object'
      || !current.storyRewards || typeof current.storyRewards !== 'object'
      || !current.complications || typeof current.complications !== 'object'
      || !current.pingCounts || typeof current.pingCounts !== 'object'
      || !current.pingRisks || typeof current.pingRisks !== 'object'
      || !current.offers || typeof current.offers !== 'object'
      || !current.published || typeof current.published !== 'object'
      || !Array.isArray(current.receipts)) {
      player.uniqueWrecks = normalizeUniqueWreckState(current, this.state.meta && this.state.meta.seed);
    }
    return player.uniqueWrecks;
  },

  newGame() {
    const player = ensurePlayer(this.state);
    player.uniqueWrecks = createUniqueWreckState(this.state.meta && this.state.meta.seed);
    player.flags.uniqueWrecksVisited = [];
    this._clearRuntime();
    return player.uniqueWrecks;
  },

  _clearRuntime() {
    if (this._entityByWreck) this._entityByWreck.clear();
    if (this._wreckByEntity) this._wreckByEntity.clear();
    if (this._bandRequestResolutions) this._bandRequestResolutions.clear();
  },

  _receipt(type, wreckId) {
    const own = this._ensureState();
    own.receipts.push({ type, wreckId, t: Math.max(0, finite(this.state.simTime, 0)) });
    if (own.receipts.length > UNIQUE_WRECK_RECEIPT_LIMIT) {
      own.receipts.splice(0, own.receipts.length - UNIQUE_WRECK_RECEIPT_LIMIT);
    }
  },

  _onGameStarted() {
    const own = this._ensureState();
    const current = this.state.world && this.state.world.currentSectorId;
    this._offerLostCoils();
    this._surfaceSectorRumors(current);
    if (current !== 'sector_helios_prime' || own.bearings.wreck_choir_tender || own.published.wreck_choir_tender) return;
    const def = uniqueWreckById('wreck_choir_tender');
    // R1's established ticker contract is deliberately the first headline line; the longer R2
    // intercept/campaign producers use sourceText so their full authored copy reaches the player.
    const text = sourceLine(def.bearingSourceRef);
    if (!text) return;
    this.bus.emit('news:publish', {
      text,
      kind: 'wreck_rumor',
      sourceRef: def.bearingSourceRef,
      wreckId: def.id,
      sectorId: def.sectorId,
      channelId: 'news',
      followup: false,
      receiptId: 'depth-r1:d10:first-read',
    });
    // marketNews normally relays news:publish to news:headline. The direct record is the
    // headless/runtime fallback and still passes through the exact source/channel guard.
    if (!own.bearings[def.id]) this._recordRumor({
      wreckId: def.id,
      sourceRef: def.bearingSourceRef,
      channelId: 'news',
    });
  },

  _onSaveLoaded() {
    this._ensureState();
    this._clearRuntime();
    // encounterDirector deliberately does not serialize live entity references. An authored boss
    // that was active at save time is therefore pending again until the post-load sector entry.
    for (const complication of Object.values(this._ensureState().complications)) {
      if (complication && complication.encounterId && complication.status === 'active') {
        complication.status = 'requested';
      }
    }
    this._syncSector(this.state.world && this.state.world.currentSectorId);
    for (const record of Object.values(this._ensureState().bearings)) {
      if (record && record.phase === 'decision') this._publishDecision(record.wreckId, 'continue');
    }
  },

  _onNewsHeadline(payload) {
    return this._onNativeRumor('news', payload);
  },

  _onRumorEvent(payload) {
    return this._onNativeRumor('bar', payload);
  },

  _onNativeRumor(channelId, payload) {
    if (!payload) return null;
    if (!payload.sourceRef && channelId === 'campaign') {
      const beatIndex = Number.isFinite(Number(payload.toIndex))
        ? Number(payload.toIndex)
        : Number(payload.beatIndex);
      if (beatIndex === 7) return this._surfaceCanonicalRumor(
        'wreck_isc_lighthouse',
        'campaign',
        'comms:popup',
        { sender: 'ASHFALL CAMPAIGN RELAY', beatIndex },
      );
      // Stable branch reveal: campaign beat 6 is where the Cassandra proof becomes actionable.
      if (beatIndex === 6) return this._surfaceCanonicalRumor(
        'wreck_choir_cassandra',
        'campaign',
        'comms:popup',
        { sender: 'CASSANDRA DIPLOMATIC THREAD', beatIndex },
      );
      return null;
    }
    if (!payload.sourceRef && channelId === 'bark') {
      const sectorId = payload.sectorId || (this.state.world && this.state.world.currentSectorId);
      const factionId = payload.factionId || payload.speakerFactionId
        || (payload.actor && payload.actor.factionId);
      const situation = String(payload.situation || payload.reason || payload.kind || '').toLowerCase();
      if (sectorId === 'sector_triton_wake'
        && factionId === 'faction_vael'
        && situation.includes('patrol')) {
        return this._surfaceCanonicalRumor(
          'wreck_choir_bell_aegis',
          'bark',
          'barkDirector:voice',
          { factionId, sectorId, situation: payload.situation || 'patrol_contact' },
        );
      }
      return null;
    }
    if (!payload.sourceRef) return null;
    return this._recordRumor({
      ...payload,
      channelId,
    });
  },

  _onLossPromoted(payload) {
    if (!payload || (payload.lossId !== 'loss_vigilant'
      && payload.authoredWreckId !== 'wreck_isc_vigilant'
      && payload.wreckId !== 'wreck_isc_vigilant')) return null;
    return this._surfaceCanonicalRumor(
      'wreck_isc_vigilant',
      'loss_investigation',
      'lossInvestigation:authoredRead',
      {
        ...payload,
        lossId: payload.lossId || 'loss_vigilant',
      },
    );
  },

  _recordRumor(payload) {
    const sourceRef = payload && payload.sourceRef;
    const def = uniqueWreckById(payload && payload.wreckId) || uniqueWreckForSource(sourceRef);
    if (!def || sourceRef !== def.bearingSourceRef) return null;
    const own = this._ensureState();
    if (own.bearings[def.id]) return own.bearings[def.id];
    const source = def.rumorSources.find((entry) => entry.sourceRef === sourceRef);
    if (!source || source.channelId !== payload.channelId) return null;
    const placement = placementForUniqueWreck(own.programSeed, def.id, def.sectorId);
    const record = {
      wreckId: def.id,
      name: def.name,
      sectorId: def.sectorId,
      phase: 'rumored',
      sourceRef,
      channelId: payload.recordedChannelId || payload.channelId || source.channelId,
      heardAtS: Math.max(0, finite(this.state.simTime, 0)),
      coordSpace: 'global_v1',
      bearingCenter: { ...placement.bearingCenterGlobal },
      radius: placement.radius,
      exactPos: { ...placement.exactGlobal },
      fixedPos: null,
      fixedAtS: null,
      reactorDueAt: null,
      decisionReadyAtS: null,
      choiceId: null,
      outcome: null,
      resolvedAtS: null,
      rewardReceipt: null,
      salvagedAtS: null,
    };
    own.bearings[def.id] = record;
    own.published[def.id] = true;
    this._scheduleSeededTimers(def, 'bearing_recorded');
    this._receipt('rumor', def.id);
    this.bus.emit('uniqueWreck:rumorRecorded', {
      wreckId: def.id,
      sectorId: def.sectorId,
      sourceRef,
      channelId: record.channelId,
      phase: record.phase,
    });
    if (!payload.silent) {
      this.bus.emit('toast', {
        text: `${def.name}: rumor charted. Search the amber bearing ring, then pulse scan.`,
        kind: 'objective',
        ttl: 6,
      });
    }
    if (def.sectorId === (this.state.world && this.state.world.currentSectorId)) this._materialize(def.id);
    return record;
  },

  _onBandBearingRequest(payload) {
    const requestId = payload && typeof payload.requestId === 'string' ? payload.requestId.trim() : '';
    if (!requestId || !this.bus) return null;
    const radio = this.state && this.state.bandRadio;
    const pending = radio && radio.pendingBearingRequest;
    const authorized = !!pending
      && !radio.numbersReceipt
      && payload.channelId === 'numbers_station'
      && payload.contractVersion === 1
      && requestId === pending.requestId
      && payload.channelId === pending.channelId
      && payload.contractVersion === pending.contractVersion
      && payload.sequence === pending.sequence
      && payload.requestedAtS === pending.requestedAtS;
    // A request id correlates transport; it is not authority. Only the Band system's current,
    // seeded request may mint the one canonical numbers-station bearing for this save.
    if (!authorized) return null;
    const prior = this._bandRequestResolutions && this._bandRequestResolutions.get(requestId);
    if (prior) {
      this.bus.emit('band:bearingResolved', clonePlain(prior));
      return prior;
    }

    const own = this._ensureState();
    const candidates = UNIQUE_WRECKS.filter((def) => !own.bearings[def.id] && !own.published[def.id]);
    if (!candidates.length) {
      this.bus.emit('band:bearingUnavailable', { requestId, reason: 'no-unread-canonical-wrecks' });
      return null;
    }
    const pick = hash32(own.programSeed, 'band:numbers-bearing', requestId) % candidates.length;
    const def = candidates[pick];
    const source = def.rumorSources.find((entry) => entry.sourceRef === def.bearingSourceRef)
      || def.rumorSources[0];
    if (!source) {
      this.bus.emit('band:bearingUnavailable', { requestId, reason: 'canonical-source-missing' });
      return null;
    }
    // Keep the definition's exact source/channel validation as the authorization boundary, then
    // record the Band as the delivery carrier. The numbers station reveals a real fuzzy map ring;
    // it never invents a wreck, exact coordinate, source ref, or alternate salvage path.
    const record = this._recordRumor({
      wreckId: def.id,
      sourceRef: source.sourceRef,
      channelId: source.channelId,
      recordedChannelId: 'band',
      silent: true,
    });
    if (!record) {
      this.bus.emit('band:bearingUnavailable', { requestId, reason: 'canonical-record-rejected' });
      return null;
    }
    const a = hash32(own.programSeed, def.id, 'band-bearing-a') % 1000;
    const b = hash32(own.programSeed, def.id, 'band-bearing-b') % 1000;
    const resolution = {
      requestId,
      canonical: true,
      wreckId: def.id,
      sourceRef: record.sourceRef,
      sectorId: record.sectorId,
      bearingLabel: `${String(a).padStart(3, '0')}-${String(b).padStart(3, '0')}`,
    };
    this._bandRequestResolutions.set(requestId, resolution);
    this.bus.emit('band:bearingResolved', clonePlain(resolution));
    return resolution;
  },

  _scheduleSeededTimers(def, trigger) {
    const own = this._ensureState();
    const now = Math.max(0, finite(this.state.simTime, 0));
    for (const timer of Array.isArray(def && def.seededTimers) ? def.seededTimers : []) {
      if (timer.trigger && timer.trigger !== trigger) continue;
      const key = `${def.id}:timer:${timer.id}`;
      if (own.complications[key]) continue;
      const authored = (def.complications || []).find((entry) => entry && entry.id === timer.id) || {};
      const delay = deterministicTimer(own.programSeed, def.id, timer.id, timer);
      const record = {
        id: key,
        wreckId: def.id,
        timerId: timer.id,
        kind: authored.kind || timer.kind || timer.id,
        trigger: timer.trigger || trigger,
        status: 'scheduled',
        scheduledAt: now,
        dueAt: now + delay,
        triggeredAt: null,
        encounterId: authored.encounterRef || authored.encounterId || null,
        sectorId: def.sectorId,
        anchor: null,
      };
      own.complications[key] = record;
      this.bus.emit('uniqueWreck:complicationScheduled', {
        wreckId: def.id,
        timerId: record.timerId,
        kind: record.kind,
        dueAt: record.dueAt,
        encounterId: record.encounterId,
      });
    }
  },

  _pumpComplications() {
    const own = this._ensureState();
    const now = Math.max(0, finite(this.state.simTime, 0));
    for (const record of Object.values(own.complications)) {
      if (!record || record.status !== 'scheduled' || record.dueAt == null || record.dueAt > now) continue;
      record.status = 'triggered';
      record.triggeredAt = now;
      this._receipt('complication', record.wreckId);
      this.bus.emit('uniqueWreck:complicationTriggered', {
        wreckId: record.wreckId,
        timerId: record.timerId,
        kind: record.kind,
        dueAt: record.dueAt,
        triggeredAt: record.triggeredAt,
        encounterId: record.encounterId,
      });
      if (record.encounterId) {
        const def = uniqueWreckById(record.wreckId);
        const bearing = def && own.bearings[def.id];
        if (def && bearing) this._requestEncounter(def, record.encounterId, bearing, record.kind, {
          emitComplicationTriggered: false,
        });
      }
    }
  },

  _onSectorEnter(payload) {
    const sectorId = payload && typeof payload === 'object' ? payload.sectorId : payload;
    this._syncSector(sectorId);
    this._pumpComplications();
    this._surfaceSectorRumors(sectorId);
    this._activatePendingEncounters(sectorId);
  },

  _onDocked(payload) {
    const stationId = payload && payload.stationId;
    if (stationId === 'station_helios') this._offerLostCoils();
  },

  _surfaceCanonicalRumor(wreckId, channelId, eventName, extra = {}) {
    const def = uniqueWreckById(wreckId);
    const own = this._ensureState();
    if (!def || own.bearings[def.id] || own.published[def.id]) return own.bearings[def && def.id] || null;
    const text = sourceText(def.bearingSourceRef);
    if (!text) return null;
    const payload = {
      ...extra,
      text,
      kind: 'wreck_rumor',
      wreckId: def.id,
      authoredWreckId: def.id,
      sectorId: def.sectorId,
      sourceRef: def.bearingSourceRef,
      channelId,
      followup: false,
      receiptId: `depth-r2:${def.programSlot.toLowerCase()}:first-read`,
    };
    if (eventName === 'barkDirector:voice') {
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') voice.say({
        channel: 'bark',
        text,
        kind: 'uniqueWreckRumor',
        ttl: 4,
        id: payload.receiptId,
        factionId: payload.factionId || def.factionId,
      });
    }
    this.bus.emit(eventName, payload);
    // Some public surfaces (news:publish and campaign dialogue via comms) relay through UI
    // systems that are absent in deterministic/headless runs. Record only after the authentic
    // carrier was emitted, and still enforce the exact source/channel pair in _recordRumor.
    if (!own.bearings[def.id]) this._recordRumor(payload);
    return own.bearings[def.id] || null;
  },

  _surfaceSectorRumors(sectorId) {
    if (sectorId === 'sector_nyx_march') {
      return this._surfaceCanonicalRumor(
        'wreck_dmc_ironsong',
        'comms_intercept',
        'comms:popup',
        { sender: 'QUIET CUT-LANE INTERCEPT' },
      );
    }
    if (sectorId === 'sector_eunomia_gulf') {
      return this._surfaceCanonicalRumor(
        'wreck_gravhand_tideline',
        'news',
        'news:publish',
        { sender: 'EUNOMIA RECOVERY DESK' },
      );
    }
    return null;
  },

  _offerLostCoils() {
    const own = this._ensureState();
    const offerId = 'unique-wreck:the-lost-coils:v1';
    if (own.offers[offerId] || own.bearings.wreck_lanebreaker_pale_coil) return false;
    own.offers[offerId] = true;
    this.bus.emit('mission:offered', {
      id: offerId,
      type: 'recon_scan',
      title: 'The Lost Coils',
      summary: 'Trace the Pale-Coil research bearing into Phoebe Echo.',
      stationId: 'station_helios',
      factionId: 'faction_scn',
      destSectorId: 'sector_phoebe_echo',
      destStationId: null,
      params: { scanTargets: 1 },
      reward_cr: 0,
      collateral_cr: 0,
      riskTier: 1,
      minRep: -1000,
      distance: 1600,
      source: 'uniqueWreck',
      storyTag: 'mission.the_lost_coils',
      wreckId: 'wreck_lanebreaker_pale_coil',
      sourceRef: 'mission.the_lost_coils',
      channelId: 'mission',
    });
    return true;
  },

  _requestEncounter(def, encounterId, bearing, kind = 'authored_encounter', options = {}) {
    if (!def || def.programSlot === 'D10' || !encounterId || !bearing) return null;
    const own = this._ensureState();
    const key = `${def.id}:encounter:${encounterId}`;
    const existing = own.complications[key];
    if (existing && !(options.allowCompletedRepeat === true && existing.status === 'completed')) {
      return existing;
    }
    const now = Math.max(0, finite(this.state.simTime, 0));
    const sectorId = typeof options.sectorId === 'string'
      ? options.sectorId
      : typeof bearing.sectorId === 'string' ? bearing.sectorId : def.sectorId;
    const anchor = copyPoint(options.anchor || options.pos || bearing.exactPos);
    const record = {
      id: key,
      wreckId: def.id,
      timerId: null,
      kind: String(kind || 'authored_encounter'),
      trigger: 'direct_authored_request',
      status: 'requested',
      scheduledAt: now,
      dueAt: null,
      triggeredAt: now,
      encounterId: String(encounterId),
      sectorId,
      anchor,
    };
    // Persist before synchronous dispatch so re-entrant listeners cannot request the boss twice.
    own.complications[key] = record;
    this._receipt('encounter_requested', def.id);
    const payload = {
      wreckId: def.id,
      sectorId,
      encounterId: record.encounterId,
      kind: record.kind,
      trigger: record.trigger,
      pos: { ...anchor },
      requestedAt: now,
    };
    if (options.emitComplicationTriggered !== false) {
      this.bus.emit('uniqueWreck:complicationTriggered', payload);
    }
    this.bus.emit('uniqueWreck:encounterRequested', payload);
    this._activateEncounter(def, bearing, record);
    return record;
  },

  _encounterInstanceId(def, encounterId) {
    return `unique-wreck:${def.id}:${encounterId}`;
  },

  _activateEncounter(def, bearing, complication) {
    if (!def || !bearing || !complication || complication.status === 'completed') return false;
    const sectorId = complication.sectorId || bearing.sectorId || def.sectorId;
    const anchor = copyPoint(complication.anchor || bearing.exactPos);
    if ((this.state.world && this.state.world.currentSectorId) !== sectorId) return false;
    const director = this.registry && this.registry.get && this.registry.get('encounterDirector');
    const shape = ENCOUNTERS[complication.encounterId];
    const dir = this.state.encounterDirector;
    if (!director || typeof director._fire !== 'function' || !shape || !dir || !dir.live) return false;

    const encounterId = this._encounterInstanceId(def, complication.encounterId);
    if (dir.live[encounterId]) {
      complication.status = 'active';
      return true;
    }
    const own = this._ensureState();
    const center = globalToSectorLocalForSector(anchor, sectorId);
    const rng = mulberry32(hash32(
      own.programSeed,
      def.id,
      complication.encounterId,
      'unique-wreck-direct-encounter:v1',
    ) || 1);
    const zone = {
      id: `unique-wreck-zone:${def.id}`,
      name: def.name,
      type: 'unique_wreck',
      center,
      radius: 520,
      threat: def.programSlot === 'D6' ? 4 : 3,
      factionId: def.factionId,
    };
    const item = planEncounterShape(
      shape,
      zone,
      sectorId,
      Math.floor(Math.max(0, finite(this.state.simTime, 0)) / 600),
      0,
      rng,
    );
    if (!item || !Array.isArray(item.ships) || !item.ships.length) return false;
    item.encounterId = encounterId;
    item.squadId = encounterId;
    item.data = {
      ...(item.data || {}),
      uniqueWreckId: def.id,
      uniqueWreckEncounterId: complication.encounterId,
    };
    director._fire(dir, this.state, item, shape, Math.max(0, finite(this.state.simTime, 0)));
    if (!dir.live[encounterId]) return false;
    complication.status = 'active';
    this.bus.emit('uniqueWreck:encounterActivated', {
      wreckId: def.id,
      sectorId,
      encounterId: complication.encounterId,
      instanceId: encounterId,
      pos: { ...anchor },
    });
    return true;
  },

  _activatePendingEncounters(sectorId) {
    const own = this._ensureState();
    for (const complication of Object.values(own.complications)) {
      if (!complication || complication.status !== 'requested' || !complication.encounterId) continue;
      const def = uniqueWreckById(complication.wreckId);
      const bearing = def && own.bearings[def.id];
      const requestSectorId = complication.sectorId || (bearing && bearing.sectorId) || (def && def.sectorId);
      if (def && bearing && requestSectorId === sectorId) this._activateEncounter(def, bearing, complication);
    }
  },

  _onEncounterResolved(payload) {
    if (!payload || !payload.encounterId) return;
    const own = this._ensureState();
    for (const complication of Object.values(own.complications)) {
      if (!complication || !complication.encounterId || complication.status === 'completed') continue;
      const def = uniqueWreckById(complication.wreckId);
      if (!def || this._encounterInstanceId(def, complication.encounterId) !== payload.encounterId) continue;
      complication.status = 'completed';
      this._receipt('encounter_resolved', def.id);
      this.bus.emit('uniqueWreck:encounterCompleted', {
        wreckId: def.id,
        sectorId: complication.sectorId || def.sectorId,
        encounterId: complication.encounterId,
        instanceId: payload.encounterId,
        outcome: payload.outcome || null,
      });
      return;
    }
  },

  _triggerFixedComplications(def, bearing) {
    for (const complication of Array.isArray(def && def.complications) ? def.complications : []) {
      if (!complication || complication.trigger !== 'wreck_fixed') continue;
      const encounterId = complication.encounterRef || complication.encounterId
        || complicationEncounterId(def, complication.kind);
      if (encounterId) this._requestEncounter(def, encounterId, bearing, complication.kind);
    }
  },

  _countDeepsurveyPingRisk() {
    const def = uniqueWreckById('wreck_deepsurvey');
    const own = this._ensureState();
    const bearing = def && own.bearings[def.id];
    if (!def || !bearing || bearing.phase !== 'salvaged' || !own.grants[def.uniqueDropId]) return 0;

    const fitted = fittedModuleDefs(this.state).find((moduleDef) => moduleDef.id === def.uniqueDropId);
    const threshold = fitted && fitted.mods && fitted.mods.overusePingThreshold;
    if (!Number.isFinite(threshold) || threshold < 1) return 0;
    const required = Math.max(1, Math.floor(threshold));

    const player = this.state.entities && this.state.entities.get
      && this.state.entities.get(this.state.playerId);
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (!player || player.alive === false || !player.pos || !sectorId) return 0;

    const risk = own.pingRisks[def.id] || (own.pingRisks[def.id] = {
      count: 0,
      cooldownUntil: 0,
      triggerCount: 0,
      lastTriggeredAt: null,
    });
    const now = Math.max(0, finite(this.state.simTime, 0));
    if (now < risk.cooldownUntil) return risk.count;

    risk.count += 1;
    if (risk.count < required) return risk.count;

    const complication = (def.complications || []).find((entry) => entry
      && entry.trigger === 'equipped_scan_pulse_threshold');
    const encounterId = complication && (complication.encounterRef || complication.encounterId
      || complicationEncounterId(def, complication.kind));
    if (!complication || !encounterId) return risk.count;

    // The encounter's authored cooldown is sim-clocked and persisted with the count. Record it
    // before synchronous dispatch so another scan listener cannot request the same answer twice.
    const cooldownS = Math.max(0, finite(ENCOUNTERS[encounterId] && ENCOUNTERS[encounterId].cooldownS, 1200));
    risk.count = 0;
    risk.cooldownUntil = now + cooldownS;
    risk.triggerCount += 1;
    risk.lastTriggeredAt = now;
    this._requestEncounter(def, encounterId, bearing, complication.kind, {
      allowCompletedRepeat: true,
      sectorId,
      anchor: player.pos,
    });
    return risk.count;
  },

  _triggerStoryRewardComplications(def, bearing, grantedRewardIds) {
    if (!def || !bearing || !Array.isArray(grantedRewardIds) || !grantedRewardIds.length) return 0;
    let requested = 0;
    for (const complication of Array.isArray(def.complications) ? def.complications : []) {
      if (!complication || complication.trigger !== 'story_reward_granted') continue;
      if (complication.requiredRewardId && !grantedRewardIds.includes(complication.requiredRewardId)) continue;
      const encounterId = complication.encounterRef || complication.encounterId
        || complicationEncounterId(def, complication.kind);
      if (encounterId && this._requestEncounter(def, encounterId, bearing, complication.kind)) requested++;
    }
    return requested;
  },

  _syncSector(sectorId) {
    if (!sectorId) return;
    const own = this._ensureState();
    for (const record of Object.values(own.bearings)) {
      if (record && record.sectorId === sectorId && (record.phase === 'rumored' || record.phase === 'fixed')) {
        this._materialize(record.wreckId);
      }
    }
  },

  _findLive(wreckId) {
    const knownId = this._entityByWreck.get(wreckId);
    if (knownId != null && this.state.entities && this.state.entities.get) {
      const known = this.state.entities.get(knownId);
      if (known && known.alive !== false) return known;
    }
    for (const entity of this.state.entityList || []) {
      if (entity && entity.alive !== false && entity.data && entity.data.uniqueWreckId === wreckId) return entity;
    }
    return null;
  },

  _materialize(wreckId) {
    const def = uniqueWreckById(wreckId);
    const own = this._ensureState();
    const record = own.bearings[wreckId];
    if (!def || !record || (record.phase !== 'rumored' && record.phase !== 'fixed')) return null;
    if (def.sectorId !== (this.state.world && this.state.world.currentSectorId)) return null;
    let entity = this._findLive(wreckId);
    if (!entity) {
      if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
      const authored = promoteToAuthored({
        authoredWreckId: def.id,
        lossId: def.id === 'wreck_isc_vigilant' ? 'loss_vigilant' : `loss_${def.id.replace(/^wreck_/, '')}`,
        sectorId: def.sectorId,
        factionId: def.factionId,
        sourceRef: record.sourceRef,
      });
      entity = this.helpers.spawnEntity({
        type: 'wreck',
        // Live entities use galactic-global XZ; the authored placement was composed into that
        // space once by placementForUniqueWreck. Only zone-planner inputs remain sector-local.
        pos: { ...record.exactPos },
        vel: { x: 0, z: 0 },
        radius: def.id === 'wreck_choir_tender' ? 12 : 10,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        factionId: def.factionId,
        data: {
          uniqueWreckId: def.id,
          authoredWreckId: def.id,
          aftermathMarkerId: authored.markerId,
          sectorId: def.sectorId,
          parentType: authored.parentType,
          wreckClass: authored.wreckClass,
          wreckClassLabel: authored.wreckClassLabel,
          wreckClassBlurb: authored.wreckClassBlurb,
          provenance: { ...authored.provenance },
          name: def.name,
          scanLabel: authored.scanLabel,
          scanned: record.phase !== 'rumored',
        },
      });
    }
    this._bindEntity(def, record, entity);
    return entity;
  },

  _bindEntity(def, record, entity) {
    if (!entity) return null;
    const authored = promoteToAuthored({
      authoredWreckId: def.id,
      lossId: def.id === 'wreck_isc_vigilant' ? 'loss_vigilant' : `loss_${def.id.replace(/^wreck_/, '')}`,
      sectorId: def.sectorId,
      factionId: def.factionId,
      sourceRef: record.sourceRef,
    });
    const data = entity.data || (entity.data = {});
    data.uniqueWreckId = def.id;
    data.authoredWreckId = def.id;
    data.aftermathMarkerId = authored.markerId;
    data.sectorId = def.sectorId;
    data.parentType = authored.parentType;
    data.wreckClass = authored.wreckClass;
    data.wreckClassLabel = authored.wreckClassLabel;
    data.wreckClassBlurb = authored.wreckClassBlurb;
    data.provenance = { ...authored.provenance };
    data.name = def.name;
    data.scanLabel = authored.scanLabel;
    data.scanDescription = record.phase === 'rumored'
      ? 'Pulse scan inside the charted bearing ring to resolve this named wreck.'
      : `${def.name}. Recover the wreck, then choose who receives its surviving systems.`;
    data.interactionPrompt = record.phase === 'rumored'
      ? 'PULSE SCANNER TO IDENTIFY'
      : 'SALVAGE TO OPEN RECOVERY CLAIM';
    data.objectiveLabel = record.phase === 'rumored'
      ? `Search for ${def.name}`
      : `Recover ${def.name}`;
    data.scanned = record.phase !== 'rumored';
    this._entityByWreck.set(def.id, entity.id);
    this._wreckByEntity.set(entity.id, def.id);

    const salvage = this.registry && this.registry.get && this.registry.get('salvageActions');
    const arm = !!(def.reactor && record.phase !== 'rumored');
    if (salvage && typeof salvage.configureAuthoredWreck === 'function') {
      salvage.configureAuthoredWreck(entity, {
        salvagePool: def.salvagePool,
        scanLabel: def.scanLabel,
        reactorTimerS: arm ? def.reactor.timerS : null,
      });
    } else {
      data.authoredSalvagePool = { ...def.salvagePool };
      data.salvagePool = salvagePoolForWreck(entity, def.salvagePool);
      data.authoredScanLabel = def.scanLabel;
      data.scanLabel = def.scanLabel;
      if (arm) {
        data.unstableReactor = {
          dueAt: finite(this.state.simTime) + def.reactor.timerS,
          damage: def.reactor.damage,
          vented: false,
          burst: false,
          towedClear: false,
        };
      }
    }
    if (arm && data.unstableReactor && record.reactorDueAt != null) {
      data.unstableReactor.dueAt = record.reactorDueAt;
      data.unstableReactor.damage = def.reactor.damage;
    }
    return entity;
  },

  _onScanPulse(payload) {
    const origin = payload && payload.pos;
    if (!origin) return;
    this._countDeepsurveyPingRisk();
    const sectorId = this.state.world && this.state.world.currentSectorId;
    const own = this._ensureState();
    for (const record of Object.values(own.bearings)) {
      if (!record || (record.phase !== 'rumored' && record.phase !== 'fixed') || record.sectorId !== sectorId) continue;
      const def = uniqueWreckById(record.wreckId);
      if (!def || !hasModule(this.state, def.scanRequirement)) continue;
      if (distance(origin, record.exactPos) > UNIQUE_WRECK_SCAN_RADIUS) continue;
      if (record.phase === 'fixed') continue;
      const gate = movingRadiationGate(this.state, record, def);
      if (!gate.allowed) {
        this._receipt('scan_blocked', def.id);
        this.bus.emit('uniqueWreck:scanBlocked', {
          wreckId: def.id,
          sectorId: def.sectorId,
          phase: record.phase,
          reason: gate.reason,
          radiationPhase: gate.phase,
          nextOpenAt: gate.nextOpenAt,
        });
        continue;
      }
      record.phase = 'fixed';
      record.fixedPos = { ...record.exactPos };
      record.fixedAtS = Math.max(0, finite(this.state.simTime, 0));
      if (def.reactor) record.reactorDueAt = record.fixedAtS + def.reactor.timerS;
      const entity = this._materialize(def.id);
      if (entity && entity.data) {
        entity.data.scanned = true;
        entity.data.pingedUntil = record.fixedAtS + 12;
        this._bindEntity(def, record, entity);
      }
      this._receipt('fixed', def.id);
      this.bus.emit('uniqueWreck:bearingFixed', {
        wreckId: def.id,
        sectorId: def.sectorId,
        phase: record.phase,
        pos: { ...record.fixedPos },
      });
      this.bus.emit('toast', {
        text: `${def.name} fixed. Set the amber wreck bearing and recover it.`,
        kind: 'objective',
        ttl: 6,
      });
      this._triggerFixedComplications(def, record);
    }
  },

  _onSalvageCompleted(payload) {
    const entityId = payload && payload.wreckId;
    let wreckId = this._wreckByEntity.get(entityId) || null;
    const entity = this.state.entities && this.state.entities.get && this.state.entities.get(entityId);
    if (!wreckId && entity && entity.data) wreckId = entity.data.uniqueWreckId || null;
    const def = uniqueWreckById(wreckId);
    const own = this._ensureState();
    const record = def && own.bearings[def.id];
    if (!def || !record || record.phase !== 'fixed') return null;

    record.phase = 'decision';
    record.decisionReadyAtS = Math.max(0, finite(this.state.simTime, 0));
    record.choiceId = null;
    record.outcome = null;
    record.resolvedAtS = null;
    record.rewardReceipt = null;
    if (entity && entity.data) entity.data._salvaged = true;
    this._receipt('decision', def.id);
    this._entityByWreck.delete(def.id);
    this._wreckByEntity.delete(entityId);
    this._publishDecision(def.id, 'salvage');
    return record;
  },

  _decisionReadout(def, record, source = 'runtime') {
    return {
      wreckId: def.id,
      sectorId: def.sectorId,
      phase: record.phase,
      source,
      headline: def.decision.headline,
      prompt: def.decision.prompt,
      choices: def.decision.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        consequence: choice.consequence,
      })),
    };
  },

  _publishDecision(wreckId, source = 'runtime') {
    const def = uniqueWreckById(wreckId);
    const record = def && this._ensureState().bearings[def.id];
    if (!def || !record || record.phase !== 'decision') return null;
    const readout = this._decisionReadout(def, record, source);
    this.bus.emit('uniqueWreck:decisionReady', readout);
    this.bus.emit('toast', {
      text: `${def.name} recovered. Choose CLAIM or HANDOVER in the recovery panel.`,
      kind: 'objective',
      ttl: 8,
    });
    return readout;
  },

  _republishPendingDecisions(payload) {
    const source = payload && payload.source || 'request';
    let published = 0;
    for (const record of Object.values(this._ensureState().bearings)) {
      if (record && record.phase === 'decision' && this._publishDecision(record.wreckId, source)) published++;
    }
    return published;
  },

  _onChoose(payload) {
    const def = uniqueWreckById(payload && payload.wreckId);
    const own = this._ensureState();
    const record = def && own.bearings[def.id];
    if (!def || !record || record.phase !== 'decision') return null;
    const choice = def.decision.choices.find((entry) => entry.id === payload.choiceId);
    if (!choice) {
      this._publishDecision(def.id, 'invalid-choice');
      return null;
    }

    // Close the durable decision before emitting authority intents. Event dispatch is synchronous;
    // this ordering makes duplicate/re-entrant choice events unable to settle twice.
    const resolvedAtS = Math.max(0, finite(this.state.simTime, 0));
    record.phase = 'salvaged';
    record.choiceId = choice.id;
    record.outcome = choice.outcome;
    record.resolvedAtS = resolvedAtS;
    record.salvagedAtS = resolvedAtS;

    const collector = this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId) : null;
    const recoveryPos = copyPoint(record.fixedPos || record.exactPos || (collector && collector.pos))
      || { x: 0, z: 0 };
    const cargoGranted = {};
    if (choice.bonusCargo) {
      const rawCargo = {};
      for (const item of def.bonusCargo || []) {
        rawCargo[item.commodityId] = (rawCargo[item.commodityId] || 0) + item.qty;
      }
      const rewardWreck = {
        type: 'wreck',
        data: {
          parentType: def.wreckClass === 'military' ? 'military' : 'ship',
          wreckClass: def.wreckClass,
        },
      };
      const choiceCargo = salvagePoolForWreck(rewardWreck, rawCargo);
      for (const [commodityId, amount] of Object.entries(choiceCargo)) {
        const before = finite(this.state.player && this.state.player.cargo
          && this.state.player.cargo.items && this.state.player.cargo.items[commodityId], 0);
        this.bus.emit('pickup:collected', {
          collectorId: this.state.playerId,
          kind: 'cargo',
          amount,
          commodityId,
          source: 'unique_wreck',
          wreckId: def.id,
          pos: { ...recoveryPos },
        });
        const after = finite(this.state.player && this.state.player.cargo
          && this.state.player.cargo.items && this.state.player.cargo.items[commodityId], before);
        if (after > before) cargoGranted[commodityId] = after - before;
      }
    }

    const uniqueDropIds = [];
    const storyRewardIds = [];
    if (choice.uniqueDrop) {
      const ships = this.registry && this.registry.get && this.registry.get('ships');
      const inventory = this.state.player && this.state.player.moduleInventory || [];
      for (const reward of rewardDescriptors(def)) {
        if (reward.kind === 'weapon' || reward.kind === 'module') {
          let granted = !!own.grants[reward.id];
          if (!granted) {
            const alreadyOwned = inventory.some((item) => item && item.defId === reward.id);
            granted = alreadyOwned || !!(ships
              && typeof ships.grantModule === 'function'
              && ships.grantModule({
                defId: reward.id,
                reason: `unique-wreck:${def.id}:${choice.id}`,
              }));
            if (granted) own.grants[reward.id] = { wreckId: def.id, grantedAtS: resolvedAtS };
          }
          if (granted) uniqueDropIds.push(reward.id);
          continue;
        }
        if (reward.kind !== 'story_commodity' && reward.kind !== 'story_data') continue;
        let granted = !!own.storyRewards[reward.id];
        if (!granted) {
          const flags = ensurePlayer(this.state).flags;
          if (reward.flagKey) flags[reward.flagKey] = true;
          own.storyRewards[reward.id] = {
            wreckId: def.id,
            kind: reward.kind,
            flagKey: reward.flagKey || null,
            grantedAtS: resolvedAtS,
          };
          granted = true;
          this.bus.emit('uniqueWreck:storyRewardGranted', {
            wreckId: def.id,
            sectorId: def.sectorId,
            rewardId: reward.id,
            kind: reward.kind,
            flagKey: reward.flagKey || null,
          });
        }
        if (granted) storyRewardIds.push(reward.id);
      }
    }
    const uniqueDropGranted = uniqueDropIds.includes(def.uniqueDropId);
    this._triggerStoryRewardComplications(def, record, storyRewardIds);

    if (choice.credits > 0) this.bus.emit('economy:grantCredits', {
      amount: choice.credits,
      reason: `unique-wreck:${def.id}:${choice.id}`,
    });
    if (choice.repDelta) this.bus.emit('faction:repDelta', {
      factionId: def.factionId,
      delta: choice.repDelta,
      reason: `unique-wreck:${def.id}:${choice.id}`,
    });

    record.rewardReceipt = {
      id: `unique-wreck:${def.id}:${choice.id}`,
      title: choice.receiptTitle,
      detail: choice.receiptDetail,
      wreckId: def.id,
      choiceId: choice.id,
      outcome: choice.outcome,
      uniqueDropId: uniqueDropGranted ? def.uniqueDropId : null,
      uniqueDropIds: [...uniqueDropIds],
      storyRewardIds: [...storyRewardIds],
      cargo: clonePlain(cargoGranted),
      credits: Math.max(0, finite(choice.credits, 0)),
      factionId: def.factionId,
      repDelta: finite(choice.repDelta, 0),
      resolvedAtS,
    };

    const flags = ensurePlayer(this.state).flags;
    if (!flags.uniqueWrecksVisited.includes(def.id)) flags.uniqueWrecksVisited.push(def.id);
    this._receipt('salvaged', def.id);
    const event = {
      wreckId: def.id,
      sectorId: def.sectorId,
      phase: record.phase,
      choiceId: choice.id,
      outcome: choice.outcome,
      uniqueDropId: uniqueDropGranted ? def.uniqueDropId : null,
      uniqueDropIds: [...uniqueDropIds],
      storyRewardIds: [...storyRewardIds],
      cargo: clonePlain(cargoGranted),
      receipt: clonePlain(record.rewardReceipt),
    };
    this.bus.emit('uniqueWreck:resolved', event);
    this.bus.emit('uniqueWreck:salvaged', event);
    this.bus.emit('news:publish', {
      text: choice.receiptDetail,
      kind: 'wreck_recovery',
      sourceRef: `followup.${def.id}.${choice.id}`,
      wreckId: def.id,
      sectorId: def.sectorId,
      channelId: 'news',
      followup: true,
      receiptId: `depth-r1:${def.programSlot.toLowerCase()}:${choice.id}`,
    });
    // `uniqueWreck:resolved` has one player-facing owner: recoveryEncounterPrompt renders the
    // durable named receipt. Mirroring the same title/detail as an eight-second toast stacked two
    // copies in the upper-right flight HUD and obscured contacts during the recovery aftermath.
    // `news:publish` remains the durable follow-up/history surface.
    return record;
  },

  _onEntityDestroyed(payload) {
    const entityId = payload && payload.id;
    const wreckId = this._wreckByEntity.get(entityId);
    if (!wreckId) return;
    this._wreckByEntity.delete(entityId);
    this._entityByWreck.delete(wreckId);
  },

  serialize() {
    return clonePlain(this._ensureState());
  },

  deserialize(payload) {
    const player = ensurePlayer(this.state);
    player.uniqueWrecks = normalizeUniqueWreckState(payload, this.state.meta && this.state.meta.seed);
    this._clearRuntime();
    return player.uniqueWrecks;
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      for (const [event, handler] of this._subscriptions || []) this.bus.off(event, handler);
    }
    if (this._subscriptions) this._subscriptions.length = 0;
    this._clearRuntime();
  },
};

export default uniqueWrecks;
