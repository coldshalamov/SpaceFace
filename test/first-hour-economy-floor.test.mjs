import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { ECONOMY_PRICE_TUNING, economy } from '../src/systems/economy.js';

const HELIOS = 'station_helios';
const IRON = 'cmdty_ore_iron';
const TAUGHT_ORE_UNITS = 3;
// Re-denominated 2026-09-19 (owner-delegated ruling): the authored 180 CR floor was
// fixed at the pre-derived economy's prices (base 28 × 3 units × ~2.14 raw multiple).
// The derived price scale halved base prices (28 → 14), so the absolute number is
// dead notation. The surviving law is the MULTIPLE: even at Helios — deliberately
// the worst taught market (factor 0.09) — a fresh-seed sale of the taught lot must
// clear well above raw base value. The loop must teach "sell where it's bought,"
// and even the worst market pays. The derived curve delivers ~1.9×; the law holds
// at 1.75×.
const TAUGHT_SALE_RAW_MULTIPLE = 1.75;

function taughtFloorCr(ironBasePrice) {
  return Math.ceil(ironBasePrice * TAUGHT_ORE_UNITS * TAUGHT_SALE_RAW_MULTIPLE);
}

function withEconomy(seed, check) {
  const sim = createSimulation({ seed, systems: [economy], updateOrder: [] });
  try {
    return check(sim.registry.get('economy'), sim.state);
  } finally {
    sim.dispose();
    economy._instance = null;
  }
}

test('the taught three-unit iron haul clears the raw-base multiple at the worst taught market', () => {
  const ironDef = COMMODITIES.find((commodity) => commodity.id === IRON);
  const floor = taughtFloorCr(ironDef.basePrice);
  let worst = { seed: null, total: Infinity };
  for (let seed = 1; seed <= 512; seed++) {
    const quote = withEconomy(seed, (econ) => econ.quote(HELIOS, IRON, 'sell', TAUGHT_ORE_UNITS));
    assert.equal(quote.ok, true, `seed ${seed} should expose the taught iron sale`);
    if (quote.total < worst.total) worst = { seed, total: quote.total };
  }
  assert.ok(
    worst.total >= floor,
    `fresh-game worst sale ${worst.total} CR at seed ${worst.seed} fell below the`
    + ` ${TAUGHT_SALE_RAW_MULTIPLE}× raw-base floor (${floor} CR at base ${ironDef.basePrice})`,
  );
});

test('the starter floor is an isolated Helios equilibrium, not a commodity repricing', () => {
  const heliosData = SECTORS
    .flatMap((sector) => sector.stations || [])
    .find((station) => station.id === HELIOS);
  const ironDef = COMMODITIES.find((commodity) => commodity.id === IRON);

  // Derived price scale (2026-09-19): base 14, was 28 pre-derivation. The Helios
  // isolation factor is authored design and unchanged.
  assert.equal(ironDef.basePrice, 14);
  assert.deepEqual(heliosData.marketEquilibriumFactors, { [IRON]: 0.09 });

  withEconomy(47, (econ, state) => {
    const heliosMarket = econ.ensureMarket(HELIOS);
    const ceresMarket = econ.ensureMarket('station_ceres');
    // Isolation control: Tethys is the other large station with no authored market
    // factors — copper must price identically there, proving the 0.09 factor is
    // iron-at-Helios only (the derived model computes per-commodity equilibria, so
    // the old literal default-eq pin is dead notation).
    const tethysMarket = econ.ensureMarket('station_tethys');
    const largeBaseEq = ECONOMY_PRICE_TUNING.baseEqDefault * ECONOMY_PRICE_TUNING.sizeFactor.L;
    const mediumBaseEq = ECONOMY_PRICE_TUNING.baseEqDefault * ECONOMY_PRICE_TUNING.sizeFactor.M;

    assert.equal(heliosMarket[IRON].equilibrium, largeBaseEq * 0.09);
    assert.equal(heliosMarket.cmdty_ore_copper.equilibrium, tethysMarket.cmdty_ore_copper.equilibrium,
      'an unrelated Helios listing keeps the ordinary neutral equilibrium (identical to the control station)');
    assert.equal(ceresMarket[IRON].equilibrium,
      mediumBaseEq * ECONOMY_PRICE_TUNING.roleFactor.consume,
      'the same commodity keeps its ordinary consumer equilibrium elsewhere');
    assert.equal(state.economy.markets[HELIOS][IRON].role, 'consume');
  });
});
