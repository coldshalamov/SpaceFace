import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { remainingIllicit, stackFine } from '../src/economy/customsRisk.js';
import { COMMODITIES, COMMODITY_FLAVOR } from '../src/data/commodities.js';
import { REGIONAL_ECONOMY_PROFILES } from '../src/data/regionalEconomyProfiles.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';

const SPECIALIZATIONS = Object.freeze({
  cmdty_fuel_cells: ['Refined Fuel Cells', 'Fuel Cells'],
  cmdty_munitions: ['Charge-Case Munitions', 'Munitions'],
  cmdty_crystal_lumin: ['Emitter Crystal', 'Phosphor Crystal'],
  cmdty_luxury_goods: ['Shrine Lanterns', 'Luxury Goods'],
  cmdty_exotic_amazonite: ['Storm-Glass', 'Prism Shard'],
  cmdty_art: ['Pre-Collapse Artifacts', 'Art & Antiques'],
  cmdty_textiles: ['Drifter-Silk', 'Textiles'],
});

const ROUTED_GOODS = Object.freeze([
  'cmdty_ice_water',
  'cmdty_fuel_cells',
  'cmdty_jump_fuel_canister',
  'cmdty_explosive_compound',
  'cmdty_munitions',
  'cmdty_crystal_lumin',
  'cmdty_luxury_goods',
  'cmdty_exotic_amazonite',
  'cmdty_art',
  'cmdty_textiles',
  'cmdty_classified_salvage',
  'cmdty_narcotics',
  'cmdty_stolen_goods',
]);

const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));
const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function regionIdsFor(commodityId, side) {
  return REGIONAL_ECONOMY_PROFILES
    .filter((profile) => profile[side].some((line) => line.commodityId === commodityId))
    .map((profile) => profile.sectorId);
}

function stationsIn(regionIds) {
  return regionIds.flatMap((sectorId) => {
    const sector = SECTOR_BY_ID.get(sectorId);
    return (sector?.stations || []).map((station) => ({ ...station, sectorId }));
  });
}

test('generic catalog rows specialize in place without stranding stable cargo ids', () => {
  for (const [commodityId, [name, legacyName]] of Object.entries(SPECIALIZATIONS)) {
    const commodity = COMMODITY_BY_ID.get(commodityId);
    assert.ok(commodity, commodityId);
    assert.equal(commodity.name, name);
    assert.ok(commodity.legacyNames.includes(legacyName), `${commodityId} keeps its previous player name`);
  }

  for (const commodity of COMMODITIES) {
    const flavor = COMMODITY_FLAVOR[commodity.id];
    assert.ok(flavor?.displayName && flavor?.desc && flavor?.lore, `${commodity.id} has Plan 29 flavor`);
    assert.ok(Number(commodity.volatility) > 0, `${commodity.id} has a volatility tier`);
  }
});

test('every named market good has one profitable fixed-seed route between authored regions', () => {
  const sim = createSimulation({ seed: 58, systems: [economy] });
  try {
    sim.state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
    sim.state.player.credits = 2_000_000;
    sim.state.player.cargo.capVolume = 1_000;
    sim.state.player.cargo.capMass = 1_000;
    const owner = sim.registry.get('economy');
    for (const sector of SECTORS) {
      for (const station of sector.stations || []) owner.ensureMarket(station.id);
    }
    // Let the shipped regional-supply owner establish its authored surplus/scarcity identity.
    // This bounded opening-market window is deterministic and uses the live stock authority.
    owner.applyRegionalSupply(1_200);

    for (const commodityId of ROUTED_GOODS) {
      const producerRegions = regionIdsFor(commodityId, 'produces');
      const consumerRegions = regionIdsFor(commodityId, 'consumes');
      assert.ok(producerRegions.length > 0, `${commodityId} has a producer region`);
      assert.ok(consumerRegions.length > 0, `${commodityId} has a consumer region`);

      const producers = stationsIn(producerRegions);
      const consumers = stationsIn(consumerRegions);
      let best = null;
      for (const source of producers) {
        for (const destination of consumers) {
          if (source.sectorId === destination.sectorId) continue;
          const buy = owner.quote(source.id, commodityId, 'buy', 1);
          const sell = owner.quote(destination.id, commodityId, 'sell', 1);
          if (!buy.ok || !sell.ok) continue;
          const profit = sell.total - buy.total;
          if (!best || profit > best.profit) {
            best = { profit, source: source.id, destination: destination.id };
          }
        }
      }
      assert.ok(best && best.profit > 0, `${commodityId} needs a profitable seeded route: ${JSON.stringify(best)}`);
    }
  } finally {
    sim.dispose();
  }
});

test('three illicit tiers produce distinct live customs exposure profiles', () => {
  const ids = ['cmdty_classified_salvage', 'cmdty_narcotics', 'cmdty_stolen_goods'];
  const profiles = ids.map((commodityId) => {
    const exposed = remainingIllicit({ stacks: [{ commodityId, qty: 1 }], hiddenCapacity: 0 });
    return `${exposed.remainingVolume}:${stackFine({ commodityId, qty: 1 })}`;
  });
  assert.equal(new Set(profiles).size, ids.length, profiles.join(', '));
});
