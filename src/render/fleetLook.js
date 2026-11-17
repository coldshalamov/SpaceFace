// Dev-only fleet look harness: ?dev=fleetlook. Renders one authored ship at a time in the LIVE scene
// (same renderer, lights, env map, tone mapping and runtime material profiles as flight), from the
// real chase pose, so a model can be judged by the picture the player actually sees.
//
// window.SF_fleetLook.shoot({ file | defId, view, heading, width, height, dist }) -> JPEG data URL
//   file   release wholeship path, e.g. 'wholeships/hornet_production_v1.glb' (blueprint path)
//   defId  ship def id, e.g. 'ship_kestrel' (full visual-factory + authored-boundary path, which
//          includes every runtime attachment the player sees)
//   view   'chase' (D=144), 'close' (D=58), 'inspect' (3/4 at radius*2.6), 'side', 'top',
//          'place' (whole bounding sphere at the in-game 60° chase tilt — for stations/places)
//   dist   optional camera-distance multiplier (pulls every view back along its view ray)
// Driver: scripts/fleet-look.mjs. Verification harness, not a shipped feature.
import * as THREE from 'three';
import { SHIPS } from '../data/ships.js';
import { BOMB_DEFS } from '../data/bombs.js';
import { BOMB_PROXY_RADIUS, BOMB_VISUAL_RADIUS } from '../systems/bombs.js';
import { faunaSpeciesById } from '../data/alienFauna.js';
import { ALIEN_SITES } from '../data/alienEcology.js';
import { planBolusLayout } from '../data/theBolus.js';
import { SECTORS } from '../data/sectors.js';
import { resolveSectorVisualProfile } from '../data/sectorVisualProfiles.js';
import { defaultShipAppearance } from '../core/shipAppearance.js';
import { connectivityMask } from '../systems/siteLogistics.js';
import { resolveWorksConduitPiece } from '../ui/asteroid/worksPartLoader.js';
import { MACHINE_KINDS } from '../data/precursorMachines.js';
import { buildMachineMesh, buildMachineProp } from './machineVisuals.js';
import { preloadCreatureSkinLibrary } from './creatureSkinLibrary.js';
import { preloadSurveyorSurface } from './surveyorSurfaceLibrary.js';
import { createLodState, projectedShipDiameterPx } from './lod.js';
import { getAuthoredAssetDiagnostic, getAuthoredAssetRuntimeInfo, loadAuthoredPart } from './assetLoader.js';
import { wrapShipWithAuthoredParts } from './partsLibrary.js';
import { RESIDENCY_HELD } from './residencyManager.js';
import { beginLookMood, currentLookMoodId, tuneLook } from './look.js';
import { resolveLookPost } from '../data/lookMoods.js';
import { measureFleetLookCost } from './fleetLookCost.js';

const RELEASE_ROOT = 'assets/ships/release/parts/';
const TILT = 60 * Math.PI / 180;
const CONDUIT_CELL_WU = 2.2;
const CONDUIT_CELL_RADIUS = CONDUIT_CELL_WU * Math.SQRT1_2;
// Connected layout covering all 6 Works conduit shapes per family (end/straight/corner/t/cross/junction)
// with zero dangling ports; [2, 2] stays cross and [6, 2] receives the single service-lid junction.
const CONDUIT_NETWORK_CELLS = Object.freeze([
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
  [2, 1], [2, 0], [3, 0],
  [2, 3],
  [4, 3],
  [6, 1], [6, 3], [6, 4], [7, 4],
]);
const CONDUIT_SERVICE_CELL = '6,2';
const MACHINE_PROP_IDS = Object.freeze([
  'pylon', 'monolith', 'spine', 'plate', 'husk', 'vault', 'gate_ring', 'marker', 'dock_arm', 'gantry',
]);

// Match one real spawning site; Bolus has its own layout and strain rather than an ALIEN_SITES cast.
export function faunaPreviewEntity(speciesId, { siteId, aggregate = false } = {}) {
  const species = faunaSpeciesById(speciesId);
  if (!species) throw new Error('no fauna species ' + speciesId);
  const bolus = speciesId.startsWith('bolus_');
  const site = bolus ? null : Object.values(ALIEN_SITES).find((entry) =>
    (!siteId || entry.siteId === siteId) && Number(entry.faunaCast?.[speciesId]) > 0);
  if ((bolus && siteId) || (!bolus && !site)) throw new Error('no matching fauna site for ' + speciesId);
  if (aggregate && site?.siteId !== 'veil_ray_nursery') throw new Error('aggregate preview requires the veil ray nursery');
  const specimen = bolus ? planBolusLayout(1).find((entry) => entry.speciesId === speciesId) : null;
  const radius = specimen?.radius ?? species.radius;
  const driveState = specimen ? (specimen.dynamic ? 'drift' : 'anchored')
    : species.dormant ? 'dormant' : species.sessile ? 'anchored' : 'drift';
  return { id: 900000 + stablePreviewId(speciesId), type: 'fauna', radius,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { strainId: bolus ? 'ashfall_choir' : site.strainId,
      ecology: { speciesId, siteId: site?.siteId || null, aggregate, driveState, phase: 0, anchor: { x: 0, z: 0 } } } };
}

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
export function renderOnce(renderer, scene, cam, owner = renderSystem) {
  if (scene && typeof scene.updateMatrixWorld === 'function') scene.updateMatrixWorld();
  // Never turn a failed production post route into a convincing but misleading raw screenshot.
  if (typeof owner?._selectPostRoute !== 'function' || typeof owner?._renderPostRoute !== 'function') {
    throw new Error('fleet-look shipping post route unavailable');
  }
  try {
    return owner._renderPostRoute(owner._selectPostRoute(), scene, cam, 0);
  } catch (cause) {
    throw new Error(`fleet-look shipping post route failed: ${cause?.message || cause}`, { cause });
  }
}

// A preview can contain many meshes backed by the same cached material. Apply a
// factor once per material and only during this synchronous draw; otherwise an
// A/B shot compounds the factor per mesh and changes later shots or live assets.
export function withFleetLookMaterialFactors(root, ab, draw) {
  if (!root || !ab) return draw();
  const originals = new Map();
  try {
    root.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material
        : object.material ? [object.material] : [];
      for (const material of materials) {
        if (!material || originals.has(material)) continue;
        const saved = {};
        originals.set(material, saved);
        if (Number.isFinite(ab.env) && 'envMapIntensity' in material) {
          saved.envMapIntensity = material.envMapIntensity;
          material.envMapIntensity *= ab.env;
        }
        if (Number.isFinite(ab.emissive) && 'emissiveIntensity' in material) {
          saved.emissiveIntensity = material.emissiveIntensity;
          material.emissiveIntensity *= ab.emissive;
        }
        if (Number.isFinite(ab.color) && material.color) {
          saved.color = material.color.clone();
          material.color.multiplyScalar(ab.color);
        }
      }
    });
    return draw();
  } finally {
    for (const [material, saved] of originals) {
      if ('envMapIntensity' in saved) material.envMapIntensity = saved.envMapIntensity;
      if ('emissiveIntensity' in saved) material.emissiveIntensity = saved.emissiveIntensity;
      if (saved.color) material.color.copy(saved.color);
    }
  }
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

function poseCamera(cam, view, radius, heading, center, distMult) {
  const h = (heading || 0) * Math.PI / 180;
  // The XZ-recentred bounding-sphere centre: aim there, not at the world origin — placed
  // models (places, kits, rocks) carry a Y offset and unrecentred inspects clipped their tops.
  const aim = center || ORIGIN;
  // Optional distance override (--dist=<multiplier>): pull the camera straight back along its
  // view ray so oversized hulls/structures whose auto-framing sits inside the bounding radius
  // still fit the frame. Applies to every view, including the fixed-144 WU chase.
  const widen = () => {
    if (!Number.isFinite(distMult) || distMult <= 0 || distMult === 1) return;
    cam.position.sub(aim).multiplyScalar(distMult).add(aim);
    cam.far = Math.max(cam.far, cam.position.distanceTo(aim) + radius * 4);
  };
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
    widen();
    cam.lookAt(aim.x, aim.y, aim.z);
    cam.updateProjectionMatrix();
    return;
  } else if (view === 'work') {
    const D = Math.max(radius * 1.9, 16);
    cam.position.set(aim.x, aim.y + D * Math.sin(TILT), aim.z - D * Math.cos(TILT));
    cam.far = Math.max(cam.far, radius * 20);
  } else if (view === 'site') {
    const D = Math.max(radius * 7.2, 68);
    cam.position.set(aim.x, aim.y + D * Math.sin(TILT), aim.z - D * Math.cos(TILT));
    cam.far = Math.max(cam.far, radius * 20);
  } else if (view === 'side') orbit(radius * 3.2, 0.12, Math.PI / 2 + h);
  else if (view === 'top') cam.position.set(aim.x, aim.y + radius * 3.4, aim.z - 0.001);
  else if (view === 'front') orbit(radius * 2.8, 0.35, Math.PI + 0.55 + h);
  else orbit(radius * 2.6, 0.62, 0.7 + h);
  widen();
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
    if (o.userData?.[RESIDENCY_HELD] === true && pending.length < 12) {
      pending.push(`residency-held:${String(o.name || o.type || 'object').slice(0, 60)}`);
    }
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

// The final draw can itself enqueue a geometry upload and hide a target. Keep the same
// admitted root alive until the ordinary residency lane releases it, then read pixels in
// the same task as the successful draw (the drawing buffer is not preserved).
export async function captureReadyFleetLookFrame({ root, isActive, draw, capture, settle = wait, maxAttempts = 150 }) {
  let verdict;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!isActive()) throw new Error('fleet-look preview retired before capture');
    const drawObservation = draw();
    verdict = inspectFleetLookAuthored(root);
    if (verdict.failed.length) throw new Error(`fleet-look authored preview failed: ${JSON.stringify(verdict)}`);
    if (verdict.ready) return { url: capture(), drawObservation, verdict };
    if (attempt + 1 < maxAttempts) await settle(60);
  }
  throw new Error(`fleet-look authored preview not ready after final draw: ${JSON.stringify(verdict)}`);
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

  async function buildConduitNetwork(family, renderer) {
    if (family !== 'lane' && family !== 'power') throw new Error('no conduit family ' + family);
    const cellSet = new Set(CONDUIT_NETWORK_CELLS.map(([c, r]) => `${c},${r}`));
    const has = (c, r) => cellSet.has(`${c},${r}`);
    const plan = CONDUIT_NETWORK_CELLS.map(([c, r]) => {
      const mask = connectivityMask(has, c, r);
      const piece = resolveWorksConduitPiece(family, mask, { service: `${c},${r}` === CONDUIT_SERVICE_CELL });
      if (!piece) throw new Error(`unresolved conduit cell (${c},${r}) for ${family}`);
      return { col: c, row: r, ...piece };
    });
    const uniqueAssetIds = [...new Set(plan.map((piece) => piece.assetId))];
    const blueprints = new Map();
    if (typeof window !== 'undefined') window.__SF_fleetLookStage = `conduit:load:${family}:${uniqueAssetIds.length}`;
    await Promise.all(uniqueAssetIds.map(async (assetId) => {
      const url = `${RELEASE_ROOT}works/${assetId}.glb`;
      const bp = await loadAuthoredPart(url, { renderer, slot: 'place', admissionVisible: true });
      if (!bp) {
        const diagnostic = await getAuthoredAssetDiagnostic(renderer, url, 'place');
        throw new Error(`load failed: ${url}${diagnostic ? ` — ${diagnostic.message || diagnostic}` : ''}`);
      }
      blueprints.set(assetId, bp);
    }));
    if (typeof window !== 'undefined') window.__SF_fleetLookStage = `conduit:built:${family}`;
    const root = new THREE.Group();
    root.name = `SF_ConduitNetwork_${family}`;
    const segments = [];
    const lodState = createLodState();
    const triCount = (geom) => (geom.index
      ? Math.round(geom.index.count / 3)
      : Math.round((geom.attributes?.position?.count || 0) / 3));
    for (const piece of plan) {
      const bp = blueprints.get(piece.assetId);
      const seat = new THREE.Group();
      seat.name = `conduit_${piece.assetId}_${piece.col}_${piece.row}`;
      seat.position.set(piece.col * CONDUIT_CELL_WU, 0, piece.row * CONDUIT_CELL_WU);
      seat.rotation.y = piece.rotation;
      const levels = new Set();
      const meshes = [];
      for (const p of bp.primitives || []) {
        if (p.tags && (p.tags.collision || p.tags.collider)) continue;
        const mesh = new THREE.Mesh(p.geometry, p.material);
        mesh.name = p.name;
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(p.matrix);
        const lodTag = p.tags && p.tags.lod ? p.tags.lod : null;
        if (lodTag) levels.add(lodTag);
        mesh.userData.worksLod = lodTag;
        mesh.visible = !lodTag || lodTag === 'lod0';
        seat.add(mesh);
        meshes.push(mesh);
      }
      root.add(seat);
      segments.push({ col: piece.col, row: piece.row, kind: piece.kind, assetId: piece.assetId, seat, levels, meshes });
    }
    const worldCenter = new THREE.Vector3();
    const segPos = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    root.userData.updateLodForCamera = (cam, viewport) => {
      root.updateMatrixWorld(true);
      const boxNow = new THREE.Box3().setFromObject(root);
      boxNow.getCenter(worldCenter);
      camPos.copy(cam.position);
      const cameraDistance = camPos.distanceTo(worldCenter);
      const projectedCellPx = projectedShipDiameterPx(worldCenter, CONDUIT_CELL_RADIUS, cam, viewport);
      const desired = lodState.resolve(projectedCellPx);
      let minSegmentPx = Infinity;
      let maxSegmentPx = 0;
      const activeLods = new Set();
      const visibleNames = new Set();
      const hiddenNames = new Set();
      let visibleMeshCount = 0;
      let hiddenMeshCount = 0;
      let visibleTriangles = 0;
      const byAsset = new Map();
      for (const seg of segments) {
        seg.seat.getWorldPosition(segPos);
        const segPx = projectedShipDiameterPx(segPos, CONDUIT_CELL_RADIUS, cam, viewport);
        if (segPx < minSegmentPx) minSegmentPx = segPx;
        if (segPx > maxSegmentPx) maxSegmentPx = segPx;
        const activeLod = seg.levels.has(desired)
          ? desired
          : (seg.levels.has('lod1') ? 'lod1' : [...seg.levels].sort()[0] || 'lod0');
        activeLods.add(activeLod);
        let entry = byAsset.get(seg.assetId);
        if (!entry) {
          entry = {
            assetId: seg.assetId,
            kind: seg.kind,
            activeLod,
            count: 0,
            visibleNodes: new Set(),
            hiddenNodes: new Set(),
            visibleTriangles: 0,
          };
          byAsset.set(seg.assetId, entry);
        }
        entry.count += 1;
        for (const mesh of seg.meshes) {
          const tag = mesh.userData.worksLod;
          const show = !tag || tag === activeLod;
          mesh.visible = show;
          if (show) {
            visibleMeshCount += 1;
            const tris = triCount(mesh.geometry);
            visibleTriangles += tris;
            entry.visibleTriangles += tris;
            visibleNames.add(mesh.name);
            entry.visibleNodes.add(mesh.name);
          } else {
            hiddenMeshCount += 1;
            hiddenNames.add(mesh.name);
            entry.hiddenNodes.add(mesh.name);
          }
        }
      }
      const perShape = [...byAsset.values()].map((e) => ({
        assetId: e.assetId,
        kind: e.kind,
        activeLod: e.activeLod,
        instances: e.count,
        visibleNodes: [...e.visibleNodes].sort(),
        hiddenNodes: [...e.hiddenNodes].sort(),
        visibleTriangles: e.visibleTriangles,
      }));
      return {
        family,
        segmentCount: segments.length,
        activeLods: [...activeLods].sort(),
        desiredLod: desired,
        cameraDistance: Number(cameraDistance.toFixed(2)),
        projectedCellPx: Number(projectedCellPx.toFixed(2)),
        minSegmentPx: Number((Number.isFinite(minSegmentPx) ? minSegmentPx : 0).toFixed(2)),
        maxSegmentPx: Number(maxSegmentPx.toFixed(2)),
        visibleMeshCount,
        hiddenMeshCount,
        visibleTriangles,
        visibleNodeNames: [...visibleNames].sort(),
        hiddenNodeNames: [...hiddenNames].sort(),
        perShape,
      };
    };
    return {
      root,
      radius: null,
      identity: {
        type: 'conduitNetwork',
        family,
        cellPitchWu: CONDUIT_CELL_WU,
        segmentCount: segments.length,
        assetIds: [...blueprints.keys()].sort(),
      },
    };
  }

  async function buildMachinePreview(opts, renderer) {
    const rawId = String(opts.machineId || '');
    if (typeof document !== 'undefined') await preloadCreatureSkinLibrary(renderer).catch(() => null);
    if (Object.hasOwn(MACHINE_KINDS, rawId)) {
      if (rawId === 'surveyor_prism' && typeof document !== 'undefined') await preloadSurveyorSurface(renderer).catch(() => null);
      const kind = MACHINE_KINDS[rawId];
      const machineState = opts.machineState === 'working' || opts.machineWorking === true ? 'working' : 'idle';
      const working = machineState === 'working';
      const motionTime = Number.isFinite(opts.machineTime) ? opts.machineTime : (working ? 1.2 : 0);
      const entity = {
        id: 900000 + stablePreviewId(`machine:${rawId}`),
        type: 'machine',
        radius: kind.radius,
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        data: {
          machine: {
            kind: rawId,
            visualScanWinding: working,
            repairing: working,
            interrogating: working,
            working,
            awakened: working,
            visualCollecting: working,
            collectId: working ? 1 : null,
            awake: working,
          },
        },
      };
      const root = buildMachineMesh(entity);
      if (!root || root.userData?.machineKind !== rawId) throw new Error('machine visual identity mismatch: ' + rawId);
      const animated = typeof root.userData?.updateAuthoredMotion === 'function';
      if (animated) root.userData.updateAuthoredMotion(entity, motionTime);
      return {
        root,
        radius: kind.radius,
        identity: {
          type: 'machine',
          machineKind: rawId,
          state: machineState,
          time: motionTime,
          animated,
          rootName: root.name,
        },
      };
    }
    const propId = rawId.replace(/^machine_/, '');
    if (MACHINE_PROP_IDS.includes(propId)) {
      const propRadius = Number.isFinite(opts.machineRadius) && opts.machineRadius > 0 ? opts.machineRadius : 20;
      const root = buildMachineProp(propId, propRadius);
      if (!root || root.userData?.machinePropId !== propId) throw new Error('machine prop identity mismatch: ' + rawId);
      return {
        root,
        radius: null,
        identity: {
          type: 'machineProp',
          propId,
          radius: propRadius,
          rootName: root.name,
        },
      };
    }
    throw new Error('no machine or machine prop ' + rawId);
  }

  async function build(opts) {
    const { renderer, scene } = handles();
    if (opts.file) {
      const url = opts.file.startsWith('assets/') ? opts.file : RELEASE_ROOT + opts.file;
      const bp = await loadAuthoredPart(url, { renderer, slot: opts.slot || null });
      if (!bp) {
        const diagnostic = await getAuthoredAssetDiagnostic(renderer, url, opts.slot || null);
        throw new Error(`load failed: ${url}${diagnostic ? ` — ${diagnostic.message || diagnostic}` : ''}`);
      }
      return { root: blueprintToGroup(bp), radius: null };
    }
    if (opts.conduitNetworkFamily) return buildConduitNetwork(opts.conduitNetworkFamily, renderer);
    if (opts.machineId) return buildMachinePreview(opts, renderer);
    if (opts.asteroidType) {
      const types = ['ast_common_rock', 'ast_metallic', 'ast_icy', 'ast_crystalline', 'ast_gas_cloud', 'ast_rare_exotic'];
      const variant = opts.asteroidVariant;
      if (!types.includes(opts.asteroidType) || !Number.isInteger(variant) || variant < 0 || variant > 4 || !['lod0', 'lod1', 'lod2'].includes(opts.asteroidLod)) throw new Error('invalid asteroid preview');
      // The live factory hashes the entity ID to select one of five shared geometries.
      let id = 0;
      for (;; id++) {
        let hash = 2166136261;
        for (const ch of String(id)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
        if ((hash >>> 0) % 5 === variant) break;
      }
      const vf = state.render.vf || (await import('./visualFactory.js')).createVisualFactory();
      const root = vf.build({ id, type: 'asteroid', radius: 12, pos: { x: 0, z: 0 }, data: { typeId: opts.asteroidType } });
      root.userData.updateLod(opts.asteroidLod);
      return { root, radius: 12, identity: { type: 'asteroid', typeId: opts.asteroidType, variant, lod: opts.asteroidLod, entityId: id } };
    }
    if (opts.bombId) {
      if (!Object.hasOwn(BOMB_DEFS, opts.bombId)) throw new Error('no bomb payload ' + opts.bombId);
      const vf = state.render.vf || (await import('./visualFactory.js')).createVisualFactory();
      const entity = { id: 900000 + stablePreviewId(opts.bombId), type: 'bomb', radius: BOMB_PROXY_RADIUS,
        pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
        data: { bombId: opts.bombId, visualRadius: BOMB_VISUAL_RADIUS, armed: false } };
      const root = vf.build(entity);
      if (root?.userData?.payloadId !== opts.bombId) throw new Error('bomb visual identity mismatch: ' + opts.bombId);
      return { root, radius: BOMB_VISUAL_RADIUS, identity: { type: 'bomb', payloadId: opts.bombId,
        visualRadius: BOMB_VISUAL_RADIUS, proxyRadius: BOMB_PROXY_RADIUS, armed: false } };
    }
    if (opts.faunaId) {
      const entity = faunaPreviewEntity(opts.faunaId, { siteId: opts.faunaSite, aggregate: opts.faunaAggregate === true });
      const vf = state.render.vf || (await import('./visualFactory.js')).createVisualFactory();
      const root = vf.build(entity);
      const nursery = entity.data.ecology.siteId === 'veil_ray_nursery';
      const expectedName = entity.data.ecology.aggregate ? 'SF_VeilRay_Nursery_Juvenile_Flock' : 'SF_VeilRay_Nursery_Adult';
      if (!root || (nursery ? root.name !== expectedName : root.userData?.speciesId !== opts.faunaId)) {
        throw new Error('fauna visual identity mismatch: ' + opts.faunaId);
      }
      return { root, radius: entity.radius, identity: { type: 'fauna', speciesId: opts.faunaId,
        siteId: entity.data.ecology.siteId, strainId: entity.data.strainId, entityRadius: entity.radius,
        driveState: entity.data.ecology.driveState, aggregate: entity.data.ecology.aggregate, rootName: root.name } };
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
    const setStage = (s) => { if (typeof window !== 'undefined') window.__SF_fleetLookStage = s; };
    setStage('build');
    const built = await build(opts);
    if (!built.root.parent) holder.add(built.root);
    built.root.rotation.y = (opts.yaw || 0) * Math.PI / 180;
    const previousEnvironment = scene.environment;
    const previousBackground = scene.background;
    const restoreEnvironment = !!opts.ab?.noEnvironment;
    const restoreBackground = !!opts.ab?.noBackground;
    try {
      // A/B bench: scale one material factor across the shot (env / emissive / colour) and
      // optionally hide the scene environment, so a blowout can be traced to one term.
      if (opts.ab) {
        const ab = opts.ab;
        if (ab.noEnvironment) scene.environment = null;
        if (ab.noBackground) scene.background = null;
      }
      holder.updateMatrixWorld(true);
      let verdict = { ready: true, pending: [], failed: [], targetMeshes: 0 };
      // Yield one frame before either settle wait: the authored boundary stamps its pending
      // state asynchronously, and checked too early waitForAuthored sees no pending flags —
      // the pose below then measures an empty pre-upgrade marker and the frame ships blank.
      setStage('waitForAuthored:pre');
      await wait(120);
      if (opts.defId || opts.file) verdict = await waitForAuthored(renderer, scene, cam, built.root);
      if (!verdict.ready) throw new Error(`fleet-look authored preview not ready: ${JSON.stringify(verdict)}`);
      setStage('poseCamera');
      const box = new THREE.Box3().setFromObject(built.root);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = opts.radius || sphere.radius || built.radius || 6;
      built.root.position.sub(new THREE.Vector3(sphere.center.x, 0, sphere.center.z));
      // After the XZ recentre the bounding-sphere centre sits at (0, sphereY, 0) — the `place`
      // view frames and aims at that, so a tall station's mid-volume is what fills the picture.
      const placeCenter = new THREE.Vector3(0, sphere.center.y, 0);
      poseCamera(cam, opts.view || 'inspect', radius, opts.heading || 0, placeCenter, opts.dist);
      if (typeof built.root.userData?.updateLodForCamera === 'function') {
        built.root.userData.updateLodForCamera(cam, { width, height });
      }
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
      setStage('admit');
      const admit = state.render.compileObjectPipelines;
      if (typeof admit !== 'function') throw new Error('fleet-look pipeline admission unavailable');
      const result = await admit(holder, { explicit: true, strict: true, joinOutstanding: !opts.conduitNetworkFamily,
        onPreparationLeg: (leg) => setStage(`admit:${leg}`),
        isActive: () => built.root.parent === holder });
      if (!result || result.skipped === true || result.incomplete === true || result.contextLost === true) {
        throw new Error(`fleet-look pipeline admission incomplete: ${result?.reason || (result ? 'incomplete receipt' : 'no receipt')}`);
      }
      // Draw through the normal route with the same private camera used for this view.
      setStage('captureReady');
      const pose = () => poseCamera(cam, opts.view || 'inspect', radius, opts.heading || 0, placeCenter, opts.dist);
      let lodObservation = null;
      const finalFrame = await captureReadyFleetLookFrame({
        root: built.root,
        isActive: () => built.root.parent === holder,
        draw: () => {
          pose();
          scene.updateMatrixWorld(true);
          if (typeof built.root.userData?.updateLodForCamera === 'function') {
            lodObservation = built.root.userData.updateLodForCamera(cam, { width, height });
          }
          return withFleetLookMaterialFactors(built.root, opts.ab, () =>
            observePreviewDraw(renderer, built.root, () => renderOnce(renderer, scene, cam)));
        },
        capture: () => renderer.domElement.toDataURL('image/png'),
      });
      setStage('done');
      const { url, drawObservation } = finalFrame;
      verdict = finalFrame.verdict;
      lastPose = pose;
      lastCamera = cam;
      return {
        url, ok: verdict.ready, radius, identity: built.identity, diagNames: built.diagNames, drawObservation, authoredVerdict: verdict,
        ...(lodObservation ? { lodObservation } : {}),
        size: box.getSize(new THREE.Vector3()).toArray(),
        materials: withFleetLookMaterialFactors(built.root, opts.ab, () => collectMaterials(built.root)),
      };
    } finally {
      if (restoreEnvironment) scene.environment = previousEnvironment;
      if (restoreBackground) scene.background = previousBackground;
    }
  }

  // Draw `frames` through the shipping post route with a blocking GPU flush after each. This is
  // render-plus-wait wall time for comparisons, not a measurement of gameplay frame time.
  async function cost(opts = {}) {
    const { renderer, scene, camera: liveCamera } = handles();
    const cam = lastCamera || liveCamera;
    const frames = Math.max(8, opts.frames | 0 || 40);
    return measureFleetLookCost({
      renderer,
      frames,
      beforeFrame() { if (lastPose) lastPose(); },
      renderFrame() { renderOnce(renderer, scene, cam); },
      now: () => performance.now(),
      yieldToMain: () => wait(0),
    });
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
    assetDiagnostics: () => getAuthoredAssetRuntimeInfo(handles().renderer, { includeFailures: true, includeResources: true }),
    ships: () => SHIPS.map((s) => s.id),
    machines: () => ({ machines: Object.keys(MACHINE_KINDS), props: [...MACHINE_PROP_IDS] }),
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
