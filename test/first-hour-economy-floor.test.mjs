import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { ECONOMY_PRICE_TUNING, economy } from '../src/systems/economy.js';

const HELIOS = 'station_helios';
const IRON = 'cmdty_ore_iron';
const TAUGHT_ORE_UNITS = 3;
const TAUGHT_SALE_FLOOR_CR = 180;

function withEconomy(seed, check) {
  const sim = createSimulation({ seed, systems: [economy], updateOrder: [] });
  try {
    return check(sim.registry.get('economy'), sim.state);
  } finally {
    sim.dispose();
    economy._instance = null;
  }
}

test('the taught three-unit iron haul clears the Helios 180 CR floor across fresh-game seeds', () => {
  let worst = { seed: null, total: Infinity };
  for (let seed = 1; seed <= 512; seed++) {
    const quote = withEconomy(seed, (econ) => econ.quote(HELIOS, IRON, 'sell', TAUGHT_ORE_UNITS));
    assert.equal(quote.ok, true, `seed ${seed} should expose the taught iron sale`);
    if (quote.total < worst.total) worst = { seed, total: quote.total };
  }
  assert.ok(
    worst.total >= TAUGHT_SALE_FLOOR_CR,
    `fresh-game floor fell to ${worst.total} CR at seed ${worst.seed}`,
  );
});

test('the starter floor is an isolated Helios equilibrium, not a commodity repricing', () => {
  const heliosData = SECTORS
    .flatMap((sector) => sector.stations || [])
    .find((station) => station.id === HELIOS);
  const ironDef = COMMODITIES.find((commodity) => commodity.id === IRON);

  assert.equal(ironDef.basePrice, 28);
  assert.deepEqual(heliosData.marketEquilibriumFactors, { [IRON]: 0.09 });

  withEconomy(47, (econ, state) => {
    const heliosMarket = econ.ensureMarket(HELIOS);
    const ceresMarket = econ.ensureMarket('station_ceres');
    const largeBaseEq = ECONOMY_PRICE_TUNING.baseEqDefault * ECONOMY_PRICE_TUNING.sizeFactor.L;
    const mediumBaseEq = ECONOMY_PRICE_TUNING.baseEqDefault * ECONOMY_PRICE_TUNING.sizeFactor.M;

    assert.equal(heliosMarket[IRON].equilibrium, largeBaseEq * 0.09);
    assert.equal(heliosMarket.cmdty_ore_copper.equilibrium, largeBaseEq,
      'an unrelated Helios listing keeps its ordinary neutral equilibrium');
    assert.equal(ceresMarket[IRON].equilibrium,
      mediumBaseEq * ECONOMY_PRICE_TUNING.roleFactor.consume,
      'the same commodity keeps its ordinary consumer equilibrium elsewhere');
    assert.equal(state.economy.markets[HELIOS][IRON].role, 'consume');
  });
});
