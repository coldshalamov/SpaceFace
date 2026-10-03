// Row 74 / PB-ECON-A — SF-106 hauler viability re-measure post-D80 + SF-120
// cohort-vs-live reconciliation instrument. Seed-pinned; a single short-horizon run.
import assert from 'node:assert/strict';
import test from 'node:test';

import { runCareerStrategy, assertCareerReceipt, reconcileReceipt } from '../src/balance/careerCohorts.js';

// SF-106: at current HEAD a competent starter hauler earns a useful return through real terms —
// live quotes, live executes, contract freight first, arbitrage as filler. The re-measure at
// three horizons nets positive well above the dead band (30m ≈ +12k net, 405 cr/min), with the
// depletion response visible: spreads collapse on worked lanes and the strategy rotates rather
// than grinding a dead route.
test('SF-106 the starter hauler career is viable through live executes at 30m', () => {
  const r = runCareerStrategy('hauler', { horizonMin: 30 });
  assertCareerReceipt(r);
  assert.equal(r.assertionFails.length, 0, `assertion fails: ${r.assertionFails}`);
  assert.ok(r.endingCapital > r.startingCapital, 'net-positive career window');
  assert.ok((r.completedContracts || 0) > 0, 'real contracts completed through missions authority');
  assert.ok((r.defects || []).length === 0, `defects: ${r.defects}`);
});

// SF-120: every executed loop carries the decision-time projection beside the live result, and
// the receipt reconciles them — the instrument cannot score a profitable-looking career on a
// lane the executable economy never paid for.
test('SF-120 the receipt reconciles projected vs realized economics', () => {
  const r = runCareerStrategy('hauler', { horizonMin: 30 });
  const recon = r.reconciliation;
  assert.ok(recon, 'receipt carries the reconciliation block');
  assert.ok(recon.contractBuysCompared > 0 || recon.compared > 0, 'some executed work compared');
  assert.ok(recon.overstated / Math.max(1, recon.compared) <= 0.34,
    `systematic overpromise: ${recon.overstated}/${recon.compared}`);
  // Loop rows keep both sides for auditability.
  const compared = (r.loops || []).filter((l) =>
    (l.projMargin != null && l.realMargin != null) || l.projBuyTotal != null);
  assert.ok(compared.length > 0, 'loops record the projection beside the executed result');
});

// The instrument must catch the bug class it exists for: feed it a receipt whose projections
// lied and confirm it names the overstatement.
test('SF-120 a fabricated receipt with overpromising projections is flagged', () => {
  const fake = {
    loops: [
      { loop: 1, projMargin: 10, realMargin: -2 },
      { loop: 2, projMargin: 10, realMargin: -1 },
      { loop: 3, projMargin: 10, realMargin: 0 },
      { loop: 4, projMargin: 10, realMargin: -4 },
    ],
  };
  const recon = reconcileReceipt(fake);
  assert.equal(recon.compared, 4);
  assert.equal(recon.overstated, 4, 'every projected-positive loop paid below cost');
  assert.ok(recon.worstOverstatePct >= 1);
  const r = { career: 'hauler', loops: fake.loops, reconciliation: recon,
    endingCapital: 6000, startingCapital: 5000, completedLoops: 4, creditsPerMin: 33,
    horizonS: 1800, time: { simS: 1700, travelS: 900, actionS: 100 },
    loadoutViability: { viable: true } };
  assertCareerReceipt(r);
  assert.ok(r.assertionFails.some((f) => f.startsWith('projection_systematic_overstate')),
    `expected overstate failure, got ${JSON.stringify(r.assertionFails)}`);
});
