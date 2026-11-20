import test from 'node:test';
import assert from 'node:assert/strict';
import { setPromptDevice } from '../src/ui/bindings.js';
import { verbChip } from '../src/ui/controlPrompts.js';
import { releaseWindowOpen, throwActionCue } from '../src/ui/throwCue.js';

const withSolution = (sol) => ({ massline2: { throw: { solution: sol } } });

test('the throw action names its gesture, independent of the keyboard tether binding', (t) => {
  t.after(() => setPromptDevice('kbm'));
  const state = { settings: { controls: { bindings: { tether: ['KeyQ'] } } } };
  setPromptDevice('kbm');
  assert.equal(verbChip(state, 'tether', 'LATCH'), 'Q · LATCH');
  assert.equal(throwActionCue(state), 'RMB · THROW');

  setPromptDevice('touch');
  assert.equal(throwActionCue(state), 'FLICK · THROW');
  setPromptDevice('gamepad');
  assert.match(throwActionCue(state), /RELEASE$/);
});

test('the throw tag lights only while the rope\'s release window is open on a valid solution', () => {
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: true })), true);
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: false })), false);
  assert.equal(releaseWindowOpen(withSolution({ valid: false, onSolution: true })), false);
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: true, degraded: true })), false);
  assert.equal(releaseWindowOpen(withSolution({ valid: true, onSolution: true, decisionStale: true })), false);
});

test('a world hover only lights for the body the throw solver actually selected', () => {
  const state = withSolution({ valid: true, onSolution: true, windowOpen: true });
  state.massline2.throw.aimTargetId = 41;
  assert.equal(releaseWindowOpen(state, 41), true);
  assert.equal(releaseWindowOpen(state, 42), false);
  state.massline2.throw.aimTargetId = null;
  assert.equal(releaseWindowOpen(state, 41), false, 'a free throw has no target hover to light');
  assert.equal(releaseWindowOpen(state), true, 'the held payload can still show the release window');
});

test('no state, no massline, or no throw subtree reads as closed', () => {
  assert.equal(releaseWindowOpen(null), false);
  assert.equal(releaseWindowOpen({}), false);
  assert.equal(releaseWindowOpen({ massline2: {} }), false);
});
