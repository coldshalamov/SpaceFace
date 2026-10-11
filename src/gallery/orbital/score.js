// Local arcade ledger. Never writes credits, cargo, reputation, or the save envelope.

export const GALLERY_LEDGER_SCHEMA = 'spaceface.orbitalGalleryLedger.v1';

export function createLedger() {
  return {
    schema: GALLERY_LEDGER_SCHEMA,
    best: Object.create(null),
    attempts: Object.create(null),
  };
}

/**
 * Time left pays the clock. Style pays a clean contact count and a seeded
 * constellation chip (0–6) drawn once from state.rng. The chip cannot decide
 * a win; it only breaks ties between equally clean runs of the same seed.
 */
export function scoreRun({ winTick, limitTicks, boostTicks = 0, contacts = 0, cuts = 0, styleChip = 0 }) {
  const chip = Math.max(0, Math.min(6, Math.floor(Number(styleChip) * 7) || 0));
  if (!Number.isFinite(winTick)) {
    return { won: false, total: 0, time: 0, style: chip, chip, contacts, boostTicks, cuts };
  }
  const time = Math.max(0, (limitTicks | 0) - (winTick | 0));
  const style = Math.max(0, 480 - contacts * 6 - boostTicks * 2 + cuts * 20) + chip;
  return {
    won: true,
    total: time + style,
    time,
    style,
    chip,
    contacts,
    boostTicks,
    cuts,
    winTick,
  };
}

export function recordScore(ledger, scenarioId, score) {
  if (!ledger || !scenarioId || !score) return ledger;
  ledger.attempts[scenarioId] = (ledger.attempts[scenarioId] || 0) + 1;
  const prev = ledger.best[scenarioId];
  if (!prev || score.total > prev.total) ledger.best[scenarioId] = { ...score };
  return ledger;
}
