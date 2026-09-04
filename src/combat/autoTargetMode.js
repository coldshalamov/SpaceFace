// Auto-target combat mode: G owns weapon lead plus the clutchable draw-to-fly trackpad route.
//
// TARGET RECONCILIATION (the "two variables" rule). There are two target-ish values on the player:
//   state.player.targetId        — the player's SELECTION. It seeds a newly latched throw's
//                                  transient releaseTarget and still drives self-sling aim, the
//                                  target panel, hails, and wingman attack orders. Once latched,
//                                  only explicit aim intent may repaint the throw destination.
//                                  Not ours to overwrite.
//   state.player.tether.targetId — what the Massline is physically attached to.
// The GUN target is neither of those directly: it is derived from both by resolvePlayerGunTarget()
// below, and every gunnery consumer (fire path, missile lock, auto-aim, reticle lead) must ask that
// one function so they cannot drift apart. The rule is: a line on a hostile ship IS the firing
// solution, for as long as the line is attached. Latching is a deliberate press on a visible,
// loud object, and cutting is one key — so this needs no hidden override, and the old failure
// (orbiting your catch while the guns tracked a nearer third ship) cannot recur.
import { solveLeadAngle } from '../systems/weapons.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { wrapAngle } from '../core/rng.js';
import { massline2Flag } from '../data/featureFlags.js';
import { solveTetherLeadSolution, orbitalConstraintState, masslineOwnsGuns } from './tetherFireControl.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { applyAutoTargetHelmProfile, applyAutoTargetPathProfile } from '../systems/flightV3.js';

export const AUTO_TARGET_REFRESH_S = 0.12;
const RETICLE_EDGE_MARGIN = 28;
const AUTO_TARGET_HEADING_SOFT_ANGLE = 0.42;
const AUTO_TARGET_PATH_POINT_RADIUS = 20;
const AUTO_TARGET_PATH_ARRIVAL_RADIUS = 18;
const AUTO_TARGET_PATH_FULL_THRUST_DISTANCE = 100;
const AUTO_TARGET_PATH_SETTLE_SPEED = 8;

export function createAutoTargetRuntime() {
  return { refreshT: 0 };
}

export function toggleAutoTarget(state, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  if (!inp) return false;
  inp.autoFire = !inp.autoFire;
  if (inp.autoFire) {
    runtime.refreshT = AUTO_TARGET_REFRESH_S;
    if (bus) bus.emit('ui:targetNearestHostileToPlayer');
  } else {
    runtime.refreshT = 0;
    if (inp.autoAim) inp.autoAim = null;
  }
  if (bus) {
    bus.emit('toast', {
      text: inp.autoFire ? 'Auto-target ON · draw to fly' : 'Auto-target OFF',
      kind: 'info',
      ttl: 2,
    });
  }
  return inp.autoFire;
}

export function lockedHostileEntity(state) {
  const id = state && state.player && state.player.targetId;
  if (id == null || !state.entities || !state.entities.get) return null;
  const e = state.entities.get(id);
  if (!e || e.alive === false || !e.pos) return null;
  if (e.type !== 'ship' && e.type !== 'drone') return null;
  return e;
}

/**
 * The hostile ship/drone currently on the player's Massline, or null. Asteroids and friendlies
 * deliberately do NOT claim the guns: while you are swinging a rock you must still be able to shoot
 * whatever you are swinging it at.
 */
export function tetheredGunTarget(state) {
  if (!massline2Flag('fireControl')) return null;
  const tether = state && state.player && state.player.tether;
  if (!tether || tether.targetId == null) return null;
  if (!state.entities || !state.entities.get) return null;
  const e = state.entities.get(tether.targetId);
  const player = state.entities.get(state.playerId);
  if (!e || !player) return null;
  return masslineOwnsGuns(tether, e, isHostileToPlayer(e, player.team, state)) ? e : null;
}

/**
 * The single answer to "what are the player's guns shooting at". See the reconciliation note at the
 * top of this file. Pure read — never writes state.player.targetId.
 */
export function resolvePlayerGunTarget(state) {
  return tetheredGunTarget(state) || lockedHostileEntity(state);
}

// Representative projectile speed for the SHIP-LEVEL aim angle and the reticle lead pip — the
// primary (first) mount, deliberately, because the pip can only draw one lead and the primary is the
// gun the player reads as "mine". This is NOT the whole battery's solution: a mixed battery
// (pulse 320 / autocannon 420 / railgun 700) re-solves per mount inside
// weapons._serviceProjectileWeapon, which is why tickAutoTarget publishes `input.autoAim` below.
function playerLeadSpeed(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player) return 360;
  const weapons = player.data && player.data.weapons;
  if (weapons && weapons.length) {
    for (const weapon of weapons) {
      const speed = weapon.projSpeed != null ? weapon.projSpeed : 0;
      if (speed > 0) return speed;
    }
  }
  return 360;
}

export function computeLockedLeadPoint(state) {
  const tethered = tetheredGunTarget(state);
  const target = tethered || lockedHostileEntity(state);
  if (!target) return null;
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || !target.pos) return target.pos || null;
  const shooter = { pos: player.pos, vel: player.vel || { x: 0, z: 0 }, mass: player.mass };
  const victim = { pos: target.pos, vel: target.vel || { x: 0, z: 0 }, mass: target.mass };
  const speed = playerLeadSpeed(state);
  // If the guns are on a tethered hostile that is arcing about us, the pip must show the SAME
  // constrained solution the fire path uses. Drawing a linear lead over a circular solve is the
  // reticle telling the player a lie the guns will not honour.
  const angle = tethered
    ? solveTetherLeadSolution(shooter, victim, speed, {
      taut: orbitalConstraintState(shooter, victim).constrained,
    }).angle
    : solveLeadAngle(shooter, victim, speed);
  const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) || 180;
  return {
    x: player.pos.x + Math.cos(angle) * distance,
    z: player.pos.z + Math.sin(angle) * distance,
  };
}

export function tickAutoTarget(state, dt, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  // Clear only when the marker is actually present: assigning `null` unconditionally would mint the
  // key on every input object in the game and change the 47-A snapshot hash for a field nothing in
  // that replay reads.
  if (!inp || !inp.autoFire) {
    if (inp && inp.autoAim) inp.autoAim = null;
    runtime.refreshT = 0;
    // Drop the resampled route with the mode. Without this the cache outlived a G toggle and the
    // next stroke could be matched against the previous one's geometry.
    runtime.path = null;
    return;
  }
  const player = state.entities && state.entities.get(state.playerId);
  if (!player || !player.pos) {
    if (inp.autoAim) inp.autoAim = null;
    return;
  }

  const target = resolvePlayerGunTarget(state);
  if (target) {
    const lead = computeLockedLeadPoint(state) || target.pos;
    inp.aimAngle = Math.atan2(lead.z - player.pos.z, lead.x - player.pos.x);
    inp.aimWorld.x = lead.x;
    inp.aimWorld.z = lead.z;
  }
  // Publish WHOSE lead this aim angle is. inp.aimAngle can only carry one solution, and it is the
  // primary mount's; a mixed battery gimbaled to it fires every other barrel on the wrong intercept.
  // weapons re-solves per mount when this marker is present, and ONLY then — an aim angle the player
  // set with the cursor must never be silently re-led out from under their hand.
  // Transient per-frame aim provenance, never serialized: mutated in place so a 60 Hz auto-target
  // hold allocates nothing.
  if (target) {
    const marker = inp.autoAim && typeof inp.autoAim === 'object'
      ? inp.autoAim
      : (inp.autoAim = { targetId: null, leadSpeed: 0 });
    marker.targetId = target.id;
    marker.leadSpeed = playerLeadSpeed(state);
  } else if (inp.autoAim) {
    inp.autoAim = null;
  }

  const pathApplied = followAutoTargetPath(inp, player, state, runtime);
  const vector = inp.autoTargetVector;
  if (!pathApplied && vector && vector.active) {
    const rawX = finite(vector.worldX);
    const rawZ = finite(vector.worldZ);
    const length = Math.hypot(rawX, rawZ);
    const magnitude = Math.max(0, Math.min(1,
      Number.isFinite(vector.magnitude) ? vector.magnitude : length));
    if (length > 1e-6 && magnitude > 0) {
      applyWorldFlightCommand(
        inp,
        player,
        rawX / length,
        rawZ / length,
        magnitude,
      );
    }
  }

  runtime.refreshT = Math.max(0, (runtime.refreshT || 0) - dt);
  if (runtime.refreshT <= 0) {
    runtime.refreshT = AUTO_TARGET_REFRESH_S;
    if (bus) bus.emit('ui:targetNearestHostileToPlayer', { quiet: true });
  }
}

// -------------------------------------------------------------------------------------------------
// DRAW-TO-FLY PATH FOLLOWER
//
// The player draws a line; the hull flies THAT LINE. Not "toward points that were on it".
//
// The previous implementation was a waypoint chaser: pick points[i], thrust straight at it, advance
// when close or when a projection test said "passed". Three compounding defects made the hull wobble
// around the line instead of tracking it, and none of them were tuning:
//
//   1. It never measured perpendicular distance to the PATH - only distance to a POINT. Nothing in
//      the loop pulled a displaced hull back onto the line, so an offset was never corrected, only
//      inherited by the next point.
//   2. It commanded a DIRECTION OF TRAVEL and thrust along it. For an inertial body already sliding
//      sideways, thrusting at a point you are sweeping past produces an orbit around it. That is the
//      wobble, mechanically. The fix is to command a VELOCITY ERROR (desired minus actual), which is
//      an acceleration, which is what a thruster actually delivers.
//   3. Thrust was pinned at magnitude 1 until the last point, so on a tight drawn curve the required
//      centripetal acceleration exceeded thrust authority. The hull physically could not corner, ran
//      wide, and the "have I passed it" test then fired on stale segments and scrambled the index.
//
// A fourth defect made any tuning irreproducible: point spacing is a mouse-sampling artefact. A slow
// stroke clumps points 2 WU apart, a fast one leaves 60 WU gaps, so a fixed 20 WU capture radius
// consumed dozens of points at once or never fired at all. The path is resampled to uniform arc
// length before anything reads it.
//
// TWO INVARIANTS SURVIVE FROM THE LAST REBUILD. Do not "simplify" either one away:
//
//   * ARRIVAL IS A HOLD, NEVER A KILL. The trail begins AT the hull, so its endpoint is inside any
//     arrival radius the instant drawing starts. Deactivating on arrival destroyed every route at
//     birth - hundreds of stillborn 2-point stubs per stroke, the pen snapping back to the ship. Only
//     the G toggle / mode reset clears a route.
//   * PROGRESS IS MONOTONIC AND THE SEARCH IS WINDOWED. A drawn loop bends back toward the hull, so a
//     global nearest-point snap latches the wrong lobe and cuts the loop out. The player draws a loop
//     in order to fly it. Progress only ever advances, and only inside a bounded window.
//
// Cache lives on the runtime object, NOT on the route: route fields are serialized into the 47-A
// golden telemetry (inputCommandSnapshot.js reads active/drawing/cursor/pointIndex/pointCount/
// first/last), and minting new keys there would move the replay hash.
// -------------------------------------------------------------------------------------------------

const PATH_RESAMPLE_SPACING = 3;          // WU between resampled nodes; kills mouse-sampling artefacts
const PATH_LOOKAHEAD_MIN = 15;            // WU - carrot distance at rest
const PATH_LOOKAHEAD_PER_SPEED = 0.3;     // WU of extra carrot per WU/s of speed
const PATH_LOOKAHEAD_MAX = 58;
const PATH_CORRIDOR = 16;                 // cross-track error (WU) at which the restoring pull saturates
const PATH_CORRECTION_GAIN = 1.35;        // how hard the corridor steers back onto the line
const PATH_PROJECTION_WINDOW = 30;        // WU of path searched ahead of committed progress
const PATH_PROJECTION_BACK = 6;           // WU of slack behind it, so a shoved hull is not stranded
const PATH_CURVE_STENCIL = 8;             // nodes either side: 24 WU chord — ship turning scale, not 8-px jitter
const PATH_VELOCITY_ERROR_FULL = 26;      // velocity error (WU/s) that commands full thrust
const PATH_CORNER_FLOOR_SPEED = 14;       // hairpins throttle down to this, never to a deadlock
const PATH_BRAKE_MARGIN = 6;              // WU/s over the governed speed before the brake is asserted
const PATH_MAX_NODES = 8192;              // ~24 km of stroke at 3 WU spacing; bounds one cache build
const PATH_REST_SPEED = 1;                // below this the hull is genuinely stopped, not coasting              // WU/s over the governed speed before the brake is asserted
const PATH_PILOT_RADIUS_MULT = 1.3;       // desired centerline radius ≈ 1.3× physical turn radius
const PATH_PILOT_CORRIDOR_R = 0.35;       // max cut from raw ink, in turn radii (B8 tube)
const PATH_PILOT_CORNER_TURN = 0.44;      // ~25° concentrated turn is a vertex worth filleting
const PATH_PILOT_CORNER_PEAK = 0.22;      // ~13° — a vertex, not a 3° sample on a gentle S
const PATH_PILOT_CORNER_TURNS = 6;        // smeared 15+30+15 is 3 vertices; a sine peak has ~10
const PATH_PILOT_TURN_SEED = 0.05;        // rad — cluster adjacent heading changes into one corner
const PATH_PILOT_TRACK_SLACK = 6;         // WU left for tracking error inside the 0.35 R tube

function appendResampledPoint(cache, x, z, sourceIndex) {
  let ax = cache.tailX;
  let az = cache.tailZ;
  let dx = x - ax;
  let dz = z - az;
  let dist = Math.hypot(dx, dz);
  // A SEGMENT WHOSE LENGTH OVERFLOWS TO Infinity HUNG THE GAME FOREVER. With two finite but huge
  // endpoints, Math.hypot returns Infinity, the step becomes SPACING/Infinity = 0, the cursor never
  // advances, and `dist >= SPACING` stays true for good: the frame never returns. Reproduced, not
  // theorised -- a single tick failed to complete in 12 seconds. Bail on any non-finite distance,
  // and cap node count so an absurd-but-finite stroke cannot allocate its way to a stall either.
  if (!Number.isFinite(dist)) return;
  while (dist >= PATH_RESAMPLE_SPACING && cache.nodes.length < PATH_MAX_NODES) {
    const step = PATH_RESAMPLE_SPACING / dist;
    ax += dx * step;
    az += dz * step;
    cache.total += PATH_RESAMPLE_SPACING;
    cache.nodes.push({ x: ax, z: az });
    cache.cum.push(cache.total);
    cache.src.push(sourceIndex);
    dx = x - ax;
    dz = z - az;
    dist = Math.hypot(dx, dz);
  }
  cache.tailX = ax;
  cache.tailZ = az;
}

// Append-only during a stroke, so the resampled prefix is reused and only new source points are
// folded in.
//
// THE HEAD ALONE IS NOT AN IDENTITY, and trusting it flew the wrong route. Every stroke starts at
// the hull, so two consecutive strokes drawn from a stationary ship share a head; if they also share
// a point count the cache was reused wholesale. Reproduced: route A (0,0)->(120,0) then route B
// (0,0)->(0,120) left the hull thrusting along +X while the player's line went +Z. The route's TAIL
// and the last sample actually consumed are part of the key now, so a replaced, truncated, or
// in-place-mutated route rebuilds.
function ensurePathCache(runtime, route) {
  const points = route.points;
  const head = points[0] || { x: 0, z: 0 };
  const tail = points[points.length - 1] || head;
  const headX = finite(head.x);
  const headZ = finite(head.z);
  const tailX = finite(tail.x);
  const tailZ = finite(tail.z);
  let cache = runtime.path;
  const consumedSample = cache && cache.consumed > 0 ? points[cache.consumed - 1] : null;
  const consumedMoved = cache && consumedSample
    && (finite(consumedSample.x) !== cache.lastConsumedX || finite(consumedSample.z) !== cache.lastConsumedZ);
  if (!cache
    || cache.headX !== headX
    || cache.headZ !== headZ
    || cache.consumed > points.length
    || consumedMoved
    || (cache.consumed === points.length && (cache.lastX !== tailX || cache.lastZ !== tailZ))) {
    cache = runtime.path = createPathCache(headX, headZ);
  }
  for (let i = cache.consumed; i < points.length; i += 1) {
    const p = points[i];
    const px = p && p.x;
    const pz = p && p.z;
    if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;   // a junk sample is skipped, not flown
    appendResampledPoint(cache, px, pz, i);
  }
  cache.consumed = points.length;
  cache.lastX = tailX;
  cache.lastZ = tailZ;
  const consumedNow = points[cache.consumed - 1];
  cache.lastConsumedX = finite(consumedNow && consumedNow.x);
  cache.lastConsumedZ = finite(consumedNow && consumedNow.z);
  return cache;
}

function createPathCache(headX, headZ) {
  return {
    headX,
    headZ,
    consumed: 1,
    nodes: [{ x: headX, z: headZ }],
    cum: [0],
    src: [0],
    total: 0,
    progressS: 0,
    tailX: headX,
    tailZ: headZ,
    lastX: headX,
    lastZ: headZ,
    lastConsumedX: headX,
    lastConsumedZ: headZ,
    pilot: [{ x: headX, z: headZ }],
    pilotCum: [0],
    vCurve: [0],
    vLimit: [0],
    scratchTurn: [0],
    planCount: 0,
    planCorridor: 0,
    planTurnRadius: 0,
    planCruise: NaN,
    planLateral: NaN,
    planBrake: NaN,
    planAccel: NaN,
    planGeomSpeed: NaN,
    pilotTotal: 0,
    rawProj: { s: 0, x: 0, z: 0, tx: 1, tz: 0, cross: 0, dist: 0 },
    pilotProj: { s: 0, x: 0, z: 0, tx: 1, tz: 0, cross: 0, dist: 0 },
    steerPoint: { x: 0, z: 0, tx: 1, tz: 0 },
    scratchPt: { x: 0, z: 0 },
    clusters: [],
    clusterCount: 0,
  };
}

function nodeIndexAtS(cache, s) {
  const idx = Math.floor(s / PATH_RESAMPLE_SPACING);
  return Math.max(0, Math.min(cache.nodes.length - 1, idx));
}

function pathPointAtS(cache, s) {
  const nodes = cache.nodes;
  const last = nodes.length - 1;
  if (last < 1) return { x: cache.headX, z: cache.headZ, tx: 1, tz: 0 };
  const clamped = Math.max(0, Math.min(cache.total, s));
  const i = Math.min(last - 1, Math.floor(clamped / PATH_RESAMPLE_SPACING));
  const a = nodes[i];
  const b = nodes[i + 1];
  const t = Math.max(0, Math.min(1, (clamped - cache.cum[i]) / PATH_RESAMPLE_SPACING));
  const sx = b.x - a.x;
  const sz = b.z - a.z;
  const len = Math.max(Math.hypot(sx, sz), 1e-6);
  return { x: a.x + sx * t, z: a.z + sz * t, tx: sx / len, tz: sz / len };
}

function cumIndexAt(cum, count, s) {
  if (count <= 1) return 0;
  let lo = 0;
  let hi = count - 1;
  if (s <= cum[0]) return 0;
  if (s >= cum[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

function fillPointAtCum(nodes, cum, count, total, s, out) {
  const last = count - 1;
  if (last < 1 || !nodes[0]) {
    out.x = nodes[0] ? nodes[0].x : 0;
    out.z = nodes[0] ? nodes[0].z : 0;
    out.tx = 1;
    out.tz = 0;
    return out;
  }
  const clamped = Math.max(0, Math.min(total, s));
  const i = Math.min(last - 1, cumIndexAt(cum, count, clamped));
  const a = nodes[i];
  const b = nodes[i + 1];
  const ds = Math.max(cum[i + 1] - cum[i], 1e-6);
  const t = Math.max(0, Math.min(1, (clamped - cum[i]) / ds));
  const sx = b.x - a.x;
  const sz = b.z - a.z;
  const len = Math.max(Math.hypot(sx, sz), 1e-6);
  out.x = a.x + sx * t;
  out.z = a.z + sz * t;
  out.tx = sx / len;
  out.tz = sz / len;
  return out;
}

// Windowed forward projection. Writes committed arc-length progress, the closest point on the line,
// its tangent, and the SIGNED cross-track offset (positive = hull sits on the +perp side, where
// perp = (-tangentZ, tangentX)) into `out`. No per-tick allocation.
function projectOntoNodes(nodes, cum, count, total, fromS, toS, px, pz, out) {
  const last = count - 1;
  if (last < 1 || !out) return null;
  const i0 = Math.max(0, Math.min(last - 1, cumIndexAt(cum, count, fromS)));
  const i1 = Math.max(i0, Math.min(last - 1, cumIndexAt(cum, count, toS)));
  let bestSq = Infinity;
  let bestS = fromS;
  let bestX = nodes[i0].x;
  let bestZ = nodes[i0].z;
  let bestTx = 1;
  let bestTz = 0;
  for (let i = i0; i <= i1; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const sx = b.x - a.x;
    const sz = b.z - a.z;
    const segSq = sx * sx + sz * sz;
    if (segSq < 1e-9) continue;
    let t = ((px - a.x) * sx + (pz - a.z) * sz) / segSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + sx * t;
    const cz = a.z + sz * t;
    const ddx = px - cx;
    const ddz = pz - cz;
    const dsq = ddx * ddx + ddz * ddz;
    if (dsq < bestSq) {
      bestSq = dsq;
      bestS = cum[i] + Math.sqrt(segSq) * t;
      bestX = cx;
      bestZ = cz;
      const inv = 1 / Math.sqrt(segSq);
      bestTx = sx * inv;
      bestTz = sz * inv;
    }
  }
  out.s = bestS;
  out.x = bestX;
  out.z = bestZ;
  out.tx = bestTx;
  out.tz = bestTz;
  out.cross = (px - bestX) * -bestTz + (pz - bestZ) * bestTx;
  out.dist = Math.sqrt(bestSq);
  return out;
}

function projectOntoPath(cache, px, pz) {
  const fromS = Math.max(0, cache.progressS - PATH_PROJECTION_BACK);
  const toS = Math.min(cache.total, cache.progressS + PATH_PROJECTION_WINDOW);
  return projectOntoNodes(
    cache.nodes, cache.cum, cache.nodes.length, cache.total, fromS, toS, px, pz, cache.rawProj,
  );
}

function ensurePlanSlots(cache, n) {
  if (!cache.pilot) cache.pilot = [];
  if (!cache.pilotCum) cache.pilotCum = [];
  if (!cache.vCurve) cache.vCurve = [];
  if (!cache.vLimit) cache.vLimit = [];
  if (!cache.scratchTurn) cache.scratchTurn = [];
  while (cache.pilot.length < n) cache.pilot.push({ x: 0, z: 0 });
  while (cache.pilotCum.length < n) cache.pilotCum.push(0);
  while (cache.vCurve.length < n) cache.vCurve.push(0);
  while (cache.vLimit.length < n) cache.vLimit.push(0);
  while (cache.scratchTurn.length < n) cache.scratchTurn.push(0);
  if (!cache.rawProj) cache.rawProj = { s: 0, x: 0, z: 0, tx: 1, tz: 0, cross: 0, dist: 0 };
  if (!cache.pilotProj) cache.pilotProj = { s: 0, x: 0, z: 0, tx: 1, tz: 0, cross: 0, dist: 0 };
  if (!cache.steerPoint) cache.steerPoint = { x: 0, z: 0, tx: 1, tz: 0 };
  if (!cache.scratchPt) cache.scratchPt = { x: 0, z: 0 };
  if (!cache.clusters) cache.clusters = [];
}

function fitFilletRadius(half, RDes, RLeg, RTurn) {
  const cutFactor = 1 / Math.cos(half) - 1;
  if (!(cutFactor > 1e-6) || !(RDes > 0) || !(RLeg > 0)) return 0;
  const tube = PATH_PILOT_CORRIDOR_R * RTurn;
  const width = Math.max(PATH_RESAMPLE_SPACING, tube - PATH_PILOT_TRACK_SLACK);
  return Math.min(RDes, RLeg, width / cutFactor);
}

function collectCornerClusters(cache, n) {
  if (!cache.clusters) cache.clusters = [];
  let count = 0;
  let i = 1;
  while (i < n - 1) {
    if (Math.abs(cache.scratchTurn[i]) < PATH_PILOT_TURN_SEED) {
      i += 1;
      continue;
    }
    let acc = cache.scratchTurn[i];
    let peak = Math.abs(cache.scratchTurn[i]);
    let turns = 1;
    let hi = i;
    let j = i + 1;
    while (j < n - 1) {
      const turn = cache.scratchTurn[j];
      if (Math.abs(turn) >= PATH_PILOT_TURN_SEED) {
        if (turn * acc < 0) break;
        if (j - hi > 12) break;
        acc += turn;
        const absTurn = Math.abs(turn);
        if (absTurn > peak) peak = absTurn;
        turns += 1;
        hi = j;
      } else if (j - hi > 12) {
        break;
      }
      j += 1;
    }
    if (Math.abs(acc) >= PATH_PILOT_CORNER_TURN) {
      let slot = cache.clusters[count];
      if (!slot) {
        slot = { lo: 0, hi: 0, acc: 0, peak: 0, turns: 0, radius: 0 };
        cache.clusters[count] = slot;
      }
      slot.lo = i;
      slot.hi = hi;
      slot.acc = acc;
      slot.peak = peak;
      slot.turns = turns;
      slot.radius = 0;
      count += 1;
    }
    i = Math.max(hi + 1, i + 1);
  }
  cache.clusterCount = count;
  return count;
}

function applyPilotFillet(cache, n, cluster, radius, inX, inZ, outX, outZ, sLeft, sRight) {
  const theta = wrapAngle(Math.atan2(outZ, outX) - Math.atan2(inZ, inX));
  const half = Math.abs(theta) * 0.5;
  const cosHalf = Math.cos(half);
  if (!(half > 1e-3) || !(radius > PATH_RESAMPLE_SPACING) || !(cosHalf > 1e-6)) return;
  const tanHalf = Math.tan(half);
  if (!(tanHalf > 1e-6)) return;
  const d = radius * tanHalf;
  const nodes = cache.nodes;
  const lo = cluster.lo;
  const hi = cluster.hi;
  const a = nodes[lo - 1];
  const b = nodes[hi];
  const det = inX * outZ - inZ * outX;
  if (Math.abs(det) < 1e-8) return;
  const tHit = ((b.x - a.x) * outZ - (b.z - a.z) * outX) / det;
  const vertexX = a.x + tHit * inX;
  const vertexZ = a.z + tHit * inZ;
  const ix = -inX + outX;
  const iz = -inZ + outZ;
  const invLen = Math.hypot(ix, iz);
  if (invLen < 1e-9) return;
  const centerDist = radius / cosHalf;
  const centerX = vertexX + (ix / invLen) * centerDist;
  const centerZ = vertexZ + (iz / invLen) * centerDist;
  const tanInX = vertexX - inX * d;
  const tanInZ = vertexZ - inZ * d;
  const tanOutX = vertexX + outX * d;
  const tanOutZ = vertexZ + outZ * d;
  const radialIn = Math.hypot(tanInX - centerX, tanInZ - centerZ);
  const radialOut = Math.hypot(tanOutX - centerX, tanOutZ - centerZ);
  if (Math.abs(radialIn - radius) > 0.05 * radius || Math.abs(radialOut - radius) > 0.05 * radius) return;
  const a0 = Math.atan2(tanInZ - centerZ, tanInX - centerX);
  const a1 = Math.atan2(tanOutZ - centerZ, tanOutX - centerX);
  let sweep = wrapAngle(a1 - a0);
  if (sweep * theta < 0) sweep = sweep > 0 ? sweep - Math.PI * 2 : sweep + Math.PI * 2;
  const sTanIn = cache.cum[lo] + (tanInX - nodes[lo].x) * inX + (tanInZ - nodes[lo].z) * inZ;
  const sTanOut = cache.cum[hi] + (tanOutX - nodes[hi].x) * outX + (tanOutZ - nodes[hi].z) * outZ;
  // A short smeared corner may not have room for a circle that reaches both straight
  // legs. Keep its raw path and curvature limit instead of joining an extrapolated leg.
  if (sTanIn > cache.cum[lo] + 1e-6 || sTanOut < cache.cum[hi] - 1e-6
    || sTanIn < sLeft - 1e-6 || sTanOut > sRight + 1e-6) return;
  if (!(sTanOut > sTanIn + PATH_RESAMPLE_SPACING)) return;
  const s0 = Math.max(sTanIn, sLeft);
  const s1 = Math.min(sTanOut, sRight);
  if (!(s1 > s0 + 1e-6)) return;
  const span = sTanOut - sTanIn;
  const corridor = cache.planCorridor;
  const j0 = Math.max(1, cumIndexAt(cache.cum, n, s0));
  const j1 = Math.min(n - 2, cumIndexAt(cache.cum, n, s1) + 1);
  for (let j = j0; j <= j1; j += 1) {
    const s = cache.cum[j];
    if (s < s0 || s > s1) continue;
    const u = Math.max(0, Math.min(1, (s - sTanIn) / span));
    const ang = a0 + sweep * u;
    let px = centerX + Math.cos(ang) * radius;
    let pz = centerZ + Math.sin(ang) * radius;
    const raw = nodes[j];
    const dx = px - raw.x;
    const dz = pz - raw.z;
    const dist = Math.hypot(dx, dz);
    if (dist > corridor && dist > 1e-9) {
      const scale = corridor / dist;
      px = raw.x + dx * scale;
      pz = raw.z + dz * scale;
    }
    cache.pilot[j].x = px;
    cache.pilot[j].z = pz;
  }
  cluster.radius = radius;
  cluster.cx = centerX;
  cluster.cz = centerZ;
  cluster.tanInX = tanInX;
  cluster.tanInZ = tanInZ;
  cluster.tanOutX = tanOutX;
  cluster.tanOutZ = tanOutZ;
  cluster.inX = inX;
  cluster.inZ = inZ;
  cluster.outX = outX;
  cluster.outZ = outZ;
}

function ensurePilotPlan(cache, authority) {
  const n = cache.nodes.length;
  if (n < 2) {
    cache.planCount = n;
    cache.pilotTotal = 0;
    return;
  }
  const cruise = authority.cruise;
  const lateral = Math.max(authority.lateral, 1);
  const brake = Math.max(authority.brake, 1);
  const accel = Math.max(authority.accel, 1);
  const geomSpeed = positiveOr(authority.geomSpeed, cruise);
  if (cache.planCount === n
    && cache.planCruise === cruise
    && cache.planLateral === lateral
    && cache.planBrake === brake
    && cache.planAccel === accel
    && cache.planGeomSpeed === geomSpeed) {
    return;
  }

  ensurePlanSlots(cache, n);
  const RTurn = (geomSpeed * geomSpeed) / lateral;
  const corridor = PATH_PILOT_CORRIDOR_R * RTurn;
  cache.planTurnRadius = RTurn;
  cache.planCorridor = corridor;
  cache.planCruise = cruise;
  cache.planLateral = lateral;
  cache.planBrake = brake;
  cache.planAccel = accel;
  cache.planGeomSpeed = geomSpeed;
  cache.planCount = n;

  for (let i = 0; i < n; i += 1) {
    cache.pilot[i].x = cache.nodes[i].x;
    cache.pilot[i].z = cache.nodes[i].z;
    cache.scratchTurn[i] = 0;
  }

  for (let i = 1; i < n - 1; i += 1) {
    const a = cache.nodes[i - 1];
    const b = cache.nodes[i];
    const c = cache.nodes[i + 1];
    const h0 = Math.atan2(b.z - a.z, b.x - a.x);
    const h1 = Math.atan2(c.z - b.z, c.x - b.x);
    cache.scratchTurn[i] = wrapAngle(h1 - h0);
  }

  const RDes = PATH_PILOT_RADIUS_MULT * RTurn;
  const clusterCount = collectCornerClusters(cache, n);
  for (let c = 0; c < clusterCount; c += 1) {
    const cluster = cache.clusters[c];
    if (cluster.lo < 1 || cluster.hi > n - 2) continue;
    if (cluster.turns > PATH_PILOT_CORNER_TURNS) continue;
    if (!(cluster.peak >= PATH_PILOT_CORNER_PEAK)) continue;
    const inbound = cache.nodes[cluster.lo];
    const inboundPrev = cache.nodes[cluster.lo - 1];
    const outbound = cache.nodes[cluster.hi];
    const outboundNext = cache.nodes[cluster.hi + 1];
    const inLenSeg = Math.hypot(inbound.x - inboundPrev.x, inbound.z - inboundPrev.z);
    const outLenSeg = Math.hypot(outboundNext.x - outbound.x, outboundNext.z - outbound.z);
    if (inLenSeg < 1e-6 || outLenSeg < 1e-6) continue;
    const inX = (inbound.x - inboundPrev.x) / inLenSeg;
    const inZ = (inbound.z - inboundPrev.z) / inLenSeg;
    const outX = (outboundNext.x - outbound.x) / outLenSeg;
    const outZ = (outboundNext.z - outbound.z) / outLenSeg;
    const theta = wrapAngle(Math.atan2(outZ, outX) - Math.atan2(inZ, inX));
    const half = Math.abs(theta) * 0.5;
    if (!(half > 0.12) || !(half < 1.45)) continue;
    const tanHalf = Math.tan(half);
    const leftS = c > 0
      ? 0.5 * (cache.cum[cache.clusters[c - 1].hi] + cache.cum[cluster.lo])
      : 0;
    const rightS = c < clusterCount - 1
      ? 0.5 * (cache.cum[cluster.hi] + cache.cum[cache.clusters[c + 1].lo])
      : cache.total;
    const det = inX * outZ - inZ * outX;
    if (Math.abs(det) < 1e-8) continue;
    const vertexAlongIn = ((outbound.x - inbound.x) * outZ
      - (outbound.z - inbound.z) * outX) / det;
    const vertexX = inbound.x + vertexAlongIn * inX;
    const vertexZ = inbound.z + vertexAlongIn * inZ;
    const vertexBeforeOut = (outbound.x - vertexX) * outX + (outbound.z - vertexZ) * outZ;
    // Tangent distance is measured from the intersection of the straight legs,
    // which lies inside a smeared turn, not from its first/last turning node.
    const inLen = Math.max(0, cache.cum[cluster.lo] - leftS + vertexAlongIn);
    const outLen = Math.max(0, rightS - cache.cum[cluster.hi] + vertexBeforeOut);
    const inUse = Math.max(0, inLen - PATH_RESAMPLE_SPACING);
    const outUse = Math.max(0, outLen - PATH_RESAMPLE_SPACING);
    const RLeg = tanHalf > 1e-6 ? Math.min(inUse, outUse) / tanHalf : 0;
    const radius = fitFilletRadius(half, RDes, RLeg, RTurn);
    if (radius > PATH_RESAMPLE_SPACING) {
      applyPilotFillet(cache, n, cluster, radius, inX, inZ, outX, outZ, leftS, rightS);
    }
  }

  cache.pilotCum[0] = 0;
  for (let k = 1; k < n; k += 1) {
    const a = cache.pilot[k - 1];
    const b = cache.pilot[k];
    cache.pilotCum[k] = cache.pilotCum[k - 1] + Math.hypot(b.x - a.x, b.z - a.z);
  }
  cache.pilotTotal = cache.pilotCum[n - 1];

  const last = n - 1;
  for (let k = 0; k < n; k += 1) {
    const lo = k - PATH_CURVE_STENCIL;
    const hi = k + PATH_CURVE_STENCIL;
    let kappa = 0;
    if (lo >= 0 && hi < n) {
      const a = cache.pilot[lo];
      const b = cache.pilot[k];
      const c = cache.pilot[hi];
      const h1 = Math.atan2(b.z - a.z, b.x - a.x);
      const h2 = Math.atan2(c.z - b.z, c.x - b.x);
      const arc = Math.max(cache.pilotCum[k] - cache.pilotCum[lo], 1e-6);
      kappa = Math.abs(wrapAngle(h2 - h1) / arc);
    }
    const radius = kappa > 1e-5 ? 1 / kappa : Infinity;
    let vCurve = Number.isFinite(radius)
      ? Math.sqrt(lateral * radius / PATH_PILOT_RADIUS_MULT)
      : cruise;
    if (!Number.isFinite(vCurve) || vCurve < PATH_CORNER_FLOOR_SPEED) vCurve = PATH_CORNER_FLOOR_SPEED;
    if (vCurve > cruise) vCurve = cruise;
    cache.vCurve[k] = vCurve;
  }

  cache.vLimit[last] = 0;
  for (let k = last - 1; k >= 0; k -= 1) {
    const ds = Math.max(cache.pilotCum[k + 1] - cache.pilotCum[k], 1e-6);
    const vBrake = Math.sqrt(cache.vLimit[k + 1] * cache.vLimit[k + 1] + 2 * brake * ds);
    const limited = cache.vCurve[k] < vBrake ? cache.vCurve[k] : vBrake;
    cache.vLimit[k] = limited;
  }
  for (let k = 0; k < last; k += 1) {
    const ds = Math.max(cache.pilotCum[k + 1] - cache.pilotCum[k], 1e-6);
    const vAccel = Math.sqrt(cache.vLimit[k] * cache.vLimit[k] + 2 * accel * ds);
    if (cache.vLimit[k + 1] > vAccel) cache.vLimit[k + 1] = vAccel;
  }
}

function plannedSpeedAt(cache, rawS) {
  const n = cache.planCount;
  if (n < 2) return cache.planCruise;
  const i = Math.min(n - 2, cumIndexAt(cache.cum, n, rawS));
  const ds = Math.max(cache.cum[i + 1] - cache.cum[i], 1e-6);
  const t = Math.max(0, Math.min(1, (rawS - cache.cum[i]) / ds));
  return cache.vLimit[i] * (1 - t) + cache.vLimit[i + 1] * t;
}

function rawSToPilotS(cache, rawS) {
  const n = cache.planCount;
  if (n < 2) return 0;
  const i = Math.min(n - 2, cumIndexAt(cache.cum, n, rawS));
  const ds = Math.max(cache.cum[i + 1] - cache.cum[i], 1e-6);
  const t = Math.max(0, Math.min(1, (rawS - cache.cum[i]) / ds));
  return cache.pilotCum[i] + t * (cache.pilotCum[i + 1] - cache.pilotCum[i]);
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pathAuthority(state, player) {
  // Ask the propulsion catalog for the SAME numbers the kernel will apply, including the auto-target
  // overdrive, so the speed governor is bounded by real thrust rather than a guessed constant.
  let helm = null;
  let profile = null;
  try {
    const resolved = resolvePropulsionProfile(player, state || null);
    if (resolved) {
      helm = applyAutoTargetHelmProfile(resolved);
      profile = applyAutoTargetPathProfile(helm);
    }
  } catch {
    helm = null;
    profile = null;
  }
  const main = positiveOr(profile && profile.mainAccel, 80);
  const strafe = positiveOr(profile && profile.strafeAccel, main * 0.6);
  const reverse = positiveOr(profile && profile.reverseAccel, main * 0.7);
  const combat = positiveOr(profile && profile.combatSpeed, 0);
  const top = positiveOr(profile && profile.maxSpeed, positiveOr(player && player.maxSpeed, 0));
  return {
    // Cornering is bought with strafe thrust plus a rotated main; be conservative about how much of
    // the main axis is usable while the nose is still swinging.
    lateral: Math.max(strafe, main * 0.6),
    brake: Math.max(reverse, positiveOr(profile && profile.maxBrakeAccel, 0), main * 0.72, 1),
    accel: main,
    cruise: combat && top ? Math.min(combat, top) : (combat || top || 120),
    geomSpeed: positiveOr(helm && helm.combatSpeed, combat || top || 120),
  };
}

function followAutoTargetPath(inp, player, state, runtime) {
  const route = inp && inp.autoTargetPath;
  if (!route || !route.active || !Array.isArray(route.points) || route.points.length < 2) {
    if (runtime) runtime.path = null;
    return false;
  }
  const cache = ensurePathCache(runtime || {}, route);
  if (!cache || cache.nodes.length < 2 || cache.total < 1e-3) return false;

  const px = finite(player.pos && player.pos.x);
  const pz = finite(player.pos && player.pos.z);
  const vx = finite(player.vel && player.vel.x);
  const vz = finite(player.vel && player.vel.z);
  const speed = Math.hypot(vx, vz);

  const authority = pathAuthority(state, player);
  ensurePilotPlan(cache, authority);

  const projection = projectOntoPath(cache, px, pz);
  if (!projection) return false;
  // Monotonic commit - this is what keeps a drawn loop from being cut in half.
  cache.progressS = Math.max(cache.progressS, Math.min(projection.s, cache.total));

  // Keep the source-point index the golden snapshot and the trail renderer read, derived from the
  // committed progress so it stays monotonic and meaningful.
  const lastIndex = route.points.length - 1;
  const srcIndex = cache.src[nodeIndexAtS(cache, cache.progressS)];
  route.pointIndex = Math.max(1, Math.min(lastIndex, Number.isFinite(srcIndex) ? srcIndex : 1));

  const remaining = Math.max(0, cache.total - cache.progressS);

  // HOLD MEANS PARKED AT THE END OF THE LINE, NOT "ARC-LENGTH SAYS I'M NEARLY THERE". Two real
  // failures came from testing arc-length remaining and a generous speed threshold instead:
  //
  //   * A hull shoved 50 WU sideways at s = 110 of a 120 WU stroke still reported remaining = 10,
  //     so HOLD zeroed every command and the ship sat half a screen off the drawn line forever.
  //     Both reproduced before this fix; the distance to the actual endpoint is what matters.
  //   * Releasing at 8 WU/s hands a coasting hull to neutral input. Under Newtonian flight nothing
  //     absorbs that momentum, so the ship drifts on past the endpoint and, because progress is
  //     already complete, HOLD keeps re-arming and never corrects.
  //
  // Falling through instead of holding costs nothing and fixes both: past the arrival radius the
  // governor's endSpeed is already 0, so the velocity-error command IS full counter-thrust. The
  // controller brakes itself to a stop. HOLD exists only to stop jitter once genuinely at rest.
  const endPoint = pathPointAtS(cache, cache.total);
  const distanceToEnd = Math.hypot(px - endPoint.x, pz - endPoint.z);
  //
  // BOTH tests are required, and dropping either one reintroduces a real bug. Distance alone is not
  // enough: a stroke that doubles back finishes NEAR ITS OWN START, so a hull sitting at the origin
  // is already inside the arrival radius of the endpoint and HOLD fires before the route has been
  // flown at all -- the stillborn-route failure in a new costume, caught by the hook case the moment
  // distance replaced arc length. Arc length alone is not enough either, for the displacement reason
  // above. Arrived means both: the line is used up AND the hull is actually at the end of it.
  if (remaining <= AUTO_TARGET_PATH_ARRIVAL_RADIUS
    && distanceToEnd <= AUTO_TARGET_PATH_ARRIVAL_RADIUS
    && speed < PATH_REST_SPEED) {
    // HOLD, never kill. See the header note - deactivating here was the original stillborn-route bug.
    inp.moveX = 0;
    inp.moveZ = 0;
    inp.turnIntent = 0;
    inp.brake = false;
    if (inp.actions) inp.actions.brake = false;
    return true;
  }

  const lookahead = Math.max(
    PATH_LOOKAHEAD_MIN,
    Math.min(PATH_LOOKAHEAD_MAX, PATH_LOOKAHEAD_MIN + speed * PATH_LOOKAHEAD_PER_SPEED),
  );
  const pilotS = rawSToPilotS(cache, cache.progressS);
  const pilotFrom = Math.max(0, pilotS - PATH_PROJECTION_BACK);
  const pilotTo = Math.min(cache.pilotTotal, pilotS + PATH_PROJECTION_WINDOW);
  const pilotProj = projectOntoNodes(
    cache.pilot, cache.pilotCum, cache.planCount, cache.pilotTotal,
    pilotFrom, pilotTo, px, pz, cache.pilotProj,
  );
  const steer = pilotProj || projection;
  const carrotS = Math.min(cache.pilotTotal, (steer.s || pilotS) + lookahead);
  const carrot = fillPointAtCum(
    cache.pilot, cache.pilotCum, cache.planCount, cache.pilotTotal, carrotS, cache.steerPoint,
  );

  // Speed envelope lives on the cached pilot: curvature limits at 1.3× turn radius, solved
  // backward with brake then forward with accel, never exceeding modified combatSpeed.
  // Recapture of a displaced hull still costs centripetal budget, so a large pilot cross-track
  // can lower the command without rewriting the plan.
  const planned = plannedSpeedAt(cache, cache.progressS);
  const returnK = 2 * Math.abs(steer.cross) / Math.max(lookahead * lookahead, 1);
  const recapture = returnK > 1e-5
    ? Math.max(PATH_CORNER_FLOOR_SPEED, Math.sqrt(authority.lateral / returnK))
    : Infinity;
  // How far is there still to travel? Arc-length remaining alone is wrong for a DISPLACED hull: a
  // ship shoved 50 WU sideways at s = 110 of a 120 WU stroke has remaining = 10, which drives the
  // stopping curve to zero desired speed, which makes the velocity error zero, which commands no
  // thrust at all. It would turn to face the line and then sit there. Take the greater of the arc
  // left and the straight-line distance to the endpoint, so a displaced hull still has somewhere to
  // be and the governor still gives it speed to get there.
  const travelLeft = Math.max(remaining, distanceToEnd);
  const endSpeed = Math.sqrt(Math.max(0,
    2 * authority.brake * Math.max(0, travelLeft - AUTO_TARGET_PATH_ARRIVAL_RADIUS)));
  const governed = Math.max(0, Math.min(authority.cruise, planned, recapture, endSpeed));

  // Steer at the pilot carrot, bent toward the pilot line in proportion to how far off it the hull
  // sits. Coverage, progress and route.pointIndex stay on the raw stroke.
  const correction = Math.max(-1, Math.min(1, -steer.cross / PATH_CORRIDOR)) * PATH_CORRECTION_GAIN;
  const perpX = -carrot.tz;
  const perpZ = carrot.tx;
  let dirX = carrot.tx + perpX * correction;
  let dirZ = carrot.tz + perpZ * correction;
  const dirLen = Math.max(Math.hypot(dirX, dirZ), 1e-6);
  dirX /= dirLen;
  dirZ /= dirLen;

  // THE COMMAND IS A VELOCITY ERROR, NOT A BEARING. desired minus actual is an acceleration request,
  // and acceleration is the only thing a thruster can supply. Commanding a bearing is what made the
  // hull orbit the line instead of settling onto it.
  const errX = dirX * governed - vx;
  const errZ = dirZ * governed - vz;
  const errLen = Math.hypot(errX, errZ);
  const magnitude = Math.max(0, Math.min(1, errLen / PATH_VELOCITY_ERROR_FULL));
  const commandX = errLen > 1e-6 ? errX / errLen : dirX;
  const commandZ = errLen > 1e-6 ? errZ / errLen : dirZ;

  // The kernel's brake authority is stronger than reverse thrust, so ask for it when genuinely hot
  // rather than trying to shed speed on reverse alone.
  const alongPath = vx * carrot.tx + vz * carrot.tz;
  const braking = alongPath > governed + PATH_BRAKE_MARGIN;

  applyWorldFlightCommand(inp, player, commandX, commandZ, magnitude, dirX, dirZ);
  inp.brake = braking;
  if (inp.actions) inp.actions.brake = braking;
  return true;
}
function applyWorldFlightCommand(inp, player, worldX, worldZ, magnitude, headingX = worldX, headingZ = worldZ) {
  const rotation = finite(player.rot);
  const forwardX = Math.cos(rotation);
  const forwardZ = Math.sin(rotation);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  inp.moveZ = Math.max(-1, Math.min(1,
    (worldX * forwardX + worldZ * forwardZ) * magnitude));
  inp.moveX = Math.max(-1, Math.min(1,
    (worldX * rightX + worldZ * rightZ) * magnitude));
  const desiredHeading = Math.atan2(headingZ, headingX);
  const headingError = wrapAngle(desiredHeading - rotation);
  inp.turnIntent = Math.max(-1, Math.min(1,
    headingError / AUTO_TARGET_HEADING_SOFT_ANGLE));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function projectLockedReticle(state, w2s, viewport = {}) {
  if (!state || !state.input || !state.input.autoFire) return null;
  const lead = computeLockedLeadPoint(state);
  const target = resolvePlayerGunTarget(state);
  const point = lead || (target && target.pos) || null;
  if (!point || !w2s) return null;

  const width = Number.isFinite(viewport.width) ? viewport.width : 0;
  const height = Number.isFinite(viewport.height) ? viewport.height : 0;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const projected = w2s({ x: point.x, y: 0, z: point.z });
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;
  if (projected.onScreen) return { x: projected.x, y: projected.y };

  const dx = projected.x - centerX;
  const dy = projected.y - centerY;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: centerX, y: centerY };
  const scales = [];
  if (Math.abs(dx) > 1e-6) {
    scales.push(((dx > 0 ? width - RETICLE_EDGE_MARGIN : RETICLE_EDGE_MARGIN) - centerX) / dx);
  }
  if (Math.abs(dy) > 1e-6) {
    scales.push(((dy > 0 ? height - RETICLE_EDGE_MARGIN : RETICLE_EDGE_MARGIN) - centerY) / dy);
  }
  const positive = scales.filter((value) => value > 0 && Number.isFinite(value));
  if (!positive.length) return null;
  const scale = Math.min(...positive);
  return { x: centerX + dx * scale, y: centerY + dy * scale };
}
