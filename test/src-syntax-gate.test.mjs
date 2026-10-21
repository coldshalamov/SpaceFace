// The syntax gate exists because a truncated write to one src module fails the boot import and
// shows the player "Startup could not finish" — and nothing in the check chain parsed the files.
// These tests spawn the real CLI so the vm-module flag requirement is exercised end to end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'scripts', 'check-src-syntax.mjs');
const FLAGS = ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning'];

function runGate(args) {
  return spawnSync(process.execPath, [...FLAGS, SCRIPT, ...args], { encoding: 'utf8' });
}

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'src-syntax-'));
  for (const [name, text] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return dir;
}

test('a malformed module is named and fails the gate', () => {
  const dir = tree({
    'fine.js': 'export const ok = 1;\n',
    'nested/broken.js': 'export const x = 1;\n... [truncated for diff preview]\n',
  });
  const r = runGate(['--root', dir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nested[/\\]broken\.js/);
  assert.match(r.stderr, /Unexpected token/);
  assert.match(r.stderr, /Startup could not finish/, 'the message ties the gate to the player-facing failure');
});

test('a clean tree passes and reports its count', () => {
  const dir = tree({ 'a.js': 'export const a = 1;\n', 'sub/b.mjs': 'import { a } from "../a.js";\n' });
  const r = runGate(['--root', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 modules parse clean/);
});

test('a missing --root directory is a hard error, never a silent pass', () => {
  const r = runGate(['--root', join(tmpdir(), 'definitely-not-here-src-syntax')]);
  assert.notEqual(r.status, 0);
});
