// Runtime authored-asset boundary for SpaceFace ship parts.
//
// This module deliberately owns transport, caching and authoring validation — not composition.
// `partsLibrary.js` consumes immutable part blueprints from here and decides where parts mount.
// The game keeps a synchronous visual-factory contract, so loads are started only after a real
// renderer is available. Required authored entities remain unpublished until their blueprint is
// ready; a temporary procedural body must never impersonate the final ship, station, or place.
import * as THREE from 'three';
import { applyAuthoredMaterialProfile, configureAuthoredMaterialProfiles } from './authoredMaterialProfiles.js';
import {
  disposeAssetResidency,
  getAssetResidency,
} from './assetResidency.js';
import { createRenderPackageLoader } from './renderPackageLoader.js';
import {
  renderPackagePilotForAssetId,
  renderPackagePilotForSourceUrl,
} from './renderPackageManifest.js';

export const ASSET_AUTHORING_CONTRACT = Object.freeze({
  version: 2,
  supportedVersions: Object.freeze([1, 2]),
  coordinates: Object.freeze({ handedness: 'right', forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre' }),
  rootExtras: Object.freeze({
    key: 'spacefaceAsset',
    required: Object.freeze({
      contractVersion: '1 | 2',
      slot: 'hull | cockpit | engine | fin | weapon | greeble | gear | pod | place',
      forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre',
      normalConvention: 'OpenGL',
      ormChannels: 'R=AO,G=Roughness,B=Metallic',
      textureCompression: 'KTX2/BasisU | KTX2/BasisU+mips | PNG-source',
    }),
  }),
  textures: Object.freeze({
    baseColor: 'sRGB',
    normal: 'tangent-space, OpenGL green-up',
    orm: 'AO/Roughness/Metallic packed into R/G/B',
    resolution: 'positive finite dimensions selected per asset and verified in representative play',
    requiredContainer: 'KTX2/BasisU via KHR_texture_basisu; contract v2 release assets include mip chains',
  }),
  tintRoles: Object.freeze(['hull', 'dark', 'accent', 'thruster', 'none']),
  canopy: Object.freeze({
    material: 'MeshPhysicalMaterial',
    transmission: 0.6,
    ior: 1.4,
    clearcoat: 1.0,
    authoredOptics: 'preserve valid glTF physical-material factors, maps, UV transforms, and channels',
    realtimeTransmission: 0,
  }),
  topology: Object.freeze({ edgeTreatment: 'asset-specific; runtime requires valid finite triangle geometry, not one modeling technique' }),
  runtime: Object.freeze({
    gltfLoader: 'three/addons/loaders/GLTFLoader.js',
    ktx2Loader: 'three/addons/loaders/KTX2Loader.js',
    dracoLoader: 'three/addons/loaders/DRACOLoader.js',
    meshoptDecoder: 'three/addons/libs/meshopt_decoder.module.js',
    basisTranscoder: 'vendor/addons/libs/basis/{basis_transcoder.js,basis_transcoder.wasm}',
    dracoDecoder: 'vendor/addons/libs/draco/gltf/{draco_decoder.js,draco_decoder.wasm,draco_wasm_wrapper.js}',
  }),
  nodeNames: Object.freeze({
    sockets: 'SOCKET_*',
    drive: 'HOOK_DRIVE_FAN | HOOK_DRIVE_CORE | HOOK_DRIVE_PLUME',
    damage: 'HOOK_NAV_* | HOOK_SENSOR_* | HOOK_ARMOR_* | HOOK_SECONDARY_*',
    mounts: 'MOUNT_COCKPIT | MOUNT_ENGINE_* | MOUNT_FIN_*',
    lod: 'LOD0_* | LOD1_* | LOD2_*',
  }),
});

export const ASSET_RUNTIME_DECODER_CONTRACT = Object.freeze({
  schema: 'spaceface.sg04AssetRuntimeDecoders.v1',
  gltfLoader: 'vendor/addons/loaders/GLTFLoader.js',
  ktx2Loader: 'vendor/addons/loaders/KTX2Loader.js',
  dracoLoader: 'vendor/addons/loaders/DRACOLoader.js',
  meshoptDecoder: 'vendor/addons/libs/meshopt_decoder.module.js',
  ktx2TranscoderPath: 'vendor/addons/libs/basis/',
  ktx2WorkerPath: 'vendor/addons/libs/basis/basis_transcoder.worker.js',
  dracoDecoderPath: 'vendor/addons/libs/draco/gltf/',
  compressedTextureExtension: 'KHR_texture_basisu',
  meshCompressionExtensions: Object.freeze([
    'KHR_draco_mesh_compression',
    'EXT_meshopt_compression',
    'KHR_meshopt_compression',
  ]),
});

const warned = new Set();
const WHOLE_SHIP_ACCESSORY_TOKENS = Object.freeze(['antenna', 'decal', 'canopy', 'lens', 'clamp', 'brace', 'identity', 'cockpit']);
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_CHUNK_JSON = 0x4e4f534a;
const _inverseRoot = new THREE.Matrix4();
const _relative = new THREE.Matrix4();
const _anchorRelative = new THREE.Matrix4();
const _bounds = new THREE.Box3();
const _boundsSize = new THREE.Vector3();
const _boundsCenter = new THREE.Vector3();
const _transformPosition = new THREE.Vector3();
const _transformQuaternion = new THREE.Quaternion();
const _transformScale = new THREE.Vector3();
const _recomposed = new THREE.Matrix4();

export class AssetContractError extends Error {
  constructor(url, errors, warnings = []) {
    super(`[assetLoader] ${url} violates the authored-part contract:\n- ${errors.join('\n- ')}`);
    this.name = 'AssetContractError';
    this.url = url;
    this.errors = errors;
    this.warnings = warnings;
  }
}

/**
 * Admit one task while the runtime is active. The task is cached before its factory runs so a
 * synchronous retirement owns (and awaits) every task whose admission already succeeded.
 */
export function admitAuthoredAssetTask(runtime, cacheKey, createTask) {
  if (!runtime || runtime.retiring) return null;
  if (!runtime.assets.has(cacheKey)) {
    const task = Promise.resolve().then(createTask);
    runtime.assets.set(cacheKey, task);
    const pendingTasks = runtime.pendingAssetTasks || (runtime.pendingAssetTasks = new Set());
    pendingTasks.add(task);
    task.then(
      () => pendingTasks.delete(task),
      () => pendingTasks.delete(task),
    );
  }
  return runtime.assets.get(cacheKey);
}

/**
 * Retire one decoder runtime without revoking worker object URLs that in-flight asset tasks own.
 * Cache visibility closes synchronously; decoder disposal happens once after the task snapshot has
 * settled, including rejection paths.
 */
export function retireAuthoredAssetRuntime(runtime) {
  if (!runtime) return Promise.resolve();
  if (runtime.retirementPromise) return runtime.retirementPromise;

  runtime.retiring = true;
  const ownedTasks = runtime.pendingAssetTasks
    ? [...runtime.pendingAssetTasks]
    : [...runtime.assets.values()];
  runtime.assets.clear();
  runtime.failures.clear();
  if (runtime.pendingAssetTasks) runtime.pendingAssetTasks.clear();

  runtime.retirementPromise = Promise.allSettled(ownedTasks)
    .then(() => disposeRuntimeDecoders(runtime), () => disposeRuntimeDecoders(runtime))
    .then(() => undefined, () => undefined);
  return runtime.retirementPromise;
}

/**
 * Renderer-to-runtime ownership. Disposal detaches the renderer synchronously so later callers can
 * acquire a fresh runtime, while repeated disposal keeps the original guarded retirement Promise.
 */
export function createAuthoredAssetRuntimeRegistry(runtimeFactory) {
  const activeByRenderer = new WeakMap();
  const retirementByRenderer = new WeakMap();

  function get(renderer) {
    let runtimePromise = activeByRenderer.get(renderer);
    if (!runtimePromise) {
      retirementByRenderer.delete(renderer);
      runtimePromise = Promise.resolve().then(() => runtimeFactory(renderer));
      activeByRenderer.set(renderer, runtimePromise);
    }
    return runtimePromise;
  }

  function peek(renderer) {
    return activeByRenderer.get(renderer) || null;
  }

  function dispose(renderer) {
    const runtimePromise = activeByRenderer.get(renderer);
    if (!runtimePromise) return retirementByRenderer.get(renderer) || Promise.resolve();

    activeByRenderer.delete(renderer);
    const retirementPromise = runtimePromise
      .then((runtime) => retireAuthoredAssetRuntime(runtime))
      .catch(() => undefined);
    retirementByRenderer.set(renderer, retirementPromise);
    return retirementPromise;
  }

  return Object.freeze({ get, peek, dispose });
}

function disposeRuntimeDecoders(runtime) {
  try { runtime.renderPackages?.dispose('authored-runtime-retired'); } catch (_) {}
  const decoders = runtime.disposableDecoders || [];
  runtime.disposableDecoders = [];
  for (const decoder of decoders) {
    try { if (decoder && typeof decoder.dispose === 'function') decoder.dispose(); } catch (_) {}
  }
}

/**
 * Process-wide shared KTX2Loader ownership for authored-asset runtimes.
 *
 * Three.js warns when multiple KTX2Loader instances initialize (each loads the Basis
 * transcoder and allocates a worker pool). Main flight and New Game ship preview each
 * create their own authored-asset runtime; they must share one loader. Reference counting
 * keeps the shared loader alive while any runtime still owns it, so disposing the preview
 * runtime cannot revoke the main runtime's transcoder mid-session.
 *
 * `acquire(renderer)` re-runs `detectSupport(renderer)` so each runtime still stamps
 * support against its own WebGL/WebGPU context before loads proceed.
 *
 * @param {{ createLoader?: () => Promise<{ detectSupport?: Function, dispose?: Function }> }} [options]
 * @returns {{ acquire: Function, release: Function, peek: Function }}
 */
export function createSharedKtx2LoaderOwner(options = {}) {
  const createLoader = typeof options.createLoader === 'function'
    ? options.createLoader
    : createDefaultKtx2Loader;
  let shared = null;

  async function acquire(renderer) {
    if (!shared) {
      const entry = {
        refs: 0,
        loader: null,
        ready: null,
      };
      entry.ready = Promise.resolve()
        .then(() => createLoader())
        .then((loader) => {
          entry.loader = loader;
          return loader;
        });
      shared = entry;
    }

    const entry = shared;
    entry.refs += 1;
    try {
      const loader = await entry.ready;
      if (renderer && loader && typeof loader.detectSupport === 'function') {
        loader.detectSupport(renderer);
      }
      return loader;
    } catch (error) {
      releaseEntry(entry);
      throw error;
    }
  }

  function release(loader) {
    if (!shared) return;
    // Only the shared generation may be released through this owner. A stale handle from a
    // previous fully-retired generation is ignored so double-release cannot poison a new loader.
    if (loader != null && shared.loader != null && loader !== shared.loader) return;
    releaseEntry(shared);
  }

  function releaseEntry(entry) {
    if (!entry || entry.refs <= 0) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    if (shared === entry) shared = null;
    // Prefer synchronous dispose once the loader exists so runtime retirement matches the
    // prior disposableDecoders timing. If create is still in flight, dispose after settle.
    if (entry.loader && typeof entry.loader.dispose === 'function') {
      try { entry.loader.dispose(); } catch (_) { /* dispose is best-effort */ }
      return;
    }
    entry.ready.then((loader) => {
      try {
        if (loader && typeof loader.dispose === 'function') loader.dispose();
      } catch (_) { /* dispose is best-effort */ }
    }).catch(() => { /* creation failure: nothing to dispose */ });
  }

  function peek() {
    if (!shared) return null;
    return Object.freeze({
      refCount: shared.refs,
      loader: shared.loader,
    });
  }

  return Object.freeze({ acquire, release, peek });
}

async function createDefaultKtx2Loader() {
  const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath);
  return configureCspSafeKtx2Loader(ktx2);
}

/**
 * Three's stock KTX2Loader builds its Basis worker with a blob at runtime. The Basis embind glue
 * requires Function construction, so a strict packaged-page CSP terminates every worker while
 * Three's WorkerPool leaves the corresponding texture promises pending forever. Use a deterministic
 * prebuilt same-origin worker instead; Electron grants unsafe-eval only on that worker response.
 */
export function configureCspSafeKtx2Loader(ktx2, options = {}) {
  if (!ktx2 || !ktx2.workerPool || typeof ktx2.workerPool.setWorkerCreator !== 'function') {
    throw new TypeError('CSP-safe KTX2 setup requires a KTX2Loader worker pool.');
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const WorkerImpl = options.WorkerImpl || globalThis.Worker;
  const MessageEventImpl = options.MessageEventImpl || globalThis.MessageEvent;
  const workerUrl = options.workerUrl || ASSET_RUNTIME_DECODER_CONTRACT.ktx2WorkerPath;
  const transcoderPath = options.transcoderPath || ktx2.transcoderPath
    || ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath;
  const wasmUrl = options.wasmUrl || `${transcoderPath}basis_transcoder.wasm`;
  let disposed = false;

  ktx2.workerSourceURL = workerUrl;
  ktx2.transcoderBinary = null;
  ktx2.transcoderPending = null;
  ktx2.init = function initCspSafeKtx2Transcoder() {
    if (disposed) return Promise.reject(new Error('KTX2 loader has been disposed.'));
    if (!this.transcoderPending) {
      this.transcoderPending = Promise.resolve().then(async () => {
        if (typeof fetchImpl !== 'function') throw new Error('KTX2 transcoder requires fetch.');
        const response = await fetchImpl(wasmUrl, { cache: 'force-cache' });
        if (!response || response.ok !== true) {
          throw new Error(`KTX2 transcoder fetch failed: HTTP ${response && response.status || 0} ${wasmUrl}`);
        }
        const binary = await response.arrayBuffer();
        if (disposed) throw new Error('KTX2 loader was disposed during transcoder initialization.');
        this.transcoderBinary = binary;
        this.workerPool.setWorkerCreator(() => {
          if (typeof WorkerImpl !== 'function') throw new Error('KTX2 transcoder requires Web Workers.');
          const worker = new WorkerImpl(workerUrl);
          const transcoderBinary = this.transcoderBinary.slice(0);
          installWorkerFailureDrain(worker, MessageEventImpl);
          worker.postMessage({ type: 'init', config: this.workerConfig, transcoderBinary }, [transcoderBinary]);
          return worker;
        });
      });
    }
    return this.transcoderPending;
  };
  ktx2.dispose = function disposeCspSafeKtx2Transcoder() {
    if (disposed) return;
    disposed = true;
    this.workerPool.dispose();
    this.transcoderBinary = null;
    this.transcoderPending = null;
    this.workerSourceURL = '';
  };
  return ktx2;
}

function installWorkerFailureDrain(worker, MessageEventImpl) {
  if (!worker || typeof worker.addEventListener !== 'function'
    || typeof worker.dispatchEvent !== 'function' || typeof MessageEventImpl !== 'function') return;
  worker.addEventListener('error', (event) => {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    const error = event && event.message ? String(event.message) : 'KTX2 worker failed';
    const rejectTask = () => worker.dispatchEvent(new MessageEventImpl('message', {
      data: { type: 'error', error, data: {} },
    }));
    try { worker.terminate(); } catch (_) {}
    // WorkerPool has no error channel. Replace posting before resolving the current task so each
    // queued texture receives the same rejection instead of being transferred to a dead worker.
    worker.postMessage = () => queueMicrotask(rejectTask);
    rejectTask();
  });
}

/** Module-lifetime shared KTX2 owner used by every authored-asset runtime in this process. */
const sharedKtx2LoaderOwner = createSharedKtx2LoaderOwner();

const authoredAssetRuntimeRegistry = createAuthoredAssetRuntimeRegistry(createRuntime);
const authoredAssetPerfCountersByRenderer = new WeakMap();

/**
 * Bind authored-asset instrumentation to the real GameState counter sink that owns this renderer.
 *
 * THREE.WebGLRenderer also exposes a `.state` property, but that object is Three's internal WebGL
 * state cache — it is not SpaceFace GameState. Inferring counter ownership from that similarly named
 * property creates a second disabled perf runtime and replaces `window.__SPACEFACE_PERF__` during
 * New Game asset admission. The renderer system therefore publishes the exact sink once, before any
 * authored runtime can be created, and every asset/package counter reads only this explicit binding.
 */
export function bindAuthoredAssetPerfCounters(renderer, counters) {
  if (!renderer || (typeof renderer !== 'object' && typeof renderer !== 'function')) {
    throw new TypeError('authored-asset perf counters require a renderer owner');
  }
  if (!counters || typeof counters.isEnabled !== 'function') {
    throw new TypeError('authored-asset perf counters require a Tier-1 counter sink');
  }
  const current = authoredAssetPerfCountersByRenderer.get(renderer);
  if (current) {
    if (current !== counters) throw new Error('authored-asset perf counter owner cannot change after binding');
    return current;
  }
  if (authoredAssetRuntimeRegistry.peek(renderer)) {
    throw new Error('authored-asset perf counters must bind before the renderer runtime is created');
  }
  authoredAssetPerfCountersByRenderer.set(renderer, counters);
  return counters;
}

function boundPerfCountersForRenderer(renderer) {
  return renderer ? authoredAssetPerfCountersByRenderer.get(renderer) || null : null;
}

/**
 * Explicit authored-asset lifetime for preview roots and other non-entity render surfaces.
 * The lease is intentionally independent from renderer lifetime: replacing a dock/preview root can
 * release its GLB generation immediately while keeping the renderer and decoder runtime alive.
 */
export function createAuthoredAssetLease(renderer, options = {}) {
  const residency = options.registry || getAssetResidency(renderer);
  const owner = options.owner || Object.freeze({
    type: 'authored-asset-lease',
    id: options.ownerId == null ? null : String(options.ownerId),
  });
  const role = options.role || 'preview';
  const sectorId = options.sectorId == null ? null : String(options.sectorId);
  let active = true;
  const isActive = () => active && !!residency && !residency.isOwnerReleased(owner);
  const loadOptions = Object.freeze({
    residencyOwner: owner,
    residencyRole: role,
    sectorId,
    isResidencyOwnerActive: isActive,
  });
  return Object.freeze({
    owner,
    loadOptions,
    isActive,
    load(url, requestOptions = {}) {
      if (!active) return Promise.resolve(null);
      return loadAuthoredPart(url, { ...requestOptions, renderer, ...loadOptions });
    },
    retain(key) {
      return active && !!residency && residency.retain(key, owner, { role, sectorId });
    },
    release(reason = 'authored-asset-lease-released') {
      if (!active) return 0;
      active = false;
      return residency ? residency.releaseOwner(owner, reason) : 0;
    },
  });
}

/**
 * Load and validate one authored GLB part. Failures resolve to null by contract: the caller's
 * procedural part remains authoritative and no entity may disappear because an asset is absent.
 */
export async function loadAuthoredPart(url, options = {}) {
  const { renderer, slot = null, optional = false } = options;
  if (!renderer) return null;

  let runtime;
  try {
    runtime = await runtimeFor(renderer);
  } catch (error) {
    warnOnce('runtime', '[assetLoader] GLTF/KTX2 runtime unavailable; authored parts will use procedural fallbacks', error);
    return null;
  }

  if (runtime.retiring) return null;
  if (typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) return null;

  const renderPackagePilot = renderPackagePilotForSourceUrl(url);
  if (renderPackagePilot) {
    return loadAuthoredRenderPackagePilot(runtime, renderPackagePilot, url, options);
  }
  assertSourceRouteAdmitted(url);

  const cacheKey = `${url}::${slot || '*'}`;
  const residency = getAssetResidency(renderer);
  const residencyOwner = options.residencyOwner || runtime.defaultResidencyOwner;
  const request = residency && residencyOwner
    ? residency.beginRequest(cacheKey, residencyOwner, {
      role: options.residencyRole || (options.residencyOwner ? 'live-boundary' : 'runtime-cache'),
      sectorId: options.sectorId || null,
    })
    : null;
  if (request && !request.shouldDecode()) {
    request.cancel('owner-departed-before-decode');
    return null;
  }

  const task = admitAuthoredAssetTask(runtime, cacheKey, () => (
    loadGltfDocument(url, runtime.gltf)
      .then((gltf) => {
        // Tier-1 causal count: a full semantic compile of a source GLB into a runtime blueprint.
        const tier1 = tier1CountersForRenderer(renderer);
        if (tier1) tier1.countRuntimeSemanticCompile('source-blueprint-compile', 0);
        return compileBlueprint(url, gltf, slot, {
          cacheKey,
          residency,
          onEvict() {
            runtime.assets.delete(cacheKey);
            runtime.failures.delete(cacheKey);
          },
        });
      })
      .catch((error) => {
        if (!runtime.retiring) {
          runtime.failures.set(cacheKey, error);
          if (error instanceof AssetContractError) {
            if (!optional) warnOnce(cacheKey, error.message);
          } else if (!optional) {
            warnOnce(cacheKey, `[assetLoader] failed to load ${url}; procedural fallback retained`, error);
          }
        }
        return null;
      })
  ));
  if (!task) {
    if (request) request.cancel('runtime-retired-before-decode');
    return null;
  }
  const blueprint = await task;
  if (!blueprint) {
    if (request) request.cancel('decode-failed');
    return null;
  }
  if (request && typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) {
    request.cancel('owner-departed-during-decode');
    return null;
  }
  if (request && !request.commit()) return null;
  return blueprint;
}

export async function preloadAuthoredParts(requests, renderer, options = {}) {
  const pending = [];
  for (const rawRequest of requests || []) {
    const request = typeof rawRequest === 'string' ? { url: rawRequest } : rawRequest;
    if (!request || !request.url) continue;
    pending.push(request);
  }
  if (pending.length === 0) return [];

  const records = new Array(pending.length);
  const loadPart = typeof options.loadPart === 'function' ? options.loadPart : loadAuthoredPart;
  const isActive = typeof options.isActive === 'function' ? options.isActive : () => true;
  const concurrency = Math.max(1, Math.min(
    pending.length,
    Math.floor(Number(options.concurrency) || 1),
  ));
  const cancelled = {};
  const cancelPromise = options.cancelPromise && typeof options.cancelPromise.then === 'function'
    ? Promise.resolve(options.cancelPromise).then(() => cancelled)
    : null;
  let next = 0;

  // GLB fetches are local, but decode/transcode and resource registration are not free. The
  // default remains serial for the canonical library. Sector prewarm may opt into a small bounded
  // lane because its 40-60 package requests otherwise hold the entry gate for longer than the
  // authored-boundary work itself; this is still capped so a sector cannot become a decode spike.
  const worker = async () => {
    while (isActive()) {
      const index = next++;
      if (index >= pending.length) return;
      const request = pending[index];
      if (!isActive()) return;
      const load = Promise.resolve().then(() => loadPart(request.url, { ...request, renderer }));
      // Cancellation intentionally returns before an underlying shared package decode settles.
      // Observe its eventual rejection so a superseded generation cannot create an unhandled task.
      load.catch(() => {});
      const record = cancelPromise
        ? await Promise.race([load, cancelPromise])
        : await load;
      if (record === cancelled || !isActive()) return;
      records[index] = record;
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return records.filter((record) => record !== undefined);
}

/**
 * Make a sector's spawnable archetypes resident and shader-warm, then swap to it.
 *
 * `rotateSector` alone is a swap, not a prepare-then-swap: it warms the sector being *left* and then
 * switches, which leaves the sector being *entered* to demand-load its archetypes while the player
 * is already flying in it. Every one of those loads is a decode plus a GPU upload plus a first-draw
 * shader compile, arriving exactly when the frame budget is least able to absorb them.
 *
 * So prepare first. Every archetype is retained under an owner scoped to the incoming sector, the
 * result is checked for completeness, shaders are warmed while nothing is being drawn — and only
 * then does the swap happen. Rotating before the set is resident would defeat the whole point, which
 * is why the rotate is the last statement and why an incomplete set throws instead of degrading.
 *
 * `warmShaders` is injected rather than imported so the residency contract does not depend on the
 * precompile pipeline; callers that have a renderer pass `precompile`'s warm entry point.
 */
export async function prepareSectorEntry(renderer, sectorId, requestsOrUrls, options = {}) {
  const exactSectorId = sectorId == null ? null : String(sectorId);
  if (!exactSectorId) throw new Error('prepareSectorEntry requires a sector id');
  const requested = [];
  const seen = new Set();
  for (const rawRequest of requestsOrUrls || []) {
    const request = typeof rawRequest === 'string' ? { url: rawRequest, slot: null } : rawRequest;
    if (!request || !request.url) continue;
    const normalized = Object.freeze({
      ...request,
      url: String(request.url),
      slot: request.slot == null ? null : String(request.slot),
    });
    const key = `${normalized.url}::${normalized.slot || '*'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requested.push(normalized);
  }
  const owner = options.owner || Object.freeze({ type: 'asset-incoming-sector', sectorId: exactSectorId });
  const residency = options.residency || getAssetResidency(renderer);
  const isEntryActive = typeof options.isEntryActive === 'function' ? options.isEntryActive : () => true;
  const releaseOwner = (reason) => {
    if (residency && typeof residency.releaseOwner === 'function') {
      residency.releaseOwner(owner, reason);
    }
  };

  const cancelled = () => {
    releaseOwner('sector-prewarm-cancelled');
    return Object.freeze({
      schema: 'spaceface.sectorPrepare.v1',
      sectorId: exactSectorId,
      resident: 0,
      rotated: false,
      cancelled: true,
      owner,
    });
  };
  const cancellationSignal = {};
  const cancelPromise = options.cancelPromise && typeof options.cancelPromise.then === 'function'
    ? Promise.resolve(options.cancelPromise).then(() => cancellationSignal)
    : null;

  // `loadPart` and `residency` are injectable so the ordering contract can be exercised for real
  // headlessly. A check that re-implemented this body would only prove itself consistent.
  const loadPart = options.loadPart || loadAuthoredPart;
  const records = [];
  let failureReason = 'sector-prewarm-load-failed';
  try {
    for (const request of requested) {
      if (!isEntryActive()) return cancelled();
      const load = Promise.resolve().then(() => loadPart(request.url, {
        ...request,
        renderer,
        sectorId: exactSectorId,
        residencyOwner: owner,
        residencyRole: 'sector-prewarm',
        isResidencyOwnerActive: isEntryActive,
      }));
      // A departed sector must not wait for a shared package decode before its successor can own
      // this entity id. The decode remains observed and may finish for another active consumer.
      load.catch(() => {});
      const record = cancelPromise
        ? await Promise.race([load, cancelPromise])
        : await load;
      if (record === cancellationSignal || !isEntryActive()) return cancelled();
      records.push(record);
    }
    if (!isEntryActive()) return cancelled();

    const missing = requested.filter((_, index) => !records[index]);
    if (missing.length) {
      failureReason = 'sector-prewarm-incomplete';
      throw new AssetContractError(`sector:${exactSectorId}`, [
        `${missing.length} of ${requested.length} spawnable archetypes did not become resident before `
        + `scene publish: ${missing.slice(0, 5).map((request) => request.url).join(', ')}${missing.length > 5 ? '…' : ''}`,
      ]);
    }

    if (typeof options.warmShaders === 'function') {
      failureReason = 'sector-prewarm-shader-warm-failed';
      const warm = Promise.resolve().then(() => options.warmShaders(records.filter(Boolean), exactSectorId));
      warm.catch(() => {});
      const warmed = cancelPromise
        ? await Promise.race([warm, cancelPromise])
        : await warm;
      if (warmed === cancellationSignal || !isEntryActive()) return cancelled();
    }
    if (!isEntryActive()) return cancelled();

    // Swap last. Everything above is the "prepare"; this single call is the "then swap".
    failureReason = 'sector-prewarm-rotate-failed';
    const rotated = residency ? residency.rotateSector(exactSectorId) : false;
    return Object.freeze({
      schema: 'spaceface.sectorPrepare.v1',
      sectorId: exactSectorId,
      resident: records.length,
      rotated,
      cancelled: false,
      owner,
    });
  } catch (error) {
    releaseOwner(failureReason);
    throw error;
  }
}

export async function getAuthoredAssetDiagnostic(renderer, url, slot = null) {
  if (!renderer) return null;
  try {
    const runtime = await runtimeFor(renderer);
    return runtime.failures.get(`${url}::${slot || '*'}`) || null;
  } catch (error) {
    return error;
  }
}

export async function getAuthoredAssetRuntimeInfo(renderer) {
  if (!renderer) return null;
  try {
    const runtime = await runtimeFor(renderer);
    return {
      schema: 'spaceface.authoredAssetRuntimeInfo.v1',
      source: runtime.source,
      decoders: { ...runtime.decoders },
      paths: { ...runtime.paths },
    };
  } catch (error) {
    return {
      schema: 'spaceface.authoredAssetRuntimeInfo.v1',
      source: 'unavailable',
      decoders: {
        gltf: false,
        ktx2: false,
        draco: false,
        meshopt: false,
      },
      paths: { ...ASSET_RUNTIME_DECODER_CONTRACT },
      error: error && error.message ? error.message : String(error),
    };
  }
}

export async function invalidateAuthoredAsset(renderer, url = null) {
  const runtimePromise = authoredAssetRuntimeRegistry.peek(renderer);
  if (!runtimePromise) return false;
  try {
    const runtime = await runtimePromise;
    const residency = getAssetResidency(renderer);
    const invalidateKey = (key) => {
      if (residency) {
        residency.release(key, runtime.defaultResidencyOwner, 'asset-cache-invalidated');
        // A live boundary/preview still owns this exact generation. Keep its Promise canonical so
        // invalidation cannot admit a second decode under the same cache key.
        if (residency.has(key)) return false;
      }
      runtime.assets.delete(key);
      return true;
    };
    if (!url) {
      for (const key of [...runtime.assets.keys()]) invalidateKey(key);
      runtime.failures.clear();
      return true;
    }
    for (const key of [...runtime.assets.keys()]) if (key.startsWith(`${url}::`)) invalidateKey(key);
    for (const key of [...runtime.failures.keys()]) if (key.startsWith(`${url}::`)) runtime.failures.delete(key);
    return true;
  } catch {
    return false;
  }
}

export async function invalidateFailedAuthoredAssets(renderer) {
  const runtimePromise = authoredAssetRuntimeRegistry.peek(renderer);
  if (!runtimePromise) return 0;
  try {
    const runtime = await runtimePromise;
    const failedKeys = [...runtime.failures.keys()];
    for (const key of failedKeys) runtime.assets.delete(key);
    runtime.failures.clear();
    return failedKeys.length;
  } catch {
    return 0;
  }
}

export function disposeAuthoredAssetRuntime(renderer) {
  const retirement = authoredAssetRuntimeRegistry.dispose(renderer);
  return Promise.resolve(retirement).finally(() => {
    disposeAssetResidency(renderer, 'authored-runtime-disposed');
  });
}

function runtimeFor(renderer) {
  return authoredAssetRuntimeRegistry.get(renderer);
}

/** Tier-1 causal counter sink explicitly owned by this renderer, or null when counting is off. */
function tier1CountersForRenderer(renderer) {
  const tier1 = boundPerfCountersForRenderer(renderer);
  return tier1 && tier1.isEnabled() ? tier1 : null;
}

async function createRuntime(renderer) {
  const decoders = { gltf: false, ktx2: false, draco: false, meshopt: false };
  const paths = { ...ASSET_RUNTIME_DECODER_CONTRACT };
  const disposableDecoders = [];
  let gltf;
  let source = 'three/addons/loaders/GLTFLoader.js';

  try {
    const mod = await import('three/addons/loaders/GLTFLoader.js');
    gltf = new mod.GLTFLoader();
    decoders.gltf = true;
  } catch (error) {
    warnOnce('official-gltf-loader', '[assetLoader] official GLTFLoader unavailable; compressed release assets will not load', error);
    const mod = await import('./GLTFLoader.js');
    gltf = new mod.GLTFLoader();
    source = './GLTFLoader.js';
  }

  if (decoders.gltf) {
    await attachRuntimeDecoders(gltf, renderer, decoders, disposableDecoders);
  }

  const residency = getAssetResidency(renderer);
  const renderPackages = createRenderPackageLoader({
    residency,
    counters: boundPerfCountersForRenderer(renderer),
    configureGltfLoader: async (loader) => {
      await attachRuntimeDecoders(loader, renderer, decoders, disposableDecoders);
    },
    prepareDecoded(decoded, packageMetadata, renderUrl, plan) {
      const pilot = renderPackagePilotForAssetId(packageMetadata.assetId);
      if (!pilot) throw new Error(`Unknown production render package ${packageMetadata.assetId}.`);
      return prepareRenderPackageBlueprint(pilot, decoded, packageMetadata, { renderer, plan });
    },
  });

  return {
    gltf,
    renderPackages,
    assets: new Map(),
    pendingAssetTasks: new Set(),
    failures: new Map(),
    source,
    decoders,
    paths,
    disposableDecoders,
    retiring: false,
    retirementPromise: null,
    defaultResidencyOwner: Object.freeze({ type: 'authored-runtime-cache' }),
  };
}

/**
 * Prepare the runtime blueprint for one decoded render package.
 *
 * Extracted from the inline `prepareDecoded` closure so the shipping preparation step is reachable
 * from headless harnesses and tests without standing up a renderer. Behaviour is unchanged.
 *
 * `plan` is the loader's flat instance plan for this package (see renderPackageLoader). It is the
 * seam through which package-carried semantics replace source recompilation; while v1 metadata
 * carries no primitives/markers/bounds, this still compiles the blueprint from the decoded graph
 * ONCE per package load, and the Tier-1 counter below is what keeps that visible.
 */
export function prepareRenderPackageBlueprint(pilot, decoded, packageMetadata, options = {}) {
  const renderer = options.renderer || null;
  const tier1 = tier1CountersForRenderer(renderer);
  const table = packageMetadata && packageMetadata.runtime;

  // The shipping route binds the package's precompiled runtime table: no scene traversal, no
  // name-based discovery, no bounds computation. The counter deliberately keeps the same field and
  // changes only its cause and magnitude — a field that simply went to zero would be
  // indistinguishable from a deleted call site, which is exactly how a counter fails toward good news.
  if (table && options.plan) {
    if (tier1) tier1.countRuntimeSemanticCompile('package-runtime-bind', table.primitives.length);
    const bound = bindAuthoredRuntimeTable(pilot.sourceUrl, decoded, pilot.slot, table, options.plan);
    if (bound.assetId !== pilot.runtimeAssetId) {
      throw new Error(
        `Render package ${pilot.assetId} decoded runtime asset ${bound.assetId} instead of ${pilot.runtimeAssetId}.`,
      );
    }
    return bound;
  }

  // Fallback: a package compiled before the runtime table existed. Counted separately so the
  // remaining derivation stays visible rather than blending into the bind path.
  if (tier1) tier1.countRuntimeSemanticCompile('package-blueprint-compile', 0);
  const blueprint = compileBlueprint(pilot.sourceUrl, decoded, pilot.slot);
  if (blueprint.assetId !== pilot.runtimeAssetId) {
    throw new Error(
      `Render package ${pilot.assetId} decoded runtime asset ${blueprint.assetId} instead of ${pilot.runtimeAssetId}.`,
    );
  }
  return blueprint;
}

/**
 * Bind a loaded render package to its prepared blueprint, producing the authored-part record the
 * parts library consumes. Extracted from `loadAuthoredRenderPackagePilot` unchanged.
 */
export function assembleRenderPackageRecord(renderPackage, url, assetLabel = null, options = {}) {
  const blueprint = renderPackage.prepared;
  if (!blueprint || blueprint.url !== url) {
    throw new Error(`Render package ${assetLabel || renderPackage.assetId} has no prepared blueprint for ${url}.`);
  }
  const residency = {};
  Object.defineProperties(residency, {
    key: { value: renderPackage.residencyKey, enumerable: true },
    generation: { value: renderPackage.contentHash, enumerable: true },
    state: {
      enumerable: true,
      get() { return renderPackage.evicted ? 'evicted' : 'resident'; },
    },
  });
  return Object.freeze({
    ...blueprint,
    renderPackage,
    flightStaticV3: options.flightStaticV3 === true,
    residency: Object.freeze(residency),
    report: Object.freeze({
      ...blueprint.report,
      renderPackage: Object.freeze({
        route: 'render-package',
        assetId: renderPackage.assetId,
        contentHash: renderPackage.contentHash,
      }),
    }),
  });
}

async function loadAuthoredRenderPackagePilot(runtime, pilot, url, options) {
  const slot = options.slot || null;
  const optional = options.optional === true;
  const cacheKey = `${url}::${slot || '*'}`;
  const task = admitAuthoredAssetTask(runtime, cacheKey, () => (
    runtime.renderPackages.load(pilot.metadataUrl, {
      expectedContentHash: pilot.expectedContentHash,
      ...(pilot.flightStaticV3 === true ? { expectedRuntimeHash: pilot.expectedRuntimeHash } : {}),
    }).then((renderPackage) => assembleRenderPackageRecord(renderPackage, url, pilot.assetId, {
      flightStaticV3: pilot.flightStaticV3 === true,
    }))
      .catch((error) => {
        if (!runtime.retiring) {
          runtime.failures.set(cacheKey, error);
          if (!optional) warnOnce(cacheKey, `[assetLoader] production render package failed for ${url}`, error);
        }
        return null;
      })
  ));
  if (!task) return null;

  const record = await task;
  if (!record) return null;
  if (typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) return null;
  const owner = options.residencyOwner || runtime.defaultResidencyOwner;
  if (owner) {
    record.renderPackage.retain(owner, {
      role: options.residencyRole || (options.residencyOwner ? 'live-boundary' : 'runtime-cache'),
      sectorId: options.sectorId || null,
    });
  }
  return record;
}

async function attachRuntimeDecoders(gltf, renderer, decoders, disposableDecoders) {
  if (typeof gltf.setKTX2Loader === 'function') {
    try {
      // Shared across runtimes (main + preview). Runtime retirement only releases a ref —
      // it must not dispose() the underlying KTX2Loader while another runtime still holds it.
      const ktx2 = await sharedKtx2LoaderOwner.acquire(renderer);
      try {
        gltf.setKTX2Loader(ktx2);
        disposableDecoders.push({
          dispose() { sharedKtx2LoaderOwner.release(ktx2); },
        });
        decoders.ktx2 = true;
      } catch (attachError) {
        sharedKtx2LoaderOwner.release(ktx2);
        throw attachError;
      }
    } catch (error) {
      warnOnce('ktx2-loader', '[assetLoader] KTX2/BasisU decoder unavailable; release-compressed textures will fail', error);
    }
  }

  if (typeof gltf.setDRACOLoader === 'function') {
    try {
      const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
      const draco = new DRACOLoader();
      draco.setDecoderPath(ASSET_RUNTIME_DECODER_CONTRACT.dracoDecoderPath);
      gltf.setDRACOLoader(draco);
      disposableDecoders.push(draco);
      decoders.draco = true;
    } catch (error) {
      warnOnce('draco-loader', '[assetLoader] DRACO decoder unavailable; Draco-compressed meshes will fail', error);
    }
  }

  if (typeof gltf.setMeshoptDecoder === 'function') {
    try {
      const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
      gltf.setMeshoptDecoder(MeshoptDecoder);
      decoders.meshopt = !!MeshoptDecoder;
    } catch (error) {
      warnOnce('meshopt-loader', '[assetLoader] Meshopt decoder unavailable; meshopt-compressed meshes will fail', error);
    }
  }
}

function compileBlueprint(url, gltf, expectedSlot, residencyRegistration = null) {
  const scene = gltf && gltf.scene;
  if (!scene || !scene.isObject3D) throw new AssetContractError(url, ['GLB has no default scene']);

  const errors = [];
  const warnings = [];
  const metadata = readAssetMetadata(gltf, scene, expectedSlot);
  validateAssetMetadata(metadata, expectedSlot, errors);

  if (gltf.animations && gltf.animations.length) {
    errors.push('baked animation clips are forbidden; expose named HOOK_* nodes and let game state drive motion');
  }

  validateRootTransform(scene, errors);
  scene.updateMatrixWorld(true);
  _inverseRoot.copy(scene.matrixWorld).invert();
  const primitives = [];
  const markers = [];
  scene.traverse((node) => {
    if (node === scene) return;
    const lodRangeIssue = authoredLodMaxMetadataIssue(node.userData);
    if (lodRangeIssue) errors.push(`${label(node)} ${lodRangeIssue}`);
    const tags = collectTags(node, scene, metadata.slot, metadata.legacyPart === true);
    if (tags.tint && !ASSET_AUTHORING_CONTRACT.tintRoles.includes(String(tags.tint).toLowerCase())) {
      errors.push(`${label(node)} declares unknown tint role "${tags.tint}"`);
    }
    if (tags.damageRole && !['navLight', 'sensor', 'armor', 'secondary'].includes(tags.damageRole)) {
      errors.push(`${label(node)} declares unknown damage role "${tags.damageRole}"`);
    }
    if (tags.socketForward && (!Array.isArray(tags.socketForward) || tags.socketForward.length !== 3 ||
      !tags.socketForward.every(Number.isFinite) || Math.hypot(...tags.socketForward) < 1e-6)) {
      errors.push(`${label(node)} socket forward must be a finite non-zero [x,y,z] vector`);
    }
    const normalizedName = String(node.name || '').toUpperCase().replace(/[\s-]+/g, '_');
    if (normalizedName.startsWith('HOOK_') && !tags.drive && !tags.damageRole && metadata.legacyPart !== true) {
      errors.push(`${label(node)} uses an unknown HOOK_* name`);
    }

    _relative.multiplyMatrices(_inverseRoot, node.matrixWorld);
    validateNodeTransform(node, _relative, errors);
    if (node.isLight || node.isCamera) {
      errors.push(`${label(node)} embeds a ${node.isLight ? 'light' : 'camera'}; parts may contain only geometry and contract nodes`);
      return;
    }
    if (node.isLine || node.isPoints) {
      errors.push(`${label(node)} is a ${node.isLine ? 'line' : 'points'} primitive; ship parts must use triangle meshes`);
      return;
    }
    const nonRenderHelper = normalizedName === 'COLLISION_HULL'
      || node.userData?.nonRender === true
      || node.userData?.spaceface?.nonRender === true;
    if (node.isMesh && nonRenderHelper) {
      node.visible = false;
      return;
    }
    if (node.isMesh) {
      if (tags.socket || tags.mount) {
        errors.push(`${label(node)} uses ${tags.socket ? 'SOCKET_*' : 'MOUNT_*'} on renderable geometry; author an empty transform marker instead`);
      }
      if (node.isSkinnedMesh) errors.push(`${label(node)} is skinned; modular ship parts must be rigid`);
      if (node.isInstancedMesh) errors.push(`${label(node)} is pre-instanced; GLTFKit owns runtime instance pools`);
      if (node.morphTargetInfluences && node.morphTargetInfluences.length) errors.push(`${label(node)} uses morph targets; bind game-state hooks instead`);
      if (Array.isArray(node.material)) errors.push(`${label(node)} uses a material array; split it into one primitive per material for deterministic instancing`);
      if (!node.geometry || !node.material || Array.isArray(node.material)) return;

      const canopy = tags.canopy || isCanopy(node, metadata.slot);
      const material = canopy ? makeCanopyMaterial(node.material) : node.material;
      if (canopy) node.material = material;
      validatePrimitive(node, material, canopy, gltf, metadata, errors, warnings);
      const primitiveTags = buildPrimitiveTags(tags, metadata, canopy);
      node.userData = {
        ...(node.userData || {}),
        spacefacePartUrl: url,
        spacefaceTags: primitiveTags,
      };
      primitives.push(Object.freeze({
        key: `${url}#${node.uuid}`,
        name: node.name || `Primitive_${primitives.length}`,
        geometry: node.geometry,
        material,
        matrix: _relative.clone(),
        tags: primitiveTags,
      }));
    } else if (isContractMarker(node, tags)) {
      const markerTags = Object.freeze({
        ...cleanRuntimeTags(tags),
        lod: tags.lod || (metadata.legacyPart === true ? 'lod0' : undefined),
      });
      node.userData = {
        ...(node.userData || {}),
        spacefacePartUrl: url,
        spacefaceTags: markerTags,
      };
      markers.push(Object.freeze({
        name: node.name || `Marker_${markers.length}`,
        matrix: _relative.clone(),
        tags: markerTags,
        userData: Object.freeze({ ...node.userData }),
      }));
    }
  });

  if (!primitives.length) errors.push('part contains no mesh primitives');

  validateHookSurface(expectedSlot || metadata.slot, primitives, markers, errors, { legacyPart: metadata.legacyPart === true });
  if (isWholeShipUrl(url)) validateWholeShipBody(url, primitives, errors);

  _bounds.setFromObject(scene);
  _bounds.getSize(_boundsSize);
  _bounds.getCenter(_boundsCenter);
  if (![..._boundsSize.toArray(), ..._boundsCenter.toArray()].every(Number.isFinite) || _boundsSize.lengthSq() <= 0) {
    errors.push('part bounds are empty or non-finite');
  }

  const maxAxis = Math.max(_boundsSize.x, _boundsSize.y, _boundsSize.z, 1e-6);
  if (_boundsCenter.length() > maxAxis * 0.75) {
    warnings.push('pivot is far outside the visible bounds; mount placement may be surprising');
  }

  if (errors.length) throw new AssetContractError(url, errors, warnings);

  // Blender-authored semantic names are the stable material API. Apply the shared response policy
  // once to cached blueprint materials while preserving all authored maps, UV transforms, and tints.
  const materialProfile = configureAuthoredMaterialProfiles(scene, {
    assetId: metadata.assetId || fileStem(url),
  });

  const ktx2Textures = new Set();
  for (const primitive of primitives) {
    for (const texture of materialTextures(primitive.material)) {
      if (isKtx2Texture(texture, gltf, metadata)) ktx2Textures.add(texture.uuid);
    }
  }

  const residencyState = {
    key: residencyRegistration && residencyRegistration.cacheKey || `${url}::${expectedSlot || '*'}`,
    generation: null,
    state: 'resident',
  };
  const blueprint = Object.freeze({
    url,
    assetId: metadata.assetId || fileStem(url),
    slot: expectedSlot || metadata.slot || null,
    metadata: Object.freeze({ ...metadata }),
    primitives: Object.freeze(primitives),
    markers: Object.freeze(markers),
    bounds: Object.freeze({
      min: Object.freeze(sceneBoundsArray(_bounds.min)),
      max: Object.freeze(sceneBoundsArray(_bounds.max)),
      size: Object.freeze(sceneBoundsArray(_boundsSize)),
      center: Object.freeze(sceneBoundsArray(_boundsCenter)),
    }),
    report: Object.freeze({
      warnings: Object.freeze(warnings),
      primitiveCount: primitives.length,
      markerCount: markers.length,
      ktx2TextureCount: ktx2Textures.size,
      materialProfile: Object.freeze({
        materials: materialProfile.materials,
        roles: Object.freeze({ ...materialProfile.roles }),
      }),
    }),
    residency: residencyState,
  });
  const resources = blueprintGpuResources(blueprint);
  if (residencyRegistration && residencyRegistration.residency) {
    const handle = residencyRegistration.residency.registerAsset(residencyState.key, resources, {
      metadata: { url, slot: expectedSlot || metadata.slot || null },
      onEvict(handle, reason) {
        residencyState.state = 'evicted';
        residencyState.reason = reason;
        if (typeof residencyRegistration.onEvict === 'function') residencyRegistration.onEvict(handle, reason);
      },
    });
    residencyState.generation = handle.generation;
  }
  return blueprint;
}

/**
 * Serializable runtime table for one authored scene — the render-package v2 payload.
 *
 * WHY THIS EXISTS
 * ---------------
 * `compileBlueprint` fuses two jobs: it *validates* an authored GLB against the asset contract, and
 * it *derives* the runtime semantics (per-node tags, contract markers, canopy classification,
 * root-relative transforms, scene bounds). Validation belongs offline — it is a build-time question
 * about authored source. Derivation is what the shipping loader was still paying for on every
 * package load, and residency's `onEvict` path means an evict-then-reload runs it mid-flight.
 *
 * This function performs the derivation half alone and returns plain JSON. The offline compiler
 * calls it once and writes the result into `render-package.json`; the shipping loader then binds it
 * with `bindAuthoredRuntimeTable` and derives nothing.
 *
 * ORDERING CONTRACT — the whole design rests on this
 * --------------------------------------------------
 * Every entry is addressed by `planIndex`, the node's position in the loader's flat instance plan.
 * `Object3D.traverse()` visits `this` and then each child's subtree in order; the plan's `visit()`
 * pushes the node and then recurses over `children` in order. They are the same depth-first
 * pre-order, so a counter incremented once per visited node IS the plan index — no lookup table and
 * no name matching. Each entry also carries its `name`, which the binder asserts against the plan.
 * That is a checksum, not discovery: it converts a silent mis-binding into a loud failure.
 *
 * Derivation reads only node names, `userData`, the parent chain, slot, and material *names*. It
 * touches no geometry buffers and no textures, which is what lets the offline compiler run this
 * exact code against a graph reconstructed from the GLB's JSON chunk without decoding or
 * transcoding anything.
 */
export const AUTHORED_RUNTIME_TABLE_SCHEMA = 'spaceface.renderPackageRuntime.v1';

/**
 * Fail closed: a released part with no package must not quietly fall back to compiling its blueprint
 * from source at load. That fallback is what let package coverage rot unnoticed — the game looked
 * fine while paying full derivation cost on every load.
 *
 * The source route stays reachable for development (set `globalThis.__SF_DEV_SOURCE_ASSETS__`), and
 * for assets outside `release/parts/`, which are tooling and reference files rather than runtime
 * content.
 */
function assertSourceRouteAdmitted(url) {
  const path = String(url || '').split('?')[0].replace(/\\/g, '/');
  if (!path.includes('assets/ships/release/parts/')) return;
  if (globalThis.__SF_DEV_SOURCE_ASSETS__ === true) return;
  throw new AssetContractError(url, [
    'released part has no render package, and the source route is development-only. '
    + 'Run: node scripts/generate-render-package-pilots.mjs && node scripts/build-render-package-pilots.mjs',
  ]);
}

/**
 * Build a runtime blueprint by binding a package's precompiled runtime table to a decoded scene.
 *
 * This is the shipping counterpart to `deriveAuthoredRuntimeTable`. It performs no traversal, no
 * name matching, no transform recomputation and no bounds computation — every entry is an array
 * subscript into the flat instance plan. The declared `name` is asserted against the plan so a stale
 * table fails loudly at load instead of binding the wrong node and shipping a wrong-looking model.
 *
 * Material *construction* remains: canopies become MeshPhysicalMaterial and authored material roles
 * are applied. Both are declared by the table rather than derived from names, but they still allocate.
 * That is deliberate — baking them into the GLB would rewrite every package and every content hash.
 */
export function bindAuthoredRuntimeTable(url, gltf, expectedSlot, table, plan) {
  const scene = gltf && gltf.scene;
  if (!scene || !scene.isObject3D) throw new AssetContractError(url, ['GLB has no default scene']);
  const nodes = plan.entries;
  if (!Array.isArray(nodes)) throw new AssetContractError(url, ['instance plan exposed no entries']);

  const metadata = readAssetMetadata(gltf, scene, expectedSlot);
  const nodeAt = (entry, kind) => {
    const planEntry = nodes[entry.planIndex];
    if (!planEntry) {
      throw new AssetContractError(url, [`runtime table ${kind} references plan index ${entry.planIndex}, which the decoded scene does not have`]);
    }
    const object = planEntry.source;
    if ((object.name || '') !== entry.name) {
      throw new AssetContractError(url, [`runtime table ${kind} at plan index ${entry.planIndex} expected node "${entry.name}" but the decoded scene has "${object.name || ''}"`]);
    }
    return object;
  };

  for (const index of table.hidden || []) {
    const planEntry = nodes[index];
    if (planEntry) planEntry.source.visible = false;
  }

  const primitives = (table.primitives || []).map((entry) => {
    const node = nodeAt(entry, 'primitive');
    const material = entry.canopy ? makeCanopyMaterial(node.material) : node.material;
    if (entry.canopy) node.material = material;
    const tags = Object.freeze(reviveRuntimeTags(entry.tags));
    node.userData = { ...(node.userData || {}), spacefacePartUrl: url, spacefaceTags: tags };
    return Object.freeze({
      key: `${url}#${node.uuid}`,
      name: entry.name,
      geometry: node.geometry,
      material,
      matrix: new THREE.Matrix4().fromArray(entry.matrix),
      tags,
    });
  });

  const markers = (table.markers || []).map((entry) => {
    const node = nodeAt(entry, 'marker');
    const tags = Object.freeze(reviveRuntimeTags(entry.tags));
    node.userData = { ...(node.userData || {}), ...entry.userData, spacefacePartUrl: url, spacefaceTags: tags };
    return Object.freeze({
      name: entry.name,
      matrix: new THREE.Matrix4().fromArray(entry.matrix),
      tags,
      userData: Object.freeze({ ...node.userData }),
    });
  });

  // Declared, not derived: the package already resolved which material carries which authored role,
  // so apply them by plan index. This is what keeps the two `root.traverse()` calls and the
  // name-based role inference inside configureAuthoredMaterialProfiles off the shipping load path.
  const assetId = metadata.assetId || fileStem(url);
  const profiledRoles = {};
  const profiled = new Set();
  for (const entry of table.materialProfiles || []) {
    const planEntry = nodes[entry.planIndex];
    if (!planEntry) continue;
    const object = planEntry.source;
    const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
    for (const material of materials) {
      if (!material || profiled.has(material)) continue;
      if (!applyAuthoredMaterialProfile(material, entry.role, { assetId, allowTextures: entry.allowTextures })) continue;
      profiled.add(material);
      profiledRoles[entry.role] = (profiledRoles[entry.role] || 0) + 1;
    }
  }
  const materialProfile = { materials: profiled.size, roles: profiledRoles };

  return Object.freeze({
    url,
    assetId,
    slot: expectedSlot || metadata.slot || null,
    metadata: Object.freeze({ ...metadata }),
    primitives: Object.freeze(primitives),
    markers: Object.freeze(markers),
    bounds: Object.freeze({
      min: Object.freeze([...table.bounds.min]),
      max: Object.freeze([...table.bounds.max]),
      size: Object.freeze([...table.bounds.size]),
      center: Object.freeze([...table.bounds.center]),
    }),
    report: Object.freeze({
      warnings: Object.freeze([]),
      primitiveCount: primitives.length,
      markerCount: markers.length,
      ktx2TextureCount: 0,
      materialProfile: Object.freeze({
        materials: materialProfile.materials,
        roles: Object.freeze({ ...materialProfile.roles }),
      }),
    }),
    residency: { key: `${url}::${expectedSlot || '*'}`, generation: null, state: 'resident' },
  });
}

/** `driveAnchorMatrix` is serialized as a 16-number array; everything else round-trips as-is. */
function reviveRuntimeTags(tags) {
  const out = { ...(tags || {}) };
  if (Array.isArray(out.driveAnchorMatrix) && out.driveAnchorMatrix.length === 16) {
    out.driveAnchorMatrix = new THREE.Matrix4().fromArray(out.driveAnchorMatrix);
  }
  return out;
}

export function deriveAuthoredRuntimeTable(scene, options = {}) {
  if (!scene || !scene.isObject3D) throw new Error('deriveAuthoredRuntimeTable requires a scene root');
  const url = options.url || '';
  const slot = options.slot || null;
  const legacyPart = options.legacyPart === true;

  scene.updateMatrixWorld(true);
  _inverseRoot.copy(scene.matrixWorld).invert();

  const primitives = [];
  const markers = [];
  const hidden = [];
  let planIndex = -1;

  scene.traverse((node) => {
    planIndex++;
    if (node === scene) return;
    const tags = collectTags(node, scene, slot, legacyPart);
    _relative.multiplyMatrices(_inverseRoot, node.matrixWorld);

    // Contract violations are the offline validator's business. Derivation only has to agree with
    // compileBlueprint about which nodes contribute runtime entries, so mirror its skips exactly.
    if (node.isLight || node.isCamera || node.isLine || node.isPoints) return;

    const normalizedName = String(node.name || '').toUpperCase().replace(/[\s-]+/g, '_');
    const nonRenderHelper = normalizedName === 'COLLISION_HULL'
      || node.userData?.nonRender === true
      || node.userData?.spaceface?.nonRender === true;
    if (node.isMesh && nonRenderHelper) {
      hidden.push(planIndex);
      return;
    }

    if (node.isMesh) {
      if (!node.geometry || !node.material || Array.isArray(node.material)) return;
      const canopy = !!(tags.canopy || isCanopy(node, slot));
      primitives.push({
        planIndex,
        name: node.name || `Primitive_${primitives.length}`,
        canopy,
        matrix: _relative.toArray(),
        tags: serializeRuntimeTags(buildPrimitiveTags(tags, { legacyPart }, canopy)),
      });
    } else if (isContractMarker(node, tags)) {
      const markerTags = {
        ...cleanRuntimeTags(tags),
        lod: tags.lod || (legacyPart ? 'lod0' : undefined),
      };
      markers.push({
        planIndex,
        name: node.name || `Marker_${markers.length}`,
        matrix: _relative.toArray(),
        tags: serializeRuntimeTags(markerTags),
        userData: serializeRuntimeUserData(node.userData),
      });
    }
  });

  _bounds.setFromObject(scene);
  _bounds.getSize(_boundsSize);
  _bounds.getCenter(_boundsCenter);

  // Resolve authored material roles here so the loader can apply them by declaration. The role
  // itself is inferred from material names, userData and assetId — name-based discovery that has no
  // business running on a shipping load path. Recording it against a plan index turns it into data.
  const roleByMaterial = new Map();
  const materialProfile = configureAuthoredMaterialProfiles(scene, {
    assetId: options.assetId || null,
    record(material, role, allowTextures) { roleByMaterial.set(material, { role, allowTextures }); },
  });
  const materialProfiles = [];
  let profileIndex = -1;
  scene.traverse((node) => {
    profileIndex++;
    const materials = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
    for (const material of materials) {
      const resolved = roleByMaterial.get(material);
      if (!resolved) continue;
      roleByMaterial.delete(material);
      materialProfiles.push({ planIndex: profileIndex, role: resolved.role, allowTextures: resolved.allowTextures });
    }
  });

  return {
    schema: AUTHORED_RUNTIME_TABLE_SCHEMA,
    url,
    slot,
    legacyPart,
    nodeCount: planIndex + 1,
    materialProfiles,
    materialProfileRoles: { ...materialProfile.roles },
    bounds: {
      min: sceneBoundsArray(_bounds.min),
      max: sceneBoundsArray(_bounds.max),
      size: sceneBoundsArray(_boundsSize),
      center: sceneBoundsArray(_boundsCenter),
    },
    primitives,
    markers,
    hidden,
  };
}

/**
 * `driveAnchorMatrix` is the only Matrix4 that survives into runtime tags; everything else is a
 * string, boolean, number or number array. `undefined` values are dropped so the serialized table
 * round-trips through JSON without inventing explicit nulls that would not compare equal.
 */
function serializeRuntimeTags(tags) {
  const out = {};
  for (const [key, value] of Object.entries(tags || {})) {
    if (value === undefined) continue;
    if (key === 'driveAnchorObject') continue;
    out[key] = value && value.isMatrix4 ? value.toArray() : value;
  }
  return out;
}

function serializeRuntimeUserData(userData) {
  const out = {};
  for (const [key, value] of Object.entries(userData || {})) {
    if (key === 'spacefaceTags' || key === 'spacefacePartUrl') continue;
    const copy = cloneRuntimePlainData(value);
    if (copy !== undefined) out[key] = copy;
  }
  return out;
}

function cloneRuntimePlainData(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!value || typeof value !== 'object') return undefined;

  const isArray = Array.isArray(value);
  if (!isArray) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
  }
  if (ancestors.has(value)) return undefined;

  ancestors.add(value);
  const copy = isArray ? [] : {};
  for (const [key, entry] of Object.entries(value)) {
    const cloned = cloneRuntimePlainData(entry, ancestors);
    if (cloned !== undefined) copy[key] = cloned;
  }
  ancestors.delete(value);
  return copy;
}

function validateRootTransform(scene, errors) {
  const eps = 1e-6;
  const identityRotation = Math.abs(scene.quaternion.x) < eps && Math.abs(scene.quaternion.y) < eps &&
    Math.abs(scene.quaternion.z) < eps && Math.abs(scene.quaternion.w - 1) < eps;
  const identityScale = Math.abs(scene.scale.x - 1) < eps && Math.abs(scene.scale.y - 1) < eps &&
    Math.abs(scene.scale.z - 1) < eps;
  if (scene.position.lengthSq() > eps * eps || !identityRotation || !identityScale) {
    errors.push('default scene root transform must be identity; author orientation/scale into child nodes in metres');
  }
}

function readAssetMetadata(gltf, scene, expectedSlot) {
  // GLTFLoader wraps every default scene in a synthetic Group. Some production whole ships carry
  // their canonical contract on the single authored root below that wrapper rather than duplicating
  // it onto glTF asset/scene extras. Only admit this exact, unambiguous shape; scanning arbitrary
  // descendants could select a nested component contract from a multi-root asset.
  const authoredRoot = Array.isArray(scene.children) && scene.children.length === 1
    ? scene.children[0]
    : null;
  const sources = [
    scene.userData && scene.userData.spacefaceAsset,
    scene.userData && scene.userData.spaceface,
    authoredRoot && authoredRoot.userData && authoredRoot.userData.spacefaceAsset,
    authoredRoot && authoredRoot.userData && authoredRoot.userData.spaceface,
    gltf.userData && gltf.userData.spacefaceAsset,
    gltf.asset && gltf.asset.extras && (gltf.asset.extras.spacefaceAsset || gltf.asset.extras.spaceface),
    gltf.asset && gltf.asset.extras,
    gltf.parser && gltf.parser.json && gltf.parser.json.asset && gltf.parser.json.asset.extras
      && (gltf.parser.json.asset.extras.spacefaceAsset || gltf.parser.json.asset.extras.spaceface),
    gltf.parser && gltf.parser.json && gltf.parser.json.asset && gltf.parser.json.asset.extras,
  ];
  const raw = { ...(sources.find((v) => v && typeof v === 'object') || {}) };
  return normalizeAssetMetadata(raw, gltf, expectedSlot);
}

function normalizeAssetMetadata(raw, gltf, expectedSlot) {
  const meta = { ...(raw || {}) };
  if (ASSET_AUTHORING_CONTRACT.supportedVersions.includes(meta.contractVersion) && meta.slot) return meta;

  const slot = expectedSlot || meta.slot || slotFromCategory(meta.category);
  if (!slot || !meta.assetId) return meta;
  const forward = meta.forward || meta.forwardAxis;
  const up = meta.up || meta.upAxis;
  const starboard = meta.starboard || meta.starboardAxis;
  const unit = meta.unit || (meta.metresPerUnit === 1 || meta.metersPerUnit === 1 ? 'metre' : null);
  if (forward !== '+X' || up !== '+Y' || starboard !== '+Z' || !(unit === 'metre' || unit === 'meter')) return meta;

  return {
    ...meta,
    contractVersion: ASSET_AUTHORING_CONTRACT.version,
    slot,
    forward,
    up,
    starboard,
    unit,
    normalConvention: meta.normalConvention || 'OpenGL',
    ormChannels: meta.ormChannels || 'R=AO,G=Roughness,B=Metallic',
    textureCompression: meta.textureCompression || inferTextureCompression(gltf),
    legacyPart: true,
  };
}

function slotFromCategory(category) {
  const value = String(category || '').toLowerCase();
  if (value === 'hulls') return 'hull';
  if (value === 'cockpits') return 'cockpit';
  if (value === 'engines') return 'engine';
  if (value === 'fins') return 'fin';
  if (value === 'weapons') return 'weapon';
  if (value === 'greebles') return 'greeble';
  if (value === 'gear') return 'gear';
  if (value === 'pods') return 'pod';
  if (value === 'places') return 'place';
  return null;
}

function inferTextureCompression(gltf) {
  const images = gltf && gltf.parser && gltf.parser.json && gltf.parser.json.images || [];
  if (images.length && images.every((image) => image && image.mimeType === 'image/ktx2')) return 'KTX2/BasisU';
  if (images.length && images.every((image) => image && (!image.mimeType || image.mimeType === 'image/png'))) return 'PNG-source';
  return '';
}

function validateAssetMetadata(meta, expectedSlot, errors) {
  if (!ASSET_AUTHORING_CONTRACT.supportedVersions.includes(meta.contractVersion)) {
    errors.push(`spacefaceAsset.contractVersion must be one of ${ASSET_AUTHORING_CONTRACT.supportedVersions.join(', ')}`);
  }
  if (!meta.assetId || typeof meta.assetId !== 'string') {
    errors.push('spacefaceAsset.assetId must be a stable non-empty string');
  }
  const allowedSlots = ['hull', 'cockpit', 'engine', 'fin', 'weapon', 'greeble', 'gear', 'pod', 'place'];
  if (!allowedSlots.includes(meta.slot)) {
    errors.push(`spacefaceAsset.slot must be one of ${allowedSlots.join(', ')}`);
  } else if (expectedSlot && meta.slot !== expectedSlot) {
    errors.push(`spacefaceAsset.slot must equal requested slot "${expectedSlot}"`);
  }
  if (meta.forward !== '+X' || meta.up !== '+Y' || meta.starboard !== '+Z') {
    errors.push('coordinate extras must declare forward="+X", up="+Y", starboard="+Z"');
  }
  if (!(meta.unit === 'metre' || meta.unit === 'meter' || meta.metresPerUnit === 1 || meta.metersPerUnit === 1)) {
    errors.push('unit extras must declare metres (unit="metre" or metresPerUnit=1)');
  }
  if (String(meta.normalConvention || '').toLowerCase() !== 'opengl') {
    errors.push('spacefaceAsset.normalConvention must be "OpenGL" (green-up)');
  }
  if (normalizeToken(meta.ormChannels) !== 'r=ao,g=roughness,b=metallic') {
    errors.push('spacefaceAsset.ormChannels must be "R=AO,G=Roughness,B=Metallic"');
  }
  const compression = normalizeToken(meta.textureCompression);
  if (compression !== 'ktx2/basisu' && compression !== 'ktx2/basisu+mips' && compression !== 'png-source') {
    errors.push('spacefaceAsset.textureCompression must be "KTX2/BasisU", "KTX2/BasisU+mips", or "PNG-source"');
  }
}

function validatePrimitive(node, material, canopy, gltf, metadata, errors, warnings) {
  const prefix = label(node);
  const geometry = node.geometry;
  const legacyPart = metadata && metadata.legacyPart === true;
  const factorOnly = Array.isArray(metadata && metadata.factorOnlyMaterials)
    && metadata.factorOnlyMaterials.includes(material.name);
  if (!geometry.getAttribute('position')) errors.push(`${prefix} has no positions`);
  if (!geometry.getAttribute('normal')) errors.push(`${prefix} has no vertex normals`);
  if (!factorOnly && !geometry.getAttribute('uv')) errors.push(`${prefix} has no UV0 for baseColor/normal maps`);
  if (material.normalMap && !geometry.getAttribute('tangent')) {
    if (legacyPart) warnings.push(`${prefix} has a normal map but no authored tangent attribute`);
    else errors.push(`${prefix} has a normal map but no authored tangent attribute`);
  }

  if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) {
    errors.push(`${prefix} material must be MeshStandardMaterial or MeshPhysicalMaterial`);
    return;
  }

  const map = material.map;
  const normal = material.normalMap;
  const ao = material.aoMap;
  const rough = material.roughnessMap;
  const metal = material.metalnessMap;
  if (!map && !legacyPart && !factorOnly) errors.push(`${prefix} is missing baseColor map`);
  if (!normal && !legacyPart && !factorOnly) errors.push(`${prefix} is missing tangent-space normal map`);
  if ((!ao || !rough || !metal) && !legacyPart && !factorOnly) errors.push(`${prefix} is missing packed ORM assignments (aoMap + roughnessMap + metalnessMap)`);

  if (map && map.colorSpace !== THREE.SRGBColorSpace) errors.push(`${prefix} baseColor map is not tagged sRGB`);
  if (normal) {
    if (normal.colorSpace === THREE.SRGBColorSpace) errors.push(`${prefix} normal map must be linear/non-color data`);
    if (material.normalMapType !== THREE.TangentSpaceNormalMap) errors.push(`${prefix} normal map is not tangent-space`);
    if (material.normalScale && material.normalScale.y < 0) {
      if (legacyPart) warnings.push(`${prefix} normal map reports DirectX green-down; accepted for legacy generated part`);
      else errors.push(`${prefix} normal map is DirectX green-down; export OpenGL green-up`);
    }
  }
  if (ao && ao.colorSpace === THREE.SRGBColorSpace) errors.push(`${prefix} ORM map must be linear/non-color data`);
  if (ao && rough && metal && !(sameTexture(ao, rough) && sameTexture(rough, metal))) {
    errors.push(`${prefix} AO, roughness and metallic must share one packed ORM texture`);
  } else if (!legacyPart && ao && rough && metal && !samePackedOrmSampling(ao, rough, metal)) {
    errors.push(`${prefix} packed ORM channels must use one texture transform; roughness and metallic must share a UV set`);
  }
  if (ao && !(geometry.getAttribute('uv1') || geometry.getAttribute('uv'))) {
    errors.push(`${prefix} has no UV channel usable by AO`);
  }

  for (const [role, texture] of [['baseColor', map], ['normal', normal], ['ORM', ao]]) {
    if (!texture) continue;
    const size = textureSize(texture);
    if (!size) {
      errors.push(`${prefix} ${role} texture dimensions are not inspectable`);
    } else if (!isAuthoredTextureSizeValid(size, { factorOnly })) {
      errors.push(`${prefix} ${role} texture dimensions must be positive finite values; got ${size.width}x${size.height}`);
    }
    if (!legacyPart && !isSupportedPartTexture(texture, gltf, metadata)) {
      errors.push(`${prefix} ${role} texture does not match declared compression pipeline`);
    }
  }

  if (canopy) {
    if (!material.isMeshPhysicalMaterial) errors.push(`${prefix} canopy did not normalize to MeshPhysicalMaterial`);
    if (!finiteInRange(material.transmission, 0, 1)) errors.push(`${prefix} canopy transmission must be finite in [0,1]`);
    if (!finiteInRange(material.ior, 1, 2.333)) errors.push(`${prefix} canopy ior must be finite in [1,2.333]`);
    if (!finiteInRange(material.clearcoat, 0, 1)) errors.push(`${prefix} canopy clearcoat must be finite in [0,1]`);
    if (!finiteInRange(material.clearcoatRoughness, 0, 1)) errors.push(`${prefix} canopy clearcoat roughness must be finite in [0,1]`);
    if (!Number.isFinite(Number(material.thickness)) || Number(material.thickness) < 0) {
      errors.push(`${prefix} canopy thickness must be finite and non-negative`);
    }
    for (const [role, texture] of [
      ['anisotropy', material.anisotropyMap],
      ['clearcoat', material.clearcoatMap],
      ['clearcoat roughness', material.clearcoatRoughnessMap],
      ['clearcoat normal', material.clearcoatNormalMap],
      ['transmission', material.transmissionMap],
      ['thickness', material.thicknessMap],
    ]) {
      if (texture && texture.colorSpace === THREE.SRGBColorSpace) {
        errors.push(`${prefix} ${role} map must be linear/non-color data`);
      }
    }
  } else if (material.transparent && material.opacity < 1) {
    warnings.push(`${prefix} is alpha-blended; only canopies/plumes should normally require per-ship sorting`);
  }
}

function validateHookSurface(slot, primitives, markers, errors, options = {}) {
  const legacyPart = options.legacyPart === true;
  // Render hooks must resolve to renderable primitives. Empty marker nodes are valid sockets, but an
  // empty HOOK_DRIVE_* marker would leave shipKit with nothing to animate or damage.
  if (!primitives.some((entry) => entry.tags.lod === 'lod0')) {
    errors.push('part mesh primitives expose no LOD0_* node or spaceface.lod="lod0" tag');
  }
  if (slot === 'engine') {
    for (const role of ['fan', 'core', 'plume']) {
      const count = primitives.filter((entry) => entry.tags.drive === role).length;
      if (count !== 1 && !legacyPart) {
        errors.push(`engine mesh must expose exactly one HOOK_DRIVE_${role.toUpperCase()}; found ${count}`);
      }
    }
  }
  if (slot === 'cockpit' && !primitives.some((entry) => entry.tags.canopy)) {
    errors.push('cockpit part contains no CANOPY_/glass mesh for the physical-glass contract');
  }

  const socketNames = new Set();
  const mountKeys = new Set();
  const mountCounts = { cockpit: 0, engine: 0, fin: 0 };
  for (const marker of markers) {
    if (marker.tags.socket) {
      if (socketNames.has(marker.name)) errors.push(`duplicate socket marker "${marker.name}"`);
      socketNames.add(marker.name);
    }
    if (marker.tags.mount) {
      const mountKey = `${marker.tags.mount}:${marker.tags.mountKey || marker.name}`;
      if (mountKeys.has(mountKey)) errors.push(`duplicate assembly mount "${mountKey}"`);
      mountKeys.add(mountKey);
    }
    if (marker.tags.mount && Object.hasOwn(mountCounts, marker.tags.mount)) mountCounts[marker.tags.mount]++;
  }
  const totalMounts = Object.values(mountCounts).reduce((sum, count) => sum + count, 0);
  if (slot !== 'hull' && totalMounts) errors.push('MOUNT_* assembly markers are valid only in hull parts');
  if (slot === 'hull') {
    if (mountCounts.cockpit > 1) errors.push(`hull exposes ${mountCounts.cockpit} cockpit mounts; at most one is allowed`);
    if (mountCounts.engine > 4) errors.push(`hull exposes ${mountCounts.engine} engine mounts; at most four are allowed`);
    if (mountCounts.fin > 4) errors.push(`hull exposes ${mountCounts.fin} fin mounts; at most four are allowed`);
  }
}

function isWholeShipUrl(url) {
  return /\/wholeships\/[^/]+\.glb$/i.test(String(url || ''));
}

export function hasNonEmptyWholeShipHullBody(hullTriangles) {
  return Number.isFinite(hullTriangles) && hullTriangles > 0;
}

export async function loadGltfDocument(url, loader, fetchImpl = globalThis.fetch) {
  if (!isWholeShipUrl(url) || typeof fetchImpl !== 'function' || typeof loader?.parseAsync !== 'function') {
    return loader.loadAsync(url);
  }
  // Electron intentionally keeps a stable localhost origin so saves persist. Revalidate whole-ship
  // bodies on that origin, but parse the same response. Fetching once for validation and again through
  // GLTFLoader transferred the 20+ MiB Kestrel twice on every New Game and Continue transition.
  const response = await fetchImpl(url, { cache: 'no-cache' });
  if (!response.ok) throw new AssetContractError(url, [`whole-ship GLB fetch failed: HTTP ${response.status}`]);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const gltf = parseGlbJson(bytes);
  const errors = validateWholeShipJsonDocument(url, gltf);
  if (errors.length) throw new AssetContractError(url, errors);
  return loader.parseAsync(buffer, assetBasePath(url));
}

function assetBasePath(url) {
  const clean = String(url || '').split(/[?#]/, 1)[0];
  const slash = clean.lastIndexOf('/');
  return slash >= 0 ? clean.slice(0, slash + 1) : '';
}

function parseGlbJson(bytes) {
  if (!bytes || bytes.byteLength < 20) throw new Error('whole-ship GLB is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('whole-ship GLB has bad magic');
  if (view.getUint32(4, true) !== GLB_VERSION) throw new Error('whole-ship GLB has unsupported version');
  let off = 12;
  while (off + 8 <= bytes.byteLength) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > bytes.byteLength) break;
    if (type === GLB_CHUNK_JSON) {
      const json = new TextDecoder().decode(bytes.subarray(start, start + len)).replace(/\0+$/, '').trim();
      return JSON.parse(json);
    }
    off = start + len;
  }
  throw new Error('whole-ship GLB is missing JSON chunk');
}

function validateWholeShipJsonDocument(url, gltf) {
  const meshByIdx = Object.fromEntries((gltf.meshes || []).map((mesh, index) => [index, mesh]));
  const meshNames = [];
  let hullTris = 0;
  for (const node of gltf.nodes || []) {
    if (node.mesh == null) continue;
    const mesh = meshByIdx[node.mesh] || {};
    meshNames.push(mesh.name || node.name || 'unnamed');
    if (wholeShipJsonMeshLooksLikeBody(gltf, node, mesh)) hullTris += gltfMeshTriangleCount(gltf, mesh);
  }
  if (hasNonEmptyWholeShipHullBody(hullTris)) return [];
  return [`whole-ship hull body missing or empty: hull triangles=${hullTris}; asset=${url}; meshes=${meshNames.join(', ')}`];
}

function wholeShipJsonMeshLooksLikeBody(gltf, node, mesh) {
  const meshName = String(mesh && mesh.name || '').toLowerCase();
  if (WHOLE_SHIP_ACCESSORY_TOKENS.some((part) => meshName.includes(part))) return false;
  const materials = gltf.materials || [];
  const materialNames = [];
  for (const prim of mesh.primitives || []) {
    const mat = materials[prim.material];
    if (mat && mat.name) materialNames.push(mat.name);
  }
  const token = `${node && node.name || ''} ${meshName} ${materialNames.join(' ')}`.toLowerCase();
  if (WHOLE_SHIP_ACCESSORY_TOKENS.some((part) => token.includes(part))) return false;
  return token.includes('hull') || token.includes('main') || token.includes('body') || token.includes('merged_material_hull') || token.includes('material_hull');
}

function gltfMeshTriangleCount(gltf, mesh) {
  let count = 0;
  for (const prim of mesh.primitives || []) {
    if ((prim.mode ?? 4) !== 4) continue;
    const indexed = gltf.accessors && gltf.accessors[prim.indices];
    const positioned = gltf.accessors && gltf.accessors[prim.attributes && prim.attributes.POSITION];
    count += Math.floor(((indexed && indexed.count) || (positioned && positioned.count) || 0) / 3);
  }
  return count;
}

function validateWholeShipBody(url, primitives, errors) {
  let hullTris = 0;
  const meshNames = [];
  for (const primitive of primitives) {
    meshNames.push(primitive.name || 'unnamed');
    if (wholeShipPrimitiveLooksLikeBody(primitive)) {
      hullTris += triangleCount(primitive.geometry);
    }
  }
  if (!hasNonEmptyWholeShipHullBody(hullTris)) {
    errors.push(`whole-ship hull body missing or empty: hull triangles=${hullTris}; asset=${url}; meshes=${meshNames.join(', ')}`);
  }
}

function wholeShipPrimitiveLooksLikeBody(primitive) {
  const tags = primitive && primitive.tags || {};
  if (tags.canopy) return false;
  const material = primitive && primitive.material;
  const geometry = primitive && primitive.geometry;
  const token = `${primitive && primitive.name || ''} ${geometry && geometry.name || ''} ${material && material.name || ''} ${tags.tint || ''}`.toLowerCase();
  if (WHOLE_SHIP_ACCESSORY_TOKENS.some((part) => token.includes(part))) return false;
  return token.includes('hull') || token.includes('main') || token.includes('body') || token.includes('merged_material_hull') || token.includes('material_hull');
}

function triangleCount(geometry) {
  if (!geometry) return 0;
  const index = typeof geometry.getIndex === 'function' ? geometry.getIndex() : geometry.index;
  if (index && Number.isFinite(index.count)) return Math.floor(index.count / 3);
  const position = geometry.getAttribute && geometry.getAttribute('position');
  return position && Number.isFinite(position.count) ? Math.floor(position.count / 3) : 0;
}

function collectTags(node, scene, slot, legacyPart) {
  const chain = [];
  for (let current = node; current && current !== scene; current = current.parent) chain.push(current);
  const tags = {};
  for (let i = chain.length - 1; i >= 0; i--) applyNodeTags(tags, chain[i], slot, legacyPart);

  // Sockets and assembly mounts describe one transform, not a subtree. Keep render-state tags
  // inheritable, but require these marker tags to be declared on the marker node itself.
  const local = {};
  applyNodeTags(local, node, slot, legacyPart);
  for (const key of ['socket', 'socketRole', 'socketForward', 'mount', 'mountKey']) {
    if (Object.hasOwn(local, key)) tags[key] = local[key];
    else delete tags[key];
  }
  return tags;
}

function buildPrimitiveTags(tags, metadata, canopy) {
  const next = {
    ...cleanRuntimeTags(tags),
    lod: tags.lod || (metadata.legacyPart === true ? 'lod0' : undefined),
    canopy,
  };
  const anchor = tags.driveAnchorObject;
  if (next.drive && anchor && anchor.matrixWorld) {
    _anchorRelative.multiplyMatrices(_inverseRoot, anchor.matrixWorld);
    next.driveAnchorMatrix = _anchorRelative.clone();
  }
  return Object.freeze(next);
}

function cleanRuntimeTags(tags) {
  const next = { ...tags };
  delete next.driveAnchorObject;
  return next;
}

/**
 * `sf_lod_max` describes a visibility range, while the runtime selects one exact authored LOD tag
 * per primitive. Guessing max=2 as lod2 would hide the primitive at lod0/lod1, so reject the
 * ambiguous metadata until a real range policy owns it.
 */
export function authoredLodMaxMetadataIssue(userData = {}) {
  const data = userData && typeof userData === 'object' ? userData : {};
  if (!Object.hasOwn(data, 'sf_lod_max')) return null;
  return `declares unsupported sf_lod_max=${JSON.stringify(data.sf_lod_max)}; export an exact LOD0_*/LOD1_*/LOD2_* name or spaceface.lod tag instead`;
}

function applyNodeTags(tags, node, slot, legacyPart) {
  const data = node.userData || {};
  const sf = data.spaceface && typeof data.spaceface === 'object' ? data.spaceface : {};
  const name = String(node.name || '').toUpperCase().replace(/[\s-]+/g, '_');

  const lodMatch = /^LOD([012])(?:_|$)/.exec(name);
  if (lodMatch) tags.lod = `lod${lodMatch[1]}`;
  if (name.startsWith('SOCKET_')) {
    tags.socket = true;
    tags.socketRole = sf.role || data.role || socketRoleFromName(name);
  }
  const mountMatch = /^MOUNT_(COCKPIT|ENGINE|FIN)(?:_|$)/.exec(name);
  if (mountMatch) {
    tags.mount = mountMatch[1].toLowerCase();
    tags.mountKey = name.slice('MOUNT_'.length).toLowerCase();
  }
  if (name.includes('HOOK_DRIVE_FAN')) setDriveTag(tags, 'fan', node);
  if (name.includes('HOOK_DRIVE_CORE')) setDriveTag(tags, 'core', node);
  if (name.includes('HOOK_DRIVE_PLUME')) setDriveTag(tags, 'plume', node);
  if (legacyPart && slot === 'engine') {
    if (name.includes('HOOK_SPIN')) setDriveTag(tags, 'fan', node);
    else if (!tags.drive && name.includes('FAN')) setDriveTag(tags, 'fan', node);
    if (name.includes('HOOK_EMISSIVE')) setDriveTag(tags, 'core', node);
    else if (!tags.drive && (name.includes('ENGINE_CORE') || name.includes('DRIVE_CORE') || /(?:^|_)CORE(?:_|$)/.test(name))) setDriveTag(tags, 'core', node);
    if (!tags.drive && name.includes('PLUME')) setDriveTag(tags, 'plume', node);
  }
  if (name.includes('HOOK_NAV_') || name.includes('HOOK_NAVLIGHT')) tags.damageRole = 'navLight';
  if (name.includes('HOOK_SENSOR_')) tags.damageRole = 'sensor';
  if (name.includes('HOOK_ARMOR_')) tags.damageRole = 'armor';
  if (name.includes('HOOK_SECONDARY_')) tags.damageRole = 'secondary';
  if (name.includes('CANOPY') || name.includes('COCKPIT_GLASS') ||
    (legacyPart && slot === 'cockpit' && (name.includes('GLASS') || name.includes('WINDOW')))) tags.canopy = true;
  if (name.includes('DECAL')) tags.decal = true;

  const hook = sf.hook || data.spacefaceHook;
  if (typeof hook === 'string') applyHookString(tags, hook, node);
  if (sf.lod || data.spacefaceLod) tags.lod = normalizeLod(sf.lod || data.spacefaceLod);
  if (sf.tint || data.spacefaceTint) tags.tint = sf.tint || data.spacefaceTint;
  if (sf.damageRole || data.damageRole) tags.damageRole = normalizeDamageRole(sf.damageRole || data.damageRole);
  if (sf.socket === true || data.spacefaceSocket === true) tags.socket = true;
  if (sf.mount || data.spacefaceMount) {
    const mount = String(sf.mount || data.spacefaceMount).toLowerCase();
    if (['cockpit', 'engine', 'fin'].includes(mount)) tags.mount = mount;
    tags.mountKey = String(sf.mountKey || data.spacefaceMountKey || mount).toLowerCase();
  }
  if (sf.role || data.role) tags.socketRole = sf.role || data.role;
  if (Array.isArray(sf.forward || data.forward)) tags.socketForward = [...(sf.forward || data.forward)];
  if (sf.instance === false || data.spacefaceInstance === false) tags.instance = false;
  if (sf.canopy === true) tags.canopy = true;
  if (sf.decal === true) tags.decal = true;
  if (sf.chamfered === true || data.chamfered === true) tags.chamfered = true;
  if (finitePositive(sf.bevelRadiusM || data.bevelRadiusM)) tags.bevelRadiusM = Number(sf.bevelRadiusM || data.bevelRadiusM);
}

function normalizeDamageRole(value) {
  const token = String(value || '').replace(/[._ -]+/g, '').toLowerCase();
  if (token === 'navlight' || token === 'nav') return 'navLight';
  if (token === 'sensor' || token === 'sensorslit') return 'sensor';
  if (token === 'armor' || token === 'armour') return 'armor';
  if (token === 'secondary') return 'secondary';
  return String(value || '');
}

function applyHookString(tags, value, node) {
  const hook = value.toLowerCase();
  if (hook === 'drive.fan') setDriveTag(tags, 'fan', node);
  else if (hook === 'drive.core') setDriveTag(tags, 'core', node);
  else if (hook === 'drive.plume') setDriveTag(tags, 'plume', node);
  else if (hook === 'damage.navlight') tags.damageRole = 'navLight';
  else if (hook === 'damage.sensor') tags.damageRole = 'sensor';
  else if (hook === 'damage.armor') tags.damageRole = 'armor';
  else if (hook === 'damage.secondary') tags.damageRole = 'secondary';
}

export function makeCanopyMaterial(source) {
  const input = source || new THREE.MeshStandardMaterial();
  let physical;
  if (input.isMeshPhysicalMaterial) {
    // GLTFLoader has already decoded every KHR_materials_* extension. Cloning preserves physical
    // factors and texture identities, including texCoord channels and texture transforms.
    physical = input.clone();
  } else {
    // MeshPhysicalMaterial.copy() expects a physical source. Invoke the standard copy path directly
    // for legacy canopies, then restore the physical shader defines.
    physical = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(physical, input);
    physical.defines = { STANDARD: '', PHYSICAL: '' };
  }

  physical.name = input.name || 'Authored_Canopy';
  physical.roughness = finiteOr(input.roughness, 0.12);
  physical.metalness = finiteOr(input.metalness, 0);
  physical.transmission = finiteInRange(input.transmission, 0, 1)
    ? Number(input.transmission)
    : ASSET_AUTHORING_CONTRACT.canopy.transmission;
  physical.ior = finiteInRange(input.ior, 1, 2.333)
    ? Number(input.ior)
    : ASSET_AUTHORING_CONTRACT.canopy.ior;
  physical.clearcoat = finiteInRange(input.clearcoat, 0, 1)
    ? Number(input.clearcoat)
    : ASSET_AUTHORING_CONTRACT.canopy.clearcoat;
  physical.clearcoatRoughness = finiteInRange(input.clearcoatRoughness, 0, 1)
    ? Number(input.clearcoatRoughness)
    : 0.08;
  physical.thickness = Number.isFinite(Number(input.thickness)) && Number(input.thickness) >= 0
    ? Number(input.thickness)
    : 0.08;
  physical.transparent = true;
  physical.opacity = finiteInRange(input.opacity, 0, 1) ? Number(input.opacity) : 1;
  physical.depthWrite = false;
  physical.userData = { ...(input.userData || {}), spacefaceCanopy: true };
  return physical;
}

function blueprintGpuResources(blueprint) {
  const resources = new Set();
  for (const primitive of blueprint && blueprint.primitives || []) {
    if (primitive.geometry) resources.add(primitive.geometry);
    if (primitive.material) resources.add(primitive.material);
    for (const texture of materialTextures(primitive.material)) resources.add(texture);
  }
  return [...resources];
}

export function isAuthoredTextureSizeValid(size, { factorOnly: _factorOnly = false } = {}) {
  const width = Number(size?.width);
  const height = Number(size?.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
}

function materialTextures(material) {
  const result = [];
  const seen = new Set();
  for (const value of Object.values(material || {})) {
    if (value && value.isTexture && !seen.has(value.uuid)) {
      seen.add(value.uuid);
      result.push(value);
    }
  }
  return result;
}

function textureSize(texture) {
  const image = texture && (texture.image || texture.source && texture.source.data);
  if (image && Number.isFinite(image.width) && Number.isFinite(image.height)) {
    return { width: image.width, height: image.height };
  }
  if (image && image.data && Number.isFinite(image.data.width) && Number.isFinite(image.data.height)) {
    return { width: image.data.width, height: image.data.height };
  }
  if (texture && texture.mipmaps && texture.mipmaps[0]) {
    const mip = texture.mipmaps[0];
    if (Number.isFinite(mip.width) && Number.isFinite(mip.height)) return { width: mip.width, height: mip.height };
  }
  return null;
}


function isKtx2Texture(texture, gltf, metadata) {
  const compression = normalizeToken(metadata && metadata.textureCompression);
  if (!texture || (compression !== 'ktx2/basisu' && compression !== 'ktx2/basisu+mips')) return false;
  const definition = textureDefinition(texture, gltf);
  return !!(definition && definition.extensions && definition.extensions.KHR_texture_basisu);
}

function isPngTexture(texture, gltf, metadata) {
  if (!texture || normalizeToken(metadata && metadata.textureCompression) !== 'png-source') return false;
  const definition = textureDefinition(texture, gltf);
  const parser = gltf && gltf.parser;
  const image = definition && parser && parser.json && parser.json.images && parser.json.images[definition.source];
  return !!(image && (!image.mimeType || image.mimeType === 'image/png'));
}

function isSupportedPartTexture(texture, gltf, metadata) {
  return isKtx2Texture(texture, gltf, metadata) || isPngTexture(texture, gltf, metadata);
}

function textureDefinition(texture, gltf) {
  const parser = gltf && gltf.parser;
  if (!parser || !parser.associations || !parser.json || !parser.json.textures) return false;

  let association = parser.associations.get(texture);
  // GLTFLoader clones textures when a material selects a non-zero texCoord. Older/newer revisions do
  // not all preserve the association on that clone, so recover it only through the identical source.
  // This remains exact per texture definition — it does not accept a GLB merely because some other
  // texture happened to use BasisU.
  if (!association) {
    for (const [candidate, mapping] of parser.associations) {
      if (candidate && candidate.isTexture && sameTexture(candidate, texture)) {
        association = mapping;
        break;
      }
    }
  }
  const textureIndex = association && Number.isInteger(association.textures) ? association.textures : null;
  return textureIndex != null ? parser.json.textures[textureIndex] : null;
}

function normalizeToken(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '').toLowerCase();
}

function sameTexture(a, b) {
  return a === b || (a && b && (
    (a.source && a.source === b.source) ||
    (a.image && a.image === b.image)
  ));
}

function sameTextureSampling(a, b, options = {}) {
  const requireChannel = options.requireChannel !== false;
  if (!sameTexture(a, b)) return false;
  if (requireChannel && (a.channel || 0) !== (b.channel || 0)) return false;
  if (a.flipY !== b.flipY || a.wrapS !== b.wrapS || a.wrapT !== b.wrapT) return false;
  if (a.matrixAutoUpdate) a.updateMatrix();
  if (b.matrixAutoUpdate) b.updateMatrix();
  const ae = a.matrix.elements;
  const be = b.matrix.elements;
  for (let i = 0; i < ae.length; i++) if (Math.abs(ae[i] - be[i]) > 1e-6) return false;
  return true;
}

function setDriveTag(tags, role, node) {
  tags.drive = role;
  tags.driveAnchorObject = node;
}

function samePackedOrmSampling(ao, rough, metal) {
  return sameTextureSampling(ao, rough, { requireChannel: false })
    && sameTextureSampling(rough, metal);
}

export const AUTHORED_TRANSFORM_SKEW_EPSILON = 1e-5;

// Classify one node transform as `scale`, `mirrored`, `shear`, or null (conformant).
//
// Shear is detected by comparing the matrix against its decompose -> recompose round trip. Those
// elements carry the node's scale, so a fixed element epsilon is really an angular tolerance divided
// by that scale. Release quantization folds a dequantization scale into node TRS — the Wreck
// Cathedral's largest draw group lands at ~265x — and at that size float32 quaternion round-off
// alone exceeds a 1e-5 element epsilon on a perfectly orthogonal basis. Scaling the tolerance keeps
// one angular sensitivity at every node size; the historical absolute epsilon remains the floor, so
// no unit-scale node becomes more permissive than before.
export function authoredTransformIssue(matrix) {
  matrix.decompose(_transformPosition, _transformQuaternion, _transformScale);
  const scale = [_transformScale.x, _transformScale.y, _transformScale.z];
  if (!scale.every(Number.isFinite) || scale.some((value) => Math.abs(value) < 1e-6)) return 'scale';
  if (scale.some((value) => value < 0) || matrix.determinant() <= 0) return 'mirrored';
  _recomposed.compose(_transformPosition, _transformQuaternion, _transformScale);
  const tolerance = AUTHORED_TRANSFORM_SKEW_EPSILON * Math.max(1, ...scale.map(Math.abs));
  const a = matrix.elements;
  const b = _recomposed.elements;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a[i] - b[i]) > tolerance) return 'shear';
  }
  return null;
}

function validateNodeTransform(node, matrix, errors) {
  const issue = authoredTransformIssue(matrix);
  if (issue === 'scale') {
    errors.push(`${label(node)} has a zero or non-finite transform scale`);
  } else if (issue === 'mirrored') {
    errors.push(`${label(node)} uses mirrored/negative scale; apply transforms and export real mirrored topology so instancing preserves winding`);
  } else if (issue === 'shear') {
    errors.push(`${label(node)} contains shear; apply parent transforms before export so hook and mount TRS remain exact`);
  }
}

function isContractMarker(node, tags) {
  return !!(tags.socket || tags.mount || tags.drive || tags.damageRole || /^(HOOK|MOUNT)_/i.test(node.name || ''));
}

function isCanopy(node, slot) {
  const nodeName = String(node.name || '');
  if (/(canopy|cockpit[_ -]?glass|windscreen)/i.test(nodeName)) return true;
  const materialName = node.material && !Array.isArray(node.material) ? String(node.material.name || '') : '';
  return slot === 'cockpit' && /(?:canopy|glass|windscreen)/i.test(materialName);
}

function socketRoleFromName(name) {
  if (name.includes('WEAPON')) return 'weapon';
  if (name.includes('MINING')) return 'mining';
  if (name.includes('ENGINE')) return 'engine';
  if (name.includes('TRAIL')) return 'vfx';
  if (name.includes('CAMERA')) return 'camera';
  if (name.includes('CARGO')) return 'cargo';
  if (name.includes('UTILITY')) return 'utility';
  return 'attachment';
}

function normalizeLod(value) {
  const match = String(value || '').toLowerCase().match(/[012]/);
  return match ? `lod${match[0]}` : null;
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function finiteInRange(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max;
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function label(node) {
  return `mesh "${node.name || node.uuid}"`;
}

function fileStem(url) {
  const name = String(url).split('/').pop() || 'authored_part';
  return name.replace(/\.[^.]+$/, '');
}

function sceneBoundsArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function warnOnce(key, message, error) {
  if (warned.has(key)) return;
  warned.add(key);
  if (error) console.warn(message, error);
  else console.warn(message);
}
