import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalRendererPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../src/render/renderer.js',
);

// Keep the candidate's public relative imports intact. The executable fixture only rewrites this
// one copied module's direct imports to the real repository modules; those modules retain their
// production relative imports and execute the actual renderer driver.
const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'spaceface-opening-owner-'));
const runtimeRendererPath = path.join(runtimeRoot, 'renderer.mjs');
const rendererSource = await readFile(canonicalRendererPath, 'utf8');
const productionRendererDir = path.join(repoRoot, 'src/render');
const absoluteImport = (specifier) => pathToFileURL(path.resolve(productionRendererDir, specifier)).href;
const runtimeSource = rendererSource.replace(
  /((?:\bfrom\s+|\bimport\s*\(\s*))(['"])(\.\.?\/[^'"]+)\2/g,
  (_match, prefix, quote, specifier) => `${prefix}${quote}${absoluteImport(specifier)}${quote}`,
);
await writeFile(runtimeRendererPath, runtimeSource, 'utf8');
const { render: renderSystem } = await import(`${pathToFileURL(runtimeRendererPath).href}?opening-owner`);
test.after(async () => { await rm(runtimeRoot, { recursive: true, force: true }); });

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

function ownerFixture() {
  const nativeRenderer = { name: 'opening-owner-renderer' };
  const renderState = {
    admissionRunGeneration: 4,
    renderer: nativeRenderer,
    deferNoncriticalMeshStreaming: false,
    openingGraphPublicationFrozen: false,
    openingVfxFrozen: false,
  };
  const state = {
    mode: 'loading',
    render: renderState,
    world: { enterSerial: 9 },
    contextRestoreSeq: 2,
  };
  const owner = Object.create(renderSystem);
  Object.assign(owner, {
    state,
    renderer: nativeRenderer,
    scene: {},
    _rendererGeneration: 6,
    _contextRecovery: { generation: 3 },
    _rendererResourcesDisposed: false,
    _contextLost: false,
    _shipAuxPool: { pendingGrowth: null },
    _envMap: {},
    _envMapSource: 'reflection-cards',
    _foundryEnvTexture: null,
    _openingGraphPublicationGate: null,
    _openingLoadingAdmission: null,
    _openingFirstPicturePrepared: false,
    _deferNoncriticalMeshStreaming: false,
    _activityFrame: { prior: true },
    _activityFrameTick: 17,
  });
  return { owner, state, renderState, nativeRenderer };
}

function parkOnPublishYield(owner, counters) {
  owner._publishOpeningFirstPictureSteps = function* publishSteps() {
    counters.started += 1;
    try {
      yield;
      counters.resumed += 1;
      return true;
    } finally {
      counters.closed += 1;
    }
  };
  owner._openingFirstPictureUpgradePromisesSteps = function* upgradeSteps() {
    return [];
  };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

test('disposed opening owner closes a parked publish iterator without retry, fallback, or successor writes', async () => {
  const fixture = ownerFixture();
  const counters = { started: 0, resumed: 0, closed: 0 };
  let syncFallbackCalls = 0;
  parkOnPublishYield(fixture.owner, counters);
  fixture.owner._publishOpeningFirstPicture = () => {
    syncFallbackCalls += 1;
    return true;
  };
  const priorScheduler = globalThis.scheduler;
  const parked = deferred();
  globalThis.scheduler = { yield: () => parked.promise };
  try {
    const pending = fixture.owner.prepareOpeningFirstPicture(2000);
    await flush();
    assert.equal(counters.started, 1, 'the real publish driver reached its first yield');
    // The current loading owner freezes publication only at the final census. Stamp retirement
    // sentinels here so the stale-finally check still detects a write after disposal.
    fixture.owner._openingFirstPicturePrepared = true;
    fixture.renderState.deferNoncriticalMeshStreaming = true;
    fixture.owner._rendererResourcesDisposed = true;
    fixture.owner.state = null;
    parked.resolve();
    await assert.rejects(pending, /owner became inactive/);
    assert.equal(counters.resumed, 0, 'a disposed owner never resumes the generator body');
    assert.equal(counters.closed, 1, 'the parked iterator is closed exactly once');
    assert.equal(syncFallbackCalls, 0, 'cancellation never runs the permissive sync fallback');
    assert.equal(fixture.owner._openingFirstPicturePrepared, true,
      'stale cleanup does not rewrite the disposed owner latch');
    assert.equal(fixture.renderState.deferNoncriticalMeshStreaming, true,
      'stale cleanup does not write through the disposed state');
  } finally {
    globalThis.scheduler = priorScheduler;
  }
});

test('replacement owner generation cancels publish and upgrade waits without touching successor flags', async () => {
  const fixture = ownerFixture();
  const counters = { started: 0, resumed: 0, closed: 0 };
  let syncFallbackCalls = 0;
  parkOnPublishYield(fixture.owner, counters);
  fixture.owner._publishOpeningFirstPicture = () => {
    syncFallbackCalls += 1;
    return true;
  };
  const successorRenderer = { name: 'successor-renderer' };
  const successorRender = {
    admissionRunGeneration: 5,
    renderer: successorRenderer,
    deferNoncriticalMeshStreaming: false,
    openingGraphPublicationFrozen: false,
    openingVfxFrozen: false,
  };
  const successorState = {
    mode: 'loading',
    render: successorRender,
    world: { enterSerial: 10 },
    contextRestoreSeq: 3,
  };
  const priorScheduler = globalThis.scheduler;
  const parked = deferred();
  globalThis.scheduler = { yield: () => parked.promise };
  try {
    const pending = fixture.owner.prepareOpeningFirstPicture(2000);
    await flush();
    assert.equal(counters.started, 1);
    fixture.owner.state = successorState;
    fixture.owner.renderer = successorRenderer;
    fixture.owner._rendererGeneration = 7;
    fixture.owner._contextRecovery = { generation: 4 };
    fixture.owner._openingFirstPicturePrepared = true;
    fixture.owner._openingPublishDegradeEpoch = 91;
    fixture.owner._openingPublishDegradeVerdict = 'successor-cache';
    parked.resolve();
    await assert.rejects(pending, /owner became inactive/);
    assert.equal(counters.resumed, 0);
    assert.equal(counters.closed, 1);
    assert.equal(syncFallbackCalls, 0, 'replacement cancellation skips sync fallback');
    assert.equal(fixture.owner._openingFirstPicturePrepared, true,
      'the old call does not clear the replacement owner readiness latch');
    assert.equal(fixture.owner._openingPublishDegradeEpoch, 91);
    assert.equal(fixture.owner._openingPublishDegradeVerdict, 'successor-cache');
    assert.equal(successorRender.deferNoncriticalMeshStreaming, false,
      'the stale finally path leaves successor defer state untouched');
    assert.equal(successorRender.openingGraphPublicationFrozen, false,
      'the stale path cannot publish the old graph gate into the successor');
    assert.equal(successorRender.openingVfxFrozen, false);
  } finally {
    globalThis.scheduler = priorScheduler;
  }
});

test('live owner preserves one TypeError re-mint and successful second publish', async () => {
  const fixture = ownerFixture();
  let publishCalls = 0;
  let syncFallbackCalls = 0;
  fixture.owner._publishOpeningFirstPictureSteps = function* publishSteps() {
    publishCalls += 1;
    if (publishCalls === 1) throw new TypeError('transient publish fault');
    return true;
  };
  fixture.owner._openingFirstPictureUpgradePromisesSteps = function* upgradeSteps() {
    return [];
  };
  fixture.owner._publishOpeningFirstPicture = () => {
    syncFallbackCalls += 1;
    return true;
  };
  const result = await fixture.owner.prepareOpeningFirstPicture(2000);
  assert.equal(result, true);
  assert.equal(publishCalls, 3, 'initial fault remints once, then final publication runs once');
  assert.equal(syncFallbackCalls, 0, 'a live owner still succeeds before the sync fallback');
  assert.equal(fixture.owner._openingFirstPicturePrepared, true);
});

test('upgrade-owner cancellation closes its parked iterator before the skipped-settle fallback', async () => {
  const fixture = ownerFixture();
  let publishCalls = 0;
  const counters = { started: 0, resumed: 0, closed: 0 };
  fixture.owner._publishOpeningFirstPictureSteps = function* publishSteps() {
    publishCalls += 1;
    return true;
  };
  fixture.owner._openingFirstPictureUpgradePromisesSteps = function* upgradeSteps() {
    counters.started += 1;
    try {
      yield;
      counters.resumed += 1;
      return [];
    } finally {
      counters.closed += 1;
    }
  };
  const priorScheduler = globalThis.scheduler;
  const parked = deferred();
  globalThis.scheduler = { yield: () => parked.promise };
  try {
    const pending = fixture.owner.prepareOpeningFirstPicture(2000);
    await flush();
    assert.equal(publishCalls, 1);
    assert.equal(counters.started, 1, 'the upgrade driver reached its parked iterator');
    fixture.owner._rendererResourcesDisposed = true;
    fixture.owner.state = null;
    parked.resolve();
    await assert.rejects(pending, /owner became inactive/);
    assert.equal(counters.resumed, 0);
    assert.equal(counters.closed, 1);
  } finally {
    globalThis.scheduler = priorScheduler;
  }
});
