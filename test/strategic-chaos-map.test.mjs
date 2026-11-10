import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { START, END, MAP_SECTION, integrateBuildMap, installBuildMap } from '../scripts/lib/strategicChaosMap.mjs';
const original = '<!-- LIFETIME: STABLE -->\n# SpaceFace Build Map\n\nExisting board, claims and unrelated future work.\n';
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sc-board-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
    writeFileSync(join(root, 'build_map.md'), original); git('add', '--', 'build_map.md'); git('commit', '-qm', 'fixture');
    mkdirSync(join(root, 'design/program/strategic-chaos'), { recursive: true });
    writeFileSync(join(root, 'design/program/strategic-chaos/README.md'), 'package');
    fn(root, git);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('additive transform preserves all old content and is idempotent', () => {
  const first = integrateBuildMap(original); assert.equal(first.changed, true);
  assert.equal(first.text.replace('\n' + MAP_SECTION + '\n', ''), original);
  assert.deepEqual(integrateBuildMap(first.text), { changed: false, text: first.text });
});
test('preserves CRLF and BOM', () => {
  const value = '\uFEFF' + original.replaceAll('\n', '\r\n');
  const result = integrateBuildMap(value).text;
  assert.ok(result.startsWith('\uFEFF')); assert.equal(result.replaceAll('\r\n', '').includes('\n'), false);
});
test('unknown or conflicting board is never rewritten', () => {
  assert.throws(() => integrateBuildMap('# Other\n'), /Unknown/);
  for (const suffix of [START, END, START + '\nchanged\n' + END, MAP_SECTION + '\n' + MAP_SECTION]) {
    assert.throws(() => integrateBuildMap(original + suffix), /differs|malformed/);
  }
});
test('dry-run does not write; explicit apply changes only the live board', () => fixture(root => {
  assert.equal(installBuildMap(root).applied, false); assert.equal(readFileSync(join(root, 'build_map.md'), 'utf8'), original);
  const result = installBuildMap(root, { apply: true }); assert.equal(result.applied, true);
  assert.equal(readFileSync(join(root, 'build_map.md'), 'utf8'), integrateBuildMap(original).text);
  assert.equal(installBuildMap(root, { apply: true }).changed, false);
  assert.equal(existsSync(join(root, 'build_map.md.strategic-chaos.lock')), false);
}));
test('dirty foreign board is protected', () => fixture(root => {
  writeFileSync(join(root, 'build_map.md'), original + 'foreign edit');
  assert.throws(() => installBuildMap(root, { apply: true }), /uncommitted/);
  assert.ok(readFileSync(join(root, 'build_map.md'), 'utf8').endsWith('foreign edit'));
}));
test('staged foreign board is protected', () => fixture((root, git) => {
  writeFileSync(join(root, 'build_map.md'), original + 'staged edit'); git('add', '--', 'build_map.md');
  assert.throws(() => installBuildMap(root, { apply: true }), /uncommitted/);
}));
test('foreign lock is preserved', () => fixture(root => {
  const lock = join(root, 'build_map.md.strategic-chaos.lock'); writeFileSync(lock, 'other owner');
  assert.throws(() => installBuildMap(root, { apply: true }), /EEXIST/);
  assert.equal(readFileSync(lock, 'utf8'), 'other owner'); assert.equal(readFileSync(join(root, 'build_map.md'), 'utf8'), original);
}));
test('unrelated dirty files do not block an exact-path change', () => fixture(root => {
  writeFileSync(join(root, 'foreign.txt'), 'leave me alone');
  assert.equal(installBuildMap(root, { apply: true }).applied, true);
  assert.equal(readFileSync(join(root, 'foreign.txt'), 'utf8'), 'leave me alone');
}));
test('missing package is not linked', () => fixture(root => {
  rmSync(join(root, 'design/program/strategic-chaos/README.md'));
  assert.throws(() => installBuildMap(root, { apply: true }), /Install the package/);
}));
test('symlinked board is not followed', () => fixture(root => {
  rmSync(join(root, 'build_map.md')); writeFileSync(join(root, 'target.md'), original);
  symlinkSync(join(root, 'target.md'), join(root, 'build_map.md'));
  assert.throws(() => installBuildMap(root, { apply: true }), /symlink/);
}));
