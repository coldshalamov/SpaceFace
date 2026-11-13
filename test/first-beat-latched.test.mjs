import test from 'node:test';
import assert from 'node:assert/strict';
import { handlineSenseLine } from '../src/ui/stuntCallout.js';

test('the first latch has a centre word; the throw keeps its own', () => {
  assert.equal(handlineSenseLine('tether:latched', { sourceId: 1, targetId: 2 }).name, 'LATCHED');
  assert.equal(handlineSenseLine('massline:throw', { payloadSpeed: 80, releaseId: 3 }).name, 'THROWN');
});
