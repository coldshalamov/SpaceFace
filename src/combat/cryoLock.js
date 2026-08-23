// Cryo Lock (PQ-133.06 / CRU-040).
// Momentum is preserved. Control authority is reduced. This is not a stun.

export const CRYO_LOCK_STATUS_ID = 'status_cryo_lock';
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
