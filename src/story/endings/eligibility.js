// Explainable dispositions, not a morality scalar. The player chooses among earned doors.
import { readLifeLedger } from './lifeLedger.js';
import { ENDING_IDS, ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN, SANDBOX_ID, endingDef, isSandboxId } from './endingDefs.js';
import { freeze } from './value.js';
export const TOW_CLASS_MIN = 'medium'; // retained public vocabulary; no universal equipment tax
export const snapshotEndingFacts = readLifeLedger;
const unmet = (code, text, detail = {}) => ({ code, text, ...detail });

export function evaluateSharedGate(facts) {
  const missing = [];
  if (!facts.readyByHistory) missing.push(unmet('history',
    'Finish the Deep Reach operation, or bring the ledger after three kinds of substantial recorded work.',
    { have: facts.careerEvidence || [], alternative: 'ledger + three career evidence categories' }));
  if (!facts.deskVisited) missing.push(unmet('desk', 'Visit the Ashfall desk. A career is not filed from a distant menu.'));
  if (facts.endgameResolved) missing.push(unmet('already_resolved', 'Final disposition already filed.'));
  return { ok: missing.length === 0, unmet: missing,
    need: { history: 'Deep Reach completion OR ledger + three career categories', desk: true } };
}

function specific(facts, def) {
  const missing = [];
  if (def.id === 'A') {
    if (facts.scnRep < ENDGAME_REP_MIN) missing.push(unmet('concord_standing',
      `Concord standing must be at least ${ENDGAME_REP_MIN}; your recorded standing is ${facts.scnRep}.`,
      { need: ENDGAME_REP_MIN, have: facts.scnRep }));
    // An actual record of service or an administrable stake. Selecting an origin alone earns neither.
    const commissionStake = facts.netWorthCr >= ENDGAME_NET_WORTH_CR && facts.worldStake;
    if (!commissionStake && facts.lawfulContracts < 3) missing.push(unmet('commission_record',
      'Bring a 100,000 cr net-worth proxy and a world stake, or three retained patrol, bounty, or escort completions.',
      { have: facts.lawfulContracts, need: 3 }));
  }
  if (def.id === 'B') {
    const trusted = facts.freeRep >= ENDGAME_REP_MIN || facts.quietRep >= ENDGAME_REP_MIN;
    const routingRecord = facts.smuggledValue > 0 || facts.routeContracts >= 3 || (trusted && facts.tradeCount >= 3);
    if (!routingRecord) missing.push(unmet('routing_record',
      'The Quiet needs recorded freight: smuggled value, three completed route contracts, or trusted standing and three trades.'));
  }
  if (['A', 'B', 'C', 'D', 'E'].includes(def.id) && !facts.inAshfall) {
    missing.push(unmet('sector', 'Be in Ashfall Reach.'));
  }
  if (def.id === 'C') {
    if (!facts.fullLoad) missing.push(unmet('full_load', facts.cargoFillKnown
      ? 'Hold a full cargo load (at least 95% of volume).' : 'Cargo occupancy is not recorded. Recompute the live hold before an unfiled jump.'));
    if (!facts.noActiveMissions) missing.push(unmet('no_missions', 'Close all active contracts before the unfiled jump.'));
  }
  if (def.id === 'D' && !facts.hasLedger) missing.push(unmet('cargo:cmdty_personal_ledger',
    'Take and retain the Kurtz ledger. A remembered flag alone is not custody.'));
  return missing;
}

function evaluateWithFacts(facts, id) {
  const def = endingDef(id);
  if (!def) return { id, eligible: false, unmet: [unmet('unknown', 'Unknown disposition.')], def: null, facts };
  const missing = [...evaluateSharedGate(facts).unmet, ...specific(facts, def)];
  if (def.id === 'E') {
    // Unavailable alternatives are not invisible prerequisites. Do not demand a decline of a door
    // the UI cannot present. E still requires a deliberate choice/confirmation, never auto-resolves.
    for (const other of ['A', 'B', 'C', 'D']) {
      if (!specific(facts, endingDef(other)).length && !facts.declined.includes(other)) {
        missing.push(unmet(`decline:${other}`, `Decline ${endingDef(other).title} first.`, { choice: other }));
      }
    }
  }
  return { id: def.id, eligible: missing.length === 0, unmet: missing, def, facts };
}
export const evaluateEndingEligibility = (state, id) => evaluateWithFacts(readLifeLedger(state), id);
export function listEndingEligibility(state) {
  const facts = readLifeLedger(state);
  return [...ENDING_IDS, SANDBOX_ID].map(id => evaluateWithFacts(facts, id));
}
export const listEligibleEndingIds = state => listEndingEligibility(state).filter(r => r.eligible && !isSandboxId(r.id)).map(r => r.id);
export const listBoardEligibleEndingIds = state => listEndingEligibility(state).filter(r => r.eligible && r.def.boardEligible).map(r => r.id);
export const listUniqueEndingIds = () => ENDING_IDS.slice();
export const isChoiceECourierReady = (state, stationId) => stationId === 'station_ashcache' && evaluateEndingEligibility(state, 'E').eligible;

/** A recommendation with receipts, never a forced ending and never an authority claim. */
export function assessEndingHistory(state) {
  const rows = listEndingEligibility(state), f = rows[0].facts;
  const reasons = {
    A: [`Concord standing ${f.scnRep}`, `${f.lawfulContracts} retained service contracts`],
    B: [`${f.tradeCount} trades`, `${f.smuggledValue} cr recorded smuggled value`],
    C: ['Unfiled departure is physically available; it does not erase a life'],
    D: [`${f.archiveSources.length} verified archive sources`, `${f.explicitMercyCount} explicit mercy records`, `Lung outcome: ${f.lungOutcome || 'unrecorded'}`],
    E: ['Working-pilot settlement; no title and no moral absolution'],
  };
  // Lexicographic, published priorities rather than hidden interchangeable virtue points.
  const preference = f.lungOutcome === 'rescue' || f.archiveSources.length >= 2 || f.explicitMercyCount > 0
    ? ['D', 'A', 'B', 'E', 'C']
    : f.smuggledValue > 0 ? ['B', 'A', 'D', 'E', 'C']
      : f.lawfulContracts >= 3 ? ['A', 'D', 'B', 'E', 'C'] : ['E', 'D', 'B', 'A', 'C'];
  const available = rows.filter(r => r.eligible && !isSandboxId(r.id)).map(r => r.id);
  const recommended = preference.find(id => available.includes(id)) || null;
  return freeze({ schema: 'spaceface.endingAssessment.v1', recommended,
    available, unresolved: !f.endgameResolved,
    rows: rows.map(r => ({ id: r.id, title: r.def.title, eligible: r.eligible, unmet: r.unmet,
      evidence: reasons[r.id] || ['Explicit non-ending continuation'] })),
    warning: 'Recommendation describes the retained record. It does not choose for the captain.',
    evidence: f.evidence,
  });
}
