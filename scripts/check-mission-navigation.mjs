import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missions } from '../src/systems/missions.js';

function createBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function createState() {
  return {
    mode: 'flight',
    simTime: 0,
    meta: { seed: 47 },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1, config: null },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    world: { currentSectorId: 'sector_helios_prime' },
    nav: { route: null, autoTravel: false, waypoint: null },
    ui: { trackedMissionId: null },
    entities: new Map(),
    entityList: [],
    entityIndex: { byStationId: new Map() },
    playerId: 'player',
    player: { credits: 10000, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 }, stats: {} },
  };
}

function nonIterableEntityList(length) {
  return {
    length,
    [Symbol.iterator]() {
      throw new Error('mission navigation should use entity indexes instead of iterating entityList');
    },
  };
}

function createOffer(id = 'offer_offsector') {
  return {
    id,
    type: 'cargo_delivery',
    factionId: 'faction_scn',
    params: { cmdtyId: 'cmdty_food', qty: 2 },
    destStationId: 'station_tethys',
    destSectorId: 'sector_tethys_junction',
    distance: 1800,
    reward_cr: 750,
    collateral_cr: 0,
    riskTier: 1,
    time_limit_s: 600,
    title: 'Deliver food to Tethys',
  };
}

function eventPayload(events, name) {
  const event = events.find((entry) => entry.name === name);
  return event && event.payload;
}

function initHarness() {
  const state = createState();
  const bus = createBus();
  bus.on('ui:setCourse', ({ sectorId }) => {
    state.nav.route = {
      legs: [{ from: state.world.currentSectorId, to: sectorId, fuel: 12, charge: 3, interdict: 0.05 }],
      totalFuel: 12,
      totalHops: 1,
    };
  });
  missions.init({ state, bus, helpers: {} });
  return { state, bus };
}

{
  const { state, bus } = initHarness();
  const offer = createOffer();
  state.missions.boards.station_helios = { refreshEpoch: 0, slots: [offer] };

  bus.emit('ui:trackMission', { missionId: offer.id });

  assert.equal(state.ui.trackedMissionId, null, 'unaccepted offer Track Nav must not mutate tracked mission state');
  assert.equal(state.nav.waypoint, null, 'unaccepted offer Track Nav must not set a waypoint');
  assert.equal(bus.events.filter((e) => e.name === 'ui:setCourse').length, 0, 'unaccepted offer Track Nav must not plot a route');
}

{
  const { state, bus } = initHarness();
  const offer = createOffer();
  state.missions.boards.station_helios = { refreshEpoch: 0, slots: [offer] };

  bus.emit('ui:acceptMission', { missionId: offer.id });

  const active = state.missions.active[0];
  assert(active, 'accepting an offer must create an active mission');
  assert.equal(state.ui.trackedMissionId, active.id, 'accepted mission must auto-track');
  assert.equal(state.nav.waypoint && state.nav.waypoint.missionId, active.id, 'accepted mission must own the nav waypoint');
  assert.equal(state.nav.waypoint && state.nav.waypoint.sectorId, 'sector_tethys_junction', 'off-sector waypoint must keep its target sector');
  assert.equal(!!(state.nav.waypoint && state.nav.waypoint.pos), false, 'off-sector waypoint should not pretend to have a local position');
  assert.equal(state.nav.route && state.nav.route.legs[0].to, 'sector_tethys_junction', 'off-sector accepted mission must request a route');

  state.nav.route = null;
  state.ui.trackedMissionId = null;
  state.simTime = 5;
  bus.emit('ui:trackMission', { missionId: active.id });

  assert.equal(state.ui.trackedMissionId, active.id, 'accepted mission Track Nav must still work');
  assert.equal(state.nav.route && state.nav.route.legs[0].to, 'sector_tethys_junction', 'accepted mission Track Nav must refresh route guidance');
}

{
  const { state, bus } = initHarness();
  state.simTime = 20;
  state.nav.waypoint = {
    kind: 'trade',
    stationId: 'station_tethys',
    sectorId: 'sector_tethys_junction',
    sectorName: 'Tethys Junction',
    commodityId: 'cmdty_food',
    label: 'Tethys Trade Hub - Provisions',
    reason: 'Sell route cargo',
  };
  state.nav.route = null;
  bus.events.length = 0;

  bus.emit('save:loaded', { slot: 'quick' });

  assert.equal(state.nav.waypoint && state.nav.waypoint.kind, 'trade',
    'save load without active missions must preserve the player trade route waypoint');
  assert.equal(state.nav.waypoint && state.nav.waypoint.commodityId, 'cmdty_food',
    'saved trade route waypoint must keep the destination commodity');
  assert.equal(state.nav.route && state.nav.route.legs[0].to, 'sector_tethys_junction',
    'restored off-sector trade waypoint should refresh its plotted course');
  assert.equal(eventPayload(bus.events, 'ui:setCourse') && eventPayload(bus.events, 'ui:setCourse').waypointKind, 'trade',
    'restored trade route should request a trade course, not a story objective');
}

{
  const { state, bus } = initHarness();
  const active = {
    ...createOffer('mission_saved_delivery'),
    id: 'mission_saved_delivery',
    status: 'active',
    objectiveProgress: 0,
    objectiveTarget: 2,
    deadline_s: 600,
    targetEntityIds: [],
  };
  state.missions.active = [active];
  state.ui.trackedMissionId = active.id;
  state.nav.waypoint = {
    kind: 'trade',
    stationId: 'station_tethys',
    sectorId: 'sector_tethys_junction',
    commodityId: 'cmdty_food',
    label: 'Saved Trade',
  };
  bus.events.length = 0;

  bus.emit('save:loaded', { slot: 'quick' });

  assert.equal(state.nav.waypoint && state.nav.waypoint.kind, 'mission',
    'active missions must reclaim navigation after load');
  assert.equal(state.nav.waypoint && state.nav.waypoint.missionId, active.id,
    'mission navigation after load should target the tracked active mission');
}

{
  const { state, bus } = initHarness();
  state.player.cargo.items.cmdty_food = 3;
  state.nav.waypoint = {
    kind: 'trade',
    stationId: 'station_tethys',
    sectorId: 'sector_tethys_junction',
    commodityId: 'cmdty_food',
    label: 'Saved Trade',
  };
  state.nav.route = { legs: [{ from: 'sector_helios_prime', to: 'sector_tethys_junction', fuel: 12 }] };
  state.nav.autoTravel = true;

  bus.emit('economy:tradeCompleted', {
    stationId: 'station_tethys',
    commodityId: 'cmdty_food',
    side: 'sell',
    qty: 2,
  });
  assert.equal(state.nav.waypoint && state.nav.waypoint.kind, 'trade',
    'partial route cargo sells should keep the trade waypoint active');

  state.player.cargo.items.cmdty_food = 0;
  bus.emit('economy:tradeCompleted', {
    stationId: 'station_tethys',
    commodityId: 'cmdty_food',
    side: 'sell',
    qty: 3,
  });

  assert.equal(state.nav.waypoint, null, 'selling the last matching route cargo should clear the trade waypoint');
  assert.equal(state.nav.route, null, 'selling the last matching route cargo should clear the plotted route');
  assert.equal(state.nav.autoTravel, false, 'selling the last matching route cargo should stop route autotravel intent');
  assert.equal(eventPayload(bus.events, 'nav:waypoint'), null,
    'clearing route cargo should rebroadcast a null waypoint');
}

{
  const { state } = initHarness();
  const player = { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const asteroid = { id: 'rock-near', type: 'asteroid', alive: true, pos: { x: 120, z: 0 }, data: { typeId: 'ast_common_rock' } };
  const station = { id: 'station-live', type: 'station', alive: true, pos: { x: 220, z: 0 }, data: { stationId: 'station_helios' } };
  state.entities.set(player.id, player);
  state.entities.set(asteroid.id, asteroid);
  state.entities.set(station.id, station);
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    byStationId: new Map([[station.data.stationId, station]]),
    asteroids: [asteroid],
    mineables: [asteroid],
    stations: [station],
    dockStations: [station],
  };
  state.entityList = nonIterableEntityList(3);

  assert.equal(missions._nearestAsteroid(), asteroid, 'mining nav should resolve asteroid from the indexed mineable bucket');
  assert.equal(missions._nearestStation(), station, 'story nav should resolve station from the indexed station bucket');
  assert.equal(missions._liveStation(station.data.stationId), station, 'mission nav should resolve live station from byStationId');

  state.missions.active = [{
    id: 'mission_mine_indexed',
    status: 'active',
    type: 'mining_quota',
    title: 'Mine indexed rock',
    destSectorId: 'sector_helios_prime',
    deadline_s: 999,
  }];
  state.ui.trackedMissionId = 'mission_mine_indexed';
  missions._refreshNavigation();
  assert.equal(state.nav.waypoint && state.nav.waypoint.pos && state.nav.waypoint.pos.x, asteroid.pos.x,
    'tracked mining waypoint should use the indexed asteroid position');
}

{
  const { state, bus } = initHarness();
  const mission = {
    id: 'mission_debrief_success',
    status: 'active',
    type: 'recon_scan',
    factionId: 'faction_scn',
    params: { scanTargets: 1 },
    objectiveProgress: 1,
    objectiveTarget: 1,
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 1,
    title: 'Scan one quiet site',
    destStationId: 'station_tethys',
    destSectorId: 'sector_tethys_junction',
    targetEntityIds: [],
  };
  state.missions.active = [mission];

  missions._completeMission(mission, 0);

  const debrief = bus.events.find((e) => e.name === 'comms:popup');
  assert(debrief, 'completed missions must emit a comms debrief');
  assert.equal(debrief.payload.sender, 'Concord Contract', 'debrief sender should use the offering faction');
  assert.equal(debrief.payload.category, 'personal', 'successful debrief should land in the personal comms lane');
  assert.match(debrief.payload.text, /Scan packet received/, 'recon completion debrief should be authored, not generic');
}

{
  const { state, bus } = initHarness();
  const mission = {
    id: 'mission_debrief_failure',
    status: 'active',
    type: 'escort',
    factionId: 'faction_scn',
    params: {},
    objectiveProgress: 0,
    objectiveTarget: 1,
    reward_cr: 700,
    collateral_cr: 0,
    riskTier: 1,
    title: 'Escort one convoy',
    destStationId: 'station_tethys',
    destSectorId: 'sector_tethys_junction',
    targetEntityIds: [],
  };
  state.missions.active = [mission];

  missions._failMission(mission, 0, 'escort_abandoned');

  const debrief = bus.events.find((e) => e.name === 'comms:popup');
  assert(debrief, 'failed missions must emit a comms debrief');
  assert.equal(debrief.payload.category, 'trap', 'failed debrief should land in the alert comms lane');
  assert.match(debrief.payload.text, /convoy/i, 'escort failure debrief should explain the contract outcome');
}

{
  const stationHubSource = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
  assert.equal(stationHubSource.includes('Track Nav'), false, 'station mission board must not render dead Track Nav copy for offers');
  assert.equal(stationHubSource.includes('data-act="track"'), false, 'station mission board must not render dead Track Nav action for offers');
  assert(stationHubSource.includes('function missionBriefText('), 'station mission board must render authored contract briefs');
  assert(stationHubSource.includes('st-mission-brief'), 'station mission board must style contract briefs');
  assert(stationHubSource.includes('STATION_BY_ID'), 'station mission board must resolve station ids into player-facing names');
  assert.equal(stationHubSource.includes("m.destName || m.destStationId || m.dest"), false,
    'station mission board must not fall back to raw destination ids in visible metadata');

  const briefStart = stationHubSource.indexOf('function missionBriefText(');
  const briefEnd = stationHubSource.indexOf('function missionValueText(');
  const briefBody = stationHubSource.slice(briefStart, briefEnd);
  for (const type of [
    'cargo_delivery',
    'bulk_trade',
    'mining_quota',
    'salvage_retrieval',
    'smuggling_run',
    'bounty_hunt',
    'escort',
    'patrol_clear',
    'recon_scan',
    'passenger_transport',
  ]) {
    assert(briefBody.includes(`case '${type}'`), `station mission board brief must cover ${type}`);
  }
}

console.log('Mission navigation checks OK');
