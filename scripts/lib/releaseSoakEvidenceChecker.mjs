// Read-only acceptance gate for already-captured headed release-soak evidence.
// This module never launches or terminates a browser/Electron process.

import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  strictWorktreeFingerprint,
  validateArtifactFiles,
  validateReleaseSoakEvidence,
} from './releaseSoakContracts.mjs';

const SUPPORTED_RUNTIMES = Object.freeze(['browser', 'electron']);

export function statusToExitCode(status) {
  if (status === 'pass') return 0;
  if (status === 'pending') return 2;
  return 1;
}

export function parseHeadedReleaseSoakArgs(argv = []) {
  let runtime = 'all';
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') { json = true; continue; }
    if (arg.startsWith('--runtime=')) {
      runtime = arg.slice('--runtime='.length);
      continue;
    }
    if (arg === '--runtime') {
      runtime = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`unknown argument for headed release-soak check: ${arg}`);
  }
  if (runtime !== 'all') requireRuntime(runtime);
  return { runtimes: runtime === 'all' ? [...SUPPORTED_RUNTIMES] : [runtime], json };
}

export async function discoverHeadedReleaseSoakEvidence({ root, runtime } = {}) {
  requireRuntime(runtime);
  const resolvedRoot = path.resolve(root || '.');
  const base = path.join(resolvedRoot, '.devshots', 'spec2');
  let entries;
  try {
    await assertSafeContainedPath({ root: resolvedRoot, target: base, label: 'headed evidence directory', expect: 'directory' });
    entries = await readdir(base, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
  const prefix = `release-soak-${runtime}-`;
  const found = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) continue;
    const candidate = path.join(base, entry.name, 'evidence.json');
    try {
      const metadata = await lstat(candidate);
      if (metadata.isFile() || entry.isSymbolicLink?.() || !entry.isDirectory()) found.push(candidate);
    } catch (error) {
      if (entry.isSymbolicLink?.() || !entry.isDirectory()) found.push(candidate);
      else if (!error || error.code !== 'ENOENT') throw error;
    }
  }
  return found.sort((a, b) => b.localeCompare(a));
}

export function classifyReleaseSoakEvidence({
  evidence,
  evidencePath,
  expectedRuntime,
  currentFingerprint,
  currentFingerprintBefore,
  currentFingerprintAfter,
  contractValidation,
  artifactValidation,
  producerReceiptValidation,
  producerEntrypointValidation,
  finalBindingValidation,
} = {}) {
  const failures = [];
  requireRuntime(expectedRuntime);
  const normalizedPath = String(evidencePath || '').replaceAll('\\', '/');
  const expectedPath = new RegExp(
    `(?:^|/)\\.devshots/spec2/release-soak-${expectedRuntime}-[^/]+/evidence\\.json$`,
    'i',
  );
  if (!expectedPath.test(normalizedPath)) failures.push('evidence path is outside the headed release-soak directory grammar');
  if (!evidence || typeof evidence !== 'object') failures.push('evidence envelope is missing');
  else {
    if (evidence.runtimeKind !== expectedRuntime || evidence.mode !== expectedRuntime) {
      failures.push(`evidence runtime must be ${expectedRuntime}`);
    }
    if (evidence.taskId !== `release-soak-${expectedRuntime}`) failures.push(`taskId must be release-soak-${expectedRuntime}`);
    if (evidence.primaryAcceptance !== true) failures.push('headed evidence must claim primaryAcceptance=true');
    if (evidence.injectedState !== false) failures.push('headed evidence must declare injectedState=false');
    if (evidence.inputSource !== 'keyboard-mouse') failures.push('headed evidence must use keyboard-mouse input');
    if (evidence.validation?.pass !== true || (evidence.validation?.failures || []).length) {
      failures.push('producer validation must pass without failures');
    }
  }
  if (!contractValidation || contractValidation.pass !== true) {
    failures.push(...(contractValidation?.failures || ['release-soak evidence contract validation failed']));
  }
  if (!artifactValidation || artifactValidation.pass !== true || !artifactValidation.verified?.length) {
    failures.push(...(artifactValidation?.failures || ['content-hashed artifacts did not verify']));
  }
  if (!producerReceiptValidation || producerReceiptValidation.pass !== true) {
    failures.push(...(producerReceiptValidation?.failures || ['persisted producer receipt validation failed']));
  }
  if (!producerEntrypointValidation || producerEntrypointValidation.pass !== true) {
    failures.push(...(producerEntrypointValidation?.failures || ['approved producer entrypoint validation failed']));
  }
  if (finalBindingValidation && finalBindingValidation.pass !== true) {
    failures.push(...(finalBindingValidation.failures || ['final evidence binding validation failed']));
  }
  if (failures.length) return result('fail', expectedRuntime, evidencePath, failures);

  const before = currentFingerprintBefore || currentFingerprint || {};
  const after = currentFingerprintAfter || currentFingerprint || {};
  if (before.id !== after.id || before.digest !== after.digest) {
    return result('fail', expectedRuntime, evidencePath, [
      'worktree changed during headed release-soak validation; recapture is required',
    ]);
  }
  if (
    evidence.worktreeId !== before.id
    || evidence.worktreeDigest !== before.digest
    || evidence.worktreeId !== after.id
    || evidence.worktreeDigest !== after.digest
  ) {
    return result('fail', expectedRuntime, evidencePath, [
      'headed release-soak worktree binding does not match the current worktree; recapture is required',
    ]);
  }
  return result('pass', expectedRuntime, evidencePath, []);
}

export function validateProducerReceipt({
  root,
  expectedRuntime,
  evidencePath,
  evidenceContents,
  receipt,
  verifiedArtifacts,
  approvedEntrypoint,
} = {}) {
  const failures = [];
  requireRuntime(expectedRuntime);
  const resolvedRoot = path.resolve(root || '.');
  const resolvedEvidence = path.resolve(String(evidencePath || ''));
  const resolvedOutput = path.dirname(resolvedEvidence);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { pass: false, failures: ['persisted producer receipt is missing or invalid'] };
  }
  if (receipt.runtime !== expectedRuntime) {
    failures.push(`producer receipt runtime ${String(receipt.runtime)} does not match ${expectedRuntime}`);
  }
  if (!approvedEntrypoint?.entrypoint || receipt.producerEntrypoint !== approvedEntrypoint.entrypoint) {
    failures.push('producer entrypoint identity does not match the approved runtime wrapper');
  }
  if (!approvedEntrypoint?.sha256 || receipt.producerEntrypointSha256 !== approvedEntrypoint.sha256) {
    failures.push('producer entrypoint SHA-256 does not match the current approved wrapper');
  }
  if (!isContained(resolvedRoot, resolvedEvidence)) failures.push('evidence path escapes the repository root');
  if (path.resolve(String(receipt.evidencePath || '')) !== resolvedEvidence) {
    failures.push('producer receipt evidence path does not bind evidence.json');
  }
  if (path.resolve(String(receipt.outputDir || '')) !== resolvedOutput) {
    failures.push('producer receipt output directory does not bind the evidence directory');
  }
  const bytes = Buffer.isBuffer(evidenceContents) ? evidenceContents : Buffer.from(evidenceContents || '');
  if (receipt.evidenceBytes !== bytes.length) failures.push('producer receipt evidence byte count does not match');
  if (receipt.evidenceSha256 !== sha256(bytes)) failures.push('producer receipt evidence SHA-256 does not match');
  const expectedArtifacts = canonicalArtifacts(verifiedArtifacts);
  const receiptArtifacts = canonicalArtifacts(receipt.artifacts);
  if (JSON.stringify(receiptArtifacts) !== JSON.stringify(expectedArtifacts)) {
    failures.push('producer receipt artifact bindings do not match verified artifacts');
  }
  let evidence = null;
  try { evidence = JSON.parse(bytes.toString('utf8')); } catch {}
  if (!evidence || receipt.worktreeId !== evidence.worktreeId || receipt.worktreeDigest !== evidence.worktreeDigest) {
    failures.push('producer receipt worktree identity does not match evidence.json');
  }
  if (receipt.producerValidation?.pass !== true || (receipt.producerValidation?.failures || []).length !== 0) {
    failures.push('producer validation did not pass cleanly');
  }
  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

export async function validateApprovedProducerEntrypoint({ root, runtime } = {}) {
  requireRuntime(runtime);
  const resolvedRoot = path.resolve(root || '.');
  const relative = `scripts/check-release-soak-${runtime}.mjs`;
  const entrypoint = path.join(resolvedRoot, ...relative.split('/'));
  const failures = [];
  try {
    const contents = await readContainedRegularFile({
      root: resolvedRoot,
      filePath: entrypoint,
      label: `approved ${runtime} producer entrypoint`,
    });
    const source = contents.toString('utf8');
    if (!/import\s*\{\s*runReleaseSoakCli\s*\}\s*from\s*['"]\.\/lib\/releaseSoakCli\.mjs['"]/.test(source)) {
      failures.push(`approved ${runtime} producer entrypoint identity mismatch`);
    }
    if (!new RegExp(`runtime:\\s*['"]${runtime}['"]`).test(source)) {
      failures.push(`approved producer entrypoint is not runtime-locked to ${runtime}`);
    }
    if (!/argv:\s*process\.argv\.slice\(2\)/.test(source) || !/process\.exitCode\s*=\s*result\.exitCode/.test(source)) {
      failures.push(`approved ${runtime} producer entrypoint invocation contract mismatch`);
    }
    return {
      pass: failures.length === 0,
      failures,
      entrypoint: relative,
      sha256: sha256(contents),
    };
  } catch (error) {
    failures.push(`approved ${runtime} producer entrypoint is unreadable: ${error.code || error.message}`);
    return { pass: false, failures, entrypoint: relative, sha256: null };
  }
}

export async function checkHeadedReleaseSoakEvidence({
  root,
  runtimes = SUPPORTED_RUNTIMES,
  onInitialValidationComplete,
} = {}) {
  const resolvedRoot = path.resolve(root || '.');
  const requested = [...new Set(runtimes || [])];
  if (!requested.length) throw new Error('at least one headed release-soak runtime is required');
  requested.forEach(requireRuntime);
  const discovered = new Map();
  for (const runtime of requested) {
    discovered.set(runtime, await discoverHeadedReleaseSoakEvidence({ root: resolvedRoot, runtime }));
  }
  const hasCandidate = [...discovered.values()].some((candidates) => candidates.length > 0);
  const worktreeBefore = hasCandidate ? await strictWorktreeFingerprint(resolvedRoot) : null;
  const prepared = [];
  for (const runtime of requested) {
    const candidates = discovered.get(runtime) || [];
    if (!candidates.length) {
      prepared.push({ ready: false, receipt: result('pending', runtime, null, [`headed ${runtime} public-route evidence is absent`]) });
      continue;
    }
    const evidencePath = candidates[0];
    let evidence;
    let evidenceContents;
    try {
      evidenceContents = await readContainedRegularFile({
        root: resolvedRoot,
        filePath: evidencePath,
        label: 'headed release-soak evidence',
      });
      evidence = JSON.parse(evidenceContents.toString('utf8'));
    } catch (error) {
      prepared.push({ ready: false, receipt: result('fail', runtime, evidencePath, [`evidence JSON is unreadable: ${error.message}`]) });
      continue;
    }
    const contractValidation = validateReleaseSoakEvidence(evidence);
    let artifactValidation;
    try {
      await validateArtifactAncestry({ root: resolvedRoot, artifacts: evidence.artifacts });
      artifactValidation = await validateArtifactFiles(resolvedRoot, evidence.artifacts, { requireClaims: true });
      await validateArtifactAncestry({ root: resolvedRoot, artifacts: evidence.artifacts });
    } catch (error) {
      artifactValidation = { pass: false, failures: [`artifact validation failed: ${error.message}`], verified: [] };
    }
    const producerEntrypointValidation = await validateApprovedProducerEntrypoint({ root: resolvedRoot, runtime });
    const producerReceiptPath = path.join(path.dirname(evidencePath), 'receipt.json');
    let producerReceipt = null;
    let producerReceiptContents = null;
    let producerReceiptReadFailures = [];
    try {
      producerReceiptContents = await readContainedRegularFile({
        root: resolvedRoot,
        filePath: producerReceiptPath,
        label: 'persisted producer receipt',
      });
      producerReceipt = JSON.parse(producerReceiptContents.toString('utf8'));
    } catch (error) {
      producerReceiptReadFailures.push(`persisted producer receipt is missing or unreadable: ${error.code || error.message}`);
    }
    const producerReceiptValidation = producerReceiptReadFailures.length
      ? { pass: false, failures: producerReceiptReadFailures }
      : validateProducerReceipt({
          root: resolvedRoot,
          expectedRuntime: runtime,
          evidencePath,
          evidenceContents,
          receipt: producerReceipt,
          verifiedArtifacts: artifactValidation.verified,
          approvedEntrypoint: producerEntrypointValidation,
        });
    prepared.push({
      ready: true,
      evidence,
      evidencePath: path.relative(resolvedRoot, evidencePath),
      expectedRuntime: runtime,
      contractValidation,
      artifactValidation,
      producerReceiptValidation,
      producerEntrypointValidation,
      evidenceAbsolutePath: evidencePath,
      evidenceContents,
      producerReceiptPath,
      producerReceiptContents,
      producerReceipt,
    });
  }
  if (typeof onInitialValidationComplete === 'function') {
    await onInitialValidationComplete({
      entries: prepared.filter((entry) => entry.ready).map((entry) => ({
        runtime: entry.expectedRuntime,
        evidencePath: entry.evidenceAbsolutePath,
        producerReceiptPath: entry.producerReceiptPath,
        artifacts: entry.artifactValidation?.verified || [],
      })),
    });
  }
  for (const entry of prepared) {
    if (!entry.ready) continue;
    entry.finalBindingValidation = await validateFinalEvidenceBindings({
      root: resolvedRoot,
      evidencePath: entry.evidenceAbsolutePath,
      evidenceContents: entry.evidenceContents,
      producerReceiptPath: entry.producerReceiptPath,
      producerReceiptContents: entry.producerReceiptContents,
      producerReceipt: entry.producerReceipt,
      verifiedArtifacts: entry.artifactValidation?.verified || [],
    });
  }
  const worktreeAfter = hasCandidate ? await strictWorktreeFingerprint(resolvedRoot) : null;
  const receipts = prepared.map((entry) => entry.ready
    ? classifyReleaseSoakEvidence({
        ...entry,
        currentFingerprintBefore: worktreeBefore,
        currentFingerprintAfter: worktreeAfter,
      })
    : entry.receipt);
  const status = receipts.some((receipt) => receipt.status === 'fail')
    ? 'fail'
    : receipts.some((receipt) => receipt.status === 'pending') ? 'pending' : 'pass';
  return {
    schema: 'spaceface.releaseSoakEvidenceCheck.v1',
    status,
    pass: status === 'pass',
    currentWorktreeId: worktreeAfter?.id || null,
    currentWorktreeDigest: worktreeAfter?.digest || null,
    worktreeBefore,
    worktreeAfter,
    runtimes: receipts,
    failures: receipts.flatMap((receipt) => receipt.failures.map((failure) => `${receipt.runtime}: ${failure}`)),
  };
}

async function validateFinalEvidenceBindings({
  root,
  evidencePath,
  evidenceContents,
  producerReceiptPath,
  producerReceiptContents,
  producerReceipt,
  verifiedArtifacts,
} = {}) {
  const failures = [];
  try {
    const finalEvidence = await readContainedRegularFile({
      root,
      filePath: evidencePath,
      label: 'final headed release-soak evidence',
    });
    if (!Buffer.isBuffer(evidenceContents) || !finalEvidence.equals(evidenceContents)) {
      failures.push('evidence.json changed after initial validation');
    }
    if (
      producerReceipt?.evidenceBytes !== finalEvidence.length
      || producerReceipt?.evidenceSha256 !== sha256(finalEvidence)
    ) {
      failures.push('final evidence bytes no longer match the validated producer receipt binding');
    }
  } catch (error) {
    failures.push(`final evidence binding validation failed: ${error.code || error.message}`);
  }

  try {
    const finalReceipt = await readContainedRegularFile({
      root,
      filePath: producerReceiptPath,
      label: 'final persisted producer receipt',
    });
    if (!Buffer.isBuffer(producerReceiptContents) || !finalReceipt.equals(producerReceiptContents)) {
      failures.push('receipt.json changed after initial validation');
    }
  } catch (error) {
    failures.push(`final producer receipt binding validation failed: ${error.code || error.message}`);
  }

  for (const artifact of verifiedArtifacts || []) {
    try {
      const artifactPath = path.resolve(root || '.', String(artifact?.path || ''));
      const finalArtifact = await readContainedRegularFile({
        root,
        filePath: artifactPath,
        label: `final release-soak artifact ${String(artifact?.path || '')}`,
      });
      if (artifact?.bytes !== finalArtifact.length || artifact?.sha256 !== sha256(finalArtifact)) {
        failures.push(`artifact changed after initial validation: ${String(artifact?.path || '')}`);
      }
    } catch (error) {
      failures.push(`final artifact binding validation failed for ${String(artifact?.path || '')}: ${error.code || error.message}`);
    }
  }
  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

export async function assertSafeContainedPath({
  root,
  target,
  label = 'path',
  expect,
  allowMissingLeaf = false,
} = {}) {
  const resolvedRoot = path.resolve(root || '.');
  const resolvedTarget = path.resolve(String(target || ''));
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the repository root`);
  }
  const rootMetadata = await lstat(resolvedRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error(`${label} has unsafe symlink or junction/reparse ancestry at repository root`);
  }
  const canonicalRoot = await realpath(resolvedRoot);
  let current = resolvedRoot;
  let metadata = rootMetadata;
  const segments = relative === '' ? [] : relative.split(path.sep);
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const isLeaf = index === segments.length - 1;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (allowMissingLeaf && isLeaf && error?.code === 'ENOENT') {
        return { path: resolvedTarget, exists: false, metadata: null };
      }
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`${label} has unsafe symlink or junction/reparse ancestry: ${current}`);
    }
    if (!isLeaf && !metadata.isDirectory()) {
      throw new Error(`${label} has non-directory ancestry: ${current}`);
    }
    const canonicalCurrent = await realpath(current);
    if (!isPathWithin(canonicalRoot, canonicalCurrent, { allowEqual: true })) {
      throw new Error(`${label} has unsafe junction/reparse ancestry outside the repository root: ${current}`);
    }
  }
  if (expect === 'file' && !metadata.isFile()) throw new Error(`${label} must be a regular file: ${resolvedTarget}`);
  if (expect === 'directory' && !metadata.isDirectory()) throw new Error(`${label} must be a directory: ${resolvedTarget}`);
  return { path: resolvedTarget, exists: true, metadata };
}

export async function readContainedRegularFile({ root, filePath, label = 'file', allowEmpty = false } = {}) {
  await assertSafeContainedPath({ root, target: filePath, label, expect: 'file' });
  const handle = await open(filePath, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${label} must be a regular file: ${filePath}`);
    const contents = await handle.readFile();
    if (!allowEmpty && contents.length < 1) throw new Error(`${label} is empty: ${filePath}`);
    await assertSafeContainedPath({ root, target: filePath, label, expect: 'file' });
    return contents;
  } finally {
    await handle.close();
  }
}

export async function validateArtifactAncestry({ root, artifacts } = {}) {
  if (!Array.isArray(artifacts)) throw new Error('artifact manifest must be an array');
  for (const artifact of artifacts) {
    const artifactPath = path.resolve(root || '.', String(artifact?.path || ''));
    await assertSafeContainedPath({
      root,
      target: artifactPath,
      label: `release-soak artifact ${String(artifact?.path || '')}`,
      expect: 'file',
    });
  }
}

function result(status, runtime, evidencePath, failures) {
  return {
    status,
    pass: status === 'pass',
    runtime,
    evidencePath: evidencePath || null,
    failures: [...new Set(failures || [])],
  };
}

function requireRuntime(runtime) {
  if (!SUPPORTED_RUNTIMES.includes(runtime)) throw new Error(`unsupported release-soak runtime: ${runtime}`);
}

function canonicalArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.map((artifact) => ({
    kind: artifact?.kind,
    path: artifact?.path,
    bytes: artifact?.bytes,
    sha256: artifact?.sha256,
  })).sort((a, b) => String(a.path || '').localeCompare(String(b.path || '')) || String(a.kind || '').localeCompare(String(b.kind || '')));
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isPathWithin(root, candidate, { allowEqual = false } = {}) {
  const relative = path.relative(root, candidate);
  return (allowEqual && relative === '') || (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}
