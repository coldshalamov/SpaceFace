// Pure, deterministic vocabulary for the professional mining presentation loop.
// This module describes shipped event authorities; it does not recreate mining gameplay.

export const MINING_CHOREOGRAPHY_VERSION = 1;

export const MINING_CHOREOGRAPHY_PHASES = Object.freeze([
  'survey',
  'seam',
  'extraction',
  'fracture',
  'core',
  'haul',
  'cargo',
  'aftermath',
  'deep_drill',
]);

export const MINING_PRESENTATION_CUE_IDS = Object.freeze([
  'mining.survey.pulse',
  'mining.survey.resolved',
  'mining.survey.classified',
  'mining.survey.tracked',
  'mining.survey.investigated',
  'mining.extraction.locked',
  'mining.seam.quality',
  'mining.seam.reward',
  'mining.fracture.anticipation',
  'mining.fracture.released',
  'mining.rich_core.exposed',
  'mining.rich_core.charge',
  'mining.rich_core.completed',
  'mining.rich_core.fizzle',
  'mining.chunk.tether_required',
  'mining.chunk.mass_engaged',
  'mining.cargo.mass_settled',
  'mining.cargo.full',
  'mining.field.aftermath',
  'mining.heat.overheated',
  'mining.vent.ready',
  'mining.yield.collected',
  'mining.drill.seismic_pulse',
  'mining.drill.contact',
  'mining.drill.break',
  'mining.drill.yield',
  'mining.drill.gas_hazard',
  'mining.drill.aborted',
  'mining.drill.retry',
]);

export function classifyDrillWarning(text) {
  const value = String(text || '');
  if (value.startsWith('DRILL OVERHEATED!') || value.startsWith('Drill cooling down')) return 'overheated';
  if (value.startsWith('Drill system cooled.')) return 'vent_ready';
  if (value.startsWith('Cargo holds are full!')) return 'cargo_full';
  return null;
}

export function fieldDepletionBand(value) {
  const depletion = clamp01(value);
  if (depletion >= 0.72) return 'depleted';
  if (depletion >= 0.42) return 'thin';
  if (depletion >= 0.12) return 'worked';
  return 'rich';
}

export function seamQualityTag(payload = {}) {
  return payload.seamHit || Number(payload.yieldMult) >= 0.99 ? 'on_seam' : 'off_seam';
}

export function drillHardnessBand(value) {
  const hardness = Math.max(0, Number(value) || 0);
  if (hardness >= 1.45) return 'hard';
  if (hardness >= 0.9) return 'firm';
  return 'soft';
}

export function validateMiningChoreography() {
  const issues = [];
  if (new Set(MINING_CHOREOGRAPHY_PHASES).size !== MINING_CHOREOGRAPHY_PHASES.length) issues.push('phase ids must be unique');
  if (new Set(MINING_PRESENTATION_CUE_IDS).size !== MINING_PRESENTATION_CUE_IDS.length) issues.push('cue ids must be unique');
  if (!MINING_PRESENTATION_CUE_IDS.every((id) => /^mining\.[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(id))) {
    issues.push('cue ids must be dotted lowercase identifiers');
  }
  return { ok: issues.length === 0, issues };
}

function clamp01(value) {
  const n = Number.isFinite(value) ? value : 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
