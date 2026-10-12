import { HOOK_SCHEMA } from './constants.mjs';

/**
 * Pure read-only scene sample. No DOM, no draw, no sim write.
 * ADAPTER.md is the unapplied call site that would publish this from the
 * live renderer when a probe flag is set. Shipping play does not call it.
 *
 * @param {object[]} samples objects already resolved by the caller
 * @param {object} meta tick, seed, zoom, qualityTier
 */
export function sceneTruthFrameFromSamples(samples, meta = {}) {
  const objects = (Array.isArray(samples) ? samples : []).map((sample) => ({
    objectId: sample.objectId || null,
    entityId: sample.entityId ?? null,
    visible: sample.visible !== false,
    renderOrder: Number.isFinite(sample.renderOrder) ? sample.renderOrder : 0,
    depthTest: sample.depthTest !== false,
    packageKey: sample.packageKey || sample.package?.key || null,
    contentHash: sample.contentHash || sample.package?.contentHash || null,
    lodLevel: sample.lodLevel || null,
  }));
  return {
    schema: HOOK_SCHEMA,
    overlay: false,
    draws: false,
    tick: meta.tick ?? null,
    seed: meta.seed ?? null,
    zoom: meta.zoom ?? null,
    qualityTier: meta.qualityTier || null,
    objectCount: objects.length,
    objects,
  };
}

export function hookInstallsOverlay() {
  return false;
}
