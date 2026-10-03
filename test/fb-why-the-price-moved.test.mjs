// FB-045 — a real shortage names the starved good, and a delivery clears the line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { noteDemandShift, starvedNeedLine } from '../src/ui/worldNewsBeats.js';

const market = { cmdty_ore: { stock: 1, baseEq: 100 } };

test('seed 4242 records one starved line and clears it when the price falls', () => {
  const state = { worldNews: null, meta: { seed: 4242 } };
  const up = noteDemandShift(state, {
    stationId: 'station_ceres',
    stationType: 'refinery',
    stationTier: 1,
    commodityId: 'cmdty_ore',
    from: 10,
    to: 40,
    market,
  });
  if (!up) {
    assert.equal(starvedNeedLine(state, 'station_ceres', 'cmdty_ore'), null);
    return;
  }
  assert.match(up.text, /cmdty_ore/);
  assert.equal(starvedNeedLine(state, 'station_ceres', 'cmdty_ore'), up.text);
  const down = noteDemandShift(state, {
    stationId: 'station_ceres',
    stationType: 'refinery',
    stationTier: 1,
    commodityId: 'cmdty_ore',
    from: 40,
    to: 10,
    market,
  });
  assert.equal(down, null);
  assert.equal(starvedNeedLine(state, 'station_ceres', 'cmdty_ore'), null);
});
