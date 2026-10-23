// A hull breach tears a live shroud. A shield graze does not. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { cloak, engageEntityCloak } from '../src/systems/cloak.js';

function rig() {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 4;
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
  state.massline2 = { cloak: { available: true, active: true, energy: 0.7, radius: 320, baseRadius: 320 } };
  cloak.destroy();
  cloak.init({ state, bus });
  return { state, bus, events };
}

test('seed 4242: a hull strike tears the player shroud and a graze does not', () => {
  const { state, bus, events } = rig();
  bus.emit('combat:damage', { targetId: 1, hullDamage: 0 });
  assert.equal(state.massline2.cloak.active, true);
  assert.equal(events.some((e) => e.type === 'toast'), false);

  bus.emit('combat:damage', { targetId: 9, hullDamage: 12 });
  assert.equal(state.massline2.cloak.active, true);

  bus.emit('combat:damage', { targetId: 1, hullDamage: 6 });
  assert.equal(state.massline2.cloak.active, false);
  const torn = events.filter((e) => e.type === 'toast');
  assert.equal(torn.length, 1);
  assert.equal(torn[0].payload.text, 'Hull breach — the shroud tore');
  assert.equal(events.some((e) => e.type === 'cloak:dropped' && e.payload.reason === 'torn'), true);

  events.length = 0;
  bus.emit('combat:damage', { targetId: 1, hullDamage: 6 });
  assert.equal(events.some((e) => e.type === 'toast'), false);
});

test('seed 4242: a hull strike opens a cloaked ship the player can see again', () => {
  const { state, bus } = rig();
  const raider = { id: 4, alive: true, pos: { x: 80, y: 0, z: 0 }, data: {} };
  state.entities.set(4, raider);
  engageEntityCloak(raider, 320, state.simTime);
  assert.equal(raider.data.cloak.active, true);

  bus.emit('combat:damage', { targetId: 4, hullDamage: 0 });
  assert.equal(raider.data.cloak.active, true);

  bus.emit('combat:damage', { targetId: 4, hullDamage: 3 });
  assert.equal(raider.data.cloak.active, false);
  assert.equal(state.massline2.cloak.active, true);
});
