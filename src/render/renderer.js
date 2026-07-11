// Render system: owns the WebGLRenderer, scene, lights, camera, starfield, and the entity→mesh
// lifecycle. Exposes worldToScreen / raycastToPlane via ctx.helpers and a renderFrame() the loop
// calls each animation frame. Sim never touches this; it's all in renderFrame (ARCHITECTURE §1,§2.4).
import * as THREE from 'three';
import { createChaseCamera } from './camera.js';
import { createSpaceBackground } from './spaceBackground.js';
import { createVisualFactory, setEnvMapForShips, invalidateVisualFactoryCaches } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import { createBloom } from './bloom.js';
import { SpaceRenderGraph } from './post/spaceRenderGraph.js';
import { invalidateAuthoredAsset } from './assetLoader.js';
import { getAuthoredInstancePoolDiagnostics, invalidatePartsLibraryCaches, preloadAuthoredPartLibrary, syncAuthoredInstancePools } from './partsLibrary.js';
import { shieldBubbleGeometry } from './ships/shipKit.js';
import { projectedWidthPx } from './lod.js';
import { createCollisionDebug } from './collisionDebug.js';
import { installDiagnostics } from './diagnostics.js';
import { getPostRenderTargetTelemetry, resetPostRenderTargetSampleCounter } from './postTelemetry.js';
import { precompilePipelines } from './precompile.js';
import { detectGpu, createAdaptiveResolution } from './adaptiveQuality.js';
import { createGpuTimers } from './gpuTimers.js';
import { createRenderFrameMembrane } from './frameCoordinates.js';
import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';

// M2 floating-origin scratch for mesh pose projection (no per-entity allocation).
const _meshLocalXZ = { x: 0, z: 0 };
const _cullLocalXZ = { x: 0, z: 0 };
const _shadowLocalXZ = { x: 0, z: 0 };
const _w2sLocalXZ = { x: 0, z: 0 };
const _rayGlobalXZ = { x: 0, z: 0 };
const _socketGlobalXZ = { x: 0, z: 0 };

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const SECTOR_PALETTE_LERP_SECONDS = 1.5;
const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
const ENTITY_VIEW_CULL_MIN_MARGIN = 900;
const ENTITY_VIEW_CULL_ZOOM_MARGIN = 8;

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
export function enqueueMissingMeshBuilds(entityList, meshes, queuedIds, queue) {
  for (const entity of entityList) {
    if (entity && entity.type === 'ship') {
      enqueueMeshBuildCandidate(entity, meshes, queuedIds, queue);
    }
  }
  for (const entity of entityList) {
    if (!entity || entity.type === 'ship') continue;
    enqueueMeshBuildCandidate(entity, meshes, queuedIds, queue);
  }
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

function syncContactShadowPool(pool, entities, meshes) {
  if (!pool || !pool.mesh || !Array.isArray(entities)) return;
  let desired = 0;
  for (const entity of entities) {
    if (!entity || entity.alive === false || entity._noShadow) continue;
    if (entity.type !== 'ship' && entity.type !== 'station') continue;
    const mesh = meshes && meshes.get(entity.id);
    if (mesh && mesh.visible !== false && mesh.userData && mesh.userData.hasContactShadow) desired++;
  }
  ensureContactShadowCapacity(pool, desired);
  let count = 0;
  let dirty = false;
  const records = pool.records || (pool.records = new Map());
  const seen = pool.seen || (pool.seen = new Set());
  seen.clear();
  for (const entity of entities) {
    if (!entity || entity.alive === false || entity._noShadow) continue;
    if (entity.type !== 'ship' && entity.type !== 'station') continue;
    const mesh = meshes && meshes.get(entity.id);
    if (!mesh || mesh.visible === false || !(mesh.userData && mesh.userData.hasContactShadow)) continue;
    ensureContactShadowCapacity(pool, count + 1);
    const radius = Number(mesh.userData.contactShadowRadius) || Math.max(16, (entity.radius || 28) * 1.4);
    // Prefer mesh frame-local pose (authoritative for Three.js after syncEntityViews).
    const x = Number.isFinite(mesh.position.x) ? mesh.position.x : 0;
    const z = Number.isFinite(mesh.position.z) ? mesh.position.z : 0;
    seen.add(entity.id);
    const prev = records.get(entity.id);
    if (!prev || prev.index !== count ||
        Math.abs(prev.x - x) > 0.01 || Math.abs(prev.z - z) > 0.01 || Math.abs(prev.radius - radius) > 0.01) {
      CONTACT_SHADOW_POS.set(x, -0.5, z);
      CONTACT_SHADOW_SCALE.set(radius, radius, radius);
      CONTACT_SHADOW_MATRIX.compose(CONTACT_SHADOW_POS, CONTACT_SHADOW_QUAT, CONTACT_SHADOW_SCALE);
      pool.mesh.setMatrixAt(count, CONTACT_SHADOW_MATRIX);
      records.set(entity.id, { index: count, x, z, radius });
      dirty = true;
    }
    count++;
  }
  for (const id of records.keys()) {
    if (!seen.has(id)) records.delete(id);
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

function createShipAuxPool(scene) {
  const pool = {
    scene,
    shield: { capacity: 0, mesh: null, material: createShieldAuxMaterial() },
    nav: { capacity: 0, mesh: null, material: createNavLightAuxMaterial() },
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

function ensureShieldAuxCapacity(pool, desired, scene) {
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
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
  if (previous && scene) {
    scene.remove(previous);
    if (previous.geometry && typeof previous.geometry.dispose === 'function') previous.geometry.dispose();
  }
  if (scene) scene.add(mesh);
}

function ensureNavLightAuxCapacity(pool, desired, scene) {
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
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
  if (previous && scene) {
    scene.remove(previous);
    if (previous.geometry && previous.geometry !== SHIP_AUX_NAV_GEOMETRY && typeof previous.geometry.dispose === 'function') previous.geometry.dispose();
  }
  if (scene) scene.add(mesh);
}

function syncShipAuxPools(pool, entities, meshes) {
  if (!pool || !Array.isArray(entities)) return;
  let desiredShield = 0;
  let desiredNav = 0;
  for (const entity of entities) {
    if (!entity || entity.alive === false || entity.type !== 'ship') continue;
    const root = meshes && meshes.get(entity.id);
    if (!root || root.visible === false || !root.userData) continue;
    if (root.userData.shieldBubble && entity.shield > 0) desiredShield++;
    const navSources = getPooledNavLightSources(root);
    for (const source of navSources) desiredNav += Math.max(0, source.count || 0);
  }
  ensureShieldAuxCapacity(pool.shield, desiredShield, pool.scene);
  ensureNavLightAuxCapacity(pool.nav, desiredNav, pool.scene);
  syncShieldAuxPool(pool.shield, entities, meshes);
  syncNavLightAuxPool(pool.nav, entities, meshes);
}

function syncShieldAuxPool(pool, entities, meshes) {
  if (!pool || !pool.mesh) return;
  const mesh = pool.mesh;
  const flashAttr = mesh.geometry.getAttribute('instanceFlash');
  const baseAttr = mesh.geometry.getAttribute('instanceBase');
  let count = 0;
  for (const entity of entities) {
    if (!entity || entity.alive === false || entity.type !== 'ship') continue;
    const root = meshes && meshes.get(entity.id);
    const bubble = root && root.visible !== false && root.userData && root.userData.shieldBubble;
    if (!bubble) continue;
    bubble.visible = false;
    if (!(entity.shield > 0)) continue;
    bubble.updateWorldMatrix(true, false);
    mesh.setMatrixAt(count, bubble.matrixWorld);
    const uniforms = bubble.material && bubble.material.uniforms;
    const color = uniforms && uniforms.uColor && uniforms.uColor.value;
    mesh.setColorAt(count, color && color.isColor ? color : SHIP_AUX_COLOR.set(0x5fd0ff));
    flashAttr.setX(count, uniforms && uniforms.uFlash ? uniforms.uFlash.value || 0 : 0);
    baseAttr.setX(count, uniforms && uniforms.uBase ? uniforms.uBase.value || 0.22 : 0.22);
    count++;
  }
  if (mesh.count !== count) mesh.count = count;
  mesh.visible = count > 0;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  flashAttr.needsUpdate = true;
  baseAttr.needsUpdate = true;
}

function syncNavLightAuxPool(pool, entities, meshes) {
  if (!pool || !pool.mesh) return;
  const mesh = pool.mesh;
  let count = 0;
  for (const entity of entities) {
    if (!entity || entity.alive === false || entity.type !== 'ship') continue;
    const root = meshes && meshes.get(entity.id);
    if (!root || root.visible === false) continue;
    const sources = getPooledNavLightSources(root);
    for (const source of sources) {
      source.visible = false;
      source.updateWorldMatrix(true, false);
      const sourceCount = Math.max(0, source.count || 0);
      const mat = Array.isArray(source.material) ? source.material[0] : source.material;
      const base = mat && mat.emissive && mat.emissive.isColor ? mat.emissive : (mat && mat.color && mat.color.isColor ? mat.color : SHIP_AUX_COLOR.set(0x88eeff));
      const intensity = mat && Number.isFinite(mat.emissiveIntensity) ? mat.emissiveIntensity : 1;
      SHIP_AUX_COLOR.copy(base).multiplyScalar(Math.max(0, intensity));
      if (mat && Number.isFinite(mat.opacity)) SHIP_AUX_COLOR.multiplyScalar(Math.max(0, mat.opacity));
      for (let i = 0; i < sourceCount; i++) {
        source.getMatrixAt(i, SHIP_AUX_LOCAL_MATRIX);
        SHIP_AUX_WORLD_MATRIX.multiplyMatrices(source.matrixWorld, SHIP_AUX_LOCAL_MATRIX);
        mesh.setMatrixAt(count, SHIP_AUX_WORLD_MATRIX);
        mesh.setColorAt(count, SHIP_AUX_COLOR);
        count++;
      }
    }
  }
  if (mesh.count !== count) mesh.count = count;
  mesh.visible = count > 0;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

function configureShadowCasters(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.visible) { o.castShadow = false; o.receiveShadow = false; return; }
    if (o.userData && o.userData.spacefaceNoShadow) { o.castShadow = false; o.receiveShadow = false; return; }
    if (o.userData && o.userData.sharedContactShadow) { o.castShadow = false; return; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const casts = mats.some((m) => m && !m.transparent && m.depthWrite !== false && (m.opacity == null || m.opacity >= 1) && m.blending === THREE.NormalBlending);
    o.castShadow = casts;
    // GR-2: opaque hulls also RECEIVE shadows — a ship resting on a station pad should be shaded by
    // the station's superstructure, and ships in formation should shadow each other. The same opacity
    // test as casting: transparent shields/engine-plumes neither cast nor receive (they'd self-shadow
    // and flicker). This is what gives ships groundedness beyond the fake contact-shadow disc.
    o.receiveShadow = casts;
  });
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
    renderer.setClearColor(0x060912, 1);
    const drawSize = applyRendererSize(renderer, state);

    const scene = new THREE.Scene();
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

    const cam = createChaseCamera(state);
    const spaceBg = createSpaceBackground(scene, state, { renderer, camera: cam.obj, debug: SF_DEBUG });
    state.render.spaceBg = spaceBg;
    const vf = createVisualFactory();
    // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
    // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
    // back to the original procedural builder, so non-Kestrel entities are completely unaffected.
    installVisualOverrides(vf, {
      onAuthoredAssetSwap: () => { this._shadowReceiversDirty = true; },
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
    // (driver crash, sleep/wake, VRAM exhaustion). THREE's WebGLRenderer only stops rendering on
    // loss — it does NOT restore the env map, re-upload procedural textures, or rebuild GPU state,
    // so without handling this the game silently freezes / goes black with no recovery path.
    // On lost: preventDefault (tells the browser we'll recover), set a flag so renderFrame skips
    // work while the context is gone. On restored: re-bake the PMREM env, force a full mesh
    // reconciliation (re-builds every entity mesh → re-uploads geometries/materials), re-apply
    // renderer config, and re-apply the video settings that drive tone mapping / shadow state.
    this._contextLost = false;
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();        // allow restoration
        this._contextLost = true;
        // Abandon GPU timer query refs without end/delete — the GL context is dead.
        if (this._gpuTimers && typeof this._gpuTimers.abandon === 'function') {
          try { this._gpuTimers.abandon(); } catch (_) { /* ignore */ }
        }
        this._gpuTimers = null;
        if (state.render) state.render.gpuTimers = null;
        if (typeof console !== 'undefined') console.warn('[render] WebGL context lost — awaiting restore');
        bus.emit('toast', { text: 'Graphics context lost — recovering…', kind: 'warn', ttl: 4 });
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        if (typeof console !== 'undefined') console.warn('[render] WebGL context restored — rebuilding GPU resources');
        this._contextLost = false;
        try {
          // Re-apply renderer config that the new context defaults lose.
          this.renderer.setClearColor(0x060912, 1);
          if (this._shadowSettingOn && this._keyLight) this.renderer.shadowMap.enabled = false; // re-gated by _syncShadowMapEnabled on next frame
          // Re-bake the PMREM env (the old GPU texture is gone).
          this._bakeEnv();
          // Invalidate authored-asset and factory caches so the next rebuild reloads GLBs and
          // recreates materials against the restored context rather than reusing stale GPU handles.
          invalidateAuthoredAsset(renderer);
          invalidateVisualFactoryCaches();
          invalidatePartsLibraryCaches(renderer);
          // Rebuild the bloom post-process pipeline (its render targets are tied to the lost context).
          if (this.bloom && typeof this.bloom.rebuild === 'function') this.bloom.rebuild();
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
          // Force every entity mesh to rebuild so geometries/materials re-upload. The cleanest way
          // is to clear + reconcile: dispose the CPU mesh objects, then reconcileMeshes() rebuilds
          // them from the live entityList via the visual factory.
          this.clearAllMeshes(false);
          this._meshReconcileDirty = true;
          // Re-apply bloom + video settings (tone mapping / exposure live on settings:changed).
          this._invalidatePostOptionsCache();
          bus.emit('settings:changed', { section: 'video' });
          bus.emit('toast', { text: 'Graphics recovered.', kind: 'good', ttl: 3 });
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[render] context-restore rebuild failed', err);
        }
      }, false);
    }

    // Preload the menu/boot cinematic backdrop (C-INTRO-01, a clean label-free still). The captioned
    // contact-sheet .jpgs are authoring references only — replaced by procedural materials / inline SVG.
    { const i = new Image(); i.src = 'assets/cinematics/C-INTRO-01.jpg'; }

    this.renderer = renderer; this.scene = scene; this.cam = cam; this.spaceBg = spaceBg; this.vf = vf;
    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
      console.warn('[render] authored part library preload failed', error);
      return null;
    });
    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
    this._sectorPaletteTarget = corePalette;
    state.render.sectorPalette = corePalette;
    this._keyLight = key; // retained while disabled so current→max→current can reconcile live
    this._shadowSettingOn = shadowsOn;
    this._shadowReceiversDirty = true;
    this._shadowReceiverCount = 0;
    this._ensureKeyLightShadows();
    this._contactShadowPool = createContactShadowPool(scene);
    this._shipAuxPool = createShipAuxPool(scene);
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
    this._hazardVisuals = []; // hazard zone visual meshes for the current sector
    this._meshReconcileDirty = true;
    this._initialMeshReconcileComplete = false;
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

    // --- GPU capability detection + dynamic resolution (adaptiveQuality.js) --------------------
    // Profiling proved SpaceFace is GPU present-bound: the JS/sim side fits the frame budget, but a
    // weak/integrated GPU can't shade the full-res HDR scene + bloom composite in time, and a browser
    // that has fallen back to SOFTWARE rendering (hardware acceleration off/blocklisted) drops to a
    // few fps regardless of content. Detect the real renderer so we can warn + pick a floor, then run
    // a dynamic-resolution controller (renderFrame -> prepareFrame each frame) that trades internal
    // resolution for a smooth framerate. It never mutates settings.video, so it fully recovers.
    state.render.dynResScale = 1;
    const gpu = detectGpu(renderer);
    state.render.gpu = gpu;
    // The background was constructed before GPU detection ran; re-tier it now (no-op unless
    // the tier actually changed — e.g. software rendering drops it to the cheap path).
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
    state.render.warmPostProcess = () => (this.bloom && state.settings.video.bloom !== false ? this.bloom.render(scene, cam.obj) : renderer.render(scene, cam.obj));
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

    ctx.helpers.worldToScreen = (v) => this.worldToScreen(v);
    ctx.helpers.raycastToPlane = (ndc) => this.raycastToPlane(ndc);
    ctx.helpers.addTrauma = (a) => cam.addTrauma(a);
    ctx.helpers.socketWorldPose = (id, name) => this.socketWorldPose(id, name);
    ctx.helpers.socketWorldPos = (id, name) => this.socketWorldPos(id, name);
    ctx.helpers.entityMeshMeta = (id) => this.entityMeshMeta(id);

    bus.on('entity:spawned', () => { this._meshReconcileDirty = true; });
    bus.on('entity:destroyed', ({ id }) => {
      const m = this._meshes.get(id);
      if (m) { scene.remove(m); disposeObject(m); this._meshes.delete(id); }
    });
    // Ship hull swap or loadout change (fit/upgrade) — rebuild the mesh so visible hardpoints,
    // engines and tier reflect the current ship. Without this the mesh is frozen at spawn and a
    // shipyard hull switch or fitted weapon never shows. Mirrors the spawn path: dispose old,
    // build new, re-seat from the entity's live transform.
    bus.on('ship:appearanceChanged', ({ id }) => render.rebuildShipMesh(id));
    bus.on('camera:shake', ({ amount }) => cam.addTrauma(amount || 0.3));
    bus.on('camera:kill', () => cam.killCam && cam.killCam());
    // FR-5: ease the frame back to center after a boost-release or a tether slingshot exit/overload
    // (cruise-drop settle stays owned by spec2/02 §1). Boost-release also gets a gentle zoom tighten.
    bus.on('ship:boostStop', () => { if (cam.easeRecenter) cam.easeRecenter(0.4); if (cam.pushZoom) cam.pushZoom(-0.03, 0.4); });
    bus.on('tether:released', () => cam.easeRecenter && cam.easeRecenter(0.4));
    bus.on('tether:broken', () => cam.easeRecenter && cam.easeRecenter(0.4));
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
    bus.on('sector:enter', ({ sector } = {}) => {
      this._meshReconcileDirty = true;
      // Kick any station/place boundaries that spawned before the GLB cache was warm.
      for (const mesh of this._meshes.values()) requestAuthoredUpgrade(mesh, renderer, scene);
      if (cam.snapToPlayer) cam.snapToPlayer();
      this._beginSectorPaletteTransition(sector);
      // Per-sector sky: rebake the deep-field background with this sector's seed +
      // palette class (no-op when re-entering the same sector).
      if (spaceBg && spaceBg.onSectorEnter) spaceBg.onSectorEnter(sector);
      this._updateHazardVisuals(sector);
      const warmup = precompilePipelines(renderer, scene, cam.obj, {
        sector,
        warmPostProcess: state.render.warmPostProcess,
        video: state.settings && state.settings.video,
      }).catch((error) => {
        console.warn('[render] sector pipeline precompile failed', error);
        return null;
      });
      state.render.pipelinePrecompileReady = warmup;
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
    const bloomThreshold = typeof vd.bloomThreshold === 'number' ? vd.bloomThreshold : 0.72;
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

  clearAllMeshes(keepPlayer) {
    for (const [id, m] of [...this._meshes]) {
      if (keepPlayer && id === this.state.playerId) continue;
      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
    }
    this._meshBuildQueue.length = 0;
    this._meshBuildQueueHead = 0;
    this._meshBuildQueuedIds.clear();
    // Also clear hazard zone visuals
    for (const obj of this._hazardVisuals) { this.scene.remove(obj); disposeObject(obj); }
    this._hazardVisuals = [];
  },

  // Bake (or re-bake) the PMREM environment map from the current nebula backdrop. Called once at
  // init after the starfield background decodes, AND on WebGL context restore (a lost GL context
  // invalidates the envMap GPU texture — without re-baking, chrome hulls go matte after recovery).
  _bakeEnv() {
    try {
      const renderer = this.renderer, scene = this.scene, state = this.state;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = scene.background && scene.background.isTexture
        ? pmrem.fromEquirectangular(scene.background).texture
        : pmrem.fromScene(scene, 0, 0.1, 1000).texture;
      pmrem.dispose();
      // Dispose the previous env GPU texture if we're re-baking (context restore path).
      if (this._envMap && this._envMap !== envMap) {
        try { this._envMap.dispose(); } catch (_) {}
      }
      this._envMap = envMap;
      state.render.envMap = envMap;
      setEnvMapForShips(envMap);   // hand it to the visual factory for chrome/authority hulls
      if (scene.environment === null || scene.environment === this._envMap) scene.environment = envMap;
    } catch (_) { /* env-map optional — chrome falls back to high-metalness matte */ }
  },

  // Self-healing entity<->mesh reconciliation. Guarantees every alive, renderable entity has a
  // scene mesh and that meshes for gone entities are disposed — independent of event ordering.
  // This is the safety net that makes the world actually render (entity:spawned alone was being
  // undone by the old sector:enter clear). Cheap: only builds/destroys on a delta.
  reconcileMeshes() {
    const state = this.state;
    const buildBudget = this._initialMeshReconcileComplete ? RUNTIME_MESH_BUILD_BUDGET : Infinity;
    // remove meshes whose entity no longer exists or has died
    for (const [id, m] of this._meshes) {
      const e = state.entities.get(id);
      if (!e || e.alive === false) { this.scene.remove(m); disposeObject(m); this._meshes.delete(id); this._shadowReceiversDirty = true; }
    }
    // Queue authored-readiness-critical ships first, then every remaining world entity. The drain
    // budget stays bounded; this changes admission order only and does not drop or downgrade visuals.
    enqueueMissingMeshBuilds(
      state.entityList,
      this._meshes,
      this._meshBuildQueuedIds,
      this._meshBuildQueue,
    );
    const built = this._drainMeshBuildQueue(buildBudget);
    this._meshReconcileDirty = this._meshBuildQueueHead < this._meshBuildQueue.length;
    if (!this._meshReconcileDirty) this._initialMeshReconcileComplete = true;
    return built;
  },

  _drainMeshBuildQueue(buildBudget) {
    let built = 0;
    while (this._meshBuildQueueHead < this._meshBuildQueue.length && built < buildBudget) {
      const id = this._meshBuildQueue[this._meshBuildQueueHead++];
      this._meshBuildQueuedIds.delete(id);
      const e = this.state.entities.get(id);
      if (!e || e.alive === false || e._noMesh || this._meshes.has(id)) continue;
      const m = this.vf.build(e);
      if (!m) { e._noMesh = true; continue; }
      const local = this._frameMembrane.toLocal(e.pos, _meshLocalXZ);
      m.position.set(local.x, 0, local.z);
      m.rotation.y = -e.rot;
      if (e.type === 'ship' || e.type === 'station') { attachContactShadow(m, e); configureShadowCasters(m); }
      e.mesh = m; e.view = { root: m };
      this._meshes.set(e.id, m);
      this.scene.add(m);
      requestAuthoredUpgrade(m, this.renderer, this.scene);
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
    if (old) { this.scene.remove(old); disposeObject(old); this._meshes.delete(id); this._shadowReceiversDirty = true; }
    const m = this.vf.build(e);
    if (!m) return;
    const local = this._frameMembrane.toLocal(e.pos, _meshLocalXZ);
    m.position.set(local.x, 0, local.z);
    m.rotation.y = -e.rot;
    // carry the bank pose so the rebuilt hull doesn't momentarily sit level mid-turn
    const hull = m.userData && m.userData.hull;
    if (hull && e.bank != null) hull.rotation.x = e.bank;
    if (hull && e.pitch != null) hull.rotation.z = e.pitch;
    if (e.type === 'ship' || e.type === 'station') { attachContactShadow(m, e); configureShadowCasters(m); }
    e.mesh = m; e.view = { root: m };
    this._meshes.set(id, m);
    this.scene.add(m);
    requestAuthoredUpgrade(m, this.renderer, this.scene);
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
    return {
      x: Number.isFinite(focus.x) ? focus.x : 0,
      z: Number.isFinite(focus.z) ? focus.z : 0,
      halfX: halfH + margin,
      halfZ: halfV + margin,
      margin,
    };
  },

  _isEntityViewCulled(e, bounds) {
    if (!e || !bounds || e.id === this.state.playerId) return false;
    if (e.flags && (e.flags.forceRender || e.flags.neverCull)) return false;
    if (!e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return false;
    const local = this._frameMembrane.toLocal(e.pos, _cullLocalXZ);
    const radius = Math.max(0, Number(e.radius) || 0);
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

  syncEntityViews(alpha) {
    // Opt-in CPU attribution only — no performance.now()/ring write when disabled.
    const useCpu = !!(this.state && this.state.perfRuntime
      && this.state.perfRuntime.renderWorkEnabled
      && typeof this.state.perfRuntime.recordRenderWork === 'function');
    const started = useCpu && typeof performance !== 'undefined' ? performance.now() : 0;
    const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
    const bounds = this._entityViewCullBounds();
    let totalMeshes = 0;
    let transformed = 0;
    let fullSynced = 0;
    let culled = 0;
    let lodChecked = 0;
    const membrane = this._frameMembrane;
    for (const [id, m] of this._meshes) {
      totalMeshes++;
      const e = this.state.entities.get(id);
      if (!e || e.alive === false || !m) continue;
      if (this.collisionDebug && this.collisionDebug.on) m.userData.__lastEntity = e; // read-only debug overlay
      const viewCulled = this._isEntityViewCulled(e, bounds);
      if (viewCulled) culled++;
      const hull = m.userData && m.userData.hull;   // bankable inner group (ships only)
      if (e.flags.noInterp) {
        const local = membrane.toLocal(e.pos, _meshLocalXZ);
        m.position.set(local.x, 0, local.z); m.rotation.y = -e.rot;
        if (hull && e.bank != null) hull.rotation.x = e.bank; // roll around forward axis; +bank banks right
        if (hull && e.pitch != null) hull.rotation.z = e.pitch; // pitch lean nose up/down
      } else {
        const local = membrane.interpolateLocal(e.prevPos, e.pos, alpha, _meshLocalXZ);
        m.position.x = local.x;
        m.position.z = local.z;
        m.position.y = 0;
        let dr = e.rot - e.prevRot;
        dr = ((dr + Math.PI) % (Math.PI * 2)) - Math.PI; if (dr < -Math.PI) dr += Math.PI * 2;
        m.rotation.y = -(e.prevRot + dr * alpha);
        // interpolate bank for a smooth roll (prevBank snapshotted in core.preStep each step)
        if (hull && e.bank != null) {
          const pb = e.prevBank || 0;
          hull.rotation.x = pb + (e.bank - pb) * alpha;
        }
        // Pitch lean: nose pitches up under acceleration (boost) and relaxes otherwise.
        if (hull && e.pitch != null) {
          const pp = e.prevPitch || 0;
          hull.rotation.z = pp + (e.pitch - pp) * alpha;
        }
      }
      transformed++;
      // Projected-screen-size LOD (spec §12.4): resolve each entity's detail level from its projected
      // pixel width with hysteresis, so assets can drop detail at distance. The selector owns no
      // geometry; per-asset hooks read m.userData.lod.level and decide what to show. Cheap for entities
      // without a lod state (no closure attached).
      if (m.userData.lod && m.userData.updateLod) {
        lodChecked++;
        // Camera and mesh share frame-local space; pass mesh local XZ (not galactic-global).
        const px = projectedWidthPx(m.position, e.radius, this.cam.obj, this.viewport);
        // The player ship is a focal, readable object at normal flight scale. Authored LOD1 can hide
        // too much silhouette detail, so keep player control on LOD0 and reserve reduction for NPCs.
        const level = e.id === this.state.playerId ? 'lod0' : m.userData.lod.resolve(px);
        m.userData.updateLod(level);
        if (m.userData.hlod) configureShadowCasters(m);
      }
      if (viewCulled) continue;
      fullSynced++;
      // Hero-asset damage states (spec §9.11): hero meshes carry an updateDamageState closure that
      // modulates light groups / armor / drive from the live hull fraction so damage reads without the
      // HUD bar. Cheap no-op for non-hero meshes (no closure). Called once per frame per entity.
      if (m.userData.updateDamageState) m.userData.updateDamageState(e, now);
      if (m.userData.updateDriveState) m.userData.updateDriveState(e, now);

      // GR-5: persistent 3D shield bubble visibility + impact flash. Shown while shields hold; the
      // flash decays each frame and is punched up whenever the entity's shield value drops (impact).
      const sb = m.userData.shieldBubble;
      if (sb) {
        const up = e.shield > 0;
        if (sb.visible !== up) sb.visible = up;
        if (up) {
          const u = sb.material.uniforms;
          // detect shield loss since last frame -> punch the fresnel flash
          const prev = sb.userData._prevShield != null ? sb.userData._prevShield : e.shield;
          if (e.shield < prev - 0.5) u.uFlash.value = Math.min(1, u.uFlash.value + 0.8);
          sb.userData._prevShield = e.shield;
          // frame-rate-independent exponential decay: uFlash *= 0.05^(dt) settles in ~0.4s at any fps.
          const dt = Math.min(0.1, now - (sb.userData._prevFlashT != null ? sb.userData._prevFlashT : now));
          sb.userData._prevFlashT = now;
          u.uFlash.value *= Math.pow(0.05, dt);
        }
      }
    }
    this.state.render.entityViewSync = {
      totalMeshes,
      transformed,
      fullSynced,
      culled,
      lodChecked,
      cullHalfX: Math.round(bounds.halfX),
      cullHalfZ: Math.round(bounds.halfZ),
    };
    if (useCpu && started) {
      this.state.perfRuntime.recordRenderWork('entityViewSync', performance.now() - started);
    }
    this._publishHlodDiagnostics();
  },

  _publishHlodDiagnostics() {
    let hlodDetailedVisible = 0;
    let hlodProxyVisible = 0;
    let hlodObjectsSwapped = 0;
    for (const mesh of this._meshes.values()) {
      const hlod = mesh.userData && mesh.userData.hlod;
      if (!hlod) continue;
      hlodDetailedVisible += Number(hlod.detailedVisible) || 0;
      hlodProxyVisible += Number(hlod.proxyVisible) || 0;
      if (hlod.swapped) hlodObjectsSwapped++;
    }
    this.state.render.hlod = {
      hlodDetailedVisible,
      hlodProxyVisible,
      hlodObjectsSwapped,
    };
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

  prepareFrame(alpha, frameDt) {
    // While the GL context is lost, the renderer can't draw — skip all per-frame work until
    // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
    // renderer; the context-restore handler re-applies everything that matters when it returns.)
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
    if (this._meshReconcileDirty) this.reconcileMeshes();
    this._updateShipPitch(frameDt);
    this.syncEntityViews(alpha);
    this.cam.follow(frameDt);
    syncContactShadowPool(this._contactShadowPool, this.state.entityList, this._meshes);
    syncShipAuxPools(this._shipAuxPool, this.state.entityList, this._meshes);
    syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
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
    // an offset from its target; we move both together. No-op if shadows are disabled.
    this._updateShadowFollow();
    // Collision/socket/landing debug overlay (spec §12.5). Repositions pooled markers over the live
    // meshes once per frame; a cheap no-op when off (the group is hidden + nothing iterates).
      if (this.collisionDebug && this.collisionDebug.on) this.collisionDebug.update();
    if (useCpu) perf.recordRenderWork('prepareFrame', performance.now() - t0);
    return true;
  },

  // Cosmetic pitch lean: the ship hull tilts nose-up when boosting / accelerating hard, and relaxes
  // back to level when coasting. This is a render-only feel cue (does not affect physics/collision).
  _updateShipPitch(frameDt) {
    const dt = Math.min(0.05, Math.max(0, frameDt));
    const rate = 6.0;   // rad/s — snappy but not jittery
    for (const e of this.state.entityList) {
      if (!e.alive || (e.type !== 'ship' && e.type !== 'drone')) continue;
      if (e.flags && e.flags.docked) continue;
      const boosting = !!(e.flags && e.flags.boosting);
      const drive = this._engineDrive(e);
      let target = 0;
      if (boosting) target = -0.13;            // strong nose-up lean into afterburner
      else if (drive > 0.75) target = -0.055;  // moderate lean under hard thrust
      else if (drive > 0.35) target = -0.025;  // slight lean under cruise thrust
      // reverse-thrust read: if drive is high but velocity opposes heading, pitch forward slightly
      if (!boosting && drive > 0.3 && e.vel) {
        const vx = e.vel.x, vz = e.vel.z;
        const speed = Math.hypot(vx, vz);
        if (speed > 8) {
          const hx = Math.cos(e.rot), hz = Math.sin(e.rot);
          const align = (vx * hx + vz * hz) / Math.max(1, speed);
          if (align < -0.35) target = 0.07;    // braking/drifting backward
        }
      }
      if (e.pitch == null) e.pitch = 0;
      e.pitch += (target - e.pitch) * (1 - Math.exp(-rate * dt));
      if (Math.abs(e.pitch) < 0.0005 && Math.abs(target) < 0.0005) e.pitch = 0;
    }
  },

  // Approximate engine drive for a ship/drone for VFX/feel purposes. Mirrors the logic in vfx.js
  // without importing it, to keep renderer decoupled from vfx internals.
  _engineDrive(e) {
    if (!e.vel) return 0;
    const speed = Math.hypot(e.vel.x, e.vel.z);
    const maxSpd = Math.max(1, e.maxSpeed || 1);
    // A ship under thrust has speed near its heading; idle/drifting ships have low drive.
    const hx = Math.cos(e.rot), hz = Math.sin(e.rot);
    const align = speed > 1 ? (e.vel.x * hx + e.vel.z * hz) / speed : 0;
    return Math.max(0, Math.min(1, (speed / maxSpd) * Math.max(0, align)));
  },

  drawPreparedFrame() {
    if (this._contextLost) return false;
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
    const t0 = useCpu ? performance.now() : 0;
    // Post options sync on settings:changed, init, context restore, and render-graph creation —
    // not every draw (video settings are event-driven).
    // Render path selection (INTEGRATION_MAP §8.1). The SpaceRenderGraph is a capability-aware HDR
    // pipeline (GTAO-lite ambient occlusion + multiscale bloom + ACES/grade composite) that
    // supersedes the monolithic bloom wrapper. It is opt-in behind settings.video.renderGraph so the
    // proven bloom path stays the default; the render graph module is no longer tree-shaken because
    // it is reachable from this live branch. The energy materials I wired write HDR radiance that the
    // render graph composites with contact-depth AO.
    if (this.state.settings.video.renderGraph && this._ensureRenderGraph()) {
      this._lastRenderPath = 'renderGraph';
      if (useGpu) gpu.begin('drawPreparedFrame');
      try {
        this._renderGraph.render(this.scene, this.cam.obj, { time: this._bgTime || 0 });
      } finally {
        if (useGpu) gpu.end();
      }
    } else if (this.bloom && this.state.settings.video.bloom !== false) {
      this._lastRenderPath = 'bloom';
      // bloom.render() records bloomScene/Downsample/Upsample/Composite CPU+GPU groups.
      this.bloom.render(this.scene, this.cam.obj);
    } else {
      this._lastRenderPath = 'straight';
      if (useGpu) gpu.begin('drawPreparedFrame');
      try {
        this.renderer.render(this.scene, this.cam.obj);
      } finally {
        if (useGpu) gpu.end();
      }
    }
    if (useCpu) perf.recordRenderWork('drawPreparedFrame', performance.now() - t0);
    return true;
  },

  renderFrame(alpha, frameDt) {
    if (!this.prepareFrame(alpha, frameDt)) return;
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
    this._keyLight.target.updateMatrixWorld();
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

  // Accepts authoritative galactic-global XZ (and optional y); projects the frame-local point.
  worldToScreen(v) {
    this.cam.obj.updateMatrixWorld();
    const membrane = this._frameMembrane;
    const local = membrane
      ? membrane.toLocal(v, _w2sLocalXZ)
      : { x: v && v.x, z: v && v.z };
    _pt.set(local.x, (v && v.y) || 0, local.z).project(this.cam.obj);
    return {
      x: (_pt.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_pt.y * 0.5 + 0.5) * window.innerHeight,
      onScreen: _pt.z < 1 && Math.abs(_pt.x) <= 1 && Math.abs(_pt.y) <= 1,
    };
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
        renderScale: Math.min(1, Math.max(0.5, v.renderScale || 0.7)),
        bloomStrength: v.bloomStrength != null ? v.bloomStrength : 0.35,
        bloomThreshold: v.bloomThreshold != null ? v.bloomThreshold : 0.72,
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

function disposeObject(obj) {
  obj.traverse((c) => {
    if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
    else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
    if (c.material && !(c.userData && c.userData.sharedContactShadow)) { const mm = Array.isArray(c.material) ? c.material : [c.material]; mm.forEach((m) => m.dispose()); }
  });
}
