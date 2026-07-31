#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluatePerformanceFinalAcceptance } from './lib/performanceFinalAcceptance.mjs';
import { strictWorktreeFingerprint, validateArtifactFiles } from './lib/releaseSoakContracts.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const profiles = readList('profiles');
const matrices = readList('matrices');
const browserEvidence = readList('browser-evidence');
const electronEvidence = readList('electron-evidence');
const outputPath = resolveInsideRoot(readArg('out', '.devshots/perf/performance-final-acceptance.json'));
const currentWorktree = await strictWorktreeFingerprint(ROOT);
const expectedCommit = readArg('expected-commit', currentWorktree.head);

let profileInputs = [];
let matrixInputs = [];
let runtimePairs = [];
let loadFailure = null;
try {
  profileInputs = await Promise.all(profiles.map((filePath) => readEvidence(filePath)));
  matrixInputs = await Promise.all(matrices.map(async (filePath) => {
    const input = await readEvidence(filePath);
    input.artifactValidation = await validateArtifactFiles(ROOT, input.document?.artifacts, { requireClaims: true });
    return input;
  }));
  const [browserInputs, electronInputs] = await Promise.all([
    Promise.all(browserEvidence.map((filePath) => readRuntimeEvidence(filePath))),
    Promise.all(electronEvidence.map((filePath) => readRuntimeEvidence(filePath))),
  ]);
  runtimePairs = Array.from(
    { length: Math.max(browserInputs.length, electronInputs.length) },
    (_, index) => ({ browser: browserInputs[index], electron: electronInputs[index] }),
  );
} catch (error) {
  loadFailure = error;
}

const report = evaluatePerformanceFinalAcceptance({
  expectedCommit,
  currentWorktree,
  profiles: profileInputs,
  matrices: matrixInputs,
  runtimePairs,
});
if (loadFailure) {
  report.pass = false;
  report.failures.unshift(`evidence load failed: ${loadFailure.message}`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[perf-final] report: ${path.relative(ROOT, outputPath)}`);
console.log(`[perf-final] profiles=${profileInputs.length} matrices=${matrixInputs.length} runtimePairs=${runtimePairs.length} commit=${expectedCommit}`);
if (report.pass) {
  console.log('[perf-final] PASS');
} else {
  for (const failure of report.failures) console.error(`[perf-final] ${failure}`);
  console.error('[perf-final] FAIL');
  process.exitCode = 1;
}

async function readEvidence(value) {
  const absolute = resolveInsideRoot(value);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`evidence must be a regular file: ${value}`);
  const contents = await readFile(absolute);
  if (contents.length < 1) throw new Error(`evidence is empty: ${value}`);
  return {
    path: path.relative(ROOT, absolute).replaceAll('\\', '/'),
    bytes: contents.length,
    sha256: createHash('sha256').update(contents).digest('hex'),
    document: JSON.parse(contents.toString('utf8')),
  };
}

async function readRuntimeEvidence(value) {
  const input = await readEvidence(value);
  input.artifactValidation = await validateArtifactFiles(
    ROOT,
    input.document?.artifacts?.rawTrace ? [input.document.artifacts.rawTrace] : [],
    { requireClaims: true },
  );
  return input;
}

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function readList(name) {
  const value = readArg(name, '');
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function resolveInsideRoot(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`path escapes repository root: ${value}`);
  return absolute;
}
