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
import { setEnvMapForShips, createVisualFactory } from '../render/visualFactory.js';
import { installVisualOverrides } from '../render/visualOverrides.js';

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
 * @returns {{ show(defId, opts):void, setRotating(boolean):void, frame():void, dispose():void }}
 */
export function createShipPreviewMount(canvas, opts) {
  opts = opts || {};
  const W = canvas.clientWidth || 320;
  const H = canvas.clientHeight || 200;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0); // transparent so the panel shows through

  const scene = new THREE.Scene();
  // three-point-ish lighting mirroring the game's rig (key + rim + fill + ambient) so the preview
  // reads as part of the same world, not a flat studio shot.
  scene.add(new THREE.AmbientLight(0x42506f, 0.9));
  const key = new THREE.DirectionalLight(0xcfe2ff, 1.6); key.position.set(-0.6, 1, 0.8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(0.8, 0.4, -0.6); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(0.6, -0.3, 0.5); scene.add(fill);

  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 2000);
  cam.position.set(0, 0, 50);

  // hand the main scene's envMap to the factory so chrome/authority hulls mirror the nebula
  if (opts.envMap) setEnvMapForShips(opts.envMap);
  const vf = createVisualFactory();
  installVisualOverrides(vf, {
    onWarning: (message, error) => console.warn(message, error),
  });

  let current = null;     // the displayed THREE.Object3D
  let rotating = true;
  let active = true;
  let yaw = 0;
  let rafId = 0;
  let disposed = false;

  function frame() {
    if (disposed) return;
    if (!active) { rafId = 0; return; }
    rafId = requestAnimationFrame(frame);
    if (current && rotating) {
      yaw += 0.012;
      current.rotation.y = yaw;
    }
    renderer.render(scene, cam);
  }

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
    if (active && !rafId) frame();
  }

  function setRotating(v) { rotating = !!v; }
  function setActive(v) {
    active = !!v;
    if (!active) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    if (current && !rafId) frame();
  }

  function dispose() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (current) { scene.remove(current); current.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); current = null; }
    renderer.dispose();
  }

  return { show, setRotating, setActive, frame, dispose };
}
