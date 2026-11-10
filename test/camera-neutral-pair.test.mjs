import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CameraDirectorMode, createCameraDirector } from '../src/render/cameraDirector.js';

const VIEW = Object.freeze({
  followX: 0,
  followZ: 0,
  followZoom: 72,
  fov: 50,
  aspect: 16 / 9,
  tiltDeg: 60,
});

function frameFor(target, heat = 0) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    hull: 100,
    radius: 7,
    pos: { x: 0, z: 0 },
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player], [target.id, target]]),
    player: {
      heat,
      flybyFocus: { active: false, targetId: null },
      tether: { active: true, targetId: target.id },
    },
  };
  const director = createCameraDirector();
  director.syncFollow(0, 0, 72);
  let frame;
  for (let i = 0; i < 30; i++) frame = director.step(1 / 60, state, player, VIEW);
  return frame;
}

test('neutral traffic tether never enters combat pair framing', () => {
  const target = {
    id: 5,
    type: 'ship',
    alive: true,
    team: 2,
    hull: 100,
    radius: 10,
    pos: { x: 62, z: 0 },
    data: { ai: { passive: true, lawful: true } },
  };
  const frame = frameFor(target);
  assert.equal(frame.mode, CameraDirectorMode.FOLLOW);
  assert.equal(frame.targetId, null);
});

test('lawful patrol tether stays neutral while the player is not wanted', () => {
  const target = {
    id: 6,
    type: 'ship',
    alive: true,
    team: 1,
    hull: 100,
    radius: 9,
    pos: { x: 70, z: 0 },
    data: { ai: { lawful: true } },
  };
  const frame = frameFor(target, 0);
  assert.equal(frame.mode, CameraDirectorMode.FOLLOW);
  assert.equal(frame.targetId, null);
});
