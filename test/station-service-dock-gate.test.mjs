import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { economy } from '../src/systems/economy.js';

function serviceHarness({ docked = false, stationId = 'station_helios' } = {}) {
  const state = createGameState(1);
  state.player.credits = 1000;
  state.fuel = { current: 10, max: 100 };
  if (docked) {
    state.ui.docked = true;
    state.ui.dockedStationId = stationId;
  }
  const events = [];
  const sys = Object.create(economy);
  sys.state = state;
  sys.bus = { emit(name, payload) { events.push({ name, payload }); } };
  sys._lastDockedStation = docked ? stationId : null;
  return { state, sys, events };
}

test('station services fail closed in open space', () => {
  const { state, sys, events } = serviceHarness({ docked: false });
  sys.handleService({ type: 'refuel', amount: 10 });
  assert.equal(state.fuel.current, 10);
  assert.equal(state.player.credits, 1000);
  assert.equal(events.find((row) => row.name === 'toast')?.payload?.text, 'Dock first');
});

test('station services work at a live berth', () => {
  const { state, sys } = serviceHarness({ docked: true });
  sys.handleService({ type: 'refuel', amount: 10 });
  assert.equal(state.fuel.current, 20);
  assert.ok(state.player.credits < 1000);
});

test('a remembered berth after undock does not sell services in open space', () => {
  const { state, sys, events } = serviceHarness({ docked: false });
  sys._lastDockedStation = 'station_helios';
  state.ui.dockedStationId = 'station_helios';
  sys.handleService({ type: 'repair' });
  assert.equal(state.player.credits, 1000);
  assert.equal(events.find((row) => row.name === 'toast')?.payload?.text, 'Dock first');
});

test('a harness with no UI bag can still run service math', () => {
  const { state, sys } = serviceHarness({ docked: false });
  delete state.ui;
  sys.handleService({ type: 'refuel', amount: 10 });
  assert.equal(state.fuel.current, 20);
  assert.ok(state.player.credits < 1000);
});

test('a live dock:docked latch sells services without uiRoot flipping ui.docked', () => {
  const state = createGameState(1);
  state.player.credits = 1000;
  state.fuel = { current: 10, max: 100 };
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
  assert.equal(state.ui.docked, false);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  sys.handleService({ type: 'refuel', amount: 10 });
  assert.equal(state.fuel.current, 20);
  assert.ok(state.player.credits < 1000);
  bus.emit('dock:undocked', { stationId: 'station_helios' });
  const credits = state.player.credits;
  sys.handleService({ type: 'refuel', amount: 10 });
  assert.equal(state.fuel.current, 20);
  assert.equal(state.player.credits, credits);
  assert.equal(events.filter((row) => row.name === 'toast' && row.payload?.text === 'Dock first').length, 1);
});
