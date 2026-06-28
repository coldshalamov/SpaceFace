import assert from 'node:assert/strict';

import { applyTradeNavigation, computeBestTrades, describeTradeIntel, unitPrice } from '../src/ui/screens/market.js';

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

  assert(buy > 0, 'failed market quote must not display as a zero buy price');
  assert(sell > 0, 'failed market quote must not display as a zero sell price');
  assert(buy < 40, 'producer fallback should read as a source price below food base price');
  assert(sell < 40, 'producer fallback sell price should stay below food base price');
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
  assert.equal(food.intelLabel, '2m intel', 'marketIntel routes should expose readable intel age');
  assert.equal(refined.loadUnits, 1, 'refined route should account for commodity unit price');
  assert.equal(refined.loadVolume, 0.5, 'refined route should account for non-1.0 cargo volume');
  assert.equal(trades[0].cmdtyId, 'cmdty_food', 'ranking should prefer the best current-run profit');
}

function checkBestTradeExplainsBlockedLoad() {
  const { state } = makeHarness('sector_helios_prime');
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
  assert.match(trade.loadReason, /need 10 CR\/u/, 'blocked route should explain the wallet gate');
}

function checkBestTradeUsesWarmedMarketSnapshots() {
  const { state } = makeHarness('sector_helios_prime');
  state.economy = {
    markets: {
      station_helios: { cmdty_food: { lastBuy: 10, lastSell: 9, stock: 1000, role: 'produce' } },
      station_tethys: { cmdty_food: { lastBuy: 19, lastSell: 18, stock: 500, role: 'consume' } },
    },
    marketIntel: {},
  };

  const trade = computeBestTrades(state, 'station_helios')[0];
  assert.equal(trade.destStation, 'station_tethys', 'planner should use warmed public markets even before explicit visit intel');
  assert.equal(trade.loadProfit, 40, 'warmed market route should still show current-run profit');
  assert.equal(trade.intelSource, 'market', 'warmed public market routes should carry market-feed source');
  assert.equal(describeTradeIntel(state, trade), 'market feed', 'warmed public market routes should disclose they are market-feed projections');
}

checkOffSectorBestTradeSetsCourse();
checkLocalBestTradeUsesLivePositionOnly();
checkUncatalogedLocalStationUsesCurrentSector();
checkFailedQuoteFallsBackToRolePrice();
checkLiveActiveStationRecordUsesStationIdForRolePrice();
checkLiveQuoteStillWins();
checkBestTradeShowsCurrentLoadAndProfit();
checkBestTradeExplainsBlockedLoad();
checkBestTradeUsesWarmedMarketSnapshots();

console.log('Market navigation checks OK');
