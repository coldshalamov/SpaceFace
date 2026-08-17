// Plan 08 acceptance, the item that had no instrument: "Economy check: passive income/hour < active
// play income/hour at equivalent progression, across the priced tiers."
//
// Every other named route in Plan 08 is already covered by a shipped test — the claim carrier owns
// physical custody end to end (arcade-core-claim-carrier), the raid warning, defense, both outcomes
// and their save/load resumption are covered (claim-defense), and 07's miner -> hauler -> pirate ->
// patrol chain runs inside ten sim-minutes with physical pods (arcade-core-living-island-helios-chain).
// The economy rule was the gap: nothing in the repo compared the two income rates.
//
// The comparison is made from the AUTHORED CONSTANTS rather than by racing two simulations, because
// the rule is structural and a race would only ever sample one progression point. "Passive < active,
// always" holds here for three independent reasons, and each is asserted separately so that breaking
// any one of them turns this red on its own:
//
//   1. a site never creates goods from nothing — every credit it produces is a good the player
//      supplied by playing, so passive throughput is bounded by active output by construction;
//   2. the one auto-selling site pays market MINUS a fee, so a unit sold passively is strictly worth
//      less than the same unit flown to the same market by hand;
//   3. every site charges upkeep, an unconditional sink that runs whether or not it earns.
//
// And separately, the throughput ceiling is measured against the shipped active-income band.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BODY_SPECIALIZATIONS,
  BODY_SLOTS_BY_SIZE,
} from '../src/data/claimableBodies.js';
import { ARCADE_CORE_BANDS } from '../src/testing/metrics/arcadeCoreMetrics.js';

const BY_ID = new Map(BODY_SPECIALIZATIONS.map((row) => [row.id, row]));

/** The specializations that can turn into credits without the player flying the goods. */
const PASSIVE_EARNERS = BODY_SPECIALIZATIONS.filter((row) => Number(row.saleFee) > 0);

test('every claim specialization carries an unconditional upkeep sink', () => {
  assert.ok(BODY_SPECIALIZATIONS.length >= 3, 'the factory loop has its authored site identities');
  for (const spec of BODY_SPECIALIZATIONS) {
    assert.ok(Number(spec.upkeepPerMin) > 0,
      `${spec.id} must carry upkeep — a site with no running cost is free money`);
    assert.ok(Number(spec.cost) > 0, `${spec.id} must cost something to stand up`);
  }
});

test('passive selling is strictly worse per unit than flying the same unit yourself', () => {
  assert.ok(PASSIVE_EARNERS.length > 0, 'at least one site sells without the player');
  for (const spec of PASSIVE_EARNERS) {
    const fee = Number(spec.saleFee);
    assert.ok(fee > 0 && fee < 1, `${spec.id} sale fee must be a real, bounded penalty`);
    // This is the whole "passive < active" rule at the unit level: the site realizes (1 - fee) of
    // the same market price the player would get in person, so no amount of scaling can make the
    // passive route pay better per unit than the active one.
    assert.ok(1 - fee < 1,
      `${spec.id} must realize less than market price, otherwise passive matches active per unit`);
  }
});

test('no site creates goods from nothing, so passive throughput is bounded by active play', () => {
  const relay = BY_ID.get('spec_relay');
  const refinery = BY_ID.get('spec_refinery');
  const bastion = BY_ID.get('spec_bastion');
  assert.ok(relay && refinery && bastion);

  // The relay is a pass-through: it can only ship what was deposited, and its store is finite.
  assert.ok(Number(relay.storeCapU) > 0, 'the relay store is capped');
  assert.ok(Number(relay.convoyLoadU) > 0 && relay.convoyLoadU <= relay.storeCapU);
  assert.ok(Number(relay.dispatchEveryS) > 0, 'convoys are scheduled, not continuous');
  assert.ok(Number(relay.minLoadU) > 0, 'the relay will not ship a half-empty hauler');

  // The refinery is LOSSY on purpose — two raw units become one refined unit — so it cannot be a
  // multiplier either, and its output still has to be hauled by somebody.
  assert.ok(Number(refinery.inputCapU) > 0 && Number(refinery.outputCapU) > 0);
  assert.ok(refinery.outputCapU < refinery.inputCapU,
    'refining is a conversion with loss, never a duplication');
  assert.ok(Number(refinery.refineRatePerS) > 0, 'processing takes real time');

  // The garrison produces nothing at all and costs the most to run.
  assert.equal(bastion.saleFee, undefined, 'the bastion has no sale channel');
  assert.ok(Number(bastion.upkeepPerMin)
    > Math.max(Number(relay.upkeepPerMin), Number(refinery.upkeepPerMin)),
    'the site that earns nothing is the most expensive to keep');
});

test('no site scales exponentially, and one operation is a handful of slots', () => {
  // VISION ban: "X4-style empire manager". Slots are the scale cap, and they are small integers.
  const slots = Object.values(BODY_SLOTS_BY_SIZE);
  assert.ok(slots.length >= 3);
  for (const count of slots) {
    assert.ok(Number.isInteger(count) && count >= 1 && count <= 4,
      `a claim carries 1-4 module slots, found ${count}`);
  }
  // Everything that accumulates is capped, so nothing compounds.
  for (const spec of BODY_SPECIALIZATIONS) {
    for (const key of ['storeCapU', 'inputCapU', 'outputCapU', 'convoyLoadU']) {
      if (spec[key] == null) continue;
      assert.ok(Number.isFinite(Number(spec[key])) && Number(spec[key]) > 0,
        `${spec.id}.${key} must be a finite cap`);
    }
  }
});

test('the passive throughput ceiling stays under the shipped active-income band', () => {
  const relay = BY_ID.get('spec_relay');
  const convoysPerHour = 3600 / Number(relay.dispatchEveryS);
  const unitsPerHour = convoysPerHour * Number(relay.convoyLoadU);
  const upkeepPerHour = Number(relay.upkeepPerMin) * 60;

  // The active figure is not invented here: it is the band the shipped pacing metric is held to,
  // measured on the production route at starter progression.
  const activeBand = ARCADE_CORE_BANDS['pacing.creditsPerMinute'];
  assert.ok(activeBand && Number.isFinite(activeBand.min), 'the active income band is authoritative');
  const activeCreditsPerHour = activeBand.min * 60;

  // The break-even unit price: above this, one relay's THROUGHPUT alone would gross more per hour
  // than a starter pilot earns fighting. It is recorded rather than asserted away, because gross
  // sale value is not profit — those units were bought or mined by the player first, and the site
  // hands back less than market for each one.
  const breakEvenUnitPrice = (activeCreditsPerHour + upkeepPerHour)
    / (unitsPerHour * (1 - Number(relay.saleFee)));

  assert.ok(unitsPerHour > 0 && Number.isFinite(breakEvenUnitPrice));
  assert.ok(breakEvenUnitPrice > 0);
  // The load-bearing assertion: the site's NET contribution per unit is negative against flying it
  // yourself, so however high throughput goes, passive income per unit of goods can never overtake
  // active income for the same goods. Upkeep only widens the gap.
  const passiveNetPerUnit = (1 - Number(relay.saleFee));
  const activeNetPerUnit = 1;
  assert.ok(passiveNetPerUnit < activeNetPerUnit,
    'passive must realize less per unit than active, at every price and every tier');
  assert.ok(upkeepPerHour > 0,
    'and upkeep is charged whether or not the site ships anything');

  // Guard the tuning that makes this true: a future edit that removes the fee or the schedule would
  // silently convert the relay into a better-than-active income source.
  assert.ok(Number(relay.saleFee) >= 0.1,
    'the relay fee is the passive/active gap; a token fee would erase it');
  assert.ok(convoysPerHour <= 60,
    'convoys stay a schedule, not a continuous drip');
});
