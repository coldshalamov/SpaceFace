// Kill loot already sits on player.salvageBay.items. The cargo tip used to report only fill.
import test from 'node:test';
import assert from 'node:assert/strict';

import { salvageBayReading } from '../src/systems/cargo.js';

function bayState(items, usedVolume = 0) {
  return {
    player: {
      cargo: { capVolume: 80 },
      salvageBay: { items, usedVolume },
    },
  };
}

test('a stocked salvage bay names each commodity and quantity in stable order', () => {
  const items = { cmdty_scrap_metal: 7, cmdty_ore_iron: 2 };
  const before = JSON.stringify(items);
  const reading = salvageBayReading(bayState(items, 9));
  assert.equal(JSON.stringify(items), before, 'the reading does not write the bay');
  assert.equal(reading.units, 9);
  assert.equal(reading.summary, 'Iron Ore: 2, Scrap Metal: 7');
  const flipped = salvageBayReading(bayState({ cmdty_ore_iron: 2, cmdty_scrap_metal: 7 }, 9));
  assert.equal(flipped.summary, reading.summary);
  const unknown = salvageBayReading(bayState({ cmdty_not_a_real_good: 3 }, 3));
  assert.equal(unknown.summary, 'cmdty_not_a_real_good: 3');
});

test('an empty salvage bay does not invent a summary', () => {
  assert.equal(salvageBayReading({ player: { cargo: { capVolume: 80 } } }), null);
  const empty = salvageBayReading(bayState({}));
  assert.equal(empty.units, 0);
  assert.equal(Object.hasOwn(empty, 'summary'), false);
  const zeros = salvageBayReading(bayState({ cmdty_ore: 0, cmdty_scrap_metal: 0 }));
  assert.equal(zeros.units, 0);
  assert.equal(Object.hasOwn(zeros, 'summary'), false);
});
