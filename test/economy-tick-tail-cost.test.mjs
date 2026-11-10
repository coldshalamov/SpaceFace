import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { allRegionalPressureRecipes } from '../src/economy/regionalSupply.js';
import { economy } from '../src/systems/economy.js';

const REGIONAL_RECIPES = Object.values(allRegionalPressureRecipes()).flat();

function bootPopulatedEconomy(seed = 0xEC07_A11) {
  const sim = createSimulation({ seed, systems: [economy] });
  const state = sim.state;
  const econ = sim.registry.get('economy');
  econ.newGame();
  for (const sector of SECTORS) {
    econ.populateSector({ sectorId: sector.id, sector });
  }
  return { sim, state, econ };
}

function economySnapshot(state) {
  return JSON.parse(JSON.stringify(state.economy));
}

function installLegacyRegionalSupply(econ) {
  econ.applyRegionalSupply = function legacyRegionalSupply(tickDt) {
    const minuteShare = Math.max(0, Number(tickDt) || 0) / 60;
    if (!(minuteShare > 0)) return;
    for (const recipe of REGIONAL_RECIPES) {
      if (!recipe.stationId || !(recipe.units > 0)) continue;
      this.applyStockPressure(
        recipe.stationId,
        recipe.commodityId,
        recipe.role === 'consume' ? 'buy' : 'sell',
        recipe.units * minuteShare,
      );
    }
  };
}

test('regional pressure shares the economy tick derived pass without changing state', () => {
  const optimized = bootPopulatedEconomy();
  const legacy = bootPopulatedEconomy();
  installLegacyRegionalSupply(legacy.econ);
  const boundaryRecipe = REGIONAL_RECIPES.find((recipe) =>
    optimized.state.economy.cycles[recipe.stationId]?.[recipe.commodityId]);
  assert.ok(boundaryRecipe, 'expected one regional listing with a live cycle');
  for (const run of [optimized, legacy]) {
    run.state.economy.cycles[boundaryRecipe.stationId][boundaryRecipe.commodityId].regimeEndT = 15;
  }
  const missingCycleRecipe = REGIONAL_RECIPES.find((recipe) =>
    recipe !== boundaryRecipe
    && optimized.state.economy.cycles[recipe.stationId]?.[recipe.commodityId]);
  assert.ok(missingCycleRecipe, 'expected another regional listing for lazy cycle creation');
  for (const run of [optimized, legacy]) {
    delete run.state.economy.cycles[missingCycleRecipe.stationId][missingCycleRecipe.commodityId];
  }

  let insideRegionalSupply = false;
  let regionalLivePriceRefreshes = 0;
  let regionalLiveHistoryRefreshes = 0;
  const applyRegionalSupply = optimized.econ.applyRegionalSupply;
  const recomputeLivePrices = optimized.econ.recomputeLivePrices;
  const recordLivePriceHistory = optimized.econ.recordLivePriceHistory;
  optimized.econ.applyRegionalSupply = function measuredRegionalSupply(...args) {
    insideRegionalSupply = true;
    try {
      return applyRegionalSupply.apply(this, args);
    } finally {
      insideRegionalSupply = false;
    }
  };
  optimized.econ.recomputeLivePrices = function measuredLivePrices(...args) {
    if (insideRegionalSupply) regionalLivePriceRefreshes++;
    return recomputeLivePrices.apply(this, args);
  };
  optimized.econ.recordLivePriceHistory = function measuredLiveHistory(...args) {
    if (insideRegionalSupply) regionalLiveHistoryRefreshes++;
    return recordLivePriceHistory.apply(this, args);
  };

  optimized.state.simTime = 15;
  legacy.state.simTime = 15;
  optimized.econ.econTick(5, optimized.state);
  legacy.econ.econTick(5, legacy.state);

  assert.equal(regionalLivePriceRefreshes, 0,
    'regional stock pressure must not recompute a quote that the owning listing pass immediately replaces');
  assert.equal(regionalLiveHistoryRefreshes, 0,
    'regional stock pressure must record its observation in the owning listing pass');
  assert.deepEqual(economySnapshot(optimized.state), economySnapshot(legacy.state),
    'coalescing derived work must preserve stock, quotes, history, cycles, clocks, events, and RNG state');
});

test('one economy tick reuses demand projections for matching sector listings', () => {
  const { state, econ } = bootPopulatedEconomy(0xEC07_A12);
  const refreshListingDemand = econ.refreshListingDemand;
  const seenProjectionCaches = new Set();
  let listingRefreshes = 0;
  econ.refreshListingDemand = function measuredDemandRefresh(...args) {
    listingRefreshes++;
    const projectionCache = args[4];
    if (projectionCache instanceof Map) seenProjectionCaches.add(projectionCache);
    return refreshListingDemand.apply(this, args);
  };

  state.simTime = 5;
  econ.econTick(5, state);

  assert.equal(seenProjectionCaches.size, 1,
    'the listing pass must share one tick-local demand projection cache');
  const [projectionCache] = seenProjectionCaches;
  const projectionCount = [...projectionCache.values()]
    .reduce((sum, sectorCache) => sum + sectorCache.size, 0);
  assert.ok(projectionCount > 0);
  assert.ok(projectionCount < listingRefreshes,
    `expected fewer sector/commodity projections than ${listingRefreshes} listing refreshes`);
});
