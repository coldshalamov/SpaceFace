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
    // No procedural macro overlay. Sector identity comes from deterministic star associations and
    // localized landmarks until an authored volumetric/deep-sky source replaces the rejected cards.
    ribbons: [],
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
    // Deliberately clear: a dotted waveform is not a tidal field. Keep the authored stellar density
    // and planet composition; future debris depth belongs to a real volumetric/mesh asset.
    ribbons: [],
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
    // No graph-like procedural wires. The wormhole, sparse cold star field, and local flare
    // associations carry anomaly identity until authored electromagnetic sky art exists.
    ribbons: [],
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
