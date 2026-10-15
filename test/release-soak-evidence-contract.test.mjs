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
  validateReleaseSoakEvidence,
  validatePerformanceEvidence,
} from '../scripts/lib/releaseSoakContracts.mjs';
import {
  evaluateSourceStability,
  summarizeImmutableSavePopulation,
  summarizeRestorePopulation,
  summarizeSaveEnvelope,
} from '../scripts/lib/releaseSoakProbe.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);

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

test('immutable save diagnostic binds repeated materialization to one serialized envelope', () => {
  const raw = JSON.stringify({
    fmt: 'spaceface-save',
    version: 15,
    data: {
      meta: { tick: 42, simTime: 0.7, savedAt: '2026-10-15T00:00:00.000Z' },
      entities: {
        player: { id: 'player-1', type: 'ship' },
        persistent: [{ id: 'wreck-1', type: 'wreck', data: { worldRecordId: 'wreck:1' } }],
      },
    },
  });
  const base = summarizeSaveEnvelope(raw, { slot: 'quick' });
  assert.equal(base.available, true);
  assert.equal(base.serializedIdentity.bytes, Buffer.byteLength(raw));
  assert.equal(base.envelopeIdentity.tick, 42);
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
  };
  const stableOverlay = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredWorktreeStable: true,
    uncoveredHeadStable: true,
  });
  assert.equal(stableOverlay.mode, 'served-overlay');
  assert.equal(stableOverlay.pass, true, 'live worktree churn cannot invalidate a full pinned served graph');

  const changedOverlay = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity, sourceOverlayDigest: 'c'.repeat(64) },
    worktreeStable: true,
    uncoveredWorktreeStable: true,
    uncoveredHeadStable: true,
  });
  assert.equal(changedOverlay.pass, false, 'a served-byte identity change remains fatal');

  const partialOverlay = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'performance-paths', fullRuntime: false },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
  });
  assert.equal(partialOverlay.pass, false, 'partial overlays still reject live worktree drift');

  const unpinnedStyleChange = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredWorktreeStable: false,
    uncoveredHeadStable: true,
  });
  assert.equal(unpinnedStyleChange.pass, false,
    'a live styles/kit.css mutation outside the pinned source graph remains fatal');

  const unpinnedModuleChange = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredWorktreeStable: false,
    uncoveredHeadStable: true,
  });
  assert.equal(unpinnedModuleChange.pass, false,
    'a newly-added runtime module outside the pinned manifest remains fatal');

  const headDrift = evaluateSourceStability({
    baselineSource: { identity },
    coverage: { captureScope: 'all-runtime', fullRuntime: true, pinnedPathCount: 2220 },
    servedAtStart: { ...identity },
    servedAtEnd: { ...identity },
    worktreeStable: false,
    uncoveredWorktreeStable: true,
    uncoveredHeadStable: false,
  });
  assert.equal(headDrift.pass, false, 'a HEAD change remains fatal even when served bytes match');
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
  };
  evidence.sourceOverlay = {
    manifest: '.devshots/source-baselines/current.json',
    requested: identity,
    served: { ...identity },
    servedAtEnd: { ...identity },
    coverage: { captureScope: 'all-runtime', fullRuntime: true, pinnedPathCount: 2220 },
  };
  evidence.sourceStability = {
    mode: 'served-overlay',
    overlayCoversRuntime: true,
    worktreeStable: false,
    servedSourceStable: true,
    uncoveredWorktreeStable: true,
    uncoveredHeadStable: true,
    pass: true,
  };
  evidence.fingerprints.end = { ...evidence.fingerprints.end, digest: 'd'.repeat(64), id: `0123456789ab-${'d'.repeat(16)}` };
  const result = validateReleaseSoakEvidence(evidence);
  assert.equal(result.pass, true, result.failures.join('; '));

  const partial = structuredClone(evidence);
  partial.sourceOverlay.coverage = { captureScope: 'performance-paths', fullRuntime: false };
  const partialResult = validateReleaseSoakEvidence(partial);
  assert.equal(partialResult.pass, false);
  assert(partialResult.failures.some((failure) => /worktree fingerprint changed/i.test(failure)));
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
  assert.equal(parsed.outputRoot, path.resolve(process.cwd(), '.devshots/spec2/custom-soak'));

  const immutable = parseReleaseSoakArgs(['--immutable-save-cycles=2'], {
    runtime: 'browser',
    root: process.cwd(),
  });
  assert.equal(immutable.immutableSaveCycles, 2);
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
