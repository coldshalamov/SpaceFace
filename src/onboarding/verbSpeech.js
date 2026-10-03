// Verb shelf (FB-002 / FB-116 / FB-118). Every bound verb is spoken exactly once, in the
// player's actual device vocabulary, on a real trigger — never a wall of text and never a
// bare binding dump.
//
// The five-verb spine (boost/stroke/well/repulsor/cone) is the staged MISSING_THREE rail —
// this table is its sibling for the verbs that have no authored beat: they are taught by a
// contextual moment instead of a sequence slot. Triggers, order-independence, and the
// once-per-profile stamp mirror the firstUse-line contract: systems/onboarding.js owns the
// moments, src/ui/hudAttention.js owns the copy, and state.player.hints owns "once".
//
// Pure data + resolvers. No DOM, no Three.js, no wall clock — device and bindings are read
// from the live state/binding maps so a rebind re-speaks nothing yet is never stale.

import { resolveActionLabel } from '../systems/input.js';
import {
  GAMEPAD_VERB_ALIASES,
  gamepadButtonLabels,
  resolveGamepadBindings,
} from '../systems/gamepad.js';
import { getPromptDevice } from '../ui/bindings.js';
import { massline2Flag, travelFlag } from '../data/featureFlags.js';

/**
 * The remaining untaught bound verbs and the moment that speaks each.
 *
 *   key        — the player.hints stamp + FIRST_USE-style id ('shelf:<key>').
 *   action     — the input action whose live binding the line names.
 *   flag(name,set) — verb is flag-gated; the beat never fires while its feature is off.
 *   trigger    — the contextual moment (systems/onboarding.js maps each to a check):
 *                  longStraight  speed above the governed combat cap for ~3 s, no hostile near
 *                  hostileCharge a hostile inside 300 WU while an impulse charge is racked
 *                  moduleFit     first module:equipped on the player ship
 *                  cloakFit      first module:equipped that grants a cloak (cloakBaseRadius)
 *                  event:<name>  the bus event fires it (first-use verbs: beacon, skim, jettison)
 */
export const SHELF_VERBS = Object.freeze([
  Object.freeze({ key: 'travelBurn', action: 'travelBurn', flagSet: 'travel', flag: 'travelBurn', trigger: 'longStraight' }),
  Object.freeze({ key: 'chargeThrow', action: 'chargeThrow', trigger: 'hostileCharge' }),
  Object.freeze({ key: 'bulletTime', action: 'bulletTime', flagSet: 'massline2', flag: 'bulletTime', trigger: 'moduleFit' }),
  Object.freeze({ key: 'cloak', action: 'cloak', flagSet: 'massline2', flag: 'cloak', trigger: 'cloakFit' }),
  Object.freeze({ key: 'deployBeacon', action: 'deployBeacon', trigger: 'event:beacon:deployed' }),
  Object.freeze({ key: 'toggleSkimCollector', action: 'toggleSkimCollector', trigger: 'event:planet:collector' }),
  Object.freeze({ key: 'jettisonLot', action: 'jettisonLot', trigger: 'event:cargo:jettisoned' }),
]);

export const SHELF_VERB_KEYS = Object.freeze(SHELF_VERBS.map((v) => v.key));

export function shelfVerb(key) {
  return SHELF_VERBS.find((v) => v.key === key) || null;
}

/** The once-per-profile stamp: state.player.hints['shelf:<key>']. */
export function shelfHintKey(key) {
  return `shelf:${key}`;
}

// ── Trigger tuning ────────────────────────────────────────────────────────────
// "First long straight": the hull is genuinely faster than its drive's governed combat cap —
// sling, shove or burn speed the flight model refuses to eat — sustained ~3 s with nobody
// hunting the player. The no-hostile radius is generous so a whisper of a contact does not
// spend the lesson mid-fight.
export const SHELF_LONG_STRAIGHT_S = 3;
export const SHELF_LONG_STRAIGHT_MARGIN = 1.02; // > 2% over the governed cap — noise-proof
export const SHELF_NO_HOSTILE_WU = 1200;
// "First hostile inside 300 WU with a charge racked" — verbatim from FB-116.
export const SHELF_CHARGE_HOSTILE_WU = 300;

function speedOf(entity) {
  const vel = entity && entity.vel;
  return vel ? Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0) : 0;
}

/** The drive's governed combat speed — the cap the flight model spends. */
export function governedCombatSpeed(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  const derived = player && player.data && player.data.derived;
  const propulsion = derived && derived.propulsion;
  const speed = propulsion && Number.isFinite(propulsion.combatSpeed) && propulsion.combatSpeed > 0
    ? propulsion.combatSpeed
    : (propulsion && Number.isFinite(propulsion.maxSpeed) ? propulsion.maxSpeed
      : (derived && Number.isFinite(derived.maxSpeed) ? derived.maxSpeed : 0));
  return speed > 0 ? speed : 0;
}

/**
 * True while the hull holds above-cap speed for the long-straight lesson. The caller accumulates
 * ~3 s of consecutive true readings. `isHostile` is the shared hostility read (systems/scanner.js)
 * injected so this module stays a pure check.
 */
export function shelfLongStraightActive(state, isHostile) {
  if (!state || state.mode !== 'flight') return false;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player || player.alive === false || !player.pos) return false;
  // An already-engaged drive has nothing to teach.
  const drive = state.input && state.input.travelDrive;
  if (drive && drive.state === 'engaged') return false;
  const cap = governedCombatSpeed(state);
  if (!(cap > 0) || speedOf(player) <= cap * SHELF_LONG_STRAIGHT_MARGIN) return false;
  const reach = SHELF_NO_HOSTILE_WU;
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === player.id) continue;
    if (!isHostile(e)) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    if (dx * dx + dz * dz <= reach * reach) return false;
  }
  return true;
}

/** True when a hostile sits inside the charge-lesson radius while a charge is actually racked. */
export function shelfHostileChargeReady(state, isHostile) {
  if (!state || state.mode !== 'flight') return false;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player || player.alive === false || !player.pos) return false;
  const charges = state.player && state.player.cargo && state.player.cargo.items
    ? Number(state.player.cargo.items.cmdty_impulse_charge) || 0 : 0;
  if (charges <= 0) return false;
  const runtime = player.data && player.data.impulseCharges;
  if (runtime && Number(runtime.throwCdT) > 0) return false; // arming, not racked
  const reach = SHELF_CHARGE_HOSTILE_WU;
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === player.id) continue;
    if (!isHostile(e)) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    if (dx * dx + dz * dz <= reach * reach) return true;
  }
  return false;
}

/**
 * The verb's live binding in the player's own device vocabulary.
 *   kbm     → resolveActionLabel (the one live-bound label; a rebind re-labels it).
 *   gamepad → gamepadButtonLabels over the resolved (possibly remapped) pad map, with
 *             GAMEPAD_VERB_ALIASES so keyboard-verb names reach their pad route
 *             (tether→massline, reel→lineControl). A verb with no pad route falls back
 *             to the keyboard label rather than print nothing at a pad player.
 *   touch   → '' — the overlay only ships fire/mine/boost buttons; naming a key a
 *             touch player cannot press is the same lie as naming a dead binding.
 */
export function verbBindingLabel(state, action, device) {
  const dev = device || getPromptDevice();
  if (dev === 'touch') return '';
  if (dev === 'gamepad') {
    const padAction = GAMEPAD_VERB_ALIASES[action] || action;
    const map = resolveGamepadBindings(state && state.settings);
    const labels = gamepadButtonLabels(padAction, map, { glyphSet: gamepadGlyphSetFor(state) });
    if (labels.length && labels[0]) return labels[0];
  }
  return resolveActionLabel(state, action);
}

/** settings.controls.gamepad.glyphSet — 'xb' | 'ds' | 'fh'; 'xb' when unset. */
export function gamepadGlyphSetFor(state) {
  const set = state && state.settings && state.settings.controls
    && state.settings.controls.gamepad && state.settings.controls.gamepad.glyphSet;
  return (set === 'ds' || set === 'fh') ? set : 'xb';
}

/** True while the verb's feature flag allows teaching it. Ungated verbs always read true. */
export function shelfVerbEnabled(verb, state) {
  if (!verb || !verb.flag) return true;
  const features = state && state.runtime && state.runtime.features;
  return verb.flagSet === 'travel' ? travelFlag(verb.flag, features) : massline2Flag(verb.flag, features);
}
