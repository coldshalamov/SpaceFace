import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
  CameraDirectorMode,
  createCameraDirector,
} from '../src/render/cameraDirector.js';
import { createChaseCamera } from '../src/render/camera.js';

const FOV = 50;
const ASPECT = 16 / 9;
const TILT = Math.PI / 3;

function fixture() {
  // Gauntlet seed 4242, round 3: a Space latch at sim 213.267 moved the
  // living player's hull below the screen while this long pair exceeded 330 WU zoom.
  const player = { id: 1, type: 'ship', alive: true, hull: 260, team: 0,
    radius: 12, pos: { x: -232, z: -5351 }, vel: { x: -14, z: -27 }, rot: 0 };
  const target = { id: 395, type: 'ship', alive: true, hull: 100, team: 1,
    radius: 9, pos: { x: -141, z: -4994 }, vel: { x: 0, z: 0 },
    data: { encounter: { id: 'gauntlet' } } };
  const state = { mode: 'flight', playerId: player.id, simTime: 213.267,
    entities: new Map([[player.id, player], [target.id, target]]), entityList: [player, target],
    player: { heat: 0, tether: { active: true, targetId: target.id } } };
  return { player, target, state };
}

function assertHullVisible(camera, position, radius, label) {
  for (const [dx, dy, dz] of [[0, 0, 0], [-radius, 0, 0], [radius, 0, 0],
    [0, radius, 0], [0, -radius, 0], [0, 0, -radius], [0, 0, radius]]) {
    const ndc = new THREE.Vector3(position.x + dx, dy, position.z + dz).project(camera);
    assert.ok(Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1,
      `${label}: hull sample must remain in frame, got NDC ${ndc.x}, ${ndc.y}, ${ndc.z}`);
  }
}

test('overflowing combat tether keeps the player visible throughout acquisition and the held line', () => {
  const { player, target, state } = fixture();
  const director = createCameraDirector();
  director.syncFollow(player.pos.x, player.pos.z, 144);
  const view = { followX: player.pos.x, followZ: player.pos.z, followZoom: 144,
    fov: FOV, aspect: ASPECT, tiltDeg: 60 };
  const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 1, 14000);
  for (let frame = 0; frame < 40; frame++) {
    const result = director.step(1 / 15, state, player, view);
    assert.equal(result.mode, CameraDirectorMode.TETHER_PAIR);
    assert.equal(result.targetId, target.id);
    assert.ok(result.requiredZoom > CAMERA_DIRECTOR_ENGINE_MAX_ZOOM,
      'fixture must exceed the physical pair framing envelope');
    assert.ok(result.zoom <= CAMERA_DIRECTOR_ENGINE_MAX_ZOOM, 'keep the existing zoom ceiling');
    camera.position.set(result.focusX, result.zoom * Math.sin(TILT),
      result.focusZ - result.zoom * Math.cos(TILT));
    camera.lookAt(result.focusX, 0, result.focusZ);
    camera.updateMatrixWorld(true);
    assertHullVisible(camera, player.pos, player.radius, `frame ${frame}`);
  }
});

test('live tether framing contains the drawn player position when a publication trails the simulation', () => {
  const { player, state } = fixture();
  const priorWindow = globalThis.window;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    state.settings = { video: { fov: FOV } };
    state.camera = { zoom: 144, tilt: 60, lookAhead: 0, lerp: 6, trauma: 0 };
    state.input = { aimWorld: null };
    state.render = {};
    const camera = createChaseCamera(state);
    camera.snapToPlayer();
    const drawn = { x: player.pos.x - 40, z: player.pos.z - 100 };
    const originalPosition = { ...player.pos };
    for (let frame = 0; frame < 40; frame++) {
      camera.follow(1 / 15, 1, drawn);
      camera.obj.updateMatrixWorld(true);
      assertHullVisible(camera.obj, drawn, player.radius, `drawn frame ${frame}`);
    }
    assert.deepEqual(player.pos, originalPosition, 'camera geometry never rewrites simulation poses');
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});
