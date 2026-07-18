// Authored deep-field compositions for the live space background.
//
// These are deliberately small, inspectable source-art recipes rather than generated mood noise.
// The runtime may add high-frequency grain inside each ribbon, but the silhouette, gaps, density
// knots, star associations, color hierarchy, and screen placement are all authored here.

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const R = (recipe) => deepFreeze(recipe);

export const DEEP_FIELD_STRUCTURE_RECIPES = deepFreeze({
  helios_orbital_void: R({
    id: 'helios_orbital_void',
    kind: 'void',
    anchorNdc: [0.58, 0.32],
    parallax: 0.036,
    apparentScale: 1,
    ribbons: [],
    // Deliberate diagonal stellar association frames the gas giant while keeping the lower-left
    // play corridor genuinely black. Values are fractions of the wrap cell, radii use screen-H.
    starAssociations: [
      { x: 0.15, z: 0.11, radiusH: 1.55, strength: 1.65 },
      { x: 0.10, z: 0.07, radiusH: 0.82, strength: 1.35 },
      { x: -0.07, z: 0.03, radiusH: 0.58, strength: 0.82 },
    ],
  }),

  core_trade_constellation: R({
    id: 'core_trade_constellation',
    kind: 'sparse_wisps',
    anchorNdc: [0.42, 0.36],
    parallax: 0.040,
    apparentScale: 1,
    ribbons: [],
    starAssociations: [
      { x: -0.12, z: 0.08, radiusH: 0.78, strength: 1.22 },
      { x: 0.03, z: 0.04, radiusH: 1.18, strength: 1.38 },
      { x: 0.16, z: -0.02, radiusH: 0.62, strength: 1.08 },
    ],
  }),

  belt_broken_dust_lane: R({
    id: 'belt_broken_dust_lane',
    kind: 'dust_lanes',
    anchorNdc: [0.30, 0.34],
    parallax: 0.043,
    apparentScale: 1.12,
    ribbons: [
      {
        id: 'belt-stellar-envelope',
        style: 0,
        colors: ['#241b14', '#71513a'],
        opacity: 0.56,
        points: [
          [-1.28, -0.012, -0.13], [-1.04, -0.002, 0.03], [-0.79, 0.010, 0.20],
          [-0.53, 0.018, 0.27], [-0.28, 0.014, 0.21], [-0.03, 0.002, 0.06],
          [0.22, -0.010, -0.10], [0.48, -0.014, -0.15], [0.72, -0.006, -0.07],
          [0.94, 0.006, 0.09], [1.15, 0.012, 0.25],
        ],
        widths: [0.16, 0.24, 0.32, 0.37, 0.34, 0.28, 0.23, 0.20, 0.15, 0.09, 0.025],
      },
      {
        id: 'belt-occluding-lane',
        style: 2,
        colors: ['#030303', '#241b15'],
        opacity: 0.82,
        points: [
          [-1.22, -0.006, -0.19], [-1.02, 0.002, -0.03], [-0.80, 0.010, 0.13],
          [-0.57, 0.014, 0.20], [-0.34, 0.010, 0.16], [-0.12, 0.001, 0.03],
          [0.10, -0.008, -0.12], [0.34, -0.012, -0.19], [0.58, -0.008, -0.14],
          [0.82, 0.003, -0.02], [1.05, 0.010, 0.17], [1.26, 0.006, 0.28],
        ],
        widths: [0.13, 0.19, 0.25, 0.30, 0.28, 0.22, 0.17, 0.13, 0.12, 0.10, 0.08, 0.04],
      },
      {
        id: 'belt-mineral-rim',
        style: 1,
        colors: ['#2c211a', '#765033'],
        opacity: 0.32,
        points: [
          [-1.15, 0.012, 0.12], [-0.91, 0.018, 0.25], [-0.66, 0.024, 0.31],
          [-0.42, 0.018, 0.25], [-0.18, 0.006, 0.10], [0.04, -0.004, -0.03],
          [0.27, -0.008, -0.10], [0.52, -0.004, -0.07], [0.75, 0.006, 0.04],
          [0.96, 0.014, 0.18],
        ],
        widths: [0.025, 0.048, 0.062, 0.052, 0.032, 0.020, 0.038, 0.050, 0.032, 0.012],
      },
    ],
    starAssociations: [
      { x: -0.14, z: 0.09, radiusH: 0.72, strength: 1.48 },
      { x: 0.05, z: -0.04, radiusH: 0.52, strength: 0.92 },
      { x: 0.16, z: 0.05, radiusH: 0.44, strength: 1.12 },
    ],
  }),

  fringe_tidal_filament: R({
    id: 'fringe_tidal_filament',
    kind: 'ion_filaments',
    anchorNdc: [0.30, 0.40],
    parallax: 0.048,
    apparentScale: 1.08,
    ribbons: [
      {
        id: 'fringe-sheared-shell',
        style: 0,
        colors: ['#261817', '#704334'],
        opacity: 0.58,
        points: [
          [-1.16, -0.018, -0.26], [-0.98, -0.002, -0.05], [-0.77, 0.018, 0.19],
          [-0.53, 0.036, 0.36], [-0.28, 0.043, 0.42], [-0.04, 0.034, 0.34],
          [0.19, 0.018, 0.18], [0.40, 0.000, -0.01], [0.61, -0.014, -0.15],
          [0.83, -0.018, -0.18], [1.04, -0.009, -0.08], [1.22, 0.004, 0.10],
        ],
        widths: [0.18, 0.29, 0.37, 0.43, 0.40, 0.34, 0.27, 0.20, 0.15, 0.13, 0.09, 0.04],
      },
      {
        id: 'fringe-fractured-spur',
        style: 1,
        colors: ['#2c1b18', '#7c4e38'],
        opacity: 0.30,
        points: [
          [-0.50, 0.012, 0.16], [-0.31, 0.023, 0.09], [-0.10, 0.031, -0.03],
          [0.12, 0.026, -0.19], [0.33, 0.012, -0.30], [0.53, -0.004, -0.34],
          [0.72, -0.012, -0.28], [0.88, -0.006, -0.15], [1.01, 0.004, -0.02],
        ],
        widths: [0.055, 0.085, 0.042, 0.072, 0.031, 0.060, 0.025, 0.040, 0.010],
      },
    ],
    starAssociations: [
      { x: 0.14, z: 0.10, radiusH: 1.28, strength: 1.95 },
      { x: 0.04, z: 0.03, radiusH: 0.72, strength: 1.62 },
      { x: -0.08, z: -0.02, radiusH: 0.52, strength: 1.08 },
      { x: 0.20, z: -0.05, radiusH: 0.42, strength: 1.28 },
    ],
  }),

  anomaly_electromagnetic_scar: R({
    id: 'anomaly_electromagnetic_scar',
    kind: 'ion_filaments',
    anchorNdc: [-0.28, 0.38],
    parallax: 0.052,
    apparentScale: 0.94,
    ribbons: [
      {
        id: 'anomaly-sheared-envelope',
        style: 0,
        colors: ['#16121b', '#45324f'],
        opacity: 0.50,
        points: [
          [-1.05, -0.014, -0.24], [-0.82, 0.000, -0.08], [-0.62, 0.020, 0.18],
          [-0.43, 0.035, 0.39], [-0.18, 0.038, 0.33], [0.05, 0.022, 0.10],
          [0.25, 0.000, -0.18], [0.47, -0.014, -0.35], [0.72, -0.006, -0.21],
        ],
        widths: [0.09, 0.15, 0.22, 0.27, 0.25, 0.19, 0.14, 0.09, 0.025],
      },
      {
        id: 'anomaly-bifurcated-scar-a',
        style: 1,
        colors: ['#2a1c31', '#6c4778'],
        opacity: 0.27,
        points: [
          [-0.94, -0.006, -0.16], [-0.74, 0.010, 0.02], [-0.55, 0.030, 0.29],
          [-0.35, 0.040, 0.47], [-0.13, 0.033, 0.34], [0.06, 0.014, 0.08],
          [0.23, -0.004, -0.20], [0.43, -0.014, -0.39], [0.66, -0.004, -0.25],
        ],
        widths: [0.020, 0.046, 0.075, 0.050, 0.082, 0.035, 0.060, 0.028, 0.010],
      },
      {
        id: 'anomaly-bifurcated-scar-b',
        style: 1,
        colors: ['#17292b', '#416c6a'],
        opacity: 0.23,
        points: [
          [-0.58, 0.018, 0.20], [-0.43, 0.028, 0.08], [-0.26, 0.032, -0.06],
          [-0.08, 0.026, -0.15], [0.10, 0.012, -0.12], [0.26, -0.002, 0.01],
          [0.38, -0.008, 0.20], [0.46, 0.000, 0.36],
        ],
        widths: [0.018, 0.040, 0.058, 0.034, 0.062, 0.030, 0.038, 0.008],
      },
    ],
    starAssociations: [
      { x: -0.11, z: 0.08, radiusH: 0.68, strength: 1.72 },
      { x: 0.09, z: -0.04, radiusH: 0.46, strength: 1.26 },
    ],
  }),

  galactic_spur: R({
    id: 'galactic_spur',
    kind: 'galactic_band',
    anchorNdc: [0.12, 0.50],
    parallax: 0.034,
    apparentScale: 1.22,
    ribbons: [
      {
        id: 'galactic-spur-main',
        style: 0,
        colors: ['#2b2725', '#8b7765'],
        opacity: 0.62,
        points: [
          [-1.30, -0.012, -0.16], [-1.02, 0.000, -0.04], [-0.73, 0.014, 0.10],
          [-0.43, 0.025, 0.21], [-0.12, 0.027, 0.24], [0.20, 0.018, 0.17],
          [0.52, 0.004, 0.04], [0.82, -0.008, -0.10], [1.12, -0.012, -0.19],
        ],
        widths: [0.08, 0.13, 0.18, 0.22, 0.23, 0.20, 0.16, 0.11, 0.05],
      },
    ],
    starAssociations: [
      { x: -0.12, z: 0.06, radiusH: 1.20, strength: 1.55 },
      { x: 0.08, z: 0.02, radiusH: 0.85, strength: 1.35 },
    ],
  }),
});

const DEFAULT_RECIPE_BY_KIND = Object.freeze({
  void: 'helios_orbital_void',
  sparse_wisps: 'core_trade_constellation',
  dust_lanes: 'belt_broken_dust_lane',
  ion_filaments: 'fringe_tidal_filament',
  galactic_band: 'galactic_spur',
});

export function resolveDeepFieldStructureRecipe(structure) {
  const requested = structure && structure.recipeId;
  if (requested && DEEP_FIELD_STRUCTURE_RECIPES[requested]) {
    return DEEP_FIELD_STRUCTURE_RECIPES[requested];
  }
  const kind = structure && structure.structureKind || 'sparse_wisps';
  return DEEP_FIELD_STRUCTURE_RECIPES[DEFAULT_RECIPE_BY_KIND[kind]]
    || DEEP_FIELD_STRUCTURE_RECIPES.core_trade_constellation;
}

export function sampleAuthoredWidth(widths, t) {
  if (!Array.isArray(widths) || widths.length === 0) return 0;
  if (widths.length === 1) return Math.max(0, Number(widths[0]) || 0);
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const scaled = u * (widths.length - 1);
  const index = Math.min(widths.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = Math.max(0, Number(widths[index]) || 0);
  const b = Math.max(0, Number(widths[index + 1]) || 0);
  return a + (b - a) * local;
}
