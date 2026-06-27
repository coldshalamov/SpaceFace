import assert from 'node:assert/strict';

import { applyTradeNavigation } from '../src/ui/screens/market.js';

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

checkOffSectorBestTradeSetsCourse();
checkLocalBestTradeUsesLivePositionOnly();

console.log('Market navigation checks OK');
