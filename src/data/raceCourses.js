// FB-066 — race courses are DERIVED data, not authored rows. A course is an ordered chain of
// sector-local gate positions the sim evaluates: no entities own the answer, only the geometry.
// Two course shapes exist, chosen by the board sector's own material:
//   lane  — the sector is a lane endpoint; the course runs the chord's surveyed inside segment
//           (outbound from the `from` origin, inbound toward the `to` origin).
//   ring  — a scenic sector with no lane; the course is a circle of buoys around its origin,
//           offset deterministically from the sector id.
// Pure and side-effect free over frozen data — nothing here reads GameState, rng streams, or
// wall time, so a rolled offer can carry the course record verbatim and a re-rolled board
// reproduces it exactly.

import { TRAVEL_LANES, buildLaneGeometry } from './travelLaneRoutes.js';
import { SECTORS } from './sectors.js';
import { globalToSectorLocalForSector } from './sectorCoordinates.js';
import { hash32 } from '../core/rng.js';

export const RACE_COURSE_KIND = Object.freeze({ LANE: 'lane', RING: 'ring' });

/** Gate trigger half-width: wide enough to fly through at speed, narrow enough to matter. */
export const RACE_GATE_RADIUS_WU = 90;
/** Ordered gates per course. Six is a leg, not a lap — enough order to punish a skip. */
export const RACE_GATE_COUNT = 6;
/** Posted-record reference pace (WU/s). A modest drive on a boosted lane can beat it; a
 *  freighter cannot. Bands price against this same figure so the number on the board
 *  is the number the clock judges. */
export const RACE_RECORD_SPEED_WU_S = 120;
/** Time-band multipliers on elapsed vs the posted record. */
export const RACE_BAND_MULT = Object.freeze({ razor: 1.5, standard: 1.0, finish: 0.55 });
export const RACE_BAND_IDS = Object.freeze(['razor', 'standard', 'finish']);
/** razor pays only at-or-under this fraction of the record; standard at-or-under this. */
const RAZOR_CAP_MULT = 1.15;
const STANDARD_CAP_MULT = 1.9;

const SECTOR_BY_ID = new Map((SECTORS || []).map((s) => [s && s.id, s]));

/** Lane chord inside-playable span: keep gates clear of the sector origin and the far cell. */
const LANE_COURSE_MIN_ALONG_WU = 700;
const LANE_COURSE_MAX_LOCAL_WU = 3900;

function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Evenly spaced sector-local gate chain along a lane chord's inside-segment for `sectorId`.
 * `forward` true → the sector owns the chord's `from` end (gates run outbound). Returns
 * sector-local positions so the stored course survives the sector's global origin moving.
 */
function laneCourseGates(lane, geometry, sectorId, forward) {
  const len = geometry.lengthWU;
  const span = Math.min(LANE_COURSE_MAX_LOCAL_WU, Math.max(0, len - LANE_COURSE_MIN_ALONG_WU * 2));
  if (!(span > RACE_GATE_RADIUS_WU * 2)) return null;
  const origin = sectorId;
  const gates = [];
  for (let i = 0; i < RACE_GATE_COUNT; i++) {
    const t = RACE_GATE_COUNT === 1 ? 0.5 : i / (RACE_GATE_COUNT - 1);
    // 'from' end runs OUTBOUND (near origin → down the chord); the 'to' end runs INBOUND
    // (down the chord → toward origin) so both courses always point along the lane.
    const alongWU = forward
      ? LANE_COURSE_MIN_ALONG_WU + span * t
      : len - LANE_COURSE_MIN_ALONG_WU - span * (1 - t);
    const global = {
      x: geometry.from.x + geometry.axis.x * alongWU,
      z: geometry.from.z + geometry.axis.z * alongWU,
    };
    const local = globalToSectorLocalForSector(global, origin, { x: 0, z: 0 });
    gates.push({ x: round2(local.x), z: round2(local.z) });
  }
  return gates;
}

/** Scenic fallback: a closed ring of buoys around the sector origin, radius bounded by the
 *  sector's own playable radius, offset deterministically from the sector id. */
function ringCourseGates(sector) {
  const worldRadius = Math.max(1200, Number(sector && sector.worldRadius) || 3600);
  const radius = Math.min(1600, worldRadius * 0.4);
  const h = hash32('race-ring', sector.id) >>> 0;
  const cx = ((h % 601) - 300);
  const cz = (((h >>> 9) % 601) - 300);
  const gates = [];
  for (let i = 0; i < RACE_GATE_COUNT; i++) {
    const a = (i / RACE_GATE_COUNT) * Math.PI * 2;
    gates.push({ x: round2(cx + Math.cos(a) * radius), z: round2(cz + Math.sin(a) * radius) });
  }
  return gates;
}

function courseLengthWU(gates) {
  let len = 0;
  for (let i = 0; i + 1 < gates.length; i++) {
    len += Math.hypot(gates[i + 1].x - gates[i].x, gates[i + 1].z - gates[i].z);
  }
  return len;
}

/**
 * The course a board in `sectorId` can post, or null when the sector has neither a lane
 * endpoint nor scenic room. Deterministic over frozen data — the same sector always
 * derives the same course record.
 */
export function raceCourseForSector(sectorId) {
  const sector = SECTOR_BY_ID.get(sectorId);
  if (!sector) return null;
  for (const lane of TRAVEL_LANES) {
    const forward = lane.fromSectorId === sectorId;
    const inbound = lane.toSectorId === sectorId;
    if (!forward && !inbound) continue;
    const geometry = buildLaneGeometry(lane);
    const gates = laneCourseGates(lane, geometry, sectorId, forward);
    if (!gates || gates.length < 3) continue;
    const lengthWU = courseLengthWU(gates);
    const recordS = Math.max(8, Math.round(lengthWU / RACE_RECORD_SPEED_WU_S));
    return Object.freeze({
      courseId: `race_${lane.id}_${forward ? 'out' : 'in'}`,
      courseName: `${lane.name} ${forward ? 'outbound' : 'inbound'}`,
      kind: RACE_COURSE_KIND.LANE,
      laneId: lane.id,
      sectorId,
      gates: Object.freeze(gates.map((g) => Object.freeze({ ...g }))),
      gateRadiusWU: RACE_GATE_RADIUS_WU,
      courseLengthWU: round2(lengthWU),
      recordS,
      bandCapsS: Object.freeze([Math.round(recordS * RAZOR_CAP_MULT), Math.round(recordS * STANDARD_CAP_MULT)]),
    });
  }
  if (sector.scenic === true) {
    const gates = ringCourseGates(sector);
    const lengthWU = courseLengthWU(gates);
    const recordS = Math.max(8, Math.round(lengthWU / RACE_RECORD_SPEED_WU_S));
    return Object.freeze({
      courseId: `race_ring_${sectorId}`,
      courseName: `${sector.name} ring`,
      kind: RACE_COURSE_KIND.RING,
      laneId: null,
      sectorId,
      gates: Object.freeze(gates.map((g) => Object.freeze({ ...g }))),
      gateRadiusWU: RACE_GATE_RADIUS_WU,
      courseLengthWU: round2(lengthWU),
      recordS,
      bandCapsS: Object.freeze([Math.round(recordS * RAZOR_CAP_MULT), Math.round(recordS * STANDARD_CAP_MULT)]),
    });
  }
  return null;
}

/** Elapsed-time → pay band id ('razor' | 'standard' | 'finish'). */
export function raceBandForElapsed(elapsedS, course) {
  const caps = course && Array.isArray(course.bandCapsS) ? course.bandCapsS : [Infinity, Infinity];
  const t = Number.isFinite(elapsedS) ? elapsedS : Infinity;
  if (t <= caps[0]) return 'razor';
  if (t <= caps[1]) return 'standard';
  return 'finish';
}
