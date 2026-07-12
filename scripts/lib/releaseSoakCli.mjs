import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
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

    const receiptFile = await readRegularFile(evidencePath, 'evidence receipt');
    const evidence = parseJson(receiptFile.contents, evidencePath);
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
    const artifactValidation = await validateArtifactFiles(repoRoot, evidence.artifacts, { requireClaims: true });
    failures.push(...artifactValidation.failures);
    const uniqueFailures = [...new Set(failures)];
    if (uniqueFailures.length > 0) {
      return { pass: false, failures: uniqueFailures, receipt: null, evidencePath };
    }

    return {
      pass: true,
      failures: [],
      evidencePath,
      receipt: {
        runtime,
        evidencePath,
        evidenceSha256: sha256(receiptFile.contents),
        evidenceBytes: receiptFile.contents.length,
        outputDir,
        artifacts: artifactValidation.verified.map(({ kind, path: artifactPath, bytes, sha256: artifactSha256 }) => ({
          kind,
          path: artifactPath,
          bytes,
          sha256: artifactSha256,
        })),
      },
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return { pass: false, failures: [...new Set(failures)], receipt: null, evidencePath };
  }
}

function reportFailure({ runtime, evidencePath, failures, log }) {
  const prefix = `[release-soak:${runtime || 'unknown'}]`;
  if (evidencePath) log(`${prefix} rejected evidence: ${evidencePath}`);
  log(`${prefix} FAIL: ${failures.join(' | ')}`);
  return { exitCode: 1, pass: false, failures, receipt: null, evidencePath };
}

async function readRegularFile(filePath, label) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file: ${filePath}`);
  const contents = await readFile(filePath);
  if (contents.length < 1) throw new Error(`${label} is empty: ${filePath}`);
  return { contents };
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
