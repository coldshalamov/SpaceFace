import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  parseReleaseSoakArgs,
  runReleaseSoakCli,
  validateReleaseSoakPublication,
} from '../scripts/lib/releaseSoakCli.mjs';
import {
  RELEASE_SOAK_SCHEMA,
  REQUIRED_PRIMARY_CYCLE_MARKS,
  summarizeSamples,
  strictWorktreeFingerprint,
  strictRuntimeInputFingerprint,
  diffRuntimeInputFiles,
  validateReleaseSoakEvidence,
  validatePerformanceEvidence,
} from '../scripts/lib/releaseSoakContracts.mjs';
import {
  canonicalPostGcOwnerRows,
  createReleaseSoakCycleRunner,
  evaluateSourceStability,
  readSourceOverlayCoverage,
  POST_GC_OWNER_ROW_LIMIT,
  postGcOwnerEvaluateArgument,
  readReleaseSoakBaselineMemory,
  resolvePostContextObservationWindow,
  summarizeImmutableSavePopulation,
  summarizeRestorePopulation,
  summarizeSaveEnvelope,
  waitForKnownAssetRequests,
} from '../scripts/lib/releaseSoakProbe.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);

test('post-GC checkpoints retain bounded canonical residency owner detail', async () => {
  const source = await readFile(path.join(REPO_ROOT, 'scripts/lib/releaseSoakProbe.mjs'), 'utf8');
  assert.match(source, /page\.evaluate\(\(\{ phaseTag: tag, ownerRowLimit \}\)/,
    'post-GC page evaluation must use one serialized argument object');
  assert.match(source, /diagnostics\(\{\s*canonical: true,\s*includeEvents: false,\s*includeOwners: true\s*\}\)/,
    'post-GC snapshots must ask the existing residency API for owner rows');
  assert.equal(POST_GC_OWNER_ROW_LIMIT, 256);

  // Playwright serializes exactly one argument. Exercise the same callback boundary so a
  // future change cannot silently turn the row limit into undefined and emit empty rows.
  const evaluateOneSerializedArgument = async (callback, argument) => callback(argument);
  const evaluateArgument = postGcOwnerEvaluateArgument('owner-fixture', 2);
  const evaluated = await evaluateOneSerializedArgument(
    ({ phaseTag, ownerRowLimit }) => ({ phaseTag, ownerRowLimit, rows: ['a', 'b', 'c'].slice(0, ownerRowLimit) }),
    evaluateArgument,
  );
  assert.deepEqual(evaluated, { phaseTag: 'owner-fixture', ownerRowLimit: 2, rows: ['a', 'b'] });

  const diagnostic = canonicalPostGcOwnerRows({
    ownerCount: 3,
    owners: [
      {
        owner: 'Object3D', ownerName: 'boundary-z', contentHash: null,
        released: false, assets: 2, bytes: 10, roles: ['live-boundary', 'live-boundary'],
      },
      {
        owner: 'render-package', ownerName: null, contentHash: 'hash-a',
        released: true, assets: 1, bytes: 20, roles: ['render-package-cache'],
      },
      {
        owner: 'Object3D', ownerName: 'boundary-a', contentHash: null,
        released: false, assets: 1, bytes: 5, roles: ['ready-instance'],
      },
    ],
  }, 2);
  assert.equal(diagnostic.ownerCount, 3);
  assert.equal(diagnostic.truncated, true);
  assert.deepEqual(diagnostic.rows, [
    {
      identity: null,
      identityLabel: 'render-package|hash-a',
      identityAmbiguous: true,
      role: ['render-package-cache'],
      contentHash: 'hash-a',
      released: true,
      assets: 1,
      bytes: 20,
    },
    {
      identity: null,
      identityLabel: 'Object3D|boundary-z',
      identityAmbiguous: true,
      role: ['live-boundary'],
      contentHash: null,
      released: false,
      assets: 2,
      bytes: 10,
    },
  ]);
  assert.equal(canonicalPostGcOwnerRows({ owners: null }), null,
    'missing owner diagnostics remain explicitly unavailable');
});

function fakeResidencyPage({ pendingRequests = 0, settleOnPoll = false, waitError = null, owners = [] } = {}) {
  const calls = [];
  const state = {
    pendingRequests,
    owners,
  };
  const residency = {
    canonicalDiagnostics: () => ({ pendingRequests: state.pendingRequests }),
    diagnostics: () => ({
      pendingRequests: state.pendingRequests,
      ownerCount: state.owners.length,
      owners: state.owners,
    }),
  };
  const fakeWindow = {
    SF: {
      state: {
        mode: 'docked',
        ui: { docked: true },
        entityList: [],
        render: { renderer: { info: { programs: [] } } },
      },
      registry: {
        get: (name) => name === 'render' ? { _assetResidency: residency } : null,
      },
    },
  };
  const page = {
    calls,
    waitForFunction: async (predicate, _argument, options) => {
      calls.push({ kind: 'wait', timeout: options?.timeout });
      if (waitError) throw waitError;
      const before = predicate();
      if (settleOnPoll) state.pendingRequests = 0;
      assert.equal(predicate(), state.pendingRequests === 0);
      if (!settleOnPoll) assert.equal(before, true);
    },
    evaluate: async (callback, argument) => {
      calls.push({ kind: 'evaluate', argument });
      return callback(argument);
    },
    context: () => ({
      newCDPSession: async () => {
        calls.push({ kind: 'context' });
        return {
          send: async () => {},
          detach: async () => {},
        };
      },
    }),
  };
  return { fakeWindow, page, state };
}

async function withFakeWindow(fakeWindow, action) {
  const previousWindow = globalThis.window;
  globalThis.window = fakeWindow;
  try {
    return await action();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test('known residency readiness waits for pending requests to settle and uses the canonical ledger', async () => {
  const { fakeWindow, page } = fakeResidencyPage({ pendingRequests: 2, settleOnPoll: true });
  await withFakeWindow(fakeWindow, () => waitForKnownAssetRequests(page, { timeoutMs: 30_000 }));
  assert.deepEqual(page.calls, [{ kind: 'wait', timeout: 30_000 }]);
});

test('known residency readiness fails with bounded pending-owner detail when requests stay pending', async () => {
  const { fakeWindow, page } = fakeResidencyPage({
    pendingRequests: 3,
    waitError: new Error('known requests did not settle'),
    owners: [{
      owner: 'render-package',
      ownerName: 'ore-barge'.repeat(100),
      contentHash: 'hash-1',
      requests: 3,
      requestKeys: ['request-a'.repeat(100)],
    }],
  });
  await withFakeWindow(fakeWindow, async () => {
    await assert.rejects(
      waitForKnownAssetRequests(page, { timeoutMs: 25 }),
      (error) => error.message.includes('baseline residency readiness failed after 25 ms')
        && error.message.includes('"pendingRequests":3')
        && error.message.length < 2_000,
    );
  });
  assert.deepEqual(page.calls.map((call) => call.kind), ['wait', 'evaluate']);
});

test('baseline readiness and snapshot share the existing 30-second bound and order', async () => {
  const { fakeWindow, page } = fakeResidencyPage({ pendingRequests: 1, settleOnPoll: true });
  const baseline = await withFakeWindow(fakeWindow, () => readReleaseSoakBaselineMemory(page));
  assert.equal(baseline.phaseTag, 'docked-market-start');
  assert.equal(page.calls[0].kind, 'wait');
  assert.equal(page.calls[0].timeout, 30_000);
  assert.equal(page.calls.findIndex((call) => call.kind === 'context') > 0, true);
  assert.equal(page.calls.at(-1).argument.phaseTag, 'docked-market-start');
});

test('baseline bound covers an unresolved readiness wait before snapshot work begins', async () => {
  const { fakeWindow, page } = fakeResidencyPage({ pendingRequests: 1 });
  page.waitForFunction = async () => new Promise(() => {});
  await withFakeWindow(fakeWindow, async () => {
    await assert.rejects(
      readReleaseSoakBaselineMemory(page, { timeoutMs: 20 }),
      /release-soak baseline memory snapshot timed out after 20 ms/,
    );
  });
  assert.deepEqual(page.calls, []);
});

test('restore population receipt compares the loaded envelope with a bounded post-load census', () => {
  const saved = [
    { id: 1, type: 'ship' },
    { id: 7, type: 'wreck', worldRecordId: 'wreck:7' },
  ];
  const regenerated = Array.from({ length: 20 }, (_, index) => ({
    id: 100 + index,
    type: index % 2 ? 'asteroid' : 'ship',
  }));
  const result = summarizeRestorePopulation({
    loadedSlot: 'quick',
    envelopeEntities: saved,
    postLoadEntities: [...saved, ...regenerated],
  });

  assert.deepEqual(
    {
      loadedSlot: result.loadedSlot,
      envelopeEntityCount: result.envelopeEntityCount,
      postLoadEntityCount: result.postLoadEntityCount,
      delta: result.delta,
    },
    { loadedSlot: 'quick', envelopeEntityCount: 2, postLoadEntityCount: 22, delta: 20 },
  );
  assert.equal(result.newlyMaterialized.count, 20);
  assert.deepEqual(result.newlyMaterialized.byType, { asteroid: 10, ship: 10 });
  assert.equal(result.newlyMaterialized.samples.length, 16, 'diagnostic samples must stay bounded');

  const stable = summarizeRestorePopulation({
    loadedSlot: 'quick',
    envelopeEntities: saved,
    postLoadEntities: saved,
  });
  assert.equal(stable.newlyMaterialized, null, 'equal populations need no extra histogram');
});

test('immutable cycle runner fixes warmup0 bytes before the baseline and all measured restores', async () => {
  const calls = [];
  let saves = 0;
  const runner = createReleaseSoakCycleRunner({
    immutable: true,
    async runCycle(_page, options) {
      calls.push(options);
      const envelope = options.fixedSave?.envelope || {
        available: true, slot: 'quick', serializedIdentity: { sha256: `save-${++saves}` },
        envelopeEntities: [{ id: 'player' }, { id: 'persistent-wreck' }],
      };
      return {
        saved: options.fixedSave?.saved || { tick: 42 }, saveEnvelope: envelope,
        loadedEnvelope: { serializedIdentity: envelope.serializedIdentity }, fixedSaveUnchanged: true,
        restorePopulation: { envelopeEntityCount: envelope.envelopeEntities.length },
      };
    },
  });
  await runner.run(null, { index: 'warmup-0' });
  const original = runner.fixedSave;
  await runner.run(null, { index: 'warmup-1' });
  const lastWarmup = await runner.run(null, { index: 'warmup-2' });
  assert.equal(lastWarmup.restorePopulation.envelopeEntityCount, original.envelope.envelopeEntities.length,
    'the pre-measurement baseline population belongs to the same fixed envelope');
  for (let index = 0; index < 3; index++) await runner.run(null, { index });
  assert.equal(saves, 1, 'only the successful initial warmup creates the public save');
  assert.equal(calls[0].fixedSave, null);
  assert(calls.slice(1).every((call) => call.fixedSave === original),
    'later warmups and measured restores all reuse the exact validated reference');
  assert.deepEqual(calls.filter((call) => Number.isInteger(call.index)).map((call) => call.index), [0, 1, 2],
    'warmup cycles do not consume the three measured rows');
});

test('ordinary soak cycles retain fresh-save behavior', async () => {
  const calls = [];
  const runner = createReleaseSoakCycleRunner({
    async runCycle(_page, options) { calls.push(options); return { index: options.index }; },
  });
  for (const index of ['warmup-0', 'warmup-1', 0, 1, 2]) await runner.run(null, { index });
  assert(calls.every((call) => call.fixedSave === null));
  assert.equal(runner.fixedSave, null, 'normal cycles never acquire an immutable save reference');
});

test('immutable reference requires successful restore validation and survives a failed retry', async () => {
  let outcome = 'reject';
  const envelope = { available: true, slot: 'quick', serializedIdentity: { sha256: 'original-bytes' } };
  const calls = [];
  const runner = createReleaseSoakCycleRunner({
    immutable: true,
    async runCycle(_page, options) {
      calls.push(options);
      if (outcome === 'reject') throw new Error('public restore failed');
      return {
        saveEnvelope: envelope, saved: { tick: 42 }, fixedSaveUnchanged: outcome === 'valid',
        loadedEnvelope: { serializedIdentity: { sha256: outcome === 'valid' ? 'original-bytes' : 'changed-bytes' } },
      };
    },
  });
  await assert.rejects(runner.run(null, { index: 'warmup-0' }), /public restore failed/);
  assert.equal(runner.fixedSave, null);
  outcome = 'mutated';
  await assert.rejects(runner.run(null, { index: 'warmup-0' }), /original quick-save bytes/);
  assert.equal(runner.fixedSave, null, 'an invalid initial result cannot establish baseline authority');
  outcome = 'valid';
  await runner.run(null, { index: 'warmup-0' });
  const original = runner.fixedSave;
  outcome = 'reject';
  await assert.rejects(runner.run(null, { index: 0 }), /public restore failed/);
  assert.equal(runner.fixedSave, original);
  outcome = 'valid';
  await runner.run(null, { index: 0 });
  assert.equal(calls.at(-1).fixedSave, original, 'retry preserves the last validated fixed envelope');
});

test('immutable save diagnostic binds repeated materialization to one serialized envelope', () => {
  const raw = JSON.stringify({
    fmt: 'spaceface-save',
    version: 15,
    data: {
      meta: { tick: 42, simTime: 0.7, savedAt: '2026-10-15T00:00:00.000Z' },
      player: { credits: 125 },
      cargo: { items: { ore: 3 } },
      entities: {
        player: { id: 'player-1', type: 'ship', pos: { x: 12.5, z: -7 }, vel: { x: 3, z: 4 } },
        persistent: [{ id: 'wreck-1', type: 'wreck', data: { worldRecordId: 'wreck:1' } }],
      },
    },
  });
  const base = summarizeSaveEnvelope(raw, { slot: 'quick' });
  assert.equal(base.available, true);
  assert.equal(base.serializedIdentity.bytes, Buffer.byteLength(raw));
  assert.equal(base.envelopeIdentity.tick, 42);
  assert.deepEqual(base.playerSnapshot, {
    pos: { x: 12.5, z: -7 },
    speed: 5,
    economy: { credits: 125, cargoItems: { ore: 3 } },
  });
  assert.deepEqual(base.envelopeEntities.map((row) => row.id), ['player-1', 'wreck-1']);

  const population = summarizeImmutableSavePopulation({
    savedEnvelopeEntities: base.envelopeEntities,
    postLoadEntities: [
      ...base.envelopeEntities,
      { id: 'sector-1', type: 'asteroid' },
      { id: 'sector-2', type: 'asteroid' },
    ],
  });
  assert.equal(population.baseEntityCount, 2);
  assert.equal(population.postLoadEntityCount, 4);
  assert.equal(population.newlyMaterialized.count, 2);
  assert.deepEqual(population.newlyMaterialized.byType, { asteroid: 2 });
  assert.deepEqual(population.newlyMaterialized.samples.map((row) => row.key), ['id:sector-1', 'id:sector-2']);
});

test('probe rejects a changed worktree after persisting diagnostic telemetry', async () => {
  const source = await readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8');
  assert.match(source, /const worktreeStable = endFingerprint\.digest === startFingerprint\.digest/);
  assert.match(source, /sourceStability\.pass \? 'pass' : 'fail'[\s\S]*await writeTelemetry\(/);
  assert.doesNotMatch(source, /assert\.equal\(endFingerprint\.digest, startFingerprint\.digest/);
});

test('full pinned overlays use served identity while partial overlays remain worktree-strict', () => {
  const identity = {
    schema: 'spaceface.sourceBaseline.v1',
    sourceCommit: 'a'.repeat(40),
    sourceOverlayDigest: 'b'.repeat(64),
    fileCount: 2220,
    totalBytes: 123,
    strictRuntimeIsolation: true,
  };
  const stableOverlay = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', valid: true, fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredRuntimeInputsStable: true,
    uncoveredHeadStable: true,
  });
  assert.equal(stableOverlay.mode, 'served-overlay');
  assert.equal(stableOverlay.pass, true, 'live worktree churn cannot invalidate a full pinned served graph');

  const changedOverlay = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', valid: true, fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity, sourceOverlayDigest: 'c'.repeat(64) },
    worktreeStable: true,
    uncoveredRuntimeInputsStable: true,
    uncoveredHeadStable: true,
  });
  assert.equal(changedOverlay.pass, false, 'a served-byte identity change remains fatal');

  const legacyOverlay = { ...identity };
  delete legacyOverlay.strictRuntimeIsolation;
  const legacyServer = evaluateSourceStability({
    baselineSource: { identity: legacyOverlay },
    coverage: { captureScope: 'all-runtime', valid: true, fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...legacyOverlay },
    servedAtEnd: { ...legacyOverlay },
    worktreeStable: false,
    uncoveredRuntimeInputsStable: true,
    uncoveredHeadStable: false,
  });
  assert.equal(legacyServer.pass, false,
    'a full-runtime manifest without the strict-isolation server capability remains non-promoting');

  const partialOverlay = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'performance-paths', valid: true, fullRuntime: false },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
  });
  assert.equal(partialOverlay.pass, false, 'partial overlays still reject live worktree drift');

  const uncoveredAssetChange = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', valid: true, fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredRuntimeInputsStable: false,
    uncoveredHeadStable: true,
  });
  assert.equal(uncoveredAssetChange.pass, false,
    'an asset outside the source overlay remains a required stable runtime input');

  const uncoveredRuntimeFileChange = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', valid: true, fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredRuntimeInputsStable: false,
    uncoveredHeadStable: true,
  });
  assert.equal(uncoveredRuntimeFileChange.pass, false,
    'a runtime file outside the pinned source manifest remains fatal');

  const strictHeadDrift = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', valid: true, fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredRuntimeInputsStable: true,
    uncoveredHeadStable: false,
  });
  assert.equal(strictHeadDrift.pass, true,
    'verified strict served bytes and live inputs remain valid when only Git HEAD advances');

  const scopedRuntime = evaluateSourceStability({
    worktreeStable: false,
    runtimeInputsStable: true,
  });
  assert.equal(scopedRuntime.mode, 'runtime-inputs');
  assert.equal(scopedRuntime.pass, true,
    'without an overlay, unrelated Git/worktree drift is accepted only when runtime inputs match');
  const changedRuntime = evaluateSourceStability({
    worktreeStable: true,
    runtimeInputsStable: false,
  });
  assert.equal(changedRuntime.pass, false, 'runtime input changes remain fatal');
});

test('primary evidence accepts worktree drift only with a stable full-runtime overlay', () => {
  const evidence = makeValidEvidence({
    runtime: 'electron',
    taskId: 'overlay-stability-contract',
    artifact: {
      kind: 'screenshot',
      path: 'route.png',
      bytes: 1,
      sha256: 'a'.repeat(64),
    },
  });
  const identity = {
    schema: 'spaceface.sourceBaseline.v1',
    sourceCommit: 'b'.repeat(40),
    sourceOverlayDigest: 'c'.repeat(64),
    fileCount: 2220,
    totalBytes: 456,
    strictRuntimeIsolation: true,
  };
  evidence.sourceOverlay = {
    manifest: '.devshots/source-baselines/current.json',
    requested: identity,
    served: { ...identity },
    servedAtEnd: { ...identity },
    coverage: { captureScope: 'all-runtime', valid: true, fullRuntime: true, pinnedPathCount: 2220 },
  };
  evidence.runtimeInputs = {
    scope: 'uncovered-runtime-inputs',
    start: { schema: 'spaceface.releaseSoakRuntimeInputs.v1', digest: 'e'.repeat(64), fileCount: 4, missingPaths: [] },
    end: { schema: 'spaceface.releaseSoakRuntimeInputs.v1', digest: 'e'.repeat(64), fileCount: 4, missingPaths: [] },
    changedPaths: [],
  };
  evidence.sourceStability = {
    mode: 'served-overlay',
    overlayCoversRuntime: true,
    worktreeStable: false,
    servedSourceStable: true,
    uncoveredRuntimeInputsStable: true,
    uncoveredHeadStable: false,
    pass: true,
  };
  evidence.fingerprints.end = { ...evidence.fingerprints.end, digest: 'd'.repeat(64), id: `0123456789ab-${'d'.repeat(16)}` };
  const result = validateReleaseSoakEvidence(evidence);
  assert.equal(result.pass, true, result.failures.join('; '));

  const changedLiveInput = structuredClone(evidence);
  changedLiveInput.runtimeInputs.end.digest = 'f'.repeat(64);
  changedLiveInput.runtimeInputs.changedPaths = [{ path: 'assets/ship.glb' }];
  changedLiveInput.sourceStability.uncoveredRuntimeInputsStable = false;
  changedLiveInput.sourceStability.pass = false;
  const liveInputResult = validateReleaseSoakEvidence(changedLiveInput);
  assert.equal(liveInputResult.pass, false);
  assert(liveInputResult.failures.some((failure) => /uncovered runtime-input/i.test(failure))
    || liveInputResult.failures.some((failure) => /clean, path-attributed/i.test(failure)),
  'a live asset change stays fatal even when strict overlay source is unchanged');

  const partial = structuredClone(evidence);
  partial.sourceOverlay.coverage = { captureScope: 'performance-paths', fullRuntime: false };
  const partialResult = validateReleaseSoakEvidence(partial);
  assert.equal(partialResult.pass, false);
  assert(partialResult.failures.some((failure) => /worktree fingerprint changed/i.test(failure)));

  const legacyFull = structuredClone(evidence);
  delete legacyFull.sourceOverlay.requested.strictRuntimeIsolation;
  delete legacyFull.sourceOverlay.served.strictRuntimeIsolation;
  delete legacyFull.sourceOverlay.servedAtEnd.strictRuntimeIsolation;
  const legacyResult = validateReleaseSoakEvidence(legacyFull);
  assert.equal(legacyResult.pass, false);
  assert(legacyResult.failures.some((failure) => /strict runtime isolation/i.test(failure)),
    'old full-runtime receipts without a strict-isolation guarantee remain non-promoting');
});

test('primary evidence accepts unrelated Git drift only when scoped runtime inputs match', () => {
  const evidence = makeValidEvidence({
    runtime: 'electron',
    taskId: 'runtime-input-stability',
    artifact: { kind: 'screenshot', path: 'route.png', bytes: 1, sha256: 'c'.repeat(64) },
  });
  const digest = 'a'.repeat(64);
  evidence.fingerprints.end = {
    ...evidence.fingerprints.end,
    digest: 'b'.repeat(64),
    id: `0123456789ab-${'b'.repeat(16)}`,
  };
  evidence.runtimeInputs = {
    scope: 'runtime-inputs',
    start: { schema: 'spaceface.releaseSoakRuntimeInputs.v1', digest, fileCount: 18000, missingPaths: [] },
    end: { schema: 'spaceface.releaseSoakRuntimeInputs.v1', digest, fileCount: 18000, missingPaths: [] },
    changedPaths: [],
  };
  evidence.sourceStability = {
    mode: 'runtime-inputs',
    runtimeInputsSchema: 'spaceface.releaseSoakRuntimeInputs.v1',
    runtimeInputsStable: true,
    worktreeStable: false,
    pass: true,
  };
  const stable = validateReleaseSoakEvidence(evidence);
  assert.equal(stable.pass, true, stable.failures.join('; '));

  const changed = structuredClone(evidence);
  changed.runtimeInputs.end.digest = 'c'.repeat(64);
  const changedResult = validateReleaseSoakEvidence(changed);
  assert.equal(changedResult.pass, false);
  assert(changedResult.failures.some((failure) => /worktree fingerprint changed/i.test(failure)));
});

test('full-runtime overlay coverage rejects missing or unknown path policy', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-overlay-coverage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'baseline.json');
  const base = {
    captureScope: 'all-runtime',
    runtimePathPolicy: 'index.html + vendor/three.module.js + src/**/*.{js,json} + scripts/lib/**/*.{js,mjs,cjs} + styles/**/*',
    files: [{ path: 'index.html' }],
    omittedPaths: [],
  };
  await writeFile(manifestPath, JSON.stringify(base), 'utf8');
  const supported = await readSourceOverlayCoverage({ path: manifestPath });
  assert.equal(supported.valid, true);
  assert.equal(supported.fullRuntime, true);

  await writeFile(manifestPath, JSON.stringify({ ...base, runtimePathPolicy: 'unknown future policy' }), 'utf8');
  const unknown = await readSourceOverlayCoverage({ path: manifestPath });
  assert.equal(unknown.valid, false);
  assert.equal(unknown.fullRuntime, false);

  const missing = { ...base };
  delete missing.omittedPaths;
  await writeFile(manifestPath, JSON.stringify(missing), 'utf8');
  const incomplete = await readSourceOverlayCoverage({ path: manifestPath });
  assert.equal(incomplete.valid, false);
  assert.equal(incomplete.fullRuntime, false);
});

test('runtime input fingerprint follows app, worker, asset, and launch bytes but ignores docs', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'spaceface-runtime-input-fingerprint-'));
  const runGit = (args) => execFileAsync('git', args, { cwd: fixture, windowsHide: true });
  try {
    for (const directory of ['src', 'scripts/lib', 'assets', 'docs']) {
      await mkdir(path.join(fixture, directory), { recursive: true });
    }
    await writeFile(path.join(fixture, 'index.html'), '<script type="module" src="/src/app.js"></script>\n');
    await writeFile(path.join(fixture, 'src', 'app.js'), 'import "../scripts/lib/simReadModel.mjs";\n');
    await writeFile(path.join(fixture, 'src', 'AGENTS.md'), 'initial guidance\n');
    await writeFile(path.join(fixture, 'scripts', 'lib', 'CLAUDE.md'), 'initial guidance\n');
    await writeFile(path.join(fixture, 'scripts', 'lib', 'simReadModel.mjs'), 'export const revision = 1;\n');
    await writeFile(path.join(fixture, 'assets', 'ship.svg'), '<svg/>\n');
    await writeFile(path.join(fixture, 'docs', 'notes.md'), 'initial\n');
    await runGit(['init', '-q']);
    await runGit(['config', 'user.email', 'runtime-fingerprint@example.invalid']);
    await runGit(['config', 'user.name', 'Runtime Fingerprint']);
    await runGit(['add', '.']);
    await runGit(['commit', '-qm', 'fixture']);

    const baseline = await strictRuntimeInputFingerprint(fixture, { includeFileHashes: true });
    assert.equal(baseline.schema, 'spaceface.releaseSoakRuntimeInputs.v1');
    assert.equal(baseline.fileCount, 4);

    await writeFile(path.join(fixture, 'docs', 'notes.md'), 'documentation-only drift\n');
    await writeFile(path.join(fixture, 'src', 'AGENTS.md'), 'changed guidance\n');
    await writeFile(path.join(fixture, 'scripts', 'lib', 'CLAUDE.md'), 'changed guidance\n');
    const docsChanged = await strictRuntimeInputFingerprint(fixture, { includeFileHashes: true });
    assert.equal(docsChanged.digest, baseline.digest,
      'documentation-only drift does not change actual app input identity');

    await writeFile(path.join(fixture, 'scripts', 'lib', 'simReadModel.mjs'), 'export const revision = 2;\n');
    const workerChanged = await strictRuntimeInputFingerprint(fixture, { includeFileHashes: true });
    assert.notEqual(workerChanged.digest, baseline.digest,
      'a browser/worker module under scripts/lib remains part of runtime identity');
    assert.deepEqual(diffRuntimeInputFiles(baseline.files, workerChanged.files).map((entry) => entry.path), [
      'scripts/lib/simReadModel.mjs',
    ], 'changed runtime evidence identifies the exact changed module');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('full-runtime overlay stability fingerprints only uncovered runtime inputs', async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'spaceface-uncovered-runtime-fingerprint-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const runGit = (args) => execFileAsync('git', args, { cwd: fixture, windowsHide: true });
  for (const directory of ['src', 'scripts/lib', 'assets', 'docs', 'electron']) {
    await mkdir(path.join(fixture, directory), { recursive: true });
  }
  await mkdir(path.join(fixture, 'src', 'sim'), { recursive: true });
  await mkdir(path.join(fixture, 'src', 'core'), { recursive: true });
  await writeFile(path.join(fixture, 'index.html'), '<script type="module"></script>\n');
  await writeFile(path.join(fixture, 'src', 'pinned.js'), 'export const revision = 1;\n');
  await writeFile(path.join(fixture, 'src', 'core', 'simWorkerHost.js'), 'export const lane = "worker";\n');
  await writeFile(path.join(fixture, 'scripts', 'lib', 'worker.mjs'), 'export const revision = 1;\n');
  const hostInputs = [
    ['scripts/lib/gameServer.cjs', 'module.exports = { revision: 1 };\n'],
    ['scripts/lib/visualProbeServer.mjs', 'export const revision = 1;\n'],
    ['scripts/lib/staticCachePolicy.cjs', 'module.exports = { revision: 1 };\n'],
    ['scripts/lib/playerSaveStore.cjs', 'module.exports = { revision: 1 };\n'],
    ['scripts/lib/userContentStore.cjs', 'module.exports = { revision: 1 };\n'],
  ];
  for (const [relative, contents] of hostInputs) {
    await writeFile(path.join(fixture, relative), contents);
  }
  await writeFile(path.join(fixture, 'assets', 'ship.glb'), 'asset-one');
  await writeFile(path.join(fixture, 'electron', 'main.cjs'), 'module.exports = 1;\n');
  await writeFile(path.join(fixture, 'server.js'), 'export const boot = 1;\n');
  await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}\n');
  await writeFile(path.join(fixture, 'docs', 'notes.md'), 'initial\n');
  await runGit(['init', '-q']);
  await runGit(['config', 'user.email', 'uncovered-runtime@example.invalid']);
  await runGit(['config', 'user.name', 'Uncovered Runtime']);
  await runGit(['add', '.']);
  await runGit(['commit', '-qm', 'fixture']);

  const pinned = [
    'index.html', 'src/pinned.js', 'src/core/simWorkerHost.js', 'scripts/lib/worker.mjs',
    ...hostInputs.map(([relative]) => relative),
  ];
  const strictOptions = {
    excludePaths: pinned,
    includeFileHashes: true,
    strictOverlayIsolation: true,
  };
  const baseline = await strictRuntimeInputFingerprint(fixture, {
    excludePaths: pinned,
    includeFileHashes: true,
  });
  const strictBaseline = await strictRuntimeInputFingerprint(fixture, strictOptions);

  await writeFile(path.join(fixture, 'src', 'unserved-added.js'), 'export const added = true;\n');
  await writeFile(path.join(fixture, 'src', 'sim', 'unserved-added.json'), '{"added":true}\n');
  await writeFile(path.join(fixture, 'src', 'AGENTS.md'), 'guidance changed\n');
  const strictUnservedChurn = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.equal(strictUnservedChurn.digest, strictBaseline.digest,
    'strict isolation excludes added policy-covered source and guidance churn');
  assert.deepEqual(diffRuntimeInputFiles(strictBaseline.files, strictUnservedChurn.files), []);

  await writeFile(path.join(fixture, 'src', 'core', 'simWorkerHost.js'), 'export const lane = "main";\n');
  await writeFile(path.join(fixture, 'scripts', 'lib', 'worker.mjs'), 'export const revision = 2;\n');
  const workerSourceChanged = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.equal(workerSourceChanged.digest, strictBaseline.digest,
    'strict overlay isolation ignores browser modules whose bytes are served from the pinned overlay');
  assert.deepEqual(diffRuntimeInputFiles(strictBaseline.files, workerSourceChanged.files), []);

  await writeFile(path.join(fixture, 'scripts', 'lib', 'gameServer.cjs'), 'module.exports = { revision: 2 };\n');
  await writeFile(path.join(fixture, 'scripts', 'lib', 'visualProbeServer.mjs'), 'export const revision = 2;\n');
  await writeFile(path.join(fixture, 'scripts', 'lib', 'staticCachePolicy.cjs'), 'module.exports = { revision: 2 };\n');
  await writeFile(path.join(fixture, 'scripts', 'lib', 'playerSaveStore.cjs'), 'module.exports = { revision: 2 };\n');
  await writeFile(path.join(fixture, 'scripts', 'lib', 'userContentStore.cjs'), 'module.exports = { revision: 2 };\n');
  const hostServerChanged = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.notEqual(hostServerChanged.digest, strictBaseline.digest,
    'pinned paths executed by the Node server stay in the runtime input fingerprint');
  assert.deepEqual(diffRuntimeInputFiles(strictBaseline.files, hostServerChanged.files).map((entry) => entry.path), [
    'scripts/lib/gameServer.cjs',
    'scripts/lib/playerSaveStore.cjs',
    'scripts/lib/staticCachePolicy.cjs',
    'scripts/lib/userContentStore.cjs',
    'scripts/lib/visualProbeServer.mjs',
  ]);
  for (const [relative, contents] of hostInputs) await writeFile(path.join(fixture, relative), contents);
  const hostRestored = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.equal(hostRestored.digest, strictBaseline.digest,
    'restoring Node server inputs restores the strict source fingerprint');

  const partialUnservedChurn = await strictRuntimeInputFingerprint(fixture, {
    excludePaths: pinned,
    includeFileHashes: true,
  });
  assert.notEqual(partialUnservedChurn.digest, baseline.digest,
    'partial or unknown isolation continues to fingerprint unpinned source modules');
  assert.deepEqual(diffRuntimeInputFiles(baseline.files, partialUnservedChurn.files).map((entry) => entry.path), [
    'src/sim/unserved-added.json', 'src/unserved-added.js',
  ]);

  await writeFile(path.join(fixture, 'docs', 'notes.md'), 'docs-only edit\n');
  const docsOnly = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.equal(docsOnly.digest, strictBaseline.digest, 'docs-only changes do not affect uncovered runtime identity');
  assert.deepEqual(diffRuntimeInputFiles(strictBaseline.files, docsOnly.files), []);

  await writeFile(path.join(fixture, 'assets', 'ship.glb'), 'asset-two');
  const assetChanged = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.notEqual(assetChanged.digest, strictBaseline.digest, 'uncovered authored assets remain part of runtime identity');
  assert.deepEqual(diffRuntimeInputFiles(strictBaseline.files, assetChanged.files).map((entry) => entry.path), [
    'assets/ship.glb',
  ]);

  await writeFile(path.join(fixture, 'server.js'), 'export const boot = 2;\n');
  await writeFile(path.join(fixture, 'package.json'), '{"type":"module","boot":2}\n');
  const bootstrapChanged = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.deepEqual(diffRuntimeInputFiles(assetChanged.files, bootstrapChanged.files).map((entry) => entry.path), [
    'package.json', 'server.js',
  ], 'bootstrap and package changes are attributed separately from overlay-covered source');

  await rm(path.join(fixture, 'assets', 'ship.glb'));
  const missingAsset = await strictRuntimeInputFingerprint(fixture, strictOptions);
  assert.equal(missingAsset.files.find((entry) => entry.path === 'assets/ship.glb').missing, true,
    'deleted runtime inputs remain visible instead of silently vanishing from the fingerprint');
});

test('excluded overlay files do not hide unpinned runtime mutations from the fingerprint', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'spaceface-source-fingerprint-'));
  const runGit = (args) => execFileAsync('git', args, { cwd: fixture, windowsHide: true });
  const pinned = path.join(fixture, 'src', 'pinned.js');
  const style = path.join(fixture, 'styles', 'kit.css');
  try {
    await mkdir(path.dirname(pinned), { recursive: true });
    await mkdir(path.dirname(style), { recursive: true });
    await writeFile(pinned, 'export const pinned = 1;\n');
    await writeFile(style, ':root { --fixture: 1; }\n');
    await runGit(['init', '-q']);
    await runGit(['config', 'user.email', 'source-fingerprint@example.invalid']);
    await runGit(['config', 'user.name', 'Source Fingerprint']);
    await runGit(['add', '.']);
    await runGit(['commit', '-qm', 'fixture']);

    const baseline = await strictWorktreeFingerprint(fixture, { excludePaths: ['src/pinned.js'] });
    await writeFile(pinned, 'export const pinned = 2;\n');
    const pinnedOnly = await strictWorktreeFingerprint(fixture, { excludePaths: ['src/pinned.js'] });
    assert.equal(pinnedOnly.digest, baseline.digest,
      'a pinned source mutation is ignored only by the exact exclusion set');

    await writeFile(style, ':root { --fixture: 2; }\n');
    const styleChanged = await strictWorktreeFingerprint(fixture, { excludePaths: ['src/pinned.js'] });
    assert.notEqual(styleChanged.digest, baseline.digest,
      'an unpinned styles/kit.css mutation remains visible');

    await writeFile(style, ':root { --fixture: 1; }\n');
    await writeFile(path.join(fixture, 'src', 'newRuntime.js'), 'export const newRuntime = true;\n');
    const moduleChanged = await strictWorktreeFingerprint(fixture, { excludePaths: ['src/pinned.js'] });
    assert.notEqual(moduleChanged.digest, baseline.digest,
      'a newly-added runtime module remains visible');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('parser locks the wrapper runtime and rejects acceptance bypass flags', () => {
  assert.throws(
    () => parseReleaseSoakArgs(['--runtime=electron'], { runtime: 'browser', root: process.cwd() }),
    /runtime.*locked/i,
  );
  assert.throws(
    () => parseReleaseSoakArgs(['--dry-run'], { runtime: 'browser', root: process.cwd() }),
    /unknown argument|dry-run/i,
  );
  assert.throws(
    () => parseReleaseSoakArgs(['--cycles=0'], { runtime: 'browser', root: process.cwd() }),
    /positive integer/i,
  );
  assert.throws(
    () => parseReleaseSoakArgs(['--immutable-save-cycles=1'], { runtime: 'browser', root: process.cwd() }),
    /at least 2/i,
  );

  const parsed = parseReleaseSoakArgs([
    '--cycles=3',
    '--viewport=1600x900',
    '--output-root=.devshots/spec2/custom-soak',
    '--task-id=browser-contract',
  ], { runtime: 'browser', root: process.cwd() });
  assert.equal(parsed.runtime, 'browser');
  assert.equal(parsed.cycles, 3);
  assert.deepEqual(parsed.viewport, { width: 1600, height: 900 });
  assert.equal(parsed.taskId, 'browser-contract');
  assert.equal(parsed.immutableSaveCycles, 0);
  assert.equal(parsed.postContextObserveMs, 10_000, 'default keeps the prior 5s warmup + 5s sample');
  assert.equal(parsed.outputRoot, path.resolve(process.cwd(), '.devshots/spec2/custom-soak'));

  const observed = parseReleaseSoakArgs(['--post-context-observe-ms=120000'], {
    runtime: 'electron',
    root: process.cwd(),
  });
  assert.equal(observed.postContextObserveMs, 120_000);
  assert.deepEqual(resolvePostContextObservationWindow(observed.postContextObserveMs), {
    warmupMs: 5_000,
    sampleMs: 115_000,
  }, 'the full requested window reaches the existing recovered-flight sampler');
  assert.throws(
    () => parseReleaseSoakArgs(['--post-context-observe-ms=9999'], { runtime: 'electron', root: process.cwd() }),
    /post-context-observe-ms must be >= 10000/,
  );
  assert.throws(
    () => parseReleaseSoakArgs(['--post-context-observe-ms=21600001'], { runtime: 'electron', root: process.cwd() }),
    /must be <= 21600000/,
  );

  const immutable = parseReleaseSoakArgs(['--immutable-save-cycles=2'], {
    runtime: 'browser',
    root: process.cwd(),
  });
  assert.equal(immutable.immutableSaveCycles, 2);
});

test('post-context observation duration keeps existing default and enforces sampling bounds', () => {
  assert.deepEqual(resolvePostContextObservationWindow(), { warmupMs: 5_000, sampleMs: 5_000 });
  assert.deepEqual(resolvePostContextObservationWindow(120_000), { warmupMs: 5_000, sampleMs: 115_000 });
  assert.throws(() => resolvePostContextObservationWindow(9_999), /postContextObserveMs must be an integer/);
  assert.throws(() => resolvePostContextObservationWindow(21_600_001), /postContextObserveMs must be an integer/);
});

test('parser validates a fenced source overlay and returns compact identity metadata', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-source-overlay-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.devshots'), { recursive: true });
  const body = Buffer.from('frozen-index', 'utf8');
  const entry = {
    path: 'index.html',
    bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'),
    contentBase64: body.toString('base64'),
  };
  const manifest = {
    schema: 'spaceface.sourceBaseline.v1',
    sourceCommit: 'a'.repeat(40),
    sourceOverlayDigest: createHash('sha256')
      .update(`${entry.path}\0${entry.sha256}\0${entry.bytes}`, 'utf8')
      .digest('hex'),
    files: [entry],
  };
  const manifestPath = path.join(root, '.devshots', 'baseline.json');
  await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

  const parsed = parseReleaseSoakArgs(['--baseline-source=.devshots/baseline.json'], {
    runtime: 'electron',
    root,
  });
  assert.equal(parsed.baselineSource.relative, '.devshots/baseline.json');
  assert.deepEqual(parsed.baselineSource.identity, {
    schema: 'spaceface.sourceBaseline.v1',
    sourceCommit: 'a'.repeat(40),
    sourceOverlayDigest: manifest.sourceOverlayDigest,
    fileCount: 1,
    totalBytes: body.length,
  });
  assert.throws(
    () => parseReleaseSoakArgs(['--baseline-source=outside.json'], { runtime: 'electron', root }),
    /under \.devshots/i,
  );
});

test('publication validator revalidates artifact hashes and returns a content-hashed evidence receipt', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = parseReleaseSoakArgs(['--cycles=1', '--task-id=browser-contract'], {
    runtime: 'browser',
    root,
  });
  const probeResult = await writeValidProbeResult({ root, ...options });
  const result = await validateReleaseSoakPublication({
    runtime: 'browser', root, outputRoot: options.outputRoot, result: probeResult,
  });

  assert.equal(result.pass, true, result.failures.join('; '));
  assert.match(result.receipt.evidencePath, /evidence\.json$/);
  assert.match(result.receipt.evidenceSha256, /^[a-f0-9]{64}$/);
  const receiptBytes = await readFile(result.receipt.evidencePath);
  assert.equal(result.receipt.evidenceSha256, sha256(receiptBytes));
  assert.equal(result.receipt.artifacts.length, 1);
  assert.match(result.receipt.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.receipt.producerEntrypoint, 'scripts/check-release-soak-browser.mjs');
  assert.match(result.receipt.producerEntrypointSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.receipt.worktreeId, probeResult.evidence.worktreeId);
  assert.equal(result.receipt.worktreeDigest, probeResult.evidence.worktreeDigest);
  assert.deepEqual(result.receipt.producerValidation, { pass: true, failures: [] });
  const persisted = JSON.parse(await readFile(path.join(probeResult.outputDir, 'receipt.json'), 'utf8'));
  assert.deepEqual(persisted, result.receipt);
});

test('publication validator fails closed when evidence runtime does not match the locked wrapper', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-cli-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = parseReleaseSoakArgs(['--cycles=1'], { runtime: 'electron', root });
  const probeResult = await writeValidProbeResult({ root, ...options, runtime: 'browser' });
  await writeApprovedEntrypoint(root, 'electron');
  const result = await validateReleaseSoakPublication({
    runtime: 'electron', root, outputRoot: options.outputRoot, result: probeResult,
  });

  assert.equal(result.pass, false);
  assert.equal(result.receipt, null);
  assert.ok(result.failures.some((failure) => /runtime.*electron/i.test(failure)), result.failures.join('; '));
});

test('publication validator fails closed when a claimed artifact hash does not match disk', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-cli-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = parseReleaseSoakArgs(['--cycles=1'], { runtime: 'browser', root });
  const probeResult = await writeValidProbeResult({ root, ...options });
  await writeFile(path.join(root, probeResult.evidence.artifacts[0].path), 'tampered-after-probe\n', 'utf8');
  const result = await validateReleaseSoakPublication({
    runtime: 'browser', root, outputRoot: options.outputRoot, result: probeResult,
  });

  assert.equal(result.pass, false);
  assert.equal(result.receipt, null);
  assert.ok(result.failures.some((failure) => /artifact hash mismatch/i.test(failure)), result.failures.join('; '));
});

test('publication validator rejects junction ancestry before reading or writing receipts', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-cli-junction-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-cli-outside-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await mkdir(path.join(root, '.devshots'), { recursive: true });
  await symlink(outside, path.join(root, '.devshots', 'spec2'), process.platform === 'win32' ? 'junction' : 'dir');
  const options = parseReleaseSoakArgs(['--cycles=1'], { runtime: 'browser', root });
  const probeResult = await writeValidProbeResult({ root, ...options });
  const result = await validateReleaseSoakPublication({
    runtime: 'browser', root, outputRoot: options.outputRoot, result: probeResult,
  });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(' '), /symlink|junction|reparse|unsafe ancestry/i);
  assert.equal(existsSync(path.join(outside, 'release-soak-browser', 'receipt.json')), false);
});

test('exported runner cannot be dependency-injected into producing acceptance', async () => {
  let fakeCalls = 0;
  const injectedProbe = async () => {
    fakeCalls += 1;
    return { pass: true };
  };
  const result = await runReleaseSoakCli({
    runtime: 'browser',
    root: process.cwd(),
    argv: ['--runtime=electron'],
    log: () => {},
  }, { runProbe: injectedProbe });

  assert.equal(fakeCalls, 0, 'arbitrary second-argument dependencies must be ignored');
  assert.equal(result.pass, false);
  assert.equal(result.exitCode, 1);
  assert.equal(result.receipt, null);
  const source = await readFile(new URL('../scripts/lib/releaseSoakCli.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /testOnlyDependencies|dependencies\.runProbe|runProbe\s*=\s*test/i);
});

test('browser and Electron entrypoints are runtime-locked thin wrappers with no bypass mode', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  for (const [file, runtime] of [
    ['scripts/check-release-soak-browser.mjs', 'browser'],
    ['scripts/check-release-soak-electron.mjs', 'electron'],
  ]) {
    const source = await readFile(path.join(root, file), 'utf8');
    assert.match(source, new RegExp(`runtime:\\s*['\"]${runtime}['\"]`));
    assert.match(source, /runReleaseSoakCli/);
    assert.doesNotMatch(source, /dry[-_]?run|synthetic|primaryAcceptance\s*:\s*false/i);
  }
});

function makePerformanceEvidence(externalStamps = []) {
  const flight = Array.from({ length: 150 }, () => ({ frameMs: 16, phaseTag: 'flight_steady' }));
  const recovery = Array.from({ length: 150 }, () => ({ frameMs: 16, phaseTag: 'context_recover_steady' }));
  for (const stamp of externalStamps) flight.push({ frameMs: 40, phaseTag: 'flight_steady', ...stamp });
  const samples = [...flight, ...recovery];
  return {
    samples,
    frameMs: summarizeSamples(samples),
    phases: {
      flight_steady: summarizeSamples(flight),
      context_recover_steady: summarizeSamples(recovery),
    },
  };
}

test('performance floor exempts only classifier-stamped externalScheduling gaps', () => {
  const perf = makePerformanceEvidence([
    { hitchOwner: 'externalScheduling' },
    { hitchOwner: 'externalScheduling' },
    { hitchOwner: 'externalScheduling' },
  ]);
  const result = validatePerformanceEvidence(perf);
  assert.equal(result.pass, true, result.failures.join('; '));
  // The exemption shows up in the returned floor series, not in raw integrity.
  assert.equal(result.computed.hitchesOver32Ms, 3);
  assert.equal(result.floor.hitchesOver32Ms, 0);
});

test('performance floor counts game-owned and unstamped over-threshold samples', () => {
  for (const owner of ['presentation', 'sim', 'unknown']) {
    const perf = makePerformanceEvidence([{ hitchOwner: owner }]);
    const result = validatePerformanceEvidence(perf);
    assert.equal(result.pass, false, `hitchOwner ${owner} must stay counted`);
    assert.ok(result.failures.some((f) => /game-owned hitches/.test(f)), result.failures.join('; '));
  }
  // No stamp at all — attribution off or verdict lost — stays counted.
  const unstamped = validatePerformanceEvidence(makePerformanceEvidence([{}]));
  assert.equal(unstamped.pass, false, 'an unstamped over-threshold sample must stay counted');
});

test('a claimed phase summary that launders exempted gaps fails raw integrity', () => {
  const perf = makePerformanceEvidence([{ hitchOwner: 'externalScheduling' }]);
  // Claim the raw series had zero hitches — raw recomputation must catch it.
  perf.phases.flight_steady = { ...perf.phases.flight_steady, hitchesOver32Ms: 0 };
  const result = validatePerformanceEvidence(perf);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => /does not match raw samples/.test(f)), result.failures.join('; '));
});

async function writeValidProbeResult(options) {
  await writeApprovedEntrypoint(options.root, options.runtime);
  const outputDir = path.join(options.outputRoot, options.taskId);
  const artifactPath = path.relative(options.root, path.join(outputDir, 'route.png')).replaceAll('\\', '/');
  await mkdir(outputDir, { recursive: true });
  const artifactBytes = Buffer.from('browser screenshot evidence fixture\n');
  await writeFile(path.join(options.root, artifactPath), artifactBytes);
  const evidence = makeValidEvidence({
    runtime: options.runtime,
    taskId: options.taskId,
    artifact: {
      kind: 'screenshot',
      path: artifactPath,
      bytes: artifactBytes.length,
      sha256: sha256(artifactBytes),
    },
  });
  const evidencePath = path.join(outputDir, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { pass: true, outputDir, evidence };
}

async function writeApprovedEntrypoint(root, runtime) {
  const relative = path.join('scripts', `check-release-soak-${runtime}.mjs`);
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, await readFile(path.join(REPO_ROOT, relative)));
}

function makeValidEvidence({ runtime, taskId, artifact }) {
  const flight = Array.from({ length: 150 }, () => ({ frameMs: 16, phaseTag: 'flight_steady' }));
  const recovery = Array.from({ length: 150 }, () => ({ frameMs: 16, phaseTag: 'context_recover_steady' }));
  const samples = [...flight, ...recovery];
  const settings = {
    video: { renderScale: 1, pixelRatioCap: 2, shadows: true, bloom: true, particleQuality: 'high' },
  };
  const digest = 'a'.repeat(64);
  const id = `0123456789ab-${digest.slice(0, 16)}`;
  const cleanup = runtime === 'electron'
    ? {
        pageClosed: true,
        reportPass: true,
        portsReleased: true,
        serverReleased: true,
        processExited: true,
        browserDisconnected: true,
        ownedReport: {
          pass: true,
          gracefulProcessCloseConfirmed: true,
          forceClose: { attempted: false },
          precloseUrlCheck: { pass: true },
          urlTracker: { pass: true },
          processHealth: { pass: true },
          listenerReleased: true,
        },
      }
    : {
        pageClosed: true,
        reportPass: true,
        portsReleased: true,
        serverReleased: true,
        browserClosed: true,
        ownedReport: { pass: true },
      };
  const errors = Object.fromEntries(
    ['pageErrors', 'requestFailures', 'glErrors', 'consoleErrors', 'httpErrors', 'warnings'].map((key) => [key, []]),
  );
  const memory = {
    retainedAfterGc: true,
    comparableState: 'docked-market',
    startSnapshot: { docked: true },
    endSnapshot: { docked: true },
    heapBytesStart: 10_000,
    heapBytesEnd: 10_000,
    heapGrowthBytes: 0,
    withinBudget: true,
    geometries: { start: 10, end: 10, delta: 0 },
    textures: { start: 10, end: 10, delta: 0 },
    programs: { start: 10, end: 10, delta: 0 },
  };
  return {
    schema: RELEASE_SOAK_SCHEMA,
    taskId,
    generatedAt: new Date().toISOString(),
    worktreeId: id,
    worktreeDigest: digest,
    runtimeKind: runtime,
    mode: runtime,
    primaryAcceptance: true,
    inputSource: 'keyboard-mouse',
    injectedState: false,
    checks: [{ name: 'fixture route', status: 'pass' }],
    cycles: {
      count: 1,
      results: [{ index: 0, pass: true, marks: [...REQUIRED_PRIMARY_CYCLE_MARKS], sampleCount: 1 }],
    },
    artifacts: [artifact],
    quality: {
      settingsOverridesApplied: false,
      authoredAssetFallback: false,
      authoredReady: true,
      physicsSimplification: false,
      startSettings: settings,
      endSettings: structuredClone(settings),
      settingsPass: true,
    },
    performance: {
      samples,
      frameMs: summarizeSamples(samples),
      phases: {
        flight_steady: summarizeSamples(flight),
        context_recover_steady: summarizeSamples(recovery),
      },
    },
    memory,
    errors,
    contextLoss: {
      available: true,
      lostEvent: true,
      restoredEvent: true,
      meshRebuilt: true,
      meshRetained: false,
      meshResourceReady: true,
      pixelProof: true,
      frameAdvanced: true,
      recovered: true,
      before: false,
      after: false,
    },
    cleanup,
    fingerprints: {
      start: { id, digest },
      end: { id, digest },
    },
    validation: { pass: true, failures: [] },
  };
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}
