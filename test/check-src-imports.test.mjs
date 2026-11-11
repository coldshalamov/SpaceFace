// The import lint exists because `import { pluralWord } from './/numberFormat.js'` parsed fine
// and resolved fine on disk, yet kept its empty segment in the browser's module base URL and
// 404'd the whole graph — every boot dead. These tests spawn the real CLI against fixture
// trees so the exit codes and the file → specifier naming are exercised end to end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'scripts', 'check-src-imports.mjs');

function runLint(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'src-imports-'));
  for (const [name, text] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return dir;
}

test('one fixture tree: the `.//` regression and a missing target fail; bare and .json pass', () => {
  const dir = tree({
    'a.js': 'import { b } from "./b.js";\nimport "three";\nexport const a = b;\n',
    'b.js': 'import { c } from ".//c.js";\nexport const b = c;\n', // c.js EXISTS — on disk this resolves
    'sub/d.js': 'import { m } from "../missing.js";\nexport const d = m;\n',
    'c.js': 'export const c = 1;\n',
    'e.js': 'import data from "./f.json" with { type: "json" };\nexport const e = data;\n',
    'f.json': '{}\n',
  });
  const r = runLint(['--root', dir]);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes(`b.js → './/c.js'`), `names file → specifier, got:\n${r.stderr}`);
  assert.ok(r.stderr.includes(`d.js → '../missing.js'`), `names the missing target, got:\n${r.stderr}`);
  assert.ok(!r.stderr.includes('a.js →'), 'the clean import is not flagged');
  assert.ok(!r.stderr.includes('e.js →'), 'the verbatim .json import is not flagged');
  assert.match(r.stderr, /Failed to fetch dynamically imported module/,
    'the message ties the lint to the boot failure it prevents');
});

test('a clean tree passes and reports its counts', () => {
  const dir = tree({
    'a.js': 'import { b } from "./b.js";\nimport "three";\nexport * from "./b.js";\n',
    'b.js': 'export const b = 1;\n',
    'e.js': 'import data from "./f.json" with { type: "json" };\nexport const e = data;\n',
    'f.json': '{}\n',
    // comment prose must not fake a specifier — the livingHull.js `come from".` false positive
    'doc.js': '/** id from "./not-a-real-file.js" — where did this come from". */\n'
      + '// import "./also-gone.js" stays a comment\nexport const d = 1;\n',
  });
  const r = runLint(['--root', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /OK — 4 modules, 3 relative specifiers resolve/);
});

test('mid-path dot and backslash specifiers are flagged even when they resolve on disk', () => {
  const dir = tree({
    'a/x.js': 'export const x = 1;\n',
    'g.js': 'import { x } from "./a/./x.js";\nimport { y } from ".\\a\\x.js";\nexport { x, y };\n',
  });
  const r = runLint(['--root', dir]);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes(`'./a/./x.js'`), r.stderr);
  assert.ok(r.stderr.includes(`'.\\a\\x.js'`), r.stderr);
});

test('a missing --root directory is a hard error, never a silent pass', () => {
  const r = runLint(['--root', join(tmpdir(), 'definitely-not-here-src-imports')]);
  assert.notEqual(r.status, 0);
  const bare = runLint(['--root']);
  assert.equal(bare.status, 2);
});
