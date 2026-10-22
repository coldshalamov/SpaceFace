// VERB-30: the charge shelf's deployment ceiling is the fitted rack, read through
// the shipped resolver. The × count stays the charges in the hold. Since the five powers
// (owner 2026-10-22) the charge is the BOMB key's ordnance when the cycle chooses it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_SLOT_INDEX, readRailModel } from '../src/ui/powerRail.js';
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

const BOMB = BOMB_SLOT_INDEX;

// The charge is the BOMB key's default ordnance whenever one is aboard.
function chooseCharge(state, count) {
  state.player.cargo.items.cmdty_impulse_charge = count;
}

function holdCount(name) {
  const match = String(name).match(/×(\d+)/);
  return match ? Number(match[1]) : 0;
}

test('the flown charge ceiling follows the fitted rack and ignores a parked hull', () => {
  const state = boot();
  chooseCharge(state, 1);
  const bare = resolveImpulseChargeCapacity(state);
  const bareRail = readRailModel(state, state.simTime);
  assert.equal(bareRail[BOMB].capacity, bare);
  assert.equal(bareRail[BOMB].why, `Ready · up to ${bare}`);

  state.player.ownedShips[1].fittings = [VECTOR_RACK];
  const parked = resolveImpulseChargeCapacity(state);
  const parkedRail = readRailModel(state, state.simTime);
  assert.equal(parked, bare);
  assert.equal(parkedRail[BOMB].capacity, parked);

  state.player.ownedShips[0].fittings = [VECTOR_RACK];
  const fitted = resolveImpulseChargeCapacity(state);
  const fittedRail = readRailModel(state, state.simTime);
  assert.notEqual(fitted, bare);
  assert.equal(fittedRail[BOMB].capacity, fitted);
  assert.equal(fittedRail[BOMB].why, `Ready · up to ${fitted}`);
});

test('the shelf count stays the hold, and a trap does not change the ceiling', () => {
  const state = boot();
  state.player.ownedShips[0].fittings = [VECTOR_RACK];
  chooseCharge(state, 3);
  const ceiling = resolveImpulseChargeCapacity(state);
  let model = readRailModel(state, state.simTime);
  assert.equal(model[BOMB].name, 'Charge ×3');
  assert.equal(model[BOMB].state, 'ready');
  assert.equal(model[BOMB].capacity, ceiling);
  assert.notEqual(holdCount(model[BOMB].name), model[BOMB].capacity);
  assert.equal(model[BOMB].why, `Ready · up to ${ceiling}`);

  state.player.ownedShips[0].fittings = [VECTOR_RACK, TRAP];
  const trapped = resolveImpulseChargeCapacity(state);
  model = readRailModel(state, state.simTime);
  assert.equal(model[BOMB].name, 'Charge ×3 · +Trap');
  assert.equal(trapped, ceiling);
  assert.equal(model[BOMB].capacity, trapped);

  state.entities.set(state.playerId, {
    id: state.playerId,
    data: { impulseCharges: { throwCdT: 1.25 } },
  });
  model = readRailModel(state, state.simTime);
  const coolingCeiling = resolveImpulseChargeCapacity(state);
  assert.equal(model[BOMB].state, 'cooling');
  assert.match(model[BOMB].why, /^Arming — /);
  assert.equal(model[BOMB].why.endsWith(` · up to ${coolingCeiling}`), true);
  assert.equal(model[BOMB].capacity, coolingCeiling);
  assert.equal(model[BOMB].name, 'Charge ×3 · +Trap');
});
