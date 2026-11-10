// The tier runner is part of the contract now: a moved test file or a renamed npm script must
// fail loudly instead of silently shrinking the fast/route/reference set.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  TIER_NAMES, classifyEntry, packageScripts, parseTierText, readTierFile,
  runEntries, shardEntries, summarize,
} from '../scripts/lib/testTier.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('tier text ignores comments and blank lines and keeps command quoting', () => {
  const entries = parseTierText(`
    # a comment
    test/a.test.mjs

    npm run check:sim
    node scripts/sf.mjs validate "a b.json"
  `);
  assert.deepEqual(entries, [
    'test/a.test.mjs', 'npm run check:sim', 'node scripts/sf.mjs validate "a b.json"',
  ]);
});

test('a shard is 1-based round-robin and covers every entry exactly once', () => {
  const entries = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ command: String(n) }));
  assert.deepEqual(shardEntries(entries, 1, 3).map((e) => e.command), ['0', '3', '6']);
  assert.deepEqual(shardEntries(entries, 2, 3).map((e) => e.command), ['1', '4']);
  assert.deepEqual(shardEntries(entries, 3, 3).map((e) => e.command), ['2', '5']);
  const all = [1, 2, 3].flatMap((shard) => shardEntries(entries, shard, 3)).map((e) => e.command).sort();
  assert.deepEqual(all, ['0', '1', '2', '3', '4', '5', '6']);
  assert.throws(() => shardEntries(entries, 0, 3), /1\.\.N/);
  assert.throws(() => shardEntries(entries, 4, 3), /1\.\.N/);
});

test('entry classification builds the exact command and rejects drift', () => {
  const scripts = packageScripts(ROOT);
  assert.equal(classifyEntry('test/ship-stats.test.mjs', { root: ROOT, scripts }).command,
    'node --test test/ship-stats.test.mjs');
  assert.equal(classifyEntry('npm run check:sim', { root: ROOT, scripts }).command, 'npm run check:sim');
  assert.equal(classifyEntry('node scripts/sf.mjs validate test/47a.inputs.json', { root: ROOT, scripts }).kind, 'node');
  assert.throws(() => classifyEntry('test/does-not-exist.test.mjs', { root: ROOT, scripts }), /missing test file/);
  assert.throws(() => classifyEntry('npm run check:not-a-real-script', { root: ROOT, scripts }), /unknown npm script/);
  assert.throws(() => classifyEntry('node scripts/not-a-real-script.mjs', { root: ROOT, scripts }), /missing node script/);
});

test('every shipped tier entry resolves — the manifests cannot drift silently', () => {
  const scripts = packageScripts(ROOT);
  for (const tier of TIER_NAMES) {
    const { file, entries } = readTierFile(ROOT, tier);
    assert.ok(entries.length > 0, `${tier} tier is empty (${file})`);
    for (const line of entries) {
      assert.doesNotThrow(() => classifyEntry(line, { root: ROOT, scripts }), `${tier}: ${line}`);
    }
  }
  const fast = readTierFile(ROOT, 'fast').entries;
  assert.equal(new Set(fast).size, fast.length, 'fast tier has no duplicate entries');
  assert.equal(fast.length >= 36, true, 'the measured 36-file core must stay in the fast tier');
});

test('a failing entry makes the summary red and a passing entry does not', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-tier-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {} }));
    const entry = (command) => ({ command, kind: 'node', line: command });
    const pass = await runEntries([entry('node -e "process.exit(0)"')], { root, json: true, timeoutMs: 10_000 });
    assert.equal(summarize(pass).ok, true);
    assert.equal(summarize(pass).passed, 1);

    const fail = await runEntries([entry('node -e "process.exit(3)"')], { root, json: true, timeoutMs: 10_000 });
    const summary = summarize(fail);
    assert.equal(summary.ok, false);
    assert.equal(summary.failed, 1);
    assert.equal(summary.failures[0].code, 3);
    assert.equal(summary.failures[0].command, 'node -e "process.exit(3)"');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the reference tier names the append-only tool, not a hand edit', () => {
  const reference = readTierFile(ROOT, 'reference').entries.join('\n');
  assert.doesNotMatch(reference, /\.expected\.json\s*$/m, 'a tier entry must not edit a golden');
  assert.ok(existsSync(join(ROOT, 'scripts/reference.mjs')));
  assert.match(reference, /check:sim/);
});
