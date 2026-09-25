import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';

import {
  buildSkinSeatIndex,
  flankSeat,
  outermostSkinZ,
} from '../src/render/thruster/retroSkinSeat.js';

// retroMounts seats the bow retros by raycasting the hull-skin soup: origin
// (x, y, side*4), dir (0, 0, -side), far 4, DoubleSide, first hit with z*side > 0.
// These are byte-exact copies of the pre-index implementation — the reference oracle.
const RAY_FAR_Z = 4;
const _ray = new THREE.Raycaster();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

function raySkinHitRef(skinMesh, x, y, side) {
  _rayOrigin.set(x, y, side * RAY_FAR_Z);
  _rayDir.set(0, 0, -side);
  _ray.set(_rayOrigin, _rayDir);
  _ray.far = RAY_FAR_Z;
  const hits = _ray.intersectObject(skinMesh, false);
  for (const hit of hits) {
    if (hit.point.z * side > 0) return hit.point;
  }
  return null;
}

function flankSurfaceAtRef(skinMesh, x, y, side) {
  let best = null;
  for (const dy of [0, -0.03, 0.03, -0.06, 0.06, -0.1, 0.1]) {
    const hit = raySkinHitRef(skinMesh, x, y + dy, side);
    if (hit && (!best || Math.abs(hit.z) > Math.abs(best.z))) best = hit;
  }
  return best;
}

function soupMesh(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tapered, elliptical, ring-lofted hull: flank rays skim long wedge faces and both
// end caps are XY-degenerate (the parallel-ray rejection path).
function latheHullSoup(rand) {
  const rings = 16;
  const segs = 18;
  const ringPts = [];
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    const x = -1.3 + t * 2.4;
    const base = 0.30 * Math.sin(Math.PI * Math.min(1, t * 1.18 + 0.04)) + 0.045;
    const pts = [];
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pts.push([x, Math.sin(a) * base * (0.72 + rand() * 0.08), Math.cos(a) * base * (1 + rand() * 0.12)]);
    }
    ringPts.push(pts);
  }
  const soup = [];
  for (let r = 0; r < rings - 1; r++) {
    const A = ringPts[r];
    const B = ringPts[r + 1];
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      soup.push(...A[s], ...B[s], ...B[s2], ...A[s], ...B[s2], ...A[s2]);
    }
  }
  // End caps: nearly XY-degenerate fans — parallel to the flank ray.
  for (const [ring, xc] of [[ringPts[0], -1.3], [ringPts[rings - 1], 1.1]]) {
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      soup.push(xc, 0, 0, ...ring[s], ...ring[s2]);
    }
  }
  return Float32Array.from(soup);
}

// An unstructured soup: scattered overlapping triangles, some crossing the centerline.
function randomSoup(rand, triCount = 700) {
  const soup = [];
  for (let i = 0; i < triCount; i++) {
    const cx = (rand() * 2 - 1) * 1.4;
    const cy = (rand() * 2 - 1) * 0.5;
    const cz = (rand() * 2 - 1) * 0.45;
    for (let v = 0; v < 3; v++) {
      soup.push(
        cx + (rand() - 0.5) * 0.3,
        cy + (rand() - 0.5) * 0.3,
        cz + (rand() - 0.5) * 0.3,
      );
    }
  }
  return Float32Array.from(soup);
}

// Bake a real authored wholeship GLB into the same normalized soup collectHullSkinMesh
// produces: GLB-scene-space triangles scaled to the 1.72-unit hull frame.
async function realHullSoup(file) {
  await MeshoptDecoder.ready;
  const bytes = readFileSync(new URL(`../assets/ships/release/parts/wholeships/${file}`, import.meta.url));
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const scale = 1.72 / Math.max(size.x, 1e-6);
  const soup = [];
  const v = new THREE.Vector3();
  scene.traverse((node) => {
    if (!node.isMesh || node.visible === false) return;
    if (node.name && /LOD[12]|COLLISION/i.test(node.name)) return;
    const pos = node.geometry && node.geometry.attributes && node.geometry.attributes.position;
    if (!pos) return;
    const index = node.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (const vi of [index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2]) {
        v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(node.matrixWorld);
        soup.push(v.x * scale, v.y * scale, v.z * scale);
      }
    }
  });
  return Float32Array.from(soup);
}

function assertSeatEqual(got, ref, label) {
  if (ref === null) {
    assert.equal(got, null, `${label}: index found a seat where the raycaster found none`);
    return;
  }
  assert.ok(got !== null, `${label}: index missed the raycaster's hit z=${ref.z}`);
  assert.ok(Math.abs(got - ref.z) <= 1e-5, `${label}: z ${got} vs raycast ${ref.z}`);
}

test('outermostSkinZ equals the DoubleSide raycaster first hit over synthetic soups', () => {
  const rand = mulberry32(0x5EED);
  const soups = [latheHullSoup(rand), randomSoup(rand)];
  let queries = 0;
  let hits = 0;
  for (const positions of soups) {
    const index = buildSkinSeatIndex(positions);
    const mesh = soupMesh(positions);
    for (let i = 0; i < 1400; i++) {
      const x = (rand() * 2 - 1) * 1.5;
      const y = (rand() * 2 - 1) * 0.6;
      const side = rand() < 0.5 ? -1 : 1;
      const ref = raySkinHitRef(mesh, x, y, side);
      const got = outermostSkinZ(index, x, y, side, RAY_FAR_Z);
      assertSeatEqual(got, ref, `soup query x=${x.toFixed(4)} y=${y.toFixed(4)} side=${side}`);
      queries++;
      if (ref) hits++;
    }
  }
  assert.equal(queries, 2800);
  assert.ok(hits > queries * 0.3, `queries must exercise real hits, got ${hits}/${queries}`);
});

test('flankSeat equals the seven-height raycast window and its tie rule', () => {
  const rand = mulberry32(0xFACE);
  const soups = [latheHullSoup(rand), randomSoup(rand)];
  let compared = 0;
  for (const positions of soups) {
    const index = buildSkinSeatIndex(positions);
    const mesh = soupMesh(positions);
    for (let i = 0; i < 300; i++) {
      const x = (rand() * 2 - 1) * 1.3;
      const y = (rand() * 2 - 1) * 0.3;
      const side = rand() < 0.5 ? -1 : 1;
      const ref = flankSurfaceAtRef(mesh, x, y, side);
      const got = flankSeat(index, x, y, side, RAY_FAR_Z);
      if (ref === null) {
        assert.equal(got, null, `flankSeat found a seat where the raycast window found none`);
      } else {
        assert.ok(got !== null);
        assert.equal(got.x, ref.x);
        assert.ok(Math.abs(got.y - ref.y) <= 1e-5, `seat y ${got.y} vs ${ref.y}`);
        assert.ok(Math.abs(got.z - ref.z) <= 1e-5, `seat z ${got.z} vs ${ref.z}`);
      }
      compared++;
    }
  }
  assert.equal(compared, 600);
});

test('real authored hull soup (mule_production_v1): seats match and the index is fast', async () => {
  const positions = await realHullSoup('mule_production_v1.glb');
  assert.ok(positions.length > 9000, 'the authored hull soup must be non-trivial');
  const index = buildSkinSeatIndex(positions);
  const mesh = soupMesh(positions);
  const rand = mulberry32(0xBEEF);

  // Equivalence over the flank region the seats actually probe.
  for (let i = 0; i < 60; i++) {
    const x = -1.2 + rand() * 2.0;
    const y = (rand() - 0.5) * 0.3;
    const side = rand() < 0.5 ? -1 : 1;
    assertSeatEqual(
      outermostSkinZ(index, x, y, side, RAY_FAR_Z),
      raySkinHitRef(mesh, x, y, side),
      `hull query x=${x.toFixed(4)} y=${y.toFixed(4)} side=${side}`,
    );
  }
  for (let i = 0; i < 12; i++) {
    const x = -1.0 + rand() * 1.6;
    const side = i % 2 === 0 ? -1 : 1;
    const ref = flankSurfaceAtRef(mesh, x, 0.055, side);
    const got = flankSeat(index, x, 0.055, side, RAY_FAR_Z);
    if (ref === null) {
      assert.equal(got, null);
    } else {
      assert.ok(got !== null);
      assert.ok(Math.abs(got.y - ref.y) <= 1e-5);
      assert.ok(Math.abs(got.z - ref.z) <= 1e-5);
    }
  }

  // Microbench — information only, not a gate: the index answers the whole
  // 7-height window in one soup pass; the raycaster paid 7 full-soup walks.
  const Q = 24;
  const t0 = performance.now();
  for (let i = 0; i < Q; i++) flankSurfaceAtRef(mesh, -1 + (i % 12) * 0.15, 0.055, i % 2 ? 1 : -1);
  const oldMs = performance.now() - t0;
  const t1 = performance.now();
  const N = 4000;
  for (let i = 0; i < N; i++) flankSeat(index, -1 + (i % 100) * 0.02, 0.055, i % 2 ? 1 : -1, RAY_FAR_Z);
  const newMs = performance.now() - t1;
  console.log(`[retro-skin-seat bench] ${positions.length / 9 | 0} tris: `
    + `raycaster flankSurfaceAt ${Q} queries = ${oldMs.toFixed(1)}ms (${(oldMs / Q).toFixed(2)}ms/q); `
    + `flankSeat ${N} queries = ${newMs.toFixed(1)}ms (${(newMs / N).toFixed(4)}ms/q)`);
});
