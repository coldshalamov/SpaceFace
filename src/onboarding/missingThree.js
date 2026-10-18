// Missing-three rail contract (PQ-163.02 — "Teach the missing three").
//
// After the rescue grab, before the seam lesson, the first-hour rail teaches boost, draw-to-fly
// (the stroke), the well, the repulsor, and the clearing cone. Each is one verb line, then
// silence. The Range is the fallback, never a lecture — verbs with no authored Range rung
// simply teach without pointing. Pure data + deterministic helpers: no DOM, no Three.js,
// no wall clock. The module name and the persisted `state.onboarding.missingThree` key are
// kept for save compatibility; the rail grew from three verbs to five (repulsor + cone were
// live, bound, on the power rail, and never named by the tutorial voice).
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
  Object.freeze({ key: 'repulsor', after: 'well', gate: 'seam' }),
  Object.freeze({ key: 'cone', after: 'repulsor', gate: 'seam' }),
]);

export const MISSING_THREE_ORDER = Object.freeze(MISSING_THREE_BEATS.map((beat) => beat.key));

export const MISSING_THREE_PREREQ = Object.freeze(
  Object.fromEntries(MISSING_THREE_BEATS.map((beat) => [beat.key, beat.after])),
);

export const MISSING_THREE_GATE = Object.freeze(
  Object.fromEntries(MISSING_THREE_BEATS.map((beat) => [beat.key, beat.gate])),
);

// Only verbs with an authored Range rung point at the Range. Repulsor and cone rungs exist
// as drill assets (drill.power.repulsor / drill.power.cone) but no live rung rows yet —
// they teach without pointing rather than landing the player on the wrong drill.
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
  const used = {};
  for (const key of MISSING_THREE_ORDER) {
    beats[key] = { state: 'pending', fails: 0, doneAt: null };
    used[key] = { count: 0, firstAt: null, prompted: false, unprompted: false };
  }
  return {
    active: true,
    completed: false,
    startedAt: null,
    completedAt: null,
    current: null,
    beats,
    ids: { scrap: null, clump: [], lane: [] },
    lastBoost: false,
    lastStroke: false,
    used,
  };
}

// Backfill a persisted record from an older rail shape so mid-tutorial saves keep running:
// new verbs appear as pending beats (or done when the rail already completed), staged-prop
// slots appear as empty lists, and use tallies appear as zeroed rows.
export function normalizeMissingThreeState(three) {
  if (!three || typeof three !== 'object') return three;
  if (!three.beats || typeof three.beats !== 'object') three.beats = {};
  if (!three.used || typeof three.used !== 'object') three.used = {};
  for (const key of MISSING_THREE_ORDER) {
    if (!three.beats[key]) {
      three.beats[key] = three.completed === true
        ? { state: 'done', fails: 0, doneAt: three.completedAt != null ? three.completedAt : null }
        : { state: 'pending', fails: 0, doneAt: null };
    }
    if (!three.used[key]) {
      three.used[key] = { count: 0, firstAt: null, prompted: false, unprompted: false };
    }
  }
  if (!three.ids || typeof three.ids !== 'object') three.ids = {};
  if (!('scrap' in three.ids)) three.ids.scrap = null;
  if (!Array.isArray(three.ids.clump)) three.ids.clump = [];
  if (!Array.isArray(three.ids.lane)) three.ids.lane = [];
  return three;
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

// The repulsor lesson stages a loose clump inside the field's 170wu radius so the shove is
// immediately readable: three light rocks near the player, one field pulse, motion outward.
export function makeRepulsorClumpSpec(playerPos) {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const rock = (x, z) => ({
    type: 'asteroid',
    pos: { x: px + x, z: pz + z },
    vel: { x: 0, z: 0 },
    radius: 6,
    mass: 10,
    hull: 30,
    hullMax: 30,
    data: {
      onboarding: true,
      missingThree: true,
      missingThreeRole: 'clump',
      typeId: 'ast_repulsor_clump',
    },
  });
  return [rock(60, -30), rock(-50, 45), rock(20, 70)];
}

// The cone lesson stages a loose lane of light rocks ahead of the nose (inside the cone's
// 260wu reach and ~32° wedge): switching the cone on visibly plows a channel forward.
export function makeConeLaneSpec(playerPos, headingRad) {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const h = finite(headingRad);
  const dir = { x: Math.cos(h), z: Math.sin(h) };
  const perp = { x: -dir.z, z: dir.x };
  const rock = (along, side) => ({
    type: 'asteroid',
    pos: { x: px + dir.x * along + perp.x * side, z: pz + dir.z * along + perp.z * side },
    vel: { x: 0, z: 0 },
    radius: 6,
    mass: 10,
    hull: 30,
    hullMax: 30,
    data: {
      onboarding: true,
      missingThree: true,
      missingThreeRole: 'lane',
      typeId: 'ast_cone_lane',
    },
  });
  return [rock(90, 10), rock(160, -14), rock(230, 12)];
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
