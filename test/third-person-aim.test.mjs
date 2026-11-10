import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { render } from '../src/render/renderer.js';
import { input } from '../src/systems/input.js';
import { createBus } from '../src/core/eventBus.js';

const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} != ${b}`);
function cameraHost(yaw = 0, origin = { x: 700, z: -900 }) {
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  cam.position.set(origin.x - fx * 58, 22, origin.z - fz * 58);
  cam.lookAt(origin.x + fx * 36, 0, origin.z + fz * 36);
  const host = Object.assign(Object.create(render), { cam: { obj: cam }, _frameMembrane: null });
  return { host, cam, origin, fx, fz };
}

test('cursor above the chase horizon keeps a finite forward aim at every heading', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { host, cam, origin, fx, fz } = cameraHost(yaw);
    for (const x of [-0.7, 0, 0.7]) {
      const out = {};
      assert.equal(host.raycastToPlane({ x, y: 1 }, out), out);
      const dx = out.x - origin.x, dz = out.z - origin.z;
      assert.ok(Number.isFinite(dx) && Number.isFinite(dz));
      assert.ok(dx * fx + dz * fz > 1000, 'sky cursor aims down the course, not at world origin');
      const lateral = -fz * dx + fx * dz;
      assert.ok(x === 0 ? Math.abs(lateral) < 1e-6 : lateral * x > 0, 'cursor side is preserved');
      assert.ok(Math.hypot(out.x - cam.position.x, out.z - cam.position.z) <= cam.far + 1e-6);
    }
  }
});

test('ordinary plane hits are exact and horizon aim survives floating-origin rebases', () => {
  const { host, cam } = cameraHost(0);
  const ndc = { x: 0.2, y: -0.3 };
  cam.updateMatrixWorld();
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
  const expected = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  const actual = host.raycastToPlane(ndc);
  near(actual.x, expected.x, 'ordinary hit x'); near(actual.z, expected.z, 'ordinary hit z');
  const before = host.raycastToPlane({ x: 0.2, y: 1 });
  const shift = { x: 11000, z: -23000 };
  cam.position.x -= shift.x; cam.position.z -= shift.z;
  host._frameMembrane = { toGlobal: (p, out) => Object.assign(out, { x: p.x + shift.x, z: p.z + shift.z }) };
  const after = host.raycastToPlane({ x: 0.2, y: 1 });
  near(before.x, after.x, 'rebased horizon x'); near(before.z, after.z, 'rebased horizon z');
});

test('plane picking updates a turned camera before the next rendered frame', () => {
  const { host, cam, origin } = cameraHost(0);
  host.raycastToPlane({ x: 0, y: 0 });
  cam.position.set(origin.x, 22, origin.z - 58);
  cam.lookAt(origin.x, 0, origin.z + 36);
  const hit = host.raycastToPlane({ x: 0, y: 1 });
  near(hit.x, origin.x, 'turn follows new camera x');
  assert.ok(hit.z > origin.z + 1000, 'new camera matrices drive the aiming ray');
});

function padFixture(yaw, view, touch = false) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pad = { connected: true, id: 'chase aim test', index: 0, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => touch ? [] : [pad] } });
  const { host } = cameraHost(yaw, { x: 0, z: 0 });
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: yaw + 0.4, data: {} };
  const state = { mode: 'flight', tick: 1, simTime: 0, entities: new Map([[1, player]]), playerId: 1, player: {},
    settings: { gameplay: { controlScheme: 'pilot', steeringView: view }, controls: {
      bindings: {}, gamepad: { enabled: true, deadzone: 0.1, responseCurve: 'linear' }, touch: { enabled: false } } },
    input: { autoFire: true, actions: {}, aimWorld: { x: 0, z: 0 }, mouseNdc: { x: 0, y: 0 } } };
  const owner = Object.create(input);
  owner.init({ state, bus: createBus(), helpers: {
    raycastToPlane: (ndc, out) => host.raycastToPlane(ndc, out),
    screenToWorldDirection: (axes, out) => host.screenToWorldDirection(axes, out),
  } });
  owner.update(1 / 60, state);
  if (touch) {
    owner.touch = { enabled: true, axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 }, actions: {},
      tick() {}, destroy() {}, isConnected: () => true, lastActiveTick: 10, lastActiveSeq: 10 };
  }
  return { state, owner, pad, aim(x, y) {
    state.tick++; state.simTime += 1 / 60;
    if (touch) { owner.touch.axes.rightX = x; owner.touch.axes.rightY = y; }
    else { pad.axes[2] = x; pad.axes[3] = y; }
    owner.update(1 / 60, state);
    return state.input;
  }, dispose() { owner.destroy(); if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator; } };
}

for (const touch of [false, true]) {
  test(`${touch ? 'touch' : 'gamepad'} aim follows the live stern camera and preserves raw device axes`, () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const f = padFixture(yaw, 'racing', touch);
      try {
        for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const aim = f.aim(x, y);
          const wantX = Math.cos(yaw) * -y - Math.sin(yaw) * x;
          const wantZ = Math.sin(yaw) * -y + Math.cos(yaw) * x;
          near(Math.cos(aim.aimAngle), wantX, 'camera-relative aim x');
          near(Math.sin(aim.aimAngle), wantZ, 'camera-relative aim z');
          const axes = touch ? f.owner.touch.axes : f.owner.gamepad.axes;
          near(axes.rightX, x, 'raw device x'); near(axes.rightY, y, 'raw device y');
          if (!touch) {
            near(aim.autoTargetVector.worldX, wantX, 'draw-to-fly x');
            near(aim.autoTargetVector.worldZ, wantZ, 'draw-to-fly z');
          }
        }
      } finally { f.dispose(); }
    }
  });
}

test('overhead right-stick aim retains its existing world-axis contract', () => {
  const f = padFixture(Math.PI, 'overhead');
  try {
    near(f.aim(1, 0).aimAngle, 0, 'overhead right');
    near(f.aim(0, -1).aimAngle, Math.PI / 2, 'overhead up');
  } finally { f.dispose(); }
});

test('twin-stick drive and aim share the chase basis without changing overhead steering', () => {
  for (const view of ['racing', 'overhead']) {
    const f = padFixture(0, view);
    try {
      f.state.settings.controls.gamepad.scheme = 'twinstick';
      f.state.input.autoFire = false;
      f.pad.axes[0] = 0; f.pad.axes[1] = -1;
      const inp = f.aim(0, -1), p = f.state.entities.get(1);
      const worldX = inp.moveZ * Math.cos(p.rot) - inp.moveX * Math.sin(p.rot);
      const worldZ = inp.moveZ * Math.sin(p.rot) + inp.moveX * Math.cos(p.rot);
      near(worldX, view === 'racing' ? 1 : 0, 'drive vector x');
      near(worldZ, view === 'racing' ? 0 : 1, 'drive vector z');
    } finally { f.dispose(); }
  }
});
