import test from 'node:test';
import assert from 'node:assert/strict';
import { localEconEvent } from '../src/ui/station/barContacts.js';

const events = (list) => ({ economy: { econEvents: list } });

test('RC-30: a Ceres-only event is no tag at Helios', () => {
  const state = events([{ stationId: 'station_ceres', commodityId: 'iron', type: 'glut' }]);
  assert.equal(localEconEvent(state, 'station_helios'), null);
});

test('RC-30: a Helios event is Helios gossip', () => {
  const ev = { stationId: 'station_helios', commodityId: 'iron', type: 'shortage' };
  assert.equal(localEconEvent(events([ev, { stationId: 'station_ceres' }]), 'station_helios'), ev);
});
