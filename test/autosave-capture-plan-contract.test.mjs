import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import {
  freshCounterweightCircuitState, installCounterweightCircuitSaveAdapter,
} from '../src/features/counterweightCircuit/persistence.js';

// Exercise the actual production capture readers and autosave admission. Stop at
// the encoder boundary: these checks never create a worker or touch a save slot.
function fixture() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  state.world.counterweightCircuit = freshCounterweightCircuitState();
  state.world.counterweightCircuit.discovered = true;
  state.world.counterweightCircuit.attemptCounter = 3;
  state.player.credits = 4180;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, factionId: 'faction_free',
    pos: { x: 12, z: 45 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 9, mass: 18, hull: 100, hullMax: 100,
    flags: { isPlayer: true }, data: { defId: 'ship_kestrel' },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const owner = Object.create(save);
  Object.assign(owner, {
    state, bus: createBus(), helpers: {},
    registry: { get: name => name === 'world'
      ? { serialize: () => ({ currentSectorId: state.world.currentSectorId }) } : null },
    _runEpoch: 1, _autosaveGeneration: 0, _restoreSequence: 0,
    _autosaveInFlight: false, _restoring: false, _playerDead: false,
  });
  const encoded = [], durableWrites = [], events = [];
  owner.bus.on('save:error', event => events.push(event));
  owner._startAutosaveEncoding = (_job, capture) => { encoded.push(capture.data); return true; };
  owner._beginAutosaveTransaction = () => { durableWrites.push('transaction'); throw new Error('unexpected durable write'); };
  owner._writeSlot = () => { durableWrites.push('slot'); throw new Error('unexpected durable write'); };
  const flush = () => {
    const job = { runEpoch: 1, force: true, reason: 'mission', requestedAt: 0, requestedSimTime: 0 };
    owner._autosavePending = job;
    return owner._flushAutosave(job);
  };
  return { owner, state, encoded, durableWrites, events, flush };
}

test('production Counterweight adapter keeps the complete canonical autosave capture', () => {
  const f = fixture();
  const canonicalKeys = f.owner._saveCapturePlan().map(([key]) => key);
  const dispose = installCounterweightCircuitSaveAdapter(f.owner, null);
  try {
    assert.equal(Array.isArray(f.owner._saveCapturePlan()), true);
    assert.equal(f.flush(), true);
    assert.equal(f.encoded.length, 1);
    const data = f.encoded[0];
    assert.deepEqual(Object.keys(data), canonicalKeys);
    assert.equal(data.player.credits, 4180);
    assert.equal(data.world.currentSectorId, 'sector_pallas_drift');
    assert.equal(data.world.counterweightCircuit.discovered, true);
    assert.equal(data.world.counterweightCircuit.attemptCounter, 3);
    assert.equal(data.entities.player._isPlayer, true);
    assert.equal(data.entities.player.pos.x, 12);
    assert.equal(data.entities.player.pos.z, 45);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.durableWrites, []);
  } finally { dispose(); }
});

for (const [name, plan] of [
  ['throwing', () => { throw new Error('adapter failure'); }],
  ['generator', function* () { return [['world', () => ({})]]; }],
  ['empty', () => []],
  ['missing reader', () => [['world', null]]],
  ['missing key', () => [['', () => ({})]]],
  ['malformed row', () => [null]],
]) {
  test(`autosave refuses a ${name} capture plan before encoding or durable writes`, () => {
    const f = fixture();
    f.owner._saveCapturePlan = plan;
    assert.equal(f.flush(), false);
    assert.deepEqual(f.encoded, []);
    assert.deepEqual(f.durableWrites, []);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].failure, 'invalid_capture_plan');
    assert.equal(f.state.save.lastWriteFailure.reason, 'invalid_capture_plan');
    assert.equal(f.state.save.pendingWrite, null);
    assert.equal(f.owner._autosaveInFlight, false);
    assert.equal(f.owner._activeAutosaveJob, null);
  });
}
