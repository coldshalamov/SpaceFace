import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { waitForOpeningGpuResources } from '../src/render/pipelineReadiness.js';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const rendererSource = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

function extractObjectMethod(source, name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `${name} exists in extracted renderer candidate`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `${name} has a body`);
  let depth = 0;
  let quote = null;
  let comment = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (comment === 'line') {
      if (char === '\n') comment = null;
      continue;
    }
    if (comment === 'block') {
      if (char === '*' && next === '/') {
        comment = null;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if ((char === '/' && next === '/') || (char === '/' && next === '*')) {
      comment = next === '/' ? 'line' : 'block';
      index += 1;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} body is balanced`);
}

function extractedRendererMethod(name) {
  const methodSource = extractObjectMethod(rendererSource, name);
  return new Function(`return ({ ${methodSource}\n});`)()[name];
}

function authoredSubject(materialName) {
  const leaf = { material: { name: materialName } };
  return {
    userData: { authoredAssetState: 'authored' },
    traverse(callback) {
      callback(this);
      callback(leaf);
    },
  };
}

function renderOwner({ state, root, touchSubjectExactTarget } = {}) {
  const render = state.render;
  if (touchSubjectExactTarget) render.touchSubjectExactTarget = touchSubjectExactTarget;
  return {
    state,
    _rosterPrewarmRoots: [root],
  };
}

function warmOwner({ state, root, warm, onPark } = {}) {
  return {
    state,
    _rosterPrewarmRoots: [root],
    _earlyCrucibleWarm: warm,
    _armCrucibleWarmBuildingSettle() {},
    _parkBoundedWarmRoots() { onPark(); },
  };
}

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
  assert.match(rendererSource, /if \(profile === 'opening'\) this\._touchOpeningBargeFamilyUnderShell\(root, warm\);/);
  assert.match(rendererSource, /\^\(Forge_ore_barge\|Forge_massline_express_liner_ceramic\)/);
  assert.match(rendererSource, /legOptions\.parkOnly === true/);
  // Park-only claims and settles the unclaimed opening warm so it can actually park.
  assert.match(rendererSource, /this\._settleAndParkUnclaimedOpeningWarm\(\);/);
  assert.match(rendererSource, /this\._rosterPrewarmRoots\.includes\(root\)/);
});

test('opening barge touch ignores a root removed before its first callback', async () => {
  const touchOpeningBarge = extractedRendererMethod('_touchOpeningBargeFamilyUnderShell');
  const root = { children: [authoredSubject('Forge_ore_barge_paint')] };
  const state = {
    mode: 'loading',
    world: {},
    contextRestoreSeq: 1,
    render: { renderer: {}, admissionRunGeneration: 7 },
  };
  let touched = 0;
  const owner = renderOwner({
    state,
    root,
    touchSubjectExactTarget: async () => { touched += 1; },
  });
  touchOpeningBarge.call(owner, root);
  owner._rosterPrewarmRoots.length = 0;
  await wait(10);
  assert.equal(touched, 0);
  assert.equal(state.render.openingBargeWarm, undefined);
});

test('opening barge touch drops its receipt after world/render supersession during await', async () => {
  const touchOpeningBarge = extractedRendererMethod('_touchOpeningBargeFamilyUnderShell');
  const root = { children: [authoredSubject('Forge_ore_barge_glass')] };
  const state = {
    mode: 'loading',
    world: {},
    contextRestoreSeq: 1,
    render: { renderer: {}, admissionRunGeneration: 8 },
  };
  let releaseTouch;
  let startedTouch;
  const touchStarted = new Promise((resolve) => { startedTouch = resolve; });
  const touchPending = new Promise((resolve) => { releaseTouch = resolve; });
  const owner = renderOwner({
    state,
    root,
    touchSubjectExactTarget: async () => {
      startedTouch();
      await touchPending;
    },
  });
  touchOpeningBarge.call(owner, root);
  await touchStarted;
  state.world = {};
  state.render.renderer = {};
  state.contextRestoreSeq = 2;
  releaseTouch();
  await wait(10);
  assert.equal(state.render.openingBargeWarm, undefined);
});

test('stale opening warm parking callback exits after owner supersession', () => {
  const settleAndPark = extractedRendererMethod('_settleAndParkUnclaimedOpeningWarm');
  const originalSetTimeout = globalThis.setTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  try {
    const state = {
      mode: 'loading',
      world: {},
      contextRestoreSeq: 3,
      render: { renderer: {}, admissionRunGeneration: 9 },
    };
    const root = {};
    const warm = { root, pendingAttachments: [], building: true, settleDeadlineAt: Date.now() + 1000 };
    let parks = 0;
    const owner = warmOwner({ state, root, warm, onPark: () => { parks += 1; } });
    settleAndPark.call(owner);
    assert.equal(timers.length, 1, 'loading schedules a bounded retry');
    state.world = {};
    owner._earlyCrucibleWarm = { root: {} };
    state.mode = 'flight';
    timers.shift().callback();
    assert.equal(parks, 0, 'stale callback cannot park a newer warm');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('obsolete opening warm parking token cannot park after B clears the transient warm slot', () => {
  const settleAndPark = extractedRendererMethod('_settleAndParkUnclaimedOpeningWarm');
  const originalSetTimeout = globalThis.setTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  try {
    const state = {
      mode: 'loading',
      world: {},
      contextRestoreSeq: 5,
      render: { renderer: {}, admissionRunGeneration: 11 },
    };
    const rootA = {};
    const rootB = {};
    const roots = [rootA, rootB];
    const warmA = { root: rootA, pendingAttachments: [], building: true, settleDeadlineAt: Date.now() + 1000 };
    const warmB = { root: rootB, pendingAttachments: [], building: true, settleDeadlineAt: Date.now() + 1000 };
    let parks = 0;
    const owner = warmOwner({ state, root: rootA, warm: warmA, onPark: () => { parks += 1; } });
    owner._rosterPrewarmRoots = roots;
    settleAndPark.call(owner);
    assert.equal(timers.length, 1, 'A schedules its loading retry');

    owner._earlyCrucibleWarm = warmB;
    settleAndPark.call(owner);
    assert.equal(timers.length, 2, 'B schedules its loading retry');

    // B has settled its handoff, leaving the shared slot transiently empty. A is still stale.
    owner._earlyCrucibleWarm = null;
    state.mode = 'flight';
    timers.shift().callback();
    assert.equal(parks, 0, 'A cannot park after B supersedes its invocation');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('opening warm parking gives up at the loading retry budget', () => {
  const settleAndPark = extractedRendererMethod('_settleAndParkUnclaimedOpeningWarm');
  const originalSetTimeout = globalThis.setTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  try {
    const state = {
      mode: 'loading',
      world: {},
      contextRestoreSeq: 4,
      render: { renderer: {}, admissionRunGeneration: 10 },
    };
    const root = {};
    const warm = { root, pendingAttachments: [], building: true, settleDeadlineAt: Date.now() + 1000 };
    let parks = 0;
    const owner = warmOwner({ state, root, warm, onPark: () => { parks += 1; } });
    settleAndPark.call(owner);
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const timer = timers.shift();
      assert.ok(timer, `retry ${attempt} was scheduled`);
      timer.callback();
    }
    assert.equal(timers.length, 0, 'the budget exits without another park timer');
    assert.equal(parks, 0, 'loading never parks even after the budget');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
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

test('opening barge touch is one pass after the warm settles and yields to a covering live cook', async () => {
  const touchOpeningBarge = extractedRendererMethod('_touchOpeningBargeFamilyUnderShell');
  const late = authoredSubject('Forge_ore_barge_glows');
  const root = { children: [authoredSubject('Forge_ore_barge_paint')] };
  const state = { mode: 'loading', world: {}, contextRestoreSeq: 1, render: { renderer: {}, admissionRunGeneration: 9 } };
  let touched = 0;
  let releaseAttach;
  const warm = { root, pendingAttachments: [new Promise((resolve) => { releaseAttach = resolve; })], settleDeadlineAt: Date.now() + 5000 };
  const owner = renderOwner({ state, root, touchSubjectExactTarget: async () => { touched += 1; } });
  touchOpeningBarge.call(owner, root, warm);
  await wait(10);
  assert.equal(touched, 0, 'no touch before the warm root\'s attaches settle');
  root.children.push(late);
  releaseAttach();
  await wait(10);
  assert.equal(touched, 2);
  assert.equal(state.render.openingBargeWarm.reason, 'single-pass');
  await wait(300);
  assert.equal(touched, 2, 'no 250 ms re-sweep');

  const covered = { mode: 'loading', world: {}, contextRestoreSeq: 1, render: { renderer: {}, admissionRunGeneration: 10, liveSectorGpuAdmission: true } };
  let coveredTouches = 0;
  const coveredRoot = { children: [authoredSubject('Forge_ore_barge_paint')] };
  const coveredOwner = renderOwner({ state: covered, root: coveredRoot, touchSubjectExactTarget: async () => { coveredTouches += 1; } });
  touchOpeningBarge.call(coveredOwner, coveredRoot);
  await wait(10);
  assert.equal(coveredTouches, 0);
  assert.equal(covered.render.openingBargeWarm.reason, 'live-cook-covers');
});
