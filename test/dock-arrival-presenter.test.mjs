import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDockArrival } from '../src/ui/dockArrival.js';

function fixture() {
  return {
    player: { heat: 0, cargo: { usedVolume: 0, items: {} } },
    missions: { active: [] },
    ui: { marketNews: { log: [
      { stationId: 'station_remote', text: 'Remote headline.' },
      { stationId: 'station_helios', text: 'Helios fuel deliveries are late.' },
    ], lastCard: null } },
    stationLife: { traffic: [
      { stationId: 'station_remote', text: 'Remote freighter docked.' },
      { stationId: 'station_helios', text: 'Iron Ore shipment cleared berth · 8u.' },
    ] },
  };
}

const HELIOS = { id: 'station_helios', name: 'Helios Station', services: ['trade', 'repair', 'refuel'] };

test('arrival presenter is local, deterministic, compact, and pure', () => {
  const state = fixture();
  const before = structuredClone(state);
  const first = buildDockArrival(state, HELIOS);
  assert.deepEqual(state, before);
  assert.deepEqual(first, buildDockArrival(state, HELIOS));
  assert.equal(first.identity, 'Helios Station');
  assert.equal(first.primaryTarget, 'missions');
  assert.equal(first.news, 'Helios fuel deliveries are late.');
  assert.equal(first.traffic, 'Iron Ore shipment cleared berth · 8u.');
  assert.ok(first.lines.length <= 4);
  assert.ok(!first.lines.some((line) => line.includes('Remote')));
});

test('primary action and paperwork reflect real cargo and heat', () => {
  const state = fixture();
  state.player.cargo.usedVolume = 3;
  state.player.cargo.items.cmdty_stolen_goods = 2;
  let view = buildDockArrival(state, HELIOS);
  assert.equal(view.primaryTarget, 'hold');
  assert.match(view.paperwork, /customs scan/);
  state.player.heat = 0.2;
  view = buildDockArrival(state, HELIOS);
  assert.match(view.paperwork, /Wanted status/);
  assert.ok(view.lines.length <= 4);
});

test('quiet clean station invents no news, traffic, or paperwork', () => {
  const state = fixture();
  state.ui.marketNews.log = [];
  state.stationLife.traffic = [];
  const view = buildDockArrival(state, HELIOS);
  assert.equal(view.news, null);
  assert.equal(view.traffic, null);
  assert.equal(view.paperwork, null);
  assert.deepEqual(view.lines, ['Take a local contract']);
});

