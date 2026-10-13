import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { onboarding, BEATS } from '../src/systems/onboarding.js';

function harness(beatKey) {
  const state = createGameState(103);
  state.playerId = 1;
  const player = makeEntity({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  player.id = 1;
  state.entities.set(1, player);
  state.entityList.push(player);
  state.onboarding = { active: true, finished: false, currentBeat: BEATS.findIndex(b => b.key === beatKey),
    beatDoneAt: {}, firedFollowups: { 'tether:tether:latched': true }, tetherReeled: true };
  const owner = Object.create(onboarding);
  owner.state = state;
  owner._derelictId = 2;
  owner._miningRockId = 2;
  let seq = 10;
  owner.helpers = { spawnEntity(spec) {
    const entity = makeEntity(spec); entity.id = seq++;
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  owner._sayTutorial = () => {};
  owner._setObjectiveWaypoint = () => {};
  return { state, owner };
}

test('a removed tutorial seam rock is restaged without losing already mined progress', () => {
  const { state, owner } = harness('seam');
  state.onboarding.seamOreCollected = 3;
  owner._resolveProximityDone();
  assert.notEqual(owner._miningRockId, 2);
  assert.equal(state.entities.get(owner._miningRockId).data.trainingMining, true);
  assert.equal(state.onboarding.seamOreCollected, 3);
  assert.equal(state.onboarding.beatDoneAt.seam, undefined);
});

test('the tether lesson restages a missing derelict and requires a fresh latch/winch/cut', () => {
  const { state, owner } = harness('tether');
  state.player.targetId = 2;
  owner._resolveProximityDone();
  assert.notEqual(owner._derelictId, 2);
  assert.equal(state.entities.get(owner._derelictId).data.kind, 'derelict');
  assert.equal(state.player.targetId, owner._derelictId);
  assert.equal(state.onboarding.tetherReeled, false);
  assert.equal(state.onboarding.firedFollowups['tether:tether:latched'], undefined);
});

test('a recycled entity id cannot become the tutorial mining target', () => {
  const { state, owner } = harness('seam');
  state.entities.set(2, { id: 2, alive: true, type: 'ship', data: {} });
  owner._resolveProximityDone();
  assert.notEqual(owner._miningRockId, 2);
  assert.equal(state.entities.get(2).type, 'ship');
});

test('a derelict respawn that reuses the old id still resets its physical lesson progress', () => {
  const { state, owner } = harness('tether');
  state.player.targetId = 2;
  owner.helpers.spawnEntity = spec => {
    const replacement = makeEntity(spec); replacement.id = 2;
    state.entities.set(2, replacement); return replacement;
  };
  owner._resolveProximityDone();
  assert.equal(owner._derelictId, 2);
  assert.equal(state.onboarding.tetherReeled, false);
  assert.equal(state.onboarding.firedFollowups['tether:tether:latched'], undefined);
  assert.equal(state.player.targetId, 2);
});
