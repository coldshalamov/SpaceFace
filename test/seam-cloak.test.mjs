import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { cloak, fittedCloakModule } from '../src/systems/cloak.js';

function bootCloak() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 0;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 18,
  };
  state.entities.set(1, player);
  state.entityList = [player];
  state.player.ownedShips = [{ fittings: ['mod_cloak_mk1'] }];
  state.player.activeShipIndex = 0;
  state.input.actions = { cloakToggle: false };
  const bus = createBus();
  const system = Object.create(cloak);
  system.init({ state, bus, helpers: {} });
  return { state, bus, system, player };
}

test('fitted cloak module is required to engage, and fire drops an active cloak', () => {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.cloak = true;
  const { state, bus, system } = bootCloak();
  try {
    assert.equal(fittedCloakModule(state)?.id, 'mod_cloak_mk1');

    state.input.actions.cloakToggle = true;
    system.update(1 / 60, state);
    assert.equal(state.massline2.cloak.active, true, 'toggle with charge and a fitted shroud must engage');
    assert.ok(state.massline2.cloak.radius > 0);

    bus.emit('combat:fire', { ownerId: state.playerId });
    assert.equal(state.massline2.cloak.active, false, 'player fire must break cloak');
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});

test('cloak stays dark when the shroud is not fitted', () => {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.cloak = true;
  const { state, bus, system } = bootCloak();
  try {
    state.player.ownedShips[0].fittings = [];
    state.input.actions.cloakToggle = true;
    system.update(1 / 60, state);
    assert.equal(state.massline2.cloak.active, false);
    assert.equal(fittedCloakModule(state), null);
  } finally {
    system.destroy?.();
    bus.clear();
    restoreFeatureMaps(snap);
  }
});
