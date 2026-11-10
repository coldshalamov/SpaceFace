// A bounded velocity-command drive. Only the native physics owner applies this command,
// BEFORE its collision solve. Never write entity velocity/position or rotate the disc to steer.
import { SAUCER_DRIVE } from '../../data/saucer.js';

const finite = (v) => Number.isFinite(v) ? v : 0;

/** Keyboard diagonals have unit speed; analogue stick magnitude below one is preserved. */
export function saucerDirection(x, z) {
  x = Math.max(-1, Math.min(1, finite(x)));
  z = Math.max(-1, Math.min(1, finite(z)));
  const scale = Math.max(1, Math.hypot(x, z));
  return { x: x / scale, z: z / scale };
}

/** In the game's top-down view +X is right and +Z is up. No heading projection. */
export function projectSaucerControls({ keys = {}, left, right, up, down,
  source = 'keyboard', pad = null, touch = null, brake = false } = {}) {
  let x = 0, z = 0;
  if (source === 'gamepad' && pad) {
    x = finite(pad.leftX); z = -finite(pad.leftY);
  } else if (source === 'touch' && touch) {
    x = finite(touch.leftX); z = -finite(touch.leftY);
  } else {
    // Production passes resolved bindings, including false for a released/unbound key.
    // Standalone callers can omit them to use defaults; defaults never override a rebind.
    x = Number(!!(right ?? (keys.ArrowRight || keys.KeyD)))
      - Number(!!(left ?? (keys.ArrowLeft || keys.KeyA)));
    z = Number(!!(up ?? (keys.ArrowUp || keys.KeyW)))
      - Number(!!(down ?? (keys.ArrowDown || keys.KeyS)));
  }
  const direction = brake ? { x: 0, z: 0 } : saucerDirection(x, z);
  return { moveX: direction.x, moveZ: direction.z, turnIntent: 0, brake: !!brake };
}

export function saucerVelocity(input, boosting = false, controlScale = 1) {
  const direction = input?.brake ? { x: 0, z: 0 }
    : saucerDirection(input?.moveX, input?.moveZ);
  const scale = Math.max(0, Math.min(1, Number.isFinite(controlScale) ? controlScale : 1));
  const speed = (boosting ? SAUCER_DRIVE.boostSpeed : SAUCER_DRIVE.cruiseSpeed) * scale;
  return { x: direction.x * speed, y: 0, z: direction.z * speed };
}
