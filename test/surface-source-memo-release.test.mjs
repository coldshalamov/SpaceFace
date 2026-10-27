import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseSurfaceSourceMemo, surfaceSourceMemoSize } from '../src/render/illustratedSurface.js';

test('releaseSurfaceSourceMemo empties the surface shader-source memo', () => {
  releaseSurfaceSourceMemo();
  assert.equal(surfaceSourceMemoSize(), 0);
});
