// HOOK-LEFT. The suit has a cold face and no features. The fin's root is the only cherry.
// A local box-chain, never a joint to the buoy. No plate font, no canvas, no blood.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RUUD as C } from '../../data/ruud.js';

const FOUND = 0x8c5a28, HEAT = 0xff7a32, VERD = 0x3e6b58, SLATE = 0x2a3138, RUBBER = 0x343d46, FROST = 0xc5e4ea;

function materials() {
  const paint = (color, metal = 0.35, rough = 0.46) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
  const mats = {
    foundry: paint(FOUND, 0.72, 0.38),
    slate: paint(SLATE, 0.48, 0.52),
    verd: paint(VERD, 0.28, 0.58),
    rubber: paint(RUBBER, 0.04, 0.86),
    frost: new THREE.MeshStandardMaterial({ color: FROST, metalness: 0.08, roughness: 0.28, emissive: FROST, emissiveIntensity: 0.18 }),
    heat: new THREE.MeshStandardMaterial({ color: 0x3a2418, metalness: 0.4, roughness: 0.42, emissive: HEAT, emissiveIntensity: 1.15 }),
  };
  for (const [name, m] of Object.entries(mats)) m.name = `RUUD_${name}`;
  return mats;
}
function add(parent, geo, mat, name) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function plate(outline, depth = 0.28, bevel = 0.08) {
  const s = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z));
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth, steps: 1, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6,
  }).rotateX(-Math.PI / 2);
}
function bake(group) {
  const buckets = new Map(), original = new Set();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geo.applyMatrix4(child.matrix);
    geo.clearGroups();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const bucket = buckets.get(child.material) || [];
    bucket.push(geo);
    buckets.set(child.material, bucket);
    original.add(child.geometry);
    group.remove(child);
  }
  for (const [mat, pieces] of buckets) {
    const combined = mergeGeometries(pieces, false);
    if (!combined) throw new Error('HOOK-LEFT geometry schema mismatch');
    add(group, combined, mat, `${group.name}:${mat.name}`);
    pieces.forEach(g => g.dispose());
  }
  original.forEach(g => g.dispose());
}
function stamp(root, entity, motion) {
  root.userData.kind = 'drone';
  root.userData.ruud = true;
  root.userData.animated = true;
  root.userData.visualLanguage = 'ruud-hook-left';
  root.userData.updateAuthoredMotion = motion;
  root.userData.authoredAssetState = 'authored';
  root.userData.authoredVisualRoot = 'authored-root';
  motion(entity, 0, {});
  return root;
}
function poseOf(e) {
  return e?.data?.ruudPose || {};
}

export function buildRuudVisual(entity) {
  const part = entity?.data?.ruudPart;
  if (part === 'suit') return buildSuit(entity);
  if (part === 'buoy') return buildBuoy(entity);
  if (part === 'bladder') return buildBladder(entity);
  return buildFin(entity);
}

function buildFin(entity) {
  const root = new THREE.Group();
  root.name = 'RUUD_FIN3';
  const m = materials();
  const shell = new THREE.Group();
  shell.name = 'radiator_fin';
  root.add(shell);
  add(shell, plate([[-9, -0.35], [-8.2, -2.4], [1.2, -2.1], [2.4, -0.4], [2.4, 0.4], [1.2, 2.1], [-8.2, 2.4], [-9, 0.35]], 0.42, 0.12), m.slate, 'fin_blade').position.y = 0.2;
  add(shell, plate([[-9.4, -0.2], [-7.6, -0.55], [-7.6, 0.55], [-9.4, 0.2]], 0.2, 0.04), m.frost, 'cold_tip').position.y = 0.72;
  add(shell, new THREE.CylinderGeometry(1.15, 1.35, 1.6, 16), m.foundry, 'root_collar').position.set(3.1, 0.7, 0);
  add(shell, new THREE.TorusGeometry(0.72, 0.16, 8, 18), m.verd, 'hose_gland').position.set(2.15, 0.85, 0);
  for (const z of [-1.35, 1.35]) add(shell, new THREE.BoxGeometry(0.28, 0.22, 0.55), m.foundry, 'blade_bolt').position.set(-2.2, 0.7, z);
  bake(shell);
  const rootGlow = add(root, new THREE.CylinderGeometry(0.72, 0.86, 0.7, 16), m.heat, 'cherry_root');
  rootGlow.position.set(3.15, 0.7, 0);
  const hatch = new THREE.Group();
  hatch.name = 'ANIM_hatch';
  hatch.position.set(-1.4, 0.85, 0);
  root.add(hatch);
  add(hatch, new THREE.BoxGeometry(2.4, 0.16, 1.7), m.foundry, 'bolted_sign');
  add(hatch, new THREE.CylinderGeometry(0.12, 0.12, 0.34, 8), m.slate, 'through_bolt').position.set(0.7, 0.12, 0.45);
  const pawl = add(root, new THREE.BoxGeometry(0.55, 0.12, 0.18), m.foundry, 'ANIM_pawl');
  pawl.position.set(1.2, 1.15, 0.9);
  return stamp(root, entity, (e, time, a11y = {}) => {
    const p = poseOf(e);
    const t = Number.isFinite(p.simTime) ? p.simTime : (Number.isFinite(time) ? time : 0);
    const reduced = !!a11y.reducedMotion;
    hatch.rotation.z = p.hatch ? -1.15 : 0;
    pawl.rotation.z = reduced || !p.chain ? 0 : Math.sin(t * (Math.PI * 2) / C.tickEvery) > 0.92 ? -0.55 : 0;
    m.heat.emissiveIntensity = reduced ? 1.05 : 1.02 + Math.sin(t * 2.2) * 0.08;
    m.heat.emissive.setHex(HEAT);
  });
}

function buildSuit(entity) {
  const root = new THREE.Group();
  root.name = 'RUUD_SUIT';
  const m = materials();
  const body = new THREE.Group();
  body.name = 'work_suit';
  // The powered work-suit fills its physical envelope; at flight scale its shoulder/arm
  // silhouette must read separately from the umbilical and the small frosted face plate.
  body.scale.setScalar(2);
  root.add(body);
  const shell = new THREE.Group();
  shell.name = 'suit_shell';
  body.add(shell);
  add(shell, new THREE.CapsuleGeometry(0.72, 1.15, 4, 10), m.rubber, 'torso');
  add(shell, new THREE.SphereGeometry(0.46, 14, 10), m.rubber, 'blank_collar').position.y = 1.15;
  add(shell, new THREE.CylinderGeometry(0.5, 0.42, 0.16, 14), m.foundry, 'neck_ring').position.y = 0.95;
  add(shell, new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), m.frost, 'cold_face').position.set(0.42, 1.22, 0);
  add(shell, new THREE.TorusGeometry(0.34, 0.07, 6, 14), m.foundry, 'massline_ring').position.set(0, 0.15, 0.55);
  for (const y of [-0.2, 0.35]) add(shell, new THREE.TorusGeometry(0.55, 0.06, 6, 12), m.verd, 'seal').position.y = y;
  add(shell, new THREE.CapsuleGeometry(0.22, 0.7, 3, 8), m.rubber, 'leg').position.set(-0.28, -1.15, 0);
  add(shell, new THREE.CapsuleGeometry(0.22, 0.7, 3, 8), m.rubber, 'leg').position.set(0.28, -1.15, 0);
  bake(shell);
  const arms = new THREE.Group();
  arms.name = 'ANIM_arms';
  arms.position.y = 0.45;
  body.add(arms);
  for (const side of [-1, 1]) {
    const arm = add(arms, new THREE.CapsuleGeometry(0.16, 0.85, 3, 8), m.rubber, 'sleeve');
    arm.position.set(side * 0.78, -0.15, 0);
    arm.rotation.z = side * 0.15;
  }
  const chain = new THREE.Group();
  chain.name = 'ANIM_chain';
  root.add(chain);
  const links = [];
  for (let i = 0; i < 16; i++) {
    const link = add(chain, new THREE.BoxGeometry(1, 0.16, 0.22), i % 2 ? m.foundry : m.slate, 'box_link');
    links.push(link);
  }
  return stamp(root, entity, (e, time, a11y = {}) => {
    const p = poseOf(e);
    const t = Number.isFinite(p.simTime) ? p.simTime : (Number.isFinite(time) ? time : 0);
    const reduced = !!a11y.reducedMotion;
    const clipped = p.clipped ? 1 : 0;
    chain.visible = p.chain === 1;
    const end = p.umbilical || { x: -C.hang, z: 0 };
    const length = Math.hypot(end.x, end.z);
    const yaw = -Math.atan2(end.z, end.x);
    for (let i = 0; i < links.length; i++) {
      const t = (i + 0.5) / links.length;
      links[i].position.set(end.x * t, -0.2 - Math.sin(t * Math.PI) * 0.6, end.z * t);
      links[i].rotation.y = yaw;
      links[i].scale.x = length / links.length * 0.94;
    }
    arms.rotation.x = clipped ? 1.15 : (reduced ? 0.2 : 0.2 + Math.sin(t * 0.7) * 0.06);
    body.position.y = clipped || reduced ? 0 : Math.sin(t * 1.3) * 0.04;
  });
}

function buildBuoy(entity) {
  const root = new THREE.Group();
  root.name = 'RUUD_BUOY';
  const m = materials();
  const shell = new THREE.Group();
  shell.name = 'lane_buoy';
  root.add(shell);
  add(shell, new THREE.CylinderGeometry(1.55, 1.85, 2.4, 18), m.slate, 'buoy_can').position.y = 0.3;
  add(shell, new THREE.TorusGeometry(1.7, 0.28, 8, 20), m.foundry, 'fender').rotateX(Math.PI / 2).position.y = 0.9;
  add(shell, new THREE.CylinderGeometry(0.35, 0.5, 1.4, 10), m.verd, 'lamp_neck').position.y = 2.05;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    add(shell, new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6), m.foundry, 'buoy_bolt').position.set(Math.cos(a) * 1.2, 1.55, Math.sin(a) * 1.2);
  }
  bake(shell);
  const plateGroup = new THREE.Group();
  plateGroup.name = 'ANIM_berth_plate';
  plateGroup.position.y = 2.85;
  root.add(plateGroup);
  const barL = add(plateGroup, new THREE.BoxGeometry(0.95, 0.1, 0.16), m.frost, 'bar_left');
  const barR = add(plateGroup, new THREE.BoxGeometry(0.95, 0.1, 0.16), m.frost, 'bar_right');
  return stamp(root, entity, (e, time, a11y = {}) => {
    const p = poseOf(e);
    const open = p.plateOpen ? 1 : 0;
    const reduced = !!a11y.reducedMotion;
    if (open) {
      barL.position.set(-0.22, 0, 0); barR.position.set(0.22, 0, 0);
      barL.rotation.z = 0.55; barR.rotation.z = -0.55;
    } else {
      barL.position.set(-0.15, 0.22, 0); barR.position.set(0.15, -0.22, 0);
      barL.rotation.z = 0; barR.rotation.z = 0;
    }
    plateGroup.rotation.y = reduced ? 0 : (open ? 0 : (Number(poseOf(e).simTime) || time || 0) * 0.15);
  });
}

function buildBladder(entity) {
  const root = new THREE.Group();
  root.name = 'RUUD_BLADDER';
  const m = materials();
  const shell = new THREE.Group();
  shell.name = 'backup_bladder';
  root.add(shell);
  add(shell, new THREE.SphereGeometry(0.72, 16, 12), m.rubber, 'bladder_a').position.set(0, 0, 0);
  add(shell, new THREE.SphereGeometry(0.55, 14, 10), m.rubber, 'bladder_b').position.set(0.7, 0.15, 0.1);
  add(shell, new THREE.SphereGeometry(0.42, 12, 8), m.rubber, 'bladder_c').position.set(-0.45, 0.2, -0.15);
  add(shell, new THREE.CylinderGeometry(0.12, 0.16, 0.38, 8), m.verd, 'valve').position.set(0.15, 0.7, 0);
  add(shell, new THREE.TorusGeometry(0.2, 0.05, 6, 10), m.frost, 'frost_bead').position.y = 0.35;
  bake(shell);
  return stamp(root, entity, (e, time, a11y = {}) => {
    const p = poseOf(e);
    const t = Number.isFinite(p.simTime) ? p.simTime : (Number.isFinite(time) ? time : 0);
    root.rotation.z = a11y.reducedMotion ? 0 : Math.sin(t * 0.8) * 0.04;
  });
}

export function disposeRuudVisual(root) {
  if (!root || root.userData.ruudDisposed) return;
  root.userData.ruudDisposed = true;
  const geometries = new Set(), mats = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mats.add(mat);
  });
  geometries.forEach(g => g.dispose());
  mats.forEach(mat => mat.dispose());
  root.removeFromParent();
}
