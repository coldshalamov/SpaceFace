// A drive spool is a held charge. A hull strike dumps it. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { jumpAbortText } from '../src/ui/jumpNotice.js';
import { world } from '../src/systems/world.js';

function chargingHost({ via = 'drive', tier = 'jump_t1', unfiled = false } = {}) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.playerId = 1;
  state.simTime = 12;
  state.fuel.current = 80;
  state.jump.state = 'CHARGING';
  state.jump.via = via;
  state.jump.targetSectorId = 'sector_kepler';
  state.jump.chargeT = 2.4;
  state.jump.chargeNeeded = 8;
  state.jump._fuelCost = 14;
  state.jump._unfiled = unfiled;
  const aborts = [];
  const host = {
    state,
    _driveTierId: tier,
    bus: { emit(type, payload) { if (type === 'jump:chargeAbort') aborts.push(payload); } },
    _activeDrive: world._activeDrive,
    _abortCharge: world._abortCharge,
    _onSpoolStrike: world._onSpoolStrike,
  };
  return { host, state, aborts };
}

function strike(host, payload) {
  world._onSpoolStrike.call(host, payload);
}

test('seed 4242 a hull strike dumps a drive spool and says so', () => {
  const { host, state, aborts } = chargingHost();
  strike(host, { targetId: 1, hullDamage: 6, shieldDamage: 0 });
  assert.equal(state.jump.state, 'IDLE');
  assert.equal(state.jump.chargeT, 0);
  assert.equal(state.jump.via, null);
  assert.equal(state.fuel.current, 80);
  assert.equal(aborts.length, 1);
  assert.equal(aborts[0].reason, 'spool_struck');
  assert.equal(jumpAbortText(aborts[0]), 'Hull hit — the spool dumped');
});

test('seed 4242 a graze, a gate, a hot drive, and someone else\'s hull keep the spool', () => {
  const graze = chargingHost();
  strike(graze.host, { targetId: 1, hullDamage: 0, shieldDamage: 12 });
  assert.equal(graze.state.jump.state, 'CHARGING');
  assert.equal(graze.state.jump.chargeT, 2.4);
  assert.equal(graze.aborts.length, 0);

  const gate = chargingHost({ via: 'gate' });
  strike(gate.host, { targetId: 1, hullDamage: 9 });
  assert.equal(gate.state.jump.state, 'CHARGING');
  assert.equal(gate.aborts.length, 0);

  const hot = chargingHost({ tier: 'jump_t3' });
  assert.equal(hot.host._activeDrive().hotJump, true);
  strike(hot.host, { targetId: 1, hullDamage: 9 });
  assert.equal(hot.state.jump.state, 'CHARGING');
  assert.equal(hot.aborts.length, 0);

  const other = chargingHost();
  strike(other.host, { targetId: 44, hullDamage: 20 });
  assert.equal(other.state.jump.state, 'CHARGING');
  assert.equal(other.aborts.length, 0);

  const unfiled = chargingHost({ unfiled: true });
  strike(unfiled.host, { targetId: 1, hullDamage: 4 });
  assert.equal(unfiled.state.jump.state, 'CHARGING');
  assert.equal(unfiled.aborts.length, 0);
});
