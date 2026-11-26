// GLASSWAKE: authored expedition geometry. Units are world units / seconds / tonnes.
// These are independent weather courses, not global balance overrides.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const STORM_LIMITS = freeze({
  schemaVersion: 1,
  maxBodies: 48,
  maxCandidateChecks: 96,
  maxCovers: 8,
  maxDebris: 10,
  maxSamples: 6,
  maxForecastSamples: 16,
  maxForecastHorizon: 60,
  maxAcceleration: 36,
  maxForce: 14000,
  maxImpulse: 320,
  maxDt: 0.1,
  maxFlowSpeed: 96,
  maxRelativeSpeed: 640,
  maxPlanSpan: 1800,
  heavyCoverMass: 96,
  shelterLength: 160,
  extractionRadius: 76,
  sampleChargeSeconds: 4,
  sampleRelativeSpeed: 36,
});

export const STORM_PATTERNS = freeze([
  {
    id: 'lee_arc',
    name: 'The Lee Arc',
    difficulty: 1,
    description: 'Follow the long outside bend. Both fronts turn with the current; the lee of a heavy hull is a place to breathe.',
    sectorIds: ['sector_vesta_forge', 'sector_pallas_drift'],
    durationS: 176,
    forecastS: 10,
    fadeS: 24,
    route: [{ x: 0, z: 0 }, { x: 260, z: 280 }, { x: 650, z: 300 }, { x: 960, z: 80 }],
    eyeRadius: 92,
    cycleS: 34,
    openS: 12,
    warningS: 6,
    gapHalfAngle: 0.52,
    narrowGapHalfAngle: 0.19,
    gapDrift: 0.011,
    gapShear: 0.66,
    flowSpeed: 66,
    drag: 1.18,
    fronts: [
      { radius: 152, halfWidth: 24, advection: 9, periodS: 34, phase: 0, rotation: 0.049, direction: 1 },
      { radius: 282, halfWidth: 31, advection: 14, periodS: 34, phase: 1.2, rotation: 0.037, direction: 1 },
    ],
    pockets: [
      { id: 'lee', radialFraction: 0.43, bearing: -0.7, opensAtS: 10, closesAtS: 63, valueTier: 1 },
      { id: 'shoulder', radialFraction: 0.53, bearing: 1.65, opensAtS: 54, closesAtS: 113, valueTier: 2 },
      { id: 'tail', radialFraction: 0.58, bearing: -1.5, opensAtS: 104, closesAtS: 152, valueTier: 3 },
    ],
    tells: ['Double notches mark the common opening.', 'Follow the one-chevron current.', 'A long solid wake marks heavy cover.'],
  },
  {
    id: 'cross_shear',
    name: 'The Cross Shear',
    difficulty: 2,
    description: 'Opposing fronts comb an S-shaped course. Change lanes through the forecast opening; a tethered anchor absorbs the reversal.',
    sectorIds: ['sector_vesta_forge', 'sector_pallas_drift', 'sector_veil_nebula'],
    durationS: 196,
    forecastS: 12,
    fadeS: 26,
    route: [{ x: 0, z: 0 }, { x: 320, z: -430 }, { x: 600, z: 480 }, { x: 1040, z: 40 }],
    eyeRadius: 88,
    cycleS: 40,
    openS: 13,
    warningS: 7,
    gapHalfAngle: 0.56,
    narrowGapHalfAngle: 0.17,
    gapDrift: -0.008,
    gapShear: 0.96,
    flowSpeed: 76,
    drag: 1.32,
    fronts: [
      { radius: 150, halfWidth: 23, advection: 11, periodS: 40, phase: 0.4, rotation: 0.061, direction: 1 },
      { radius: 290, halfWidth: 32, advection: 18, periodS: 40, phase: 2.1, rotation: -0.047, direction: -1 },
    ],
    pockets: [
      { id: 'crossing', radialFraction: 0.42, bearing: 0.85, opensAtS: 12, closesAtS: 71, valueTier: 1 },
      { id: 'split', radialFraction: 0.56, bearing: -1.4, opensAtS: 64, closesAtS: 129, valueTier: 2 },
      { id: 'seam', radialFraction: 0.54, bearing: 2.1, opensAtS: 122, closesAtS: 170, valueTier: 3 },
    ],
    tells: ['Opposing chevrons mean opposing flow.', 'The crossed tick opens before the shear changes.', 'Pin a heavy anchor before crossing the outer front.'],
  },
  {
    id: 'return_hook',
    name: 'The Return Hook',
    difficulty: 3,
    description: 'A hooked eye returns across its own lee. The outer current runs faster; ride its edge for the last pocket or take the wide escape.',
    sectorIds: ['sector_veil_nebula', 'sector_vesta_forge'],
    durationS: 214,
    forecastS: 14,
    fadeS: 30,
    route: [{ x: 0, z: 0 }, { x: 560, z: -220 }, { x: 720, z: 430 }, { x: 180, z: 690 }],
    eyeRadius: 100,
    cycleS: 44,
    openS: 14,
    warningS: 8,
    gapHalfAngle: 0.61,
    narrowGapHalfAngle: 0.2,
    gapDrift: 0.013,
    gapShear: 1.13,
    flowSpeed: 84,
    drag: 1.4,
    fronts: [
      { radius: 168, halfWidth: 25, advection: 12, periodS: 44, phase: 0.7, rotation: -0.043, direction: -1 },
      { radius: 310, halfWidth: 32, advection: 19, periodS: 44, phase: 2.4, rotation: -0.064, direction: -1 },
    ],
    pockets: [
      { id: 'hook', radialFraction: 0.42, bearing: -0.85, opensAtS: 14, closesAtS: 80, valueTier: 1 },
      { id: 'crest', radialFraction: 0.57, bearing: 1.4, opensAtS: 71, closesAtS: 143, valueTier: 2 },
      { id: 'glass', radialFraction: 0.58, bearing: -2.0, opensAtS: 136, closesAtS: 184, valueTier: 3 },
    ],
    tells: ['Three chevrons mark the fast outer stream.', 'The hook turns before the forecast spine.', 'The final double opening remains open through dissipation.'],
  },
]);

export const STORM_PATTERN_BY_ID = freeze(Object.fromEntries(STORM_PATTERNS.map(pattern => [pattern.id, pattern])));
export function stormPattern(id) { return STORM_PATTERN_BY_ID[id] || null; }
