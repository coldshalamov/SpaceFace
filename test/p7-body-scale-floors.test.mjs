// P7 (board row 58) — body-scale bars hold across zoom/speed: the floors at the edges.
//
// build_map §25 phase 1 closes on `probe:body-scale`: player hull p10 ≥ 48 px calm / 36 px
// fight / 28 px top speed (probe viewport 1920x1080). The probe's first slice
// (scripts/probe-body-scale.mjs + scripts/lib/bodyScaleStats.mjs + camera.js zoomDiagnostics)
// samples the live browser; this pin drives the REAL chase camera headlessly along the same
// seam and holds the floors at the EDGES of the envelope, where they are closest to breaking:
// the zoom clamps, the top-speed frame, boost stacked on top, and the widest ordinary frame
// there is (330 * 1.35 * 1.10). The measured quantity is the probe's collision-body width —
// the measure that cannot be fooled by scene structure — computed with the probe's own
// projection math against the live camera. Deterministic: fixed seed-free scene, no rng.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  CHASE_ZOOM_DEFAULT,
  SPEED_ZOOM_MAX,
  SPEED_ZOOM_MIN,
  createChaseCamera,
} from '../src/render/camera.js';

const VIEW_W = 1920;
const VIEW_H = 1080;

function makeState() {
  if (!globalThis.window) globalThis.window = { innerWidth: VIEW_W, innerHeight: VIEW_H };
  globalThis.window.innerWidth = VIEW_W;
  globalThis.window.innerHeight = VIEW_H;
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 14, maxSpeed: 172.07, flags: {},
  };
  const state = {
    playerId: player.id,
    tick: 0,
    entities: new Map([[player.id, player]]),
    player: { tether: { active: false, targetId: null } },
    camera: { zoom: CHASE_ZOOM_DEFAULT, tilt: 60, lookAhead: 0, lerp: 6, trauma: 0 },
    settings: { video: { fov: 50 } },
    render: {},
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    input: { aimWorld: null },
  };
  return { state, player };
}

/** The probe's collision-body measure (scripts/probe-body-scale.mjs bodyPxOf), verbatim. */
function bodyPxOf(ctrl, pos, radius) {
  const cam = ctrl.obj;
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  right.y = 0;
  if (right.lengthSq() > 1e-12) right.normalize();
  else right.set(1, 0, 0);
  const a = new THREE.Vector3(pos.x + right.x * radius, pos.y, pos.z + right.z * radius).project(cam);
  const b = new THREE.Vector3(pos.x - right.x * radius, pos.y, pos.z - right.z * radius).project(cam);
  if (a.z > 1 || b.z > 1) return null;
  const ax = (a.x * 0.5 + 0.5) * VIEW_W;
  const ay = (-a.y * 0.5 + 0.5) * VIEW_H;
  const bx = (b.x * 0.5 + 0.5) * VIEW_W;
  const by = (-b.y * 0.5 + 0.5) * VIEW_H;
  return Math.hypot(ax - bx, ay - by);
}

/** Settle the frame: enough steps for the speed EMA, zoom damping and the 330 wu/s rate cap. */
function settle(cam, seconds = 8) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) cam.follow(1 / 60);
}

test('calm at the default zoom the body clears the calm floor with room', () => {
  const { state, player } = makeState();
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  settle(cam, 4);
  const px = bodyPxOf(cam, player.pos, player.radius);
  assert.ok(Number.isFinite(px) && px > 0);
  assert.ok(px >= 48, `calm body ${px.toFixed(1)}px must hold the 48px calm floor`);
  assert.ok(
    cam.zoomDiagnostics().speedZoomFactor <= SPEED_ZOOM_MIN + 0.01,
    'idle settles to the tight end of the speed band',
  );
});

test('the zoom clamps hold and the widest manual frame still clears the bar floor', () => {
  const { state, player } = makeState();
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  // Tightest edge: the clamp keeps the request inside the authored band.
  cam.setZoom(1);
  assert.equal(cam.zoomDiagnostics().requestedZoom, CAMERA_ZOOM_MIN);
  settle(cam, 4);
  const tight = bodyPxOf(cam, player.pos, player.radius);
  // Widest edge: 330, the expansive manual zoom-out.
  cam.setZoom(9999);
  assert.equal(cam.zoomDiagnostics().requestedZoom, CAMERA_ZOOM_MAX);
  settle(cam, 8);
  const wide = bodyPxOf(cam, player.pos, player.radius);
  assert.ok(Number.isFinite(tight) && Number.isFinite(wide));
  assert.ok(tight > wide, 'a wider frame is a smaller body — the monotone law');
  assert.ok(wide >= 28, `widest manual body ${wide.toFixed(1)}px must hold the 28px bar floor`);
});

test('top speed opens the authored band and the body still clears the top-speed floor', () => {
  const { state, player } = makeState();
  player.vel.x = 5000; // far above any governed cap: the ordinary curve saturates
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  settle(cam, 8);
  const diag = cam.zoomDiagnostics();
  assert.ok(
    Math.abs(diag.speedZoomFactor - SPEED_ZOOM_MAX) < 0.01,
    `the top-speed frame is the band's wide end (factor ${diag.speedZoomFactor})`,
  );
  const px = bodyPxOf(cam, player.pos, player.radius);
  assert.ok(px >= 28, `top-speed body ${px.toFixed(1)}px must hold the 28px floor`);
  // The distance the factor bought is exactly the authored product, never a surprise.
  assert.ok(diag.composedZoom <= CHASE_ZOOM_DEFAULT * SPEED_ZOOM_MAX + 1);
});

test('boost stacked on the widest top-speed frame — the widest ordinary edge — still holds', () => {
  const { state, player } = makeState();
  player.vel.x = 5000;
  player.flags.boosting = true;
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  cam.setZoom(9999);
  settle(cam, 10);
  const diag = cam.zoomDiagnostics();
  const px = bodyPxOf(cam, player.pos, player.radius);
  assert.ok(Number.isFinite(px) && px > 0);
  // The widest frame the ordinary game can compose, and its body on the glass.
  assert.ok(
    diag.composedZoom <= CAMERA_ZOOM_MAX * SPEED_ZOOM_MAX * 1.10 + 1,
    `the composed edge is the authored product (composed ${diag.composedZoom.toFixed(1)})`,
  );
  assert.ok(px >= 28, `widest-edge body ${px.toFixed(1)}px must hold the 28px bar floor`);
});

test('the floors ride a monotone law: body px falls as the frame widens, never jumps', () => {
  const { state, player } = makeState();
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  let previous = Infinity;
  for (const zoom of [CAMERA_ZOOM_MIN, 80, CHASE_ZOOM_DEFAULT, 200, 280, CAMERA_ZOOM_MAX]) {
    cam.setZoom(zoom);
    settle(cam, 6);
    const px = bodyPxOf(cam, player.pos, player.radius);
    assert.ok(Number.isFinite(px), `body measurable at zoom ${zoom}`);
    assert.ok(
      px <= previous + 0.5,
      `zoom ${zoom}: body ${px.toFixed(1)}px must not exceed the tighter frame's ${previous.toFixed(1)}px`,
    );
    previous = px;
  }
});
