// Lantern Ward's authored civic machinery. Procedural source is intentional:
// these are the production bodies, not placeholders for a missing GLB. The
// canonical visual factory mounts them; its lifecycle owns their GPU resources.
// No light, particle loop, inventory, physics or simulation clock lives here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LANTERN_WARD_ID, LANTERN_WARD_ASSET_VERSION, LANTERN_WARD_BODY_CONTRACTS,
} from '../data/lanternWardLayout.js';
import { installIllustratedSurface } from './illustratedSurface.js';
import { stampSharedMaterialRole, SHARED_MATERIAL_ROLE } from './sharedMaterialRoles.js';
import { freezeStaticChildMatrices } from './staticChildMatrices.js';

const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const PHASES = new Set(['waiting', 'approach', 'brace', 'connect', 'finish', 'retreat', 'damaged']);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function isLanternWardBody(entity) {
  const d = entity?.data;
  return !!entity && entity.alive !== false && d?.lanternWardId === LANTERN_WARD_ID
    && Object.hasOwn(LANTERN_WARD_BODY_CONTRACTS, d.lanternWardRole)
    && typeof d.worldRecordId === 'string' && d.worldRecordId.length > 0;
}

/** All articulation derives from committed work progress; a frozen job freezes its pose. */
export function lanternWardVisualPose(data, out = {}) {
  const phase = PHASES.has(data?.lanternWardPhase) ? data.lanternWardPhase : 'waiting';
  const progress = smooth(clamp(data?.lanternWardProgress01));
  out.phase = phase;
  out.progress = progress;
  out.damage = clamp(data?.lanternWardDamage01);
  out.lit = data?.lanternWardLit === true && out.damage < 0.65;
  out.worker = data?.lanternWardWorkerPresent === true && phase !== 'damaged';
  out.clamp = clamp(data?.lanternWardClamp01);
  out.arm = phase === 'approach' ? progress * 0.4
    : phase === 'brace' ? 0.4 + progress * 0.6
      : phase === 'connect' || phase === 'finish' ? 1
        : phase === 'retreat' ? 1 - progress : 0;
  out.contact = phase === 'connect' || phase === 'finish';
  out.shutter = data?.lanternWardRepaired === true ? 1 : 0;
  return out;
}

function material(name, color, roughness, metalness, emission = 0) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness,
    emissive: emission ? color : 0x000000, emissiveIntensity: emission });
  m.name = `LanternWard_${name}`;
  m.userData.spacefaceFinish = 'forge-v1';
  m.userData.spacefaceMaterialRole = emission ? 'signal' : name === 'machinery' ? 'mechanical' : 'hull';
  stampSharedMaterialRole(m, SHARED_MATERIAL_ROLE.STATION);
  installIllustratedSurface(m);
  return m;
}

// Private materials prevent one damaged receiver dimming a sibling lamp. Static
// fine hardware is merged by finish, so rivets do not each become a draw call.
function palette(whiteSide = false) {
  return {
    hull: material('painted_hull', whiteSide ? 0xc9d0ce : 0x45676a, 0.58, 0.3),
    cream: material('reused_enamel', 0xdbd1b8, 0.54, 0.12),
    ochre: material('safety_ochre', 0xbf8242, 0.62, 0.18),
    dark: material('machinery', 0x202c33, 0.6, 0.45),
    metal: material('bare_metal', 0x8b9799, 0.38, 0.72),
    warm: material('civic_lamp', 0xffc78a, 0.5, 0.08, 0.85),
    glass: material('frosted_globe', 0xbfc8b7, 0.34, 0.08),
  };
}

function markGeometry(g, name) {
  g.name = `LanternWard_${name}`;
  g.computeBoundingSphere();
  g.setAttribute('sfHullPosition', g.attributes.position.clone());
  return g;
}

// Chamfered plate: silhouette facets and broad clean faces, no random grime.
function plate(length, height, width, bevel = 0.16) {
  const r = Math.min(bevel, height * 0.24, width * 0.15, length * 0.15);
  const x = length / 2 - r, z = width / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-x, -z + r); s.lineTo(-x + r, -z); s.lineTo(x - r, -z);
  s.lineTo(x, -z + r); s.lineTo(x, z - r); s.lineTo(x - r, z);
  s.lineTo(-x + r, z); s.lineTo(-x, z - r); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: height - 2 * r,
    bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 1, steps: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -(height - 2 * r) / 2, 0);
  return g;
}

function batch(root, materials, prefix, detail = false) {
  const bins = new Map(), transform = new THREE.Matrix4();
  const position = new THREE.Vector3(), rotation = new THREE.Euler(), quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  function add(g, finish, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    position.set(x, y, z); rotation.set(rx, ry, rz); quaternion.setFromEuler(rotation);
    transform.compose(position, quaternion, scale);
    g.applyMatrix4(transform);
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    let list = bins.get(finish); if (!list) { list = []; bins.set(finish, list); }
    list.push(flat);
    return flat;
  }
  return {
    add,
    box(finish, x, y, z, length, height, width, ry = 0, bevel = 0.16) {
      add(plate(length, height, width, bevel), finish, x, y, z, 0, ry, 0);
    },
    cylinder(finish, x, y, z, radiusTop, radiusBottom, height, rz = 0, segments = 12) {
      add(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), finish, x, y, z, 0, 0, rz);
    },
    ring(finish, x, y, z, radius, tube, rx = Math.PI / 2, ry = 0, arc = TAU) {
      add(new THREE.TorusGeometry(radius, tube, 5, 28, arc), finish, x, y, z, rx, ry, 0);
    },
    flush() {
      for (const [finish, parts] of bins) {
        const g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
        if (!g) throw new Error(`Lantern Ward cannot merge ${prefix}/${finish}`);
        if (parts.length > 1) for (const part of parts) part.dispose();
        markGeometry(g, `${prefix}_${finish}`);
        const mesh = new THREE.Mesh(g, materials[finish]);
        mesh.name = `${prefix}_${finish}`;
        mesh.castShadow = mesh.receiveShadow = true;
        if (detail) mesh.userData.lanternWardDetail = true;
        root.add(mesh);
      }
      bins.clear();
    },
  };
}

function movingGroup(root, name, x, y, z) {
  const group = new THREE.Group(); group.name = name;
  group.position.set(x, y, z); group.userData.animated = true;
  root.add(group);
  return group;
}

function socket(root, name, coordinates) {
  const s = new THREE.Object3D(); s.name = `SOCKET_${name}`;
  s.position.fromArray(coordinates); s.userData.spacefaceSocket = true;
  root.add(s);
  return s;
}

function bolts(b, x, y, z, length, width, count = 4) {
  for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
    b.cylinder('metal', x - length / 2 + i * length / (count - 1), y, z + side * width / 2, 0.13, 0.13, 0.1, 0, 6);
  }
}

function cradle(root, materials) {
  const b = batch(root, materials, 'Cradle_Fixed');
  for (const side of [-1, 1]) {
    if (side < 0) {
      // A real open work face: the household lamp can leave the retained well
      // diagonally. No invisible rail remains across this painted opening.
      b.box('dark', -8.7, 0, -6.3, 9.4, 2.4, 4.8, 0, 0.28);
      b.box('hull', -8.6, 1.3, -6.3, 9.1, 0.55, 4.35, 0, 0.12);
      b.box('dark', 12.6, 0, -6.3, 1.6, 2.4, 4.8, 0, 0.16);
      b.box('cream', 12.6, 1.3, -6.3, 1.5, 0.55, 4.35, 0, 0.08);
      b.box('ochre', -4.3, 1.66, -6.3, 0.55, 0.18, 4.2, 0, 0.04);
      b.box('metal', -3.8, 1.1, -4.5, 3, 0.6, 1);
    } else {
      b.box('dark', -0.6, 0, 6.3, 25.6, 2.4, 4.8, 0, 0.28);
      b.box('hull', 0.9, 1.3, 6.3, 20.7, 0.55, 4.35, 0, 0.12);
      b.box('ochre', 6.3, 1.66, 6.3, 6.5, 0.18, 4.2, 0.035, 0.04);
    }
    // Former engine-bell lips make the work platform's origin legible.
    b.ring('metal', -11.8, 0.3, side * 6.3, 2.05, 0.28, 0, Math.PI / 2);
    b.cylinder('dark', -11.9, 0.3, side * 6.3, 1.6, 1.15, 1.7, Math.PI / 2);
    for (let i = 0; i < (side < 0 ? 1 : 4); i++) b.box('metal', -6.8 + i * 3.8, 1.8, side * 7.4, 0.34, 0.22, 1.45);
    b.box('cream', side < 0 ? 12.6 : 10.8, 1.8, side * 6.3, 1.1, 0.24, 3.3);
    b.box('warm', side < 0 ? 12.6 : 11.05, 2.05, side * 6.3, 0.65, 0.2, 1.8, 0, 0.04);
  }
  b.box('hull', -10.8, -0.1, 0, 4.2, 2.2, 12.6, 0, 0.22);
  b.box('metal', -8.4, -0.3, 0, 0.7, 1, 12.3);
  b.box('dark', 0, -0.7, 0, 7, 0.65, 7);
  b.ring('metal', 0, 0.1, 0, 3.55, 0.34);
  b.ring('ochre', 0, 0.13, 0, 2.9, 0.12);
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3;
    b.box('cream', Math.cos(a) * 2.6, 0.32, Math.sin(a) * 2.6, 0.7, 0.35, 0.45, -a);
  }
  // Centerline tow eye and rigid links; the visible eye matches tow_point.
  for (const side of [-1, 1]) b.box('metal', 11.7, 0.1, side * 2.9, 6.5, 0.9, 0.8, side * 0.69);
  b.box('ochre', 12.6, 0.05, 0, 4.4, 1.2, 3.2);
  b.ring('metal', 14, 0.3, 0, 0.85, 0.3);
  b.ring('metal', -13.2, 0.3, 0, 0.65, 0.25);
  // An asymmetrical fused switch box and spooled real service line.
  b.box('cream', -7.7, 2.2, -4.9, 3.1, 1.5, 2.1, 0, 0.12);
  b.box('dark', -7.7, 3.02, -4.9, 2.5, 0.12, 1.5, 0, 0.03);
  b.box('warm', -7.5, 3.1, -4.9, 0.62, 0.08, 0.34, 0, 0.015);
  b.ring('dark', -9.3, 1.5, 2.6, 1.35, 0.32);
  b.ring('ochre', -9.3, 1.8, 2.6, 1.05, 0.2);
  b.flush();

  const fine = batch(root, materials, 'Cradle_Manufacture', true);
  bolts(fine, -8.6, 1.66, -6.3, 6.4, 3.7, 4); bolts(fine, 1.2, 1.66, 6.3, 17, 3.7, 7);
  for (let i = 0; i < 5; i++) fine.box('dark', 3.8 + i * 0.55, 1.82, 6.3, 0.2, 0.04, 2.6, -0.4, 0.009);
  fine.flush();

  const jaws = [];
  for (const side of [-1, 1]) {
    const jaw = movingGroup(root, `Cradle_Retainer_${side < 0 ? 'Port' : 'Starboard'}`, -2.4, 1.3, side * 4.5);
    const j = batch(jaw, materials, 'Retainer');
    j.cylinder('metal', 0, 0, 0, 0.75, 0.75, 0.7);
    j.box('ochre', 2.7, 0.2, -side * 0.5, 5.6, 0.8, 1.05, side * 0.15);
    j.box('dark', 4.75, 0.22, -side * 1.13, 1.45, 0.96, 1.0);
    j.box('cream', 3.35, 0.65, -side * 0.58, 1.3, 0.12, 0.7);
    j.flush(); jaws.push({ jaw, side });
  }
  const arm = movingGroup(root, 'Cradle_Swivel_Brace', -6.6, 2.1, -2.8);
  const a = batch(arm, materials, 'Swivel_Brace');
  a.cylinder('metal', 0, 0, 0, 0.65, 0.8, 0.65);
  a.box('cream', 2.1, 0.48, 0, 4.4, 0.72, 0.9);
  a.box('metal', 3.9, 0.15, 0, 1.4, 0.55, 0.55);
  a.box('dark', 4.7, 0.05, 0, 0.65, 1.1, 1.4); a.flush();
  return pose => {
    for (const { jaw, side } of jaws) jaw.rotation.y = -side * (0.62 * (1 - pose.clamp));
    arm.rotation.y = -0.75 + pose.arm * 0.75;
    arm.rotation.z = 0.24 * (1 - pose.arm) - pose.damage * 0.13;
  };
}

function lamp(root, materials) {
  const b = batch(root, materials, 'Family_Lamp_Cage');
  b.cylinder('dark', 0, 0.25, 0, 2.25, 2.6, 0.9);
  b.cylinder('cream', 0, 1.05, 0, 2.7, 2.25, 0.7);
  b.ring('metal', 0, 1.45, 0, 3.05, 0.25);
  b.ring('ochre', 0, 1.8, 0, 2.25, 0.16);
  b.ring('metal', 0, 6.75, 0, 2.25, 0.18);
  b.cylinder('cream', 0, 7.2, 0, 0.8, 2.3, 0.8);
  b.ring('metal', 0, 7.9, 0, 0.52, 0.17, 0, 0);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    b.box('hull', Math.cos(a) * 2.15, 4.25, Math.sin(a) * 2.15, 0.35, 5.2, 0.35, -a, 0.07);
    b.box('metal', Math.cos(a) * 2.3, 2, Math.sin(a) * 2.3, 0.8, 0.38, 0.44, -a);
  }
  b.box('dark', -2.65, 2.2, 0, 1.1, 0.8, 0.85);
  b.box('metal', -3.2, 2.2, 0, 0.28, 0.62, 0.62);
  for (let i = 0; i < 3; i++) b.box('ochre', -0.9 + i * 0.9, 1.48, 1.25, 0.28, 0.08, 0.7, 0, 0.015);
  b.flush();
  const globe = new THREE.Mesh(markGeometry(new THREE.SphereGeometry(1.85, 20, 12), 'Family_Globe'), materials.glass);
  globe.name = 'Family_Globe'; globe.position.y = 4.35; globe.scale.y = 1.2;
  globe.castShadow = globe.receiveShadow = true; globe.userData.animated = true; root.add(globe);
  const fracture = movingGroup(root, 'Family_Lamp_Damaged_Guard', 0, 2.3, 2.3);
  const crack = batch(fracture, materials, 'Damaged_Guard');
  crack.box('dark', 0.4, 1.35, 0, 0.4, 2.7, 0.3, 0, 0.04);
  crack.box('metal', -0.4, 2.5, 0, 1.6, 0.3, 0.3, 0.4, 0.04); crack.flush();
  fracture.visible = false;
  return pose => {
    materials.glass.color.setHex(pose.lit ? 0xffdda2 : pose.damage > 0.65 ? 0x536063 : 0xbfc8b7);
    materials.glass.emissive.setHex(pose.lit ? 0xffba65 : 0x000000);
    materials.glass.emissiveIntensity = pose.lit ? 1.3 : 0;
    fracture.visible = pose.damage > 0.25;
    fracture.rotation.z = -pose.damage * 0.52;
    globe.scale.y = 1.2 - pose.damage * 0.08;
  };
}

function serviceWorker(root, materials) {
  // 2.15 m suited technician, boots on the same bolted platform as the power
  // connector. The wrist remains at the real connector while the elbow works.
  const worker = movingGroup(root, 'Ward_EVA_Technician', 6.4, 1.65, 2.3);
  const torso = movingGroup(worker, 'Worker_Torso', 0, 0.95, 0);
  const body = batch(torso, materials, 'Worker_Body');
  body.box('ochre', 0, 0.25, 0, 0.64, 0.84, 0.46, 0, 0.1);
  body.box('cream', 0, 0.35, 0.34, 0.51, 0.67, 0.28, 0, 0.05);
  body.cylinder('metal', 0, 0.78, 0, 0.23, 0.25, 0.13);
  body.add(new THREE.SphereGeometry(0.34, 12, 8), 'cream', 0, 1.03, -0.05);
  body.add(new THREE.SphereGeometry(0.245, 10, 7), 'dark', -0.13, 1.05, -0.2);
  body.box('warm', -0.1, 1.25, -0.22, 0.2, 0.09, 0.12, 0, 0.01);
  body.flush();
  const legs = batch(worker, materials, 'Worker_Brace');
  for (const side of [-1, 1]) {
    legs.box('dark', side * 0.23, 0.5, 0.14, 0.27, 0.87, 0.28, -side * 0.16, 0.05);
    legs.box('cream', side * 0.26, 0.1, -0.08, 0.36, 0.22, 0.58, 0, 0.05);
  }
  legs.flush();
  const limbGeometry = markGeometry(new THREE.CylinderGeometry(0.115, 0.14, 1, 8), 'Worker_Arm');
  const arms = [];
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(limbGeometry, i % 2 ? materials.dark : materials.ochre);
    arm.name = `Worker_Arm_${i}`; arm.castShadow = arm.receiveShadow = true;
    arm.userData.animated = true; worker.add(arm); arms.push(arm);
  }
  const tool = new THREE.Mesh(markGeometry(new THREE.CylinderGeometry(0.1, 0.14, 0.48, 8), 'Worker_Tool'), materials.metal);
  tool.name = 'Worker_Connector_Tool'; tool.userData.animated = true; worker.add(tool);
  const tip = new THREE.Object3D(); tip.name = 'Worker_Actual_Tool_Contact'; tip.userData.spacefaceSocket = true;
  root.add(tip);
  // A curved finite umbilical is attached hardware, not a moving/electrical VFX.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(7.8, 2.4, 5.4), new THREE.Vector3(7.6, 2.1, 4.6),
    new THREE.Vector3(6.8, 2.4, 3.3), new THREE.Vector3(6.4, 2.95, 2.65),
  ]);
  const tether = new THREE.Mesh(markGeometry(new THREE.TubeGeometry(curve, 12, 0.045, 5, false), 'Worker_Umbilical'), materials.ochre);
  tether.name = 'Worker_Umbilical'; root.add(tether);
  const scratch = new THREE.Vector3(), midpoint = new THREE.Vector3();
  const shoulderL = new THREE.Vector3(), elbowL = new THREE.Vector3(), handL = new THREE.Vector3();
  const shoulderR = new THREE.Vector3(), elbowR = new THREE.Vector3(), handR = new THREE.Vector3();
  const service = new THREE.Vector3(-0.76, 1.25, -1.5);
  function connect(mesh, a, b) {
    scratch.subVectors(b, a); const length = scratch.length();
    mesh.position.copy(midpoint.addVectors(a, b).multiplyScalar(0.5));
    mesh.scale.set(1, length, 1); mesh.quaternion.setFromUnitVectors(Y_AXIS, scratch.normalize());
  }
  return pose => {
    worker.visible = tether.visible = tip.visible = pose.worker;
    if (!pose.worker) return;
    const reach = pose.arm;
    torso.rotation.x = -0.22 * reach; torso.rotation.z = 0.12 * reach;
    shoulderL.set(-0.31, 1.31, -0.05); shoulderR.set(0.31, 1.31, -0.05);
    handL.set(-0.34 - 0.66 * reach, 0.85 + 0.4 * reach, -0.3 - 1.2 * reach);
    handR.set(0.3 - 1.22 * reach, 0.88 + 0.4 * reach, -0.26 - 1.13 * reach);
    if (pose.contact) handL.copy(service);
    elbowL.set(-0.74, 1.07 + 0.06 * pose.progress, -0.5 - 0.2 * reach);
    elbowR.set(0.1, 1.04, -0.54 - 0.18 * reach);
    connect(arms[0], shoulderL, elbowL); connect(arms[1], elbowL, handL);
    connect(arms[2], shoulderR, elbowR); connect(arms[3], elbowR, handR);
    tool.position.copy(handL); tool.rotation.z = Math.PI / 2; tool.rotation.y = 0;
    tip.position.set(worker.position.x + handL.x - 0.24, worker.position.y + handL.y, worker.position.z + handL.z);
  };
}

function receiver(root, materials, shutter = false) {
  const b = batch(root, materials, shutter ? 'Utility_Shutter_Fixed' : 'Family_Receiver_Fixed');
  b.box('dark', 0, -0.15, -7.2, shutter ? 22.4 : 23.2, 1.9, shutter ? 6 : 5.6, 0, 0.22);
  b.box('hull', 0, 0.94, -7.3, shutter ? 21.9 : 22.8, 0.4, 5.0, 0, 0.12);
  b.box('cream', 9, 1.1, -0.3, 6.2, 2.2, 13.4, 0, 0.2);
  b.box('dark', 9, 2.3, -3.7, 4.8, 0.24, 4.4, 0, 0.05);
  b.box('ochre', 6.4, 0.8, 2.6, 4.1, 1.6, 4.2, 0, 0.12);
  b.box('hull', 7.8, 3.1, -1.0, 3.2, 3.0, 3.3, 0, 0.14);
  b.box('cream', 6.2, 3.05, -0.4, 0.5, 2.0, 2.0, 0, 0.08);
  b.box('dark', 5.55, 2.9, 0.8, 0.7, 0.85, 0.85, 0, 0.08);
  b.box('metal', 5.4, 2.9, 0.8, 0.25, 0.55, 0.55, 0, 0.05);
  for (let i = 0; i < 4; i++) b.box('dark', 8.9, 4.65, -1.9 + i * 0.55, 2.3, 0.1, 0.21, 0, 0.02);
  for (const x of [-9.7, 0, 10]) {
    b.box('metal', x, 2.3, -9.0, 0.2, 2.7, 0.2, 0, 0.04);
    b.box('ochre', x, 3.7, -9.0, 0.6, 0.3, 0.5, 0, 0.04);
  }
  b.box('metal', 0, 3.7, -9.0, 20, 0.16, 0.16, 0, 0.025);
  if (!shutter) {
    b.cylinder('hull', 0, -0.05, 0, 3.9, 4.4, 0.85, 0, 16);
    b.ring('cream', 0, 0.5, 0, 3.55, 0.35);
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU / 3) + Math.PI;
      b.box('ochre', Math.cos(a) * 4.0, 0.7, Math.sin(a) * 4.0, 1.6, 0.9, 1.0, -a);
    }
    b.box('metal', 1.2, -0.2, -4.8, 1.1, 0.7, 4.8, -0.22);
    b.box('cream', -6.2, 1.22, -6.5, 4.3, 0.14, 2.7, -0.09, 0.025);
    // Three hand-cut brass strokes identify this household on cargo and receiver.
    for (let i = 0; i < 3; i++) b.box('ochre', -7.3 + i * 0.95, 1.34, -6.5, 0.36, 0.08, 1.65, -0.09, 0.015);
  }
  b.flush();
  const signal = new THREE.Mesh(markGeometry(plate(1.9, 0.28, 0.7, 0.05), 'Service_Status'), materials.glass);
  signal.name = 'Receiver_Service_Status'; signal.position.set(7.8, 4.75, 0.0); root.add(signal);
  const work = serviceWorker(root, materials);
  let leaf = null;
  if (shutter) {
    leaf = movingGroup(root, 'Repair_Shutter_Leaf', -8.2, 1.0, -3.6);
    const l = batch(leaf, materials, 'Repair_Shutter');
    l.box('hull', 8.0, 2.7, 0, 16.0, 5.4, 0.7, 0, 0.14);
    for (let i = 0; i < 5; i++) l.box('cream', 8, 0.7 + i * 0.95, 0.43, 15.2, 0.12, 0.16, 0, 0.02);
    l.box('ochre', 8, 2.7, 0.5, 2.2, 1.2, 0.12, 0, 0.025); l.flush();
  }
  return pose => {
    work(pose);
    materials.glass.color.setHex(pose.lit || pose.shutter ? 0xffd7a0 : 0x354047);
    materials.glass.emissive.setHex(pose.lit || pose.shutter ? 0xffb866 : 0x000000);
    materials.glass.emissiveIntensity = pose.lit || pose.shutter ? 0.7 : 0;
    if (leaf) { leaf.rotation.z = pose.shutter ? 0 : -0.18; leaf.rotation.y = pose.shutter ? 0 : 0.12; }
  };
}

function obstruction(root, materials) {
  const b = batch(root, materials, 'Fallen_Mast');
  b.box('dark', 0, -0.2, 0, 57.5, 2.9, 5.4, 0, 0.3);
  b.box('cream', -1, 1.5, 0, 53, 0.5, 4.5, 0, 0.12);
  for (let i = 0; i < 9; i++) {
    const x = -24 + i * 6;
    b.box('metal', x, 1.9, 0, 0.45, 0.25, 5.3, 0, 0.05);
    b.box('ochre', x + 1.4, 1.84, 0, 0.8, 0.1, 3.9, -0.45, 0.025);
  }
  b.box('hull', -24.8, 0.3, 0, 7.1, 3.6, 12, 0, 0.28);
  b.box('dark', -24.8, 2.3, 0, 4.6, 0.4, 9.8, 0, 0.08);
  b.box('ochre', 24.5, 2.3, 0, 5.3, 2.2, 7.0, 0.12, 0.2);
  b.box('dark', 24.5, 3.5, 0, 4.5, 0.18, 5.8, 0.12, 0.03);
  b.box('warm', 24.5, 3.62, 0, 2.8, 0.1, 0.8, 0.12, 0.02);
  b.ring('metal', 0, 2.1, 0, 1.35, 0.28);
  b.ring('ochre', -27.2, 2.0, 0, 0.9, 0.24);
  b.flush(); return () => {};
}

function serviceCheek(root, materials) {
  const b = batch(root, materials, 'Service_Cut_Cheek');
  b.box('dark', 0, -0.4, 0, 25, 3, 24, 0, 0.32);
  b.box('hull', 0, 1.3, 0, 24.3, 0.55, 23.3, 0, 0.15);
  // Recesses are manufacturing detail, not a falsely advertised ship aperture.
  b.box('cream', -8, 3.6, 0, 4.5, 5.0, 18, 0, 0.25);
  b.box('ochre', 8, 3.1, -1.6, 4.7, 4.0, 13.5, 0.12, 0.2);
  b.box('dark', -0.5, 2.5, -7.5, 10, 2.6, 4.1, 0, 0.18);
  b.ring('metal', -8, 5.9, 0, 3.4, 0.45);
  b.box('metal', 0, 2.2, 9.7, 20, 0.55, 0.6);
  for (const x of [-9.5, 9.5]) {
    b.box('cream', x, 4.8, 9.7, 0.65, 5.5, 0.65);
    b.box('dark', x, 7.8, 9.7, 1.8, 1.0, 1.4);
    b.box('warm', x, 8.4, 9.7, 1.2, 0.25, 0.9);
  }
  for (let i = 0; i < 4; i++) b.box('ochre', -4.5 + i * 3, 1.65, 9, 1.2, 0.08, 3.5, -0.4, 0.02);
  b.flush(); return () => {};
}

function shoreSpine(root, materials, whiteSide) {
  const b = batch(root, materials, 'Shore_Service_Spine');
  b.box('dark', 0, -0.6, 0, 57, 2.7, 12, 0, 0.3);
  b.box('hull', 0, 0.98, 0, 56.5, 0.48, 11.4, 0, 0.15);
  for (let i = 0; i < 7; i++) {
    const x = -24 + i * 8;
    b.box('metal', x, 1.35, -2.9, 0.35, 0.28, 5.7, 0, 0.04);
    b.box('cream', x + 1.5, 1.35, 2.6, whiteSide ? 5.2 : 4.3, 0.18, 4.5, whiteSide ? 0 : (i % 2 ? 0.05 : -0.03), 0.04);
    if (i % 2 === 0) {
      b.box('dark', x, 2.3, 4.9, 0.4, 2.2, 0.4, 0, 0.05);
      b.box('cream', x, 3.65, 4.9, 1.5, 0.7, 1.3, 0, 0.12);
      b.box('warm', x, 4.07, 4.9, 1.0, 0.18, 0.8, 0, 0.03);
    }
  }
  b.box('ochre', 0, 1.25, -5.2, 55, 0.16, 0.48, 0, 0.025);
  // Paired utility lines and mismatched couplings join the habitats physically.
  b.cylinder('metal', 0, 1.65, -1.2, 0.34, 0.34, 56, Math.PI / 2);
  b.cylinder('dark', 0, 1.65, -2.25, 0.45, 0.45, 56, Math.PI / 2);
  for (const x of [-27.5, 27.5]) {
    b.ring('ochre', x, 1.65, -1.2, 0.55, 0.16, 0, Math.PI / 2);
    b.ring('metal', x, 1.65, -2.25, 0.64, 0.15, 0, Math.PI / 2);
  }
  b.flush(); return () => {};
}

/**
 * Integration: return this root directly from visualFactory before generic
 * type selection. Its existing pose/LOD/lifecycle membrane remains in charge.
 * No runtime-only clone is required; worker snapshots carry the data projection.
 */
export function buildLanternWardVisual(entity) {
  if (!isLanternWardBody(entity)) return null;
  const role = entity.data.lanternWardRole, contract = LANTERN_WARD_BODY_CONTRACTS[role];
  const root = new THREE.Group(); root.name = `LanternWard_${role}`;
  const materials = palette(entity.data.lanternWardWhiteSide === true);
  const applyPose = role === 'cradle' ? cradle(root, materials)
    : role === 'lamp' ? lamp(root, materials)
      : role === 'receiver' ? receiver(root, materials)
        : role === 'service_face' ? receiver(root, materials, true)
          : role === 'obstruction' ? obstruction(root, materials)
            : role === 'service_cheek' ? serviceCheek(root, materials)
              : shoreSpine(root, materials, entity.data.lanternWardWhiteSide === true);
  for (const [name, coordinates] of Object.entries(contract.sockets)) socket(root, name, coordinates);
  root.userData.kind = entity.type;
  root.userData.interactionKind = entity.type;
  root.userData.generatedVisualProducer = 'lantern-ward-authored-civic-v1';
  root.userData.lanternWardAssetId = contract.assetId;
  root.userData.lanternWardAssetVersion = LANTERN_WARD_ASSET_VERSION;
  root.userData.visualBounds = { center: contract.center.slice(), size: contract.size.slice() };
  root.userData.renderContract = {
    assetBoundary: 'Lantern Ward authored civic machinery v1', proceduralSource: true,
    source: 'src/render/lanternWardVisuals.js', collisionSource: 'src/data/lanternWardLayout.js',
    privateResources: true, payloadIsSeparate: true,
  };
  let disposed = false;
  const ownerId = entity.id, generation = entity.occupantGeneration, recordId = entity.data.worldRecordId;
  const pose = {}, details = [];
  root.traverse(node => { if (node.userData?.lanternWardDetail) details.push(node); });
  root.userData.updateLod = level => {
    for (const node of details) node.visible = level === 'lod0' || level === 0;
  };
  root.userData.updateRuntimeState = live => {
    root.visible = !disposed && isLanternWardBody(live) && live.id === ownerId
      && live.occupantGeneration === generation && live.data.worldRecordId === recordId
      && live.data.lanternWardRole === role;
    if (root.visible) applyPose(lanternWardVisualPose(live.data, pose));
  };
  root.userData.detachAuthoredMotion = () => { disposed = true; root.visible = false; };
  // Diagnostic/manual teardown. Ordinary renderer teardown already disposes the
  // leaf sets; detaching motion never frees a material still being traversed.
  let resourcesDisposed = false;
  root.userData.disposeLanternWardVisual = () => {
    root.userData.detachAuthoredMotion();
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    const geometries = new Set(), finishes = new Set();
    root.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const m of Array.isArray(node.material) ? node.material : [node.material]) finishes.add(m);
    });
    for (const g of geometries) g.dispose();
    for (const m of finishes) m.dispose();
    // Some roles use only a subset of the seven finishes.
    for (const m of Object.values(materials)) if (!finishes.has(m)) m.dispose();
    root.removeFromParent();
  };
  root.userData.updateRuntimeState(entity);
  freezeStaticChildMatrices(root);
  return root;
}
