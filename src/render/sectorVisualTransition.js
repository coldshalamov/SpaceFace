// Shared timing and value interpolation for sector-owned presentation. Simulation membership may
// change at one fixed-step boundary; the player-facing presentation eases into that new identity.

export const SECTOR_VISUAL_TRANSITION_SECONDS = 1.5;

export function easeSectorTransition(value) {
  const t = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return t * t * (3 - 2 * t);
}

export function snapshotSectorPost(post, out = {}) {
  const source = post && typeof post === 'object' ? post : null;
  out.exposure = Number.isFinite(source && source.exposure) ? source.exposure : null;
  out.bloomStrengthScale = Number.isFinite(source && source.bloomStrengthScale)
    ? source.bloomStrengthScale
    : 1;
  out.bloomThresholdBias = Number.isFinite(source && source.bloomThresholdBias)
    ? source.bloomThresholdBias
    : 0;
  return out;
}

export function interpolateSectorPost(start, target, t, out = {}) {
  const a = start || {};
  const b = target || {};
  out.exposure = interpolateOptional(a.exposure, b.exposure, t);
  out.bloomStrengthScale = interpolateNumber(a.bloomStrengthScale, b.bloomStrengthScale, t, 1);
  out.bloomThresholdBias = interpolateNumber(a.bloomThresholdBias, b.bloomThresholdBias, t, 0);
  return out;
}

function interpolateOptional(start, target, t) {
  const hasStart = Number.isFinite(start);
  const hasTarget = Number.isFinite(target);
  if (hasStart && hasTarget) return start + (target - start) * t;
  if (hasTarget) return t >= 1 ? target : null;
  return hasStart ? (t >= 1 ? null : start) : null;
}

function interpolateNumber(start, target, t, fallback) {
  const a = Number.isFinite(start) ? start : fallback;
  const b = Number.isFinite(target) ? target : fallback;
  return a + (b - a) * t;
}
