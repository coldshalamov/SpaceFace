import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseArgs, readSourceState, runOutputDirectory, sourceRunMetadata } from '../scripts/player-truth/run.mjs';
import { renderVerdict } from '../scripts/player-truth/verdict.mjs';

// The real gate runs idle then active. A custom output root must retain both receipts.
test('a custom multi-pass output keeps the idle verdict and contact sheet when the active pass starts', () => {
  const taskDir = mkdtempSync(path.join(os.tmpdir(), 'spaceface-player-truth-output-'));
  try {
    const args = parseArgs(['--mode=swarm', '--gate', `--out=${taskDir}`]);
    const idle = runOutputDirectory(args, 'swarm-idle', true);
    const active = runOutputDirectory(args, 'swarm-active', true);
    assert.notEqual(idle, active);
    mkdirSync(idle, { recursive: true });
    writeFileSync(path.join(idle, 'verdict.md'), 'idle FAIL');
    writeFileSync(path.join(idle, 'contact-sheet.jpg'), 'idle rendered evidence');
    rmSync(active, { recursive: true, force: true }); mkdirSync(active, { recursive: true });
    writeFileSync(path.join(active, 'verdict.md'), 'active INCOMPLETE');
    assert.equal(readFileSync(path.join(idle, 'verdict.md'), 'utf8'), 'idle FAIL');
    assert.equal(readFileSync(path.join(idle, 'contact-sheet.jpg'), 'utf8'), 'idle rendered evidence');
    assert.equal(path.dirname(idle), taskDir);
    assert.equal(path.dirname(active), taskDir);
  } finally {
    assert.ok(path.resolve(taskDir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    rmSync(taskDir, { recursive: true, force: true });
  }
});

test('a single player-truth run preserves the exact requested output directory', () => {
  const args = parseArgs(['--mode=adventure', '--headed', '--gate', '--out=.devshots/pr-maturation/player-truth/adventure']);
  assert.equal(runOutputDirectory(args, 'adventure', false), path.resolve(args.out));
  assert.equal(args.duration, 300); assert.equal(args.viewport, '1280x720');
});

test('run metadata retains starting foreign source paths and identifies a later HEAD separately', () => {
  const taskDir = mkdtempSync(path.join(os.tmpdir(), 'spaceface-player-truth-source-'));
  const git = (...args) => execFileSync('git', args, { cwd: taskDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    git('init', '-q');
    mkdirSync(path.join(taskDir, 'src'), { recursive: true });
    writeFileSync(path.join(taskDir, 'src', 'owned.js'), 'export const value = 1;\n');
    writeFileSync(path.join(taskDir, 'src', 'foreign actor.js'), 'export const actor = 1;\n');
    git('add', '--', 'src');
    git('-c', 'user.name=Player Truth Test', '-c', 'user.email=player-truth@example.invalid', 'commit', '-qm', 'start');
    writeFileSync(path.join(taskDir, 'src', 'foreign actor.js'), 'export const actor = 2;\n');
    const start = readSourceState(taskDir);
    writeFileSync(path.join(taskDir, 'src', 'owned.js'), 'export const value = 2;\n');
    git('add', '--', 'src/owned.js');
    git('-c', 'user.name=Player Truth Test', '-c', 'user.email=player-truth@example.invalid', 'commit', '-qm', 'later');
    const end = readSourceState(taskDir);
    const meta = sourceRunMetadata(start, end);
    assert.notEqual(meta.startCommit, meta.endCommit);
    assert.equal(meta.commit, start.commit, 'verdict/contact sheet identify the code at launch');
    assert.equal(meta.dirty, true);
    assert.deepEqual(meta.startDirtySourcePaths, ['src/foreign actor.js']);
    assert.deepEqual(meta.endDirtySourcePaths, ['src/foreign actor.js']);
    const verdict = renderVerdict({ meta, results: [], overall: 'INCOMPLETE' });
    assert(verdict.includes(`Source at start: ${start.commit} · src/foreign actor.js`));
    assert(verdict.includes(`Source at end: ${end.commit} · src/foreign actor.js`));
    assert.equal(readFileSync(path.join(taskDir, 'src', 'foreign actor.js'), 'utf8'), 'export const actor = 2;\n');
  } finally {
    assert.ok(path.resolve(taskDir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    rmSync(taskDir, { recursive: true, force: true });
  }
});

test('unavailable Git source metadata is recorded as unknown rather than clean', () => {
  const taskDir = mkdtempSync(path.join(os.tmpdir(), 'spaceface-player-truth-no-git-'));
  try {
    assert.deepEqual(readSourceState(taskDir), { commit: 'unknown', dirty: null, dirtySourcePaths: null });
  } finally {
    assert.ok(path.resolve(taskDir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    rmSync(taskDir, { recursive: true, force: true });
  }
});
