// PQ-177.02 — leftover supply-chain on the Orbital market inspector. Headless.
// Inputs come from COMMODITIES + the live Ceres station record / entity, not invented roles.
import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
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
