import assert from 'node:assert/strict';
import test from 'node:test';
import { createInfrastructureMotionTracker } from '../src/render/infrastructureMotion.js';

function createMockGateMesh() {
  const innerRing = { rotation: { z: 0 } };
  const portal = {
    rotation: { z: 0 },
    scale: { setScalar(s) { this.val = s; }, val: 1 },
  };
  const hubGlow = {
    scale: { setScalar(s) { this.val = s; }, val: 1 },
  };
  return {
    userData: { innerRing, portal, hubGlow },
    children: [innerRing, portal, hubGlow],
  };
}

function createMockStationMesh() {
  const ring1 = { rotation: { z: 0 } };
  const ring2 = { name: 'station_ring2', rotation: { z: 0 } };
  return {
    userData: { ring1 },
    children: [ring1, ring2],
  };
}

function createMockWreckMesh() {
  const body = {
    rotation: { x: 0, y: 0, z: 0 },
  };
  return {
    children: [body],
  };
}

test('infrastructure motion: jump gate counter-rotation and portal swirl', () => {
  const tracker = createInfrastructureMotionTracker();
  const mesh = createMockGateMesh();
  const gate = { id: 'gate_sol', pos: { x: 500, z: 500 } };

  tracker.updateGateMotion(gate, mesh, 1.0, 0.016, null);
  const r1 = mesh.userData.innerRing.rotation.z;
  const p1 = mesh.userData.portal.rotation.z;

  tracker.updateGateMotion(gate, mesh, 1.05, 0.05, null);
  const r2 = mesh.userData.innerRing.rotation.z;
  const p2 = mesh.userData.portal.rotation.z;

  assert.notEqual(r1, r2, 'inner ring rotated');
  assert.notEqual(p1, p2, 'portal swirled');
  assert.ok((r2 - r1) * (p2 - p1) < 0, 'inner ring and portal counter-rotate opposite directions');
});

test('infrastructure motion: player ship approach surges jump gate vortex', () => {
  const tracker = createInfrastructureMotionTracker();
  const meshFar = createMockGateMesh();
  const meshNear = createMockGateMesh();
  const gate = { id: 'gate_centauri', pos: { x: 0, z: 0 } };

  const playerFar = { pos: { x: 900, z: 900 } };
  const playerNear = { pos: { x: 30, z: 30 } }; // close to gate

  tracker.updateGateMotion(gate, meshFar, 1.0, 0.05, playerFar);
  tracker.updateGateMotion(gate, meshNear, 1.0, 0.05, playerNear);

  assert.ok(
    Math.abs(meshNear.userData.portal.rotation.z) > Math.abs(meshFar.userData.portal.rotation.z),
    'approach accelerates portal swirl speed',
  );
});

test('infrastructure motion: space station habitation centrifuges rotate continuously', () => {
  const tracker = createInfrastructureMotionTracker();
  const mesh = createMockStationMesh();
  const station = { id: 'station_ceres', pos: { x: 0, z: 0 } };

  tracker.updateStationMotion(station, mesh, 1.0, 0.016);
  const r1 = mesh.userData.ring1.rotation.z;
  const r2 = mesh.children[1].rotation.z;

  tracker.updateStationMotion(station, mesh, 1.1, 0.1);
  const r1After = mesh.userData.ring1.rotation.z;
  const r2After = mesh.children[1].rotation.z;

  assert.notEqual(r1, r1After, 'habitation ring 1 rotated');
  assert.notEqual(r2, r2After, 'secondary ring 2 counter-rotated');
});

test('infrastructure motion: derelict wrecks drift with zero-G angular momentum', () => {
  const tracker = createInfrastructureMotionTracker();
  const mesh = createMockWreckMesh();
  const wreck = { id: 'wreck_hulk_44', pos: { x: 200, z: 200 } };

  tracker.updateWreckMotion(wreck, mesh, 2.0, 0.016);
  const rx1 = mesh.children[0].rotation.x;
  const ry1 = mesh.children[0].rotation.y;

  tracker.updateWreckMotion(wreck, mesh, 2.5, 0.5);
  const rx2 = mesh.children[0].rotation.x;
  const ry2 = mesh.children[0].rotation.y;

  assert.notEqual(rx1, rx2, 'wreck drifts around X');
  assert.notEqual(ry1, ry2, 'wreck drifts around Y');
});

test('renderer reduced-motion option reaches gates, stations and wrecks', () => {
  const tracker = createInfrastructureMotionTracker();
  const gate = { id: 'gate_reduce', pos: { x: 500, z: 500 } }, gateMesh = createMockGateMesh();
  tracker.updateGateMotion(gate, gateMesh, 1, 0.05, null, { reducedMotion: false });
  const g0 = gateMesh.userData.innerRing.rotation.z;
  tracker.updateGateMotion(gate, gateMesh, 1.05, 0.05, null, { reducedMotion: true, motionReduce: false });
  const g1 = gateMesh.userData.innerRing.rotation.z;
  tracker.updateGateMotion(gate, gateMesh, 1.1, 0.05, null, { reducedMotion: false, motionReduce: true });
  const g2 = gateMesh.userData.innerRing.rotation.z;
  assert.ok(Math.abs((g1 - g0) / (g2 - g1) - 0.3) < 1e-9, 'gate slows and resumes');

  const station = { id: 'station_reduce', pos: { x: 0, z: 0 } }, stationMesh = createMockStationMesh();
  tracker.updateStationMotion(station, stationMesh, 1, 0.05, { reducedMotion: false });
  const ring = stationMesh.userData.ring1.rotation.z;
  tracker.updateStationMotion(station, stationMesh, 1.05, 0.05, { reducedMotion: true, motionReduce: false });
  assert.equal(stationMesh.userData.ring1.rotation.z, ring);
  tracker.updateStationMotion(station, stationMesh, 1.1, 0.05, { reducedMotion: false, motionReduce: true });
  assert.notEqual(stationMesh.userData.ring1.rotation.z, ring);

  const wreck = { id: 'wreck_reduce', pos: { x: 0, z: 0 } }, wreckMesh = createMockWreckMesh();
  tracker.updateWreckMotion(wreck, wreckMesh, 1, 0.05, { reducedMotion: false });
  const x = wreckMesh.children[0].rotation.x;
  tracker.updateWreckMotion(wreck, wreckMesh, 1.05, 0.05, { reducedMotion: true, motionReduce: false });
  assert.equal(wreckMesh.children[0].rotation.x, x);
  tracker.updateWreckMotion(wreck, wreckMesh, 1.1, 0.05, { reducedMotion: false, motionReduce: true });
  assert.notEqual(wreckMesh.children[0].rotation.x, x);
});
