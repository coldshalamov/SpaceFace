// NXI-021 — a shut intake says closed. The window is not widened.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReceiverAcceptance } from '../src/systems/worldSiteRuntime.js';

const openLoad = {
  quantity: 4,
  capacity: 10,
  stored: 0,
  entered: true,
  relativeSpeed: 0,
  mouthHalfWidth: 8,
  bodyRadius: 1,
  commodityId: 'ore',
};

test('a shut intake returns the closed cause on seed 4242', () => {
  const shut = evaluateReceiverAcceptance({ ...openLoad, phase: 'shut' });
  const closed = evaluateReceiverAcceptance({ ...openLoad, phase: 'closed' });
  assert.equal(shut.reason, 'closed');
  assert.equal(shut.scanSentence, 'Intake is closed.');
  assert.equal(closed.reason, 'closed');
  assert.equal(shut.acceptedQty, 0);
  const open = evaluateReceiverAcceptance({ ...openLoad, phase: 'open' });
  assert.equal(open.acceptedQty, 4);
});
