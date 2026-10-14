// Test verifying that dockArrival surfaces service gaps (e.g. missing refuel/repair) for stations lacking those facilities
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDockArrival, stationServiceGaps } from '../src/ui/dockArrival.js';

function baseState() {
  return {
    player: { heat: 0, cargo: { usedVolume: 0, items: {} } },
    missions: { active: [] },
    ui: { marketNews: { log: [], lastCard: null } },
    stationLife: { traffic: [] },
  };
}

test('full-service station has no service gaps or notice', () => {
  const station = {
    id: 'station_helios',
    name: 'Helios Station',
    services: ['trade', 'repair', 'refuel', 'missions'],
  };
  const view = buildDockArrival(baseState(), station);
  assert.deepEqual(view.serviceGaps, []);
  assert.equal(view.serviceNotice, null);
  assert.equal(view.lines.some((l) => l.includes('Berth notice')), false);
});

test('outpost lacking repair and refuel announces berth service gaps', () => {
  const station = {
    id: 'station_beltout',
    name: 'Belt Outpost',
    services: ['trade', 'missions', 'ore_buy'],
  };
  const view = buildDockArrival(baseState(), station);
  assert.deepEqual(view.serviceGaps, ['refuel', 'repair']);
  assert.equal(view.serviceNotice, 'Berth notice: no refuel or repair on site');
  assert.ok(view.lines.includes('Berth notice: no refuel or repair on site'));
});

test('outpost lacking only repair announces missing repair', () => {
  const station = {
    id: 'station_outpost_fuel',
    name: 'Fuel Depot',
    services: ['trade', 'refuel'],
  };
  const view = buildDockArrival(baseState(), station);
  assert.deepEqual(view.serviceGaps, ['repair']);
  assert.equal(view.serviceNotice, 'Berth notice: no repair on site');
  assert.ok(view.lines.includes('Berth notice: no repair on site'));
});

test('a busy berth with every card producer still shows the gap notice within seven lines', () => {
  const state = baseState();
  state.ui.marketNews.log.push({ stationId: 'station_beltout', text: 'Refinery lot posted: 12u refined metals.' });
  state.stationLife.traffic.push({ stationId: 'station_beltout', text: 'Hauler Tann docked with the slag run.' });
  state.player.heat = 40;
  const station = {
    id: 'station_beltout',
    name: 'Belt Outpost',
    services: ['trade', 'missions'],
  };
  const view = buildDockArrival(state, station);
  // Label + berth + return + the notice all survive the slice; the wanted flag
  // (paperwork) may too, but the notice may never be the line that falls off.
  assert.ok(view.lines.includes('Berth notice: no refuel or repair on site'),
    `notice must survive the seven-line slice, got: ${JSON.stringify(view.lines)}`);
  const noticeAt = view.lines.indexOf('Berth notice: no refuel or repair on site');
  assert.ok(noticeAt <= 3, 'only the core identity lines may precede the gap notice');
  assert.ok(noticeAt < view.lines.indexOf('Refinery lot posted: 12u refined metals.'),
    'the gap notice outranks news flavor');
});

test('stationServiceGaps is the one shared rule for berth and chart', () => {
  assert.deepEqual(stationServiceGaps({ services: ['trade', 'refuel', 'repair'] }), []);
  assert.deepEqual(stationServiceGaps({ services: ['trade'] }), ['refuel', 'repair']);
  assert.deepEqual(stationServiceGaps({}), []);
  assert.deepEqual(stationServiceGaps(null), []);
});
