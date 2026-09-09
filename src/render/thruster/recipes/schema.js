/**
 * Data-driven VFX recipe contract (GFX-GROK-01).
 * Recipes describe continuous thruster plumes and short RCS impulses without
 * relying on tint-only differentiation.
 */

export const RECIPE_SCHEMA_VERSION = 1;

export const RECIPE_KINDS = Object.freeze(['continuous_plume', 'impulse_burst']);

export const LAYER_ROLES = Object.freeze([
  'core',
  'inner',
  'sheath',
  'vapor',
  'distortion',
]);

export const QUALITY_TIERS = Object.freeze(['high', 'medium', 'low']);

/** Required top-level fields for every recipe document. */
export const REQUIRED_TOP_LEVEL = Object.freeze([
  'schemaVersion',
  'id',
  'kind',
  'engineFamily',
  'layers',
  'throttle',
  'timing',
  'eventLight',
  'accessibility',
  'quality',
  'identity',
]);

/**
 * JSON-serializable field constraints used by validateRecipe.
 * Kept as data so integration can re-export without pulling Three.js.
 */
export const FIELD_CONSTRAINTS = Object.freeze({
  schemaVersion: { type: 'number', const: RECIPE_SCHEMA_VERSION },
  id: { type: 'string', minLength: 1 },
  kind: { type: 'string', enum: RECIPE_KINDS },
  engineFamily: { type: 'string', minLength: 1 },
  displayName: { type: 'string', optional: true },
  notes: { type: 'string', optional: true },
  geometry: {
    type: 'object',
    required: ['axis', 'baseLength', 'baseWidth', 'segmentCount', 'aspect'],
    fields: {
      axis: { type: 'string', enum: ['localNegX', 'localNegZ', 'socketForward'] },
      baseLength: { type: 'number', min: 0.05, max: 40 },
      baseWidth: { type: 'number', min: 0.02, max: 12 },
      segmentCount: { type: 'integer', min: 1, max: 64 },
      aspect: { type: 'string', enum: ['stream', 'jet', 'puff'] },
      taper: { type: 'number', min: 0, max: 1, optional: true },
      billboard: { type: 'string', enum: ['axial', 'cameraY', 'none'], optional: true },
    },
  },
  layers: {
    type: 'array',
    minItems: 2,
    maxItems: 8,
    itemRequired: ['role', 'enabled', 'texture', 'blend', 'softEdge', 'intensity', 'opacity'],
  },
  throttle: {
    type: 'object',
    required: ['idle', 'length', 'width', 'turbulence', 'coreSheathBalance', 'dissipation', 'flowSpeed'],
  },
  timing: {
    type: 'object',
    required: ['attack', 'sustain', 'release'],
  },
  eventLight: {
    type: 'object',
    required: ['enabled', 'maxIntensity', 'maxRange', 'color'],
  },
  accessibility: {
    type: 'object',
    required: ['reducedMotion', 'reducedFlash', 'lowQuality'],
  },
  quality: {
    type: 'object',
    required: QUALITY_TIERS,
  },
  identity: {
    type: 'object',
    required: ['flowCharacter', 'geometryCharacter', 'timingCharacter', 'layeringCharacter'],
  },
});

/**
 * Live seam mapping: recipe fields that mirror existing engine profile keys
 * from input/src/render/vfxProfiles.js + energyMaterials plume uniforms.
 */
export const LIVE_SEAM_FIELDS = Object.freeze({
  plumeCore: 'layers[role=core|inner].colorHex',
  plumeHalo: 'layers[role=sheath|vapor].colorHex',
  flowSpeed: 'throttle.flowSpeed / identity.flowCharacter.baseFlow',
  noiseScale: 'identity.flowCharacter.noiseScale',
  coreIntensity: 'layers[role=core].intensity',
  haloIntensity: 'layers[role=sheath].intensity',
  plumeWidthMul: 'geometry.baseWidth scale via throttle.width',
  plumeLengthMul: 'geometry.baseLength scale via throttle.length',
  plumeSwirl: 'identity.flowCharacter.swirl',
  plumeFork: 'identity.flowCharacter.fork',
  boostBlend: 'throttle continuous response (not binary)',
});
