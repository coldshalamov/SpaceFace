import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAuthoritativeRunSeed } from '../scripts/player-truth/routes.mjs';

test('player-truth seed identity prefers the worker run seed and ignores zero mirrors', () => {
  assert.equal(selectAuthoritativeRunSeed({ runSeed: 4242, seed: 0 }), 4242);
  assert.equal(selectAuthoritativeRunSeed({ runSeed: 0, seed: 4242 }), 4242);
  assert.equal(selectAuthoritativeRunSeed({ runSeed: null, seed: 0 }, 4242), 4242);
  assert.equal(selectAuthoritativeRunSeed({ runSeed: 8008, seed: 4242 }), 8008, 'a nonzero worker mismatch remains visible for the route check');
  assert.equal(selectAuthoritativeRunSeed({ runSeed: 0, seed: 0 }), null);
});
