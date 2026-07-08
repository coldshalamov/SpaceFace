// Additive presentation-audio signature recipes. These are pure data/helpers for
// backend checks and future adapters; shipped SG-08 recipes stay untouched.

export const SIGNATURE_RECIPE_VERSION = 1;

export const SIGNATURE_AUDIO_CUE_BY_ID = Object.freeze({
  'tether.strain': 'presentation.tether.strain',
  'sensor.scan': 'presentation.sensor.scan',
  'sensor.lock': 'presentation.sensor.lock',
});

export const TETHER_STRAIN_BUCKETS = Object.freeze([
  Object.freeze({
    id: 'low',
    minDerivativePerSecond: -Infinity,
    maxDerivativePerSecond: 0.18,
    playbackRate: 0.92,
    gain: 0.18,
    importance: 0.42,
  }),
  Object.freeze({
    id: 'medium',
    minDerivativePerSecond: 0.18,
    maxDerivativePerSecond: 0.45,
    playbackRate: 1.08,
    gain: 0.31,
    importance: 0.56,
  }),
  Object.freeze({
    id: 'high',
    minDerivativePerSecond: 0.45,
    maxDerivativePerSecond: Infinity,
    playbackRate: 1.26,
    gain: 0.46,
    importance: 0.68,
  }),
]);

export const SIGNATURE_RECIPES = Object.freeze({
  'tether.strain': freezeSignature({
    id: 'tether.strain',
    audioId: SIGNATURE_AUDIO_CUE_BY_ID['tether.strain'],
    material: 'massline',
    mode: 'continuous',
    sourceEvent: 'tether:strain',
    importance: 0.64,
    playerRelevance: 0.88,
    budgets: { voices: 1, draw: 0, voice: 0, spawn: 0 },
    tags: ['tether', 'strain', 'signature'],
    buckets: TETHER_STRAIN_BUCKETS,
    layersWith: ['tether.near_break'],
  }),
  'sensor.scan': freezeSignature({
    id: 'sensor.scan',
    audioId: SIGNATURE_AUDIO_CUE_BY_ID['sensor.scan'],
    material: 'sensor',
    mode: 'one-shot',
    sourceEvent: 'scan:pulse',
    importance: 0.5,
    playerRelevance: 0.62,
    budgets: { voices: 1, draw: 0, voice: 0, spawn: 0 },
    tags: ['sensor', 'scan', 'signature'],
    tones: [
      { offsetMs: 0, playbackRate: 0.86, gain: 0.18 },
      { offsetMs: 120, playbackRate: 1.02, gain: 0.14 },
    ],
  }),
  'sensor.lock': freezeSignature({
    id: 'sensor.lock',
    audioId: SIGNATURE_AUDIO_CUE_BY_ID['sensor.lock'],
    material: 'sensor',
    mode: 'one-shot',
    sourceEvent: 'scan:pulse',
    importance: 0.82,
    playerRelevance: 0.95,
    budgets: { voices: 1, draw: 0, voice: 0, spawn: 0 },
    tags: ['sensor', 'lock', 'signature', 'warning'],
    tones: [
      { offsetMs: 0, playbackRate: 1.08, gain: 0.28 },
      { offsetMs: 90, playbackRate: 1.38, gain: 0.36 },
    ],
  }),
});

export function getSignatureRecipe(id) {
  return SIGNATURE_RECIPES[id] || null;
}

export function tetherStrainDerivative(previousStrain, currentStrain, dtSeconds) {
  const dt = Math.max(1 / 60, finite(dtSeconds, 1 / 60));
  return (clampStrain(currentStrain) - clampStrain(previousStrain)) / dt;
}

export function bucketTetherStrainDerivative(derivativePerSecond) {
  const derivative = finite(derivativePerSecond, 0);
  for (const bucket of TETHER_STRAIN_BUCKETS) {
    if (derivative >= bucket.minDerivativePerSecond && derivative < bucket.maxDerivativePerSecond) {
      return bucket;
    }
  }
  return TETHER_STRAIN_BUCKETS[TETHER_STRAIN_BUCKETS.length - 1];
}

export function buildTetherStrainCue(sample = {}) {
  if (sample.active === false) return null;
  const currentStrain = clampStrain(sample.currentStrain ?? sample.strain);
  const previousStrain = clampStrain(sample.previousStrain ?? currentStrain);
  const derivative = Number.isFinite(sample.derivativePerSecond)
    ? finite(sample.derivativePerSecond, 0)
    : tetherStrainDerivative(previousStrain, currentStrain, sample.dtSeconds);
  const bucket = bucketTetherStrainDerivative(derivative);
  const recipe = SIGNATURE_RECIPES['tether.strain'];
  return Object.freeze({
    id: recipe.id,
    audioId: recipe.audioId,
    sourceEvent: recipe.sourceEvent,
    material: recipe.material,
    mode: recipe.mode,
    bucket: bucket.id,
    importance: Math.max(recipe.importance, bucket.importance),
    playerRelevance: recipe.playerRelevance,
    gain: bucket.gain,
    playbackRate: bucket.playbackRate,
    derivativePerSecond: round4(derivative),
    strain: round4(currentStrain),
    previousStrain: round4(previousStrain),
    targetId: sample.targetId ?? null,
    sourceId: sample.sourceId ?? null,
    simTimeMs: Math.max(0, finite(sample.simTimeMs, 0)),
    tags: recipe.tags,
    layersWith: recipe.layersWith,
  });
}

export function validateSignatureRecipes(recipes = SIGNATURE_RECIPES) {
  const issues = [];
  for (const [id, recipe] of Object.entries(recipes || {})) {
    const path = `$.${id}`;
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
      issues.push(`${path} must be an object`);
      continue;
    }
    if (recipe.version !== SIGNATURE_RECIPE_VERSION) issues.push(`${path}.version must be ${SIGNATURE_RECIPE_VERSION}`);
    if (recipe.id !== id) issues.push(`${path}.id must match its key`);
    if (!SIGNATURE_AUDIO_CUE_BY_ID[id] || recipe.audioId !== SIGNATURE_AUDIO_CUE_BY_ID[id]) {
      issues.push(`${path}.audioId must match SIGNATURE_AUDIO_CUE_BY_ID`);
    }
    if (!Number.isFinite(recipe.importance) || recipe.importance < 0 || recipe.importance > 1) {
      issues.push(`${path}.importance must be in [0,1]`);
    }
    if (id === 'tether.strain' && (!Array.isArray(recipe.buckets) || recipe.buckets.length !== 3)) {
      issues.push(`${path}.buckets must contain exactly three derivative steps`);
    }
    if (id.startsWith('sensor.') && (!Array.isArray(recipe.tones) || recipe.tones.length < 2)) {
      issues.push(`${path}.tones must contain the scan/lock tone steps`);
    }
  }
  return { ok: issues.length === 0, issues };
}

function freezeSignature(value) {
  return Object.freeze({
    version: SIGNATURE_RECIPE_VERSION,
    ...value,
    budgets: Object.freeze({ ...(value.budgets || {}) }),
    tags: Object.freeze([...(value.tags || [])]),
    buckets: Object.freeze([...(value.buckets || [])]),
    tones: Object.freeze([...(value.tones || [])].map((tone) => Object.freeze({ ...tone }))),
    layersWith: Object.freeze([...(value.layersWith || [])]),
  });
}

function clampStrain(value) {
  const n = finite(value, 0);
  return n < 0 ? 0 : n > 1.25 ? 1.25 : n;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function round4(value) {
  return Math.round(finite(value, 0) * 10000) / 10000;
}
