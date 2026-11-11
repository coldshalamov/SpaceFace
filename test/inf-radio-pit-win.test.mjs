// inf-radio-pit-win (PL-58): a scored Cull run at the Pit is the yard's news —
// "Lights came up at the Pit last night." The yard only emits pitborn:cullSettled
// when the run scored, so the report opens exactly when the purse lands.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { bandRadio, deriveBandEventKeys } from '../src/systems/bandRadio.js';
import { BAND_EVENT_KEYS, eligibleBandLines, BAND_CHANNEL_BY_ID } from '../src/data/bandRadio.js';

function makeHarness(seed = 47) {
  const bus = createBus();
  const state = { meta: { seed }, simTime: 0, mode: 'flight', ui: { docked: false }, playerId: 'player' };
  const system = Object.create(bandRadio);
  system.init({ state, bus, helpers: {}, registry: { get: () => null } });
  system.newGame();
  return { bus, state };
}

test('a paid cull purse opens the Pit report', () => {
  const h = makeHarness();
  assert.ok(BAND_EVENT_KEYS.includes('player.won_pit'));
  h.bus.emit('pitborn:cullSettled', { score: 320, purse: 0, kills: 4, tick: 10 });
  assert.equal(h.state.bandRadio.eventKeys['player.won_pit'], undefined, 'a dry settle opens nothing');
  h.bus.emit('pitborn:cullSettled', { score: 320, purse: 880, kills: 4, tick: 11 });
  assert.equal(h.state.bandRadio.eventKeys['player.won_pit'], true, 'the purse is the win');
});

test('the authored line is the only Pit report and stays shut until the key opens', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  const lines = (keys) => eligibleBandLines(channel, { eventKeys: keys, reachRep: 0 })
    .filter((line) => line.eventKey === 'player.won_pit');
  assert.equal(lines({}).length, 0);
  assert.equal(lines({ 'player.won_pit': true })[0].text, 'Lights came up at the Pit last night.');
  assert.deepEqual(deriveBandEventKeys('pitborn:cullSettled', { purse: 500 }, {}), ['player.won_pit']);
});
