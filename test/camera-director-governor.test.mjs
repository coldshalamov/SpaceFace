// Camera director flap governor — owner feel verdict 2026-09-16: slow, purposeful zoom changes
// are welcome (speed framing, widening to hold a battle); frenetic re-takes are not. The
// governor doses takeovers by frequency: one or two family entries inside the window are
// ordinary play (an immediate same-target re-latch is a continuity contract, not a flap), but
// CAMERA_DIRECTOR_FLAP_TRIP_ENTRIES entries inside CAMERA_DIRECTOR_FLAP_WINDOW_S is flapping
// and loses camera authority for CAMERA_DIRECTOR_GOVERNOR_LOCK_S.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMERA_DIRECTOR_FLAP_TRIP_ENTRIES,
  CAMERA_DIRECTOR_FLAP_WINDOW_S,
  CAMERA_DIRECTOR_GOVERNOR_LOCK_S,
  CameraDirectorMode,
  createCameraDirector,
} from '../src/render/cameraDirector.js';

const DT = 1 / 60;
const VIEW = Object.freeze({
  followX: 0,
  followZ: 0,
  followZoom: 144,
  fov: 50,
  aspect: 16 / 9,
  tiltDeg: 60,
});

function entity(id, x, z, extra = {}) {
  return {
    id,
    type: extra.type || 'asteroid',
    alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: extra.radius ?? 10,
    ...extra,
  };
}

// TWO_BODY via the bridle seam: a discrete attachment state we can toggle to simulate a flapping
// trigger without involving the hostility oracle.
function bridled(tether) {
  tether.active = true;
  tether.bridle = true;
  tether.headId = 'twin_bridle';
  return tether;
}

function unbridled(tether) {
  tether.active = false;
  tether.bridle = false;
  return tether;
}

function scene(player, other, tether) {
  return {
    playerId: player.id,
    mode: 'flight',
    simTime: 0,
    entities: new Map([[player.id, player], [other.id, other]]),
    settings: { video: { fov: 50, motionReduce: false } },
    player: { tether },
  };
}

function freshDirector() {
  const director = createCameraDirector();
  director.syncFollow(0, 0, 144);
  return director;
}

test('a stable bridle holds TWO_BODY indefinitely and never trips the governor', () => {
  const player = entity(1, 0, 0, { radius: 8, type: 'ship' });
  const other = entity(2, 70, 20);
  const tether = bridled({ targetId: 2, phase: 'loaded', load: 0.55, restLength: 100 });
  const state = scene(player, other, tether);
  const director = freshDirector();

  for (let i = 0; i < 300; i++) {
    const frame = director.step(DT, state, player, VIEW);
    assert.equal(frame.mode, CameraDirectorMode.TWO_BODY, `tick ${i}: stable mode must hold`);
    assert.equal(frame.governorLockS, 0, `tick ${i}: a held mode is not a flap`);
  }
});

test('rapid re-takes trip the lock; the first re-latch stays a legitimate acquisition', () => {
  const player = entity(1, 0, 0, { radius: 8, type: 'ship' });
  const other = entity(2, 70, 20);
  const tether = bridled({ targetId: 2, phase: 'loaded', load: 0.55, restLength: 100 });
  const state = scene(player, other, tether);
  const director = freshDirector();

  // Acquisition 1.
  for (let i = 0; i < 90; i++) {
    assert.equal(director.step(DT, state, player, VIEW).mode, CameraDirectorMode.TWO_BODY);
  }

  // Drop and re-fire once inside the window: an ordinary re-latch, still allowed.
  unbridled(tether);
  for (let i = 0; i < 6; i++) director.step(DT, state, player, VIEW);
  bridled(tether);
  const relatch = director.step(DT, state, player, VIEW);
  assert.equal(relatch.mode, CameraDirectorMode.TWO_BODY,
    'a single immediate re-latch is continuity, not flapping');
  assert.equal(relatch.governorLockS, 0);
  for (let i = 0; i < 30; i++) {
    assert.equal(director.step(DT, state, player, VIEW).mode, CameraDirectorMode.TWO_BODY);
  }

  // Drop and re-fire again: this re-take reaches the trip count inside the window.
  unbridled(tether);
  for (let i = 0; i < 6; i++) director.step(DT, state, player, VIEW);
  bridled(tether);
  const locked = director.step(DT, state, player, VIEW);
  assert.notEqual(locked.mode, CameraDirectorMode.TWO_BODY,
    `entry ${CAMERA_DIRECTOR_FLAP_TRIP_ENTRIES} inside the window must not take the camera`);
  assert.ok(locked.governorLockS > 0, 'the lock must be published for diagnostics');
  assert.ok(locked.governorLockS <= CAMERA_DIRECTOR_GOVERNOR_LOCK_S + 1e-9);

  // The lock runs its full window even while the trigger stays live, then admits exactly one
  // entry from that live trigger.
  const lockTicks = Math.ceil(CAMERA_DIRECTOR_GOVERNOR_LOCK_S / DT);
  let sawRecovery = false;
  for (let i = 0; i < lockTicks + 5; i++) {
    const frame = director.step(DT, state, player, VIEW);
    if (i < lockTicks - 1) {
      assert.notEqual(frame.mode, CameraDirectorMode.TWO_BODY, `tick ${i}: lock must hold`);
      assert.ok(frame.governorLockS > 0, `tick ${i}: lock readout must be live`);
    } else if (frame.mode === CameraDirectorMode.TWO_BODY) {
      sawRecovery = true;
      assert.equal(frame.governorLockS, 0, 'recovery only happens once the lock is spent');
    }
  }
  assert.ok(sawRecovery, 'after the lock expires the live trigger takes the camera again');

  // And the recovered entry is ordinary: a later drop/re-latch is a fresh, allowed acquisition.
  unbridled(tether);
  for (let i = 0; i < 30; i++) director.step(DT, state, player, VIEW);
  bridled(tether);
  const released = director.step(DT, state, player, VIEW);
  assert.equal(released.mode, CameraDirectorMode.TWO_BODY,
    'after the lock episode a stable trigger takes the camera again');
  assert.equal(released.governorLockS, 0);
});

test('an entry after the window has fully elapsed never accumulates flap count', () => {
  const player = entity(1, 0, 0, { radius: 8, type: 'ship' });
  const other = entity(2, 70, 20);
  const tether = bridled({ targetId: 2, phase: 'loaded', load: 0.55, restLength: 100 });
  const state = scene(player, other, tether);
  const director = freshDirector();

  for (let i = 0; i < 90; i++) director.step(DT, state, player, VIEW);
  unbridled(tether);
  const gapTicks = Math.ceil((CAMERA_DIRECTOR_FLAP_WINDOW_S + 0.5) / DT);
  for (let i = 0; i < gapTicks; i++) director.step(DT, state, player, VIEW);

  bridled(tether);
  const frame = director.step(DT, state, player, VIEW);
  assert.equal(frame.mode, CameraDirectorMode.TWO_BODY,
    'a fresh acquisition outside the window takes the camera normally');
  assert.equal(frame.governorLockS, 0);
});

test('trip count sanity: the constants leave ordinary double-takes untouched', () => {
  assert.ok(CAMERA_DIRECTOR_FLAP_TRIP_ENTRIES >= 3,
    'a single re-latch must never trip the governor');
  assert.ok(CAMERA_DIRECTOR_FLAP_WINDOW_S >= 3 * CAMERA_DIRECTOR_GOVERNOR_LOCK_S / 4,
    'the window must be long enough that real flapping is caught by the count');
});
