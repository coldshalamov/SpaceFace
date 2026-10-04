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
import { modelTruthMountFractions, modelTruthRow, modelTruthRowForEntity } from '../data/modelTruth.js';
import { placeDrawScaleFromRow } from '../data/modelTruthMounts.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { SWARM_ROSTER, SWARM_BOSS_ROTATION, bossPackagesFor } from '../data/swarmMode.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { EVERYDAY_SPACE_KIT_MODEL_BY_ID, EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID } from '../data/everydaySpaceKitDressing.js';
import { WRECK_AFTERMATH_MODEL_BY_ID, WRECK_AFTERMATH_PLACE_FILE_BY_ID } from '../data/wreckAftermathDressing.js';
import { buildAlienGrowthProp } from './faunaVisuals.js'; // Alien Ecology — procedural infestation kit
import { buildMachineProp } from './machineVisuals.js'; // Verge-Layer machine structures (doc 07)
import { dropWedgedAuthoredTasks, invalidateFailedAuthoredAssets, loadAuthoredPart, peekSettledAuthoredRecords } from './assetLoader.js';
import { detachBoundaryResolvingMarker, installBoundaryResolvingMarker, packagedPropSpec } from './visualOverrides.js';
import { getAssetResidency } from './assetResidency.js';
import { attachAuthoredMotionDriver, bindInstanceMotion } from './authoredMotion.js';
import { lampShareToken } from './lampBus.js';
import { configureRealtimeCanopyMaterials } from './canopyMaterialPolicy.js';
import { armCallbackAfterPresent } from './compilePresentSlice.js';
import { notePacedFrameSpend } from './decodeTaskBudget.js';
import { createAsyncAdmission, AUTHORED_ASYNC_DEADLINE_MS } from './asyncAdmission.js';
import {
  TABLE_BAND,
  TABLE_DECODE_RUNWAY_SECONDS,
  TABLE_FRAME_SKIRT_WU,
  TABLE_PROMOTE_HORIZON_SECONDS,
  authoredPrefetchRadius,
  classifyTableBand,
  glassHalfExtents,
  isCriticalHubInCurrentSector,
  isCriticalStartingHub as isTableCriticalStartingHub,
  isOpeningStoryActor,
  tableCameraEnvelope,
  tableInstanceFarCullWu,
  tableLookAtDelta,
  tableOpeningCompositionWu,
  tableTravelSpeed,
} from './tabletopPolicy.js';
import { authoredRunwayHorizonSeconds, closingVelocity, declaredPlaceTargetRadius, willEntityEnterAuthoredUpgradeRunway } from './authoredAdmissionPolicy.js';
import { isReleaseAssetMode } from './releaseMode.js';
import { entityVisualCullRadius } from './visualCullRadius.js';
import { RENDER_PACKAGE_PILOTS } from './renderPackageManifest.js';
import * as kit from './ships/shipKit.js';
import { attachRetroMounts } from './thruster/retroMounts.js';
import { attachPlaceHlod, attachStationHlod } from './hlod.js';
import { freezeStaticChildMatrices, freezeStaticTransformRoot } from './staticChildMatrices.js';
import { optimizeStaticBatchesForRoot } from './visualFactory.js';
import { attachLodState } from './lod.js';
import {
  canInstallWholeShipLodFamily,
  lodFileFromFamily,
  normalizeRequestedLod,
  resolveLiveWholeShipLodTransition,
  selectPrewarmLodLevel,
  shouldCommitWholeShipLodLoad,
  WHOLE_SHIP_LOD_RUNTIME_DEMOTION,
} from './wholeShipLodPolicy.js';
import {
  instancePoolIdentity,
  packageBatchPoolKeyFromMaterial,
  stampGeometryBatchKey,
} from './materialBatchKey.js';
import { cloneMaterialPreservingShaderHooks } from './materialClone.js';
import {
  canBatchRenderPackageOwner,
  isRigidOpaqueBatchableSurface,
} from './rigidOpaqueBatchPolicy.js';
import {
  AUTHORED_UPGRADE_OPENING_LIMIT,
  authoredUpgradeConcurrencyLimit as resolveAuthoredUpgradeConcurrency,
  combatantAdmissionPriority,
  openingFrameAdmissionPriority,
  planarRangeWU,
  sectorArrivalPriorityHint,
  survivalDefersArenaDressingJob,
} from './authoredUpgradePolicy.js';
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
import { entityPresenceRadius, PRESENTATION_TIER } from '../world/activityClassification.js';
import { ledgerAwarePos } from '../world/presentationSources.js';
import { canonicalizeObjectSurfaceProgramKeys, canonicalizeSurfaceProgramFamilyKey, installIllustratedSurface } from './illustratedSurface.js';
import { stampOpeningSubmissionPackage } from './openingSubmissionPlan.js';
import { sharedMaterialRoleFromAuthored, stampSharedMaterialRole } from './sharedMaterialRoles.js';

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
import {
  canonicalizeAuthoredProgramState,
  mountCanonicalProgramSpecimens,
  settleCanonicalProgramSpecimens,
} from './programCanon.js';
import { installWorldSitePresentation } from './worldSitePresentation.js';
import { resolveCollisionProxyManifest, effectiveCorridorBearingDeg } from '../data/collisionProxyManifests.js';
import {
  entityRequiresAuthoredPresentation,
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
// PQ-195.00: the SP-07 flywheel assembly is the second authored payload body. File and loader
// slot follow the entity's own authoredPayloadAssetId; the capsule variant below is untouched.
const AUTHORED_SP07_PAYLOAD_ASSET_ID = 'place_breakaway_sp07';
const AUTHORED_SP07_PAYLOAD_FILE = 'places/place_breakaway_sp07.glb';
// ANI-11: jettisoned-cargo payloads (the pods the starter beam splits) render the rigged
// place pod — its render package carries the door rig's MOTION_* pivots + sealed motion bank.
// Matches data.payloadType === 'jettisoned_cargo' (JETTISONED_CARGO_PAYLOAD_TYPE in lootShards).
const AUTHORED_RIGGED_POD_FILE = 'places/place_cargo_pod_standard.glb';
function authoredPayloadIsSpindle(entity) {
  return entity?.data?.authoredPayloadAssetId === AUTHORED_SP07_PAYLOAD_ASSET_ID;
}
function authoredPayloadIsRiggedPod(entity) {
  return entity?.data?.payloadType === 'jettisoned_cargo';
}
export function authoredPayloadFileForEntity(entity) {
  if (authoredPayloadIsRiggedPod(entity)) return AUTHORED_RIGGED_POD_FILE;
  return authoredPayloadIsSpindle(entity) ? AUTHORED_SP07_PAYLOAD_FILE : AUTHORED_CARGO_CAPSULE_FILE;
}
export function authoredPayloadSlotForEntity(entity) {
  return (authoredPayloadIsSpindle(entity) || authoredPayloadIsRiggedPod(entity)) ? 'place' : 'pod';
}
// Draw-time fit: the spindle is authored 1:1 in WU (scale 1 always); the capsule keeps
// the longest-axis fit. Exported for the PQ-195.00 render-selector contract test.
export function authoredPayloadDrawScale(entity, targetRadius, authoredEnvelope) {
  if (authoredPayloadIsSpindle(entity)) return 1;
  return (targetRadius * 2) / authoredEnvelope;
}
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
// Kept boundaries can be reused by a new queue after save/load retires the old one. A late
// continuation must only release or publish resources belonging to its own admission.
const upgradeTokensByBoundary = new WeakMap();
const bootstrapResidencyOwnersByRenderer = new WeakMap();
const authoredInstancedMeshDisposeRegistrationByRenderer = new WeakMap();
const authoredInstancedMeshDisposeProbeByRenderer = new WeakMap();
const contractRecordsBySlot = new Map();
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const MODULE_BY_ID = new Map(MODULES.map((module) => [module.id, module]));
const IDENTITY_MATRIX = new THREE.Matrix4();
const BATCH_INVERSE = new THREE.Matrix4();
const BATCH_LOCAL = new THREE.Matrix4();
const CULL_PROJECTION = new THREE.Matrix4();
const CULL_FRUSTUM = new THREE.Frustum();
const CULL_CAMERA_POSITION = new THREE.Vector3();
const CULL_SPHERE = new THREE.Sphere(new THREE.Vector3(), INSTANCE_FRUSTUM_PAD);
let fallbackNavLightGeometry = null;
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
// PQ-193.09: existing foundry trade-hub overlay identities. Garnish on the live hub, never a
// replacement body and never a new faction system.
const TRADE_HUB_OVERLAY_FILE_BY_FACTION = Object.freeze({
  faction_free: 'places/var_station_trade_hub_free_overlay_v01.glb',
  faction_mts: 'places/var_station_trade_hub_mts_overlay_v01.glb',
  faction_scn: 'places/var_station_trade_hub_scn_overlay_v01.glb',
});
const TRADE_HUB_OVERLAY_FILES = Object.freeze(Object.values(TRADE_HUB_OVERLAY_FILE_BY_FACTION));
const CLAIM_SPECIALIZATION_PLACE_FILE_BY_ID = Object.freeze({
  spec_refinery: 'places/place_claim_outpost_refinery.glb',
  spec_relay: 'places/place_claim_outpost_relay.glb',
  spec_bastion: 'places/place_claim_outpost_bastion.glb',
});
// PQ-193.10: opening dock / dead hulk / debris chunk publish the remastered packaged
// GLBs already on disk. Same-slot identities. Military/grit dock variants stay unrouted
// (sealed foreground hid the selected ship).
export const OPENING_DOCK_HULK_DEBRIS_PLACE_FILE_BY_ID = Object.freeze({
  place_dock_interior: 'places/place_dock_interior.glb',
  place_dead_hulk: 'places/place_dead_hulk.glb',
  place_debris_chunk: 'places/place_debris_chunk.glb',
});
// PQ-193.05: the five WORLD_VISUAL_CENSUS A shapes publish packaged bodies, never primitives.
// Drone/wreck/gate entries mirror the live runtime selectors (visualFactory packaged bodies for
// drone/wreck entities, the station-archetype path for gates). Mine + massSeed have no authored
// body on disk and stay explicitly uncommissioned rather than borrowing a substitute prop.
export const PQ_193_05_DRONE_PACKAGED_FILE = 'places/place_mining_drone.glb';
export const PQ_193_05_GATE_PACKAGED_FILE = 'places/place_gate_jump_ring.glb';
export const PQ_193_05_WRECK_PACKAGED_FILES = Object.freeze([
  'places/place_aftermath_aft_engine_section.glb',
  'places/place_aftermath_aft_cockpit_section.glb',
  'places/place_aftermath_aft_cargo_module.glb',
  'places/place_aftermath_wreck_corvette_turret.glb',
  'places/place_aftermath_aft_weapon_spar.glb',
  'places/place_aftermath_aft_pressure_tank.glb',
]);
export const PQ_193_05_UNCOMMISSIONED_ENTITY_TYPES = Object.freeze(['mine', 'massSeed']);
export function resolve19305CensusAEntityPackagedFile(entity) {
  if (!entity) return null;
  if (entity.type === 'drone') return PQ_193_05_DRONE_PACKAGED_FILE;
  if (entity.type === 'station' && entity.data
    && (entity.data.isGate === true || entity.data.isWormhole === true)) {
    return PQ_193_05_GATE_PACKAGED_FILE;
  }
  // Wreck: the per-entity choice (hazardous / military / hash) lives with the visualFactory
  // packaged-body pointer; the legal body set is PQ_193_05_WRECK_PACKAGED_FILES. Mine +
  // massSeed: uncommissioned — null, never a substitute.
  return null;
}
export function is19305PackagedWreckFile(file) {
  const normalized = String(file || '').replace(/^.*places\//, 'places/');
  return PQ_193_05_WRECK_PACKAGED_FILES.includes(normalized);
}
const PLACE_FILES = Object.freeze([
  'places/place_lane_beacon.glb',
  'places/place_nav_buoy.glb',
  'places/place_asteroid_seamed.glb',
  OPENING_DOCK_HULK_DEBRIS_PLACE_FILE_BY_ID.place_debris_chunk,
  'places/place_station_billboard.glb',
  'places/place_memorial_array.glb',
  OPENING_DOCK_HULK_DEBRIS_PLACE_FILE_BY_ID.place_dead_hulk,
  OPENING_DOCK_HULK_DEBRIS_PLACE_FILE_BY_ID.place_dock_interior,
  'places/place_ceres_bait_wreck.glb',
  'places/place_ceres_grave_shard.glb',
  'places/place_conveyor_barge.glb',
  'places/place_mining_drone.glb',
  'places/place_lane_pin.glb',
  'places/place_cold_locker.glb',
  'places/place_tally_post.glb',
  'places/place_claim_mark.glb',
  'places/place_ash_pin.glb',
  'places/place_whistle.glb',
  'places/place_asteroid_rock_a.glb',
  'places/place_asteroid_rock_b.glb',
  'places/place_asteroid_rock_c.glb',
  'places/place_asteroid_graffiti.glb',
  'places/place_claim_outpost_base.glb',
  // PQ-022.heist-receivers-promote: the Tethys heist catcher/fence wear their own KEEP re-authored
  // bodies; the shared base/refinery files above stay with the World Site stages.
  'places/place_claim_outpost_catcher.glb',
  'places/place_claim_outpost_fence.glb',
  // PQ-018 admission: the Wreck Cathedral hero landmark resolves through the same authored-place
  // path as every other place. Its World Site manifest, Ceres placement, and route acceptance are
  // separate PQ-018 phases; registration here only makes the release artifact resolvable.
  'places/place_landmark_wreck_cathedral.glb',
  // Forge hero landmarks (D54): the named wonders get their own bodies.
  'places/place_landmark_candle_fleet.glb',
  'places/place_landmark_resonant_cathedral.glb',
  'places/place_landmark_skerris_throne.glb',
  // PQ-195.00: the SP-07 spindle (authored payload) and the capture fork machine resolve through
  // the same authored-place path. The fork GLB's origin is the mouth plane (no recentering).
  'places/place_breakaway_sp07.glb',
  'places/place_breakaway_fork.glb',
  // GFX-4: the Quiessence becalmed dark freighters — three bespoke hulls ringing the buoy.
  'places/place_quiessence_freighter_a.glb',
  'places/place_quiessence_freighter_b.glb',
  'places/place_quiessence_freighter_c.glb',
  ...Object.values(CLAIM_SPECIALIZATION_PLACE_FILE_BY_ID),
  ...STATION_ARCHETYPE_FILES,
  ...TRADE_HUB_OVERLAY_FILES,
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

/** Forensic dump: per-pool chunk/slot state and which owners still hold slots. */
export function dumpAuthoredInstancePoolState(scene) {
  const state = scene && sceneStates.get(scene);
  if (!state) return null;
  const ownerLabel = (owner) => {
    const ud = owner && owner.userData || {};
    return owner && (ud.sfStableEntityKey || ud.entityId || owner.name || owner.type) || 'null';
  };
  const pools = [];
  for (const [key, pool] of state.pools) {
    pools.push({
      key,
      retirementPending: !!pool.retirementPending,
      chunks: [...pool.chunks].map((chunk) => ({
        name: chunk.mesh && chunk.mesh.name,
        ordinal: chunk.ordinal,
        retired: !!chunk.retired,
        settling: !!chunk.retirementSettling,
        inScene: !!(chunk.mesh && chunk.mesh.parent),
        count: chunk.mesh ? chunk.mesh.count : -1,
        slots: chunk.slots.size,
        slotOwners: [...chunk.slots.values()].map((slot) => ownerLabel(slot.owner)),
      })),
    });
  }
  const retiring = [...state.retiringChunks].map((chunk) => ({
    name: chunk.mesh && chunk.mesh.name,
    retired: !!chunk.retired,
    settling: !!chunk.retirementSettling,
    slots: chunk.slots.size,
    inScene: !!(chunk.mesh && chunk.mesh.parent),
  }));
  const owners = [...state.ownerSlots.keys()].map(ownerLabel);
  return { pools, retiring, owners };
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
export const REGULAR_HULL_FILES = Object.freeze(
  PART_LIBRARY_CONTRACT.slots.hull.filter((file) => !String(file).startsWith('wholeships/')),
);

export function authoredBootstrapPreloadPlan() {
  return clonePreloadPlan(AUTHORED_BOOTSTRAP_PLAN);
}

function entityOnOpeningTable(entity, state) {
  const player = resolvePlanarPlayer(state);
  if (!player || !player.pos || !entity || !entity.pos) return false;
  const dx = Number(entity.pos.x) - Number(player.pos.x);
  const dz = Number(entity.pos.z) - Number(player.pos.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  const radius = tableOpeningCompositionWu(state);
  return radius > 0 && dx * dx + dz * dz <= radius * radius;
}

function startupAuthoredContactOnRunway(entity, state) {
  const distanceSq = playerPlanarDistanceSq(entity, state);
  if (!Number.isFinite(distanceSq)) return false;
  const radius = tableOpeningCompositionWu(state)
    + authoredPrefetchRadius(tableTravelSpeed(state));
  return Math.sqrt(distanceSq) - entityPresenceRadius(entity) <= radius;
}

function criticalHubWithinStartupRunway(entity, state) {
  const currentSectorId = state && state.world && state.world.currentSectorId;
  if (!isCriticalHubInCurrentSector(entity, currentSectorId)) return false;
  if (!entity.pos) return true;
  const distanceSq = playerPlanarDistanceSq(entity, state);
  if (!Number.isFinite(distanceSq)) return false;
  return Math.sqrt(distanceSq) - entityPresenceRadius(entity)
    <= TABLE_DECODE_RUNWAY_SECONDS * tableTravelSpeed(state);
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
    return criticalHubWithinStartupRunway(entity, state);
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
    return criticalHubWithinStartupRunway(entity, state);
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
  // The readiness gate pins any on-runway payload that packagedPropSpec can mount
  // (GLASS_ACTORS, below) — the composition must schedule the same set or the pin waits on an
  // admission that never starts. The on-table 47-A spindle keeps its dedicated first-flight
  // cook lane instead; a spindle-class payload parked in the runway margin still joins the
  // composition so its pin cannot deadlock.
  const isPackagedContact = entity.type === 'wreck' || entity.type === 'drone'
    || startupPayloadOwnsVeilPin(entity, state);
  if (entity.type !== 'ship' && !isPlace && !isPackagedContact) return false;
  if (isPackagedContact) return startupAuthoredContactOnRunway(entity, state);
  const radius = tableOpeningCompositionWu(state);
  return radius > 0 && dx * dx + dz * dz <= radius * radius;
}

// A payload the packaged-prop lane can mount pins the loading veil only when its admission is
// schedulable during loading. The on-table 47-A spindle is the exception: it owns the dedicated
// first-flight cook lane below (it must not compose early), so pinning it here would wait on an
// admission the gate itself cannot start. A spindle-class body parked off-table is NOT covered by
// the cook lane (isFirstFlightCookEntity requires the table) and stays pinned + composed.
function startupPayloadOwnsVeilPin(entity, state) {
  if ((entity.type !== 'payload' && entity.type !== 'beacon') || !packagedPropSpec(entity)) return false;
  return !(entityOnOpeningTable(entity, state) && isExplicitFirstFlightCookEntity(entity));
}

/**
 * First-flight cook set. The on-table 47-A payload (the evidence spindle) is deliberately kept
 * out of the opening composition, so it has no mesh until this lane runs — without it the first
 * presented frame links its untextured env-mapped standard program as a 100 ms+ bloom brick.
 */
export function isFirstFlightCookEntity(entity, state) {
  if (isInitialAuthoredCompositionEntity(entity, state)) return true;
  if (!entity || entity.alive === false || !state) return false;
  if (!entityOnOpeningTable(entity, state)) return false;
  return isExplicitFirstFlightCookEntity(entity);
}

function isExplicitFirstFlightCookEntity(entity) {
  const data = entity && entity.data || {};
  const ref = typeof data.assetRef === 'string' ? data.assetRef : '';
  return ref === 'asset.slice.47a_spindle'
    || data.scenarioActorId === 'evidence_spindle_47a';
}

const FIRST_FLIGHT_ROCK_TRAVEL_SECONDS = 3;
// Bounds distinct cook keys (typeId|tint|variant), not raw promotes: the shipped field
// key space tops out at 5 typeIds × 5 hash variants = 25, so a cap of 25 is
// coverage-until-exhausted for every field while still bounding total promotes. The
// previous 8 covered only the nearest third of a tier-1 field — the other ~17 variant
// keys mounted cold on the live frame (pop + first-variant upload hitch).
export const FIRST_FLIGHT_ROCK_COOK_CAP = 25;
// Must match visualFactory.hashId(id) % ASTEROID_INSTANCE_VARIANT_COUNT.
const FIRST_FLIGHT_ASTEROID_VARIANT_COUNT = 5;

function asteroidVariantHash(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

export function asteroidFirstFlightTypeKey(entity) {
  const data = entity && entity.data || {};
  return `${data.typeId || 'ast_common_rock'}|${data.tint || ''}`;
}

export function asteroidFirstFlightCookKey(entity) {
  const variant = asteroidVariantHash(entity && entity.id) % FIRST_FLIGHT_ASTEROID_VARIANT_COUNT;
  return `${asteroidFirstFlightTypeKey(entity)}|${variant}`;
}

function resolvePlanarPlayer(state) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : (state && state.entityList || []).find((candidate) => candidate && candidate.id === state.playerId);
}

function planarDistanceSqToPlayer(entity, player) {
  if (!player || !player.pos || !entity || !entity.pos) return Infinity;
  const dx = Number(entity.pos.x) - Number(player.pos.x);
  const dz = Number(entity.pos.z) - Number(player.pos.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return Infinity;
  return dx * dx + dz * dz;
}

function playerPlanarDistanceSq(entity, state) {
  return planarDistanceSqToPlayer(entity, resolvePlanarPlayer(state));
}

export function firstFlightRockCookRadiusWu(state) {
  return tableOpeningCompositionWu(state) + Math.max(0, tableTravelSpeed(state)) * FIRST_FLIGHT_ROCK_TRAVEL_SECONDS;
}

/** Opening ships/places, the 47-A spindle, and the nearest inbound rock variants. */
export function collectFirstFlightCookEntities(state) {
  const list = Array.isArray(state && state.entityList) ? state.entityList : [];
  const selected = [];
  const asteroids = [];
  const rockRadius = firstFlightRockCookRadiusWu(state);
  const rockRadiusSq = rockRadius * rockRadius;
  // The player resolve hoists out of the entity walk — resolving per asteroid paid a
  // Map.get (or an entityList scan) per row inside the cook's unyielded collect window.
  const cookPlayer = resolvePlanarPlayer(state);
  for (const entity of list) {
    if (!entity || entity.alive === false) continue;
    if (isFirstFlightCookEntity(entity, state)) {
      selected.push(entity);
      continue;
    }
    if (entity.type !== 'asteroid') continue;
    const distanceSq = planarDistanceSqToPlayer(entity, cookPlayer);
    // Sort reads the distance the filter just paid for — a per-comparison
    // playerPlanarDistanceSq call re-does entities.get(playerId) O(A·logA) times
    // inside the cook's unyielded collect window.
    if (distanceSq <= rockRadiusSq) asteroids.push({ entity, distanceSq });
  }
  asteroids.sort((left, right) => left.distanceSq - right.distanceSq);
  const seenKeys = new Set();
  for (const { entity } of asteroids) {
    if (seenKeys.size >= FIRST_FLIGHT_ROCK_COOK_CAP) break;
    const key = asteroidFirstFlightCookKey(entity);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    selected.push(entity);
  }
  return selected;
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
    // The body bakes the silhouette, not the fit: fitted guns and budget-heavy modules still
    // mount on its authored SOCKET_* contract, so cook exactly the parts the live build reads.
    const plan = { hull: [file] };
    // Every whole-ship selection resolves to a Forge body under wholeships/ whose metadata
    // integrates hardpoints, so compose never mounts kit records for them (the
    // hullIntegratesHardpoints gates below). Do not decode bolt-on records they cannot draw;
    // a non-integrated whole ship (none are live-selectable today) would keep this path.
    if (!String(file).startsWith('wholeships/')) {
      const fitSeed = hashString(`${entity.id}|${entity.data && entity.data.defId}|${entity.factionId || ''}`);
      const fitDef = SHIP_BY_ID.get(entity.data && entity.data.defId);
      addPlanFiles(plan, 'weapon', authoredWeaponMounts(entity, fitDef, contractRecords('weapon'), fitSeed, { fittedOnly: true })
        .map((mount) => mount.record && mount.record.url));
      const moduleMounts = fittedModuleMounts(entity, contractRecords('pod'), contractRecords('greeble'), fitSeed);
      addPlanFiles(plan, 'pod', moduleMounts
        .filter((mount) => String(mount.file).startsWith('pods/'))
        .map((mount) => mount.record && mount.record.url));
      addPlanFiles(plan, 'greeble', moduleMounts
        .filter((mount) => !String(mount.file).startsWith('pods/'))
        .map((mount) => mount.record && mount.record.url));
    }
    return plan;
  }

  // A required body without a packaged-live selection stays empty. Never request a modular kit
  // that could later be mistaken for the missing whole ship.
  if (options.requiredWholeShip === true || requiresProductionWholeShipForEntity(entity)) return {};

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
  const moduleMounts = fittedModuleMounts(entity, contractRecords('pod'), contractRecords('greeble'), seed);
  addPlanFiles(plan, 'pod', [
    ...authoredPodMounts(entity, shipDef, contractRecords('pod'), seed)
      .map((mount) => mount.record && mount.record.url),
    ...moduleMounts.filter((mount) => String(mount.file).startsWith('pods/'))
      .map((mount) => mount.record && mount.record.url),
  ]);
  addPlanFiles(plan, 'gear', [authoredGearMount(entity, shipDef, contractRecords('gear'), seed)?.record?.url]);
  addPlanFiles(plan, 'greeble', [
    ...authoredGreebleMounts(entity, shipDef, contractRecords('greeble'), seed)
      .map((mount) => mount.record && mount.record.url),
    ...moduleMounts.filter((mount) => !String(mount.file).startsWith('pods/'))
      .map((mount) => mount.record && mount.record.url),
  ]);
  return plan;
}

/** Roster hulls the empty-admission path must publish as complete packaged bodies. */
export const REQUIRED_WHOLE_SHIP_DEF_IDS = Object.freeze([
  'ship_kestrel',
  'ship_wasp',
  'ship_pelican',
  'ship_mule',
  'ship_drifter',
  'ship_hornet',
  'ship_ironback',
  'ship_bastion',
  'ship_atlas',
  'ship_ranger',
  'ship_warden',
  'ship_colossus',
  'ship_leviathan',
  'ship_hawser',
  'ship_saucer',
]);
const REQUIRED_WHOLE_SHIP_DEF_ID_SET = Object.freeze(new Set(REQUIRED_WHOLE_SHIP_DEF_IDS));
const REQUIRED_WHOLE_SHIP_TRAFFIC_ROLES = Object.freeze(new Set([
  'express',
  'smuggler',
  'pirate',
]));
const REQUIRED_WHOLE_SHIP_ASSET_REFS = Object.freeze(new Set([
  'asset.slice.meridian_recovery_tug',
]));

/** Keep sector preparation on the same complete-body selector as the installed visual factory.
 * Hostile and traffic roles already select complete bodies inside wholeShipVisualForEntity; roster
 * defs, the liner, opening smuggler/pirate traffic, and the recovery tug are required so modular
 * kit cannot substitute while those bodies decode. Traffic-role maps still win over defId, so
 * Helios Lark/Span/Cradle stay on courier/hauler/miner. */
export function requiresProductionWholeShipForEntity(entity) {
  if (!entity || entity.type !== 'ship' || !entity.data) return false;
  const data = entity.data;
  // hullDefId is the far-actor table's canonical ship-def alias (leanIdentityData): a hull
  // promoted before defId is re-stamped must still resolve its required body.
  if (REQUIRED_WHOLE_SHIP_DEF_ID_SET.has(data.defId || data.hullDefId)) {
    return true;
  }
  if (REQUIRED_WHOLE_SHIP_TRAFFIC_ROLES.has(String(data.trafficRole || ''))) return true;
  if (REQUIRED_WHOLE_SHIP_ASSET_REFS.has(String(data.assetRef || ''))) return true;
  return false;
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
  const declaredTargetRadius = declaredPlaceTargetRadius(entity);
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
      assetRef: data.assetRef || null,
      silhouette: data.silhouette || null,
      trafficRole: data.trafficRole || null,
      placeId: data.placeId || null,
      assetId: data.assetId || null,
      landmarkGlb: data.landmarkGlb || null,
      archetypeGlb: data.archetypeGlb || null,
      claimSpecId: data.claimSpecId || null,
      claimOwned: data.claimOwned === true,
      placeScale: Number.isFinite(Number(data.placeScale)) ? Number(data.placeScale) : null,
      placeTargetRadius: Number.isFinite(declaredTargetRadius) ? declaredTargetRadius : null,
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
  // Shared files take the NEAREST requesting entity's rank — a file shared by a near and a far
  // body must not rank by whichever entity happened to be iterated first.
  const rankByKey = new Map();

  const pushPlan = (plan, deadlineRank = Infinity) => {
    for (const [slot, files] of Object.entries(plan || {})) {
      for (const file of files || []) {
        if (!file) continue;
        const url = `${partRoot}${file}`;
        const key = `${url}::${slot}`;
        const prior = rankByKey.get(key);
        if (prior !== undefined && deadlineRank < prior) {
          rankByKey.set(key, deadlineRank);
        }
        if (seen.has(key)) continue;
        seen.add(key);
        if (prior === undefined) rankByKey.set(key, deadlineRank);
        requests.push(Object.freeze({ url, slot, deadlineRank }));
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

    const entityDeadlineRank = (options.playerPos && entity.pos)
      ? Math.hypot(
        (Number(entity.pos.x) || 0) - (Number(options.playerPos.x) || 0),
        (Number(entity.pos.z) || 0) - (Number(options.playerPos.z) || 0),
      )
      : Infinity;

    // An explicit packagedPropFile is the entity's authored body (packagedPartUrl scope —
    // always the release parts root regardless of asset mode) but placeFileForEntity never
    // consults it, so a prop whose only authored file is its packagedPropFile minted an
    // empty plan and decoded at reveal.
    const packagedFile = entity.data && entity.data.packagedPropFile;
    if (typeof packagedFile === 'string' && packagedFile) {
      const slot = entity.data.packagedPropSlot
        || (String(packagedFile).replace(/\\/g, '/').startsWith('pods/') ? 'pod' : 'place');
      const url = `${PART_RELEASE_ROOT}${packagedFile}`;
      const key = `${url}::${slot}`;
      const prior = rankByKey.get(key);
      if (prior !== undefined && entityDeadlineRank < prior) {
        rankByKey.set(key, entityDeadlineRank);
      }
      if (!seen.has(key)) {
        seen.add(key);
        if (prior === undefined) rankByKey.set(key, entityDeadlineRank);
        requests.push(Object.freeze({ url, slot, deadlineRank: entityDeadlineRank }));
      }
    } else {
      // packagedPropSpec's own resolutions (SCENARIO_47A map, generic tow, rescue beacons) —
      // entities whose prop file is map-derived, not data-packaged, decode at reveal without it.
      const spec = entity.data ? packagedPropSpec(entity) : null;
      if (spec && spec.file) {
        const slot = spec.slot
          || (String(spec.file).replace(/\\/g, '/').startsWith('pods/') ? 'pod' : 'place');
        const url = `${PART_RELEASE_ROOT}${spec.file}`;
        const key = `${url}::${slot}`;
        const prior = rankByKey.get(key);
        if (prior !== undefined && entityDeadlineRank < prior) {
          rankByKey.set(key, entityDeadlineRank);
        }
        if (!seen.has(key)) {
          seen.add(key);
          if (prior === undefined) rankByKey.set(key, entityDeadlineRank);
          requests.push(Object.freeze({ url, slot, deadlineRank: entityDeadlineRank }));
        }
      }
    }

    let plan = {};
    if (entity.type === 'ship') {
      let lodLevel = options.lodLevel;
      if (!lodLevel && options.playerPos && entity.pos && entity.isPlayer !== true) {
        lodLevel = 'lod0';
        // The projection only feeds selectPrewarmLodLevel's pick — which pins 'lod0' while
        // runtime demotion is off — so spend it only when demotion can answer differently.
        if (WHOLE_SHIP_LOD_RUNTIME_DEMOTION === true) {
          const radius = Number(entity.radius) || 8;
          const px = (radius / Math.max(entityDeadlineRank, 0.001))
            * (Number(options.viewportHeight) || 800);
          lodLevel = selectPrewarmLodLevel(px);
        }
      }
      plan = authoredPreloadPlanForEntity(entity, {
        ...options,
        lodLevel,
        requiredWholeShip: options.requiredWholeShip === true
          || requiresProductionWholeShipForEntity(entity),
      });
    } else if (hasExplicitAuthoredPayloadPresentation(entity)) {
      // PQ-195.00: the prewarm slot must match the boundary's real slot or the loader decodes a
      // second generation — `place` for the spindle, `pod` for the capsule.
      plan = { [authoredPayloadSlotForEntity(entity)]: [authoredPayloadFileForEntity(entity)] };
    } else {
      // Same resolution order as the decode runway: census dressing (drones, gate stations,
      // site props) claims its packaged file before the generic place mapping.
      const censusFile = resolve19305CensusAEntityPackagedFile(entity);
      const placeFile = censusFile || placeFileForEntity(entity);
      if (placeFile) {
        const overlay = censusFile ? null : tradeHubOverlayFileForEntity(entity);
        plan = { place: overlay ? [placeFile, overlay] : [placeFile] };
      }
    }
    pushPlan(plan, entityDeadlineRank);
  }

  // Always retain combat/traffic archetype GLBs for the sector so mid-fight spawns can admit
  // without a cold decode hitch (composition still uses the prepared/defer path). Coverage
  // files have no owner bearing down on the glass — they rank behind every live deadline.
  if (options.includeSpawnableArchetypes !== false) {
    pushPlan({ hull: [...spawnableShipArchetypePrewarmUrls()] });
    // Mid-flight packaged bodies (kill aftermath, drones, payload drops) spawn with no entity
    // plan — same ambient coverage lane, ranking behind every live deadline like the hull set.
    pushPlan(spawnablePackagedBodyPrewarmFiles());
  }

  // Nearest-deadline-first: the alphabetical census order was stable but served the file the
  // player reaches LAST as readily as the one they reach next. deadlineRank keeps ordering
  // deterministic (distance then url) while the serial lane works the next-visible body first.
  // rankByKey holds the min over all requesting entities for shared files.
  requests.sort((a, b) => (rankByKey.get(`${a.url}::${a.slot}`) ?? a.deadlineRank)
    - (rankByKey.get(`${b.url}::${b.slot}`) ?? b.deadlineRank)
    || a.url.localeCompare(b.url)
    || a.slot.localeCompare(b.slot));
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
  ship_hawser: 'engines/engine_industrial.glb',
  ship_bastion: 'engines/engine_plasma_ring.glb',
  ship_warden: 'engines/engine_plasma_ring.glb',
  ship_colossus: 'engines/engine_plasma_ring.glb',
  ship_leviathan: 'engines/engine_plasma_ring.glb',
  // The saucer's drive glow lives in its rim light chain (design/FLYING_SAUCER_DESIGN.md);
  // the resonator pod is the nearest gravimetric visual for the slot.
  ship_saucer: 'engines/engine_resonator.glb',
});

const ENGINE_FILE_BY_DRIVE_ID = Object.freeze({
  drive_reaction_s: 'engines/engine_vector.glb',
  drive_reaction_m: 'engines/engine_ion_small.glb',
  drive_reaction_l: 'engines/engine_ion_twin.glb',
  drive_gravimetric_s: 'engines/engine_resonator.glb',
  drive_inertialess_s: 'engines/engine_resonator.glb',
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
  ship_hawser: 'hulls/hull_freighter.glb',
  ship_saucer: 'hulls/hull_capital.glb',
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
  // The Hawser player hull wears the accepted yard-tug body — the same packaged work
  // hull ambient tug traffic already flies. The fiction is the purchase, not a repaint.
  'ship_hawser': 'wholeships/yard_tug.glb',
  'ship_saucer': 'wholeships/saucer_production_v1.glb',
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
  'ship_hawser': 'SF_WHOLESHIP_YARD_TUG',
  'ship_saucer': 'SF_SAUCER_PRODUCTION_V1',
});
// Independent GLBs let the distance selector load detail on demand. Keep player presentation at
// LOD0 and associate traffic families with the selected visual body, never its gameplay chassis.
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
  ship_saucer: Object.freeze({
    lod0: 'wholeships/saucer_production_v1.glb',
    lod1: 'wholeships/saucer_production_v1_lod1.glb',
    lod2: 'wholeships/saucer_production_v1_lod2.glb',
  }),
});
const WHOLE_SHIP_LOD_FAMILY_BY_FILE = Object.freeze(Object.fromEntries([
  ...Object.values(WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID).map((family) => [family.lod0, family]),
  ['wholeships/massline_express_liner_v1.glb', Object.freeze({
    lod0: 'wholeships/massline_express_liner_v1.glb',
    lod1: 'wholeships/massline_express_liner_v1_lod1.glb',
    lod2: 'wholeships/massline_express_liner_v1_lod2.glb',
  })],
]));
// Reach hostiles are selected by their authoritative combat archetype, not by ship def: several
// enemy roles intentionally share player-facing chassis stats while requiring different combat
// silhouettes. This presentation map changes no doctrine, hostility, movement, or damage data.
// Only files that already have a render-package pilot may be requested on the live
// empty-admission path. A remaster sibling that exists on disk but is not packaged
// fails closed and leaves a targeting lock on blank space.
const PACKAGED_LIVE_WHOLE_SHIP_FILES = new Set(RENDER_PACKAGE_PILOTS
  .filter((pilot) => pilot.sourceUrl.startsWith('assets/ships/release/parts/wholeships/'))
  .map((pilot) => pilot.sourceUrl.slice('assets/ships/release/parts/'.length)));

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

// S6 faction hulls: palette + lit-trim variants of the hull the enemy already renders (same
// geometry, collider fit and sockets; tools/blender/forge/variant.py). Enemy-id keyed on purpose:
// the live entity's factionId is whatever zone or encounter fielded it, the enemy id is not.
//   patrol_lawman, customs_cutter  Concord navy Hornet interdictor (was the player's yellow Hornet)
//   quiet_ghost                    The Quiet's ink-violet Wasp (lancer_sniper and the pirate Wasp stay put)
//   choir_zealot                   Ascendant Choir plum/magenta dart (the Reach dart keeps its sodium)
//   warden_escort                  Vael teal lode (the Reach bruisers keep the oxide lode)
const WHOLE_SHIP_FILE_BY_HOSTILE_ID = Object.freeze({
  wasp_swarmer: 'wholeships/ashline_dart.glb',
  choir_zealot: 'wholeships/ashline_dart_choir.glb',
  lancer_sniper: 'wholeships/wasp_production_v1.glb',
  quiet_ghost: 'wholeships/wasp_quiet_ghost.glb',
  patrol_lawman: 'wholeships/hornet_scn_interdictor.glb',
  customs_cutter: 'wholeships/hornet_scn_interdictor.glb',
  warden_escort: 'wholeships/ashline_lode_vael.glb',
  bruiser_brawler: 'wholeships/ashline_lode.glb',
  pd_screen_escort: 'wholeships/ashline_lode.glb',
  field_anchor_controller: 'wholeships/ashline_lode.glb',
  reaver_pirate: 'wholeships/ashline_rig.glb',
  mine_layer_jackal: 'wholeships/ashline_rig.glb',
  corsair_raider: 'wholeships/ashline_rig_corsair_blade.glb',
  tether_control_raider: 'wholeships/ashline_rig.glb',
  mule_trader: 'wholeships/helios_span.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID = Object.freeze({
  wasp_swarmer: 'SF_WHOLESHIP_ASHLINE_DART',
  choir_zealot: 'SF_WHOLESHIP_ASHLINE_DART_CHOIR',
  lancer_sniper: 'SF_WASP_PRODUCTION_V1',
  quiet_ghost: 'SF_WASP_QUIET_GHOST',
  patrol_lawman: 'SF_HORNET_SCN_INTERDICTOR',
  customs_cutter: 'SF_HORNET_SCN_INTERDICTOR',
  warden_escort: 'SF_WHOLESHIP_ASHLINE_LODE_VAEL',
  bruiser_brawler: 'SF_WHOLESHIP_ASHLINE_LODE',
  pd_screen_escort: 'SF_WHOLESHIP_ASHLINE_LODE',
  field_anchor_controller: 'SF_WHOLESHIP_ASHLINE_LODE',
  reaver_pirate: 'SF_WHOLESHIP_ASHLINE_RIG',
  mine_layer_jackal: 'SF_WHOLESHIP_ASHLINE_RIG',
  corsair_raider: 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE',
  tether_control_raider: 'SF_WHOLESHIP_ASHLINE_RIG',
  mule_trader: 'SF_WHOLESHIP_HELIOS_SPAN',
});
const WHOLE_SHIP_FILE_BY_SILHOUETTE = Object.freeze({
  drone_swarm: 'wholeships/ashline_dart.glb',
  sniper_lance: 'wholeships/wasp_production_v1.glb',
  bruiser_armor: 'wholeships/ashline_lode.glb',
  pirate_swoop: 'wholeships/ashline_rig.glb',
  corsair_blade: 'wholeships/ashline_rig_corsair_blade.glb',
  trader_haul: 'wholeships/helios_span.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE = Object.freeze({
  drone_swarm: 'SF_WHOLESHIP_ASHLINE_DART',
  sniper_lance: 'SF_WASP_PRODUCTION_V1',
  bruiser_armor: 'SF_WHOLESHIP_ASHLINE_LODE',
  pirate_swoop: 'SF_WHOLESHIP_ASHLINE_RIG',
  corsair_blade: 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE',
  trader_haul: 'SF_WHOLESHIP_HELIOS_SPAN',
});
const WHOLE_SHIP_FILE_BY_ASSET_REF = Object.freeze({
  enemy_reaver_interceptor: 'wholeships/ashline_rig.glb',
  enemy_reaver_skirmisher: 'wholeships/ashline_rig.glb',
  enemy_reaver_tug: 'wholeships/ashline_rig.glb',
  'asset.slice.meridian_recovery_tug': 'wholeships/yard_tug.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_ASSET_REF = Object.freeze({
  enemy_reaver_interceptor: 'SF_WHOLESHIP_ASHLINE_RIG',
  enemy_reaver_skirmisher: 'SF_WHOLESHIP_ASHLINE_RIG',
  enemy_reaver_tug: 'SF_WHOLESHIP_ASHLINE_RIG',
  'asset.slice.meridian_recovery_tug': 'SF_WHOLESHIP_YARD_TUG',
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
  // PQ-193.07: rare Helios heavy. Additive key — do not remap hauler/Span or Atlas.
  arclight: 'wholeships/helios_arclight.glb',
  ore_carrier: 'wholeships/ore_barge.glb',
  tender: 'wholeships/repair_tender.glb',
  salvor: 'wholeships/salvage_cutter.glb',
  surveyor: 'wholeships/survey_pin.glb',
  // PQ-136.02: packaged work-fleet hulls with no recorded still-review defect. Additive
  // keys only — existing role values above stay the accepted live bodies.
  // PQ-049: Helios express selects the civic liner after its release/package proof.
  express: 'wholeships/massline_express_liner_v1.glb',
  rescue: 'wholeships/rescue_lifter.glb',
  prospector: 'wholeships/prospector_skiff.glb',
  sweeper: 'wholeships/scrap_sweeper.glb',
  shuttle: 'wholeships/apron_shuttle.glb',
  tug: 'wholeships/yard_tug.glb',
  // PQ-193.08: rare Helios extras. Additive keys — do not remap Span, Atlas, or Arclight.
  tanker: 'wholeships/volatiles_tanker.glb',
  customs: 'wholeships/inspection_cutter.glb',
  // PQ-193.01: opening smuggler / pirate publish complete Hitch-world hulls, never modular kit.
  // Chase stills vs Hitch (play_chase / close): Drifter is a complete dark hull; factory Hornet
  // reads as a pale toy (Hitch-plus fail). Pirate uses the accepted Wasp of the same combat role.
  smuggler: 'wholeships/drifter_production_v1.glb',
  pirate: 'wholeships/wasp_production_v1.glb',
});
const WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE = Object.freeze({
  // Must match the asset identity embedded in each packaged traffic body above; the record
  // resolver rejects a whole-ship load whose assetId differs from the selected role identity.
  // Verified against asset.extras.spacefaceAsset.assetId in each release GLB.
  courier: 'SF_WHOLESHIP_HELIOS_LARK',
  miner: 'SF_WHOLESHIP_HELIOS_CRADLE',
  hauler: 'SF_WHOLESHIP_HELIOS_SPAN',
  arclight: 'SF_WHOLESHIP_HELIOS_ARCLIGHT',
  ore_carrier: 'SF_WHOLESHIP_ORE_BARGE',
  tender: 'SF_WHOLESHIP_REPAIR_TENDER',
  salvor: 'SF_WHOLESHIP_SALVAGE_CUTTER',
  surveyor: 'SF_WHOLESHIP_SURVEY_PIN',
  express: 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1',
  rescue: 'SF_WHOLESHIP_RESCUE_LIFTER',
  prospector: 'SF_WHOLESHIP_PROSPECTOR_SKIFF',
  sweeper: 'SF_WHOLESHIP_SCRAP_SWEEPER',
  shuttle: 'SF_WHOLESHIP_APRON_SHUTTLE',
  tug: 'SF_WHOLESHIP_YARD_TUG',
  tanker: 'SF_WHOLESHIP_VOLATILES_TANKER',
  customs: 'SF_WHOLESHIP_INSPECTION_CUTTER',
  smuggler: 'SF_DRIFTER_PRODUCTION_V1',
  pirate: 'SF_WASP_PRODUCTION_V1',
});
// PQ-193.09: live Span/Wasp carry existing foundry faction kits. Unknown factions keep the
// unskinned body. Pirate Wasp and the player Wasp stay the accepted production hull.
const SPAN_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_dmc: Object.freeze({ file: 'wholeships/helios_span_dmc.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN_DMC' }),
  faction_mts: Object.freeze({ file: 'wholeships/helios_span_mts.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN_MTS' }),
  faction_reach: Object.freeze({ file: 'wholeships/helios_span_reach.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN_REACH' }),
});
const WASP_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_free: Object.freeze({ file: 'wholeships/wasp_free_militia.glb', assetId: 'SF_WASP_FREE_MILITIA' }),
  faction_mts: Object.freeze({ file: 'wholeships/wasp_mts_escort.glb', assetId: 'SF_WASP_MTS_ESCORT' }),
  faction_scn: Object.freeze({ file: 'wholeships/wasp_scn_patrol.glb', assetId: 'SF_WASP_SCN_PATROL' }),
});
const WASP_FACTION_KIT_ROLES = Object.freeze(new Set(['patrol', 'escort']));
// S6: faction-fielded hulls whose enemy id / role is shared across factions, so the body follows the
// entity's factionId like the Span and Wasp kits. Rig hostiles fielded under the Quiet (the smuggler
// zones of Tethys Junction and Pallas Drift) and miner barges flying for the Drift Miners Collective
// (Ceres, Vesta, Charon traffic) wear their operator's paint; every other faction keeps the base hull.
const RIG_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_quiet: Object.freeze({ file: 'wholeships/ashline_rig_quiet.glb', assetId: 'SF_WHOLESHIP_ASHLINE_RIG_QUIET' }),
});
const CRADLE_FACTION_KIT_BY_FACTION = Object.freeze({
  faction_dmc: Object.freeze({ file: 'wholeships/helios_cradle_dmc.glb', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE_DMC' }),
});
const LIVE_SPAN_FILE = 'wholeships/helios_span.glb';
const LIVE_WASP_FILE = 'wholeships/wasp_production_v1.glb';
const LIVE_RIG_FILE = 'wholeships/ashline_rig.glb';
const LIVE_CRADLE_FILE = 'wholeships/helios_cradle.glb';
const LIVE_TRADE_HUB_FILE = 'places/place_station_trade_hub.glb';
/** Helios / Kessler opening-flyby NPC slots. Each must resolve a packaged complete hull. */
export const OPENING_FLYBY_NPC_SLOTS = Object.freeze([
  Object.freeze({ id: 'smuggler', data: Object.freeze({ defId: 'ship_drifter', trafficRole: 'smuggler' }) }),
  Object.freeze({ id: 'pirate', data: Object.freeze({ defId: 'ship_hornet', trafficRole: 'pirate' }) }),
  Object.freeze({ id: 'courier', data: Object.freeze({ defId: 'ship_kestrel', trafficRole: 'courier' }) }),
  Object.freeze({ id: 'hauler', data: Object.freeze({ defId: 'ship_mule', trafficRole: 'hauler' }) }),
  Object.freeze({ id: 'miner', data: Object.freeze({ defId: 'ship_pelican', trafficRole: 'miner' }) }),
  Object.freeze({ id: 'tug', data: Object.freeze({ defId: 'ship_hawser', trafficRole: 'tug' }) }),
  Object.freeze({
    id: 'recovery_tug',
    data: Object.freeze({ defId: 'ship_hawser', assetRef: 'asset.slice.meridian_recovery_tug' }),
  }),
]);
const WHOLE_SHIP_URLS = Object.freeze([
  ...Object.values(WHOLE_SHIP_FILE_BY_DEF_ID),
  ...Object.values(WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID).flatMap((family) => Object.values(family)),
  ...Object.values(WHOLE_SHIP_FILE_BY_HOSTILE_ID),
  ...Object.values(WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE),
  ...Object.values(SPAN_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
  ...Object.values(WASP_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
  ...Object.values(RIG_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
  ...Object.values(CRADLE_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
]);
// Retail-routable release paths so check:asset-reachability counts the kits as live.
const FACTION_KIT_RELEASE_URLS = Object.freeze([
  'assets/ships/release/parts/wholeships/helios_span_dmc.glb',
  'assets/ships/release/parts/wholeships/helios_span_mts.glb',
  'assets/ships/release/parts/wholeships/helios_span_reach.glb',
  'assets/ships/release/parts/wholeships/wasp_free_militia.glb',
  'assets/ships/release/parts/wholeships/wasp_mts_escort.glb',
  'assets/ships/release/parts/wholeships/wasp_scn_patrol.glb',
  'assets/ships/release/parts/wholeships/hornet_scn_interdictor.glb',
  'assets/ships/release/parts/wholeships/wasp_quiet_ghost.glb',
  'assets/ships/release/parts/wholeships/ashline_dart_choir.glb',
  'assets/ships/release/parts/wholeships/ashline_lode_vael.glb',
  'assets/ships/release/parts/wholeships/ashline_rig_quiet.glb',
  'assets/ships/release/parts/wholeships/helios_cradle_dmc.glb',
  'assets/ships/release/parts/places/var_station_trade_hub_free_overlay_v01.glb',
  'assets/ships/release/parts/places/var_station_trade_hub_mts_overlay_v01.glb',
  'assets/ships/release/parts/places/var_station_trade_hub_scn_overlay_v01.glb',
]);
void FACTION_KIT_RELEASE_URLS;
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

/** Empty-admission identity: a mapped file that is not packaged-live must not publish. */
function liveWholeShipSelection(file, assetId, roleId, lodFamily = null) {
  if (!packagedLiveWholeShipFile(file)) return null;
  // Role/archetype overrides can select a Wasp for a Hornet stat block. Faction kits do not
  // inherit the base family's LODs: changing distance must never change a ship's livery.
  return wholeShipSelection(file, assetId, roleId, lodFamily || WHOLE_SHIP_LOD_FAMILY_BY_FILE[file] || null);
}

function factionIdForVisual(entity) {
  const data = entity && entity.data || {};
  return String(entity && entity.factionId || data.factionId || '');
}

function applyFactionWholeShipKit(entity, selection) {
  if (!selection || !selection.file) return selection;
  const factionId = factionIdForVisual(entity);
  if (!factionId) return selection;
  if (selection.file === LIVE_SPAN_FILE) {
    const kit = SPAN_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
    return selection;
  }
  if (selection.file === LIVE_WASP_FILE) {
    const role = String(entity && entity.data && entity.data.trafficRole || '');
    if (!WASP_FACTION_KIT_ROLES.has(role)) return selection;
    const kit = WASP_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_RIG_FILE) {
    const kit = RIG_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  if (selection.file === LIVE_CRADLE_FILE) {
    const kit = CRADLE_FACTION_KIT_BY_FACTION[factionId];
    if (kit) return liveWholeShipSelection(kit.file, kit.assetId, selection.roleId);
  }
  return selection;
}

export function tradeHubOverlayFileForEntity(entity) {
  if (!entity || entity.type !== 'station') return null;
  const placeFile = placeFileForEntity(entity);
  if (placeFile !== LIVE_TRADE_HUB_FILE) return null;
  const overlay = TRADE_HUB_OVERLAY_FILE_BY_FACTION[factionIdForVisual(entity)];
  return overlay || null;
}

// The faction garnish instantiates at the same draw scale as the base body, so its measured
// census row unions into every envelope stamp that claims the boundary's drawn extent —
// without it, multi-part hubs classify ~3x narrower than their composed silhouette.
function tradeHubOverlayCensusRowForEntity(entity) {
  const overlayFile = tradeHubOverlayFileForEntity(entity);
  if (!overlayFile) return null;
  const stem = overlayFile.slice(overlayFile.lastIndexOf('/') + 1).replace(/\.glb$/i, '');
  return modelTruthRow(stem);
}

function placeFileStem(url) {
  const name = typeof url === 'string' && url ? url.slice(url.lastIndexOf('/') + 1) : null;
  return name ? name.replace(/\.[^.]+$/, '') : null;
}

// Offset-aware union over the base row's extent and (when present) the deterministic
// overlay's census row — both draw at the same scale, and a garnish mounted off the hub
// axis contributes its own center±half extent rather than just its size. Returns the
// union's true authored-space box: an off-center union's far edge lives at (lo+hi)/2,
// not the origin, so the stamp must carry the union center to claim it honestly.
function placeVisualUnionWithOverlay(entity, size, center) {
  if (!Array.isArray(size)) return null;
  const overlayRow = tradeHubOverlayCensusRowForEntity(entity);
  const overlaySize = overlayRow && overlayRow.bounds && overlayRow.bounds.size;
  if (!Array.isArray(overlaySize)) {
    return { size, center: Array.isArray(center) ? center : [0, 0, 0] };
  }
  const overlayCenter = overlayRow.bounds && overlayRow.bounds.center;
  const outSize = [0, 0, 0];
  const outCenter = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const baseHalf = (Number(size[i]) || 0) / 2;
    const baseC = Array.isArray(center) ? Number(center[i]) || 0 : 0;
    const overHalf = (Number(overlaySize[i]) || 0) / 2;
    const overC = Array.isArray(overlayCenter) ? Number(overlayCenter[i]) || 0 : 0;
    const lo = Math.min(baseC - baseHalf, overC - overHalf);
    const hi = Math.max(baseC + baseHalf, overC + overHalf);
    outCenter[i] = (lo + hi) / 2;
    outSize[i] = hi - lo;
  }
  return { size: outSize, center: outCenter };
}

// AUTHORED_APPROACH_CHANNEL_DEG families yaw their composed root by (corridor−channel)
// at install; the stamp claims the rotated box statically — same resolvers, no decode.
// A trade hub yawed ~55° draws a rotated silhouette, not the record's axis envelope.
// Takes and returns {size, center}: an off-center union's stamped center yaw-rotates
// with the composed root (rotation.y maps (x,z) → (x·cos+z·sin, −x·sin+z·cos)).
function placeStampEnvelopeBounds(entity, bounds, boundary) {
  if (!bounds || !Array.isArray(bounds.size) || !entity || entity.type !== 'station') return bounds;
  const size = bounds.size;
  const data = entity.data || {};
  const placeId = (boundary && boundary.userData && boundary.userData.placeId)
    || data.placeId
    || null;
  const channelDeg = AUTHORED_APPROACH_CHANNEL_DEG[placeId];
  if (!Number.isFinite(channelDeg)) return bounds;
  const manifest = resolveCollisionProxyManifest(entity);
  if (!manifest || !manifest.docking) return bounds;
  const corridorDeg = effectiveCorridorBearingDeg(manifest, entity);
  if (!Number.isFinite(corridorDeg)) return bounds;
  const yawDeg = ((corridorDeg - channelDeg + 540) % 360) - 180;
  if (!yawDeg) return bounds;
  const rad = yawDeg * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const ac = Math.abs(c);
  const as = Math.abs(s);
  const x = Number(size[0]) || 0;
  const z = Number(size[2]) || 0;
  const center = bounds.center;
  const cx = Array.isArray(center) ? Number(center[0]) || 0 : 0;
  const cy = Array.isArray(center) ? Number(center[1]) || 0 : 0;
  const cz = Array.isArray(center) ? Number(center[2]) || 0 : 0;
  return {
    size: [ac * x + as * z, size[1], as * x + ac * z],
    center: [cx * c + cz * s, cy, -cx * s + cz * c],
  };
}

/** Pure presentation selection hook used by composition and focused asset checks. */
export function wholeShipVisualForEntity(entity, options = {}) {
  const data = entity && entity.data || {};
  const hostileId = String(data.lootTableId || '');
  const hostileFile = WHOLE_SHIP_FILE_BY_HOSTILE_ID[hostileId];
  if (hostileFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      hostileFile, WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID[hostileId], hostileId,
    ));
  }
  const silhouette = String(data.silhouette || '');
  const silhouetteFile = WHOLE_SHIP_FILE_BY_SILHOUETTE[silhouette];
  if (silhouetteFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      silhouetteFile,
      WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE[silhouette],
      silhouette,
    ));
  }
  const assetRef = String(data.assetRef || '');
  const assetRefFile = WHOLE_SHIP_FILE_BY_ASSET_REF[assetRef];
  if (assetRefFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      assetRefFile,
      WHOLE_SHIP_ASSET_ID_BY_ASSET_REF[assetRef],
      assetRef,
    ));
  }
  const trafficRole = String(data.trafficRole || '');
  const trafficFile = WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE[trafficRole];
  if (trafficFile) {
    return applyFactionWholeShipKit(entity, liveWholeShipSelection(
      trafficFile,
      WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE[trafficRole],
      trafficRole,
    ));
  }
  if (options.requiredWholeShip !== true && !requiresProductionWholeShipForEntity(entity)) return null;
  const defId = data.defId || data.hullDefId;
  const file = WHOLE_SHIP_FILE_BY_DEF_ID[defId];
  return applyFactionWholeShipKit(entity, file ? liveWholeShipSelection(
    file,
    WHOLE_SHIP_ASSET_ID_BY_DEF_ID[defId],
    defId,
    WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID[defId] || null,
  ) : null);
}

export function openingFlybyNpcEntity(slot) {
  return {
    id: `opening:${slot && slot.id || 'npc'}`,
    type: 'ship',
    alive: true,
    data: { ...(slot && slot.data || {}) },
  };
}

/** Packaged complete body for one opening-flyby NPC slot. Accessory-only maps fail closed. */
export function openingFlybyNpcBody(slot) {
  return wholeShipVisualForEntity(openingFlybyNpcEntity(slot), { requiredWholeShip: true });
}

/** Seed-stable catalog of opening-flyby NPC bodies. Hitch / Kestrel is never an NPC row. */
export function openingFlybyNpcCatalog() {
  return OPENING_FLYBY_NPC_SLOTS.map((slot) => {
    const visual = openingFlybyNpcBody(slot);
    return Object.freeze({
      id: slot.id,
      file: visual && visual.file || null,
      assetId: visual && visual.assetId || null,
    });
  });
}

// Live solids the loader actually resolves. The model-truth census measures these files;
// it does not invent a second asset list. Behavior of drawing and collision is unchanged.
const STATION_SIZE_REFERENCES = Object.freeze([
  Object.freeze({ name: 'S', dockRadius: 60, entityRadius: 26 }),
  Object.freeze({ name: 'M', dockRadius: 72, entityRadius: 34 }),
  Object.freeze({ name: 'L', dockRadius: 90, entityRadius: 42 }),
]);
const GATE_SIZE_REFERENCES = Object.freeze([
  Object.freeze({ name: 'gate', dockRadius: 70, entityRadius: 32 }),
  Object.freeze({ name: 'wormhole', dockRadius: 80, entityRadius: 38 }),
]);
const DRESSING_RADIUS_BY_PLACE = Object.freeze({
  place_lane_beacon: 18,
  place_nav_buoy: 12,
  place_mining_drone: 8,
  place_station_billboard: 28,
  place_conveyor_barge: 48,
  place_dead_hulk: 42,
  place_debris_chunk: 26,
  place_ceres_bait_wreck: 48,
  place_ceres_grave_shard: 28,
  place_asteroid_seamed: 18,
  place_asteroid_rock_a: 15,
  place_asteroid_rock_b: 18,
  place_asteroid_rock_c: 10,
  place_asteroid_graffiti: 16,
  // Forge hero landmarks: the reference radius is the authored plan half-extent, so a POI's
  // visualRadius is the drawn world radius (D54).
  place_landmark_candle_fleet: 106,
  place_landmark_resonant_cathedral: 90,
  place_landmark_skerris_throne: 109,
});

function placeFamily(placeId) {
  const id = String(placeId || '');
  if (id.includes('buoy') || id === 'place_lane_beacon' || id === 'place_lane_pin' || id === 'place_whistle') return 'buoy';
  if (id.includes('wreck') || id.includes('hulk') || id.includes('debris') || id.includes('grave') || id.includes('aftermath')) return 'wreck';
  if (id.includes('drone')) return 'drone';
  if (id.includes('pod') || id.includes('cargo') || id.includes('container')) return 'pod';
  if (id.includes('asteroid') || id.includes('rock')) return 'rock-authored';
  if (id.includes('billboard')) return 'sign';
  return 'place';
}

function catalogRow(row) {
  return Object.freeze(row);
}

export function liveSolidGlbCatalog() {
  const rows = [];
  const seen = new Set();
  const add = (row) => {
    if (!row || !row.id) return;
    const key = `${row.family}|${row.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(catalogRow(row));
  };

  for (const file of STATION_ARCHETYPE_FILES) {
    const placeId = file.replace(/^places\//, '').replace(/\.glb$/, '');
    const gate = placeId === 'place_gate_jump_ring';
    add({
      id: placeId,
      family: gate ? 'gate' : 'station',
      file,
      fit: 'station',
      dockRadius: gate ? 70 : 72,
      entityRadius: gate ? 32 : 34,
      colliderKind: 'proxy',
      colliderId: gate ? 'gate_jump_ring' : 'station_ring_hub',
      sizes: gate ? GATE_SIZE_REFERENCES : STATION_SIZE_REFERENCES,
      solid: true,
      opening: gate ? 'gate-throat' : 'dock-mouth',
    });
  }

  for (const ship of SHIPS) {
    const selection = wholeShipVisualForEntity(
      { type: 'ship', alive: true, id: ship.id, radius: ship.collisionRadius, data: { defId: ship.id } },
      { requiredWholeShip: true },
    );
    const file = selection && selection.file || WHOLE_SHIP_FILE_BY_DEF_ID[ship.id] || null;
    add({
      id: ship.id,
      family: 'player-hull',
      file,
      lodFamily: (selection && selection.lodFamily) || WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID[ship.id] || null,
      fit: 'ship',
      entityRadius: ship.collisionRadius,
      colliderKind: 'capsule',
      proportionsKey: ship.id,
      solid: true,
      frozenMesh: ship.id === 'ship_kestrel',
      // The forge rebuild ships a re-measured hull under the frozen K0 gameplay anchors:
      // pin the anchor fit scale so sockets/hit volumes land at their pre-forge world
      // positions (the 47a golden pins them bit-exact).
      anchorFitScale: ship.id === 'ship_kestrel' ? 0.853237 : null,
      packagedLive: !!(selection && selection.file),
    });
  }

  for (const enemy of ENEMY_TYPES) {
    const selection = wholeShipVisualForEntity({
      type: 'ship',
      alive: true,
      id: enemy.id,
      radius: enemy.collisionRadius,
      data: { defId: enemy.shipId, silhouette: enemy.silhouette, lootTableId: enemy.id },
    }, { requiredWholeShip: true });
    add({
      id: enemy.id,
      family: 'enemy-hull',
      file: selection && selection.file || null,
      lodFamily: (selection && selection.lodFamily) || null,
      fit: 'ship',
      entityRadius: enemy.collisionRadius,
      colliderKind: 'capsule',
      proportionsKey: enemy.silhouette || enemy.shipId || enemy.id,
      silhouette: enemy.silhouette || null,
      solid: true,
      packagedLive: !!(selection && selection.file),
    });
  }

  for (const [role, file] of Object.entries(WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE)) {
    const selection = wholeShipVisualForEntity({
      type: 'ship', alive: true, id: `traffic:${role}`, radius: 14,
      data: { trafficRole: role, defId: 'ship_kestrel' },
    }, { requiredWholeShip: true });
    add({
      id: `traffic:${role}`,
      family: 'traffic-hull',
      file: (selection && selection.file) || file,
      lodFamily: WHOLE_SHIP_LOD_FAMILY_BY_FILE[file] || (selection && selection.lodFamily) || null,
      fit: 'ship',
      entityRadius: 14,
      colliderKind: 'capsule',
      proportionsKey: role,
      solid: true,
      packagedLive: !!(selection && selection.file) || isPackagedLiveWholeShipFile(file),
    });
  }

  for (const [faction, kit] of Object.entries(SPAN_FACTION_KIT_BY_FACTION)) {
    add({
      id: `span:${faction}`,
      family: 'faction-hull',
      file: kit.file,
      fit: 'ship',
      entityRadius: 18,
      colliderKind: 'capsule',
      proportionsKey: `span:${faction}`,
      solid: true,
      packagedLive: isPackagedLiveWholeShipFile(kit.file),
    });
  }
  for (const [faction, kit] of Object.entries(WASP_FACTION_KIT_BY_FACTION)) {
    add({
      id: `wasp:${faction}`,
      family: 'faction-hull',
      file: kit.file,
      fit: 'ship',
      entityRadius: 14,
      colliderKind: 'capsule',
      proportionsKey: 'ship_wasp',
      solid: true,
      packagedLive: isPackagedLiveWholeShipFile(kit.file),
    });
  }
  for (const [faction, kit] of Object.entries(RIG_FACTION_KIT_BY_FACTION)) {
    add({
      id: `rig:${faction}`,
      family: 'faction-hull',
      file: kit.file,
      fit: 'ship',
      entityRadius: 18,
      colliderKind: 'capsule',
      proportionsKey: 'pirate_swoop',
      solid: true,
      packagedLive: isPackagedLiveWholeShipFile(kit.file),
    });
  }
  for (const [faction, kit] of Object.entries(CRADLE_FACTION_KIT_BY_FACTION)) {
    add({
      id: `cradle:${faction}`,
      family: 'faction-hull',
      file: kit.file,
      fit: 'ship',
      entityRadius: 14,
      colliderKind: 'capsule',
      proportionsKey: 'miner',
      solid: true,
      packagedLive: isPackagedLiveWholeShipFile(kit.file),
    });
  }

  for (const file of PLACE_FILES) {
    if (STATION_ARCHETYPE_FILES.includes(file)) continue;
    const placeId = file.replace(/^places\//, '').replace(/\.glb$/, '');
    const family = placeFamily(placeId);
    const dressingRadius = DRESSING_RADIUS_BY_PLACE[placeId] || 12;
    add({
      id: placeId,
      family,
      file,
      fit: family === 'drone' ? 'packaged-radius' : 'place-scale',
      placeScale: 1,
      entityRadius: family === 'drone' ? 2.4 : dressingRadius,
      colliderKind: 'none',
      solid: true,
      nonSolidReason: null,
    });
  }

  for (const [id, model] of Object.entries(WRECK_AFTERMATH_MODEL_BY_ID)) {
    if (!model || model.live === false) continue;
    add({
      id,
      family: 'wreck',
      file: model.file,
      fit: 'place-scale',
      placeScale: 1,
      entityRadius: model.radius,
      colliderKind: 'none',
      solid: true,
      nonSolidReason: null,
    });
  }

  for (const [id, model] of Object.entries(EVERYDAY_SPACE_KIT_MODEL_BY_ID)) {
    add({
      id,
      family: placeFamily(id),
      file: model.file,
      fit: 'place-scale',
      placeScale: 1,
      entityRadius: model.radius || 12,
      colliderKind: 'none',
      solid: true,
      nonSolidReason: null,
    });
  }

  add({
    id: 'pod_cargo_container',
    family: 'pod',
    file: authoredPayloadFileForEntity({ type: 'payload', alive: true, data: { authoredPayloadAssetId: 'pod_cargo_container' } }),
    fit: 'payload',
    entityRadius: 5,
    colliderKind: 'ball',
    solid: true,
  });

  // packagedPropSpec's scenario/inline resolutions (visualOverrides.js): spawned props no
  // other loop enumerates — without a row the pending stamp falls back to octahedron
  // proportions and under-claims the committed silhouette.
  add({
    id: 'pod_47a_evidence_spindle',
    family: 'pod',
    file: 'pods/pod_47a_evidence_spindle.glb',
    fit: 'payload',
    entityRadius: 5,
    colliderKind: 'ball',
    solid: true,
  });
  add({
    id: 'place_47a_rescue_capsule',
    family: placeFamily('place_47a_rescue_capsule'),
    file: 'places/place_47a_rescue_capsule.glb',
    fit: 'place-scale',
    placeScale: 1,
    entityRadius: 12,
    colliderKind: 'none',
    solid: true,
  });

  for (const typeId of ['ast_common_rock', 'ast_metallic', 'ast_icy', 'ast_crystalline', 'ast_gas_cloud', 'ast_rare_exotic']) {
    add({
      id: typeId,
      family: 'rock',
      file: null,
      fit: 'asteroid',
      entityRadius: 12,
      colliderKind: 'ball',
      solid: true,
      opening: typeId === 'ast_gas_cloud' ? 'gas-soft' : null,
    });
  }

  return Object.freeze(rows);
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

/**
 * Packaged bodies that materialize mid-flight in ordinary sectors without an entity plan
 * entry — kill aftermath wrecks, deployed drones, scripted payload drops, the breakaway
 * spindle. The crucible roster warm already decodes this set menu-side; a close-range kill
 * on a cold sector otherwise mounts the wreck root pending and pops seconds later.
 * Slots mirror packagedDecodeFileForEntity / authoredPayloadSlotForEntity so the warmed
 * record is the same url::slot key the attach path resolves.
 */
export function spawnablePackagedBodyPrewarmFiles() {
  return Object.freeze({
    place: Object.freeze([
      ...PQ_193_05_WRECK_PACKAGED_FILES,
      PQ_193_05_DRONE_PACKAGED_FILE,
      PQ_193_05_GATE_PACKAGED_FILE,
      'places/place_47a_rescue_capsule.glb',
      'places/place_breakaway_sp07.glb',
    ]),
    pod: Object.freeze(['pods/pod_cargo_container.glb']),
  });
}

/** Spawnable combat/traffic presentation keys for sector asset prewarm (not only live entities). */
export function spawnableShipArchetypePrewarmUrls() {
  return Object.freeze([
    ...Object.values(WHOLE_SHIP_FILE_BY_HOSTILE_ID),
    ...Object.values(WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE),
    ...Object.values(SPAN_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
    ...Object.values(WASP_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
    ...Object.values(RIG_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
    ...Object.values(CRADLE_FACTION_KIT_BY_FACTION).map((kit) => kit.file),
    WHOLE_SHIP_FILE_BY_DEF_ID.ship_wasp,
    // Separate-file LOD siblings load lazily on distance demotion — a far spawn's lod1/lod2
    // body is a different GLB with materials the lod0 exemplar never linked (PQ-210.00 wasp
    // link). Runtime demotion is off, so the lod1 file has no live consumer (admission builds
    // lod0, stand-ins borrow lod2): warm lod2 only and skip decode bytes nobody can draw.
    ...Object.values(WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID)
      .flatMap((family) => (WHOLE_SHIP_LOD_RUNTIME_DEMOTION === true
        ? [family.lod1, family.lod2]
        : [family.lod2]).filter(Boolean)),
    // File-keyed families (massline express liner) have no def-id row — a far spawn's
    // demotion still needs the sibling GLBs resident, so list them explicitly.
    ...Object.values(WHOLE_SHIP_LOD_FAMILY_BY_FILE)
      .flatMap((family) => (WHOLE_SHIP_LOD_RUNTIME_DEMOTION === true
        ? [family.lod1, family.lod2]
        : [family.lod2]).filter(Boolean)),
  ]);
}

function normalizePartUrl(url) {
  return String(url || '').replace(/\\/g, '/').split(/[?#]/, 1)[0];
}

function wholeShipFileForResolution(entity, selection, options = {}) {
  if (options.forceWholeShipFile) return options.forceWholeShipFile;
  if (options.lodLevel) return wholeShipLodFileForEntity(entity, options.lodLevel, options);
  return selection && selection.file || null;
}

/** Pure contract hook used by runtime composition and missing/corrupt fixture checks. */
export function resolveRequiredWholeShipRecord(entity, records, options = {}) {
  const selection = wholeShipVisualForEntity(entity, options);
  if (!selection) {
    if (options.requiredWholeShip === true || requiresProductionWholeShipForEntity(entity)) {
      throw new Error(`Ship ${entity && entity.id} has no required packaged whole-ship selection.`);
    }
    return null;
  }
  const wholeShipFile = wholeShipFileForResolution(entity, selection, options);
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  // Forced LOD siblings may not share the LOD0 assetId; match on file path only then.
  const expectedAssetId = options.forceWholeShipFile ? null : selection.assetId;
  const record = (records || []).find((candidate) => (
    normalizePartUrl(candidate && candidate.url).endsWith(wholeShipFile)
      && (!expectedAssetId || candidate.assetId === expectedAssetId)
  ));
  if (!record) throw new Error(requiredWholeShipMessage(entity, wholeShipFile, records, partRoot));
  return record;
}

/**
 * The resident whole-ship record an admission stand-in may borrow — a synchronous lookup, never a
 * load. A warm-decoded lod0 record wins (the real hull shape behind the stand-in); otherwise
 * split-file hulls keep the low-detail body in the `_lod2` sibling GLB and single-file bodies
 * carry it as `tags.lod === 'lod2'` primitives on the lod0 record. Returns null when nothing is
 * resident; the caller falls back to the abstract resolving marker and counts the miss.
 */
export function residentWholeShipStandInRecord(entity, options = {}) {
  const selection = wholeShipVisualForEntity(entity, options);
  if (!selection) return null;
  const lod2File = wholeShipLodFileForEntity(entity, 'lod2', options);
  const baseFile = wholeShipFileForResolution(entity, selection, options);
  // Prefer the real (lod0) record when it is already resident: the warm decode leaves the true
  // hull shape available for the stand-in, and the commit swap becomes a zero-diff swap. The
  // lod2 sibling stays the fallback — it is the guaranteed-resident catalog tier.
  const candidates = lod2File && lod2File !== baseFile ? [baseFile, lod2File] : [baseFile];
  const seen = new Set();
  // Scan every resolved library the renderer holds: the entity plan lands in the canonical map,
  // while a split-file `_lod2` sibling decoded for a LOD demotion lives under the
  // 'whole-ship-lod-family' scope.
  const resolved = options.renderer && resolvedLibraryByRenderer.get(options.renderer);
  for (const file of candidates) {
    if (!file || seen.has(file)) continue;
    seen.add(file);
    if (resolved instanceof Map) {
      for (const library of resolved.values()) {
        if (!(library instanceof Map)) continue;
        for (const records of library.values()) {
          const record = (records || []).find(
            (candidate) => recordUrlEndsWith(candidate, file, options.renderer));
          if (record) return record;
        }
      }
    }
  }
  // Sector prewarm decodes spawnable hulls straight into the runtime's asset cache long before
  // their owners' admission jobs run — that settled decode is resident too.
  const decoded = peekSettledAuthoredRecords(options.renderer);
  for (const file of candidates) {
    if (!file) continue;
    const record = decoded.find((candidate) => (
      recordIsResident(candidate, options.renderer)
        && typeof candidate.url === 'string'
        && normalizePartUrl(candidate.url).endsWith(file)
    ));
    if (record) return record;
  }
  return null;
}

/**
 * Generic-file twin of residentWholeShipStandInRecord: non-ship pending families (stations,
 * place roots, cargo capsules, packaged props) know their authored file at wrap time but have no
 * catalog selection to route through. Same two residency sources — the renderer's resolved
 * libraries first, then the settled decode cache — and the same promise: a synchronous lookup,
 * never a load. Returns null when nothing is resident; the caller keeps the abstract marker.
 */
export function residentAuthoredRecordForFile(file, options = {}) {
  if (typeof file !== 'string' || !file) return null;
  const resolved = options.renderer && resolvedLibraryByRenderer.get(options.renderer);
  if (resolved instanceof Map) {
    for (const library of resolved.values()) {
      if (!(library instanceof Map)) continue;
      for (const records of library.values()) {
        const record = (records || []).find(
          (candidate) => recordUrlEndsWith(candidate, file, options.renderer));
        if (record) return record;
      }
    }
  }
  const decoded = peekSettledAuthoredRecords(options.renderer);
  return decoded.find((candidate) => (
    recordIsResident(candidate, options.renderer)
      && typeof candidate.url === 'string'
      && normalizePartUrl(candidate.url).endsWith(file)
  )) || null;
}

/**
 * Statuses a still-mounted boundary may recover from. The prior admission was aborted by its
 * owner's lifecycle — entity torn down under a kept-GPU recook, a queued job cancelled, an
 * orphaned swap — which says nothing about the content. Terminal content verdicts
 * ('unavailable', 'fallback-after-error', 'procedural-settled', same-semantic fallbacks) stay
 * out: re-requesting those would spin the queue on a real failure.
 */
const READMISSION_STATUSES = new Set([
  'missing',
  'awaiting-authored-admission',
  'cancelled-before-load',
  'orphaned-before-swap',
  'orphaned-after-pipeline-compile',
]);

export function authoredReadmissionStatus(status) {
  return READMISSION_STATUSES.has(status == null ? 'missing' : status);
}

// Statuses enqueueBoundaryUpgrade returns synchronously before a job exists. A refusal leaves
// the boundary stamped 'loading' with a settled promise — 'loading' is outside
// READMISSION_STATUSES, so every later request would short-circuit on the dead promise forever
// and the boundary renders its stand-in for the rest of its mounted life. Every wrap restores
// on the full set so the ordinary re-request paths (approach trigger, post-run sector return,
// markAuthoredBoundaryForReadmission) can try again.
const PRE_JOB_REFUSAL_STATUSES = new Set([
  'invalid-upgrade-request',
  'cancelled-before-queue',
  'deferred-arena-dressing',
  'regrade-evict-cooloff',
]);

// Non-counting refusals persist while their class is live (a detached boundary, a survival
// defer, a malformed request): a synchronously re-armed on-glass trigger reposts every
// rendered frame for the whole window — a 60 Hz ping-pong of guaranteed-refused enqueues.
// Counting refusals already pace themselves through the repost cap, so only they re-arm
// immediately; the rest poll again at this interval while their class may have cleared
// (re-mount, run end) without a repost per frame.
const REFUSAL_TRIGGER_REARM_DELAY_MS = 1000;
// Paced classes are the on-glass ones — an armed trigger reposts every rendered frame,
// and these refusals can re-occur while their class is live, so the pace breaks a 60 Hz
// ping-pong of guaranteed-refused enqueues. 'cancelled-before-queue' arms immediately:
// its boundary is detached, so the trigger provably cannot fire until a fresh mount —
// delaying the arm just postpones a legit re-mount repost up to the delay.
const REFUSAL_TRIGGER_PACED_STATUSES = new Set([
  'deferred-arena-dressing',
  'invalid-upgrade-request',
]);
function scheduleRefusalTriggerRearm(status, arm) {
  if (!REFUSAL_TRIGGER_PACED_STATUSES.has(status)) { arm(); return; }
  const dueAt = monotonicNow() + REFUSAL_TRIGGER_REARM_DELAY_MS;
  const doc = typeof document !== 'undefined' ? document : null;
  const onWake = () => {
    if (!doc || doc.visibilityState !== 'visible' || monotonicNow() < dueAt) return;
    doc.removeEventListener('visibilitychange', onWake);
    clearTimeout(timer);
    arm();
  };
  const timer = setTimeout(() => {
    if (doc) doc.removeEventListener('visibilitychange', onWake);
    arm();
  }, REFUSAL_TRIGGER_REARM_DELAY_MS);
  if (timer && typeof timer.unref === 'function') timer.unref();
  // A hidden tab throttles the 1s timeout into minutes — the defer outlives its class
  // entirely. Re-arm on the visibility return once the delay has elapsed instead.
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', onWake);
  }
}

function restoreBoundaryAfterPreJobRefusal(boundary, status) {
  delete boundary.userData.authoredUpgradePromise;
  if (boundary.userData.authoredAssetState === 'loading') {
    boundary.userData.authoredAssetState = 'awaiting-authored-admission';
  }
  if (status === 'regrade-evict-cooloff') {
    boundary.userData.regradeRestoreCount = (boundary.userData.regradeRestoreCount | 0) + 1;
    boundary.userData.regradeRestoreLastAt = monotonicNow();
  }
  boundary.userData.authoredReadmissionReason = status === 'cancelled-before-queue'
    ? 'cancelled-before-queue-detached'
    : status;
}

/**
 * The entity a kept boundary is currently bound to. `_bindPresentationMesh` stamps
 * `presentationEntityId` at every reattach, so after a save restore the boundary can resolve
 * its live owner instead of the object captured when the boundary was built — restore reuses
 * the mesh but replaces the entity record, and a stale capture would be born dead
 * (`entity.alive === false`) and abort every re-admission at its first owner check.
 */
export function boundaryLiveEntity(boundary, fallback) {
  const live = authoredRuntimeState();
  const id = boundary && boundary.userData && boundary.userData.presentationEntityId;
  const resolved = id != null && live && live.entities && typeof live.entities.get === 'function'
    ? live.entities.get(id)
    : null;
  return resolved && resolved.alive !== false ? resolved : fallback;
}

/** True when the admission's residency owner is gone — the entity record died mid-admission. */
/**
 * A run is stale for terminal-verdict purposes when a newer admission owns the boundary epoch
 * (re-admission while this run parked) or its own job was stall-aborted. A stale run's async
 * continuation cannot be cancelled, so it keeps reaching fail/settle legs that predate the
 * commit-point guards — its 'unavailable'/'same-semantic-fallback'/'procedural-settled' writes
 * and readmission marks would stomp the live run's committed state or delete its publisher.
 * Cleanup legs and epoch-scoped residency releases stay ungated; only verdict writes consult
 * this. Compares the epoch minted for this run, never re-mints.
 */
export function staleAuthoredRunVerdict(boundary, options = {}) {
  const data = boundary && boundary.userData;
  if (!data) return true;
  const minted = options && options.admissionEpoch;
  if (minted != null && data.admissionEpoch != null && data.admissionEpoch !== minted) return true;
  if (typeof (options && options.isAbortedStalledAdmission) === 'function'
      && options.isAbortedStalledAdmission()) return true;
  return false;
}

export function admissionOwnerInactive(options, entity, error = null) {
  const isActive = options && options.isResidencyOwnerActive;
  if (typeof isActive === 'function') {
    let active;
    try { active = isActive(); } catch { active = undefined; }
    if (active === false) return true;
  }
  if (entity && entity.alive === false) return true;
  // A "must be retained before creating [a flight] instance" throw is the owner-inactive race one
  // step later: the package can only lose its boundary-owner retain — and become sweepable — when
  // the admission's residency context ended between library load and instancing (same
  // classification the whole-ship LOD demotion catch already applies, ~6160).
  return !!(error && /owner became inactive|must be retained before creating/i.test(String(error.message || error)));
}

/**
 * Reset an owner-orphaned boundary to a requestable state. Only valid while the boundary is
 * still mounted: a kept-GPU recook leaves `boundary.parent` set while the restore swaps the
 * entity graph underneath the in-flight admission. Clearing the settled promise is required —
 * `requestAuthoredUpgrade` returns it verbatim and would never start the replacement job.
 */
export function markAuthoredBoundaryForReadmission(boundary, reason) {
  if (!boundary || !boundary.userData) return false;
  boundary.userData.authoredAssetState = 'awaiting-authored-admission';
  boundary.userData.authoredVisualRoot = 'none-pending-admission';
  boundary.userData.authoredReadmissionReason = reason || 'owner-inactive';
  delete boundary.userData.authoredUpgradePromise;
  // The orphaned job's publish hook survives its own settle — drop it too, or the abandoned
  // body's staged publish suppresses the replacement admission the re-request starts.
  delete boundary.userData.__publishPreparedAuthoredBoundary;
  // A lifecycle re-arm is a new admission episode: restore the retry budget the last one may
  // have spent, or a boundary that once exhausted its retries would strand 'unavailable' the
  // moment a post-restore admission failed. Only the poll's own re-arm keeps counting, so the
  // per-episode cap still bounds churn on a genuinely missing asset.
  if (reason !== 'transient-admission-retry') {
    delete boundary.userData.authoredAdmissionRetryCount;
    delete boundary.userData.authoredAdmissionNextRetryAt;
  }
  return true;
}

/**
 * Bounded retry for admission verdicts that published nothing drawable. A transient fetch or
 * decode failure otherwise blanks its owner for the whole session: the asset task is cached
 * resolved-null and 'unavailable'/'fallback-after-error' sit outside READMISSION_STATUSES by
 * design. Retry is bounded (attempt cap + exponential backoff) and only applies while the
 * boundary still shows nothing — statuses whose procedural body is on screen stay terminal so
 * a late re-admission never pops a second identity over a readable hull.
 */
export const AUTHORED_ADMISSION_RETRY_MAX = 4;
export const AUTHORED_ADMISSION_RETRY_BASE_DELAY_MS = 2500;

export function authoredAdmissionRetriableStatus(status) {
  return status === 'unavailable' || status === 'fallback-after-error';
}

export function retryFailedAuthoredAdmission(boundary, nowMs) {
  const data = boundary && boundary.userData;
  if (!data || !authoredAdmissionRetriableStatus(data.authoredAssetState)) return false;
  // A retained readable fallback is a real visual; only still-invisible roots retry.
  if (data.authoredReadableFallbackRetained === true) return false;
  const attempts = data.authoredAdmissionRetryCount || 0;
  if (attempts >= AUTHORED_ADMISSION_RETRY_MAX) return false;
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const nextAt = data.authoredAdmissionNextRetryAt;
  if (Number.isFinite(nextAt) && now < nextAt) return false;
  data.authoredAdmissionRetryCount = attempts + 1;
  data.authoredAdmissionNextRetryAt = now + AUTHORED_ADMISSION_RETRY_BASE_DELAY_MS * (2 ** attempts);
  return markAuthoredBoundaryForReadmission(boundary, 'transient-admission-retry');
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
  // The procedural hull stays drawn for the whole admission window (wrap → commit), same
  // contract as the place wrap: hiding it left only the abstract marker on the glass — "a
  // ship will be a box and then it'll be a ship". The fallback's programs are already
  // linked (it was the visible ship an instant ago) so drawing it submits no new work.
  // The commit swaps the fallback out and the fail path already re-shows it.
  let fallbackHasBody = false;
  fallbackRoot.traverse((object) => { if (object && object.isMesh) fallbackHasBody = true; });
  // requiredWholeShip is authored-or-nothing by contract: a procedural stand-in would publish
  // a non-authored identity for a body the rung declared must be authored-only (fail closed).
  const fallbackHidden = options.requiredWholeShip === true
    || requiresProductionWholeShipForEntity(entity);
  fallbackRoot.visible = fallbackHidden ? false : fallbackHasBody;
  if (fallbackRoot.visible) boundary.userData.authoredPendingFallbackDrawn = true;
  boundary.add(fallbackRoot);
  // A substrate carrying a resolving marker keeps exactly one drawable while admission is
  // pending — the marker is abstract by design, so this never publishes a substitute identity.
  // The per-frame visibility pass hides the marker again the moment the state is terminal.
  if (fallbackRoot.userData && fallbackRoot.userData.authoredResolvingMarker === true) {
    fallbackRoot.visible = true;
  }

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
  // ANI-00: authored rigid-part motion follows the same forwarding grammar as damage/LOD —
  // the renderer calls this on the boundary; the live authored root owns the controller set.
  boundary.userData.updateAuthoredMotion = (liveEntity, simNow, a11y) => {
    const fn = active && active.userData && active.userData.updateAuthoredMotion;
    if (typeof fn === 'function') fn(liveEntity, simNow, a11y);
  };
  syncActiveSurface(boundary, active);

  let trigger = firstRenderable(fallbackRoot);
  let previousBeforeRender = trigger && trigger.onBeforeRender;
  let armed = true;
  function authoredAssetTrigger(renderer, scene, ...rest) {
    if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
    if (!shouldAutoTriggerAuthoredUpgrade(entity, scene)) return;
    // onBeforeRender only fires with the fallback root inside the presented frustum — the most
    // in-frame a pending boundary can be — so the upgrade posts at the visible decode class.
    startAuthoredUpgrade(renderer, scene, { admissionVisible: true });
  }
  const startAuthoredUpgrade = (renderer, scene, requestOptions = {}) => {
    const state = boundary.userData.authoredAssetState;
    const existing = boundary.userData.authoredUpgradePromise;
    // A settled promise from a lifecycle-aborted admission must not gate re-admission; only an
    // in-flight or completed request is honoured.
    if (existing && !authoredReadmissionStatus(state)) {
      if (requestOptions && requestOptions.admissionVisible === true) {
        regradeJoinedJobAdmissionVisible(
          upgradeQueueState(scene).byBoundary.get(boundary), { options: requestOptions });
      }
      return existing;
    }
    if (existing) delete boundary.userData.authoredUpgradePromise;
    if (!armed) {
      // One-shot disarm spent on an aborted admission re-arms for a still-mounted boundary.
      if (!authoredReadmissionStatus(state)) return null;
      armed = true;
    }
    if (!renderer || !scene) return;
    if (!boundaryBelongsToScene(boundary, scene)) {
      return Promise.resolve({ status: 'cancelled-before-queue' });
    }
    armed = false;
    if (trigger) trigger.onBeforeRender = previousBeforeRender;
    const liveEntity = boundaryLiveEntity(boundary, entity);
    const upgradeOptions = {
      releaseMode,
      requiredWholeShip: options.requiredWholeShip === true
        || requiresProductionWholeShipForEntity(liveEntity),
      onSwap: options.onSwap,
      loadAuthoredPart: options.loadAuthoredPart,
      libraryScope: options.libraryScope,
      bootstrapPlan: options.bootstrapPlan,
      ...residencyOptionsForBoundary(liveEntity, boundary, renderer),
      ...requestOptions,
    };
    boundary.userData.authoredAssetState = 'loading';
    boundary.userData.authoredUpgradeRequestedAt = Date.now();
    const completion = Promise.resolve(enqueueBoundaryUpgrade(scene, {
      // Two exemplar boundaries built from one spec share entity.id — without an explicit key the
      // second dedupes into the first's completion and its own compose never runs (the parked
      // 'loading' boundary that hung the opening cohort wait and left roster pool chunks cold).
      key: typeof requestOptions.upgradeJobKey === 'string' ? requestOptions.upgradeJobKey : undefined,
      boundary,
      // The interior root a commit should remove is whatever is live at request time — the
      // original procedural fallback on first admission, the previous authored/LOD root on a
      // readmission. Capturing the param `fallbackRoot` here kept the detached substrate tree
      // pinned by this boundary's requestAuthoredUpgrade closure for the boundary's whole life.
      fallbackRoot: active,
      entity: liveEntity,
      renderer,
      scene,
      options: upgradeOptions,
      setActive: (next) => {
        active = next;
        syncActiveSurface(boundary, active);
        if (next !== fallbackRoot) {
          // Commit detached the procedural substrate — drop the references that would otherwise
          // keep that island reachable through the retained request/update/LOD closures, and let
          // `fallbackRoot` track the live interior root a later commit should remove.
          trigger = null;
          previousBeforeRender = null;
          fallbackRoot = next;
        }
      },
    })).then((result) => {
      // Any pre-job refusal is the same armed-but-refused outcome the cancel path
      // restores: enqueue declined before a job existed, leaving 'loading' + a settled
      // promise that would pin every future request at the existing short-circuit.
      // Restore the armed state so the approach trigger and the post-run sector return
      // re-request it.
      if (result && PRE_JOB_REFUSAL_STATUSES.has(result.status)) {
        restoreBoundaryAfterPreJobRefusal(boundary, result.status);
        armed = true;
        if (trigger) scheduleRefusalTriggerRearm(result.status, () => {
          if (trigger) trigger.onBeforeRender = authoredAssetTrigger;
        });
      }
      return result;
    });
    boundary.userData.authoredUpgradePromise = completion;
    return completion;
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;
  if (trigger) trigger.onBeforeRender = authoredAssetTrigger;

  return boundary;
}

export function buildAuthoredPlaceProp(entity, options = {}) {
  const placeFile = placeFileForEntity(entity);
  if (!placeFile) {
    const data = entity && entity.data || {};
    // Procedural-only place families have no registered GLB by design; the fallback
    // builder owns their geometry, so return it directly instead of an empty admit.
    const pid = String(data.placeId || '');
    if (pid.startsWith('alien_growth_') || pid.startsWith('machine_')) {
      return buildFallbackPlaceProp(entity);
    }
    return null;
  }
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
  boundary.userData.authoredPayloadAssetId = entity.data.authoredPayloadAssetId;
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
  // Same resolving-marker contract as pending ships and stations: an exact-identity payload
  // keeps the abstract affordance on the glass while admission runs instead of popping in.
  // Arm the committed-fit basis so a pending silhouette draws at the size it will commit:
  // the spindle mounts 1:1 (authored draw scale), capsule/pod fit their longest axis to
  // 2*targetRadius — matching authoredPayloadDrawScale exactly.
  const markerOptions = { standInFile: authoredPayloadFileForEntity(entity) };
  if (authoredPayloadIsSpindle(entity)) {
    // The spindle commits 1:1 in WU, so its drawn extents ARE the authored bounds — arm
    // the fit basis at the authored envelope (the census row is static data) instead of
    // falling through to the unarmed 3.4r marker, which drew ~3.5x oversized.
    const sp07Row = modelTruthRow(entity && entity.data && entity.data.authoredPayloadAssetId);
    const sp07Size = sp07Row && sp07Row.bounds && sp07Row.bounds.size;
    markerOptions.standInFitLength = (sp07Size && Number.isFinite(Number(sp07Size[0])))
      ? Math.max(Number(sp07Size[0]), Number(sp07Size[1]) || 0, Number(sp07Size[2]) || 0)
      : 2 * Math.max(1, Number(entity && entity.radius) || 3);
  } else {
    markerOptions.standInFitLength = 2 * Math.max(1, Number(entity && entity.radius) || 3);
  }
  // The payload commit recenters the record bounds-center onto origin on all three axes —
  // the stand-in previews the same committed frame or the capsule's silhouette teleports.
  markerOptions.standInRecenter = 'xyz';
  installBoundaryResolvingMarker(boundary, entity, markerOptions);

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
    const state = boundary.userData.authoredAssetState;
    const existing = boundary.userData.authoredUpgradePromise;
    if (existing && !authoredReadmissionStatus(state)) {
      if (requestOptions && requestOptions.admissionVisible === true) {
        regradeJoinedJobAdmissionVisible(
          upgradeQueueState(scene).byBoundary.get(boundary), { options: requestOptions });
      }
      return existing;
    }
    if (existing) delete boundary.userData.authoredUpgradePromise;
    if (!renderer || !scene || authoredAdmissionStarted(state)) return false;
    const liveEntity = boundaryLiveEntity(boundary, entity);
    boundary.userData.authoredAssetState = 'loading';
    const residency = residencyOptionsForBoundary(liveEntity, boundary, renderer);
    const upgradeOptions = {
      releaseMode,
      loadAuthoredPart: options.loadAuthoredPart,
      onSwap: options.onSwap,
      ...residency,
      ...requestOptions,
    };
    const partRoot = releaseMode ? PART_RELEASE_ROOT : PART_ROOT;
    const completion = Promise.resolve(enqueueBoundaryUpgrade(scene, {
      key: `payload:${entity.data.payloadStableId || entity.id}`,
      boundary,
      entity: liveEntity,
      renderer,
      scene,
      assetUrls: [`${partRoot}${authoredPayloadFileForEntity(entity)}`],
      options: upgradeOptions,
      run: ({ options: admittedOptions }) => upgradeAuthoredCargoCapsuleBoundary(
        boundary,
        // Whatever interior root is live at request time is the one a commit removes — not the
        // original param, which would pin the detached substrate via this closure.
        activeRoot,
        liveEntity,
        renderer,
        scene,
        admittedOptions,
        setActiveRoot,
      ),
    })).then((result) => {
      // A pre-job refusal left 'loading' + a settled promise — restore so the boundary can be
      // re-requested instead of pinning its stand-in for the rest of its mounted life.
      if (result && PRE_JOB_REFUSAL_STATUSES.has(result.status)) {
        restoreBoundaryAfterPreJobRefusal(boundary, result.status);
      }
      return result;
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
    record = await waitForAuthoredAdmission(loadPart(`${partRoot}${authoredPayloadFileForEntity(entity)}`, {
      renderer,
      slot: authoredPayloadSlotForEntity(entity),
      optional: true,
      admissionDeadline: true,
      admissionVisible: options.admissionVisible,
      residencyOwner: options.residencyOwner,
      residencyRole: options.residencyRole,
      sectorId: options.sectorId,
      isResidencyOwnerActive: options.isResidencyOwnerActive,
      signal: options.signal,
    }), options);
    assertQueuedAuthoredAdmissionActive(options, 'after-payload-load');
  } catch (error) {
    assertQueuedAuthoredAdmissionActive(options, 'after-payload-load-error');
    return failAuthoredCargoCapsuleAdmission(
      boundary,
      fallbackRoot,
      entity,
      renderer,
      'load-threw',
      error,
      options,
    );
  }
  if (!record) {
    return failAuthoredCargoCapsuleAdmission(
      boundary,
      fallbackRoot,
      entity,
      renderer,
      'load-unavailable',
      null,
      options,
    );
  }
  if (!boundary.parent) {
    releaseBoundaryResidency(renderer, boundary, 'payload-orphaned-before-swap', options.admissionEpoch);
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
      options,
    );
  }
  registerPreparedAuthoredAdmission(scene, boundary, authored);
  let authoredDisposed = false;
  const disposePreparedCargoCapsule = () => {
    if (authoredDisposed) return false;
    try {
      disposeDetachedAuthoredCargoCapsule(authored.root);
      authoredDisposed = true;
    } finally {
      // A disposal throw must not strand the registry entry — it pins the boundary and the
      // whole prepared tree as a strong key/value in sceneState.preparedAuthoredRoots.
      unregisterPreparedAuthoredAdmission(authored);
    }
    return true;
  };
  const installedPreparedDisposer = options.deferBoundaryPublication === true
    ? installPreparedBoundaryDisposer(boundary, disposePreparedCargoCapsule)
    : null;
  boundary.userData.authoredAssetState = 'compiling-pipelines';
  try {
    await prepareAuthoredVisualPipelines(authored.root, options);
  } catch (error) {
    await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedCargoCapsule()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
    assertQueuedAuthoredAdmissionActive(options, 'after-payload-pipeline-error');
    return failAuthoredCargoCapsuleAdmission(
      boundary,
      fallbackRoot,
      entity,
      renderer,
      'pipeline-compile-failed',
      error,
      options,
    );
  }
  if (!boundary.parent) {
    await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedCargoCapsule()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
    releaseBoundaryResidency(renderer, boundary, 'payload-orphaned-after-pipeline-compile', options.admissionEpoch);
    boundary.userData.authoredAssetState = 'orphaned-after-pipeline-compile';
    return false;
  }
  try {
    const publicationWait = waitForOpeningGraphPublicationRelease(options);
    if (publicationWait) {
      boundary.userData.authoredPreparePhase = 'awaiting-publication';
      await waitForAuthoredAdmission(publicationWait, options);
    }
    assertQueuedAuthoredAdmissionActive(options, 'before-payload-publication');
  } catch (error) {
    await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedCargoCapsule()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
    throw error;
  }
  if (!boundary.parent) {
    await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedCargoCapsule()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
    releaseBoundaryResidency(renderer, boundary, 'payload-orphaned-before-publication', options.admissionEpoch);
    boundary.userData.authoredAssetState = 'orphaned-before-swap';
    return false;
  }
  // A stale run must not commit — the boundary re-admitted under a newer epoch while this
  // run parked (stall-abort readmission), the job was stall-aborted, or its owner died.
  // cancelQueuedJob/releaseBoundaryResidency are bookkeeping-only: this async run keeps
  // executing, and without the epoch check its commit would mount a second authored root
  // over the replacement's. The live epoch's commit owns the boundary; this run disposes
  // only what it prepared. Mirrors the ship guard in commitAuthoredBoundary.
  if ((options.admissionEpoch != null && boundary.userData.admissionEpoch != null
        && boundary.userData.admissionEpoch !== options.admissionEpoch)
      || (typeof options.isAbortedStalledAdmission === 'function' && options.isAbortedStalledAdmission())
      || (entity && entity.alive === false)) {
    await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedCargoCapsule()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
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
  options = null,
) {
  const admissionEpoch = options && options.admissionEpoch;
  // A stale run's failure is bookkeeping-only: the epoch-scoped release frees its own pins,
  // but no verdict write — a readmission mark would delete the live run's publisher, and an
  // 'unavailable'/visualRoot stamp would overwrite its committed state.
  if (staleAuthoredRunVerdict(boundary, options || {})) {
    releaseBoundaryResidency(renderer, boundary, `payload-${reason}`, admissionEpoch);
    return false;
  }
  // Owner-inactive readmission must be decided before the residency release: releasing a
  // still-mounted boundary marks it a dead owner forever and strands the re-admitted job.
  if (boundary.parent && admissionOwnerInactive(null, entity, error)) {
    markAuthoredBoundaryForReadmission(boundary, `payload-${reason}`);
    return false;
  }
  releaseBoundaryResidency(renderer, boundary, `payload-${reason}`, admissionEpoch);
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
  detachBoundaryResolvingMarker(boundary);
  boundary.remove(fallbackRoot);
  boundary.add(authored.root);
  unregisterPreparedAuthoredAdmission(authored);
  setActiveRoot(authored.root);
  carryAdmittedOnceStamp(authored.root, boundary);
  releaseDetachedCargoCapsuleSubstrate(fallbackRoot);
  boundary.userData.authoredVisualRoot = 'authored-root';
  boundary.userData.authoredParts = authored.authoredParts;
  boundary.userData.authoredSlots = authored.authoredSlots;
  boundary.userData.assetId = authored.root.userData.assetId;
  boundary.userData.renderContract = authored.root.userData.renderContract;
  boundary.userData.__socketCache = new Map();
  delete boundary.userData.requestAuthoredUpgrade;
  delete boundary.userData.__setActiveVisualRoot;
  // The resolving marker's envelope stamp only covers the marker's own drawn reach — copy the
  // authored capsule's measured bounds (place-commit precedent) or drop the stamp entirely so
  // cull grading no longer classifies the committed body at the marker envelope.
  if (authored.root.userData && authored.root.userData.visualBounds) {
    const measured = authored.root.userData.visualBounds;
    boundary.userData.visualBounds = { center: measured.center.slice(), size: measured.size.slice() };
  } else {
    delete boundary.userData.visualBounds;
  }
  const publish = () => {
    // Same residual-link guard as the ship commit: the exact-target prepare ran while this
    // root was detached, so pay any leftover variant here rather than in a presented pass.
    if (typeof options.touchAuthoredExactTarget === 'function') {
      try { options.touchAuthoredExactTarget(authored.root); }
      catch (error) { console.warn('[partsLibrary] cargo publish touch failed', error); }
    }
    boundary.userData.authoredAssetState = 'authored';
    if (typeof options.onSwap === 'function') {
      try { options.onSwap({ boundary, root: authored.root, authoredRoot: authored.root, entity, authoredParts: authored.authoredParts }); }
      catch (error) { console.warn('[partsLibrary] cargo swap observer failed', error); }
    }
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
  // The authored-motion driver registers controllers under the entity id; a parked/admission-
  // failed tree must release them the same way the boundary teardown path does.
  if (typeof root.userData?.detachAuthoredMotion === 'function') root.userData.detachAuthoredMotion();
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
  // PQ-195.00: the spindle is authored 1:1 in WU to fill its own 16 WU body (draw-time
  // circumradius 15.02 WU, pinned by test/pq195-00-spindle-fork). The capsule's longest-axis fit
  // would scale it 32/27.8 = 1.15x and break that number at draw time; the capsule keeps the fit.
  const scale = authoredPayloadDrawScale(entity, targetRadius, authoredEnvelope);
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
  // Payload bodies that carry a sealed motion bank (e.g. the rigged cargo pod) get the
  // same per-frame/per-event driver as ships, so mining events reach their bound pivots.
  attachAuthoredMotionDriver(root, entity, bindings.authoredMotions);

  const center = Array.isArray(record.bounds?.center) ? record.bounds.center : [0, 0, 0];
  root.position.set(
    -(Number(center[0]) || 0) * scale,
    -(Number(center[1]) || 0) * scale,
    -(Number(center[2]) || 0) * scale,
  );
  root.userData.authoredWorldScale = scale;
  root.userData.collisionEnvelopeRadius = targetRadius;
  root.userData.visualBounds = {
    // Committed frame: the recenter above lands authored bounds-center at origin — stamping
    // the authored center would mis-describe the drawn body to every cull/stamp consumer.
    center: [0, 0, 0],
    size: boundsSize.map((value) => (Number(value) || 0) * scale),
  };
  // PQ-195.00: the slot follows the entity's authored body — `place` for the spindle, `pod`
  // for the capsule — so slot-keyed consumers (loader cache, authoredSlots audits) see one truth.
  const authoredSlot = authoredPayloadSlotForEntity(entity);
  const authoredSlotMap = { [authoredSlot]: [record.url] };
  root.userData.renderContract = {
    version: 1,
    coordinateSystem: '+X forward, +Y up, +Z starboard; authored payload centered on physics origin',
    authoredParts: [record.url],
    authoredSlots: authoredSlotMap,
    collisionEnvelope: authoredPayloadIsSpindle(entity)
      ? 'authored 1:1 in WU; spindle circumradius fills the 16 WU body'
      : 'longest authored axis equals payload diameter',
    gracefulFallback: false,
  };
  return {
    root,
    authoredParts: [record.url],
    authoredSlots: authoredSlotMap,
  };
}

export function buildAuthoredStationArchetype(entity, options = {}) {
  if (!entity || entity.type !== 'station') return null;
  const placeFile = placeFileForEntity(entity);
  if (!placeFile) {
    // PQ-193.12: fail closed. A station with no resolvable authored archetype publishes nothing —
    // the procedural fat-cylinder-plus-hoops body is a defect, not a style, and must never reach
    // the glass as a silent substitute for a designed station.
    const data = entity.data || {};
    throw new Error(
      `[partsLibrary] station ${data.stationId || entity.id || 'unknown'} has no resolvable`
      + ` authored archetype (archetypeGlb=${data.archetypeGlb || 'none'},`
      + ` stationTypeId=${data.stationTypeId || 'none'}); procedural station fallback retired`,
    );
  }
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
  const raw = declaredPlaceTargetRadius(entity);
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
  // Graceful-fallback stations are still player-visible when an archetype GLB fails to load.
  // Keep them in the global Lacquer & Starlight light language instead of flat physical shading.
  installIllustratedSurface(material);
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
  boundary.userData.placeTargetRadius = Number.isFinite(declaredPlaceTargetRadius(entity))
    ? declaredPlaceTargetRadius(entity)
    : null;
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
  stampPendingPlaceVisualBounds(boundary, entity, placeFile);
  // Authored-or-nothing stations must never show the procedural body, but an invisible seat
  // pops in at commit whenever admission outlasts the runway — the same abstract marker
  // contract pending ships get (no substitute identity; the per-frame sync drives it off
  // authoredAssetState). The commit recenters the authored bounds-center onto X,Z origin
  // (centerAuthoredPlaceRoot) and may yaw the approach channel — the stand-in previews the
  // same committed frame or the silhouette teleports at commit.
  installBoundaryResolvingMarker(boundary, entity, {
    standInFile: placeFile,
    standInRecenter: 'xz',
    standInYawDeg: authoredApproachYawDegFor(entity, boundary.userData.placeId || placeFileStem(placeFile)),
  });

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
  boundary.userData.updateAuthoredMotion = (liveEntity, simNow, a11y) => {
    const fn = activeRoot?.userData?.updateAuthoredMotion;
    if (typeof fn === 'function') fn(liveEntity, simNow, a11y);
  };
  const trigger = firstRenderable(fallbackRoot);
  let armed = true;
  const previousBeforeRender = trigger && trigger.onBeforeRender;
  function authoredStationTrigger(renderer, scene, ...rest) {
    if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
    if (!armed) return;
    if (!shouldAutoTriggerAuthoredUpgrade(options.liveEntity || entity, scene)) return;
    armed = false;
    trigger.onBeforeRender = previousBeforeRender;
    // onBeforeRender only fires with the fallback root inside the presented frustum — the most
    // in-frame a pending boundary can be — so the upgrade posts at the visible decode class.
    startAuthoredUpgrade(renderer, scene, { admissionVisible: true });
  }
  const startAuthoredUpgrade = (renderer, scene, requestOptions = {}) => {
    const state = boundary.userData.authoredAssetState;
    const existing = boundary.userData.authoredUpgradePromise;
    if (existing && !authoredReadmissionStatus(state)) {
      if (requestOptions && requestOptions.admissionVisible === true) {
        regradeJoinedJobAdmissionVisible(
          upgradeQueueState(scene).byBoundary.get(boundary), { options: requestOptions });
      }
      return existing;
    }
    if (existing) delete boundary.userData.authoredUpgradePromise;
    if (!renderer || !scene || authoredAdmissionStarted(state)) return null;
    const liveEntity = boundaryLiveEntity(boundary, options.liveEntity || entity);
    boundary.userData.authoredAssetState = 'loading';
    const residency = residencyOptionsForBoundary(liveEntity, boundary, renderer);
    const upgradeOptions = {
      releaseMode,
      loadAuthoredPart: options.loadAuthoredPart,
      admissionEntity: liveEntity,
      onSwap: options.onSwap,
      ...residency,
      ...requestOptions,
    };
    const completion = Promise.resolve(enqueueBoundaryUpgrade(scene, {
      boundary,
      entity: liveEntity,
      run: ({ options: admittedOptions }) => upgradePlaceBoundary(
        // Whatever interior root is live at request time is the one a commit removes — not the
        // original param, which would pin the detached substrate via this closure.
        boundary, activeRoot, liveEntity, placeFile, renderer, scene, admittedOptions, setActiveVisualRoot,
      ),
      renderer,
      options: upgradeOptions,
    })).then((result) => {
      // A pre-job refusal left 'loading' + a settled promise — restore + re-arm the on-glass
      // trigger so the boundary can be re-requested instead of pinning its stand-in.
      if (result && PRE_JOB_REFUSAL_STATUSES.has(result.status)) {
        restoreBoundaryAfterPreJobRefusal(boundary, result.status);
        armed = true;
        if (trigger) scheduleRefusalTriggerRearm(result.status, () => {
          if (trigger) trigger.onBeforeRender = authoredStationTrigger;
        });
      }
      return result;
    });
    boundary.userData.authoredUpgradePromise = completion;
    return completion;
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;

  if (trigger) {
    trigger.onBeforeRender = authoredStationTrigger;
  }

  const stationed = attachStationHlod(boundary, entity);
  // PQ-193.12: the boundary's only child at wrap time is the hidden diagnostic substrate, so a
  // static-batch pass here could only ever merge invisible placeholder meshes. That merge
  // fabricated a fresh non-shared BufferGeometry out of shared station primitives — geometry the
  // authored-commit cleanup then disposed, corrupting the shared fallback set every other station
  // still relies on for failure controls. The authored GLB root batches itself inside
  // buildPlacePropRoot when it arrives; the hidden substrate keeps its shared primitives intact.
  freezeStaticChildMatrices(stationed);
  // The boundary root's own pose arrives only via mount/seat/snapshot writers, which recompose
  // it through the matrixAutoUpdate === false dirty hook (PERF-59).
  freezeStaticTransformRoot(stationed);
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
  // A same-envelope procedural body must stay drawn for the whole admission window
  // (wrap → commit): hiding it produced a guaranteed pop-in — nothing drew while the
  // job queued, decoded, composed, and compiled. That holds for geology skins AND for
  // fx dressing bodies (claim outposts, site relays, POI props), whose procedural body
  // is the same silhouette the entity drew before admission. The commit swaps the
  // fallback out and the fail path already re-shows it. Place props whose temporary is
  // an empty substrate keep it hidden — PIC-11 publishes no placeholder geometry for a
  // missing world-place prop, and an empty root is no stand-in anyway.
  let fallbackHasBody = false;
  fallbackRoot.traverse((object) => { if (object && object.isMesh) fallbackHasBody = true; });
  fallbackRoot.visible = geologySkin ? true : fallbackHasBody;
  if (fallbackHasBody || geologySkin) boundary.userData.authoredPendingFallbackDrawn = true;
  boundary.add(fallbackRoot);
  Object.assign(boundary.userData, fallbackRoot.userData || {});
  // The matching procedural geology body stays local to the boundary as the visible stand-in
  // during admission and the emergency fallback afterwards. Never expose its common-rock leaf
  // through the stable boundary: the renderer's asteroid InstancedMesh pool would otherwise
  // submit that leaf during admission and retain a detached ghost after the authored commit.
  // One representative authored rock per field deliberately keeps this fallback local so the
  // boundary has exactly one presentation authority at every lifecycle stage.
  if (geologySkin) delete boundary.userData.asteroidInstanceBody;
  boundary.userData.kind = 'place';
  boundary.userData.placeId = entity.data && entity.data.placeId || placeFile.replace(/^places\//, '').replace(/\.glb$/, '');
  // POI places carry declared authored draw size in data.placeTargetRadius — the compose draws
  // the envelope at ~2x it (resolvePlaceDrawScale's poi targetScale), so it is a tight upper
  // bound for the pending-bounds stamp, never overestimating like a census radius would.
  const poiTargetRadius = entity.data && entity.data.poi === true
    ? declaredPlaceTargetRadius(entity) : NaN;
  boundary.userData.placeTargetRadius = geologySkin ? entity.radius
    : (Number.isFinite(poiTargetRadius) && poiTargetRadius > 0 ? poiTargetRadius : null);
  boundary.userData.authoredGeologySkin = geologySkin;
  stampPendingPlaceVisualBounds(boundary, entity, placeFile);
  // An empty substrate is no stand-in: while the authored body queues/decodes/compiles the
  // boundary would draw nothing and pop in at commit. Arm the same resolving marker pending
  // ships, stations, and capsules carry — it unions into the pending stamp and detaches at
  // commitAuthoredPlaceBoundary.
  if (!fallbackHasBody && !geologySkin) {
    installBoundaryResolvingMarker(boundary, entity, {
      standInFile: placeFile,
      standInRecenter: 'xz',
      standInYawDeg: authoredApproachYawDegFor(entity, boundary.userData.placeId || placeFileStem(placeFile)),
    });
  }
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
  boundary.userData.updateAuthoredMotion = (liveEntity, simNow, a11y) => {
    const fn = activeRoot?.userData?.updateAuthoredMotion;
    if (typeof fn === 'function') fn(liveEntity, simNow, a11y);
  };
  boundary.userData.updateWorldSitePresentation = (liveEntity, simTime, a11y) => {
    const controller = activeRoot && activeRoot.userData && activeRoot.userData.worldSitePresentationController;
    if (controller && typeof controller.update === 'function') controller.update(liveEntity, simTime, a11y);
  };
  const trigger = firstRenderable(fallbackRoot);
  let armed = true;
  const previousBeforeRender = trigger && trigger.onBeforeRender;
  function authoredPlaceTrigger(renderer, scene, ...rest) {
    if (typeof previousBeforeRender === 'function') previousBeforeRender.call(this, renderer, scene, ...rest);
    if (!armed) return;
    if (!shouldAutoTriggerAuthoredUpgrade(entity, scene)) return;
    armed = false;
    trigger.onBeforeRender = previousBeforeRender;
    startAuthoredUpgrade(renderer, scene, { admissionVisible: true });
  }
  const startAuthoredUpgrade = (renderer, scene, requestOptions = {}) => {
    const state = boundary.userData.authoredAssetState;
    const existing = boundary.userData.authoredUpgradePromise;
    if (existing && !authoredReadmissionStatus(state)) {
      if (requestOptions && requestOptions.admissionVisible === true) {
        regradeJoinedJobAdmissionVisible(
          upgradeQueueState(scene).byBoundary.get(boundary), { options: requestOptions });
      }
      return existing;
    }
    if (existing) delete boundary.userData.authoredUpgradePromise;
    if (!renderer || !scene || authoredAdmissionStarted(state)) return null;
    const liveEntity = boundaryLiveEntity(boundary, entity);
    boundary.userData.authoredAssetState = 'loading';
    const upgradeOptions = {
      releaseMode,
      loadAuthoredPart: options.loadAuthoredPart,
      ...residencyOptionsForBoundary(liveEntity, boundary, renderer),
      ...requestOptions,
    };
    const completion = Promise.resolve(enqueueBoundaryUpgrade(scene, {
      boundary,
      entity: liveEntity,
      run: ({ options: admittedOptions }) => upgradePlaceBoundary(
        // Whatever interior root is live at request time is the one a commit removes — not the
        // original param, which would pin the detached substrate via this closure.
        boundary, activeRoot, liveEntity, placeFile, renderer, scene, admittedOptions, setActiveVisualRoot,
      ),
      renderer,
      options: upgradeOptions,
    })).then((result) => {
      // A pre-job refusal left 'loading' + a settled promise — restore + re-arm the on-glass
      // trigger so the boundary can be re-requested instead of pinning its stand-in.
      if (result && PRE_JOB_REFUSAL_STATUSES.has(result.status)) {
        restoreBoundaryAfterPreJobRefusal(boundary, result.status);
        armed = true;
        if (trigger) scheduleRefusalTriggerRearm(result.status, () => {
          if (trigger) trigger.onBeforeRender = authoredPlaceTrigger;
        });
      }
      return result;
    });
    boundary.userData.authoredUpgradePromise = completion;
    return completion;
  };
  boundary.userData.requestAuthoredUpgrade = startAuthoredUpgrade;

  if (trigger) {
    trigger.onBeforeRender = authoredPlaceTrigger;
  }

  const placed = attachPlaceHlod(boundary, entity);
  optimizeStaticBatchesForRoot(placed);
  freezeStaticChildMatrices(placed);
  freezeStaticTransformRoot(placed);
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

// The committed half of authoredAdmissionStarted: every status whose boundary already shows
// committed content (authored or a committed fallback). A released-but-wedged job sitting on
// one of these states must keep its abort exemption — re-admission would hide drawn content.
function authoredCommittedBoundaryStatus(state) {
  return state === 'authored'
    || state === 'authored-prepared'
    || state === 'same-semantic-fallback'
    || state === 'same-semantic-fallback-prepared'
    || state === 'authored-with-cleanup-error';
}

async function upgradePlaceBoundary(boundary, fallbackRoot, entity, placeFile, renderer, scene, options, setActive) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  const loadPart = options && typeof options.loadAuthoredPart === 'function'
    ? options.loadAuthoredPart
    : loadAuthoredPart;
  let record = null;
  try {
    record = await waitForAuthoredAdmission(loadPart(`${partRoot}${placeFile}`, {
      renderer,
      slot: 'place',
      optional: true,
      residencyOwner: options.residencyOwner,
      residencyRole: options.residencyRole,
      sectorId: options.sectorId,
      isResidencyOwnerActive: options.isResidencyOwnerActive,
      admissionDeadline: true,
      admissionVisible: options.admissionVisible,
      signal: options.signal,
    }), options);
    assertQueuedAuthoredAdmissionActive(options, 'after-place-load');
  } catch (error) {
    assertQueuedAuthoredAdmissionActive(options, 'after-place-load-error');
    handoffBootstrapIfCovered(renderer);
    if (!boundary.parent) {
      releaseBoundaryResidency(renderer, boundary, 'place-orphaned-after-load-error', options.admissionEpoch);
      boundary.userData.authoredAssetState = 'orphaned-before-swap';
      return false;
    }
    return failAuthoredPlaceAdmission(
      boundary, fallbackRoot, entity, renderer, options, setActive,
      'place-load-threw', error,
    );
  }
  handoffBootstrapIfCovered(renderer);
  if (record && boundary.userData && record.bounds) {
    // The pending substrate still classifies by presence radius until the authored body
    // lands — stamp the envelope the compose is about to draw at, so glass/runway tests
    // measure the incoming body (often 2-4x the collider) during the compile window. This
    // overwrites the queue-window estimate stamped at boundary build.
    const size = Array.isArray(record.bounds.size) ? record.bounds.size : null;
    const center = Array.isArray(record.bounds.center) ? record.bounds.center : [0, 0, 0];
    if (size) {
      const data = entity && entity.data || {};
      const authoredEnvelope = Math.max(1e-6, ...size.map((value) => Number(value) || 0));
      const pendingScale = resolvePlaceDrawScale(data, {
        targetRadius: declaredPlaceTargetRadius(entity),
        authoredEnvelope,
        censusScale: placeDrawScaleFromRow(modelTruthRow(placeFileStem(record.url)) || modelTruthRowForEntity(entity), entity),
      });
      const union = placeVisualUnionWithOverlay(entity, size, center);
      const stampedBounds = union && placeStampEnvelopeBounds(entity, union, boundary) || union;
      if (stampedBounds) {
        stampPendingCommittedVisualBounds(boundary, stampedBounds, center, pendingScale);
      }
    }
  }
  if (!record || !boundary.parent) {
    releaseBoundaryResidency(renderer, boundary, record ? 'place-orphaned-before-swap' : 'place-unavailable', options.admissionEpoch);
    boundary.userData.authoredAssetState = record ? 'orphaned-before-swap' : 'unavailable';
    if (!record) {
      return failAuthoredPlaceAdmission(
        boundary, fallbackRoot, entity, renderer, options, setActive,
        'place-load-unavailable', null, { residencyReleased: true },
      );
    }
    return false;
  }

  let overlayRecord = null;
  const overlayFile = tradeHubOverlayFileForEntity(options.admissionEntity || entity);
  if (overlayFile) {
    try {
      overlayRecord = await waitForAuthoredAdmission(loadPart(`${partRoot}${overlayFile}`, {
        renderer,
        slot: 'place',
        optional: true,
        residencyOwner: options.residencyOwner,
        residencyRole: options.residencyRole,
        sectorId: options.sectorId,
        isResidencyOwnerActive: options.isResidencyOwnerActive,
        admissionDeadline: true,
        admissionVisible: options.admissionVisible,
        signal: options.signal,
      }), options);
      assertQueuedAuthoredAdmissionActive(options, 'after-place-overlay-load');
    } catch (error) {
      assertQueuedAuthoredAdmissionActive(options, 'after-place-overlay-error');
      overlayRecord = null;
      console.warn('[partsLibrary] trade-hub overlay unavailable; hub still publishes', error);
    }
  }

  let authored = null;
  try {
    authored = buildPlacePropRoot(entity, record, scene, boundary, { overlayRecord });
  } catch (error) {
    return failAuthoredPlaceAdmission(
      boundary, fallbackRoot, entity, renderer, options, setActive,
      'place-build-threw', error,
    );
  }
  if (!authored || !boundary.parent) {
    if (!boundary.parent) {
      releaseBoundaryResidency(renderer, boundary, 'place-swap-not-committed', options.admissionEpoch);
      return false;
    }
    return failAuthoredPlaceAdmission(
      boundary, fallbackRoot, entity, renderer, options, setActive,
      'place-build-unavailable', null,
    );
  }
  // The pre-compose stamp covers only the base record — re-stamp from the composed root's
  // measured envelope so the compile-window grading sees the body's true drawn reach
  // (base + overlay + extensions), not the under-covering record estimate.
  if (authored.root && authored.root.userData && authored.root.userData.visualBounds) {
    const measured = authored.root.userData.visualBounds;
    boundary.userData.visualBounds = {
      center: measured.center.slice(),
      size: measured.size.slice(),
    };
  } else {
    // No measured envelope on the authored root — drop the marker/pre-compose stamp so the
    // committed body classifies from lazy measurement instead of the pending envelope.
    delete boundary.userData.visualBounds;
  }

  registerPreparedAuthoredAdmission(scene, boundary, authored);
  let authoredDisposed = false;
  const disposePreparedPlace = () => {
    if (authoredDisposed) return false;
    try {
      disposeDetachedPlaceFallback(authored.root);
      authored.root.clear();
      authoredDisposed = true;
    } finally {
      // A disposal throw must not strand the registry entry — it pins the boundary and the
      // whole prepared tree as a strong key/value in sceneState.preparedAuthoredRoots.
      unregisterPreparedAuthoredAdmission(authored);
    }
    return true;
  };
  const installedPreparedDisposer = options.deferBoundaryPublication === true
    ? installPreparedBoundaryDisposer(boundary, disposePreparedPlace)
    : null;

  boundary.userData.authoredAssetState = 'compiling-pipelines';
  const completeAdmission = async () => {
    try {
      await prepareAuthoredVisualPipelines(authored.root, options);
    } catch (error) {
      try {
        await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedPlace()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Prepared authored place cleanup failed after pipeline admission failure',
          { cause: error },
        );
      }
      assertQueuedAuthoredAdmissionActive(options, 'after-place-pipeline-error');
      return failAuthoredPlaceAdmission(
        boundary, fallbackRoot, entity, renderer, options, setActive,
        'place-pipeline-compile-failed', error,
      );
    }
    if (!boundary.parent) {
      await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedPlace()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
      releaseBoundaryResidency(renderer, boundary, 'place-orphaned-after-pipeline-compile', options.admissionEpoch);
      return false;
    }
    try {
      const publicationWait = waitForOpeningGraphPublicationRelease(options);
      if (publicationWait) {
        boundary.userData.authoredPreparePhase = 'awaiting-publication';
        await waitForAuthoredAdmission(publicationWait, options);
      }
      assertQueuedAuthoredAdmissionActive(options, 'before-place-publication');
    } catch (error) {
      await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedPlace()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
      throw error;
    }
    if (!boundary.parent) {
      await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedPlace()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
      releaseBoundaryResidency(renderer, boundary, 'place-orphaned-before-publication', options.admissionEpoch);
      return false;
    }
    // Same stale-run guard as the ship commit: a run that parked while its boundary
    // re-admitted under a newer epoch (stall-abort readmission), or whose job was
    // stall-aborted, or whose owner died, must not mount its authored root over the
    // replacement commit. The live epoch owns the boundary; this run disposes only its
    // own prepared tree.
    const commitEntity = options.admissionEntity || entity;
    if ((options.admissionEpoch != null && boundary.userData.admissionEpoch != null
          && boundary.userData.admissionEpoch !== options.admissionEpoch)
        || (typeof options.isAbortedStalledAdmission === 'function' && options.isAbortedStalledAdmission())
        || (commitEntity && commitEntity.alive === false)) {
      await ((installedPreparedDisposer ? installedPreparedDisposer() : disposePreparedPlace()) || disposeOwnedPreparedBoundary(boundary, installedPreparedDisposer));
      return false;
    }
    return commitAuthoredPlaceBoundary(
      boundary,
      fallbackRoot,
      authored,
      setActive,
      commitEntity,
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
  assertQueuedAuthoredAdmissionActive(options, 'before-place-failure');
  if (!flags.residencyReleased) releaseBoundaryResidency(renderer, boundary, reason);
  const admissionEntity = options.admissionEntity || entity;
  // A stale run's fail legs are bookkeeping-only: the epoch-scoped release frees its own pins,
  // but every verdict write — readmission mark, same-semantic-fallback settle, 'unavailable' —
  // would stomp the live admission's committed state or burn its retry budget.
  if (staleAuthoredRunVerdict(boundary, options || {})) {
    if (!flags.residencyReleased) {
      releaseBoundaryResidency(renderer, boundary, reason, options && options.admissionEpoch);
    }
    return false;
  }
  // Owner died mid-admission but the boundary stayed mounted (kept-GPU save recook). The abort
  // is a lifecycle event, not a content verdict — leave the boundary re-requestable so the
  // restored entity's reattach admits it instead of stranding a required shell at 'unavailable'.
  // The residency release runs only on the terminal path: a released owner can never decode.
  if (boundary.parent && admissionOwnerInactive(options, admissionEntity, error)) {
    markAuthoredBoundaryForReadmission(boundary, reason);
    return false;
  }
  if (!flags.residencyReleased) {
    releaseBoundaryResidency(renderer, boundary, reason, options && options.admissionEpoch);
  }
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
  detachBoundaryResolvingMarker(boundary);
  boundary.remove(fallbackRoot);
  boundary.add(authored.root);
  // buildAuthoredPlaceRoot already batches the authored meshes before binding their LODs and
  // specialized materials. Re-batching here replaces those meshes and leaves stale LOD bindings.
  freezeStaticChildMatrices(authored.root);
  freezeStaticTransformRoot(authored.root);
  unregisterPreparedAuthoredAdmission(authored);
  setActive(authored.root);
  carryAdmittedOnceStamp(authored.root, boundary);
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
    // Same residual-link guard as the ship commit: the exact-target prepare ran while this
    // root was detached, so pay any leftover variant here rather than in a presented pass.
    if (typeof options.touchAuthoredExactTarget === 'function') {
      try { options.touchAuthoredExactTarget(authored.root); }
      catch (error) { console.warn('[partsLibrary] place publish touch failed', error); }
    }
    boundary.userData.authoredAssetState = 'authored';
    if (typeof options.onSwap === 'function') {
      try { options.onSwap({ boundary, root: authored.root, authoredRoot: authored.root, entity: admissionEntity, authoredParts: authored.authoredParts }); }
      catch (error) { console.warn('[partsLibrary] place swap observer failed', error); }
    }
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

/**
 * Queue-window visual classification for a pending place boundary. The exact record bounds are
 * only knowable after the GLB resolves, but the queue wait is precisely when rung ordering
 * decides anything — a packaged prop whose drawn size far exceeds its collider would classify
 * at presence radius for the whole wait and sit behind real glass jobs while its stand-in
 * draws. When a target radius is declared, the compose draws the envelope at ~2× it regardless
 * of authored units, so that envelope is stamped here; the exact record bounds overwrite the
 * estimate in upgradePlaceBoundary.
 */
function stampPendingPlaceVisualBounds(boundary, entity, placeFile) {
  if (!boundary || !boundary.userData || boundary.userData.visualBounds) return;
  // The compose resolves the same file — claimSpecId/claimOwned outrank the entity id chain
  // in placeFileForEntity, so key the stamp off the resolved stem, not the entity. A claim
  // site's landmark rock row would otherwise classify the committed outpost ~5-12x under.
  const resolvedStem = placeFileStem(placeFile);
  const stampRow = (resolvedStem ? modelTruthRow(resolvedStem) : null) || modelTruthRowForEntity(entity);
  const targetRadius = Number(boundary.userData.placeTargetRadius);
  if (Number.isFinite(targetRadius) && targetRadius > 0) {
    const diameter = targetRadius * 2;
    boundary.userData.visualBounds = {
      center: [0, 0, 0],
      size: [diameter, diameter, diameter],
    };
    // The commit resolves targetScale = diameter/envelope on the record's longest axis —
    // the fit basis, not the X stamp, is the honest stand-in claim: X-slim records
    // (Z-dominant places like the Resonant Cathedral) would otherwise draw a marker
    // diameter wide for a body committing at diameter·x0/max. When the unioned committed
    // extent outgrows the radius (rotated/offset garnish), arm the fit at that extent —
    // a resident stand-in must not under-draw the marker it replaces.
    const row = stampRow;
    const size = row && row.bounds && row.bounds.size;
    const committedScaleGuess = resolvePlaceDrawScale(entity && entity.data || {}, {
      targetRadius,
      authoredEnvelope: Array.isArray(size)
        ? Math.max(1e-6, ...size.map((value) => Number(value) || 0))
        : 1e-6,
      censusScale: placeDrawScaleFromRow(row, entity),
    });
    const measuredSize = measuredCommittedSize(resolvedStem, committedScaleGuess);
    if (Array.isArray(size)) {
      const union = placeVisualUnionWithOverlay(entity, size, row.bounds && row.bounds.center);
      const stampedBounds = union && placeStampEnvelopeBounds(entity, union, boundary) || union;
      const stampedSize = stampedBounds && stampedBounds.size;
      const committedX = Math.max(
        (stampedSize && Number(stampedSize[0]) * committedScaleGuess) || 0,
        (measuredSize && measuredSize[0]) || 0,
      );
      if (Number.isFinite(committedX) && committedX > 0) {
        boundary.userData.boundaryResolvingCommittedX = committedX;
        boundary.userData.boundaryResolvingStandInFit = Math.max(diameter, committedX);
      } else {
        boundary.userData.boundaryResolvingStandInFit = diameter;
      }
    } else if (measuredSize && measuredSize[0] > 0) {
      boundary.userData.boundaryResolvingCommittedX = measuredSize[0];
      boundary.userData.boundaryResolvingStandInFit = Math.max(diameter, measuredSize[0]);
    } else {
      boundary.userData.boundaryResolvingStandInFit = diameter;
    }
    unionMeasuredVisualBounds(
      boundary.userData.visualBounds,
      resolvedStem && measuredPlaceAuthoredBounds.get(resolvedStem),
      committedScaleGuess,
    );
    return;
  }
  // Boundaries that declare no authored target radius (every archetype station, every non-POI
  // place) would classify at presence radius for the whole queue wait — drawn envelopes run
  // ~2-8x presence per the model-truth census, so the same measured bounds x draw-scale pair
  // buildPlacePropRoot resolves is stamped here instead. Static data: no decode needed.
  const row = stampRow;
  const size = row && row.bounds && row.bounds.size;
  const data = entity && entity.data || {};
  // Same resolver the commit stamp uses: for a world-site root the authored placeScale wins over
  // the census ratio (the D54 override) — stamping the census scale here would classify the
  // boundary at a fraction of its drawn size for the whole queue wait. The census envelope only
  // feeds the non-poi targetScale term, which loses to worldSiteScale/censusScale as intended.
  const scale = resolvePlaceDrawScale(data, {
    targetRadius: declaredPlaceTargetRadius(entity),
    authoredEnvelope: Array.isArray(size)
      ? Math.max(1e-6, ...size.map((value) => Number(value) || 0))
      : 1e-6,
    censusScale: placeDrawScaleFromRow(row, entity),
  });
  if (Array.isArray(size) && Number.isFinite(scale) && scale > 0) {
    const union = placeVisualUnionWithOverlay(entity, size, row.bounds && row.bounds.center);
    const stampedBounds = union && placeStampEnvelopeBounds(entity, union, boundary) || union;
    stampPendingCommittedVisualBounds(boundary, stampedBounds, row.bounds && row.bounds.center, scale);
  }
  const measuredSize = measuredCommittedSize(resolvedStem, scale);
  if (measuredSize) {
    if (measuredSize[0] > (Number(boundary.userData.boundaryResolvingCommittedX) || 0)) {
      boundary.userData.boundaryResolvingCommittedX = measuredSize[0];
    }
  }
  unionMeasuredVisualBounds(
    boundary.userData.visualBounds,
    resolvedStem && measuredPlaceAuthoredBounds.get(resolvedStem),
    scale,
  );
}

// Pending-place envelope stamp, committed frame. centerAuthoredPlaceRoot recenters the
// record's authored bounds-center onto X,Z origin at commit (the measured compose stamp then
// re-verifies) — every pending stamp must describe that same frame or the classified envelope
// sits s·b_c off the silhouette it covers and shifts again at commit.
function stampPendingCommittedVisualBounds(boundary, stampedBounds, authoredCenter, scale) {
  const recenterCenter = authoredCenter;
  boundary.userData.visualBounds = {
    center: [
      (Number(stampedBounds.center && stampedBounds.center[0]) || 0) * scale
        - (Number(recenterCenter && recenterCenter[0]) || 0) * scale,
      (Number(stampedBounds.center && stampedBounds.center[1]) || 0) * scale,
      (Number(stampedBounds.center && stampedBounds.center[2]) || 0) * scale
        - (Number(recenterCenter && recenterCenter[2]) || 0) * scale,
    ],
    size: stampedBounds.size.map((value) => Math.max(0, (Number(value) || 0) * scale)),
  };
  // The scaled stamp's X extent IS the committed drawn X — record it before the resolving
  // marker union swells the stamp, so stand-in sizing claims the authored basis.
  const committedX = Number(stampedBounds.size[0]) * scale;
  if (Number.isFinite(committedX) && committedX > 0) {
    boundary.userData.boundaryResolvingCommittedX = committedX;
  }
}

// Place draw-scale resolution. A POI's declared draw size (placeTargetRadius, else placeScale)
// is authored placement intent and outranks the census radius ratio — the POI's entity radius is
// its gameplay footprint, not the monument's authored scale. The same holds for world-site roots:
// they carry placeScale = manifest visualRoot.initialScale while entity.radius is the site's
// visualRadius footprint — applying the census ratio there blew the Wreck Cathedral out to ~30x
// authored (D54).
export function resolvePlaceDrawScale(data, { targetRadius, authoredEnvelope, censusScale }) {
  const radius = Number(targetRadius);
  const envelope = Math.max(1e-6, Number(authoredEnvelope) || 1e-6);
  const targetScale = Number.isFinite(radius) && radius > 0 ? (radius * 2) / envelope : null;
  const rawScale = Number(data && data.placeScale);
  const authoredScale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : null;
  const worldSiteScale = authoredScale != null
    && data
    && (data.role === 'world_site_root' || data.worldSitePresentation != null)
    ? authoredScale
    : null;
  if (data && data.poi === true) {
    return targetScale ?? authoredScale ?? censusScale ?? 1;
  }
  return worldSiteScale ?? censusScale ?? targetScale ?? authoredScale ?? 1;
}

const _composedPlaceBoundsBox = new THREE.Box3();
const _composedPlaceBoundsVec = new THREE.Vector3();

// Measured committed envelopes per resolved file stem, in authored units (committed
// size ÷ resolvePlaceDrawScale). The pending stamp's record/census estimate covers only the
// base part — faction overlays, depth-prepass batches, approach yaw, and authored extensions
// draw past it (station_helios draws ~549x420 against a ~180 record stamp). Once any instance
// of a stem has committed, its measured envelope is the honest arm for the next pending seat;
// stored in authored units so a sibling at a different draw scale still arms correctly, and
// unioned componentwise with the estimate because per-instance yaw varies the extents.
const measuredPlaceAuthoredBounds = new Map();
// Sized to the bounded stem universe (~141 census stems, ~6 numbers each): a FIFO
// smaller than the universe re-opens the census under-cover class on sector re-entry.
const MEASURED_PLACE_AUTHORED_BOUNDS_LIMIT = 256;

function measuredCommittedSize(stem, scale) {
  const measured = stem && measuredPlaceAuthoredBounds.get(stem);
  if (!measured || !Array.isArray(measured.size) || !(scale > 0)) return null;
  return measured.size.map((value) => (Number(value) || 0) * scale);
}

// The stored center is committed-frame too — a size-only union can under-cover a
// compose whose measured box sits off the stamped center, so the union runs on
// corners (min/max per axis) and derives both fields.
function unionMeasuredVisualBounds(vb, measured, scale) {
  if (!vb || !Array.isArray(vb.size) || !measured || !Array.isArray(measured.size)) return;
  const mc = Array.isArray(measured.center) ? measured.center : [0, 0, 0];
  const vc = Array.isArray(vb.center) ? vb.center : [0, 0, 0];
  const outSize = [0, 0, 0];
  const outCenter = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ms = (Number(measured.size[i]) || 0) * scale;
    const mlo = (Number(mc[i]) || 0) * scale - ms * 0.5;
    const mhi = (Number(mc[i]) || 0) * scale + ms * 0.5;
    const vs = Number(vb.size[i]) || 0;
    const vlo = (Number(vc[i]) || 0) - vs * 0.5;
    const vhi = (Number(vc[i]) || 0) + vs * 0.5;
    const lo = Math.min(vlo, mlo);
    const hi = Math.max(vhi, mhi);
    outCenter[i] = (lo + hi) * 0.5;
    outSize[i] = Math.max(0, hi - lo);
  }
  vb.center = outCenter;
  vb.size = outSize;
}

function buildPlacePropRoot(entity, record, scene, ownerBoundary, options = {}) {
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
  // Key the census scale off the resolved record's file stem — claimSpecId/claimOwned picks
  // a different file than the entity id chain predicts, and the claim row's own radius
  // reference is the honest scale basis (a claim landmark rock over-scales ~20%).
  const censusRow = modelTruthRow(placeFileStem(record && record.url)) || modelTruthRowForEntity(entity);
  const censusScale = placeDrawScaleFromRow(censusRow, entity);
  const targetRadius = declaredPlaceTargetRadius(entity);
  const authoredEnvelope = Math.max(
    1e-6,
    ...(record.bounds && Array.isArray(record.bounds.size)
      ? record.bounds.size.map((value) => Number(value) || 0)
      : [authoredLength]),
  );
  const scale = resolvePlaceDrawScale(data, {
    targetRadius,
    authoredEnvelope,
    censusScale,
  });
  instantiatePart(record, root, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    targetLength: authoredLength * scale,
    label: 'Place',
  }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
  const overlayRecord = options.overlayRecord;
  if (overlayRecord) {
    const overlayLength = Math.max(
      overlayRecord.bounds && overlayRecord.bounds.size && overlayRecord.bounds.size[0] || 1,
      1e-6,
    );
    instantiatePart(overlayRecord, root, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      targetLength: overlayLength * scale,
      label: 'FactionOverlay',
    }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
  }
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
  // Stations key on the placeFile stem recorded on the boundary (e.g. place_station_trade_hub),
  // not the GLB's internal assetId.
  installAuthoredApproachYaw(root, entity, ownerBoundary?.userData?.placeId || placeId);
  installWorldSitePresentation(root, entity);
  installWreckCathedralOpaqueDepthPrepass(root, placeId, bindings);
  installStationOpaqueDepthPrepass(root, entity, bindings);
  specializeClaimRelayOpaqueMaterials(root, placeId);
  installAuthoredLod(root, bindings, null, authoredLevels(record), true);
  root.userData.updateLod('lod0');
  // Places carrying a sealed motion bank (e.g. the rigged cargo pod) animate off the same
  // entity-keyed driver surface as ships.
  attachAuthoredMotionDriver(root, entity, bindings.authoredMotions);
  root.userData.authoredSourceEnvelope = authoredEnvelope;
  root.userData.authoredWorldScale = scale;
  root.userData.placeTargetRadius = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius : null;

  root.userData.renderContract = {
    version: 1,
    coordinateSystem: '+X forward, +Y up, +Z starboard; authored world scale',
    authoredParts: options.overlayRecord
      ? [record.url, options.overlayRecord.url]
      : [record.url],
    authoredSlots: {
      place: options.overlayRecord ? [record.url, options.overlayRecord.url] : [record.url],
    },
    hookBinding: hasExplicitAuthoredGeologyPresentation(entity)
      ? 'SOCKET_* markers remain available; authored mesh is presentation over a simulation-owned asteroid'
      : 'SOCKET_* markers remain available for debug/probes; world-place props are non-sim scenery',
  };
  // Re-stamp the committed envelope from the measured composed root: record.bounds covers only
  // the base part — the faction overlay, depth-prepass batches, approach yaw, and authored
  // extensions draw past it (station_helios draws ~549x420 against a ~180 record stamp).
  // entityVisualCullRadius prefers the stamp over its own lazy measurement, so an
  // under-covering stamp would classify the biggest on-glass bodies at a fraction of their
  // drawn reach for the root's whole life.
  _composedPlaceBoundsBox.setFromObject(root);
  if (!_composedPlaceBoundsBox.isEmpty()) {
    const measuredCenter = _composedPlaceBoundsBox.getCenter(_composedPlaceBoundsVec);
    const measuredSize = [
      _composedPlaceBoundsBox.max.x - _composedPlaceBoundsBox.min.x,
      _composedPlaceBoundsBox.max.y - _composedPlaceBoundsBox.min.y,
      _composedPlaceBoundsBox.max.z - _composedPlaceBoundsBox.min.z,
    ];
    root.userData.visualBounds = {
      center: [measuredCenter.x, measuredCenter.y, measuredCenter.z],
      size: measuredSize,
    };
    const measuredStem = placeFileStem(record && record.url);
    if (measuredStem && scale > 0) {
      const invScale = 1 / scale;
      measuredPlaceAuthoredBounds.delete(measuredStem);
      measuredPlaceAuthoredBounds.set(measuredStem, {
        center: [measuredCenter.x * invScale, measuredCenter.y * invScale, measuredCenter.z * invScale],
        size: measuredSize.map((value) => value * invScale),
      });
      if (measuredPlaceAuthoredBounds.size > MEASURED_PLACE_AUTHORED_BOUNDS_LIMIT) {
        measuredPlaceAuthoredBounds.delete(measuredPlaceAuthoredBounds.keys().next().value);
      }
    }
  }
  return {
    root,
    authoredParts: options.overlayRecord
      ? [record.url, options.overlayRecord.url]
      : [record.url],
    authoredSlots: {
      place: options.overlayRecord ? [record.url, options.overlayRecord.url] : [record.url],
    },
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
        // Preserve the source's shader hooks — a bare clone() drops own-property
        // onBeforeCompile, and installSingleSamplePackedOrmShader would then capture the
        // dropped default as its chain target instead of the real patch.
        variant = cloneMaterialPreservingShaderHooks(source);
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

// Authored approach-channel registration. Some authored station packages draw their real
// open flight lane at a fixed bearing inside the GLB, while the collision corridor that
// lane must serve is stamped per-station (data.corridorBearingDeg → proxy ring gap,
// capture lane, berth, autopilot routing). When the two disagree the corridor runs under
// solid roof and the hull vanishes for the whole approach. Rotate the authored city about
// its visual center so the drawn channel lands on the effective corridor bearing.
// Values are the bearing (deg, world atan2(z,x) convention) of the package's open channel,
// measured on the real meshes — see scripts/probe-station-occlusion.mjs SF_OCCL_MAP.
const AUTHORED_APPROACH_CHANNEL_DEG = Object.freeze({
  place_station_trade_hub: 250,
});

// The committed approach-yaw for a station placeId, or null when none applies. Shared by the
// compose (installAuthoredApproachYaw) and the pending stand-in arm — the marker must draw
// the same yawed silhouette it previews or the approach-channel body snaps at commit.
function authoredApproachYawDegFor(entity, placeId) {
  const channelDeg = AUTHORED_APPROACH_CHANNEL_DEG[placeId];
  if (!Number.isFinite(channelDeg)) return null;
  if (!entity || entity.type !== 'station') return null;
  const manifest = resolveCollisionProxyManifest(entity);
  if (!manifest || !manifest.docking) return null;
  const corridorDeg = effectiveCorridorBearingDeg(manifest, entity);
  if (!Number.isFinite(corridorDeg)) return null;
  const yawDeg = ((corridorDeg - channelDeg + 540) % 360) - 180;
  return yawDeg || null;
}

function installAuthoredApproachYaw(root, entity, placeId) {
  if (!root || !root.isObject3D) return;
  const yawDeg = authoredApproachYawDegFor(entity, placeId);
  if (yawDeg == null) return;
  // Empirically verified on the live renderer: positive rotation.y moves an
  // authored-bearing-β feature to world bearing β + α in this transform chain.
  root.rotation.y = yawDeg * (Math.PI / 180);
  root.userData.authoredApproachYawDeg = yawDeg;
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

// Stations are the measured overdraw hotspot (see design/perf/w4-depthprepass-REPORT.md):
// the approach pose stacks ~3.7 opaque layers per covered pixel. The engine disables the
// default opaque painter sort (`setOpaqueSort(() => 0)` in renderer.js — opaque draw order
// is scene-traversal order, and renderOrder is dead config), so ordering must be structural:
// each prepass mesh is PREPENDED to index 0 of the highest ancestor whose transform chain
// stays static (the place root in practice), drawing before every sibling subtree —
// including its own source — without reordering existing children.
// Visibility syncs through the same binding buckets the source joins (LOD, damage
// secondary) via cloned tags; only bulkiest occluders participate — greebles, hooks,
// transparent canopies, and collision hulls fall through the eligibility gates below.
const STATION_DEPTH_PREPASS_MIN_WORLD_RADIUS = 40;
let stationOpaqueDepthPrepassMaterial = null;

function stationDepthPrepassMaterial() {
  if (!stationOpaqueDepthPrepassMaterial) {
    stationOpaqueDepthPrepassMaterial = new THREE.ShaderMaterial({
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
    stationOpaqueDepthPrepassMaterial.name = 'SF_Station_OpaqueDepthPrepass';
    stationOpaqueDepthPrepassMaterial.userData.spacefaceMinimalPositionDepthShader = true;
  }
  return stationOpaqueDepthPrepassMaterial;
}

// A group/mesh qualifies when its depth equals the surface the color pass would write:
// fully opaque, no clip/offset/displacement rewrites, nearest-facing coverage only.
function stationDepthPrepassEligibleMaterial(material) {
  return !!material
    && material.visible !== false
    && material.transparent !== true
    && material.depthWrite !== false
    && (material.depthFunc === undefined || material.depthFunc === THREE.LessEqualDepth)
    && !(Number(material.alphaTest) > 0)
    && (!Number.isFinite(Number(material.opacity)) || Number(material.opacity) >= 1)
    && !material.displacementMap
    && material.polygonOffset !== true
    && (material.side === THREE.FrontSide || material.side === THREE.DoubleSide);
}

const _stationDepthPrepassScale = new THREE.Vector3();

function stationDepthPrepassDynamicNode(object) {
  const userData = object.userData || {};
  const tags = userData.spacefaceTags || {};
  return !!(userData.animated || userData.hlod || userData.spacefaceSocket
    || userData.updateRuntimeState || userData.updateDriveState || userData.updateLod
    || tags.drive || tags.mount || tags.motionGroup);
}

function stationDepthPrepassScope(source, root) {
  // The copied local matrix is only valid while every node between the attach parent and
  // the source stays static — climb to the last ancestor before the first dynamic link.
  let scope = source.parent;
  while (scope && scope !== root && !stationDepthPrepassDynamicNode(scope)) {
    scope = scope.parent;
  }
  return scope || source.parent;
}

function installStationOpaqueDepthPrepass(root, entity, bindings) {
  if (!root || !entity || entity.type !== 'station') return;
  const sources = [];
  root.traverse((object) => {
    if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh) return;
    if (object.userData?.spacefaceDepthPrepass) return;
    if (!object.parent) return;
    if (object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
    const geometry = object.geometry;
    if (!geometry?.attributes?.position) return;
    if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length) return;
    const tags = object.userData?.spacefaceTags || {};
    if (object.visible === false && !tags.lod) return;
    // A prepass sibling copies the source's local matrix once — only meshes whose own
    // transform never animates qualify (the same markers shouldFreezeStaticChild uses).
    if (tags.drive || tags.motionGroup || object.userData?.animated || object.userData?.hlod
      || object.userData?.updateRuntimeState || object.userData?.updateDriveState) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const localRadius = Number(geometry.boundingSphere?.radius) || 0;
    if (localRadius <= 0) return;
    object.getWorldScale(_stationDepthPrepassScale);
    const worldScale = Math.max(
      Math.abs(_stationDepthPrepassScale.x),
      Math.abs(_stationDepthPrepassScale.y),
      Math.abs(_stationDepthPrepassScale.z),
    );
    if (localRadius * worldScale < STATION_DEPTH_PREPASS_MIN_WORLD_RADIUS) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(stationDepthPrepassEligibleMaterial)) return;
    sources.push(object);
  });
  if (!sources.length) return;

  const depthMaterial = stationDepthPrepassMaterial();
  const prepasses = [];
  for (const source of sources) {
    const geometry = source.geometry;
    const materials = Array.isArray(source.material) ? source.material : [source.material];
    const groups = Array.isArray(geometry.groups) && geometry.groups.length
      ? geometry.groups
      : [{
        start: 0,
        count: geometry.index ? geometry.index.count : geometry.attributes.position.count,
        materialIndex: 0,
      }];
    const eligibleGroups = groups.filter(
      (group) => stationDepthPrepassEligibleMaterial(materials[group.materialIndex || 0]),
    );
    if (!eligibleGroups.length) continue;
    let depthGeometries;
    if (eligibleGroups.length === groups.length) {
      // Whole mesh qualifies — draw the source geometry verbatim, zero extra buffers.
      depthGeometries = [geometry];
    } else if (geometry.index?.array) {
      const index = geometry.index;
      const indices = [];
      for (const group of eligibleGroups) {
        const start = Math.max(0, Number(group.start) || 0);
        const end = Math.min(index.count, start + Math.max(0, Number(group.count) || 0));
        for (let offset = start; offset < end; offset++) indices.push(index.array[offset]);
      }
      if (!indices.length) continue;
      const view = new THREE.BufferGeometry();
      view.setAttribute('position', geometry.getAttribute('position'));
      view.setIndex(new THREE.BufferAttribute(new index.array.constructor(indices), 1, index.normalized));
      view.boundingSphere = geometry.boundingSphere;
      view.boundingBox = geometry.boundingBox;
      view.userData.spacefaceStationDepthIndexView = true;
      depthGeometries = [view];
    } else {
      // Non-indexed groups are contiguous vertex ranges — one drawRange view per eligible run.
      depthGeometries = eligibleGroups.map((group) => {
        const view = new THREE.BufferGeometry();
        view.setAttribute('position', geometry.getAttribute('position'));
        view.setDrawRange(Math.max(0, Number(group.start) || 0), Math.max(0, Number(group.count) || 0));
        view.boundingSphere = geometry.boundingSphere;
        view.boundingBox = geometry.boundingBox;
        view.userData.spacefaceStationDepthDrawRange = true;
        return view;
      }).filter((view) => view.drawRange.count > 0);
      if (!depthGeometries.length) continue;
    }
    // Attach into the highest ancestor whose transform chain to the source is static —
    // the earlier the prepass draws, the more overlapping geometry it rejects.
    const scope = stationDepthPrepassScope(source, root);
    const local = new THREE.Matrix4();
    for (let node = source; node && node !== scope; node = node.parent) {
      if (node.matrixAutoUpdate) node.updateMatrix();
      local.premultiply(node.matrix);
    }
    const tags = clonePrimitiveTags(source.userData?.spacefaceTags);
    if (tags) delete tags.mount; // a depth shell must never resolve as an attachment target
    for (const depthGeometry of depthGeometries) {
      const prepass = new THREE.Mesh(depthGeometry, depthMaterial);
      prepass.name = `${source.name || 'StationMesh'}_OpaqueDepthPrepass`;
      prepass.matrixAutoUpdate = false;
      prepass.matrix.copy(local);
      prepass.layers.mask = source.layers.mask;
      prepass.frustumCulled = source.frustumCulled;
      prepass.castShadow = false;
      prepass.receiveShadow = false;
      prepass.visible = source.visible;
      prepass.userData = {
        spacefaceDepthPrepass: true,
        spacefaceDepthRole: 'station-occluder',
        spacefacePartUrl: source.userData?.spacefacePartUrl,
        spacefacePartUrls: source.userData?.spacefacePartUrls,
        spacefaceTags: tags,
      };
      // Traversal order is draw order — prepend before every other subtree in the scope.
      scope.add(prepass);
      scope.children.splice(scope.children.indexOf(prepass), 1);
      scope.children.unshift(prepass);
      prepass.matrixWorldNeedsUpdate = true;
      registerBinding(prepass, tags, bindings);
      prepasses.push(prepass);
    }
  }
  if (!prepasses.length) return;
  root.userData.stationOpaqueDepthPrepass = {
    drawables: prepasses.length,
    sources: sources.length,
    geometry: 'shared-position-index-views',
    material: 'position-only-front-sided',
    ordering: 'traversal-prepend-before-siblings',
    minWorldRadius: STATION_DEPTH_PREPASS_MIN_WORLD_RADIUS,
  };
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
        // Preserve the source's shader hooks — a bare clone() drops own-property
        // onBeforeCompile, and the packed-ORM installer would then capture the dropped
        // default as its chain target instead of the real patch.
        variant = cloneMaterialPreservingShaderHooks(material);
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
  material.customProgramCacheKey = () => canonicalizeSurfaceProgramFamilyKey(
    originalProgramCacheKey,
    'spaceface-packed-orm-single-sample-v1',
  );
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

export function buildFallbackPlaceProp(entity, placeFile = '') {
  const data = entity && entity.data || {};
  const placeId = data.placeId || String(placeFile || '').replace(/^places\//, '').replace(/\.glb$/, '');
  const group = new THREE.Group();
  group.name = `SF_PlaceFallback_${placeId}`;
  group.userData.kind = 'place';
  group.userData.placeId = placeId;
  group.userData.renderContract = {
    assetBoundary: 'GLTFKit v1 — authored world-place prop fallback',
    gracefulFallback: true,
  };
  // Alien Ecology program (doc 03): the infestation kit is procedural-only for the slice —
  // `alien_growth_<module>` placeIds resolve to organic geometry instead of an empty group.
  if (placeId.startsWith('alien_growth_')) {
    group.add(buildAlienGrowthProp(placeId, data.scale ? data.scale * 10 : entity && entity.radius));
  }
  // Verge-Layer machine layer (doc 07): `machine_<prop>` placeIds resolve to pale-metal
  // machine geometry — procedurally distinct from the organic kit on purpose.
  if (placeId.startsWith('machine_')) {
    group.add(buildMachineProp(placeId, data.scale ? data.scale * 10 : entity && entity.radius));
  }
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

const warnedUnresolvedStationPlaceIds = new Set();

function warnUnresolvedStationPlaceId(entity, id, rescue) {
  const key = String(id);
  if (warnedUnresolvedStationPlaceIds.has(key)) return;
  warnedUnresolvedStationPlaceIds.add(key);
  const data = entity && entity.data || {};
  const label = data.stationId || data.name || (entity && entity.id) || 'station';
  console.warn(
    `[partsLibrary] station place id '${key}' is not in the place registry (${label});`
    + ` resolving ${rescue} instead`,
  );
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
  if (id) {
    const remasterFile = OPENING_DOCK_HULK_DEBRIS_PLACE_FILE_BY_ID[id];
    if (remasterFile) return remasterFile;
    // The family maps are flag-gated so random dressing rows cannot leak into kit/wreck bodies.
    // Authored set pieces are the opposite case: a POI or world one-off that NAMES a family body
    // was placed deliberately (the great tanker in Helios, the resonant cathedral gantry), so the
    // placement flags admit them — otherwise they spawn as permanently invisible markers.
    // Stations are excluded: their own type-total fallback below owns station bodies, and a
    // landmark station must never resolve as a dressing prop.
    const authoredSetPiece = entity.type !== 'station'
      && (data.worldOneOff === true || data.landmark === true || data.poi === true);
    if (data.everydaySpaceKit === true || authoredSetPiece) {
      const kitFile = EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID[id];
      if (kitFile) return kitFile;
    }
    if (data.wreckAftermath === true || authoredSetPiece) {
      const wreckFile = WRECK_AFTERMATH_PLACE_FILE_BY_ID[id];
      if (wreckFile) return wreckFile;
    }
    const explicitFile = PLACE_FILE_BY_ID[id]
      || (PLACE_FILES.includes(`places/${id}.glb`) ? `places/${id}.glb` : null);
    if (explicitFile) return explicitFile;
  }
  // PQ-193.12: a station the player can reach must never fall through to the procedural
  // fat-cylinder-plus-hoops body. The station catalog type vocabulary is total over
  // STATION_TYPES -> places/place_station_<type>.glb and every gate/wormhole ring is the authored
  // jump ring, so resolution is total even when a record forgets or mistypes its archetype tag.
  if (entity && entity.type === 'station') {
    if (data.isGate === true || data.isWormhole === true) {
      if (id) warnUnresolvedStationPlaceId(entity, id, 'the authored jump ring');
      return 'places/place_gate_jump_ring.glb';
    }
    const typeId = String(data.stationTypeId || '');
    if (typeId && PLACE_FILE_BY_ID[`place_station_${typeId}`]) {
      if (id) warnUnresolvedStationPlaceId(entity, id, 'the authored station family body');
      return `places/place_station_${typeId}.glb`;
    }
  }
  return null;
}

// A request deduped onto a still-queued job may carry urgency the first ask did not (the
// decode-runway kick's residencyRole). The job's priority already re-grades at admit, so
// merge only caller-provided option fields — undefined never clobbers, and a frozen or
// admitted job's bag is left alone.
function mergeQueuedJobOptions(queuedJob, request) {
  const target = queuedJob && queuedJob.options;
  const incoming = request && request.options;
  if (!target || !incoming || !Object.isExtensible(target)) return;
  for (const optionKey of Object.keys(incoming)) {
    // admissionEpoch is boundary-scoped — a merge can join a different boundary's job (the
    // byKey site), where a stamped epoch would poison that job's own commit. Only a
    // same-boundary join carries it, via carryAdmissionEpochToJoinedJob.
    if (optionKey === 'admissionEpoch') continue;
    // Visible grading is monotonic: a job already posted to the glass lane must not be
    // demoted by a later off-glass ask — promoteInFlightJobAdmissionVisible mirrors this.
    if (optionKey === 'admissionVisible') {
      if (incoming.admissionVisible === true) target.admissionVisible = true;
      continue;
    }
    if (incoming[optionKey] !== undefined) target[optionKey] = incoming[optionKey];
  }
}

// A same-boundary dedupe join IS the newest admission — the joiner's residencyOptionsForBoundary
// already minted its options against the bumped admissionEpoch, so the joined job must carry it
// or the stale-commit guard drops this run's mount with no replacement committer (boundary stuck
// 'loading'). Never call this for a different-boundary join (the byKey site): the epoch counter
// lives on each boundary's own userData.
function carryAdmissionEpochToJoinedJob(joinedJob, request) {
  const incomingEpoch = request && request.options && request.options.admissionEpoch;
  const target = joinedJob && joinedJob.options;
  if (incomingEpoch != null && target && Object.isExtensible(target)) {
    // Never downgrade: a re-enqueued request can carry an epoch minted before the boundary's
    // latest re-mark (e.g. a byKey-deferred joiner resuming its original bag after the
    // boundary re-admitted). Writing it would strand the job — the strict-equality commit
    // guards would drop the live run's only committer.
    target.admissionEpoch = Math.max(Number(target.admissionEpoch) || 0, incomingEpoch);
  }
}

// A same-boundary re-request joins whichever lifecycle the job is in: queued jobs merge the
// option bag (the same monotonic admissionVisible promote the enqueue path applies), in-flight
// jobs take the flag-only promote.
function regradeJoinedJobAdmissionVisible(joinedJob, request) {
  if (joinedJob && joinedJob.lifecycle === 'queued') mergeQueuedJobOptions(joinedJob, request);
  else promoteInFlightJobAdmissionVisible(joinedJob, request);
}

// An admitted job's option bag stays frozen except one field: a request that dedupes onto it
// knowing the boundary is on readable glass promotes admissionVisible. The per-part prefetch
// chain reads job.options.admissionVisible at each post, so the flag re-grades the remaining
// decode tail visible — the per-part mirror of deadlineJoin on a single task.
function promoteInFlightJobAdmissionVisible(existingJob, request) {
  if (!existingJob || existingJob.lifecycle !== 'in-flight') return;
  const target = existingJob.options;
  if (!target || target.admissionVisible === true || !Object.isExtensible(target)) return;
  if (request && request.options && request.options.admissionVisible === true) {
    target.admissionVisible = true;
  }
}

export function enqueueBoundaryUpgrade(scene, job) {
  const state = upgradeQueueState(scene);
  if (!job || !job.boundary) return Promise.resolve({ status: 'invalid-upgrade-request' });
  const boundaryJob = state.byBoundary.get(job.boundary);
  if (boundaryJob) {
    if (boundaryJob.lifecycle === 'queued') mergeQueuedJobOptions(boundaryJob, job);
    else promoteInFlightJobAdmissionVisible(boundaryJob, job);
    carryAdmissionEpochToJoinedJob(boundaryJob, job);
    return boundaryJob.completion;
  }
  if (!boundaryBelongsToScene(job.boundary, scene)) {
    return Promise.resolve({ status: 'cancelled-before-queue', boundary: job.boundary });
  }
  // A live survival run admits the arena's fight roster, not the staging sector's far dressing.
  // Refusing at enqueue keeps the boundary armed ('awaiting-authored-admission'), so the ordinary
  // approach trigger re-requests it if the player ever closes to the fight-fit envelope — and
  // anything still deferred re-requests when the run ends and the sector returns.
  if (survivalDefersArenaDressingJob(job.entity, authoredRuntimeState())) {
    return Promise.resolve({ status: 'deferred-arena-dressing', boundary: job.boundary });
  }
  // Cool off after an admit re-grade evict. Skipped only while the stamp is fresh AND the
  // exact keep domain still fails on a fresh request — glass-law re-requests and a genuinely
  // re-approaching entity pass the same predicate the admit gate runs and post normally.
  const evictedAt = job.boundary.userData && job.boundary.userData.upgradeRegradeEvictedAt;
  if (Number.isFinite(evictedAt)
      && monotonicNow() - evictedAt < AUTHORED_REGRADE_REPOST_COOLDOWN_MS
      && !runwayWantedDomain(job.entity, {
        admissionVisible: !!(job.options && job.options.admissionVisible === true),
        priority: authoredUpgradePriority(job),
      })) {
    return Promise.resolve({ status: 'regrade-evict-cooloff', boundary: job.boundary });
  }
  // The cap binds a sustained oscillation episode, not a lifetime tally: refusals older than
  // the decay window belong to a resolved graze and must not demote a later genuine approach
  // to glass-time admission for the rest of the boundary's mounted life.
  const restoreLastAt = job.boundary.userData && job.boundary.userData.regradeRestoreLastAt;
  const regradeRestores = Number.isFinite(restoreLastAt)
    && monotonicNow() - restoreLastAt > AUTHORED_REGRADE_RESTORE_DECAY_MS
    ? 0
    : (job.boundary.userData && (job.boundary.userData.regradeRestoreCount | 0));
  if (regradeRestores >= AUTHORED_REGRADE_REPOST_MAX
      && !runwayWantedBeyondHorizon(job.entity, {
        admissionVisible: !!(job.options && job.options.admissionVisible === true),
        priority: authoredUpgradePriority(job),
      })) {
    return Promise.resolve({ status: 'regrade-evict-cooloff', boundary: job.boundary });
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
    boundaryToken: {},
  };
  const keyedJob = state.byKey.get(queuedJob.key);
  if (keyedJob) {
    if (jobStillNeeded(state, keyedJob)) {
      if (keyedJob.lifecycle === 'queued') mergeQueuedJobOptions(keyedJob, job);
      else promoteInFlightJobAdmissionVisible(keyedJob, job);
      // The shared job only commits its own boundary — the joiner's boundary sits 'loading'
      // with no committer (its trigger disarmed, no sweep re-arms it): a permanent stand-in on
      // e.g. station HLOD's dual-boundary nesting. Re-enqueue the joiner once the shared job
      // settles — byKey has already been cleared by then, so it queues as its own job and the
      // decode is cache-warm.
      return keyedJob.completion.then(() => {
        // The parked job's epoch was minted at its first request; if the boundary re-admitted
        // under a newer epoch since, the re-enqueue must carry the newest counter or the
        // resumed commit drops at the stale-run guard with no replacement committer.
        const boundaryEpoch = job.boundary && job.boundary.userData
          && job.boundary.userData.admissionEpoch;
        if (boundaryEpoch != null) {
          job.options = {
            ...(job.options || {}),
            admissionEpoch: Math.max((job.options && job.options.admissionEpoch) || 0, boundaryEpoch),
          };
        }
        return enqueueBoundaryUpgrade(scene, job);
      });
    }
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
  upgradeTokensByBoundary.set(queuedJob.boundary, queuedJob.boundaryToken);
  if (state.firstFlightHandoffHold === true && firstFlightReadableShipJob(queuedJob)) {
    primeNextAuthoredAssetPlan(state);
  }
  if (!state.running) processUpgradeQueue(state);
  else scheduleNextUpgradeFrame(state);
  return completion;
}

function invalidateScheduledUpgradeFrame(state) {
  if (!state) return false;
  state.frameScheduleToken = (Number(state.frameScheduleToken) || 0) + 1;
  const invalidated = state.frameScheduled === true;
  state.frameScheduled = false;
  // The pending callback that would have consumed this marker is being dropped — a stale bypass
  // flag must not reorder the next unrelated admission.
  state.stallBypassShipPass = false;
  return invalidated;
}

/**
 * Continue/load handoff cohort: finish at most one queued heavy boundary while loading still owns
 * the picture, then hold the remaining queue until the first playable paint releases it.
 *
 * The hold is checked when the callback executes, not when it is scheduled, so a loading rAF cannot
 * race mode handover and synchronously compose inside the first flight display callback.
 */
export async function prepareFirstQueuedAuthoredBoundaryForOpening(scene) {
  const state = upgradeQueueState(scene);
  state.openingHandoffHold = true;
  invalidateScheduledUpgradeFrame(state);

  const inFlight = [...state.byBoundary.values()].find((job) => job.lifecycle === 'in-flight');
  if (inFlight) {
    await inFlight.completion;
    return { prepared: true, source: 'in-flight', key: inFlight.key };
  }

  for (const job of [...state.jobs]) {
    if (jobStillNeeded(state, job)) continue;
    const index = state.jobs.indexOf(job);
    if (index >= 0) state.jobs.splice(index, 1);
    cancelQueuedJob(state, job);
  }
  if (state.jobs.length === 0) {
    state.running = false;
    publishUpgradeDiagnostics(state);
    return { prepared: false, source: 'empty' };
  }

  const completion = admitNextUpgradeJob(state);
  if (!completion || typeof completion.then !== 'function') {
    return { prepared: false, source: 'unavailable' };
  }
  const result = await completion;
  return { prepared: true, source: 'queued', result };
}

export function isLoadingHullUpgradeJob(job) {
  const entity = job && job.entity;
  if (!entity) return false;
  if (entity.isPlayer === true) return true;
  // A station is the biggest authored body in most sectors and the one the player steers toward.
  // Leaving it out of the hulls-only cohort meant the jump/Continue cook admitted every hull and
  // then parked the destination station behind the leftover-FX hold. Authored `fx` places stay
  // out: those are exactly the leftover compiles this cohort exists to defer.
  return entity.type === 'ship' || entity.type === 'place' || entity.type === 'station';
}

/** Release the bounded handoff hold after the first playable picture has painted or startup aborts. */
export function resumeAuthoredUpgradeQueueAfterOpening(scene) {
  const state = scene && upgradeQueuesByScene.get(scene);
  if (!state) return false;
  const held = state.openingHandoffHold === true || state.firstFlightHandoffHold === true;
  state.openingHandoffHold = false;
  state.firstFlightHandoffHold = false;
  state.firstFlightPrefetchJob = null;
  if (state.heldShipWakeTimer != null) clearTimeout(state.heldShipWakeTimer);
  state.heldShipWakeTimer = null;
  if (state.stalledHogWakeTimer != null) clearTimeout(state.stalledHogWakeTimer);
  state.stalledHogWakeTimer = null;
  state.loadingHullsOnly = false;
  scheduleNextUpgradeFrame(state);
  return held;
}

/** F9 / Continue: admit restored hulls, keep leftover entity:fx compiles held. */
export function resumeAuthoredUpgradeQueueForLoadingHulls(scene) {
  const state = scene && upgradeQueuesByScene.get(scene);
  if (!state) return false;
  state.openingHandoffHold = false;
  state.firstFlightHandoffHold = false;
  state.firstFlightPrefetchJob = null;
  if (state.heldShipWakeTimer != null) clearTimeout(state.heldShipWakeTimer);
  state.heldShipWakeTimer = null;
  if (state.stalledHogWakeTimer != null) clearTimeout(state.stalledHogWakeTimer);
  state.stalledHogWakeTimer = null;
  state.loadingHullsOnly = true;
  scheduleNextUpgradeFrame(state);
  return true;
}

/** Stop leftover FX upgrades from publishing during the first flight presents. */
export function holdAuthoredUpgradeQueueForFirstFlight(scene) {
  const state = scene && upgradeQueuesByScene.get(scene);
  if (!state) return false;
  // The opening cohort's broad hold is over at the first-flight boundary. Carrying it into
  // flight masks the selective ship lane below, even though firstFlightHandoffHold still fences
  // every non-ship job until the regular release latch.
  state.openingHandoffHold = false;
  state.firstFlightHandoffHold = true;
  state.loadingHullsOnly = false;
  invalidateScheduledUpgradeFrame(state);
  scheduleNextUpgradeFrame(state);
  return true;
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
      frameScheduleToken: 0,
      heldShipWakeTimer: null,
      stalledHogWakeTimer: null,
      firstFlightPrefetchJob: null,
      openingHandoffHold: false,
      firstFlightHandoffHold: false,
      stallBypassShipPass: false,
      loadingHullsOnly: false,
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

export function authoredUpgradePriority(job) {
  const entity = job && job.entity;
  if (entity && entity.isPlayer === true) return 0;
  const live = authoredRuntimeState();
  // A hostile ship inside the camera's fight-fit envelope is being acted on now: it outranks the
  // critical starting hub and every dressing job. Recomputed on each admission, so a hostile that
  // closes the distance promotes while it waits; nothing in flight is ever pre-empted.
  const combatant = combatantAdmissionPriority(entity, live);
  if (combatant !== null) return combatant;
  if (isCriticalHubInCurrentSector(entity, live && live.world && live.world.currentSectorId)) return 1;
  const background = backgroundUpgradePriority(job);
  // A sector arrival hands this queue the destination's whole authored population in one burst, and
  // steady-flight admission is serial, so queue order decides what the player sees first. Staged
  // arrival bodies grade by how far they are from the player *now* — the queue is re-sorted at
  // every admission, and the destination is staged while the player is still in the sector they
  // are leaving, so a distance measured at staging time would just be the width of the jump.
  if (!job || !job.options || job.options.sectorArrivalBody !== true) return background;
  const player = live && live.entities && live.playerId != null
    ? live.entities.get(live.playerId)
    : null;
  const hint = sectorArrivalPriorityHint(planarRangeWU(job.entity, player));
  return typeof hint === 'number' ? Math.min(background, hint) : background;
}

function backgroundUpgradePriority(job) {
  const liveState = authoredRuntimeState();
  const entity = job && job.entity;
  if (!entity) return 10;
  // The activity runtime's R0_GLASS tier is the strict "the player is already
  // looking at this body" signal — an undrawn authored owner on the glass cannot
  // wait behind a locked target, an off-glass hostile, or arrival dressing that
  // merely enqueued first. Only the player, live fight-fit combatants and the
  // critical-hub gate (checked above, in authoredUpgradePriority) stay ahead.
  // Re-graded on every pick, so a body that crosses the glass while queued
  // promotes itself instead of waiting out the background backlog. Checked
  // before the mode gate: the load window has no flight rungs, and a glass body
  // the opening frame shows is exactly the set the belt tail left compiling
  // behind staged furniture. The strict band, not readable glass: explicit-focus
  // owners (player, locked target) carry their own rungs and must not tie the
  // on-glass set from off the frame.
  if (entityIsOnAuthoredGlassBand(entity, liveState)) return 1.5;
  // The law of the glass as an admission rung (ZERO_TO_HERO 5.12): a body the
  // composed frame shows outranks every body it does not — load window included,
  // where the arrival distance grade used to be the only ordering left and near
  // station furniture buried the visible set. Fails closed with no composed
  // camera, so the distance grades survive untouched until the frame exists.
  const shown = openingFrameAdmissionPriority(entity, liveState);
  if (shown !== null) return shown;
  if (!liveState || liveState.mode !== 'flight') return 10;
  if (liveState.player && liveState.player.targetId === entity.id) return 2;
  if (entity.team === 1) return 3;
  if (entityIsOnscreen(entity, liveState)) return 4;
  // A hull the admission policy itself flags as due — inside the authored prefetch
  // disc, or closing inside the promote horizon — parked at rung 10 starves behind
  // every ambient arrival the serial queue keeps feeding (observed 93–281 s
  // 'loading' parks on inbound ships): its authored body lands only after the hull
  // crosses the glass. Grade it above ambient. Same pure predicate and horizon the
  // renderer's isEntityAuthoredUpgradeRelevant ends on (partsLibrary cannot import
  // renderer.js — the cycle is documented at authoredLiveTableCamera).
  // Payloads are hulls on the same horizon — the renderer's deadline classifier and the
  // readable-contact predicate both include them: a jettisoned pod towed into frame starves
  // identically at rung 10 while its capsule waits behind ambient work.
  if (entityRidesAuthoredRunway(entity)
      && willEntityEnterAuthoredUpgradeRunway(entity, liveState, {
        horizonSeconds: authoredRunwayHorizonSeconds(entity),
      })) return 5;
  return 10;
}

// Serial-lane authored riders the runway grade + bypass + release clauses all agree on.
// The set is exactly the entity types that feed enqueueBoundaryUpgrade's four producers
// (ship :2748, payload :2910, place-driven stations/fx/geology :3507/:3659) plus the
// wreck/drone types that mount the same packaged bodies through direct loadPart — vacuous
// but harmless members kept so the predicate names "authored packaged body" in one place.
function entityRidesAuthoredRunway(entity) {
  return !!(entity && (entity.type === 'ship' || entity.type === 'wreck'
    || entity.type === 'drone' || entity.type === 'station' || entity.type === 'payload'
    || entity.type === 'fx' || hasExplicitAuthoredGeologyPresentation(entity)));
}

function entityIsAuthoredRunwayInbound(entity, live) {
  return !!(entityRidesAuthoredRunway(entity) && live
    && willEntityEnterAuthoredUpgradeRunway(entity, live, {
      // Stations ride the decode runway (13.5s), hulls the promote horizon (7.5s) — a
      // station due inside its own runway but outside the promote horizon must still
      // grade inbound here or a wedged non-ship slot hides it behind the 120s stall bound.
      horizonSeconds: authoredRunwayHorizonSeconds(entity),
    }));
}

function authoredRuntimeState() {
  return globalThis && globalThis.window && globalThis.window.SF
    ? globalThis.window.SF.state || null
    : null;
}

// The first-flight guard protects leftover places and FX from linking into the opening picture.
// It must not park a combat/contact ship that has reached the readable glass: that leaves its
// zero-draw admission boundary (and the temporary marker) where a ship should be for 20 seconds.
// A complete NPC body can spend several seconds in decode and pipeline preparation. Start queued
// runway ships before the contact reaches the glass instead of making the player watch that work.
function firstFlightReadableContactKind(entity) {
  const type = entity && entity.type;
  if (type === 'ship' || type === 'station' || type === 'wreck'
      || type === 'drone' || type === 'payload' || type === 'asteroid'
      || type === 'beacon') return true;
  return type === 'place' && placeFileForEntity(entity) !== null;
}
function firstFlightClosingToward(entity, player, live) {
  const dx = Number(entity && entity.pos && entity.pos.x) - Number(player && player.pos && player.pos.x);
  const dz = Number(entity && entity.pos && entity.pos.z) - Number(player && player.pos && player.pos.z);
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance <= 0) return false;
  // Ledger rows carry their motion in the itinerary schedule — stored vel is zeroed — so
  // both reads go through the itinerary-aware lane; plain entities fall back to raw vel.
  const playerVel = closingVelocity(player, live);
  const entityVel = closingVelocity(entity, live);
  const relativeX = playerVel.x - entityVel.x;
  const relativeZ = playerVel.z - entityVel.z;
  return (dx * relativeX + dz * relativeZ) / distance > 0;
}
// The hold's own runway reach is narrower than the steady-state authored prefetch radius:
// the opening admits the contacts about to become readable (~700 WU at the reference
// table speed), while the wider prefetch horizon exists to pre-warm the decode pipeline.
// A refactor that fused the two radii let rim-band ambient work outrank true contacts.
const FIRST_FLIGHT_SHIP_ADMISSION_RADIUS_WU = 700;
function firstFlightReadableShipJob(job) {
  const live = authoredRuntimeState();
  const render = live && live.render;
  const entity = job && job.entity;
  const player = live && live.entities && typeof live.entities.get === 'function'
    ? live.entities.get(live.playerId)
    : null;
  const runwayDistance = planarRangeWU(entity, player);
  return !!(live && live.mode === 'flight' && render
    && Number.isFinite(render.firstPlayableFrameAt)
    && render.sectorShellAdmission !== true
    && entity && firstFlightReadableContactKind(entity) && entity.alive !== false
    // Submission includes a ship whose outline intersects the glass even when its pivot does
    // not. The frustum center-point helper can say false while its marker is already drawn.
    && (entityIsOnReadableGlass(entity) || entity.mesh?.visible === true
      || (entity.activity?.presentationTier === PRESENTATION_TIER.R1_RUNWAY
        && ((runwayDistance !== null && runwayDistance <= FIRST_FLIGHT_SHIP_ADMISSION_RADIUS_WU)
          || (firstFlightClosingToward(entity, player, live)
            && willEntityEnterAuthoredUpgradeRunway(entity, live, {
              // The normal ladder admits the same contact the moment its surface crosses the
              // authored prefetch radius with no closing requirement — a non-closing ship in
              // that rim band is a stand-in hole if the hold pins it shorter.
              radius: authoredPrefetchRadius(tableTravelSpeed(live)),
              horizonSeconds: TABLE_DECODE_RUNWAY_SECONDS,
            }))))));
}

// Same readable-glass test as the ship variant but type-agnostic: during the handoff
// hold an on-glass station/wreck/place job is also a literal hole in the picture
// (PQ-193.12 forbids drawing its procedural fallback), so it earns the pass behind any
// readable ship rather than waiting out the whole ~20s hold. The owner must still be a
// recognized authored contact — an artless place has nothing to draw, so deferring it
// costs the opening frame nothing while its decode work yields to real contacts.
function firstFlightReadableGlassJob(job) {
  const live = authoredRuntimeState();
  const render = live && live.render;
  const entity = job && job.entity;
  return !!(live && live.mode === 'flight' && render
    && Number.isFinite(render.firstPlayableFrameAt)
    && render.sectorShellAdmission !== true
    && entity && firstFlightReadableContactKind(entity) && entity.alive !== false
    && (entityIsOnReadableGlass(entity) || entity.mesh?.visible === true));
}

function scheduleHeldShipWake(state) {
  if (!state || state.retired || state.heldShipWakeTimer != null || state.jobs.length === 0) return;
  state.heldShipWakeTimer = setTimeout(() => {
    state.heldShipWakeTimer = null;
    scheduleNextUpgradeFrame(state);
  }, 100);
  state.heldShipWakeTimer.unref?.();
}

function firstFlightShipCanPassBusyPlace(state) {
  if (!state || state.firstFlightHandoffHold !== true || state.inFlight !== 1
      || !state.jobs.some(firstFlightReadableShipJob)) return false;
  const active = [...state.byBoundary.values()].filter((job) =>
    job.lifecycle === 'in-flight' && job.serialSlotReleased !== true);
  // A slow hub/place upload may remain in flight long after the opening shell has gone. Reserve
  // one additional serial ship slot for that case. A detached ship that already released its CPU
  // slot may still be linking GPU pipelines and must not block the next visible contact.
  return active.length === 1 && active[0].entity?.type !== 'ship';
}

// OWNER 2026-09-29 ("a ship will be a box and then it'll be a ship"): in steady flight the serial
// lane is concurrency 1, so one station / place / rock job — a trade hub is an 82 MB GLB whose
// decode has sat in flight for minutes (ledger D48) — held every ship behind it, and the player
// watched stand-ins for as long as it took. The first-flight hold already grants one extra ship
// slot past a busy non-ship job; steady flight gets the same grant for the body the player is
// already looking at (rung ≤ on-glass), widened to cover runway-inbound riders due inside
// their own horizon (a hull 6s out held behind a healthy 3-minute station decode still pops
// as a marker — the deadline is real even when the holder isn't stalled). Bounding the pass
// to active ≤ limit keeps at most one extra job riding beside one non-ship job, so the
// widened grant cannot chain composes the way the serial lane exists to prevent. The glass
// law is type-agnostic — the loading hold and the late-present throttle already exempt ANY
// on-glass body — so an on-glass or inbound station/place earns the pass the same way a
// ship does, while the in-flight guard keeps the serial ship invariant intact.
const STEADY_SHIP_PASS_MAX_PRIORITY = 1.5;
// The request side admits broad (any glassR+visual crossing inside the runway posts a job);
// a transient graze that never reaches the authored window leaves a queued job consuming a
// serial slot for a dead compose+residency cycle. Re-grade runway-class jobs once more at
// admit: unless the job carries glass law (admissionVisible, urgent grade, or already on
// readable glass), evict it when the tight grade-side predicate says the entity is no longer
// inbound — graded at a widened horizon so a rim-skimming borderline keeps its slot instead
// of oscillating out and re-arming the whole request a poll later.
const ADMIT_REGRADE_HORIZON_GRACE = 1.5;
// ~2x the residency poll cadence: inside this window the request side declines to re-post a
// boundary whose job the re-grade just evicted, while the same keep clauses still fail — a
// sustained rim-grazer otherwise repeats post→prime→evict on every poll.
const AUTHORED_REGRADE_REPOST_COOLDOWN_MS = 500;
function runwayWantedDomain(entity, { admissionVisible = false, priority = Infinity } = {}) {
  if (!entityRidesAuthoredRunway(entity)) return true;
  if (admissionVisible === true) return true;
  if (priority <= STEADY_SHIP_PASS_MAX_PRIORITY) return true;
  const live = authoredRuntimeState();
  if (!live || live.mode !== 'flight') return true;
  if (entityIsOnReadableGlass(entity, live)) return true;
  // Unmeasurable geometry is not evidence of departure — keep the slot rather than
  // evict a job the predicate simply cannot grade (no pos on either end).
  const player = live.entities && live.playerId != null ? live.entities.get(live.playerId) : live.player;
  if (!entity.pos || !(player && player.pos)) return true;
  return willEntityEnterAuthoredUpgradeRunway(entity, live, {
    horizonSeconds: authoredRunwayHorizonSeconds(entity) * ADMIT_REGRADE_HORIZON_GRACE,
  });
}
function jobRunwayRegradeStillWanted(state, job) {
  return runwayWantedDomain(job && job.entity, {
    admissionVisible: !!(job && job.options && job.options.admissionVisible === true),
    priority: authoredUpgradePriority(job),
  });
}
// A rim-grazer oscillating across the runway horizon reposts → primes → evicts → restores at
// ~1-2/s forever: the request-side cooloff only binds while the keep domain still fails, and
// an entity inside the horizon always qualifies. `runwayWantedDomain` minus its horizon
// clause is the hard-evidence floor a capped boundary's repost must clear — real need
// (admissionVisible, steady priority, actual glass) posts; drift alone does not.
const AUTHORED_REGRADE_REPOST_MAX = 3;
// The cap exists for a sustained repost/refuse churn inside one oscillation episode; episodes
// are separated by minutes, so a refusal history older than this window no longer counts —
// otherwise two distant grazes permanently demote every later approach to glass-time admission.
const AUTHORED_REGRADE_RESTORE_DECAY_MS = 30000;
function runwayWantedBeyondHorizon(entity, { admissionVisible = false, priority = Infinity } = {}) {
  if (!entityRidesAuthoredRunway(entity)) return true;
  if (admissionVisible === true) return true;
  if (priority <= STEADY_SHIP_PASS_MAX_PRIORITY) return true;
  const live = authoredRuntimeState();
  if (!live || live.mode !== 'flight') return true;
  if (entityIsOnReadableGlass(entity, live)) return true;
  const player = live.entities && live.playerId != null ? live.entities.get(live.playerId) : live.player;
  return !entity.pos || !(player && player.pos);
}
// An evicted job cleans up synchronously, but nothing downstream of the request remembers the
// verdict — the next residency poll would re-post the same boundary immediately. Stamp the
// boundary so the request side cools off while the same keep clauses still fail.
function armRegradeEvictCooloff(job) {
  const boundary = job && job.boundary;
  if (boundary && boundary.userData) boundary.userData.upgradeRegradeEvictedAt = monotonicNow();
}
function queuedGlassLawJobStillNeeded(state, job) {
  return !!(job && job.entity && jobStillNeeded(state, job)
    && (authoredUpgradePriority(job) <= STEADY_SHIP_PASS_MAX_PRIORITY
      // Runway-inbound riders grade nearly-on-glass for the pass too: a hull due inside
      // the promote horizon held behind a wedged non-ship crosses the glass as a marker
      // long before the 120s stall bound — the pop the runway grade exists to prevent.
      || entityIsAuthoredRunwayInbound(job.entity, authoredRuntimeState())));
}
function steadyFlightShipCanPassBusyPlace(state) {
  if (!state || state.firstFlightHandoffHold === true || state.openingHandoffHold === true
      || state.inFlight < 1) return false;
  const live = authoredRuntimeState();
  if (!live || live.mode !== 'flight') return false;
  if (!state.jobs.some((job) => queuedGlassLawJobStillNeeded(state, job))) return false;
  const active = [...state.byBoundary.values()].filter((job) =>
    job.lifecycle === 'in-flight' && job.serialSlotReleased !== true);
  // Bound the grant to one overlap: a granted pass leaves the lane over-full only while the
  // extra job still holds a serial slot, so demanding active ≤ limit makes the pass single-shot.
  // Without it, a run of non-ship ≤1.5 jobs (critical hubs rung ahead of everything) keeps
  // `every(non-ship)` true forever and chains N full composes — the measured combat stall the
  // serial lane exists to prevent.
  return active.length > 0 && active.length <= authoredUpgradeConcurrencyLimit()
    && active.every((job) => job.entity?.type !== 'ship');
}

// Steady flight runs the serial lane at concurrency 1, so a job whose inner await never settles
// (a wedged decode/transcode/residency park — the critical-hub job sat in flight ~11 min behind
// place_station_trade_hub.glb and starved every combat ship queued behind it) would block the
// lane for the rest of the session. Past this bound the same one-extra-slot escape the
// first-flight hold grants applies in steady flight too — for every in-flight job, ship or not,
// that has outlived any plausible upload window.
const AUTHORED_UPGRADE_NONSHIP_STALL_MS = AUTHORED_ASYNC_DEADLINE_MS;
// The bypass feeds on-glass holes only: a body already drawn as a marker cannot wait the
// ambient stall bound behind a wedged job. The serial-slot invariant still only yields to
// dead lanes — this tightens how long 'plausibly alive' lasts when the picture is missing.
const AUTHORED_UPGRADE_GLASS_STALL_BYPASS_MS = 30000;
// Stall aborts re-admit for a fresh decode; a genuinely wedged decoder produces the same hang
// every cycle, so the abort+re-admit loop is capped and the boundary settles on its fallback.
const AUTHORED_UPGRADE_STALL_ABORT_LIMIT = 3;
const STALLED_HOG_WAKE_MS = 5000;

function jobIsStalledInFlight(job, nowMs, boundMs = AUTHORED_UPGRADE_NONSHIP_STALL_MS) {
  if (!job || job.lifecycle !== 'in-flight') return false;
  const startedAt = Number(job.inFlightAtMs);
  return Number.isFinite(startedAt) && nowMs - startedAt >= boundMs;
}

function queuedShipJobStillNeeded(state, job) {
  return !!(job && job.entity && job.entity.type === 'ship' && jobStillNeeded(state, job));
}

/**
 * One queued on-glass body may pass the concurrency cap while every unreleased in-flight job is
 * stalled past the bound. The admit path hoists the needed job to the head when it fires (the
 * stallBypassShipPass marker), so a stale hog can never farm the lane behind ordinary dressing
 * jobs, and a live ship admission still blocks the bypass — the serial ship invariant only
 * yields to dead lanes.
 */
function stalledHogsCanPassShip(state) {
  if (!state || state.firstFlightHandoffHold === true || state.openingHandoffHold === true) {
    return false;
  }
  if (!state.jobs.some((job) => queuedGlassLawJobStillNeeded(state, job))) return false;
  const active = [...state.byBoundary.values()].filter((job) =>
    job.lifecycle === 'in-flight' && job.serialSlotReleased !== true);
  if (!active.length) return false;
  const now = monotonicNow();
  return active.every((job) => jobIsStalledInFlight(job, now, AUTHORED_UPGRADE_GLASS_STALL_BYPASS_MS));
}

/**
 * The queue only re-enters on a scheduled frame, and a wedged in-flight job never schedules one —
 * poll at a slow cadence while any in-flight job exists so the stall bypass can fire once the
 * bound is crossed and its diagnostic can close on schedule.
 */
function armStalledHogWake(state) {
  // Owns its own timer field: scheduleHeldShipWake's 100ms wake must never wait behind this
  // slow poll, and either callback re-arms what it still needs via scheduleNextUpgradeFrame.
  if (!state || state.retired) return;
  // Overlap releases only the CPU slot. Its detached GPU work still needs owner/deadline
  // cancellation until the admission actually settles.
  const active = [...state.byBoundary.values()].filter((job) =>
    job.lifecycle === 'in-flight'
    && (job.serialSlotReleased !== true
      || job.upgradeDiagnostic?.endedAtMs == null
      || !(job.boundary && job.boundary.userData
        && authoredCommittedBoundaryStatus(job.boundary.userData.authoredAssetState))));
  if (!active.length) {
    if (state.stalledHogWakeTimer != null) clearTimeout(state.stalledHogWakeTimer);
    state.stalledHogWakeTimer = null;
    return;
  }
  if (state.stalledHogWakeTimer != null) return;
  state.stalledHogWakeTimer = setTimeout(() => {
    state.stalledHogWakeTimer = null;
    abortStalledOrInactiveUpgradeJobs(state);
    scheduleNextUpgradeFrame(state);
  }, STALLED_HOG_WAKE_MS);
  state.stalledHogWakeTimer.unref?.();
}

/**
 * Abort the actual admission, rather than only closing its diagnostic. The admission race
 * settles the completion and releases its serial slot even when the underlying await wedges.
 * The poll also notices owners that leave while no decode/compile promise makes progress.
 * A job stalled past the glass bound while its owner sits on the readable glass — or past the
 * non-ship bound anywhere — is abandoned (its decode/transcode wedged, a lane that can
 * otherwise block for the session, ledger D48's 11-minute critical-hub): the manual abort
 * marks the boundary for readmission so the ordinary relevance poll re-requests it at its
 * natural rung; url::slot decode dedupe makes the re-entry share whatever the wedged attempt
 * already decoded, and a late settle of the abandoned promise is a bookkeeping no-op —
 * the job is already out of byBoundary/byKey and its completion is settled.
 */
function abortStalledOrInactiveUpgradeJobs(state) {
  const now = monotonicNow();
  for (const job of state.byBoundary.values()) {
    if (job.lifecycle !== 'in-flight' || !job.admission || job.admission.signal.aborted) continue;
    if (!job.isAdmissionOwnerActive()) {
      job.admission.abort('Authored visual preparation owner became inactive');
    } else if (jobIsStalledInFlight(job, now)) {
      // The stall verdict closes the job's 'running' diagnostic on schedule — an aborted
      // job's completion settles 'aborted-stalled' while its record keeps the watchdog
      // verdict, and a still-live job stalls only the record, never healthy in-flight work.
      if (job.upgradeDiagnostic && job.upgradeDiagnostic.status === 'running') {
        job.upgradeDiagnostic.status = 'stalled-slot-released';
      }
      finishUpgradeDiagnostic(state, job, job.upgradeDiagnostic);
      const bound = entityIsOnReadableGlass(job.entity)
        ? AUTHORED_UPGRADE_GLASS_STALL_BYPASS_MS
        : AUTHORED_UPGRADE_NONSHIP_STALL_MS;
      // A job whose serial slot already released is parked in detached GPU prep — aborting it
      // rescues nothing (the slot is free) and would re-mark its 'authored-prepared' boundary
      // 'awaiting-authored-admission', duplicating the whole compose+compile+upload it already
      // paid. That protection only holds while the boundary actually reached a committed state:
      // a released job wedged earlier ('loading'/'compiling-pipelines') pins its promise past the
      // readmission gate — neither status is a READMISSION status — leaving a permanent resolving
      // marker on glass (observed 278 s parked on readable glass). Abort those the same as an
      // unreleased job so the relevance poll re-requests the boundary.
      const releasedButUncommitted = job.serialSlotReleased === true
        && !(job.boundary && job.boundary.userData
          && authoredCommittedBoundaryStatus(job.boundary.userData.authoredAssetState));
      if ((job.serialSlotReleased !== true || releasedButUncommitted)
          && jobIsStalledInFlight(job, now, bound)) {
        abortStalledUpgradeJob(state, job);
      }
    }
  }
}

function abortStalledUpgradeJob(state, job) {
  if (!job || job.lifecycle !== 'in-flight') return false;
  job.lifecycle = 'aborted-stalled';
  job.abortedStalled = true;
  // The promise's own finally skips the serial decrement once serialSlotReleased reads true —
  // single accounting, even though the abandoned run settles whenever it unwinds. A job whose
  // slot already released must not decrement twice (the settle watchdog now also aborts those
  // when their boundary never committed).
  if (job.serialSlotReleased !== true) state.inFlight = Math.max(0, state.inFlight - 1);
  job.serialSlotReleased = true;
  cleanupQueuedJob(state, job);
  // The abandoned run may sit on a decoder task that will never settle — every later request
  // deduping onto it wedges identically. Drop the unfinished task entries (and the boundary's
  // pending requests on them) so the readmission decodes fresh.
  dropWedgedAuthoredTasks(job.renderer, authoredUpgradeAssetUrls(job), job.boundary);
  const abortCount = (Number(job.boundary && job.boundary.userData.stallAbortCount) || 0) + 1;
  if (job.boundary && job.boundary.userData) job.boundary.userData.stallAbortCount = abortCount;
  if (job.boundary && job.boundary.parent && abortCount <= AUTHORED_UPGRADE_STALL_ABORT_LIMIT) {
    markAuthoredBoundaryForReadmission(job.boundary, 'upgrade-stall-abort');
  } else if (job.boundary && job.boundary.parent) {
    // Genuine decoder wedge: re-decoding produced the same hang every cycle — cap the retry
    // loop and settle the boundary on its fallback rather than burning decode slots forever.
    job.boundary.userData.authoredAssetState = 'unavailable';
    job.boundary.userData.authoredFailureReason = 'upgrade-stall-abort-cap';
    setPresentationAdmission(job.entity, PRESENTATION_ADMISSION.unavailable);
  } else if (job.boundary && job.boundary.userData) {
    // A detached boundary can't mark-readmit (nothing polls a detached owner), but it may
    // remount later — leave it re-requestable: 'aborted-stalled' is in no readmission set and
    // the stale authoredUpgradePromise would short-circuit every future request.
    delete job.boundary.userData.authoredUpgradePromise;
    job.boundary.userData.authoredAssetState = 'awaiting-authored-admission';
    job.boundary.userData.authoredReadmissionReason = 'upgrade-stall-abort-detached';
  }
  settleUpgradeJob(job, 'aborted-stalled');
  scheduleNextUpgradeFrame(state);
  return true;
}

export function cancelAuthoredUpgradeQueue(scene, reason = 'scene-retired') {
  const state = scene && upgradeQueuesByScene.get(scene);
  if (!state) return false;
  state.retired = true;
  upgradeQueuesByScene.delete(scene);
  invalidateScheduledUpgradeFrame(state);
  if (state.heldShipWakeTimer != null) {
    clearTimeout(state.heldShipWakeTimer);
    state.heldShipWakeTimer = null;
  }
  if (state.stalledHogWakeTimer != null) {
    clearTimeout(state.stalledHogWakeTimer);
    state.stalledHogWakeTimer = null;
  }
  for (const job of [...state.jobs]) {
    const index = state.jobs.indexOf(job);
    if (index >= 0) state.jobs.splice(index, 1);
    cancelQueuedJob(state, job);
  }
  for (const job of [...state.byBoundary.values()]) {
    if (job && job.lifecycle === 'in-flight' && job.admission && !job.admission.signal.aborted) {
      job.admission.abort(reason);
    }
  }
  state.running = state.inFlight > 0 || state.diagnostics.activeJobs > 0;
  publishUpgradeDiagnostics(state);
  return true;
}

const _deadlineGlassDelta = { x: 0, z: 0 };

function entityOnDeadlineGlass(entity, state) {
  if (!entity || entity.alive === false || !state) return false;
  if (entity.activity && entity.activity.presentationTier === PRESENTATION_TIER.R0_GLASS) return true;
  const frame = state.render && state.render.activityFrame;
  const glassIds = frame && frame.renderGlassIds;
  if (glassIds && typeof glassIds.has === 'function' ? glassIds.has(entity.id)
      : Array.isArray(glassIds) && glassIds.includes(entity.id)) return true;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : (state.entityList || []).find((candidate) => candidate && candidate.id === state.playerId);
  if (!player || !player.pos || !entity.pos) return false;
  const cam = tableCameraEnvelope(state);
  const glass = glassHalfExtents(cam.zoom, cam.fov, cam.aspect, cam.tilt);
  const delta = tableLookAtDelta(state, player.pos, entity.pos, _deadlineGlassDelta);
  return classifyTableBand({
    dx: delta.x,
    dz: delta.z,
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: 0,
    radius: entityPresenceRadius(entity),
  }) === TABLE_BAND.GLASS;
}

export function waitForOpeningGraphPublicationRelease(options = {}) {
  const render = authoredRuntimeState()?.render;
  if (options.expectedRender && options.expectedRender !== render) {
    const error = new Error('Opening graph publication gate owner became inactive');
    error.name = 'AbortError';
    return Promise.reject(error);
  }
  if (options.asyncAdmission?.signal.aborted) {
    return Promise.reject(options.asyncAdmission.signal.reason);
  }
  if (!render || render.openingGraphPublicationFrozen !== true) return null;
  const entity = options && options.entity;
  const postFirstPicture = Number.isFinite(render.firstPlayableFrameAt);
  if (entity && postFirstPicture && entityOnDeadlineGlass(entity, authoredRuntimeState())) {
    return null;
  }
  const wait = render.waitForOpeningGraphPublicationRelease;
  if (typeof wait !== 'function') {
    return Promise.reject(new Error('Opening graph publication is frozen without a release boundary'));
  }
  const generation = render.admissionRunGeneration;
  const nativeRenderer = render.renderer !== undefined ? render.renderer : undefined;
  const assertGateOwnerCurrent = () => {
    assertQueuedAuthoredAdmissionActive(options, 'during-opening-publication');
    if (authoredRuntimeState()?.render !== render) {
      const error = new Error('Opening graph publication gate owner became inactive');
      error.name = 'AbortError';
      throw error;
    }
    if (nativeRenderer !== undefined && render.renderer !== nativeRenderer) {
      const error = new Error('Opening graph publication gate owner became inactive');
      error.name = 'AbortError';
      throw error;
    }
    if (generation !== undefined && render.admissionRunGeneration !== generation) {
      const error = new Error('Opening graph publication gate outlived its renderer generation');
      error.name = 'AbortError';
      throw error;
    }
  };
  const released = waitForAuthoredAdmission(Promise.resolve(wait.call(render)).then((value) => {
    assertGateOwnerCurrent();
    return value;
  }), options);
  if (!entity || !postFirstPicture) return released;
  let settled = false;
  return new Promise((resolve, reject) => {
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    released.then((value) => {
      if (settled) return;
      try {
        assertGateOwnerCurrent();
      } catch (error) {
        finish(reject, error);
        return;
      }
      finish(resolve, value);
    }, (error) => finish(reject, error));
    const recheck = () => {
      if (settled) return;
      const live = authoredRuntimeState();
      if (!live || live.render !== render) {
        const error = new Error('Opening graph publication gate owner became inactive');
        error.name = 'AbortError';
        finish(reject, error);
        return;
      }
      try {
        assertGateOwnerCurrent();
      } catch (error) {
        finish(reject, error);
        return;
      }
      if (render.openingGraphPublicationFrozen !== true
          || entityOnDeadlineGlass(entity, authoredRuntimeState())) {
        finish(resolve, undefined);
        return;
      }
      armCallbackAfterPresent(recheck);
    };
    recheck();
  });
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
  if (entity.isPlayer === true
      || isCriticalHubInCurrentSector(entity, liveState.world && liveState.world.currentSectorId)) return true;
  if (liveState.mode !== 'flight') return false;
  if (liveState.player && liveState.player.targetId === entity.id) return true;
  // Spatial prefetch (requestAuthoredUpgrade) owns flight decode. First-render
  // on-glass auto-compose is the empty-slot hitch.
  return false;
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

export function residencyOptionsForBoundary(entity, boundary, renderer) {
  const liveState = authoredRuntimeState();
  const render = liveState && liveState.render;
  const nativeRenderer = render && render.renderer;
  const generation = render && render.admissionRunGeneration;
  const ownerActive = () => !!boundary && !!entity && entity.alive !== false
    && (!render || (authoredRuntimeState() === liveState && liveState.render === render
      && render.renderer === nativeRenderer && render.admissionRunGeneration === generation));
  // A save/load or teardown can replace these ports while a decoded body is still waiting.
  // Keep the original owner and cancel its continuation instead of invoking the new renderer
  // or throwing a TypeError because the old port has been removed.
  const capturePort = (name) => {
    const port = render && render[name];
    if (typeof port !== 'function') return null;
    const isActive = () => ownerActive() && render[name] === port;
    const assertActive = () => {
      if (isActive()) return;
      const error = new Error(`Authored ${name} owner became inactive`);
      error.name = 'AbortError';
      throw error;
    };
    return { isActive, call(...args) {
      assertActive();
      const result = port.apply(render, args);
      if (result && typeof result.then === 'function') {
        return result.then((value) => { assertActive(); return value; });
      }
      assertActive();
      return result;
    } };
  };
  const compile = capturePort('compileObjectPipelines');
  const touch = capturePort('touchSubjectExactTarget');
  const residency = capturePort('prepareAuthoredGpuResidency');
  const present = capturePort('yieldToNextPresent');
  const data = entity && entity.data || {};
  const sectorId = data.sectorId || entity && entity.homeSectorId
    || liveState && liveState.world && liveState.world.currentSectorId
    || null;
  if (boundary && boundary.userData && renderer) {
    // Each admission request is a fresh epoch: a stale run's late settle must not release the
    // owner's slots under the replacement job, and a boundary whose previous epoch released
    // residency revives here — a dead-owner mark would otherwise strand every re-admission.
    boundary.userData.admissionEpoch = (Number(boundary.userData.admissionEpoch) || 0) + 1;
    const residencyRegistry = getAssetResidency(renderer);
    if (residencyRegistry && typeof residencyRegistry.reviveOwner === 'function') {
      residencyRegistry.reviveOwner(boundary);
    }
    boundary.userData.releaseAuthoredAssetResidency = (reason = 'boundary-disposed') => (
      releaseBoundaryResidency(renderer, boundary, reason)
    );
  }
  return {
    residencyOwner: boundary,
    admissionEpoch: boundary && boundary.userData
      ? (Number(boundary.userData.admissionEpoch) || 0) : 0,
    residencyRole: entity && entity.isPlayer === true ? 'player' : 'current-sector',
    sectorId,
    isResidencyOwnerActive: ownerActive,
    prepareAuthoredPipelines: compile
      // A boundary whose owner sits on the readable glass when its compile is
      // finally admitted is deadline work — it rides the urgent lane ahead of
      // queued runway/prefetch compiles instead of joining the ambient FIFO
      // behind them (D38). Evaluated at call time so a body that crossed the
      // glass while its job waited still promotes; loading-mode admissions keep
      // the ambient lane because the opening submission plan owns that order.
      ? async (root) => {
          const st = authoredRuntimeState();
          const onGlass = !!(st && st.mode === 'flight'
            && entityIsOnscreen(boundaryLiveEntity(boundary, entity), st));
          return compile.call(root, { urgent: onGlass, debugBy: 'authored-prepare', isActive: compile.isActive });
        }
      : null,
    touchAuthoredExactTarget: touch
      ? (root) => touch.call(root)
      : null,
    prepareAuthoredGpuResidency: residency
      ? async (root, admissionOptions = {}) => {
          const st = authoredRuntimeState();
          // Same lane rule for the texture/geometry upload pass: unSliced puts
          // the uploads on the urgent residency chain instead of behind ambient
          // uploads already queued there.
          const onGlass = !!(st && st.mode === 'flight'
            && entityIsOnscreen(boundaryLiveEntity(boundary, entity), st));
          return residency.call(root, {
            isActive: () => residency.isActive()
              && (typeof admissionOptions.isResidencyOwnerActive !== 'function'
                || admissionOptions.isResidencyOwnerActive()),
            unSliced: admissionOptions.unSliced === true || onGlass,
          });
        }
      : null,
    overlapAuthoredPipelineCompile: !!(liveState && liveState.mode !== 'flight'),
    yieldBetweenGpuStages: !!(liveState && liveState.mode === 'flight'),
    yieldToNextPresent: present
      ? async () => present.call()
      : null,
  };
}

function rootHiddenByAncestor(root) {
  for (let node = root && root.parent; node; node = node.parent) {
    if (node.visible === false) return true;
  }
  return false;
}

const _glassDelta = { x: 0, z: 0 };
const _glassDelta2 = { x: 0, z: 0 };

// Mirror of the renderer-side liveTableCamera defaults (zoom 144, fov 50, tilt 60, 16:9):
// the authored queue reads window.SF.state only, so the table math is replicated here rather
// than imported through a partsLibrary -> renderer cycle.
function authoredLiveTableCamera(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  return {
    zoom: Number.isFinite(live) ? live : (Number.isFinite(requested) ? requested : 144),
    fov: Number.isFinite(camera.fov) ? camera.fov
      : (Number.isFinite(video.fov) ? video.fov : 50),
    tilt: Number.isFinite(camera.tilt) ? camera.tilt : 60,
    aspect: Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9,
  };
}

function entityIsExplicitRenderFocus(entity, state) {
  if (!entity || !state) return false;
  if (entity.id === state.playerId || entity.isPlayer === true) return true;
  if (entity.flags && (entity.flags.forceRender || entity.flags.neverCull)) return true;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const targetId = state.player && state.player.targetId != null
    ? state.player.targetId
    : player && player.targetId;
  return targetId != null && entity.id === targetId;
}

/**
 * The renderer's readable-glass law, replicated for the authored queue: tier, explicit focus,
 * then the geometric band. The activity tier trails the camera by a whole classification pass,
 * so a body whose hull already intersects the glass — but whose R0 tier has not caught up —
 * used to sit at background priority and the player watched its stand-in. The geometric test
 * answers that case at once.
 */
function entityIsOnAuthoredGlassBand(entity, live) {
  if (!entity || entity.alive === false || !live) return false;
  const activity = entity.activity || {};
  if (activity.presentationTier === PRESENTATION_TIER.R0_GLASS) return true;
  // Strictly geometric — no explicit-focus term. Player/target-lock bodies carry their own
  // rungs (player 0, locked target 2); counting them "on the glass" here would let an
  // off-glass locked wreck tie the bodies actually in the picture at 1.5.
  const player = live.entities && typeof live.entities.get === 'function'
    ? live.entities.get(live.playerId)
    : null;
  if (!player || !player.pos || !entity.pos) return false;
  // Same camera proof the opening-frame rung requires: the live picture or the zoom it is
  // opening toward. The player's requested wheel alone proves nothing yet — an uncomposed
  // camera leaves the arrival distance grades untouched by design.
  const camera = live.camera || {};
  const liveZoom = Number(camera.liveZoom);
  const composed = Number(camera.composedZoom);
  const zoom = Number.isFinite(liveZoom) || Number.isFinite(composed)
    ? Math.max(Number.isFinite(liveZoom) ? liveZoom : 0, Number.isFinite(composed) ? composed : 0)
    : null;
  if (!(zoom > 0)) return false;
  const video = live.settings && live.settings.video || {};
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const glass = glassHalfExtents(zoom, fov, aspect, tilt);
  const delta = tableLookAtDelta(live, player.pos, ledgerAwarePos(entity, live), _glassDelta2);
  const band = classifyTableBand({
    dx: delta.x,
    dz: delta.z,
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: TABLE_FRAME_SKIRT_WU,
    radius: entityVisualCullRadius(entity, entity.mesh),
  });
  return band === TABLE_BAND.GLASS || band === TABLE_BAND.RUNWAY;
}

function entityIsOnReadableGlass(entity, state = undefined) {
  if (!entity || entity.alive === false) return false;
  const activity = entity.activity || {};
  if (activity.presentationTier === PRESENTATION_TIER.R0_GLASS) return true;
  const live = state || authoredRuntimeState();
  if (!live) return false;
  if (entityIsExplicitRenderFocus(entity, live)) return true;
  const player = live.entities && typeof live.entities.get === 'function'
    ? live.entities.get(live.playerId)
    : null;
  if (!player || !player.pos || !entity.pos) return false;
  const cam = authoredLiveTableCamera(live);
  const glass = glassHalfExtents(cam.zoom, cam.fov, cam.aspect, cam.tilt);
  const delta = tableLookAtDelta(live, player.pos, ledgerAwarePos(entity, live), _glassDelta);
  const band = classifyTableBand({
    dx: delta.x,
    dz: delta.z,
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: TABLE_FRAME_SKIRT_WU,
    radius: entityVisualCullRadius(entity, entity.mesh),
  });
  return band === TABLE_BAND.GLASS || band === TABLE_BAND.RUNWAY;
}

// entityIsOnscreen runs inside the upgrade-queue sort comparator — O(jobs·log jobs)
// comparisons per admit — so its projection/frustum/sphere scratch is module-scoped
// instead of allocated per call. It never re-enters: nothing it calls reads these.
const _onscreenProjection = new THREE.Matrix4();
const _onscreenFrustum = new THREE.Frustum();
const _onscreenCenter = new THREE.Vector3();
const _onscreenSphere = new THREE.Sphere();

export function entityIsOnscreen(entity, state) {
  const root = entity && entity.mesh;
  if (!root || root.visible === false || rootHiddenByAncestor(root)) {
    // No visible mesh yet (direct-admission substrate, queued build): the activity
    // frame already decides glass membership every tick, so an R0 entity is onscreen
    // by definition. Returning false here parks the exact ships the player is looking
    // at at background priority behind offscreen queue filler.
    return entityIsOnReadableGlass(entity);
  }
  const camera = state && state.render && state.render.camera;
  if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return true;
  try {
    camera.updateMatrixWorld(true);
    root.updateWorldMatrix(true, false);
    _onscreenProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _onscreenFrustum.setFromProjectionMatrix(_onscreenProjection);
    // Sphere, not point: a big authored body is onscreen while its centre is off it.
    const presence = entityVisualCullRadius(entity, root);
    root.getWorldPosition(_onscreenCenter);
    _onscreenSphere.center.copy(_onscreenCenter);
    _onscreenSphere.radius = Math.max(presence, 0.001);
    return _onscreenFrustum.intersectsSphere(_onscreenSphere);
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

// The ship plan walk re-derives the same manifest for every call site of one
// admission (asset urls, byte estimate, cache status, request list) — memoize
// per job. A job's entity and options are fixed at mint, so freezing the first
// derivation also keeps a mid-job entity mutation from tearing the call sites.
const authoredPlanMemo = new WeakMap();

function authoredUpgradePlan(job) {
  const entity = job && job.entity;
  if (!entity) return {};
  const cached = authoredPlanMemo.get(job);
  if (cached) return cached;
  const plan = entity.type === 'ship'
    ? authoredPreloadPlanForEntity(entity, job.options || {})
    : (() => {
      const placeFile = placeFileForEntity(entity);
      return placeFile ? { place: [placeFile] } : {};
    })();
  authoredPlanMemo.set(job, plan);
  return plan;
}

function authoredUpgradeAssetUrls(job) {
  if (job && Array.isArray(job.assetUrls)) return [...new Set(job.assetUrls.filter(Boolean).map(String))];
  const partRoot = isReleaseAssetMode(job && job.options || {}) ? PART_RELEASE_ROOT : PART_ROOT;
  return Object.values(authoredUpgradePlan(job)).flat().map((file) => `${partRoot}${file}`);
}

/** URL+slot pairs a queued job will decode at admission — keyed exactly like the real load calls
 * (`${url}::${slot}`) so a warm prefetch settles into the runtime task cache, not a parallel copy. */
function authoredUpgradeAssetRequests(job) {
  const entity = job && job.entity;
  const requests = [];
  const seen = new Set();
  const push = (slot, url) => {
    if (typeof url !== 'string' || !url) return;
    const key = `${url}::${slot || '*'}`;
    if (seen.has(key)) return;
    seen.add(key);
    requests.push({ url, slot });
  };
  if (job && Array.isArray(job.assetUrls) && job.assetUrls.length) {
    // Explicit lists are how payload jobs declare their file; the decode slot is the entity's
    // authored payload slot so the prefetch lands on the same task key the capsule load uses.
    const slot = entity && hasExplicitAuthoredPayloadPresentation(entity)
      ? authoredPayloadSlotForEntity(entity)
      : null;
    for (const url of job.assetUrls) push(slot, String(url));
    return requests;
  }
  const partRoot = isReleaseAssetMode(job && job.options || {}) ? PART_RELEASE_ROOT : PART_ROOT;
  for (const [slot, files] of Object.entries(authoredUpgradePlan(job))) {
    for (const file of files || []) push(slot, `${partRoot}${file}`);
  }
  const overlay = entity ? tradeHubOverlayFileForEntity(entity) : null;
  if (overlay) push('place', `${partRoot}${overlay}`);
  return requests;
}

/** Same bound as assetLoader.preloadAuthoredParts: two files in flight, not the whole plan
 * at once and not one-after-another. The shared decode budget still caps real workers. */
export const AUTHORED_PREFETCH_DEPTH = 2;

/** Start `depth` loads at a time. Wall time tracks the slowest wave, not the sum of every file. */
export function prefetchAuthoredAssetRequests(requests, loadOne, depth = AUTHORED_PREFETCH_DEPTH) {
  const list = Array.isArray(requests) ? requests : [];
  if (!list.length || typeof loadOne !== 'function') return Promise.resolve();
  const width = Math.max(1, Math.min(list.length, Math.floor(Number(depth)) || 1));
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      await loadOne(list[index], index);
    }
  };
  const tasks = [];
  for (let i = 0; i < width; i += 1) tasks.push(worker());
  return Promise.all(tasks).then(() => undefined);
}

/** Warm the runtime decode cache for one queued job. Ships keep the full library path; every other
 * authored body (place/station/fx/payload, wreck/kit plans) only needs its own files resident. */
function startAuthoredJobAssetPrefetch(job) {
  const entity = job && job.entity;
  if (!entity || !job.renderer) return null;
  const options = job.options || {};
  // A cancelled job's prefetch chain keeps running — and its late retainLibraryPlan revives a
  // released owner whenever the owner predicate says active, which is entity-alive rather than
  // job-aware. Compose it with job liveness so a dead job's late retain fails closed instead of
  // undoing the release cancelQueuedJob just performed.
  const baseOwnerActive = typeof options.isResidencyOwnerActive === 'function'
    ? options.isResidencyOwnerActive : null;
  // Compose unconditionally: request sites that omit the predicate default to "active" inside
  // the loader, so without the wrap a cancelled job's late retain still revives its owner.
  const jobScopedOptions = { ...options,
      isResidencyOwnerActive: () =>
        (job.lifecycle === 'queued' || job.lifecycle === 'in-flight')
        && (baseOwnerActive ? baseOwnerActive() : true) };
  if (entity.type === 'ship') {
    return preloadAuthoredAssetsForEntity(job.renderer, entity, jobScopedOptions);
  }
  const requests = authoredUpgradeAssetRequests(job);
  if (!requests.length) return null;
  const loadPart = typeof options.loadAuthoredPart === 'function' ? options.loadAuthoredPart : loadAuthoredPart;
  // Fan the requests out through the bounded prefetch pool: the slowest request, not their
  // sum, is the honest wait, and the depth cap keeps a place+overlay job's tail bounded.
  return prefetchAuthoredAssetRequests(requests, (request) => loadPart(request.url, {
    renderer: job.renderer,
    slot: request.slot,
    optional: true,
    residencyOwner: options.residencyOwner,
    residencyRole: options.residencyRole,
    sectorId: options.sectorId,
    isResidencyOwnerActive: jobScopedOptions.isResidencyOwnerActive,
    admissionVisible: options.admissionVisible,
  }));
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
  return libraryHasPreloadPlan(library, authoredUpgradePlan(job), job && job.renderer) ? 'hit' : 'miss';
}

function cleanupQueuedJob(state, job) {
  if (state.byBoundary.get(job.boundary) === job) state.byBoundary.delete(job.boundary);
  if (state.byKey.get(job.key) === job) state.byKey.delete(job.key);
}

function cancelQueuedJob(state, job) {
  if (!job || job.lifecycle === 'in-flight' || job.lifecycle === 'settled') return false;
  job.lifecycle = 'cancelled';
  cleanupQueuedJob(state, job);
  // Epoch-guarded: a cancel landing after the boundary already re-admitted must not free the
  // replacement epoch's retains — releaseBoundaryResidency skips when epochs differ.
  releaseBoundaryResidency(job && job.renderer, job && job.boundary, 'upgrade-job-cancelled',
    job && job.options && job.options.admissionEpoch);
  if (job.boundary) releaseOwnerInstances(job.boundary, job.options && job.options.admissionEpoch);
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
  // PQ-129.19 handles the ONE huge handoff compose through the separate loading-owned cohort above;
  // its execution-time token/hold cannot race flight handover. The ordinary queue remains here.
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
  if (!state || state.retired || state.frameScheduled || state.openingHandoffHold === true) return;
  if (state.jobs.length === 0) {
    state.running = state.inFlight > 0 || state.diagnostics.activeJobs > 0;
    publishUpgradeDiagnostics(state);
    armStalledHogWake(state);
    return;
  }
  if (state.firstFlightHandoffHold === true
      && !state.jobs.some((job) => firstFlightReadableGlassJob(job)
        || firstFlightReadableShipJob(job))) {
    scheduleHeldShipWake(state);
    // The hold does not freeze in-flight jobs — a hog stalled through the hold still needs its
    // diagnostic closed on schedule.
    armStalledHogWake(state);
    return;
  }
  if (state.firstFlightHandoffHold === true) primeNextAuthoredAssetPlan(state);
  if (state.inFlight >= authoredUpgradeConcurrencyLimit()) {
    const firstFlightPass = firstFlightShipCanPassBusyPlace(state);
    const steadyPass = !firstFlightPass && steadyFlightShipCanPassBusyPlace(state);
    if (!firstFlightPass && !steadyPass && !stalledHogsCanPassShip(state)) {
      armStalledHogWake(state);
      return;
    }
    // The pass exists to feed the ship lane: hoist the needed ship to the head of the pick.
    if (!firstFlightPass) state.stallBypassShipPass = true;
  }
  // One entity admission per frame: keep post-boot authored upgrades bounded even when several
  // decoded packages become eligible together.
  state.frameScheduled = true;
  const token = (Number(state.frameScheduleToken) || 0) + 1;
  state.frameScheduleToken = token;
  scheduleUpgradeFrame(() => {
    if (state.retired || state.frameScheduleToken !== token || state.openingHandoffHold === true) return;
    if (state.firstFlightHandoffHold === true
        && !state.jobs.some((job) => firstFlightReadableGlassJob(job)
          || firstFlightReadableShipJob(job))) {
      state.frameScheduled = false;
      scheduleHeldShipWake(state);
      armStalledHogWake(state);
      return;
    }
    admitNextUpgradeJob(state);
    // Covered on-glass rows otherwise serialize one admission per frame through the whole
    // handoff window: with N stacked rows the last shows its pending substrate for ~(N−1)×
    // lane latency. When the next pick is itself a readable-glass job whose prefetch already
    // resolved (the decode is paid; only compose remains), grant it one bounded extra slot —
    // inFlight stays under the opening limit, steady concurrency untouched.
    const extra = state.jobs[0];
    if (state.firstFlightHandoffHold === true
        && state.inFlight > 0 && state.inFlight < AUTHORED_UPGRADE_OPENING_LIMIT
        && extra && firstFlightReadableGlassJob(extra)
        && extra.prefetchResolved === true
        && jobStillNeeded(state, extra)) {
      admitNextUpgradeJob(state);
    }
  });
}

function admitNextUpgradeJob(state) {
  if (state.retired) return null;
  state.frameScheduled = false;
  const stallBypassShipPass = state.stallBypassShipPass === true;
  state.stallBypassShipPass = false;
  // Per-pick verdict memo: the comparator calls the camera/frustum predicates
  // (authoredUpgradePriority → entityIsOnAuthoredGlassBand/entityIsOnscreen) per pair, turning a
  // sector-arrival burst into O(n·log n) heavy verdicts inside one admit frame. Verdicts are
  // frozen for the duration of a pick, so memoize per job — the deferred staging callback below
  // still reads live values because it must see the post-landing glass state.
  const pickVerdicts = new Map();
  const pickVerdict = (job, key, compute) => {
    let memo = pickVerdicts.get(job);
    if (!memo) { memo = Object.create(null); pickVerdicts.set(job, memo); }
    if (!(key in memo)) memo[key] = compute(job);
    return memo[key];
  };
  const live = authoredRuntimeState();
  if (live && live.mode === 'flight') {
    const gate = shouldStartHeavyAdmissionEventually(
      live.render && live.render.lastPresentDtMs,
      state.lateSkips,
    );
    state.lateSkips = gate.skippedCount;
    if (!gate.start) {
      // A queued job whose owner sits on the readable glass is a hole in the
      // picture, not discretionary work: the late-present throttle exists to
      // keep background admissions off a struggling frame, and a body the
      // player is already looking at is exactly the trade the hole-filling law
      // makes. Let the pick proceed — the R0 rung puts it first.
      if (!state.jobs.some((job) => pickVerdict(job, 'glass', (j) => entityIsOnReadableGlass(j && j.entity)))) {
        scheduleNextUpgradeFrame(state);
        return null;
      }
    }
  }
  state.jobs.sort((a, b) => {
    // The stall bypass exists to feed the on-glass body the lane granted; a queued needed
    // on-glass job must take the freed slot ahead of ordinary dressing or the hog's own kind
    // could keep re-winning the escape.
    if (stallBypassShipPass) {
      const stallDelta = Number(pickVerdict(b, 'stall', (j) => queuedGlassLawJobStillNeeded(state, j)))
        - Number(pickVerdict(a, 'stall', (j) => queuedGlassLawJobStillNeeded(state, j)));
      if (stallDelta) return stallDelta;
    }
    if (state.firstFlightHandoffHold === true) {
      // On-glass first — a parked non-ship still drawn as void beats an off-glass runway
      // ship. Within the same glass status ships keep priority.
      const glassDelta = Number(pickVerdict(b, 'glassJob', firstFlightReadableGlassJob))
        - Number(pickVerdict(a, 'glassJob', firstFlightReadableGlassJob));
      if (glassDelta) return glassDelta;
      const urgentDelta = Number(pickVerdict(b, 'shipJob', firstFlightReadableShipJob))
        - Number(pickVerdict(a, 'shipJob', firstFlightReadableShipJob));
      if (urgentDelta) return urgentDelta;
    }
    const priorityDelta = pickVerdict(a, 'priority', authoredUpgradePriority)
      - pickVerdict(b, 'priority', authoredUpgradePriority);
    if (priorityDelta) return priorityDelta;
    if (state.firstFlightHandoffHold === true
        && pickVerdict(a, 'shipJob', firstFlightReadableShipJob)
        && pickVerdict(b, 'shipJob', firstFlightReadableShipJob)) {
      const player = live?.entities?.get?.(live.playerId);
      const nearA = pickVerdict(a, 'near', (j) => planarRangeWU(j.entity, player));
      const nearB = pickVerdict(b, 'near', (j) => planarRangeWU(j.entity, player));
      if (nearA !== null && nearB !== null && nearA !== nearB) return nearA - nearB;
    }
    return a.sequence - b.sequence;
  });
  if (state.firstFlightHandoffHold === true
      && !(state.jobs[0] && pickVerdict(state.jobs[0], 'shipJob', firstFlightReadableShipJob))
      && !(state.jobs[0] && pickVerdict(state.jobs[0], 'glassJob', firstFlightReadableGlassJob))) {
    scheduleHeldShipWake(state);
    armStalledHogWake(state);
    return null;
  }
  if (state.loadingHullsOnly === true) {
    // The hulls-only hold defers leftover fx compiles, never a body the opening
    // frame shows: a shown owner is a hole in the picture, so it counts with the
    // hull cohort instead of being buried behind it (ZERO_TO_HERO 5.12).
    const live = authoredRuntimeState();
    const hullIndex = state.jobs.findIndex((job) => isLoadingHullUpgradeJob(job)
      || pickVerdict(job, 'glass', (j) => entityIsOnReadableGlass(j && j.entity))
      || openingFrameAdmissionPriority(job && job.entity, live) !== null);
    if (hullIndex < 0) {
      state.running = state.inFlight > 0 || state.diagnostics.activeJobs > 0;
      publishUpgradeDiagnostics(state);
      armStalledHogWake(state);
      return null;
    }
    if (hullIndex > 0) {
      const [hull] = state.jobs.splice(hullIndex, 1);
      state.jobs.unshift(hull);
    }
  }
  primeNextAuthoredAssetPlan(state);
  const job = state.jobs.shift();
  if (!job) {
    state.running = state.inFlight > 0 || state.diagnostics.activeJobs > 0;
    publishUpgradeDiagnostics(state);
    armStalledHogWake(state);
    return null;
  }
  if (!jobStillNeeded(state, job)) {
    cancelQueuedJob(state, job);
    scheduleNextUpgradeFrame(state);
    return null;
  }
  if (!jobRunwayRegradeStillWanted(state, job)) {
    armRegradeEvictCooloff(job);
    cancelQueuedJob(state, job);
    scheduleNextUpgradeFrame(state);
    return null;
  }

  job.lifecycle = 'in-flight';
  job.serialSlotReleased = false;
  job.inFlightAtMs = monotonicNow();
  const requestedOptions = job.options || {};
  const requestedOwnerActive = requestedOptions.isResidencyOwnerActive;
  job.admission = createAsyncAdmission({
    label: `authored-upgrade:${String(job.key)}`,
    signal: requestedOptions.signal,
  });
  const admission = job.admission;
  const owner = { boundary: job.boundary, entity: job.entity };
  const boundaryToken = job.boundaryToken;
  const isBoundaryCurrent = () => upgradeTokensByBoundary.get(owner.boundary) === boundaryToken;
  const isOwnerActive = () => !state.retired && isBoundaryCurrent()
    && job.abortedStalled !== true
    && jobStillNeeded(state, owner)
    && (typeof requestedOwnerActive !== 'function' || requestedOwnerActive() === true);
  job.isAdmissionOwnerActive = isOwnerActive;
  job.options = {
    ...requestedOptions,
    asyncAdmission: job.admission,
    signal: job.admission.signal,
    isAdmissionBoundaryCurrent: isBoundaryCurrent,
    isResidencyOwnerActive: () => !admission.signal.aborted && isOwnerActive(),
  };
  if (job.options && Object.isExtensible(job.options)
      && typeof job.options.isAbortedStalledAdmission !== 'function') {
    job.options.isAbortedStalledAdmission = () => job.abortedStalled === true;
  }
  if (state.firstFlightHandoffHold === true && job.options) {
    job.options.urgentFirstFlightAdmission = true;
  }
  state.inFlight++;
  const diagnostic = beginUpgradeDiagnostic(state, job);
  const releaseSerialSlotAfterPipelineStaging = () => {
    if (job.serialSlotReleased || job.lifecycle !== 'in-flight') return false;
    job.serialSlotReleased = true;
    state.inFlight = Math.max(0, state.inFlight - 1);
    scheduleNextUpgradeFrame(state);
    return true;
  };
  if (job.options && job.options.overlapAuthoredPipelineCompile === true
      && Object.isExtensible(job.options)) {
    // Loading composes one boundary at a time, then lets its exact GPU gate overlap the next CPU
    // admission. The authored overlap branches invoke this only after publishing pipelineReady.
    job.options.onAuthoredPipelineStaged = releaseSerialSlotAfterPipelineStaging;
  } else if (job.options && Object.isExtensible(job.options)
      && authoredRuntimeState() && authoredRuntimeState().mode === 'flight') {
    // Flight-mode glass-law overlap: the job still stages its GPU work detached (the exact
    // pipeline/GPU gate), but the serial slot frees only while a queued job's owner is on the
    // readable glass — the hole-in-the-picture case. An on-glass nemesis wing or cohort no
    // longer waits behind the whole in-flight job's upload drain; ambient jobs keep the
    // original hold-the-slot pacing that keeps two composes from colliding on soft GPUs.
    job.options.overlapAuthoredPipelineCompile = true;
    job.options.onAuthoredPipelineStaged = () => {
      const glassQueued = state.jobs.some((queued) => queued !== job
        && (entityIsOnReadableGlass(queued && queued.entity)
          // Same runway-inbound grade as rung 5: a hull due inside the promote horizon
          // is nearly on the glass — holding the serial slot through the running job's
          // whole upload drain would hand the pop it was staged to prevent.
          || entityIsAuthoredRunwayInbound(queued.entity, authoredRuntimeState())));
      if (!glassQueued) return false;
      return releaseSerialSlotAfterPipelineStaging();
    };
  }
  // One entity begins CPU admission per frame. Non-overlap jobs and custom runs that do not enter
  // an authored overlap branch keep the original single-flight semantics; loading authored jobs
  // release only this internal slot once their detached root reaches the exact pipeline/GPU gate.
  const run = typeof job.run === 'function'
    ? () => job.run({ options: job.options, admission: job.admission, boundary: job.boundary })
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
  const work = Promise.resolve().then(() => {
    assertAuthoredVisualPreparationActive(job.options, 'before-queued-upgrade');
    return run();
  });
  job.admission.wait(work).then((value) => {
    assertAuthoredVisualPreparationActive(job.options, 'after-queued-upgrade');
    result = value;
    if (diagnostic.endedAtMs == null) {
      diagnostic.status = job.boundary && job.boundary.userData
        ? job.boundary.userData.authoredAssetState || 'completed'
        : 'completed';
    }
  }).catch((error) => {
    failure = error;
    const timedOut = error && error.name === 'TimeoutError';
    const cancelled = job.admission.signal.aborted || error && error.name === 'AbortError';
    job.admission.abort(error);
    // A diagnostic the watchdog already closed (stall verdict, owner-inactive settle) is a
    // sealed record — the abandoned run's late rejection must not overwrite it, the same way
    // the abortedStalled guard below keeps its boundary state off the replacement owner's.
    if (diagnostic.endedAtMs == null) {
      diagnostic.status = timedOut ? 'stalled-slot-released'
        : cancelled ? 'awaiting-authored-admission' : 'fallback-after-error';
      diagnostic.error = error && error.message ? error.message : String(error);
    }
    // A retired queue may already have a fresh job for this same mounted boundary. Its old
    // failure cannot release the new owner's residency or overwrite the new publication.
    if (job.abortedStalled === true) {
      // A stall-aborted job's boundary already readmitted — the abandoned run's late verdict
      // must not stomp the fresh 'awaiting-authored-admission' state its replacement rides on.
      // Releasing residency here would mark the boundary a dead owner forever (the released-
      // owner set has no un-release), killing the replacement job's requests mid-decode.
    } else if (job.options.isAdmissionBoundaryCurrent()) {
      releaseBoundaryResidency(job.renderer, job.boundary, 'queued-upgrade-failed');
      if (timedOut) {
        job.boundary.userData.authoredAssetState = 'unavailable';
        job.boundary.userData.authoredFailureReason = 'admission-deadline';
        setPresentationAdmission(job.entity, PRESENTATION_ADMISSION.unavailable);
      } else if (cancelled || job.entity && job.entity.alive === false) {
        markAuthoredBoundaryForReadmission(job.boundary, 'queued-upgrade-owner-inactive');
        if (job.entity && job.entity.alive === false && job.boundary && job.boundary.parent) {
          // The job's owner died under a kept boundary (save recook) — a terminal verdict would
          // strand the restored entity that rebinds to this mesh. Readmission status re-requests.
          if (diagnostic.endedAtMs == null) diagnostic.status = 'awaiting-authored-admission';
          console.info('[partsLibrary] queued authored composition aborted; owner left before publish');
        }
      } else {
        job.boundary.userData.authoredAssetState = 'fallback-after-error';
      }
    }
    if (!cancelled && !timedOut) {
      console.warn('[partsLibrary] queued authored composition failed; retaining fallback', error);
    }
  })
    .finally(() => {
      releaseSerialSlotAfterPipelineStaging();
      if (job.lifecycle === 'in-flight') job.lifecycle = 'settled';
      job.admission.finish();
      finishUpgradeDiagnostic(state, job, diagnostic);
      cleanupQueuedJob(state, job);
      settleUpgradeJob(job, diagnostic.status, result, failure);
      state.running = state.inFlight > 0 || state.jobs.length > 0 || state.diagnostics.activeJobs > 0;
      armStalledHogWake(state);
      scheduleNextUpgradeFrame(state);
    });
  scheduleNextUpgradeFrame(state);
  return job.completion;
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

// Per-lane bound on speculative decode chains: the next few queued jobs of each lane warm the
// same `url::slot` cache the admission call reads, so the serial slot stops paying fetch+decode
// for a job whose turn already arrived. Kept small — each chain pins decoded assets in residency
// until its job settles, and a cancelled job's warm-up is the waste the bound exists to cap.
const AUTHORED_JOB_PREFETCH_DEPTH = 2;

function primeNextAuthoredAssetPlan(state) {
  const liveState = authoredRuntimeState();
  if (!state || !liveState || liveState.mode !== 'flight') return;
  if (state.firstFlightHandoffHold === true) {
    if (state.firstFlightPrefetchJob
        && state.jobs.includes(state.firstFlightPrefetchJob)
        && jobStillNeeded(state, state.firstFlightPrefetchJob)) return;
    state.firstFlightPrefetchJob = null;
    const player = liveState.entities?.get?.(liveState.playerId);
    const eligible = state.jobs.filter((job) => (firstFlightReadableGlassJob(job)
        || firstFlightReadableShipJob(job))
      && job.renderer && jobStillNeeded(state, job) && !job.prefetchPromise
      // A requestless non-ship's prefetch resolves null immediately — it would still park
      // the first-flight slot for a whole serial admit while real warms wait behind it.
      && ((job.entity && job.entity.type === 'ship') || authoredUpgradeAssetRequests(job).length > 0));
    eligible.sort((a, b) => {
      const priority = authoredUpgradePriority(a) - authoredUpgradePriority(b);
      if (priority) return priority;
      return (planarRangeWU(a.entity, player) ?? Infinity)
        - (planarRangeWU(b.entity, player) ?? Infinity);
    });
    const job = eligible[0];
    if (!job) return;
    state.firstFlightPrefetchJob = job;
    // Same job-liveness compose as the general prefetch: a dropped first-flight job's late
    // retain would otherwise revive the owner cancelQueuedJob just released.
    job.prefetchPromise = startAuthoredJobAssetPrefetch(job) || Promise.resolve();
    job.prefetchPromise.then(() => {
      job.prefetchResolved = true;
      scheduleNextUpgradeFrame(state);
    }, (error) => {
      job.prefetchError = error && error.message ? error.message : String(error);
      scheduleNextUpgradeFrame(state);
    });
    return;
  }
  // Only prepare the jobs nearest the serial slot. The old loop started a preload Promise for
  // every queued ship, which effectively asked the serial decode lane to process the whole live
  // galaxy while the player was already flying. Bounded lookahead keeps the same authored asset
  // and exact composition, but caps speculative decode/GPU residency demand to the next few
  // boundaries. The lookahead is not ship-only: place/station/fx/payload jobs pay the same
  // fetch+decode inside the serial slot when they arrive cold. The bound is per lane —
  // AUTHORED_JOB_PREFETCH_DEPTH ship jobs and non-ship jobs warm ahead of admission, so a
  // non-ship head cannot starve the ships behind it. Every warmed chain joins the decode lane
  // as an ambient entry, so a deadline splice (admitted job, urgent LOD demotion) still passes.
  let shipLaneWarmed = 0;
  let otherLaneWarmed = 0;
  // Index walk, not for-of: the splices below would otherwise skip the element that slides
  // into a removed job's slot — an evict's neighbor misses this pass's re-grade + prefetch.
  for (let jobIndex = 0; jobIndex < state.jobs.length; jobIndex++) {
    const job = state.jobs[jobIndex];
    if (shipLaneWarmed >= AUTHORED_JOB_PREFETCH_DEPTH
        && otherLaneWarmed >= AUTHORED_JOB_PREFETCH_DEPTH) break;
    if (!jobStillNeeded(state, job)) {
      state.jobs.splice(jobIndex, 1);
      jobIndex -= 1;
      cancelQueuedJob(state, job);
      continue;
    }
    // The admit gate's re-grade runs here too: a departed graze sitting top-2 would otherwise
    // pay the whole fetch+decode before admit ever sees it.
    if (!jobRunwayRegradeStillWanted(state, job)) {
      armRegradeEvictCooloff(job);
      state.jobs.splice(jobIndex, 1);
      jobIndex -= 1;
      cancelQueuedJob(state, job);
      continue;
    }
    if (!job.entity || !job.renderer) continue;
    const isShip = job.entity.type === 'ship';
    if (isShip ? shipLaneWarmed >= AUTHORED_JOB_PREFETCH_DEPTH
        : otherLaneWarmed >= AUTHORED_JOB_PREFETCH_DEPTH) continue;
    if (job.prefetchPromise) {
      // Warming from an earlier prime still occupies a lane slot — the bound is over the next N
      // warm plans per lane, not the count this one call begins.
      if (isShip) shipLaneWarmed += 1; else otherLaneWarmed += 1;
      continue;
    }
    const prefetch = startAuthoredJobAssetPrefetch(job);
    if (!prefetch) continue;
    job.prefetchPromise = prefetch;
    job.prefetchPromise.then(() => {
      job.prefetchResolved = true;
    }).catch((error) => {
      job.prefetchError = error && error.message ? error.message : String(error);
    });
    if (isShip) shipLaneWarmed += 1; else otherLaneWarmed += 1;
  }
}

function monotonicNow() {
  return globalThis.performance && typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

// Per-job phase timings (decode/compose/pipeline/commit) live on the boundary while its one
// serial admission runs, then ride the job's diagnostic for the frame-solid probe. One small
// object per upgrade job — jobs are heavyweight by nature, this adds nothing measurable.
const ADMISSION_PHASE_KEYS = ['decode', 'compose', 'pipeline', 'commit'];

function beginAdmissionPhaseTimings(boundary) {
  if (!boundary || !boundary.userData) return null;
  const timings = {};
  boundary.userData.__admissionPhaseTimings = timings;
  return timings;
}

function endAdmissionPhase(timings, phase, startedAtMs) {
  if (!timings) return;
  timings[`${phase}Ms`] = Math.max(0, monotonicNow() - startedAtMs);
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
  job.upgradeDiagnostic = diagnostic;
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
  // Pipeline overlap and cancellation may both settle; diagnostic accounting is idempotent.
  if (!diagnostic || diagnostic.endedAtMs != null) return;
  diagnostic.endedAtMs = monotonicNow();
  diagnostic.durationMs = Math.max(0, diagnostic.endedAtMs - diagnostic.startedAtMs);
  const boundaryTimings = upgradeTokensByBoundary.get(job.boundary) === job.boundaryToken
    && job.boundary && job.boundary.userData
    ? job.boundary.userData.__admissionPhaseTimings
    : null;
  if (boundaryTimings) {
    diagnostic.phases = {};
    for (const phase of ADMISSION_PHASE_KEYS) {
      const value = Number(boundaryTimings[`${phase}Ms`]);
      if (Number.isFinite(value)) diagnostic.phases[`${phase}Ms`] = Math.round(value);
    }
    for (const key of ['policiesMs', 'compileMs', 'residencyMs']) {
      const value = Number(boundaryTimings[key]);
      if (Number.isFinite(value)) diagnostic.phases[key] = Math.round(value);
    }
    delete job.boundary.userData.__admissionPhaseTimings;
  }
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
  if (!state.retired && state.scene && state.scene.userData) {
    state.scene.userData.authoredUpgradeDiagnostics = state.diagnostics;
  }
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

export function describeAuthoredUpgradeQueue(scene) {
  const state = scene && upgradeQueuesByScene.get(scene);
  if (!state) return { present: false, pending: 0, inFlight: 0, running: false, held: false, jobs: [] };
  const jobs = [];
  const seen = new Set();
  // `jobs` is a display sample, but the aggregate flags must scan the whole set: overlap
  // releases the serial slot once a job's pipeline stages, so dozens of detached admissions can
  // be mid-compile while the first eight entries already read settled — an idle verdict sampled
  // from the truncated list released the cook with site/place jobs still linking into flight.
  let compiling = 0;
  for (const job of [...state.jobs, ...state.byBoundary.values()]) {
    if (!job || seen.has(job)) continue;
    seen.add(job);
    const status = job.boundary && job.boundary.userData
      ? job.boundary.userData.authoredAssetState
      : null;
    if (job.lifecycle === 'in-flight' || status === 'compiling-pipelines') compiling += 1;
    if (jobs.length < 8) {
      jobs.push({
        key: job.key || null,
        lifecycle: job.lifecycle || null,
        status,
      });
    }
  }
  return {
    present: true,
    pending: state.jobs.length,
    inFlight: state.inFlight,
    running: !!state.running,
    held: state.openingHandoffHold === true || state.firstFlightHandoffHold === true,
    openingHeld: state.openingHandoffHold === true,
    firstFlightHeld: state.firstFlightHandoffHold === true,
    frameScheduled: state.frameScheduled === true,
    compiling,
    jobs,
  };
}

/** Detached-boundary leak diagnostics: reports which authored registries still hold
 * this boundary so witness tooling can name the retainer without heap archaeology. */
export function inspectAuthoredBoundaryRegistrations(scene, boundary) {
  const out = {
    preparedRoots: 0,
    queuedLifecycle: null,
    queuedKey: null,
    inJobsArray: 0,
  };
  if (!scene || !boundary) return out;
  const state = sceneStates.get(scene);
  const roots = state && state.preparedAuthoredRoots && state.preparedAuthoredRoots.get(boundary);
  if (roots && roots.size) out.preparedRoots = roots.size;
  const queue = upgradeQueuesByScene.get(scene);
  if (queue) {
    const job = queue.byBoundary.get(boundary);
    if (job) {
      out.queuedLifecycle = job.lifecycle || 'queued';
      out.queuedKey = job.key || null;
    }
    for (const queued of queue.jobs) {
      if (queued && queued.boundary === boundary) out.inJobsArray += 1;
    }
  }
  return out;
}

/** Admit queued upgrades without waiting for a display rAF. Loading-shell only. */
export function pumpAuthoredUpgradeQueue(scene, options = {}) {
  const state = scene && upgradeQueuesByScene.get(scene);
  if (!state) return { pumped: 0, pending: 0, inFlight: 0, held: false };
  if (state.firstFlightHandoffHold === true && options.force !== true) {
    return { pumped: 0, pending: state.jobs.length, inFlight: state.inFlight, held: true };
  }
  if (state.openingHandoffHold === true) {
    state.openingHandoffHold = false;
  }
  const only = typeof options.only === 'function' ? options.only : null;
  if (only) {
    const preferred = [];
    const deferred = [];
    for (const job of state.jobs) {
      if (only(job)) preferred.push(job);
      else deferred.push(job);
    }
    if (preferred.length) state.jobs = preferred.concat(deferred);
  }
  let pumped = 0;
  const limit = Math.max(1, authoredUpgradeConcurrencyLimit());
  while (state.jobs.length > 0 && state.inFlight < limit && pumped < limit) {
    if (only && !only(state.jobs[0])) break;
    const pendingBefore = state.jobs.length;
    const inFlightBefore = state.inFlight;
    admitNextUpgradeJob(state);
    if (state.jobs.length >= pendingBefore && state.inFlight <= inFlightBefore) break;
    pumped += 1;
  }
  return {
    pumped,
    pending: state.jobs.length,
    inFlight: state.inFlight,
    held: false,
  };
}

/** Detached authored roots that have compiled but not yet swapped into the live graph. */
export function collectPreparedAuthoredCompileRoots(scene) {
  const roots = [];
  const seen = new Set();
  const state = scene && sceneStates.get(scene);
  if (!state || !state.preparedAuthoredRoots) return roots;
  for (const prepared of state.preparedAuthoredRoots.values()) {
    for (const root of prepared) {
      if (!root || seen.has(root)) continue;
      if (root.isObject3D !== true && typeof root.traverse !== 'function') continue;
      seen.add(root);
      roots.push(root);
    }
  }
  return roots;
}

/** Loading-shell wait only. Does not change the flight-start readiness gate. */
export async function waitForAuthoredUpgradeQueueIdle(scene, options = {}) {
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || 6000);
  const stale = typeof options.stale === 'function' ? options.stale : () => false;
  const yieldToMain = typeof options.yieldToMain === 'function'
    ? options.yieldToMain
    : () => new Promise((resolve) => setTimeout(resolve, 16));
  const started = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());
  const snapshot = () => {
    const described = describeAuthoredUpgradeQueue(scene);
    return {
      pending: described.pending,
      inFlight: described.inFlight,
      running: described.running,
      compiling: described.compiling > 0,
    };
  };
  const pump = () => {
    if (typeof options.pump === 'function') return options.pump();
    return pumpAuthoredUpgradeQueue(scene);
  };
  while (now() - started < timeoutMs) {
    if (stale()) return { idle: false, superseded: true, waitedMs: now() - started, ...snapshot() };
    pump();
    const stats = snapshot();
    if (stats.pending === 0 && stats.inFlight === 0 && stats.running !== true
        && stats.compiling !== true) {
      return { idle: true, waitedMs: now() - started, ...stats };
    }
    await yieldToMain();
  }
  return { idle: false, waitedMs: now() - started, ...snapshot() };
}

function openingAssetRoot(entry, state, meshes) {
  const entity = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(entry && entry.id)
    : (state && state.entityList || []).find((item) => item && item.id === (entry && entry.id));
  return (meshes && typeof meshes.get === 'function' && meshes.get(entry && entry.id))
    || (entity && entity.mesh)
    || null;
}

function openingAssetCanStillSettle(entry, state, meshes) {
  if (!entry) return false;
  if (isFlightReadyStatus(entry.status) || authoredOpeningFailedClosed(entry.status)) return false;
  const root = openingAssetRoot(entry, state, meshes);
  const promise = root && root.userData && root.userData.authoredUpgradePromise;
  if ((entry.status === 'loading' || entry.status === 'compiling-pipelines') && promise) return true;
  return typeof (root && root.userData && root.userData.requestAuthoredUpgrade) === 'function';
}

/** Kick nearby opening-composition upgrades that are still waiting for a first draw. */
export function requestOpeningCompositionUpgrades(state, renderer, scene, meshes) {
  if (!state || !renderer || !scene) return { requested: 0, ids: [] };
  const ids = [];
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  for (const entity of list) {
    if (!isInitialAuthoredCompositionEntity(entity, state)) continue;
    const root = (meshes && typeof meshes.get === 'function' && meshes.get(entity.id))
      || (entity && entity.mesh)
      || null;
    const request = root && root.userData && root.userData.requestAuthoredUpgrade;
    if (typeof request !== 'function') continue;
    const status = (root.userData && root.userData.authoredAssetState) || authoredAssetState(entity);
    if (authoredOpeningFailedClosed(status) || isFlightReadyStatus(status)) continue;
    if (authoredAdmissionStarted(status) && root.userData.authoredUpgradePromise) continue;
    // The opening set IS the first frame — arm admissionVisible so its decodes and compile
    // tails jump every speculative warm queued in front of the ready latch (the hook re-grades
    // an already-in-flight job on each repeat call).
    request(renderer, scene, { admissionVisible: true });
    ids.push(entity.id);
  }
  return { requested: ids.length, ids };
}

/** Loading-shell wait only. Nearby opening actors settle before the live-scene cook, not the flight gate. */
export async function waitForOpeningCompositionSettled(state, options = {}) {
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || 8000);
  const stale = typeof options.stale === 'function' ? options.stale : () => false;
  const yieldToMain = typeof options.yieldToMain === 'function'
    ? options.yieldToMain
    : () => new Promise((resolve) => setTimeout(resolve, 16));
  const started = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());
  const request = () => {
    if (typeof options.request === 'function') return options.request();
    return requestOpeningCompositionUpgrades(state, options.renderer, options.scene, options.meshes);
  };
  const pump = () => {
    if (typeof options.pump === 'function') return options.pump();
    const live = options.state || state;
    return pumpAuthoredUpgradeQueue(options.scene, {
      only: (job) => !!(job && job.entity && isInitialAuthoredCompositionEntity(job.entity, live)),
    });
  };
  let lastRequest = { requested: 0, ids: [] };
  while (now() - started < timeoutMs) {
    if (stale()) {
      return {
        settled: false,
        reason: 'superseded',
        waitedMs: now() - started,
        pending: -1,
        ids: [],
        requested: lastRequest,
        queue: describeAuthoredUpgradeQueue(options.scene),
      };
    }
    lastRequest = request();
    pump();
    const readiness = authoredCriticalVisualReadiness(state);
    const pending = (readiness && readiness.openingPending) || [];
    if (pending.length === 0) {
      return {
        settled: true,
        waitedMs: now() - started,
        pending: 0,
        ids: [],
        requested: lastRequest,
        queue: describeAuthoredUpgradeQueue(options.scene),
      };
    }
    const stillOpen = pending.filter((entry) => (
      openingAssetCanStillSettle(entry, state, options.meshes)
    ));
    if (stillOpen.length === 0) {
      return {
        settled: false,
        reason: 'unstartable',
        waitedMs: now() - started,
        pending: pending.length,
        ids: pending.map((entry) => entry && entry.id).filter(Boolean),
        statuses: pending.map((entry) => describeOpeningPending(entry)),
        requested: lastRequest,
        queue: describeAuthoredUpgradeQueue(options.scene),
      };
    }
    const promises = stillOpen
      .map((entry) => {
        const root = openingAssetRoot(entry, state, options.meshes);
        return root && root.userData && root.userData.authoredUpgradePromise;
      })
      .filter((promise) => promise && typeof promise.then === 'function');
    if (promises.length) {
      await Promise.race([
        Promise.allSettled(promises),
        Promise.resolve().then(() => yieldToMain()),
      ]);
    }
    await yieldToMain();
  }
  const readiness = authoredCriticalVisualReadiness(state);
  const pending = (readiness && readiness.openingPending) || [];
  return {
    settled: false,
    reason: 'timeout',
    waitedMs: now() - started,
    pending: pending.length,
    ids: pending.map((entry) => entry && entry.id).filter(Boolean),
    statuses: pending.map((entry) => describeOpeningPending(entry)),
    requested: lastRequest,
    queue: describeAuthoredUpgradeQueue(options.scene),
  };
}

function describeOpeningPending(entry) {
  if (!entry) return '';
  const bits = [entry.id, entry.status, entry.type, entry.defId];
  if (entry.hook === false) bits.push('no-hook');
  if (entry.promised === false) bits.push('no-promise');
  return bits.filter((bit) => bit !== undefined && bit !== null && bit !== '').join(':');
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
    .map((entity) => {
      const root = entity && entity.mesh;
      const data = entity && entity.data || {};
      return {
        id: entity.id,
        type: entity.type,
        defId: data.defId || data.actorId || data.assetRef || null,
        status: authoredAssetState(entity),
        hook: typeof (root && root.userData && root.userData.requestAuthoredUpgrade) === 'function',
        promised: !!(root && root.userData && root.userData.authoredUpgradePromise),
      };
    });
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
    // Runtime glass membership is an opening-frame contract only: it gates until the first
    // playable picture paints, so every hull visible at the reveal is authored. After the latch,
    // inbound traffic that drifts onto the glass is ordinary on-demand streaming (fallback hull
    // until its authored body commits) and must not keep `ready` false for the rest of the
    // session — otherwise a ship arriving a minute into flight re-blocks a startup verdict the
    // route and the first-picture submission both read as point-in-time.
    const allowRuntimeActivityGate = state && state.mode !== 'loading'
      && !Number.isFinite(state.render && state.render.firstPlayableFrameAt);
    const frameGlassIds = state && state.render && state.render.activityFrame
      && state.render.activityFrame.renderGlassIds;
    const isCurrentGlass = allowRuntimeActivityGate && (
      frameGlassIds && typeof frameGlassIds.has === 'function'
        ? frameGlassIds.has(entity.id)
        : Array.isArray(frameGlassIds) && frameGlassIds.includes(entity.id)
    );
    // The glass auto-role only binds entities that can ever be authored. A
    // procedural-native body on the glass — an instanced asteroid is the
    // canonical case — has no authored variant to wait for, so requiring it
    // makes ready permanently unreachable near any rock. Explicit
    // flightReadyRole pins still apply regardless of pipeline eligibility.
    const autoGlassRole = entityRequiresAuthoredPresentation(entity)
      ? FLIGHT_READY_ROLE.GLASS_ACTORS
      : null;
    const role = entity && (entity.flightReadyRole || data.flightReadyRole
      || data.renderFlightReadyRole || data.render && data.render.flightReadyRole
      || (state && state.mode === 'loading'
          && (entity.type === 'wreck' || entity.type === 'drone'
            // A generic payload the packaged-prop lane can mount (packagedPropSpec is the
            // mount hook's own predicate — attachPackagedScenarioProp no-ops without it)
            // settles through the same authoredPackageUrl admission the wreck/drone pins
            // ride; an on-runway tow body (survivor pod at +6/-4) holds the veil for its
            // warm commit instead of swapping a beat after it lifts. Explicit-authored
            // payloads already pin via entityRequiresAuthoredPresentation above.
            // startupPayloadOwnsVeilPin is the composition's own predicate — pinning a
            // payload the composition cannot schedule (the on-table 47-A spindle, whose
            // admission is the post-gate first-flight cook) deadlocks this gate.
            || startupPayloadOwnsVeilPin(entity, state))
          && entity.alive !== false
          && !authoredOpeningFailedClosed(authoredAssetState(entity))
          && startupAuthoredContactOnRunway(entity, state)
          ? FLIGHT_READY_ROLE.GLASS_ACTORS : null)
      || ((isCurrentGlass || (allowRuntimeActivityGate
        && entity.activity?.presentationTier === PRESENTATION_TIER.R0_GLASS))
        ? autoGlassRole : null));
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
    || status === 'same-semantic-fallback'
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
  assertAuthoredVisualPreparationActive(options, 'before-gpu-preparation');
  const preparePipelines = options && options.prepareAuthoredPipelines;
  const prepareResidency = options && options.prepareAuthoredGpuResidency;
  if (typeof preparePipelines !== 'function' && typeof prepareResidency !== 'function') {
    return { skipped: true, reason: 'GPU preparation unavailable' };
  }
  // Admission must compile the exact material state used by the first visible draw. These same
  // idempotent policies also run at the presentation boundary, but applying them only after this
  // detached-root compile changes the program key and leaves the first draw to link synchronously.
  assertAuthoredVisualPreparationActive(options, 'before-material-policy');
  const policiesStartedAtMs = monotonicNow();
  configureRealtimeCanopyMaterials(root);
  configureTransparentSinglePassSurfaces(root);
  canonicalizeAuthoredProgramState(root);
  // Retained program specimens ride this admission's own compile (cache-hit binds, no extra
  // links) and keep each covered program key alive after the boundary's materials release.
  const programSpecimenMount = mountCanonicalProgramSpecimens(root);
  const policiesMs = Math.max(0, monotonicNow() - policiesStartedAtMs);
  const tier1 = tier1CausalCounters();
  if (tier1) {
    tier1.countPipelinePreparation('material-policies', 1);
    if (typeof preparePipelines === 'function') tier1.countPipelinePreparation('compile-pipelines', 1);
    if (typeof prepareResidency === 'function') tier1.countPipelinePreparation('gpu-residency', 1);
  }
  const compileStartedAtMs = monotonicNow();
  let pipelines;
  try {
    pipelines = typeof preparePipelines === 'function'
      ? await waitForAuthoredAdmission(preparePipelines(root), options)
      : { skipped: true, reason: 'pipeline compiler unavailable' };
  } finally {
    settleCanonicalProgramSpecimens(root, programSpecimenMount);
  }
  const compileMs = Math.max(0, monotonicNow() - compileStartedAtMs);
  assertAuthoredVisualPreparationActive(options, 'after-pipeline-compile');
  if (options.yieldBetweenGpuStages === true && typeof options.yieldToNextPresent === 'function') {
    await waitForAuthoredAdmission(options.yieldToNextPresent(), options);
    assertAuthoredVisualPreparationActive(options, 'after-present-yield');
  }
  const residencyStartedAtMs = monotonicNow();
  const gpuResidency = typeof prepareResidency === 'function'
    ? await waitForAuthoredAdmission(prepareResidency(root, {
        isResidencyOwnerActive: options.isResidencyOwnerActive,
      }), options)
    : { skipped: true, reason: 'GPU residency uploader unavailable' };
  const residencyMs = Math.max(0, monotonicNow() - residencyStartedAtMs);
  assertAuthoredVisualPreparationActive(options, 'after-gpu-residency');
  return {
    skipped: pipelines?.skipped === true && gpuResidency?.skipped === true,
    pipelines,
    gpuResidency,
    // Sub-phase evidence for the serial admission lane (frame-solid probe job phase split).
    policiesMs: Math.round(policiesMs),
    compileMs: Math.round(compileMs),
    residencyMs: Math.round(residencyMs),
  };
}

function assertAuthoredVisualPreparationActive(options, phase) {
  if (options && options.asyncAdmission) options.asyncAdmission.assertActive();
  const isActive = options && options.isResidencyOwnerActive;
  if (typeof isActive === 'function' && isActive() !== true) {
    const error = new Error(`Authored visual preparation owner became inactive ${phase}`);
    error.name = 'AbortError';
    throw error;
  }
}

function waitForAuthoredAdmission(work, options) {
  return options && options.asyncAdmission ? options.asyncAdmission.wait(work) : work;
}

function assertQueuedAuthoredAdmissionActive(options, phase) {
  if (options && options.asyncAdmission) assertAuthoredVisualPreparationActive(options, phase);
}

function isAuthoredAdmissionBoundaryCurrent(options) {
  return !options || typeof options.isAdmissionBoundaryCurrent !== 'function'
    || options.isAdmissionBoundaryCurrent();
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
  let installedPreparedDisposer = null;
  try {
    if (!mayComposeAuthoredShipLive({
      ...options,
      fallbackRoot,
      emptyAdmissionSubstrate: isEmptyAdmissionSubstrate(fallbackRoot),
    })) {
      // A stale run settling procedural here re-shows the fallback over the live epoch's
      // committed authored root — the verdict belongs to the live admission.
      if (!staleAuthoredRunVerdict(boundary, options)) {
        settleAuthoredShipToProceduralFallback(
          boundary,
          fallbackRoot,
          entity,
          setActive,
          'flight-compose-gated',
        );
      }
      releaseBoundaryResidency(renderer, boundary, 'flight-compose-gated', options.admissionEpoch);
      const tier1 = tier1CausalCounters();
      if (tier1) tier1.countAuthoredAdmissionJob('flight-compose-gated');
      return false;
    }
    // Prefetch may have captured a plan before combat/traffic identity landed on the entity.
    // Await any in-flight decode, then admit the *current* whole-ship selection so compose cannot
    // look up a hull that was never added to the library.
    const phaseTimings = beginAdmissionPhaseTimings(boundary);
    const decodeStartedAtMs = monotonicNow();
    // Decode runs at deadline floor; admissionVisible must stay live — a mid-run promotion
    // stamped on the job bag by a join or an on-glass trigger has to reach the remaining
    // per-part posts, or the tail of a hull that just came on-stage keeps ranking deadline.
    const decodeOptions = { ...options, admissionDeadline: true };
    Object.defineProperty(decodeOptions, 'admissionVisible', {
      enumerable: true,
      get: () => options.admissionVisible === true,
    });
    // Post the deadline-floor decode BEFORE awaiting the ambient lookahead prefetch: the
    // shared url::slot decode tasks join at this job's class (budget.promote + compile
    // regrade), so sustained deadline traffic cannot stall the in-flight job behind its
    // own ambient prefetch chain all the way to the stall bound.
    const deadlineLibrary = waitForAuthoredAdmission(preloadAuthoredAssetsForEntity(renderer, entity, decodeOptions), options);
    // Belt: the prefetch await below can outlive the deadline decode's rejection, so the
    // stored promise must be marked handled now or the gap surfaces an unhandled rejection
    // even though the later await observes it (same belt as the boot contract fetch).
    deadlineLibrary.catch(() => {});
    if (prefetchedLibrary) {
      try { await waitForAuthoredAdmission(prefetchedLibrary, options); }
      catch { assertQueuedAuthoredAdmissionActive(options, 'after-ship-prefetch'); }
    }
    const library = await deadlineLibrary;
    assertQueuedAuthoredAdmissionActive(options, 'before-ship-composition');
    endAdmissionPhase(phaseTimings, 'decode', decodeStartedAtMs);
    const compositionStartedAtMs = monotonicNow();
    try {
      authored = await buildComposedShipAsync(entity, library, scene, boundary, options);
    } finally {
      recordAdmissionSlice(compositionStartedAtMs, 'compose');
      endAdmissionPhase(phaseTimings, 'compose', compositionStartedAtMs);
      const tier1 = tier1CausalCounters();
      if (tier1) tier1.countAuthoredAdmissionJob('composition');
    }
    if (!authored) {
      if (!staleAuthoredRunVerdict(boundary, options)) {
        boundary.userData.authoredAssetState = 'unavailable';
        boundary.userData.authoredVisualRoot = 'none-build-failed';
        setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
      }
      releaseBoundaryResidency(renderer, boundary, 'authored-composition-unavailable', options.admissionEpoch);
      return false;
    }
    registerPreparedAuthoredAdmission(scene, boundary, authored);
    installedPreparedDisposer = options.deferBoundaryPublication === true
      ? installPreparedBoundaryDisposer(boundary, () => (
        disposePreparedShipBoundaryResources(boundary, authored, options.admissionEpoch)
      ))
      : null;
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
      const pipelineResult = await pipelineReady;
      // The GPU gate's full service time (material-policy walk + program compile + residency
      // upload), not just its synchronous prologue — this is the phase the lane serializes on.
      endAdmissionPhase(phaseTimings, 'pipeline', pipelineStartedAtMs);
      if (phaseTimings && pipelineResult && typeof pipelineResult === 'object') {
        for (const key of ['policiesMs', 'compileMs', 'residencyMs']) {
          const value = Number(pipelineResult[key]);
          if (Number.isFinite(value)) phaseTimings[key] = value;
        }
      }
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
            committedAuthored: authored,
          });
        }
      } finally {
        recordAdmissionSlice(commitStartedAtMs);
        endAdmissionPhase(phaseTimings, 'commit', commitStartedAtMs);
        const tier1 = tier1CausalCounters();
        if (tier1) tier1.countAuthoredAdmissionJob('commit');
      }
      if (!swapped) {
        releaseBoundaryResidency(renderer, boundary, 'authored-swap-not-committed', options.admissionEpoch);
      }
      return swapped;
    };
    if (options.overlapAuthoredPipelineCompile === true) {
      const pending = completeAdmission().catch(async (error) => {
        await handleAuthoredBoundaryAdmissionError(boundary, entity, renderer, swapped, error, authored,
          options, installedPreparedDisposer);
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
    await handleAuthoredBoundaryAdmissionError(boundary, entity, renderer, swapped, error, authored,
      options, installedPreparedDisposer);
    return false;
  }
}

async function handleAuthoredBoundaryAdmissionError(boundary, entity, renderer, swapped, error, authored = null, options = {}, installedDisposer = null) {
  const admissionEpoch = options && options.admissionEpoch;
  // A queued cancellation settles outside this underlying continuation. Dispose only this
  // detached result; boundary-owned slots/disposers may now belong to a replacement admission.
  if (!isAuthoredAdmissionBoundaryCurrent(options) || options.asyncAdmission?.signal.aborted) {
    if (!swapped && authored) await disposePreparedAuthoredShip(authored);
    return;
  }
  // A stall-aborted run keeps executing — promises cannot cancel — and its abandoned
  // continuation can throw after a fresh epoch committed the boundary. Cleanup legs are
  // already epoch/identity-guarded; the verdict writes were not: an unguarded mark or
  // 'unavailable' would overwrite the committed 'authored' state, delete the fresh run's
  // deferred publish, and drop the live ship off lock lists. Epoch mismatch alone misses an
  // aborted run whose boundary never re-minted — staleAuthoredRunVerdict covers both; cleanup
  // always runs regardless.
  const staleRunVerdict = staleAuthoredRunVerdict(boundary, options);
  if (!swapped) {
    releaseBoundaryResidency(renderer, boundary, 'authored-swap-failed', admissionEpoch);
    const cleanupErrors = [];
    const preparedDisposal = disposeOwnedPreparedBoundary(boundary, installedDisposer);
    if (preparedDisposal !== false) {
      try { await preparedDisposal; } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    } else {
      try { await releaseOwnerInstances(boundary, admissionEpoch); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
      if (authored && authored.root) {
        try { await disposePreparedAuthoredShip(authored); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
      }
    }
    if (!isAuthoredAdmissionBoundaryCurrent(options) || options.asyncAdmission?.signal.aborted) return;
    const failureCauses = error && Array.isArray(error.errors) && error.errors.length
      ? error.errors
      : [error];
    const previewTeardownOnly = failureCauses.every(
      (cause) => cause && cause.previewDisposed === true,
    );
    // The same lifecycle abort when the owner itself goes away mid-admission: a promoted
    // far actor that re-shelves (entity.alive flips false) makes isResidencyOwnerActive()
    // fail — the ship legitimately left, so there is no visual to publish. Count it with
    // preview teardown, not as a composition defect on the warning channel.
    const ownerInactiveOnly = failureCauses.every(
      (cause) => cause && /owner became inactive/i.test(String(cause && (cause.message || cause))),
    );
    if (!staleRunVerdict) {
      if ((ownerInactiveOnly || (entity && entity.alive === false)) && boundary.parent) {
        // Kept-GPU recook: the boundary outlived the entity record that owned this admission.
        // A terminal 'unavailable' here would strand the restored entity — the mesh is still
        // mounted and reattach re-requests the upgrade for its live owner.
        markAuthoredBoundaryForReadmission(boundary, 'owner-inactive');
      } else {
        // Fail closed: no substitute ship identity. Fix the load/composition bug; do not invent a junk hull.
        boundary.userData.authoredAssetState = 'unavailable';
        boundary.userData.authoredVisualRoot = 'none-build-failed';
        setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
      }
    }
    // A disposed preview rejects its in-flight compile/upload on teardown — the ordinary
    // hover-away case, not a composition defect. Keep the breadcrumb off the warning channel
    // so release evidence only counts real admission failures.
    const log = (previewTeardownOnly || ownerInactiveOnly) ? console.info : console.warn;
    log.call(console, previewTeardownOnly
      ? '[partsLibrary] authored preview admission released by disposal'
      : ownerInactiveOnly
        ? '[partsLibrary] authored admission aborted; owner left before publish'
        : '[partsLibrary] authored composition failed; no substitute visual published', {
      entity: entity && entity.id,
      // Selector fields decide which whole-ship map the entity needed — without them a
      // "no required packaged whole-ship selection" warning cannot name the missing row.
      defId: entity && entity.data && entity.data.defId,
      trafficRole: entity && entity.data && entity.data.trafficRole,
      assetRef: entity && entity.data && entity.data.assetRef,
      lootTableId: entity && entity.data && entity.data.lootTableId,
      silhouette: entity && entity.data && entity.data.silhouette,
      message: String(error && error.message || error),
      causes: error && Array.isArray(error.errors)
        ? error.errors.map((cause) => String(cause && (cause.message || cause.reason || cause))).slice(0, 8)
        : undefined,
    });
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], 'Authored composition failure cleanup failed', {
        cause: error,
      });
    }
  } else if (!staleRunVerdict) {
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
  // Registry detachment cannot wait on disposal success: a thrown cleanup error must not leave
  // the boundary and its prepared roots pinned in sceneState.preparedAuthoredRoots forever.
  unregisterPreparedAuthoredAdmission(authored);
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, 'Prepared authored ship cleanup failed');
  }
  authored.preparedCleanupComplete = true;
  return true;
}

async function disposePreparedShipBoundaryResources(boundary, authored, admissionEpoch = null) {
  const cleanupErrors = [];
  try { await releaseOwnerInstances(boundary, admissionEpoch); } catch (error) { cleanupErrors.push(error); }
  try { await disposePreparedAuthoredShip(authored); } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, 'Prepared authored boundary cleanup failed');
  }
  return true;
}

function installPreparedBoundaryDisposer(boundary, dispose) {
  if (!boundary?.userData || typeof dispose !== 'function') return false;
  let completion = null;
  const installed = () => {
    if (completion) return completion;
    completion = Promise.resolve().then(dispose).then(
      (result) => {
        // A newer run may have re-armed the slot while this wrapper's completion settled —
        // only delete the hook this install owns, never a replacement's.
        if (boundary.userData.__disposePreparedAuthoredBoundary === installed) {
          delete boundary.userData.__disposePreparedAuthoredBoundary;
        }
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
  boundary.userData.__disposePreparedAuthoredBoundary = installed;
  return installed;
}

export function disposePreparedAuthoredBoundary(boundary) {
  const dispose = boundary?.userData?.__disposePreparedAuthoredBoundary;
  return typeof dispose === 'function' ? dispose() : false;
}

/**
 * The compile pass stamps sfAdmittedOnce on the detached authored/packaged root; the submit
 * gate and the bloom unready hide read the boundary. Carry the stamp at every commit so a
 * later latch (contact-pick/bloom/mesh-build hold) on an already-linked boundary keeps it
 * drawn instead of whole-hiding the committed body until a boundary-level compile settles —
 * the 20-frame authored-body blank the ship path showed first.
 */
export function carryAdmittedOnceStamp(detachedRoot, boundary) {
  if (detachedRoot && detachedRoot.userData && detachedRoot.userData.sfAdmittedOnce === true
      && boundary && boundary.userData) {
    boundary.userData.sfAdmittedOnce = true;
  }
}

/**
 * Operand-B disposal guarded to the disposer this run installed. A stale run that reads the
 * boundary slot after a newer run re-armed it must not invoke (and so dispose) the live run's
 * prepared root — it cleans up only what it prepared itself.
 */
function disposeOwnedPreparedBoundary(boundary, installedDisposer) {
  return typeof installedDisposer === 'function'
    && boundary?.userData?.__disposePreparedAuthoredBoundary === installedDisposer
    ? disposePreparedAuthoredBoundary(boundary)
    : false;
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
// An aborted demotion owns a fully composed root whose packages were already compiled and
// uploaded while hidden (prepareAuthoredShipVisualPipelines). Neither failure path — the
// stale-race early return after upload or a compose/prepare throw — reaches the swap, so
// the root never gains a scene retainer and nothing else disposes it: every abandoned root
// leaves its renderer-registered geometries and materials behind forever (v6 evidence:
// residentResources stayed flat while renderer geometries climbed — growth with no ledger
// owner). Disposal mirrors the prepared-authored teardown: per-boundary package instances,
// instance-local materials/geometries, and the template pin; shared template/library
// resources are deliberately untouched.
async function disposeAbandonedWholeShipLodRoot(composed) {
  if (!composed || !composed.root) return false;
  try {
    await disposePreparedAuthoredShip(composed);
    return true;
  } catch (error) {
    // Cleanup failing must not mask the race or throw that abandoned the root.
    console.info('[partsLibrary] whole-ship LOD demotion abandonment cleanup failed', error);
    return false;
  }
}

export function installWholeShipLodFamilyController(boundary, entity, setActive, options = {}) {  if (!boundary || !entity || entity.isPlayer === true) return false;
  const selection = wholeShipVisualForEntity(entity, { ...options, requiredWholeShip: true });
  const family = selection && selection.lodFamily;
  if (!canInstallWholeShipLodFamily(entity, selection)) return false;
  if (boundary.userData.wholeShipLodFamilyInstalled) {
    // The commit already swapped a fresh root in; a refresh failure must not reject this
    // admission — the stale retained roots stay covered by the teardown hook.
    try {
      const refresh = boundary.userData.refreshWholeShipLodFamily;
      if (typeof refresh === 'function') refresh(options.committedAuthored || null);
    } catch (error) {
      console.warn('[partsLibrary] whole-ship LOD family refresh failed', error);
    }
    return false;
  }

  const roots = Object.create(null);
  // Composed authored records carry resources that live outside the node tree (package-instance
  // pins, flight-template holds, owner-local GPU objects); keep them per resident level so
  // teardown can release them even after a swap detached the level's root.
  const retainedComposed = new Map();
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
  if (options.committedAuthored && options.committedAuthored.root === roots.lod0) {
    retainedComposed.set('lod0', options.committedAuthored);
  }

  const baseUpdate = boundary.userData.updateLod;
  boundary.userData.wholeShipLodFamily = family;
  boundary.userData.wholeShipLodFamilyInstalled = true;
  boundary.userData.wholeShipLodActiveLevel = 'lod0';
  // Boundary-scoped so soak probes can inspect the live swap-back cache; teardown re-detaches it.
  boundary.userData.wholeShipLodRoots = roots;
  boundary.userData.wholeShipLodRetainedComposed = retainedComposed;

  const releaseComposedRetained = (composed) => {
    void Promise.resolve()
      .then(() => disposePreparedAuthoredShip(composed))
      .catch((error) => console.info('[partsLibrary] whole-ship LOD retained-level cleanup failed', error));
  };

  // Demoted-level roots stay retained-but-detached for instant swap-back; the teardown traversal
  // only reaches attached children, so each stale retained root re-attaches into the dying tree
  // to take the identical per-node disposal, then its composed record releases authored-level
  // pins once the traversal has finished.
  boundary.userData.disposeWholeShipLodRetained = () => {
    for (const level of Object.keys(roots)) {
      const root = roots[level];
      const composed = retainedComposed.get(level) || null;
      delete roots[level];
      retainedComposed.delete(level);
      if (!root) continue;
      if (root.parent !== boundary) boundary.add(root);
      if (composed) releaseComposedRetained(composed);
    }
  };

  // A re-commit swaps in a fresh authored root while this controller persists. Every retained
  // root belongs to the superseded admission — dispose it rather than retaining both generations
  // — then rebind lod0 to the freshly committed root.
  boundary.userData.refreshWholeShipLodFamily = (committedAuthored = null) => {
    // A re-commit supersedes every in-flight demotion: clearing pendingLevel fails the queued
    // load's own commit check (its root disposes through the lost-race path instead of ever
    // swapping over this generation), and the promise slot is reset to match.
    pendingLevel = null;
    transitionPromise = null;
    boundary.userData.wholeShipLodTransitionPromise = null;
    for (const level of Object.keys(roots)) {
      const root = roots[level];
      const composed = retainedComposed.get(level) || null;
      delete roots[level];
      retainedComposed.delete(level);
      if (!root) continue;
      if (root.parent === boundary) boundary.remove(root);
      if (composed) {
        releaseComposedRetained(composed);
      } else {
        try { disposeDetachedObject(root); }
        catch (error) { console.warn('[partsLibrary] whole-ship LOD stale root cleanup failed', error); }
      }
    }
    const fresh = findActiveRoot();
    roots.lod0 = fresh;
    if (committedAuthored && committedAuthored.root === fresh) {
      retainedComposed.set('lod0', committedAuthored);
    }
    activeLevel = 'lod0';
    boundary.userData.wholeShipLodActiveLevel = 'lod0';
    return !!fresh;
  };

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
    // setActive → syncActiveSurface points boundary.userData.lod at the incoming root's own
    // resolver, which holds whatever level it last resolved — fresh roots wake at lod0. Seed it
    // with the level now presented and the outgoing resolver's px, or a hull parked inside the
    // hysteresis band reads the opposite level off each root's resolver and swaps back every
    // frame (the probe's visible-lod-thrashing).
    const nextLod = next.userData && next.userData.lod;
    const prevLod = prev && prev !== next && prev.userData ? prev.userData.lod : null;
    if (nextLod && typeof nextLod.adopt === 'function') {
      nextLod.adopt(level, prevLod && Number.isFinite(prevLod.lastPx) ? prevLod.lastPx : undefined);
    }
    activeLevel = level;
    boundary.userData.wholeShipLodActiveLevel = level;
    return true;
  };

  boundary.userData.updateLod = (level) => {
    // Teardown clears the retained map; a dead boundary's selector must not schedule new loads.
    if (!roots.lod0) return;
    const requested = normalizeRequestedLod(level);
    if (typeof baseUpdate === 'function') baseUpdate(requested);
    // Runtime demotion is off (wholeShipLodPolicy.js): a 'load' resolves to 'keep', so a live ship
    // never admits a second file on the glass. Already-resident levels may still swap (instant).
    const transition = resolveLiveWholeShipLodTransition(activeLevel, requested, {
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
      // Hoisted so the catch can still dispose a root abandoned by a mid-prepare throw.
      let composed = null;
      try {
        const library = await preloadAuthoredAssetsForEntity(renderer, entity, {
          ...options,
          requiredWholeShip: true,
          forceWholeShipFile: file,
          bootstrapPlan: authoredPreloadPlanForEntityAtLod(entity, requested, options),
          libraryScope: 'whole-ship-lod-family',
          residencyRole: 'whole-ship-lod-family',
          // The demoted level composes outside the admission pipeline: without the boundary as
          // residency owner the package is only cache/bootstrap-owned and a sweep can evict it
          // between load and createInstance ("must be retained before creating an instance").
          residencyOwner: boundary,
          // A demotion is presentation-path work on a live boundary: splice its plan decode ahead
          // of queued ambient prefetch/runway entries so deep lookahead cannot delay the swap.
          admissionDeadline: true,
        });
        const publicationWait = waitForOpeningGraphPublicationRelease();
        if (publicationWait) await publicationWait;
        if (!shouldCommitWholeShipLodLoad(pendingLevel, requested, !!boundary.parent)) return;
        composed = await buildComposedShipAsync(entity, library, scene, boundary, {
          ...options,
          requiredWholeShip: true,
          forceWholeShipFile: file,
          residencyRole: 'whole-ship-lod-family',
        });
        if (!composed || !composed.root) {
          composed = null;
          return;
        }
        composed.root.visible = false;
        // The demoted root never went through the boundary's admission pipeline: without this its
        // programs link and its buffers upload inside the first frame it is drawn — a measured
        // bloomScene brick. Compile and upload it while still hidden, then swap. Compile uses the
        // shared flight admission path, which slices across presents in flight.
        await prepareAuthoredShipVisualPipelines(composed, options);
        if (!shouldCommitWholeShipLodLoad(pendingLevel, requested, !!boundary.parent)) {
          // Lost the race after the upload: the root is fully live in renderer memory but will
          // never be swapped in. Dispose it — returning here used to leak every uploaded
          // buffer/geometry of this demotion attempt (D24 growth with no residency owner).
          await disposeAbandonedWholeShipLodRoot(composed);
          composed = null;
          return;
        }
        roots[requested] = composed.root;
        retainedComposed.set(requested, composed);
        if (shouldCommitWholeShipLodLoad(pendingLevel, requested, !!boundary.parent)) swapTo(requested);
      } catch (error) {
        // A throw after compose abandons the same uploaded root — dispose before logging.
        if (composed) {
          await disposeAbandonedWholeShipLodRoot(composed);
          composed = null;
        }
        // AggregateError reasons do not survive console text capture, which leaves the
        // demotion failure undiagnosable in soak evidence. Name the causes inline.
        const causes = Array.isArray(error && error.errors)
          ? error.errors.map((cause) => String((cause && (cause.message || cause)) || '?')).slice(0, 6)
          : [String((error && (error.message || error)) || '?')];
        // Owner-inactive aborts are the expected race: the entity evicted, died, or the context
        // reset while the demoted level's pipelines were compiling. The active level stays put
        // and a later LOD request retries — teardown noise, not a defect worth a soak warning.
        // A "must be retained" throw is the same race one step later: the composed part's
        // package can only lose its boundary-owner retain — and thereby become sweepable — when
        // the demotion's residency context ended between library load and createInstance. A live,
        // claimed boundary keeps the mixed-lifetime pin, so the message cannot fire otherwise.
        const ownerGone = causes.length > 0
          && causes.every((cause) => /became inactive|owner.*inactive|must be retained before creating/i.test(cause));
        if (ownerGone) {
          console.info('[partsLibrary] whole-ship LOD demotion aborted; owner inactive', { causes });
        } else {
          console.warn('[partsLibrary] whole-ship LOD demotion failed; keeping active level', error, { causes });
        }
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
  assertQueuedAuthoredAdmissionActive(options, 'before-ship-publication');
  // A readable ship admitted after first paint has already passed the exact compile/upload gate.
  // The global publication freeze only fences leftover opening work; making this ship wait on it
  // would put the resolving marker back on the glass for the full first-flight hold.
  const live = authoredRuntimeState();
  const urgentFlightShip = options.urgentFirstFlightAdmission === true
    && live && live.mode === 'flight'
    && Number.isFinite(live.render && live.render.firstPlayableFrameAt)
    && live.render.sectorShellAdmission !== true;
  const publicationWait = urgentFlightShip ? null : waitForOpeningGraphPublicationRelease(options);
  if (publicationWait) {
    boundary.userData.authoredPreparePhase = 'awaiting-publication';
    await waitForAuthoredAdmission(publicationWait, options);
  }
  assertQueuedAuthoredAdmissionActive(options, 'after-ship-publication-wait');
  if (!boundary.parent) {
    if (preparedAuthored) {
      await disposePreparedShipBoundaryResources(boundary, preparedAuthored, options.admissionEpoch);
    }
    return false; // destroyed while assets or GPU programs were in flight
  }
  // A stale run must not commit — the boundary re-admitted under a newer epoch while this
  // run parked (stall-abort readmission), the job was stall-aborted, or its owner died.
  // The live epoch's commit owns the boundary; this run disposes only what it prepared.
  if ((options.admissionEpoch != null && boundary.userData.admissionEpoch != null
        && boundary.userData.admissionEpoch !== options.admissionEpoch)
      || (typeof options.isAbortedStalledAdmission === 'function' && options.isAbortedStalledAdmission())
      || (entity && entity.alive === false)) {
    if (preparedAuthored) {
      await disposePreparedShipBoundaryResources(boundary, preparedAuthored, options.admissionEpoch);
    }
    return false;
  }

  const liveComposeOptions = {
    ...options,
    fallbackRoot,
    emptyAdmissionSubstrate: isEmptyAdmissionSubstrate(fallbackRoot),
  };
  const authored = preparedAuthored || (
    mayComposeAuthoredShipLive(liveComposeOptions)
      ? await buildComposedShipAsync(entity, library, scene, boundary, options)
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
    // The async driver's mid-compose abort returns null on a stale verdict — stamping the
    // boundary 'unavailable' here would overwrite a live epoch's state; that verdict belongs
    // to the live admission.
    if (staleAuthoredRunVerdict(boundary, options)
      || (entity && entity.alive === false)
      || !boundary.parent) return false;
    boundary.userData.authoredAssetState = 'unavailable';
    boundary.userData.authoredVisualRoot = 'none-build-failed';
    setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
    return false;
  }
  // Composition may now span frames: re-run the staleness gate after it resolves so a
  // re-admission or abort that landed mid-compose cannot publish a stale-era ship.
  if ((options.admissionEpoch != null && boundary.userData.admissionEpoch != null
        && boundary.userData.admissionEpoch !== options.admissionEpoch)
      || (typeof options.isAbortedStalledAdmission === 'function' && options.isAbortedStalledAdmission())
      || (entity && entity.alive === false)) {
    await disposePreparedShipBoundaryResources(boundary, authored, options.admissionEpoch);
    return false;
  }
  if (options.deferBoundaryPublication === true
      && typeof boundary.userData.__disposePreparedAuthoredBoundary !== 'function') {
    installPreparedBoundaryDisposer(boundary, () => (
      disposePreparedShipBoundaryResources(boundary, authored, options.admissionEpoch)
    ));
  }
  if (!boundary.parent) {
    if (options.deferBoundaryPublication === true) await disposePreparedAuthoredBoundary(boundary);
    else await disposePreparedShipBoundaryResources(boundary, authored, options.admissionEpoch);
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
  carryAdmittedOnceStamp(authored.root, boundary);

  boundary.userData.authoredReadableFallbackRetained = false;
  boundary.userData.authoredVisualRoot = 'authored-root';
  // The visualBounds copied off the resolving-marker substrate was the marker's own drawn
  // envelope (~1.9x hull radius); a committed boundary classifies from the measured authored
  // hull via drawnCullRadiusForMesh.
  delete boundary.userData.visualBounds;
  boundary.userData.authoredParts = authored.authoredParts;
  boundary.userData.authoredSlots = authored.authoredSlots;
  boundary.userData.proceduralFallbackParts = authored.fallbackParts;
  boundary.userData.authoredCompositionId = authored.root.userData.assetId;
  boundary.userData.authoredRenderContract = authored.root.userData.renderContract;
  boundary.userData.assetId = authored.root.userData.assetId;
  boundary.userData.renderContract = authored.root.userData.renderContract;
  boundary.userData.__socketCache = new Map(); // invalidate renderer socket lookups across the swap

  const publish = () => {
    // The pre-commit prepare touched this root while it was detached; publish-time state can
    // still resolve a program key that touch never produced (final LOD from primeAuthoredState,
    // owner bindings, parts minted inside commit). Pay any residual link here — in the
    // admission continuation — instead of inside the first presented bloom pass.
    if (typeof options.touchAuthoredExactTarget === 'function') {
      try { options.touchAuthoredExactTarget(authored.root); }
      catch (error) { console.warn('[partsLibrary] authored publish touch failed', error); }
    }
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
      // The cached bootstrap belongs to the renderer, not the first boundary that asks for it.
      asyncAdmission: null,
      signal: null,
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
  const library = await waitForAuthoredAdmission(loadCanonicalLibrary(renderer, options), options);
  assertQueuedAuthoredAdmissionActive(options, 'after-canonical-library');
  let plan = authoredPreloadPlanForEntity(entity, options);
  // Combat/traffic identity can land while a captured plan's GLB is still decoding. Keep admitting
  // until the live selector's records are in the library Map — sector prewarm residency is not
  // that Map, so compose would otherwise throw on a hull that was never admitted.
  //
  // An owner that goes inactive mid-preload must never hand compose an incomplete library as a
  // success: its own loads resolve null by design (assetLoader cancels owner-departed decodes
  // silently) and the resident-only slot rewrite can drop the required whole-ship record
  // entirely. Resolving here made the whole-ship LOD demotion compose against that hole and warn
  // "release mode requires … it did not pass the live authored-asset loader." Abort with the
  // established owner-inactive signal instead — the admission error handler and the LOD-demotion
  // owner-gone classifier both log it informationally and a later request retries.
  const ownerInactive = () => (
    typeof options.isResidencyOwnerActive === 'function' && options.isResidencyOwnerActive() !== true
  );
  for (let attempt = 0; attempt < 4; attempt++) {
    if (ownerInactive() && !libraryHasPreloadPlan(library, plan, renderer)) {
      // A departure while the demand still waits in the admission lane - owner already gone before
      // this demand's own retain/admit began (attempt 0) - is a quiet cancellation, not an
      // incomplete asset failure: the queued job is discarded as cancelled-before-load before any
      // compose (jobStillNeeded/cancelQueuedJob) and prefetch callers only warm the decode cache,
      // so the untouched library Map resolves as the ordinary cancelled demand those callers
      // already expect. A required-whole-ship demand has no such gate - the LOD demotion composes
      // straight against the resolved Map, and resolveRequiredWholeShipRecord would throw
      // "release mode requires . it did not pass the live authored-asset loader." on any Map
      // missing the record (the PQ-033.02 hole the abort below closes) with no cancelled Map
      // shape its compose reads as nothing - so that shape keeps the abort even at entry.
      if (attempt === 0 && options.requiredWholeShip !== true) return library;
      throw new Error('Authored visual preparation owner became inactive during entity preload');
    }
    retainLibraryPlan(renderer, library, plan, options);
    await waitForAuthoredAdmission(admitEntityPlan(renderer, options, library, plan), options);
    assertQueuedAuthoredAdmissionActive(options, 'after-entity-plan');
    if (ownerInactive() && !libraryHasPreloadPlan(library, plan, renderer)) {
      throw new Error('Authored visual preparation owner became inactive during entity admission');
    }
    const currentPlan = authoredPreloadPlanForEntity(entity, options);
    if (libraryHasPreloadPlan(library, currentPlan, renderer)) {
      retainLibraryPlan(renderer, library, currentPlan, options);
      return library;
    }
    plan = currentPlan;
  }
  const missing = missingAuthoredPreloadEntries(library, plan);
  throw new Error(
    `Authored entity assets are incomplete for ${entity && entity.id || 'unknown ship'}`
    + (missing.length ? `: missing ${missing.join(', ')}` : '.'),
  );
}

function admitEntityPlan(renderer, options, library, plan) {
  const partRoot = isReleaseAssetMode(options) ? PART_RELEASE_ROOT : PART_ROOT;
  let lanes = planAdmissionByRenderer.get(renderer);
  if (!lanes) {
    lanes = new Map();
    planAdmissionByRenderer.set(renderer, lanes);
  }
  let lane = lanes.get(partRoot);
  if (!lane) {
    lane = { running: false, queued: [] };
    lanes.set(partRoot, lane);
  }
  return new Promise((resolve, reject) => {
    // Rank fields read the options bag live: a promotion stamped mid-queue re-ranks the
    // entry the next time the lane re-sorts at pump.
    const entry = {
      options,
      get deadline() { return !!(options && (options.admissionDeadline === true || options.admissionVisible === true)); },
      get visible() { return !!(options && options.admissionVisible === true); },
      run: async () => {
        assertQueuedAuthoredAdmissionActive(options, 'before-entity-plan');
        // Re-check only after earlier demand has committed its records. Checking before joining
        // the lane permits duplicate decodes; copying slot arrays outside the lane permits
        // last-writer data loss.
        if (!libraryHasPreloadPlan(library, plan, renderer)) {
          // An ambient run still occupying the lane must not hold a queued deadline entry
          // for the rest of its plan — break between files so the spliced entry runs next;
          // the unfinished remainder re-queues through the ordinary demand path. Deadline
          // entries keep their own run to settle (they are the presentation path).
          const runOptions = entry.deadline === true ? options : {
            ...options,
            hasQueuedDeadlineEntry: () => lane.queued.some((queued) => queued.deadline === true),
          };
          await loadPlanIntoLibrary(renderer, runOptions, library, plan);
        }
        return library;
      },
      resolve,
      reject,
    };
    // The lane stays serial, but not every caller sits on the player's deadline: prefetch and
    // runway decodes are ambient warm-up while the admitted upgrade job is the presentation
    // path itself. Urgent entries splice ahead of lower-ranked queued entries — visible
    // outranks deadline, which outranks ambient — while the running task and earlier
    // same-or-higher-ranked entries keep their order.
    const rankOf = (queued) => (queued.visible === true ? 2 : (queued.deadline === true ? 1 : 0));
    const entryRank = rankOf(entry);
    if (entryRank > 0) {
      let index = lane.queued.length;
      while (index > 0 && rankOf(lane.queued[index - 1]) < entryRank) index--;
      lane.queued.splice(index, 0, entry);
    } else {
      lane.queued.push(entry);
    }
    pumpEntityPlanLane(lanes, partRoot, lane);
  });
}

function pumpEntityPlanLane(lanes, partRoot, lane) {
  if (lane.running) return;
  // Re-rank live flags before each pick: an entry promoted while queued takes the lane
  // ahead of entries that outranked its frozen-at-push rank.
  lane.queued.sort((a, b) => (b.visible === true ? 2 : (b.deadline === true ? 1 : 0)) - (a.visible === true ? 2 : (a.deadline === true ? 1 : 0)));
  const entry = lane.queued.shift();
  if (!entry) {
    lanes.delete(partRoot);
    return;
  }
  lane.running = true;
  entry.run().then((value) => {
    lane.running = false;
    entry.resolve(value);
    pumpEntityPlanLane(lanes, partRoot, lane);
  }, (error) => {
    lane.running = false;
    entry.reject(error);
    pumpEntityPlanLane(lanes, partRoot, lane);
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
  // Flatten the plan once so file boundaries can be counted: the terminal file must not pay
  // a present-yield — a frame boundary after the last decode only delays the compose that
  // follows it, which is the pop latency the boundary exists to prevent.
  const pendingFiles = [];
  const recordsBySlot = new Map();
  for (const [slot, files] of Object.entries(plan || {})) {
    const records = Array.isArray(library.get(slot))
      ? library.get(slot).filter((record) => recordIsResident(record, renderer)) : [];
    recordsBySlot.set(slot, records);
    for (const file of files || []) pendingFiles.push({ slot, file });
  }
  for (let i = 0; i < pendingFiles.length; i++) {
    const { slot, file } = pendingFiles[i];
    const records = recordsBySlot.get(slot);
    if (records.some((record) => recordUrlEndsWith(record, file, renderer))) continue;
    if (typeof options.isResidencyOwnerActive === 'function' && !options.isResidencyOwnerActive()) break;
    // A deadline entry queued behind this ambient run takes the lane at the next file
    // boundary; the remaining files re-admit on their own demand.
    if (typeof options.hasQueuedDeadlineEntry === 'function' && options.hasQueuedDeadlineEntry()) break;
    const url = `${partRoot}${file}`;
    const diagnostic = beginDecodeAdmission(renderer, url, slot);
    let record;
    try {
      record = await waitForAuthoredAdmission(loadPart(url, {
        renderer,
        slot,
        optional: true,
        residencyOwner: options.residencyOwner,
        residencyRole: options.residencyRole,
        sectorId: options.sectorId,
        isResidencyOwnerActive: options.isResidencyOwnerActive,
        admissionDeadline: options.admissionDeadline,
        admissionVisible: options.admissionVisible,
        signal: options.signal,
      }), options);
      assertQueuedAuthoredAdmissionActive(options, 'after-plan-file');
    } finally {
      finishDecodeAdmission(renderer, diagnostic);
    }
    if (record) records.push(record);
    // File boundary: same pacing contract as the compose/compile stages — in flight a
    // multi-file plan must let a presented frame land between serial decode+upload units
    // instead of stacking one uninterrupted block across a visible beat.
    if (i < pendingFiles.length - 1
        && options.yieldBetweenGpuStages === true
        && typeof options.yieldToNextPresent === 'function') {
      try { await waitForAuthoredAdmission(options.yieldToNextPresent(), options); }
      catch { assertQueuedAuthoredAdmissionActive(options, 'after-plan-present'); }
    }
  }
  for (const [slot, records] of recordsBySlot) library.set(slot, records);
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

function libraryHasPreloadPlan(library, plan, renderer = null) {
  if (!(library instanceof Map)) return false;
  for (const [slot, files] of Object.entries(plan || {})) {
    const records = library.get(slot);
    if (!Array.isArray(records)) return false;
    for (const file of files || []) {
      if (!records.some((record) => recordUrlEndsWith(record, file, renderer))) return false;
    }
  }
  return true;
}

// Stand-in borrows: a record reaches lodStandInFor through call chains that never carry the
// renderer, so the resident check registers which residency registry answered it. The mount
// site then re-verifies + retains through that registry instead of trusting the frozen stamp —
// record.residency.state is written once at decode and never flipped on later eviction.
const standInRecordRegistry = new WeakMap();

export function residencyRegistryForStandInRecord(record) {
  return (record && standInRecordRegistry.get(record)) || null;
}

function recordUrlEndsWith(record, file, renderer = null) {
  if (!recordIsResident(record, renderer) || typeof record.url !== 'string' || !record.url) return false;
  return normalizePartUrl(record.url).endsWith(file);
}

function recordIsResident(record, renderer = null) {
  if (!record) return false;
  const residency = record.residency;
  if (!residency) return true;
  const registry = renderer && residency.key ? getAssetResidency(renderer) : null;
  if (registry) {
    standInRecordRegistry.set(record, registry);
    // Only positive registry knowledge overrides the record's stamp: an entry that exists
    // and is no longer 'resident' means the bytes genuinely went away. An absent key means
    // the record was never tracked here (settled-cache peeks, synthetic records, records
    // decoded before this registry existed) — the stamp stays the source of truth, as it
    // was before the live check.
    if (typeof registry.knownNonResident === 'function' && registry.knownNonResident(residency.key)) {
      return false;
    }
  }
  return residency.state === 'resident';
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
  // The detached-owner sweep can release a boundary owner between the admission request's
  // revive (residencyOptionsForBoundary) and this retain — a released mark would silently
  // fail every pin below and leave the committed body on evictable warm/cache leases.
  // Admission intent revives, matching the per-request contract.
  if (typeof residency.isOwnerReleased === 'function' && residency.isOwnerReleased(owner)
      && typeof residency.reviveOwner === 'function') {
    residency.reviveOwner(owner);
  }
  let retained = 0;
  for (const [slot, files] of Object.entries(plan || {})) {
    const records = library.get(slot) || [];
    for (const file of files || []) {
      const record = records.find((candidate) => recordUrlEndsWith(candidate, file, renderer));
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

export function releaseBoundaryResidency(renderer, boundary, reason, admissionEpoch = null) {
  const residency = renderer && getAssetResidency(renderer);
  // The boundary owns its composed parts' instance-pool slots. THREE's `removed` event only
  // reaches the outermost detached root, so a boundary nested under an entity mesh never gets
  // the listener drain — the slot keeps `owner -> boundary` alive and the chunk can never
  // retire. Every residency release doubles as the owner-instance drain.
  // Epoch guard: a job-scoped release from an abandoned admission run (stall abort, owner-
  // inactive re-attach) must not free the replacement epoch's retains — released marks on the
  // owner are permanent until the next request revives them, and the drain below would tear
  // the new epoch's instance slots the same way. Detach/disposal callers pass no epoch.
  if (admissionEpoch != null && boundary && boundary.userData
      && boundary.userData.admissionEpoch !== admissionEpoch) return 0;
  if (boundary) releaseOwnerInstances(boundary);
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

// Diagnostic for the AUTHORED_LIBRARY_UNAVAILABLE gate: name which plan entries never became
// usable instead of failing closed with a bare "incomplete". A record whose URL is in the slot
// but whose residency is not 'resident' was decoded then dropped (owner cancellation, residency
// churn); a slot/URL with no record at all never arrived (decode failure or a plan/map drift).
export function missingAuthoredPreloadEntries(library, plan, limit = 12) {
  const missing = [];
  for (const [slot, files] of Object.entries(plan || {})) {
    const records = library instanceof Map ? library.get(slot) : null;
    for (const file of files || []) {
      if (Array.isArray(records) && records.some((record) => recordUrlEndsWith(record, file))) continue;
      const arrived = Array.isArray(records) && records.some(
        (record) => record && typeof record.url === 'string' && normalizePartUrl(record.url).endsWith(file),
      );
      missing.push(`${slot}:${file}${arrived ? ' (not resident)' : ''}`);
      if (missing.length >= limit) {
        missing.push('…');
        return missing;
      }
    }
  }
  return missing;
}

function assertLibraryPlanUsable(library, plan, scope = 'canonical') {
  const missing = missingAuthoredPreloadEntries(library, plan);
  if (missing.length) {
    throw new Error(
      `Authored ${scope || 'canonical'} library is incomplete for its required preload plan: `
      + `missing ${missing.join(', ')}`,
    );
  }
  return library;
}

function* composedShipSteps(entity, library, scene, ownerBoundary, options = {}, composeTrace = null) {
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
  // Expose the in-progress root to the async driver: an early-returned generator simply dies
  // suspended, so the caller cannot reach the partially built root to dispose it otherwise.
  if (composeTrace) composeTrace.root = root;
  root.name = `GLTFKit_${entity.data && entity.data.defId || 'ship'}`;
  root.userData.kind = 'ship';
  root.userData.assetId = `GLTFKIT_${entity.data && entity.data.defId || 'SHIP'}_${assemblySeed.toString(16)}`;
  root.userData.loadoutFingerprint = loadoutFingerprint;

  const hull = new THREE.Group();
  hull.name = `${root.name}_Hull`;
  root.add(hull);
  root.userData.hull = hull;

  // Every entity-derived pick is resolved here, before the first yield — the async driver
  // may interleave frames between part instantiations, and a loadout change mid-compose must
  // not assemble a torn hull-weapons-mismatch under a templateKey that no longer matches it.
  const hullRecord = selected.get('hull');
  const authoredHullLevels = hullRecord ? authoredLevels(hullRecord) : new Set();
  const shipDef = SHIP_BY_ID.get(entity.data && entity.data.defId) || null;
  const weaponMounts = wholeShip
    ? [] : authoredWeaponMounts(entity, shipDef, library.get('weapon') || [], assemblySeed);
  const podMounts = wholeShip
    ? [] : authoredPodMounts(entity, shipDef, library.get('pod') || [], assemblySeed);
  const gearMount = wholeShip
    ? null : authoredGearMount(entity, shipDef, library.get('gear') || [], assemblySeed);
  const greebleMounts = wholeShip
    ? [] : authoredGreebleMounts(entity, shipDef, library.get('greeble') || [], assemblySeed);
  const podRecordsForFit = library.get('pod') || [];
  const greebleRecordsForFit = library.get('greeble') || [];
  const authoredJobs = wholeShip ? authoredHullJobs(hullRecord) : null;
  const integrated = wholeShip && hullIntegratesHardpoints(hullRecord);
  const fittedMounts = integrated
    ? [] : fittedModuleMounts(entity, podRecordsForFit, greebleRecordsForFit, assemblySeed);
  const fitWeaponMounts = (wholeShip && !integrated)
    ? authoredWeaponMounts(entity, shipDef, library.get('weapon') || [], assemblySeed, { fittedOnly: true })
    : [];
  const fittedDriveGlow = visibleFittingsForEntity(entity).driveGlow;

  const { materials, built: builtFallbackMaterials } = fallbackMaterials(palette, visualSeed);
  const bindings = createBindings();
  if (composeTrace) composeTrace.bindings = bindings;
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

  yield;
  if (hullRecord) {
    instantiatePart(hullRecord, hull, {
      position: [0, 0, 0], targetLength: 1.72, label: 'Hull',
    }, palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    noteUsed('hull', hullRecord);
  } else {
    fallbackParts.push('hull');
  }
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
    yield;
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
      yield;
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
      yield;
      instantiatePart(finRecord, hull, placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    } else {
      ownerLocalFallbackRoots.push(buildFallbackFin(hull, materials, placement));
    }
  }
  if (finRecord) noteUsed('fin', finRecord);
  else fallbackParts.push('fin');
  } // end !wholeShip — skip cockpit/engine/fin for authored whole-ship bodies (baked in)

  if (!wholeShip) {
  if (weaponMounts.length) {
    let mounted = 0;
    for (const mount of weaponMounts) {
      if (!mount.record) continue;
      yield;
      instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      noteUsed('weapon', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('weapon');
  }

  if (podMounts.length) {
    let mounted = 0;
    for (const mount of podMounts) {
      if (!mount.record) continue;
      yield;
      const partRoot = instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      if (mount.damageRole === 'armor') bindings.armor.push(partRoot);
      else bindings.secondary.push(partRoot);
      noteUsed('pod', mount.record);
      mounted++;
    }
    if (!mounted) fallbackParts.push('pod');
  }

  if (gearMount && gearMount.record) {
    yield;
    const partRoot = instantiatePart(gearMount.record, hull, gearMount.placement,
      palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
    bindings.secondary.push(partRoot);
    noteUsed('gear', gearMount.record);
  } else if (gearMount) {
    fallbackParts.push('gear');
  }

  if (greebleMounts.length) {
    let mounted = 0;
    for (const mount of greebleMounts) {
      if (!mount.record) continue;
      yield;
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
  attachRetroMounts(hull, entity, palette, selected.get('engine')?.url, hullRecord);

  // PQ-176.04 — VISIBLE BUILDS. Fitted hardware rides the authored SOCKET_* contract so a refit
  // reads on the hull: budget-heavy modules bolt on, whole-ship bodies sprout the guns actually
  // fitted, and the drive speaks through nacelle glow below. ships.js emits
  // ship:appearanceChanged on any loadout change, which rebuilds this composition — the parts
  // hot-swap with the fit.
  {
    for (const mount of fittedMounts) {
      if (!mount.record) continue;
      // A production body that already models the hardware for this job (Kestrel's mining head)
      // shows the fit through that hardware; a second kit part on the same socket reads as a box
      // bolted to the nose.
      if (authoredJobs && authoredJobs.has(mount.socket)) continue;
      const placement = mount.placement;
      const socketPos = hullLocalPositionForSocket(hull, mount.socket);
      if (socketPos) {
        placement.position = [
          socketPos[0] + mount.ordinal * 0.14,
          socketPos[1] + mount.ordinal * 0.02,
          socketPos[2] + mount.ordinal * 0.10,
        ];
      }
      if (wholeShip) keepPlacementBehindNose(placement, mount.record, hullRecord);
      yield;
      const partRoot = instantiatePart(mount.record, hull, placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      bindings.secondary.push(partRoot);
      noteUsed(String(mount.file).startsWith('pods/') ? 'pod' : 'greeble', mount.record);
    }
  }

  if (wholeShip && !integrated) {
    const weaponSocketPos = hullLocalPositionForSocket(hull, 'SOCKET_Weapon_Front');
    for (let index = 0; index < fitWeaponMounts.length; index += 1) {
      const mount = fitWeaponMounts[index];
      if (!mount.record) continue;
      if (weaponSocketPos) {
        const side = index === 0 ? 0 : (index % 2 === 0 ? -1 : 1);
        const row = Math.ceil(index / 2);
        mount.placement.position = [
          weaponSocketPos[0] - row * 0.06,
          weaponSocketPos[1],
          weaponSocketPos[2] + side * (0.08 + row * 0.05),
        ];
      }
      keepPlacementBehindNose(mount.placement, mount.record, hullRecord);
      yield;
      instantiatePart(mount.record, hull, mount.placement,
        palette, scene, ownerBoundary, bindings, mutableMaterials, staticBatches);
      noteUsed('weapon', mount.record);
    }
  }

  yield;
  staticBatches.flush();
  reconcileMaplessHullMaterialAliases(palette);
  canonicalizeMaplessHullMaterials(root, palette);

  const primaryDrive = completeDriveBinding(bindings);
  // A fitted drive is read through the nacelle it powers: tint the bound core + plume so a
  // Fusion or Warp fit visibly re-colors the exact glow the flight VFX pulse each frame.
  if (fittedDriveGlow) applyFittedDriveGlow(bindings, mutableMaterials, fittedDriveGlow);
  normalizeWaspDomeGlass(root, entity);
  const navLightBase = bindings.navLights.map((mesh) => (
    mesh && mesh.material && Number.isFinite(mesh.material.emissiveIntensity)
      ? mesh.material.emissiveIntensity : 1
  ));

  yield;
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
  // ANI-00: mount the authored-motion driver beside the damage/drive closures the renderer
  // already calls per frame. Detachment rides the disposeObject userData-callback grammar.
  attachAuthoredMotionDriver(root, entity, bindings.authoredMotions);

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
    ...builtFallbackMaterials,
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
  if (composeTrace) composeTrace.root = null;
  return result;
}

function buildComposedShip(entity, library, scene, ownerBoundary, options = {}) {
  const steps = composedShipSteps(entity, library, scene, ownerBoundary, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

// Synchronous composition runs uninterruptibly for every authored part a kit carries — a
// heavy multi-part ship (hull + cockpit + engines + fins + mounts + fitted modules) is one
// ms-scale block inside the frame that asked for it. This driver walks the same steps under
// a per-slice budget: yields are no-ops while a slice stays inside the budget, so a light
// ship still composes in a single pass, while a heavy one spreads part instantiation across
// a few frames instead of one hitch. The yield point is rAF-paced (never a bare timer — see
// scheduleUpgradeFrame) and the root is not published until commit, so a mid-compose frame
// can never present a partially assembled ship.
// Yield thresholds for the async driver (per rAF frame, not per step): ambient warms pace at
// half a 60 fps frame; admissions already on the readable glass pace at ~3/4 of one. The
// earlier 4 ms threshold burned a whole frame per slice — ~24% utilization, ~5-10× longer
// pending-visible windows — so the budget is per-frame, not per-4 ms.
const COMPOSE_FRAME_MS = 8;
const COMPOSE_FRAME_MS_URGENT = 12;

function composeYield() {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve()));
  }
  return Promise.resolve();
}

async function buildComposedShipAsync(entity, library, scene, ownerBoundary, options = {}) {
  // The trace carries the partially built root back out if the run is early-returned so the
  // driver can dispose it — the generator itself stays untouched by the abort (the sync driver
  // composes without a trace and keeps its single-pass semantics bit-identical).
  const composeTrace = { root: null };
  const steps = composedShipSteps(entity, library, scene, ownerBoundary, options, composeTrace);
  const now = () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now() : Date.now()
  );
  let sliceStarted = now();
  // Per-frame budget: one rAF yield costs a whole frame, so each yield should pack as much
  // compose work as the frame can absorb. 4 ms/yield ran at ~24% frame utilization and
  // stretched the serial admission window ~5-10× (pending ships stay hidden by policy — the
  // window IS the pop-in). 8 ms keeps a single compose from bricking a frame while halving
  // admission wall-time; ships whose admission is on the readable glass get 12 ms — their
  // pending window is directly user-visible. Ambient warms keep the conservative floor. Read
  // live per slice so a mid-compose admission join boosts the remaining tail immediately.
  const frameBudgetMs = () => (options.admissionVisible === true || options.admissionDeadline === true)
    ? COMPOSE_FRAME_MS_URGENT : COMPOSE_FRAME_MS;
  let step = steps.next();
  while (!step.done) {
    const sliceMs = now() - sliceStarted;
    if (sliceMs >= frameBudgetMs()) {
      // Report the slice's cost before yielding: other frame-paced slicers (the compile drain)
      // read the ledger later this frame and stand down instead of stacking their own budget.
      notePacedFrameSpend(sliceMs);
      await composeYield();
      sliceStarted = now();
      // A re-admission, stall-abort, owner death, or boundary detach that lands mid-compose
      // must not keep burning slices (and then the full GPU prepare) on a ship the commit gate
      // would only dispose at the end. Same verdicts commitAuthoredBoundary re-runs after
      // compose — checked here per-slice so the abandoned run exits before its next slice.
      if (staleAuthoredRunVerdict(ownerBoundary, options)
        || (entity && entity.alive === false)
        || (ownerBoundary && !ownerBoundary.parent)) {
        try { steps.return(undefined); } catch { /* generator teardown is best-effort */ }
        if (composeTrace.root) {
          // Cancel pool admissions the aborted run claimed — slot release stays owner-bound, but a
          // cancelled admission stops prepare/activate from doing GPU work for a dead run and lets
          // the retirement path reclaim the slots early instead of at boundary teardown.
          const poolAdmissions = composeTrace.bindings && composeTrace.bindings.packagePoolAdmissions;
          if (poolAdmissions instanceof Set) {
            for (const admission of poolAdmissions) {
              if (admission) admission.cancelled = true;
            }
          }
          const partial = composeTrace.root;
          partial.traverse((object) => {
            const instance = object && object.userData ? object.userData.renderPackageInstance : null;
            if (instance && typeof instance.dispose === 'function') {
              try { instance.dispose('compose-aborted'); } catch { /* best-effort */ }
            }
            if (object && object.userData && object.userData.spacefaceStaticBatch === true
              && object.geometry && typeof object.geometry.dispose === 'function') {
              try { object.geometry.dispose(); } catch { /* best-effort */ }
            }
          });
          try { disposeDetachedObject(partial); } catch { /* partial-root disposal is best-effort */ }
          composeTrace.root = null;
        }
        return null;
      }
    }
    step = steps.next();
  }
  notePacedFrameSpend(now() - sliceStarted);
  return step.value;
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
  // Whole-ship bodies skip structural accessories, but the selected engine determines the visible
  // bow retro hardware even when its main bell is baked into the body.
  const consumedSelected = wholeShip
    ? [...selected.entries()].filter(([slot]) => slot === 'hull' || slot === 'engine')
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
    // Whole-ship bodies also mount fitted weapons/modules on their sockets (PQ-176.04), so the
    // loadout must key the template for every body — otherwise a refit reuses a stale composition.
    weapons: data.weapons || [],
    fittings: data.fittings || [],
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
  // The source tree keeps its real userData; only the clone reads the projected copy, and callers
  // such as createFlightRootTemplateEntry read source userData.hull right after this returns.
  const sourceUserData = new Map();
  let templateRoot = null;
  try {
    if (typeof sourceRoot.traverse === 'function') {
      sourceRoot.traverse((object) => {
        sourceUserData.set(object, object.userData);
        object.userData = flightTemplateCloneUserData(object.userData);
      });
    }
    templateRoot = sourceRoot.clone(true);
  } finally {
    for (const [object, userData] of sourceUserData) object.userData = userData;
  }
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
    cloned = cloneMaterialPreservingShaderHooks(material);
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
    cloned = cloneMaterialPreservingShaderHooks(material);
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

// three.js deep-copies userData inside Object3D.copy with JSON.parse(JSON.stringify(...)), so any
// THREE object parked on userData drags its whole material/texture graph through Texture.toJSON and
// serializeImage. Every key that costs anything to serialize here is deleted again by the sanitize
// and clear passes a few lines later, so the serialization is pure waste: project the source
// userData down to what survives those passes before the clone reads it.
const FLIGHT_TEMPLATE_THREE_VALUE_FLAGS = Object.freeze([
  'isObject3D',
  'isMaterial',
  'isTexture',
  'isSource',
  'isBufferGeometry',
  'isRenderTarget',
]);
const FLIGHT_TEMPLATE_DROP = Symbol('flightTemplateDrop');

function scrubFlightTemplateCloneValue(value, stack) {
  if (typeof value === 'function') return FLIGHT_TEMPLATE_DROP;
  if (!value || typeof value !== 'object') return value;
  if (FLIGHT_TEMPLATE_THREE_VALUE_FLAGS.some((flag) => value[flag] === true)) return FLIGHT_TEMPLATE_DROP;
  // A cycle already throws inside JSON.stringify; hand the value back so that stays true.
  if (stack.has(value)) return value;
  const prototype = Object.getPrototypeOf(value);
  const plain = Array.isArray(value) || prototype === Object.prototype || prototype === null;
  if (!plain) return value;
  stack.add(value);
  try {
    let changed = false;
    if (Array.isArray(value)) {
      const next = [];
      for (const entry of value) {
        const scrubbed = scrubFlightTemplateCloneValue(entry, stack);
        if (scrubbed === FLIGHT_TEMPLATE_DROP) { changed = true; continue; }
        if (scrubbed !== entry) changed = true;
        next.push(scrubbed);
      }
      return changed ? next : value;
    }
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const scrubbed = scrubFlightTemplateCloneValue(entry, stack);
      if (scrubbed === FLIGHT_TEMPLATE_DROP) { changed = true; continue; }
      if (scrubbed !== entry) changed = true;
      next[key] = scrubbed;
    }
    return changed ? next : value;
  } finally {
    stack.delete(value);
  }
}

function flightTemplateCloneUserData(userData) {
  const projected = dropFlightTemplateDynamicUserData(sanitizeFlightTemplateUserData(userData));
  const scrubbed = scrubFlightTemplateCloneValue(projected, new Set());
  return scrubbed === FLIGHT_TEMPLATE_DROP ? {} : scrubbed;
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

function dropFlightTemplateDynamicUserData(data) {
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
  return data;
}

function clearFlightTemplateDynamicUserData(root) {
  if (!root) return;
  root.traverse((object) => {
    object.userData = dropFlightTemplateDynamicUserData(object.userData || {});
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
  attachAuthoredMotionDriver(root, entity, bindings.authoredMotions);
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
    for (const material of objectMaterials) {
      // Package subtrees recreated through instantiateRenderPackagePart carry the fleet-shared
      // authored variants — the same spacefaceSharedAsset exclusion the fresh-compose path applies
      // when it builds ownerLocalMaterials. A failed sibling's cleanup must never dispose a shared
      // material that live ships are still drawing.
      if (material && material.userData?.spacefaceSharedAsset !== true) {
        ownerLocalMaterials.add(material);
      }
    }
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
  // Package subtrees recreated for a template instance re-bind their motion controllers into
  // the supplemental set — merge them so the ship driver drives the LIVE pivots, not the paths
  // the template serialized.
  for (const controller of supplemental?.authoredMotions || EMPTY_ARRAY) {
    bindings.authoredMotions.push(controller);
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
  const data = entity && entity.data || {};
  const defId = data.defId || 'unknown_ship';
  const identity = [
    defId,
    data.lootTableId ? `lootTableId=${data.lootTableId}` : '',
    data.trafficRole ? `trafficRole=${data.trafficRole}` : '',
    data.silhouette ? `silhouette=${data.silhouette}` : '',
    data.assetRef ? `assetRef=${data.assetRef}` : '',
  ].filter(Boolean).join(' ');
  const wantedUrl = `${partRoot || PART_RELEASE_ROOT}${wholeShipFile}`;
  const loadedWholeShips = (records || []).map((record) => {
    const url = normalizePartUrl(record && record.url);
    if (!url || !isWholeShipUrl(url)) return null;
    const assetId = record && record.assetId ? record.assetId : 'none';
    return `${url} (${assetId})`;
  }).filter(Boolean);
  return `[partsLibrary] release mode requires ${wantedUrl} for ${identity}; it did not pass the live authored-asset loader. ` +
    `Loaded whole-ship hull records: ${loadedWholeShips.length ? loadedWholeShips.join(', ') : 'none'}. ` +
    'Fix the GLB contract instead of falling back to modular hulls.';
}

function uniqueSlotMap(slots) {
  return Object.fromEntries(Object.entries(slots).map(([slot, urls]) => [slot, [...new Set(urls)]]));
}

// PQ-176.04 — VISIBLE BUILDS.
// A fitted module worth at least 15% of the hull's outfit budget is bolted on where the authored
// SOCKET_* contract says that kind of hardware lives (whole-ship bodies expose the same sockets;
// modular hulls fall back to the anchors below, matching what ensureStandardSockets plants). The
// drive is the one module every hull already shows — a fitted engine changes nacelle glow instead
// of adding geometry — and weapons already mount per hardpoint, so this table covers the rest.
const VISIBLE_MODULE_BUDGET_FRACTION = 0.15;

const MODULE_FIT_PART_BY_SLOT = Object.freeze({
  shield:   { file: 'greebles/greeble_antennas.glb', sockets: [['SOCKET_Utility_Dorsal', [0.04, 0.40, 0.08]]], targetLength: 0.26 },
  cargo:    { file: 'pods/pod_cargo_container.glb',  sockets: [['SOCKET_Cargo_Ventral', [-0.08, -0.36, 0.12]]], targetLength: 0.34 },
  mining:   { file: 'greebles/greeble_pipes.glb',    sockets: [['SOCKET_Mining_Front', [0.70, -0.12, 0.16]]], targetLength: 0.30 },
  utility:  { file: 'pods/pod_utility.glb',          sockets: [['SOCKET_Utility_Dorsal', [-0.16, 0.40, -0.10]]], targetLength: 0.26 },
  thruster: { file: 'greebles/greeble_rcs.glb',      sockets: [['SOCKET_RCS_Port', [-0.30, 0.04, -0.44]], ['SOCKET_RCS_Starboard', [-0.30, 0.04, 0.44]]], targetLength: 0.22 },
});

/** Describe how an entity's fitted loadout must read on the hull. Pure data — the live assembly
 *  and the preload plan both consume it, so the cooked part set always matches the mounted set. */
export function visibleFittingsForEntity(entity) {
  const data = entity && entity.data || {};
  const fittings = Array.isArray(data.fittings) ? data.fittings : [];
  const shipDef = SHIP_BY_ID.get(data.defId) || null;
  const outfitSpace = Number(shipDef && shipDef.outfitSpace);
  const threshold = Number.isFinite(outfitSpace) && outfitSpace > 0
    ? VISIBLE_MODULE_BUDGET_FRACTION * outfitSpace - 1e-9
    : Infinity;
  const modules = [];
  let driveGlow = null;
  const fittedWeaponIds = [];
  for (const fittedId of fittings) {
    if (!fittedId) continue;
    const weapon = WEAPON_BY_ID.get(String(fittedId));
    if (weapon) { fittedWeaponIds.push(weapon.id); continue; }
    const def = MODULE_BY_ID.get(String(fittedId));
    if (!def) continue;
    if (def.slotType === 'engine') {
      if (!driveGlow && def.visuals && def.visuals.glow) driveGlow = def.visuals.glow;
      continue;
    }
    const spec = MODULE_FIT_PART_BY_SLOT[def.slotType];
    if (!spec) continue;
    if ((Number(def.mass) || 0) < threshold) continue;
    modules.push({
      id: def.id,
      slotType: def.slotType,
      file: (def.visuals && def.visuals.part) || spec.file,
      sockets: spec.sockets.map(([name, anchor]) => ({ name, anchor })),
      targetLength: spec.targetLength,
    });
  }
  return { modules, driveGlow, fittedWeaponIds };
}

// Whole-ship hulls are mounted at this normalized +X length (see the Hull placement above).
const WHOLE_SHIP_HULL_TARGET_LENGTH = 1.72;
const NOSE_CLEARANCE = 0.02;

/** Hull-local +X of the authored nose: the hull part is scaled so its +X extent spans 1.72. */
function hullNoseX(hullRecord) {
  const bounds = hullRecord && hullRecord.bounds;
  if (!bounds || !Array.isArray(bounds.max) || !Array.isArray(bounds.size) || !(bounds.size[0] > 0)) return null;
  return bounds.max[0] * (WHOLE_SHIP_HULL_TARGET_LENGTH / bounds.size[0]);
}

/**
 * Fitted hardware rides inside the body's plan outline: a gun or module whose tip passes the nose
 * reads as a box stuck on the front of the ship. Slide the mount aft until its +X tip sits just
 * behind the nose. Pure placement arithmetic, applied before the part is instanced.
 */
export function keepPlacementBehindNose(placement, record, hullRecord) {
  const noseX = hullNoseX(hullRecord);
  const bounds = record && record.bounds;
  if (noseX == null || !placement || !Array.isArray(placement.position) || !bounds
    || !Array.isArray(bounds.max) || !Array.isArray(bounds.size) || !(bounds.size[0] > 0)) return false;
  if (placement.quaternion) return false;
  if (Array.isArray(placement.rotation) && placement.rotation.some((v) => Math.abs(Number(v) || 0) > 1e-6)) return false;
  const scale = (Number(placement.targetLength) || 0) / bounds.size[0];
  const tipX = placement.position[0] + bounds.max[0] * scale;
  const limit = noseX - NOSE_CLEARANCE;
  if (!(tipX > limit)) return false;
  placement.position = [placement.position[0] - (tipX - limit), placement.position[1], placement.position[2]];
  return true;
}

/**
 * Forge hulls model their own guns, drills and pods as part of the design. Generic kit parts bolted
 * onto their sockets read as boxes stuck to a finished ship, so those bodies opt out of bolt-ons.
 */
export function hullIntegratesHardpoints(hullRecord) {
  const meta = hullRecord && (hullRecord.metadata || (hullRecord.blueprint && hullRecord.blueprint.metadata));
  return !!(meta && (meta.integratedHardpoints === true || meta.surfaceGeometryRemaster === 'forge-v1'));
}

const AUTHORED_JOB_SOCKETS = Object.freeze([
  [/mining|drill|extract/i, 'SOCKET_Mining_Front'],
]);

/** Sockets whose job the production body already models (by authored primitive name). */
function authoredHullJobs(hullRecord) {
  const jobs = new Set();
  if (!hullRecord) return jobs;
  let primitives = [];
  try { primitives = compositionPrimitives(hullRecord) || []; } catch (_) { primitives = []; }
  for (const primitive of primitives) {
    const name = String(primitive && primitive.name || '');
    for (const [pattern, socket] of AUTHORED_JOB_SOCKETS) if (pattern.test(name)) jobs.add(socket);
  }
  return jobs;
}

/** Resolve a standard/authored fit socket to a placement position in normalized hull space. */
function hullLocalPositionForSocket(hull, socketName) {
  const socket = hull && typeof hull.getObjectByName === 'function' ? hull.getObjectByName(socketName) : null;
  if (!socket) return null;
  const local = hull.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
  return [local.x, local.y, local.z];
}

/** Budget-heavy fitted modules → mount descriptors (record + preferred socket + anchor fallback). */
function fittedModuleMounts(entity, podRecords, greebleRecords, seed) {
  const { modules } = visibleFittingsForEntity(entity);
  const mounts = [];
  const socketUse = new Map();
  for (const mod of modules) {
    const records = String(mod.file).startsWith('pods/') ? podRecords : greebleRecords;
    const record = recordForFile(records, mod.file) || hashedRecord(records, seed, `module:${mod.id}`);
    for (const socket of mod.sockets) {
      const ordinal = socketUse.get(socket.name) || 0;
      socketUse.set(socket.name, ordinal + 1);
      mounts.push({
        record,
        file: mod.file,
        socket: socket.name,
        ordinal,
        placement: {
          position: socket.anchor.slice(),
          targetLength: mod.targetLength,
          label: `Module_${mod.id}_${socket.name}`,
        },
      });
    }
  }
  return mounts;
}

/** Clone-on-write glow tint: drive core/plume materials may be shared cache entries, so the
 *  fitted drive's color lands on a per-ship clone tracked in mutableMaterials for disposal. */
function applyFittedDriveGlow(bindings, mutableMaterials, glowHex) {
  const tint = new THREE.Color(glowHex);
  const meshes = [...(bindings.driveCores || []), ...(bindings.drivePlumes || [])];
  for (const mesh of meshes) {
    if (!mesh || !mesh.material) continue;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const tinted = source.map((material, index) => {
      if (!material || !material.isMaterial) return material;
      let owned = material;
      if (!material.userData || material.userData.spacefaceDriveGlowTint !== true) {
        owned = cloneMaterialPreservingShaderHooks(material);
        owned.userData = { ...(material.userData || {}), spacefaceDriveGlowTint: true };
        mutableMaterials.set(`driveGlow|${mesh.name || 'mesh'}|${index}|${mutableMaterials.size}`, owned);
      }
      if (owned.color) owned.color.copy(tint);
      if (owned.emissive) owned.emissive.copy(tint);
      owned.needsUpdate = true;
      return owned;
    });
    mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0];
  }
}

function authoredWeaponMounts(entity, shipDef, records, seed, options = {}) {
  const data = entity.data || {};
  const runtimeWeapons = Array.isArray(data.weapons) ? data.weapons : [];
  const fittedWeaponIds = Array.isArray(data.fittings)
    ? data.fittings.filter((id) => WEAPON_BY_ID.has(id))
    : [];
  const hardpoints = modelTruthMountFractions(shipDef && shipDef.id, 'SOCKET_Weapon_');
  const slotEntries = shipSlotEntries(shipDef, 'weapon');
  // fittedOnly: whole-ship bodies bake their ambient dressing — only guns actually fitted may
  // sprout on their sockets, never a seed pick for an empty hardpoint.
  const count = options.fittedOnly === true
    ? Math.min(6, Math.max(runtimeWeapons.length, fittedWeaponIds.length))
    : Math.min(6, Math.max(runtimeWeapons.length, fittedWeaponIds.length, hardpoints.length, slotEntries.length));
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

function staticBatchLeafCacheKey(entry, tags) {
  const prim = entry && entry.primitive;
  const name = prim && prim.name || '';
  const primElements = prim && prim.matrix && prim.matrix.elements;
  const partElements = entry && entry.partMatrix && entry.partMatrix.elements;
  const url = entry && entry.record && entry.record.url || '';
  const t = tags || {};
  return `${url}|${t.lod || 'always'}|${t.damageRole || ''}|${name}|${primElements ? Array.from(primElements).join(',') : ''}|${partElements ? Array.from(partElements).join(',') : ''}`;
}

function flushStaticBatch(parent, bindings, bucket, options = {}) {
  const material = resolveCanonicalHullMaterial(bucket.material);
  const merged = buildStaticBatchGeometry(bucket, options);
  if (!merged) {
    const tier1Geometry = tier1CausalCounters();
    for (const entry of bucket.entries) {
      // The transform-bound leaf is byte-identical across same-class boundaries; share the
      // cached clone instead of re-uploading the same buffers at every live compose.
      const leafKey = staticBatchLeafCacheKey(entry, bucket.tags);
      let geometry = takeCachedStaticBatchGeometry(leafKey);
      if (!geometry) {
        geometry = entry.primitive.geometry.clone();
        if (tier1Geometry) {
          tier1Geometry.countGeometryConstructed(1, 'static-batch-clone');
          tier1Geometry.countGeometryTransform('static-batch');
        }
        promoteStaticPositionToFloat(geometry);
        geometry.applyMatrix4(entry.primitive.matrix);
        geometry.applyMatrix4(entry.partMatrix);
        rememberStaticBatchGeometry(leafKey, geometry);
      }
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

  // The group merge is byte-identical across same-class boundaries: bucket keys already encode
  // urls/tags/entry transforms, so their sorted join is a stable group key. Share the merged
  // output or every live compose re-uploads the same buffers mid-round.
  const groupCacheKey = buckets.map(staticBatchGeometryCacheKey).sort().join('&&');
  const cachedGroup = takeCachedStaticBatchGeometry(groupCacheKey);
  if (cachedGroup) {
    const materialsCached = buckets.map((bucket) => resolveCanonicalHullMaterial(bucket.material));
    const urlsCached = new Set();
    let partsCached = 0;
    for (const bucket of buckets) {
      partsCached += bucket.entries.length;
      for (const url of bucket.urls) urlsCached.add(url);
    }
    addStaticBatchMesh(parent, bindings, cachedGroup, materialsCached, buckets[0].tags,
      [...urlsCached], `StaticGroup_${partsCached}_${materialsCached.length}`);
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
        if (pending && typeof pending.dispose === 'function'
          && !(pending.userData && pending.userData.spacefaceSharedAsset)) {
          pending.dispose();
        }
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
    // Bucket geometries are shared cache entries now — disposing one steals the resident
    // buffer from every other boundary that drew it. Only fresh normalized copies dispose.
    if (geometry && typeof geometry.dispose === 'function'
      && !(geometry.userData && geometry.userData.spacefaceSharedAsset)) {
      if (tier1Geometry) tier1Geometry.countResourcesDisposed(1, 'static-batch-group');
      geometry.dispose();
    }
  }
  if (!merged) {
    for (const fallback of buckets) flushStaticBatch(parent, bindings, fallback, options);
    return;
  }
  rememberStaticBatchGeometry(groupCacheKey, merged);
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
    return merged;
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

export function normalizeStaticBatchGeometries(geometries, options = {}) {
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
      if (next !== geometry && typeof geometry.dispose === 'function'
        && !(geometry.userData && geometry.userData.spacefaceSharedAsset)) {
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
  return name === 'position' || name === 'normal' || name === 'uv' || name === 'uv1' || name === 'uv2'
    || name === 'sfHullPosition';
}

function firstAttributeItemSize(geometries, name) {
  for (const geometry of geometries) {
    const attr = geometry && geometry.getAttribute(name);
    if (attr && attr.itemSize) return attr.itemSize;
  }
  return 0;
}

function defaultAttributeItemSize(name) {
  if (name === 'position' || name === 'normal' || name === 'sfHullPosition') return 3;
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
  // getX/Y/Z/W in the shipping Three revision already apply this scale; dividing again would
  // collapse mixed quantized/float positions (including the hull's paint coordinates) to zero.
  return value;
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
      record, parent, placement, palette, scene, owner, bindings, mutableMaterials, staticBatches,
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
      // A chunk that publishes outside liveSectorGpuAdmission must pass through exact GPU
      // admission first: the pooled InstancedMesh is this proxy's only draw path, so an
      // immediate publish links its instanced variant inside the first visible frame.
      const poolAdmissionOptions = livePoolAdmissionOptions();
      const deferChunk = !(authoredRuntimeState()?.render?.liveSectorGpuAdmission === true)
        && !!poolAdmissionOptions;
      const allocation = allocateInstance(scene, owner, object, primitive.geometry, material, primitive.name, {
        deferNewChunkPublication: deferChunk,
        deferProxyActivation: deferChunk,
      });
      if (allocation && allocation.admission) {
        if (bindings && bindings.packagePoolAdmissions instanceof Set) {
          bindings.packagePoolAdmissions.add(allocation.admission);
        }
        drivePoolAdmissionIfUnclaimed(allocation.admission, poolAdmissionOptions);
      }
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

function instantiateRenderPackagePart(record, parent, placement, palette, scene, owner, bindings, mutableMaterials, staticBatches = null) {
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
  // Place/station props batch their static package primitives through the caller's collector —
  // the same contract compositionPrimitives records already follow. Ships keep the cross-root
  // instance pool instead: fleet-wide repetition is the stronger win there. flightStaticV3
  // records stay direct because the flight-template cache deep-clones nodes, which would
  // resurrect a demoted mesh alongside the merged batch.
  const mergePackageMeshes = staticBatches
    && record.flightStaticV3 !== true
    && (owner?.userData?.kind === 'place' || owner?.userData?.kind === 'station');
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
  if (mergePackageMeshes) packageRoot.updateMatrixWorld(true);

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
      const batchable = mergePackageMeshes
        && isRigidOpaqueBatchableSurface(object, tags, { requiresPerShipMesh });
      object.visible = !tags.lod || tags.lod === 'lod0';
      if (batchable) {
        staticBatches.add({
          record,
          primitive: {
            geometry: object.geometry,
            matrix: packageMeshMatrixInPartSpace(object, partRoot),
            name: object.name,
            tags,
          },
          partRoot,
          material: object.material,
        });
        retirePackagePoolCandidate(scene, object);
        demotePackageMeshToStaticBatch(object);
      }
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

  // ANI-00: the package's verified motion bank binds every same-named MOTION_* pivot in this
  // instance (one per mounted LOD file), so LOD switches never pop a transform. The template
  // path recreates packages through this same call, so cached roots rebind identically.
  const motionController = bindInstanceMotion(packageRoot, record.motionBank);
  if (motionController) bindings.authoredMotions.push(motionController);
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

// PQ-210.00 — force the render-package instance pool to promote without a live ship pair.
// Pool chunks key on (geometry, sharedMaterialFor(material, tags, palette)) and only promote
// when a second distinct owner registers the same key, so each palette that can appear in the
// round needs its own pair of witnesses. The stubs mount under a hidden catalog root, so
// visibleProxyChainReachesOwner never submits a matrix for them — the chunk keeps count 0,
// draws nothing, and simply stays resident for the round.
//
// The warm also prepares and activates the deferred chunk admissions it creates. Leaving them
// to the orphan lane paces a catalog-sized backlog one-per-present into the flight window —
// the exact off-frame link/upload drip this pass exists to prevent. Witness slots contribute
// no visible matrices, so activation publishes each chunk at count 0.
//
// witnessPairs: [{ ownerA, ownerB, palette }] — one entry per live palette.
export async function warmRenderPackageShipPool(scene, record, witnessPairs, options = {}) {
  if (!record?.renderPackage) return 0;
  if (!scene?.isScene) return 0;
  // Always the ordinary instance route: createFlightInstance ignores createNode, so only
  // createInstance feeds the pool candidate path.
  const createPackageInstance = record.renderPackage.createInstance?.bind(record.renderPackage);
  if (typeof createPackageInstance !== 'function' || !Array.isArray(witnessPairs)) return 0;
  const tagsByName = new Map([
    ...(record.primitives || []).map((primitive) => [primitive.name, primitive.tags]),
    ...(record.markers || []).map((marker) => [marker.name, marker.tags]),
  ]);
  // One probe instance with a bare-group createNode enumerates the shared plan entries —
  // planNodes/planEntries come back without a single real clone. The candidate registrations
  // below then clone only the poolable sources, so a package pays O(poolable × palettes)
  // instead of O(nodes × palettes) clones per warm.
  let planEntries = null;
  try {
    const probe = createPackageInstance({
      name: `SF_PoolWitnessProbe_${record.assetId || 'package'}`,
      residencyRole: 'survival-roster-prewarm',
      createNode: () => new THREE.Group(),
    });
    planEntries = probe?.planEntries || null;
  } catch (error) {
    console.warn('[partsLibrary] pool witness probe failed for', record.assetId || record.url, error);
    return 0;
  }
  if (!Array.isArray(planEntries)) return 0;

  const poolAdmissions = new Set();
  const poolableSources = [];
  for (const entry of planEntries) {
    const source = entry?.source;
    if (!source?.isMesh) continue;
    const tags = tagsByName.get(source.name) || source.userData?.spacefaceTags || {};
    if (!canPoolRenderPackageShipMesh(source, tags)) continue;
    poolableSources.push({ source, tags });
  }
  const poolState = sceneState(scene);
  let warmed = 0;
  for (const pair of witnessPairs) {
    if (!pair || !pair.ownerA?.isObject3D || !pair.ownerB?.isObject3D) continue;
    // One (geometry, sharedMaterial) key needs exactly two distinct owners to promote — a
    // package with duplicate-material nodes still promotes once per key, and a key that a
    // twin exemplar or live boundary already pushed into the pool needs no witness at all.
    const uniqueKeys = new Map();
    for (const { source, tags } of poolableSources) {
      const material = sharedMaterialFor(source.material, tags, pair.palette || {});
      // Pool identity prefers the geometry's first-writer-wins batch stamp — stamp BEFORE
      // keying so this check reads the same identity admitRenderPackageShipPoolCandidate
      // will compute (and the same one a primitives-path stamp already established).
      stampGeometryBatchKey(source.geometry, `${record.assetId || 'PackageShip'}|${source.name || 'Mesh'}`);
      const key = instancePoolKey(source.geometry, material);
      if (uniqueKeys.has(key)) continue;
      if (packagePoolSlots(poolState && poolState.pools.get(key)).length > 0) continue;
      uniqueKeys.set(key, { source, material });
    }
    for (const owner of [pair.ownerA, pair.ownerB]) {
      for (const { source, material } of uniqueKeys.values()) {
        try {
          const object = source.clone(false);
          object.material = material;
          object.userData = {
            ...(object.userData || {}),
            spacefacePackageMaterialPrepared: true,
          };
          // Stamp the shared pool material's canonical family key now — production boundaries
          // canonicalize at upgrade completion, and a chunk that compiled under the raw key
          // would relink the canonical program at its first live draw.
          canonicalizeObjectSurfaceProgramKeys(object);
          admitRenderPackageShipPoolCandidate(
            scene,
            owner,
            object,
            source.geometry,
            material,
            `${record.assetId || 'PackageShip'}_${source.name || 'Mesh'}`,
            poolAdmissions,
          );
          warmed++;
        } catch (error) {
          console.warn('[partsLibrary] pool witness candidate failed for', record.assetId || record.url, error);
        }
      }
    }
  }
  if (poolAdmissions.size > 0) {
    // Do NOT route each chunk through prepareRenderPackagePoolAdmission here: that enqueues one
    // ambient pipeline item per chunk (~2k across the catalog) into a lane that is already the
    // cook's bottleneck, for compiles that are all program-family dedupes. The holder's count-0
    // instance twin already linked the color family, and the survival cook's post-settle pool
    // seal (color+depth) plus the first-frame residency census (buffers) cover the published
    // count-0 chunk wholesale. Mark prepared and publish — the pool exists for live joins and
    // its instanceMatrix upload rides the census instead of 2k lane slots.
    for (const admission of poolAdmissions) {
      if (!admission || admission.cancelled) continue;
      if (!admission.prepared) {
        admission.result = { skipped: true, reason: 'roster warm: pool seal + census own GPU state' };
        admission.prepared = true;
      }
      try { activateRenderPackagePoolAdmission(admission); }
      catch (error) {
        console.warn('[partsLibrary] pool witness chunk activation failed', record.assetId || record.url, error);
      }
    }
  }
  return warmed;
}

/**
 * PQ-210.00 — (geometry, sharedMaterial) pairs a live ship boundary could draw for this record
 * under `palette`, with no pool side effects: the same probe-instance enumeration
 * warmRenderPackageShipPool uses, stopped before candidate registration. The bounded crucible
 * warm mounts these as hidden meshes/count-0 instanced twins, which links the direct and
 * USE_INSTANCING palette-material program families behind the shell WITHOUT publishing the
 * per-(key × palette) chunk fleet the receipt measured as the launch regression (a mid-round
 * chunk then only owes its small instanceMatrix upload — the program family is already warm).
 */
export function paletteWarmSubjectsForRecord(record, palette) {
  if (!record?.renderPackage) return [];
  const createPackageInstance = record.renderPackage.createInstance?.bind(record.renderPackage);
  if (typeof createPackageInstance !== 'function') return [];
  const tagsByName = new Map([
    ...(record.primitives || []).map((primitive) => [primitive.name, primitive.tags]),
    ...(record.markers || []).map((marker) => [marker.name, marker.tags]),
  ]);
  let planEntries = null;
  try {
    const probe = createPackageInstance({
      name: `SF_PaletteWarmProbe_${record.assetId || 'package'}`,
      residencyRole: 'crucible-roster-warm',
      createNode: () => new THREE.Group(),
    });
    planEntries = probe?.planEntries || null;
  } catch (error) {
    console.warn('[partsLibrary] palette warm probe failed for', record.assetId || record.url, error);
    return [];
  }
  if (!Array.isArray(planEntries)) return [];
  const uniqueKeys = new Map();
  for (const entry of planEntries) {
    const source = entry?.source;
    if (!source?.isMesh) continue;
    const tags = tagsByName.get(source.name) || source.userData?.spacefaceTags || {};
    if (!canPoolRenderPackageShipMesh(source, tags)) continue;
    const material = sharedMaterialFor(source.material, tags, palette || {});
    stampGeometryBatchKey(source.geometry, `${record.assetId || 'PackageShip'}|${source.name || 'Mesh'}`);
    const key = instancePoolKey(source.geometry, material);
    if (uniqueKeys.has(key)) continue;
    uniqueKeys.set(key, { geometry: source.geometry, material });
  }
  return [...uniqueKeys.values()];
}

// The palette set a hidden pool warm must cover for the current run: pool chunk keys bake the
// shared material, which bakes paletteFor(entity). NPC palettes are deterministic faction/team
// bases (per-entity appearance overrides are a player-only feature), so the fallback trio plus
// the sector faction cover every traffic/law/civilian composer the round can field. Roster
// palettes are deliberately NOT included: the twin exemplar builds promote each roster ship's
// chunk keys under its exact palette already, and adding faction palettes here multiplies
// candidates by poolable-node count for zero new coverage.
export function poolWitnessPalettesForState(state) {
  const palettes = [];
  const seen = new Set();
  const add = (entity) => {
    const palette = paletteFor(entity || {});
    const signature = [
      palette.hull, palette.accent, palette.thruster, palette.dark,
      palette.finish, palette.wear,
      palette.tints ? JSON.stringify(palette.tints) : '',
    ].join('|');
    if (seen.has(signature)) return;
    seen.add(signature);
    palettes.push(palette);
  };
  const sector = (state && state.world && state.world.sectors
      && state.world.sectors[state.world.currentSectorId])
    || (state && state.world && state.world.currentSector)
    || null;
  add({ team: 1 });
  // No factionId resolves the civilian fallback — place/site/dressing entities land here.
  add({ team: 2 });
  add({ team: 2, factionId: 'faction_free' });
  add({ team: 2, factionId: (sector && sector.factionId) || 'faction_free' });
  return { palettes };
}

// Roster ships promote their own lod0 chunk keys through the twin exemplar builds, but a live
// spawn demoting to lod1/lod2 mid-round composes a SIBLING file under the same faction palette
// — a chunk key the exemplar never created. Map each roster ship's whole-ship LOD files to its
// exact palette so the catalog warm covers just those (file, palette) pairs instead of every
// palette on every package.
export function rosterPoolWitnessFilePalettes(entities, options = {}) {
  const byFile = new Map();
  const addFor = (entity) => {
    if (!entity || entity.type !== 'ship') return;
    const palette = paletteFor(entity);
    const signature = [
      palette.hull, palette.accent, palette.thruster, palette.dark,
      palette.finish, palette.wear,
      palette.tints ? JSON.stringify(palette.tints) : '',
    ].join('|');
    for (const level of [0, 1, 2]) {
      let file = null;
      try { file = wholeShipLodFileForEntity(entity, level); } catch (_) { file = null; }
      const normalized = normalizePartUrl(file).replace(/^.*\/parts\//, '');
      if (!normalized) continue;
      let palettes = byFile.get(normalized);
      if (!palettes) byFile.set(normalized, palettes = new Map());
      if (!palettes.has(signature)) palettes.set(signature, palette);
    }
  };
  for (const entity of entities || []) addFor(entity);
  // Static swarm roster: the wave planner draws future waves from SWARM_ROSTER +
  // SWARM_BOSS_ROTATION packages, so a wave-2+ ship's (file, faction-palette) pair is
  // enumerable from data alone — no live entity needed. Without this a choir zealot
  // (same ashline_dart.glb file as the wave-1 wasp, different faction palette) promotes
  // its chunk inside the fight. `rosterEnemyIds` scopes that static half to one wave's
  // eligibility (swarmEligibleEnemyIds): the launch warm covers wave 1 only, and the
  // between-round warm takes each wave's newcomers during its armory dwell.
  const scope = options && options.rosterEnemyIds != null ? options.rosterEnemyIds : null;
  for (const pseudo of swarmRosterShipExemplarSpecs('pool-witness:ship:', { enemyIds: scope })) {
    addFor(pseudo);
  }
  return byFile;
}

/**
 * Ship-shaped pseudo-entities for every enemy the swarm wave planner can field — the same
 * (lootTableId, defId, silhouette, factionId) surface a real combat spawn carries, so
 * wholeShipLodFileForEntity/paletteFor/vf.build resolve exactly what the live spawn resolves.
 * Admission subjects only — never registered with the sim.
 */
export function swarmRosterShipExemplarSpecs(idPrefix = 'crucible-warm:ship:', options = {}) {
  const prefix = String(idPrefix || 'crucible-warm:ship:');
  // `enemyIds` scopes the cohort to what one wave can field (swarmEligibleEnemyIds): the
  // launch warm takes wave 1's set only, and each between-round dwell takes the ids its
  // next wave introduces — an archetype that cannot spawn yet no longer rides the launch
  // window's compose and compile serials.
  const scope = options && options.enemyIds != null ? options.enemyIds : null;
  const defs = scope
    ? swarmRosterEnemyDefs().filter((def) => scope.has(def.id))
    : swarmRosterEnemyDefs();
  return defs.map((def) => ({
    id: `${prefix}${def.id}`,
    type: 'ship',
    team: 1,
    factionId: def.factionId,
    radius: 8,
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    alive: true,
    flags: {},
    data: {
      lootTableId: def.id,
      defId: def.shipId,
      silhouette: def.silhouette,
      shipClass: def.shipClass,
    },
  }));
}

let _swarmRosterEnemyDefsCache = null;
function swarmRosterEnemyDefs() {
  if (_swarmRosterEnemyDefsCache) return _swarmRosterEnemyDefsCache;
  const ids = new Set();
  for (const entry of SWARM_ROSTER || []) {
    if (entry && entry.enemyId) ids.add(entry.enemyId);
  }
  for (const boss of SWARM_BOSS_ROTATION || []) {
    for (const pkg of bossPackagesFor(boss)) {
      if (pkg && pkg.enemyId) ids.add(pkg.enemyId);
    }
  }
  const byId = new Map();
  for (const def of ENEMY_TYPES || []) {
    if (def && def.id) byId.set(def.id, def);
  }
  _swarmRosterEnemyDefsCache = [...ids].map((id) => byId.get(id)).filter(Boolean);
  return _swarmRosterEnemyDefsCache;
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
  // New chunks wait for exact GPU admission in every mode: publishing one mid-flight used to skip
  // the compile, and the pooled InstancedMesh then linked its instanced variant inside the first
  // visible draw (station-approach bloomScene brick). During liveSectorGpuAdmission the in-scene
  // census compiles immediate publications, so only that window may publish before admission.
  const deferNewChunkPublication = !(live && live.render && live.render.liveSectorGpuAdmission === true);
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

  const orphanOptions = livePoolAdmissionOptions();
  for (const allocation of allocations) {
    if (!allocation?.admission) continue;
    poolAdmissions?.add(allocation.admission);
    // The boundary prepare normally claims these admissions, but this promotion path can also
    // run for an owner whose boundary never reaches prepareAuthoredShipVisualPipelines — then
    // the chunk would sit unpublished forever and the pool never forms. The orphan lane is
    // memoized on admission.preparation, so racing a real boundary prepare is safe.
    drivePoolAdmissionIfUnclaimed(allocation.admission, orphanOptions);
  }
  return object;
}

/**
 * The renderer's compile/residency seam for pool chunks created outside a boundary admission —
 * e.g. package-instance primitives pooled by instantiatePart. Returns null when no live renderer
 * can compile, in which case the chunk must publish immediately (the loading census admits it).
 */
function livePoolAdmissionOptions() {
  const live = authoredRuntimeState();
  const render = live && live.render;
  if (!render || typeof render.compileObjectPipelines !== 'function') return null;
  return {
    prepareAuthoredPipelines: (root) => render.compileObjectPipelines(root),
    prepareAuthoredGpuResidency: typeof render.prepareAuthoredGpuResidency === 'function'
      ? (root) => render.prepareAuthoredGpuResidency(root, {})
      : null,
    yieldBetweenGpuStages: live.mode === 'flight',
    yieldToNextPresent: typeof render.yieldToNextPresent === 'function'
      ? () => render.yieldToNextPresent()
      : null,
  };
}

/**
 * Drive an admission to activation when the caller's boundary prepare may never run. Safe to race
 * with a boundary prepare: prepareRenderPackagePoolAdmission memoizes on admission.preparation.
 * Orphan drives run one at a time behind a present yield so a burst of same-type compositions
 * cannot stack several compile+touch passes into a single frame, and a still-pending boundary
 * prepare gets a full present to claim the admission before the orphan lane spends the work.
 */
let poolAdmissionOrphanPump = Promise.resolve();
let poolAdmissionLateSkips = 0;
function drivePoolAdmissionIfUnclaimed(admission, options) {
  if (!admission || !options || admission.prepared || admission.activated || admission.cancelled) return;
  poolAdmissionOrphanPump = poolAdmissionOrphanPump.then(async () => {
    if (typeof options.yieldToNextPresent === 'function') {
      try { await options.yieldToNextPresent(); } catch { /* present wait is pacing only */ }
    }
    if (admission.preparation || admission.prepared || admission.activated || admission.cancelled) return;
    const live = authoredRuntimeState();
    const gate = shouldStartHeavyAdmissionEventually(
      live && live.render && live.render.lastPresentDtMs,
      poolAdmissionLateSkips,
    );
    poolAdmissionLateSkips = gate.skippedCount;
    if (!gate.start) {
      drivePoolAdmissionIfUnclaimed(admission, options);
      return;
    }
    await prepareRenderPackagePoolAdmission(admission, options);
    activateRenderPackagePoolAdmission(admission);
  }).catch((error) => {
    // A mid-preparation cancellation is the owner-gone race, not a defect — keep it off the
    // warning channel the same way the boundary path classifies 'owner became inactive'.
    const log = admission && admission.cancelled === true ? console.info : console.warn;
    try { log.call(console, '[partsLibrary] pooled chunk admission failed', error); } catch { /* diagnostics only */ }
  });
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

function packageMeshMatrixInPartSpace(object, partRoot) {
  const matrix = object.matrix.clone();
  for (let node = object.parent; node && node !== partRoot; node = node.parent) {
    matrix.premultiply(node.matrix);
  }
  return matrix;
}

function retirePackagePoolCandidate(scene, object) {
  const key = object && object.userData && object.userData.spacefaceInstancePoolKey;
  if (!key || !scene) return;
  const state = sceneState(scene);
  const candidate = state && state.packageCandidates && state.packageCandidates.get(key);
  // A merged mesh must retire its candidacy: a later cross-root repeat would otherwise promote
  // this object into a pooled draw on top of the batch that already draws it.
  if (candidate && candidate.object === object) state.packageCandidates.delete(key);
}

// Same suppress-direct-submission contract as promoteRenderPackageMeshToPoolProxy: the node keeps
// its place in planNodes/hierarchy for bounds, texture residency, and inspection while the merged
// static batch owns the draw.
function demotePackageMeshToStaticBatch(object) {
  object.isMesh = false;
  object.userData = {
    ...(object.userData || {}),
    spacefaceStaticBatchProxy: true,
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
    const ownerIsActive = options && options.isResidencyOwnerActive;
    admission.preparation = prepareAuthoredVisualPipelines(admission.target, {
      ...options,
      // A cancelled admission is a dead owner for this exact target: let an in-flight compile
      // settle, but never let it start a residency upload the retired chunk can never use. The
      // between-stage assert in prepareAuthoredVisualPipelines is the same abort the boundary's
      // entity-level predicate already drives.
      isResidencyOwnerActive: () => admission.cancelled !== true
        && (typeof ownerIsActive !== 'function' || ownerIsActive() === true),
    }).then((result) => {
      admission.result = result;
      admission.prepared = !admission.cancelled;
      return result;
    }, (error) => {
      // A later repeated root may retry the same still-hidden exact target. The already-live first
      // direct mesh remains untouched until one preparation succeeds.
      admission.preparation = null;
      // Cancellation mid-preparation is the chunk retiring, not a pipeline defect: the boundary
      // that shares this admission may be a live ship whose eligible mesh stays direct, so the
      // preparation resolves as skipped — the same verdict the entry check above returns when
      // cancellation lands before any GPU work starts.
      if (admission.cancelled === true) {
        return { skipped: true, reason: 'package pool admission cancelled' };
      }
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
    // ANI-00: MOTION_* pivots found while specializing (tests/debug), and the per-instance
    // authored-motion controllers bound from the package's verified motion bank.
    motionGroups: [],
    authoredMotions: [],
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
  if (tags.motionGroup) bindings.motionGroups.push(object);
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
    matrixSerial: 0,
    submitPolicyMemo: null,
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
  // Registry removal is unconditional: a failed GPU-side cleanup must still retire the
  // chunk. Otherwise the half-finalized chunk stays pinned in retiringChunks/pool.chunks
  // forever — detached from the scene but holding its slots, mesh, and pool alive.
  chunk.retired = true;
  if (chunk.packageAdmission === admission) chunk.packageAdmission = null;
  state.affectedChunks.delete(chunk);
  state.retiringChunks.delete(chunk);
  chunk.slots.clear();
  chunk.visibleIndices.clear();
  chunk.free.length = 0;
  const index = pool.chunks.indexOf(chunk);
  if (index >= 0) pool.chunks.splice(index, 1);
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, `Instance chunk ${chunk.mesh?.name || chunk.ordinal} cleanup failed`);
  }
  return chunk;
}

function writeInstanceChunkMatrix(chunk, index, matrix) {
  assertDynamicBufferOwnerWritable(chunk.dynamicBufferOwner);
  chunk.mesh.setMatrixAt(index, matrix);
  // Every visibleIndices add/remove pairs with a write through this choke point, so the
  // serial versions the submitted-matrix contents the chunk submit-policy verdict reads.
  chunk.matrixSerial = (chunk.matrixSerial || 0) + 1;
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
    // Sightline-duck: the owner root's y moved outside the pose path, so the frame record is
    // clean while every descendant matrixWorld changed. Track the applied depth per owner.
    const occluderSink = context.occluderSinks ? context.occluderSinks.get(owner) || 0 : 0;
    const occluderMoved = occluderSink !== (ownerState.occluderSink || 0);
    if (occluderMoved) ownerState.occluderSink = occluderSink;
    const needsSync = context.cameraDirty
      || record.renderDirty === true
      || ownerState.dirty
      || occluderMoved
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
      const material = cloneMaterialPreservingShaderHooks(source);
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
  // Owner roots the camera-sightline duck moved this frame (renderer cameraOccluders.js). Their
  // proxies must re-submit even when pose/camera are otherwise clean — a ducked root changes
  // every descendant matrixWorld but touches no dirty flag the frame records carry.
  context.occluderSinks = opts && opts.occluderSinks instanceof Map ? opts.occluderSinks : null;
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
    occluderSinks: null,
    farCullWu: INSTANCE_FAR_CULL_RADIUS,
  };
}

// Chase follow damping moves the camera every frame by <<1 WU. Exact matrix equality
// marked cameraDirty continuously, forcing every active authored-instance owner through
// syncOwnerSlots (frustum + matrix compare) under prepareFrame. Quantize translation to
// 0.25 WU and basis/projection to 1e-3 so micro-moves reuse the stable owner path; real
// pans/zooms still dirty.
const CAMERA_CULL_POS_QUANT_WU = 0.25;
const CAMERA_CULL_BASIS_EPS = 1e-3;
// Bench-only: force exact matrix compare (pre-quantize residual).
let _cameraCullExactCompare = false;
export function setAuthoredInstanceCameraCullExactCompare(enabled) {
  _cameraCullExactCompare = enabled === true;
}

function quantizeCullCameraValue(value, index) {
  const n = Number(value) || 0;
  if (index === 12 || index === 13 || index === 14) {
    return Math.round(n / CAMERA_CULL_POS_QUANT_WU) * CAMERA_CULL_POS_QUANT_WU;
  }
  return Math.round(n / CAMERA_CULL_BASIS_EPS) * CAMERA_CULL_BASIS_EPS;
}

function captureCullCameraState(camera, snapshot) {
  const present = !!camera;
  let changed = !snapshot.initialized || snapshot.present !== present;
  snapshot.initialized = true;
  snapshot.present = present;
  if (!camera) return changed;
  const world = camera.matrixWorld && camera.matrixWorld.elements;
  const projection = camera.projectionMatrix && camera.projectionMatrix.elements;
  const exact = _cameraCullExactCompare;
  for (let index = 0; index < 16; index++) {
    const raw = world ? Number(world[index]) || 0 : 0;
    const value = exact ? raw : quantizeCullCameraValue(raw, index);
    if (snapshot.values[index] !== value) changed = true;
    snapshot.values[index] = value;
  }
  for (let index = 0; index < 16; index++) {
    const raw = projection ? Number(projection[index]) || 0 : 0;
    const value = exact ? raw : quantizeCullCameraValue(raw, -1);
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
      // Never throw through Object3D's event dispatch: scene.remove() callers would see a
      // GPU cleanup failure abort their whole eviction sweep. Errors stay recorded and are
      // surfaced by releaseOwnerInstances; failed releases re-queue for that drain.
      drainOwnerReleaseCallbacks(state);
    };
    owner.addEventListener('removed', state.listener);
    ownerReleaseState.set(owner, state);
  }
  // Scope tag: the admission epoch minting this registration. Run-scoped drains only release
  // callbacks minted under their own epoch, so a stale run's cleanup cannot free pool slots
  // a newer epoch's live body is still presenting.
  release.__ownerReleaseScope = owner && owner.userData
    ? (owner.userData.admissionEpoch ?? null) : null;
  state.releases.add(release);
}

export function releaseOwnerInstances(owner, expectedEpoch = null) {
  const state = ownerReleaseState.get(owner);
  if (!state) return Promise.resolve(true);
  drainOwnerReleaseCallbacks(state, expectedEpoch);
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

function drainOwnerReleaseCallbacks(state, expectedEpoch = null) {
  const callbacks = [...state.releases];
  if (expectedEpoch == null) {
    state.releases.clear();
  } else {
    for (const release of callbacks) {
      if (release.__ownerReleaseScope === expectedEpoch) state.releases.delete(release);
    }
  }
  const synchronousErrors = [];
  for (const release of callbacks) {
    if (expectedEpoch != null && release.__ownerReleaseScope !== expectedEpoch) continue;
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
export function runAuthoredInstanceCameraDirtyMicrobench(options = {}) {
  const ownerCount = Math.max(2, Math.floor(Number(options.ownerCount) || 80));
  const frames = Math.max(10, Math.floor(Number(options.frames) || 2000));
  const jitterWu = Number.isFinite(Number(options.jitterWu)) ? Number(options.jitterWu) : 0.05;
  const exact = options.exactCameraDirty === true;
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const owners = [];
  for (let i = 0; i < ownerCount; i++) {
    const owner = new THREE.Group();
    const proxy = new THREE.Object3D();
    owner.position.set((i % 20) * 40, 0, Math.floor(i / 20) * 40);
    owner.add(proxy);
    scene.add(owner);
    allocateInstance(scene, owner, proxy, geometry, material, 'CameraDirtyMicrobench');
    owners.push(owner);
  }
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 8000);
  camera.position.set(0, 120, 180);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const poolState = sceneStates.get(scene);
  const frameFor = (frameId) => ({
    frameId,
    authored: owners.map((mesh) => ({
      mesh,
      visible: true,
      viewCulled: false,
      renderDirty: false,
    })),
  });
  const priorExact = _cameraCullExactCompare;
  _cameraCullExactCompare = exact;
  try {
    // Reset camera snapshot so the first capture matches the compare mode.
    if (poolState && poolState.cameraState) {
      poolState.cameraState.initialized = false;
      poolState.cameraState.values.fill(0);
    }
    const prime = frameFor(0);
    syncAuthoredInstancePools(scene, {
      entityFrame: prime,
      authoredRecords: prime.authored,
      camera,
    });
    let dirtyFrames = 0;
    let ownersVisited = 0;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      camera.position.x += jitterWu * Math.sin(f * 0.17);
      camera.position.z += jitterWu * 0.5 * Math.cos(f * 0.13);
      camera.updateMatrixWorld(true);
      const entry = frameFor(f + 1);
      const stats = syncAuthoredInstancePools(scene, {
        entityFrame: entry,
        authoredRecords: entry.authored,
        camera,
      });
      if (poolState && poolState.cullContext && poolState.cullContext.cameraDirty) dirtyFrames++;
      ownersVisited += stats && Number(stats.ownersVisited) || 0;
    }
    const ms = performance.now() - t0;
    return {
      ownerCount,
      frames,
      jitterWu,
      exact,
      ms,
      dirtyFrames,
      dirtyRate: dirtyFrames / frames,
      ownersVisited,
    };
  } finally {
    _cameraCullExactCompare = priorExact;
    for (const owner of owners) {
      scene.remove(owner);
      releaseOwnerInstances(owner);
    }
    geometry.dispose();
    material.dispose();
  }
}

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
// cloneMaterialPreservingShaderHooks lives in materialClone.js so runtime mutators
// (shipMicroMotion's bell heat skin) can use it without importing this module.
export { cloneMaterialPreservingShaderHooks };

function sharedMaterialFor(base, tags, palette) {
  const role = authoredSurfaceTintRole(tags, base);
  const tint = tintHex(palette, role);
  const explicitTint = appearanceOverrideForRole(palette, role);
  const finish = palette.finish || 'authored';
  const wear = Number.isFinite(Number(palette.wear)) ? Number(palette.wear).toFixed(2) : '-';
  // Instance key still includes tint so faction colors remain distinct material.color uniforms.
  // Program-family identity (name + spacefaceProgramFamily) deliberately omits tint: color is a
  // per-instance uniform, not a distinct compiled program.
  const key = `${materialShareSignature(base, tags)}|${role}|${tint}|${explicitTint ? 'paint' : 'identity'}|${finish}|${wear}${lampShareToken(base)}`;
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
      stampSharedMaterialRole(canonical, sharedMaterialRoleFromAuthored(tags, base));
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
    stampSharedMaterialRole(material, sharedMaterialRoleFromAuthored(tags, base));
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
    stampSharedMaterialRole(material, sharedMaterialRoleFromAuthored(tags, base));
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
  // A forge hull's paint is its identity. Only an explicit player paint job replaces it; faction
  // palette multiplies would muddy authored colour and the authored stripes/metals stay exact.
  if (material && material.userData && material.userData.spacefaceFinish === 'forge-v1'
    && !(explicitOverride && (role === 'hull' || role === 'accent'))) return material;
  const tint = new THREE.Color(hex);
  if (material.color) {
    if (explicitOverride && (role === 'hull' || role === 'accent')) {
      material.color.copy(tint);
      // Player paint is authoritative. The fleet's neutral-paint pigment is only a default;
      // retaining it here would turn an explicit white/grey choice back into occupational colour.
      material.userData.spacefaceIllustratedPigment = null;
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
  if (material.userData && material.userData.spacefaceFinish === 'forge-v1') return material;
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
  // Forge hulls share one panel texture set fleet-wide and carry identity in the colour factor, so
  // their colour must stay in the share key or every forged ship would inherit the first one's paint.
  const forge = !!(material.userData && material.userData.spacefaceFinish === 'forge-v1');
  const tintable = !forge && (role === 'hull' || role === 'accent' || role === 'dark' || role === 'thruster');
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
// Each fallback material is built on first use. kit.pbrHullMaterial paints three 1024px canvas
// textures per palette/seed key, and an authored composition (a whole-ship body, or authored
// cockpit/engine/fin parts) never mounts a piece that reads materials.hull: building it up front
// cost the New Game load 1.3 s of main thread for hulls that drew none of it. A procedural piece
// gets the identical material (pbrHullMaterial is memoized by key; the others take the same
// arguments). `built` holds only what was constructed, for the composition's disposal set.
export function fallbackMaterials(palette, seed) {
  const materials = {};
  const built = new Set();
  const lazy = (name, build) => {
    let material = null;
    Object.defineProperty(materials, name, {
      get() {
        if (!material) {
          material = build();
          built.add(material);
        }
        return material;
      },
    });
  };
  lazy('hull', () => kit.pbrHullMaterial({
    hull: palette.hull, accent: palette.accent, seed: seed & 0xffff,
    panelCount: 10, metalness: 0.18, roughness: 0.58,
  }));
  lazy('dark', () => kit.machineryMaterial(palette.dark, 0.48, 0.76));
  lazy('accent', () => kit.emissiveMaterial(palette.accent, 2.6));
  lazy('glass', () => new THREE.MeshPhysicalMaterial({
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
  }));
  return { materials, built };
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
  // Two plain meshes on the shared sphere geometry — a per-ship InstancedMesh would owe a fresh
  // instanceMatrix bufferData on first draw, inside the round. Shared geometry is already
  // resident, so this variant uploads nothing. One extra draw call per nav-light-less hull.
  const material = materials.accent.clone();
  const lights = new THREE.Group();
  lights.name = 'GLTFKit_Nav_Lights';
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(getFallbackNavLightGeometry(), material);
    light.name = `GLTFKit_Nav_Lights_${side < 0 ? 'port' : 'starboard'}`;
    light.position.set(0.25, 0.18, side * 0.38);
    light.castShadow = false;
    light.receiveShadow = false;
    light.userData.keepSeparate = true;
    light.userData.spacefaceNoShadow = true;
    light.userData.damageRole = 'navLight';
    light.userData.spacefaceTags = { damageRole: 'navLight' };
    lights.add(light);
    bindings.navLights.push(light);
  }
  lights.userData.damageRole = 'navLight';
  lights.userData.spacefaceTags = { damageRole: 'navLight' };
  hull.add(lights);
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

export function disposeDetachedObject(root) {
  const releaseStandIn = root && root.userData && root.userData.admissionStandInRelease;
  if (typeof releaseStandIn === 'function') releaseStandIn();
  const disposePresentation = root && root.userData && root.userData.disposeWorldSitePresentation;
  if (typeof disposePresentation === 'function') disposePresentation();
  root.traverse((object) => {
    if (object.geometry && typeof object.geometry.dispose === 'function'
      && !(object.geometry.userData && object.geometry.userData.spacefaceSharedAsset)) {
      object.geometry.dispose();
    }
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) {
      if (material && material.userData && material.userData.spacefaceSharedAsset) continue;
      if (material && typeof material.dispose === 'function') material.dispose();
    }
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

/** Test seams: the two ways an authored primitive's material resolves (shared cache / ship-local clone). */
export function sharedMaterialForProbe(base, tags, palette) {
  return sharedMaterialFor(base, tags, palette);
}

export function dedicatedMaterialForProbe(base, tags, palette, cache, instanceKey) {
  return dedicatedMaterialFor(base, tags, palette, cache, instanceKey);
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
    authoredHullRoleStamped: texturedHull.userData.spacefaceSharedMaterialRole === 'hull'
      && texturedHullAlt.userData.spacefaceSharedMaterialRole === 'hull',
    authoredPaintSharesProgramFamily: texturedHull.userData.spacefaceProgramFamily
      === texturedHullAlt.userData.spacefaceProgramFamily,
  };
}
