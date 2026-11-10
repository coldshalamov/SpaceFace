// deniableAftermath.js - C11 follow-ups: the deniable ambush has a next beat (THE WORLD ANSWERS).
//
// Same grammar as the PQ-149.01 escalation seeds in encounterDirector (a cause-cited row with a
// station place, a seededAt/dueAt stamp and a bounded ring), but kept in its OWN lazy ledger,
// `encounterDirector.stats.deniableAftermath.seeds`: the tactical director reads the escalation
// ring for bounty/ace/shortage/rumor beats and must never mistake a fence's grudge for one.
//
//   burned      - the player survived the drop: the fence who sold the job is burned. Its deniable
//                 offers are suppressed for BURN_EPOCHS board epochs, and the next dock at that
//                 station hears the job was a setup.
//   emboldened  - the ambush landed (cargo lost / pilot down): the ambushers grow bold. A deniable
//                 offer at that station rolls EMBOLDEN_BONUS higher for EMBOLDEN_EPOCHS epochs
//                 (the total chance stays capped at 1), and the next dock hears the fence is
//                 "moving a lot of marked cargo".
//
// PURE: no state writes except the explicit plant/prune helpers, which the director calls. The
// ledger key is created lazily and removed when empty, so a run that never takes a deniable job
// serializes byte-identically to before.

import { MISSION_TUNING } from './missions.js';

export const DENIABLE_BURN_EPOCHS = 4;        // fence offers suppressed this many board epochs
export const DENIABLE_EMBOLDEN_EPOCHS = 4;    // bolder ambush odds last this many board epochs
export const DENIABLE_EMBOLDEN_BONUS = 0.2;   // added to the rolled ambush chance (total capped at 1)
export const DENIABLE_AFTERMATH_CAP = 8;      // bounded ring (oldest evicted)
export const DENIABLE_CLEAN_REP = 2;          // quiet thanks: faction:repDelta for a clause-free delivery

export const DENIABLE_BEATS = Object.freeze(['burned', 'emboldened']);

export const DENIABLE_CLEAN_BARK = 'Clean drop. No questions asked, none owed. Come back when you need work.';

export function deniableBurnedRumor(stationName) {
  return `Word at ${stationName}: that off-the-books job was a setup, and the fence knows you know.`;
}

export function deniableEmboldenedRumor(stationName) {
  return `The fence at ${stationName} is moving a lot of marked cargo \u2014 somebody out there has grown bold.`;
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean || null;
}

/** Board epoch for the state: the same simTime / refreshSec the contract board counts in. */
export function deniableBoardEpoch(state) {
  const cfg = (state && state.missions && state.missions.config) || MISSION_TUNING;
  const step = Number(cfg && cfg.refreshSec) > 0 ? Number(cfg.refreshSec) : 600;
  return Math.floor((Number(state && state.simTime) || 0) / step);
}

export function sanitizeDeniableSeed(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const beat = text(raw.beat);
  const stationId = text(raw.stationId);
  const untilEpoch = finite(raw.untilEpoch);
  if (!DENIABLE_BEATS.includes(beat) || !stationId || untilEpoch == null) return null;
  const causeId = text(raw.causeId) || 'anon';
  const seededAt = finite(raw.seededAt) || 0;
  const row = {
    id: text(raw.id) || `deniable:${beat}:${causeId}`,
    cause: 'deniable',
    beat,
    causeId,
    stationId,
    sectorId: text(raw.sectorId),
    factionId: text(raw.factionId),
    seededAt,
    untilEpoch: Math.floor(untilEpoch),
    rumorPending: raw.rumorPending === true,
  };
  if (beat === 'emboldened') {
    const bonus = finite(raw.bonus);
    row.bonus = bonus != null && bonus > 0 ? Math.min(1, bonus) : DENIABLE_EMBOLDEN_BONUS;
  }
  return row;
}

/** The live seed rows of a state (or of a director bag): sanitized, never the stored objects. */
export function deniableSeedsOf(stateOrDir) {
  const dir = stateOrDir && stateOrDir.encounterDirector ? stateOrDir.encounterDirector : stateOrDir;
  const rows = dir && dir.stats && dir.stats.deniableAftermath && dir.stats.deniableAftermath.seeds;
  return Array.isArray(rows) ? rows.map(sanitizeDeniableSeed).filter(Boolean) : [];
}

/** True while a burned seed names this station and the epoch is inside its window. */
export function isFenceBurned(state, stationId, epoch) {
  if (!stationId) return false;
  return deniableSeedsOf(state).some((s) => s.beat === 'burned' && s.stationId === stationId && epoch < s.untilEpoch);
}

/** Sum of the live emboldened bonuses at this station (0 when none). */
export function emboldenedBonus(state, stationId, epoch) {
  if (!stationId) return 0;
  let total = 0;
  for (const s of deniableSeedsOf(state)) {
    if (s.beat === 'emboldened' && s.stationId === stationId && epoch < s.untilEpoch) total += s.bonus;
  }
  return total;
}

/** Final ambush chance: the heat-level base plus the station's emboldened bonus, capped at 1. */
export function boldAmbushChance(baseChance, bonus) {
  return Math.min(1, Math.max(0, Number(baseChance) || 0) + Math.max(0, Number(bonus) || 0));
}

function ledgerOf(dir, create) {
  if (!dir || typeof dir !== 'object' || !dir.stats || typeof dir.stats !== 'object') return null;
  let ledger = dir.stats.deniableAftermath;
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || !Array.isArray(ledger.seeds)) {
    if (!create) return null;
    ledger = dir.stats.deniableAftermath = { seeds: [] };
  }
  return ledger;
}

/** Drop expired rows (and the whole key when none remain). Returns the live rows. */
export function pruneDeniableSeeds(dir, epoch) {
  const ledger = ledgerOf(dir, false);
  if (!ledger) return [];
  const live = ledger.seeds.map(sanitizeDeniableSeed).filter(Boolean)
    .filter((s) => epoch < s.untilEpoch || s.rumorPending)
    .slice(-DENIABLE_AFTERMATH_CAP);
  if (live.length) ledger.seeds = live;
  else delete dir.stats.deniableAftermath;
  return live;
}

/**
 * Plant one seed (idempotent per id). Returns the planted row, or null when the id already
 * exists. The ring is bounded; the oldest row is evicted first.
 */
export function plantDeniableSeed(dir, raw, epoch) {
  const row = sanitizeDeniableSeed(raw);
  if (!row) return null;
  pruneDeniableSeeds(dir, epoch);
  const ledger = ledgerOf(dir, true);
  if (ledger.seeds.some((s) => s && s.id === row.id)) return null;
  ledger.seeds.push(row);
  if (ledger.seeds.length > DENIABLE_AFTERMATH_CAP) {
    ledger.seeds.splice(0, ledger.seeds.length - DENIABLE_AFTERMATH_CAP);
  }
  return row;
}
