// A drive spool burns the shroud off. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { cloak } from '../src/systems/cloak.js';

function rig() {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 6;
  state.massline2 = {
    cloak: { available: true, active: true, energy: 0.8, radius: 320, baseRadius: 320 },
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

test('seed 4242: the player drive spool burns the shroud off', () => {
  const { state, bus, events } = rig();
  bus.emit('jump:chargeStart', { playerId: 1, via: 'drive', targetSectorId: 'sector_kepler' });
  assert.equal(state.massline2.cloak.active, false);
  const torn = events.filter((e) => e.type === 'toast');
  assert.equal(torn.length, 1);
  assert.equal(torn[0].payload.text, 'Drive spool — the shroud burned off');
  assert.equal(events.some((e) => e.type === 'cloak:dropped' && e.payload.reason === 'spooled'), true);

  events.length = 0;
  state.massline2.cloak.active = true;
  bus.emit('jump:chargeStart', { playerId: 9, via: 'drive' });
  assert.equal(state.massline2.cloak.active, true);
  assert.equal(events.some((e) => e.type === 'toast'), false);
});

test('seed 4242: a gate spool also lights the shroud, and a dark ship stays quiet', () => {
  const lit = rig();
  lit.bus.emit('jump:chargeStart', { playerId: 1, via: 'gate', chargeNeeded: 3 });
  assert.equal(lit.state.massline2.cloak.active, false);
  assert.equal(lit.events.some((e) => e.type === 'toast' && e.payload.text === 'Drive spool — the shroud burned off'), true);

  const dark = rig();
  dark.state.massline2.cloak.active = false;
  dark.bus.emit('jump:chargeStart', { playerId: 1, via: 'drive' });
  assert.equal(dark.state.massline2.cloak.active, false);
  assert.equal(dark.events.some((e) => e.type === 'toast'), false);
  assert.equal(dark.events.some((e) => e.type === 'cloak:dropped'), false);
});
