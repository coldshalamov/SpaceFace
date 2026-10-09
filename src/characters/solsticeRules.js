// src/characters/solsticeRules.js — Pure geometric & physics helpers for Solstice.
import { occupantGenerationOf } from '../core/entity.js';
import { SOLSTICE as C } from '../data/solstice.js';

export const finiteXZ = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Calculates the ideal focal position for a prism around the core.
 * Three focal nodes spaced at 120° (2π/3 radians).
 */
export function prismFocalGoal(index, baseAngle = 0, center = C.anchor, out = {}) {
  const angle = wrapAngle(baseAngle + (index * (Math.PI * 2 / 3)));
  out.x = center.x + Math.cos(angle) * C.focalRadius;
  out.z = center.z + Math.sin(angle) * C.focalRadius;
  return out;
}

/**
 * Checks if a prism is in harmonic resonance with its focal node.
 */
export function isPrismInFocalZone(prismPos, focalGoal, tolerance = C.focalTolerance) {
  if (!finiteXZ(prismPos) || !finiteXZ(focalGoal)) return false;
  return distanceXZ(prismPos, focalGoal) <= tolerance;
}

/**
 * Soft physical restoring spring servo for prisms in orbit.
 * Gives loose prisms gentle orbital elasticity so the player can sling them or tether them.
 */
export function boundedPrismServo(entity, goal, dt, maxAcc = 28, out = {}) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(entity?.vel) || !finiteXZ(goal)
      || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return null;
  const kP = 2.2;
  const kD = 2.6;
  let fx = (goal.x - entity.pos.x) * kP - entity.vel.x * kD;
  let fz = (goal.z - entity.pos.z) * kP - entity.vel.z * kD;
  const mag = Math.hypot(fx, fz);
  const scale = mag > maxAcc ? maxAcc / mag : 1;
  out.x = fx * scale * dt;
  out.z = fz * scale * dt;
  return out;
}

/**
 * Checks if player ship is currently inside Solstice's directional light beam.
 */
export function isPlayerInBeam(playerPos, corePos, beamAngle, beamLength = C.beamLength, halfAngle = C.beamHalfAngle) {
  if (!finiteXZ(playerPos) || !finiteXZ(corePos) || !Number.isFinite(beamAngle)) return false;
  const dx = playerPos.x - corePos.x;
  const dz = playerPos.z - corePos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < C.coreRadius * 0.9 || dist > beamLength) return false;
  const angleToPlayer = Math.atan2(dz, dx);
  const angleDiff = Math.abs(wrapAngle(angleToPlayer - beamAngle));
  return angleDiff <= halfAngle;
}

/**
 * Authoritative tether attachment check.
 * If the player has a tether hooked to this prism, sim must let player pull it without fighting the cable.
 */
export function playerOwnsPrismTether(state, prism) {
  const rows = state?.combat?.attachments?.byId;
  const player = state?.entities?.get(state?.playerId);
  if (!rows || !prism?.alive || !player?.alive || state.entities.get(prism.id) !== prism) return false;
  for (const key of Object.keys(rows)) {
    const a = rows[key];
    if (a?.state === 'active' && a.ownerId === state.playerId && a.targetId === prism.id
      && (a.ownerGeneration == null || a.ownerGeneration === occupantGenerationOf(player))
      && (a.targetGeneration == null || a.targetGeneration === occupantGenerationOf(prism))) {
      return true;
    }
  }
  return false;
}

/**
 * Smooth follower servo for the Lumen Wisp companion drone.
 * Follows slightly behind the player ship's movement vector.
 */
export function wispFollowServo(wisp, player, dt, out = {}) {
  if (!finiteXZ(wisp?.pos) || !finiteXZ(player?.pos) || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) return null;
  const wVel = finiteXZ(wisp?.vel) ? wisp.vel : { x: 0, z: 0 };
  const pVel = finiteXZ(player?.vel) ? player.vel : { x: 0, z: 0 };
  const pSpeed = Math.hypot(pVel.x, pVel.z);
  const heading = pSpeed > 2 ? Math.atan2(pVel.z, pVel.x) : (player.rot || 0);
  const targetX = player.pos.x - Math.cos(heading) * 36;
  const targetZ = player.pos.z - Math.sin(heading) * 36;

  const dx = targetX - wisp.pos.x;
  const dz = targetZ - wisp.pos.z;
  const dist = Math.hypot(dx, dz);
  const maxSpeed = C.wispSpeed;
  const desiredSpeed = Math.min(maxSpeed, dist * 3.5);
  const targetVx = dist > 0.1 ? (dx / dist) * desiredSpeed : 0;
  const targetVz = dist > 0.1 ? (dz / dist) * desiredSpeed : 0;

  const accRate = 6.0;
  const dvx = (targetVx - wVel.x) * clamp(accRate * dt, 0, 1);
  const dvz = (targetVz - wVel.z) * clamp(accRate * dt, 0, 1);

  out.vx = wVel.x + dvx;
  out.vz = wVel.z + dvz;
  out.x = out.vx * dt;
  out.z = out.vz * dt;
  return out;
}
