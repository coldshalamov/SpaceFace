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

export const SECTOR_VISUAL_PROFILES = Object.freeze({
  helios_core: freezeProfile({
    id: 'helios_core',
    skyPalette: 'AZURE',
    // Stronger restrained key/rim/fill so station + long-ship stay readable on motion route.
    lighting: { ambient: 0.15, key: 3.2, rim: 0.72, fill: 0.32 },
    background: {
      // True blacks + projection-safe gas giant; no explicit macro (planet + star clusters carry far field).
      intensity: 0.80,
      nebulaOpacity: 0.0,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'helios_orbital_void',
        structureKind: 'void',
        starDensity: 1.12,
        clusterCount: 8,
        clusterStrength: 1.4,
        voidFloor: 0.12,
        flareDensity: 1.3,
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
        planetChance: 0.28,
        wormholeChance: 0.0,
        ringChance: 0.35,
        cometInterval: [32, 68],
        // Screen-safe upper-right limb; placement is projection-aware (not XZ offset guess).
        signatureHero: {
          kind: 'planet', type: 'gas', ring: true, frac: 0.26,
          offset: [0.18, 0.16],
          screenNdc: [0.58, 0.32],
          lightAngle: -0.72, ringTilt: 0.16,
        },
      },
    },
    post: { exposure: 0.96, bloomStrengthScale: 0.55, bloomThresholdBias: 0.28 },
  }),
  core: freezeProfile({
    id: 'core',
    skyPalette: 'AZURE',
    lighting: { ambient: 0.13, key: 2.3, rim: 0.26, fill: 0.06 },
    background: {
      intensity: 0.58,
      // Authored star associations/landmarks carry the composition; no procedural full-field veil.
      nebulaOpacity: 0.0,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'core_trade_constellation',
        structureKind: 'sparse_wisps',
        starDensity: 0.95,
        maxCoverage: 0.10,
        regionLo: 0.64,
        regionHi: 0.84,
        warp: 0.22,
        dustAmt: 0.28,
        l1Alpha: 0.28,
        l2Alpha: 0.05,
      },
      composition: {
        planetChance: 0.43, wormholeChance: 0.06, ringChance: 0.55,
        cometInterval: [30, 72], signatureHero: null,
      },
    },
    post: { exposure: 0.96, bloomStrengthScale: 0.6, bloomThresholdBias: 0.26 },
  }),
  belt: freezeProfile({
    id: 'belt',
    skyPalette: 'EMBER',
    lighting: { ambient: 0.15, key: 2.35, rim: 0.3, fill: 0.08 },
    background: {
      intensity: 0.55,
      // The broken dust lane is explicit geometry with authored silhouette and occlusion.
      nebulaOpacity: 0.0,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'belt_broken_dust_lane',
        structureKind: 'dust_lanes',
        starDensity: 1.05,
        clusterCount: 7,
        clusterStrength: 1.15,
        voidFloor: 0.09,
        maxCoverage: 0.16,
        regionLo: 0.55,
        regionHi: 0.74,
        warp: 0.34,
        dustAmt: 0.78,
        l1Alpha: 0.48,
        l2Alpha: 0.09,
        landmarkBias: 'flare',
      },
      composition: {
        planetChance: 0.3, wormholeChance: 0.045, ringChance: 0.34,
        cometInterval: [22, 58], signatureHero: null,
      },
    },
    post: { exposure: 0.95, bloomStrengthScale: 0.65, bloomThresholdBias: 0.22 },
  }),
  fringe: freezeProfile({
    id: 'fringe',
    skyPalette: 'CRIMSON',
    // Slightly stronger key/rim/fill so station + long-ship keep two readable planes.
    lighting: { ambient: 0.12, key: 3.25, rim: 1.08, fill: 0.18 },
    background: {
      intensity: 0.72,
      // Full-field L1/L2 contribution forced off — macro geometry + stars only.
      nebulaOpacity: 0.0,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'fringe_tidal_filament',
        structureKind: 'ion_filaments',
        starDensity: 1.18,
        clusterCount: 9,
        clusterStrength: 1.95,
        voidFloor: 0.08,
        flareDensity: 1.15,
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
    post: { exposure: 0.94, bloomStrengthScale: 0.55, bloomThresholdBias: 0.24 },
  }),
  anomaly: freezeProfile({
    id: 'anomaly',
    skyPalette: 'ION',
    lighting: { ambient: 0.16, key: 2.05, rim: 0.55, fill: 0.1 },
    background: {
      intensity: 0.6,
      // Local electromagnetic scar + wormhole replace the former fullscreen violet wash.
      nebulaOpacity: 0.0,
      structure: {
        ...DEFAULT_STRUCTURE,
        recipeId: 'anomaly_electromagnetic_scar',
        structureKind: 'ion_filaments',
        starDensity: 0.7,
        clusterCount: 3,
        clusterStrength: 1.5,
        voidFloor: 0.04,
        maxCoverage: 0.22,
        regionLo: 0.50,
        regionHi: 0.70,
        warp: 0.48,
        dustAmt: 0.35,
        l1Alpha: 0.55,
        l2Alpha: 0.14,
        landmarkBias: 'wormhole',
      },
      composition: {
        planetChance: 0.18, wormholeChance: 0.42, ringChance: 0.72,
        cometInterval: [12, 38],
        signatureHero: {
          kind: 'planet', type: 'ice', ring: true, frac: 0.13,
          offset: [-0.18, 0.28], screenNdc: [-0.48, 0.22],
          lightAngle: -1.4, ringTilt: -0.4,
        },
      },
    },
    post: { exposure: 0.95, bloomStrengthScale: 0.75, bloomThresholdBias: 0.16 },
  }),
});

const PROFILE_BY_NEBULA_TINT = new Map([
  [SECTOR_PALETTE_CLASSES.core.nebulaTint, SECTOR_VISUAL_PROFILES.core],
  [SECTOR_PALETTE_CLASSES.belt.nebulaTint, SECTOR_VISUAL_PROFILES.belt],
  [SECTOR_PALETTE_CLASSES.fringe.nebulaTint, SECTOR_VISUAL_PROFILES.fringe],
  [SECTOR_PALETTE_CLASSES.anomaly.nebulaTint, SECTOR_VISUAL_PROFILES.anomaly],
]);

const PROFILE_BY_ID = new Map([
  ['sector_helios_prime', SECTOR_VISUAL_PROFILES.helios_core],
  ['sector_frontier_east_ridge', SECTOR_VISUAL_PROFILES.fringe],
  ['sector_ceres_belt', SECTOR_VISUAL_PROFILES.belt],
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
  return deepFreeze({
    planetChance: finiteClamped(source.planetChance, DEFAULT_BACKGROUND_COMPOSITION.planetChance, 0, 1),
    wormholeChance: finiteClamped(source.wormholeChance, DEFAULT_BACKGROUND_COMPOSITION.wormholeChance, 0, 1),
    ringChance: finiteClamped(source.ringChance, DEFAULT_BACKGROUND_COMPOSITION.ringChance, 0, 1),
    cometInterval: deepFreeze([Math.min(a, b), Math.max(a, b)]),
    signatureHero: signature,
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
