// Pure auto-target combat mode helpers — single owner of aim/refresh/reticle semantics.
// Rung 08 (massline auto-target wire): when the player is in MASSLINE MODE (tether out), the
// auto-target picker prefers swing potential over the weapon "hostiles-first/distance" sort.
// pickMasslineAutoTarget() below consumes the pure scorer from masslineTargetScoring.js.
import { solveLeadAngle } from '../systems/weapons.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { wrapAngle } from '../core/rng.js';
import { rankMasslineTargets } from './masslineTargetScoring.js';

export const AUTO_TARGET_REFRESH_S = 0.12;
// Massline candidates include asteroids (mining/slingshot anchors), not just ships/drones — the
// tether latches onto anything physical. Weapons-only targeting stays hostiles-only elsewhere.
const MASSLINE_CANDIDATE_TYPES = new Set(['ship', 'drone', 'asteroid']);
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

function playerLeadSpeed(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player) return 360;
  const ws = player.data && player.data.weapons;
  if (ws && ws.length) {
    for (const w of ws) {
      const sp = w.projSpeed != null ? w.projSpeed : 0;
      if (sp > 0) return sp;
    }
  }
  return 360;
}

export function computeLockedLeadPoint(state) {
  const lockEnt = lockedHostileEntity(state);
  if (!lockEnt) return null;
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || !lockEnt.pos) return lockEnt.pos || null;
  const speed = playerLeadSpeed(state);
  // Ensure vel fields exist for the pure solver (some test fixtures / edge entities may omit).
  const sForLead = { pos: player.pos, vel: player.vel || { x: 0, z: 0 } };
  const tForLead = { pos: lockEnt.pos, vel: lockEnt.vel || { x: 0, z: 0 } };
  const ang = solveLeadAngle(sForLead, tForLead, speed);
  const dist = Math.hypot(lockEnt.pos.x - player.pos.x, lockEnt.pos.z - player.pos.z) || 180;
  return {
    x: player.pos.x + Math.cos(ang) * dist,
    z: player.pos.z + Math.sin(ang) * dist,
  };
}

export function tickAutoTarget(state, dt, bus, runtime = createAutoTargetRuntime()) {
  const inp = state && state.input;
  if (!inp || !inp.autoFire) {
    runtime.refreshT = 0;
    return;
  }
  const player = state.entities && state.entities.get(state.playerId);
  if (!player || !player.pos) return;

  const lockEnt = lockedHostileEntity(state);
  if (lockEnt) {
    const leadPt = computeLockedLeadPoint(state) || lockEnt.pos;
    inp.aimAngle = Math.atan2(leadPt.z - player.pos.z, leadPt.x - player.pos.x);
    inp.aimWorld.x = leadPt.x;
    inp.aimWorld.z = leadPt.z;
  }

  // Auto-target owns weapon aim independently from flight. Relative trackpad motion draws a short
  // world-space route that survives finger lift. Following a position path gives every gesture a
  // visible endpoint, lets curves retain their shape, and prevents an unfinished yaw-rate command
  // from turning into unexplained spin.
  const pathApplied = followAutoTargetPath(inp, player);

  // Transitional fallback for non-pointer callers that still publish a direct world vector.
  const vector = inp.autoTargetVector;
  if (!pathApplied && vector && vector.active) {
    const rawX = Number.isFinite(vector.worldX) ? vector.worldX : 0;
    const rawZ = Number.isFinite(vector.worldZ) ? vector.worldZ : 0;
    const length = Math.hypot(rawX, rawZ);
    const magnitude = Math.max(0, Math.min(1,
      Number.isFinite(vector.magnitude) ? vector.magnitude : length));
    if (length > 1e-6 && magnitude > 0) {
      const worldX = rawX / length;
      const worldZ = rawZ / length;
      const rot = Number.isFinite(player.rot) ? player.rot : 0;
      const forwardX = Math.cos(rot);
      const forwardZ = Math.sin(rot);
      const rightX = -forwardZ;
      const rightZ = forwardX;
      inp.moveZ = Math.max(-1, Math.min(1,
        (worldX * forwardX + worldZ * forwardZ) * magnitude));
      inp.moveX = Math.max(-1, Math.min(1,
        (worldX * rightX + worldZ * rightZ) * magnitude));
      const desiredHeading = Math.atan2(worldZ, worldX);
      const headingError = wrapAngle(desiredHeading - rot);
      inp.turnIntent = Math.max(-1, Math.min(1,
        headingError / AUTO_TARGET_HEADING_SOFT_ANGLE)) * magnitude;
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

  while (index < lastIndex && (
    distance <= AUTO_TARGET_PATH_POINT_RADIUS
    || hasPassedRoutePoint(player.pos, route.points[index - 1], target)
  )) {
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
    route.active = false;
    route.drawing = false;
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
  const rot = finite(player.rot);
  const forwardX = Math.cos(rot);
  const forwardZ = Math.sin(rot);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  inp.moveZ = Math.max(-1, Math.min(1,
    (worldX * forwardX + worldZ * forwardZ) * magnitude));
  inp.moveX = Math.max(-1, Math.min(1,
    (worldX * rightX + worldZ * rightZ) * magnitude));
  const desiredHeading = Math.atan2(headingZ, headingX);
  const headingError = wrapAngle(desiredHeading - rot);
  inp.turnIntent = Math.max(-1, Math.min(1,
    headingError / AUTO_TARGET_HEADING_SOFT_ANGLE));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function projectLockedReticle(state, w2s, viewport = {}) {
  if (!state || !state.input || !state.input.autoFire) return null;
  const leadPt = computeLockedLeadPoint(state);
  const lockEnt = lockedHostileEntity(state);
  const use = leadPt || (lockEnt && lockEnt.pos) || null;
  if (!use || !w2s) return null;

  const width = Number.isFinite(viewport.width) ? viewport.width : 0;
  const height = Number.isFinite(viewport.height) ? viewport.height : 0;
  const cx = width * 0.5;
  const cy = height * 0.5;

  const proj = w2s({ x: use.x, y: 0, z: use.z });
  if (!proj || !Number.isFinite(proj.x) || !Number.isFinite(proj.y)) return null;
  if (proj.onScreen) return { x: proj.x, y: proj.y };

  const margin = RETICLE_EDGE_MARGIN;
  const dx = proj.x - cx;
  const dy = proj.y - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy };

  const ts = [];
  if (Math.abs(dx) > 1e-6) {
    if (dx > 0) ts.push((width - margin - cx) / dx);
    else ts.push((margin - cx) / dx);
  }
  if (Math.abs(dy) > 1e-6) {
    if (dy > 0) ts.push((height - margin - cy) / dy);
    else ts.push((margin - cy) / dy);
  }
  const positives = ts.filter((v) => v > 0 && Number.isFinite(v));
  if (positives.length) {
    const t = Math.min(...positives);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  const len = Math.hypot(dx, dy) || 1;
  return { x: cx + (dx / len) * (width * 0.5 - margin), y: cy + (dy / len) * (height * 0.5 - margin) };
}

/**
 * Massline auto-target picker (rung 08). When the player is in MASSLINE MODE (tether is out, i.e.
 * state.player.tether.active), pick the best slingshot/swing anchor via rankMasslineTargets instead
 * of the weapon "hostiles-first/distance" sort. Returns the picked record or null when not in
 * massline mode / no candidates.
 *
 * Hostility is resolved here via scanner.isHostileToPlayer (per AGENTS §6 — never couple to
 * factionId) and passed into the pure scorer as opts.isHostile, keeping the scorer pure.
 *
 * @param {object} state
 * @param {object} [opts]
 * @param {boolean} [opts.masslineMode]    - force massline mode on/off (default: tether.active).
 * @param {number}  [opts.maxRange=390]    - latch range; defaults to the stock tether maxLength.
 * @param {boolean} [opts.applyLock=true]  - write the pick to state.player.targetId.
 * @returns {{targetId, score, rating}|null}  - null when not in massline mode or no candidate.
 */
export function pickMasslineAutoTarget(state, opts = {}) {
  if (!state || !state.entities || !state.player) return null;

  const tether = state.player.tether;
  const masslineMode = opts.masslineMode != null ? !!opts.masslineMode : !!(tether && tether.active);
  if (!masslineMode) return null;

  const maxRange = positiveFinite(opts.maxRange, 390);
  const player = state.entities.get ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return null;

  // Gather candidate anchors in range. Massline candidates include asteroids (slingshot/mining
  // anchors), unlike weapon targeting. Dead entities and the player are excluded.
  const candidates = [];
  const list = state.entityList || (state.entities ? Array.from(state.entities.values()) : []);
  for (const e of list) {
    if (!e || e.alive === false || e === player || !e.pos) continue;
    if (!MASSLINE_CANDIDATE_TYPES.has(e.type)) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    if (dx * dx + dz * dz > maxRange * maxRange) continue;
    candidates.push(e);
  }
  if (!candidates.length) return null;

  const ranked = rankMasslineTargets(player, candidates, {
    maxRange,
    isHostile: (t) => isHostileToPlayer(t, player.team, state),
    isLatched: tether && tether.targetId != null
      ? (t) => t.id === tether.targetId
      : null,
  });
  if (!ranked.length || ranked[0].score <= 0) return null;

  const best = ranked[0];
  if (opts.applyLock !== false) {
    state.player.targetId = best.id;
  }
  return { targetId: best.id, score: best.score, rating: best.rating };
}

function positiveFinite(v, fb) {
  return Number.isFinite(v) && v > 0 ? v : fb;
}
