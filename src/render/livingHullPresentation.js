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
import { createShipHardwarePresentation } from './shipHardwarePresentation.js';

const MARKING_WIDTH = 384;
const MARKING_HEIGHT = 96;
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

function drawMarkingSymbol(context, decalId) {
  const x = 48;
  const y = MARKING_HEIGHT * 0.5;
  context.save();
  context.translate(x, y);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = 5;
  context.strokeStyle = 'rgba(226, 205, 164, 0.96)';
  context.fillStyle = 'rgba(41, 29, 22, 0.88)';
  if (decalId === 'borrowed_time') {
    context.beginPath();
    context.moveTo(-22, -28); context.lineTo(22, -28); context.lineTo(-16, 28); context.lineTo(16, 28);
    context.closePath(); context.stroke();
    context.beginPath(); context.moveTo(-13, -17); context.lineTo(13, -17); context.lineTo(0, -2);
    context.closePath(); context.fill();
    context.beginPath(); context.moveTo(0, 2); context.lineTo(-12, 18); context.lineTo(12, 18);
    context.closePath(); context.fill();
  } else if (decalId === 'concord') {
    context.beginPath();
    context.moveTo(0, -31); context.lineTo(28, -13); context.lineTo(21, 20); context.lineTo(0, 31);
    context.lineTo(-21, 20); context.lineTo(-28, -13); context.closePath(); context.stroke();
    context.beginPath(); context.moveTo(-14, -6); context.lineTo(0, 10); context.lineTo(18, -12); context.stroke();
  } else if (decalId === 'industrial') {
    context.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = -Math.PI / 2 + i * Math.PI / 3;
      const px = Math.cos(a) * 29;
      const py = Math.sin(a) * 29;
      if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath(); context.stroke();
    context.strokeRect(-12, -13, 24, 26);
    context.beginPath(); context.moveTo(-22, 17); context.lineTo(22, -17); context.stroke();
  } else if (decalId === 'frontier') {
    context.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 === 0 ? 30 : 12;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath(); context.stroke();
    context.beginPath(); context.moveTo(-31, 20); context.lineTo(31, -20); context.stroke();
  }
  context.restore();
}

function drawWreckSilhouettes(context, count) {
  const total = clampInteger(count, LIVING_HULL_KILL_TALLY_MAX);
  context.save();
  context.fillStyle = 'rgba(226, 205, 164, 0.96)';
  context.strokeStyle = 'rgba(41, 29, 22, 0.92)';
  context.lineWidth = 2;
  context.lineJoin = 'round';
  for (let i = 0; i < total; i += 1) {
    const row = Math.floor(i / 7);
    const col = i % 7;
    const x = 105 + col * 42;
    const y = 27 + row * 42;
    context.beginPath();
    context.moveTo(x + 18, y);
    context.lineTo(x + 4, y + 5);
    context.lineTo(x - 3, y + 3);
    context.lineTo(x - 15, y + 11);
    context.lineTo(x - 11, y + 2);
    context.lineTo(x - 18, y);
    context.lineTo(x - 11, y - 2);
    context.lineTo(x - 15, y - 11);
    context.lineTo(x - 3, y - 3);
    context.lineTo(x + 4, y - 5);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(x - 10, y + 7);
    context.lineTo(x + 8, y - 6);
    context.stroke();
  }
  context.restore();
}

function createMarkingSurface() {
  const canvas = createCanvas(MARKING_WIDTH, MARKING_HEIGHT);
  const context = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  let texture;
  if (canvas && context) {
    texture = new THREE.CanvasTexture(canvas);
  } else {
    texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4, THREE.RGBAFormat);
  }
  texture.name = 'LivingHull_DockBakedMarkingAtlas';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;

  let updates = 0;
  function draw(decalId, line, wreckCount) {
    updates += 1;
    texture.userData.livingHullLine = line;
    texture.userData.shipDecalId = decalId;
    texture.userData.dockBaked = true;
    if (!context) return;
    context.clearRect(0, 0, MARKING_WIDTH, MARKING_HEIGHT);
    if (decalId && decalId !== 'none') drawMarkingSymbol(context, decalId);
    drawWreckSilhouettes(context, wreckCount);
    if (line) {
      let size = 27;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      do {
        context.font = `800 ${size}px "Arial Narrow", "DIN Condensed", sans-serif`;
        if (context.measureText(line).width <= MARKING_WIDTH - 130) break;
        size -= 1;
      } while (size > 10);
      context.save();
      context.translate(250, MARKING_HEIGHT * 0.52);
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

function createWreckSilhouetteGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.55, 0);
  shape.lineTo(0.12, 0.16);
  shape.lineTo(-0.08, 0.12);
  shape.lineTo(-0.42, 0.34);
  shape.lineTo(-0.32, 0.06);
  shape.lineTo(-0.52, 0);
  shape.lineTo(-0.32, -0.06);
  shape.lineTo(-0.42, -0.34);
  shape.lineTo(-0.08, -0.12);
  shape.lineTo(0.12, -0.16);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.name = 'LivingHull_WreckSilhouetteGeometry';
  return geometry;
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
    const row = Math.floor(i / 7);
    const col = i % 7;
    transforms.push({
      position: [0.27 - col * 0.075, 0.384 + row * 0.002, -0.01 + row * 0.084],
      rotation: [-Math.PI / 2, 0, (col === 6 && row < 2) ? -0.55 : 0],
      scale: [0.06, 0.06, 1],
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
  if (!state || state === 'procedural-settled' || state === 'designed-procedural-settled') return true;
  return state === 'authored' || state === 'authored-with-cleanup-error';
}

function suppressLegacyIdentityDecals(root) {
  if (!root || typeof root.traverse !== 'function') return 0;
  let hidden = 0;
  root.traverse((object) => {
    if (!object || object.userData?.spacefaceLivingHullPresentation) return;
    const materialName = Array.isArray(object.material)
      ? object.material.map((material) => material && material.name || '').join('|')
      : object.material && object.material.name || '';
    if (!/decal[_ -]*borrowed/i.test(`${object.name || ''}|${materialName}`)) return;
    object.visible = false;
    object.userData = { ...(object.userData || {}), spacefaceIdentityDecalSuperseded: true };
    hidden += 1;
  });
  return hidden;
}

/**
 * Create the renderer-lifetime Living Hull presentation controller.
 * Simulation state is read-only; every GPU resource is allocated exactly once here.
 */
export function createLivingHullPresentation() {
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
  const tallyGeometry = createWreckSilhouetteGeometry();
  const patchGeometry = new THREE.BoxGeometry(1, 1, 1);
  const scorchGeometry = new THREE.CircleGeometry(1, 16);
  const grimeTexture = createGrimeTexture();
  const markingSurface = createMarkingSurface();
  const fittedHardware = createShipHardwarePresentation();

  const tallyMaterial = configureDecalMaterial(new THREE.MeshBasicMaterial({
    color: 0xd8c79e,
    side: THREE.DoubleSide,
    toneMapped: false,
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
    map: markingSurface.texture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    transparent: true,
    alphaTest: 0.06,
    side: THREE.DoubleSide,
  }));

  const tallies = new THREE.InstancedMesh(tallyGeometry, tallyMaterial, LIVING_HULL_KILL_TALLY_MAX);
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

  const marking = new THREE.Mesh(planeGeometry, graffitiMaterial);
  marking.name = 'LivingHull_DockBakedMarking';
  marking.position.set(-0.20, 0.382, -0.05);
  marking.rotation.x = -Math.PI / 2;
  marking.scale.set(0.72, 0.18, 1);
  marking.renderOrder = 6;
  marking.visible = false;
  marking.castShadow = false;
  marking.receiveShadow = false;
  root.add(marking);
  root.add(fittedHardware.root);

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
    decalId: null,
    atlasTallies: -1,
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
    suppressLegacyIdentityDecals(nextRoot);
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
    const appearance = entity && entity.data && entity.data.appearance || {};
    const tallyCount = clampInteger(appearance.decalKillMarks, LIVING_HULL_KILL_TALLY_MAX);
    const patchCount = clampInteger(record && record.repairPatches, LIVING_HULL_REPAIR_PATCH_MAX);
    const scorchCount = clampInteger(record && record.heatScorch, LIVING_HULL_HEAT_SCORCH_MAX);
    const now = Math.max(0, finite(simTime, 0));
    const lastWashAtT = record && Number.isFinite(Number(record.lastWashAtT))
      ? Math.max(0, Number(record.lastWashAtT))
      : now;
    const grimeCycles = Math.max(0, Math.floor((now - lastWashAtT) / LIVING_HULL_CYCLE_SECONDS));
    const grimeAmount = Math.min(LIVING_HULL_GRIME_MAX, grimeCycles * LIVING_HULL_GRIME_PER_CYCLE);
    const line = record && typeof record.graffitiLine === 'string' ? record.graffitiLine : EMPTY_LINE;
    const decalId = typeof appearance.decalId === 'string' ? appearance.decalId : 'none';
    const radius = Math.max(1, finite(entity && entity.radius, 12));
    const hardwareChanged = fittedHardware.sync(entity && entity.data && entity.data.fittings);
    if (hardwareChanged) changed = true;

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
    if (line !== last.line || decalId !== last.decalId || tallyCount !== last.atlasTallies) {
      markingSurface.draw(decalId, line, tallyCount);
      marking.visible = !!line || decalId !== 'none' || tallyCount > 0;
      last.line = line;
      last.decalId = decalId;
      last.atlasTallies = tallyCount;
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
    const any = tallyCount > 0 || patchCount > 0 || scorchCount > 0 || grimeAmount > 0
      || !!line || decalId !== 'none' || fittedHardware.hasVisibleHardware();
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
      graffiti: marking.visible,
    };
    const restoreHardware = fittedHardware.beginGpuWarmup();
    tallies.count = LIVING_HULL_KILL_TALLY_MAX;
    patches.count = LIVING_HULL_REPAIR_PATCH_MAX;
    scorch.count = LIVING_HULL_HEAT_SCORCH_MAX;
    grime.count = GRIME_TRANSFORMS.length;
    grimeMaterial.opacity = Math.max(0.3, grimeMaterial.opacity);
    marking.visible = true;
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
      marking.visible = snapshot.graffiti;
      restoreHardware();
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
      graffitiVisible: marking.visible,
      graffitiLine: last.line || EMPTY_LINE,
      decalId: last.decalId || 'none',
      killMarkGeometry: tallyGeometry.name,
      graffitiTextureUpdates: markingSurface.updates(),
      fittedHardware: fittedHardware.diagnostics(),
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
        tallyGeometry: tallyGeometry.uuid,
        patchGeometry: patchGeometry.uuid,
        scorchGeometry: scorchGeometry.uuid,
        tallyMaterial: tallyMaterial.uuid,
        patchMaterial: patchMaterial.uuid,
        scorchMaterial: scorchMaterial.uuid,
        grimeMaterial: grimeMaterial.uuid,
        graffitiMaterial: graffitiMaterial.uuid,
        grimeTexture: grimeTexture.uuid,
        graffitiTexture: markingSurface.texture.uuid,
      },
    };
  }

  function dispose() {
    if (disposed) return;
    detach();
    disposed = true;
    planeGeometry.dispose();
    tallyGeometry.dispose();
    patchGeometry.dispose();
    scorchGeometry.dispose();
    tallyMaterial.dispose();
    patchMaterial.dispose();
    scorchMaterial.dispose();
    grimeMaterial.dispose();
    graffitiMaterial.dispose();
    grimeTexture.dispose();
    markingSurface.texture.dispose();
    fittedHardware.dispose();
    root.clear();
  }

  return { root, attach, detach, sync, beginGpuWarmup, diagnostics, dispose };
}
