// src/data/swarmControls.js — the Swarm arcade set (design/program/finish/swarm/PLANS.md S5).
// Pure. Outside a live Swarm run every rule admits, so Adventure is untouched.
import { SWARM_RULESET } from './swarmMode.js';

/** A live Swarm run — same condition the UI glass uses, in the data layer so systems can read it. */
export function isSwarmControls(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase !== 'inactive' && run.ruleset === SWARM_RULESET);
}

// Flight verbs a live Swarm run admits. Anything else resolves to no binding — inert, not
// unbound — so no travel drive, autofire, countermeasure, scanner, site beam, beacon, pylon,
// ordnance cycle, bullet time, cloak, gyre, or mine tool reaches the ship.
export const SWARM_FLIGHT_ACTIONS = Object.freeze([
  'forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight', 'brake',
  'boost', 'fire',
  'pull', 'shove', 'pin', 'bomb', 'rig',
  'tether', 'reelIn', 'reelOut',
  'massline', // the pad's Line hold — the gamepad side of the RMB verb
  'callIn',
  // G18-02b: the wheel is in BOTH doors — hold Q opens it here too (brake, winch and strafe
  // latch slices, and the stocked Call-in). Without this admission the run's own overflow
  // verbs were the ones with no seat: Q resolved to nothing and the wheel never opened.
  'contextWheel',
]);
const SWARM_FLIGHT_SET = new Set(SWARM_FLIGHT_ACTIONS);
export function swarmFlightActionAllowed(state, action) {
  return !isSwarmControls(state) || SWARM_FLIGHT_SET.has(action);
}

// Shared flight keys used by Adventure and the Swarm stock binding overlay.
export const FLIGHT_CORE_KEYS = Object.freeze({
  tether: Object.freeze(['KeyF']),
  boost: Object.freeze(['ShiftLeft', 'ShiftRight']),
});
export const SWARM_DEFAULT_BINDINGS = FLIGHT_CORE_KEYS;

// The six-icon power bar: the five powers on 1–5 plus the Line on RMB — rail slot indexes.
export const SWARM_RAIL_SLOTS = Object.freeze([1, 2, 3, 4, 5, 6]);
export function swarmRailSlotAllowed(state, slotIndex) {
  return !isSwarmControls(state) || SWARM_RAIL_SLOTS.includes(slotIndex);
}
// The whole Swarm Help card. Flight actions optionally supply a live key label.
export const SWARM_HELP_ROWS = Object.freeze([
  ['W A S D', 'Move'],
  ['Mouse', 'Aim'],
  ['LMB', 'Fire'],
  ['F / RMB', 'Line — fire / release', 'tether'],
  ['1–5', 'Pull · Shove · Pin · Bomb · Rig'],
  ['Shift', 'Boost / dash', 'boost'],
  ['Q', 'Wheel — hold · aim · release'],  // Call-in lives on the wheel (G18-02b)
  ['E', 'Interact'],
  ['Tab', 'Scoreboard'],
  ['Esc', 'Pause'],
]);
