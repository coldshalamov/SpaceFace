// test/economy-trade-refusal.test.mjs — ECON-03: a failed trade refuses aloud on the comms
// voice. The row's DO-NOT forbids the UI blip: no sfx_ui_error, the voice line carries the
// reason word and is captioned by the voice pipeline. (A duplicate _onTradeFailed that played
// the blip + a second caption shadowed this handler until it was removed — keep this test
// asserting the voice route so the shadow cannot quietly return.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { audio, TRADE_REFUSAL_WORD } from '../src/audio/audioSystem.js';
import { economy } from '../src/systems/economy.js';

test('ECON-03: the refusal word table maps known failure reasons to spoken words', () => {
  assert.equal(TRADE_REFUSAL_WORD.credits, 'insufficient credits');
  assert.equal(TRADE_REFUSAL_WORD.cargo_full, 'hold full');
  assert.equal(TRADE_REFUSAL_WORD.no_cargo, 'nothing aboard to sell');
  assert.equal(TRADE_REFUSAL_WORD.no_stock, 'out of stock');
  assert.equal(TRADE_REFUSAL_WORD.not_docked, 'not docked');
});

test('ECON-03: on seed 4242 economy:tradeFailed routes to the refusal voice with reason captioned', () => {
  const state = createGameState(4242);
  const bus = new EventBus();

  // Mock audio system instance without real WebAudio context
  const audioInst = Object.create(audio);
  const played = [];
  const said = [];

  audioInst.state = state;
  audioInst.bus = bus;
  audioInst.rt = { _signatureLastAt: {} };
  audioInst.play = (id, opts) => {
    played.push({ id, opts });
    return { stop: () => {} };
  };

  bus.on('voice:say', (p) => said.push(p));

  // Initialize audio system event wiring
  audioInst.init({ state, bus });

  // 1. Insufficient credits: one comms line naming the reason, no menu blip
  bus.emit('economy:tradeFailed', {
    stationId: 'station_helios',
    commodityId: 'cmdty_quantum_cores',
    side: 'buy',
    qty: 1,
    reason: 'credits',
  });

  assert.equal(said.length, 1, 'the refusal voice answers once');
  assert.equal(said[0].channel, 'comms');
  assert.equal(said[0].id, 'economy:tradeFailed:credits');
  assert.match(said[0].text, /insufficient credits/i);
  assert.equal(played.filter((p) => p.id === 'sfx_ui_error').length, 0, 'the refusal is not the UI blip');

  // 2. Hold full speaks its own word
  said.length = 0;
  bus.emit('economy:tradeFailed', {
    stationId: 'station_helios',
    commodityId: 'cmdty_ore_iron',
    side: 'buy',
    qty: 10,
    reason: 'cargo_full',
  });

  assert.equal(said.length, 1);
  assert.equal(said[0].id, 'economy:tradeFailed:cargo_full');
  assert.match(said[0].text, /hold full/i);
});

test('ECON-03: economy.handleTrade failure automatically drives the refusal voice on seed 4242', () => {
  const state = createGameState(4242);
  const bus = new EventBus();

  const audioInst = Object.create(audio);
  const played = [];
  const said = [];

  audioInst.state = state;
  audioInst.bus = bus;
  audioInst.rt = { _signatureLastAt: {} };
  audioInst.play = (id, opts) => {
    played.push({ id, opts });
    return { stop: () => {} };
  };

  bus.on('voice:say', (p) => said.push(p));
  audioInst.init({ state, bus });

  const econ = Object.create(economy);
  econ.init({ state, bus });

  // Player attempts trade while not docked -> fails with not_docked
  econ.handleTrade('cmdty_ore_iron', 'buy', 1);

  assert.ok(said.some((p) => p.channel === 'comms' && /not docked/i.test(p.text)),
    'the comms voice names the refusal reason');
  // handleTrade also raises an error toast, whose own blip is a separate authored route —
  // the previous test pins that tradeFailed itself never triggers sfx_ui_error.
});
