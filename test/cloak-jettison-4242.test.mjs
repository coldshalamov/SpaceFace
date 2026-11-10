// Dumping cargo blows the shroud off. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { cloak } from '../src/systems/cloak.js';

function rig(active) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 7;
  state.massline2 = {
    cloak: { available: true, active, energy: 0.6, radius: 320, baseRadius: 320 },
  };
  const events = [];
  const handlers = new Map();
  const bus = {
    on(type, fn) {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
      return () => {};
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
  };
  cloak.destroy();
  cloak.init({ state, bus });
  return { state, bus, events };
}

test('seed 4242: dumping cargo blows off a live shroud', () => {
  const { state, bus, events } = rig(true);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 2, legality: 'legal' });
  assert.equal(state.massline2.cloak.active, false);
  const toast = events.find((e) => e.type === 'toast');
  assert.equal(toast.payload.text, 'Cargo dumped — the shroud blew off');
  assert.equal(events.some((e) => e.type === 'cloak:dropped' && e.payload.reason === 'dumped'), true);
});

test('seed 4242: a dark ship stays quiet when cargo dumps', () => {
  const { state, bus, events } = rig(false);
  bus.emit('cargo:jettisoned', { commodityId: 'cmdty_ore_iron', amount: 1 });
  assert.equal(state.massline2.cloak.active, false);
  assert.equal(events.some((e) => e.type === 'toast'), false);
  assert.equal(events.some((e) => e.type === 'cloak:dropped'), false);
});
