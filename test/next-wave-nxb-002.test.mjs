// NXB-002 — the G-stick keeps its knob fraction through resize, zoom, and display density.
// A collapsed viewport and a corrupt packet command nothing and do not move the knob.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DYNAMIC_FLIGHT_STICK_TUNING,
  projectDynamicFlightStick,
  recordDynamicFlightStick,
  resetDynamicFlightStick,
} from '../src/systems/dynamicFlightStick.js';

function host(ray) {
  const player = { id: 'p', pos: { x: 0, z: 0 } };
  const state = {
    playerId: 'p',
    entities: { get: (id) => (id === 'p' ? player : null) },
    input: { autoFire: true },
  };
  return {
    state,
    helpers: {
      worldToScreen: () => ({ x: 500, y: 300 }),
      raycastToPlane: ray || ((n) => ({ x: n.x * 40, z: -n.y * 40 })),
    },
  };
}

function finiteVector(vector) {
  for (const key of ['screenX', 'screenY', 'worldX', 'worldZ', 'magnitude']) {
    assert.equal(Number.isFinite(vector[key]), true, key);
  }
}

test('NXB-002 the same knob fraction commands the same thrust after a resize', () => {
  const h = host();
  resetDynamicFlightStick(h, 400, 400);
  const smallRadius = h._autoTargetStick.radiusPx;
  assert.equal(smallRadius, DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx);
  assert.equal(recordDynamicFlightStick(h, smallRadius * 0.5, 0, 400, 400), true);
  const before = projectDynamicFlightStick(h, 400, 400);
  finiteVector(before);
  assert.ok(before.magnitude > 0.2);

  const px = h._autoTargetStick.xPx;
  const mid = projectDynamicFlightStick(h, 2000, 2000);
  const largeRadius = h._autoTargetStick.radiusPx;
  assert.equal(largeRadius, DYNAMIC_FLIGHT_STICK_TUNING.maxRadiusPx);
  assert.ok(Math.abs(h._autoTargetStick.xPx / largeRadius - px / smallRadius) < 1e-9);
  assert.ok(Math.abs(mid.screenX - before.screenX) < 1e-9);
  const ratio = mid.magnitude / before.magnitude;
  assert.ok(ratio > 0.9 && ratio < 1.1, 'resize does not amplify the command');
  finiteVector(mid);

  const heldPx = h._autoTargetStick.xPx;
  const again = projectDynamicFlightStick(h, 2000, 2000);
  assert.equal(h._autoTargetStick.xPx, heldPx);
  assert.equal(h._autoTargetStick.radiusPx, largeRadius);
  assert.equal(again.magnitude, mid.magnitude);
});

test('NXB-002 display density and camera zoom do not amplify or reuse a stale vector', () => {
  const h = host();
  resetDynamicFlightStick(h, 1000, 600);
  recordDynamicFlightStick(h, 80, 0, 1000, 600);
  const prevDpr = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 1 });
  const at1 = projectDynamicFlightStick(h, 1000, 600);
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 3 });
  const at3 = projectDynamicFlightStick(h, 1000, 600);
  if (prevDpr) Object.defineProperty(globalThis, 'devicePixelRatio', prevDpr);
  else delete globalThis.devicePixelRatio;
  assert.equal(at3.magnitude, at1.magnitude);
  assert.equal(at3.worldX, at1.worldX);
  assert.equal(at3.worldZ, at1.worldZ);
  assert.ok(at1.worldX > 0.1 && Math.abs(at1.worldZ) < 1e-8);

  h.helpers.raycastToPlane = (n) => ({ x: -n.y * 240, z: n.x * 240 });
  const zoomed = projectDynamicFlightStick(h, 1000, 600);
  assert.ok(Math.abs(zoomed.magnitude - at1.magnitude) < 1e-12);
  assert.ok(Math.abs(zoomed.worldX) < 1e-8 && zoomed.worldZ > 0.1);

  h.helpers.raycastToPlane = () => ({ x: NaN, z: 0 });
  const dropped = projectDynamicFlightStick(h, 1000, 600);
  finiteVector(dropped);
  assert.equal(dropped.active, false);
  assert.equal(dropped.worldX, 0);
  assert.equal(dropped.worldZ, 0);
  assert.notEqual(dropped.worldZ, zoomed.worldZ);
});

test('NXB-002 a collapsed viewport and a bad packet leave the knob where it was', () => {
  const h = host();
  resetDynamicFlightStick(h, 1000, 600);
  const neutral = projectDynamicFlightStick(h, 0, 0);
  finiteVector(neutral);
  assert.equal(neutral.magnitude, 0);
  assert.equal(neutral.active, false);
  const parked = { x: h._autoTargetStick.xPx, y: h._autoTargetStick.yPx, r: h._autoTargetStick.radiusPx };
  assert.equal(recordDynamicFlightStick(h, 40, 0, 0, 0), false);
  projectDynamicFlightStick(h, 1000, 600);
  assert.equal(projectDynamicFlightStick(h, 1000, 600).magnitude, 0);
  assert.equal(h._autoTargetStick.xPx, parked.x);
  assert.equal(h._autoTargetStick.radiusPx, parked.r);
  assert.equal(h.state.entities.get('p').pos.x, 0);

  const radius = h._autoTargetStick.radiusPx;
  assert.equal(recordDynamicFlightStick(h, radius * 0.5, 0, 1000, 600), true);
  const half = projectDynamicFlightStick(h, 1000, 600);
  const snapshot = { x: h._autoTargetStick.xPx, y: h._autoTargetStick.yPx, r: h._autoTargetStick.radiusPx };
  assert.equal(recordDynamicFlightStick(h, NaN, 10, 1000, 600), false);
  assert.equal(recordDynamicFlightStick(h, 5000, 0, 1000, 600), false);
  assert.equal(h._autoTargetStick.xPx, snapshot.x);
  assert.equal(h._autoTargetStick.yPx, snapshot.y);
  assert.equal(h._autoTargetStick.radiusPx, snapshot.r);
  const after = projectDynamicFlightStick(h, 1000, 600);
  assert.equal(after.magnitude, half.magnitude);
  assert.equal(after.worldX, half.worldX);
  assert.equal(after.screenX, half.screenX);

  const atRim = projectDynamicFlightStick(h, 1000, 600);
  h._autoTargetStick.xPx = radius;
  h._autoTargetStick.yPx = 0;
  const full = projectDynamicFlightStick(h, 1000, 600);
  assert.equal(recordDynamicFlightStick(h, -1, 0, 1000, 600), true);
  assert.ok(Math.abs(Math.hypot(h._autoTargetStick.xPx, h._autoTargetStick.yPx) - (radius - 1)) < 1e-6);
  const inward = projectDynamicFlightStick(h, 1000, 600);
  assert.ok(inward.magnitude < full.magnitude);
  assert.ok(inward.magnitude > 0);
  finiteVector(inward);
  assert.ok(atRim.magnitude > 0);
});
