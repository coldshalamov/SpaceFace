// Render system: owns the WebGLRenderer, scene, lights, camera, starfield, and the entity→mesh
// lifecycle. Exposes worldToScreen / raycastToPlane via ctx.helpers and a renderFrame() the loop
// calls each animation frame. Sim never touches this; it's all in renderFrame (ARCHITECTURE §1,§2.4).
import * as THREE from 'three';
import { applyMasslineReleaseCameraCue, createChaseCamera, shakeDistanceAttenuation } from './camera.js';
import { createSpaceBackground } from './spaceBackground.js';
import * as parallaxLayers from './parallaxLayers.js';
import {
  easeSectorTransition,
  SECTOR_VISUAL_TRANSITION_SECONDS,
} from './sectorVisualTransition.js';
import {
  createSpaceReflectionEnvironment,
  SPACE_REFLECTION_PMREM_SIGMA_RADIANS,
} from './spaceReflectionEnvironment.js';
import { createVisualFactory, setEnvMapForShips } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import {
  createBloom,
  compileScenePipelinesForRenderTarget,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_CINEMATIC_TOE,
  resolveEffectiveSectorPost,
} from './bloom.js';
import { SpaceRenderGraph } from './post/spaceRenderGraph.js';
import {
  authoredCompositionFingerprintForEntity,
  authoredCriticalVisualReadiness,
  authoredPrewarmRequestsForEntities,
  beginAuthoredInstanceMeshDisposeRegistrationProbe,
  collectAuthoredInstancePoolRoots,
  disposePreparedAuthoredBoundary,
  endAuthoredInstanceMeshDisposeRegistrationProbe,
  getAuthoredInstancePoolDiagnostics,
  isInitialAuthoredCompositionEntity,
  preloadAuthoredPartLibrary,
  prepareAuthoredInstancePoolsForContextLoss,
  publishPreparedAuthoredBoundary,
  retryAuthoredPartLibrary,
  syncAuthoredInstancePools,
} from './partsLibrary.js';
import {
  bindAuthoredAssetPerfCounters,
  prepareSectorEntry,
  preloadAuthoredParts,
} from './assetLoader.js';
import {
  collectAsteroidInstancePoolRoots,
  createAsteroidInstancePool,
  invalidateAsteroidInstancePool,
  isBorrowedAsteroidInstanceResource,
  registerAsteroidBaseLeaf,
  releaseAsteroidInstancesForEntity,
  resolveAsteroidInstanceEntityId,
  syncAsteroidInstancePool,
} from './asteroidInstancePool.js';
import {
  beginRenderEntityFrame,
  classifyRenderEntity,
  createRenderEntityFrame,
  endRenderEntityFrame,
} from './renderEntityFrame.js';

// The dense snapshot is the render boundary for ordinary flight. The simulation-owned world still
// provides mesh bindings and cosmetic bank/pitch hooks, but pose submission reads the fenced frame.

import {
  createPresentationWorld,
  PRESENTATION_DIRTY,
} from './presentationWorld.js';
import { createPresentationPublisher } from './presentationPublisher.js';
import { createPresentationQueries } from './presentationQueries.js';
import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  packPresentationWorldToFence,
  snapshotIndexOf,
} from './snapshotFence.js';
import { createPersistentSubmitLanes, SUBMIT_LANE } from './persistentSubmitLanes.js';
import { shieldBubbleGeometry } from './ships/shipKit.js';
import { projectedWidthPx } from './lod.js';
import { resolveWebGlRendererFlags } from './presentPath.js';
import {
  createOpeningAdmissionCohort,
  openingSubjectIdentity,
  shouldAdmitOpeningSubject,
} from './openingAdmission.js';
import { createCollisionDebug } from './collisionDebug.js';
import { installDiagnostics } from './diagnostics.js';
import {
  beginPostRenderTargetFrameOrigin,
  endPostRenderTargetFrameOrigin,
  getPostRenderTargetTelemetry,
  resetPostRenderTargetSampleCounter,
} from './postTelemetry.js';
import {
  invalidatePrecompileState,
  precompileGlobalPipelines,
  precompilePipelines,
} from './precompile.js';
import { detectGpu, createAdaptiveResolution } from './adaptiveQuality.js';
import { createGpuTimers } from './gpuTimers.js';
import { ensurePerfRuntime } from '../core/perfRuntime.js';
import { perfCountersRequested } from '../core/perfCounters.js';
import { installGlInstrumentation } from './glInstrumentation.js';
import { installDomInstrumentation } from '../ui/domInstrumentation.js';
import {
  allowRealtimeShadowCast,
  invalidateShadowCasterPolicy,
  noteRealtimeShadowCasterPose,
  SHADOW_MAP_SIZE,
  SHADOW_ORTHO_EXTENT,
  shadowCastAxisDistance,
  shadowTexelWorldSize,
  syncShadowCasterPolicy,
} from './shadowCasterPolicy.js';
import { updateShipPitchPresentation } from './shipPitchPresentation.js';
import { createLivingHullPresentation } from './livingHullPresentation.js';
import { createRenderFrameMembrane } from './frameCoordinates.js';
import { projectileSkipsVisualFactoryMesh } from './weapons/recipes.js';
import { readShieldContacts, SHIELD_HIT_SLOTS } from './weapons/shieldContacts.js';
import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
import { resolveSectorVisualProfile } from '../data/sectorVisualProfiles.js';
import { SHIPS } from '../data/ships.js';
import { applySectorExitResidency, getAssetResidency } from './assetResidency.js';
import {
  shouldContinueAdmissionSlice,
  shouldStartHeavyAdmissionEventually,
} from './admissionSliceBudget.js';
import {
  INNER_VIEW_BAND_SCALE,
  classifyEntityViewBand,
  shouldRunEntityClosures,
  viewHalfExtents,
} from './entityViewSyncBand.js';
import { createShadowReceiverTally, noteShadowPolicyChanged } from './shadowReceiverTally.js';
import {
  applyEntityMeshVisibility,
  isProtectedEntityMesh,
  shouldSubmitEntityMesh,
} from './entityMeshVisibility.js';
import { supportsOpaqueMaterialBatch } from './opaqueMaterialBatch.js';
import { shouldRefreshRealtimeShadowMap } from './shadowPresentCadence.js';
import {
  collectCompileSubjects,
  compileSubjectsAcrossPresents,
  shouldSliceCompileAcrossPresents,
} from './compilePresentSlice.js';
import {
  collectInstancePoolCompileRoots,
  collectLateAdmittedCompileRoots,
} from './latePipelineAdmission.js';
import {
  armAdmissionShadows,
  compileShadowDepthPipelines,
} from './shadowDepthAdmission.js';
import { preloadRockSurfaceLibrary } from './rockSurfaceLibrary.js';
import {
  createGpuResidencyAdmissionTracker,
  createPipelineAdmissionTracker,
} from './pipelineReadiness.js';
import {
  prepareStartupGpuResidency,
  yieldToBrowser,
  yieldToNextPresent,
} from './startupGpuResidency.js';
import {
  collectOpeningSubmissionLeaves,
  combineOpeningProducerCensuses,
  createOpeningProducerCensus,
  createOpeningSubmissionPlan,
  createOpeningSubmissionReceipt,
  validateOpeningSubmissionReceipt,
} from './openingSubmissionPlan.js';
import {
  stampContactShadowPoolPackage,
  stampShipAuxPoolPackage,
} from './rendererPoolProducer.js';
import {
  collectContextLossRoots,
  deferWebGlContextRestore,
  detachStaleWebGlDisposeListeners,
  isWebGlContextUnavailable,
} from './contextResourceLifecycle.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  createDynamicBufferCoordinator,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from './dynamicBufferRanges.js';
import {
  AUTHORED_ASSET_PREFETCH_RADIUS,
  willEntityEnterAuthoredUpgradeRunway,
} from './authoredAdmissionPolicy.js';
import {
  censusTableBands,
  residencyEvictRadius,
  residencyPrefetchRadius,
  shouldKeepPersistentLandmarkResident,
  submitCullHalfExtents,
  tableShadowCasterRadius,
  tableTravelSpeed,
} from './tabletopPolicy.js';
import { PRESENTATION_TIER } from '../world/activityClassification.js';
import { getActivityFrame } from '../core/worldActivityManager.js';

// M2 floating-origin scratch for mesh pose projection (no per-entity allocation).
const _meshLocalXZ = { x: 0, z: 0 };
const _cullLocalXZ = { x: 0, z: 0 };
const _shadowLocalXZ = { x: 0, z: 0 };
const _w2sLocalXZ = { x: 0, z: 0 };
const _rayGlobalXZ = { x: 0, z: 0 };

function writeScreenProjection(out, x, y, onScreen) {
  if (out && typeof out === 'object') {
    out.x = x;
    out.y = y;
    out.onScreen = onScreen;
    return out;
  }
  return { x, y, onScreen };
}
const _socketGlobalXZ = { x: 0, z: 0 };
const _worldSiteA11y = { reducedMotion: false, reducedFlash: false };

function openingSubmissionCamera(camera) {
  if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return null;
  try {
    camera.updateMatrixWorld(true);
    const projection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    return {
      frustum: new THREE.Frustum().setFromProjectionMatrix(projection),
      // Keep the live camera mask alongside the frozen frustum so opening admission and receipt
      // validation apply the same camera-visible layer boundary.
      layers: camera.layers || null,
    };
  } catch (_) {
    // A missing/invalid camera must retain visible leaves rather than silently dropping first-frame
    // contributors. The submission plan is fail-closed if it cannot establish a drawable set.
    return null;
  }
}

function describeOpeningInstancedPbrLeaves(scene, plan) {
  const planned = new Set(Array.isArray(plan?.compileSubjects) ? plan.compileSubjects : []);
  const rows = [];
  scene?.traverseVisible?.((object) => {
    if (!object?.isInstancedMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
    if (!materials.some((material) => (
      material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial
    ))) return;
    rows.push({
      id: object.uuid || null,
      name: object.name || object.type || 'InstancedMesh',
      parent: object.parent?.name || object.parent?.type || null,
      count: Number(object.count) || 0,
      instanceColor: !!object.instanceColor,
      planned: planned.has(object),
      producer: object.userData?.openingSubmissionPackage?.producer || null,
      userDataKeys: Object.keys(object.userData || {}).sort(),
      materials: materials.map((material) => ({
        id: material?.uuid || null,
        type: material?.type || 'Material',
        side: Number(material?.side) || 0,
        transparent: material?.transparent === true,
      })),
    });
  });
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const SECTOR_PALETTE_LERP_SECONDS = 1.5;
const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
// World simulation keeps the corridor sector plus reduced neighbours alive.
// Render residency is the table plus a measured approach runway (fast-ship
// travel in a couple of seconds), not a multi-thousand-unit fake-visible box.
const RENDER_STREAM_PREFETCH_RADIUS = residencyPrefetchRadius();
const RENDER_STREAM_EVICT_RADIUS = residencyEvictRadius();
// Start authored decode well before the normal camera can see the boundary. At the fastest early
// ship speeds this provides several seconds of runway, while current-sector objects farther away
// remain dormant instead of replacing procedural placeholders during unrelated play.
const RENDER_RESIDENCY_POLL_SECONDS = 0.25;

function isDebugRuntime() {
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') return false;
  return true;
}
const SF_DEBUG = isDebugRuntime();

// ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
let _shadowTex = null;
let _shadowGeo = null;
let _shadowMat = null;
const CONTACT_SHADOW_INITIAL_CAPACITY = 256;
const CONTACT_SHADOW_POS = new THREE.Vector3();
const CONTACT_SHADOW_SCALE = new THREE.Vector3();
const CONTACT_SHADOW_MATRIX = new THREE.Matrix4();
const CONTACT_SHADOW_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const CONTACT_SHADOW_MATRIX_BINDING = 0;
const SHIP_AUX_SHIELD_INITIAL_CAPACITY = 32;
const SHIP_AUX_NAV_INITIAL_CAPACITY = 64;
const SHIP_AUX_SHIELD_MATRIX = 0;
const SHIP_AUX_SHIELD_COLOR = 1;
const SHIP_AUX_SHIELD_FLASH = 2;
const SHIP_AUX_SHIELD_BASE = 3;
const SHIP_AUX_SHIELD_HIT0 = 4;
const SHIELD_HIT_SCRATCH = new Float32Array(SHIELD_HIT_SLOTS * 4);
const SHIP_AUX_NAV_MATRIX = 0;
const SHIP_AUX_NAV_COLOR = 1;
const SHIP_AUX_NAV_GEOMETRY = new THREE.SphereGeometry(0.025, 8, 6);
SHIP_AUX_NAV_GEOMETRY.dispose = () => {};
const SHIP_AUX_LOCAL_MATRIX = new THREE.Matrix4();
const SHIP_AUX_WORLD_MATRIX = new THREE.Matrix4();
const SHIP_AUX_COLOR = new THREE.Color();
const SOCKET_WORLD_POS = new THREE.Vector3();
const SOCKET_WORLD_QUAT = new THREE.Quaternion();
const SOCKET_WORLD_SCALE = new THREE.Vector3();
const SOCKET_FORWARD = new THREE.Vector3();
const RUNTIME_MESH_BUILD_BUDGET = 2;
// Default cinematic post treatment for the live route. Kept BELOW the 0.62 grade / 0.18 vignette
// that post/spaceRenderGraph.js authors for the alternate pipeline: the goal is shadow/highlight
// colour separation and a soft frame, not a look change the player did not ask for.
const SECTOR_POST_GRADE = 0.45;
const SECTOR_POST_TOE = DEFAULT_CINEMATIC_TOE;
const SECTOR_POST_VIGNETTE = 0.12;

/** Use authored XZ bounds for view culling without changing gameplay/collision radius. */
export function entityVisualCullRadius(entity, mesh = null) {
  const simRadius = Math.max(0, Number(entity && entity.radius) || 0);
  const hull = mesh && mesh.userData && mesh.userData.hull;
  const bounds = hull && hull.userData && hull.userData.visualBounds
    || mesh && mesh.userData && mesh.userData.visualBounds;
  const size = bounds && bounds.size;
  if (!Array.isArray(size)) return simRadius;
  const x = Math.max(0, Number(size[0]) || 0);
  const z = Math.max(0, Number(size[2]) || 0);
  return Math.max(simRadius, Math.hypot(x, z) * 0.5);
}

/**
 * Return only attached entity roots that can contribute to the current first camera picture.
 * Render residency intentionally lives elsewhere: this census observes the final mesh pose and
 * visibility selected by syncEntityViews() and never builds, stamps, or mutates a root.
 */
export function collectOpeningEntityRootCandidates(meshes, entities, options = {}) {
  const candidates = [];
  const playerId = options.playerId;
  const scene = options.scene || null;
  const camera = options.camera || null;
  if (!meshes || typeof meshes[Symbol.iterator] !== 'function') return candidates;
  for (const [id, mesh] of meshes) {
    if (!mesh || (playerId != null && id === playerId) || mesh.visible === false) continue;
    // _meshes is the entity ownership map, but a prepared/deferred boundary may still be mounted in
    // the scene without becoming an entity root. Only direct live roots belong to this census.
    if (scene && mesh.parent !== scene) continue;
    const entity = entities && typeof entities.get === 'function' ? entities.get(id) : null;
    if (!entity || entity.alive === false || entity._noMesh) continue;
    const leaves = collectOpeningSubmissionLeaves(mesh, { camera });
    if (leaves.length === 0) continue;
    candidates.push({
      root: mesh,
      role: entity.type === 'station' ? 'tableStationShell' : 'opening-entity-root',
      startupRole: 'first-picture-entity-root',
      blocking: true,
      reason: 'currently-visible-first-picture-entity-root',
    });
  }
  return candidates;
}

function openingEntityRootIntersectsCamera(root, entity, camera, scene) {
  if (!root || !entity || entity.alive === false || root.visible === false
      || (scene && root.parent !== scene) || !camera || !camera.frustum) return false;
  const cameraLayers = camera.layers;
  const rootLayers = root.layers;
  if (cameraLayers && typeof cameraLayers.test === 'function'
      && rootLayers && cameraLayers.test(rootLayers) === false) return false;
  try {
    root.updateWorldMatrix(true, false);
    root.getWorldPosition(_openingRootWorldPosition);
    let radius = Math.max(0.001, entityVisualCullRadius(entity, root));
    if (typeof root.getWorldScale === 'function') {
      root.getWorldScale(_openingRootWorldScale);
      radius *= Math.max(
        Math.abs(_openingRootWorldScale.x),
        Math.abs(_openingRootWorldScale.y),
        Math.abs(_openingRootWorldScale.z),
        1,
      );
    }
    _openingRootSphere.center.copy(_openingRootWorldPosition);
    _openingRootSphere.radius = radius;
    return camera.frustum.intersectsSphere(_openingRootSphere);
  } catch (_) {
    // A live root with an invalid transform cannot be safely classified as first-picture visible.
    // The exact submission collector remains fail-closed for any drawable leaves it can prove.
    return false;
  }
}

function enqueueMeshBuildCandidate(entity, meshes, queuedIds, queue) {
  if (!entity || entity._noMesh || meshes.has(entity.id) || queuedIds.has(entity.id)) return;
  if (entity.type === 'projectile' && projectileSkipsVisualFactoryMesh(entity)) return;
  queue.push(entity.id);
  queuedIds.add(entity.id);
}

/**
 * Queue authored-readiness-critical ships before bulk world geometry while retaining the same
 * bounded per-frame build budget. New Game can spawn hundreds of asteroids/props before its late
 * traffic and 47-A ships; FIFO entity order otherwise strands those ships behind non-gating meshes.
 */
export function enqueueMissingMeshBuilds(entityList, meshes, queuedIds, queue, shouldQueue = null) {
  for (const entity of entityList) {
    if (entity && entity.type === 'ship' && (!shouldQueue || shouldQueue(entity))) {
      enqueueMeshBuildCandidate(entity, meshes, queuedIds, queue);
    }
  }
  for (const entity of entityList) {
    if (!entity || entity.type === 'ship') continue;
    if (shouldQueue && !shouldQueue(entity)) continue;
    enqueueMeshBuildCandidate(entity, meshes, queuedIds, queue);
  }
}

function entitySectorId(entity) {
  const data = entity && entity.data || {};
  return entity && entity.homeSectorId || data.homeSectorId || data.sectorId || null;
}

export function sectorPrewarmPopulationNeedsSynchronousRefresh(record) {
  return record?.active === true
    && (record.populationSeeded !== true || record.populationCoverageDirty === true);
}

function playerEntityForRenderState(state) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
}

function entityIsExplicitRenderFocus(entity, state) {
  if (!entity || !state) return false;
  if (entity.id === state.playerId || entity.isPlayer === true) return true;
  if (entity.flags && (entity.flags.forceRender || entity.flags.neverCull)) return true;
  const playerEntity = playerEntityForRenderState(state);
  const targetId = state.player && state.player.targetId != null
    ? state.player.targetId
    : playerEntity && playerEntity.targetId;
  return targetId != null && entity.id === targetId;
}

function entityWithinPlayerRadius(entity, state, radius) {
  if (!entity || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return false;
  const player = playerEntityForRenderState(state);
  if (!player || !player.pos || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)) return false;
  const dx = entity.pos.x - player.pos.x;
  const dz = entity.pos.z - player.pos.z;
  const visual = entityVisualCullRadius(entity);
  const reach = Math.max(0, Number(radius) || 0) + visual;
  return dx * dx + dz * dz <= reach * reach;
}

function liveTableCamera(state) {
  const camera = state && state.camera || {};
  const video = state && state.settings && state.settings.video || {};
  const requested = Number.isFinite(camera.zoom) ? camera.zoom : NaN;
  const live = Number.isFinite(camera.liveZoom) ? camera.liveZoom : NaN;
  const zoom = Number.isFinite(live) ? live : (Number.isFinite(requested) ? requested : 144);
  const prefetchZoom = Math.max(
    Number.isFinite(live) ? live : 0,
    Number.isFinite(requested) ? requested : 0,
  ) || zoom;
  const fov = Number.isFinite(camera.fov) ? camera.fov
    : (Number.isFinite(video.fov) ? video.fov : 50);
  const tilt = Number.isFinite(camera.tilt) ? camera.tilt : 60;
  const aspect = Number.isFinite(camera.aspect) && camera.aspect > 0 ? camera.aspect : 16 / 9;
  return { zoom, prefetchZoom, fov, tilt, aspect };
}

function liveShadowCastRadius(state) {
  const cam = liveTableCamera(state);
  return tableShadowCasterRadius(cam.zoom, cam.fov, cam.aspect, cam.tilt, SHADOW_ORTHO_EXTENT);
}

function renderResidencyRadius(state, kind = 'prefetch') {
  const speed = tableTravelSpeed(state);
  const cam = liveTableCamera(state);
  return kind === 'evict'
    ? residencyEvictRadius(speed, cam.zoom, cam.fov, cam.aspect, cam.tilt)
    : residencyPrefetchRadius(speed, cam.prefetchZoom, cam.fov, cam.aspect, cam.tilt);
}

/** True once an entity's visual root carries a finished authored identity — i.e. the decode and
 * composition were already paid for. Distinct from "has a mesh": a procedural fallback boundary is
 * cheap to rebuild and must not pin residency. */
function entityHasAuthoredResidentRoot(entity) {
  const root = entity && (entity.mesh || (entity.view && entity.view.root)) || null;
  const authoredState = root && root.userData ? root.userData.authoredAssetState : null;
  return typeof authoredState === 'string' && authoredState.startsWith('authored');
}

/** Pure render-streaming policy used by reconciliation and focused tests. */
export function isEntityRenderRelevant(entity, state, radius = null) {
  if (!entity || entity.alive === false || entity._noMesh) return false;
  if (state && state.mode === 'loading') return isInitialAuthoredCompositionEntity(entity, state);
  if (entityIsExplicitRenderFocus(entity, state)) return true;
  const tier = entity.activity && entity.activity.presentationTier;
  const activityFrame = state && state.render && state.render.activityFrame;
  if (activityFrame && activityFrame.complete === true) {
    const has = (collection) => collection && typeof collection.has === 'function'
      ? collection.has(entity.id)
      : Array.isArray(collection) && collection.includes(entity.id);
    if (has(activityFrame.renderGlassIds)) return true;
    if (has(activityFrame.renderRunwayIds)) return true;
    // The activity owner has explicitly classified this entity outside the
    // presentation runway. Do not recreate an Object3D for a metadata-only or
    // unloaded record merely because it shares a sector with the player.
    return false;
  }
  if (tier === PRESENTATION_TIER.R2_METADATA || tier === PRESENTATION_TIER.R3_UNLOADED) {
    return false;
  }
  // An already-authored landmark in the player's own sector is kept, never rebuilt from scratch.
  // This is a post-admission residency rule: the loading path above no longer admits a far Helios
  // place merely because it is the critical hub, so shell-first startup does not pay its detail
  // decode before flight.
  if (shouldKeepPersistentLandmarkResident(entity, {
    mode: state && state.mode,
    currentSectorId: state && state.world && state.world.currentSectorId,
    authoredResident: entityHasAuthoredResidentRoot(entity),
  })) return true;
  if (tier === PRESENTATION_TIER.R0_GLASS || tier === PRESENTATION_TIER.R1_RUNWAY) return true;
  const numericRadius = Number(radius);
  const limit = radius == null || !Number.isFinite(numericRadius)
    ? renderResidencyRadius(state, 'prefetch')
    : numericRadius;
  const within = entityWithinPlayerRadius(entity, state, limit);
  if (tier === PRESENTATION_TIER.R2_METADATA || tier === PRESENTATION_TIER.R3_UNLOADED) {
    return entity.type === 'planet' ? within : false;
  }
  return within;
}

/** Pure authored-admission policy: spatial runway, explicit focus, never whole-sector eagerness. */
export function isEntityAuthoredUpgradeRelevant(entity, state, radius = null) {
  if (!entity || entity.alive === false) return false;
  if (state && state.mode === 'loading') return isInitialAuthoredCompositionEntity(entity, state);
  return willEntityEnterAuthoredUpgradeRunway(entity, state, { radius });
}

/**
 * Service render residency without turning the ordinary distance poll into a full reconciliation.
 * Full scans remain the event-driven safety net; queued boundaries keep the established two-build
 * cadence between scans.
 */
export function serviceRenderMeshResidency(owner, frameDt) {
  if (!owner || owner._deferNoncriticalMeshStreaming) return 'deferred';
  const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
  if (owner._sectorHandoffStreamHoldS > 0) {
    owner._sectorHandoffStreamHoldS = Math.max(0, owner._sectorHandoffStreamHoldS - dt);
    if (owner._sectorHandoffStreamHoldS === 0) {
      // The seam's dirty flag requests a whole-world recovery scan. Once the visual blend has
      // finished, discard that seam-only request and let the ordinary spatial poll self-heal.
      owner._meshReconcileDirty = false;
      if (owner._authoredSectorPrewarmPendingId === owner._sectorHandoffSectorId) {
        owner._authoredSectorPrewarmPendingId = null;
        owner._authoredSectorPrewarmPending = null;
      }
      owner._sectorHandoffSectorId = null;
    }
    return 'deferred';
  }
  owner._renderResidencyPollS -= dt;
  let pollDue = false;
  if (owner._renderResidencyPollS <= 0) {
    owner._renderResidencyPollS = RENDER_RESIDENCY_POLL_SECONDS;
    pollDue = true;
  }
  if (owner._meshReconcileDirty) {
    owner.reconcileMeshes();
    return 'full';
  }
  if (pollDue) {
    owner.reconcileMeshResidency();
    return 'poll';
  }
  if (owner._meshBuildQueueHead < owner._meshBuildQueue.length) {
    owner._drainPendingMeshBuilds();
    return 'drain';
  }
  return 'idle';
}

function canRequestAuthoredUpgrade(entity, state, pendingSectorId = null) {
  if (!isEntityAuthoredUpgradeRelevant(entity, state)) return false;
  if (!pendingSectorId) return true;
  return String(entitySectorId(entity) || '') !== String(pendingSectorId);
}

function clearEntityMeshReference(entity, mesh) {
  if (!entity) return;
  if (entity.mesh === mesh) entity.mesh = null;
  if (entity.view && entity.view.root === mesh) entity.view = null;
}

function captureObjectHome(object) {
  const parent = object && object.parent ? object.parent : null;
  return {
    object,
    parent,
    index: parent && Array.isArray(parent.children) ? parent.children.indexOf(object) : -1,
  };
}

function restoreObjectHome(home) {
  const object = home && home.object;
  if (!object) return;
  const parent = home.parent;
  if (!parent) {
    if (object.parent) object.parent.remove(object);
    return;
  }
  if (object.parent !== parent) parent.add(object);
  const children = parent.children;
  if (!Array.isArray(children)) return;
  const current = children.indexOf(object);
  const index = home.index;
  if (current < 0 || index < 0 || current === index) return;
  children.splice(current, 1);
  children.splice(Math.min(index, children.length), 0, object);
}

/** Keep every draw/readiness boundary closed until a restored context finishes rebuilding. */
export const CONTEXT_RESTORE_MAX_RETRIES = 8;

export function receiptReportsContextLost(receipt) {
  if (!receipt) return false;
  if (receipt.contextLost === true) return true;
  if (Array.isArray(receipt)) {
    return receipt.some((item) => item && item.contextLost === true);
  }
  return false;
}

export async function runWebGlContextRestoreRebuild(owner, recovery, rebuild) {
  if (!owner || !recovery || typeof rebuild !== 'function') {
    throw new TypeError('context restore rebuild requires owner, recovery state, and rebuild callback');
  }
  owner._contextLost = true;
  recovery.pending = true;
  try {
    const receipt = await rebuild();
    if (receiptReportsContextLost(receipt)) {
      const lost = Array.isArray(receipt)
        ? receipt.find((item) => item && item.contextLost === true)
        : receipt;
      throw new Error((lost && lost.reason) || 'context lost during restored GPU rebuild');
    }
  } catch (error) {
    owner._contextLost = true;
    recovery.lastError = String(error && error.message ? error.message : error);
    const retries = Number(recovery.retryCount) || 0;
    const canRetry = retries < CONTEXT_RESTORE_MAX_RETRIES
      && typeof recovery.scheduleRetry === 'function';
    if (canRetry) {
      recovery.retryCount = retries + 1;
      recovery.pending = true;
      recovery.scheduleRetry();
      return { ok: false, error, retryScheduled: true };
    }
    if (typeof recovery.forceNewContext === 'function' && recovery.forcedNewContext !== true) {
      recovery.forcedNewContext = true;
      recovery.retryCount = 0;
      recovery.pending = true;
      recovery.forceNewContext();
      return { ok: false, error, retryScheduled: true, forcedNewContext: true };
    }
    // No retry hook and no force-new-context hook: stay draw-gated so tests can prove
    // half-restored resources stay closed. The live renderer supplies both hooks.
    recovery.pending = true;
    recovery.terminal = true;
    return { ok: false, error, retryScheduled: false, terminal: true };
  }
  recovery.restores = (Number(recovery.restores) || 0) + 1;
  recovery.generation = (Number(recovery.generation) || 0) + 1;
  recovery.pending = false;
  recovery.lastError = null;
  recovery.retryCount = 0;
  recovery.forcedNewContext = false;
  recovery.terminal = false;
  owner._contextLost = false;
  return { ok: true };
}

function getContactShadowTex() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(0,0,0,0.70)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}
function getContactShadowGeo() {
  if (!_shadowGeo) _shadowGeo = new THREE.CircleGeometry(1, 20);
  return _shadowGeo;
}
function getContactShadowMat() {
  if (!_shadowMat) {
    _shadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTex(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }
  return _shadowMat;
}

function attachContactShadow(mesh, entity) {
  if (!mesh || entity._noShadow) return;
  const r = Math.max(16, (entity.radius || 28) * 1.4);
  mesh.userData.contactShadowRadius = r;
  mesh.userData.hasContactShadow = true;
}

export function createContactShadowPool(scene) {
  const pool = { scene, capacity: 0, mesh: null, records: new Map(), seen: new Set() };
  ensureContactShadowCapacity(pool, CONTACT_SHADOW_INITIAL_CAPACITY);
  return pool;
}

function registerContactShadowDynamicOwner(scene, mesh) {
  return registerDynamicBufferOwner(scene, {
    id: `contact-shadow-${mesh.id}`,
    mesh,
    attributes: [{ name: 'matrix', attribute: mesh.instanceMatrix }],
  });
}

function ensureContactShadowCapacity(pool, desired) {
  if (!pool || desired <= pool.capacity) return;
  const nextCapacity = Math.max(desired, pool.capacity ? pool.capacity * 2 : CONTACT_SHADOW_INITIAL_CAPACITY);
  const previous = pool.mesh;
  const mesh = new THREE.InstancedMesh(getContactShadowGeo(), getContactShadowMat(), nextCapacity);
  mesh.name = 'ContactShadow_Pool';
  mesh.count = 0;
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.sharedContactShadow = true;
  mesh.userData.contactShadowPool = true;
  stampContactShadowPoolPackage(mesh, nextCapacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let dynamicBufferOwner = null;
  try {
    dynamicBufferOwner = registerContactShadowDynamicOwner(pool.scene, mesh);
    if (pool.dynamicBufferOwner) unregisterDynamicBufferOwner(pool.dynamicBufferOwner);
  } catch (error) {
    if (dynamicBufferOwner) unregisterDynamicBufferOwner(dynamicBufferOwner);
    mesh.dispose();
    throw error;
  }
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
  pool.dynamicBufferOwner = dynamicBufferOwner;
  if (pool.records) pool.records.clear();
  if (previous && pool.scene) {
    pool.scene.remove(previous);
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  if (pool.scene) pool.scene.add(mesh);
}

export function syncContactShadowPool(pool, frameOrRecords, meshes) {
  if (!pool || !pool.mesh) return;
  const records = frameOrRecords && Array.isArray(frameOrRecords.contactShadows)
    ? frameOrRecords.contactShadows
    : (Array.isArray(frameOrRecords) ? frameOrRecords : []);
  ensureContactShadowCapacity(pool, records.length);
  assertDynamicBufferOwnerWritable(pool.dynamicBufferOwner);
  let count = 0;
  let dirty = false;
  const priorRecords = pool.records || (pool.records = new Map());
  const seen = pool.seen || (pool.seen = new Set());
  seen.clear();
  for (const item of records) {
    const entity = item && item.entity || item;
    if (!entity || entity.alive === false || entity._noShadow) continue;
    if (entity.type !== 'ship' && entity.type !== 'station') continue;
    const mesh = item && item.mesh || (meshes && meshes.get(entity.id));
    if (!mesh || mesh.visible === false || !(mesh.userData && mesh.userData.hasContactShadow)) continue;
    ensureContactShadowCapacity(pool, count + 1);
    const radius = Number(mesh.userData.contactShadowRadius) || Math.max(16, (entity.radius || 28) * 1.4);
    // Prefer mesh frame-local pose (authoritative for Three.js after syncEntityViews).
    const x = Number.isFinite(mesh.position.x) ? mesh.position.x : 0;
    const z = Number.isFinite(mesh.position.z) ? mesh.position.z : 0;
    seen.add(entity.id);
    let prev = priorRecords.get(entity.id);
    if (!prev || prev.index !== count ||
        Math.abs(prev.x - x) > 0.01 || Math.abs(prev.z - z) > 0.01 || Math.abs(prev.radius - radius) > 0.01) {
      CONTACT_SHADOW_POS.set(x, -0.5, z);
      CONTACT_SHADOW_SCALE.set(radius, radius, radius);
      CONTACT_SHADOW_MATRIX.compose(CONTACT_SHADOW_POS, CONTACT_SHADOW_QUAT, CONTACT_SHADOW_SCALE);
      assertDynamicBufferOwnerWritable(pool.dynamicBufferOwner);
      markDynamicBufferItems(pool.dynamicBufferOwner, CONTACT_SHADOW_MATRIX_BINDING, count);
      pool.mesh.setMatrixAt(count, CONTACT_SHADOW_MATRIX);
      if (!prev) {
        prev = { index: count, x, z, radius };
        priorRecords.set(entity.id, prev);
      } else {
        prev.index = count; prev.x = x; prev.z = z; prev.radius = radius;
      }
      dirty = true;
    }
    count++;
  }
  for (const id of priorRecords.keys()) {
    if (!seen.has(id)) priorRecords.delete(id);
  }
  pool.mesh.visible = count > 0;
  if (pool.dynamicBufferOwner) {
    commitDynamicBufferOwner(pool.dynamicBufferOwner, count);
  } else {
    if (pool.mesh.count !== count) {
      pool.mesh.count = count;
      dirty = true;
    }
    if (dirty) pool.mesh.instanceMatrix.needsUpdate = true;
  }
}

const SHIELD_POOL_VERT = /* glsl */`
  attribute float instanceFlash;
  attribute float instanceBase;
  attribute vec4 instanceHit0;
  attribute vec4 instanceHit1;
  attribute vec4 instanceHit2;
  attribute vec4 instanceHit3;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vInstanceColor;
  varying float vFlash;
  varying float vBase;
  varying vec4 vHit0;
  varying vec4 vHit1;
  varying vec4 vHit2;
  varying vec4 vHit3;
  void main() {
    mat4 instanceModel = modelMatrix * instanceMatrix;
    vec4 wp = instanceModel * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(instanceModel) * normal);
    vInstanceColor = instanceColor;
    vFlash = instanceFlash;
    vBase = instanceBase;
    vHit0 = instanceHit0;
    vHit1 = instanceHit1;
    vHit2 = instanceHit2;
    vHit3 = instanceHit3;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const SHIELD_POOL_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vInstanceColor;
  varying float vFlash;
  varying float vBase;
  varying vec4 vHit0;
  varying vec4 vHit1;
  varying vec4 vHit2;
  varying vec4 vHit3;
  float contactFlare(vec3 N, vec4 hit) {
    if (hit.w <= 0.001) return 0.0;
    vec3 dir = hit.xyz;
    float len = length(dir);
    if (len < 1e-4) return 0.0;
    dir /= len;
    float lobe = pow(max(0.0, dot(N, dir)), 8.0);
    return lobe * hit.w;
  }
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    float contact = contactFlare(N, vHit0) + contactFlare(N, vHit1)
      + contactFlare(N, vHit2) + contactFlare(N, vHit3);
    float alpha = clamp(vBase * fres + vFlash + contact * 0.85, 0.0, 1.0);
    vec3 col = mix(vInstanceColor, vec3(1.0), min(1.0, vFlash * 0.7 + contact * 0.55));
    gl_FragColor = vec4(col, alpha * (0.45 + 0.55 * fres));
  }
`;

const SHIELD_PRESENTATION_EPSILON = 0.015;

/** Shields read on impact instead of coating every healthy ship in a permanent translucent sphere. */
export function shouldPresentShieldBubble(shield, flash) {
  return Number(shield) > 0 && Number(flash) > SHIELD_PRESENTATION_EPSILON;
}

export function createShipAuxPool(scene) {
  const pool = {
    scene,
    shield: { capacity: 0, mesh: null, material: createShieldAuxMaterial() },
    nav: { capacity: 0, mesh: null, material: createNavLightAuxMaterial() },
    entityPasses: 0,
    entitiesVisited: 0,
  };
  ensureShieldAuxCapacity(pool.shield, SHIP_AUX_SHIELD_INITIAL_CAPACITY, scene);
  ensureNavLightAuxCapacity(pool.nav, SHIP_AUX_NAV_INITIAL_CAPACITY, scene);
  return pool;
}

function createShieldAuxMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SHIELD_POOL_VERT,
    fragmentShader: SHIELD_POOL_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
  });
}

function createNavLightAuxMaterial() {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    fog: false,
  });
}

function registerShieldAuxDynamicOwner(scene, mesh) {
  const attributes = [
    { name: 'matrix', attribute: mesh.instanceMatrix },
    { name: 'color', attribute: mesh.instanceColor },
    { name: 'flash', attribute: mesh.geometry.getAttribute('instanceFlash') },
    { name: 'base', attribute: mesh.geometry.getAttribute('instanceBase') },
  ];
  for (let i = 0; i < SHIELD_HIT_SLOTS; i++) {
    attributes.push({
      name: `hit${i}`,
      attribute: mesh.geometry.getAttribute(`instanceHit${i}`),
    });
  }
  return registerDynamicBufferOwner(scene, {
    id: `ship-aux-shield-${mesh.id}`,
    mesh,
    attributes,
  });
}

function registerNavAuxDynamicOwner(scene, mesh) {
  return registerDynamicBufferOwner(scene, {
    id: `ship-aux-nav-${mesh.id}`,
    mesh,
    attributes: [
      { name: 'matrix', attribute: mesh.instanceMatrix },
      { name: 'color', attribute: mesh.instanceColor },
    ],
  });
}

function ensureShieldAuxCapacity(pool, desired, scene, preserveCount = 0) {
  if (!pool || desired <= pool.capacity) return;
  const nextCapacity = Math.max(desired, pool.capacity ? pool.capacity * 2 : SHIP_AUX_SHIELD_INITIAL_CAPACITY);
  const previous = pool.mesh;
  const geometry = shieldBubbleGeometry().clone();
  geometry.setAttribute('instanceFlash', new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('instanceBase', new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity), 1).setUsage(THREE.DynamicDrawUsage));
  for (let i = 0; i < SHIELD_HIT_SLOTS; i++) {
    geometry.setAttribute(
      `instanceHit${i}`,
      new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity * 4), 4).setUsage(THREE.DynamicDrawUsage),
    );
  }
  const mesh = new THREE.InstancedMesh(geometry, pool.material, nextCapacity);
  mesh.name = 'ShipShieldBubble_Pool';
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.spacefaceTags = { vfxRole: 'shieldBubblePool' };
  mesh.userData.shipAuxPool = 'shieldBubble';
  stampShipAuxPoolPackage(mesh, 'shield', nextCapacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  if (previous && preserveCount > 0) {
    mesh.instanceMatrix.array.set(previous.instanceMatrix.array.subarray(0, preserveCount * 16));
    if (previous.instanceColor) {
      mesh.instanceColor.array.set(previous.instanceColor.array.subarray(0, preserveCount * 3));
    }
    const previousFlash = previous.geometry.getAttribute('instanceFlash');
    const previousBase = previous.geometry.getAttribute('instanceBase');
    if (previousFlash) geometry.getAttribute('instanceFlash').array.set(previousFlash.array.subarray(0, preserveCount));
    if (previousBase) geometry.getAttribute('instanceBase').array.set(previousBase.array.subarray(0, preserveCount));
    for (let i = 0; i < SHIELD_HIT_SLOTS; i++) {
      const previousHit = previous.geometry.getAttribute(`instanceHit${i}`);
      if (previousHit) {
        geometry.getAttribute(`instanceHit${i}`).array.set(
          previousHit.array.subarray(0, preserveCount * 4),
        );
      }
    }
  }
  let dynamicBufferOwner = null;
  try {
    dynamicBufferOwner = registerShieldAuxDynamicOwner(scene, mesh);
    if (pool.dynamicBufferOwner) unregisterDynamicBufferOwner(pool.dynamicBufferOwner);
  } catch (error) {
    if (dynamicBufferOwner) unregisterDynamicBufferOwner(dynamicBufferOwner);
    geometry.dispose();
    mesh.dispose();
    throw error;
  }
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
  pool.dynamicBufferOwner = dynamicBufferOwner;
  if (previous && scene) {
    scene.remove(previous);
    if (previous.geometry && typeof previous.geometry.dispose === 'function') previous.geometry.dispose();
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  if (scene) scene.add(mesh);
}

function ensureNavLightAuxCapacity(pool, desired, scene, preserveCount = 0) {
  if (!pool || desired <= pool.capacity) return;
  const nextCapacity = Math.max(desired, pool.capacity ? pool.capacity * 2 : SHIP_AUX_NAV_INITIAL_CAPACITY);
  const previous = pool.mesh;
  const mesh = new THREE.InstancedMesh(SHIP_AUX_NAV_GEOMETRY, pool.material, nextCapacity);
  mesh.name = 'ShipNavLight_Pool';
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.spacefaceTags = { damageRole: 'navLightPool' };
  mesh.userData.shipAuxPool = 'navLight';
  stampShipAuxPoolPackage(mesh, 'nav', nextCapacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  if (previous && preserveCount > 0) {
    mesh.instanceMatrix.array.set(previous.instanceMatrix.array.subarray(0, preserveCount * 16));
    if (previous.instanceColor) {
      mesh.instanceColor.array.set(previous.instanceColor.array.subarray(0, preserveCount * 3));
    }
  }
  let dynamicBufferOwner = null;
  try {
    dynamicBufferOwner = registerNavAuxDynamicOwner(scene, mesh);
    if (pool.dynamicBufferOwner) unregisterDynamicBufferOwner(pool.dynamicBufferOwner);
  } catch (error) {
    if (dynamicBufferOwner) unregisterDynamicBufferOwner(dynamicBufferOwner);
    mesh.dispose();
    throw error;
  }
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
  pool.dynamicBufferOwner = dynamicBufferOwner;
  if (previous && scene) {
    scene.remove(previous);
    if (previous.geometry && previous.geometry !== SHIP_AUX_NAV_GEOMETRY && typeof previous.geometry.dispose === 'function') previous.geometry.dispose();
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  if (scene) scene.add(mesh);
}

export function syncShipAuxPools(pool, frameOrEntities, meshes) {
  if (!pool) return;
  const classifiedFrame = frameOrEntities && Array.isArray(frameOrEntities.shipAux)
    ? frameOrEntities
    : null;
  const entities = classifiedFrame ? classifiedFrame.shipAux : frameOrEntities;
  if (!Array.isArray(entities)) return;
  let shieldCount = 0;
  let navCount = 0;
  let shieldMatrixDirty = false;
  let shieldColorDirty = false;
  let shieldFlashDirty = false;
  let shieldBaseDirty = false;
  let navMatrixDirty = false;
  let navColorDirty = false;
  let entitiesVisited = classifiedFrame ? classifiedFrame.entitiesVisited : 0;
  for (const item of entities) {
    if (!classifiedFrame) entitiesVisited++;
    const entity = item && item.entity || item;
    if (!entity || entity.alive === false || entity.type !== 'ship') continue;
    const root = item && item.mesh || (meshes && meshes.get(entity.id));
    if (!root || root.visible === false || !root.userData) continue;
    const bubble = root.userData.shieldBubble;
    if (bubble) {
      bubble.visible = false;
      const uniforms = bubble.material && bubble.material.uniforms;
      const flash = uniforms && uniforms.uFlash ? uniforms.uFlash.value || 0 : 0;
      if (shouldPresentShieldBubble(entity.shield, flash)) {
        ensureShieldAuxCapacity(pool.shield, shieldCount + 1, pool.scene, shieldCount);
        const shieldMesh = pool.shield.mesh;
        const flashAttr = shieldMesh.geometry.getAttribute('instanceFlash');
        const baseAttr = shieldMesh.geometry.getAttribute('instanceBase');
        bubble.updateWorldMatrix(true, false);
        if (writeInstanceMatrixIfChanged(
          shieldMesh, shieldCount, bubble.matrixWorld,
          pool.shield.dynamicBufferOwner, SHIP_AUX_SHIELD_MATRIX,
        )) shieldMatrixDirty = true;
        const color = uniforms && uniforms.uColor && uniforms.uColor.value;
        if (writeInstanceColorIfChanged(
          shieldMesh, shieldCount, color && color.isColor ? color : SHIP_AUX_COLOR.set(0x5fd0ff),
          pool.shield.dynamicBufferOwner, SHIP_AUX_SHIELD_COLOR,
        )) shieldColorDirty = true;
        if (writeScalarAttributeIfChanged(
          flashAttr, shieldCount, uniforms && uniforms.uFlash ? uniforms.uFlash.value || 0 : 0,
          pool.shield.dynamicBufferOwner, SHIP_AUX_SHIELD_FLASH,
        )) shieldFlashDirty = true;
        if (writeScalarAttributeIfChanged(
          baseAttr, shieldCount, uniforms && uniforms.uBase ? uniforms.uBase.value || 0.22 : 0.22,
          pool.shield.dynamicBufferOwner, SHIP_AUX_SHIELD_BASE,
        )) shieldBaseDirty = true;
        const hits = readShieldContacts(entity.id, SHIELD_HIT_SCRATCH) || SHIELD_HIT_SCRATCH;
        if (!hits) SHIELD_HIT_SCRATCH.fill(0);
        for (let hit = 0; hit < SHIELD_HIT_SLOTS; hit++) {
          const hitAttr = shieldMesh.geometry.getAttribute(`instanceHit${hit}`);
          const o = hit * 4;
          if (writeVec4AttributeIfChanged(
            hitAttr, shieldCount,
            hits[o], hits[o + 1], hits[o + 2], hits[o + 3],
            pool.shield.dynamicBufferOwner, SHIP_AUX_SHIELD_HIT0 + hit,
          )) shieldBaseDirty = true;
        }
        shieldCount++;
      }
    }

    const sources = getPooledNavLightSources(root);
    for (const source of sources) {
      source.visible = false;
      source.updateWorldMatrix(true, false);
      const sourceCount = Math.max(0, source.count || 0);
      if (!sourceCount) continue;
      ensureNavLightAuxCapacity(pool.nav, navCount + sourceCount, pool.scene, navCount);
      const navMesh = pool.nav.mesh;
      const mat = Array.isArray(source.material) ? source.material[0] : source.material;
      const base = mat && mat.emissive && mat.emissive.isColor ? mat.emissive : (mat && mat.color && mat.color.isColor ? mat.color : SHIP_AUX_COLOR.set(0x88eeff));
      const intensity = mat && Number.isFinite(mat.emissiveIntensity) ? mat.emissiveIntensity : 1;
      SHIP_AUX_COLOR.copy(base).multiplyScalar(Math.max(0, intensity));
      if (mat && Number.isFinite(mat.opacity)) SHIP_AUX_COLOR.multiplyScalar(Math.max(0, mat.opacity));
      for (let i = 0; i < sourceCount; i++) {
        source.getMatrixAt(i, SHIP_AUX_LOCAL_MATRIX);
        SHIP_AUX_WORLD_MATRIX.multiplyMatrices(source.matrixWorld, SHIP_AUX_LOCAL_MATRIX);
        if (writeInstanceMatrixIfChanged(
          navMesh, navCount, SHIP_AUX_WORLD_MATRIX,
          pool.nav.dynamicBufferOwner, SHIP_AUX_NAV_MATRIX,
        )) navMatrixDirty = true;
        if (writeInstanceColorIfChanged(
          navMesh, navCount, SHIP_AUX_COLOR,
          pool.nav.dynamicBufferOwner, SHIP_AUX_NAV_COLOR,
        )) navColorDirty = true;
        navCount++;
      }
    }
  }

  const shieldMesh = pool.shield.mesh;
  const flashAttr = shieldMesh.geometry.getAttribute('instanceFlash');
  const baseAttr = shieldMesh.geometry.getAttribute('instanceBase');
  shieldMesh.visible = shieldCount > 0;
  if (pool.shield.dynamicBufferOwner) {
    commitDynamicBufferOwner(pool.shield.dynamicBufferOwner, shieldCount);
  } else {
    if (shieldMesh.count !== shieldCount) shieldMesh.count = shieldCount;
    if (shieldMatrixDirty) shieldMesh.instanceMatrix.needsUpdate = true;
    if (shieldColorDirty && shieldMesh.instanceColor) shieldMesh.instanceColor.needsUpdate = true;
    if (shieldFlashDirty) flashAttr.needsUpdate = true;
    if (shieldBaseDirty) baseAttr.needsUpdate = true;
  }

  const navMesh = pool.nav.mesh;
  navMesh.visible = navCount > 0;
  if (pool.nav.dynamicBufferOwner) {
    commitDynamicBufferOwner(pool.nav.dynamicBufferOwner, navCount);
  } else {
    if (navMesh.count !== navCount) navMesh.count = navCount;
    if (navMatrixDirty) navMesh.instanceMatrix.needsUpdate = true;
    if (navColorDirty && navMesh.instanceColor) navMesh.instanceColor.needsUpdate = true;
  }

  pool.entityPasses = 1;
  pool.entitiesVisited = entitiesVisited;
}

function writeInstanceMatrixIfChanged(mesh, index, matrix, dynamicBufferOwner = null, bindingIndex = 0, epsilon = 1e-6) {
  const target = mesh && mesh.instanceMatrix && mesh.instanceMatrix.array;
  const source = matrix && matrix.elements;
  if (!target || !source) return false;
  const offset = index * 16;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(target[offset + i] - source[i]) > epsilon) {
      assertDynamicBufferOwnerWritable(dynamicBufferOwner);
      markDynamicBufferItems(dynamicBufferOwner, bindingIndex, index);
      mesh.setMatrixAt(index, matrix);
      return true;
    }
  }
  return false;
}

function writeInstanceColorIfChanged(mesh, index, color, dynamicBufferOwner = null, bindingIndex = 0, epsilon = 1e-6) {
  const target = mesh && mesh.instanceColor && mesh.instanceColor.array;
  if (!target || !color) return false;
  const offset = index * 3;
  if (Math.abs(target[offset] - color.r) <= epsilon
      && Math.abs(target[offset + 1] - color.g) <= epsilon
      && Math.abs(target[offset + 2] - color.b) <= epsilon) return false;
  assertDynamicBufferOwnerWritable(dynamicBufferOwner);
  markDynamicBufferItems(dynamicBufferOwner, bindingIndex, index);
  mesh.setColorAt(index, color);
  return true;
}

function writeScalarAttributeIfChanged(attribute, index, value, dynamicBufferOwner = null, bindingIndex = 0, epsilon = 1e-6) {
  if (!attribute || !attribute.array) return false;
  if (Math.abs(attribute.array[index] - value) <= epsilon) return false;
  assertDynamicBufferOwnerWritable(dynamicBufferOwner);
  markDynamicBufferItems(dynamicBufferOwner, bindingIndex, index);
  attribute.setX(index, value);
  return true;
}

function writeVec4AttributeIfChanged(attribute, index, x, y, z, w, dynamicBufferOwner = null, bindingIndex = 0, epsilon = 1e-5) {
  if (!attribute || !attribute.array) return false;
  const offset = index * 4;
  const arr = attribute.array;
  if (Math.abs(arr[offset] - x) <= epsilon
      && Math.abs(arr[offset + 1] - y) <= epsilon
      && Math.abs(arr[offset + 2] - z) <= epsilon
      && Math.abs(arr[offset + 3] - w) <= epsilon) return false;
  assertDynamicBufferOwnerWritable(dynamicBufferOwner);
  markDynamicBufferItems(dynamicBufferOwner, bindingIndex, index);
  attribute.setXYZW(index, x, y, z, w);
  return true;
}

function getPooledNavLightSources(root) {
  if (!root || !root.userData) return [];
  let sources = root.userData.__pooledNavLightSources;
  if (sources) return sources;
  sources = [];
  root.traverse((object) => {
    if (!object || !object.isInstancedMesh || object.name !== 'GLTFKit_Nav_Lights') return;
    if (!object.userData || object.userData.damageRole !== 'navLight') return;
    sources.push(object);
  });
  root.userData.__pooledNavLightSources = sources;
  return sources;
}

/** How many retired-with-cause boundary records to keep readable after disposal erases them. */
export const SECTOR_BOUNDARY_FAILURE_TAIL = 24;

export const SECTOR_BOUNDARY_PREPARATION_STATE = Object.freeze({
  reserved: 'RESERVED',
  mountedHidden: 'MOUNTED_HIDDEN',
  preparing: 'PREPARING',
  ready: 'READY',
  publishing: 'PUBLISHING',
  live: 'LIVE',
  aborting: 'ABORTING',
  disposed: 'DISPOSED',
});

export function isLiveSectorBoundaryRecordCurrent(prepared, options = {}) {
  if (prepared?.state !== SECTOR_BOUNDARY_PREPARATION_STATE.live
      || prepared.cleanupBlocked === true) return false;
  const current = options.entities?.get(prepared.id);
  const boundary = options.meshes?.get(prepared.id);
  const fingerprint = typeof options.fingerprintForEntity === 'function'
    ? options.fingerprintForEntity(current)
    : prepared.fingerprint;
  const expectedSectorId = options.sectorId == null ? null : String(options.sectorId);
  return !!current
    && current === prepared.entity
    && current.alive !== false
    && (!expectedSectorId || String(entitySectorId(current) || '') === expectedSectorId)
    && boundary === prepared.boundary
    && current.mesh === prepared.boundary
    && fingerprint === prepared.fingerprint
    && (typeof options.isEligible !== 'function' || options.isEligible(current) === true);
}

export function pruneSettledSectorBoundaryRecords(records, options = {}) {
  if (!records || typeof records.delete !== 'function') return records;
  for (const record of records) {
    if (!record || (record.state === SECTOR_BOUNDARY_PREPARATION_STATE.disposed
      && record.cleanupBlocked !== true)) {
      records.delete(record);
      options.onPruned?.(record);
      continue;
    }
    if (record.state === SECTOR_BOUNDARY_PREPARATION_STATE.live
        && record.cleanupBlocked !== true
        && typeof options.isLiveRecordCurrent === 'function'
        && options.isLiveRecordCurrent(record) !== true) {
      records.delete(record);
      options.onPruned?.(record);
    }
  }
  return records;
}

export function reconcileSettledSectorBoundaryRecords(records, options = {}) {
  if (!records || typeof records.delete !== 'function') return records;
  for (const prepared of [...records]) {
    if (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.ready
        || prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.live) continue;
    const current = options.entities?.get(prepared?.id);
    const expectedEntityInvalidation = !current
      || current !== prepared?.entity
      || current.alive === false
      || (options.sectorId != null
        && String(entitySectorId(current) || '') !== String(options.sectorId))
      || prepared?.abortReason === 'entity-destroyed-during-sector-prewarm'
      || prepared?.abortReason === 'ship-appearance-changed-during-sector-prewarm'
      || prepared?.abortReason === 'ship-rebuild-during-sector-prewarm';
    const currentPreparation = typeof options.currentRecordForId === 'function'
      ? options.currentRecordForId(prepared?.id)
      : null;
    const safelySuperseded = currentPreparation && currentPreparation !== prepared;
    if (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.disposed
        && prepared.cleanupBlocked !== true
        && (expectedEntityInvalidation || safelySuperseded)) {
      records.delete(prepared);
      continue;
    }
    throw prepared?.cleanupError
      || prepared?.restoreError
      || prepared?.error
      || new Error(`Incoming authored boundary ${prepared?.id ?? 'unknown'} was not prepared`);
  }
  return records;
}

export async function settleSectorBoundaryRecordSnapshot(records, options = {}) {
  const snapshot = new Set([...(records || [])]);
  const admitted = [...snapshot];
  if (typeof options.settleRecords === 'function') await options.settleRecords(snapshot);
  reconcileSettledSectorBoundaryRecords(snapshot, options);
  if (records && typeof records.delete === 'function') {
    for (const prepared of admitted) {
      if (!snapshot.has(prepared)) records.delete(prepared);
    }
  }
  return snapshot;
}

export function snapshotSectorPrewarmPopulation(record) {
  return {
    promise: record?.promise || null,
    revision: Number(record?.boundaryRevision) || 0,
    boundaryRecords: new Set([...(record?.boundaryRecords || [])]),
    liveBoundaryEntries: new Map(record?.liveBoundaryPromises || []),
    boundaryMembership: [...(record?.boundaryRecords || [])].map((prepared) => ({
      id: prepared?.id,
      entity: prepared?.entity,
      record: prepared,
      fingerprint: prepared?.fingerprint,
    })),
    liveBoundaryMembership: [...(record?.liveBoundaryPromises || [])].map(([id, entry]) => ({
      id,
      entity: entry?.entity,
      entry,
      fingerprint: entry?.fingerprint,
    })),
  };
}

function sectorPrewarmPopulationMatches(record, snapshot) {
  if (!record
      || !snapshot
      || record.promise !== snapshot.promise
      || (Number(record.boundaryRevision) || 0) !== snapshot.revision) return false;
  const boundaryRecords = record.boundaryRecords || new Set();
  if (boundaryRecords.size !== snapshot.boundaryMembership.length) return false;
  for (const member of snapshot.boundaryMembership) {
    if (!boundaryRecords.has(member.record)
        || member.record?.id !== member.id
        || member.record?.entity !== member.entity
        || member.record?.fingerprint !== member.fingerprint) return false;
  }
  const liveBoundaryEntries = record.liveBoundaryPromises || new Map();
  if (liveBoundaryEntries.size !== snapshot.liveBoundaryMembership.length) return false;
  for (const member of snapshot.liveBoundaryMembership) {
    if (liveBoundaryEntries.get(member.id) !== member.entry
        || member.entry?.entity !== member.entity
        || member.entry?.fingerprint !== member.fingerprint) return false;
  }
  return true;
}

function failClosedSectorPrewarm(error, code = 'SPACEFACE_SECTOR_PREWARM_INVARIANT') {
  const exactError = error instanceof Error ? error : new Error(String(error));
  exactError.code = exactError.code || code;
  exactError.preventSectorFallbackRotation = true;
  return exactError;
}

function sectorPrewarmGenerationEnvelopeMatches(record, current) {
  const recordSectorId = record?.sectorId == null ? null : String(record.sectorId);
  const currentSectorId = current?.sectorId == null ? null : String(current.sectorId);
  const complete = record?.active === true
    && current?.record === record
    && Number.isFinite(record?.generation)
    && Number.isFinite(current?.generation)
    && Number.isFinite(record?.preparationEpoch)
    && Number.isFinite(current?.preparationEpoch)
    && Number.isFinite(record?.contextGeneration)
    && Number.isFinite(current?.contextGeneration)
    && typeof record?.preparationSignature === 'string'
    && record.preparationSignature.length > 0
    && typeof current?.preparationSignature === 'string'
    && current.preparationSignature.length > 0
    && typeof current?.contextLost === 'boolean'
    && recordSectorId != null
    && currentSectorId != null;
  return complete
    && record.generation === current.generation
    && record.preparationEpoch === current.preparationEpoch
    && record.contextGeneration === current.contextGeneration
    && record.preparationSignature === current.preparationSignature
    && recordSectorId === currentSectorId
    && current.contextLost === false;
}

/** Promote cleanup failures discovered while unwinding an otherwise optional admission failure.
 * abortRecords intentionally returns allSettled outcomes, so the caller must inspect both those
 * outcomes and the retained records before it can safely clear the generation or rotate residency. */
export function promoteSectorPrewarmAbortQuarantine(records, outcomes, originalError) {
  const blockedRecords = [...(records || [])].filter((record) => (
    record?.cleanupBlocked === true
      || record?.state === SECTOR_BOUNDARY_PREPARATION_STATE.aborting
      || record?.cleanupError
      || record?.restoreError
  ));
  const rejected = [...(outcomes || [])]
    .filter((outcome) => outcome?.status === 'rejected')
    .map((outcome) => outcome.reason);
  if (blockedRecords.length === 0 && rejected.length === 0) return originalError;
  const failures = [
    originalError,
    ...rejected,
    ...blockedRecords.flatMap((record) => [record.cleanupError, record.restoreError].filter(Boolean)),
  ].filter(Boolean);
  return failClosedSectorPrewarm(
    new AggregateError(failures, 'Sector prewarm abort cleanup entered quarantine', {
      cause: originalError,
    }),
    'SPACEFACE_SECTOR_PREWARM_CLEANUP_QUARANTINE',
  );
}

/** Refuse fallback residency rotation once the preparation generation no longer owns the exact
 * renderer/context envelope in which it started. Settings, resize, context loss, and supersession
 * can invalidate that envelope without first flipping record.active; checking only active/sector
 * would let a raw async rejection rotate an obsolete generation. */
export function promoteSectorPrewarmGenerationInvalidation(record, current, originalError) {
  if (sectorPrewarmGenerationEnvelopeMatches(record, current)) return originalError;
  const cause = originalError instanceof Error ? originalError : new Error(String(originalError));
  return failClosedSectorPrewarm(
    new Error('Sector prewarm renderer generation changed before fallback residency rotation', {
      cause,
    }),
    'SPACEFACE_SECTOR_PREWARM_GENERATION_INVALIDATED',
  );
}

export function createSectorPrewarmCertification(record, snapshot, current) {
  if (!sectorPrewarmGenerationEnvelopeMatches(record, current)
      || !sectorPrewarmPopulationMatches(record, snapshot)) return null;
  return Object.freeze({
    record,
    snapshot,
    sectorId: String(record.sectorId),
    generation: record.generation,
    preparationEpoch: record.preparationEpoch,
    contextGeneration: record.contextGeneration,
    preparationSignature: record.preparationSignature,
    revision: snapshot.revision,
  });
}

export function sectorPrewarmCertificationIsCurrent(record, certification, current = {}) {
  if (!certification
      || certification.record !== record
      || certification.snapshot == null
      || certification.sectorId !== String(record?.sectorId ?? '')
      || certification.generation !== record?.generation
      || certification.preparationEpoch !== record?.preparationEpoch
      || certification.contextGeneration !== record?.contextGeneration
      || certification.preparationSignature !== record?.preparationSignature
      || certification.revision !== (Number(record?.boundaryRevision) || 0)
      || !sectorPrewarmGenerationEnvelopeMatches(record, current)
      || !sectorPrewarmPopulationMatches(record, certification.snapshot)) return false;
  if (typeof current.validatePopulation === 'function') {
    try {
      if (current.validatePopulation(record, certification.snapshot) !== true) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

/** Settle one moving sector-prewarm population to an identity-stable fixpoint. Target-sector spawn
 * events may add or replace exact boundaries while decode/GPU admission is awaiting; cardinality is
 * insufficient because equal-size churn can still substitute a different owner. Publication runs
 * only after the same promise, boundary identities, and live-entry identities survive a full settle,
 * then repeats if a producer extends the population during the asynchronous publish itself. */
export async function settleSectorPrewarmPopulationFixpoint(record, options = {}) {
  const maxPasses = Number.isInteger(options.maxPasses) && options.maxPasses > 0
    ? options.maxPasses
    : 64;
  const isActive = () => record?.active === true
    && (typeof options.isActive !== 'function' || options.isActive(record) === true);
  const awaitActivePhase = async (phase) => {
    try {
      await phase();
    } catch (error) {
      if (error?.preventSectorFallbackRotation === true) throw error;
      if (!isActive()) return false;
      throw error;
    }
    return isActive();
  };
  record.certification = null;
  await Promise.resolve();
  for (let pass = 0; pass < maxPasses && isActive(); pass++) {
    if (typeof options.refreshPopulation === 'function') {
      if (!await awaitActivePhase(() => options.refreshPopulation(
        record,
        { pass, phase: 'before-settle' },
      ))) return false;
    }
    const snapshot = snapshotSectorPrewarmPopulation(record);
    if (typeof options.settlePrefetch === 'function') {
      if (!await awaitActivePhase(() => options.settlePrefetch(snapshot.promise, snapshot))) return false;
    }
    if (typeof options.settleBoundaryRecords === 'function') {
      if (!await awaitActivePhase(() => options.settleBoundaryRecords(
        snapshot.boundaryRecords,
        snapshot,
      ))) return false;
    }
    if (typeof options.settleLiveBoundaryEntries === 'function') {
      if (!await awaitActivePhase(() => options.settleLiveBoundaryEntries(
        [...snapshot.liveBoundaryEntries.values()],
        snapshot,
      ))) return false;
    }
    if (typeof options.refreshPopulation === 'function') {
      if (!await awaitActivePhase(() => options.refreshPopulation(
        record,
        { pass, phase: 'after-settle' },
      ))) return false;
    }
    await Promise.resolve();
    if (!isActive()) return false;
    if (!sectorPrewarmPopulationMatches(record, snapshot)) continue;
    if (typeof options.publishBoundaryRecords === 'function') {
      if (!await awaitActivePhase(() => options.publishBoundaryRecords(
        snapshot.boundaryRecords,
        snapshot,
      ))) return false;
      if (typeof options.refreshPopulation === 'function') {
        if (!await awaitActivePhase(() => options.refreshPopulation(
          record,
          { pass, phase: 'after-publish' },
        ))) return false;
      }
      await Promise.resolve();
      if (!isActive()) return false;
      if (!sectorPrewarmPopulationMatches(record, snapshot)) continue;
    }
    if (typeof options.validatePopulation === 'function') {
      if (!await awaitActivePhase(() => options.validatePopulation(record, snapshot))) return false;
      await Promise.resolve();
      if (!isActive()) return false;
      if (!sectorPrewarmPopulationMatches(record, snapshot)) continue;
    }
    if (!isActive()) return false;
    if (typeof options.certifyPopulation === 'function') {
      let certification;
      try {
        certification = options.certifyPopulation(record, snapshot);
      } catch (error) {
        if (!isActive()) return false;
        throw error;
      }
      if (!isActive()) return false;
      if (!certification || typeof certification.then === 'function') {
        throw failClosedSectorPrewarm(
          new Error('Sector prewarm final population did not produce a synchronous certification'),
          'SPACEFACE_SECTOR_PREWARM_CERTIFICATION_MISSING',
        );
      }
      record.certification = certification;
    }
    return true;
  }
  if (!isActive()) return false;
  throw failClosedSectorPrewarm(
    new Error(`Sector prewarm population did not stabilize within ${maxPasses} deterministic passes`),
    'SPACEFACE_SECTOR_PREWARM_FIXPOINT_EXHAUSTED',
  );
}

/** Publish exactly one settled boundary snapshot. READY records must all publish successfully;
 * already-LIVE records are idempotent members from an earlier fixpoint pass. Any other state is a
 * fail-closed admission error rather than a silently omitted hidden reservation. */
export async function publishSectorBoundaryRecordSnapshot(records, options = {}) {
  if (typeof options.publishRecords !== 'function') {
    throw new TypeError('publishSectorBoundaryRecordSnapshot requires publishRecords');
  }
  const candidates = [];
  for (const prepared of records || []) {
    if (prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.live) continue;
    if (prepared?.state !== SECTOR_BOUNDARY_PREPARATION_STATE.ready) {
      throw failClosedSectorPrewarm(prepared?.cleanupError
        || prepared?.restoreError
        || prepared?.error
        || new Error(`Incoming authored boundary ${prepared?.id ?? 'unknown'} was not ready to publish`));
    }
    candidates.push(prepared);
  }
  const published = await options.publishRecords(candidates);
  if (!Array.isArray(published)
      || published.length !== candidates.length
      || published.some((value) => value !== true)) {
    throw failClosedSectorPrewarm(
      new Error(`Incoming sector ${options.sectorId ?? 'unknown'} lost a prepared authored boundary before publish`),
    );
  }
  return true;
}

const ACCEPTED_LIVE_AUTHORED_STATES = new Set([
  'authored',
  'same-semantic-fallback',
]);

/** Assert that the stable preparation population is an exact cover of the authoritative live
 * target-sector census. This rejects both omissions and stale LIVE supersets: a previously
 * published record is evidence only while its exact entity, boundary, fingerprint, and mesh map
 * identity still agree with the current world. */
export function validateSectorPrewarmPopulationCoverage(record, options = {}) {
  const fail = (message, error = null) => {
    throw failClosedSectorPrewarm(
      error || new Error(message),
      'SPACEFACE_SECTOR_PREWARM_INCOMPLETE_PUBLICATION',
    );
  };
  const eligibleById = new Map();
  for (const entity of options.entityList || []) {
    if (!entity || typeof options.isEligible !== 'function' || options.isEligible(entity) !== true) continue;
    if (options.entities?.get(entity.id) !== entity) {
      fail(`Incoming authored entity ${entity.id} was not authoritative in the entity map`);
    }
    if (eligibleById.has(entity.id)) {
      fail(`Incoming authored entity ${entity.id} appeared more than once in the target census`);
    }
    eligibleById.set(entity.id, entity);
  }

  const covered = new Map();
  for (const prepared of record?.boundaryRecords || []) {
    if (prepared?.cleanupBlocked === true
        || prepared?.state !== SECTOR_BOUNDARY_PREPARATION_STATE.live) {
      fail(
        `Incoming authored boundary ${prepared?.id ?? 'unknown'} remained ${prepared?.state || 'unknown'} after publish`,
        prepared?.cleanupError || prepared?.restoreError || prepared?.error,
      );
    }
    if (!eligibleById.has(prepared.id)
        || !isLiveSectorBoundaryRecordCurrent(prepared, options)) {
      fail(`Published authored boundary ${prepared.id} no longer matched the authoritative entity and mesh census`);
    }
    if (covered.has(prepared.id)) {
      fail(`Incoming authored entity ${prepared.id} had more than one published preparation owner`);
    }
    covered.set(prepared.id, prepared);
  }

  for (const [id, entry] of record?.liveBoundaryPromises || []) {
    const current = options.entities?.get(id);
    const boundary = options.meshes?.get(id);
    const fingerprint = typeof options.fingerprintForEntity === 'function'
      ? options.fingerprintForEntity(current)
      : entry?.fingerprint;
    const exact = eligibleById.get(id) === current
      && current === entry?.entity
      && current?.alive !== false
      && boundary === entry?.boundary
      && current?.mesh === entry?.boundary
      && fingerprint === entry?.fingerprint
      && entry?.preparationEpoch === options.preparationEpoch
      && entry?.contextGeneration === options.contextGeneration
      && entry?.preparationSignature === options.preparationSignature
      && options.contextLost !== true
      && ACCEPTED_LIVE_AUTHORED_STATES.has(boundary?.userData?.authoredAssetState);
    if (!exact) {
      fail(`Live authored boundary ${id} no longer matched the certified renderer generation`);
    }
    if (covered.has(id)) {
      fail(`Incoming authored entity ${id} had both prepared and live admission owners`);
    }
    covered.set(id, entry);
  }

  if (covered.size !== eligibleById.size) {
    const missing = [...eligibleById.keys()].filter((id) => !covered.has(id));
    fail(`Incoming authored census was missing exact coverage for ${missing.join(', ') || 'unknown owners'}`);
  }
  return true;
}

export async function settleLiveSectorBoundaryAdmissions(entries, options = {}) {
  const candidates = [...(entries || [])].filter(Boolean);
  const outcomes = await Promise.allSettled(candidates.map((entry) => entry.promise));
  const failures = [];
  for (let index = 0; index < candidates.length; index++) {
    const entry = candidates[index];
    const current = options.entities?.get(entry.id);
    const expectedSectorId = entry.sectorId == null ? null : String(entry.sectorId);
    if (!current
        || current !== entry.entity
        || current.alive === false
        || (expectedSectorId && String(entitySectorId(current) || '') !== expectedSectorId)) {
      continue;
    }
    const outcome = outcomes[index];
    if (outcome.status === 'rejected') {
      failures.push(outcome.reason);
      continue;
    }
    entry.receipt = outcome.value;
    const boundary = options.meshes?.get(entry.id);
    const fingerprint = typeof options.fingerprintForEntity === 'function'
      ? options.fingerprintForEntity(current)
      : entry.fingerprint;
    const authoredState = boundary?.userData?.authoredAssetState;
    const envelopeComplete = Number.isFinite(Number(entry.preparationEpoch))
      && Number.isFinite(Number(entry.contextGeneration))
      && typeof entry.preparationSignature === 'string'
      && entry.preparationSignature.length > 0;
    if (!boundary
        || boundary !== entry.boundary
        || current.mesh !== entry.boundary
        || fingerprint !== entry.fingerprint
        || !envelopeComplete
        || entry.preparationEpoch !== options.preparationEpoch
        || entry.contextGeneration !== options.contextGeneration
        || entry.preparationSignature !== options.preparationSignature
        || options.contextLost === true
        || !ACCEPTED_LIVE_AUTHORED_STATES.has(authoredState)) {
      failures.push(entry.receipt?.error || new Error(
        `Live authored boundary ${entry.id} did not finish exact admission `
          + `(receipt=${entry.receipt?.status || 'missing'}, state=${authoredState || 'missing'})`,
      ));
    }
  }
  if (failures.length) {
    const detail = failures.map((error) => error?.message || String(error)).join('; ');
    throw new AggregateError(failures, `Live authored sector-boundary admission failed: ${detail}`);
  }
  return true;
}

export function authoredBoundaryPreparationSignature(renderer, state, contextGeneration = 0) {
  const canvas = renderer && renderer.domElement;
  return JSON.stringify({
    contextGeneration,
    width: Number(canvas && canvas.width) || 0,
    height: Number(canvas && canvas.height) || 0,
    pixelRatio: Number(renderer && renderer.getPixelRatio && renderer.getPixelRatio()) || 1,
    outputColorSpace: renderer && renderer.outputColorSpace || null,
    toneMapping: renderer && renderer.toneMapping || null,
    shadows: !!(renderer && renderer.shadowMap && renderer.shadowMap.enabled),
    video: state && state.settings && state.settings.video || {},
  });
}

/**
 * Generation-owned hidden-boundary lifecycle. The manager is dependency-injected so its ordering and
 * failure atomicity can be proven without constructing a WebGLRenderer. Production supplies the real
 * visual factory, scene, authored admission queue, presentation binding, and disposal functions.
 */
export function createSectorBoundaryGenerationManager(options = {}) {
  const records = new Map();
  const states = SECTOR_BOUNDARY_PREPARATION_STATE;
  const startBudgetPerTurn = Math.max(0, Number(options.startBudgetPerTurn) || 0);
  const pendingStarts = [];
  let pendingStartHead = 0;
  let startTurnScheduled = false;
  // A record that fails during prepare is caught in startRecord, stored on the record, and then
  // DELETED from `records` by disposeRecord. One frame later there is no trace of it: the entity
  // simply has no mesh and nothing anywhere says why. That is exactly how a station failing to
  // admit reads as "no visual root was ever created" instead of "the root was built and thrown
  // away because X". Retain a bounded tail of retired-with-cause records so the reason survives
  // the disposal that erases the record itself.
  const failures = [];

  const retainFailure = (record) => {
    if (!record) return;
    const cause = record.error || record.cleanupError || record.restoreError || null;
    if (!cause && !record.abortReason) return;
    failures.push({
      id: record.id,
      sectorId: record.sectorId,
      generation: record.generation,
      state: record.state,
      abortReason: record.abortReason || null,
      error: cause ? String(cause && cause.message || cause) : null,
      authoredAssetState: record.boundary && record.boundary.userData
        ? record.boundary.userData.authoredAssetState || null : null,
      cleanupBlocked: record.cleanupBlocked === true,
    });
    if (failures.length > SECTOR_BOUNDARY_FAILURE_TAIL) failures.shift();
  };

  const disposeRecord = (record) => {
    if (!record || record.state === states.live) return Promise.resolve(record);
    if (record.cleanupPromise) return record.cleanupPromise;
    record.cleaned = true;
    record.cleanupPromise = (async () => {
      record.state = states.aborting;
      if (record.boundary) {
        try { await options.disposeBoundary?.(record); }
        catch (error) { record.cleanupError = error; }
      }
      try { options.restoreEntity?.(record); }
      catch (error) { record.restoreError = error; }
      if (record.cleanupError || record.restoreError) {
        record.cleanupBlocked = true;
        record.state = states.aborting;
        return record;
      }
      if (records.get(record.id) === record) records.delete(record.id);
      record.state = states.disposed;
      retainFailure(record);
      return record;
    })();
    return record.cleanupPromise;
  };

  const startRecord = async (record) => {
    if (!record.active) return disposeRecord(record);
    try {
      options.captureBeforeStart?.(record);
      record.beforeStartCaptured = true;
      record.boundary = options.buildBoundary(record);
      if (!record.boundary) throw new Error(`No render boundary for ${record.id}`);
      if (!record.active) return disposeRecord(record);
      options.mountBoundary(record);
      record.state = states.mountedHidden;
      if (!record.active) return disposeRecord(record);
      record.state = states.preparing;
      record.preparation = Promise.resolve(options.requestPreparation(record));
      record.receipt = await record.preparation;
      if (!record.active) return disposeRecord(record);
      if (options.isPrepared && options.isPrepared(record) !== true) {
        throw new Error(`Authored boundary ${record.id} did not reach prepared admission`);
      }
      record.state = states.ready;
      return record;
    } catch (error) {
      record.error = error;
      record.active = false;
      return disposeRecord(record);
    }
  };

  const scheduleStartTurn = () => {
    if (startTurnScheduled || pendingStartHead >= pendingStarts.length) return;
    startTurnScheduled = true;
    const schedule = typeof options.scheduleNextStartTurn === 'function'
      ? options.scheduleNextStartTurn
      : scheduleSectorBoundaryBuildTurn;
    schedule(() => {
      startTurnScheduled = false;
      const end = Math.min(pendingStarts.length, pendingStartHead + startBudgetPerTurn);
      while (pendingStartHead < end) {
        const pending = pendingStarts[pendingStartHead++];
        Promise.resolve(startRecord(pending.record)).then(pending.resolve, pending.reject);
      }
      if (pendingStartHead >= pendingStarts.length) {
        pendingStarts.length = 0;
        pendingStartHead = 0;
      }
      scheduleStartTurn();
    });
  };

  const scheduleRecordStart = (record) => {
    if (startBudgetPerTurn <= 0) return startRecord(record);
    return new Promise((resolve, reject) => {
      pendingStarts.push({ record, resolve, reject });
      scheduleStartTurn();
    });
  };

  const reserve = (spec = {}) => {
    const id = spec.id ?? spec.entity?.id;
    if (id == null || id === '') return null;
    const prior = records.get(id);
    if (prior && prior.active && prior.generation === spec.generation && prior.entity === spec.entity) {
      return prior;
    }
    if (prior) {
      prior.active = false;
      if (prior.state !== states.disposed && prior.state !== states.live) prior.state = states.aborting;
    }
    const record = {
      ...spec,
      id,
      active: true,
      cleaned: false,
      cleanupPromise: null,
      boundary: null,
      preparation: null,
      receipt: null,
      error: null,
      state: states.reserved,
    };
    records.set(id, record);
    const priorCleanup = prior && prior.state !== states.live
      ? Promise.resolve(prior.settled).then(() => disposeRecord(prior))
      : Promise.resolve(prior);
    record.settled = priorCleanup.then((cleanedPrior) => {
      if (cleanedPrior
          && cleanedPrior.state !== states.disposed
          && cleanedPrior.state !== states.live) {
        throw new AggregateError(
          [cleanedPrior.cleanupError, cleanedPrior.restoreError].filter(Boolean),
          `Prior authored boundary ${id} could not be retired safely`,
        );
      }
      return scheduleRecordStart(record);
    }).catch((error) => {
      record.active = false;
      record.error = error;
      record.cleanupError = error;
      record.cleanupBlocked = true;
      record.state = states.aborting;
      throw error;
    });
    return record;
  };

  const abort = (record, reason = 'sector-boundary-aborted') => {
    if (!record || record.state === states.live || record.state === states.disposed) {
      return Promise.resolve(record);
    }
    record.abortReason = reason;
    record.active = false;
    record.state = states.aborting;
    return Promise.resolve(record.settled).then(() => disposeRecord(record));
  };

  const publish = async (record) => {
    if (!record) return false;
    await record.settled;
    if (record.state === states.live) return true;
    if (!record.active || record.state !== states.ready || options.validate?.(record) !== true) {
      await abort(record, record.abortReason || 'sector-boundary-stale-before-publish');
      return false;
    }
    record.state = states.publishing;
    try {
      if (options.publishBoundary(record) === false) {
        throw new Error(`Authored boundary ${record.id} publication was declined`);
      }
      record.state = states.live;
      record.active = false;
      if (records.get(record.id) === record) records.delete(record.id);
      return true;
    } catch (error) {
      record.error = error;
      record.active = false;
      await disposeRecord(record);
      return false;
    }
  };

  return {
    reserve,
    publish,
    abort,
    abortEntity(id, reason) {
      return abort(records.get(id), reason);
    },
    abortRecords(iterable, reason) {
      return Promise.allSettled([...(iterable || [])].map((record) => abort(record, reason)));
    },
    abortAll(reason) {
      return Promise.allSettled([...records.values()].map((record) => abort(record, reason)));
    },
    settleRecords(iterable) {
      return Promise.allSettled([...(iterable || [])].map((record) => (
        Promise.resolve(record && record.settled).then(() => record?.cleanupPromise || record)
      )));
    },
    publishRecords(iterable) {
      return Promise.all([...(iterable || [])].map((record) => publish(record)));
    },
    has(id) {
      return records.has(id);
    },
    get(id) {
      return records.get(id) || null;
    },
    inspect() {
      return [...records.values()].map((record) => ({
        id: record.id,
        sectorId: record.sectorId,
        generation: record.generation,
        state: record.state,
        active: record.active,
        abortReason: record.abortReason || null,
        error: record.error ? String(record.error.message || record.error) : null,
      }));
    },
    /** Retired boundaries that gave up, with the cause the record carried when it was deleted. */
    inspectFailures() {
      return failures.map((entry) => ({ ...entry }));
    },
  };
}

function scheduleSectorBoundaryBuildTurn(callback) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

/** Transactionally attach one prepared hidden boundary to render/presentation ownership. Binding
 * hooks are allowed to mutate and then throw, so every attempted owner is rolled back independently
 * before the original failure escapes to the generation manager. */
export function publishPreparedSectorBoundary(record, options = {}) {
  const entity = record && record.entity;
  const boundary = record && record.boundary;
  const id = record?.id ?? entity?.id;
  if (!entity || !boundary || id == null || id === '') return false;
  boundary.visible = false;
  if (options.publishAuthoredBoundary?.(boundary) === false) return false;
  options.seatBoundary?.(record);

  entity.mesh = boundary;
  entity.view = { root: boundary };
  options.meshes?.set(id, boundary);
  try {
    record.presentationBindingAttempted = true;
    const presentationBound = options.bindPresentationMesh?.(entity, boundary);
    if (presentationBound === false) {
      throw new Error(`Prepared boundary ${id} could not bind presentation ownership`);
    }
    record.asteroidBindingAttempted = true;
    options.registerAsteroid?.(entity, boundary);
    options.markShadowReceiversDirty?.();
    boundary.visible = true;
    return true;
  } catch (error) {
    boundary.visible = false;
    const rollbackErrors = [];
    try {
      options.unbindPresentationMesh?.(id, boundary);
      record.presentationBindingAttempted = false;
    }
    catch (cleanupError) { rollbackErrors.push(cleanupError); }
    try {
      options.releaseAsteroid?.(id);
      record.asteroidBindingAttempted = false;
    }
    catch (cleanupError) { rollbackErrors.push(cleanupError); }
    try {
      if (options.meshes?.get(id) === boundary) options.meshes.delete(id);
    } catch (cleanupError) { rollbackErrors.push(cleanupError); }
    clearEntityMeshReference(entity, boundary);
    try { options.markShadowReceiversDirty?.(); }
    catch (cleanupError) { rollbackErrors.push(cleanupError); }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], `Prepared boundary ${id} rollback failed`, {
        cause: error,
      });
    }
    throw error;
  }
}

/** Exhaust the exact prepared-boundary ownership journal before falling back to ordinary Object3D
 * teardown. Authored roots clear their owner-local resources first, so the generic traversal sees
 * only the remaining procedural substrate and cannot replace a failed cleanup with a second owner. */
export async function disposePreparedSectorBoundary(record, options = {}) {
  const boundary = record?.boundary;
  const id = record?.id ?? record?.entity?.id;
  if (!boundary || id == null || id === '') return false;
  const cleanupErrors = [];
  const attempt = async (cleanup) => {
    try { await cleanup(); }
    catch (error) { cleanupErrors.push(error); }
  };
  boundary.visible = false;
  if (record.presentationBindingAttempted) {
    await attempt(() => options.unbindPresentationMesh?.(id, boundary));
  }
  if (record.asteroidBindingAttempted) {
    await attempt(() => options.releaseAsteroid?.(id));
  }
  await attempt(() => {
    if (options.meshes?.get(id) === boundary) options.meshes.delete(id);
  });
  await attempt(() => options.removeBoundary?.(boundary));
  await attempt(() => options.disposePreparedBoundary?.(boundary));
  await attempt(() => options.disposeBoundaryObject?.(boundary));
  await attempt(() => clearEntityMeshReference(record.entity, boundary));
  await attempt(() => options.markShadowReceiversDirty?.());
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, `Prepared boundary ${id} cleanup failed`);
  }
  record.presentationBindingAttempted = false;
  record.asteroidBindingAttempted = false;
  return true;
}

function noteShadowMeshAdded(owner, root) {
  if (owner && typeof owner._noteShadowMeshAdded === 'function') {
    owner._noteShadowMeshAdded(root);
    return;
  }
  if (owner) owner._shadowReceiversDirty = true;
}

function noteShadowMeshRemoved(owner, root) {
  if (owner && typeof owner._noteShadowMeshRemoved === 'function') {
    owner._noteShadowMeshRemoved(root);
    return;
  }
  if (owner) owner._shadowReceiversDirty = true;
}

function requestAuthoredUpgrade(mesh, renderer, scene, options = {}) {
  const request = mesh && mesh.userData && mesh.userData.requestAuthoredUpgrade;
  if (typeof request !== 'function') return Promise.resolve({ status: 'no-authored-upgrade' });
  try { return Promise.resolve(request(renderer, scene, options)); }
  catch (error) {
    console.warn('[render] authored asset upgrade request failed', error);
    return Promise.resolve({ status: 'authored-upgrade-request-threw', error });
  }
}

// Prepare the live directional-shadow camera before asteroid visibility consumes its frustum.
// The renderer's actual shadow-map state is authoritative: a setting can remain on while zero
// receivers intentionally disable the map for this frame.
export function prepareActiveShadowCamera(renderer, keyLight) {
  const shadowMap = renderer && renderer.shadowMap;
  const shadow = keyLight && keyLight.shadow;
  if (!shadowMap || !shadowMap.enabled || !shadow) return null;
  keyLight.updateMatrixWorld(true);
  if (keyLight.target) keyLight.target.updateMatrixWorld(true);
  shadow.updateMatrices(keyLight);
  return shadow.camera || null;
}
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();
const _pt = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const _drawSize = new THREE.Vector2();
const _openingRootWorldPosition = new THREE.Vector3();
const _openingRootWorldScale = new THREE.Vector3();
const _openingRootSphere = new THREE.Sphere();

export const POST_PROCESS_ROUTE = Object.freeze({
  GRAPH: 'renderGraph',
  BLOOM: 'bloom',
  NATIVE: 'straight',
});

export const render = {
  name: 'render',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._frameMembrane = createRenderFrameMembrane().reset(ctx.state);
    const state = ctx.state, bus = ctx.bus;

    const canvas = document.getElementById('gl-canvas');
    // preserveDrawingBuffer is needed only by the explicit /__shot ship capture route. Keeping it off
    // during normal dev and perf probes avoids a readback-friendly WebGL path that players never use.
    const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const devShot = !!(query && query.get('dev') === 'shipshot');
    const glFlags = resolveWebGlRendererFlags({
      video: state.settings && state.settings.video,
      preserveDrawingBuffer: devShot,
    });
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: glFlags.antialias,
      alpha: glFlags.alpha === true,
      powerPreference: glFlags.powerPreference,
      preserveDrawingBuffer: glFlags.preserveDrawingBuffer,
    });
    // Opaque order is depth-tested. Skipping the default painter sort saves a
    // full scene comparison on the iGPU thread; transparent objects still sort.
    if (typeof renderer.setOpaqueSort === 'function') {
      renderer.setOpaqueSort(() => 0);
    }
    this._opaqueBatchSupported = false;
    try {
      const gl = renderer.getContext && renderer.getContext();
      this._opaqueBatchSupported = supportsOpaqueMaterialBatch(gl);
    } catch (_) {
      this._opaqueBatchSupported = false;
    }
    // The current BatchedMesh bridge repacks every visible slot and rewrites its matrix/color
    // textures every frame. On the target Intel route, disabling it kept the identical authored
    // chunks visible while cutting bloomScene p95 from 114.5 ms to 11.0 ms and removing the tail
    // hitches, despite issuing more draws. Keep capability detection for the retained-slot rewrite,
    // but never auto-enable the regressing per-frame implementation in shipping flight.
    this._opaqueBatchEnabled = false;
    // ACES on the renderer covers the DIRECT-to-canvas draws; bloom.js's composite covers the bloom
    // path. Both are needed and they do not overlap, which is the fix for a real divergence:
    //
    // bloom.js moved ACES into its composite shader, and its own COLOR-MANAGEMENT INVARIANT (bloom.js
    // ~line 27) predicted exactly what would go wrong — "if you later set renderer.toneMapping,
    // three renders to render targets with NoToneMapping regardless, so rtScene would be un-tonemapped
    // while the bloom-off path tonemaps — they'd diverge. At that point tone-mapping must move INTO
    // this composite shader." The ACES move happened and the fast path was never revisited, so it
    // diverged the OTHER way: bloom-ON got ACES from the composite while the bloom-OFF fast path
    // (a plain renderer.render straight to screen) got none. Toggling bloom therefore changed the whole
    // image's highlight rolloff and contrast, not just the glow — and bloom-off is selected
    // AUTOMATICALLY on software GL, i.e. on the weakest hardware, where it is least likely to be
    // noticed as a bug and most likely to be blamed on the hardware. A later comment in the same file
    // claims the composite keeps the two paths "in sync"; it does not.
    //
    // This costs no extra pass. three applies renderer.toneMapping only when the draw target is the
    // canvas (render targets are compiled with NoToneMapping), so rtScene stays linear HDR for the
    // composite to tone-map itself, and raw ShaderMaterial shaders never get three's tonemapping chunk
    // injected — so the composite is untouched and is NOT double-mapped.
    // --- Tier-1 instrumentation seam (OFF by default) -----------------------------------------
    // Installed here, before anything renders, because the first thing worth counting is the boot
    // shader ramp and a seam armed later would miss it. Install-on-enable: with the opt-in absent
    // nothing is wrapped at all, so the hottest GL calls in the frame carry no wrapper and not even
    // a boolean read. Counting only — see src/core/perfCounters.js for why no timing lives here.
    if (perfCountersRequested()) {
      const perfCounters = ensurePerfRuntime(state).tier1;
      // Publish the exact GameState-owned sink before any authored asset runtime can be created.
      // THREE.WebGLRenderer.state is an unrelated internal WebGL cache and must never be treated as
      // SpaceFace state merely because it has the same property name.
      bindAuthoredAssetPerfCounters(renderer, perfCounters);
      perfCounters.setEnabled(true);
      const instrumentedGl = renderer.getContext();
      if (instrumentedGl) installGlInstrumentation(instrumentedGl, perfCounters);
      // Family H (DOM mutations / layout reads / longtasks): same install-on-enable contract —
      // with the opt-in absent no observer is constructed and no prototype is patched.
      installDomInstrumentation(perfCounters);
    }

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x060912, 1);
    const drawSize = applyRendererSize(renderer, state);

    const scene = new THREE.Scene();
    const dynamicBuffers = createDynamicBufferCoordinator(scene);
    this._dynamicBuffers = dynamicBuffers;
    state.render.dynamicBufferRanges = dynamicBuffers.getDiagnostics();
    const corePalette = SECTOR_PALETTE_CLASSES.core;
    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
    // Real shadow maps (graphics spec Workstream G). Keep one reusable key light regardless of the
    // boot setting; _ensureKeyLightShadows configures it once and _syncShadowMapEnabled gates work.
    // This lets a default shadows:false profile enable shadows live without allocating a new light.
    const shadowsOn = !(state.settings && state.settings.video && state.settings.video.shadows === false);

    // --- GPU capability detection (adaptiveQuality.js) -----------------------------------------
    // Detection MUST publish state.render.gpu before createSpaceBackground below. SpaceBackground
    // picks its quality tier inside its constructor by reading state.render.gpu; when detection ran
    // later in init it saw an empty object, guessed 'mid', and the renderer then re-tiered it — so
    // every machine whose true tier is not 'mid' built the entire procedural backdrop twice at boot
    // (nebula bakes up to 2048², 6-16k stars, the flare set, the comet, the hero impostors), threw
    // the first build away, and paid the biggest stall on the fastest hardware.
    // Safe this early: detectGpu only reads the renderer's GL context, which exists from the
    // WebGLRenderer construction above, and nothing between here and the dynamic-resolution setup
    // below reads state.render.gpu (the ?perf overlay closure reads it lazily, per frame).
    const gpu = detectGpu(renderer);
    state.render.gpu = gpu;

    const cam = createChaseCamera(state);
    const spaceBg = createSpaceBackground(scene, state, { renderer, camera: cam.obj, debug: SF_DEBUG });
    // Near/mid/far parallax dust. The module was complete but had ZERO consumers anywhere in src/,
    // so the scene had a far backdrop and the play plane with nothing between them — the "no back,
    // middle and front" note independent review returned on every single frame. It supplies the
    // missing middle and near bands plus the velocity-stretched speed motes, wraps by tile against
    // the camera focus, and already honours particleQuality:'low' and the motionReduce
    // accessibility setting internally.
    parallaxLayers.init(scene, state, bus, state.render.sectorPalette || SECTOR_PALETTE_CLASSES.core);
    state.render.spaceBg = spaceBg;
    // Generated backdrop producers publish their exact construction recipe in their constructors;
    // renderer only consumes those immutable boundaries.
    const vf = createVisualFactory();
    if (this._livingHullPresentation) this._livingHullPresentation.dispose();
    this._livingHullPresentation = createLivingHullPresentation();
    // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
    // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
    // back to the original procedural builder, so non-Kestrel entities are completely unaffected.
    installVisualOverrides(vf, {
      // Live play mounts a zero-draw admission substrate and publishes the authored GLB as the first
      // visible identity. Preview-only factories may still opt into hidden diagnostic geometry.
      directAuthoredMount: true,
      onAuthoredAssetSwap: ({ boundary, root, entity } = {}) => {
        const target = boundary || root;
        if (target) {
          invalidateShadowCasterPolicy(target);
          const lodLevel = target.userData && target.userData.lod
            ? target.userData.lod.level : null;
          syncShadowCasterPolicy(target, lodLevel, this._shadowPolicyOptions(entity, target));
        }
        if (target && entity && entity.id === state.playerId && this._livingHullPresentation) {
          this._livingHullPresentation.attach(target);
          this._livingHullPresentation.sync(
            entity.data && entity.data.livingHull,
            state.simTime,
            entity,
          );
        }
        this._shadowReceiversDirty = true;
      },
    });

    // Bake a PMREM environment map from the nebula backdrop (scene.background) so chrome/authority
    // hulls can mirror the actual space around them — real reflections of the nebula + stars rather
    // than a canned gradient. Done once after the starfield sets scene.background; the resulting
    // envMap is exposed on state.render for the visual factory to attach to high-metalness hulls.
    // Factored into a method (_bakeEnv) so WebGL context-loss recovery can re-bake it: a lost GL
    // context invalidates the envMap GPU texture, and without re-baking chrome hulls go matte after
    // a driver/GPU hiccup.
    this._envMap = null;
    try {
      // wait one frame so scene.background (an async-decoded CanvasTexture) is present, then bake
      const bakeEnv = () => this._bakeEnv();
      setTimeout(bakeEnv, 120); // let the starfield's async background decode first
    } catch (_) { /* PMREM unavailable */ }

    // WebGL context-loss recovery. The browser fires webglcontextlost when the GPU driver resets
    // (driver crash, sleep/wake, VRAM exhaustion). THREE's renderer recreates its own GL internals,
    // but context-derived PMREM output and timer queries are ours to rebuild. Entity roots, authored
    // geometries/materials, and post targets retain complete CPU descriptors; THREE re-uploads them
    // through its fresh property/cache set. Disposing or rebuilding those objects during the context
    // transition is both unnecessary and unsafe: stale handles can be deleted through the new GL
    // context, producing INVALID_OPERATION warnings and avoidable asset churn.
    this._contextLost = false;
    this._contextRecovery = {
      losses: 0,
      restores: 0,
      generation: 0,
      pending: false,
      lastError: null,
      detachedStaleDisposeListeners: 0,
      detachedContextResources: null,
    };
    state.render.contextRecovery = this._contextRecovery;
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();        // allow restoration
        if (this._contextLost) return;
        this._contextRestoreReceipt?.cancel?.();
        this._contextRestoreReceipt = null;
        this._contextLost = true;
        this._authoredPreparationEpoch++;
        this._sectorBoundaryPreparations?.abortAll('webgl-context-lost');
        dynamicBuffers.handleContextLost();
        const preparedPoolResources = prepareAuthoredInstancePoolsForContextLoss(scene, renderer);
        const contextRoots = collectContextLossRoots({
          scene,
          environment: this._envMap,
          spaceBackground: this.spaceBg,
          bloom: this.bloom,
          renderGraph: this._renderGraph,
          entities: state.entityList,
        });
        contextRoots.push(...preparedPoolResources.roots);
        const detachReceipt = detachStaleWebGlDisposeListeners(
          contextRoots,
          preparedPoolResources.provenance,
        );
        this._contextRecovery.detachedStaleDisposeListeners = detachReceipt.listenersDetached;
        this._contextRecovery.detachedContextResources = detachReceipt;
        if (this._assetResidency) this._assetResidency.handleContextLost();
        // The restored WebGL context has a fresh driver program cache. Drop only our JS-side
        // admission receipts here; the detached warmup graph belongs to the lost context and must
        // not dispatch stale dispose listeners after restoration.
        invalidatePrecompileState(renderer, { dispose: false });
        this._publishAssetResidencyDiagnostics();
        this._contextRecovery.losses++;
        this._contextRecovery.pending = true;
        this._contextRecovery.lastError = null;
        // Abandon GPU timer query refs without end/delete — the GL context is dead.
        if (this._gpuTimers && typeof this._gpuTimers.abandon === 'function') {
          try { this._gpuTimers.abandon(); } catch (_) { /* ignore */ }
        }
        this._gpuTimers = null;
        if (state.render) state.render.gpuTimers = null;
        // PMREM output is render-target content and must be regenerated. Retain the old Texture only
        // as an identity token so _bakeEnv can redirect every material that referenced it; never call
        // dispose() on that old-context texture after restoration.
        this._lostEnvMap = this._envMap;
        if (scene.environment === this._lostEnvMap) scene.environment = null;
        this._envMap = null;
        state.render.envMap = null;
        setEnvMapForShips(null);
        if (typeof console !== 'undefined') console.warn('[render] WebGL context lost — awaiting restore');
        bus.emit('toast', { text: 'Graphics context lost — recovering…', kind: 'warn', ttl: 4 });
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        // Three.js owns an earlier listener that replaces its context-bound caches. Keep the
        // application paused until the complete restore-listener stack has returned, then rebuild
        // application-owned resources against the settled renderer context.
        this._contextRestoreReceipt = deferWebGlContextRestore(() => {
          if (typeof console !== 'undefined') console.warn('[render] WebGL context restored — rebuilding GPU resources');
          this._contextRecovery.retryCount = 0;
          this._contextRecovery.forceNewContext = () => {
            try {
              const gl = this.renderer && typeof this.renderer.getContext === 'function'
                ? this.renderer.getContext()
                : null;
              const ext = gl && typeof gl.getExtension === 'function'
                ? gl.getExtension('WEBGL_lose_context')
                : null;
              if (ext && typeof ext.loseContext === 'function') {
                ext.loseContext();
                const restore = () => {
                  try { if (typeof ext.restoreContext === 'function') ext.restoreContext(); } catch { /* next event */ }
                };
                if (typeof setTimeout === 'function') setTimeout(restore, 50);
                else restore();
                return;
              }
            } catch { /* fall through to a scheduled retry */ }
            if (typeof this._contextRecovery.scheduleRetry === 'function') this._contextRecovery.scheduleRetry();
          };
          this._contextRecovery.scheduleRetry = () => {
            const retry = () => {
              if (this.renderer && typeof this.renderer.getContext === 'function') {
                try {
                  const gl = this.renderer.getContext();
                  if (gl && typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
                } catch { /* retry against the current context anyway */ }
              }
              this._contextRestoreReceipt = deferWebGlContextRestore(() => {
                void runWebGlContextRestoreRebuild(this, this._contextRecovery, this._rebuildRestoredGpuResources)
                  .then((restored) => {
                    if (!restored.ok) return;
                    this._publishAssetResidencyDiagnostics();
                    bus.emit('toast', { text: 'Graphics recovered.', kind: 'good', ttl: 3 });
                  });
              });
            };
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(retry);
            else setTimeout(retry, 16);
          };
          this._rebuildRestoredGpuResources = async () => {
            dynamicBuffers.handleContextRestored();
            // Re-apply renderer config that the new context defaults lose.
            this.renderer.setClearColor(0x060912, 1);
            if (this._shadowSettingOn && this._keyLight) this.renderer.shadowMap.enabled = false; // re-gated by _syncShadowMapEnabled on next frame
            this._shadowMapDirty = true;
            this._shadowRefreshScheduled = false;
            this._activeShadowCamera = null;
            // Refill context-derived background/planet render targets in place. Their visible mesh and
            // texture identities stay stable; no old-context object is disposed through the new GL.
            if (this.spaceBg && typeof this.spaceBg.onContextRestore === 'function') this.spaceBg.onContextRestore();
            // Re-bake the PMREM env (the old render-target content is gone) and redirect explicit
            // chrome material envMap references without disposing any old-context handle.
            this._bakeEnv({
              previousEnvMap: this._lostEnvMap,
              disposePrevious: false,
            });
            this._lostEnvMap = null;
            // Fresh GPU timer set bound to the restored context (default OFF).
            try {
              const glRestored = this.renderer.getContext && this.renderer.getContext();
              this._gpuTimers = createGpuTimers(glRestored);
              state.render.gpuTimers = this._gpuTimers;
            } catch (timerErr) {
              if (typeof console !== 'undefined') console.warn('[render] gpu timers recreate failed:', timerErr);
              this._gpuTimers = null;
              state.render.gpuTimers = null;
            }
            // Re-apply post uniforms directly. Emitting a generic settings:changed event here used to
            // call onResize(), whose space-background rebuild disposed the complete old-context graph
            // after the NEW context was active. Canvas dimensions/settings did not change, so retain
            // the full-quality background graph and let THREE re-upload it like every other root.
            this._invalidatePostOptionsCache();
            this._syncPostOptions(true);
            if (this._assetResidency) this._assetResidency.handleContextRestored();
            const restoredPostRoute = this._selectPostRoute({ allowContextRecovery: true });
            const restoredPipelines = precompileGlobalPipelines(renderer, scene, cam.obj, {
              incremental: true,
              preparePipelines: async (subjects) => {
                const receipt = await compileForCurrentTarget(subjects, restoredPostRoute);
                if (receiptReportsContextLost(receipt)) {
                  const lost = Array.isArray(receipt)
                    ? receipt.find((item) => item && item.contextLost === true)
                    : receipt;
                  throw new Error((lost && lost.reason) || 'context lost during restored pipeline compile');
                }
                return receipt;
              },
              video: state.settings && state.settings.video,
              yieldToMain: yieldToBrowser,
            });
            state.render.pipelinePrecompileReady = restoredPipelines;
            return await restoredPipelines;
          };
          void runWebGlContextRestoreRebuild(this, this._contextRecovery, this._rebuildRestoredGpuResources)
            .then((restored) => {
              if (!restored.ok) {
                if (typeof console !== 'undefined') {
                  console.error('[render] context-restore rebuild failed', restored.error);
                }
                return;
              }
              this._publishAssetResidencyDiagnostics();
              bus.emit('toast', { text: 'Graphics recovered.', kind: 'good', ttl: 3 });
            });
        });
      }, false);
    }

    // Preload the menu/boot cinematic backdrop (C-INTRO-01, a clean label-free still). The captioned
    // contact-sheet .jpgs are authoring references only — replaced by procedural materials / inline SVG.
    { const i = new Image(); i.src = 'assets/cinematics/C-INTRO-01.jpg'; }

    this.renderer = renderer; this.scene = scene; this.cam = cam; this.spaceBg = spaceBg; this.vf = vf;
    this._assetResidency = getAssetResidency(renderer);
    if (this._assetResidency) {
      const initialSectorId = state.world && state.world.currentSectorId;
      if (initialSectorId) this._assetResidency.rotateSector(initialSectorId);
      this._publishAssetResidencyDiagnostics();
    }
    const beginAuthoredPartLibraryPreload = (retry = false) => {
      const request = retry
        ? retryAuthoredPartLibrary(renderer)
        : preloadAuthoredPartLibrary(renderer);
      this.authoredPartLibraryReady = request.catch((error) => {
        console.warn('[render] authored part library preload failed', error);
        return null;
      });
      state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
      return this.authoredPartLibraryReady;
    };
    beginAuthoredPartLibraryPreload();
    state.render.retryAuthoredPartLibrary = () => beginAuthoredPartLibraryPreload(true);
    // Common-rock maps are part of the opening GPU-residency contract even though asteroid meshes
    // stream after the first playable paint. Decoding them now prevents the first rock from ever
    // publishing the old flat/clay material and then changing identity a few frames later.
    this.rockSurfaceLibraryReady = preloadRockSurfaceLibrary(renderer);
    state.render.rockSurfaceLibraryReady = this.rockSurfaceLibraryReady;
    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
    this._sectorPaletteTarget = corePalette;
    this._sectorLightingTarget = null; // no authored rig applied yet; see _beginSectorPaletteTransition
    this._sectorPost = null;           // authored per-sector grade; see setSectorPostProfile
    this._sectorPostTarget = null;
    this._sectorPostApplied = false;
    this._sectorPostTransition = {
      active: false,
      elapsed: SECTOR_VISUAL_TRANSITION_SECONDS,
      targetProfile: null,
      startExposure: 1,
      targetExposure: 1,
      startBloomStrength: 0,
      targetBloomStrength: 0,
      startBloomThreshold: 1,
      targetBloomThreshold: 1,
      startNorm: null,
      targetNorm: null,
      options: {
        bloom: true,
        bloomStrength: 0,
        strength: 0,
        threshold: 1,
        bloomThreshold: 1,
        exposure: 1,
        acesToneMapping: true,
        grade: 0,
        vignette: 0,
        toe: 0,
        grain: 0,
      },
      graphOptions: {
        bloom: true,
        bloomStrength: 0,
        bloomThreshold: 1,
        exposure: 1,
        acesToneMapping: true,
        grade: 0,
        vignette: 0,
        toe: 0,
        grain: 0,
      },
    };
    state.render.sectorPalette = corePalette;
    this._keyLight = key; // retained while disabled so current→max→current can reconcile live
    this._shadowSettingOn = shadowsOn;
    this._shadowReceiversDirty = true;
    this._shadowReceiverCount = 0;
    this._shadowReceiverTally = createShadowReceiverTally();
    this._w2sCamCache = null; // see _syncProjectionCamera(): decomposed chase-camera transform
    this._ensureKeyLightShadows();
    this._contactShadowPool = createContactShadowPool(scene);
    this._shipAuxPool = createShipAuxPool(scene);
    this._asteroidInstancePool = createAsteroidInstancePool(scene);
    this._entityFrame = createRenderEntityFrame();
    this._presentationWorld = createPresentationWorld();
    this._presentationPublisher = createPresentationPublisher(
      this._presentationWorld,
      state,
      { journal: ctx.presentationJournal || null },
    );
    this._presentationQueries = createPresentationQueries(this._presentationWorld);
    this._snapshotFence = createSnapshotFence();
    this._snapshotSourceTick = null;
    this._persistentSubmitLanes = createPersistentSubmitLanes();
    this._activityFrame = null;
    this._activityFrameTick = null;
    this._openingFirstPicturePrepared = false;
    this._presentationHandleScratch = {};
    this._presentationQueryOptions = { bounds: null, origin: null, playerId: null };
    this._entityViewBounds = { x: 0, z: 0, halfX: 0, halfZ: 0, margin: 0 };
    this._entityViewDiagnostics = {
      totalMeshes: 0,
      candidates: 0,
      transformed: 0,
      fullSynced: 0,
      culled: 0,
      newlyVisible: 0,
      newlyHidden: 0,
      lodChecked: 0,
      cullHalfX: 0,
      cullHalfZ: 0,
    };
    this._hlodDiagnostics = {
      hlodDetailedVisible: 0,
      hlodProxyVisible: 0,
      hlodObjectsSwapped: 0,
      shadowPolicyRefreshes: 0,
    };
    state.render.presentationWorld = this._presentationWorld.getDiagnostics();
    state.render.presentationPublisher = this._presentationPublisher.getDiagnostics();
    state.render.presentationQueries = this._presentationQueries.getDiagnostics();
    state.render.activityFrame = null;
    state.render.entityViewSync = this._entityViewDiagnostics;
    state.render.hlod = this._hlodDiagnostics;
    this._authoredInstanceSyncOptions = { camera: null, entityFrame: null, authoredRecords: null };
    this._asteroidInstanceSyncOptions = {
      camera: null,
      shadowCamera: null,
      records: null,
      recordsDirty: true,
    };
    // LOD projector viewport (CSS px); onResize refreshes it. Initialize from drawSize so the first
    // frame before onResize has sane values.
    { const dpr = renderer.getPixelRatio() || 1; this.viewport = { width: drawSize.x / dpr, height: drawSize.y / dpr }; }
    // Capability-gated GPU timer queries (default OFF). Used only by measurement probes.
    try {
      const gl = renderer.getContext && renderer.getContext();
      this._gpuTimers = createGpuTimers(gl);
      state.render.gpuTimers = this._gpuTimers;
    } catch (err) {
      console.warn('[render] gpu timers unavailable:', err);
      this._gpuTimers = null;
      state.render.gpuTimers = null;
    }
    this._postNativeFallbackReason = null;
    this._postFrameOptions = { time: 0 };
    try {
      this.bloom = createBloom(renderer, drawSize.x, drawSize.y, {
        getPerf: () => state.perfRuntime,
        getGpuTimers: () => this._gpuTimers,
        getGpuOrigin: () => this._gpuFrameOrigin || null,
      });
    } catch (err) {
      console.warn('[render] bloom unavailable, falling back:', err);
      this.bloom = null;
      this._postNativeFallbackReason = 'post-processor-unavailable';
    }
    this._postOptionsSig = null;
    // Collision/socket/landing-contact debug visualization (spec §12.5). OFF by default; toggled via
    // the render system handle (state.render.debug.toggle) — wired to F7 in ui/input.js.
    try { this.collisionDebug = createCollisionDebug(this); }
    catch (err) { console.warn('[render] collision debug unavailable:', err); this.collisionDebug = null; }
    this._meshes = new Map(); // entityId -> Object3D
    // Measurement-only entity-layer isolation. The probe never reaches into the
    // renderer's private mesh map; this owner-held seam snapshots each mesh's
    // exact visibility and restores it atomically after the sample window.
    let entityIsolationRestore = null;
    const hideEntityRoots = (predicate, scope) => {
      if (entityIsolationRestore) throw new Error('entity isolation already active');
      const visibility = [];
      const meshes = new Set();
      for (const [id, mesh] of this._meshes) {
        const entity = state.entities && state.entities.get ? state.entities.get(id) : null;
        if (!mesh || !predicate(entity, id)) continue;
        visibility.push([id, mesh, mesh.visible]);
        meshes.add(mesh);
        mesh.visible = false;
      }
      entityIsolationRestore = { scope, predicate, visibility, meshes };
      return { active: true, hidden: visibility.length, scope };
    };
    state.render.perfEntityIsolation = {
      hideNonPlayer: () => hideEntityRoots((_entity, id) => id !== state.playerId, 'non_player_entities'),
      hideStationsPlaces: () => hideEntityRoots((entity) => !!(entity && (
        entity.type === 'station'
        || (entity.type === 'fx' && entity.data
          && (typeof entity.data.placeId === 'string' || typeof entity.data.landmarkGlb === 'string'))
      )), 'stations_places'),
      hideNonPlayerShips: () => hideEntityRoots((entity, id) => !!(entity && id !== state.playerId
        && (entity.type === 'ship' || entity.type === 'drone')), 'non_player_ships'),
      reassert: () => {
        const record = entityIsolationRestore;
        if (!record) return { active: false, hidden: 0, scope: null };
        for (const [id, mesh] of this._meshes) {
          const entity = state.entities && state.entities.get ? state.entities.get(id) : null;
          if (!mesh || !record.predicate(entity, id)) continue;
          if (!record.meshes.has(mesh)) {
            record.visibility.push([id, mesh, mesh.visible]);
            record.meshes.add(mesh);
          }
          mesh.visible = false;
        }
        return { active: true, hidden: record.visibility.length, scope: record.scope };
      },
      restore: () => {
        const record = entityIsolationRestore;
        if (!record) return { restored: true, active: false, restoredCount: 0 };
        const visibility = record.visibility || [];
        for (const [, mesh, wasVisible] of visibility) {
          if (mesh) mesh.visible = wasVisible;
        }
        entityIsolationRestore = null;
        return { restored: true, active: false, restoredCount: visibility.length, scope: record.scope };
      },
      inspect: () => ({
        active: !!entityIsolationRestore,
        hidden: entityIsolationRestore ? entityIsolationRestore.visibility.length : 0,
        scope: entityIsolationRestore ? entityIsolationRestore.scope : null,
      }),
    };
    // Diagnostic-only shader/fill classifier. Scene override identity is restored exactly;
    // no authored/shared material is mutated or replaced on an entity.
    const perfBasicMaterial = new THREE.MeshBasicMaterial({ color: 0x808080, fog: true });
    const perfDepthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, colorWrite: false, depthTest: true, depthWrite: true });
    let materialIsolationRestore = null;
    state.render.perfMaterialIsolation = {
      apply: (mode) => {
        if (materialIsolationRestore) throw new Error('material isolation already active');
        if (mode !== 'basic' && mode !== 'depth') throw new Error(`unknown material isolation mode: ${mode}`);
        materialIsolationRestore = { overrideMaterial: scene.overrideMaterial, mode };
        scene.overrideMaterial = mode === 'basic' ? perfBasicMaterial : perfDepthMaterial;
        return { active: true, mode };
      },
      restore: () => {
        const record = materialIsolationRestore;
        if (!record) return { restored: true, active: false, mode: null };
        scene.overrideMaterial = record.overrideMaterial;
        materialIsolationRestore = null;
        return { restored: true, active: false, mode: record.mode };
      },
      inspect: () => ({ active: !!materialIsolationRestore, mode: materialIsolationRestore ? materialIsolationRestore.mode : null }),
    };
    this._meshBuildQueue = [];
    this._meshBuildQueueHead = 0;
    this._meshBuildQueuedIds = new Set();
    this._meshResidencyShipCandidates = [];
    this._meshResidencyOtherCandidates = [];
    this._meshResidencySweep = {
      meshVisits: 0,
      entityVisits: 0,
      queuedShips: 0,
      queuedOther: 0,
      evicted: 0,
      built: 0,
    };
    this._deferNoncriticalMeshStreaming = false;
    state.render.deferNoncriticalMeshStreaming = false;
    this._postOpeningPipelineAdmissionReleased = false;
    this._pendingPostOpeningSector = null;
    this._incomingSectorPrewarm = null;
    this._currentSectorPrewarm = null;
    this._authoredSectorPrewarmPendingId = null;
    this._authoredSectorPrewarmPending = null;
    this._sectorPrewarmGeneration = 0;
    this._authoredPreparationEpoch = 0;
    this._sectorBoundaryPreparations = createSectorBoundaryGenerationManager({
      startBudgetPerTurn: RUNTIME_MESH_BUILD_BUDGET,
      scheduleNextStartTurn: scheduleSectorBoundaryBuildTurn,
      captureBeforeStart: (record) => {
        record.presentationAdmissionBefore = record.entity?.presentationAdmission;
      },
      buildBoundary: (record) => this.vf.build(record.entity),
      mountBoundary: (record) => {
        const boundary = record.boundary;
        const entity = record.entity;
        const local = this._frameMembrane.toLocal(entity.pos, _meshLocalXZ);
        boundary.position.set(local.x, 0, local.z);
        boundary.rotation.y = -entity.rot;
        if (entity.type === 'ship' || entity.type === 'station') {
          attachContactShadow(boundary, entity);
          const lodLevel = boundary.userData && boundary.userData.lod
            ? boundary.userData.lod.level : null;
          syncShadowCasterPolicy(boundary, lodLevel, this._shadowPolicyOptions(entity, boundary));
        }
        boundary.visible = false;
        scene.add(boundary);
      },
      requestPreparation: (record) => requestAuthoredUpgrade(record.boundary, renderer, scene, {
        deferPackagePoolActivation: true,
        deferBoundaryPublication: true,
        overlapAuthoredPipelineCompile: false,
        residencyRole: 'sector-prepared-boundary',
        sectorId: record.sectorId,
        isResidencyOwnerActive: () => record.active === true
          && record.boundary && record.boundary.parent === scene
          && record.entity && record.entity.alive !== false,
      }),
      isPrepared: (record) => {
        const authoredState = record.boundary?.userData?.authoredAssetState;
        return authoredState === 'authored-prepared'
          || authoredState === 'same-semantic-fallback-prepared';
      },
      validate: (record) => record.prewarm?.active === true
        && record.generation === record.prewarm.generation
        && record.entity?.alive !== false
        && state.entities.get(record.id) === record.entity
        && String(entitySectorId(record.entity) || '') === record.sectorId
        && String(state.world?.currentSectorId || '') === record.sectorId
        && record.fingerprint === authoredCompositionFingerprintForEntity(record.entity)
        && record.preparationEpoch === this._authoredPreparationEpoch
        && record.contextGeneration === this._contextRecovery.generation
        && record.preparationSignature === authoredBoundaryPreparationSignature(
          renderer, state, this._contextRecovery.generation,
        )
        && this._contextLost !== true
        && record.boundary?.parent === scene
        && !this._meshes.has(record.id)
        && !record.entity.mesh,
      publishBoundary: (record) => {
        return publishPreparedSectorBoundary(record, {
          publishAuthoredBoundary: publishPreparedAuthoredBoundary,
          seatBoundary: ({ entity, boundary }) => {
            const local = this._frameMembrane.toLocal(entity.pos, _meshLocalXZ);
            boundary.position.set(local.x, 0, local.z);
            boundary.rotation.y = -entity.rot;
          },
          meshes: this._meshes,
          bindPresentationMesh: (entity, boundary) => this._bindPresentationMesh(entity, boundary),
          unbindPresentationMesh: (id, boundary) => this._unbindPresentationMesh(id, boundary),
          registerAsteroid: (entity, boundary) => (
            registerAsteroidBaseLeaf(this._asteroidInstancePool, entity, boundary)
          ),
          releaseAsteroid: (id) => releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id),
          markShadowReceiversDirty: () => { this._markShadowReceiversDirty(); },
        });
      },
      disposeBoundary: (record) => disposePreparedSectorBoundary(record, {
        unbindPresentationMesh: (id, boundary) => this._unbindPresentationMesh(id, boundary),
        releaseAsteroid: (id) => releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id),
        meshes: this._meshes,
        removeBoundary: (boundary) => { if (boundary.parent === scene) scene.remove(boundary); },
        disposePreparedBoundary: disposePreparedAuthoredBoundary,
        disposeBoundaryObject: disposeObject,
        markShadowReceiversDirty: () => { this._markShadowReceiversDirty(); },
      }),
      restoreEntity: (record) => {
        const entity = record.entity;
        if (!record.beforeStartCaptured
            || !entity
            || state.entities.get(record.id) !== entity
            || this._meshes.has(record.id)) return;
        if (record.presentationAdmissionBefore === undefined) delete entity.presentationAdmission;
        else entity.presentationAdmission = record.presentationAdmissionBefore;
        this._meshReconcileDirty = true;
      },
    });
    state.render.sectorBoundaryPrewarm = {
      inspect: () => this._sectorBoundaryPreparations.inspect(),
      failures: () => this._sectorBoundaryPreparations.inspectFailures(),
    };
    this._firstPlayablePaintScheduled = false;
    this._hazardVisuals = []; // hazard zone visual meshes for the current sector
    this._meshReconcileDirty = true;
    this._initialMeshReconcileComplete = false;
    this._renderResidencyPollS = 0;
    this._sectorHandoffStreamHoldS = 0;
    this._sectorHandoffSectorId = null;
    // Renderer diagnostics: window.__THREE_GAME_DIAGNOSTICS__ (draw calls/tris/memory + frame timing).
    try {
      this.diag = installDiagnostics(renderer, {
        entities: () => state.entityList.length,
        particles: () => {
          const sys = ctx.registry && ctx.registry.get('vfx');
          return sys ? sys._liveCount : 0;
        },
        sprites: () => {
          const sys = ctx.registry && ctx.registry.get('vfx');
          return sys ? (sys._liveSpriteCount || 0) : 0;
        },
        lights: () => {
          const sys = ctx.registry && ctx.registry.get('vfx');
          const pool = sys && sys._lights;
          if (!pool) return 0;
          let n = 0;
          for (const slot of pool) if (slot && slot.obj && slot.obj.visible) n++;
          return n;
        },
        perf: () => state.perfRuntime && state.perfRuntime.getReport ? state.perfRuntime.getReport() : {},
        settings: () => ({ video: { ...((state.settings && state.settings.video) || {}) } }),
        scenePools: () => getAuthoredInstancePoolDiagnostics(scene),
        post: () => this._getPostDiagnostics(),
        vfx: () => {
          const sys = ctx.registry && ctx.registry.get('vfx');
          return sys && typeof sys.inspect === 'function' ? sys.inspect() : {};
        },
        // Extra overlay lines: GPU tier + live dynamic-resolution scale + effective draw-buffer size,
        // so the on-screen probe (?perf) shows WHY the frame rate is what it is (software vs hardware,
        // how far dynamic resolution has had to back off).
        extraLines: () => {
          const g = state.render.gpu;
          const dyn = Number(state.render.dynResScale);
          const pr = this.renderer ? (this.renderer.getPixelRatio() || 1) : 1;
          const bw = this.renderer ? (this.renderer.domElement.width | 0) : 0;
          const bh = this.renderer ? (this.renderer.domElement.height | 0) : 0;
          const tier = g ? g.tier : '?';
          const scaleTxt = Number.isFinite(dyn) ? dyn.toFixed(2) : '1.00';
          return 'gpu ' + tier + (g && g.software ? ' (SOFTWARE!)' : '') +
            '  dynScale ' + scaleTxt + '  buf ' + bw + 'x' + bh + ' @' + pr.toFixed(2);
        },
      });
      state.render.diagnostics = this.diag;
      state.render.resetPostTelemetrySample = resetPostRenderTargetSampleCounter;
    }
    catch (err) { console.warn('[render] diagnostics unavailable:', err); this.diag = null; }

    // --- Dynamic resolution (adaptiveQuality.js) -----------------------------------------------
    // Profiling proved SpaceFace is GPU present-bound: the JS/sim side fits the frame budget, but a
    // weak/integrated GPU can't shade the full-res HDR scene + bloom composite in time, and a browser
    // that has fallen back to SOFTWARE rendering (hardware acceleration off/blocklisted) drops to a
    // few fps regardless of content. The tier detected above (before the background was built) both
    // warns the player and picks the floor for the dynamic-resolution controller below
    // (renderFrame -> prepareFrame each frame), which trades internal resolution for a smooth
    // framerate. It never mutates settings.video, so it fully recovers.
    state.render.dynResScale = 1;
    // Detection now runs before createSpaceBackground, so the background was already built at its
    // true tier and this call is a no-op safety net (applyGpuTier returns immediately when the tier
    // is unchanged). Kept because it is also the live re-tier entry point: SF.bg.forceTier and any
    // future settings-driven quality change route through the same rebuild.
    if (spaceBg && typeof spaceBg.applyGpuTier === 'function') spaceBg.applyGpuTier(gpu);
    try {
      const pr = renderer.getPixelRatio() || 1;
      console.log('[render] GPU: %s | tier: %s | pixelRatio: %s | buffer: %dx%d',
        gpu.renderer, gpu.tier, pr.toFixed(2), drawSize.x | 0, drawSize.y | 0);
    } catch (_) { /* logging is best-effort */ }

    // Per-tier floor for how far dynamic resolution may back off. Software rendering will never be
    // fast, so let it drop much lower (and drop bloom); the real fix is a hardware context, surfaced
    // to the player below.
    const dynFloor = gpu.tier === 'software' ? 0.34 : gpu.tier === 'integrated' ? 0.5 : 0.6;
    this._adaptive = createAdaptiveResolution({
      floor: dynFloor,
      apply: (s) => { this.state.render.dynResScale = s; this._applySize(); },
    });
    // Dynamic resolution is reserved for the SOFTWARE-rendering emergency. Every scale change
    // reallocates the whole render-target chain (canvas + HDR + bloom pyramid), which measured as
    // 0.5-1.3s render stalls on this class of hardware (.devshots/perf/hitch-budget-after-lightfix*
    // vs *-nodynres) — on hardware tiers the controller caused more visible hitching than it
    // prevented, while steady-state already holds the frame budget at full quality.
    this._dynResAllowed = gpu.tier === 'software';
    this._adaptive.setEnabled(this._dynResAllowed && !(state.settings && state.settings.video && state.settings.video.dynamicResolution === false));

    if (gpu.software) {
      // Hardware acceleration is OFF: the browser is rendering WebGL on the CPU (SwiftShader). No
      // in-game setting makes this fast — auto-drop to the cheapest path and tell the player exactly
      // how to fix it. Runtime-only (NOT persisted into settings.video) so it recovers on a hardware
      // context after relaunch.
      state.render.softwareRenderer = true;
      try { if (this.bloom) this.bloom.setOptions({ bloom: false }); } catch (_) {}
      // Do not submit the very first flight frame at full hardware resolution and only react after
      // it freezes. The software-only emergency profile begins at its established adaptive floor;
      // hardware contexts remain full-resolution and never enter this branch.
      state.render.dynResScale = dynFloor;
      this._applySize();
      setTimeout(() => {
        try {
          bus.emit('toast', {
            text: 'Graphics hardware acceleration appears OFF — the game is rendering in slow software mode. Turn on hardware acceleration in your browser (or run the Desktop launcher) for smooth play.',
            kind: 'warn', ttl: 14,
          });
        } catch (_) { /* toast is best-effort; the console log above still records it */ }
      }, 1200);
    }

    // ?perf — auto-enable the on-screen FPS/GPU/scale overlay for quick self-diagnosis.
    try { if (query && query.get('perf') != null && this.diag) this.diag.setOverlay(true); } catch (_) {}

    state.render.scene = scene;
    state.render.renderer = renderer;
    state.render.camera = cam.obj;
    state.render.meshes = this._meshes;
    state.render.cameraCtrl = cam;   // controller (addTrauma/pushZoom) — exposed for feel.js / ui
    state.render.vf = vf;   // exposed for the dev-only ship turntable preview (shipPreview.js)
    state.render.warmPostProcess = () => {
      const dynamicBufferEpoch = dynamicBuffers.arm();
      let disposeRegistrationProbe = null;
      try {
        disposeRegistrationProbe = beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer);
        return this._warmPostProcess(scene, cam.obj);
      } finally {
        endAuthoredInstanceMeshDisposeRegistrationProbe(disposeRegistrationProbe);
        dynamicBuffers.disarm(dynamicBufferEpoch);
      }
    };
    const compileSubjectColorAndDepth = (subject, route) => {
      // Color only. Per-root shadowMap.render during sliced flight compiles threw
      // (WebGLProgram.setProgram on a null material state) and split ~460 ms depth
      // links across presents, which raised hitch count. Opening and post-opening
      // each run one batched compileShadowDepthPipelines behind the loading shell.
      return Promise.resolve(this._compilePostRoute(route, subject, cam.obj, scene));
    };
    const compileForCurrentTarget = (subjects, requestedRoute = null) => {
      const batch = Array.isArray(subjects) ? subjects.filter(Boolean) : [subjects].filter(Boolean);
      if (batch.length === 0) return Promise.resolve({ skipped: true, reason: 'empty pipeline batch' });
      const route = requestedRoute || this._selectPostRoute();
      const restoreShadows = armAdmissionShadows({
        renderer,
        light: this._keyLight,
        enabled: this._shadowSettingOn === true,
      });
      const finish = (promise) => Promise.resolve(promise).finally(restoreShadows);
      if (shouldSliceCompileAcrossPresents({
        mode: state.mode,
        firstPlayable: Number.isFinite(state.render && state.render.firstPlayableFrameAt),
      })) {
        const sliced = batch.flatMap((root) => collectCompileSubjects(root));
        return finish(compileSubjectsAcrossPresents(
          sliced,
          (subject) => compileSubjectColorAndDepth(subject, route),
          yieldToNextPresent,
        ));
      }
      if (batch.length === 1) {
        return finish(compileSubjectColorAndDepth(batch[0], route));
      }
      // Compile together so Three can dedupe programs, but put every live root back on its
      // original parent. Group.add() steals children; a later clear() used to leave ships
      // parentless, so the 3D world went empty while the HUD kept running.
      const staging = new THREE.Group();
      staging.name = 'SF_AuthoredPipelineAdmissionBatch';
      const homes = batch.map((root) => captureObjectHome(root));
      for (const root of batch) staging.add(root);
      return finish(compileSubjectColorAndDepth(staging, route).finally(() => {
        for (const home of homes) restoreObjectHome(home);
        staging.clear();
      }));
    };
    const recordAuthoredAdmissionBlockingSlice = (slice) => {
      const durationMs = Number(slice && slice.durationMs);
      if (!(durationMs > 0) || !Number.isFinite(durationMs)) return;
      const perf = state.perfRuntime;
      if (perf && typeof perf.recordAdmissionWork === 'function') {
        perf.recordAdmissionWork(durationMs);
      }
      if (perf && perf.renderWorkEnabled === true
        && typeof perf.recordRenderWork === 'function') {
        perf.recordRenderWork(slice.kind, durationMs);
      }
    };
    const pipelineAdmissions = createPipelineAdmissionTracker(compileForCurrentTarget, {
      deferAutoFlush: () => (
        this._postOpeningPipelineAdmissionReleased !== true
        && (
          state.mode === 'loading'
          || !Number.isFinite(state.render && state.render.firstPlayableFrameAt)
        )
      ),
      onBlockingSlice: recordAuthoredAdmissionBlockingSlice,
      getLastPresentDtMs: () => state.render && state.render.lastPresentDtMs,
    });
    const gpuResidencyAdmissions = createGpuResidencyAdmissionTracker((subject, admissionOptions = {}) => (
      prepareStartupGpuResidency(renderer, subject, {
        yieldToMain: async () => {
          if (state.mode === 'flight' && Number.isFinite(state.render && state.render.firstPlayableFrameAt)) {
            await yieldToNextPresent();
          } else {
            await yieldToBrowser();
          }
          if (typeof admissionOptions.isActive === 'function' && admissionOptions.isActive() !== true) {
            throw new Error('Authored GPU residency owner became inactive before texture upload');
          }
        },
        onBlockingSlice: recordAuthoredAdmissionBlockingSlice,
      })
    ));
    const openingCohort = createOpeningAdmissionCohort();
    const openingStillBlocking = () => (
      state.mode === 'loading' || !Number.isFinite(state.render && state.render.firstPlayableFrameAt)
    );
    const markSubjectPipelinesPending = (subject, pending) => {
      if (!subject) return;
      const data = subject.userData || (subject.userData = {});
      data.pipelinesPending = pending === true;
    };
    const admitSubjectPipelines = (subject) => {
      markSubjectPipelinesPending(subject, true);
      return pipelineAdmissions.compile(subject).finally(() => {
        markSubjectPipelinesPending(subject, false);
      });
    };
    state.render.compileObjectPipelines = (subject) => {
      // Loading first-picture wait must not join this queue: captureOpeningPipelinePlan still
      // ignores it, and the exact leaf plan compiles opening programs. Queue every other root
      // without awaiting so preparePostOpeningPipelines can link them behind the loading shell.
      // Returning success-without-compile used to leave bloomScene to link these on first draw
      // (~460 ms each on Intel/ANGLE without KHR_parallel_shader_compile), including the depth
      // variant Three's public compile() never prepares.
      if (this._postOpeningPipelineAdmissionReleased !== true) {
        if (state.mode === 'loading') {
          if (subject) void admitSubjectPipelines(subject);
          return Promise.resolve({
            skipped: true,
            reason: 'opening-submission-plan-owns-first-picture',
          });
        }
        if (openingCohort.frozen && openingStillBlocking() && !shouldAdmitOpeningSubject(openingCohort, subject)) {
          if (subject) void admitSubjectPipelines(subject);
          return Promise.resolve({ skipped: true, reason: 'late-opening-root' });
        }
      }
      if (!openingCohort.frozen) openingCohort.extendBlocked(openingSubjectIdentity(subject));
      return admitSubjectPipelines(subject);
    };
    state.render.prepareAuthoredGpuResidency = (subject, options = {}) => {
      // Exact opening residency is prepared from the same flat leaves as exact pipeline admission.
      // Do not let every authored root enqueue a second texture walk while the loading shell is up.
      if (state.mode === 'loading') {
        return Promise.resolve({
          skipped: true,
          reason: 'opening-submission-plan-owns-first-picture',
        });
      }
      if (openingCohort.frozen && openingStillBlocking() && !shouldAdmitOpeningSubject(openingCohort, subject)) {
        return Promise.resolve({ skipped: true, reason: 'late-opening-root' });
      }
      if (!openingCohort.frozen) openingCohort.extendBlocked(openingSubjectIdentity(subject));
      return gpuResidencyAdmissions.prepare(subject, {
        isActive: options.isActive,
      });
    };
    state.render.pendingAuthoredGpuResidency = () => gpuResidencyAdmissions.pendingCount;
    state.render.yieldToNextPresent = yieldToNextPresent;
    state.render.openingAdmission = openingCohort;
    const buildOpeningSubmissionPlan = () => {
      // prepareFrame() selects the final entity poses without rendering while the loading shell is
      // visible. Refresh world matrices once so frustum/layer admission observes those exact poses,
      // not the transform cache from the previous scene attachment.
      scene.updateMatrixWorld(true);
      const submissionCamera = openingSubmissionCamera(cam.obj);
      const candidates = [];
      const seenRoots = new Set();
      const addCandidate = (root, metadata = {}) => {
        if (!root || seenRoots.has(root)) return false;
        seenRoots.add(root);
        candidates.push({ root, ...metadata });
        return true;
      };

      const playerMesh = this._meshes.get(state.playerId);
      addCandidate(playerMesh, {
        role: 'player',
        startupRole: 'player-flight-package',
        blocking: true,
        reason: 'player-control-and-first-picture-identity',
        includeOffscreen: true,
      });
      addCandidate(this.spaceBg && this.spaceBg.group, {
        role: 'firstFrameBackground',
        startupRole: 'background-composite',
        blocking: true,
        reason: 'first-picture-background-layer',
        includeOffscreen: true,
      });

      // Parallax layers are production scene roots, not speculative VFX. Near speed motes normally
      // remain dormant, but Continue can restore nonzero motion; admit them when their real draw
      // range is already active instead of relying on the New Game zero-speed assumption.
      for (const child of scene.children || []) {
        if (!child || !(
          child.name === 'Parallax_FarDust'
          || child.name === 'Parallax_MidDebris'
          || child.name === 'Parallax_NearSpeedMotes'
        )) continue;
        if (collectOpeningSubmissionLeaves(child, { camera: submissionCamera }).length === 0) continue;
        addCandidate(child, {
          role: 'firstFrameBackground',
          startupRole: child.name,
          blocking: true,
          reason: `first-picture-${child.name}`,
          includeOffscreen: true,
        });
      }

      // Every currently visible entity root is a real first-picture contributor, regardless of
      // whether its producer is an authored GLB or an assembled flight actor. The helper observes
      // final mesh visibility/pose and camera/layer eligibility, so hidden, offscreen, deferred,
      // and unmounted roots remain deferred without cutting any authored visuals.
      for (const candidate of collectOpeningEntityRootCandidates(this._meshes, state.entities, {
        playerId: state.playerId,
        scene,
        camera: submissionCamera,
      })) addCandidate(candidate.root, candidate);

      // These renderer-owned pools are real first-picture draw roots once the final entity frame
      // populates them. They are not entity children and therefore cannot be discovered by the
      // entity-root census above.
      const derivedPoolRoots = [
        this._contactShadowPool && this._contactShadowPool.mesh,
        this._shipAuxPool && this._shipAuxPool.shield && this._shipAuxPool.shield.mesh,
        this._shipAuxPool && this._shipAuxPool.nav && this._shipAuxPool.nav.mesh,
        ...collectAuthoredInstancePoolRoots(scene),
        ...collectAsteroidInstancePoolRoots(this._asteroidInstancePool),
      ];
      for (const root of derivedPoolRoots) {
        if (collectOpeningSubmissionLeaves(root, { camera: submissionCamera }).length === 0) continue;
        addCandidate(root, {
          role: 'firstFrameDerivedPool',
          startupRole: root.userData && root.userData.shipAuxPool || 'contact-shadow-pool',
          blocking: true,
          reason: 'renderer-owned-first-picture-pool',
        });
      }

      const vfxRoots = typeof state.render.collectVfxGpuResidencyRoots === 'function'
        ? state.render.collectVfxGpuResidencyRoots()
        : [];
      for (const root of vfxRoots) {
        // Pool roots with count=0 or visible=false are intentionally absent. A material that has
        // not been instantiated in the first picture cannot hold startup GPU admission.
        const leaves = collectOpeningSubmissionLeaves(root, { camera: submissionCamera });
        if (leaves.length === 0) continue;
        addCandidate(root, {
          role: 'vfx',
          startupRole: 'first-picture-vfx',
          blocking: true,
          reason: 'currently-instantiated-first-picture-vfx',
        });
      }

      const textures = [];
      if (scene.background && scene.background.isTexture === true) textures.push(scene.background);
      if (scene.environment && scene.environment.isTexture === true) textures.push(scene.environment);
      const openingRoute = this._selectPostRoute();
      const producerCensuses = candidates.map((candidate) => createOpeningProducerCensus(
        candidate.root,
        {
          camera: submissionCamera,
          includeOffscreen: candidate.includeOffscreen === true,
          route: {
            shadow: this._shadowSettingOn === true,
            target: openingRoute === POST_PROCESS_ROUTE.NATIVE ? 'screen' : 'hdr-scene-target',
          },
          textures,
        },
      ));
      const producerCensus = combineOpeningProducerCensuses(producerCensuses);
      // These fields are intentionally producer receipts, not renderer counts. They remain useful
      // to the loading witness and make the exact admission inputs inspectable at the frame latch.
      state.render.firstPlayableContentHashes = producerCensus.requiredContentHashes;
      state.render.firstPlayableContentHashesVerified = producerCensus.contentHashesVerified === true;
      state.render.firstPlayableGlobalProgramKeys = producerCensus.globalProgramKeys;
      state.render.firstPlayableOpeningProgramKeys = producerCensus.openingProgramKeys;
      state.render.firstPlayableResourceIdentitySets = producerCensus.resourceIdentitySets;
      const readiness = authoredCriticalVisualReadiness(state);
      return createOpeningSubmissionPlan({
        candidates,
        camera: submissionCamera,
        scene,
        textures,
        flightReady: readiness && readiness.flightReady,
        route: openingRoute,
        bloomActive: openingRoute !== POST_PROCESS_ROUTE.NATIVE,
        shadows: this._shadowSettingOn === true,
        // These are supplied only by a content-hash-bound producer.  An absent census is a hard
        // startup failure; deriving one from whatever happened to be in renderer.info would turn
        // the exact admission contract back into metadata-only bookkeeping.
        globalProgramKeys: state.render.firstPlayableGlobalProgramKeys
          || state.render.globalProgramKeys
          || null,
        openingProgramKeys: state.render.firstPlayableOpeningProgramKeys
          || state.render.openingProgramKeys
          || null,
        requiredContentHashes: state.render.firstPlayableContentHashes || undefined,
        contentHashVerified: state.render.firstPlayableContentHashesVerified === true,
        producerCensus,
        producerResourceIdentitySets: state.render.firstPlayableResourceIdentitySets || undefined,
      });
    };
    state.render.prepareOpeningFirstPicture = (timeoutMs) => (
      this.prepareOpeningFirstPicture(timeoutMs)
    );
    const warmOpeningShadowPipelines = (subjects) => compileShadowDepthPipelines({
      renderer,
      light: this._keyLight,
      camera: cam.obj,
      subjects,
      forceEnable: this._shadowSettingOn === true,
      THREE,
      captureObjectHome,
      restoreObjectHome,
      stagingName: 'SF_OpeningShadowPipelineAdmission',
    });
    const compileOpeningSubmissionPlan = async (plan) => {
      if (!plan || plan.complete !== true
        || !plan.firstPlayablePipelineSet
        || plan.firstPlayablePipelineSet.complete !== true) {
        throw new Error('Opening submission plan is incomplete; refusing first-playable admission');
      }
      // The content-hash-bound set drives the global deletion: A-B is deferred, while the exact
      // opening key set (including the measured opening-only misses) is compiled once for this
      // first picture. No broad authored root is admitted a second time.
      const admittedKeys = new Set((plan.firstPlayablePipelineSet.openingProgramKeys || [])
        .map((entry) => String(entry && entry.key || '')).filter(Boolean));
      const subjects = [];
      const leavesById = new Map();
      (plan.compileSubjects || []).forEach((subject, index) => {
        const leaf = plan.drawLeaves && plan.drawLeaves[index];
        if (leaf) leavesById.set(leaf.id, subject);
      });
      const keysByLeaf = new Map();
      for (const subject of plan.programCompileSubjects || []) {
        const key = String(
          subject.programSubjectKey
          || subject.openingProgramSubjectKey
          || subject.programKey
          || subject.customProgramKey
          || '',
        );
        let keys = keysByLeaf.get(subject.leafId);
        if (!keys) {
          keys = [];
          keysByLeaf.set(subject.leafId, keys);
        }
        keys.push(key);
      }
      for (const descriptor of plan.drawLeaves || []) {
        const keys = keysByLeaf.get(descriptor.id) || [];
        if (keys.length === 0 || keys.some((key) => !key || !admittedKeys.has(key))) {
          throw new Error(`Opening pipeline set omitted exact draw leaf ${descriptor.id}`);
        }
        const subject = leavesById.get(descriptor.id);
        if (!subject) throw new Error(`Opening submission leaf ${descriptor.id} has no live subject`);
        subjects.push(subject);
      }
      const route = this._selectPostRoute();
      // Use the existing exact-target admission seam to compile the frozen flat leaf set in one
      // driver batch. It temporarily records/restores each leaf's production parent; no scene
      // render or hidden discovery pass is introduced, and the live lighting scene remains the
      // third compile argument so program keys match the first visible route.
      const result = subjects.length > 0
        ? await compileForCurrentTarget(subjects, route)
        : { skipped: true, reason: 'empty opening draw set' };
      const shadowResult = warmOpeningShadowPipelines(subjects);
      return {
        schema: plan.schema,
        drawLeaves: subjects.length,
        result,
        shadowResult,
      };
    };
    state.render.captureOpeningSubmissionPlan = () => {
      const plan = buildOpeningSubmissionPlan();
      state.render.openingSubmissionPlan = plan;
      const identities = (plan.compileSubjects || []).map((subject) => openingSubjectIdentity(subject))
        .filter(Boolean);
      openingCohort.capture(identities);
      state.render.openingAdmissionCohort = openingCohort.snapshot();
      return plan;
    };
    state.render.drainOpeningSubmissionPlan = (plan) => compileOpeningSubmissionPlan(plan);
    state.render.captureOpeningPipelinePlan = () => {
      if (state.mode === 'loading') {
        // Broad authored-root admissions are intentionally not part of the loading receipt.  The
        // exact submission capture below is the only startup compile boundary.
        const skipped = Object.freeze({
          skipped: true,
          reason: 'opening-submission-plan-owns-first-picture',
          pendingCount: 0,
        });
        state.render.openingAdmissionCohort = openingCohort.snapshot();
        return skipped;
      }
      const plan = pipelineAdmissions.capturePending();
      let subjects = [];
      try { subjects = pipelineAdmissions.subjectsForCaptured(plan) || []; } catch { subjects = []; }
      const identities = subjects.map((subject) => openingSubjectIdentity(subject)).filter(Boolean);
      if (state.playerId != null) identities.push(`entity:${state.playerId}`);
      openingCohort.capture(identities);
      state.render.openingAdmissionCohort = openingCohort.snapshot();
      return plan;
    };
    state.render.drainOpeningPipelinePlan = (plan) => (
      plan && plan.skipped === true
        ? Promise.resolve(plan)
        : pipelineAdmissions.waitForCaptured(plan)
    );
    state.render.captureOpeningGpuResidencyPlan = (pipelinePlan) => gpuResidencyAdmissions.captureSubjects(
      pipelinePlan && pipelinePlan.skipped === true
        ? []
        : pipelineAdmissions.subjectsForCaptured(pipelinePlan)
    );
    state.render.drainOpeningGpuResidencyPlan = (plan) => (
      plan && plan.skipped === true
        ? Promise.resolve(plan)
        : gpuResidencyAdmissions.waitForCaptured(plan)
    );
    state.render.resumeDeferredPipelineAdmissions = () => pipelineAdmissions.resumeAutoFlush();
    state.render.compileCurrentPipelines = () => pipelineAdmissions.compileExplicit(scene);
    state.render.pendingPipelineAdmissions = () => pipelineAdmissions.pendingCount;
    state.render.preparePostOpeningPipelines = async () => {
      // Exact first-picture leaves are already compiled. Predicted sector probes stay color-only
      // with a hard budget. Do not release admission-await until after this drain, or overlapping
      // authored compiles keep the pending set non-empty and the startup gate times out.
      // Allocate the shadow map before those color compiles so physical keys include numDirLightShadows.
      compileShadowDepthPipelines({
        renderer,
        light: this._keyLight,
        camera: cam.obj,
        subjects: [],
        forceEnable: this._shadowSettingOn === true,
        THREE,
        captureObjectHome,
        restoreObjectHome,
        stagingName: 'SF_PostOpeningShadowMapPrime',
      });
      const sector = this._pendingPostOpeningSector;
      this._pendingPostOpeningSector = null;
      let sectorResult = null;
      if (sector && !gpu.software) {
        const started = typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
        const route = this._selectPostRoute();
        try {
          sectorResult = await precompilePipelines(renderer, scene, cam.obj, {
            sector,
            incremental: true,
            yieldToMain: yieldToBrowser,
            preparePipelines: (subject) => {
              const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : Date.now();
              if (now - started >= 0) {
                return Promise.resolve({ skipped: true, reason: 'post-opening-sector-budget' });
              }
              return Promise.resolve(this._compilePostRoute(route, subject, cam.obj, scene));
            },
            video: state.settings && state.settings.video,
          });
        } catch (error) {
          console.warn('[render] post-opening sector pipeline precompile failed', error);
          sectorResult = null;
        }
      }
      const drainPlan = pipelineAdmissions.capturePending();
      const pendingCount = drainPlan.pendingCount;
      let queued = { skipped: true, pendingCount: 0 };
      if (pendingCount > 0) {
        try {
          // Snapshot only. waitForPending loops while anything new is queued, and mesh
          // streaming during loading keeps compiling until the 20s startup gate fails.
          await pipelineAdmissions.waitForCaptured(drainPlan);
          queued = { skipped: false, pendingCount };
        } catch (error) {
          console.warn('[render] post-opening pipeline drain failed', error);
          queued = {
            skipped: false,
            pendingCount,
            error: String(error && error.message || error),
          };
        }
      }
      const openingSubjects = (state.render.openingSubmissionPlan
        && state.render.openingSubmissionPlan.compileSubjects) || [];
      const lateEntities = collectLateAdmittedCompileRoots(this._meshes, openingSubjects);
      const poolRoots = collectInstancePoolCompileRoots(scene);
      const lateCandidates = [];
      const seenLate = new Set();
      for (const root of [...lateEntities, ...poolRoots]) {
        if (!root || seenLate.has(root)) continue;
        seenLate.add(root);
        lateCandidates.push(root);
      }
      let lateColor = queued;
      if (pendingCount === 0 && lateEntities.length > 0) {
        try {
          lateColor = await compileForCurrentTarget(lateEntities);
        } catch (error) {
          console.warn('[render] post-opening late color pipeline compile failed', error);
          lateColor = {
            skipped: false,
            error: String(error && error.message || error),
          };
        }
      }
      const depth = lateCandidates.length > 0
        ? compileShadowDepthPipelines({
          renderer,
          light: this._keyLight,
          camera: cam.obj,
          subjects: lateCandidates,
          forceEnable: this._shadowSettingOn === true,
          THREE,
          captureObjectHome,
          restoreObjectHome,
          stagingName: 'SF_PostOpeningShadowDepthAdmission',
        })
        : { skipped: true, subjects: 0 };
      this._postOpeningPipelineAdmissionReleased = true;
      return {
        skipped: pendingCount === 0 && lateCandidates.length === 0 && !sectorResult,
        queued,
        sector: sectorResult,
        lateRoots: lateCandidates.length,
        lateColor,
        depth,
      };
    };
    state.render.prepareOpeningGpuResources = async () => {
      // Flight admission waits behind the loading presenter, so every subsequently streamed common
      // rock receives its final PBR maps on its first and only visual publication.
      await this.rockSurfaceLibraryReady;
      const restoreLivingHullWarmup = this._livingHullPresentation
        ? this._livingHullPresentation.beginGpuWarmup()
        : null;
      try {
        const plan = state.render.openingSubmissionPlan || buildOpeningSubmissionPlan();
        if (!plan || plan.complete !== true
          || !plan.firstPlayablePipelineSet
          || plan.firstPlayablePipelineSet.complete !== true) {
          throw new Error('Opening submission plan is incomplete; refusing first-playable GPU admission');
        }
        const result = await prepareStartupGpuResidency(renderer, plan.residencySubjects, {
          yieldToMain: yieldToBrowser,
          onBlockingSlice: recordAuthoredAdmissionBlockingSlice,
          textures: plan.textureRefs,
        });
        result.openingSubmissionPlan = plan;
        result.openingCompositionRoots = plan.roots.length;
        result.vfxRoots = plan.roots.filter((root) => root.role === 'vfx').length;
        result.vfxTextures = plan.textures.length;
        if (this.bloom && typeof this.bloom.prepareResources === 'function') {
          result.post = await this.bloom.prepareResources(yieldToBrowser);
        }
        // The first visible frame is the only submission. Capture its resource baseline now that
        // exact leaves, textures, and post targets are admitted; drawPreparedFrame validates that
        // no program/geometry/texture appears outside this frozen plan.
        state.render.openingSubmissionReceipt = createOpeningSubmissionReceipt(renderer, plan, { scene });
        await yieldToBrowser();
        state.render.startupGpuResidency = result;
        return result;
      } finally {
        if (typeof restoreLivingHullWarmup === 'function') restoreLivingHullWarmup();
      }
    };
    // Collision/socket/landing debug toggle (spec §12.5), bound to F7 in ui/input.js. Capture the
    // render-system `this` once so the handle closures resolve the live collisionDebug regardless of
    // how they're invoked (method `this` would otherwise bind to the debug handle object itself).
    const renderSys = this;
    state.render.debug = {
      get on() { return renderSys.collisionDebug ? renderSys.collisionDebug.on : false; },
      toggle: () => renderSys.collisionDebug ? renderSys.collisionDebug.toggle() : false,
      set: (v) => { if (renderSys.collisionDebug) renderSys.collisionDebug.setDebug(v); },
    };
    state.camera.obj = cam.obj;

    // `out` is forwarded so HUD-side hot callers can opt into the no-allocation form; every existing
    // single-argument call site is unaffected. Passing the helper as a bare function reference stays
    // safe regardless — worldToScreen ignores a non-object second argument (a .map() index, say).
    ctx.helpers.worldToScreen = (v, out) => this.worldToScreen(v, out);
    ctx.helpers.raycastToPlane = (ndc) => this.raycastToPlane(ndc);
    ctx.helpers.addTrauma = (a) => cam.addTrauma(a);
    ctx.helpers.socketWorldPose = (id, name) => this.socketWorldPose(id, name);
    ctx.helpers.socketWorldPos = (id, name) => this.socketWorldPos(id, name);
    ctx.helpers.entityMeshMeta = (id) => this.entityMeshMeta(id);
    ctx.helpers.resolveAsteroidInstanceEntityId = (object, instanceId) => (
      resolveAsteroidInstanceEntityId(this._asteroidInstancePool, object, instanceId)
    );

    bus.on('entity:spawned', () => { this._meshReconcileDirty = true; });
    bus.on('world:residency', () => { this._meshReconcileDirty = true; });
    bus.on('entity:destroyed', ({ id }) => {
      this._sectorBoundaryPreparations?.abortEntity(id, 'entity-destroyed-during-sector-prewarm');
      releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id);
      const m = this._meshes.get(id);
      if (m) {
        this._unbindPresentationMesh(id, m);
        scene.remove(m); disposeObject(m); this._meshes.delete(id);
        this._noteShadowMeshRemoved(m);
        this._publishAssetResidencyDiagnostics();
      }
    });
    // Ship hull swap or loadout change (fit/upgrade) — rebuild the mesh so visible hardpoints,
    // engines and tier reflect the current ship. Without this the mesh is frozen at spawn and a
    // shipyard hull switch or fitted weapon never shows. Mirrors the spawn path: dispose old,
    // build new, re-seat from the entity's live transform.
    bus.on('ship:appearanceChanged', ({ id }) => {
      if (this._sectorBoundaryPreparations?.has(id)) {
        this._sectorBoundaryPreparations.abortEntity(id, 'ship-appearance-changed-during-sector-prewarm');
        this._meshReconcileDirty = true;
        return;
      }
      render.rebuildShipMesh(id);
    });
    bus.on('ship:livingHullChanged', ({ id, livingHull } = {}) => {
      if (id !== state.playerId || !this._livingHullPresentation) return;
      const entity = state.entities && state.entities.get ? state.entities.get(id) : null;
      const mesh = this._meshes && this._meshes.get ? this._meshes.get(id) : null;
      if (!entity || !mesh) return;
      this._livingHullPresentation.attach(mesh);
      this._livingHullPresentation.sync(
        livingHull || entity.data && entity.data.livingHull,
        state.simTime,
        entity,
      );
    });
    // One chokepoint for all 13 camera:shake emitters. A payload carrying `position` is describing a
    // WORLD event and gets a distance falloff against the player; a payload without one is already
    // player-scoped by construction (player hit / death / respawn, drill, tether, presentation cues)
    // and passes through unchanged. Attenuating here rather than at each emitter means the twelve
    // sites nobody has audited are covered too.
    bus.on('camera:shake', (payload) => {
      const amount = (payload && payload.amount) || 0.3;
      const at = payload && payload.position;
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) { cam.addTrauma(amount); return; }
      const p = state.entities.get(state.playerId);
      if (!p || !p.pos) { cam.addTrauma(amount); return; }
      const scaled = amount * shakeDistanceAttenuation(Math.hypot(at.x - p.pos.x, at.z - p.pos.z));
      if (scaled > 0.001) cam.addTrauma(scaled);
    });
    bus.on('camera:kill', () => cam.killCam && cam.killCam());
    // FR-5: ease the frame back to center after a boost-release or a tether slingshot exit/overload
    // (cruise-drop settle stays owned by spec2/02 §1). Boost distance is state-smoothed in camera.js;
    // do not schedule a separate release pulse here, or Shift tapping becomes an in/out camera cut.
    bus.on('ship:boostStop', () => { if (cam.easeRecenter) cam.easeRecenter(0.4); });
    bus.on('tether:released', () => cam.easeRecenter && cam.easeRecenter(0.4));
    bus.on('tether:broken', () => cam.easeRecenter && cam.easeRecenter(0.4));
    bus.on('massline:selfSling', (payload) => applyMasslineReleaseCameraCue(cam, state, payload));
    bus.on('camera:zoom', ({ delta, level }) => { if (level != null) cam.setZoom(level); else cam.setZoom(state.camera.zoom + (delta || 0)); });
    bus.on('game:started', () => cam.snapToPlayer && cam.snapToPlayer());
    bus.on('save:loaded', () => cam.snapToPlayer && cam.snapToPlayer());
    bus.on('player:respawn', () => cam.snapToPlayer && cam.snapToPlayer());
    // Live-apply video settings changes. Without this, dragging Bloom strength / FOV / particle
    // quality in the settings screen did nothing (only the initial value was used) — a "slider that
    // doesn't work" sore thumb. We forward the values to the systems that own them.
    if (typeof this._videoSettingsOff === 'function') this._videoSettingsOff();
    this._videoSettingsOff = bus.on('settings:changed', (p) => {
      if (!p || p.section !== 'video') return;
      this._authoredPreparationEpoch++;
      this._sectorBoundaryPreparations?.abortAll('video-settings-changed-during-sector-prewarm');
      const vd = state.settings.video;
      this._syncPostOptions();
      if (p.key === 'shadows' || p.key == null) {
        this._shadowSettingOn = vd.shadows !== false;
        this._markShadowReceiversDirty();
        this._ensureKeyLightShadows();
        this._syncShadowMapEnabled();
      }
      if (p.key === 'renderScale' || p.key === 'pixelRatioCap'
        || p.key === 'renderGraph' || p.key == null) this.onResize();
      if ((p.key === 'dynamicResolution' || p.key == null) && this._adaptive) {
        this._adaptive.setEnabled(this._dynResAllowed === true && vd.dynamicResolution !== false);
      }
      // FOV: the feel system (feel.js) adds a transient punch on top of this base. We update the
      // camera's base fov here; feel.frame() re-derives its cached base from settings when no punch
      // is active, so the slider and the punch never fight.
      if (p.key === 'fov' || p.key == null) {
        const camObj = state.render.camera;
        if (camObj && camObj.isPerspectiveCamera && typeof vd.fov === 'number') {
          camObj.fov = vd.fov;
          camObj.updateProjectionMatrix();
        }
      }
    });
    // On sector change, reconcile rather than blindly clearing: the new sector's entities are
    // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
    // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
    // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
    bus.on('save:restoring', () => {
      // The save system emits this synchronously before it destroys the current entity graph.
      // Keep the current sector's decoded authored resources resident across that short gap; the
      // registry hands this temporary hold back only after rebuilt live boundaries cover every
      // asset. This preserves full visual quality while preventing one full GLB re-decode (and a
      // retained material generation) on every quick-load.
      const sectorId = state.world && state.world.currentSectorId;
      if (this._assetResidency && sectorId) {
        this._assetResidency.prepareSectorExit(sectorId, { includePlayer: true });
      }
      this._publishAssetResidencyDiagnostics();
    });
    const sectorPrewarmRequests = (sectorId) => {
      const player = state.entities && state.entities.get(state.playerId);
      return authoredPrewarmRequestsForEntities(state.entityList, {
        sectorId,
        playerId: state.playerId,
        playerPos: player && player.pos,
        viewportHeight: this.viewport && this.viewport.height,
      });
    };
    const reviseSectorPrewarmPopulation = (record, count = 1) => {
      if (!record || count <= 0) return;
      record.boundaryRevision = (Number(record.boundaryRevision) || 0) + count;
      record.certification = null;
    };
    const sectorPrewarmEntityIsEligible = (record, entity) => !!record
      && !!entity
      && entity.alive !== false
      && entity.id !== state.playerId
      && String(entitySectorId(entity) || '') === record.sectorId
      && authoredPrewarmRequestsForEntities([entity], {
        sectorId: record.sectorId,
        playerId: state.playerId,
      }).length > 0;
    const sectorPrewarmCoverageOptions = (record) => ({
      entities: state.entities,
      entityList: state.entityList,
      meshes: this._meshes,
      sectorId: record.sectorId,
      playerId: state.playerId,
      fingerprintForEntity: authoredCompositionFingerprintForEntity,
      isEligible: (entity) => sectorPrewarmEntityIsEligible(record, entity),
      preparationEpoch: this._authoredPreparationEpoch,
      contextGeneration: this._contextRecovery.generation,
      preparationSignature: authoredBoundaryPreparationSignature(
        renderer, state, this._contextRecovery.generation,
      ),
      contextLost: this._contextLost === true,
    });
    const validateCurrentSectorPrewarmPopulation = (record) => {
      for (const request of sectorPrewarmRequests(record.sectorId)) {
        const key = `${request.url}::${request.slot || '*'}`;
        if (!record.requestKeys?.has(key)) {
          throw failClosedSectorPrewarm(
            new Error(`Incoming authored request ${key} joined after the certified warm set`),
            'SPACEFACE_SECTOR_PREWARM_INCOMPLETE_PUBLICATION',
          );
        }
      }
      return record.stageBoundaries === false
        || validateSectorPrewarmPopulationCoverage(record, sectorPrewarmCoverageOptions(record));
    };
    const currentSectorPrewarmEnvelope = (record) => ({
      record: this._authoredSectorPrewarmPending,
      sectorId: record?.sectorId,
      generation: this._sectorPrewarmGeneration,
      preparationEpoch: this._authoredPreparationEpoch,
      contextGeneration: this._contextRecovery.generation,
      preparationSignature: authoredBoundaryPreparationSignature(
        renderer, state, this._contextRecovery.generation,
      ),
      contextLost: this._contextLost === true,
    });
    const certifiedSectorPrewarmIsCurrent = (record) => sectorPrewarmCertificationIsCurrent(
      record,
      record?.certification,
      {
        ...currentSectorPrewarmEnvelope(record),
        validatePopulation: validateCurrentSectorPrewarmPopulation,
      },
    );
    const stageSectorPrewarmBoundaries = (record, entities = state.entityList) => {
      if (!record || record.active !== true || record.stageBoundaries === false) return record;
      if (!record.boundaryRecords) record.boundaryRecords = new Set();
      if (!record.liveBoundaryPromises) record.liveBoundaryPromises = new Map();
      if (!Number.isFinite(record.boundaryRevision)) record.boundaryRevision = 0;
      let prunedRecords = 0;
      pruneSettledSectorBoundaryRecords(record.boundaryRecords, {
        isLiveRecordCurrent: (prepared) => isLiveSectorBoundaryRecordCurrent(prepared, {
          ...sectorPrewarmCoverageOptions(record),
          isEligible: (entity) => sectorPrewarmEntityIsEligible(record, entity),
        }),
        onPruned: () => { prunedRecords++; },
      });
      reviseSectorPrewarmPopulation(record, prunedRecords);
      const eligibleIds = new Set();
      for (const entity of entities || []) {
        if (!sectorPrewarmEntityIsEligible(record, entity)) continue;
        eligibleIds.add(entity.id);
        const liveBoundary = this._meshes.get(entity.id);
        if (liveBoundary) {
          const publishedRecord = [...record.boundaryRecords].find((prepared) => (
            prepared?.id === entity.id
              && prepared.entity === entity
              && prepared.boundary === liveBoundary
              && prepared.state === SECTOR_BOUNDARY_PREPARATION_STATE.live
          ));
          if (publishedRecord) {
            if (record.liveBoundaryPromises.delete(entity.id)) {
              reviseSectorPrewarmPopulation(record);
            }
            continue;
          }
          const existingLiveEntry = record.liveBoundaryPromises.get(entity.id);
          const currentFingerprint = authoredCompositionFingerprintForEntity(entity);
          if (!existingLiveEntry
              || existingLiveEntry.entity !== entity
              || existingLiveEntry.boundary !== liveBoundary
              || existingLiveEntry.fingerprint !== currentFingerprint) {
            const liveEntry = {
              id: entity.id,
              entity,
              boundary: liveBoundary,
              sectorId: record.sectorId,
              fingerprint: currentFingerprint,
              preparationEpoch: this._authoredPreparationEpoch,
              contextGeneration: this._contextRecovery.generation,
              preparationSignature: authoredBoundaryPreparationSignature(
                renderer, state, this._contextRecovery.generation,
              ),
              promise: null,
            };
            liveEntry.promise = requestAuthoredUpgrade(liveBoundary, renderer, scene, {
              residencyRole: 'sector-prepared-live-boundary',
              sectorId: record.sectorId,
              isResidencyOwnerActive: () => record.active === true
                && state.entities.get(liveEntry.id) === liveEntry.entity
                && this._meshes.get(liveEntry.id) === liveEntry.boundary
                && liveEntry.entity.mesh === liveEntry.boundary
                && liveEntry.entity.alive !== false
                && liveEntry.preparationEpoch === this._authoredPreparationEpoch
                && liveEntry.contextGeneration === this._contextRecovery.generation
                && liveEntry.preparationSignature === authoredBoundaryPreparationSignature(
                  renderer, state, this._contextRecovery.generation,
                )
                && this._contextLost !== true,
            });
            record.liveBoundaryPromises.set(entity.id, liveEntry);
            reviseSectorPrewarmPopulation(record);
          }
          continue;
        }
        if (record.liveBoundaryPromises.delete(entity.id)) {
          reviseSectorPrewarmPopulation(record);
        }
        const prepared = this._sectorBoundaryPreparations.reserve({
          id: entity.id,
          entity,
          sectorId: record.sectorId,
          generation: record.generation,
          prewarm: record,
          fingerprint: authoredCompositionFingerprintForEntity(entity),
          preparationEpoch: this._authoredPreparationEpoch,
          contextGeneration: this._contextRecovery.generation,
          preparationSignature: authoredBoundaryPreparationSignature(
            renderer, state, this._contextRecovery.generation,
          ),
        });
        if (prepared && !record.boundaryRecords.has(prepared)) {
          record.boundaryRecords.add(prepared);
          reviseSectorPrewarmPopulation(record);
        }
      }
      for (const id of [...record.liveBoundaryPromises.keys()]) {
        if (!eligibleIds.has(id) && record.liveBoundaryPromises.delete(id)) {
          reviseSectorPrewarmPopulation(record);
        }
      }
      return record;
    };
    const settleSectorBoundaryPreparations = async (record, options = {}) => {
      if (!record || record.active !== true) return false;
      return settleSectorPrewarmPopulationFixpoint(record, {
        isActive: () => record.contextGeneration === this._contextRecovery.generation
          && record.preparationEpoch === this._authoredPreparationEpoch
          && record.preparationSignature === authoredBoundaryPreparationSignature(
            renderer, state, this._contextRecovery.generation,
          )
          && this._contextLost !== true,
        refreshPopulation: () => {
          refreshSectorPrewarmPopulation(record);
        },
        settlePrefetch: options.includePrefetch === true
          ? async (pending) => {
            await Promise.resolve(pending).catch((error) => {
              record.prefetchError = error;
              return [];
            });
          }
          : null,
        settleBoundaryRecords: async (boundarySnapshot) => {
          const admitted = [...boundarySnapshot];
          try {
            await settleSectorBoundaryRecordSnapshot(boundarySnapshot, {
              settleRecords: (records) => this._sectorBoundaryPreparations.settleRecords(records),
              entities: state.entities,
              sectorId: record.sectorId,
              currentRecordForId: (id) => this._sectorBoundaryPreparations.get(id),
            });
          } catch (error) {
            if ([...boundarySnapshot].some((prepared) => (
              prepared?.cleanupBlocked === true
                || prepared?.state === SECTOR_BOUNDARY_PREPARATION_STATE.aborting
            ))) {
              throw failClosedSectorPrewarm(error, 'SPACEFACE_SECTOR_PREWARM_CLEANUP_QUARANTINE');
            }
            throw error;
          }
          // Reconciliation intentionally works on the stable-attempt snapshot. Propagate only its
          // proven removals to the live population; additions remain visible to the identity check.
          for (const prepared of admitted) {
            if (!boundarySnapshot.has(prepared)) record.boundaryRecords?.delete(prepared);
          }
        },
        settleLiveBoundaryEntries: (liveEntries) => settleLiveSectorBoundaryAdmissions(liveEntries, {
          entities: state.entities,
          meshes: this._meshes,
          fingerprintForEntity: authoredCompositionFingerprintForEntity,
          preparationEpoch: this._authoredPreparationEpoch,
          contextGeneration: this._contextRecovery.generation,
          preparationSignature: authoredBoundaryPreparationSignature(
            renderer, state, this._contextRecovery.generation,
          ),
          contextLost: this._contextLost === true,
        }),
        publishBoundaryRecords: options.publish === true
          ? (boundarySnapshot) => publishSectorBoundaryRecordSnapshot(boundarySnapshot, {
            publishRecords: (records) => this._sectorBoundaryPreparations.publishRecords(records),
            sectorId: record.sectorId,
          })
          : null,
        validatePopulation: options.publish === true
          ? () => validateCurrentSectorPrewarmPopulation(record)
          : null,
        certifyPopulation: options.publish === true
          ? (currentRecord, snapshot) => {
            validateCurrentSectorPrewarmPopulation(currentRecord);
            return createSectorPrewarmCertification(
              currentRecord,
              snapshot,
              currentSectorPrewarmEnvelope(currentRecord),
            );
          }
          : null,
      });
    };
    const releaseSectorPrewarm = (record, reason) => {
      if (!record || record.active !== true) return 0;
      record.active = false;
      record.boundaryAbort = this._sectorBoundaryPreparations.abortRecords(
        record.boundaryRecords,
        reason,
      );
      return this._assetResidency
        ? this._assetResidency.releaseOwner(record.owner, reason)
        : 0;
    };
    const appendSectorPrewarmRequests = (record, requests) => {
      if (!record || record.active !== true) return Promise.resolve([]);
      const additions = [];
      for (const request of requests || []) {
        const key = `${request.url}::${request.slot || '*'}`;
        if (record.requestKeys.has(key)) continue;
        record.requestKeys.add(key);
        record.requests.push(request);
        additions.push(request);
      }
      if (additions.length === 0) return record.promise;
      reviseSectorPrewarmPopulation(record, additions.length);
      record.promise = record.promise.catch((error) => {
        record.prefetchError = error;
        return [];
      }).then(() => {
        if (record.active !== true) return [];
        return preloadAuthoredParts(additions.map((request) => ({
          ...request,
          residencyOwner: record.owner,
          residencyRole: 'sector-prewarm',
          sectorId: record.sectorId,
          isResidencyOwnerActive: () => record.active === true,
        })), renderer);
      });
      return record.promise;
    };
    const refreshSectorPrewarmPopulation = (record) => {
      if (!record || record.active !== true) return record;
      appendSectorPrewarmRequests(record, sectorPrewarmRequests(record.sectorId));
      if (record.stageBoundaries !== false) stageSectorPrewarmBoundaries(record);
      record.populationSeeded = true;
      record.populationCoverageDirty = false;
      return record;
    };
    const beginIncomingSectorPrewarm = (sectorId, options = {}) => {
      const exactSectorId = sectorId == null ? null : String(sectorId);
      if (!exactSectorId) return null;
      const stageBoundaries = options.stageBoundaries !== false;
      const existing = this._incomingSectorPrewarm;
      if (existing && existing.active === true && existing.sectorId === exactSectorId) {
        if (existing.stageBoundaries !== stageBoundaries) {
          existing.populationCoverageDirty = true;
        }
        existing.stageBoundaries = stageBoundaries;
        if (stageBoundaries) {
          if (sectorPrewarmPopulationNeedsSynchronousRefresh(existing)) {
            refreshSectorPrewarmPopulation(existing);
          }
        } else {
          if (sectorPrewarmPopulationNeedsSynchronousRefresh(existing)) {
            refreshSectorPrewarmPopulation(existing);
          }
          if (!existing.boundaryRecords?.size) return existing;
          const retiredCount = existing.boundaryRecords.size;
          existing.boundaryAbort = this._sectorBoundaryPreparations.abortRecords(
            existing.boundaryRecords,
            'continuous-sector-entry-uses-runtime-reconcile',
          );
          existing.boundaryRecords.clear();
          reviseSectorPrewarmPopulation(existing, retiredCount);
        }
        return existing;
      }
      if (existing) releaseSectorPrewarm(existing, 'incoming-sector-prewarm-superseded');
      const record = {
        sectorId: exactSectorId,
        generation: ++this._sectorPrewarmGeneration,
        owner: Object.freeze({
          type: 'asset-incoming-sector',
          sectorId: exactSectorId,
          generation: this._sectorPrewarmGeneration,
        }),
        active: true,
        preparationEpoch: this._authoredPreparationEpoch,
        contextGeneration: this._contextRecovery.generation,
        preparationSignature: authoredBoundaryPreparationSignature(
          renderer, state, this._contextRecovery.generation,
        ),
        requestKeys: new Set(),
        requests: [],
        promise: Promise.resolve([]),
        prefetchError: null,
        stageBoundaries,
        boundaryRevision: 0,
        boundaryRecords: new Set(),
        liveBoundaryPromises: new Map(),
        certification: null,
        rotationCertificationRequired: false,
        populationSeeded: false,
        populationCoverageDirty: true,
      };
      this._incomingSectorPrewarm = record;
      refreshSectorPrewarmPopulation(record);
      return record;
    };
    const settleSectorPrewarmRequests = (record) => settleSectorBoundaryPreparations(record, {
      includePrefetch: true,
    });
    bus.on('jump:chargeStart', ({ targetSectorId } = {}) => {
      beginIncomingSectorPrewarm(targetSectorId);
    });
    bus.on('jump:chargeAbort', () => {
      const incoming = this._incomingSectorPrewarm;
      if (incoming) releaseSectorPrewarm(incoming, 'jump-charge-aborted');
      this._incomingSectorPrewarm = null;
    });
    bus.on('entity:spawned', ({ entity } = {}) => {
      if (!entity) return;
      const spawnedSectorId = entitySectorId(entity);
      const pending = this._authoredSectorPrewarmPending?.active === true
        && this._authoredSectorPrewarmPending.sectorId === String(spawnedSectorId || '')
        ? this._authoredSectorPrewarmPending
        : (this._incomingSectorPrewarm?.active === true
          && this._incomingSectorPrewarm.sectorId === String(spawnedSectorId || '')
          ? this._incomingSectorPrewarm
          : null);
      if (!pending) return;
      appendSectorPrewarmRequests(pending, authoredPrewarmRequestsForEntities([entity], {
        sectorId: pending.sectorId,
        playerId: state.playerId,
      }));
      stageSectorPrewarmBoundaries(pending, [entity]);
    });
    bus.on('jump:arrive', ({ sectorId } = {}) => {
      const pending = this._authoredSectorPrewarmPending;
      const exactSectorId = sectorId == null ? null : String(sectorId);
      if (!pending || pending.active !== true || pending.sectorId !== exactSectorId) return;
      if (sectorPrewarmPopulationNeedsSynchronousRefresh(pending)) {
        refreshSectorPrewarmPopulation(pending);
      }
    });
    bus.on('sector:exit', ({ sectorId } = {}) => {
      if (this._assetResidency) {
        applySectorExitResidency(this._assetResidency, sectorId);
      }
      const exactSectorId = sectorId == null ? null : String(sectorId);
      if (this._currentSectorPrewarm && this._currentSectorPrewarm.sectorId === exactSectorId) {
        releaseSectorPrewarm(this._currentSectorPrewarm, 'sector-prewarm-exited');
        this._currentSectorPrewarm = null;
      }
      if (this._incomingSectorPrewarm && this._incomingSectorPrewarm.sectorId === exactSectorId) {
        releaseSectorPrewarm(this._incomingSectorPrewarm, 'pending-sector-prewarm-exited');
        this._incomingSectorPrewarm = null;
      }
      if (this._authoredSectorPrewarmPendingId === exactSectorId) {
        this._authoredSectorPrewarmPendingId = null;
        this._authoredSectorPrewarmPending = null;
      }
      this._publishAssetResidencyDiagnostics();
    });
    const compileSectorPipelines = (sector) => {
      if (gpu.software) {
        return Promise.resolve({
          skipped: true,
          reason: 'software renderer uses bounded on-demand pipeline admission',
        });
      }
      return precompilePipelines(renderer, scene, cam.obj, {
        sector,
        incremental: true,
        preparePipelines: compileForCurrentTarget,
        video: state.settings && state.settings.video,
      }).catch((error) => {
        console.warn('[render] sector pipeline precompile failed', error);
        return null;
      });
    };
    bus.on('sector:enter', ({ sectorId, sector, continuous } = {}) => {
      const exactSectorId = String(sectorId || sector && sector.id || '');
      if (continuous !== true) {
        this._sectorHandoffStreamHoldS = 0;
        this._sectorHandoffSectorId = null;
      }
      this._meshReconcileDirty = true;
      if (cam.snapToPlayer) cam.snapToPlayer();
      const sectorVisualProfile = resolveSectorVisualProfile(sector);
      this._beginSectorPaletteTransition(sector, sectorVisualProfile);
      this.setSectorPostProfile(sectorVisualProfile && sectorVisualProfile.post);
      // The continuous map presentation eases its palette, post, and background identity at the
      // boundary. Its resident graph is not rebaked here; continuous authored work stays on the
      // spatial runway so a whole-sector decode/shader batch cannot compete with the crossing frame.
      //
      // The visual profile MUST be passed. onSectorEnter's second parameter defaults to null, and
      // until now both live call sites omitted it, so every authored sector profile — signature
      // celestial anchor, deep-field recipe, nebula opacity, background intensity — silently fell
      // back to engine defaults in the actual game. resolveSectorVisualProfile had exactly one
      // consumer in the whole repo: scripts/capture-space-background-acceptance.mjs, which DOES
      // pass it. That is why the acceptance captures showed the authored composition while the
      // played game showed an empty default sky.
      if (spaceBg && spaceBg.onSectorEnter) spaceBg.onSectorEnter(sector, sectorVisualProfile);
      this._updateHazardVisuals(sector);
      if (state.mode === 'loading' && sector) this._pendingPostOpeningSector = sector;
      const pipelinePrecompile = state.mode === 'loading'
        ? Promise.resolve({
          skipped: true,
          reason: 'opening-submission-plan-owns-first-picture',
        })
        : continuous === true
          ? Promise.resolve({
            skipped: true,
            reason: 'continuous-sector-handoff-defers-pipeline-precompile',
          })
          : compileSectorPipelines(sector);

      if (state.mode === 'loading' || !exactSectorId) {
        // Run reset/New Game can publish its loading-sector enter without a preceding sector:exit.
        // Retire every prior preparation generation explicitly so reset cannot strand decoded owners.
        const stalePrewarms = new Set([
          this._incomingSectorPrewarm,
          this._currentSectorPrewarm,
          this._authoredSectorPrewarmPending,
        ].filter(Boolean));
        for (const stale of stalePrewarms) releaseSectorPrewarm(stale, 'loading-sector-prewarm-reset');
        this._incomingSectorPrewarm = null;
        this._currentSectorPrewarm = null;
        this._authoredSectorPrewarmPending = null;
        this._authoredSectorPrewarmPendingId = null;
        if (this._assetResidency && exactSectorId) this._assetResidency.rotateSector(exactSectorId);
        state.render.pipelinePrecompileReady = pipelinePrecompile;
        this._publishAssetResidencyDiagnostics();
        return;
      }

      if (continuous === true) {
        // Continuous free-flight is already covered by the resident procedural graph and the
        // normal spatial authored-upgrade runway. Do not assemble a whole-sector decode/GPU batch
        // at the seam; that batch is exactly the admission spike the visual transition is meant to
        // hide. Intentional jumps retain the prepare-then-publish contract below.
        if (this._incomingSectorPrewarm) {
          releaseSectorPrewarm(this._incomingSectorPrewarm, 'continuous-sector-entry-uses-spatial-runway');
          this._incomingSectorPrewarm = null;
        }
        this._authoredSectorPrewarmPendingId = null;
        this._authoredSectorPrewarmPending = null;
        this._sectorHandoffSectorId = exactSectorId || null;
        this._sectorHandoffStreamHoldS = exactSectorId
          ? SECTOR_VISUAL_TRANSITION_SECONDS
          : 0;
        if (this._assetResidency && exactSectorId) this._assetResidency.rotateSector(exactSectorId);
        state.render.pipelinePrecompileReady = pipelinePrecompile;
        this._publishAssetResidencyDiagnostics();
        return;
      }

      let prewarm = this._incomingSectorPrewarm;
      const stageExactBoundaries = continuous !== true;
      if (!prewarm || prewarm.active !== true || prewarm.sectorId !== exactSectorId) {
        if (prewarm) releaseSectorPrewarm(prewarm, 'incoming-sector-prewarm-mismatch');
        prewarm = beginIncomingSectorPrewarm(exactSectorId, {
          stageBoundaries: stageExactBoundaries,
        });
      } else if (prewarm.stageBoundaries !== stageExactBoundaries) {
        prewarm = beginIncomingSectorPrewarm(exactSectorId, {
          stageBoundaries: stageExactBoundaries,
        });
      }
      if (sectorPrewarmPopulationNeedsSynchronousRefresh(prewarm)) {
        refreshSectorPrewarmPopulation(prewarm);
      }
      // A charge-owned record was fully seeded once and receives exact entity:spawned additions.
      // The settle fixpoint below still performs the authoritative full census before publication;
      // avoid repeating that same O(population) work synchronously inside the arrival event.
      // Exact hidden boundaries suppress ordinary authored upgrades only on intentional charge
      // entries. Continuous crossings keep the established spatial runway + two-build drain live.
      this._authoredSectorPrewarmPendingId = stageExactBoundaries ? exactSectorId : null;
      this._authoredSectorPrewarmPending = prewarm;
      const preparation = settleSectorPrewarmRequests(prewarm).then((settled) => {
        if (!settled) {
          if (prewarm.active === true) releaseSectorPrewarm(prewarm, 'sector-prewarm-generation-invalidated');
          return null;
        }
        return prepareSectorEntry(renderer, exactSectorId, prewarm.requests.slice(), {
          owner: prewarm.owner,
          residency: this._assetResidency,
          isEntryActive: () => prewarm.active === true
            && state.world
            && state.world.currentSectorId === exactSectorId
            && sectorPrewarmGenerationEnvelopeMatches(
              prewarm,
              currentSectorPrewarmEnvelope(prewarm),
            )
            && (prewarm.rotationCertificationRequired !== true
              || certifiedSectorPrewarmIsCurrent(prewarm)),
          warmShaders: async () => {
            prewarm.rotationCertificationRequired = true;
            prewarm.certification = null;
            await pipelinePrecompile;
            const settled = await settleSectorBoundaryPreparations(prewarm, {
              includePrefetch: true,
              publish: true,
            });
            if (!settled && prewarm.active === true) {
              releaseSectorPrewarm(prewarm, 'sector-prewarm-generation-invalidated');
            }
          },
        });
      }).then((prepared) => {
        if (!prepared) return prepared;
        if (prepared.cancelled) {
          if (prewarm.active === true) {
            releaseSectorPrewarm(prewarm, 'sector-prewarm-final-certification-invalidated');
          }
          if (this._incomingSectorPrewarm === prewarm) this._incomingSectorPrewarm = null;
          return prepared;
        }
        if (prewarm.active !== true) return prepared;
        if (this._currentSectorPrewarm && this._currentSectorPrewarm !== prewarm) {
          releaseSectorPrewarm(this._currentSectorPrewarm, 'sector-prewarm-replaced');
        }
        this._currentSectorPrewarm = prewarm;
        if (this._incomingSectorPrewarm === prewarm) this._incomingSectorPrewarm = null;
        return prepared;
      }).catch(async (error) => {
        const abortingRecords = new Set(prewarm.boundaryRecords || []);
        const abortOutcomes = await this._sectorBoundaryPreparations.abortRecords(
          abortingRecords,
          'sector-prewarm-preparation-failed',
        );
        error = promoteSectorPrewarmAbortQuarantine(abortingRecords, abortOutcomes, error);
        error = promoteSectorPrewarmGenerationInvalidation(
          prewarm,
          currentSectorPrewarmEnvelope(prewarm),
          error,
        );
        if (error?.preventSectorFallbackRotation !== true) prewarm.boundaryRecords?.clear();
        if (error?.preventSectorFallbackRotation === true) {
          releaseSectorPrewarm(prewarm, 'sector-prewarm-invariant-failed');
          console.error('[render] sector authored prewarm invariant failed; residency was not rotated', error);
          throw error;
        }
        // Asset failures keep the established procedural boundary visible. The helper itself never
        // rotates an incomplete set; this lifecycle-only fallback prevents a failed optional asset
        // from leaving residency labelled as the sector the player already departed.
        if (prewarm.active === true && state.world && state.world.currentSectorId === exactSectorId) {
          if (this._assetResidency) this._assetResidency.rotateSector(exactSectorId);
          if (this._currentSectorPrewarm && this._currentSectorPrewarm !== prewarm) {
            releaseSectorPrewarm(this._currentSectorPrewarm, 'failed-sector-prewarm-replaced');
          }
          this._currentSectorPrewarm = prewarm;
          if (this._incomingSectorPrewarm === prewarm) this._incomingSectorPrewarm = null;
        }
        console.warn('[render] sector authored prewarm failed; retaining procedural boundaries', error);
        return null;
      }).finally(() => {
        if (this._authoredSectorPrewarmPending === prewarm) {
          this._authoredSectorPrewarmPendingId = null;
          this._authoredSectorPrewarmPending = null;
          this._meshReconcileDirty = true;
          for (const [id, mesh] of this._meshes) {
            const entity = state.entities.get(id);
            if (canRequestAuthoredUpgrade(entity, state, null)) {
              requestAuthoredUpgrade(mesh, renderer, scene);
            }
          }
        }
        this._publishAssetResidencyDiagnostics();
      });
      state.render.pipelinePrecompileReady = preparation;
    });
    bus.on('mode:changed', ({ mode } = {}) => {
      if (mode === 'loading') {
        releaseOpeningGraphPublication(this);
        // A save/load transition replaces entity objects while commonly reusing their numeric IDs.
        // Never let the prior flight's glass/runway membership gate the restored world by ID: it
        // can falsely require unrelated replacement actors and strand Continue in loading.
        this._activityFrame = null;
        this._activityFrameTick = null;
        state.render.activityFrame = null;
        state.render.firstPlayableFrameAt = null;
        state.render.openingSubmissionFirstDrawSubmittedAt = null;
        state.render.openingSubmissionPlan = null;
        state.render.openingSubmissionReceipt = null;
        state.render.openingSubmissionPreSubmitValidation = null;
        state.render.openingSubmissionValidation = null;
        state.render.openingSubmissionReady = null;
        state.render.firstPlayableContentHashes = null;
        state.render.firstPlayableContentHashesVerified = false;
        state.render.firstPlayableGlobalProgramKeys = null;
        state.render.firstPlayableOpeningProgramKeys = null;
        state.render.firstPlayableResourceIdentitySets = null;
        this._deferNoncriticalMeshStreaming = false;
        state.render.deferNoncriticalMeshStreaming = false;
        this._pendingPostOpeningSector = null;
        this._openingFirstPicturePrepared = false;
        this._firstPlayablePaintScheduled = false;
      }
      if (mode !== 'flight') return;
      // The first visible flight draw contains only the already-resident opening composition.
      // Bulk sector roots resume at the normal two-per-frame budget after that draw completes.
      this._deferNoncriticalMeshStreaming = true;
      state.render.deferNoncriticalMeshStreaming = true;
    });
    bus.on('jump:arrive', ({ sectorId } = {}) => {
      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
      // Same contract as the sector:enter path above: the authored profile is required, not optional.
      const arrivalVisualProfile = resolveSectorVisualProfile(sector);
      this._beginSectorPaletteTransition(sector, arrivalVisualProfile);
      this.setSectorPostProfile(arrivalVisualProfile && arrivalVisualProfile.post);
      if (spaceBg && spaceBg.onSectorEnter) spaceBg.onSectorEnter(sector, arrivalVisualProfile);
    });
    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });

    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._resizeHandler = () => this.onResize();
    window.addEventListener('resize', this._resizeHandler);
    // Apply persisted video/post settings once bloom exists (createBloom defaults otherwise win).
    this._syncPostOptions();
  },

  _normalizePostVideo(vd = {}) {
    return resolveEffectiveSectorPost(vd);
  },

  _postOptionsSignature(norm, video = {}) {
    return [
      norm.bloom === false ? 0 : 1,
      norm.bloomStrength.toFixed(4),
      norm.bloomThreshold.toFixed(4),
      typeof norm.exposure === 'number' ? norm.exposure.toFixed(4) : '',
      norm.acesToneMapping ? 1 : 0,
      // Must participate in the cache key, or a sector that changes the grade is a silent no-op.
      typeof norm.grade === 'number' ? norm.grade.toFixed(4) : '',
      typeof norm.vignette === 'number' ? norm.vignette.toFixed(4) : '',
      typeof norm.toe === 'number' ? norm.toe.toFixed(4) : '',
      typeof norm.grain === 'number' ? norm.grain.toFixed(4) : '',
      video.ao === false ? 0 : 1,
      Math.min(1, finiteInRange(video.renderScale, 0.5, 2, 1)).toFixed(4),
    ].join('|');
  },

  _invalidatePostOptionsCache() {
    this._postOptionsSig = null;
  },

  // The authored per-sector grade (sectorVisualProfiles `post`) MODULATES the player's video
  // settings rather than replacing them: the slider still means what the player set, the sector
  // decides how much bloom that sector's material palette can carry and where its black floor sits.
  // These fields existed in five sector profiles with zero consumers before this.
  _applySectorPost(norm, postProfile = this._sectorPost) {
    // The cinematic grade/vignette apply on every route, so an unprofiled sector still gets them;
    // a sector profile only overrides the amounts.
    const post = postProfile || {};
    return resolveEffectiveSectorPost(norm, post, {
      // The composite's authored cinematic grade (teal-weighted shadows, amber-weighted highlights,
      // slight saturation lift) and vignette ship at 0 on the live route — bloom.js's
      // DEFAULT_POST_PRESENTATION is { grain: 0, vignette: 0, grade: 0 } — so the only pipeline that
      // ever applied them was post/spaceRenderGraph.js, which is off by default (renderGraph:false).
      // Independent review kept asking for "controlled black levels and a cinematic contrast curve"
      // against a frame whose grade was multiplied away. The grade is MULTIPLICATIVE, which is
      // precisely what fixed the earlier full-screen cyan veil: true black stays black.
      // Grain stays 0 — it is per-pixel noise for no measured review benefit.
      grade: SECTOR_POST_GRADE,
      // Lifted black floor. Independent review's grade_post fix asks for "lifted near-blacks"; every
      // other control in the composite is multiplicative and so cannot raise a black off zero.
      // This is a POST-STACK TOE and is deliberately NOT `lighting.ambient` — ambient is authored at
      // 0.15 with a pinned "keep space truly black" comment and is not touched here.
      toe: SECTOR_POST_TOE,
      vignette: SECTOR_POST_VIGNETTE,
    });
  },

  setSectorPostProfile(post) {
    const next = post || null;
    if (this._sectorPostApplied && next === this._sectorPostTarget) return;
    const wasApplied = this._sectorPostApplied;
    const video = (this.state && this.state.settings && this.state.settings.video) || {};
    const videoNorm = this._normalizePostVideo(video);
    const activeTransition = this._sectorPostTransition && this._sectorPostTransition.active
      ? this._sectorPostTransition.options
      : null;
    const startNorm = activeTransition
      ? {
        bloom: activeTransition.bloom,
        bloomStrength: activeTransition.bloomStrength,
        bloomThreshold: activeTransition.bloomThreshold,
        exposure: activeTransition.exposure,
        acesToneMapping: activeTransition.acesToneMapping,
        grade: activeTransition.grade,
        vignette: activeTransition.vignette,
        toe: activeTransition.toe,
        grain: activeTransition.grain,
      }
      : this._applySectorPost(videoNorm, this._sectorPost);
    const targetNorm = this._applySectorPost(videoNorm, next);
    this._sectorPostTarget = next;
    this._sectorPostApplied = true;

    // Boot/reset happens behind the loading screen. Apply its first authored profile directly so
    // the first playable frame is already correct; live flight uses the same 1.5s seam as lighting.
    if (!wasApplied || this.state.mode === 'loading') {
      this._sectorPost = next;
      this._sectorPostTransition.active = false;
      this._sectorPostTransition.elapsed = SECTOR_VISUAL_TRANSITION_SECONDS;
      this._invalidatePostOptionsCache();
      this._syncPostOptions();
      return;
    }

    const transition = this._sectorPostTransition;
    // The current profile remains authoritative until the first interpolated frame is ready.
    // This prevents the event handler itself from changing exposure/bloom on the crossing frame.
    this._invalidatePostOptionsCache();
    this._syncPostOptions();
    transition.startNorm = startNorm;
    transition.targetNorm = targetNorm;
    transition.targetProfile = next;
    transition.startExposure = startNorm.exposure;
    transition.targetExposure = targetNorm.exposure;
    transition.startBloomStrength = startNorm.bloomStrength;
    transition.targetBloomStrength = targetNorm.bloomStrength;
    transition.startBloomThreshold = startNorm.bloomThreshold;
    transition.targetBloomThreshold = targetNorm.bloomThreshold;
    transition.elapsed = 0;
    transition.active = true;
  },

  _applySectorPostTransitionOptions(options) {
    if (!options) return;
    if (this.bloom) this.bloom.setOptions(options);
    if (this.renderer) {
      this.renderer.toneMappingExposure = Number.isFinite(options.exposure) ? options.exposure : 1;
      this.renderer.toneMapping = options.acesToneMapping === false
        ? THREE.NoToneMapping
        : THREE.ACESFilmicToneMapping;
    }
    if (this._renderGraph) {
      const graphOptions = this._sectorPostTransition.graphOptions;
      graphOptions.bloom = options.bloom !== false;
      graphOptions.bloomStrength = options.bloomStrength;
      graphOptions.bloomThreshold = options.bloomThreshold;
      graphOptions.exposure = options.exposure;
      graphOptions.acesToneMapping = options.acesToneMapping;
      graphOptions.grade = options.grade;
      graphOptions.vignette = options.vignette;
      graphOptions.toe = options.toe;
      graphOptions.grain = options.grain;
      const video = (this.state && this.state.settings && this.state.settings.video) || {};
      if (video.renderGraph === true) {
        graphOptions.ao = video.ao !== false;
        graphOptions.renderScale = Math.min(1, finiteInRange(video.renderScale, 0.5, 2, 1));
      }
      this._renderGraph.setOptions(graphOptions);
    }
  },

  _updateSectorPostTransition(frameDt) {
    const transition = this._sectorPostTransition;
    if (!transition || !transition.active) return;
    transition.elapsed = Math.min(
      SECTOR_VISUAL_TRANSITION_SECONDS,
      transition.elapsed + (Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0),
    );
    const rawT = SECTOR_VISUAL_TRANSITION_SECONDS > 0
      ? transition.elapsed / SECTOR_VISUAL_TRANSITION_SECONDS
      : 1;
    const t = easeSectorTransition(rawT);
    const start = transition.startNorm;
    const target = transition.targetNorm;
    const options = transition.options;
    options.bloom = t < 1 ? start.bloom : target.bloom;
    options.bloomStrength = transition.startBloomStrength
      + (transition.targetBloomStrength - transition.startBloomStrength) * t;
    options.strength = options.bloomStrength;
    options.bloomThreshold = transition.startBloomThreshold
      + (transition.targetBloomThreshold - transition.startBloomThreshold) * t;
    options.threshold = options.bloomThreshold;
    options.exposure = transition.startExposure
      + (transition.targetExposure - transition.startExposure) * t;
    options.acesToneMapping = t < 1 ? start.acesToneMapping : target.acesToneMapping;
    options.grade = start.grade + (target.grade - start.grade) * t;
    options.vignette = start.vignette + (target.vignette - start.vignette) * t;
    options.toe = start.toe + (target.toe - start.toe) * t;
    options.grain = start.grain + (target.grain - start.grain) * t;
    this._applySectorPostTransitionOptions(options);

    if (rawT >= 1) {
      transition.active = false;
      this._sectorPost = transition.targetProfile;
      this._invalidatePostOptionsCache();
      this._syncPostOptions();
    }
  },

  _syncPostOptions(force = false) {
    const vd = (this.state && this.state.settings && this.state.settings.video) || {};
    const norm = this._applySectorPost(this._normalizePostVideo(vd));
    const sig = this._postOptionsSignature(norm, vd);
    if (!force && this._postOptionsSig === sig) return;
    this._postOptionsSig = sig;
    const postOpts = {
      bloom: norm.bloom,
      bloomStrength: norm.bloomStrength,
      strength: norm.bloomStrength,
      threshold: norm.bloomThreshold,
      bloomThreshold: norm.bloomThreshold,
      exposure: norm.exposure,
      acesToneMapping: norm.acesToneMapping,
      grade: norm.grade,
      vignette: norm.vignette,
      toe: norm.toe,
      grain: norm.grain ?? 0,
    };
    if (this.bloom) this.bloom.setOptions(postOpts);
    // Native presentation is reserved for a degraded post-processor fallback. Keep Three's exposure
    // and tone mapper aligned so that exceptional route still degrades predictably.
    if (this.renderer) {
      this.renderer.toneMappingExposure = Number.isFinite(norm.exposure) ? norm.exposure : 1;
      this.renderer.toneMapping = norm.acesToneMapping === false
        ? THREE.NoToneMapping
        : THREE.ACESFilmicToneMapping;
    }
    if (this._renderGraph) {
      const graphOpts = {
        bloom: norm.bloom !== false,
        bloomStrength: norm.bloomStrength,
        bloomThreshold: norm.bloomThreshold,
        exposure: norm.exposure,
        acesToneMapping: norm.acesToneMapping,
        grade: norm.grade,
        vignette: norm.vignette,
        toe: norm.toe,
        grain: norm.grain ?? 0,
      };
      // An allocated-but-unselected graph is dormant. Defer its size-owning fields until selection
      // so a slider/window change cannot churn an unused target set (the enable path calls onResize).
      if (vd.renderGraph === true) {
        graphOpts.ao = vd.ao !== false;
        graphOpts.renderScale = Math.min(1, finiteInRange(vd.renderScale, 0.5, 2, 1));
      }
      this._renderGraph.setOptions(graphOpts);
    }
  },

  _publishAssetResidencyDiagnostics() {
    if (!this.state || !this.state.render || !this._assetResidency) return null;
    // The renderer publishes this snapshot at high-frequency lifecycle seams. Keep the bounded
    // forensic ring inside the registry; the player-facing state needs only the canonical summary,
    // avoiding a fresh copy of hundreds of event objects on every mesh reconciliation.
    const diagnostics = this._assetResidency.canonicalDiagnostics();
    this.state.render.assetResidency = diagnostics;
    return diagnostics;
  },

  _bindPresentationMesh(entity, mesh) {
    const world = this._presentationWorld;
    if (!entity || !mesh) return false;
    if (entity.id === this.state.playerId && this._livingHullPresentation) {
      this._livingHullPresentation.attach(mesh);
      this._livingHullPresentation.sync(
        entity.data && entity.data.livingHull,
        this.state.simTime,
        entity,
      );
    }
    if (!world) return false;
    const handle = world.handleForEntityId(entity.id, this._presentationHandleScratch);
    if (!handle) return false;
    if (!mesh.userData) mesh.userData = {};
    mesh.userData.presentationEntityId = entity.id;
    const lanes = this._persistentSubmitLanes;
    const lane = mesh.material && (mesh.material.transparent || mesh.material.transmission > 0)
      ? SUBMIT_LANE.TRANSPARENT
      : SUBMIT_LANE.OPAQUE;
    lanes.reserve(entity.id, lane);
    return world.bindMesh(handle, mesh, entity, entityVisualCullRadius(entity, mesh));
  },

  _unbindPresentationMesh(entityId, mesh = null) {
    if (this._livingHullPresentation) {
      if (mesh) this._livingHullPresentation.detach(mesh);
      else if (entityId === this.state.playerId) this._livingHullPresentation.detach();
    }
    const world = this._presentationWorld;
    if (!world) return false;
    const handle = world.handleForEntityId(entityId, this._presentationHandleScratch);
    if (!handle) return false;
    this._persistentSubmitLanes.release(entityId);
    return world.unbindMesh(handle, mesh);
  },

  _rebindPresentationMeshes() {
    if (!this._presentationWorld || !this._meshes) return;
    this._presentationQueries?.reset?.();
    for (const [id, mesh] of this._meshes) {
      const entity = this.state.entities.get(id);
      if (entity && entity.alive !== false) this._bindPresentationMesh(entity, mesh);
    }
  },

  _bindPublishedPresentationMeshes(publication) {
    if (!publication || publication.spawnedCount <= 0) return;
    const world = this._presentationWorld;
    for (let index = 0; index < publication.spawnedCount; index++) {
      const slot = publication.spawnedSlots[index];
      if (world.alive[slot] !== 1) continue;
      const entityId = world.entityIds[slot];
      const entity = this.state.entities.get(entityId);
      const mesh = this._meshes.get(entityId);
      if (entity && entity.alive !== false && mesh) this._bindPresentationMesh(entity, mesh);
    }
  },

  clearAllMeshes(keepPlayer) {
    this._sectorBoundaryPreparations?.abortAll('render-mesh-clear');
    for (const [id, m] of [...this._meshes]) {
      if (keepPlayer && id === this.state.playerId) continue;
      this._unbindPresentationMesh(id, m);
      releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id);
      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
    }
    this._presentationQueries?.reset?.();
    this._markShadowReceiversDirty();
    this._meshBuildQueue.length = 0;
    this._meshBuildQueueHead = 0;
    this._meshBuildQueuedIds.clear();
    // Also clear hazard zone visuals
    for (const obj of this._hazardVisuals) { this.scene.remove(obj); disposeObject(obj); }
    this._hazardVisuals = [];
    this._publishAssetResidencyDiagnostics();
  },

  // Bake (or re-bake) the PMREM environment map from the current nebula backdrop. Called once at
  // init after the starfield background decodes, AND on WebGL context restore (a lost GL context
  // invalidates the envMap GPU texture — without re-baking, chrome hulls go matte after recovery).
  _bakeEnv(options = {}) {
    try {
      const renderer = this.renderer, scene = this.scene, state = this.state;
      const previousEnvMap = Object.prototype.hasOwnProperty.call(options, 'previousEnvMap')
        ? options.previousEnvMap
        : this._envMap;
      const disposePrevious = options.disposePrevious !== false;
      const pmrem = new THREE.PMREMGenerator(renderer);
      // Capture the IBL from the dedicated reflection rig, NOT from the live scene.
      //
      // The live scene is deliberately near-black, so convolving it produced an environment with
      // almost no reflected structure — which is why coated paint, bare metal, glass and bevels all
      // resolved to the same flat plastic response no matter what their roughness/metalness maps
      // said. spaceReflectionEnvironment.js exists precisely to fix that (three broad emissive area
      // cards: warm key, cool rim, neutral fill) and was written but never imported anywhere in
      // src/. The cards live in their own offscreen scene, so the playable backdrop stays black and
      // its black level is untouched.
      let reflectionEnv = null;
      let envMap;
      if (scene.background && scene.background.isTexture) {
        envMap = pmrem.fromEquirectangular(scene.background).texture;
      } else {
        reflectionEnv = createSpaceReflectionEnvironment(THREE);
        envMap = pmrem.fromScene(
          reflectionEnv.scene, SPACE_REFLECTION_PMREM_SIGMA_RADIANS, 0.1, 1000,
        ).texture;
      }
      pmrem.dispose();
      if (reflectionEnv) reflectionEnv.dispose();
      // Dispose the previous env GPU texture if we're re-baking (context restore path).
      if (disposePrevious && previousEnvMap && previousEnvMap !== envMap) {
        try { previousEnvMap.dispose(); } catch (_) {}
      }
      this._envMap = envMap;
      state.render.envMap = envMap;
      setEnvMapForShips(envMap);   // hand it to the visual factory for chrome/authority hulls
      if (scene.environment === null || scene.environment === previousEnvMap) scene.environment = envMap;
      if (previousEnvMap && previousEnvMap !== envMap) replaceSceneEnvMap(scene, previousEnvMap, envMap);
    } catch (_) { /* env-map optional — chrome falls back to high-metalness matte */ }
  },

  // Self-healing entity<->mesh reconciliation. Guarantees every alive, renderable entity has a
  // scene mesh and that meshes for gone entities are disposed — independent of event ordering.
  // This is the safety net that makes the world actually render (entity:spawned alone was being
  // undone by the old sector:enter clear). Cheap: only builds/destroys on a delta.
  reconcileMeshes() {
    const state = this.state;
    const buildBudget = this._initialMeshReconcileComplete ? RUNTIME_MESH_BUILD_BUDGET : Infinity;
    // Remove dead ownership and evict distant reduced-sector views. Simulation residency remains
    // untouched; only the render-owned Object3D boundary and its authored residency are released.
    for (const [id, m] of this._meshes) {
      const e = state.entities.get(id);
      if (!e || e.alive === false || !isEntityRenderRelevant(e, state, renderResidencyRadius(state, 'evict'))) {
        this._unbindPresentationMesh(id, m);
        releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id);
        this.scene.remove(m); disposeObject(m); this._meshes.delete(id); noteShadowMeshRemoved(this, m);
        clearEntityMeshReference(e, m);
      }
    }
    // Queue relevant ships first, then relevant world geometry. Distant reduced-sector entities
    // continue to exist in state and are admitted automatically as the player approaches.
    enqueueMissingMeshBuilds(
      state.entityList,
      this._meshes,
      this._meshBuildQueuedIds,
      this._meshBuildQueue,
      (entity) => !this._sectorBoundaryPreparations?.has(entity.id)
        && isEntityRenderRelevant(entity, state),
    );
    const built = this._drainMeshBuildQueue(buildBudget);
    // Existing fallback boundaries may have crossed the authored prefetch radius since the last
    // reconciliation. Requesting is idempotent; resolved bootstrap assets install synchronously.
    for (const [id, mesh] of this._meshes) {
      const entity = state.entities.get(id);
      if (!entity || entity.alive === false) continue;
      this._bindPresentationMesh(entity, mesh);
      if (canRequestAuthoredUpgrade(entity, state, this._authoredSectorPrewarmPendingId)) {
        requestAuthoredUpgrade(mesh, this.renderer, this.scene);
      }
    }
    // This call completed the requested full safety scan. Any remaining queue is a bounded build
    // drain, not a reason to repeat the four collection passes on every following display frame.
    this._meshReconcileDirty = false;
    if (this._meshBuildQueueHead >= this._meshBuildQueue.length) {
      this._initialMeshReconcileComplete = true;
    }
    this._publishAssetResidencyDiagnostics();
    return built;
  },

  // Ordinary-flight distance polling needs the same admission/eviction policy as the full safety
  // scan, but not its redundant entity-to-mesh rebinding or separate ship/world passes. Keep one
  // mesh ownership pass (so missed destroy events still self-heal) and one retained entity pass;
  // collect candidates into retained arrays to preserve ship-first build order without allocation.
  reconcileMeshResidency() {
    const state = this.state;
    const shipCandidates = this._meshResidencyShipCandidates;
    const otherCandidates = this._meshResidencyOtherCandidates;
    const stats = this._meshResidencySweep;
    shipCandidates.length = 0;
    otherCandidates.length = 0;
    stats.meshVisits = 0;
    stats.entityVisits = 0;
    stats.queuedShips = 0;
    stats.queuedOther = 0;
    stats.evicted = 0;
    stats.built = 0;

    for (const [id, mesh] of this._meshes) {
      stats.meshVisits++;
      const entity = state.entities.get(id);
      if (!entity || entity.alive === false
          || !isEntityRenderRelevant(entity, state, renderResidencyRadius(state, 'evict'))) {
        this._unbindPresentationMesh(id, mesh);
        releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id);
        this.scene.remove(mesh);
        disposeObject(mesh);
        this._meshes.delete(id);
        noteShadowMeshRemoved(this, mesh);
        clearEntityMeshReference(entity, mesh);
        stats.evicted++;
        continue;
      }
      if (canRequestAuthoredUpgrade(entity, state, this._authoredSectorPrewarmPendingId)) {
        requestAuthoredUpgrade(mesh, this.renderer, this.scene);
      }
    }

    const entities = state.entityList;
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index];
      stats.entityVisits++;
      if (!entity || this._meshes.has(entity.id)
          || this._sectorBoundaryPreparations?.has(entity.id)
          || !isEntityRenderRelevant(entity, state)) continue;
      if (entity.type === 'ship') shipCandidates.push(entity);
      else otherCandidates.push(entity);
    }
    for (let index = 0; index < shipCandidates.length; index++) {
      enqueueMeshBuildCandidate(
        shipCandidates[index],
        this._meshes,
        this._meshBuildQueuedIds,
        this._meshBuildQueue,
      );
    }
    for (let index = 0; index < otherCandidates.length; index++) {
      enqueueMeshBuildCandidate(
        otherCandidates[index],
        this._meshes,
        this._meshBuildQueuedIds,
        this._meshBuildQueue,
      );
    }
    stats.queuedShips = shipCandidates.length;
    stats.queuedOther = otherCandidates.length;
    shipCandidates.length = 0;
    otherCandidates.length = 0;
    stats.built = this._drainMeshBuildQueue(RUNTIME_MESH_BUILD_BUDGET);
    this._publishAssetResidencyDiagnostics();
    return stats;
  },

  _drainPendingMeshBuilds() {
    const built = this._drainMeshBuildQueue(RUNTIME_MESH_BUILD_BUDGET);
    if (this._meshBuildQueueHead >= this._meshBuildQueue.length) {
      this._initialMeshReconcileComplete = true;
    }
    if (built > 0) this._publishAssetResidencyDiagnostics();
    return built;
  },

  _drainMeshBuildQueue(buildBudget) {
    let built = 0;
    if (buildBudget !== Infinity && this._initialMeshReconcileComplete) {
      const gate = shouldStartHeavyAdmissionEventually(
        this.state && this.state.render && this.state.render.lastPresentDtMs,
        this._meshBuildLateSkips,
      );
      this._meshBuildLateSkips = gate.skippedCount;
      if (!gate.start) return 0;
    }
    const startedAtMs = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now());
    while (this._meshBuildQueueHead < this._meshBuildQueue.length && built < buildBudget) {
      if (!shouldContinueAdmissionSlice({
        buildBudget,
        startedAtMs,
        nowMs: now(),
        itemsDone: built,
      })) break;
      const id = this._meshBuildQueue[this._meshBuildQueueHead++];
      this._meshBuildQueuedIds.delete(id);
      const e = this.state.entities.get(id);
      if (!e || e.alive === false || e._noMesh || this._meshes.has(id)
          || this._sectorBoundaryPreparations?.has(id)
          || !isEntityRenderRelevant(e, this.state)) continue;
      const m = this.vf.build(e);
      if (!m) { e._noMesh = true; continue; }
      const local = this._frameMembrane.toLocal(e.pos, _meshLocalXZ);
      m.position.set(local.x, 0, local.z);
      m.rotation.y = -e.rot;
      if (e.type === 'ship' || e.type === 'station') {
        attachContactShadow(m, e);
        const lodLevel = m.userData && m.userData.lod ? m.userData.lod.level : null;
        syncShadowCasterPolicy(m, lodLevel, this._shadowPolicyOptions(e, m));
      }
      e.mesh = m; e.view = { root: m };
      this._meshes.set(e.id, m);
      this.scene.add(m);
      this._bindPresentationMesh(e, m);
      registerAsteroidBaseLeaf(this._asteroidInstancePool, e, m);
      if (this.state.render && typeof this.state.render.compileObjectPipelines === 'function') {
        void this.state.render.compileObjectPipelines(m);
      }
      if (canRequestAuthoredUpgrade(e, this.state, this._authoredSectorPrewarmPendingId)) {
        requestAuthoredUpgrade(m, this.renderer, this.scene);
      }
      noteShadowMeshAdded(this, m);
      built++;
    }
    if (this._meshBuildQueueHead >= this._meshBuildQueue.length) {
      this._meshBuildQueue.length = 0;
      this._meshBuildQueueHead = 0;
    } else if (this._meshBuildQueueHead > 64) {
      this._meshBuildQueue = this._meshBuildQueue.slice(this._meshBuildQueueHead);
      this._meshBuildQueueHead = 0;
    }
    return built;
  },

  // Rebuild one ship's mesh after a hull swap or loadout change. Disposes the old Object3D, builds a
  // fresh one from the (now-updated) entity, and re-seats it from the entity's live transform so it
  // doesn't snap. Player-only in practice, but safe for any ship id. Textures/geo/materials are
  // cached in the factory (never disposed), so only the per-entity Object3D graph is freed here —
  // exactly the same lifecycle the per-entity disposer in disposeObject() already assumes.
  rebuildShipMesh(id) {
    if (this._sectorBoundaryPreparations?.has(id)) {
      this._sectorBoundaryPreparations.abortEntity(id, 'ship-rebuild-during-sector-prewarm');
      this._meshReconcileDirty = true;
      return;
    }
    const e = this.state.entities.get(id);
    if (!e || e.alive === false) return;
    const old = this._meshes.get(id);
    if (old) {
      this._unbindPresentationMesh(id, old);
      this.scene.remove(old);
      disposeObject(old);
      this._meshes.delete(id);
      noteShadowMeshRemoved(this, old);
    }
    const m = this.vf.build(e);
    if (!m) return;
    const local = this._frameMembrane.toLocal(e.pos, _meshLocalXZ);
    m.position.set(local.x, 0, local.z);
    m.rotation.y = -e.rot;
    // carry the bank pose so the rebuilt hull doesn't momentarily sit level mid-turn
    const hull = m.userData && m.userData.hull;
    if (hull && e.bank != null) hull.rotation.x = e.bank;
    if (hull && e.pitch != null) hull.rotation.z = e.pitch;
    if (e.type === 'ship' || e.type === 'station') {
      attachContactShadow(m, e);
      const lodLevel = m.userData && m.userData.lod ? m.userData.lod.level : null;
      syncShadowCasterPolicy(m, lodLevel, this._shadowPolicyOptions(e, m));
    }
    e.mesh = m; e.view = { root: m };
    this._meshes.set(id, m);
    this.scene.add(m);
    this._bindPresentationMesh(e, m);
    if (this.state.render && typeof this.state.render.compileObjectPipelines === 'function') {
      void this.state.render.compileObjectPipelines(m);
    }
    if (canRequestAuthoredUpgrade(e, this.state, this._authoredSectorPrewarmPendingId)) {
      requestAuthoredUpgrade(m, this.renderer, this.scene);
    }
    noteShadowMeshAdded(this, m);
  },


  _entityViewCullBounds() {
    const camObj = this.cam && this.cam.obj;
    const cameraState = this.state && this.state.camera || {};
    // Camera focus is frame-local after the M2 chase camera membrane.
    const focus = cameraState.focus || (camObj && camObj.position) || { x: 0, z: 0 };
    const composition = this.cam && typeof this.cam.composition === 'function'
      ? this.cam.composition()
      : null;
    const liveZoom = composition && Number.isFinite(composition.zoom) ? composition.zoom : NaN;
    const zoom = Number.isFinite(liveZoom)
      ? liveZoom
      : (Number.isFinite(cameraState.zoom)
        ? cameraState.zoom
        : Math.max(80, camObj && Number.isFinite(camObj.position && camObj.position.y) ? Math.abs(camObj.position.y) : 88));
    const tilt = Number.isFinite(cameraState.tilt) ? cameraState.tilt : 60;
    const fov = camObj && Number.isFinite(camObj.fov)
      ? camObj.fov
      : (this.state.settings && this.state.settings.video && this.state.settings.video.fov) || 50;
    const aspect = Math.max(0.45, camObj && Number.isFinite(camObj.aspect)
      ? camObj.aspect
      : (this.viewport && this.viewport.height ? this.viewport.width / this.viewport.height : 16 / 9));
    if (this.state && this.state.camera) {
      this.state.camera.liveZoom = zoom;
      this.state.camera.fov = fov;
      this.state.camera.aspect = aspect;
    }
    const speed = tableTravelSpeed(this.state);
    const extents = submitCullHalfExtents(zoom, fov, aspect, speed, tilt);
    const bounds = this._entityViewBounds;
    bounds.x = Number.isFinite(focus.x) ? focus.x : 0;
    bounds.z = Number.isFinite(focus.z) ? focus.z : 0;
    bounds.halfX = extents.halfX;
    bounds.halfZ = extents.halfZ;
    bounds.margin = extents.runway;
    bounds.glassHalfX = extents.glass.halfX;
    bounds.glassHalfZ = extents.glass.halfZ;
    bounds.runway = extents.runway;
    return bounds;
  },

  _isEntityViewCulled(e, bounds, mesh = null) {
    if (!e || !bounds || e.id === this.state.playerId) return false;
    if (e.flags && (e.flags.forceRender || e.flags.neverCull)) return false;
    if (!e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return false;
    const local = this._frameMembrane.toLocal(e.pos, _cullLocalXZ);
    const radius = entityVisualCullRadius(e, mesh);
    return Math.abs(local.x - bounds.x) > bounds.halfX + radius
      || Math.abs(local.z - bounds.z) > bounds.halfZ + radius;
  },

  /** Reproject all render-owned local caches when frameOriginSeq advances (no sim mutation). */
  _applyFrameOriginRebase(dx, dz) {
    if (!(dx || dz)) return;
    for (const m of this._meshes.values()) {
      if (!m || !m.position) continue;
      m.position.x += dx;
      m.position.z += dz;
    }
    // Hazard zone discs/rings are render-owned local anchors (not rebuilt every frame).
    if (this._hazardVisuals && this._hazardVisuals.length) {
      for (const obj of this._hazardVisuals) {
        if (!obj || !obj.position) continue;
        obj.position.x += dx;
        obj.position.z += dz;
      }
    }
    // Contact-shadow instance records cache local XZ; force refresh next sync.
    if (this._contactShadowPool && this._contactShadowPool.records) {
      this._contactShadowPool.records.clear();
    }
    invalidateAsteroidInstancePool(this._asteroidInstancePool);
    if (this.cam && typeof this.cam.reprojectFrame === 'function') {
      this.cam.reprojectFrame(dx, dz);
    } else if (this.state && this.state.camera && this.state.camera.focus) {
      this.state.camera.focus.x += dx;
      this.state.camera.focus.z += dz;
    }
    // VFX owns particle/sprite/trail local anchors — reproject without erasing effects.
    try {
      const vfxSys = this.state && this.state.render && this.state.render.vfxReprojectFrame;
      if (typeof vfxSys === 'function') vfxSys(dx, dz);
    } catch (_) { /* optional */ }
  },

  _applyPresentationPose(slot, mesh, alpha, currentOnly = false) {
    if (!mesh || !mesh.position) return false;
    const world = this._presentationWorld;
    const origin = this._frameMembrane && this._frameMembrane.origin;
    if (!world || !origin) return false;
    const fence = this._snapshotFence;
    const snapshot = fence && fence.latestSnapshot();
    const previous = !currentOnly && fence ? fence.previousSnapshot() : null;
    if (!snapshot) return false;
    const applied = applySnapshotPoseToMesh(
      mesh,
      snapshot,
      world.entityIds[slot],
      origin,
      previous,
      currentOnly ? 1 : alpha,
    );
    if (!applied) return false;
    const hull = mesh.userData && mesh.userData.hull;
    const entity = world.entityRefs[slot];
    if (hull && entity && entity.bank != null) hull.rotation.x = world.bank[slot];
    if (hull && entity && entity.pitch != null) hull.rotation.z = world.pitch[slot];
    return true;
  },

  _hasCompletedPresentationPose(slot, entityId) {
    const world = this._presentationWorld;
    const snapshot = this._snapshotFence && this._snapshotFence.latestSnapshot();
    if (!world || !snapshot || world.entityIds[slot] !== entityId) return false;
    return snapshotIndexOf(snapshot, entityId) >= 0;
  },

  syncEntityViews(alpha) {
    // Opt-in CPU attribution only — no performance.now()/ring write when disabled.
    const useCpu = !!(this.state && this.state.perfRuntime
      && this.state.perfRuntime.renderWorkEnabled
      && typeof this.state.perfRuntime.recordRenderWork === 'function');
    const started = useCpu && typeof performance !== 'undefined' ? performance.now() : 0;
    const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
    const settings = this.state.settings || {};
    _worldSiteA11y.reducedMotion = !!(settings.video && settings.video.motionReduce);
    _worldSiteA11y.reducedFlash = !!(settings.accessibility && settings.accessibility.flashReduce);

    const world = this._presentationWorld;
    const bounds = this._entityViewCullBounds();
    this._frameShadowCastRadius = liveShadowCastRadius(this.state);
    const queryOptions = this._presentationQueryOptions;
    queryOptions.bounds = bounds;
    queryOptions.origin = this._frameMembrane.origin;
    queryOptions.playerId = this.state.playerId;
    const query = this._presentationQueries.query(queryOptions);
    let transformed = 0;
    let fullSynced = 0;
    let lodChecked = 0;
    let hlodDetailedVisible = 0;
    let hlodProxyVisible = 0;
    let hlodObjectsSwapped = 0;
    let shadowPolicyRefreshes = 0;

    beginRenderEntityFrame(this._entityFrame);

    // A root crossing out of the retained visible set receives one final authoritative current pose.
    // It can then stay untouched while far-culled without lingering at a stale near-camera transform.
    for (let index = 0; index < query.hiddenCount; index++) {
      const slot = query.hiddenSlots[index];
      const generation = query.hiddenGenerations[index];
      if (world.alive[slot] !== 1 || world.slotGenerations[slot] !== generation) continue;
      const mesh = world.meshRefs[slot];
      if (!mesh) continue;
      const entityId = world.entityIds[slot];
      const entity = world.entityRefs[slot] || this.state.entities.get(entityId);
      if (entity && entity.alive !== false) {
        world.refreshVisibleEntity(slot, entity, entityVisualCullRadius(entity, mesh));
      }
      const posed = this._applyPresentationPose(slot, mesh, alpha, true);
      const isPlayer = !!(entity && entity.id === this.state.playerId);
      const forceRender = !!(entity && entity.flags && entity.flags.forceRender);
      const neverCull = !!(entity && entity.flags && entity.flags.neverCull);
      const protectedRoot = isProtectedEntityMesh({ isPlayer, forceRender, neverCull });
      // A protected root keeps its prior visibility when the latest fence has no pose for it.
      // Ordinary stale identities still fail closed and leave the submit list immediately.
      const visibilityChanged = !(!posed && protectedRoot)
        && applyEntityMeshVisibility(mesh, posed && shouldSubmitEntityMesh({
          isPlayer,
          forceRender,
          neverCull,
          hidden: true,
          snapshotMissing: !posed,
          pipelinesPending: !!(mesh.userData && mesh.userData.pipelinesPending),
          activityFrame: this._activityFrame,
          entityId,
          presentationTier: entity && entity.activity && entity.activity.presentationTier,
        }));
      if (visibilityChanged) this._persistentSubmitLanes.markDirty(entityId, 'visibility');
      if (mesh.userData && mesh.userData.asteroidInstanceBody) {
        mesh.userData.asteroidInstanceViewCulled = true;
      }
      world.clearDirty(slot);
      transformed++;
    }

    const innerView = viewHalfExtents(
      this.state.camera && this.state.camera.zoom,
      this.cam && this.cam.obj && this.cam.obj.fov,
      this.cam && this.cam.obj && this.cam.obj.aspect,
      INNER_VIEW_BAND_SCALE,
    );

    for (let index = 0; index < query.visibleCount; index++) {
      const slot = query.visibleSlots[index];
      const generation = query.visibleGenerations[index];
      if (world.alive[slot] !== 1 || world.slotGenerations[slot] !== generation) continue;
      const mesh = world.meshRefs[slot];
      const entityId = world.entityIds[slot];
      const entity = world.entityRefs[slot] || this.state.entities.get(entityId);
      if (!mesh || !entity || entity.alive === false) continue;

      const userData = mesh.userData || (mesh.userData = {});
      if (this.collisionDebug && this.collisionDebug.on) userData.__lastEntity = entity;
      world.refreshVisibleEntity(slot, entity, entityVisualCullRadius(entity, mesh));
      const dirty = world.dirtyMasks[slot];
      // A clean render root still needs a validity check against the latest completed fence. The
      // check is an index lookup only; pose writes remain dirty/delta-gated below.
      let posed = this._hasCompletedPresentationPose(slot, entityId);
      const isPlayer = entity.id === this.state.playerId;
      const forceRender = !!(entity.flags && entity.flags.forceRender);
      const neverCull = !!(entity.flags && entity.flags.neverCull);
      const protectedRoot = isProtectedEntityMesh({ isPlayer, forceRender, neverCull });
      if ((dirty & (PRESENTATION_DIRTY.TRANSFORM | PRESENTATION_DIRTY.BINDING
        | PRESENTATION_DIRTY.VISIBILITY)) !== 0 || world.poseHasDelta(slot)) {
        posed = this._applyPresentationPose(slot, mesh, alpha);
        if (!posed && !protectedRoot) {
          if (applyEntityMeshVisibility(mesh, false)) {
            this._persistentSubmitLanes.markDirty(entityId, 'visibility');
          }
        }
        if (posed) this._persistentSubmitLanes.markDirty(entityId, 'transform');
        transformed++;
      }
      if (userData.asteroidInstanceBody) userData.asteroidInstanceViewCulled = false;

      // Projected-screen-size LOD (spec §12.4): visible roots resolve detail from projected pixel
      // width with hysteresis. Newly visible roots are fully posed above before this decision.
      const viewBand = classifyEntityViewBand({
        isPlayer: entity.id === this.state.playerId,
        dx: mesh.position.x - bounds.x,
        dz: mesh.position.z - bounds.z,
        innerHalfX: innerView.halfX,
        innerHalfZ: innerView.halfZ,
        forceInner: !!(entity.flags && (entity.flags.forceRender || entity.flags.neverCull)),
      });
      const runClosures = shouldRunEntityClosures(viewBand, this.state.tick, slot);
      let lodLevel = userData.lod ? userData.lod.level : null;
      const hlodVisualRadius = userData.hlod && Number(userData.hlod.visualRadius);
      const lodRadius = Number.isFinite(hlodVisualRadius) && hlodVisualRadius > 0
        ? hlodVisualRadius
        : entity.radius;
      const projectedPx = projectedWidthPx(
        mesh.position,
        lodRadius,
        this.cam && this.cam.obj,
        this.viewport,
      );
      if (userData.lod && userData.updateLod) {
        lodChecked++;
        lodLevel = entity.id === this.state.playerId ? 'lod0' : userData.lod.resolve(projectedPx);
        userData.updateLod(lodLevel);
      }
      // Local shadow-map caster membership: only nearby LOD0 (and the player) enter the
      // directional depth pass. Far / low-LOD roots keep receiveShadow + contact shadows.
      if (entity.type === 'ship' || entity.type === 'station') {
        if (syncShadowCasterPolicy(mesh, lodLevel, this._shadowPolicyOptions(entity, mesh))) {
          shadowPolicyRefreshes++;
          noteShadowPolicyChanged(this._shadowReceiverTally, true);
          this._markShadowReceiversDirty();
        }
      }

      const visibilityChanged = !(!posed && protectedRoot)
        && applyEntityMeshVisibility(mesh, shouldSubmitEntityMesh({
          isPlayer,
          forceRender,
          neverCull,
          hidden: false,
          middleBand: viewBand === 'middle',
          type: entity.type,
          projectedPx,
          allowShadowCast: false,
          snapshotMissing: !posed,
          pipelinesPending: !!(mesh.userData && mesh.userData.pipelinesPending),
          activityFrame: this._activityFrame,
          entityId,
          presentationTier: entity.activity && entity.activity.presentationTier,
        }));
      if (visibilityChanged) this._persistentSubmitLanes.markDirty(entityId, 'visibility');
      if ((entity.type === 'ship' || entity.type === 'station')
          && noteRealtimeShadowCasterPose(mesh, {
            visualRadius: lodRadius,
            extent: this._shadowOrthoExtent,
            mapSize: this._keyLight?.shadow?.mapSize?.x,
          })) {
        this._shadowMapDirty = true;
      }

      classifyRenderEntity(this._entityFrame, entity, mesh, false);
      fullSynced++;

      // Visible interactive and hero roots retain their authored per-frame presentation closures.
      // Distant LOD2 traffic is a speck: runtime/damage closures cannot change a readable pixel.
      // Off-screen runway (middle band) keeps poses every frame but refreshes closures on cadence.
      const farSpeck = lodLevel === 'lod2' && entity.id !== this.state.playerId;
      if (runClosures && !farSpeck && userData.updateRuntimeState) userData.updateRuntimeState(entity, now);
      if (entity.id === this.state.playerId && this._livingHullPresentation) {
        this._livingHullPresentation.sync(
          entity.data && entity.data.livingHull,
          this.state.simTime,
          entity,
        );
      }
      if (runClosures && !farSpeck && userData.updateWorldSitePresentation) {
        userData.updateWorldSitePresentation(entity, this.state.simTime, _worldSiteA11y);
      }
      if (runClosures && userData.updateDamageState) {
        const stamp = `${entity.hull}|${entity.shield}|${entity.alive}`;
        if (stamp !== userData._damageVisualStamp) {
          userData._damageVisualStamp = stamp;
          userData.updateDamageState(entity, now);
        }
      }
      if (runClosures && userData.updateDriveState) userData.updateDriveState(entity, now);

      // Shield geometry is an impact response, not a permanent bubble. The flash decays each visible
      // frame and is punched up whenever the entity's shield value drops.
      const shieldBubble = userData.shieldBubble;
      if (shieldBubble) {
        const up = entity.shield > 0;
        let flash = 0;
        if (up) {
          const uniforms = shieldBubble.material.uniforms;
          const previousShield = shieldBubble.userData._prevShield != null
            ? shieldBubble.userData._prevShield
            : entity.shield;
          if (entity.shield < previousShield - 0.5) {
            uniforms.uFlash.value = Math.min(1, uniforms.uFlash.value + 0.8);
          }
          shieldBubble.userData._prevShield = entity.shield;
          const previousFlashTime = shieldBubble.userData._prevFlashT != null
            ? shieldBubble.userData._prevFlashT
            : now;
          const dt = Math.min(0.1, now - previousFlashTime);
          shieldBubble.userData._prevFlashT = now;
          uniforms.uFlash.value *= Math.pow(0.05, dt);
          flash = uniforms.uFlash.value;
        }
        const visible = shouldPresentShieldBubble(entity.shield, flash);
        if (shieldBubble.visible !== visible) shieldBubble.visible = visible;
      }

      const hlod = userData.hlod;
      if (hlod) {
        hlodDetailedVisible += Number(hlod.detailedVisible) || 0;
        hlodProxyVisible += Number(hlod.proxyVisible) || 0;
        if (hlod.swapped) hlodObjectsSwapped++;
      }
      world.clearDirty(slot);
    }

    endRenderEntityFrame(this._entityFrame);
    const diagnostics = this._entityViewDiagnostics;
    diagnostics.totalMeshes = world.boundCount;
    diagnostics.candidates = query.candidateCount;
    diagnostics.transformed = transformed;
    if (transformed === 0) this._persistentSubmitLanes.noteUnchangedFrame();
    diagnostics.fullSynced = fullSynced;
    diagnostics.culled = query.culledCount;
    diagnostics.newlyVisible = query.newlyVisibleCount;
    diagnostics.newlyHidden = query.hiddenCount;
    diagnostics.lodChecked = lodChecked;
    diagnostics.cullHalfX = Math.round(bounds.halfX);
    diagnostics.cullHalfZ = Math.round(bounds.halfZ);
    diagnostics.glassHalfX = Math.round(bounds.glassHalfX || 0);
    diagnostics.glassHalfZ = Math.round(bounds.glassHalfZ || 0);
    diagnostics.runwayWu = Math.round(bounds.runway || 0);
    diagnostics.prefetchRadius = Math.round(renderResidencyRadius(this.state, 'prefetch'));
    diagnostics.evictRadius = Math.round(renderResidencyRadius(this.state, 'evict'));
    const probeOn = !!(this.state.perfRuntime
      && (this.state.perfRuntime.hitchAttributionEnabled
        || this.state.perfRuntime.renderWorkEnabled));
    if (probeOn) {
      const tableCensus = censusTableBands(this.state.entityList, {
        glassHalfX: bounds.glassHalfX,
        glassHalfZ: bounds.glassHalfZ,
        runwayWu: bounds.runway,
        originX: this._frameMembrane && this._frameMembrane.origin
          ? this._frameMembrane.origin.x + bounds.x
          : bounds.x,
        originZ: this._frameMembrane && this._frameMembrane.origin
          ? this._frameMembrane.origin.z + bounds.z
          : bounds.z,
        playerId: this.state.playerId,
        residentIds: this._meshes,
      });
      diagnostics.tableGlass = tableCensus.glass;
      diagnostics.tableRunway = tableCensus.runway;
      diagnostics.tableBeyond = tableCensus.beyond;
      diagnostics.tableSubmitted = tableCensus.submitted;
      diagnostics.tableResident = tableCensus.resident;
    }
    this.state.render.entityViewSync = diagnostics;

    const hlodDiagnostics = this._hlodDiagnostics;
    hlodDiagnostics.hlodDetailedVisible = hlodDetailedVisible;
    hlodDiagnostics.hlodProxyVisible = hlodProxyVisible;
    hlodDiagnostics.hlodObjectsSwapped = hlodObjectsSwapped;
    hlodDiagnostics.shadowPolicyRefreshes = shadowPolicyRefreshes;
    this.state.render.hlod = hlodDiagnostics;

    const frameDiagnostics = this.state.render.entityFrame
      || (this.state.render.entityFrame = {});
    frameDiagnostics.frameId = this._entityFrame.frameId;
    frameDiagnostics.traversals = this._entityFrame.traversals;
    frameDiagnostics.entitiesVisited = this._entityFrame.entitiesVisited;
    frameDiagnostics.contactShadows = this._entityFrame.contactShadows.length;
    frameDiagnostics.shipAux = this._entityFrame.shipAux.length;
    frameDiagnostics.authored = this._entityFrame.authored.length;
    frameDiagnostics.asteroids = this._entityFrame.asteroids.length;
    if (useCpu && started) {
      this.state.perfRuntime.recordRenderWork('entityViewSync', performance.now() - started);
    }
  },

  // Hazard identity is the place itself — rocks, lighting, fog — not a stained-glass floor disc.
  _updateHazardVisuals() {
    for (const obj of this._hazardVisuals) {
      this.scene.remove(obj);
      disposeObject(obj);
    }
    this._hazardVisuals = [];
  },

  _beginSectorPaletteTransition(sector, profile = null) {
    const rig = this._sectorPaletteRig;
    if (!rig) return;
    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
    this.state.render.sectorPalette = palette;
    const lighting = (profile && profile.lighting) || null;
    // The guard must consider the authored light rig too. Two sectors can share a palette class
    // while authoring different key/fill ratios, and — more importantly — the boot sector's palette
    // is already the construction-time target, so keying only on palette identity would skip the
    // very first transition and leave the authored rig unapplied for the whole opening sector.
    if (palette === this._sectorPaletteTarget && lighting === this._sectorLightingTarget) return;

    this._sectorPaletteTarget = palette;
    this._sectorLightingTarget = lighting;
    writeRigToSectorPaletteFrame(rig.start, rig);
    writePaletteToSectorPaletteFrame(rig.target, palette, lighting);
    rig.elapsed = 0;
    rig.active = true;
    this._aimKeyLightAtSignatureHero(profile);
  },

  // Point the key light at the sector's authored signature body, and put the rim opposite it.
  //
  // The three directional lights were constructed at fixed arbitrary positions — key (60,140,40),
  // rim (-70,50,-60), fill (20,30,120) — with no relationship to anything visible. So the ship's lit
  // side and the one bright object on screen disagreed, and the frame had no readable light source:
  // exactly the "no convincing environmental key source, weak rim separation" note independent
  // review returned every round.
  //
  // The chase camera is fixed-tilt and never yaws, so screen-space direction maps to a stable world
  // direction: screen +x is world +x, and screen +y is world -z (the camera looks down +Z). The
  // authored `signatureHero.screenNdc` therefore converts directly into a light direction, which
  // keeps this data-driven — a sector that moves its landmark moves its key light with it.
  //
  // Intensities are NOT touched here; those stay owned by the authored `profile.lighting` rig and
  // its transition. Only direction changes, so the shadow camera's ortho box still frames the same
  // local action.
  _aimKeyLightAtSignatureHero(profile) {
    const rig = this._sectorPaletteRig;
    if (!rig || !rig.lights) return;
    const hero = profile && profile.background
      && profile.background.composition && profile.background.composition.signatureHero;
    const ndc = hero && Array.isArray(hero.screenNdc) ? hero.screenNdc : null;
    // No authored landmark: keep the construction-time rig rather than inventing a direction.
    if (!ndc) return;
    const nx = Number(ndc[0]) || 0;
    const ny = Number(ndc[1]) || 0;
    const KEY_DIST = 160;
    const KEY_HEIGHT = 96;
    // Light POSITION is the direction light arrives FROM, so place it on the landmark's side.
    //
    // The offset is STORED, not just applied: _updateShadowFollow re-places the key light every
    // frame so the shadow ortho box tracks the player, and it used to do that with a literal
    // (60,140,40). Writing the position here alone was silently reverted on the next frame.
    this._keyLightOffset = { x: nx * KEY_DIST, y: KEY_HEIGHT, z: -ny * KEY_DIST };
    this._shadowMapDirty = true;
    rig.lights.key.position.set(nx * KEY_DIST, KEY_HEIGHT, -ny * KEY_DIST);
    // Rim sits opposite and lower, so hulls get a cool separating edge away from the key.
    rig.lights.rim.position.set(-nx * KEY_DIST * 0.9, KEY_HEIGHT * 0.45, ny * KEY_DIST * 0.9);
    // Fill becomes PLANET BOUNCE rather than a generic frontal lift.
    //
    // Review reports the ship as "dim" in every round. The cause is not too little key — it is that
    // `ambient` is authored at 0.15 for true-black space, so nothing lifts the shadow side, and the
    // one enormous lit body on screen throws no light back. A gas giant filling that much of the
    // frame is physically a huge bounce card. Placing fill on the LANDMARK side but low and wide
    // (rather than frontal) makes the shadowed hull pick up the planet instead of going to black,
    // which is also review's "colored atmospheric fill" note — the fill takes the sector palette's
    // fill hue, so a warm giant bounces warm and an ice body bounces cold.
    rig.lights.fill.position.set(nx * KEY_DIST * 0.7, -KEY_HEIGHT * 0.18, -ny * KEY_DIST * 0.7);
  },

  _updateSectorPaletteTransition(frameDt) {
    const rig = this._sectorPaletteRig;
    if (!rig || !rig.active) return;
    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
    const t = rawT * rawT * (3 - 2 * rawT);
    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
    if (rawT >= 1) {
      rig.active = false;
      applySectorPaletteFrame(rig, rig.target);
    }
  },

  _syncAuthoredInstanceSubmission(shadowRadius) {
    const options = this._authoredInstanceSyncOptions;
    options.camera = this.cam.obj;
    options.entityFrame = this._entityFrame;
    options.authoredRecords = this._entityFrame.authored;
    options.playerX = 0;
    options.playerZ = 0;
    options.castRadiusSq = shadowRadius * shadowRadius;
    options.castRadius = shadowRadius;
    options.consolidateOpaqueBatches = this._opaqueBatchEnabled === true;
    const camState = this.state && this.state.camera || {};
    const camObj = this.cam && this.cam.obj;
    options.liveZoom = Number.isFinite(camState.liveZoom) ? camState.liveZoom : NaN;
    options.zoom = Number.isFinite(camState.zoom) ? camState.zoom : NaN;
    options.tilt = Number.isFinite(camState.tilt) ? camState.tilt : 60;
    options.fov = camObj && Number.isFinite(camObj.fov) ? camObj.fov
      : (Number.isFinite(camState.fov) ? camState.fov : 90);
    options.aspect = camObj && Number.isFinite(camObj.aspect) && camObj.aspect > 0
      ? camObj.aspect
      : 16 / 9;
    const player = this.state.playerId
      ? (this.state.entities && this.state.entities.get(this.state.playerId))
      : null;
    if (player && player.pos && this._frameMembrane) {
      const local = this._frameMembrane.toLocal(player.pos, _shadowLocalXZ);
      options.playerX = local.x;
      options.playerZ = local.z;
    }
    return syncAuthoredInstancePools(this.scene, options);
  },

  _syncAsteroidInstanceSubmission(shadowCamera) {
    const options = this._asteroidInstanceSyncOptions;
    options.camera = this.cam.obj;
    options.shadowCamera = shadowCamera || null;
    options.records = this._entityFrame.asteroids;
    options.recordsDirty = this._presentationWorld.consumeAsteroidDirty();
    const result = syncAsteroidInstancePool(this._asteroidInstancePool, options);
    if (result?.matrixUploads > 0) this._shadowMapDirty = true;
    if (this.state && this.state.render) this.state.render.asteroidInstancePool = result;
    return result;
  },

  /**
   * Publish the render-only state that the first flight picture will use while the loading shell
   * still owns the canvas. This deliberately advances neither simulation time nor a presentation
   * frame: it consumes the already-published mirror, packs its current pose into the fence, applies
   * the final activity/visibility decision, and refreshes matrices for exact camera admission.
   */
  _publishOpeningFirstPicture() {
    const state = this.state;
    const publication = this._presentationPublisher && typeof this._presentationPublisher.consume === 'function'
      ? this._presentationPublisher.consume()
      : null;
    if (publication && publication.rebuilt) this._rebindPresentationMeshes();
    else if (publication) this._bindPublishedPresentationMeshes(publication);

    if (this._snapshotFence && this._presentationWorld) {
      const packed = packPresentationWorldToFence(
        this._presentationWorld,
        this._snapshotFence,
        state && state.simTime,
      );
      this._snapshotSourceTick = state && Number.isInteger(state.tick) ? state.tick : 0;
      if (state && state.render) {
        state.render.snapshotFence = {
          sequence: this._snapshotFence.sequence,
          packed,
        };
      }
    }

    const activityTick = state && Number.isInteger(state.tick) ? state.tick : -1;
    const frame = getActivityFrame(state);
    this._activityFrame = frame ? { ...frame, complete: true } : null;
    this._activityFrameTick = activityTick;
    if (state && state.render) state.render.activityFrame = this._activityFrame;
    if (this._contextLost) return false;

    // Establish the exact chase camera before visibility classification. The normal frame path
    // follows the camera after entity sync because both are already settled in flight; this one
    // loading-to-flight boundary cannot use the stale loading camera to cull and then freeze a
    // different final camera picture.
    if (this.cam && typeof this.cam.follow === 'function') this.cam.follow(0);
    // This is the same pose/visibility seam as prepareFrame(), intentionally without residency
    // service, background clocks, or any simulation advance. The loading DOM remains the only
    // visible surface; drawPreparedFrame() still refuses to submit while mode=loading.
    this.syncEntityViews(1);
    if (state && state.render) state.render.interpolationAlpha = 1;
    if (state && state.render && typeof state.render.prepareOpeningVfxFrame === 'function') {
      state.render.prepareOpeningVfxFrame();
    }
    if (this.scene && typeof this.scene.updateMatrixWorld === 'function') {
      this.scene.updateMatrixWorld(true);
    }
    syncContactShadowPool(this._contactShadowPool, this._entityFrame);
    syncShipAuxPools(this._shipAuxPool, this._entityFrame);
    const openingShadowRadius = liveShadowCastRadius(state);
    this._frameShadowCastRadius = openingShadowRadius;
    this._syncAuthoredInstanceSubmission(openingShadowRadius);
    this._syncShadowMapEnabled();
    if (this._syncKeyLightShadowFrustum(openingShadowRadius)) this._shadowMapDirty = true;
    if (this._updateShadowFollow(true)) this._shadowMapDirty = true;
    if (this._keyLight && this._keyLight.shadow && this.renderer && this.renderer.shadowMap) {
      const shadowMapActive = this.renderer.shadowMap.enabled === true
        && this._keyLight.castShadow === true;
      this._keyLight.shadow.autoUpdate = false;
      this._keyLight.shadow.needsUpdate = shadowMapActive;
      this._shadowRefreshScheduled = shadowMapActive;
      this._activeShadowCamera = shadowMapActive
        ? prepareActiveShadowCamera(this.renderer, this._keyLight)
        : null;
    }
    this._syncAsteroidInstanceSubmission(this._activeShadowCamera);
    if (this.scene && typeof this.scene.updateMatrixWorld === 'function') {
      this.scene.updateMatrixWorld(true);
    }
    return true;
  },

  _openingFirstPictureUpgradePromises() {
    const state = this.state;
    const camera = openingSubmissionCamera(this.cam && this.cam.obj);
    if (!camera || !this.scene || !this._meshes) return null;
    const entities = state && state.entities;
    const pending = new Set();
    for (const [id, root] of this._meshes) {
      const entity = entities && typeof entities.get === 'function' ? entities.get(id) : null;
      if (!entity || entity.alive === false || entity._noMesh) continue;
      if (!openingEntityRootIntersectsCamera(root, entity, camera, this.scene)) continue;
      const userData = root.userData || {};
      const status = userData.authoredAssetState;
      const settled = status === 'authored'
        || status === 'authored-with-cleanup-error'
        || status === 'authored-prepared'
        || status === 'same-semantic-fallback-prepared'
        || status === 'shell-ready'
        || status === 'unavailable'
        || status === 'procedural-settled'
        || status === 'fallback-after-error'
        || status === 'cancelled-before-load'
        || status === 'orphaned-before-swap'
        || status === 'orphaned-after-pipeline-compile';
      let completion = userData.authoredUpgradePromise;
      const lodTransition = userData.wholeShipLodTransitionPromise;
      // The base promise is deliberately retained on the boundary for diagnostics and duplicate
      // request suppression, so its mere presence does not mean work is still live once the
      // authored state has settled. LOD replacement has its own identity-cleared in-flight promise.
      if (!settled) {
        if (!completion && typeof userData.requestAuthoredUpgrade === 'function') {
          completion = requestAuthoredUpgrade(root, this.renderer, this.scene);
        }
        if (completion && typeof completion.then === 'function') pending.add(completion);
      }
      if (lodTransition && typeof lodTransition.then === 'function') pending.add(lodTransition);
    }
    return [...pending];
  },

  /**
   * Final startup barrier for New Game and Continue. Authored boundary jobs are allowed to stage
   * behind loading, but a camera-visible boundary cannot swap its fallback/payload after the exact
   * producer census is frozen. Hidden, offscreen, unmounted, and deferred roots never enter this
   * wait set and remain on the normal streaming runway.
   */
  async prepareOpeningFirstPicture(timeoutMs = 20000) {
    const waitMs = Math.max(1, Number(timeoutMs) || 20000);
    const started = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const deadline = started + waitMs;
    const previousDefer = this._deferNoncriticalMeshStreaming === true;
    const previousRenderDefer = this.state && this.state.render
      ? this.state.render.deferNoncriticalMeshStreaming === true
      : false;
    let succeeded = false;
    // Freeze the render-owned root set at the same boundary as the exact census. Existing visible
    // roots may finish their authored child swap below; no new residency/build pass can introduce a
    // different root after capture and before the first draw.
    this._deferNoncriticalMeshStreaming = true;
    if (this.state && this.state.render) this.state.render.deferNoncriticalMeshStreaming = true;
    this._openingFirstPicturePrepared = true;
    try {
      for (let pass = 0; pass < 8; pass++) {
        if (!this._publishOpeningFirstPicture()) {
          throw new Error('opening first-picture render publication unavailable');
        }
        const pending = this._openingFirstPictureUpgradePromises();
        if (pending === null) throw new Error('opening first-picture camera unavailable');
        if (pending.length === 0) {
          // Re-publish once after the final boundary settles so the exact census sees the committed
          // authored leaves rather than the pre-swap fallback children.
          if (!this._publishOpeningFirstPicture()) {
            throw new Error('opening first-picture final publication unavailable');
          }
          const late = this._openingFirstPictureUpgradePromises();
          if (late === null) throw new Error('opening first-picture camera unavailable');
          if (late.length === 0) {
            freezeOpeningGraphPublication(this);
            succeeded = true;
            return true;
          }
          pending.push(...late);
        }
        const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
        const remaining = deadline - now;
        if (!(remaining > 0)) throw new Error('opening first-picture preparation timed out');
        const settled = await Promise.race([
          Promise.all(pending),
          new Promise((resolve) => setTimeout(() => resolve(null), remaining)),
        ]);
        if (settled === null) throw new Error('opening first-picture preparation timed out');
      }
      throw new Error('opening first-picture boundary did not settle');
    } finally {
      if (!succeeded) {
        this._deferNoncriticalMeshStreaming = previousDefer;
        if (this.state && this.state.render) {
          this.state.render.deferNoncriticalMeshStreaming = previousRenderDefer;
        }
        this._openingFirstPicturePrepared = false;
        this._activityFrame = null;
        this._activityFrameTick = null;
        if (this.state && this.state.render) this.state.render.activityFrame = null;
      }
    }
  },

  prepareFrame(alpha, frameDt, presentationFrame = null) {
    this._presentationFrame = presentationFrame;
    // Publication is consumed before any context-loss early return. PresentationRunner acknowledges
    // the range after renderUpdate succeeds, so the dense mirror must not miss that same range merely
    // because the GPU is temporarily unavailable.
    const publication = this._presentationPublisher.consume(presentationFrame);
    if (publication.rebuilt) this._rebindPresentationMeshes();
    else this._bindPublishedPresentationMeshes(publication);
    // PresentationRunner publishes a caller-owned completed-tick record, not the tick number
    // itself. Its sequence is the immutable simulation publication boundary; falling back to the
    // live state tick is only for the legacy/no-runner path.
    const completedPublication = presentationFrame && presentationFrame.completedTick;
    const completedTick = completedPublication && Number.isInteger(completedPublication.sequence)
      ? completedPublication.sequence
      : (completedPublication && Number.isInteger(completedPublication.tick)
        ? completedPublication.tick
        : (this.state && Number.isInteger(this.state.tick) ? this.state.tick : 0));
    const snapshotNeedsPack = this._snapshotFence && this._presentationWorld
      && (this._snapshotSourceTick !== completedTick
        || this._snapshotFence.packCount === 0
        || publication.rebuilt === true
        || publication.applied > 0);
    if (snapshotNeedsPack) {
      const packed = packPresentationWorldToFence(
        this._presentationWorld,
        this._snapshotFence,
        this.state && this.state.simTime,
      );
      this._snapshotSourceTick = completedTick;
      if (this.state && this.state.render) {
        this.state.render.snapshotFence = {
          sequence: this._snapshotFence.sequence,
          packed,
        };
      }
    }
    // While the GL context is lost, the renderer can't draw — skip all remaining per-frame work until
    // webglcontextrestored rebuilds GPU resources. The derived publication mirror remains current.
    if (this._contextLost) return false;
    // Attribution CPU timer — opt-in only (perfRuntime.renderWorkEnabled default false).
    const perf = this.state && this.state.perfRuntime;
    const useCpu = !!(perf && perf.renderWorkEnabled && typeof perf.recordRenderWork === 'function');
    const t0 = useCpu ? performance.now() : 0;
    // M2: observe frameOriginSeq before any global→local projection this frame.
    // On change, reproject cached local meshes/camera/VFX by delta (entities stay galactic-global).
    if (this._frameMembrane) {
      const rebase = this._frameMembrane.sync(this.state);
      if (rebase.changed) this._applyFrameOriginRebase(rebase.dx, rebase.dz);
    }
    // Dynamic resolution: measure real frame time and nudge the internal render scale to hold a smooth
    // framerate on weak/software GPUs (adaptiveQuality.js). Cheap; only resizes targets on a change.
    if (this._adaptive) this._adaptive.update(frameDt);
    // Existing neighbour-sector entities do not emit a spawn event when the player simply flies
    // toward them. The low-frequency poll keeps the same runway/hysteresis while avoiding the full
    // event-recovery scan and redundant presentation rebinding during ordinary settled flight.
    const activityTick = this.state && Number.isInteger(this.state.tick) ? this.state.tick : -1;
    if (this.state && this.state.mode !== 'flight' && !this._openingFirstPicturePrepared) {
      // Loading may replace the entity table while retaining IDs and a saved tick. Classification
      // is a flight authority; publishing it here would turn optional restored actors into false
      // startup blockers before their authored admission queue can run.
      this._activityFrame = null;
      this._activityFrameTick = null;
      if (this.state.render) this.state.render.activityFrame = null;
    } else if (this._activityFrameTick !== activityTick
        || (this._openingFirstPicturePrepared && this.state.mode !== 'flight')) {
      const frame = getActivityFrame(this.state);
      this._activityFrame = frame ? { ...frame, complete: true } : null;
      this._activityFrameTick = activityTick;
      if (this.state && this.state.render) this.state.render.activityFrame = this._activityFrame;
    }
    serviceRenderMeshResidency(this, frameDt);
    const holdOpeningPicture = this._openingFirstPicturePrepared === true
      && this.state && this.state.mode === 'flight'
      && !Number.isFinite(this.state.render && this.state.render.firstPlayableFrameAt);
    if (!holdOpeningPicture) {
      updateShipPitchPresentation(this.state, frameDt);
      this.syncEntityViews(alpha);
      if (this.state && this.state.render) this.state.render.interpolationAlpha = alpha;
      if (this.cam && typeof this.cam.follow === 'function') this.cam.follow(frameDt);
    } else if (this.state && this.state.render) {
      // prepareOpeningFirstPicture already published the exact final pose, visibility, camera, and
      // LOD graph. Preserve that immutable composition through its first submit; re-running the
      // ordinary flight selector here can start a new async LOD child replacement after the census.
      // Simulation remains authoritative and continues; only its next presentation is delayed until
      // the first paint releases the opening latch below.
      this.state.render.interpolationAlpha = 1;
    }
    if (!holdOpeningPicture) {
      syncContactShadowPool(this._contactShadowPool, this._entityFrame);
      syncShipAuxPools(this._shipAuxPool, this._entityFrame);
    }
    const shadowRadius = Number.isFinite(this._frameShadowCastRadius)
      ? this._frameShadowCastRadius
      : liveShadowCastRadius(this.state);
    this._frameShadowCastRadius = shadowRadius;
    if (!holdOpeningPicture) this._syncAuthoredInstanceSubmission(shadowRadius);
    // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
    this._updateSectorPostTransition(frameDt);
    this._updateSectorPaletteTransition(frameDt);
    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
    this._bgTime = (this._bgTime || 0) + frameDt * ts;
    if (!holdOpeningPicture) {
      if (this.spaceBg && this.spaceBg.update) this.spaceBg.update(frameDt, this._bgTime, this.cam.obj.position);
      parallaxLayers.update(frameDt);
    }
    this._syncShadowMapEnabled();
    if (this._syncKeyLightShadowFrustum(shadowRadius)) this._shadowMapDirty = true;
    const shadowFollowChanged = this._updateShadowFollow(false);
    if (this._keyLight && this._keyLight.shadow && this.renderer && this.renderer.shadowMap) {
      const refreshWasPending = this._shadowRefreshScheduled === true;
      const shadowMapActive = this.renderer.shadowMap.enabled === true
        && this._keyLight.castShadow === true;
      const dirty = shadowMapActive && (
        this._shadowMapDirty !== false
        || shadowFollowChanged
        || this._shadowRefreshScheduled === true
      );
      const refreshShadow = shouldRefreshRealtimeShadowMap({
        lastPresentDtMs: this.state && this.state.render && this.state.render.lastPresentDtMs,
        skippedLast: this._shadowPresentSkipped === true || refreshWasPending,
        dirty,
      });
      this._keyLight.shadow.autoUpdate = false;
      this._keyLight.shadow.needsUpdate = shadowMapActive && refreshShadow;
      this._shadowRefreshScheduled = shadowMapActive && refreshShadow;
      this._shadowPresentSkipped = dirty && !refreshShadow;
      if (this._shadowRefreshScheduled) this._updateShadowFollow(true);
      if (!shadowMapActive) this._activeShadowCamera = null;
    }
    // Shadow follow (graphics spec G): keep the key light's shadow frustum centered on the player
    // so the tight 1400-unit ortho box always covers the local action. DirectionalLight position is
    // an offset from its target; we move both together. No-op unless the shadow map will render.
    if (this._shadowRefreshScheduled) {
      this._activeShadowCamera = prepareActiveShadowCamera(this.renderer, this._keyLight);
    }
    const shadowCamera = this._activeShadowCamera || null;
    if (!holdOpeningPicture) this._syncAsteroidInstanceSubmission(shadowCamera);
    // Collision/socket/landing debug overlay (spec §12.5). Repositions pooled markers over the live
    // meshes once per frame; a cheap no-op when off (the group is hidden + nothing iterates).
      if (this.collisionDebug && this.collisionDebug.on) this.collisionDebug.update();
    if (useCpu) perf.recordRenderWork('prepareFrame', performance.now() - t0);
    return true;
  },

  drawPreparedFrame() {
    if (isWebGlContextUnavailable(this._contextLost, this.renderer)) return false;
    // The DOM loading shell completely covers the canvas. Drawing the hidden world here used to
    // trigger the entire first texture/shader upload during a progress yield, freezing that shell
    // for 5-8 seconds on SwiftShader and low-end drivers.
    if (this.state.mode === 'loading') return false;
    // Entity roots may spawn/rebuild and VFX events may fire between render updates;
    // reassert diagnostic owner seams immediately before draw so nothing leaks a frame.
    try { this.state?.render?.perfEntityIsolation?.reassert?.(); } catch (_) { /* diagnostic only */ }
    try { this.state?.render?.perfVfxIsolation?.reassert?.(); } catch (_) { /* diagnostic only */ }
    // Attribution timers: CPU via recordRenderWork only when renderWorkEnabled (default OFF).
    // GPU queries only when gpuTimers.enabled — and never nested: bloom pass groups own GPU
    // spans on the bloom path; the outer drawPreparedFrame GPU span is only for renderGraph/straight.
    const perf = this.state && this.state.perfRuntime;
    const gpu = this._gpuTimers;
    const useCpu = !!(perf && perf.renderWorkEnabled && typeof perf.recordRenderWork === 'function');
    const useGpu = gpu && gpu.enabled && typeof gpu.begin === 'function';
    if (perf && typeof perf.beginRenderFrame === 'function') perf.beginRenderFrame(this.state.tick);
    let frameOrigin = null;
    if (perf && typeof perf.readFrameIdentity === 'function') {
      this._perfFrameOrigin = this._perfFrameOrigin || {};
      frameOrigin = perf.readFrameIdentity(this._perfFrameOrigin);
    }
    const gpuOrigin = useGpu ? frameOrigin : null;
    this._gpuFrameOrigin = gpuOrigin;
    const t0 = useCpu ? performance.now() : 0;
    // Post options sync on settings:changed, init, context restore, and render-graph creation —
    // not every draw (video settings are event-driven).
    // Render path selection (INTEGRATION_MAP §8.1). The SpaceRenderGraph is a capability-aware HDR
    // pipeline (GTAO-lite ambient occlusion + multiscale bloom + ACES/grade composite) that
    // supersedes the monolithic bloom wrapper. It is opt-in behind settings.video.renderGraph so the
    // proven bloom path stays the default; the render graph module is no longer tree-shaken because
    // it is reachable from this live branch. The energy materials I wired write HDR radiance that the
    // render graph composites with contact-depth AO.
    const postFrameToken = frameOrigin ? beginPostRenderTargetFrameOrigin(frameOrigin) : 0;
    let dynamicBufferEpoch = null;
    let disposeRegistrationProbe = null;
    try {
      dynamicBufferEpoch = this._dynamicBuffers.arm();
      disposeRegistrationProbe = beginAuthoredInstanceMeshDisposeRegistrationProbe(
        this.scene,
        this.renderer,
      );
      const postRoute = this._selectPostRoute();
      this._lastRenderPath = postRoute;
      // The first visible submission has a hard pre-submit identity gate.  Exact compile has
      // already populated the driver program census in the loading phase; this check now covers
      // the final prepared graph (geometry, textures, shadows, and any program cache drift) before
      // the post route can submit a single draw.  A later post-submit check still records driver
      // variants that a backend lazily creates during the actual draw, but it cannot pretend to
      // have prevented those variants.
      const openingFirstDraw = this.state.mode === 'flight'
        && !Number.isFinite(
          this.state.render && this.state.render.openingSubmissionFirstDrawSubmittedAt,
        );
      if (openingFirstDraw) {
        const receipt = this.state.render && this.state.render.openingSubmissionReceipt;
        const preSubmitValidation = receipt
          ? validateOpeningSubmissionReceipt(receipt, this.renderer)
          : {
            ok: false,
            reason: 'missing-opening-submission-receipt',
            uncaptured: ['plan'],
          };
        this.state.render.openingSubmissionPreSubmitValidation = preSubmitValidation;
        if (!preSubmitValidation.ok) {
          this.state.render.openingSubmissionValidation = preSubmitValidation;
          const failure = {
            reason: preSubmitValidation.reason || null,
            uncaptured: preSubmitValidation.uncaptured || [],
            uncapturedProgramKeys: preSubmitValidation.uncapturedProgramKeys || [],
            uncapturedGeometryBufferIds: preSubmitValidation.uncapturedGeometryBufferIds || [],
            uncapturedTextureIds: preSubmitValidation.uncapturedTextureIds || [],
            uncapturedShadowResourceIds: preSubmitValidation.uncapturedShadowResourceIds || [],
            missingProgramKeys: preSubmitValidation.missingProgramKeys || [],
            missingGeometryBufferIds: preSubmitValidation.missingGeometryBufferIds || [],
            missingTextureIds: preSubmitValidation.missingTextureIds || [],
            missingShadowResourceIds: preSubmitValidation.missingShadowResourceIds || [],
          };
          console.error(`[render] opening submission pre-submit gate failed closed ${JSON.stringify(failure)}`);
          return false;
        }
      }
      // Bloom owns exact pass timers internally. Graph/native have no nested pass timer owner, so
      // retain the existing outer measurement only for those routes.
      const gpuQueryBegan = postRoute !== POST_PROCESS_ROUTE.BLOOM
        && !!(useGpu && gpu.begin('drawPreparedFrame', gpuOrigin));
      try {
        this._renderPostRoute(postRoute, this.scene, this.cam.obj, this._bgTime || 0);
        if (this._shadowRefreshScheduled === true) {
          this._shadowMapDirty = false;
          this._shadowRefreshScheduled = false;
        }
      } finally {
        if (gpuQueryBegan) gpu.end();
      }
    } finally {
      endAuthoredInstanceMeshDisposeRegistrationProbe(disposeRegistrationProbe);
      if (dynamicBufferEpoch !== null) this._dynamicBuffers.disarm(dynamicBufferEpoch);
      if (postFrameToken) endPostRenderTargetFrameOrigin(postFrameToken);
    }
    if (this.state.mode === 'flight'
        && !this.state.render.openingSubmissionValidation
        && this.state.render.openingSubmissionReceipt) {
      const validation = validateOpeningSubmissionReceipt(
        this.state.render.openingSubmissionReceipt,
        this.renderer,
      );
      this.state.render.openingSubmissionValidation = validation;
      if (!validation.ok) {
        // This is the post-submit diagnostic for lazy driver variants created by the backend during
        // the draw. The pre-submit gate already prevented known uncaptured graph identities; retain
        // this delta as evidence and do not release the opening cohort.
        console.error('[render] opening submission post-submit validation failed', validation);
        this.state.render.openingSubmissionLateInstancedPbr = describeOpeningInstancedPbrLeaves(
          this.scene,
          this.state.render.openingSubmissionPlan,
        );
      } else if (!Number.isFinite(this.state.render.openingSubmissionFirstDrawSubmittedAt)) {
        this.state.render.openingSubmissionFirstDrawSubmittedAt = typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
      }
    }
    if (useCpu) perf.recordRenderWork('drawPreparedFrame', performance.now() - t0);
    if (this.state.mode === 'flight'
        && !Number.isFinite(this.state.render.firstPlayableFrameAt)
        && !this._firstPlayablePaintScheduled) {
      this._firstPlayablePaintScheduled = true;
      afterBrowserPaint(() => {
        try {
          if (this.state.mode === 'flight'
              && this.state.render.openingSubmissionValidation?.ok !== false) {
            this.state.render.firstPlayableFrameAt = typeof performance !== 'undefined'
              ? performance.now()
              : Date.now();
          } else if (this.state.render.openingSubmissionValidation?.ok === false) {
            return;
          }
        } finally {
          if (this.state.render.openingSubmissionValidation?.ok !== false) {
            releaseOpeningMeshDefer(this, this.state.mode);
            if (typeof this.state.render.resumeDeferredPipelineAdmissions === 'function') {
              void this.state.render.resumeDeferredPipelineAdmissions();
            }
          }
        }
      });
    }
    return true;
  },

  renderFrame(alpha, frameDt, presentationFrame = null) {
    if (!this.prepareFrame(alpha, frameDt, presentationFrame)) return;
    this.drawPreparedFrame();
  },

  // Center the key light + its shadow camera on the player each frame. The light direction stays
  // fixed (60,140,40 offset); only the origin translates so shadows track the player across the
  // sector instead of being pinned to world (0,0,0) and clipping at the frustum edge.
  _updateShadowFollow(commit = true) {
    if (!this._keyLight) return false;
    if (!this.renderer.shadowMap || !this.renderer.shadowMap.enabled) return false;
    const p = this.state.playerId ? (this.state.entities && this.state.entities.get(this.state.playerId)) : null;
    let px = 0;
    let pz = 0;
    if (p && p.pos && this._frameMembrane) {
      const local = this._frameMembrane.toLocal(p.pos, _shadowLocalXZ);
      px = local.x;
      pz = local.z;
    }
    // Offset comes from _aimKeyLightAtSignatureHero when the sector authors a signature landmark,
    // so shadow-follow preserves the landmark-derived light direction instead of forcing the old
    // literal back every frame. Falls back to the original constant when nothing is authored.
    const off = this._keyLightOffset;
    const ox = off ? off.x : 60;
    const oy = off ? off.y : 140;
    const oz = off ? off.z : 40;
    const texel = shadowTexelWorldSize(
      this._shadowOrthoExtent,
      this._keyLight.shadow?.mapSize?.x,
    );
    px = Math.round(px / texel) * texel;
    pz = Math.round(pz / texel) * texel;
    const followKey = `${px}|${pz}|${ox}|${oy}|${oz}`;
    if (this._shadowFollowKey === followKey) return false;
    if (commit !== true) return true;
    this._shadowFollowKey = followKey;
    this._keyLight.position.set(px + ox, oy, pz + oz);
    this._keyLight.target.position.set(px, 0, pz);
    return true;
  },

  /**
   * Local directional shadow-map membership for one ship/station root. Shadows stay enabled
   * globally; only casters outside the local ortho / low LOD drop out of the depth pass.
   */
  _shadowPolicyOptions(entity, mesh) {
    const lodLevel = mesh && mesh.userData && mesh.userData.lod
      ? mesh.userData.lod.level
      : 'lod0';
    if (!entity) return { allowCast: true };
    const isPlayer = entity.id === this.state.playerId;
    if (isPlayer) return { allowCast: true };
    let playerLocalX = 0;
    let playerLocalZ = 0;
    const player = this.state.playerId
      ? (this.state.entities && this.state.entities.get(this.state.playerId))
      : null;
    if (player && player.pos && this._frameMembrane) {
      const local = this._frameMembrane.toLocal(player.pos, _shadowLocalXZ);
      playerLocalX = local.x;
      playerLocalZ = local.z;
    }
    const axisDistance = shadowCastAxisDistance(
      mesh && mesh.position,
      playerLocalX,
      playerLocalZ,
    );
    const castRadius = Number.isFinite(this._frameShadowCastRadius)
      ? this._frameShadowCastRadius
      : liveShadowCastRadius(this.state);
    return {
      allowCast: allowRealtimeShadowCast({
        isPlayer,
        lodLevel,
        axisDistance,
        castRadius,
      }),
    };
  },

  _noteShadowMeshAdded(root) {
    if (this._shadowReceiverTally) this._shadowReceiverTally.noteAdded(root);
    else this._shadowReceiversDirty = true;
  },

  _noteShadowMeshRemoved(root) {
    if (this._shadowReceiverTally) this._shadowReceiverTally.noteRemoved(root);
    else this._shadowReceiversDirty = true;
  },

  _markShadowReceiversDirty() {
    this._shadowReceiversDirty = true;
    this._shadowMapDirty = true;
    if (this._shadowReceiverTally) this._shadowReceiverTally.markDirty();
  },

  _syncShadowMapEnabled() {
    if (!this._keyLight || !this.renderer.shadowMap) return;
    if (!this._shadowSettingOn) {
      this.renderer.shadowMap.enabled = false;
      this._keyLight.castShadow = false;
      return;
    }
    if (this._shadowReceiverTally) {
      if (this._shadowReceiversDirty || this._shadowReceiverTally.dirty) {
        this._shadowReceiverCount = this._shadowReceiverTally.resolve(this.scene, {
          force: this._shadowReceiversDirty === true,
        });
        this._shadowReceiversDirty = false;
      } else {
        this._shadowReceiverCount = this._shadowReceiverTally.count;
      }
    } else if (this._shadowReceiversDirty) {
      let receivers = 0;
      this.scene.traverse((o) => { if (o && o.receiveShadow) receivers++; });
      this._shadowReceiverCount = receivers;
      this._shadowReceiversDirty = false;
    }
    const enabled = this._shadowReceiverCount > 0;
    this.renderer.shadowMap.enabled = enabled;
    this._keyLight.castShadow = enabled;
  },

  _syncKeyLightShadowFrustum(radius) {
    const key = this._keyLight;
    if (!key || !key.shadow || !key.shadow.camera) return false;
    const numeric = Number(radius);
    const extent = Math.max(
      80,
      Math.min(SHADOW_ORTHO_EXTENT, Math.round(Number.isFinite(numeric) ? numeric : SHADOW_ORTHO_EXTENT)),
    );
    if (this._shadowOrthoExtent === extent) return false;
    const camera = key.shadow.camera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    this._shadowOrthoExtent = extent;
    return true;
  },

  _ensureKeyLightShadows() {
    const key = this._keyLight;
    const renderer = this.renderer;
    if (!key || !renderer || !renderer.shadowMap) return false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if (!key.userData.spacefaceShadowConfigured) {
      key.castShadow = false;
      key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      const camera = key.shadow.camera;
      camera.near = 10; camera.far = 600;
      camera.left = -SHADOW_ORTHO_EXTENT; camera.right = SHADOW_ORTHO_EXTENT;
      camera.top = SHADOW_ORTHO_EXTENT; camera.bottom = -SHADOW_ORTHO_EXTENT;
      camera.updateProjectionMatrix();
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.04;
      if (key.target && !key.target.parent && this.scene) this.scene.add(key.target);
      key.userData.spacefaceShadowConfigured = true;
      this._shadowOrthoExtent = SHADOW_ORTHO_EXTENT;
      this._shadowMapDirty = true;
    }
    if (!this._shadowSettingOn) {
      renderer.shadowMap.enabled = false;
      key.castShadow = false;
    }
    return true;
  },

  // Projection reads camera.matrixWorldInverse, and THREE.Camera#updateMatrixWorld rebuilds that
  // inverse (a decompose plus a 4x4 invert) on EVERY call, dirty or not. The chase camera is posed
  // once per frame by cam.follow() in prepareFrame, yet the flight HUD projects ~7 points per frame
  // (selected-target marker, reticle centre + edge, the lead-pip pair, the projected-stop pair, the
  // waypoint marker) and every one of them redid the inverse for a camera that had not moved.
  //
  // The guard deliberately does NOT hang off a frame-lifecycle flag: worldToScreen is exposed through
  // ctx.helpers and is also called from input paths outside the render frame, where a "already
  // refreshed this frame" flag can go stale and silently project against a wrong camera. Instead it is
  // self-validating — cache the decomposed transform and refresh only when it demonstrably differs.
  // Ten float compares replace the compose + inverse.
  //
  // COVERED: camera translation/rotation/scale (cam.follow, shake, reprojectFrame), a swapped camera
  // object, reparenting (parent identity — a new parent changes matrixWorld with the local transform
  // untouched, and Object3D#add does not flag the child), THREE's own dirty flag (updateMatrix /
  // applyMatrix4 / add / attach / remove), the r184 `pivot` offset (composes into `matrix` without
  // touching position/quaternion/scale), and hand-driven matrix modes — matrixAutoUpdate:false or
  // matrixWorldAutoUpdate:false both fall back to the unconditional refresh this replaced, so those
  // paths behave exactly as before. NaN coordinates fail every compare and therefore force a refresh.
  //
  // NEEDS NOTHING HERE: projectionMatrix is not part of matrixWorldInverse. Vector3#project reads it
  // live, updateMatrixWorld never writes it, and every FOV/near mutation site already calls
  // updateProjectionMatrix() — so an FOV slider or a resize is handled upstream, not by this guard.
  //
  // NOT COVERED, AND WAS NOT BEFORE: a moving ANCESTOR of the camera. updateMatrixWorld() walks down
  // to children and never up to parents, so the previous unconditional call was equally blind to it.
  //
  // ONE DELIBERATE BEHAVIOR CHANGE: the old unconditional call also recomposed cam.matrix from P/Q/S
  // every projection, clobbering a hand-written cam.matrix; on a cache hit that write now survives.
  // Nothing writes cam.matrix directly (camera.js/cameraDirector.js/feel.js drive the camera only via
  // position/lookAt), and renderer.render() recomposes it from P/Q/S each frame anyway, so this cannot
  // change any projection here.
  _syncProjectionCamera() {
    const cam = this.cam && this.cam.obj;
    if (!cam || !cam.position || !cam.quaternion || !cam.scale) return null;
    const pos = cam.position;
    const quat = cam.quaternion;
    const scale = cam.scale;
    const cache = this._w2sCamCache;
    if (
      cache
      && cache.cam === cam
      && cache.parent === cam.parent
      && cam.matrixWorldNeedsUpdate === false
      && cam.matrixAutoUpdate !== false
      && cam.matrixWorldAutoUpdate !== false
      && (cam.pivot === null || cam.pivot === undefined)
      && cache.px === pos.x && cache.py === pos.y && cache.pz === pos.z
      && cache.qx === quat.x && cache.qy === quat.y && cache.qz === quat.z && cache.qw === quat.w
      && cache.sx === scale.x && cache.sy === scale.y && cache.sz === scale.z
    ) return cam;
    cam.updateMatrixWorld();
    const next = cache || (this._w2sCamCache = {
      cam: null, parent: null,
      px: 0, py: 0, pz: 0,
      qx: 0, qy: 0, qz: 0, qw: 0,
      sx: 0, sy: 0, sz: 0,
    });
    next.cam = cam;
    next.parent = cam.parent;
    next.px = pos.x; next.py = pos.y; next.pz = pos.z;
    next.qx = quat.x; next.qy = quat.y; next.qz = quat.z; next.qw = quat.w;
    next.sx = scale.x; next.sy = scale.y; next.sz = scale.z;
    return cam;
  },

  // Accepts authoritative galactic-global XZ (and optional y); projects the frame-local point.
  // `out` is optional: hot per-frame callers may pass a reused { x, y, onScreen } record to avoid the
  // allocation; it is written in place and returned. Omitting it allocates, exactly as before.
  worldToScreen(v, out) {
    const cam = this._syncProjectionCamera();
    if (!cam) return writeScreenProjection(out, 0, 0, false);
    if (!v || !Number.isFinite(Number(v.x)) || !Number.isFinite(Number(v.z))) {
      return writeScreenProjection(out, 0, 0, false);
    }
    const membrane = this._frameMembrane;
    const local = membrane
      ? membrane.toLocal(v, _w2sLocalXZ)
      : { x: v.x, z: v.z };
    const yWorld = Number.isFinite(v.y) ? v.y : 0;
    _pt.set(local.x, yWorld, local.z).project(cam);
    if (!Number.isFinite(_pt.x) || !Number.isFinite(_pt.y) || !Number.isFinite(_pt.z)) {
      return writeScreenProjection(out, 0, 0, false);
    }
    const width = typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 0;
    const height = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 0;
    const x = (_pt.x * 0.5 + 0.5) * width;
    const y = (-_pt.y * 0.5 + 0.5) * height;
    const onScreen = _pt.z < 1 && Math.abs(_pt.x) <= 1 && Math.abs(_pt.y) <= 1;
    return writeScreenProjection(out, x, y, onScreen);
  },

  // Plane pick returns authoritative galactic-global XZ (input systems keep global aimWorld).
  raycastToPlane(ndc) {
    const cam = this.cam && this.cam.obj;
    if (!cam || !ndc || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return { x: 0, z: 0 };
    _v2.set(ndc.x, ndc.y);
    _ray.setFromCamera(_v2, cam);
    const hit = _ray.ray.intersectPlane(_plane, _pt);
    if (!hit) return { x: 0, z: 0 };
    const membrane = this._frameMembrane;
    if (!membrane) return { x: hit.x, z: hit.z };
    return membrane.toGlobal({ x: hit.x, z: hit.z }, _rayGlobalXZ);
  },

  // World XZ of a named attachment socket on an entity's mesh, or null if the entity has no mesh or no
  // such socket. Used by VFX to originate weapon/mining/engine effects from authored hardware (spec
  // §9.9) instead of the entity center. Failure returns null so callers fall back to the payload origin.
  socketWorldPos(entityId, socketName) {
    const pose = this.socketWorldPose(entityId, socketName);
    return pose ? { x: pose.x, z: pose.z } : null;
  },

  // Authored composition metadata for VFX profile resolution (engine/weapon part IDs, ship def).
  entityMeshMeta(entityId) {
    const m = this._meshes.get(entityId);
    const e = this.state.entities && this.state.entities.get(entityId);
    if (!m && !e) return null;
    const ud = (m && m.userData) || {};
    const contract = ud.authoredRenderContract || ud.renderContract || null;
    const slots = ud.authoredSlots || (contract && contract.authoredSlots) || null;
    const shipDef = e && e.data && e.data.defId ? SHIP_BY_ID.get(e.data.defId) : null;
    return {
      slots,
      defId: e && e.data && e.data.defId || null,
      driveId: shipDef && shipDef.driveId || null,
      factionId: e && (e.factionId || (e.data && e.data.factionId)) || null,
      authoredState: ud.authoredAssetState || null,
    };
  },

  socketWorldPose(entityId, socketName) {
    const m = this._meshes.get(entityId);
    if (!m) return null;
    let cache = m.userData.__socketCache;
    if (!cache) cache = m.userData.__socketCache = new Map();
    let socket = cache.get(socketName);
    if (socket === undefined) {
      socket = null;
      m.traverse((o) => { if (!socket && o.userData && o.userData.spacefaceSocket && o.name === socketName) socket = o; });
      cache.set(socketName, socket);
    }
    if (!socket) return null;
    socket.updateWorldMatrix(true, false);
    socket.matrixWorld.decompose(SOCKET_WORLD_POS, SOCKET_WORLD_QUAT, SOCKET_WORLD_SCALE);
    const authoredForward = socket.userData && socket.userData.forward || [1, 0, 0];
    const authoredForwardX = Array.isArray(authoredForward) ? authoredForward[0] : authoredForward.x;
    const authoredForwardY = Array.isArray(authoredForward) ? authoredForward[1] : authoredForward.y;
    const authoredForwardZ = Array.isArray(authoredForward) ? authoredForward[2] : authoredForward.z;
    SOCKET_FORWARD.set(
      Number.isFinite(authoredForwardX) ? authoredForwardX : 1,
      Number.isFinite(authoredForwardY) ? authoredForwardY : 0,
      Number.isFinite(authoredForwardZ) ? authoredForwardZ : 0,
    );
    if (SOCKET_FORWARD.lengthSq() < 1e-8) SOCKET_FORWARD.set(1, 0, 0);
    SOCKET_FORWARD.normalize().applyQuaternion(SOCKET_WORLD_QUAT).normalize();
    // Mesh matrix is frame-local; external helpers speak galactic-global XZ.
    const membrane = this._frameMembrane;
    const globalXZ = membrane
      ? membrane.toGlobal({ x: SOCKET_WORLD_POS.x, z: SOCKET_WORLD_POS.z }, _socketGlobalXZ)
      : { x: SOCKET_WORLD_POS.x, z: SOCKET_WORLD_POS.z };
    return {
      x: globalXZ.x,
      y: SOCKET_WORLD_POS.y,
      z: globalXZ.z,
      forwardX: SOCKET_FORWARD.x,
      forwardY: SOCKET_FORWARD.y,
      forwardZ: SOCKET_FORWARD.z,
    };
  },

  _getPostDiagnostics() {
    const activePath = this._lastRenderPath || 'straight';
    const bloomSelected = !!(this.bloom && this.state.settings && this.state.settings.video && this.state.settings.video.bloom !== false);
    const drawSize = this.renderer ? this.renderer.getDrawingBufferSize(_drawSize) : _drawSize;
    const telemetry = getPostRenderTargetTelemetry();

    let pathDetails = null;
    if (activePath === 'renderGraph' && this._renderGraph && typeof this._renderGraph.diagnostics === 'function') {
      pathDetails = this._renderGraph.diagnostics();
    } else if (activePath === 'bloom' && this.bloom && typeof this.bloom.diagnostics === 'function') {
      pathDetails = this.bloom.diagnostics();
    }

    const bloomDiag = this.bloom && typeof this.bloom.diagnostics === 'function' ? this.bloom.diagnostics() : null;
    const renderGraphDiag = this._renderGraph && typeof this._renderGraph.diagnostics === 'function'
      ? this._renderGraph.diagnostics()
      : null;

    const gpuTimers = this._gpuTimers && typeof this._gpuTimers.getCapability === 'function'
      ? this._gpuTimers.getCapability()
      : { available: false, status: 'unavailable', reason: 'not-installed', enabled: false };

    return {
      activePath,
      bloomSelected,
      renderGraph: !!this._renderGraph,
      bufferWidth: drawSize.x | 0,
      bufferHeight: drawSize.y | 0,
      drawingBufferWidth: drawSize.x | 0,
      drawingBufferHeight: drawSize.y | 0,
      sceneTargetWidth: pathDetails && Number.isFinite(pathDetails.sceneTargetWidth)
        ? pathDetails.sceneTargetWidth
        : (drawSize.x | 0),
      sceneTargetHeight: pathDetails && Number.isFinite(pathDetails.sceneTargetHeight)
        ? pathDetails.sceneTargetHeight
        : (drawSize.y | 0),
      configuredRenderScale: finiteInRange(this.state?.settings?.video?.renderScale, 0.5, 2, 1),
      effectiveSceneScale: pathDetails && Number.isFinite(pathDetails.effectiveSceneScale)
        ? pathDetails.effectiveSceneScale
        : 1,
      nativeFallbackReason: activePath === 'straight'
        ? (this._postNativeFallbackReason || 'post-processor-unavailable')
        : null,
      renderGraphFallbackReason: this.state?.settings?.video?.renderGraph === true
        && activePath !== 'renderGraph'
        ? (this._renderGraphFallbackReason || 'render-graph-unavailable')
        : null,
      fullFramePasses: pathDetails && Number.isFinite(pathDetails.fullFramePasses) ? pathDetails.fullFramePasses : 1,
      bloomPasses: pathDetails && Number.isFinite(pathDetails.bloomPasses) ? pathDetails.bloomPasses : 0,
      passFamilies: pathDetails && pathDetails.passFamilies
        ? { ...pathDetails.passFamilies }
        : { scene: 1, normal: 0, ao: 0, bloom: 0, composite: 0 },
      renderTargetCount: pathDetails && Number.isFinite(pathDetails.renderTargetCount)
        ? pathDetails.renderTargetCount
        : (pathDetails && Number.isFinite(pathDetails.targets) ? pathDetails.targets : 0),
      grainSource: pathDetails && pathDetails.grainSource ? pathDetails.grainSource : null,
      grainFps: pathDetails && Number.isFinite(pathDetails.grainFps) ? pathDetails.grainFps : null,
      renderTargetAllocationsTotal: telemetry.renderTargetAllocationsTotal,
      renderTargetAllocationsDuringSample: telemetry.renderTargetAllocationsDuringSample,
      lastAllocationReason: telemetry.lastAllocationReason,
      bloom: bloomDiag,
      renderGraphDetails: renderGraphDiag,
      gpuTimers,
      dynResScale: Number.isFinite(this.state?.render?.dynResScale) ? this.state.render.dynResScale : 1,
    };
  },

  // One route authority for ordinary draw, hidden warm-up, opening-frame submission, and exact-target
  // compilation. Selective bloom controls never select a presentation route: off/zero only suppress
  // bloom pyramid passes inside the wrapper/graph composite.
  _selectPostRoute(options = null) {
    if (this._contextLost === true && options?.allowContextRecovery !== true) {
      return POST_PROCESS_ROUTE.NATIVE;
    }
    const video = this.state?.settings?.video || {};
    if (video.renderGraph === true && this._ensureRenderGraph() && this._renderGraph) {
      return POST_PROCESS_ROUTE.GRAPH;
    }
    if (this.bloom) return POST_PROCESS_ROUTE.BLOOM;
    return POST_PROCESS_ROUTE.NATIVE;
  },

  _renderPostRoute(route, scene, camera, time = 0) {
    if (route === POST_PROCESS_ROUTE.GRAPH) {
      const frame = this._postFrameOptions || (this._postFrameOptions = { time: 0 });
      frame.time = Number.isFinite(time) ? time : 0;
      return this._renderGraph.render(scene, camera, frame);
    }
    if (route === POST_PROCESS_ROUTE.BLOOM) {
      return this.bloom.render(scene, camera);
    }
    this._postNativeFallbackReason = this._contextLost === true
      ? 'context-loss'
      : (this._postNativeFallbackReason || 'post-processor-unavailable');
    if (isWebGlContextUnavailable(this._contextLost, this.renderer)) return false;
    this.renderer.setRenderTarget(null);
    return this.renderer.render(scene, camera);
  },

  _compilePostRoute(route, subject, camera, lightingScene) {
    if (route === POST_PROCESS_ROUTE.GRAPH) {
      return compileScenePipelinesForRenderTarget(
        this.renderer, this._renderGraph.sceneTarget, subject, camera, lightingScene,
      );
    }
    if (route === POST_PROCESS_ROUTE.BLOOM) {
      return this.bloom.compileScenePipelines(subject, camera, lightingScene);
    }
    return compileScenePipelinesForRenderTarget(
      this.renderer, null, subject, camera, lightingScene,
    );
  },

  _warmPostProcess(scene, camera) {
    return this._renderPostRoute(
      this._selectPostRoute(), scene, camera, this._bgTime || 0,
    );
  },

  _renderOpeningPostFrame(scene, camera) {
    return this._renderPostRoute(
      this._selectPostRoute(), scene, camera, this._bgTime || 0,
    );
  },

  // Re-apply the drawing-buffer size (renderer + bloom + render-graph + LOD viewport) from the current
  // window size, the base video settings, AND the live dynamic-resolution scale (state.render.dynResScale).
  // Shared by onResize (window/setting change) and the dynamic-resolution controller (per-frame load).
  _applySize() {
    const drawSize = applyRendererSize(this.renderer, this.state);
    if (this.bloom) this.bloom.setSize(drawSize.x, drawSize.y);
    if (this._renderGraph && this.state?.settings?.video?.renderGraph === true) {
      const video = this.state?.settings?.video || {};
      this._renderGraph.setOptions({
        ao: video.ao !== false,
        renderScale: Math.min(1, finiteInRange(video.renderScale, 0.5, 2, 1)),
      });
      this._renderGraph.setSize(drawSize.x, drawSize.y);
    }
    // Cache the CSS-pixel viewport for the LOD projector (projectedWidthPx expects CSS px, matching
    // the projected-width thresholds in spec §12.4). Drawing-buffer size carries devicePixelRatio.
    const dpr = this.renderer.getPixelRatio() || 1;
    this.viewport = { width: drawSize.x / dpr, height: drawSize.y / dpr };
    if (this.state && this.state.render) this.state.render.viewport = this.viewport;
    return drawSize;
  },

  onResize() {
    const before = authoredBoundaryPreparationSignature(
      this.renderer, this.state, this._contextRecovery?.generation || 0,
    );
    this._applySize();
    const after = authoredBoundaryPreparationSignature(
      this.renderer, this.state, this._contextRecovery?.generation || 0,
    );
    if (before !== after) {
      this._authoredPreparationEpoch++;
      this._sectorBoundaryPreparations?.abortAll('render-target-resized-during-sector-prewarm');
    }
    this.cam.onResize();
    if (this.spaceBg && this.spaceBg.onResize) this.spaceBg.onResize();
  },

  // Lazily construct the SpaceRenderGraph only when its setting is on (it allocates GPU render
  // targets). Returns false if construction fails (e.g. a low-capability GPU) so the caller falls
  // back to bloom/straight-render. Options mirror the bloom/quality settings where they overlap.
  _ensureRenderGraph() {
    if (this._renderGraph) return true;
    if (this._renderGraphUnavailable) return false;
    try {
      const v = this.state.settings.video || {};
      const post = this._applySectorPost(this._normalizePostVideo(v));
      const drawSize = this.viewport ? { x: this.viewport.width * (this.renderer.getPixelRatio() || 1), y: this.viewport.height * (this.renderer.getPixelRatio() || 1) } : { x: 1280, y: 720 };
      this._renderGraph = new SpaceRenderGraph(this.renderer, {
        enabled: true,
        ao: v.ao !== false,
        bloom: post.bloom !== false,
        // Same normalization as applyRendererSize (one field, one contract). This used to read
        // `Math.min(1, Math.max(0.5, v.renderScale || 0.7))`, which disagreed with the main path in
        // two ways: `|| 0.7` made an ABSENT value 0.7 here while the main path defaults to 1 — a
        // silent 30% resolution difference between the two pipelines — and `|| ` also rewrote a
        // legitimate 0. The min(1) ceiling is kept and is render-graph-specific: supersampling a
        // multi-render-target graph above 1 is a different cost class from supersampling the direct
        // path, so the graph declines it rather than inheriting the slider's 2x ceiling.
        renderScale: Math.min(1, finiteInRange(v.renderScale, 0.5, 2, 1)),
        bloomStrength: post.bloomStrength,
        bloomThreshold: post.bloomThreshold,
        exposure: post.exposure,
        acesToneMapping: post.acesToneMapping,
        grade: post.grade,
        vignette: post.vignette,
        toe: post.toe,
        grain: post.grain ?? 0,
      });
      this._renderGraph.setSize(drawSize.x, drawSize.y);
      // Expose for diagnostics + the energy-materials depth binding path.
      this.state.render.renderGraph = this._renderGraph;
      this.state.render.renderGraphUnavailable = false;
      this._renderGraphFallbackReason = null;
      this._syncPostOptions(true);
      return true;
    } catch (err) {
      console.warn('[render] SpaceRenderGraph unavailable, falling back to bloom:', err);
      const failedGraph = this._renderGraph;
      this._renderGraph = null;
      if (this.state.render) this.state.render.renderGraph = null;
      try { failedGraph?.dispose?.(); } catch (_) { /* best-effort partial-construction cleanup */ }
      this._renderGraphUnavailable = true;
      this.state.render.renderGraphUnavailable = true;
      this._renderGraphFallbackReason = 'render-graph-unavailable';
      // The graph would have owned internal scale. Its bloom-wrapper fallback owns scale at the
      // drawing buffer instead, so reconcile immediately rather than silently applying it zero times.
      this._applySize();
      return false;
    }
  },
};

/** Opening defer must clear even if the first painted frame is no longer flight. */
export function releaseOpeningMeshDefer(owner, mode) {
  if (!owner) return owner;
  releaseOpeningGraphPublication(owner);
  owner._deferNoncriticalMeshStreaming = false;
  if (owner.state && owner.state.render) owner.state.render.deferNoncriticalMeshStreaming = false;
  owner._meshReconcileDirty = true;
  // The exact first-picture activity frame is a startup latch, not a steady-flight update path.
  // Clear it with the mesh defer so ordinary prepareFrame() resumes its tick-gated classification.
  owner._openingFirstPicturePrepared = false;
  owner._firstPlayablePaintScheduled = mode === 'flight';
  return owner;
}

/** Prevent async authored child publication from changing the exact graph between census and draw. */
export function freezeOpeningGraphPublication(owner) {
  if (!owner || !owner.state || !owner.state.render) return false;
  if (owner._openingGraphPublicationGate) return true;
  let resolveRelease;
  const promise = new Promise((resolve) => { resolveRelease = resolve; });
  const gate = { promise, resolveRelease };
  owner._openingGraphPublicationGate = gate;
  owner.state.render.openingGraphPublicationFrozen = true;
  owner.state.render.waitForOpeningGraphPublicationRelease = () => gate.promise;
  return true;
}

/** Release prepared offscreen publications after the exact first picture paints or is abandoned. */
export function releaseOpeningGraphPublication(owner) {
  if (!owner) return false;
  const gate = owner._openingGraphPublicationGate;
  owner._openingGraphPublicationGate = null;
  if (owner.state && owner.state.render) {
    owner.state.render.openingGraphPublicationFrozen = false;
    owner.state.render.waitForOpeningGraphPublicationRelease = null;
  }
  if (!gate) return false;
  gate.resolveRelease();
  return true;
}

function afterBrowserPaint(callback) {
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(callback, 0);
    return;
  }
  requestAnimationFrame(() => {
    setTimeout(() => requestAnimationFrame(callback), 0);
  });
}

function applyRendererSize(renderer, state) {
  const vd = (state.settings && state.settings.video) || {};
  const cap = finiteInRange(vd.pixelRatioCap, 0.25, 4, 2);
  // The default bloom route applies renderScale at the drawing buffer. The optional graph needs a
  // native presentation buffer and owns its clamped internal scene scale, so applying the same
  // setting here too would square every downscale (0.7 -> 0.49) and silently overcharge quality.
  const graphOwnsScale = vd.renderGraph === true
    && state.render?.renderGraphUnavailable !== true;
  const scale = graphOwnsScale ? 1 : finiteInRange(vd.renderScale, 0.5, 2, 1);
  // Live dynamic-resolution multiplier (adaptiveQuality.js). Defaults to 1 (no effect) until the
  // controller lowers it under GPU load; kept separate from the persisted renderScale so it recovers.
  const dyn = finiteInRange(state.render && state.render.dynResScale, 0.2, 1, 1);
  const base = Math.min(window.devicePixelRatio || 1, cap);
  renderer.setPixelRatio(Math.max(0.2, base * scale * dyn));
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer.getDrawingBufferSize(_drawSize);
}

function finiteInRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
  const rig = {
    scene,
    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
    start: createSectorPaletteFrame(),
    target: createSectorPaletteFrame(),
    elapsed: 0,
    active: false,
  };
  writeRigToSectorPaletteFrame(rig.start, rig);
  writeRigToSectorPaletteFrame(rig.target, rig);
  return rig;
}

function createSectorPaletteFrame() {
  return {
    colors: {
      ambient: new THREE.Color(),
      key: new THREE.Color(),
      rim: new THREE.Color(),
      fill: new THREE.Color(),
      fog: new THREE.Color(),
    },
    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
    fogDensity: 0,
  };
}

function writeRigToSectorPaletteFrame(frame, rig) {
  frame.colors.ambient.copy(rig.lights.ambient.color);
  frame.colors.key.copy(rig.lights.key.color);
  frame.colors.rim.copy(rig.lights.rim.color);
  frame.colors.fill.copy(rig.lights.fill.color);
  frame.colors.fog.copy(rig.scene.fog.color);
  frame.intensities.ambient = rig.lights.ambient.intensity;
  frame.intensities.key = rig.lights.key.intensity;
  frame.intensities.rim = rig.lights.rim.intensity;
  frame.intensities.fill = rig.lights.fill.intensity;
  frame.fogDensity = rig.scene.fog.density;
}

// `lighting` is the authored per-sector rig from sectorVisualProfiles (e.g. Helios asks for
// ambient 0.15 / key 3.2 — deep-space blacks under a hard sun). Before this took a parameter every
// sector rendered the same global SECTOR_LIGHT_INTENSITIES (ambient 0.85 / key 1.7), i.e. a flat
// ~5.7x-too-bright ambient wash with a weak key, which is exactly the "no convincing environmental
// key source, weak rim separation" note that independent review kept returning. The lerp machinery
// already interpolated intensities per frame; only the source of the numbers was hardcoded.
function writePaletteToSectorPaletteFrame(frame, palette, lighting = null) {
  frame.colors.ambient.setHex(palette.ambient);
  frame.colors.key.setHex(palette.key);
  frame.colors.rim.setHex(palette.rim);
  frame.colors.fill.setHex(palette.fill);
  frame.colors.fog.setHex(palette.fog);
  frame.intensities.ambient = authoredIntensity(lighting, 'ambient');
  frame.intensities.key = authoredIntensity(lighting, 'key');
  frame.intensities.rim = authoredIntensity(lighting, 'rim');
  frame.intensities.fill = authoredIntensity(lighting, 'fill');
  frame.fogDensity = palette.fogDensity;
}

function authoredIntensity(lighting, channel) {
  const authored = lighting && Number(lighting[channel]);
  return Number.isFinite(authored) && authored >= 0 ? authored : SECTOR_LIGHT_INTENSITIES[channel];
}

function applySectorPaletteFrame(rig, frame) {
  rig.lights.ambient.color.copy(frame.colors.ambient);
  rig.lights.key.color.copy(frame.colors.key);
  rig.lights.rim.color.copy(frame.colors.rim);
  rig.lights.fill.color.copy(frame.colors.fill);
  rig.scene.fog.color.copy(frame.colors.fog);
  rig.lights.ambient.intensity = frame.intensities.ambient;
  rig.lights.key.intensity = frame.intensities.key;
  rig.lights.rim.intensity = frame.intensities.rim;
  rig.lights.fill.intensity = frame.intensities.fill;
  rig.scene.fog.density = frame.fogDensity;
}

function lerpSectorPaletteFrame(rig, start, target, t) {
  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function replaceSceneEnvMap(scene, previousEnvMap, nextEnvMap) {
  if (!scene || !previousEnvMap || !nextEnvMap) return;
  scene.traverse((node) => {
    const materials = Array.isArray(node && node.material) ? node.material : [node && node.material];
    for (const material of materials) {
      if (!material || material.envMap !== previousEnvMap) continue;
      material.envMap = nextEnvMap;
      material.needsUpdate = true;
    }
  });
}

function disposeObject(obj) {
  if (!obj || typeof obj.traverse !== 'function') return;
  obj.traverse((c) => {
    if (!c) return;
    const disposePresentation = c.userData && c.userData.disposeWorldSitePresentation;
    if (typeof disposePresentation === 'function') disposePresentation();
    const releaseResidency = c.userData && c.userData.releaseAuthoredAssetResidency;
    if (typeof releaseResidency === 'function') releaseResidency('render-boundary-disposed');
    if ((c.isBatchedMesh || c.isInstancedMesh) && typeof c.dispose === 'function'
        && !isBorrowedAsteroidInstanceResource(c)) c.dispose();
    const shared = !!(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo
      || c.userData.spacefaceSharedAsset || c.userData.borrowedGeometryMaterial))
      || isBorrowedAsteroidInstanceResource(c);
    if (!c.isBatchedMesh && c.geometry && !shared) {
      const geoShared = c.geometry.userData && c.geometry.userData.spacefaceSharedAsset;
      if (!geoShared && typeof c.geometry.dispose === 'function') c.geometry.dispose();
    }
    if (c.material && !shared) {
      const mm = Array.isArray(c.material) ? c.material : [c.material];
      for (const material of mm) {
        if (!material || typeof material.dispose !== 'function') continue;
        if (material.userData && material.userData.spacefaceSharedAsset) continue;
        material.dispose();
      }
    }
  });
}
