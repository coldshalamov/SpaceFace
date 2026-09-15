function materialTextures(material, textures) {
  if (!material || typeof material !== 'object') return;
  for (const value of Object.values(material)) {
    if (value && value.isTexture) textures.add(value);
  }
  const uniforms = material.uniforms;
  if (!uniforms || typeof uniforms !== 'object') return;
  for (const uniform of Object.values(uniforms)) {
    const value = uniform && uniform.value;
    if (value && value.isTexture) textures.add(value);
  }
}

function subjectRoots(subjects) {
  return Array.isArray(subjects) ? subjects : [subjects];
}

export function collectStartupTextures(subjects) {
  const textures = new Set();
  const roots = subjectRoots(subjects);
  for (const root of roots) {
    if (root && root.isTexture === true) {
      textures.add(root);
      continue;
    }
    if (!root || typeof root.traverse !== 'function') continue;
    root.traverse((object) => {
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materials) materialTextures(material, textures);
    });
  }
  return [...textures];
}

function drawableHasWork(object, options = {}) {
  if (!object || !object.geometry) return false;
  if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return false;
  // includeEmpty admits count-0 pools and not-yet-ranged buffers: the upload is what matters,
  // and an empty submission still uploads the backing buffers so a later 0->N growth does not
  // first-land inside a presented frame.
  if (options.includeEmpty === true) return true;
  if (object.isInstancedMesh && Number.isFinite(Number(object.count)) && Number(object.count) <= 0) {
    return false;
  }
  const drawRange = object.geometry.drawRange;
  if (drawRange && Number.isFinite(Number(drawRange.count)) && Number(drawRange.count) <= 0) {
    return false;
  }
  return true;
}

/** Exact drawable objects whose vertex/index/instance buffers can reach a later submission. */
export function collectStartupGeometryDrawables(subjects, options = {}) {
  const drawables = [];
  const seen = new Set();
  for (const root of subjectRoots(subjects)) {
    if (!root) continue;
    const visit = (object) => {
      if (!drawableHasWork(object, options) || seen.has(object)) return;
      seen.add(object);
      drawables.push(object);
    };
    if (typeof root.traverse === 'function') root.traverse(visit);
    else visit(root);
  }
  return drawables;
}

function attributeByteLength(attribute) {
  const array = attribute && (attribute.array || attribute.data && attribute.data.array);
  return Number(array && array.byteLength) || 0;
}

function geometryByteLength(geometry) {
  if (!geometry) return 0;
  let bytes = attributeByteLength(geometry.index);
  for (const attribute of Object.values(geometry.attributes || {})) {
    bytes += attributeByteLength(attribute);
  }
  for (const attributes of Object.values(geometry.morphAttributes || {})) {
    for (const attribute of attributes || []) bytes += attributeByteLength(attribute);
  }
  return bytes;
}

function createGeometryWorkItems(drawables, options = {}) {
  const work = [];
  const seenGeometries = new Set();
  // Context restore leaves the stamps on the CPU-side objects while every GPU-side buffer died
  // with the old context; the restore pass must ignore them or nothing is re-uploaded.
  const ignoreStamps = options.ignoreResidentStamps === true;
  for (const object of drawables) {
    const geometry = object.geometry;
    const firstGeometryUse = !seenGeometries.has(geometry);
    if (firstGeometryUse) seenGeometries.add(geometry);
    // Ordinary meshes sharing one BufferGeometry need one upload. InstancedMesh owns additional
    // per-object instanceMatrix / instanceColor buffers, so every live instanced object remains work.
    if (!firstGeometryUse && !object.isInstancedMesh) continue;
    // F9 recook must not re-upload ordinary geos the first cook already stamped.
    if (!ignoreStamps
        && geometry.userData && geometry.userData.spacefaceGpuResident === true
        && !object.isInstancedMesh) continue;
    let estimatedBytes = firstGeometryUse ? geometryByteLength(geometry) : 0;
    if (object.isInstancedMesh) {
      estimatedBytes += attributeByteLength(object.instanceMatrix);
      estimatedBytes += attributeByteLength(object.instanceColor);
    }
    work.push({ object, geometry, estimatedBytes });
  }
  return { work, uniqueGeometries: seenGeometries.size };
}

function rendererMemoryGeometries(renderer) {
  const value = renderer && renderer.info && renderer.info.memory
    && renderer.info.memory.geometries;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function reportBlockingSlice(observer, slice) {
  if (!observer) return;
  try { observer(slice); } catch {
    // Diagnostic observers never own admission semantics.
  }
}

/**
 * Upload exact vertex/index/instance buffers through renderer.initGeometry().
 *
 * compileAsync() prepares programs only. WebGLObjects.update() — the same path render() reaches —
 * owns geometry registration and buffer upload; initGeometry invokes it for one object without a
 * draw. A bounded render pass pays a whole renderer.render() plus proxy/state churn per batch, so
 * on integrated GPUs each ~4-drawable slice cost ~60ms of fixed overhead. One initGeometry per work
 * item uploads the same buffers for ~1-3ms and never touches render targets, viewport, or
 * production materials.
 */
export async function prepareStartupGeometryResidency(renderer, subjects, options = {}) {
  const drawables = collectStartupGeometryDrawables(subjects, options);
  const { work, uniqueGeometries } = createGeometryWorkItems(drawables, options);
  if (!renderer || typeof renderer.initGeometry !== 'function') {
    return {
      skipped: true,
      reason: 'initGeometry unavailable',
      drawables: drawables.length,
      geometries: uniqueGeometries,
      batches: [],
    };
  }
  if (work.length === 0) {
    return {
      skipped: true,
      reason: 'no drawable geometry',
      drawables: drawables.length,
      geometries: uniqueGeometries,
      batches: [],
    };
  }

  const yieldToMain = typeof options.yieldToMain === 'function'
    ? options.yieldToMain
    : yieldToBrowser;
  const onBlockingSlice = typeof options.onBlockingSlice === 'function'
    ? options.onBlockingSlice
    : null;
  const now = typeof options.now === 'function' ? options.now : clockNow;
  const results = [];
  const geometriesBefore = rendererMemoryGeometries(renderer);

  for (let index = 0; index < work.length; index++) {
    const item = work[index];
    await yieldToMain();
    const started = now();
    let success = false;
    try {
      renderer.initGeometry(item.object);
      success = true;
    } finally {
      const durationMs = now() - started;
      const receipt = {
        kind: 'gpuGeometryResidency',
        durationMs,
        index,
        count: work.length,
        drawables: 1,
        geometries: 1,
        estimatedBytes: item.estimatedBytes,
        subject: item.object.name || item.object.type || 'drawable',
        success,
      };
      if (success) {
        const geometry = item.geometry;
        if (geometry) {
          const data = geometry.userData || (geometry.userData = {});
          data.spacefaceGpuResident = true;
        }
        results.push(receipt);
      }
      reportBlockingSlice(onBlockingSlice, receipt);
    }
  }

  const geometriesAfter = rendererMemoryGeometries(renderer);
  return {
    skipped: false,
    mode: 'direct-buffer-upload',
    drawables: drawables.length,
    geometryWorkItems: work.length,
    geometries: uniqueGeometries,
    estimatedBytes: work.reduce((sum, item) => sum + item.estimatedBytes, 0),
    geometriesBefore,
    geometriesAfter,
    newGeometries: geometriesBefore !== null && geometriesAfter !== null
      ? geometriesAfter - geometriesBefore : null,
    batches: results,
  };
}

export async function prepareStartupGpuResidency(renderer, subjects, options = {}) {
  if (!renderer || typeof renderer.initTexture !== 'function') {
    return { skipped: true, reason: 'initTexture unavailable', textures: 0 };
  }
  const yieldToMain = typeof options.yieldToMain === 'function'
    ? options.yieldToMain
    : yieldToBrowser;
  const onBlockingSlice = typeof options.onBlockingSlice === 'function'
    ? options.onBlockingSlice
    : null;
  const now = typeof options.now === 'function' ? options.now : clockNow;
  const textures = collectStartupTextures(subjects);
  for (const texture of Array.isArray(options.textures) ? options.textures : []) {
    if (texture && texture.isTexture === true && !textures.includes(texture)) textures.push(texture);
  }
  const uploads = [];
  const count = textures.length;
  // GPU storage lives per texture.source: a second Texture sharing one source gets its own
  // textureProperties record, so initTexture force-uploads into the SAME handle — texStorage2D
  // on live immutable storage logs GL_INVALID_OPERATION per shared source. Upload each source
  // once; a distinct sampler-parameter variant costs only a setTextureParameters at draw.
  const seenSources = new Set();
  const props = renderer.properties && typeof renderer.properties.get === 'function'
    ? renderer.properties : null;
  for (let index = 0; index < count; index++) {
    const texture = textures[index];
    await yieldToMain();
    const started = now();
    let success = false;
    try {
      const source = texture && texture.source;
      let resident = source != null && seenSources.has(source);
      if (!resident && source && props) {
        try {
          const sourceProps = props.get(source);
          resident = !!sourceProps && sourceProps.__version === source.version;
        } catch (_) { resident = false; }
      }
      if (!resident) renderer.initTexture(texture);
      if (source != null) seenSources.add(source);
      success = true;
    } finally {
      const durationMs = now() - started;
      const name = texture.name || texture.source?.data?.name || 'unnamed';
      const width = Number(texture.image?.width) || Number(texture.source?.data?.width) || 0;
      const height = Number(texture.image?.height) || Number(texture.source?.data?.height) || 0;
      if (success) uploads.push({ name, width, height, durationMs });
      reportBlockingSlice(onBlockingSlice, {
        kind: 'gpuResidencyUpload',
        durationMs,
        name,
        width,
        height,
        index,
        count,
        success,
      });
    }
  }
  const geometryResidency = options.includeGeometry === false
    ? { skipped: true, reason: 'geometry residency owned by exact opening admission' }
    : await prepareStartupGeometryResidency(renderer, subjects, {
      ...options,
      yieldToMain,
      onBlockingSlice,
      now,
    });
  await yieldToMain();
  return {
    skipped: false,
    textures: textures.length,
    uploads,
    geometryResidency,
  };
}

export function yieldToBrowser() {
  if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Resume from a macrotask after rAF so GPU work cannot run inside the protected display callback. */
export function yieldToNextPresent(options = {}) {
  return new Promise((resolve) => {
    const requestFrame = typeof options.requestFrame === 'function'
      ? options.requestFrame
      : (typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : null);
    const scheduleTask = typeof options.scheduleTask === 'function'
      ? options.scheduleTask
      : (callback) => setTimeout(callback, 0);
    if (requestFrame) {
      requestFrame(() => scheduleTask(resolve));
      return;
    }
    scheduleTask(resolve);
  });
}

function clockNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
