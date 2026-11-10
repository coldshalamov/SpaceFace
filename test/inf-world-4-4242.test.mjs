import test from 'node:test';
import assert from 'node:assert/strict';
import { readFieldFamily } from '../src/systems/fields.js';

const SEED = 4242;

function goo(id, x) {
  return {
    id,
    type: 'bomb',
    alive: true,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    data: { bombId: 'bomb_goo', phase: 'field', fieldStartedAt: 0, ownerId: 1 },
  };
}

test('4242: overlapping tar aims the escape cue at the cloud the hull is deepest in', () => {
  const player = { id: 7, alive: true, type: 'ship', pos: { x: 100, z: 0 } };
  const thin = goo(1, 0);
  const deep = goo(2, 100);
  const state = {
    meta: { seed: SEED },
    simTime: 1,
    tick: 60,
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [thin, deep],
  };
  const family = readFieldFamily({ state, now: 1, dt: 1 / 60 });
  assert.equal(state.meta.seed, SEED);
  assert.equal(family.edge.clouds.length, 2);
  assert.equal(family.edge.focusId, 2);
  assert.equal(family.edge.clouds.find((cloud) => cloud.id === 2).trackedId, player.id);
  assert.equal(family.edge.clouds.find((cloud) => cloud.id === 1).trackedId, player.id);
});
