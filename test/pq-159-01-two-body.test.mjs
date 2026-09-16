// PQ-159.01 — Two-body framing: a taut line (or bridle) frames both bodies with the line as
// the diagonal. Done when a swing capture shows both bodies inside the frame ≥ 90% of ticks.
// Seed 15901. Imports the shipped director + chase camera — not a parallel geometry file.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createChaseCamera, resolveCombatCompositionZoomCap } from '../src/render/camera.js';
import {
  TWO_BODY_SEED,
  CameraDirectorMode,
  bodyInsideDirectorFrame,
  createCameraDirector,
  frameTwoBodyLine,
  isCombatPairTetherTarget,
  isTautOrBridle,
  resolveTwoBodyLinePair,
} from '../src/render/cameraDirector.js';

const SEED = TWO_BODY_SEED;
const DT = 1 / 60;
const VIEW = Object.freeze({
  followX: 0,
  followZ: 0,
  followZoom: 144,
  fov: 50,
  aspect: 16 / 9,
  tiltDeg: 60,
});
const SHIPPING_ZOOM = 144;

function entity(id, x, z, extra = {}) {
  return {
    id,
    type: extra.type || 'ship',
    alive: true,
    team: extra.team ?? 0,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: extra.radius ?? 7,
    hull: 100,
    maxSpeed: 120,
    ...extra,
  };
}

function loadedTether(targetId) {
  return {
    active: true,
    targetId,
    phase: 'loaded',
    load: 0.55,
    strain: 0.12,
    restLength: 100,
  };
}

function slackTether(targetId) {
  return {
    active: true,
    targetId,
    phase: 'slack',
    load: 0,
    strain: 0,
    restLength: 100,
  };
}

function stateFor(player, other, extra = {}) {
  const entities = new Map([[player.id, player], [other.id, other]]);
  if (extra.extraEntities) {
    for (const item of extra.extraEntities) entities.set(item.id, item);
  }
  return {
    playerId: player.id,
    mode: 'flight',
    simTime: 0,
    entities,
    settings: { video: { fov: 50, motionReduce: false } },
    camera: { zoom: SHIPPING_ZOOM, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    player: {
      tether: extra.tether || { active: false },
      remoteMassline: extra.remoteMassline || { active: false },
    },
    combat: extra.combat,
  };
}

function settle(director, seconds, state, player) {
  let frame = null;
  const steps = Math.max(1, Math.ceil(seconds / DT));
  for (let i = 0; i < steps; i++) frame = director.step(DT, state, player, VIEW);
  return frame;
}

function swingPose(player, rock, i, ticks, cx, cz, radius) {
  const angle = (i / ticks) * Math.PI * 0.65;
  player.pos.x = cx + Math.cos(angle) * radius;
  player.pos.z = cz + Math.sin(angle) * radius;
  rock.pos.x = cx - Math.cos(angle) * radius;
  rock.pos.z = cz - Math.sin(angle) * radius;
}

test('taut-or-bridle helper: slack mining stays quiet, loaded/bridle fire', () => {
  assert.equal(isTautOrBridle({ active: true, phase: 'slack' }), false);
  assert.equal(isTautOrBridle({ active: true, phase: 'capture', load: 0.35 }), false);
  assert.equal(isTautOrBridle({ active: true, phase: 'loaded' }), true);
  assert.equal(isTautOrBridle({ active: true, load: 0.8 }), true);
  assert.equal(isTautOrBridle({ active: true, bridle: true }), true);
  assert.equal(isTautOrBridle({ active: true, ratio: 0.95 }), true);
  assert.equal(isTautOrBridle({ active: true, ratio: 0.4 }), false);
});

test(`seed ${SEED}: taut-line swing keeps both bodies in frame ≥ 90% of sampled ticks`, () => {
  const player = entity(1, 0, 0, { radius: 8 });
  const rock = entity(2, 80, 40, { type: 'asteroid', radius: 10, team: 0 });
  const tether = loadedTether(rock.id);
  const state = stateFor(player, rock, { tether });
  assert.equal(resolveTwoBodyLinePair(state, player).kind, 'taut');

  const pose = frameTwoBodyLine(player, rock, VIEW);
  assert.ok(pose.zoom >= 58, 'the helper opens far enough to fit the pair');
  assert.equal(bodyInsideDirectorFrame(player, pose, VIEW), true);
  assert.equal(bodyInsideDirectorFrame(rock, pose, VIEW), true);

  const director = createCameraDirector();
  director.syncFollow(0, 0, SHIPPING_ZOOM);
  settle(director, 0.5, state, player);

  const ticks = 90;
  const cx = 40;
  const cz = 20;
  const radius = Math.hypot(player.pos.x - cx, player.pos.z - cz);
  let inside = 0;
  let twoBodyTicks = 0;
  for (let i = 0; i < ticks; i++) {
    swingPose(player, rock, i, ticks, cx, cz, radius);
    const frame = director.step(DT, state, player, {
      ...VIEW,
      followX: player.pos.x,
      followZ: player.pos.z,
    });
    if (frame.mode === CameraDirectorMode.TWO_BODY) twoBodyTicks += 1;
    const aIn = bodyInsideDirectorFrame(player, frame, VIEW, 1);
    const bIn = bodyInsideDirectorFrame(rock, frame, VIEW, 1);
    if (aIn && bIn) inside += 1;
  }
  const fraction = inside / ticks;
  assert.ok(twoBodyTicks === ticks, `director must stay in TWO_BODY for the taut swing (got ${twoBodyTicks}/${ticks})`);
  assert.ok(fraction >= 0.9, `both-bodies fraction ${fraction} must be ≥ 0.90`);
  console.log(`SEED=${SEED} bothBodies=${(fraction * 100).toFixed(1)}% ticks=${ticks} mode=TWO_BODY`);
});

test('a live bridle also takes TWO_BODY and keeps both endpoints in frame', () => {
  const a = entity(10, -50, 0, { type: 'asteroid', radius: 12 });
  const b = entity(11, 50, 18, { type: 'asteroid', radius: 12 });
  const player = entity(1, 0, -20, { radius: 7 });
  const state = {
    playerId: player.id,
    mode: 'flight',
    entities: new Map([[player.id, player], [a.id, a], [b.id, b]]),
    player: { tether: { active: false } },
    combat: {
      attachments: {
        byId: {
          bridle_1: {
            id: 'bridle_1',
            defId: 'attachment_twin_bridle',
            state: 'active',
            ownerId: a.id,
            targetId: b.id,
          },
        },
      },
    },
  };
  const pair = resolveTwoBodyLinePair(state, player);
  assert.equal(pair.kind, 'bridle');
  assert.equal(pair.a.id, a.id);
  assert.equal(pair.b.id, b.id);

  const director = createCameraDirector();
  director.syncFollow(0, 0, SHIPPING_ZOOM);
  const frame = settle(director, 0.5, state, player);
  assert.equal(frame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(bodyInsideDirectorFrame(a, frame, VIEW, 1), true);
  assert.equal(bodyInsideDirectorFrame(b, frame, VIEW, 1), true);
});

test('player.remoteMassline is the live bridle seam the director consumes', () => {
  const a = entity(10, -60, 4, { type: 'asteroid', radius: 14 });
  const b = entity(11, 70, -8, { type: 'asteroid', radius: 14 });
  const player = entity(1, 0, -16, { radius: 7 });
  const state = stateFor(player, a, {
    extraEntities: [b],
    remoteMassline: {
      active: true,
      kind: 'twin_bridle',
      headId: 'twin_bridle',
      phase: 'loaded',
      load: 0.55,
      sourceId: a.id,
      targetId: b.id,
      attachmentId: 'bridle_live',
    },
  });
  const pair = resolveTwoBodyLinePair(state, player);
  assert.equal(pair.kind, 'bridle');
  assert.equal(pair.a.id, a.id);
  assert.equal(pair.b.id, b.id);
  const director = createCameraDirector();
  director.syncFollow(0, 0, SHIPPING_ZOOM);
  const frame = settle(director, 0.5, state, player);
  assert.equal(frame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(bodyInsideDirectorFrame(a, frame, VIEW, 1), true);
  assert.equal(bodyInsideDirectorFrame(b, frame, VIEW, 1), true);
});

function chaseSwing(tetherPhase) {
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = entity(1, 0, 0, { radius: 8, type: 'ship' });
  const rock = entity(2, 100, 0, { type: 'asteroid', radius: 12, team: 0 });
  const tether = tetherPhase === 'loaded' ? loadedTether(rock.id) : slackTether(rock.id);
  const state = stateFor(player, rock, { tether });
  const camera = createChaseCamera(state);
  camera.snapToPlayer();

  const ticks = 90;
  const cx = 50;
  const cz = 0;
  const radius = 50;
  let inside = 0;
  let twoBodyTicks = 0;
  for (let i = 0; i < ticks; i++) {
    swingPose(player, rock, i, ticks, cx, cz, radius);
    camera.follow(DT);
    const frame = camera.composition();
    if (frame.mode === CameraDirectorMode.TWO_BODY) twoBodyTicks += 1;
    if (bodyInsideDirectorFrame(player, frame, VIEW, 1)
      && bodyInsideDirectorFrame(rock, frame, VIEW, 1)) {
      inside += 1;
    }
  }
  return {
    fraction: inside / ticks,
    twoBodyTicks,
    ticks,
    lastMode: camera.composition().mode,
  };
}

test(`seed ${SEED}: shipping chase camera keeps both bodies in a taut swing ≥ 90% from taut onset`, () => {
  const slack = chaseSwing('slack');
  assert.equal(slack.lastMode, CameraDirectorMode.FOLLOW,
    'a slack mining latch must stay FOLLOW so CAMERA-FOCUS-SEPARATION still holds');
  assert.equal(slack.twoBodyTicks, 0, 'slack must not enter TWO_BODY');

  const taut = chaseSwing('loaded');
  assert.ok(taut.twoBodyTicks === taut.ticks,
    `chase camera must stay in TWO_BODY for the taut swing (got ${taut.twoBodyTicks}/${taut.ticks})`);
  assert.ok(taut.fraction >= 0.9,
    `chase-camera both-bodies fraction ${taut.fraction} must be ≥ 0.90`);
  console.log(
    `SEED=${SEED} chaseCamera taut=${(taut.fraction * 100).toFixed(1)}% `
    + `slack=${(slack.fraction * 100).toFixed(1)}% ticks=${taut.ticks} `
    + `mode=${taut.lastMode}`,
  );
});

const CHASE_VIEWPORT = Object.freeze({ innerWidth: 1600, innerHeight: 900 });
const ATTACKER_SETTLE_TICKS = 180;
const COMBAT_ZOOM_CEILING = 528;
const PAIR_ONLY_ZOOM_CEILING = 330;
const HULL_MIN_SCREEN_FRACTION = 0.04;
const FOCUS_SETTLE_TOLERANCE = 0.01;
const CONTEXT_ZOOM_OUT_STEP_MAX_WU = 5.5;

function attacker(id, x, z, extra = {}) {
  return entity(id, x, z, {
    radius: 6,
    team: 1,
    data: { combat: { targetId: 1 } },
    ...extra,
  });
}

function projectXZ(cam, x, z) {
  return new THREE.Vector3(x, 0, z).project(cam);
}

function bodySamplePoints(body) {
  const r = Math.max(0, body.radius || 0);
  const { x, z } = body.pos;
  return [[x, z], [x + r, z], [x - r, z], [x, z + r], [x, z - r]];
}

function assertBodyOnScreen(cam, body, label) {
  for (const [x, z] of bodySamplePoints(body)) {
    const ndc = projectXZ(cam, x, z);
    assert.ok(
      Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
      `${label} sample (${x}, ${z}) must project inside the frame (ndc ${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)})`,
    );
    assert.ok(
      ndc.z >= -1 && ndc.z <= 1,
      `${label} sample (${x}, ${z}) must sit inside the depth range (ndc z ${ndc.z.toFixed(3)})`,
    );
  }
}

function projectedHullWidthFraction(cam, body) {
  const r = Math.max(0, body.radius || 0);
  const left = projectXZ(cam, body.pos.x - r, body.pos.z);
  const right = projectXZ(cam, body.pos.x + r, body.pos.z);
  return Math.abs(right.x - left.x) / 2;
}

function settleChase(state, ticks = ATTACKER_SETTLE_TICKS) {
  globalThis.window = { ...CHASE_VIEWPORT };
  const camera = createChaseCamera(state, CHASE_VIEWPORT);
  camera.snapToPlayer();
  let frame = null;
  for (let i = 0; i < ticks; i++) {
    camera.follow(DT);
    frame = camera.composition();
  }
  camera.obj.updateMatrixWorld(true);
  return { camera, cam: camera.obj, frame };
}

function tautRopeScene({ hostile = null, combat = undefined } = {}) {
  const player = entity(1, 0, 0, { radius: 18 });
  const rock = entity(2, 80, 0, { type: 'asteroid', radius: 12, team: 0 });
  const state = stateFor(player, rock, {
    tether: loadedTether(rock.id),
    extraEntities: hostile ? [hostile] : [],
    combat,
  });
  return { player, rock, hostile, state };
}

function remoteBridleScene({ hostile = null } = {}) {
  const a = entity(10, -50, 0, { type: 'asteroid', radius: 12 });
  const b = entity(11, 50, 18, { type: 'asteroid', radius: 12 });
  const player = entity(1, 0, -20, { radius: 18 });
  const state = stateFor(player, a, {
    extraEntities: hostile ? [b, hostile] : [b],
    remoteMassline: {
      active: true,
      kind: 'twin_bridle',
      headId: 'twin_bridle',
      phase: 'loaded',
      load: 0.55,
      sourceId: a.id,
      targetId: b.id,
      attachmentId: 'bridle_live',
    },
  });
  return { a, b, player, hostile, state };
}

test('B3b: an active attacker widens a taut TWO_BODY frame on the real chase camera without moving the rope focus', () => {
  const control = tautRopeScene();
  const controlRun = settleChase(control.state);
  assert.equal(controlRun.frame.mode, CameraDirectorMode.TWO_BODY, 'control rope must compose TWO_BODY');
  assert.ok(controlRun.frame.zoom <= PAIR_ONLY_ZOOM_CEILING,
    `pair-only rope must keep the ordinary ceiling (zoom ${controlRun.frame.zoom})`);

  const hostile = attacker(3, 0, -170);
  const scene = tautRopeScene({ hostile });
  const { cam, frame } = settleChase(scene.state);
  assert.equal(frame.mode, CameraDirectorMode.TWO_BODY, 'attacker context must not leave TWO_BODY');
  assert.equal(frame.targetId, scene.rock.id, 'the rope endpoint stays the composed target');
  assert.ok(frame.zoom <= COMBAT_ZOOM_CEILING, `attacker context zoom ${frame.zoom} must stay within ${COMBAT_ZOOM_CEILING}`);
  assert.ok(frame.zoom > controlRun.frame.zoom,
    `an attacker locked on the player must open the rope frame (zoom ${frame.zoom} vs control ${controlRun.frame.zoom})`);

  const pose = frameTwoBodyLine(scene.player, scene.rock, VIEW);
  assert.ok(
    Math.abs(frame.focusX - pose.focusX) <= FOCUS_SETTLE_TOLERANCE
      && Math.abs(frame.focusZ - pose.focusZ) <= FOCUS_SETTLE_TOLERANCE,
    `focus (${frame.focusX}, ${frame.focusZ}) must settle on the exact rope midpoint (${pose.focusX}, ${pose.focusZ})`,
  );

  assertBodyOnScreen(cam, scene.player, 'player');
  assertBodyOnScreen(cam, scene.rock, 'rock');
  assertBodyOnScreen(cam, hostile, 'attacker');
  const hullFraction = projectedHullWidthFraction(cam, scene.player);
  assert.ok(hullFraction >= HULL_MIN_SCREEN_FRACTION,
    `player hull must still span >= ${HULL_MIN_SCREEN_FRACTION} of the screen width (got ${hullFraction.toFixed(4)})`);
  console.log(`SEED=${SEED} B3b taut+attacker zoom=${frame.zoom.toFixed(1)} control=${controlRun.frame.zoom.toFixed(1)} hull=${hullFraction.toFixed(4)}`);
});

test('B3b: a remote bridle keys attacker context on the actual player, not the pairA asteroid', () => {
  const control = remoteBridleScene();
  const controlView = { ...VIEW, maxZoom: resolveCombatCompositionZoomCap(control.player, VIEW) };
  const controlDirector = createCameraDirector();
  controlDirector.syncFollow(0, -20, SHIPPING_ZOOM);
  let controlFrame = null;
  for (let i = 0; i < ATTACKER_SETTLE_TICKS; i++) {
    controlFrame = controlDirector.step(DT, control.state, control.player, controlView);
  }
  assert.equal(controlFrame.mode, CameraDirectorMode.TWO_BODY);

  const scene = remoteBridleScene({ hostile: attacker(3, 0, -170) });
  const pair = resolveTwoBodyLinePair(scene.state, scene.player);
  assert.equal(pair.a.id, scene.a.id, 'pairA is the bridle asteroid, not the player');
  const view = { ...VIEW, maxZoom: resolveCombatCompositionZoomCap(scene.player, VIEW) };
  const director = createCameraDirector();
  director.syncFollow(0, -20, SHIPPING_ZOOM);
  let frame = null;
  for (let i = 0; i < ATTACKER_SETTLE_TICKS; i++) {
    frame = director.step(DT, scene.state, scene.player, view);
  }
  assert.equal(frame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(frame.targetId, scene.b.id, 'the bridle endpoints stay the composed target');
  assert.ok(frame.zoom <= COMBAT_ZOOM_CEILING, `bridle attacker zoom ${frame.zoom} must stay within ${COMBAT_ZOOM_CEILING}`);
  assert.ok(frame.zoom > controlFrame.zoom,
    `an attacker locked on the PLAYER must open the bridle frame (zoom ${frame.zoom} vs control ${controlFrame.zoom})`);
  const pose = frameTwoBodyLine(scene.a, scene.b, VIEW);
  assert.ok(
    Math.abs(frame.focusX - pose.focusX) <= FOCUS_SETTLE_TOLERANCE
      && Math.abs(frame.focusZ - pose.focusZ) <= FOCUS_SETTLE_TOLERANCE,
    `bridle focus (${frame.focusX}, ${frame.focusZ}) must settle on the exact line midpoint (${pose.focusX}, ${pose.focusZ})`,
  );
  assert.equal(bodyInsideDirectorFrame(scene.a, frame, VIEW, 1), true, 'bridle endpoint A stays in frame');
  assert.equal(bodyInsideDirectorFrame(scene.b, frame, VIEW, 1), true, 'bridle endpoint B stays in frame');
  assert.equal(bodyInsideDirectorFrame(scene.player, frame, VIEW, 1), true, 'player stays in frame');
  assert.equal(bodyInsideDirectorFrame(scene.hostile, frame, VIEW, 1), true, 'attacker stays in frame');

  const chaseScene = remoteBridleScene({ hostile: attacker(3, 0, -170) });
  const { cam, frame: chaseFrame } = settleChase(chaseScene.state);
  assert.equal(chaseFrame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(chaseFrame.targetId, chaseScene.b.id);
  assert.ok(chaseFrame.zoom <= COMBAT_ZOOM_CEILING);
  assertBodyOnScreen(cam, chaseScene.a, 'bridle endpoint A');
  assertBodyOnScreen(cam, chaseScene.b, 'bridle endpoint B');
  assertBodyOnScreen(cam, chaseScene.player, 'player');
  assertBodyOnScreen(cam, chaseScene.hostile, 'attacker');
  const hullFraction = projectedHullWidthFraction(cam, chaseScene.player);
  assert.ok(hullFraction >= HULL_MIN_SCREEN_FRACTION,
    `player hull must still span >= ${HULL_MIN_SCREEN_FRACTION} of the screen width (got ${hullFraction.toFixed(4)})`);
  console.log(`SEED=${SEED} B3b bridle+attacker zoom=${frame.zoom.toFixed(1)} control=${controlFrame.zoom.toFixed(1)} chase=${chaseFrame.zoom.toFixed(1)}`);
});

test('B3b: TWO_BODY widens only for a hostile that holds a lock on the player and can still fire', () => {
  const controlZoom = settleChase(tautRopeScene().state).frame.zoom;

  const lockless = attacker(3, 0, -170, { data: { encounter: true } });
  const locklessScene = tautRopeScene({ hostile: lockless });
  assert.equal(isCombatPairTetherTarget(locklessScene.state, locklessScene.player, lockless), true,
    'the lockless contact is genuinely hostile, so only the missing lock keeps it out');
  const locklessRun = settleChase(locklessScene.state);
  assert.equal(locklessRun.frame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(locklessRun.frame.zoom, controlZoom, 'a hostile without a lock must not widen TWO_BODY');

  const disarmed = attacker(3, 0, -170);
  const disarmedScene = tautRopeScene({
    hostile: disarmed,
    combat: {
      entities: {
        [String(disarmed.id)]: { entityId: disarmed.id, capabilities: { weapon: false } },
      },
    },
  });
  const disarmedRun = settleChase(disarmedScene.state);
  assert.equal(disarmedRun.frame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(disarmedRun.frame.zoom, controlZoom, 'a weapon-blocked attacker must not widen TWO_BODY');
});

test('B3b: attacker context eases the rope frame open and closed instead of jumping', () => {
  const scene = tautRopeScene();
  const { camera, cam } = settleChase(scene.state);
  const controlZoom = camera.composition().zoom;
  assert.equal(camera.composition().mode, CameraDirectorMode.TWO_BODY);

  const hostile = attacker(3, 0, -170);
  scene.state.entities.set(hostile.id, hostile);
  let frame = null;
  for (let i = 0; i < ATTACKER_SETTLE_TICKS; i++) {
    const previous = camera.composition().zoom;
    camera.follow(DT);
    frame = camera.composition();
    cam.updateMatrixWorld(true);
    assert.ok(frame.zoom - previous <= CONTEXT_ZOOM_OUT_STEP_MAX_WU + 1e-6,
      `tick ${i}: attacker context must ease outward (step ${(frame.zoom - previous).toFixed(2)} from ${previous.toFixed(1)})`);
    assert.equal(frame.mode, CameraDirectorMode.TWO_BODY, `tick ${i}: attacker context must not leave TWO_BODY`);
    assert.equal(frame.targetId, scene.rock.id, `tick ${i}: the rope endpoint stays the composed target`);
    assertBodyOnScreen(cam, scene.player, `tick ${i} player`);
    assertBodyOnScreen(cam, scene.rock, `tick ${i} rock`);
  }
  assertBodyOnScreen(cam, hostile, 'attacker');
  assert.ok(frame.zoom > PAIR_ONLY_ZOOM_CEILING,
    `attacker context must open past the pair-only ceiling once settled (zoom ${frame.zoom})`);

  scene.state.entities.delete(hostile.id);
  camera.follow(DT);
  frame = camera.composition();
  assert.ok(frame.zoom > PAIR_ONLY_ZOOM_CEILING,
    `releasing the attacker must not clamp the zoom in one tick (zoom ${frame.zoom})`);
  for (let i = 0; i < ATTACKER_SETTLE_TICKS; i++) {
    camera.follow(DT);
    frame = camera.composition();
    cam.updateMatrixWorld(true);
    assertBodyOnScreen(cam, scene.player, `release tick ${i} player`);
    assertBodyOnScreen(cam, scene.rock, `release tick ${i} rock`);
  }
  assert.equal(frame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(frame.targetId, scene.rock.id);
  assert.ok(Math.abs(frame.zoom - controlZoom) <= 0.1,
    `after release the rope must return to its no-hostile zoom (zoom ${frame.zoom} vs control ${controlZoom})`);
  console.log(`SEED=${SEED} B3b attacker ease control=${controlZoom.toFixed(1)} settled=${frame.zoom.toFixed(1)}`);
});
