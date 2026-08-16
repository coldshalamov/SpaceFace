// Persistent physical hull-damage dressing (AC-18).
//
// One fixed group of eight small meshes is allocated at ship construction and reused for every
// band. Geometries are shared and immutable; materials are per-ship so heat/reach can move without
// leaking across hulls. The update path writes transforms and emissive intensity only — no
// allocations, no sprites, no camera-facing cards, no per-frame children.
import * as THREE from 'three';

export const DRESSING_ROLES = Object.freeze([
  'scorch',
  'hotContact',
  'breach',
  'wake0',
  'wake1',
  'wake2',
  'vent',
  'beacon',
]);

const HOT_CONTACT_PERIOD = 2.4;
const HOT_CONTACT_ON = 0.45;

let sharedGeometries = null;

function noDispose(obj) {
  obj.dispose = () => {};
  return obj;
}

function makeTube(points, radius, tubular = 6, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points);
  return noDispose(new THREE.TubeGeometry(curve, tubular, radius, radial, false));
}

function makeScorchGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.92, -0.28);
  shape.lineTo(-0.38, -0.72);
  shape.lineTo(0.22, -0.64);
  shape.lineTo(0.86, -0.18);
  shape.lineTo(0.70, 0.34);
  shape.lineTo(0.12, 0.68);
  shape.lineTo(-0.48, 0.52);
  shape.lineTo(-0.96, 0.08);
  shape.closePath();
  return noDispose(new THREE.ExtrudeGeometry(shape, {
    depth: 0.045,
    bevelEnabled: false,
    curveSegments: 1,
  }));
}

function makeShardGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0.00, 0.20, 0.00,
    0.13, -0.07, 0.08,
    -0.11, -0.05, 0.09,
    0.03, -0.06, -0.13,
  ]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]);
  geometry.computeVertexNormals();
  return noDispose(geometry);
}

function getSharedGeometries() {
  if (sharedGeometries) return sharedGeometries;
  sharedGeometries = {
    scorch: makeScorchGeometry(),
    hotContact: makeShardGeometry(),
    breach: makeTube([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.18, 0.05, 0.22),
      new THREE.Vector3(0.08, 0.10, 0.62),
    ], 0.055, 6, 5),
    wake: makeTube([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.42, 0.04, 0.05),
      new THREE.Vector3(-0.95, 0.02, 0.02),
    ], 0.032, 5, 5),
    vent: makeTube([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.06, 0.28, 0.10),
      new THREE.Vector3(0.02, 0.78, 0.18),
    ], 0.028, 6, 5),
    beacon: noDispose(new THREE.CylinderGeometry(0.10, 0.14, 0.34, 6)),
  };
  return sharedGeometries;
}

function makeMaterials() {
  return {
    scorch: new THREE.MeshStandardMaterial({
      color: 0x1a1412,
      roughness: 0.94,
      metalness: 0.12,
      emissive: 0x000000,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    hotContact: new THREE.MeshStandardMaterial({
      color: 0x3a2214,
      roughness: 0.38,
      metalness: 0.55,
      emissive: 0xff6a22,
      emissiveIntensity: 1.6,
    }),
    breach: new THREE.MeshStandardMaterial({
      color: 0x4a2814,
      roughness: 0.32,
      metalness: 0.20,
      emissive: 0xff7a28,
      emissiveIntensity: 1.85,
    }),
    wake: new THREE.MeshStandardMaterial({
      color: 0x8a9aaa,
      roughness: 0.55,
      metalness: 0.08,
      emissive: 0x6a8498,
      emissiveIntensity: 0.55,
    }),
    vent: new THREE.MeshStandardMaterial({
      color: 0xc8d4dc,
      roughness: 0.42,
      metalness: 0.05,
      emissive: 0xd8e6ee,
      emissiveIntensity: 0.95,
    }),
    beacon: new THREE.MeshStandardMaterial({
      color: 0x4a2a16,
      roughness: 0.40,
      metalness: 0.35,
      emissive: 0xff8a2a,
      emissiveIntensity: 1.15,
    }),
  };
}

function measureHull(hullGroup) {
  const sizeX = 12;
  const sizeY = 3;
  const sizeZ = 6;
  if (!hullGroup) return { cx: 0, cy: 0, cz: 0, sx: sizeX, sy: sizeY, sz: sizeZ };
  if (typeof hullGroup.updateMatrixWorld === 'function') hullGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(hullGroup);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  if (typeof hullGroup.worldToLocal === 'function') {
    hullGroup.worldToLocal(center);
  }
  return {
    cx: Number.isFinite(center.x) ? center.x : 0,
    cy: Number.isFinite(center.y) ? center.y : 0,
    cz: Number.isFinite(center.z) ? center.z : 0,
    sx: Number.isFinite(size.x) && size.x > 0.05 ? size.x : sizeX,
    sy: Number.isFinite(size.y) && size.y > 0.05 ? size.y : sizeY,
    sz: Number.isFinite(size.z) && size.z > 0.05 ? size.z : sizeZ,
  };
}

function addSegment(group, role, geometry, material, position, rotation, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `DamageDressing_${role}`;
  mesh.userData.damageDressingRole = role;
  mesh.userData.keepSeparate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.userData.baseScaleX = scale[0];
  mesh.userData.baseScaleY = scale[1];
  mesh.userData.baseScaleZ = scale[2];
  group.add(mesh);
  return mesh;
}

function wrap01(now, period) {
  if (!Number.isFinite(now) || period <= 0) return 0;
  const t = now % period;
  return t < 0 ? t + period : t;
}

function placeDressing(group, geos, mats, hull) {
  const unit = Math.max(0.32, Math.min(hull.sx, hull.sz) * 0.09);
  const siteX = hull.cx - hull.sx * 0.10;
  const siteY = hull.cy + hull.sy * 0.10;
  const siteZ = hull.cz + hull.sz * 0.36;

  const scorch = addSegment(group, 'scorch', geos.scorch, mats.scorch,
    [siteX, siteY, siteZ],
    [-Math.PI * 0.5, 0.18, 0.35],
    [unit * 1.15, unit * 1.15, unit * 1.15]);
  const hotContact = addSegment(group, 'hotContact', geos.hotContact, mats.hotContact,
    [siteX + unit * 0.22, siteY + unit * 0.12, siteZ + unit * 0.18],
    [0.4, 0.8, -0.2],
    [unit * 0.55, unit * 0.55, unit * 0.55]);
  const breach = addSegment(group, 'breach', geos.breach, mats.breach,
    [siteX, siteY, siteZ],
    [0, 0.15, 0.08],
    [unit * 1.05, unit * 0.38, unit * 1.05]);
  const wake0 = addSegment(group, 'wake0', geos.wake, mats.wake,
    [siteX - unit * 0.15, siteY + unit * 0.04, siteZ - unit * 0.05],
    [0, 0.05, 0.04],
    [unit * 1.05, unit * 0.42, unit * 0.95]);
  const wake1 = addSegment(group, 'wake1', geos.wake, mats.wake,
    [siteX - unit * 0.85, siteY + unit * 0.10, siteZ + unit * 0.08],
    [0.05, -0.08, 0.06],
    [unit * 0.95, unit * 0.38, unit * 0.88]);
  const wake2 = addSegment(group, 'wake2', geos.wake, mats.wake,
    [siteX - unit * 1.55, siteY + unit * 0.02, siteZ - unit * 0.12],
    [-0.04, 0.10, -0.05],
    [unit * 0.88, unit * 0.34, unit * 0.80]);
  const vent = addSegment(group, 'vent', geos.vent, mats.vent,
    [siteX + unit * 0.10, siteY + unit * 0.16, siteZ - unit * 0.06],
    [0.08, -0.12, 0.05],
    [unit * 0.85, unit * 1.05, unit * 0.85]);
  const beacon = addSegment(group, 'beacon', geos.beacon, mats.beacon,
    [hull.cx - hull.sx * 0.04, hull.cy + hull.sy * 0.48, hull.cz],
    [0, 0, 0],
    [unit * 0.55, unit * 0.55, unit * 0.55]);

  return { scorch, hotContact, breach, wake0, wake1, wake2, vent, beacon };
}

function setScaled(mesh, xMul, yMul, zMul) {
  mesh.scale.set(
    mesh.userData.baseScaleX * xMul,
    mesh.userData.baseScaleY * yMul,
    mesh.userData.baseScaleZ * zMul,
  );
}

/**
 * Allocate the fixed dressing group on the hull and return a per-frame updater.
 * The group is parented to the hull so it follows bank, LOD, and authored scale.
 */
export function attachDamageDressing(root, hullGroup) {
  if (root.userData.damageDressing && root.userData.damageDressing.group) {
    return root.userData.damageDressing;
  }

  const geos = getSharedGeometries();
  const mats = makeMaterials();
  const group = new THREE.Group();
  group.name = 'DamageDressing';
  group.userData.damageDressing = true;

  const host = hullGroup || root;
  host.add(group);

  const byRole = placeDressing(group, geos, mats, measureHull(host));
  const meshes = DRESSING_ROLES.map((role) => byRole[role]);

  function update(stateId, _presentFrac, now) {
    const t = Number.isFinite(now) ? now : 0;
    const stressed = stateId === 'stressed';
    const damaged = stateId === 'damaged';
    const critical = stateId === 'critical';
    const disabled = stateId === 'disabled';
    const liveHull = stressed || damaged || critical;
    const sparkOn = liveHull && wrap01(t, HOT_CONTACT_PERIOD) < HOT_CONTACT_ON;

    byRole.scorch.visible = liveHull;
    byRole.hotContact.visible = sparkOn;
    byRole.breach.visible = damaged || critical;
    byRole.wake0.visible = damaged || critical;
    byRole.wake1.visible = critical;
    byRole.wake2.visible = critical;
    byRole.vent.visible = critical;
    byRole.beacon.visible = disabled;

    if (sparkOn) {
      const jab = 0.88 + 0.14 * Math.sin(t * 2.3);
      setScaled(byRole.hotContact, jab, jab, jab);
    }
    if (damaged || critical) {
      const tongue = 0.90 + 0.10 * Math.sin(t * 1.9);
      setScaled(byRole.breach, tongue, 1, 1);
      const stream = 0.92 + 0.08 * Math.sin(t * 1.5);
      setScaled(byRole.wake0, stream, 1, 0.96 + 0.04 * Math.sin(t * 1.3));
    }
    if (critical) {
      setScaled(byRole.wake1, 0.90 + 0.10 * Math.sin(t * 1.5 + 0.9), 1, 1);
      setScaled(byRole.wake2, 0.88 + 0.12 * Math.sin(t * 1.5 + 1.7), 1, 1);
      setScaled(byRole.vent, 1, 0.88 + 0.14 * Math.sin(t * 1.35), 1);
    }
    if (disabled) {
      mats.beacon.emissiveIntensity = 0.85 + 0.40 * (0.5 + 0.5 * Math.sin(t * 1.6));
    }
  }

  const dressing = { group, meshes, byRole, update, materials: mats };
  root.userData.damageDressing = dressing;
  return dressing;
}
