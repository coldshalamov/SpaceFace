// A jump spool cuts cruise. The stick does not stumble. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { cruise } from '../src/systems/cruise.js';

function rig(phase) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 8;
  state.player.cruise = { phase, t: phase === 'off' ? 0 : 3, stumbleT: 0, stumbleCdT: 0 };
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
  cruise.init({ state, bus, helpers: null });
  return { state, bus, events };
}

test('seed 4242: a jump spool cuts a live cruise without a stumble', () => {
  const { state, bus, events } = rig('cruising');
  bus.emit('jump:chargeStart', { playerId: 1, via: 'drive', targetSectorId: 'sector_kepler' });
  assert.equal(state.player.cruise.phase, 'off');
  assert.equal(state.player.cruise.stumbleT, 0);
  const dropped = events.find((e) => e.type === 'cruise:dropped');
  assert.ok(dropped);
  assert.equal(dropped.payload.reason, 'jump');
  assert.equal(dropped.payload.was, 'cruising');
  const toast = events.find((e) => e.type === 'toast');
  assert.equal(toast.payload.text, 'Jump spool — cruise cut');

  events.length = 0;
  state.player.cruise.phase = 'cruising';
  const before = events.length;
  bus.emit('jump:chargeStart', { playerId: 4, via: 'drive' });
  assert.equal(state.player.cruise.phase, 'cruising');
  assert.equal(events.slice(before).some((e) => e.type === 'toast' || e.type === 'cruise:dropped'), false);
});

test('seed 4242: a charging cruise is cut too, and an idle cruise stays quiet', () => {
  const charging = rig('charging');
  charging.bus.emit('jump:chargeStart', { playerId: 1, via: 'gate' });
  assert.equal(charging.state.player.cruise.phase, 'off');
  assert.equal(charging.state.player.cruise.t, 0);
  assert.equal(charging.events.some((e) => e.type === 'toast' && e.payload.text === 'Jump spool — cruise cut'), true);

  const idle = rig('off');
  idle.bus.emit('jump:chargeStart', { playerId: 1, via: 'drive' });
  assert.equal(idle.state.player.cruise.phase, 'off');
  assert.equal(idle.events.some((e) => e.type === 'toast'), false);
  assert.equal(idle.events.some((e) => e.type === 'cruise:dropped'), false);
});
