// Cryo Lock (PQ-133.06 / CRU-040).
// Momentum is preserved. Control authority is reduced. This is not a stun.
// Catalog identity lives in combatDefs (STATUS_DEFS). The helm reads stacks from there.

import { CRYO_LOCK_STATUS_ID } from '../data/combatDefs.js';

export { CRYO_LOCK_STATUS_ID };
export const CRYO_LOCK_CONTROL_SCALE = 0.35;
export const CRYO_LOCK_CONTROL_FLOOR = 0.2;
export const CRYO_LOCK_DURATION_TICKS = 90;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Control multiplier while Cryo Lock is active. Never reaches 0 — a zeroed helm is a stun.
 */
export function cryoLockControlScale(stacks = 1) {
  const n = Number.isInteger(stacks) && stacks > 0 ? stacks : 0;
  if (n <= 0) return 1;
  const scaled = CRYO_LOCK_CONTROL_SCALE / Math.min(n, 3);
  return Math.max(CRYO_LOCK_CONTROL_FLOOR, scaled);
}

/**
 * Apply Cryo Lock to a body snapshot. Translational velocity is copied, never rewritten.
 */
export function applyCryoLock(body, stacks = 1) {
  const vx = finite(body && body.vx);
  const vz = finite(body && body.vz);
  const n = Number.isInteger(stacks) && stacks > 0 ? stacks : 1;
  return {
    vx,
    vz,
    controlScale: cryoLockControlScale(n),
    statusId: CRYO_LOCK_STATUS_ID,
    stacks: n,
    durationTicks: CRYO_LOCK_DURATION_TICKS,
  };
}

/**
 * Advance a locked body. The lock itself does not damp velocity. Only scaled control input
 * may change speed, and with zero input the velocity is bit-identical.
 */
export function tickCryoLockedMotion(body, input = {}, dt = 1 / 60) {
  const vx = finite(body && body.vx);
  const vz = finite(body && body.vz);
  const scale = Number.isFinite(body && body.controlScale) ? body.controlScale : 1;
  const step = Number.isFinite(dt) ? dt : 0;
  const ax = finite(input.ax) * scale;
  const az = finite(input.az) * scale;
  return { vx: vx + ax * step, vz: vz + az * step };
}

export function hasCryoLock(statusIds) {
  if (Array.isArray(statusIds)) return statusIds.includes(CRYO_LOCK_STATUS_ID);
  if (statusIds && typeof statusIds === 'object') return !!statusIds[CRYO_LOCK_STATUS_ID];
  return false;
}

/**
 * Active Cryo Lock stacks on a combat runtime, or 0 if the lock is absent / expired.
 */
export function cryoLockStacksFromRuntime(runtime, tick = null) {
  const active = runtime && runtime.statuses && runtime.statuses[CRYO_LOCK_STATUS_ID];
  if (!active) return 0;
  if (Number.isInteger(tick) && Number.isInteger(active.expiresTick) && active.expiresTick <= tick) return 0;
  const stacks = Number.isInteger(active.stacks) && active.stacks > 0 ? active.stacks : 1;
  return stacks;
}

/**
 * Helm control scale for a live combatant. 1 when unlocked. Never 0 — a zeroed helm is a stun.
 * Reads combat runtime only; does not create combat state and never writes velocity.
 */
export function helmControlScaleFromCombat(state, entityId) {
  const table = state && state.combat && state.combat.entities;
  if (!table || entityId == null) return 1;
  const runtime = table[String(entityId)];
  const stacks = cryoLockStacksFromRuntime(runtime, Number.isInteger(state && state.tick) ? state.tick : null);
  if (stacks <= 0) return 1;
  return cryoLockControlScale(stacks);
}

/**
 * Stick/command presence for the Cryo Lock helm rule. Autopilot throttle counts as command.
 * Zero command means a locked coast must be bit-identical.
 */
export function cryoLockStickLive(input) {
  if (!input || typeof input !== 'object') return false;
  const throttle = Number.isFinite(input.throttle) ? input.throttle : 0;
  const strafe = Number.isFinite(input.strafe) ? input.strafe : 0;
  const turn = Number.isFinite(input.turn) ? input.turn : 0;
  return throttle !== 0 || strafe !== 0 || turn !== 0 || !!input.boost || !!input.brake;
}

/**
 * Scale a helm command under Cryo Lock. Unlocked (scale >= 1) returns the same object.
 * No stick: force, torque, and impulse are zeroed so assist braking cannot steal momentum.
 * Stick: every helm-authored vector is multiplied by the lock scale. Velocity is never written.
 */
export function scaleHelmCommandForCryoLock(command, scale, stickLive) {
  const s = Number.isFinite(scale) ? scale : 1;
  if (!(s < 1)) return command;
  if (!stickLive) {
    return {
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      impulse: null,
    };
  }
  const force = command && command.force ? command.force : { x: 0, y: 0, z: 0 };
  const torque = command && command.torque ? command.torque : { x: 0, y: 0, z: 0 };
  const impulse = command && command.impulse;
  return {
    force: {
      x: finite(force.x) * s,
      y: finite(force.y) * s,
      z: finite(force.z) * s,
    },
    torque: {
      x: finite(torque.x) * s,
      y: finite(torque.y) * s,
      z: finite(torque.z) * s,
    },
    impulse: impulse
      ? { x: finite(impulse.x) * s, y: finite(impulse.y) * s, z: finite(impulse.z) * s }
      : null,
  };
}
