// B8 — draw-to-fly rips. Mean speed, slowest point, ink deviation, and ordered
// coverage on three deterministic strokes, measured on the real path.
//
// THE REAL-PATH LAW: a scenario that integrates its own physics is not a measurement.
// This module shadows the inline `feel.stroke_speed` stand-in in verbBench.mjs. It never
// types a cruise, never writes vel/pos, and never generates a speed trace. The hull flies
// because the registered autoTargetAssist owner writes input in production-relative order
// (autoTargetAssist → actions → flightV3 → physics), and flightV3 + rapier-dynamic do the flying.
//
// Vision: "I sketch a trick move with the mouse, the ship RIPS through it."
// "If it follows the line at walking speed, it failed, even if it stayed perfectly on it."

import { autoTargetAssist } from '../../../../src/systems/autoTargetAssist.js';
import { wrapAngle } from '../../../../src/core/rng.js';
import { bootRealPath, writeRealPathInput, REAL_PATH_DT } from '../realPath.mjs';
import {
  settle,
  planarSpeed,
  hullWidthOf,
} from './feel.screen_crossing.mjs';

const CRUISE_HOLD_TICKS = 900;
const TURN_SWEEP_TICKS = 1800;
const STALL_TICKS = 900;
const NINETY_DEG = Math.PI / 2;
const HULL_ID = 'ship_kestrel';
const HULL_NAME = 'Hitch (starter)';
const SPEED_FLOOR = 0.70;
const SLOWEST_FLOOR = 0.35;
const DEVIATION_CEILING = 0.35;
const COVERAGE_FLOOR = 0.90;
const STROKE_NAMES = Object.freeze(['corner', 'S', 'hook']);
const FOLLOWER_SYSTEMS = Object.freeze([autoTargetAssist, 'actions', 'flightV3', 'physics']);
const NO_FOLLOWER_SYSTEMS = Object.freeze(['actions', 'flightV3', 'physics']);

const STROKE_BUILDERS = Object.freeze({
  corner: buildCorner,
  S: buildS,
  hook: buildHook,
});

export const scenario = {
  id: 'feel.stroke_speed',
  label: 'B8 Draw-to-fly rips — mean speed, slowest point, ink deviation, ordered coverage (real path)',
  async run(seed, options) {
    return runStrokeInstrument(seed, options);
  },
};

/**
 * PQ-137.10 B8 instrument. `follower: false` is the dead/no-owner control: bars must
 * fail closed as unmeasured, never as a scored product zero.
 */
export async function runStrokeInstrument(seed, options = {}) {
  const follower = options.follower !== false;
  const requested = Array.isArray(options.strokes) && options.strokes.length
    ? options.strokes
    : STROKE_NAMES;
  const eventTrace = [];
  const turn = await measureCruiseAndTurn(seed, eventTrace, { follower });
  const strokes = {};
  for (const name of requested) {
    const builder = STROKE_BUILDERS[name];
    if (typeof builder !== 'function') {
      throw new Error(`feel.stroke_speed: unknown stroke "${name}"`);
    }
    strokes[name] = await flyNamedStroke(seed, name, builder, turn, eventTrace, { follower });
  }

  const corner = strokes.corner || null;
  const sStroke = strokes.S || null;
  const hook = strokes.hook || null;
  const measuredRows = Object.values(strokes);
  const worstMean = worstFraction(measuredRows, 'meanSpeedFraction', 'min');
  const worstSlow = worstFraction(measuredRows, 'slowestFraction', 'min');
  const bars = requested.flatMap((name) => strokeBars(name, strokes[name], turn));
  const barMet = bars.every((row) => row.met === true);
  const instrumentLive = bars.every((row) => row.unmeasured !== true);
  const ownerProof = (hook && hook.ownerProof)
    || (sStroke && sStroke.ownerProof)
    || (corner && corner.ownerProof)
    || turn.ownerProof;

  return {
    eventTrace,
    metrics: {
      seed,
      cruiseSpeed: turn.cruiseSpeed,
      turnRadiusWu: turn.turnRadiusWu,
      turnRateRadPerS: turn.turnRateRadPerS,
      hullWidthWu: turn.hullWidthWu,
      sweepIncomplete: turn.sweepIncomplete === true,
      meanSpeed: worstMean && worstMean.meanSpeed,
      meanSpeedFraction: worstMean && worstMean.meanSpeedFraction,
      minSpeed: worstSlow && worstSlow.slowestSpeed,
      minSpeedFraction: worstSlow && worstSlow.slowestFraction,
      barMet,
      instrumentLive,
      ownerProof,
      strokes: Object.fromEntries(
        requested.map((name) => [name, strokeMetrics(strokes[name])]),
      ),
      realPathProof: (hook && hook.proof) || (sStroke && sStroke.proof) || (corner && corner.proof) || turn.proof,
      proofs: {
        turn: turn.proof,
        corner: corner && corner.proof,
        S: sStroke && sStroke.proof,
        hook: hook && hook.proof,
      },
      bars,
    },
  };
}

async function measureCruiseAndTurn(seed, eventTrace, options) {
  const host = await bootStrokePlayer(seed, options);
  try {
    const player = host.player;
    settle(host);
    host.assertBodies([player], 'feel.stroke_speed cruise');
    const ownerProof = readOwnerProof(host, options.follower);
    pushTrace(eventTrace, host, 'turn:settle:end', { ownerRegistered: ownerProof.registered });

    host.step(CRUISE_HOLD_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); },
    });
    const cruiseSpeed = planarSpeed(player);
    const hullWidthWu = hullWidthOf(player);
    pushTrace(eventTrace, host, 'turn:cruise:sampled', { cruiseSpeed, hullWidthWu });

    let prevHeading = null;
    let sweptRad = 0;
    let speedSum = 0;
    let speedN = 0;
    let startSimTime = null;
    let endSimTime = null;
    let reached = false;

    host.step(TURN_SWEEP_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1 }); },
      after: ({ state, host: h }) => {
        const vel = h.player.vel;
        const heading = Math.atan2(vel.z, vel.x);
        const speed = planarSpeed(h.player);
        if (prevHeading == null) {
          prevHeading = heading;
          startSimTime = state.simTime;
          endSimTime = state.simTime;
          speedSum += speed;
          speedN += 1;
          return;
        }
        sweptRad += wrapAngle(heading - prevHeading);
        prevHeading = heading;
        endSimTime = state.simTime;
        speedSum += speed;
        speedN += 1;
        if (Math.abs(sweptRad) >= NINETY_DEG) {
          reached = true;
          return false;
        }
      },
    });

    const sweepS = startSimTime != null && endSimTime != null ? endSimTime - startSimTime : 0;
    const meanSpeed = speedN > 0 ? speedSum / speedN : 0;
    const turnRateRadPerS = reached && sweepS > 0 ? Math.abs(sweptRad / sweepS) : null;
    const turnRadiusWu = Number.isFinite(turnRateRadPerS) && turnRateRadPerS > 0
      ? meanSpeed / turnRateRadPerS
      : null;
    pushTrace(eventTrace, host, reached ? 'turn:sweep:complete' : 'turn:sweep:incomplete', {
      sweptRad,
      sweepS,
      meanSpeed,
      turnRadiusWu,
      turnRateRadPerS,
    });

    return {
      cruiseSpeed,
      turnRadiusWu,
      turnRateRadPerS,
      hullWidthWu,
      sweepIncomplete: !reached,
      ownerProof,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
  }
}

async function flyNamedStroke(seed, name, buildInk, turn, eventTrace, options) {
  const host = await bootStrokePlayer(seed, options);
  try {
    const player = host.player;
    settle(host);
    host.assertBodies([player], `feel.stroke_speed ${name}`);
    const ownerProof = readOwnerProof(host, options.follower);

    host.step(CRUISE_HOLD_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); },
    });
    const cruiseSpeed = planarSpeed(player);
    const hullWidthWu = hullWidthOf(player);
    const heading = velocityHeading(player);
    const origin = { x: player.pos.x, z: player.pos.z };
    const local = buildInk({
      cruiseSpeed,
      turnRadiusWu: turn.turnRadiusWu,
      hullWidthWu,
    });
    const points = placeInWorld(local, origin, heading);
    const strokeLengthWu = polylineLength(points);
    const spacing = coverageSpacing(cruiseSpeed, hullWidthWu);
    const nodes = resampleStroke(points, spacing);
    const coverRadius = Math.max(hullWidthWu, spacing * 2);
    const maxTicks = strokeTickBudget(strokeLengthWu, cruiseSpeed);
    const owner = readOwner(host);

    pushTrace(eventTrace, host, `${name}:armed`, {
      cruiseSpeed,
      strokeLengthWu,
      pointCount: points.length,
      nodeCount: nodes.length,
      coverRadius,
      ownerRegistered: ownerProof.registered,
    });

    const instrumentReason = instrumentSetupFault({
      follower: options.follower,
      ownerProof,
      owner,
      points,
      strokeLengthWu,
      turn,
    });
    if (instrumentReason) {
      pushTrace(eventTrace, host, `${name}:unmeasured`, { reason: instrumentReason });
      return unmeasuredStroke(name, instrumentReason, {
        cruiseSpeed,
        hullWidthWu,
        strokeLengthWu,
        ownerProof,
        proof: host.proof(),
      });
    }

    const speeds = [];
    const deviations = [];
    let orderedIdx = 0;
    let stalled = 0;
    let ticksFlown = 0;
    let lastProgress = 0;
    let pathAppliedTicks = 0;
    let maxProgressS = 0;
    let pathTotal = 0;

    host.step(maxTicks, {
      before: ({ state }) => {
        armFollowerInput(state, points);
      },
      after: ({ state, host: h }) => {
        ticksFlown += 1;
        const applied = followerAppliedThisTick(state, owner);
        if (applied.applied) pathAppliedTicks += 1;
        if (applied.progressS > maxProgressS) maxProgressS = applied.progressS;
        if (applied.total > pathTotal) pathTotal = applied.total;

        const pos = h.player.pos;
        const speed = planarSpeed(h.player);
        const near = nearestOnPolyline(points, pos.x, pos.z);
        const absCross = Math.abs(near.cross);
        const startDist = Math.hypot(pos.x - points[0].x, pos.z - points[0].z);
        const end = points[points.length - 1];
        const endDist = Math.hypot(pos.x - end.x, pos.z - end.z);
        const along = startDist > coverRadius && endDist > coverRadius && orderedIdx > 0;
        if (along) {
          speeds.push(speed);
          const radiusAtSpeed = turnRadiusAtSpeed(speed, cruiseSpeed, turn);
          deviations.push({
            wu: absCross,
            turnRadii: radiusAtSpeed > 0 ? absCross / radiusAtSpeed : null,
            speed,
          });
        }

        while (orderedIdx < nodes.length
          && Math.hypot(pos.x - nodes[orderedIdx].x, pos.z - nodes[orderedIdx].z) <= coverRadius) {
          orderedIdx += 1;
        }

        if (orderedIdx > lastProgress) {
          lastProgress = orderedIdx;
          stalled = 0;
        } else {
          stalled += 1;
        }

        const arrived = orderedIdx >= nodes.length && speed < Math.max(8, hullWidthWu * 0.25);
        const parkedNearEnd = endDist <= coverRadius && speed < Math.max(8, hullWidthWu * 0.25)
          && orderedIdx >= nodes.length * 0.9;
        if (arrived || parkedNearEnd) return false;
        if (stalled > STALL_TICKS) return false;
      },
    });

    const followerEngaged = pathAppliedTicks > 0 && (maxProgressS > 1e-3 || pathTotal > 1e-3);
    const orderedCoverage = nodes.length > 0 ? orderedIdx / nodes.length : null;

    if (!followerEngaged) {
      const reason = 'follower never engaged';
      pushTrace(eventTrace, host, `${name}:unmeasured`, { reason, ticksFlown, pathAppliedTicks, maxProgressS });
      return unmeasuredStroke(name, reason, {
        cruiseSpeed,
        hullWidthWu,
        strokeLengthWu,
        ticksFlown,
        pathAppliedTicks,
        pathProgressS: maxProgressS,
        ownerProof,
        proof: host.proof(),
      });
    }
    if (!speeds.length) {
      const reason = 'zero along-path samples';
      pushTrace(eventTrace, host, `${name}:unmeasured`, { reason, ticksFlown, orderedCoverage });
      return unmeasuredStroke(name, reason, {
        cruiseSpeed,
        hullWidthWu,
        strokeLengthWu,
        ticksFlown,
        sampleCount: 0,
        orderedCoverage,
        pathAppliedTicks,
        pathProgressS: maxProgressS,
        ownerProof,
        proof: host.proof(),
      });
    }

    const meanSpeed = mean(speeds);
    const slowestSpeed = Math.min(...speeds);
    const maxDev = deviations.reduce((best, row) => {
      if (!best) return row;
      const bestWu = Number.isFinite(best.wu) ? best.wu : -Infinity;
      const rowWu = Number.isFinite(row.wu) ? row.wu : -Infinity;
      return rowWu > bestWu ? row : best;
    }, null);
    const meanSpeedFraction = cruiseSpeed > 0 ? meanSpeed / cruiseSpeed : null;
    const slowestFraction = cruiseSpeed > 0 ? slowestSpeed / cruiseSpeed : null;

    pushTrace(eventTrace, host, `${name}:done`, {
      ticksFlown,
      meanSpeed,
      slowestSpeed,
      meanSpeedFraction,
      slowestFraction,
      maxDeviationWu: maxDev && maxDev.wu,
      maxDeviationTurnRadii: maxDev && maxDev.turnRadii,
      orderedCoverage,
      pathAppliedTicks,
      pathProgressS: maxProgressS,
    });

    return {
      name,
      unmeasured: false,
      cruiseSpeed,
      hullWidthWu,
      strokeLengthWu,
      ticksFlown,
      sampleCount: speeds.length,
      meanSpeed,
      slowestSpeed,
      meanSpeedFraction,
      slowestFraction,
      maxDeviationWu: maxDev && maxDev.wu,
      maxDeviationTurnRadii: maxDev && maxDev.turnRadii,
      maxDeviationAtSpeed: maxDev && maxDev.speed,
      orderedCoverage,
      stalled: stalled > STALL_TICKS,
      followerEngaged: true,
      pathAppliedTicks,
      pathProgressS: maxProgressS,
      ownerProof,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
  }
}

function bootStrokePlayer(seed, { follower = true } = {}) {
  return bootRealPath({
    seed,
    systems: follower ? FOLLOWER_SYSTEMS : NO_FOLLOWER_SYSTEMS,
    hulls: [{ hullId: HULL_ID, pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free' }],
    profileId: 'production',
  });
}

function armFollowerInput(state, points) {
  writeRealPathInput(state, {});
  const inp = state.input;
  inp.autoFire = true;
  if (!inp.aimWorld) inp.aimWorld = { x: 0, z: 0 };
  if (!inp.actions) inp.actions = {};
  if (!inp.autoTargetPath || inp.autoTargetPath.points !== points) {
    inp.autoTargetPath = {
      active: true,
      drawing: false,
      cursorX: 0,
      cursorY: 0,
      pointIndex: 1,
      points,
    };
  } else {
    inp.autoTargetPath.active = true;
    inp.autoTargetPath.drawing = false;
  }
}

function readOwner(host) {
  const runtime = host && host.runtime;
  if (!runtime || typeof runtime.getSystem !== 'function') return null;
  const owner = runtime.getSystem('autoTargetAssist');
  if (!owner || owner.name !== 'autoTargetAssist' || typeof owner.update !== 'function') return null;
  return owner;
}

function readOwnerProof(host, expectFollower) {
  const owner = readOwner(host);
  const flight = host.runtime && host.runtime.getSystem('flight');
  const physics = host.runtime && host.runtime.getSystem('physics');
  return {
    registered: !!owner,
    name: owner ? owner.name : null,
    hasUpdate: !!(owner && typeof owner.update === 'function'),
    flightRegistered: !!(flight && flight.name === 'flight'),
    physicsRegistered: !!(physics && physics.name === 'physics'),
    expected: expectFollower === true,
    order: expectFollower ? ['autoTargetAssist', 'actions', 'flightV3', 'physics'] : ['actions', 'flightV3', 'physics'],
  };
}

function followerAppliedThisTick(state, owner) {
  const cache = owner && owner._runtime && owner._runtime.path;
  const progressS = cache && Number.isFinite(cache.progressS) ? cache.progressS : 0;
  const total = cache && Number.isFinite(cache.total) ? cache.total : 0;
  const nodes = cache && Array.isArray(cache.nodes) ? cache.nodes.length : 0;
  const inp = state && state.input;
  const command = inp
    ? Math.abs(inp.moveX || 0) + Math.abs(inp.moveZ || 0) + Math.abs(inp.turnIntent || 0)
    : 0;
  const route = inp && inp.autoTargetPath;
  const applied = nodes >= 2 && route && route.active === true && (command > 1e-6 || progressS > 1e-3);
  return { applied, progressS, total, nodes };
}

function instrumentSetupFault({ follower, ownerProof, owner, points, strokeLengthWu, turn }) {
  if (turn && turn.sweepIncomplete) return '90 deg cruise sweep incomplete';
  if (follower && (!ownerProof || ownerProof.registered !== true || !owner)) {
    return 'autoTargetAssist owner not registered';
  }
  if (!follower) return 'autoTargetAssist owner not registered';
  if (!Array.isArray(points) || points.length < 2 || !(strokeLengthWu > 1e-3)) {
    return 'missing or invalid path data';
  }
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      return 'missing or invalid path data';
    }
  }
  return null;
}

function unmeasuredStroke(name, reason, extra = {}) {
  return {
    name,
    unmeasured: true,
    unmeasuredReason: reason,
    cruiseSpeed: extra.cruiseSpeed,
    hullWidthWu: extra.hullWidthWu,
    strokeLengthWu: extra.strokeLengthWu,
    ticksFlown: extra.ticksFlown || 0,
    sampleCount: extra.sampleCount || 0,
    meanSpeed: null,
    slowestSpeed: null,
    meanSpeedFraction: null,
    slowestFraction: null,
    maxDeviationWu: null,
    maxDeviationTurnRadii: null,
    maxDeviationAtSpeed: null,
    orderedCoverage: extra.orderedCoverage == null ? null : extra.orderedCoverage,
    stalled: false,
    followerEngaged: false,
    pathAppliedTicks: extra.pathAppliedTicks || 0,
    pathProgressS: extra.pathProgressS || 0,
    ownerProof: extra.ownerProof,
    proof: extra.proof,
  };
}

function unmeasuredBar(label, unit, reason) {
  const text = String(reason || 'instrument fault');
  return {
    bar: 'B8',
    label,
    value: null,
    unit,
    met: false,
    unmeasured: true,
    note: text.startsWith('UNMEASURED') ? text : `UNMEASURED — ${text}`,
  };
}

function strokeBars(name, row, turn) {
  const reason = barInstrumentReason(row, turn);
  if (reason) {
    return [
      unmeasuredBar(`mean speed along the ${name} stroke, ${HULL_NAME}`, 'fraction of cruise', reason),
      unmeasuredBar(`slowest point on the ${name} stroke, ${HULL_NAME}`, 'fraction of cruise', reason),
      unmeasuredBar(`max deviation from the ink on the ${name} stroke`, 'x turn radius', reason),
      unmeasuredBar(`ordered coverage of the ${name} stroke`, 'fraction', reason),
    ];
  }
  const cruise = row.cruiseSpeed;
  const cruiseNote = `fraction of measured governed cruise ${cruise} WU/s (900-tick full-forward hold after 18-tick settle on bootRealPath, Hitch starter)`;
  const deviationSamples = Number.isFinite(row.maxDeviationTurnRadii) && row.sampleCount > 0;
  return [
    {
      bar: 'B8',
      label: `mean speed along the ${name} stroke, ${HULL_NAME}`,
      value: row.meanSpeedFraction,
      unit: 'fraction of cruise',
      met: Number.isFinite(row.meanSpeedFraction) && row.meanSpeedFraction >= SPEED_FLOOR,
      note: `${cruiseNote}; mean ${row.meanSpeed} WU/s from ${row.sampleCount} real-path ticks along the ink (pads of one hull width at start and end excluded so arrival-hold is not scored as the stroke)`,
    },
    {
      bar: 'B8',
      label: `slowest point on the ${name} stroke, ${HULL_NAME}`,
      value: row.slowestFraction,
      unit: 'fraction of cruise',
      met: Number.isFinite(row.slowestFraction) && row.slowestFraction >= SLOWEST_FLOOR,
      note: `${cruiseNote}; slowest sampled speed ${row.slowestSpeed} WU/s on the same real-path ticks`,
    },
    deviationSamples
      ? {
        bar: 'B8',
        label: `max deviation from the ink on the ${name} stroke`,
        value: row.maxDeviationTurnRadii,
        unit: 'x turn radius',
        met: row.maxDeviationTurnRadii <= DEVIATION_CEILING,
        note: `max ${row.maxDeviationWu} WU from the ink polyline at speed ${row.maxDeviationAtSpeed} WU/s; divided by turn radius at that speed (r = v / ω, ω=${turn.turnRateRadPerS} rad/s from the 90 deg cruise sweep, r_cruise=${turn.turnRadiusWu} WU)`,
      }
      : unmeasuredBar(
        `max deviation from the ink on the ${name} stroke`,
        'x turn radius',
        'empty deviation sample set',
      ),
    {
      bar: 'B8',
      label: `ordered coverage of the ${name} stroke`,
      value: row.orderedCoverage,
      unit: 'fraction',
      met: Number.isFinite(row.orderedCoverage) && row.orderedCoverage >= COVERAGE_FLOOR,
      note: `fraction of resampled ink nodes passed in drawn order on the real path; stroke length ${row.strokeLengthWu} WU, ${row.ticksFlown} ticks`,
    },
  ];
}

function barInstrumentReason(row, turn) {
  if (turn && turn.sweepIncomplete) return '90 deg cruise sweep incomplete';
  if (!row) return 'stroke was not flown';
  if (row.unmeasured) return row.unmeasuredReason || 'instrument fault';
  if (!(row.sampleCount > 0)) return 'zero along-path samples';
  if (!row.followerEngaged) return 'follower never engaged';
  return null;
}

function strokeMetrics(row) {
  return {
    unmeasured: row.unmeasured === true,
    unmeasuredReason: row.unmeasuredReason || null,
    cruiseSpeed: row.cruiseSpeed,
    strokeLengthWu: row.strokeLengthWu,
    ticksFlown: row.ticksFlown,
    sampleCount: row.sampleCount,
    meanSpeed: row.meanSpeed,
    slowestSpeed: row.slowestSpeed,
    meanSpeedFraction: row.meanSpeedFraction,
    slowestFraction: row.slowestFraction,
    maxDeviationWu: row.maxDeviationWu,
    maxDeviationTurnRadii: row.maxDeviationTurnRadii,
    orderedCoverage: row.orderedCoverage,
    stalled: row.stalled,
    followerEngaged: row.followerEngaged === true,
    pathAppliedTicks: row.pathAppliedTicks || 0,
    pathProgressS: row.pathProgressS || 0,
    ownerRegistered: !!(row.ownerProof && row.ownerProof.registered),
  };
}

function worstFraction(rows, key, mode) {
  let worst = null;
  for (const row of rows) {
    if (!row || row.unmeasured) continue;
    const value = row[key];
    if (!Number.isFinite(value)) continue;
    if (worst == null || (mode === 'min' ? value < worst[key] : value > worst[key])) worst = row;
  }
  return worst;
}

// Ink only. These builders lay out the drawn stroke in a local frame (+x along the
// cruise heading, +z to the left). They do not integrate the hull.

function buildCorner({ cruiseSpeed }) {
  const L = cruiseSpeed;
  return [
    { x: 0, z: 0 },
    { x: L, z: 0 },
    { x: L, z: L },
    { x: 2 * L, z: L },
  ];
}

function buildS({ cruiseSpeed, turnRadiusWu }) {
  const R = Math.max(turnRadiusWu * 2, cruiseSpeed * 0.4);
  const lead = Math.max(cruiseSpeed * 0.5, R);
  const pts = [{ x: 0, z: 0 }, { x: lead, z: 0 }];
  const steps = Math.max(16, Math.ceil((Math.PI * R) / Math.max(R * 0.08, 1)));
  appendArc(pts, R, Math.PI, steps);
  appendArc(pts, R, -Math.PI, steps);
  appendAlongHeading(pts, lead);
  return pts;
}

function buildHook({ cruiseSpeed, turnRadiusWu }) {
  const R = Math.max(turnRadiusWu, cruiseSpeed * 0.2);
  const lead = Math.max(cruiseSpeed * 1.5, R * 3);
  const pts = [{ x: 0, z: 0 }, { x: lead, z: 0 }];
  const sixty = Math.PI / 3;
  appendArc(pts, R * 2, sixty, 16);
  appendArc(pts, R * 1.5, sixty, 16);
  appendArc(pts, R, sixty, 16);
  appendAlongHeading(pts, cruiseSpeed);
  return pts;
}

function appendAlongHeading(pts, distance) {
  if (pts.length < 2 || !(distance > 0)) return;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const dx = last.x - prev.x;
  const dz = last.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  pts.push({ x: last.x + (dx / len) * distance, z: last.z + (dz / len) * distance });
}

function appendArc(pts, radius, sweepRad, steps) {
  if (pts.length < 2 || !(radius > 0) || !(steps > 0) || Math.abs(sweepRad) < 1e-9) return;
  const p1 = pts[pts.length - 1];
  const p0 = pts[pts.length - 2];
  const heading = Math.atan2(p1.z - p0.z, p1.x - p0.x);
  const leftX = -Math.sin(heading);
  const leftZ = Math.cos(heading);
  const sign = sweepRad >= 0 ? 1 : -1;
  const cx = p1.x + sign * radius * leftX;
  const cz = p1.z + sign * radius * leftZ;
  const ox = p1.x - cx;
  const oz = p1.z - cz;
  const absSweep = Math.abs(sweepRad);
  for (let i = 1; i <= steps; i++) {
    const a = sign * absSweep * (i / steps);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pts.push({
      x: cx + ox * ca - oz * sa,
      z: cz + ox * sa + oz * ca,
    });
  }
}

function placeInWorld(local, origin, heading) {
  const hx = Math.cos(heading);
  const hz = Math.sin(heading);
  const lx = -hz;
  const lz = hx;
  return local.map((p) => ({
    x: origin.x + p.x * hx + p.z * lx,
    z: origin.z + p.x * hz + p.z * lz,
  }));
}

function coverageSpacing(cruiseSpeed, hullWidthWu) {
  const fromHull = hullWidthWu > 0 ? hullWidthWu * 0.5 : 0;
  const fromCruise = cruiseSpeed > 0 ? cruiseSpeed * REAL_PATH_DT * 8 : 0;
  return Math.max(fromHull, fromCruise, 1);
}

function strokeTickBudget(lengthWu, cruiseSpeed) {
  const crawl = Math.max(cruiseSpeed * 0.15, 1);
  const seconds = (lengthWu / crawl) + 4;
  return Math.max(1200, Math.ceil(seconds / REAL_PATH_DT));
}

function turnRadiusAtSpeed(speed, cruiseSpeed, turn) {
  if (turn.turnRateRadPerS > 0 && speed > 0) return speed / turn.turnRateRadPerS;
  if (turn.turnRadiusWu > 0 && cruiseSpeed > 0) {
    return turn.turnRadiusWu * (speed / cruiseSpeed);
  }
  return Math.max(turn.hullWidthWu, 1e-3);
}

function resampleStroke(points, spacing) {
  if (!points.length) return [];
  const nodes = [{ x: points[0].x, z: points[0].z }];
  let acc = 0;
  let next = spacing;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    while (segLen > 1e-9 && next <= acc + segLen) {
      const t = (next - acc) / segLen;
      nodes.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      next += spacing;
    }
    acc += segLen;
  }
  const last = points[points.length - 1];
  const tail = nodes[nodes.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > 1e-6) {
    nodes.push({ x: last.x, z: last.z });
  }
  return nodes;
}

function nearestOnPolyline(pts, px, pz) {
  let bestSq = Infinity;
  let bestCross = 0;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const segLen = Math.hypot(sx, sz);
    if (segLen > 1e-9) {
      let t = ((px - a.x) * sx + (pz - a.z) * sz) / (segLen * segLen);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = a.x + sx * t;
      const cz = a.z + sz * t;
      const dsq = (px - cx) ** 2 + (pz - cz) ** 2;
      if (dsq < bestSq) {
        bestSq = dsq;
        bestCross = ((px - cx) * -sz + (pz - cz) * sx) / segLen;
      }
    }
    acc += segLen;
  }
  return { cross: bestCross, total: acc };
}

function polylineLength(pts) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return acc;
}

function velocityHeading(entity) {
  const vel = entity && entity.vel;
  const speed = Math.hypot((vel && vel.x) || 0, (vel && vel.z) || 0);
  if (speed > 1e-6) return Math.atan2(vel.z, vel.x);
  return (entity && entity.rot) || 0;
}

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function pushTrace(eventTrace, host, type, extra = {}) {
  const state = host.state;
  eventTrace.push({
    tick: state.tick | 0,
    simTime: state.simTime,
    type,
    ...extra,
  });
}
