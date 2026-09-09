/**
 * Live propulsion-family recipes (VP-220).
 *
 * Preserves the accepted Kestrel/Hitch ion substrate as `engine_ion_small`, then
 * differentiates every shipped ENGINE_PROFILES family by structure, timing and
 * layer balance — not tint alone. Shared textures keep the deterministic pack;
 * geometry/identity/throttle curves carry family identity.
 */

import {
  KESTREL_MAIN_PLUME_RECIPE,
  KESTREL_RCS_RECIPE,
} from './kestrelRecipes.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

/**
 * Build a continuous plume recipe from the accepted Kestrel substrate + family deltas.
 * @param {object} delta
 */
function buildMainRecipe(delta) {
  const r = clone(KESTREL_MAIN_PLUME_RECIPE);
  r.id = delta.id;
  r.engineFamily = delta.engineFamily;
  r.displayName = delta.displayName;
  r.notes = delta.notes;
  if (delta.geometry) Object.assign(r.geometry, delta.geometry);
  if (delta.throttle) {
    for (const [key, curve] of Object.entries(delta.throttle)) {
      if (key === 'idle') r.throttle.idle = curve;
      else if (curve && typeof curve === 'object') Object.assign(r.throttle[key], curve);
    }
  }
  if (delta.timing) Object.assign(r.timing, delta.timing);
  if (delta.eventLight) Object.assign(r.eventLight, delta.eventLight);
  if (delta.flowCharacter) Object.assign(r.identity.flowCharacter, delta.flowCharacter);
  if (delta.geometryCharacter) Object.assign(r.identity.geometryCharacter, delta.geometryCharacter);
  if (delta.timingCharacter) Object.assign(r.identity.timingCharacter, delta.timingCharacter);
  if (delta.layeringCharacter) Object.assign(r.identity.layeringCharacter, delta.layeringCharacter);
  if (delta.layerColors) {
    for (const layer of r.layers) {
      if (delta.layerColors[layer.role]) layer.colorHex = delta.layerColors[layer.role];
    }
  }
  if (delta.layerScales) {
    for (const layer of r.layers) {
      const s = delta.layerScales[layer.role];
      if (!s) continue;
      if (s.widthScale != null) layer.widthScale = s.widthScale;
      if (s.lengthScale != null) layer.lengthScale = s.lengthScale;
      if (s.intensity != null) layer.intensity = s.intensity;
      if (s.opacity != null) layer.opacity = s.opacity;
      if (s.scrollSpeed != null) layer.scrollSpeed = s.scrollSpeed;
    }
  }
  if (delta.liveSeams) Object.assign(r.liveSeams, delta.liveSeams);
  // Continuum modes (idle/accel/cruise/boost/brake) are structural, not tint-only.
  r.continuum = deepFreeze({
    idle: { driveFloor: r.throttle.idle, lengthMul: 0.55, flowMul: 0.55, coreBias: 0.12 },
    accel: { lengthMul: 1.0, widthMul: 1.0, turbulenceMul: 1.05, flowMul: 1.1 },
    cruise: { lengthMul: 1.12, widthMul: 0.92, turbulenceMul: 0.88, flowMul: 1.18, coreBias: 0.08 },
    boost: { lengthMul: 1.35, widthMul: 1.18, turbulenceMul: 1.22, flowMul: 1.4, structuralDrive: 1 },
    brake: { lengthMul: 0.42, widthMul: 0.78, turbulenceMul: 0.55, flowMul: 0.35, coreBias: -0.18 },
    reverse: { lengthMul: 0.0, mainSuppressed: true },
    ...(delta.continuum || {}),
  });
  return deepFreeze(r);
}

function buildRcsRecipe(delta) {
  const r = clone(KESTREL_RCS_RECIPE);
  r.id = delta.id;
  r.engineFamily = delta.engineFamily;
  r.displayName = delta.displayName;
  r.notes = delta.notes;
  if (delta.geometry) Object.assign(r.geometry, delta.geometry);
  if (delta.throttle) {
    for (const [key, curve] of Object.entries(delta.throttle)) {
      if (key === 'idle') r.throttle.idle = curve;
      else if (curve && typeof curve === 'object') Object.assign(r.throttle[key], curve);
    }
  }
  if (delta.timing) Object.assign(r.timing, delta.timing);
  if (delta.eventLight) Object.assign(r.eventLight, delta.eventLight);
  if (delta.flowCharacter) Object.assign(r.identity.flowCharacter, delta.flowCharacter);
  if (delta.geometryCharacter) Object.assign(r.identity.geometryCharacter, delta.geometryCharacter);
  if (delta.timingCharacter) Object.assign(r.identity.timingCharacter, delta.timingCharacter);
  if (delta.layeringCharacter) Object.assign(r.identity.layeringCharacter, delta.layeringCharacter);
  if (delta.layerColors) {
    for (const layer of r.layers) {
      if (delta.layerColors[layer.role]) layer.colorHex = delta.layerColors[layer.role];
    }
  }
  if (delta.layerScales) {
    for (const layer of r.layers) {
      const s = delta.layerScales[layer.role];
      if (!s) continue;
      if (s.widthScale != null) layer.widthScale = s.widthScale;
      if (s.lengthScale != null) layer.lengthScale = s.lengthScale;
      if (s.intensity != null) layer.intensity = s.intensity;
      if (s.opacity != null) layer.opacity = s.opacity;
      if (s.scrollSpeed != null) layer.scrollSpeed = s.scrollSpeed;
    }
  }
  if (delta.liveSeams) Object.assign(r.liveSeams, delta.liveSeams);
  return deepFreeze(r);
}

// ── engine_ion_small (accepted Kestrel substrate — identity preserved) ────────

export const ION_SMALL_MAIN_PLUME_RECIPE = KESTREL_MAIN_PLUME_RECIPE;
export const ION_SMALL_RCS_RECIPE = KESTREL_RCS_RECIPE;

// Continuum table for the accepted substrate (attached without mutating frozen kestrel export).
export const ION_SMALL_CONTINUUM = deepFreeze({
  idle: { driveFloor: 0.06, lengthMul: 0.55, flowMul: 0.55, coreBias: 0.12 },
  accel: { lengthMul: 1.0, widthMul: 1.0, turbulenceMul: 1.05, flowMul: 1.1 },
  cruise: { lengthMul: 1.12, widthMul: 0.92, turbulenceMul: 0.88, flowMul: 1.18, coreBias: 0.08 },
  boost: { lengthMul: 1.35, widthMul: 1.18, turbulenceMul: 1.22, flowMul: 1.4, structuralDrive: 1 },
  brake: { lengthMul: 0.42, widthMul: 0.78, turbulenceMul: 0.55, flowMul: 0.35, coreBias: -0.18 },
  reverse: { lengthMul: 0.0, mainSuppressed: true },
});

// ── engine_ion_twin — paired ion: slightly longer, dual-fork, cooler sheath ──

export const ION_TWIN_MAIN_PLUME_RECIPE = buildMainRecipe({
  id: 'family_ion_twin_main_plume',
  engineFamily: 'ion_twin',
  displayName: 'Twin-ion main thruster plume',
  notes: 'Paired ion stream: higher fork/anisotropy and length, not a recolor of ion_small.',
  geometry: { baseLength: 12.4, baseWidth: 2.85, segmentCount: 8, taper: 0.68 },
  layerColors: {
    core: '#f2fbff',
    inner: '#42d4ff',
    sheath: '#6888ff',
    vapor: '#2a4a78',
    distortion: '#a0d4ff',
  },
  layerScales: {
    core: { widthScale: 0.42, lengthScale: 0.34, intensity: 6.5 },
    inner: { widthScale: 0.86, lengthScale: 0.9, scrollSpeed: 2.45 },
    sheath: { widthScale: 1.62, lengthScale: 1.22, intensity: 2.35 },
    vapor: { widthScale: 2.05, lengthScale: 1.65 },
  },
  flowCharacter: { swirl: 0.5, fork: 0.62, noiseScale: 1.55, baseFlow: 2.8, anisotropy: 2.05 },
  geometryCharacter: { taper: 0.68, mouthBreak: 0.42, axialFill: 0.78 },
  timingCharacter: { driveRise: 10.2, driveFall: 4.0, boostRise: 9.0, boostFall: 3.4 },
  layeringCharacter: {
    coreDominance: 0.74,
    boostLengthGain: { core: 0.3, inner: 0.68, sheath: 0.96, vapor: 1.15 },
    boostWidthGain: { core: 0.12, inner: 0.28, sheath: 0.48, vapor: 0.58 },
    boostStructuralDrive: 0.2,
  },
  throttle: {
    length: { at0: 0.3, at1: 1.08, exp: 0.82 },
    width: { at0: 0.4, at1: 1.08, exp: 0.88 },
    turbulence: { at0: 0.28, at1: 1.22, exp: 1.05 },
    flowSpeed: { at0: 0.5, at1: 1.42, exp: 0.78 },
  },
  liveSeams: { engineProfileId: 'engine_ion_twin', shipIds: ['ship_pelican', 'ship_ironback'] },
});

export const ION_TWIN_RCS_RECIPE = buildRcsRecipe({
  id: 'family_ion_twin_rcs_impulse',
  engineFamily: 'ion_twin',
  displayName: 'Twin-ion RCS impulse',
  notes: 'Slightly longer twin-family RCS with paired-fork character; still impulse_burst.',
  geometry: { baseLength: 4.1, baseWidth: 1.95, taper: 0.52 },
  layerColors: { core: '#f2fbff', inner: '#54c4f4', sheath: '#3058a8', vapor: '#24395b' },
  flowCharacter: { swirl: 0.22, fork: 0.34, noiseScale: 1.15, baseFlow: 4.4, anisotropy: 2.7 },
  geometryCharacter: { taper: 0.52, mouthBreak: 0.18, axialFill: 0.94, lateralKick: 0.38 },
  timing: { attack: 0.02, sustain: 0.05, release: 0.16 },
  liveSeams: { engineProfileId: 'engine_ion_twin' },
});

// ── engine_industrial — wide, slow, turbulent torch ──────────────────────────

export const INDUSTRIAL_MAIN_PLUME_RECIPE = buildMainRecipe({
  id: 'family_industrial_main_plume',
  engineFamily: 'industrial',
  displayName: 'Industrial torch main plume',
  notes: 'Wide slow torch with high turbulence and amber pressure zones — structure, not recolor.',
  geometry: { baseLength: 13.2, baseWidth: 3.85, segmentCount: 7, taper: 0.58, aspect: 'stream' },
  layerColors: {
    core: '#fff4e0',
    inner: '#ff9a44',
    sheath: '#5c3018',
    vapor: '#3a2414',
    distortion: '#ffd0a0',
  },
  layerScales: {
    core: { widthScale: 0.58, lengthScale: 0.28, intensity: 5.8, scrollSpeed: 1.9 },
    inner: { widthScale: 1.05, lengthScale: 0.78, intensity: 3.9, scrollSpeed: 1.55 },
    sheath: { widthScale: 2.15, lengthScale: 1.28, intensity: 2.0, scrollSpeed: 1.05 },
    vapor: { widthScale: 2.55, lengthScale: 1.72, intensity: 0.95, opacity: 0.38 },
  },
  flowCharacter: { swirl: 0.7, fork: 0.85, noiseScale: 2.1, baseFlow: 1.9, anisotropy: 1.35 },
  geometryCharacter: { taper: 0.58, mouthBreak: 0.55, axialFill: 0.7 },
  timingCharacter: { driveRise: 7.2, driveFall: 3.2, boostRise: 6.5, boostFall: 2.8 },
  layeringCharacter: {
    coreDominance: 0.62,
    boostLengthGain: { core: 0.28, inner: 0.55, sheath: 1.05, vapor: 1.25 },
    boostWidthGain: { core: 0.22, inner: 0.4, sheath: 0.7, vapor: 0.85 },
    boostStructuralDrive: 0.22,
  },
  throttle: {
    idle: 0.08,
    length: { at0: 0.32, at1: 1.18, exp: 0.9 },
    width: { at0: 0.5, at1: 1.32, exp: 0.85 },
    turbulence: { at0: 0.4, at1: 1.45, exp: 1.15 },
    coreSheathBalance: { at0: 0.45, at1: 1.1, exp: 0.8 },
    dissipation: { at0: 0.5, at1: 1.35, exp: 1.05 },
    flowSpeed: { at0: 0.35, at1: 1.05, exp: 0.9 },
  },
  eventLight: { maxIntensity: 2.4, maxRange: 14, color: '#ffb35c' },
  continuum: {
    idle: { driveFloor: 0.08, lengthMul: 0.6, flowMul: 0.45, coreBias: 0.1 },
    cruise: { lengthMul: 1.08, widthMul: 1.05, turbulenceMul: 0.95, flowMul: 0.95 },
    boost: { lengthMul: 1.28, widthMul: 1.32, turbulenceMul: 1.35, flowMul: 1.25 },
  },
  liveSeams: { engineProfileId: 'engine_industrial', shipIds: ['ship_mule', 'ship_atlas'] },
});

export const INDUSTRIAL_RCS_RECIPE = buildRcsRecipe({
  id: 'family_industrial_rcs_impulse',
  engineFamily: 'industrial',
  displayName: 'Industrial RCS impulse',
  notes: 'Broader, slower RCS puff-jet for industrial drives; still short impulse_burst.',
  geometry: { baseLength: 3.9, baseWidth: 2.35, taper: 0.48, aspect: 'jet' },
  layerColors: { core: '#fff0d8', inner: '#ffb35c', sheath: '#5c3018', vapor: '#2a1810' },
  layerScales: {
    core: { widthScale: 0.7, lengthScale: 0.52 },
    sheath: { widthScale: 1.28, lengthScale: 1.12 },
  },
  flowCharacter: { swirl: 0.35, fork: 0.45, noiseScale: 1.6, baseFlow: 3.2, anisotropy: 2.1 },
  geometryCharacter: { taper: 0.48, mouthBreak: 0.28, axialFill: 0.88, lateralKick: 0.42 },
  timing: { attack: 0.028, sustain: 0.07, release: 0.2 },
  timingCharacter: { driveRise: 18.0, driveFall: 10.0, oneShot: true },
  liveSeams: { engineProfileId: 'engine_industrial' },
});

// ── engine_resonator — high swirl/noise gravimetric field drive ──────────────

export const RESONATOR_MAIN_PLUME_RECIPE = buildMainRecipe({
  id: 'family_resonator_main_plume',
  engineFamily: 'resonator',
  displayName: 'Resonator field main plume',
  notes: 'High swirl/noise field stream with violet core and teal sheath — timing and flow, not tint alone.',
  geometry: { baseLength: 12.0, baseWidth: 3.25, segmentCount: 9, taper: 0.7 },
  layerColors: {
    core: '#f0e8ff',
    inner: '#7a58ff',
    sheath: '#2ad4aa',
    vapor: '#1a3850',
    distortion: '#c8a8ff',
  },
  layerScales: {
    core: { widthScale: 0.5, lengthScale: 0.36, intensity: 7.2, scrollSpeed: 3.2 },
    inner: { widthScale: 0.95, lengthScale: 0.88, intensity: 4.4, scrollSpeed: 2.7 },
    sheath: { widthScale: 1.9, lengthScale: 1.2, intensity: 2.8, scrollSpeed: 1.7 },
    vapor: { widthScale: 2.3, lengthScale: 1.55 },
  },
  flowCharacter: { swirl: 1.15, fork: 0.55, noiseScale: 2.8, baseFlow: 3.1, anisotropy: 1.65 },
  geometryCharacter: { taper: 0.7, mouthBreak: 0.48, axialFill: 0.75 },
  timingCharacter: { driveRise: 11.5, driveFall: 5.5, boostRise: 10.0, boostFall: 4.2 },
  layeringCharacter: {
    coreDominance: 0.8,
    boostLengthGain: { core: 0.36, inner: 0.7, sheath: 0.9, vapor: 1.05 },
    boostWidthGain: { core: 0.16, inner: 0.32, sheath: 0.55, vapor: 0.62 },
    boostStructuralDrive: 0.24,
  },
  throttle: {
    length: { at0: 0.26, at1: 1.12, exp: 0.78 },
    width: { at0: 0.44, at1: 1.2, exp: 0.92 },
    turbulence: { at0: 0.35, at1: 1.4, exp: 1.2 },
    flowSpeed: { at0: 0.55, at1: 1.55, exp: 0.75 },
    coreSheathBalance: { at0: 0.6, at1: 1.3, exp: 0.7 },
  },
  eventLight: { maxIntensity: 3.0, maxRange: 13, color: '#8d66ff' },
  continuum: {
    cruise: { lengthMul: 1.15, widthMul: 0.88, turbulenceMul: 1.1, flowMul: 1.25 },
    boost: { lengthMul: 1.4, widthMul: 1.12, turbulenceMul: 1.4, flowMul: 1.55 },
  },
  liveSeams: { engineProfileId: 'engine_resonator' },
});

export const RESONATOR_RCS_RECIPE = buildRcsRecipe({
  id: 'family_resonator_rcs_impulse',
  engineFamily: 'resonator',
  displayName: 'Resonator RCS impulse',
  notes: 'Fast field-kick RCS with high swirl; short envelope, high anisotropy.',
  geometry: { baseLength: 4.0, baseWidth: 1.9, taper: 0.6 },
  layerColors: { core: '#f4ecff', inner: '#9a7cff', sheath: '#2ad4aa', vapor: '#1a3048' },
  flowCharacter: { swirl: 0.55, fork: 0.4, noiseScale: 2.0, baseFlow: 5.0, anisotropy: 2.9 },
  geometryCharacter: { taper: 0.6, mouthBreak: 0.2, axialFill: 0.96, lateralKick: 0.48 },
  timing: { attack: 0.018, sustain: 0.045, release: 0.15 },
  timingCharacter: { driveRise: 28.0, driveFall: 16.0, oneShot: true },
  liveSeams: { engineProfileId: 'engine_resonator' },
});

// ── engine_vector — narrow, long, fast reaction stream ───────────────────────

export const VECTOR_MAIN_PLUME_RECIPE = buildMainRecipe({
  id: 'family_vector_main_plume',
  engineFamily: 'vector',
  displayName: 'Vector reaction main plume',
  notes: 'Needle stream: low swirl, high length/anisotropy, fast flow — interceptor identity.',
  geometry: { baseLength: 14.5, baseWidth: 2.35, segmentCount: 9, taper: 0.82, aspect: 'stream' },
  layerColors: {
    core: '#f8fcff',
    inner: '#28b8ff',
    sheath: '#1848a8',
    vapor: '#102848',
    distortion: '#90d8ff',
  },
  layerScales: {
    core: { widthScale: 0.34, lengthScale: 0.4, intensity: 7.8, scrollSpeed: 3.6 },
    inner: { widthScale: 0.7, lengthScale: 0.95, intensity: 4.6, scrollSpeed: 3.0 },
    sheath: { widthScale: 1.35, lengthScale: 1.35, intensity: 2.4, scrollSpeed: 1.85 },
    vapor: { widthScale: 1.7, lengthScale: 1.7, intensity: 0.75, opacity: 0.28 },
  },
  flowCharacter: { swirl: 0.3, fork: 0.3, noiseScale: 1.2, baseFlow: 3.4, anisotropy: 2.4 },
  geometryCharacter: { taper: 0.82, mouthBreak: 0.22, axialFill: 0.9 },
  timingCharacter: { driveRise: 12.5, driveFall: 5.0, boostRise: 11.0, boostFall: 4.0 },
  layeringCharacter: {
    coreDominance: 0.88,
    boostLengthGain: { core: 0.4, inner: 0.75, sheath: 1.05, vapor: 1.2 },
    boostWidthGain: { core: 0.1, inner: 0.22, sheath: 0.4, vapor: 0.5 },
    boostStructuralDrive: 0.16,
  },
  throttle: {
    idle: 0.05,
    length: { at0: 0.24, at1: 1.2, exp: 0.8 },
    width: { at0: 0.35, at1: 0.95, exp: 0.95 },
    turbulence: { at0: 0.18, at1: 0.95, exp: 1.0 },
    flowSpeed: { at0: 0.6, at1: 1.6, exp: 0.72 },
    coreSheathBalance: { at0: 0.65, at1: 1.35, exp: 0.7 },
  },
  eventLight: { maxIntensity: 2.6, maxRange: 11, color: '#39d0ff' },
  continuum: {
    idle: { driveFloor: 0.05, lengthMul: 0.5, flowMul: 0.6, coreBias: 0.15 },
    cruise: { lengthMul: 1.2, widthMul: 0.85, turbulenceMul: 0.8, flowMul: 1.3 },
    boost: { lengthMul: 1.5, widthMul: 1.05, turbulenceMul: 1.1, flowMul: 1.65 },
  },
  liveSeams: { engineProfileId: 'engine_vector', shipIds: ['ship_wasp', 'ship_hornet'] },
});

export const VECTOR_RCS_RECIPE = buildRcsRecipe({
  id: 'family_vector_rcs_impulse',
  engineFamily: 'vector',
  displayName: 'Vector RCS impulse',
  notes: 'Sharp needle RCS: high anisotropy, short life, minimal sheath.',
  geometry: { baseLength: 4.5, baseWidth: 1.7, taper: 0.62, aspect: 'jet' },
  layerColors: { core: '#f8fcff', inner: '#39d0ff', sheath: '#1848a8', vapor: '#102848' },
  layerScales: {
    core: { widthScale: 0.48, lengthScale: 0.65, intensity: 7.5 },
    sheath: { widthScale: 0.95, lengthScale: 1.0, intensity: 1.3 },
  },
  flowCharacter: { swirl: 0.12, fork: 0.18, noiseScale: 0.95, baseFlow: 5.2, anisotropy: 3.2 },
  geometryCharacter: { taper: 0.62, mouthBreak: 0.1, axialFill: 0.98, lateralKick: 0.28 },
  timing: { attack: 0.016, sustain: 0.04, release: 0.14 },
  timingCharacter: { driveRise: 30.0, driveFall: 18.0, oneShot: true },
  liveSeams: { engineProfileId: 'engine_vector' },
});

// ── engine_plasma_ring — wide high-energy plasma ─────────────────────────────

export const PLASMA_RING_MAIN_PLUME_RECIPE = buildMainRecipe({
  id: 'family_plasma_ring_main_plume',
  engineFamily: 'plasma_ring',
  displayName: 'Plasma-ring main plume',
  notes: 'Wide high-energy plasma with strong fork and pink sheath — capital drive structure.',
  geometry: { baseLength: 15.5, baseWidth: 4.2, segmentCount: 10, taper: 0.55 },
  layerColors: {
    core: '#fff0ff',
    inner: '#b060ff',
    sheath: '#ff6090',
    vapor: '#3a1840',
    distortion: '#f0d0ff',
  },
  layerScales: {
    core: { widthScale: 0.55, lengthScale: 0.38, intensity: 8.2, scrollSpeed: 2.4 },
    inner: { widthScale: 1.1, lengthScale: 0.9, intensity: 5.0, scrollSpeed: 2.0 },
    sheath: { widthScale: 2.35, lengthScale: 1.4, intensity: 3.2, scrollSpeed: 1.3 },
    vapor: { widthScale: 2.85, lengthScale: 1.85, intensity: 1.1, opacity: 0.36 },
  },
  flowCharacter: { swirl: 1.0, fork: 0.9, noiseScale: 2.4, baseFlow: 2.2, anisotropy: 1.45 },
  geometryCharacter: { taper: 0.55, mouthBreak: 0.6, axialFill: 0.68 },
  timingCharacter: { driveRise: 8.0, driveFall: 3.5, boostRise: 7.0, boostFall: 3.0 },
  layeringCharacter: {
    coreDominance: 0.7,
    boostLengthGain: { core: 0.32, inner: 0.65, sheath: 1.1, vapor: 1.3 },
    boostWidthGain: { core: 0.2, inner: 0.42, sheath: 0.75, vapor: 0.9 },
    boostStructuralDrive: 0.26,
  },
  throttle: {
    idle: 0.07,
    length: { at0: 0.3, at1: 1.25, exp: 0.88 },
    width: { at0: 0.48, at1: 1.4, exp: 0.86 },
    turbulence: { at0: 0.38, at1: 1.5, exp: 1.18 },
    flowSpeed: { at0: 0.4, at1: 1.25, exp: 0.85 },
    coreSheathBalance: { at0: 0.5, at1: 1.2, exp: 0.78 },
    dissipation: { at0: 0.45, at1: 1.4, exp: 1.08 },
  },
  eventLight: { maxIntensity: 3.4, maxRange: 18, color: '#c878ff' },
  continuum: {
    idle: { driveFloor: 0.07, lengthMul: 0.58, flowMul: 0.5, coreBias: 0.1 },
    cruise: { lengthMul: 1.1, widthMul: 1.05, turbulenceMul: 0.95, flowMul: 1.05 },
    boost: { lengthMul: 1.42, widthMul: 1.35, turbulenceMul: 1.45, flowMul: 1.35 },
  },
  liveSeams: {
    engineProfileId: 'engine_plasma_ring',
    shipIds: ['ship_bastion', 'ship_warden', 'ship_colossus', 'ship_leviathan'],
  },
});

export const PLASMA_RING_RCS_RECIPE = buildRcsRecipe({
  id: 'family_plasma_ring_rcs_impulse',
  engineFamily: 'plasma_ring',
  displayName: 'Plasma-ring RCS impulse',
  notes: 'Broader plasma RCS pulse; still short directional impulse, not miniature main.',
  geometry: { baseLength: 4.2, baseWidth: 2.25, taper: 0.5 },
  layerColors: { core: '#fff0ff', inner: '#d8a0ff', sheath: '#ff6090', vapor: '#3a1840' },
  layerScales: {
    core: { widthScale: 0.65, lengthScale: 0.55, intensity: 7.4 },
    sheath: { widthScale: 1.25, lengthScale: 1.15, intensity: 1.7 },
  },
  flowCharacter: { swirl: 0.45, fork: 0.55, noiseScale: 1.8, baseFlow: 3.8, anisotropy: 2.3 },
  geometryCharacter: { taper: 0.5, mouthBreak: 0.3, axialFill: 0.9, lateralKick: 0.4 },
  timing: { attack: 0.024, sustain: 0.06, release: 0.19 },
  timingCharacter: { driveRise: 20.0, driveFall: 12.0, oneShot: true },
  liveSeams: { engineProfileId: 'engine_plasma_ring' },
});

/** Canonical continuum for recipes that carry no embedded continuum (frozen kestrel). */
export function continuumForRecipe(recipe) {
  if (recipe && recipe.continuum) return recipe.continuum;
  if (recipe && (recipe.engineFamily === 'hitch_ion_kestrel' || recipe.id === 'hitch_kestrel_main_plume')) {
    return ION_SMALL_CONTINUUM;
  }
  return ION_SMALL_CONTINUUM;
}
