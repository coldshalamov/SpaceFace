// check-economy-freight-causality.mjs — ECON-P2 freight embodiment + conservation gate.
// Runs unit tests + a thin pure-invariant pass. No package.json edit required (run directly).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCargoManifest,
  buildArrivalIntent,
  buildLossIntent,
  pressureShareRecipe,
  abstractBaselineVolume,
  scaleVolume,
  filterNewFreightIntents,
  mergeAppliedFreightIds,
  isPlainSerializable,
  FREIGHT_CAUSE,
  FREIGHT_MARKET_KEYS_FALLBACK,
} from '../src/economy/freightCausality.js';
import { normalizeKind, HEADLINE_TEMPLATES } from '../src/data/newsTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

assert.equal(typeof window, 'undefined', 'this check must run headless');

function runNodeTest() {
  const r = spawnSync(
    process.execPath,
    ['--test', 'test/economy-freight-causality.test.mjs'],
    { cwd: root, encoding: 'utf8' },
  );
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  assert.equal(r.status, 0, 'economy-freight-causality unit tests must pass');
}

function checkPureInvariants() {
  // No Math.random in pure path
  const r0 = Math.random;
  Math.random = () => { throw new Error('Math.random'); };
  try {
    const m = buildCargoManifest({
      seed: 42,
      freighterKey: 'check_hauler',
      role: 'hauler',
      marketKeys: FREIGHT_MARKET_KEYS_FALLBACK.slice(),
    });
    assert.ok(m.totalQty > 0);
    assert.ok(isPlainSerializable(m));

    const m2 = buildCargoManifest({
      seed: 42,
      freighterKey: 'check_hauler',
      role: 'hauler',
      marketKeys: FREIGHT_MARKET_KEYS_FALLBACK.slice(),
    });
    assert.deepEqual(m, m2, 'stable manifest');

    const arrival = buildArrivalIntent({
      seed: 42, freighterKey: 'check_hauler', stationId: 'st_a', dockSeq: 0, manifest: m,
    });
    const loss = buildLossIntent({
      seed: 42, freighterKey: 'check_hauler', stationId: 'st_a', seq: 1, manifest: m,
    });
    assert.equal(arrival.cause, FREIGHT_CAUSE.ARRIVAL);
    assert.equal(loss.cause, FREIGHT_CAUSE.LOSS);
    assert.ok(isPlainSerializable(arrival));
    assert.ok(isPlainSerializable(loss));

    let applied = mergeAppliedFreightIds([], [arrival, loss]);
    assert.equal(filterNewFreightIntents([arrival, loss], applied).length, 0);

    // Conservation envelope
    for (const live of [0, 10, 50, 100, 500]) {
      const recipe = pressureShareRecipe({ baselineVolume: 100, liveVolume: live });
      assert.ok(recipe.totalVolume <= 100 + 1e-9, 'live+abstract ≤ baseline');
    }

    const baseline = abstractBaselineVolume({ lanePressure: 0.3, days: 0.25, goodsCount: 3 });
    assert.ok(baseline > 0);
    const recipe = pressureShareRecipe({ baselineVolume: baseline, liveVolume: Math.floor(baseline / 2) });
    const scaled = scaleVolume(10, recipe.abstractScale);
    assert.ok(Math.abs(scaled) <= 10);

    assert.equal(normalizeKind('freight_loss'), 'freight_loss');
    assert.equal(normalizeKind('freight_arrival'), 'freight_arrival');
    assert.ok(HEADLINE_TEMPLATES.freight_loss.length >= 1);
    assert.ok(HEADLINE_TEMPLATES.freight_arrival.length >= 1);
  } finally {
    Math.random = r0;
  }
}

runNodeTest();
checkPureInvariants();
console.log('Economy-freight-causality checks OK');
