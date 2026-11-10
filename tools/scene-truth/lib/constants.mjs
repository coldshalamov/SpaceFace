import {
  FLIGHT_PLANE_STICK_FRACTION,
  FLIGHT_PLANE_STICK_MIN_WU,
} from '../../../src/data/modelTruthMath.js';

/**
 * Calibrated scene-truth tolerances.
 * Penetration allowance is the production flight-plane stick
 * (src/data/modelTruthMath.js), not a knob widened to hide overlaps.
 * Pixel differences across GPUs are review items and do not fail the build.
 */
export const SCENE_TRUTH_TOLERANCE = Object.freeze({
  schema: 'spaceface.sceneTruthTolerance.v1',
  penetrationUsesFlightPlaneStick: true,
  flightPlaneStickFraction: FLIGHT_PLANE_STICK_FRACTION,
  flightPlaneStickMinWu: FLIGHT_PLANE_STICK_MIN_WU,
  scaleMismatchRatio: 1.35,
  zFightStackWu: 0.35,
  vfxHideCoverage: 0.8,
  loadToFirstDrawMs: 1500,
  pixelDriftFailsBuild: false,
});

/**
 * Mirrors src/render/vfx.js QUALITY_BURST. vfx.js builds GPU pools on import,
 * so the observatory does not load it. A test locks these numbers to that file.
 */
export const VFX_QUALITY_BURST = Object.freeze({
  low: 0.55,
  med: 0.8,
  medium: 0.8,
  high: 1.0,
});

export const WITNESS_SCHEMA = 'spaceface.sceneTruthWitness.v1';
export const REPORT_SCHEMA = 'spaceface.sceneTruthReport.v1';
export const VERDICT_SCHEMA = 'spaceface.sceneTruthVerdict.v1';
export const HOOK_SCHEMA = 'spaceface.sceneTruthHookFrame.v1';

export const LOAD_TO_FIRST_DRAW_MS = SCENE_TRUTH_TOLERANCE.loadToFirstDrawMs;

export function burstForParticleQuality(particleQuality) {
  const key = particleQuality || 'high';
  return Object.prototype.hasOwnProperty.call(VFX_QUALITY_BURST, key)
    ? VFX_QUALITY_BURST[key]
    : 1;
}
