/**
 * WANTED heat is a crime ledger for attacking ships/drones/stations, not for shooting
 * mines/mass-seeds or blasting yourself with impulse plates.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { heat } from '../src/systems/heat.js';

function makeBus() {
  const handlers = {};
  return {
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
    },
    emit(name, payload) {
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
}

function boot() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
  const civilian = { id: 2, type: 'ship', alive: true, team: 2, pos: { x: 40, z: 0 } };
  const mine = { id: 9, type: 'mine', alive: true, team: 1, pos: { x: 20, z: 0 } };
  const massSeed = { id: 10, type: 'massSeed', alive: true, team: 0, pos: { x: 8, z: 0 } };
  const entities = new Map([
    [1, player],
    [2, civilian],
    [9, mine],
    [10, massSeed],
  ]);
  const state = {
    playerId: 1,
    simTime: 12,
    player: { heat: 0 },
    entities,
    entityList: [...entities.values()],
    factions: {},
  };
  const bus = makeBus();
  const sys = Object.create(heat);
  sys.init({ state, bus });
  return { state, bus, sys };
}

test('WANTED heat does not rise when the player damages themselves', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 1,
    amount: 12,
    targetHostileToPlayer: false,
  });
  assert.equal(state.player.heat, 0);
});

test('WANTED heat does not rise for shooting a mine or mass-seed', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 9,
    amount: 10,
    targetHostileToPlayer: false,
  });
  bus.emit('entity:killed', {
    killerId: 1,
    id: 9,
    type: 'mine',
    victimClass: 'mine',
    targetHostileToPlayer: false,
  });
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 10,
    amount: 8,
    targetHostileToPlayer: false,
  });
  assert.equal(state.player.heat, 0);
});

test('WANTED heat still rises for an unprovoked hit on a civilian ship', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 2,
    amount: 6,
    type: 'ship',
    targetHostileToPlayer: false,
  });
  assert.ok(state.player.heat > 0, 'civilian hit must accrue WANTED heat');
});
