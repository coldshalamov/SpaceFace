// A live price jump does not carry the yard type or the stock board.
// The headline still names a hopper that is actually thin. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';
import { noteDemandShift, starvedNeedLine } from '../src/ui/worldNewsBeats.js';

function stateWith(stationId, stock, baseEq = 100) {
  return {
    meta: { seed: 4242 },
    worldNews: null,
    economy: {
      markets: {
        [stationId]: {
          cmdty_ore_iron: { stock, baseEq },
        },
      },
    },
  };
}

function liveJump(state, stationId, from, to) {
  return noteDemandShift(state, {
    stationId,
    commodityId: 'cmdty_ore_iron',
    from,
    to,
    causes: null,
    depletion: false,
  });
}

test('thin iron at Ceres Refinery is said out loud when the price jumps', () => {
  const state = stateWith('station_ceres', 1);
  const up = liveJump(state, 'station_ceres', 1, 1.4);
  assert.ok(up);
  assert.match(up.text, /Iron Ore/);
  assert.match(up.text, /Ceres Refinery/);
  assert.doesNotMatch(up.text, /cmdty_|station_/);
  assert.equal(starvedNeedLine(state, 'station_ceres', 'cmdty_ore_iron'), up.text);

  const down = liveJump(state, 'station_ceres', 1.4, 1);
  assert.equal(down, null);
  assert.equal(starvedNeedLine(state, 'station_ceres', 'cmdty_ore_iron'), null);
});

test('a full hopper and a trade hub stay quiet', () => {
  const full = stateWith('station_ceres', 100);
  assert.equal(liveJump(full, 'station_ceres', 1, 1.4), null);

  const helios = stateWith('station_helios', 1);
  assert.equal(liveJump(helios, 'station_helios', 1, 1.4), null);

  const otherGood = stateWith('station_ceres', 1);
  const copper = noteDemandShift(otherGood, {
    stationId: 'station_ceres',
    commodityId: 'cmdty_ore_copper',
    from: 1,
    to: 1.4,
    causes: null,
    depletion: false,
  });
  assert.equal(copper, null);
});
