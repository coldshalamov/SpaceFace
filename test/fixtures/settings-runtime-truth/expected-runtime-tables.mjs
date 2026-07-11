/**
 * SETTINGS-RUNTIME-TRUTH — expected tables for headed browser/Electron proof.
 * Mirrors live src/render/vfx.js PARTICLE_CAP / QUALITY_BURST and gameState video defaults.
 * Unique fixture path; safe for git add -N.
 */

export const PROFILE_KEY = 'sf.settings.profile.v1';

/** Match vfx.js pool caps by particleQuality (low/med|medium/high). */
export const PARTICLE_CAP = Object.freeze({
  low: 1500,
  med: 3000,
  medium: 3000,
  high: 4000,
});

/** Match vfx.js QUALITY_BURST spawn multipliers. */
export const QUALITY_BURST = Object.freeze({
  low: 0.55,
  med: 0.8,
  medium: 0.8,
  high: 1.0,
});

/** Default video slice from createGameState (src/core/gameState.js). */
export const DEFAULT_VIDEO = Object.freeze({
  renderScale: 0.85,
  pixelRatioCap: 2,
  shadows: false,
  particleQuality: 'medium',
  bloom: true,
  fov: 50,
});

/** Live excursion: current → max quality surface → restore current. */
export const MAX_VIDEO = Object.freeze({
  renderScale: 2,
  pixelRatioCap: 2,
  shadows: true,
  particleQuality: 'high',
  bloom: true,
  fov: 50,
});

export const VIEWPORT = Object.freeze({ width: 1280, height: 800 });

export const BUS_EVENTS_TO_COUNT = Object.freeze([
  'settings:changed',
  'combat:fire',
  'projectile:hit',
  'save:loaded',
  'entity:killed',
  'entity:destroyed',
]);

/** Electron packaged-app fixed origin port (localStorage save survival). */
export const ELECTRON_FIXED_PORT = 41788;
