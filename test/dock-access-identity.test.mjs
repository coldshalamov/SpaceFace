import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDockDeny } from '../src/core/dockAccess.js';

test('entity, station record and string references resolve the same live berth refusal', () => {
  const station = {
    id: 900, type: 'station', alive: true,
    data: { stationId: 'station_ceres', name: 'Ceres Refinery' },
  };
  const state = {
    player: { debt: 450 }, entityList: [station],
    economy: { stationConditions: { station_ceres: { grudge: { untilPaidCr: 0 } } } },
  };
  const expected = resolveDockDeny(state, 'station_ceres');
  assert.equal(expected.reason, 'grudge');
  assert.deepEqual(resolveDockDeny(state, station), expected,
    'the transient entity id must not replace the persistent berth id');
  assert.deepEqual(resolveDockDeny(state, { ...station.data, id: 'station_ceres' }), expected);
  state.player.debt = 0;
  assert.equal(resolveDockDeny(state, station), null);
});
