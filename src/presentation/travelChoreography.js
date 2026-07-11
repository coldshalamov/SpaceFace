// Professional travel/jump presentation vocabulary.
// Pure/headless: this module classifies shipped receipts; it never owns travel state.

export const TRAVEL_CHOREOGRAPHY_PHASES = Object.freeze([
  'cruise',
  'approach',
  'alignment',
  'commit',
  'continuity',
  'arrival',
  'discovery',
  'disruption',
  'recovery',
  'aftermath',
]);

export const TRAVEL_PRESENTATION_CUE_IDS = Object.freeze([
  'travel.cruise.charging',
  'travel.cruise.engaged',
  'travel.cruise.cancelled',
  'travel.cruise.interrupted',
  'travel.gate.approach',
  'travel.corridor.continuity',
  'travel.jump.aligning',
  'travel.jump.commit_window',
  'travel.jump.committed',
  'travel.transition.continuity',
  'travel.arrival.oriented',
  'travel.arrival.sector_identity',
  'travel.discovery.mapped',
  'travel.interdiction.triggered',
  'travel.jump.failed',
  'travel.recovery.resumed',
  'travel.aftermath.clear',
  'travel.aftermath.contested',
]);

const PALETTE_FILL_TAG = Object.freeze({
  0x4ad8ff: 'palette_core',
  0xffb13d: 'palette_belt',
  0xffaa66: 'palette_fringe',
  0x4ddc92: 'palette_anomaly',
});

export function cruiseDropCueId(reason) {
  return reason === 'manual' ? 'travel.cruise.cancelled' : 'travel.cruise.interrupted';
}

export function jumpFailureTag(reason) {
  const value = typeof reason === 'string' && reason ? reason : 'unknown';
  if (value === 'combat_lock' || value === 'damage') return `interrupted_${value}`;
  if (value === 'choice_c_declined') return 'declined';
  return `rejected_${value}`;
}

export function sectorPaletteTag(sector) {
  const fill = sector && sector.palette && sector.palette.fill;
  return PALETTE_FILL_TAG[fill] || 'palette_core';
}

export function arrivalHeading(payload) {
  const heading = payload && payload.entryPoint && payload.entryPoint.heading;
  return Number.isFinite(heading) ? heading : 0;
}

export function travelSequence(fromSectorId, toSectorId, via = 'travel') {
  return `${fromSectorId || 'unknown'}>${toSectorId || 'unknown'}:${via || 'travel'}`;
}

export function validateTravelChoreography() {
  const issues = [];
  const phases = new Set(TRAVEL_CHOREOGRAPHY_PHASES);
  if (phases.size !== TRAVEL_CHOREOGRAPHY_PHASES.length) issues.push('travel phases must be unique');
  const ids = new Set(TRAVEL_PRESENTATION_CUE_IDS);
  if (ids.size !== TRAVEL_PRESENTATION_CUE_IDS.length) issues.push('travel cue ids must be unique');
  for (const id of ids) {
    if (!/^travel\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(id)) {
      issues.push(`invalid travel cue id: ${id}`);
    }
  }
  return { ok: issues.length === 0, issues };
}
