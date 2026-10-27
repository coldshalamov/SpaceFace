import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateProgram, taskBrief, safeRepoPath } from '../scripts/lib/strategicChaosProgram.mjs';
import { main } from '../scripts/strategic-chaos.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const program = JSON.parse(readFileSync(join(root, 'design/program/strategic-chaos/program.json'), 'utf8'));
const copy = () => structuredClone(program);
const cli = args => spawnSync(process.execPath, [join(root, 'scripts/strategic-chaos.mjs'), ...args], { cwd: root, encoding: 'utf8' });
test('real authored index is valid and every brief is executable as an assignment', () => {
  assert.equal(validateProgram(program).ok, true);
  for (const task of program.tasks) {
    const text = readFileSync(join(root, task.document), 'utf8');
    const brief = taskBrief(program, task.id, text);
    assert.ok(brief.includes(task.outcome)); assert.ok(brief.includes(task.acceptance));
    assert.ok(brief.includes('Do not merge/deploy')); assert.ok(task.grunt.length > 0);
  }
});
for (const [name, mutate] of [
  ['duplicate ID', p => { p.tasks[1].id = p.tasks[0].id; }],
  ['unknown dependency', p => { p.tasks[0].dependsOn = ['SC-99']; }],
  ['dependency cycle', p => { p.tasks[0].dependsOn = ['SC-02']; p.tasks[1].dependsOn = ['SC-01']; }],
  ['foreign queue', p => { p.authority = 'my-queue.json'; }],
  ['copied status', p => { p.tasks[0].status = 'done'; }],
  ['path traversal', p => { p.tasks[0].document = '../../secret'; }],
  ['missing owner', p => { p.tasks[0].ownerPaths = []; }],
  ['missing acceptance', p => { delete p.tasks[0].acceptance; }],
  ['malformed dependencies', p => { p.tasks[0].dependsOn = {}; }],
  ['no concrete grunt task', p => { p.tasks[0].grunt = []; }],
]) test(`program rejects ${name}`, () => { const p = copy(); mutate(p); assert.equal(validateProgram(p).ok, false); });
test('path policy rejects platform-specific escapes', () => {
  for (const path of ['/etc/passwd', '../x', 'a/../../x', 'C:/x', 'a\\b', 'a//b', 'a/./b', 'a\0b']) assert.equal(safeRepoPath(path), false);
  assert.equal(safeRepoPath('src/ai/squad.js'), true);
});
test('unknown packet is not silently substituted', () => assert.throws(() => taskBrief(program, 'SC-99', 'x'), /Unknown/));
test('bundle validation and brief CLI work without booting the game', () => {
  const validate = cli(['validate', '--bundle']); assert.equal(validate.status, 0, validate.stderr + validate.stdout);
  assert.equal(JSON.parse(validate.stdout).sourcePathCheck, 'NOT_RUN_SOURCE_ONLY_BUNDLE');
  const brief = cli(['brief', 'SC-03']); assert.equal(brief.status, 0); assert.match(brief.stdout, /Tactical Command/);
});
test('unknown switches and seed cherry-picking fail before any native run', () => {
  for (const args of [['proof', '--seed=47'], ['validate', '--skip-errors'], ['brief', 'SC-99'], ['deploy']]) assert.equal(cli(args).status, 2);
});
test('a source-only delivery never pretends to run the game', () => {
  const temp = mkdtempSync(join(tmpdir(), 'sc-no-runtime-'));
  try { assert.throws(() => main(['proof'], temp), /not a complete game checkout/); }
  finally { rmSync(temp, { recursive: true, force: true }); }
});
test('imported evidence exits diagnostic-only even when structurally supplied', () => {
  const temp = mkdtempSync(join(tmpdir(), 'sc-import-'));
  try {
    const path = join(temp, 'report.json'); writeFileSync(path, JSON.stringify({ runs: [] }));
    const result = cli(['audit', path]); assert.equal(result.status, 4); assert.equal(JSON.parse(result.stdout).acceptanceGranted, false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
