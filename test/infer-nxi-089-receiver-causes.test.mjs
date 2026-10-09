// NXI-089 — empty, full, and blocked geometry are one refusal with different causes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReceiverAcceptance } from '../src/systems/worldSiteRuntime.js';

const base = {
  capacity: 4,
  entered: true,
  relativeSpeed: 0,
  mouthHalfWidth: 8,
  bodyRadius: 1,
  commodityId: 'ore',
  phase: 'open',
};

test('three missing conditions stay one sentence each', () => {
  const empty = evaluateReceiverAcceptance({ ...base, quantity: 0, stored: 0 });
  const full = evaluateReceiverAcceptance({ ...base, quantity: 2, stored: 4 });
  const blocked = evaluateReceiverAcceptance({ ...base, quantity: 2, stored: 0, blockedGeometry: true });
  assert.equal(empty.reason, 'zero-unit');
  assert.equal(full.reason, 'capacity-full');
  assert.equal(blocked.reason, 'blocked-geometry');
  assert.equal(blocked.scanSentence, 'The way in is blocked. The load stays put.');
  assert.notEqual(empty.scanSentence, full.scanSentence);
  assert.notEqual(full.scanSentence, blocked.scanSentence);
});
