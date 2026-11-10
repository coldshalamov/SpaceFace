// test/commodity-tiers.test.mjs — ECON-01: market tier classification for all commodities
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMODITIES } from '../src/data/commodities.js';
import { economy } from '../src/systems/economy.js';
import { createGameState } from '../src/core/gameState.js';
import { EventBus } from '../src/core/eventBus.js';

test('ECON-01: all 47 canonical commodities carry an explicit numeric marketTier (0-4)', () => {
  assert.ok(COMMODITIES.length >= 47, `expected at least 47 commodities, got ${COMMODITIES.length}`);
  for (const c of COMMODITIES) {
    assert.equal(
      typeof c.marketTier,
      'number',
      `commodity ${c.id} (${c.name}) must have a numeric marketTier, found: ${typeof c.marketTier}`,
    );
    assert.ok(
      c.marketTier >= 0 && c.marketTier <= 4,
      `commodity ${c.id} marketTier out of range [0, 4]: ${c.marketTier}`,
    );
  }
});

test('ECON-01: seed-4242 tier-0 station seeds no tier-3 goods naturally', () => {
  const state = createGameState(4242);
  const bus = new EventBus();
  const e = Object.create(economy);
  e.init({ state, bus });

  // station_helios is in sector_helios_prime (tier 0)
  const market = e.ensureMarket('station_helios');
  assert.ok(market, 'market should be initialized');

  const seededIds = Object.keys(market);
  assert.ok(seededIds.length > 0, 'tier-0 station should seed tier-0 goods');

  // Find all tier-3 goods in COMMODITIES
  const tier3Commodities = COMMODITIES.filter((c) => c.marketTier === 3);
  assert.ok(tier3Commodities.length > 0, 'tier-3 commodities exist');

  for (const t3 of tier3Commodities) {
    assert.equal(
      seededIds.includes(t3.id),
      false,
      `tier-0 station must NOT naturally list tier-3 good ${t3.id} (${t3.name})`,
    );
  }

  // Tier-0 station must refuse buying tier-3 goods
  const buyQuote = e.quote('station_helios', 'cmdty_quantum_cores', 'buy', 1);
  assert.equal(buyQuote.ok, false);
  assert.equal(buyQuote.reason, 'tier_unavailable');

  // But the player can liquidate deep exploration finds: selling a tier-3 good succeeds
  const sellQuote = e.quote('station_helios', 'cmdty_quantum_cores', 'sell', 1);
  assert.equal(sellQuote.ok, true, 'player should be able to sell tier-3 goods to liquidate finds');
  assert.ok(sellQuote.total > 0, 'sell quote should have positive credit value');
});
