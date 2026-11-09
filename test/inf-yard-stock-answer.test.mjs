/**
 * inf-yard-stock-answer — a fabrication line's shortfall names what the yard itself stocks.
 *
 * WF-14 (information). A short input used to say only "Short N Name" and punt the player to the
 * market with "Source in market"; whether this berth could actually cover the shortfall was
 * knowable only by walking there and back — and a dry yard made the walk a dead end with no
 * word about when supply returns. Now the line answers: src/ui/station/screens/industry.js
 * reads the docked berth's market mirror (the same rows the Market screen prints) plus its
 * restock outlook, and says "yard holds 9" / "yard holds only 2" / "yard is dry, restock ~3m" /
 * "yard holds none" on the input row, the ladder word and the chain node alike.
 *
 * Focused: owners = src/ui/station/screens/industry.js, src/ui/orrery/chainBeam.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { yardStockAnswer, yardStockOf } from '../src/ui/station/screens/industry.js';

function answer(overrides = {}) {
  return yardStockAnswer({ have: 4, need: 12, yardStock: 8, ...overrides });
}

test('a short input is answered with what the yard holds, covered or not', () => {
  assert.deepEqual(
    { covers: answer().covers, word: answer().word },
    { covers: true, word: 'yard holds 8' },
    'a yard that covers the shortfall says so plainly',
  );
  assert.equal(answer({ yardStock: 3 }).word, 'yard holds only 3', 'a partial yard says only');
  assert.equal(answer({ yardStock: 0 }).word, 'yard holds none', 'a dry yard says none');
  assert.equal(answer({ yardStock: 0, soldOut: true, restockSeconds: 40 }).word,
    'yard is dry, restock ~40s', 'a dry yard names the seconds');
  assert.equal(answer({ yardStock: 0, soldOut: true, restockSeconds: 300 }).word,
    'yard is dry, restock ~5m', 'a dry yard names the minutes');
});

test('a satisfied need asks no yard question and a corrupt read still answers honestly', () => {
  assert.equal(answer({ have: 12 }), null, 'nothing short, no line');
  assert.equal(answer({ have: 20, need: 12 }), null, 'surplus asks no line');
  assert.equal(answer({ yardStock: NaN }).word, 'yard holds none', 'a corrupt stock reads as none, not NaN');
  assert.equal(answer({ need: 'x' }), null, 'a corrupt need fails closed: no invented line');
});

test('the yard read answers from the docked berth without the economy mirror', () => {
  const state = {
    ui: { dockedStationId: 'station_helios_prime' },
    economy: { markets: { station_helios_prime: { cmdty_ore_iron: { stock: 7 } } } },
  };
  const read = yardStockOf(state, 'cmdty_ore_iron');
  assert.deepEqual(read, { stock: 7, soldOut: false, restockSeconds: null },
    'the stocked berth reads its stock and no false restock claim');
  const empty = yardStockOf({ ui: { dockedStationId: 'station_nowhere' } }, 'cmdty_ore_iron');
  assert.deepEqual(empty, { stock: 0, soldOut: false, restockSeconds: null },
    'a berth with no mirror reads zero and files no restock guess');
  const unanchored = yardStockOf(null, 'cmdty_ore_iron');
  assert.equal(unanchored.stock, 0, 'no state reads zero without throwing');
});

test('the answer composes into the ladder word with the shortfall', () => {
  // the render path formats `Short N Name · yard word`; prove the composition shape
  const yard = answer({ yardStock: 2 });
  const line = `Short 8 Iron Ore · ${yard.word}`;
  assert.equal(line, 'Short 8 Iron Ore · yard holds only 2', 'the ladder word reads as one fact');
});
