// GLTFKit: authored ship-part composition over the synchronous procedural visual boundary.
//
// The renderer must receive an Object3D immediately. We therefore return a stable boundary root,
// then install the authored payload once the real renderer/scene is available. Static opaque authored
// pieces are merged into ship-local batches; stateful pieces such as glass, thrusters, sockets,
// damage lights, and LOD hooks stay as normal objects.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACTION_PALETTES, TEAM_FALLBACK_PALETTES } from '../data/palettes.js';
import { paletteWithShipAppearance, shipAppearanceSignature } from '../core/shipAppearance.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { invalidateFailedAuthoredAssets, loadAuthoredPart } from './assetLoader.js';
import { getAssetResidency } from './assetResidency.js';
import { configureRealtimeCanopyMaterials } from './canopyMaterialPolicy.js';
import {
  isCriticalStartingHub as isTableCriticalStartingHub,
  isOpeningStoryActor,
  tableInstanceFarCullWu,
  tableOpeningCompositionWu,
} from './tabletopPolicy.js';
import { isReleaseAssetMode } from './releaseMode.js';
import * as kit from './ships/shipKit.js';
import { attachPlaceHlod, attachStationHlod } from './hlod.js';
import { freezeStaticChildMatrices } from './staticChildMatrices.js';
import { optimizeStaticBatchesForRoot } from './visualFactory.js';
import { attachLodState } from './lod.js';
import {
  canInstallWholeShipLodFamily,
  lodFileFromFamily,
  normalizeRequestedLod,
  resolveWholeShipLodTransition,
  selectSpawnLodLevel,
  shouldCommitWholeShipLodLoad,
} from './wholeShipLodPolicy.js';
import {
  instancePoolIdentity,
  packageBatchPoolKeyFromMaterial,
  stampGeometryBatchKey,
} from './materialBatchKey.js';
import {
  canBatchRenderPackageOwner,
  isRigidOpaqueBatchableSurface,
} from './rigidOpaqueBatchPolicy.js';
import { authoredUpgradeConcurrencyLimit as resolveAuthoredUpgradeConcurrency } from './authoredUpgradePolicy.js';
import { shouldStartHeavyAdmissionEventually } from './admissionSliceBudget.js';
import {
  computeLoadoutFingerprint,
  MATERIAL_ABI_VERSION,
  createFlightRenderPackageCache,
} from './flightRenderPackage.js';
import { cookFlightProduct } from './flightProductCooker.js';
import {
  FLIGHT_READY_ROLE,
  PLACE_PACKAGE_LAYER,
  createFlightReadySet,
  isFlightReadyStatus,
  isPlaceLayerBlockingFlightReady,
  selectPlacePackageLayer,
} from './flightReadySet.js';
import { PRESENTATION_TIER } from '../world/activityClassification.js';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';

const flightRenderPackages = createFlightRenderPackageCache();
// A composed root is reusable only when it has no renderer-owned package/instance slots. Those
// slots carry scene and residency ownership and must be created through their package API. The
// safe template lane below covers immutable procedural/static-batch compositions and rebuilds only
// per-instance callbacks, bindings, transforms, and materials on a cache hit.
const flightRootTemplates = new Map();
const FLIGHT_ROOT_TEMPLATE_CACHE_LIMIT = 32;
let flightTemplateProbeSequence = 0;

export function getFlightRenderPackageCache() {
  return flightRenderPackages;
}

export function getFlightRootTemplateCacheDiagnostics() {
  return Object.freeze({
    size: flightRootTemplates.size,
    keys: Object.freeze([...flightRootTemplates.keys()]),
  });
}
import { applyInstanceChunkSubmitPolicy } from './instanceChunkSubmitPolicy.js';
import {
  createOpaqueMaterialBatchState,
  syncOpaqueMaterialBatches,
} from './opaqueMaterialBatch.js';
import {
  rememberStaticBatchGeometry,
  staticBatchGeometryCacheKey,
  takeCachedStaticBatchGeometry,
} from './staticBatchGeometryCache.js';
import { configureTransparentSinglePassSurfaces } from './transparentSinglePassPolicy.js';
import { installWorldSitePresentation } from './worldSitePresentation.js';
import {
  hasExplicitAuthoredGeologyPresentation,
  hasExplicitAuthoredPayloadPresentation,
  PRESENTATION_ADMISSION,
  setPresentationAdmission,
} from '../core/presentationAdmission.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  createDynamicBufferCoordinator,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from './dynamicBufferRanges.js';
import {
  createWebGlDisposeListenerProvenance,
  describeWebGlDisposeListenerProvenance,
  mergeWebGlDisposeListenerProvenance,
} from './contextResourceLifecycle.js';

const PART_ROOT = 'assets/ships/parts/';
const PART_RELEASE_ROOT = 'assets/ships/release/parts/';
const AUTHORED_CARGO_CAPSULE_FILE = 'pods/pod_cargo_container.glb';
const WRECK_CATHEDRAL_PLACE_ID = 'place_landmark_wreck_cathedral';
const CLAIM_RELAY_PLACE_ID = 'place_claim_outpost_relay';
const WRECK_CATHEDRAL_CLOSED_MATERIAL_ROLES = new Set([
  'copper_coil',
  'heat_affected_alloy',
  'hull',
  'maintenance_mark',
  'mechanical',
  'signal',
  'warning',
]);
const KESTREL_HERO_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME';
const INSTANCE_CHUNK_SIZE = 64;
const AUTHORED_INSTANCE_MATRIX = 0;
const INSTANCE_FAR_CULL_RADIUS = tableInstanceFarCullWu();
const INSTANCE_FRUSTUM_PAD = 420;
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_AUTHORED_DISPOSE_PROBE_RECEIPT = Object.freeze({ captured: false, listener: null });
const HIDDEN_INSTANCE_OWNER_FRAME = Object.freeze({ frame: 0, visible: false });
const sceneStates = new WeakMap();
const libraryByRenderer = new WeakMap();
const resolvedLibraryByRenderer = new WeakMap();
const planAdmissionByRenderer = new WeakMap();
const decodeAdmissionDiagnosticsByRenderer = new WeakMap();
const sharedMaterialVariants = new Map();
const sharedReadabilityShellVariants = new Map();
const ownerReleaseState = new WeakMap();
const compositionPrimitiveCache = new WeakMap();
const upgradeQueuesByScene = new WeakMap();
const bootstrapResidencyOwnersByRenderer = new WeakMap();
const authoredInstancedMeshDisposeRegistrationByRenderer = new WeakMap();
const authoredInstancedMeshDisposeProbeByRenderer = new WeakMap();
const contractRecordsBySlot = new Map();
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const IDENTITY_MATRIX = new THREE.Matrix4();
const BATCH_INVERSE = new THREE.Matrix4();
const BATCH_LOCAL = new THREE.Matrix4();
const CULL_PROJECTION = new THREE.Matrix4();
const CULL_FRUSTUM = new THREE.Frustum();
const CULL_CAMERA_POSITION = new THREE.Vector3();
const CULL_SPHERE = new THREE.Sphere(new THREE.Vector3(), INSTANCE_FRUSTUM_PAD);
let fallbackNavLightGeometry = null;
const FALLBACK_NAV_LIGHT_MAT = new THREE.Matrix4();
const SHIP_ASSEMBLY_SLOTS = Object.freeze(['hull', 'cockpit', 'engine', 'fin', 'weapon', 'greeble', 'gear', 'pod']);
const STATION_ARCHETYPE_FILES = Object.freeze([
  'places/place_station_trade_hub.glb',
  'places/place_station_refinery.glb',
  'places/place_station_military.glb',
  'places/place_station_blackmarket.glb',
  'places/place_station_fab.glb',
  'places/place_station_mining.glb',
  'places/place_station_research.glb',
  'places/place_gate_jump_ring.glb',
]);
const CLAIM_SPECIALIZATION_PLACE_FILE_BY_ID = Object.freeze({
  spec_refinery: 'places/place_claim_outpost_refinery.glb',
  spec_relay: 'places/place_claim_outpost_relay.glb',
  spec_bastion: 'places/place_claim_outpost_bastion.glb',
});
const PLACE_FILES = Object.freeze([
  'places/place_lane_beacon.glb',
  'places/place_nav_buoy.glb',
  'places/place_asteroid_seamed.glb',
  'places/place_debris_chunk.glb',
  'places/place_station_billboard.glb',
  'places/place_memorial_array.glb',
  'places/place_dead_hulk.glb',
  'places/place_ceres_bait_wreck.glb',
  'places/place_ceres_grave_shard.glb',
  'places/place_conveyor_barge.glb',
  'places/place_mining_drone.glb',
  // Only the two lane-furniture bodies every still reviewer cleared. The other four stay released
  // on disk and unrouted until their blocking notes are answered (assets/places/lane_furniture/VISUAL_REVIEW.md).
  'places/place_lane_pin.glb',
  'places/place_cold_locker.glb',
  'places/place_asteroid_rock_a.glb',
  'places/place_asteroid_rock_b.glb',
  'places/place_asteroid_rock_c.glb',
  'places/place_asteroid_graffiti.glb',
  'places/place_claim_outpost_base.glb',
  // PQ-018 admission: the Wreck Cathedral hero landmark resolves through the same authored-place
  // path as every other place. Its World Site manifest, Ceres placement, and route acceptance are
  // separate PQ-018 phases; registration here only makes the release artifact resolvable.
  'places/place_landmark_wreck_cathedral.glb',
  ...Object.values(CLAIM_SPECIALIZATION_PLACE_FILE_BY_ID),
  ...STATION_ARCHETYPE_FILES,
]);
const PLACE_FILE_BY_ID = Object.freeze(Object.fromEntries(PLACE_FILES.map((file) => [
  file.replace(/^places\//, '').replace(/\.glb$/, ''),
  file,
])));
let fallbackPlaceGeometry = null;
let fallbackStationCoreGeometry = null;
let fallbackStationRingGeometry = null;
let fallbackStationSparGeometry = null;

// Runtime slots mirror assets/ships/parts/parts_manifest.json. Only list files that are actually
// vendored; missing slots fall back procedurally instead of producing browser 404s.
// WebGL context restore: authored part blueprints and their derived shared material variants
// hold GPU resources that are invalid after the context is recreated. Clear them so subsequent
// ships reload authored parts and rebuild fresh materials.
export function invalidatePartsLibraryCaches(renderer) {
  sharedMaterialVariants.clear();
  sharedReadabilityShellVariants.clear();
  if (renderer) {
    const bootstrapOwner = bootstrapResidencyOwnersByRenderer.get(renderer);
    if (bootstrapOwner) {
      const residency = getAssetResidency(renderer);
      if (residency) residency.releaseOwner(bootstrapOwner, 'parts-library-invalidated');
      bootstrapResidencyOwnersByRenderer.delete(renderer);
    }
    const promises = libraryByRenderer.get(renderer);
    if (promises) promises.clear();
    const resolved = resolvedLibraryByRenderer.get(renderer);
    if (resolved) resolved.clear();
    const admissions = planAdmissionByRenderer.get(renderer);
    if (admissions) admissions.clear();
  }
}

export function syncAuthoredInstancePools(scene, opts = {}) {
  const state = scene && sceneStates.get(scene);
  return state ? syncSceneState(state, opts) : null;
}

export function collectAuthoredInstancePoolRoots(scene) {
  const state = scene && sceneStates.get(scene);
  if (!state) return [];
  const roots = [];
  for (const pool of state.pools.values()) {
    for (const chunk of pool.chunks) {
      const mesh = chunk && chunk.mesh;
      if (mesh && mesh.visible !== false && mesh.count > 0 && mesh.parent) roots.push(mesh);
    }
  }
  return roots;
}

/**
 * Capture Three's renderer/context-generation disposal callbacks without relying on Function.name.
 * A private zero-count InstancedMesh is rendered once through the real renderer into a private
 * target. Its geometry, main/shadow materials, sampled texture, target, and object cannot receive
 * foreign listeners, so every captured callback is exact provenance even after minification.
 */
export function beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer) {
  if (!scene || typeof scene.add !== 'function' || !renderer) return null;
  const currentRegistration = authoredInstancedMeshDisposeRegistrationByRenderer.get(renderer);
  if (currentRegistration?.complete === true) return null;
  if (authoredInstancedMeshDisposeProbeByRenderer.has(renderer)) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0, 0.5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0.5, 1,
  ], 2));
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
  material.colorWrite = false;
  material.depthTest = false;
  material.depthWrite = false;
  const probe = new THREE.InstancedMesh(geometry, material, 1);
  probe.name = 'SF_PrivateInstancedMeshDisposeRegistrationProbe';
  probe.count = 0;
  probe.visible = true;
  probe.frustumCulled = false;
  probe.castShadow = true;
  probe.userData.spacefacePrivateContextProbe = true;

  const probeScene = new THREE.Scene();
  const probeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  probeCamera.position.set(0, 0, 2);
  probeCamera.lookAt(0, 0, 0);
  probeCamera.updateMatrixWorld(true);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0);
  directionalLight.castShadow = true;
  directionalLight.position.set(0, 0, 2);
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.shadow.mapSize.set(1, 1);
  const pointLight = new THREE.PointLight(0xffffff, 0, 4);
  pointLight.castShadow = true;
  pointLight.position.set(0, 0, 2);
  pointLight.shadow.mapSize.set(1, 1);
  probeScene.add(probe, directionalLight, directionalLight.target, pointLight);

  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  renderTarget.texture.generateMipmaps = false;

  const receipt = {
    captured: createWebGlDisposeListenerProvenance(),
    captureErrors: [],
    directionalLight,
    ended: false,
    geometry,
    material,
    pointLight,
    probe,
    probeCamera,
    probeScene,
    renderTarget,
    renderer,
    scene,
    texture,
  };
  const capturePrivateRegistration = (resource, key) => {
    const addEventListener = resource.addEventListener;
    Object.defineProperty(resource, 'addEventListener', {
      configurable: true,
      writable: true,
      value(type, listener) {
        if (type === 'dispose') receipt.captured[key].add(listener);
        return addEventListener.call(this, type, listener);
      },
    });
  };
  capturePrivateRegistration(probe, 'instancedMeshes');
  capturePrivateRegistration(geometry, 'geometries');
  capturePrivateRegistration(material, 'materials');
  capturePrivateRegistration(texture, 'textures');
  capturePrivateRegistration(renderTarget, 'renderTargets');
  authoredInstancedMeshDisposeProbeByRenderer.set(renderer, receipt);

  const canRenderProbe = typeof renderer.render === 'function'
    && typeof renderer.setRenderTarget === 'function';
  if (canRenderProbe) {
    const previousTarget = typeof renderer.getRenderTarget === 'function'
      ? renderer.getRenderTarget()
      : null;
    const previousCubeFace = typeof renderer.getActiveCubeFace === 'function'
      ? renderer.getActiveCubeFace()
      : 0;
    const previousMipmapLevel = typeof renderer.getActiveMipmapLevel === 'function'
      ? renderer.getActiveMipmapLevel()
      : 0;
    const shadowMap = renderer.shadowMap || null;
    const previousShadowState = shadowMap ? {
      autoUpdate: shadowMap.autoUpdate,
      enabled: shadowMap.enabled,
      needsUpdate: shadowMap.needsUpdate,
    } : null;
    try {
      if (shadowMap) {
        shadowMap.enabled = true;
        shadowMap.autoUpdate = true;
        shadowMap.needsUpdate = true;
      }
      renderer.setRenderTarget(renderTarget, 0, 0);
      renderer.render(probeScene, probeCamera);
    } catch (error) {
      receipt.captureErrors.push(String(error?.message || error));
    } finally {
      try {
        renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel);
      } catch (error) {
        receipt.captureErrors.push(`render-target restore failed: ${String(error?.message || error)}`);
      }
      if (shadowMap && previousShadowState) {
        shadowMap.enabled = previousShadowState.enabled;
        shadowMap.autoUpdate = previousShadowState.autoUpdate;
        shadowMap.needsUpdate = previousShadowState.needsUpdate;
      }
    }
  }
  return receipt;
}

export function endAuthoredInstanceMeshDisposeRegistrationProbe(receipt) {
  if (!receipt || receipt.ended === true) {
    return EMPTY_AUTHORED_DISPOSE_PROBE_RECEIPT;
  }
  receipt.ended = true;
  const {
    captured,
    captureErrors,
    directionalLight,
    geometry,
    material,
    pointLight,
    probe,
    probeScene,
    renderTarget,
    renderer,
    texture,
  } = receipt;
  let registration = renderer
    ? authoredInstancedMeshDisposeRegistrationByRenderer.get(renderer)
    : null;
  if (!registration) {
    registration = createWebGlDisposeListenerProvenance();
    registration.captureErrors = [];
  }
  mergeWebGlDisposeListenerProvenance(registration, captured);
  registration.captureErrors.push(...captureErrors);
  const provenanceStatus = describeWebGlDisposeListenerProvenance(registration);
  registration.complete = provenanceStatus.complete;
  if (renderer && Object.values(provenanceStatus.listenerCounts).some((count) => count > 0)) {
    authoredInstancedMeshDisposeRegistrationByRenderer.set(renderer, registration);
  }
  if (renderer && authoredInstancedMeshDisposeProbeByRenderer.get(renderer) === receipt) {
    authoredInstancedMeshDisposeProbeByRenderer.delete(renderer);
  }

  // Probe cleanup must never mask the caller's render failure. Exhaust every private resource and
  // report capture state; the next draw retries automatically when no listener was registered.
  try { probe?.removeFromParent?.(); } catch (_) { /* private cleanup only */ }
  try { probe?.dispose?.(); } catch (_) { /* preserve caller render result/error */ }
  try { directionalLight?.shadow?.dispose?.(); } catch (_) { /* preserve caller render result/error */ }
  try { pointLight?.shadow?.dispose?.(); } catch (_) { /* preserve caller render result/error */ }
  try { renderTarget?.dispose?.(); } catch (_) { /* preserve caller render result/error */ }
  try { geometry?.dispose?.(); } catch (_) { /* preserve caller render result/error */ }
  try { material?.dispose?.(); } catch (_) { /* preserve caller render result/error */ }
  try { texture?.dispose?.(); } catch (_) { /* preserve caller render result/error */ }
  try { probeScene?.clear?.(); } catch (_) { /* preserve caller render result/error */ }
  const listener = captured.instancedMeshes.values().next().value || null;
  return {
    captured: listener !== null,
    captureErrors: registration.captureErrors.slice(),
    complete: registration.complete,
    listener,
    provenanceStatus,
    registration,
  };
}

/**
 * Detached package-pool targets are not reachable from the live scene while a sector boundary is
 * being prepared. Three attaches one object-level disposal listener when an InstancedMesh reaches
 * an actual render. Its Function.name is not stable in the shipped minified bundle, so the renderer
 * captures the exact callback identity with a private probe. Detach only that proven old-context
 * identity; foreign listeners remain untouched and the first restored draw captures the successor.
 */
export function prepareAuthoredInstancePoolsForContextLoss(scene, renderer) {
  const state = scene && sceneStates.get(scene);
  const provenance = renderer
    ? authoredInstancedMeshDisposeRegistrationByRenderer.get(renderer)
    : null;
  const roots = [];
  const seenRoots = new Set();
  const addRoot = (root) => {
    if (!root || seenRoots.has(root)) return;
    seenRoots.add(root);
    roots.push(root);
  };
  addRoot(scene);
  if (!state) {
    if (renderer) authoredInstancedMeshDisposeRegistrationByRenderer.delete(renderer);
    return {
      provenance: provenance || createWebGlDisposeListenerProvenance(),
      provenanceStatus: describeWebGlDisposeListenerProvenance(provenance),
      roots,
    };
  }
  for (const preparedRoots of state.preparedAuthoredRoots?.values() || EMPTY_ARRAY) {
    for (const root of preparedRoots) addRoot(root);
  }
  const chunks = new Set(state.retiringChunks || EMPTY_ARRAY);
  for (const pool of state.pools.values()) {
    for (const chunk of pool.chunks) chunks.add(chunk);
  }
  for (const chunk of chunks) {
    const mesh = chunk && chunk.mesh;
    if (!mesh) continue;
    addRoot(mesh);
  }
  if (renderer) authoredInstancedMeshDisposeRegistrationByRenderer.delete(renderer);
  return {
    provenance: provenance || createWebGlDisposeListenerProvenance(),
    provenanceStatus: describeWebGlDisposeListenerProvenance(provenance),
    roots,
  };
}

function registerPreparedAuthoredRoot(scene, boundary, root) {
  if (!scene || !boundary || !root) return false;
  const state = sceneState(scene);
  let roots = state.preparedAuthoredRoots.get(boundary);
  if (!roots) {
    roots = new Set();
    state.preparedAuthoredRoots.set(boundary, roots);
  }
  roots.add(root);
  return true;
}

function unregisterPreparedAuthoredRoot(scene, boundary, root) {
  const state = scene && sceneStates.get(scene);
  const roots = state?.preparedAuthoredRoots?.get(boundary);
  if (!roots) return false;
  roots.delete(root);
  if (roots.size === 0) state.preparedAuthoredRoots.delete(boundary);
  return true;
}

function registerPreparedAuthoredAdmission(scene, boundary, authored) {
  const root = authored?.root;
  if (!root) return false;
  const contextRoots = new Set([root]);
  for (const object of authored.ownerLocalObjects || EMPTY_ARRAY) contextRoots.add(object);
  for (const geometry of authored.ownerLocalGeometries || EMPTY_ARRAY) contextRoots.add(geometry);
  for (const material of authored.ownerLocalMaterials || EMPTY_ARRAY) contextRoots.add(material);
  for (const instance of authored.renderPackageInstances || EMPTY_ARRAY) {
    if (instance?.root) contextRoots.add(instance.root);
    for (const node of instance?.planNodes || EMPTY_ARRAY) contextRoots.add(node);
  }
  let registered = false;
  for (const contextRoot of contextRoots) {
    registered = registerPreparedAuthoredRoot(scene, boundary, contextRoot) || registered;
  }
  if (!registered) return false;
  authored.preparedContextRoots = [...contextRoots];
  authored.preparedScene = scene;
  authored.preparedBoundary = boundary;
  return true;
}

function unregisterPreparedAuthoredAdmission(authored) {
  if (!authored) return false;
  let removed = false;
  for (const contextRoot of authored.preparedContextRoots || [authored.root]) {
    removed = unregisterPreparedAuthoredRoot(
      authored.preparedScene,
      authored.preparedBoundary,
      contextRoot,
    ) || removed;
  }
  authored.preparedContextRoots = null;
  authored.preparedScene = null;
  authored.preparedBoundary = null;
  return removed;
}

export function getAuthoredInstancePoolDiagnostics(scene) {
  const state = scene && sceneStates.get(scene);
  if (!state) return {
    pools: 0,
    chunks: 0,
    pooledInstanceSlots: 0,
    submittedInstanceSlots: 0,
    visibleInstancePools: 0,
    offscreenInstancePools: 0,
    culledInstanceSlots: 0,
    hiddenInstanceSlots: 0,
    avgPoolOccupancy: 0,
    tinyPools: 0,
    shadowCastingInstanceChunks: 0,
    opaqueBatches: 0,
    opaqueBatchInstances: 0,
    opaqueBatchHiddenChunks: 0,
    matrixUploads: 0,
    matrixReuses: 0,
    frameBounded: false,
    ownersVisited: 0,
    slotsVisited: 0,
  };
  return { ...state.stats };
}

export const PART_LIBRARY_CONTRACT = Object.freeze({
  version: 1,
  root: PART_ROOT,
  releaseRoot: PART_RELEASE_ROOT,
  slots: Object.freeze({
    // Seven class-authored hull GLBs (GR-9). Each carries LOD0/LOD1/LOD2 meshes, nine assembly
    // mounts (MOUNT_COCKPIT / ENGINE_{FL,FR,BL,BR} / FIN_{L,R}) and SOCKET_{Trail_Main,Weapon_Front},
    // with 1024² embedded KTX2 baseColor + OpenGL normal + packed ORM. See assetLoader.js for the
    // full spacefaceAsset contract they were authored against.
    hull: Object.freeze([
      'hulls/hull_starter.glb',
      'hulls/hull_fighter.glb',
      'hulls/hull_miner.glb',
      'hulls/hull_freighter.glb',
      'hulls/hull_interceptor.glb',
      'hulls/hull_corvette.glb',
      'hulls/hull_frigate.glb',
      'hulls/hull_capital.glb',
      'hulls/hull_multirole.glb',
      'hulls/hull_gunship.glb',
      // K0 promotes the production Borrowed Time Kestrel: a complete body with structural LODs,
      // semantic materials, stable sockets, and no baked plume. Ashline adds three production Reach
      // hostile bodies selected by combat archetype below. Helios civilian bodies are selected by
      // trafficRole so the courier can share ship_kestrel gameplay stats without replacing the
      // player's Borrowed Time body; blocked accessory exports remain omitted.
      'wholeships/kestrel.glb',
      'wholeships/ashline_dart.glb',
      'wholeships/ashline_lode.glb',
      'wholeships/ashline_rig.glb',
      'wholeships/helios_lark.glb',
      'wholeships/helios_cradle.glb',
      'wholeships/helios_span.glb',
    ]),
    cockpit: Object.freeze([
      'cockpits/cockpit_dome.glb',
      'cockpits/cockpit_slab.glb',
      'cockpits/cockpit_recessed.glb',
    ]),
    engine: Object.freeze([
      'engines/engine_ion_small.glb',
      'engines/engine_ion_twin.glb',
      'engines/engine_industrial.glb',
      'engines/engine_resonator.glb',
      'engines/engine_vector.glb',
      'engines/engine_plasma_ring.glb',
    ]),
    fin: Object.freeze([
      'fins/fin_wedge.glb',
      'fins/fin_radiator_grid.glb',
      'fins/fin_swept_smuggler.glb',
      'fins/fin_crystalline.glb',
      'fins/fin_delta.glb',
      'fins/fin_stabilator.glb',
    ]),
    weapon: Object.freeze([
      'weapons/weapon_pulse_cannon.glb',
      'weapons/weapon_heavy_cannon.glb',
      'weapons/weapon_turret_dual.glb',
      'weapons/weapon_lance.glb',
      'weapons/weapon_gatling.glb',
      'weapons/weapon_railgun.glb',
    ]),
    greeble: Object.freeze([
      'greebles/greeble_vents.glb',
      'greebles/greeble_hatches.glb',
      'greebles/greeble_pipes.glb',
      'greebles/greeble_rcs.glb',
      'greebles/greeble_antennas.glb',
      'greebles/greeble_nav_lights.glb',
      'greebles/greeble_armor_plates.glb',
    ]),
    gear: Object.freeze([
      'gear/skid_trio.glb',
      'gear/skid_quad.glb',
    ]),
    pod: Object.freeze([
      'pods/pod_utility.glb',
      'pods/pod_cargo_container.glb',
      'pods/pod_repair_patch.glb',
    ]),
    place: PLACE_FILES,
  }),
  assembly: Object.freeze({
    coordinateSystem: '+X forward, +Y up, +Z starboard; metres',
    sharedOpaquePrimitives: 'ship-local merged static batches',
    mutableHooks: 'per-ship meshes sharing immutable geometry/textures',
    authoredMounts: 'MOUNT_COCKPIT / MOUNT_ENGINE_* / MOUNT_FIN_* on hull parts',
    authoredSlots: 'hull / cockpit / engine / fin / weapon / greeble / gear / pod / place',
    missingPart: 'procedural slot fallback; never blank an entity',
  }),
});

// The player-facing boot gate used to decode every authored file in the catalog at once. Keep the
// canonical cache bootstrap scoped to the player's production Kestrel. Other opening-runway ships
// are admitted through their live entity boundaries while loading, so their residency can hand off
// and release normally instead of being pinned by a global bootstrap owner.
const AUTHORED_BOOTSTRAP_PLAN = Object.freeze({
  hull: Object.freeze(['wholeships/kestrel.glb']),
});
// Gate the same spatial runway used by live authored prefetch so its initial decode/composition and
// associated garbage collection finish behind loading. Distant authored-only boundaries remain
// hidden and continue to stream on demand.
const REGULAR_HULL_FILES = Object.freeze(
  PART_LIBRARY_CONTRACT.slots.hull.filter((file) => !String(file).startsWith('wholeships/')),
);

export function authoredBootstrapPreloadPlan() {
  return clonePreloadPlan(AUTHORED_BOOTSTRAP_PLAN);
}

function entityOnOpeningTable(entity, state) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : (state && state.entityList || []).find((candidate) => candidate && candidate.id === state.playerId);
  if (!player || !player.pos || !entity || !entity.pos) return false;
  const dx = Number(entity.pos.x) - Number(player.pos.x);
  const dz = Number(entity.pos.z) - Number(player.pos.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  const radius = tableOpeningCompositionWu(state);
  return radius > 0 && dx * dx + dz * dz <= radius * radius;
}

/**
 * Flight-gate membership. A Helios hub sitting a kilometer off the opening table is a streamable
 * place record and cannot hold the player in the loading shell; only its gameplay shell enters the
 * startup set once it is actually on the opening table.
 * Story cold-start ships and the player remain gated.
 */
export function isOpeningFlightGateEntity(entity, state) {
  if (!entity || entity.alive === false || !state) return false;
  if (entity.id === state.playerId || entity.isPlayer === true) return true;
  if (isOpeningStoryActor(entity, state)) return true;
  if (isTableCriticalStartingHub(entity) || isCriticalStartingHub(entity)) {
    if (!entity.pos) return true;
    return entityOnOpeningTable(entity, state);
  }
  return isInitialAuthoredCompositionEntity(entity, state);
}

/** Opening-shot quality gate: nearby actors settle behind loading, distant world stays on-demand. */
export function isInitialAuthoredCompositionEntity(entity, state) {
  if (!entity || entity.alive === false || !state) return false;
  if (entity.id === state.playerId || entity.isPlayer === true) return true;
  // A critical place without a pose is the loading-shell record and must be admitted. Once the
  // world has positioned that place, only the opening-table envelope belongs to the authored
  // startup composition; far hub detail is a streamable package and must not trigger a full GLB
  // decode merely because its identity is `station_helios`.
  if (isTableCriticalStartingHub(entity) || isCriticalStartingHub(entity)) {
    return !entity.pos || entityOnOpeningTable(entity, state);
  }
  if (isOpeningStoryActor(entity, state)) return true;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : (state.entityList || []).find((candidate) => candidate && candidate.id === state.playerId);
  if (!player || !player.pos || !entity.pos) return false;
  const dx = Number(entity.pos.x) - Number(player.pos.x);
  const dz = Number(entity.pos.z) - Number(player.pos.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  const isPlace = (entity.type === 'station' || entity.type === 'fx') && placeFileForEntity(entity);
  if (entity.type !== 'ship' && !isPlace) return false;
  const radius = tableOpeningCompositionWu(state);
  return radius > 0 && dx * dx + dz * dz <= radius * radius;
}

/** Pure per-entity residency plan. Complete authored bodies need one GLB. Modular ships predict the
 * exact deterministic records consumed by live assembly before any decode/upload begins. */
export function authoredPreloadPlanForEntity(entity, options = {}) {
  if (!entity || entity.type !== 'ship') return {};
  const whole = wholeShipVisualForEntity(entity, options);
  if (whole && whole.file) {
    const file = options.forceWholeShipFile
      || (options.lodLevel
        ? wholeShipLodFileForEntity(entity, options.lodLevel, options)
        : whole.file);
    return { hull: [file] };
  }

  const defId = entity.data && entity.data.defId;
  const seed = hashString(`${entity.id}|${defId}|${entity.factionId || ''}`);
  const shipDef = SHIP_BY_ID.get(defId);
  const mappedHull = HULL_FILE_BY_DEF_ID[defId];
  const hullFile = mappedHull || (REGULAR_HULL_FILES.length
    ? REGULAR_HULL_FILES[((seed ^ hashString('hull')) >>> 0) % REGULAR_HULL_FILES.length]
    : null);
  const plan = {};
  addPlanFiles(plan, 'hull', [hullFile]);
  addPlanFiles(plan, 'cockpit', [seededContractFile('cockpit', seed)]);
  addPlanFiles(plan, 'engine', [engineRecordFor(contractRecords('engine'), entity, seed)?.url]);
  addPlanFiles(plan, 'fin', [seededContractFile('fin', seed)]);
  addPlanFiles(plan, 'weapon', authoredWeaponMounts(entity, shipDef, contractRecords('weapon'), seed)
    .map((mount) => mount.record && mount.record.url));
  addPlanFiles(plan, 'pod', authoredPodMounts(entity, shipDef, contractRecords('pod'), seed)
    .map((mount) => mount.record && mount.record.url));
  addPlanFiles(plan, 'gear', [authoredGearMount(entity, shipDef, contractRecords('gear'), seed)?.record?.url]);
  addPlanFiles(plan, 'greeble', authoredGreebleMounts(entity, shipDef, contractRecords('greeble'), seed)
    .map((mount) => mount.record && mount.record.url));
  return plan;
}

/** Keep sector preparation on the same complete-body selector as the installed visual factory.
 * Hostile and traffic roles already select complete bodies inside wholeShipVisualForEntity; this
 * covers the two def-driven production bodies whose factory selection is intentionally stricter. */
export function requiresProductionWholeShipForEntity(entity) {
  if (!entity || entity.type !== 'ship' || !entity.data) return false;
  const defId = entity.data.defId;
  return (entity.isPlayer === true && defId === 'ship_kestrel') || defId === 'ship_wasp';
}

/**
 * Stable identity for the exact authored composition selected for one entity. Sector-entry staging
 * captures this before any decode/composition work and refuses to publish if gameplay changes the
 * hull, fitted hardware, traffic/hostile role, or authored place envelope while that work is in
 * flight. Dynamic pose, damage, and job state are deliberately excluded: they are applied by the
 * live presentation boundary after publication and must not invalidate an otherwise reusable root.
 */
export function authoredCompositionFingerprintForEntity(entity, options = {}) {
  if (!entity) return 'missing';
  const data = entity.data || {};
  const requiredWholeShip = options.requiredWholeShip === true
    || requiresProductionWholeShipForEntity(entity);
  const weapons = Array.isArray(data.weapons)
    ? data.weapons.map((weapon) => ({
        defId: weapon && weapon.defId || null,
        facing: weapon && weapon.facing || null,
        size: weapon && weapon.size || null,
      }))
    : [];
  const fittings = Array.isArray(data.fittings) ? data.fittings.map(String) : [];
  return JSON.stringify({
    id: entity.id == null ? null : String(entity.id),
    type: entity.type || null,
    team: entity.team == null ? null : entity.team,
    factionId: entity.factionId || null,
    radius: Number.isFinite(Number(entity.radius)) ? Number(entity.radius) : null,
    requiredWholeShip,
    selector: {
      defId: data.defId || null,
      lootTableId: data.lootTableId || null,
      trafficRole: data.trafficRole || null,
      placeId: data.placeId || null,
      assetId: data.assetId || null,
      landmarkGlb: data.landmarkGlb || null,
      archetypeGlb: data.archetypeGlb || null,
      claimSpecId: data.claimSpecId || null,
      claimOwned: data.claimOwned === true,
      placeScale: Number.isFinite(Number(data.placeScale)) ? Number(data.placeScale) : null,
      placeTargetRadius: Number.isFinite(Number(data.placeTargetRadius))
        ? Number(data.placeTargetRadius)
        : null,
      visualRadius: Number.isFinite(Number(data.visualRadius)) ? Number(data.visualRadius) : null,
      dockRadius: Number.isFinite(Number(data.dockRadius)) ? Number(data.dockRadius) : null,
      stationRadius: Number.isFinite(Number(data.stationRadius)) ? Number(data.stationRadius) : null,
      authoredGeologySkin: data.authoredGeologySkin === true,
      typeId: data.typeId || null,
      tint: data.tint == null ? null : data.tint,
      paletteClass: data.paletteClass || null,
      authoredPayloadAssetId: data.authoredPayloadAssetId || null,
      payloadStableId: data.payloadStableId || null,
      appearancePresent: !!data.appearance && typeof data.appearance === 'object',
      appearance: shipAppearanceSignature(data.appearance, data.defId || null),
      fittings,
      weapons,
    },
    plan: authoredPreloadPlanForEntity(entity, { ...options, requiredWholeShip }),
  });
}

/**
 * Exact authored records needed by the entities materialized for one sector.
 *
 * This is deliberately derived from live entity identities rather than a curated asset list. Whole
 * ships, modular selections, explicit places/geology, and physical cargo capsules therefore use the
 * same selectors as their eventual presentation boundaries. Supplying the slot is important: the
 * loader cache key is URL + slot, so a slotless prewarm would decode a second generation when the
 * boundary later requested the same file with its real slot.
 */
export function authoredPrewarmRequestsForEntities(entities, options = {}) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const exactSectorId = options.sectorId == null ? null : String(options.sectorId);
  const playerId = options.playerId == null ? null : String(options.playerId);
  const includePlayer = options.includePlayer === true;
  const requests = [];
  const seen = new Set();

  const pushPlan = (plan) => {
    for (const [slot, files] of Object.entries(plan || {})) {
      for (const file of files || []) {
        if (!file) continue;
        const url = `${partRoot}${file}`;
        const key = `${url}::${slot}`;
        if (seen.has(key)) continue;
        seen.add(key);
        requests.push(Object.freeze({ url, slot }));
      }
    }
  };

  for (const entity of entities || []) {
    if (!entity || entity.alive === false) continue;
    if (!includePlayer && (entity.isPlayer === true || (playerId && String(entity.id) === playerId))) continue;
    if (exactSectorId) {
      const data = entity.data || {};
      const entitySectorId = entity.homeSectorId || data.homeSectorId || data.sectorId || null;
      if (String(entitySectorId || '') !== exactSectorId) continue;
    }

    let plan = {};
    if (entity.type === 'ship') {
      let lodLevel = options.lodLevel;
      if (!lodLevel && options.playerPos && entity.pos && entity.isPlayer !== true) {
        const dx = Number(entity.pos.x) - Number(options.playerPos.x);
        const dz = Number(entity.pos.z) - Number(options.playerPos.z);
        const dist = Math.hypot(dx, dz);
        const radius = Number(entity.radius) || 8;
        const px = (radius / Math.max(dist, 0.001)) * (Number(options.viewportHeight) || 800);
        lodLevel = selectSpawnLodLevel(px);
      }
      plan = authoredPreloadPlanForEntity(entity, {
        ...options,
        lodLevel,
        requiredWholeShip: options.requiredWholeShip === true
          || requiresProductionWholeShipForEntity(entity),
      });
    } else if (hasExplicitAuthoredPayloadPresentation(entity)) {
      plan = { pod: [AUTHORED_CARGO_CAPSULE_FILE] };
    } else {
      const placeFile = placeFileForEntity(entity);
      if (placeFile) plan = { place: [placeFile] };
    }
    pushPlan(plan);
  }

  // Always retain combat/traffic archetype GLBs for the sector so mid-fight spawns can admit
  // without a cold decode hitch (composition still uses the prepared/defer path).
  if (options.includeSpawnableArchetypes !== false) {
    pushPlan({ hull: [...spawnableShipArchetypePrewarmUrls()] });
  }

  requests.sort((a, b) => a.url.localeCompare(b.url) || a.slot.localeCompare(b.slot));
  return Object.freeze(requests);
}

function contractRecords(slot) {
  let records = contractRecordsBySlot.get(slot);
  if (!records) {
    records = Object.freeze((PART_LIBRARY_CONTRACT.slots[slot] || [])
      .map((url) => Object.freeze({ url })));
    contractRecordsBySlot.set(slot, records);
  }
  return records;
}

function seededContractFile(slot, seed) {
  const files = PART_LIBRARY_CONTRACT.slots[slot] || [];
  return files.length ? files[((seed ^ hashString(slot)) >>> 0) % files.length] : null;
}

function addPlanFiles(plan, slot, files) {
  const exact = [...new Set((files || []).filter(Boolean))];
  if (exact.length) plan[slot] = exact;
}

export function isAuthoredPartLibraryUsable(library) {
  if (!(library instanceof Map)) return false;
  return libraryHasPreloadPlan(library, AUTHORED_BOOTSTRAP_PLAN);
}

// Deterministic ship-definition → hull-class selection. The hull is the silhouette-defining slot,
// so it must match the ship's authored role rather than being chosen by the generic seed-based hash.
// Each hull file is keyed to the ship defId (src/data/ships.js) whose role it was modelled for; ships
// outside this map fall back to the seed-based pick across all seven hulls. Roles follow the genius's
// authoring pass: starter/multirole→starter, fighter→fighter, mining/mining_barge→miner,
// freighter/heavy_hauler→freighter, interceptor/explorer→interceptor, corvette→corvette,
// gunship/battlecruiser/flagship→gunship. New ladder hulls override the older broad buckets where
// the authored library now has role-specific silhouettes.
const ENGINE_FILE_BY_DEF_ID = Object.freeze({
  ship_kestrel: 'engines/engine_ion_small.glb',
  ship_drifter: 'engines/engine_ion_small.glb',
  ship_ranger: 'engines/engine_ion_small.glb',
  ship_pelican: 'engines/engine_ion_twin.glb',
  ship_ironback: 'engines/engine_ion_twin.glb',
  ship_wasp: 'engines/engine_vector.glb',
  ship_hornet: 'engines/engine_vector.glb',
  ship_mule: 'engines/engine_industrial.glb',
  ship_atlas: 'engines/engine_industrial.glb',
  ship_bastion: 'engines/engine_plasma_ring.glb',
  ship_warden: 'engines/engine_plasma_ring.glb',
  ship_colossus: 'engines/engine_plasma_ring.glb',
  ship_leviathan: 'engines/engine_plasma_ring.glb',
});

const ENGINE_FILE_BY_DRIVE_ID = Object.freeze({
  drive_reaction_s: 'engines/engine_vector.glb',
  drive_reaction_m: 'engines/engine_ion_small.glb',
  drive_reaction_l: 'engines/engine_ion_twin.glb',
  drive_gravimetric_s: 'engines/engine_resonator.glb',
  drive_pulse_plate_m: 'engines/engine_vector.glb',
  drive_torch_l: 'engines/engine_plasma_ring.glb',
  drive_field_sail_m: 'engines/engine_resonator.glb',
});

const HULL_FILE_BY_DEF_ID = Object.freeze({
  ship_kestrel: 'hulls/hull_starter.glb',
  ship_drifter: 'hulls/hull_multirole.glb',
  ship_wasp: 'hulls/hull_fighter.glb',
  ship_pelican: 'hulls/hull_miner.glb',
  ship_ironback: 'hulls/hull_miner.glb',
  ship_mule: 'hulls/hull_freighter.glb',
  ship_atlas: 'hulls/hull_freighter.glb',
  ship_hornet: 'hulls/hull_interceptor.glb',
  ship_ranger: 'hulls/hull_multirole.glb',
  ship_bastion: 'hulls/hull_corvette.glb',
  ship_warden: 'hulls/hull_frigate.glb',
  ship_colossus: 'hulls/hull_capital.glb',
  ship_leviathan: 'hulls/hull_capital.glb',
});

// Only production-validated complete bodies belong here. Accessory-only exports remain unwired so a
// bad whole-ship file can never blank the live ship or silently replace a readable modular hull.
const WHOLE_SHIP_FILE_BY_DEF_ID = Object.freeze({
  'ship_kestrel': 'wholeships/kestrel.glb',
  'ship_wasp': 'wholeships/wasp_production_v1.glb',
  'ship_pelican': 'wholeships/pelican_production_v1.glb',
  'ship_mule': 'wholeships/mule_production_v1.glb',
  'ship_drifter': 'wholeships/drifter_production_v1.glb',
  'ship_hornet': 'wholeships/hornet_production_v1.glb',
  'ship_ironback': 'wholeships/ironback_production_v1.glb',
  'ship_bastion': 'wholeships/bastion_production_v1.glb',
  'ship_atlas': 'wholeships/atlas_production_v1.glb',
  'ship_ranger': 'wholeships/ranger_production_v1.glb',
  'ship_warden': 'wholeships/warden_production_v1.glb',
  'ship_colossus': 'wholeships/colossus_production_v1.glb',
  'ship_leviathan': 'wholeships/leviathan_production_v1.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_DEF_ID = Object.freeze({
  'ship_kestrel': 'SF_K0_KESTREL_BORROWED_TIME_V4',
  'ship_wasp': 'SF_WASP_PRODUCTION_V1',
  'ship_pelican': 'SF_PELICAN_PRODUCTION_V1',
  'ship_mule': 'SF_MULE_PRODUCTION_V1',
  'ship_drifter': 'SF_DRIFTER_PRODUCTION_V1',
  'ship_hornet': 'SF_HORNET_PRODUCTION_V1',
  'ship_ironback': 'SF_IRONBACK_PRODUCTION_V1',
  'ship_bastion': 'SF_BASTION_PRODUCTION_V1',
  'ship_atlas': 'SF_ATLAS_PRODUCTION_V1',
  'ship_ranger': 'SF_RANGER_PRODUCTION_V1',
  'ship_warden': 'SF_WARDEN_PRODUCTION_V1',
  'ship_colossus': 'SF_COLOSSUS_PRODUCTION_V1',
  'ship_leviathan': 'SF_LEVIATHAN_PRODUCTION_V1',
});
// V4 is authored as three independent GLBs so the runtime can retain only the selected level.
// The current whole-ship seam accepts one file, therefore LOD0 is canonical live truth while the
// lower levels stay explicitly catalogued (and excluded from random modular-hull selection) until
// the separate-file residency selector lands. Do not preload all three: that would triple GPU use.
const WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID = Object.freeze({
  ship_kestrel: Object.freeze({
    lod0: 'wholeships/kestrel.glb',
    lod1: 'wholeships/kestrel_lod1.glb',
    lod2: 'wholeships/kestrel_lod2.glb',
  }),
  ship_wasp: Object.freeze({
    lod0: 'wholeships/wasp_production_v1.glb',
    lod1: 'wholeships/wasp_production_v1_lod1.glb',
    lod2: 'wholeships/wasp_production_v1_lod2.glb',
  }),
  ship_pelican: Object.freeze({
    lod0: 'wholeships/pelican_production_v1.glb',
    lod1: 'wholeships/pelican_production_v1_lod1.glb',
    lod2: 'wholeships/pelican_production_v1_lod2.glb',
  }),
  ship_mule: Object.freeze({
    lod0: 'wholeships/mule_production_v1.glb',
    lod1: 'wholeships/mule_production_v1_lod1.glb',
    lod2: 'wholeships/mule_production_v1_lod2.glb',
  }),
  ship_drifter: Object.freeze({
    lod0: 'wholeships/drifter_production_v1.glb',
    lod1: 'wholeships/drifter_production_v1_lod1.glb',
    lod2: 'wholeships/drifter_production_v1_lod2.glb',
  }),
  ship_hornet: Object.freeze({
    lod0: 'wholeships/hornet_production_v1.glb',
    lod1: 'wholeships/hornet_production_v1_lod1.glb',
    lod2: 'wholeships/hornet_production_v1_lod2.glb',
  }),
  ship_ironback: Object.freeze({
    lod0: 'wholeships/ironback_production_v1.glb',
    lod1: 'wholeships/ironback_production_v1_lod1.glb',
    lod2: 'wholeships/ironback_production_v1_lod2.glb',
  }),
  ship_bastion: Object.freeze({
    lod0: 'wholeships/bastion_production_v1.glb',
    lod1: 'wholeships/bastion_production_v1_lod1.glb',
    lod2: 'wholeships/bastion_production_v1_lod2.glb',
  }),
  ship_atlas: Object.freeze({
    lod0: 'wholeships/atlas_production_v1.glb',
    lod1: 'wholeships/atlas_production_v1_lod1.glb',
    lod2: 'wholeships/atlas_production_v1_lod2.glb',
  }),
  ship_ranger: Object.freeze({
    lod0: 'wholeships/ranger_production_v1.glb',
    lod1: 'wholeships/ranger_production_v1_lod1.glb',
    lod2: 'wholeships/ranger_production_v1_lod2.glb',
  }),
  ship_warden: Object.freeze({
    lod0: 'wholeships/warden_production_v1.glb',
    lod1: 'wholeships/warden_production_v1_lod1.glb',
    lod2: 'wholeships/warden_production_v1_lod2.glb',
  }),
  ship_colossus: Object.freeze({
    lod0: 'wholeships/colossus_production_v1.glb',
    lod1: 'wholeships/colossus_production_v1_lod1.glb',
    lod2: 'wholeships/colossus_production_v1_lod2.glb',
  }),
  ship_leviathan: Object.freeze({
    lod0: 'wholeships/leviathan_production_v1.glb',
    lod1: 'wholeships/leviathan_production_v1_lod1.glb',
    lod2: 'wholeships/leviathan_production_v1_lod2.glb',
  }),
});
// Reach hostiles are selected by their authoritative combat archetype, not by ship def: several
// enemy roles intentionally share player-facing chassis stats while requiring different combat
// silhouettes. This presentation map changes no doctrine, hostility, movement, or damage data.
// Only files that already have a render-package pilot may be requested on the live
// empty-admission path. A remaster sibling that exists on disk but is not packaged
// fails closed and leaves a targeting lock on blank space.
const PACKAGED_LIVE_WHOLE_SHIP_FILES = Object.freeze(new Set([
  'wholeships/kestrel.glb',
  'wholeships/kestrel_lod1.glb',
  'wholeships/kestrel_lod2.glb',
  'wholeships/wasp_production_v1.glb',
  'wholeships/ashline_dart.glb',
  'wholeships/ashline_lode.glb',
  'wholeships/ashline_rig.glb',
  'wholeships/helios_lark.glb',
  'wholeships/helios_cradle.glb',
  'wholeships/helios_span.glb',
  'wholeships/ore_barge.glb',
  'wholeships/repair_tender.glb',
  'wholeships/salvage_cutter.glb',
  'wholeships/survey_pin.glb',
]));

export function isPackagedLiveWholeShipFile(file) {
  const token = String(file || '').replace(/\\/g, '/');
  const marker = '/wholeships/';
  const idx = token.lastIndexOf(marker);
  const relative = idx >= 0 ? token.slice(idx + 1) : token;
  return PACKAGED_LIVE_WHOLE_SHIP_FILES.has(relative);
}

function packagedLiveWholeShipFile(file) {
  const token = String(file || '').replace(/\\/g, '/');
  const marker = '/wholeships/';
  const idx = token.lastIndexOf(marker);
  const relative = idx >= 0 ? token.slice(idx + 1) : token;
  return PACKAGED_LIVE_WHOLE_SHIP_FILES.has(relative) ? relative : null;
}

const WHOLE_SHIP_FILE_BY_HOSTILE_ID = Object.freeze({
  wasp_swarmer: 'wholeships/ashline_dart.glb',
  choir_zealot: 'wholeships/ashline_dart.glb',
  lancer_sniper: 'wholeships/wasp_production_v1.glb',
  quiet_ghost: 'wholeships/wasp_production_v1.glb',
  bruiser_brawler: 'wholeships/ashline_lode.glb',
  pd_screen_escort: 'wholeships/ashline_lode.glb',
  field_anchor_controller: 'wholeships/ashline_lode.glb',
  reaver_pirate: 'wholeships/ashline_rig.glb',
  mine_layer_jackal: 'wholeships/ashline_rig.glb',
  corsair_raider: 'wholeships/ashline_rig.glb',
  tether_control_raider: 'wholeships/ashline_rig.glb',
  mule_trader: 'wholeships/helios_span.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID = Object.freeze({
  wasp_swarmer: 'SF_WHOLESHIP_ASHLINE_DART',
  choir_zealot: 'SF_WHOLESHIP_ASHLINE_DART',
  lancer_sniper: 'SF_WASP_PRODUCTION_V1',
  quiet_ghost: 'SF_WASP_PRODUCTION_V1',
  bruiser_brawler: 'SF_WHOLESHIP_ASHLINE_LODE',
  pd_screen_escort: 'SF_WHOLESHIP_ASHLINE_LODE',
  field_anchor_controller: 'SF_WHOLESHIP_ASHLINE_LODE',
  reaver_pirate: 'SF_WHOLESHIP_ASHLINE_RIG',
  mine_layer_jackal: 'SF_WHOLESHIP_ASHLINE_RIG',
  corsair_raider: 'SF_WHOLESHIP_ASHLINE_RIG',
  tether_control_raider: 'SF_WHOLESHIP_ASHLINE_RIG',
  mule_trader: 'SF_WHOLESHIP_HELIOS_SPAN',
});
const WHOLE_SHIP_FILE_BY_SILHOUETTE = Object.freeze({
  drone_swarm: 'wholeships/ashline_dart.glb',
  sniper_lance: 'wholeships/wasp_production_v1.glb',
  bruiser_armor: 'wholeships/ashline_lode.glb',
  pirate_swoop: 'wholeships/ashline_rig.glb',
  corsair_blade: 'wholeships/ashline_rig.glb',
  trader_haul: 'wholeships/helios_span.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE = Object.freeze({
  drone_swarm: 'SF_WHOLESHIP_ASHLINE_DART',
  sniper_lance: 'SF_WASP_PRODUCTION_V1',
  bruiser_armor: 'SF_WHOLESHIP_ASHLINE_LODE',
  pirate_swoop: 'SF_WHOLESHIP_ASHLINE_RIG',
  corsair_blade: 'SF_WHOLESHIP_ASHLINE_RIG',
  trader_haul: 'SF_WHOLESHIP_HELIOS_SPAN',
});
const WHOLE_SHIP_FILE_BY_ASSET_REF = Object.freeze({
  enemy_reaver_interceptor: 'wholeships/ashline_rig.glb',
  enemy_reaver_skirmisher: 'wholeships/ashline_rig.glb',
  enemy_reaver_tug: 'wholeships/ashline_rig.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_ASSET_REF = Object.freeze({
  enemy_reaver_interceptor: 'SF_WHOLESHIP_ASHLINE_RIG',
  enemy_reaver_skirmisher: 'SF_WHOLESHIP_ASHLINE_RIG',
  enemy_reaver_tug: 'SF_WHOLESHIP_ASHLINE_RIG',
});
// Ambient civilian traffic owns a durable presentation role independent of ship-def gameplay
// stats. This keeps role silhouettes stable across rematerialization and prevents courier traffic
// (`ship_kestrel`) from ever replacing the player's K0 whole-ship body.
//
// PQ-045 npc-identity work fleet (`assets/ships/npc_work_fleet/`): four occupational families
// re-authored from the npc_activity_pack donor silhouettes so the working trades stop sharing
// one modular hull. The ore barge is deliberately NOT `hauler` — that key is the accepted
// helios_span, and a barge row under it would replace an accepted live asset in every sector.
// `ore_carrier` is its own presentationRole with its own TRAFFIC_ROLES entry; job eligibility
// gates on the separate `slot.jobKind`, never on presentationRole, so Ceres freight slots keep
// their hauler jobs intact.
const WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE = Object.freeze({
  // Traffic bodies point at the declared, packaged wholeship releases. The remaster rewired these
  // roles to *_production_v1 re-releases that were never declared in release_manifest.json nor
  // given render packages or embedded asset identity, so assetLoader failed closed on every load
  // and courier/hauler/surveyor/miner/ore_carrier/tender/salvor traffic rendered as invisible
  // zero-draw boundaries. Re-point each role here once its production body completes the release
  // pipeline (parts_manifest row + sg04 release build + pilot package).
  courier: 'wholeships/helios_lark.glb',
  miner: 'wholeships/helios_cradle.glb',
  hauler: 'wholeships/helios_span.glb',
  ore_carrier: 'wholeships/ore_barge.glb',
  tender: 'wholeships/repair_tender.glb',
  salvor: 'wholeships/salvage_cutter.glb',
  surveyor: 'wholeships/survey_pin.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE = Object.freeze({
  // Must match the asset identity embedded in each packaged traffic body above; the record
  // resolver rejects a whole-ship load whose assetId differs from the selected role identity.
  // Verified against asset.extras.spacefaceAsset.assetId in each release GLB.
  courier: 'SF_WHOLESHIP_HELIOS_LARK',
  miner: 'SF_WHOLESHIP_HELIOS_CRADLE',
  hauler: 'SF_WHOLESHIP_HELIOS_SPAN',
  ore_carrier: 'SF_WHOLESHIP_ORE_BARGE',
  tender: 'SF_WHOLESHIP_REPAIR_TENDER',
  salvor: 'SF_WHOLESHIP_SALVAGE_CUTTER',
  surveyor: 'SF_WHOLESHIP_SURVEY_PIN',
});
const WHOLE_SHIP_URLS = Object.freeze([
  ...Object.values(WHOLE_SHIP_FILE_BY_DEF_ID),
  ...Object.values(WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID).flatMap((family) => Object.values(family)),
  ...Object.values(WHOLE_SHIP_FILE_BY_HOSTILE_ID),
  ...Object.values(WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE),
]);
const isWholeShipUrl = (url) => WHOLE_SHIP_URLS.some((w) => String(url || '').endsWith(w));
const PRECOMPILE_SHIP_ARCHETYPES = Object.freeze(Object.keys(HULL_FILE_BY_DEF_ID).map((defId) => Object.freeze({
  defId,
  hullFile: HULL_FILE_BY_DEF_ID[defId],
  wholeShipFile: WHOLE_SHIP_FILE_BY_DEF_ID[defId] || null,
})));

export function shipArchetypeKeyForDefId(defId, silhouette = '') {
  const id = defId || 'ship_kestrel';
  const hull = HULL_FILE_BY_DEF_ID[id] || `def:${id}`;
  const whole = WHOLE_SHIP_FILE_BY_DEF_ID[id] || '';
  return [id, hull, whole, silhouette || 'base'].join('|');
}

export function shipArchetypesForPrecompile() {
  return PRECOMPILE_SHIP_ARCHETYPES;
}

function wholeShipSelection(file, assetId, roleId, lodFamily = null) {
  return Object.freeze({
    file,
    assetId,
    roleId,
    required: true,
    ...(lodFamily ? { lodFamily } : {}),
  });
}

/** Pure presentation selection hook used by composition and focused asset checks. */
export function wholeShipVisualForEntity(entity, options = {}) {
  const data = entity && entity.data || {};
  const hostileId = String(data.lootTableId || '');
  const hostileFile = WHOLE_SHIP_FILE_BY_HOSTILE_ID[hostileId];
  if (hostileFile) {
    return wholeShipSelection(hostileFile, WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID[hostileId], hostileId);
  }
  const silhouette = String(data.silhouette || '');
  const silhouetteFile = WHOLE_SHIP_FILE_BY_SILHOUETTE[silhouette];
  if (silhouetteFile) {
    return wholeShipSelection(
      silhouetteFile,
      WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE[silhouette],
      silhouette,
    );
  }
  const assetRef = String(data.assetRef || '');
  const assetRefFile = WHOLE_SHIP_FILE_BY_ASSET_REF[assetRef];
  if (assetRefFile) {
    return wholeShipSelection(
      assetRefFile,
      WHOLE_SHIP_ASSET_ID_BY_ASSET_REF[assetRef],
      assetRef,
    );
  }
  const trafficRole = String(data.trafficRole || '');
  const trafficFile = WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE[trafficRole];
  if (trafficFile) {
    return wholeShipSelection(
      trafficFile,
      WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE[trafficRole],
      trafficRole,
    );
  }
  if (options.requiredWholeShip !== true) return null;
  const defId = data.defId;
  const file = WHOLE_SHIP_FILE_BY_DEF_ID[defId];
  return file ? wholeShipSelection(
    file,
    WHOLE_SHIP_ASSET_ID_BY_DEF_ID[defId],
    defId,
    WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID[defId] || null,
  ) : null;
}

/** LOD0 stays the cold-start admit file. Unpackaged remaster siblings never leave the live path. */
export function wholeShipLodFileForEntity(entity, level, options = {}) {
  const selection = wholeShipVisualForEntity(entity, { ...options, requiredWholeShip: true });
  if (!selection) return null;
  const family = selection.lodFamily;
  const wanted = lodFileFromFamily(family, level, selection.file);
  return packagedLiveWholeShipFile(wanted)
    || packagedLiveWholeShipFile(family && family.lod0)
    || packagedLiveWholeShipFile(selection.file)
    || selection.file;
}

export function authoredPreloadPlanForEntityAtLod(entity, level, options = {}) {
  if (!entity || entity.type !== 'ship') return {};
  const file = wholeShipLodFileForEntity(entity, level, options);
  if (file) return { hull: [file] };
  return authoredPreloadPlanForEntity(entity, options);
}

/** Spawnable combat/traffic presentation keys for sector asset prewarm (not only live entities). */
export function spawnableShipArchetypePrewarmUrls() {
  return Object.freeze([
    ...Object.values(WHOLE_SHIP_FILE_BY_HOSTILE_ID),
    ...Object.values(WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE),
    WHOLE_SHIP_FILE_BY_DEF_ID.ship_wasp,
  ]);
}

/** Pure contract hook used by runtime composition and missing/corrupt fixture checks. */
export function resolveRequiredWholeShipRecord(entity, records, options = {}) {
  const selection = wholeShipVisualForEntity(entity, options);
  if (!selection) return null;
  const wholeShipFile = options.forceWholeShipFile || selection.file;
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  // Forced LOD siblings may not share the LOD0 assetId; match on file path only then.
  const expectedAssetId = options.forceWholeShipFile ? null : selection.assetId;
  const record = (records || []).find((candidate) => (
    String(candidate && candidate.url || '').endsWith(wholeShipFile)
      && (!expectedAssetId || candidate.assetId === expectedAssetId)
  ));
  if (!record) throw new Error(requiredWholeShipMessage(entity, wholeShipFile, records, partRoot));
  return record;
}

/**
 * Wrap a ship admission substrate in the authored-asset boundary. Pending authored assets stay
 * invisible; the renderer requests admission as soon as the stable boundary joins the scene.
 */
export function wrapShipWithAuthoredParts(entity, fallbackRoot, options = {}) {
  if (!fallbackRoot || !fallbackRoot.isObject3D || !entity || entity.type !== 'ship') return fallbackRoot;
  // Pipeline precompile entities are deliberately disposable procedural probes. Wrapping them would
  // turn shader warm-up into authored GLB residency demand for ships that may never enter the world.
  if (entity.data && entity.data.precompileProbe === true) return fallbackRoot;
  const releaseMode = isReleaseAssetMode(options);
  setPresentationAdmission(entity, PRESENTATION_ADMISSION.pending);

  const boundary = new THREE.Group();
  boundary.name = `${fallbackRoot.name || 'Ship'}_AuthoredAssetBoundary`;
  fallbackRoot.visible = false;
  boundary.add(fallbackRoot);

  // Preserve the public inspection surface used by diagnostics/checks while making lifecycle hooks
  // indirect through `active`, so the renderer never needs to know that a payload was replaced.
  Object.assign(boundary.userData, fallbackRoot.userData || {});
  boundary.userData.kind = 'ship';
  boundary.userData.authoredAssetState = 'awaiting-authored-admission';
  boundary.userData.authoredAssetMode = releaseMode ? 'release' : 'dev';
  boundary.userData.authoredAssetContractVersion = PART_LIBRARY_CONTRACT.version;
  boundary.userData.authoredSlots = {};
  boundary.userData.authoredReadableFallbackRetained = false;
  boundary.userData.authoredVisualRoot = 'none-pending-admission';
  boundary.userData.renderContract = {
    ...((fallbackRoot.userData && fallbackRoot.userData.renderContract) || {}),
    assetBoundary: 'GLTFKit v2 — resolve, prepare, admit',
    gracefulFallback: false,
  };

  let active = fallbackRoot;
  boundary.userData.updateDamageState = (liveEntity, now) => {
    const fn = active && active.userData && active.userData.updateDamageState;
    if (typeof fn === 'function') fn(liveEntity, now);
    if (active && active.userData) {
      boundary.userData.damageState = active.userData.damageState;
      boundary.userData.hullFrac = active.userData.hullFrac;
    }
  };
  boundary.userData.updateLod = (level) => {
    const fn = active && active.userData && active.userData.updateLod;
    if (typeof fn === 'function') fn(level);
  };
  syncActiveSurface(boundary, active);

  const trigger = firstRenderable(fallbackRoot);
  const previousBeforeRender = trigger && trigger.onBeforeRender;
  let armed = true;
  const startAuthoredUpgrade = (renderer, scene, requestOptions = {}) => {
    const existing = boundary.userData.authoredUpgradePromise;
    if (existing) return existing;
    if (!armed) return null;
    if (!renderer || !scene) return;
    armed = false;
    if (trigger) trigger.onBeforeRender = previousBeforeRender;
    const upgradeOptions = {
      releaseMode,
      requiredWholeShip: options.requiredWholeShip === true,
      onSwap: options.onSwap,
      loadAuthoredPart: options.loadAuthoredPart,
      libraryScope: options.libraryScope,
      bootstrapPlan: options.bootstrapPlan,
      ...residencyOptionsForBoundary(entity, boundary, renderer),
      ...requestOptions,
    };
    boundary.userData.authoredAssetState = 'loading';
    const completion = enqueueBoundaryUpgrade(scene, {
      boundary,
      fallbackRoot,
      entity,
      renderer,
      scene,
      options: upgradeOptions,
      setActive: (next) => {
        active = next;
        syncActiveSurface(boundary, active);
      },
    });
    boundary.userData.authoredUpgradePromise = completion;
    return completion;
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;
  if (trigger) {
    trigger.onBeforeRender = function authoredAssetTrigger(renderer, scene, ...rest) {
      if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
      if (!shouldAutoTriggerAuthoredUpgrade(entity, scene)) return;
      startAuthoredUpgrade(renderer, scene);
    };
  }

  return boundary;
}

export function buildAuthoredPlaceProp(entity, options = {}) {
  const placeFile = placeFileForEntity(entity);
  if (!placeFile) return null;
  const fallbackRoot = options.fallbackRoot && options.fallbackRoot.isObject3D
    ? options.fallbackRoot
    : buildFallbackPlaceProp(entity, placeFile);
  return wrapPlacePropWithAuthoredPart(entity, fallbackRoot, placeFile, options);
}

/**
 * Exact PQ-019 cargo-pod presentation boundary. The simulation entity remains a `payload`; this
 * wrapper only owns admission of the already-released pod visual and never publishes the generic
 * cylinder while that exact identity is pending or unavailable.
 */
export function buildAuthoredCargoCapsule(entity, options = {}) {
  if (!hasExplicitAuthoredPayloadPresentation(entity)) return null;
  const fallbackRoot = options.fallbackRoot;
  if (!fallbackRoot || !fallbackRoot.isObject3D) return null;

  const releaseMode = isReleaseAssetMode(options);
  setPresentationAdmission(entity, PRESENTATION_ADMISSION.pending);

  const boundary = new THREE.Group();
  boundary.name = `${entity.data.payloadStableId || entity.id || 'cargo_capsule'}_AuthoredPayloadBoundary`;
  fallbackRoot.visible = false;
  boundary.add(fallbackRoot);
  boundary.userData.kind = 'payload';
  boundary.userData.interactionKind = 'payload';
  boundary.userData.authoredPayloadAssetId = AUTHORED_CARGO_CAPSULE_FILE
    .replace(/^pods\//, '')
    .replace(/\.glb$/, '');
  boundary.userData.authoredAssetState = 'awaiting-authored-admission';
  boundary.userData.authoredAssetMode = releaseMode ? 'release' : 'dev';
  boundary.userData.authoredVisualRoot = 'none-pending-admission';
  boundary.userData.authoredParts = [];
  boundary.userData.authoredSlots = {};
  boundary.userData.renderContract = {
    version: 1,
    assetBoundary: 'exact authored PQ-019 cargo capsule',
    gracefulFallback: false,
    coordinateSystem: '+X forward, +Y up, +Z starboard; metres',
  };

  let activeRoot = fallbackRoot;
  const setActiveRoot = (next) => {
    activeRoot = next;
    boundary.userData.hull = next;
    boundary.userData.lod = next?.userData?.lod || null;
  };
  boundary.userData.__setActiveVisualRoot = setActiveRoot;
  boundary.userData.updateLod = (level) => {
    const update = activeRoot?.userData?.updateLod;
    if (typeof update === 'function') update(level);
  };
  boundary.userData.requestAuthoredUpgrade = (renderer, scene, requestOptions = {}) => {
    const existing = boundary.userData.authoredUpgradePromise;
    if (existing) return existing;
    if (!renderer || !scene || authoredAdmissionStarted(boundary.userData.authoredAssetState)) return false;
    boundary.userData.authoredAssetState = 'loading';
    const residency = residencyOptionsForBoundary(entity, boundary, renderer);
    const upgradeOptions = {
      releaseMode,
      loadAuthoredPart: options.loadAuthoredPart,
      ...residency,
      ...requestOptions,
    };
    const partRoot = releaseMode ? PART_RELEASE_ROOT : PART_ROOT;
    const completion = enqueueBoundaryUpgrade(scene, {
      key: `payload:${entity.data.payloadStableId || entity.id}`,
      boundary,
      entity,
      renderer,
      scene,
      assetUrls: [`${partRoot}${AUTHORED_CARGO_CAPSULE_FILE}`],
      options: upgradeOptions,
      run: () => upgradeAuthoredCargoCapsuleBoundary(
        boundary,
        fallbackRoot,
        entity,
        renderer,
        scene,
        upgradeOptions,
        setActiveRoot,
      ),
    });
    boundary.userData.authoredUpgradePromise = completion;
    return completion;
  };

  return boundary;
}

/** Test/probe hook for the same exact payload upgrade used by the live render queue. */
export async function upgradeAuthoredCargoCapsuleBoundaryForProbe(
  boundary,
  fallbackRoot,
  entity,
  renderer,
  scene,
  options = {},
) {
  if (!boundary || !fallbackRoot || !entity || !renderer || !scene) return false;
  const setActiveRoot = typeof boundary.userData.__setActiveVisualRoot === 'function'
    ? boundary.userData.__setActiveVisualRoot
    : (next) => {
        boundary.userData.hull = next;
        boundary.userData.lod = next?.userData?.lod || null;
      };
  boundary.userData.authoredAssetState = 'loading';
  return upgradeAuthoredCargoCapsuleBoundary(
    boundary,
    fallbackRoot,
    entity,
    renderer,
    scene,
    options,
    setActiveRoot,
  );
}

async function upgradeAuthoredCargoCapsuleBoundary(
  boundary,
  fallbackRoot,
  entity,
  renderer,
  scene,
  options,
  setActiveRoot,
) {
  const releaseMode = isReleaseAssetMode(options);
  const partRoot = releaseMode ? PART_RELEASE_ROOT : PART_ROOT;
  const loadPart = typeof options.loadAuthoredPart === 'function'
    ? options.loadAuthoredPart
    : loadAuthoredPart;
  let record = null;
  try {
    record = await loadPart(`${partRoot}${AUTHORED_CARGO_CAPSULE_FILE}`, {
      renderer,
      slot: 'pod',
      optional: true,
      residencyOwner: options.residencyOwner,
      residencyRole: options.residencyRole,
      sectorId: options.sectorId,
      isResidencyOwnerActive: options.isResidencyOwnerActive,
    });
  } catch (error) {
    return failAuthoredCargoCapsuleAdmission(
      boundary,
      fallbackRoot,
      entity,
      renderer,
      'load-threw',
      error,
    );
  }
  if (!record) {
    return failAuthoredCargoCapsuleAdmission(
      boundary,
      fallbackRoot,
      entity,
      renderer,
      'load-unavailable',
    );
  }
  if (!boundary.parent) {
    releaseBoundaryResidency(renderer, boundary, 'payload-orphaned-before-swap');
    boundary.userData.authoredAssetState = 'orphaned-before-swap';
    return false;
  }

  let authored;
  try {
    authored = buildAuthoredCargoCapsuleRoot(entity, record, scene, boundary);
  } catch (error) {
    return failAuthoredCargoCapsuleAdmission(
      boundary,
      fallbackRoot,
      entity,
      renderer,
      'build-threw',
      error,
    );
  }
  registerPreparedAuthoredAdmission(scene, boundary, authored);
  let authoredDisposed = false;
  const disposePreparedCargoCapsule = () => {
    if (authoredDisposed) return false;
    disposeDetachedAuthoredCargoCapsule(authored.root);
    unregisterPreparedAuthoredAdmission(authored);
    authoredDisposed = true;
    return true;
  };
  if (options.deferBoundaryPublication === true) {
    installPreparedBoundaryDisposer(boundary, disposePreparedCargoCapsule);
  }
  boundary.userData.authoredAssetState = 'compiling-pipelines';
  try {
    await prepareAuthoredVisualPipelines(authored.root, options);
  } catch (error) {
    await (disposePreparedAuthoredBoundary(boundary) || disposePreparedCargoCapsule());
    return failAuthoredCargoCapsuleAdmission(
      boundary,
      fallbackRoot,
      entity,
      renderer,
      'pipeline-compile-failed',
      error,
    );
  }
  if (!boundary.parent) {
    await (disposePreparedAuthoredBoundary(boundary) || disposePreparedCargoCapsule());
    releaseBoundaryResidency(renderer, boundary, 'payload-orphaned-after-pipeline-compile');
    boundary.userData.authoredAssetState = 'orphaned-after-pipeline-compile';
    return false;
  }
  const publicationWait = waitForOpeningGraphPublicationRelease();
  if (publicationWait) await publicationWait;
  if (!boundary.parent) {
    await (disposePreparedAuthoredBoundary(boundary) || disposePreparedCargoCapsule());
    releaseBoundaryResidency(renderer, boundary, 'payload-orphaned-before-publication');
    boundary.userData.authoredAssetState = 'orphaned-before-swap';
    return false;
  }
  return commitAuthoredCargoCapsuleBoundary(
    boundary,
    fallbackRoot,
    authored,
    entity,
    setActiveRoot,
    options,
  );
}

function failAuthoredCargoCapsuleAdmission(
  boundary,
  fallbackRoot,
  entity,
  renderer,
  reason,
  error = null,
) {
  releaseBoundaryResidency(renderer, boundary, `payload-${reason}`);
  fallbackRoot.visible = false;
  boundary.userData.authoredAssetState = 'unavailable';
  boundary.userData.authoredVisualRoot = reason.includes('pipeline')
    ? 'none-pipeline-failed'
    : (reason.includes('build') ? 'none-build-failed' : 'none-load-failed');
  boundary.userData.authoredFailureReason = reason;
  if (error?.message) boundary.userData.authoredFailureMessage = error.message;
  setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
  return false;
}

function commitAuthoredCargoCapsuleBoundary(
  boundary,
  fallbackRoot,
  authored,
  entity,
  setActiveRoot,
  options = {},
) {
  boundary.remove(fallbackRoot);
  boundary.add(authored.root);
  unregisterPreparedAuthoredAdmission(authored);
  setActiveRoot(authored.root);
  releaseDetachedCargoCapsuleSubstrate(fallbackRoot);
  boundary.userData.authoredVisualRoot = 'authored-root';
  boundary.userData.authoredParts = authored.authoredParts;
  boundary.userData.authoredSlots = authored.authoredSlots;
  boundary.userData.assetId = authored.root.userData.assetId;
  boundary.userData.renderContract = authored.root.userData.renderContract;
  boundary.userData.__socketCache = new Map();
  delete boundary.userData.requestAuthoredUpgrade;
  delete boundary.userData.__setActiveVisualRoot;
  const publish = () => {
    boundary.userData.authoredAssetState = 'authored';
    setPresentationAdmission(entity, PRESENTATION_ADMISSION.ready);
    return true;
  };
  if (options.deferBoundaryPublication === true) {
    boundary.userData.authoredAssetState = 'authored-prepared';
    installPreparedBoundaryPublisher(boundary, publish);
  } else {
    publish();
  }
  return true;
}

function disposeDetachedAuthoredCargoCapsule(root) {
  if (!root) return;
  // Authored compositions use cloned batch geometry plus materials marked by the shared-resource
  // policy. Reuse the established detached-place disposer so only owner-local GPU resources retire.
  disposeDetachedPlaceFallback(root);
  root.clear();
}

function releaseDetachedCargoCapsuleSubstrate(root) {
  if (!root) return;
  // visualFactory payload geometry/materials are module-level caches shared by ordinary payloads.
  // Sever this one-shot Object3D graph without disposing those shared resources.
  root.clear();
  root.userData.authoredSubstrateReleased = true;
}

function buildAuthoredCargoCapsuleRoot(entity, record, scene, ownerBoundary) {
  const palette = paletteFor(entity);
  const root = new THREE.Group();
  root.name = `GLTFKit_${entity.data.payloadStableId || 'cargo_capsule'}`;
  root.userData.kind = 'payload';
  root.userData.interactionKind = 'payload';
  root.userData.authoredPayloadAssetId = entity.data.authoredPayloadAssetId;
  root.userData.assetId = record.assetId;

  const bindings = createBindings();
  const mutableMaterials = new Map();
  const staticBatches = createStaticBatchCollector(root, bindings);
  const boundsSize = Array.isArray(record.bounds?.size) ? record.bounds.size : [1, 1, 1];
  const authoredEnvelope = Math.max(1e-6, ...boundsSize.map((value) => Number(value) || 0));
  const targetRadius = Math.max(1, Number(entity.radius) || 3);
  const scale = (targetRadius * 2) / authoredEnvelope;
  const authoredLength = Math.max(Number(boundsSize[0]) || authoredEnvelope, 1e-6);
  instantiatePart(record, root, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    targetLength: authoredLength * scale,
    label: 'CargoCapsule',
  }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
  staticBatches.flush();
  reconcileMaplessHullMaterialAliases(palette);
  canonicalizeMaplessHullMaterials(root, palette);
  installAuthoredLod(root, bindings, null, authoredLevels(record), true);
  root.userData.updateLod('lod0');

  const center = Array.isArray(record.bounds?.center) ? record.bounds.center : [0, 0, 0];
  root.position.set(
    -(Number(center[0]) || 0) * scale,
    -(Number(center[1]) || 0) * scale,
    -(Number(center[2]) || 0) * scale,
  );
  root.userData.authoredWorldScale = scale;
  root.userData.collisionEnvelopeRadius = targetRadius;
  root.userData.visualBounds = {
    center: center.map((value) => (Number(value) || 0) * scale),
    size: boundsSize.map((value) => (Number(value) || 0) * scale),
  };
  root.userData.renderContract = {
    version: 1,
    coordinateSystem: '+X forward, +Y up, +Z starboard; authored payload centered on physics origin',
    authoredParts: [record.url],
    authoredSlots: { pod: [record.url] },
    collisionEnvelope: 'longest authored axis equals payload diameter',
    gracefulFallback: false,
  };
  return {
    root,
    authoredParts: [record.url],
    authoredSlots: { pod: [record.url] },
  };
}

export function buildAuthoredStationArchetype(entity, options = {}) {
  const placeFile = placeFileForEntity(entity);
  if (!placeFile || !entity || entity.type !== 'station') return null;
  const placeId = placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  const loadEntity = {
    ...entity,
    data: {
      ...(entity.data || {}),
      placeId,
      placeTargetRadius: stationArchetypeTargetRadius(entity),
    },
  };
  const fallbackRoot = buildFallbackStationArchetype(loadEntity, placeFile);
  return wrapStationArchetypeWithAuthoredPart(loadEntity, fallbackRoot, placeFile, {
    ...options,
    liveEntity: entity,
  });
}

export function resolvePlaceFileForEntity(entity) {
  return placeFileForEntity(entity);
}

/** Test/probe hook: run the same async GLB swap used at runtime for place/station boundaries. */
export async function upgradeAuthoredPlaceBoundaryForProbe(boundary, fallbackRoot, entity, placeFile, renderer, scene, options = {}) {
  if (!boundary || !fallbackRoot || !entity || !placeFile || !renderer || !scene) return false;
  const placementEntity = boundary.userData && Number.isFinite(Number(boundary.userData.placeTargetRadius))
    ? {
        ...entity,
        data: {
          ...(entity.data || {}),
          placeTargetRadius: Number(boundary.userData.placeTargetRadius),
        },
      }
    : entity;
  const publishActive = typeof boundary.userData.__setActiveVisualRoot === 'function'
    ? boundary.userData.__setActiveVisualRoot
    : (next) => { boundary.userData.hull = next; };
  return upgradePlaceBoundary(boundary, fallbackRoot, placementEntity, placeFile, renderer, scene, {
    ...options,
    admissionEntity: entity,
  }, (next) => {
    publishActive(next);
  });
}

export const STATION_ARCHETYPE_PLACE_IDS = Object.freeze(
  STATION_ARCHETYPE_FILES.map((file) => file.replace(/^places\//, '').replace(/\.glb$/, '')),
);

function stationArchetypeTargetRadius(entity) {
  const data = entity && entity.data || {};
  const raw = Number(data.placeTargetRadius);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return stationVisualRadius(entity);
}

function stationVisualRadius(entity) {
  const data = entity && entity.data || {};
  for (const value of [data.visualRadius, data.dockRadius, data.stationRadius, entity && entity.radius]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.max(40, n);
  }
  return 72;
}

function buildFallbackStationArchetype(entity, placeFile) {
  const data = entity && entity.data || {};
  const placeId = data.placeId || placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  const radius = stationVisualRadius(entity);
  const group = new THREE.Group();
  group.name = `SF_StationArchetypeFallback_${placeId}`;
  group.userData.kind = 'station';
  group.userData.placeId = placeId;
  group.userData.archetypeGlb = data.archetypeGlb || placeId;
  group.userData.visualRadius = radius;
  group.userData.renderContract = {
    assetBoundary: 'GLTFKit v1 — station archetype procedural fallback',
    gracefulFallback: true,
  };
  const color = fallbackPlaceColor(placeId, data.paletteClass);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: 0.35,
    emissive: new THREE.Color(color).multiplyScalar(0.18),
    emissiveIntensity: 0.2,
  });
  const core = new THREE.Mesh(getFallbackStationCoreGeometry(), material);
  core.name = `SF_StationArchetypeFallback_${placeId}_Core`;
  core.scale.set(radius * 0.75, radius * 0.55, radius * 0.75);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(getFallbackStationRingGeometry(), material);
  ring.name = `SF_StationArchetypeFallback_${placeId}_Ring`;
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(radius);
  ring.castShadow = true;
  ring.receiveShadow = true;
  group.add(ring);

  for (let i = 0; i < 4; i++) {
    const spar = new THREE.Mesh(getFallbackStationSparGeometry(), material);
    const a = i * Math.PI / 2;
    spar.name = `SF_StationArchetypeFallback_${placeId}_DockSpar_${i}`;
    spar.position.set(Math.cos(a) * radius * 0.45, 0, Math.sin(a) * radius * 0.45);
    spar.rotation.y = -a;
    spar.scale.set(radius, radius, radius);
    spar.castShadow = true;
    spar.receiveShadow = true;
    group.add(spar);
  }
  return group;
}

function wrapStationArchetypeWithAuthoredPart(entity, fallbackRoot, placeFile, options = {}) {
  if (!fallbackRoot || !fallbackRoot.isObject3D || !entity || entity.type !== 'station' || !placeFile) return fallbackRoot;
  const releaseMode = isReleaseAssetMode(options);
  setPresentationAdmission(options.liveEntity || entity, PRESENTATION_ADMISSION.pending);
  const placeId = placeFile.replace(/^places\//, '').replace(/\.glb$/, '');

  const boundary = new THREE.Group();
  boundary.name = `${fallbackRoot.name || 'StationArchetype'}_AuthoredAssetBoundary`;
  fallbackRoot.visible = false;
  boundary.add(fallbackRoot);
  Object.assign(boundary.userData, fallbackRoot.userData || {});
  boundary.userData.kind = 'station';
  boundary.userData.placeId = placeId;
  boundary.userData.archetypeGlb = entity.data && entity.data.archetypeGlb || placeId;
  boundary.userData.placeTargetRadius = Number(entity.data && entity.data.placeTargetRadius) || null;
  boundary.userData.authoredAssetState = 'awaiting-authored-admission';
  boundary.userData.authoredAssetMode = releaseMode ? 'release' : 'dev';
  boundary.userData.authoredAssetContractVersion = PART_LIBRARY_CONTRACT.version;
  boundary.userData.authoredSlots = {};
  boundary.userData.authoredReadableFallbackRetained = false;
  boundary.userData.authoredVisualRoot = 'none-pending-admission';
  boundary.userData.renderContract = {
    ...((fallbackRoot.userData && fallbackRoot.userData.renderContract) || {}),
    assetBoundary: 'GLTFKit v1 — authored station archetype',
    gracefulFallback: false,
  };

  let activeRoot = fallbackRoot;
  const setActiveVisualRoot = (next) => {
    if (!next || !next.isObject3D) return;
    activeRoot = next;
    boundary.userData.hull = next;
    const level = boundary.userData.lod && boundary.userData.lod.level || 'lod0';
    if (typeof next.userData?.updateLod === 'function') next.userData.updateLod(level);
  };
  boundary.userData.hull = fallbackRoot;
  boundary.userData.__setActiveVisualRoot = setActiveVisualRoot;
  boundary.userData.updateLod = (level) => {
    if (typeof activeRoot?.userData?.updateLod === 'function') activeRoot.userData.updateLod(level);
  };
  const trigger = firstRenderable(fallbackRoot);
  const startAuthoredUpgrade = (renderer, scene, requestOptions = {}) => {
    const existing = boundary.userData.authoredUpgradePromise;
    if (existing) return existing;
    if (!renderer || !scene || authoredAdmissionStarted(boundary.userData.authoredAssetState)) return null;
    boundary.userData.authoredAssetState = 'loading';
    const residency = residencyOptionsForBoundary(options.liveEntity || entity, boundary, renderer);
    const upgradeOptions = {
      releaseMode,
      loadAuthoredPart: options.loadAuthoredPart,
      admissionEntity: options.liveEntity || entity,
      ...residency,
      ...requestOptions,
    };
    const completion = enqueueBoundaryUpgrade(scene, {
      boundary,
      entity: options.liveEntity || entity,
      run: () => upgradePlaceBoundary(
        boundary, fallbackRoot, entity, placeFile, renderer, scene, upgradeOptions, setActiveVisualRoot,
      ),
      renderer,
      options: upgradeOptions,
    });
    boundary.userData.authoredUpgradePromise = completion;
    return completion;
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;

  if (trigger) {
    let armed = true;
    const previousBeforeRender = trigger.onBeforeRender;
    trigger.onBeforeRender = function authoredStationTrigger(renderer, scene, ...rest) {
      if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
      if (!armed) return;
      if (!shouldAutoTriggerAuthoredUpgrade(options.liveEntity || entity, scene)) return;
      armed = false;
      trigger.onBeforeRender = previousBeforeRender;
      startAuthoredUpgrade(renderer, scene);
    };
  }

  const stationed = attachStationHlod(boundary, entity);
  optimizeStaticBatchesForRoot(stationed);
  freezeStaticChildMatrices(stationed);
  return stationed;
}

function wrapPlacePropWithAuthoredPart(entity, fallbackRoot, placeFile, options = {}) {
  const geologySkin = hasExplicitAuthoredGeologyPresentation(entity);
  if (!fallbackRoot || !fallbackRoot.isObject3D || !entity
      || (entity.type !== 'fx' && !geologySkin) || !placeFile) return fallbackRoot;
  const releaseMode = isReleaseAssetMode(options);
  setPresentationAdmission(entity, PRESENTATION_ADMISSION.pending);

  const boundary = new THREE.Group();
  boundary.name = `${fallbackRoot.name || 'PlaceProp'}_AuthoredAssetBoundary`;
  fallbackRoot.visible = false;
  boundary.add(fallbackRoot);
  Object.assign(boundary.userData, fallbackRoot.userData || {});
  // The matching procedural geology body stays as a hidden, local emergency fallback. Never expose
  // its common-rock leaf through the stable boundary: the renderer's asteroid InstancedMesh pool
  // would otherwise submit that hidden leaf during admission and retain a detached ghost after the
  // authored commit. One representative authored rock per field deliberately keeps this fallback
  // local so the boundary has exactly one presentation authority at every lifecycle stage.
  if (geologySkin) delete boundary.userData.asteroidInstanceBody;
  boundary.userData.kind = 'place';
  boundary.userData.placeId = entity.data && entity.data.placeId || placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  boundary.userData.placeTargetRadius = geologySkin ? entity.radius : null;
  boundary.userData.authoredGeologySkin = geologySkin;
  boundary.userData.authoredAssetState = 'awaiting-authored-admission';
  boundary.userData.authoredAssetMode = releaseMode ? 'release' : 'dev';
  boundary.userData.authoredAssetContractVersion = PART_LIBRARY_CONTRACT.version;
  boundary.userData.authoredSlots = {};
  boundary.userData.authoredReadableFallbackRetained = false;
  boundary.userData.authoredVisualRoot = 'none-pending-admission';
  boundary.userData.renderContract = {
    ...((fallbackRoot.userData && fallbackRoot.userData.renderContract) || {}),
    assetBoundary: 'GLTFKit v1 — authored world-place prop',
    gracefulFallback: false,
  };

  attachLodState(boundary);
  let activeRoot = fallbackRoot;
  const setActiveVisualRoot = (next) => {
    if (!next || !next.isObject3D) return;
    activeRoot = next;
    boundary.userData.hull = next;
    const level = boundary.userData.lod && boundary.userData.lod.level || 'lod0';
    if (typeof next.userData?.updateLod === 'function') next.userData.updateLod(level);
  };
  boundary.userData.hull = fallbackRoot;
  boundary.userData.__setActiveVisualRoot = setActiveVisualRoot;
  boundary.userData.updateLod = (level) => {
    if (typeof activeRoot?.userData?.updateLod === 'function') activeRoot.userData.updateLod(level);
  };
  boundary.userData.updateWorldSitePresentation = (liveEntity, simTime, a11y) => {
    const controller = activeRoot && activeRoot.userData && activeRoot.userData.worldSitePresentationController;
    if (controller && typeof controller.update === 'function') controller.update(liveEntity, simTime, a11y);
  };
  const trigger = firstRenderable(fallbackRoot);
  const startAuthoredUpgrade = (renderer, scene, requestOptions = {}) => {
    const existing = boundary.userData.authoredUpgradePromise;
    if (existing) return existing;
    if (!renderer || !scene || authoredAdmissionStarted(boundary.userData.authoredAssetState)) return null;
    boundary.userData.authoredAssetState = 'loading';
    const upgradeOptions = {
      releaseMode,
      loadAuthoredPart: options.loadAuthoredPart,
      ...residencyOptionsForBoundary(entity, boundary, renderer),
      ...requestOptions,
    };
    const completion = enqueueBoundaryUpgrade(scene, {
      boundary,
      entity,
      run: () => upgradePlaceBoundary(
        boundary, fallbackRoot, entity, placeFile, renderer, scene, upgradeOptions, setActiveVisualRoot,
      ),
      renderer,
      options: upgradeOptions,
    });
    boundary.userData.authoredUpgradePromise = completion;
    return completion;
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;

  if (trigger) {
    let armed = true;
    const previousBeforeRender = trigger.onBeforeRender;
    trigger.onBeforeRender = function authoredPlaceTrigger(renderer, scene, ...rest) {
      if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
      if (!armed) return;
      if (!shouldAutoTriggerAuthoredUpgrade(entity, scene)) return;
      armed = false;
      trigger.onBeforeRender = previousBeforeRender;
      startAuthoredUpgrade(renderer, scene);
    };
  }

  const placed = attachPlaceHlod(boundary, entity);
  optimizeStaticBatchesForRoot(placed);
  freezeStaticChildMatrices(placed);
  return placed;
}

function authoredAdmissionStarted(state) {
  return state === 'loading'
    || state === 'compiling-pipelines'
    || state === 'authored-prepared'
    || state === 'same-semantic-fallback-prepared'
    || state === 'authored'
    || state === 'authored-with-cleanup-error'
    || state === 'same-semantic-fallback';
}

async function upgradePlaceBoundary(boundary, fallbackRoot, entity, placeFile, renderer, scene, options, setActive) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const loadPart = options && typeof options.loadAuthoredPart === 'function'
    ? options.loadAuthoredPart
    : loadAuthoredPart;
  let record = null;
  try {
    record = await loadPart(`${partRoot}${placeFile}`, {
      renderer,
      slot: 'place',
      optional: true,
      residencyOwner: options.residencyOwner,
      residencyRole: options.residencyRole,
      sectorId: options.sectorId,
      isResidencyOwnerActive: options.isResidencyOwnerActive,
    });
  } catch (error) {
    handoffBootstrapIfCovered(renderer);
    if (!boundary.parent) {
      releaseBoundaryResidency(renderer, boundary, 'place-orphaned-after-load-error');
      boundary.userData.authoredAssetState = 'orphaned-before-swap';
      return false;
    }
    return failAuthoredPlaceAdmission(
      boundary, fallbackRoot, entity, renderer, options, setActive,
      'place-load-threw', error,
    );
  }
  handoffBootstrapIfCovered(renderer);
  if (!record || !boundary.parent) {
    releaseBoundaryResidency(renderer, boundary, record ? 'place-orphaned-before-swap' : 'place-unavailable');
    boundary.userData.authoredAssetState = record ? 'orphaned-before-swap' : 'unavailable';
    if (!record) {
      return failAuthoredPlaceAdmission(
        boundary, fallbackRoot, entity, renderer, options, setActive,
        'place-load-unavailable', null, { residencyReleased: true },
      );
    }
    return false;
  }

  let authored = null;
  try {
    authored = buildPlacePropRoot(entity, record, scene, boundary);
  } catch (error) {
    return failAuthoredPlaceAdmission(
      boundary, fallbackRoot, entity, renderer, options, setActive,
      'place-build-threw', error,
    );
  }
  if (!authored || !boundary.parent) {
    if (!boundary.parent) {
      releaseBoundaryResidency(renderer, boundary, 'place-swap-not-committed');
      return false;
    }
    return failAuthoredPlaceAdmission(
      boundary, fallbackRoot, entity, renderer, options, setActive,
      'place-build-unavailable', null,
    );
  }

  registerPreparedAuthoredAdmission(scene, boundary, authored);
  let authoredDisposed = false;
  const disposePreparedPlace = () => {
    if (authoredDisposed) return false;
    disposeDetachedPlaceFallback(authored.root);
    authored.root.clear();
    unregisterPreparedAuthoredAdmission(authored);
    authoredDisposed = true;
    return true;
  };
  if (options.deferBoundaryPublication === true) {
    installPreparedBoundaryDisposer(boundary, disposePreparedPlace);
  }

  boundary.userData.authoredAssetState = 'compiling-pipelines';
  const completeAdmission = async () => {
    try {
      await prepareAuthoredVisualPipelines(authored.root, options);
    } catch (error) {
      try {
        await (disposePreparedAuthoredBoundary(boundary) || disposePreparedPlace());
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Prepared authored place cleanup failed after pipeline admission failure',
          { cause: error },
        );
      }
      return failAuthoredPlaceAdmission(
        boundary, fallbackRoot, entity, renderer, options, setActive,
        'place-pipeline-compile-failed', error,
      );
    }
    if (!boundary.parent) {
      await (disposePreparedAuthoredBoundary(boundary) || disposePreparedPlace());
      releaseBoundaryResidency(renderer, boundary, 'place-orphaned-after-pipeline-compile');
      return false;
    }
    const publicationWait = waitForOpeningGraphPublicationRelease();
    if (publicationWait) await publicationWait;
    if (!boundary.parent) {
      await (disposePreparedAuthoredBoundary(boundary) || disposePreparedPlace());
      releaseBoundaryResidency(renderer, boundary, 'place-orphaned-before-publication');
      return false;
    }
    return commitAuthoredPlaceBoundary(
      boundary,
      fallbackRoot,
      authored,
      setActive,
      options.admissionEntity || entity,
      options,
    );
  };
  if (options.overlapAuthoredPipelineCompile === true) {
    const pending = completeAdmission();
    boundary.userData.authoredPipelineReady = pending;
    const onAuthoredPipelineStaged = options.onAuthoredPipelineStaged;
    if (typeof onAuthoredPipelineStaged === 'function') {
      delete options.onAuthoredPipelineStaged;
      onAuthoredPipelineStaged();
    }
    return pending;
  }
  return completeAdmission();
}

function failAuthoredPlaceAdmission(
  boundary, fallbackRoot, entity, renderer, options, setActive, reason, error, flags = {},
) {
  if (!flags.residencyReleased) releaseBoundaryResidency(renderer, boundary, reason);
  const admissionEntity = options.admissionEntity || entity;
  if (boundary.parent && hasExplicitAuthoredGeologyPresentation(admissionEntity)) {
    fallbackRoot.visible = true;
    markReadableFallbackLayer(fallbackRoot);
    fallbackRoot.userData.authoredAssetState = 'same-semantic-fallback';
    fallbackRoot.userData.authoredVisualRoot = 'procedural-geology-fallback';
    if (error?.message) fallbackRoot.userData.authoredFallbackReason = error.message;
    setActive(fallbackRoot);
    boundary.userData.authoredReadableFallbackRetained = true;
    boundary.userData.authoredVisualRoot = 'procedural-geology-fallback';
    boundary.userData.authoredFallbackReason = reason;
    if (error?.message) boundary.userData.authoredFallbackMessage = error.message;
    boundary.userData.renderContract = {
      ...(fallbackRoot.userData.renderContract || boundary.userData.renderContract || {}),
      assetBoundary: 'same-semantic procedural geology fallback',
      gracefulFallback: true,
    };
    const publish = () => {
      boundary.userData.authoredAssetState = 'same-semantic-fallback';
      setPresentationAdmission(admissionEntity, PRESENTATION_ADMISSION.ready);
      return true;
    };
    if (options.deferBoundaryPublication === true) {
      boundary.userData.authoredAssetState = 'same-semantic-fallback-prepared';
      installPreparedBoundaryPublisher(boundary, publish);
    } else {
      publish();
    }
    if (error) console.warn('[partsLibrary] authored geology unavailable; retaining the matching procedural asteroid', error);
    return false;
  }

  boundary.userData.authoredAssetState = 'unavailable';
  boundary.userData.authoredVisualRoot = reason.includes('pipeline')
    ? 'none-pipeline-failed'
    : (reason.includes('build') ? 'none-build-failed' : 'none-load-failed');
  setPresentationAdmission(admissionEntity, PRESENTATION_ADMISSION.unavailable);
  if (error) console.warn('[partsLibrary] authored place admission failed; no substitute visual published', error);
  return false;
}

function commitAuthoredPlaceBoundary(
  boundary, fallbackRoot, authored, setActive, admissionEntity, options = {},
) {
  // A validated place record is the sole presentation authority. The hidden substrate never appears
  // in play, so there is no placeholder frame or blue-clay-to-authored identity swap.
  boundary.remove(fallbackRoot);
  boundary.add(authored.root);
  // FlightRenderPackage v3 already bakes and joins the immutable lanes offline. Re-running the
  // generic cross-root optimizer would clone, transform, de-index, and merge that geometry during
  // New Game — exactly the runtime compiler this package route exists to remove.
  if (authored.root.userData?.spacefaceFlightStaticV3 !== true) {
    optimizeStaticBatchesForRoot(authored.root);
  }
  freezeStaticChildMatrices(authored.root);
  unregisterPreparedAuthoredAdmission(authored);
  setActive(authored.root);
  boundary.userData.authoredReadableFallbackRetained = false;
  boundary.userData.authoredVisualRoot = 'authored-root';
  boundary.userData.authoredParts = authored.authoredParts;
  boundary.userData.authoredSlots = authored.authoredSlots;
  boundary.userData.authoredCompositionId = authored.root.userData.assetId;
  boundary.userData.authoredRenderContract = authored.root.userData.renderContract;
  boundary.userData.assetId = authored.root.userData.assetId;
  boundary.userData.renderContract = authored.root.userData.renderContract;
  boundary.userData.__socketCache = new Map();

  const publish = () => {
    boundary.userData.authoredAssetState = 'authored';
    setPresentationAdmission(admissionEntity, PRESENTATION_ADMISSION.ready);
    return true;
  };
  if (options.deferBoundaryPublication === true) {
    boundary.userData.authoredAssetState = 'authored-prepared';
    installPreparedBoundaryPublisher(boundary, publish);
  } else {
    publish();
  }

  try { disposeDetachedPlaceFallback(fallbackRoot); }
  catch (error) { console.warn('[partsLibrary] place fallback cleanup failed after authored swap', error); }
  return true;
}

function buildPlacePropRoot(entity, record, scene, ownerBoundary) {
  const palette = paletteFor(entity || {});
  const root = new THREE.Group();
  const data = entity && entity.data || {};
  const placeId = data.placeId || record.assetId || 'place_prop';
  root.name = `GLTFKit_${placeId}`;
  const isStation = entity && entity.type === 'station';
  root.userData.kind = isStation ? 'station' : 'place';
  root.userData.placeId = placeId;
  root.userData.authoredGeologySkin = hasExplicitAuthoredGeologyPresentation(entity);
  root.userData.assetId = `GLTFKIT_${placeId}`;
  if (isStation && data.archetypeGlb) root.userData.archetypeGlb = data.archetypeGlb;

  const bindings = createBindings();
  const mutableMaterials = new Map();
  // The Cathedral and claim relay authored LODs are uniformly indexed. Keep that topology through
  // their static merges so the runtime does not transform one duplicate vertex per triangle index.
  // Mixed/index-less authored places retain the conservative ordinary path.
  const staticBatches = createStaticBatchCollector(root, bindings, {
    preserveIndexedGeometry: placeId === WRECK_CATHEDRAL_PLACE_ID
      || placeId === CLAIM_RELAY_PLACE_ID,
  });
  const authoredLength = Math.max(record.bounds && record.bounds.size && record.bounds.size[0] || 1, 1e-6);
  const rawScale = Number(data.placeScale);
  const targetRadius = Number(data.placeTargetRadius);
  const authoredEnvelope = Math.max(
    1e-6,
    ...(record.bounds && Array.isArray(record.bounds.size)
      ? record.bounds.size.map((value) => Number(value) || 0)
      : [authoredLength]),
  );
  const scale = Number.isFinite(targetRadius) && targetRadius > 0
    ? (targetRadius * 2) / authoredEnvelope
    : (Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1);
  instantiatePart(record, root, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    targetLength: authoredLength * scale,
    label: 'Place',
  }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
  if (record.flightStaticV3 === true) {
    root.userData.spacefaceFlightStaticV3 = true;
    root.userData.flightRenderPackage = {
      schema: 'spaceface.flightRenderPackage.v1',
      route: 'flight-static-v3',
      assetId: record.renderPackage?.assetId || record.assetId,
      contentHash: record.renderPackage?.contentHash || null,
      fallback: false,
      sourcePlanNodes: record.renderPackage?.planNodeCount || null,
      staticLanes: record.primitives?.length || 0,
      dynamicNodes: 0,
    };
  }
  staticBatches.flush();
  reconcileMaplessHullMaterialAliases(palette);
  canonicalizeMaplessHullMaterials(root, palette);
  normalizePlacePropBindings(bindings);
  centerAuthoredPlaceRoot(root, record, scale);
  installWorldSitePresentation(root, entity);
  installWreckCathedralOpaqueDepthPrepass(root, placeId, bindings);
  specializeClaimRelayOpaqueMaterials(root, placeId);
  installAuthoredLod(root, bindings, null, authoredLevels(record), true);
  root.userData.updateLod('lod0');
  root.userData.authoredSourceEnvelope = authoredEnvelope;
  root.userData.authoredWorldScale = scale;
  root.userData.placeTargetRadius = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius : null;

  root.userData.renderContract = {
    version: 1,
    coordinateSystem: '+X forward, +Y up, +Z starboard; authored world scale',
    authoredParts: [record.url],
    authoredSlots: { place: [record.url] },
    hookBinding: hasExplicitAuthoredGeologyPresentation(entity)
      ? 'SOCKET_* markers remain available; authored mesh is presentation over a simulation-owned asteroid'
      : 'SOCKET_* markers remain available for debug/probes; world-place props are non-sim scenery',
  };
  return {
    root,
    authoredParts: [record.url],
    authoredSlots: { place: [record.url] },
  };
}

function specializeClaimRelayOpaqueMaterials(root, placeId) {
  if (!root || placeId !== CLAIM_RELAY_PLACE_ID) return;
  const variants = new Map();
  const roles = new Set();
  let packedOrmMaterialCount = 0;

  root.traverse((object) => {
    if (!object.isMesh || object.userData?.spacefaceStaticBatch !== true || !object.material) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const specialized = sourceMaterials.map((source) => {
      if (!source) return source;
      let variant = variants.get(source);
      if (!variant) {
        variant = source.clone();
        variant.name = `${source.name || 'ClaimRelayMaterial'}_ClosedFrontPackedOrm`;
        variant.side = THREE.FrontSide;
        variant.userData = {
          ...(source.userData || {}),
          spacefaceClaimRelayClosedSurface: true,
        };
        installSingleSamplePackedOrmShader(variant);
        if (variant.userData.spacefacePackedOrmSingleSample === true) packedOrmMaterialCount += 1;
        const role = String(variant.userData.spacefaceMaterialRole || variant.name || '').trim();
        if (role) roles.add(role);
        variants.set(source, variant);
      }
      return variant;
    });
    object.material = Array.isArray(object.material) ? specialized : specialized[0];
  });

  root.userData.claimRelayMaterialPolicy = {
    assetId: placeId,
    surfaceContract: 'closed-authored-primitives-front-sided',
    packedOrmContract: 'one-shared-fetch-for-ao-roughness-metalness',
    materialCount: variants.size,
    packedOrmMaterialCount,
    roles: [...roles].sort(),
  };
}

function centerAuthoredPlaceRoot(root, record, scale) {
  if (!root || !record || !record.bounds) return;
  const center = record.bounds.center || [0, 0, 0];
  const sx = Number(center[0]) || 0;
  const sy = Number(center[1]) || 0;
  const sz = Number(center[2]) || 0;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  root.position.set(-sx * s, 0, -sz * s);
  root.userData.visualCenterOffset = { x: -root.position.x, y: sy * s, z: -root.position.z };
  root.userData.visualBounds = {
    center: [
      (Number(record.bounds.center && record.bounds.center[0]) || 0) * s,
      (Number(record.bounds.center && record.bounds.center[1]) || 0) * s,
      (Number(record.bounds.center && record.bounds.center[2]) || 0) * s,
    ],
    size: [
      (Number(record.bounds.size && record.bounds.size[0]) || 0) * s,
      (Number(record.bounds.size && record.bounds.size[1]) || 0) * s,
      (Number(record.bounds.size && record.bounds.size[2]) || 0) * s,
    ],
  };
}

function installWreckCathedralOpaqueDepthPrepass(root, placeId, bindings) {
  if (!root || placeId !== WRECK_CATHEDRAL_PLACE_ID) return;
  const sources = [];
  root.traverse((object) => {
    if (object.isMesh && object.userData?.spacefaceStaticBatch && opaqueDoubleSidedDepthSource(object)) {
      sources.push(object);
    }
  });
  if (sources.length === 0) return;

  // The Cathedral is a close-range capital-wreck shell. Its eight authored PBR material groups are
  // already merged into one mesh per LOD, but shading every hidden fragment made the target route
  // GPU-bound. A position-only closed-surface pass preserves exact geometry, LOD choice, and default
  // quality. Genuinely open exposed-alloy components keep ordinary double-sided color/depth writes.
  const closedDepthMaterial = new THREE.ShaderMaterial({
    colorWrite: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    toneMapped: false,
    vertexShader: [
      'void main() {',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'void main() {',
      '  gl_FragColor = vec4(0.0);',
      '}',
    ].join('\n'),
  });
  closedDepthMaterial.name = 'SF_WreckCathedral_ClosedDepthPrepass';
  closedDepthMaterial.userData.spacefaceMinimalPositionDepthShader = true;
  const prepasses = [];
  const topologyByLod = {};
  for (const source of sources) {
    const tags = clonePrimitiveTags(source.userData.spacefaceTags);
    const topology = specializeWreckCathedralDepthTopology(source);
    if (topology) topologyByLod[tags.lod || 'always'] = topology.report;
    const depthSpecs = topology ? [
      {
        role: 'closed-front',
        material: closedDepthMaterial,
        geometry: wreckCathedralDepthGeometryForIndices(source, topology.closedIndices, topology.report),
      },
    ] : [
      {
        role: 'closed-front',
        material: closedDepthMaterial,
        geometry: wreckCathedralDepthGeometryForRoles(source, WRECK_CATHEDRAL_CLOSED_MATERIAL_ROLES),
      },
    ];
    for (const spec of depthSpecs) {
      if (!spec.geometry) continue;
      const prepass = new THREE.Mesh(spec.geometry, spec.material);
      prepass.name = `${source.name}_${spec.role}_DepthPrepass`;
      prepass.position.copy(source.position);
      prepass.quaternion.copy(source.quaternion);
      prepass.scale.copy(source.scale);
      prepass.matrixAutoUpdate = source.matrixAutoUpdate;
      if (!source.matrixAutoUpdate) prepass.matrix.copy(source.matrix);
      prepass.layers.mask = source.layers.mask;
      prepass.frustumCulled = source.frustumCulled;
      prepass.renderOrder = Math.min(-1, source.renderOrder - 1);
      prepass.castShadow = false;
      prepass.receiveShadow = false;
      prepass.visible = source.visible;
      prepass.userData = {
        spacefaceDepthPrepass: true,
        spacefaceDepthRole: spec.role,
        spacefacePartUrl: source.userData.spacefacePartUrl,
        spacefacePartUrls: source.userData.spacefacePartUrls,
        spacefaceTags: tags,
        spacefaceDepthIndexView: true,
      };
      root.add(prepass);
      registerBinding(prepass, tags, bindings);
      prepasses.push(prepass);
    }
  }
  root.userData.opaqueDepthPrepass = {
    assetId: placeId,
    drawables: prepasses.length,
    geometry: 'shared-authored-position-closed-indices',
    material: 'position-only-front-sided',
  };
  root.userData.cathedralDepthTopology = {
    geometry: 'indexed-zero-area-pruned-closed-depth-open-color',
    byLod: topologyByLod,
  };
  root.userData.cathedralSurfaceCulling = specializeWreckCathedralClosedSurfaces(sources);
}

function specializeWreckCathedralDepthTopology(source) {
  const geometry = source?.geometry;
  const index = geometry?.index;
  const position = geometry?.getAttribute?.('position');
  const materials = Array.isArray(source?.material) ? source.material : [source?.material];
  const groups = Array.isArray(geometry?.groups) ? geometry.groups : [];
  if (!index?.array || !position || groups.length === 0) return null;

  const sourceIndexCount = index.count;
  const retainedIndices = [];
  const retainedGroups = [];
  const closedIndices = [];
  const exposedIndices = [];
  let removedDegenerateTriangles = 0;
  for (const group of groups) {
    const materialIndex = Number(group.materialIndex) || 0;
    const role = String(materials[materialIndex]?.userData?.spacefaceMaterialRole || '')
      .trim().toLowerCase();
    const start = Math.max(0, Number(group.start) || 0);
    const end = Math.min(index.count, start + Math.max(0, Number(group.count) || 0));
    const groupStart = retainedIndices.length;
    for (let offset = start; offset + 2 < end; offset += 3) {
      const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
      if (!staticTriangleHasRenderableArea(position, triangle[0], triangle[1], triangle[2])) {
        removedDegenerateTriangles += 1;
        continue;
      }
      retainedIndices.push(...triangle);
      if (role === 'exposed_alloy') exposedIndices.push(...triangle);
      else closedIndices.push(...triangle);
    }
    const groupCount = retainedIndices.length - groupStart;
    if (groupCount > 0) retainedGroups.push({ start: groupStart, count: groupCount, materialIndex });
  }

  const exposedClosed = classifyClosedStaticTriangleComponents(position, exposedIndices);
  const openIndices = [];
  let closedExposedTriangles = 0;
  let openExposedTriangles = 0;
  for (let triangle = 0; triangle < exposedIndices.length / 3; triangle += 1) {
    const target = exposedClosed[triangle] ? closedIndices : openIndices;
    target.push(
      exposedIndices[triangle * 3],
      exposedIndices[triangle * 3 + 1],
      exposedIndices[triangle * 3 + 2],
    );
    if (exposedClosed[triangle]) closedExposedTriangles += 1;
    else openExposedTriangles += 1;
  }

  const IndexArray = index.array.constructor;
  geometry.setIndex(new THREE.BufferAttribute(new IndexArray(retainedIndices), 1, index.normalized));
  geometry.clearGroups();
  for (const group of retainedGroups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.userData = {
    ...(geometry.userData || {}),
    spacefaceCathedralDepthTopology: true,
    sourceTriangleIndices: sourceIndexCount,
    retainedTriangleIndices: retainedIndices.length,
    removedDegenerateTriangles,
    closedExposedTriangles,
    openExposedTriangles,
  };
  return {
    closedIndices,
    openIndices,
    report: {
      sourceTriangles: sourceIndexCount / 3,
      retainedTriangles: retainedIndices.length / 3,
      removedDegenerateTriangles,
      closedDepthTriangles: closedIndices.length / 3,
      ordinaryOpenColorTriangles: openIndices.length / 3,
      closedExposedTriangles,
      openExposedTriangles,
      colorMaterialGroups: retainedGroups.length,
    },
  };
}

function wreckCathedralDepthGeometryForIndices(source, sourceIndices, report) {
  const geometry = source?.geometry;
  const index = geometry?.index;
  if (!index?.array || !Array.isArray(sourceIndices) || sourceIndices.length === 0) return null;
  const IndexArray = index.array.constructor;
  const depthGeometry = new THREE.BufferGeometry();
  depthGeometry.setAttribute('position', geometry.getAttribute('position'));
  depthGeometry.setIndex(new THREE.BufferAttribute(new IndexArray(sourceIndices), 1, index.normalized));
  depthGeometry.boundingBox = geometry.boundingBox?.clone?.() || null;
  depthGeometry.boundingSphere = geometry.boundingSphere?.clone?.() || null;
  depthGeometry.userData = {
    spacefaceCathedralRoleDepthIndices: true,
    spacefaceCathedralDepthTopology: true,
    sourceIndexCount: Number(report?.sourceTriangles || 0) * 3,
    selectedIndexCount: sourceIndices.length,
  };
  return depthGeometry;
}

function staticTriangleHasRenderableArea(position, a, b, c) {
  const ax = position.getX(a); const ay = position.getY(a); const az = position.getZ(a);
  const abx = position.getX(b) - ax;
  const aby = position.getY(b) - ay;
  const abz = position.getZ(b) - az;
  const acx = position.getX(c) - ax;
  const acy = position.getY(c) - ay;
  const acz = position.getZ(c) - az;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  const areaSquared = crossX * crossX + crossY * crossY + crossZ * crossZ;
  const abSquared = abx * abx + aby * aby + abz * abz;
  const acSquared = acx * acx + acy * acy + acz * acz;
  const scale = Math.max(abSquared, acSquared, Number.MIN_VALUE);
  return Number.isFinite(areaSquared) && areaSquared > Number.EPSILON * scale * scale * 4;
}

function classifyClosedStaticTriangleComponents(position, indices) {
  const triangleCount = indices.length / 3;
  const parents = Int32Array.from({ length: triangleCount }, (_, index) => index);
  const weldedByVertex = new Map();
  const weldedByPosition = new Map();
  const edges = new Map();
  const find = (value) => {
    let root = value;
    while (parents[root] !== root) root = parents[root];
    while (parents[value] !== value) {
      const next = parents[value];
      parents[value] = root;
      value = next;
    }
    return root;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parents[b] = a;
  };
  const weldedVertex = (vertexIndex) => {
    if (weldedByVertex.has(vertexIndex)) return weldedByVertex.get(vertexIndex);
    const key = `${position.getX(vertexIndex)},${position.getY(vertexIndex)},${position.getZ(vertexIndex)}`;
    let welded = weldedByPosition.get(key);
    if (welded == null) {
      welded = weldedByPosition.size;
      weldedByPosition.set(key, welded);
    }
    weldedByVertex.set(vertexIndex, welded);
    return welded;
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = weldedVertex(indices[triangle * 3]);
    const b = weldedVertex(indices[triangle * 3 + 1]);
    const c = weldedVertex(indices[triangle * 3 + 2]);
    for (const [left, right] of [[a, b], [b, c], [c, a]]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      let owners = edges.get(key);
      if (!owners) {
        owners = [];
        edges.set(key, owners);
      }
      if (owners.length > 0) union(triangle, owners[0]);
      owners.push(triangle);
    }
  }

  const openRoots = new Set();
  for (const owners of edges.values()) {
    if (owners.length === 2) continue;
    for (const triangle of owners) openRoots.add(find(triangle));
  }
  return Array.from({ length: triangleCount }, (_, triangle) => !openRoots.has(find(triangle)));
}

function wreckCathedralDepthGeometryForRoles(source, acceptedRoles) {
  const geometry = source?.geometry;
  const index = geometry?.index;
  const materials = Array.isArray(source?.material) ? source.material : [source?.material];
  const groups = Array.isArray(geometry?.groups) ? geometry.groups : [];
  if (!index?.array || groups.length === 0) return null;

  const selectedGroups = groups.filter((group) => {
    const material = materials[Number(group.materialIndex) || 0];
    const role = String(material?.userData?.spacefaceMaterialRole || '').trim().toLowerCase();
    return acceptedRoles.has(role);
  });
  const count = selectedGroups.reduce((total, group) => total + Number(group.count || 0), 0);
  if (selectedGroups.length === 0 || count <= 0 || count > index.count) return null;

  const IndexArray = index.array.constructor;
  const indices = new IndexArray(count);
  let offset = 0;
  for (const group of selectedGroups) {
    const start = Number(group.start || 0);
    const end = start + Number(group.count || 0);
    indices.set(index.array.subarray(start, end), offset);
    offset += end - start;
  }

  const depthGeometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes || {})) {
    depthGeometry.setAttribute(name, attribute);
  }
  depthGeometry.setIndex(new THREE.BufferAttribute(indices, 1, index.normalized));
  depthGeometry.boundingBox = geometry.boundingBox?.clone?.() || null;
  depthGeometry.boundingSphere = geometry.boundingSphere?.clone?.() || null;
  depthGeometry.userData = {
    spacefaceCathedralRoleDepthIndices: true,
    sourceIndexCount: index.count,
    selectedIndexCount: count,
  };
  return depthGeometry;
}

function opaqueDoubleSidedDepthSource(object) {
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.length > 0 && materials.every((material) => material
    && material.visible !== false
    && material.transparent !== true
    && material.depthWrite !== false
    && (!(Number(material.alphaTest) > 0))
    && (!Number.isFinite(Number(material.opacity)) || Number(material.opacity) >= 1)
    && material.side === THREE.DoubleSide);
}

function specializeWreckCathedralClosedSurfaces(sources) {
  const variants = new Map();
  const frontSideRoles = new Set();
  const retainedDoubleSideRoles = new Set();
  for (const source of sources) {
    const sourceMaterials = Array.isArray(source.material) ? source.material : [source.material];
    const specialized = sourceMaterials.map((material) => {
      const role = String(material?.userData?.spacefaceMaterialRole || '').trim().toLowerCase();
      const closed = WRECK_CATHEDRAL_CLOSED_MATERIAL_ROLES.has(role);
      const open = role === 'exposed_alloy' && material?.side === THREE.DoubleSide;
      if (!closed && !open) {
        return material;
      }
      if (closed) frontSideRoles.add(role);
      if (open) retainedDoubleSideRoles.add(role);
      let variant = variants.get(material);
      if (!variant) {
        variant = material.clone();
        variant.name = `${material.name || 'CathedralMaterial'}_${closed ? 'ClosedFront' : 'OpenDouble'}`;
        variant.side = closed ? THREE.FrontSide : THREE.DoubleSide;
        variant.depthFunc = closed ? THREE.EqualDepth : THREE.LessEqualDepth;
        variant.depthWrite = !closed;
        variant.userData = {
          ...(material.userData || {}),
          spacefaceCathedralClosedSurfaceCulled: closed,
          spacefaceCathedralEqualDepth: closed,
          spacefaceCathedralOrdinaryOpenDepth: open,
        };
        installSingleSamplePackedOrmShader(variant);
        variant.needsUpdate = true;
        variants.set(material, variant);
      }
      return variant;
    });
    source.material = Array.isArray(source.material) ? specialized : specialized[0];
  }
  return {
    frontSideRoles: [...frontSideRoles].sort(),
    retainedDoubleSideRoles: [...retainedDoubleSideRoles].sort(),
    depthContract: 'closed-prepass-equal-open-color-depth',
  };
}

function installSingleSamplePackedOrmShader(material) {
  if (!material || material.userData?.spacefacePackedOrmSingleSample === true) return material;
  const orm = material.roughnessMap;
  if (!sameTextureSamplingForPackedOrm(orm, material.metalnessMap)
      || !sameTextureSamplingForPackedOrm(orm, material.aoMap)) return material;

  const originalOnBeforeCompile = material.onBeforeCompile;
  const originalProgramCacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function packedOrmSingleSampleShader(shader, renderer) {
    if (typeof originalOnBeforeCompile === 'function') {
      originalOnBeforeCompile.call(this, shader, renderer);
    }
    const replacements = [
      [
        '#include <roughnessmap_fragment>',
        [
          'float roughnessFactor = roughness;',
          '#ifdef USE_ROUGHNESSMAP',
          '\tvec4 sfPackedOrmTexel = texture2D( roughnessMap, vRoughnessMapUv );',
          '\troughnessFactor *= sfPackedOrmTexel.g;',
          '#endif',
        ].join('\n'),
      ],
      [
        '#include <metalnessmap_fragment>',
        [
          'float metalnessFactor = metalness;',
          '#ifdef USE_METALNESSMAP',
          '\tmetalnessFactor *= sfPackedOrmTexel.b;',
          '#endif',
        ].join('\n'),
      ],
      [
        '#include <aomap_fragment>',
        [
          '#ifdef USE_AOMAP',
          '\tfloat ambientOcclusion = ( sfPackedOrmTexel.r - 1.0 ) * aoMapIntensity + 1.0;',
          '\treflectedLight.indirectDiffuse *= ambientOcclusion;',
          '\t#if defined( USE_CLEARCOAT )',
          '\t\tclearcoatSpecularIndirect *= ambientOcclusion;',
          '\t#endif',
          '\t#if defined( USE_SHEEN )',
          '\t\tsheenSpecularIndirect *= ambientOcclusion;',
          '\t#endif',
          '\t#if defined( USE_ENVMAP ) && defined( STANDARD )',
          '\t\tfloat dotNV = saturate( dot( geometryNormal, geometryViewDir ) );',
          '\t\treflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );',
          '\t#endif',
          '#endif',
        ].join('\n'),
      ],
    ];
    for (const [needle, replacement] of replacements) {
      if (!shader.fragmentShader.includes(needle)) {
        throw new Error(`[render] packed-ORM shader contract changed: missing ${needle}`);
      }
      shader.fragmentShader = shader.fragmentShader.replace(needle, replacement);
    }
  };
  material.customProgramCacheKey = () => `${originalProgramCacheKey}|spaceface-packed-orm-single-sample-v1`;
  material.userData = {
    ...(material.userData || {}),
    spacefacePackedOrmSingleSample: true,
    spacefacePackedOrmTextureSamples: 1,
  };
  material.needsUpdate = true;
  return material;
}

function sameTextureSamplingForPackedOrm(left, right) {
  if (!left || !right || (left.channel || 0) !== (right.channel || 0)) return false;
  const sameSource = left === right
    || (left.source && left.source === right.source)
    || (left.image && left.image === right.image);
  if (!sameSource || left.flipY !== right.flipY || left.wrapS !== right.wrapS || left.wrapT !== right.wrapT) {
    return false;
  }
  if (left.matrixAutoUpdate && typeof left.updateMatrix === 'function') left.updateMatrix();
  if (right.matrixAutoUpdate && typeof right.updateMatrix === 'function') right.updateMatrix();
  const leftMatrix = left.matrix?.elements || [];
  const rightMatrix = right.matrix?.elements || [];
  if (leftMatrix.length !== rightMatrix.length) return false;
  for (let i = 0; i < leftMatrix.length; i += 1) {
    if (Math.abs(leftMatrix[i] - rightMatrix[i]) > 1e-6) return false;
  }
  return true;
}

function normalizePlacePropBindings(bindings) {
  for (const plume of bindings.drivePlumes) {
    if (!plume || !plume.material) continue;
    plume.material.transparent = true;
    plume.material.depthWrite = false;
    if (!Number.isFinite(plume.material.opacity)) plume.material.opacity = 0.55;
    plume.castShadow = false;
    plume.receiveShadow = false;
  }
}

function buildFallbackPlaceProp(entity, placeFile) {
  const data = entity && entity.data || {};
  const placeId = data.placeId || placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  const radius = Math.max(3, Number(entity && entity.radius) || 8);
  const group = new THREE.Group();
  group.name = `SF_PlaceFallback_${placeId}`;
  group.userData.kind = 'place';
  group.userData.placeId = placeId;
  group.userData.renderContract = {
    assetBoundary: 'GLTFKit v1 — authored world-place prop fallback',
    gracefulFallback: true,
  };

  const color = fallbackPlaceColor(placeId, data.paletteClass);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: 0.22,
    emissive: new THREE.Color(color).multiplyScalar(0.28),
    emissiveIntensity: 0.25,
  });
  const mesh = new THREE.Mesh(getFallbackPlaceGeometry(), material);
  mesh.name = `SF_PlaceFallback_${placeId}_Hull`;
  mesh.scale.set(radius * 0.28, radius * 0.20, radius * 0.28);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function getFallbackPlaceGeometry() {
  if (!fallbackPlaceGeometry) fallbackPlaceGeometry = markSharedFallbackGeometry(new THREE.BoxGeometry(1, 1, 1));
  return fallbackPlaceGeometry;
}

function getFallbackStationCoreGeometry() {
  if (!fallbackStationCoreGeometry) fallbackStationCoreGeometry = markSharedFallbackGeometry(new THREE.CylinderGeometry(0.42, 0.5, 0.72, 10));
  return fallbackStationCoreGeometry;
}

function getFallbackStationRingGeometry() {
  if (!fallbackStationRingGeometry) fallbackStationRingGeometry = markSharedFallbackGeometry(new THREE.TorusGeometry(0.82, 0.055, 10, 36));
  return fallbackStationRingGeometry;
}

function getFallbackStationSparGeometry() {
  if (!fallbackStationSparGeometry) fallbackStationSparGeometry = markSharedFallbackGeometry(new THREE.BoxGeometry(0.16, 0.12, 0.72));
  return fallbackStationSparGeometry;
}

function markSharedFallbackGeometry(geometry) {
  geometry.userData = { ...(geometry.userData || {}), spacefaceSharedFallback: true };
  return geometry;
}

function fallbackPlaceColor(placeId, paletteClass) {
  const token = String(placeId || '');
  if (String(paletteClass || '').toLowerCase() === 'anomaly') return 0x8d66ff;
  if (String(paletteClass || '').toLowerCase() === 'fringe') return 0xff5c5c;
  if (String(paletteClass || '').toLowerCase() === 'belt') return 0xffb35c;
  if (token.includes('asteroid') || token.includes('debris') || token.includes('hulk')) return 0x7b8794;
  return 0x39d0ff;
}

function placeFileForEntity(entity) {
  const data = entity && entity.data || {};
  if (entity && entity.type === 'asteroid' && !hasExplicitAuthoredGeologyPresentation(entity)) return null;
  const claimSpecializationFile = CLAIM_SPECIALIZATION_PLACE_FILE_BY_ID[String(data.claimSpecId || '')];
  if (claimSpecializationFile) return claimSpecializationFile;
  if (data.claimOwned === true) return 'places/place_claim_outpost_base.glb';
  const id = String(
    data.archetypeGlb || data.landmarkGlb || data.placeId || data.assetId || '',
  ).replace(/^places\//, '').replace(/\.glb$/, '');
  if (!id) return null;
  return PLACE_FILE_BY_ID[id] || (PLACE_FILES.includes(`places/${id}.glb`) ? `places/${id}.glb` : null);
}

export function enqueueBoundaryUpgrade(scene, job) {
  const state = upgradeQueueState(scene);
  if (!job || !job.boundary) return Promise.resolve({ status: 'invalid-upgrade-request' });
  const boundaryJob = state.byBoundary.get(job.boundary);
  if (boundaryJob) return boundaryJob.completion;
  if (!boundaryBelongsToScene(job.boundary, scene)) {
    return Promise.resolve({ status: 'cancelled-before-queue', boundary: job.boundary });
  }
  let resolveCompletion;
  const completion = new Promise((resolve) => { resolveCompletion = resolve; });
  const queuedJob = {
    ...job,
    priority: authoredUpgradePriority(job),
    key: authoredUpgradeKey(job),
    sequence: state.nextSequence++,
    assetUrls: authoredUpgradeAssetUrls(job),
    estimatedBytes: authoredUpgradeEstimatedBytes(job),
    completion,
    resolveCompletion,
    completionSettled: false,
    lifecycle: 'queued',
  };
  const keyedJob = state.byKey.get(queuedJob.key);
  if (keyedJob) {
    if (jobStillNeeded(state, keyedJob)) return keyedJob.completion;
    if (keyedJob.lifecycle === 'queued') {
      const staleIndex = state.jobs.indexOf(keyedJob);
      if (staleIndex >= 0) state.jobs.splice(staleIndex, 1);
      cancelQueuedJob(state, keyedJob);
    }
    // An admitted job owns its decode/compile/upload group until its all-settled completion. Leave
    // it running; the serial lane holds this replacement queued, and the identity-guarded map
    // cleanup below cannot delete the replacement when the old job finally settles.
  }
  const insertionIndex = state.jobs.findIndex((candidate) => candidate.priority > queuedJob.priority);
  if (insertionIndex < 0) state.jobs.push(queuedJob);
  else state.jobs.splice(insertionIndex, 0, queuedJob);
  state.byBoundary.set(queuedJob.boundary, queuedJob);
  state.byKey.set(queuedJob.key, queuedJob);
  if (!state.running) processUpgradeQueue(state);
  else scheduleNextUpgradeFrame(state);
  return completion;
}

function upgradeQueueState(scene) {
  let state = upgradeQueuesByScene.get(scene);
  if (!state) {
    state = {
      scene,
      jobs: [],
      running: false,
      inFlight: 0,
      frameScheduled: false,
      lateSkips: 0,
      byBoundary: new Map(),
      byKey: new Map(),
      nextSequence: 0,
      diagnostics: {
        schema: 'spaceface.authoredUpgradeDiagnostics.v1',
        jobs: [],
        activeJobs: 0,
        maxConcurrentJobs: 0,
        maxConcurrentDecode: 0,
        activePlannedBytes: 0,
        peakActivePlannedBytes: 0,
        partLoads: [],
      },
    };
    if (scene && scene.userData) scene.userData.authoredUpgradeDiagnostics = state.diagnostics;
    upgradeQueuesByScene.set(scene, state);
  }
  return state;
}

function authoredUpgradePriority(job) {
  const entity = job && job.entity;
  if (entity && entity.isPlayer === true) return 0;
  if (isCriticalStartingHub(entity)) return 1;
  return backgroundUpgradePriority(job);
}

function backgroundUpgradePriority(job) {
  const liveState = authoredRuntimeState();
  if (!liveState || liveState.mode !== 'flight') return 10;
  const entity = job && job.entity;
  if (!entity) return 10;
  if (liveState.player && liveState.player.targetId === entity.id) return 2;
  if (entity.team === 1) return 3;
  if (entityIsOnscreen(entity, liveState)) return 4;
  return 10;
}

function authoredRuntimeState() {
  return globalThis && globalThis.window && globalThis.window.SF
    ? globalThis.window.SF.state || null
    : null;
}

function waitForOpeningGraphPublicationRelease() {
  const render = authoredRuntimeState()?.render;
  if (!render || render.openingGraphPublicationFrozen !== true) return null;
  const wait = render.waitForOpeningGraphPublicationRelease;
  if (typeof wait !== 'function') {
    return Promise.reject(new Error('Opening graph publication is frozen without a release boundary'));
  }
  return Promise.resolve(wait());
}

/**
 * Tier-1 causal counter sink for composition/admission work. Follows the same window.SF seam as
 * recordAdmissionSlice: probes and the deterministic harness expose state there; production bundles
 * without window.SF simply never count. Counters themselves still default to disabled.
 */
function tier1CausalCounters() {
  const live = authoredRuntimeState();
  const perf = live && live.perfRuntime;
  const tier1 = perf && perf.tier1;
  return tier1 && typeof tier1.isEnabled === 'function' && tier1.isEnabled() ? tier1 : null;
}

/**
 * First-render is a useful demand signal for isolated previews, but the main scene is rendered and
 * precompiled while a run is still loading. Main-scene auto-demand is therefore limited to startup
 * invariants while loading, and to genuinely focused/onscreen entities in flight. Renderer-owned
 * spatial prefetch can still call requestAuthoredUpgrade directly before an entity becomes visible.
 *
 * Hostile team membership alone must NOT auto-compose in flight — that was the non-preemptible
 * buildComposedShip combat stall. Sector prewarm / deferred publication own authored combat craft.
 */
export function shouldAutoTriggerAuthoredUpgrade(entity, scene, liveState = authoredRuntimeState()) {
  if (!liveState || !liveState.render || liveState.render.scene !== scene) return true;
  if (!entity || entity.alive === false) return false;
  if (liveState.mode === 'loading') return isInitialAuthoredCompositionEntity(entity, liveState);
  if (entity.isPlayer === true || isCriticalStartingHub(entity)) return true;
  if (liveState.mode !== 'flight') return false;
  if (liveState.player && liveState.player.targetId === entity.id) return true;
  return entityIsOnscreen(entity, liveState);
}

/**
 * Live flight must never run sync buildComposedShip for ordinary traffic on the playable thread.
 * Sector prewarm and deferred publication prepare those behind a gate. The player is the exception:
 * their boundary is a zero-draw ownership slot until the real authored body commits, so mid-flight
 * player composition must stay allowed on the async queue. No junk stand-in is substituted.
 */
function isEmptyAdmissionSubstrate(root) {
  return !!(root && root.userData && root.userData.authoredAdmissionSubstrate);
}

export function mayComposeAuthoredShipLive(options = {}, liveState = authoredRuntimeState()) {
  if (options && options.deferBoundaryPublication === true) return true;
  const role = String((options && options.residencyRole) || '');
  if (
    role === 'player'
    || role === 'sector-prewarm'
    || role === 'sector-prepared-boundary'
    || role === 'sector-prepared-live-boundary'
    || role === 'whole-ship-lod-family'
  ) {
    return true;
  }
  // Live ships mount a zero-draw ownership slot. The player exception exists because that slot
  // is not a readable hull. NPC/enemy ships use the same substrate; blocking them leaves a
  // targeting lock on empty space until an authored body commits.
  if (options.emptyAdmissionSubstrate === true || isEmptyAdmissionSubstrate(options.fallbackRoot)) {
    return true;
  }
  if (!liveState || liveState.mode !== 'flight') return true;
  return false;
}

/**
 * Unhide an existing substrate when live composition is gated. Does not invent a substitute ship —
 * empty direct-admission roots stay empty; the real authored body is the only identity.
 */
export function settleAuthoredShipToProceduralFallback(
  boundary,
  fallbackRoot,
  entity,
  setActive,
  reason = 'flight-compose-gated',
) {
  if (!boundary || !fallbackRoot) return false;
  if (isEmptyAdmissionSubstrate(fallbackRoot)) return false;
  fallbackRoot.visible = true;
  if (typeof setActive === 'function') setActive(fallbackRoot);
  boundary.userData.authoredAssetState = 'procedural-settled';
  boundary.userData.authoredVisualRoot = 'procedural-fallback';
  boundary.userData.authoredReadableFallbackRetained = true;
  boundary.userData.authoredComposeDeferredReason = reason;
  if (boundary.userData.renderContract) {
    boundary.userData.renderContract.gracefulFallback = true;
  }
  if (entity) setPresentationAdmission(entity, PRESENTATION_ADMISSION.ready);
  return true;
}

function residencyOptionsForBoundary(entity, boundary, renderer) {
  const liveState = authoredRuntimeState();
  const data = entity && entity.data || {};
  const sectorId = data.sectorId || entity && entity.homeSectorId
    || liveState && liveState.world && liveState.world.currentSectorId
    || null;
  if (boundary && boundary.userData && renderer) {
    boundary.userData.releaseAuthoredAssetResidency = (reason = 'boundary-disposed') => (
      releaseBoundaryResidency(renderer, boundary, reason)
    );
  }
  return {
    residencyOwner: boundary,
    residencyRole: entity && entity.isPlayer === true ? 'player' : 'current-sector',
    sectorId,
    isResidencyOwnerActive: () => !!boundary && !!boundary.parent && entity && entity.alive !== false,
    prepareAuthoredPipelines: liveState && liveState.render
      && typeof liveState.render.compileObjectPipelines === 'function'
      ? (root) => liveState.render.compileObjectPipelines(root)
      : null,
    prepareAuthoredGpuResidency: liveState && liveState.render
      && typeof liveState.render.prepareAuthoredGpuResidency === 'function'
      ? (root, admissionOptions = {}) => liveState.render.prepareAuthoredGpuResidency(root, {
          isActive: admissionOptions.isResidencyOwnerActive,
        })
      : null,
    overlapAuthoredPipelineCompile: !!(liveState && liveState.mode !== 'flight'),
    yieldBetweenGpuStages: !!(liveState && liveState.mode === 'flight'),
    yieldToNextPresent: liveState && liveState.render
      && typeof liveState.render.yieldToNextPresent === 'function'
      ? () => liveState.render.yieldToNextPresent()
      : null,
  };
}

function entityIsOnscreen(entity, state) {
  const root = entity && entity.mesh;
  if (!root || root.visible === false) return false;
  for (let node = root.parent; node; node = node.parent) if (node.visible === false) return false;
  const camera = state && state.render && state.render.camera;
  if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return true;
  try {
    camera.updateMatrixWorld(true);
    root.updateWorldMatrix(true, false);
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
    return frustum.containsPoint(root.getWorldPosition(new THREE.Vector3()));
  } catch {
    return true;
  }
}

function authoredUpgradeKey(job) {
  if (job && job.key != null) return String(job.key);
  const entity = job && job.entity;
  if (entity && entity.isPlayer === true) return `player:${String(entity.id)}`;
  if (isCriticalStartingHub(entity)) return `critical-hub:${String(entity.id)}`;
  if (entity && entity.id != null) return `entity:${String(entity.type || 'unknown')}:${String(entity.id)}`;
  return job.boundary;
}

function authoredUpgradePlan(job) {
  const entity = job && job.entity;
  if (!entity) return {};
  if (entity.type === 'ship') return authoredPreloadPlanForEntity(entity, job.options || {});
  const placeFile = placeFileForEntity(entity);
  return placeFile ? { place: [placeFile] } : {};
}

function authoredUpgradeAssetUrls(job) {
  if (job && Array.isArray(job.assetUrls)) return [...new Set(job.assetUrls.filter(Boolean).map(String))];
  const partRoot = isReleaseAssetMode(job && job.options || {}) ? PART_RELEASE_ROOT : PART_ROOT;
  return Object.values(authoredUpgradePlan(job)).flat().map((file) => `${partRoot}${file}`);
}

function authoredUpgradeEstimatedBytes(job) {
  const explicit = Number(job && job.estimatedBytes);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  let bytes = 0;
  if (globalThis.performance && typeof globalThis.performance.getEntriesByName === 'function') {
    for (const url of authoredUpgradeAssetUrls(job)) {
      const entries = globalThis.performance.getEntriesByName(url);
      const resource = entries && entries[entries.length - 1];
      bytes += Number(resource && (resource.decodedBodySize || resource.transferSize)) || 0;
    }
  }
  return bytes;
}

function authoredUpgradeCacheStatus(job) {
  const library = resolvedCanonicalLibrary(job && job.renderer, job && job.options || {});
  if (!library) return 'miss';
  return libraryHasPreloadPlan(library, authoredUpgradePlan(job)) ? 'hit' : 'miss';
}

function cleanupQueuedJob(state, job) {
  if (state.byBoundary.get(job.boundary) === job) state.byBoundary.delete(job.boundary);
  if (state.byKey.get(job.key) === job) state.byKey.delete(job.key);
}

function cancelQueuedJob(state, job) {
  if (!job || job.lifecycle === 'in-flight' || job.lifecycle === 'settled') return false;
  job.lifecycle = 'cancelled';
  cleanupQueuedJob(state, job);
  const residency = job && job.renderer && getAssetResidency(job.renderer);
  if (residency && job.boundary) residency.releaseOwner(job.boundary, 'upgrade-job-cancelled');
  if (job.boundary && job.boundary.userData) {
    job.boundary.userData.authoredAssetState = 'cancelled-before-load';
  }
  recordUpgradeCancellation(state, job);
  settleUpgradeJob(job, 'cancelled-before-load');
  return true;
}

function settleUpgradeJob(job, status, result = null, error = null) {
  if (!job || job.completionSettled) return false;
  job.completionSettled = true;
  job.resolveCompletion({
    status: status || 'completed',
    result,
    error: error || null,
    boundary: job.boundary || null,
  });
  return true;
}

function scheduleUpgradeFrame(callback) {
  // DO NOT MOVE THIS OFF THE DISPLAY CALLBACK WITHOUT RE-RUNNING THE A/B BELOW. Two separate
  // attempts have now failed here, and the warning from the first one is preserved verbatim:
  //
  //   "Stay on the display callback. Parking a 40-150 ms compose on setTimeout(0) between frames
  //    made every rAF late while the queue was full. The merge cache is what makes the job cheaper;
  //    the scheduler must not turn some hitches into a 30 fps floor."
  //
  // 2026-08-23, second attempt: gate `mode === 'flight'` here and arm the callback after present.
  // MEASURED AND REJECTED by a clean A/B on a real Intel GPU, instrument held constant, two runs
  // per arm (presentation p95 / max ms / hitches per frames):
  //
  //   with the change   6.7 /   10 / 80 of 760      <- brick gone, but 5x the hitches
  //                     7.5 / 3164 / 14 of 849      <- brick BACK; the change did not even apply
  //   without           5.5 / 3291 / 15 of 830
  //                     5.8 / 3654 / 15 of 819
  //
  // Two independent reasons it was rejected. (1) It is UNRELIABLE: it removed the brick in only one
  // of two runs. The gate reads `mode` at SCHEDULE time, so a compose queued moments before flight
  // handover still takes the old path and bricks anyway - the mode flag is the wrong signal.
  // (2) When it DID apply it raised the hitch count from 15 to 80, which PQ-129's own promotion law
  // ("promote only after hitch count is halved") forbids outright.
  //
  // The brick itself is real and reproducible: ~3.2-3.7 s at entering-flight across four runs.
  // The next attempt should defer only the ONE huge first compose, not every flight upgrade frame -
  // the display callback is right for the QUEUE and wrong for that single job - and must gate on
  // something that cannot race flight handover.
  // Stay on the display callback. Parking a 40–150 ms compose on setTimeout(0) between
  // frames made every rAF late while the queue was full. The merge cache is what makes
  // the job cheaper; the scheduler must not turn some hitches into a 30 fps floor.
  const raf = globalThis && typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null;
  if (raf) raf(callback);
  else setTimeout(callback, 16);
}

function processUpgradeQueue(state) {
  state.running = true;
  scheduleNextUpgradeFrame(state);
}

function scheduleNextUpgradeFrame(state) {
  if (!state || state.frameScheduled) return;
  if (state.jobs.length === 0) {
    state.running = state.inFlight > 0 || state.diagnostics.activeJobs > 0;
    publishUpgradeDiagnostics(state);
    return;
  }
  if (state.inFlight >= authoredUpgradeConcurrencyLimit()) return;
  // One entity admission per frame: keep post-boot authored upgrades bounded even when several
  // decoded packages become eligible together.
  state.frameScheduled = true;
  scheduleUpgradeFrame(() => admitNextUpgradeJob(state));
}

function admitNextUpgradeJob(state) {
  state.frameScheduled = false;
  const live = authoredRuntimeState();
  if (live && live.mode === 'flight') {
    const gate = shouldStartHeavyAdmissionEventually(
      live.render && live.render.lastPresentDtMs,
      state.lateSkips,
    );
    state.lateSkips = gate.skippedCount;
    if (!gate.start) {
      scheduleNextUpgradeFrame(state);
      return;
    }
  }
  state.jobs.sort((a, b) => {
    const priorityDelta = authoredUpgradePriority(a) - authoredUpgradePriority(b);
    return priorityDelta || a.sequence - b.sequence;
  });
  primeNextAuthoredAssetPlan(state);
  const job = state.jobs.shift();
  if (!job) {
    state.running = state.inFlight > 0 || state.diagnostics.activeJobs > 0;
    publishUpgradeDiagnostics(state);
    return;
  }
  if (!jobStillNeeded(state, job)) {
    cancelQueuedJob(state, job);
    scheduleNextUpgradeFrame(state);
    return;
  }

  job.lifecycle = 'in-flight';
  state.inFlight++;
  const diagnostic = beginUpgradeDiagnostic(state, job);
  let serialSlotReleased = false;
  const releaseSerialSlotAfterPipelineStaging = () => {
    if (serialSlotReleased || job.lifecycle !== 'in-flight') return false;
    serialSlotReleased = true;
    state.inFlight = Math.max(0, state.inFlight - 1);
    scheduleNextUpgradeFrame(state);
    return true;
  };
  if (job.options && job.options.overlapAuthoredPipelineCompile === true
      && Object.isExtensible(job.options)) {
    // Loading composes one boundary at a time, then lets its exact GPU gate overlap the next CPU
    // admission. The authored overlap branches invoke this only after publishing pipelineReady.
    job.options.onAuthoredPipelineStaged = releaseSerialSlotAfterPipelineStaging;
  }
  // One entity begins CPU admission per frame. Non-overlap jobs and custom runs that do not enter
  // an authored overlap branch keep the original single-flight semantics; loading authored jobs
  // release only this internal slot once their detached root reaches the exact pipeline/GPU gate.
  const run = typeof job.run === 'function'
    ? job.run
    : () => upgradeBoundary(
      job.boundary,
      job.fallbackRoot,
      job.entity,
      job.renderer,
      job.scene,
      job.options,
      job.setActive,
      job.prefetchPromise,
    );
  let result = null;
  let failure = null;
  Promise.resolve().then(run).then((value) => {
    result = value;
    diagnostic.status = job.boundary && job.boundary.userData
      ? job.boundary.userData.authoredAssetState || 'completed'
      : 'completed';
  }).catch((error) => {
    failure = error;
    diagnostic.status = 'fallback-after-error';
    diagnostic.error = error && error.message ? error.message : String(error);
    releaseBoundaryResidency(job.renderer, job.boundary, 'queued-upgrade-failed');
    job.boundary.userData.authoredAssetState = 'fallback-after-error';
    console.warn('[partsLibrary] queued authored composition failed; retaining fallback', error);
  })
    .finally(() => {
      if (!serialSlotReleased) state.inFlight = Math.max(0, state.inFlight - 1);
      job.lifecycle = 'settled';
      finishUpgradeDiagnostic(state, job, diagnostic);
      cleanupQueuedJob(state, job);
      settleUpgradeJob(job, diagnostic.status, result, failure);
      scheduleNextUpgradeFrame(state);
    });
  scheduleNextUpgradeFrame(state);
}

function authoredUpgradeConcurrencyLimit() {
  const live = authoredRuntimeState() || {};
  const render = live.render || {};
  const nowMs = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  return resolveAuthoredUpgradeConcurrency({
    mode: live.mode,
    opening: render.deferNoncriticalMeshStreaming === true,
    deferNoncriticalMeshStreaming: render.deferNoncriticalMeshStreaming === true,
    firstPlayableFrameAt: render.firstPlayableFrameAt,
    nowMs,
  });
}

function primeNextAuthoredAssetPlan(state) {
  const liveState = authoredRuntimeState();
  if (!state || !liveState || liveState.mode !== 'flight') return;
  // Only prepare the job that is about to be admitted. The old loop started a preload Promise for
  // every queued ship, which effectively asked the serial decode lane to process the whole live
  // galaxy while the player was already flying. One-job lookahead keeps the same authored asset and
  // exact composition, but bounds decode/GPU residency demand to the next relevant boundary.
  for (const job of state.jobs) {
    if (!jobStillNeeded(state, job)) {
      const index = state.jobs.indexOf(job);
      if (index >= 0) state.jobs.splice(index, 1);
      cancelQueuedJob(state, job);
      continue;
    }
    if (job.prefetchPromise || !job.entity || job.entity.type !== 'ship' || !job.renderer) continue;
    job.prefetchPromise = preloadAuthoredAssetsForEntity(job.renderer, job.entity, job.options || {});
    job.prefetchPromise.catch((error) => {
      job.prefetchError = error && error.message ? error.message : String(error);
    });
    break;
  }
}

function monotonicNow() {
  return globalThis.performance && typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function recordAdmissionSlice(startedAtMs, hitchOwner = null) {
  const elapsedMs = monotonicNow() - startedAtMs;
  const perf = authoredRuntimeState()?.perfRuntime;
  if (perf && typeof perf.recordAdmissionWork === 'function') {
    perf.recordAdmissionWork(elapsedMs);
  }
  if (hitchOwner && perf?.renderWorkEnabled === true
      && typeof perf.recordRenderWork === 'function') {
    perf.recordRenderWork(hitchOwner, elapsedMs);
  }
}

function beginUpgradeDiagnostic(state, job) {
  const perf = authoredRuntimeState()?.perfRuntime;
  let backgroundJob = null;
  if (perf?.backgroundJobTrackingEnabled === true
    && typeof perf.beginBackgroundJob === 'function') {
    try {
      backgroundJob = perf.beginBackgroundJob('authored-upgrade', {
        sourceSequence: job.sequence,
      });
    } catch {
      backgroundJob = null;
    }
  }
  job.perfBackgroundJob = backgroundJob;
  job.perfBackgroundJobOwner = perf || null;
  const diagnostic = {
    sequence: job.sequence,
    key: typeof job.key === 'string' ? job.key : 'boundary',
    entityId: job.entity && job.entity.id,
    entityType: job.entity && job.entity.type || null,
    priority: authoredUpgradePriority(job),
    modeAtStart: authoredRuntimeState() && authoredRuntimeState().mode || null,
    assetUrls: [...job.assetUrls],
    cacheStatus: authoredUpgradeCacheStatus(job),
    estimatedBytes: job.estimatedBytes,
    startedAtMs: monotonicNow(),
    endedAtMs: null,
    durationMs: null,
    status: 'running',
    backgroundJobId: backgroundJob?.backgroundJobId ?? null,
    backgroundJobOrigin: backgroundJob ? { ...backgroundJob.origin } : null,
  };
  state.diagnostics.jobs.push(diagnostic);
  if (state.diagnostics.jobs.length > 128) state.diagnostics.jobs.splice(0, state.diagnostics.jobs.length - 128);
  state.diagnostics.activeJobs++;
  state.diagnostics.maxConcurrentJobs = Math.max(
    state.diagnostics.maxConcurrentJobs,
    state.diagnostics.activeJobs,
  );
  state.diagnostics.activePlannedBytes += job.estimatedBytes;
  state.diagnostics.peakActivePlannedBytes = Math.max(
    state.diagnostics.peakActivePlannedBytes,
    state.diagnostics.activePlannedBytes,
  );
  publishUpgradeDiagnostics(state, job.renderer);
  return diagnostic;
}

function finishUpgradeDiagnostic(state, job, diagnostic) {
  diagnostic.endedAtMs = monotonicNow();
  diagnostic.durationMs = Math.max(0, diagnostic.endedAtMs - diagnostic.startedAtMs);
  diagnostic.transferBytes = resourceBytesForUrls(job.assetUrls);
  const perf = job.perfBackgroundJobOwner;
  if (perf && typeof perf.endBackgroundJob === 'function' && job.perfBackgroundJob) {
    try { perf.endBackgroundJob(job.perfBackgroundJob, diagnostic.status); } catch { /* evidence only */ }
  }
  job.perfBackgroundJob = null;
  job.perfBackgroundJobOwner = null;
  state.diagnostics.activeJobs = Math.max(0, state.diagnostics.activeJobs - 1);
  state.diagnostics.activePlannedBytes = Math.max(
    0,
    state.diagnostics.activePlannedBytes - job.estimatedBytes,
  );
  publishUpgradeDiagnostics(state, job.renderer);
}

function recordUpgradeCancellation(state, job) {
  if (!state || !state.diagnostics || !job || job.diagnosticCancellationRecorded) return;
  job.diagnosticCancellationRecorded = true;
  state.diagnostics.jobs.push({
    sequence: job.sequence,
    key: typeof job.key === 'string' ? job.key : 'boundary',
    entityId: job.entity && job.entity.id,
    entityType: job.entity && job.entity.type || null,
    priority: authoredUpgradePriority(job),
    modeAtStart: authoredRuntimeState() && authoredRuntimeState().mode || null,
    assetUrls: [...(job.assetUrls || [])],
    cacheStatus: authoredUpgradeCacheStatus(job),
    estimatedBytes: job.estimatedBytes || 0,
    startedAtMs: null,
    endedAtMs: monotonicNow(),
    durationMs: 0,
    status: 'cancelled-before-load',
  });
  publishUpgradeDiagnostics(state, job.renderer);
}

function resourceBytesForUrls(urls) {
  if (!globalThis.performance || typeof globalThis.performance.getEntriesByName !== 'function') return 0;
  let bytes = 0;
  for (const url of urls || []) {
    const entries = globalThis.performance.getEntriesByName(url);
    const resource = entries && entries[entries.length - 1];
    bytes += Number(resource && (resource.decodedBodySize || resource.transferSize)) || 0;
  }
  return bytes;
}

function publishUpgradeDiagnostics(state, renderer = null) {
  const decode = renderer && decodeAdmissionDiagnosticsByRenderer.get(renderer);
  if (decode) {
    state.diagnostics.maxConcurrentDecode = Math.max(state.diagnostics.maxConcurrentDecode, decode.maxConcurrent);
    state.diagnostics.partLoads = decode.loads.slice(-128);
  } else if (state.diagnostics.jobs.length > 0) {
    // The renderer admission lane is serial by construction even when a custom probe job bypasses it.
    state.diagnostics.maxConcurrentDecode = Math.max(state.diagnostics.maxConcurrentDecode, 1);
  }
  if (state.scene && state.scene.userData) state.scene.userData.authoredUpgradeDiagnostics = state.diagnostics;
}

function jobStillNeeded(state, job) {
  if (!state || !job || !job.boundary) return false;
  if (!boundaryBelongsToScene(job.boundary, state.scene)) return false;
  const entity = job.entity;
  if (!entity || entity.alive === false) return false;
  // Once render ownership has published a mesh, only its active boundary may consume residency.
  // Station HLOD publishes an outer wrapper while the authored boundary remains nested below its
  // detailed root; a replaced or sector-transition boundary will no longer descend from that mesh.
  if (entity.mesh && !boundaryBelongsToEntityMesh(job.boundary, entity.mesh)) return false;
  return true;
}

function boundaryBelongsToEntityMesh(boundary, entityMesh) {
  for (let node = boundary; node; node = node.parent) {
    if (node === entityMesh) return true;
  }
  return false;
}

function boundaryBelongsToScene(boundary, scene) {
  for (let node = boundary; node; node = node.parent) {
    if (node === scene) return true;
  }
  return false;
}

export function getAuthoredUpgradeQueueStats(scene) {
  const state = scene && upgradeQueuesByScene.get(scene);
  return {
    pending: state ? state.jobs.length : 0,
    running: !!(state && state.running),
  };
}

export function preloadAuthoredPartLibrary(renderer, options = {}) {
  return loadCanonicalLibrary(renderer, options);
}

/** Flight may start when the visuals guaranteed to be in the opening composition are authored.
 * Other traffic and hostile ships remain quality-preserving on-demand upgrades and cannot hold the
 * player behind a global queue drain. */
export function authoredCriticalVisualReadiness(state) {
  const entities = state && state.entities;
  const player = entities && typeof entities.get === 'function'
    ? entities.get(state.playerId)
    : (state && state.entityList || []).find((entity) => entity && entity.id === state.playerId);
  const playerStatus = authoredAssetState(player);
  const currentSectorId = state && state.world && state.world.currentSectorId;
  const isStartingSector = currentSectorId === 'sector_helios_prime';
  const entityList = state && state.entityList || (entities && typeof entities.values === 'function'
    ? [...entities.values()]
    : []);
  const hub = isStartingSector ? entityList.find(isCriticalStartingHub) : null;
  const needsStartingHub = !!(hub && isOpeningFlightGateEntity(hub, state));
  const hubStatus = hub ? authoredAssetState(hub) : 'not-present';
  const openingAssets = entityList
    .filter((entity) => isInitialAuthoredCompositionEntity(entity, state))
    .map((entity) => ({ id: entity.id, type: entity.type, status: authoredAssetState(entity) }));
  const openingPending = openingAssets.filter((entry) => (
    !isFlightReadyStatus(entry.status)
    && !authoredOpeningFailedClosed(entry.status)
  ));
  const openingPipelinePending = openingAssets.filter((entry) => (
    !authoredPipelineStaged(entry.status) && !authoredOpeningFailedClosed(entry.status)
  ));
  const gateIds = new Set(
    entityList.filter((entity) => isOpeningFlightGateEntity(entity, state)).map((entity) => entity.id),
  );
  const openingGatePending = openingPending.filter((entry) => gateIds.has(entry.id));
  const openingGatePipelinePending = openingPipelinePending.filter((entry) => gateIds.has(entry.id));
  // Startup admission is an explicit set, not an inference from every object inside the opening
  // radius. This keeps nearby traffic and far place detail streamable while retaining the player
  // flight package and the gameplay shell needed for control/docking. A caller may opt an entity
  // into the set with flightReadyRole when it truly owns a first-frame contract (for example a
  // glass actor or a collision shell); ordinary opening-composition entities remain diagnostics.
  const readySet = createFlightReadySet();
  const blockingPipeline = [];
  const requireRole = (role, status, entity = null) => {
    if (!readySet.requireRole(role, status, entity && { id: entity.id, type: entity.type })) return;
    blockingPipeline.push({ kind: 'role', role, status, pipeline: authoredPipelineStaged(status) });
  };
  requireRole(FLIGHT_READY_ROLE.PLAYER_GAMEPLAY, playerStatus, player);
  requireRole(FLIGHT_READY_ROLE.PLAYER_FLIGHT_PACKAGE, playerStatus, player);

  let startingHubLayer = null;
  if (needsStartingHub) {
    startingHubLayer = selectPlacePackageLayer({ onRunway: true, interactable: true })
      || PLACE_PACKAGE_LAYER.GAMEPLAY_SHELL;
    if (isPlaceLayerBlockingFlightReady(startingHubLayer)) {
      readySet.requirePlace(
        hub.id,
        startingHubLayer,
        hubStatus,
        { type: hub.type, role: FLIGHT_READY_ROLE.TABLE_STATION_SHELL },
      );
      blockingPipeline.push({
        kind: 'place',
        id: hub.id,
        layer: startingHubLayer,
        status: hubStatus,
        pipeline: authoredPipelineStaged(hubStatus),
      });
    }
  }

  for (const entity of entityList) {
    const data = entity && entity.data || {};
    const allowRuntimeActivityGate = state && state.mode !== 'loading';
    const frameGlassIds = state && state.render && state.render.activityFrame
      && state.render.activityFrame.renderGlassIds;
    const isCurrentGlass = allowRuntimeActivityGate && (
      frameGlassIds && typeof frameGlassIds.has === 'function'
        ? frameGlassIds.has(entity.id)
        : Array.isArray(frameGlassIds) && frameGlassIds.includes(entity.id)
    );
    const role = entity && (entity.flightReadyRole || data.flightReadyRole
      || data.renderFlightReadyRole || data.render && data.render.flightReadyRole
      || (isCurrentGlass || (allowRuntimeActivityGate
        && entity.activity?.presentationTier === PRESENTATION_TIER.R0_GLASS)
        ? FLIGHT_READY_ROLE.GLASS_ACTORS : null));
    if (!role || role === FLIGHT_READY_ROLE.PLAYER_GAMEPLAY
        || role === FLIGHT_READY_ROLE.PLAYER_FLIGHT_PACKAGE) continue;
    const status = authoredAssetState(entity);
    if (readySet.requireRole(role, status, { id: entity.id, type: entity.type })) {
      blockingPipeline.push({ kind: 'role', role, status, pipeline: authoredPipelineStaged(status) });
    }
  }
  readySet.seal();
  const flightReadyBlockers = readySet.blockers();
  const softwareRenderer = !!(state && state.render && state.render.gpu
    && state.render.gpu.tier === 'software');
  const pipelineReady = blockingPipeline.every((entry) => entry.pipeline);
  return {
    pipelineReady,
    ready: readySet.isReady(),
    playerId: player && player.id,
    playerStatus,
    startingHubId: hub && hub.id,
    startingHubStatus: hubStatus,
    startingHubRequired: needsStartingHub,
    startingHubLayer,
    flightReady: readySet.snapshot(),
    flightReadyBlockers,
    openingAssets,
    openingPending,
    openingPipelinePending,
    openingGatePending,
    openingGatePipelinePending,
    // Compatibility diagnostic. The production gate is the explicit FlightReadySet above rather
    // than the old boolean that widened to the entire opening composition on hardware.
    openingGateApplies: false,
    softwareRenderer,
  };
}

function authoredPipelineStaged(status) {
  return status === 'compiling-pipelines'
    || status === 'authored'
    || status === 'authored-with-cleanup-error'
    || status === 'authored-prepared'
    || status === 'same-semantic-fallback-prepared'
    || status === 'shell-ready';
}

// Nearby traffic that already failed admission will never become authored. Holding the whole
// opening set for those ships used to refuse New Game/Continue forever on real hardware while the
// player ship was already compiling.
function authoredOpeningFailedClosed(status) {
  return status === 'unavailable'
    || status === 'procedural-settled'
    || status === 'fallback-after-error'
    || status === 'cancelled-before-load'
    || status === 'orphaned-before-swap'
    || status === 'orphaned-after-pipeline-compile';
}

function authoredAssetState(entity) {
  return entity && entity.mesh && entity.mesh.userData
    ? entity.mesh.userData.authoredAssetState
    : 'missing';
}

function isCriticalStartingHub(entity) {
  if (!entity || entity.alive === false || entity.type !== 'station') return false;
  const data = entity.data || {};
  if (entity.id === 'station_helios' || data.stationId === 'station_helios') return true;
  const token = String(data.archetypeGlb || data.placeId || '').replace(/^places\//, '').replace(/\.glb$/, '');
  return token === 'place_station_trade_hub' && data.sectorId === 'sector_helios_prime';
}

export function preloadAuthoredAssetsForEntity(renderer, entity, options = {}) {
  return ensureEntityLibrary(renderer, entity, options);
}

/** GPU admission gate shared by ships and authored world places. Composition may finish on the CPU
 * while the driver's exact HDR material programs or hidden-LOD textures are still absent; do not
 * publish that object until both preparations settle. Preview/test harnesses without live GPU
 * preparation hooks remain supported. */
export async function prepareAuthoredVisualPipelines(root, options = {}) {
  const preparePipelines = options && options.prepareAuthoredPipelines;
  const prepareResidency = options && options.prepareAuthoredGpuResidency;
  if (typeof preparePipelines !== 'function' && typeof prepareResidency !== 'function') {
    return { skipped: true, reason: 'GPU preparation unavailable' };
  }
  // Admission must compile the exact material state used by the first visible draw. These same
  // idempotent policies also run at the presentation boundary, but applying them only after this
  // detached-root compile changes the program key and leaves the first draw to link synchronously.
  assertAuthoredVisualPreparationActive(options, 'before-material-policy');
  configureRealtimeCanopyMaterials(root);
  configureTransparentSinglePassSurfaces(root);
  const tier1 = tier1CausalCounters();
  if (tier1) {
    tier1.countPipelinePreparation('material-policies', 1);
    if (typeof preparePipelines === 'function') tier1.countPipelinePreparation('compile-pipelines', 1);
    if (typeof prepareResidency === 'function') tier1.countPipelinePreparation('gpu-residency', 1);
  }
  const pipelines = typeof preparePipelines === 'function'
    ? await preparePipelines(root)
    : { skipped: true, reason: 'pipeline compiler unavailable' };
  assertAuthoredVisualPreparationActive(options, 'after-pipeline-compile');
  if (options.yieldBetweenGpuStages === true && typeof options.yieldToNextPresent === 'function') {
    await options.yieldToNextPresent();
    assertAuthoredVisualPreparationActive(options, 'after-present-yield');
  }
  const gpuResidency = typeof prepareResidency === 'function'
    ? await prepareResidency(root, {
        isResidencyOwnerActive: options.isResidencyOwnerActive,
      })
    : { skipped: true, reason: 'GPU residency uploader unavailable' };
  assertAuthoredVisualPreparationActive(options, 'after-gpu-residency');
  return {
    skipped: pipelines?.skipped === true && gpuResidency?.skipped === true,
    pipelines,
    gpuResidency,
  };
}

function assertAuthoredVisualPreparationActive(options, phase) {
  const isActive = options && options.isResidencyOwnerActive;
  if (typeof isActive === 'function' && isActive() !== true) {
    throw new Error(`Authored visual preparation owner became inactive ${phase}`);
  }
}

async function prepareAuthoredShipVisualPipelines(authored, options = {}) {
  const poolAdmissions = Array.isArray(authored?.packagePoolAdmissions)
    ? authored.packagePoolAdmissions
    : EMPTY_ARRAY;
  const preparations = [prepareAuthoredVisualPipelines(authored.root, options)];
  for (const admission of poolAdmissions) {
    preparations.push(prepareRenderPackagePoolAdmission(admission, options));
  }
  // A first rejection must not release an owner while sibling compile/upload work is still touching
  // its resources. Settle the complete admission group, then either fail/clean it as one unit or
  // publish every prepared pool. Sector-entry staging deliberately defers that publication so an
  // incoming hidden owner cannot suppress a current-sector direct candidate during jump charge.
  const outcomes = await Promise.allSettled(preparations);
  const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
  if (failures.length) {
    throw new AggregateError(
      failures.map((outcome) => outcome.reason),
      'Authored ship pipeline admission failed',
    );
  }
  if (options.deferPackagePoolActivation !== true) {
    for (const admission of poolAdmissions) activateRenderPackagePoolAdmission(admission);
  }
  return outcomes[0].value;
}

export async function retryAuthoredPartLibrary(renderer, options = {}) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const cacheKey = libraryCacheKey(partRoot, options);
  const promises = renderer && libraryByRenderer.get(renderer);
  const resolved = renderer && resolvedLibraryByRenderer.get(renderer);
  if (promises) promises.delete(cacheKey);
  if (resolved) resolved.delete(cacheKey);
  await invalidateFailedAuthoredAssets(renderer);
  return loadCanonicalLibrary(renderer, options);
}

async function upgradeBoundary(boundary, fallbackRoot, entity, renderer, scene, options, setActive, prefetchedLibrary = null) {
  let swapped = false;
  let authored = null;
  try {
    if (!mayComposeAuthoredShipLive({
      ...options,
      fallbackRoot,
      emptyAdmissionSubstrate: isEmptyAdmissionSubstrate(fallbackRoot),
    })) {
      settleAuthoredShipToProceduralFallback(
        boundary,
        fallbackRoot,
        entity,
        setActive,
        'flight-compose-gated',
      );
      releaseBoundaryResidency(renderer, boundary, 'flight-compose-gated');
      const tier1 = tier1CausalCounters();
      if (tier1) tier1.countAuthoredAdmissionJob('flight-compose-gated');
      return false;
    }
    const library = await (prefetchedLibrary || preloadAuthoredAssetsForEntity(renderer, entity, options));
    const compositionStartedAtMs = monotonicNow();
    try {
      authored = buildComposedShip(entity, library, scene, boundary, options);
    } finally {
      recordAdmissionSlice(compositionStartedAtMs, 'compose');
      const tier1 = tier1CausalCounters();
      if (tier1) tier1.countAuthoredAdmissionJob('composition');
    }
    if (!authored) {
      boundary.userData.authoredAssetState = 'unavailable';
      boundary.userData.authoredVisualRoot = 'none-build-failed';
      setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
      releaseBoundaryResidency(renderer, boundary, 'authored-composition-unavailable');
      return false;
    }
    registerPreparedAuthoredAdmission(scene, boundary, authored);
    if (options.deferBoundaryPublication === true) {
      installPreparedBoundaryDisposer(boundary, () => (
        disposePreparedShipBoundaryResources(boundary, authored)
      ));
    }
    boundary.userData.authoredAssetState = 'compiling-pipelines';
    const completeAdmission = async () => {
      let pipelineReady;
      const pipelineStartedAtMs = monotonicNow();
      try {
        pipelineReady = prepareAuthoredShipVisualPipelines(authored, options);
      } finally {
        recordAdmissionSlice(pipelineStartedAtMs);
        const tier1 = tier1CausalCounters();
        if (tier1) tier1.countAuthoredAdmissionJob('pipeline-prepare');
      }
      await pipelineReady;
      const commitStartedAtMs = monotonicNow();
      try {
        swapped = await commitAuthoredBoundary(
          boundary, fallbackRoot, entity, library, scene, options, setActive, authored,
        );
        if (swapped) {
          installWholeShipLodFamilyController(boundary, entity, setActive, {
            ...options,
            renderer,
            scene,
          });
        }
      } finally {
        recordAdmissionSlice(commitStartedAtMs);
        const tier1 = tier1CausalCounters();
        if (tier1) tier1.countAuthoredAdmissionJob('commit');
      }
      if (!swapped) releaseBoundaryResidency(renderer, boundary, 'authored-swap-not-committed');
      return swapped;
    };
    if (options.overlapAuthoredPipelineCompile === true) {
      const pending = completeAdmission().catch(async (error) => {
        await handleAuthoredBoundaryAdmissionError(boundary, entity, renderer, swapped, error, authored);
        return false;
      });
      boundary.userData.authoredPipelineReady = pending;
      const onAuthoredPipelineStaged = options.onAuthoredPipelineStaged;
      if (typeof onAuthoredPipelineStaged === 'function') {
        delete options.onAuthoredPipelineStaged;
        onAuthoredPipelineStaged();
      }
      return pending;
    }
    return await completeAdmission();
  } catch (error) {
    await handleAuthoredBoundaryAdmissionError(boundary, entity, renderer, swapped, error, authored);
    return false;
  }
}

async function handleAuthoredBoundaryAdmissionError(boundary, entity, renderer, swapped, error, authored = null) {
  if (!swapped) {
    releaseBoundaryResidency(renderer, boundary, 'authored-swap-failed');
    const cleanupErrors = [];
    const preparedDisposal = disposePreparedAuthoredBoundary(boundary);
    if (preparedDisposal !== false) {
      try { await preparedDisposal; } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    } else {
      try { await releaseOwnerInstances(boundary); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
      if (authored && authored.root) {
        try { await disposePreparedAuthoredShip(authored); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
      }
    }
    // Fail closed: no substitute ship identity. Fix the load/composition bug; do not invent a junk hull.
    boundary.userData.authoredAssetState = 'unavailable';
    boundary.userData.authoredVisualRoot = 'none-build-failed';
    setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
    console.warn('[partsLibrary] authored composition failed; no substitute visual published', error);
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], 'Authored composition failure cleanup failed', {
        cause: error,
      });
    }
  } else {
    boundary.userData.authoredAssetState = 'authored-with-cleanup-error';
    console.warn('[partsLibrary] authored ship is live, but post-swap bookkeeping failed', error);
  }
}

async function disposePreparedAuthoredShip(authored) {
  const root = authored && authored.root;
  if (!root) return false;
  if (authored.preparedCleanupComplete === true) return false;
  const completed = authored.preparedCleanupCompleted || new Set();
  authored.preparedCleanupCompleted = completed;
  const cleanupErrors = [];
  const attempt = async (key, cleanup) => {
    if (completed.has(key)) return;
    try {
      await cleanup();
      completed.add(key);
    }
    catch (error) { cleanupErrors.push(error); }
  };
  for (const instance of authored.renderPackageInstances || EMPTY_ARRAY) {
    await attempt(instance, () => instance?.dispose?.('authored-ship-preparation-failed'));
  }
  for (const object of authored.ownerLocalObjects || EMPTY_ARRAY) {
    await attempt(object, () => object?.dispose?.());
  }
  for (const geometry of authored.ownerLocalGeometries || EMPTY_ARRAY) {
    await attempt(geometry, () => geometry?.dispose?.());
  }
  for (const material of authored.ownerLocalMaterials || EMPTY_ARRAY) {
    await attempt(material, () => material?.dispose?.());
  }
  if (typeof authored.releaseFlightTemplate === 'function') {
    await attempt(authored.releaseFlightTemplate, () => authored.releaseFlightTemplate('authored-ship-preparation-failed'));
  }
  await attempt(root, () => root.clear());
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, 'Prepared authored ship cleanup failed');
  }
  unregisterPreparedAuthoredAdmission(authored);
  authored.preparedCleanupComplete = true;
  return true;
}

async function disposePreparedShipBoundaryResources(boundary, authored) {
  const cleanupErrors = [];
  try { await releaseOwnerInstances(boundary); } catch (error) { cleanupErrors.push(error); }
  try { await disposePreparedAuthoredShip(authored); } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, 'Prepared authored boundary cleanup failed');
  }
  return true;
}

function installPreparedBoundaryDisposer(boundary, dispose) {
  if (!boundary?.userData || typeof dispose !== 'function') return false;
  let completion = null;
  boundary.userData.__disposePreparedAuthoredBoundary = () => {
    if (completion) return completion;
    completion = Promise.resolve().then(dispose).then(
      (result) => {
        delete boundary.userData.__disposePreparedAuthoredBoundary;
        return result !== false;
      },
      (error) => {
        completion = null;
        throw error;
      },
    );
    completion.catch(() => null);
    return completion;
  };
  return true;
}

export function disposePreparedAuthoredBoundary(boundary) {
  const dispose = boundary?.userData?.__disposePreparedAuthoredBoundary;
  return typeof dispose === 'function' ? dispose() : false;
}

/** Publish an exact boundary prepared while its final scene owner was hidden. Package-pool proxy
 * activation and presentation admission are deliberately one transaction at the reveal boundary. */
export function publishPreparedAuthoredBoundary(boundary) {
  const publish = boundary && boundary.userData && boundary.userData.__publishPreparedAuthoredBoundary;
  if (typeof publish === 'function') return publish();
  const state = boundary && boundary.userData && boundary.userData.authoredAssetState;
  return state === 'authored' || state === 'same-semantic-fallback';
}

function installPreparedBoundaryPublisher(boundary, publish) {
  let published = false;
  boundary.userData.__publishPreparedAuthoredBoundary = () => {
    if (published) return true;
    const result = publish();
    if (result === false) return false;
    published = true;
    delete boundary.userData.__publishPreparedAuthoredBoundary;
    return true;
  };
}

/**
 * Pilot: ship_wasp separate-file LOD family. LOD0 remains the admitted root; demotion lazily
 * composes LOD1/LOD2 behind the whole-ship-lod-family residency role and swaps without blanking.
 */
function installWholeShipLodFamilyController(boundary, entity, setActive, options = {}) {
  if (!boundary || !entity || entity.isPlayer === true) return false;
  const selection = wholeShipVisualForEntity(entity, { ...options, requiredWholeShip: true });
  const family = selection && selection.lodFamily;
  if (!canInstallWholeShipLodFamily(entity, selection)) return false;
  if (boundary.userData.wholeShipLodFamilyInstalled) return false;

  const roots = Object.create(null);
  let activeLevel = 'lod0';
  let pendingLevel = null;
  // Whole-ship LOD demotions are intentionally started from the normal per-frame selector, but
  // their async replacement must remain visible to the startup first-picture barrier. Keep the
  // exact in-flight transition on the stable boundary; this does not change when steady-flight
  // work is scheduled or how it is selected.
  let transitionPromise = null;
  const findActiveRoot = () => {
    for (const child of boundary.children || []) {
      if (child && child.visible !== false && child.userData && child.userData.authoredVisualRoot !== 'procedural-fallback') {
        return child;
      }
    }
    return boundary.children && boundary.children[0] || null;
  };
  roots.lod0 = findActiveRoot();
  if (!roots.lod0) return false;

  const baseUpdate = boundary.userData.updateLod;
  boundary.userData.wholeShipLodFamily = family;
  boundary.userData.wholeShipLodFamilyInstalled = true;
  boundary.userData.wholeShipLodActiveLevel = 'lod0';

  const swapTo = (level) => {
    const next = roots[level];
    if (!next) return false;
    const prev = roots[activeLevel];
    if (prev && prev !== next) {
      prev.visible = false;
      if (prev.parent === boundary) boundary.remove(prev);
    }
    next.visible = true;
    if (next.parent !== boundary) boundary.add(next);
    if (typeof setActive === 'function') setActive(next);
    activeLevel = level;
    boundary.userData.wholeShipLodActiveLevel = level;
    return true;
  };

  boundary.userData.updateLod = (level) => {
    const requested = normalizeRequestedLod(level);
    if (typeof baseUpdate === 'function') baseUpdate(requested);
    const transition = resolveWholeShipLodTransition(activeLevel, requested, {
      residentReady: !!roots[requested],
      pendingLevel,
      attached: !!boundary.parent,
    });
    pendingLevel = transition.pendingLevel;
    if (transition.action === 'swap') {
      swapTo(transition.level);
      return;
    }
    if (transition.action !== 'load') return;
    const renderer = options.renderer;
    const scene = options.scene || boundary.parent;
    if (!renderer || !scene) {
      pendingLevel = null;
      return;
    }
    const file = packagedLiveWholeShipFile(family[requested]);
    if (!file) {
      pendingLevel = null;
      return;
    }
    const lodLoad = (async () => {
      try {
        const library = await preloadAuthoredAssetsForEntity(renderer, entity, {
          ...options,
          requiredWholeShip: true,
          forceWholeShipFile: file,
          bootstrapPlan: authoredPreloadPlanForEntityAtLod(entity, requested, options),
          residencyRole: 'whole-ship-lod-family',
        });
        const publicationWait = waitForOpeningGraphPublicationRelease();
        if (publicationWait) await publicationWait;
        if (!shouldCommitWholeShipLodLoad(pendingLevel, requested, !!boundary.parent)) return;
        const composed = buildComposedShip(entity, library, scene, boundary, {
          ...options,
          requiredWholeShip: true,
          forceWholeShipFile: file,
          residencyRole: 'whole-ship-lod-family',
        });
        if (!composed || !composed.root) return;
        composed.root.visible = false;
        roots[requested] = composed.root;
        if (shouldCommitWholeShipLodLoad(pendingLevel, requested, !!boundary.parent)) swapTo(requested);
      } catch (error) {
        console.warn('[partsLibrary] whole-ship LOD demotion failed; keeping active level', error);
      } finally {
        if (pendingLevel === requested) pendingLevel = null;
      }
    })();
    transitionPromise = lodLoad;
    boundary.userData.wholeShipLodTransitionPromise = lodLoad;
    // The transition currently catches its own load/build failures, but keep cleanup safe if a
    // future implementation allows a rejection to escape. Identity-checking prevents an older
    // transition from clearing a newer request published on the same boundary.
    void lodLoad.then(
      () => {
        if (transitionPromise === lodLoad) transitionPromise = null;
        if (boundary.userData.wholeShipLodTransitionPromise === lodLoad) {
          boundary.userData.wholeShipLodTransitionPromise = null;
        }
      },
      () => {
        if (transitionPromise === lodLoad) transitionPromise = null;
        if (boundary.userData.wholeShipLodTransitionPromise === lodLoad) {
          boundary.userData.wholeShipLodTransitionPromise = null;
        }
      },
    );
  };
  return true;
}

async function commitAuthoredBoundary(
  boundary, fallbackRoot, entity, library, scene, options, setActive, preparedAuthored = null,
) {
  const publicationWait = waitForOpeningGraphPublicationRelease();
  if (publicationWait) await publicationWait;
  if (!boundary.parent) {
    if (preparedAuthored) {
      await disposePreparedShipBoundaryResources(boundary, preparedAuthored);
    }
    return false; // destroyed while assets or GPU programs were in flight
  }

  const liveComposeOptions = {
    ...options,
    fallbackRoot,
    emptyAdmissionSubstrate: isEmptyAdmissionSubstrate(fallbackRoot),
  };
  const authored = preparedAuthored || (
    mayComposeAuthoredShipLive(liveComposeOptions)
      ? buildComposedShip(entity, library, scene, boundary, options)
      : null
  );
  if (!authored) {
    if (!preparedAuthored && !mayComposeAuthoredShipLive(liveComposeOptions)) {
      settleAuthoredShipToProceduralFallback(
        boundary,
        fallbackRoot,
        entity,
        setActive,
        'flight-compose-gated-commit',
      );
      return false;
    }
    boundary.userData.authoredAssetState = 'unavailable';
    boundary.userData.authoredVisualRoot = 'none-build-failed';
    setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
    return false;
  }
  if (options.deferBoundaryPublication === true
      && typeof boundary.userData.__disposePreparedAuthoredBoundary !== 'function') {
    installPreparedBoundaryDisposer(boundary, () => (
      disposePreparedShipBoundaryResources(boundary, authored)
    ));
  }
  if (!boundary.parent) {
    if (options.deferBoundaryPublication === true) await disposePreparedAuthoredBoundary(boundary);
    else await disposePreparedShipBoundaryResources(boundary, authored);
    return false;
  }

  const oldHull = fallbackRoot.userData && fallbackRoot.userData.hull;
  const newHull = authored.root.userData && authored.root.userData.hull;
  if (oldHull && newHull) newHull.rotation.x = oldHull.rotation.x;
  primeAuthoredState(authored.root, fallbackRoot, entity);

  // Publish exactly one identity after the authored payload and bindings exist. The hidden substrate
  // is never a live readability layer and cannot turn a box or blue-clay body into a different ship.
  boundary.remove(fallbackRoot);
  boundary.add(authored.root);
  unregisterPreparedAuthoredAdmission(authored);
  setActive(authored.root);

  boundary.userData.authoredReadableFallbackRetained = false;
  boundary.userData.authoredVisualRoot = 'authored-root';
  boundary.userData.authoredParts = authored.authoredParts;
  boundary.userData.authoredSlots = authored.authoredSlots;
  boundary.userData.proceduralFallbackParts = authored.fallbackParts;
  boundary.userData.authoredCompositionId = authored.root.userData.assetId;
  boundary.userData.authoredRenderContract = authored.root.userData.renderContract;
  boundary.userData.assetId = authored.root.userData.assetId;
  boundary.userData.renderContract = authored.root.userData.renderContract;
  boundary.userData.__socketCache = new Map(); // invalidate renderer socket lookups across the swap

  const publish = () => {
    for (const admission of authored.packagePoolAdmissions || EMPTY_ARRAY) {
      activateRenderPackagePoolAdmission(admission);
    }
    boundary.userData.authoredAssetState = 'authored';
    setPresentationAdmission(entity, PRESENTATION_ADMISSION.ready);
    if (typeof options.onSwap === 'function') {
      try { options.onSwap({ boundary, root: authored.root, authoredRoot: authored.root, entity, authoredParts: authored.authoredParts }); }
      catch (error) { console.warn('[partsLibrary] authored swap callback failed', error); }
    }
    return true;
  };
  if (options.deferBoundaryPublication === true) {
    boundary.userData.authoredAssetState = 'authored-prepared';
    installPreparedBoundaryPublisher(boundary, publish);
  } else {
    publish();
  }

  try { disposeDetachedObject(fallbackRoot); }
  catch (error) { console.warn('[partsLibrary] fallback cleanup failed after a successful authored swap', error); }
  return true;
}

function shouldRetainReadableFallback(fallbackRoot, entity, authored) {
  // The starter Kestrel has a bespoke hero body that is the intended readable player ship. The
  // modular GLB layer may add hardware detail, but it must not replace that body with the older
  // rounded modular silhouette during live play.
  const assetId = fallbackRoot && fallbackRoot.userData && fallbackRoot.userData.assetId;
  if (assetId === KESTREL_HERO_ASSET_ID && authored && authored.wholeShip === true) return false;
  return assetId === KESTREL_HERO_ASSET_ID;
}

function markReadableFallbackLayer(fallbackRoot) {
  fallbackRoot.userData = fallbackRoot.userData || {};
  fallbackRoot.userData.authoredReadableFallbackLayer = true;
  const heroBody = fallbackRoot.userData.assetId === KESTREL_HERO_ASSET_ID;
  fallbackRoot.traverse((object) => {
    if (!object) return;
    object.userData = object.userData || {};
    object.userData.authoredReadableFallbackLayer = true;
    if (heroBody && object.isMesh) {
      object.userData.spacefaceAuthoredHeroBody = true;
      if (!object.userData.spacefacePartUrl) object.userData.spacefacePartUrl = 'hero/kestrel_borrowed_time';
    }
  });
}

function suppressAuthoredReadableSilhouette(authoredRoot) {
  if (!authoredRoot || typeof authoredRoot.traverse !== 'function') return;
  authoredRoot.userData = authoredRoot.userData || {};
  authoredRoot.userData.authoredReadableSilhouetteSuppressed = true;
  authoredRoot.traverse((object) => {
    if (!object || !object.userData) return;
    const urls = Array.isArray(object.userData.spacefacePartUrls)
      ? object.userData.spacefacePartUrls
      : (object.userData.spacefacePartUrl ? [object.userData.spacefacePartUrl] : []);
    const isHullSilhouette = object.userData.spacefaceReadabilityCore
      || urls.some((url) => String(url || '').includes('/hulls/') || String(url || '').includes('readability/'));
    if (!isHullSilhouette) return;
    object.visible = false;
    object.userData.authoredSuppressedByReadableFallback = true;
  });
}


function primeAuthoredState(authoredRoot, fallbackRoot, entity) {
  const previousLod = fallbackRoot.userData && fallbackRoot.userData.lod;
  const nextLod = authoredRoot.userData && authoredRoot.userData.lod;
  if (nextLod && Number.isFinite(previousLod && previousLod.lastPx)) {
    let level = nextLod.level;
    // The shared resolver moves one hysteresis boundary per call. Two passes can transfer lod0→lod2
    // without exposing a one-frame high-detail flash when an off-screen ship finishes loading.
    for (let i = 0; i < 2; i++) level = nextLod.resolve(previousLod.lastPx);
    if (typeof authoredRoot.userData.updateLod === 'function') authoredRoot.userData.updateLod(level);
  }
  if (typeof authoredRoot.userData.updateDamageState === 'function') {
    const now = globalThis.performance && typeof globalThis.performance.now === 'function'
      ? globalThis.performance.now() : Date.now();
    authoredRoot.userData.updateDamageState(entity, now);
  }
}

function syncActiveSurface(boundary, active) {
  const data = active && active.userData ? active.userData : {};
  boundary.userData.hull = data.hull || active;
  boundary.userData.lod = data.lod || null;
  boundary.userData.damageParts = data.damageParts;
  boundary.userData.damageState = data.damageState;
  boundary.userData.hullFrac = data.hullFrac;
  boundary.userData.shieldBubble = data.shieldBubble || null;
}

function loadCanonicalLibrary(renderer, options = {}) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const bootstrapPlan = bootstrapPlanForOptions(options);
  const cacheKey = libraryCacheKey(partRoot, options, bootstrapPlan);
  let promises = libraryByRenderer.get(renderer);
  if (!promises) {
    promises = new Map();
    libraryByRenderer.set(renderer, promises);
  }
  let promise = promises.get(cacheKey);
  if (!promise) {
    const bootstrapOwner = bootstrapResidencyOwner(renderer);
    const pending = loadPlanIntoLibrary(renderer, {
      ...options,
      residencyOwner: bootstrapOwner,
      residencyRole: 'bootstrap',
      sectorId: 'sector_helios_prime',
      isResidencyOwnerActive: () => true,
    }, new Map(), bootstrapPlan)
      .then((loaded) => {
        const library = assertLibraryPlanUsable(loaded, bootstrapPlan, options.libraryScope);
        let resolved = resolvedLibraryByRenderer.get(renderer);
        if (!resolved) {
          resolved = new Map();
          resolvedLibraryByRenderer.set(renderer, resolved);
        }
        resolved.set(cacheKey, library);
        return library;
      });
    promise = pending.catch((error) => {
      if (promises.get(cacheKey) === promise) promises.delete(cacheKey);
      throw error;
    });
    promises.set(cacheKey, promise);
  }
  return promise;
}

async function ensureEntityLibrary(renderer, entity, options = {}) {
  const library = await loadCanonicalLibrary(renderer, options);
  const plan = authoredPreloadPlanForEntity(entity, options);
  if (typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) {
    return library;
  }
  // Acquire any already-resident pieces before joining the serial decode lane. A live queued
  // boundary is an owner too; without this hold an earlier boundary can release the shared
  // generation while this request is waiting, forcing a needless re-decode or an incomplete plan.
  retainLibraryPlan(renderer, library, plan, options);
  await admitEntityPlan(renderer, options, library, plan);
  // Departure is a successful cancellation boundary, not an authored-asset failure. The caller
  // will observe its detached boundary and keep/discard the procedural root without warning.
  if (typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) {
    return library;
  }
  if (!libraryHasPreloadPlan(library, plan)) {
    throw new Error(`Authored entity assets are incomplete for ${entity && entity.id || 'unknown ship'}.`);
  }
  retainLibraryPlan(renderer, library, plan, options);
  return library;
}

function admitEntityPlan(renderer, options, library, plan) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  let lanes = planAdmissionByRenderer.get(renderer);
  if (!lanes) {
    lanes = new Map();
    planAdmissionByRenderer.set(renderer, lanes);
  }
  const previous = lanes.get(partRoot) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    // Re-check only after earlier demand has committed its records. Checking before joining the lane
    // permits duplicate decodes; copying slot arrays outside the lane permits last-writer data loss.
    if (!libraryHasPreloadPlan(library, plan)) {
      await loadPlanIntoLibrary(renderer, options, library, plan);
    }
    return library;
  });
  lanes.set(partRoot, task);
  const cleanup = () => {
    if (lanes.get(partRoot) === task) lanes.delete(partRoot);
  };
  return task.then((value) => {
    cleanup();
    return value;
  }, (error) => {
    cleanup();
    throw error;
  });
}

async function loadPlanIntoLibrary(renderer, options, library, plan) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const loadPart = options && typeof options.loadAuthoredPart === 'function'
    ? options.loadAuthoredPart
    : loadAuthoredPart;
  // Deliberately serial. GLB fetch is local and cheap; meshopt/KTX2 decode and GPU upload are the
  // expensive resident operations. Serial admission prevents renderer + GPU memory from rising by
  // hundreds of megabytes in one task while preserving the exact source assets.
  for (const [slot, files] of Object.entries(plan || {})) {
    const records = Array.isArray(library.get(slot)) ? library.get(slot).filter(recordIsResident) : [];
    for (const file of files || []) {
      if (records.some((record) => recordUrlEndsWith(record, file))) continue;
      if (typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) break;
      const url = `${partRoot}${file}`;
      const diagnostic = beginDecodeAdmission(renderer, url, slot);
      let record;
      try {
        record = await loadPart(url, {
          renderer,
          slot,
          optional: true,
          residencyOwner: options.residencyOwner,
          residencyRole: options.residencyRole,
          sectorId: options.sectorId,
          isResidencyOwnerActive: options.isResidencyOwnerActive,
        });
      } finally {
        finishDecodeAdmission(renderer, diagnostic);
      }
      if (record) records.push(record);
    }
    library.set(slot, records);
  }
  return library;
}

function decodeAdmissionDiagnostics(renderer) {
  if (!renderer) return null;
  let diagnostics = decodeAdmissionDiagnosticsByRenderer.get(renderer);
  if (!diagnostics) {
    diagnostics = { active: 0, maxConcurrent: 0, loads: [] };
    decodeAdmissionDiagnosticsByRenderer.set(renderer, diagnostics);
  }
  return diagnostics;
}

function beginDecodeAdmission(renderer, url, slot) {
  const diagnostics = decodeAdmissionDiagnostics(renderer);
  if (!diagnostics) return null;
  const entry = {
    url,
    slot,
    cacheStatus: 'library-miss',
    startedAtMs: monotonicNow(),
    endedAtMs: null,
    durationMs: null,
    transferBytes: 0,
  };
  diagnostics.active++;
  diagnostics.maxConcurrent = Math.max(diagnostics.maxConcurrent, diagnostics.active);
  diagnostics.loads.push(entry);
  if (diagnostics.loads.length > 128) diagnostics.loads.splice(0, diagnostics.loads.length - 128);
  return entry;
}

function finishDecodeAdmission(renderer, entry) {
  const diagnostics = renderer && decodeAdmissionDiagnosticsByRenderer.get(renderer);
  if (!diagnostics || !entry) return;
  entry.endedAtMs = monotonicNow();
  entry.durationMs = Math.max(0, entry.endedAtMs - entry.startedAtMs);
  entry.transferBytes = resourceBytesForUrls([entry.url]);
  diagnostics.active = Math.max(0, diagnostics.active - 1);
}

function libraryHasPreloadPlan(library, plan) {
  if (!(library instanceof Map)) return false;
  for (const [slot, files] of Object.entries(plan || {})) {
    const records = library.get(slot);
    if (!Array.isArray(records)) return false;
    for (const file of files || []) {
      if (!records.some((record) => recordUrlEndsWith(record, file))) return false;
    }
  }
  return true;
}

function recordUrlEndsWith(record, file) {
  if (!recordIsResident(record) || typeof record.url !== 'string' || !record.url) return false;
  const url = record.url.replace(/\\/g, '/').split(/[?#]/, 1)[0];
  return url.endsWith(file);
}

function recordIsResident(record) {
  return !!record && (!record.residency || record.residency.state === 'resident');
}

function bootstrapResidencyOwner(renderer) {
  let owner = renderer && bootstrapResidencyOwnersByRenderer.get(renderer);
  if (!owner && renderer) {
    owner = Object.freeze({ type: 'authored-bootstrap-library' });
    bootstrapResidencyOwnersByRenderer.set(renderer, owner);
  }
  return owner;
}

function retainLibraryPlan(renderer, library, plan, options = {}) {
  const owner = options.residencyOwner;
  const residency = owner && getAssetResidency(renderer);
  if (!residency || !(library instanceof Map)) return 0;
  if (typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) return 0;
  let retained = 0;
  for (const [slot, files] of Object.entries(plan || {})) {
    const records = library.get(slot) || [];
    for (const file of files || []) {
      const record = records.find((candidate) => recordUrlEndsWith(candidate, file));
      const key = record && record.residency && record.residency.key;
      if (key && residency.retain(key, owner, {
        role: options.residencyRole || 'live-boundary',
        sectorId: options.sectorId || null,
      })) retained++;
    }
  }
  handoffBootstrapIfCovered(renderer, residency);
  return retained;
}

function handoffBootstrapIfCovered(renderer, residency = null) {
  const bootstrapOwner = renderer && bootstrapResidencyOwnersByRenderer.get(renderer);
  const registry = residency || renderer && getAssetResidency(renderer);
  if (!bootstrapOwner || !registry) return false;
  const handedOff = registry.handoffOwnerWhenCovered(bootstrapOwner, 'bootstrap-handed-off-to-live-boundaries');
  if (handedOff) bootstrapResidencyOwnersByRenderer.delete(renderer);
  return handedOff;
}

function releaseBoundaryResidency(renderer, boundary, reason) {
  const residency = renderer && getAssetResidency(renderer);
  return residency && boundary ? residency.releaseOwner(boundary, reason) : 0;
}

function clonePreloadPlan(plan) {
  return Object.fromEntries(Object.entries(plan || {}).map(([slot, files]) => [slot, [...files]]));
}

function resolvedCanonicalLibrary(renderer, options = {}) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const cacheKey = libraryCacheKey(partRoot, options);
  const resolved = renderer && resolvedLibraryByRenderer.get(renderer);
  return resolved ? resolved.get(cacheKey) || null : null;
}

function bootstrapPlanForOptions(options = {}) {
  if (!Object.prototype.hasOwnProperty.call(options, 'bootstrapPlan') || options.bootstrapPlan === undefined) {
    return AUTHORED_BOOTSTRAP_PLAN;
  }
  const scope = typeof options.libraryScope === 'string' ? options.libraryScope.trim() : '';
  if (!scope || scope === 'canonical') {
    throw new TypeError('A custom authored bootstrap plan requires a non-canonical libraryScope');
  }
  const plan = options.bootstrapPlan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new TypeError('Authored bootstrapPlan must be an object');
  }
  return clonePreloadPlan(plan);
}

function libraryCacheKey(partRoot, options = {}, bootstrapPlan = bootstrapPlanForOptions(options)) {
  const scope = typeof options.libraryScope === 'string' && options.libraryScope.trim()
    ? options.libraryScope.trim()
    : 'canonical';
  const planKey = Object.entries(bootstrapPlan || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, files]) => `${slot}:${[...(files || [])].sort().join(',')}`)
    .join('|');
  return `${partRoot}#${scope}#${planKey}`;
}

function assertLibraryPlanUsable(library, plan, scope = 'canonical') {
  if (!libraryHasPreloadPlan(library, plan)) {
    throw new Error(`Authored ${scope || 'canonical'} library is incomplete for its required preload plan.`);
  }
  return library;
}

function buildComposedShip(entity, library, scene, ownerBoundary, options = {}) {
  const releaseMode = isReleaseAssetMode(options);
  const partRoot = releaseMode ? PART_RELEASE_ROOT : PART_ROOT;
  const assemblySeed = hashString(`${entity.id}|${entity.data && entity.data.defId}|${entity.factionId || ''}`);
  const entityPlan = authoredPreloadPlanForEntity(entity, options);
  const selected = new Map();
  // Whole-ship bodies (cockpit/fins/engine baked in) bypass the parts-assembly: use the body as the
  // hull and skip the structural slots so they don't stack on the baked geometry.
  let wholeShip = false;
  for (const slot of SHIP_ASSEMBLY_SLOTS) {
    const records = library.get(slot) || [];
    if (slot === 'hull') {
      // Whole-ship override takes priority. Otherwise prefer the defId-mapped class, falling back to a
      // seed pick over the regular hull pool (whole-ship bodies excluded so they're never picked at random).
      const wholeRec = resolveRequiredWholeShipRecord(entity, records, options);
      if (wholeRec) {
        selected.set(slot, wholeRec);
        wholeShip = true;
      } else {
        const pool = records.filter((record) => !isWholeShipUrl(record.url));
        const wanted = entityPlan.hull && entityPlan.hull[0]
          || HULL_FILE_BY_DEF_ID[entity.data && entity.data.defId];
        const exact = wanted && pool.find((record) => String(record.url || '').endsWith(wanted));
        selected.set(slot, exact || (pool.length ? pool[((assemblySeed ^ hashString(slot)) >>> 0) % pool.length] : null));
      }
    } else if (slot === 'engine') {
      selected.set(slot, engineRecordFor(records, entity, assemblySeed));
    } else if (slot === 'cockpit' || slot === 'fin') {
      const wanted = entityPlan[slot] && entityPlan[slot][0];
      selected.set(slot, recordForFile(records, wanted)
        || (records.length ? records[((assemblySeed ^ hashString(slot)) >>> 0) % records.length] : null));
    } else {
      selected.set(slot, records.length ? records[((assemblySeed ^ hashString(slot)) >>> 0) % records.length] : null);
    }
  }
  const authoredParts = [...selected.values()].filter(Boolean);
  if (!authoredParts.length) return null;

  const palette = paletteFor(entity);
  const visualSeed = flightVisualSeed(entity, palette);
  const loadoutFingerprint = computeLoadoutFingerprint({
    hull: entityPlan.hull && entityPlan.hull[0],
    cockpit: entityPlan.cockpit && entityPlan.cockpit[0],
    engines: entityPlan.engine && entityPlan.engine[0],
    fins: entityPlan.fin && entityPlan.fin[0],
    paint: palette && palette.id,
    materialAbiVersion: MATERIAL_ABI_VERSION,
    sourceVersions: entity.data && entity.data.defId,
  });
  const templateKey = flightRootTemplateKey({
    entity,
    entityPlan,
    palette,
    releaseMode,
    visualSeed,
    selected,
    wholeShip,
    loadoutFingerprint,
  });
  if (!flightRenderPackages.has(loadoutFingerprint)) {
    flightRenderPackages.publish(loadoutFingerprint, {
      lanes: { opaque: 1 },
      materialRoles: { hull: 'opaque_hull' },
    });
  }
  const template = flightRootTemplates.get(templateKey);
  if (template) {
    const cached = instantiateFlightRootTemplate(
      template, entity, templateKey, loadoutFingerprint, assemblySeed, library, scene, ownerBoundary, palette,
    );
    if (cached) return cached;
    removeFlightRootTemplate(templateKey);
  }
  const root = new THREE.Group();
  root.name = `GLTFKit_${entity.data && entity.data.defId || 'ship'}`;
  root.userData.kind = 'ship';
  root.userData.assetId = `GLTFKIT_${entity.data && entity.data.defId || 'SHIP'}_${assemblySeed.toString(16)}`;
  root.userData.loadoutFingerprint = loadoutFingerprint;

  const hull = new THREE.Group();
  hull.name = `${root.name}_Hull`;
  root.add(hull);
  root.userData.hull = hull;

  const materials = fallbackMaterials(palette, visualSeed);
  const bindings = createBindings();
  const mutableMaterials = new Map();
  const staticBatches = createStaticBatchCollector(hull, bindings);
  const ownerLocalFallbackRoots = [];
  const fallbackParts = [];
  const usedParts = [];
  const authoredSlots = {};
  const noteUsed = (slot, record) => {
    if (!record || !record.url) return;
    usedParts.push(record.url);
    if (!authoredSlots[slot]) authoredSlots[slot] = [];
    authoredSlots[slot].push(record.url);
  };

  const hullRecord = selected.get('hull');
  if (hullRecord) {
    instantiatePart(hullRecord, hull, {
      position: [0, 0, 0], targetLength: 1.72, label: 'Hull',
    }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    noteUsed('hull', hullRecord);
  } else {
    fallbackParts.push('hull');
  }
  const authoredHullLevels = hullRecord ? authoredLevels(hullRecord) : new Set();
  // Do not construct an opaque second skin when an authored hull exists; it would cover the actual
  // panel and material work. Emergency geometry exists only for a genuinely absent hull level.
  let safetyCore = null;
  if (shouldBuildReadabilitySafetyCore({
    wholeShip,
    authoredHullLevelCount: authoredHullLevels.size,
  })) safetyCore = buildSafetyCore(hull, materials, palette);
  // Snapshot only mounts supplied by the hull. Parts may themselves contain internal markers, but
  // assembly topology belongs to the hull grammar and must not change as later slots are mounted.
  const hullMounts = snapshotMounts(bindings.mounts);

  if (!wholeShip) {
  const cockpitPlacement = placementFromMount(hullMounts.cockpit[0], hull, {
    position: [0.35, 0.12, 0], targetLength: 0.58, label: 'Cockpit',
  });
  const cockpitRecord = selected.get('cockpit');
  if (cockpitRecord) {
    instantiatePart(cockpitRecord, hull, cockpitPlacement,
      palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    noteUsed('cockpit', cockpitRecord);
  } else {
    ownerLocalFallbackRoots.push(buildFallbackCockpit(hull, materials, cockpitPlacement));
    fallbackParts.push('cockpit');
  }

  const engineCount = (entity.radius || 18) >= 17 ? 2 : 1;
  const defaultEnginePositions = engineCount === 1
    ? [[-0.66, -0.04, 0]]
    : [[-0.62, -0.04, -0.32], [-0.62, -0.04, 0.32]];
  const enginePlacements = hullMounts.engine.length
    ? hullMounts.engine.map((mount, index) => placementFromMount(mount, hull, {
      position: defaultEnginePositions[Math.min(index, defaultEnginePositions.length - 1)],
      targetLength: 0.58, label: `Engine_${index}`,
    }))
    : defaultEnginePositions.map((position, index) => ({ position, targetLength: 0.58, label: `Engine_${index}` }));
  const engineRecord = selected.get('engine');
  if (engineRecord) {
    for (const placement of enginePlacements) {
      instantiatePart(engineRecord, hull, placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    }
    noteUsed('engine', engineRecord);
  } else {
    for (let i = 0; i < enginePlacements.length; i++) {
      const drive = buildFallbackEngine(hull, enginePlacements[i], materials, palette, i);
      bindings.driveFans.push(drive.fan);
      bindings.driveCores.push(drive.driveCore);
      bindings.drivePlumes.push(drive.plume);
      ownerLocalFallbackRoots.push(drive.root);
    }
    fallbackParts.push('engine');
  }

  const defaultFinPlacements = [-1, 1].map((side) => ({
    position: [-0.06, 0.02, side * 0.50], targetLength: 0.62,
    rotation: [0, 0, side * 0.04], label: side < 0 ? 'Fin_Port' : 'Fin_Starboard',
  }));
  const finPlacements = hullMounts.fin.length
    ? hullMounts.fin.map((mount, index) => placementFromMount(mount, hull, {
      ...defaultFinPlacements[Math.min(index, defaultFinPlacements.length - 1)],
      label: `Fin_${index}`,
    }))
    : defaultFinPlacements;
  const finRecord = selected.get('fin');
  for (const placement of finPlacements) {
    if (finRecord) {
      instantiatePart(finRecord, hull, placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    } else {
      ownerLocalFallbackRoots.push(buildFallbackFin(hull, materials, placement));
    }
  }
  if (finRecord) noteUsed('fin', finRecord);
  else fallbackParts.push('fin');
  } // end !wholeShip — skip cockpit/engine/fin for authored whole-ship bodies (baked in)
  const shipDef = SHIP_BY_ID.get(entity.data && entity.data.defId) || null;

  if (!wholeShip) {
  const weaponMounts = authoredWeaponMounts(entity, shipDef, library.get('weapon') || [], assemblySeed);
  if (weaponMounts.length) {
    let mounted = 0;
    for (const mount of weaponMounts) {
      if (!mount.record) continue;
      instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      noteUsed('weapon', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('weapon');
  }

  const podMounts = authoredPodMounts(entity, shipDef, library.get('pod') || [], assemblySeed);
  if (podMounts.length) {
    let mounted = 0;
    for (const mount of podMounts) {
      if (!mount.record) continue;
      const partRoot = instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      if (mount.damageRole === 'armor') bindings.armor.push(partRoot);
      else bindings.secondary.push(partRoot);
      noteUsed('pod', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('pod');
  }

  const gearMount = authoredGearMount(entity, shipDef, library.get('gear') || [], assemblySeed);
  if (gearMount && gearMount.record) {
    const partRoot = instantiatePart(gearMount.record, hull, gearMount.placement,
      palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    bindings.secondary.push(partRoot);
    noteUsed('gear', gearMount.record);
  } else if (gearMount) {
    fallbackParts.push('gear');
  }

  const greebleMounts = authoredGreebleMounts(entity, shipDef, library.get('greeble') || [], assemblySeed);
  if (greebleMounts.length) {
    let mounted = 0;
    for (const mount of greebleMounts) {
      if (!mount.record) continue;
      instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      noteUsed('greeble', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('greeble');
  }
  } // end !wholeShip — complete production bodies own their visible weapon/pod/gear/greeble roles

  if (!bindings.navLights.length) {
    ownerLocalFallbackRoots.push(buildFallbackNavLights(hull, materials, bindings));
  }
  ensureStandardSockets(hull);
  staticBatches.flush();
  reconcileMaplessHullMaterialAliases(palette);
  canonicalizeMaplessHullMaterials(root, palette);

  const primaryDrive = completeDriveBinding(bindings);
  normalizeWaspDomeGlass(root, entity);
  const navLightBase = bindings.navLights.map((mesh) => (
    mesh && mesh.material && Number.isFinite(mesh.material.emissiveIntensity)
      ? mesh.material.emissiveIntensity : 1
  ));

  kit.finalizeShip({
    root,
    hull,
    entity,
    designRadius: 1,
    decals: bindings.decals,
    driveParts: primaryDrive,
    navLightBase,
    damageParts: {
      navLights: bindings.navLights,
      navLightBase,
      driveCore: primaryDrive && primaryDrive.driveCore,
      plume: primaryDrive && primaryDrive.plume,
      secondary: bindings.secondary,
      armor: bindings.armor,
      sensorSlits: bindings.sensorSlits,
    },
  });
  synchronizeSecondaryDrives(primaryDrive, bindings);
  installAuthoredLod(root, bindings, safetyCore, authoredHullLevels, wholeShip);
  root.userData.updateLod('lod0');

  // GR-5: authored compositions need the same persistent shield bubble as procedural ships so
  // syncEntityViews can toggle it from e.shield. Geometry shared via shipKit; material per-ship.
  const shieldBubble = kit.createShieldBubble(palette.accent || '#5fd0ff', entity.radius || 12);
  root.add(shieldBubble);
  root.userData.shieldBubble = shieldBubble;

  // Hidden geometry gives object-space tools/debuggers useful bounds even though opaque authored
  // surfaces are rendered by scene-level instance pools rather than as children of this root.
  const boundsProxy = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.72, 1.18),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  boundsProxy.name = 'GLTFKit_BoundsProxy';
  boundsProxy.visible = false;
  boundsProxy.userData.keepSeparate = true;
  hull.add(boundsProxy);

  const ownerLocalGeometries = new Set([boundsProxy.geometry]);
  const ownerLocalMaterials = new Set([
    ...Object.values(materials),
    ...mutableMaterials.values(),
    shieldBubble.material,
    boundsProxy.material,
  ].filter(Boolean));
  const ownerLocalObjects = new Set();
  const renderPackageInstances = [];
  for (const fallbackRoot of ownerLocalFallbackRoots.filter(Boolean)) {
    fallbackRoot.traverse((object) => {
      if (typeof object.dispose === 'function') ownerLocalObjects.add(object);
      const geometry = object.geometry;
      if (geometry && geometry.userData?.spacefaceSharedFallback !== true) {
        ownerLocalGeometries.add(geometry);
      }
      const objectMaterials = object.material
        ? (Array.isArray(object.material) ? object.material : [object.material])
        : EMPTY_ARRAY;
      for (const material of objectMaterials) {
        if (material && material.userData?.spacefaceSharedAsset !== true) {
          ownerLocalMaterials.add(material);
        }
      }
    });
  }
  root.traverse((object) => {
    if (object.userData?.spacefaceStaticBatch === true && object.geometry) {
      ownerLocalGeometries.add(object.geometry);
    }
    const instance = object.userData?.renderPackageInstance;
    if (instance && typeof instance.dispose === 'function') renderPackageInstances.push(instance);
  });

  root.userData.renderContract = {
    version: 1,
    coordinateSystem: '+X forward, +Y up, +Z starboard; normalized assembly scaled to entity radius',
    authoredParts: [...new Set(usedParts)],
    authoredSlots: uniqueSlotMap(authoredSlots),
    proceduralFallbackParts: fallbackParts,
    instancing: 'opaque immutable primitives merged into ship-local static batches',
    hookBinding: 'HOOK_* / SOCKET_* / MOUNT_* / LOD* names bound to shipKit.finalizeShip + shipDamage',
    wholeShip,
    physicalCanopy: { transmission: 0.6, ior: 1.4, clearcoat: 1.0 },
  };

  const authoredPartList = [...new Set(usedParts)];
  const authoredSlotMap = uniqueSlotMap(authoredSlots);
  // Procedural composition has no authored render-package byte hash. Publish the exact loadout
  // recipe that produced this root so an opening plan can bind it to a verified producer identity;
  // the authored GLB instance, when it replaces this root, publishes its own loader-verified hash.
  stampOpeningSubmissionPackage(root, {
    schema: 'spaceface.proceduralFlightProducerManifest.v1',
    producer: 'procedural-flight-ship',
    defId: entity.data && entity.data.defId || null,
    loadoutFingerprint,
    materialAbiVersion: MATERIAL_ABI_VERSION,
    wholeShip,
    authoredParts: authoredPartList,
    authoredSlots: authoredSlotMap,
    fallbackParts: [...fallbackParts],
    renderContract: root.userData.renderContract,
  }, {
    producer: 'procedural-flight-ship',
    assetId: root.userData.assetId,
  });
  root.userData.authoredPartsCache = authoredPartList;
  root.userData.authoredSlotsCache = authoredSlotMap;
  root.userData.wholeShip = wholeShip;
  // Runtime composition is not the offline cooker: preserve the authored root and carry the
  // supported-camera omission metadata until a flat cooked artifact is selected.
  cookFlightProduct(root, 'chase', { runtime: true });
  const result = {
    root,
    authoredParts: authoredPartList,
    authoredSlots: authoredSlotMap,
    fallbackParts,
    wholeShip,
    packagePoolAdmissions: [...bindings.packagePoolAdmissions],
    ownerLocalObjects: [...ownerLocalObjects],
    ownerLocalGeometries: [...ownerLocalGeometries],
    ownerLocalMaterials: [...ownerLocalMaterials],
    renderPackageInstances,
  };
  if (canCacheFlightRootTemplate(result)) {
    storeFlightRootTemplate(templateKey, createFlightRootTemplateEntry({
      root,
      bindings,
      authoredHullLevels,
      wholeShip,
      loadoutFingerprint,
      authoredParts: authoredPartList,
      authoredSlots: authoredSlotMap,
    }));
  }
  return result;
}

function flightRootTemplateKey({
  entity,
  entityPlan,
  palette,
  releaseMode,
  visualSeed,
  selected,
  wholeShip,
  loadoutFingerprint,
}) {
  const data = entity && entity.data || {};
  // Whole-ship bodies skip every accessory slot after hull. Excluding those skipped selections is
  // important: they are seed-selected during assembly, so including them makes identical Kestrel
  // visuals diverge by entity id even though the unused records never affect pixels.
  const consumedSelected = wholeShip
    ? [...selected.entries()].filter(([slot]) => slot === 'hull')
    : [...selected.entries()];
  const selectedSources = consumedSelected
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slot, record]) => [slot, flightRecordTemplateToken(record)]);
  const consumedEntityPlan = wholeShip
    ? { hull: entityPlan && entityPlan.hull || [] }
    : entityPlan;
  return stableFlightTemplateToken({
    schema: 'spaceface.flightRootTemplate.v3',
    contract: PART_LIBRARY_CONTRACT.version,
    materialAbiVersion: MATERIAL_ABI_VERSION,
    releaseMode: releaseMode === true,
    wholeShip: wholeShip === true,
    visualSeed,
    loadoutFingerprint,
    selectedSources,
    entityPlan: consumedEntityPlan,
    defId: data.defId || null,
    factionId: entity && entity.factionId || null,
    team: entity && entity.team,
    radius: entity && entity.radius,
    appearance: shipAppearanceSignature(data.appearance, data.defId),
    palette: {
      hull: palette && palette.hull,
      accent: palette && palette.accent,
      dark: palette && palette.dark,
      thruster: palette && palette.thruster,
      finish: palette && palette.finish,
      wear: palette && palette.wear,
    },
    ...(wholeShip ? {} : {
      weapons: data.weapons || [],
      fittings: data.fittings || [],
    }),
  });
}

function flightVisualSeed(entity, palette) {
  const data = entity && entity.data || {};
  return hashString(stableFlightTemplateToken({
    defId: data.defId || null,
    factionId: entity && entity.factionId || null,
    team: entity && entity.team,
    appearance: shipAppearanceSignature(data.appearance, data.defId),
    palette: {
      hull: palette && palette.hull,
      accent: palette && palette.accent,
      dark: palette && palette.dark,
      thruster: palette && palette.thruster,
      finish: palette && palette.finish,
      wear: palette && palette.wear,
    },
  }));
}

function flightRecordTemplateToken(record) {
  if (!record) return null;
  const packageRecord = record.renderPackage;
  return {
    url: record.url || null,
    assetId: record.assetId || null,
    contentHash: record.contentHash || record.byteHash || null,
    generation: record.generation || record.sourceVersion || record.version || null,
    byteLength: record.byteLength || record.bytes || null,
    bounds: record.bounds || null,
    primitiveCount: Array.isArray(record.primitives) ? record.primitives.length : null,
    markerCount: Array.isArray(record.markers) ? record.markers.length : null,
    package: packageRecord ? {
      assetId: packageRecord.assetId || null,
      contentHash: packageRecord.contentHash || packageRecord.byteHash || null,
      generation: packageRecord.generation || packageRecord.sourceVersion || packageRecord.version || null,
      fingerprint: packageRecord.fingerprint || null,
    } : null,
  };
}

function stableFlightTemplateToken(value, seen = new Set()) {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'function') return 'null';
  if (seen.has(value)) return '"[cycle]"';
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = `[${value.map((item) => stableFlightTemplateToken(item, seen)).join(',')}]`;
  } else {
    result = `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableFlightTemplateToken(value[key], seen)}`
    )).join(',')}}`;
  }
  seen.delete(value);
  return result;
}

function canCacheFlightRootTemplate(result) {
  if (!result || !result.root) return false;
  const packageRecipes = collectFlightPackageRecipes(result.root);
  if (packageRecipes.length !== (result.renderPackageInstances || EMPTY_ARRAY).length) return false;
  let safe = true;
  result.root.traverse((object) => {
    if (object.userData?.renderPackageInstance && !object.userData?.spacefaceFlightPackageRecipe) {
      safe = false;
      return;
    }
    if (object.userData?.spacefaceInstanceProxy === true) {
      let packageOwned = false;
      for (let owner = object.parent; owner; owner = owner.parent) {
        if (owner.userData?.spacefaceFlightPackageRecipe) {
          packageOwned = true;
          break;
        }
      }
      if (!packageOwned) safe = false;
    }
  });
  return safe;
}

function createFlightRootTemplateEntry({
  root,
  bindings,
  authoredHullLevels,
  wholeShip,
  loadoutFingerprint,
  authoredParts,
  authoredSlots,
}) {
  const packageRecipes = collectFlightPackageRecipes(root);
  const templateRoot = createFlightTemplateRoot(root);
  stripFlightPackageTemplateSubtrees(templateRoot, packageRecipes);
  return {
    root: templateRoot,
    hullPath: objectPathFromRoot(root, root.userData && root.userData.hull),
    shieldBubblePath: objectPathFromRoot(root, root.userData && root.userData.shieldBubble),
    safetyCorePath: findObjectPath(root, (object) => object.userData?.spacefaceReadabilityCore === true),
    bindings: captureFlightTemplateBindings(root, bindings),
    authoredHullLevels: [...(authoredHullLevels || EMPTY_ARRAY)],
    authoredParts: [...(authoredParts || EMPTY_ARRAY)],
    authoredSlots: cloneFlightTemplateMetadata(authoredSlots || {}),
    fallbackParts: [...(root.userData?.renderContract?.proceduralFallbackParts || EMPTY_ARRAY)],
    renderContract: cloneFlightTemplateMetadata(root.userData?.renderContract || {}),
    producerManifest: cloneFlightTemplateMetadata(root.userData?.openingSubmissionPackage?.manifest || null),
    packageRecipes,
    wholeShip: wholeShip === true,
    loadoutFingerprint,
    cacheHeld: true,
    instanceRefs: 0,
    disposed: false,
  };
}

function createFlightTemplateRoot(sourceRoot) {
  if (!sourceRoot || typeof sourceRoot.clone !== 'function') return null;
  const templateRoot = sourceRoot.clone(true);
  const geometries = new Map();
  const materials = new Map();
  templateRoot.traverse((object) => {
    object.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    object.onAfterRender = THREE.Object3D.prototype.onAfterRender;
    object.userData = sanitizeFlightTemplateUserData(object.userData);
    object.userData.spacefaceFlightTemplatePath = (objectPathFromRoot(templateRoot, object) || []).join('/');
    if (object.geometry) {
      let geometry = geometries.get(object.geometry);
      if (!geometry) {
        geometry = typeof object.geometry.clone === 'function' ? object.geometry.clone() : object.geometry;
        geometry.userData = {
          ...(geometry.userData || {}),
          spacefaceFlightTemplateGeometry: true,
          spacefaceSharedAsset: true,
        };
        geometries.set(object.geometry, geometry);
      }
      object.geometry = geometry;
    }
    if (object.material) object.material = cloneFlightTemplateMaterials(object.material, materials);
  });
  clearFlightTemplateDynamicUserData(templateRoot);
  return templateRoot;
}

function cloneFlightTemplateMaterials(material, materials) {
  if (Array.isArray(material)) return material.map((entry) => cloneFlightTemplateMaterials(entry, materials));
  if (!material || typeof material.clone !== 'function') return material;
  let cloned = materials.get(material);
  if (!cloned) {
    cloned = material.clone();
    cloned.userData = {
      ...(cloned.userData || {}),
      spacefaceFlightTemplateMaterial: true,
      spacefaceSharedAsset: false,
    };
    materials.set(material, cloned);
  }
  return cloned;
}

function cloneFlightInstanceMaterials(material, materials) {
  if (Array.isArray(material)) return material.map((entry) => cloneFlightInstanceMaterials(entry, materials));
  if (!material || typeof material.clone !== 'function') return material;
  let cloned = materials.get(material);
  if (!cloned) {
    cloned = material.clone();
    cloned.userData = {
      ...(cloned.userData || {}),
      spacefaceFlightTemplateInstanceMaterial: true,
      spacefaceSharedAsset: false,
    };
    materials.set(material, cloned);
  }
  return cloned;
}

function sanitizeFlightTemplateUserData(userData) {
  const next = { ...(userData || {}) };
  delete next.spacefaceDrivePose;
  delete next.renderPackageInstance;
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'function') delete next[key];
  }
  return next;
}

function collectFlightPackageRecipes(root) {
  const recipes = [];
  if (!root?.traverse) return recipes;
  root.traverse((object) => {
    const recipe = object.userData?.spacefaceFlightPackageRecipe;
    if (!object.userData?.renderPackageInstance || !recipe) return;
    const objectPaths = [];
    object.traverse((child) => {
      const sourcePath = objectPathFromRoot(root, child);
      const relativePath = objectPathFromRoot(object, child);
      if (sourcePath && relativePath) objectPaths.push({ sourcePath, relativePath });
    });
    recipes.push({
      ...cloneFlightTemplateMetadata(recipe),
      sourcePath: objectPathFromRoot(root, object),
      parentPath: objectPathFromRoot(root, object.parent),
      objectPaths,
    });
  });
  return recipes;
}

function stripFlightPackageTemplateSubtrees(root, recipes) {
  const detached = [];
  for (const recipe of recipes || EMPTY_ARRAY) {
    const partRoot = findFlightTemplateObject(root, recipe.sourcePath);
    if (partRoot) {
      partRoot.removeFromParent();
      detached.push(partRoot);
    }
  }
  if (!detached.length) return;

  // createFlightTemplateRoot owns cloned geometry/materials. A package subtree is intentionally
  // rebuilt through its render-package API on a hit, so its detached clone resources must be
  // released here rather than left unreachable behind the cache entry. Never dispose an identity
  // still used by the retained template graph (a source GLB may legally share geometry).
  const retainedGeometries = new Set();
  const retainedMaterials = new Set();
  root.traverse((object) => {
    if (object.geometry) retainedGeometries.add(object.geometry);
    const materials = object.material
      ? (Array.isArray(object.material) ? object.material : [object.material])
      : EMPTY_ARRAY;
    for (const material of materials) if (material) retainedMaterials.add(material);
  });
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  for (const detachedRoot of detached) {
    detachedRoot.traverse((object) => {
      const geometry = object.geometry;
      if (geometry && !retainedGeometries.has(geometry) && !disposedGeometries.has(geometry)) {
        disposedGeometries.add(geometry);
        try { geometry.dispose?.(); } catch (_) { /* cache construction remains fail-closed */ }
      }
      const materials = object.material
        ? (Array.isArray(object.material) ? object.material : [object.material])
        : EMPTY_ARRAY;
      for (const material of materials) {
        if (!material || retainedMaterials.has(material) || disposedMaterials.has(material)) continue;
        disposedMaterials.add(material);
        try { material.dispose?.(); } catch (_) { /* cache construction remains fail-closed */ }
      }
    });
    detachedRoot.clear?.();
  }
}

function clearFlightTemplateDynamicUserData(root) {
  if (!root) return;
  root.traverse((object) => {
    const data = object.userData || {};
    delete data.updateLod;
    delete data.updateDriveState;
    delete data.updateDamageState;
    delete data.damageParts;
    delete data.damageState;
    delete data.hullFrac;
    delete data.lod;
    delete data.hull;
    delete data.shieldBubble;
    delete data.openingSubmissionPackage;
    object.userData = data;
  });
}

function instantiateFlightRootTemplate(
  entry,
  entity,
  templateKey,
  loadoutFingerprint,
  assemblySeed,
  library = null,
  scene = null,
  ownerBoundary = null,
  palette = null,
) {
  if (!entry || !entry.root) return null;
  const root = createFlightTemplateRootInstance(entry.root);
  if (!root) return null;
  clearFlightTemplateDynamicUserData(root);
  // Package subtrees are deliberately absent from the immutable template. Recreate them through
  // the live package API before resolving bindings so Kestrel/other whole-ship hits bind the real
  // package meshes, sockets, and pool admissions instead of silently losing those paths.
  const packageBindings = (entry.packageRecipes || EMPTY_ARRAY).length ? createBindings() : null;
  const rootName = `GLTFKit_${entity.data && entity.data.defId || 'ship'}`;
  const assetId = `GLTFKIT_${entity.data && entity.data.defId || 'SHIP'}_${assemblySeed.toString(16)}`;
  root.name = rootName;
  root.userData.kind = 'ship';
  root.userData.assetId = assetId;
  root.userData.loadoutFingerprint = loadoutFingerprint;
  root.userData.renderContract = cloneFlightTemplateMetadata(entry.renderContract || {});
  root.userData.authoredPartsCache = [...(entry.authoredParts || EMPTY_ARRAY)];
  root.userData.authoredSlotsCache = cloneFlightTemplateMetadata(entry.authoredSlots || {});
  root.userData.wholeShip = entry.wholeShip === true;

  // Package roots are never cloned as live instances. Recreate them through the package loader so
  // residency ownership, pool candidates, and proxy activation remain per-boundary resources.
  if ((entry.packageRecipes || EMPTY_ARRAY).length > 0) {
    if (!library || !scene || !ownerBoundary) return null;
    const packageMutableMaterials = new Map();
    for (const recipe of entry.packageRecipes) {
      const record = findFlightTemplatePackageRecord(library, recipe);
      const parent = findFlightTemplateObject(root, recipe.parentPath);
      if (!record || !parent) return null;
      const sourceLength = Math.max(Number(record.bounds?.size?.[0]) || 1, 1e-6);
      const placement = {
        position: recipe.position || [0, 0, 0],
        quaternion: new THREE.Quaternion().fromArray(recipe.quaternion || [0, 0, 0, 1]),
        targetLength: sourceLength,
        label: recipe.label || record.assetId || record.url || 'Package',
      };
      const partRoot = instantiateRenderPackagePart(
        record, parent, placement, palette || paletteFor(entity), scene, ownerBoundary,
        packageBindings, packageMutableMaterials,
      );
      if (Array.isArray(recipe.scale) && recipe.scale.length === 3) partRoot.scale.fromArray(recipe.scale);
      partRoot.updateMatrix();
      for (const path of recipe.objectPaths || EMPTY_ARRAY) {
        const object = objectAtRootPath(partRoot, path.relativePath);
        if (!object) continue;
        object.userData = {
          ...(object.userData || {}),
          spacefaceFlightTemplatePath: (path.sourcePath || []).join('/'),
        };
      }
    }
  }
  const hull = findFlightTemplateObject(root, entry.hullPath);
  const shieldBubble = findFlightTemplateObject(root, entry.shieldBubblePath);
  const safetyCore = findFlightTemplateObject(root, entry.safetyCorePath);
  const bindings = restoreFlightTemplateBindings(root, entry.bindings, packageBindings);
  if (!hull || !bindings) return null;
  root.userData.hull = hull;
  root.userData.shieldBubble = shieldBubble;
  normalizeWaspDomeGlass(root, entity);

  const primaryDrive = completeDriveBinding(bindings);
  const navLightBase = bindings.navLights.map((mesh) => (
    mesh && mesh.material && Number.isFinite(mesh.material.emissiveIntensity)
      ? mesh.material.emissiveIntensity : 1
  ));
  kit.finalizeShip({
    root,
    hull,
    entity,
    designRadius: 1,
    decals: bindings.decals,
    driveParts: primaryDrive,
    navLightBase,
    damageParts: {
      navLights: bindings.navLights,
      navLightBase,
      driveCore: primaryDrive && primaryDrive.driveCore,
      plume: primaryDrive && primaryDrive.plume,
      secondary: bindings.secondary,
      armor: bindings.armor,
      sensorSlits: bindings.sensorSlits,
    },
  });
  synchronizeSecondaryDrives(primaryDrive, bindings);
  installAuthoredLod(root, bindings, safetyCore, new Set(entry.authoredHullLevels || EMPTY_ARRAY), entry.wholeShip === true);
  root.userData.updateLod('lod0');
  if (entry.producerManifest) {
    stampOpeningSubmissionPackage(root, entry.producerManifest, {
      replace: true,
      producer: 'procedural-flight-ship',
      assetId,
    });
  }
  cookFlightProduct(root, 'chase', { runtime: true });

  const releaseFlightTemplate = retainFlightRootTemplate(entry);
  if (!releaseFlightTemplate) return null;
  root.userData.releaseAuthoredAssetResidency = (reason = 'flight-template-root-disposed') => (
    releaseFlightTemplate(reason)
  );

  const ownerLocalMaterials = new Set();
  const renderPackageInstances = [];
  root.traverse((object) => {
    const objectMaterials = object.material
      ? (Array.isArray(object.material) ? object.material : [object.material])
      : EMPTY_ARRAY;
    for (const material of objectMaterials) if (material) ownerLocalMaterials.add(material);
    const instance = object.userData?.renderPackageInstance;
    if (instance && typeof instance.dispose === 'function') renderPackageInstances.push(instance);
  });
  return {
    root,
    authoredParts: [...(entry.authoredParts || EMPTY_ARRAY)],
    authoredSlots: cloneFlightTemplateMetadata(entry.authoredSlots || {}),
    fallbackParts: [...(entry.fallbackParts || EMPTY_ARRAY)],
    wholeShip: entry.wholeShip === true,
    packagePoolAdmissions: [...bindings.packagePoolAdmissions],
    ownerLocalObjects: [],
    ownerLocalGeometries: [],
    ownerLocalMaterials: [...ownerLocalMaterials],
    renderPackageInstances,
    fromFlightTemplateCache: true,
    flightRootTemplateKey: templateKey,
    releaseFlightTemplate,
  };
}

function findFlightTemplatePackageRecord(library, recipe) {
  if (!library || typeof library.values !== 'function' || !recipe) return null;
  for (const records of library.values()) {
    for (const record of records || EMPTY_ARRAY) {
      if (!record || record.url !== recipe.url) continue;
      if (!recipe.assetId || record.assetId === recipe.assetId
        || record.renderPackage?.assetId === recipe.assetId) return record;
    }
  }
  return null;
}

function createFlightTemplateRootInstance(templateRoot) {
  if (!templateRoot || typeof templateRoot.clone !== 'function') return null;
  const root = templateRoot.clone(true);
  const materials = new Map();
  root.traverse((object) => {
    object.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    object.onAfterRender = THREE.Object3D.prototype.onAfterRender;
    object.userData = sanitizeFlightTemplateUserData(object.userData);
    if (object.material) object.material = cloneFlightInstanceMaterials(object.material, materials);
  });
  return root;
}

function captureFlightTemplateBindings(root, bindings) {
  const capture = (objects) => (objects || EMPTY_ARRAY)
    .map((object) => objectPathFromRoot(root, object))
    .filter((path) => path !== null);
  return {
    driveFans: capture(bindings.driveFans),
    driveCores: capture(bindings.driveCores),
    drivePlumes: capture(bindings.drivePlumes),
    navLights: capture(bindings.navLights),
    sensorSlits: capture(bindings.sensorSlits),
    armor: capture(bindings.armor),
    secondary: capture(bindings.secondary),
    decals: capture(bindings.decals),
    lodDynamicDetails: capture(bindings.lodDynamicDetails),
    lod: Object.fromEntries(Object.entries(bindings.lod).map(([key, objects]) => [key, capture(objects)])),
  };
}

function restoreFlightTemplateBindings(root, paths, supplemental = null) {
  if (!paths) return null;
  const restore = (items) => (items || EMPTY_ARRAY).map((path) => findFlightTemplateObject(root, path));
  const bindings = createBindings();
  for (const key of ['driveFans', 'driveCores', 'drivePlumes', 'navLights', 'sensorSlits', 'armor', 'secondary', 'decals', 'lodDynamicDetails']) {
    bindings[key] = restore(paths[key]);
    if (bindings[key].some((object) => !object)) return null;
  }
  for (const key of Object.keys(bindings.lod)) {
    bindings.lod[key] = restore(paths.lod && paths.lod[key]);
    if (bindings.lod[key].some((object) => !object)) return null;
  }
  for (const admission of supplemental?.packagePoolAdmissions || EMPTY_ARRAY) {
    bindings.packagePoolAdmissions.add(admission);
  }
  return bindings;
}

function objectPathFromRoot(root, target) {
  if (!root || !target) return null;
  const path = [];
  let object = target;
  while (object && object !== root) {
    const parent = object.parent;
    if (!parent) return null;
    const index = parent.children.indexOf(object);
    if (index < 0) return null;
    path.unshift(index);
    object = parent;
  }
  return object === root ? path : null;
}

function findObjectPath(root, predicate) {
  let found = null;
  root.traverse((object) => {
    if (found === null && predicate(object)) found = objectPathFromRoot(root, object);
  });
  return found;
}

function objectAtRootPath(root, path) {
  if (!root || !Array.isArray(path)) return null;
  let object = root;
  for (const index of path) {
    if (!object || !Array.isArray(object.children) || !object.children[index]) return null;
    object = object.children[index];
  }
  return object;
}

function findFlightTemplateObject(root, path) {
  if (!root || !Array.isArray(path)) return null;
  const marker = path.join('/');
  let found = null;
  root.traverse((object) => {
    if (found === null && object.userData?.spacefaceFlightTemplatePath === marker) found = object;
  });
  return found || objectAtRootPath(root, path);
}

function cloneFlightTemplateMetadata(value, seen = new Map()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'function') continue;
    copy[key] = cloneFlightTemplateMetadata(item, seen);
  }
  return copy;
}

function storeFlightRootTemplate(key, entry) {
  if (!key || !entry) return false;
  if (flightRootTemplates.has(key)) removeFlightRootTemplate(key);
  while (flightRootTemplates.size >= FLIGHT_ROOT_TEMPLATE_CACHE_LIMIT) {
    const oldest = flightRootTemplates.keys().next().value;
    if (oldest == null) break;
    removeFlightRootTemplate(oldest);
  }
  flightRootTemplates.set(key, entry);
  return true;
}

function removeFlightRootTemplate(key) {
  const entry = flightRootTemplates.get(key);
  if (!entry) return false;
  flightRootTemplates.delete(key);
  entry.cacheHeld = false;
  finalizeFlightRootTemplateIfUnused(entry);
  return true;
}

function retainFlightRootTemplate(entry) {
  if (!entry || entry.disposed === true) return null;
  entry.instanceRefs = (entry.instanceRefs || 0) + 1;
  let released = false;
  return (reason = 'flight-template-instance-released') => {
    if (released) return false;
    released = true;
    entry.instanceRefs = Math.max(0, (entry.instanceRefs || 0) - 1);
    finalizeFlightRootTemplateIfUnused(entry, reason);
    return true;
  };
}

function finalizeFlightRootTemplateIfUnused(entry) {
  if (!entry || entry.disposed === true || entry.cacheHeld === true || (entry.instanceRefs || 0) > 0) {
    return false;
  }
  entry.disposed = true;
  const geometries = new Set();
  const materials = new Set();
  entry.root?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = object.material
      ? (Array.isArray(object.material) ? object.material : [object.material])
      : EMPTY_ARRAY;
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) {
    try { geometry.dispose?.(); } catch (_) { /* cache eviction is best effort */ }
  }
  for (const material of materials) {
    try { material.dispose?.(); } catch (_) { /* cache eviction is best effort */ }
  }
  entry.root?.clear?.();
  return true;
}

/** Focused seam probe: template hits share immutable geometry but own mutable materials and hooks. */
export function runFlightRootTemplateCacheProbe() {
  const source = new THREE.Group();
  source.name = 'FlightRootTemplateProbe';
  source.userData = {
    kind: 'ship',
    assetId: 'probe-source',
    hull: null,
    renderContract: { version: 1, proceduralFallbackParts: [] },
  };
  const hull = new THREE.Group();
  hull.name = 'FlightRootTemplateProbe_Hull';
  source.add(hull);
  source.userData.hull = hull;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6688aa }),
  );
  mesh.userData.spacefaceStaticBatch = true;
  hull.add(mesh);
  const entry = createFlightRootTemplateEntry({
    root: source,
    bindings: createBindings(),
    authoredHullLevels: new Set(['lod0']),
    wholeShip: false,
    loadoutFingerprint: 'probe',
    authoredParts: ['probe'],
    authoredSlots: {},
  });
  const templateMesh = entry.root.getObjectByName(mesh.name);
  let geometryDisposeCount = 0;
  if (templateMesh?.geometry) {
    const dispose = templateMesh.geometry.dispose.bind(templateMesh.geometry);
    templateMesh.geometry.dispose = () => {
      geometryDisposeCount++;
      return dispose();
    };
  }
  const entity = { radius: 1, data: { defId: 'probe' } };
  const first = instantiateFlightRootTemplate(entry, entity, 'probe', 'probe', 1);
  const second = instantiateFlightRootTemplate(entry, entity, 'probe', 'probe', 1);
  const firstMesh = first && first.root.getObjectByName(mesh.name);
  const secondMesh = second && second.root.getObjectByName(mesh.name);
  const result = {
    distinctRoots: !!first && !!second && first.root !== second.root,
    sharedGeometry: !!firstMesh && !!secondMesh && firstMesh.geometry === secondMesh.geometry,
    distinctMaterials: !!firstMesh && !!secondMesh && firstMesh.material !== secondMesh.material,
    reboundHooks: !!first && typeof first.root.userData.updateLod === 'function'
      && typeof first.root.userData.updateDamageState === 'function',
  };
  first?.releaseFlightTemplate?.('probe-first-release');
  second?.releaseFlightTemplate?.('probe-second-release');
  const probeKey = '__spaceface-flight-root-template-probe__';
  storeFlightRootTemplate(probeKey, entry);
  removeFlightRootTemplate(probeKey);
  const materials = new Set();
  for (const root of [first?.root, second?.root, source]) {
    root?.traverse?.((object) => {
      const list = object.material
        ? (Array.isArray(object.material) ? object.material : [object.material])
        : EMPTY_ARRAY;
      for (const material of list) if (material) materials.add(material);
    });
    root?.clear?.();
  }
  for (const material of materials) material.dispose?.();
  mesh.geometry?.dispose?.();
  result.geometryDisposedOnce = geometryDisposeCount === 1;
  return result;
}

/** Focused production-seam probe: a whole-ship Kestrel package is built once, then rebuilt for a
 * different entity id. The second build must rehydrate the package API and hit the visual template,
 * while the package and template ownership counters still close exactly once. */
export function runFlightKestrelTemplatePackageProbe() {
  const token = ++flightTemplateProbeSequence;
  const packageGeometry = new THREE.BoxGeometry(1, 0.6, 0.8);
  const packageMaterial = new THREE.MeshStandardMaterial({ color: 0x6b829e, roughness: 0.62, metalness: 0.28 });
  const packageSpecs = [
    { name: 'Kestrel_Armor', tags: Object.freeze({ lod: 'lod0', damageRole: 'armor' }) },
    { name: 'Kestrel_Fan', tags: Object.freeze({ lod: 'lod0', drive: 'fan' }) },
    { name: 'Kestrel_Core', tags: Object.freeze({ lod: 'lod0', drive: 'core' }) },
    { name: 'Kestrel_Plume', tags: Object.freeze({ lod: 'lod0', drive: 'plume' }) },
    { name: 'Kestrel_Nav', tags: Object.freeze({ lod: 'lod0', damageRole: 'navLight' }) },
    { name: 'Kestrel_Secondary', tags: Object.freeze({ lod: 'lod1', damageRole: 'secondary' }) },
  ];
  let packageCreates = 0;
  let packageDisposals = 0;
  const packageRecord = {
    url: 'assets/ships/release/parts/wholeships/kestrel.glb',
    assetId: 'SF_K0_KESTREL_BORROWED_TIME_V4',
    slot: 'hull',
    bounds: { min: [-0.5, -0.3, -0.4], max: [0.5, 0.3, 0.4], size: [1, 0.6, 0.8], center: [0, 0, 0] },
    primitives: packageSpecs.map((spec) => ({
      key: `probe:kestrel:${spec.name}`,
      name: spec.name,
      geometry: packageGeometry,
      material: packageMaterial,
      matrix: new THREE.Matrix4(),
      tags: spec.tags,
    })),
    markers: [],
    renderPackage: {
      assetId: 'sf.probe.kestrel',
      contentHash: 'kestrel-template-probe',
      createInstance() {
        packageCreates++;
        const root = new THREE.Group();
        root.name = 'KestrelPackageRoot';
        const meshes = packageSpecs.map((spec) => {
          const mesh = new THREE.Mesh(packageGeometry, packageMaterial);
          mesh.name = spec.name;
          root.add(mesh);
          return mesh;
        });
        return {
          root,
          planNodes: [root, ...meshes],
          dispose() {
            packageDisposals++;
            root.clear();
            return true;
          },
        };
      },
    },
  };
  const library = new Map([
    ['hull', [packageRecord]],
    ['cockpit', []],
    ['engine', []],
    ['fin', []],
    ['weapon', []],
    ['greeble', []],
    ['gear', []],
    ['pod', []],
  ]);
  const scenes = [new THREE.Scene(), new THREE.Scene(), new THREE.Scene()];
  const owners = scenes.map((scene, index) => {
    const owner = new THREE.Group();
    owner.name = `KestrelTemplateProbeOwner_${index}`;
    owner.userData.kind = 'ship';
    scene.add(owner);
    return owner;
  });
  const entityFor = (id) => ({
    id,
    type: 'ship',
    alive: true,
    radius: 12,
    team: 0,
    // Unknown faction keeps the palette deterministic while making this probe key unique from
    // any live/test Kestrel composition already held by the module cache.
    factionId: `flight-template-probe-${token}`,
    data: { defId: 'ship_kestrel' },
  });
  const beforeKeys = new Set(flightRootTemplates.keys());
  let first = null;
  let second = null;
  let third = null;
  let templateKey = null;
  let templateEntry = null;
  let detachedCloneGeometryDisposals = 0;
  const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function probeGeometryDispose(...args) {
    detachedCloneGeometryDisposals++;
    return originalGeometryDispose.apply(this, args);
  };
  try {
    first = buildComposedShip(entityFor(`kestrel-template-${token}-a`), library, scenes[0], owners[0], {
      requiredWholeShip: true,
    });
    templateKey = [...flightRootTemplates.keys()].find((key) => !beforeKeys.has(key)) || null;
    templateEntry = templateKey ? flightRootTemplates.get(templateKey) : null;
    second = buildComposedShip(entityFor(`kestrel-template-${token}-b`), library, scenes[1], owners[1], {
      requiredWholeShip: true,
    });
  } catch (_) {
    // The returned booleans turn a failed production seam into a focused test failure while the
    // finally block restores Three's prototype for the rest of the process.
  } finally {
    THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
  }

  const visibleSignature = (root) => {
    const values = [];
    root?.traverse?.((object) => {
      if (!object.isMesh && object.userData?.spacefaceInstanceProxy !== true) return;
      values.push([object.name, object.visible !== false]);
    });
    return JSON.stringify(values.sort(([left], [right]) => left.localeCompare(right)));
  };
  const firstVisible = visibleSignature(first?.root);
  const secondVisible = visibleSignature(second?.root);
  const secondMesh = second?.root?.getObjectByName('Kestrel_Armor');
  const firstFan = first?.root?.getObjectByName('Kestrel_Fan');
  const secondFan = second?.root?.getObjectByName('Kestrel_Fan');
  const firstPlume = first?.root?.getObjectByName('Kestrel_Plume');
  const secondPlume = second?.root?.getObjectByName('Kestrel_Plume');
  const firstNav = first?.root?.getObjectByName('Kestrel_Nav');
  const secondNav = second?.root?.getObjectByName('Kestrel_Nav');
  const firstSecondary = first?.root?.getObjectByName('Kestrel_Secondary');
  const secondSecondary = second?.root?.getObjectByName('Kestrel_Secondary');
  const firstInstance = first?.renderPackageInstances?.[0];
  const secondInstance = second?.renderPackageInstances?.[0];
  const firstDriveUpdate = first?.root?.userData?.updateDriveState;
  const secondDriveUpdate = second?.root?.userData?.updateDriveState;
  const firstDamageUpdate = first?.root?.userData?.updateDamageState;
  const secondDamageUpdate = second?.root?.userData?.updateDamageState;
  const firstLodUpdate = first?.root?.userData?.updateLod;
  const secondLodUpdate = second?.root?.userData?.updateLod;
  const entityA = entityFor(`kestrel-template-${token}-a`);
  const entityB = { ...entityFor(`kestrel-template-${token}-b`), vel: { x: 120, z: 0 }, hull: 10, hullMax: 100 };
  entityA.vel = { x: 0, z: 0 };
  entityA.hull = 100;
  entityA.hullMax = 100;
  firstDamageUpdate?.(entityA, 0);
  secondDamageUpdate?.(entityA, 0);
  const secondFanBeforeDrive = secondFan?.rotation.x;
  const secondPlumeBeforeDrive = secondPlume?.material?.opacity;
  const secondNavBeforeDamage = secondNav?.material?.emissiveIntensity;
  const secondArmorBeforeDamage = secondMesh?.position.clone();
  const secondSecondaryBeforeDamage = secondSecondary?.visible;
  firstDriveUpdate?.(entityB, 1);
  const secondUnchangedAfterDrive = secondFan?.rotation.x === secondFanBeforeDrive
    && secondPlume?.material?.opacity === secondPlumeBeforeDrive;
  firstDamageUpdate?.(entityB, 2);
  const secondUnchangedAfterDamage = secondNav?.material?.emissiveIntensity === secondNavBeforeDamage
    && secondMesh?.position.equals(secondArmorBeforeDamage)
    && secondSecondary?.visible === secondSecondaryBeforeDamage;
  firstLodUpdate?.('lod1');
  const secondUnchangedAfterLod = secondSecondary?.visible === secondSecondaryBeforeDamage;
  secondDriveUpdate?.(entityB, 1);
  secondDamageUpdate?.(entityB, 2);
  secondLodUpdate?.('lod1');
  const mutableMaterialIsolation = !!firstPlume?.material && !!secondPlume?.material
    && firstPlume.material !== secondPlume.material
    && !!firstNav?.material && !!secondNav?.material
    && firstNav.material !== secondNav.material;
  const closureIsolation = !!firstDriveUpdate && !!secondDriveUpdate
    && firstDriveUpdate !== secondDriveUpdate
    && !!firstDamageUpdate && !!secondDamageUpdate
    && firstDamageUpdate !== secondDamageUpdate
    && !!firstLodUpdate && !!secondLodUpdate
    && firstLodUpdate !== secondLodUpdate;
  const secondRelease = second?.releaseFlightTemplate?.('kestrel-template-probe-release') || false;
  const secondReleaseAgain = second?.releaseFlightTemplate?.('kestrel-template-probe-release-again') || false;
  // Dispose actor A before rebuilding actor C in a different scene/owner context. The cached
  // template must remain valid for the surviving B root and for the fresh C package instance.
  firstInstance?.dispose?.('kestrel-template-probe-dispose-a');
  const thirdBuild = templateKey
    ? buildComposedShip(entityFor(`kestrel-template-${token}-c`), library, scenes[2], owners[2], {
        requiredWholeShip: true,
      })
    : null;
  third = thirdBuild;
  const thirdMesh = third?.root?.getObjectByName('Kestrel_Armor');
  third?.root?.userData?.updateLod?.('lod1');
  const disposeRebuildValid = !!third && third.fromFlightTemplateCache === true
    && !!thirdMesh && thirdMesh.visible === secondMesh?.visible;
  const thirdRelease = third?.releaseFlightTemplate?.('kestrel-template-probe-release-c') || false;
  if (templateKey) removeFlightRootTemplate(templateKey);
  const templateDisposed = templateEntry?.disposed === true;

  // Close package instances and local probe resources after collecting parity. Cache-owned template
  // resources have already been finalized by removeFlightRootTemplate above.
  const geometries = new Set([packageGeometry]);
  const materials = new Set([packageMaterial]);
  for (const root of [first?.root, second?.root]) {
    root?.traverse?.((object) => {
      if (object.geometry && object.geometry.userData?.spacefaceSharedFallback !== true) {
        geometries.add(object.geometry);
      }
      const list = object.material
        ? (Array.isArray(object.material) ? object.material : [object.material])
        : EMPTY_ARRAY;
      for (const material of list) if (material) materials.add(material);
    });
  }
  secondInstance?.dispose?.('kestrel-template-probe-cleanup');
  third?.renderPackageInstances?.[0]?.dispose?.('kestrel-template-probe-cleanup');
  first?.root?.clear?.();
  second?.root?.clear?.();
  third?.root?.clear?.();
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  for (const owner of owners) owner.removeFromParent();

  return {
    firstBuilt: !!first && first.fromFlightTemplateCache !== true,
    secondCacheHit: second?.fromFlightTemplateCache === true,
    packageRehydrated: !!secondInstance && secondInstance !== firstInstance,
    bindingsRebound: !!secondMesh
      && secondMesh.userData?.spacefaceTags?.damageRole === 'armor'
      && typeof second?.root?.userData?.updateDamageState === 'function'
      && typeof second?.root?.userData?.updateLod === 'function',
    visibleParity: !!first && !!second && firstVisible === secondVisible,
    packageCreates: packageCreates === 3,
    packageDisposals: packageDisposals === 3,
    releaseWasIdempotent: secondRelease === true && secondReleaseAgain === false && thirdRelease === true,
    mutableMaterialIsolation,
    closureIsolation,
    driveIsolation: secondUnchangedAfterDrive,
    damageIsolation: secondUnchangedAfterDamage,
    lodIsolation: secondUnchangedAfterLod,
    disposeRebuildValid,
    templateDisposed,
    detachedCloneGeometryDisposed: detachedCloneGeometryDisposals > 0,
  };
}

function requiredWholeShipMessage(entity, wholeShipFile, records, partRoot) {
  const defId = entity && entity.data && entity.data.defId || 'unknown_ship';
  const wantedUrl = `${partRoot || PART_RELEASE_ROOT}${wholeShipFile}`;
  const loadedWholeShips = (records || [])
    .map((record) => record && record.url)
    .filter((url) => url && isWholeShipUrl(url));
  return `[partsLibrary] release mode requires ${wantedUrl} for ${defId}; it did not pass the live authored-asset loader. ` +
    `Loaded whole-ship hull records: ${loadedWholeShips.length ? loadedWholeShips.join(', ') : 'none'}. ` +
    'Fix the GLB contract instead of falling back to modular hulls.';
}

function uniqueSlotMap(slots) {
  return Object.fromEntries(Object.entries(slots).map(([slot, urls]) => [slot, [...new Set(urls)]]));
}

function authoredWeaponMounts(entity, shipDef, records, seed) {
  const data = entity.data || {};
  const runtimeWeapons = Array.isArray(data.weapons) ? data.weapons : [];
  const fittedWeaponIds = Array.isArray(data.fittings)
    ? data.fittings.filter((id) => WEAPON_BY_ID.has(id))
    : [];
  const hardpoints = shipDef && shipDef.visuals && Array.isArray(shipDef.visuals.hardpoints)
    ? shipDef.visuals.hardpoints
    : [];
  const slotEntries = shipSlotEntries(shipDef, 'weapon');
  const count = Math.min(6, Math.max(runtimeWeapons.length, fittedWeaponIds.length, hardpoints.length, slotEntries.length));
  const mounts = [];
  for (let i = 0; i < count; i++) {
    const runtime = runtimeWeapons[i] || {};
    const slot = slotEntries[i];
    const hardpoint = hardpoints[i] || defaultHardpoint(i, count);
    const defId = runtime.defId || fittedWeaponIds[i] || null;
    const wdef = WEAPON_BY_ID.get(defId) || null;
    const facing = runtime.facing || hardpoint.facing || slotFacing(slot) || 'front';
    const size = runtime.size || (wdef && wdef.size) || hardpoint.size || slotSize(slot) || 'S';
    const record = weaponRecordFor(records, wdef, facing, size, seed, i);
    mounts.push({
      record,
      placement: {
        position: hardpoint.pos || defaultHardpoint(i, count).pos,
        rotation: [0, yawForFacing(facing), 0],
        targetLength: weaponTargetLength(size, wdef),
        label: `Weapon_${i}_${facing}`,
      },
    });
  }
  return mounts;
}

function authoredPodMounts(entity, shipDef, records, seed) {
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const cargoSlots = shipSlotEntries(shipDef, 'cargo').length;
  const utilitySlots = shipSlotEntries(shipDef, 'utility').length;
  const mounts = [];

  if (cargoSlots >= 2 || role.includes('freighter') || role.includes('miner')) {
    const file = role.includes('miner') ? 'pods/pod_utility.glb' : 'pods/pod_cargo_container.glb';
    const record = recordForFile(records, file) || hashedRecord(records, seed, 'pod:cargo');
    mounts.push({
      record,
      damageRole: 'secondary',
      placement: {
        position: [-0.16, role.includes('miner') ? 0.34 : -0.24, cargoSlots >= 3 ? 0.34 : -0.34],
        targetLength: role.includes('miner') ? 0.30 : 0.38,
        label: 'Pod_CargoUtility',
      },
    });
  }

  if (utilitySlots > 0 && !role.includes('capital')) {
    const record = recordForFile(records, 'pods/pod_utility.glb') || hashedRecord(records, seed, 'pod:utility');
    mounts.push({
      record,
      damageRole: 'secondary',
      placement: {
        position: [-0.04, 0.36, role.includes('fighter') || role.includes('interceptor') ? -0.26 : 0],
        targetLength: role.includes('fighter') || role.includes('interceptor') ? 0.24 : 0.30,
        label: 'Pod_Utility',
      },
    });
  }

  if (role === 'starter' || role === 'multirole' || entity.team === 1) {
    const record = recordForFile(records, 'pods/pod_repair_patch.glb') || hashedRecord(records, seed, 'pod:repair');
    mounts.push({
      record,
      damageRole: 'armor',
      placement: {
        position: [0.10, 0.22, -0.43],
        rotation: [0, 0, -0.03],
        targetLength: 0.25,
        label: 'Pod_RepairPatch',
      },
    });
  }

  return mounts.slice(0, 3);
}

function authoredGearMount(entity, shipDef, records, seed) {
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const heavy = (entity.radius || 0) >= 18 || role.includes('freighter') || role.includes('miner') || role.includes('capital');
  const file = heavy ? 'gear/skid_quad.glb' : 'gear/skid_trio.glb';
  return {
    record: recordForFile(records, file) || hashedRecord(records, seed, 'gear'),
    placement: {
      position: [-0.12, -0.39, 0],
      targetLength: heavy ? 0.42 : 0.34,
      label: heavy ? 'Gear_QuadSkid' : 'Gear_TrioSkid',
    },
  };
}

function authoredGreebleMounts(entity, shipDef, records, seed) {
  if (entity.factionId === 'faction_vael') return [];
  const role = String(shipDef && shipDef.role || '').toLowerCase();
  const hints = (shipDef && shipDef.visuals && shipDef.visuals.tiers && shipDef.visuals.tiers[0] && shipDef.visuals.tiers[0].hints) || {};
  const density = Number.isFinite(hints.greeble) ? hints.greeble : 0.55;
  const files = role.includes('miner') || role.includes('freighter')
    ? ['greebles/greeble_pipes.glb', 'greebles/greeble_armor_plates.glb', 'greebles/greeble_vents.glb']
    : role.includes('fighter') || role.includes('interceptor')
      ? ['greebles/greeble_nav_lights.glb', 'greebles/greeble_rcs.glb', 'greebles/greeble_vents.glb']
      : ['greebles/greeble_hatches.glb', 'greebles/greeble_antennas.glb', 'greebles/greeble_armor_plates.glb'];
  const max = density > 0.75 ? 3 : 2;
  const placements = [
    { position: [0.16, 0.30, 0.30], rotation: [0, 0, 0.02], targetLength: 0.16, label: 'Greeble_DorsalA' },
    { position: [-0.24, 0.27, -0.30], rotation: [0, 0, -0.02], targetLength: 0.15, label: 'Greeble_DorsalB' },
    { position: [-0.38, 0.14, 0.42], rotation: [0, 0, 0.04], targetLength: 0.14, label: 'Greeble_ServiceC' },
  ];
  const mounts = [];
  for (let i = 0; i < Math.min(max, files.length); i++) {
    mounts.push({
      record: recordForFile(records, files[i]) || hashedRecord(records, seed, `greeble:${i}`),
      placement: placements[i],
    });
  }
  return mounts;
}

function shipSlotEntries(shipDef, slot) {
  const entries = shipDef && shipDef.slots && shipDef.slots[slot];
  return Array.isArray(entries) ? entries : [];
}

function slotSize(entry) {
  if (typeof entry === 'string') return entry;
  return entry && entry.size;
}

function slotFacing(entry) {
  return entry && typeof entry === 'object' ? entry.facing : null;
}

function defaultHardpoint(index, count) {
  if (count <= 1) return { pos: [0.68, 0.08, 0], facing: 'front', size: 'S' };
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  return { pos: [0.64 - row * 0.12, 0.08, side * (0.16 + row * 0.10)], facing: 'front', size: 'S' };
}

function yawForFacing(facing) {
  switch (facing) {
    case 'rear': return Math.PI;
    case 'left': return Math.PI / 2;
    case 'right': return -Math.PI / 2;
    default: return 0;
  }
}

function weaponTargetLength(size, wdef) {
  if (wdef && String(wdef.id || '').includes('lance')) return 0.48;
  if (size === 'L') return 0.44;
  if (size === 'M') return 0.34;
  return 0.24;
}

function engineRecordFor(records, entity, seed) {
  const defId = entity.data && entity.data.defId;
  const shipDef = SHIP_BY_ID.get(defId);
  const driveId = shipDef && shipDef.driveId;
  let file = ENGINE_FILE_BY_DEF_ID[defId] || ENGINE_FILE_BY_DRIVE_ID[driveId] || null;
  if (!file) {
    const role = String(shipDef && shipDef.role || '').toLowerCase();
    if (role.includes('miner') || role.includes('freighter')) file = 'engines/engine_industrial.glb';
    else if (role.includes('interceptor') || role.includes('fighter')) file = 'engines/engine_vector.glb';
    else if (role.includes('capital') || role.includes('gunship') || role.includes('corvette')) file = 'engines/engine_plasma_ring.glb';
    else file = 'engines/engine_ion_small.glb';
  }
  return recordForFile(records, file) || hashedRecord(records, seed, 'engine');
}

function weaponRecordFor(records, wdef, facing, size, seed, index) {
  const id = String(wdef && wdef.id || '').toLowerCase();
  const tracking = String(wdef && wdef.tracking || '').toLowerCase();
  let file = 'weapons/weapon_pulse_cannon.glb';
  if (facing === 'turret' || tracking === 'auto_turret') file = 'weapons/weapon_turret_dual.glb';
  else if (size === 'L' || id.includes('lance') || id.includes('beam')) file = 'weapons/weapon_lance.glb';
  else if (id.includes('rail')) file = 'weapons/weapon_railgun.glb';
  else if (id.includes('autocannon') || id.includes('gatling')) file = 'weapons/weapon_gatling.glb';
  else if (id.includes('torpedo') || id.includes('missile') || id.includes('plasma')) file = 'weapons/weapon_heavy_cannon.glb';
  return recordForFile(records, file) || hashedRecord(records, seed, `weapon:${index}`);
}

function recordForFile(records, file) {
  return (records || []).find((record) => String(record && record.url || '').endsWith(file)) || null;
}

function hashedRecord(records, seed, key) {
  if (!records || !records.length) return null;
  return records[((seed ^ hashString(key)) >>> 0) % records.length];
}

function compositionPrimitives(record) {
  let cached = compositionPrimitiveCache.get(record);
  if (cached) return cached;

  const output = [];
  const buckets = new Map();
  for (const primitive of record.primitives) {
    if (requiresPerShipMesh(primitive)) {
      if (!canMergeDedicatedPrimitive(primitive)) {
        output.push(primitive);
        continue;
      }
      const key = dedicatedBatchKey(primitive);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { first: primitive, primitives: [], dedicated: true, anchorMatrix: primitive.tags.driveAnchorMatrix };
        buckets.set(key, bucket);
      }
      bucket.primitives.push(primitive);
      continue;
    }
    const key = pooledBatchKey(primitive);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { first: primitive, primitives: [], dedicated: false, anchorMatrix: null };
      buckets.set(key, bucket);
    }
    bucket.primitives.push(primitive);
  }

  const tier1Geometry = tier1CausalCounters();
  for (const bucket of buckets.values()) {
    if (bucket.primitives.length <= 1) {
      output.push(bucket.first);
      continue;
    }
    const geometries = bucket.primitives.map((primitive) => {
      const geometry = primitive.geometry.clone();
      if (tier1Geometry) tier1Geometry.countGeometryConstructed(1, 'composition-batch-clone');
      promoteStaticPositionToFloat(geometry);
      if (bucket.anchorMatrix) {
        BATCH_INVERSE.copy(bucket.anchorMatrix).invert();
        BATCH_LOCAL.multiplyMatrices(BATCH_INVERSE, primitive.matrix);
        geometry.applyMatrix4(BATCH_LOCAL);
      } else {
        geometry.applyMatrix4(primitive.matrix);
      }
      if (tier1Geometry) tier1Geometry.countGeometryTransform('composition-batch');
      return geometry;
    });
    const normalized = normalizeStaticBatchGeometries(geometries);
    if (tier1Geometry) tier1Geometry.countGeometryNormalization(geometries.length, 'composition-batch');
    const merged = canMergeStaticBatchGeometries(normalized) ? mergeGeometries(normalized, false) : null;
    if (tier1Geometry && merged) tier1Geometry.countGeometryMerge(normalized.length, 'composition-batch');
    for (const geometry of normalized) {
      if (geometry && typeof geometry.dispose === 'function') {
        if (tier1Geometry) tier1Geometry.countResourcesDisposed(1, 'composition-batch');
        geometry.dispose();
      }
    }
    if (!merged) {
      output.push(...bucket.primitives);
      continue;
    }
    const batchKey = `${record.url}#batch#${pooledBatchKey(bucket.first)}`;
    merged.userData = { ...(merged.userData || {}), spacefaceBatchKey: batchKey };
    const tags = bucket.dedicated ? clonePrimitiveTags(bucket.first.tags) : bucket.first.tags;
    output.push(Object.freeze({
      key: batchKey,
      name: `Batch_${bucket.first.name || 'Primitive'}_${bucket.primitives.length}`,
      geometry: merged,
      material: bucket.first.material,
      matrix: bucket.anchorMatrix ? bucket.anchorMatrix.clone() : IDENTITY_MATRIX.clone(),
      tags,
    }));
  }

  cached = Object.freeze(output);
  compositionPrimitiveCache.set(record, cached);
  return cached;
}

function canMergeDedicatedPrimitive(primitive) {
  const tags = primitive && primitive.tags || {};
  if (tags.drive && tags.driveAnchorMatrix) return true;
  return !!(tags.canopy && tags.instance !== false && !tags.drive && !tags.damageRole && !tags.decal);
}

function dedicatedBatchKey(primitive) {
  const tags = primitive.tags || {};
  return [
    'dedicated',
    materialBatchSignature(primitive.material),
    geometryBatchSignature(primitive.geometry),
    tags.lod || 'always',
    tags.canopy ? 'canopy' : '',
    authoredSurfaceTintRole(tags, primitive.material),
    tags.drive || '',
    matrixBatchSignature(tags.driveAnchorMatrix),
  ].join('|');
}

function clonePrimitiveTags(tags) {
  const next = { ...(tags || {}) };
  if (tags && tags.driveAnchorMatrix) next.driveAnchorMatrix = tags.driveAnchorMatrix.clone();
  return Object.freeze(next);
}

function pooledBatchKey(primitive) {
  const tags = primitive.tags || {};
  return [
    materialBatchSignature(primitive.material),
    geometryBatchSignature(primitive.geometry),
    tags.lod || 'always',
    authoredSurfaceTintRole(tags, primitive.material),
    tags.damageRole || '',
    tags.instance === false ? 'unique' : 'pooled',
  ].join('|');
}

function geometryBatchSignature(geometry) {
  if (!geometry) return 'no-geometry';
  const attrs = geometry.attributes || {};
  const attrSig = Object.keys(attrs).sort().map((name) => {
    const attr = attrs[name];
    const array = attr && attr.array;
    return [
      name,
      attr && attr.itemSize,
      attr && attr.normalized ? 1 : 0,
      attr && attr.isInterleavedBufferAttribute ? 'interleaved' : 'plain',
      array && array.constructor && array.constructor.name || 'array',
    ].join(':');
  }).join(',');
  const index = geometry.index;
  const indexArray = index && index.array;
  const indexSig = index
    ? `index:${index.itemSize || 1}:${indexArray && indexArray.constructor && indexArray.constructor.name || 'array'}`
    : 'index:none';
  return `${indexSig}|${attrSig}`;
}

function matrixBatchSignature(matrix) {
  if (!matrix || !matrix.elements) return 'matrix:none';
  return Array.prototype.map.call(matrix.elements, (value) => Number.isFinite(value) ? Number(value).toFixed(5) : 'x').join(',');
}

function materialBatchSignature(material) {
  if (!material) return 'material:none';
  return [
    material.type || 'Material',
    material.transparent ? 1 : 0,
    material.depthWrite === false ? 0 : 1,
    material.depthTest === false ? 0 : 1,
    material.side == null ? THREE.FrontSide : material.side,
    material.blending == null ? THREE.NormalBlending : material.blending,
    material.vertexColors ? 1 : 0,
    fixedSig(material.alphaTest, 3),
    fixedSig(material.opacity, 3),
    colorSig(material.color),
    fixedSig(material.roughness, 3),
    fixedSig(material.metalness, 3),
    colorSig(material.emissive),
    fixedSig(material.emissiveIntensity, 3),
    fixedSig(material.transmission, 3),
    fixedSig(material.clearcoat, 3),
    fixedSig(material.clearcoatRoughness, 3),
    vector2Sig(material.normalScale),
    textureBatchSignature(material.map),
    textureBatchSignature(material.normalMap),
    textureBatchSignature(material.aoMap),
    textureBatchSignature(material.roughnessMap),
    textureBatchSignature(material.metalnessMap),
    textureBatchSignature(material.emissiveMap),
    textureBatchSignature(material.alphaMap),
  ].join('|');
}

function textureBatchSignature(texture) {
  if (!texture) return 'tex:none';
  const image = texture.image || (texture.source && texture.source.data) || null;
  const sourceKey = texture.source && texture.source.uuid
    || texture.userData && texture.userData.spacefaceSourceKey
    || image && (image.currentSrc || image.src || image.uuid)
    || texture.uuid;
  return [
    sourceKey || 'tex',
    texture.colorSpace || '',
    texture.flipY ? 1 : 0,
    texture.channel || 0,
    texture.wrapS || 0,
    texture.wrapT || 0,
    texture.minFilter || 0,
    texture.magFilter || 0,
    textureMatrixSig(texture),
    image && Number.isFinite(image.width) ? image.width : 0,
    image && Number.isFinite(image.height) ? image.height : 0,
  ].join(':');
}

function colorSig(color) {
  return color && typeof color.getHexString === 'function' ? color.getHexString() : 'none';
}

function fixedSig(value, places) {
  return Number.isFinite(value) ? Number(value).toFixed(places) : 'none';
}

function vector2Sig(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y)
    ? `${value.x.toFixed(3)},${value.y.toFixed(3)}`
    : 'none';
}

function textureMatrixSig(texture) {
  if (!texture || !texture.matrix) return 'matrix:none';
  if (texture.matrixAutoUpdate && typeof texture.updateMatrix === 'function') texture.updateMatrix();
  const elements = texture.matrix.elements || [];
  return Array.prototype.map.call(elements, (value) => Number.isFinite(value) ? Number(value).toFixed(4) : 'x').join(',');
}

function createStaticBatchCollector(parent, bindings, options = {}) {
  const buckets = new Map();
  return {
    add({ record, primitive, partRoot, material }) {
      const resolved = resolveCanonicalHullMaterial(material);
      const key = staticBatchKey(resolved, primitive);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          material: resolved,
          tags: clonePrimitiveTags(primitive.tags),
          entries: [],
          urls: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.entries.push({ record, primitive, partMatrix: partRoot.matrix.clone() });
      if (record && record.url) bucket.urls.add(record.url);
    },
    flush() {
      const groups = new Map();
      for (const bucket of buckets.values()) {
        const key = staticBatchGroupKey(bucket.tags);
        let group = groups.get(key);
        if (!group) {
          group = [];
          groups.set(key, group);
        }
        group.push(bucket);
      }
      for (const group of groups.values()) flushStaticBatchGroup(parent, bindings, group, options);
      buckets.clear();
    },
  };
}

function staticBatchKey(material, primitive) {
  const tags = primitive && primitive.tags || {};
  return [
    materialBatchSignature(material),
    tags.lod || 'always',
    tags.damageRole || '',
  ].join('|');
}

function staticBatchGroupKey(tags = {}) {
  return [
    tags.lod || 'always',
    tags.damageRole || '',
  ].join('|');
}

function flushStaticBatch(parent, bindings, bucket, options = {}) {
  const material = resolveCanonicalHullMaterial(bucket.material);
  const merged = buildStaticBatchGeometry(bucket, options);
  if (!merged) {
    const tier1Geometry = tier1CausalCounters();
    for (const entry of bucket.entries) {
      const geometry = entry.primitive.geometry.clone();
      if (tier1Geometry) {
        tier1Geometry.countGeometryConstructed(1, 'static-batch-clone');
        tier1Geometry.countGeometryTransform('static-batch');
      }
      promoteStaticPositionToFloat(geometry);
      geometry.applyMatrix4(entry.primitive.matrix);
      geometry.applyMatrix4(entry.partMatrix);
      addStaticBatchMesh(parent, bindings, geometry, material, bucket.tags, [entry.record && entry.record.url], entry.primitive.name);
    }
    return;
  }
  addStaticBatchMesh(parent, bindings, merged, material, bucket.tags, [...bucket.urls], `StaticBatch_${bucket.entries.length}`);
}

function flushStaticBatchGroup(parent, bindings, buckets, options = {}) {
  if (!buckets || buckets.length === 0) return;
  if (buckets.length === 1) {
    flushStaticBatch(parent, bindings, buckets[0], options);
    return;
  }

  const geometries = [];
  const materials = [];
  const urls = new Set();
  let partCount = 0;
  for (const bucket of buckets) {
    const geometry = buildStaticBatchGeometry(bucket, options);
    if (!geometry) {
      for (const pending of geometries) {
        if (pending && typeof pending.dispose === 'function') pending.dispose();
      }
      for (const fallback of buckets) flushStaticBatch(parent, bindings, fallback, options);
      return;
    }
    geometries.push(geometry);
    materials.push(resolveCanonicalHullMaterial(bucket.material));
    partCount += bucket.entries.length;
    for (const url of bucket.urls) urls.add(url);
  }

  const tier1Geometry = tier1CausalCounters();
  const normalized = normalizeStaticBatchGeometries(geometries, options);
  if (tier1Geometry) tier1Geometry.countGeometryNormalization(geometries.length, 'static-batch-group');
  const merged = canMergeStaticBatchGeometries(normalized) ? mergeGeometries(normalized, true) : null;
  if (tier1Geometry && merged) tier1Geometry.countGeometryMerge(normalized.length, 'static-batch-group');
  for (const geometry of normalized) {
    if (geometry && typeof geometry.dispose === 'function') {
      if (tier1Geometry) tier1Geometry.countResourcesDisposed(1, 'static-batch-group');
      geometry.dispose();
    }
  }
  if (!merged) {
    for (const fallback of buckets) flushStaticBatch(parent, bindings, fallback, options);
    return;
  }
  addStaticBatchMesh(parent, bindings, merged, materials, buckets[0].tags, [...urls], `StaticGroup_${partCount}_${materials.length}`);
}

function buildStaticBatchGeometry(bucket, options = {}) {
  const cacheKey = staticBatchGeometryCacheKey(bucket);
  const cached = takeCachedStaticBatchGeometry(cacheKey);
  if (cached) return cached;
  const tier1Geometry = tier1CausalCounters();
  const geometries = normalizeStaticBatchGeometries(bucket.entries.map((entry) => {
    const geometry = entry.primitive.geometry.clone();
    if (tier1Geometry) {
      tier1Geometry.countGeometryConstructed(1, 'static-batch-clone');
      tier1Geometry.countGeometryTransform('static-batch');
    }
    promoteStaticPositionToFloat(geometry);
    geometry.applyMatrix4(entry.primitive.matrix);
    geometry.applyMatrix4(entry.partMatrix);
    return geometry;
  }), options);
  if (tier1Geometry) tier1Geometry.countGeometryNormalization(geometries.length, 'static-batch');
  const merged = canMergeStaticBatchGeometries(geometries) ? mergeGeometries(geometries, false) : null;
  if (tier1Geometry && merged) tier1Geometry.countGeometryMerge(geometries.length, 'static-batch');
  for (const geometry of geometries) {
    if (geometry && typeof geometry.dispose === 'function') {
      if (tier1Geometry) tier1Geometry.countResourcesDisposed(1, 'static-batch');
      geometry.dispose();
    }
  }
  if (merged) {
    rememberStaticBatchGeometry(cacheKey, merged);
    return typeof merged.clone === 'function' ? merged.clone() : merged;
  }
  return null;
}

// KHR_mesh_quantization commonly stores POSITION as normalized Int16. BufferGeometry.applyMatrix4()
// writes transformed coordinates back through BufferAttribute.setXYZ(); retaining the integer
// attribute there clamps/overflows metre-scale transforms into an approximately two-unit cube.
// Promote only the cloned, transform-bound position buffer so source/release bytes stay quantized.
function promoteStaticPositionToFloat(geometry) {
  if (!geometry || typeof geometry.getAttribute !== 'function') return geometry;
  const position = geometry.getAttribute('position');
  if (!position || position.array instanceof Float32Array) return geometry;
  const values = new Float32Array(position.count * position.itemSize);
  for (let i = 0; i < position.count; i++) {
    const offset = i * position.itemSize;
    values[offset] = position.getX(i);
    if (position.itemSize > 1) values[offset + 1] = position.getY(i);
    if (position.itemSize > 2) values[offset + 2] = position.getZ(i);
    if (position.itemSize > 3) values[offset + 3] = position.getW(i);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(values, position.itemSize, false));
  return geometry;
}

function normalizeStaticBatchGeometries(geometries, options = {}) {
  const available = geometries.filter(Boolean);
  // BufferGeometryUtils can merge an all-indexed set directly. Only explicitly qualified,
  // topology-proven place paths opt in; any mixed set still normalizes to the established
  // non-indexed shape.
  const preserveIndexedGeometry = options.preserveIndexedGeometry === true
    && available.length > 0
    && available.every((geometry) => !!geometry.index);
  const tier1Geometry = tier1CausalCounters();
  const normalized = available.map((geometry) => {
    if (!geometry) return geometry;
    let next = geometry;
    if (!preserveIndexedGeometry && next.index && typeof next.toNonIndexed === 'function') {
      next = next.toNonIndexed();
      if (tier1Geometry) tier1Geometry.countGeometryDeindex('static-batch');
      if (next !== geometry && typeof geometry.dispose === 'function') {
        if (tier1Geometry) tier1Geometry.countResourcesDisposed(1, 'static-batch-deindex');
        geometry.dispose();
      }
    }
    if (!next.getAttribute('normal') && typeof next.computeVertexNormals === 'function') {
      next.computeVertexNormals();
    }
    return next;
  }).filter(Boolean);

  const specs = new Map();
  const conflicts = new Set();
  for (const geometry of normalized) {
    const attrs = geometry.attributes || {};
    for (const [name, attr] of Object.entries(attrs)) {
      if (!attr || !attributeArray(attr) || name === 'skinIndex' || name === 'skinWeight') continue;
      const spec = attributeSpec(attr);
      const existing = specs.get(name);
      if (!existing) specs.set(name, spec);
      else if (!sameAttributeSpec(existing, spec)) conflicts.add(name);
    }
  }
  normalizeStaticAttributeConflicts(normalized, specs, conflicts);
  for (const geometry of normalized) {
    for (const name of conflicts) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
    }
  }
  for (const name of conflicts) specs.delete(name);

  for (const geometry of normalized) {
    const position = geometry.getAttribute('position');
    const count = position && position.count || 0;
    if (!count) continue;
    for (const [name, spec] of specs) {
      if (geometry.getAttribute(name)) continue;
      geometry.setAttribute(name, createEmptyAttribute(name, spec, count));
    }
  }
  return normalized;
}

function normalizeStaticAttributeConflicts(geometries, specs, conflicts) {
  for (const name of [...conflicts]) {
    if (!isPromotableStaticAttribute(name)) continue;
    const itemSize = firstAttributeItemSize(geometries, name) || defaultAttributeItemSize(name);
    const spec = { itemSize, normalized: false, ArrayType: Float32Array };
    for (const geometry of geometries) {
      const attr = geometry.getAttribute(name);
      if (!attr) continue;
      if (sameAttributeSpec(attributeSpec(attr), spec) && !attr.isInterleavedBufferAttribute) continue;
      geometry.setAttribute(name, convertAttributeToFloat(attr, itemSize));
    }
    specs.set(name, spec);
    conflicts.delete(name);
  }
}

function isPromotableStaticAttribute(name) {
  return name === 'position' || name === 'normal' || name === 'uv' || name === 'uv1' || name === 'uv2';
}

function firstAttributeItemSize(geometries, name) {
  for (const geometry of geometries) {
    const attr = geometry && geometry.getAttribute(name);
    if (attr && attr.itemSize) return attr.itemSize;
  }
  return 0;
}

function defaultAttributeItemSize(name) {
  if (name === 'position' || name === 'normal') return 3;
  return 2;
}

function convertAttributeToFloat(attr, itemSize) {
  const count = attr && attr.count || 0;
  const next = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < itemSize; c++) {
      next[i * itemSize + c] = c < attr.itemSize ? normalizedAttributeComponent(attr, i, c) : 0;
    }
  }
  return new THREE.BufferAttribute(next, itemSize, false);
}

function normalizedAttributeComponent(attr, index, component) {
  let value = 0;
  if (component === 0 && typeof attr.getX === 'function') value = attr.getX(index);
  else if (component === 1 && typeof attr.getY === 'function') value = attr.getY(index);
  else if (component === 2 && typeof attr.getZ === 'function') value = attr.getZ(index);
  else if (component === 3 && typeof attr.getW === 'function') value = attr.getW(index);
  const array = attributeArray(attr);
  if (!attr.normalized || !array) return value;
  const scale = normalizedAttributeScale(array);
  if (!scale) return value;
  return scale.signed ? Math.max(-1, value / scale.max) : value / scale.max;
}

function normalizedAttributeScale(array) {
  if (array instanceof Int8Array) return { max: 127, signed: true };
  if (array instanceof Int16Array) return { max: 32767, signed: true };
  if (array instanceof Int32Array) return { max: 2147483647, signed: true };
  if (array instanceof Uint8Array || array instanceof Uint8ClampedArray) return { max: 255, signed: false };
  if (array instanceof Uint16Array) return { max: 65535, signed: false };
  if (array instanceof Uint32Array) return { max: 4294967295, signed: false };
  return null;
}

function canMergeStaticBatchGeometries(geometries) {
  if (!geometries || geometries.length === 0) return false;
  const first = geometries[0];
  if (!first) return false;
  const indexed = !!first.index;
  const names = Object.keys(first.attributes || {}).sort();
  const specs = new Map(names.map((name) => [name, attributeSpec(first.getAttribute(name))]));
  for (const geometry of geometries) {
    if (!geometry || !!geometry.index !== indexed) return false;
    const nextNames = Object.keys(geometry.attributes || {}).sort();
    if (nextNames.length !== names.length || nextNames.some((name, index) => name !== names[index])) return false;
    for (const name of names) {
      if (!sameAttributeSpec(specs.get(name), attributeSpec(geometry.getAttribute(name)))) return false;
    }
  }
  return true;
}

function attributeArray(attr) {
  return attr && (attr.array || (attr.data && attr.data.array)) || null;
}

function attributeSpec(attr) {
  const array = attributeArray(attr);
  const ArrayType = array && array.constructor || Float32Array;
  return {
    itemSize: attr.itemSize || 1,
    normalized: !!attr.normalized,
    ArrayType,
  };
}

function sameAttributeSpec(a, b) {
  return !!(a && b && a.itemSize === b.itemSize && a.normalized === b.normalized && a.ArrayType === b.ArrayType);
}

function createEmptyAttribute(name, spec, count) {
  const ArrayType = spec.ArrayType || Float32Array;
  const array = new ArrayType(count * spec.itemSize);
  if (name === 'color') {
    const max = integerAttributeMax(ArrayType, spec.normalized);
    for (let i = 0; i < array.length; i++) array[i] = max;
  } else if (name === 'tangent' && spec.itemSize >= 4) {
    for (let i = 3; i < array.length; i += spec.itemSize) array[i] = 1;
  }
  return new THREE.BufferAttribute(array, spec.itemSize, spec.normalized);
}

function integerAttributeMax(ArrayType, normalized) {
  if (!normalized) return 1;
  if (ArrayType === Uint8Array || ArrayType === Uint8ClampedArray) return 255;
  if (ArrayType === Uint16Array) return 65535;
  return 1;
}

function addStaticBatchMesh(parent, bindings, geometry, material, tags, urls, label) {
  if (geometry && typeof geometry.computeBoundingSphere === 'function') geometry.computeBoundingSphere();
  if (geometry && typeof geometry.computeBoundingBox === 'function') geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `GLTFKit_${label || 'StaticBatch'}`;
  const materials = Array.isArray(material) ? material : [material];
  mesh.castShadow = materials.some((entry) => entry && !entry.transparent && entry.depthWrite !== false);
  mesh.receiveShadow = materials.some((entry) => entry && !entry.transparent);
  mesh.visible = !tags.lod || tags.lod === 'lod0';
  const partUrls = [...new Set((urls || []).filter(Boolean))];
  mesh.userData = {
    spacefaceStaticBatch: true,
    spacefaceStaticBatchMaterials: materials.length,
    spacefacePartUrl: partUrls[0],
    spacefacePartUrls: partUrls,
    spacefaceTags: tags,
  };
  parent.add(mesh);
  registerBinding(mesh, tags, bindings);
  return mesh;
}

function instantiatePart(record, parent, placement, palette, scene, owner, bindings, mutableMaterials, staticBatches = null) {
  if (record?.renderPackage && typeof record.renderPackage.createInstance === 'function') {
    return instantiateRenderPackagePart(
      record, parent, placement, palette, scene, owner, bindings, mutableMaterials,
    );
  }

  const partRoot = new THREE.Group();
  partRoot.name = `GLTFKit_${placement.label}_${record.assetId}`;
  applyPlacementTransform(partRoot, placement);
  const sourceLength = Math.max(record.bounds.size[0], 1e-6); // +X length is part of the authoring contract
  const scale = placement.targetLength / sourceLength;
  partRoot.scale.multiplyScalar(scale);
  partRoot.updateMatrix();
  parent.add(partRoot);

  for (const primitive of compositionPrimitives(record)) {
    const dedicated = requiresPerShipMesh(primitive);
    let object;
    if (dedicated) {
      // Preserve the authored node transform on an anchor. shipKit's drive driver intentionally
      // overwrites fan rotation/core/plume scale, so binding the inner identity mesh prevents that
      // state update from erasing an artist's placement or baked hierarchy scale.
      const anchor = new THREE.Object3D();
      anchor.name = `${placement.label}_${primitive.name}_Anchor`;
      const anchorMatrix = primitive.tags && primitive.tags.driveAnchorMatrix || primitive.matrix;
      anchorMatrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
      partRoot.add(anchor);

      const material = dedicatedMaterialFor(
        primitive.material, primitive.tags, palette, mutableMaterials,
        `${record.url}|${placement.label}|${primitive.key}`
      );
      object = new THREE.Mesh(primitive.geometry, material);
      stampGeometryBatchKey(object.geometry, `${record.url}|${primitive.name || primitive.key}`);
      if (primitive.tags && primitive.tags.driveAnchorMatrix) {
        BATCH_INVERSE.copy(anchorMatrix).invert();
        BATCH_LOCAL.multiplyMatrices(BATCH_INVERSE, primitive.matrix);
        BATCH_LOCAL.decompose(object.position, object.quaternion, object.scale);
      }
      object.castShadow = !material.transparent && material.depthWrite !== false;
      object.receiveShadow = !material.transparent;
      object.userData.keepSeparate = true;
      anchor.add(object);
    } else {
      const material = sharedMaterialFor(primitive.material, primitive.tags, palette);
      if (staticBatches) {
        staticBatches.add({ record, primitive, partRoot, material });
        continue;
      }
      object = new THREE.Object3D();
      object.userData.spacefaceInstanceProxy = true;
      primitive.matrix.decompose(object.position, object.quaternion, object.scale);
      allocateInstance(scene, owner, object, primitive.geometry, material, primitive.name);
      partRoot.add(object);
    }
    object.name = `${placement.label}_${primitive.name}`;
    object.visible = !primitive.tags.lod || primitive.tags.lod === 'lod0';
    object.userData.spacefacePartUrl = record.url;
    object.userData.spacefaceTags = primitive.tags;
    registerBinding(object, primitive.tags, bindings);
  }

  for (const marker of record.markers) {
    const object = new THREE.Object3D();
    object.name = marker.name;
    marker.matrix.decompose(object.position, object.quaternion, object.scale);
    object.userData = {
      ...marker.userData,
      spacefaceTags: marker.tags,
      spacefacePartNormalization: scale,
      spacefaceMount: marker.tags.mount || undefined,
      spacefaceMountKey: marker.tags.mountKey || undefined,
    };
    if (marker.tags.socket) {
      if (bindings.socketNames.has(marker.name)) continue; // deterministic first-wins across repeated parts
      bindings.socketNames.add(marker.name);
      object.userData.spacefaceSocket = true;
      object.userData.role = marker.tags.socketRole || marker.userData.role || 'attachment';
      object.userData.forward = marker.tags.socketForward || marker.userData.forward || [1, 0, 0];
    }
    object.visible = !marker.tags.lod || marker.tags.lod === 'lod0';
    partRoot.add(object);
    registerBinding(object, marker.tags, bindings);
  }
  return partRoot;
}

function instantiateRenderPackagePart(record, parent, placement, palette, scene, owner, bindings, mutableMaterials) {
  const partRoot = new THREE.Group();
  partRoot.name = `GLTFKit_${placement.label}_${record.assetId}`;
  applyPlacementTransform(partRoot, placement);
  const sourceLength = Math.max(record.bounds.size[0], 1e-6);
  const scale = placement.targetLength / sourceLength;
  partRoot.scale.multiplyScalar(scale);
  partRoot.updateMatrix();
  partRoot.userData.spacefaceFlightPackageRecipe = {
    url: record.url || null,
    assetId: record.assetId || record.renderPackage?.assetId || null,
    flightStaticV3: record.flightStaticV3 === true,
    label: placement.label || record.assetId || record.url || 'Package',
    position: partRoot.position.toArray(),
    quaternion: partRoot.quaternion.toArray(),
    scale: partRoot.scale.toArray(),
  };
  parent.add(partRoot);

  const tagsByName = new Map([
    ...(record.primitives || []).map((primitive) => [primitive.name, primitive.tags]),
    ...(record.markers || []).map((marker) => [marker.name, marker.tags]),
  ]);
  const createNode = canBatchRenderPackageOwner(owner?.userData?.kind) && scene?.isScene
    ? createRenderPackageShipNodeFactory({
        scene,
      owner,
      record,
      palette,
      tagsByName,
      poolAdmissions: bindings.packagePoolAdmissions,
    })
    : null;
  const createPackageInstance = record.flightStaticV3 === true
    ? record.renderPackage.createFlightInstance?.bind(record.renderPackage)
    : record.renderPackage.createInstance.bind(record.renderPackage);
  if (typeof createPackageInstance !== 'function') {
    throw new Error(
      `Render package ${record.renderPackage.assetId || record.assetId} has no `
      + `${record.flightStaticV3 === true ? 'flight-static' : 'ordinary'} instance route.`,
    );
  }
  const instance = createPackageInstance({
    name: `RenderPackage_${placement.label}_${record.assetId}`,
    residencyOwner: owner,
    residencyRole: 'live-boundary',
    ...(createNode ? { createNode } : {}),
  });
  const packageRoot = instance?.root;
  if (!packageRoot?.isObject3D) {
    throw new Error(`Render package ${record.renderPackage.assetId || record.assetId} returned no Object3D root.`);
  }
  packageRoot.userData = {
    ...(packageRoot.userData || {}),
    spacefaceRenderPackageDirect: true,
    spacefacePartUrl: record.url,
    ...(record.flightStaticV3 === true ? { spacefaceFlightStaticV3: true } : {}),
  };
  partRoot.userData.renderPackageInstance = instance;
  partRoot.add(packageRoot);

  // Specialisation walks the loader's FLAT instance plan, not packageRoot.traverse(). The plan is
  // in depth-first pre-order with the root at index 0, so this visits exactly the same nodes in
  // exactly the same order as the traversal it replaces — without the recursive descent or the
  // per-node callback. Index 0 is skipped for the same reason the traversal skipped packageRoot.
  const planNodes = instance.planNodes;
  if (!Array.isArray(planNodes) || planNodes[0] !== packageRoot) {
    throw new Error(
      `Render package ${record.renderPackage.assetId || record.assetId} instance exposed no flat plan; `
      + 'the loader must publish planNodes for package instantiation.',
    );
  }
  for (let i = 1; i < planNodes.length; i++) {
    const object = planNodes[i];
    const tags = tagsByName.get(object.name) || object.userData?.spacefaceTags || {};
    object.userData = {
      ...(object.userData || {}),
      spacefacePartUrl: record.url,
      spacefaceTags: tags,
      spacefaceRenderPackageDirect: true,
      spacefacePartNormalization: scale,
    };

    // NOTE: `continue`, not `return` — this body used to be a traverse() callback, where `return`
    // meant "skip this node". In the flat loop the same word would abandon the whole instance.
    if (object.isMesh) {
      if (object.visible === false) continue;
      stampGeometryBatchKey(object.geometry, `${record.assetId || record.url}|${object.name}`);
      const primitive = { material: object.material, tags };
      if (object.userData?.spacefacePackageMaterialPrepared !== true) {
        object.material = requiresPerShipMesh(primitive)
          ? dedicatedMaterialFor(
              object.material, tags, palette, mutableMaterials,
              `${record.url}|${placement.label}|${object.name}`,
            )
          : sharedMaterialFor(object.material, tags, palette);
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.castShadow = materials.some((material) => material && !material.transparent && material.depthWrite !== false);
      object.receiveShadow = materials.some((material) => material && !material.transparent);
      object.visible = !tags.lod || tags.lod === 'lod0';
      registerBinding(object, tags, bindings);
      continue;
    }

    if (tags.socket) {
      if (bindings.socketNames.has(object.name)) {
        object.visible = false;
        continue;
      }
      bindings.socketNames.add(object.name);
      object.userData.spacefaceSocket = true;
      object.userData.role = tags.socketRole || object.userData.role || 'attachment';
      object.userData.forward = tags.socketForward || object.userData.forward || [1, 0, 0];
    }
    object.visible = !tags.lod || tags.lod === 'lod0';
    registerBinding(object, tags, bindings);
  }
  const tier1 = tier1CausalCounters();
  if (tier1) tier1.countPlanInstantiation(planNodes.length - 1, 'package-instance-specialize');
  return partRoot;
}

function createRenderPackageShipNodeFactory({
  scene, owner, record, palette, tagsByName, poolAdmissions,
}) {
  return ({ source }) => {
    const tags = tagsByName.get(source.name) || source.userData?.spacefaceTags || {};
    if (!canPoolRenderPackageShipMesh(source, tags)) return null;

    const material = sharedMaterialFor(source.material, tags, palette);
    const object = source.clone(false);
    stampGeometryBatchKey(object.geometry, `${record.assetId || 'PackageShip'}|${source.name || 'Mesh'}`);
    object.material = material;
    object.userData = {
      ...(object.userData || {}),
      spacefacePackageMaterialPrepared: true,
    };
    return admitRenderPackageShipPoolCandidate(
      scene,
      owner,
      object,
      source.geometry,
      material,
      `${record.assetId || 'PackageShip'}_${source.name || 'Mesh'}`,
      poolAdmissions,
    );
  };
}

function canPoolRenderPackageShipMesh(source, tags = {}) {
  if (!isRigidOpaqueBatchableSurface(source, tags, { requiresPerShipMesh })) return false;
  if (source.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
    || source.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return false;
  return true;
}

function admitRenderPackageShipPoolCandidate(
  scene, owner, object, geometry, material, label, poolAdmissions,
) {
  const state = sceneState(scene);
  const key = instancePoolKey(geometry, material);
  const pool = state.pools.get(key) || null;
  const hasPackageSlots = packagePoolSlots(pool).length > 0;
  const first = state.packageCandidates.get(key) || null;
  const nextCandidate = createPackagePoolCandidate(key, owner, object, geometry, material, label);

  if (!hasPackageSlots && !first) {
    installPackagePoolCandidate(state, nextCandidate);
    return object;
  }

  // Repetition inside one authored root is not the cross-root batching contract. Keep those meshes
  // direct until another stable ship boundary proves that this resource identity really repeats.
  if (!hasPackageSlots && first?.owner === owner) return object;

  const live = authoredRuntimeState();
  const deferNewChunkPublication = !live || live.mode === 'loading';
  const allocations = [];
  try {
    if (!hasPackageSlots && first) {
      allocations.push(allocateInstance(
        scene,
        first.owner,
        first.object,
        first.geometry,
        first.object.material || first.material,
        first.label,
        {
          deferNewChunkPublication,
          initializeVisibleMatrix: true,
          deferProxyActivation: deferNewChunkPublication,
          activateProxy: () => promoteRenderPackageMeshToPoolProxy(first.object, key),
          packageCandidate: first,
        },
      ));
    }
    allocations.push(allocateInstance(scene, owner, object, geometry, material, label, {
      deferNewChunkPublication,
      deferProxyActivation: deferNewChunkPublication,
      activateProxy: () => promoteRenderPackageMeshToPoolProxy(object, key),
      packageCandidate: nextCandidate,
    }));

    const immediateByChunk = new Map();
    for (const allocation of allocations) {
      if (allocation.admission) continue;
      let handles = immediateByChunk.get(allocation.slot.chunk);
      if (!handles) immediateByChunk.set(allocation.slot.chunk, handles = []);
      handles.push(allocation);
    }
    for (const handles of immediateByChunk.values()) {
      activatePackageSlotsTransaction(handles[0].slot.chunk, handles.map((handle) => handle.slot));
    }
  } catch (error) {
    for (const allocation of allocations) {
      restoreDirectPackageMesh(allocation.slot.proxy, false);
      allocation.rollback();
    }
    if (first) installPackagePoolCandidate(state, first);
    throw error;
  }

  // Candidate retirement is the transaction commit: every required slot exists and any already-
  // admitted chunk transfer succeeded, while new chunks remain direct until exact GPU admission.
  if (first && state.packageCandidates.get(key) === first) state.packageCandidates.delete(key);

  for (const allocation of allocations) {
    if (allocation?.admission) poolAdmissions?.add(allocation.admission);
  }
  return object;
}

function createPackagePoolCandidate(key, owner, object, geometry, material, label) {
  return { key, owner, object, geometry, material, label };
}

function installPackagePoolCandidate(state, candidate) {
  if (!state || !candidate) return false;
  state.packageCandidates.set(candidate.key, candidate);
  restoreDirectPackageMesh(candidate.object, true);
  candidate.object.userData.spacefaceInstancePoolKey = candidate.key;
  if (candidate.releaseRegistered !== true) {
    candidate.releaseRegistered = true;
    registerOwnerRelease(candidate.owner, () => {
      if (state.packageCandidates.get(candidate.key) === candidate) {
        state.packageCandidates.delete(candidate.key);
      }
    });
  }
  return true;
}

function promoteRenderPackageMeshToPoolProxy(object, key) {
  // Keep visibility true: pool visibility follows this exact object's ancestor/LOD chain. Suppress
  // only direct Mesh submission so the same object can remain in planNodes/nodes/anchors maps while
  // the scene-level InstancedMesh owns the draw. Geometry/material stay attached for bounds,
  // texture-residency collection, diagnostics, and semantic inspection.
  object.isMesh = false;
  object.userData = {
    ...(object.userData || {}),
    spacefaceInstanceProxy: true,
    spacefaceRenderPackagePooled: true,
    spacefaceInstancePoolKey: key,
  };
  delete object.userData.spacefacePackagePoolCandidate;
  return object;
}

function restoreDirectPackageMesh(object, asCandidate) {
  if (!object) return object;
  object.isMesh = true;
  object.userData = { ...(object.userData || {}) };
  delete object.userData.spacefaceInstanceProxy;
  delete object.userData.spacefaceRenderPackagePooled;
  delete object.userData.spacefacePackagePoolCandidate;
  delete object.userData.spacefaceInstancePoolChunk;
  delete object.userData.spacefaceInstancePoolSlot;
  if (asCandidate) {
    object.userData.spacefacePackagePoolCandidate = true;
  } else {
    delete object.userData.spacefaceInstancePoolKey;
  }
  return object;
}

function prepareRenderPackagePoolAdmission(admission, options) {
  if (!admission || admission.cancelled) {
    return Promise.resolve({ skipped: true, reason: 'package pool admission cancelled' });
  }
  if (admission.prepared) return Promise.resolve(admission.result);
  if (!admission.preparation) {
    admission.preparation = prepareAuthoredVisualPipelines(admission.target, options).then((result) => {
      admission.result = result;
      admission.prepared = !admission.cancelled;
      return result;
    }, (error) => {
      // A later repeated root may retry the same still-hidden exact target. The already-live first
      // direct mesh remains untouched until one preparation succeeds.
      admission.preparation = null;
      throw error;
    });
  }
  return admission.preparation;
}

function activateRenderPackagePoolAdmission(admission) {
  if (!admission || admission.cancelled || !admission.prepared || admission.activated) return false;
  const { chunk } = admission;
  const liveSlots = [...admission.slots].filter((slot) => !slot.released);
  if (!liveSlots.length) {
    admission.cancelled = true;
    return false;
  }

  // The exact InstancedMesh has completed both existing admission gates while detached and at zero
  // count. Commit every visible matrix first, then transfer renderer identity and scene publication
  // under one rollback guard so the accepted direct surface can never disappear on an exception.
  activatePackageSlotsTransaction(chunk, liveSlots, { publishTarget: true });
  for (const slot of liveSlots) slot.admission = null;
  delete chunk.mesh.userData.spacefacePackageAdmissionPending;
  chunk.packageAdmission = null;
  admission.slots.clear();
  admission.activated = true;
  return true;
}

function activatePackageSlotsTransaction(chunk, slots, options = {}) {
  const liveSlots = slots.filter((slot) => slot && !slot.released);
  if (!liveSlots.length) return false;
  const priorCount = chunk.mesh.count;
  const priorVisible = chunk.mesh.visible;
  const matrixSnapshots = liveSlots.map((slot) => ({
    slot,
    matrixInitialized: slot.matrixInitialized,
    matrixElements: slot.matrixElements.slice(),
    lastSubmitted: slot.lastSubmitted,
    visibleIndex: chunk.visibleIndices.has(slot.index),
    ownerSubmittedCount: slot.ownerState.submittedCount,
  }));

  try {
    for (const slot of liveSlots) {
      if (!visibleProxyChainReachesOwner(slot.proxy, slot.owner)) continue;
      slot.owner.updateWorldMatrix(true, true);
      if (setInstanceMatrixIfChanged(chunk, slot.index, slot, slot.proxy.matrixWorld)) {
        chunk.visibleIndices.add(slot.index);
        if (!slot.lastSubmitted) slot.ownerState.submittedCount++;
        slot.lastSubmitted = true;
      }
    }
    chunk.mesh.count = highestSubmittedIndex(chunk) + 1;
    chunk.mesh.visible = chunk.mesh.count > 0;
    commitInstanceChunkMatrix(chunk);
  } catch (error) {
    rollbackPackageSlotMatrices(chunk, matrixSnapshots, priorCount, priorVisible);
    throw error;
  }

  const proxySnapshots = [];
  let published = false;
  try {
    for (const slot of liveSlots) {
      if (!slot.activateProxy) continue;
      proxySnapshots.push({ object: slot.proxy, isMesh: slot.proxy.isMesh, userData: slot.proxy.userData });
      slot.activateProxy();
    }
    if (options.publishTarget === true && !chunk.mesh.parent) {
      chunk.scene.add(chunk.mesh);
      published = true;
    }
    for (const slot of liveSlots) slot.activateProxy = null;
    return true;
  } catch (error) {
    if (published || chunk.mesh.parent === chunk.scene) chunk.mesh.removeFromParent();
    for (let index = proxySnapshots.length - 1; index >= 0; index--) {
      const snapshot = proxySnapshots[index];
      snapshot.object.isMesh = snapshot.isMesh;
      snapshot.object.userData = snapshot.userData;
    }
    rollbackPackageSlotMatrices(chunk, matrixSnapshots, priorCount, priorVisible);
    throw error;
  }
}

function rollbackPackageSlotMatrices(chunk, snapshots, priorCount, priorVisible) {
  for (const snapshot of snapshots) {
    const { slot } = snapshot;
    slot.matrixInitialized = snapshot.matrixInitialized;
    slot.matrixElements.set(snapshot.matrixElements);
    slot.lastSubmitted = snapshot.lastSubmitted;
    slot.ownerState.submittedCount = snapshot.ownerSubmittedCount;
    if (snapshot.visibleIndex) chunk.visibleIndices.add(slot.index);
    else chunk.visibleIndices.delete(slot.index);
    try {
      writeInstanceChunkMatrix(chunk, slot.index, snapshot.matrixInitialized
        ? new THREE.Matrix4().fromArray(snapshot.matrixElements)
        : ZERO_MATRIX);
    } catch { /* detached/rolled-back target remains non-rendering even if the injected write fails */ }
  }
  chunk.mesh.count = priorCount;
  chunk.mesh.visible = priorVisible;
  try { commitInstanceChunkMatrix(chunk); }
  catch { /* preserve the original activation failure */ }
}

function createBindings() {
  return {
    driveFans: [], driveCores: [], drivePlumes: [],
    navLights: [], sensorSlits: [], armor: [], secondary: [], decals: [],
    socketNames: new Set(),
    mounts: { cockpit: [], engine: [], fin: [] },
    lod: { lod0: [], lod1: [], lod2: [] },
    lodDynamicDetails: [],
    packagePoolAdmissions: new Set(),
  };
}

function registerBinding(object, tags, bindings) {
  const renderable = object.isMesh || !!(object.userData && object.userData.spacefaceInstanceProxy);
  if (tags.drive === 'fan' && object.isMesh) bindings.driveFans.push(object);
  if (tags.drive === 'core' && object.isMesh) bindings.driveCores.push(object);
  if (tags.drive === 'plume' && object.isMesh) bindings.drivePlumes.push(object);
  if (tags.damageRole === 'navLight' && object.isMesh) bindings.navLights.push(object);
  if (tags.damageRole === 'sensor' && object.isMesh) bindings.sensorSlits.push(object);
  if (tags.damageRole === 'armor' && object.isMesh) bindings.armor.push(object);
  if (tags.damageRole === 'secondary' && renderable) bindings.secondary.push(object);
  if (tags.decal && object.isMesh) bindings.decals.push(object);
  if (tags.mount && bindings.mounts[tags.mount]) bindings.mounts[tags.mount].push(object);
  if (renderable && tags.lod && bindings.lod[tags.lod]) bindings.lod[tags.lod].push(object);
  if (renderable && isLodDynamicDetail(tags)) bindings.lodDynamicDetails.push(object);
}

function isLodDynamicDetail(tags = {}) {
  return tags.drive === 'fan';
}

function requiresPerShipMesh(primitive) {
  const tags = primitive.tags;
  const material = primitive.material;
  return tags.instance === false || tags.canopy || !!tags.drive ||
    tags.damageRole === 'navLight' || tags.damageRole === 'sensor' || tags.damageRole === 'armor' || tags.decal ||
    material.transparent || material.transmission > 0 || material.depthWrite === false;
}

function completeDriveBinding(bindings) {
  const fan = bindings.driveFans[0] || null;
  const driveCore = bindings.driveCores[0] || null;
  const plume = bindings.drivePlumes[0] || null;
  if (!fan || !driveCore) return null;
  for (const driveFan of bindings.driveFans) kit.captureDrivePose(driveFan);
  for (const core of bindings.driveCores) kit.captureDrivePose(core);
  for (const drivePlume of bindings.drivePlumes) {
    normalizeAuthoredDrivePlume(drivePlume);
    kit.captureDrivePose(drivePlume);
    if (drivePlume.material) {
      drivePlume.material.transparent = true;
      drivePlume.material.depthWrite = false;
      if (!Number.isFinite(drivePlume.material.opacity)) drivePlume.material.opacity = 0.55;
    }
    drivePlume.castShadow = false;
    drivePlume.receiveShadow = false;
    drivePlume.renderOrder = Math.max(drivePlume.renderOrder || 0, 2);
  }
  return {
    fan,
    driveCore,
    plume,
    plumeMat: plume && plume.material || null,
    basePlumeOpacity: plume && plume.material && Number.isFinite(plume.material.opacity) ? plume.material.opacity : 0.55,
    flicker: false,
  };
}

function synchronizeSecondaryDrives(primary, bindings) {
  if (!primary || !primary.fan) return;
  const before = primary.fan.onBeforeRender;
  const primaryCorePose = kit.captureDrivePose(primary.driveCore);
  const primaryPlumePose = kit.captureDrivePose(primary.plume);
  const coreFactor = new THREE.Vector3(1, 1, 1);
  const plumeFactor = new THREE.Vector3(1, 1, 1);
  const secondaryCores = bindings.driveCores.slice(1).map((mesh) => ({
    mesh,
    pose: kit.captureDrivePose(mesh),
  }));
  const secondaryPlumes = bindings.drivePlumes.slice(1).map((mesh) => ({
    mesh,
    pose: kit.captureDrivePose(mesh),
  }));
  primary.fan.onBeforeRender = function synchronizedDrive(...args) {
    if (typeof before === 'function') before.apply(this, args);
    for (let i = 1; i < bindings.driveFans.length; i++) {
      bindings.driveFans[i].rotation.x = primary.fan.rotation.x;
    }
    if (primary.driveCore && primaryCorePose) {
      kit.readDrivePoseScaleFactors(primary.driveCore, primaryCorePose, coreFactor);
      for (const { mesh, pose } of secondaryCores) {
        kit.applyDrivePoseScale(mesh, pose, coreFactor);
      }
    }
    if (primary.plume && primaryPlumePose) {
      kit.readDrivePoseScaleFactors(primary.plume, primaryPlumePose, plumeFactor);
      for (const { mesh, pose } of secondaryPlumes) {
        kit.applyDrivePoseScale(mesh, pose, plumeFactor, { lockForwardEdgeX: true });
        if (mesh.material && primary.plume.material) {
          mesh.material.opacity = primary.plume.material.opacity;
        }
      }
    }
  };
}

function authoredLevels(record) {
  const levels = new Set();
  let alwaysVisible = false;
  for (const primitive of record.primitives) {
    if (primitive.tags.lod) levels.add(primitive.tags.lod);
    else alwaysVisible = true;
  }
  if (alwaysVisible) {
    levels.add('lod0'); levels.add('lod1'); levels.add('lod2');
  }
  return levels;
}

function installAuthoredLod(root, bindings, safetyCore, authoredHullLevels, wholeShip = false) {
  const baseUpdate = root.userData.updateLod;
  const levelsByPart = new Map();
  let appliedLevel = null;
  for (const [bucket, objects] of Object.entries(bindings.lod)) {
    for (const object of objects) {
      const key = lodPartKey(object);
      if (!levelsByPart.has(key)) levelsByPart.set(key, new Set());
      levelsByPart.get(key).add(bucket);
    }
  }
  root.userData.updateLod = function updateComposedLod(level) {
    const requested = normalizeRequestedLod(level);
    if (requested === appliedLevel) return;
    appliedLevel = requested;
    if (typeof baseUpdate === 'function') baseUpdate(level);
    for (const [bucket, objects] of Object.entries(bindings.lod)) {
      for (const object of objects) {
        object.visible = bucket === closestAvailableLod(requested, levelsByPart.get(lodPartKey(object)));
      }
    }
    for (const object of bindings.lodDynamicDetails) {
      const tags = object && object.userData && object.userData.spacefaceTags || {};
      const baseVisible = !tags.lod || tags.lod === closestAvailableLod(requested, levelsByPart.get(lodPartKey(object)));
      object.visible = baseVisible && requested !== 'lod2';
    }
    const visibleAuthoredHullLevel = closestAvailableLod(requested, authoredHullLevels);
    if (safetyCore) {
      safetyCore.visible = !wholeShip && !authoredHullLevels.has(visibleAuthoredHullLevel);
    }
    if (root.userData.damageState === 'critical') {
      for (const secondary of bindings.secondary) secondary.visible = false;
    }
  };
}

function lodPartKey(object) {
  return object && object.userData && object.userData.spacefacePartUrl || (object && object.uuid) || 'unknown';
}

function closestAvailableLod(requested, available) {
  if (!available || available.has(requested)) return requested;
  if (requested === 'lod2' && available.has('lod1')) return 'lod1';
  if (available.has('lod0')) return 'lod0';
  if (available.has('lod1')) return 'lod1';
  return 'lod2';
}

// -------------------------------------------------------------------------------------------------
// Scene-level instance pools. A ship owns transform proxies; pools own the draw calls. Removal of the
// stable ship root releases all of its slots immediately, so hot reload/rebuild cannot leave ghosts.
// -------------------------------------------------------------------------------------------------
function allocateInstance(scene, owner, proxy, geometry, material, label, options = {}) {
  const state = sceneState(scene);
  const key = instancePoolKey(geometry, material);
  let pool = state.pools.get(key);
  const poolIsNew = !pool;
  if (!pool) {
    pool = { chunks: [], geometry, material, label, key, scene };
  }
  let chunk = pool.chunks.find((candidate) => candidate.free.length || candidate.next < INSTANCE_CHUNK_SIZE);
  if (!chunk) {
    try {
      chunk = createInstanceChunk(scene, pool, pool.chunks.length, {
        deferScenePublication: options.deferNewChunkPublication === true,
      });
    } catch (error) {
      if (poolIsNew) state.pools.delete(key);
      throw error;
    }
    pool.chunks.push(chunk);
  }
  if (poolIsNew) state.pools.set(key, pool);

  const index = chunk.free.length ? chunk.free.pop() : chunk.next++;
  const admission = chunk.packageAdmission || null;
  const slot = {
    proxy,
    owner,
    chunk,
    index,
    released: false,
    lastSubmitted: false,
    matrixInitialized: false,
    matrixElements: new Float32Array(16),
    admission,
    activateProxy: typeof options.activateProxy === 'function' ? options.activateProxy : null,
    packageCandidate: options.packageCandidate || null,
    ownerState: null,
  };
  try {
    chunk.slots.set(index, slot);
    let ownerState = state.ownerSlots.get(owner);
    if (!ownerState) {
      ownerState = { slots: new Set(), submittedCount: 0, dirty: true };
      state.ownerSlots.set(owner, ownerState);
    }
    ownerState.slots.add(slot);
    slot.ownerState = ownerState;
    proxy.userData = {
      ...(proxy.userData || {}),
      spacefaceInstancePoolKey: key,
      spacefaceInstancePoolChunk: chunk.ordinal,
      spacefaceInstancePoolSlot: index,
    };
    writeInstanceChunkMatrix(chunk, index, ZERO_MATRIX);
    if (admission) {
      admission.slots.add(slot);
    } else {
      if (slot.activateProxy && options.deferProxyActivation !== true) {
        slot.activateProxy();
        slot.activateProxy = null;
      }
      chunk.mesh.count = Math.max(chunk.mesh.count, index + 1);
      if (options.initializeVisibleMatrix === true && visibleProxyChainReachesOwner(proxy, owner)) {
        owner.updateWorldMatrix(true, true);
        if (setInstanceMatrixIfChanged(chunk, index, slot, proxy.matrixWorld)) {
          chunk.visibleIndices.add(index);
          ownerState.submittedCount++;
          slot.lastSubmitted = true;
        }
      }
    }
    commitInstanceChunkMatrix(chunk);
  } catch (error) {
    releaseInstanceSlot(state, pool, slot);
    throw error;
  }

  const release = () => {
    const retirements = [];
    if (slot.released) {
      const chunk = slot.chunk;
      if (chunk && !chunk.retired && state.retiringChunks.has(chunk)) {
        retirements.push(scheduleRetiredInstanceChunkFinalization(
          state, pool, chunk, chunk.packageAdmission, null,
        ));
      }
    } else {
      releaseInstanceSlot(state, pool, slot, { retirements });
    }
    return retirements.length ? Promise.all(retirements) : true;
  };
  const rollback = () => releaseInstanceSlot(state, pool, slot, { skipPackageCollapse: true });
  try {
    registerOwnerRelease(owner, release);
  } catch (error) {
    release();
    throw error;
  }
  return { release, rollback, admission, slot };
}

function releaseInstanceSlot(state, pool, slot, options = {}) {
  if (!slot || slot.released) return false;
  slot.released = true;
  const { chunk, index, owner, ownerState } = slot;
  if (slot.lastSubmitted) {
    chunk.visibleIndices.delete(index);
    ownerState.submittedCount = Math.max(0, ownerState.submittedCount - 1);
  }
  slot.lastSubmitted = false;
  if (slot.admission) slot.admission.slots.delete(slot);
  chunk.slots.delete(index);
  ownerState?.slots.delete(slot);
  if (ownerState && !ownerState.slots.size) {
    state.ownerSlots.delete(owner);
    state.activeFrameOwners.delete(owner);
  }
  chunk.free.push(index);
  try {
    writeInstanceChunkMatrix(chunk, index, ZERO_MATRIX);
    chunk.mesh.count = highestSubmittedIndex(chunk) + 1;
    chunk.mesh.visible = chunk.mesh.count > 0;
    commitInstanceChunkMatrix(chunk);
  } finally {
    const collapsed = options.skipPackageCollapse !== true && collapsePackagePoolIfUnique(state, pool, options);
    if (!collapsed) retireInstancePoolIfEmpty(state, pool, options);
  }
  return true;
}

function visibleProxyChainReachesOwner(proxy, owner) {
  if (!proxy || !owner?.parent) return false;
  for (let current = proxy; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === owner) return true;
  }
  return false;
}

function createInstanceChunk(scene, pool, ordinal, options = {}) {
  const mesh = new THREE.InstancedMesh(pool.geometry, pool.material, INSTANCE_CHUNK_SIZE);
  mesh.name = `GLTFKit_InstancePool_${pool.label}_${ordinal}`;
  mesh.count = 0;
  mesh.frustumCulled = false; // world positions span the scene; source-geometry bounds are meaningless
  mesh.castShadow = !pool.material.transparent && pool.material.depthWrite !== false;
  mesh.receiveShadow = !pool.material.transparent;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.spacefaceInstancePool = true;
  mesh.userData.spacefaceInstancePoolKey = pool.key;
  mesh.userData.spacefaceInstancePoolLabel = pool.label;
  mesh.userData.spacefaceInstancePoolChunk = ordinal;
  stampOpeningSubmissionPackage(mesh, {
    schema: 'spaceface.authoredInstancePoolProducer.v1',
    producer: 'parts-library-authored-instance-pool',
    label: pool.label,
    geometry: {
      type: pool.geometry && pool.geometry.type || 'BufferGeometry',
      attributes: Object.keys(pool.geometry?.attributes || {}).sort().map((name) => {
        const attribute = pool.geometry.attributes[name];
        return {
          name,
          itemSize: attribute && attribute.itemSize || 0,
          normalized: attribute && attribute.normalized === true,
        };
      }),
    },
    material: {
      type: pool.material && pool.material.type || 'Material',
      transparent: pool.material && pool.material.transparent === true,
      vertexColors: pool.material && pool.material.vertexColors === true,
    },
    instanceAbi: ['instanceMatrix'],
  }, {
    assetId: `authored-instance-pool-${pool.label}`,
    producer: 'parts-library-authored-instance-pool',
  });
  const dynamicBufferOwner = registerDynamicBufferOwner(scene, {
    id: `authored-instance-${mesh.id}`,
    mesh,
    attributes: [{ name: 'matrix', attribute: mesh.instanceMatrix }],
  });
  const chunk = {
    mesh,
    pool,
    slots: new Map(),
    visibleIndices: new Set(),
    free: [],
    next: 0,
    dynamicBufferOwner,
    ordinal,
    scene,
    packageAdmission: null,
  };
  if (options.deferScenePublication === true) {
    chunk.packageAdmission = {
      target: mesh,
      chunk,
      slots: new Set(),
      preparation: null,
      prepared: false,
      activated: false,
      cancelled: false,
    };
    mesh.userData.spacefacePackageAdmissionPending = true;
  } else {
    scene.add(mesh);
  }
  return chunk;
}

function packagePoolSlots(pool) {
  if (!pool) return EMPTY_ARRAY;
  const slots = [];
  for (const chunk of pool.chunks) {
    for (const slot of chunk.slots.values()) {
      if (!slot.released && slot.packageCandidate) slots.push(slot);
    }
  }
  return slots;
}

function collapsePackagePoolIfUnique(state, pool, options = {}) {
  const slots = packagePoolSlots(pool);
  if (!slots.length || new Set(slots.map((slot) => slot.owner)).size >= 2) return false;
  const candidate = slots[0].packageCandidate;
  for (const slot of slots) restoreDirectPackageMesh(slot.proxy, false);
  for (const slot of slots) {
    releaseInstanceSlot(state, pool, slot, {
      skipPackageCollapse: true,
      retirements: options.retirements,
    });
  }
  if (candidate?.owner?.parent) installPackagePoolCandidate(state, candidate);
  return true;
}

function retireInstancePoolIfEmpty(state, pool, options = {}) {
  if (!pool || pool.chunks.some((chunk) => chunk.slots.size > 0)) return false;
  const retirements = Array.isArray(options.retirements) ? options.retirements : null;
  if (pool.retirementPending) {
    if (retirements) {
      for (const chunk of pool.chunks) {
        if (chunk.retirementPromise) retirements.push(chunk.retirementPromise);
      }
    }
    return true;
  }
  pool.retirementPending = true;
  if (state.pools.get(pool.key) === pool) state.pools.delete(pool.key);
  const immediateErrors = [];
  for (const chunk of [...pool.chunks]) {
    state.retiringChunks.add(chunk);
    const admission = chunk.packageAdmission || null;
    if (admission) {
      admission.cancelled = true;
      admission.slots.clear();
      delete chunk.mesh.userData.spacefacePackageAdmissionPending;
    }
    if (admission && admission.preparation && !admission.prepared) {
      // GPU compilation/upload still owns this exact target. Logical cancellation is immediate, but
      // object/dynamic-buffer disposal must wait for that admitted work to settle.
      const retirement = scheduleRetiredInstanceChunkFinalization(
        state, pool, chunk, admission, admission.preparation,
      );
      if (retirements) retirements.push(retirement);
    } else {
      try { finalizeRetiredInstanceChunk(state, pool, chunk, admission); }
      catch (error) { immediateErrors.push(error); }
    }
  }
  if (immediateErrors.length) {
    throw new AggregateError(immediateErrors, `Instance pool ${pool.key} retirement failed`);
  }
  return true;
}

function scheduleRetiredInstanceChunkFinalization(state, pool, chunk, admission, barrier) {
  if (!chunk || chunk.retired) return Promise.resolve(chunk);
  if (chunk.retirementSettling && chunk.retirementPromise) return chunk.retirementPromise;
  chunk.retirementSettling = true;
  const ready = barrier
    ? Promise.resolve(barrier).then(() => null, () => null)
    : Promise.resolve();
  const retirement = ready.then(() => finalizeRetiredInstanceChunk(state, pool, chunk, admission));
  chunk.retirementPromise = retirement.then(
    (value) => {
      chunk.retirementSettling = false;
      chunk.retirementError = null;
      return value;
    },
    (error) => {
      chunk.retirementSettling = false;
      chunk.retirementError = error;
      throw error;
    },
  );
  chunk.retirementPromise.catch(() => null);
  return chunk.retirementPromise;
}

function finalizeRetiredInstanceChunk(state, pool, chunk, admission) {
  if (!chunk || chunk.retired) return chunk;
  const cleanupErrors = [];
  const attempt = (cleanup) => {
    try { cleanup(); }
    catch (error) { cleanupErrors.push(error); }
  };
  if (chunk.dynamicBufferOwner) {
    attempt(() => {
      unregisterDynamicBufferOwner(chunk.dynamicBufferOwner);
      chunk.dynamicBufferOwner = null;
    });
  }
  if (chunk.meshRemoved !== true) {
    attempt(() => {
      chunk.mesh.removeFromParent();
      chunk.meshRemoved = true;
    });
  }
  if (chunk.meshDisposed !== true) {
    attempt(() => {
      chunk.mesh.dispose();
      chunk.meshDisposed = true;
    });
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, `Instance chunk ${chunk.mesh?.name || chunk.ordinal} cleanup failed`);
  }
  chunk.retired = true;
  if (chunk.packageAdmission === admission) chunk.packageAdmission = null;
  state.affectedChunks.delete(chunk);
  state.retiringChunks.delete(chunk);
  chunk.slots.clear();
  chunk.visibleIndices.clear();
  chunk.free.length = 0;
  const index = pool.chunks.indexOf(chunk);
  if (index >= 0) pool.chunks.splice(index, 1);
  return chunk;
}

function writeInstanceChunkMatrix(chunk, index, matrix) {
  assertDynamicBufferOwnerWritable(chunk.dynamicBufferOwner);
  chunk.mesh.setMatrixAt(index, matrix);
  markDynamicBufferItems(chunk.dynamicBufferOwner, AUTHORED_INSTANCE_MATRIX, index);
}

function commitInstanceChunkMatrix(chunk) {
  if (chunk.dynamicBufferOwner) {
    commitDynamicBufferOwner(chunk.dynamicBufferOwner, chunk.mesh.count);
  } else {
    chunk.mesh.instanceMatrix.needsUpdate = true;
  }
}

function syncSceneState(state, opts = {}) {
  const stats = resetPoolStats(state);
  if (!state.pools.size) return stats;
  const context = buildInstanceCullContext(state, opts);
  primePoolStats(state, stats);
  if (context.frameBounded) syncSceneStateFromFrame(state, context, stats);
  else syncSceneStateFallback(state, context, stats);
  finalizePoolStats(state, stats);
  return stats;
}

function syncSceneStateFromFrame(state, context, stats) {
  const affectedChunks = state.affectedChunks;
  affectedChunks.clear();
  const nextOwners = state.nextFrameOwners;
  nextOwners.clear();

  for (const record of context.authoredRecords) {
    const owner = record && record.mesh;
    const ownerState = owner && state.ownerSlots.get(owner);
    if (!owner || !ownerState) continue;
    context.recordsByOwner.set(owner, record);
    nextOwners.add(owner);
    const needsSync = context.cameraDirty
      || record.renderDirty === true
      || ownerState.dirty
      || !state.activeFrameOwners.has(owner);
    if (!needsSync) {
      stats.matrixReuses += ownerState.submittedCount;
      continue;
    }
    syncOwnerSlots(ownerState, context, stats, affectedChunks, false);
  }

  // Owners omitted from this frame were hidden, culled, destroyed, or replaced. Clear only those
  // previously-active owners instead of rescanning every pool/chunk/slot for ghosts.
  for (const owner of state.activeFrameOwners) {
    if (nextOwners.has(owner)) continue;
    const ownerState = state.ownerSlots.get(owner);
    if (ownerState) syncOwnerSlots(ownerState, context, stats, affectedChunks, true);
  }

  for (const chunk of affectedChunks) finalizeInstanceChunk(chunk, true, stats, context);
  const previousOwners = state.activeFrameOwners;
  state.activeFrameOwners = nextOwners;
  state.nextFrameOwners = previousOwners;
  state.nextFrameOwners.clear();
  applyInstanceChunkPolicies(state, context);
  consolidateOpaqueInstanceChunks(state, context);
}

function syncSceneStateFallback(state, context, stats) {
  for (const pool of state.pools.values()) {
    for (const chunk of pool.chunks) syncInstanceChunk(chunk, context, stats);
  }
  state.activeFrameOwners.clear();
  consolidateOpaqueInstanceChunks(state, context);
}

function syncInstanceChunk(chunk, context, stats) {
  let dirty = false;
  for (const slot of chunk.slots.values()) {
    if (slot.released) continue;
    stats.slotsVisited++;
    if (syncInstanceSlot(slot, context, stats, false)) dirty = true;
  }
  finalizeInstanceChunk(chunk, dirty, stats, context);
}

function syncOwnerSlots(ownerState, context, stats, affectedChunks, forceHidden) {
  stats.ownersVisited++;
  for (const slot of ownerState.slots) {
    if (!slot || slot.released) continue;
    stats.slotsVisited++;
    if (syncInstanceSlot(slot, context, stats, forceHidden)) affectedChunks.add(slot.chunk);
  }
  ownerState.dirty = false;
}

function syncInstanceSlot(slot, context, stats, forceHidden) {
  const chunk = slot.chunk;
  if (chunk.packageAdmission && !chunk.packageAdmission.activated) return false;
  const index = slot.index;
  const record = context.recordsByOwner && context.recordsByOwner.get(slot.owner);
  const visible = !forceHidden && isVisibleToOwner(slot.proxy, slot.owner, context, stats, record);
  if (!visible) {
    if (!slot.lastSubmitted) return false;
    writeInstanceChunkMatrix(chunk, index, ZERO_MATRIX);
    chunk.visibleIndices.delete(index);
    slot.ownerState.submittedCount = Math.max(0, slot.ownerState.submittedCount - 1);
    slot.matrixInitialized = false;
    slot.lastSubmitted = false;
    return true;
  }

  let dirty = setInstanceMatrixIfChanged(chunk, index, slot, slot.proxy.matrixWorld);
  if (dirty) stats.matrixUploads++;
  else stats.matrixReuses++;
  if (!slot.lastSubmitted) {
    chunk.visibleIndices.add(index);
    slot.ownerState.submittedCount++;
    dirty = true;
  }
  slot.lastSubmitted = true;
  return dirty;
}

function finalizeInstanceChunk(chunk, dirty, stats, context = null) {
  const nextCount = highestSubmittedIndex(chunk) + 1;
  if (chunk.mesh.count !== nextCount) {
    chunk.mesh.count = nextCount;
    dirty = true;
  }
  chunk.mesh.visible = nextCount > 0;
  if (dirty) {
    stats.dirtyChunks++;
    commitInstanceChunkMatrix(chunk);
  }
  applyInstanceChunkSubmitPolicy(chunk, {
    count: nextCount,
    playerX: context && context.playerX,
    playerZ: context && context.playerZ,
    castRadiusSq: context && context.castRadiusSq,
    castRadius: context && context.castRadius,
    refreshBounds: dirty || !!(context && context.cameraDirty),
  });
}

function applyInstanceChunkPolicies(state, context) {
  for (const pool of state.pools.values()) {
    for (const chunk of pool.chunks) {
      applyInstanceChunkSubmitPolicy(chunk, {
        count: chunk.mesh ? chunk.mesh.count : 0,
        playerX: context && context.playerX,
        playerZ: context && context.playerZ,
        castRadiusSq: context && context.castRadiusSq,
        castRadius: context && context.castRadius,
        refreshBounds: false,
      });
    }
  }
}

function consolidateOpaqueInstanceChunks(state, context) {
  if (!state.opaqueBatch) state.opaqueBatch = createOpaqueMaterialBatchState();
  const batchStats = syncOpaqueMaterialBatches(state.opaqueBatch, state.pools, {
    enabled: !!(context && context.consolidateOpaqueBatches),
    scene: state.scene,
    playerX: context && context.playerX,
    playerZ: context && context.playerZ,
    castRadiusSq: context && context.castRadiusSq,
    castRadius: context && context.castRadius,
    refreshBounds: !!(context && context.cameraDirty),
  });
  if (state.stats) {
    state.stats.opaqueBatches = batchStats.batches;
    state.stats.opaqueBatchInstances = batchStats.instances;
    state.stats.opaqueBatchHiddenChunks = batchStats.hiddenChunks;
  }
}

function highestSubmittedIndex(chunk) {
  let highest = -1;
  for (const index of chunk.visibleIndices) if (index > highest) highest = index;
  return highest;
}

function isVisibleToOwner(object, owner, context, stats, record = null) {
  const ownerFrame = syncOwnerForInstanceFrame(owner, context, record);
  if (!ownerFrame.visible) {
    if (stats) stats.culledInstanceSlots++;
    return false;
  }
  for (let current = object; current; current = current.parent) {
    if (!current.visible) {
      if (stats) stats.hiddenInstanceSlots++;
      return false;
    }
    if (current === owner) return isOwnerInCullContext(owner, context, stats);
  }
  if (stats) stats.hiddenInstanceSlots++;
  return false;
}

function syncOwnerForInstanceFrame(owner, context, record = null) {
  if (!owner || !owner.parent || !context || !context.state) return HIDDEN_INSTANCE_OWNER_FRAME;
  if (context.frameBounded) {
    if (!record || record.visible === false || record.viewCulled === true) return HIDDEN_INSTANCE_OWNER_FRAME;
  }
  let cached = context.state.ownerVisibility.get(owner);
  if (cached && cached.frame === context.frame) return cached;

  owner.updateWorldMatrix(true, false);
  const visible = isOwnerInCullContext(owner, context);
  if (visible) owner.updateWorldMatrix(false, true);
  if (!cached) {
    cached = { frame: 0, visible: false };
    context.state.ownerVisibility.set(owner, cached);
  }
  cached.frame = context.frame;
  cached.visible = visible;
  return cached;
}

function setInstanceMatrixIfChanged(chunk, index, slot, matrix) {
  const elements = matrix && matrix.elements;
  if (!elements) return false;
  let changed = !slot.matrixInitialized;
  if (!changed) {
    for (let i = 0; i < 16; i++) {
      if (Math.abs(slot.matrixElements[i] - elements[i]) > 0.00001) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return false;
  for (let i = 0; i < 16; i++) slot.matrixElements[i] = elements[i];
  slot.matrixInitialized = true;
  writeInstanceChunkMatrix(chunk, index, matrix);
  return true;
}

function sceneState(scene) {
  let state = sceneStates.get(scene);
  if (!state) {
    state = {
      pools: new Map(),
      packageCandidates: new Map(),
      stats: createPoolStats(),
      ownerVisibility: new WeakMap(),
      ownerSlots: new Map(),
      activeFrameOwners: new Set(),
      nextFrameOwners: new Set(),
      affectedChunks: new Set(),
      retiringChunks: new Set(),
      preparedAuthoredRoots: new Map(),
      frameRecordsByOwner: new Map(),
      cullContext: createInstanceCullContext(),
      cameraState: { initialized: false, present: false, values: new Float64Array(32) },
      syncFrame: 0,
      opaqueBatch: createOpaqueMaterialBatchState(),
      scene,
    };
    sceneStates.set(scene, state);
  }
  return state;
}

function instancePoolKey(geometry, material) {
  return instancePoolIdentity(geometry, material);
}

function createPoolStats() {
  return {
    pools: 0,
    chunks: 0,
    pooledInstanceSlots: 0,
    activeInstanceSlots: 0,
    submittedInstanceSlots: 0,
    visibleInstancePools: 0,
    offscreenInstancePools: 0,
    culledInstanceSlots: 0,
    hiddenInstanceSlots: 0,
    avgPoolOccupancy: 0,
    tinyPools: 0,
    dirtyChunks: 0,
    matrixUploads: 0,
    matrixReuses: 0,
    frameBounded: false,
    ownersVisited: 0,
    slotsVisited: 0,
  };
}

function normalizeAuthoredDrivePlume(plume) {
  if (!plume || plume.userData?.spacefaceDrivePlumeNormalized) return;
  plume.userData = plume.userData || {};
  plume.userData.spacefaceDrivePlumeNormalized = true;
  const sourceUrl = String(plume.userData.spacefacePartUrl || '').replace(/\\/g, '/').toLowerCase();
  const isVectorDrive = sourceUrl.endsWith('/engines/engine_vector.glb');
  // The vector-drive export uses a rounded volume suited to a close-up nozzle test. Mounted twice
  // on a flight-scale fighter, its broad emissive faces overlap into one clipped white disk. Keep
  // the authored mesh and animation, but give that specific drive a long, narrow exhaust profile
  // before the pose is captured. Other authored plumes retain the gentler continuity normalization.
  plume.scale.x *= isVectorDrive ? 1.65 : 1.45;
  plume.scale.y *= isVectorDrive ? 0.16 : 0.42;
  plume.scale.z *= isVectorDrive ? 0.16 : 0.42;
  const material = plume.material;
  if (!material) return;
  material.transparent = true;
  material.depthWrite = false;
  const opacityCeiling = isVectorDrive ? 0.22 : 0.42;
  const emissiveCeiling = isVectorDrive ? 0.68 : 1.05;
  material.opacity = Math.min(Number.isFinite(material.opacity) ? material.opacity : 0.55, opacityCeiling);
  if (Number.isFinite(material.emissiveIntensity)) material.emissiveIntensity = Math.min(material.emissiveIntensity, emissiveCeiling);
  material.needsUpdate = true;
}

function normalizeWaspDomeGlass(root, entity) {
  if (entity?.data?.defId !== 'ship_wasp' || !root?.traverse) return;
  root.traverse((object) => {
    if (!object?.isMesh || object.name !== 'Cockpit_Dome_Glass') return;
    const sourceUrl = String(object.userData?.spacefacePartUrl || '').replace(/\\/g, '/').toLowerCase();
    if (!sourceUrl.endsWith('/cockpits/cockpit_dome.glb')) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const normalized = sourceMaterials.map((source) => {
      if (!source || source.userData?.spacefaceWaspCanopyNormalized) return source;
      const material = source.clone();
      material.name = 'SF_Wasp_Canopy_Glass';
      material.userData = { ...(source.userData || {}), spacefaceWaspCanopyNormalized: true };
      material.color?.setHex?.(0x163849);
      material.emissive?.setHex?.(0x0a2230);
      material.emissiveIntensity = Math.min(Number.isFinite(material.emissiveIntensity)
        ? material.emissiveIntensity : 0.45, 0.45);
      material.transparent = true;
      material.opacity = Math.min(Number.isFinite(material.opacity) ? material.opacity : 0.66, 0.66);
      material.depthWrite = false;
      if (Number.isFinite(material.roughness)) material.roughness = Math.min(Math.max(material.roughness, 0.18), 0.32);
      if (Number.isFinite(material.metalness)) material.metalness = Math.min(material.metalness, 0.18);
      material.needsUpdate = true;
      return material;
    });
    object.material = Array.isArray(object.material) ? normalized : normalized[0];
  });
}

function resetPoolStats(state) {
  const stats = state.stats || (state.stats = createPoolStats());
  stats.pools = 0;
  stats.chunks = 0;
  stats.pooledInstanceSlots = 0;
  stats.activeInstanceSlots = 0;
  stats.submittedInstanceSlots = 0;
  stats.visibleInstancePools = 0;
  stats.offscreenInstancePools = 0;
  stats.culledInstanceSlots = 0;
  stats.hiddenInstanceSlots = 0;
  stats.avgPoolOccupancy = 0;
  stats.tinyPools = 0;
  stats.shadowCastingInstanceChunks = 0;
  stats.opaqueBatches = 0;
  stats.opaqueBatchInstances = 0;
  stats.opaqueBatchHiddenChunks = 0;
  stats.dirtyChunks = 0;
  stats.matrixUploads = 0;
  stats.matrixReuses = 0;
  stats.frameBounded = false;
  stats.ownersVisited = 0;
  stats.slotsVisited = 0;
  return stats;
}

function primePoolStats(state, stats) {
  for (const pool of state.pools.values()) {
    stats.pools++;
    stats.chunks += pool.chunks.length;
    let poolSlots = 0;
    for (const chunk of pool.chunks) poolSlots += chunk.slots.size;
    stats.pooledInstanceSlots += poolSlots;
    stats.activeInstanceSlots += poolSlots;
    if (pool.chunks.length === 1 && poolSlots > 0 && poolSlots <= 3) stats.tinyPools++;
  }
}

function finalizePoolStats(state, stats) {
  for (const pool of state.pools.values()) {
    let submitted = 0;
    let poolSlots = 0;
    for (const chunk of pool.chunks) {
      submitted += chunk.visibleIndices.size;
      poolSlots += chunk.slots.size;
    }
    stats.submittedInstanceSlots += submitted;
    if (submitted > 0) stats.visibleInstancePools++;
    else if (poolSlots > 0) stats.offscreenInstancePools++;
    for (const chunk of pool.chunks) {
      if (chunk.mesh && chunk.mesh.visible && chunk.mesh.castShadow) stats.shadowCastingInstanceChunks++;
    }
  }
  stats.avgPoolOccupancy = stats.pools > 0 ? stats.pooledInstanceSlots / stats.pools : 0;
}

function instanceFarCullWuFromOpts(opts, camera) {
  const zoomOpt = Number(opts && (opts.liveZoom ?? opts.zoom));
  const tiltOpt = Number(opts && opts.tilt);
  const fovOpt = Number(opts && opts.fov);
  const aspectOpt = Number(opts && opts.aspect);
  const fov = Number.isFinite(fovOpt) ? fovOpt
    : (camera && Number.isFinite(camera.fov) ? camera.fov : 90);
  const aspect = Number.isFinite(aspectOpt) && aspectOpt > 0 ? aspectOpt
    : (camera && Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9);
  return tableInstanceFarCullWu(
    Number.isFinite(zoomOpt) ? zoomOpt : 330,
    Number.isFinite(fov) ? fov : 90,
    Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9,
    Number.isFinite(tiltOpt) && tiltOpt > 5 ? tiltOpt : 60,
  );
}

function buildInstanceCullContext(state, opts) {
  state.syncFrame = (state.syncFrame || 0) + 1;
  const entityFrame = opts && opts.entityFrame;
  const authoredRecords = Array.isArray(opts && opts.authoredRecords)
    ? opts.authoredRecords
    : (entityFrame && Array.isArray(entityFrame.authored) ? entityFrame.authored : null);
  const frameBounded = !!(entityFrame && Number.isFinite(entityFrame.frameId) && authoredRecords);
  const camera = opts && opts.camera;
  const recordsByOwner = state.frameRecordsByOwner;
  recordsByOwner.clear();
  const context = state.cullContext || (state.cullContext = createInstanceCullContext());
  context.state = state;
  context.frame = state.syncFrame;
  context.frameBounded = frameBounded;
  context.authoredRecords = authoredRecords || EMPTY_ARRAY;
  context.recordsByOwner = recordsByOwner;
  context.playerX = Number.isFinite(Number(opts && opts.playerX)) ? Number(opts.playerX) : 0;
  context.playerZ = Number.isFinite(Number(opts && opts.playerZ)) ? Number(opts.playerZ) : 0;
  context.castRadiusSq = Number.isFinite(Number(opts && opts.castRadiusSq))
    ? Number(opts.castRadiusSq)
    : null;
  context.castRadius = Number.isFinite(Number(opts && opts.castRadius))
    ? Number(opts.castRadius)
    : null;
  context.consolidateOpaqueBatches = opts && opts.consolidateOpaqueBatches === true;
  context.farCullWu = instanceFarCullWuFromOpts(opts, camera);
  if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) {
    state.stats.frameBounded = frameBounded;
    context.cameraDirty = captureCullCameraState(null, state.cameraState);
    context.camera = null;
    context.frustum = null;
    context.cameraPosition = null;
    return context;
  }
  camera.updateMatrixWorld();
  if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
  context.cameraDirty = captureCullCameraState(camera, state.cameraState);
  CULL_PROJECTION.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  CULL_FRUSTUM.setFromProjectionMatrix(CULL_PROJECTION);
  state.stats.frameBounded = frameBounded;
  context.camera = camera;
  context.frustum = CULL_FRUSTUM;
  context.cameraPosition = camera.getWorldPosition(CULL_CAMERA_POSITION);
  return context;
}

function createInstanceCullContext() {
  return {
    state: null,
    frame: 0,
    frameBounded: false,
    authoredRecords: EMPTY_ARRAY,
    recordsByOwner: null,
    cameraDirty: true,
    camera: null,
    frustum: null,
    cameraPosition: null,
    playerX: 0,
    playerZ: 0,
    castRadiusSq: null,
    castRadius: null,
    consolidateOpaqueBatches: false,
    farCullWu: INSTANCE_FAR_CULL_RADIUS,
  };
}

function captureCullCameraState(camera, snapshot) {
  const present = !!camera;
  let changed = !snapshot.initialized || snapshot.present !== present;
  snapshot.initialized = true;
  snapshot.present = present;
  if (!camera) return changed;
  const world = camera.matrixWorld && camera.matrixWorld.elements;
  const projection = camera.projectionMatrix && camera.projectionMatrix.elements;
  for (let index = 0; index < 16; index++) {
    const value = world ? Number(world[index]) || 0 : 0;
    if (snapshot.values[index] !== value) changed = true;
    snapshot.values[index] = value;
  }
  for (let index = 0; index < 16; index++) {
    const value = projection ? Number(projection[index]) || 0 : 0;
    if (snapshot.values[index + 16] !== value) changed = true;
    snapshot.values[index + 16] = value;
  }
  return changed;
}

function isOwnerInCullContext(owner, context, stats) {
  if (!context || !context.frustum || !context.cameraPosition) return true;
  CULL_SPHERE.center.setFromMatrixPosition(owner.matrixWorld);
  CULL_SPHERE.radius = owner.userData && owner.userData.spacefaceCullRadius || INSTANCE_FRUSTUM_PAD;
  const dx = CULL_SPHERE.center.x - context.cameraPosition.x;
  const dy = CULL_SPHERE.center.y - context.cameraPosition.y;
  const dz = CULL_SPHERE.center.z - context.cameraPosition.z;
  const far = (Number.isFinite(context.farCullWu) ? context.farCullWu : INSTANCE_FAR_CULL_RADIUS)
    + CULL_SPHERE.radius;
  const visible = (dx * dx + dy * dy + dz * dz <= far * far) && context.frustum.intersectsSphere(CULL_SPHERE);
  if (!visible && stats) stats.culledInstanceSlots++;
  return visible;
}

function registerOwnerRelease(owner, release) {
  let state = ownerReleaseState.get(owner);
  if (!state) {
    state = { releases: new Set(), pending: new Set(), errors: [] };
    state.listener = () => {
      const errors = drainOwnerReleaseCallbacks(state);
      if (errors.length) throw new AggregateError(errors, 'Authored instance owner release failed');
    };
    owner.addEventListener('removed', state.listener);
    ownerReleaseState.set(owner, state);
  }
  state.releases.add(release);
}

function releaseOwnerInstances(owner) {
  const state = ownerReleaseState.get(owner);
  if (!state) return Promise.resolve(true);
  drainOwnerReleaseCallbacks(state);
  const settlement = (async () => {
    while (state.pending.size) await Promise.allSettled([...state.pending]);
    if (state.errors.length) {
      const errors = state.errors.splice(0);
      throw new AggregateError(errors, 'Authored instance owner cleanup failed');
    }
    return true;
  })();
  settlement.catch(() => null);
  return settlement;
}

function drainOwnerReleaseCallbacks(state) {
  const callbacks = [...state.releases];
  state.releases.clear();
  const synchronousErrors = [];
  for (const release of callbacks) {
    try {
      const result = release();
      if (!result || typeof result.then !== 'function') continue;
      let observed = null;
      observed = Promise.resolve(result).then(
        (value) => {
          state.pending.delete(observed);
          return value;
        },
        (error) => {
          state.pending.delete(observed);
          state.errors.push(error);
          state.releases.add(release);
          throw error;
        },
      );
      observed.catch(() => null);
      state.pending.add(observed);
    } catch (error) {
      synchronousErrors.push(error);
      state.errors.push(error);
      state.releases.add(release);
    }
  }
  return synchronousErrors;
}

/**
 * Real-object contract probe for the retained authored-instance frame path. It intentionally uses
 * the same private allocator, release listeners, visibility logic, InstancedMesh attribute, and
 * fallback sync as live authored ships; only the two tiny geometry proxies are synthetic.
 */
export function runAuthoredInstanceFrameContractProbe() {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const ownerA = new THREE.Group();
  const ownerB = new THREE.Group();
  const proxyA = new THREE.Object3D();
  const proxyB = new THREE.Object3D();
  ownerA.position.set(-3, 0, 0);
  ownerB.position.set(3, 0, 0);
  ownerA.add(proxyA);
  ownerB.add(proxyB);
  scene.add(ownerA, ownerB);
  allocateInstance(scene, ownerA, proxyA, geometry, material, 'FrameContractProbe');
  allocateInstance(scene, ownerB, proxyB, geometry, material, 'FrameContractProbe');
  const poolState = sceneStates.get(scene);
  const chunk = [...poolState.pools.values()][0].chunks[0];

  const frame = (frameId, authored) => ({ frameId, authored });
  const record = (mesh, renderDirty) => ({
    mesh,
    visible: true,
    viewCulled: false,
    renderDirty,
  });

  const firstFrame = frame(1, [record(ownerA, true)]);
  const firstStats = syncAuthoredInstancePools(scene, {
    entityFrame: firstFrame,
    authoredRecords: firstFrame.authored,
  });
  const first = { ...firstStats };
  const firstCullContext = poolState.cullContext;
  const firstOwnerVisibility = poolState.ownerVisibility.get(ownerA);
  const firstVersion = chunk.mesh.instanceMatrix.version;

  const stableFrame = frame(2, [record(ownerA, false)]);
  const stableStats = syncAuthoredInstancePools(scene, {
    entityFrame: stableFrame,
    authoredRecords: stableFrame.authored,
  });
  const stable = { ...stableStats };
  const stableCullContext = poolState.cullContext;
  const stableOwnerVisibility = poolState.ownerVisibility.get(ownerA);
  const stableVersion = chunk.mesh.instanceMatrix.version;

  const replacedFrame = frame(3, [record(ownerB, true)]);
  const replaced = { ...syncAuthoredInstancePools(scene, {
    entityFrame: replacedFrame,
    authoredRecords: replacedFrame.authored,
  }) };
  const replacedVersion = chunk.mesh.instanceMatrix.version;

  const emptyFrame = frame(4, []);
  const cleaned = { ...syncAuthoredInstancePools(scene, {
    entityFrame: emptyFrame,
    authoredRecords: emptyFrame.authored,
  }) };
  const fallback = { ...syncAuthoredInstancePools(scene) };
  const fallbackOwnerVisibility = poolState.ownerVisibility.get(ownerA);

  scene.remove(ownerA); // exercises the exact owner `removed` release listener
  const afterRelease = { ...syncAuthoredInstancePools(scene) };
  scene.remove(ownerB);
  geometry.dispose();
  material.dispose();

  return {
    first,
    stable,
    replaced,
    cleaned,
    fallback,
    afterRelease,
    firstVersion,
    stableVersion,
    replacedVersion,
    statsObjectStable: firstStats === stableStats,
    cullContextObjectStable: firstCullContext === stableCullContext,
    ownerVisibilityRecordStable: firstOwnerVisibility === stableOwnerVisibility
      && firstOwnerVisibility === fallbackOwnerVisibility,
  };
}

/**
 * Real coordinator probe for one authored-instance chunk. It drives the private allocator through
 * move, omission/hide, owner release, and immediate slot reuse while retaining production count and
 * visibility logic. Returned ranges are component indexes, matching Three.js BufferAttribute.
 */
export function runAuthoredInstanceRangeContractProbe() {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const ownerA = new THREE.Group();
  const ownerB = new THREE.Group();
  const proxyA = new THREE.Object3D();
  const proxyB = new THREE.Object3D();
  ownerA.position.set(-3, 0, 0);
  ownerB.position.set(3, 0, 0);
  ownerA.add(proxyA);
  ownerB.add(proxyB);
  scene.add(ownerA, ownerB);
  allocateInstance(scene, ownerA, proxyA, geometry, material, 'RangeContractProbe');
  allocateInstance(scene, ownerB, proxyB, geometry, material, 'RangeContractProbe');
  const poolState = sceneStates.get(scene);
  const chunk = [...poolState.pools.values()][0].chunks[0];
  const attribute = chunk.mesh.instanceMatrix;

  const frame = (frameId, owners) => ({
    frameId,
    authored: owners.map((mesh) => ({
      mesh,
      visible: true,
      viewCulled: false,
      renderDirty: true,
    })),
  });
  const sync = (entry) => syncAuthoredInstancePools(scene, {
    entityFrame: entry,
    authoredRecords: entry.authored,
  });
  const publish = (initial) => {
    const epoch = coordinator.arm();
    scene.onBeforeRender({}, scene, camera, null);
    const record = attribute.updateRanges[0];
    const range = record ? { start: record.start, count: record.count } : null;
    if (record) {
      if (!initial) attribute.clearUpdateRanges();
      attribute.onUploadCallback();
    }
    coordinator.disarm(epoch);
    return range;
  };

  sync(frame(1, [ownerA, ownerB]));
  const initialRange = publish(true);
  const requestedBeforeMove = chunk.dynamicBufferOwner.diagnostics.requestedUploadBytes;

  ownerB.position.x += 1.25;
  sync(frame(2, [ownerA, ownerB]));
  const movedRange = publish(false);
  const movedRequestedBytes = chunk.dynamicBufferOwner.diagnostics.requestedUploadBytes
    - requestedBeforeMove;

  sync(frame(3, [ownerB]));
  const hiddenRange = publish(false);
  const visibleAfterHide = chunk.visibleIndices.size;

  scene.remove(ownerA);
  const ownerC = new THREE.Group();
  const proxyC = new THREE.Object3D();
  ownerC.position.set(-5, 0, 0);
  ownerC.add(proxyC);
  scene.add(ownerC);
  allocateInstance(scene, ownerC, proxyC, geometry, material, 'RangeContractProbe');
  sync(frame(4, [ownerB, ownerC]));
  const reusedRange = publish(false);
  const visibleAfterReuse = chunk.visibleIndices.size;

  const result = {
    initialRange,
    movedRange,
    hiddenRange,
    reusedRange,
    movedRequestedBytes,
    allocatedBytes: attribute.array.byteLength,
    visibleAfterHide,
    visibleAfterReuse,
    invalid: coordinator.getDiagnostics().invalid,
  };
  scene.remove(ownerB, ownerC);
  geometry.dispose();
  material.dispose();
  return result;
}

// -------------------------------------------------------------------------------------------------
// Material variants: immutable authored materials are shared even when their meshes must stay
// separate for sockets, LOD, transparent sorting, damage movement, or drive transforms. Only surfaces
// whose material uniforms are actually mutated at runtime receive ship-local clones.
// -------------------------------------------------------------------------------------------------
// Material.copy() copies userData but not instance-assigned onBeforeCompile /
// customProgramCacheKey, so an authored shader patch would be dropped while its
// userData receipt survived — leaving a flag that lies and a cache key that no
// longer matches the source it was compiled from.
// Exported for the regression test that pins the clone contract.
export function cloneMaterialPreservingShaderHooks(base) {
  const clone = base.clone();
  if (Object.hasOwn(base, 'onBeforeCompile')) clone.onBeforeCompile = base.onBeforeCompile;
  if (Object.hasOwn(base, 'customProgramCacheKey')) clone.customProgramCacheKey = base.customProgramCacheKey;
  clone.needsUpdate = true;
  return clone;
}

function sharedMaterialFor(base, tags, palette) {
  const role = authoredSurfaceTintRole(tags, base);
  const tint = tintHex(palette, role);
  const explicitTint = appearanceOverrideForRole(palette, role);
  const finish = palette.finish || 'authored';
  const wear = Number.isFinite(Number(palette.wear)) ? Number(palette.wear).toFixed(2) : '-';
  // Instance key still includes tint so faction colors remain distinct material.color uniforms.
  // Program-family identity (name + spacefaceProgramFamily) deliberately omits tint: color is a
  // per-instance uniform, not a distinct compiled program.
  const key = `${materialShareSignature(base, tags)}|${role}|${tint}|${explicitTint ? 'paint' : 'identity'}|${finish}|${wear}`;
  let material = sharedMaterialVariants.get(key);
  if (!material) {
    material = applyAppearanceFinish(
      boundAuthoredEmission(
        applyAuthoredSurfaceTint(cloneMaterialPreservingShaderHooks(base), tint, role, explicitTint), base, role,
      ), palette, role,
    );
    material.name = authoredMaterialName(base, tags, role, tint, false);
    const programFamily = authoredMaterialProgramFamily(base, tags, role, false);
    const tintToken = hullMaterialSuffix(tint);
    const canonical = resolveCanonicalHullMaterial(material, tintToken);
    if (canonical !== material) {
      sharedMaterialVariants.set(key, canonical);
      return canonical;
    }
    material.userData = {
      ...(material.userData || {}),
      spacefaceSharedAsset: true,
      spacefaceBatchKey: key,
      spacefaceProgramFamily: programFamily,
      spacefacePaletteTint: tintToken,
      spacefaceHullTint: role === 'hull' ? tintToken : undefined,
    };
    material.dispose = () => {};
    sharedMaterialVariants.set(key, material);
  }
  return resolveCanonicalHullMaterial(material, hullMaterialSuffix(tint));
}

function dedicatedMaterialFor(base, tags, palette, cache, instanceKey) {
  if (!materialNeedsShipLocalMutation(tags)) return sharedMaterialFor(base, tags, palette);
  return mutableMaterialFor(base, tags, palette, cache, instanceKey);
}

function materialNeedsShipLocalMutation(tags = {}) {
  return tags.drive === 'plume' || tags.damageRole === 'navLight' || tags.damageRole === 'sensor';
}

function mutableMaterialFor(base, tags, palette, cache, instanceKey) {
  const role = authoredSurfaceTintRole(tags, base);
  const tint = tintHex(palette, role);
  const explicitTint = appearanceOverrideForRole(palette, role);
  const finish = palette.finish || 'authored';
  const wear = Number.isFinite(Number(palette.wear)) ? Number(palette.wear).toFixed(2) : '-';
  const key = `${materialBatchSignature(base)}|${role}|${tint}|${explicitTint ? 'paint' : 'identity'}|${finish}|${wear}|${materialMutationScope(tags, instanceKey)}`;
  let material = cache.get(key);
  if (!material) {
    material = applyAppearanceFinish(
      boundAuthoredEmission(
        applyAuthoredSurfaceTint(cloneMaterialPreservingShaderHooks(base), tint, role, explicitTint), base, role,
      ), palette, role,
    );
    material.name = authoredMaterialName(base, tags, role, tint, true);
    material.userData = {
      ...(material.userData || {}),
      spacefaceProgramFamily: authoredMaterialProgramFamily(base, tags, role, true),
      spacefacePaletteTint: hullMaterialSuffix(tint),
    };
    cache.set(key, material);
  }
  return material;
}

function materialMutationScope(tags = {}, instanceKey) {
  if (tags.drive === 'plume') return 'ship-drive-plumes';
  return instanceKey || 'ship-local';
}

/**
 * Visible material-key identity for perf budgets. Palette tint is a per-instance uniform
 * (material.color / emissive), not a distinct compiled program, so shared materials omit the
 * hex suffix. Mutable ship-local materials keep the tint token for mutation diagnostics.
 */
function authoredMaterialProgramFamily(base, tags, role, mutable) {
  const family = authoredMaterialFamily(base, tags, role);
  const prefix = mutable ? 'SF_Mutable' : 'SF_Shared';
  if (role === 'none') return `${prefix}_${family}_none_native`;
  return `${prefix}_${family}_${role}`;
}

function authoredMaterialName(base, tags, role, tint, mutable) {
  const programFamily = authoredMaterialProgramFamily(base, tags, role, mutable);
  // Shared materials: program-family name only. Color variants keep separate material instances
  // (different uniforms) but share one key so crowded-flight budgets measure real programs.
  if (!mutable) return programFamily;
  const tintSuffix = role === 'none' ? 'native' : String(tint || '').replace('#', '') || 'native';
  return `${programFamily}_${tintSuffix}`;
}

function authoredMaterialFamily(base, tags = {}, role = 'hull') {
  if (tags.drive) return `drive_${tags.drive}`;
  if (tags.canopy) return 'canopy';
  if (tags.damageRole === 'navLight' || tags.damageRole === 'sensor') return 'signal';
  const semanticRole = String(base?.userData?.spacefaceMaterialRole || '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (semanticRole === 'mechanical' || semanticRole === 'recessed_mechanical' || semanticRole === 'dark_composite') {
    return 'mechanical';
  }
  if (semanticRole === 'accent' || semanticRole === 'livery' || semanticRole === 'painted_accent') return 'accent';
  if (semanticRole === 'glass' || semanticRole === 'canopy_glass' || semanticRole === 'sensor_lens') return 'canopy';
  const source = String(base && base.name || '').toLowerCase();
  if (source.includes('glass') || source.includes('canopy')) return 'canopy';
  if (source.includes('mechanical') || source.includes('mech') || source.includes('rib') || source.includes('clamp')) return 'mechanical';
  if (source.includes('interior')) return 'interior';
  if (source.includes('energy') || source.includes('emit') || source.includes('glow') || source.includes('nav')) return 'signal';
  if (source.includes('accent')) return 'accent';
  if (source.includes('plume')) return 'drive_plume';
  if (base && (base.map || base.normalMap || base.aoMap || base.roughnessMap || base.metalnessMap)) return `${role}_textured`;
  return role || 'authored';
}

/**
 * Apply identity or explicit player paint as a color multiplier only. Blender-authored maps and
 * calibrated roughness/metalness remain authoritative; faction color must not flatten every PBR
 * surface into the same smooth, emissive plastic.
 */
export function applyAuthoredSurfaceTint(material, hex, role, explicitOverride = false) {
  if (role === 'none') return material;
  const tint = new THREE.Color(hex);
  if (material.color) {
    if (explicitOverride && (role === 'hull' || role === 'accent')) {
      material.color.copy(tint);
    } else if (role === 'accent' || role === 'thruster') {
      const sourceLuminance = 0.2126 * material.color.r + 0.7152 * material.color.g + 0.0722 * material.color.b;
      material.color.copy(tint).multiplyScalar(Math.max(0.72, Math.min(1.08, 0.62 + sourceLuminance * 0.52)));
    } else if (role === 'hull') {
      material.color.multiply(tint.clone().lerp(new THREE.Color(0xffffff), 0.86));
    } else if (role === 'dark') {
      material.color.multiply(tint.clone().lerp(new THREE.Color(0xffffff), 0.92));
    } else {
      material.color.multiply(tint);
    }
  }
  if (material.emissive && material.emissive.getHex() !== 0 && (role === 'accent' || role === 'thruster')) {
    material.emissive.copy(tint);
  }
  material.needsUpdate = true;
  return material;
}

function liftColorFloor(color, floor) {
  const minimum = Number(floor) || 0;
  color.r = Math.max(color.r, minimum);
  color.g = Math.max(color.g, minimum);
  color.b = Math.max(color.b, minimum);
}

function appearanceOverrideForRole(palette, role) {
  if (role === 'hull') return palette && palette.appearanceHullOverride === true;
  if (role === 'accent') return palette && palette.appearanceAccentOverride === true;
  return false;
}

const AUTHORED_SEMANTIC_TINT_ROLES = Object.freeze({
  hull: 'hull',
  painted_hull: 'hull',
  painted_armor: 'hull',
  coated_hull: 'hull',
  accent: 'accent',
  livery: 'accent',
  painted_accent: 'accent',
  mechanical: 'dark',
  recessed_mechanical: 'dark',
  dark_composite: 'dark',
  drive: 'thruster',
  thruster: 'thruster',
});

export function authoredSurfaceTintRole(tags = {}, material = null) {
  if (tags.canopy) return 'none';
  // Engine exports historically inherited `tint: hull` from their structural parent. A plume is
  // never hull paint: honoring that inherited tag turns its emissive disk neutral-white after tone
  // mapping. Give the live exhaust the faction thruster role before considering inherited tags.
  if (tags.drive === 'plume') return 'thruster';
  // Blender/glTF material extras are the authored physical-surface authority. Preserve native
  // geology, markings, signals and functional station surfaces instead of multiplying every map by
  // an inherited hull tint. Coated hull/accent and structural machinery remain palette-addressable.
  const paletteIntent = String(material?.userData?.spacefacePaletteTint || '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['none', 'hull', 'accent', 'dark', 'thruster'].includes(paletteIntent)) return paletteIntent;
  const semanticRole = String(material?.userData?.spacefaceMaterialRole || '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (AUTHORED_SEMANTIC_TINT_ROLES[semanticRole]) return AUTHORED_SEMANTIC_TINT_ROLES[semanticRole];
  if (semanticRole && [
    'geology', 'warning', 'signal', 'glass', 'canopy_glass', 'sensor_lens', 'radiator', 'docking',
    'service', 'ceramic', 'engine_ceramic', 'rubber', 'repair', 'exposed_alloy', 'heat_affected_alloy',
    'copper_coil', 'maintenance_mark',
  ].includes(semanticRole)) return 'none';
  if (tags.damageRole === 'navLight' || tags.damageRole === 'sensor') return 'accent';
  const source = String(material && material.name || '').toLowerCase();
  if (/(?:glass|canopy|windscreen)/.test(source)) return 'none';
  if (/(?:thruster|drive[_ -]?(?:aperture|core)|engine[_ -]?(?:glow|core))/.test(source)) return 'thruster';
  // Older modular exports also stamped their whole LOD subtree as `tint: hull`, even where authored
  // material names carry a stronger semantic role. Preserve those authored material families so a
  // fighter keeps dark machinery and accent panels instead of collapsing to one flat grey value.
  if (/(?:warning|hazard)/.test(source)) return 'none';
  if (/(?:accent|trim|livery|stripe)/.test(source)) return 'accent';
  if (/(?:armor|armour|mechanical|machinery|mech|interior|rib|clamp|frame)/.test(source)) return 'dark';
  if (/(?:energy|emiss|emit|glow|nav|display|sensor|mining.?lens)/.test(source)) return 'none';
  if (tags.tint) return String(tags.tint).toLowerCase();
  if (tags.drive) return 'thruster';
  return 'hull';
}

function applyAppearanceFinish(material, palette, role) {
  if (!material || !palette || !Number.isFinite(Number(material.roughness))) return material;
  if (!['hull', 'accent', 'dark'].includes(role)) return material;
  const wear = Math.max(0, Math.min(1, Number(palette.wear) || 0));
  if (palette.finish === 'polished') {
    material.roughness = Math.max(0.22, material.roughness * 0.72 + wear * 0.06);
  } else if (palette.finish === 'worn') {
    material.roughness = Math.min(1, material.roughness * 1.04 + wear * 0.05);
    if (Number.isFinite(Number(material.metalness))) material.metalness *= 0.97;
  } else if (palette.finish === 'satin') {
    material.roughness = Math.max(0.34, Math.min(0.9, material.roughness + wear * 0.02));
  }
  material.userData = { ...(material.userData || {}), spacefaceAppearanceFinish: palette.finish };
  material.needsUpdate = true;
  return material;
}

function boundAuthoredEmission(material, base, role) {
  const source = String(base && base.name || '').toLowerCase();
  if (role !== 'thruster' || !/(?:thruster|drive[_ -]?aperture)/.test(source)) return material;
  material.toneMapped = true;
  material.emissiveIntensity = Math.min(Number.isFinite(material.emissiveIntensity)
    ? material.emissiveIntensity : 0.62, 0.62);
  material.userData = { ...(material.userData || {}), spacefaceBoundedDriveAperture: true };
  material.needsUpdate = true;
  return material;
}

function normalizeTintHex(value) {
  if (value == null) return '#ffffff';
  const raw = String(value).trim().toLowerCase();
  if (!raw) return '#ffffff';
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    if (hex.length === 3) return `#${hex.split('').map((ch) => ch + ch).join('')}`;
    if (hex.length === 6) return `#${hex}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function tintHex(palette, role) {
  if (role === 'none') return '#ffffff';
  if (role === 'accent') return normalizeTintHex(palette.accent);
  if (role === 'thruster') return normalizeTintHex(palette.thruster);
  if (role === 'dark') return normalizeTintHex(palette.dark);
  return normalizeTintHex(palette.hull);
}

function usesFineMaterialShareSignature(tags = {}, material) {
  if (!material) return true;
  if (material.transparent || material.transmission > 0 || material.depthWrite === false) return true;
  if (tags.canopy || tags.drive === 'plume') return true;
  if (tags.damageRole === 'navLight' || tags.damageRole === 'sensor') return true;
  return false;
}

function hasAuthoredMaps(material) {
  return !!(material && (
    material.map || material.normalMap || material.roughnessMap || material.metalnessMap || material.aoMap || material.emissiveMap
  ));
}

function hullMaterialSuffix(materialOrTint) {
  if (materialOrTint && typeof materialOrTint === 'object') {
    const fromUserData = materialOrTint.userData
      && (materialOrTint.userData.spacefaceHullTint || materialOrTint.userData.spacefacePaletteTint);
    if (fromUserData) return String(fromUserData).replace('#', '').toLowerCase() || 'native';
    const name = String(materialOrTint.name || '');
    // Legacy tinted names (pre program-family consolidation) plus bare family names.
    const match = name.match(/^SF_Shared_hull_(?:textured_)?hull_([0-9a-f]+)/i);
    if (match) return match[1].toLowerCase();
  }
  return String(materialOrTint || '').replace('#', '').toLowerCase() || 'native';
}

function isMaplessSharedHullName(name) {
  const n = String(name || '');
  // Mapless family is SF_Shared_hull_hull; textured is SF_Shared_hull_textured_hull.
  // Accept legacy tinted suffixes (SF_Shared_hull_hull_c8d8f0).
  return n === 'SF_Shared_hull_hull' || /^SF_Shared_hull_hull_[0-9a-f]+$/i.test(n);
}

function isTexturedSharedHullName(name) {
  const n = String(name || '');
  return n === 'SF_Shared_hull_textured_hull' || /^SF_Shared_hull_textured_hull_[0-9a-f]+$/i.test(n);
}

function findCanonicalTexturedHullMaterial(tint) {
  const targetTint = hullMaterialSuffix(tint);
  for (const material of sharedMaterialVariants.values()) {
    if (!isTexturedSharedHullName(material.name)) continue;
    const materialTint = hullMaterialSuffix(material);
    if (materialTint === targetTint) return material;
  }
  return null;
}

function resolveCanonicalHullMaterial(material, tintToken) {
  if (!material) return material;
  const name = String(material.name || '');
  if (!isMaplessSharedHullName(name)) return material;
  const tint = tintToken || hullMaterialSuffix(material);
  return findCanonicalTexturedHullMaterial(tint) || material;
}

function reconcileMaplessHullMaterialAliases(palette) {
  const tint = tintHex(palette, 'hull');
  const canonical = findCanonicalTexturedHullMaterial(tint);
  if (!canonical) return;
  for (const [key, material] of sharedMaterialVariants.entries()) {
    if (material === canonical) continue;
    const name = String(material.name || '');
    if (!isMaplessSharedHullName(name)) continue;
    sharedMaterialVariants.set(key, canonical);
  }
}

function canonicalizeMaplessHullMaterials(root, palette) {
  const tint = tintHex(palette, 'hull');
  const canonical = findCanonicalTexturedHullMaterial(tint);
  if (!canonical || !root) return;
  root.traverse((object) => {
    if (!object || !object.isMesh) return;
    const tags = object.userData && object.userData.spacefaceTags || {};
    if (tags.drive || tags.canopy || tags.decal) return;
    if (tags.damageRole) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    let changed = false;
    for (let i = 0; i < materials.length; i++) {
      const material = materials[i];
      if (!material || material === canonical) continue;
      const name = String(material.name || '');
      if (!isMaplessSharedHullName(name)) continue;
      materials[i] = canonical;
      changed = true;
    }
    if (!changed) return;
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
}

function materialShareSignature(material, tags = {}) {
  if (!material || usesFineMaterialShareSignature(tags, material)) return materialBatchSignature(material);
  const role = authoredSurfaceTintRole(tags, material);
  // Palette tint is applied after sharing and lives in the instance key (`role|tint|...`).
  // Including authored base color here splits fleets that share maps but differ by tiny albedo.
  const tintable = role === 'hull' || role === 'accent' || role === 'dark' || role === 'thruster';
  const emissiveHex = colorSig(material.emissive);
  return [
    material.type || 'Material',
    material.transparent ? 1 : 0,
    material.depthWrite === false ? 0 : 1,
    material.side == null ? THREE.FrontSide : material.side,
    material.blending == null ? THREE.NormalBlending : material.blending,
    material.vertexColors ? 1 : 0,
    fixedSig(material.alphaTest, 2),
    fixedSig(material.opacity, 2),
    tintable ? `color:tintable:${role}` : colorSig(material.color),
    fixedSig(material.roughness, 2),
    fixedSig(material.metalness, 2),
    emissiveHex,
    emissiveHex === '000000' ? 'emiInt:na' : fixedSig(material.emissiveIntensity, 2),
    fixedSig(material.transmission, 2),
    fixedSig(material.clearcoat, 2),
    fixedSig(material.clearcoatRoughness, 2),
    vector2Sig(material.normalScale),
    textureBatchSignature(material.map),
    textureBatchSignature(material.normalMap),
    textureBatchSignature(material.aoMap),
    textureBatchSignature(material.roughnessMap),
    textureBatchSignature(material.metalnessMap),
    textureBatchSignature(material.emissiveMap),
    textureBatchSignature(material.alphaMap),
  ].join('|');
}

// -------------------------------------------------------------------------------------------------
// Procedural slot fallbacks. These are emergency continuity pieces, not substitutes for authored
// maps: once a conforming GLB appears at the canonical path the slot replaces itself without code.
// -------------------------------------------------------------------------------------------------
function fallbackMaterials(palette, seed) {
  const hull = kit.pbrHullMaterial({
    hull: palette.hull, accent: palette.accent, seed: seed & 0xffff,
    panelCount: 10, metalness: 0.18, roughness: 0.58,
  });
  const dark = kit.machineryMaterial(palette.dark, 0.48, 0.76);
  const accent = kit.emissiveMaterial(palette.accent, 2.6);
  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette.accent).multiplyScalar(0.18),
    roughness: 0.10,
    metalness: 0,
    transmission: 0.6,
    ior: 1.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    thickness: 0.06,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  return { hull, dark, accent, glass };
}

function buildSafetyCore(hull, materials, palette) {
  const mesh = kit.addMesh(hull, kit.loftXGeometry([
    { x: -0.78, halfY: 0.16, halfZ: 0.20 },
    { x: -0.42, halfY: 0.25, halfZ: 0.35 },
    { x: 0.18, halfY: 0.27, halfZ: 0.38 },
    { x: 0.62, halfY: 0.18, halfZ: 0.24 },
    { x: 0.86, halfY: 0.05, halfZ: 0.07 },
  ], 8), readabilityShellMaterial(materials.hull, palette), 'GLTFKit_Readability_PressureShell');
  mesh.scale.set(1.08, 1.04, 1.08);
  mesh.userData.spacefaceReadabilityCore = true;
  mesh.userData.spacefaceStaticBatch = true;
  mesh.userData.spacefacePartUrl = 'readability/pressure_shell';
  return mesh;
}

export function shouldBuildReadabilitySafetyCore({
  wholeShip = false,
  authoredHullLevelCount = 0,
} = {}) {
  return !wholeShip && Number(authoredHullLevelCount) <= 0;
}

function readabilityShellMaterial(base, palette = {}) {
  const hullTint = normalizeTintHex(palette.hull || '#8a94a8');
  const accentTint = normalizeTintHex(palette.accent || '#7ee8ff');
  const key = `${hullTint}|${accentTint}`;
  let material = sharedReadabilityShellVariants.get(key);
  if (!material) {
    material = base && typeof base.clone === 'function'
      ? base.clone()
      : kit.pbrHullMaterial({
        hull: hullTint,
        accent: accentTint,
        seed: 0x51f,
        panelCount: 8,
        metalness: 0.12,
        roughness: 0.66,
      });
    material.name = 'SF_Readability_PressureShell';
    if (material.color) {
      const hull = new THREE.Color(hullTint);
      material.color.lerp(hull, 0.58);
      liftColorFloor(material.color, 0.66);
    }
    if ('metalness' in material) material.metalness = Math.min(Number(material.metalness) || 0, 0.16);
    if ('roughness' in material) material.roughness = Math.max(Number(material.roughness) || 0, 0.62);
    if (material.emissive) {
      material.emissive.copy(new THREE.Color(accentTint)).multiplyScalar(0.075);
      material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 0.32);
    }
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.needsUpdate = true;
    // Palette tints stay on the instance; one program family for the readability shell role.
    material.userData = {
      ...(material.userData || {}),
      spacefaceSharedAsset: true,
      spacefaceBatchKey: key,
      spacefaceProgramFamily: 'SF_Readability_PressureShell',
    };
    material.dispose = () => {};
    sharedReadabilityShellVariants.set(key, material);
  }
  return material;
}

function buildFallbackCockpit(hull, materials, placement) {
  const mount = new THREE.Group();
  mount.name = 'GLTFKit_Fallback_Cockpit_Mount';
  applyPlacementTransform(mount, placement);
  hull.add(mount);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 10), materials.glass);
  canopy.name = 'GLTFKit_Fallback_Cockpit';
  canopy.scale.set(0.42, 0.20, 0.30);
  canopy.userData.keepSeparate = true;
  mount.add(canopy);
  return canopy;
}

function buildFallbackEngine(hull, placement, materials, palette, index) {
  const group = new THREE.Group();
  group.name = `GLTFKit_Fallback_Engine_${index}`;
  applyPlacementTransform(group, placement);
  hull.add(group);
  const drive = kit.buildDrive(group, {
    name: `GLTFKit_Drive_${index}`,
    position: [0, 0, 0],
    radius: 0.12,
    length: 0.28,
    materials: { dark: materials.dark, accent: materials.accent },
    driveColor: palette.thruster,
    coreColor: '#ffffff',
    driveGlowOpacity: 0.55,
  });
  drive.root = group;
  return drive;
}

function buildFallbackFin(hull, materials, placement) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.34, -0.04);
  shape.lineTo(0.26, -0.02);
  shape.lineTo(-0.08, 0.24);
  shape.lineTo(-0.34, 0.14);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -0.035);
  const fin = new THREE.Mesh(geometry, materials.hull);
  fin.name = `GLTFKit_Fallback_${placement.label || 'Fin'}`;
  applyPlacementTransform(fin, placement);
  hull.add(fin);
  return fin;
}

function buildFallbackNavLights(hull, materials, bindings) {
  const material = materials.accent.clone();
  const lights = new THREE.InstancedMesh(getFallbackNavLightGeometry(), material, 2);
  lights.name = 'GLTFKit_Nav_Lights';
  lights.setMatrixAt(0, FALLBACK_NAV_LIGHT_MAT.makeTranslation(0.25, 0.18, -0.38));
  lights.setMatrixAt(1, FALLBACK_NAV_LIGHT_MAT.makeTranslation(0.25, 0.18, 0.38));
  lights.instanceMatrix.needsUpdate = true;
  lights.castShadow = false;
  lights.receiveShadow = false;
  lights.userData.keepSeparate = true;
  lights.userData.spacefaceNoShadow = true;
  lights.userData.damageRole = 'navLight';
  lights.userData.spacefaceTags = { damageRole: 'navLight' };
  hull.add(lights);
  bindings.navLights.push(lights);
  return lights;
}

function getFallbackNavLightGeometry() {
  if (!fallbackNavLightGeometry) {
    fallbackNavLightGeometry = new THREE.SphereGeometry(0.025, 8, 6);
    fallbackNavLightGeometry.userData = {
      ...(fallbackNavLightGeometry.userData || {}),
      spacefaceSharedFallback: true,
    };
    fallbackNavLightGeometry.dispose = () => {};
  }
  return fallbackNavLightGeometry;
}

function ensureStandardSockets(hull) {
  const found = new Set();
  hull.traverse((object) => {
    if (object.userData && object.userData.spacefaceSocket) found.add(object.name);
  });
  const sockets = [
    ['SOCKET_Weapon_Front', [0.84, 0.0, 0], 'weapon', [1, 0, 0]],
    ['SOCKET_Mining_Front', [0.82, -0.08, 0], 'mining', [1, 0, 0]],
    ['SOCKET_Engine_Main', [-0.82, -0.04, 0], 'engine', [-1, 0, 0]],
    ['SOCKET_Trail_Main', [-0.88, -0.04, 0], 'vfx', [-1, 0, 0]],
    ['SOCKET_Utility_Dorsal', [0.0, 0.32, 0], 'utility', [0, 1, 0]],
    ['SOCKET_Cargo_Ventral', [-0.08, -0.30, 0], 'cargo', [0, -1, 0]],
    ['SOCKET_Camera_Focus', [0.08, 0.08, 0], 'camera', [1, 0, 0]],
  ];
  for (const [name, position, role, forward] of sockets) {
    if (!found.has(name)) kit.addSocket(hull, name, position, role, forward);
  }
}

function paletteFor(entity) {
  const faction = entity.factionId && FACTION_PALETTES[entity.factionId];
  let base;
  if (faction) {
    base = {
      hull: faction.hull || faction.primary,
      accent: faction.accent || faction.primary,
      thruster: faction.thruster || faction.emissive || faction.accent || faction.primary,
      dark: faction.secondary || '#111820',
    };
  } else if (entity.team === 0) {
    const free = FACTION_PALETTES.faction_free;
    base = { hull: free.hull, accent: free.accent, thruster: free.thruster, dark: free.secondary };
  } else if (entity.team === 1) {
    const hostile = TEAM_FALLBACK_PALETTES.hostile;
    base = { hull: hostile.hull, accent: hostile.accent, thruster: hostile.thruster, dark: hostile.dark };
  } else {
    const civilian = TEAM_FALLBACK_PALETTES.civilian;
    base = { hull: civilian.hull, accent: civilian.accent, thruster: civilian.thruster, dark: civilian.dark };
  }
  return paletteWithShipAppearance(entity, base);
}

function snapshotMounts(mounts) {
  const sort = (a, b) => {
    const left = String(a.userData.spacefaceMountKey || a.name);
    const right = String(b.userData.spacefaceMountKey || b.name);
    return left < right ? -1 : left > right ? 1 : 0;
  };
  return {
    cockpit: [...mounts.cockpit].sort(sort),
    engine: [...mounts.engine].sort(sort),
    fin: [...mounts.fin].sort(sort),
  };
}

function placementFromMount(mount, assemblyRoot, fallback) {
  if (!mount) return fallback;
  assemblyRoot.updateMatrixWorld(true);
  mount.updateWorldMatrix(true, false);
  const relative = new THREE.Matrix4().copy(assemblyRoot.matrixWorld).invert().multiply(mount.matrixWorld);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const mountScale = new THREE.Vector3();
  relative.decompose(position, quaternion, mountScale);
  const normalization = Number(mount.userData.spacefacePartNormalization) || 1;
  mountScale.divideScalar(normalization);
  if (![position.x, position.y, position.z, mountScale.x, mountScale.y, mountScale.z].every(Number.isFinite) ||
    [mountScale.x, mountScale.y, mountScale.z].some((value) => value <= 1e-6)) {
    return fallback;
  }
  return {
    ...fallback,
    position: position.toArray(),
    quaternion,
    mountScale: mountScale.toArray(),
    mountKey: mount.userData.spacefaceMountKey || mount.name,
  };
}

function applyPlacementTransform(object, placement) {
  if (placement && placement.position) object.position.fromArray(placement.position);
  if (placement && placement.quaternion) object.quaternion.copy(placement.quaternion);
  else if (placement && placement.rotation) object.rotation.fromArray(placement.rotation);
  if (placement && placement.mountScale) object.scale.fromArray(placement.mountScale);
}

function firstRenderable(root) {
  let visible = null;
  let any = null;
  root.traverse((object) => {
    if (!(object.isMesh || object.isLine || object.isPoints)) return;
    if (!any) any = object;
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    if (!visible && object.visible && materials.every((material) => !material || material.visible !== false)) visible = object;
  });
  return visible || any;
}

function disposeDetachedObject(root) {
  const disposePresentation = root && root.userData && root.userData.disposeWorldSitePresentation;
  if (typeof disposePresentation === 'function') disposePresentation();
  root.traverse((object) => {
    if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) if (material && typeof material.dispose === 'function') material.dispose();
  });
}

function disposeDetachedPlaceFallback(root) {
  const disposePresentation = root && root.userData && root.userData.disposeWorldSitePresentation;
  if (typeof disposePresentation === 'function') disposePresentation();
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) {
    if (geometry.userData && geometry.userData.spacefaceSharedFallback) continue;
    if (typeof geometry.dispose === 'function') geometry.dispose();
  }
  for (const material of materials) {
    if (material.userData && material.userData.spacefaceSharedAsset) continue;
    if (typeof material.dispose === 'function') material.dispose();
  }
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Contract/CI probe: immutable hull share keys must canonicalize negligible emissive deltas. */
export function runMaterialSharingContractProbe(THREE_NS = THREE) {
  sharedMaterialVariants.clear();
  const matA = new THREE_NS.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.581,
    metalness: 0.182,
  });
  const matB = new THREE_NS.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x000000,
    emissiveIntensity: 0.004,
    roughness: 0.579,
    metalness: 0.181,
  });
  const palette = { hull: '#C8D8F0', accent: '#A0C4FF', thruster: '#88AAFF', dark: '#1A3A8F' };
  const sharedA = sharedMaterialFor(matA, {}, palette);
  const sharedB = sharedMaterialFor(matB, {}, palette);
  const texturedHull = sharedMaterialFor(
    new THREE_NS.MeshStandardMaterial({
      color: 0xffffff,
      map: { uuid: 'probe-hull-albedo', image: { width: 512, height: 512 } },
      roughness: 0.58,
      metalness: 0.18,
    }),
    {},
    palette,
  );
  const maplessHull = sharedMaterialFor(matA, {}, palette);
  const canopyA = sharedMaterialFor(
    new THREE_NS.MeshPhysicalMaterial({ transmission: 0.6, transparent: true, depthWrite: false }),
    { canopy: true },
    palette,
  );
  const canopyB = sharedMaterialFor(
    new THREE_NS.MeshPhysicalMaterial({ transmission: 0.6, transparent: true, depthWrite: false }),
    { canopy: true },
    palette,
  );
  const semanticMaterial = (role, uuid) => {
    const material = new THREE_NS.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000 });
    material.map = { uuid, image: { width: 64, height: 64 } };
    material.userData.spacefaceMaterialRole = role;
    return material;
  };
  const geology = sharedMaterialFor(semanticMaterial('geology', 'probe-geology'), { tint: 'hull' }, palette);
  const warning = sharedMaterialFor(semanticMaterial('warning', 'probe-warning'), { tint: 'accent' }, palette);
  const mechanical = sharedMaterialFor(semanticMaterial('mechanical', 'probe-mechanical'), { tint: 'hull' }, palette);
  const altPalette = { hull: '#808090', accent: '#A0EEF8', thruster: '#66DDEE', dark: '#206070' };
  const texturedHullAlt = sharedMaterialFor(
    new THREE_NS.MeshStandardMaterial({
      color: 0xffffff,
      map: { uuid: 'probe-hull-albedo', image: { width: 512, height: 512 } },
      roughness: 0.58,
      metalness: 0.18,
    }),
    {},
    altPalette,
  );
  const mechanicalAlt = sharedMaterialFor(semanticMaterial('mechanical', 'probe-mechanical'), { tint: 'hull' }, altPalette);
  return {
    hullShareMerged: sharedA === sharedB,
    maplessHullCanonicalized: maplessHull === texturedHull,
    canopyShareMerged: canopyA === canopyB,
    sharedVariantCount: sharedMaterialVariants.size,
    readabilityShellMerged: readabilityShellMaterial(matA, palette) === readabilityShellMaterial(matB, palette),
    geologyPreservesAuthoredColor: geology.color.getHex() === 0xffffff && geology.emissive.getHex() === 0x000000,
    warningPreservesAuthoredColor: warning.color.getHex() === 0xffffff && warning.emissive.getHex() === 0x000000,
    mechanicalUsesDarkPalette: mechanical.color.b > mechanical.color.r
      && mechanical.color.b > mechanical.color.g
      && mechanical.color.r > 0.85,
    // Color variants remain distinct instances (visual parity) but share program-family names.
    hullProgramFamilyShared: texturedHull.name === texturedHullAlt.name
      && texturedHull.name === 'SF_Shared_hull_textured_hull'
      && texturedHull !== texturedHullAlt
      && texturedHull.color.getHex() !== texturedHullAlt.color.getHex(),
    mechanicalProgramFamilyShared: mechanical.name === mechanicalAlt.name
      && mechanical.name === 'SF_Shared_mechanical_dark'
      && mechanical !== mechanicalAlt,
  };
}
