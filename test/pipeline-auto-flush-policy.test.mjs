import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  FIRST_FLIGHT_PIPELINE_HOLD_S,
  shouldDeferPipelineAutoFlush,
} from '../src/render/pipelineAutoFlushPolicy.js';

test('pipeline auto-flush matches the pre-campaign released-punches-through formula', () => {
  assert.equal(shouldDeferPipelineAutoFlush({
    postOpeningReleased: false,
    firstPlayableFrameAt: null,
    mode: 'loading',
    simTime: 0,
  }), true, 'unreleased loading defers');

  assert.equal(shouldDeferPipelineAutoFlush({
    postOpeningReleased: false,
    firstPlayableFrameAt: 12.5,
    mode: 'flight',
    simTime: 0.5,
  }), true, 'unreleased first-flight hold still defers');

  assert.equal(shouldDeferPipelineAutoFlush({
    postOpeningReleased: true,
    firstPlayableFrameAt: null,
    mode: 'loading',
    simTime: 0,
  }), false, 'released post-opening may auto-flush (loading drain)');

  assert.equal(shouldDeferPipelineAutoFlush({
    postOpeningReleased: true,
    firstPlayableFrameAt: 12.5,
    mode: 'flight',
    simTime: FIRST_FLIGHT_PIPELINE_HOLD_S,
  }), false, 'released after the hold does not defer');
});

test('live renderer wires the shipped defer policy', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /shouldDeferPipelineAutoFlush/);
  assert.doesNotMatch(source, /checkShaderErrors\s*=\s*false/,
    'live WebGLRenderer must not disable shader-error checks (compileAsync isReady crash)');
});
