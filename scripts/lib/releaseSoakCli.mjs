import { createHash } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_CYCLES,
  DEFAULT_VIEWPORT,
  runReleaseSoakProbe,
} from './releaseSoakProbe.mjs';
import {
  validateArtifactFiles,
  validateReleaseSoakEvidence,
} from './releaseSoakContracts.mjs';
import {
  assertSafeContainedPath,
  readContainedRegularFile,
  validateApprovedProducerEntrypoint,
  validateArtifactAncestry,
} from './releaseSoakEvidenceChecker.mjs';

const RUNTIMES = new Set(['browser', 'electron']);
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function parseReleaseSoakArgs(argv, { runtime, root } = {}) {
  assertRuntime(runtime);
  const repoRoot = path.resolve(requireText(root, 'root'));
  const values = new Map();

  for (const argument of argv || []) {
    if (argument === '--runtime' || argument.startsWith('--runtime=')) {
      throw new Error(`runtime is locked to ${runtime} by this acceptance entrypoint`);
    }
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/i.exec(argument);
    if (!match) throw new Error(`unknown argument: ${argument}`);
    const [, name, value] = match;
    if (values.has(name)) throw new Error(`duplicate argument: --${name}`);
    values.set(name, value);
  }

  const supported = new Set([
    'cycles',
    'viewport',
    'output-root',
    'task-id',
    'flight-timeout-ms',
    'dock-timeout-ms',
    'cycle-timeout-ms',
  ]);
  for (const name of values.keys()) {
    if (!supported.has(name)) throw new Error(`unknown argument: --${name}`);
  }

  const outputRoot = resolveContainedPath(
    repoRoot,
    values.get('output-root') || path.join('.devshots', 'spec2'),
    '--output-root',
  );
  const taskId = values.get('task-id') || `release-soak-${runtime}`;
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new Error('--task-id must be 1-80 safe filename characters (letters, numbers, dot, underscore, or hyphen)');
  }

  return {
    runtime,
    mode: runtime,
    cycles: readPositiveInteger(values, 'cycles', DEFAULT_CYCLES[runtime]),
    viewport: readViewport(values.get('viewport')),
    outputRoot,
    taskId,
    flightTimeoutMs: readPositiveInteger(values, 'flight-timeout-ms', 150_000),
    dockTimeoutMs: readPositiveInteger(values, 'dock-timeout-ms', 90_000),
    cycleTimeoutMs: readPositiveInteger(values, 'cycle-timeout-ms', 120_000),
  };
}

export async function runReleaseSoakCli(
  { runtime, root, argv = [], log = console.log } = {},
) {
  const failures = [];
  let evidencePath = null;

  try {
    const repoRoot = path.resolve(requireText(root, 'root'));
    const options = parseReleaseSoakArgs(argv, { runtime, root: repoRoot });
    const result = await runReleaseSoakProbe({
      root: repoRoot,
      ...options,
      log: (line) => log(`[release-soak:${runtime}:probe] ${line}`),
    });
    const publication = await validateReleaseSoakPublication({
      runtime,
      root: repoRoot,
      outputRoot: options.outputRoot,
      result,
    });
    evidencePath = publication.evidencePath;
    if (!publication.pass) {
      return reportFailure({ runtime, evidencePath, failures: publication.failures, log });
    }
    const { receipt } = publication;

    log(`[release-soak:${runtime}] evidence: ${receipt.evidencePath}`);
    log(`[release-soak:${runtime}] evidence sha256: ${receipt.evidenceSha256}`);
    for (const artifact of receipt.artifacts) {
      log(`[release-soak:${runtime}] artifact ${artifact.kind}: ${artifact.path} sha256=${artifact.sha256}`);
    }
    log(`[release-soak:${runtime}] PASS`);
    return { exitCode: 0, pass: true, failures: [], receipt };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return reportFailure({ runtime, evidencePath, failures: [...new Set(failures)], log });
  }
}

export async function validateReleaseSoakPublication({ runtime, root, outputRoot, result } = {}) {
  const failures = [];
  let evidencePath = null;
  try {
    assertRuntime(runtime);
    const repoRoot = path.resolve(requireText(root, 'root'));
    const containedOutputRoot = resolveContainedPath(repoRoot, outputRoot, 'output root');
    if (result?.pass !== true) failures.push('probe did not report pass=true');
    if (!result?.outputDir) failures.push('probe did not publish an output directory');
    const outputDir = result?.outputDir
      ? resolveContainedPath(containedOutputRoot, result.outputDir, 'probe output directory')
      : containedOutputRoot;
    evidencePath = path.join(outputDir, 'evidence.json');

    await assertSafeContainedPath({ root: repoRoot, target: containedOutputRoot, label: 'release-soak output root', expect: 'directory' });
    await assertSafeContainedPath({ root: repoRoot, target: outputDir, label: 'release-soak output directory', expect: 'directory' });
    const evidenceContents = await readContainedRegularFile({ root: repoRoot, filePath: evidencePath, label: 'evidence receipt' });
    const evidence = parseJson(evidenceContents, evidencePath);
    if (evidence.runtimeKind !== runtime) {
      failures.push(`evidence runtime ${String(evidence.runtimeKind)} does not match locked runtime ${runtime}`);
    }
    if (evidence.mode !== runtime) failures.push(`evidence mode must be ${runtime}`);
    if (evidence.primaryAcceptance !== true) failures.push('evidence must claim primaryAcceptance=true');
    if (evidence.validation?.pass !== true || (evidence.validation?.failures?.length || 0) !== 0) {
      failures.push('probe-published validation did not pass cleanly');
    }

    const evidenceValidation = validateReleaseSoakEvidence(evidence);
    failures.push(...evidenceValidation.failures);
    await validateArtifactAncestry({ root: repoRoot, artifacts: evidence.artifacts });
    const artifactValidation = await validateArtifactFiles(repoRoot, evidence.artifacts, { requireClaims: true });
    await validateArtifactAncestry({ root: repoRoot, artifacts: evidence.artifacts });
    failures.push(...artifactValidation.failures);
    const producer = await validateApprovedProducerEntrypoint({ root: repoRoot, runtime });
    failures.push(...producer.failures);
    const uniqueFailures = [...new Set(failures)];
    if (uniqueFailures.length > 0) {
      return { pass: false, failures: uniqueFailures, receipt: null, evidencePath };
    }

    const receipt = {
      runtime,
      producerEntrypoint: producer.entrypoint,
      producerEntrypointSha256: producer.sha256,
      evidencePath,
      evidenceSha256: sha256(evidenceContents),
      evidenceBytes: evidenceContents.length,
      outputDir,
      artifacts: artifactValidation.verified.map(({ kind, path: artifactPath, bytes, sha256: artifactSha256 }) => ({
        kind,
        path: artifactPath,
        bytes,
        sha256: artifactSha256,
      })),
      worktreeId: evidence.worktreeId,
      worktreeDigest: evidence.worktreeDigest,
      producerValidation: { pass: true, failures: [] },
    };
    await publishProducerReceiptAtomically({ root: repoRoot, outputDir, receipt });
    return {
      pass: true,
      failures: [],
      evidencePath,
      receipt,
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return { pass: false, failures: [...new Set(failures)], receipt: null, evidencePath };
  }
}

export async function publishProducerReceiptAtomically({ root, outputDir, receipt } = {}) {
  const repoRoot = path.resolve(requireText(root, 'root'));
  const containedOutputDir = resolveContainedPath(repoRoot, outputDir, 'receipt output directory');
  await assertSafeContainedPath({
    root: repoRoot,
    target: containedOutputDir,
    label: 'receipt output directory',
    expect: 'directory',
  });
  const finalPath = path.join(containedOutputDir, 'receipt.json');
  const tempPath = path.join(containedOutputDir, 'receipt.json.tmp');
  const desired = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  const existingFinal = await readOptionalContainedFile(repoRoot, finalPath, 'producer receipt');
  if (existingFinal) {
    await removeContainedTempIfPresent(repoRoot, tempPath);
    if (existingFinal.equals(desired)) return { path: finalPath, recovered: true };
    throw new Error(`producer receipt already exists with different content: ${finalPath}`);
  }

  let tempContents = await readOptionalContainedFile(
    repoRoot,
    tempPath,
    'producer receipt temporary file',
    { allowEmpty: true },
  );
  if (tempContents && !tempContents.equals(desired)) {
    await removeContainedTempIfPresent(repoRoot, tempPath);
    tempContents = null;
  }
  if (!tempContents) {
    const handle = await open(tempPath, 'wx');
    try {
      await handle.writeFile(desired);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  try {
    await assertSafeContainedPath({
      root: repoRoot,
      target: tempPath,
      label: 'producer receipt temporary file',
      expect: 'file',
    });
    await link(tempPath, finalPath);
    const published = await readContainedRegularFile({ root: repoRoot, filePath: finalPath, label: 'producer receipt' });
    if (!published.equals(desired)) throw new Error(`published producer receipt differs from requested content: ${finalPath}`);
    return { path: finalPath, recovered: Boolean(tempContents) };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const published = await readContainedRegularFile({ root: repoRoot, filePath: finalPath, label: 'producer receipt' });
    if (!published.equals(desired)) {
      throw new Error(`producer receipt already exists with different content: ${finalPath}`);
    }
    return { path: finalPath, recovered: true };
  } finally {
    await removeContainedTempIfPresent(repoRoot, tempPath);
    await assertSafeContainedPath({
      root: repoRoot,
      target: containedOutputDir,
      label: 'receipt output directory',
      expect: 'directory',
    });
  }
}

function reportFailure({ runtime, evidencePath, failures, log }) {
  const prefix = `[release-soak:${runtime || 'unknown'}]`;
  if (evidencePath) log(`${prefix} rejected evidence: ${evidencePath}`);
  log(`${prefix} FAIL: ${failures.join(' | ')}`);
  return { exitCode: 1, pass: false, failures, receipt: null, evidencePath };
}

async function readOptionalContainedFile(root, filePath, label, { allowEmpty = false } = {}) {
  const checked = await assertSafeContainedPath({
    root,
    target: filePath,
    label,
    expect: 'file',
    allowMissingLeaf: true,
  });
  if (!checked.exists) return null;
  return readContainedRegularFile({ root, filePath, label, allowEmpty });
}

async function removeContainedTempIfPresent(root, tempPath) {
  const checked = await assertSafeContainedPath({
    root,
    target: tempPath,
    label: 'producer receipt temporary file',
    expect: 'file',
    allowMissingLeaf: true,
  });
  if (checked.exists) await unlink(tempPath);
}

function parseJson(contents, filePath) {
  try {
    return JSON.parse(contents.toString('utf8'));
  } catch (error) {
    throw new Error(`invalid evidence JSON at ${filePath}: ${error.message}`);
  }
}

function readViewport(value) {
  if (value == null) return { ...DEFAULT_VIEWPORT };
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) throw new Error('--viewport must use WIDTHxHEIGHT');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 800 || height < 600) {
    throw new Error('--viewport must be at least 800x600');
  }
  return { width, height };
}

function readPositiveInteger(values, name, fallback) {
  if (!values.has(name)) return fallback;
  const value = Number(values.get(name));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function resolveContainedPath(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside ${resolvedRoot}`);
  return resolved;
}

function assertRuntime(runtime) {
  if (!RUNTIMES.has(runtime)) throw new Error('runtime must be locked to browser or electron');
}

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}
