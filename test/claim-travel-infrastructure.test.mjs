import test from 'node:test';
import assert from 'node:assert/strict';

import { BODY_MODULE_BY_ID, BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import {
  claims as claimsBase,
  CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA,
} from '../src/systems/claims.js';
import {
  travelLanes as travelLanesBase,
  buildManufacturedLaneGeometry,
  resolveLaneSegmentInto,
} from '../src/systems/travelLanes.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import {
  applyConfirmedBaseInvestment,
  describeBaseBuildAction,
  describeBaseInvestmentConfirm,
} from '../src/ui/screens/base.js';
import {
  buildClaimOwnershipMarkers,
  describeClaimMapMarker,
  resolveCourseTarget,
} from '../src/ui/galaxyMap.js';
import { resolveTravelCeiling } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { travelTapeLaneStatus } from '../src/ui/hud.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_io_reach';
const STATION_ID = 'station_io_harbor';
const SECTOR_ORIGIN = sectorGlobalOrigin(SECTOR_ID);

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

function makeStation() {
  return {
    id: 90,
    type: 'station',
    alive: true,
    collides: true,
    pos: { x: SECTOR_ORIGIN.x + 2200, z: SECTOR_ORIGIN.z },
    radius: 50,
    data: { stationId: STATION_ID, name: 'Io Harbor', sectorId: SECTOR_ID },
  };
}

function makeState() {
  const station = makeStation();
  return {
    simTime: 100,
    tick: 1,
    mode: 'flight',
    meta: { seed: 47 },
    playerId: 1,
    player: {
      credits: 200000,
      heat: 0,
      researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
      cargo: {
        items: {},
        usedVolume: 0,
        usedMass: 0,
        capVolume: 500,
        capMass: 500,
      },
      ownedShips: [],
    },
    world: { currentSectorId: SECTOR_ID },
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
}

function bootClaims() {
  const state = makeState();
  const bus = makeBus();
  bus.on('economy:chargeCredits', ({ amount }) => {
    state.player.credits -= Math.max(0, Number(amount) || 0);
  });
  const registry = { get: () => null };
  const sys = Object.create(claimsBase);
  sys.init({ state, bus, helpers: {}, registry });
  const poi = {
    id: 'poi_claim_pallas',
    name: 'Pallas Industrial Moon',
    size: 'M',
    pos: { x: SECTOR_ORIGIN.x, z: SECTOR_ORIGIN.z },
  };
  assert.equal(sys.claim(poi), true);
  const body = state.claims.bodies[0];
  assert.equal(sys.buildModule(body.id, 'mod_refinery'), true);
  assert.equal(sys.specialize(body.id, 'spec_refinery'), true);
  return { state, bus, sys, body, station: state.entityIndex.dockStations[0] };
}

function loadSlingMaterials(state) {
  state.player.cargo.items = {
    cmdty_alloys: 12,
    cmdty_comp_circuitry: 6,
    cmdty_fuel_cells: 4,
  };
  state.player.cargo.usedVolume = 30;
  state.player.cargo.usedMass = 30;
}

function bootActiveInfrastructure() {
  const harness = bootClaims();
  loadSlingMaterials(harness.state);
  assert.equal(harness.sys.buildModule(harness.body.id, 'mod_throughline_sling'), true);
  harness.state.simTime = harness.body.infrastructure.alignUntil;
  harness.sys.update(0, harness.state);
  assert.equal(harness.body.infrastructure.operational, true);
  return harness;
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

test('Throughline Sling is a material-built Industrial Refinery route, not a credit-only teleport', () => {
  const def = BODY_MODULE_BY_ID.get('mod_throughline_sling');
  assert.ok(def, 'Throughline Sling module is registered');
  assert.equal(def.effect, 'travel_sling');
  assert.equal(def.requiresSpec, 'spec_refinery');
  assert.deepEqual(def.materials, {
    cmdty_alloys: 12,
    cmdty_comp_circuitry: 6,
    cmdty_fuel_cells: 4,
  });
  assert.equal(typeof claimsBase.activeTravelInfrastructure, 'function');

  const h = bootClaims();
  const blocked = describeBaseBuildAction(def, h.state.player, h.body);
  assert.equal(blocked.state, 'materials');
  assert.equal(blocked.disabled, true);
  const creditsBefore = h.state.player.credits;
  assert.equal(h.sys.buildModule(h.body.id, def.id), false, 'missing materials fail before spend');
  assert.equal(h.state.player.credits, creditsBefore);

  loadSlingMaterials(h.state);
  h.body.spec.status = 'cold';
  assert.equal(describeBaseBuildAction(def, h.state.player, h.body).state, 'requires');
  assert.equal(h.sys.buildModule(h.body.id, def.id), false, 'a cold industrial claim cannot fabricate the route');
  assert.equal(h.state.player.credits, creditsBefore);
  assert.equal(h.state.player.cargo.items.cmdty_alloys, 12);
  h.body.spec.status = 'active';
  assert.equal(describeBaseBuildAction(def, h.state.player, h.body).state, 'available');
  assert.equal(h.sys.buildModule(h.body.id, def.id), true);
  assert.deepEqual(h.state.player.cargo.items, {}, 'exact fabrication recipe is consumed');
  assert.equal(h.state.player.credits, creditsBefore - def.cost);
  assert.equal(h.body.infrastructure.schema, CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA);
  assert.equal(h.body.infrastructure.stationId, STATION_ID);
  assert.equal(h.body.infrastructure.stage, 'aligning');
  assert.equal(h.body.infrastructure.operational, false);
  assert.ok(h.body.infrastructure.distanceWU > 1000, 'a real route, not a decorative ring offset');
  assert.deepEqual(h.body.infrastructure.fabricationReceipt.materials, def.materials);
  assert.equal(h.body.infrastructure.fabricationReceipt.costCr, def.cost);
  assert.equal(h.sys.buildModule(h.body.id, def.id), false, 'construction is idempotent');
  assert.equal(h.state.player.credits, creditsBefore - def.cost, 'retry spends nothing');

  h.state.simTime = h.body.infrastructure.alignUntil - 0.01;
  h.sys.update(0, h.state);
  assert.equal(h.body.infrastructure.stage, 'aligning');
  h.state.simTime = h.body.infrastructure.alignUntil;
  h.sys.update(0, h.state);
  assert.equal(h.body.infrastructure.stage, 'active');
  assert.equal(h.body.infrastructure.operational, true);
  assert.equal(h.bus.of('claim:infrastructureActive').length, 1);
  assert.equal(h.sys.activeTravelInfrastructure(SECTOR_ID).length, 1);
  assert.equal(h.sys.travelInfrastructureHooks(SECTOR_ID)[0].stationId, STATION_ID);
});

test('claim construction and commissioning stay behind an explicit player confirmation', async () => {
  const module = BODY_MODULE_BY_ID.get('mod_throughline_sling');
  const specialization = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');
  const player = {
    credits: 20_000,
    cargo: {
      items: {
        cmdty_alloys: 12,
        cmdty_comp_circuitry: 6,
        cmdty_fuel_cells: 4,
      },
    },
  };
  const body = { name: 'Pallas Industrial Moon', spec: null };
  const buildConfirm = describeBaseInvestmentConfirm(module, player, body);
  assert.equal(buildConfirm.title, 'Build Throughline Sling?');
  assert.equal(buildConfirm.confirmLabel, 'Build');
  assert.match(buildConfirm.body, /Cost: 18,000 CR\./);
  assert.match(buildConfirm.body, /12 Alloys, 6 Comp Circuitry, 4 Fuel Cells/);
  assert.match(buildConfirm.body, /Adds Throughline Sling to Pallas Industrial Moon/);
  assert.equal(buildConfirm.danger, true, 'a route consuming 90% of available credits is danger');

  let ownerCalls = 0;
  const cancelled = await applyConfirmedBaseInvestment(
    buildConfirm,
    () => { ownerCalls++; return true; },
    async () => false,
  );
  assert.equal(cancelled, false);
  assert.equal(ownerCalls, 0, 'cancel cannot reach the claims owner or consume resources');

  const accepted = await applyConfirmedBaseInvestment(
    buildConfirm,
    () => { ownerCalls++; return true; },
    async (options) => options === buildConfirm,
  );
  assert.equal(accepted, true);
  assert.equal(ownerCalls, 1, 'accept reaches the claims owner exactly once');

  const commissionConfirm = describeBaseInvestmentConfirm(
    specialization,
    { credits: 100_000 },
    body,
    { kind: 'specialization' },
  );
  assert.equal(commissionConfirm.title, 'Commission Industrial Refinery?');
  assert.equal(commissionConfirm.confirmLabel, 'Commission');
  assert.match(commissionConfirm.body, /Sets Pallas Industrial Moon to Industrial Refinery/);
});

test('Throughline identity, placement and active stage survive save/Continue exactly', () => {
  const first = bootActiveInfrastructure();
  const expected = JSON.parse(JSON.stringify(first.body.infrastructure));
  const snapshot = first.sys.serialize();

  const state = makeState();
  const bus = makeBus();
  const restored = Object.create(claimsBase);
  restored.init({ state, bus, helpers: {}, registry: { get: () => null } });
  restored.deserialize(snapshot);
  const body = state.claims.bodies[0];
  assert.deepEqual(body.infrastructure, expected);
  assert.equal(restored.activeTravelInfrastructure(SECTOR_ID).length, 1);
  const marker = describeClaimMapMarker(body, restored.ledger(body.id));
  assert.equal(marker.infrastructure.id, expected.id);
  assert.match(marker.statusLine, /Throughline online/);
  assert.match(marker.statusLine, /Io Harbor/);
  const ownership = buildClaimOwnershipMarkers(state, SECTOR_ID, restored);
  assert.equal(ownership.length, 3, 'claim, acceleration ring and nav relay are all Atlas-visible');
  const ring = ownership.find((entry) => entry.infrastructure && entry.infrastructure.part === 'ring');
  assert.ok(ring);
  const course = resolveCourseTarget(ring);
  assert.deepEqual(course.pos, expected.from, 'the Atlas course resolves the same saved physical ring');

  body.spec.status = 'cold';
  restored.update(0, state);
  assert.equal(body.infrastructure.operational, false, 'existing site status disables only the boost');
  body.spec.status = 'active';
  restored.update(0, state);
  assert.equal(body.infrastructure.operational, true, 'existing recovery path restores the route');
});

test('Travel Burn gains only inside the active physical corridor and structures admit once', () => {
  withTravelFlags(() => {
    const h = bootActiveInfrastructure();
    const infrastructure = h.body.infrastructure;
    const geometry = buildManufacturedLaneGeometry(infrastructure);
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
    const baselineRouteSeconds = infrastructure.distanceWU / base;
    const throughlineRouteSeconds = infrastructure.distanceWU / (base * infrastructure.ceilingMult);
    assert.equal(baselineRouteSeconds / throughlineRouteSeconds, infrastructure.ceilingMult);
    assert.ok(throughlineRouteSeconds < baselineRouteSeconds, 'the saved route has a measured traversal gain');
    const originalPos = { ...playerEntity.pos };
    const originalVel = { ...playerEntity.vel };
    travel.update(1 / 60, h.state);
    travel.update(1 / 60, h.state);
    travel.update(1 / 60, h.state);
    assert.equal(h.state.input.travelDrive.ceiling, base * infrastructure.ceilingMult);
    assert.equal(h.state.input.travelDrive.rampMult, infrastructure.rampMult);
    assert.equal(h.state.travelLanes.manufactured, true);
    assert.equal(h.state.travelLanes.infrastructureOperational, true);
    assert.deepEqual(playerEntity.pos, originalPos, 'lane never moves the player');
    assert.deepEqual(playerEntity.vel, originalVel, 'lane never writes player velocity');
    const structures = spawned.filter((entity) => entity.data && entity.data.claimTravelInfrastructureId === infrastructure.id);
    assert.equal(structures.length, 2, 'one ring and one relay, with no repeated admission');
    assert.deepEqual(structures.map((entity) => entity.data.placeId).sort(), ['place_gate_jump_ring', 'place_nav_buoy']);
    assert.ok(structures.every((entity) => entity.collides === true), 'manufactured structures are solid world bodies');
    assert.ok(structures.every((entity) => entity.flags && entity.flags.invuln === true), 'damage policy is inherited claim status, not local hull attrition');

    const fixScratch = {};
    assert.strictEqual(resolveLaneSegmentInto(geometry, midpoint, fixScratch), fixScratch);
    assert.equal(fixScratch.inLane, true);
    playerEntity.pos.x = midpoint.x - geometry.axis.z * (geometry.radiusWU + 1);
    playerEntity.pos.z = midpoint.z + geometry.axis.x * (geometry.radiusWU + 1);
    travel.update(1 / 60, h.state);
    assert.equal(h.state.input.travelDrive.ceiling, base, 'leaving the tube restores the unmodified drive');
    assert.equal(h.state.input.travelDrive.rampMult, 1);
  });
});

test('the Travel Burn tape names manufactured corridor state without owning the drive', () => {
  assert.equal(travelTapeLaneStatus({
    manufactured: true,
    inLane: true,
    infrastructureStage: 'active',
    infrastructureOperational: true,
    ceilingMult: 2,
  }), 'THROUGHLINE ×2');
  assert.equal(travelTapeLaneStatus({
    manufactured: true,
    inLane: true,
    infrastructureStage: 'aligning',
    infrastructureOperational: false,
    ceilingMult: 1,
  }), 'THROUGHLINE ALIGNING');
  assert.equal(travelTapeLaneStatus({
    manufactured: true,
    inLane: true,
    infrastructureStage: 'active',
    infrastructureOperational: false,
    ceilingMult: 1,
  }), 'THROUGHLINE OFFLINE');
  assert.equal(travelTapeLaneStatus({
    manufactured: true,
    inLane: false,
    infrastructureStage: 'active',
    infrastructureOperational: true,
    ceilingMult: 2,
  }), '', 'the Throughline never occupies the tape outside its physical corridor');
  assert.equal(travelTapeLaneStatus({
    manufactured: false,
    inLane: true,
    ceilingMult: 1.35,
  }), '', 'the authored lane keeps its existing presentation');
});

test('one existing ambient hauler physically flies the same route under normal NPC intent', () => {
  const h = bootActiveInfrastructure();
  const hauler = {
    id: 200,
    type: 'ship',
    alive: true,
    pos: { x: h.station.pos.x, z: h.station.pos.z },
    vel: { x: 7, z: 3 },
    rot: 0,
    data: { worldRecordId: 'traffic:io:200' },
  };
  h.state.entities.set(hauler.id, hauler);
  h.state.entityList.push(hauler);
  h.state.traffic = {
    freighters: [{ id: hauler.id, role: 'hauler', targetId: h.station.id, waitT: 0, nextTradeT: 10 }],
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
  assert.equal(traffic._applyClaimTravelHooks(SECTOR_ID), 1);
  const rec = h.state.traffic.freighters[0];
  assert.equal(rec.claimTravelRoute.hookId, h.body.infrastructure.id);
  const posBefore = { ...hauler.pos };
  const velBefore = { ...hauler.vel };
  traffic.update(1 / 60, h.state);
  assert.equal(hauler.data.intent.moveZ, 1);
  assert.equal(hauler.data.intent.boost, true);
  assert.deepEqual(hauler.pos, posBefore, 'traffic supplies thrust intent, not position');
  assert.deepEqual(hauler.vel, velBefore, 'traffic supplies thrust intent, not velocity');

  h.body.spec.status = 'cold';
  h.sys.update(0, h.state);
  assert.equal(rec.claimTravelRoute, undefined, 'cold-site status event releases the ambient hull');
  assert.equal(hauler.data.claimTravelTrafficHookId, undefined);
});
