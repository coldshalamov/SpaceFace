import assert from 'node:assert/strict';
import test from 'node:test';

import {
  waitForOpeningGpuResources,
} from '../src/render/pipelineReadiness.js';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

test('the present leg still runs when the mode flips to flight while prepare settles (software GL race)', async () => {
  const calls = [];
  const state = { mode: 'loading', render: {} };
  state.render.prepareOpeningGpuResources = async () => {
    // Fire-and-forget era: main.js flipped the mode before prepare settled.
    state.mode = 'flight';
    await wait(5);
    return { skipped: false };
  };
  state.render.prepareLiveSectorBeforeFlight = async () => {
    calls.push(state.mode);
    return { skipped: false };
  };
  const info = console.info;
  console.info = () => {};
  try {
    await waitForOpeningGpuResources(state, 50, { settleTail: false });
  } finally {
    console.info = info;
  }
  assert.ok(state.render.liveScenePresentReady, 'liveScenePresentReady is assigned');
  assert.equal(calls.length, 1);
  // The renderer's own guard decides what a post-shell invocation does (park only).
  assert.equal(calls[0], 'flight');
});

test('a call that starts outside the loading shell still skips the present leg', async () => {
  let called = 0;
  const state = {
    mode: 'flight',
    render: {
      prepareOpeningGpuResources: async () => ({ skipped: false }),
      prepareLiveSectorBeforeFlight: async () => { called += 1; return {}; },
    },
  };
  const info = console.info;
  console.info = () => {};
  try {
    await waitForOpeningGpuResources(state, 50);
  } finally {
    console.info = info;
  }
  assert.equal(called, 0);
  assert.equal(state.render.liveScenePresentReady, undefined);
});
