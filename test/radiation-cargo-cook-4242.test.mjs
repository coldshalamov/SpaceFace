import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { addCargo } from '../src/systems/cargo.js';
import { world } from '../src/systems/world.js';
import {
  RADIATION_CARGO_COOK_S,
  stepRadiationCargoCook,
} from '../src/systems/fragileCargo.js';

const FRAGILE_ID = 'cmdty_crystal_silica';
const TOUGH_ID = 'cmdty_ore_iron';

function hold(seed = 4242) {
  const state = createGameState(seed);
  state.simTime = 40;
  state.meta.seed = seed;
  assert.equal(addCargo(state, FRAGILE_ID, 2), 2);
  assert.equal(addCargo(state, TOUGH_ID, 5), 5);
  return state;
}

test('seed 4242 radiation cooks fragile cargo before ordinary ore', () => {
  const state = hold();
  const bus = createBus();
  const cooked = [];
  const toasts = [];
  bus.on('cargo:radiationCooked', (row) => cooked.push(row));
  bus.on('toast', (row) => toasts.push(row));
  assert.equal(stepRadiationCargoCook(state, { dt: RADIATION_CARGO_COOK_S - 0.1, intensity: 1, bus }), null);
  assert.equal(state.player.cargo.items[FRAGILE_ID], 2);
  const first = stepRadiationCargoCook(state, { dt: 0.1, intensity: 1, bus });
  assert.equal(first.commodityId, FRAGILE_ID);
  assert.equal(first.qty, 1);
  assert.equal(typeof first.name, 'string');
  assert.ok(first.name.length > 1);
  assert.equal(state.player.cargo.items[FRAGILE_ID], 1);
  assert.equal(state.player.cargo.items[TOUGH_ID], 5);
  assert.match(toasts[0].text, new RegExp(first.name));
  const second = stepRadiationCargoCook(state, { dt: RADIATION_CARGO_COOK_S, intensity: 1, bus });
  assert.equal(second.commodityId, FRAGILE_ID);
  assert.equal(state.player.cargo.items[FRAGILE_ID], undefined);
  const third = stepRadiationCargoCook(state, { dt: RADIATION_CARGO_COOK_S, intensity: 1, bus });
  assert.equal(third.commodityId, TOUGH_ID);
  assert.equal(state.player.cargo.items[TOUGH_ID], 4);
  assert.equal(cooked.length, 3);
  bus.clear();
});

test('seed 4242 a docked hull does not cook, and the live radiation tick does', () => {
  const docked = hold();
  docked.ui.docked = true;
  assert.equal(stepRadiationCargoCook(docked, { dt: 20, intensity: 1 }), null);
  assert.equal(docked.player.cargo.items[FRAGILE_ID], 2);

  const state = hold();
  const bus = createBus();
  const player = { id: state.playerId, alive: true, pos: { x: 0, z: 0 } };
  const host = {
    bus,
    registry: null,
    helpers: {},
    _hazardEffectiveIntensity() { return 1; },
    _applyRadiationVitalsFallback() {},
  };
  world._applyRadiationTick.call(host, player, { id: 'zone_rad', type: 'radiation' }, RADIATION_CARGO_COOK_S, state);
  assert.equal(state.player.cargo.items[FRAGILE_ID], 1);
  assert.equal(state.player.cargo.items[TOUGH_ID], 5);
  bus.clear();
});
