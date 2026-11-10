// src/data/inputContexts.js — one short control set per place the player is.
//
// X5 generalises SWARM lane S5. S5 proved the mechanism (a pure predicate, an action allowlist,
// a stock-binding overlay after saved rebinds, a compact Help card, the same gate on the pad) but
// keyed it to a Swarm ruleset, so the rest of the game kept thirty-odd live keys. This module
// keys it to the CONTEXT instead:
//
//   swarm   — a live Swarm run (S5's exact set)
//   station — docked / a station screen is open (no flight verbs)
//   map     — the chart or local map is open (no flight verbs)
//   combat  — a hostile is targeted or the hull is low (the fight set, plus a low-hull flee)
//   flight  — everything else (the full Adventure set)
//
// Two gates, both pure:
//   contextActionAllowed — the SIM/input tick: may this flight verb drive the ship here?
//   contextUiAllowed     — the UI letter layer: may this interface key open its screen here?
// They differ deliberately. A docked pilot still has to be able to read "Travel burn — Shift+T"
// in Help (so `binding()` stays ungated for labels), and the UI owns Undock (`E`) on the station
// hub, which is never a flight verb.
//
// Pure. Data only; no imports from systems or ui. The Swarm table stays in swarmControls.js and is
// imported here, never copied. The map ids below mirror `src/ui/mapAuthority.js` (`isMapScreenId`);
// data cannot import ui, so the list is restated once, here.

import {
  isSwarmControls,
  SWARM_DEFAULT_BINDINGS,
  SWARM_FLIGHT_ACTIONS,
  SWARM_HELP_ROWS,
} from './swarmControls.js';

export const INPUT_CONTEXTS = Object.freeze(['swarm', 'station', 'map', 'combat', 'flight']);

/** The unified map surface plus the legacy ids the normal route no longer opens. */
export const MAP_CONTEXT_SCREEN_IDS = Object.freeze(['galaxyMap', 'localmap', 'starmap']);

// Every flight-owned action in the Adventure sim. Kept explicit so a new verb has to be admitted
// here deliberately; a typo or a retired action simply resolves to no binding.
export const FLIGHT_ACTIONS = Object.freeze([
  'forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight', 'brake', 'boost',
  'fire', 'autoFire', 'countermeasure', 'bomb', 'reelIn', 'reelOut',
  'siteBeam', 'tether', 'pull', 'shove', 'pin', 'rig', 'scanPulse', 'cruise',
  'deployShieldPylon', 'deployBeacon', 'bulletTime', 'cloak', 'gyreSnare',
  'cycleBomb', 'jettisonLot', 'travelBurn', 'massline',
]);

// The fight set: movement, the gun, the Line, the five powers, the defensive/utility verbs that
// matter in contact. Travel drive, autopilot, cruise, map/codex/cargo UI and photo/drill are out —
// except the low-hull flee below (X5 #10): a pilot about to die may always light the long burn.
export const COMBAT_ACTIONS = Object.freeze([
  'forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight', 'brake', 'boost',
  'fire', 'countermeasure', 'bomb', 'reelIn', 'reelOut', 'massline', 'tether',
  'pull', 'shove', 'pin', 'rig', 'scanPulse', 'bulletTime', 'cloak', 'gyreSnare',
  'cycleBomb', 'jettisonLot', 'deployShieldPylon',
]);

/** A pilot under this hull fraction is in the fight whether or not they have a lock. */
export const LOW_HULL_FRACTION = 0.25;

const FLIGHT_SET = new Set(FLIGHT_ACTIONS);
const COMBAT_SET = new Set(COMBAT_ACTIONS);
const SWARM_SET = new Set(SWARM_FLIGHT_ACTIONS);
const MAP_SCREEN_SET = new Set(MAP_CONTEXT_SCREEN_IDS);

function playerEntity(state) {
  return state && state.entities && typeof state.entities.get === 'function' && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
}

/** The hull is low enough that survival, not the objective, is the current task. */
export function isLowHull(state) {
  const player = playerEntity(state);
  if (!player) return false;
  const hullMax = Number(player.hullMax);
  const hull = Number(player.hull);
  return Number.isFinite(hullMax) && hullMax > 0 && Number.isFinite(hull)
    && hull / hullMax < LOW_HULL_FRACTION;
}

/** A hostile is targeted, or the hull is low: the fight is the current task. */
export function isCombatContext(state) {
  const player = playerEntity(state);
  if (!player) return false;
  if (isLowHull(state)) return true;
  const targetId = state.player && state.player.targetId;
  if (targetId == null) return false;
  const target = state.entities && typeof state.entities.get === 'function' ? state.entities.get(targetId) : null;
  return !!(target && target.alive !== false && target.team != null && player.team != null
    && target.team !== player.team);
}

/** Top screen id from the screen manager's live stack (`state.ui.screenStack`, string[]). */
export function topScreenId(state) {
  const stack = state && state.ui && state.ui.screenStack;
  if (!Array.isArray(stack) || !stack.length) return null;
  const top = stack[stack.length - 1];
  if (typeof top === 'string') return top;
  if (top && typeof top === 'object' && typeof top.id === 'string') return top.id;
  return null;
}

/** Is a map surface on top right now? `ui.mapOpen` is the map owner's own latch. */
export function isMapContext(state) {
  if (!state) return false;
  if (state.ui && state.ui.mapOpen === true) return true;
  if (state.mode === 'map') return true;
  if (state.ui && state.ui.screen === 'map') return true;
  const top = topScreenId(state);
  return !!top && MAP_SCREEN_SET.has(top);
}

/**
 * X5 #8 — MAP BEFORE STATION. The chart opens on top of the station hub, so a docked pilot with
 * the galaxy map up is reading the map; the station set would otherwise win and mislabel every
 * key on the screen they are actually looking at.
 */
export function inputContextFor(state) {
  if (isSwarmControls(state)) return 'swarm';
  if (isMapContext(state)) return 'map';
  // Only the MAP context reads the screen stack: a modal over flight must not silently turn the
  // ship's verbs off (the input lifecycle owns modal freeze; a gate here would synthesize a
  // falling edge on a physically held key). Docking is `ui.docked` / station mode.
  if (state && (state.ui?.docked === true || state.mode === 'station' || state.ui?.screen === 'station')) {
    return 'station';
  }
  if (isCombatContext(state)) return 'combat';
  return 'flight';
}

/**
 * The one allowlist for the ship's verbs. Swarm keeps S5's exact set. Station and map have no
 * flight verbs at all; combat has the fight set plus the low-hull flee; flight has everything.
 */
export function contextActionAllowed(state, action) {
  const ctx = inputContextFor(state);
  if (ctx === 'swarm') return SWARM_SET.has(action);
  if (ctx === 'station' || ctx === 'map') return false;
  if (ctx === 'combat') {
    if (COMBAT_SET.has(action)) return true;
    // X5 #10: the escape the fight set would otherwise take away exactly when it is needed.
    return action === 'travelBurn' && isLowHull(state);
  }
  return FLIGHT_SET.has(action);
}

// ---- the UI letter layer ---------------------------------------------------------------------
// One name per interface key. `ui/input.js` asks THIS gate before it opens a screen, so a fight
// cannot pull up the chart, the tech tree or the codex mid-turn. The full set is every interface
// verb the router owns; the combat set is the ones that keep the pilot in the fight (a pause, a
// read, a lower volume, a save) without leaving it. Station and map keep the full set: those
// screens are how the player gets back out.
export const UI_ACTIONS = Object.freeze([
  'pause', 'help', 'map', 'localmap', 'starmap', 'techTree', 'missionLog', 'codex', 'find',
  'cargo', 'comms', 'fleetCommand', 'claimBase', 'drill', 'band', 'recallObjective',
  'dismissVoice', 'zoom', 'save', 'load', 'ship', 'footprint', 'range', 'overview', 'debug',
  // Station / map surfaces
  'select', 'confirm', 'back', 'undock',
]);

export const COMBAT_UI_ACTIONS = Object.freeze([
  'pause', 'help', 'missionLog', 'cargo', 'comms', 'find', 'recallObjective', 'dismissVoice',
  'zoom', 'save', 'load',
]);

const UI_SET = new Set(UI_ACTIONS);
const COMBAT_UI_SET = new Set(COMBAT_UI_ACTIONS);

/** May this interface key act where the player is? Combat is the only reduced context. */
export function contextUiAllowed(state, uiAction) {
  const action = String(uiAction || '');
  if (!action || !UI_SET.has(action)) return false;
  if (inputContextFor(state) === 'combat') return COMBAT_UI_SET.has(action);
  return true;
}

/** Stock bindings consulted after the player's saved rebinds. Swarm keeps S5's overlay. */
export function contextStockBindings(state) {
  return inputContextFor(state) === 'swarm' ? SWARM_DEFAULT_BINDINGS : null;
}

// ---- Help card -------------------------------------------------------------------------------
// X5 #5 — the card is DERIVED, not hand-copied. Each row names either rebindable flight actions
// (live keys come from the caller's resolver) or a fixed interface key (text, because those are
// not rebindable). A saved rebind therefore moves the card, and an action the context refuses is
// dropped instead of being taught.
const CARD_SPECS = Object.freeze({
  flight: Object.freeze([
    Object.freeze({ actions: Object.freeze(['forward', 'yawLeft', 'reverse', 'yawRight']), verb: 'Move' }),
    Object.freeze({ fixed: 'Mouse', verb: 'Aim' }),
    Object.freeze({ actions: Object.freeze(['fire']), verb: 'Fire' }),
    Object.freeze({ actions: Object.freeze(['tether']), verb: 'Line — fire / release' }),
    Object.freeze({ actions: Object.freeze(['pull', 'shove', 'pin', 'bomb', 'rig']), verb: 'Pull · Shove · Pin · Bomb · Rig' }),
    Object.freeze({ actions: Object.freeze(['boost']), verb: 'Boost' }),
    Object.freeze({ fixed: 'Tab / Backspace', verb: 'Target · clear' }),
    Object.freeze({ fixed: 'E', verb: 'Dock / interact' }),
    Object.freeze({ fixed: 'M', verb: 'Map' }),
    Object.freeze({ fixed: 'Esc', verb: 'Pause' }),
  ]),
  combat: Object.freeze([
    Object.freeze({ actions: Object.freeze(['forward', 'yawLeft', 'reverse', 'yawRight']), verb: 'Move' }),
    Object.freeze({ fixed: 'Mouse', verb: 'Aim' }),
    Object.freeze({ actions: Object.freeze(['fire']), verb: 'Fire' }),
    Object.freeze({ actions: Object.freeze(['tether']), verb: 'Line — fire / release' }),
    Object.freeze({ actions: Object.freeze(['pull', 'shove', 'pin', 'bomb', 'rig']), verb: 'Pull · Shove · Pin · Bomb · Rig' }),
    Object.freeze({ actions: Object.freeze(['boost']), verb: 'Boost' }),
    Object.freeze({ fixed: 'Tab / Backspace', verb: 'Target · clear' }),
    Object.freeze({ actions: Object.freeze(['countermeasure']), verb: 'Countermeasure' }),
    // X5 #10: only a pilot under the low-hull line is offered the flee, and only then is the key
    // real (see contextActionAllowed), so the card and the gate cannot disagree.
    Object.freeze({ actions: Object.freeze(['travelBurn']), verb: 'Flee — travel burn', lowHullOnly: true }),
    Object.freeze({ fixed: 'Esc', verb: 'Pause' }),
  ]),
  station: Object.freeze([
    Object.freeze({ fixed: 'Click', verb: 'Select' }),
    Object.freeze({ fixed: 'Enter', verb: 'Confirm' }),
    Object.freeze({ fixed: 'Esc', verb: 'Back' }),
    // `E` is the UI's undock (contextUiAllowed('undock')) — never a flight verb on this screen.
    Object.freeze({ fixed: 'E', verb: 'Undock' }),
  ]),
  map: Object.freeze([
    Object.freeze({ fixed: 'Drag', verb: 'Pan' }),
    Object.freeze({ fixed: 'Wheel', verb: 'Zoom' }),
    Object.freeze({ fixed: 'Click', verb: 'Select' }),
    Object.freeze({ fixed: 'Esc', verb: 'Close' }),
  ]),
});

/** Join live key glyphs: single characters run together ("WASD"), words stay spaced. */
function compactKeys(keys) {
  const list = keys.filter(Boolean);
  if (!list.length) return '';
  if (list.every((k) => k.length === 1)) return list.join('');
  return list.join(' ');
}

/**
 * The short Help card for the current context. Rows are `[keys, verb]`.
 *
 * `resolveKey(action)` must return the player's live key label for a flight action (Help passes
 * `resolveActionLabel`). Without a resolver the action id is printed rather than a blank, so a
 * caller that forgets one is obviously broken instead of silently teaching an empty key.
 */
export function contextHelpRows(state, resolveKey = null) {
  const ctx = inputContextFor(state);
  if (ctx === 'swarm') return SWARM_HELP_ROWS;
  const specs = CARD_SPECS[ctx] || CARD_SPECS.flight;
  const rows = [];
  for (const spec of specs) {
    if (spec.actions) {
      if (spec.lowHullOnly && !isLowHull(state)) continue;
      const keys = spec.actions
        .filter((action) => contextActionAllowed(state, action))
        .map((action) => (typeof resolveKey === 'function' ? resolveKey(action) : action));
      const label = compactKeys(keys.map((k) => String(k || '')));
      if (label) rows.push([label, spec.verb]);
    } else {
      rows.push([spec.fixed, spec.verb]);
    }
  }
  return rows;
}
