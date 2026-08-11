// Scanner pulse system (GDD 2.0 §7.4).
//
// Consumes the locked input edge `state.input.actions.scanPulse` and annotates live entities with
// plain data fields that UI/render layers can read. No wall-clock; durations are simTime-based.
// Ghost reveal uses entity-keyed deterministic streams (hash32), not ambient Math.random.
import { ASTEROIDS } from '../data/mining.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { maxFittedModuleMod } from '../core/fittedModules.js';
import { hash32 } from '../core/rng.js';
import { isPlayerWanted } from './heat.js';
import { combatFlag } from '../data/featureFlags.js';
import { weakPointForEntity } from '../data/weakPoints.js';
import { claimSensorPostActive } from '../data/claimableBodies.js';
import {
  isResonanceObeliskSignal,
  resonanceObeliskResponse,
} from '../data/resonanceObelisk.js';
import {
  CONTACT_HAIL_RANGE,
  CONTACT_HAIL_REQUEST_TTL_S,
  CONTACT_HAIL_ACTION_HEAVE_TO,
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
  pirateParleyDemandForHandoff,
} from '../data/contactHail.js';

export const SCANNER_CONTACT_RANGE = CONTACT_HAIL_RANGE;

const PULSE_COOLDOWN_S = 8;
const NEAR_SCAN_RADIUS = 1200;
const HIDDEN_POI_RADIUS = 2000;
// Existing authored sectors top out at 5,500 WU from center. Twelve thousand covers the full
// diameter from one navigable edge to the other without becoming an unbounded/global scan.
export const SENSOR_POST_POI_RANGE = 12000;
const ASTEROID_HIGHLIGHT_S = 20;
const PINGED_S = 45;
const SIGNAL_RECORD_CAP = 64;
const SIGNAL_RECEIPT_CAP = 32;
const SIGNAL_INVESTIGATE_RADIUS = 150;
const ANOMALY_TRIANGULATION_CAP = 16;
const ANOMALY_TRIANGULATION_REQUIRED = 3;
const ANOMALY_TRIANGULATION_MIN_BASELINE_WU = 350;
const ANOMALY_TRIANGULATION_MIN_BEARING_DEG = 8;
const CONTACT_HAIL_POLL_TICKS = 12; // 5 Hz at the fixed 60 Hz sim cadence.
const UNSAFE_PLAYER_SECURITY = 0.45;
const LANE_CONTEXT_INNER_R = 900;
const LANE_CONTEXT_OUTER_R = 2200;

// W05 sensor-ghost — sim-truth on entity.data. Scanner owns uncertainty; HUD/map read only.
export const GHOST_REVEAL_STAGE_MAX = 3;
export const GHOST_ESCAPE_RANGE = 2400;
export const GHOST_ESCAPE_HOLD_S = 18;
const GHOST_STAGE_CONFIDENCE = Object.freeze([0.12, 0.34, 0.58, 0.82]);
const PLAYER_DANGER_CONTEXTS = new Set([
  'interdiction', 'spawn_request', 'bounty_hunter', 'mission', 'encounter', 'tutorial_pirate',
  'zone_hostile', // WORLD_OVERHAUL_2_1: pirates/raiders camping a named ambush/outlaw zone
]);

export function scannerProfileForState(state) {
  const radiusMult = Math.max(
    1,
    maxFittedModuleMod(state, 'scannerRadiusMult', 1),
    maxFittedModuleMod(state, 'scanRangeMult', 1),
  );
  const pingPersistMult = Math.max(0.05, maxFittedModuleMod(state, 'pingPersistMult', 1));
  const hiddenPoiRadius = HIDDEN_POI_RADIUS * radiusMult;
  const sensorPostActive = claimSensorPostActive(state, state && state.world && state.world.currentSectorId);
  return {
    radiusMult,
    pingPersistMult,
    nearRadius: NEAR_SCAN_RADIUS * radiusMult,
    hiddenPoiRadius,
    poiRadius: sensorPostActive ? Math.max(hiddenPoiRadius, SENSOR_POST_POI_RANGE) : hiddenPoiRadius,
    sensorPostActive,
    pingPersistS: PINGED_S * pingPersistMult,
  };
}

/**
 * Mark a live ship as a sensor ghost (W05). Known contact is uncertain (isGhost, low confidence,
 * revealStage); the live entity still exists. Does not touch HUD/map — readers already honor
 * entity.data.isGhost | ghost | kind==='unknown'.
 */
export function markEntityGhost(entity, opts = {}) {
  if (!entity || !entity.alive) return null;
  const data = entity.data || (entity.data = {});
  const stage = Math.max(0, Math.min(GHOST_REVEAL_STAGE_MAX - 1, (opts.revealStage | 0) || 0));
  data.isGhost = true;
  data.ghost = true;
  if (!data.kind || data.kind === 'ship') data.kind = 'unknown';
  data.revealStage = stage;
  data.ghostConfidence = Number.isFinite(opts.ghostConfidence)
    ? clamp01(opts.ghostConfidence)
    : GHOST_STAGE_CONFIDENCE[stage];
  data.ghostSpawnedAt = Number.isFinite(opts.spawnedAt) ? opts.spawnedAt : null;
  data.ghostEscapeRange = Number.isFinite(opts.escapeRange) ? opts.escapeRange : GHOST_ESCAPE_RANGE;
  data.ghostEscapeHoldS = Number.isFinite(opts.escapeHoldS) ? opts.escapeHoldS : GHOST_ESCAPE_HOLD_S;
  data.ghostBeyondSince = null;
  data.ghostFullyRevealed = false;
  return data;
}

/** Deterministic unit draw for a ghost entity stream (keyed by entity id; never Math.random). */
export function ghostStreamUnit(state, entityId, salt = 'reveal') {
  const seed = (state && state.meta && state.meta.seed) || 1;
  // Independent stream per (seed, entityId, salt). Callers that need multi-draw should re-key salt.
  const h = hash32(seed, entityId, salt);
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Advance one reveal stage on a ghost contact. Full reveal clears isGhost and returns
 * { revealed: true }. Deterministic: stage thresholds use entity-keyed stream, not wall clock.
 */
export function advanceGhostReveal(entity, state, opts = {}) {
  if (!entity || !entity.alive) return { ok: false, reason: 'missing' };
  const data = entity.data || (entity.data = {});
  if (!data.isGhost && !data.ghost) return { ok: false, reason: 'not_ghost' };
  if (data.ghostFullyRevealed) return { ok: true, revealed: true, stage: GHOST_REVEAL_STAGE_MAX, confidence: 1 };

  const pulseIndex = Math.max(0, (opts.pulseIndex | 0) || (data.ghostPulseCount | 0));
  data.ghostPulseCount = pulseIndex + 1;
  // Entity stream decides whether this pulse advances (always advances for stage 0→1 at close range).
  const unit = ghostStreamUnit(state, entity.id, `pulse:${data.ghostPulseCount}`);
  const near = opts.near === true || (Number.isFinite(opts.distance) && opts.distance <= 600);
  const advance = near || unit < 0.72 + data.revealStage * 0.08;
  if (!advance) {
    return {
      ok: true,
      revealed: false,
      stage: data.revealStage | 0,
      confidence: data.ghostConfidence,
    };
  }

  const nextStage = Math.min(GHOST_REVEAL_STAGE_MAX, (data.revealStage | 0) + 1);
  data.revealStage = nextStage;
  data.ghostConfidence = GHOST_STAGE_CONFIDENCE[Math.min(nextStage, GHOST_STAGE_CONFIDENCE.length - 1)];

  if (nextStage >= GHOST_REVEAL_STAGE_MAX) {
    clearGhostFlags(data);
    data.ghostFullyRevealed = true;
    data.revealStage = GHOST_REVEAL_STAGE_MAX;
    data.ghostConfidence = 1;
    return { ok: true, revealed: true, stage: GHOST_REVEAL_STAGE_MAX, confidence: 1 };
  }
  return {
    ok: true,
    revealed: false,
    stage: data.revealStage,
    confidence: data.ghostConfidence,
  };
}

function clearGhostFlags(data) {
  data.isGhost = false;
  data.ghost = false;
  if (data.kind === 'unknown') data.kind = 'ship';
}

/**
 * Deception consequence: an unrevealed ghost that stays beyond escape range long enough
 * despawns (alive=false). Emits nothing itself — caller emits scanner:ghostEscaped.
 */
export function tickGhostEscape(entity, state, now = null) {
  if (!entity || !entity.alive) return { escaped: false };
  const data = entity.data;
  if (!data || (!data.isGhost && !data.ghost) || data.ghostFullyRevealed) return { escaped: false };
  const t = Number.isFinite(now) ? now : (state && state.simTime) || 0;
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player || !player.alive || !player.pos || !entity.pos) return { escaped: false };
  const dx = (entity.pos.x || 0) - (player.pos.x || 0);
  const dz = (entity.pos.z || 0) - (player.pos.z || 0);
  const d = Math.hypot(dx, dz);
  const escapeR = Number.isFinite(data.ghostEscapeRange) ? data.ghostEscapeRange : GHOST_ESCAPE_RANGE;
  const holdS = Number.isFinite(data.ghostEscapeHoldS) ? data.ghostEscapeHoldS : GHOST_ESCAPE_HOLD_S;
  if (d <= escapeR) {
    data.ghostBeyondSince = null;
    return { escaped: false, distance: d };
  }
  if (data.ghostBeyondSince == null) data.ghostBeyondSince = t;
  if (t - data.ghostBeyondSince < holdS) return { escaped: false, distance: d, holdS: t - data.ghostBeyondSince };
  entity.alive = false;
  data.ghostEscaped = true;
  return { escaped: true, distance: d, reason: 'beyond_escape_range' };
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const ASTEROID_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const ORE_GLYPH_BY_TAG = Object.freeze({
  common: 'Si',
  metal: 'Fe',
  ice: 'H2O',
  gas: 'Gas',
  crystal: 'Cr',
  exotic: 'Xe',
  rare: 'Xe',
});

function pos2(pos) {
  return { x: Number(pos && pos.x) || 0, z: Number(pos && pos.z) || 0 };
}

function bearingDeg(from, to) {
  const dx = (Number(to && to.x) || 0) - (Number(from && from.x) || 0);
  const dz = (Number(to && to.z) || 0) - (Number(from && from.z) || 0);
  return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
}

function bearingDeltaDeg(a, b) {
  const raw = Math.abs((Number(a) || 0) - (Number(b) || 0)) % 360;
  return Math.min(raw, 360 - raw);
}

/**
 * Add one player-earned bearing to an anomaly fix. The target position is read only to calculate
 * the bearing; it is not retained until the required distinct samples have been earned.
 */
export function recordAnomalyBearing(previous, origin, targetPos, options = {}, now = 0) {
  const requiredPings = Math.max(2, Math.min(6,
    Math.trunc(Number(options.requiredPings) || ANOMALY_TRIANGULATION_REQUIRED)));
  const minBaselineWu = Math.max(50,
    Number(options.minBaselineWu) || ANOMALY_TRIANGULATION_MIN_BASELINE_WU);
  const minBearingDeltaDeg = Math.max(1,
    Number(options.minBearingDeltaDeg) || ANOMALY_TRIANGULATION_MIN_BEARING_DEG);
  const samples = (previous && Array.isArray(previous.samples) ? previous.samples : [])
    .slice(0, requiredPings).map((sample) => ({ ...sample, origin: pos2(sample.origin) }));
  const from = pos2(origin);
  const target = pos2(targetPos);
  const nextBearingDeg = bearingDeg(from, target);
  const last = samples[samples.length - 1] || null;
  const baselineWu = last ? dist(from, last.origin) : Infinity;
  const angleDeltaDeg = last ? bearingDeltaDeg(nextBearingDeg, last.bearingDeg) : Infinity;

  let accepted = true;
  let reason = null;
  if (last && baselineWu < minBaselineWu) {
    accepted = false;
    reason = 'baseline_short';
  } else if (last && angleDeltaDeg < minBearingDeltaDeg) {
    accepted = false;
    reason = 'bearing_too_similar';
  }
  if (accepted && samples.length < requiredPings) {
    samples.push({
      origin: from,
      bearingDeg: Number(nextBearingDeg.toFixed(3)),
      sampledAt: Number(now) || 0,
    });
  }
  const revealed = samples.length >= requiredPings;
  const record = {
    schemaVersion: 1,
    sectorId: options.sectorId || previous && previous.sectorId || null,
    poiId: options.poiId || previous && previous.poiId || null,
    requiredPings,
    minBaselineWu,
    minBearingDeltaDeg,
    samples,
    revealed,
    fixedPos: revealed ? target : null,
    revealedAt: revealed ? Number(now) || 0 : null,
  };
  return {
    record,
    accepted,
    reason,
    revealed,
    sampleCount: samples.length,
    requiredPings,
    bearingDeg: Number(nextBearingDeg.toFixed(3)),
    baselineWu: Number.isFinite(baselineWu) ? Number(baselineWu.toFixed(3)) : null,
    angleDeltaDeg: Number.isFinite(angleDeltaDeg) ? Number(angleDeltaDeg.toFixed(3)) : null,
  };
}

function dist(posA, posB) {
  return Math.hypot((posA.x || 0) - (posB.x || 0), (posA.z || 0) - (posB.z || 0));
}

function oreGlyphForAsteroid(entity) {
  const typeId = entity && entity.data && entity.data.typeId;
  const def = ASTEROID_BY_ID.get(typeId);
  const table = def && def.oreTable;
  let bestOre = null;
  let bestWeight = -1;
  if (table) {
    for (const oreId in table) {
      if (table[oreId] > bestWeight) {
        bestOre = oreId;
        bestWeight = table[oreId];
      }
    }
  }
  if (bestOre) {
    if (bestOre.includes('ice')) return 'H2O';
    if (bestOre.includes('gas')) return 'Gas';
    if (bestOre.includes('crystal')) return 'Cr';
    if (bestOre.includes('exotic')) return 'Xe';
    if (bestOre.includes('ore')) return 'Fe';
  }
  const tags = def && def.oreTable ? Object.keys(def.oreTable).join(' ') : String(typeId || '');
  for (const tag in ORE_GLYPH_BY_TAG) if (tags.includes(tag)) return ORE_GLYPH_BY_TAG[tag];
  return 'Ore';
}

function isWreckLike(entity) {
  const data = entity && entity.data || {};
  return entity && (
    entity.type === 'wreck' ||
    data.poiType === 'wreck' ||
    data.kind === 'wreck' ||
    data.kind === 'derelict' ||
    data.salvage === true
  );
}

// Weak-point callout resolved on a wreck scan. Deterministic from the entity id so a re-scan (or a
// second look at the same derelict this session) names the same subsystem — no per-frame flicker.
const WEAK_POINTS = ['REACTOR CORE', 'FUEL CELLS', 'MAGAZINE', 'SHIELD NODE', 'CARGO SEAL', 'DRIVE COIL'];
function weakPointFor(entity) {
  const id = entity && entity.id != null ? String(entity.id) : '0';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return WEAK_POINTS[h % WEAK_POINTS.length];
}

// Turn a wreck's salvage contents into a compact manifest [{ id, qty }] the contacts strip resolves
// from the "??? UNSCANNED" ghost once a scan pulse lands. Reads salvagePool (id→units) + any loot.
function buildWreckManifest(entity) {
  const out = [];
  const pool = entity && entity.data && entity.data.salvagePool;
  if (pool && typeof pool === 'object') {
    for (const id in pool) {
      const qty = Math.round(Number(pool[id]) || 0);
      if (qty > 0) out.push({ id, qty });
    }
  }
  const loot = entity && entity.data && entity.data.loot;
  if (Array.isArray(loot)) {
    for (const item of loot) {
      if (!item) continue;
      const id = item.commodityId || item.id;
      const qty = Math.round(Number(item.amount != null ? item.amount : item.qty) || 0);
      if (id && qty > 0) out.push({ id, qty });
    }
  }
  return out;
}

function isCargoLike(entity) {
  const data = entity && entity.data || {};
  return entity && (
    entity.type === 'cargo' ||
    entity.type === 'pickup' ||
    data.kind === 'cargo' ||
    data.commodityId
  );
}

function isAnomalyLike(entity) {
  const data = entity && entity.data || {};
  return entity && (entity.type === 'anomaly' || data.poiType === 'anomaly');
}

function ensurePingBucket(state, sectorId) {
  if (!state.world.scanPings || typeof state.world.scanPings !== 'object') state.world.scanPings = {};
  const list = state.world.scanPings[sectorId];
  if (Array.isArray(list)) return list;
  state.world.scanPings[sectorId] = [];
  return state.world.scanPings[sectorId];
}

function upsertUnknownPing(state, sectorId, ping) {
  const list = ensurePingBucket(state, sectorId);
  const existing = list.find((item) => item && item.id === ping.id);
  if (existing) {
    existing.pos = pos2(ping.pos);
    existing.kind = 'unknown';
    return false;
  }
  list.push({ id: ping.id, pos: pos2(ping.pos), kind: 'unknown' });
  return true;
}

export function signalStrengthFor(distance, range) {
  const r = Math.max(1, Number(range) || 1);
  return Math.max(0, Math.min(1, 1 - Math.max(0, Number(distance) || 0) / r));
}

export function signalClassificationStage(scanCount, distance) {
  const scans = Math.max(1, Math.floor(Number(scanCount) || 1));
  const d = Math.max(0, Number(distance) || 0);
  if (scans >= 3 || d <= 300) return 3;
  if (scans >= 2 || d <= 650) return 2;
  return 1;
}

export function signalClassLabel(kind, stage = 1) {
  const s = Math.max(1, Math.min(3, stage | 0));
  if (kind === 'archive') return s >= 3 ? 'ARCHIVE TELEMETRY' : s >= 2 ? 'ARCHIVE SIGNAL' : 'RECORDED CARRIER';
  if (kind === 'distress') return s >= 3 ? 'DISTRESS COMMUNICATOR' : s >= 2 ? 'DISTRESS SIGNAL' : 'MODULATED SIGNAL';
  if (kind === 'salvage') return s >= 3 ? 'DERELICT SALVAGE' : s >= 2 ? 'SALVAGE SIGNATURE' : 'METALLIC RETURN';
  if (kind === 'anomaly') return s >= 3 ? 'ANOMALOUS PHENOMENON' : s >= 2 ? 'ANOMALY SIGNATURE' : 'ENERGY RETURN';
  if (kind === 'ore') return s >= 3 ? 'ORE CONCENTRATION' : s >= 2 ? 'ORE SIGNATURE' : 'MINERAL RETURN';
  if (kind === 'ambush') return s >= 3 ? 'MULTIPLE DRIVE ECHOES' : s >= 2 ? 'UNCERTAIN TRAFFIC' : 'SHIP SIGNATURE';
  return s >= 3 ? 'VESSEL SIGNATURE' : s >= 2 ? 'SHIP SIGNATURE' : 'DRIVE RETURN';
}

function signalDetail(kind, stage) {
  if (kind === 'archive') return stage >= 3
    ? 'Historical telemetry isolated. Track the source or inspect its discovery plate.'
    : 'Recorded carrier unresolved. Close range or pulse again.';
  if (kind === 'ambush') return stage >= 3
    ? 'Several drives, intent unresolved. Track or hold clear.'
    : 'Traffic pattern unresolved. Close range or pulse again.';
  if (stage <= 1) return 'Source unresolved. Close range or pulse again.';
  if (stage === 2) return 'Probable class. Track the return or pulse again.';
  return 'Investigation fix stable. Track to inspect at close range.';
}

function anomalyTriangulationDetail(result, config) {
  const baseline = Math.round(Number(config && config.minBaselineWu) || ANOMALY_TRIANGULATION_MIN_BASELINE_WU);
  const bearingDelta = Math.round(Number(config && config.minBearingDeltaDeg) || ANOMALY_TRIANGULATION_MIN_BEARING_DEG);
  if (result.reason === 'baseline_short') {
    return `Baseline too short (${Math.round(result.baselineWu || 0)} WU). Move at least ${baseline} WU laterally, then pulse again.`;
  }
  if (result.reason === 'bearing_too_similar') {
    return `Bearing unchanged. Move laterally until the return shifts by at least ${bearingDelta}°, then pulse again.`;
  }
  return `Bearing ${result.sampleCount}/${result.requiredPings} logged. Move laterally, then pulse again for a distinct fix.`;
}

function freshSignalState() {
  return { schemaVersion: 2, records: {}, completed: {}, receipts: [], triangulations: {}, trackedId: null };
}

function ensureSignalState(state) {
  if (!state.signalInvestigation || typeof state.signalInvestigation !== 'object') state.signalInvestigation = freshSignalState();
  const own = state.signalInvestigation;
  own.schemaVersion = 2;
  if (!own.records || typeof own.records !== 'object' || Array.isArray(own.records)) own.records = {};
  if (!own.completed || typeof own.completed !== 'object' || Array.isArray(own.completed)) own.completed = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!own.triangulations || typeof own.triangulations !== 'object' || Array.isArray(own.triangulations)) own.triangulations = {};
  return own;
}

const SIGNAL_KIND_PRIORITY = Object.freeze({
  distress: 100,
  anomaly: 90,
  archive: 85,
  salvage: 80,
  ambush: 70,
  ship: 60,
  ore: 40,
});

function signalKindForEntity(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  const explicitKind = String(data.scannerSignalKind || '').trim().toLowerCase();
  if (Object.hasOwn(SIGNAL_KIND_PRIORITY, explicitKind)) return explicitKind;
  const label = String(data.scanLabel || data.label || data.name || '').toLowerCase();
  if (isAnomalyLike(entity)) return 'anomaly';
  if (isWreckLike(entity)) {
    if (data.isCommunicator || data.parentType === 'communicator' || label.includes('distress')) return 'distress';
    return 'salvage';
  }
  if (entity.type === 'asteroid') return 'ore';
  if (entity.type === 'ship' || entity.type === 'drone') return 'ship';
  return null;
}

function signalKindForPoi(poi) {
  const type = String(poi && (poi.type || poi.poiType || poi.kind) || '').toLowerCase();
  const label = String(poi && (poi.name || poi.label || poi.poiId) || '').toLowerCase();
  if (type.includes('anomal')) return 'anomaly';
  if (type.includes('distress') || type.includes('beacon') || label.includes('distress')) return 'distress';
  if (type.includes('wreck') || type.includes('derelict') || type.includes('cache') || type.includes('salvage')) return 'salvage';
  return null;
}

function signalKindForLivingPoi(row) {
  if (!row) return null;
  if (row.familyId === 'anomaly_research') return 'anomaly';
  if (row.familyId === 'derelict_salvage') return 'salvage';
  if (row.familyId === 'mining_field') return 'ore';
  if (row.familyId === 'pirate_contested_nest') return 'ambush';
  if (row.familyId === 'convoy_industrial_route') return 'ship';
  return null;
}

function collectSignalCandidates(state, sectorId, origin, nearby = [], profile = scannerProfileForState(state)) {
  const byId = new Map();
  const add = (candidate) => {
    if (!candidate || !candidate.id || !candidate.pos || !candidate.kind) return;
    const distance = dist(origin, candidate.pos);
    const range = Math.max(1, Number(candidate.range) || NEAR_SCAN_RADIUS);
    if (distance > range) return;
    const row = { ...candidate, distance, range, pos: pos2(candidate.pos) };
    const previous = byId.get(row.id);
    if (!previous || row.distance < previous.distance) byId.set(row.id, row);
  };

  for (const entity of nearby || []) {
    if (!entity || !entity.alive || entity.id === state.playerId || !entity.pos) continue;
    if (entity.data && entity.data.requiresTriangulation) continue;
    const kind = signalKindForEntity(entity);
    if (!kind) continue;
    add({
      id: `signal:entity:${entity.id}`,
      kind,
      sourceId: entity.id,
      entityId: entity.id,
      pos: entity.pos,
      range: profile.nearRadius,
      repeatableScannerSignal: entity.data && entity.data.repeatableScannerSignal === true,
    });
  }

  const active = state.world && state.world.activeSector;
  for (const poi of active && active.pois || []) {
    if (!poi || !(poi.hidden || String(poi.type || '').toLowerCase() === 'anomaly')) continue;
    const kind = signalKindForPoi(poi);
    if (!kind) continue;
    const entity = state.entities && state.entities.get && state.entities.get(poi.id);
    const pos = entity && entity.pos || poi.pos;
    if (!pos) continue;
    const sourceId = poi.poiId || poi.id;
    const entityData = entity && entity.data || {};
    add({
      id: `signal:poi:${sourceId}`,
      kind,
      sourceId,
      entityId: entity && entity.id || null,
      pos,
      range: profile.poiRadius || profile.hiddenPoiRadius,
      requiresTriangulation: poi.requiresTriangulation === true || entityData.requiresTriangulation === true,
      triangulated: poi.anomalyTriangulated === true || entityData.anomalyTriangulated === true,
      triangulation: poi.triangulation || entityData.triangulation || null,
      resonanceScanResponse: entityData.resonanceScanResponse === true,
      repeatableScannerSignal: entityData.repeatableScannerSignal === true,
    });
  }

  const living = state.livingPoiBehaviors && state.livingPoiBehaviors.activeByZone;
  for (const row of Object.values(living || {})) {
    if (!row || row.sectorId !== sectorId || row.status === 'resolved' || row.status === 'aftermath') continue;
    const kind = signalKindForLivingPoi(row);
    if (!kind || !row.zoneCenter) continue;
    add({
      id: `signal:living:${row.behaviorId}`,
      kind,
      sourceId: row.behaviorId,
      entityId: null,
      pos: row.zoneCenter,
      range: profile.hiddenPoiRadius,
    });
  }

  // Ambush tells deliberately remain an uncertain traffic class at every stage. The scanner does
  // not consult hostility, encounter labels, or faction intent here: investigation earns warning,
  // never omniscient red paint.
  const tells = state.ambushSignatures && state.ambushSignatures.tells;
  for (const tell of Object.values(tells || {})) {
    if (!tell || tell.active === false || tell.sectorId !== sectorId || !tell.pos) continue;
    add({
      id: `signal:${tell.id}`,
      kind: 'ambush',
      sourceId: tell.id,
      entityId: null,
      pos: tell.pos,
      range: profile.hiddenPoiRadius,
    });
  }

  return [...byId.values()].sort(compareSignalRows);
}

function compareSignalRows(a, b) {
  const priority = (SIGNAL_KIND_PRIORITY[b && (b.sourceKind || b.kind)] || 0)
    - (SIGNAL_KIND_PRIORITY[a && (a.sourceKind || a.kind)] || 0);
  if (priority) return priority;
  const distance = (Number(a && a.distance) || 0) - (Number(b && b.distance) || 0);
  if (distance) return distance;
  return String(a && a.id || '').localeCompare(String(b && b.id || ''));
}

function pruneSignalRecords(own) {
  const ids = Object.keys(own.records || {});
  if (ids.length <= SIGNAL_RECORD_CAP) return;
  ids.sort((a, b) => {
    const aProtected = a === own.trackedId || !!own.completed[a];
    const bProtected = b === own.trackedId || !!own.completed[b];
    if (aProtected !== bProtected) return aProtected ? 1 : -1;
    const time = (Number(own.records[a] && own.records[a].lastScanAt) || 0)
      - (Number(own.records[b] && own.records[b].lastScanAt) || 0);
    return time || a.localeCompare(b);
  });
  for (const id of ids.slice(0, Math.max(0, ids.length - SIGNAL_RECORD_CAP))) {
    if (id !== own.trackedId && !own.completed[id]) delete own.records[id];
  }
}

function cloneSignalRecord(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    ...record,
    pos: pos2(record.pos),
    triangulation: record.triangulation && typeof record.triangulation === 'object'
      ? { ...record.triangulation }
      : null,
  };
}

function cloneSignalReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return { ...receipt, pos: pos2(receipt.pos) };
}

function cloneTriangulationRecord(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    schemaVersion: 1,
    sectorId: record.sectorId || null,
    poiId: record.poiId || null,
    requiredPings: Math.max(2, Math.min(6, Math.trunc(Number(record.requiredPings) || ANOMALY_TRIANGULATION_REQUIRED))),
    minBaselineWu: Math.max(50, Number(record.minBaselineWu) || ANOMALY_TRIANGULATION_MIN_BASELINE_WU),
    minBearingDeltaDeg: Math.max(1, Number(record.minBearingDeltaDeg) || ANOMALY_TRIANGULATION_MIN_BEARING_DEG),
    samples: (Array.isArray(record.samples) ? record.samples : []).slice(0, 6).map((sample) => ({
      origin: pos2(sample && sample.origin),
      bearingDeg: Number(sample && sample.bearingDeg) || 0,
      sampledAt: Number(sample && sample.sampledAt) || 0,
    })),
    revealed: record.revealed === true,
    fixedPos: record.revealed && record.fixedPos ? pos2(record.fixedPos) : null,
    revealedAt: record.revealed ? Number(record.revealedAt) || 0 : null,
  };
}

function cloneSignalState(own) {
  const records = {};
  const completed = {};
  const triangulations = {};
  for (const [id, row] of Object.entries(own.records || {})) {
    const clone = cloneSignalRecord(row);
    if (clone) records[id] = clone;
  }
  for (const [id, receipt] of Object.entries(own.completed || {})) {
    const clone = cloneSignalReceipt(receipt);
    if (clone) completed[id] = clone;
  }
  for (const [id, row] of Object.entries(own.triangulations || {})) {
    const clone = cloneTriangulationRecord(row);
    if (clone) triangulations[id] = clone;
  }
  return {
    schemaVersion: 2,
    records,
    completed,
    receipts: (own.receipts || []).map(cloneSignalReceipt).filter(Boolean).slice(-SIGNAL_RECEIPT_CAP),
    triangulations,
    trackedId: own.trackedId && records[own.trackedId] && !completed[own.trackedId] ? own.trackedId : null,
  };
}

function normalizeSignalState(data) {
  const source = data && typeof data === 'object' ? data : freshSignalState();
  const normalized = freshSignalState();
  for (const [id, row] of Object.entries(source.records || {})) {
    if (!id || !row || typeof row !== 'object') continue;
    normalized.records[id] = cloneSignalRecord({ ...row, id });
  }
  for (const [id, receipt] of Object.entries(source.completed || {})) {
    if (!id || !receipt || typeof receipt !== 'object') continue;
    normalized.completed[id] = cloneSignalReceipt({ ...receipt, signalId: receipt.signalId || id });
  }
  for (const [id, row] of Object.entries(source.triangulations || {})) {
    if (!id || !row || typeof row !== 'object') continue;
    const clone = cloneTriangulationRecord(row);
    if (clone) normalized.triangulations[id] = clone;
  }
  const triangulationIds = Object.keys(normalized.triangulations);
  if (triangulationIds.length > ANOMALY_TRIANGULATION_CAP) {
    triangulationIds.sort((a, b) => {
      const ar = normalized.triangulations[a];
      const br = normalized.triangulations[b];
      return (Number(ar.revealedAt) || Number(ar.samples.at(-1)?.sampledAt) || 0)
        - (Number(br.revealedAt) || Number(br.samples.at(-1)?.sampledAt) || 0)
        || a.localeCompare(b);
    });
    for (const id of triangulationIds.slice(0, triangulationIds.length - ANOMALY_TRIANGULATION_CAP)) {
      delete normalized.triangulations[id];
    }
  }
  normalized.receipts = (Array.isArray(source.receipts) ? source.receipts : [])
    .map(cloneSignalReceipt).filter(Boolean).slice(-SIGNAL_RECEIPT_CAP);
  normalized.trackedId = source.trackedId && normalized.records[source.trackedId]
    && !normalized.completed[source.trackedId] ? source.trackedId : null;
  pruneSignalRecords(normalized);
  return normalized;
}

export const scanner = {
  name: 'scanner',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || null;
    this.registry = ctx.registry || null;
    this._scratch = [];
    this._cooldownUntil = 0;
    ensureSignalState(this.state);
    this._contactHail = null;
    this._contactHailAvailability = null;
    this._contactHailAvailabilitySignature = '';
    this._contactHailNextPollTick = 0;
    this._contactHailLastTargetId = undefined;
    this._contactHailHeaveTo = null;
    this._onSignalTrack = (payload) => this._trackSignal(payload || {});
    this._onContactHailRequest = (payload) => this._requestContactHail(payload || {});
    this._onContactHailChoice = (payload) => this._chooseContactHail(payload || {});
    this._onContactHailReset = () => this._resetContactHail('lifecycle');
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('signal:track', this._onSignalTrack);
      this.bus.on('contactHail:request', this._onContactHailRequest);
      this.bus.on('contactHail:choice', this._onContactHailChoice);
      this.bus.on('game:new', this._onContactHailReset);
      this.bus.on('game:load', this._onContactHailReset);
      this.bus.on('dock:docked', this._onContactHailReset);
      this.bus.on('mode:changed', this._onContactHailReset);
    }
  },

  newGame() {
    this._resetContactHail('new_game');
    if (this.state) this.state.signalInvestigation = freshSignalState();
  },

  update(_dt, state) {
    this._updateContactHail(state);
    if (state.mode !== 'flight') return;
    this._updateTrackedSignal(state);
    this._tickGhostContacts(state);
    const actions = state.input && state.input.actions;
    if (!actions?.scanPulse) return;
    actions.scanPulse = false;

    const now = state.simTime || 0;
    if (now < this._cooldownUntil) return;

    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.alive) return;

    this._cooldownUntil = now + PULSE_COOLDOWN_S;
    this._pulse(state, player, now);
  },

  /** Escape / decay for unrevealed ghosts (deception consequence). */
  _tickGhostContacts(state) {
    const list = state.entityList || [];
    const now = state.simTime || 0;
    for (const entity of list) {
      if (!entity || !entity.alive || !entity.data) continue;
      if (!entity.data.isGhost && !entity.data.ghost) continue;
      const result = tickGhostEscape(entity, state, now);
      if (result.escaped) {
        this.bus.emit('scanner:ghostEscaped', {
          entityId: entity.id,
          reason: result.reason || 'beyond_escape_range',
          distance: result.distance,
          simTime: now,
        });
      }
    }
  },

  _pulse(state, player, now) {
    const sectorId = state.world && state.world.currentSectorId || null;
    const origin = pos2(player.pos);
    const profile = scannerProfileForState(state);
    const found = { asteroids: 0, wrecks: 0, anomalies: 0 };
    const candidates = queryNearbyEntities(state, origin, profile.nearRadius, this._scratch, state.entityList);

    this.bus.emit('scan:pulse', { pos: origin });

    for (const entity of candidates) {
      if (!entity || !entity.alive || entity.id === player.id || !entity.pos) continue;
      const distance = dist(origin, entity.pos);
      if (distance > profile.nearRadius) continue;
      const data = entity.data || (entity.data = {});
      if (entity.type === 'asteroid') {
        data.scanHighlightUntil = now + ASTEROID_HIGHLIGHT_S;
        data.scanOreGlyph = oreGlyphForAsteroid(entity);
        found.asteroids++;
      } else if (isWreckLike(entity)) {
        data.pingedUntil = now + profile.pingPersistS;
        // Scan-resolve the derelict: the strip's "??? UNSCANNED" ghost fills in with a manifest +
        // a weak-point callout (GDD 2.0 §7.4 "scanning resolves the outline into a manifest").
        data.scanned = true;
        data.manifest = buildWreckManifest(entity);
        if (!data.weakPoint) data.weakPoint = weakPointFor(entity);
        found.wrecks++;
      } else if (isCargoLike(entity)) {
        data.pingedUntil = now + profile.pingPersistS;
      } else if (isAnomalyLike(entity)) {
        if (data.requiresTriangulation && !data.anomalyTriangulated) continue;
        data.pingedUntil = now + profile.pingPersistS;
        found.anomalies++;
      } else if ((entity.type === 'ship' || entity.type === 'drone') && (data.isGhost || data.ghost)) {
        // W05: scan pulses advance ghost reveal stages (sim-truth on entity.data).
        const result = advanceGhostReveal(entity, state, { distance, near: distance <= 600 });
        data.pingedUntil = now + profile.pingPersistS;
        if (result.revealed) {
          this.bus.emit('scanner:ghostRevealed', {
            entityId: entity.id,
            stage: result.stage,
            confidence: result.confidence,
            simTime: now,
          });
        }
      }
    }

    // Weak-point reveal (BP-02): a pulse exposes the soft spot on nearby LARGE hostiles so the HUD can
    // guide the player to flank it. Flag-gated (`combat.weakPoints`, OFF in the golden) and reveal-only
    // — the arc itself is deterministic data (weakPoints.js); nothing is written onto the sim entity.
    if (combatFlag('weakPoints')) {
      const playerTeam = player.team;
      for (const entity of candidates) {
        if (!entity || !entity.alive || entity.id === player.id || !entity.pos) continue;
        if (entity.type !== 'ship' && entity.type !== 'drone') continue;
        if (dist(origin, entity.pos) > profile.nearRadius) continue;
        if (!isHostileToPlayer(entity, playerTeam, state)) continue;
        const wp = weakPointForEntity(entity);
        if (wp) this.bus.emit('scan:weakPoint', {
          entityId: entity.id,
          label: wp.label,
          hint: wp.hint,
          until: now + profile.pingPersistS,
        });
      }
    }

    if (sectorId) this._pingHiddenPois(state, sectorId, origin, profile.poiRadius);
    const signals = this._scanSignals(state, sectorId, origin, now, candidates, profile);
    this.bus.emit('scan:completed', { targetId: null, sectorId, found, signalCount: signals.length });
    if (signals.length) this.bus.emit('signal:scanResults', {
      sectorId,
      scannedAt: now,
      primary: { ...signals[0], pos: { ...signals[0].pos } },
      signals: signals.map((row) => ({ ...row, pos: { ...row.pos } })),
      total: signals.length,
    });
  },

  _pingHiddenPois(state, sectorId, origin, scanRadius = HIDDEN_POI_RADIUS) {
    const active = state.world && state.world.activeSector;
    for (const poi of active && active.pois || []) {
      if (!poi || !(poi.hidden || poi.type === 'anomaly')) continue;
      const entity = state.entities && state.entities.get && state.entities.get(poi.id);
      if (entity && entity.data && entity.data.requiresTriangulation && !entity.data.anomalyTriangulated) continue;
      const pos = entity && entity.pos || poi.pos;
      if (!pos || dist(origin, pos) > scanRadius) continue;
      upsertUnknownPing(state, sectorId, {
        id: poi.poiId || `poi_${poi.id}`,
        pos,
        kind: 'unknown',
      });
    }
  },

  _scanSignals(state, sectorId, origin, now, candidates, profile = scannerProfileForState(state)) {
    const own = ensureSignalState(state);
    const raw = collectSignalCandidates(state, sectorId, origin, candidates, profile);
    const rows = [];
    for (const candidate of raw) {
      const resonanceSignal = candidate.resonanceScanResponse === true
        && isResonanceObeliskSignal(sectorId, candidate.sourceId);
      const repeatableSignal = resonanceSignal || candidate.repeatableScannerSignal === true;
      if (own.completed[candidate.id] && !repeatableSignal) continue;
      const previous = own.records[candidate.id] || null;
      if (candidate.kind === 'anomaly' && candidate.requiresTriangulation && !candidate.triangulated) {
        const config = candidate.triangulation && typeof candidate.triangulation === 'object'
          ? candidate.triangulation
          : {};
        const previousTriangulation = own.triangulations[candidate.sourceId] || null;
        const result = recordAnomalyBearing(previousTriangulation, origin, candidate.pos, {
          ...config,
          sectorId,
          poiId: candidate.sourceId,
        }, now);
        own.triangulations[candidate.sourceId] = result.record;
        this.bus.emit('anomaly:bearing', {
          sectorId,
          poiId: candidate.sourceId,
          accepted: result.accepted,
          reason: result.reason,
          sampleCount: result.sampleCount,
          requiredPings: result.requiredPings,
          bearingDeg: result.bearingDeg,
          baselineWu: result.baselineWu,
          angleDeltaDeg: result.angleDeltaDeg,
        });
        if (result.revealed) {
          candidate.triangulated = true;
          const entity = candidate.entityId && state.entities && state.entities.get && state.entities.get(candidate.entityId);
          if (entity && entity.data) entity.data.anomalyTriangulated = true;
          const activePoi = state.world && state.world.activeSector && (state.world.activeSector.pois || [])
            .find((poi) => poi && (poi.poiId === candidate.sourceId || poi.id === candidate.entityId));
          if (activePoi) activePoi.anomalyTriangulated = true;
          this.bus.emit('anomaly:triangulated', {
            sectorId,
            poiId: candidate.sourceId,
            entityId: candidate.entityId,
            pos: pos2(candidate.pos),
            sampleCount: result.sampleCount,
            completedAt: now,
          });
        } else {
          const scanCount = result.sampleCount;
          const record = {
            id: candidate.id,
            sectorId,
            sourceKind: candidate.kind,
            sourceId: candidate.sourceId || null,
            entityId: candidate.entityId || null,
            // Before the fix, this is the pilot's sample origin—not the hidden target position.
            pos: pos2(origin),
            classification: 'ANOMALY BEARING',
            detail: anomalyTriangulationDetail(result, result.record),
            stage: Math.max(1, Math.min(2, scanCount)),
            confidence: Number(Math.min(0.72, 0.18 + scanCount * 0.18).toFixed(3)),
            strength: Number(signalStrengthFor(candidate.distance, candidate.range).toFixed(3)),
            distance: 0,
            range: candidate.range,
            scanCount,
            firstSeenAt: previous ? previous.firstSeenAt : now,
            lastScanAt: now,
            bestDistance: previous && Number.isFinite(Number(previous.bestDistance))
              ? Number(previous.bestDistance) : 0,
            status: 'triangulating',
            trackable: false,
            triangulation: {
              bearingDeg: result.bearingDeg,
              sampleCount: scanCount,
              requiredPings: result.requiredPings,
              accepted: result.accepted,
              reason: result.reason,
            },
          };
          own.records[record.id] = record;
          rows.push(record);
          continue;
        }
      }
      const scanCount = (previous && previous.scanCount || 0) + 1;
      const stage = signalClassificationStage(scanCount, candidate.distance);
      const strength = signalStrengthFor(candidate.distance, candidate.range);
      const confidence = Math.min(0.98, 0.24 + (stage - 1) * 0.27 + strength * 0.2);
      const record = {
        id: candidate.id,
        sectorId,
        sourceKind: candidate.kind,
        sourceId: candidate.sourceId || null,
        entityId: candidate.entityId || null,
        pos: pos2(candidate.pos),
        classification: signalClassLabel(candidate.kind, stage),
        detail: signalDetail(candidate.kind, stage),
        stage,
        confidence: Number(confidence.toFixed(3)),
        strength: Number(strength.toFixed(3)),
        distance: Math.round(candidate.distance),
        range: candidate.range,
        scanCount,
        firstSeenAt: previous ? previous.firstSeenAt : now,
        lastScanAt: now,
        bestDistance: Math.min(
          previous && Number.isFinite(Number(previous.bestDistance)) ? Number(previous.bestDistance) : Infinity,
          candidate.distance,
        ),
        status: previous && previous.status === 'tracked' ? 'tracked' : 'detected',
      };
      if (resonanceSignal) {
        const response = resonanceObeliskResponse(scanCount);
        record.classification = 'RESONANCE OBELISK';
        record.detail = `Pulse interval ${response.pulseIntervalS.toFixed(1)} s. ${scanCount} scan${scanCount === 1 ? '' : 's'} logged; Vael watch cadence target ${response.patrolIntervalS} s.`;
        record.resonance = response;
        if (own.completed[candidate.id]) {
          record.status = 'investigated';
          record.trackable = false;
        }
        const entity = candidate.entityId && state.entities && state.entities.get
          && state.entities.get(candidate.entityId);
        if (entity && entity.data) {
          entity.data.resonanceScanCount = scanCount;
          entity.data.resonancePulseIntervalS = response.pulseIntervalS;
        }
        this.bus.emit('resonance:scanCompleted', {
          sectorId,
          zoneId: 'zone_veil_anomaly',
          poiId: candidate.sourceId,
          entityId: candidate.entityId || null,
          ...response,
        });
      }
      if (own.completed[candidate.id]) {
        record.status = 'investigated';
        record.trackable = false;
      }
      own.records[record.id] = record;
      rows.push(record);
    }
    rows.sort(compareSignalRows);
    pruneSignalRecords(own);
    return rows.slice(0, 6);
  },

  _trackSignal(payload) {
    const state = this.state;
    const own = state && ensureSignalState(state);
    const id = String(payload.signalId || payload.id || '');
    const record = own && own.records[id];
    if (!record || own.completed[id] || record.trackable === false || !record.pos) return false;
    if (own.trackedId && own.records[own.trackedId]) own.records[own.trackedId].status = 'detected';
    own.trackedId = id;
    record.status = 'tracked';
    const course = {
      pos: { x: record.pos.x, z: record.pos.z },
      targetEntityId: record.entityId,
      label: record.classification,
      reason: `Investigate ${record.classification.toLowerCase()}`,
      waypointKind: 'signal',
      arrivalRadius: SIGNAL_INVESTIGATE_RADIUS,
      autopilot: true,
    };
    this.bus.emit('ui:setCourse', course);
    this.bus.emit('signal:tracked', { ...record, pos: { ...record.pos }, course });
    return true;
  },

  _requestContactHail(payload) {
    const state = this.state;
    const availability = contactHailAvailability(state);
    if (!availability.enabled || payload.targetId != null && payload.targetId !== availability.targetId) {
      this._clearContactHail('request_invalid');
      return false;
    }
    if (availability.kind === 'toll') {
      const demand = pirateParleyDemandForHandoff(availability.parley);
      if (!demand || !(Number(demand.deadlineAt) > Number(state.simTime || 0))) {
        this._clearContactHail('parley_invalid');
        return false;
      }
      this._clearContactHail('parley_handoff');
      this.bus.emit('contactHail:handoff', {
        targetId: availability.targetId,
        squadId: demand.squadId,
      });
      // Reuse the shipped presenter and its COMPLY / REFUSE / RUN intents verbatim. Scanner does
      // not become a second payment, hostility, or escape authority.
      this.bus.emit('pirateParley:demand', demand);
      return true;
    }
    const now = Number(state.simTime) || 0;
    const requestId = `contact-hail:${availability.kind}:${String(availability.targetId)}:${state.tick | 0}:${Math.round(now * 1000)}`;
    const offer = createContactHailOffer(
      state,
      availability,
      requestId,
      now + CONTACT_HAIL_REQUEST_TTL_S,
    );
    if (!offer) {
      this._clearContactHail('offer_invalid');
      return false;
    }
    this._contactHail = offer;
    this.bus.emit('contactHail:offer', cloneContactHailPayload(offer));
    return true;
  },

  _chooseContactHail(payload) {
    const active = this._contactHail;
    if (!active || payload.requestId !== active.requestId) return false;
    const state = this.state;
    const now = Number(state && state.simTime) || 0;
    const availability = contactHailAvailability(state);
    const valid = now < Number(active.expiresAt)
      && payload.targetId === active.targetId
      && availability.enabled
      && availability.targetId === active.targetId
      && availability.kind === active.kind;
    if (!valid) {
      this._clearContactHail('choice_invalid');
      return false;
    }
    const target = availability.entity;
    const ai = target && target.data && target.data.ai || {};
    const wanted = isPlayerWanted(state);
    const choice = String(payload.choice || '').toLowerCase();
    const heaveTo = choice === CONTACT_HAIL_ACTION_HEAVE_TO
      ? this._requestContactHeaveTo(target, availability, { wanted, ai })
      : null;
    const response = createContactHailResponse(state, active, payload.choice, {
      wanted,
      weaponsAuthorized: wanted || ai.securityTargetId === state.playerId,
      roe: ai.roe || null,
      heaveTo,
    });
    if (!response) return false;
    this._contactHail = null;
    this.bus.emit('contactHail:response', cloneContactHailPayload(response));
    return true;
  },

  _requestContactHeaveTo(target, availability, { wanted = false, ai = null } = {}) {
    const now = Number(this.state && this.state.simTime) || 0;
    const active = this._contactHailHeaveTo;
    if (active && active.activeUntil > now && active.targetId !== target.id) {
      return { granted: false, reason: 'another_target_active' };
    }
    if (active && active.cooldownUntil > now && active.targetId !== target.id) {
      return { granted: false, reason: 'cooldown' };
    }
    if (!availability || availability.heaveToAvailable !== true) {
      return { granted: false, reason: 'unavailable' };
    }
    if (availability.kind === 'patrol' && (wanted || ai && ai.securityTargetId === this.state.playerId)) {
      return { granted: false, reason: 'ignored' };
    }

    const jobApi = this.helpers && this.helpers.npcJobs
      ? this.helpers.npcJobs
      : this.registry && this.registry.get && this.registry.get('npcJobsRuntime');
    const trafficApi = this.helpers && this.helpers.traffic
      ? this.helpers.traffic
      : this.registry && this.registry.get && this.registry.get('traffic');
    const claimId = `contact-hail:heave-to:${String(target.id)}`;
    let result = null;
    if (target.data && target.data.jobId && jobApi && typeof jobApi.heaveToEntity === 'function') {
      result = jobApi.heaveToEntity(target.id, { claimId, holder: 'contactHail' });
    }
    if ((!result || result.granted !== true) && trafficApi && typeof trafficApi.heaveToEntity === 'function') {
      result = trafficApi.heaveToEntity(target.id, {});
    }
    if (!result) result = { granted: false, reason: 'no_owner' };
    if (result.granted === true) {
      const until = Number(result.untilSimT);
      const activeUntil = Number.isFinite(until) ? until : now + 5;
      this._contactHailHeaveTo = {
        targetId: target.id,
        activeUntil,
        cooldownUntil: activeUntil + 12,
      };
    }
    return result;
  },

  _updateContactHail(state) {
    const active = this._contactHail;
    const now = Number(state && state.simTime) || 0;
    // Expiry remains exact at the fixed-step cadence; range/classification work sleeps at 5 Hz.
    if (active && now >= Number(active.expiresAt)) this._clearContactHail('expired');

    const targetId = state && state.player && state.player.targetId;
    const targetDirty = targetId !== this._contactHailLastTargetId;
    const tick = state && state.tick | 0;
    if (!targetDirty && tick < this._contactHailNextPollTick) return;

    const availability = contactHailAvailability(state);
    this._contactHailLastTargetId = targetId;
    this._contactHailNextPollTick = tick + CONTACT_HAIL_POLL_TICKS;
    this._publishContactHailAvailability(availability);

    const current = this._contactHail;
    if (current && (!availability.enabled
      || availability.targetId !== current.targetId
      || availability.kind !== current.kind)) {
      this._clearContactHail('availability_lost');
    }
  },

  _publishContactHailAvailability(availability) {
    const publicView = {
      enabled: availability && availability.enabled === true,
      reason: availability && availability.reason || null,
      targetId: availability && availability.targetId != null ? availability.targetId : null,
      kind: availability && availability.kind || null,
      label: availability && availability.label || 'HAIL',
      heaveToAvailable: availability && availability.heaveToAvailable === true,
    };
    const signature = `${publicView.enabled}:${String(publicView.targetId)}:${publicView.kind}:${publicView.reason}:${publicView.label}:${publicView.heaveToAvailable}`;
    this._contactHailAvailability = publicView;
    if (signature === this._contactHailAvailabilitySignature) return false;
    this._contactHailAvailabilitySignature = signature;
    this.bus.emit('contactHail:availability', { ...publicView });
    return true;
  },

  _resetContactHail(reason) {
    this._clearContactHail(reason);
    this._contactHailAvailability = null;
    this._contactHailAvailabilitySignature = '';
    this._contactHailNextPollTick = 0;
    this._contactHailLastTargetId = undefined;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('contactHail:availability', {
        enabled: false, reason, targetId: null, kind: null, label: 'HAIL',
      });
    }
  },

  _clearContactHail(reason) {
    if (!this._contactHail) return false;
    const previous = this._contactHail;
    this._contactHail = null;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('contactHail:clear', {
        requestId: previous.requestId,
        targetId: previous.targetId,
        reason,
      });
    }
    return true;
  },

  _updateTrackedSignal(state) {
    const own = ensureSignalState(state);
    const record = own.trackedId && own.records[own.trackedId];
    if (!record || own.completed[record.id]) return;
    const sectorId = state.world && state.world.currentSectorId;
    if (record.sectorId && sectorId && record.sectorId !== sectorId) return;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.alive || !player.pos) return;
    const target = record.entityId && state.entities && state.entities.get && state.entities.get(record.entityId);
    const pos = target && target.pos || record.pos;
    if (!pos) return;
    record.pos = pos2(pos);
    const distance = dist(player.pos, pos);
    record.distance = Math.round(distance);
    if (distance > SIGNAL_INVESTIGATE_RADIUS) return;
    const receipt = {
      id: `signal-receipt:${record.id}`,
      signalId: record.id,
      sectorId: record.sectorId,
      classification: record.classification,
      sourceKind: record.sourceKind,
      sourceId: record.sourceId,
      entityId: record.entityId,
      pos: { ...record.pos },
      outcome: 'investigated',
      completedAt: Number(state.simTime) || 0,
    };
    own.completed[record.id] = receipt;
    own.receipts.push(receipt);
    while (own.receipts.length > SIGNAL_RECEIPT_CAP) own.receipts.shift();
    record.status = 'investigated';
    own.trackedId = null;
    this.bus.emit('signal:investigated', { ...receipt, pos: { ...receipt.pos } });
    this.bus.emit('signal:receipt', { ...receipt, pos: { ...receipt.pos } });
  },

  serialize() {
    const own = ensureSignalState(this.state);
    return cloneSignalState(own);
  },

  deserialize(data) {
    this._resetContactHail('load');
    this.state.signalInvestigation = normalizeSignalState(data);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onSignalTrack) this.bus.off('signal:track', this._onSignalTrack);
      if (this._onContactHailRequest) this.bus.off('contactHail:request', this._onContactHailRequest);
      if (this._onContactHailChoice) this.bus.off('contactHail:choice', this._onContactHailChoice);
      if (this._onContactHailReset) {
        this.bus.off('game:new', this._onContactHailReset);
        this.bus.off('game:load', this._onContactHailReset);
        this.bus.off('dock:docked', this._onContactHailReset);
        this.bus.off('mode:changed', this._onContactHailReset);
      }
    }
    this._contactHail = null;
    this._contactHailAvailability = null;
    this._contactHailAvailabilitySignature = '';
    this._onSignalTrack = null;
    this._onContactHailRequest = null;
    this._onContactHailChoice = null;
    this._onContactHailReset = null;
  },
};

function cloneContactHailPayload(payload) {
  return {
    ...payload,
    lines: Array.isArray(payload.lines) ? payload.lines.slice(0, 2) : [],
    actions: Array.isArray(payload.actions)
      ? payload.actions.slice(0, 3).map((row) => ({ ...row }))
      : [],
  };
}

// ── Contact classification (Radar & Contacts — on-demand threat list) ────────────────────────
// Pure, allocation-free readers the HUD contacts strip (hud.js updateOverview) uses to turn a live
// entity into an at-a-glance threat readout: a mass-based tier, a one-word state, and a
// scanned/unscanned gate for derelicts. Kept next to the scan pulse that resolves them so the
// "what is this contact" logic has a single home (goal: "Lives in radar.js and scanner.js").

const THREAT_MASS_TIERS = [300, 1200, 4000]; // mass thresholds for tier 1 / 2 / 3

export function contactMass(e) {
  if (!e) return 0;
  if (typeof e.mass === 'number') return e.mass;
  return (e.data && typeof e.data.mass === 'number') ? e.data.mass : 0;
}

// 0..3 threat tier. Mass sets the base ("how much hull is pointed at you"); a hostile contact is
// floored at tier 1 so even a light interceptor reads as a live threat (the "+ faction" term).
export function contactThreatTier(e, hostile) {
  const m = contactMass(e);
  let tier = 0;
  for (let i = 0; i < THREAT_MASS_TIERS.length; i++) if (m >= THREAT_MASS_TIERS[i]) tier = i + 1;
  if (hostile && tier < 1) tier = 1;
  return tier;
}

export function isHostileToPlayer(e, playerTeam, state) {
  if (!e || e.team === playerTeam || e.team === 0) return false;
  const playerId = state && state.playerId;
  const data = e.data || {};
  const ai = data.ai || null;
  const combat = data.combat || null;
  const intent = data.intent || null;
  const targetsPlayer = !!(combat && playerId != null && (combat.targetId === playerId || combat.lockTarget === playerId));
  if (ai && ai.passive) return false;
  if (e.team === 2) return false;
  // A live incident response is narrower than global WANTED heat: a patrol may identify the
  // specific ship that just attacked inside its jurisdiction, including before one hit crosses
  // the WANTED threshold. No securityTargetId means the canonical heat gate remains authoritative.
  if (ai && ai.lawful) return ai.securityTargetId === playerId || isPlayerWanted(state);
  if (ai && ai.retaliationTargetId === playerId) return true;
  if (ai && Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(playerTeam)) return true;
  if (targetsPlayer) return true;
  if (intent && intent.fire && targetsPlayer) return true;
  if (ai && (ai.forcePlayerTarget || ai.huntPlayer)) return true;
  if (data.encounter) return true;
  // A few authored outlaw markets field armed local guards rather than unconditional encounter
  // enemies. Explicit targeting/retaliation above still wins, while live standing decides whether
  // an otherwise ambient guard treats the player as a customer or an intruder.
  const standingHostileBelow = ai && ai.standingHostileBelow;
  if (Number.isFinite(standingHostileBelow) && e.factionId) {
    const standing = state && state.factions && state.factions[e.factionId];
    const rep = standing && Number.isFinite(Number(standing.rep)) ? Number(standing.rep) : 0;
    if (rep >= standingHostileBelow) return false;
  }
  const context = String((ai && (ai.spawnContext || ai.context)) || '');
  if (PLAYER_DANGER_CONTEXTS.has(context)) return true;
  const archetype = String((ai && (ai.archetype || ai.doctrine || ai.role)) || data.role || data.scenarioRole || '').toLowerCase();
  if (archetype.includes('trad') || archetype.includes('miner') || archetype.includes('civilian')) return false;
  if (context !== 'ambient' && archetype.includes('pirate')) return true;
  const security = finiteNumber(ai && ai.sectorSecurity, currentSectorSecurity(state));
  const tier = finiteNumber(ai && ai.sectorTier, currentSectorTier(state));
  if ((security <= UNSAFE_PLAYER_SECURITY || tier >= 2) && playerIsInLaneDanger(state)) return true;
  return false;
}

// One-word contact state for the strip. Derelicts read DERELICT; player-aligned ships WINGMAN/ALLY;
// opposing ships resolve to HOSTILE / PATROL / HAULER / COURIER / MINER via trafficRole + AI signals,
// with a plain team fallback so a contact never renders blank (respects the "one word" contract).
// Intent is the operational role (who they are / what they're doing), not a prose wall.
export function contactStateWord(e, playerTeam, state) {
  if (isWreckLike(e)) return 'DERELICT';
  if (e && e.data && e.data.echoOfPlayer === true) return 'ECHO';
  const playerId = state && state.playerId;
  if (e.team === 0 && e.id !== playerId) return (e.data && e.data.isWingman) ? 'WINGMAN' : 'ALLY';
  const data = e.data || {};
  const ai = data.ai;
  const combat = data.combat;
  const targetsPlayer = !!(combat && playerId != null && combat.targetId === playerId);
  const attacking = !!(ai && (ai.fsm === 'attack' || ai.fsm === 'pursue' || ai.fsm === 'strafe'));
  if ((attacking || targetsPlayer) && isHostileToPlayer(e, playerTeam, state)) return 'HOSTILE';

  // Traffic / encounter role is the primary readability channel (faction lives on the faction chip).
  const trafficRole = String(data.trafficRole || data.role || (ai && ai.encounterRole) || '').toLowerCase();
  if (trafficRole === 'patrol' || trafficRole === 'escort') return trafficRole === 'escort' ? 'ESCORT' : 'PATROL';
  if (trafficRole === 'miner' || trafficRole === 'mining' || trafficRole === 'mining_barge') return 'MINER';
  if (trafficRole === 'courier') return 'COURIER';
  if (trafficRole === 'hauler' || trafficRole === 'freighter') return 'HAULER';
  if (trafficRole === 'smuggler') return 'SMUGGLER';
  if (trafficRole === 'rescue') return 'RESCUE';
  if (trafficRole === 'pirate' || trafficRole === 'raider') {
    return isHostileToPlayer(e, playerTeam, state) ? 'HOSTILE' : 'RAIDER';
  }

  if (ai) {
    if (ai.lawful) return 'PATROL';
    const ctx = String(ai.spawnContext || ai.context || '');
    if (ctx === 'patrol') return 'PATROL';
    if (ctx === 'convoy_civilian') return 'HAULER';
    if (ai.passive) return 'TRADER';
    const arch = String(ai.archetype || '');
    if (arch.includes('min')) return 'MINER';
    if (arch.includes('trad')) return 'TRADER';
  }
  if (isHostileToPlayer(e, playerTeam, state)) return 'HOSTILE';
  return 'NEUTRAL';
}

function currentSector(state) {
  const world = state && state.world;
  const id = world && world.currentSectorId;
  return id && world && world.sectors ? world.sectors[id] : null;
}

function currentSectorSecurity(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.security) ? sector.security : 1;
}

function currentSectorTier(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.tier) ? sector.tier : 0;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function playerIsInLaneDanger(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const active = state && state.world && state.world.activeSector;
  const gates = active && Array.isArray(active.gates) ? active.gates : [];
  const hazards = active && Array.isArray(active.hazards) ? active.hazards : [];
  if (!player || !player.pos) return false;
  const inner2 = LANE_CONTEXT_INNER_R * LANE_CONTEXT_INNER_R;
  const outer2 = LANE_CONTEXT_OUTER_R * LANE_CONTEXT_OUTER_R;
  for (const gate of gates) {
    if (!gate || !gate.pos) continue;
    const dx = player.pos.x - gate.pos.x;
    const dz = player.pos.z - gate.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= inner2 && d2 <= outer2) return true;
  }
  for (const hazard of hazards) {
    if (!hazard || !hazard.center || !Number.isFinite(hazard.radius)) continue;
    const dx = player.pos.x - hazard.center.x;
    const dz = player.pos.z - hazard.center.z;
    const radius = Math.max(0, hazard.radius);
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  return false;
}

// Has a derelict/wreck been scan-resolved (manifest known)? Unscanned wrecks show only a ghost
// outline in the strip; a scan pulse fills in the manifest + weak point.
export function wreckScanned(e) {
  return !!(e && e.data && e.data.scanned);
}

export { isWreckLike };
