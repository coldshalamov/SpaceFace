// Astra-authored membrane, organ and connective rootlet forms. The fauna
// builder owns their shared cache and each cyst's materials and motion.
import * as THREE from 'three';

function smoothCoincidentNormals(geometry) {
  geometry.computeVertexNormals();
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < positions.count; i += 1) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
      .map(value => Math.round(value * 1e6)).join(',');
    let group = groups.get(key);
    if (!group) groups.set(key, group = { ids: [], sum: new THREE.Vector3() });
    group.ids.push(i);
    group.sum.add(new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i)));
  }
  for (const { ids, sum } of groups.values()) {
    sum.normalize();
    for (const i of ids) normals.setXYZ(i, sum.x, sum.y, sum.z);
  }
  normals.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function fitBounds(geometry, target) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const from = box.getSize(new THREE.Vector3()), to = target.getSize(new THREE.Vector3());
  const fromCenter = box.getCenter(new THREE.Vector3()), toCenter = target.getCenter(new THREE.Vector3());
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setXYZ(i,
      (positions.getX(i) - fromCenter.x) * to.x / from.x + toCenter.x,
      (positions.getY(i) - fromCenter.y) * to.y / from.y + toCenter.y,
      (positions.getZ(i) - fromCenter.z) * to.z / from.z + toCenter.z);
  }
}

export function createLanternSacGeometry() {
  const geometry = new THREE.SphereGeometry(1, 18, 10);
  geometry.scale(1, 1.25, 1);
  geometry.computeBoundingBox();
  const target = new THREE.Box3(
    new THREE.Vector3(-1, -1.25, -0.9749279022216797),
    new THREE.Vector3(1, 1.25, 0.9749279022216797),
  );
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i), y = positions.getY(i) / 1.25, z = positions.getZ(i);
    const theta = Math.acos(Math.max(-1, Math.min(1, y))), phi = Math.atan2(z, x);
    const belt = Math.sin(theta) ** 2;
    // Two unequal membrane lobes, a broad inward fold and an uneven waist.
    const foldAngle = 0.55 + 0.35 * Math.sin(theta);
    const foldDelta = Math.atan2(Math.sin(phi - foldAngle), Math.cos(phi - foldAngle));
    const inwardFold = 0.20 * Math.exp(-((foldDelta / 0.6) ** 2)) * Math.sin(theta);
    const radius = 1 + belt * (0.10 * Math.cos(2 * phi + 0.3 * theta)
      + 0.09 * Math.sin(3.8 * theta + 0.65 * Math.sin(phi)) - inwardFold);
    positions.setXYZ(i, x * radius + 0.055 * belt * Math.sin(theta + phi),
      y * 1.25 + 0.07 * belt * Math.cos(2 * phi + 0.6 * theta), z * radius);
  }
  fitBounds(geometry, target);
  geometry.name = 'Astra_Lantern_LayeredSac_v3';
  return smoothCoincidentNormals(geometry);
}

export function createLanternCoreGeometry() {
  const geometry = new THREE.SphereGeometry(0.42, 10, 8);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i) / 0.42;
    const theta = Math.acos(Math.max(-1, Math.min(1, y)));
    const x = positions.getX(i), z = positions.getZ(i);
    // Some Three.js versions round the south-pole ring to exact zero. Retain
    // its authored longitude there so the tiny closing faces do not collapse.
    const phi = y < 0 && x === 0 && z === 0
      ? (i % 11) / 10 * Math.PI * 2
      : Math.atan2(z, -x);
    // A short, thick organ sits toward the membrane fold.
    const radial = Math.sin(theta) * (0.24 + 0.035 * Math.cos(theta))
      * (1 - 0.14 * Math.exp(-(((theta - 1.4) / 0.5) ** 2)));
    const bend = 0.115 * (2 * y * y - 1);
    const organX = bend - radial * Math.cos(phi);
    const organZ = 0.46 * y + 0.025 * Math.sin(theta) ** 2 * Math.cos(phi);
    positions.setXYZ(i, 0.08 + organX * Math.cos(0.3) + organZ * Math.sin(0.3),
      0.08 + 0.065 * y - radial * 0.9 * Math.sin(phi),
      -0.04 - organX * Math.sin(0.3) + organZ * Math.cos(0.3));
  }
  geometry.name = 'Astra_Lantern_InnerOrgan_v3';
  return smoothCoincidentNormals(geometry);
}

export function createLanternRootletGeometry() {
  const geometry = new THREE.CylinderGeometry(0.09, 0.035, 4.35, 5, 3);
  geometry.translate(0, 0.725, 0);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i), t = (y + 1.45) / 4.35;
    const oldRadius = 0.035 + (0.09 - 0.035) * t;
    const radius = 0.035 + 0.055 * t + 0.095 * Math.sin(Math.PI * t);
    const scale = radius / oldRadius;
    positions.setXYZ(i, positions.getX(i) * scale + 0.14 * Math.sin(Math.PI * t), y,
      positions.getZ(i) * scale + 0.1 * Math.sin(1.5 * Math.PI * t));
  }
  geometry.name = 'Astra_Lantern_ConnectiveRootlet_v4';
  return smoothCoincidentNormals(geometry);
}
