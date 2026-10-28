import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSimLaneFlags, createSimLaneRuntime } from '../src/core/simLaneMain.js';

test('ordinary game startup uses the worker simulation authority', () => {
  assert.equal(resolveSimLaneFlags('').lane, 'worker');
});
test('the in-process lane requires explicit escape-hatch selection', () => {
  assert.equal(resolveSimLaneFlags('?simLane=worker').lane, 'worker');
  assert.equal(resolveSimLaneFlags('?simLane=main').lane, 'main');
  const invalid = resolveSimLaneFlags('?simLane=invalid');
  assert.equal(invalid.lane, 'worker');
  assert.equal(invalid.warnings.length, 1);
});
test('query selection overrides a stored diagnostic preference', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, value: { getItem: key => key === 'sf.simLane' ? 'main' : null },
    });
    assert.equal(resolveSimLaneFlags('').lane, 'main');
    assert.equal(resolveSimLaneFlags('?simLane=main').lane, 'main');
    assert.equal(resolveSimLaneFlags('?simLane=worker').lane, 'worker');
  } finally {
    if (old) Object.defineProperty(globalThis, 'localStorage', old);
    else delete globalThis.localStorage;
  }
});
test('an explicit main selection spawns no worker channel', () => {
  let channels = 0;
  assert.equal(createSimLaneRuntime({
    flags: resolveSimLaneFlags('?simLane=main'),
    channelFactory() { channels++; throw new Error('main-lane startup must not create a worker'); },
  }), null);
  assert.equal(channels, 0);
});
