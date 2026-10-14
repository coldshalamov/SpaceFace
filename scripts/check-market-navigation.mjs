import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyTradeNavigation, computeBestTrades, formatCargoUnits, unitPrice } from '../src/ui/market/tradeLogic.js';
import { COMMODITIES } from '../src/data/commodities.js';

const TRADE_LOGIC_SOURCE = readFileSync(new URL('../src/ui/market/tradeLogic.js', import.meta.url), 'utf8');
const STATION_MARKET_SOURCE = readFileSync(new URL('../src/ui/station/screens/market.js', import.meta.url), 'utf8');

function makeHarness(currentSectorId = 'sector_helios_prime') {
  const events = [];
  const state = {
    world: {
      currentSectorId,
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          name: 'Helios Prime',
          stations: [{ id: 'station_helios', name: 'Helios Station', type: 'trade_hub' }],
        },
        sector_tethys_junction: {
          id: 'sector_tethys_junction',
          name: 'Tethys Junction',
          stations: [{ id: 'station_tethys', name: 'Tethys Trade Hub', type: 'trade_hub' }],
        },
      },
    },
    nav: { route: null, autoTravel: false, waypoint: null },
    player: {
      credits: 55,
      cargo: { usedVolume: 0, capVolume: 20, items: {} },
    },
    entityList: [
      {
        id: 1,
        type: 'station',
        alive: true,
        pos: { x: 280, z: -140 },
        data: { stationId: 'station_helios', name: 'Helios Station' },
      },
    ],
  };
  return {
    state,
    events,
    ctx: {
      state,
      bus: {
        emit(name, payload) { events.push({ name, payload }); },
      },
    },
  };
}

function eventPayload(events, name) {
  const found = events.find((event) => event.name === name);
  return found && found.payload;
}

function checkOffSectorBestTradeSetsCourse() {
  const { ctx, state, events } = makeHarness('sector_helios_prime');
  applyTradeNavigation(ctx, 'station_tethys', 'cmdty_food');

  assert.equal(state.nav.waypoint.kind, 'trade', 'market nav should create a trade waypoint');
  assert.equal(state.nav.waypoint.stationId, 'station_tethys', 'waypoint should target the selected station');
  assert.equal(state.nav.waypoint.commodityId, 'cmdty_food', 'waypoint should retain the selected route commodity');
  assert.equal(state.nav.waypoint.sectorId, 'sector_tethys_junction', 'off-sector waypoint must preserve destination sector id');
  assert.equal(state.nav.waypoint.sectorName, 'Tethys Junction', 'off-sector waypoint should preserve destination sector name');
  assert.equal(state.nav.waypoint.pos, null, 'off-sector waypoint should not pretend to have a local position');
  assert.match(state.nav.waypoint.label, /Tethys Trade Hub/, 'waypoint label should name the station');
  assert.match(state.nav.waypoint.label, /Provisions/, 'waypoint label should name the commodity');

  const course = eventPayload(events, 'ui:setCourse');
  assert.equal(course && course.sectorId, 'sector_tethys_junction', 'off-sector market nav must request a route');
  assert.equal(course && course.waypointKind, 'trade', 'route request should identify the trade waypoint kind');
  assert.equal(course && course.stationId, 'station_tethys', 'route request should keep the station id');
  assert.equal(course && course.commodityId, 'cmdty_food', 'route request should keep the commodity id');
  assert.equal(eventPayload(events, 'nav:waypoint'), state.nav.waypoint, 'nav:waypoint should broadcast the exact waypoint');
}

function checkLocalBestTradeUsesLivePositionOnly() {
  const { ctx, state, events } = makeHarness('sector_helios_prime');
  applyTradeNavigation(ctx, 'station_helios', 'cmdty_food');

  assert.equal(state.nav.waypoint.sectorId, 'sector_helios_prime', 'local waypoint should still carry sector id');
  assert.deepEqual(state.nav.waypoint.pos, { x: 280, z: -140 }, 'local waypoint should use the live station position');
  assert.equal(events.some((event) => event.name === 'ui:setCourse'), false, 'local market nav should not plot a jump course');
  assert.match(eventPayload(events, 'toast').text, /Nav set:/, 'market nav should confirm the selected destination');
}

function checkUncatalogedLocalStationUsesCurrentSector() {
  const { ctx, state, events } = makeHarness('sector_helios_prime');
  state.entityList.push({
    id: 42,
    type: 'station',
    alive: true,
    pos: { x: -460, z: 320 },
    data: { stationId: 'station_coalition', name: 'Coalition HQ' },
  });

  applyTradeNavigation(ctx, 'station_coalition', 'cmdty_food');

  assert.equal(state.nav.waypoint.sectorId, 'sector_helios_prime',
    'live local stations missing from the sector catalog should fall back to the current sector id');
  assert.equal(state.nav.waypoint.sectorName, 'Helios Prime',
    'live local stations missing from the sector catalog should fall back to the current sector name');
  assert.deepEqual(state.nav.waypoint.pos, { x: -460, z: 320 },
    'uncataloged local station waypoint should still use the live station position');
  assert.equal(events.some((event) => event.name === 'ui:setCourse'), false,
    'uncataloged local station nav should not request an off-sector route');
}

function checkFailedQuoteFallsBackToRolePrice() {
  const { ctx } = makeHarness('sector_helios_prime');
  ctx.registry = {
    get(name) {
      if (name !== 'economy') return null;
      return { quote: () => ({ ok: false, reason: 'booting', unitAvg: 0, total: 0 }) };
    },
  };

  const buy = unitPrice(ctx, 'station_helios', 'cmdty_food', 'buy');
  const sell = unitPrice(ctx, 'station_helios', 'cmdty_food', 'sell');
  // Threshold tracks the live commodity table: the Economy Pulse packet (ff6a0cae9) rebalanced
  // provisions from basePrice 40 to 73, which stranded the old hardcoded 40 ceiling.
  const foodBase = COMMODITIES.find((c) => c.id === 'cmdty_food').basePrice;

  assert(buy > 0, 'failed market quote must not display as a zero buy price');
  assert(sell > 0, 'failed market quote must not display as a zero sell price');
  assert(buy < foodBase, 'producer fallback should read as a source price below food base price');
  assert(sell < foodBase, 'producer fallback sell price should stay below food base price');
}

function checkLiveActiveStationRecordUsesStationIdForRolePrice() {
  const { ctx, state } = makeHarness('sector_helios_prime');
  state.world.activeSector = {
    stations: [{ id: 99, stationId: 'station_mobile_refinery', pos: { x: -180, z: 260 } }],
  };
  state.world.sectors = {};
  state.entityList = [{
    id: 99,
    type: 'station',
    alive: true,
    pos: { x: -180, z: 260 },
    data: {
      stationId: 'station_mobile_refinery',
      name: 'Mobile Refinery',
      stationTypeId: 'refinery',
      services: ['repair', 'refuel'],
    },
  }];
  ctx.registry = {
    get(name) {
      if (name !== 'economy') return null;
      return { quote: () => ({ ok: false, reason: 'offline', unitAvg: 0, total: 0 }) };
    },
  };

  const buy = unitPrice(ctx, 'station_mobile_refinery', 'cmdty_refined_metals', 'buy');

  assert(buy > 0, 'live active-sector station fallback should produce a usable price');
  assert(buy < 85,
    'live active-sector station records must resolve by stationId so refinery producer pricing beats generic fallback');
}

function checkLiveQuoteStillWins() {
  const { ctx } = makeHarness('sector_helios_prime');
  ctx.registry = {
    get(name) {
      if (name !== 'economy') return null;
      return { quote: () => ({ ok: true, unitAvg: 123, total: 123 }) };
    },
  };

  assert.equal(unitPrice(ctx, 'station_helios', 'cmdty_food', 'buy'), 123, 'live economy quote must win over fallback pricing');
}

function checkBestTradeShowsCurrentLoadAndProfit() {
  const { state } = makeHarness('sector_helios_prime');
  state.simTime = 132;
  state.economy = {
    markets: {
      station_helios: {
        cmdty_food: { lastBuy: 10 },
        cmdty_refined_metals: { lastBuy: 50 },
      },
    },
    marketIntel: {
      station_tethys: {
        seenAtT: 12,
        snapshot: {
          cmdty_food: { sell: 18 },
          cmdty_refined_metals: { sell: 70 },
        },
      },
    },
  };

  const trades = computeBestTrades(state, 'station_helios');
  const food = trades.find((trade) => trade.cmdtyId === 'cmdty_food');
  const refined = trades.find((trade) => trade.cmdtyId === 'cmdty_refined_metals');

  assert.equal(food.loadUnits, 5, 'food route should be limited by the current wallet');
  assert.equal(food.loadCost, 50, 'food route should show the affordable buy-in');
  assert.equal(food.loadProfit, 40, 'food route should show current-run gross profit');
  assert.equal(food.loadVolume, 5, 'food route should show hold volume consumed');
  assert.equal(food.intelSource, 'scanned', 'marketIntel routes should carry the scanned intel source');
  // INF-085 (0efc5e5cf) aged the remembered-price labels: scans read as "scan · Nm old".
  assert.equal(food.intelLabel, 'scan · 2m old', 'marketIntel routes should expose readable intel age');
  assert.equal(refined.loadUnits, 1, 'refined route should account for commodity unit price');
  assert.equal(refined.loadVolume, 0.5, 'refined route should account for non-1.0 cargo volume');
  assert.equal(trades[0].cmdtyId, 'cmdty_food', 'ranking should prefer the best current-run profit');
}

function checkMarketCargoUnitFormatting() {
  assert.equal(formatCargoUnits(0.5), '0.5', 'cargo formatter should preserve fractional hold units');
  assert.equal(formatCargoUnits(1234.56), '1,234.6', 'cargo formatter should group cargo quantities');
  assert.equal(formatCargoUnits(Number.NaN), '0', 'cargo formatter should fail closed for invalid values');
  assert.match(TRADE_LOGIC_SOURCE, /export function formatCargoUnits/,
    'pure market logic must keep the shared cargo-unit formatter');
  assert.match(STATION_MARKET_SOURCE, /rowKV\('Hold free', fmt\(free\) \+ ' u'\)/,
    'the live Station Market must show remaining hold capacity in cargo units');
  assert.doesNotMatch(STATION_MARKET_SOURCE, /fmtCr\([^)]*\) \+ ' u/,
    'the live Station Market must not render cargo units through the credit formatter');
}

function checkStationMarketSelectionContract() {
  // Frontend Task C §1.3: the commodity register is a kit table; arrowing over its rows selects
  // (selection follows focus) and every selection redraws the quote and the trade console.
  assert.match(STATION_MARKET_SOURCE, /selectCommodity\(rows\[next\]\.getAttribute\('data-cmdty'\), \{ focus: true \}\)/,
    'the live Station Market register must move the quote with keyboard focus');
  assert.match(STATION_MARKET_SOURCE, /function selectCommodity\(id[\s\S]*renderStage\(state\); renderConsole\(state\);/,
    'selecting a live commodity row must redraw its quote and trade console');
  assert.match(STATION_MARKET_SOURCE, /const go = ev\.target\.closest\('\[data-go\]'\);/,
    'the live Station Market must delegate its visible buy/sell commit control');
}

function checkBestTradeExplainsBlockedLoad() {
  const { state } = makeHarness('sector_helios_prime');
  // The fixture clock must cover the scan: economy quote trust (15da68c1fe) refuses
  // future-dated intel, and without simTime the remembered prices read as unsourced.
  state.simTime = 132;
  state.player.credits = 0;
  state.player.cargo.capVolume = 4;
  state.economy = {
    markets: { station_helios: { cmdty_food: { lastBuy: 10 } } },
    marketIntel: {
      station_tethys: { seenAtT: 12, snapshot: { cmdty_food: { sell: 18 } } },
    },
  };

  const trade = computeBestTrades(state, 'station_helios')[0];
  assert.equal(trade.loadUnits, 0, 'blocked route should carry zero load units');
  assert.equal(trade.loadReason, 'spot estimate; no executable purchase quote',
    'a wallet-blocked projection must disclose it is not an executable quote');
  // With a live quote owner (the market screen's path), a zero-credit wallet plans no
  // run at all; the screen's empty state names credits. No fabricated 'need X CR/u' row.
  const quote = (sid, cid, mode, qty) => ({ ok: true, qty, unitAvg: 10, total: 10 * qty });
  const actionable = computeBestTrades(state, 'station_helios', { quote }).filter((t) => t.loadUnits > 0);
  assert.equal(actionable.length, 0, 'quote-backed zero-credit wallet must not plan an executable run');
}

function checkBestTradeRefusesUnvisitedWarmedMarkets() {
  const { state } = makeHarness('sector_helios_prime');
  state.simTime = 132;
  state.economy = {
    markets: {
      station_helios: { cmdty_food: { lastBuy: 10, lastSell: 9, stock: 1000, role: 'produce' } },
      station_tethys: { cmdty_food: { lastBuy: 19, lastSell: 18, stock: 500, role: 'consume' } },
    },
    marketIntel: {},
  };

  // Economy quote trust (15da68c1fe): a warmed remote book is not knowledge. Without
  // player memory or scan intel the planner must not see station_tethys at all —
  // no memory is unknown, not omniscience — so no route is planned from live remote books.
  assert.deepEqual(computeBestTrades(state, 'station_helios'), [],
    'warmed remote books must not create routes before explicit visit intel');

  // The same spread becomes a real route only once it is remembered as a scan.
  state.economy.marketIntel.station_tethys = { seenAtT: 12, snapshot: { cmdty_food: { sell: 18 } } };
  const trade = computeBestTrades(state, 'station_helios')[0];
  assert.equal(trade.destStation, 'station_tethys', 'scanned intel restores the destination');
  assert.equal(trade.loadProfit, 40, 'scanned route should still show current-run profit');
  assert.equal(trade.intelSource, 'scanned', 'route must disclose its scan source');
}

checkOffSectorBestTradeSetsCourse();
checkLocalBestTradeUsesLivePositionOnly();
checkUncatalogedLocalStationUsesCurrentSector();
checkFailedQuoteFallsBackToRolePrice();
checkLiveActiveStationRecordUsesStationIdForRolePrice();
checkLiveQuoteStillWins();
checkMarketCargoUnitFormatting();
checkStationMarketSelectionContract();
checkBestTradeShowsCurrentLoadAndProfit();
checkBestTradeExplainsBlockedLoad();
checkBestTradeRefusesUnvisitedWarmedMarkets();

console.log('Market navigation checks OK');
