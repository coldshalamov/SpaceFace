// INF-11 (WF-07): a claim's supply run is felt when it lands. traffic emits claim:freightDelivered
// (no subscribers before this); the subscribers here are a flight receipt in the claim's sector and a
// dock-card line when the run landed while the pilot was elsewhere. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { claimDeliveryNote } from '../src/ui/worldNewsBeats.js';

function rig({ bodySector = 'sector_helios_prime', legSeq = 2 } = {}) {
  const state = {
    meta: { seed: 4242 },
    simTime: 100,
    mode: 'flight',
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {},
    claims: { bodies: [{ id: 'body_slag', name: 'Slag Claim', sectorId: bodySector }] },
    traffic: { depotServices: [{ bodyId: 'body_slag', legSeq }] },
  };
  const bus = createBus();
  createMarketNews({ state, bus, helpers: {} });
  const toasts = [];
  const published = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('news:publish', (p) => published.push(p));
  return { state, bus, toasts, published };
}

const LINE = 'Depot run landed at Slag Claim: 12 units of supplies.';

test('a delivery in the claim\'s own sector is exactly one flight receipt', () => {
  const r = rig();
  r.bus.emit('claim:freightDelivered', { bodyId: 'body_slag', inbound: true, quantity: 12 });
  assert.equal(r.toasts.length, 1);
  assert.equal(r.toasts[0].text, LINE);
  assert.equal(r.toasts[0].kind, 'good');
  assert.deepEqual(r.state.worldNews.dockLines, [], 'and nothing waits on the dock card');
});

test('a delivery that landed while the pilot was away waits on the next dock card, once', () => {
  const r = rig({ bodySector: 'sector_ceres_belt' });
  r.bus.emit('claim:freightDelivered', { bodyId: 'body_slag', inbound: true, quantity: 12 });
  assert.equal(r.toasts.length, 0, 'no flight receipt for a run the pilot did not see');
  assert.deepEqual(r.state.worldNews.dockLines, [LINE]);
  r.bus.emit('dock:docked', { stationId: 'station_helios' });
  const surfaced = [...r.published.map((p) => String(p.text)), ...r.state.ui.marketNews.log.map((row) => String(row.text))];
  assert.ok(surfaced.some((text) => text.includes(LINE)), `the dock card carries the line (${JSON.stringify(surfaced)})`);
  assert.equal(r.state.worldNews.dockLines.length, 1, 'the card folds the waiting lines into one');
});

test('a duplicate or re-entrant emit for the same leg adds nothing', () => {
  const r = rig();
  const payload = { bodyId: 'body_slag', inbound: true, quantity: 12 };
  r.bus.emit('claim:freightDelivered', payload);
  r.bus.emit('claim:freightDelivered', { ...payload });
  assert.equal(r.toasts.length, 1);
  const away = rig({ bodySector: 'sector_ceres_belt' });
  away.bus.emit('claim:freightDelivered', payload);
  away.bus.emit('claim:freightDelivered', payload);
  assert.equal(away.state.worldNews.dockLines.length, 1);
  // The next leg is a new leg and speaks again.
  r.state.traffic.depotServices[0].legSeq = 4;
  r.bus.emit('claim:freightDelivered', payload);
  assert.equal(r.toasts.length, 2);
});

test('the return berth run (empty) and unknown or malformed deliveries stay silent', () => {
  const r = rig();
  r.bus.emit('claim:freightDelivered', { bodyId: 'body_slag', inbound: false, quantity: 0 });
  r.bus.emit('claim:freightDelivered', { bodyId: 'body_slag', inbound: true, quantity: 0 });
  r.bus.emit('claim:freightDelivered', {});
  r.bus.emit('claim:freightDelivered', null);
  assert.equal(r.toasts.length, 0);
  assert.equal(claimDeliveryNote(r.state, { bodyId: 'body_slag', inbound: true, quantity: 0 }), null);
});

test('an unknown body still names itself by id rather than inventing a place', () => {
  const r = rig();
  r.bus.emit('claim:freightDelivered', { bodyId: 'body_unknown', inbound: true, quantity: 5 });
  assert.equal(r.toasts.length, 0, 'not a known claim in this sector: no flight receipt');
  assert.deepEqual(r.state.worldNews.dockLines, ['Depot run landed at body_unknown: 5 units of supplies.']);
});
