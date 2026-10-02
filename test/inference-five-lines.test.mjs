import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { harasserDepartingBark } from '../src/systems/barkDirector.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { IDLE_ENGINE_DB, engineIdleCue, stepCueGain, THROTTLE_WINDOWS } from '../src/presentation/throttleAnswer.js';
import { bindFieldAnchorRings } from '../src/render/forceLanguage/fieldForcePresentation.js';

function newsState() {
  return { meta: { seed: 4242 }, simTime: 4, world: { currentSectorId: 'sector_helios_prime' }, ui: {} };
}

test('a harasser that gives up has one departing bark', () => {
  const bark = harasserDepartingBark({ attackerId: 7, targetId: 1 });
  assert.equal(bark.attackerId, 7);
  assert.match(bark.text, /Breaking off/);
  assert.equal(harasserDepartingBark(null), null);
});

test('a resolved frontier rumour is one cited headline and an open rumour is not', () => {
  const state = newsState();
  const bus = createBus();
  createMarketNews({ state, bus, helpers: {} });
  bus.emit('frontierRumor:resolved', { type: 'rumored', rumorId: 'r1', kind: 'cache' });
  assert.equal(state.ui.marketNews.log.length, 0);
  bus.emit('frontierRumor:resolved', { type: 'resolved', rumorId: 'r1', kind: 'cache', sectorId: 'sector_helios_prime', reason: 'found' });
  assert.equal(state.ui.marketNews.log.length, 1);
  assert.match(state.ui.marketNews.log[0].text, /cache/);
  assert.equal(state.ui.marketNews.log[0].sourceRef, 'frontier-resolved:r1');
});

test('a liner receipt and a suspended liner are both cited headlines', () => {
  const state = newsState();
  const bus = createBus();
  createMarketNews({ state, bus, helpers: {} });
  bus.emit('traffic:passengerLinerReceipt', { linerName: 'Helios Dawn', outcome: 'berthed', sectorId: 'sector_helios_prime', receiptId: 'lin-1' });
  bus.emit('traffic:passengerLinerSuspended', { linerName: 'Helios Dawn', sectorId: 'sector_helios_prime', receiptId: 'lin-2' });
  assert.equal(state.ui.marketNews.log.length, 2);
  assert.ok(state.ui.marketNews.log.some((row) => /berthed/.test(row.text)));
  assert.ok(state.ui.marketNews.log.some((row) => /suspended/.test(row.text)));
  for (const row of state.ui.marketNews.log) assert.ok(row.sourceRef);
});

test('undock idle is at most -30 dB and zero throttle in flight stays silent', () => {
  assert.ok(IDLE_ENGINE_DB <= -30);
  assert.equal(THROTTLE_WINDOWS.darkS, 0.25);
  const undock = engineIdleCue({ undockIdle: true, throttle: 0, dt: 0.25 });
  assert.equal(undock.play, true);
  assert.equal(undock.recipe, 'sfx_engine_idle');
  assert.ok(undock.db <= -30);
  const flight = engineIdleCue({ undockIdle: false, throttle: 0, gain: 0.72, dt: 0.25 });
  assert.equal(flight.play, false);
  assert.equal(flight.silent, true);
  const stepped = stepCueGain(0.72, 0, 0.25);
  assert.equal(stepped.target, 0);
  assert.ok(stepped.gain < 0.72);
});

test('a field anchor ring is added and a clear removes it', () => {
  const rings = new Map();
  const bus = createBus();
  bindFieldAnchorRings(bus, rings);
  bus.emit('fields:anchorRegistered', { fieldId: 'well-1', kind: 'well', radius: 40, pos: { x: 3, z: 9 } });
  bus.emit('fields:anchorRegistered', { fieldId: 'hidden', playerVisible: false, pos: { x: 1, z: 1 } });
  assert.equal(rings.size, 1);
  assert.equal(rings.get('well-1').x, 3);
  bus.emit('fields:cleared', { reason: 'sector' });
  assert.equal(rings.size, 0);
});
