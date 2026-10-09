// SF-266 — seam markers used to walk every asteroid in the universe each beat.
// With a live spatial hash the candidate set is the draw disc's colliders (a conservative
// cell-level superset; shouldDrawTableVfx re-filters exactly), iterated by stable id so the
// emitted markers stay deterministic — identical picture at a cost that scales with what is
// near, not with how big the universe is. Without a live hash the lane keeps the indexed
// type scan, unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx, createSeamMarkerPipelineMesh } from '../src/render/vfx.js';
import { SpatialHash } from '../src/core/spatialHash.js';

const DRAW_WU = 300;
const player = { id: 1, type: 'ship', alive: true, collides: true, pos: { x: 0, z: 0 }, radius: 6 };

function rock(id, x, z, seams = 2) {
  return {
    id, type: 'asteroid', alive: true, collides: true,
    pos: { x, z }, radius: 10, rot: 0, vel: { x: 0, z: 0 },
    data: seams ? { seams: Array.from({ length: seams }, (_, i) => ({ localOffset: { x: i + 1, z: 0 } })) } : {},
  };
}

function host(entities, { hash = true } = {}) {
  const h = Object.create(vfx);
  const spatialHash = hash ? new SpatialHash(64) : null;
  if (spatialHash) spatialHash.rebuild(entities);
  const { mesh, capacity } = createSeamMarkerPipelineMesh();
  h.state = {
    simTime: 4,
    playerId: 1,
    entityList: entities,
    entities: new Map(entities.map((e) => [e.id, e])),
    entityIndex: {
      __spacefaceEntityIndexV1: true, ready: true,
      asteroids: entities.filter((e) => e.type === 'asteroid'),
    },
    spatialHash,
    camera: { zoom: 144, fov: 50, aspect: 16 / 9, tilt: 60 },
    world: { frameOrigin: { x: 0, z: 0 } },
  };
  h._ent = (id) => h.state.entities.get(id) || null;
  h._seamMarkers = { mesh, CAP: capacity, dynamicBufferOwner: null };
  h._seamMat4 = new THREE.Matrix4();
  h._seamDim = new THREE.Color('#ffb35c');
  h._seamHot = new THREE.Color('#d7e6ff');
  h._seamLock = new THREE.Color('#39d0ff');
  h._ctmp = new THREE.Color();
  h._t = 1;
  h._tableVfxDrawWu = DRAW_WU;
  h._spawnLocalXZ = { x: 0, z: 0 };
  h._toLocalXZ = (x, z, out) => { out.x = x; out.z = z; return out; };
  h._miningSeamPulseId = null;
  h._miningSeamPulseUntil = 0;
  return h;
}

function meshMatrices(mesh, count) {
  const m = new THREE.Matrix4();
  const rows = [];
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, m);
    rows.push(Array.from(m.elements).map((v) => Math.round(v * 1000) / 1000).join(','));
  }
  return rows;
}

test('spatial candidates cover the same seam set as the universe scan', () => {
  const nearA = rock(10, 40, 0);
  const nearB = rock(11, -120, 60);
  const farC = rock(12, 3000, 0);          // far beyond the draw disc
  const deadSeam = rock(13, 20, 20);
  deadSeam.alive = false;
  const nonSeam = rock(14, 30, 0, 0);      // no seams — skipped by the row filter
  const ship = { id: 15, type: 'ship', alive: true, collides: true, pos: { x: 50, z: 0 }, radius: 6, data: {} };
  const entities = [player, nearA, ship, nearB, deadSeam, nonSeam, farC];

  const withHash = host(entities, { hash: true });
  const withoutHash = host(entities, { hash: false });

  const candidates = withHash._seamMarkerCandidates(withHash.state, player, DRAW_WU);
  // Candidates are a conservative superset: the two live in-disc rocks must be present,
  // the deep-space rock must not appear, and iteration order is stable by id.
  assert.ok(candidates.includes(nearA) && candidates.includes(nearB));
  assert.ok(!candidates.includes(farC), 'a rock far outside the disc must not be a candidate');
  const ids = candidates.map((e) => e.id);
  assert.deepEqual([...ids].sort((a, b) => a - b), ids, 'candidate order is sorted by entity id');

  // End-to-end parity: identical marker matrices through both lanes.
  withHash._updateSeamMarkers(1 / 20);
  withoutHash._updateSeamMarkers(1 / 20);
  const meshA = withHash._seamMarkers.mesh;
  const meshB = withoutHash._seamMarkers.mesh;
  assert.equal(meshA.count, meshB.count, 'spatial path must emit the same marker count');
  assert.equal(meshA.count, 4, 'two seam-bearing rocks x two seams');
  assert.deepEqual(meshMatrices(meshA, meshA.count), meshMatrices(meshB, meshB.count),
    'spatial candidate iteration must produce the same markers in the same order');
  meshA.dispose();
  meshB.dispose();
});

test('a sparse universe stops paying the asteroid walk while near markers stay exact', () => {
  const entities = [player, rock(10, 30, 0)];
  for (let i = 0; i < 400; i++) entities.push(rock(100 + i, 5000 + i * 50, i * 40));
  const h = host(entities);
  const candidates = h._seamMarkerCandidates(h.state, player, DRAW_WU);
  assert.equal(candidates.filter((e) => e.type === 'asteroid' && e.data && e.data.seams).length, 1,
    'distant rocks are not candidates');
  h._updateSeamMarkers(1 / 20);
  assert.equal(h._seamMarkers.mesh.count, 2);
  h._seamMarkers.mesh.dispose();
});

test('without a live hash the lane uses the indexed type scan verbatim', () => {
  const entities = [player, rock(10, 30, 0), rock(11, 9000, 0)];
  const h = host(entities, { hash: false });
  const list = h._seamMarkerCandidates(h.state, player, DRAW_WU);
  assert.equal(list, h.state.entityIndex.asteroids, 'fallback returns the index bucket itself');
});
