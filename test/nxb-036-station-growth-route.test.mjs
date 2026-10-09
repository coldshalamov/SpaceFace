// NXB-036 — station growth creates a usable route change, not only a throughput number.
// The accepted growth event (a station topping out its ladder on player-supplied freight)
// publishes ONE durable claim_travel_sling_v1 corridor on the growth record itself — the same
// consumed fact a claim Throughline writes. travelLanes materializes the physical ring + relay,
// traffic adopts the route at a legal handoff, and the Atlas charts it from the same record.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claims as claimsBase,
  CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA,
} from '../src/systems/claims.js';
import {
  travelLanes as travelLanesBase,
  buildManufacturedLaneGeometry,
} from '../src/systems/travelLanes.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import {
  buildClaimOwnershipMarkers,
  buildSystemModel,
  resolveCourseTarget,
} from '../src/ui/galaxyMap.js';
import { resolveTravelCeiling } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_ceres_belt';
const STATION_ID = 'station_ceres';     // authored refinery — ladder tops out at 1000u
const SECTOR_ORIGIN = sectorGlobalOrigin(SECTOR_ID);
const GATE_POS = { x: SECTOR_ORIGIN.x + 4200, z: SECTOR_ORIGIN.z - 40 };

function makeBus() {
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
    of(name) { return events.filter((event) => event.name === name); },
  };
}

function makeStation(overrides = {}) {
  return {
    id: 90,
    type: 'station',
    alive: true,
    collides: true,
    pos: { x: SECTOR_ORIGIN.x, z: SECTOR_ORIGIN.z },
    radius: 50,
    data: { stationId: STATION_ID, name: 'Ceres Exchange', sectorId: SECTOR_ID },
    ...overrides,
  };
}

function makeState({ gates = true, station = makeStation() } = {}) {
  const state = {
    simTime: 100,
    tick: 1,
    mode: 'flight',
    meta: { seed: 47 },
    playerId: 1,
    player: {
      credits: 200000,
      heat: 0,
      researchedNodes: [],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 },
      ownedShips: [],
    },
    world: {
      currentSectorId: SECTOR_ID,
      activeSector: {
        id: SECTOR_ID,
        gates: gates ? [{ id: 'gate_ceres_tethys', to: 'sector_tethys_junction', pos: GATE_POS }] : [],
      },
    },
    claims: null,
    entities: new Map([[station.id, station]]),
    entityList: [station],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      dockStations: [station],
      stations: [station],
      byStationId: new Map([[STATION_ID, station]]),
    },
  };
  return { state, station };
}

function bootClaims(opts = {}) {
  const { state, station } = makeState(opts);
  const bus = makeBus();
  const sys = Object.create(claimsBase);
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, bus, sys, station };
}

function sell(h, qty, receiptId) {
  h.bus.emit('economy:tradeCompleted', {
    stationId: STATION_ID, commodityId: 'cmdty_ore_iron', side: 'sell',
    qty, unitAvg: 28, total: qty * 28, receiptId, tradeSequence: 1,
  });
}

function growToTop(h) {
  sell(h, 1000, 'trade:47:top');
  return h.sys.stationGrowth(STATION_ID);
}

function growToTopActive(h) {
  const rec = growToTop(h);
  assert.ok(rec.growthRoute, 'final rung fabricates the corridor');
  h.state.simTime = rec.growthRoute.alignUntil;
  h.sys.update(0, h.state);
  assert.equal(rec.growthRoute.stage, 'active');
  assert.equal(rec.growthRoute.operational, true);
  return rec;
}

function withTravelFlags(fn) {
  const laneBoost = TRAVEL_FLAGS.laneBoost;
  const travelBurn = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.laneBoost = true;
  TRAVEL_FLAGS.travelBurn = true;
  try { return fn(); } finally {
    TRAVEL_FLAGS.laneBoost = laneBoost;
    TRAVEL_FLAGS.travelBurn = travelBurn;
  }
}

test('topping out a station ladder publishes one durable approach corridor', () => {
  const h = bootClaims();
  sell(h, 200, 'trade:47:1');
  let rec = h.sys.stationGrowth(STATION_ID);
  assert.equal(rec.rung, 1);
  assert.equal(rec.growthRoute, null, 'a partial ladder changes no route');
  assert.equal(rec.routeRequested, false);
  assert.equal(h.bus.of('claim:infrastructureConstructed').length, 0);

  rec = growToTop(h);
  assert.equal(rec.rung, 3, 'all three authored rungs earned');
  const route = rec.growthRoute;
  assert.ok(route, 'the accepted growth event fabricates a route, not a second counter');
  assert.equal(route.schema, CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA, 'same consumed record family');
  assert.equal(route.routeKind, 'station_growth');
  assert.equal(route.stationId, STATION_ID);
  assert.equal(route.sectorId, SECTOR_ID);
  assert.equal(route.stage, 'aligning');
  assert.equal(route.operational, false);
  assert.equal(route.routeRung, 3);
  assert.equal(route.anchorKind, 'gate', 'the corridor aims at the real freight door');
  assert.equal(route.anchorId, 'sector_tethys_junction');
  assert.ok(route.distanceWU >= 520, 'a real route, not a station-radius decoration');
  // The corridor runs gate-ward into the berth: ring out along the approach bearing, inner
  // endpoint cleared of the station hull.
  assert.ok(route.from.x > route.to.x, 'ring stands on the gate approach');
  assert.ok(Math.hypot(route.to.x - h.station.pos.x, route.to.z - h.station.pos.z) >= 170,
    'inner endpoint clears the station body');
  assert.equal(route.fabricationReceipt.receiptId, `station-growth-route:${STATION_ID}`);
  assert.equal(route.fabricationReceipt.rung, 3);
  assert.equal(route.fabricationReceipt.throughputU, rec.throughputU);
  assert.equal(rec.routeRequested, false, 'a seated route is no longer pending');

  const constructed = h.bus.of('claim:infrastructureConstructed');
  assert.equal(constructed.length, 1, 'the construction fact publishes once');
  assert.equal(constructed[0].payload.infrastructureId, route.id);
  assert.equal(constructed[0].payload.stationId, STATION_ID);
  assert.equal(constructed[0].payload.routeKind, 'station_growth');
  assert.match(
    h.bus.of('news:publish').at(-1).payload.text,
    /permanent approach/,
    'the growth beat names the route outcome',
  );

  // Alignment is the corridor's own clock — no claim spec gates it.
  h.state.simTime = route.alignUntil - 0.01;
  h.sys.update(0, h.state);
  assert.equal(route.stage, 'aligning');
  h.state.simTime = route.alignUntil;
  h.sys.update(0, h.state);
  assert.equal(route.stage, 'active');
  assert.equal(route.operational, true, 'a charted public approach stays open');
  assert.equal(h.bus.of('claim:infrastructureActive').length, 1);
  assert.equal(h.bus.of('claim:infrastructureActive')[0].payload.infrastructureId, route.id);
  assert.equal(h.sys.activeTravelInfrastructure(SECTOR_ID).length, 1);
  const hooks = h.sys.travelInfrastructureHooks(SECTOR_ID);
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].stationId, STATION_ID);
  assert.deepEqual(hooks[0].slingPos, route.from, 'traffic hands off at the physical ring');
});

test('the corridor is navigable: travelLanes builds a physical tube and solid structures', () => {
  withTravelFlags(() => {
    const h = bootClaims();
    const rec = growToTopActive(h);
    const route = rec.growthRoute;
    const geometry = buildManufacturedLaneGeometry(route);
    assert.ok(geometry && geometry.segments.length === 1, 'the consumed route becomes real geometry');
    const midpoint = geometry.segments[0].midpoint;
    const playerEntity = {
      id: 1,
      type: 'ship',
      alive: true,
      pos: { x: midpoint.x, z: midpoint.z },
      vel: { x: 19, z: -4 },
      rot: 0,
      mass: 1000,
      inertia: 1000,
      propulsion: { id: 'drive_reaction_m' },
      data: {},
    };
    h.state.entities.set(1, playerEntity);
    h.state.entityList.push(playerEntity);
    h.state.playerId = 1;
    h.state.input = { travelDrive: { state: 'engaged', cap: 0 } };
    const spawned = [];
    let nextId = 500;
    const travel = Object.create(travelLanesBase);
    travel.init({
      state: h.state,
      bus: h.bus,
      helpers: {
        spawnEntity(spec) {
          const entity = { id: nextId++, alive: true, ...spec, pos: { ...spec.pos } };
          h.state.entities.set(entity.id, entity);
          h.state.entityList.push(entity);
          spawned.push(entity);
          return entity;
        },
      },
      registry: { get: (name) => name === 'claims' ? h.sys : null },
    });
    const base = resolveTravelCeiling(resolvePropulsionProfile(playerEntity, h.state));
    const baselineSeconds = route.distanceWU / base;
    const corridorSeconds = route.distanceWU / (base * route.ceilingMult);
    assert.ok(corridorSeconds < baselineSeconds, 'the growth route is a measured traversal gain');
    const originalPos = { ...playerEntity.pos };
    const originalVel = { ...playerEntity.vel };
    travel.update(1 / 60, h.state);
    travel.update(1 / 60, h.state);
    assert.equal(h.state.input.travelDrive.ceiling, base * route.ceilingMult);
    assert.equal(h.state.input.travelDrive.rampMult, route.rampMult);
    assert.equal(h.state.travelLanes.manufactured, true);
    assert.equal(h.state.travelLanes.infrastructureOperational, true);
    assert.equal(h.state.travelLanes.laneId, route.id, 'the read model names the saved route');
    assert.deepEqual(playerEntity.pos, originalPos, 'the lane never moves the player');
    assert.deepEqual(playerEntity.vel, originalVel, 'the lane never writes player velocity');
    const structures = spawned.filter(
      (entity) => entity.data && entity.data.claimTravelInfrastructureId === route.id,
    );
    assert.equal(structures.length, 2, 'one ring and one relay, each admitted once');
    assert.deepEqual(
      structures.map((entity) => entity.data.claimTravelPart).sort(),
      ['relay', 'ring'],
    );
    assert.ok(structures.every((entity) => entity.collides === true), 'solid world bodies');
    assert.ok(structures.every((entity) => entity.flags && entity.flags.invuln === true));
  });
});

test('existing traffic adopts the grown route only at a legal handoff (NXI-144)', () => {
  const h = bootClaims();
  const rec = growToTopActive(h);
  const route = rec.growthRoute;
  const hauler = {
    id: 200,
    type: 'ship',
    alive: true,
    pos: { x: h.station.pos.x + 300, z: h.station.pos.z },
    vel: { x: 7, z: 3 },
    rot: 0,
    data: { worldRecordId: 'traffic:ceres:200' },
  };
  const committed = {
    id: 201,
    type: 'ship',
    alive: true,
    pos: { x: h.station.pos.x + 320, z: h.station.pos.z },
    vel: { x: -4, z: 9 },
    rot: 0,
    data: { worldRecordId: 'traffic:ceres:201', jobId: 'job:underway:9' },
  };
  h.state.entities.set(hauler.id, hauler);
  h.state.entities.set(committed.id, committed);
  h.state.entityList.push(hauler, committed);
  h.state.traffic = {
    freighters: [
      { id: hauler.id, role: 'hauler', targetId: h.station.id, waitT: 0, nextTradeT: 10 },
      { id: committed.id, role: 'hauler', targetId: h.station.id, waitT: 0, nextTradeT: 10 },
    ],
    appliedArrivalIds: [],
    appliedLossIds: [],
    rngSeed: 1,
  };
  const traffic = Object.create(trafficBase);
  traffic.init({
    state: h.state,
    bus: h.bus,
    helpers: {},
    registry: { get: (name) => name === 'claims' ? h.sys : null },
  });
  assert.equal(traffic._applyClaimTravelHooks(SECTOR_ID), 1,
    'exactly the uncommitted hull is adopted');
  const adopted = h.state.traffic.freighters[0];
  const skipped = h.state.traffic.freighters[1];
  assert.equal(adopted.claimTravelRoute.hookId, route.id);
  assert.equal(adopted.claimTravelRoute.stationId, STATION_ID);
  assert.equal(skipped.claimTravelRoute, undefined,
    'a hull already under a job keeps its own route');
  assert.equal(committed.data.claimTravelTrafficHookId, undefined);
  const posBefore = { ...hauler.pos };
  const velBefore = { ...hauler.vel };
  traffic.update(1 / 60, h.state);
  assert.equal(hauler.data.claimTravelTrafficHookId, route.id);
  assert.deepEqual(hauler.pos, posBefore, 'adoption supplies intent, not a teleport');
  assert.deepEqual(hauler.vel, velBefore, 'the hull keeps its own velocity through the handoff');
});

test('route identity survives save/restore and a station redraw (NXI-143)', () => {
  const first = bootClaims();
  const rec = growToTopActive(first);
  const route = rec.growthRoute;
  const expected = JSON.parse(JSON.stringify(route));
  const snapshot = JSON.parse(JSON.stringify(first.sys.serialize()));

  const { state, station } = makeState();
  const bus = makeBus();
  const restored = Object.create(claimsBase);
  restored.init({ state, bus, helpers: {}, registry: { get: () => null } });
  restored.deserialize(snapshot);
  const restoredRec = restored.stationGrowth(STATION_ID);
  assert.deepEqual(restoredRec.growthRoute, expected, 'the corridor restores exactly');
  assert.equal(restoredRec.growthRoute.id, route.id);
  assert.equal(restoredRec.growthRoute.operational, true, 'an aligned route stays open');
  assert.equal(restored.activeTravelInfrastructure(SECTOR_ID).length, 1);
  assert.equal(bus.of('claim:infrastructureConstructed').length, 0,
    'restore cannot announce a second construction');

  // The world respawned the station under a different entity — a redraw, not a rebuild.
  state.entities.delete(station.id);
  state.entityList.length = 0;
  const redrawn = makeStation({ id: 640 });
  state.entities.set(redrawn.id, redrawn);
  state.entityList.push(redrawn);
  state.entityIndex.byStationId.set(STATION_ID, redrawn);
  state.entityIndex.stations = [redrawn];
  state.entityIndex.dockStations = [redrawn];
  restored._stampAllStationGrowth();
  const visited = [];
  restored.visitTravelInfrastructure(SECTOR_ID, (infrastructure) => visited.push(infrastructure));
  assert.equal(visited.length, 1, 'one route, not two indistinguishable entries');
  assert.equal(visited[0].id, route.id, 'the redraw keeps the durable route identity');

  const ownership = buildClaimOwnershipMarkers(state, SECTOR_ID, restored);
  const parts = ownership.filter((entry) => entry.infrastructure && entry.infrastructure.id === route.id);
  assert.equal(parts.length, 2, 'ring and relay chart from the same record');
  const ring = parts.find((entry) => entry.infrastructure.part === 'ring');
  assert.ok(ring, 'the ring is charted');
  assert.equal(ring.travelRoute.id, route.id);
  assert.equal(ring.travelRoute.lineStyle, 'solid', 'an operational corridor draws solid');
  assert.deepEqual(ring.travelRoute.from, expected.from);
  const course = resolveCourseTarget(ring);
  assert.deepEqual(course.pos, expected.from, 'the Atlas course resolves the same physical ring');
  const systemRoute = buildSystemModel(state, SECTOR_ID, { claimsSystem: restored }).ownership
    .find((entry) => entry.infrastructure && entry.infrastructure.id === route.id
      && entry.infrastructure.part === 'ring').travelRoute;
  assert.deepEqual(systemRoute.drawFrom, {
    x: expected.from.x - SECTOR_ORIGIN.x,
    z: expected.from.z - SECTOR_ORIGIN.z,
  }, 'the SYSTEM draw path projects the saved route into the sector-local frame');
});

test('repeated growth facts and restores cannot duplicate the corridor', () => {
  const h = bootClaims();
  const rec = growToTopActive(h);
  assert.equal(h.bus.of('claim:infrastructureConstructed').length, 1);

  // More freight after the top rung is still supply, but never a second route.
  sell(h, 400, 'trade:47:after');
  assert.equal(h.sys.stationGrowth(STATION_ID).throughputU, 1400);
  assert.equal(h.bus.of('claim:infrastructureConstructed').length, 1);
  h.sys._stampAllStationGrowth();
  const visited = [];
  h.sys.visitTravelInfrastructure(SECTOR_ID, (infrastructure) => visited.push(infrastructure));
  assert.equal(visited.length, 1, 'the durable record is the only route');
});

test('a rejected or repeated delivery cannot announce the route outcome (NXI-141)', () => {
  const h = bootClaims();
  sell(h, 1000, 'trade:47:dup');
  const gained = h.bus.of('station:moduleGained').length;
  const constructed = h.bus.of('claim:infrastructureConstructed').length;
  const news = h.bus.of('news:publish').length;
  sell(h, 1000, 'trade:47:dup'); // the identical settled sale republished
  assert.equal(h.sys.stationGrowth(STATION_ID).throughputU, 1000, 'the lot counts once');
  assert.equal(h.bus.of('station:moduleGained').length, gained,
    'a re-published receipt cannot re-announce the milestone');
  assert.equal(h.bus.of('claim:infrastructureConstructed').length, constructed);
  assert.equal(h.bus.of('news:publish').length, news);
  const visited = [];
  h.sys.visitTravelInfrastructure(SECTOR_ID, (infrastructure) => visited.push(infrastructure));
  assert.equal(visited.length, 1);
});

test('an obstructed approach stays requested until a survey can seat it', () => {
  const h = bootClaims();
  // Wall the whole approach bearing off: every surveyed lateral offset fails clearance.
  const station = h.station;
  const bearing = { x: 1, z: 0 };
  for (const [index, lateral] of [0, 160, -160, 280, -280].entries()) {
    const blocker = {
      id: 700 + index,
      type: 'asteroid',
      alive: true,
      collides: true,
      pos: {
        x: station.pos.x + bearing.x * 900 - bearing.z * lateral,
        z: station.pos.z + bearing.z * 900 + bearing.x * lateral,
      },
      radius: 500,
      data: {},
    };
    h.state.entities.set(blocker.id, blocker);
    h.state.entityList.push(blocker);
  }
  const rec = growToTop(h);
  assert.equal(rec.rung, 3);
  assert.equal(rec.growthRoute, null, 'no corridor is drawn through a wall of rock');
  assert.equal(rec.routeRequested, true, 'the outcome stays pending, not burned');
  assert.equal(h.bus.of('claim:infrastructureConstructed').length, 0);

  // The wall breaks up; the next entry survey seats the same single route.
  for (const entity of h.state.entityList.slice()) {
    if (entity.type === 'asteroid') {
      h.state.entities.delete(entity.id);
      h.state.entityList.splice(h.state.entityList.indexOf(entity), 1);
    }
  }
  h.sys._stampAllStationGrowth();
  assert.ok(rec.growthRoute, 'the retried survey seats the corridor');
  assert.equal(rec.routeRequested, false);
  assert.equal(h.bus.of('claim:infrastructureConstructed').length, 1,
    'retry publishes the construction fact exactly once');
});

test('the fallback bearing resolves when no live gate table exists', () => {
  const h = bootClaims({ gates: false });
  h.state.world.activeSector = { id: SECTOR_ID, gates: [] };
  const rec = growToTop(h);
  assert.ok(rec.growthRoute, 'the corridor still seats on the neighbor bearing');
  assert.equal(rec.growthRoute.anchorKind, 'neighbor-bearing');
  assert.ok(rec.growthRoute.distanceWU >= 520);
});
