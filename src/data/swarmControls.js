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
]);
const SWARM_FLIGHT_SET = new Set(SWARM_FLIGHT_ACTIONS);
export function swarmFlightActionAllowed(state, action) {
  return !isSwarmControls(state) || SWARM_FLIGHT_SET.has(action);
}

// Swarm stock keys — consulted AFTER the player's saved rebinds, BEFORE the scheme defaults.
// The Line lives on RMB in Swarm (no keyboard tether); Space is the dash.
export const SWARM_DEFAULT_BINDINGS = Object.freeze({
  tether: [],
  boost: ['Space'],
});

// The six-icon power bar: the five powers on 1–5 plus the Line on RMB — rail slot indexes.
export const SWARM_RAIL_SLOTS = Object.freeze([1, 2, 3, 4, 5, 6]);
export function swarmRailSlotAllowed(state, slotIndex) {
  return !isSwarmControls(state) || SWARM_RAIL_SLOTS.includes(slotIndex);
}
// The Line socket's swarm key label — the rail reads live bindings for 1–5, but the tether
// verb has no keyboard code in Swarm.
export const SWARM_LINE_KEY_LABEL = 'RMB';

// The whole Swarm Help card — nothing Adventure. Rows: [keys, verb]. The powers keep their
// live key glyphs from the binding table; the fixed verbs carry literal text.
export const SWARM_HELP_ROWS = Object.freeze([
  ['W A S D', 'Move'],
  ['Mouse', 'Aim'],
  ['LMB', 'Fire'],
  ['RMB', 'Line — fire / release'],
  ['1–5', 'Pull · Shove · Pin · Bomb · Rig'],
  ['Space', 'Boost / dash'],
  ['Q', 'Call-in'],
  ['E', 'Interact'],
  ['Tab', 'Scoreboard'],
  ['Esc', 'Pause'],
]);
