// 2026-09-25: a compounded asteroid scale made the renderer report a ~1.4e8 structure roof and
// the chase camera snapped to orbit (y≈139,426,817) — the world below the far plane gone. The
// camera-side guard: a clearance floor above the far plane is never adopted, and any lift
// already above it is dropped in one step instead of easing down at the release rate.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMERA_CLEARANCE_ADOPT_S,
  CAMERA_CLEARANCE_RELEASE_WU_S,
  createChaseCamera,
} from '../src/render/camera.js';

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

// b0806baf1 ("Keep the camera still while stations are loading"): a roof must hold
// CAMERA_CLEARANCE_ADOPT_S before the camera believes it, and the lift then eases in at
// CAMERA_CLEARANCE_RELEASE_WU_S instead of snapping — the same hold releases the floor when
// it goes absent. The first follow only seeds the candidate (age 0), so adoption lands on
// frame ceil(ADOPT_S / dt) + 1 and the climb needs ceil((floor − 0) / (RELEASE_WU_S * dt))
// further frames.
function clearancesToReach({ cam, clearanceAt, dt, targetY }) {
  const adoptFrames = Math.ceil(CAMERA_CLEARANCE_ADOPT_S / dt) + 1;
  const climbFrames = Math.ceil(targetY / (CAMERA_CLEARANCE_RELEASE_WU_S * dt));
  const bound = adoptFrames + climbFrames + 2;
  for (let i = 0; i < bound; i += 1) {
    cam.follow(dt, 1, undefined, clearanceAt);
    if (cam.obj.position.y >= targetY) return true;
  }
  return false;
}

test('a sane floor is adopted after its hold and the lift eases in, then eases back down', () => {
  const { cam } = chaseHarness();
  let floor = 300;
  const clearanceAt = () => floor;
  const dt = 0.05;
  cam.follow(dt, 1, undefined, clearanceAt);
  assert.ok(
    cam.obj.position.y < 300,
    `one frame must not snap to the floor — currently ${cam.obj.position.y}`,
  );
  assert.ok(
    clearancesToReach({ cam, clearanceAt, dt, targetY: 300 }),
    `300 floor must be reached inside the adopt+climb bound — currently ${cam.obj.position.y}`,
  );
  assert.equal(cam.obj.position.y, 300, 'a real structure roof still lifts the camera');
  floor = -Infinity;
  for (let i = 0; i < 40; i += 1) cam.follow(dt, 1, undefined, clearanceAt);
  assert.ok(
    cam.obj.position.y < 300 && cam.obj.position.y > 100,
    `camera eases down at the release rate, currently ${cam.obj.position.y}`,
  );
});

test('a broken floor arriving after a sane lift clears it instead of freezing it', () => {
  const { cam } = chaseHarness();
  let floor = 300;
  const clearanceAt = () => floor;
  const dt = 0.05;
  assert.ok(
    clearancesToReach({ cam, clearanceAt, dt, targetY: 300 }),
    `sane lift must be reached before the broken floor arrives — currently ${cam.obj.position.y}`,
  );
  floor = 1.4e8; // the broken-bound replay — must be refused, not inherited
  for (let i = 0; i < 40; i += 1) cam.follow(dt, 1, undefined, clearanceAt);
  assert.ok(
    cam.obj.position.y < 300,
    `a refused floor must not pin the lift — currently ${cam.obj.position.y}`,
  );
});
