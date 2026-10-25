// A cracked hull that runs its tank dry is not told the weep sealed. Seed 4242.
// The weep stays open until the plating is back or the ship is berthed.
// The band, the rate, and the two sentences stay as they are.
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

function hostWith(hull, hullMax, { docked = false, fuel = 1 } = {}) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.playerId = 1;
  state.simTime = 4;
  state.fuel.current = fuel;
  state.ui.docked = docked;
  state.entities.set(1, {
    id: 1,
    alive: true,
    hull,
    hullMax,
    flags: { docked },
    pos: { x: 0, y: 0, z: 0 },
  });
  const toasts = [];
  const host = {
    state,
    bus: { emit(type, payload) { if (type === 'toast') toasts.push(payload); } },
    _spendFuel: world._spendFuel,
  };
  return { host, state, toasts };
}

test('an empty tank on a cracked hull does not seal the weep', () => {
  const { host, state, toasts } = hostWith(20, 80);
  const first = stepFuelWeep(host, 1, state);
  assert.equal(first.started, true);
  assert.equal(first.leaked, 1);
  assert.equal(state.fuel.current, 0);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, FUEL_WEEP_START);

  const dry = stepFuelWeep(host, 1, state);
  assert.equal(dry.sealed, false);
  assert.equal(dry.started, false);
  assert.equal(dry.leaked, 0);
  assert.equal(toasts.length, 1);

  state.fuel.current = 10;
  const again = stepFuelWeep(host, 1, state);
  assert.equal(again.started, false);
  assert.equal(again.sealed, false);
  assert.equal(again.leaked, FUEL_WEEP_PER_S);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, FUEL_WEEP_START);

  state.entities.get(1).hull = 80;
  const sealed = stepFuelWeep(host, 1, state);
  assert.equal(sealed.sealed, true);
  assert.equal(sealed.leaked, 0);
  assert.equal(toasts.length, 2);
  assert.equal(toasts[1].text, FUEL_WEEP_SEAL);
});

test('berthing a dry cracked hull still seals the weep', () => {
  const { host, state, toasts } = hostWith(20, 80);
  stepFuelWeep(host, 1, state);
  assert.equal(state.fuel.current, 0);
  state.ui.docked = true;
  state.entities.get(1).flags.docked = true;
  const berthed = stepFuelWeep(host, 1, state);
  assert.equal(berthed.sealed, true);
  assert.equal(berthed.leaked, 0);
  assert.equal(toasts[1].text, FUEL_WEEP_SEAL);
});
