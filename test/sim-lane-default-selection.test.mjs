import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSimLaneFlags, createSimLaneRuntime } from '../src/core/simLaneMain.js';

test('ordinary game startup uses the in-process simulation authority', () => {
  assert.equal(resolveSimLaneFlags('').lane, 'main');
  let channels = 0;
  assert.equal(createSimLaneRuntime({
    flags: resolveSimLaneFlags(''),
    channelFactory() { channels++; throw new Error('default startup must not create a worker'); },
  }), null);
  assert.equal(channels, 0);
});
test('the asynchronous lane requires explicit diagnostic selection', () => {
  assert.equal(resolveSimLaneFlags('?simLane=worker').lane, 'worker');
  assert.equal(resolveSimLaneFlags('?simLane=main').lane, 'main');
  const invalid = resolveSimLaneFlags('?simLane=invalid');
  assert.equal(invalid.lane, 'main');
  assert.equal(invalid.warnings.length, 1);
});
test('query selection overrides a stored diagnostic preference', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, value: { getItem: key => key === 'sf.simLane' ? 'worker' : null },
    });
    assert.equal(resolveSimLaneFlags('').lane, 'worker');
    assert.equal(resolveSimLaneFlags('?simLane=main').lane, 'main');
    assert.equal(resolveSimLaneFlags('?simLane=worker').lane, 'worker');
  } finally {
    if (old) Object.defineProperty(globalThis, 'localStorage', old);
    else delete globalThis.localStorage;
  }
});
