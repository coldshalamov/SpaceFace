/**
 * Thruster recipe registry — maps live ENGINE_PROFILES ids to main+RCS recipes.
 * Pure data/lookup; no Three.js. Used by vfx production thruster path (VP-220).
 */

import {
  ION_SMALL_MAIN_PLUME_RECIPE,
  ION_SMALL_RCS_RECIPE,
  ION_SMALL_CONTINUUM,
  ION_TWIN_MAIN_PLUME_RECIPE,
  ION_TWIN_RCS_RECIPE,
  INDUSTRIAL_MAIN_PLUME_RECIPE,
  INDUSTRIAL_RCS_RECIPE,
  RESONATOR_MAIN_PLUME_RECIPE,
  RESONATOR_RCS_RECIPE,
  VECTOR_MAIN_PLUME_RECIPE,
  VECTOR_RCS_RECIPE,
  PLASMA_RING_MAIN_PLUME_RECIPE,
  PLASMA_RING_RCS_RECIPE,
  continuumForRecipe,
} from './familyRecipes.js';
import { KESTREL_MAIN_PLUME_RECIPE, KESTREL_RCS_RECIPE } from './kestrelRecipes.js';

/** Live engine profile ids from vfxProfiles.ENGINE_PROFILES. */
export const LIVE_ENGINE_PROFILE_IDS = Object.freeze([
  'engine_ion_small',
  'engine_ion_twin',
  'engine_industrial',
  'engine_resonator',
  'engine_vector',
  'engine_plasma_ring',
]);

const FAMILY_BY_PROFILE = Object.freeze({
  engine_ion_small: Object.freeze({
    profileId: 'engine_ion_small',
    style: 'ion',
    main: ION_SMALL_MAIN_PLUME_RECIPE,
    rcs: ION_SMALL_RCS_RECIPE,
    continuum: ION_SMALL_CONTINUUM,
  }),
  engine_ion_twin: Object.freeze({
    profileId: 'engine_ion_twin',
    style: 'ion',
    main: ION_TWIN_MAIN_PLUME_RECIPE,
    rcs: ION_TWIN_RCS_RECIPE,
    continuum: continuumForRecipe(ION_TWIN_MAIN_PLUME_RECIPE),
  }),
  engine_industrial: Object.freeze({
    profileId: 'engine_industrial',
    style: 'industrial',
    main: INDUSTRIAL_MAIN_PLUME_RECIPE,
    rcs: INDUSTRIAL_RCS_RECIPE,
    continuum: continuumForRecipe(INDUSTRIAL_MAIN_PLUME_RECIPE),
  }),
  engine_resonator: Object.freeze({
    profileId: 'engine_resonator',
    style: 'resonator',
    main: RESONATOR_MAIN_PLUME_RECIPE,
    rcs: RESONATOR_RCS_RECIPE,
    continuum: continuumForRecipe(RESONATOR_MAIN_PLUME_RECIPE),
  }),
  engine_vector: Object.freeze({
    profileId: 'engine_vector',
    style: 'vector',
    main: VECTOR_MAIN_PLUME_RECIPE,
    rcs: VECTOR_RCS_RECIPE,
    continuum: continuumForRecipe(VECTOR_MAIN_PLUME_RECIPE),
  }),
  engine_plasma_ring: Object.freeze({
    profileId: 'engine_plasma_ring',
    style: 'plasma',
    main: PLASMA_RING_MAIN_PLUME_RECIPE,
    rcs: PLASMA_RING_RCS_RECIPE,
    continuum: continuumForRecipe(PLASMA_RING_MAIN_PLUME_RECIPE),
  }),
});

const DEFAULT_PACK = FAMILY_BY_PROFILE.engine_ion_small;

/**
 * Resolve main + RCS recipes for a live engine profile id.
 * @param {string|null|undefined} engineProfileId
 * @returns {{ profileId: string, style: string, main: object, rcs: object, continuum: object }}
 */
export function resolveThrusterRecipes(engineProfileId) {
  const id = typeof engineProfileId === 'string' && engineProfileId
    ? engineProfileId
    : 'engine_ion_small';
  return FAMILY_BY_PROFILE[id] || DEFAULT_PACK;
}

/**
 * All registered family packs (stable order).
 * @returns {ReadonlyArray<{ profileId: string, style: string, main: object, rcs: object, continuum: object }>}
 */
export function listThrusterRecipePacks() {
  return LIVE_ENGINE_PROFILE_IDS.map((id) => FAMILY_BY_PROFILE[id]);
}

/**
 * Texture ids required by every registered recipe (for deterministic thruster load).
 * @returns {string[]}
 */
export function collectThrusterTextureIds(packs = listThrusterRecipePacks()) {
  const ids = [];
  const seen = Object.create(null);
  for (let p = 0; p < packs.length; p++) {
    const pack = packs[p];
    for (const recipe of [pack.main, pack.rcs]) {
      const layers = recipe.layers || [];
      for (let i = 0; i < layers.length; i++) {
        const tid = layers[i].texture && layers[i].texture.id;
        if (tid && !seen[tid]) {
          seen[tid] = 1;
          ids.push(tid);
        }
      }
    }
  }
  return ids;
}

/**
 * Kestrel accepted substrate aliases — preserved for existing tests/checks.
 */
export const KESTREL_THRUSTER_ALIASES = Object.freeze({
  main: KESTREL_MAIN_PLUME_RECIPE,
  rcs: KESTREL_RCS_RECIPE,
  profileId: 'engine_ion_small',
});

/**
 * Structural signature used for family-distinction tests (no Three.js).
 * @param {object} mainRecipe
 */
export function familyStructuralSignature(mainRecipe) {
  const geo = mainRecipe.geometry || {};
  const flow = mainRecipe.identity?.flowCharacter || {};
  const timing = mainRecipe.identity?.timingCharacter || {};
  const layering = mainRecipe.identity?.layeringCharacter || {};
  const th = mainRecipe.throttle || {};
  return {
    engineFamily: mainRecipe.engineFamily,
    aspect: geo.aspect,
    baseLength: geo.baseLength,
    baseWidth: geo.baseWidth,
    taper: geo.taper,
    aspectRatio: (geo.baseLength || 1) / Math.max(0.01, geo.baseWidth || 1),
    swirl: flow.swirl,
    fork: flow.fork,
    noiseScale: flow.noiseScale,
    baseFlow: flow.baseFlow,
    anisotropy: flow.anisotropy,
    driveRise: timing.driveRise,
    driveFall: timing.driveFall,
    boostRise: timing.boostRise,
    coreDominance: layering.coreDominance,
    boostStructuralDrive: layering.boostStructuralDrive,
    idle: th.idle,
    lengthAt0: th.length?.at0,
    lengthAt1: th.length?.at1,
    widthAt0: th.width?.at0,
    widthAt1: th.width?.at1,
    turbulenceAt1: th.turbulence?.at1,
    flowAt1: th.flowSpeed?.at1,
  };
}

/**
 * Assert two main-plume families are not tint-only clones.
 * @param {object} a main recipe
 * @param {object} b main recipe
 */
export function assertFamiliesStructurallyDistinct(a, b) {
  const failures = [];
  const sa = familyStructuralSignature(a);
  const sb = familyStructuralSignature(b);
  if (sa.engineFamily === sb.engineFamily && a.id === b.id) {
    failures.push('same recipe compared to itself');
    return { ok: false, failures, sa, sb };
  }

  let structuralDelta = 0;
  const checks = [
    ['aspectRatio', 0.12],
    ['swirl', 0.08],
    ['fork', 0.08],
    ['noiseScale', 0.15],
    ['baseFlow', 0.15],
    ['anisotropy', 0.12],
    ['driveRise', 0.8],
    ['coreDominance', 0.05],
    ['boostStructuralDrive', 0.02],
    ['baseLength', 0.6],
    ['baseWidth', 0.25],
    ['taper', 0.04],
  ];
  for (const [key, minDelta] of checks) {
    if (Math.abs((sa[key] ?? 0) - (sb[key] ?? 0)) >= minDelta) structuralDelta += 1;
  }

  // Tint-only guard: if core/inner hex match and structuralDelta is low, fail.
  const coreA = a.layers?.find((l) => l.role === 'core')?.colorHex;
  const coreB = b.layers?.find((l) => l.role === 'core')?.colorHex;
  const innerA = a.layers?.find((l) => l.role === 'inner')?.colorHex;
  const innerB = b.layers?.find((l) => l.role === 'inner')?.colorHex;
  const sameTint = coreA === coreB && innerA === innerB;

  if (structuralDelta < 3) {
    failures.push(
      `${a.engineFamily} vs ${b.engineFamily}: only ${structuralDelta} structural axes differ (need ≥3)`,
    );
  }
  if (sameTint && structuralDelta < 4) {
    failures.push(
      `${a.engineFamily} vs ${b.engineFamily}: palette match with weak structural separation`,
    );
  }

  return { ok: failures.length === 0, failures, sa, sb, structuralDelta, sameTint };
}

/**
 * Pairwise family distinction across the live registry.
 */
export function assertAllLiveFamiliesDistinct() {
  const packs = listThrusterRecipePacks();
  const failures = [];
  for (let i = 0; i < packs.length; i++) {
    for (let j = i + 1; j < packs.length; j++) {
      const r = assertFamiliesStructurallyDistinct(packs[i].main, packs[j].main);
      if (!r.ok) failures.push(...r.failures);
    }
  }
  return { ok: failures.length === 0, failures, familyCount: packs.length };
}
