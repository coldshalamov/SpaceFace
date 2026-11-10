// Pure scalar→record embodiment projection for offscreen sectorSim (M2-C3).
//
// sectorSim owns the scalar field (danger / pricePressure / influence). This module never
// creates live entities, never writes credits/cargo/rep/hull, and is not a second world
// authority. It only projects deterministic *intent recipes* that world C2 may later consume
// into durable world.records / traffic density / rematerialize hints.
//
// Determinism:
//   - No Math.random, no Date/wall-clock, no DOM.
//   - Same (seed, sectorId, field node, quantized epoch) → identical ordered intents.
//   - Sector order is seeded stable sort over authored ids (caller supplies ordered sector ids).
//
// Identity compatibility with durable records (src/world/worldRecords.js):
//   proposedRecordId uses the same formula as stableRecordId(seed, sectorId, kind, key)
//   so a later rematerialize pass can stamp data.worldRecordId without re-keying.

import { hash32 } from '../../core/rng.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../../data/sectorActivityPockets.js';

export const EMBODIMENT_SCHEMA_ID = 'spaceface.sectorEmbodimentIntent.v1';
export const EMBODIMENT_SCHEMA_VERSION = 1;

/** Quantize field epoch so re-projection within a market cadence is identity-stable. */
export const EMBODIMENT_EPOCH_QUANTUM_DAYS = 0.25;

/** Max convoy/npc recipe slots emitted per sector per epoch (cap unbounded growth). */
export const MAX_EMBODIMENT_SLOTS_PER_SECTOR = 6;

/** Intent recipe kinds (not live entity types). */
export const EMBODIMENT_KIND = Object.freeze({
  TRAFFIC_DENSITY: 'traffic_density',
  DANGER_PRESENCE: 'danger_presence',
  MARKET_PRESSURE: 'market_pressure',
  CONVOY_ITINERARY: 'convoy_itinerary',
  PATROL_PRESENCE: 'patrol_presence',
  RAID_PRESENCE: 'raid_presence',
  INTEL_SIGNAL: 'intel_signal',
});

/** Maps recipe kinds → durable record kinds world C2 already understands. */
export const EMBODIMENT_TO_RECORD_KIND = Object.freeze({
  [EMBODIMENT_KIND.CONVOY_ITINERARY]: 'convoy',
  [EMBODIMENT_KIND.PATROL_PRESENCE]: 'npc',
  [EMBODIMENT_KIND.RAID_PRESENCE]: 'npc',
  [EMBODIMENT_KIND.DANGER_PRESENCE]: 'npc',
  [EMBODIMENT_KIND.TRAFFIC_DENSITY]: null, // density multiplier only; no record body
  [EMBODIMENT_KIND.MARKET_PRESSURE]: null, // economy intent already separate
  [EMBODIMENT_KIND.INTEL_SIGNAL]: null,
});

/**
 * Sectors with a frozen authored-activity contract own their local actor cast. Offscreen scalar
 * truth still projects normally, but stochastic body recipes must not compete with that cast.
 */
export const AUTHORED_ACTIVITY_EMBODIMENT_SECTOR_IDS = Object.freeze([
  CERES_ACTIVITY_SECTOR_ID,
]);

const AUTHORED_ACTIVITY_EMBODIMENT_SECTORS = new Set(AUTHORED_ACTIVITY_EMBODIMENT_SECTOR_IDS);
const STOCHASTIC_EMBODIMENT_RECORD_KINDS = new Set([
  EMBODIMENT_KIND.CONVOY_ITINERARY,
  EMBODIMENT_KIND.PATROL_PRESENCE,
  EMBODIMENT_KIND.RAID_PRESENCE,
]);

export function shouldSuppressStochasticEmbodimentIntent(sectorId, kind) {
  return AUTHORED_ACTIVITY_EMBODIMENT_SECTORS.has(sectorId)
    && STOCHASTIC_EMBODIMENT_RECORD_KINDS.has(kind);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Same identity contract as worldRecords.stableRecordId — kept local so sectorSim can
 * depend on this pure module without importing world ownership paths.
 */
export function proposedRecordId(seed, sectorId, recordKind, key) {
  const h = hash32(seed >>> 0 || 1, 'wr', String(sectorId || ''), String(recordKind || ''), String(key || ''));
  return `wr_${recordKind || 'npc'}_${(h >>> 0).toString(16)}`;
}

/** Stable intent id for idempotent emit (includes epoch quantum + kind + slot). */
export function stableIntentId(seed, sectorId, kind, epochKey, slotKey) {
  const h = hash32(
    seed >>> 0 || 1,
    'emb',
    String(sectorId || ''),
    String(kind || ''),
    String(epochKey | 0),
    String(slotKey || '0'),
  );
  return `ei_${kind || 'x'}_${(h >>> 0).toString(16)}`;
}

export function quantizeEpochDays(epochDays, quantum = EMBODIMENT_EPOCH_QUANTUM_DAYS) {
  const e = Number(epochDays) || 0;
  const q = quantum > 0 ? quantum : EMBODIMENT_EPOCH_QUANTUM_DAYS;
  return Math.floor(e / q + 1e-9);
}

/**
 * Project one sector field node into ordered embodiment intents.
 * Pure: does not mutate inputs.
 *
 * @param {object} opts
 * @param {string} opts.sectorId
 * @param {object} [opts.sector] authored sector (stations, tier, industries…)
 * @param {object} opts.node field node { danger, pricePressure, influence, dominantFactionId, … }
 * @param {number|string} [opts.seed]
 * @param {number} [opts.epochDays]
 * @param {number} [opts.baseDanger] static dangerIndex for delta terms
 * @returns {object[]} intents sorted by intentId
 */
export function projectSectorEmbodiment(opts = {}) {
  const sectorId = opts.sectorId;
  if (!sectorId || !opts.node) return [];

  const seed = (opts.seed >>> 0) || 1;
  const epochDays = Number(opts.epochDays) || 0;
  const epochKey = quantizeEpochDays(epochDays);
  const node = opts.node;
  const sector = opts.sector || null;
  const baseDanger = Number.isFinite(opts.baseDanger) ? opts.baseDanger : 0.35;

  const danger = clamp(Number(node.danger) || 0, 0, 1);
  const pricePressure = clamp(Number(node.pricePressure) || 0, -1, 1);
  const influence = node.influence && typeof node.influence === 'object' ? node.influence : {};
  const dominantFactionId = node.dominantFactionId
    || rankFirst(influence)
    || (sector && sector.factionId)
    || null;
  const contestMargin = Number.isFinite(node.contestMargin) ? node.contestMargin : 0.5;
  const scn = Number(influence.faction_scn) || 0;
  const reach = Number(influence.faction_reach) || 0;
  const mts = Number(influence.faction_mts) || 0;

  const dangerDelta = danger - baseDanger;
  const densityMultiplier = clamp(1 + dangerDelta * 1.35 + Math.max(0, pricePressure) * 0.25, 0.35, 2.75);
  const encounterLoad = clamp(0.65 + 1.35 * danger, 0.2, 2.5);
  const trafficCountHint = clamp(
    Math.round((2 + (sector && sector.stations ? sector.stations.length : 1) * 0.75) * densityMultiplier),
    0,
    12,
  );
  const roleMixBias = buildRoleMixBias({ danger, pricePressure, scn, reach, sector });
  const suppressStochasticRecords = AUTHORED_ACTIVITY_EMBODIMENT_SECTORS.has(sectorId);

  const intents = [];

  // Always: sector-level density + danger + market scalars (no durable body required).
  intents.push(makeIntent({
    seed, sectorId, kind: EMBODIMENT_KIND.TRAFFIC_DENSITY, epochKey, epochDays, slotKey: 'core',
    proposedRecordKind: null,
    payload: {
      densityMultiplier: round6(densityMultiplier),
      trafficCountHint,
      roleMixBias,
      dominantFactionId,
    },
  }));

  intents.push(makeIntent({
    seed, sectorId, kind: EMBODIMENT_KIND.DANGER_PRESENCE, epochKey, epochDays, slotKey: 'core',
    proposedRecordKind: 'npc',
    identityKey: `danger:${epochKey}`,
    payload: {
      danger: round6(danger),
      encounterLoad: round6(encounterLoad),
      enemyDensityHint: round6(clamp((sector && sector.enemyDensity || 0) + dangerDelta * 0.82, 0, 0.8)),
      securityHint: null,
      dominantFactionId,
      contestMargin: round6(contestMargin),
    },
  }));

  intents.push(makeIntent({
    seed, sectorId, kind: EMBODIMENT_KIND.MARKET_PRESSURE, epochKey, epochDays, slotKey: 'core',
    proposedRecordKind: null,
    payload: {
      pricePressure: round6(pricePressure),
      lanePressure: round6(clamp(pricePressure + dangerDelta * 0.18 + (danger - 0.45) * 0.035, -1, 1)),
      stationIds: stationIdsOf(sector),
      marketFlowUnitsPerDay: -Math.round(pricePressure * 72),
    },
  }));

  // Convoy recipes when trade conductivity / price shock is meaningful.
  const convoySlots = Math.min(
    MAX_EMBODIMENT_SLOTS_PER_SECTOR,
    suppressStochasticRecords
      ? 0
      : Math.max(0, Math.floor(Math.abs(pricePressure) * 4 + mts * 2 + (Math.abs(dangerDelta) > 0.08 ? 1 : 0))),
  );
  for (let i = 0; i < convoySlots; i++) {
    const identityKey = `convoy:${epochKey}:${i}`;
    intents.push(makeIntent({
      seed, sectorId, kind: EMBODIMENT_KIND.CONVOY_ITINERARY, epochKey, epochDays, slotKey: String(i),
      proposedRecordKind: 'convoy',
      identityKey,
      payload: {
        slot: i,
        role: pricePressure > 0.08 ? 'relief_hauler' : pricePressure < -0.08 ? 'export_hauler' : 'lane_hauler',
        densityWeight: round6(0.55 + Math.abs(pricePressure) * 0.9),
        homeSectorId: sectorId,
        preferredFactionId: dominantFactionId,
        scarcity: pricePressure > 0,
      },
    }));
  }

  // Patrol presence when Concord (or secure baseline) projects order.
  const patrolSlots = Math.min(
    MAX_EMBODIMENT_SLOTS_PER_SECTOR,
    suppressStochasticRecords
      ? 0
      : Math.max(0, Math.floor(scn * 3 + (danger < 0.35 ? 1 : 0) - (reach > 0.35 ? 1 : 0))),
  );
  for (let i = 0; i < patrolSlots; i++) {
    const identityKey = `patrol:${epochKey}:${i}`;
    intents.push(makeIntent({
      seed, sectorId, kind: EMBODIMENT_KIND.PATROL_PRESENCE, epochKey, epochDays, slotKey: String(i),
      proposedRecordKind: 'npc',
      identityKey,
      payload: {
        slot: i,
        role: 'patrol',
        factionId: 'faction_scn',
        lawful: true,
        threat: round6(clamp(0.15 + danger * 0.2, 0, 1)),
      },
    }));
  }

  // Raid presence when Reach / high danger.
  const raidSlots = Math.min(
    MAX_EMBODIMENT_SLOTS_PER_SECTOR,
    suppressStochasticRecords
      ? 0
      : Math.max(0, Math.floor(reach * 3 + Math.max(0, danger - 0.45) * 4)),
  );
  for (let i = 0; i < raidSlots; i++) {
    const identityKey = `raid:${epochKey}:${i}`;
    intents.push(makeIntent({
      seed, sectorId, kind: EMBODIMENT_KIND.RAID_PRESENCE, epochKey, epochDays, slotKey: String(i),
      proposedRecordKind: 'npc',
      identityKey,
      payload: {
        slot: i,
        role: 'raider',
        factionId: 'faction_reach',
        lawful: false,
        threat: round6(clamp(0.35 + danger * 0.55, 0, 1)),
      },
    }));
  }

  // Intel signal when drivers / bands are interesting (threshold-ish, still pure).
  const intelSeverity = Math.floor(danger * 5) + Math.abs(Math.round(pricePressure * 5));
  if (intelSeverity >= 3 || contestMargin < 0.12) {
    intents.push(makeIntent({
      seed, sectorId, kind: EMBODIMENT_KIND.INTEL_SIGNAL, epochKey, epochDays, slotKey: 'core',
      proposedRecordKind: null,
      payload: {
        severity: intelSeverity,
        dangerBand: Math.floor(danger * 5),
        marketBand: pricePressure > 0.18 ? 1 : pricePressure < -0.18 ? -1 : 0,
        dominantFactionId,
        contestTight: contestMargin < 0.12,
      },
    }));
  }

  intents.sort((a, b) => a.intentId.localeCompare(b.intentId) || a.kind.localeCompare(b.kind));
  return intents;
}

/**
 * Project every sector in seeded-stable order.
 * @param {object} opts
 * @param {object} opts.field sector field { nodes, epochDays }
 * @param {string[]} opts.sectorIds ordered or unordered; will be sorted for stability
 * @param {Map|object} [opts.sectorsById]
 * @param {function} [opts.baseDangerFor] (sectorId) => number
 * @param {number|string} [opts.seed]
 * @returns {{ epochDays: number, epochKey: number, bySector: object, intents: object[], digest: number }}
 */
export function projectFieldEmbodiment(opts = {}) {
  const field = opts.field;
  const nodes = field && field.nodes ? field.nodes : {};
  const epochDays = Number(field && field.epochDays) || 0;
  const epochKey = quantizeEpochDays(epochDays);
  const seed = (opts.seed >>> 0) || 1;
  const sectorIds = (Array.isArray(opts.sectorIds) ? opts.sectorIds.slice() : Object.keys(nodes))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const bySector = Object.create(null);
  const all = [];
  for (const sectorId of sectorIds) {
    const node = nodes[sectorId];
    if (!node) continue;
    const sector = lookupSector(opts.sectorsById, sectorId);
    const baseDanger = typeof opts.baseDangerFor === 'function'
      ? opts.baseDangerFor(sectorId)
      : (Number.isFinite(opts.baseDanger) ? opts.baseDanger : 0.35);
    const list = projectSectorEmbodiment({
      sectorId,
      sector,
      node,
      seed,
      epochDays,
      baseDanger,
    });
    bySector[sectorId] = list;
    for (const intent of list) all.push(intent);
  }
  all.sort((a, b) => a.intentId.localeCompare(b.intentId) || a.sectorId.localeCompare(b.sectorId));
  return {
    schemaId: EMBODIMENT_SCHEMA_ID,
    schemaVersion: EMBODIMENT_SCHEMA_VERSION,
    epochDays,
    epochKey,
    bySector,
    intents: all,
    digest: embodimentDigest(all),
  };
}

/**
 * Deterministic digest over an intent list (audit / replay equality).
 *
 * Payload-bound: every acceptance-relevant field and nested payload is included via
 * canonical stable serialization (object keys sorted recursively). Same semantic
 * intents with reordered object keys hash equal; different nested payload with the
 * same identity fields hash different. No wall-clock, no Math.random, no deps.
 *
 * Audit continuity: the full-field digest (all stable sectors) is the only value that
 * belongs in embodiment.lastDigest. Subset projections (e.g. continuous sector enter)
 * produce a separate digest and must never replace the full-field audit digest — use
 * {@link isFullFieldSectorList} + {@link nextEmbodimentAuditDigests}.
 */
export function embodimentDigest(intents) {
  const ordered = (Array.isArray(intents) ? intents.slice() : [])
    .sort((a, b) => String(a && a.intentId).localeCompare(String(b && b.intentId)));
  const parts = [];
  for (const it of ordered) {
    if (!it) continue;
    parts.push(stableSerialize(intentDigestView(it)));
  }
  return hash32(...parts) >>> 0;
}

/**
 * True when sectorIds covers the full authored field (same multiset as allSectorIds).
 * Order-independent. Empty/missing sectorIds is treated as "not full" so callers that
 * default to the full list must pass the resolved full ids explicitly.
 */
export function isFullFieldSectorList(sectorIds, allSectorIds) {
  const full = (Array.isArray(allSectorIds) ? allSectorIds : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  const got = (Array.isArray(sectorIds) ? sectorIds : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => a.localeCompare(b));
  if (!full.length || got.length !== full.length) return false;
  for (let i = 0; i < full.length; i++) {
    if (got[i] !== full[i]) return false;
  }
  return true;
}

/**
 * Pure audit-digest bag update.
 *
 * - lastDigest: last full-field canonical embodiment digest (audit continuity).
 * - lastSubsetDigest: last subset/partial projection digest (diagnostics only).
 *
 * Subset projections never overwrite lastDigest.
 *
 * @param {{ lastDigest?: number, lastSubsetDigest?: number }} prev
 * @param {number} projectedDigest
 * @param {{ fullField: boolean }} scope
 * @returns {{ lastDigest: number, lastSubsetDigest: number, fullField: boolean }}
 */
export function nextEmbodimentAuditDigests(prev, projectedDigest, scope = {}) {
  const fullField = !!(scope && scope.fullField);
  const digest = (Number(projectedDigest) >>> 0) || 0;
  const prevLast = prev && Number.isFinite(prev.lastDigest) ? (prev.lastDigest >>> 0) : 0;
  const prevSubset = prev && Number.isFinite(prev.lastSubsetDigest)
    ? (prev.lastSubsetDigest >>> 0)
    : 0;
  if (fullField) {
    return { lastDigest: digest, lastSubsetDigest: prevSubset, fullField: true };
  }
  return { lastDigest: prevLast, lastSubsetDigest: digest, fullField: false };
}

/**
 * Acceptance-relevant material for one intent. Fixed field set so ephemeral/extra
 * keys never poison the digest; nested payload is fully included.
 */
function intentDigestView(it) {
  return {
    epochDays: Number(it.epochDays) || 0,
    epochKey: it.epochKey | 0,
    identityKey: it.identityKey != null ? String(it.identityKey) : '',
    intentId: it.intentId != null ? String(it.intentId) : '',
    kind: it.kind != null ? String(it.kind) : '',
    payload: it.payload && typeof it.payload === 'object' ? it.payload : {},
    proposedRecordId: it.proposedRecordId != null ? String(it.proposedRecordId) : '',
    proposedRecordKind: it.proposedRecordKind != null ? String(it.proposedRecordKind) : '',
    schemaId: it.schemaId != null ? String(it.schemaId) : '',
    schemaVersion: Number(it.schemaVersion) || 0,
    sectorId: it.sectorId != null ? String(it.sectorId) : '',
    source: it.source != null ? String(it.source) : '',
  };
}

/**
 * Canonical stable serialization: object keys sorted lexicographically at every
 * nesting level; arrays keep element order; no JSON.stringify key-order dependence.
 * Pure — no Date, no Math.random.
 */
export function stableSerialize(value) {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) return String(value);
    // Normalize -0 so it never forks digests.
    const n = Object.is(value, -0) ? 0 : value;
    return String(n);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i) out += ',';
      out += stableSerialize(value[i]);
    }
    return out + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    let out = '{';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = value[k];
      if (v === undefined || typeof v === 'function') continue;
      if (out.length > 1) out += ',';
      out += JSON.stringify(k) + ':' + stableSerialize(v);
    }
    return out + '}';
  }
  return JSON.stringify(String(value));
}

/**
 * Filter intents not yet applied. Pure — does not mutate appliedSet.
 * @param {object[]} intents
 * @param {Set|object|string[]} applied
 * @returns {object[]}
 */
export function filterNewEmbodimentIntents(intents, applied) {
  const set = toIdSet(applied);
  const out = [];
  for (const it of (Array.isArray(intents) ? intents : [])) {
    if (!it || !it.intentId) continue;
    if (set.has(it.intentId)) continue;
    out.push(it);
  }
  return out;
}

/**
 * Merge newly applied ids into a plain array (capped) for serialization.
 * When epochKey changes, caller should pass empty previous.
 */
export function mergeAppliedIntentIds(previous, newIntents, cap = 4096) {
  const set = toIdSet(previous);
  for (const it of (Array.isArray(newIntents) ? newIntents : [])) {
    if (it && it.intentId) set.add(it.intentId);
  }
  const ids = Array.from(set).sort();
  if (ids.length > cap) return ids.slice(ids.length - cap);
  return ids;
}

// ── internals ──────────────────────────────────────────────────────────────────────────────

function makeIntent({
  seed, sectorId, kind, epochKey, epochDays, slotKey,
  proposedRecordKind, identityKey, payload,
}) {
  const intentId = stableIntentId(seed, sectorId, kind, epochKey, slotKey);
  const recordKind = proposedRecordKind || EMBODIMENT_TO_RECORD_KIND[kind] || null;
  const idKey = identityKey != null ? String(identityKey) : `${kind}:${slotKey}`;
  const proposedRecordId = recordKind
    ? proposedRecordIdFn(seed, sectorId, recordKind, idKey)
    : null;
  return {
    schemaId: EMBODIMENT_SCHEMA_ID,
    schemaVersion: EMBODIMENT_SCHEMA_VERSION,
    intentId,
    sectorId,
    kind,
    epochKey,
    epochDays: Number(epochDays) || 0,
    source: 'sector_field',
    // Durable-record identity proposal (world C2 may adopt verbatim).
    proposedRecordId,
    proposedRecordKind: recordKind,
    identityKey: idKey,
    payload: payload || {},
  };
}

// local alias to avoid shadowing in makeIntent
function proposedRecordIdFn(seed, sectorId, recordKind, key) {
  return proposedRecordId(seed, sectorId, recordKind, key);
}

function buildRoleMixBias({ danger, pricePressure, scn, reach, sector }) {
  const bias = {
    hauler: 1,
    miner: 1,
    courier: 1,
    escort: 1,
    patrol: 1,
    pirate: 1,
    smuggler: 1,
    rescue: 1,
  };
  if (sector && sector.industries && (sector.industries.mining || sector.industries.refinery)) {
    bias.miner *= 2.2;
    bias.hauler *= 1.4;
  }
  if (danger >= 0.55 || reach > 0.28) {
    bias.pirate *= 1 + danger * 2.5;
    bias.courier *= 0.55;
    bias.escort *= 1.6;
  }
  if (danger <= 0.35 || scn > 0.28) {
    bias.patrol *= 1.8 + scn * 1.5;
    bias.escort *= 1.4;
    bias.pirate *= Math.max(0, 1 - scn * 1.2);
  }
  if (Math.abs(pricePressure) > 0.12) {
    bias.hauler *= 1.35 + Math.abs(pricePressure);
    bias.smuggler *= pricePressure > 0 ? 1.4 : 1.1;
  }
  for (const k of Object.keys(bias)) bias[k] = round6(bias[k]);
  return bias;
}

function stationIdsOf(sector) {
  if (!sector || !Array.isArray(sector.stations)) return [];
  return sector.stations.map((s) => s && s.id).filter(Boolean).sort();
}

function lookupSector(map, id) {
  if (!map) return null;
  if (map instanceof Map) return map.get(id) || null;
  return map[id] || null;
}

function rankFirst(influence) {
  let bestId = null;
  let best = -1;
  for (const id of Object.keys(influence || {}).sort()) {
    const v = Number(influence[id]) || 0;
    if (v > best) { best = v; bestId = id; }
  }
  return bestId;
}

function toIdSet(applied) {
  if (!applied) return new Set();
  if (applied instanceof Set) return new Set(applied);
  if (Array.isArray(applied)) return new Set(applied.filter(Boolean));
  if (typeof applied === 'object') return new Set(Object.keys(applied).filter((k) => applied[k]));
  return new Set();
}

function round6(v) {
  return Math.round((Number(v) || 0) * 1e6) / 1e6;
}
