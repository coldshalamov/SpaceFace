import * as THREE from 'three';

const STARTUP_GEOMETRY_BATCH_DRAWABLES = 4;
const STARTUP_GEOMETRY_BATCH_BYTES = 8 * 1024 * 1024;

// One 1x1 scratch target per renderer, shared by every geometry-residency admission for the
// context's lifetime. A fresh WebGLRenderTarget per admission used to orphan its texture and
// framebuffer whenever the admission was abandoned mid-yield — a soak's repeated dock/load cycles
// measured the residue directly. Shadow-depth admission already caches its scratch target the same
// way; the GL objects die with the context and re-upload on restore through the normal path.
const residencyScratchTargets = new WeakMap();

function residencyScratchTargetFor(renderer) {
  let target = residencyScratchTargets.get(renderer);
  if (!target) {
    target = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    target.texture.generateMipmaps = false;
    target.texture.name = 'SF_StartupGeometryResidencyTarget';
    residencyScratchTargets.set(renderer, target);
  }
  return target;
}

// The scratch pass binds shared render-target state, so admissions cannot interleave: a second
// caller that captured the scratch target as its "previous" target would restore the renderer to a
// 1x1 buffer instead of the canvas. Serializing the batch loops per renderer keeps every capture/
// restore honest while each admission's texture uploads still overlap freely.
const residencyBatchChains = new WeakMap();

function enqueueGeometryResidencyBatches(renderer, work) {
  const prior = residencyBatchChains.get(renderer) || Promise.resolve();
  const run = prior.then(work, work);
  residencyBatchChains.set(renderer, run.catch(() => null));
  return run;
}

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
      // Quality-tier systems (continuous plume, RCS impulse) carry alternate geometries and swap
      // mesh.geometry on a live frame; an unstamped tier uploads inside the presented pass.
      const tiers = object.userData && object.userData.spacefaceQualityTierGeometries;
      if (Array.isArray(tiers)) {
        for (const tierGeo of tiers) {
          if (!tierGeo || tierGeo === object.geometry) continue;
          const facade = Object.create(object);
          facade.geometry = tierGeo;
          drawables.push(facade);
        }
      }
    };
    if (typeof root.traverse === 'function') root.traverse(visit);
    else visit(root);
  }
  return drawables;
}

/**
 * Instanced drawables whose backing geometry never passed a residency prepare. Scene-level
 * instance pools (authored package pools, asteroid batches) have no per-subject admission
 * owner: the only stamp they ever get comes from a whole-scene seal, so a cook that skips or
 * bounds that seal leaves them to upload inside the first presented pass. Collecting just the
 * unstamped instanced set gives the bounded post-cook seal its exact work list.
 */
export function collectUnresidentInstancedDrawables(subjects) {
  const drawables = [];
  for (const root of subjectRoots(subjects)) {
    if (!root) continue;
    const visit = (object) => {
      if (!object || object.isInstancedMesh !== true || !object.geometry) return;
      const data = object.geometry.userData;
      if (data && data.spacefaceGpuResident === true) return;
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
    // F9 recook must not 1x1 ordinary geos the first cook already stamped.
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

function partitionGeometryWork(work, options = {}) {
  const maxDrawables = Math.max(1, Number(options.geometryBatchDrawables)
    || STARTUP_GEOMETRY_BATCH_DRAWABLES);
  const maxBytes = Math.max(1, Number(options.geometryBatchBytes)
    || STARTUP_GEOMETRY_BATCH_BYTES);
  const batches = [];
  let current = [];
  let bytes = 0;
  for (const item of work) {
    if (current.length > 0
        && (current.length >= maxDrawables || bytes + item.estimatedBytes > maxBytes)) {
      batches.push({ work: current, estimatedBytes: bytes });
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += item.estimatedBytes;
  }
  if (current.length > 0) batches.push({ work: current, estimatedBytes: bytes });
  return batches;
}

function createResidencyMaterial() {
  // WebGLObjects.update() uploads every BufferGeometry attribute before renderBufferDirect() binds
  // the program. The shader stays tiny and clips every vertex outside the 1x1 target.
  return new THREE.RawShaderMaterial({
    name: 'SF_StartupGeometryResidency',
    vertexShader: `
      precision highp float;
      void main() {
        gl_PointSize = 1.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      void main() { gl_FragColor = vec4(0.0); }
    `,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
    toneMapped: false,
  });
}

function createResidencyProxy(source, material) {
  const geometry = source.geometry;
  let proxy;
  let cleanup = null;
  if (source.isInstancedMesh) {
    // Point the proxy at the production instance buffers. Restore its owned buffers before dispose
    // so releasing the proxy cannot release production GPU state.
    proxy = new THREE.InstancedMesh(geometry, material, 1);
    const ownedMatrix = proxy.instanceMatrix;
    const ownedColor = proxy.instanceColor;
    proxy.instanceMatrix = source.instanceMatrix;
    proxy.instanceColor = source.instanceColor;
    proxy.count = Math.max(0, Number(source.count) || 0);
    cleanup = () => {
      proxy.instanceMatrix = ownedMatrix;
      proxy.instanceColor = ownedColor;
      proxy.dispose();
    };
  } else if (source.isPoints) {
    proxy = new THREE.Points(geometry, material);
  } else if (source.isLineSegments) {
    proxy = new THREE.LineSegments(geometry, material);
  } else if (source.isLineLoop) {
    proxy = new THREE.LineLoop(geometry, material);
  } else if (source.isLine) {
    proxy = new THREE.Line(geometry, material);
  } else {
    proxy = new THREE.Mesh(geometry, material);
  }
  proxy.name = `SF_ResidencyProxy:${source.name || source.type || source.id || 'drawable'}`;
  proxy.frustumCulled = false;
  proxy.matrixAutoUpdate = false;
  proxy.matrix.identity();
  proxy.matrixWorld.identity();
  return { proxy, cleanup };
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

function captureRendererState(renderer) {
  const state = {
    target: typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null,
    viewport: null,
    scissor: null,
    scissorTest: null,
    autoClear: renderer.autoClear,
    xrEnabled: renderer.xr && typeof renderer.xr.enabled === 'boolean'
      ? renderer.xr.enabled : null,
    shadowAutoUpdate: renderer.shadowMap && typeof renderer.shadowMap.autoUpdate === 'boolean'
      ? renderer.shadowMap.autoUpdate : null,
    shadowNeedsUpdate: renderer.shadowMap && typeof renderer.shadowMap.needsUpdate === 'boolean'
      ? renderer.shadowMap.needsUpdate : null,
  };
  if (typeof renderer.getViewport === 'function') {
    state.viewport = renderer.getViewport(new THREE.Vector4()).clone();
  }
  if (typeof renderer.getScissor === 'function') {
    state.scissor = renderer.getScissor(new THREE.Vector4()).clone();
  }
  if (typeof renderer.getScissorTest === 'function') {
    state.scissorTest = renderer.getScissorTest();
  }
  return state;
}

function applyResidencyRendererState(renderer, target) {
  renderer.setRenderTarget(target);
  if (typeof renderer.setViewport === 'function') renderer.setViewport(0, 0, 1, 1);
  if (typeof renderer.setScissor === 'function') renderer.setScissor(0, 0, 1, 1);
  if (typeof renderer.setScissorTest === 'function') renderer.setScissorTest(true);
  renderer.autoClear = false;
  if (renderer.xr && typeof renderer.xr.enabled === 'boolean') renderer.xr.enabled = false;
  if (renderer.shadowMap) {
    if (typeof renderer.shadowMap.autoUpdate === 'boolean') renderer.shadowMap.autoUpdate = false;
    if (typeof renderer.shadowMap.needsUpdate === 'boolean') renderer.shadowMap.needsUpdate = false;
  }
}

function restoreRendererState(renderer, state) {
  renderer.setRenderTarget(state.target || null);
  if (state.viewport && typeof renderer.setViewport === 'function') renderer.setViewport(state.viewport);
  if (state.scissor && typeof renderer.setScissor === 'function') renderer.setScissor(state.scissor);
  if (state.scissorTest !== null && typeof renderer.setScissorTest === 'function') {
    renderer.setScissorTest(state.scissorTest);
  }
  renderer.autoClear = state.autoClear;
  if (state.xrEnabled !== null && renderer.xr) renderer.xr.enabled = state.xrEnabled;
  if (renderer.shadowMap) {
    if (state.shadowAutoUpdate !== null) renderer.shadowMap.autoUpdate = state.shadowAutoUpdate;
    if (state.shadowNeedsUpdate !== null) renderer.shadowMap.needsUpdate = state.shadowNeedsUpdate;
  }
}

/**
 * Upload exact vertex/index/instance buffers through Three's public render path.
 *
 * compileAsync() prepares programs only. WebGLObjects.update(), reached by render(), owns geometry
 * registration and buffer upload. This isolated clipped pass admits late Continue roots without
 * attaching them to the visible scene or changing their production materials.
 */
export async function prepareStartupGeometryResidency(renderer, subjects, options = {}) {
  const drawables = collectStartupGeometryDrawables(subjects, options);
  const { work, uniqueGeometries } = createGeometryWorkItems(drawables, options);
  if (!renderer || typeof renderer.render !== 'function'
      || typeof renderer.setRenderTarget !== 'function'
      || typeof renderer.getRenderTarget !== 'function') {
    return {
      skipped: true,
      reason: 'render-target render unavailable',
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
  const batches = partitionGeometryWork(work, options);
  const material = createResidencyMaterial();
  const target = residencyScratchTargetFor(renderer);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
  camera.layers.enableAll();
  camera.updateMatrixWorld(true);
  const results = [];
  const geometriesBefore = rendererMemoryGeometries(renderer);

  try {
    await enqueueGeometryResidencyBatches(renderer, async () => {
      for (let index = 0; index < batches.length; index++) {
      const batch = batches[index];
      await yieldToMain();
      const scene = new THREE.Scene();
      scene.name = `SF_StartupGeometryResidencyBatch:${index + 1}`;
      const proxyEntries = batch.work.map(({ object }) => createResidencyProxy(object, material));
      for (const entry of proxyEntries) scene.add(entry.proxy);
      const state = captureRendererState(renderer);
      const started = now();
      let success = false;
      try {
        applyResidencyRendererState(renderer, target);
        renderer.render(scene, camera);
        success = true;
      } finally {
        const durationMs = now() - started;
        try { restoreRendererState(renderer, state); } finally {
          for (const entry of proxyEntries) {
            scene.remove(entry.proxy);
            if (entry.cleanup) entry.cleanup();
          }
        }
        const receipt = {
          kind: 'gpuGeometryResidency',
          durationMs,
          index,
          count: batches.length,
          drawables: batch.work.length,
          geometries: new Set(batch.work.map((item) => item.geometry)).size,
          estimatedBytes: batch.estimatedBytes,
          success,
        };
        if (success) {
          for (const item of batch.work) {
            const geometry = item.geometry;
            if (geometry) {
              const data = geometry.userData || (geometry.userData = {});
              data.spacefaceGpuResident = true;
            }
          }
          results.push(receipt);
        }
        reportBlockingSlice(onBlockingSlice, receipt);
      }
      }
    });
  } finally {
    material.dispose();
  }

  const geometriesAfter = rendererMemoryGeometries(renderer);
  return {
    skipped: false,
    mode: 'bounded-1x1-render',
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
  for (let index = 0; index < count; index++) {
    const texture = textures[index];
    await yieldToMain();
    const started = now();
    let success = false;
    try {
      renderer.initTexture(texture);
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
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        scheduleTask(resolve);
      };
      requestFrame(fire);
      // An occluded or minimized headed window can starve rAF indefinitely; a parked admission
      // would hold its GPU work (and any scratch state) forever. Same unstick window
      // armCallbackAfterPresent documents for headless/background stalls.
      setTimeout(fire, 48);
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
