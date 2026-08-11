import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime, NPC_JOB_HEAVE_TO_DURATION_S } from '../src/systems/npcJobsRuntime.js';
import { scanner } from '../src/systems/scanner.js';
import { traffic, TRAFFIC_HEAVE_TO_DURATION_S, TRAFFIC_LAW_LOSS_CAUSE } from '../src/systems/traffic.js';
import { travelLanes, projectOntoLane } from '../src/systems/travelLanes.js';
import { LANE_HELIOS_TETHYS, buildLaneGeometry } from '../src/data/travelLaneRoutes.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { CONTACT_HAIL_ACTION_HEAVE_TO } from '../src/data/contactHail.js';

const DT = 1 / 60;
const GEOMETRY = buildLaneGeometry(LANE_HELIOS_TETHYS);

function withLaneFlag(fn) {
  const priorLane = TRAVEL_FLAGS.laneBoost;
  const priorBurn = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.laneBoost = true;
  TRAVEL_FLAGS.travelBurn = true;
  try { return fn(); } finally {
    TRAVEL_FLAGS.laneBoost = priorLane;
    TRAVEL_FLAGS.travelBurn = priorBurn;
  }
}

function onChord(along) {
  return {
    x: GEOMETRY.from.x + GEOMETRY.axis.x * along,
    z: GEOMETRY.from.z + GEOMETRY.axis.z * along,
  };
}

function spawnPlayer(sim, pos = { x: 0, z: 0 }) {
  const player = sim.spawn({
    type: 'ship',
    alive: true,
    team: 0,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    radius: 8,
    hull: 100,
    hullMax: 100,
    data: {},
  });
  sim.state.playerId = player.id;
  return player;
}

function spawnCivilian(sim, pos = { x: 100, z: 0 }, role = 'hauler') {
  return sim.spawn({
    type: 'ship',
    alive: true,
    team: 2,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    radius: 8,
    hull: 100,
    hullMax: 100,
    data: {
      trafficRole: role,
      callsign: 'TEST CIVILIAN',
      ai: { passive: true, archetype: 'fleeing_trader', spawnContext: 'convoy_civilian' },
    },
  });
}

function haulerJobSpec() {
  return {
    kind: NPC_JOB_KIND.HAULER,
    route: [{ id: 'origin', pos: { x: 100, z: 0 } }, { id: 'dest', pos: { x: 250, z: 0 } }],
    sectorId: 'sector_presence',
    speed: 80,
    commissionS: 1,
    departS: 1,
    approachS: 1,
    workS: 1,
    loadS: 1,
    unloadS: 1,
    dwellS: 1,
    payload: { commodity: 'ore', units: 4 },
  };
}

function setupJobThreat(heat) {
  const sim = createSimulation({ seed: 17, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_presence';
  sim.state.player.heat = heat;
  spawnPlayer(sim, { x: 0, z: 0 });
  const civilian = spawnCivilian(sim, { x: 120, z: 0 });
  civilian.data.worldRecordId = `wr-threat-${heat}`;
  civilian.data.sectorId = 'sector_presence';
  const runtime = sim.registry.get('npcJobsRuntime');
  const jobId = runtime.assign(civilian, haulerJobSpec());
  return { sim, runtime, civilian, jobId };
}

test('R1: WANTED player triggers working-hull flee; clean player does not', () => {
  const clean = setupJobThreat(0);
  clean.runtime.update(DT, clean.sim.state);
  assert.notEqual(clean.runtime._byId()[clean.jobId].job.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(clean.runtime._byId()[clean.jobId].threatId, null);

  const wanted = setupJobThreat(0.5);
  wanted.runtime.update(DT, wanted.sim.state);
  assert.equal(wanted.runtime._byId()[wanted.jobId].job.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(wanted.runtime._byId()[wanted.jobId].threatId, wanted.sim.state.playerId);
});

test('R2: HEAVE TO leases job hulls through npcJobsRuntime and expires', () => {
  const sim = createSimulation({ seed: 23, systems: [npcJobsRuntime, scanner] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_presence';
  const player = spawnPlayer(sim);
  const target = spawnCivilian(sim, { x: 100, z: 0 });
  target.data.worldRecordId = 'wr-heave-job';
  target.data.sectorId = 'sector_presence';
  sim.state.player.targetId = target.id;

  const runtime = sim.registry.get('npcJobsRuntime');
  const jobId = runtime.assign(target, haulerJobSpec());
  const offers = [];
  const responses = [];
  sim.bus.on('contactHail:offer', (payload) => offers.push(payload));
  sim.bus.on('contactHail:response', (payload) => responses.push(payload));

  sim.bus.emit('contactHail:request', { targetId: target.id, source: 'test' });
  const offer = offers.at(-1);
  assert.ok(offer.actions.some((action) => action.id === CONTACT_HAIL_ACTION_HEAVE_TO));
  sim.bus.emit('contactHail:choice', {
    requestId: offer.requestId,
    targetId: target.id,
    choice: CONTACT_HAIL_ACTION_HEAVE_TO,
  });

  assert.match(responses.at(-1).lines.join(' '), /COMPLYING/);
  assert.ok(runtime.controlClaim(jobId), 'job owner holds a movement lease');
  assert.equal(player.id, sim.state.playerId);

  sim.state.simTime += NPC_JOB_HEAVE_TO_DURATION_S + 0.01;
  runtime.update(DT, sim.state);
  assert.equal(runtime.controlClaim(jobId), null, 'lease expires back to the job owner');
});

test('R2: HEAVE TO waits ambient traffic through traffic waitT and expires', () => {
  const sim = createSimulation({ seed: 29, systems: [traffic, scanner] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_presence';
  spawnPlayer(sim);
  const target = spawnCivilian(sim, { x: 80, z: 0 });
  const station = sim.spawn({
    type: 'station',
    alive: true,
    pos: { x: 300, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 30,
    data: { stationId: 'station_presence', name: 'Presence Station' },
  });
  sim.state.player.targetId = target.id;
  sim.state.traffic.freighters.push({
    id: target.id,
    role: 'hauler',
    targetId: station.id,
    waitT: 0,
    nextTradeT: 10,
    orbitPhase: 0,
    dockSeq: 0,
    manifest: null,
  });

  const offers = [];
  sim.bus.on('contactHail:offer', (payload) => offers.push(payload));
  sim.bus.emit('contactHail:request', { targetId: target.id, source: 'test' });
  const offer = offers.at(-1);
  assert.ok(offer.actions.some((action) => action.id === CONTACT_HAIL_ACTION_HEAVE_TO));
  sim.bus.emit('contactHail:choice', {
    requestId: offer.requestId,
    targetId: target.id,
    choice: CONTACT_HAIL_ACTION_HEAVE_TO,
  });

  const rec = sim.state.traffic.freighters[0];
  assert.ok(rec.waitT >= TRAFFIC_HEAVE_TO_DURATION_S);
  sim.step(TRAFFIC_HEAVE_TO_DURATION_S + 0.1);
  assert.ok(rec.waitT <= 0, 'ambient wait window expires through the traffic owner');
});

test('R3: patrol kill emits law-flavored loss intent through traffic', () => {
  const sim = createSimulation({ seed: 31, systems: [traffic] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_presence';
  const patrol = sim.spawn({
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      trafficRole: 'patrol',
      ai: { passive: true, lawful: true, spawnContext: 'patrol' },
    },
  });
  sim.state.traffic.freighters.push({
    id: patrol.id,
    role: 'patrol',
    targetId: null,
    waitT: 0,
    nextTradeT: 0,
    orbitPhase: 0,
    dockSeq: 0,
    manifest: null,
  });
  const losses = [];
  sim.bus.on('freight:loss', (payload) => losses.push(payload));
  sim.bus.emit('entity:killed', { id: patrol.id, killerId: sim.state.playerId, sectorId: 'sector_presence' });

  assert.equal(losses.length, 1);
  assert.equal(losses[0].cause, TRAFFIC_LAW_LOSS_CAUSE);
  assert.equal(losses[0].lawRole, 'patrol');
});

test('R4: lane traffic is honest infrastructure and dead hulls stop moving', () => withLaneFlag(() => {
  const state = {
    mode: 'flight',
    simTime: 100,
    playerId: 1,
    entities: new Map(),
    player: {},
    input: { travelDrive: { state: 'engaged', cap: 0 } },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: onChord(4096),
    vel: { x: 0, z: 0 },
    rot: 0,
    mass: 1000,
    inertia: 1000,
    propulsion: { id: 'drive_reaction_m' },
  };
  state.entities.set(player.id, player);
  const spawned = [];
  let nextId = 10;
  const sys = Object.create(travelLanes);
  sys.init({
    state,
    bus: { on() {}, emit() {} },
    helpers: {
      spawnEntity(spec) {
        const entity = { id: nextId++, alive: true, ...spec, pos: { ...spec.pos } };
        spawned.push(entity);
        state.entities.set(entity.id, entity);
        return entity;
      },
    },
    registry: { get() { return null; } },
  });

  for (let i = 0; i < 200; i++) { state.simTime += DT; sys.update(DT, state); }
  const laneTraffic = spawned.find((entity) => entity.data && entity.data.parentType === 'lane_traffic');
  assert.ok(laneTraffic);
  assert.equal(Object.prototype.hasOwnProperty.call(laneTraffic, 'hull'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(laneTraffic, 'hullMax'), false);
  assert.match(laneTraffic.data.scanLabel, /lane traffic/i);
  assert.ok(projectOntoLane(GEOMETRY, laneTraffic.pos).offAxisWU < 1e-6);

  const before = { ...laneTraffic.pos };
  laneTraffic.alive = false;
  state.simTime += 1;
  sys.update(DT, state);
  assert.deepEqual(laneTraffic.pos, before, 'dead lane traffic keeps its last position');
}));
