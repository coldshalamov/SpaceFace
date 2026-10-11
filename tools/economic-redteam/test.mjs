// Economic red team proofs.
//   node --test tools/economic-redteam/test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { FAMILY_IDS, probeFamilies } from './families.mjs';
import { ACTION_IDS } from './grammar.mjs';
import {
  bayCashVerdict,
  closedWashVerdict,
  replayVerdict,
  stockFloorVerdict,
} from './invariants.mjs';
import { runSearch } from './search.mjs';
import { runStrategies } from './strategies.mjs';
import { restoreFeatureMaps } from './runtime.mjs';

test('closed wash, bay launder, stock floor, and replay invariants', () => {
  assert.equal(closedWashVerdict({ creditsDelta: 16, stockDelta: 0, cargoDelta: 0 }).exploit, true);
  assert.equal(closedWashVerdict({ creditsDelta: -40, stockDelta: 0, cargoDelta: 0 }).exploit, false);
  assert.equal(closedWashVerdict({ creditsDelta: 100, stockDelta: 5, cargoDelta: 0 }).exploit, false);
  assert.equal(bayCashVerdict({ creditsDelta: 33, legality: 'legal', fineDelta: 0 }).exploit, false);
  assert.equal(bayCashVerdict({ creditsDelta: 193, legality: 'contraband', fineDelta: 0 }).exploit, true);
  assert.equal(bayCashVerdict({ creditsDelta: -400, legality: 'contraband', fineDelta: -400 }).exploit, false);
  assert.equal(stockFloorVerdict(1).exploit, false);
  assert.equal(stockFloorVerdict(0.2).exploit, true);
  assert.equal(replayVerdict({ firstDelta: 5, secondDelta: 0 }).exploit, false);
  assert.equal(replayVerdict({ firstDelta: 5, secondDelta: 5 }).exploit, true);
});

test('action grammar names the player verbs', () => {
  for (const id of ['buy', 'sell', 'accept_mission', 'abandon_mission', 'craft', 'loot_drop', 'save_roundtrip', 'sell_ship']) {
    assert.ok(ACTION_IDS.includes(id), id);
  }
});

test('twelve families reproduce or clear against the live writers', () => {
  try {
    const families = probeFamilies(1845);
    assert.equal(families.length, 12);
    assert.deepEqual(families.map((family) => family.id), FAMILY_IDS);

    const wash = families.find((family) => family.id === 'zero_spread_trade_cycles');
    assert.equal(wash.status, 'exploit');
    const allied = wash.traces.find((trace) => trace.name === 'allied_minimized');
    assert.ok(allied.creditsDelta > 0, `allied wash delta ${allied.creditsDelta}`);
    assert.ok(Math.abs(allied.stockDelta || 0) < 1e-6);
    const neutral = wash.controls.find((control) => control.name === 'neutral_standing_is_not_a_wash');
    assert.equal(neutral.pass, true);
    assert.ok(neutral.creditsDelta <= 0);

    const bay = families.find((family) => family.id === 'contraband_relabel');
    assert.equal(bay.status, 'exploit', bay.summary);
    const stolen = bay.traces.find((trace) => trace.name === 'bay_stolen_goods');
    assert.ok(stolen.creditsDelta > 0, `bay delta ${stolen.creditsDelta}`);
    assert.equal(stolen.secondDockDelta <= 0, true);
    for (const control of bay.controls) assert.equal(control.pass, true, control.name);

    const underflow = families.find((family) => family.id === 'station_stock_underflow');
    assert.equal(underflow.status, 'clean');
    assert.ok(underflow.traces[0].stockAfter >= 1);

    const seal = families.find((family) => family.id === 'sealed_refinery_inputs');
    assert.equal(seal.status, 'clean');
    assert.equal(seal.traces[0].ironLeft, 3);
    assert.equal(seal.traces[0].metals, 0);

    const abandon = families.find((family) => family.id === 'abandoned_contract_payout');
    assert.equal(abandon.status, 'clean');

    const skip = families.find((family) => family.id === 'time_skip_passive');
    assert.equal(skip.status, 'clean');
    assert.equal(skip.traces[0].gained, 0);

    const delivery = families.find((family) => family.id === 'delivery_and_resale');
    assert.equal(delivery.status, 'clean');
    for (const control of delivery.controls) assert.equal(control.pass, true, control.name);

    const save = families.find((family) => family.id === 'save_load_first_grant');
    assert.equal(save.status, 'clean');

    const fit = families.find((family) => family.id === 'ship_fit_capacity');
    assert.equal(fit.status, 'clean');
    assert.equal(fit.controls[0].pass, true);

    const custody = families.find((family) => family.id === 'custody_duplication');
    assert.equal(custody.status, 'clean');

    const shipping = families.find((family) => family.id === 'shipping_cancellation');
    assert.equal(shipping.status, 'clean');
    assert.equal(shipping.traces[0].duplicate, true);

    const overflow = families.find((family) => family.id === 'negative_price_overflow');
    assert.equal(overflow.status, 'clean');
    assert.equal(Number.isFinite(overflow.traces[0].credits), true);
  } finally {
    restoreFeatureMaps();
  }
});

test('search runs at least 500 traces across every family', () => {
  try {
    const search = runSearch({
      seed: 77061,
      sequences: 500,
      receiptPath: new URL('./artifacts/search-receipt.json', import.meta.url).pathname,
    });
    assert.equal(search.sequences, 500);
    assert.equal(search.traces.length, 500);
    for (const id of FAMILY_IDS) {
      assert.ok(search.coverage[id] > 0, id);
    }
    const underflow = search.traces.filter((trace) => trace.classification === 'exploit_stock_underflow');
    assert.equal(underflow.length, 0);
  } finally {
    restoreFeatureMaps();
  }
});

test('four honest strategies compare earnings and only flag a feedback loop', () => {
  try {
    const strategies = runStrategies(4242);
    assert.deepEqual(strategies.rows.map((row) => row.id), [
      'legal_trader',
      'miner_refiner',
      'pirate_salvager',
      'careful_smuggler',
    ]);
    assert.ok(strategies.degenerate.includes('pirate_salvager'));
    assert.equal(strategies.rows.find((row) => row.id === 'legal_trader').degenerate, false);
    assert.equal(strategies.rows.find((row) => row.id === 'careful_smuggler').degenerate, false);
    assert.equal(strategies.rows.find((row) => row.id === 'miner_refiner').degenerate, false);
  } finally {
    restoreFeatureMaps();
  }
});
