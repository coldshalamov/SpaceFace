// src/systems/powerVerbs.js — the five powers (owner 2026-10-22).
//
// Eight overlapping verbs used to sit on the number row: Charge, Blast, Seed, Well, Repel, Cone,
// Skim and Bomb. The owner merged them into five, one job each
// (design/expansion/05_ASSET_ROSTER.md §7.2):
//
//   PULL   (1) drop a gravity well at the aim point. It grips the locked target 3x as hard.
//   SHOVE  (2) the repulsor pulse at the ship, plus every armed charge and drift bomb goes off.
//   PIN    (3) fire the anchor Mass Seed. It locks where it lands, ready for the Line.
//   BOMB   (4) throw the sticky impulse charge, or the drift bomb the ordnance cycle chose.
//   RIG    (5) toggle the rig: the clearing cone in open space, the skim scoop in a planet band.
//
// The old names did not go away. They are still the INTERNAL action flags every owner consumes
// (fields, massSeed, bombs, impulseCharges, planetRuntime), so those systems and their tests are
// unchanged. input.js turns each power press into those flags. The old names also stay valid as
// lookup aliases, so a surface asking "which key fires deployWell" reads the Pull key, and a saved
// custom binding stored under an old name still drives its power.
//
// Pure module: no bus, no registry, no DOM. input.js, gamepad.js, the rail and tests share it.

import { PLANET_REGION_RANK } from '../data/planets.js';

/** The five power verbs, in rail and number-row order. */
export const POWER_VERBS = Object.freeze(['pull', 'shove', 'pin', 'bomb', 'rig']);

/** Old (internal) action name → the power that now owns its key. */
export const POWER_VERB_ALIASES = Object.freeze({
  deployWell: 'pull',
  deployRepulsor: 'shove',
  chargeDetonate: 'shove',
  deployMassSeed: 'pin',
  dropBomb: 'bomb',
  chargeThrow: 'bomb',
  toggleClearingCone: 'rig',
  toggleSkimCollector: 'rig',
});

/** Power → the old action names whose saved custom bindings it inherits, in priority order. */
export const POWER_LEGACY_ACTIONS = Object.freeze({
  pull: Object.freeze(['deployWell']),
  shove: Object.freeze(['deployRepulsor', 'chargeDetonate']),
  pin: Object.freeze(['deployMassSeed']),
  bomb: Object.freeze(['dropBomb', 'chargeThrow']),
  rig: Object.freeze(['toggleClearingCone', 'toggleSkimCollector']),
});

/** The power an action name resolves to (itself when it is not an old name). */
export function powerVerbFor(action) {
  return POWER_VERB_ALIASES[action] || action;
}

/**
 * A saved binding table may still hold custom codes under the old names. Return the codes that
 * should drive `power`: the power's own saved entry when it has one; otherwise every old name's
 * saved codes merged in order (a player who moved both the Repulsor and the Detonate keeps both on
 * Shove). An old verb the player explicitly unbound stays a choice: with no custom key left among
 * the merged verbs the power reads unbound (Settings shows it, and a rebind restores it), rather
 * than quietly firing the action they switched off on the scheme default.
 * `undefined` means "nothing saved — use the scheme default".
 */
export function savedCodesForPower(saved, power) {
  if (!saved || typeof saved !== 'object') return undefined;
  const has = (key) => Object.prototype.hasOwnProperty.call(saved, key) && saved[key] != null;
  if (has(power)) return saved[power];
  const legacyNames = POWER_LEGACY_ACTIONS[power] || [];
  let merged;
  for (const legacy of legacyNames) {
    if (!has(legacy)) continue;
    merged = merged || [];
    for (const code of Array.isArray(saved[legacy]) ? saved[legacy] : [saved[legacy]]) {
      if (code && !merged.includes(code)) merged.push(code);
    }
  }
  return merged;
}

/**
 * Do the five powers fire on PRESS (the old instant behaviour) instead of on release? Settings →
 * Gameplay "Powers: use on press" writes `settings.gameplay.powerFire = 'press'`; anything else —
 * including no value, the shipped default — is hold to preview, release to use (row 493).
 */
export function powersFireOnPress(state) {
  return !!(state && state.settings && state.settings.gameplay && state.settings.gameplay.powerFire === 'press');
}

// The held-key preview's read seam (row 493): which power the pilot is gripping right now, keyed
// by the simulation state it belongs to. input.js writes it; the preview reads it. Presentation
// only — never on `state`, so it cannot enter a save, a replay or a determinism hash.
const heldPowers = new WeakMap();
export function setHeldPower(state, power) {
  if (!state || typeof state !== 'object') return;
  if (POWER_VERBS.includes(power)) heldPowers.set(state, power);
  else heldPowers.delete(state);
}
export function heldPower(state) {
  return (state && typeof state === 'object' && heldPowers.get(state)) || null;
}

/** Impulse charges the player carries (cargo owns the count). */
export function playerImpulseCharges(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const n = Number(items && items.cmdty_impulse_charge);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Does a Bomb press throw the sticky charge instead of dropping a drift bomb? The charge is the
 * default ordnance whenever one is aboard — the plate, the trap and every "throw a charge" lesson
 * name this key — and the ordnance cycle turns to a drift bomb explicitly (`bombChosen`, written
 * by the bombs system; this only reads it). A chosen bomb with nothing loaded falls back to the
 * charge, so the key is never dry while a charge is aboard.
 */
export function bombUsesCharge(state) {
  if (playerImpulseCharges(state) <= 0) return false;
  const bay = state && state.bombs;
  if (!bay || typeof bay !== 'object') return true;
  return !(bay.bombChosen === true && bay.selectedId != null);
}

/**
 * Which rig a Rig press toggles. The cone is the open-space rig, the skim scoop the planet-band
 * rig. A rig that is on is turned off first, so the cone stays reachable inside a planet sector
 * and the scoop is never left running by accident. "In the band" is planetRuntime's own test:
 * the player's region rank at or past the skim band, where the collector actually harvests.
 */
export function resolveRigTarget(state) {
  const coneOn = !!(state && state.fields && state.fields.coneActive);
  if (coneOn) return 'cone';
  const planet = state && state.planet;
  const rec = planet && planet.active && planet.player ? planet.player : null;
  if (rec && rec.collectorOn === true) return 'skim';
  const rank = rec ? Number(rec.regionRank) : 0;
  if (rec && Number.isFinite(rank) && rank >= PLANET_REGION_RANK.skim) return 'skim';
  return 'cone';
}
