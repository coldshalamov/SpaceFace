import * as THREE from 'three';

const STARTUP_GEOMETRY_BATCH_DRAWABLES = 4;
const STARTUP_GEOMETRY_BATCH_BYTES = 8 * 1024 * 1024;

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

function drawableHasWork(object) {
  if (!object || !object.geometry) return false;
  if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return false;
  if (object.isInstancedMesh && Number.isFinite(Number(object.count)) && Number(object.count) <= 0) {
    return false;
  }
  const drawRange = object.geometry.drawRange;
  if (drawRange && Number.isFinite(Number(drawRange.count)) && Number(drawRange.count) <= 0) {
    return false;
  }
  return true;
}

/** Exact drawable objects whose vertex/index/instance buffers can reach the opening submission. */
export function collectStartupGeometryDrawables(subjects) {
  const drawables = [];
  const seen = new Set();
  for (const root of subjectRoots(subjects)) {
    if (!root) continue;
    const visit = (object) => {
      if (!drawableHasWork(object) || seen.has(object)) return;
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

function createGeometryWorkItems(drawables) {
  const work = [];
  const seenGeometries = new Set();
  for (const object of drawables) {
    const geometry = object.geometry;
    const firstGeometryUse = !seenGeometries.has(geometry);
    if (firstGeometryUse) seenGeometries.add(geometry);
    // Ordinary meshes sharing one BufferGeometry need one upload. InstancedMesh owns additional
    // per-object instanceMatrix / instanceColor buffers, so every live instanced object remains work.
    if (!firstGeometryUse && !object.isInstancedMesh) continue;
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
  // the program. The shader therefore stays deliberately tiny: it exists only to drive Three's public
  // render path, while every vertex is clipped and the 1x1 target carries no visible picture.
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
    // Construct only one temporary matrix, then point the proxy at the production instance buffers.
    // Restore that owned matrix before dispose so Three cannot delete the production buffer while
    // releasing the proxy's VAO state.
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
 * Upload exact opening vertex/index/instance buffers through Three's public render path.
 *
 * WebGLRenderer.compileAsync() prepares programs only; WebGLObjects.update() — reached by render() —
 * owns geometry registration and buffer upload. This isolated 1x1 clipped pass performs that missing
 * work behind the loading shell, in bounded batches, without touching live scene ownership or quality.
 */
export async function prepareStartupGeometryResidency(renderer, subjects, options = {}) {
  const drawables = collectStartupGeometryDrawables(subjects);
  const { work, uniqueGeometries } = createGeometryWorkItems(drawables);
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
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  target.texture.generateMipmaps = false;
  target.texture.name = 'SF_StartupGeometryResidencyTarget';
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
  camera.layers.enableAll();
  camera.updateMatrixWorld(true);
  const results = [];
  const geometriesBefore = rendererMemoryGeometries(renderer);

  try {
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
        if (success) results.push(receipt);
        reportBlockingSlice(onBlockingSlice, receipt);
      }
    }
  } finally {
    material.dispose();
    target.dispose();
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
  const geometryResidency = await prepareStartupGeometryResidency(renderer, subjects, {
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

/** Wait for the next displayed frame so a texture upload cannot stack on the present rAF. */
export function yieldToNextPresent() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

function clockNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
