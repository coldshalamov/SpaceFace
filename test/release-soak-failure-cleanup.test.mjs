#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPostTeardownGlDeleteTrapDiagnostic,
} from '../scripts/lib/releaseSoakProbe.mjs';

test('failure-path teardown diagnostic preserves the one-shot caller snapshot', () => {
  const snapshot = {
    armed: true,
    entries: [{ api: 'deleteTexture', count: 12, alive: true, stack: 'dispose-stack' }],
    evicted: 0,
    dropped: 0,
  };
  const diagnostic = buildPostTeardownGlDeleteTrapDiagnostic({
    runtimeKind: 'electron',
    install: { installed: true, already: false },
    snapshot,
  });

  assert.equal(diagnostic.schema, 'spaceface.post-teardown-gl-delete-trap.v1');
  assert.equal(diagnostic.runtimeKind, 'electron');
  assert.equal(diagnostic.available, true);
  assert.deepEqual(diagnostic.snapshot, snapshot);
  assert.equal(diagnostic.snapshot.entries[0].stack, 'dispose-stack');
});

test('failure-path teardown diagnostic records unavailable capture instead of implying clean teardown', () => {
  const diagnostic = buildPostTeardownGlDeleteTrapDiagnostic({
    runtimeKind: 'electron',
    install: { installed: false, reason: 'registry-destroy-unavailable' },
    snapshot: null,
  });

  assert.equal(diagnostic.available, false);
  assert.deepEqual(diagnostic.install, { installed: false, reason: 'registry-destroy-unavailable' });
  assert.equal(diagnostic.snapshot, null);
});
