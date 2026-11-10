function payloadText(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.svg === 'string') return payload.svg;
  if (typeof payload.markup === 'string') return payload.markup;
  if (typeof payload.bytes === 'string') return payload.bytes;
  if (typeof payload.pixels === 'string') return payload.pixels;
  if (typeof payload.image === 'string') return payload.image;
  return '';
}

function asByteView(bytes) {
  if (bytes == null || typeof bytes === 'string') return null;
  if (ArrayBuffer.isView(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (Array.isArray(bytes) && bytes.every((n) => typeof n === 'number')) return Uint8Array.from(bytes);
  return null;
}

function payloadBinary(payload) {
  if (payload == null || typeof payload === 'string') return null;
  if (typeof payload !== 'object') return null;
  const direct = asByteView(payload);
  if (direct) return direct;
  return asByteView(payload.bytes ?? payload.pixels ?? payload.image ?? null);
}

function bytePrefixText(bytes) {
  const view = asByteView(bytes);
  if (!view || view.length === 0) return '';
  let start = 0;
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) start = 3;
  const end = Math.min(view.length, start + 512);
  let text = '';
  for (let i = start; i < end; i += 1) text += String.fromCharCode(view[i] & 0xff);
  return text;
}

function textLooksLikeSvg(text) {
  if (!text) return false;
  const trimmed = String(text).replace(/^\uFEFF/, '').trim().toLowerCase();
  return trimmed.startsWith('<svg') || trimmed.startsWith('<?xml') || trimmed.includes('<svg');
}

/**
 * An SVG document is a string, a format tag, or bytes that carry an svg or xml marker.
 * A PNG byte buffer does not.
 */
export function isSvgPayload(payload) {
  if (payload == null) return false;
  if (typeof payload === 'string') return textLooksLikeSvg(payload);
  if (typeof payload !== 'object') return false;
  if (payload.format === 'svg' || payload.source === 'semantic-svg') return true;
  if (textLooksLikeSvg(payloadText(payload))) return true;
  return textLooksLikeSvg(bytePrefixText(payloadBinary(payload)));
}

/**
 * Semantic lab estimate of the full shield shell. HP does not measure whether
 * the runtime presents a shell or which scale it submits; the armed renderer
 * sampler below reads those separately. `shieldMax` alone is not a shell.
 */
export function liveShieldGeometryRadius(entity) {
  if (!entity) return null;
  const now = Number(entity.shield);
  if (!(Number.isFinite(now) && now > 0)) return null;
  const radius = Number(entity.radius);
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

export const HOOK_SCHEMA = 'spaceface.sceneTruthHookFrame.v1';



/**
 * Pure read-only scene sample. No DOM, no draw, no sim write.
 * The play loop publishes from `runRenderUpdatePhase` after `drawPreparedFrame`
 * returns true. `renderFrame` is only the fallback and publishes on that same
 * submitted return. A witness must set `globalThis.__SF_SCENE_TRUTH_WITNESS__`.
 *
 * @param {object[]} samples objects already resolved by the caller
 * @param {object} meta tick, seed, zoom, qualityTier, frameCapture
 */
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
  if (payload == null || isSvgPayload(payload)) return false;
  if (typeof payload === 'string') return false;
  return payloadByteLength(payload) > 0;
}

export function sceneTruthFrameFromSamples(samples, meta = {}) {
  const objects = (Array.isArray(samples) ? samples : []).map((sample) => ({
    objectId: sample.objectId || null,
    entityId: sample.entityId ?? null,
    visible: sample.visible !== false,
    renderOrder: Number.isFinite(sample.renderOrder) ? sample.renderOrder : 0,
    depthTest: sample.depthTest == null ? null : sample.depthTest !== false,
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
    sampleSource: meta.sampleSource || 'semantic-state',
    objectCount: objects.length,
    objects,
  };
}

function visibleInHierarchy(mesh) {
  for (let node = mesh; node; node = node.parent) if (node.visible === false) return false;
  return !!mesh;
}

function matrixRadius(matrix, offset = 0) {
  if (!matrix || matrix.length < offset + 16) return null;
  const radius = Math.max(
    Math.hypot(matrix[offset], matrix[offset + 1], matrix[offset + 2]),
    Math.hypot(matrix[offset + 4], matrix[offset + 5], matrix[offset + 6]),
    Math.hypot(matrix[offset + 8], matrix[offset + 9], matrix[offset + 10]),
  );
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

/** Read the renderer's mounted roots; sim flags are not draw measurements. */
export function sceneTruthSamplesFromRenderer(renderer) {
  const rows = [];
  const meshes = renderer && renderer._meshes;
  if (!meshes || typeof meshes.forEach !== 'function') return rows;
  const shieldPool = renderer._shipAuxPool && renderer._shipAuxPool.shield;
  meshes.forEach((mesh, entityId) => {
    if (!mesh) return;
    const data = mesh.userData || {};
    const visible = visibleInHierarchy(mesh);
    const bubble = data.shieldBubble;
    let shieldGeometryRadius = null;
    if (visible && bubble) {
      const index = bubble.userData && bubble.userData.sceneTruthShieldInstance;
      const poolMesh = shieldPool && shieldPool.mesh;
      if (Number.isInteger(index) && index >= 0 && index < (poolMesh && poolMesh.count)
          && visibleInHierarchy(poolMesh)) {
        shieldGeometryRadius = matrixRadius(poolMesh.instanceMatrix && poolMesh.instanceMatrix.array, index * 16);
      } else if (visibleInHierarchy(bubble)) {
        shieldGeometryRadius = matrixRadius(bubble.matrixWorld && bubble.matrixWorld.elements);
      }
    }
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    rows.push({
      objectId: `entity:${entityId}`,
      entityId,
      visible,
      renderOrder: mesh.renderOrder,
      depthTest: material ? material.depthTest : undefined,
      packageKey: data.packageKey || data.assetId || null,
      contentHash: data.contentHash || null,
      lodLevel: data.lod && data.lod.level,
      shieldGeometryRadius,
    });
  });
  return rows;
}

export function sceneTruthSamplesFromState(state) {
  const rows = [];
  const visit = (entity) => {
    if (!entity || entity.alive === false || entity.id == null) return;
    const data = entity.data || {};
    rows.push({
      objectId: data.scenarioAlias ? `entity:${entity.id}` : `entity:${entity.id}`,
      entityId: entity.id,
      visible: entity.visible !== false,
      renderOrder: Number.isFinite(entity.renderOrder) ? entity.renderOrder : 0,
      depthTest: entity.depthTest !== false,
      packageKey: data.defId || null,
      contentHash: data.packageContentHash || null,
      lodLevel: data.lodLevel || null,
      shieldGeometryRadius: liveShieldGeometryRadius(entity),
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
  // Check before touching state or building rows: ordinary play pays no sampling cost.
  if (typeof globalThis === 'undefined' || globalThis.__SF_SCENE_TRUTH_WITNESS__ !== true) return null;
  const state = renderer && renderer.state;
  if (!state) return null;
  const capture = state.render && state.render.sceneTruthFrameCapture;
  return publishSceneTruthFrame(sceneTruthSamplesFromRenderer(renderer), {
    tick: state.tick,
    seed: state.meta && state.meta.seed,
    zoom: state.render && state.render.zoom,
    captureKind: capture ? 'gpu-frame' : 'semantic-projection',
    frameCapture: capture || null,
    sampleSource: 'render-roots',
  });
}

export function hookInstallsOverlay() {
  return false;
}
