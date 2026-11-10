// Wave G14 — hostile, civilian, and cargo brackets are three shapes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { targetBracketShape } from '../src/ui/targetBracket.js';

test('G14 a hostile, a civilian, and a pod resolve to three bracket shapes', () => {
  const hostile = targetBracketShape({ type: 'ship', alive: true }, true);
  const civilian = targetBracketShape({ type: 'ship', alive: true }, false);
  const pod = targetBracketShape({ type: 'pickup', alive: true, data: { freightCustodyPod: true } }, false);
  assert.equal(hostile, 'bracket-hostile');
  assert.equal(civilian, 'bracket-friendly');
  assert.equal(pod, 'bracket-cargo');
  assert.equal(new Set([hostile, civilian, pod]).size, 3);
});
