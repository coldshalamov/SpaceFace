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

export const LOOK_VERSION = 'spaceface-look-v2';

// The house look. "Arcade daylight": clean warm-white sun, electric cyan edge light,
// ultramarine shadows, saturated paint under a clear coat.
export const LOOK_BASE = deepFreeze({
  surface: {
    // Paint value. 1.0 shows the authored albedo; <1 lifts it toward pastel (the retired
    // Lacquer & Starlight pass shipped 0.80, which is what bleached the fleet).
    // LOOK-04 round-20 sweep (2026-11-13): authored albedo at full value — the lift read as chalk.
    albedoGamma: 1.0,
    // Paint chroma around its own luminance. >1 deepens colour without changing value.
    albedoSaturation: 1.18,
    // Share of form shading replaced by graphic light bands. 0 = physical falloff, 1 = poster.
    // Kept moderate so ships, stations, and enemies share a unified physical PBR light response.
    bandMix: 0.20,
    // Colour of the unlit side and of the lit side (multipliers on diffuse light).
    // Raised shadow floor prevents dark hulls and unlit enemies from vanishing into pitch-black voids.
    // Deep slate-ultramarine shadow floor fights warm solar key for two-color contrast.
    // LOOK-04 sweep: deeper ultramarine on the unlit side so rocks and hulls carry form (ruling 2: blue, not black).
    shadowTint: [0.42, 0.52, 1.00],
    lightTint: [1.12, 1.03, 0.87],
    // Dark contour where the hull turns away from the camera. 0 = none.
    contour: 0.18,
    // Clear coat: a second specular lobe over smooth dielectric paint.
    // Calibrated to give a sleek aerospace finish without creating piercing armor-like glare.
    coat: 0.70,
    coatRoughness: 0.32,
    coatEnv: 0.54,
    // Gain on the coat's sun glint. Kept balanced so glints glisten cleanly without flaring out into white bars.
    coatSun: 0.25,
    // Coat reflectance at the grazing limb (facing reflectance is a fixed lacquer 0.05).
    coatEdge: 0.42,
    coatTint: [1.0, 1.0, 1.0],
    // Edge light: a coloured grazing-angle rim, strongest away from the key.
    rim: [1.00, 0.70, 0.35],
    // LOOK-04 sweep: a wider, brighter rim on every body (LOOK bible: rim on every silhouette).
    rimStrength: 0.60,
    rimPower: 2.6,
    // Rough terrain receives a soft reflected fill and limb light even without lacquer.
    // Only rock-role materials consume these values; black space and hull paint stay put.
    // LOOK-04 sweep: the 0.85 fill flattened every rock into a pale cut-out; 0.45 keeps a shadow side.
    rockFill: 0.25,
    // Scene-linear pigment luminance floor for shadow-weighted rock fill. This lifts authored
    // dark geological faces without changing their hue or texture strata; it is never emission.
    rockFloor: 0.12,
    rockRim: 0.20,
    // Brightest a lit pigment may get (scene-linear luminance). Kept under the bloom
    // threshold of 1.0: paint never emits.
    paintCeiling: 0.72,
    // LOOK-04 two energy bands: everything a lit surface returns that is NOT emission — pigment, local lamp
    // light, rim, clear coat, specular — soft-clips toward this ceiling (scene-linear, measured like the bloom
    // bright-pass). It sits under bloom's knee (threshold 1.0 − knee 0.1), so only authored emission blooms.
    surfaceCeiling: 0.85,
    // Scale on the shared scene IBL (foundry HDRI) as seen by lit hulls, multiplied by each
    // material's authored/role envMapIntensity. three.js ignores material.envMapIntensity when
    // the env comes from scene.environment, so before this the IBL hit every hull at 1.0 and
    // blew pale paint flat (LOOK_UNIFY.md pass 2).
    sceneEnv: 0.32,
  },
  post: {
    // How hard the sector wears the grade below (0 = ungraded) and its corner darkening.
    grade: 0.60,
    vignette: 0.08,
    // Split-tone multipliers for dark and bright pixels.
    shadowTint: [0.85, 0.96, 1.14],
    highlightTint: [1.10, 1.02, 0.89],
    // Contrast around mid-grey (1 = none) and global saturation (1 = none).
    // Slightly lifted to give depth, clean separation against black space and pop on hull forms.
    contrast: 1.02,
    saturation: 1.14,
    // Extra saturation for muted colours only, so skin-of-paint pops without neon clipping.
    vibrance: 0.20,
    // Painted-edge ink and value steps from the retired illustration pass. 0 = clean.
    ink: 0,
    // LOOK-04: blend from the per-channel ACES fit (whitens and desaturates bright colours) toward the Khronos PBR
    // Neutral curve (linear midtones, hue-true highlights). 1 = Neutral (house default since the 2026-11-13 sweep).
    toneNeutral: 1,
    // Colour of bloom spill: subtle electric blue-white aura.
    bloomTint: [1.04, 1.00, 0.94],
    // Corner darkening colour (multiplied in at full vignette): deep cosmic midnight.
    vignetteTint: [0.04, 0.06, 0.14],
  },
  rig: {
    keyHex: 0xffd49a, rimHex: 0xffc477, fillHex: 0x718bd1, ambientHex: 0x394568,
    // Light (owner, 2026-11-11: "too dark, bleak and depressing" — supersedes the 2026-10-20 darkness;
    // the lead chose concept A, a working harbour at golden hour: design/game/look/concepts/). Gains on the
    // sector's authored ambient and fill intensities. The key stays a hard rake and the rim keeps
    // silhouettes, so the side a sun does not reach is left for real lamps to find.
    // LOOK-04 sweep chose 0.65 / 0.55; held at 0.75 / 0.65 so ruling 2 (not bleak) still holds — the rim
    // and the deeper shadow tint carry the form instead of a flat lift.
    ambientGain: 0.75,
    fillGain: 0.65,
  },
});

// Ship headlights: real SpotLights from a fixed pool (src/render/headlights.js). A headlight is
// seen only where it lands on a hull, rock or station; vacuum has nothing to scatter it, so no
// beam geometry is ever drawn. Material-physics-like: the same lamp in every mood.
export const LOOK_HEADLIGHT = deepFreeze({
  // LOOK-04 / LIGHT (2026-11-14): the inverse-square lamp ran ~17x brighter at 25 WU than at 105 WU, so
  // anything near the bow went past the surface ceiling into a flat chalky plateau. A gentler falloff and a
  // much lower intensity keep the pool's centre near the surface knee: warm, textured, shaded rock.
  colorHex: 0xffd6a0,      // warm sodium
  intensity: 2500,         // swept 440-4000 on live rocks (LIGHT 2026-11-17): 2500 reads warm and textured at 130 WU, no chalk
  decay: 1.2,              // art-directed falloff (≈4x across 25–105 WU, not 17x)
  range: 450,              // WU; hard cutoff of the light
  angle: 0.55,             // radians, half-angle of the cone (~32°): a wider pool
  penumbra: 0.9,           // soft-edged pool, no hard disc
  height: 20,              // WU above the play plane: a lamp high on the bow, pitched down
  aimDistance: 105,        // WU ahead of the bow where the beam's axis meets...
  aimHeight: 0,            // ...this height (the play plane), so the pool lands on what is ahead
  noseFactor: 0.7,         // bow offset as a share of the entity radius
  npcReach: 380,           // NPC hulls within this distance of the player may carry a lit lamp
  npcIntensity: 0.75,      // NPC lamp gain relative to the player's
  fadeSeconds: 0.35,       // a lamp hand-off fades out and back in, never pops
  // The bow volume (a NOCTURNE medium, one of its four slots) is OFF: in clear space there is nothing to
  // scatter the lamp, and the volume read on screen as a flat brown fog cone ahead of every ship — the
  // "blurry shit" the owner rejected (design/overhaul/07_LOOK_AND_LIGHT.md §3, 2026-11-18). The lamp is seen
  // where its pool lands on hulls and rock. A beam may only be visible inside real dust or gas, cut by the
  // shadow map (build_map §40 OVH-10); until then density stays 0, which also skips the atmosphere pass.
  beam: { radius: 70, forward: 0.85, yCenter: 8, yRadius: 34, density: 0, anisotropy: 0.5, colorHex: 0xffd6a0 },
});

// Named moods. Only differences from LOOK_BASE.
export const LOOK_MOODS = deepFreeze({
  // Helios, core trade space, Tethys: the bright showroom. Base numbers.
  arcade: {},

  // Frontier / lawless space: dark, magenta against cyan. The cyberpunk end of the dial.
  neon_noir: {
    surface: {
      rockFill: 0.65,
      albedoSaturation: 1.28,
      bandMix: 0.26,
      shadowTint: [0.68, 0.50, 1.16],
      lightTint: [1.10, 0.98, 1.02],
      contour: 0.32,
      coatEnv: 0.70,
      rim: [1.0, 0.16, 0.72],
      rimStrength: 0.70,
      rimPower: 3.2,
    },
    post: {
      shadowTint: [0.88, 0.82, 1.22],
      grade: 0.75, vignette: 0.14,
      highlightTint: [1.10, 0.97, 1.02],
      contrast: 1.08,
      saturation: 1.28,
      vibrance: 0.34,
      ink: 0.12,
      bloomTint: [1.06, 0.92, 1.10],
      vignetteTint: [0.05, 0.01, 0.08],
    },
    rig: { keyHex: 0xffd9ec, rimHex: 0x19e6ff, fillHex: 0xd24bff, ambientHex: 0x2a1f52,
      ambientGain: 0.85, fillGain: 0.75 },
  },

  // Sker Haven: a yard at night under sodium lamps. Amber against deep blue.
  sodium_yard: {
    surface: {
      rockFill: 0.65, // dark moods keep a lower rock floor than the base (neon_noir sits here too)
      bandMix: 0.26,
      shadowTint: [0.55, 0.68, 1.18],
      lightTint: [1.14, 1.0, 0.84],
      contour: 0.30,
      rim: [0.16, 0.74, 1.0],
      rimStrength: 0.65,
    },
    post: {
      shadowTint: [0.80, 0.94, 1.22],
      grade: 0.72, vignette: 0.12,
      highlightTint: [1.14, 1.0, 0.84],
      contrast: 1.07,
      saturation: 1.26,
      ink: 0.10,
      bloomTint: [1.08, 0.98, 0.88],
      vignetteTint: [0.01, 0.02, 0.06],
    },
    rig: { keyHex: 0xffb45e, rimHex: 0x32c8ff, fillHex: 0x3a5cff, ambientHex: 0x1c2a58,
      ambientGain: 0.85, fillGain: 0.75 },
  },

  // Vesta Forge: furnace orange against teal. The classic hot/cold split, pushed.
  forge_heat: {
    surface: {
      shadowTint: [0.52, 0.76, 1.02],
      lightTint: [1.16, 1.0, 0.82],
      rim: [0.10, 0.86, 0.84],
      rimStrength: 0.60,
    },
    post: {
      shadowTint: [0.80, 1.0, 1.12],
      grade: 0.70, vignette: 0.12,
      highlightTint: [1.16, 1.0, 0.84],
      contrast: 1.06,
      bloomTint: [1.10, 0.98, 0.86],
      vignetteTint: [0.05, 0.01, 0.01],
    },
    rig: { keyHex: 0xffc98f, rimHex: 0x2fe0d0, fillHex: 0xd0703a, ambientHex: 0x3a2c34 },
  },

  // Swarm's Ricochet Foundry: dirty steel under a high warm key, with neutral hull fill.
  foundry: {
    surface: {
      shadowTint: [0.78, 0.89, 1.06],
      lightTint: [1.10, 1.01, 0.91],
      rim: [0.45, 0.72, 0.92],
      rimStrength: 0.53,
    },
    post: {
      grade: 0.27, vignette: 0.13,
      highlightTint: [1.08, 1.01, 0.91],
      shadowTint: [0.90, 0.98, 1.06],
      bloomTint: [1.12, 0.95, 0.79],
    },
    rig: { keyHex: 0xffddaf, rimHex: 0x9ec9ed, fillHex: 0xaebdd1, ambientHex: 0x98908b },
  },

  // Pallas Drift: ice. Blue-white key, violet edge, steel shadows, the highest gloss.
  cold_drift: {
    surface: {
      albedoSaturation: 1.18,
      shadowTint: [0.62, 0.68, 1.14],
      lightTint: [0.96, 1.02, 1.10],
      coatRoughness: 0.28,
      coatEnv: 0.68,
      rim: [0.62, 0.42, 1.0],
      rimStrength: 0.58,
    },
    post: {
      shadowTint: [0.86, 0.94, 1.18],
      grade: 0.68, vignette: 0.12,
      highlightTint: [0.98, 1.02, 1.08],
      contrast: 1.05,
      saturation: 1.18,
      bloomTint: [0.96, 1.02, 1.08],
      vignetteTint: [0.01, 0.02, 0.05],
    },
    rig: { keyHex: 0xd9e6ff, rimHex: 0xa880ff, fillHex: 0x6f9cff, ambientHex: 0x27345c },
  },

  // Ceres and the belts: gold dust light against slate teal. Working daylight, warmer and rougher.
  dust_gold: {
    surface: {
      shadowTint: [0.58, 0.72, 1.08],
      lightTint: [1.12, 1.02, 0.88],
      rim: [0.24, 0.72, 0.92],
      rimStrength: 0.52,
    },
    post: {
      shadowTint: [0.84, 0.98, 1.12],
      highlightTint: [1.12, 1.02, 0.88],
      bloomTint: [1.04, 1.0, 0.94],
    },
    rig: { keyHex: 0xffdfae, rimHex: 0x52c4e8, fillHex: 0xb89468, ambientHex: 0x33364e },
  },

  // The anomaly: wrong-coloured light. Violet key, acid-green edge.
  void_signal: {
    surface: {
      rockFill: 0.65, // dark moods keep a lower rock floor than the base (neon_noir sits here too)
      albedoSaturation: 1.28,
      bandMix: 0.28,
      shadowTint: [0.46, 0.82, 0.80],
      lightTint: [1.04, 0.96, 1.12],
      contour: 0.32,
      rim: [0.22, 1.0, 0.56],
      rimStrength: 0.72,
      rimPower: 3.2,
    },
    post: {
      shadowTint: [0.78, 1.04, 1.02],
      grade: 0.75, vignette: 0.14,
      highlightTint: [1.06, 0.96, 1.10],
      contrast: 1.08,
      saturation: 1.26,
      vibrance: 0.34,
      ink: 0.10,
      bloomTint: [0.96, 1.06, 1.04],
      vignetteTint: [0.04, 0.01, 0.07],
    },
    rig: { keyHex: 0xc8b6ff, rimHex: 0x54ffb0, fillHex: 0x4ddc92, ambientHex: 0x2c2a52,
      ambientGain: 0.85, fillGain: 0.75 },
  },

  // PLACES-1 (INV-25 item 2) — the icy fringe (Haumea Rift, Eris Margin, Nereid Shoal): pale
  // blue-white ice light, a mint-teal edge, steel-violet shadows. Sits between cold_drift's
  // violet-edged showroom ice and the fringe's magenta neon: the same dark sky, but colder,
  // quieter and paler — ice under a thin sky, not lacquer under lamps.
  pale_ice: {
    surface: {
      albedoSaturation: 1.14,
      shadowTint: [0.60, 0.70, 1.16],
      lightTint: [0.94, 1.00, 1.12],
      coatRoughness: 0.26,
      coatEnv: 0.70,
      rim: [0.56, 0.92, 0.86],
      rimStrength: 0.62,
      rimPower: 2.8,
    },
    post: {
      shadowTint: [0.84, 0.96, 1.20],
      grade: 0.62, vignette: 0.12,
      highlightTint: [0.96, 1.02, 1.10],
      contrast: 1.04,
      saturation: 1.12,
      bloomTint: [0.97, 1.03, 1.08],
      vignetteTint: [0.01, 0.02, 0.05],
    },
    rig: { keyHex: 0xe8f2ff, rimHex: 0x8fe0cf, fillHex: 0x8fb0d8, ambientHex: 0x24304c,
      ambientGain: 0.80, fillGain: 0.70 },
  },

  // PLACES-1 (INV-25 items 1+2) — Ashfall Reach: a dull ember key against a cold ash-teal edge.
  // The two hues are the sector's fiction: the Roaming Burn's glow against the gray that buries
  // everything else. Darker and grimier than forge_heat's furnace (no warm floor bounce — the
  // ground here is ash, not smelter glare), with the burnt contour and ink the scoured hulls keep.
  ember_ash: {
    surface: {
      rockFill: 0.55, // dark moods keep a lower rock floor than the base (neon_noir sits here too)
      bandMix: 0.24,
      shadowTint: [0.66, 0.72, 1.06],
      lightTint: [1.14, 0.98, 0.86],
      contour: 0.28,
      rim: [0.30, 0.84, 0.88],
      rimStrength: 0.66,
      rimPower: 3.0,
    },
    post: {
      shadowTint: [0.82, 0.92, 1.10],
      grade: 0.72, vignette: 0.14,
      highlightTint: [1.14, 0.99, 0.86],
      contrast: 1.07,
      saturation: 1.22,
      vibrance: 0.26,
      ink: 0.08,
      bloomTint: [1.10, 0.97, 0.90],
      vignetteTint: [0.04, 0.01, 0.02],
    },
    rig: { keyHex: 0xff9d62, rimHex: 0x54c8cf, fillHex: 0x6f5148, ambientHex: 0x2c2026,
      ambientGain: 0.85, fillGain: 0.75 },
  },
});

// Emissive gain, applied once when a Forge material is admitted. Light is part of the ship:
// a nav light or neon strip is a few pixels at the chase camera, and only a source well above
// the bloom threshold spills far enough to read as a lamp instead of paint. Point lamps and
// trim get the most. Window rows (`glow_warm`) are many and broad: lifted as hard, a lit
// liner hides its own hull behind a white haze, so they get just enough to read as lit glass.
// Keyed by Forge finish first, material role second. This is material physics, so it is the
// same in every mood.
export const LOOK_EMISSIVE_GAIN = Object.freeze({
  finish: Object.freeze({ glow_warm: 1.2, glow_drive: 1.5, glow_trim: 0.8 }),
  role: Object.freeze({ signal: 2.2, drive: 1.5 }),
});

export function resolveLookEmissiveGain(role, forgeFinish) {
  const finish = String(forgeFinish || '').split('.')[0];
  if (Object.prototype.hasOwnProperty.call(LOOK_EMISSIVE_GAIN.finish, finish)) return LOOK_EMISSIVE_GAIN.finish[finish];
  return LOOK_EMISSIVE_GAIN.role[role] || 1;
}

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
  // Dione Lane's apron is the same grammar as Sker's yard — working ground under lamps,
  // deep blue shadow — graded by its own rig tints, not a new mood.
  dione_lane: 'sodium_yard',
  anomaly: 'void_signal',
  // PLACES-1 (INV-25 items 1+2) — the story sectors' own rigs keep their family's frame but
  // wear a light the family does not: the Reach works gold-dust daylight (a parcel frontier, not
  // neon noir), the Expanse reads as the cold belt its barks describe, and Ashfall runs the
  // burn. The icy-fringe family profile carries pale_ice.
  io_reach: 'dust_gold',
  charon_expanse: 'cold_drift',
  ashfall_reach: 'ember_ash',
  pale_ice: 'pale_ice',
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
function gained(value, gain) {
  return Number.isFinite(value) ? value * (Number.isFinite(gain) ? gain : 1) : value;
}

export const FOUNDRY_LIGHT = deepFreeze({
  keyOffset: { x: -195, y: 425, z: -316 },
  shadowExtent: 515,
  shadowFar: 1050,
  rig: { key: 1.55, rim: 0.66, fill: 0.52, ambient: 0.36 },
  furnaceCore: 0xff8638,
  lampCore: 0xffd5a0,
  furnace: { color: 0xff8439, intensity: 4200, range: 118, priority: 3 },
  workLamp: { color: 0xffbc87, intensity: 2350, range: 107, priority: 2 },
});

export function resolveLookLighting(profile) {
  // One frozen object per profile: the renderer's transition guard compares rigs by identity.
  const cached = profile && typeof profile === 'object' ? LIGHTING_BY_PROFILE.get(profile) : null;
  if (cached) return cached;
  const mood = resolveLookMood(resolveLookMoodId(profile));
  const authored = (profile && profile.lighting) || {};
  const pick = (channel, hex) => (Number.isFinite(authored[channel]) ? authored[channel] : hex);
  const lighting = Object.freeze({
    ambient: gained(authored.ambient, mood.rig.ambientGain),
    key: authored.key,
    rim: authored.rim,
    fill: gained(authored.fill, mood.rig.fillGain),
    keyColor: pick('keyColor', mood.rig.keyHex),
    rimColor: pick('rimColor', mood.rig.rimHex),
    fillColor: pick('fillColor', mood.rig.fillHex),
    ambientColor: pick('ambientColor', mood.rig.ambientHex),
  });
  if (profile && typeof profile === 'object') LIGHTING_BY_PROFILE.set(profile, lighting);
  return lighting;
}
