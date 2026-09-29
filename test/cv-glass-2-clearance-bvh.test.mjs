// CV-GLASS-2 / AQ-HIT. A wide structure's camera roof is the same max-vertex-Y
// neighborhood the old triangle walk produced, read through a MeshBVH window
// instead of visiting every triangle. Compact spans stay on the coarse box.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  CLEARANCE_GRID_CELL_WU,
  acceptClearanceMesh,
  clearanceCellInRange,
  clearanceGridRawAt,
  clearanceLayoutFromBox,
  clearanceNeighborhoodRaw,
  clearanceSampleCell,
  ensureClearanceBoundsTree,
  rasterClearanceGrid,
  setClearanceEnsureOverrideForTest,
} from '../src/render/clearanceQuery.js';
import {
  CAMERA_CLEARANCE_GRID_MIN_SPAN_WU,
  CAMERA_CLEARANCE_MARGIN_WU,
  cameraClearanceFloorAt,
  setCameraClearanceFloorRetainForBench,
} from '../src/render/renderer.js';

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function worldBox(root) {
  const box = new THREE.Box3().setFromObject(root);
  return {
    minX: box.min.x, minY: box.min.y, minZ: box.min.z,
    maxX: box.max.x, maxY: box.max.y, maxZ: box.max.z,
  };
}

function ownerWith(meshes) {
  return {
    _meshes: new Map(meshes.map((mesh, i) => [i + 1, mesh])),
    _meshesVersion: 1,
    _clearanceMeshesVersion: -1,
  };
}

/** Deck at the local origin, a taller tower many cells away, then a seeded soup. */
function deckSoupGeometry(seed, indexed) {
  const rng = mulberry32(seed);
  const deckHigh = 20 + (seed % 17) * 3;
  const far = 8 + CLEARANCE_GRID_CELL_WU * 10;
  const positions = [
    -8, 12, -8,
    8, deckHigh, -8,
    0, 18, 8,
    far, deckHigh + 40, -4,
    far + 6, deckHigh + 40, 4,
    far + 3, deckHigh + 48, 0,
  ];
  for (let i = 0; i < 160; i++) {
    const x = far + 12 + rng() * CLEARANCE_GRID_CELL_WU * 4;
    const z = -CLEARANCE_GRID_CELL_WU + rng() * CLEARANCE_GRID_CELL_WU * 3;
    const y = 3 + rng() * 9;
    positions.push(x, y, z, x + 3, y + 0.5, z + 1, x + 1, y, z + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (indexed) {
    const index = new Uint32Array(geo.attributes.position.count);
    for (let i = 0; i < index.length; i++) index[i] = i;
    // A non-sequential index still names the same triangles. indirect mode must not sort it.
    const swapped = index.slice();
    const tri = 4;
    for (let k = 0; k < 3; k++) {
      const a = index[k];
      swapped[k] = index[tri * 3 + k];
      swapped[tri * 3 + k] = a;
    }
    geo.setIndex(new THREE.BufferAttribute(swapped, 1));
  }
  geo.userData.deckHigh = deckHigh;
  return geo;
}

function stationRoot(geometry, at) {
  const root = new THREE.Group();
  root.position.set(at?.x ?? 1000, at?.y ?? 0, at?.z ?? -400);
  root.userData.kind = 'station';
  root.userData.authoredAssetState = 'authored';
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, mesh };
}

function deckCamera(root) {
  return { x: root.position.x, z: root.position.z, y: -1000 };
}

function withRetainOff(fn) {
  const previous = setCameraClearanceFloorRetainForBench(false);
  try {
    return fn();
  } finally {
    setCameraClearanceFloorRetainForBench(previous);
  }
}

test('the window roof is the deck max vertex Y, and the far soup is not visited', () => {
  const geo = deckSoupGeometry(3, true);
  const indexBefore = Array.from(geo.index.array);
  const { root, mesh } = stationRoot(geo);
  assert.equal(geo.boundingBox, null);
  ensureClearanceBoundsTree(geo);
  assert.equal(geo.boundingBox, null, 'the query build does not write a bounding box onto the drawn geometry');
  const cam = deckCamera(root);
  const box = worldBox(root);
  const hit = clearanceNeighborhoodRaw(root, box, cam.x, cam.z);
  const raster = rasterClearanceGrid(root, box);
  const rasterRaw = clearanceGridRawAt(raster, cam.x, cam.z);
  const pos = geo.attributes.position;
  const deckYs = [pos.getY(0), pos.getY(1), pos.getY(2)];
  const deckMax = Math.max(...deckYs);
  const deckAvg = (deckYs[0] + deckYs[1] + deckYs[2]) / 3;
  let soupMax = -Infinity;
  for (let i = 3; i < pos.count; i++) soupMax = Math.max(soupMax, pos.getY(i));
  const triCount = geo.index.count / 3;

  assert.equal(hit.failed, false);
  assert.equal(hit.empty, false);
  assert.equal(hit.raw, rasterRaw, 'BVH window and the legacy raster name the same roof');
  assert.equal(hit.raw, deckMax, 'the stamp is the highest vertex, not a point on the face');
  assert.ok(hit.raw - deckAvg > (deckMax - deckAvg) * 0.5, 'the roof stays in the top half of the slope');
  assert.ok(soupMax > hit.raw, 'a taller triangle exists outside the window');
  assert.ok(hit.raw < box.maxY, 'the roof is not the mesh bounding box');
  assert.ok(hit.visited > 0);
  assert.ok(hit.visited * 4 < triCount, `visited ${hit.visited} of ${triCount}; the full soup was not the query`);
  assert.deepEqual(Array.from(geo.index.array), indexBefore, 'indirect mode leaves the rendered index alone');
  assert.equal(geo.boundsTree, undefined);
  assert.ok(geo.userData.clearanceBoundsTree, 'the tree is stored for this query only');
  assert.equal(mesh.visible, true);
  assert.equal(mesh.geometry, geo);

  const owner = ownerWith([root]);
  const floor = withRetainOff(() => cameraClearanceFloorAt(owner, cam.x, cam.z, cam.y));
  assert.equal(floor, hit.raw + CAMERA_CLEARANCE_MARGIN_WU);
  assert.ok(floor < box.maxY + CAMERA_CLEARANCE_MARGIN_WU);
});

test('the same seeded deck is the same roof, and a different seed is a different deck', () => {
  const first = stationRoot(deckSoupGeometry(5, true));
  const again = stationRoot(deckSoupGeometry(5, true));
  const other = stationRoot(deckSoupGeometry(9, true));
  const floorOf = (built) => {
    const cam = deckCamera(built.root);
    return withRetainOff(() => cameraClearanceFloorAt(ownerWith([built.root]), cam.x, cam.z, cam.y));
  };
  const a = floorOf(first);
  const b = floorOf(again);
  const c = floorOf(other);
  assert.equal(a, b, 'a fixed seed lands on the same body');
  assert.notEqual(a, c);
  assert.equal(floorOf(first), a);
});

test('two overlapping shells take the taller roof, in either order', () => {
  const span = CAMERA_CLEARANCE_GRID_MIN_SPAN_WU + CLEARANCE_GRID_CELL_WU;
  const make = (height) => {
    const root = new THREE.Group();
    root.position.set(1000, 0, -400);
    root.userData.kind = 'station';
    root.userData.authoredAssetState = 'authored';
    root.add(new THREE.Mesh(new THREE.BoxGeometry(span, height, span), new THREE.MeshBasicMaterial()));
    return root;
  };
  const shortShell = make(40);
  const tallShell = make(90);
  const at = deckCamera(shortShell);
  const alone = (shell) => withRetainOff(() => cameraClearanceFloorAt(ownerWith([shell]), at.x, at.z, at.y));
  const shortFloor = alone(shortShell);
  const tallFloor = alone(tallShell);
  assert.ok(tallFloor > shortFloor);
  const highThenLow = withRetainOff(() => cameraClearanceFloorAt(ownerWith([tallShell, shortShell]), at.x, at.z, at.y));
  const lowThenHigh = withRetainOff(() => cameraClearanceFloorAt(ownerWith([shortShell, tallShell]), at.x, at.z, at.y));
  assert.equal(highThenLow, Math.max(shortFloor, tallFloor));
  assert.equal(lowThenHigh, highThenLow);
  assert.equal(withRetainOff(() => cameraClearanceFloorAt(ownerWith([shortShell, tallShell]), at.x, at.z, at.y)), lowThenHigh);
});

test('a non-indexed mesh keeps a null index and matches the raster', () => {
  const geo = deckSoupGeometry(4, false);
  assert.equal(geo.index, null);
  const { root } = stationRoot(geo);
  const cam = deckCamera(root);
  const box = worldBox(root);
  const hit = clearanceNeighborhoodRaw(root, box, cam.x, cam.z);
  const raw = clearanceGridRawAt(rasterClearanceGrid(root, box), cam.x, cam.z);
  assert.equal(hit.raw, raw);
  assert.equal(geo.index, null, 'the query index is not written onto the drawn geometry');
  assert.equal(geo.boundsTree, undefined);
});

test('an empty geometry fails closed and a second build does not retry', () => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3));
  assert.equal(ensureClearanceBoundsTree(geo), null);
  assert.equal(geo.userData.clearanceBvhFailed, true);
  Object.defineProperty(geo, 'attributes', {
    configurable: true,
    get() { throw new Error('retried the failed geometry'); },
  });
  assert.equal(ensureClearanceBoundsTree(geo), null);
});

test('a builder failure still returns the legacy roof and is not retried', () => {
  const { root } = stationRoot(deckSoupGeometry(6, true));
  const cam = deckCamera(root);
  let calls = 0;
  setClearanceEnsureOverrideForTest(() => {
    calls += 1;
    throw new Error('bvh down');
  });
  try {
    withRetainOff(() => {
      const floor = cameraClearanceFloorAt(ownerWith([root]), cam.x, cam.z, cam.y);
      const raw = clearanceGridRawAt(rasterClearanceGrid(root, worldBox(root)), cam.x, cam.z);
      assert.equal(floor, raw + CAMERA_CLEARANCE_MARGIN_WU);
      assert.equal(calls, 1);
      const again = cameraClearanceFloorAt(ownerWith([root]), cam.x, cam.z, cam.y);
      assert.equal(again, floor);
      assert.equal(calls, 1, 'the failed mesh stays on the raster instead of rebuilding every query');
    });
  } finally {
    setClearanceEnsureOverrideForTest(null);
  }
});

test('a camera off the footprint builds no tree; over the deck it does', () => {
  const geo = deckSoupGeometry(2, true);
  const { root } = stationRoot(geo);
  const box = worldBox(root);
  const layout = clearanceLayoutFromBox(box);
  const farX = box.maxX + layout.cw * 4;
  const far = {};
  clearanceSampleCell(layout, farX, root.position.z, far);
  assert.equal(clearanceCellInRange(layout, far.gx, far.gz), false);
  const owner = ownerWith([root]);
  withRetainOff(() => {
    assert.equal(cameraClearanceFloorAt(owner, farX, root.position.z, -1000), -Infinity);
  });
  assert.equal(geo.userData.clearanceBoundsTree, undefined);
  const cam = deckCamera(root);
  const floor = withRetainOff(() => cameraClearanceFloorAt(owner, cam.x, cam.z, cam.y));
  const raw = clearanceNeighborhoodRaw(root, worldBox(root), cam.x, cam.z).raw;
  assert.equal(floor, raw + CAMERA_CLEARANCE_MARGIN_WU);
  assert.ok(geo.userData.clearanceBoundsTree);
});

test('the same grid cell does not shapecast again, and the tree survives a position bucket', () => {
  const geo = deckSoupGeometry(7, true);
  const { root } = stationRoot(geo);
  const cam = deckCamera(root);
  const layout = clearanceLayoutFromBox(worldBox(root));
  const here = {};
  clearanceSampleCell(layout, cam.x, cam.z, here);
  let step = layout.cw;
  let nextX = cam.x + step;
  const next = {};
  clearanceSampleCell(layout, nextX, cam.z, next);
  if (next.gx === here.gx || !clearanceCellInRange(layout, next.gx, next.gz)) {
    step = -layout.cw;
    nextX = cam.x + step;
    clearanceSampleCell(layout, nextX, cam.z, next);
  }
  assert.notEqual(next.gx, here.gx);
  assert.equal(clearanceCellInRange(layout, next.gx, next.gz), true);
  const original = MeshBVH.prototype.shapecast;
  let casts = 0;
  MeshBVH.prototype.shapecast = function shapecastCount(...args) {
    casts += 1;
    return original.apply(this, args);
  };
  try {
    withRetainOff(() => {
      const owner = ownerWith([root]);
      const first = cameraClearanceFloorAt(owner, cam.x, cam.z, cam.y);
      assert.equal(casts, 1);
      const nudged = cameraClearanceFloorAt(owner, cam.x + step * 0.2, cam.z, cam.y);
      assert.equal(nudged, first);
      assert.equal(casts, 1, 'a move inside the cell reuses the window');
      cameraClearanceFloorAt(owner, nextX, cam.z, cam.y);
      assert.equal(casts, 2);
      const tree = geo.userData.clearanceBoundsTree;
      assert.ok(tree);
      root.position.x += 5;
      root.updateMatrixWorld(true);
      const movedCam = deckCamera(root);
      const moved = cameraClearanceFloorAt(owner, movedCam.x, movedCam.z, movedCam.y);
      assert.equal(geo.userData.clearanceBoundsTree, tree, 'a rounded position change does not rebuild the tree');
      const raw = clearanceNeighborhoodRaw(root, worldBox(root), movedCam.x, movedCam.z).raw;
      assert.equal(moved, raw + CAMERA_CLEARANCE_MARGIN_WU);
    });
  } finally {
    MeshBVH.prototype.shapecast = original;
  }
});

test('a rotated scaled child matches the raster and does not use a center sample', () => {
  const geo = deckSoupGeometry(8, true);
  const { root, mesh } = stationRoot(geo);
  root.rotation.y = 0.4;
  mesh.scale.set(1.5, 0.8, 1.2);
  root.updateMatrixWorld(true);
  const deckPoint = new THREE.Vector3(8, geo.userData.deckHigh, -8);
  mesh.localToWorld(deckPoint);
  const box = worldBox(root);
  const hit = clearanceNeighborhoodRaw(root, box, deckPoint.x, deckPoint.z);
  const raw = clearanceGridRawAt(rasterClearanceGrid(root, box), deckPoint.x, deckPoint.z);
  assert.equal(hit.raw, raw);
  const pos = geo.attributes.position;
  const worldYs = [0, 1, 2].map((i) => {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    return mesh.localToWorld(v).y;
  });
  const maxY = Math.max(...worldYs);
  const avg = (worldYs[0] + worldYs[1] + worldYs[2]) / 3;
  // The column grid stores heights as float32, same as the legacy raster.
  assert.ok(Math.abs(hit.raw - maxY) <= Math.max(1e-5, Math.abs(maxY) * 1e-6));
  assert.ok(hit.raw - avg > (maxY - avg) * 0.5);
});

test('glass, glow, exempt, hidden, and instanced triangles do not raise the roof', () => {
  const geo = deckSoupGeometry(1, true);
  const { root, mesh } = stationRoot(geo);
  const deckHigh = geo.userData.deckHigh;
  const tall = new Float32Array([
    -2, deckHigh + 80, -2,
    2, deckHigh + 90, -2,
    0, deckHigh + 70, 2,
  ]);
  const addTall = (material, mutate) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tall, 3));
    const child = new THREE.Mesh(g, material);
    if (mutate) mutate(child);
    root.add(child);
    return child;
  };
  addTall(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 }));
  addTall(new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true }));
  const solid = new THREE.MeshBasicMaterial();
  addTall(solid, (child) => { child.material.depthWrite = false; });
  addTall(new THREE.MeshBasicMaterial(), (child) => { child.userData.clearanceExempt = true; });
  addTall(new THREE.MeshBasicMaterial(), (child) => { child.userData.worldSitePresentationOwned = true; });
  addTall(new THREE.MeshBasicMaterial(), (child) => { child.visible = false; });
  const instGeo = new THREE.BufferGeometry();
  instGeo.setAttribute('position', new THREE.Float32BufferAttribute(tall, 3));
  const inst = new THREE.InstancedMesh(instGeo, new THREE.MeshBasicMaterial(), 1);
  inst.setMatrixAt(0, new THREE.Matrix4());
  root.add(inst);
  root.updateMatrixWorld(true);
  assert.equal(acceptClearanceMesh(mesh), true);
  assert.equal(acceptClearanceMesh(inst), false);
  const cam = deckCamera(root);
  const box = worldBox(root);
  const hit = clearanceNeighborhoodRaw(root, box, cam.x, cam.z);
  assert.equal(hit.raw, deckHigh);
  assert.ok(box.maxY > deckHigh);
});

test('a span under the wide-structure bar never builds a tree', () => {
  const span = CAMERA_CLEARANCE_GRID_MIN_SPAN_WU - 40;
  assert.ok(span > 0 && span < CAMERA_CLEARANCE_GRID_MIN_SPAN_WU);
  const root = new THREE.Group();
  root.position.set(300, 0, 0);
  root.userData.kind = 'wreck';
  root.userData.authoredAssetState = 'authored';
  const geo = new THREE.BoxGeometry(span, 60, span * 0.8);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  root.add(mesh);
  const owner = ownerWith([root]);
  const floor = withRetainOff(() => cameraClearanceFloorAt(owner, 300, 0, -1000));
  const box = worldBox(root);
  assert.equal(floor, box.maxY + CAMERA_CLEARANCE_MARGIN_WU);
  assert.equal(geo.userData.clearanceBoundsTree, undefined);
  assert.equal(geo.boundsTree, undefined);
  assert.equal(mesh.visible, true);
});

test('a grouped box keeps every face and does not reorder its index', () => {
  const span = CAMERA_CLEARANCE_GRID_MIN_SPAN_WU + 80;
  const geo = new THREE.BoxGeometry(span, 80, span);
  assert.ok(geo.groups.length > 0, 'BoxGeometry covers its faces with groups');
  const indexBefore = Array.from(geo.index.array);
  const root = new THREE.Group();
  root.position.set(0, 0, 0);
  root.userData.kind = 'place';
  root.userData.authoredAssetState = 'authored';
  root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
  const box = worldBox(root);
  const hit = clearanceNeighborhoodRaw(root, box, 0, 0);
  const raw = clearanceGridRawAt(rasterClearanceGrid(root, box), 0, 0);
  assert.equal(hit.raw, raw);
  assert.equal(hit.raw, box.maxY, 'the top face is inside the grouped query');
  assert.deepEqual(Array.from(geo.index.array), indexBefore);
  assert.equal(geo.boundsTree, undefined);
  const floor = withRetainOff(() => cameraClearanceFloorAt(ownerWith([root]), 0, 0, -1000));
  assert.equal(floor, hit.raw + CAMERA_CLEARANCE_MARGIN_WU);
});
