// ECON-03: a failed trade refuses with its reason — economy.js emits economy:tradeFailed and
// audioSystem routes it to the comms voice with the reason word captioned. Not the ui blip.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { audio, TRADE_REFUSAL_WORD } from '../src/audio/audioSystem.js';

const SEED = 4242;

function harness() {
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  });
  player.id = 1;
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: player.id,
    player: { heat: 0 },
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    settings: { video: {}, accessibility: { captions: false } },
    world: { currentSectorId: 'sector_helios' },
    entities: new Map([[player.id, player]]),
    entityList: [player],
  };
  const bus = createBus();
  const ear = Object.create(audio);
  ear.init({ state, bus });
  const said = [];
  const played = [];
  bus.on('voice:say', (p) => said.push(p));
  ear.play = (recipeId) => { played.push(recipeId); return { recipeId }; };
  return { state, bus, ear, said, played };
}

test('ECON-03: a refused trade speaks its reason on the comms voice', () => {
  const h = harness();
  h.bus.emit('economy:tradeFailed', {
    stationId: 'st_helios', commodityId: 'cmdty_ore_iron', side: 'buy', qty: 4, reason: 'no_stock',
  });
  const lines = h.said.filter((p) => p.channel === 'comms');
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /out of stock/i);
  assert.equal(lines[0].id, 'economy:tradeFailed:no_stock');
  assert.equal(h.played.includes('sfx_ui_error'), false, 'no menu blip — the voice is the refusal');
});

test('ECON-03: every emitted reason has a refusal word', () => {
  const h = harness();
  for (const reason of ['not_docked', 'credits', 'cargo_full', 'no_cargo', 'mission_cargo_locked',
    'black_market_locked', 'no_stock', 'price_changed', 'contamination_refusal']) {
    assert.ok(TRADE_REFUSAL_WORD[reason], `reason ${reason} has a refusal word`);
    h.bus.emit('economy:tradeFailed', { stationId: 'st_helios', reason });
  }
  assert.equal(h.said.length, 9, 'one line per emitted failure');
  const unknown = h.said;
  h.bus.emit('economy:tradeFailed', { stationId: 'st_helios', reason: 'weird_future_reason' });
  assert.equal(unknown.length, 10, 'unknown reasons still refuse aloud');
  assert.match(unknown[9].text, /cannot complete/);
});

test('ECON-03: the not-docked refusal speaks too', () => {
  const h = harness();
  h.bus.emit('economy:tradeFailed', { stationId: null, reason: 'not_docked', side: 'sell', qty: 2 });
  assert.equal(h.said.length, 1);
  assert.match(h.said[0].text, /not docked/i);
});
