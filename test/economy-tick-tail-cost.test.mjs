import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';

// ECON-BUILD-1 note: the closed-form market model deleted the old tick's per-listing cycle
// pass this file used to measure — `state.economy.cycles`, `applyRegionalSupply`,
// `recomputeLivePrices`-as-listing-pass, and `recordLivePriceHistory` are gone. Regional
// pressure recipes now only gate which listings a station mints; periodic stock work is
// authored conveyor lines through the same applyStockPressure single-writer path every
// other write takes, so there is no second derived pass to coalesce. What survives to
// measure is the demand-projection share: one refresh pass must not re-derive the sector
// signal per listing.

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

test('one refresh pass reuses one demand projection for matching sector listings', () => {
  const { state, econ } = bootPopulatedEconomy(0xEC07_A12);
  const refreshListingDemand = econ.refreshListingDemand;
  const projectorsPerStation = new Map();
  let listingRefreshes = 0;
  econ.refreshListingDemand = function measuredDemandRefresh(entry, def, stationId, info, projector) {
    listingRefreshes++;
    if (typeof projector === 'function') {
      if (!projectorsPerStation.has(stationId)) projectorsPerStation.set(stationId, new Set());
      projectorsPerStation.get(stationId).add(projector);
    }
    return refreshListingDemand.apply(this, arguments);
  };

  econ.refreshAllPersistentDemand();

  assert.ok(listingRefreshes > 0, 'the persistent refresh touches real listings');
  assert.ok(projectorsPerStation.size > 0, 'the refresh runs through the shared projection seam');
  for (const [stationId, projectors] of projectorsPerStation) {
    assert.equal(projectors.size, 1,
      `station ${stationId} must share one pass-local sector projection across its listings`);
  }
});

