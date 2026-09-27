// Dev-only fleet look harness: ?dev=fleetlook. Renders one authored ship at a time in the LIVE scene
// (same renderer, lights, env map, tone mapping and runtime material profiles as flight), from the
// real chase pose, so a model can be judged by the picture the player actually sees.
//
// window.SF_fleetLook.shoot({ file | defId, view, heading, width, height }) -> JPEG data URL
//   file   release wholeship path, e.g. 'wholeships/hornet_production_v1.glb' (blueprint path)
//   defId  ship def id, e.g. 'ship_kestrel' (full visual-factory + authored-boundary path, which
//          includes every runtime attachment the player sees)
//   view   'chase' (D=144), 'close' (D=58), 'inspect' (3/4 at radius*2.6), 'side', 'top'
// Driver: scripts/fleet-look.mjs. Verification harness, not a shipped feature.
import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { SECTOR_VISUAL_PROFILES } from '../data/sectorVisualProfiles.js';
import { loadAuthoredPart } from './assetLoader.js';
import { wrapShipWithAuthoredParts } from './partsLibrary.js';

const RELEASE_ROOT = 'assets/ships/release/parts/';
const TILT = 60 * Math.PI / 180;

let renderSystem = null;
function renderOnce(renderer, scene, cam) {
  if (scene && typeof scene.updateMatrixWorld === 'function') scene.updateMatrixWorld();
  // The shipping post route (bloom / crease ink / tone) when available, so the look matches flight.
  if (renderSystem && typeof renderSystem._renderPostRoute === 'function') {
    try { renderSystem._renderPostRoute(renderSystem._selectPostRoute(), scene, cam, 0); return; } catch (_) {}
  }
  renderer.render(scene, cam);
}

// Flight lights, not the boot rig: the sector profile (Helios) is what the player sees.
function applySectorLighting(scene, profile) {
  const lighting = profile && profile.lighting;
  if (!lighting) return;
  const dirs = [];
  for (const child of scene.children) {
    if (child.isAmbientLight) child.intensity = lighting.ambient;
    if (child.isDirectionalLight) dirs.push(child);
  }
  const order = ['key', 'rim', 'fill'];
  dirs.slice(0, 3).forEach((light, i) => { light.intensity = lighting[order[i]]; });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function blueprintToGroup(blueprint) {
  const group = new THREE.Group();
  for (const p of blueprint.primitives || []) {
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(p.matrix);
    if (p.tags && (p.tags.collision || p.tags.collider)) continue;
    if (p.tags && p.tags.lod && p.tags.lod !== 'lod0') continue;
    group.add(mesh);
  }
  return group;
}

function poseCamera(cam, view, radius, heading) {
  const h = (heading || 0) * Math.PI / 180;
  const orbit = (dist, elev, az) => cam.position.set(
    dist * Math.cos(elev) * Math.sin(az), dist * Math.sin(elev), -dist * Math.cos(elev) * Math.cos(az));
  if (view === 'chase' || view === 'close') {
    const D = view === 'chase' ? 144 : 58;
    cam.position.set(0, D * Math.sin(TILT), -D * Math.cos(TILT));
  } else if (view === 'side') orbit(radius * 3.2, 0.12, Math.PI / 2 + h);
  else if (view === 'top') cam.position.set(0, radius * 3.4, -0.001);
  else if (view === 'front') orbit(radius * 2.8, 0.35, Math.PI + 0.55 + h);
  else orbit(radius * 2.6, 0.62, 0.7 + h);
  cam.fov = 50;
  cam.near = 0.1;
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
}

async function waitForAuthored(renderer, scene, cam, root) {
  for (let i = 0; i < 150; i++) {
    renderOnce(renderer, scene, cam);
    await wait(60);
    let pending = false;
    root.traverse((o) => {
      const st = o.userData && o.userData.authoredAssetState;
      if (st === 'awaiting-authored-admission' || st === 'loading' || st === 'compiling-pipelines'
        || st === 'procedural-fallback') pending = true;
    });
    if (!pending) return true;
  }
  return false;
}

export function installFleetLook(SF) {
  const state = SF.state;
  const holder = new THREE.Group();
  holder.name = 'fleetLookHolder';
  let hidden = null;
  let savedSize = null;

  function handles() {
    const r = state.render || {};
    if (!r.renderer || !r.scene || !r.camera) throw new Error('render handles missing');
    return r;
  }

  function isolate(scene) {
    if (hidden) return;
    renderSystem = SF.registry && typeof SF.registry.get === 'function' ? SF.registry.get('render') : null;
    try { renderSystem?._adaptive?.setEnabled(false); } catch (_) {}
    try { renderSystem?.bloom?.setOptions({ bloom: true }); } catch (_) {}
    applySectorLighting(scene, SECTOR_VISUAL_PROFILES.helios_core);
    hidden = [];
    for (const child of scene.children) {
      if (child === holder || child.isLight) continue;
      if (child.userData && (child.userData.kind || child.userData.entityId != null)) {
        if (child.visible) { child.visible = false; hidden.push(child); }
      }
    }
    if (!holder.parent) scene.add(holder);
  }

  async function build(opts) {
    const { renderer, scene } = handles();
    if (opts.file) {
      const url = opts.file.startsWith('assets/') ? opts.file : RELEASE_ROOT + opts.file;
      const bp = await loadAuthoredPart(url, { renderer, slot: opts.slot || null });
      if (!bp) throw new Error('load failed: ' + url);
      return { root: blueprintToGroup(bp), radius: null };
    }
    const def = SHIPS.find((s) => s.id === opts.defId);
    if (!def) throw new Error('no ship def ' + opts.defId);
    const vf = state.render.vf || (await import('./visualFactory.js')).createVisualFactory();
    const ent = {
      id: 900000 + Math.floor(Math.random() * 1000), kind: 'ship', defId: def.id, def,
      x: 0, z: 0, y: 0, rot: 0, vx: 0, vz: 0, radius: def.radius || 6,
      faction: opts.faction || 'player', isPlayer: opts.isPlayer !== false,
      fittings: [], hull: def.hull || 100, maxHull: def.hull || 100, shield: 0, maxShield: 0,
      role: opts.role, archetype: opts.archetype,
    };
    let mesh = vf.build(ent);
    mesh = wrapShipWithAuthoredParts(ent, mesh, { releaseMode: true });
    holder.add(mesh);
    const req = mesh.userData && mesh.userData.requestAuthoredUpgrade;
    if (typeof req === 'function') req(renderer, scene);
    return { root: mesh, radius: ent.radius, entity: ent };
  }

  async function shoot(opts = {}) {
    const { renderer, scene, camera: cam } = handles();
    isolate(scene);
    const width = opts.width || 1600, height = opts.height || 1000;
    if (!savedSize) {
      savedSize = true;
      state.render.dynResScale = 1;
      try { renderSystem?._applySize(); } catch (_) {}
    }
    cam.aspect = width / height;
    const savedCamPos = cam.position.clone();
    holder.clear();
    const built = await build(opts);
    if (!built.root.parent) holder.add(built.root);
    built.root.rotation.y = (opts.yaw || 0) * Math.PI / 180;
    holder.updateMatrixWorld(true);
    let ok = true;
    if (opts.defId) ok = await waitForAuthored(renderer, scene, cam, built.root);
    const box = new THREE.Box3().setFromObject(built.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = opts.radius || sphere.radius || built.radius || 6;
    built.root.position.sub(new THREE.Vector3(sphere.center.x, 0, sphere.center.z));
    poseCamera(cam, opts.view || 'inspect', radius, opts.heading || 0);
    built.root.traverse((c) => {
      const m = c.material;
      if (!m) return;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap]) {
        if (t && renderer.initTexture) { try { renderer.initTexture(t); } catch (_) {} }
      }
    });
    // Link this body's programs up front: the post route's unready-drawable guard hides any mesh
    // whose program is still linking, and a harness frame must never be a guard-hidden blank.
    try { renderer.compile(holder, cam, scene); } catch (_) {}
    // The live game loop keeps re-posing the shared camera between our awaits, so pose it again
    // right before every draw, and keep drawing until the programs have linked.
    const pose = () => poseCamera(cam, opts.view || 'inspect', radius, opts.heading || 0);
    for (let i = 0; i < 10; i++) { pose(); renderOnce(renderer, scene, cam); await wait(i < 4 ? 50 : 250); }
    // Same task as the draw: without preserveDrawingBuffer the canvas clears after compositing.
    pose();
    renderOnce(renderer, scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    cam.position.copy(savedCamPos);
    return {
      url, ok, radius,
      size: box.getSize(new THREE.Vector3()).toArray(),
      materials: collectMaterials(built.root),
    };
  }

  function collectMaterials(root) {
    const out = {};
    root.traverse((o) => {
      const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of list) {
        if (out[m.name]) { out[m.name].meshes += 1; continue; }
        out[m.name] = {
          meshes: 1, role: m.userData?.spacefaceMaterialRole || null,
          color: m.color ? '#' + m.color.getHexString() : null,
          roughness: m.roughness, metalness: m.metalness,
          map: m.map?.image ? `${m.map.image.width}x${m.map.image.height}` : null,
          normalMap: m.normalMap?.image ? `${m.normalMap.image.width}x${m.normalMap.image.height}` : null,
          ormMap: m.roughnessMap?.image ? `${m.roughnessMap.image.width}x${m.roughnessMap.image.height}` : null,
          emissive: m.emissive ? '#' + m.emissive.getHexString() : null,
          layout: !!m.userData?.spacefaceHullLayout, pigment: m.userData?.spacefaceIllustratedPigment || null,
        };
      }
    });
    return out;
  }

  window.SF_fleetLook = { shoot, ships: () => SHIPS.map((s) => s.id) };
  window.SF_fleetLookReady = true;
}
