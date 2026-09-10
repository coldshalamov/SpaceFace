// PQ-177.02 — leftover supply-chain on the Orbital market inspector. Headless.
// Inputs come from COMMODITIES + the live Ceres station record / entity, not invented roles.
import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { resolveDockStationType } from '../src/ui/station/screens/market.js';
import {
  cleanStationRole,
  marketQuoteHtml,
  marketRowHtml,
  presentSupplyChain,
} from '../src/ui/views/marketPresentation.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const IRON = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');
const CERES = SECTORS.flatMap((sec) => sec.stations || []).find((st) => st.id === 'station_ceres');
const BELT = SECTORS.flatMap((sec) => sec.stations || []).find((st) => st.id === 'station_beltout');

function liveStationEntity(record) {
  // Same fields world.js stamps when it spawns a catalog station.
  return {
    type: 'station',
    data: {
      stationId: record.id,
      stationTypeId: record.type,
      name: record.name,
      size: record.size,
      services: record.services || [],
    },
  };
}

function dockedState(record) {
  return {
    ui: { dockedStationId: record.id },
    entityList: [liveStationEntity(record)],
  };
}

test('catalog Iron Ore and Ceres Refinery are the live leftover inputs', () => {
  assert.ok(IRON, 'cmdty_ore_iron is in COMMODITIES');
  assert.equal(IRON.name, 'Iron Ore');
  assert.deepEqual(IRON.producedBy, ['mining']);
  assert.deepEqual(IRON.consumedBy, ['refinery', 'trade_hub']);
  assert.ok(CERES, 'station_ceres is in SECTORS');
  assert.equal(CERES.name, 'Ceres Refinery');
  assert.equal(CERES.type, 'refinery');
  assert.ok(IRON.consumedBy.includes(CERES.type), 'Ceres type is an Iron Ore consumer in the catalog');
  assert.ok(BELT && BELT.type === 'mining', 'Belt Outpost is the leftover mining berth');
});

test('selected Iron Ore inspector paints producedBy → consumedBy and that Ceres buys it', () => {
  const stationType = resolveDockStationType(dockedState(CERES));
  assert.equal(stationType, CERES.type, 'live entity stationTypeId is the catalog type');
  assert.equal(stationType, 'refinery');
  assert.ok(IRON.consumedBy.includes(stationType), 'this leftover dock buys leftover ore');

  const row = marketRowHtml({
    id: IRON.id,
    name: IRON.name,
    category: IRON.category,
    buy: IRON.basePrice,
    sell: IRON.basePrice,
    stock: 0,
    selected: true,
  });
  assert.match(row, /data-cmdty="cmdty_ore_iron"/);
  assert.match(row, /Iron Ore/);
  assert.doesNotMatch(row, /data-supply-chain/, 'the register is not a leftover spreadsheet');

  const chain = presentSupplyChain({
    producedBy: IRON.producedBy,
    consumedBy: IRON.consumedBy,
    stationType,
  });
  assert.deepEqual(chain.producers, IRON.producedBy);
  assert.deepEqual(chain.consumers, IRON.consumedBy);
  assert.equal(chain.consumes, true);
  assert.equal(chain.dockRole, 'consume');
  assert.equal(chain.dock, 'This dock buys it.');
  for (const role of IRON.consumedBy) {
    assert.match(chain.chain, new RegExp(cleanStationRole(role)));
  }
  assert.match(chain.chain, new RegExp(cleanStationRole(IRON.producedBy[0])));
  assert.match(chain.chain, /→/);

  const html = marketQuoteHtml({
    id: IRON.id,
    name: IRON.name,
    category: IRON.category,
    legal: IRON.legality,
    buy: IRON.basePrice,
    sell: IRON.basePrice,
    avg: IRON.basePrice,
    hist: [IRON.basePrice, IRON.basePrice],
    producedBy: IRON.producedBy,
    consumedBy: IRON.consumedBy,
    stationType,
  });
  assert.match(html, /data-supply-chain/);
  assert.match(html, /data-dock-role="consume"/);
  assert.match(html, /This dock buys it\./);
  assert.match(html, /Refinery/);
  assert.match(html, /Trade Hub/);
  assert.match(html, /Mining →/);

  console.log(`PQ-177.02 Iron Ore chain: ${chain.chain}`);
  console.log(`PQ-177.02 Ceres (${stationType}): ${chain.dock}`);
});

test('this-dock follows the live station type, including a leftover mining berth', () => {
  const miningType = resolveDockStationType(dockedState(BELT));
  assert.equal(miningType, BELT.type);
  const atMine = presentSupplyChain({
    producedBy: IRON.producedBy,
    consumedBy: IRON.consumedBy,
    stationType: miningType,
  });
  assert.equal(atMine.produces, true);
  assert.equal(atMine.dock, 'This dock produces it.');

  const catalogOnly = resolveDockStationType({ ui: { dockedStationId: CERES.id } });
  assert.equal(catalogOnly, CERES.type, 'SECTORS catalog still names Ceres as a refinery');

  const sectorOnly = resolveDockStationType({
    ui: { dockedStationId: CERES.id },
    world: { sectors: { sector_ceres_belt: { stations: [CERES] } } },
  });
  assert.equal(sectorOnly, CERES.type);
});

test('the Orbital market screen paints that leftover inspector from COMMODITIES + live type', () => {
  const marketSrc = readFileSync(join(ROOT, 'src/ui/station/screens/market.js'), 'utf8');
  assert.match(
    marketSrc,
    /producedBy:\s*def\.producedBy,\s*consumedBy:\s*def\.consumedBy,\s*stationType:\s*resolveDockStationType\(state\)/,
    'renderStage hands catalog roles and the live dock type to the leftover inspector',
  );
  assert.match(marketSrc, /data\.stationTypeId/, 'live entity type is stationTypeId, as world.js stamps');
  const css = readFileSync(join(ROOT, 'styles/orbital.css'), 'utf8');
  assert.match(css, /#screens \.sx-mkt-chain/, 'Orbital owns the leftover chain line');
  assert.doesNotMatch(css, /kit\.css/);
});

// Honesty leftover iterate: neither-role docks still buy legal goods. The line must say so
// and name the leftover consumer roles, not refuse a sale the live quote will take.

const VEIL = SECTORS.flatMap((sec) => sec.stations || []).find((st) => st.id === 'station_veil');

function bootEconomy() {
  const handlers = new Map();
  const bus = {
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
      return () => {};
    },
    off() {},
    emit(event, payload) { for (const handler of [...(handlers.get(event) || [])]) handler(payload); },
  };
  const state = {
    mode: 'flight', simTime: 0, meta: { seed: 0x5face },
    player: {
      credits: 10000,
      cargo: { items: { cmdty_ore_iron: 10 }, capVolume: 100, usedVolume: 10 },
      marketMemory: {}, tradeLedger: [], tradeLots: {},
    },
    economy: {}, conflicts: {}, sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    ui: {}, nav: {}, entities: new Map(), entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, econ };
}

test('a leftover neither-role dock still buys leftover ore and names the leftover better prices', () => {
  assert.ok(VEIL && VEIL.type === 'research', 'Research Station Veil is a live neither-role dock for ore');

  const stationType = resolveDockStationType(dockedState(VEIL));
  assert.equal(stationType, 'research');
  const chain = presentSupplyChain({
    producedBy: IRON.producedBy,
    consumedBy: IRON.consumedBy,
    stationType,
  });
  assert.equal(chain.dockRole, 'neither');
  assert.match(chain.dock, /This dock buys it\./);
  assert.doesNotMatch(chain.dock, /does not buy/);
  for (const role of IRON.consumedBy) {
    assert.match(chain.dock, new RegExp(cleanStationRole(role)));
  }

  const { state, econ } = bootEconomy();
  econ.ensureMarket(VEIL.id);
  const entry = state.economy.markets[VEIL.id][IRON.id];
  assert.ok(entry, 'Iron Ore is listed at a research station — every legal good trades everywhere');
  assert.equal(entry.role, 'none');
  const sale = econ.quote(VEIL.id, IRON.id, 'sell', 5);
  assert.equal(sale.ok, true, 'the station quotes a real sell for leftover ore');
  assert.ok(sale.total > 0, 'and pays credits for it');
  economy._instance = null;

  const html = marketQuoteHtml({
    id: IRON.id,
    name: IRON.name,
    category: IRON.category,
    legal: IRON.legality,
    buy: IRON.basePrice,
    sell: IRON.basePrice,
    avg: IRON.basePrice,
    hist: [IRON.basePrice, IRON.basePrice],
    producedBy: IRON.producedBy,
    consumedBy: IRON.consumedBy,
    stationType,
  });
  assert.match(html, /data-dock-role="neither"/);
  assert.match(html, /This dock buys it\./);
  assert.doesNotMatch(html, /does not buy/);

  console.log(`PQ-177.02 ${VEIL.name} (${stationType}): ${chain.dock} — live sell of 5 ore clears for ${Math.round(sale.total)} cr`);
});

test('leftover neither-role views still name leftover consumer docks, never leftover a false refusal', () => {
  const stationTypes = SECTORS.flatMap((sec) => (sec.stations || []).map((st) => st.type));
  let pairs = 0;
  let neither = 0;
  for (const type of stationTypes) {
    for (const def of COMMODITIES) {
      if (def.legality === 'contraband' || def.legality === 'illegal') continue;
      pairs += 1;
      const view = presentSupplyChain({ producedBy: def.producedBy, consumedBy: def.consumedBy, stationType: type });
      assert.doesNotMatch(view.dock || '', /does not buy/, `${def.id} at ${type} must not refuse a live sale`);
      if (view.dockRole === 'neither') {
        neither += 1;
        assert.match(view.dock, /This dock buys it\./);
      }
    }
  }
  assert.ok(pairs > 0);
  assert.ok(neither / pairs > 0.5, 'most legal listings are leftover transit docks, not leftover listed consumers');
  console.log(`PQ-177.02 leftover transit views: ${neither}/${pairs} (${Math.round((100 * neither) / pairs)}%) of legal listings`);
});
