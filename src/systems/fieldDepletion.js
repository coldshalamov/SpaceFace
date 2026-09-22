import { hash32 } from '../core/rng.js';

// fieldDepletion.js - BP-02 FIELD-MEMORY backend ledger.
//
// Event-sourced mining memory: asteroid destruction in a field raises a durable depletion scalar,
// and slow recovery lets belts heal over time. World already consumes field:depletedChanged.

const STATE_VERSION = 2;
export const FIELD_DEPLETION_PER_YIELD_U = 0.0025;
export const FIELD_DEPLETION_MAX_DELTA = 0.08;
export const FIELD_DEPLETION_RECOVERY_PER_S = 1 / (45 * 60);
export const FIELD_DEPLETION_RECOVERY_STEP_S = 5;
export const FIELD_DEPLETION_MAX_RECEIPTS = 24;
// Field regrowth clock (program-compass economy heartbeat). A worked field is memory, not a
// graveyard: once depletion passes the "worked" band a fresh seam opens on a slow sim-time clock,
// so a cleared starter belt keeps a heartbeat instead of forcing a 14,000 WU dead haul. The world
// owns the physical rocks; this module owns only the durable clock so save/load cannot re-roll it.
export const FIELD_REGROWTH_INTERVAL_S = 9 * 60;
export const FIELD_REGROWTH_MIN_DEPLETION = 0.35;
// Loose lifetime bound only (18 h at the 9 min clock); depletion recovery, not this cap, is the
// governor that stops a field from reopening once it heals below the worked band.
export const FIELD_REGROWTH_MAX_BATCHES = 120;
export const FIELD_REGROWTH_BATCH_MIN = 3;
export const FIELD_REGROWTH_BATCH_MAX = 6;
export const FIELD_REGROWTH_YIELD_SCALE = 0.9;
// After a field is used up, the next minable cluster has to sit inside a few minutes of cruise
// and not at the measured ~14,000 WU empty haul. Cruise matches MISSION_TUNING.cruiseSpeedRef.
export const NEXT_FIELD_CRUISE_WU_S = 140;
export const NEXT_FIELD_FLIGHT_S = 180;
export const NEXT_FIELD_MAX_WU = NEXT_FIELD_CRUISE_WU_S * NEXT_FIELD_FLIGHT_S;
export const NEXT_FIELD_PLACE_WU = 1800;
export const NEXT_FIELD_HOP_WU = 1100;
export const FIELD_USED_UP_DEPLETION = 0.85;
const NEXT_FIELD_CLUSTER = 5;
const NEXT_FIELD_SECTOR_MARGIN = 280;

export const RICH_SEAM_OPPORTUNITY_SCHEMA = 'spaceface.richSeamOpportunity.v1';
export const RICH_SEAM_OPPORTUNITY_WINDOW_S = 180;
export const RICH_SEAM_BONUS_U = 8;

function freshState() {
  return { schemaVersion: STATE_VERSION, fields: {}, opportunities: {}, nextFields: {}, receipts: [] };
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round6(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

function fieldIdOf(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function sectorIdOf(state, payload = {}) {
  return payload.sectorId || (state && state.world && state.world.currentSectorId) || null;
}

function entityFor(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

export function ensureFieldDepletionState(state) {
  if (!state) return null;
  if (!state.fieldDepletion || typeof state.fieldDepletion !== 'object') {
    state.fieldDepletion = freshState();
  }
  const own = state.fieldDepletion;
  own.schemaVersion = STATE_VERSION;
  if (!own.fields || typeof own.fields !== 'object' || Array.isArray(own.fields)) own.fields = {};
  if (!own.opportunities || typeof own.opportunities !== 'object' || Array.isArray(own.opportunities)) {
    own.opportunities = {};
  }
  if (!own.nextFields || typeof own.nextFields !== 'object' || Array.isArray(own.nextFields)) {
    own.nextFields = {};
  }
  if (!Array.isArray(own.receipts)) own.receipts = [];
  return own;
}

function opportunityKey(fieldId, activityObjectSlotId) {
  const field = fieldIdOf(fieldId);
  const slot = fieldIdOf(activityObjectSlotId);
  return field && slot ? `${field}:${slot}` : null;
}

function finiteNonNegative(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeRichSeamOpportunity(input, key = null) {
  const rec = input && typeof input === 'object' ? input : {};
  const fieldId = fieldIdOf(rec.fieldId);
  const activityObjectSlotId = fieldIdOf(rec.activityObjectSlotId);
  const stableKey = opportunityKey(fieldId, activityObjectSlotId) || key;
  if (!stableKey || !fieldId || !activityObjectSlotId) return null;
  const state = rec.state === 'worked' || rec.state === 'missed' ? rec.state : 'open';
  const openedAtT = finiteNonNegative(rec.openedAtT);
  const expiresAtT = Math.max(openedAtT, finiteNonNegative(rec.expiresAtT, openedAtT));
  const bonusU = Math.max(1, Math.floor(finiteNonNegative(rec.bonusU, RICH_SEAM_BONUS_U)));
  const reservedByStableId = typeof rec.reservedByStableId === 'string' && rec.reservedByStableId
    ? rec.reservedByStableId
    : null;
  const reservedByWorldRecordId = typeof rec.reservedByWorldRecordId === 'string' && rec.reservedByWorldRecordId
    ? rec.reservedByWorldRecordId
    : null;
  const reservedByActivityActorSlotId = typeof rec.reservedByActivityActorSlotId === 'string'
    && rec.reservedByActivityActorSlotId ? rec.reservedByActivityActorSlotId : null;
  const reservedByJobId = typeof rec.reservedByJobId === 'string' && rec.reservedByJobId
    ? rec.reservedByJobId : null;
  const stableReservation = state === 'open' && reservedByStableId && reservedByWorldRecordId
    && reservedByActivityActorSlotId && reservedByJobId;
  return {
    schema: RICH_SEAM_OPPORTUNITY_SCHEMA,
    opportunityId: typeof rec.opportunityId === 'string' && rec.opportunityId
      ? rec.opportunityId
      : `rich-seam:${stableKey}`,
    key: stableKey,
    fieldId,
    activityObjectSlotId,
    sectorId: fieldIdOf(rec.sectorId),
    sourceEventId: fieldIdOf(rec.sourceEventId),
    sourceCycle: Math.max(0, Math.floor(finiteNonNegative(rec.sourceCycle))),
    // Rank of the open that produced this record within its cycle (0 = the primary authored open,
    // 1 = a same-cycle re-arm such as the rock calving's fresh face). Absent in pre-reopen saves.
    attempt: Math.max(0, Math.floor(finiteNonNegative(rec.attempt, 0))),
    state,
    openedAtT,
    expiresAtT,
    bonusU,
    claimedBonusU: state === 'worked'
      ? Math.min(bonusU, Math.max(0, Math.floor(finiteNonNegative(rec.claimedBonusU, bonusU))))
      : 0,
    claimId: state === 'worked' && typeof rec.claimId === 'string' && rec.claimId ? rec.claimId : null,
    claimedByKind: state === 'worked' && (rec.claimedByKind === 'npc' || rec.claimedByKind === 'player')
      ? rec.claimedByKind
      : null,
    claimedById: state === 'worked' && rec.claimedById != null ? rec.claimedById : null,
    resolution: state === 'missed'
      ? 'miss'
      : state === 'worked' && (rec.resolution === 'help' || rec.resolution === 'exploit' || rec.resolution === 'work')
        ? rec.resolution
        : null,
    reservationId: stableReservation && typeof rec.reservationId === 'string' && rec.reservationId
      ? rec.reservationId
      : null,
    reservedByKind: stableReservation && rec.reservedByKind === 'npc' ? 'npc' : null,
    reservedById: stableReservation && rec.reservedById != null ? rec.reservedById : null,
    reservedByStableId: stableReservation ? reservedByStableId : null,
    reservedByWorldRecordId: stableReservation ? reservedByWorldRecordId : null,
    reservedByActivityActorSlotId: stableReservation ? reservedByActivityActorSlotId : null,
    reservedByJobId: stableReservation ? reservedByJobId : null,
    reservedAtT: stableReservation && rec.reservationId
      ? finiteNonNegative(rec.reservedAtT, openedAtT)
      : null,
    resolvedAtT: state === 'open' ? null : finiteNonNegative(rec.resolvedAtT, openedAtT),
  };
}

export function openRichSeamOpportunity(state, payload = {}) {
  const key = opportunityKey(payload.fieldId, payload.activityObjectSlotId);
  if (!key) return null;
  const own = ensureFieldDepletionState(state);
  const now = finiteNonNegative(payload.simTime, finiteNonNegative(state && state.simTime));
  const sourceCycle = Math.max(0, Math.floor(finiteNonNegative(payload.sourceCycle)));
  const attempt = Math.max(0, Math.floor(finiteNonNegative(payload.attempt, 0)));
  const opportunityId = typeof payload.opportunityId === 'string' && payload.opportunityId
    ? payload.opportunityId
    : `rich-seam:${key}:${sourceCycle}`;
  const existing = normalizeRichSeamOpportunity(own.opportunities[key], key);
  if (existing) {
    // A live window always wins. A terminal (worked/missed) record may be superseded by a NEW
    // cycle (sourceCycle advancing) — the authored per-cycle strike — or by a strictly higher
    // same-cycle attempt, which is how the rock calving re-arms the seam's fresh face after the
    // strike window has resolved. Absent attempts behave exactly as before this field existed.
    if (existing.state === 'open') return { ...existing };
    if (attempt <= (existing.attempt || 0) && sourceCycle <= existing.sourceCycle) {
      return { ...existing };
    }
  }
  const durationS = Math.max(1, finiteNonNegative(payload.durationS, RICH_SEAM_OPPORTUNITY_WINDOW_S));
  const rec = normalizeRichSeamOpportunity({
    opportunityId,
    fieldId: payload.fieldId,
    activityObjectSlotId: payload.activityObjectSlotId,
    sectorId: payload.sectorId || sectorIdOf(state, payload),
    sourceEventId: payload.sourceEventId || 'ev_rich_seam_strike',
    sourceCycle,
    attempt,
    state: 'open',
    openedAtT: now,
    expiresAtT: now + durationS,
    bonusU: payload.bonusU,
  }, key);
  own.opportunities[key] = rec;
  return { ...rec };
}

export function richSeamOpportunityReadout(state, fieldId, activityObjectSlotId) {
  const own = ensureFieldDepletionState(state);
  const key = opportunityKey(fieldId, activityObjectSlotId);
  const rec = key ? normalizeRichSeamOpportunity(own.opportunities[key], key) : null;
  return rec ? { ...rec } : null;
}

export function richSeamOpportunityForEntity(state, entity) {
  const data = entity && entity.data || {};
  return richSeamOpportunityReadout(state, data.fieldId, data.activityObjectSlotId);
}

/**
 * Cede an open rich seam to the exact NPC miner answering a HELP hail.  Reservation is a
 * durable owner decision: a player exploit cannot claim the same pocket after HELP, while retries
 * with the same request/actor are idempotent.  No ore or field state is changed until physical NPC
 * work calls claimRichSeamOpportunity.
 */
export function reserveRichSeamOpportunity(state, payload = {}) {
  const own = ensureFieldDepletionState(state);
  const key = opportunityKey(payload.fieldId, payload.activityObjectSlotId);
  const rec = key ? normalizeRichSeamOpportunity(own.opportunities[key], key) : null;
  if (!rec || rec.state !== 'open' || payload.reservedByKind !== 'npc' || payload.reservedById == null
    || typeof payload.reservedByStableId !== 'string' || !payload.reservedByStableId
    || typeof payload.reservedByWorldRecordId !== 'string' || !payload.reservedByWorldRecordId
    || typeof payload.reservedByActivityActorSlotId !== 'string' || !payload.reservedByActivityActorSlotId
    || typeof payload.reservedByJobId !== 'string' || !payload.reservedByJobId) return null;
  const now = finiteNonNegative(payload.simTime, finiteNonNegative(state && state.simTime));
  if (now >= rec.expiresAtT) {
    rec.state = 'missed';
    rec.resolution = 'miss';
    rec.resolvedAtT = now;
    own.opportunities[key] = rec;
    return null;
  }
  const reservationId = typeof payload.reservationId === 'string' && payload.reservationId
    ? payload.reservationId
    : `rich-help:${rec.opportunityId}:${payload.reservedByStableId}`;
  if (rec.reservationId) {
    if (rec.reservationId !== reservationId
      || rec.reservedByStableId !== payload.reservedByStableId
      || rec.reservedByWorldRecordId !== payload.reservedByWorldRecordId
      || rec.reservedByActivityActorSlotId !== payload.reservedByActivityActorSlotId
      || rec.reservedByJobId !== payload.reservedByJobId) return null;
    return { ...rec };
  }
  rec.reservationId = reservationId;
  rec.reservedByKind = 'npc';
  rec.reservedById = payload.reservedById;
  rec.reservedByStableId = payload.reservedByStableId;
  rec.reservedByWorldRecordId = payload.reservedByWorldRecordId;
  rec.reservedByActivityActorSlotId = payload.reservedByActivityActorSlotId;
  rec.reservedByJobId = payload.reservedByJobId;
  rec.reservedAtT = now;
  own.opportunities[key] = rec;
  return { ...rec };
}

export function claimRichSeamOpportunity(state, payload = {}) {
  const own = ensureFieldDepletionState(state);
  const key = opportunityKey(payload.fieldId, payload.activityObjectSlotId);
  const rec = key ? normalizeRichSeamOpportunity(own.opportunities[key], key) : null;
  if (!rec || rec.state !== 'open') return null;
  const now = finiteNonNegative(payload.simTime, finiteNonNegative(state && state.simTime));
  if (now >= rec.expiresAtT) {
    rec.state = 'missed';
    rec.resolution = 'miss';
    rec.resolvedAtT = now;
    own.opportunities[key] = rec;
    return null;
  }
  if (typeof payload.claimId !== 'string' || !payload.claimId
    || (payload.claimedByKind !== 'npc' && payload.claimedByKind !== 'player')) return null;
  if (rec.reservationId && (payload.claimedByKind !== rec.reservedByKind
    || payload.claimedByStableId !== rec.reservedByStableId
    || payload.claimedByWorldRecordId !== rec.reservedByWorldRecordId
    || payload.claimedByActivityActorSlotId !== rec.reservedByActivityActorSlotId
    || payload.claimedByJobId !== rec.reservedByJobId)) return null;
  rec.state = 'worked';
  rec.claimId = payload.claimId;
  rec.claimedByKind = payload.claimedByKind;
  rec.claimedById = payload.claimedById == null ? null : payload.claimedById;
  rec.claimedBonusU = rec.bonusU;
  rec.resolution = payload.resolution === 'help' || payload.resolution === 'exploit' || payload.resolution === 'work'
    ? payload.resolution
    : rec.reservationId && payload.claimedByKind === 'npc' ? 'help' : 'work';
  rec.resolvedAtT = now;
  own.opportunities[key] = rec;
  return { ...rec };
}

/** Resolve a reserved HELP seam as a durable MISS when its exact owner dies or is invalidated. */
export function missReservedRichSeamOpportunity(state, payload = {}) {
  const own = ensureFieldDepletionState(state);
  const now = finiteNonNegative(payload.simTime, finiteNonNegative(state && state.simTime));
  for (const key of Object.keys(own.opportunities)) {
    const rec = normalizeRichSeamOpportunity(own.opportunities[key], key);
    if (!rec || rec.state !== 'open' || !rec.reservationId) continue;
    if (payload.reservedByStableId && rec.reservedByStableId !== payload.reservedByStableId) continue;
    if (payload.reservedByWorldRecordId && rec.reservedByWorldRecordId !== payload.reservedByWorldRecordId) continue;
    if (payload.reservedByActivityActorSlotId
      && rec.reservedByActivityActorSlotId !== payload.reservedByActivityActorSlotId) continue;
    if (payload.reservedByJobId && rec.reservedByJobId !== payload.reservedByJobId) continue;
    rec.state = 'missed';
    rec.resolution = 'miss';
    rec.resolvedAtT = now;
    own.opportunities[key] = rec;
    return { ...rec };
  }
  return null;
}

export function expireRichSeamOpportunities(state, simTime = state && state.simTime) {
  const own = ensureFieldDepletionState(state);
  const now = finiteNonNegative(simTime);
  const expired = [];
  for (const key of Object.keys(own.opportunities)) {
    const rec = normalizeRichSeamOpportunity(own.opportunities[key], key);
    if (!rec) {
      delete own.opportunities[key];
      continue;
    }
    if (rec.state === 'open' && now >= rec.expiresAtT) {
      rec.state = 'missed';
      rec.resolution = 'miss';
      rec.resolvedAtT = now;
      expired.push({ ...rec });
    }
    own.opportunities[key] = rec;
  }
  return expired;
}

function normalizeFieldRecord(input, fieldId) {
  const rec = input && typeof input === 'object' ? input : {};
  const depletion = clamp01(rec.depletion);
  return {
    fieldId,
    sectorId: rec.sectorId || null,
    extractedU: round6(Math.max(0, Number(rec.extractedU) || 0)),
    destroyedCount: Math.max(0, Math.floor(Number(rec.destroyedCount) || 0)),
    depletion,
    richnessMult: richnessMultiplierForDepletion(depletion),
    lastChangedT: round6(Math.max(0, Number(rec.lastChangedT) || 0)),
    // Additive regrowth memory: how many seams this field has reopened and when the last one
    // opened. Absent in pre-regrowth saves and defaults to "never regrown" (due at first read).
    regrownBatches: Math.max(0, Math.floor(Number(rec.regrownBatches) || 0)),
    lastRegrowT: round6(Math.max(0, Number(rec.lastRegrowT) || 0)),
  };
}

function fieldRecord(own, fieldId, sectorId = null) {
  let rec = own.fields[fieldId];
  if (!rec || typeof rec !== 'object') {
    rec = normalizeFieldRecord({ sectorId }, fieldId);
    own.fields[fieldId] = rec;
  } else {
    rec = normalizeFieldRecord({ ...rec, sectorId: rec.sectorId || sectorId }, fieldId);
    own.fields[fieldId] = rec;
  }
  return rec;
}

export function depletionDeltaForYield(units) {
  const u = Math.max(0, Number(units) || 0);
  return round6(Math.min(FIELD_DEPLETION_MAX_DELTA, u * FIELD_DEPLETION_PER_YIELD_U));
}

export function richnessMultiplierForDepletion(depletion) {
  return round6(1 - clamp01(depletion) * 0.55);
}

export function fieldMemoryBand(depletion) {
  const d = clamp01(depletion);
  if (d >= 0.72) return 'depleted';
  if (d >= 0.42) return 'thin';
  if (d >= 0.12) return 'worked';
  return 'rich';
}

export function fieldMemoryReadout(state, fieldId) {
  const own = ensureFieldDepletionState(state);
  const id = fieldIdOf(fieldId);
  const rec = id && own.fields[id] ? normalizeFieldRecord(own.fields[id], id) : normalizeFieldRecord({}, id || '');
  const band = fieldMemoryBand(rec.depletion);
  return {
    fieldId: id,
    sectorId: rec.sectorId,
    depletion: rec.depletion,
    richnessMult: rec.richnessMult,
    extractedU: rec.extractedU,
    destroyedCount: rec.destroyedCount,
    regrownBatches: rec.regrownBatches,
    lastRegrowT: rec.lastRegrowT,
    band,
    label: band === 'rich' ? 'Rich field' : band === 'worked' ? 'Worked field' : band === 'thin' ? 'Thinning field' : 'Depleted field',
  };
}

export function recordFieldExtraction(state, payload = {}) {
  const fieldId = fieldIdOf(payload.fieldId);
  if (!fieldId) return null;
  const own = ensureFieldDepletionState(state);
  const sectorId = sectorIdOf(state, payload);
  const simTime = round6(payload.simTime != null ? payload.simTime : state && state.simTime);
  const extractedU = Math.max(0, Number(payload.extractedU != null ? payload.extractedU : payload.yieldU) || 0);
  const delta = depletionDeltaForYield(extractedU);
  const destroyed = payload.destroyed !== false;
  const rec = fieldRecord(own, fieldId, sectorId);
  rec.sectorId = rec.sectorId || sectorId;
  rec.extractedU = round6(rec.extractedU + extractedU);
  if (destroyed) rec.destroyedCount += 1;
  rec.depletion = clamp01(round6(rec.depletion + delta));
  rec.richnessMult = richnessMultiplierForDepletion(rec.depletion);
  rec.lastChangedT = simTime;

  const receipt = {
    event: payload.event || (destroyed ? 'asteroid_destroyed' : 'field_extraction'),
    fieldId,
    sectorId: rec.sectorId,
    extractedU: round6(extractedU),
    delta,
    depleted: rec.depletion,
    richnessMult: rec.richnessMult,
    asteroidId: payload.asteroidId == null ? null : payload.asteroidId,
    source: payload.source || null,
    jobId: payload.jobId || null,
    tick: Math.max(0, Math.floor(Number(payload.tick) || (state && state.tick) || 0)),
    t: simTime,
  };
  own.receipts.push(receipt);
  if (own.receipts.length > FIELD_DEPLETION_MAX_RECEIPTS) {
    own.receipts.splice(0, own.receipts.length - FIELD_DEPLETION_MAX_RECEIPTS);
  }
  return { ...rec, delta, receipt };
}

export function recoverFieldDepletion(state, dt) {
  const own = ensureFieldDepletionState(state);
  const elapsed = Math.max(0, Number(dt) || 0);
  const recovery = elapsed * FIELD_DEPLETION_RECOVERY_PER_S;
  if (recovery <= 0) return [];
  const changed = [];
  const now = round6(state && state.simTime);
  for (const fieldId of Object.keys(own.fields)) {
    const rec = fieldRecord(own, fieldId);
    if (rec.depletion <= 0) continue;
    const before = rec.depletion;
    rec.depletion = clamp01(round6(rec.depletion - recovery));
    rec.richnessMult = richnessMultiplierForDepletion(rec.depletion);
    rec.lastChangedT = now;
    if (rec.depletion !== before) changed.push({ ...rec, delta: round6(rec.depletion - before) });
  }
  return changed;
}

/**
 * Whether a worked field has a fresh seam due on the slow regrowth clock. Pure read: the world
 * owns the physical rocks and calls `recordFieldRegrowth` once it has spawned them. A field that
 * has never regrown is due as soon as it reads "worked" (depletion >= FIELD_REGROWTH_MIN_DEPLETION).
 *
 * @returns {{fieldId:string,sectorId:string|null,depletion:number,richnessMult:number,band:string,batches:number}|null}
 */
export function fieldRegrowthDue(state, fieldId, simTime = state && state.simTime) {
  const own = ensureFieldDepletionState(state);
  const id = fieldIdOf(fieldId);
  const rec = id && own.fields[id] ? normalizeFieldRecord(own.fields[id], id) : null;
  if (!rec) return null;
  if (rec.depletion < FIELD_REGROWTH_MIN_DEPLETION) return null;
  if (rec.regrownBatches >= FIELD_REGROWTH_MAX_BATCHES) return null;
  const now = Number.isFinite(simTime) ? simTime : 0;
  if (now < rec.lastRegrowT + FIELD_REGROWTH_INTERVAL_S) return null;
  return {
    fieldId: id,
    sectorId: rec.sectorId,
    depletion: rec.depletion,
    richnessMult: rec.richnessMult,
    band: fieldMemoryBand(rec.depletion),
    batches: rec.regrownBatches,
  };
}

/**
 * Where to put the next minable cluster after a field is used up.
 * The cluster stays inside a few minutes of cruise and short of the 14,000 WU empty haul.
 * Trail rocks sit on the way so the flight is not a dead gap.
 * Pure: the world owns the spawn.
 */
export function planUsedUpFieldOpportunity(spec = {}) {
  const from = spec.from;
  if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.z)) return null;
  const origin = spec.sectorOrigin || { x: 0, z: 0 };
  const radius = Number(spec.sectorRadius) > 0 ? Number(spec.sectorRadius) : 3500;
  const fromRadius = Math.max(0, Number(spec.fromRadius) || 0);
  const toward = spec.toward;
  // The gate-ward line is preferred; the hash direction is the deterministic fallback when the
  // gate-ward candidates are all blocked (near gate inside its own keepout, rim, margin).
  const hashAng = ((hash32(spec.seed || 1, spec.sectorId || '', spec.fieldId || '', 'next-field') % 3600) / 3600) * Math.PI * 2;
  const dirs = [{ x: Math.cos(hashAng), z: Math.sin(hashAng), cap: Infinity }];
  if (toward && Number.isFinite(toward.x) && Number.isFinite(toward.z)) {
    const tdx = toward.x - from.x;
    const tdz = toward.z - from.z;
    const len = Math.hypot(tdx, tdz);
    if (len > 1) {
      dirs.unshift({ x: tdx / len, z: tdz / len, cap: Math.max(NEXT_FIELD_HOP_WU, len - 700) });
    }
  }
  let dx = dirs[0].x;
  let dz = dirs[0].z;
  const limit = Math.max(400, radius - NEXT_FIELD_SECTOR_MARGIN);
  // Station/gate halos the seam must clear; the arranger enforces the same class of keepout
  // for authored content. A candidate is rejected if its center lands inside one.
  const keepouts = Array.isArray(spec.keepouts) ? spec.keepouts : [];
  const clearOfKeepouts = (x, z, margin) => {
    for (const keep of keepouts) {
      if (!keep || !Number.isFinite(keep.x) || !Number.isFinite(keep.z)) continue;
      const rr = (Number(keep.r) > 0 ? Number(keep.r) : 0) + (margin || 0);
      const ddx = x - keep.x;
      const ddz = z - keep.z;
      if (rr > 0 && ddx * ddx + ddz * ddz < rr * rr) return false;
    }
    return true;
  };
  let place = null;
  for (const dir of dirs) {
    let candidate = Math.min(NEXT_FIELD_PLACE_WU, NEXT_FIELD_MAX_WU, 14000 - 1, dir.cap);
    // The floor candidate (NEXT_FIELD_HOP_WU, the common near-gate case) gets the same bounds
    // and keepout check as every other step — clamped steps land on it exactly.
    for (;;) {
      const px = from.x + dir.x * candidate;
      const pz = from.z + dir.z * candidate;
      const odx = px - origin.x;
      const odz = pz - origin.z;
      if (odx * odx + odz * odz <= limit * limit && clearOfKeepouts(px, pz, 160)) {
        place = candidate;
        dx = dir.x;
        dz = dir.z;
        break;
      }
      if (candidate <= NEXT_FIELD_HOP_WU) break;
      candidate = Math.max(NEXT_FIELD_HOP_WU, candidate - 200);
    }
    if (place != null) break;
  }
  if (place == null) return null;
  const center = {
    x: from.x + dx * place,
    z: from.z + dz * place,
  };
  const rocks = [];
  for (let d = fromRadius + NEXT_FIELD_HOP_WU; d < place - 160; d += NEXT_FIELD_HOP_WU) {
    const rx = from.x + dx * d;
    const rz = from.z + dz * d;
    if (clearOfKeepouts(rx, rz, 30)) rocks.push({ x: rx, z: rz, role: 'trail' });
  }
  if (!rocks.length) {
    const d = Math.max(fromRadius + 400, place * 0.45);
    const rx = from.x + dx * d;
    const rz = from.z + dz * d;
    if (clearOfKeepouts(rx, rz, 30)) rocks.push({ x: rx, z: rz, role: 'trail' });
  }
  const scatter = 140;
  for (let i = 0; i < NEXT_FIELD_CLUSTER; i++) {
    const ang = (hash32(spec.seed || 1, spec.fieldId || '', 'cluster', i) % 6283) / 1000;
    const r = ((hash32(spec.seed || 1, spec.fieldId || '', 'cluster-r', i) % 1000) / 1000) * scatter;
    rocks.push({
      x: center.x + Math.cos(ang) * r,
      z: center.z + Math.sin(ang) * r,
      role: 'cluster',
    });
  }
  return {
    sourceFieldId: spec.fieldId || null,
    fieldId: `next:${spec.fieldId || 'field'}`,
    sectorId: spec.sectorId || null,
    center,
    distanceWU: place,
    hopWU: NEXT_FIELD_HOP_WU,
    rocks,
  };
}

// A seam never carries more than trail + cluster rocks; the bound also keeps a corrupt save
// from mass-spawning through the record.
const NEXT_FIELD_ROCK_CAP = 64;

function normalizeRockSpots(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const rock of list) {
    if (out.length >= NEXT_FIELD_ROCK_CAP) break;
    const x = Number(rock && rock.x);
    const z = Number(rock && rock.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    out.push({ x, z, role: rock && rock.role === 'cluster' ? 'cluster' : 'trail' });
  }
  return out;
}

export function nextFieldOpportunityRecord(state, sectorId) {
  const own = ensureFieldDepletionState(state);
  if (!sectorId || !own.nextFields) return null;
  const rec = own.nextFields[sectorId];
  // Clone-on-read like the rest of this module: callers must not mutate the stored record.
  return rec ? clonePlain(rec) : null;
}

export function releaseNextFieldOpportunity(state, sectorId) {
  const own = ensureFieldDepletionState(state);
  const id = fieldIdOf(sectorId);
  if (!id || !own.nextFields || own.nextFields[id] == null) return false;
  delete own.nextFields[id];
  return true;
}

export function recordNextFieldOpportunity(state, payload = {}) {
  const own = ensureFieldDepletionState(state);
  const sectorId = fieldIdOf(payload.sectorId);
  if (!sectorId || !payload.fieldId || !payload.center) return null;
  // The seam's rock positions are frozen into the record: the live bag's fields/gates re-roll
  // under a different rng offset once the field is used up, so re-deriving the plan at
  // rematerialize would relocate the seam. The record is the placement truth.
  const rockSpots = normalizeRockSpots(payload.rockSpots);
  const rec = {
    fieldId: String(payload.fieldId),
    sourceFieldId: payload.sourceFieldId ? String(payload.sourceFieldId) : null,
    center: {
      x: Number(payload.center.x) || 0,
      z: Number(payload.center.z) || 0,
    },
    distanceWU: Math.max(0, Number(payload.distanceWU) || 0),
    rocks: Math.max(0, Math.floor(Number(payload.rocks) || 0)),
    rockSpots,
    placedAtT: round6(payload.simTime != null ? payload.simTime : state && state.simTime),
  };
  own.nextFields[sectorId] = rec;
  return { ...rec, center: { ...rec.center }, rockSpots: clonePlain(rockSpots) };
}

/** Advance the durable regrowth clock after the world has spawned the seam's rocks. */
export function recordFieldRegrowth(state, payload = {}) {
  const own = ensureFieldDepletionState(state);
  const id = fieldIdOf(payload.fieldId);
  if (!id) return null;
  const rec = fieldRecord(own, id, payload.sectorId || null);
  const simTime = round6(payload.simTime != null ? payload.simTime : state && state.simTime);
  rec.regrownBatches = Math.max(0, Math.floor(Number(rec.regrownBatches) || 0))
    + Math.max(1, Math.floor(Number(payload.batches) || 1));
  rec.lastRegrowT = simTime;
  rec.lastChangedT = simTime;
  return { ...rec };
}

/**
 * Averaged local depletion for one sector: the demand model's regional scarcity input and the
 * world's "which seam is worth leading to" input. Weighted by extracted units so a heavily worked
 * belt outweighs a field that was scratched once. Never counts entities, wall time, or rng.
 */
export function sectorDepletionPressure(state, sectorId) {
  const own = ensureFieldDepletionState(state);
  let fields = 0;
  let extractedU = 0;
  let depletionU = 0;
  let peak = 0;
  for (const fieldId of Object.keys(own.fields)) {
    const rec = normalizeFieldRecord(own.fields[fieldId], fieldId);
    if (sectorId && rec.sectorId !== sectorId) continue;
    fields++;
    if (rec.depletion > peak) peak = rec.depletion;
    const weight = Math.max(1, rec.extractedU);
    extractedU += weight;
    depletionU += rec.depletion * weight;
  }
  if (!fields) return { fields: 0, depletion: 0, peak: 0, extractedU: 0 };
  return {
    fields,
    depletion: clamp01(round6(depletionU / extractedU)),
    peak: clamp01(round6(peak)),
    extractedU: round6(Math.max(0, extractedU - fields)), // undo the weight floor for readable units
  };
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export const fieldDepletion = {
  name: 'fieldDepletion',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this._recoveryAccum = 0;
    ensureFieldDepletionState(this.state);
    this._onDestroyed = (payload) => this._onAsteroidDestroyed(payload || {});
    this._onNpcExtraction = (payload) => this._onNpcMinerExtraction(payload || {});
    this._onNewGame = () => this.newGame();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('asteroid:destroyed', this._onDestroyed);
      this.bus.on('mining:npcExtraction', this._onNpcExtraction);
      this.bus.on('game:newGame', this._onNewGame);
    }
  },

  newGame() {
    if (this.state) this.state.fieldDepletion = freshState();
    this._recoveryAccum = 0;
  },

  update(dt, state) {
    const expired = expireRichSeamOpportunities(state);
    for (const rec of expired) {
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('field:richSeamMissed', rec);
    }
    this._recoveryAccum = (this._recoveryAccum || 0) + Math.max(0, Number(dt) || 0);
    if (this._recoveryAccum < FIELD_DEPLETION_RECOVERY_STEP_S) return;
    const elapsed = this._recoveryAccum;
    this._recoveryAccum = 0;
    const changed = recoverFieldDepletion(state, elapsed);
    const currentSectorId = state && state.world && state.world.currentSectorId;
    for (const rec of changed) {
      if (!rec || rec.sectorId !== currentSectorId) continue;
      this._emitChanged(rec, 'recovery');
    }
  },

  _onAsteroidDestroyed(payload) {
    const state = this.state;
    const asteroidId = payload.id != null ? payload.id : payload.asteroidId != null ? payload.asteroidId : payload.entityId;
    const entity = entityFor(state, asteroidId);
    const data = entity && entity.data || {};
    const fieldId = fieldIdOf(payload.fieldId || data.fieldId);
    if (!fieldId) return null;
    const rec = recordFieldExtraction(state, {
      fieldId,
      sectorId: payload.sectorId || data.sectorId || sectorIdOf(state, payload),
      extractedU: data.yieldU != null ? data.yieldU : data.bulkMassU != null ? data.bulkMassU : payload.yieldU,
      asteroidId,
      simTime: state && state.simTime,
      tick: state && state.tick,
    });
    if (rec) this._emitChanged(rec, 'asteroid_destroyed');
    return rec;
  },

  _onNpcMinerExtraction(payload) {
    const fieldId = fieldIdOf(payload.fieldId);
    const extractedU = Math.max(0, Number(payload.extractedU) || 0);
    if (!fieldId || extractedU <= 0) return null;
    const rec = recordFieldExtraction(this.state, {
      fieldId,
      sectorId: payload.sectorId || sectorIdOf(this.state, payload),
      extractedU,
      asteroidId: payload.asteroidId,
      simTime: this.state && this.state.simTime,
      tick: this.state && this.state.tick,
      destroyed: false,
      event: 'npc_mining',
      source: 'traffic_npc_job',
      jobId: payload.jobId || null,
    });
    if (rec) this._emitChanged(rec, 'npc_mining', {
      source: 'traffic_npc_job',
      minerId: payload.minerId == null ? null : payload.minerId,
      jobId: payload.jobId || null,
    });
    return rec;
  },

  _emitChanged(rec, reason, context = null) {
    if (!this.bus || typeof this.bus.emit !== 'function') return false;
    const payload = {
      fieldId: rec.fieldId,
      sectorId: rec.sectorId || null,
      depleted: rec.depletion,
      richnessMult: rec.richnessMult,
      extractedU: rec.extractedU,
      destroyedCount: rec.destroyedCount,
      reason,
      source: context && context.source || null,
      minerId: context && context.minerId != null ? context.minerId : null,
      jobId: context && context.jobId || null,
    };
    this.bus.emit('fieldDepletion:changed', payload);
    this.bus.emit('field:depletedChanged', payload);
    return true;
  },

  serialize() {
    const own = ensureFieldDepletionState(this.state);
    const fields = {};
    for (const fieldId of Object.keys(own.fields).sort()) {
      const rec = normalizeFieldRecord(own.fields[fieldId], fieldId);
      if (rec.depletion > 0 || rec.extractedU > 0 || rec.destroyedCount > 0) fields[fieldId] = rec;
    }
    const data = {
      schemaVersion: STATE_VERSION,
      fields,
      opportunities: clonePlain(own.opportunities),
      receipts: clonePlain(own.receipts.slice(-FIELD_DEPLETION_MAX_RECEIPTS)),
    };
    if (own.nextFields && Object.keys(own.nextFields).length) data.nextFields = clonePlain(own.nextFields);
    return data;
  },

  deserialize(data) {
    const own = ensureFieldDepletionState(this.state);
    own.fields = {};
    const fields = data && data.fields && typeof data.fields === 'object' ? data.fields : {};
    for (const fieldId of Object.keys(fields)) {
      own.fields[fieldId] = normalizeFieldRecord(fields[fieldId], fieldId);
    }
    own.opportunities = {};
    const opportunities = data && data.opportunities && typeof data.opportunities === 'object'
      ? data.opportunities
      : {};
    for (const key of Object.keys(opportunities)) {
      const rec = normalizeRichSeamOpportunity(opportunities[key], key);
      if (rec) own.opportunities[key] = rec;
    }
    own.receipts = Array.isArray(data && data.receipts)
      ? clonePlain(data.receipts).slice(-FIELD_DEPLETION_MAX_RECEIPTS)
      : [];
    own.nextFields = {};
    const nextFields = data && data.nextFields && typeof data.nextFields === 'object' ? data.nextFields : {};
    for (const sectorId of Object.keys(nextFields)) {
      const rec = nextFields[sectorId];
      if (!rec || !rec.fieldId || !rec.center) continue;
      own.nextFields[sectorId] = {
        fieldId: String(rec.fieldId),
        sourceFieldId: rec.sourceFieldId ? String(rec.sourceFieldId) : null,
        center: { x: Number(rec.center.x) || 0, z: Number(rec.center.z) || 0 },
        distanceWU: Math.max(0, Number(rec.distanceWU) || 0),
        rocks: Math.max(0, Math.floor(Number(rec.rocks) || 0)),
        // Records written before rockSpots existed cannot be re-placed — they load with an
        // empty list and the materialize step lets the planner promise a fresh seam.
        rockSpots: normalizeRockSpots(rec.rockSpots),
        placedAtT: round6(rec.placedAtT),
      };
    }
    own.schemaVersion = STATE_VERSION;
    this._recoveryAccum = 0;
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onDestroyed) this.bus.off('asteroid:destroyed', this._onDestroyed);
      if (this._onNpcExtraction) this.bus.off('mining:npcExtraction', this._onNpcExtraction);
      if (this._onNewGame) this.bus.off('game:newGame', this._onNewGame);
    }
    this._onDestroyed = this._onNpcExtraction = this._onNewGame = null;
  },
};

export default fieldDepletion;
