// Store-page sentence (PQ-163.03). One line, shown once at rescue start, then silence.
// Copy lives in this module. Pure data + funnel helpers. No DOM, no Three.js.

export const STORE_SENTENCE = 'Light ships are ammunition. Swing a rock. Keep the speed.';

export const STORE_SENTENCE_WINDOW_S = 600;

// Leftover rail already performs these. This leaf only stamps them.
export const STORE_CLAUSES = Object.freeze(['swing', 'ammunition', 'speed']);

export const STORE_CLAUSE_FROM_LEFTOVER = Object.freeze({
  swing: 'swing',
  shove: 'ammunition',
  boost: 'speed',
});

export function storeSentenceLine() {
  return STORE_SENTENCE;
}

export function freshStoreSentenceState() {
  const clauses = {};
  for (const key of STORE_CLAUSES) {
    clauses[key] = { performed: false, atS: null };
  }
  return {
    shown: false,
    shownAt: null,
    line: STORE_SENTENCE,
    clauses,
  };
}

export function buildFirstHourSentenceEvent(atS) {
  return {
    type: 'firsthour:sentence',
    shown: true,
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
  };
}

export function stampStoreClause(record, leftoverKey, atS) {
  if (!record || !record.clauses) return false;
  const clause = STORE_CLAUSE_FROM_LEFTOVER[leftoverKey];
  if (!clause) return false;
  const slot = record.clauses[clause];
  if (!slot || slot.performed) return false;
  const t = Number(atS);
  slot.performed = true;
  slot.atS = Number.isFinite(t) ? t : 0;
  return true;
}

export function storeClausePerformedBefore(record, clause, limitS = STORE_SENTENCE_WINDOW_S) {
  const slot = record && record.clauses && record.clauses[clause];
  if (!slot || !slot.performed) return false;
  const t = Number(slot.atS);
  const limit = Number(limitS);
  return Number.isFinite(t) && Number.isFinite(limit) && t < limit;
}

export function allStoreClausesPerformedBefore(record, limitS = STORE_SENTENCE_WINDOW_S) {
  return STORE_CLAUSES.every((clause) => storeClausePerformedBefore(record, clause, limitS));
}
