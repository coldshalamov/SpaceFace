// GLASSWAKE sample custody. This module owns only the expedition's plain receipt ledger.
// Cargo/economy/lifetime stay with their existing production owners, supplied as bound ports.
import { COMMODITIES } from '../../data/commodities.js';

export const SAMPLE_LIMITS = Object.freeze({
  count: 6, quantity: 8, bonusCr: 2000, chargeStepS: 0.25,
  maxRelativeSpeed: 12, playerRange: 90,
});

const STATUSES = new Set(['pending', 'drifting', 'charged', 'settling', 'extracted', 'lost']);
const TERMINAL = new Set(['extracted', 'lost']);
const DEFINITIONS = new Map(COMMODITIES.map((item) => [item.id, item]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const text = (v, fallback = '') => typeof v === 'string' ? v.slice(0, 160) : fallback;
const validId = (v) => Number.isSafeInteger(v) && v > 0;
const generationOf = (body) => Number.isSafeInteger(body?.occupantGeneration) ? body.occupantGeneration : null;
const planar = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.z);
const rowOf = (ledger, id) => ledger?.samples?.find((row) => row.id === id) || null;

function sampleSpec(spec, index) {
  const id = text(spec?.id, `sample_${index + 1}`);
  const commodityId = text(spec?.commodityId, 'cmdty_crystal_lumin');
  if (!id || !DEFINITIONS.has(commodityId)) throw new TypeError('GLASSWAKE sample requires a known commodity and stable ID');
  return {
    id, commodityId,
    quantity: clamp(Math.floor(finite(spec?.quantity, 1)), 1, SAMPLE_LIMITS.quantity),
    bonusCr: clamp(Math.floor(finite(spec?.bonusCr)), 0, SAMPLE_LIMITS.bonusCr),
    chargeSeconds: clamp(finite(spec?.chargeSeconds, 6), 0.5, 60),
    bodyId: null, bodyGeneration: null, status: 'pending', charge: 0,
    lastChargeAt: null, extractedAt: null, lostReason: '', grantedCr: 0,
  };
}

/** A short bounded list is intentional: no persistent world-body copies or object references. */
export function createSampleLedger({ expeditionId, sectorId = '', samples = [], createdAt = 0 } = {}) {
  if (!text(expeditionId)) throw new TypeError('GLASSWAKE expeditionId is required');
  if (!Array.isArray(samples) || samples.length > SAMPLE_LIMITS.count) throw new RangeError('Too many GLASSWAKE samples');
  const rows = samples.map(sampleSpec);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new TypeError('Duplicate GLASSWAKE sample IDs');
  return {
    schemaVersion: 1, expeditionId: text(expeditionId), sectorId: text(sectorId),
    createdAt: Math.max(0, finite(createdAt)), samples: rows,
    closed: false, settled: false, outcome: '', closedAt: null,
  };
}

/** Bind once, after the canonical entity factory has assigned ID + occupant generation. */
export function bindSampleBody(ledger, sampleId, body) {
  const row = rowOf(ledger, sampleId);
  if (!row || ledger.closed || row.status !== 'pending' || !validId(body?.id) || body.alive === false) return false;
  if (ledger.samples.some((other) => other !== row && other.bodyId === body.id
      && other.bodyGeneration === generationOf(body))) return false;
  row.bodyId = body.id;
  row.bodyGeneration = generationOf(body);
  row.status = 'drifting';
  body.data = body.data || {};
  body.data.stormChase = { ...body.data.stormChase, expeditionId: ledger.expeditionId, sampleId: row.id };
  return true;
}

export function sampleBody(ledger, sampleId, state) {
  const row = rowOf(ledger, sampleId);
  if (!row || !validId(row.bodyId)) return null;
  const body = state?.entities?.get(row.bodyId);
  if (!body || body.alive === false || (Number.isFinite(body.hull) && body.hull <= 0)) return null;
  if (generationOf(body) !== row.bodyGeneration) return null;
  const tag = body.data?.stormChase;
  return tag?.expeditionId === ledger.expeditionId && tag.sampleId === row.id ? body : null;
}

/** Reconciliation never spawns a missing pod or transfers its identity to a recycled ID. */
export function observeSampleBodies(ledger, state) {
  const lost = [];
  for (const row of ledger?.samples || []) {
    if (row.status !== 'drifting' && row.status !== 'charged') continue;
    if (!sampleBody(ledger, row.id, state)) {
      row.status = 'lost'; row.lostReason = 'body_missing_or_replaced'; lost.push(row.id);
    }
  }
  return lost;
}

export function loseSample(ledger, sampleId, reason = 'sample_lost', simTime = 0) {
  const row = rowOf(ledger, sampleId);
  if (!row || TERMINAL.has(row.status) || row.status === 'settling') return false;
  row.status = 'lost';
  row.lostReason = text(reason, 'sample_lost');
  row.lastChargeAt = Math.max(0, finite(simTime));
  return true;
}

/** Charge is exposure-integrated, never proximity-awarded. Repeated tick observations are inert. */
export function chargeSample(ledger, sampleId, { dt = 0, exposure = 0, simTime } = {}) {
  const row = rowOf(ledger, sampleId);
  if (!row || ledger.closed || row.status !== 'drifting' || !Number.isFinite(simTime) || simTime < 0) return row;
  if (row.lastChargeAt !== null && simTime <= row.lastChargeAt) return row;
  const elapsed = row.lastChargeAt === null ? dt : Math.min(dt, simTime - row.lastChargeAt);
  const step = clamp(finite(elapsed), 0, SAMPLE_LIMITS.chargeStepS);
  row.lastChargeAt = simTime;
  row.charge = clamp(row.charge + clamp(finite(exposure), 0, 1) * step / row.chargeSeconds, 0, 1);
  if (row.charge >= 1 - 1e-10) { row.charge = 1; row.status = 'charged'; }
  return row;
}

function commodityOf(state, id) {
  const content = state?.content?.commodities;
  const row = Array.isArray(content) ? content.find((entry) => entry.id === id) : content?.[id];
  return row || DEFINITIONS.get(id);
}

function hasProvenance(state, receiptId) {
  return Array.isArray(state?.player?.cargo?.richLots)
    && state.player.cargo.richLots.some((lot) => lot?.provenanceId === receiptId && lot.qty > 0);
}

export function sampleReceiptId(ledger, sampleId) {
  return `stormChase:${ledger.expeditionId}:${sampleId}`;
}

/** Physical handover: the pod AND pilot reach the receiver, and pod-relative speed is safe. */
export function extractionQuote(ledger, sampleId, {
  state, player = state?.entities?.get(state?.playerId), receiver,
  maxRelativeSpeed = SAMPLE_LIMITS.maxRelativeSpeed, playerRange = SAMPLE_LIMITS.playerRange,
} = {}) {
  const row = rowOf(ledger, sampleId);
  const fail = (reason) => ({ ok: false, reason, sampleId });
  if (!row) return fail('unknown_sample');
  if (ledger.closed) return fail('expedition_closed');
  if (row.status !== 'charged') return fail(TERMINAL.has(row.status) ? 'already_accounted' : 'sample_not_charged');
  if (ledger.sectorId && state?.world?.currentSectorId !== ledger.sectorId) return fail('wrong_sector');
  const body = sampleBody(ledger, sampleId, state);
  if (!body) return fail('body_missing_or_replaced');
  if (!player || player.id !== state?.playerId || state.entities.get(player.id) !== player || player.alive === false
      || player.flags?.docked || state.ui?.docked || (Number.isFinite(player.hull) && player.hull <= 0)) return fail('pilot_unavailable');
  if (!planar(body.pos) || !planar(body.vel) || !planar(player.pos) || !planar(receiver)
      || !Number.isFinite(receiver.radius) || receiver.radius <= 0) return fail('invalid_geometry');
  const bodyRadius = Math.max(0, finite(body.radius));
  const distance = Math.hypot(body.pos.x - receiver.x, body.pos.z - receiver.z);
  if (distance + bodyRadius > receiver.radius) return fail('pod_outside_receiver');
  if (Math.hypot(player.pos.x - receiver.x, player.pos.z - receiver.z)
      > receiver.radius + clamp(finite(playerRange), 0, SAMPLE_LIMITS.playerRange)) return fail('pilot_outside_receiver');
  const relativeSpeed = Math.hypot(body.vel.x - finite(receiver.vx), body.vel.z - finite(receiver.vz));
  if (relativeSpeed > clamp(finite(maxRelativeSpeed), 0, SAMPLE_LIMITS.maxRelativeSpeed)) return fail('relative_speed_too_high');
  const cargo = state?.player?.cargo;
  const def = commodityOf(state, row.commodityId);
  const volume = def?.volPerU > 0 ? def.volPerU : 1;
  if (!cargo?.items || !Number.isFinite(cargo.usedVolume) || !Number.isFinite(cargo.usedMass)
      || !Number.isFinite(cargo.capVolume) || cargo.capVolume - cargo.usedVolume < row.quantity * volume) return fail('hold_full');
  const receiptId = sampleReceiptId(ledger, sampleId);
  if (hasProvenance(state, receiptId)) return fail('receipt_already_in_hold');
  return { ok: true, sampleId, bodyId: body.id, bodyGeneration: generationOf(body), receiptId,
    commodityId: row.commodityId, quantity: row.quantity, bonusCr: row.bonusCr, relativeSpeed };
}

/**
 * Owner callbacks are synchronous, like the production event bus. Reserve the source BEFORE
 * cargo:changed can reenter. Retire in finally. An interrupted handover may withhold a bonus,
 * but it must never recreate loot or pay the same source twice after save/restore.
 * addCargo is registry.get('cargo').addCargo.bind(cargo), not an imitation cargo writer.
 */
export function extractSample(ledger, sampleId, options = {}) {
  const quote = extractionQuote(ledger, sampleId, options);
  if (!quote.ok) return quote;
  if (typeof options.isCurrent === 'function' && options.isCurrent() !== true)
    return { ok: false, reason: 'owner_context_changed', sampleId };
  if (typeof options.addCargo !== 'function' || typeof options.retireBody !== 'function'
      || (quote.bonusCr > 0 && typeof options.grantCredits !== 'function')) return { ok: false, reason: 'owner_unavailable', sampleId };
  const row = rowOf(ledger, sampleId);
  const body = sampleBody(ledger, sampleId, options.state);
  const playerRecord = options.state?.player, cargoRecord = playerRecord?.cargo;
  const pilot = options.state?.entities?.get(options.state?.playerId);
  row.status = 'settling';
  let accepted = 0;
  try {
    accepted = options.addCargo(quote.commodityId, quote.quantity, {
      lotId: quote.receiptId, provenanceId: quote.receiptId, sourceKind: 'storm_sample', lotQty: quote.quantity,
    });
    // Production addCargo is all-or-clamped. Preflight ensured full capacity. A custom failing
    // port is not a reason to reoffer an uncertain source; fail closed and report its result.
    if (!Number.isFinite(accepted) || accepted !== quote.quantity) {
      row.status = 'lost'; row.lostReason = 'cargo_owner_rejected';
      return { ok: false, reason: 'cargo_owner_rejected', sampleId, accepted: finite(accepted) };
    }
    // A synchronous cargo listener may load a save or start a new run. An old delivery cannot
    // pay the new pilot or continue against the replacement cargo record after that boundary.
    if (options.state?.player !== playerRecord || options.state?.player?.cargo !== cargoRecord
        || options.state?.entities?.get(options.state?.playerId) !== pilot
        || (typeof options.isCurrent === 'function' && options.isCurrent() !== true)) {
      row.status = 'lost'; row.lostReason = 'owner_context_changed';
      return { ok: false, reason: 'owner_context_changed', sampleId, accepted };
    }
    row.status = 'extracted';
    row.extractedAt = Math.max(0, finite(options.simTime));
    // Set the receipt before synchronous credit listeners run; throws cannot make it repayable.
    row.grantedCr = quote.bonusCr;
    if (quote.bonusCr > 0) options.grantCredits(quote.bonusCr, quote.receiptId);
    return { ...quote, ok: true };
  } catch (error) {
    if (row.status === 'settling') { row.status = 'lost'; row.lostReason = 'owner_interrupted'; }
    throw error;
  } finally {
    options.retireBody(body);
  }
}

export function finishSampleLedger(ledger, reason = 'ended', simTime = 0) {
  if (!ledger || ledger.closed) return false;
  ledger.closed = true;
  ledger.settled = true;
  ledger.outcome = text(reason, 'ended');
  ledger.closedAt = Math.max(0, finite(simTime));
  for (const row of ledger.samples) {
    if (!TERMINAL.has(row.status)) { row.status = 'lost'; row.lostReason = ledger.outcome; }
  }
  return true;
}

/** Intentionally whitelist fields. Meshes, Maps, entity refs and unknown imported keys cannot leak. */
export function snapshotSampleLedger(ledger) {
  return {
    schemaVersion: 1, expeditionId: ledger.expeditionId, sectorId: ledger.sectorId,
    createdAt: ledger.createdAt, closed: !!ledger.closed, settled: !!ledger.settled,
    outcome: ledger.outcome, closedAt: ledger.closedAt,
    samples: ledger.samples.slice(0, SAMPLE_LIMITS.count).map((row) => ({
      id: row.id, commodityId: row.commodityId, quantity: row.quantity, bonusCr: row.bonusCr,
      chargeSeconds: row.chargeSeconds, bodyId: row.bodyId, bodyGeneration: row.bodyGeneration,
      status: row.status, charge: row.charge, lastChargeAt: row.lastChargeAt,
      extractedAt: row.extractedAt, lostReason: row.lostReason, grantedCr: row.grantedCr,
    })),
  };
}

export function restoreSampleLedger(raw, { state, expeditionId = raw?.expeditionId } = {}) {
  if (!raw || raw.schemaVersion !== 1 || raw.expeditionId !== expeditionId || !Array.isArray(raw.samples)
      || raw.samples.length > SAMPLE_LIMITS.count) throw new TypeError('Unsupported GLASSWAKE sample ledger');
  const ledger = createSampleLedger({ expeditionId, sectorId: text(raw.sectorId), samples: raw.samples, createdAt: raw.createdAt });
  ledger.closed = raw.closed === true;
  ledger.settled = raw.settled === true || ledger.closed;
  ledger.outcome = text(raw.outcome);
  ledger.closedAt = Number.isFinite(raw.closedAt) ? Math.max(0, raw.closedAt) : null;
  for (let i = 0; i < ledger.samples.length; i++) {
    const row = ledger.samples[i], source = raw.samples[i];
    row.bodyId = validId(source.bodyId) ? source.bodyId : null;
    row.bodyGeneration = Number.isSafeInteger(source.bodyGeneration) ? source.bodyGeneration : null;
    row.status = STATUSES.has(source.status) ? source.status : 'lost';
    row.charge = clamp(finite(source.charge), 0, 1);
    row.lastChargeAt = Number.isFinite(source.lastChargeAt) ? Math.max(0, source.lastChargeAt) : null;
    row.extractedAt = Number.isFinite(source.extractedAt) ? Math.max(0, source.extractedAt) : null;
    row.lostReason = text(source.lostReason);
    row.grantedCr = clamp(Math.floor(finite(source.grantedCr)), 0, row.bonusCr);
    // No completion can be inferred from charge alone, and no interrupted commit can be retried.
    if (row.status === 'settling' || (row.status === 'charged' && row.charge < 1)
        || (row.status === 'pending' && row.bodyId !== null)) {
      row.status = 'lost'; row.lostReason = 'interrupted_or_invalid_restore';
    }
    if (ledger.closed && !TERMINAL.has(row.status)) { row.status = 'lost'; row.lostReason = 'expedition_closed'; }
  }
  if (state) observeSampleBodies(ledger, state);
  return ledger;
}

export function sampleLedgerSummary(ledger) {
  const summary = { total: 0, charged: 0, extracted: 0, lost: 0, bonusCr: 0 };
  for (const row of ledger?.samples || []) {
    summary.total++;
    if (row.status === 'charged') summary.charged++;
    if (row.status === 'extracted') { summary.extracted++; summary.bonusCr += row.grantedCr; }
    if (row.status === 'lost') summary.lost++;
  }
  return summary;
}
