// A cracked hull weeps the tank. An intact hull and a berth do not. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import {
  FUEL_WEEP_PER_S,
  FUEL_WEEP_SEAL,
  FUEL_WEEP_START,
  stepFuelWeep,
} from '../src/systems/fuelWeep.js';
import { world } from '../src/systems/world.js';

function hostWith(hull, hullMax, { docked = false, alive = true, fuel = 80 } = {}) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.playerId = 1;
  state.simTime = 4;
  state.fuel.current = fuel;
  state.ui.docked = docked;
  const player = {
    id: 1,
    alive,
    hull,
    hullMax,
    flags: { docked },
    pos: { x: 0, y: 0, z: 0 },
  };
  state.entities.set(1, player);
  const toasts = [];
  const host = {
    state,
    bus: { emit(type, payload) { if (type === 'toast') toasts.push(payload); } },
    _spendFuel: world._spendFuel,
  };
  return { host, state, toasts, player };
}

test('seed 4242 a cracked hull weeps the tank and says so', () => {
  const { host, state, toasts } = hostWith(20, 80);
  const first = stepFuelWeep(host, 1, state);
  assert.equal(first.started, true);
  assert.equal(first.leaked, FUEL_WEEP_PER_S);
  assert.equal(state.fuel.current, 80 - first.leaked);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, FUEL_WEEP_START);

  const second = stepFuelWeep(host, 1, state);
  assert.equal(second.started, false);
  assert.equal(second.leaked, FUEL_WEEP_PER_S);
  assert.equal(state.fuel.current, 80 - first.leaked - second.leaked);
  assert.equal(toasts.length, 1);

  state.entities.get(1).hull = 80;
  const sealed = stepFuelWeep(host, 1, state);
  assert.equal(sealed.sealed, true);
  assert.equal(sealed.leaked, 0);
  assert.equal(state.fuel.current, 80 - first.leaked - second.leaked);
  assert.equal(toasts[1].text, FUEL_WEEP_SEAL);
});

test('seed 4242 an intact hull, a berth, and a dead ship hold the tank', () => {
  const intact = hostWith(40, 80);
  const held = stepFuelWeep(intact.host, 1, intact.state);
  assert.equal(held.leaked, 0);
  assert.equal(intact.state.fuel.current, 80);
  assert.equal(intact.toasts.length, 0);

  const berthed = hostWith(10, 80, { docked: true });
  const dryDock = stepFuelWeep(berthed.host, 1, berthed.state);
  assert.equal(dryDock.leaked, 0);
  assert.equal(berthed.state.fuel.current, 80);
  assert.equal(berthed.toasts.length, 0);

  const dead = hostWith(10, 80, { alive: false });
  const still = stepFuelWeep(dead.host, 1, dead.state);
  assert.equal(still.leaked, 0);
  assert.equal(dead.state.fuel.current, 80);
});
