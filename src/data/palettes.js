// src/data/palettes.js – visual palette definitions and ship mesh recipes.
// FACTION_PALETTES: 8 faction color palettes keyed by faction_ IDs.
// SECTOR_PALETTES: 10 sector environmental palettes keyed by sector_ IDs.
// SHIP_RECIPES: ship class mesh-build parameters keyed by ship_ IDs.
// Pure data, no imports, no three/DOM deps.

export const FACTION_PALETTES = {
  faction_scn: {
    primary:   '#3A78FF',
    secondary: '#1A3A8F',
    accent:    '#A0C4FF',
    hull:      '#C8D8F0',
    emissive:  '#3A78FF',
    thruster:  '#88AAFF',
  },
  faction_mts: {
    primary:   '#F2B233',
    secondary: '#8B6020',
    accent:    '#FFE09A',
    hull:      '#E8D8A0',
    emissive:  '#F2B233',
    thruster:  '#FFCC66',
  },
  faction_dmc: {
    primary:   '#C9772E',
    secondary: '#7A4010',
    accent:    '#E8A060',
    hull:      '#A08050',
    emissive:  '#C9772E',
    thruster:  '#FF8844',
  },
  faction_reach: {
    primary:   '#D8334A',
    secondary: '#7A1020',
    accent:    '#FF6680',
    hull:      '#C06070',
    emissive:  '#D8334A',
    thruster:  '#FF4466',
  },
  faction_quiet: {
    primary:   '#7A5FB0',
    secondary: '#3A2060',
    accent:    '#B090E8',
    hull:      '#706080',
    emissive:  '#9070D0',
    thruster:  '#A080D0',
  },
  faction_vael: {
    primary:   '#2FCFA0',
    secondary: '#0A5040',
    accent:    '#80EED0',
    hull:      '#204840',
    emissive:  '#2FCFA0',
    thruster:  '#40FFB8',
  },
  faction_free: {
    primary:   '#4ECBE0',
    secondary: '#206070',
    accent:    '#A0EEF8',
    hull:      '#808090',
    emissive:  '#4ECBE0',
    thruster:  '#60D8EE',
  },
  faction_choir: {
    primary:   '#E85FD0',
    secondary: '#702060',
    accent:    '#F8A0E8',
    hull:      '#905080',
    emissive:  '#E85FD0',
    thruster:  '#FF80E8',
  },
};

// PAINT_PROFILES — the soul of the art direction. Maps a faction's `personality` to a paint profile
// that the render track reads to decide how grimy/chrome/graffitied a ship looks. This makes the
// "dirty outlaw vs clean authority" contrast DATA-DRIVEN: every NPC inherits its look from its
// faction personality automatically, no per-ship authoring needed.
//
//   grime     0..1 — oil streaks, rust blooms, bolted-on patches, dust. 0 = pristine, 1 = filthy.
//   chrome    0..1 — mirror reflectivity (env-map intensity). Authority ships = high; outlaws = ~0.
//   noseArt   null | 'bomber' | 'punk' | 'insignia' — decal style on the hull flanks/nose.
//   killMarks true  — bomb/kill tallies stenciled near the cockpit (combat veterans only).
//   patches   0..1  — probability of bolted-on repair patches (welded plates over battle damage).
//
// The player's faction_free (independent) profile is the haunted ex-gangster runner: heavy grime,
// bomber+punk hybrid nose-art, kill marks, repair patches — a ship with a dark history nobody else
// would touch. Concord/Meridian authority are pristine chrome. Pirates are the filthiest.
export const PAINT_PROFILES = {
  lawful:      { grime: 0.05, chrome: 0.85, noseArt: 'insignia', killMarks: false, patches: 0.0 },  // Concord Navy — pristine chrome, clean insignia
  corporate:   { grime: 0.10, chrome: 0.70, noseArt: 'insignia', killMarks: false, patches: 0.0 },  // Meridian — clean chrome, corporate logos
  independent: { grime: 0.55, chrome: 0.05, noseArt: 'bomber', killMarks: true, patches: 0.4 },     // Free Frontier (PLAYER) — haunted ex-gangster runner
  blue_collar: { grime: 0.35, chrome: 0.0, noseArt: null, killMarks: false, patches: 0.3 },          // Drift Miners — workhorse, honest grime
  pirate:      { grime: 0.85, chrome: 0.0, noseArt: 'punk', killMarks: true, patches: 0.6 },         // Crimson Reach — filthy, tagged, scarred
  smuggler:    { grime: 0.50, chrome: 0.0, noseArt: 'punk', killMarks: false, patches: 0.35 },       // The Quiet — stealthy grime, tags
  xenophobic:  { grime: 0.15, chrome: 0.30, noseArt: 'insignia', killMarks: true, patches: 0.1 },    // The Vael — alien, austere
  // default fallback for any faction lacking a personality match
  default:     { grime: 0.30, chrome: 0.10, noseArt: null, killMarks: false, patches: 0.2 },
};

// The player ship's canonical nose-art seed text — drives the dark-humor stenciled graffiti on the
// Kestrel. "BORROWED TIME" is the in-fiction nickname: a haunted ex-gangster death-ship the player
// took because nobody else would fly it. Render-facing only; never read by gameplay.
export const PLAYER_NOSE_ART = {
  ship_kestrel: { motto: 'BORROWED TIME', mascot: 'ghost', sharkMouth: true, tally: 13 },
};

// Resolve a paint profile for a faction personality string. Returns a fresh merged object so callers
// can safely tweak per-ship without mutating the shared profile.
export function paintProfileFor(personality) {
  return Object.assign({}, PAINT_PROFILES[personality] || PAINT_PROFILES.default);
}

export const SECTOR_PALETTES = {
  sector_helios_prime: {
    skyColor:     '#010818',
    nebulaColor:  '#081840',
    starDensity:  0.9,
    ambientLight: '#0A1830',
    sunColor:     '#FFF0C8',
    sunIntensity: 1.2,
    fogColor:     '#000810',
    fogDensity:   0.00002,
    asteroidTint: '#888090',
  },
  sector_ceres_belt: {
    skyColor:     '#020A10',
    nebulaColor:  '#102030',
    starDensity:  0.8,
    ambientLight: '#101820',
    sunColor:     '#FFE8C0',
    sunIntensity: 0.9,
    fogColor:     '#040C14',
    fogDensity:   0.00005,
    asteroidTint: '#706060',
  },
  sector_tethys_junction: {
    skyColor:     '#010C18',
    nebulaColor:  '#0C2040',
    starDensity:  0.85,
    ambientLight: '#0C1828',
    sunColor:     '#FFE8C0',
    sunIntensity: 0.85,
    fogColor:     '#020810',
    fogDensity:   0.00003,
    asteroidTint: '#787080',
  },
  sector_vesta_forge: {
    skyColor:     '#080410',
    nebulaColor:  '#200808',
    starDensity:  0.75,
    ambientLight: '#180808',
    sunColor:     '#FFC880',
    sunIntensity: 0.8,
    fogColor:     '#080408',
    fogDensity:   0.00006,
    asteroidTint: '#806040',
  },
  sector_pallas_drift: {
    skyColor:     '#040814',
    nebulaColor:  '#082040',
    starDensity:  0.7,
    ambientLight: '#081420',
    sunColor:     '#FFD890',
    sunIntensity: 0.7,
    fogColor:     '#020408',
    fogDensity:   0.00008,
    asteroidTint: '#686070',
  },
  sector_io_reach: {
    skyColor:     '#020810',
    nebulaColor:  '#182840',
    starDensity:  0.65,
    ambientLight: '#0C1820',
    sunColor:     '#FFD0A0',
    sunIntensity: 0.65,
    fogColor:     '#010408',
    fogDensity:   0.0001,
    asteroidTint: '#604848',
  },
  sector_charon_expanse: {
    skyColor:     '#020408',
    nebulaColor:  '#301810',
    starDensity:  0.6,
    ambientLight: '#140808',
    sunColor:     '#FFC070',
    sunIntensity: 0.6,
    fogColor:     '#010204',
    fogDensity:   0.00012,
    asteroidTint: '#582020',
  },
  sector_sker_haven: {
    skyColor:     '#010204',
    nebulaColor:  '#200408',
    starDensity:  0.5,
    ambientLight: '#100404',
    sunColor:     '#FF9050',
    sunIntensity: 0.4,
    fogColor:     '#010101',
    fogDensity:   0.00015,
    asteroidTint: '#401818',
  },
  sector_veil_nebula: {
    skyColor:     '#040818',
    nebulaColor:  '#101840',
    starDensity:  0.4,
    ambientLight: '#081020',
    sunColor:     '#C0D0FF',
    sunIntensity: 0.3,
    fogColor:     '#020408',
    fogDensity:   0.0003,
    asteroidTint: '#303060',
    nebulaIntensity: 0.9,
  },
  sector_ashfall_reach: {
    skyColor:     '#010101',
    nebulaColor:  '#100404',
    starDensity:  0.3,
    ambientLight: '#0C0404',
    sunColor:     '#FF6030',
    sunIntensity: 0.25,
    fogColor:     '#080202',
    fogDensity:   0.0004,
    asteroidTint: '#301010',
    particleColor: '#FF4010',
    particleDensity: 0.6,
  },
};

// Ship class mesh-build parameters (geometry hints for the procedural mesh factory).
export const SHIP_RECIPES = {
  ship_kestrel: {
    hullProfile: 'wedge_s', lengthM: 28, widthM: 14, heightM: 6,
    wingSpan: 0.8, engineCount: 1, engineSize: 'M',
    detailLevel: 1, panelCount: 8, antennaCount: 1,
  },
  ship_pelican: {
    hullProfile: 'wide_body_s', lengthM: 32, widthM: 18, heightM: 8,
    wingSpan: 0.6, engineCount: 2, engineSize: 'M',
    detailLevel: 1, panelCount: 10, antennaCount: 1,
  },
  ship_wasp: {
    hullProfile: 'dart_s', lengthM: 24, widthM: 16, heightM: 5,
    wingSpan: 1.2, engineCount: 1, engineSize: 'M',
    detailLevel: 2, panelCount: 6, antennaCount: 2,
  },
  ship_mule: {
    hullProfile: 'box_m', lengthM: 40, widthM: 20, heightM: 14,
    wingSpan: 0.4, engineCount: 2, engineSize: 'M',
    detailLevel: 1, panelCount: 14, antennaCount: 1,
  },
  ship_drifter: {
    hullProfile: 'wedge_m', lengthM: 44, widthM: 22, heightM: 10,
    wingSpan: 0.9, engineCount: 2, engineSize: 'M',
    detailLevel: 2, panelCount: 12, antennaCount: 2,
  },
  ship_hornet: {
    hullProfile: 'dart_m', lengthM: 36, widthM: 24, heightM: 8,
    wingSpan: 1.4, engineCount: 1, engineSize: 'L',
    detailLevel: 3, panelCount: 8, antennaCount: 3,
  },
  ship_ironback: {
    hullProfile: 'barge_m', lengthM: 56, widthM: 32, heightM: 18,
    wingSpan: 0.3, engineCount: 2, engineSize: 'M',
    detailLevel: 1, panelCount: 20, antennaCount: 1,
  },
  ship_bastion: {
    hullProfile: 'wedge_l', lengthM: 60, widthM: 28, heightM: 14,
    wingSpan: 0.8, engineCount: 2, engineSize: 'L',
    detailLevel: 3, panelCount: 16, antennaCount: 3,
  },
  ship_atlas: {
    hullProfile: 'barge_l', lengthM: 80, widthM: 40, heightM: 22,
    wingSpan: 0.3, engineCount: 4, engineSize: 'L',
    detailLevel: 2, panelCount: 28, antennaCount: 2,
  },
  ship_ranger: {
    hullProfile: 'elongated_m', lengthM: 52, widthM: 20, heightM: 10,
    wingSpan: 1.1, engineCount: 2, engineSize: 'L',
    detailLevel: 3, panelCount: 14, antennaCount: 4,
  },
  ship_warden: {
    hullProfile: 'wedge_xl', lengthM: 90, widthM: 40, heightM: 20,
    wingSpan: 0.7, engineCount: 3, engineSize: 'L',
    detailLevel: 4, panelCount: 24, antennaCount: 4,
  },
  ship_colossus: {
    hullProfile: 'capital_m', lengthM: 120, widthM: 55, heightM: 28,
    wingSpan: 0.5, engineCount: 4, engineSize: 'L',
    detailLevel: 4, panelCount: 36, antennaCount: 5,
  },
  ship_leviathan: {
    hullProfile: 'capital_xl', lengthM: 200, widthM: 90, heightM: 45,
    wingSpan: 0.4, engineCount: 6, engineSize: 'L',
    detailLevel: 5, panelCount: 60, antennaCount: 8,
  },
};
