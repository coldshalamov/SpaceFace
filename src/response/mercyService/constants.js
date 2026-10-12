// Mercy Service clocks and budgets.
//
// The rescue loop is not a second simulation. It advances only on the authoritative
// 60 Hz fixed step (LOOP_FIXED_DT). Rescue props integrate here because the mission
// adapter is withheld; the player hull never takes a reaction impulse.

import { LOOP_FIXED_DT } from '../../core/simulationRunner.js';

export const MERCY_DT = LOOP_FIXED_DT;
export const MERCY_SCHEMA = 1;

export const MAX_ACTIVE = 2;
export const MAX_BODY_STEPS = 48;
export const MAX_CHAIN_DEPTH = 1;

export const TETHER_STIFFNESS = 36;
export const TETHER_DAMPING = 80;
export const TETHER_MAX_ACCEL = 16;
export const TETHER_MAX_TENSION = 4200;
export const TETHER_SNAP_TANGENTIAL = 6;
export const TETHER_SNAP_TENSION = 160;
export const LINE_DRAG = 1.8;
export const REEL_SPEED = 16;
export const ATTACH_RANGE = 30;
export const REST_MIN = 8;
export const REST_MAX = 40;

export const CLAMP_RANGE = 16;
export const CLAMP_FORCE = 3600;
export const CLAMP_REL_SPEED = 12;
export const STAB_RANGE = 16;
export const STAB_RATE = 9;
export const RIG_RANGE = 16;

export const PLAYER_ACCEL = 80;
export const PLAYER_MAX_SPEED = 50;
export const PLAYER_DRAG = 0.7;
export const PLAYER_RADIUS = 3.2;
export const PLAYER_MASS = 12;

export const LIFE_CREDIT = 450;
export const CARGO_RATE = 0.12;
export const CARGO_CAP = 2000;
export const EVIDENCE_CREDIT = 300;
export const UNLAWFUL_FINE = 400;
export const UNLAWFUL_REP = -8;

export const DISCOVER_RADIUS = 48;
export const CLEANUP_TICKS = 45;

export const PHASES = Object.freeze([
  'distress',
  'approach',
  'assess',
  'stabilize',
  'secure',
  'extraction',
  'settlement',
  'aftermath',
]);

export const DELIVER_ROLES = Object.freeze([
  'hull', 'capsule', 'tank', 'ore', 'engine', 'skiff', 'tug', 'container', 'segment', 'crew',
]);

export function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
