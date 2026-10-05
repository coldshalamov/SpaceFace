import * as THREE from 'three';
import { beginBootWork } from '../core/bootWork.js';
import { makeGpuQueuePacer } from './gpuQueuePace.js';
import { postTaskAtBackgroundPriorityBounded } from './compilePresentSlice.js';
import {
  detachPackageTexture,
  isPackageTextureDetached,
} from './packageCpuDetach.js';

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

// One residency material per renderer for the context's lifetime. The material is stateless
// (no uniforms, no per-render mutation), but a fresh RawShaderMaterial per call mints new
// shader IDs — so every in-flight admission paid a novel program link and an immediate
// release, the +21 s link/upload churn cluster in the crucible probe. Sharing it means the
// first cook links the program once and every later census reuses the cached program.
const residencyMaterials = new WeakMap();

function residencyMaterialFor(renderer) {
  let material = residencyMaterials.get(renderer);
  if (!material) {
    material = createResidencyMaterial();
    residencyMaterials.set(renderer, material);
  }
  return material;
}

// The scratch pass binds shared render-target state, so admissions cannot interleave: a second
// caller that captured the scratch target as its "previous" target would restore the renderer to a
// 1x1 buffer instead of the canvas. Serializing the batch loops per renderer keeps every capture/
// restore honest while each admission's texture uploads still overlap freely.
const residencyBatchChains = new WeakMap();

// The deadline lane keeps its own chain: an on-glass pending root cannot queue
// behind ambient residency passes (a sector cook may hold seconds of uploads).
// Each batch self-contains capture/render/restore inside one synchronous turn,
// so the two chains interleave safely at batch boundaries.
const residencyUrgentBatchChains = new WeakMap();

// Texture residency stamps, per renderer. renderer.initTexture() bottoms out in
// setTexture2D/uploadTexture, which uploads only while texture.version moved — a repeat
// call against an unchanged texture is a properties lookup plus a bind/unbind pair after
// a full yield slot. Repeat residency passes (material variant rebuilds sharing decoded
// packages, the pre-first-picture scene walk, live-sector pool seals) re-pay that for
// every already-resident map, so a stamp recorded after a successful upload skips the
// whole slice. texture.needsUpdate bumps texture.version, so any real re-upload request
// invalidates the stamp; weak texture keys keep the stamp off userData (a texture.clone()
// cannot inherit a stale stamp) and the renderer key keeps contexts honest.
const textureUploadVersions = new WeakMap();

function textureUploadVersionMap(renderer) {
  let map = textureUploadVersions.get(renderer);
  if (!map) {
    map = new WeakMap();
    textureUploadVersions.set(renderer, map);
  }
  return map;
}

function enqueueGeometryResidencyBatches(renderer, work, options = {}) {
  const chains = options.urgent === true ? residencyUrgentBatchChains : residencyBatchChains;
  const prior = chains.get(renderer) || Promise.resolve();
  const run = prior.then(work, work);
  chains.set(renderer, run.catch(() => null));
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

/**
 * Stepped twin — identical traversal (explicit stack, same pre-order as
 * traverse) and identical texture-set contents; yields every `sliceEvery`
 * visited objects so an async admission driver paces a cohort's collect
 * instead of paying the whole traverse inside one task.
 */
export function* collectStartupTexturesSteps(subjects, sliceEvery = 256) {
  const textures = new Set();
  const every = Math.max(1, Math.floor(Number(sliceEvery) || 1));
  let visited = 0;
  for (const root of subjectRoots(subjects)) {
    if (root && root.isTexture === true) {
      textures.add(root);
      continue;
    }
    if (!root || typeof root.traverse !== 'function') continue;
    const stack = [root];
    while (stack.length > 0) {
      const object = stack.pop();
      if (!object) continue;
      if ((++visited % every) === 0) yield;
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materials) materialTextures(material, textures);
      const children = object.children;
      if (children) for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }
  return [...textures];
}

function drawableHasWork(object, options = {}) {
  if (!object || !object.geometry) return false;
  if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return false;
  // Authored-fallback layers stay hidden for the object's whole live life once flagged —
  // uploading their buffers in a residency pass pays for a draw no presented frame can issue
  // (compilePresentSlice skips them for the same reason).
  if (object.userData && object.userData.authoredReadableFallbackLayer === true) return false;
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

/**
 * Whether any drawable under root holds geometry the residency lane has never uploaded.
 * Shared cached geometries carry the stamp from their first admission, so live-built
 * meshes that reuse them stay instantly drawable; only meshes that would pay a real
 * upload inside the presented pass report unready.
 */
export function hasUnresidentGeometry(root) {
  let unready = false;
  const visit = (object) => {
    if (unready || !object || !object.geometry) return;
    if (!(object.geometry.userData
        && object.geometry.userData.spacefaceGpuResident === true)) unready = true;
  };
  if (root && typeof root.traverse === 'function') root.traverse(visit);
  else visit(root);
  return unready;
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
  // Serial-route queue pacing: null where KHR_parallel_shader_compile exists. Each 1x1 upload
  // pass queues GL work; without a per-batch drain the whole census piles into the command
  // buffer and drains inside one forced compositor finish (headless SwiftShader starved the
  // page's task queue for ~25 s this way — CI run 36486329212).
  const paceQueue = typeof options.paceQueue === 'function'
    ? options.paceQueue
    : makeGpuQueuePacer(renderer);
  const batches = partitionGeometryWork(work, options);
  const geometryProgress = beginBootWork(renderer, 'geometry', batches.length);
  const material = residencyMaterialFor(renderer);
  const target = residencyScratchTargetFor(renderer);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
  camera.layers.enableAll();
  camera.updateMatrixWorld(true);
  const results = [];
  const geometriesBefore = rendererMemoryGeometries(renderer);

  try {
    const counters = options.counters || null;
    await enqueueGeometryResidencyBatches(renderer, async () => {
      for (let index = 0; index < batches.length; index++) {
      const batch = batches[index];
      if (paceQueue) await paceQueue();
      await yieldToMain();
      const scene = new THREE.Scene();
      scene.name = `SF_StartupGeometryResidencyBatch:${index + 1}`;
      const proxyEntries = batch.work.map(({ object }) => createResidencyProxy(object, material));
      for (const entry of proxyEntries) scene.add(entry.proxy);
      const state = captureRendererState(renderer);
      const started = now();
      let success = false;
      // Upload events inherit the caller's admission label; swap in the batch's source names so
      // the probe can say WHICH meshes still reach first-bind inside a live round.
      const priorSubject = counters ? counters.admissionSubject : null;
      if (counters) {
        counters.admissionSubject = `res:${batch.work
          .map((item) => item.object && (item.object.name || item.object.type) || 'mesh')
          .slice(0, 10)
          .join(',')}`;
      }
      try {
        applyResidencyRendererState(renderer, target);
        renderer.render(scene, camera);
        success = true;
      } finally {
        if (counters) counters.admissionSubject = priorSubject;
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
        geometryProgress.update(index + 1, success);
      }
      }
    }, { urgent: options.urgent === true });
  } finally {
    // The material is renderer-scoped and shared — disposing it here would release the linked
    // program and force every later admission to relink it. It dies with the GL context.
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
  // Same serial-route pacing as the geometry census: every initTexture queues a GL upload, and
  // without a per-texture drain the queue drains inside one forced finish downstream.
  const paceQueue = typeof options.paceQueue === 'function'
    ? options.paceQueue
    : makeGpuQueuePacer(renderer);
  const textures = collectStartupTextures(subjects);
  for (const texture of Array.isArray(options.textures) ? options.textures : []) {
    if (texture && texture.isTexture === true && !textures.includes(texture)) textures.push(texture);
  }
  // Context restore rebuilt every GL object, so stamps recorded against the dead context lie:
  // that call site passes ignoreResidentStamps, and clearing the map makes the pass re-upload
  // everything (matching the geometry spacefaceGpuResident handling) then stamp fresh.
  if (options.ignoreResidentStamps === true) textureUploadVersions.delete(renderer);
  const uploadVersions = textureUploadVersionMap(renderer);
  const uploads = [];
  let residentTextures = 0;
  const count = textures.length;
  const textureProgress = beginBootWork(renderer, 'textures', count);
  const deadlineMs = Number(options.deadlineMs);
  const hasDeadline = Number.isFinite(deadlineMs) && deadlineMs >= 0;
  const startedAt = now();
  let hitDeadline = false;
  for (let index = 0; index < count; index++) {
    if (hasDeadline && now() - startedAt >= deadlineMs) {
      hitDeadline = true;
      break;
    }
    const texture = textures[index];
    // Video/external textures bypass three's version gate inside the upload path
    // (updateVideoTexture runs on every call; ExternalTexture refreshes __webglTexture),
    // so they always have live work and never take the residency stamp path.
    if (typeof texture.version === 'number'
      && texture.isVideoTexture !== true
      && texture.isExternalTexture !== true
      && uploadVersions.get(texture) === texture.version) {
      // A stamped package texture may still carry its CPU mirror: detach is deferred while
      // dedupe siblings share its payload records, so retry the release — once this texture is
      // the entry's last live user the bytes can actually leave.
      detachPackageTexture(texture);
      residentTextures += 1;
      textureProgress.update(index + 1);
      continue;
    }
    if (isPackageTextureDetached(texture)) {
      // The CPU mirror was released after its proven upload. There is nothing to upload until a
      // context-restore rehydrate refills it — uploading now would push empty mips over the live
      // copy, so count it resident and skip.
      residentTextures += 1;
      textureProgress.update(index + 1);
      continue;
    }
    await yieldToMain();
    if (hasDeadline && now() - startedAt >= deadlineMs) {
      hitDeadline = true;
      break;
    }
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
      if (success) {
        uploads.push({ name, width, height, durationMs });
        uploadVersions.set(texture, texture.version);
        // The GPU copy is proven: release the decoded CPU mirror (mipmaps/source.data) for
        // marked render-package textures. Context restore rehydrates them on demand.
        detachPackageTexture(texture);
      }
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
      textureProgress.update(index + 1, success);
    }
    if (paceQueue) await paceQueue();
  }
  let geometryResidency;
  if (hitDeadline) {
    geometryResidency = { skipped: true, reason: 'loading-deadline' };
  } else if (options.includeGeometry === false) {
    geometryResidency = { skipped: true, reason: 'geometry residency owned by exact opening admission' };
  } else {
    geometryResidency = await prepareStartupGeometryResidency(renderer, subjects, {
      ...options,
      yieldToMain,
      onBlockingSlice,
      paceQueue,
      now,
    });
  }
  await yieldToMain();
  if (hitDeadline) {
    // Soft-GPU opening cook must still freeze a receipt after a bounded upload slice.
    // Mark partial, but do not skip — callers that treat skipped as "abandon cook" would
    // re-open the identity/plan hole we just closed.
    return {
      skipped: false,
      reason: 'loading-deadline-partial',
      textures: uploads.length,
      uploads,
      residentTextures,
      geometryResidency,
      partial: true,
    };
  }
  return {
    skipped: false,
    textures: textures.length,
    uploads,
    residentTextures,
    geometryResidency,
  };
}

export function yieldToBrowser() {
  if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Resume from a macrotask after rAF so GPU work cannot run inside the protected display
 * callback. The resume must also land after that frame's present: a timer-priority task races
 * the compositor beat, so the default dispatches at background priority like
 * armCallbackAfterPresent — bounded, so a saturated main thread cannot starve the admission
 * chain while it waits for an idle slot that never opens.
 *
 * options.boundMs tightens the unstick arm when a caller wants degraded cadence to keep
 * draining: racing present-vs-bound means a healthy cadence always resumes post-present
 * (identical behavior), while below ~1/boundMs fps each slice stops waiting a whole
 * present for its slot. The default 48 stays the starved-rAF unstick it was written as.
 */
export function yieldToNextPresent(options = {}) {
  return new Promise((resolve) => {
    const requestFrame = typeof options.requestFrame === 'function'
      ? options.requestFrame
      : (typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : null);
    const scheduleTask = typeof options.scheduleTask === 'function'
      ? options.scheduleTask
      : postTaskAtBackgroundPriorityBounded;
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
      const boundMs = Number.isFinite(Number(options.boundMs))
        ? Math.max(0, Number(options.boundMs))
        : 48;
      setTimeout(fire, boundMs);
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
