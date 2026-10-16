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
  state.render.prepareLiveSectorBeforeFlight = async (legOptions) => {
    calls.push([state.mode, legOptions && legOptions.parkOnly === true]);
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
  // The un-awaited software route only parks: it never starts the whole-sector cook.
  assert.deepEqual(calls[0], ['flight', true]);
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

test('an awaited cook (hardware route) still runs the full present leg', async () => {
  const calls = [];
  const state = { mode: 'loading', render: {} };
  state.render.prepareOpeningGpuResources = async () => ({ skipped: false });
  state.render.prepareLiveSectorBeforeFlight = async (legOptions) => { calls.push(legOptions); return {}; };
  const info = console.info;
  console.info = () => {};
  try {
    await waitForOpeningGpuResources(state, 50, { settleTail: true, presentBudgetMs: 50 });
  } finally {
    console.info = info;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0], undefined);
});

test('the opening warm touches only the barge family under the shell', async () => {
  const { readFile } = await import('node:fs/promises');
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /if \(profile === 'opening'\) this\._touchOpeningBargeFamilyUnderShell\(root\);/);
  assert.match(renderer, /\^\(Forge_ore_barge\|Forge_massline_express_liner_ceramic\)/);
  assert.match(renderer, /legOptions\.parkOnly === true/);
  // Park-only claims and settles the unclaimed opening warm so it can actually park.
  assert.match(renderer, /this\._settleAndParkUnclaimedOpeningWarm\(\);/);
  assert.match(renderer, /this\._rosterPrewarmRoots\.includes\(root\)/);
});

test('park-only without a renderer leg still assigns LSPR and never mints acceptance after flight', async () => {
  const state = { mode: 'loading', render: {} };
  state.render.prepareOpeningGpuResources = async () => {
    state.mode = 'flight';
    return { skipped: false };
  };
  const info = console.info;
  console.info = () => {};
  let verdict;
  try {
    verdict = await waitForOpeningGpuResources(state, 50, { settleTail: false });
  } finally {
    console.info = info;
  }
  assert.ok(state.render.liveScenePresentReady, 'LSPR assigned');
  assert.deepEqual(await state.render.liveScenePresentReady, { skipped: true, reason: 'park-only' });
  const admission = state.render.requiredPackageAdmission;
  assert.ok(!admission || admission.status !== 'accepted', 'park-only does not publish acceptance');
  assert.equal(verdict, true);
});
