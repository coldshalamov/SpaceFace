// A drive spool that can no longer pay its fare dumps. The tank is not spent. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { jumpAbortText } from '../src/ui/jumpNotice.js';
import { world } from '../src/systems/world.js';

function chargingHost({ via = 'drive', fuel = 80, cost = 14, unfiled = false } = {}) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.playerId = 1;
  state.simTime = 12;
  state.fuel.current = fuel;
  state.jump.state = 'CHARGING';
  state.jump.via = via;
  state.jump.targetSectorId = 'sector_kepler';
  state.jump.chargeT = 2.4;
  state.jump.chargeNeeded = 8;
  state.jump._fuelCost = cost;
  state.jump._unfiled = unfiled;
  const events = [];
  const host = {
    state,
    _driveTierId: 'jump_t1',
    _combatLock: false,
    bus: { emit(type, payload) { events.push({ type, payload }); } },
    _activeDrive: world._activeDrive,
    _abortCharge: world._abortCharge,
  };
  return { host, state, events };
}

test('seed 4242: a drive spool dumps when the tank cannot cover the fare', () => {
  const { host, state, events } = chargingHost({ fuel: 10, cost: 14 });
  world._tickCharging.call(host, 0.1, state);
  assert.equal(state.jump.state, 'IDLE');
  assert.equal(state.jump.via, null);
  assert.equal(state.jump.chargeT, 0);
  assert.equal(state.fuel.current, 10);
  const abort = events.find((e) => e.type === 'jump:chargeAbort');
  assert.ok(abort);
  assert.equal(abort.payload.reason, 'low_fuel');
  assert.equal(abort.payload.fuelNeeded, 14);
  assert.equal(abort.payload.fuelHeld, 10);
  assert.equal(jumpAbortText(abort.payload), 'Jump needs 14 fuel — tank holds 10');
  assert.equal(events.some((e) => e.type === 'jump:start'), false);
});

test('seed 4242: a funded drive keeps charging and a gate ignores the fuel fare', () => {
  const funded = chargingHost({ fuel: 40, cost: 14 });
  world._tickCharging.call(funded.host, 0.1, funded.state);
  assert.equal(funded.state.jump.state, 'CHARGING');
  assert.equal(funded.state.jump.chargeT, 2.5);
  assert.equal(funded.state.fuel.current, 40);
  assert.equal(funded.events.some((e) => e.type === 'jump:chargeAbort'), false);
  assert.equal(funded.events.some((e) => e.type === 'jump:chargeTick'), true);

  const gate = chargingHost({ via: 'gate', fuel: 0, cost: 0 });
  world._tickCharging.call(gate.host, 0.1, gate.state);
  assert.equal(gate.state.jump.state, 'CHARGING');
  assert.equal(gate.state.jump.chargeT, 2.5);
  assert.equal(gate.events.some((e) => e.type === 'jump:chargeAbort'), false);
});
