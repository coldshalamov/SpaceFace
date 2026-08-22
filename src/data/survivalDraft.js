// Survival draft catalog and pure offer generator (PQ-133 / CRU-016).
//
// A draft pick changes WHAT YOUR WEAPONS ARE, not a number on a stat sheet. Every entry below is a
// live weapon id already in src/data/weapons.js, chosen because it is a different physical verb:
// throw a hull into terrain, latch it to your frame, take its steering away, mine a lane, screen
// incoming fire. There are no damage/health/speed percentages in this file on purpose — §33 fails a
// leaf on sight for "modifier soup (stat-only drafts)".
//
// Pure data + pure function: no bus, no registry, no state, no DOM, no RNG source but the seed it
// is handed. Same (seed, wave, hull, fittings, pick count, re-roll count) always yields the same
// three offers.
//
// THE PAID RE-ROLL (CRU-016b). The run wallet used to buy nothing — a whole produced loop (drop,
// magnetise, chase, settle) fed one row on the results screen. It now buys another draw, and the
// price is arithmetic off the authored purse rather than a taste number: every wave in
// src/data/survivalWaves.js pays exactly `8 + 4*wave` credits, so a re-roll at `6 + 3*wave` costs
// exactly three quarters of what the wave you just cleared paid, at every wave in the block. Each
// further re-roll inside the SAME draft costs that base again (1x, 2x, 3x), which is what stops a
// late-run bank from buying an unlimited search. See rerollPrice below.
//
// A re-roll re-draws from the SAME eligible pool with a different seeded stream, and every id the
// draft has already shown sinks to the back — so paying always changes the cards while any unshown
// card exists, and the owner can peek at the next round to refuse a re-roll that would not.

import { mulberry32 } from '../core/rng.js';
import { SHIPS } from './ships.js';
import { WEAPONS } from './weapons.js';
import { buildSlotList, fits, outfitBudgetForFittings } from '../systems/ships.js';

export const SURVIVAL_DRAFT_SCHEMA_VERSION = 1;
export const SURVIVAL_DRAFT_CHOICES = 3;

const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

/**
 * The verb pool. `verb` is the one-word identity the player reads; `blurb` says what changes about
 * the fight, in the terms of the thing that happens on screen — never in percentages.
 */
export const SURVIVAL_DRAFT_OFFERS = freezeDeep([
  {
    id: 'throw', defId: 'wpn_concussion_cannon_m', verb: 'Throw',
    blurb: 'A momentum slug. Light hulls are picked up and put into the terrain — the wall gets the kill.',
  },
  {
    id: 'tag', defId: 'wpn_gravity_marker_s', verb: 'Tag',
    blurb: 'Marks a hull so every gravity field in the room pulls on it far harder.',
  },
  {
    id: 'bind', defId: 'wpn_momentum_sink_s', verb: 'Bind',
    blurb: 'Latches the target into your frame of motion. Where you go, it follows.',
  },
  {
    id: 'mine', defId: 'wpn_vector_mine_m', verb: 'Mine',
    blurb: 'Deployed ordnance that shoves everything out of a lane — including you, if you dive back through.',
  },
  {
    id: 'unsteer', defId: 'wpn_rcs_disruptor_m', verb: 'Unsteer',
    blurb: 'Takes a pilot\'s attitude control away. It drifts, and it cannot hold a firing line.',
  },
  {
    id: 'scramble', defId: 'wpn_emp_disruptor_m', verb: 'Scramble',
    blurb: 'Couples through shields into subsystems. Sensors and guns go dark before the hull does.',
  },
  {
    id: 'screen', defId: 'wpn_flak_turret_s', verb: 'Screen',
    blurb: 'A turret that answers incoming ordnance instead of the hull that fired it.',
  },
  {
    id: 'seek', defId: 'wpn_missile_rack_m', verb: 'Seek',
    blurb: 'Guided ordnance that turns after a target you are no longer pointing at.',
  },
  {
    id: 'pierce', defId: 'wpn_railgun_m', verb: 'Pierce',
    blurb: 'A flat, fast slug that goes through armour rather than around it.',
  },
  {
    id: 'sustain', defId: 'wpn_beam_laser_m', verb: 'Sustain',
    blurb: 'A held beam. Damage while you keep the line, nothing the moment you break it.',
  },
  {
    id: 'burn', defId: 'wpn_plasma_cannon_m', verb: 'Burn',
    blurb: 'Slow, heavy plasma. It leaves a hull cooking after the shot has landed.',
  },
  {
    id: 'volume', defId: 'wpn_autocannon_m', verb: 'Volume',
    blurb: 'Heavy kinetic cadence. Nothing clever — a great deal of it, arriving continuously.',
  },
  {
    id: 'cadence', defId: 'wpn_pulse_laser_m', verb: 'Cadence',
    blurb: 'A bigger energy repeater. Fast, cheap on heat, honest.',
  },
  {
    id: 'sidearm', defId: 'wpn_autocannon_s', verb: 'Sidearm',
    blurb: 'A light kinetic repeater for a small hardpoint.',
  },
]);

/** Credits a re-roll costs before the same-draft multiplier — the fixed part of the price. */
export const SURVIVAL_REROLL_BASE_CREDITS = 6;
/** Credits the price rises per wave. Base + step*wave is 3/4 of that wave's authored purse. */
export const SURVIVAL_REROLL_WAVE_CREDITS = 3;

/**
 * What one more draw costs, right now.
 *
 * Priced against what a run actually earns, not against a feeling: wave W pays `8 + 4*W` and a
 * re-roll costs `6 + 3*W`, so the first re-roll of any draft is three quarters of the wave you
 * just cleared. The multiplier is the number of re-rolls already taken in THIS draft, so a second
 * look costs two waves' worth and a third costs three — a bank can buy depth, but never for free.
 */
export function rerollPrice(wave, rerollsTaken = 0) {
  const w = Number.isInteger(wave) && wave > 1 ? wave : 1;
  const n = Number.isInteger(rerollsTaken) && rerollsTaken > 0 ? rerollsTaken : 0;
  return (SURVIVAL_REROLL_BASE_CREDITS + SURVIVAL_REROLL_WAVE_CREDITS * w) * (n + 1);
}

/**
 * Deterministic stream for one draft ROUND. Pick history is mixed in, per review question 4, and
 * so is the re-roll count — a paid re-roll must be reproducible, not random.
 *
 * The round-0 label is left byte-identical to the pre-re-roll one on purpose: a run seed that
 * produced three particular cards before still produces them.
 */
export function draftStreamSeed(seed, wave, pickCount, rerollCount = 0) {
  const r = Number.isInteger(rerollCount) && rerollCount > 0 ? rerollCount : 0;
  const label = r > 0
    ? `survival-draft-v1|w${wave}|n${pickCount}|r${r}`
    : `survival-draft-v1|w${wave}|n${pickCount}`;
  let h = (seed >>> 0) ^ 0x85ebca6b;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0) || 1;
}

function currentDefIds(fittings) {
  const out = new Set();
  if (!Array.isArray(fittings)) return out;
  for (const defId of fittings) if (typeof defId === 'string' && defId) out.add(defId);
  return out;
}

/**
 * Choose the slot this offer would land in: the first empty compatible slot, otherwise the
 * compatible slot holding the cheapest-tier weapon (the one the player loses least by replacing).
 */
function targetSlotFor(def, slots, fittings) {
  let replaceIndex = -1;
  let replaceTier = Infinity;
  for (let i = 0; i < slots.length; i++) {
    if (!fits(slots[i], def)) continue;
    const current = fittings[i];
    if (!current) return { slotIndex: i, replaces: null };
    const currentDef = WEAPON_BY_ID.get(current);
    const tier = currentDef && Number.isFinite(currentDef.tier) ? currentDef.tier : 0;
    if (tier < replaceTier) {
      replaceTier = tier;
      replaceIndex = i;
    }
  }
  if (replaceIndex < 0) return null;
  return { slotIndex: replaceIndex, replaces: fittings[replaceIndex] };
}

function withinCapacity(hullId, fittings, slotIndex, defId) {
  const prospective = fittings.slice();
  prospective[slotIndex] = defId;
  const budget = outfitBudgetForFittings(hullId, prospective);
  return !budget || budget.fits;
}

/**
 * One round's three cards out of the eligible pool.
 *
 * Everything the draft has already shown sinks to the BACK of the shuffled pool, so a paid re-roll
 * spends its money on cards the player has not seen. When fewer than `count` unshown cards remain
 * the seen ones fill the tail — the surface always carries three choices rather than shrinking to
 * nothing, and the owner refuses to charge for a round that would change none of them.
 */
function drawRound(eligible, seen, seed, wave, pickCount, round, count) {
  const pool = eligible.slice();
  const rng = mulberry32(draftStreamSeed(seed, wave, pickCount, round));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  if (seen.size === 0) return pool.slice(0, count);
  const fresh = [];
  const repeats = [];
  for (const entry of pool) (seen.has(entry.id) ? repeats : fresh).push(entry);
  return fresh.concat(repeats).slice(0, count);
}

/**
 * Three seeded offers for one draft.
 *
 * Returns { ok:false, reason } rather than throwing, and { ok:true, offers:[] } is a legal result
 * when nothing in the pool can legally land on this hull — the caller must still resolve the draft
 * so the run never stalls waiting for a pick that cannot exist.
 *
 * `rerollCount` selects which paid round to return. It is a pure function of the inputs: round N
 * is derived by replaying rounds 0..N, so the same seed, pick history and re-roll count always
 * land on the same three cards.
 */
export function offerDraft(input) {
  try {
    return offerDraftInner(input);
  } catch {
    return { ok: false, reason: 'invalid_input', offers: [], rerollCount: 0, eligibleCount: 0 };
  }
}

function offerDraftInner(input) {
  const src = input && typeof input === 'object' ? input : {};
  const seed = Number.isInteger(src.seed) ? src.seed : 0;
  const wave = Number.isInteger(src.wave) ? src.wave : 0;
  const pickCount = Number.isInteger(src.pickCount) && src.pickCount > 0 ? src.pickCount : 0;
  const rerollCount = Number.isInteger(src.rerollCount) && src.rerollCount > 0 ? src.rerollCount : 0;
  const count = Number.isInteger(src.count) && src.count > 0 ? src.count : SURVIVAL_DRAFT_CHOICES;
  const hullId = typeof src.hullId === 'string' ? src.hullId : null;
  const shipDef = hullId ? SHIP_BY_ID.get(hullId) : null;
  if (!shipDef) {
    return { ok: false, reason: 'unknown_hull', offers: [], rerollCount, eligibleCount: 0 };
  }
  const slots = buildSlotList(shipDef);

  const fittings = Array.isArray(src.fittings) ? src.fittings.slice() : [];
  while (fittings.length < slots.length) fittings.push(null);
  const owned = currentDefIds(fittings);

  const eligible = [];
  for (const offer of SURVIVAL_DRAFT_OFFERS) {
    const def = WEAPON_BY_ID.get(offer.defId);
    if (!def) continue;
    // Never offer a verb the player already has — a duplicate is a stat bump wearing a name.
    if (owned.has(offer.defId)) continue;
    const target = targetSlotFor(def, slots, fittings);
    if (!target) continue;
    if (!withinCapacity(hullId, fittings, target.slotIndex, offer.defId)) continue;
    eligible.push({
      id: offer.id,
      defId: offer.defId,
      name: def.name,
      verb: offer.verb,
      blurb: offer.blurb,
      slotIndex: target.slotIndex,
      replaces: target.replaces,
    });
  }

  // Seeded Fisher-Yates over the eligible set, then take the head. Deterministic in the eligible
  // ORDER (catalog order), not in iteration accidents. Round 0 is the free draw; each paid round
  // re-shuffles the same pool and pushes everything already shown to the back.
  const seen = new Set();
  let offers = [];
  for (let round = 0; round <= rerollCount; round++) {
    offers = drawRound(eligible, seen, seed, wave, pickCount, round, count);
    for (const entry of offers) seen.add(entry.id);
  }
  return { ok: true, reason: null, offers, rerollCount, eligibleCount: eligible.length };
}
