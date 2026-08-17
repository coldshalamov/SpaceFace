// Plan 53 — first-scan planet archetype pages.
//
// Scanner already owns the durable signal ledger. These helpers only project the first earned
// Plan 23 body signal for each archetype into Codex copy; they never manufacture scan progress.
import { PLANET_STATE_ASSIGNMENTS, PLANET_STATE_DEFS } from './planetStates.js';

const COPY = Object.freeze({
  planet_state_shatterstone: Object.freeze({
    body: 'A scorched crust split deeply enough to show the mantle working below. Distress traffic tends to collect along the fracture web, where a failed approach leaves very little margin.',
    note: 'Working read: cross the debris ring gently, then search the cooler seams for DMC beacons and exotic material.',
  }),
  planet_state_vestas_burn: Object.freeze({
    body: 'The bright edge is a moving fire front, not a sunrise. Soot bands hide the worst thermal gradients, while flare spikes mark fresh material thrown clear of the atmosphere.',
    note: 'Working read: treat the orange limb as a heat warning; refined alloy cinders survive beyond the active front.',
  }),
  planet_state_razor_ring: Object.freeze({
    body: 'Its ring is pulverized ice and wreck grit held in a fast, tilted plane. The polar glow makes the crown easy to see and the crossing speed easy to underestimate.',
    note: 'Working read: enter along the ring plane only when committed. Crystalline seams and old hulls share the same dangerous orbit.',
  }),
  planet_state_reach_scrawl: Object.freeze({
    body: 'Reach crews use the dead surface as a public ledger: gang sigils, ace tallies, and challenges cut large enough to read from orbit. A fresh mark is often an invitation with guns behind it.',
    note: 'Working read: the tags name local authority. Expect the named ace to answer a challenge before any bounty clerk does.',
  }),
});

const ASSIGNMENTS_BY_STATE = new Map();
for (const assignment of PLANET_STATE_ASSIGNMENTS) {
  const rows = ASSIGNMENTS_BY_STATE.get(assignment.stateId) || [];
  rows.push(assignment);
  ASSIGNMENTS_BY_STATE.set(assignment.stateId, rows);
}

function scanRecordForAssignment(signalInvestigation, assignment) {
  const record = signalInvestigation && signalInvestigation.records
    && signalInvestigation.records[assignment.scannerSignal.id];
  if (!record || record.sourceId !== assignment.bodyId || record.sectorId !== assignment.sectorId) return null;
  return record;
}

export const CODEX_PLANET_ARCHETYPES = Object.freeze(
  Object.values(PLANET_STATE_DEFS).map((definition, order) => Object.freeze({
    id: definition.id,
    order,
    title: definition.label,
    baseType: definition.baseType,
    body: COPY[definition.id].body,
    note: COPY[definition.id].note,
  })),
);

export function codexPlanetArchetypePages(state = {}) {
  const signalInvestigation = state && state.signalInvestigation || {};
  const recordOrder = new Map(Object.keys(signalInvestigation.records || {})
    .map((signalId, index) => [signalId, index]));
  const pages = [];
  for (const entry of CODEX_PLANET_ARCHETYPES) {
    const assignments = ASSIGNMENTS_BY_STATE.get(entry.id) || [];
    let earned = null;
    for (const assignment of assignments) {
      const record = scanRecordForAssignment(signalInvestigation, assignment);
      if (!record) continue;
      if (!earned || Number(record.firstSeenAt) < Number(earned.record.firstSeenAt)
        || (Number(record.firstSeenAt) === Number(earned.record.firstSeenAt)
          && recordOrder.get(record.id) < recordOrder.get(earned.record.id))) {
        earned = { assignment, record };
      }
    }
    if (!earned) continue;
    pages.push(Object.freeze({
      ...entry,
      sourceId: earned.assignment.bodyId,
      sectorId: earned.assignment.sectorId,
      scannedAt: Number(earned.record.firstSeenAt) || 0,
      meta: `Planet survey / ${entry.baseType} / ${earned.assignment.bodyId.replace(/^planet_/, '').replaceAll('_', ' ')}`,
    }));
  }
  return pages;
}
