// Relative dynamic combat-stick input for G auto-target mode.
//
// The physical device is a mouse/trackpad, but the control law behaves like a floating joystick:
// G establishes a neutral center, relative motion displaces a virtual knob from that center, and
// displacement direction + magnitude become a continuous world-space flight vector. The stick is
// bounded (no unbounded mouse-position acceleration) and has a small deadzone + progressive response
// so tiny trackpad noise does not yaw the hull while deliberate combat swipes reach full authority.
//
// This module owns only intent geometry. The propulsion kernel still owns acceleration, turn rate,
// drag, cargo penalties, boost, and every other piece of ship physics.
export const DYNAMIC_FLIGHT_STICK_TUNING = Object.freeze({
  radiusViewportFraction: 0.17,
  minRadiusPx: 118,
  maxRadiusPx: 176,
  deadzonePx: 10,
  responseExponent: 1.16,
  corruptPacketViewportMult: 4,
});

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const validPoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.z);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function dynamicFlightStickRadius(width, height) {
  const shortSide = Math.max(1, Math.min(finite(width, 1), finite(height, 1)));
  return clamp(
    shortSide * DYNAMIC_FLIGHT_STICK_TUNING.radiusViewportFraction,
    DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx,
    DYNAMIC_FLIGHT_STICK_TUNING.maxRadiusPx,
  );
}

export function emptyDynamicFlightStick(width = 1, height = 1) {
  return {
    xPx: 0,
    yPx: 0,
    radiusPx: dynamicFlightStickRadius(width, height),
  };
}

export function resetDynamicFlightStick(host, width = 1, height = 1) {
  if (!host) return emptyDynamicFlightStick(width, height);
  host._autoTargetStick = emptyDynamicFlightStick(width, height);
  return host._autoTargetStick;
}

/**
 * Accumulate one relative pointer packet into the bounded virtual stick.
 * Returns true when the packet was accepted.
 */
export function recordDynamicFlightStick(host, dx, dy, width, height) {
  if (!host || !Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return false;
  const w = Math.max(1, finite(width, 1));
  const h = Math.max(1, finite(height, 1));
  if (Math.hypot(dx, dy) > Math.max(w, h) * DYNAMIC_FLIGHT_STICK_TUNING.corruptPacketViewportMult) {
    return false;
  }

  const radiusPx = dynamicFlightStickRadius(w, h);
  const stick = host._autoTargetStick || resetDynamicFlightStick(host, w, h);
  stick.radiusPx = radiusPx;
  stick.xPx = finite(stick.xPx) + dx;
  stick.yPx = finite(stick.yPx) + dy;

  const length = Math.hypot(stick.xPx, stick.yPx);
  if (length > radiusPx && length > 1e-6) {
    const scale = radiusPx / length;
    stick.xPx *= scale;
    stick.yPx *= scale;
  }
  return true;
}

function shapedMagnitude(rawMagnitude, deadzoneFraction) {
  if (!(rawMagnitude > deadzoneFraction)) return 0;
  const t = clamp((rawMagnitude - deadzoneFraction) / Math.max(1e-6, 1 - deadzoneFraction), 0, 1);
  return Math.pow(t, DYNAMIC_FLIGHT_STICK_TUNING.responseExponent);
}

/**
 * Project the virtual stick through the live camera's screen basis into a world-space vector.
 * screenX/screenY stay normalized for HUD presentation; worldX/worldZ carry shaped magnitude.
 */
export function projectDynamicFlightStick(host, width, height) {
  const stick = host && host._autoTargetStick;
  const state = host && host.state;
  const inp = state && state.input;
  if (!stick || !inp?.autoFire) {
    return { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 };
  }

  const radiusPx = Math.max(1, finite(stick.radiusPx, dynamicFlightStickRadius(width, height)));
  const sx = clamp(finite(stick.xPx) / radiusPx, -1, 1);
  const sy = clamp(finite(stick.yPx) / radiusPx, -1, 1);
  const rawMagnitude = Math.min(1, Math.hypot(sx, sy));
  const deadzoneFraction = Math.min(0.35, DYNAMIC_FLIGHT_STICK_TUNING.deadzonePx / radiusPx);
  const magnitude = shapedMagnitude(rawMagnitude, deadzoneFraction);
  if (!(magnitude > 0)) {
    return { active: false, screenX: sx, screenY: sy, worldX: 0, worldZ: 0, magnitude: 0 };
  }

  const player = state.entities?.get?.(state.playerId);
  const raycast = host.helpers?.raycastToPlane;
  const worldToScreen = host.helpers?.worldToScreen;
  if (!validPoint(player?.pos) || typeof raycast !== 'function') {
    // Fallback preserves the intuitive screen axes when a headless harness has no renderer basis.
    const length = Math.hypot(sx, sy) || 1;
    return {
      active: true,
      screenX: sx,
      screenY: sy,
      worldX: (sx / length) * magnitude,
      worldZ: (-sy / length) * magnitude,
      magnitude,
    };
  }

  const w = Math.max(1, finite(width, 1));
  const h = Math.max(1, finite(height, 1));
  const screen = typeof worldToScreen === 'function'
    ? worldToScreen({ ...player.pos, y: 0 })
    : null;
  const centerX = Number.isFinite(screen?.x) ? screen.x : w * 0.5;
  const centerY = Number.isFinite(screen?.y) ? screen.y : h * 0.5;
  const at = (x, y) => raycast({ x: x / w * 2 - 1, y: 1 - y / h * 2 });

  // Snapshot scalars because the renderer may recycle one scratch ray result.
  const center = at(centerX, centerY);
  if (!validPoint(center)) {
    return { active: false, screenX: sx, screenY: sy, worldX: 0, worldZ: 0, magnitude: 0 };
  }
  const cx = center.x, cz = center.z;
  const right = at(centerX + 1, centerY);
  if (!validPoint(right)) {
    return { active: false, screenX: sx, screenY: sy, worldX: 0, worldZ: 0, magnitude: 0 };
  }
  const rx = right.x - cx, rz = right.z - cz;
  const down = at(centerX, centerY + 1);
  if (!validPoint(down)) {
    return { active: false, screenX: sx, screenY: sy, worldX: 0, worldZ: 0, magnitude: 0 };
  }

  const worldX = rx * sx + (down.x - cx) * sy;
  const worldZ = rz * sx + (down.z - cz) * sy;
  const worldLength = Math.hypot(worldX, worldZ);
  if (!(worldLength > 1e-8)) {
    return { active: false, screenX: sx, screenY: sy, worldX: 0, worldZ: 0, magnitude: 0 };
  }
  return {
    active: true,
    screenX: sx,
    screenY: sy,
    worldX: worldX / worldLength * magnitude,
    worldZ: worldZ / worldLength * magnitude,
    magnitude,
  };
}
