// Missing-three rail contract (PQ-163.02 — "Teach the missing three").
//
// After the rescue grab, before the seam lesson, the first-hour rail teaches boost, draw-to-fly
// (the stroke), and the well. Each is one verb line, then silence. The Range is the fallback,
// never a lecture. Pure data + deterministic helpers: no DOM, no Three.js, no wall clock.
//
// The 10-beat drill table and the rescue opening stay untouched. This rail slots into the
// grab → seam silence gap the way the rescue slots into the drill gaps.

import { MISSING_THREE_BEAT_LINES, RANGE_POINTER_LINE } from '../ui/hudAttention.js';

export const FIRST_HOUR_S = 3600;

// After the rescue grab; each subsequent verb waits on the previous one, then silence.
export const MISSING_THREE_BEATS = Object.freeze([
  Object.freeze({ key: 'boost', after: 'grab', gate: 'seam' }),
  Object.freeze({ key: 'stroke', after: 'boost', gate: 'seam' }),
  Object.freeze({ key: 'well', after: 'stroke', gate: 'seam' }),
]);

export const MISSING_THREE_ORDER = Object.freeze(MISSING_THREE_BEATS.map((beat) => beat.key));

export const MISSING_THREE_PREREQ = Object.freeze(
  Object.fromEntries(MISSING_THREE_BEATS.map((beat) => [beat.key, beat.after])),
);

export const MISSING_THREE_GATE = Object.freeze(
  Object.fromEntries(MISSING_THREE_BEATS.map((beat) => [beat.key, beat.gate])),
);

export const MISSING_THREE_RANGE_FALLBACK = Object.freeze({
  boost: 'boost_keep_speed',
  stroke: 'draw_the_stroke',
  well: 'well_pulls_light',
});

export function missingThreeBeatLine(beatKey) {
  return MISSING_THREE_BEAT_LINES[beatKey] || '';
}

export function missingThreeRangeRungId(beatKey) {
  return Object.prototype.hasOwnProperty.call(MISSING_THREE_RANGE_FALLBACK, beatKey)
    ? MISSING_THREE_RANGE_FALLBACK[beatKey]
    : null;
}

export function missingThreePointerLine() {
  return RANGE_POINTER_LINE;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function freshMissingThreeState() {
  const beats = {};
  for (const key of MISSING_THREE_ORDER) {
    beats[key] = { state: 'pending', fails: 0, doneAt: null };
  }
  return {
    active: true,
    completed: false,
    startedAt: null,
    completedAt: null,
    current: null,
    beats,
    ids: { scrap: null },
    lastBoost: false,
    lastStroke: false,
    used: {
      boost: { count: 0, firstAt: null, prompted: false, unprompted: false },
      stroke: { count: 0, firstAt: null, prompted: false, unprompted: false },
      well: { count: 0, firstAt: null, prompted: false, unprompted: false },
    },
  };
}

export function missingThreeBoosting(state, player) {
  if (state && state.input && state.input.boost) return true;
  if (player && player.flags && player.flags.boosting) return true;
  return false;
}

export function missingThreeStrokeActive(input) {
  const path = input && input.autoTargetPath;
  if (!path) return false;
  const points = Array.isArray(path.points) ? path.points : [];
  return !!(path.drawing || (path.active && points.length >= 2));
}

export function missingThreeWithinHour(atS, startedAt, windowS = FIRST_HOUR_S) {
  const t = Number(atS);
  const origin = Number(startedAt);
  if (!Number.isFinite(t) || !Number.isFinite(origin)) return false;
  return (t - origin) <= windowS;
}

export function makeWellScrapSpec(playerPos) {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  return {
    type: 'asteroid',
    pos: { x: px + 90, z: pz + 20 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 40,
    hullMax: 40,
    data: {
      onboarding: true,
      missingThree: true,
      missingThreeRole: 'scrap',
      typeId: 'ast_well_scrap',
    },
  };
}

export function buildFirstHourVerbEvent(verb, atS, extra = {}) {
  return {
    type: 'firsthour:verb',
    verb: String(verb || ''),
    prompted: Boolean(extra.prompted),
    unprompted: Boolean(extra.unprompted),
    taught: Boolean(extra.taught),
    withinHour: extra.withinHour !== false,
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
  };
}

export function buildFirstHourBeatEvent(beat, result, atS) {
  return {
    type: 'firsthour:beat',
    beat: String(beat),
    result: result === 'complete' ? 'complete' : 'fail',
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
  };
}

export function buildFirstHourStartedEvent(atS) {
  return {
    type: 'firsthour:started',
    beats: [...MISSING_THREE_ORDER],
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
  };
}

export function buildFirstHourCompleteEvent(atS) {
  return {
    type: 'firsthour:complete',
    beats: [...MISSING_THREE_ORDER],
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
  };
}
