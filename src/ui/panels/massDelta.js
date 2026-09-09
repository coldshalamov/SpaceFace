// BP-07.1 MASS-FEEL.
//
// Pure before/after fitting readout. It splices a candidate fitting, calls the
// shipped getDerivedStats path for both sides, and reports the handling deltas a
// fitting UI can render later.
import { MODULES } from '../../data/modules.js';
import { SHIPS } from '../../data/ships.js';
import { buildSlotList, fits, getDerivedStats } from '../../systems/ships.js';

export const MASS_DELTA_METRICS = Object.freeze([
  Object.freeze({ id: 'turn', label: 'Turn', source: 'derived.turnRate', unit: 'pct', verbDown: 'sluggish', verbUp: 'twitchier' }),
  Object.freeze({ id: 'topSpeed', label: 'Top speed', source: 'derived.maxSpeed', unit: 'pct', verbDown: 'slower', verbUp: 'faster' }),
  Object.freeze({ id: 'stopDistance', label: 'Stop distance', source: 'flightModel.stopDistanceEstimate', unit: 'wu', verbDown: 'shorter stop', verbUp: 'longer stop' }),
  Object.freeze({ id: 'bank', label: 'Bank', source: 'derived.bankFactor', unit: 'raw', verbDown: 'flatter', verbUp: 'rollier' }),
  Object.freeze({ id: 'massRatio', label: 'Mass ratio', source: 'derived.mass/baseMass', unit: 'raw', verbDown: 'lighter', verbUp: 'heavier' }),
]);

const MODULE_BY_ID = new Map(MODULES.map((moduleDef) => [moduleDef.id, moduleDef]));
const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));

export function spliceCandidateFitting(shipId, beforeFittings = [], candidate = {}) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return { ok: false, reason: 'unknown_ship', fittings: [] };
  const moduleDef = MODULE_BY_ID.get(candidate.moduleId);
  if (!moduleDef) return { ok: false, reason: 'unknown_module', fittings: normalizedFittings(shipDef, beforeFittings) };
  const slots = buildSlotList(shipDef);
  const fittings = normalizedFittings(shipDef, beforeFittings);
  const explicitSlot = Number.isInteger(candidate.slotIndex);
  const slotIndex = explicitSlot ? candidate.slotIndex : slots.findIndex((slot, index) => !fittings[index] && fits(slot, moduleDef));
  if (!explicitSlot && slotIndex < 0) {
    return { ok: false, reason: 'does_not_fit', moduleId: moduleDef.id, fittings };
  }
  const slot = slots[slotIndex];
  if (!slot) return { ok: false, reason: 'unknown_slot', fittings };
  if (!fits(slot, moduleDef)) {
    return { ok: false, reason: 'does_not_fit', slotIndex, slot, moduleId: moduleDef.id, fittings };
  }
  const next = fittings.slice();
  next[slotIndex] = moduleDef.id;
  return { ok: true, reason: 'ok', slotIndex, slot, moduleId: moduleDef.id, fittings: next };
}

export function buildMassDelta(shipId, options = {}) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  const beforeFittings = normalizedFittings(shipDef, options.beforeFittings || []);
  const after = Array.isArray(options.afterFittings)
    ? { ok: true, reason: 'provided_after', fittings: normalizedFittings(shipDef, options.afterFittings) }
    : spliceCandidateFitting(shipId, beforeFittings, {
      moduleId: options.candidateModuleId,
      slotIndex: options.slotIndex,
    });
  if (!after.ok) return Object.freeze({
    shipId,
    ok: false,
    reason: after.reason,
    slotIndex: after.slotIndex,
    moduleId: after.moduleId || options.candidateModuleId || null,
    beforeFittings: Object.freeze(beforeFittings),
    afterFittings: Object.freeze(after.fittings || beforeFittings),
    metrics: Object.freeze([]),
    summary: '',
  });

  const beforeStats = summarizeStats(shipId, beforeFittings, options.player || null);
  const afterStats = summarizeStats(shipId, after.fittings, options.player || null);
  const metrics = MASS_DELTA_METRICS.map((metric) => deltaMetric(metric, beforeStats, afterStats));
  return Object.freeze({
    shipId,
    ok: true,
    reason: after.reason,
    slotIndex: after.slotIndex,
    moduleId: after.moduleId || null,
    beforeFittings: Object.freeze(beforeFittings),
    afterFittings: Object.freeze(after.fittings.slice()),
    before: Object.freeze(beforeStats),
    after: Object.freeze(afterStats),
    metrics: Object.freeze(metrics),
    summary: formatMassDelta(metrics),
  });
}

export function summarizeStats(shipId, fittings = [], player = null) {
  const shipDef = SHIP_BY_ID.get(shipId);
  if (!shipDef) return null;
  const derived = getDerivedStats(shipId, fittings, player);
  const model = derived.flightModel || {};
  const baseMass = finite(shipDef.mass, 1);
  return Object.freeze({
    turn: finite(derived.turnRate, 0),
    topSpeed: finite(derived.maxSpeed, 0),
    stopDistance: stopDistanceEstimate(model),
    bank: finite(derived.bankFactor, 0),
    massRatio: baseMass > 0 ? finite(derived.mass, baseMass) / baseMass : 1,
  });
}

export function stopDistanceEstimate(flightModel) {
  const speed = finite(flightModel && flightModel.maxSpeed, 0);
  const brake = Math.max(0, finite(flightModel && flightModel.reverseAccel, 0));
  if (speed <= 0 || brake <= 0) return 0;
  return speed * speed / (2 * brake);
}

export function formatMassDelta(metrics = []) {
  return metrics
    .filter((metric) => metric.id !== 'massRatio')
    .map((metric) => `${metric.label} ${formatDelta(metric)}`)
    .join(' · ');
}

function deltaMetric(metric, beforeStats, afterStats) {
  const before = finite(beforeStats && beforeStats[metric.id], 0);
  const after = finite(afterStats && afterStats[metric.id], 0);
  const delta = after - before;
  const pct = before !== 0 ? (delta / Math.abs(before)) * 100 : 0;
  return Object.freeze({
    id: metric.id,
    label: metric.label,
    source: metric.source,
    before: round3(before),
    after: round3(after),
    delta: round3(delta),
    pct: round2(pct),
    unit: metric.unit,
    verb: delta < 0 ? metric.verbDown : (delta > 0 ? metric.verbUp : 'unchanged'),
  });
}

function formatDelta(metric) {
  if (metric.unit === 'pct') return `${signed(round1(metric.pct))}%`;
  if (metric.unit === 'wu') return `${signed(Math.round(metric.delta))}m`;
  return signed(metric.delta);
}

function normalizedFittings(shipDef, fittings) {
  const slots = buildSlotList(shipDef);
  const out = new Array(slots.length).fill(null);
  for (let i = 0; i < slots.length; i++) out[i] = fittings && fittings[i] || null;
  return out;
}

function signed(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Object.is(n, -0)) return '0';
  return n > 0 ? `+${n}` : `${n}`;
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
  return Math.round(finite(value, 0) * 10) / 10;
}

function round2(value) {
  return Math.round(finite(value, 0) * 100) / 100;
}

function round3(value) {
  return Math.round(finite(value, 0) * 1000) / 1000;
}
