// Does the ship fly the line the player drew?
//
// WHY THIS FILE EXISTS. The previous draw-to-fly rebuild shipped with a probe that asserted
// `|moveX| + |moveZ| + |turnIntent| > 0` on a TWO-POINT STRAIGHT LINE. That passes for any
// controller that emits any command at all, including one that flies in a circle. A scratchpad
// probe reported "median cross-track 4.7-18 WU" and the work was called verified; the owner then
// reported the ship "wobbles around the line and never goes where the line goes".
//
// Measured here against the real propulsion kernel, the shipped controller was 50-64 WU from the
// drawn line on EVERY curved stroke, with excursions to 409 WU. The chase camera only shows about
// 93-125 WU of depth, so the hull was leaving the drawn line by more than half a screen.
//
// TWO METRICS ARE REQUIRED AND NEITHER IS SUFFICIENT ALONE:
//
//   * MAGNITUDE (median / max |cross-track|) catches "wandered away from the line". This is what
//     the old controller failed, catastrophically.
//   * SIGN CHANGES per 100 WU flown catches "oscillated across the line". A controller can hug the
//     line on average while sawing back and forth over it, and magnitude alone reports that green.
//
// A third number is a KNOWN TRAP and is deliberately NOT used as a pass condition on its own:
// "progress along the path" reads 1.000 for the OLD controller on every shape, because a hull
// wandering 400 WU wide still eventually passes near the far end of the polyline. Progress proves
// the run terminated, never that the line was followed.
//
// Bounds below carry roughly 3-6x headroom over measured behaviour, so ordinary tuning does not
// turn this red, but a structural regression does. Verified by mutation: zeroing the cross-track
// correction gain, or removing the curvature speed governor, each turns this file red. A third
// mutation is now in scope: restoring per-sample MAX of |curvature| turns the speed bar red, and
// ignoring curvature turns the hairpin slowdown bar red.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAutoTargetRuntime, tickAutoTarget } from '../src/combat/autoTargetMode.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { applyAutoTargetHelmProfile, applyAutoTargetPathProfile } from '../src/systems/flightV3.js';

const DT = 1 / 60;
const MAX_TICKS = 4200;

// ------------------------------------------------------------------ strokes a real hand produces

function straight() {
  const pts = [];
  for (let i = 0; i <= 40; i += 1) pts.push({ x: i * 10, z: 0 });
  return pts;
}

function gentleS() {
  const pts = [];
  for (let i = 0; i <= 90; i += 1) {
    const t = i / 90;
    pts.push({ x: t * 520, z: Math.sin(t * Math.PI * 2) * 70 });
  }
  return pts;
}

function tightSwitchback() {
  const pts = [];
  for (let i = 0; i <= 120; i += 1) {
    const t = i / 120;
    pts.push({ x: t * 420, z: Math.sin(t * Math.PI * 5) * 55 });
  }
  return pts;
}

// The case that breaks naive followers: the stroke bends back toward the hull, so a global
// nearest-point search latches the returning lobe and cuts the circle out. The player drew a loop
// in order to fly it.
function loop() {
  const pts = [];
  for (let i = 0; i <= 30; i += 1) pts.push({ x: i * 6, z: 0 });
  const cx = 180;
  const r = 90;
  for (let i = 0; i <= 100; i += 1) {
    const a = -Math.PI / 2 + (i / 100) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, z: r + Math.sin(a) * r });
  }
  for (let i = 1; i <= 30; i += 1) pts.push({ x: cx + i * 6, z: 0 });
  return pts;
}

// Point spacing is a mouse-sampling artefact, not a property of the route: a slow hand clumps
// points 2 WU apart, a flick leaves 55 WU gaps. A fixed capture radius consumed dozens at once or
// never fired at all, which made every tuning number irreproducible.
function unevenSampling() {
  const pts = [];
  for (let i = 0; i <= 30; i += 1) pts.push({ x: i * 2, z: 0 });
  for (let i = 1; i <= 6; i += 1) pts.push({ x: 60 + i * 55, z: 0 });
  for (let i = 1; i <= 60; i += 1) {
    const t = i / 60;
    pts.push({ x: 390 + t * 120, z: -Math.sin(t * Math.PI) * 80 });
  }
  return pts;
}

// The crawl: a gentle S with the sampling tremor a real hand produces. AUTO_TARGET_PATH_MIN_SCREEN_PX
// is 8; after world projection that is a few WU, and a 1 WU perpendicular wobble is typical pixel
// quantization plus a slightly unsteady stroke. Deterministic LCG — same stroke in, same speeds out.
function handDrawnGentleS() {
  const src = gentleS();
  const pts = [];
  let seed = 0xA5F17C3D;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < src.length; i += 1) {
    const p = src[i];
    const prev = src[i === 0 ? 0 : i - 1];
    const next = src[i === src.length - 1 ? i : i + 1];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.max(Math.hypot(tx, tz), 1e-6);
    const wobble = (rnd() - 0.5) * 2.4;
    pts.push({ x: p.x + (-tz / len) * wobble, z: p.z + (tx / len) * wobble });
  }
  return pts;
}

// A hairpin cannot be flown at cruise by any finite thruster. Following the line here MEANS
// decelerating into the corner; a follower without a speed governor cuts it and runs wide.
function hairpin() {
  const pts = [];
  for (let i = 0; i <= 45; i += 1) pts.push({ x: i * 8, z: 0 });
  for (let i = 1; i <= 24; i += 1) {
    const a = (i / 24) * Math.PI;
    pts.push({ x: 360 + Math.sin(a) * 34, z: 34 - Math.cos(a) * 34 });
  }
  for (let i = 1; i <= 45; i += 1) pts.push({ x: 360 - i * 8, z: 68 });
  return pts;
}

// A stroke whose RETURN leg runs close to its outbound leg. This is what makes the projection
// window load-bearing: a hull displaced toward the return leg is geometrically nearer to the END of
// the path than to the part it has actually reached, so a global nearest-point search snaps
// progress to the finish and the whole hook is skipped. The window plus monotonic progress is the
// only thing that keeps a self-approaching stroke intact.
function hook() {
  const pts = [];
  for (let i = 0; i <= 60; i += 1) pts.push({ x: i * 5, z: 0 });
  for (let i = 1; i <= 20; i += 1) {
    const a = (i / 20) * Math.PI;
    pts.push({ x: 300 + Math.sin(a) * 22, z: 22 - Math.cos(a) * 22 });
  }
  for (let i = 1; i <= 60; i += 1) pts.push({ x: 300 - i * 5, z: 44 });
  return pts;
}

// ------------------------------------------------------------------------------------- geometry

function nearestOnPolyline(pts, px, pz) {
  let bestSq = Infinity;
  let bestS = 0;
  let bestCross = 0;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
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
        bestS = acc + segLen * t;
        bestCross = ((px - cx) * -sz + (pz - cz) * sx) / segLen;
      }
    }
    acc += segLen;
  }
  return { s: bestS, cross: bestCross, total: acc };
}

function polylineLength(pts) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    acc += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return acc;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
}

// --------------------------------------------------------------------------------------- the run

function flyStroke(points, startOffset = { x: 0, z: 0 }) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: points[0].x + startOffset.x, z: points[0].z + startOffset.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 1,
    maxSpeed: 120,
    data: {},
  };
  const state = {
    mode: 'flight',
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player]]),
    settings: { controls: { flightMode: 'assisted' } },
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      brake: false,
      boost: false,
      autoFire: true,
      aimWorld: { x: 0, z: 0 },
      aimAngle: 0,
      autoTargetVector: { active: false },
      autoTargetPath: {
        active: true,
        drawing: false,
        cursorX: 0,
        cursorY: 0,
        pointIndex: 1,
        points,
      },
    },
  };

  const runtime = createAutoTargetRuntime();
  const profile = applyAutoTargetPathProfile(
    applyAutoTargetHelmProfile(resolvePropulsionProfile(player, state)),
  );
  const kernelRuntime = createPropulsionRuntime(profile);
  const total = polylineLength(points);

  // Sample the drawn stroke every ~8 WU; the hull must pass within COVER_RADIUS of each sample.
  const COVER_RADIUS = 25;
  const nodes = [];
  {
    let acc = 0;
    let next = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      while (next <= acc + segLen && segLen > 1e-9) {
        const t = (next - acc) / segLen;
        nodes.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        next += 8;
      }
      acc += segLen;
    }
    if (!nodes.length) nodes.push({ x: points[0].x, z: points[0].z });
  }
  const covered = new Array(nodes.length).fill(false);
  // ORDERED coverage. Plain coverage is a set, and a set does not know about time: a controller that
  // flew the stroke BACKWARDS, or that retraced one leg of a doubled-back path, marks every sample
  // touched and scores 100%. This pointer only advances when the hull reaches the NEXT sample, so it
  // measures the stroke actually being flown in the order the player drew it. A bounded initial skip
  // is allowed for a displaced start, which legitimately rejoins the line ahead of the origin.
  let orderedIdx = 0;
  const ORDERED_SKIP_LIMIT = Math.floor(nodes.length * 0.2);

  const crossSamples = [];
  const signs = [];
  const cruiseSpeeds = [];
  const onTrackSpeeds = [];
  let peakSpeed = 0;
  let flown = 0;
  let bestS = 0;
  let prevX = player.pos.x;
  let prevZ = player.pos.z;
  let stalled = 0;
  let ticks = 0;
  const cruise = Number.isFinite(profile.maxSpeed) && profile.maxSpeed > 0
    ? profile.maxSpeed
    : (Number.isFinite(player.maxSpeed) && player.maxSpeed > 0 ? player.maxSpeed : 120);
  const speedLo = Math.min(80, total * 0.15);
  const speedHi = Math.max(speedLo + 1, total - Math.min(120, total * 0.22));

  for (; ticks < MAX_TICKS; ticks += 1) {
    tickAutoTarget(state, DT, null, runtime);

    const result = stepPropulsion({
      dt: DT,
      body: {
        pos: { ...player.pos },
        vel: { ...player.vel },
        rot: player.rot,
        angVel: player.angVel,
        mass: player.mass,
        inertia: 1,
      },
      input: {
        throttle: state.input.moveZ,
        strafe: state.input.moveX,
        turn: state.input.turnIntent,
        brake: state.input.brake === true,
        boost: false,
      },
      profile,
      runtime: kernelRuntime,
    });

    // Rapier semantics: the kernel emits force/torque, the body owner calls addForce/addTorque and
    // then clamps to maxSpeed. Integrating it the same way here keeps this a test of the CONTROLLER
    // rather than a test of a bespoke toy physics model.
    player.vel.x += ((result.force && result.force.x) || 0) / player.mass * DT;
    player.vel.z += ((result.force && result.force.z) || 0) / player.mass * DT;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const cap = Number.isFinite(result.maxSpeed) && result.maxSpeed > 0 ? result.maxSpeed : Infinity;
    if (speed > cap) {
      player.vel.x *= cap / speed;
      player.vel.z *= cap / speed;
    }
    player.pos.x += player.vel.x * DT;
    player.pos.z += player.vel.z * DT;
    player.angVel += ((result.torque && result.torque.y) || 0) * DT;
    player.rot += player.angVel * DT;
    if (result.runtime) Object.assign(kernelRuntime, result.runtime);

    flown += Math.hypot(player.pos.x - prevX, player.pos.z - prevZ);
    prevX = player.pos.x;
    prevZ = player.pos.z;

    const near = nearestOnPolyline(points, player.pos.x, player.pos.z);
    crossSamples.push(Math.abs(near.cross));
    signs.push(Math.sign(near.cross));
    const nowSpeed = Math.hypot(player.vel.x, player.vel.z);
    if (nowSpeed > peakSpeed) peakSpeed = nowSpeed;
    if (near.s > speedLo && near.s < speedHi) {
      cruiseSpeeds.push(nowSpeed);
      if (Math.abs(near.cross) < 8) onTrackSpeeds.push(nowSpeed);
    }

    // COVERAGE, not "progress". Progress-by-nearest-point is not a completion metric: it reads
    // 1.000 for the OLD controller on every shape (a hull wandering 400 WU wide still passes near
    // the far end), and on a stroke whose return leg runs close to its outbound leg it reads
    // "arrived" before the hull has moved at all. Coverage asks the only honest question — did the
    // hull actually come near EVERY part of the line the player drew — and nothing can fake it.
    if (orderedIdx === 0) {
      for (let n = 0; n <= ORDERED_SKIP_LIMIT && n < nodes.length; n += 1) {
        if (Math.hypot(player.pos.x - nodes[n].x, player.pos.z - nodes[n].z) <= COVER_RADIUS) { orderedIdx = n; break; }
      }
    }
    while (orderedIdx < nodes.length
      && Math.hypot(player.pos.x - nodes[orderedIdx].x, player.pos.z - nodes[orderedIdx].z) <= COVER_RADIUS) {
      orderedIdx += 1;
    }
    let touched = 0;
    for (let n = 0; n < nodes.length; n += 1) {
      if (!covered[n]
        && Math.hypot(player.pos.x - nodes[n].x, player.pos.z - nodes[n].z) <= COVER_RADIUS) {
        covered[n] = true;
      }
      if (covered[n]) touched += 1;
    }
    if (touched > bestS) { bestS = touched; stalled = 0; } else { stalled += 1; }

    if (touched >= nodes.length && Math.hypot(player.vel.x, player.vel.z) < 8) break;
    if (stalled > 900) break;
    assert.ok(Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z),
      'the follower must never command a non-finite state');
    assert.ok(Math.abs(player.pos.x) < 1e5 && Math.abs(player.pos.z) < 1e5,
      'the follower must never fling the hull out of the sector');
  }

  // Sign flips outside a 1 WU dead band, so numerical noise on a perfectly tracked line is not
  // counted as oscillation.
  let flips = 0;
  let lastSign = 0;
  for (let i = 0; i < signs.length; i += 1) {
    if (crossSamples[i] < 1) continue;
    if (signs[i] !== 0 && lastSign !== 0 && signs[i] !== lastSign) flips += 1;
    if (signs[i] !== 0) lastSign = signs[i];
  }

  // A hull that starts displaced legitimately rejoins the line AHEAD of the origin rather than
  // flying backwards to it, so the head of the stroke is correctly skipped. tailCoverage measures
  // the part it is actually obliged to fly.
  const tailFrom = Math.floor(covered.length * 0.2);
  const tail = covered.slice(tailFrom);
  const endNode = nodes[nodes.length - 1];
  return {
    coverage: covered.filter(Boolean).length / covered.length,
    orderedCoverage: orderedIdx / nodes.length,
    tailCoverage: tail.filter(Boolean).length / tail.length,
    // Where the hull actually ENDED. A controller that follows the line perfectly and then never
    // brakes keeps cross-track at zero along the terminal tangent and still scores full coverage --
    // it can finish 1,800 WU past the destination and pass everything else in this file.
    endDistance: Math.hypot(player.pos.x - endNode.x, player.pos.z - endNode.z),
    finalSpeed: Math.hypot(player.vel.x, player.vel.z),
    medianCross: median(crossSamples),
    maxCross: Math.max(...crossSamples),
    flipsPer100: (flips / Math.max(flown, 1)) * 100,
    ticks,
    cruise,
    meanSpeed: mean(cruiseSpeeds),
    p10Speed: percentile(cruiseSpeeds, 0.1),
    p50Speed: percentile(cruiseSpeeds, 0.5),
    p10OnTrack: percentile(onTrackSpeeds, 0.1),
    peakSpeed,
  };
}

// Bounds are ceilings on measured behaviour, not descriptions of it. Reference numbers from the
// landing run are in the trailing comment on each row; the old waypoint chaser is beside them.
const CASES = [
  //                                        median  max   flips/100WU     new / old measured
  ['straight', straight(), 1.5, 4, 0.6], //  0.00   0.00   0.00      |  old  0.00 /  4.74
  ['gentle-s', gentleS(), 4, 12, 1.6], //    0.96   2.67   0.33      |  old 49.75 /129.37
  ['tight-switchback', tightSwitchback(), 6, 18, 2.4], // 1.84 6.30 0.74 | old 62.70 /161.04
  ['loop', loop(), 4, 10, 1.2], //           0.35   1.98   0.22      |  old 63.53 /165.98
  ['uneven-sampling', unevenSampling(), 5, 30, 1.5], // 1.50 13.23 0.50 | old 4.43 /302.07
  ['hairpin', hairpin(), 4, 16, 1.2], // 13.06 WU ≈ 0.19 R_turn (synthetic ≈ 69.7); B8 allows 0.35 R | old 56.94 /408.86
];

for (const [name, points, medianBound, maxBound, flipBound] of CASES) {
  test(`draw-to-fly flies the drawn line: ${name}`, () => {
    const r = flyStroke(points);
    assert.ok(r.coverage >= 0.95,
      `${name}: hull only reached ${(r.coverage * 100).toFixed(1)}% along the drawn stroke`);
    assert.ok(r.medianCross <= medianBound,
      `${name}: median cross-track ${r.medianCross.toFixed(2)} WU exceeds ${medianBound} WU — the hull is not on the line`);
    assert.ok(r.maxCross <= maxBound,
      `${name}: worst cross-track ${r.maxCross.toFixed(2)} WU exceeds ${maxBound} WU — the hull left the line`);
    assert.ok(r.flipsPer100 <= flipBound,
      `${name}: ${r.flipsPer100.toFixed(2)} line crossings per 100 WU exceeds ${flipBound} — the hull is oscillating across the line, not tracking it`);
  });
}

test('a drawn stroke is flown at a speed a player would choose, AND still tracked', () => {
  // Exit gate for the crawl. The tracking assertions above never measured speed — they would pass
  // at 1 WU/s. Cruise in this harness is the follower's governed max (player.maxSpeed = 120; the
  // catalog profile has no maxSpeed, so pathAuthority uses that). A straight holds ~102 WU/s in
  // the mid-stroke; an unjittered gentle S holds ~82. 60% of cruise is 72, just under the real
  // curve and well above the jittered crawl (~36) the old MAX-|k| governor produced.
  const GENTLE_MEDIAN = 4;
  const GENTLE_MAX = 12;
  const GENTLE_FLIPS = 1.6;
  const HAIRPIN_MEDIAN = 4;
  const HAIRPIN_MAX = 16; // measured 13.06 WU ≈ 0.19 R_turn vs B8's 0.35 R; do not loosen further
  const gentle = flyStroke(gentleS());
  const drawn = flyStroke(handDrawnGentleS());
  const pin = flyStroke(hairpin());
  const cruise = drawn.cruise;
  const speedBar = 0.6 * cruise;

  assert.ok(gentle.meanSpeed >= speedBar,
    `gentle-s mid-stroke ${gentle.meanSpeed.toFixed(1)} WU/s is below 60% of cruise ${cruise} (${speedBar.toFixed(1)})`);
  assert.ok(drawn.meanSpeed >= speedBar,
    `hand-drawn gentle-s mid-stroke ${drawn.meanSpeed.toFixed(1)} WU/s is below 60% of cruise ${cruise} (${speedBar.toFixed(1)}) — stroke jitter is still being read as a hairpin`);

  // Vision/B8 pilot-cut law. The previous p10 ≤ 50% of this harness's synthetic 120 WU/s
  // cruise demanded a crawl from a mass-1 hand-integrated fixture — the opposite of "I sketch
  // a trick move, the ship rips through it." A hairpin may leave the ink by up to 0.35 turn
  // radii; mean speed still has to rip, and the slowest on-track sample may not drop below
  // 0.35 of cruise.
  assert.ok(pin.meanSpeed >= 0.70 * cruise,
    `hairpin mean ${pin.meanSpeed.toFixed(1)} WU/s is below 70% of cruise ${cruise} — the follower crawled the vertex instead of cutting it`);
  assert.ok(pin.p10OnTrack >= 0.35 * cruise,
    `hairpin on-track 10th-percentile ${pin.p10OnTrack.toFixed(1)} WU/s is below 35% of cruise ${cruise} — slower than a pilot cut allows`);
  assert.ok(pin.orderedCoverage >= 0.90,
    `hairpin ordered coverage ${(pin.orderedCoverage * 100).toFixed(1)}% — cutting the corner must still fly the stroke in drawn order`);

  for (const [name, r] of [['gentle-s', gentle], ['hand-drawn-gentle-s', drawn]]) {
    assert.ok(r.coverage >= 0.95,
      `${name}: hull only reached ${(r.coverage * 100).toFixed(1)}% along the drawn stroke`);
    assert.ok(r.medianCross <= GENTLE_MEDIAN,
      `${name}: median cross-track ${r.medianCross.toFixed(2)} WU exceeds ${GENTLE_MEDIAN} WU — the hull is not on the line`);
    assert.ok(r.maxCross <= GENTLE_MAX,
      `${name}: worst cross-track ${r.maxCross.toFixed(2)} WU exceeds ${GENTLE_MAX} WU — the hull left the line`);
    assert.ok(r.flipsPer100 <= GENTLE_FLIPS,
      `${name}: ${r.flipsPer100.toFixed(2)} line crossings per 100 WU exceeds ${GENTLE_FLIPS}`);
  }
  assert.ok(pin.medianCross <= HAIRPIN_MEDIAN,
    `hairpin: median cross-track ${pin.medianCross.toFixed(2)} WU exceeds ${HAIRPIN_MEDIAN} WU`);
  assert.ok(pin.maxCross <= HAIRPIN_MAX,
    `hairpin: worst cross-track ${pin.maxCross.toFixed(2)} WU exceeds ${HAIRPIN_MAX} WU`);
});

test('a drawn loop is flown, never cut', () => {
  // The specific regression this guards: a global nearest-point search snaps to the returning lobe
  // of a loop and skips the circle. Progress is measured on the RAW drawn polyline, so reaching the
  // end without covering the loop is impossible to fake.
  const r = flyStroke(loop());
  assert.ok(r.coverage >= 0.95, `loop progress ${r.coverage.toFixed(3)}`);
  assert.ok(r.maxCross <= 10,
    `loop worst cross-track ${r.maxCross.toFixed(2)} WU — a cut loop shows up here as a large excursion`);
});

test('arrival holds position and never deactivates the route', () => {
  // The trail begins AT the hull, so its endpoint is inside any arrival radius the instant drawing
  // starts. Deactivating on arrival destroyed every route at birth in an earlier build: hundreds of
  // stillborn 2-point stubs per stroke, the pen snapping back to the ship, the hull following
  // nothing. Arrival must be a HOLD.
  const points = straight();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: points[points.length - 1].x, z: points[points.length - 1].z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 1,
    maxSpeed: 120,
    data: {},
  };
  const state = {
    mode: 'flight',
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player]]),
    settings: { controls: { flightMode: 'assisted' } },
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      brake: false,
      autoFire: true,
      aimWorld: { x: 0, z: 0 },
      aimAngle: 0,
      autoTargetVector: { active: false },
      autoTargetPath: {
        active: true, drawing: false, cursorX: 0, cursorY: 0, pointIndex: 1, points,
      },
    },
  };
  const runtime = createAutoTargetRuntime();
  for (let i = 0; i < 120; i += 1) tickAutoTarget(state, DT, null, runtime);

  assert.equal(state.input.autoTargetPath.active, true,
    'arrival must not deactivate the route — only the G toggle clears it');
  assert.equal(state.input.moveX, 0, 'a held hull commands no strafe');
  assert.equal(state.input.moveZ, 0, 'a held hull commands no throttle');
  assert.equal(state.input.turnIntent, 0, 'a held hull commands no turn');
});

test('a two-point stub starting under the hull is not stillborn', () => {
  // Regression guard for the original root cause: a stroke's first sample is the hull's own
  // position, so the route is born already "arrived".
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 1, maxSpeed: 120, data: {},
  };
  const state = {
    mode: 'flight', playerId: 1, player: { targetId: null },
    entities: new Map([[1, player]]),
    settings: { controls: { flightMode: 'assisted' } },
    input: {
      moveX: 0, moveZ: 0, turnIntent: 0, brake: false, autoFire: true,
      aimWorld: { x: 0, z: 0 }, aimAngle: 0, autoTargetVector: { active: false },
      autoTargetPath: {
        active: true, drawing: true, cursorX: 0, cursorY: 0, pointIndex: 1,
        points: [{ x: 0, z: 0 }, { x: 0, z: 140 }],
      },
    },
  };
  const runtime = createAutoTargetRuntime();
  tickAutoTarget(state, DT, null, runtime);
  const commanded = Math.abs(state.input.moveX)
    + Math.abs(state.input.moveZ)
    + Math.abs(state.input.turnIntent);
  assert.ok(commanded > 0, 'a fresh stroke drawn away from the hull must command flight');
  assert.equal(state.input.autoTargetPath.active, true, 'the fresh route must stay active');
});

test('the route point index stays inside the source array and never runs backwards', () => {
  // inputCommandSnapshot serializes route.pointIndex into the 47-A golden telemetry, so it must
  // remain a valid, monotonic index into the player's own drawn points.
  const points = gentleS();
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: points[0].x, z: points[0].z }, vel: { x: 0, z: 0 },
    rot: 0, angVel: 0, mass: 1, maxSpeed: 120, data: {},
  };
  const state = {
    mode: 'flight', playerId: 1, player: { targetId: null },
    entities: new Map([[1, player]]),
    settings: { controls: { flightMode: 'assisted' } },
    input: {
      moveX: 0, moveZ: 0, turnIntent: 0, brake: false, autoFire: true,
      aimWorld: { x: 0, z: 0 }, aimAngle: 0, autoTargetVector: { active: false },
      autoTargetPath: {
        active: true, drawing: false, cursorX: 0, cursorY: 0, pointIndex: 1, points,
      },
    },
  };
  const runtime = createAutoTargetRuntime();
  let previous = 0;
  for (let i = 0; i < 400; i += 1) {
    tickAutoTarget(state, DT, null, runtime);
    const idx = state.input.autoTargetPath.pointIndex;
    assert.ok(Number.isSafeInteger(idx), 'pointIndex must stay a safe integer for the snapshot');
    assert.ok(idx >= 1 && idx <= points.length - 1, `pointIndex ${idx} escaped the source array`);
    assert.ok(idx >= previous, 'pointIndex must never run backwards');
    previous = idx;
    // advance the hull along the stroke so progress is exercised
    player.pos.x += 2;
  }
});

// ---------------------------------------------------------------- the displaced-hull cases
//
// These exist because the first version of this file MISSED them, and two mutations survived as a
// result: zeroing the cross-track correction, and widening the projection search to the whole path,
// both stayed green. Both are invisible while the hull starts exactly on the line and tracks it
// perfectly — there is no error for a corrective term to correct, and no ambiguity for a search
// window to resolve. A hull is displaced constantly in the real game: the stroke is drawn ahead of
// a moving ship, collisions shove it, and the player redraws mid-flight.

test('a hull that starts well off the line is pulled back onto it', () => {
  // 55 WU off a gentle S. Without a restoring term the hull merely runs parallel to the stroke,
  // inheriting the offset forward forever, which is exactly the "never goes where the line goes"
  // complaint in its purest form.
  const r = flyStroke(gentleS(), { x: 0, z: 55 });
  assert.ok(r.tailCoverage >= 0.98,
    `displaced hull covered only ${(r.tailCoverage * 100).toFixed(1)}% of the stroke past the rejoin`);
  assert.ok(r.medianCross <= 8,
    `displaced hull median cross-track ${r.medianCross.toFixed(2)} WU — it never rejoined the line`);
  assert.ok(r.maxCross <= 60,
    `displaced hull worst cross-track ${r.maxCross.toFixed(2)} WU exceeded its own 55 WU start offset — it diverged before converging`);
});

test('a hull displaced toward a self-approaching return leg still flies the whole hook', () => {
  // Start 30 WU off the outbound leg — which puts the hull only 14 WU from the RETURN leg, i.e.
  // nearer to the end of the stroke than to the part it has reached. A global nearest-point search
  // snaps progress to the finish here and the hook is never flown.
  const points = hook();
  const r = flyStroke(points, { x: 0, z: 30 });
  assert.ok(r.coverage >= 0.95,
    `hook progress ${r.coverage.toFixed(3)} — progress jumped to the return leg and skipped the hook`);
  assert.ok(r.medianCross <= 10,
    `hook median cross-track ${r.medianCross.toFixed(2)} WU`);
  assert.ok(r.ticks > 200,
    `hook completed in ${r.ticks} ticks — too few to have actually flown ${Math.round(polylineLength(points))} WU`);
});

test('following a long stroke stays cheap enough for a 60 Hz loop', () => {
  // The follower runs every frame on the player path, so its cost is a gameplay property, not a
  // nicety. This guards the arc-length resampling specifically: without it, node count is set by
  // mouse sampling rather than by geometry, and a dense stroke turns the per-frame projection
  // search into thousands of segment tests. Budget is ~40x the measured cost of the correct
  // implementation, so an ordinarily loaded machine cannot make this flaky — only a structural
  // regression can.
  const points = [];
  for (let i = 0; i <= 3000; i += 1) {
    const t = i / 3000;
    points.push({ x: t * 1800, z: Math.sin(t * Math.PI * 9) * 90 });
  }
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 1, maxSpeed: 120, data: {},
  };
  const state = {
    mode: 'flight', playerId: 1, player: { targetId: null },
    entities: new Map([[1, player]]),
    settings: { controls: { flightMode: 'assisted' } },
    input: {
      moveX: 0, moveZ: 0, turnIntent: 0, brake: false, autoFire: true,
      aimWorld: { x: 0, z: 0 }, aimAngle: 0, autoTargetVector: { active: false },
      autoTargetPath: {
        active: true, drawing: false, cursorX: 0, cursorY: 0, pointIndex: 1, points,
      },
    },
  };
  const runtime = createAutoTargetRuntime();
  const started = performance.now();
  for (let i = 0; i < 900; i += 1) {
    tickAutoTarget(state, DT, null, runtime);
    player.pos.x += 2;                       // walk the hull along the stroke
  }
  const elapsed = performance.now() - started;

  // THE SHARP ASSERTION IS STRUCTURAL, NOT TIMED. Node count must be set by the GEOMETRY of the
  // stroke (its arc length) and never by how many samples the mouse happened to emit. A timing
  // budget alone was measured to be a bad gate here: dropping the resample spacing to 0.01 WU costs
  // 18x (7.5 ms -> 135.8 ms for 900 ticks) and blows node count from 835 to 250,277, yet still slid
  // under a generous millisecond budget. Timing is kept only as a loose backstop for other cost
  // regressions, because checks in this repo run alongside browser work and a tight clock is flaky.
  const drawn = polylineLength(points);
  const nodeCount = runtime.path ? runtime.path.nodes.length : Infinity;
  assert.ok(nodeCount <= drawn / 2,
    `the follower built ${nodeCount} nodes for a ${Math.round(drawn)} WU stroke — resampling is keyed to mouse samples, not to arc length, and the per-frame search will not stay frame-safe`);
  assert.ok(elapsed < 250,
    `900 ticks over a 3000-point stroke took ${elapsed.toFixed(1)} ms — the path follower is not frame-safe`);
});

// ---------------------------------------------------------------- adversarial-review regressions
//
// Every case below is a defect an independent reviewer found in the first version of this controller
// and gate, each REPRODUCED here before it was fixed. They are recorded as tests rather than only as
// commit prose because the first version of this file passed while all of them were live — the gate
// agreed with the code instead of checking it.

function mkRoute(points, pos = { x: 0, z: 0 }, drawing = false) {
  const player = {
    id: 1, type: 'ship', alive: true, pos: { ...pos }, vel: { x: 0, z: 0 },
    rot: 0, angVel: 0, mass: 1, maxSpeed: 120, data: {},
  };
  const state = {
    mode: 'flight', playerId: 1, player: { targetId: null },
    entities: new Map([[1, player]]),
    settings: { controls: { flightMode: 'assisted' } },
    input: {
      moveX: 0, moveZ: 0, turnIntent: 0, brake: false, autoFire: true,
      aimWorld: { x: 0, z: 0 }, aimAngle: 0, autoTargetVector: { active: false },
      autoTargetPath: { active: true, drawing, cursorX: 0, cursorY: 0, pointIndex: 1, points },
    },
  };
  return { state, player };
}

function wrapHeading(delta) {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function headingAbs(delta) {
  return Math.abs(wrapHeading(delta));
}

function nodeCut(cache, i) {
  const raw = cache.nodes[i];
  const pilot = cache.pilot[i];
  return Math.hypot(pilot.x - raw.x, pilot.z - raw.z);
}

function cutRuns(cache, eps = 0.25) {
  const runs = [];
  let start = -1;
  const last = cache.planCount - 1;
  for (let i = 1; i < last; i += 1) {
    if (nodeCut(cache, i) > eps) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push({ lo: start, hi: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ lo: start, hi: last - 1 });
  return runs;
}

function headingOf(ax, az, bx, bz) {
  return Math.atan2(bz - az, bx - ax);
}

function planStroke(points) {
  const { state } = mkRoute(points);
  const runtime = createAutoTargetRuntime();
  tickAutoTarget(state, DT, null, runtime);
  return { state, runtime, cache: runtime.path };
}

function assertCorridorMonotoneAndLimits(cache, label) {
  assert.ok(cache && cache.planCount >= 2, `${label}: the follower must publish a cached pilot plan`);
  assert.ok(Array.isArray(cache.pilot) && cache.pilot.length >= cache.planCount,
    `${label}: the pilot centerline must be cached on runtime.path`);
  assert.ok(cache.planCorridor > 0, `${label}: the plan must record the ink corridor used to clamp cuts`);
  assert.equal(cache.pilot[0].x, cache.nodes[0].x, `${label}: pilot must anchor the raw start`);
  assert.equal(cache.pilot[0].z, cache.nodes[0].z, `${label}: pilot must anchor the raw start`);
  const last = cache.planCount - 1;
  assert.equal(cache.pilot[last].x, cache.nodes[last].x, `${label}: pilot must anchor the raw end`);
  assert.equal(cache.pilot[last].z, cache.nodes[last].z, `${label}: pilot must anchor the raw end`);

  let prevRaw = -1;
  let prevPilot = -1;
  let prevX = cache.pilot[0].x;
  let prevZ = cache.pilot[0].z;
  let prevHeading = null;
  let maxCut = 0;
  for (let i = 0; i < cache.planCount; i += 1) {
    const cut = nodeCut(cache, i);
    if (cut > maxCut) maxCut = cut;
    assert.ok(cut <= cache.planCorridor + 1e-6,
      `${label}: pilot node ${i} cuts ${cut.toFixed(3)} WU from raw ink, corridor is ${cache.planCorridor.toFixed(3)} WU`);
    assert.ok(cache.cum[i] + 1e-9 >= prevRaw, `${label}: raw arc mapping must stay monotonic`);
    assert.ok(cache.pilotCum[i] + 1e-9 >= prevPilot, `${label}: pilot arc mapping must stay monotonic`);
    assert.ok(Number.isFinite(cache.vCurve[i]), `${label}: vCurve[${i}] must be finite`);
    assert.ok(Number.isFinite(cache.vLimit[i]), `${label}: vLimit[${i}] must be finite`);
    assert.ok(cache.vLimit[i] >= -1e-9, `${label}: vLimit[${i}] is negative`);
    assert.ok(cache.vLimit[i] <= cache.planCruise + 1e-6,
      `${label}: vLimit[${i}]=${cache.vLimit[i].toFixed(3)} exceeds cruise ${cache.planCruise}`);
    if (i > 0) {
      const step = Math.hypot(cache.pilot[i].x - prevX, cache.pilot[i].z - prevZ);
      assert.ok(step + 1e-9 >= 0, `${label}: pilot step ${i} reversed`);
      if (step > 1e-6) {
        const heading = headingOf(prevX, prevZ, cache.pilot[i].x, cache.pilot[i].z);
        if (prevHeading != null && step > 0.5) {
          const kink = headingAbs(heading - prevHeading);
          assert.ok(kink < Math.PI * 0.9,
            `${label}: pilot heading reversed at node ${i} (${(kink * 180 / Math.PI).toFixed(1)}°)`);
        }
        prevHeading = heading;
      }
    }
    prevRaw = cache.cum[i];
    prevPilot = cache.pilotCum[i];
    prevX = cache.pilot[i].x;
    prevZ = cache.pilot[i].z;
  }
  return maxCut;
}

const PATH_RESAMPLE_FOR_TEST = 3;

function appliedClusters(cache) {
  const out = [];
  const n = cache.clusterCount || 0;
  for (let i = 0; i < n; i += 1) {
    const cluster = cache.clusters[i];
    if (cluster && cluster.radius > PATH_RESAMPLE_FOR_TEST) out.push(cluster);
  }
  return out;
}

function assertFilletCircles(cache, label) {
  const fillets = appliedClusters(cache);
  assert.ok(fillets.length >= 1, `${label}: a concentrated corner must construct a fillet circle`);
  const perpLim = Math.sin(5 * Math.PI / 180);
  for (let i = 0; i < fillets.length; i += 1) {
    const f = fillets[i];
    const rIn = Math.hypot(f.tanInX - f.cx, f.tanInZ - f.cz);
    const rOut = Math.hypot(f.tanOutX - f.cx, f.tanOutZ - f.cz);
    assert.ok(Math.abs(rIn - f.radius) <= 1e-3 * Math.max(1, f.radius),
      `${label}: fillet ${i} entry is ${rIn.toFixed(4)} from center, radius ${f.radius.toFixed(4)}`);
    assert.ok(Math.abs(rOut - f.radius) <= 1e-3 * Math.max(1, f.radius),
      `${label}: fillet ${i} exit is ${rOut.toFixed(4)} from center, radius ${f.radius.toFixed(4)}`);
    const inDot = ((f.tanInX - f.cx) * f.inX + (f.tanInZ - f.cz) * f.inZ) / f.radius;
    const outDot = ((f.tanOutX - f.cx) * f.outX + (f.tanOutZ - f.cz) * f.outZ) / f.radius;
    assert.ok(Math.abs(inDot) <= perpLim,
      `${label}: fillet ${i} radius is not perpendicular to inbound at tanIn (dot ${inDot.toFixed(4)})`);
    assert.ok(Math.abs(outDot) <= perpLim,
      `${label}: fillet ${i} radius is not perpendicular to outbound at tanOut (dot ${outDot.toFixed(4)})`);
  }
}

function assertForwardArcTraversal(cache, label) {
  const fillets = appliedClusters(cache);
  for (let i = 0; i < fillets.length; i += 1) {
    const f = fillets[i];
    const a0 = Math.atan2(f.tanInZ - f.cz, f.tanInX - f.cx);
    const a1 = Math.atan2(f.tanOutZ - f.cz, f.tanOutX - f.cx);
    let sweep = wrapHeading(a1 - a0);
    const theta = wrapHeading(Math.atan2(f.outZ, f.outX) - Math.atan2(f.inZ, f.inX));
    if (sweep * theta < 0) sweep = sweep > 0 ? sweep - Math.PI * 2 : sweep + Math.PI * 2;
    const band = Math.max(0.75, 0.05 * f.radius);
    let prevRel = null;
    let prevHeading = null;
    let onArc = 0;
    for (let j = 1; j < cache.planCount; j += 1) {
      const p = cache.pilot[j];
      const radial = Math.hypot(p.x - f.cx, p.z - f.cz);
      if (Math.abs(radial - f.radius) > band) {
        prevHeading = null;
        continue;
      }
      const rel = wrapHeading(Math.atan2(p.z - f.cz, p.x - f.cx) - a0);
      const along = sweep >= 0 ? rel : -rel;
      if (along < -0.05 || along > Math.abs(sweep) + 0.05) {
        prevHeading = null;
        continue;
      }
      if (prevRel != null) {
        assert.ok(along + 1e-4 >= prevRel,
          `${label}: fillet ${i} arc parameter reversed at node ${j} (${along.toFixed(4)} < ${prevRel.toFixed(4)})`);
        const ds = Math.hypot(p.x - cache.pilot[j - 1].x, p.z - cache.pilot[j - 1].z);
        if (ds > 1e-6 && prevHeading != null) {
          const heading = headingOf(cache.pilot[j - 1].x, cache.pilot[j - 1].z, p.x, p.z);
          const kink = headingAbs(heading - prevHeading);
          const allow = Math.max(8 * Math.PI / 180, 2 * (ds / f.radius) + 5 * Math.PI / 180);
          assert.ok(kink <= allow,
            `${label}: fillet ${i} has a line-to-arc discontinuity at node ${j} (${(kink * 180 / Math.PI).toFixed(1)}°)`);
          prevHeading = heading;
        }
      } else {
        prevHeading = j > 0
          ? headingOf(cache.pilot[j - 1].x, cache.pilot[j - 1].z, p.x, p.z)
          : null;
      }
      prevRel = along;
      onArc += 1;
    }
    assert.ok(onArc >= 2, `${label}: fillet ${i} must sample its constructed arc, got ${onArc} nodes`);
  }
}

function assertTangentJoins(cache, inX, inZ, outX, outZ, label) {
  assertFilletCircles(cache, label);
  assertForwardArcTraversal(cache, label);
  const runs = cutRuns(cache);
  assert.ok(runs.length >= 1, `${label}: a concentrated corner must cut the raw ink`);
  const first = runs[0].lo;
  const lastCut = runs[runs.length - 1].hi;
  assert.ok(first >= 1 && lastCut + 1 < cache.planCount,
    `${label}: cut join must sit between untouched raw inbound and outbound`);
  const inHeading = Math.atan2(inZ, inX);
  const outHeading = Math.atan2(outZ, outX);
  const lim = 5 * Math.PI / 180;
  const joinIn = headingOf(
    cache.pilot[first - 1].x, cache.pilot[first - 1].z,
    cache.pilot[first].x, cache.pilot[first].z,
  );
  const joinOut = headingOf(
    cache.pilot[lastCut].x, cache.pilot[lastCut].z,
    cache.pilot[lastCut + 1].x, cache.pilot[lastCut + 1].z,
  );
  assert.ok(headingAbs(joinIn - inHeading) <= lim,
    `${label}: first changed segment ${(joinIn * 180 / Math.PI).toFixed(1)}° is not tangent to inbound ${(inHeading * 180 / Math.PI).toFixed(1)}°`);
  assert.ok(headingAbs(joinOut - outHeading) <= lim,
    `${label}: last changed segment ${(joinOut * 180 / Math.PI).toFixed(1)}° is not tangent to outbound ${(outHeading * 180 / Math.PI).toFixed(1)}°`);
}

function assertPilotCacheReuse(state, runtime, cache, label) {
  const pilot = cache.pilot;
  const snapshot = [];
  for (let i = 0; i < cache.planCount; i += 1) snapshot.push({ x: cache.pilot[i].x, z: cache.pilot[i].z });
  tickAutoTarget(state, DT, null, runtime);
  assert.equal(runtime.path, cache, `${label}: same geometry must keep the runtime.path identity`);
  assert.equal(runtime.path.pilot, pilot, `${label}: same geometry must keep the cached pilot array identity`);
  for (let i = 0; i < cache.planCount; i += 1) {
    assert.equal(cache.pilot[i].x, snapshot[i].x, `${label}: reused pilot[${i}].x moved`);
    assert.equal(cache.pilot[i].z, snapshot[i].z, `${label}: reused pilot[${i}].z moved`);
  }
}

function smearedCorner() {
  const deg = (d) => d * Math.PI / 180;
  const pts = [{ x: 0, z: 0 }];
  let x = 0;
  let z = 0;
  let h = 0;
  const legs = [120, 18, 18, 120];
  const turns = [deg(15), deg(30), deg(15)];
  for (let i = 0; i < legs.length; i += 1) {
    x += Math.cos(h) * legs[i];
    z += Math.sin(h) * legs[i];
    pts.push({ x, z });
    if (i < turns.length) h += turns[i];
  }
  return pts;
}

function adjacentCorners() {
  return [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 40 },
    { x: 200, z: 40 },
  ];
}

test('a replaced route is not flown using the previous route geometry', () => {
  // Every stroke starts at the hull, so two consecutive strokes drawn from a stationary ship share a
  // head. When they also shared a point count the cache was reused wholesale and the ship flew the
  // OLD line. Reproduced: route A (0,0)->(120,0) then route B (0,0)->(0,120) left the hull thrusting
  // along +X while the player's line went +Z.
  const lastNode = (rt) => rt.path && rt.path.nodes[rt.path.nodes.length - 1];

  // (a) the mode STAYS ON and the player simply draws again. This is the ordinary case -- input
  // replaces the route object mid-flight -- and it is the one that needs the cache KEY, because no
  // toggle intervenes to clear anything. Testing only the toggle path passes for the wrong reason.
  const live = createAutoTargetRuntime();
  const a1 = mkRoute([{ x: 0, z: 0 }, { x: 120, z: 0 }]);
  tickAutoTarget(a1.state, DT, null, live);
  const b1 = mkRoute([{ x: 0, z: 0 }, { x: 0, z: 120 }]);
  tickAutoTarget(b1.state, DT, null, live);
  const redrawn = lastNode(live);
  assert.ok(redrawn, 'the redrawn route must build a cache');
  assert.ok(Math.abs(redrawn.z) > 100 && Math.abs(redrawn.x) < 10,
    `redraw while the mode is on still uses the previous geometry (last node ${JSON.stringify(redrawn)})`);

  // (b) and across a G toggle, where the cache must not outlive the mode.
  const toggled = createAutoTargetRuntime();
  const a2 = mkRoute([{ x: 0, z: 0 }, { x: 120, z: 0 }]);
  tickAutoTarget(a2.state, DT, null, toggled);
  a2.state.input.autoFire = false;
  tickAutoTarget(a2.state, DT, null, toggled);
  assert.equal(toggled.path, null, 'turning the mode off must drop the resampled route');
  const b2 = mkRoute([{ x: 0, z: 0 }, { x: 0, z: 120 }]);
  tickAutoTarget(b2.state, DT, null, toggled);
  const afterToggle = lastNode(toggled);
  assert.ok(afterToggle && Math.abs(afterToggle.z) > 100 && Math.abs(afterToggle.x) < 10,
    `after a G toggle the follower still uses the previous geometry (last node ${JSON.stringify(afterToggle)})`);
});

test('a hull knocked off the line near the end flies back instead of parking', () => {
  // Arc-length remaining said "nearly there" while the hull sat 50 WU off the drawn line, so HOLD
  // zeroed every command and the ship stayed half a screen wide of the stroke, permanently.
  const { state, player } = mkRoute([{ x: 0, z: 0 }, { x: 120, z: 0 }]);
  const runtime = createAutoTargetRuntime();
  for (let i = 0; i < 200; i += 1) {
    player.pos.x = Math.min(110, player.pos.x + 1);
    tickAutoTarget(state, DT, null, runtime);
  }
  player.pos.x = 110; player.pos.z = 50; player.vel.x = 0; player.vel.z = 0;
  tickAutoTarget(state, DT, null, runtime);
  const effort = Math.abs(state.input.moveX) + Math.abs(state.input.moveZ);
  assert.ok(effort > 0.2,
    `a hull 50 WU off the line commanded ${effort.toFixed(3)} of thrust — it is parked off the stroke`);
});

test('degenerate route points cannot hang the frame or emit a non-finite command', () => {
  // A segment between two finite-but-huge points has an INFINITE length, which made the resampler's
  // step SPACING/Infinity = 0. The cursor never advanced, the loop condition never went false, and
  // the tick never returned — a permanent freeze, reproduced at over 12 seconds for a single frame.
  const cases = [
    ['infinite-length segment', [{ x: 0, z: 0 }, { x: Number.MAX_VALUE, z: Number.MAX_VALUE }]],
    ['NaN sample', [{ x: 0, z: 0 }, { x: NaN, z: 10 }, { x: 0, z: 120 }]],
    ['huge finite route', [{ x: 0, z: 0 }, { x: 1e8, z: 0 }]],
    ['coincident points', [{ x: 5, z: 5 }, { x: 5, z: 5 }, { x: 5, z: 5 }]],
  ];
  for (const [label, points] of cases) {
    const { state } = mkRoute(points);
    const started = performance.now();
    tickAutoTarget(state, DT, null, createAutoTargetRuntime());
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 250, `${label}: one tick took ${elapsed.toFixed(0)} ms — the frame is hanging`);
    for (const k of ['moveX', 'moveZ', 'turnIntent']) {
      assert.ok(Number.isFinite(state.input[k]), `${label}: ${k} is not finite`);
      assert.ok(state.input[k] >= -1 && state.input[k] <= 1, `${label}: ${k} escaped [-1,1]`);
    }
  }
});

test('a short stroke still being drawn is not treated as already arrived', () => {
  // The arrival test elsewhere in this file uses drawing:false on a long route, so a regression that
  // deactivates a SHORT and actively GROWING stroke would not be seen. The trail begins at the hull,
  // so this is the exact shape of the original stillborn-route bug.
  const points = [{ x: 0, z: 0 }, { x: 5, z: 0 }];
  const { state } = mkRoute(points, { x: 0, z: 0 }, true);
  const runtime = createAutoTargetRuntime();
  tickAutoTarget(state, DT, null, runtime);
  assert.equal(state.input.autoTargetPath.active, true, 'a five-WU growing stroke must stay active');

  for (let i = 1; i <= 30; i += 1) points.push({ x: 5 + i * 6, z: 0 });
  tickAutoTarget(state, DT, null, runtime);
  const effort = Math.abs(state.input.moveX) + Math.abs(state.input.moveZ) + Math.abs(state.input.turnIntent);
  assert.ok(effort > 0, 'commands must resume once the stroke extends away from the hull');
  assert.equal(state.input.autoTargetPath.active, true, 'the growing route must remain active');
});

test('the hull settles at the end of the stroke instead of sailing past it', () => {
  // A controller that tracks the line perfectly and never brakes keeps cross-track at zero along the
  // terminal tangent and scores full coverage, so every other assertion in this file passes while the
  // ship finishes hundreds of WU beyond the destination.
  for (const [name, points] of [['straight', straight()], ['gentle-s', gentleS()], ['hairpin', hairpin()]]) {
    const r = flyStroke(points);
    assert.ok(r.endDistance <= 45,
      `${name}: hull finished ${r.endDistance.toFixed(1)} WU from the end of the stroke`);
    assert.ok(r.finalSpeed <= 12,
      `${name}: hull finished at ${r.finalSpeed.toFixed(1)} WU/s — it never braked`);
  }
});

test('the stroke is flown in the order it was drawn, not merely touched', () => {
  // Coverage is a set and a set has no sense of time: flying a stroke BACKWARDS, or retracing one leg
  // of a doubled-back path, touches every sample and scores 100%.
  for (const [name, points] of [['gentle-s', gentleS()], ['loop', loop()], ['hairpin', hairpin()]]) {
    const r = flyStroke(points);
    assert.ok(r.orderedCoverage >= 0.9,
      `${name}: only ${(r.orderedCoverage * 100).toFixed(1)}% of the stroke was flown in drawn order`);
  }
});

test('the pilot centerline stays inside the B8 corridor and maps monotonically to the raw ink', () => {
  // A right-angle the production corner stroke also uses: two 90° vertices on long legs.
  // The planner must cut those vertices without leaving a 0.35-turn-radius tube around the
  // raw resampled ink, and the pilot arc must stay a monotonic reparameterization of raw s.
  const points = [
    { x: 0, z: 0 },
    { x: 120, z: 0 },
    { x: 120, z: 120 },
    { x: 240, z: 120 },
  ];
  const { state, runtime, cache } = planStroke(points);
  const maxCut = assertCorridorMonotoneAndLimits(cache, 'right-angle');
  assert.ok(maxCut > 0.5,
    `a 90° vertex must be cut, not treated as mandatory ink (max cut ${maxCut.toFixed(3)} WU)`);
  assertTangentJoins(cache, 1, 0, 1, 0, 'right-angle');
  assertPilotCacheReuse(state, runtime, cache, 'right-angle');
});

test('a smeared 15+30+15 corner is filleted from cluster-boundary tangents', () => {
  const points = smearedCorner();
  const { state, runtime, cache } = planStroke(points);
  const maxCut = assertCorridorMonotoneAndLimits(cache, 'smeared');
  assert.ok(maxCut > 0.5,
    `a smeared 60° corner must be cut (max cut ${maxCut.toFixed(3)} WU)`);
  const outHeading = 60 * Math.PI / 180;
  assertTangentJoins(cache, 1, 0, Math.cos(outHeading), Math.sin(outHeading), 'smeared');
  assertPilotCacheReuse(state, runtime, cache, 'smeared');
});

test('adjacent corners cannot overlap or overwrite each other', () => {
  const points = adjacentCorners();
  const { state, runtime, cache } = planStroke(points);
  const maxCut = assertCorridorMonotoneAndLimits(cache, 'adjacent');
  assert.ok(maxCut > 0.5,
    `each 90° vertex must be cut (max cut ${maxCut.toFixed(3)} WU)`);
  assertTangentJoins(cache, 1, 0, 1, 0, 'adjacent');
  const runs = cutRuns(cache);
  assert.ok(runs.length >= 2,
    `two adjacent 90° corners must produce two cut-runs, got ${runs.length}`);
  assert.ok(runs[0].hi + 1 < runs[1].lo,
    `adjacent fillets overlap: first run ends at ${runs[0].hi}, second starts at ${runs[1].lo}`);
  let uncut = 0;
  for (let i = runs[0].hi + 1; i < runs[1].lo; i += 1) {
    if (nodeCut(cache, i) <= 0.25) uncut += 1;
  }
  assert.ok(uncut >= 1,
    'the intervening straight between adjacent corners must keep at least one uncut node');
  assertPilotCacheReuse(state, runtime, cache, 'adjacent');
});

test('a short smeared corner uses the available tangent legs without losing coverage', (t) => {
  const points = [{ x: 0, z: 0 }];
  let x = 0;
  let z = 0;
  let heading = 0;
  const legs = [15, 18, 18, 15];
  const turns = [15, 30, 15, 0];
  for (let i = 0; i < legs.length; i += 1) {
    x += Math.cos(heading) * legs[i];
    z += Math.sin(heading) * legs[i];
    points.push({ x, z });
    heading += turns[i] * Math.PI / 180;
  }
  const { state, runtime, cache } = planStroke(points);
  assertCorridorMonotoneAndLimits(cache, 'short smeared');
  assert.equal(appliedClusters(cache).length, 1,
    'a short straight leg still permits a circle measured from its virtual intersection');
  assertFilletCircles(cache, 'short smeared');
  assertForwardArcTraversal(cache, 'short smeared');
  assertPilotCacheReuse(state, runtime, cache, 'short smeared');
  const flown = flyStroke(points);
  assert.ok(flown.orderedCoverage >= 0.9, 'the short fallback must still fly the stroke in order');
  assert.ok(Number.isFinite(flown.meanSpeed) && flown.meanSpeed > 0,
    'the short fallback must move through the turn');
  t.diagnostic(`short smeared synthetic: mean/cruise=${flown.meanSpeed / flown.cruise}, p10/cruise=${flown.p10Speed / flown.cruise}, coverage=${flown.orderedCoverage}, maxDeviation=${flown.maxCross} WU`);
  const straightControl = flyStroke([{ x: 0, z: 0 }, { x: 66, z: 0 }]);
  t.diagnostic(`same-length straight synthetic from rest: mean/cruise=${straightControl.meanSpeed / straightControl.cruise}, p10/cruise=${straightControl.p10Speed / straightControl.cruise}, coverage=${straightControl.orderedCoverage}`);
});

test('the route point index advances across the stroke rather than sitting at 1', () => {
  // A constant pointIndex of 1 is in range, safe and monotonic, so the earlier assertions accepted it
  // while telemetry and any consumer would report a route that never progressed.
  const points = gentleS();
  const { state, player } = mkRoute(points, { x: points[0].x, z: points[0].z });
  const runtime = createAutoTargetRuntime();
  for (let i = 0; i < points.length; i += 1) {
    player.pos.x = points[i].x;
    player.pos.z = points[i].z;
    tickAutoTarget(state, DT, null, runtime);
  }
  const idx = state.input.autoTargetPath.pointIndex;
  assert.ok(idx >= (points.length - 1) * 0.7,
    `pointIndex ended at ${idx} of ${points.length - 1} after walking the whole stroke — it is not tracking progress`);
});
