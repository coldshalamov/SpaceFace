// test/economy-trade-refusal.test.mjs — ECON-03: failed trade audible refusal with captioned reason
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { audio, TRADE_REFUSAL_CAPTIONS } from '../src/audio/audioSystem.js';
import { economy } from '../src/systems/economy.js';

test('ECON-03: trade refusal dictionary maps known failure reasons to readable captions', () => {
  assert.equal(TRADE_REFUSAL_CAPTIONS.credits, 'Insufficient Credits');
  assert.equal(TRADE_REFUSAL_CAPTIONS.cargo_full, 'Hold Full');
  assert.equal(TRADE_REFUSAL_CAPTIONS.tier_unavailable, 'Tier Unavailable');
  assert.equal(TRADE_REFUSAL_CAPTIONS.no_cargo, 'No Cargo');
  assert.equal(TRADE_REFUSAL_CAPTIONS.no_stock, 'Out of Stock');
});

test('ECON-03: on seed 4242 economy:tradeFailed routes to the refusal voice with reason captioned', () => {
  const state = createGameState(4242);
  const bus = new EventBus();

  // Mock audio system instance without real WebAudio context
  const audioInst = Object.create(audio);
  const played = [];
  const captions = [];

  audioInst.state = state;
  audioInst.bus = bus;
  audioInst.rt = { _signatureLastAt: {} };
  audioInst.play = (id, opts) => {
    played.push({ id, opts });
    return { stop: () => {} };
  };

  bus.on('presentation:caption', (c) => captions.push(c));

  // Initialize audio system event wiring
  audioInst.init({ state, bus });

  // 1. Emit direct tradeFailed for insufficient credits
  bus.emit('economy:tradeFailed', {
    stationId: 'station_helios',
    commodityId: 'cmdty_quantum_cores',
    side: 'buy',
    qty: 1,
    reason: 'credits',
  });

  assert.equal(played.length, 1, 'refusal sound should play');
  assert.equal(played[0].id, 'sfx_ui_error', 'refusal voice should be sfx_ui_error');
  assert.equal(captions.length, 1, 'presentation:caption should be emitted');
  assert.equal(captions[0].text, 'Insufficient Credits');
  assert.equal(captions[0].assertive, true);

  // 2. Emit tradeFailed for hold full
  played.length = 0;
  captions.length = 0;
  bus.emit('economy:tradeFailed', {
    stationId: 'station_helios',
    commodityId: 'cmdty_ore_iron',
    side: 'buy',
    qty: 10,
    reason: 'cargo_full',
  });

  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'sfx_ui_error');
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, 'Hold Full');

  // 3. Emit tradeFailed for tier_unavailable
  played.length = 0;
  captions.length = 0;
  bus.emit('economy:tradeFailed', {
    stationId: 'station_helios',
    commodityId: 'cmdty_quantum_cores',
    side: 'buy',
    qty: 1,
    reason: 'tier_unavailable',
  });

  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'sfx_ui_error');
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, 'Tier Unavailable');
});

test('ECON-03: economy.handleTrade failure automatically drives refusal voice and caption on seed 4242', () => {
  const state = createGameState(4242);
  const bus = new EventBus();

  const audioInst = Object.create(audio);
  const played = [];
  const captions = [];

  audioInst.state = state;
  audioInst.bus = bus;
  audioInst.rt = { _signatureLastAt: {} };
  audioInst.play = (id, opts) => {
    played.push({ id, opts });
    return { stop: () => {} };
  };

  bus.on('presentation:caption', (c) => captions.push(c));
  audioInst.init({ state, bus });

  const econ = Object.create(economy);
  econ.init({ state, bus });

  // Player attempts trade while not docked -> fails with not_docked
  econ.handleTrade('cmdty_ore_iron', 'buy', 1);

  assert.ok(played.some((p) => p.id === 'sfx_ui_error'), 'refusal voice played on trade failure');
  assert.ok(captions.some((c) => c.text === 'Not Docked'), 'caption emitted for trade failure reason');
});
