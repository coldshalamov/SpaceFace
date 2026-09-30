// The Look: one authored source for the picture's vibe.
//
// SpaceFace reads as a bright, fast arcade game: glossy lacquered machinery, neon signal light,
// hard complementary colour contrast, black space. Some places turn that down into a darker
// neon-noir. Both are the SAME system with different numbers — a mood.
//
// A mood is a flat bag of numbers. Every global stage that shapes the picture reads it:
//   surface  -> src/render/illustratedSurface.js   (how every lit hull answers light)
//   post     -> src/render/bloom.js                 (grade, contrast, ink, bloom colour, vignette)
//   rig      -> src/render/renderer.js              (key / rim / fill / ambient colours)
// The runtime owner is src/render/look.js: it lerps between moods on sector change and writes
// the shared shader uniforms. Nothing else in the renderer hardcodes a look constant.
//
// Authoring rules:
//  - Colours are linear-light multipliers unless the name ends in `Hex` (sRGB hex, light colour).
//  - A mood only names what it changes; everything else inherits LOOK_BASE.
//  - Moods differ in COLOUR RELATIONSHIPS (which two hues fight) and DARKNESS, never in
//    material physics: a hull is the same substance in every sector.

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const LOOK_VERSION = 'spaceface-look-v1';

// The house look. "Arcade daylight": clean warm-white sun, electric cyan edge light,
// ultramarine shadows, saturated paint under a clear coat.
export const LOOK_BASE = deepFreeze({
  surface: {
    // Paint value. 1.0 shows the authored albedo; <1 lifts it toward pastel (the retired
    // Lacquer & Starlight pass shipped 0.80, which is what bleached the fleet).
    albedoGamma: 1.0,
    // Paint chroma around its own luminance. >1 deepens colour without changing value.
    albedoSaturation: 1.18,
    // Share of form shading replaced by graphic light bands. 0 = physical falloff, 1 = poster.
    bandMix: 0.34,
    // Colour of the unlit side and of the lit side (multipliers on diffuse light).
    shadowTint: [0.46, 0.58, 1.22],
    lightTint: [1.08, 1.02, 0.94],
    // Dark contour where the hull turns away from the camera. 0 = none.
    contour: 0.42,
    // Clear coat: a second, sharp specular lobe over smooth dielectric paint. This is the
    // "shiny": a hard sun glint plus a mirror of the reflection environment.
    coat: 1.0,
    coatRoughness: 0.24,
    coatEnv: 0.75,
    // Coat reflectance at the grazing limb (facing reflectance is a fixed lacquer 0.05).
    coatEdge: 0.6,
    coatTint: [1.0, 1.0, 1.0],
    // Edge light: a coloured grazing-angle rim, strongest away from the key.
    rim: [0.20, 0.62, 1.0],
    rimStrength: 0.7,
    rimPower: 3.2,
    // Brightest a lit pigment may get (scene-linear luminance). Kept under the bloom
    // threshold of 1.0: paint never emits.
    paintCeiling: 0.74,
  },
  post: {
    // How hard the sector wears the grade below (0 = ungraded) and its corner darkening.
    grade: 0.7,
    vignette: 0.2,
    // Split-tone multipliers for dark and bright pixels.
    shadowTint: [0.84, 0.96, 1.16],
    highlightTint: [1.08, 1.0, 0.92],
    // Contrast around mid-grey (1 = none) and global saturation (1 = none).
    contrast: 1.12,
    saturation: 1.16,
    // Extra saturation for muted colours only, so skin-of-paint pops without neon clipping.
    vibrance: 0.22,
    // Painted-edge ink and value steps from the retired illustration pass. 0 = clean.
    ink: 0.18,
    // Colour of bloom spill.
    bloomTint: [1.0, 1.0, 1.0],
    // Corner darkening colour (multiplied in at full vignette).
    vignetteTint: [0.0, 0.0, 0.0],
  },
  rig: {
    keyHex: 0xfff0dc, rimHex: 0x4fc8ff, fillHex: 0x5c7cff, ambientHex: 0x27345c,
  },
});

// Named moods. Only differences from LOOK_BASE.
export const LOOK_MOODS = deepFreeze({
  // Helios, core trade space, Tethys: the bright showroom. Base numbers.
  arcade: {},

  // Frontier / lawless space: dark, magenta against cyan. The cyberpunk end of the dial.
  neon_noir: {
    surface: {
      albedoSaturation: 1.24,
      bandMix: 0.40,
      shadowTint: [0.62, 0.36, 1.18],
      lightTint: [1.10, 0.98, 1.02],
      contour: 0.55,
      coatEnv: 1.15,
      rim: [1.0, 0.16, 0.72],
      rimStrength: 1.15,
      rimPower: 2.8,
    },
    post: {
      shadowTint: [0.88, 0.82, 1.22],
      grade: 0.9, vignette: 0.34,
      highlightTint: [1.10, 0.97, 1.02],
      contrast: 1.22,
      saturation: 1.22,
      vibrance: 0.30,
      ink: 0.26,
      bloomTint: [1.06, 0.92, 1.10],
      vignetteTint: [0.05, 0.0, 0.09],
    },
    rig: { keyHex: 0xffd9ec, rimHex: 0x19e6ff, fillHex: 0xd24bff, ambientHex: 0x2a1f52 },
  },

  // Sker Haven: a yard at night under sodium lamps. Amber against deep blue.
  sodium_yard: {
    surface: {
      bandMix: 0.40,
      shadowTint: [0.40, 0.56, 1.24],
      lightTint: [1.14, 1.0, 0.84],
      contour: 0.52,
      rim: [0.16, 0.74, 1.0],
      rimStrength: 1.05,
    },
    post: {
      shadowTint: [0.80, 0.94, 1.22],
      grade: 0.85, vignette: 0.32,
      highlightTint: [1.14, 1.0, 0.84],
      contrast: 1.20,
      saturation: 1.18,
      ink: 0.24,
      bloomTint: [1.10, 0.98, 0.86],
      vignetteTint: [0.0, 0.02, 0.07],
    },
    rig: { keyHex: 0xffb45e, rimHex: 0x32c8ff, fillHex: 0x3a5cff, ambientHex: 0x1c2a58 },
  },

  // Vesta Forge: furnace orange against teal. The classic hot/cold split, pushed.
  forge_heat: {
    surface: {
      shadowTint: [0.36, 0.70, 0.98],
      lightTint: [1.16, 1.0, 0.82],
      rim: [0.10, 0.86, 0.84],
      rimStrength: 0.95,
    },
    post: {
      shadowTint: [0.80, 1.0, 1.12],
      grade: 0.8, vignette: 0.24,
      highlightTint: [1.16, 1.0, 0.84],
      contrast: 1.16,
      bloomTint: [1.12, 0.98, 0.84],
      vignetteTint: [0.06, 0.01, 0.0],
    },
    rig: { keyHex: 0xffc98f, rimHex: 0x2fe0d0, fillHex: 0xd0703a, ambientHex: 0x3a2c34 },
  },

  // Pallas Drift: ice. Blue-white key, violet edge, steel shadows, the highest gloss.
  cold_drift: {
    surface: {
      albedoSaturation: 1.10,
      shadowTint: [0.50, 0.56, 1.10],
      lightTint: [0.96, 1.02, 1.10],
      coatRoughness: 0.20,
      coatEnv: 1.1,
      rim: [0.62, 0.42, 1.0],
      rimStrength: 0.95,
    },
    post: {
      shadowTint: [0.86, 0.94, 1.18],
      grade: 0.75, vignette: 0.24,
      highlightTint: [0.98, 1.02, 1.08],
      contrast: 1.14,
      saturation: 1.10,
      bloomTint: [0.94, 1.0, 1.10],
      vignetteTint: [0.0, 0.02, 0.06],
    },
    rig: { keyHex: 0xd9e6ff, rimHex: 0xa880ff, fillHex: 0x6f9cff, ambientHex: 0x27345c },
  },

  // Ceres and the belts: gold dust light against slate teal. Working daylight, warmer and rougher.
  dust_gold: {
    surface: {
      shadowTint: [0.44, 0.62, 1.04],
      lightTint: [1.12, 1.02, 0.88],
      rim: [0.24, 0.72, 0.92],
      rimStrength: 0.8,
    },
    post: {
      shadowTint: [0.84, 0.98, 1.12],
      highlightTint: [1.12, 1.02, 0.88],
      bloomTint: [1.06, 1.0, 0.92],
    },
    rig: { keyHex: 0xffdfae, rimHex: 0x52c4e8, fillHex: 0xb89468, ambientHex: 0x33364e },
  },

  // The anomaly: wrong-coloured light. Violet key, acid-green edge.
  void_signal: {
    surface: {
      albedoSaturation: 1.22,
      bandMix: 0.42,
      shadowTint: [0.30, 0.78, 0.74],
      lightTint: [1.04, 0.96, 1.12],
      contour: 0.55,
      rim: [0.22, 1.0, 0.56],
      rimStrength: 1.2,
      rimPower: 2.6,
    },
    post: {
      shadowTint: [0.78, 1.04, 1.02],
      grade: 0.9, vignette: 0.34,
      highlightTint: [1.06, 0.96, 1.10],
      contrast: 1.20,
      saturation: 1.20,
      vibrance: 0.30,
      ink: 0.26,
      bloomTint: [0.96, 1.06, 1.04],
      vignetteTint: [0.04, 0.0, 0.08],
    },
    rig: { keyHex: 0xc8b6ff, rimHex: 0x54ffb0, fillHex: 0x4ddc92, ambientHex: 0x2c2a52 },
  },
});

// Emissive gain by material role, applied once when a Forge material is admitted. Light is
// part of the ship: a nav light or window is a few pixels at the chase camera, and only a
// source well above the bloom threshold spills far enough to read as a lamp instead of paint.
// This is material physics, so it is the same in every mood.
export const LOOK_EMISSIVE_GAIN = Object.freeze({ signal: 2.6, drive: 1.7 });

export const DEFAULT_LOOK_MOOD = 'arcade';

// Which mood a sector visual profile wears (profile ids from sectorVisualProfiles.js).
// A profile may also name its mood directly with `look: '<mood>'`; that wins.
export const LOOK_MOOD_BY_PROFILE = deepFreeze({
  helios_core: 'arcade',
  core: 'arcade',
  tethys: 'neon_noir',
  belt: 'dust_gold',
  ceres_belt: 'dust_gold',
  vesta_forge: 'forge_heat',
  fringe: 'neon_noir',
  pallas_drift: 'cold_drift',
  sker_haven: 'sodium_yard',
  anomaly: 'void_signal',
});

export function resolveLookMoodId(profile) {
  const direct = profile && typeof profile.look === 'string' ? profile.look : null;
  if (direct && Object.prototype.hasOwnProperty.call(LOOK_MOODS, direct)) return direct;
  const mapped = profile && LOOK_MOOD_BY_PROFILE[profile.id];
  return mapped && Object.prototype.hasOwnProperty.call(LOOK_MOODS, mapped) ? mapped : DEFAULT_LOOK_MOOD;
}

/** A mood with every field present: LOOK_BASE overlaid by the named mood. Frozen. */
const RESOLVED = new Map();
export function resolveLookMood(id) {
  const key = Object.prototype.hasOwnProperty.call(LOOK_MOODS, id) ? id : DEFAULT_LOOK_MOOD;
  let mood = RESOLVED.get(key);
  if (!mood) {
    const over = LOOK_MOODS[key];
    mood = deepFreeze({
      id: key,
      surface: { ...LOOK_BASE.surface, ...(over.surface || {}) },
      post: { ...LOOK_BASE.post, ...(over.post || {}) },
      rig: { ...LOOK_BASE.rig, ...(over.rig || {}) },
    });
    RESOLVED.set(key, mood);
  }
  return mood;
}

/**
 * The light rig a sector runs: the mood's four colours, with the sector profile's authored
 * intensities and any explicit per-channel colour override it carries.
 */
/**
 * The post numbers a sector runs: its profile's exposure and bloom shaping, plus the mood's
 * grade and vignette amounts. A profile that names `grade`/`vignette` itself overrides the mood.
 */
const POST_BY_PROFILE = new WeakMap();
export function resolveLookPost(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const cached = POST_BY_PROFILE.get(profile);
  if (cached) return cached;
  const mood = resolveLookMood(resolveLookMoodId(profile));
  const authored = profile.post || {};
  const post = Object.freeze({
    ...authored,
    grade: Number.isFinite(authored.grade) ? authored.grade : mood.post.grade,
    vignette: Number.isFinite(authored.vignette) ? authored.vignette : mood.post.vignette,
  });
  POST_BY_PROFILE.set(profile, post);
  return post;
}

const LIGHTING_BY_PROFILE = new WeakMap();
export function resolveLookLighting(profile) {
  // One frozen object per profile: the renderer's transition guard compares rigs by identity.
  const cached = profile && typeof profile === 'object' ? LIGHTING_BY_PROFILE.get(profile) : null;
  if (cached) return cached;
  const mood = resolveLookMood(resolveLookMoodId(profile));
  const authored = (profile && profile.lighting) || {};
  const pick = (channel, hex) => (Number.isFinite(authored[channel]) ? authored[channel] : hex);
  const lighting = Object.freeze({
    ambient: authored.ambient,
    key: authored.key,
    rim: authored.rim,
    fill: authored.fill,
    keyColor: pick('keyColor', mood.rig.keyHex),
    rimColor: pick('rimColor', mood.rig.rimHex),
    fillColor: pick('fillColor', mood.rig.fillHex),
    ambientColor: pick('ambientColor', mood.rig.ambientHex),
  });
  if (profile && typeof profile === 'object') LIGHTING_BY_PROFILE.set(profile, lighting);
  return lighting;
}
