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

test('a tip the rail held past its moment is dropped unseen, so it can speak when it is relevant again', () => {
  const { owner, state, shown, setRailOwnsVoice } = fixture();
  owner._showHint('firstHub', 'The rail lists what this berth offers.');
  state.simTime = 15;
  owner._showHint('firstCombat', 'Hostile on scope.');
  state.simTime = 30;
  setRailOwnsVoice(false);
  owner._drainHintQueue();
  assert.deepEqual(shown, ['firstCombat'], 'the 30-second-old tip is history; the fresh one speaks');
  assert.deepEqual(state.player.hints, { firstCombat: true }, 'the dropped tip is not marked seen');
  owner._firstUseHintUntilS = -Infinity;
  owner._showHint('firstHub', 'The rail lists what this berth offers.');
  assert.deepEqual(shown, ['firstCombat', 'firstHub'], 'the dropped tip speaks the next time its situation comes round');
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

test('a tip held across a berth is dropped: a station tip never speaks in open space after undocking', () => {
  const { owner, state, shown, setRailOwnsVoice } = fixture();
  // Docked: the rail owns the voice, so the berth tip waits.
  owner._dockEpoch = 1;
  owner._showHint('firstHub', "Pick a service above. Undock when you're ready.");
  // Sim time stands still at the berth; the pilot undocks a few seconds of sim later.
  owner._dockEpoch = 2;
  state.simTime = 3;
  setRailOwnsVoice(false);
  owner._drainHintQueue();
  assert.deepEqual(shown, [], 'the berth tip belongs to the berth, not to the flight after it');
  assert.deepEqual(state.player.hints, {}, 'the dropped tip is not marked seen, so the next berth can say it');
  owner._showHint('firstCombat', 'Return fire.');
  assert.deepEqual(shown, ['firstCombat'], 'a tip raised in this flight still speaks');
});

test('Return fire is for hostile fire, not a rock that bumped the hull', async () => {
  const { damageIsHostileFire } = await import('../src/systems/onboarding.js');
  const state = { playerId: 1, entities: new Map([[2, { id: 2, type: 'asteroid' }], [3, { id: 3, type: 'ship' }]]) };
  assert.equal(damageIsHostileFire(state, { attackerId: 2, origin: { kind: 'collision' } }), false, 'a rock collision is not a fight');
  assert.equal(damageIsHostileFire(state, { attackerId: 3, origin: { kind: 'collision' } }), false, 'a hull bump is not a fight');
  assert.equal(damageIsHostileFire(state, { attackerId: 1, origin: { kind: 'thrown_mass' } }), false, 'the pilot\'s own throw is not a fight');
  assert.equal(damageIsHostileFire(state, { attackerId: 3, origin: { kind: 'weapon' } }), true, 'a ship firing on the pilot is');
  assert.equal(damageIsHostileFire(state, { attackerId: 3 }), true, 'a ship hit with no origin recorded still counts');
});
