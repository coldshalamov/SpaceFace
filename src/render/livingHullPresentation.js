// Render-only adapter for the Living Hull record. One controller is retained for the renderer's
// lifetime and reparented across player mesh rebuilds, so rare history changes never construct a
// material, geometry, shader program, or instance buffer during ordinary flight.
import * as THREE from 'three';
import {
  LIVING_HULL_CYCLE_SECONDS,
  LIVING_HULL_GRIME_MAX,
  LIVING_HULL_GRIME_PER_CYCLE,
  LIVING_HULL_HEAT_SCORCH_MAX,
  LIVING_HULL_KILL_TALLY_MAX,
  LIVING_HULL_REPAIR_PATCH_MAX,
  LIVING_HULL_SCAR_MAX,
} from '../core/livingHull.js';
import { shouldUseTransparentSinglePass } from './transparentSinglePassPolicy.js';
import { SHARED_MATERIAL_ROLE, stampSharedMaterialRole } from './sharedMaterialRoles.js';
import { installIllustratedSurface } from './illustratedSurface.js';

// Chase-camera mark. The old 256×64 atlas smeared into a bar at the default camera.
export const LIVING_HULL_MARK_TEXTURE = Object.freeze({ width: 1024, height: 256 });
const GRAFFITI_WIDTH = LIVING_HULL_MARK_TEXTURE.width;
const GRAFFITI_HEIGHT = LIVING_HULL_MARK_TEXTURE.height;
const EMPTY_LINE = '';

function clampInteger(value, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.floor(number))) : 0;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function configureDecalMaterial(material) {
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  return material;
}

function createGrimeTexture() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 0x47a3b19d;
  for (let i = 0; i < size * size; i += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917) >>> 0;
    const noise = (seed ^ (seed >>> 16)) & 0xff;
    const offset = i * 4;
    pixels[offset] = 54 + (noise % 28);
    pixels[offset + 1] = 42 + (noise % 20);
    pixels[offset + 2] = 30 + (noise % 14);
    pixels[offset + 3] = noise > 96 ? Math.min(176, noise - 48) : 0;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'LivingHull_GrimeAtlas';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function createGraffitiSurface() {
  const canvas = createCanvas(GRAFFITI_WIDTH, GRAFFITI_HEIGHT);
  const context = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  let texture;
  if (canvas && context) {
    texture = new THREE.CanvasTexture(canvas);
  } else {
    texture = new THREE.DataTexture(
      new Uint8Array(GRAFFITI_WIDTH * GRAFFITI_HEIGHT * 4),
      GRAFFITI_WIDTH,
      GRAFFITI_HEIGHT,
      THREE.RGBAFormat,
    );
  }
  texture.name = 'LivingHull_GraffitiAtlas';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.markWidth = GRAFFITI_WIDTH;
  texture.userData.markHeight = GRAFFITI_HEIGHT;

  let updates = 0;
  function draw(line) {
    updates += 1;
    texture.userData.livingHullLine = line;
    if (!context) return;
    context.clearRect(0, 0, GRAFFITI_WIDTH, GRAFFITI_HEIGHT);
    if (line) {
      let size = Math.round(GRAFFITI_HEIGHT * 0.42);
      const pad = Math.round(GRAFFITI_WIDTH * 0.04);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      do {
        context.font = `800 ${size}px "Arial Narrow", "DIN Condensed", sans-serif`;
        if (context.measureText(line).width <= GRAFFITI_WIDTH - pad) break;
        size -= 2;
      } while (size > 18);
      context.save();
      context.translate(GRAFFITI_WIDTH * 0.5, GRAFFITI_HEIGHT * 0.52);
      context.rotate(-0.025);
      context.lineJoin = 'round';
      context.lineWidth = Math.max(2, Math.round(GRAFFITI_HEIGHT / 48));
      context.strokeStyle = 'rgba(28, 16, 12, 0.92)';
      context.fillStyle = 'rgba(230, 203, 151, 0.96)';
      context.strokeText(line, 0, 0);
      context.fillText(line, 0, 0);
      context.restore();
    }
    texture.needsUpdate = true;
  }

  return { texture, draw, updates: () => updates };
}

function createTallyMarkTexture() {
  const width = GRAFFITI_WIDTH;
  const height = GRAFFITI_HEIGHT;
  const data = new Uint8Array(width * height * 4);
  // ONE painted stroke per atlas — each tally instance is a single kill mark, so the stroke must
  // fill the plane's own aspect. The old atlas baked three 12px hairlines across 1024px and each
  // instance squeezed it onto a 0.03-unit plane: one mark was ~0.025 px wide at the default chase
  // camera (144 WU zoom, 50° FOV) and alphaTest dropped the mip-faded rest, so a fought hull
  // carried no visible tally at all. A stroke here covers ~72% of the atlas width, which lands
  // ~2.4 px wide on the Hitch (radius 14) at chase zoom and ~6 px at chase-close.
  let seed = 0x2f5f8a3d;
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917) >>> 0;
    return ((seed ^ (seed >>> 16)) & 0xff) / 255;
  };
  const yTop = Math.round(height * 0.12);
  const yBot = Math.round(height * 0.88);
  const rimPx = Math.max(4, Math.round(height * 0.02));
  for (let y = yTop; y <= yBot; y += 1) {
    const t = (y - yTop) / (yBot - yTop);
    const taper = 0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const half = width * 0.36 * taper;
    const cx = width * 0.5 + (rand() - 0.5) * width * 0.012;
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x += 1) {
      const edge = Math.min(x - x0, x1 - x);
      const i = (y * width + x) * 4;
      if (edge >= rimPx && rand() > 0.05) {
        data[i] = 235;
        data[i + 1] = 208;
        data[i + 2] = 158;
      } else {
        // Dark chipped rim, the graffiti's own ink — keeps the stroke readable on pale paint.
        data[i] = 46;
        data[i + 1] = 30;
        data[i + 2] = 22;
      }
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'LivingHull_TallyMarks';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.markWidth = width;
  texture.userData.markHeight = height;
  return texture;
}

function composeInstance(mesh, index, position, rotation, scale, scratch) {
  scratch.position.set(position[0], position[1], position[2]);
  scratch.rotation.set(rotation[0], rotation[1], rotation[2]);
  scratch.quaternion.setFromEuler(scratch.rotation);
  scratch.scale.set(scale[0], scale[1], scale[2]);
  scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
  mesh.setMatrixAt(index, scratch.matrix);
}

function prepareStaticInstances(mesh, transforms, scratch) {
  for (let i = 0; i < transforms.length; i += 1) {
    const row = transforms[i];
    composeInstance(mesh, i, row.position, row.rotation, row.scale, scratch);
  }
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
}

function tallyTransforms() {
  const transforms = [];
  // Chase-distance paint: one stroke ~0.42 x 1.65 WU on a radius-14 hull — a 2.4 px mark at the
  // default chase zoom, ~6 px at chase-close, instead of the sub-pixel hairlines this grid used
  // to stamp. Gates keep paint separation: the baked stroke fills ~72% of the plane's width and
  // ~76% of its length, so the PAINTED gaps are ~0.51 WU inside a gate and ~0.35 WU between gate
  // rows; full plane extents overlap between rows by ~0.04 WU — a deliberate tight cluster.
  // The field hugs the flat mid-deck (z centers 0.06/0.175/0.29, x 0.14 aft-ward) — the forward
  // outboard rows used to run past the nose taper and read as floating off the hull.
  const completeGates = Math.floor(LIVING_HULL_KILL_TALLY_MAX / 5);
  for (let i = 0; i < LIVING_HULL_KILL_TALLY_MAX; i += 1) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    transforms.push({
      position: [0.14 - col * 0.058, 0.372 + row * 0.002, 0.06 + row * 0.115],
      rotation: [-Math.PI / 2, 0, (col === 4 && row < completeGates) ? -0.55 : 0],
      scale: [0.03, 0.118, 1],
    });
  }
  return transforms;
}

const PATCH_TRANSFORMS = Object.freeze([
  { position: [-0.30, 0.335, 0.23], rotation: [0.02, -0.10, 0.08], scale: [0.25, 0.035, 0.14] },
  { position: [0.32, 0.326, -0.22], rotation: [-0.04, 0.16, -0.06], scale: [0.20, 0.030, 0.12] },
  { position: [-0.06, 0.350, -0.31], rotation: [0.03, -0.05, 0.13], scale: [0.17, 0.030, 0.10] },
  { position: [-0.48, 0.295, -0.06], rotation: [-0.02, 0.20, -0.10], scale: [0.16, 0.028, 0.11] },
]);

const SCORCH_TRANSFORMS = Object.freeze([
  { position: [-0.42, 0.372, 0.18], rotation: [-Math.PI / 2, 0, 0.12], scale: [0.13, 0.08, 1] },
  { position: [-0.56, 0.340, -0.18], rotation: [-Math.PI / 2, 0, -0.20], scale: [0.11, 0.07, 1] },
  { position: [-0.28, 0.360, -0.30], rotation: [-Math.PI / 2, 0, 0.32], scale: [0.10, 0.06, 1] },
]);

// Local +Z is bow, +X is starboard, matching LIVING_HULL_SCAR_FACINGS (index 0 dead ahead,
// then clockwise toward starboard). Marks sit on the deck the heat scorch already uses.
const SCAR_FACING_MARK = Object.freeze({
  bow: Object.freeze([0, 0.372, 0.46]),
  'starboard bow': Object.freeze([0.34, 0.36, 0.30]),
  'starboard beam': Object.freeze([0.50, 0.348, 0]),
  'starboard quarter': Object.freeze([0.34, 0.348, -0.30]),
  stern: Object.freeze([0, 0.36, -0.46]),
  'port quarter': Object.freeze([-0.34, 0.348, -0.30]),
  'port beam': Object.freeze([-0.50, 0.348, 0]),
  'port bow': Object.freeze([-0.34, 0.36, 0.30]),
});
const SCAR_BAND_SCALE = Object.freeze({ graze: 0.07, hard: 0.10, heavy: 0.13, crushing: 0.17 });

function scarLayoutKey(scars) {
  if (!Array.isArray(scars) || scars.length === 0) return '';
  const limit = Math.min(scars.length, LIVING_HULL_SCAR_MAX);
  let key = '';
  for (let i = 0; i < limit; i += 1) {
    const scar = scars[i];
    if (!scar || typeof scar !== 'object') continue;
    key += `${scar.id || ''}|${scar.facing || ''}|${scar.band || ''}|${scar.patchedAtT == null ? 0 : 1};`;
  }
  return key;
}

function scarMarkTransform(scar, index) {
  const spot = SCAR_FACING_MARK[scar && scar.facing] || SCAR_FACING_MARK.bow;
  const band = SCAR_BAND_SCALE[scar && scar.band] || SCAR_BAND_SCALE.graze;
  const scale = scar && scar.patchedAtT != null ? band * 0.62 : band;
  const slide = (index % 4) * 0.035;
  return {
    position: [spot[0] + slide, spot[1], spot[2]],
    rotation: [-Math.PI / 2, 0, index * 0.17],
    scale: [scale, scale * 0.72, 1],
  };
}

// Scar history reuses the heat-scorch instances past the three authored heat slots. A new child
// would allocate another buffer on a path that is contracted to five surfaces, and a hull with
// no scars must keep the static heat matrices (steady flight never reuploads them).
function placeScarMarks(mesh, scars, heatCount, scratch) {
  const limit = Math.min(Array.isArray(scars) ? scars.length : 0, LIVING_HULL_SCAR_MAX);
  for (let i = 0; i < limit; i += 1) {
    const mark = scarMarkTransform(scars[i], i);
    composeInstance(mesh, i, mark.position, mark.rotation, mark.scale, scratch);
  }
  const heat = Math.min(heatCount, SCORCH_TRANSFORMS.length);
  for (let h = 0; h < heat; h += 1) {
    const row = SCORCH_TRANSFORMS[h];
    composeInstance(mesh, limit + h, row.position, row.rotation, row.scale, scratch);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function restoreScorchMarks(mesh, scratch) {
  for (let i = 0; i < SCORCH_TRANSFORMS.length; i += 1) {
    const row = SCORCH_TRANSFORMS[i];
    composeInstance(mesh, i, row.position, row.rotation, row.scale, scratch);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

const GRIME_TRANSFORMS = Object.freeze([
  { position: [-0.08, 0.366, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1.18, 0.64, 1] },
  { position: [-0.08, 0.03, 0.515], rotation: [0, 0, 0], scale: [1.18, 0.38, 1] },
  { position: [-0.08, 0.03, -0.515], rotation: [0, Math.PI, 0], scale: [1.18, 0.38, 1] },
]);

function authoredSurfaceReady(root) {
  const state = root && root.userData && root.userData.authoredAssetState;
  if (!state || state === 'procedural-settled') return true;
  return state === 'authored' || state === 'authored-with-cleanup-error';
}

function enableSinglePassDecals(materials) {
  const ineligible = materials.find(({ material }) =>
    !shouldUseTransparentSinglePass(material, { decal: true }));
  if (ineligible) {
    throw new Error(
      `Living Hull single-pass decal contract violation for ${ineligible.name}: ` +
      'expected shouldUseTransparentSinglePass(material, { decal: true }) to be true.',
    );
  }
  for (const { material } of materials) material.forceSinglePass = true;
}

/**
 * Create the renderer-lifetime Living Hull presentation controller.
 * Simulation state is read-only; every GPU resource is allocated exactly once here.
 */
export function createLivingHullPresentation(options = {}) {
  const singlePassDecals = options && options.singlePassDecals === true;
  const root = new THREE.Group();
  root.name = 'LivingHull_Presentation';
  root.userData.spacefaceLivingHullPresentation = true;
  root.visible = false;

  const scratch = {
    position: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
  };
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const patchGeometry = new THREE.BoxGeometry(1, 1, 1);
  const scorchGeometry = new THREE.CircleGeometry(1, 16);
  const grimeTexture = createGrimeTexture();
  const graffitiSurface = createGraffitiSurface();

  const tallyMark = createTallyMarkTexture();
  const tallyMaterial = configureDecalMaterial(stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: 0xd8c79e,
    roughness: 0.92,
    metalness: 0,
    map: tallyMark,
    // 0.28, not 0.45: a 2-3 px mark averages ~46% alpha through the mip chain, and the old
    // 0.45 gate is what erased the surviving fragments at chase distance.
    alphaTest: tallyMark ? 0.28 : 0,
    side: THREE.DoubleSide,
  }), SHARED_MATERIAL_ROLE.HULL));
  const patchMaterial = stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: 0x806f5d,
    roughness: 0.68,
    metalness: 0.48,
  }), SHARED_MATERIAL_ROLE.HULL);
  // Repair patches are weld-metal plates on the player's hull: carry the same global illustrated
  // surface as the authored GLB fleet so repair history reads in the fleet's light language.
  installIllustratedSurface(patchMaterial);
  const scorchMaterial = configureDecalMaterial(new THREE.MeshBasicMaterial({
    color: 0x160d0a,
    transparent: true,
    opacity: 0.76,
    side: THREE.DoubleSide,
    toneMapped: false,
  }));
  const grimeMaterial = configureDecalMaterial(new THREE.MeshBasicMaterial({
    map: grimeTexture,
    color: 0x9b8870,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    toneMapped: false,
  }));
  const graffitiMaterial = configureDecalMaterial(stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    map: graffitiSurface.texture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    transparent: true,
    alphaTest: 0.06,
    side: THREE.DoubleSide,
  }), SHARED_MATERIAL_ROLE.HULL));

  if (singlePassDecals) {
    enableSinglePassDecals([
      { name: 'HeatScorch', material: scorchMaterial },
      { name: 'Grime', material: grimeMaterial },
      { name: 'Graffiti', material: graffitiMaterial },
    ]);
  }

  const tallies = new THREE.InstancedMesh(planeGeometry, tallyMaterial, LIVING_HULL_KILL_TALLY_MAX);
  tallies.name = 'LivingHull_KillTallies';
  prepareStaticInstances(tallies, tallyTransforms(), scratch);
  tallies.renderOrder = 5;
  root.add(tallies);

  const patches = new THREE.InstancedMesh(patchGeometry, patchMaterial, LIVING_HULL_REPAIR_PATCH_MAX);
  patches.name = 'LivingHull_RepairPatches';
  prepareStaticInstances(patches, PATCH_TRANSFORMS, scratch);
  patches.renderOrder = 2;
  root.add(patches);

  const scorch = new THREE.InstancedMesh(
    scorchGeometry,
    scorchMaterial,
    LIVING_HULL_HEAT_SCORCH_MAX + LIVING_HULL_SCAR_MAX,
  );
  scorch.name = 'LivingHull_HeatScorch';
  prepareStaticInstances(scorch, SCORCH_TRANSFORMS, scratch);
  scorch.renderOrder = 4;
  root.add(scorch);

  const grime = new THREE.InstancedMesh(planeGeometry, grimeMaterial, GRIME_TRANSFORMS.length);
  grime.name = 'LivingHull_Grime';
  prepareStaticInstances(grime, GRIME_TRANSFORMS, scratch);
  grime.renderOrder = 3;
  root.add(grime);

  const graffiti = new THREE.Mesh(planeGeometry, graffitiMaterial);
  graffiti.name = 'LivingHull_Graffiti';
  graffiti.position.set(-0.20, 0.382, -0.05);
  graffiti.rotation.x = -Math.PI / 2;
  graffiti.scale.set(0.58, 0.13, 1);
  graffiti.renderOrder = 6;
  graffiti.visible = false;
  graffiti.castShadow = false;
  graffiti.receiveShadow = false;
  root.add(graffiti);

  let attachedRoot = null;
  let disposed = false;
  let warming = false;
  const last = {
    tallies: -1,
    patches: -1,
    scorch: -1,
    grimeCycles: -1,
    grime: -1,
    line: null,
    radius: -1,
    ready: false,
    any: false,
    mutations: 0,
    // Scar lists are replaced, not mutated. The reference skips a string build on the
    // per-frame player sync; a new list is the only time the marks are allowed to move.
    scarRef: null,
    scarKeyNext: '',
    scarCountNext: 0,
    scarKey: '',
    scarCount: 0,
  };

  function applyVisibility() {
    root.visible = warming || (!!attachedRoot && last.ready && last.any);
  }

  function attach(nextRoot) {
    if (disposed || !nextRoot || !nextRoot.isObject3D) return false;
    if (attachedRoot === nextRoot && root.parent === nextRoot) return true;
    root.removeFromParent();
    nextRoot.add(root);
    attachedRoot = nextRoot;
    last.ready = authoredSurfaceReady(nextRoot);
    applyVisibility();
    return true;
  }

  function detach(expectedRoot = null) {
    if (expectedRoot && attachedRoot !== expectedRoot) return false;
    root.removeFromParent();
    attachedRoot = null;
    last.ready = false;
    root.visible = false;
    return true;
  }

  function sync(record, simTime = 0, entity = null) {
    if (disposed) return false;
    let changed = false;
    const tallyCount = clampInteger(record && record.killTally, LIVING_HULL_KILL_TALLY_MAX);
    const patchCount = clampInteger(record && record.repairPatches, LIVING_HULL_REPAIR_PATCH_MAX);
    const scorchCount = clampInteger(record && record.heatScorch, LIVING_HULL_HEAT_SCORCH_MAX);
    const scars = record && Array.isArray(record.scars) ? record.scars : null;
    if (scars !== last.scarRef) {
      last.scarRef = scars;
      last.scarKeyNext = scarLayoutKey(scars);
      last.scarCountNext = last.scarKeyNext ? Math.min(scars.length, LIVING_HULL_SCAR_MAX) : 0;
    }
    const scarKey = last.scarKeyNext;
    const scarCount = last.scarCountNext;
    const now = Math.max(0, finite(simTime, 0));
    const lastWashAtT = record && Number.isFinite(Number(record.lastWashAtT))
      ? Math.max(0, Number(record.lastWashAtT))
      : now;
    const grimeCycles = Math.max(0, Math.floor((now - lastWashAtT) / LIVING_HULL_CYCLE_SECONDS));
    const grimeAmount = Math.min(LIVING_HULL_GRIME_MAX, grimeCycles * LIVING_HULL_GRIME_PER_CYCLE);
    const line = record && typeof record.graffitiLine === 'string' ? record.graffitiLine : EMPTY_LINE;
    const radius = Math.max(1, finite(entity && entity.radius, 12));

    if (tallyCount !== last.tallies) {
      tallies.count = tallyCount;
      last.tallies = tallyCount;
      changed = true;
    }
    if (patchCount !== last.patches) {
      patches.count = patchCount;
      last.patches = patchCount;
      changed = true;
    }
    if (scarKey !== last.scarKey || (scarKey && scorchCount !== last.scorch)) {
      if (scarCount) placeScarMarks(scorch, record.scars, scorchCount, scratch);
      else if (last.scarCount) restoreScorchMarks(scorch, scratch);
      last.scarKey = scarKey;
      changed = true;
    }
    if (scorchCount !== last.scorch || scarCount !== last.scarCount) {
      scorch.count = scorchCount + scarCount;
      last.scorch = scorchCount;
      last.scarCount = scarCount;
      changed = true;
    }
    if (grimeCycles !== last.grimeCycles) {
      grime.count = grimeAmount > 0 ? GRIME_TRANSFORMS.length : 0;
      grimeMaterial.opacity = grimeAmount > 0 ? 0.12 + grimeAmount * 0.42 : 0;
      last.grimeCycles = grimeCycles;
      last.grime = grimeAmount;
      changed = true;
    }
    if (line !== last.line) {
      graffitiSurface.draw(line);
      graffiti.visible = !!line;
      last.line = line;
      changed = true;
    }
    if (radius !== last.radius) {
      root.scale.setScalar(radius);
      last.radius = radius;
      changed = true;
    }

    if (entity) {
      root.rotation.x = finite(entity.bank, 0);
      root.rotation.z = finite(entity.pitch, 0);
    }
    const ready = authoredSurfaceReady(attachedRoot);
    const any = tallyCount > 0 || patchCount > 0 || scorchCount > 0 || grimeAmount > 0 || !!line || scarCount > 0;
    if (ready !== last.ready || any !== last.any) {
      last.ready = ready;
      last.any = any;
      changed = true;
    }
    if (changed) last.mutations += 1;
    applyVisibility();
    return changed;
  }

  function beginGpuWarmup() {
    if (disposed || warming) return () => {};
    warming = true;
    const snapshot = {
      tallies: tallies.count,
      patches: patches.count,
      scorch: scorch.count,
      grime: grime.count,
      grimeOpacity: grimeMaterial.opacity,
      graffiti: graffiti.visible,
    };
    tallies.count = LIVING_HULL_KILL_TALLY_MAX;
    patches.count = LIVING_HULL_REPAIR_PATCH_MAX;
    scorch.count = LIVING_HULL_HEAT_SCORCH_MAX;
    grime.count = GRIME_TRANSFORMS.length;
    grimeMaterial.opacity = Math.max(0.3, grimeMaterial.opacity);
    graffiti.visible = true;
    root.visible = true;
    let restored = false;
    return () => {
      if (restored || disposed) return;
      restored = true;
      warming = false;
      tallies.count = snapshot.tallies;
      patches.count = snapshot.patches;
      scorch.count = snapshot.scorch;
      grime.count = snapshot.grime;
      grimeMaterial.opacity = snapshot.grimeOpacity;
      graffiti.visible = snapshot.graffiti;
      applyVisibility();
    };
  }

  function diagnostics() {
    return {
      attached: !!attachedRoot,
      visible: root.visible,
      warming,
      disposed,
      tallies: tallies.count,
      patches: patches.count,
      scorch: scorch.count,
      scarMarks: last.scarCount,
      grimeInstances: grime.count,
      grime: last.grime,
      graffitiVisible: graffiti.visible,
      graffitiLine: last.line || EMPTY_LINE,
      graffitiTextureUpdates: graffitiSurface.updates(),
      markWidth: (graffitiSurface.texture.image && graffitiSurface.texture.image.width) || 0,
      markHeight: (graffitiSurface.texture.image && graffitiSurface.texture.image.height) || 0,
      instanceMatrixVersions: {
        tallies: tallies.instanceMatrix.version,
        patches: patches.instanceMatrix.version,
        scorch: scorch.instanceMatrix.version,
        grime: grime.instanceMatrix.version,
      },
      mutations: last.mutations,
      resourceIds: {
        root: root.uuid,
        planeGeometry: planeGeometry.uuid,
        patchGeometry: patchGeometry.uuid,
        scorchGeometry: scorchGeometry.uuid,
        tallyMaterial: tallyMaterial.uuid,
        patchMaterial: patchMaterial.uuid,
        scorchMaterial: scorchMaterial.uuid,
        grimeMaterial: grimeMaterial.uuid,
        graffitiMaterial: graffitiMaterial.uuid,
        grimeTexture: grimeTexture.uuid,
        graffitiTexture: graffitiSurface.texture.uuid,
        tallyMark: tallyMark ? tallyMark.uuid : null,
      },
    };
  }

  function dispose() {
    if (disposed) return;
    detach();
    disposed = true;
    tallies.dispose();
    patches.dispose();
    scorch.dispose();
    grime.dispose();
    planeGeometry.dispose();
    patchGeometry.dispose();
    scorchGeometry.dispose();
    tallyMaterial.dispose();
    patchMaterial.dispose();
    scorchMaterial.dispose();
    grimeMaterial.dispose();
    graffitiMaterial.dispose();
    grimeTexture.dispose();
    graffitiSurface.texture.dispose();
    if (tallyMark) tallyMark.dispose();
    root.clear();
  }

  return { root, attach, detach, sync, beginGpuWarmup, diagnostics, dispose };
}
