// src/data/palettes.js – visual palette definitions and ship mesh recipes.
// FACTION_PALETTES: 14 faction color palettes keyed by faction_ IDs.
// SECTOR_PALETTES: 10 sector environmental palettes keyed by sector_ IDs.
// SHIP_RECIPES: ship class mesh-build parameters keyed by ship_ IDs.
// Pure data, no imports, no three/DOM deps.

export const FACTION_PALETTES = {
  faction_scn: {
    primary:   '#3A78FF',
    secondary: '#1A3A8F',
    accent:    '#A0C4FF',
    hull:      '#345FAE',
    emissive:  '#3A78FF',
    thruster:  '#88AAFF',
  },
  faction_mts: {
    primary:   '#F2B233',
    secondary: '#8B6020',
    accent:    '#FFE09A',
    hull:      '#A97420',
    emissive:  '#F2B233',
    thruster:  '#FFCC66',
  },
  faction_dmc: {
    primary:   '#C9772E',
    secondary: '#7A4010',
    accent:    '#E8A060',
    hull:      '#9B5424',
    emissive:  '#C9772E',
    thruster:  '#FF8844',
  },
  faction_reach: {
    primary:   '#D8334A',
    secondary: '#7A1020',
    accent:    '#FF6680',
    hull:      '#A52F48',
    emissive:  '#D8334A',
    thruster:  '#FF4466',
  },
  faction_quiet: {
    primary:   '#7A5FB0',
    secondary: '#3A2060',
    accent:    '#B090E8',
    hull:      '#604080',
    emissive:  '#9070D0',
    thruster:  '#A080D0',
  },
  faction_vael: {
    primary:   '#2FCFA0',
    secondary: '#0A5040',
    accent:    '#80EED0',
    hull:      '#176C58',
    emissive:  '#2FCFA0',
    thruster:  '#40FFB8',
  },
  faction_free: {
    primary:   '#4ECBE0',
    secondary: '#206070',
    accent:    '#A0EEF8',
    hull:      '#235F72',
    emissive:  '#4ECBE0',
    thruster:  '#60D8EE',
  },
  faction_choir: {
    primary:   '#E85FD0',
    secondary: '#702060',
    accent:    '#F8A0E8',
    hull:      '#81366F',
    emissive:  '#E85FD0',
    thruster:  '#FF80E8',
  },
  faction_helix: {
    primary:   '#8B9CB8',
    secondary: '#465066',
    accent:    '#C5CEDD',
    hull:      '#47638B',
    emissive:  '#8B9CB8',
    thruster:  '#A8B7D0',
  },
  faction_understory: {
    primary:   '#8FA82E',
    secondary: '#3A2A10',
    accent:    '#3A2A10',
    hull:      '#59731F',
    emissive:  '#D0E060',
    thruster:  '#C7D98A',
  },
  faction_fulfillment: {
    primary:   '#F0F0E8',
    secondary: '#C0C8C8',
    accent:    '#40B8E0',
    hull:      '#D8D8D0',
    emissive:  '#40B8E0',
    thruster:  '#A0E0F0',
  },
  faction_archive: {
    primary:   '#3A2A5A',
    secondary: '#1A0A2A',
    accent:    '#B88830',
    hull:      '#38245F',
    emissive:  '#B88830',
    thruster:  '#8060C0',
  },
  faction_pitborn: {
    primary:   '#C8501C',
    secondary: '#4A3028',
    accent:    '#E8B43A',
    hull:      '#80371E',
    emissive:  '#B06020',
    thruster:  '#D87838',
  },
  faction_verge_layers: {
    primary:   '#B0A8B8',
    secondary: '#6A6080',
    accent:    '#6A6080',
    hull:      '#B0A8B8',
    emissive:  '#C0B8D8',
    thruster:  '#C0B8D8',
  },
};

// Unfactioned team fallbacks when entity.factionId is missing. VISION.md arcade-industrial: no
// slate-grey NPC wash. Team 0 borrows Free Frontier; team 1 is saturated hostile crimson; other
// teams read as industrial cobalt-steel civilians.
export const TEAM_FALLBACK_PALETTES = Object.freeze({
  player: Object.freeze({
    hull: FACTION_PALETTES.faction_free.hull,
    accent: FACTION_PALETTES.faction_free.accent,
    thruster: FACTION_PALETTES.faction_free.thruster,
    dark: FACTION_PALETTES.faction_free.secondary,
  }),
  hostile: Object.freeze({
    hull: '#9a2a38',
    accent: '#ff5470',
    thruster: '#ff7a3c',
    dark: '#241116',
  }),
  civilian: Object.freeze({
    hull: '#3d5f7a',
    accent: '#7ec8e8',
    thruster: '#5ad0ff',
    dark: '#142028',
  }),
});

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
  'blue-collar': { grime: 0.35, chrome: 0.0, noseArt: null, killMarks: false, patches: 0.3 },        // Canonical faction-data spelling; keep blue_collar for legacy callers
  pirate:      { grime: 0.85, chrome: 0.0, noseArt: 'punk', killMarks: true, patches: 0.6 },         // Crimson Reach — filthy, tagged, scarred
  smuggler:    { grime: 0.50, chrome: 0.0, noseArt: 'punk', killMarks: false, patches: 0.35 },       // The Quiet — stealthy grime, tags
  xenophobic:  { grime: 0.15, chrome: 0.30, noseArt: 'insignia', killMarks: true, patches: 0.1 },    // The Vael — alien, austere
  zealot:      { grime: 0.30, chrome: 0.10, noseArt: null, killMarks: false, patches: 0.2 },         // Choir explicit row; preserves the shipped fallback appearance
  paper:       { grime: 0.30, chrome: 0.10, noseArt: null, killMarks: false, patches: 0.2 },         // Helix is content-only today; explicit for schema completeness
  saprophyte:  { grime: 1.00, chrome: 0.00, noseArt: null, killMarks: true, patches: 1.0 },          // Understory — every hull is a recovered loss-ledger carcass
  clinical_automaton: { grime: 0.00, chrome: 0.90, noseArt: null, killMarks: false, patches: 0.0 }, // Fulfillment — sterile routing machinery
  archivist:   { grime: 0.08, chrome: 0.25, noseArt: null, killMarks: false, patches: 0.0 },         // Archive — dark, maintained, ceremonial
  pitborn_patchwork: { grime: 0.90, chrome: 0.00, noseArt: 'punk', killMarks: true, patches: 1.0 }, // Pitborn — repaired stolen hulls and loud orange patches
  nacre_precursor: { grime: 0.00, chrome: 1.00, noseArt: null, killMarks: false, patches: 0.0 },     // Verge-Layers — immaculate nacre precursor surfaces
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
  // Helios Prime — rank-10 sky kit: deep azure void, cyan-nebula, bright sun for store stills.
  sector_helios_prime: {
    skyColor:     '#010a1c',
    nebulaColor:  '#0a2860',
    starDensity:  1.05,
    ambientLight: '#0c2040',
    sunColor:     '#FFF4D4',
    sunIntensity: 1.35,
    fogColor:     '#000a14',
    fogDensity:   0.000018,
    asteroidTint: '#8a8898',
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

// PQ-161.02 — force palette. Five channels that must stay distinct for every colour-vision type.
// Identity is the hue + authored brightness order, not a HUD label. World VFX still lives in dirty
// renderer files; this is the data contract those owners should consume.
export const FORCE_PALETTE_SEED = 16120;
export const FORCE_CHANNEL_IDS = Object.freeze(['rope', 'wells', 'repulsors', 'impulses', 'shields']);
export const FORCE_BRIGHTNESS_ORDER = Object.freeze(['wells', 'rope', 'shields', 'repulsors', 'impulses']);
export const FORCE_CVD_MODES = Object.freeze(['deuteranopia', 'protanopia', 'tritanopia']);
export const FORCE_CONTRAST_FLOORS = Object.freeze({
  minDeltaE: 20,
  minVoidContrast: 3,
  minHueNoneDeg: 25,
  voidHex: '#05070D',
});

export const FORCE_PALETTE = Object.freeze({
  rope: Object.freeze({
    id: 'rope', hex: '#ED4EA3', hueName: 'magenta-line', verb: 'hitch',
  }),
  wells: Object.freeze({
    id: 'wells', hex: '#036F59', hueName: 'teal-sink', verb: 'pull',
  }),
  repulsors: Object.freeze({
    id: 'repulsors', hex: '#FFB98B', hueName: 'peach-push', verb: 'shove',
  }),
  impulses: Object.freeze({
    id: 'impulses', hex: '#FFE956', hueName: 'gold-flash', verb: 'punch',
  }),
  shields: Object.freeze({
    id: 'shields', hex: '#83AEFA', hueName: 'sky-barrier', verb: 'hold',
  }),
});

// Live VFX stand-ins measured 2026-09-08 (tether cyan, field cyan, amber plow, hot flash, shield blue).
// Rope and wells share a hex — that is the gap this leaf closes.
export const FORCE_PALETTE_LIVE_STANDINS = Object.freeze({
  rope: '#39D0FF',
  wells: '#39D0FF',
  repulsors: '#FFB35C',
  impulses: '#FF5C5C',
  shields: '#4F8FDD',
});

// PQ-161.01 — which force channel each leftover telegraph kind announces. The verb is the contract:
// a kind maps to the force that actually lands on the hull (shots and rams punch, blasts shove,
// tethers hitch). Faction colour never enters this table — identity and force stay two channels.
export const TELEGRAPH_FORCE_CHANNELS = Object.freeze({
  engine_flare: 'impulses',
  weapon_charge: 'impulses',
  wake_mines: 'repulsors',
  attach_spool: 'rope',
});

export function forceChannelForTelegraphKind(kind) {
  return TELEGRAPH_FORCE_CHANNELS[String(kind || '')] || null;
}

// Machado, Oliveira & Fernandes 2009 — 100% dichromacy, applied in linear sRGB.
const FORCE_CVD_MATRICES = Object.freeze({
  none: Object.freeze([
    Object.freeze([1, 0, 0]),
    Object.freeze([0, 1, 0]),
    Object.freeze([0, 0, 1]),
  ]),
  protanopia: Object.freeze([
    Object.freeze([0.152286, 1.052583, -0.204868]),
    Object.freeze([0.114503, 0.786281, 0.099216]),
    Object.freeze([-0.003882, -0.048116, 1.051998]),
  ]),
  deuteranopia: Object.freeze([
    Object.freeze([0.367322, 0.860646, -0.227968]),
    Object.freeze([0.280085, 0.672501, 0.047413]),
    Object.freeze([-0.01182, 0.04294, 0.968881]),
  ]),
  tritanopia: Object.freeze([
    Object.freeze([1.255528, -0.076749, -0.178779]),
    Object.freeze([-0.078411, 0.930809, 0.147602]),
    Object.freeze([0.004733, 0.691367, 0.3039]),
  ]),
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function forceHexToSrgb(hex) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
}

function srgbToLinearChannel(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(channel) {
  const x = clamp01(channel);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

function mul3(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function simulateLinear(hex, mode) {
  const srgb = forceHexToSrgb(hex);
  if (!srgb) return null;
  const matrix = FORCE_CVD_MATRICES[mode] || FORCE_CVD_MATRICES.none;
  return mul3(matrix, srgb.map(srgbToLinearChannel)).map(clamp01);
}

function relativeLuminanceFromLinear(linear) {
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastFromLuminance(a, b) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

function linearToXyz(linear) {
  const [r, g, b] = linear;
  return [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.072175,
    r * 0.0193339 + g * 0.119192 + b * 0.9503041,
  ];
}

function xyzToLab([x, y, z]) {
  const ref = [0.95047, 1, 1.08883];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x / ref[0]);
  const fy = f(y / ref[1]);
  const fz = f(z / ref[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function circularHueDistance(a, b) {
  const raw = Math.abs(Number(a) - Number(b)) % 360;
  return Math.min(raw, 360 - raw);
}

function linearToHsl(linear) {
  const [r, g, b] = linear.map(linearToSrgbChannel);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = ((b - r) / delta) + 2;
    else hue = ((r - g) / delta) + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation, lightness };
}

export function forcePaletteHexes(palette = FORCE_PALETTE) {
  const out = {};
  for (const id of FORCE_CHANNEL_IDS) {
    const row = palette[id];
    out[id] = typeof row === 'string' ? row : row && row.hex;
  }
  return out;
}

export function getForcePaletteHex(channel) {
  const row = FORCE_PALETTE[channel];
  return row ? row.hex : null;
}

function evaluateForcePaletteMode(hexes, mode, voidHex) {
  const luminance = {};
  const lab = {};
  const hsl = {};
  for (const id of FORCE_CHANNEL_IDS) {
    const linear = simulateLinear(hexes[id], mode);
    if (!linear) {
      return { ok: false, error: `${id} is not a six-digit hex` };
    }
    luminance[id] = relativeLuminanceFromLinear(linear);
    lab[id] = xyzToLab(linearToXyz(linear));
    hsl[id] = linearToHsl(linear);
  }
  const brightnessOrder = [...FORCE_CHANNEL_IDS].sort((a, b) => {
    const delta = luminance[a] - luminance[b];
    return delta !== 0 ? delta : a.localeCompare(b);
  });
  const voidLinear = simulateLinear(voidHex, mode);
  const voidLum = relativeLuminanceFromLinear(voidLinear);
  const pairs = [];
  let minDeltaE = Infinity;
  let minHueDeg = Infinity;
  let minPairContrast = Infinity;
  let minVoidContrast = Infinity;
  for (let i = 0; i < FORCE_CHANNEL_IDS.length; i++) {
    const a = FORCE_CHANNEL_IDS[i];
    const voidContrast = contrastFromLuminance(luminance[a], voidLum);
    minVoidContrast = Math.min(minVoidContrast, voidContrast);
    for (let j = i + 1; j < FORCE_CHANNEL_IDS.length; j++) {
      const b = FORCE_CHANNEL_IDS[j];
      const de = deltaE76(lab[a], lab[b]);
      const hueDeg = circularHueDistance(hsl[a].hue, hsl[b].hue);
      const pairContrast = contrastFromLuminance(luminance[a], luminance[b]);
      pairs.push(Object.freeze({
        a, b,
        deltaE: de,
        hueDeg,
        contrast: pairContrast,
      }));
      minDeltaE = Math.min(minDeltaE, de);
      minHueDeg = Math.min(minHueDeg, hueDeg);
      minPairContrast = Math.min(minPairContrast, pairContrast);
    }
  }
  return {
    mode,
    luminance: Object.freeze(luminance),
    brightnessOrder: Object.freeze(brightnessOrder),
    brightnessPreserved: brightnessOrder.join('|') === FORCE_BRIGHTNESS_ORDER.join('|'),
    minDeltaE,
    minHueDeg,
    minPairContrast,
    minVoidContrast,
    pairs: Object.freeze(pairs),
  };
}

export function evaluateForcePaletteContrast({
  seed = FORCE_PALETTE_SEED,
  palette = FORCE_PALETTE,
  voidHex = FORCE_CONTRAST_FLOORS.voidHex,
} = {}) {
  const hexes = forcePaletteHexes(palette);
  const errors = [];
  if (seed !== FORCE_PALETTE_SEED) {
    errors.push(`seed ${seed} is not the force-palette scenario seed ${FORCE_PALETTE_SEED}`);
  }
  const unique = new Set(FORCE_CHANNEL_IDS.map((id) => String(hexes[id] || '').toUpperCase()));
  if (unique.size !== FORCE_CHANNEL_IDS.length) {
    errors.push('force channels must disagree on hex');
  }
  const trichromat = evaluateForcePaletteMode(hexes, 'none', voidHex);
  if (trichromat.error) errors.push(trichromat.error);
  if (trichromat.minHueDeg < FORCE_CONTRAST_FLOORS.minHueNoneDeg) {
    errors.push(`trichromat hue floor ${trichromat.minHueDeg.toFixed(1)}° < ${FORCE_CONTRAST_FLOORS.minHueNoneDeg}°`);
  }
  const simulations = {};
  for (const mode of FORCE_CVD_MODES) {
    const row = evaluateForcePaletteMode(hexes, mode, voidHex);
    simulations[mode] = row;
    if (row.error) errors.push(`${mode}: ${row.error}`);
    if (row.minDeltaE < FORCE_CONTRAST_FLOORS.minDeltaE) {
      errors.push(`${mode} min ΔE ${row.minDeltaE.toFixed(2)} < ${FORCE_CONTRAST_FLOORS.minDeltaE}`);
    }
    if (row.minVoidContrast < FORCE_CONTRAST_FLOORS.minVoidContrast) {
      errors.push(`${mode} void contrast ${row.minVoidContrast.toFixed(2)} < ${FORCE_CONTRAST_FLOORS.minVoidContrast}`);
    }
    if (!row.brightnessPreserved) {
      errors.push(`${mode} brightness order ${row.brightnessOrder.join('<')} ≠ ${FORCE_BRIGHTNESS_ORDER.join('<')}`);
    }
  }
  return {
    ok: errors.length === 0,
    seed,
    hues: Object.freeze(hexes),
    brightnessOrder: FORCE_BRIGHTNESS_ORDER,
    trichromat,
    simulations,
    errors,
  };
}

// Perceptual separation (CIE ΔE76) between any two on-screen hexes, per vision mode. Used by the
// PQ-161 tests to prove force hues stay apart from each other AND from faction primaries.
export function minPairDeltaE(hexA, hexB, modes = FORCE_CVD_MODES) {
  const list = Array.isArray(modes) ? modes : [modes];
  let min = Infinity;
  for (const mode of list) {
    const a = simulateLinear(hexA, mode);
    const b = simulateLinear(hexB, mode);
    if (!a || !b) return null;
    const de = deltaE76(xyzToLab(linearToXyz(a)), xyzToLab(linearToXyz(b)));
    min = Math.min(min, de);
  }
  return min;
}

export function formatForcePaletteReport(result) {
  const lines = [
    `PQ-161.02 seed ${result.seed} ${result.ok ? 'GREEN' : 'RED'}`,
    `hues  rope=${result.hues.rope}  wells=${result.hues.wells}  repulsors=${result.hues.repulsors}  impulses=${result.hues.impulses}  shields=${result.hues.shields}`,
    `brightness  ${result.brightnessOrder.join(' < ')}`,
  ];
  if (result.trichromat && !result.trichromat.error) {
    lines.push(`none  minΔE ${result.trichromat.minDeltaE.toFixed(2)}  minHue ${result.trichromat.minHueDeg.toFixed(1)}°  void ${result.trichromat.minVoidContrast.toFixed(2)}`);
  }
  for (const mode of FORCE_CVD_MODES) {
    const row = result.simulations[mode];
    if (!row || row.error) {
      lines.push(`${mode}  ERROR`);
      continue;
    }
    lines.push(
      `${mode}  minΔE ${row.minDeltaE.toFixed(2)}  minHue ${row.minHueDeg.toFixed(1)}°  void ${row.minVoidContrast.toFixed(2)}  pair ${row.minPairContrast.toFixed(2)}  ${row.brightnessOrder.join(' < ')}  ${row.brightnessPreserved ? 'ORDER' : 'FLIP'}`,
    );
  }
  for (const error of result.errors) lines.push(`error  ${error}`);
  return lines.join('\n');
}

export {
  OCCUPATIONAL_ROLE_IDS,
  OCCUPATIONAL_SILHOUETTE_TOKENS,
  OCCUPATIONAL_SILHOUETTE_RULES,
  ROLE_ALIASES as OCCUPATIONAL_ROLE_ALIASES,
  normalizeOccupationalRole,
  getOccupationalSilhouetteRule,
} from './occupationalSilhouettes.js';
import { getRoleFactionLivery as resolveRoleFactionLivery } from './occupationalSilhouettes.js';

export function getRoleFactionLivery(role, factionId) {
  return resolveRoleFactionLivery(role, factionId, FACTION_PALETTES);
}

