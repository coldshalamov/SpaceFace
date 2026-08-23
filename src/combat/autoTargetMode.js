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
const PATH_CURVE_STENCIL = 2;             // nodes either side used to measure curvature (~12 WU baseline)
const PATH_VELOCITY_ERROR_FULL = 26;      // velocity error (WU/s) that commands full thrust
const PATH_CORNER_FLOOR_SPEED = 14;       // hairpins throttle down to this, never to a deadlock
const PATH_BRAKE_MARGIN = 6;              // WU/s over the governed speed before the brake is asserted
const PATH_MAX_NODES = 8192;              // ~24 km of stroke at 3 WU spacing; bounds one cache build
const PATH_REST_SPEED = 1;                // below this the hull is genuinely stopped, not coasting              // WU/s over the governed speed before the brake is asserted

function pathCurvatureAt(nodes, index) {
  const lo = index - PATH_CURVE_STENCIL;
  const hi = index + PATH_CURVE_STENCIL;
  if (lo < 0 || hi >= nodes.length) return 0;
  const a = nodes[lo];
  const b = nodes[index];
  const c = nodes[hi];
  const h1 = Math.atan2(b.z - a.z, b.x - a.x);
  const h2 = Math.atan2(c.z - b.z, c.x - b.x);
  const arc = PATH_CURVE_STENCIL * PATH_RESAMPLE_SPACING;
  return Math.abs(wrapAngle(h2 - h1)) / Math.max(arc, 1e-6);
}

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
    cache = runtime.path = {
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
    };
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

// Windowed forward projection. Returns committed arc-length progress, the closest point on the line,
// its tangent, and the SIGNED cross-track offset (positive = hull sits on the +perp side, where
// perp = (-tangentZ, tangentX)).
function projectOntoPath(cache, px, pz) {
  const nodes = cache.nodes;
  const last = nodes.length - 1;
  if (last < 1) return null;
  const fromS = Math.max(0, cache.progressS - PATH_PROJECTION_BACK);
  const toS = Math.min(cache.total, cache.progressS + PATH_PROJECTION_WINDOW);
  const i0 = nodeIndexAtS(cache, fromS);
  const i1 = Math.min(last - 1, nodeIndexAtS(cache, toS));
  let bestSq = Infinity;
  let bestS = cache.progressS;
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
      bestS = cache.cum[i] + Math.sqrt(segSq) * t;
      bestX = cx;
      bestZ = cz;
      const inv = 1 / Math.sqrt(segSq);
      bestTx = sx * inv;
      bestTz = sz * inv;
    }
  }
  const cross = (px - bestX) * -bestTz + (pz - bestZ) * bestTx;
  return { s: bestS, x: bestX, z: bestZ, tx: bestTx, tz: bestTz, cross, dist: Math.sqrt(bestSq) };
}

// Worst curvature between here and the carrot decides the corner speed, so the hull is already slow
// when it ARRIVES at a hairpin rather than discovering it mid-corner.
function worstCurvatureAhead(cache, fromS, toS) {
  const i0 = nodeIndexAtS(cache, fromS);
  const i1 = nodeIndexAtS(cache, toS);
  let worst = 0;
  for (let i = i0; i <= i1; i += 1) {
    const k = pathCurvatureAt(cache.nodes, i);
    if (k > worst) worst = k;
  }
  return worst;
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pathAuthority(state, player) {
  // Ask the propulsion catalog for the SAME numbers the kernel will apply, including the auto-target
  // overdrive, so the speed governor is bounded by real thrust rather than a guessed constant.
  let profile = null;
  try {
    profile = resolvePropulsionProfile(player, state || null);
    if (profile) {
      profile = applyAutoTargetHelmProfile(profile);
      profile = applyAutoTargetPathProfile(profile);
    }
  } catch {
    profile = null;
  }
  const main = positiveOr(profile && profile.mainAccel, 80);
  const strafe = positiveOr(profile && profile.strafeAccel, main * 0.6);
  const reverse = positiveOr(profile && profile.reverseAccel, main * 0.7);
  return {
    // Cornering is bought with strafe thrust plus a rotated main; be conservative about how much of
    // the main axis is usable while the nose is still swinging.
    lateral: Math.max(strafe, main * 0.6),
    brake: Math.max(reverse, positiveOr(profile && profile.maxBrakeAccel, 0), main * 0.72, 1),
    cruise: positiveOr(profile && profile.maxSpeed, positiveOr(player && player.maxSpeed, 120)),
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

  const authority = pathAuthority(state, player);
  const lookahead = Math.max(
    PATH_LOOKAHEAD_MIN,
    Math.min(PATH_LOOKAHEAD_MAX, PATH_LOOKAHEAD_MIN + speed * PATH_LOOKAHEAD_PER_SPEED),
  );
  const carrotS = Math.min(cache.total, cache.progressS + lookahead);
  const carrot = pathPointAtS(cache, carrotS);

  // Speed governor. "Follow the line" at finite thrust means DECELERATING INTO a hairpin, not cutting
  // it: a pure-pursuit controller with no governor still corners wide and still reads as broken.
  const curvature = worstCurvatureAhead(cache, cache.progressS, carrotS);
  const cornerSpeed = curvature > 1e-5
    ? Math.max(PATH_CORNER_FLOOR_SPEED, Math.sqrt(authority.lateral / curvature))
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
  const governed = Math.max(0, Math.min(authority.cruise, cornerSpeed, endSpeed));

  // Steer at the carrot, bent toward the line in proportion to how far off it the hull sits. Without
  // this term nothing restores a displaced hull and the offset is simply inherited forward.
  const correction = Math.max(-1, Math.min(1, -projection.cross / PATH_CORRIDOR)) * PATH_CORRECTION_GAIN;
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
