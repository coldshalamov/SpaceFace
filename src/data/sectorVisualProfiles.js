import { SECTOR_PALETTE_CLASSES } from './sectors.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function freezeProfile(profile) { return deepFreeze(profile); }

const DEFAULT_BACKGROUND_COMPOSITION = deepFreeze({
  planetChance: 0.35,
  wormholeChance: 0.18,
  ringChance: 0.45,
  cometInterval: [25, 70],
  signatureHero: null,
  planetTypes: null, // null = the classic gas/rocky/ice roll; else the allowed procedural types
});

// Structure profile independently controls density/composition — not a tint swap.
const DEFAULT_STRUCTURE = deepFreeze({
  recipeId: 'core_trade_constellation',
  starDensity: 1.0,
  clusterCount: 6,
  clusterStrength: 1.0,
  voidFloor: 0.10,
  flareDensity: 1.0,
  structureKind: 'sparse_wisps',
  maxCoverage: 0.18,
  regionLo: 0.58,
  regionHi: 0.78,
  warp: 0.28,
  dustAmt: 0.55,
  l1Alpha: 0.42,
  l2Alpha: 0.08,
  bandCenter: 0.42,
  bandWidth: 0.16,
  bandAngle: 0.35,
  landmarkBias: 'planet',
});

// Palette-family profiles. Way-of-life sectors layer their own rig on these (PER_SECTOR_RIGS).
const SECTOR_FAMILY_PROFILES = Object.freeze({
  helios_core: freezeProfile({
    id: 'helios_core',
    skyPalette: 'AZURE',
    // Broad sunlight and cool planet bounce reveal the painted fleet without filling its
    // mechanical recesses. The rim describes the silhouette against the dark stellar field.
    lighting: { ambient: 0.16, key: 3.4, rim: 1.72, fill: 0.55 },
    background: {
      // The original stellar island and ringed planet remain the landmarks. The painted
      // estuary is distant atmosphere around them, held below the lit machinery — dimmed and
      // desaturated ~a third so the sky sits behind the opening frame instead of inside it.
      paintedSky: { plate: 'helios-amber-estuary', strength: 0.14, parallax: 0.003, saturation: 1.0 },
      intensity: 0.55,
      nebulaOpacity: 0.0,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'helios_orbital_void',
        structureKind: 'void',
        // Stellar associations retain fine scale over the broad painted shapes.
        starDensity: 1.12,
        clusterCount: 8,
        clusterStrength: 1.05,
        voidFloor: 0.12,
        flareDensity: 1.25,
        maxCoverage: 0.04,
        regionLo: 0.70,
        regionHi: 0.92,
        warp: 0.18,
        dustAmt: 0.08,
        l1Alpha: 0.0,
        l2Alpha: 0.0,
        bandAngle: 0.42,
        landmarkBias: 'planet',
      },
      composition: {
        // The signature ringed giant is the ONLY sky body Helios shows — no procedural planets
        // dilute it, and no second body can drift into the trade-hub opening frame.
        planetChance: 0.0,
        wormholeChance: 0.0,
        ringChance: 0.0,
        cometInterval: [32, 68],
        // Screen-safe upper-right limb; placement is projection-aware (not XZ offset guess).
        signatureHero: {
          // frac 0.26 -> 0.32 (the resolver clamps at 0.34) so the landmark has real presence.
          // Independent review asked in every round for the planet to read larger and anchor the
          // composition. It also asked for the planet to cross BEHIND the flight path — that part is
          // deliberately NOT done: test/sector-visual-profiles.test.mjs pins screenNdc[0] >= 0.5.
          kind: 'planet', type: 'gas', ring: true, frac: 0.32,
          offset: [0.18, 0.16],
          screenNdc: [0.58, 0.32],
          lightAngle: -0.72, ringTilt: 0.16,
        },
      },
    },
    post: { exposure: 1.02, bloomStrengthScale: 1.0, bloomThresholdBias: 0.0 },
  }),
  core: freezeProfile({
    id: 'core',
    skyPalette: 'AZURE',
    lighting: { ambient: 0.15, key: 2.8, rim: 1.40, fill: 0.42 },
    background: {
      intensity: 0.40,
      // Authored star associations/landmarks carry the composition; no procedural full-field veil.
      nebulaOpacity: 0.0,
      // The Lantern shelf: an offline-baked plate with one dominant lit mass upper-right, a far
      // companion upper-left and an explicit protected void over the lower-left play corridor.
      // It is authored art, not a wash — the bake refuses to ship over its composition budget.
      paintedSky: { plate: 'core-lantern-shelf', strength: 0.10, parallax: 0.0032, saturation: 0.70 },
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'core_trade_constellation',
        structureKind: 'sparse_wisps',
        starDensity: 0.95,
        clusterStrength: 0.8,
        maxCoverage: 0.10,
        regionLo: 0.64,
        regionHi: 0.84,
        warp: 0.22,
        dustAmt: 0.22,
        l1Alpha: 0.19,
        l2Alpha: 0.04,
      },
      composition: {
        // Rings are Helios's motif — in generic core space a ringed roll is rare.
        planetChance: 0.30, wormholeChance: 0.06, ringChance: 0.18,
        cometInterval: [30, 72], signatureHero: null,
      },
    },
    post: { exposure: 0.96, bloomStrengthScale: 1.04, bloomThresholdBias: -0.02 },
  }),
  belt: freezeProfile({
    id: 'belt',
    skyPalette: 'EMBER',
    lighting: { ambient: 0.15, key: 2.75, rim: 1.35, fill: 0.40 },
    background: {
      intensity: 0.38,
      // The broken dust lane is explicit geometry with authored silhouette and occlusion.
      nebulaOpacity: 0.0,
      // The ochre shoal answers this region's own recipe: one warm mass broken into pieces by dark
      // lanes, sitting clear of the amber stellar river the star formation already draws overhead.
      paintedSky: { plate: 'belt-ochre-shoal', strength: 0.10, parallax: 0.0034, saturation: 0.68 },
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'belt_broken_dust_lane',
        structureKind: 'dust_lanes',
        starDensity: 1.05,
        clusterCount: 7,
        clusterStrength: 0.9,
        voidFloor: 0.09,
        maxCoverage: 0.16,
        regionLo: 0.55,
        regionHi: 0.74,
        warp: 0.34,
        dustAmt: 0.6,
        l1Alpha: 0.32,
        l2Alpha: 0.06,
        landmarkBias: 'flare',
      },
      composition: {
        // A debris belt carries dull planetoids, never the clip-art ringed giant.
        planetChance: 0.22, wormholeChance: 0.045, ringChance: 0.0,
        planetTypes: ['rocky'],
        cometInterval: [22, 58], signatureHero: null,
      },
    },
    post: { exposure: 0.95, bloomStrengthScale: 1.10, bloomThresholdBias: -0.06 },
  }),
  fringe: freezeProfile({
    id: 'fringe',
    skyPalette: 'CRIMSON',
    // Slightly stronger key/rim/fill so station + long-ship keep two readable planes.
    lighting: { ambient: 0.13, key: 3.10, rim: 1.50, fill: 0.38 },
    background: {
      intensity: 0.50,
      // Full-field L1/L2 contribution forced off — macro geometry + stars only.
      nebulaOpacity: 0.0,
      // Deliberately NO painted plate. The fringe's identity is the tidal filament and the blue
      // flocculent spiral against empty sky; giving every region a plate would make the feature a
      // uniform veil, which is the thing it exists to avoid. A region with no plate loads nothing.
      paintedSky: null,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'fringe_tidal_filament',
        structureKind: 'ion_filaments',
        starDensity: 1.18,
        clusterCount: 9,
        clusterStrength: 1.45,
        voidFloor: 0.08,
        flareDensity: 0.9,
        maxCoverage: 0.12,
        regionLo: 0.70,
        regionHi: 0.95,
        warp: 0.20,
        dustAmt: 0.0,
        l1Alpha: 0.0,
        l2Alpha: 0.0,
        bandCenter: 0.40,
        bandWidth: 0.10,
        bandAngle: -0.72,
        landmarkBias: 'flare',
      },
      composition: {
        planetChance: 0.10, wormholeChance: 0.0, ringChance: 0.0,
        planetTypes: ['rocky'],
        cometInterval: [18, 52],
        // Rocky body left-upper; macro ribbon sits elsewhere (upper-right safe NDC).
        signatureHero: {
          kind: 'planet', type: 'rocky', ring: false, frac: 0.13,
          offset: [-0.28, 0.16],
          screenNdc: [-0.42, 0.28],
          lightAngle: 0.95, ringTilt: 0,
        },
      },
    },
    post: { exposure: 0.94, bloomStrengthScale: 1.08, bloomThresholdBias: -0.04 },
  }),
  anomaly: freezeProfile({
    id: 'anomaly',
    skyPalette: 'ION',
    lighting: { ambient: 0.15, key: 2.40, rim: 1.40, fill: 0.36 },
    background: {
      intensity: 0.42,
      // Local electromagnetic scar + wormhole replace the former fullscreen violet wash.
      nebulaOpacity: 0.0,
      // Still not a wash: the cold halo is two shell arcs and one knot, with a second protected
      // void over the right half so the live wormhole owns that patch of sky uncontested.
      paintedSky: { plate: 'anomaly-cold-halo', strength: 0.09, parallax: 0.0030, saturation: 0.72 },
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'anomaly_electromagnetic_scar',
        structureKind: 'ion_filaments',
        starDensity: 0.7,
        clusterCount: 3,
        clusterStrength: 1.1,
        voidFloor: 0.04,
        maxCoverage: 0.22,
        regionLo: 0.50,
        regionHi: 0.70,
        warp: 0.48,
        dustAmt: 0.28,
        l1Alpha: 0.36,
        l2Alpha: 0.09,
        landmarkBias: 'wormhole',
      },
      composition: {
        // The scar's own bodies are cold: ice and rock, no gas giants, rings rare.
        planetChance: 0.18, wormholeChance: 0.42, ringChance: 0.30,
        planetTypes: ['ice', 'rocky'],
        cometInterval: [12, 38],
        signatureHero: {
          kind: 'planet', type: 'ice', ring: true, frac: 0.13,
          offset: [-0.18, 0.28], screenNdc: [-0.48, 0.22],
          lightAngle: -1.4, ringTilt: -0.4,
        },
      },
    },
    post: { exposure: 0.95, bloomStrengthScale: 1.16, bloomThresholdBias: -0.10 },
  }),
  // The sixth sky. Tethys is a junction, not a second Helios: one galactic spur, no hero planet,
  // no painted plate. Exactly this profile carries the galaxy.
  tethys: freezeProfile({
    id: 'tethys',
    galaxyPlate: true,
    skyPalette: 'AZURE',
    lighting: { ambient: 0.12, key: 2.55, rim: 1.30, fill: 0.35 },
    background: {
      intensity: 0.30,
      nebulaOpacity: 0.0,
      paintedSky: null,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'galactic_spur',
        structureKind: 'galactic_band',
        starDensity: 0.82,
        clusterCount: 4,
        clusterStrength: 0.85,
        voidFloor: 0.14,
        flareDensity: 0.55,
        maxCoverage: 0.16,
        regionLo: 0.46,
        regionHi: 0.62,
        warp: 0.16,
        dustAmt: 0.10,
        l1Alpha: 0.14,
        l2Alpha: 0.03,
        bandCenter: 0.52,
        bandWidth: 0.08,
        bandAngle: 0.18,
        landmarkBias: 'none',
      },
      composition: {
        planetChance: 0,
        wormholeChance: 0,
        ringChance: 0,
        cometInterval: [40, 90],
        signatureHero: null,
      },
    },
    post: { exposure: 0.93, bloomStrengthScale: 1.06, bloomThresholdBias: -0.04 },
  }),
});

// Way-of-life sectors get their own rig instead of sharing the palette-class fallback: the mood
// lives in the KEY colour (tinted near warm white, per COLOR_LIGHTING_STANDARD §2) plus a tuned
// fill bounce. `keyColor`/`fillColor`/`rimColor`/`ambientColor` override the palette hex for that
// one channel; the sky composition/post blocks stay inherited from the family profile until the
// sector earns a bespoke sky of its own.
const PER_SECTOR_RIGS = Object.freeze({
  // Vesta Forge runs hot: orange-white key and a warm floor bounce off the smelter glare. Its sky
  // body is a barren rock slagged low off the play side — no gas giants in a working forge belt.
  sector_vesta_forge: { base: 'belt', id: 'vesta_forge',
    lighting: { ambient: 0.14, key: 3.30, rim: 1.45, fill: 0.44, keyColor: 0xffc98f, fillColor: 0xd09a6a },
    composition: {
      planetChance: 0.10, ringChance: 0, planetTypes: ['rocky'],
      signatureHero: {
        kind: 'planet', type: 'rocky', ring: false, frac: 0.12,
        offset: [0.3, 0.2], screenNdc: [0.44, 0.30],
        lightAngle: -0.6, ringTilt: 0,
      },
    } },
  // Pallas Drift runs cold: blue-white key, minimal bounce — an ice body hangs over the drift.
  sector_pallas_drift: { base: 'fringe', id: 'pallas_drift',
    lighting: { ambient: 0.13, key: 2.90, rim: 1.55, fill: 0.35, keyColor: 0xd9e6ff, fillColor: 0x9fb4d8 },
    composition: {
      planetChance: 0.08, ringChance: 0, planetTypes: ['ice', 'rocky'],
      signatureHero: {
        kind: 'planet', type: 'ice', ring: false, frac: 0.12,
        offset: [-0.3, 0.2], screenNdc: [-0.46, 0.30],
        lightAngle: 0.7, ringTilt: 0,
      },
    } },
  // Sker Haven: sodium yard light over the throne works — amber key. The Throne itself is the
  // in-world landmark; the sky keeps only sparse rocks, no hero.
  sector_sker_haven: { base: 'fringe', id: 'sker_haven',
    lighting: { ambient: 0.14, key: 3.00, rim: 1.45, fill: 0.40, keyColor: 0xffb45e, fillColor: 0xc98d5c },
    composition: {
      planetChance: 0.08, ringChance: 0, planetTypes: ['rocky'], signatureHero: null,
    } },
  // Ceres belt: dusty neutral sun — desaturated warm-white key, rock-dust bounce. The dwarf
  // planet itself hangs dim upper-left, the only world in the wreck field's sky.
  sector_ceres_belt: { base: 'belt', id: 'ceres_belt',
    lighting: { ambient: 0.15, key: 2.75, rim: 1.35, fill: 0.40, keyColor: 0xf0e2c8, fillColor: 0xb8a48f },
    composition: {
      planetChance: 0, ringChance: 0,
      signatureHero: {
        kind: 'planet', type: 'rocky', ring: false, frac: 0.11,
        offset: [-0.28, 0.18], screenNdc: [-0.44, 0.28],
        lightAngle: 0.8, ringTilt: 0,
      },
    } },
});

const DERIVED_PROFILES = {};
for (const rig of Object.values(PER_SECTOR_RIGS)) {
  const base = SECTOR_FAMILY_PROFILES[rig.base];
  DERIVED_PROFILES[rig.id] = freezeProfile({
    ...base,
    id: rig.id,
    lighting: rig.lighting,
    // A sector may fork only the hero/composition grammar while sharing the family's baked sky
    // (structure, painted plate, intensity) — the shared sub-objects stay frozen references.
    background: rig.composition
      ? { ...base.background, composition: { ...base.background.composition, ...rig.composition } }
      : base.background,
  });
}

export const SECTOR_VISUAL_PROFILES = Object.freeze({
  ...SECTOR_FAMILY_PROFILES,
  ...DERIVED_PROFILES,
});

const PROFILE_BY_NEBULA_TINT = new Map([
  [SECTOR_PALETTE_CLASSES.core.nebulaTint, SECTOR_VISUAL_PROFILES.core],
  [SECTOR_PALETTE_CLASSES.belt.nebulaTint, SECTOR_VISUAL_PROFILES.belt],
  [SECTOR_PALETTE_CLASSES.fringe.nebulaTint, SECTOR_VISUAL_PROFILES.fringe],
  [SECTOR_PALETTE_CLASSES.anomaly.nebulaTint, SECTOR_VISUAL_PROFILES.anomaly],
]);

const PROFILE_BY_ID = new Map([
  ['sector_helios_prime', SECTOR_VISUAL_PROFILES.helios_core],
  ['sector_tethys_junction', SECTOR_VISUAL_PROFILES.tethys],
  ['sector_frontier_east_ridge', SECTOR_VISUAL_PROFILES.fringe],
  ['sector_ceres_belt', SECTOR_VISUAL_PROFILES.ceres_belt],
  ['sector_vesta_forge', SECTOR_VISUAL_PROFILES.vesta_forge],
  ['sector_pallas_drift', SECTOR_VISUAL_PROFILES.pallas_drift],
  ['sector_sker_haven', SECTOR_VISUAL_PROFILES.sker_haven],
  ['sector_anomaly_well', SECTOR_VISUAL_PROFILES.anomaly],
]);

export function resolveSectorVisualProfile(sector) {
  if (sector && sector.id && PROFILE_BY_ID.has(sector.id)) return PROFILE_BY_ID.get(sector.id);
  if (sector && sector.id === 'sector_helios_prime') return SECTOR_VISUAL_PROFILES.helios_core;
  const tint = sector && sector.palette && sector.palette.nebulaTint;
  return PROFILE_BY_NEBULA_TINT.get(tint) || SECTOR_VISUAL_PROFILES.core;
}

function finiteClamped(value, fallback, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function resolveBackgroundComposition(profile) {
  const source = profile && profile.background && profile.background.composition || {};
  const interval = Array.isArray(source.cometInterval) ? source.cometInterval : DEFAULT_BACKGROUND_COMPOSITION.cometInterval;
  const a = finiteClamped(interval[0], DEFAULT_BACKGROUND_COMPOSITION.cometInterval[0], 5, 180);
  const b = finiteClamped(interval[1], DEFAULT_BACKGROUND_COMPOSITION.cometInterval[1], 5, 180);
  const signature = source.signatureHero && source.signatureHero.kind === 'planet'
    ? deepFreeze({
      kind: 'planet',
      type: ['gas', 'rocky', 'ice'].includes(source.signatureHero.type) ? source.signatureHero.type : 'gas',
      ring: !!source.signatureHero.ring,
      frac: finiteClamped(source.signatureHero.frac, 0.16, 0.08, 0.34),
      offset: deepFreeze([
        finiteClamped(source.signatureHero.offset && source.signatureHero.offset[0], -0.25, -0.42, 0.42),
        finiteClamped(source.signatureHero.offset && source.signatureHero.offset[1], 0.2, -0.42, 0.42),
      ]),
      // Preferred composition: NDC on the matched preview camera (projection-aware placement).
      screenNdc: Array.isArray(source.signatureHero.screenNdc)
        ? deepFreeze([
          finiteClamped(source.signatureHero.screenNdc[0], 0.36, -0.72, 0.72),
          finiteClamped(source.signatureHero.screenNdc[1], 0.28, -0.55, 0.72),
        ])
        : null,
      lightAngle: finiteClamped(source.signatureHero.lightAngle, -0.7, -Math.PI, Math.PI),
      ringTilt: finiteClamped(source.signatureHero.ringTilt, 0.2, -0.9, 0.9),
    })
    : null;
  const PLANET_KINDS = new Set(['gas', 'rocky', 'ice']);
  const planetTypes = Array.isArray(source.planetTypes)
    ? source.planetTypes.filter((t) => PLANET_KINDS.has(t))
    : null;
  return deepFreeze({
    planetChance: finiteClamped(source.planetChance, DEFAULT_BACKGROUND_COMPOSITION.planetChance, 0, 1),
    wormholeChance: finiteClamped(source.wormholeChance, DEFAULT_BACKGROUND_COMPOSITION.wormholeChance, 0, 1),
    ringChance: finiteClamped(source.ringChance, DEFAULT_BACKGROUND_COMPOSITION.ringChance, 0, 1),
    cometInterval: deepFreeze([Math.min(a, b), Math.max(a, b)]),
    signatureHero: signature,
    planetTypes: planetTypes && planetTypes.length ? deepFreeze(planetTypes) : null,
  });
}

/**
 * Plate contribution the fixture compares with the starter muzzle and the engine core.
 * A galaxy profile contributes its spur alpha. A painted plate contributes strength times
 * the background intensity. A deliberately empty sky contributes nothing.
 */
export function skyPlateLuminance(profile) {
  if (!profile || !profile.background) return 0;
  if (profile.galaxyPlate === true) {
    return resolveBackgroundStructure(profile).l1Alpha;
  }
  const paint = resolveBackgroundPaintedSky(profile);
  if (!paint) return 0;
  const intensity = Number.isFinite(profile.background.intensity) ? profile.background.intensity : 1;
  return paint.strength * intensity;
}

/**
 * The region's painted far-sky plate, or null when the region is deliberately plateless.
 *
 * `plate` names an entry in src/render/deepSkyPlates.js, which the offline bake manifest pins. The
 * strength is clamped hard: this layer is mixed across the whole frame, so an accidental 0.8 would
 * be the full-field wash earlier review rejected, not a bolder sky.
 */
export function resolveBackgroundPaintedSky(profile) {
  const source = profile && profile.background && profile.background.paintedSky;
  if (!source || typeof source.plate !== 'string' || !source.plate) return null;
  return deepFreeze({
    plate: source.plate,
    strength: finiteClamped(source.strength, 0.14, 0, 0.35),
    parallax: finiteClamped(source.parallax, 0.003, 0, 0.02),
    // 1 keeps the baked plate's authored color; <1 desaturates it toward its own luminance so the
    // far sky sits behind play instead of competing with hull paint.
    saturation: finiteClamped(source.saturation, 1, 0, 1),
  });
}

export function resolveBackgroundStructure(profile) {
  const source = profile && profile.background && profile.background.structure || {};
  const kinds = new Set(['void', 'sparse_wisps', 'galactic_band', 'ion_filaments', 'dust_lanes']);
  return deepFreeze({
    recipeId: typeof source.recipeId === 'string' && source.recipeId.length <= 80
      ? source.recipeId
      : DEFAULT_STRUCTURE.recipeId,
    starDensity: finiteClamped(source.starDensity, DEFAULT_STRUCTURE.starDensity, 0.2, 2.5),
    clusterCount: Math.round(finiteClamped(source.clusterCount, DEFAULT_STRUCTURE.clusterCount, 1, 12)),
    clusterStrength: finiteClamped(source.clusterStrength, DEFAULT_STRUCTURE.clusterStrength, 0.2, 2.5),
    voidFloor: finiteClamped(source.voidFloor, DEFAULT_STRUCTURE.voidFloor, 0.0, 0.4),
    flareDensity: finiteClamped(source.flareDensity, DEFAULT_STRUCTURE.flareDensity, 0.2, 2.0),
    structureKind: kinds.has(source.structureKind) ? source.structureKind : DEFAULT_STRUCTURE.structureKind,
    maxCoverage: finiteClamped(source.maxCoverage, DEFAULT_STRUCTURE.maxCoverage, 0.0, 0.35),
    regionLo: finiteClamped(source.regionLo, DEFAULT_STRUCTURE.regionLo, 0.2, 0.95),
    regionHi: finiteClamped(source.regionHi, DEFAULT_STRUCTURE.regionHi, 0.25, 0.99),
    warp: finiteClamped(source.warp, DEFAULT_STRUCTURE.warp, 0.05, 0.8),
    dustAmt: finiteClamped(source.dustAmt, DEFAULT_STRUCTURE.dustAmt, 0.0, 1.0),
    l1Alpha: finiteClamped(source.l1Alpha, DEFAULT_STRUCTURE.l1Alpha, 0.0, 0.8),
    l2Alpha: finiteClamped(source.l2Alpha, DEFAULT_STRUCTURE.l2Alpha, 0.0, 0.4),
    bandCenter: finiteClamped(source.bandCenter, DEFAULT_STRUCTURE.bandCenter, 0.1, 0.9),
    bandWidth: finiteClamped(source.bandWidth, DEFAULT_STRUCTURE.bandWidth, 0.04, 0.4),
    bandAngle: finiteClamped(source.bandAngle, DEFAULT_STRUCTURE.bandAngle, -Math.PI, Math.PI),
    landmarkBias: ['planet', 'wormhole', 'flare', 'none'].includes(source.landmarkBias)
      ? source.landmarkBias
      : DEFAULT_STRUCTURE.landmarkBias,
  });
}

export function estimatePhenomenonCoverage(structure) {
  const s = structure || DEFAULT_STRUCTURE;
  if (s.structureKind === 'void') return Math.min(s.maxCoverage, 0.05);
  const regionSpan = Math.max(0.01, s.regionHi - s.regionLo);
  const kindFactor = s.structureKind === 'galactic_band' ? 0.85
    : s.structureKind === 'ion_filaments' ? 0.75
      : s.structureKind === 'dust_lanes' ? 0.7
        : 0.55;
  const raw = regionSpan * s.l1Alpha * kindFactor * 1.8;
  return Math.min(s.maxCoverage, Math.max(0, raw));
}
