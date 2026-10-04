// An empty mining hold says the beam has nothing to take. A rock that just died says it is mined out.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mining } from '../src/systems/mining.js';

function host(acquire) {
  const events = [];
  const player = { id: 1, pos: { x: 0, z: 0 }, alive: true, flags: {} };
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 1,
    input: { fireGroup: 2 },
    entities: new Map([[1, player]]),
    player: { miningNoise: 0 },
  };
  const sys = Object.assign(Object.create(mining), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state,
    _stopBeam() {},
    _setLockTargetId() {},
    _acquireTarget: acquire,
    _beamRefusalTold: null,
    _beamSpentThisHold: false,
    _emptyBeamTicks: 0,
    _lockTargetId: null,
    _diag: {},
    _beamRuntime() { return null; },
    _flushParkedOre() {},
    _updateBeamHeat() {},
    _updateRichCoreCharge() {},
    _updateMiningNoise() {},
    _updatePickups() {},
  });
  return { sys, player, state, events };
}

function texts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('an empty hold waits one tick, then says the beam has nothing to take', () => {
  const { sys, player, state, events } = host(() => null);
  const beam = { range: 100 };
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  assert.deepEqual(texts(events), []);
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  assert.deepEqual(texts(events), ['The beam has nothing to take']);
  state.input.fireGroup = 0;
  sys.update(1 / 60, state);
  assert.equal(sys._beamRefusalTold, null);
  state.input.fireGroup = 2;
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  assert.deepEqual(texts(events), [
    'The beam has nothing to take',
    'The beam has nothing to take',
  ]);
});

test('finishing a rock speaks in that tick, and a dropped hold does not erase it', () => {
  const events = [];
  const ast = {
    id: 4, type: 'asteroid', alive: true, pos: { x: 1, z: 1 }, hull: 1,
    data: { oreHP: 1, oreHPMax: 1, yieldU: 0, pctEjected: 1, _oreCarry: 0 },
  };
  const player = { id: 1, pos: { x: 0, z: 0 }, alive: true, flags: {} };
  const state = {
    playerId: 1, simTime: 3, tick: 9, mode: 'flight',
    input: { fireGroup: 0 },
    entities: new Map([[4, ast], [1, player]]),
    player: { miningNoise: 0 },
    world: {},
  };
  const sys = Object.assign(Object.create(mining), {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    _lockTargetId: 4,
    _diag: {},
    _ensureAsteroidSeams() {},
    _beamContactPoint() { return { x: 1, z: 1 }; },
    _seamYield() { return { onSeam: false, speedMult: 1, yieldMult: 1 }; },
    _dominantOre() { return 'ore_iron'; },
    _releaseOre() {},
    _fractureAsteroid() {},
    _maybeExposeRichCore() {},
    _beamRuntime() { return null; },
    _flushParkedOre() {},
    _updateBeamHeat() {},
    _updateRichCoreCharge() {},
    _updateMiningNoise() {},
    _updatePickups() {},
    _stopBeam() {},
  });
  sys.applyMining(4, 100, 1, 1);
  assert.equal(ast.alive, false);
  assert.deepEqual(texts(events), ['That rock is mined out']);
  sys.update(1 / 60, state);
  assert.deepEqual(texts(events), ['That rock is mined out']);
});

test('after the rock is finished, the rest of the hold does not say the beam is empty', () => {
  const { sys, player, state, events } = host(() => null);
  sys._beamSpentThisHold = true;
  sys._noteBeamRefusal('rock-mined-out');
  const beam = { range: 100 };
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  assert.deepEqual(texts(events), ['That rock is mined out']);
});

test('a lock that vanished without the beam finishing it is not called mined out', () => {
  const { sys, player, state, events } = host(() => null);
  sys._lockTargetId = 4;
  sys._beaming = true;
  const beam = { range: 100 };
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  assert.deepEqual(texts(events), ['The beam has nothing to take']);
});

test('one empty tick between rocks does not speak', () => {
  let calls = 0;
  const next = { id: 9, type: 'asteroid', alive: true, pos: { x: 4, z: 0 }, data: {} };
  const { sys, player, state, events } = host(() => {
    calls += 1;
    return calls === 1 ? null : next;
  });
  const beam = { range: 100, dps: 18 };
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  sys._acquireTarget = () => next;
  sys._runPlayerBeam(player, beam, 1 / 60, state);
  assert.deepEqual(texts(events), []);
});
