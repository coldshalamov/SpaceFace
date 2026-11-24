// The per-step mint lane (burst fix): construction through spawnEntity is the burst cost
// a wave grant or a corpse-decorator queue translates into. The lane is tick-keyed and
// advisory — request() records the mints its grant implies; deferrable callers drain
// through consumeMint and re-queue what does not fit. Run:
//   node --test test/spawn-budget-mint.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeBudgetApi } from '../src/systems/spawnBudget.js';

function harness(tick = 10, runKind = null) {
  const state = { tick, run: runKind ? { kind: runKind, phase: 'active' } : null };
  return { state, api: makeBudgetApi(state) };
}

test('the mint lane starts full and consumeMint drains it to zero', () => {
  const { api } = harness();
  assert.equal(api.mintCap(), 16);
  assert.equal(api.mintAllowance(), 16);
  assert.equal(api.consumeMint(6), 6);
  assert.equal(api.mintAllowance(), 10);
  // Over-asking grants what fits — the caller re-queues the debt, it is never refused-closed.
  assert.equal(api.consumeMint(20), 10);
  assert.equal(api.mintAllowance(), 0);
  assert.equal(api.consumeMint(1), 0);
});

test('the lane re-zeros on the next sim tick — owed work re-drains, never drops', () => {
  const h = harness(10);
  assert.equal(h.api.consumeMint(16), 16);
  assert.equal(h.api.mintAllowance(), 0);
  h.state.tick = 11;
  assert.equal(h.api.mintAllowance(), 16, 'a new tick re-opens the lane deterministically');
  assert.equal(h.api.consumeMint(4), 4);
});

test('a population grant charges the mint lane — deferred mints see the committed work', () => {
  const h = harness(10);
  const grant = h.api.request(8, 'survival-wave:w1');
  assert.equal(grant, 8);
  assert.equal(h.api.mintAllowance(), 8,
    'the grant implies same-step construction; decoration mints what remains');
  // Releasing slots does not refund mints — the construction was already spent.
  h.api.release('survival-wave:w1');
  assert.equal(h.api.mintAllowance(), 8);
});

test('a denied request charges nothing', () => {
  const h = harness(10);
  h.api.setMax(4);
  h.api.request(4, 'ambient');
  assert.equal(h.api.request(4, 'overflow'), 0);
  assert.equal(h.api.mintAllowance(), 12, 'only granted slots imply mints');
});

test('mintCap is clamped and deterministic', () => {
  const { api } = harness();
  assert.equal(api.setMintCap(4), 4);
  assert.equal(api.mintAllowance(), 4);
  assert.equal(api.setMintCap(999), 64, 'the hard ceiling holds');
  assert.equal(api.setMintCap(0), 1, 'the lane can never be shut to zero');
});
