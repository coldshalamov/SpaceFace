// Operable control traces for the ten scenes the public lab run operates.
// `trace` is the scene's primary tape. `controls` are the labels for that tape.
// A row with no runnable trace is unverified and must not be treated as a capture.

import { ACCEPTED_SCENES } from './accepted.js';

export const PRESENTATION_SCENES = Object.freeze([
  row('cf.reel-berth', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'KeyQ reel']),
  row('cf.tow-light', ['ship.starter', 'asteroid.light'], ['KeyF hold', 'KeyQ reel']),
  row('cf.swing-cut', ['ship.starter', 'asteroid.heavy'], ['KeyF tap']),
  row('cf.payout-strand', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'KeyE payout', 'thrust']),
  row('cf.cut-into-pod', ['ship.starter', 'asteroid.heavy', 'asteroid.light'], ['KeyF tap']),
  row('cf.boost-arrest', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'boost', 'thrust']),
  row('cf.taut-catch', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'thrust']),
  row('cf.orbit-hold', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'thrust']),
  row('cf.boost-cut', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'boost', 'KeyF tap']),
  row('cf.moving-fire', ['ship.starter', 'wasp_swarmer'], ['thrust', 'fire']),
]);

function operableTrace(trace) {
  if (!trace) return false;
  return !!(trace.hold || trace.reelFrom != null || trace.payoutFrom != null
    || trace.tap != null || trace.fire || trace.boost
    || Math.abs(trace.moveZ || 0) > 0 || Math.abs(trace.turnIntent || 0) > 0);
}

function row(id, profiles, controls) {
  const scene = ACCEPTED_SCENES.find((entry) => entry.id === id);
  const trace = scene && scene.primary ? Object.freeze({ ...scene.primary }) : null;
  return Object.freeze({
    id,
    profiles: Object.freeze(profiles),
    controls: Object.freeze(controls),
    trace,
    verified: operableTrace(trace),
  });
}

export const PRESENTATION_IDS = Object.freeze(PRESENTATION_SCENES.map((entry) => entry.id));
