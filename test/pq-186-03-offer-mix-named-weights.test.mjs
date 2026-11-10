import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_TYPES,
  OFFER_MIX,
  POSITIONAL_OFFER_TYPES,
  offerMixWeight,
  validateOfferMix,
} from '../src/data/missions.js';

const SEED = 18603;

test('PQ-186.03 every procedural mission type has a named OFFER_MIX weight on every station row', () => {
  const live = validateOfferMix();
  assert.equal(live.ok, true, live.errors.join('; '));
  assert.equal(POSITIONAL_OFFER_TYPES.length, 10);
  for (const typeId of POSITIONAL_OFFER_TYPES) {
    assert.equal(offerMixWeight(OFFER_MIX.trade_hub, typeId), OFFER_MIX.trade_hub[POSITIONAL_OFFER_TYPES.indexOf(typeId)]);
  }
  assert.equal(offerMixWeight(OFFER_MIX.mining, 'tow_recovery'), OFFER_MIX.mining.tow_recovery);
  assert.equal(offerMixWeight(OFFER_MIX.trade_hub, 'heist_intercept'), 0, 'authored-only types stay off the roll');
  assert.equal(offerMixWeight(OFFER_MIX.trade_hub, 'breakaway_recovery'), 0);
});

test('PQ-186.03 inserting a type without a named weight cannot steal later columns and turns the guard red', () => {
  const trade = OFFER_MIX.trade_hub;
  const cargo = offerMixWeight(trade, 'cargo_delivery');
  const recon = offerMixWeight(trade, 'recon_scan');
  assert.ok(cargo > 0 && recon > 0);

  // The old picker used weights[i] against TYPE_ORDER. Inserting at the head would have assigned
  // cargo's column to the new type and zeroed recon (shifted to index 10 on a 10-long row).
  assert.equal(offerMixWeight(trade, 'inserted_without_name'), 0);
  assert.equal(offerMixWeight(trade, 'cargo_delivery'), cargo, 'cargo keeps its named/positional column');
  assert.equal(offerMixWeight(trade, 'recon_scan'), recon, 'recon is not zeroed by an inserted type');

  const types = [{ type: 'inserted_without_name' }, ...MISSION_TYPES];
  const red = validateOfferMix(OFFER_MIX, types);
  assert.equal(red.ok, false, 'a type with no named weight must fail the guard');
  assert.ok(red.errors.some((line) => line.includes('inserted_without_name')));

  const patched = {};
  for (const [profile, row] of Object.entries(OFFER_MIX)) {
    patched[profile] = Object.assign(row.slice(), row, { inserted_without_name: 0 });
  }
  const green = validateOfferMix(patched, types);
  assert.equal(green.ok, true, green.errors.join('; '));
  console.log(JSON.stringify({
    seed: SEED,
    cargo, recon,
    insertedWeight: offerMixWeight(trade, 'inserted_without_name'),
    guardRed: red.errors.length,
  }));
});
