#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPythonNoBytecodeEnv } from './lib/pythonProcessEnv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TASK_ID = 'm0-asset-recovery-blender-fixture';
const taskRoot = resolve(ROOT, '.devshots', 'alpha', TASK_ID);
const fixtureRoot = resolve(taskRoot, 'fixture-root');
const canonicalBlend = resolve(ROOT, 'assets', 'ships', 'parts', 'blender', 'engine_plasma_ring_authored.blend');
const canonicalExporter = resolve(ROOT, 'tools', 'blender', 'spaceface_export.py');
const canonicalWrapper = resolve(ROOT, 'tools', 'art', 'blender', 'export_sprint_part.py');
const canonicalRoleHelper = resolve(ROOT, 'tools', 'art', 'blender', 'export_texture_role_mode.py');
const fixtureBlend = resolve(fixtureRoot, 'assets', 'ships', 'parts', 'blender', 'engine_plasma_ring_authored.blend');
const fixtureExporter = resolve(fixtureRoot, 'tools', 'blender', 'spaceface_export.py');
const fixtureWrapper = resolve(fixtureRoot, 'tools', 'art', 'blender', 'export_sprint_part.py');
const fixtureRoleHelper = resolve(fixtureRoot, 'tools', 'art', 'blender', 'export_texture_role_mode.py');
const fixtureOutput = resolve(fixtureRoot, 'assets', 'ships', 'parts', 'revamp-evidence', 'engine_plasma_ring', '_export_tmp.glb');
const wrapperLog = resolve(fixtureRoot, 'assets', 'ships', 'parts', 'revamp-evidence', 'engine_plasma_ring', 'finalize.log');
const commandLog = resolve(taskRoot, 'blender-command.log');
const reportPath = resolve(taskRoot, 'blender-report.json');
const evidencePath = resolve(taskRoot, 'evidence.json');
const blender = process.env.SF_BLENDER_PATH || 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';

assertInsideAlphaTask(taskRoot);
assert.ok(existsSync(canonicalBlend), `canonical Blender source is missing: ${canonicalBlend}`);
assert.ok(existsSync(canonicalExporter), `core Blender exporter is missing: ${canonicalExporter}`);
assert.ok(existsSync(canonicalWrapper), `standard sprint wrapper is missing: ${canonicalWrapper}`);
assert.ok(existsSync(canonicalRoleHelper), `texture-role helper is missing: ${canonicalRoleHelper}`);
assert.ok(existsSync(blender), `Blender executable is missing: ${blender}`);

const initialHead = gitHead();
const canonicalBlendHashBefore = sha256(canonicalBlend);
const canonicalExporterHashBefore = sha256(canonicalExporter);
const canonicalWrapperHashBefore = sha256(canonicalWrapper);
const canonicalRoleHelperHashBefore = sha256(canonicalRoleHelper);
const pycSnapshotBefore = snapshotPythonBytecode();

rmSync(taskRoot, { recursive: true, force: true });
mkdirSync(dirname(fixtureBlend), { recursive: true });
mkdirSync(dirname(fixtureExporter), { recursive: true });
mkdirSync(dirname(fixtureWrapper), { recursive: true });
copyFileSync(canonicalBlend, fixtureBlend);
copyFileSync(canonicalExporter, fixtureExporter);
copyFileSync(canonicalWrapper, fixtureWrapper);
copyFileSync(canonicalRoleHelper, fixtureRoleHelper);
const fixtureBlendHashBefore = sha256(fixtureBlend);
const fixtureExporterHashBefore = sha256(fixtureExporter);
const fixtureWrapperHashBefore = sha256(fixtureWrapper);
const fixtureRoleHelperHashBefore = sha256(fixtureRoleHelper);

const environment = withPythonNoBytecodeEnv({
  ...process.env,
  SF_ROOT: fixtureRoot,
  SF_PART_ID: 'engine_plasma_ring',
  SF_TEXTURE_ROLE_OWNER: 'finalizer-v1',
});
const args = [
  '--background',
  '--factory-startup',
  '--python-exit-code',
  '1',
  '--python-expr',
  'import sys; sys.dont_write_bytecode = True',
  '--python',
  fixtureWrapper,
];
const startedAt = new Date();
const run = spawnSync(blender, args, {
  cwd: ROOT,
  env: environment,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  windowsHide: true,
});
const versionRun = spawnSync(blender, ['--version'], {
  cwd: ROOT,
  env: environment,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
  windowsHide: true,
});
const commandText = [quote(blender), ...args.map(quote)].join(' ');
writeText(commandLog, [
  `command: ${commandText}`,
  `cwd: ${ROOT}`,
  'environment: PYTHONDONTWRITEBYTECODE=1; SF_ROOT=<task>/fixture-root; SF_PART_ID=engine_plasma_ring; SF_TEXTURE_ROLE_OWNER=finalizer-v1',
  `exit: ${run.status ?? 'null'}`,
  `signal: ${run.signal ?? 'none'}`,
  `error: ${run.error?.message || 'none'}`,
  '',
  '--- stdout ---',
  run.stdout || '',
  '--- stderr ---',
  run.stderr || '',
].join('\n'));

assert.equal(run.error, undefined, `Blender wrapper could not start: ${run.error?.message || ''}`);
assert.equal(run.status, 0, `Blender wrapper failed; inspect ${commandLog}`);
assert.ok(existsSync(fixtureOutput), `Blender wrapper did not produce fixture output: ${fixtureOutput}`);
assert.ok(existsSync(wrapperLog), `Blender wrapper did not produce its fixture log: ${wrapperLog}`);
assert.ok(statSync(fixtureOutput).size > 0, 'Blender fixture output must be nonempty');
assert.ok(statSync(fixtureOutput).mtimeMs >= startedAt.getTime() - 1000,
  'Blender fixture output must be fresh for this capture');

const canonicalBlendHashAfter = sha256(canonicalBlend);
const canonicalExporterHashAfter = sha256(canonicalExporter);
const canonicalWrapperHashAfter = sha256(canonicalWrapper);
const canonicalRoleHelperHashAfter = sha256(canonicalRoleHelper);
const pycSnapshotAfter = snapshotPythonBytecode();
const fixturePyc = listPythonBytecode(fixtureRoot);
assert.equal(canonicalBlendHashAfter, canonicalBlendHashBefore,
  'canonical Blender source changed during fixture-copy evidence capture');
assert.equal(canonicalExporterHashAfter, canonicalExporterHashBefore,
  'canonical core exporter changed during fixture-copy evidence capture');
assert.equal(canonicalWrapperHashAfter, canonicalWrapperHashBefore,
  'canonical standard wrapper changed during fixture-copy evidence capture');
assert.equal(canonicalRoleHelperHashAfter, canonicalRoleHelperHashBefore,
  'canonical texture-role helper changed during fixture-copy evidence capture');
assert.deepEqual(pycSnapshotAfter, pycSnapshotBefore,
  'Blender fixture capture added or changed Python bytecode in canonical tool directories');
assert.deepEqual(fixturePyc, [], 'Blender fixture capture wrote Python bytecode under the task fixture root');
assert.equal(gitHead(), initialHead, 'HEAD changed during Blender evidence capture');

const blenderVersion = firstLine(versionRun.stdout) || firstLine(run.stdout) || 'unknown';
const report = {
  schema: 'spaceface.blenderFixtureEvidence.v1',
  taskId: TASK_ID,
  captureKind: 'blender',
  capturePurpose: 'fixture-copy repeatability; not canonical publication and not an in-game image',
  command: {
    executable: blender,
    args,
    exitCode: run.status,
    pythonDontWriteBytecode: environment.PYTHONDONTWRITEBYTECODE,
    rootMode: 'task-contained fixture copy',
    textureRoleOwner: environment.SF_TEXTURE_ROLE_OWNER,
  },
  blenderVersion,
  source: {
    canonicalBlend: repoPath(canonicalBlend),
    canonicalBlendBytes: statSync(canonicalBlend).size,
    canonicalBlendHashBefore,
    canonicalBlendHashAfter,
    canonicalBlendUnchanged: canonicalBlendHashBefore === canonicalBlendHashAfter,
    canonicalExporter: repoPath(canonicalExporter),
    canonicalExporterHashBefore,
    canonicalExporterHashAfter,
    canonicalExporterUnchanged: canonicalExporterHashBefore === canonicalExporterHashAfter,
    canonicalWrapper: repoPath(canonicalWrapper),
    canonicalWrapperHashBefore,
    canonicalWrapperHashAfter,
    canonicalWrapperUnchanged: canonicalWrapperHashBefore === canonicalWrapperHashAfter,
    canonicalRoleHelper: repoPath(canonicalRoleHelper),
    canonicalRoleHelperHashBefore,
    canonicalRoleHelperHashAfter,
    canonicalRoleHelperUnchanged: canonicalRoleHelperHashBefore === canonicalRoleHelperHashAfter,
  },
  fixture: {
    root: repoPath(fixtureRoot),
    inputBlend: repoPath(fixtureBlend),
    inputBlendHashBefore: fixtureBlendHashBefore,
    savedBlendHashAfter: sha256(fixtureBlend),
    exporter: repoPath(fixtureExporter),
    exporterHashBefore: fixtureExporterHashBefore,
    wrapper: repoPath(fixtureWrapper),
    wrapperHashBefore: fixtureWrapperHashBefore,
    textureRoleHelper: repoPath(fixtureRoleHelper),
    textureRoleHelperHashBefore: fixtureRoleHelperHashBefore,
    outputGlb: repoPath(fixtureOutput),
    outputGlbBytes: statSync(fixtureOutput).size,
    outputGlbSha256: sha256(fixtureOutput),
    wrapperLog: repoPath(wrapperLog),
  },
  bytecode: {
    canonicalSnapshotBefore: pycSnapshotBefore,
    canonicalSnapshotAfter: pycSnapshotAfter,
    fixtureFiles: fixturePyc,
    unchanged: JSON.stringify(pycSnapshotBefore) === JSON.stringify(pycSnapshotAfter),
  },
};
writeJson(reportPath, report);

const evidence = {
  schema: 'spaceface.alphaEvidence.v1',
  taskId: TASK_ID,
  worktreeId: worktreeId(initialHead),
  route: 'Blender background standard export_sprint_part.py against task-contained engine_plasma_ring fixture copy',
  viewport: { width: 1, height: 1 },
  runtime: { kind: 'blender', gpu: null },
  captureKind: 'blender',
  inputSource: 'fixture',
  injectedState: true,
  primaryAcceptance: false,
  checks: [
    { name: 'standard Blender wrapper exited zero with --python-exit-code 1', status: 'pass' },
    { name: 'canonical blend, exporter, wrapper, and texture-role helper hashes unchanged', status: 'pass' },
    { name: 'fresh task-contained GLB and wrapper log produced', status: 'pass' },
    { name: 'Python bytecode snapshots unchanged and fixture contains no pyc', status: 'pass' },
  ],
  artifacts: [
    { kind: 'report', path: repoPath(reportPath) },
    { kind: 'log', path: repoPath(commandLog) },
    { kind: 'log', path: repoPath(wrapperLog) },
  ],
  notes: [
    'This is supporting fixture-copy repeatability evidence, not a published canonical export.',
    'Blender executed copied wrapper/helper/exporter tooling and saved only the task-contained blend copy; all four canonical input hashes were checked before and after.',
    'No Blender output is labeled as an in-game screenshot, and this record is not primary acceptance.',
  ],
};
writeJson(evidencePath, evidence);
console.log(`PASS Blender fixture evidence: ${report.fixture.outputGlbBytes} bytes, sha256 ${report.fixture.outputGlbSha256}`);
console.log(`Evidence: ${repoPath(evidencePath)}`);

function assertInsideAlphaTask(target) {
  const alphaRoot = resolve(ROOT, '.devshots', 'alpha');
  const rel = relative(alphaRoot, target);
  assert.ok(rel && !rel.startsWith(`..${sep}`) && rel !== '..' && !resolve(target).includes(`${sep}..${sep}`),
    `refusing recursive fixture cleanup outside alpha evidence root: ${target}`);
  assert.equal(resolve(target), resolve(alphaRoot, TASK_ID), 'fixture cleanup target must be the exact task directory');
}

function snapshotPythonBytecode() {
  return [
    resolve(ROOT, 'tools', 'art', 'blender', '__pycache__'),
    resolve(ROOT, 'tools', 'blender', '__pycache__'),
  ].flatMap(listPythonBytecode);
}

function listPythonBytecode(root) {
  if (!existsSync(root)) return [];
  const records = [];
  visit(root);
  return records.sort((a, b) => a.path.localeCompare(b.path));

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.pyc')) {
        const stat = statSync(absolute);
        records.push({ path: repoPath(absolute), bytes: stat.size, sha256: sha256(absolute) });
      }
    }
  }
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || 'git rev-parse HEAD failed');
  return result.stdout.trim();
}

function worktreeId(head) {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).stdout.trim() || 'detached';
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).stdout.trim();
  return `${branch}@${head.slice(0, 8)}${dirty ? '+dirty' : ''}`;
}

function repoPath(file) {
  return relative(ROOT, file).split(sep).join('/');
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

function quote(value) {
  const text = String(value);
  return /\s/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}
