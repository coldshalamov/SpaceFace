import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { installGameStartRecovery } from '../src/core/gameStartRecovery.js';

test('Retry repeats the failed public intent once with its original options', () => {
  const bus = createBus();
  const dispose = installGameStartRecovery(bus);
  const launches = [];
  bus.on('game:new', (payload) => launches.push(payload));
  const options = { seed: 42, starter: 'miner', newGamePlus: { slot: 'auto' } };
  bus.emit('game:new', options);
  options.newGamePlus.slot = 'wrong';
  bus.emit('game:retryStart');
  assert.equal(launches.length, 1, 'cannot duplicate a still-running launch');
  bus.emit('game:startFailed', { error: 'texture upload failed' });
  bus.emit('game:retryStart');
  bus.emit('game:retryStart');
  assert.equal(launches.length, 2);
  assert.equal(launches[1].newGamePlus.slot, 'auto');
  assert.equal(launches[1].seed, 42);
  dispose();
});

test('Continue Retry reloads the same slot; explicit Back cancels the retry', () => {
  const bus = createBus();
  const dispose = installGameStartRecovery(bus);
  const loads = [];
  bus.on('game:load', (payload) => loads.push(payload));
  bus.emit('game:load', { slot: 'manual-2' });
  bus.emit('game:startFailed');
  bus.emit('game:retryStart');
  assert.deepEqual(loads, [{ slot: 'manual-2' }, { slot: 'manual-2' }]);
  bus.emit('game:startFailed');
  bus.emit('game:exitToMenu');
  bus.emit('game:retryStart');
  assert.equal(loads.length, 2);
  dispose();
});
