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
//   combat  — a hostile is targeted or the hull is low (the fight set)
//   flight  — everything else (the full Adventure set)
//
// Pure. Data only; no imports from systems. The Swarm table stays in swarmControls.js and is
// imported here, never copied.

import {
  isSwarmControls,
  SWARM_DEFAULT_BINDINGS,
  SWARM_FLIGHT_ACTIONS,
  SWARM_HELP_ROWS,
} from './swarmControls.js';

export const INPUT_CONTEXTS = Object.freeze(['swarm', 'station', 'map', 'combat', 'flight']);

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
// matter in contact. Travel drive, autopilot, cruise, map/codex/cargo UI and photo/drill are out.
export const COMBAT_ACTIONS = Object.freeze([
  'forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight', 'brake', 'boost',
  'fire', 'countermeasure', 'bomb', 'reelIn', 'reelOut', 'massline', 'tether',
  'pull', 'shove', 'pin', 'rig', 'scanPulse', 'bulletTime', 'cloak', 'gyreSnare',
  'cycleBomb', 'jettisonLot', 'deployShieldPylon',
]);

const FLIGHT_SET = new Set(FLIGHT_ACTIONS);
const COMBAT_SET = new Set(COMBAT_ACTIONS);
const SWARM_SET = new Set(SWARM_FLIGHT_ACTIONS);

function playerEntity(state) {
  return state && state.entities && typeof state.entities.get === 'function' && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
}

/** A hostile is targeted, or the hull is low: the fight is the current task. */
export function isCombatContext(state) {
  const player = playerEntity(state);
  if (!player) return false;
  const hullMax = Number(player.hullMax);
  const hull = Number(player.hull);
  if (Number.isFinite(hullMax) && hullMax > 0 && Number.isFinite(hull) && hull / hullMax < 0.25) return true;
  const targetId = state.player && state.player.targetId;
  if (targetId == null) return false;
  const target = state.entities && typeof state.entities.get === 'function' ? state.entities.get(targetId) : null;
  return !!(target && target.alive !== false && target.team != null && player.team != null
    && target.team !== player.team);
}

export function inputContextFor(state) {
  if (isSwarmControls(state)) return 'swarm';
  if (state && (state.ui?.docked === true || state.mode === 'station' || state.ui?.screen === 'station')) {
    return 'station';
  }
  if (state && (state.mode === 'map' || state.ui?.mapOpen === true || state.ui?.screen === 'map')) {
    return 'map';
  }
  if (isCombatContext(state)) return 'combat';
  return 'flight';
}

/**
 * The one allowlist. Swarm keeps S5's exact set. Station and map have no flight verbs at all;
 * combat has the fight set; flight has everything.
 */
export function contextActionAllowed(state, action) {
  const ctx = inputContextFor(state);
  if (ctx === 'swarm') return SWARM_SET.has(action);
  if (ctx === 'station' || ctx === 'map') return false;
  if (ctx === 'combat') return COMBAT_SET.has(action);
  return FLIGHT_SET.has(action);
}

/** The pad reads the same gate — no second control policy for a controller. */
export function contextPadAllowed(state, action) {
  return contextActionAllowed(state, action);
}

/** Stock bindings consulted after the player's saved rebinds. Swarm keeps S5's overlay. */
export function contextStockBindings(state) {
  return inputContextFor(state) === 'swarm' ? SWARM_DEFAULT_BINDINGS : null;
}

const FLIGHT_HELP_ROWS = Object.freeze([
  ['W A S D', 'Move'],
  ['Mouse', 'Aim'],
  ['LMB', 'Fire'],
  ['Space', 'Line — fire / release'],
  ['1-5', 'Pull · Shove · Pin · Bomb · Rig'],
  ['Shift', 'Boost'],
  ['E', 'Dock / interact'],
  ['M', 'Map'],
  ['Esc', 'Pause'],
]);

const COMBAT_HELP_ROWS = Object.freeze([
  ['W A S D', 'Move'],
  ['Mouse', 'Aim'],
  ['LMB', 'Fire'],
  ['Space', 'Line — fire / release'],
  ['1-5', 'Pull · Shove · Pin · Bomb · Rig'],
  ['Shift', 'Boost'],
  ['X', 'Countermeasure'],
  ['Esc', 'Pause'],
]);

const STATION_HELP_ROWS = Object.freeze([
  ['Click', 'Select'],
  ['Enter', 'Confirm'],
  ['Esc', 'Back'],
  ['E', 'Undock'],
]);

const MAP_HELP_ROWS = Object.freeze([
  ['Drag', 'Pan'],
  ['Wheel', 'Zoom'],
  ['Click', 'Select'],
  ['Esc', 'Close'],
]);

/** The short Help card for the current context. Rows are [keys, verb]. */
export function contextHelpRows(state) {
  const ctx = inputContextFor(state);
  if (ctx === 'swarm') return SWARM_HELP_ROWS;
  if (ctx === 'combat') return COMBAT_HELP_ROWS;
  if (ctx === 'station') return STATION_HELP_ROWS;
  if (ctx === 'map') return MAP_HELP_ROWS;
  return FLIGHT_HELP_ROWS;
}
