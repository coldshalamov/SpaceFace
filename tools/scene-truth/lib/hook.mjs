import { HOOK_SCHEMA } from './constants.mjs';

/**
 * Pure read-only scene sample. No DOM, no draw, no sim write.
 * `renderer.js` `renderFrame` calls `publishSceneTruthPlayStep` when a witness
 * set `globalThis.__SF_SCENE_TRUTH_WITNESS__` before boot.
 *
 * @param {object[]} samples objects already resolved by the caller
 * @param {object} meta tick, seed, zoom, qualityTier, frameCapture
 */
function payloadText(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.svg === 'string') return payload.svg;
  if (typeof payload.markup === 'string') return payload.markup;
  if (typeof payload.bytes === 'string') return payload.bytes;
  if (typeof payload.pixels === 'string') return payload.pixels;
  return '';
}

function payloadByteLength(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const bytes = payload.bytes ?? payload.pixels ?? payload.image ?? null;
  if (bytes == null || typeof bytes === 'string') return 0;
  return typeof bytes.length === 'number' ? bytes.length : 0;
}

/** A real captured frame is non-empty and not an SVG document. */
export function frameIsGpuPayload(meta = {}) {
  if (!meta || meta.captureKind === 'semantic-projection' || meta.captureKind === 'svg' || meta.captureKind === 'semantic-svg') {
    return false;
  }
  const payload = meta.frameCapture ?? meta.pixels ?? null;
  if (payload == null) return false;
  if (payload && typeof payload === 'object' && (payload.format === 'svg' || payload.source === 'semantic-svg')) return false;
  const text = payloadText(payload).trim();
  if (text.startsWith('<svg') || text.startsWith('<?xml') || text.includes('<svg')) return false;
  if (typeof payload === 'string') return false;
  return payloadByteLength(payload) > 0;
}

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
    shieldGeometryRadius: Number.isFinite(sample.shieldGeometryRadius) ? sample.shieldGeometryRadius : null,
  }));
  const gpuFrame = frameIsGpuPayload(meta);
  return {
    schema: HOOK_SCHEMA,
    overlay: false,
    draws: false,
    tick: meta.tick ?? null,
    seed: meta.seed ?? null,
    zoom: meta.zoom ?? null,
    qualityTier: meta.qualityTier || null,
    gpuFrame,
    captureKind: gpuFrame ? 'gpu-frame' : 'semantic-projection',
    objectCount: objects.length,
    objects,
  };
}

export function sceneTruthSamplesFromState(state) {
  const rows = [];
  const visit = (entity) => {
    if (!entity || entity.alive === false || entity.id == null) return;
    const data = entity.data || {};
    const shieldMax = Number(entity.shieldMax);
    const shield = Number(entity.shield);
    const liveShield = Number.isFinite(shieldMax) && shieldMax > 0
      ? shieldMax
      : (Number.isFinite(shield) && shield > 0 ? shield : 0);
    const radius = Number(entity.radius);
    rows.push({
      objectId: data.scenarioAlias ? `entity:${entity.id}` : `entity:${entity.id}`,
      entityId: entity.id,
      visible: entity.visible !== false,
      renderOrder: Number.isFinite(entity.renderOrder) ? entity.renderOrder : 0,
      depthTest: entity.depthTest !== false,
      packageKey: data.defId || null,
      contentHash: data.packageContentHash || null,
      lodLevel: data.lodLevel || null,
      shieldGeometryRadius: liveShield > 0 && Number.isFinite(radius) && radius > 0 ? radius : null,
    });
  };
  if (state && Array.isArray(state.entityList)) {
    for (let i = 0; i < state.entityList.length; i += 1) visit(state.entityList[i]);
  } else if (state && state.entities && typeof state.entities.forEach === 'function') {
    state.entities.forEach(visit);
  }
  return rows;
}

export function publishSceneTruthFrame(samples, meta = {}) {
  if (typeof globalThis === 'undefined' || globalThis.__SF_SCENE_TRUTH_WITNESS__ !== true) return null;
  const frame = sceneTruthFrameFromSamples(samples, meta);
  globalThis.__SF_SCENE_TRUTH_FRAME__ = frame;
  return frame;
}

/** One shipping play step. No-op unless a witness armed the probe flag. */
export function publishSceneTruthPlayStep(renderer) {
  const state = renderer && renderer.state;
  if (!state) return null;
  const capture = state.render && state.render.sceneTruthFrameCapture;
  return publishSceneTruthFrame(sceneTruthSamplesFromState(state), {
    tick: state.tick,
    seed: state.meta && state.meta.seed,
    zoom: state.render && state.render.zoom,
    captureKind: capture ? 'gpu-frame' : 'semantic-projection',
    frameCapture: capture || null,
  });
}

export function hookInstallsOverlay() {
  return false;
}
