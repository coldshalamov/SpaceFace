// Extraction experiment (PQ-133.10b).
// Cash out at a ten-wave boundary or keep the run. No UI; a bus request or
// this helper asks the run machine to end as extracted.
//
// PARTIAL BANK — the same window also sells the middle seat: bank half the purse into the
// hangar chest and keep flying the rest. The banked part is spent out of the run wallet and
// stamped on run.telemetry.securedBounty (the schema-free, run-lifelong field the stake,
// threats and hangar already ride). The ending adds the secured part once and applies its
// fraction to the remaining bankable credits. An explicit retirement keeps the secured
// part and forgoes the remainder.

import { isExtractionWindow } from '../data/survivalWaves.js';
import { PARTIAL_BANK_FRACTION } from '../data/swarmHangar.js';

export { isExtractionWindow };

export function canExtract(run) {
  if (!run || typeof run !== 'object') return false;
  if (run.kind !== 'survival') return false;
  if (run.phase !== 'cleanup' && run.phase !== 'refit') return false;
  return isExtractionWindow(run.wave);
}

/**
 * Ask the live run to cash out. Emits run:extractionRequested when a bus is
 * present; tests can also emit that event directly.
 */
export function requestSurvivalExtraction(bus) {
  if (!bus || typeof bus.emit !== 'function') return false;
  bus.emit('run:extractionRequested', {});
  return true;
}

/** Salvage already banked out of this run's purse, or 0. Never goes back on the table. */
export function securedBountyOf(run) {
  const telemetry = run && typeof run === 'object' ? run.telemetry : null;
  const secured = Number(telemetry && telemetry.securedBounty);
  return Number.isFinite(secured) && secured > 0 ? Math.trunc(secured) : 0;
}

export function nonBankableRunCredits(run) {
  const credits = run?.telemetry?.nonBankableCredits;
  return Number.isSafeInteger(credits) && credits > 0 ? credits : 0;
}

/** Opening funds and armory resale stay spendable for the life of the run. */
export function bankableRunCredits(run, credits = run?.credits) {
  const purse = Number.isFinite(Number(credits)) ? Math.max(0, Math.round(Number(credits))) : 0;
  return Math.max(0, purse - nonBankableRunCredits(run));
}

/**
 * The "bank half, keep flying" offer for the run as it stands, or null when the offer is
 * not on the table: the window gate is extraction's own, and an empty purse — or one too
 * thin to halve into a whole credit — is an honest refusal, never a dead button.
 */
export function partialBankOffer(run) {
  if (!canExtract(run)) return null;
  const purse = Number.isInteger(run.credits) && run.credits > 0 ? run.credits : 0;
  const amount = Math.floor(bankableRunCredits(run) * PARTIAL_BANK_FRACTION);
  if (amount <= 0) return null;
  return { amount, remaining: purse - amount, purse };
}

/**
 * Ask the live run to bank PARTIAL_BANK_FRACTION of its purse and keep flying. Emits
 * run:partialBankRequested; survivalRun validates the window and owns the spend.
 */
export function requestSurvivalPartialBank(bus) {
  if (!bus || typeof bus.emit !== 'function') return false;
  bus.emit('run:partialBankRequested', {});
  return true;
}
