// Player-facing ship preview mount (UX-1). A self-contained mini 3D renderer that builds a ship mesh
// via the visualFactory and rotates it inside a small <canvas> — used by the Shipyard (on row
// hover/select) and the New Game screen (static starter pose). The hard part (mesh building) is
// already solved by visualFactory + shipPreview's framing/texture-warmup; this is a thin, safe,
// player-facing wrapper with its own WebGLRenderer so it never touches the live game scene/camera.
//
// Why a separate renderer: the main renderer/scene/camera are owned by the sim loop and continuously
// mutated. Rendering a ship turntable through them would fight the game's render. A dedicated
// offscreen renderer + scene + camera is cheap (one ship, low-res RT) and isolated.
//
// Resource discipline: each mount owns its renderer and disposes it on `dispose()`. The mesh's
// textures/materials are shared with the visualFactory (procedural canvas textures) — we do NOT
// dispose those (the factory may reuse them); we only dispose our renderer + RT + geometry we add.
import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { disposeAuthoredAssetRuntime, loadAuthoredPart } from '../render/assetLoader.js';
import { preloadAuthoredPartLibrary } from '../render/partsLibrary.js';
import { isReleaseAssetMode } from '../render/releaseMode.js';
import { setEnvMapForShips, createVisualFactory } from '../render/visualFactory.js';
import { installVisualOverrides } from '../render/visualOverrides.js';
import { buildKestrelHero } from '../render/ships/kestrelHero.js';

const PART_ROOT = 'assets/ships/parts/';
const PART_RELEASE_ROOT = 'assets/ships/release/parts/';
const SHIP_PREVIEW_CACHE_LIMIT = 16;
const FAST_PREVIEW_MATERIALS = new Map();

/** Station archetype → shipyard preview dock interior (shaded hangar shell). */
export const DOCK_INTERIOR_BY_ARCHETYPE = Object.freeze({
  place_station_military: 'place_dock_interior_military',
  place_station_blackmarket: 'place_dock_interior_grit',
});

export function dockInteriorIdForArchetype(archetypeGlb) {
  if (typeof archetypeGlb === 'string' && DOCK_INTERIOR_BY_ARCHETYPE[archetypeGlb]) {
    return DOCK_INTERIOR_BY_ARCHETYPE[archetypeGlb];
  }
  return 'place_dock_interior';
}

function dockPartUrls(id) {
  const file = `places/${id}.glb`;
  if (!isReleaseAssetMode()) return [`${PART_ROOT}${file}`];
  return [`${PART_RELEASE_ROOT}${file}`, `${PART_ROOT}${file}`];
}

function groupFromBlueprint(record) {
  const root = new THREE.Group();
  root.name = 'DockInterior';
  for (const prim of record.primitives) {
    const mesh = new THREE.Mesh(prim.geometry, prim.material);
    mesh.name = prim.name;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    prim.matrix.decompose(pos, quat, scl);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    mesh.scale.copy(scl);
    root.add(mesh);
  }
  return root;
}

const WPN_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MOD_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

function fastPreviewMaterial(key, color, opts = {}) {
  let material = FAST_PREVIEW_MATERIALS.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness == null ? 0.52 : opts.roughness,
      metalness: opts.metalness == null ? 0.34 : opts.metalness,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissiveIntensity || 0,
      transparent: !!opts.transparent,
      opacity: opts.opacity == null ? 1 : opts.opacity,
      depthWrite: opts.depthWrite !== false,
    });
    FAST_PREVIEW_MATERIALS.set(key, material);
  }
  return material;
}

function addFastMesh(parent, geometry, material, name, position, rotation, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh);
  return mesh;
}

function addFastEngine(root, x, y, z, size, materials) {
  addFastMesh(
    root,
    new THREE.CylinderGeometry(size * 0.26, size * 0.34, size * 0.5, 10),
    materials.dark,
    'PreviewEngineNozzle',
    [x, y, z],
    [0, 0, Math.PI / 2],
  );
  addFastMesh(
    root,
    new THREE.ConeGeometry(size * 0.34, size * 0.9, 14),
    materials.glow,
    'PreviewEnginePlume',
    [x - size * 0.45, y, z],
    [0, 0, Math.PI / 2],
  );
}

function buildFastPreviewMesh(defId) {
  const def = SHIP_BY_ID.get(defId);
  if (!def) return null;
  const root = new THREE.Group();
  root.name = `FastPreview_${defId}`;
  root.userData.kind = 'ship';

  const radius = def.collisionRadius || 14;
  const visuals = def.visuals || {};
  const props = visuals.proportions || {};
  const role = String(def.role || '').toLowerCase();
  const length = Math.max(1.05, props.length || (role.includes('capital') ? 2.1 : role.includes('freighter') ? 1.75 : 1.35)) * radius;
  const halfWidth = Math.max(0.32, props.halfWidth || (role.includes('capital') ? 0.82 : role.includes('freighter') ? 0.72 : 0.48)) * radius;
  const height = Math.max(0.18, props.height || 0.32) * radius;
  const isCargo = role.includes('freighter') || role.includes('hauler') || role.includes('barge');
  const isCapital = role.includes('capital') || role.includes('battle') || role.includes('corvette') || role.includes('gunship');
  const isMiner = role.includes('mining') || role.includes('miner');

  const materials = {
    hull: fastPreviewMaterial('fast:hull', 0x8fa3bb, { metalness: 0.28, roughness: 0.56 }),
    trim: fastPreviewMaterial('fast:trim', 0x263246, { metalness: 0.48, roughness: 0.44 }),
    dark: fastPreviewMaterial('fast:dark', 0x101722, { metalness: 0.72, roughness: 0.38 }),
    glass: fastPreviewMaterial('fast:glass', 0x73d8ff, {
      metalness: 0.05, roughness: 0.18, emissive: 0x39d0ff, emissiveIntensity: 0.16,
      transparent: true, opacity: 0.82, depthWrite: false,
    }),
    glow: fastPreviewMaterial('fast:glow', 0x57dfff, {
      metalness: 0.02, roughness: 0.22, emissive: 0x39d0ff, emissiveIntensity: 1.25,
      transparent: true, opacity: 0.72, depthWrite: false,
    }),
  };

  addFastMesh(
    root,
    new THREE.BoxGeometry(length * (isCargo ? 0.78 : 0.62), height, halfWidth * 1.35),
    materials.hull,
    'PreviewHullCore',
    [-length * 0.06, 0, 0],
  );
  addFastMesh(
    root,
    new THREE.ConeGeometry(halfWidth * (isCapital ? 0.75 : 0.58), length * 0.42, isCapital ? 6 : 4),
    materials.hull,
    'PreviewProw',
    [length * 0.42, 0, 0],
    [0, 0, -Math.PI / 2],
  );
  addFastMesh(
    root,
    new THREE.BoxGeometry(length * 0.32, height * 0.58, Math.max(halfWidth * 0.2, 1.4)),
    materials.trim,
    'PreviewKeel',
    [-length * 0.18, -height * 0.08, 0],
  );

  if (isCargo || isCapital) {
    const podCount = isCapital ? 4 : 3;
    for (let i = 0; i < podCount; i++) {
      const x = -length * 0.25 + (i - (podCount - 1) / 2) * length * 0.16;
      addFastMesh(root, new THREE.BoxGeometry(length * 0.14, height * 0.85, halfWidth * 0.34), materials.trim, 'PreviewCargoPodPort', [x, 0, -halfWidth * 0.98]);
      addFastMesh(root, new THREE.BoxGeometry(length * 0.14, height * 0.85, halfWidth * 0.34), materials.trim, 'PreviewCargoPodStarboard', [x, 0, halfWidth * 0.98]);
    }
  } else {
    addFastMesh(root, new THREE.BoxGeometry(length * 0.42, height * 0.32, halfWidth * 1.1), materials.trim, 'PreviewWingPort', [-length * 0.05, -height * 0.18, -halfWidth * 0.72]);
    addFastMesh(root, new THREE.BoxGeometry(length * 0.42, height * 0.32, halfWidth * 1.1), materials.trim, 'PreviewWingStarboard', [-length * 0.05, -height * 0.18, halfWidth * 0.72]);
  }

  if (isMiner) {
    addFastMesh(root, new THREE.CylinderGeometry(height * 0.18, height * 0.24, length * 0.28, 8), materials.dark, 'PreviewMiningDrill', [length * 0.64, -height * 0.1, 0], [0, 0, Math.PI / 2]);
    addFastMesh(root, new THREE.ConeGeometry(height * 0.28, length * 0.16, 8), materials.glow, 'PreviewMiningTip', [length * 0.82, -height * 0.1, 0], [0, 0, -Math.PI / 2]);
  }

  addFastMesh(root, new THREE.SphereGeometry(Math.max(height * 0.32, 1.4), 16, 8), materials.glass, 'PreviewCanopy', [length * 0.12, height * 0.58, 0], [0, 0, 0], [1.4, 0.65, 0.9]);
  const mounts = visuals.engineMounts && visuals.engineMounts.length
    ? visuals.engineMounts
    : [{ pos: [-0.68, 0, -0.24], scaleK: 1 }, { pos: [-0.68, 0, 0.24], scaleK: 1 }];
  for (const mount of mounts.slice(0, 6)) {
    const p = mount.pos || [-0.68, 0, 0];
    addFastEngine(root, p[0] * radius, p[1] * radius, p[2] * radius, Math.max(1.5, radius * 0.18 * (mount.scaleK || 1)), materials);
  }

  const hardpoints = visuals.hardpoints || [];
  for (const hp of hardpoints.slice(0, 8)) {
    const p = hp.pos || [0, 0, 0];
    addFastMesh(root, new THREE.CylinderGeometry(radius * 0.035, radius * 0.045, radius * 0.28, 8), materials.dark, 'PreviewHardpoint', [p[0] * radius, p[1] * radius + height * 0.15, p[2] * radius], [0, 0, Math.PI / 2]);
  }

  root.userData.previewFastLod = true;
  return root;
}

/**
 * Build a ship entity the visual factory can consume.
 * When `loadout.fittings` is provided (outfitting / player's active hull), use that exact
 * loadout so the pad shows the same ship you fly. Otherwise fill stock demo modules so
 * catalog hull previews still show weapons/engines.
 */
function makeEntity(defId, seedId, loadout = null) {
  const def = SHIP_BY_ID.get(defId);
  if (!def) return null;

  let fittings;
  let weapons;

  if (loadout && Array.isArray(loadout.fittings)) {
    // Player/outfitting path: fittings[] is parallel to buildSlotList (weapon, shield, …).
    // visualFactory reads that array directly for barrels, engines, shield ring, mining drill.
    fittings = loadout.fittings.slice();
    weapons = Array.isArray(loadout.weapons) ? loadout.weapons.slice() : [];
  } else {
    // Stock catalog demo loadout — parallel to visualFactory slot order:
    // weapon → shield → engine → cargo → mining → utility.
    fittings = [];
    weapons = [];
    const slots = def.slots || {};
    const order = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];
    let slotIndex = 0;
    for (const type of order) {
      const arr = slots[type] || [];
      for (let i = 0; i < arr.length; i++) {
        const entry = arr[i];
        const size = (typeof entry === 'object' && entry.size) || (typeof entry === 'string' ? entry : 'S');
        let pick = null;
        if (type === 'weapon') {
          pick = WEAPONS.find((x) => x.size === size) || WEAPONS[0] || null;
          if (pick) {
            weapons.push({
              slotIndex,
              defId: pick.id,
              facing: (entry && entry.facing) || 'front',
              tracking: pick.tracking || 'fixed',
            });
          }
        } else {
          pick = MODULES.find((m) => m.slotType === type && (!m.size || m.size === size))
            || MODULES.find((m) => m.slotType === type)
            || null;
        }
        fittings.push(pick ? pick.id : null);
        slotIndex++;
      }
    }
  }

  return {
    id: seedId, type: 'ship', team: 0, factionId: 'faction_free',
    // isPlayer unlocks the Hitch/Kestrel hero visual (same mesh as flight). Catalog stock previews stay false.
    isPlayer: !!(loadout && loadout.isPlayer),
    pos: { x: 0, z: 0 }, rot: Math.PI * 0.15, prevPos: { x: 0, z: 0 }, prevRot: 0, bank: 0,
    radius: def.collisionRadius || 14,
    data: { defId, fittings, weapons, miningBeam: null },
  };
}

function meshCacheKey(defId, loadout) {
  if (!defId) return null;
  if (!loadout || !Array.isArray(loadout.fittings)) return defId;
  return defId + '::' + loadout.fittings.map((id) => (id == null ? '-' : String(id))).join('|');
}

/**
 * Create a ship preview mount attached to a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {object} [opts.envMap]  - the main scene's PMREM envMap (for chrome); optional
 * @param {string} [opts.dockId]  - place_dock_interior* part id for station hangar backdrop; optional
 * @returns {{ show(defId, opts):void, setRotating(boolean):void, setYaw(number):void, rotateBy(number):void, setZoom(number):void, zoomBy(number):void, getView():object, setDockId(string):void, setActive(boolean):void, warmAssets():Promise<boolean>, resize():void, frame():void, dispose():void }}
 */
export function createShipPreviewMount(canvas, opts) {
  opts = opts || {};
  let W = canvas.clientWidth || canvas.width || 320;
  let H = canvas.clientHeight || canvas.height || 200;
  const useDock = typeof opts.dockId === 'string' && opts.dockId.length > 0;
  const onFirstFrame = typeof opts.onFirstFrame === 'function' ? opts.onFirstFrame : null;
  const authoredShips = opts.authoredShips !== false && opts.authoredWarmup !== false;
  // Station/menu pads must never silently sit on the box LOD. Only allow it if the caller
  // explicitly opts in (devtools). Outfitting/shipyard/new-game pass allowFastFallback:false.
  const fastPreview = opts.fastPreview === true;
  const allowFastFallback = opts.allowFastFallback === true || fastPreview === true;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: !useDock,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(useDock ? 0x05070d : 0x000000, useDock ? 1 : 0);
  // Match flight: tone-map so materials don't read as flat gray slabs.
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if ('toneMapping' in renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }

  const scene = new THREE.Scene();
  if (useDock) scene.fog = new THREE.FogExp2(0x0a1426, 0.012);
  // Hangar rig: warmer key from dock lamps + cool rim from bay glass when a dock shell is present.
  scene.add(new THREE.AmbientLight(0x6a7a96, useDock ? 0.85 : 1.0));
  const key = new THREE.DirectionalLight(useDock ? 0xffd9b0 : 0xe8f0ff, useDock ? 1.55 : 1.85);
  key.position.set(-0.55, 1.1, 0.75); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8a7cff, useDock ? 0.55 : 0.85);
  rim.position.set(0.75, 0.35, -0.55); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x39d0ff, useDock ? 0.35 : 0.45);
  fill.position.set(0.5, -0.25, 0.45); scene.add(fill);
  if (useDock) {
    const pad = new THREE.PointLight(0x39d0ff, 0.55, 80);
    pad.position.set(0, -1, 0); scene.add(pad);
  }

  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 2000);
  cam.position.set(0, 0, 50);

  // hand the main scene's envMap to the factory so chrome/authority hulls mirror the nebula
  if (opts.envMap) setEnvMapForShips(opts.envMap);
  // Always create the factory for real ship meshes (even if a caller set fastPreview by mistake).
  const vf = createVisualFactory();
  if (vf) {
    installVisualOverrides(vf, {
      authoredShips,
      onWarning: (message, error) => console.warn(message, error),
    });
  }

  let current = null;     // the displayed THREE.Object3D
  let dockRoot = null;
  let dockId = useDock ? opts.dockId : null;
  let dockLoadGen = 0;
  let rotating = true;
  let active = true;
  let yaw = 0;
  let zoom = 1;
  let rafId = 0;
  let disposed = false;
  let renderedDefId = null;
  let warmupPromise = null;
  const meshCache = new Map(); // defId -> THREE.Object3D, retained to avoid rebuilding on hover.
  const meshCacheOrder = [];

  function disposePreviewMesh(mesh) {
    if (!mesh) return;
    mesh.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
  }

  function touchCachedMesh(defId, mesh) {
    if (!defId || !mesh) return;
    if (!meshCache.has(defId)) meshCache.set(defId, mesh);
    const idx = meshCacheOrder.indexOf(defId);
    if (idx >= 0) meshCacheOrder.splice(idx, 1);
    meshCacheOrder.push(defId);
    while (meshCacheOrder.length > SHIP_PREVIEW_CACHE_LIMIT) {
      const evictId = meshCacheOrder.shift();
      if (!evictId || evictId === defId) continue;
      const evicted = meshCache.get(evictId);
      meshCache.delete(evictId);
      if (evicted && evicted !== current) disposePreviewMesh(evicted);
    }
  }

  function tagAndCache(mesh, defId, cacheId) {
    if (!mesh) return null;
    mesh.userData.previewDefId = defId;
    mesh.userData.previewCacheId = cacheId;
    // Warm procedural canvas textures so the first frame isn't black.
    mesh.traverse((c) => {
      const m = c.material;
      if (!m) return;
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture && v.image && typeof v.needsUpdate !== 'undefined') v.needsUpdate = true;
      }
    });
    touchCachedMesh(cacheId, mesh);
    return mesh;
  }

  function isGrayFallbackBox(mesh) {
    if (!mesh) return true;
    if (mesh.userData && mesh.userData.kind === 'fallback') return true;
    // visualFactory's last-resort is a single BoxGeometry mesh with no children.
    return !!(mesh.isMesh
      && mesh.geometry
      && mesh.geometry.type === 'BoxGeometry'
      && (!mesh.children || mesh.children.length === 0));
  }

  function buildPreviewMesh(defId, loadout = null) {
    const cacheId = (meshCacheKey(defId, loadout) || defId)
      + (loadout && loadout.isPlayer ? '::player' : '');

    const ent = makeEntity(defId, 1, loadout) || makeEntity(defId, 1, { isPlayer: true });
    if (ent) ent.isPlayer = !!(loadout && loadout.isPlayer) || defId === 'ship_kestrel';

    // 1) Hitch (ship_kestrel) — flight hero mesh. This is the ship the player owns at start.
    if (defId === 'ship_kestrel') {
      try {
        const hero = buildKestrelHero(ent);
        if (hero && !isGrayFallbackBox(hero)) {
          hero.userData.previewFastLod = false;
          return tagAndCache(hero, defId, cacheId);
        }
        console.error('[shipPreviewMount] Hitch hero returned unusable mesh');
      } catch (err) {
        console.error('[shipPreviewMount] Hitch hero preview FAILED', err);
      }
    }

    // 2) Full visual factory (same path as flight NPCs / non-starter hulls).
    if (ent && vf) {
      let mesh = null;
      try {
        // Ensure factory hero override also fires for Hitch if path (1) was skipped.
        if (defId === 'ship_kestrel') ent.isPlayer = true;
        mesh = vf.build(ent);
      } catch (e) {
        console.error('[shipPreviewMount] visualFactory.build failed', defId, e);
        mesh = null;
      }
      if (mesh && !isGrayFallbackBox(mesh) && !mesh.userData.previewFastLod) {
        mesh.userData.previewFastLod = false;
        return tagAndCache(mesh, defId, cacheId);
      }
    }

    // 3) Explicit box LOD only if allowed (devtools). Station UI does NOT allow this.
    if (allowFastFallback || fastPreview) {
      console.warn('[shipPreviewMount] using fast box silhouette for', defId);
      const fastMesh = buildFastPreviewMesh(defId);
      if (fastMesh) fastMesh.userData.previewFastLod = true;
      return tagAndCache(fastMesh, defId, cacheId);
    }

    console.error('[shipPreviewMount] NO MESH for', defId, '— refusing box LOD');
    return null;
  }

  function resize() {
    const nextW = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || W || 320));
    const nextH = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || H || 200));
    if (nextW === W && nextH === H) return;
    W = nextW; H = nextH;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  }

  // The settled engineering view is event-rendered. A ResizeObserver prevents a stale 1x-sized
  // backing store when the workspace morphs without paying for a permanent animation loop.
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      if (disposed || !active) return;
      resize();
      renderer.render(scene, cam);
    })
    : null;
  if (resizeObserver) resizeObserver.observe(canvas);

  async function loadDockBackdrop(id) {
    if (!id || disposed) return;
    const gen = ++dockLoadGen;
    let record = null;
    for (const url of dockPartUrls(id)) {
      record = await loadAuthoredPart(url, { renderer, slot: 'place', optional: true });
      if (record) break;
    }
    if (!record || gen !== dockLoadGen || disposed) return;
    if (dockRoot) {
      scene.remove(dockRoot);
      dockRoot = null;
    }
    dockRoot = groupFromBlueprint(record);
    dockRoot.position.y = 1.5;
    scene.add(dockRoot);
    renderNow();
    if (active && rotating && !rafId) requestLoop();
  }

  if (dockId) loadDockBackdrop(dockId).catch(() => {});

  function requestCurrentAuthoredUpgrade() {
    if (!authoredShips) return;
    const request = current && current.userData && current.userData.requestAuthoredUpgrade;
    if (typeof request === 'function') request(renderer, scene);
  }

  function warmAssets() {
    if (!authoredShips) return Promise.resolve(false);
    if (!warmupPromise) {
      warmupPromise = preloadAuthoredPartLibrary(renderer)
        .then(() => {
          if (disposed) return false;
          requestCurrentAuthoredUpgrade();
          renderNow();
          if (active && rotating && !rafId) requestLoop();
          return true;
        })
        .catch((error) => {
          console.warn('[shipPreviewMount] authored preview warmup failed', error);
          return false;
        });
    }
    return warmupPromise;
  }

  function renderNow() {
    if (disposed) return;
    resize();
    if (current && rotating) {
      yaw += 0.012;
      current.rotation.y = yaw;
    }
    renderer.render(scene, cam);
    const defId = current && current.userData && current.userData.previewDefId;
    if (defId && defId !== renderedDefId) {
      renderedDefId = defId;
      if (onFirstFrame) onFirstFrame({ defId });
    }
  }

  function requestLoop() {
    if (disposed || !active || rafId) return;
    rafId = requestAnimationFrame(frame);
  }

  function frame() {
    rafId = 0;
    if (disposed) return;
    if (!active) return;
    renderNow();
    requestLoop();
  }

  /**
   * Project a point in the current ship's local space to canvas client coordinates.
   * Useful for overlay highlights (hardpoints, power beams) that track the turntable.
   * Returns null if no ship is currently displayed or the renderer is not ready.
   * @param {{x:number,y:number,z:number}} localPos
   * @returns {{x:number,y:number}|null}
   */
  function projectLocalPoint(localPos) {
    if (!current || !cam || !renderer || !canvas) return null;
    const pos = new THREE.Vector3(localPos.x || 0, localPos.y || 0, localPos.z || 0);
    current.updateWorldMatrix(true, false);
    pos.applyMatrix4(current.matrixWorld);
    pos.project(cam);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (pos.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-pos.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  /** @returns {string|null} current displayed defId, or null. */
  function getDefId() { return current && current.userData && current.userData.previewDefId; }

  /**
   * Show a ship by defId. Rebuilds the mesh + reframes the camera around its bounding sphere.
   * @param {string} defId
   * @param {object} [o] - { rotating?: boolean, fittings?: Array, weapons?: Array }
   */
  function show(defId, o) {
    o = o || {};
    const preserveView = o.preserveView === true && !!current;
    const priorYaw = yaw;
    const priorZoom = zoom;
    if (current) {
      scene.remove(current);
      current = null;
    }
    if (o.rotating != null) rotating = !!o.rotating;
    const loadout = (Array.isArray(o.fittings) || Array.isArray(o.weapons) || o.isPlayer)
      ? {
        fittings: Array.isArray(o.fittings) ? o.fittings : null,
        weapons: Array.isArray(o.weapons) ? o.weapons : null,
        isPlayer: o.isPlayer === true || defId === 'ship_kestrel',
      }
      : (defId === 'ship_kestrel' ? { fittings: null, weapons: null, isPlayer: true } : null);
    // Player loadouts cache separately from stock demos (hero mesh + real modules).
    const cacheId = (meshCacheKey(defId, loadout) || defId) + (loadout && loadout.isPlayer ? '::player' : '');
    let mesh = meshCache.get(cacheId) || null;
    // Never reuse a cached box LOD when real ships are required.
    if (mesh && mesh.userData && mesh.userData.previewFastLod && !allowFastFallback) {
      meshCache.delete(cacheId);
      const idx = meshCacheOrder.indexOf(cacheId);
      if (idx >= 0) meshCacheOrder.splice(idx, 1);
      try { disposePreviewMesh(mesh); } catch (_) {}
      mesh = null;
    }
    if (mesh) touchCachedMesh(cacheId, mesh);
    else mesh = buildPreviewMesh(defId, loadout);
    if (!mesh) {
      renderedDefId = null;
      console.error('[shipPreviewMount] show() has no mesh for', defId);
      return;
    }
    current = mesh;
    yaw = preserveView ? priorYaw : Math.PI * 0.22; // slight turn so the silhouette reads immediately
    zoom = preserveView ? priorZoom : 1;
    cam.zoom = zoom;
    mesh.rotation.y = yaw;
    scene.add(mesh);
    // frame around the bounding sphere so big capitals fit the same as scouts
    const box = new THREE.Box3().setFromObject(mesh);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    // Prefer looking at the mesh center — box fallbacks used to sit off-center and read as junk.
    const cx = sphere.center.x;
    const cy = sphere.center.y;
    const cz = sphere.center.z;
    const R = Math.max(1, sphere.radius);
    const D = R * 2.85;
    cam.position.set(cx - D * 0.42, cy + D * 0.38, cz + D * 0.72);
    cam.lookAt(cx, cy * 0.2, cz);
    cam.near = Math.max(0.05, R * 0.02);
    cam.far = Math.max(2000, R * 40);
    cam.updateProjectionMatrix();
    renderNow();
    // Authored modular upgrades are optional; hero Hitch is already the final body.
    if (defId !== 'ship_kestrel') {
      requestCurrentAuthoredUpgrade();
      warmAssets();
    }
    if (rotating) requestLoop();
    else renderNow();
  }

  function setRotating(v) {
    rotating = !!v;
    if (rotating) {
      requestLoop();
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }
  function setYaw(v) {
    if (!Number.isFinite(Number(v))) return;
    yaw = Number(v);
    if (current) current.rotation.y = yaw;
    renderNow();
  }
  function rotateBy(delta) {
    if (!Number.isFinite(Number(delta))) return;
    setYaw(yaw + Number(delta));
  }
  function setZoom(v) {
    if (!Number.isFinite(Number(v))) return;
    zoom = Math.max(0.72, Math.min(2.1, Number(v)));
    cam.zoom = zoom;
    cam.updateProjectionMatrix();
    renderNow();
  }
  function zoomBy(delta) {
    if (!Number.isFinite(Number(delta))) return;
    setZoom(zoom + Number(delta));
  }
  function getView() { return { yaw, zoom }; }
  function setDockId(id) {
    const next = typeof id === 'string' && id.length > 0 ? id : null;
    if (next === dockId) return;
    dockId = next;
    renderer.setClearColor(dockId ? 0x05070d : 0x000000, dockId ? 1 : 0);
    if (!dockId) {
      dockLoadGen++;
      if (dockRoot) { scene.remove(dockRoot); dockRoot = null; }
      renderNow();
      return;
    }
    loadDockBackdrop(dockId).catch(() => {});
  }
  function setActive(v) {
    active = !!v;
    if (!active) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    if (current) {
      renderNow();
      if (rotating) requestLoop();
    }
  }

  function dispose() {
    disposed = true;
    if (resizeObserver) resizeObserver.disconnect();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    dockLoadGen++;
    if (dockRoot) { scene.remove(dockRoot); dockRoot = null; }
    if (current) { scene.remove(current); current = null; }
    for (const mesh of meshCache.values()) disposePreviewMesh(mesh);
    meshCache.clear();
    meshCacheOrder.length = 0;
    disposeAuthoredAssetRuntime(renderer);
    renderer.dispose();
  }

  return {
    show, setRotating, setYaw, rotateBy, setZoom, zoomBy, getView, setDockId, setActive,
    warmAssets, resize, frame, dispose, projectLocalPoint, getDefId,
  };
}
