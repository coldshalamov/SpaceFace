// The UI stage — a lit world behind a screen, drawn by the MAIN renderer
// (design/frontend/direction/packets/P20-ui-stage/PACKET.md).
//
// Before this module no screen in the game had a world behind it. `presentationFreeze.js` stops the
// flight scene from submitting whenever a screen is open, so the canvas under every menu was the
// last flight frame — or, at the title, nothing at all. The only 3D that ever appeared under a menu
// came from `src/ui/shipPreviewMount.js`, which opens a SECOND WebGLRenderer; that context is
// refused outright on Intel GPUs (`secondaryPreviewWebGlBlocked`) and TDR'd the live one when it
// was not.
//
// The freeze exists for a good reason: a map that lets an off-screen enemy keep killing the player
// is an ambush. That reason is kept exactly. **The simulation stays frozen; the picture does not.**
// This module owns its own THREE.Scene and camera and hands them to the renderer the game already
// has, so a lit world costs one draw and zero extra GL contexts.
//
// The seam is one-way and allocation-free on the flight path: a screen writes
// `state.ui.stageRequest`, `renderUpdatePhase` calls `presentUiStage()` only inside the frozen
// branch, and `uiStageResident()` is a single boolean read for everything else.

import * as THREE from 'three';
import { canvasIsProtectedDuringFreeze } from '../core/presentationFreeze.js';
import { loadAuthoredPart } from './assetLoader.js';
import { wholeShipVisualForEntity } from './partsLibrary.js';
import { isReleaseAssetMode } from './releaseMode.js';
import { yieldToBrowser } from './startupGpuResidency.js';

const PART_ROOT = 'assets/ships/parts/';
const PART_RELEASE_ROOT = 'assets/ships/release/parts/';

/** Sky shell radius. Everything authored sits well inside it. */
const SKY_RADIUS = 2600;

// Scratch for the per-frame stage draw. The flight path never enters drawStage; menus do every
// rAF, so these must not allocate.
const _stageSize = new THREE.Vector2();
const _stageClear = new THREE.Color();
const _stageTarget = new THREE.Vector3();
const _stageOffset = new THREE.Vector3();
const _stageUp = new THREE.Vector3(0, 1, 0);

/**
 * The authored scenes.
 *
 * Each scene is a camera, a sky, a light rig and a prop list. Props are named by their committed
 * part id and placed by NORMALISED size, not by the GLB's own scale: `fit` is the target largest
 * dimension in stage metres and `at` is where the prop's footprint centre lands, with `sit`
 * choosing whether `at[1]` means the prop's centre (`'centre'`) or the bottom of its box
 * (`'floor'`) or the top (`'top'`). A set re-authored at a different scale therefore still composes.
 *
 * P16 replaces `title-field` / `berth` / `arena-foundry` with its own rendered sets; the ids and
 * this contract are what it swaps into. `held-world` is the frozen flight picture and draws
 * nothing — the last flight frame is already on the canvas and is the correct image for pause.
 */
const SCENES = Object.freeze({
  // The approved title shot: "Field at dusk" (approved/DECISIONS.md 2026-09-10, frame-title-v2).
  // A working hull seated on rock under a low sun, a mast and a worklight on the far claim, cargo
  // staged on the saddle between them, and the sky going cold above the warm band.
  'title-field': {
    sky: {
      zenith: 0x241f33, horizon: 0x7d4614, ground: 0x351d08,
      horizonSoftness: 0.11, stars: 0.85, starSeed: 2947,
    },
    fog: { color: 0x5c3310, density: 0.0016 },
    lights: {
      // The low sun sits off the camera's LEFT SHOULDER, not behind the hull. Putting it behind
      // turned the whole composition into a silhouette: the hull is the subject, and the frame
      // this scene is built from shows its flank and deck catching a warm raking light.
      key: { color: 0xffb473, intensity: 2.9, dir: [-0.74, 0.22, 0.62], shadow: true },
      // The cold sky opposite it, which is what makes a dusk read as dusk.
      rim: { color: 0x8fa8dc, intensity: 0.85, dir: [0.66, 0.4, -0.62] },
      hemi: { sky: 0x3d3552, ground: 0x4a2408, intensity: 0.52 },
      ambient: { color: 0x2c2536, intensity: 0.28 },
      // The claim's own lamps: the mast head and the worklight the frame shows burning.
      practicals: [
        { color: 0xbfd8ff, intensity: 22, at: [-27, 10, -14], distance: 70 },
        { color: 0xffb877, intensity: 34, at: [33, 2, -24], distance: 90 },
      ],
    },
    camera: { at: [-20, 10, 76], target: [6, 2.5, -8], fov: 30 },
    drift: { yaw: 0.044, pitch: 0.012, period: 46 },
    // Seated, not hovering: the hull's centre sits a shade BELOW the rock cap so the gear and the
    // keel meet the stone and the key light lays a real contact shadow across it.
    hull: { fit: 26, at: [7, 1.1, -6], yaw: -0.5, roll: -0.05 },
    props: [
      { id: 'place_asteroid_rock_a', fit: 40, at: [7, -1.4, -7], sit: 'top', yaw: 0.7, casts: true },
      { id: 'place_asteroid_rock_b', fit: 24, at: [-35, -12, -38], sit: 'top', yaw: 2.1 },
      { id: 'place_sensor_mast', fit: 19, at: [-34, -12, -38], sit: 'floor', yaw: -0.3 },
      { id: 'place_worklight_tower', fit: 26, at: [35, -13, -32], sit: 'floor', yaw: -1.15 },
      { id: 'place_cargo_pod_standard', fit: 5.5, at: [-18, -15, -30], sit: 'centre', yaw: 0.15 },
      { id: 'place_cargo_pod_standard', fit: 5.5, at: [-12.5, -16, -28], sit: 'centre', yaw: 0.1 },
      { id: 'place_container_rack', fit: 7.5, at: [-24, -14, -33], sit: 'centre', yaw: 0.2 },
    ],
  },

  // The berth: the player's own hull in the dock interior, seen from the bay while docked.
  // A berth is a ROOM with a ship in it, and most of it is seen around the panels rather than behind
  // a clear centre — so it is lit to read from any window onto it: bright bay practicals, the hull
  // broadside across the middle distance, and the dock shell wide enough to fill the edges.
  berth: {
    sky: { zenith: 0x060910, horizon: 0x14203a, ground: 0x080b14, horizonSoftness: 0.4, stars: 0.4, starSeed: 6110 },
    fog: { color: 0x0c1830, density: 0.0055 },
    lights: {
      key: { color: 0xffd9b0, intensity: 2.6, dir: [-0.5, 0.95, 0.62], shadow: true },
      rim: { color: 0x69cde0, intensity: 1.5, dir: [0.78, 0.3, -0.55] },
      hemi: { sky: 0xb9d8df, ground: 0x24170f, intensity: 0.58 },
      ambient: { color: 0x607087, intensity: 0.44 },
      practicals: [
        { color: 0xf0a94d, intensity: 70, at: [-18, 8, 18], distance: 95 },
        { color: 0x8fc7ff, intensity: 46, at: [20, 12, -14], distance: 110 },
        { color: 0xffb26a, intensity: 34, at: [6, -4, 26], distance: 70 },
      ],
    },
    camera: { at: [-30, 7, 58], target: [2, 0, -8], fov: 38 },
    drift: { yaw: 0.03, pitch: 0.008, period: 54 },
    hull: { fit: 34, at: [2, 0.5, -6], yaw: -0.55, roll: 0 },
    props: [
      { id: 'place_dock_interior', fit: 120, at: [0, -16, -10], sit: 'floor', yaw: 0 },
      { id: 'place_maintenance_gantry', fit: 26, at: [-26, -16, 8], sit: 'floor', yaw: 0.42, casts: true },
      { id: 'place_container_rack', fit: 11, at: [24, -16, 14], sit: 'floor', yaw: -0.5 },
    ],
  },

  // The Crucible door: a foundry running hot, seen past the panel (frame-crucible-door).
  'arena-foundry': {
    // A foundry seen at DEPTH, not a red field. The hot band stays low and tight so the rigs read as
    // silhouettes standing in it and the words above them keep a dark ground to sit on.
    sky: { zenith: 0x110409, horizon: 0x8e2c08, ground: 0x190602, horizonSoftness: 0.075, stars: 0.18, starSeed: 4242 },
    fog: { color: 0x4a1505, density: 0.0058 },
    lights: {
      key: { color: 0xff6a22, intensity: 2.3, dir: [-0.35, 0.26, 0.9], shadow: true },
      rim: { color: 0x5f8ed8, intensity: 0.5, dir: [0.8, 0.5, -0.4] },
      hemi: { sky: 0x8a3a14, ground: 0x140503, intensity: 0.42 },
      ambient: { color: 0x280b03, intensity: 0.24 },
      // The furnace itself. Two hot practicals are what makes the arena read as RUNNING, and they
      // are the only bright things in the scene.
      practicals: [
        { color: 0xff8a2b, intensity: 90, at: [12, 1, -30], distance: 130 },
        { color: 0xffd08a, intensity: 40, at: [-26, 4, -12], distance: 100 },
        { color: 0xffa050, intensity: 26, at: [30, -3, 14], distance: 60 },
      ],
    },
    camera: { at: [-6, 11, 54], target: [12, 0, -18], fov: 38 },
    drift: { yaw: 0.036, pitch: 0.01, period: 50 },
    hull: { fit: 20, at: [30, -3, 16], yaw: 1.15, roll: 0.14 },
    props: [
      { id: 'place_freight_platform', fit: 46, at: [14, -9, -26], sit: 'floor', yaw: 0.18, casts: true },
      { id: 'place_conveyor_truss', fit: 64, at: [34, -6, -10], sit: 'centre', yaw: -0.24 },
      { id: 'place_conveyor_truss', fit: 52, at: [-24, -7, -38], sit: 'centre', yaw: 0.5 },
      { id: 'place_maintenance_gantry', fit: 30, at: [8, -9, -30], sit: 'floor', yaw: -0.1 },
      { id: 'place_radiator_bank', fit: 34, at: [52, -9, -44], sit: 'floor', yaw: -0.55 },
      { id: 'place_drill_platform', fit: 30, at: [-34, -9, -52], sit: 'floor', yaw: 0.9 },
    ],
    floor: { color: 0x2a0c04, roughness: 0.92, size: 900, y: -9.4 },
  },

  'held-world': null,
});

/** The authored hull every stage shows until a caller names another. */
const DEFAULT_HULL = 'wholeships/kestrel.glb';

/**
 * Which hull this stage seats. A screen names a ship def (the berth names the one the player flies)
 * and the live whole-ship map answers it; anything unmapped falls back to the starter hull rather
 * than showing nothing, because an empty berth is the failure this packet exists to remove.
 */
function hullFileForRequest(request) {
  if (typeof request.hullFile === 'string' && request.hullFile) return request.hullFile;
  const defId = typeof request.hullDefId === 'string' ? request.hullDefId : null;
  if (defId) {
    try {
      const selection = wholeShipVisualForEntity({ data: { defId } });
      if (selection && typeof selection.file === 'string' && selection.file) return selection.file;
    } catch (error) {
      console.warn('[uiStage] whole-ship lookup failed for', defId, error);
    }
  }
  return DEFAULT_HULL;
}

// ---------------------------------------------------------------------------------------------
// Module state. One stage at a time; the flight path only ever reads `resident`.

let resident = false;
let stage = null;
let lastStatus = 'idle';
let lastScene = null;
let lastError = null;
let idleFrames = 0;

/** How long a requested-nothing stage is kept alive before its GPU memory goes back. */
const IDLE_RELEASE_FRAMES = 90;

/** True when a stage scene is built or building. One property read on the flight path. */
export function uiStageResident() {
  return resident;
}

/**
 * Should the frozen presentation draw a stage instead of nothing?
 *
 * Only an explicit screen request opens the stage. A freeze caused by a mid-cook sector shell or by
 * the loading route is protecting a canvas that must not be drawn over, so those keep their hold.
 */
export function uiStageRequestFor(state) {
  if (!state || !state.ui) return null;
  if (canvasIsProtectedDuringFreeze(state)) return null;
  const request = state.ui.stageRequest;
  if (!request || typeof request !== 'object') return null;
  const scene = typeof request.scene === 'string' ? request.scene : null;
  if (!scene || !(scene in SCENES)) return null;
  if (SCENES[scene] === null) return null; // held-world: the frozen picture is already correct.
  return request;
}

/**
 * Draw the requested stage. Called ONLY from the frozen branch of the presentation frame.
 * Returns true when a stage frame was submitted.
 */
export function presentUiStage({ render, state, frameDt = 0 } = {}) {
  const request = uiStageRequestFor(state);
  if (!request) {
    if (resident && ++idleFrames > IDLE_RELEASE_FRAMES) releaseUiStage('idle');
    return false;
  }
  idleFrames = 0;

  const renderer = rendererFrom(render, state);
  if (!renderer) {
    publishStatus(request, 'unavailable');
    return false;
  }

  const sceneId = request.scene;
  // A scene swap is not the only thing that invalidates a stage. The berth re-requests `berth` with
  // a different hull when the player changes ship, and comparing scene ids alone would have shown
  // whichever hull was built first for the rest of the session.
  const hullFile = hullFileForRequest(request);
  if (stage && stage.id !== sceneId) releaseUiStage('scene-swap');
  else if (stage && stage.hullFile !== hullFile) releaseUiStage('hull-swap');
  if (!stage) {
    try {
      stage = buildStage(sceneId, renderer, request, hullFile);
      resident = true;
      lastScene = sceneId;
    } catch (error) {
      console.warn('[uiStage] stage build failed; the screen keeps its authored plate', error);
      publishStatus(request, 'unavailable');
      return false;
    }
  }

  stage.request = request;
  const dt = Number.isFinite(frameDt) ? Math.min(0.1, Math.max(0, frameDt)) : 0;
  stage.clock += motionAllowed(state) ? dt : 0;

  try {
    drawStage(stage, renderer, state);
  } catch (error) {
    console.warn('[uiStage] stage draw failed', error);
    publishStatus(request, 'unavailable');
    releaseUiStage('draw-error');
    return false;
  }

  if (!stage.hullDrawn) publishStatus(request, 'loading');
  // A drawn frame is not a SEEN frame. A host can hide the world canvas — the reference-frame
  // capture does exactly that, and a forced-colours or reduced-transparency host may too — and a
  // screen that faded its authored plate out for a stage nobody can see is a black screen. Report
  // the plate instead; it is then the picture, and the screen is honestly ready to photograph.
  else publishStatus(request, canvasIsVisible(renderer, stage) ? 'live' : 'plate');
  return true;
}

/** Drop the stage's scene graph. Geometry and materials belong to the asset cache, not to us. */
export function releaseUiStage(reason = 'release') {
  if (!stage) { resident = false; return false; }
  const dying = stage;
  stage = null;
  resident = false;
  idleFrames = 0;
  dying.disposed = true;
  try {
    dying.scene.traverse((node) => {
      // Only what this module created: the sky shell, the star field and the arena floor. Authored
      // GLB geometry and materials are shared with the asset cache and outlive every stage.
      if (node.userData && node.userData.uiStageOwned === true) {
        if (node.geometry) node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) if (material && material.dispose) material.dispose();
      }
    });
    dying.scene.clear();
    if (dying.rig && dying.rig.depthMaterial) dying.rig.depthMaterial.dispose();
  } catch (error) {
    console.warn('[uiStage] release failed', error);
  }
  if (dying.request) publishStatus(dying.request, 'idle');
  lastStatus = 'idle';
  return reason !== null;
}

/**
 * Diagnostics for the receipt, the capture receipts and anyone asking "is that really the world?".
 *
 * Published on `window.__SF_UI_STAGE__` so a headed probe can tell a live scene from a plate
 * without reading pixels — "a lit world" is a claim, and this is where it is checked.
 */
export function uiStageReport() {
  return {
    resident,
    scene: stage ? stage.id : null,
    hullFile: stage ? stage.hullFile : null,
    lastScene,
    status: lastStatus,
    phase: stage ? stage.phase : 'none',
    hullDrawn: !!(stage && stage.hullDrawn),
    props: stage ? stage.propsLoaded : 0,
    propsRequested: stage ? stage.propsRequested : 0,
    frames: stage ? stage.frames : 0,
    marks: stage ? stage.marks : null,
    prepared: stage ? stage.prepared : null,
    lastError: lastError ? String(lastError).slice(0, 300) : null,
    contexts: 1,
  };
}

if (typeof globalThis !== 'undefined') globalThis.__SF_UI_STAGE__ = uiStageReport;

// ---------------------------------------------------------------------------------------------

function rendererFrom(render, state) {
  const fromSystem = render && render.renderer;
  if (fromSystem && typeof fromSystem.render === 'function') return fromSystem;
  const fromState = state && state.render && state.render.renderer;
  if (fromState && typeof fromState.render === 'function') return fromState;
  return null;
}

/**
 * Is the renderer's canvas actually on screen? Sampled rather than read every frame: this is a
 * layout query, and the answer changes on a stylesheet edit, not on a draw.
 */
const CANVAS_VISIBILITY_SAMPLE_FRAMES = 30;
function canvasIsVisible(renderer, stage) {
  if (stage.canvasVisibleAt !== undefined && stage.frames - stage.canvasVisibleAt < CANVAS_VISIBILITY_SAMPLE_FRAMES) {
    return stage.canvasVisible;
  }
  stage.canvasVisibleAt = stage.frames;
  stage.canvasVisible = true;
  const canvas = renderer.domElement;
  if (!canvas || typeof getComputedStyle !== 'function' || !canvas.isConnected) return stage.canvasVisible;
  try {
    const style = getComputedStyle(canvas);
    stage.canvasVisible = style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0.01;
  } catch (_) { /* a host without layout keeps the optimistic answer */ }
  return stage.canvasVisible;
}

function motionAllowed(state) {
  const video = state && state.settings && state.settings.video;
  if (video && video.motionReduce) return false;
  if (typeof matchMedia === 'function') {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (_) {}
  }
  return true;
}

function publishStatus(request, status) {
  if (status !== lastStatus) {
    lastStatus = status;
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.sfStage = status;
    }
  }
  const notify = request && request.onStatus;
  if (typeof notify === 'function' && request.__lastStatus !== status) {
    request.__lastStatus = status;
    try { notify(status); } catch (error) { console.warn('[uiStage] status listener failed', error); }
  }
}

function buildStage(id, renderer, request, hullFile) {
  const spec = SCENES[id];
  if (!spec) throw new Error(`unknown ui stage "${id}"`);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(spec.camera.fov, 16 / 9, 0.5, SKY_RADIUS * 1.6);

  const sky = buildSky(spec.sky);
  scene.add(sky);
  const skyRiders = [sky];
  if (spec.sky.stars > 0) {
    const stars = buildStars(spec.sky);
    scene.add(stars);
    skyRiders.push(stars);
  }
  if (spec.fog) scene.fog = new THREE.FogExp2(spec.fog.color, spec.fog.density);
  if (spec.floor) scene.add(buildFloor(spec.floor));

  const rig = buildLights(spec.lights);
  for (const light of rig.lights) scene.add(light);

  const built = {
    id,
    hullFile: hullFile || hullFileForRequest(request),
    spec,
    scene,
    camera,
    skyRiders,
    rig,
    request,
    clock: 0,
    frames: 0,
    phase: 'building',
    // Wall-clock milestones, so "the stage is slow" is always a number and never an impression.
    marks: { start: stageNow(), props: 0, hull: 0, prepared: 0 },
    disposed: false,
    hullDrawn: false,
    propsLoaded: 0,
    propsRequested: spec.props.length,
    prepared: false,
    generation: (buildStage.generation = (buildStage.generation || 0) + 1),
  };

  applyCamera(built, 0);
  loadSceneContent(built, renderer, request).catch((error) => {
    built.phase = 'failed';
    lastError = error && error.message ? error.message : String(error);
    console.warn('[uiStage] scene content failed', error);
  });
  return built;
}

/**
 * Authored content arrives asynchronously and is admitted whole: every prop and the hull are
 * decoded, compiled and uploaded BEFORE anything joins the scene, so the first stage frame that
 * carries the hull is also the first frame that shows it. That is what `data-k-ready` reports on —
 * not a plate's load event, and not an empty canvas.
 */
async function loadSceneContent(built, renderer, request) {
  const { spec } = built;
  built.phase = 'loading-props';
  const hullFile = built.hullFile;

  const propGroups = await Promise.all(spec.props.map(async (placement, index) => {
    const record = await loadPart(`places/${placement.id}.glb`, renderer, 'place');
    if (!record) return null;
    const group = groupFromBlueprint(record, `${placement.id}_${index}`);
    placeByBounds(group, placement);
    return group;
  }));

  built.marks.props = stageNow() - built.marks.start;
  built.phase = 'loading-hull';
  const hullRecord = await loadPart(hullFile, renderer, 'hull');
  built.marks.hull = stageNow() - built.marks.start;
  let hullGroup = null;
  if (hullRecord) {
    hullGroup = groupFromBlueprint(hullRecord, 'UiStageHull');
    placeByBounds(hullGroup, { ...spec.hull, sit: 'centre' });
    hullGroup.rotation.z = spec.hull.roll || 0;
  }

  if (built.disposed) return;

  built.phase = 'preparing';
  const admitted = [...propGroups.filter(Boolean), ...(hullGroup ? [hullGroup] : [])];
  for (let i = 0; i < propGroups.length; i++) {
    if (propGroups[i]) setShadowRoles(propGroups[i], built.rig, spec.props[i].casts === true);
  }
  if (hullGroup) setShadowRoles(hullGroup, built.rig, true);
  await prepareForFirstDraw(admitted, renderer, built);
  if (built.disposed) return;
  // One reveal, one frame: every prop and the hull arrive together, so the title never shows a
  // half-built site.
  for (const group of admitted) group.visible = true;
  built.marks.prepared = stageNow() - built.marks.start;
  built.propsLoaded = propGroups.filter(Boolean).length;
  built.hullDrawn = !!hullGroup;
  built.phase = hullGroup ? 'live' : 'no-hull';
  if (!hullGroup) {
    console.warn('[uiStage] the authored hull did not load; the stage stays on its plate');
  }
}

async function loadPart(file, renderer, slot) {
  const urls = isReleaseAssetMode()
    ? [`${PART_RELEASE_ROOT}${file}`, `${PART_ROOT}${file}`]
    : [`${PART_ROOT}${file}`];
  for (const url of urls) {
    try {
      const record = await loadAuthoredPart(url, { renderer, slot, optional: true });
      if (record) return record;
    } catch (error) {
      lastError = `${url}: ${error && error.message ? error.message : error}`;
      console.warn('[uiStage] part load failed', url, error);
    }
  }
  return null;
}

function groupFromBlueprint(record, name) {
  const root = new THREE.Group();
  root.name = name;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (const primitive of record.primitives) {
    const mesh = new THREE.Mesh(primitive.geometry, primitive.material);
    mesh.name = primitive.name;
    primitive.matrix.decompose(position, quaternion, scale);
    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);
    mesh.scale.copy(scale);
    root.add(mesh);
  }
  return root;
}

/**
 * Normalise an authored part to the composition instead of trusting its own metres. `fit` is the
 * largest dimension the frame wants; `sit` says which face of the box `at[1]` refers to.
 */
function placeByBounds(group, placement) {
  group.rotation.y = placement.yaw || 0;
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);
  const span = Math.max(size.x, size.y, size.z);
  const factor = span > 0 && Number.isFinite(placement.fit) ? placement.fit / span : 1;
  group.scale.setScalar(factor);

  const [x, y, z] = placement.at;
  const halfHeight = (size.y * factor) * 0.5;
  const anchor = placement.sit === 'floor' ? y + halfHeight
    : placement.sit === 'top' ? y - halfHeight
      : y;
  group.position.set(
    x - centre.x * factor,
    anchor - centre.y * factor,
    z - centre.z * factor,
  );
}

function buildSky(sky) {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 48, 32);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
    uniforms: {
      uZenith: { value: new THREE.Color(sky.zenith) },
      uHorizon: { value: new THREE.Color(sky.horizon) },
      uGround: { value: new THREE.Color(sky.ground) },
      uSoftness: { value: sky.horizonSoftness },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    // Three stops by elevation. The band at the horizon is the whole point of the dusk reading, so
    // it gets its own falloff rather than a straight lerp from zenith to ground.
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform float uSoftness;
      varying vec3 vDir;
      void main() {
        // A camera framed on the ground only ever sees the lowest slice of the shell, so the
        // whole dusk transition has to happen inside it: uSoftness is the elevation the warm band
        // survives to, not a hemisphere-wide lerp. A gradient spread over 90 degrees reads as one
        // flat wash at 30 and loses the cold sky the direction is built on.
        float h = vDir.y;
        float reach = max(0.04, uSoftness);
        float up = clamp(h / reach, 0.0, 1.0);
        float down = clamp(-h / (reach * 1.6), 0.0, 1.0);
        vec3 base = h >= 0.0
          ? mix(uHorizon, uZenith, up * up)
          : mix(uHorizon, uGround, down * down);
        gl_FragColor = vec4(base, 1.0);
        // A raw ShaderMaterial gets none of three's output chunks, so without these two lines the
        // sky is written in the LINEAR working space straight into an sRGB framebuffer: an authored
        // violet zenith arrives on screen as near-black red-brown and the whole dusk reads as one
        // flat wash. Every lit material in the scene goes through this; the sky has to as well.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'UiStageSky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  // The shell rides the camera. Anchored at the origin its horizon sits at world y=0, so a camera
  // ten metres up spends the whole frame looking at the shell's GROUND half and the dusk band never
  // appears — the picture goes one flat orange. Riding the camera puts the horizon at eye level,
  // which is where a horizon is.
  mesh.userData.uiStageFollowsCamera = true;
  mesh.userData.uiStageOwned = true;
  return mesh;
}

/**
 * Distant stars at sky depth: the one camera-facing point the visual standard admits, and only
 * while tiny and bright. Seeded, so a scene composes identically on every boot.
 */
function buildStars(sky) {
  const count = Math.round(900 * sky.stars);
  const positions = new Float32Array(count * 3);
  const random = seededRandom(sky.starSeed);
  const radius = SKY_RADIUS * 0.94;
  for (let i = 0; i < count; i++) {
    // Above the horizon only; the ground half of the shell is rock and haze.
    const elevation = Math.asin(0.04 + random() * 0.96);
    const azimuth = random() * Math.PI * 2;
    const cos = Math.cos(elevation);
    positions[i * 3] = Math.cos(azimuth) * cos * radius;
    positions[i * 3 + 1] = Math.sin(elevation) * radius;
    positions[i * 3 + 2] = Math.sin(azimuth) * cos * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xd8e4ff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'UiStageStars';
  points.frustumCulled = false;
  points.renderOrder = -999;
  points.userData.uiStageFollowsCamera = true;
  points.userData.uiStageOwned = true;
  return points;
}

function buildFloor(floor) {
  const geometry = new THREE.PlaneGeometry(floor.size, floor.size);
  const material = new THREE.MeshStandardMaterial({
    color: floor.color,
    roughness: floor.roughness,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'UiStageFloor';
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.position.y = floor.y;
  mesh.receiveShadow = true;
  mesh.userData.uiStageOwned = true;
  return mesh;
}

function buildLights(spec) {
  const lights = [];
  const key = new THREE.DirectionalLight(spec.key.color, spec.key.intensity);
  key.position.set(...spec.key.dir).normalize().multiplyScalar(160);
  key.castShadow = spec.key.shadow === true;
  if (key.castShadow) {
    key.shadow.mapSize.set(1024, 1024);
    const extent = 90;
    key.shadow.camera.left = -extent;
    key.shadow.camera.right = extent;
    key.shadow.camera.top = extent;
    key.shadow.camera.bottom = -extent;
    key.shadow.camera.near = 20;
    key.shadow.camera.far = 420;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.05;
  }
  lights.push(key);
  lights.push(key.target);

  const rim = new THREE.DirectionalLight(spec.rim.color, spec.rim.intensity);
  rim.position.set(...spec.rim.dir).normalize().multiplyScalar(160);
  lights.push(rim);
  lights.push(new THREE.HemisphereLight(spec.hemi.sky, spec.hemi.ground, spec.hemi.intensity));
  lights.push(new THREE.AmbientLight(spec.ambient.color, spec.ambient.intensity));
  for (const practical of spec.practicals || []) {
    if (!(practical.intensity > 0)) continue;
    const point = new THREE.PointLight(practical.color, practical.intensity, practical.distance, 2);
    point.position.set(...practical.at);
    lights.push(point);
  }
  const depthMaterial = key.castShadow
    ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    : null;
  return { lights, shadows: key.castShadow, depthMaterial };
}

/**
 * Who casts and who only receives.
 *
 * Everything casting is the expensive default: each caster needs its own depth program, and those
 * are NOT covered by compileAsync — they link inside the first shadowed draw, which is a stall the
 * player watches. Only the objects whose shadow the composition is actually about cast one. On the
 * title that is the hull and the rock it stands on; the mast, the worklight and the cargo are
 * silhouettes against the sky and lose nothing.
 */
function setShadowRoles(group, rig, casts) {
  if (!rig.shadows) return;
  group.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = casts === true;
    node.receiveShadow = true;
    // ONE depth program for the whole shadow pass. The shadow map builds its own depth material per
    // caster material, and those are the one thing compileAsync cannot reach: they link inside the
    // first shadowed draw. An authored hull carries dozens of materials, so that was four seconds
    // of frozen title. A shared custom depth material collapses it to a single program.
    if (casts === true) node.customDepthMaterial = rig.depthMaterial;
  });
}

/**
 * Admit the whole set at once, IN the scene, then wait for it as a pool.
 *
 * Two things made this the slowest part of the packet, and both are worth naming because both look
 * correct:
 *
 * 1. Compiling a leaf on its own (`compileAsync(leaf, camera, scene)`) builds the program against
 *    the lights `leaf` can see, and a detached leaf can see none. Every program was therefore
 *    compiled unlit and relinked inside the first real draw. The scene is added to the graph first,
 *    invisible, and compiled as a scene so the light setup is the one the draw will use.
 * 2. A program is keyed on the renderer's shadow flag too, so the flag is set to the draw's value
 *    before compiling and put back afterwards.
 *
 * Measured at the title, both fixed: the first stage frame moved from a twelve-second main-thread
 * stall to well under a second, and the scene goes from requested to live in about three.
 */
async function prepareForFirstDraw(roots, renderer, built) {
  // In the graph but not yet on screen: three compiles what a scene CONTAINS, and draws what a
  // scene SHOWS. This is the only way to get the real light setup without showing a cold frame.
  for (const root of roots) {
    root.visible = false;
    built.scene.add(root);
  }

  const shadowsWere = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = built.rig.shadows;
  let programs = 0;
  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(built.scene, built.camera);
    } else {
      renderer.compile(built.scene, built.camera);
    }
    programs = renderer.info && renderer.info.programs ? renderer.info.programs.length : 0;
  } finally {
    renderer.shadowMap.enabled = shadowsWere;
  }
  if (built.disposed) return;

  // Textures still upload one chunk at a time: an authored set carries well over a hundred, and
  // uploading them inside the draw is the other way to lose a second of the player's attention.
  const textures = new Set();
  for (const root of roots) {
    root.traverse((node) => {
      if (!node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value && value.isTexture) textures.add(value);
        }
      }
    });
  }
  const UPLOAD_CHUNK = 12;
  let uploaded = 0;
  for (const texture of textures) {
    if (built.disposed) return;
    renderer.initTexture(texture);
    if (++uploaded % UPLOAD_CHUNK === 0) await yieldToBrowser();
  }
  if (built.disposed) return;

  // One shadow pass before the reveal. With a single shared depth program this is cheap, and doing
  // it here puts the last link inside the window the plate is already covering.
  if (built.rig.shadows) {
    for (const root of roots) root.visible = true;
    const shadowsBefore = renderer.shadowMap.enabled;
    const targetBefore = renderer.getRenderTarget();
    try {
      renderer.shadowMap.enabled = true;
      renderer.setRenderTarget(null);
      renderer.render(built.scene, built.camera);
    } catch (error) {
      console.warn('[uiStage] shadow warm-up failed; the first frame links it instead', error);
    } finally {
      renderer.shadowMap.enabled = shadowsBefore;
      renderer.setRenderTarget(targetBefore);
    }
    for (const root of roots) root.visible = false;
    if (built.disposed) return;
    await yieldToBrowser();
  }
  built.prepared = { programs, textures: textures.size };
}

/**
 * The authored camera move: a slow sway either side of the approved framing, never a turntable.
 * The frame that was picked stays the frame; the world just breathes.
 */
function applyCamera(built, time) {
  const { camera, spec } = built;
  const period = spec.drift.period;
  const phase = period > 0 ? (time / period) * Math.PI * 2 : 0;
  const yaw = Math.sin(phase) * (spec.drift.yaw * Math.PI / 180) * 60;
  const lift = Math.sin(phase * 0.6) * spec.drift.pitch * 60;

  _stageTarget.fromArray(spec.camera.target);
  _stageOffset.fromArray(spec.camera.at).sub(_stageTarget);
  _stageOffset.applyAxisAngle(_stageUp, yaw);
  _stageOffset.y += lift;
  camera.position.copy(_stageTarget).add(_stageOffset);
  camera.lookAt(_stageTarget);
}

function drawStage(built, renderer, state) {
  const size = renderer.getSize(_stageSize);
  const aspect = size.y > 0 ? size.x / size.y : 16 / 9;
  if (Math.abs(built.camera.aspect - aspect) > 1e-4) {
    built.camera.aspect = aspect;
    built.camera.updateProjectionMatrix();
  }
  applyCamera(built, built.clock);
  for (const rider of built.skyRiders) rider.position.copy(built.camera.position);
  if (built.rig.shadows && built.hullDrawn && built.shadowsRendered !== true) {
    built.shadowsRendered = true;
  }

  // Borrow the live renderer for exactly one draw, then hand every piece of its state back. The
  // flight path must find the renderer it left: a stage that leaks its render target, its clear
  // colour or its shadow flag would change the next flight frame.
  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  const previousShadows = renderer.shadowMap.enabled;
  const previousClear = renderer.getClearColor(_stageClear);
  const previousClearAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    renderer.shadowMap.enabled = built.rig.shadows;
    renderer.setClearColor(built.spec.sky.ground, 1);
    renderer.render(built.scene, built.camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    renderer.shadowMap.enabled = previousShadows;
    renderer.setClearColor(previousClear, previousClearAlpha);
  }
  built.frames++;
  if (state && state.render) state.render.uiStageFrames = (state.render.uiStageFrames || 0) + 1;
}

/** Presentation-side clock for the admission milestones. Never on the simulation path. */
function stageNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

/** Deterministic composition: the same stars every boot, no ambient randomness. */
function seededRandom(seed) {
  let value = (seed >>> 0) || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
