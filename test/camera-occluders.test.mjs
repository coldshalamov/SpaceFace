// Camera-sightline occluder duck (assessment §3 — near-camera bodies burying the player).
// The mechanism is a root position.y dip, which must reach every submission path: pooled
// asteroid instances recompose the owner root, authored pool proxies derive matrixWorld from
// the owner, and direct meshes follow the render traversal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';

import {
  cameraOccluderDiagnostics,
  createCameraOccluderState,
  OCCLUDER_MAX_RADIUS,
  OCCLUDER_MIN_RADIUS,
  occluderDuckCandidate,
  updateCameraOccluders,
} from '../src/render/cameraOccluders.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RENDERER_SRC = readFileSync(join(ROOT, 'src/render/renderer.js'), 'utf8');
const PARTS_SRC = readFileSync(join(ROOT, 'src/render/partsLibrary.js'), 'utf8');
const POOL_SRC = readFileSync(join(ROOT, 'src/render/asteroidInstancePool.js'), 'utf8');

function makeRoot() {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial()));
  return root;
}

function record(id, type, radius, x, z) {
  const mesh = makeRoot();
  mesh.position.set(x, 0, z);
  const entity = { id, type, radius, pos: { x, y: 0, z } };
  return { entity, mesh, x, y: 0, z, visible: true, viewCulled: false };
}

// Chase camera: behind + above the player looking down at the plane.
const CAM = { x: 0, y: 110, z: 130 };
const FOCUS = { x: 0, y: 0, z: 0 };

test('a body straddling the camera→player ray ducks below the sightline', () => {
  const state = createCameraOccluderState();
  // Directly under the ray midpoint: ray height there is 55, rock top is 30 → modest duck.
  const rec = record(7, 'asteroid', 30, 0, 65);
  for (let i = 0; i < 240; i++) updateCameraOccluders(state, [rec], CAM, FOCUS, 1 / 60, { playerId: 99 });
  const diag = cameraOccluderDiagnostics(state);
  assert.equal(diag.active, 1, 'the blocking rock is ducked');
  const dip = diag.entries[0].dip;
  assert.ok(dip > 0 && dip <= 30 * 1.8 + 12, `dip ${dip} inside the cap`);
  // Clears the ray: rock top (30 - dip) sits CLEARANCE below the ray height at its z (55).
  assert.ok(30 - dip <= 55 - 8 + 1e-6, `dipped top ${30 - dip} clears the sightline`);
  assert.equal(rec.mesh.position.y, -dip, 'duck is written onto the root');
  assert.equal(rec.mesh.matrix.elements[13], -dip, 'local matrix recomposed for pool readers');
});

test('bodies off the corridor or past the player never duck', () => {
  const state = createCameraOccluderState();
  const records = [
    record(1, 'asteroid', 30, 200, 65),   // far lateral
    record(2, 'asteroid', 30, 0, -40),    // beyond the player (t > 1)
    record(3, 'asteroid', 30, 0, 150),    // behind the camera (t < 0)
    record(4, 'asteroid', 30, 45, 64),    // lateral past the corridor edge (45 > radius 30)
    record(5, 'ship', 40, 120, 60),       // a ship off the corridor
  ];
  for (let i = 0; i < 240; i++) updateCameraOccluders(state, records, CAM, FOCUS, 1 / 60, { playerId: 99 });
  assert.equal(cameraOccluderDiagnostics(state).active, 0);
  for (const rec of records) assert.equal(rec.mesh.position.y, 0);
});

test('a body whose top already clears the ray does not duck', () => {
  const state = createCameraOccluderState();
  // Small rock near the camera where the ray is high: top 13 < ray height ~85 minus clearance.
  const rec = record(8, 'asteroid', 13, 0, 100);
  for (let i = 0; i < 240; i++) updateCameraOccluders(state, [rec], CAM, FOCUS, 1 / 60, { playerId: 99 });
  assert.equal(cameraOccluderDiagnostics(state).active, 0);
  assert.equal(rec.mesh.position.y, 0);
});

test('the duck eases out fast, rises back slow, and restores cleanly on exit', () => {
  const state = createCameraOccluderState();
  const rec = record(7, 'asteroid', 40, 0, 40); // deep block: ray height ~78 < top 40? no —
  // recheck: rayY at t for z=40 is 110*(130-40)/130 ≈ 76; top 40 < 76 → not blocking.
  // Move it closer to the player where the ray is low.
  rec.x = 0; rec.z = 15; rec.mesh.position.set(0, 0, 15);
  // frame 1: partial dip (rate-limited)
  updateCameraOccluders(state, [rec], CAM, FOCUS, 1 / 60, { playerId: 99 });
  const firstDip = rec.mesh.position.y;
  assert.ok(firstDip < 0, 'duck begins immediately');
  assert.ok(firstDip > -(220 / 60 + 0.01), 'first frame is rate-limited, not a teleport');
  // settle
  for (let i = 0; i < 240; i++) updateCameraOccluders(state, [rec], CAM, FOCUS, 1 / 60, { playerId: 99 });
  assert.ok(rec.mesh.position.y < firstDip, 'duck deepens');
  const settled = rec.mesh.position.y;
  // Move the rock out of the corridor — it must ease back up, then restore y = 0 exactly.
  rec.x = 300;
  rec.mesh.position.x = 300;
  for (let i = 0; i < 600 && rec.mesh.position.y !== 0; i++) {
    updateCameraOccluders(state, [rec], CAM, FOCUS, 1 / 60, { playerId: 99 });
  }
  assert.equal(rec.mesh.position.y, 0, 'released body returns to the plane');
  assert.equal(cameraOccluderDiagnostics(state).entries.length, 0, 'entry purged once flat');
});

test('candidate gate: the player, tiny bodies and landmark-scale bodies never duck', () => {
  assert.equal(occluderDuckCandidate({ id: 1, type: 'asteroid', radius: OCCLUDER_MIN_RADIUS }), true);
  assert.equal(occluderDuckCandidate({ id: 2, type: 'asteroid', radius: OCCLUDER_MIN_RADIUS - 1 }), false);
  assert.equal(occluderDuckCandidate({ id: 3, type: 'asteroid', radius: OCCLUDER_MAX_RADIUS + 1 }), false);
  assert.equal(occluderDuckCandidate({ id: 4, type: 'pickup', radius: 30 }), false);
  assert.equal(occluderDuckCandidate({ id: 5, type: 'payload', radius: 30 }), true);
  assert.equal(occluderDuckCandidate({ id: 6, type: 'wreck', radius: 60 }), true);
  assert.equal(occluderDuckCandidate({ id: 7, type: 'station', radius: 90 }), true);
  assert.equal(occluderDuckCandidate({ id: 8, type: 'asteroid', radius: 30, alive: false }), false);
});

test('the player entity itself is excluded by the caller id', () => {
  const state = createCameraOccluderState();
  const rec = record(99, 'ship', 20, 0, 60);
  for (let i = 0; i < 120; i++) updateCameraOccluders(state, [rec], CAM, FOCUS, 1 / 60, { playerId: 99 });
  assert.equal(rec.mesh.position.y, 0);
});

test('sinkByOwner maps owner roots to depths for the authored-instance path', () => {
  const state = createCameraOccluderState();
  const rec = record(7, 'asteroid', 30, 0, 30);
  for (let i = 0; i < 240; i++) updateCameraOccluders(state, [rec], CAM, FOCUS, 1 / 60, { playerId: 99 });
  const sink = state.sinkByOwner.get(rec.mesh);
  assert.equal(sink, cameraOccluderDiagnostics(state).entries[0].dip);
});

test('renderer wiring: duck runs after cam.follow and reaches both instanced paths', () => {
  const followIdx = RENDERER_SRC.indexOf('this.cam.follow(frameDt, alpha, presented');
  const occluderIdx = RENDERER_SRC.indexOf('this._updateCameraOccluders(frameDt)');
  const authoredIdx = RENDERER_SRC.indexOf('this._syncAuthoredInstanceSubmission(shadowRadius)');
  const asteroidIdx = RENDERER_SRC.lastIndexOf('this._syncAsteroidInstanceSubmission(shadowCamera)');
  assert.ok(followIdx > 0 && occluderIdx > followIdx, 'occluder update runs after the camera settles');
  assert.ok(authoredIdx > occluderIdx && asteroidIdx > occluderIdx,
    'both instanced submissions run after the duck writes root positions');
  assert.ok(RENDERER_SRC.includes('options.occluderSinks'),
    'authored pool receives the owner-sink map');
  assert.ok(RENDERER_SRC.includes('invalidateAsteroidInstancePool(this._asteroidInstancePool)'),
    'asteroid pool is invalidated when sinks move');
  assert.ok(PARTS_SRC.includes('context.occluderSinks') && PARTS_SRC.includes('ownerState.occluderSink'),
    'partsLibrary consumes the sink map to break the clean-frame early-out');
  assert.ok(POOL_SRC.includes('updateWorldMatrix(true, true)'),
    'asteroid pool recomposes owner roots — the duck rides root.position');
});

test('no per-frame allocations: the corridor test and sink map reuse retained state', () => {
  const src = readFileSync(join(ROOT, 'src/render/cameraOccluders.js'), 'utf8');
  // The per-record loop must not build objects; entries/record hits are reused module scratch.
  const body = src.slice(src.indexOf('export function updateCameraOccluders'));
  assert.ok(!body.includes('new THREE'), 'no per-frame THREE construction in the update');
  assert.ok(!body.includes('=> new '), 'no per-record allocation in the update');
});
