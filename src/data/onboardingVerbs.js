// Plan 55 — the five signature physics verbs woven through the ordinary onboarding rail.
// This file owns stable IDs, order, objective copy, and the permanent Codex references only.
// Runtime event validation and world setup remain in systems/onboarding.js.

export const ARCADE_VERB_ORDER = Object.freeze([
  'shove',
  'inhale',
  'swing',
  'well',
  'burn_line',
]);

export const ARCADE_VERB_BEATS = Object.freeze([
  Object.freeze({
    id: 'shove',
    title: 'The Shove',
    objective: 'Put the crippled drone into the rock.',
    reference: 'Concussion rounds trade damage for momentum. Put light hulls on a collision line; the terrain supplies the finish.',
  }),
  Object.freeze({
    id: 'inhale',
    title: 'The Inhale',
    objective: 'Fly through the burst. Take the whole cloud.',
    reference: 'A wreck burst is not a menu reward. Fly the ship through loose cargo before it spreads or another pilot takes it.',
  }),
  Object.freeze({
    id: 'swing',
    title: 'The Swing',
    objective: 'Latch, burn across the line, cut through the ring.',
    reference: 'Latch a heavy anchor, burn perpendicular to the line, then cut at the tangent. The release keeps the speed you earned.',
  }),
  Object.freeze({
    id: 'well',
    title: 'The Well',
    objective: 'One Intake charge is yours. Drop it on the mote pack.',
    reference: 'The Intake pulls light bodies hardest. Place it ahead of a loose pack, let the sink clump it, then fly through the collapse cloud.',
  }),
  Object.freeze({
    id: 'burn_line',
    title: 'The Burn Line',
    objective: 'Watch the derelict cross the burn line.',
    reference: 'Atmosphere is a rule, not a backdrop. A committed descent heats toward breakup; a hard outward burn before the last stage can still save a hull.',
  }),
]);

export const ARCADE_VERB_BY_ID = new Map(ARCADE_VERB_BEATS.map((beat) => [beat.id, beat]));

export function createArcadeVerbProgress({ skipped = false } = {}) {
  const metrics = {};
  for (const id of ARCADE_VERB_ORDER) metrics[id] = false;
  return {
    schemaVersion: 1,
    skipped: !!skipped,
    active: false,
    complete: !!skipped,
    currentIndex: 0,
    entered: false,
    metrics,
    completedOrder: [],
    runtime: {},
  };
}

export function arcadeVerbStatus(state, id) {
  const progress = state && state.onboarding && state.onboarding.arcadeVerbs;
  if (progress && progress.metrics && progress.metrics[id] === true) return 'PRACTICED';
  if (progress && progress.skipped) return 'VETERAN REFERENCE';
  return 'REFERENCE';
}
