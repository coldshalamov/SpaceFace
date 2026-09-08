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
import { followDrawFlightPath } from './drawFlightPath.js';
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


export function createAutoTargetRuntime() {
  return { refreshT: 0 };
}

export function toggleAutoTarget(state, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  if (!inp) return false;
  inp.autoFire = !inp.autoFire;
  runtime.path = null;
  runtime.drawHeading = undefined;
  runtime.drawTurnSign = 0;
  if (inp.drawFlight) delete inp.drawFlight;
  if (inp.autoTargetPath) inp.autoTargetPath.active = false;
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
  const player = state.entities.get(state.playerId);
  if (state.input?.autoFire && (!player || !isHostileToPlayer(e, player.team, state))) return null;
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
  if (!inp || !inp.autoFire || (state.mode && state.mode !== 'flight')
    || inp.blocked || state.ui?.screenStack?.length) {
    if (inp && inp.autoAim) inp.autoAim = null;
    runtime.refreshT = 0;
    // Drop the resampled route with the mode. Without this the cache outlived a G toggle and the
    // next stroke could be matched against the previous one's geometry.
    runtime.path = null;
    runtime.drawHeading = undefined;
    runtime.drawTurnSign = 0;
    if (inp?.drawFlight) delete inp.drawFlight;
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

  const pathApplied = followAutoTargetPath(inp, player, state, runtime, dt);
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

// Geometry supplies steering, not throttle. The pure propulsion kernel owns the finite-rate
// momentum turn, and the physics authority remains the sole writer of ship motion.
function followAutoTargetPath(inp, player, state, runtime, dt) {
  if (inp.drawFlightManual || inp.brake || inp.actions?.brake) {
    if (inp.drawFlight) delete inp.drawFlight;
    if (inp.autoTargetPath) inp.autoTargetPath.active = false;
    runtime.path = null;
    runtime.drawHeading = undefined;
    return false;
  }
  const profile = applyAutoTargetPathProfile(applyAutoTargetHelmProfile(resolvePropulsionProfile(player, state)));
  const command = followDrawFlightPath(inp.autoTargetPath, player, runtime, profile, dt);
  if (!command) {
    if (inp.drawFlight) delete inp.drawFlight;
    return false;
  }
  inp.drawFlight = command;
  // Keep the ordinary intent consumers (thruster presentation, travel/autopilot cancellation)
  // live. Translation itself uses the explicit command, never a reverse-throttle brake heuristic.
  const x = Math.cos(command.heading), z = Math.sin(command.heading);
  applyWorldFlightCommand(inp, player, x, z, 1);
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
