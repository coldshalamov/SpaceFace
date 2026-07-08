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

const PART_ROOT = 'assets/ships/parts/';
const PART_RELEASE_ROOT = 'assets/ships/release/parts/';

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

// Build a minimal ship entity the visual factory can consume (same shape shipPreview.makePreviewEntity
// makes). Starter-fittings so the mesh includes hardpoints + a basic drive glow.
function makeEntity(defId, seedId) {
  const def = SHIP_BY_ID.get(defId);
  if (!def) return null;
  const slots = def.slots || {};
  const fittings = [];
  const weapons = [];
  let wIdx = 0;
  // one weapon per weapon slot (smallest that fits), so barrels render
  for (const entry of (slots.weapon || [])) {
    const size = (typeof entry === 'object' && entry.size) || (typeof entry === 'string' ? entry : 'S');
    const w = WEAPONS.find((x) => x.size === size) || WEAPONS[0];
    if (w) { fittings.push(w.id); weapons.push({ slotIndex: wIdx, defId: w.id, facing: (entry && entry.facing) || 'front', tracking: w.tracking || 'fixed' }); }
    else fittings.push(null);
    wIdx++;
  }
  // a shield + engine so the silhouette has those props
  const sh = MODULES.find((m) => m.slotType === 'shield');
  const en = MODULES.find((m) => m.slotType === 'engine');
  if (sh) fittings.push(sh.id);
  if (en) fittings.push(en.id);
  return {
    id: seedId, type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, rot: Math.PI * 0.15, prevPos: { x: 0, z: 0 }, prevRot: 0, bank: 0,
    radius: def.collisionRadius || 14,
    data: { defId, fittings, weapons, miningBeam: null },
  };
}

/**
 * Create a ship preview mount attached to a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {object} [opts.envMap]  - the main scene's PMREM envMap (for chrome); optional
 * @param {string} [opts.dockId]  - place_dock_interior* part id for station hangar backdrop; optional
 * @returns {{ show(defId, opts):void, setRotating(boolean):void, setDockId(string):void, setActive(boolean):void, warmAssets():Promise<boolean>, resize():void, frame():void, dispose():void }}
 */
export function createShipPreviewMount(canvas, opts) {
  opts = opts || {};
  let W = canvas.clientWidth || canvas.width || 320;
  let H = canvas.clientHeight || canvas.height || 200;
  const useDock = typeof opts.dockId === 'string' && opts.dockId.length > 0;
  const onFirstFrame = typeof opts.onFirstFrame === 'function' ? opts.onFirstFrame : null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !useDock, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(useDock ? 0x05070d : 0x000000, useDock ? 1 : 0);

  const scene = new THREE.Scene();
  if (useDock) scene.fog = new THREE.FogExp2(0x0a1426, 0.012);
  // Hangar rig: warmer key from dock lamps + cool rim from bay glass when a dock shell is present.
  scene.add(new THREE.AmbientLight(0x42506f, useDock ? 0.75 : 0.9));
  const key = new THREE.DirectionalLight(useDock ? 0xffd9b0 : 0xcfe2ff, useDock ? 1.35 : 1.6);
  key.position.set(-0.55, 1.1, 0.75); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6a5cff, useDock ? 0.45 : 0.7);
  rim.position.set(0.75, 0.35, -0.55); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x39d0ff, useDock ? 0.28 : 0.35);
  fill.position.set(0.5, -0.25, 0.45); scene.add(fill);
  if (useDock) {
    const pad = new THREE.PointLight(0x39d0ff, 0.55, 80);
    pad.position.set(0, -1, 0); scene.add(pad);
  }

  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 2000);
  cam.position.set(0, 0, 50);

  // hand the main scene's envMap to the factory so chrome/authority hulls mirror the nebula
  if (opts.envMap) setEnvMapForShips(opts.envMap);
  const vf = createVisualFactory();
  installVisualOverrides(vf, {
    onWarning: (message, error) => console.warn(message, error),
  });

  let current = null;     // the displayed THREE.Object3D
  let dockRoot = null;
  let dockId = useDock ? opts.dockId : null;
  let dockLoadGen = 0;
  let rotating = true;
  let active = true;
  let yaw = 0;
  let rafId = 0;
  let disposed = false;
  let renderedDefId = null;
  let warmupPromise = null;

  function resize() {
    const nextW = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || W || 320));
    const nextH = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || H || 200));
    if (nextW === W && nextH === H) return;
    W = nextW; H = nextH;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
  }

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
    if (active && !rafId) requestLoop();
  }

  if (dockId) loadDockBackdrop(dockId).catch(() => {});

  function requestCurrentAuthoredUpgrade() {
    const request = current && current.userData && current.userData.requestAuthoredUpgrade;
    if (typeof request === 'function') request(renderer, scene);
  }

  function warmAssets() {
    if (!warmupPromise) {
      warmupPromise = preloadAuthoredPartLibrary(renderer)
        .then(() => {
          if (disposed) return false;
          requestCurrentAuthoredUpgrade();
          renderNow();
          if (active && !rafId) requestLoop();
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
   * @param {object} [o] - { rotating?: boolean }
   */
  function show(defId, o) {
    o = o || {};
    // remove previous mesh (geometry only — materials are factory-shared, not disposed here)
    if (current) {
      scene.remove(current);
      current.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      current = null;
    }
    if (o.rotating != null) rotating = !!o.rotating;
    const ent = makeEntity(defId, 1);
    if (!ent) return;
    let mesh = null;
    try { mesh = vf.build(ent); } catch (e) { mesh = null; }
    if (!mesh) return;
    mesh.userData.previewDefId = defId;
    // warm up procedural canvas textures (force upload) so the first frame isn't black
    mesh.traverse((c) => {
      const m = c.material;
      if (!m) return;
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture && v.image && typeof v.needsUpdate !== 'undefined') v.needsUpdate = true;
      }
    });
    current = mesh;
    yaw = 0;
    mesh.rotation.y = 0;
    scene.add(mesh);
    // frame around the bounding sphere so big capitals fit the same as scouts
    const box = new THREE.Box3().setFromObject(mesh);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const R = Math.max(1, sphere.radius);
    const D = R * 2.6;
    cam.position.set(-D * 0.35, D * 0.55, D * 0.85);
    cam.lookAt(0, sphere.center.y * 0.3, 0);
    cam.updateProjectionMatrix();
    renderNow();
    requestCurrentAuthoredUpgrade();
    warmAssets();
    requestLoop();
  }

  function setRotating(v) { rotating = !!v; }
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
      requestLoop();
    }
  }

  function dispose() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    dockLoadGen++;
    if (dockRoot) { scene.remove(dockRoot); dockRoot = null; }
    if (current) { scene.remove(current); current.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); current = null; }
    disposeAuthoredAssetRuntime(renderer);
    renderer.dispose();
  }

  return { show, setRotating, setDockId, setActive, warmAssets, resize, frame, dispose, projectLocalPoint, getDefId };
}
