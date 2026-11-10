// Negative guard: no test may evaluate a slice of source text with `new Function`.
//
// The audit's example was new-game-embark-present.test.mjs, which rebuilt the screen's methods
// from a slice of newGame.js. That pins incidental source text, breaks on refactors, and hides
// whether the real module still behaves. The offender is now a real scheduler/screen contract
// test. The remaining rows are an explicit legacy ledger: this test fails on any unlisted
// offender (a new anti-pattern) and on a stale row (the list must shrink when one is converted).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TEST_DIR = join(ROOT, 'test');
const ALLOWLIST = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/source-slice-eval-allowlist.json'), 'utf8'));
const SELF = 'test/source-slice-eval-guard.test.mjs';
const SKIP_DIRS = new Set(['helpers', 'fixtures', 'references']);

// A source slice is any `new Function` body built from a file read or a `.slice()` of a
// source-ish variable. This is deliberately a narrow heuristic: it catches the audit's pattern
// without flagging a fake shader callback or a pure inline expression helper.
function looksLikeSourceSlice(text) {
  if (!text.includes('new Function')) return false;
  return /(?:readFileSync|readFile)\s*\([\s\S]{0,500}?\.(?:js|mjs|cjs)['"]/.test(text)
    || /(?:source|src|code|body|methods|script|text)\s*\.slice\s*\(/.test(text)
    || /new Function\([^;]{0,600}?\.slice\(/s.test(text);
}

function offenders(dir = TEST_DIR, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      offenders(file, out);
      continue;
    }
    if (!entry.name.endsWith('.test.mjs')) continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (rel === SELF) continue;
    if (looksLikeSourceSlice(readFileSync(file, 'utf8'))) out.push(rel);
  }
  return out;
}

test('the audit offender is converted — new-game-embark-present never returns to source slicing', () => {
  const text = readFileSync(join(ROOT, 'test/new-game-embark-present.test.mjs'), 'utf8');
  const code = text.split(/\r?\n/).filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.equal(code.includes('new Function'), false, 'use the real scheduler/screen exports');
  assert.match(code, /armCallbackAfterPresent/, 'the replacement exercises the real exported scheduler');
});

test('no unlisted test evaluates a source slice with new Function', () => {
  const found = offenders().sort();
  const allowed = new Set(ALLOWLIST.files);
  const unexpected = found.filter((file) => !allowed.has(file));
  assert.deepEqual(unexpected, [],
    `new source-slice evaluation is banned. Convert to a real import/behaviour test:\n  ${unexpected.join('\n  ')}`);
});

test('the allowlist is a shrinking ledger, not a dumping ground', () => {
  assert.equal(ALLOWLIST.schema, 'spaceface.sourceSliceEvalAllowlist.v1');
  assert.ok(ALLOWLIST.note.length > 80, 'the ledger explains how to remove a row');
  assert.equal(new Set(ALLOWLIST.files).size, ALLOWLIST.files.length, 'no duplicate allowlist rows');
  assert.equal(ALLOWLIST.files.includes('test/new-game-embark-present.test.mjs'), false);
  const found = new Set(offenders());
  const stale = ALLOWLIST.files.filter((file) => !found.has(file));
  assert.deepEqual(stale, [],
    `stale allowlist rows: the file no longer uses the pattern. Remove the row:\n  ${stale.join('\n  ')}`);
});
