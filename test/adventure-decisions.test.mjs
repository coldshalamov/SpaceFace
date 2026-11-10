// PQ-177.05 — an interesting decision has two viable options and two different tradeoffs.
// The fun-loop measurer prints the count per hour on the fixed reference route. The bar is 6.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { isInterestingDecision } from '../src/ui/adventureDecisions.js';

test('a decision counts only when two viable options name different stakes', () => {
  assert.equal(isInterestingDecision({
    options: [
      { tradeoff: 'Sell now for 80 cr. The later price is given up.', stake: 'sell:80', viable: true },
      { tradeoff: 'Hold it. The forecast is 140 cr, and it can still miss.', stake: 'hold:140', viable: true },
    ],
  }), true);
  assert.equal(isInterestingDecision({
    options: [
      { tradeoff: 'Sell now for 80 cr. The later price is given up.', stake: 'sell:80', viable: true },
    ],
  }), false);
  assert.equal(isInterestingDecision({
    options: [
      { tradeoff: 'Same deal either way, pay does not change.', stake: 'same', viable: true },
      { tradeoff: 'Same deal either way, pay does not change.', stake: 'same', viable: true },
    ],
  }), false);
  assert.equal(isInterestingDecision({
    options: [
      { tradeoff: 'Pays 400 cr · risk 0 · no collateral', stake: '400:0', viable: true },
      { tradeoff: '', stake: '900:3', viable: true },
    ],
  }), false);
});

test('the fun-loop measurer prints at least 6 interesting decisions per hour on the reference route', () => {
  // Receipts go to a temp dir: the test must not dirty the repo's receipts drawer.
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'sf-adventure-decisions-'));
  const run = spawnSync(process.execPath, [
    'scripts/measure-fun-loop.mjs',
    '--adventure',
    '--json',
    '--seeds=4242,8008',
    '--out', outDir,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.bench, 'adventure');
  assert.equal(payload.pass, true, JSON.stringify(payload.results));
  for (const result of payload.results) {
    assert.ok(
      result.interestingDecisionsPerHour >= 6,
      `seed ${result.seed} produced ${result.interestingDecisionsPerHour}/h (${JSON.stringify(result.byKind)})`,
    );
    assert.ok(result.count >= 6, `seed ${result.seed}`);
    for (const decision of result.decisions) {
      assert.equal(decision.options.length >= 2, true, decision.id);
      const texts = new Set(decision.options.map((option) => option.tradeoff));
      assert.equal(texts.size, decision.options.length, decision.id);
      for (const option of decision.options) {
        assert.ok(option.tradeoff.length >= 8, decision.id);
      }
    }
  }
});
