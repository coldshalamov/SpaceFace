// src/systems/stuntCombo.js — Combo meter and scoring (PQ-146.01).
//
// Pure module: turns the named-trick stream (`stunt:trickDetected` receipts, which already
// carry a verified cause chain from `src/combat/stuntTaxonomy.js`) plus plain kill receipts
// into one Crucible score. The live combo state lives in the stunt module (`state.stunts.combo`,
// owned by `src/systems/stuntGrammar.js`); the Crucible results surface reads it through
// `comboSummary()` in parallel with survivalResults, which this file never touches.
//
// Scoring law:
//   - Chain window: tricks landing within COMBO_WINDOW_TICKS of the previous trick extend the
//     active chain; each step raises the chain multiplier by CHAIN_STEP up to MAX_CHAIN_MULT.
//   - Rarity multiplier: common 1x, uncommon 1.5x, rare 2x, legendary 3x.
//   - Mass multiplier: heavier hurled masses (and harder momentum exchange) pay up to 2x.
//   - Banked on quiet: when COMBO_BANK_QUIET_TICKS pass with no new trick, the active chain
//     banks into the run total. Banking is idempotent and tick-driven (no wall clock, no RNG).
//   - Gun kills pay flat (GUN_KILL_SCORE) with no multiplier and no chain. The free Pulse
//     (energy_baseline starter) pays even less (PULSE_KILL_SCORE): a physics run of equal
//     kills outscores a gun run by a multiple, and Pulse spam can never top a trick board.
//     Pulse damage itself is NOT nerfed here — scoring only (PQ-174.02 owns damage).
//
// All math is deterministic: finite-number coercion, min/max clamps, integer rounding once
// per trick at record time.
//
// PQ-155.03 — stunts pay reputation and salvage rights, never raw credits. Combo score
// stays a Crucible board figure. Trick pay is a separate ledger on the same combo state.

import { TRICK_DEFINITIONS } from '../combat/stuntTaxonomy.js';

/** Pitborn yards buy wrecks and issue the paper. Style standing lands here. */
export const STUNT_PAY_FACTION_ID = 'faction_pitborn';

export const STUNT_REP_BY_RARITY = Object.freeze({
  common: 3,
  uncommon: 6,
  rare: 9,
  legendary: 15,
});

export const STUNT_SALVAGE_RIGHTS_BY_RARITY = Object.freeze({
  common: 1,
  uncommon: 1,
  rare: 2,
  legendary: 3,
});

export const STUNT_COMBO_SCHEMA_VERSION = 1;

// Chain window: 5 seconds at 60 Hz. A trick inside the window extends the chain.
export const COMBO_WINDOW_TICKS = 300;
// Quiet period that banks the active chain into the run total: 6 seconds at 60 Hz.
export const COMBO_BANK_QUIET_TICKS = 360;

export const RARITY_MULT = Object.freeze({
  common: 1,
  uncommon: 1.5,
  rare: 2,
  legendary: 3,
});

export const CHAIN_STEP = 0.25;
export const MAX_CHAIN_MULT = 4;

// Reference hurled mass in tonnes. At or below it the mass factor is 1x; at 3x the
// reference (or harder momentum exchange) it caps at 2x.
export const MASS_REFERENCE_TONNES = 20;
export const MAX_MASS_MULT = 2;

// Flat kill pay. Deliberately an order of magnitude below a chained trick so that equal
// kill counts always favor physics play, without touching gun damage anywhere.
export const GUN_KILL_SCORE = 60;
export const PULSE_KILL_SCORE = GUN_KILL_SCORE;

// The free Pulse kit (energy_baseline) and its unique twin. Kills credited to these
// weapon ids pay PULSE_KILL_SCORE. Anything unknown pays the plain gun rate — never zero,
// never a trick.
export const PULSE_WEAPON_IDS = Object.freeze([
  'wpn_pulse_laser_s',
  'wpn_pulse_laser_m',
  'unique_mirrorjaw_pulse',
]);

const LAST_TRICKS_KEPT = 8;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function tickOf(value, fallback = 0) {
  const n = Math.floor(finite(value, fallback));
  return n >= 0 ? n : fallback;
}

/** True when the killing blow is credited to the free Pulse kit. */
export function isPulseWeapon(weaponId) {
  if (typeof weaponId !== 'string' || weaponId.length === 0) return false;
  return PULSE_WEAPON_IDS.includes(weaponId);
}

/** Flat score for one plain (trickless) kill. Pulse pays less; nothing else multiplies. */
export function killPoints(weaponId) {
  return isPulseWeapon(weaponId) ? PULSE_KILL_SCORE : GUN_KILL_SCORE;
}

/**
 * Reputation and salvage-rights pay for one named trick. Credits are always 0 —
 * a stunt is never a credit faucet (PQ-155.03).
 */
export function trickPay(trick) {
  if (!trick || typeof trick !== 'object') {
    return { reputation: 0, salvageRights: 0, credits: 0, factionId: STUNT_PAY_FACTION_ID };
  }
  const rarity = trick.rarity;
  const reputation = STUNT_REP_BY_RARITY[rarity] != null
    ? STUNT_REP_BY_RARITY[rarity]
    : STUNT_REP_BY_RARITY.common;
  const salvageRights = STUNT_SALVAGE_RIGHTS_BY_RARITY[rarity] != null
    ? STUNT_SALVAGE_RIGHTS_BY_RARITY[rarity]
    : STUNT_SALVAGE_RIGHTS_BY_RARITY.common;
  return {
    reputation,
    salvageRights,
    credits: 0,
    factionId: STUNT_PAY_FACTION_ID,
  };
}

/** Run pay snapshot. Credits are forced to 0 even if a caller stamped the field. */
export function comboPay(comboState) {
  const combo = ensureCombo(comboState);
  return {
    reputation: Math.max(0, Math.floor(finite(combo.reputation, 0))),
    salvageRights: Math.max(0, Math.floor(finite(combo.salvageRights, 0))),
    credits: 0,
    factionId: STUNT_PAY_FACTION_ID,
  };
}

/**
 * Mass multiplier for one trick receipt: 1x at or below the reference hurled mass,
 * scaling linearly to 2x at 3x reference. Momentum exchange (momentum / exchangedMomentum)
 * contributes the same way when no mass was recorded, so shove-driven chains without a
 * latched mass still pay for the hit. Pure and deterministic.
 */
export function massFactor(trick) {
  const metrics = (trick && trick.metrics && typeof trick.metrics === 'object') ? trick.metrics : {};
  const mass = finite(metrics.mass, 0);
  const momentum = Math.max(0, finite(metrics.momentum), finite(metrics.exchangedMomentum));
  let ratio = 0;
  if (mass > 0) {
    ratio = mass / MASS_REFERENCE_TONNES;
  } else if (momentum > 0) {
    // 1500 kg*m/s of exchange ~ a reference-mass throw; matches the moment rater's scale.
    ratio = momentum / 1500;
  } else {
    const speed = Math.max(
      0,
      finite(metrics.relSpeed),
      finite(metrics.deltaV),
      finite(metrics.speed),
      finite(metrics.tangentialSpeed),
    );
    ratio = speed / 60;
  }
  if (!(ratio > 0)) return 1;
  const scaled = 1 + (Math.min(ratio, 3) - 1) * (1 / (3 - 1));
  return Math.min(MAX_MASS_MULT, Math.max(1, scaled));
}

/** Rarity multiplier for one trick receipt. Unknown rarity pays common. */
export function rarityFactor(trick) {
  const rarity = trick && trick.rarity;
  const mult = RARITY_MULT[rarity];
  return typeof mult === 'number' ? mult : RARITY_MULT.common;
}

/** Chain multiplier for the trick at 1-based position `chainLength` in the active chain. */
export function chainFactor(chainLength) {
  const len = Math.max(1, Math.floor(finite(chainLength, 1)));
  return Math.min(MAX_CHAIN_MULT, 1 + CHAIN_STEP * (len - 1));
}

/**
 * Points for one trick receipt at its position in the active chain.
 * baseScore comes from the taxonomy definition (falls back to the receipt's own
 * baseScore so unknown future tricks still score instead of vanishing).
 */
export function trickPoints(trick, chainLength) {
  if (!trick || typeof trick !== 'object') return 0;
  const def = TRICK_DEFINITIONS[trick.trickId];
  const base = finite(trick.baseScore, def ? finite(def.baseScore, 100) : 100);
  if (!(base > 0)) return 0;
  return Math.max(1, Math.round(base * rarityFactor(trick) * massFactor(trick) * chainFactor(chainLength)));
}

/** Fresh live combo state. JSON-safe; owned by stuntGrammar under state.stunts.combo. */
export function createComboState() {
  return {
    schemaVersion: STUNT_COMBO_SCHEMA_VERSION,
    banked: 0,
    activePoints: 0,
    activeCount: 0,
    lastTrickTick: -1,
    bestChain: 0,
    bestChainPoints: 0,
    trickKills: 0,
    gunKills: 0,
    pulseKills: 0,
    reputation: 0,
    salvageRights: 0,
    credits: 0,
    lastTricks: [],
  };
}

function ensureCombo(combo) {
  if (!combo || typeof combo !== 'object' || Array.isArray(combo)) return createComboState();
  if (typeof combo.banked !== 'number') combo.banked = 0;
  if (typeof combo.activePoints !== 'number') combo.activePoints = 0;
  if (typeof combo.activeCount !== 'number') combo.activeCount = 0;
  if (typeof combo.lastTrickTick !== 'number') combo.lastTrickTick = -1;
  if (typeof combo.bestChain !== 'number') combo.bestChain = 0;
  if (typeof combo.bestChainPoints !== 'number') combo.bestChainPoints = 0;
  if (typeof combo.trickKills !== 'number') combo.trickKills = 0;
  if (typeof combo.gunKills !== 'number') combo.gunKills = 0;
  if (typeof combo.pulseKills !== 'number') combo.pulseKills = 0;
  if (typeof combo.reputation !== 'number') combo.reputation = 0;
  if (typeof combo.salvageRights !== 'number') combo.salvageRights = 0;
  combo.credits = 0;
  if (!Array.isArray(combo.lastTricks)) combo.lastTricks = [];
  combo.schemaVersion = STUNT_COMBO_SCHEMA_VERSION;
  return combo;
}

function pushLastTrick(combo, entry) {
  combo.lastTricks.push(entry);
  if (combo.lastTricks.length > LAST_TRICKS_KEPT) combo.lastTricks.shift();
}

/**
 * Record one detected trick. Tricks outside the chain window start a fresh chain
 * (banking the old one first); tricks inside extend it. Kills that arrive WITH a
 * trick on the same event are trick kills, not gun kills — the caller skips recordKill
 * for those events. Returns the points awarded.
 */
export function recordTrick(comboState, trick) {
  const combo = ensureCombo(comboState);
  if (!trick || typeof trick !== 'object') return 0;
  const tick = tickOf(trick.tick, 0);
  if (combo.activeCount > 0 && combo.lastTrickTick >= 0 && tick - combo.lastTrickTick > COMBO_WINDOW_TICKS) {
    bankActive(combo);
  }
  const position = combo.activeCount + 1;
  const points = trickPoints(trick, position);
  const pay = trickPay(trick);
  combo.activeCount = position;
  combo.activePoints += points;
  combo.reputation += pay.reputation;
  combo.salvageRights += pay.salvageRights;
  combo.credits = 0;
  combo.lastTrickTick = tick;
  if (combo.activeCount > combo.bestChain) combo.bestChain = combo.activeCount;
  if (combo.activePoints > combo.bestChainPoints) combo.bestChainPoints = combo.activePoints;
  pushLastTrick(combo, {
    trickId: trick.trickId || 'unknown',
    name: trick.name || trick.trickId || 'Unknown stunt',
    rarity: trick.rarity || 'common',
    points,
    tick,
  });
  return points;
}

/**
 * Record one plain kill (no trick on the same event). Pays flat into the banked total
 * immediately — gunfire never builds or extends a chain. Returns the points awarded.
 */
export function recordKill(comboState, kill = {}) {
  const combo = ensureCombo(comboState);
  const info = (kill && typeof kill === 'object') ? kill : {};
  const points = killPoints(info.weaponId);
  combo.banked += points;
  if (isPulseWeapon(info.weaponId)) combo.pulseKills += 1;
  else combo.gunKills += 1;
  return points;
}

/** Record a kill that arrived with a trick (a tow-kill, a wreck crush, ...): no double pay. */
export function recordTrickKill(comboState) {
  const combo = ensureCombo(comboState);
  combo.trickKills += 1;
  return 0;
}

/** Move the active chain into the banked total. Idempotent. Returns the amount banked. */
export function bankActive(comboState) {
  const combo = ensureCombo(comboState);
  if (combo.activeCount <= 0 || combo.activePoints <= 0) {
    combo.activeCount = 0;
    combo.activePoints = 0;
    return 0;
  }
  const amount = combo.activePoints;
  combo.banked += amount;
  combo.activeCount = 0;
  combo.activePoints = 0;
  return amount;
}

/**
 * Bank the active chain once it has gone quiet. Call on kill events and per update;
 * cheap branch when no chain is live. Returns the amount banked (0 most calls).
 */
export function bankIfQuiet(comboState, nowTick) {
  const combo = ensureCombo(comboState);
  if (combo.activeCount <= 0) return 0;
  const now = tickOf(nowTick, 0);
  if (combo.lastTrickTick < 0) return 0;
  if (now - combo.lastTrickTick >= COMBO_BANK_QUIET_TICKS) return bankActive(combo);
  return 0;
}

/** Live total: banked plus the still-live chain. */
export function comboTotal(comboState) {
  const combo = ensureCombo(comboState);
  return combo.banked + combo.activePoints;
}

/** Total kills seen (trick kills plus flat gun/pulse kills). */
export function comboKills(comboState) {
  const combo = ensureCombo(comboState);
  return combo.trickKills + combo.gunKills + combo.pulseKills;
}

/**
 * JSON-safe snapshot for the Crucible results surface. Read-only: never mutates live state.
 * Returns null when there is nothing worth showing (no tricks, no kills).
 */
export function comboSummary(comboState) {
  if (!comboState || typeof comboState !== 'object') return null;
  const combo = ensureCombo({ ...comboState, lastTricks: Array.isArray(comboState.lastTricks) ? [...comboState.lastTricks] : [] });
  const totalScore = combo.banked + combo.activePoints;
  const totalKills = combo.trickKills + combo.gunKills + combo.pulseKills;
  if (totalScore <= 0 && totalKills <= 0 && combo.bestChain <= 0) return null;
  return {
    schemaVersion: STUNT_COMBO_SCHEMA_VERSION,
    totalScore,
    banked: combo.banked,
    activePoints: combo.activePoints,
    activeCount: combo.activeCount,
    activeMultiplier: combo.activeCount > 0 ? chainFactor(combo.activeCount) : 1,
    bestChain: combo.bestChain,
    bestChainPoints: combo.bestChainPoints,
    trickKills: combo.trickKills,
    gunKills: combo.gunKills,
    pulseKills: combo.pulseKills,
    totalKills,
    reputation: combo.reputation,
    salvageRights: combo.salvageRights,
    credits: 0,
    lastTricks: combo.lastTricks.map((entry) => ({ ...entry })),
  };
}
