// VERB-30: the charge shelf's deployment ceiling is the fitted rack, read through
// the shipped resolver. The × count stays the charges in the hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { readRailModel } from '../src/ui/powerRail.js';
import { resolveImpulseChargeCapacity } from '../src/systems/impulseCharges.js';

const VECTOR_RACK = 'mod_charge_vector_rack';
const TRAP = 'mod_repulsion_trap_s';

function boot() {
  const state = createGameState(4242);
  state.player.ownedShips = [
    { id: 'flown', fittings: [] },
    { id: 'parked', fittings: [] },
  ];
  state.player.activeShipIndex = 0;
  return state;
}

function holdCount(name) {
  const match = String(name).match(/×(\d+)/);
  return match ? Number(match[1]) : 0;
}

test('the flown charge ceiling follows the fitted rack and ignores a parked hull', () => {
  const state = boot();
  const bare = resolveImpulseChargeCapacity(state);
  const bareRail = readRailModel(state, state.simTime);
  assert.equal(bareRail[1].capacity, bare);
  assert.equal(bareRail[1].why, `No impulse charges in cargo · up to ${bare}`);

  state.player.ownedShips[1].fittings = [VECTOR_RACK];
  const parked = resolveImpulseChargeCapacity(state);
  const parkedRail = readRailModel(state, state.simTime);
  assert.equal(parked, bare);
  assert.equal(parkedRail[1].capacity, parked);

  state.player.ownedShips[0].fittings = [VECTOR_RACK];
  const fitted = resolveImpulseChargeCapacity(state);
  const fittedRail = readRailModel(state, state.simTime);
  assert.notEqual(fitted, bare);
  assert.equal(fittedRail[1].capacity, fitted);
  assert.equal(fittedRail[1].why, `No impulse charges in cargo · up to ${fitted}`);
});

test('the shelf count stays the hold, and a trap does not change the ceiling', () => {
  const state = boot();
  state.player.ownedShips[0].fittings = [VECTOR_RACK];
  state.player.cargo.items.cmdty_impulse_charge = 3;
  const ceiling = resolveImpulseChargeCapacity(state);
  let model = readRailModel(state, state.simTime);
  assert.equal(model[1].name, 'Charge ×3');
  assert.equal(model[1].state, 'ready');
  assert.equal(model[1].capacity, ceiling);
  assert.notEqual(holdCount(model[1].name), model[1].capacity);
  assert.equal(model[1].why, `Ready · up to ${ceiling}`);

  state.player.ownedShips[0].fittings = [VECTOR_RACK, TRAP];
  const trapped = resolveImpulseChargeCapacity(state);
  model = readRailModel(state, state.simTime);
  assert.equal(model[1].name, 'Trap ×3');
  assert.equal(trapped, ceiling);
  assert.equal(model[1].capacity, trapped);

  state.entities.set(state.playerId, {
    id: state.playerId,
    data: { impulseCharges: { throwCdT: 1.25 } },
  });
  model = readRailModel(state, state.simTime);
  const coolingCeiling = resolveImpulseChargeCapacity(state);
  assert.equal(model[1].state, 'cooling');
  assert.match(model[1].why, /^Arming — /);
  assert.equal(model[1].why.endsWith(` · up to ${coolingCeiling}`), true);
  assert.equal(model[1].capacity, coolingCeiling);
  assert.equal(model[1].name, 'Trap ×3');
});
