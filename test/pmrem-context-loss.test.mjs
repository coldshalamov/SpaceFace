import assert from 'node:assert/strict';
import test from 'node:test';

import { retirePmremGenerator } from '../src/render/renderer.js';

function generatorCounter() {
  const calls = [];
  return {
    calls,
    dispose() {
      calls.push('dispose');
    },
  };
}

test('context loss abandons the obsolete PMREM generator without disposing through the restored context', () => {
  const generator = generatorCounter();
  const owner = {
    _contextLost: true,
    _pmremGenerator: generator,
    _pmremContextSeq: 4,
  };

  assert.equal(retirePmremGenerator(owner, { contextLost: true }), false);
  assert.deepEqual(generator.calls, [], 'dead-context PMREM must never be disposed after loss');
  assert.equal(owner._pmremGenerator, null);
  assert.equal(owner._pmremContextSeq, null);
});

test('live renderer retirement still disposes the current PMREM generator once', () => {
  const generator = generatorCounter();
  const owner = {
    _contextLost: false,
    _pmremGenerator: generator,
    _pmremContextSeq: 4,
  };

  assert.equal(retirePmremGenerator(owner, { contextLost: false }), true);
  assert.deepEqual(generator.calls, ['dispose']);
  assert.equal(owner._pmremGenerator, null);
  assert.equal(owner._pmremContextSeq, null);
});
