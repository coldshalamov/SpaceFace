// Render system: owns the WebGLRenderer, scene, lights, camera, starfield, and the entity→mesh
// lifecycle. Exposes worldToScreen / raycastToPlane via ctx.helpers and a renderFrame() the loop
// calls each animation frame. Sim never touches this; it's all in renderFrame (ARCHITECTURE §1,§2.4).
import * as THREE from 'three';
import { createChaseCamera } from './camera.js';
import { createStarfield } from './starfield.js';
import { createVisualFactory, setEnvMapForShips, invalidateVisualFactoryCaches } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import { createBloom } from './bloom.js';
import { SpaceRenderGraph } from './post/spaceRenderGraph.js';
import { invalidateAuthoredAsset } from './assetLoader.js';
import { getAuthoredInstancePoolDiagnostics, invalidatePartsLibraryCaches, preloadAuthoredPartLibrary, syncAuthoredInstancePools } from './partsLibrary.js';
import { projectedWidthPx } from './lod.js';
import { createCollisionDebug } from './collisionDebug.js';
import { installDiagnostics } from './diagnostics.js';
import { createPlanetFactory } from './planetFactory.js';

// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
function sectorNebulaTint(sector) {
  if (!sector) return null;
  const tier = sector.tier || 0;
  const sec = sector.security != null ? sector.security : 1;
  const danger = (1 - sec) + tier * 0.15; // blended danger metric
  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
}

// ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
let _shadowTex = null;
let _shadowGeo = null;
let _shadowMat = null;
const CONTACT_SHADOW_INITIAL_CAPACITY = 256;
const CONTACT_SHADOW_POS = new THREE.Vector3();
const CONTACT_SHADOW_SCALE = new THREE.Vector3();
const CONTACT_SHADOW_MATRIX = new THREE.Matrix4();
const CONTACT_SHADOW_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const RUNTIME_MESH_BUILD_BUDGET = 1;
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
  const pool = { scene, capacity: 0, mesh: null };
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
  if (previous && pool.scene) {
    pool.scene.remove(previous);
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  if (pool.scene) pool.scene.add(mesh);
}

function syncContactShadowPool(pool, entities, meshes) {
  if (!pool || !pool.mesh || !Array.isArray(entities)) return;
  let count = 0;
  for (const entity of entities) {
    if (!entity || entity.alive === false || entity._noShadow) continue;
    if (entity.type !== 'ship' && entity.type !== 'station') continue;
    const mesh = meshes && meshes.get(entity.id);
    if (!mesh || !(mesh.userData && mesh.userData.hasContactShadow)) continue;
    ensureContactShadowCapacity(pool, count + 1);
    const radius = Number(mesh.userData.contactShadowRadius) || Math.max(16, (entity.radius || 28) * 1.4);
    CONTACT_SHADOW_POS.set(entity.pos && Number.isFinite(entity.pos.x) ? entity.pos.x : mesh.position.x, -0.5,
      entity.pos && Number.isFinite(entity.pos.z) ? entity.pos.z : mesh.position.z);
    CONTACT_SHADOW_SCALE.set(radius, radius, radius);
    CONTACT_SHADOW_MATRIX.compose(CONTACT_SHADOW_POS, CONTACT_SHADOW_QUAT, CONTACT_SHADOW_SCALE);
    pool.mesh.setMatrixAt(count, CONTACT_SHADOW_MATRIX);
    count++;
  }
  pool.mesh.count = count;
  pool.mesh.visible = count > 0;
  pool.mesh.instanceMatrix.needsUpdate = true;
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
    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);

    // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
    // true). The key light becomes a shadow caster with a tight frustum that follows the player so
    // ships/stations cast real shadows on the play plane — a groundedness the contact-shadow disc
    // only faked. The bloom contract (bloom.js) is untouched: shadows write to the depth buffer
    // during the normal scene render, before bloom samples it.
    const shadowsOn = !(state.settings && state.settings.video && state.settings.video.shadows === false);
    if (shadowsOn) {
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      // Orthographic frustum sized to the local play area around the player (updated per frame in
      // renderFrame to follow the player). Tight bounds = crisp shadows at usable resolution.
      const SC = key.shadow.camera;
      SC.near = 10; SC.far = 600;
      SC.left = -700; SC.right = 700; SC.top = 700; SC.bottom = -700;
      SC.updateProjectionMatrix();
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.04;
      key.target = new THREE.Object3D(); scene.add(key.target);
    }

    const cam = createChaseCamera(state);
    const starfield = createStarfield(scene);
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
          // Force every entity mesh to rebuild so geometries/materials re-upload. The cleanest way
          // is to clear + reconcile: dispose the CPU mesh objects, then reconcileMeshes() rebuilds
          // them from the live entityList via the visual factory.
          this.clearAllMeshes(false);
          this._meshReconcileDirty = true;
          // Re-apply bloom + video settings (tone mapping / exposure live on settings:changed).
          bus.emit('settings:changed', { section: 'video' });
          bus.emit('toast', { text: 'Graphics recovered.', kind: 'good', ttl: 3 });
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[render] context-restore rebuild failed', err);
        }
      }, false);
    }

    // Preload the menu background (the only generated .jpg we use — the rest are captioned
    // contact-sheet references and are replaced by procedural materials / inline SVG).
    { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }

    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
      console.warn('[render] authored part library preload failed', error);
      return null;
    });
    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
    this._shadowSettingOn = shadowsOn;
    this._shadowReceiversDirty = true;
    this._shadowReceiverCount = 0;
    this._contactShadowPool = createContactShadowPool(scene);
    this.planetFactory = createPlanetFactory();
    this._planetBodies = [];
    // LOD projector viewport (CSS px); onResize refreshes it. Initialize from drawSize so the first
    // frame before onResize has sane values.
    { const dpr = renderer.getPixelRatio() || 1; this.viewport = { width: drawSize.x / dpr, height: drawSize.y / dpr }; }
    try { this.bloom = createBloom(renderer, drawSize.x, drawSize.y); }
    catch (err) { console.warn('[render] bloom unavailable, falling back:', err); this.bloom = null; }
    // Collision/socket/landing-contact debug visualization (spec §12.5). OFF by default; toggled via
    // the render system handle (state.render.debug.toggle) — wired to F7 in ui/input.js.
    try { this.collisionDebug = createCollisionDebug(this); }
    catch (err) { console.warn('[render] collision debug unavailable:', err); this.collisionDebug = null; }
    this._meshes = new Map(); // entityId -> Object3D
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
        post: () => ({
          activePath: this._lastRenderPath || null,
          bloomSelected: !!(this.bloom && state.settings && state.settings.video && state.settings.video.bloom !== false),
          bloom: this.bloom && typeof this.bloom.diagnostics === 'function' ? this.bloom.diagnostics() : null,
          renderGraph: !!this._renderGraph,
        }),
      });
      state.render.diagnostics = this.diag;
    }
    catch (err) { console.warn('[render] diagnostics unavailable:', err); this.diag = null; }

    state.render.scene = scene;
    state.render.renderer = renderer;
    state.render.camera = cam.obj;
    state.render.cameraCtrl = cam;   // controller (addTrauma/pushZoom) — exposed for feel.js / ui
    state.render.vf = vf;   // exposed for the dev-only ship turntable preview (shipPreview.js)
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
    ctx.helpers.socketWorldPos = (id, name) => this.socketWorldPos(id, name);

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
    bus.on('camera:zoom', ({ delta, level }) => { if (level != null) cam.setZoom(level); else cam.setZoom(state.camera.zoom + (delta || 0)); });
    bus.on('game:started', () => cam.snapToPlayer && cam.snapToPlayer());
    bus.on('save:loaded', () => cam.snapToPlayer && cam.snapToPlayer());
    bus.on('player:respawn', () => cam.snapToPlayer && cam.snapToPlayer());
    // Live-apply video settings changes. Without this, dragging Bloom strength / FOV / particle
    // quality in the settings screen did nothing (only the initial value was used) — a "slider that
    // doesn't work" sore thumb. We forward the values to the systems that own them.
    bus.on('settings:changed', (p) => {
      if (!p || p.section !== 'video') return;
      const vd = state.settings.video;
      if (this.bloom) this.bloom.setOptions({ bloom: vd.bloom, strength: vd.bloomStrength, threshold: vd.bloomThreshold, exposure: vd.exposure, acesToneMapping: vd.acesToneMapping !== false });
      if (p.key === 'shadows' || p.key == null) {
        this._shadowSettingOn = vd.shadows !== false;
        this._shadowReceiversDirty = true;
      }
      if (p.key === 'renderScale' || p.key === 'pixelRatioCap' || p.key == null) this.onResize();
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
      if (cam.snapToPlayer) cam.snapToPlayer();
      this._updatePlanetBodies(sector);
      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
      if (this.starfield && this.starfield.setSectorTint) {
        this.starfield.setSectorTint(sectorNebulaTint(sector));
      }
      this._updateHazardVisuals(sector);
    });
    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });

    window.addEventListener('resize', () => this.onResize());
  },

  clearAllMeshes(keepPlayer) {
    for (const [id, m] of [...this._meshes]) {
      if (keepPlayer && id === this.state.playerId) continue;
      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
    }
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
    let built = 0;
    let pendingBuilds = false;
    // remove meshes whose entity no longer exists or has died
    for (const [id, m] of this._meshes) {
      const e = state.entities.get(id);
      if (!e || e.alive === false) { this.scene.remove(m); disposeObject(m); this._meshes.delete(id); this._shadowReceiversDirty = true; }
    }
    // build meshes for alive entities that lack one (fx are particle-managed by vfx -> mark + skip)
    for (const e of state.entityList) {
      if (e._noMesh || this._meshes.has(e.id)) continue;
      if (built >= buildBudget) {
        pendingBuilds = true;
        continue;
      }
      const m = this.vf.build(e);
      if (!m) { e._noMesh = true; continue; }
      m.position.set(e.pos.x, 0, e.pos.z);
      m.rotation.y = -e.rot;
      if (e.type === 'ship' || e.type === 'station') { attachContactShadow(m, e); configureShadowCasters(m); }
      e.mesh = m; e.view = { root: m };
      this._meshes.set(e.id, m);
      this.scene.add(m);
      requestAuthoredUpgrade(m, this.renderer, this.scene);
      this._shadowReceiversDirty = true;
      built++;
    }
    this._meshReconcileDirty = pendingBuilds;
    if (!pendingBuilds) this._initialMeshReconcileComplete = true;
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
    m.position.set(e.pos.x, 0, e.pos.z);
    m.rotation.y = -e.rot;
    // carry the bank pose so the rebuilt hull doesn't momentarily sit level mid-turn
    const hull = m.userData && m.userData.hull;
    if (hull && e.bank != null) hull.rotation.x = e.bank;
    if (e.type === 'ship' || e.type === 'station') { attachContactShadow(m, e); configureShadowCasters(m); }
    e.mesh = m; e.view = { root: m };
    this._meshes.set(id, m);
    this.scene.add(m);
    requestAuthoredUpgrade(m, this.renderer, this.scene);
    this._shadowReceiversDirty = true;
  },


  syncEntityViews(alpha) {
    const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
    for (const e of this.state.entityList) {
      const m = e.mesh; if (!m) continue;
      if (this.collisionDebug && this.collisionDebug.on) m.userData.__lastEntity = e; // read-only debug overlay
      const hull = m.userData && m.userData.hull;   // bankable inner group (ships only)
      if (e.flags.noInterp) {
        m.position.set(e.pos.x, 0, e.pos.z); m.rotation.y = -e.rot;
        if (hull && e.bank != null) hull.rotation.x = e.bank; // roll around forward axis; +bank banks right
      } else {
        m.position.x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
        m.position.z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
        m.position.y = 0;
        let dr = e.rot - e.prevRot;
        dr = ((dr + Math.PI) % (Math.PI * 2)) - Math.PI; if (dr < -Math.PI) dr += Math.PI * 2;
        m.rotation.y = -(e.prevRot + dr * alpha);
        // interpolate bank for a smooth roll (prevBank snapshotted in core.preStep each step)
        if (hull && e.bank != null) {
          const pb = e.prevBank || 0;
          hull.rotation.x = pb + (e.bank - pb) * alpha;
        }
      }
      // Hero-asset damage states (spec §9.11): hero meshes carry an updateDamageState closure that
      // modulates light groups / armor / drive from the live hull fraction so damage reads without the
      // HUD bar. Cheap no-op for non-hero meshes (no closure). Called once per frame per entity.
      if (m.userData.updateDamageState) m.userData.updateDamageState(e, now);

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
      // Projected-screen-size LOD (spec §12.4): resolve each entity's detail level from its projected
      // pixel width with hysteresis, so assets can drop detail at distance. The selector owns no
      // geometry; per-asset hooks read m.userData.lod.level and decide what to show. Cheap for entities
      // without a lod state (no closure attached).
      if (m.userData.lod && m.userData.updateLod) {
        const px = projectedWidthPx(e.pos, e.radius, this.cam.obj, this.viewport);
        const level = m.userData.lod.resolve(px);
        m.userData.updateLod(level);
      }
    }
  },

  _updatePlanetBodies(sector) {
    for (const b of this._planetBodies) { this.scene.remove(b.mesh); }
    this.planetFactory.disposeBodies(this._planetBodies);
    this._planetBodies = this.planetFactory.buildSectorBodies(sector);
    for (const b of this._planetBodies) {
      b.mesh.position.copy(b.basePos);
      this.scene.add(b.mesh);
    }
    this._shadowReceiversDirty = true;
  },

  _updatePlanetParallax() {
    const cam = this.cam.obj.position;
    // GR-4: advance the planet cloud-drift uniform from the background clock (sim-scaled, not wall
    // clock) so hit-stop/pause also stills the clouds. Sun bodies have no uTime uniform; planet
    // surface materials do — the lazy read avoids a per-body branch on suns.
    const t = this._bgTime || 0;
    for (const b of this._planetBodies) {
      b.mesh.position.x = b.basePos.x + cam.x * (1 - b.parallax);
      b.mesh.position.z = b.basePos.z + cam.z * (1 - b.parallax);
      const u = b.mesh.material && b.mesh.material.uniforms && b.mesh.material.uniforms.uTime;
      if (u) u.value = t;
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

    for (const hz of sector.hazards) {
      const style = hazardStyles[hz.type] || hazardStyles.debris;
      const intensityScale = hz.intensity != null ? hz.intensity : 0.5;

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
      disc.position.set(hz.center.x, -0.5, hz.center.z);
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
        ring.position.set(hz.center.x, -0.4, hz.center.z);
        ring.renderOrder = -2;
        ring.frustumCulled = false;
        this.scene.add(ring);
        this._hazardVisuals.push(ring);
      }
    }
  },

  renderFrame(alpha, frameDt) {
    // While the GL context is lost, the renderer can't draw — skip all per-frame work until
    // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
    // renderer; the context-restore handler re-applies everything that matters when it returns.)
    if (this._contextLost) return;
    if (this._meshReconcileDirty) this.reconcileMeshes();
    this.syncEntityViews(alpha);
    this.cam.follow(frameDt);
    syncContactShadowPool(this._contactShadowPool, this.state.entityList, this._meshes);
    syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
    this.starfield.recenter(this.cam.obj.position);
    // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
    this._bgTime = (this._bgTime || 0) + frameDt * ts;
    if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
    this._updatePlanetParallax();
    this._syncShadowMapEnabled();
    // Shadow follow (graphics spec G): keep the key light's shadow frustum centered on the player
    // so the tight 1400-unit ortho box always covers the local action. DirectionalLight position is
    // an offset from its target; we move both together. No-op if shadows are disabled.
    this._updateShadowFollow();
    // Render path selection (INTEGRATION_MAP §8.1). The SpaceRenderGraph is a capability-aware HDR
    // pipeline (GTAO-lite ambient occlusion + multiscale bloom + ACES/grade composite) that
    // supersedes the monolithic bloom wrapper. It is opt-in behind settings.video.renderGraph so the
    // proven bloom path stays the default; the render graph module is no longer tree-shaken because
    // it is reachable from this live branch. The energy materials I wired write HDR radiance that the
    // render graph composites with contact-depth AO.
    if (this.state.settings.video.renderGraph && this._ensureRenderGraph()) {
      this._lastRenderPath = 'renderGraph';
      this._renderGraph.render(this.scene, this.cam.obj, { time: this._bgTime || 0 });
    } else if (this.bloom && this.state.settings.video.bloom !== false) {
      this._lastRenderPath = 'bloom';
      this.bloom.render(this.scene, this.cam.obj);
    } else {
      this._lastRenderPath = 'straight';
      this.renderer.render(this.scene, this.cam.obj);
    }
    // Collision/socket/landing debug overlay (spec §12.5). Repositions pooled markers over the live
    // meshes once per frame; a cheap no-op when off (the group is hidden + nothing iterates).
    if (this.collisionDebug && this.collisionDebug.on) this.collisionDebug.update();
  },

  // Center the key light + its shadow camera on the player each frame. The light direction stays
  // fixed (60,140,40 offset); only the origin translates so shadows track the player across the
  // sector instead of being pinned to world (0,0,0) and clipping at the frustum edge.
  _updateShadowFollow() {
    if (!this._keyLight) return;
    if (!this.renderer.shadowMap || !this.renderer.shadowMap.enabled) return;
    const p = this.state.playerId ? (this.state.entities && this.state.entities.get(this.state.playerId)) : null;
    const px = p ? p.pos.x : 0, pz = p ? p.pos.z : 0;
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

  worldToScreen(v) {
    _pt.set(v.x, v.y || 0, v.z).project(this.cam.obj);
    return {
      x: (_pt.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_pt.y * 0.5 + 0.5) * window.innerHeight,
      onScreen: _pt.z < 1 && Math.abs(_pt.x) <= 1 && Math.abs(_pt.y) <= 1,
    };
  },

  raycastToPlane(ndc) {
    _v2.set(ndc.x, ndc.y);
    _ray.setFromCamera(_v2, this.cam.obj);
    const hit = _ray.ray.intersectPlane(_plane, _pt);
    return hit ? { x: hit.x, z: hit.z } : { x: 0, z: 0 };
  },

  // World XZ of a named attachment socket on an entity's mesh, or null if the entity has no mesh or no
  // such socket. Used by VFX to originate weapon/mining/engine effects from authored hardware (spec
  // §9.9) instead of the entity center. Failure returns null so callers fall back to the payload origin.
  socketWorldPos(entityId, socketName) {
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
    return { x: socket.matrixWorld.elements[12], z: socket.matrixWorld.elements[14] };
  },

  onResize() {
    const drawSize = applyRendererSize(this.renderer, this.state);
    if (this.bloom) this.bloom.setSize(drawSize.x, drawSize.y);
    if (this._renderGraph) this._renderGraph.setSize(drawSize.x, drawSize.y, this.renderer.getPixelRatio() || 1);
    this.cam.onResize();
    // Cache the CSS-pixel viewport for the LOD projector (projectedWidthPx expects CSS px, matching
    // the projected-width thresholds in spec §12.4). Drawing-buffer size carries devicePixelRatio.
    const dpr = this.renderer.getPixelRatio() || 1;
    this.viewport = { width: drawSize.x / dpr, height: drawSize.y / dpr };
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
        bloomStrength: v.bloomStrength != null ? v.bloomStrength : 0.9,
        bloomThreshold: v.bloomThreshold != null ? v.bloomThreshold : 0.65,
      });
      this._renderGraph.setSize(drawSize.x, drawSize.y, this.renderer.getPixelRatio() || 1);
      // Expose for diagnostics + the energy-materials depth binding path.
      this.state.render.renderGraph = this._renderGraph;
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
  const base = Math.min(window.devicePixelRatio || 1, cap);
  renderer.setPixelRatio(Math.max(0.25, base * scale));
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer.getDrawingBufferSize(_drawSize);
}

function finiteInRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function disposeObject(obj) {
  obj.traverse((c) => {
    if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
    else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
    if (c.material && !(c.userData && c.userData.sharedContactShadow)) { const mm = Array.isArray(c.material) ? c.material : [c.material]; mm.forEach((m) => m.dispose()); }
  });
}
