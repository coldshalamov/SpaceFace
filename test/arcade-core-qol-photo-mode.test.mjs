import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHOTO_MODE_MOVE_SPEED_DEFAULT,
  PHOTO_MODE_MOVE_SPEED_MAX,
  PHOTO_MODE_MOVE_SPEED_MIN,
  createChaseCamera,
} from '../src/render/camera.js';
import { routePhotoModeKey } from '../src/ui/screens/photoMode.js';

function makeFixture() {
  const player = {
    id: 7,
    type: 'ship',
    alive: true,
    hull: 100,
    team: 0,
    pos: { x: 12, z: -8 },
    vel: { x: 3, z: -2 },
    radius: 6,
    maxSpeed: 120,
    bank: 0,
    flags: {},
    data: {},
  };
  const state = {
    simTime: 42.25,
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    player: {
      cruise: null,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    settings: {
      video: { fov: 50, motionReduce: false },
      accessibility: { motionPreference: 'system' },
    },
    camera: { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    combat: { attachments: { byId: {} } },
  };
  const controller = createChaseCamera(state);
  controller.snapToPlayer();
  return { state, player, controller };
}

test('photo mode moves only the renderer-owned camera while gameplay state stays frozen', () => {
  const priorWindow = globalThis.window;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  try {
    const { state, player, controller } = makeFixture();
    const playerBefore = structuredClone({ pos: player.pos, vel: player.vel });
    const simTimeBefore = state.simTime;
    const cameraBefore = controller.photoModeState();

    assert.equal(controller.enterPhotoMode(), true);
    assert.equal(controller.enterPhotoMode(), false, 'enter is idempotent');
    assert.equal(controller.photoModeState().moveSpeed, PHOTO_MODE_MOVE_SPEED_DEFAULT);
    assert.equal(controller.setPhotoModeAction('forward', true), true);
    assert.equal(controller.setPhotoModeAction('right', true), true);
    assert.equal(controller.setPhotoModeAction('up', true), true);
    assert.equal(controller.setPhotoModeAction('fast', true), true);
    for (let i = 0; i < 60; i += 1) controller.follow(1 / 60);

    const cameraAfter = controller.photoModeState();
    assert.equal(cameraAfter.active, true);
    assert.ok(Math.hypot(
      cameraAfter.x - cameraBefore.x,
      cameraAfter.y - cameraBefore.y,
      cameraAfter.z - cameraBefore.z,
    ) > 100, 'held photo controls move the presentation camera');
    assert.deepEqual({ pos: player.pos, vel: player.vel }, playerBefore, 'player physics is untouched');
    assert.equal(state.simTime, simTimeBefore, 'camera stepping never advances simulation time');

    controller.addPhotoModeLook(800, 100000);
    const looked = controller.photoModeState();
    assert.notEqual(looked.yaw, cameraAfter.yaw);
    assert.ok(Math.abs(looked.pitch) < Math.PI / 2, 'pitch stays shy of the pole');
    controller.adjustPhotoModeSpeed(1000);
    assert.equal(controller.photoModeState().moveSpeed, PHOTO_MODE_MOVE_SPEED_MAX);
    controller.adjustPhotoModeSpeed(-1000);
    assert.equal(controller.photoModeState().moveSpeed, PHOTO_MODE_MOVE_SPEED_MIN);

    assert.equal(controller.exitPhotoMode(), true);
    assert.equal(controller.exitPhotoMode(), false, 'exit is idempotent');
    assert.equal(controller.photoModeState().active, false);
    assert.deepEqual({ pos: player.pos, vel: player.vel }, playerBefore);
    assert.equal(state.simTime, simTimeBefore);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test('photo mode key routing stays bounded to authored presentation actions', () => {
  const calls = [];
  const controller = {
    setPhotoModeAction(action, active) {
      calls.push([action, active]);
      return true;
    },
  };

  assert.equal(routePhotoModeKey(controller, { code: 'KeyW' }, true), true);
  assert.equal(routePhotoModeKey(controller, { code: 'ShiftLeft' }, true), true);
  assert.equal(routePhotoModeKey(controller, { code: 'ArrowDown' }, false), true);
  assert.equal(routePhotoModeKey(controller, { code: 'KeyR' }, true), false);
  assert.deepEqual(calls, [
    ['forward', true],
    ['fast', true],
    ['lookDown', false],
  ]);
});
