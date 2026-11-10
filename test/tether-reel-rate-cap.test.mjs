// L-HAND tether feel hardening (seed 4242): the winch reel-rate multiplier was unbounded
// while the spool-length multiplier was capped 1..6. A stacked/corrupt tetherReelRateMult moved
// the joint hundreds of WU per tick (teleport + solver destabilization). This pins the symmetric
// 1..6 cap on the focused policy seam.
import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy, rebasePersistedTetherPolicy } from '../src/combat/attachments.js';
import { createCombatCatalog } from '../src/combat/runtime.js';

const catalog = createCombatCatalog();
const STANDARD = catalog.attachments.get('tether_standard');
const BASE_RATE = STANDARD.reelRate;

function rateOf(mult) {
  return effectiveTetherPolicy(STANDARD, { data: { derived: { tetherReelRateMult: mult } } }).reelRate;
}

test('seed 4242: authored winch rates pass through, stacked/corrupt mults clamp at 6x', () => {
  assert.equal(rateOf(undefined), BASE_RATE);
  assert.equal(rateOf(1), BASE_RATE);
  assert.ok(Math.abs(rateOf(1.8) - BASE_RATE * 1.8) < 1e-9, 'shipped Heavy-Duty Winch 1.8x unchanged');
  assert.equal(rateOf(6), BASE_RATE * 6, '6x is the authored ceiling');
  assert.equal(rateOf(9), BASE_RATE * 6, '9x clamps to the 6x ceiling');
  assert.equal(rateOf(100), BASE_RATE * 6, '100x clamps to the 6x ceiling');
  for (const malformed of ['1.8', true, Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
    assert.equal(rateOf(malformed), BASE_RATE, `malformed ${String(malformed)} fails closed to base`);
  }
});

test('seed 4242: one tick of full-axis reel-in at the cap moves the joint at most 6x base rate', () => {
  const dt = 1 / 60;
  const capped = effectiveTetherPolicy(STANDARD, { data: { derived: { tetherReelRateMult: 100 } } });
  assert.ok(capped.reelRate * dt <= 6 * BASE_RATE * dt + 1e-9);
  assert.equal(capped.reelRate, BASE_RATE * 6);
  // Player units: base 69 WU/s => cap 414 WU/s => 6.9 WU per 60 Hz tick, never hundreds.
  assert.ok(Math.abs(capped.reelRate * dt - 6.9) < 1e-9);
});

test('seed 4242: persisted 100x reelRate rebases to at most 6x base', () => {
  const persisted = { ...(effectiveTetherPolicy(STANDARD, null) || {}), reelRate: BASE_RATE * 100 };
  const rebased = rebasePersistedTetherPolicy(STANDARD, persisted);
  assert.ok(rebased.reelRate <= BASE_RATE * 6 + 1e-9, `got ${rebased.reelRate}`);
});

test('seed 4242: a persisted reelRate re-derives through the 1..6 bound on load', () => {
  // A unit-base def keeps the numbers literal: a saved reelRate N implies multiplier N.
  // strength/payout revisions stay current — the clamp predates them, so a pre-clamp save is
  // indistinguishable by revision and the reel lane must re-derive unconditionally.
  const unit = { id: 'tether_standard', reelRate: 1 };
  const persisted = (reelRate) => ({ reelRate, strengthRevision: 2, payoutRevision: 1 });

  assert.equal(rebasePersistedTetherPolicy(unit, persisted(99)).reelRate, 6,
    'an inflated pre-clamp snapshot clamps at the 6x ceiling');
  assert.equal(rebasePersistedTetherPolicy(unit, persisted(0.4)).reelRate, 1,
    'a sub-base snapshot is corrupt too — the live multiplier floor is 1');
  for (const malformed of ['fast', Number.NaN, Number.POSITIVE_INFINITY, -4, 0, null, undefined]) {
    assert.equal(rebasePersistedTetherPolicy(unit, persisted(malformed)).reelRate, 1,
      `malformed ${String(malformed)} fails closed to the base rate`);
  }

  // A legit shipped multiplier survives bitwise — the rebase stays an identity no-op.
  const legit = persisted(1.8);
  assert.equal(rebasePersistedTetherPolicy(unit, legit), legit,
    'a current 1.8x snapshot is never rewritten');

  // On the real catalog def the original defect — a stacked 100x snapshot — folds to 6x.
  const catalogPersisted = {
    ...(effectiveTetherPolicy(STANDARD, null) || {}),
    reelRate: BASE_RATE * 100,
  };
  assert.equal(rebasePersistedTetherPolicy(STANDARD, catalogPersisted).reelRate, BASE_RATE * 6);
});
