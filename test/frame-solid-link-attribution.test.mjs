import assert from 'node:assert/strict';
import test from 'node:test';
import { isInFrameLink } from '../scripts/lib/frameSolidSampler.mjs';

test('off-camera admission draws are not classified as presented shader links', () => {
  const drawStack = ['at renderBufferDirect', 'at renderObjects'];
  assert.equal(isInFrameLink({ presentedDraw: false, stack: drawStack }), false);
  assert.equal(isInFrameLink({ presentedDraw: true, stack: drawStack }), true);
  // Saved reports without the pass marker retain their original interpretation.
  assert.equal(isInFrameLink({ stack: drawStack }), true);
  assert.equal(isInFrameLink({ stack: ['at compileAsync'] }), false);
});
