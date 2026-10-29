import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHARED_MATERIAL_ROLE, stampSharedMaterialRole } from './sharedMaterialRoles.js';

// Four finite hardware silhouettes. Resources belong to the shared visual cache, so retiring one
// structure cannot dispose geometry or materials still used by the next wave's structures.
const resources = new Map();
const colors = {
  gravity_beacon: 0x68beec,
  repulsor_pylon: 0xe2ad57,
  tesla_pair: 0x8acbd1,
  kinetic_turret: 0xd8c8a2,
};

function shared(resource) {
  resource.dispose = () => {};
  return resource;
}

function material(name, color, emissiveIntensity = 0) {
  return shared(stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    name, color, metalness: 0.65, roughness: 0.43,
    emissive: color, emissiveIntensity,
  }), SHARED_MATERIAL_ROLE.HULL));
}

function plate(radius, depth) {
  const outline = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = (i + 0.5) * Math.PI / 4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (i === 0) outline.moveTo(x, z);
    else outline.lineTo(x, z);
  }
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline, {
    depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1, steps: 1,
  }).rotateX(-Math.PI / 2).translate(0, -depth / 2, 0);
}

function makeHardware(deviceId) {
  const groups = [[], [], []];
  const add = (family, geometry, x = 0, y = 0, z = 0, rotation = 0) => {
    geometry.rotateY(rotation).translate(x, y, z);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    groups[family].push(part);
    if (part !== geometry) geometry.dispose();
  };
  add(0, plate(0.58, 0.2), 0, 0.02);
  add(1, new THREE.CylinderGeometry(0.29, 0.36, 0.24, 12), 0, 0.24);
  const legCount = deviceId === 'gravity_beacon' ? 3 : 4;
  for (let i = 0; i < legCount; i++) {
    const a = i * Math.PI * 2 / legCount;
    add(0, new THREE.BoxGeometry(0.56, 0.13, 0.2), Math.cos(a) * 0.58, -0.04, Math.sin(a) * 0.58, -a);
    add(1, plate(0.15, 0.08), Math.cos(a) * 0.83, -0.11, Math.sin(a) * 0.83);
  }

  if (deviceId === 'gravity_beacon') {
    // A horizontal lens held inside a three-point induction cradle: a trap, not a route mast.
    add(2, new THREE.TorusGeometry(0.43, 0.055, 6, 24).rotateX(Math.PI / 2), 0, 0.51);
    add(1, new THREE.SphereGeometry(0.24, 12, 8).scale(1, 0.52, 1), 0, 0.43);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      add(0, new THREE.BoxGeometry(0.13, 0.36, 0.15), Math.cos(a) * 0.43, 0.36, Math.sin(a) * 0.43, -a);
    }
  } else if (deviceId === 'repulsor_pylon') {
    // Four outward-facing pressure shoes and a braced vertical coil.
    add(0, new THREE.CylinderGeometry(0.19, 0.27, 0.67, 8), 0, 0.58);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      add(1, new THREE.BoxGeometry(0.23, 0.58, 0.32), Math.cos(a) * 0.43, 0.61, Math.sin(a) * 0.43, -a);
      add(2, new THREE.BoxGeometry(0.06, 0.39, 0.23), Math.cos(a) * 0.56, 0.64, Math.sin(a) * 0.56, -a);
    }
  } else if (deviceId === 'tesla_pair') {
    // Each physical endpoint is an open fork, leaving a clear line between the paired electrodes.
    for (const side of [-1, 1]) {
      add(0, new THREE.BoxGeometry(0.14, 0.69, 0.24), 0, 0.64, side * 0.31);
      add(2, new THREE.CylinderGeometry(0.15, 0.12, 0.2, 8), 0, 1.04, side * 0.31);
    }
    add(1, new THREE.BoxGeometry(0.34, 0.16, 0.79), 0, 0.94);
  } else {
    // Counterweighted gun cradle, twin feed drums and a supported forward barrel.
    add(0, new THREE.BoxGeometry(0.7, 0.35, 0.54), -0.07, 0.55);
    add(1, new THREE.CylinderGeometry(0.095, 0.12, 0.68, 10).rotateZ(-Math.PI / 2), 0.57, 0.59);
    for (const side of [-1, 1]) {
      add(1, new THREE.CylinderGeometry(0.2, 0.2, 0.2, 10).rotateX(Math.PI / 2), -0.16, 0.56, side * 0.35);
    }
    add(2, new THREE.BoxGeometry(0.32, 0.04, 0.18), -0.17, 0.75);
  }

  const geometries = groups.map(parts => {
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    return shared(geometry);
  });
  return {
    geometries,
    materials: [
      material('FortifyArmoredCasing', 0x25323e),
      material('FortifyMachinedFittings', 0x82929b),
      material(`FortifyEmitter:${deviceId}`, colors[deviceId], 1.1),
    ],
    damaged: material('FortifyDamagedEmitter', 0xe38245, 0.7),
    offline: material('FortifyOfflineEmitter', 0x34414a, 0.05),
  };
}

export function buildSwarmFortifyVisual(entity) {
  const deviceId = entity?.data?.swarmFortify?.deviceId;
  if (!Object.hasOwn(colors, deviceId)) return null;
  let kit = resources.get(deviceId);
  if (!kit) {
    kit = makeHardware(deviceId);
    resources.set(deviceId, kit);
  }
  const root = new THREE.Group();
  root.name = `Fortify:${deviceId}`;
  for (let i = 0; i < kit.geometries.length; i++) {
    const mesh = new THREE.Mesh(kit.geometries[i], kit.materials[i]);
    mesh.name = ['FortifyCasing', 'FortifyFittings', 'FortifyEmitter'][i];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const radius = Math.max(1, Number(entity.radius) || 12);
  root.scale.setScalar(radius);
  root.userData.kind = 'beacon';
  root.userData.interactionKind = 'fortify-structure';
  root.userData.visualLanguage = `fortify-${deviceId}`;
  const emitter = root.children[2];
  root.userData.updateRuntimeState = live => {
    const record = live?.data?.swarmFortify;
    if (deviceId === 'kinetic_turret' && Number.isFinite(record?.aimHeading)) {
      const heading = record.aimHeading - (Number.isFinite(live.rot) ? live.rot : 0);
      for (const mesh of root.children) mesh.rotation.y = -heading;
    }
    const fraction = live?.hullMax > 0 ? live.hull / live.hullMax : 1;
    const unavailable = record?.offline === true || record?.operational === false
      || (deviceId === 'kinetic_turret' && record?.ammo === 0);
    emitter.material = live?.alive === false || fraction <= 0 || unavailable
      ? kit.offline : fraction <= 0.35 || record?.heat >= 80 ? kit.damaged : kit.materials[2];
  };
  root.userData.updateRuntimeState(entity);
  return root;
}
