import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';

test('authoritative runtime dispose retires initialized systems and closes stepping', () => {
  let destroyCalls = 0;
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    systems: [{
      name: 'cleanupProbe',
      init() {},
      destroy() { destroyCalls++; },
    }],
    seedProcessMaps: false,
  });

  runtime.dispose();

  assert.equal(destroyCalls, 1,
    'dispose must invoke initialized system cleanup before clearing the simulation bus');
  assert.throws(() => runtime.step(1 / 60), /disposed/,
    'a disposed runtime must reject use-after-dispose stepping');
  assert.throws(() => runtime.spawn({ type: 'probe' }), /disposed/,
    'a disposed runtime must reject state-mutating spawn calls');
  assert.doesNotThrow(() => runtime.dispose(), 'disposal must remain idempotent');
  assert.equal(destroyCalls, 1, 'idempotent disposal must not repeat system cleanup');
});
