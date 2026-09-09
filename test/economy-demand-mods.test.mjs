import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import {
  DEMAND_MULTIPLIER_BOUNDS,
  applyPersistentDemand,
  effectiveDemandFor,
} from '../src/economy/demandModel.js';

const commodity = (id) => {
  const def = COMMODITIES.find((entry) => entry.id === id);
  assert.ok(def, `fixture commodity ${id} exists`);
  return def;
};

function stateFor({ war = false, blockade = false, surplus = false } = {}) {
  const node = {
    danger: blockade ? 0.78 : 0.35,
    pricePressure: blockade ? 0.62 : (surplus ? -0.24 : 0),
    influence: { faction_scn: 0.55, faction_reach: 0.45 },
    dominantFactionId: 'faction_scn',
    dominantInfluence: 0.55,
    contestMargin: 0.10,
    trend: { danger: 0, pricePressure: 0, influence: 0 },
    driver: {
      danger: blockade ? 'infrastructure_disruption' : 'structural_baseline',
      pricePressure: blockade ? 'infrastructure_disruption' : (surplus ? 'route_surplus' : 'market_balance'),
      influence: 'territorial_anchor',
    },
  };
  return {
    conflicts: war
      ? { 'faction_reach:faction_scn': { state: 'war', tension: 90 } }
      : { 'faction_reach:faction_scn': { state: 'cold', tension: 0 } },
    sectorSim: { field: { nodes: { sector_helios_prime: node } } },
    world: { sectors: { sector_helios_prime: { owner: 'faction_scn' } } },
  };
}

test('calm sectors apply no persistent commodity demand modifier', () => {
  const result = effectiveDemandFor({
    state: stateFor(),
    sectorId: 'sector_helios_prime',
    commodity: commodity('cmdty_weapons'),
  });
  assert.equal(result.multiplier, 1);
  assert.deepEqual(result.drivers, []);
  assert.equal(applyPersistentDemand(250, result), 250);
});

test('war demand is commodity-specific and legible', () => {
  const state = stateFor({ war: true });
  const weapons = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_weapons') });
  const medical = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_medical') });
  const fuel = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_fuel_cells') });
  const ore = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_ore_iron') });

  assert.ok(weapons.multiplier > medical.multiplier && medical.multiplier > 1,
    'war should value weapons most and medical supplies materially');
  assert.ok(fuel.multiplier > 1, 'war should create a fuel premium');
  assert.equal(ore.multiplier, 1, 'unrelated raw ore should not receive a generic war premium');
  assert.match(weapons.drivers.map((driver) => driver.label).join(' '), /war/i);
  assert.ok(weapons.drivers.every((driver) => driver.direction === 'up' && driver.explanation),
    'every visible driver carries direction and a plain-language explanation');
});

test('a blockade raises relief demand while suppressing discretionary goods', () => {
  const state = stateFor({ blockade: true });
  const medical = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_medical') });
  const food = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_food') });
  const fuel = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_fuel_cells') });
  const consumer = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_consumer_goods') });
  const luxury = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_luxury_goods') });

  assert.ok(medical.multiplier > 1 && food.multiplier > 1 && fuel.multiplier > 1);
  assert.ok(consumer.multiplier < 1 && luxury.multiplier < 1);
  assert.ok(medical.drivers.some((driver) => driver.id === 'blockade-relief'));
});

test('persistent demand is deterministic, bounded, and never compounds on repeat reads', () => {
  const state = stateFor({ war: true, blockade: true });
  const args = { state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_medical') };
  const previousRandom = Math.random;
  const previousNow = Date.now;
  Math.random = () => { throw new Error('demand model must not use Math.random'); };
  Date.now = () => { throw new Error('demand model must not use wall time'); };
  try {
    const first = effectiveDemandFor(args);
    const second = effectiveDemandFor(args);
    assert.deepEqual(second, first);
    assert.ok(first.multiplier >= DEMAND_MULTIPLIER_BOUNDS.min && first.multiplier <= DEMAND_MULTIPLIER_BOUNDS.max);
    assert.equal(applyPersistentDemand(100, first), applyPersistentDemand(100, second));
  } finally {
    Math.random = previousRandom;
    Date.now = previousNow;
  }
});

test('averaged sector surplus can express an industrial expansion without a per-entity simulation', () => {
  const state = stateFor({ surplus: true });
  const component = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_comp_hullplate') });
  const refined = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_refined_metals') });
  const luxury = effectiveDemandFor({ state, sectorId: 'sector_helios_prime', commodity: commodity('cmdty_luxury_goods') });

  assert.ok(component.multiplier > 1 && refined.multiplier > 1);
  assert.equal(luxury.multiplier, 1);
  assert.ok(component.drivers.some((driver) => driver.id === 'industrial-expansion'));
});
