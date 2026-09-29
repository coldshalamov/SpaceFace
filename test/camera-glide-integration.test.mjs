/**
 * The real chase camera + the renderer's column roof query: flying through a station, the camera
 * anticipates, is never inside the hull volume, keeps looking at the ship, and settles back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createChaseCamera } from '../src/render/camera.js';
import { cameraClearanceFloorAt, cameraRoofAt } from '../src/render/renderer.js';

function solid(x, z, spanX, spanZ, height, kind = 'station') {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.userData.kind = kind;
  root.userData.authoredAssetState = 'authored';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(spanX, height, spanZ), new THREE.MeshBasicMaterial());
  mesh.position.y = height / 2;
  root.add(mesh);
  root.updateMatrixWorld(true);
  return root;
}

function ownerWith(...meshes) {
  const map = new Map();
  meshes.forEach((m, i) => map.set(i + 1, m));
  return { _meshes: map, _meshesVersion: 1 };
}

test('cameraRoofAt answers any column, not only the camera column', () => {
  const owner = ownerWith(solid(0, 0, 300, 300, 180));
  assert.equal(cameraRoofAt(owner, 900, 0, 0), -Infinity);
  const over = cameraRoofAt(owner, 20, -30, 0);
  assert.ok(over >= 180 && over < 260, `roof of a 180 WU hull is about 180 + margin, got ${over}`);
  assert.equal(cameraRoofAt(owner, 20, -30, 0), over, 'repeat query is stable');
});

test('sweep padding catches a tower a sample would otherwise step over', () => {
  const owner = ownerWith(solid(0, 0, 60, 60, 200));
  assert.equal(cameraRoofAt(owner, 70, 0, 0), -Infinity, 'without pad the sample is beside the tower');
  assert.ok(cameraRoofAt(owner, 70, 0, 40) > 200, 'with the sweep pad the tower is seen');
});

test('mid-size solids now count (the old 120 WU span bar ignored them)', () => {
  const rock = solid(0, 0, 70, 70, 60, 'wreck');
  const owner = ownerWith(rock);
  assert.ok(cameraRoofAt(owner, 0, 0, 0) > 60, 'a 70 WU-wide, 60 WU-tall wreck is a roof at close zoom');
  const flat = ownerWith(solid(0, 0, 200, 200, 10));
  assert.equal(cameraRoofAt(flat, 0, 0, 0), -Infinity, 'a solid that never reaches chase height is not a roof');
  const tiny = ownerWith(solid(0, 0, 20, 20, 30, 'wreck'));
  assert.equal(cameraRoofAt(tiny, 0, 0, 0), -Infinity, 'a skiff-sized body cannot swallow the camera');
});

test('a drifting mid-size field rock is a roof without re-measuring its mesh', () => {
  const rock = solid(0, 0, 70, 70, 60, 'asteroid');
  rock.userData.asteroidBody = { scale: { x: 30 } };
  const owner = ownerWith(rock);
  const roof = cameraRoofAt(owner, 5, 5, 0);
  assert.ok(roof > 36 && roof < 100, `rock roof from its authored scale, got ${roof}`);
  rock.position.x = 400;
  rock.updateMatrixWorld(true);
  assert.equal(cameraRoofAt(owner, 5, 5, 0), -Infinity, 'follows the rock when it drifts away');
  assert.ok(cameraRoofAt(owner, 402, 0, 0) > 36, 'and finds it at its new place');
});

test('cameraRoofAt agrees with the legacy floor query where both apply', () => {
  const owner = ownerWith(solid(0, 0, 300, 300, 180));
  const legacy = cameraClearanceFloorAt(owner, 10, 10, 20);
  assert.equal(cameraRoofAt(owner, 10, 10, 0), legacy);
});

function chaseHarness() {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: -1500 }, prevPos: { x: 0, z: -1500 },
    vel: { x: 0, z: 0 }, rot: 0, bank: 0, radius: 6, mass: 24,
    flags: { boosting: false }, maxSpeed: 320,
  };
  const state = {
    settings: { video: { fov: 50, motionReduce: false } },
    camera: { zoom: 144, tilt: 60, lerp: 18, lookAhead: 0 },
    input: { actions: {} },
    entities: new Map([[1, player]]),
    playerId: 1,
    player: { tether: null },
    render: { interpolationAlpha: 1 },
    combat: {},
  };
  const cam = createChaseCamera(state, { innerWidth: 1280, innerHeight: 720 });
  return { state, player, cam };
}

test('chase camera flying through a station: never inside, keeps its aim, settles back', () => {
  const owner = ownerWith(solid(0, 0, 440, 440, 210));
  const clearanceAt = (x, z, y) => cameraClearanceFloorAt(owner, x, z, y);
  clearanceAt.roofAt = (x, z, pad) => cameraRoofAt(owner, x, z, pad);
  const { state, player, cam } = chaseHarness();
  const dt = 1 / 60;
  const speed = 260;
  cam.follow(0, 1, undefined, clearanceAt);
  const baseY = cam.obj.position.y;
  assert.ok(baseY > 100 && baseY < 160, `default framing height, got ${baseY}`);

  let inside = 0;
  let peakY = baseY;
  let sawRiseBeforeWall = false;
  const dir = new THREE.Vector3();
  for (let i = 0; i < 60 * 14; i++) {
    player.prevPos.x = player.pos.x;
    player.prevPos.z = player.pos.z;
    player.pos.z += speed * dt;
    player.vel.z = speed;
    cam.follow(dt, 1, undefined, clearanceAt);
    const p = cam.obj.position;
    const floor = cameraRoofAt(owner, p.x, p.z, 0);
    if (floor > -Infinity && p.y < floor - 1e-3) inside++;
    peakY = Math.max(peakY, p.y);
    if (cam.obj.position.z < -230 && p.y > baseY + 15) sawRiseBeforeWall = true;
    if (i === 60 * 7) {
      cam.obj.getWorldDirection(dir);
      assert.ok(dir.y < -0.7, 'still looking steeply down at the ship');
    }
  }
  assert.equal(inside, 0, 'camera was never inside the hull volume');
  assert.ok(peakY > 200, `camera really cleared a 210 WU hull (peak ${peakY.toFixed(0)})`);
  assert.ok(sawRiseBeforeWall, 'rose before the camera column reached the hull');
  assert.ok(state.camera.clearanceScale < 1.02, `dolly returned to the set framing (scale ${state.camera.clearanceScale.toFixed(3)})`);
});

