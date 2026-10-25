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

// ── RF-02 authored-circuit validation ─────────────────────────────────────────
// Pure geometry/envelope checks for the authored circuits in raceLevels.js. The
// validator never modifies the course; it returns { ok, errors: [{ code, gateIndex?,
// bodyId? }] } with exact diagnostic codes so the launch owner can surface the
// authoring failure instead of a bare false. Solids are supplied in the same
// coordinate frame as course.gates (sector-local for authored courses).
const RF02_EPS = 1e-6;

const rfFinite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const rfDist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const rfUnit = (a, b) => {
  const len = rfDist(a, b);
  return len > RF02_EPS ? { x: (b.x - a.x) / len, z: (b.z - a.z) / len, len } : null;
};
const rfTurnAngle = (uIn, uOut) => {
  if (!uIn || !uOut) return 0;
  const dot = Math.max(-1, Math.min(1, uIn.x * uOut.x + uIn.z * uOut.z));
  return Math.acos(dot);
};
const rfClosestOnSegment = (pos, a, b) => {
  const u = rfUnit(a, b);
  if (!u) return { x: a.x, z: a.z, distance: rfDist(pos, a) };
  const s = Math.max(0, Math.min(u.len, (pos.x - a.x) * u.x + (pos.z - a.z) * u.z));
  const x = a.x + u.x * s, z = a.z + u.z * s;
  return { x, z, distance: Math.hypot(pos.x - x, pos.z - z) };
};
/** Union occupancy: true when some point inside the aperture disc clears every
 * intruding body by `reach`. The per-solid strip test answers "is there a channel
 * beside this one rock"; this answers the question the hull actually asks. The
 * scan is anchored on the gate center so a free line through the middle can
 * never fall between samples; a free sliver thinner than the scan step is
 * treated as unthreadable, which is the conservative call for authored gates. */
const rfGateThreads = (gate, aperture, intruders, reach) => {
  const step = Math.max(6, reach / 4);
  const span = Math.ceil(aperture / step);
  for (let kx = -span; kx <= span; kx++) {
    const ox = kx * step;
    for (let kz = -span; kz <= span; kz++) {
      const oz = kz * step;
      if (ox * ox + oz * oz > aperture * aperture) continue;
      const x = gate.x + ox, z = gate.z + oz;
      let clear = true;
      for (const s of intruders) {
        if (Math.hypot(x - s.x, z - s.z) < s.r + reach - RF02_EPS) { clear = false; break; }
      }
      if (clear) return true;
    }
  }
  return false;
};

/**
 * RF-02 validation of one authored circuit.
 *   course   — { gates: [{x,z}], gateRadiusWU, kind?, boostGateIndex? }
 *   options  — {
 *     hullRadiusWU      — fitted hull radius (default 32); gate radius must exceed it
 *     profile           — resolved propulsion profile { reverseAccel|maxBrakeAccel,
 *                         strafeAccel|maxAccel, maxYawRate, boostSpeedMult }
 *     referenceSpeedsWU — { turn: 60, straight: 120 } pacing references
 *     solids            — materialized statics [{ x, z, radius, id }] in course coords
 *     grid              — { backWU, halfWidthWU } override for the start-grid strip
 *     branchGraph       — optional [{ from, to }] branch edges between gate indices
 *     expectClosed      — force closure requirement even without kind === 'circuit'
 *   }
 * Returns { ok, errors: [{ code, gateIndex?, bodyId? }] }; ok === errors.length === 0.
 */
export function validateRacingCircuit(course, options = {}) {
  const errors = [];
  const push = (code, gateIndex, bodyId) => {
    const row = { code };
    if (Number.isInteger(gateIndex)) row.gateIndex = gateIndex;
    if (bodyId != null) row.bodyId = bodyId;
    errors.push(row);
  };
  const gates = course && Array.isArray(course.gates) ? course.gates : null;
  if (!course || typeof course !== 'object' || !gates || gates.length < 4) {
    return { ok: false, errors: [{ code: 'invalid_course' }] };
  }
  const hullRadiusWU = Number.isFinite(options.hullRadiusWU) && options.hullRadiusWU > 0
    ? options.hullRadiusWU : 32;
  const gateRadius = Number(course.gateRadiusWU);
  if (!Number.isFinite(gateRadius) || gateRadius <= hullRadiusWU + RF02_EPS) {
    push('invalid_gate_radius');
  }
  const aperture = Number.isFinite(gateRadius) && gateRadius > 0 ? gateRadius : 0;
  const profile = options.profile || {};
  const brake = Math.min(Number(profile.reverseAccel || profile.maxBrakeAccel) || 60, 140);
  const lateral = Number(profile.strafeAccel || profile.maxAccel) || 60;
  const boostSpeedMult = Number.isFinite(profile.boostSpeedMult) && profile.boostSpeedMult > 1
    ? profile.boostSpeedMult : 1.6;
  const refs = options.referenceSpeedsWU || {};
  const refTurn = Number.isFinite(refs.turn) && refs.turn > 0 ? refs.turn : 60;
  const refStraight = Number.isFinite(refs.straight) && refs.straight > 0 ? refs.straight : 120;
  const solids = Array.isArray(options.solids) ? options.solids : [];
  const n = gates.length;
  const brakeDistance = (v0, v1) => Math.max(0, (v0 * v0 - v1 * v1) / (2 * Math.max(1, brake)));

  // Per-gate finiteness.
  for (let i = 0; i < n; i++) {
    if (!rfFinite(gates[i])) push('non_finite_gate', i);
  }
  const closed = rfFinite(gates[0]) && rfFinite(gates[n - 1]) && rfDist(gates[0], gates[n - 1]) <= 1;
  const mustClose = course.kind === 'circuit' || options.expectClosed === true;
  if (mustClose && !closed) push('missing_closure');

  // Segment validity.
  for (let i = 0; i + 1 < n; i++) {
    if (!rfFinite(gates[i]) || !rfFinite(gates[i + 1])) continue;
    const len = rfDist(gates[i], gates[i + 1]);
    if (len < RF02_EPS) push('degenerate_segment', i);
    else if (aperture > 0 && len < aperture * 2 - RF02_EPS) push('short_leg', i);
  }

  // Seam integrity: exactly one repeated start at index n-1, aligned with the opening leg.
  if (closed) {
    for (let i = 1; i <= n - 2; i++) {
      if (!rfFinite(gates[i])) continue;
      if (rfDist(gates[i], gates[0]) <= 1) push('duplicate_seam', i);
      else if (i !== n - 2 && rfFinite(gates[n - 2]) && rfDist(gates[i], gates[n - 2]) <= 1) {
        push('duplicate_seam', i);
      }
    }
    const approach = rfUnit(gates[n - 2], gates[n - 1]);
    const opening = rfUnit(gates[0], gates[1]);
    if (approach && opening && rfTurnAngle(approach, opening) > Math.PI / 12) {
      push('misaligned_seam', n - 1);
    }
  }

  // Turn feasibility: curvature sets the corner speed; reverse thrust sets braking room.
  for (let i = 1; i <= n - 2; i++) {
    const uIn = rfUnit(gates[i - 1], gates[i]);
    const uOut = rfUnit(gates[i], gates[i + 1]);
    if (!uIn || !uOut) continue;
    const turn = rfTurnAngle(uIn, uOut);
    if (turn < 0.1) continue;
    const radius = Math.max(18, aperture * 0.65) / Math.max(0.2, Math.tan(Math.min(2.8, turn) / 2));
    const cornerSpeed = Math.max(26, Math.sqrt(lateral * radius));
    if (turn >= (150 * Math.PI) / 180) {
      // A reversal must leave room to kill essentially all approach speed.
      if (uIn.len < brakeDistance(refStraight, Math.min(30, cornerSpeed))) push('infeasible_reversal', i);
      continue;
    }
    const approach = turn >= (60 * Math.PI) / 180 ? refTurn : refStraight;
    if (approach > cornerSpeed && uIn.len < brakeDistance(approach, cornerSpeed)) {
      push('insufficient_braking', i);
    }
  }

  // Static clearance: a gate admits the hull when one side of the aperture still
  // carries a full-body channel; the grid is the hold strip behind the start line.
  // `reach` is the hull radius plus the same body margin the strip check prices in.
  const hullReach = hullRadiusWU + 4;
  for (let i = 0; i < n; i++) {
    if (!rfFinite(gates[i]) || aperture <= 0) break;
    let intruders = null;
    for (const solid of solids) {
      const r = Number(solid && (solid.radiusWU ?? solid.radius)) || 0;
      if (!rfFinite(solid) || r <= 0) continue;
      const d = rfDist(solid, gates[i]);
      if (aperture + d - r < 2 * hullRadiusWU + 8 - RF02_EPS) push('blocked_gate', i, solid.id);
      if (d - r < aperture + hullReach + RF02_EPS) {
        (intruders || (intruders = [])).push({ x: solid.x, z: solid.z, r, d, id: solid.id });
      }
    }
    // A wall needs no single offender: two or more bodies can overlap their
    // clearance so no point inside the aperture still fits the hull. The per-solid
    // strip check above cannot see that union, so ask the question directly.
    // (One intruder alone can never union-block without already failing the strip.)
    if (intruders && intruders.length >= 2 && !rfGateThreads(gates[i], aperture, intruders, hullReach)) {
      intruders.sort((a, b) => (a.d - a.r) - (b.d - b.r));
      push('blocked_gate', i, intruders[0].id);
    }
  }
  if (rfFinite(gates[0]) && rfFinite(gates[1])) {
    const u0 = rfUnit(gates[0], gates[1]);
    const gridBack = Number.isFinite(options.grid?.backWU) ? options.grid.backWU : 240;
    const gridHalf = Number.isFinite(options.grid?.halfWidthWU)
      ? options.grid.halfWidthWU : hullRadiusWU + 24;
    const gridTail = u0 ? { x: gates[0].x - u0.x * gridBack, z: gates[0].z - u0.z * gridBack } : gates[0];
    for (const solid of solids) {
      const r = Number(solid && (solid.radiusWU ?? solid.radius)) || 0;
      if (!rfFinite(solid) || r <= 0) continue;
      if (rfClosestOnSegment(solid, gridTail, gates[0]).distance < gridHalf + r - RF02_EPS) {
        push('blocked_grid', 0, solid.id);
      }
    }
  }

  // Declared branches must resolve to two distinct interior gates, entry before rejoin.
  const branchEdges = Array.isArray(options.branchGraph?.edges)
    ? options.branchGraph.edges
    : (Array.isArray(options.branchGraph) ? options.branchGraph : []);
  const lastInterior = closed ? n - 2 : n - 1;
  for (const edge of branchEdges) {
    const from = Array.isArray(edge) ? edge[0] : edge && edge.from;
    const to = Array.isArray(edge) ? edge[1] : edge && edge.to;
    if (!Number.isInteger(from) || !Number.isInteger(to)
        || from < 1 || to < 1 || from > lastInterior || to > lastInterior || from >= to) {
      push('invalid_branch', Number.isInteger(from) ? from : undefined);
    }
  }

  // Boost gate exit room only when the course declares one.
  const boostGate = Number.isInteger(course.boostGateIndex) ? course.boostGateIndex
    : (Number.isInteger(options.boostGateIndex) ? options.boostGateIndex : null);
  if (boostGate != null) {
    if (boostGate < 1 || boostGate + 1 > lastInterior) {
      push('invalid_branch', boostGate);
    } else if (rfFinite(gates[boostGate]) && rfFinite(gates[boostGate + 1])) {
      const exitLen = rfDist(gates[boostGate], gates[boostGate + 1]);
      const boostExit = refStraight * boostSpeedMult;
      if (exitLen < brakeDistance(boostExit, refStraight)) push('insufficient_boost_exit', boostGate);
    }
  }

  return { ok: errors.length === 0, errors };
}
