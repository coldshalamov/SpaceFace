import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('../install.mjs', import.meta.url));
function project() {
  const root = mkdtempSync(join(tmpdir(), 'spaceface chronicler installer '));
  mkdirSync(join(root, 'src/core'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  writeFileSync(join(root, 'src/core/eventBus.js'), '// target-owned file\n');
  return root;
}
function invoke(root, ...args) { return spawnSync(process.execPath, [script, root, ...args], { encoding: 'utf8' }); }

test('installer previews without writing, then adds files and accepts identical re-application', () => {
  const root = project();
  try {
    assert.equal(invoke(root).status, 0);
    assert.equal(existsSync(join(root, 'src/systems/chronicler.js')), false);
    assert.equal(invoke(root, '--apply').status, 0);
    assert.equal(existsSync(join(root, 'src/systems/chronicler.js')), true);
    assert.equal(invoke(root, '--apply').status, 0);
    assert.equal(readFileSync(join(root, 'src/core/eventBus.js'), 'utf8'), '// target-owned file\n');
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), '{"private":true,"type":"module"}\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('installer refuses a conflicting destination before any addition', () => {
  const root = project();
  try {
    mkdirSync(join(root, 'src/systems')); writeFileSync(join(root, 'src/systems/chronicler.js'), 'other agent work');
    const result = invoke(root, '--apply'); assert.notEqual(result.status, 0); assert.match(result.stderr, /Conflict/);
    assert.equal(readFileSync(join(root, 'src/systems/chronicler.js'), 'utf8'), 'other agent work');
    assert.equal(existsSync(join(root, 'scripts/test-chronicler.mjs')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('installer refuses destination symlinks instead of writing outside the selected checkout', () => {
  const root = project(), outside = mkdtempSync(join(tmpdir(), 'chronicler outside '));
  try {
    // Junction works without developer-mode symlink privileges on Windows.
    symlinkSync(outside, join(root, 'scripts'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = invoke(root, '--apply'); assert.notEqual(result.status, 0); assert.match(result.stderr, /symlink/);
    assert.equal(existsSync(join(outside, 'test-chronicler.mjs')), false);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
