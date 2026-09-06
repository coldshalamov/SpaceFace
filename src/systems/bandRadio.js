// A1 The Band — deterministic tuner/content owner.
//
// This system owns only state.bandRadio. It routes visible ticker copy through the one-voice
// arbiter and emits audio-bed intents. The numbers station cannot create a wreck rumor: it waits
// for a matching, root-supplied canonical band:bearingResolved receipt.

import { hash32 } from '../core/rng.js';
import { localizeText } from '../localization/gameLocalization.js';
import {
  BAND_BEARING_TEMPLATE,
  BAND_CHANNEL_BY_ID,
  BAND_EVENT_KEYS,
  TUNABLE_BAND_CHANNEL_IDS,
  bandSignalStrength,
  resolveLandmarkBleed,
  selectBandLine,
} from '../data/bandRadio.js';

export const BAND_STATE_VERSION = 1;
export const BAND_PRIORITY = 5;
export const BAND_LINE_TTL_S = 4;
export const BAND_LINE_INTERVAL_S = 12;
export const BAND_MIN_SIGNAL = 0.08;
export const NUMBERS_DROP_DENOMINATOR = 29;

const LANDMARK_PROXIMITY_SAMPLE_INTERVAL_S = 0.2;
// Live landmark carriers, one per authored landmark (see flavor/060-quiessence, 070-hush, and the
// Resonance Obelisk landmark lore). The runtime samples world entities carrying the source's data
// key and feeds the falloff strength into resolveLandmarkBleed.
const LIVE_LANDMARK_SOURCES = Object.freeze({
  landmark_quiessence: Object.freeze({
    sectorId: 'sector_pallas_drift',
    dataKey: 'flavorTargetRef',
    dataValue: 'landmark_c14_quiessence',
    falloffRadius: 1600,
  }),
  planet_hush: Object.freeze({
    sectorId: 'sector_eunomia_gulf',
    dataKey: 'flavorSourceId',
    dataValue: 'planet_hush',
    falloffRadius: 2400,
  }),
  resonance_obelisk: Object.freeze({
    sectorId: 'sector_veil_nebula',
    dataKey: 'flavorTargetRef',
    dataValue: 'landmark_c2_resonance_obelisk',
    falloffRadius: 1900,
  }),
});
const LIVE_LANDMARK_SOURCE_ENTRIES = Object.freeze(Object.entries(LIVE_LANDMARK_SOURCES));

export function numbersBearingDue(programSeed, sequence) {
  return (hash32(programSeed || 1, 'band-numbers-drop', sequence | 0) % NUMBERS_DROP_DENOMINATOR) === 0;
}

export function deriveBandEventKeys(event, payload = {}, state = {}) {
  if (event === 'freight:loss') {
    return state.playerId != null && payload.killerId === state.playerId
      ? ['player.destroy_freighter']
      : [];
  }
  if (event === 'mission:completed') {
    const keys = [];
    if (payload.type === 'patrol_clear') keys.push('player.clear_lane');
    if (payload.source === 'economyContract'
      && payload.type === 'cargo_delivery'
      && payload.causeTag === 'infrastructure_disruption') {
      keys.push('player.break_blockade');
    }
    return keys;
  }
  if (event === 'dock:docked') {
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const hull = player && Number(player.hull);
    const hullMax = player && Number(player.hullMax);
    return Number.isFinite(hull) && Number.isFinite(hullMax) && hull > 0 && hullMax > 0
      && hull / hullMax < 0.25
      ? ['player.dock_heavily_damaged']
      : [];
  }
  return [];
}

export function defaultBandRadioState() {
  return {
    version: BAND_STATE_VERSION,
    channelId: null,
    sequence: 0,
    nextLineAtS: 0,
    identPending: false,
    effectiveKey: null,
    effectiveChannelId: null,
    effectiveSourceId: null,
    signalStrength: 0,
    eventKeys: {},
    proximitySources: {},
    lastLineIdByChannel: {},
    heardLineIds: [],
    pendingBearingRequest: null,
    numbersReceipt: null,
    pendingBearingAnnouncement: null,
  };
}

export function normalizeBandRadioState(value) {
  const base = defaultBandRadioState();
  const input = value && typeof value === 'object' ? value : {};
  return {
    ...base,
    channelId: TUNABLE_BAND_CHANNEL_IDS.includes(input.channelId) ? input.channelId : null,
    sequence: nonNegativeInt(input.sequence),
    nextLineAtS: Math.max(0, finite(input.nextLineAtS, 0)),
    identPending: !!input.identPending,
    effectiveKey: stringOrNull(input.effectiveKey),
    effectiveChannelId: stringOrNull(input.effectiveChannelId),
    effectiveSourceId: stringOrNull(input.effectiveSourceId),
    signalStrength: clamp01(finite(input.signalStrength, 0)),
    eventKeys: copyTruthyMap(input.eventKeys),
    proximitySources: copyFiniteMap(input.proximitySources),
    lastLineIdByChannel: copyStringMap(input.lastLineIdByChannel),
    heardLineIds: uniqueStrings(input.heardLineIds, 256),
    pendingBearingRequest: normalizeBearingRequest(input.pendingBearingRequest),
    numbersReceipt: normalizeBearingReceipt(input.numbersReceipt),
    pendingBearingAnnouncement: normalizeBearingReceipt(input.pendingBearingAnnouncement),
  };
}

export const bandRadio = {
  name: 'bandRadio',

  init(ctx) {
    // Registry re-initialization is legal during hot reload/test restore. The module is a singleton,
    // so remove the previous bus bindings before attaching to a new context.
    for (const unsub of this._unsubs || []) {
      try { unsub(); } catch (_) {}
    }
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._unsubs = [];
    this._lastStatusSignature = null;
    this._lastBedSignature = null;
    this._bearingRequestEmitted = false;
    this._nextLandmarkProximitySampleAtS = 0;
    this._ensureState();
    this._listen('band:tune', (payload) => this._setChannel(payload && payload.channelId));
    this._listen('band:cycle', () => this._cycleChannel());
    this._listen('band:sourceProximity', (payload) => this._setSourceProximity(payload));
    this._listen('sector:enter', () => {
      this._clearSourceProximity();
      this._nextLandmarkProximitySampleAtS = 0;
    });
    this._listen('band:bearingResolved', (payload) => this._acceptBearingResolution(payload));
    this._listen('band:bearingUnavailable', (payload) => this._rejectBearingResolution(payload));
    for (const event of ['freight:loss', 'mission:completed', 'dock:docked']) {
      this._listen(event, (payload) => {
        const own = this._ensureState();
        for (const eventKey of deriveBandEventKeys(event, payload || {}, this.state)) {
          if (BAND_EVENT_KEYS.includes(eventKey)) own.eventKeys[eventKey] = true;
        }
      });
    }
  },

  newGame() {
    this.state.bandRadio = defaultBandRadioState();
    this._lastStatusSignature = null;
    this._lastBedSignature = null;
    this._bearingRequestEmitted = false;
    this._emitBed({ active: false, reason: 'new-game' });
    this._nextLandmarkProximitySampleAtS = 0;
    this._emitStatus();
  },

  serialize() {
    const snapshot = clonePlain(normalizeBandRadioState(this._ensureState()));
    // Proximity and effective-carrier fields are derived from the live sector. Persisting them lets
    // a removed landmark follow the player across sector/load boundaries until some future emitter
    // happens to publish an explicit zero-strength sample.
    snapshot.proximitySources = {};
    snapshot.effectiveKey = null;
    snapshot.effectiveChannelId = snapshot.channelId;
    snapshot.effectiveSourceId = null;
    snapshot.signalStrength = 0;
    snapshot.identPending = !!snapshot.channelId;
    return snapshot;
  },

  deserialize(data) {
    this.state.bandRadio = normalizeBandRadioState(data);
    this._clearSourceProximity();
    this._nextLandmarkProximitySampleAtS = 0;
    this._bearingRequestEmitted = false;
    this._lastStatusSignature = null;
    this._lastBedSignature = null;
    this._emitStatus();
    return this.state.bandRadio;
  },

  update(_dt, state) {
    if (state) this.state = state;
    const own = this._ensureState();
    const now = Math.max(0, finite(this.state.simTime, 0));
    this._sampleLiveLandmarkProximity(now);
    const tuned = own.channelId && BAND_CHANNEL_BY_ID[own.channelId];
    if (!tuned || this.state.mode !== 'flight' || !!(this.state.ui && this.state.ui.docked)) {
      own.signalStrength = 0;
      own.effectiveChannelId = tuned ? tuned.id : null;
      own.effectiveSourceId = null;
      own.effectiveKey = tuned ? tuned.id : null;
      this._emitBed({ active: false, reason: tuned ? 'not-in-flight' : 'off' });
      this._emitStatus();
      return;
    }

    const context = this._signalContext();
    const bleed = resolveLandmarkBleed(own.proximitySources);
    const effectiveKey = bleed ? `landmark:${bleed.sourceId}` : tuned.id;
    if (own.effectiveKey !== effectiveKey) {
      own.effectiveKey = effectiveKey;
      own.identPending = true;
      own.nextLineAtS = Math.min(own.nextLineAtS, now);
    }
    own.effectiveChannelId = bleed ? 'landmark_bleed' : tuned.id;
    own.effectiveSourceId = bleed ? bleed.sourceId : null;
    own.signalStrength = bleed ? bleed.strength : bandSignalStrength(tuned, context);

    if (bleed && bleed.silence) {
      this._emitBed({
        active: false, silence: true, sourceId: bleed.sourceId,
        channelId: own.channelId, effectiveChannelId: 'landmark_bleed', strength: own.signalStrength,
      });
      this._emitStatus({ silence: true });
      return;
    }

    const floorBusy = this._voiceFloorBusy();
    const audible = own.signalStrength >= BAND_MIN_SIGNAL && !floorBusy;
    this._emitBed({
      active: audible,
      channelId: own.channelId,
      effectiveChannelId: own.effectiveChannelId,
      sourceId: own.effectiveSourceId,
      strength: own.signalStrength,
      bed: bleed ? bleed.bed : tuned.bed,
      reason: floorBusy ? 'voice-floor-busy' : (audible ? 'tuned' : 'weak-signal'),
    });
    this._emitStatus({ floorBusy });
    if (!audible || now < own.nextLineAtS) return;

    if (own.pendingBearingAnnouncement && this._speakBearingAnnouncement(own.pendingBearingAnnouncement)) {
      own.pendingBearingAnnouncement = null;
      own.nextLineAtS = now + this._cadenceForSignal(own.signalStrength);
      return;
    }

    if (own.identPending) {
      const ident = bleed ? bleed.ident : tuned.ident;
      if (ident && this._say(ident, own.effectiveChannelId)) {
        own.identPending = false;
        own.nextLineAtS = now + this._cadenceForSignal(own.signalStrength);
      } else if (!ident) {
        own.identPending = false;
      }
      return;
    }

    if (tuned.id === 'numbers_station' && !bleed && !own.numbersReceipt) {
      if (own.pendingBearingRequest) {
        this._emitOutstandingBearingRequest();
        own.nextLineAtS = now + this._cadenceForSignal(own.signalStrength);
        return;
      }
      if (numbersBearingDue(this._programSeed(), own.sequence)) {
        this._beginBearingRequest(now);
        own.sequence += 1;
        own.nextLineAtS = own.pendingBearingAnnouncement
          ? now
          : now + this._cadenceForSignal(own.signalStrength);
        return;
      }
    }

    const source = bleed || tuned;
    const line = bleed
      ? selectLandmarkLine(bleed, this._programSeed(), own.sequence, context.sectorId,
        own.lastLineIdByChannel[effectiveKey])
      : selectBandLine(tuned, {
        eventKeys: own.eventKeys,
        reachRep: context.reachRep,
        lastLineId: own.lastLineIdByChannel[effectiveKey],
      }, this._programSeed(), own.sequence, context.sectorId);
    if (!line || !this._say(line, source.id || own.effectiveChannelId)) return;
    own.lastLineIdByChannel[effectiveKey] = line.id;
    if (!own.heardLineIds.includes(line.id)) own.heardLineIds.push(line.id);
    if (own.heardLineIds.length > 256) own.heardLineIds.splice(0, own.heardLineIds.length - 256);
    own.sequence += 1;
    own.nextLineAtS = now + this._cadenceForSignal(own.signalStrength);
  },

  destroy() {
    for (const unsub of this._unsubs || []) {
      try { unsub(); } catch (_) {}
    }
    this._unsubs = [];
    this._emitBed({ active: false, reason: 'destroy' });
  },

  _listen(event, handler) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const unsub = this.bus.on(event, handler);
    if (typeof unsub === 'function') this._unsubs.push(unsub);
  },

  _ensureState() {
    const current = this.state && this.state.bandRadio;
    if (!current || current.version !== BAND_STATE_VERSION) {
      this.state.bandRadio = normalizeBandRadioState(current);
    }
    return this.state.bandRadio;
  },

  _programSeed() {
    return ((this.state.meta && this.state.meta.seed) >>> 0) || 1;
  },

  _setChannel(channelId) {
    const own = this._ensureState();
    const next = TUNABLE_BAND_CHANNEL_IDS.includes(channelId) ? channelId : null;
    if (own.channelId === next) return;
    own.channelId = next;
    own.identPending = !!next;
    own.effectiveKey = null;
    own.effectiveChannelId = next;
    own.effectiveSourceId = null;
    own.signalStrength = 0;
    own.nextLineAtS = Math.max(0, finite(this.state.simTime, 0));
    this._emitBed({ active: false, reason: next ? 'retune' : 'off' });
    this._emitStatus();
  },

  _sampleLiveLandmarkProximity(now) {
    if (now < finite(this._nextLandmarkProximitySampleAtS, 0)) return false;
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.get !== 'function' || typeof entities.values !== 'function') return false;
    const player = entities && typeof entities.get === 'function'
      ? entities.get(this.state.playerId)
      : null;
    this._nextLandmarkProximitySampleAtS = now + LANDMARK_PROXIMITY_SAMPLE_INTERVAL_S;
    if (!player || !finitePoint(player.pos)) {
      const own = this._ensureState();
      for (const [sourceId] of LIVE_LANDMARK_SOURCE_ENTRIES) setProximityValue(own.proximitySources, sourceId, 0);
      return true;
    }

    const sectorId = this.state.world && this.state.world.currentSectorId;
    const strengths = Object.fromEntries(LIVE_LANDMARK_SOURCE_ENTRIES.map(([sourceId]) => [sourceId, 0]));
    for (const entity of entities.values()) {
      if (!entity || entity === player || entity.alive === false || !finitePoint(entity.pos)) continue;
      const data = entity.data && typeof entity.data === 'object' ? entity.data : {};
      const entitySectorId = stringOrNull(entity.sectorId) || stringOrNull(data.sectorId);
      if (entitySectorId && entitySectorId !== sectorId) continue;
      for (const [sourceId, source] of LIVE_LANDMARK_SOURCE_ENTRIES) {
        if (source.sectorId !== sectorId || data[source.dataKey] !== source.dataValue) continue;
        const configuredRadius = finite(data.bandProximityRadius, source.falloffRadius);
        const falloffRadius = configuredRadius > 0 ? configuredRadius : source.falloffRadius;
        const centerDistance = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
        const surfaceDistance = Math.max(0, centerDistance - Math.max(0, finite(entity.radius, 0)));
        const strength = clamp01(1 - surfaceDistance / falloffRadius);
        strengths[sourceId] = Math.max(strengths[sourceId], strength);
      }
    }

    const own = this._ensureState();
    for (const [sourceId, strength] of Object.entries(strengths)) {
      setProximityValue(own.proximitySources, sourceId, strength);
    }
    return true;
  },

  _cycleChannel() {
    const own = this._ensureState();
    const currentIndex = TUNABLE_BAND_CHANNEL_IDS.indexOf(own.channelId);
    const next = currentIndex < 0
      ? TUNABLE_BAND_CHANNEL_IDS[0]
      : (currentIndex + 1 < TUNABLE_BAND_CHANNEL_IDS.length
        ? TUNABLE_BAND_CHANNEL_IDS[currentIndex + 1]
        : null);
    this._setChannel(next);
  },

  _setSourceProximity(payload) {
    if (!payload || !['landmark_quiessence', 'planet_hush', 'resonance_obelisk'].includes(payload.sourceId)) return;
    const own = this._ensureState();
    const strength = clamp01(finite(payload.strength, 0));
    if (strength <= 0) delete own.proximitySources[payload.sourceId];
    else own.proximitySources[payload.sourceId] = strength;
  },

  _clearSourceProximity() {
    const own = this._ensureState();
    own.proximitySources = {};
    own.effectiveKey = null;
    own.effectiveChannelId = own.channelId;
    own.effectiveSourceId = null;
    own.signalStrength = 0;
    own.identPending = !!own.channelId;
  },

  _signalContext() {
    const world = this.state.world || {};
    const sectorId = world.currentSectorId || null;
    const sector = sectorId && world.sectors && world.sectors[sectorId] || {};
    const stations = Array.isArray(sector.stations) ? sector.stations : [];
    const activePresence = Object.values(
      (this.state.factionPresence && this.state.factionPresence.active) || {},
    ).filter((entry) => entry && (!entry.sectorId || entry.sectorId === sectorId));
    const presenceFactionIds = Array.isArray(sector.presenceFactionIds)
      ? sector.presenceFactionIds
      : activePresence.map((entry) => entry.factionId).filter(Boolean);
    return {
      sectorId,
      factionId: sector.factionId || sector.owner || null,
      stationFactionIds: stations.map((station) => station && station.factionId).filter(Boolean),
      presenceFactionIds,
      tier: finite(sector.tier, 0),
      security: finite(sector.security, 0.35),
      reachRep: factionRep(this.state, 'faction_reach'),
      proximitySources: this._ensureState().proximitySources,
    };
  },

  _voiceFloorBusy() {
    const arbiter = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('voiceArbiter')
      : null;
    const queue = arbiter && arbiter.queue;
    if (!queue) return false;
    // The Band owns one arbiter entry while its ticker is visible. That entry must not silence its
    // own carrier; every non-Band entry does, including queued story/comms that has not surfaced yet.
    if (queue.active && queue.active.channel !== 'band') return true;
    return Array.isArray(queue.pending) && queue.pending.some((entry) => entry && entry.channel !== 'band');
  },

  _say(copy, sourceId) {
    const voice = this.helpers && this.helpers.voice;
    if (!copy || !copy.text || !voice || typeof voice.say !== 'function') return false;
    const own = this._ensureState();
    return voice.say({
      id: `band:${sourceId || own.channelId}:${copy.id}:${own.sequence}`,
      channel: 'band',
      priority: BAND_PRIORITY,
      kind: 'band',
      ttl: BAND_LINE_TTL_S,
      text: localizeText(copy.text),
    }) !== false;
  },

  _cadenceForSignal(strength) {
    return BAND_LINE_INTERVAL_S + Math.round((1 - clamp01(strength)) * 10);
  },

  _beginBearingRequest(now) {
    const own = this._ensureState();
    const requestId = `band-bearing-${hash32(this._programSeed(), 'band-bearing', own.sequence).toString(36)}`;
    own.pendingBearingRequest = {
      requestId,
      channelId: 'numbers_station',
      requestedAtS: Math.max(0, finite(now, 0)),
      sequence: own.sequence,
      contractVersion: 1,
    };
    this._bearingRequestEmitted = false;
    this._emitOutstandingBearingRequest();
  },

  _emitOutstandingBearingRequest() {
    const own = this._ensureState();
    if (!own.pendingBearingRequest || own.numbersReceipt || this._bearingRequestEmitted) return false;
    this._bearingRequestEmitted = true;
    this.bus.emit('band:bearingRequest', clonePlain(own.pendingBearingRequest));
    return true;
  },

  _acceptBearingResolution(payload) {
    const own = this._ensureState();
    const pending = own.pendingBearingRequest;
    if (own.numbersReceipt || !pending || !payload || payload.requestId !== pending.requestId) return false;
    if (payload.canonical !== true) return false;
    const wreckId = nonEmpty(payload.wreckId);
    const sourceRef = nonEmpty(payload.sourceRef);
    const bearingLabel = nonEmpty(payload.bearingLabel);
    if (!wreckId || !sourceRef || !bearingLabel) return false;
    const receipt = {
      requestId: pending.requestId,
      wreckId,
      sourceRef,
      bearingLabel,
      sectorId: nonEmpty(payload.sectorId),
      resolvedAtS: Math.max(0, finite(this.state.simTime, pending.requestedAtS)),
      canonical: true,
    };
    own.numbersReceipt = receipt;
    own.pendingBearingAnnouncement = receipt;
    own.pendingBearingRequest = null;
    own.nextLineAtS = Math.min(own.nextLineAtS, Math.max(0, finite(this.state.simTime, 0)));
    this._bearingRequestEmitted = false;
    this.bus.emit('band:bearingReceipt', clonePlain(receipt));
    return true;
  },

  _rejectBearingResolution(payload) {
    const own = this._ensureState();
    if (!own.pendingBearingRequest || !payload || payload.requestId !== own.pendingBearingRequest.requestId) return false;
    own.pendingBearingRequest = null;
    this._bearingRequestEmitted = false;
    return true;
  },

  _speakBearingAnnouncement(receipt) {
    const voice = this.helpers && this.helpers.voice;
    if (!receipt || !BAND_BEARING_TEMPLATE || !voice || typeof voice.say !== 'function') return false;
    return voice.say({
      id: `band:numbers-bearing:${receipt.requestId}`,
      channel: 'band',
      priority: BAND_PRIORITY,
      kind: 'band',
      ttl: BAND_LINE_TTL_S,
      text: localizeText(BAND_BEARING_TEMPLATE.text, { bearing: receipt.bearingLabel }),
    }) !== false;
  },

  _emitStatus(extra = {}) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const own = this._ensureState();
    const payload = {
      channelId: own.channelId,
      effectiveChannelId: own.effectiveChannelId,
      sourceId: own.effectiveSourceId,
      signalStrength: own.signalStrength,
      bearingReceipt: own.numbersReceipt ? clonePlain(own.numbersReceipt) : null,
      ...extra,
    };
    const signature = JSON.stringify(payload);
    if (signature === this._lastStatusSignature) return;
    this._lastStatusSignature = signature;
    this.bus.emit('band:status', payload);
  },

  _emitBed(payload) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const normalized = {
      active: !!(payload && payload.active),
      silence: !!(payload && payload.silence),
      channelId: payload && payload.channelId || null,
      effectiveChannelId: payload && payload.effectiveChannelId || null,
      sourceId: payload && payload.sourceId || null,
      strength: clamp01(finite(payload && payload.strength, 0)),
      bed: payload && payload.bed || null,
      reason: payload && payload.reason || null,
    };
    const signature = JSON.stringify(normalized);
    if (signature === this._lastBedSignature) return;
    this._lastBedSignature = signature;
    this.bus.emit('band:bed', normalized);
  },
};

function finitePoint(value) { return !!value && Number.isFinite(value.x) && Number.isFinite(value.z); }

function setProximityValue(target, sourceId, strength) {
  if (strength > 0) target[sourceId] = clamp01(strength);
  else delete target[sourceId];
}

function selectLandmarkLine(bleed, seed, sequence, sectorId, lastLineId) {
  const lines = bleed && bleed.lines || [];
  if (!lines.length) return null;
  let index = hash32(seed || 1, 'band-landmark', bleed.sourceId, sequence | 0, sectorId || '') % lines.length;
  if (lines.length > 1 && lines[index].id === lastLineId) index = (index + 1) % lines.length;
  return lines[index];
}

function factionRep(state, factionId) {
  const factions = state && state.factions;
  const record = factions && factions[factionId];
  return finite(record && record.rep, finite(record, 0));
}

function normalizeBearingRequest(value) {
  if (!value || typeof value !== 'object' || !nonEmpty(value.requestId)) return null;
  return {
    requestId: nonEmpty(value.requestId),
    channelId: 'numbers_station',
    requestedAtS: Math.max(0, finite(value.requestedAtS, 0)),
    sequence: nonNegativeInt(value.sequence),
    contractVersion: 1,
  };
}

function normalizeBearingReceipt(value) {
  if (!value || typeof value !== 'object') return null;
  const requestId = nonEmpty(value.requestId);
  const wreckId = nonEmpty(value.wreckId);
  const sourceRef = nonEmpty(value.sourceRef);
  const bearingLabel = nonEmpty(value.bearingLabel);
  if (!requestId || !wreckId || !sourceRef || !bearingLabel || value.canonical !== true) return null;
  return {
    requestId, wreckId, sourceRef, bearingLabel,
    sectorId: nonEmpty(value.sectorId),
    resolvedAtS: Math.max(0, finite(value.resolvedAtS, 0)),
    canonical: true,
  };
}

function clonePlain(value) { return JSON.parse(JSON.stringify(value)); }
function nonNegativeInt(value) { return Math.max(0, Number.isInteger(value) ? value : 0); }
function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp01(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
function stringOrNull(value) { return typeof value === 'string' && value ? value : null; }
function nonEmpty(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }

function copyTruthyMap(value) {
  const result = {};
  for (const [key, active] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (active) result[key] = true;
  }
  return result;
}

function copyFiniteMap(value) {
  const result = {};
  for (const [key, amount] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (Number.isFinite(amount) && amount > 0) result[key] = clamp01(amount);
  }
  return result;
}

function copyStringMap(value) {
  const result = {};
  for (const [key, text] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (typeof text === 'string' && text) result[key] = text;
  }
  return result;
}

function uniqueStrings(value, cap) {
  return [...new Set((Array.isArray(value) ? value : []).filter((entry) => typeof entry === 'string' && entry))]
    .slice(-cap);
}

export default bandRadio;
