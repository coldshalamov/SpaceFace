import assert from 'node:assert/strict';
import test from 'node:test';

import { parseUniverseSeed } from '../src/ui/screens/newGame.js';

test('Universe seed accepts the complete unsigned 32-bit player range', () => {
  assert.equal(parseUniverseSeed('1'), 1);
  assert.equal(parseUniverseSeed(' 47 '), 47);
  assert.equal(parseUniverseSeed('4294967295'), 0xffffffff);
});

test('Universe seed rejects blank, partial, zero, signed, decimal, and wrapping values', () => {
  for (const value of ['', '   ', '0', '-1', '+47', '47abc', '47.5', '4294967296']) {
    assert.equal(parseUniverseSeed(value), null, `${JSON.stringify(value)} must mean random`);
  }
});
