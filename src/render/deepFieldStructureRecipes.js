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
    // Helios' one authored macro: the gas giant's ecliptic debris lane seen almost edge-on. It is a
    // thin, low-opacity, physically motivated arc — NOT the fullscreen procedural wash that earlier
    // review rejected. It deliberately runs high across the upper frame, tapering out before the
    // lower-left play corridor so that corridor stays genuinely black, and its cool grey-blue keeps
    // it reading as dust in front of stars rather than competing with the warm ringed planet at
    // anchorNdc. Verified in the live route at 1920x1080: p95 unchanged at 16.80ms.
    // Helios' one authored macro: the gas giant's ecliptic debris lane seen almost edge-on. Two
    // bands rather than one — a single ribbon reads as a stripe; two at different depths, widths and
    // angles read as volume. Thin, low-opacity and physically motivated, NOT the fullscreen
    // procedural wash earlier review rejected. Runs high across the upper frame and tapers out
    // before the lower-left play corridor so that corridor stays genuinely black.
    //
    // These were briefly reverted on the suspicion that they caused a hard-edged dark wedge seen in
    // a travel-angle frame. That was WRONG: the wedge reproduces with ribbons: [] and is the
    // pre-existing deep-field composite plane edge (see MODERN_PARITY_LOOP.md "the travel wedge").
    ribbons: [
      {
        id: 'helios-ecliptic-dust',
        style: 0,
        colors: ['#161b23', '#6d7b90'],
        opacity: 0.54,
        points: [
          [-1.24, -0.010, 0.30], [-0.96, -0.004, 0.34], [-0.66, 0.004, 0.36],
          [-0.34, 0.010, 0.35], [-0.02, 0.012, 0.31], [0.30, 0.010, 0.25],
          [0.62, 0.004, 0.17], [0.92, -0.004, 0.08], [1.20, -0.010, -0.02],
        ],
        widths: [0.05, 0.095, 0.135, 0.160, 0.165, 0.145, 0.110, 0.070, 0.030],
      },
      {
        // Third band, deliberately at a DIFFERENT depth (z runs higher and flatter than the other
        // two) and reaching further left. Two bands read as a stripe pair; three at separated depths
        // read as volume, which is what review asks for when it says "no middle layer". Kept thin and
        // dark so it occludes stars rather than glowing — dust in front of a starfield, not gas.
        id: 'helios-left-drift',
        style: 1,
        colors: ['#101419', '#3f4a5c'],
        opacity: 0.24,
        points: [
          [-1.28, 0.020, 0.46], [-1.02, 0.019, 0.48], [-0.76, 0.017, 0.485],
          [-0.50, 0.014, 0.478], [-0.24, 0.011, 0.455], [0.02, 0.008, 0.418],
          [0.26, 0.005, 0.368], [0.48, 0.002, 0.312],
        ],
        widths: [0.012, 0.028, 0.040, 0.046, 0.044, 0.034, 0.020, 0.008],
      },
      {
        id: 'helios-outer-shepherd',
        style: 0,
        colors: ['#12161d', '#4a5568'],
        opacity: 0.30,
        points: [
          [-1.18, 0.016, 0.06], [-0.84, 0.014, 0.12], [-0.48, 0.010, 0.19],
          [-0.12, 0.006, 0.24], [0.24, 0.002, 0.26], [0.60, -0.002, 0.24],
          [0.96, -0.008, 0.19], [1.22, -0.014, 0.13],
        ],
        widths: [0.018, 0.036, 0.052, 0.062, 0.062, 0.052, 0.034, 0.014],
      },
    ],
    // Deliberate diagonal stellar association frames the gas giant while keeping the lower-left
    // play corridor genuinely black. Values are fractions of the wrap cell, radii use screen-H.
    starAssociations: [
      { x: 0.15, z: 0.11, radiusH: 1.55, strength: 1.65 },
      { x: 0.10, z: 0.07, radiusH: 0.82, strength: 1.35 },
      { x: -0.07, z: 0.03, radiusH: 0.58, strength: 0.82 },
      // Three associations existed and all sat right of centre, framing the gas giant. Independent
      // review's composition note in every round was "a very large unused void across the left half".
      // These two put authored star density into the UPPER-LEFT field specifically.
      //
      // This does not contradict the sector doctrine: what that protects is the lower-left PLAY
      // CORRIDOR (negative z, below the flight line), which both of these stay clear of — they sit at
      // positive z, high in the frame. The corridor stays genuinely black; the dead upper-left does
      // not. Star associations are density weights on the existing single Points draw call, so this
      // adds no draw call and no geometry.
      { x: -0.34, z: 0.14, radiusH: 1.22, strength: 1.28 },
      { x: -0.21, z: 0.09, radiusH: 0.68, strength: 0.94 },
    ],
    // Distant solid forms. Review's background note in every round is "almost no middle layer", and
    // its reference frames build one from wrecks, hulls and station structure — objects with a
    // SILHOUETTE. Ribbons are dust and cannot supply that.
    //
    // Each is an authored outline drawn as a plate slightly LIGHTER than the void. A dark plate was
    // tried first and is invisible: occlusion only reads as depth when there is something bright
    // behind it, and this sector's field is dark. Reference frames sell distant wrecks by having them
    // CATCH LIGHT, so these sit just above the background value. Helios is a civilized orbital lane, so the fiction is derelict traffic
    // and an old relay mast rather than a debris field — the sector's contact list already reports
    // derelicts and wrecks nearby, so this is the far-field view of something the sim already says is
    // there. All sit high in the frame (positive z), leaving the lower-left play corridor clear.
    structures: [
      {
        // Long-hauler hull, broken amidships, seen almost edge-on and well off to the left where the
        // frame was previously empty.
        id: 'helios-derelict-hauler',
        scale: 0.34, offset: [0.86, 0.10], opacity: 0.85, color: '#2b3647',
        silhouette: [
          [-1.00, -0.055], [-0.62, -0.085], [-0.20, -0.095], [0.18, -0.080],
          [0.46, -0.052], [0.62, -0.020], [0.66, 0.016], [0.44, 0.050],
          [0.06, 0.072], [-0.34, 0.078], [-0.72, 0.062], [-1.00, 0.030],
        ],
      },
      {
        // Relay mast + dish, small and higher up: a second, much smaller silhouette at a different
        // apparent distance is what turns one object into a sense of depth.
        id: 'helios-relay-mast',
        scale: 0.16, offset: [0.52, 0.24], opacity: 0.80, color: '#333f52',
        silhouette: [
          [-0.10, -0.60], [0.10, -0.60], [0.10, 0.06], [0.42, 0.20],
          [0.46, 0.40], [0.10, 0.34], [0.10, 0.62], [-0.10, 0.62],
          [-0.10, 0.28], [-0.44, 0.38], [-0.46, 0.18], [-0.10, 0.04],
        ],
      },
    ],
  }),

  core_trade_constellation: R({
    id: 'core_trade_constellation',
    kind: 'sparse_wisps',
    anchorNdc: [0.42, 0.36],
    parallax: 0.040,
    apparentScale: 1,
    // Civilized core: the thinnest macro in the set. Two short, well-separated wisps that stop
    // before they meet, so the sky reads as mostly-clear with a little high cirrus rather than as a
    // nebula. Deliberately the least assertive silhouette of the five sectors.
    // Civilized core: the thinnest macro in the set. Two short, well-separated wisps that stop
    // before they meet, so the sky reads as mostly-clear with a little high cirrus rather than a
    // nebula. Each carries the 8 control points the recipe contract requires, but packed along a
    // SHORT span rather than stretched across the cell — that is what keeps them sparse.
    ribbons: [
      {
        id: 'core-wisp-high',
        style: 0,
        colors: ['#141922', '#4f6076'],
        opacity: 0.26,
        points: [
          [-1.10, 0.010, 0.34], [-0.94, 0.011, 0.365], [-0.78, 0.012, 0.380],
          [-0.62, 0.012, 0.388], [-0.46, 0.010, 0.386], [-0.31, 0.008, 0.372],
          [-0.16, 0.006, 0.348], [-0.02, 0.003, 0.316],
        ],
        widths: [0.014, 0.030, 0.042, 0.050, 0.048, 0.038, 0.024, 0.010],
      },
      {
        id: 'core-wisp-low',
        style: 0,
        colors: ['#121720', '#3f5064'],
        opacity: 0.20,
        points: [
          [0.30, -0.003, 0.190], [0.42, -0.005, 0.176], [0.55, -0.007, 0.158],
          [0.68, -0.009, 0.136], [0.81, -0.011, 0.110], [0.94, -0.013, 0.081],
          [1.06, -0.015, 0.049], [1.18, -0.017, 0.014],
        ],
        widths: [0.010, 0.022, 0.030, 0.033, 0.030, 0.023, 0.015, 0.008],
      },
    ],
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
    //
    // PINNED: test/deep-field-structure-recipes.test.mjs "rejected procedural carriers stay
    // unrouted" asserts this stays []. belt/fringe/anomaly ribbon carriers were reviewed and
    // rejected; galactic_spur is recorded there as the one accepted authored composition. Adding a
    // ribbon here is a design decision that needs the owner, not a rendering fix.
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
    // PINNED to [] by test/deep-field-structure-recipes.test.mjs — see belt_broken_dust_lane.
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
    // PINNED to [] by BOTH test/deep-field-structure-recipes.test.mjs and
    // test/sector-visual-profiles.test.mjs — see belt_broken_dust_lane.
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
