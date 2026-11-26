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
// signal per listing, and the batched writer seam (applyStockPressure with
// deferDerivedRefresh + a refreshStationDemand drain) must not fork a quote recompute
// per pressure write.

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

test('deferred stock pressure drains through one shared station demand pass', () => {
  const deferred = bootPopulatedEconomy(0xEC07_A13);
  const immediate = bootPopulatedEconomy(0xEC07_A13);

  const stationIds = Object.keys(immediate.state.economy.markets)
    .filter((sid) => Object.keys(immediate.state.economy.markets[sid]).length > 1)
    .slice(0, 2);
  assert.equal(stationIds.length, 2, 'fixture needs two stations with several listings');
  const listingsByStation = new Map(stationIds.map((sid) => [
    sid,
    Object.keys(immediate.state.economy.markets[sid]).slice(0, 3),
  ]));

  // Immediate path: every pressure write restamps its own quote — the forked per-write cost.
  let immediateQuoteStamps = 0;
  const immediateStamp = immediate.econ._stampEntryQuote;
  immediate.econ._stampEntryQuote = function countedStamp(...args) {
    immediateQuoteStamps++;
    return immediateStamp.apply(this, args);
  };
  for (const [sid, cids] of listingsByStation) {
    for (const cid of cids) immediate.econ.applyStockPressure(sid, cid, 'buy', 7);
  }
  assert.ok(immediateQuoteStamps > 0, 'the immediate writer restamps a quote per pressure write');

  // Deferred path: the same writes record dents plus a touched-listing drain — zero quote work.
  let deferredQuoteStamps = 0;
  const deferredStamp = deferred.econ._stampEntryQuote;
  deferred.econ._stampEntryQuote = function countedStamp(...args) {
    deferredQuoteStamps++;
    return deferredStamp.apply(this, args);
  };
  const touchedListings = new Map();
  for (const [sid, cids] of listingsByStation) {
    for (const cid of cids) {
      deferred.econ.applyStockPressure(sid, cid, 'buy', 7, { deferDerivedRefresh: true, touchedListings });
    }
  }
  assert.equal(deferredQuoteStamps, 0,
    'a deferred pressure write must not fork its own quote recompute');
  for (const [sid, cids] of listingsByStation) {
    assert.deepEqual([...(touchedListings.get(sid) || [])].sort(), cids.slice().sort(),
      `the batch records every listing it touched on ${sid}`);
  }

  // The drain is refreshStationDemand: one pass-local sector projector serves every listing.
  const drainProjectors = new Map();
  const drainedListings = new Set();
  const refreshListingDemand = deferred.econ.refreshListingDemand;
  deferred.econ.refreshListingDemand = function measuredDrain(entry, def, sid, info, projector) {
    if (typeof projector === 'function') {
      if (!drainProjectors.has(sid)) drainProjectors.set(sid, new Set());
      drainProjectors.get(sid).add(projector);
    }
    drainedListings.add(`${sid}${def && def.id}`);
    return refreshListingDemand.apply(this, arguments);
  };
  for (const sid of touchedListings.keys()) deferred.econ.refreshStationDemand(sid);
  for (const [sid, projectors] of drainProjectors) {
    assert.equal(projectors.size, 1,
      `station ${sid} drains its batch through one pass-local sector projection`);
  }
  for (const [sid, cids] of listingsByStation) {
    for (const cid of cids) {
      assert.ok(drainedListings.has(`${sid}${cid}`), `the drain reaches ${sid}/${cid}`);
    }
  }

  // The durable pressure record is identical — quotes stay derived, never forked.
  for (const [sid, cids] of listingsByStation) {
    for (const cid of cids) {
      assert.deepEqual(
        deferred.state.economy.markets[sid][cid].dents,
        immediate.state.economy.markets[sid][cid].dents,
        `${sid}/${cid}: deferred and immediate pressure land the same dents`,
      );
    }
  }
});

