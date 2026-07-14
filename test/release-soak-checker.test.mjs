import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  REQUIRED_PRIMARY_CYCLE_MARKS,
  strictWorktreeFingerprint,
  summarizeSamples,
} from '../scripts/lib/releaseSoakContracts.mjs';

const CHECKER_URL = new URL('../scripts/lib/releaseSoakEvidenceChecker.mjs', import.meta.url);

test('headed release-soak checker contract exists', () => {
  assert.equal(existsSync(CHECKER_URL), true);
});

test('checker exports the read-only evidence gate API', async () => {
  const checker = await import(CHECKER_URL);
  assert.equal(typeof checker.checkHeadedReleaseSoakEvidence, 'function');
  assert.equal(typeof checker.classifyReleaseSoakEvidence, 'function');
  assert.equal(typeof checker.statusToExitCode, 'function');
});

test('missing headed public-route evidence reports pending', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-check-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { checkHeadedReleaseSoakEvidence, statusToExitCode } = await import(CHECKER_URL);
  const result = await checkHeadedReleaseSoakEvidence({
    root,
    runtimes: ['browser'],
  });
  assert.equal(result.status, 'pending');
  assert.equal(result.pass, false);
  assert.equal(statusToExitCode(result.status), 2);
  assert.match(result.failures.join(' '), /headed.*browser.*absent/i);
});

test('missing evidence reports pending without requiring a Git worktree fingerprint', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-check-no-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { checkHeadedReleaseSoakEvidence } = await import(CHECKER_URL);
  const result = await checkHeadedReleaseSoakEvidence({ root, runtimes: ['electron'] });
  assert.equal(result.status, 'pending');
  assert.equal(result.currentWorktreeId, null);
});

test('headed checker CLI arguments are closed to runtime selection and JSON output', async () => {
  const { parseHeadedReleaseSoakArgs } = await import(CHECKER_URL);
  assert.deepEqual(parseHeadedReleaseSoakArgs([]), { runtimes: ['browser', 'electron'], json: false });
  assert.deepEqual(parseHeadedReleaseSoakArgs(['--runtime', 'browser', '--json']), { runtimes: ['browser'], json: true });
  assert.deepEqual(parseHeadedReleaseSoakArgs(['--runtime=electron']), { runtimes: ['electron'], json: false });
  assert.throws(() => parseHeadedReleaseSoakArgs(['--evidence', 'fixture.json']), /unknown argument/i);
  assert.throws(() => parseHeadedReleaseSoakArgs(['--injected-state=false']), /unknown argument/i);
});

test('top-level release-soak checker defaults to read-only headed evidence validation', async () => {
  const source = await readFile(new URL('../scripts/check-release-soak.mjs', import.meta.url), 'utf8');
  assert.match(source, /checkHeadedReleaseSoakEvidence/);
  assert.match(source, /statusToExitCode/);
  assert.doesNotMatch(source, /check-release-soak-electron|releaseSoakProbe|runReleaseSoakCli/);
  assert.doesNotMatch(source, /^import[\s\S]*?from ['"]\.\/lib\/releaseSoak(?:Session|Receipts)\.mjs['"]/m);
  assert.match(source, /await import\(['"]\.\/lib\/releaseSoakSession\.mjs['"]\)/);
});

test('fabricated or injected evidence is rejected, not downgraded to pending', async () => {
  const { classifyReleaseSoakEvidence, statusToExitCode } = await import(CHECKER_URL);
  const evidence = baseEvidence({ injectedState: true });
  const result = classifyReleaseSoakEvidence({
    evidence,
    evidencePath: '.devshots/spec2/release-soak-browser-fixture/evidence.json',
    expectedRuntime: 'browser',
    currentFingerprint: fingerprint('current'),
    contractValidation: { pass: true, failures: [] },
    artifactValidation: { pass: true, failures: [], verified: [{}] },
    producerReceiptValidation: { pass: true, failures: [] },
    producerEntrypointValidation: { pass: true, failures: [] },
  });
  assert.equal(result.status, 'fail');
  assert.equal(statusToExitCode(result.status), 1);
  assert.match(result.failures.join(' '), /injectedState=false/i);
});

test('valid but stale headed evidence fails when an evidence candidate exists', async () => {
  const { classifyReleaseSoakEvidence, statusToExitCode } = await import(CHECKER_URL);
  const evidence = baseEvidence();
  const result = classifyReleaseSoakEvidence({
    evidence,
    evidencePath: '.devshots/spec2/release-soak-browser-old/evidence.json',
    expectedRuntime: 'browser',
    currentFingerprint: fingerprint('current'),
    contractValidation: { pass: true, failures: [] },
    artifactValidation: { pass: true, failures: [], verified: [{}] },
    producerReceiptValidation: { pass: true, failures: [] },
    producerEntrypointValidation: { pass: true, failures: [] },
  });
  assert.equal(result.status, 'fail');
  assert.equal(statusToExitCode(result.status), 1);
  assert.match(result.failures.join(' '), /worktree.*current/i);
});

test('worktree mutation between validation fingerprints fails even when evidence matches the first fingerprint', async () => {
  const { classifyReleaseSoakEvidence } = await import(CHECKER_URL);
  const before = fingerprint('captured');
  const after = fingerprint('current');
  const result = classifyReleaseSoakEvidence({
    evidence: baseEvidence(),
    evidencePath: '.devshots/spec2/release-soak-browser-current/evidence.json',
    expectedRuntime: 'browser',
    currentFingerprint: before,
    currentFingerprintBefore: before,
    currentFingerprintAfter: after,
    contractValidation: { pass: true, failures: [] },
    artifactValidation: { pass: true, failures: [], verified: [{}] },
    producerReceiptValidation: { pass: true, failures: [] },
    producerEntrypointValidation: { pass: true, failures: [] },
  });
  assert.equal(result.status, 'fail');
  assert.match(result.failures.join(' '), /worktree.*changed.*validation/i);
});

test('structurally valid evidence without a persisted producer receipt fails', async () => {
  const { classifyReleaseSoakEvidence } = await import(CHECKER_URL);
  const current = fingerprint('captured');
  const result = classifyReleaseSoakEvidence({
    evidence: baseEvidence(),
    evidencePath: '.devshots/spec2/release-soak-browser-current/evidence.json',
    expectedRuntime: 'browser',
    currentFingerprint: current,
    contractValidation: { pass: true, failures: [] },
    artifactValidation: { pass: true, failures: [], verified: [{}] },
    producerReceiptValidation: { pass: false, failures: ['persisted producer receipt is missing'] },
    producerEntrypointValidation: { pass: true, failures: [] },
  });
  assert.equal(result.status, 'fail');
  assert.match(result.failures.join(' '), /producer receipt.*missing/i);
});

test('wrong-entrypoint and cross-runtime producer receipts fail closed', async () => {
  const { classifyReleaseSoakEvidence } = await import(CHECKER_URL);
  const current = fingerprint('captured');
  for (const [producerReceiptValidation, producerEntrypointValidation, pattern] of [
    [{ pass: false, failures: ['producer receipt runtime electron does not match browser'] }, { pass: true, failures: [] }, /runtime.*electron.*browser/i],
    [{ pass: true, failures: [] }, { pass: false, failures: ['approved browser producer entrypoint identity mismatch'] }, /entrypoint.*identity/i],
  ]) {
    const result = classifyReleaseSoakEvidence({
      evidence: baseEvidence(),
      evidencePath: '.devshots/spec2/release-soak-browser-current/evidence.json',
      expectedRuntime: 'browser',
      currentFingerprint: current,
      contractValidation: { pass: true, failures: [] },
      artifactValidation: { pass: true, failures: [], verified: [{}] },
      producerReceiptValidation,
      producerEntrypointValidation,
    });
    assert.equal(result.status, 'fail');
    assert.match(result.failures.join(' '), pattern);
  }
});

test('producer receipt validator binds evidence bytes, SHA-256, artifacts, runtime, and output directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-producer-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, '.devshots', 'spec2', 'release-soak-browser-current');
  const evidencePath = path.join(outputDir, 'evidence.json');
  const evidenceContents = Buffer.from(`${JSON.stringify(baseEvidence())}\n`);
  const artifact = { kind: 'screenshot', path: '.devshots/spec2/route.png', bytes: 7, sha256: 'd'.repeat(64) };
  const approvedEntrypoint = {
    entrypoint: 'scripts/check-release-soak-browser.mjs',
    sha256: 'e'.repeat(64),
  };
  const receipt = producerReceipt({ root, outputDir, evidencePath, evidenceContents, artifacts: [artifact], approvedEntrypoint });
  const { validateProducerReceipt } = await import(CHECKER_URL);
  assert.equal(validateProducerReceipt({
    root, expectedRuntime: 'browser', evidencePath, evidenceContents, receipt,
    verifiedArtifacts: [artifact], approvedEntrypoint,
  }).pass, true);

  for (const [mutation, pattern] of [
    [{ runtime: 'electron' }, /runtime/i],
    [{ evidenceSha256: '0'.repeat(64) }, /sha-256/i],
    [{ evidenceBytes: evidenceContents.length + 1 }, /byte/i],
    [{ evidencePath: path.join(root, 'other.json') }, /evidence path/i],
    [{ outputDir: path.join(root, 'other') }, /output directory/i],
    [{ artifacts: [{ ...artifact, sha256: '0'.repeat(64) }] }, /artifact bindings/i],
    [{ producerEntrypoint: undefined }, /producer entrypoint identity/i],
    [{ producerEntrypoint: 'scripts/check-release-soak-electron.mjs' }, /producer entrypoint identity/i],
    [{ producerEntrypointSha256: '0'.repeat(64) }, /producer entrypoint sha-256/i],
    [{ worktreeId: undefined }, /worktree identity/i],
    [{ producerValidation: { pass: false, failures: ['forged'] } }, /producer validation/i],
  ]) {
    const result = validateProducerReceipt({
      root,
      expectedRuntime: 'browser',
      evidencePath,
      evidenceContents,
      receipt: { ...receipt, ...mutation },
      verifiedArtifacts: [artifact],
      approvedEntrypoint,
    });
    assert.equal(result.pass, false);
    assert.match(result.failures.join(' '), pattern);
  }
});

test('approved producer entrypoints remain runtime-locked thin wrappers', async () => {
  const { validateApprovedProducerEntrypoint } = await import(CHECKER_URL);
  const root = path.resolve(import.meta.dirname, '..');
  for (const runtime of ['browser', 'electron']) {
    const result = await validateApprovedProducerEntrypoint({ root, runtime });
    assert.equal(result.pass, true, result.failures.join('; '));
    assert.match(result.entrypoint, new RegExp(`check-release-soak-${runtime}\\.mjs$`));
  }
});

test('atomic producer receipt recovers a partial temp, is idempotent, and never overwrites a different final', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-atomic-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, '.devshots', 'spec2', 'release-soak-browser-atomic');
  await mkdir(outputDir, { recursive: true });
  const desired = { runtime: 'browser', evidenceSha256: 'a'.repeat(64) };
  await writeFile(path.join(outputDir, 'receipt.json.tmp'), '{"partial":', 'utf8');
  const { publishProducerReceiptAtomically } = await import('../scripts/lib/releaseSoakCli.mjs');
  await publishProducerReceiptAtomically({ root, outputDir, receipt: desired });
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'receipt.json'), 'utf8')), desired);
  assert.equal(existsSync(path.join(outputDir, 'receipt.json.tmp')), false);
  await publishProducerReceiptAtomically({ root, outputDir, receipt: desired });
  await assert.rejects(
    publishProducerReceiptAtomically({ root, outputDir, receipt: { ...desired, runtime: 'electron' } }),
    /already exists.*different/i,
  );
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'receipt.json'), 'utf8')), desired);
  assert.equal(existsSync(path.join(outputDir, 'receipt.json.tmp')), false);
});

test('atomic producer receipt recovers a zero-byte exclusive temp left by a crash', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-zero-temp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, '.devshots', 'spec2', 'release-soak-browser-zero-temp');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'receipt.json.tmp'), Buffer.alloc(0));
  const desired = { runtime: 'browser', evidenceSha256: 'b'.repeat(64) };
  const { publishProducerReceiptAtomically } = await import('../scripts/lib/releaseSoakCli.mjs');
  await publishProducerReceiptAtomically({ root, outputDir, receipt: desired });
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'receipt.json'), 'utf8')), desired);
  assert.equal(existsSync(path.join(outputDir, 'receipt.json.tmp')), false);
});

test('integrated temp Git evidence succeeds, then forged producer identity fails', async (t) => {
  const fixture = await makeIntegratedGitFixture(t);
  const { checkHeadedReleaseSoakEvidence } = await import(CHECKER_URL);
  const accepted = await checkHeadedReleaseSoakEvidence({ root: fixture.root, runtimes: ['browser'] });
  assert.equal(accepted.status, 'pass', accepted.failures.join('; '));
  assert.equal(accepted.worktreeBefore.digest, accepted.worktreeAfter.digest);
  const receipt = JSON.parse(await readFile(fixture.receiptPath, 'utf8'));
  receipt.producerEntrypoint = 'scripts/check-release-soak-electron.mjs';
  await writeFile(fixture.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  const rejected = await checkHeadedReleaseSoakEvidence({ root: fixture.root, runtimes: ['browser'] });
  assert.equal(rejected.status, 'fail');
  assert.match(rejected.failures.join(' '), /producer entrypoint identity/i);
});

test('integrated checker rejects ignored evidence, artifact, and receipt mutations after initial validation', async (t) => {
  const fixture = await makeIntegratedGitFixture(t);
  const artifactPath = path.join(fixture.root, ...fixture.evidence.artifacts[0].path.split('/'));
  const evidenceBytes = await readFile(fixture.evidencePath);
  const receiptBytes = await readFile(fixture.receiptPath);
  const { checkHeadedReleaseSoakEvidence } = await import(CHECKER_URL);
  const result = await checkHeadedReleaseSoakEvidence({
    root: fixture.root,
    runtimes: ['browser'],
    onInitialValidationComplete: async () => {
      await Promise.all([
        writeFile(fixture.evidencePath, Buffer.concat([evidenceBytes, Buffer.from(' ')])),
        writeFile(artifactPath, 'mutated headed artifact\n', 'utf8'),
        writeFile(fixture.receiptPath, Buffer.concat([receiptBytes, Buffer.from(' ')])),
      ]);
    },
  });
  assert.equal(result.status, 'fail');
  assert.match(result.failures.join(' '), /changed after initial validation|final evidence binding/i);
});

test('checker rejects junction ancestry instead of following headed evidence outside root', async (t) => {
  const fixture = await makeIntegratedGitFixture(t, { publish: false });
  const outside = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-junction-target-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const candidate = path.join(fixture.root, '.devshots', 'spec2', 'release-soak-browser-junction');
  await mkdir(path.dirname(candidate), { recursive: true });
  await symlink(outside, candidate, process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(path.join(outside, 'evidence.json'), `${JSON.stringify(baseEvidence())}\n`, 'utf8');
  const { checkHeadedReleaseSoakEvidence } = await import(CHECKER_URL);
  const result = await checkHeadedReleaseSoakEvidence({ root: fixture.root, runtimes: ['browser'] });
  assert.equal(result.status, 'fail');
  assert.match(result.failures.join(' '), /symlink|junction|reparse|unsafe ancestry/i);
});

test('only contract-valid, artifact-valid, current headed evidence passes', async () => {
  const { classifyReleaseSoakEvidence, statusToExitCode } = await import(CHECKER_URL);
  const current = fingerprint('captured');
  const evidence = baseEvidence({
    worktreeId: current.id,
    worktreeDigest: current.digest,
    fingerprints: { start: current, end: current },
  });
  const result = classifyReleaseSoakEvidence({
    evidence,
    evidencePath: '.devshots/spec2/release-soak-browser-current/evidence.json',
    expectedRuntime: 'browser',
    currentFingerprint: current,
    contractValidation: { pass: true, failures: [] },
    artifactValidation: { pass: true, failures: [], verified: [{ kind: 'screenshot' }] },
    producerReceiptValidation: { pass: true, failures: [] },
    producerEntrypointValidation: { pass: true, failures: [] },
  });
  assert.equal(result.status, 'pass');
  assert.equal(result.pass, true);
  assert.equal(statusToExitCode(result.status), 0);
});

test('discovery ignores evidence outside the headed release-soak directory grammar', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-check-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const validDir = path.join(root, '.devshots', 'spec2', 'release-soak-browser-2026-01-01');
  const fakeDir = path.join(root, '.devshots', 'spec2', 'browser-contract-fixture');
  await mkdir(validDir, { recursive: true });
  await mkdir(fakeDir, { recursive: true });
  await writeFile(path.join(validDir, 'evidence.json'), JSON.stringify(baseEvidence()), 'utf8');
  await writeFile(path.join(fakeDir, 'evidence.json'), JSON.stringify(baseEvidence()), 'utf8');
  const { discoverHeadedReleaseSoakEvidence } = await import(CHECKER_URL);
  const found = await discoverHeadedReleaseSoakEvidence({ root, runtime: 'browser' });
  assert.equal(found.length, 1);
  assert.match(found[0], /release-soak-browser-2026-01-01[\\/]evidence\.json$/);
});

function fingerprint(label) {
  const digest = label === 'captured' ? 'b'.repeat(64) : 'a'.repeat(64);
  return { id: `0123456789ab-${digest.slice(0, 16)}`, digest, head: '0'.repeat(40), branch: 'master' };
}

function baseEvidence(overrides = {}) {
  const captured = fingerprint('captured');
  return {
    schema: 'spaceface.releaseSoak.v1',
    taskId: 'release-soak-browser',
    generatedAt: '2026-01-01T00:00:00.000Z',
    worktreeId: captured.id,
    worktreeDigest: captured.digest,
    runtimeKind: 'browser',
    mode: 'browser',
    primaryAcceptance: true,
    inputSource: 'keyboard-mouse',
    injectedState: false,
    checks: [{ name: 'public route', status: 'pass' }],
    artifacts: [{ kind: 'screenshot', path: '.devshots/spec2/route.png', bytes: 1, sha256: 'c'.repeat(64) }],
    validation: { pass: true, failures: [] },
    fingerprints: { start: captured, end: captured },
    ...overrides,
  };
}

function producerReceipt({
  root,
  outputDir,
  evidencePath,
  evidenceContents,
  artifacts,
  approvedEntrypoint,
  worktree = fingerprint('captured'),
}) {
  return {
    runtime: 'browser',
    producerEntrypoint: approvedEntrypoint.entrypoint,
    producerEntrypointSha256: approvedEntrypoint.sha256,
    evidencePath,
    evidenceSha256: sha256(evidenceContents),
    evidenceBytes: evidenceContents.length,
    outputDir,
    artifacts,
    worktreeId: worktree.id,
    worktreeDigest: worktree.digest,
    producerValidation: { pass: true, failures: [] },
  };
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function makeIntegratedGitFixture(t, { publish = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-release-soak-integrated-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  for (const runtime of ['browser', 'electron']) {
    await writeFile(
      path.join(root, 'scripts', `check-release-soak-${runtime}.mjs`),
      await readFile(new URL(`../scripts/check-release-soak-${runtime}.mjs`, import.meta.url)),
    );
  }
  await writeFile(path.join(root, '.gitignore'), '.devshots/\n', 'utf8');
  await writeFile(path.join(root, 'fixture.txt'), 'release soak fixture\n', 'utf8');
  git(root, ['init']);
  git(root, ['config', 'user.email', 'release-soak@example.invalid']);
  git(root, ['config', 'user.name', 'Release Soak Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'fixture']);
  const worktree = await strictWorktreeFingerprint(root);
  const outputDir = path.join(root, '.devshots', 'spec2', 'release-soak-browser-integrated');
  await mkdir(outputDir, { recursive: true });
  const artifactPath = '.devshots/spec2/release-soak-browser-integrated/route.png';
  const artifactBytes = Buffer.from('headed screenshot fixture\n');
  await writeFile(path.join(root, ...artifactPath.split('/')), artifactBytes);
  const artifact = { kind: 'screenshot', path: artifactPath, bytes: artifactBytes.length, sha256: sha256(artifactBytes) };
  const evidence = fullContractEvidence({ worktree, artifact });
  const evidencePath = path.join(outputDir, 'evidence.json');
  const evidenceContents = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(evidencePath, evidenceContents);
  const { validateApprovedProducerEntrypoint } = await import(CHECKER_URL);
  const approvedEntrypoint = await validateApprovedProducerEntrypoint({ root, runtime: 'browser' });
  const receipt = producerReceipt({
    root,
    outputDir,
    evidencePath,
    evidenceContents,
    artifacts: [artifact],
    approvedEntrypoint,
    worktree,
  });
  const receiptPath = path.join(outputDir, 'receipt.json');
  if (publish) await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { root, outputDir, evidencePath, receiptPath, evidence, receipt };
}

function fullContractEvidence({ worktree, artifact }) {
  const flight = Array.from({ length: 150 }, () => ({ frameMs: 16, phaseTag: 'flight_steady' }));
  const recovery = Array.from({ length: 150 }, () => ({ frameMs: 16, phaseTag: 'context_recover_steady' }));
  const samples = [...flight, ...recovery];
  const settings = { video: { renderScale: 1, pixelRatioCap: 2, shadows: true, bloom: true, particleQuality: 'high' } };
  return {
    ...baseEvidence({
      worktreeId: worktree.id,
      worktreeDigest: worktree.digest,
      fingerprints: { start: worktree, end: worktree },
      artifacts: [artifact],
    }),
    cycles: { count: 1, results: [{ index: 0, pass: true, marks: [...REQUIRED_PRIMARY_CYCLE_MARKS], sampleCount: 1 }] },
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
      phases: { flight_steady: summarizeSamples(flight), context_recover_steady: summarizeSamples(recovery) },
    },
    memory: {
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
    },
    errors: Object.fromEntries(['pageErrors', 'requestFailures', 'glErrors', 'consoleErrors', 'httpErrors', 'warnings'].map((key) => [key, []])),
    contextLoss: {
      available: true, lostEvent: true, restoredEvent: true, meshRebuilt: true,
      meshRetained: false, meshResourceReady: true,
      pixelProof: true, frameAdvanced: true, recovered: true, before: false, after: false,
    },
    cleanup: {
      pageClosed: true, reportPass: true, portsReleased: true, serverReleased: true,
      browserClosed: true, ownedReport: { pass: true },
    },
  };
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore', windowsHide: true });
}
