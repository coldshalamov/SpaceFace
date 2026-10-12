import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';

test('a Crucible launch marks game:new so the (worker) boot knows it is not Adventure', () => {
  const bus = createBus();
  const seen = [];
  bus.on('game:new', (o) => seen.push(o));
  requestSandboxGame(bus, { seed: 4242, survivalSetup: { seed: 4242 } });
  requestSandboxGame(bus, { seed: 7 });
  assert.deepEqual(seen[0], { seed: 4242, crucibleLaunch: true });
  assert.deepEqual(seen[1], { seed: 7 }, 'physics sandbox launches stay unmarked');
});
