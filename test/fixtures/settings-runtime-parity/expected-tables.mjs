/**
 * SETTINGS-RUNTIME-TRUTH — independent headed parity lane tables.
 * Mirrors vfx PARTICLE_CAP / QUALITY_BURST and gameState video defaults.
 * Unique path: test/fixtures/settings-runtime-parity/
 */

export const PROFILE_KEY = 'sf.settings.profile.v1';
export const SAVE_SLOT = 'settings-runtime-parity';

export const PARTICLE_CAP = Object.freeze({
  low: 1500,
  med: 3000,
  medium: 3000,
  high: 4000,
});

export const QUALITY_BURST = Object.freeze({
  low: 0.55,
  med: 0.8,
  medium: 0.8,
  high: 1.0,
});

/** Default video slice from createGameState. */
export const DEFAULT_VIDEO = Object.freeze({
  renderScale: 1.0,
  pixelRatioCap: 2,
  shadows: true,
  particleQuality: 'medium',
  bloom: true,
  fov: 50,
});

/**
 * Max excursion for current → max → current.
 *
 * renderScale is 2 (the top of the documented 0.5..2 clamp, matching
 * graphics-profile-bootstrap's max) rather than 1. Once the shipped default rose to native 1.0,
 * a max of 1 would have made the renderScale leg of this excursion vacuous — the "max" and the
 * "current" it is meant to travel away from would have been the same number.
 */
export const MAX_VIDEO = Object.freeze({
  renderScale: 2,
  pixelRatioCap: 4,
  shadows: true,
  particleQuality: 'high',
  bloom: true,
  fov: 50,
});

export const VIEWPORT = Object.freeze({ width: 1440, height: 900 });

export const BUS_EVENTS_TO_COUNT = Object.freeze([
  'settings:changed',
  'combat:fire',
  'projectile:hit',
  'save:loaded',
  'entity:killed',
  'entity:destroyed',
]);

/** Electron fixed local origin port (gameServer / desktop shell). */
export const ELECTRON_FIXED_PORT = 41788;

/**
 * Expected draw pixel ratio: min(dpr, cap) * renderScale * dynResScale.
 * Mirrors renderer applyRendererSize (no WebGL).
 */
export function expectedPixelRatio(video, {
  devicePixelRatio = 1,
  dynResScale = 1,
} = {}) {
  const vd = video || {};
  const cap = finiteInRange(vd.pixelRatioCap, 0.25, 4, 2);
  const scale = finiteInRange(vd.renderScale, 0.5, 2, 1);
  const dyn = finiteInRange(dynResScale, 0.2, 1, 1);
  const base = Math.min(devicePixelRatio || 1, cap);
  return Math.max(0.2, base * scale * dyn);
}

export function expectedDrawBuffer(video, {
  cssWidth = 1440,
  cssHeight = 900,
  devicePixelRatio = 1,
  dynResScale = 1,
} = {}) {
  const pr = expectedPixelRatio(video, { devicePixelRatio, dynResScale });
  return {
    pixelRatio: pr,
    width: Math.floor(cssWidth * pr),
    height: Math.floor(cssHeight * pr),
  };
}

/** Canonical settings JSON from raw profile bytes (strips updatedAt for equality). */
export function profileSettingsCanonical(raw) {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    const settings = parsed && parsed.settings && typeof parsed.settings === 'object'
      ? parsed.settings
      : null;
    return settings ? JSON.stringify(settings) : null;
  } catch {
    return null;
  }
}

export function finiteInRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
