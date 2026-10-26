import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CameraDirectorMode, createCameraDirector, bodyInsideDirectorFrame,
} from '../src/render/cameraDirector.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';

function fixture() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, hull: 100,
    radius: 8, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const target = { id: 2, type: 'ship', alive: true, team: 1, hull: 100,
    radius: 6, pos: { x: 60, z: 0 }, vel: { x: 70, z: 70 },
    data: { encounter: { id: 'inference26-throw' } } };
  const state = { mode: 'flight', tick: 0, simTime: 0, playerId: 1,
    entities: new Map([[1, player], [2, target]]), entityList: [player, target],
    player: { tether: { active: true, targetId: 2 },
      masslineImpacts: { tracking: true, slung: false, massId: 2, latest: null } } };
  const view = { followX: 0, followZ: 0, followZoom: 144,
    fov: 50, aspect: 16 / 9, tiltDeg: 60, maxZoom: 528 };
  const director = createCameraDirector();
  director.syncFollow(0, 0, 144);
  for (let i = 0; i < 30; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    director.step(1 / 60, state, player, view);
  }
  return { player, target, state, view, director };
}

test('a hostile sling retains its framing through the flight and ends at impact', () => {
  const { player, target, state, view, director } = fixture();
  state.player.tether.active = false;
  state.player.masslineImpacts.slung = true;
  for (let i = 0; i < 180; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    target.pos.x += target.vel.x / 60;
    target.pos.z += target.vel.z / 60;
    const frame = director.step(1 / 60, state, player, view);
    assert.equal(frame.mode, CameraDirectorMode.TETHER_PAIR, `flight frame ${i}`);
    assert.equal(frame.targetId, target.id);
    assert.equal(frame.governorLockS, 0);
    assert.ok(bodyInsideDirectorFrame(target, frame, view, 0.95), `thrown hull frame ${i}`);
    assert.ok(bodyInsideDirectorFrame(player, frame, view, 0.95), `player hull frame ${i}`);
  }
  state.player.masslineImpacts.latest = { targetId: 2, victimId: 3, slung: true, tick: state.tick };
  assert.equal(director.step(1 / 60, state, player, view).mode, CameraDirectorMode.RECOVER);
  // A persistent completed-impact record must not reacquire the shot.
  for (let i = 0; i < 30; i++) director.step(1 / 60, state, player, view);
  assert.equal(director.output.mode, CameraDirectorMode.FOLLOW);
});

test('a stale impact does not cancel a later sling; expiry and relatch have one handoff', () => {
  const { player, state, view, director } = fixture();
  state.player.masslineImpacts.latest = { targetId: 2, slung: true, tick: 1 };
  director.step(1 / 60, state, player, view);
  state.tick++;
  state.player.tether.active = false;
  state.player.masslineImpacts.slung = true;
  assert.equal(director.step(1 / 60, state, player, view).mode, CameraDirectorMode.TETHER_PAIR);
  state.player.tether.active = true;
  state.player.masslineImpacts.slung = false;
  assert.equal(director.step(1 / 60, state, player, view).mode, CameraDirectorMode.TETHER_PAIR);
  assert.equal(director.output.governorLockS, 0);
  state.player.tether.active = false;
  state.player.masslineImpacts.tracking = false;
  state.player.masslineImpacts.massId = null;
  assert.equal(director.step(1 / 60, state, player, view).mode, CameraDirectorMode.RECOVER);
});

test('a dropped line does not follow an untracked body or another sling', () => {
  for (const massId of [null, 99]) {
    const { player, state, view, director } = fixture();
    state.player.tether.active = false;
    state.player.masslineImpacts.slung = true;
    state.player.masslineImpacts.massId = massId;
    assert.equal(director.step(1 / 60, state, player, view).mode, CameraDirectorMode.RECOVER);
  }
});

test('a cut during pair acquisition contains the throw immediately', () => {
  const { player, target, state, view } = fixture();
  target.pos.x = 160;
  const director = createCameraDirector();
  director.syncFollow(0, 0, 72);
  state.player.tether.active = true;
  director.step(1 / 60, state, player, view);
  state.tick++;
  state.player.tether.active = false;
  state.player.masslineImpacts.slung = true;
  const frame = director.step(1 / 60, state, player, view);
  assert.equal(frame.mode, CameraDirectorMode.TETHER_PAIR);
  assert.ok(bodyInsideDirectorFrame(target, frame, view, 0.95));
});

test('the registered impact observer drives release and impact camera handoffs', () => {
  const { player, target, state, view, director } = fixture();
  target.mass = 30;
  delete state.player.masslineImpacts;
  const observer = Object.create(masslineImpacts);
  observer.init({ state });
  observer.update(1 / 60, state);
  state.tick++;
  state.simTime += 1 / 60;
  state.player.tether.active = false;
  observer.update(1 / 60, state);
  assert.equal(state.player.masslineImpacts.slung, true);
  assert.equal(director.step(1 / 60, state, player, view).mode, CameraDirectorMode.TETHER_PAIR);
  const rock = { id: 3, type: 'asteroid', alive: true, radius: 12, mass: 100,
    pos: { x: target.pos.x + 10, z: target.pos.z }, vel: { x: 0, z: 0 } };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);
  state.tick++;
  state.simTime += 1 / 60;
  observer.update(1 / 60, state);
  assert.equal(state.player.masslineImpacts.latest.targetId, target.id);
  assert.equal(state.player.masslineImpacts.latest.slung, true);
  assert.equal(director.step(1 / 60, state, player, view).mode, CameraDirectorMode.RECOVER);
});
