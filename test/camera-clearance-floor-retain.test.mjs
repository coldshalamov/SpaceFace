/**
 * Camera clearance floor retain: settled cam X/Y/Z returns the cached floor;
 * box rewrite / mesh churn / bench-off still match a fresh walk. Soft-GPU fps
 * not claimed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  cameraClearanceFloorAt,
  setCameraClearanceFloorRetainForBench,
  getCameraClearanceFloorRetainForBench,
  setCameraClearanceFloorRetainPosQuantizeForBench,
  getCameraClearanceFloorRetainPosQuantizeForBench,
  setCameraClearanceAsteroidSpanRejectForBench,
  setCameraClearanceAsteroidNeverRoofExcludeForBench,
} from '../src/render/renderer.js';

function stationAt(x, z, span = 200, h = 60, kind = 'station') {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.userData.kind = kind;
  root.userData.authoredAssetState = 'authored';
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(span, h, span),
    new THREE.MeshBasicMaterial(),
  ));
  root.updateMatrixWorld(true);
  return root;
}

function ownerWith(...meshes) {
  const map = new Map();
  for (let i = 0; i < meshes.length; i++) map.set(i + 1, meshes[i]);
  return { _meshes: map, _meshesVersion: 1 };
}

test('floor retain is on by default and bench toggle restores always-walk', () => {
  assert.equal(getCameraClearanceFloorRetainForBench(), true);
  setCameraClearanceFloorRetainForBench(false);
  assert.equal(getCameraClearanceFloorRetainForBench(), false);
  setCameraClearanceFloorRetainForBench(true);
  assert.equal(getCameraClearanceFloorRetainForBench(), true);
});

test('settled cam retains the same floor as a fresh walk', () => {
  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  setCameraClearanceFloorRetainForBench(true);
  const owner = ownerWith(stationAt(0, 0));
  const first = cameraClearanceFloorAt(owner, 0, 0, 10);
  assert.ok(Number.isFinite(first) && first > -Infinity, `expected a roof, got ${first}`);
  const second = cameraClearanceFloorAt(owner, 0, 0, 10);
  assert.equal(second, first);
  setCameraClearanceFloorRetainForBench(false);
  owner._clearanceFloorCache = null;
  const fresh = cameraClearanceFloorAt(owner, 0, 0, 10);
  assert.equal(fresh, first);
  setCameraClearanceFloorRetainForBench(true);
});

test('cam move forces a fresh walk (retain miss)', () => {
  setCameraClearanceFloorRetainForBench(true);
  const owner = ownerWith(stationAt(0, 0));
  const a = cameraClearanceFloorAt(owner, 0, 0, 10);
  const b = cameraClearanceFloorAt(owner, 400, 0, 10);
  assert.ok(a > -Infinity);
  assert.equal(b, -Infinity);
});

test('authored stamp change busts retain and refreshes the floor', () => {
  setCameraClearanceFloorRetainForBench(true);
  const station = stationAt(0, 0, 200, 60);
  const owner = ownerWith(station);
  const before = cameraClearanceFloorAt(owner, 0, 0, 10);
  // Replace geometry so setFromObject derives a taller roof, and bump the stamp so
  // the box cache + floor retain both miss.
  station.remove(station.children[0]);
  station.add(new THREE.Mesh(
    new THREE.BoxGeometry(200, 120, 200),
    new THREE.MeshBasicMaterial(),
  ));
  station.updateMatrixWorld(true);
  station.userData.authoredAssetState = 'authored-v2';
  const after = cameraClearanceFloorAt(owner, 0, 0, 10);
  assert.ok(after > before, `taller station should raise the roof (${before} -> ${after})`);
});

test('retain on/off agree across settled and moving cams', () => {
  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  const owner = ownerWith(stationAt(0, 0), stationAt(300, 80, 200, 60, 'place'));

  for (let i = 0; i < 40; i++) {
    const settled = i % 3 !== 0;
    const t = i * 0.17;
    const x = settled ? 0 : Math.sin(t) * 40;
    const z = settled ? 0 : Math.cos(t) * 40;
    const y = settled ? 10 : 10 + Math.sin(t) * 2;

    setCameraClearanceFloorRetainForBench(false);
    owner._clearanceFloorCache = null;
    const off = cameraClearanceFloorAt(owner, x, z, y);

    setCameraClearanceFloorRetainForBench(true);
    owner._clearanceFloorCache = null;
    const primed = cameraClearanceFloorAt(owner, x, z, y);
    const on = cameraClearanceFloorAt(owner, x, z, y);
    assert.equal(primed, off, `prime mismatch at i=${i}`);
    assert.equal(on, off, `retain mismatch at i=${i}`);
  }
  setCameraClearanceFloorRetainForBench(true);
});

test('bench-off skips the retain cache', () => {
  setCameraClearanceFloorRetainForBench(false);
  const owner = ownerWith(stationAt(0, 0));
  const a = cameraClearanceFloorAt(owner, 0, 0, 10);
  assert.ok(owner._clearanceFloorCache == null);
  const b = cameraClearanceFloorAt(owner, 0, 0, 10);
  assert.equal(a, b);
  assert.ok(owner._clearanceFloorCache == null);
  setCameraClearanceFloorRetainForBench(true);
});

test('pos-quantize is on by default and bench toggle restores bit-identical keys', () => {
  assert.equal(getCameraClearanceFloorRetainPosQuantizeForBench(), true);
  setCameraClearanceFloorRetainPosQuantizeForBench(false);
  assert.equal(getCameraClearanceFloorRetainPosQuantizeForBench(), false);
  setCameraClearanceFloorRetainPosQuantizeForBench(true);
  assert.equal(getCameraClearanceFloorRetainPosQuantizeForBench(), true);
});

test('quiet chase drift within 0.25 WU cell retains off-roof floor', () => {
  setCameraClearanceAsteroidSpanRejectForBench(true);
  setCameraClearanceAsteroidNeverRoofExcludeForBench(true);
  setCameraClearanceFloorRetainForBench(true);
  setCameraClearanceFloorRetainPosQuantizeForBench(true);
  // Far from station AABB — off-roof.
  const owner = ownerWith(stationAt(0, 0));
  const baseX = 400;
  const baseZ = 400;
  const baseY = 90;
  const first = cameraClearanceFloorAt(owner, baseX, baseZ, baseY);
  assert.equal(first, -Infinity);
  for (let i = 0; i < 20; i++) {
    const x = baseX + ((i * 0.011) % 0.12);
    const z = baseZ + ((i * 0.007) % 0.12);
    const y = baseY + ((i * 0.003) % 0.12);
    assert.equal(
      cameraClearanceFloorAt(owner, x, z, y),
      -Infinity,
      `drift i=${i} should retain off-roof`,
    );
  }
});

test('quantize-off misses retain on sub-cell chase drift', () => {
  setCameraClearanceFloorRetainForBench(true);
  setCameraClearanceFloorRetainPosQuantizeForBench(false);
  const owner = ownerWith(stationAt(0, 0));
  const baseX = 400;
  const baseZ = 400;
  const baseY = 90;
  cameraClearanceFloorAt(owner, baseX, baseZ, baseY);
  const cacheBefore = owner._clearanceFloorCache
    ? { ...owner._clearanceFloorCache }
    : null;
  assert.ok(cacheBefore);
  // Bit-identical miss: cam floats change, cache keys (exact) diverge, walk rewrites cache.
  const drifted = cameraClearanceFloorAt(owner, baseX + 0.05, baseZ + 0.03, baseY + 0.01);
  assert.equal(drifted, -Infinity);
  assert.notEqual(owner._clearanceFloorCache.camX, cacheBefore.camX);
  setCameraClearanceFloorRetainPosQuantizeForBench(true);
});

test('crossing a 0.25 WU cell forces a fresh off-roof walk', () => {
  setCameraClearanceFloorRetainForBench(true);
  setCameraClearanceFloorRetainPosQuantizeForBench(true);
  const owner = ownerWith(stationAt(0, 0));
  const a = cameraClearanceFloorAt(owner, 400, 400, 90);
  assert.equal(a, -Infinity);
  const cellCamX = owner._clearanceFloorCache.camX;
  // Jump by a full cell.
  const b = cameraClearanceFloorAt(owner, 400 + 0.25, 400, 90);
  assert.equal(b, -Infinity);
  assert.notEqual(owner._clearanceFloorCache.camX, cellCamX);
});