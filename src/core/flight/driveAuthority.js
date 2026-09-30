// NXB-004 — remaining drive authority for the propulsion stack.
//
// Thruster health already becomes a forward/reverse/strafe/yaw fraction
// (measureThrusterAuthority). A destroyed subsystem_drive also publishes
// multipliers.movement = 0, which is a stun if the helm multiplies by it.
// This composer keeps a steer floor and never reads hull hit points, the
// stick, or that movement multiplier.

/** Below this fraction a dead main drive is still a drive: weak, not a stun. */
export const DAMAGED_DRIVE_AUTHORITY_FLOOR = 0.22;

const MAIN_DRIVE_IDS = new Set(['drive-port', 'drive-starboard']);

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Fraction of catalog drive accel still available from combat state.
 * No drive subsystem, or a non-finite health read, stays at full authority.
 * `multipliers.movement` is intentionally unread.
 */
export function combatDriveScale(runtime) {
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  if (!drive) return 1;
  // A dead reactor disables the drive through its dependency while drive health
  // is still full. That flag is the drive being out, not a stun multiplier.
  if (drive.effectiveDisabled === true) return DAMAGED_DRIVE_AUTHORITY_FLOOR;
  const max = Number(drive.maxHealth);
  const health = Number(drive.health);
  if (!(max > 0) || !Number.isFinite(health)) return 1;
  return Math.max(DAMAGED_DRIVE_AUTHORITY_FLOOR, clamp01(health / max, 1));
}

function thrustersAreUndamaged(thrusters) {
  for (let i = 0; i < thrusters.length; i += 1) {
    const thruster = thrusters[i];
    if (thruster && clamp01(thruster.health, 1) < 1) return false;
  }
  return true;
}

function thrusterWeight(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Channel scales the propulsion kernel applies to force and torque.
 * Undamaged thrusters publish the drive fraction on forward and reverse
 * and leave yaw and strafe full, so a drive hit is not diluted by the
 * synthetic RCS pair. A thruster that is actually hurt then weights in.
 * `multipliers.movement` is not an input. With no thruster list, forward
 * and reverse take the drive fraction and yaw/strafe stay full.
 */
export function composePlayerDriveAuthority(thrusters, runtime) {
  const driveScale = combatDriveScale(runtime);
  // Default craft thrusters are a synthetic port/starboard/RCS set installed
  // for every hull. Mixing those full-health RCS weights into a drive hit
  // hides the drive fraction. Use the drive fraction itself until a thruster
  // is actually hurt.
  if (!Array.isArray(thrusters) || thrusters.length === 0 || thrustersAreUndamaged(thrusters)) {
    return { forward: driveScale, reverse: driveScale, strafe: 1, yaw: 1 };
  }
  let forward = 0;
  let reverse = 0;
  let strafe = 0;
  let yaw = 0;
  let forwardMax = 0;
  let reverseMax = 0;
  let strafeMax = 0;
  let yawMax = 0;
  for (let i = 0; i < thrusters.length; i += 1) {
    const thruster = thrusters[i];
    if (!thruster) continue;
    const health = clamp01(thruster.health, 1);
    const scale = MAIN_DRIVE_IDS.has(String(thruster.id)) ? health * driveScale : health;
    const fw = thrusterWeight(thruster.forward);
    const rv = thrusterWeight(thruster.reverse);
    const st = thrusterWeight(thruster.strafe);
    const yw = thrusterWeight(thruster.yaw);
    forward += scale * fw;
    reverse += scale * rv;
    strafe += scale * st;
    yaw += scale * yw;
    forwardMax += fw;
    reverseMax += rv;
    strafeMax += st;
    yawMax += yw;
  }
  return {
    forward: forwardMax > 0 ? forward / forwardMax : driveScale,
    reverse: reverseMax > 0 ? reverse / reverseMax : driveScale,
    strafe: strafeMax > 0 ? strafe / strafeMax : 1,
    yaw: yawMax > 0 ? yaw / yawMax : 1,
  };
}

/** True when every channel is at full authority. Undefined authority is full. */
export function channelAuthorityIsFull(authority) {
  if (!authority) return true;
  return clamp01(authority.forward, 1) >= 1
    && clamp01(authority.reverse, 1) >= 1
    && clamp01(authority.strafe, 1) >= 1
    && clamp01(authority.yaw, 1) >= 1;
}
