// Dev-only fleet look harness: ?dev=fleetlook. Renders one authored ship at a time in the LIVE scene
// (same renderer, lights, env map, tone mapping and runtime material profiles as flight), from the
// real chase pose, so a model can be judged by the picture the player actually sees.
//
// window.SF_fleetLook.shoot({ file | defId, view, heading, width, height }) -> JPEG data URL
//   file   release wholeship path, e.g. 'wholeships/hornet_production_v1.glb' (blueprint path)
//   defId  ship def id, e.g. 'ship_kestrel' (full visual-factory + authored-boundary path, which
//          includes every runtime attachment the player sees)
//   view   'chase' (D=144), 'close' (D=58), 'inspect' (3/4 at radius*2.6), 'side', 'top',
//          'place' (whole bounding sphere at the in-game 60° chase tilt — for stations/places)
// Driver: scripts/fleet-look.mjs. Verification harness, not a shipped feature.
import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { SECTORS } from '../data/sectors.js';
import { resolveSectorVisualProfile } from '../data/sectorVisualProfiles.js';
import { defaultShipAppearance } from '../core/shipAppearance.js';
import { loadAuthoredPart } from './assetLoader.js';
import { wrapShipWithAuthoredParts } from './partsLibrary.js';
import { beginLookMood, currentLookMoodId, tuneLook } from './look.js';
import { resolveLookPost } from '../data/lookMoods.js';

const RELEASE_ROOT = 'assets/ships/release/parts/';
const TILT = 60 * Math.PI / 180;

/**
 * Stable preview-entity id per ship def, so the same ship always previews as the same hull.
 * `visualFactory` derives a hull's displacement variant, palette jitter and decoration scatter from
 * `hashId(entity.id)`, so the id is presentation identity, not a label. A defId-keyed counter is
 * enough: ids only have to be distinct from each other and constant across captures.
 */
const previewIdByDef = new Map();
let nextPreviewId = 0;
function stablePreviewId(defId) {
  if (!previewIdByDef.has(defId)) previewIdByDef.set(defId, nextPreviewId++);
  return previewIdByDef.get(defId);
}

let renderSystem = null;
function renderOnce(renderer, scene, cam) {
  if (scene && typeof scene.updateMatrixWorld === 'function') scene.updateMatrixWorld();
  // The shipping post route (bloom / crease ink / tone) when available, so the look matches flight.
  if (renderSystem && typeof renderSystem._renderPostRoute === 'function') {
    try { renderSystem._renderPostRoute(renderSystem._selectPostRoute(), scene, cam, 0); return; } catch (_) {}
  }
  renderer.render(scene, cam);
}

// Flight lights, not the boot rig: the resolved sector profile is what the player sees.
// `sector` selects which rig; default is the Helios opening the rest of the harness assumed.
// Prefer the live transition path (`_beginSectorPaletteTransition` + snap) so authored key/fill
// colour overrides and the signature-hero light aim are exactly the production result; the direct
// intensity write below is only a fallback for harnesses without a render system.
let activeSector = null;
let appliedSector = null;
function applySectorLighting(scene, sector, profile, palette) {
  if (renderSystem && typeof renderSystem._beginSectorPaletteTransition === 'function') {
    renderSystem._beginSectorPaletteTransition(sector, profile);
    // The sector's post numbers (exposure, bloom, grade amount) are half of its look.
    if (typeof renderSystem.setSectorPostProfile === 'function') {
      renderSystem.setSectorPostProfile(resolveLookPost(profile));
    }
    // The harness cannot wait out the 1.5 s lerp: drive the transitions to completion now so the
    // still lands on the sector's authored rig rather than a mid-blend frame.
    if (typeof renderSystem._updateSectorPaletteTransition === 'function') {
      renderSystem._updateSectorPaletteTransition(Number.MAX_SAFE_INTEGER);
    }
    if (typeof renderSystem._updateSectorPostTransition === 'function') {
      renderSystem._updateSectorPostTransition(Number.MAX_SAFE_INTEGER);
    }
    return;
  }
  const lighting = profile && profile.lighting;
  if (!lighting) return;
  const dirs = [];
  for (const child of scene.children) {
    if (child.isAmbientLight) {
      child.intensity = lighting.ambient;
      if (Number.isFinite(lighting.ambientColor)) child.color.setHex(lighting.ambientColor);
      else if (palette) child.color.setHex(palette.ambient);
    }
    if (child.isDirectionalLight) dirs.push(child);
  }
  const order = ['key', 'rim', 'fill'];
  dirs.slice(0, 3).forEach((light, i) => {
    const channel = order[i];
    light.intensity = lighting[channel];
    if (Number.isFinite(lighting[channel + 'Color'])) light.color.setHex(lighting[channel + 'Color']);
    else if (palette) light.color.setHex(palette[channel]);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Count actual target draws during this preview's final synchronous scene render.
// onAfterRender also fires when Three's selected-program guard deferred the draw.
function observePreviewDraw(renderer, root, draw) {
  const meshes = new Set();
  root.traverse((object) => { if (object.isMesh) meshes.add(object); });
  const result = { draws: 0 };
  const gl = renderer.getContext();
  const previousRender = renderer.renderBufferDirect;
  const originals = new Map();
  let target = false;
  renderer.renderBufferDirect = function (...args) {
    const previousTarget = target;
    target = meshes.has(args[4]);
    try { return previousRender.apply(this, args); } finally { target = previousTarget; }
  };
  try {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      if (typeof gl[name] !== 'function') continue;
      const original = gl[name];
      originals.set(name, original);
      gl[name] = function (...args) {
        if (target) result.draws++;
        return original.apply(this, args);
      };
    }
    draw();
  } finally {
    renderer.renderBufferDirect = previousRender;
    for (const [name, original] of originals) gl[name] = original;
  }
  return result;
}

function blueprintToGroup(blueprint) {
  const group = new THREE.Group();
  // Split-file LOD siblings (kestrel_lod1/_lod2) carry only LOD1_/LOD2_ names; shoot the finest
  // level the file has instead of an empty frame.
  const levels = new Set((blueprint.primitives || []).map((p) => p.tags && p.tags.lod).filter(Boolean));
  const shown = levels.has('lod0') || !levels.size ? 'lod0' : [...levels].sort()[0];
  for (const p of blueprint.primitives || []) {
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(p.matrix);
    if (p.tags && (p.tags.collision || p.tags.collider)) continue;
    if (p.tags && p.tags.lod && p.tags.lod !== shown) continue;
    group.add(mesh);
  }
  return group;
}

const ORIGIN = new THREE.Vector3();

function poseCamera(cam, view, radius, heading, center) {
  const h = (heading || 0) * Math.PI / 180;
  // The XZ-recentred bounding-sphere centre: aim there, not at the world origin — placed
  // models (places, kits, rocks) carry a Y offset and unrecentred inspects clipped their tops.
  const aim = center || ORIGIN;
  const orbit = (dist, elev, az) => cam.position.set(
    aim.x + dist * Math.cos(elev) * Math.sin(az),
    aim.y + dist * Math.sin(elev),
    aim.z - dist * Math.cos(elev) * Math.cos(az));
  if (view === 'chase') {
    // Gameplay framing: the real 144 WU chase distance, radius-independent by design —
    // what a player at the default zoom actually sees, however big or small the body is.
    cam.position.set(0, 144 * Math.sin(TILT), -144 * Math.cos(TILT));
  } else if (view === 'close') {
    // Close zoom: the gameplay tilt with the distance fitted to the bounding sphere so the
    // model fills ~450 px (the documented contract). The old fixed 58 WU was tuned for
    // standard hulls and made small props specks and big places fill the whole frame.
    const D = Math.max(radius * 2.2, 6);
    cam.position.set(aim.x, aim.y + D * Math.sin(TILT), aim.z - D * Math.cos(TILT));
  } else if (view === 'place') {
    // Whole-place framing: the in-game 60° chase tilt, distance fitted to the bounding sphere so
    // the entire station/place is in frame — the picture a player approaching it actually sees.
    const D = radius * 2.7;
    cam.position.set(aim.x, aim.y + D * Math.sin(TILT), aim.z - D * Math.cos(TILT));
    cam.far = Math.max(cam.far, radius * 20);
    cam.fov = 50;
    cam.near = 0.1;
    cam.lookAt(aim.x, aim.y, aim.z);
    cam.updateProjectionMatrix();
    return;
  } else if (view === 'side') orbit(radius * 3.2, 0.12, Math.PI / 2 + h);
  else if (view === 'top') cam.position.set(aim.x, aim.y + radius * 3.4, aim.z - 0.001);
  else if (view === 'front') orbit(radius * 2.8, 0.35, Math.PI + 0.55 + h);
  else orbit(radius * 2.6, 0.62, 0.7 + h);
  cam.fov = 50;
  cam.near = 0.1;
  cam.lookAt(aim.x, aim.y, aim.z);
  cam.updateProjectionMatrix();
}

export function inspectFleetLookAuthored(root) {
  const pending = [];
  const failed = [];
  let targetMeshes = 0;
  root.traverse((o) => {
    if (o.isMesh && o.geometry && o.material) targetMeshes++;
    const status = o.userData?.authoredAssetState;
    if (!status) return;
    if (['awaiting-authored-admission', 'loading', 'compiling-pipelines', 'procedural-fallback',
      'authored-prepared', 'same-semantic-fallback-prepared'].includes(status)) {
      if (pending.length < 12) pending.push(status);
    } else if (!['authored', 'authored-with-cleanup-error', 'procedural-settled',
      'same-semantic-fallback'].includes(status)) {
      if (failed.length < 12) failed.push(String(status).slice(0, 100));
    }
  });
  return { ready: pending.length === 0 && failed.length === 0, pending, failed, targetMeshes };
}

async function waitForAuthored(renderer, scene, cam, root) {
  for (let i = 0; i < 150; i++) {
    renderOnce(renderer, scene, cam);
    await wait(60);
    const verdict = inspectFleetLookAuthored(root);
    if (verdict.failed.length || verdict.ready) return verdict;
  }
  return inspectFleetLookAuthored(root);
}

export function installFleetLook(SF) {
  const state = SF.state;
  const holder = new THREE.Group();
  holder.name = 'fleetLookHolder';
  let hidden = null;
  let savedSize = null;
  let lastPose = null;
  let lastCamera = null;

  function handles() {
    const r = state.render || {};
    if (!r.renderer || !r.scene || !r.camera) throw new Error('render handles missing');
    return r;
  }

  function isolate(scene) {
    const sector = activeSector || SECTORS.find((s) => s.id === 'sector_helios_prime') || null;
    if (hidden) {
      // A mid-run sector swap still needs the rig re-applied; entity hiding is already done.
      if (appliedSector !== sector) {
        applySectorLighting(scene, sector, resolveSectorVisualProfile(sector), sector && sector.palette);
        appliedSector = sector;
      }
      return;
    }
    renderSystem = SF.registry && typeof SF.registry.get === 'function' ? SF.registry.get('render') : null;
    try { renderSystem?._adaptive?.setEnabled(false); } catch (_) {}
    try { renderSystem?.bloom?.setOptions({ bloom: true }); } catch (_) {}
    applySectorLighting(scene, sector, resolveSectorVisualProfile(sector), sector && sector.palette);
    appliedSector = sector;
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
    // The preview entity id must be a stable function of the def, not ambient entropy. visualFactory
    // seeds a hull's displacement variant, palette jitter and decoration scatter from
    // `hashId(e.id)` (visualFactory.js:1791/2400/2430/2470/2758), so a random id made every capture
    // of the same ship a different ship. The blank-frame retry in scripts/fleet-look.mjs re-calls
    // shoot() up to four times, which made a retried frame disagree with the frame it replaced —
    // the harness could not tell a lighting failure from a different hull. Deterministic ids also
    // let a before/after pair be compared as the same object, which is the entire job of this tool.
    const ent = {
      id: 900000 + stablePreviewId(def.id), kind: 'ship',
      // visualFactory dispatches on e.type (visualFactory.js:6443) — a preview entity is a ship
      // exactly like a flight entity is.
      type: 'ship', defId: def.id, def,
      x: 0, z: 0, y: 0, rot: 0, vx: 0, vz: 0, radius: def.radius || 6,
      faction: opts.faction || 'player', isPlayer: opts.isPlayer !== false,
      fittings: [], hull: def.hull || 100, maxHull: def.hull || 100, shield: 0, maxShield: 0,
      role: opts.role, archetype: opts.archetype,
      // The live appearance record a real hull flies with (paint, wear, hull stencils). A shot
      // can override it via `appearance` or pose as an NPC via `factionId`.
      data: { defId: def.id, appearance: opts.appearance || defaultShipAppearance(def.id) },
      factionId: opts.factionId || undefined,
    };
    let mesh = vf.build(ent);
    mesh = wrapShipWithAuthoredParts(ent, mesh, { releaseMode: true });
    holder.add(mesh);
    const req = mesh.userData && mesh.userData.requestAuthoredUpgrade;
    if (typeof req === 'function') req(renderer, scene);
    const diagNames = [];
    mesh.traverse((o) => { if (diagNames.length < 12) diagNames.push(`${o.name || o.type}${o.visible ? '' : ':INVIS'}`); });
    return { root: mesh, radius: ent.radius, entity: ent, diagNames };
  }

  async function shoot(opts = {}) {
    const { renderer, scene, camera: liveCamera } = handles();
    // The live loop owns its camera between awaits. A private camera keeps this shot's
    // projection and pose stable while admissions and shader readiness complete.
    const cam = liveCamera.clone();
    isolate(scene);
    const width = opts.width || 1600, height = opts.height || 1000;
    if (!savedSize) {
      savedSize = true;
      state.render.dynResScale = 1;
      try { renderSystem?._applySize(); } catch (_) {}
    }
    cam.aspect = width / height;
    holder.clear();
    const built = await build(opts);
    if (!built.root.parent) holder.add(built.root);
    built.root.rotation.y = (opts.yaw || 0) * Math.PI / 180;
    // A/B bench: scale one material factor across the shot (env / emissive / colour) and
    // optionally hide the scene environment, so a blowout can be traced to one term.
    if (opts.ab) {
      const ab = opts.ab;
      built.root.traverse((o) => {
        for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
          if (Number.isFinite(ab.env) && 'envMapIntensity' in m) m.envMapIntensity *= ab.env;
          if (Number.isFinite(ab.emissive) && 'emissiveIntensity' in m) m.emissiveIntensity *= ab.emissive;
          if (Number.isFinite(ab.color) && m.color) m.color.multiplyScalar(ab.color);
        }
      });
      if (ab.noEnvironment) { opts._env = scene.environment; scene.environment = null; }
      if (ab.noBackground) { opts._bg = scene.background; scene.background = null; }
    }
    holder.updateMatrixWorld(true);
    let verdict = { ready: true, pending: [], failed: [], targetMeshes: 0 };
    // Yield one frame before either settle wait: the authored boundary stamps its pending
    // state asynchronously, and checked too early waitForAuthored sees no pending flags —
    // the pose below then measures an empty pre-upgrade marker and the frame ships blank.
    await wait(120);
    if (opts.defId || opts.file) verdict = await waitForAuthored(renderer, scene, cam, built.root);
    if (!verdict.ready) throw new Error(`fleet-look authored preview not ready: ${JSON.stringify(verdict)}`);
    const box = new THREE.Box3().setFromObject(built.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = opts.radius || sphere.radius || built.radius || 6;
    built.root.position.sub(new THREE.Vector3(sphere.center.x, 0, sphere.center.z));
    // After the XZ recentre the bounding-sphere centre sits at (0, sphereY, 0) — the `place`
    // view frames and aims at that, so a tall station's mid-volume is what fills the picture.
    const placeCenter = new THREE.Vector3(0, sphere.center.y, 0);
    poseCamera(cam, opts.view || 'inspect', radius, opts.heading || 0, placeCenter);
    built.root.traverse((c) => {
      const m = c.material;
      if (!m) return;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap]) {
        if (t && renderer.initTexture) { try { renderer.initTexture(t); } catch (_) {} }
      }
    });
    // File previews can also expose authored boundaries; settle those before joining the
    // strict renderer admission (compile, upload and exact-target touch).
    if (opts.file) verdict = await waitForAuthored(renderer, scene, cam, built.root);
    if (!verdict.ready) throw new Error(`fleet-look authored preview not ready: ${JSON.stringify(verdict)}`);
    const admit = state.render.compileObjectPipelines;
    if (typeof admit !== 'function') throw new Error('fleet-look pipeline admission unavailable');
    const result = await admit(holder, { explicit: true, strict: true, joinOutstanding: true,
      isActive: () => built.root.parent === holder });
    if (!result || result.skipped === true || result.incomplete === true || result.contextLost === true) {
      throw new Error(`fleet-look pipeline admission incomplete: ${result?.reason || (result ? 'incomplete receipt' : 'no receipt')}`);
    }
    // Draw through the normal route with the same private camera used for this view.
    const pose = () => poseCamera(cam, opts.view || 'inspect', radius, opts.heading || 0, placeCenter);
    // Same task as the draw: without preserveDrawingBuffer the canvas clears after compositing.
    pose();
    scene.updateMatrixWorld(true);
    const drawObservation = observePreviewDraw(renderer, built.root,
      () => renderOnce(renderer, scene, cam));
    const url = renderer.domElement.toDataURL('image/png');
    lastPose = pose;
    lastCamera = cam;
    if (opts.ab?.noEnvironment) scene.environment = opts._env;
    if (opts.ab?.noBackground) scene.background = opts._bg;
    return {
      url, ok: verdict.ready, radius, diagNames: built.diagNames, drawObservation, authoredVerdict: verdict,
      size: box.getSize(new THREE.Vector3()).toArray(),
      materials: collectMaterials(built.root),
    };
  }

  // GPU cost of the picture currently in the holder: draw `frames` frames through the shipping
  // post route with a hard flush after each, and report the median. Call after shoot(); used by
  // scripts/look-bench.mjs --cost to price a Look value on the machine it runs on.
  async function cost(opts = {}) {
    const { renderer, scene, camera: liveCamera } = handles();
    const cam = lastCamera || liveCamera;
    const gl = renderer.getContext();
    const frames = Math.max(8, opts.frames | 0 || 40);
    const samples = [];
    for (let i = 0; i < frames + 6; i++) {
      if (lastPose) lastPose();
      const t0 = performance.now();
      renderOnce(renderer, scene, cam);
      gl.finish();
      const dt = performance.now() - t0;
      if (i >= 6) samples.push(dt);
      if (i % 8 === 7) await wait(0);
    }
    samples.sort((a, b) => a - b);
    return {
      medianMs: +samples[samples.length >> 1].toFixed(3),
      p90Ms: +samples[Math.floor(samples.length * 0.9)].toFixed(3),
      frames: samples.length,
      calls: renderer.info.render.calls,
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
          envMapIntensity: m.envMapIntensity, emissiveIntensity: m.emissiveIntensity,
          finish: m.userData?.spacefaceFinish || null,
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

  window.SF_fleetLook = {
    shoot,
    cost,
    ships: () => SHIPS.map((s) => s.id),
    // --sector=<id>: apply that sector's authored visual-profile rig (intensity + key/fill tint +
    // signature-hero aim) to the live lights before the next shot.
    setSector: (sectorId) => {
      const sector = SECTORS.find((s) => s.id === sectorId) || null;
      if (!sector) return false;
      activeSector = sector;
      return true;
    },
    // Look bench: snap to a named mood, or overwrite single Look values on the live uniforms
    // (src/render/look.js tuneLook). Both hold until the next sector/mood change.
    setMood: (moodId) => beginLookMood(moodId, 0),
    mood: () => currentLookMoodId(),
    tune: (patch) => { tuneLook(patch); return true; },
    // Raw post/light access for A/B work: post({ bloomStrength, grade, ... }) goes straight to the
    // live composite; lights({ key: 3.2, rim: 1.4, ... }) writes rig intensities.
    post: (options) => { try { renderSystem?.bloom?.setOptions(options); return true; } catch (_) { return false; } },
    lights: (values = {}) => {
      const rig = renderSystem && renderSystem._sectorPaletteRig;
      if (!rig) return false;
      for (const channel of ['ambient', 'key', 'rim', 'fill']) {
        if (Number.isFinite(values[channel])) rig.lights[channel].intensity = values[channel];
        if (Number.isFinite(values[channel + 'Color'])) rig.lights[channel].color.setHex(values[channel + 'Color']);
      }
      return true;
    },
  };
  window.SF_fleetLookReady = true;
}
