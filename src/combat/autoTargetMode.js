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

  const pathApplied = followAutoTargetPath(inp, player);
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

function followAutoTargetPath(inp, player) {
  const route = inp && inp.autoTargetPath;
  if (!route || !route.active || !Array.isArray(route.points) || route.points.length < 2) return false;

  const lastIndex = route.points.length - 1;
  let index = Number.isFinite(route.pointIndex)
    ? Math.max(1, Math.min(lastIndex, Math.floor(route.pointIndex)))
    : 1;
  let target = route.points[index];
  let dx = finite(target && target.x) - finite(player.pos && player.pos.x);
  let dz = finite(target && target.z) - finite(player.pos && player.pos.z);
  let distance = Math.hypot(dx, dz);

  // Proximity advances may chain (points genuinely under the hull are consumed together), but the
  // passed-projection test advances at most ONE point per tick. Any segment of a drawn loop that
  // bends back toward the hull reads as "already passed", so letting projections chain skipped the
  // whole loop — and the player draws a loop to FLY it. One projection step per tick still clears
  // 60 overshot points a second, far faster than the hull can outrun the trail.
  let projectionAdvances = 1;
  while (index < lastIndex) {
    const near = distance <= AUTO_TARGET_PATH_POINT_RADIUS;
    if (!near) {
      if (projectionAdvances <= 0
        || !hasPassedRoutePoint(player.pos, route.points[index - 1], target)) break;
      projectionAdvances -= 1;
    }
    index += 1;
    target = route.points[index];
    dx = finite(target && target.x) - finite(player.pos && player.pos.x);
    dz = finite(target && target.z) - finite(player.pos && player.pos.z);
    distance = Math.hypot(dx, dz);
  }
  route.pointIndex = index;

  const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
  const finalPoint = index >= lastIndex;
  if (finalPoint && distance <= AUTO_TARGET_PATH_ARRIVAL_RADIUS && speed < AUTO_TARGET_PATH_SETTLE_SPEED) {
    // Arrival is a HOLD, never a kill. The trail begins at the hull, so its endpoint is within
    // arrival radius the instant drawing starts — deactivating here destroyed every route at
    // birth (hundreds of stillborn 2-point stubs per stroke, pen snapping back to the ship each
    // time, hull never following anything). While the mode is on the route stays active and the
    // hull waits at the trail's end for more line; only the G toggle / mode reset clears it.
    inp.moveX = 0;
    inp.moveZ = 0;
    inp.turnIntent = 0;
    inp.brake = false;
    if (inp.actions) inp.actions.brake = false;
    return true;
  }

  const directionLength = Math.max(distance, 1e-6);
  const pathX = dx / directionLength;
  const pathZ = dz / directionLength;
  const stoppingWindow = Math.max(42, speed * 1.15);
  const braking = finalPoint && speed > 4 && distance < stoppingWindow;
  let commandX = pathX;
  let commandZ = pathZ;
  let magnitude = finalPoint
    ? Math.max(0.22, Math.min(1, distance / AUTO_TARGET_PATH_FULL_THRUST_DISTANCE))
    : 1;
  if (braking) {
    commandX = -finite(player.vel && player.vel.x) / Math.max(speed, 1e-6);
    commandZ = -finite(player.vel && player.vel.z) / Math.max(speed, 1e-6);
    magnitude = Math.max(0.35, Math.min(1, speed / 32));
  }

  applyWorldFlightCommand(inp, player, commandX, commandZ, magnitude, pathX, pathZ);
  inp.brake = braking;
  if (inp.actions) inp.actions.brake = braking;
  return true;
}

function hasPassedRoutePoint(position, previous, target) {
  if (!position || !previous || !target) return false;
  const segmentX = finite(target.x) - finite(previous.x);
  const segmentZ = finite(target.z) - finite(previous.z);
  const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
  if (segmentLengthSq <= 1e-6) return true;
  const playerX = finite(position.x) - finite(previous.x);
  const playerZ = finite(position.z) - finite(previous.z);
  return playerX * segmentX + playerZ * segmentZ >= segmentLengthSq;
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
