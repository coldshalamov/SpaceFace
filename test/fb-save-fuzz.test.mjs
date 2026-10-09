// FB-108 — deterministic save fuzzing.
// Runs the seeded mutator in scripts/fb-fuzz-save-envelope.mjs over a real seed-4242
// envelope: bit flips, truncation, type swaps, depth/node/collection bombs, oversized
// payloads, and __proto__ key injection, in both plain-envelope and gzip-wrapper form.
// Every case rides the real import lane (preflight → checksum → migrations → atomic
// restore) and the worker validate lane in the same pass. The contract:
//   * zero thrown exceptions across every lane,
//   * every rejection resolves to a named reason (never a bare false/undefined),
//   * rejected input never runs a restore or mutates live state,
//   * __proto__ injection never pollutes Object.prototype,
//   * the reason histogram covers all eight core validation reasons.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runFuzz, CORE_VALIDATE_REASONS, NAMED_REASONS } from '../scripts/fb-fuzz-save-envelope.mjs';

const SEED = 4242;

test('5000 seeded save-fuzz cases: zero throws, every outcome ok-or-named-reason', { timeout: 240_000 }, async () => {
  const report = await runFuzz({ cases: 5000, seed: SEED });

  assert.equal(report.cases, 5000);
  assert.equal(report.seed, SEED);
  assert.equal(report.exceptions, 0,
    `fuzz threw ${report.exceptions} times: ${JSON.stringify(report.violations.filter((v) => v.kind === 'throw').slice(0, 3))}`);
  assert.equal(report.violationCount, 0,
    `fuzz violations: ${JSON.stringify(report.violations.slice(0, 5))}`);
  assert.ok(report.accepted > 0, 'no case was accepted — the mutator lost its valid baseline');

  // Every rejection carries a reason from the named vocabulary — the assertion lives
  // inside runFuzz (reasonless_reject / unnamed_reason violations); belt-and-suspenders
  // re-check on the histogram keys themselves.
  for (const reason of Object.keys(report.histogram)) {
    if (reason === 'ok') continue;
    assert.ok(NAMED_REASONS.includes(reason), `histogram contains unnamed reason "${reason}"`);
  }

  // The eight core validation reasons must all appear at least once — a missing bucket
  // means the mutator stopped reaching that rejection path.
  for (const reason of CORE_VALIDATE_REASONS) {
    assert.ok(report.histogram[reason] > 0, `core reason "${reason}" never fired — histogram: ${JSON.stringify(report.histogram)}`);
  }
});

test('the fuzz is deterministic — same seed, same histogram', { timeout: 120_000 }, async () => {
  const a = await runFuzz({ cases: 400, seed: SEED });
  const b = await runFuzz({ cases: 400, seed: SEED });
  assert.deepEqual(a.histogram, b.histogram);
  assert.equal(a.accepted, b.accepted);
  assert.equal(a.exceptions, 0);
  assert.equal(b.exceptions, 0);

  const c = await runFuzz({ cases: 400, seed: SEED + 1 });
  assert.notDeepEqual(c.histogram, a.histogram,
    'a different seed produced an identical histogram — the mutator is not seed-sensitive');
});
