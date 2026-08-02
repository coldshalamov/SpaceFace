// Render system: owns the WebGLRenderer, scene, lights, camera, starfield, and the entity→mesh
// lifecycle. Exposes worldToScreen / raycastToPlane via ctx.helpers and a renderFrame() the loop
// calls each animation frame. Sim never touches this; it's all in renderFrame (ARCHITECTURE §1,§2.4).
import * as THREE from 'three';
import { applyMasslineReleaseCameraCue, createChaseCamera, shakeDistanceAttenuation } from './camera.js';
import { createSpaceBackground } from './spaceBackground.js';
import { createVisualFactory, setEnvMapForShips } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import {
  createBloom,
  compileScenePipelinesForRenderTarget,
} from './bloom.js';
import { SpaceRenderGraph } from './post/spaceRenderGraph.js';
import {
  getAuthoredInstancePoolDiagnostics,
  isInitialAuthoredCompositionEntity,
  preloadAuthoredPartLibrary,
  retryAuthoredPartLibrary,
  syncAuthoredInstancePools,
} from './partsLibrary.js';
import {
  createAsteroidInstancePool,
  invalidateAsteroidInstancePool,
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
import {
  createPresentationWorld,
  PRESENTATION_DIRTY,
  PRESENTATION_FLAGS,
} from './presentationWorld.js';
import { createPresentationPublisher } from './presentationPublisher.js';
import { createPresentationQueries } from './presentationQueries.js';
import { shieldBubbleGeometry } from './ships/shipKit.js';
import { projectedWidthPx } from './lod.js';
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
  invalidateShadowCasterPolicy,
  syncShadowCasterPolicy,
} from './shadowCasterPolicy.js';
import { updateShipPitchPresentation } from './shipPitchPresentation.js';
import { configurePlanarAdditiveMaterial } from './planarAdditivePolicy.js';
import { createRenderFrameMembrane } from './frameCoordinates.js';
import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { getAssetResidency } from './assetResidency.js';
import { preloadRockSurfaceLibrary } from './rockSurfaceLibrary.js';
import { createPipelineAdmissionTracker } from './pipelineReadiness.js';
import {
  collectStartupTextures,
  prepareStartupGpuResidency,
  yieldToBrowser,
} from './startupGpuResidency.js';
import {
  collectContextLossRoots,
  deferWebGlContextRestore,
  detachStaleWebGlDisposeListeners,
  isWebGlContextUnavailable,
} from './contextResourceLifecycle.js';
import { createDynamicBufferCoordinator } from './dynamicBufferRanges.js';
import {
  AUTHORED_ASSET_PREFETCH_RADIUS,
  willEntityEnterAuthoredUpgradeRunway,
} from './authoredAdmissionPolicy.js';

// M2 floating-origin scratch for mesh pose projection (no per-entity allocation).
const _meshLocalXZ = { x: 0, z: 0 };
const _cullLocalXZ = { x: 0, z: 0 };
const _shadowLocalXZ = { x: 0, z: 0 };
const _w2sLocalXZ = { x: 0, z: 0 };
const _rayGlobalXZ = { x: 0, z: 0 };
const _socketGlobalXZ = { x: 0, z: 0 };
const _worldSiteA11y = { reducedMotion: false, reducedFlash: false };

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const SECTOR_PALETTE_LERP_SECONDS = 1.5;
const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
const ENTITY_VIEW_CULL_MIN_MARGIN = 900;
const ENTITY_VIEW_CULL_ZOOM_MARGIN = 8;
// World simulation deliberately keeps the current corridor sector plus reduced neighbours alive.
// Render residency is narrower: build the whole active sector, and only admit neighbour-sector
// meshes once they enter a generous travel runway. This keeps seamless approach quality without
// constructing, traversing, or decoding another sector while it is still ~15k world units away.
const RENDER_STREAM_PREFETCH_RADIUS = 5200;
const RENDER_STREAM_EVICT_RADIUS = 6400;
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
const SHIP_AUX_SHIELD_INITIAL_CAPACITY = 32;
const SHIP_AUX_NAV_INITIAL_CAPACITY = 64;
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

function enqueueMeshBuildCandidate(entity, meshes, queuedIds, queue) {
  if (!entity || entity._noMesh || meshes.has(entity.id) || queuedIds.has(entity.id)) return;
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
  return dx * dx + dz * dz <= radius * radius;
}

/** Pure render-streaming policy used by reconciliation and focused tests. */
export function isEntityRenderRelevant(entity, state, radius = RENDER_STREAM_PREFETCH_RADIUS) {
  if (!entity || entity.alive === false || entity._noMesh) return false;
  if (state && state.mode === 'loading') return isInitialAuthoredCompositionEntity(entity, state);
  if (entityIsExplicitRenderFocus(entity, state)) return true;
  const sectorId = entitySectorId(entity);
  const currentSectorId = state && state.world && state.world.currentSectorId;
  if (sectorId && currentSectorId && sectorId === currentSectorId) return true;
  return entityWithinPlayerRadius(entity, state, radius);
}

/** Pure authored-admission policy: spatial runway, explicit focus, never whole-sector eagerness. */
export function isEntityAuthoredUpgradeRelevant(entity, state, radius = AUTHORED_ASSET_PREFETCH_RADIUS) {
  if (!entity || entity.alive === false) return false;
  if (state && state.mode === 'loading') return isInitialAuthoredCompositionEntity(entity, state);
  return willEntityEnterAuthoredUpgradeRunway(entity, state, { radius });
}

function clearEntityMeshReference(entity, mesh) {
  if (!entity) return;
  if (entity.mesh === mesh) entity.mesh = null;
  if (entity.view && entity.view.root === mesh) entity.view = null;
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

function createContactShadowPool(scene) {
  const pool = { scene, capacity: 0, mesh: null, records: new Map(), seen: new Set() };
  ensureContactShadowCapacity(pool, CONTACT_SHADOW_INITIAL_CAPACITY);
  return pool;
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
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
  if (pool.records) pool.records.clear();
  if (previous && pool.scene) {
    pool.scene.remove(previous);
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  if (pool.scene) pool.scene.add(mesh);
}

function syncContactShadowPool(pool, frameOrRecords, meshes) {
  if (!pool || !pool.mesh) return;
  const records = frameOrRecords && Array.isArray(frameOrRecords.contactShadows)
    ? frameOrRecords.contactShadows
    : (Array.isArray(frameOrRecords) ? frameOrRecords : []);
  ensureContactShadowCapacity(pool, records.length);
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
  if (pool.mesh.count !== count) {
    pool.mesh.count = count;
    dirty = true;
  }
  pool.mesh.visible = count > 0;
  if (dirty) pool.mesh.instanceMatrix.needsUpdate = true;
}

const SHIELD_POOL_VERT = /* glsl */`
  attribute float instanceFlash;
  attribute float instanceBase;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vInstanceColor;
  varying float vFlash;
  varying float vBase;
  void main() {
    mat4 instanceModel = modelMatrix * instanceMatrix;
    vec4 wp = instanceModel * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(instanceModel) * normal);
    vInstanceColor = instanceColor;
    vFlash = instanceFlash;
    vBase = instanceBase;
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
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    float alpha = clamp(vBase * fres + vFlash, 0.0, 1.0);
    vec3 col = mix(vInstanceColor, vec3(1.0), vFlash * 0.7);
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

function ensureShieldAuxCapacity(pool, desired, scene, preserveCount = 0) {
  if (!pool || desired <= pool.capacity) return;
  const nextCapacity = Math.max(desired, pool.capacity ? pool.capacity * 2 : SHIP_AUX_SHIELD_INITIAL_CAPACITY);
  const previous = pool.mesh;
  const geometry = shieldBubbleGeometry().clone();
  geometry.setAttribute('instanceFlash', new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('instanceBase', new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity), 1).setUsage(THREE.DynamicDrawUsage));
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
  }
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
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
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  if (previous && preserveCount > 0) {
    mesh.instanceMatrix.array.set(previous.instanceMatrix.array.subarray(0, preserveCount * 16));
    if (previous.instanceColor) {
      mesh.instanceColor.array.set(previous.instanceColor.array.subarray(0, preserveCount * 3));
    }
  }
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
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
        if (writeInstanceMatrixIfChanged(shieldMesh, shieldCount, bubble.matrixWorld)) shieldMatrixDirty = true;
        const color = uniforms && uniforms.uColor && uniforms.uColor.value;
        if (writeInstanceColorIfChanged(
          shieldMesh, shieldCount, color && color.isColor ? color : SHIP_AUX_COLOR.set(0x5fd0ff),
        )) shieldColorDirty = true;
        if (writeScalarAttributeIfChanged(
          flashAttr, shieldCount, uniforms && uniforms.uFlash ? uniforms.uFlash.value || 0 : 0,
        )) shieldFlashDirty = true;
        if (writeScalarAttributeIfChanged(
          baseAttr, shieldCount, uniforms && uniforms.uBase ? uniforms.uBase.value || 0.22 : 0.22,
        )) shieldBaseDirty = true;
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
        if (writeInstanceMatrixIfChanged(navMesh, navCount, SHIP_AUX_WORLD_MATRIX)) navMatrixDirty = true;
        if (writeInstanceColorIfChanged(navMesh, navCount, SHIP_AUX_COLOR)) navColorDirty = true;
        navCount++;
      }
    }
  }

  const shieldMesh = pool.shield.mesh;
  const flashAttr = shieldMesh.geometry.getAttribute('instanceFlash');
  const baseAttr = shieldMesh.geometry.getAttribute('instanceBase');
  if (shieldMesh.count !== shieldCount) shieldMesh.count = shieldCount;
  shieldMesh.visible = shieldCount > 0;
  if (shieldMatrixDirty) shieldMesh.instanceMatrix.needsUpdate = true;
  if (shieldColorDirty && shieldMesh.instanceColor) shieldMesh.instanceColor.needsUpdate = true;
  if (shieldFlashDirty) flashAttr.needsUpdate = true;
  if (shieldBaseDirty) baseAttr.needsUpdate = true;

  const navMesh = pool.nav.mesh;
  if (navMesh.count !== navCount) navMesh.count = navCount;
  navMesh.visible = navCount > 0;
  if (navMatrixDirty) navMesh.instanceMatrix.needsUpdate = true;
  if (navColorDirty && navMesh.instanceColor) navMesh.instanceColor.needsUpdate = true;

  pool.entityPasses = 1;
  pool.entitiesVisited = entitiesVisited;
}

function writeInstanceMatrixIfChanged(mesh, index, matrix, epsilon = 1e-6) {
  const target = mesh && mesh.instanceMatrix && mesh.instanceMatrix.array;
  const source = matrix && matrix.elements;
  if (!target || !source) return false;
  const offset = index * 16;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(target[offset + i] - source[i]) > epsilon) {
      mesh.setMatrixAt(index, matrix);
      return true;
    }
  }
  return false;
}

function writeInstanceColorIfChanged(mesh, index, color, epsilon = 1e-6) {
  const target = mesh && mesh.instanceColor && mesh.instanceColor.array;
  if (!target || !color) return false;
  const offset = index * 3;
  if (Math.abs(target[offset] - color.r) <= epsilon
      && Math.abs(target[offset + 1] - color.g) <= epsilon
      && Math.abs(target[offset + 2] - color.b) <= epsilon) return false;
  mesh.setColorAt(index, color);
  return true;
}

function writeScalarAttributeIfChanged(attribute, index, value, epsilon = 1e-6) {
  if (!attribute || !attribute.array) return false;
  if (Math.abs(attribute.array[index] - value) <= epsilon) return false;
  attribute.setX(index, value);
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

function requestAuthoredUpgrade(mesh, renderer, scene) {
  const request = mesh && mesh.userData && mesh.userData.requestAuthoredUpgrade;
  if (typeof request !== 'function') return;
  try { request(renderer, scene); }
  catch (error) { console.warn('[render] authored asset upgrade request failed', error); }
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
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: devShot });
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
    state.render.spaceBg = spaceBg;
    const vf = createVisualFactory();
    // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
    // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
    // back to the original procedural builder, so non-Kestrel entities are completely unaffected.
    installVisualOverrides(vf, {
      // Live play mounts a zero-draw admission substrate and publishes the authored GLB as the first
      // visible identity. Preview-only factories may still opt into hidden diagnostic geometry.
      directAuthoredMount: true,
      onAuthoredAssetSwap: ({ boundary, root } = {}) => {
        const target = boundary || root;
        if (target) {
          invalidateShadowCasterPolicy(target);
          syncShadowCasterPolicy(target, target.userData && target.userData.lod
            ? target.userData.lod.level : null);
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
        dynamicBuffers.handleContextLost();
        const contextRoots = collectContextLossRoots({
          scene,
          environment: this._envMap,
          spaceBackground: this.spaceBg,
          bloom: this.bloom,
          renderGraph: this._renderGraph,
          entities: state.entityList,
        });
        const detachReceipt = detachStaleWebGlDisposeListeners(contextRoots);
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
          this._contextLost = false;
          dynamicBuffers.handleContextRestored();
          try {
            // Re-apply renderer config that the new context defaults lose.
            this.renderer.setClearColor(0x060912, 1);
            if (this._shadowSettingOn && this._keyLight) this.renderer.shadowMap.enabled = false; // re-gated by _syncShadowMapEnabled on next frame
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
            this._contextRecovery.restores++;
            this._contextRecovery.generation++;
            this._contextRecovery.pending = false;
            if (this._assetResidency) this._assetResidency.handleContextRestored();
            state.render.pipelinePrecompileReady = precompileGlobalPipelines(renderer, scene, cam.obj, {
              incremental: true,
              preparePipelines: compileForCurrentTarget,
              video: state.settings && state.settings.video,
              yieldToMain: yieldToBrowser,
            }).catch((error) => {
              console.warn('[render] restored-context pipeline precompile failed', error);
              return null;
            });
            this._publishAssetResidencyDiagnostics();
            bus.emit('toast', { text: 'Graphics recovered.', kind: 'good', ttl: 3 });
          } catch (err) {
            this._contextRecovery.lastError = String(err && err.message ? err.message : err);
            if (typeof console !== 'undefined') console.error('[render] context-restore rebuild failed', err);
          }
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
    state.render.sectorPalette = corePalette;
    this._keyLight = key; // retained while disabled so current→max→current can reconcile live
    this._shadowSettingOn = shadowsOn;
    this._shadowReceiversDirty = true;
    this._shadowReceiverCount = 0;
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
    try {
      this.bloom = createBloom(renderer, drawSize.x, drawSize.y, {
        getPerf: () => state.perfRuntime,
        getGpuTimers: () => this._gpuTimers,
        getGpuOrigin: () => this._gpuFrameOrigin || null,
      });
    } catch (err) { console.warn('[render] bloom unavailable, falling back:', err); this.bloom = null; }
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
    this._deferNoncriticalMeshStreaming = false;
    this._firstPlayablePaintScheduled = false;
    this._hazardVisuals = []; // hazard zone visual meshes for the current sector
    this._meshReconcileDirty = true;
    this._initialMeshReconcileComplete = false;
    this._renderResidencyPollS = 0;
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
    state.render.cameraCtrl = cam;   // controller (addTrauma/pushZoom) — exposed for feel.js / ui
    state.render.vf = vf;   // exposed for the dev-only ship turntable preview (shipPreview.js)
    state.render.warmPostProcess = () => {
      const dynamicBufferEpoch = dynamicBuffers.arm();
      try {
        return this.bloom && state.settings.video.bloom !== false
          ? this.bloom.render(scene, cam.obj)
          : renderer.render(scene, cam.obj);
      } finally {
        dynamicBuffers.disarm(dynamicBufferEpoch);
      }
    };
    const compileForCurrentTarget = (subjects) => {
      const batch = Array.isArray(subjects) ? subjects.filter(Boolean) : [subjects].filter(Boolean);
      if (batch.length === 0) return Promise.resolve({ skipped: true, reason: 'empty pipeline batch' });
      const subject = batch.length === 1 ? batch[0] : new THREE.Group();
      if (batch.length > 1) {
        subject.name = 'SF_AuthoredPipelineAdmissionBatch';
        for (const root of batch) subject.add(root);
      }
      const video = state.settings && state.settings.video || {};
      let preparation;
      if (video.renderGraph && this._ensureRenderGraph()) {
        preparation = compileScenePipelinesForRenderTarget(
          renderer, this._renderGraph.sceneTarget, subject, cam.obj, scene,
        );
      } else if (this.bloom && video.bloom !== false) {
        preparation = this.bloom.compileScenePipelines(subject, cam.obj, scene);
      } else {
        preparation = compileScenePipelinesForRenderTarget(renderer, null, subject, cam.obj, scene);
      }
      return Promise.resolve(preparation).finally(() => {
        if (batch.length > 1) subject.clear();
      });
    };
    const pipelineAdmissions = createPipelineAdmissionTracker(compileForCurrentTarget, {
      deferAutoFlush: () => state.mode === 'loading',
    });
    state.render.compileObjectPipelines = (subject) => pipelineAdmissions.compile(subject);
    state.render.prepareAuthoredGpuResidency = (subject) => prepareStartupGpuResidency(
      renderer,
      subject,
      { yieldToMain: yieldToBrowser },
    );
    state.render.compileCurrentPipelines = () => pipelineAdmissions.compileCurrent(scene);
    state.render.pendingPipelineAdmissions = () => pipelineAdmissions.pendingCount;
    state.render.prepareOpeningGpuResources = async () => {
      // Flight admission waits behind the loading presenter, so every subsequently streamed common
      // rock receives its final PBR maps on its first and only visual publication.
      await this.rockSurfaceLibraryReady;
      const roots = [];
      for (const [id, mesh] of this._meshes) {
        const entity = state.entities && state.entities.get ? state.entities.get(id) : null;
        if (isInitialAuthoredCompositionEntity(entity, state)) roots.push(mesh);
      }
      const vfxRoots = typeof state.render.collectVfxGpuResidencyRoots === 'function'
        ? state.render.collectVfxGpuResidencyRoots()
        : [];
      const vfxTextures = collectStartupTextures(vfxRoots);
      const result = await prepareStartupGpuResidency(renderer, [...roots, ...vfxRoots], {
        yieldToMain: yieldToBrowser,
      });
      result.openingCompositionRoots = roots.length;
      result.vfxRoots = vfxRoots.length;
      result.vfxTextures = vfxTextures.length;
      if (this.bloom && typeof this.bloom.prepareResources === 'function') {
        result.post = await this.bloom.prepareResources(yieldToBrowser);
      }
      // Submit the exact, deliberately small opening composition while the loading shell still
      // covers the canvas. Textures and targets are resident by this point, and loading-mode mesh
      // scope excludes the rest of the sector. This moves unavoidable first-driver work before the
      // handoff instead of presenting a black/frozen flight canvas after mode changes.
      await yieldToBrowser();
      const openingFrameStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const video = state.settings && state.settings.video || {};
      const dynamicBufferEpoch = dynamicBuffers.arm();
      try {
        if (video.renderGraph && this._ensureRenderGraph()) {
          this._renderGraph.render(scene, cam.obj, { time: this._bgTime || 0 });
        } else if (this.bloom && video.bloom !== false) {
          this.bloom.render(scene, cam.obj);
        } else {
          renderer.setRenderTarget(null);
          renderer.render(scene, cam.obj);
        }
      } finally {
        dynamicBuffers.disarm(dynamicBufferEpoch);
      }
      result.openingFrame = {
        durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now())
          - openingFrameStarted,
        roots: roots.length,
      };
      await yieldToBrowser();
      state.render.startupGpuResidency = result;
      return result;
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
      const m = this._meshes.get(id);
      if (m) {
        this._unbindPresentationMesh(id, m);
        releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id);
        scene.remove(m); disposeObject(m); this._meshes.delete(id);
        this._shadowReceiversDirty = true;
        this._publishAssetResidencyDiagnostics();
      }
    });
    // Ship hull swap or loadout change (fit/upgrade) — rebuild the mesh so visible hardpoints,
    // engines and tier reflect the current ship. Without this the mesh is frozen at spawn and a
    // shipyard hull switch or fitted weapon never shows. Mirrors the spawn path: dispose old,
    // build new, re-seat from the entity's live transform.
    bus.on('ship:appearanceChanged', ({ id }) => render.rebuildShipMesh(id));
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
    // (cruise-drop settle stays owned by spec2/02 §1). Boost-release also gets a gentle zoom tighten.
    bus.on('ship:boostStop', () => { if (cam.easeRecenter) cam.easeRecenter(0.4); if (cam.pushZoom) cam.pushZoom(-0.03, 0.4); });
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
      const vd = state.settings.video;
      this._syncPostOptions();
      if (p.key === 'shadows' || p.key == null) {
        this._shadowSettingOn = vd.shadows !== false;
        this._shadowReceiversDirty = true;
        this._ensureKeyLightShadows();
        this._syncShadowMapEnabled();
      }
      if (p.key === 'renderScale' || p.key === 'pixelRatioCap' || p.key == null) this.onResize();
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
    bus.on('sector:exit', ({ sectorId } = {}) => {
      if (this._assetResidency) this._assetResidency.prepareSectorExit(sectorId);
      this._publishAssetResidencyDiagnostics();
    });
    let deferredStartupPrecompile = null;
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
    bus.on('sector:enter', ({ sectorId, sector } = {}) => {
      if (this._assetResidency) this._assetResidency.rotateSector(sectorId || sector && sector.id);
      this._publishAssetResidencyDiagnostics();
      this._meshReconcileDirty = true;
      // Kick only boundaries inside the authored prefetch runway. Reduced neighbour sectors remain
      // structurally alive in simulation, but do not decode merely because membership changed.
      for (const [id, mesh] of this._meshes) {
        const entity = state.entities.get(id);
        if (isEntityAuthoredUpgradeRelevant(entity, state)) {
          requestAuthoredUpgrade(mesh, renderer, scene);
        }
      }
      if (cam.snapToPlayer) cam.snapToPlayer();
      this._beginSectorPaletteTransition(sector);
      // Per-sector sky: rebake the deep-field background with this sector's seed +
      // palette class (no-op when re-entering the same sector).
      if (spaceBg && spaceBg.onSectorEnter) spaceBg.onSectorEnter(sector);
      this._updateHazardVisuals(sector);
      if (state.mode === 'loading') {
        deferredStartupPrecompile = sector;
        state.render.pipelinePrecompileReady = precompileGlobalPipelines(renderer, scene, cam.obj, {
          incremental: true,
          preparePipelines: compileForCurrentTarget,
          video: state.settings && state.settings.video,
          yieldToMain: yieldToBrowser,
        }).catch((error) => {
          console.warn('[render] global pipeline precompile failed', error);
          return null;
        });
      } else {
        state.render.pipelinePrecompileReady = compileSectorPipelines(sector);
      }
    });
    bus.on('mode:changed', ({ mode } = {}) => {
      if (mode === 'loading') {
        state.render.firstPlayableFrameAt = null;
        this._deferNoncriticalMeshStreaming = false;
        this._firstPlayablePaintScheduled = false;
      }
      if (mode !== 'flight') return;
      // The first visible flight draw contains only the already-resident opening composition.
      // Bulk sector roots resume at the normal two-per-frame budget after that draw completes.
      this._deferNoncriticalMeshStreaming = true;
      if (!deferredStartupPrecompile) return;
      const sector = deferredStartupPrecompile;
      deferredStartupPrecompile = null;
      const begin = () => {
        if (state.mode !== 'flight') return;
        state.render.backgroundPipelinePrecompileReady = compileSectorPipelines(sector);
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(begin, { timeout: 1200 });
      else setTimeout(begin, 250);
    });
    bus.on('jump:arrive', ({ sectorId } = {}) => {
      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
      this._beginSectorPaletteTransition(sector);
      if (spaceBg && spaceBg.onSectorEnter) spaceBg.onSectorEnter(sector);
    });
    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });

    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._resizeHandler = () => this.onResize();
    window.addEventListener('resize', this._resizeHandler);
    // Apply persisted video/post settings once bloom exists (createBloom defaults otherwise win).
    this._syncPostOptions();
  },

  _normalizePostVideo(vd = {}) {
    // Slider is 0..1 (percent). Legacy profiles may still carry the old 0..2 scale — halve once.
    let bloomStrength = typeof vd.bloomStrength === 'number' ? vd.bloomStrength : 0.35;
    if (bloomStrength > 1) bloomStrength *= 0.5;
    bloomStrength = Math.max(0, Math.min(1, bloomStrength));
    const bloomThreshold = typeof vd.bloomThreshold === 'number' ? vd.bloomThreshold : 1.0;
    return {
      bloom: vd.bloom,
      bloomStrength,
      bloomThreshold,
      exposure: vd.exposure,
      acesToneMapping: vd.acesToneMapping !== false,
    };
  },

  _postOptionsSignature(norm) {
    return [
      norm.bloom === false ? 0 : 1,
      norm.bloomStrength.toFixed(4),
      norm.bloomThreshold.toFixed(4),
      typeof norm.exposure === 'number' ? norm.exposure.toFixed(4) : '',
      norm.acesToneMapping ? 1 : 0,
    ].join('|');
  },

  _invalidatePostOptionsCache() {
    this._postOptionsSig = null;
  },

  _syncPostOptions(force = false) {
    const vd = (this.state && this.state.settings && this.state.settings.video) || {};
    const norm = this._normalizePostVideo(vd);
    const sig = this._postOptionsSignature(norm);
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
    };
    if (this.bloom) this.bloom.setOptions(postOpts);
    if (this._renderGraph) {
      this._renderGraph.setOptions({
        bloom: norm.bloom !== false,
        bloomStrength: norm.bloomStrength,
        bloomThreshold: norm.bloomThreshold,
      });
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
    if (!world || !entity || !mesh) return false;
    const handle = world.handleForEntityId(entity.id, this._presentationHandleScratch);
    if (!handle) return false;
    if (!mesh.userData) mesh.userData = {};
    mesh.userData.presentationEntityId = entity.id;
    return world.bindMesh(handle, mesh, entity, entityVisualCullRadius(entity, mesh));
  },

  _unbindPresentationMesh(entityId, mesh = null) {
    const world = this._presentationWorld;
    if (!world) return false;
    const handle = world.handleForEntityId(entityId, this._presentationHandleScratch);
    if (!handle) return false;
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
    for (const [id, m] of [...this._meshes]) {
      if (keepPlayer && id === this.state.playerId) continue;
      this._unbindPresentationMesh(id, m);
      releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id);
      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
    }
    this._presentationQueries?.reset?.();
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
      const envMap = scene.background && scene.background.isTexture
        ? pmrem.fromEquirectangular(scene.background).texture
        : pmrem.fromScene(scene, 0, 0.1, 1000).texture;
      pmrem.dispose();
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
      if (!e || e.alive === false || !isEntityRenderRelevant(e, state, RENDER_STREAM_EVICT_RADIUS)) {
        this._unbindPresentationMesh(id, m);
        releaseAsteroidInstancesForEntity(this._asteroidInstancePool, id);
        this.scene.remove(m); disposeObject(m); this._meshes.delete(id); this._shadowReceiversDirty = true;
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
      (entity) => isEntityRenderRelevant(entity, state),
    );
    const built = this._drainMeshBuildQueue(buildBudget);
    // Existing fallback boundaries may have crossed the authored prefetch radius since the last
    // reconciliation. Requesting is idempotent; resolved bootstrap assets install synchronously.
    for (const [id, mesh] of this._meshes) {
      const entity = state.entities.get(id);
      if (!entity || entity.alive === false) continue;
      this._bindPresentationMesh(entity, mesh);
      if (isEntityAuthoredUpgradeRelevant(entity, state)) {
        requestAuthoredUpgrade(mesh, this.renderer, this.scene);
      }
    }
    this._meshReconcileDirty = this._meshBuildQueueHead < this._meshBuildQueue.length;
    if (!this._meshReconcileDirty) this._initialMeshReconcileComplete = true;
    this._publishAssetResidencyDiagnostics();
    return built;
  },

  _drainMeshBuildQueue(buildBudget) {
    let built = 0;
    while (this._meshBuildQueueHead < this._meshBuildQueue.length && built < buildBudget) {
      const id = this._meshBuildQueue[this._meshBuildQueueHead++];
      this._meshBuildQueuedIds.delete(id);
      const e = this.state.entities.get(id);
      if (!e || e.alive === false || e._noMesh || this._meshes.has(id)
          || !isEntityRenderRelevant(e, this.state)) continue;
      const m = this.vf.build(e);
      if (!m) { e._noMesh = true; continue; }
      const local = this._frameMembrane.toLocal(e.pos, _meshLocalXZ);
      m.position.set(local.x, 0, local.z);
      m.rotation.y = -e.rot;
      if (e.type === 'ship' || e.type === 'station') {
        attachContactShadow(m, e);
        syncShadowCasterPolicy(m, m.userData && m.userData.lod ? m.userData.lod.level : null);
      }
      e.mesh = m; e.view = { root: m };
      this._meshes.set(e.id, m);
      this.scene.add(m);
      this._bindPresentationMesh(e, m);
      registerAsteroidBaseLeaf(this._asteroidInstancePool, e, m);
      if (isEntityAuthoredUpgradeRelevant(e, this.state)) {
        requestAuthoredUpgrade(m, this.renderer, this.scene);
      }
      this._shadowReceiversDirty = true;
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
    const e = this.state.entities.get(id);
    if (!e || e.alive === false) return;
    const old = this._meshes.get(id);
    if (old) {
      this._unbindPresentationMesh(id, old);
      this.scene.remove(old);
      disposeObject(old);
      this._meshes.delete(id);
      this._shadowReceiversDirty = true;
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
      syncShadowCasterPolicy(m, m.userData && m.userData.lod ? m.userData.lod.level : null);
    }
    e.mesh = m; e.view = { root: m };
    this._meshes.set(id, m);
    this.scene.add(m);
    this._bindPresentationMesh(e, m);
    if (isEntityAuthoredUpgradeRelevant(e, this.state)) {
      requestAuthoredUpgrade(m, this.renderer, this.scene);
    }
    this._shadowReceiversDirty = true;
  },


  _entityViewCullBounds() {
    const camObj = this.cam && this.cam.obj;
    const cameraState = this.state && this.state.camera || {};
    // Camera focus is frame-local after the M2 chase camera membrane.
    const focus = cameraState.focus || (camObj && camObj.position) || { x: 0, z: 0 };
    const zoom = Number.isFinite(cameraState.zoom)
      ? cameraState.zoom
      : Math.max(80, camObj && Number.isFinite(camObj.position && camObj.position.y) ? Math.abs(camObj.position.y) : 88);
    const fov = camObj && Number.isFinite(camObj.fov)
      ? camObj.fov
      : (this.state.settings && this.state.settings.video && this.state.settings.video.fov) || 50;
    const aspect = Math.max(0.45, camObj && Number.isFinite(camObj.aspect)
      ? camObj.aspect
      : (this.viewport && this.viewport.height ? this.viewport.width / this.viewport.height : 16 / 9));
    const halfV = Math.tan((fov * Math.PI / 180) * 0.5) * zoom * 0.72;
    const halfH = halfV * aspect;
    const margin = Math.max(ENTITY_VIEW_CULL_MIN_MARGIN, zoom * ENTITY_VIEW_CULL_ZOOM_MARGIN);
    const bounds = this._entityViewBounds;
    bounds.x = Number.isFinite(focus.x) ? focus.x : 0;
    bounds.z = Number.isFinite(focus.z) ? focus.z : 0;
    bounds.halfX = halfH + margin;
    bounds.halfZ = halfV + margin;
    bounds.margin = margin;
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
    const world = this._presentationWorld;
    const origin = this._frameMembrane.origin;
    const noInterpolation = currentOnly
      || (world.flags[slot] & PRESENTATION_FLAGS.NO_INTERPOLATION) !== 0;
    let x = world.x[slot];
    let z = world.z[slot];
    let rot = world.rot[slot];
    let bank = world.bank[slot];
    let pitch = world.pitch[slot];
    if (!noInterpolation) {
      const t = Number.isFinite(alpha) ? alpha : 0;
      x = world.prevX[slot] + (world.x[slot] - world.prevX[slot]) * t;
      z = world.prevZ[slot] + (world.z[slot] - world.prevZ[slot]) * t;
      let dr = world.rot[slot] - world.prevRot[slot];
      dr = ((dr + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dr < -Math.PI) dr += Math.PI * 2;
      rot = world.prevRot[slot] + dr * t;
      bank = world.prevBank[slot] + (world.bank[slot] - world.prevBank[slot]) * t;
      pitch = world.prevPitch[slot] + (world.pitch[slot] - world.prevPitch[slot]) * t;
    }
    mesh.position.x = x - origin.x;
    mesh.position.y = 0;
    mesh.position.z = z - origin.z;
    mesh.rotation.y = -rot;
    const hull = mesh.userData && mesh.userData.hull;
    const entity = world.entityRefs[slot];
    if (hull && entity && entity.bank != null) hull.rotation.x = bank;
    if (hull && entity && entity.pitch != null) hull.rotation.z = pitch;
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
      const entity = this.state.entities.get(entityId) || world.entityRefs[slot];
      if (entity && entity.alive !== false) {
        world.refreshVisibleEntity(slot, entity, entityVisualCullRadius(entity, mesh));
      }
      this._applyPresentationPose(slot, mesh, alpha, true);
      if (mesh.userData && mesh.userData.asteroidInstanceBody) {
        mesh.userData.asteroidInstanceViewCulled = true;
      }
      world.clearDirty(slot);
      transformed++;
    }

    for (let index = 0; index < query.visibleCount; index++) {
      const slot = query.visibleSlots[index];
      const generation = query.visibleGenerations[index];
      if (world.alive[slot] !== 1 || world.slotGenerations[slot] !== generation) continue;
      const mesh = world.meshRefs[slot];
      const entityId = world.entityIds[slot];
      const entity = this.state.entities.get(entityId) || world.entityRefs[slot];
      if (!mesh || !entity || entity.alive === false) continue;

      const userData = mesh.userData || (mesh.userData = {});
      if (this.collisionDebug && this.collisionDebug.on) userData.__lastEntity = entity;
      world.refreshVisibleEntity(slot, entity, entityVisualCullRadius(entity, mesh));
      const dirty = world.dirtyMasks[slot];
      if ((dirty & (PRESENTATION_DIRTY.TRANSFORM | PRESENTATION_DIRTY.BINDING
        | PRESENTATION_DIRTY.VISIBILITY)) !== 0 || world.poseHasDelta(slot)) {
        this._applyPresentationPose(slot, mesh, alpha);
        transformed++;
      }
      if (userData.asteroidInstanceBody) userData.asteroidInstanceViewCulled = false;

      // Projected-screen-size LOD (spec §12.4): visible roots resolve detail from projected pixel
      // width with hysteresis. Newly visible roots are fully posed above before this decision.
      if (userData.lod && userData.updateLod) {
        lodChecked++;
        const hlodVisualRadius = userData.hlod && Number(userData.hlod.visualRadius);
        const lodRadius = Number.isFinite(hlodVisualRadius) && hlodVisualRadius > 0
          ? hlodVisualRadius
          : entity.radius;
        const px = projectedWidthPx(mesh.position, lodRadius, this.cam.obj, this.viewport);
        const level = entity.id === this.state.playerId ? 'lod0' : userData.lod.resolve(px);
        userData.updateLod(level);
        if (userData.hlod && syncShadowCasterPolicy(mesh, level)) shadowPolicyRefreshes++;
      }

      classifyRenderEntity(this._entityFrame, entity, mesh, false);
      fullSynced++;

      // Visible interactive and hero roots retain their authored per-frame presentation closures.
      if (userData.updateRuntimeState) userData.updateRuntimeState(entity, now);
      if (userData.updateWorldSitePresentation) {
        userData.updateWorldSitePresentation(entity, this.state.simTime, _worldSiteA11y);
      }
      if (userData.updateDamageState) userData.updateDamageState(entity, now);
      if (userData.updateDriveState) userData.updateDriveState(entity, now);

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
    diagnostics.fullSynced = fullSynced;
    diagnostics.culled = query.culledCount;
    diagnostics.newlyVisible = query.newlyVisibleCount;
    diagnostics.newlyHidden = query.hiddenCount;
    diagnostics.lodChecked = lodChecked;
    diagnostics.cullHalfX = Math.round(bounds.halfX);
    diagnostics.cullHalfZ = Math.round(bounds.halfZ);
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

  // --------------- hazard zone visuals ------------------------------------------------
  // Create a radial gradient CanvasTexture: bright center color fading to transparent edge.
  _makeHazardTexture(hexColor, centerAlpha, edgeAlpha) {
    const size = 256;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    // Parse hex to r,g,b
    const r = parseInt(hexColor.slice(1, 3), 16);
    const gr = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    g.addColorStop(0.0, `rgba(${r},${gr},${b},${centerAlpha})`);
    g.addColorStop(0.5, `rgba(${r},${gr},${b},${centerAlpha * 0.6})`);
    g.addColorStop(0.85, `rgba(${r},${gr},${b},${edgeAlpha * 0.5})`);
    g.addColorStop(1.0, `rgba(${r},${gr},${b},${edgeAlpha})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  },

  _updateHazardVisuals(sector) {
    // Dispose previous hazard visuals
    for (const obj of this._hazardVisuals) {
      this.scene.remove(obj);
      disposeObject(obj);
    }
    this._hazardVisuals = [];

    if (!sector || !sector.hazards || sector.hazards.length === 0) return;

    // Color/opacity config per hazard type
    const hazardStyles = {
      radiation:       { color: '#66ff44', centerAlpha: 0.18, edgeAlpha: 0.04, ring: true,  ringColor: 0x44ff22 },
      nebula:          { color: '#7744ff', centerAlpha: 0.15, edgeAlpha: 0.03, ring: false, ringColor: 0x7744ff },
      dense_asteroid:  { color: '#aa7744', centerAlpha: 0.10, edgeAlpha: 0.02, ring: false, ringColor: 0xaa7744 },
      debris:          { color: '#778899', centerAlpha: 0.12, edgeAlpha: 0.03, ring: false, ringColor: 0x778899 },
    };

    const membrane = this._frameMembrane;
    for (const hz of sector.hazards) {
      const style = hazardStyles[hz.type] || hazardStyles.debris;
      const intensityScale = hz.intensity != null ? hz.intensity : 0.5;
      // Hazard centers are galactic-global world data; Three.js placement is frame-local.
      const center = hz.center || { x: 0, z: 0 };
      const local = membrane
        ? membrane.toLocal(center, _meshLocalXZ)
        : { x: center.x || 0, z: center.z || 0 };

      // --- Main disc ---
      const discGeo = new THREE.CircleGeometry(hz.radius, 64);
      const tex = this._makeHazardTexture(style.color, style.centerAlpha * intensityScale, style.edgeAlpha * intensityScale);
      const discMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      configurePlanarAdditiveMaterial(discMat);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(local.x, -0.5, local.z);
      disc.renderOrder = -3; // below contact shadows
      disc.frustumCulled = false;
      this.scene.add(disc);
      this._hazardVisuals.push(disc);

      // --- Boundary ring (radiation zones get a visible edge ring) ---
      if (style.ring) {
        const ringInner = hz.radius - 4;
        const ringOuter = hz.radius + 4;
        const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: style.ringColor,
          transparent: true,
          opacity: 0.25 * intensityScale,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        configurePlanarAdditiveMaterial(ringMat);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(local.x, -0.4, local.z);
        ring.renderOrder = -2;
        ring.frustumCulled = false;
        this.scene.add(ring);
        this._hazardVisuals.push(ring);
      }
    }
  },

  _beginSectorPaletteTransition(sector) {
    const rig = this._sectorPaletteRig;
    if (!rig) return;
    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
    this.state.render.sectorPalette = palette;
    if (palette === this._sectorPaletteTarget) return;

    this._sectorPaletteTarget = palette;
    writeRigToSectorPaletteFrame(rig.start, rig);
    writePaletteToSectorPaletteFrame(rig.target, palette);
    rig.elapsed = 0;
    rig.active = true;

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

  prepareFrame(alpha, frameDt, presentationFrame = null) {
    this._presentationFrame = presentationFrame;
    // Publication is consumed before any context-loss early return. PresentationRunner acknowledges
    // the range after renderUpdate succeeds, so the dense mirror must not miss that same range merely
    // because the GPU is temporarily unavailable.
    const publication = this._presentationPublisher.consume(presentationFrame);
    if (publication.rebuilt) this._rebindPresentationMeshes();
    else this._bindPublishedPresentationMeshes(publication);
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
    // toward them. A low-frequency residency poll admits/evicts views and starts authored prefetch
    // as distance thresholds are crossed without putting a full entity scan in every frame.
    if (!this._deferNoncriticalMeshStreaming) {
      this._renderResidencyPollS -= Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
      if (this._renderResidencyPollS <= 0) {
        this._renderResidencyPollS = RENDER_RESIDENCY_POLL_SECONDS;
        this._meshReconcileDirty = true;
      }
      if (this._meshReconcileDirty) this.reconcileMeshes();
    }
    updateShipPitchPresentation(this.state, frameDt);
    this.syncEntityViews(alpha);
    this.cam.follow(frameDt);
    syncContactShadowPool(this._contactShadowPool, this._entityFrame);
    syncShipAuxPools(this._shipAuxPool, this._entityFrame);
    const authoredSyncOptions = this._authoredInstanceSyncOptions;
    authoredSyncOptions.camera = this.cam.obj;
    authoredSyncOptions.entityFrame = this._entityFrame;
    authoredSyncOptions.authoredRecords = this._entityFrame.authored;
    syncAuthoredInstancePools(this.scene, authoredSyncOptions);
    // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
    this._updateSectorPaletteTransition(frameDt);
    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
    this._bgTime = (this._bgTime || 0) + frameDt * ts;
    if (this.spaceBg && this.spaceBg.update) this.spaceBg.update(frameDt, this._bgTime, this.cam.obj.position);
    this._syncShadowMapEnabled();
    // Shadow follow (graphics spec G): keep the key light's shadow frustum centered on the player
    // so the tight 1400-unit ortho box always covers the local action. DirectionalLight position is
    // an offset from its target; we move both together. No-op unless the shadow map will render.
    this._updateShadowFollow();
    const shadowCamera = prepareActiveShadowCamera(this.renderer, this._keyLight);
    const asteroidSyncOptions = this._asteroidInstanceSyncOptions;
    asteroidSyncOptions.camera = this.cam.obj;
    asteroidSyncOptions.shadowCamera = shadowCamera;
    asteroidSyncOptions.records = this._entityFrame.asteroids;
    asteroidSyncOptions.recordsDirty = this._presentationWorld.consumeAsteroidDirty();
    this.state.render.asteroidInstancePool = syncAsteroidInstancePool(this._asteroidInstancePool, asteroidSyncOptions);
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
    try {
      dynamicBufferEpoch = this._dynamicBuffers.arm();
      if (this.state.settings.video.renderGraph && this._ensureRenderGraph()) {
        this._lastRenderPath = 'renderGraph';
        const gpuQueryBegan = !!(useGpu && gpu.begin('drawPreparedFrame', gpuOrigin));
        try {
          this._renderGraph.render(this.scene, this.cam.obj, { time: this._bgTime || 0 });
        } finally {
          if (gpuQueryBegan) gpu.end();
        }
      } else if (this.bloom && this.state.settings.video.bloom !== false) {
        this._lastRenderPath = 'bloom';
        // bloom.render() records bloomScene/Downsample/Upsample/Composite CPU+GPU groups.
        this.bloom.render(this.scene, this.cam.obj);
      } else {
        this._lastRenderPath = 'straight';
        const gpuQueryBegan = !!(useGpu && gpu.begin('drawPreparedFrame', gpuOrigin));
        try {
          this.renderer.render(this.scene, this.cam.obj);
        } finally {
          if (gpuQueryBegan) gpu.end();
        }
      }
    } finally {
      if (dynamicBufferEpoch !== null) this._dynamicBuffers.disarm(dynamicBufferEpoch);
      if (postFrameToken) endPostRenderTargetFrameOrigin(postFrameToken);
    }
    if (useCpu) perf.recordRenderWork('drawPreparedFrame', performance.now() - t0);
    if (this.state.mode === 'flight'
        && !Number.isFinite(this.state.render.firstPlayableFrameAt)
        && !this._firstPlayablePaintScheduled) {
      this._firstPlayablePaintScheduled = true;
      afterBrowserPaint(() => {
        if (this.state.mode !== 'flight') return;
        this.state.render.firstPlayableFrameAt = typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();
        this._deferNoncriticalMeshStreaming = false;
        this._meshReconcileDirty = true;
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
  _updateShadowFollow() {
    if (!this._keyLight) return;
    if (!this.renderer.shadowMap || !this.renderer.shadowMap.enabled) return;
    const p = this.state.playerId ? (this.state.entities && this.state.entities.get(this.state.playerId)) : null;
    let px = 0;
    let pz = 0;
    if (p && p.pos && this._frameMembrane) {
      const local = this._frameMembrane.toLocal(p.pos, _shadowLocalXZ);
      px = local.x;
      pz = local.z;
    }
    this._keyLight.position.set(px + 60, 140, pz + 40);
    this._keyLight.target.position.set(px, 0, pz);
  },

  _syncShadowMapEnabled() {
    if (!this._keyLight || !this.renderer.shadowMap) return;
    if (!this._shadowSettingOn) {
      this.renderer.shadowMap.enabled = false;
      this._keyLight.castShadow = false;
      return;
    }
    if (this._shadowReceiversDirty) {
      let receivers = 0;
      this.scene.traverse((o) => { if (o && o.receiveShadow) receivers++; });
      this._shadowReceiverCount = receivers;
      this._shadowReceiversDirty = false;
    }
    const enabled = this._shadowReceiverCount > 0;
    this.renderer.shadowMap.enabled = enabled;
    this._keyLight.castShadow = enabled;
  },

  _ensureKeyLightShadows() {
    const key = this._keyLight;
    const renderer = this.renderer;
    if (!key || !renderer || !renderer.shadowMap) return false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if (!key.userData.spacefaceShadowConfigured) {
      key.castShadow = false;
      key.shadow.mapSize.set(1024, 1024);
      const camera = key.shadow.camera;
      camera.near = 10; camera.far = 600;
      camera.left = -700; camera.right = 700; camera.top = 700; camera.bottom = -700;
      camera.updateProjectionMatrix();
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.04;
      if (key.target && !key.target.parent && this.scene) this.scene.add(key.target);
      key.userData.spacefaceShadowConfigured = true;
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
    const cam = this.cam.obj;
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
    const membrane = this._frameMembrane;
    const local = membrane
      ? membrane.toLocal(v, _w2sLocalXZ)
      : { x: v && v.x, z: v && v.z };
    _pt.set(local.x, (v && v.y) || 0, local.z).project(cam);
    const x = (_pt.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_pt.y * 0.5 + 0.5) * window.innerHeight;
    const onScreen = _pt.z < 1 && Math.abs(_pt.x) <= 1 && Math.abs(_pt.y) <= 1;
    // typeof-guarded so a stray second argument (a .map() index, say) can never be written through.
    if (out && typeof out === 'object') {
      out.x = x;
      out.y = y;
      out.onScreen = onScreen;
      return out;
    }
    return { x, y, onScreen };
  },

  // Plane pick returns authoritative galactic-global XZ (input systems keep global aimWorld).
  raycastToPlane(ndc) {
    _v2.set(ndc.x, ndc.y);
    _ray.setFromCamera(_v2, this.cam.obj);
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
      fullFramePasses: pathDetails && Number.isFinite(pathDetails.fullFramePasses) ? pathDetails.fullFramePasses : 1,
      bloomPasses: pathDetails && Number.isFinite(pathDetails.bloomPasses) ? pathDetails.bloomPasses : 0,
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

  // Re-apply the drawing-buffer size (renderer + bloom + render-graph + LOD viewport) from the current
  // window size, the base video settings, AND the live dynamic-resolution scale (state.render.dynResScale).
  // Shared by onResize (window/setting change) and the dynamic-resolution controller (per-frame load).
  _applySize() {
    const drawSize = applyRendererSize(this.renderer, this.state);
    if (this.bloom) this.bloom.setSize(drawSize.x, drawSize.y);
    if (this._renderGraph) this._renderGraph.setSize(drawSize.x, drawSize.y);
    // Cache the CSS-pixel viewport for the LOD projector (projectedWidthPx expects CSS px, matching
    // the projected-width thresholds in spec §12.4). Drawing-buffer size carries devicePixelRatio.
    const dpr = this.renderer.getPixelRatio() || 1;
    this.viewport = { width: drawSize.x / dpr, height: drawSize.y / dpr };
    return drawSize;
  },

  onResize() {
    this._applySize();
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
      const drawSize = this.viewport ? { x: this.viewport.width * (this.renderer.getPixelRatio() || 1), y: this.viewport.height * (this.renderer.getPixelRatio() || 1) } : { x: 1280, y: 720 };
      this._renderGraph = new SpaceRenderGraph(this.renderer, {
        enabled: true,
        ao: v.ao !== false,
        bloom: true,
        // Same normalization as applyRendererSize (one field, one contract). This used to read
        // `Math.min(1, Math.max(0.5, v.renderScale || 0.7))`, which disagreed with the main path in
        // two ways: `|| 0.7` made an ABSENT value 0.7 here while the main path defaults to 1 — a
        // silent 30% resolution difference between the two pipelines — and `|| ` also rewrote a
        // legitimate 0. The min(1) ceiling is kept and is render-graph-specific: supersampling a
        // multi-render-target graph above 1 is a different cost class from supersampling the direct
        // path, so the graph declines it rather than inheriting the slider's 2x ceiling.
        renderScale: Math.min(1, finiteInRange(v.renderScale, 0.5, 2, 1)),
        bloomStrength: v.bloomStrength != null ? v.bloomStrength : 0.35,
        bloomThreshold: v.bloomThreshold != null ? v.bloomThreshold : 1.0,
      });
      this._renderGraph.setSize(drawSize.x, drawSize.y);
      // Expose for diagnostics + the energy-materials depth binding path.
      this.state.render.renderGraph = this._renderGraph;
      this._syncPostOptions(true);
      return true;
    } catch (err) {
      console.warn('[render] SpaceRenderGraph unavailable, falling back to bloom:', err);
      this._renderGraphUnavailable = true;
      return false;
    }
  },
};

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
  const scale = finiteInRange(vd.renderScale, 0.5, 2, 1);
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

function writePaletteToSectorPaletteFrame(frame, palette) {
  frame.colors.ambient.setHex(palette.ambient);
  frame.colors.key.setHex(palette.key);
  frame.colors.rim.setHex(palette.rim);
  frame.colors.fill.setHex(palette.fill);
  frame.colors.fog.setHex(palette.fog);
  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
  frame.fogDensity = palette.fogDensity;
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
  obj.traverse((c) => {
    const disposePresentation = c.userData && c.userData.disposeWorldSitePresentation;
    if (typeof disposePresentation === 'function') disposePresentation();
    const releaseResidency = c.userData && c.userData.releaseAuthoredAssetResidency;
    if (typeof releaseResidency === 'function') releaseResidency('render-boundary-disposed');
    if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
    else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
    if (c.material && !(c.userData && c.userData.sharedContactShadow)) { const mm = Array.isArray(c.material) ? c.material : [c.material]; mm.forEach((m) => m.dispose()); }
  });
}
