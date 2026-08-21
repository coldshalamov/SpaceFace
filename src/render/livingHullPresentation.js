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
} from '../core/livingHull.js';
import { shouldUseTransparentSinglePass } from './transparentSinglePassPolicy.js';

const GRAFFITI_WIDTH = 256;
const GRAFFITI_HEIGHT = 64;
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
    texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4, THREE.RGBAFormat);
  }
  texture.name = 'LivingHull_GraffitiAtlas';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;

  let updates = 0;
  function draw(line) {
    updates += 1;
    texture.userData.livingHullLine = line;
    if (!context) return;
    context.clearRect(0, 0, GRAFFITI_WIDTH, GRAFFITI_HEIGHT);
    if (line) {
      let size = 24;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      do {
        context.font = `800 ${size}px "Arial Narrow", "DIN Condensed", sans-serif`;
        if (context.measureText(line).width <= GRAFFITI_WIDTH - 20) break;
        size -= 1;
      } while (size > 10);
      context.save();
      context.translate(GRAFFITI_WIDTH * 0.5, GRAFFITI_HEIGHT * 0.52);
      context.rotate(-0.025);
      context.lineJoin = 'round';
      context.lineWidth = 4;
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
  for (let i = 0; i < LIVING_HULL_KILL_TALLY_MAX; i += 1) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    transforms.push({
      position: [0.18 - col * 0.045, 0.372 + row * 0.002, 0.13 + row * 0.075],
      rotation: [-Math.PI / 2, 0, (col === 4 && row < 2) ? -0.55 : 0],
      scale: [0.018, 0.11, 1],
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

  const tallyMaterial = configureDecalMaterial(new THREE.MeshStandardMaterial({
    color: 0xd8c79e,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  }));
  const patchMaterial = new THREE.MeshStandardMaterial({
    color: 0x806f5d,
    roughness: 0.68,
    metalness: 0.48,
  });
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
  const graffitiMaterial = configureDecalMaterial(new THREE.MeshStandardMaterial({
    map: graffitiSurface.texture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    transparent: true,
    alphaTest: 0.06,
    side: THREE.DoubleSide,
  }));

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

  const scorch = new THREE.InstancedMesh(scorchGeometry, scorchMaterial, LIVING_HULL_HEAT_SCORCH_MAX);
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
    if (scorchCount !== last.scorch) {
      scorch.count = scorchCount;
      last.scorch = scorchCount;
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
    const any = tallyCount > 0 || patchCount > 0 || scorchCount > 0 || grimeAmount > 0 || !!line;
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
      grimeInstances: grime.count,
      grime: last.grime,
      graffitiVisible: graffiti.visible,
      graffitiLine: last.line || EMPTY_LINE,
      graffitiTextureUpdates: graffitiSurface.updates(),
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
      },
    };
  }

  function dispose() {
    if (disposed) return;
    detach();
    disposed = true;
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
    root.clear();
  }

  return { root, attach, detach, sync, beginGpuWarmup, diagnostics, dispose };
}
