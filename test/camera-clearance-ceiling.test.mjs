// 2026-09-25: a compounded asteroid scale made the renderer report a ~1.4e8 structure roof and
// the chase camera snapped to orbit (y≈139,426,817) — the world below the far plane gone. The
// camera-side guard: a clearance floor above the far plane is never adopted, and any lift
// already above it is dropped in one step instead of easing down at the release rate.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createChaseCamera } from '../src/render/camera.js';

function chaseHarness() {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, prevPos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, bank: 0, radius: 6, mass: 24,
    flags: { boosting: false }, maxSpeed: 120,
  };
  const state = {
    settings: { video: { fov: 50, motionReduce: false } },
    camera: { zoom: 140, tilt: 60, lerp: 18, lookAhead: 0 },
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

test('a clearance floor above the far plane never lifts the chase camera', () => {
  const { cam } = chaseHarness();
  for (let i = 0; i < 10; i += 1) {
    cam.follow(0.05, 1, undefined, () => 1.4e8);
  }
  assert.ok(
    cam.obj.position.y < 1000,
    `camera must stay at chase altitude, not orbit at ${cam.obj.position.y}`,
  );
});

test('a sane floor still snaps up and eases back down', () => {
  const { cam } = chaseHarness();
  let floor = 300;
  const clearanceAt = () => floor;
  cam.follow(0.05, 1, undefined, clearanceAt);
  cam.follow(0.05, 1, undefined, clearanceAt);
  assert.equal(cam.obj.position.y, 300, 'a real structure roof still snaps the camera up');
  floor = -Infinity;
  for (let i = 0; i < 40; i += 1) cam.follow(0.05, 1, undefined, clearanceAt);
  assert.ok(
    cam.obj.position.y < 300 && cam.obj.position.y > 100,
    `camera eases down at the release rate, currently ${cam.obj.position.y}`,
  );
});

test('a broken floor arriving after a sane lift clears it instead of freezing it', () => {
  const { cam } = chaseHarness();
  let floor = 300;
  const clearanceAt = () => floor;
  cam.follow(0.05, 1, undefined, clearanceAt);
  assert.equal(cam.obj.position.y, 300);
  floor = 1.4e8; // the broken-bound replay — must be refused, not inherited
  for (let i = 0; i < 40; i += 1) cam.follow(0.05, 1, undefined, clearanceAt);
  assert.ok(
    cam.obj.position.y < 300,
    `a refused floor must not pin the lift — currently ${cam.obj.position.y}`,
  );
});
