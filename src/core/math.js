// Math helpers. 2D math operates on the XZ plane (see ARCHITECTURE §0.1):
// where you see (x, z) it is (world.x, world.z); +Y is up and held at 0 in sim.
import { wrapAngle } from './rng.js';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const approach = (cur, tgt, maxDelta) => {
  const d = tgt - cur;
  if (Math.abs(d) <= maxDelta) return tgt;
  return cur + Math.sign(d) * maxDelta;
};

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// Frame-rate-independent damping toward a target (lambda = rate/sec).
export const damp = (cur, tgt, lambda, dt) => lerp(cur, tgt, 1 - Math.exp(-lambda * dt));

// --- XZ-plane (2D) helpers ---
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const distSq2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const len2 = (x, z) => Math.hypot(x, z);
export const angleTo = (fromX, fromZ, toX, toZ) => Math.atan2(toZ - fromZ, toX - fromX);

/** Interpolate between two angles along the shortest arc. */
export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

// --- RNG convenience (take a () => [0,1) stream) ---
export const rand = (rng, lo, hi) => lo + (hi - lo) * rng();
export const randInt = (rng, lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const chance = (rng, p) => rng() < p;

export { wrapAngle };
