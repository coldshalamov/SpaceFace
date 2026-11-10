import assert from 'node:assert/strict';
import test from 'node:test';

import { IBL_PMREM_CUBE_SIZE } from '../src/render/foundryEnvironment.js';
import {
  SPACE_REFLECTION_PMREM_CUBE_SIZE,
  SPACE_REFLECTION_PMREM_SIGMA_RADIANS,
} from '../src/render/spaceReflectionEnvironment.js';

test('environment promotion bakes every source at one shared cube size', () => {
  assert.equal(IBL_PMREM_CUBE_SIZE, SPACE_REFLECTION_PMREM_CUBE_SIZE,
    'IBL and reflection-card bakes must share one cube size or env swaps re-key lit programs');
  assert.equal(IBL_PMREM_CUBE_SIZE, 512);
  assert.equal(SPACE_REFLECTION_PMREM_CUBE_SIZE, 512);
  assert.equal(IBL_PMREM_CUBE_SIZE * 4, 2048, 'envMapCubeUVHeight keys the shader program');
  assert.equal(SPACE_REFLECTION_PMREM_CUBE_SIZE * 4, 2048);
});

test('the pinned PMREM sigma stays inside the 20-tap blur ceiling at the shared size', () => {
  const cubeCapturePixels = SPACE_REFLECTION_PMREM_CUBE_SIZE - 1;
  const radiansPerPixel = Math.PI / (2 * cubeCapturePixels);
  const requestedSamples = 1 + Math.floor(3 * SPACE_REFLECTION_PMREM_SIGMA_RADIANS / radiansPerPixel);
  assert.ok(requestedSamples <= 20, `PMREM requests ${requestedSamples} samples`);
});
