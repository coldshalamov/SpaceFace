import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { economy } from '../src/systems/economy.js';
import { addCargo } from '../src/systems/cargo.js';

// INFERENCE-21 (WF-04): stations posting 'scan'/'toll' (Customs Gate in Tethys, Dione Customs
// in Dione Lane) advertised checkpoint services that never ran — docking did nothing. The
// berth now sweeps the hold through the shipped runScan path and collects the posted toll.

function harness(credits = 5000) {
  const state = createGameState(1);
  state.player.credits = credits;
  const events = [];
  const listeners = new Map();
  const bus = {
    on(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
      return () => {};
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
  const sys = Object.create(economy);
  sys.init({ state, bus, helpers: {} });
  return { state, sys, bus, events };
}

test('clean dock at a customs post sweeps the hold and collects the posted toll', () => {
  const { state, bus, events } = harness();
  bus.emit('dock:docked', { stationId: 'station_customs' });
  const scans = events.filter((e) => e.name === 'player:scannedByPatrol');
  assert.equal(scans.length, 1);
  assert.equal(scans[0].payload.hasContraband, false);
  const tolls = events.filter((e) => e.name === 'credits:changed' && e.payload.reason === 'service:dock_toll');
  assert.equal(tolls.length, 1);
  assert.equal(tolls[0].payload.delta, -180); // 50 + 200 × Tethys security 0.65
  assert.equal(state.player.credits, 5000 - 180);
  assert.ok(events.some((e) => e.name === 'toast' && /manifest reads clean/.test(e.payload.text)));
});

test('the frontier twin checkpoint behaves identically (services tuple, not a hardcoded id)', () => {
  const { state, bus, events } = harness();
  bus.emit('dock:docked', { stationId: 'station_dione_customs' });
  assert.equal(events.filter((e) => e.name === 'player:scannedByPatrol').length, 1);
  const toll = events.find((e) => e.name === 'credits:changed' && e.payload.reason === 'service:dock_toll');
  assert.equal(toll.payload.delta, -186); // 50 + 200 × 0.68
});

test('a hot hold at the checkpoint resolves through the shipped bust path', () => {
  const { state, sys, bus, events } = harness();
  addCargo(state, 'cmdty_narcotics', 2);
  sys._rng = () => 0; // force the detection roll under the scan chance
  bus.emit('dock:docked', { stationId: 'station_customs' });
  assert.ok(events.some((e) => e.name === 'contraband:scanned'), 'bust payload emitted');
  assert.equal((state.player.cargo.items || {}).cmdty_narcotics || 0, 0, 'narcotics confiscated');
  assert.ok(events.some((e) => e.name === 'credits:changed' && e.payload.reason === 'fine:contraband'), 'fine charged');
  assert.ok(events.some((e) => e.name === 'faction:repDelta'), 'rep hit emitted');
});

test('ordinary stations still dock quiet — no phantom checkpoint', () => {
  const { state, bus, events } = harness();
  const before = state.player.credits;
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(events.filter((e) => e.name === 'player:scannedByPatrol').length, 0);
  assert.equal(events.filter((e) => e.name === 'credits:changed' && e.payload.reason === 'service:dock_toll').length, 0);
  assert.equal(state.player.credits, before);
});

test('a clean hold never rolls — zero rng draws on a warm berth', () => {
  const { sys, bus } = harness();
  let rolls = 0;
  sys._rng = () => { rolls += 1; return 0; };
  bus.emit('dock:docked', { stationId: 'station_customs' }); // market/intel seeding owns its own draws
  assert.ok(rolls > 0, 'first dock seeds the berth market');
  rolls = 0;
  bus.emit('dock:docked', { stationId: 'station_customs' });
  assert.equal(rolls, 0, 'clean-hold scan early-returns before any roll');
});

test('the berth toll names its debit on the toast rail', () => {
  const { bus, events } = harness();
  bus.emit('dock:docked', { stationId: 'station_customs' });
  const tollToast = events.find((e) => e.name === 'toast' && /BERTH TOLL — 180 cr/.test(e.payload.text));
  assert.ok(tollToast, 'silent ~180cr debit is the defect — the toll must name itself');
});

test('berth sweeps are tagged so the flight verb deck stays shut', () => {
  const { bus, events } = harness();
  bus.emit('dock:docked', { stationId: 'station_customs' });
  const scan = events.find((e) => e.name === 'player:scannedByPatrol');
  assert.equal(scan.payload.source, 'dock');
  assert.equal(scan.payload.stationId, 'station_customs');
});

test('an evaded hot hold reports evaded, not clean', () => {
  const { state, sys, bus } = harness();
  addCargo(state, 'cmdty_narcotics', 2);
  sys._rng = () => 0.999; // detection roll over the scan chance → evade
  bus.emit('dock:docked', { stationId: 'station_customs' });
  const res = sys.runScan({ security: 0.5, factionId: 'faction_scn', stationId: 'station_customs', source: 'dock' });
  assert.equal(res.found, false);
  assert.equal(res.evaded, true, 'clean vs evaded must be distinguishable to consumers');
  const hot = state.player.customsHotUntil || {};
  assert.ok(Object.keys(hot).length > 0, 'evaded run still marks the faction hot');
});

test('a zero-credit dock skips the toll but still sweeps', () => {
  const { bus, events } = harness(0);
  bus.emit('dock:docked', { stationId: 'station_customs' });
  assert.equal(events.filter((e) => e.name === 'credits:changed' && e.payload.reason === 'service:dock_toll').length, 0);
  assert.equal(events.filter((e) => e.name === 'player:scannedByPatrol').length, 1);
});

test('a live survival run docks without checkpoint machinery', () => {
  const { state, sys, bus, events } = harness();
  state.run = { kind: 'survival', phase: 'wave' };
  addCargo(state, 'cmdty_narcotics', 2);
  sys._rng = () => 0;
  const before = state.player.credits;
  bus.emit('dock:docked', { stationId: 'station_customs' });
  assert.equal(events.filter((e) => e.name === 'player:scannedByPatrol').length, 0);
  assert.equal(state.player.credits, before);
  assert.ok(((state.player.cargo.items || {}).cmdty_narcotics || 0) > 0, 'cargo untouched');
});
