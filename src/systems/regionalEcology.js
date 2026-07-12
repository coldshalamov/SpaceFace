// Milestone 4 — deterministic regional ecology consequence layer.
//
// Owns only state.regionalEcology. Static identity comes from regionalEcology.js; durable deltas
// come from already-authored POI outcomes and causal-aftermath receipts. Consumers ask the pure
// helpers below for traffic/resource/law/encounter inputs. This system never spawns, damages,
// authorizes hostility, writes cargo/credits/reputation, or produces ambient alarms.

import {
  getRegionalEcologyProfile,
  REGIONAL_ECOLOGY_SCHEMA_VERSION,
} from '../data/regionalEcology.js';

const STATE_VERSION = 1;
const RECEIPT_CAP = 96;
const CAUSE_CAP = 48;

const OUTCOME_EFFECTS = Object.freeze({
  lawful_station_yard: Object.freeze({ traffic: 0.025, resource: 0, law: 0.025, danger: -0.010, price: -0.008 }),
  mining_field: Object.freeze({ traffic: 0.060, resource: -0.045, law: 0, danger: 0.005, price: -0.018 }),
  derelict_salvage: Object.freeze({ traffic: 0.015, resource: 0.010, law: 0.005, danger: -0.020, price: -0.010 }),
  anomaly_research: Object.freeze({ traffic: 0.030, resource: 0.015, law: 0, danger: -0.018, price: -0.006 }),
  convoy_industrial_route: Object.freeze({ traffic: 0.085, resource: 0.015, law: 0.010, danger: -0.022, price: -0.035 }),
  pirate_contested_nest: Object.freeze({ traffic: 0.055, resource: 0, law: 0.060, danger: -0.085, price: -0.018 }),
});

const COUNTER_SHAPE_BIAS = Object.freeze({
  extortion: Object.freeze({ patrol_beat: 1.45, patrol_scan: 1.25, convoy_departure: 1.20 }),
  predation: Object.freeze({ patrol_beat: 1.55, patrol_scan: 1.30, convoy_departure: 1.18 }),
  territorial_pressure: Object.freeze({ patrol_beat: 1.45, distress_call: 1.20 }),
  contract_collection: Object.freeze({ patrol_scan: 1.25, trader_run: 1.10 }),
  supply_delivery: Object.freeze({ convoy_departure: 1.45, trader_run: 1.25 }),
  commerce: Object.freeze({ trader_run: 1.45, convoy_departure: 1.25 }),
  distress_response: Object.freeze({ distress_call: 1.40, salvage_signal: 1.25 }),
  wreck_recovery: Object.freeze({ salvage_signal: 1.50, distress_call: 1.15 }),
  anomalous_signal: Object.freeze({ anomaly_whisper: 1.50, distress_call: 1.10 }),
  lawful_screening: Object.freeze({ patrol_scan: 1.30, patrol_beat: 1.20 }),
  route_security: Object.freeze({ patrol_beat: 1.35, convoy_departure: 1.15 }),
});

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function freshState() {
  return {
    schemaVersion: STATE_VERSION,
    activeSectorId: null,
    sectors: {},
    causes: {},
    settled: {},
    receipts: [],
  };
}

function freshSectorState() {
  return { trafficDelta: 0, resourceDelta: 0, lawDelta: 0, dangerDelta: 0, lastDay: 0 };
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureState(state) {
  if (!state.regionalEcology || typeof state.regionalEcology !== 'object' || Array.isArray(state.regionalEcology)) {
    state.regionalEcology = freshState();
  }
  const own = state.regionalEcology;
  own.schemaVersion = STATE_VERSION;
  own.sectors = plainObject(own.sectors);
  own.causes = plainObject(own.causes);
  own.settled = plainObject(own.settled);
  if (!Array.isArray(own.receipts)) own.receipts = [];
  return own;
}

function ensureSector(state, sectorId) {
  const own = ensureState(state);
  if (!own.sectors[sectorId] || typeof own.sectors[sectorId] !== 'object') own.sectors[sectorId] = freshSectorState();
  const row = own.sectors[sectorId];
  row.trafficDelta = clamp(Number(row.trafficDelta) || 0, -0.40, 0.40);
  row.resourceDelta = clamp(Number(row.resourceDelta) || 0, -0.25, 0.15);
  row.lawDelta = clamp(Number(row.lawDelta) || 0, -0.20, 0.20);
  row.dangerDelta = clamp(Number(row.dangerDelta) || 0, -0.25, 0.25);
  row.lastDay = Math.max(0, Number(row.lastDay) || 0);
  return row;
}

function sectorIdFor(state, sectorId) {
  return sectorId || state && state.regionalEcology && state.regionalEcology.activeSectorId
    || state && state.world && state.world.currentSectorId
    || null;
}

function openCausesFor(state, sectorId) {
  const own = ensureState(state);
  return Object.values(own.causes).filter((cause) => cause && cause.sectorId === sectorId && cause.status === 'open');
}

function counterBiasFor(state, sectorId) {
  const out = {};
  for (const cause of openCausesFor(state, sectorId)) {
    const bias = COUNTER_SHAPE_BIAS[cause.motiveId] || null;
    if (!bias) continue;
    for (const [shapeId, multiplier] of Object.entries(bias)) {
      out[shapeId] = Math.min(2.5, Math.max(out[shapeId] || 1, multiplier));
    }
  }
  return out;
}

/** Read-only, compact regional simulation inputs for gameplay consumers. */
export function regionalEcologyReadout(state, requestedSectorId = null) {
  const sectorId = sectorIdFor(state, requestedSectorId);
  const profile = getRegionalEcologyProfile(sectorId);
  if (!profile) return null;
  const row = ensureSector(state, sectorId);
  const causeBias = counterBiasFor(state, sectorId);
  return {
    schemaVersion: REGIONAL_ECOLOGY_SCHEMA_VERSION,
    sectorId,
    identityKey: profile.identityKey,
    familyId: profile.familyId,
    fingerprint: profile.fingerprint,
    traffic: {
      baselinePerMin: profile.traffic.baselinePerMin,
      densityMultiplier: clamp(profile.traffic.densityMultiplier + row.trafficDelta, 0.45, 1.55),
      roleBias: { ...profile.traffic.roleBias },
    },
    resource: {
      kind: profile.resource.kind,
      yieldMultiplier: clamp(profile.resource.yieldMultiplier + row.resourceDelta, 0.70, 1.40),
    },
    law: {
      baseline: profile.law.security,
      effective: clamp(profile.law.security + row.lawDelta, 0, 1),
    },
    danger: {
      baseline: profile.danger.baseline,
      effective: clamp(profile.danger.baseline + row.dangerDelta, 0, 1),
    },
    encounters: {
      shapeBias: { ...profile.encounters.shapeBias },
      counterShapeBias: causeBias,
      unresolvedCauses: openCausesFor(state, sectorId).length,
    },
  };
}

export function regionalResourceYieldMultiplier(state, sectorId) {
  const readout = regionalEcologyReadout(state, sectorId);
  return readout ? readout.resource.yieldMultiplier : 1;
}

export function effectiveRegionalSecurity(state, sectorId, fallback = 0.5) {
  const readout = regionalEcologyReadout(state, sectorId);
  return readout ? readout.law.effective : clamp(Number(fallback) || 0, 0, 1);
}

export function regionalTrafficDensityMultiplier(state, sectorId) {
  const readout = regionalEcologyReadout(state, sectorId);
  return readout ? readout.traffic.densityMultiplier : 1;
}

export function regionalTrafficRoleWeights(state, sectorId, baseWeights = {}) {
  const readout = regionalEcologyReadout(state, sectorId);
  if (!readout) return { ...baseWeights };
  const own = ensureSector(state, readout.sectorId);
  const flow = clamp(1 + own.trafficDelta, 0.60, 1.40);
  const causes = openCausesFor(state, readout.sectorId);
  const securityNeed = causes.some((cause) => cause.consequenceKind === 'security') ? 1.25 : 1;
  const out = {};
  for (const [role, weight] of Object.entries(baseWeights || {})) {
    let multiplier = Number(readout.traffic.roleBias[role]) || 1;
    if (['hauler', 'courier', 'miner'].includes(role)) multiplier *= flow;
    if (role === 'patrol' || role === 'escort') multiplier *= securityNeed;
    out[role] = Math.max(0, (Number(weight) || 0) * multiplier);
  }
  return out;
}

export function regionalEncounterWeight(state, sectorId, encounter) {
  const base = Math.max(0, Number(encounter && encounter.weight) || 1);
  // Isolated planner harnesses intentionally omit the regional system. Preserve their legacy
  // contract; normal registry order activates ecology before encounterDirector plans the sector.
  if (!state || !state.regionalEcology || state.regionalEcology.activeSectorId !== sectorId) return base;
  const readout = regionalEcologyReadout(state, sectorId);
  if (!readout || !encounter) return base;
  const shapeId = encounter.id || encounter.shapeId;
  const authored = Number(readout.encounters.shapeBias[shapeId]) || 1;
  const counter = Number(readout.encounters.counterShapeBias[shapeId]) || 1;
  return base * authored * counter;
}

export const regionalEcology = {
  name: 'regionalEcology',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    ensureState(this.state);
    this._listen('sector:enter', (payload) => this.activate(payload && payload.sectorId));
    this._listen('poi:behaviorOutcome', (payload) => this._onPoiOutcome(payload || {}));
    this._listen('aftermath:causeRecorded', (payload) => this._onCauseRecorded(payload || {}));
    this._listen('aftermath:remedied', (payload) => this._onCauseRemedied(payload || {}));
    this._listen('day:tick', () => this._decay());
  },

  _listen(event, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const unsub = this.bus.on(event, fn);
    if (typeof unsub === 'function') this._unsubs.push(unsub);
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  newGame() {
    this.state.regionalEcology = freshState();
  },

  // Event-driven. No per-frame work and no passive escalation.
  update() {},

  activate(sectorId) {
    if (!sectorId || !getRegionalEcologyProfile(sectorId)) return null;
    const own = ensureState(this.state);
    own.activeSectorId = sectorId;
    ensureSector(this.state, sectorId);
    const readout = regionalEcologyReadout(this.state, sectorId);
    this._emit('regionalEcology:applied', clonePlain(readout));
    return readout;
  },

  _onPoiOutcome(payload) {
    const fingerprint = payload.fingerprint;
    const sectorId = payload.sectorId || sectorIdFor(this.state, null);
    const effect = OUTCOME_EFFECTS[payload.familyId];
    if (!fingerprint || !sectorId || !effect || !getRegionalEcologyProfile(sectorId)) return false;
    const own = ensureState(this.state);
    if (own.settled[fingerprint]) return false;
    own.settled[fingerprint] = { sectorId, t: Number(this.state.simTime) || 0 };
    const row = ensureSector(this.state, sectorId);
    const disrupted = payload.outcome === 'route_disrupted' || payload.outcome === 'flagged';
    const sign = disrupted ? -1 : 1;
    row.trafficDelta = clamp(row.trafficDelta + effect.traffic * sign, -0.40, 0.40);
    row.resourceDelta = clamp(row.resourceDelta + effect.resource * sign, -0.25, 0.15);
    row.lawDelta = clamp(row.lawDelta + effect.law * (payload.outcome === 'flagged' ? 1 : sign), -0.20, 0.20);
    row.dangerDelta = clamp(row.dangerDelta + effect.danger * sign, -0.25, 0.25);
    row.lastDay = Math.floor((Number(this.state.simTime) || 0) / 600);
    const receipt = {
      fingerprint,
      behaviorId: payload.behaviorId || null,
      familyId: payload.familyId,
      sectorId,
      outcome: payload.outcome || null,
      t: Number(this.state.simTime) || 0,
    };
    own.receipts.push(receipt);
    if (own.receipts.length > RECEIPT_CAP) {
      const removed = own.receipts.splice(0, own.receipts.length - RECEIPT_CAP);
      for (const item of removed) delete own.settled[item.fingerprint];
    }
    this._emit('sectorsim:impulse', {
      kind: `regional_ecology:${payload.familyId}`,
      sectorId,
      danger: clamp(effect.danger * sign, -0.12, 0.12),
      pricePressure: clamp(effect.price * sign, -0.12, 0.12),
      fingerprint,
    });
    const readout = regionalEcologyReadout(this.state, sectorId);
    this._emit('regionalEcology:changed', { cause: receipt, readout: clonePlain(readout) });
    return true;
  },

  _onCauseRecorded(payload) {
    if (!payload.fingerprint || !payload.sectorId || payload.status !== 'open') return false;
    const own = ensureState(this.state);
    if (own.causes[payload.fingerprint]) return false;
    own.causes[payload.fingerprint] = {
      fingerprint: payload.fingerprint,
      sectorId: payload.sectorId,
      motiveId: payload.motiveId || 'unknown',
      consequenceKind: payload.consequenceKind || 'unknown',
      status: 'open',
      t: Number(this.state.simTime) || 0,
    };
    const causes = Object.values(own.causes).sort((a, b) => (a.t - b.t) || a.fingerprint.localeCompare(b.fingerprint));
    while (causes.length > CAUSE_CAP) {
      const oldest = causes.shift();
      delete own.causes[oldest.fingerprint];
    }
    if (own.activeSectorId === payload.sectorId) {
      this._emit('regionalEcology:changed', {
        cause: { fingerprint: payload.fingerprint, kind: 'aftermath_open' },
        readout: clonePlain(regionalEcologyReadout(this.state, payload.sectorId)),
      });
    }
    return true;
  },

  _onCauseRemedied(payload) {
    const own = ensureState(this.state);
    const cause = payload.fingerprint && own.causes[payload.fingerprint];
    if (!cause) return false;
    delete own.causes[payload.fingerprint];
    if (own.activeSectorId === cause.sectorId) {
      this._emit('regionalEcology:changed', {
        cause: { fingerprint: payload.fingerprint, kind: 'aftermath_remedied' },
        readout: clonePlain(regionalEcologyReadout(this.state, cause.sectorId)),
      });
    }
    return true;
  },

  _decay() {
    const own = ensureState(this.state);
    const day = Math.floor((Number(this.state.simTime) || 0) / 600);
    for (const [sectorId, row] of Object.entries(own.sectors)) {
      const elapsed = Math.max(0, day - (Number(row.lastDay) || 0));
      if (!elapsed) continue;
      const retain = Math.pow(0.88, Math.min(30, elapsed));
      row.trafficDelta *= retain;
      row.resourceDelta *= retain;
      row.lawDelta *= retain;
      row.dangerDelta *= retain;
      row.lastDay = day;
      if (own.activeSectorId === sectorId) {
        this._emit('regionalEcology:changed', {
          cause: { kind: 'day_decay', day },
          readout: clonePlain(regionalEcologyReadout(this.state, sectorId)),
        });
      }
    }
  },

  serialize() {
    const own = ensureState(this.state);
    return clonePlain({
      schemaVersion: STATE_VERSION,
      sectors: own.sectors,
      causes: own.causes,
      settled: own.settled,
      receipts: own.receipts.slice(-RECEIPT_CAP),
    });
  },

  deserialize(data) {
    const source = plainObject(data);
    this.state.regionalEcology = {
      ...freshState(),
      sectors: clonePlain(plainObject(source.sectors)),
      causes: clonePlain(plainObject(source.causes)),
      settled: clonePlain(plainObject(source.settled)),
      receipts: Array.isArray(source.receipts) ? clonePlain(source.receipts.slice(-RECEIPT_CAP)) : [],
    };
    ensureState(this.state);
  },

  destroy() {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
  },
};

export default regionalEcology;
