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
import { swarmCallinCount } from '../data/swarmDraft.js';
import { pilotHas } from '../data/pilotTree.js';
// OVH-01c2: re-exported so the power owners (fields, impulseCharges) read the pilot record through this seam.
export { pilotHas };

/** The five power verbs, in rail and number-row order. */
export const POWER_VERBS = Object.freeze(['pull', 'shove', 'pin', 'bomb', 'rig']);

/**
 * Aim placement can be previewed before release. A reaction pulse must answer the press, and a
 * persistent tool must toggle without a sustained grip; neither belongs to the aiming setting.
 * Input and held-key presentation share this policy so a working tool cannot look like a preview.
 */
export const POWER_INTERACTIONS = Object.freeze({
  pull: 'aimed',
  shove: 'pulse',
  pin: 'aimed',
  bomb: 'aimed',
  rig: 'toggle',
});

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
 * Every power acts on press, at the cursor (director ruling 2026-11-20: one input rule for all
 * five). Settings → Gameplay → "Aim first" (`powerFire: 'aim'`) is the opt-in: Pull, Pin and Bomb
 * then preview while held and act on release. Profiles saved before the ruling stored the old
 * default 'hold'; it reads as press, because that was never a choice the player made.
 */
export function powersFireOnPress(state) {
  return !(state && state.settings && state.settings.gameplay && state.settings.gameplay.powerFire === 'aim');
}

/** Only aimed powers create a release-to-use grip, including their saved legacy action names. */
export function powerUsesReleasePreview(state, power) {
  return POWER_INTERACTIONS[powerVerbFor(power)] === 'aimed' && !powersFireOnPress(state);
}

// The held-key preview's read seam (row 493): which power the pilot is gripping right now, keyed
// by the simulation state it belongs to. input.js writes it; the preview reads it. Presentation
// only — never on `state`, so it cannot enter a save, a replay or a determinism hash. The Deep
// Cast depth does NOT read this grip: the sim reads the hold measured in the recorded input
// command (see pilotPowerDepthScale below), so the worker lane and replays agree with live play.
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
/**
 * SEED-SW-01/03 — which swarm call-in charge a Bomb press would spend, or null. The swarm
 * charges sit in the ordnance fallback AFTER the cargo impulse charge and BEFORE the drift
 * bomb: a stocked smart bomb throws first, then a stocked lance paints and strikes, and only a
 * dry rack falls through to the bay's own bomb. Reads the run's own ledger; never writes it.
 */
export function swarmBombSelection(state) {
  const run = state && state.run;
  if (!run || typeof run !== 'object' || run.kind !== 'survival') return null;
  if (swarmCallinCount(run, 'smart_bomb') > 0) return 'smart_bomb';
  if (swarmCallinCount(run, 'orbital_lance') > 0) return 'orbital_lance';
  return null;
}

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

// ── OVH-01c2 — the Conjurer's Pilot Tree reads (06 §2.2) ────────────────────────────────────
// One pure seam for every number the tree bends in the five power owners. Each helper reads only
// the run's pilot record through pilotHas (never state.run.pilot directly) and returns the
// identity value without it, so a run with no pilot record is byte-identical. The pilot record is
// the player's own — NPCs never carry one, so no site needs a second owner check beyond the ones
// that already separate player deploys from NPC ones.

/** conjurer_quick_cast — each power's recovery time × 0.75. */
export function pilotPowerCooldownScale(state) {
  return pilotHas(state, 'conjurer_quick_cast') ? 0.75 : 1;
}

/** conjurer_wide_bore — each power's radius or range × 1.4. */
export function pilotPowerReachScale(state) {
  return pilotHas(state, 'conjurer_wide_bore') ? 1.4 : 1;
}

/** conjurer_echo — the second fire lands this much sim time later (06 §2.2 "half a second"). */
export const PILOT_ECHO_DELAY_S = 0.5;
/** conjurer_echo — the second fire's strength fraction. */
export const PILOT_ECHO_STRENGTH = 0.5;

// conjurer_deep_cast — hold a power key before release to deepen it: strength ×1 at 0.4 s of
// hold rising to ×1.5 at 1.2 s. A tap (or a press-mode fire, which never opens a grip) is ×1.
// The hold is measured by the input layer and carried IN THE RECORDED COMMAND (integer sim
// ticks beside the one-shot action it deepens), so the worker lane, replays and the live sim
// all read the same depth. The fields exist on the deploy tick only; any other tick is ×1.
export const POWER_DEPTH_HOLD_MIN_S = 0.4;
export const POWER_DEPTH_HOLD_MAX_S = 1.2;
export const POWER_DEPTH_MAX_MULT = 1.5;
const SIM_TICKS_PER_S = 60;
const POWER_DEPTH_HOLD_TICKS = Object.freeze({
  pull: Object.freeze(['deployWellHoldTicks']),
  shove: Object.freeze(['deployRepulsorHoldTicks']),
  pin: Object.freeze(['deployMassSeedHoldTicks']),
  bomb: Object.freeze(['chargeThrowHoldTicks', 'dropBombHoldTicks', 'swarmBombThrowHoldTicks']),
});
export function pilotPowerDepthScale(state, power) {
  if (!power || !pilotHas(state, 'conjurer_deep_cast')) return 1;
  const fields = POWER_DEPTH_HOLD_TICKS[powerVerbFor(power)];
  if (!fields) return 1;
  const actions = state && state.input && state.input.actions;
  if (!actions) return 1;
  let holdTicks = 0;
  for (let i = 0; i < fields.length; i++) {
    const value = Number(actions[fields[i]]);
    if (Number.isFinite(value) && value > holdTicks) holdTicks = value;
  }
  const minTicks = POWER_DEPTH_HOLD_MIN_S * SIM_TICKS_PER_S;
  const spanTicks = (POWER_DEPTH_HOLD_MAX_S - POWER_DEPTH_HOLD_MIN_S) * SIM_TICKS_PER_S;
  if (holdTicks <= minTicks) return 1;
  const t = Math.min(1, (holdTicks - minTicks) / spanTicks);
  return 1 + (POWER_DEPTH_MAX_MULT - 1) * t;
}
