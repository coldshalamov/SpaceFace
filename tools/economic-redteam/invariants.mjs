// Metamorphic invariants for the red team.
// Credits are NOT globally conserved: missions, legal scrap, and loans are
// allowed sources. A closed dock round-trip and an illicit salvage-bay cash-in
// are not.

const ALLOWED_GAIN_PREFIXES = [
  'mission:',
  'collateral_refund:',
  'story:',
  'service:loan',
  'service:redeem_rights',
];

export function isAllowedGainReason(reason) {
  if (typeof reason !== 'string' || !reason) return false;
  if (reason === 'salvage:bay_sale') return true;
  if (reason.startsWith('trade:sell:')) return true;
  return ALLOWED_GAIN_PREFIXES.some((prefix) => reason === prefix || reason.startsWith(prefix));
}

export function sumUnits(bag) {
  let total = 0;
  if (!bag) return 0;
  for (const id of Object.keys(bag)) total += Math.floor(Number(bag[id]) || 0);
  return total;
}

/** Same-station buy then sell restored stock and emptied the new cargo. */
export function closedWashVerdict({ creditsDelta, stockDelta, cargoDelta } = {}) {
  if (![creditsDelta, stockDelta, cargoDelta].every(Number.isFinite)) return { kind: 'invalid_evidence', exploit: false };
  const restored = Math.abs(stockDelta) < 1e-6 && cargoDelta === 0;
  if (!restored) return { kind: 'open_route', exploit: false };
  if ((Number(creditsDelta) || 0) > 0) return { kind: 'closed_wash', exploit: true };
  return { kind: 'closed_loss_or_flat', exploit: false };
}

/**
 * Salvage-bay scrap of a legal commodity is an allowed source.
 * Scrap of contraband/illegal/restricted without a matching fine is laundering.
 */
export function bayCashVerdict({ creditsDelta, legality, fineDelta } = {}) {
  if (![creditsDelta, fineDelta].every(Number.isFinite)
    || !['legal', 'contraband', 'illegal', 'restricted'].includes(legality)) return { kind: 'invalid_evidence', exploit: false };
  const paid = (Number(creditsDelta) || 0) > 0;
  const illicit = legality && legality !== 'legal';
  if (!illicit) return { kind: paid ? 'allowed_legal_scrap' : 'no_pay', exploit: false };
  if (paid && !(Number(fineDelta) < 0)) return { kind: 'contraband_bay_launder', exploit: true };
  return { kind: 'illicit_not_paid', exploit: false };
}

export function stockFloorVerdict(stock) {
  if (stock == null) return { kind: 'no_listing', exploit: false };
  if (!Number.isFinite(stock) || stock < 1) return { kind: 'stock_underflow', exploit: true };
  return { kind: 'stock_held', exploit: false };
}

export function custodyVerdict(before, after, { consumed = 0, produced = 0 } = {}) {
  const b = sumUnits(before);
  const a = sumUnits(after);
  const expected = b - consumed + produced;
  if (a > expected) return { kind: 'duplicated', exploit: true, before: b, after: a, expected };
  return { kind: 'conserved_or_consumed', exploit: false, before: b, after: a, expected };
}

/** A one-shot receipt replayed must not move the measured quantity a second time. */
export function replayVerdict({ firstDelta, secondDelta } = {}) {
  if (![firstDelta, secondDelta].every(Number.isFinite)) return { kind: 'invalid_evidence', exploit: false };
  const movedAgain = Math.abs(Number(secondDelta) || 0) > 1e-6;
  return { kind: movedAgain ? 'replay_paid' : 'replay_idempotent', exploit: movedAgain };
}

export function classifyGain({ creditsDelta, reasons, debtDelta, closedWash, illicitBay }) {
  const delta = Number(creditsDelta) || 0;
  if (delta <= 0) return 'no_gain';
  if (closedWash) return 'exploit_wash';
  if (illicitBay) return 'exploit_contraband_bay';
  const list = Array.isArray(reasons) ? reasons : [];
  if (list.some((reason) => reason === 'service:loan') && (Number(debtDelta) || 0) + 1 >= delta) {
    return 'allowed_loan';
  }
  if (list.some(isAllowedGainReason)) {
    return 'allowed_source';
  }
  return 'unclassified_gain';
}
