// BP-13/B12 Station Pirate-Rumor Heat.
//
// Reader/aggregator only: derives lane rumors from real spawned pirate encounters and civilian
// traffic deaths. It never spawns and never writes economy state.
import { pickVariant } from '../ui/marketNews.js';
import { zoneAt, zonesForSector } from '../data/sectorZones.js';
import { hash32 } from '../core/rng.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';

export const PIRATE_RUMOR_THRESHOLD = 3;
export const PIRATE_RUMOR_DECAY_PER_S = 0.003;
export const ROUTE_DANGER_IGNORED_EVENTS = 5;
export const ROUTE_DANGER_MAX = 0.6;
export const ROUTE_DANGER_MIN = -0.6;
export const ROUTE_DANGER_CLEAR_DELTA = -0.35;
export const ROUTE_DANGER_IGNORED_DELTA = 0.2;
export const ROUTE_CONVOY_CLEAR_DELTA = 0.35;
export const PIRATE_BASE_CANDIDATE_EVENTS = 6;
const PIRATE_RUMOR_COOLDOWN_S = 300;
const ROUTE_FEEDBACK_DURATION_S = 900;
const ROUTE_FEEDBACK_NEWS_COOLDOWN_S = 300;
const COUNTER_INTEL_RECEIPT_CAP = 64;
const SCHEMA_VERSION = 1;

const PIRATE_ENCOUNTER_KINDS = new Set([
  'ambush_snare',
  'pirate_toll',
  'named_hunter',
  'claim_threat',
]);

const CIVILIAN_TRAFFIC_ROLES = new Set([
  'hauler', 'courier', 'miner', 'rescue', 'trader',
  // Occupational work fleet (working trades + PQ-136.02). Deaths of these hulls feed lane rumor.
  // Patrol/escort/customs stay out: they are law presence, not civilian traffic.
  'surveyor', 'salvor', 'tender', 'prospector', 'sweeper', 'shuttle',
]);
const PIRATE_BASE_VECTOR_KINDS = new Set(['ambush_snare', 'pirate_toll', 'named_hunter']);
const PIRATE_CAPABLE_ZONE_TYPES = new Set(['ambush_lane', 'outlaw_zone', 'derelict_field']);

const HEADLINES = Object.freeze([
  'Station boards warn: {count} ships vanished near {zone}.',
  'Pirate rumor: {zone} is hot after {count} recent losses.',
  'Route notice: avoid {zone}; raider reports are piling up.',
]);

const ROUTE_FEEDBACK_HEADLINES = Object.freeze({
  ignored: [
    'Route warning: {zone} is getting deadlier after ignored raids.',
    'Station boards flag {zone}: raider confidence is rising.',
  ],
  leaderCleared: [
    'Route update: {zone} convoys are moving again after a raider leader fell.',
    'Station boards mark {zone} safer; convoy captains are testing the lane.',
  ],
});

export const pirateRumor = {
  name: 'pirateRumor',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._subs = [];
    ensureRumorState(this.state);
    this._listen('encounter:spawned', (p) => this._onEncounterSpawned(p));
    this._listen('encounter:resolved', (p) => this._onEncounterResolved(p));
    this._listen('entity:killed', (p) => this._onEntityKilled(p));
    this._listen('pirateRumor:counterIntel', (p) => this._onCounterIntel(p));
  },

  newGame() {
    if (this.state) this.state.pirateRumor = freshState();
  },

  update(dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    this.state = state;
    const own = ensureRumorState(state);
    for (const rec of Object.values(own.zones)) {
      if (!rec) continue;
      if (Number.isFinite(rec.heat) && rec.heat > 0) {
        rec.heat = Math.max(0, rec.heat - PIRATE_RUMOR_DECAY_PER_S * Math.max(0, dt || 0));
      }
      decayRouteFeedback(rec, state.simTime || 0);
    }
    this._applyPendingFeedback(state);
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._subs = [];
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _onEncounterSpawned(payload) {
    if (!payload || !PIRATE_ENCOUNTER_KINDS.has(payload.kind)) return;
    const sectorId = payload.sectorId || currentSectorId(this.state);
    const zone = zoneById(sectorId, payload.zoneId);
    if (!sectorId || !zone) return;
    this._addHeat({
      sectorId,
      zone,
      amount: 1,
      source: 'encounter',
      detail: payload.kind,
      eventId: payload.encounterId || `${payload.kind}:${payload.zoneId || 'zone'}:${this.state && this.state.simTime || 0}`,
      count: payload.count || 1,
    });
  },

  _onEntityKilled(payload) {
    if (!payload || !this.state) return;
    const entity = this.state.entities && this.state.entities.get(payload.id);
    if (!isCivilianTraffic(entity)) return;
    const sectorId = currentSectorId(this.state);
    const pos = payload.pos || entity.pos;
    if (!sectorId || !pos) return;
    const local = globalToSectorLocalForSector(pos, sectorId);
    const zone = zoneAt(sectorId, local.x, local.z);
    if (!zone) return;
    this._addHeat({
      sectorId,
      zone,
      amount: 1,
      source: 'civilian-loss',
      detail: entity.data && entity.data.trafficRole || 'civilian',
      count: 1,
    });
  },

  _onEncounterResolved(payload) {
    if (!payload) return;
    const shape = payload.shape || payload.kind || payload.shapeId;
    const outcome = String(payload.outcome || '').toLowerCase();
    if (shape !== 'named_hunter' || !['killed', 'defeated', 'cleared'].includes(outcome)) return;
    const sectorId = payload.sectorId || currentSectorId(this.state);
    const zone = zoneById(sectorId, payload.zoneId);
    if (!sectorId || !zone) return;
    const rec = zoneRecordFor(this.state, sectorId, zone);
    this._shiftRouteFeedback(rec, {
      dangerDelta: ROUTE_DANGER_CLEAR_DELTA,
      convoyDelta: ROUTE_CONVOY_CLEAR_DELTA,
      reason: 'leaderCleared',
    });
  },

  _onCounterIntel(payload) {
    if (!payload || !this.state) return;
    const sectorId = payload.sectorId || currentSectorId(this.state);
    const profileId = String(payload.profileId || '').trim();
    const milestone = Math.max(0, payload.milestone | 0);
    if (!sectorId || !profileId || milestone <= 0) return;

    const own = ensureRumorState(this.state);
    const receipt = `${profileId}:${milestone}`;
    if (own.counterIntelReceipts.includes(receipt)) return;
    const zone = counterIntelZoneFor(this.state, sectorId, profileId, milestone);
    if (!zone) return;

    const now = this.state.simTime || 0;
    const rec = zoneRecordFor(this.state, sectorId, zone);
    const dangerDelta = -Math.min(0.32, 0.14 + milestone * 0.03);
    const convoyDelta = Math.min(0.35, 0.12 + milestone * 0.03);
    rec.routeDanger = clamp((rec.routeDanger || 0) + dangerDelta, ROUTE_DANGER_MIN, ROUTE_DANGER_MAX);
    rec.routeConvoy = clamp((rec.routeConvoy || 0) + convoyDelta, -ROUTE_DANGER_MAX, ROUTE_DANGER_MAX);
    rec.routeFeedbackUntil = now + ROUTE_FEEDBACK_DURATION_S;
    rec.lastRouteFeedbackReason = 'counter_intelligence';
    rec.lastCounterIntel = {
      profileId,
      networkName: payload.networkName || null,
      milestone,
      appliedAt: now,
    };

    own.counterIntelProfileZones[profileId] = { sectorId, zoneId: zone.id };
    own.counterIntelReceipts.push(receipt);
    if (own.counterIntelReceipts.length > COUNTER_INTEL_RECEIPT_CAP) {
      own.counterIntelReceipts.splice(0, own.counterIntelReceipts.length - COUNTER_INTEL_RECEIPT_CAP);
    }
    pruneCounterIntelProfileZones(own);
    own.lastRouteFeedbackPlanKey = null;
    this._applyPendingFeedback(this.state);

    emit(this.bus, 'pirateRumor:counterIntelApplied', {
      profileId,
      networkName: payload.networkName || null,
      factionId: payload.factionId || null,
      authorityFactionId: payload.authorityFactionId || null,
      sectorId,
      zoneId: zone.id,
      zoneName: zone.name || zone.id,
      milestone,
      dangerDelta: round(dangerDelta),
      convoyDelta: round(convoyDelta),
      feedback: routeDangerFeedbackFromRecord(rec, now),
    });
  },

  _addHeat({ sectorId, zone, amount, source, detail, eventId, count }) {
    const own = ensureRumorState(this.state);
    const key = rumorKey(sectorId, zone.id);
    const rec = own.zones[key] || (own.zones[key] = freshZoneRecord(sectorId, zone));
    const now = this.state && this.state.simTime || 0;
    rec.heat = Math.max(0, (rec.heat || 0) + Math.max(0, amount || 0));
    rec.eventCount = (rec.eventCount | 0) + 1;
    rec.lossCount = (rec.lossCount | 0) + Math.max(1, count | 0);
    rec.lastEventAt = now;
    rec.lastSource = source || null;
    rec.lastDetail = detail || null;
    rec.zoneName = zone.name || rec.zoneName || zone.id;
    rec.zoneType = zone.type || rec.zoneType || null;
    rec.sectorId = sectorId;
    rec.zoneId = zone.id;
    if (source === 'encounter' && PIRATE_BASE_VECTOR_KINDS.has(detail)) {
      rememberAmbushVector(rec, detail, eventId, now);
      this._maybeMarkPirateBaseCandidate(rec, now);
    }
    this._maybeSurface(key, rec, now);
    if (source === 'encounter') this._maybeRaiseRouteDanger(rec);
  },

  _maybeSurface(key, rec, now) {
    const hottest = hottestRumor(this.state);
    if (!hottest || hottest.key !== key || hottest.heat < PIRATE_RUMOR_THRESHOLD) return;
    if (Number.isFinite(rec.lastHeadlineAt) && (now - rec.lastHeadlineAt) < PIRATE_RUMOR_COOLDOWN_S) return;
    const headline = headlineFor(rec, this.state);
    rec.lastHeadlineAt = now;
    rec.lastHeadline = headline;
    rec.headlineCount = (rec.headlineCount | 0) + 1;
    const payload = {
      headline,
      kind: 'piracy',
      sectorId: rec.sectorId,
      zoneId: rec.zoneId,
      zoneName: rec.zoneName,
      heat: round(rec.heat),
      source: rec.lastSource || null,
    };
    const card = {
      kind: 'piracy',
      title: 'Pirate rumor',
      body: headline,
      sectorId: rec.sectorId,
      zoneId: rec.zoneId,
      zoneName: rec.zoneName,
    };
    rememberCard(this.state, card);
    emit(this.bus, 'news:headline', payload);
    emit(this.bus, 'pirateRumor:headline', payload);
    emit(this.bus, 'pirateRumor:card', card);
  },

  _maybeRaiseRouteDanger(rec) {
    if (!rec || (rec.eventCount | 0) < ROUTE_DANGER_IGNORED_EVENTS) return;
    const last = rec.lastIgnoredFeedbackEventCount | 0;
    if ((rec.eventCount | 0) - last < ROUTE_DANGER_IGNORED_EVENTS) return;
    rec.lastIgnoredFeedbackEventCount = rec.eventCount | 0;
    this._shiftRouteFeedback(rec, {
      dangerDelta: ROUTE_DANGER_IGNORED_DELTA,
      convoyDelta: 0,
      reason: 'ignored',
    });
  },

  _shiftRouteFeedback(rec, { dangerDelta, convoyDelta, reason }) {
    if (!rec || !this.state) return;
    const now = this.state.simTime || 0;
    rec.routeDanger = clamp((rec.routeDanger || 0) + (dangerDelta || 0), ROUTE_DANGER_MIN, ROUTE_DANGER_MAX);
    rec.routeConvoy = clamp((rec.routeConvoy || 0) + (convoyDelta || 0), -ROUTE_DANGER_MAX, ROUTE_DANGER_MAX);
    rec.routeFeedbackUntil = now + ROUTE_FEEDBACK_DURATION_S;
    rec.lastRouteFeedbackReason = reason || null;
    this._emitRouteFeedbackNews(rec, reason, now);
  },

  _maybeMarkPirateBaseCandidate(rec, now) {
    if (!rec || rec.pirateBaseCandidate || (rec.ambushEventCount | 0) < PIRATE_BASE_CANDIDATE_EVENTS) return;
    const candidate = pirateBaseCandidateFromRecord(rec, this.state, now);
    rec.pirateBaseCandidate = candidate;
    emit(this.bus, 'pirateRumor:baseCandidate', clonePlain(candidate));
    emit(this.bus, 'poi:candidate', clonePlain(candidate));
  },

  _emitRouteFeedbackNews(rec, reason, now) {
    if (Number.isFinite(rec.lastRouteFeedbackNewsAt) &&
        (now - rec.lastRouteFeedbackNewsAt) < ROUTE_FEEDBACK_NEWS_COOLDOWN_S) return;
    const variants = ROUTE_FEEDBACK_HEADLINES[reason] || ROUTE_FEEDBACK_HEADLINES.ignored;
    const seed = this.state && this.state.meta && this.state.meta.seed || 0;
    const template = pickVariant(variants, seed, `${rec.sectorId}:${rec.zoneId}:${reason}:${rec.routeShiftCount | 0}`) || variants[0];
    const headline = template.replace('{zone}', rec.zoneName || rec.zoneId || 'the lane');
    rec.lastRouteFeedbackNewsAt = now;
    rec.routeShiftCount = (rec.routeShiftCount | 0) + 1;
    emit(this.bus, 'news:headline', {
      headline,
      text: headline,
      kind: 'route-feedback',
      sectorId: rec.sectorId,
      zoneId: rec.zoneId,
      zoneName: rec.zoneName,
      reason,
      feedback: routeDangerFeedbackFromRecord(rec, now),
    });
  },

  _applyPendingFeedback(state) {
    const dir = state && state.encounterDirector;
    if (!dir || !Array.isArray(dir.pending) || !dir.pending.length) return;
    const own = ensureRumorState(state);
    const signature = `${dir.plannedKey || 'unkeyed'}:${routeFeedbackSignature(state)}`;
    if (!signature || own.lastRouteFeedbackPlanKey === signature) return;
    const adjusted = routeAdjustedEncounterPlan(state, dir.pending);
    if (!samePlanShape(dir.pending, adjusted)) dir.pending = adjusted;
    own.lastRouteFeedbackPlanKey = signature;
  },
};

export function rumorKey(sectorId, zoneId) {
  return `${sectorId || 'unknown'}:${zoneId || 'unknown'}`;
}

export function rumorReadoutForZone(state, sectorId, zoneId) {
  const own = state && state.pirateRumor;
  const rec = own && own.zones && own.zones[rumorKey(sectorId, zoneId)];
  if (!rec) return null;
  return {
    sectorId: rec.sectorId,
    zoneId: rec.zoneId,
    zoneName: rec.zoneName,
    heat: round(rec.heat || 0),
    headline: rec.lastHeadline || headlineFor(rec, state),
    eventCount: rec.eventCount | 0,
    lossCount: rec.lossCount | 0,
  };
}

export function routeDangerFeedbackForZone(state, sectorId, zoneId) {
  const own = state && state.pirateRumor;
  const rec = own && own.zones && own.zones[rumorKey(sectorId, zoneId)];
  return routeDangerFeedbackFromRecord(rec, state && state.simTime || 0);
}

export function routeAdjustedEncounterPlan(state, plan) {
  if (!Array.isArray(plan) || !plan.length) return Array.isArray(plan) ? plan.slice() : [];
  let out = plan.map(clonePlain);
  for (const rec of activeRouteRecords(state)) {
    const feedback = routeDangerFeedbackFromRecord(rec, state && state.simTime || 0);
    if (!feedback.active) continue;
    out = out.map((item) => item && item.zoneId === rec.zoneId
      ? { ...item, routeDangerFeedback: feedback }
      : item);
    if (feedback.danger < 0) {
      const idx = out.findIndex((item) => item && item.zoneId === rec.zoneId && isPiratePlanItem(item));
      if (idx >= 0) out.splice(idx, 1);
    } else if (feedback.danger > 0 && !out.some((item) => item && item.zoneId === rec.zoneId && item.routeDangerAdded)) {
      const src = out.find((item) => item && item.zoneId === rec.zoneId && isPiratePlanItem(item));
      if (src) {
        out.push({
          ...clonePlain(src),
          encounterId: `${src.encounterId || src.shapeId || src.kind || 'pirate'}:route-danger`,
          dueAt: Number.isFinite(src.dueAt) ? src.dueAt + 45 : src.dueAt,
          routeDangerAdded: true,
          routeDangerFeedback: feedback,
        });
      }
    }
  }
  return out.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
}

export function routeAdjustedTrafficMix(state, sectorId, zoneId, roleWeights) {
  const out = { ...(roleWeights || {}) };
  const feedback = routeDangerFeedbackForZone(state, sectorId, zoneId);
  if (!feedback.active) return out;
  if (Number.isFinite(out.hauler)) out.hauler = roundWeight(out.hauler * feedback.convoyWeightMult);
  if (Number.isFinite(out.escort)) out.escort = roundWeight(out.escort * feedback.convoyWeightMult);
  if (Number.isFinite(out.pirate)) out.pirate = roundWeight(out.pirate * feedback.ambushWeightMult);
  return out;
}

export function pirateBaseCandidateForZone(state, sectorId, zoneId) {
  const own = state && state.pirateRumor;
  const rec = own && own.zones && own.zones[rumorKey(sectorId, zoneId)];
  return rec && rec.pirateBaseCandidate ? clonePlain(rec.pirateBaseCandidate) : null;
}

export function pirateBaseCandidates(state, sectorId = null) {
  const own = state && state.pirateRumor;
  if (!own || !own.zones) return [];
  const out = [];
  for (const rec of Object.values(own.zones)) {
    if (!rec || !rec.pirateBaseCandidate) continue;
    if (sectorId && rec.sectorId !== sectorId) continue;
    out.push(clonePlain(rec.pirateBaseCandidate));
  }
  return out.sort((a, b) => String(a.candidateId).localeCompare(String(b.candidateId)));
}

function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    zones: {},
    lastRouteFeedbackPlanKey: null,
    counterIntelReceipts: [],
    counterIntelProfileZones: {},
  };
}

function ensureRumorState(state) {
  if (!state.pirateRumor || typeof state.pirateRumor !== 'object') state.pirateRumor = freshState();
  if (!state.pirateRumor.zones || typeof state.pirateRumor.zones !== 'object') state.pirateRumor.zones = {};
  if (!Array.isArray(state.pirateRumor.counterIntelReceipts)) state.pirateRumor.counterIntelReceipts = [];
  if (!state.pirateRumor.counterIntelProfileZones || typeof state.pirateRumor.counterIntelProfileZones !== 'object') {
    state.pirateRumor.counterIntelProfileZones = {};
  }
  state.pirateRumor.schemaVersion = SCHEMA_VERSION;
  return state.pirateRumor;
}

function zoneRecordFor(state, sectorId, zone) {
  const own = ensureRumorState(state);
  const key = rumorKey(sectorId, zone.id);
  return own.zones[key] || (own.zones[key] = freshZoneRecord(sectorId, zone));
}

function freshZoneRecord(sectorId, zone) {
  return {
    sectorId,
    zoneId: zone.id,
    zoneName: zone.name || zone.id,
    zoneType: zone.type || null,
    heat: 0,
    eventCount: 0,
    lossCount: 0,
    lastEventAt: 0,
    lastHeadlineAt: null,
    lastHeadline: null,
    routeDanger: 0,
    routeConvoy: 0,
    routeFeedbackUntil: 0,
    lastRouteFeedbackNewsAt: null,
    ambushEventCount: 0,
    ambushEventIds: [],
    ambushEventKinds: [],
    pirateBaseCandidate: null,
  };
}

function rememberAmbushVector(rec, kind, eventId, now) {
  rec.ambushEventCount = (rec.ambushEventCount | 0) + 1;
  if (!Array.isArray(rec.ambushEventIds)) rec.ambushEventIds = [];
  if (!Array.isArray(rec.ambushEventKinds)) rec.ambushEventKinds = [];
  rec.ambushEventIds.push(String(eventId || `${kind}:${rec.ambushEventCount}`));
  rec.ambushEventKinds.push(kind || 'unknown');
  if (rec.ambushEventIds.length > 12) rec.ambushEventIds.splice(0, rec.ambushEventIds.length - 12);
  if (rec.ambushEventKinds.length > 12) rec.ambushEventKinds.splice(0, rec.ambushEventKinds.length - 12);
  if (!Number.isFinite(rec.firstAmbushAt)) rec.firstAmbushAt = now;
  rec.lastAmbushAt = now;
}

function pirateBaseCandidateFromRecord(rec, state, now) {
  const seed = hash32(state && state.meta && state.meta.seed, rec.sectorId, rec.zoneId, 'pirateBaseCandidate');
  return {
    candidateId: `pirateBase:${rec.sectorId}:${rec.zoneId}`,
    poiType: 'pirate_base_candidate',
    source: 'pirateRumor',
    sectorId: rec.sectorId,
    zoneId: rec.zoneId,
    zoneName: rec.zoneName,
    zoneType: rec.zoneType || null,
    seed,
    posHint: null,
    createdAt: now,
    provenance: {
      source: 'actual_ambush_events',
      eventCount: rec.ambushEventCount | 0,
      eventIds: (rec.ambushEventIds || []).slice(),
      eventKinds: (rec.ambushEventKinds || []).slice(),
      firstEventAt: Number.isFinite(rec.firstAmbushAt) ? rec.firstAmbushAt : now,
      lastEventAt: Number.isFinite(rec.lastAmbushAt) ? rec.lastAmbushAt : now,
    },
    payoff: {
      salvage: true,
      bounty: true,
      ownerFactionId: 'faction_reach',
    },
  };
}

function routeDangerFeedbackFromRecord(rec, now) {
  if (!rec || !Number.isFinite(rec.routeFeedbackUntil) || rec.routeFeedbackUntil <= now) {
    return {
      active: false,
      danger: 0,
      ambushWeightMult: 1,
      convoyWeightMult: 1,
      until: 0,
    };
  }
  const danger = clamp(rec.routeDanger || 0, ROUTE_DANGER_MIN, ROUTE_DANGER_MAX);
  const convoy = clamp(rec.routeConvoy || 0, -ROUTE_DANGER_MAX, ROUTE_DANGER_MAX);
  return {
    active: Math.abs(danger) > 0.001 || Math.abs(convoy) > 0.001,
    sectorId: rec.sectorId,
    zoneId: rec.zoneId,
    zoneName: rec.zoneName,
    danger: round(danger),
    ambushWeightMult: round(clamp(1 + danger, 0.4, 1.8)),
    convoyWeightMult: round(clamp(1 + convoy, 0.5, 1.8)),
    until: rec.routeFeedbackUntil,
    reason: rec.lastRouteFeedbackReason || null,
  };
}

function activeRouteRecords(state) {
  const own = state && state.pirateRumor;
  if (!own || !own.zones) return [];
  const now = state && state.simTime || 0;
  return Object.values(own.zones).filter((rec) => routeDangerFeedbackFromRecord(rec, now).active);
}

function decayRouteFeedback(rec, now) {
  if (!rec || !Number.isFinite(rec.routeFeedbackUntil) || rec.routeFeedbackUntil > now) return;
  rec.routeDanger = 0;
  rec.routeConvoy = 0;
}

function routeFeedbackSignature(state) {
  return activeRouteRecords(state)
    .map((rec) => {
      const fb = routeDangerFeedbackFromRecord(rec, state && state.simTime || 0);
      return `${rec.sectorId}:${rec.zoneId}:${fb.danger}:${fb.convoyWeightMult}:${fb.until}`;
    })
    .sort()
    .join('|');
}

function isPiratePlanItem(item) {
  const kind = item && (item.shapeId || item.kind || item.shape);
  return PIRATE_ENCOUNTER_KINDS.has(kind);
}

function samePlanShape(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] && a[i].encounterId) !== (b[i] && b[i].encounterId)) return false;
    if ((a[i] && a[i].routeDangerAdded) !== (b[i] && b[i].routeDangerAdded)) return false;
  }
  return true;
}

function zoneById(sectorId, zoneId) {
  if (!sectorId || !zoneId) return null;
  return zonesForSector(sectorId).find((zone) => zone.id === zoneId) || null;
}

function counterIntelZoneFor(state, sectorId, profileId, milestone) {
  const candidates = zonesForSector(sectorId)
    .filter((zone) => PIRATE_CAPABLE_ZONE_TYPES.has(zone.type))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!candidates.length) return null;

  const own = ensureRumorState(state);
  const prior = own.counterIntelProfileZones[profileId];
  if (prior && prior.sectorId === sectorId) {
    const remembered = candidates.find((zone) => zone.id === prior.zoneId);
    if (remembered) return remembered;
  }

  const hottest = candidates
    .map((zone) => ({ zone, rec: own.zones[rumorKey(sectorId, zone.id)] }))
    .filter(({ rec }) => Number(rec && rec.heat) > 0)
    .sort((a, b) => (b.rec.heat - a.rec.heat) || String(a.zone.id).localeCompare(String(b.zone.id)))[0];
  if (hottest) return hottest.zone;

  const seed = state && state.meta && state.meta.seed || 0;
  const idx = hash32(seed, profileId, milestone, 'counterIntelZone') % candidates.length;
  return candidates[idx];
}

function pruneCounterIntelProfileZones(own) {
  const retained = new Set((own.counterIntelReceipts || []).map((receipt) => {
    const split = String(receipt).lastIndexOf(':');
    return split > 0 ? String(receipt).slice(0, split) : String(receipt);
  }));
  for (const profileId of Object.keys(own.counterIntelProfileZones || {})) {
    if (!retained.has(profileId)) delete own.counterIntelProfileZones[profileId];
  }
}

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || null;
}

function isCivilianTraffic(entity) {
  if (!entity || (entity.type !== 'ship' && entity.type !== 'drone')) return false;
  const data = entity.data || {};
  const role = data.trafficRole;
  if (CIVILIAN_TRAFFIC_ROLES.has(role)) return true;
  const ai = data.ai || {};
  const words = `${ai.archetype || ''} ${ai.doctrine || ''} ${ai.spawnContext || ''}`.toLowerCase();
  if (words.includes('pirate') || words.includes('raider') || words.includes('ambush')) return false;
  return entity.team === 2 && ai.passive === true;
}

function hottestRumor(state) {
  const own = state && state.pirateRumor;
  if (!own || !own.zones) return null;
  let best = null;
  for (const [key, rec] of Object.entries(own.zones)) {
    if (!best || (rec.heat || 0) > best.heat || ((rec.heat || 0) === best.heat && key < best.key)) {
      best = { key, rec, heat: rec.heat || 0 };
    }
  }
  return best;
}

function headlineFor(rec, state) {
  const seed = state && state.meta && state.meta.seed || 0;
  const key = rumorKey(rec.sectorId, rec.zoneId) + ':' + (rec.headlineCount | 0);
  const template = pickVariant(HEADLINES, seed, key) || HEADLINES[0];
  return template
    .replace('{count}', String(Math.max(rec.eventCount | 0, rec.lossCount | 0, 1)))
    .replace('{zone}', rec.zoneName || rec.zoneId || 'the lane');
}

function rememberCard(state, card) {
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  if (!state.ui.pirateRumor || typeof state.ui.pirateRumor !== 'object') {
    state.ui.pirateRumor = { cards: [], lastCard: null };
  }
  const model = state.ui.pirateRumor;
  if (!Array.isArray(model.cards)) model.cards = [];
  model.lastCard = card;
  model.cards.unshift(card);
  if (model.cards.length > 6) model.cards.length = 6;
}

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

function round(n) {
  return Number((Number(n) || 0).toFixed(3));
}

function roundWeight(n) {
  return Number((Number(n) || 0).toFixed(2));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export default pirateRumor;
