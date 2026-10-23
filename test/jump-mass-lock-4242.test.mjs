// A drive fold will not form inside a mass lock. A gate still charges. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { jumpAbortText } from '../src/ui/jumpNotice.js';
import { driveJumpMassLocked } from '../src/systems/jumpMassLock.js';
import { world } from '../src/systems/world.js';

function stateWith(bodies) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 11;
  state.fuel.current = 500;
  state.world.currentSectorId = 'sector_helios_prime';
  state.entities.set(1, { id: 1, alive: true, pos: { x: 0, y: 0, z: 0 }, radius: 8 });
  for (const body of bodies) state.entities.set(body.id, body);
  return state;
}

function chargingHost(state, via) {
  state.jump.state = 'CHARGING';
  state.jump.via = via;
  state.jump.targetSectorId = 'sector_ceres_belt';
  state.jump.chargeT = 1;
  state.jump.chargeNeeded = 8;
  state.jump._fuelCost = via === 'gate' ? 0 : 12;
  const events = [];
  const host = {
    state,
    _driveTierId: 'jump_t1',
    _combatLock: false,
    bus: { emit(type, payload) { events.push({ type, payload }); } },
    _activeDrive: world._activeDrive,
    _abortCharge: world._abortCharge,
  };
  return { host, events };
}

test('seed 4242: a nearby hull mass-locks a drive spool and says so', () => {
  const locked = stateWith([
    { id: 2, alive: true, radius: 80, pos: { x: 100, y: 0, z: 0 } },
  ]);
  assert.equal(driveJumpMassLocked(locked), true);

  const open = stateWith([
    { id: 3, alive: true, radius: 10, pos: { x: 20, y: 0, z: 0 } },
    { id: 4, alive: true, radius: 90, pos: { x: 400, y: 0, z: 0 } },
  ]);
  assert.equal(driveJumpMassLocked(open), false);

  const tick = chargingHost(locked, 'drive');
  world._tickCharging.call(tick.host, 0.1, locked);
  assert.equal(locked.jump.state, 'IDLE');
  assert.equal(locked.fuel.current, 500);
  const abort = tick.events.find((e) => e.type === 'jump:chargeAbort');
  assert.equal(abort.payload.reason, 'mass_lock');
  assert.equal(jumpAbortText(abort.payload), 'Mass lock — the spool cannot form');

  const requestEvents = [];
  const requestHost = {
    state: stateWith([{ id: 2, alive: true, radius: 80, pos: { x: 90, y: 0, z: 0 } }]),
    _driveTierId: 'jump_t1',
    _combatLock: false,
    _activeDrive: world._activeDrive,
    _hasDrive: world._hasDrive,
    _edgeDist: world._edgeDist,
    _wormholeUnlocked: () => false,
    bus: { emit(type, payload) { requestEvents.push({ type, payload }); } },
  };
  world._onRequestJump.call(requestHost, { targetSectorId: 'sector_ceres_belt', via: 'drive' });
  assert.equal(requestHost.state.jump.state, 'IDLE');
  const refused = requestEvents.find((e) => e.type === 'jump:chargeAbort');
  assert.equal(refused.payload.reason, 'mass_lock');
  assert.equal(requestEvents.some((e) => e.type === 'jump:chargeStart'), false);
});

test('seed 4242: clear space keeps the drive charging and a gate ignores the lock', () => {
  const open = stateWith([]);
  const drive = chargingHost(open, 'drive');
  world._tickCharging.call(drive.host, 0.1, open);
  assert.equal(open.jump.state, 'CHARGING');
  assert.equal(open.jump.chargeT, 1.1);
  assert.equal(drive.events.some((e) => e.type === 'jump:chargeAbort'), false);

  const locked = stateWith([
    { id: 2, alive: true, radius: 120, pos: { x: 40, y: 0, z: 0 } },
  ]);
  const gate = chargingHost(locked, 'gate');
  world._tickCharging.call(gate.host, 0.1, locked);
  assert.equal(locked.jump.state, 'CHARGING');
  assert.equal(locked.jump.chargeT, 1.1);
  assert.equal(gate.events.some((e) => e.type === 'jump:chargeAbort'), false);
});
