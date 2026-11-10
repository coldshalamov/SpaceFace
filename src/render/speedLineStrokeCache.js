// Allocation-free speed-line stroke helpers.
//
// The overlay is pixel-preserving: same ceilings, same fade ramps, same composite. What changes
// is that recycled streaks mutate in place and rgba() strings are reused by quantized alpha.

const RGBA_CACHE = new Map();

export function quantizeSpeedLineAlpha(alpha) {
  const a = Number(alpha);
  if (!Number.isFinite(a) || a <= 0) return 0;
  if (a >= 1) return 255;
  return Math.max(0, Math.min(255, Math.round(a * 255)));
}

export function speedLineRgba(r, g, b, alpha) {
  const q = quantizeSpeedLineAlpha(alpha);
  if (q <= 0) return `rgba(${r | 0},${g | 0},${b | 0},0)`;
  const key = ((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | q;
  let cached = RGBA_CACHE.get(key);
  if (cached) return cached;
  cached = `rgba(${r & 255},${g & 255},${b & 255},${(q / 255).toFixed(3)})`;
  RGBA_CACHE.set(key, cached);
  return cached;
}

export function fillSpeedLineStreak(target, spawnCenter, span, width, height, rng = Math.random) {
  const dest = target && typeof target === 'object' ? target : {};
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const uv = spawnCenter
    ? -(0.08 + rng() * 0.97) * span
    : (rng() - 0.5) * span * 1.6;
  dest.uv = uv;
  dest.spawnU = uv;
  dest.p = (rng() - 0.5) * Math.max(w, h) * (spawnCenter ? 0.95 : 1.1);
  dest.v = 0.65 + rng() * 0.85;
  dest.len = 0.10 + rng() * 0.18;
  dest.b = 0.40 + rng() * 0.55;
  dest.w = 0.7 + rng() * 1.5;
  return dest;
}

export function clearSpeedLineRgbaCacheForTests() {
  RGBA_CACHE.clear();
  STREAK_GRADIENT_CACHE.clear();
}

// One unit-space CanvasGradient per (palette, quantized alpha). A streak used to allocate a
// fresh createLinearGradient per draw — ~46 objects a frame at full drive. Gradients pick up
// the current transform at paint time, so the caller maps (0,0)->tail and (1,0)->lead with a
// rotate+uniform-scale and every streak sharing a palette+alpha bucket reuses the same object.
// Stops are [offset, r, g, b, alphaMul] rows; alphaMul scales the streak alpha per stop.
const STREAK_GRADIENT_CACHE = new Map();
const STREAK_ALPHA_BUCKETS = 64;

export function speedLineStreakGradient(ctx, paletteId, stops, alpha) {
  const a = Number(alpha);
  const q = !Number.isFinite(a) || a <= 0 ? 0
    : a >= 1 ? STREAK_ALPHA_BUCKETS
    : Math.round(a * STREAK_ALPHA_BUCKETS);
  const key = paletteId * (STREAK_ALPHA_BUCKETS + 1) + q;
  let grad = STREAK_GRADIENT_CACHE.get(key);
  if (grad) return grad;
  if (STREAK_GRADIENT_CACHE.size >= 512) STREAK_GRADIENT_CACHE.clear();
  const bucketAlpha = q / STREAK_ALPHA_BUCKETS;
  grad = ctx.createLinearGradient(0, 0, 1, 0);
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    grad.addColorStop(stop[0], speedLineRgba(stop[1], stop[2], stop[3], bucketAlpha * stop[4]));
  }
  STREAK_GRADIENT_CACHE.set(key, grad);
  return grad;
}
