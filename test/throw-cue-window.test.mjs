import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseWindowOpen } from '../src/ui/throwCue.js';

const withSolution = (sol) => ({ massline2: { throw: { solution: sol } } });

test('the throw tag lights only while the rope\'s release window is open on a valid solution', () => {
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: true })), true);
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: false })), false);
  assert.equal(releaseWindowOpen(withSolution({ valid: false, onSolution: true })), false);
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: true, degraded: true })), false);
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: true, decisionStale: true })), false);
});

test('no state, no massline, or no throw subtree reads as closed', () => {
  assert.equal(releaseWindowOpen(null), false);
  assert.equal(releaseWindowOpen({}), false);
  assert.equal(releaseWindowOpen({ massline2: {} }), false);
});
