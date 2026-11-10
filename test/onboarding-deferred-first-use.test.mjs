import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { onboarding } from '../src/systems/onboarding.js';

function fixture() {
  const state = {
    simTime: 0,
    playerId: 1,
    player: { hints: {} },
    settings: { gameplay: { tutorialHints: true } },
    entities: new Map(),
  };
  const bus = createBus();
  const owner = Object.create(onboarding);
  owner.state = state;
  owner.bus = bus;
  owner._deferredHints = null;
  owner._firstUseHintUntilS = -Infinity;
  let railOwnsVoice = true;
  owner._tutorialRailOwnsVoice = () => railOwnsVoice;
  const shown = [];
  bus.on('hud:firstUse', payload => shown.push(payload.verbId));
  return { owner, state, shown, setRailOwnsVoice(value) { railOwnsVoice = value; } };
}

test('deferred first-use hints remain unseen and display one at a time in FIFO order', () => {
  const { owner, state, shown, setRailOwnsVoice } = fixture();
  owner._showHint('combat', 'Aim before firing.');
  owner._showHint('station', 'A berth is a safe place to trade.');
  owner._showHint('cargo', 'Cargo can be sold at a station.');

  assert.deepEqual(shown, [], 'the staged rail keeps contextual hints quiet');
  assert.deepEqual(state.player.hints, {}, 'queued hints are not marked seen before display');
  setRailOwnsVoice(false);

  owner._drainHintQueue();
  assert.deepEqual(shown, ['combat']);
  assert.deepEqual(state.player.hints, { combat: true });
  assert.equal(owner._deferredHints.size, 2, 'the remaining hints stay queued');

  state.simTime = 6.99;
  owner._drainHintQueue();
  assert.deepEqual(shown, ['combat'], 'the current seven-second hint window is preserved');

  state.simTime = 7;
  owner._drainHintQueue();
  assert.deepEqual(shown, ['combat', 'station']);
  assert.deepEqual(state.player.hints, { combat: true, station: true });
  assert.equal(owner._deferredHints.size, 1);

  state.simTime = 14;
  owner._drainHintQueue();
  assert.deepEqual(shown, ['combat', 'station', 'cargo']);
  assert.deepEqual(state.player.hints, { combat: true, station: true, cargo: true });
  assert.equal(owner._deferredHints, null);
});

test('new first-use hints join behind a currently visible hint instead of replacing it', () => {
  const { owner, state, shown } = fixture();
  owner._tutorialRailOwnsVoice = () => false;
  owner._showHint('shield', 'Shields recharge after a quiet spell.');
  owner._showHint('boost', 'Boost spends capacitor charge.');

  assert.deepEqual(shown, ['shield']);
  assert.deepEqual(state.player.hints, { shield: true });
  assert.deepEqual([...owner._deferredHints.keys()], ['boost']);
  state.simTime = 7;
  owner._drainHintQueue();
  assert.deepEqual(shown, ['shield', 'boost']);
});

test('teardown discards contextual hints tied to the previous world', () => {
  const { owner } = fixture();
  owner._deferredHints = new Map([['station', { text: 'Dock here.', payload: { entityId: 7 } }]]);
  owner._firstUseHintUntilS = 99;
  owner.state.onboarding = {};
  owner._removeTrainingActors = () => {};
  owner._removeRescueActors = () => {};
  owner._removeMissingThreeActors = () => {};
  owner._removeRaidActors = () => {};
  owner._removeClaimedActors = () => {};
  owner._clearObjectiveWaypoint = () => {};
  owner._teardown();
  assert.equal(owner._deferredHints, null);
  assert.equal(owner._firstUseHintUntilS, -Infinity);
});
