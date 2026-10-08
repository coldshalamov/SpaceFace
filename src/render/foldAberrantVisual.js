// src/render/foldAberrantVisual.js — The Unclosed, from above.
// Two nested squares swallowing each other (an XW tesseract, not a shimmer).
// Phase and telegraph are written by the sim. This file never reads a wall clock
// and never mutates a shared geometry.

import * as THREE from 'three';
import {
  projectTesseractInto,
  TESSERACT_EDGES,
  TESSERACT_FAULT_EDGE,
  FOLD,
} from '../data/foldAberrant.js';

const VIS = 30;
const SCAR_VIS = 12;
const UP = new THREE.Vector3(0, 1, 0);
const DIR = new THREE.Vector3();
const QUAT = new THREE.Quaternion();

const OBSIDIAN = 0x1a1816;
const NACRE = 0xd7d2c8;
const TEAL = 0x7ee0d0;
const TEAL_DIM = 0x9fd8d0;
const AMBER = 0xe08a3c;

function unitBox() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  return geo;
}

function unitTorus() {
  return new THREE.TorusGeometry(1, 0.035, 6, 48);
}

function seamMat(color, emissive, intensity) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.78,
    emissive,
    emissiveIntensity: intensity,
  });
}

function placeBeam(mesh, ax, ay, az, bx, by, bz, thickness) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-4)) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  DIR.set(dx / len, dy / len, dz / len);
  if (DIR.y < -0.999) QUAT.set(1, 0, 0, 0);
  else QUAT.setFromUnitVectors(UP, DIR);
  mesh.quaternion.copy(QUAT);
  mesh.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
  const width = thickness > 0 ? thickness : 0.62;
  mesh.scale.set(width, len, Math.min(width, 0.45));
}

function vert(buf, i, scale, out) {
  const o = i * 3;
  out.x = buf[o] * scale;
  out.y = buf[o + 1] * scale;
  out.z = buf[o + 2] * scale;
  return out;
}

function buildBeams(parent, faultMat, outerMat, innerMat, strutMat) {
  const beams = [];
  for (let n = 0; n < TESSERACT_EDGES.length; n += 1) {
    const a = TESSERACT_EDGES[n][0];
    const b = TESSERACT_EDGES[n][1];
    const fault = (a === TESSERACT_FAULT_EDGE[0] && b === TESSERACT_FAULT_EDGE[1])
      || (a === TESSERACT_FAULT_EDGE[1] && b === TESSERACT_FAULT_EDGE[0]);
    const mesh = new THREE.Mesh(unitBox(), fault ? faultMat : strutMat);
    mesh.frustumCulled = false;
    parent.add(mesh);
    beams.push({ mesh, a, b, fault, outerMat, innerMat, strutMat, faultMat });
  }
  return beams;
}

function layoutFold(view, entity) {
  const fold = entity.data && entity.data.foldAberrant;
  const phase = fold && Number.isFinite(fold.phase) ? fold.phase : 0;
  const scale = view.scar ? SCAR_VIS : VIS;
  const buf = view.buf;
  projectTesseractInto(phase, buf);
  const A = view.va;
  const B = view.vb;
  let radiusSum = 0;
  const radii = view.radii;
  for (let i = 0; i < 16; i += 1) {
    const o = i * 3;
    const r = Math.hypot(buf[o], buf[o + 2]);
    radii[i] = r;
    radiusSum += r;
  }
  const mean = radiusSum / 16;
  const recover = !!(fold && fold.telegraph && fold.telegraph.recover);
  const seamIntensity = recover ? 0.04 : 1.35;
  view.faultMat.emissiveIntensity = recover ? 0.1 : 1.8;
  view.strutMat.emissiveIntensity = seamIntensity;
  view.outerMat.emissiveIntensity = recover ? 0.03 : 0.35;
  view.innerMat.emissiveIntensity = recover ? 0.08 : 0.55;
  view.core.visible = true;
  view.core.scale.setScalar(recover || view.scar ? 2.1 : 1.4);
  view.core.material.emissiveIntensity = recover || view.scar ? 0.28 : 0.15;

  for (let n = 0; n < view.beams.length; n += 1) {
    const beam = view.beams[n];
    vert(buf, beam.a, scale, A);
    vert(buf, beam.b, scale, B);
    const outer = radii[beam.a] >= mean && radii[beam.b] >= mean;
    const inner = radii[beam.a] < mean && radii[beam.b] < mean;
    if (!beam.fault) beam.mesh.material = outer ? beam.outerMat : inner ? beam.innerMat : beam.strutMat;
    if (beam.fault) {
      const ox = A.x;
      const oy = A.y;
      const oz = A.z;
      const px = B.x;
      const py = B.y;
      const pz = B.z;
      A.set(ox + (px - ox) * 0.075, oy + (py - oy) * 0.075, oz + (pz - oz) * 0.075);
      B.set(px + (ox - px) * 0.075, py + (oy - py) * 0.075, pz + (oz - pz) * 0.075);
    }
    placeBeam(beam.mesh, A.x, A.y, A.z, B.x, B.y, B.z);
  }

  // Four cassettes on the outer square's corners.
  const order = view.order;
  for (let i = 0; i < 16; i += 1) order[i] = i;
  order.sort((i, j) => radii[j] - radii[i]);
  const used = view.used;
  let placed = 0;
  for (let n = 0; n < 16 && placed < 4; n += 1) {
    const i = order[n];
    vert(buf, i, scale, A);
    let close = false;
    for (let u = 0; u < placed; u += 1) {
      if (Math.hypot(A.x - used[u].x, A.z - used[u].z) < 4) close = true;
    }
    if (close) continue;
    const cassette = view.cassettes[placed];
    cassette.visible = true;
    cassette.position.set(A.x, A.y, A.z);
    cassette.scale.set(3.1, 1.6, 3.1);
    used[placed].x = A.x;
    used[placed].z = A.z;
    placed += 1;
  }
  for (let i = placed; i < 4; i += 1) view.cassettes[i].visible = false;

  const tel = fold && fold.telegraph;
  const ox = entity.pos ? entity.pos.x : 0;
  const oz = entity.pos ? entity.pos.z : 0;
  layoutSegment(view.chord, tel && tel.ax != null ? tel.ax - ox : null, tel && tel.az != null ? tel.az - oz : null, tel && tel.bx != null ? tel.bx - ox : null, tel && tel.bz != null ? tel.bz - oz : null, 0.55, 3.5);
  layoutSegment(view.ribbon, tel && tel.cornerX != null ? 0 : null, tel && tel.cornerX != null ? 0 : null, tel && tel.cornerX != null ? tel.cornerX - ox : null, tel && tel.cornerZ != null ? tel.cornerZ - oz : null, 0.35, 28);
  const showDisk = !!(tel && tel.disk) && !view.scar;
  view.disk.visible = showDisk;
  if (showDisk) {
    view.disk.scale.set(FOLD.insideRadius, FOLD.insideRadius, 1);
    view.disk.position.set(0, 0.3, 0);
  }
  const showHatches = view.scar;
  view.scarRing.visible = showHatches;
  if (showHatches) {
    view.scarRing.scale.set(FOLD.scarRadius, FOLD.scarRadius, 1);
    view.scarRing.position.set(0, 0.2, 0);
  }
  const heading = tel && Number.isFinite(tel.heading) ? tel.heading : 0;
  view.heading.visible = !view.scar && !recover;
  if (view.heading.visible) {
    const hx = Math.cos(heading) * 16;
    const hz = Math.sin(heading) * 16;
    placeBeam(view.heading, 0, 0.8, 0, hx, 0.8, hz);
  }
}

function placeFlat(mesh, ax, az, bx, bz, y, width) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-4)) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.quaternion.identity();
  // Three's rotation.y sends local +X toward -Z, and the renderer leaves this root at yaw 0
  // (the body writes rot 0). atan2(-dz, dx) lays the band on the segment, not its mirror.
  mesh.rotation.set(0, Math.atan2(-dz, dx), 0);
  mesh.position.set((ax + bx) * 0.5, y, (az + bz) * 0.5);
  mesh.scale.set(len, 0.35, width > 0 ? width : 3.5);
}

function layoutSegment(mesh, ax, az, bx, bz, y, thickness) {
  if (ax == null || az == null || bx == null || bz == null) {
    mesh.visible = false;
    return;
  }
  placeFlat(mesh, ax, az, bx, bz, y, thickness);
}

export function buildFoldAberrantVisual(entity) {
  const scar = !!(entity && entity.data && entity.data.foldAberrant && entity.data.foldAberrant.role === 'scar');
  const root = new THREE.Group();
  root.name = scar ? 'SF_FoldScar' : 'SF_TheUnclosed';
  const faultMat = seamMat(0x2a2118, AMBER, 1.8);
  const strutMat = seamMat(0x14221f, TEAL, 1.35);
  const outerMat = seamMat(OBSIDIAN, TEAL_DIM, 0.35);
  const innerMat = seamMat(NACRE, 0x6a7a74, 0.55);
  const beams = buildBeams(root, faultMat, outerMat, innerMat, strutMat);
  const cassettes = [];
  const cassetteMat = seamMat(OBSIDIAN, TEAL, 0.6);
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(unitBox(), cassetteMat);
    mesh.frustumCulled = false;
    root.add(mesh);
    cassettes.push(mesh);
  }
  const coreMat = seamMat(NACRE, TEAL_DIM, 0.15);
  const core = new THREE.Mesh(unitBox(), coreMat);
  core.frustumCulled = false;
  core.scale.setScalar(1.4);
  root.add(core);
  const chord = new THREE.Mesh(unitBox(), seamMat(0xe7e2d6, 0xf4f0e6, 0.7));
  chord.frustumCulled = false;
  chord.visible = false;
  root.add(chord);
  const ribbon = new THREE.Mesh(unitBox(), seamMat(NACRE, TEAL, 0.9));
  ribbon.frustumCulled = false;
  ribbon.visible = false;
  root.add(ribbon);
  const diskMat = seamMat(0x101816, TEAL, 0.85);
  const disk = new THREE.Mesh(unitTorus(), diskMat);
  disk.rotation.x = Math.PI / 2;
  disk.visible = false;
  disk.frustumCulled = false;
  root.add(disk);
  const scarRing = new THREE.Mesh(unitTorus(), seamMat(0x101816, AMBER, 0.45));
  scarRing.rotation.x = Math.PI / 2;
  scarRing.visible = scar;
  scarRing.frustumCulled = false;
  root.add(scarRing);
  const heading = new THREE.Mesh(unitBox(), seamMat(NACRE, TEAL, 1.1));
  heading.frustumCulled = false;
  root.add(heading);

  const view = {
    scar,
    buf: new Float64Array(48),
    radii: new Float64Array(16),
    order: new Array(16),
    used: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }],
    va: new THREE.Vector3(),
    vb: new THREE.Vector3(),
    beams,
    cassettes,
    core,
    chord,
    ribbon,
    disk,
    scarRing,
    heading,
    faultMat,
    strutMat,
    outerMat,
    innerMat,
  };
  // Three only fires onBeforeRender for render-list meshes, not groups.
  core.onBeforeRender = () => layoutFold(view, entity);
  layoutFold(view, entity);
  return root;
}

export function buildFoldPayloadVisual(entity) {
  const role = entity && entity.data && entity.data.foldAberrant && entity.data.foldAberrant.role;
  const root = new THREE.Group();
  root.name = role === 'plate' ? 'SF_UnclosedPlate' : 'SF_UnclosedCorner';
  if (role === 'plate') {
    const slab = new THREE.Mesh(unitBox(), seamMat(NACRE, AMBER, 0.55));
    slab.scale.set(9, 0.7, 5.5);
    root.add(slab);
    const fault = new THREE.Mesh(unitBox(), seamMat(0x2a2118, AMBER, 1.6));
    fault.scale.set(7, 0.9, 0.28);
    root.add(fault);
  } else {
    const cube = new THREE.Mesh(unitBox(), seamMat(OBSIDIAN, TEAL, 0.7));
    cube.scale.set(4.2, 2.2, 4.2);
    root.add(cube);
    const fault = new THREE.Mesh(unitBox(), seamMat(0x2a2118, AMBER, 1.7));
    fault.scale.set(3.4, 0.22, 0.22);
    fault.position.y = 1.05;
    root.add(fault);
  }
  return root;
}
