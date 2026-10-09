// SF-2b #8 — automatic lock acquisition picks the hostile under the player's mouse cursor, not
// merely the nearest one, and gives the cursor a short grace to reach the next contact after a
// lock is lost. Drives the real exported targetNearestHostileToPlayer() headlessly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetNearestHostileToPlayer, LOCK_PICK_RANGE_WEIGHT, LOCK_REACQUIRE_GRACE_S,
} from '../src/ui/uiRoot.js';

function shipLike(id, pos) {
  return { id, type: 'ship', team: 1, alive: true, pos, vel: { x: 0, z: 0 }, data: { encounter: true } };
}

function world(hostiles, { cursor = null, targetId = null, input = {} } = {}) {
  const player = { id: 'p', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, targetId };
  const entities = [player, ...hostiles];
  return {
    playerId: 'p',
    simTime: 10,
    entities: new Map(entities.map((e) => [e.id, e])),
    entityList: entities,
    player,
    input: cursor
      ? { aimIntentActive: true, aimWorld: { ...cursor }, ...input }
      : { aimIntentActive: false, aimWorld: { x: 0, z: 0 }, ...input },
  };
}

// A pack: the nearest hostile is behind the player; the one the cursor is on sits ahead, farther.
const pack = () => [
  shipLike('behind', { x: -180, z: 20 }),
  shipLike('left', { x: 60, z: 320 }),
  shipLike('ahead', { x: 520, z: -40 }),
];

test('a fresh lock goes to the hostile under the cursor, not the nearest', () => {
  assert.equal(LOCK_PICK_RANGE_WEIGHT, 0.25);
  const state = world(pack(), { cursor: { x: 540, z: -10 } }); // ~36 wu off the "ahead" hull
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'ahead');
});

test('range only breaks ties near the cursor', () => {
  // Two contacts the same distance from the cursor: the nearer one to the player wins.
  const state = world([shipLike('far', { x: 700, z: 40 }), shipLike('near', { x: 400, z: 40 })], { cursor: { x: 550, z: 40 } });
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'near');
});

test('without a live cursor the pick is still the nearest hostile', () => {
  for (const [label, opts] of [
    ['no pointer', {}],
    ['G combat stick (pointer locked)', { cursor: { x: 540, z: -10 }, input: { autoFire: true } }],
    ['pad right-stick aim (synthetic 300-wu point)', { cursor: { x: 540, z: -10 }, input: { aimFromStick: true } }],
  ]) {
    const state = world(pack(), opts);
    targetNearestHostileToPlayer(state, null, { quiet: true });
    assert.equal(state.player.targetId, 'behind', label);
  }
});

test('a legal lock is kept when the cursor wanders to another contact (no flicker)', () => {
  const state = world(pack(), { cursor: { x: 540, z: -10 } });
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'ahead');
  state.input.aimWorld = { x: 60, z: 320 };
  for (let i = 0; i < 20; i++) { state.simTime += 0.12; targetNearestHostileToPlayer(state, null, { quiet: true }); }
  assert.equal(state.player.targetId, 'ahead', 'only Tab, a click, or losing the lock changes it');
});

test('after a kill the refresh waits for the cursor, then locks what it points at', () => {
  const hostiles = pack();
  const state = world(hostiles, { cursor: { x: 540, z: -10 } });
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'ahead');
  hostiles[2].alive = false;                      // the lock dies; the cursor is still on the wreck
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'ahead', 'inside the grace the dead id is left for entity:killed cleanup');
  state.simTime += 0.12;
  state.input.aimWorld = { x: 70, z: 300 };       // the player swings the cursor onto "left"
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'ahead', 'still inside the grace');
  state.simTime += LOCK_REACQUIRE_GRACE_S;
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'left', 'the next lock is the contact under the cursor, not the nearest');
});

test('a lock cleared by despawn also gets the grace; the first lock never waits', () => {
  const hostiles = pack();
  const state = world(hostiles, { cursor: { x: 60, z: 330 } });
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'left', 'first acquisition is immediate');
  state.player.targetId = null;                   // clearRecycledEntityPointers on despawn
  state.entities.delete('left');
  state.input.aimWorld = { x: 520, z: -40 };
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, null);
  state.simTime += LOCK_REACQUIRE_GRACE_S + 0.01;
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, 'ahead');
});

test('a deliberate (non-quiet) request is never delayed', () => {
  const hostiles = pack();
  const state = world(hostiles, { cursor: { x: 540, z: -10 } });
  targetNearestHostileToPlayer(state, null, { quiet: true });
  hostiles[2].alive = false;
  state.input.aimWorld = { x: 60, z: 320 };
  targetNearestHostileToPlayer(state, null, {});
  assert.equal(state.player.targetId, 'left');
});
