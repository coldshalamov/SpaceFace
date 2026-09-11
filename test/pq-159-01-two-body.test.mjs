// PQ-159.01 — Two-body framing: a taut line (or bridle) frames both bodies with the line as
// the diagonal. Done when a swing capture shows both bodies inside the frame ≥ 90% of ticks.
// Seed 15901. Imports the shipped director helper — not a parallel geometry file.
import assert from 'node:assert/strict';
import test from 'node:test';

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
    ...extra,
  };
}

function stateFor(player, other, tether) {
  return {
    playerId: player.id,
    mode: 'flight',
    simTime: 0,
    entities: new Map([[player.id, player], [other.id, other]]),
    player: { tether },
  };
}

function settle(director, seconds, state, player) {
  let frame = null;
  const steps = Math.max(1, Math.ceil(seconds / DT));
  for (let i = 0; i < steps; i++) frame = director.step(DT, state, player, VIEW);
  return frame;
}

test('taut-or-bridle helper: slack mining stays quiet, loaded/bridle fire', () => {
  assert.equal(isTautOrBridle({ active: true, phase: 'slack' }), false);
  assert.equal(isTautOrBridle({ active: true, phase: 'loaded' }), true);
  assert.equal(isTautOrBridle({ active: true, load: 0.8 }), true);
  assert.equal(isTautOrBridle({ active: true, bridle: true }), true);
  assert.equal(isTautOrBridle({ active: true, ratio: 0.95 }), true);
  assert.equal(isTautOrBridle({ active: true, ratio: 0.4 }), false);
});

test(`seed ${SEED}: taut-line swing keeps both bodies in frame ≥ 90% of sampled ticks`, () => {
  const player = entity(1, 0, 0, { radius: 8 });
  const rock = entity(2, 80, 40, { type: 'asteroid', radius: 10, team: 0 });
  const tether = {
    active: true,
    targetId: rock.id,
    phase: 'loaded',
    load: 0.8,
    strain: 0.2,
  };
  const state = stateFor(player, rock, tether);
  assert.equal(resolveTwoBodyLinePair(state, player).kind, 'taut');

  const pose = frameTwoBodyLine(player, rock, VIEW);
  assert.ok(pose.zoom >= 58, 'the helper opens far enough to fit the pair');
  assert.equal(bodyInsideDirectorFrame(player, pose, VIEW), true);
  assert.equal(bodyInsideDirectorFrame(rock, pose, VIEW), true);

  const director = createCameraDirector();
  director.syncFollow(0, 0, 144);
  settle(director, 0.5, state, player);

  const ticks = 90;
  const cx = 40;
  const cz = 20;
  const radius = Math.hypot(player.pos.x - cx, player.pos.z - cz);
  let inside = 0;
  let twoBodyTicks = 0;
  for (let i = 0; i < ticks; i++) {
    const angle = (i / ticks) * Math.PI * 0.65;
    player.pos.x = cx + Math.cos(angle) * radius;
    player.pos.z = cz + Math.sin(angle) * radius;
    rock.pos.x = cx - Math.cos(angle) * radius;
    rock.pos.z = cz - Math.sin(angle) * radius;
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
  director.syncFollow(0, 0, 144);
  const frame = settle(director, 0.5, state, player);
  assert.equal(frame.mode, CameraDirectorMode.TWO_BODY);
  assert.equal(bodyInsideDirectorFrame(a, frame, VIEW, 1), true);
  assert.equal(bodyInsideDirectorFrame(b, frame, VIEW, 1), true);
});
