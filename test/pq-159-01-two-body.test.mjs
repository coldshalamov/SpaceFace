// PQ-159.01 — Two-body framing: a taut line (or bridle) frames both bodies with the line as
// the diagonal. Done when a swing capture shows both bodies inside the frame ≥ 90% of ticks.
// Seed 15901. Imports the shipped director + chase camera — not a parallel geometry file.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createChaseCamera } from '../src/render/camera.js';
import {
  TWO_BODY_SEED,
  CameraDirectorMode,
  bodyInsideDirectorFrame,
  createCameraDirector,
  frameTwoBodyLine,
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
