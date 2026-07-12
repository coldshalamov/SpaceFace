import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseReleaseSoakArgs,
  runReleaseSoakCli,
  validateReleaseSoakPublication,
} from '../scripts/lib/releaseSoakCli.mjs';
import {
  RELEASE_SOAK_SCHEMA,
  REQUIRED_PRIMARY_CYCLE_MARKS,
  summarizeSamples,
} from '../scripts/lib/releaseSoakContracts.mjs';

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
  assert.equal(parsed.outputRoot, path.resolve(process.cwd(), '.devshots/spec2/custom-soak'));
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
});

test('publication validator fails closed when evidence runtime does not match the locked wrapper', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-cli-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = parseReleaseSoakArgs(['--cycles=1'], { runtime: 'electron', root });
  const probeResult = await writeValidProbeResult({ root, ...options, runtime: 'browser' });
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

async function writeValidProbeResult(options) {
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
