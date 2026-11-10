import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import {
  WEATHER_VOLUMES,
  weatherPhase,
  pointInsideWeatherVolume,
} from '../src/data/environmentalMachinery.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';

const SECTOR = 'sector_veil_nebula';
const LANE = WEATHER_VOLUMES.find((v) => v.id === 'veil_storm_lane');
const MOUTH = LANE.globalPos;
const DIR = LANE.dir;

function makeHarness(opts = {}) {
  const sim = createSimulation({
    seed: opts.seed || 29,
    systems: [spawnBudget, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: opts.playerPos || { x: MOUTH.x - 300, z: MOUTH.z - 300 },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('comms:log', (p) => events.push({ name: 'comms', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  return { sim, state, bus, player, events };
}

function fireSurge(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'surge_line',
    encounterId: 'test_surge_1',
    sectorId: SECTOR,
    anchor: { x: MOUTH.x, z: MOUTH.z },
    zoneType: 'nebula_fog',
    zoneRadius: 500,
    force: true,
  });
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role);
}

function liveOf(state) {
  return Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'surge_line');
}

test('surge_line is a registered authored encounter shape pinned to the Blind Nebula', () => {
  const enc = ENCOUNTERS.surge_line;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.shape.situation, 'ambush');
  assert.deepEqual(enc.zoneTypes, ['nebula_fog'],
    'the braid exists only where the storm lane exists');
  assert.deepEqual(enc.gates.sectorIds, ['sector_veil_nebula']);
  assert.equal(enc.factionId, 'faction_vael');
});

test('waiting bodies: courier at the mouth, catchers inside the lane near the exit, pods in the sheet', () => {
  const { sim, state } = makeHarness();
  const res = fireSurge(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = liveOf(state);
  assert.ok(live && live.phase === 'conflict');

  const courier = castOf(state, live, 'hauler')[0];
  assert.ok(courier, 'the courier exists');
  assert.ok(pointInsideWeatherVolume(LANE, courier.pos), 'the courier waits inside the lane');
  assert.equal(courier.data.ai.activity?.kind, 'loiter', 'the courier holds for the surge');
  assert.equal(courier.data.ai.roe, 'hold_fire');

  const catchers = castOf(state, live, 'raider');
  assert.ok(catchers.length >= 2, 'a catching pair waits downrange');
  for (const c of catchers) {
    assert.ok(pointInsideWeatherVolume(LANE, c.pos), 'catchers wait inside the same sheet');
    assert.equal(c.data.ai.activity?.kind, 'loiter', 'catchers hold for the wave');
    assert.equal(c.data.ai.roe, 'hold_fire', 'catchers hold fire until the surge');
    // Downrange of the courier — the conveyor delivers the courier to them.
    const along = (c.pos.x - MOUTH.x) * DIR.x + (c.pos.z - MOUTH.z) * DIR.z;
    const courierAlong = (courier.pos.x - MOUTH.x) * DIR.x + (courier.pos.z - MOUTH.z) * DIR.z;
    assert.ok(along > courierAlong + 150, 'the catch waits at the delivery end');
  }

  const pods = (live.data.pods || []).map((id) => state.entities.get(id)).filter(Boolean);
  assert.equal(pods.length, 3, 'three pods ride the lane');
  for (const p of pods) {
    assert.equal(p.data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE);
    assert.equal(p.data.commodityId, 'cmdty_gas_helium3');
    assert.ok(pointInsideWeatherVolume(LANE, p.pos), 'pods sit inside the sheet');
  }
});

test('the wave springs the catch: surge flips the catchers to attack_run on the courier', () => {
  const { sim, state, events } = makeHarness();
  fireSurge(sim);
  const live = liveOf(state);
  const courier = castOf(state, live, 'hauler')[0];
  assert.equal(weatherPhase(LANE, state.simTime).phase, 'warning', 'fire lands in the warning beat');

  // WEATHER_CYCLE: warning 2s → surge 6s → calm 4s. Cross into the surge.
  sim.runTicks(150);
  assert.equal(weatherPhase(LANE, state.simTime).phase, 'surge');
  for (const c of castOf(state, live, 'raider')) {
    assert.equal(c.data.ai.activity?.kind, 'attack_run', 'the surge springs the catch');
    assert.equal(c.data.ai.roe, 'weapons_free');
    assert.equal(c.data.ai.activity?.targetId, courier.id, 'the wave carries the hunters to the courier');
  }
  const texts = events.filter((e) => e.name === 'comms').map((e) => e.payload.text).join(' | ');
  assert.ok(/RIDING/.test(texts), 'the courier calls the wave');
});

test('rode_the_surge: the courier crossing the exit line ends the run clean', () => {
  const { sim, state } = makeHarness();
  fireSurge(sim);
  const live = liveOf(state);
  const courier = castOf(state, live, 'hauler')[0];
  courier.pos.x = MOUTH.x + DIR.x * 540;
  courier.pos.z = MOUTH.z + DIR.z * 540;
  sim.runTicks(90);
  assert.equal(live.outcome, 'rode_the_surge');
});

test('line_held: cutting the catch pays out', () => {
  const { sim, state, bus, events } = makeHarness();
  fireSurge(sim);
  const live = liveOf(state);
  for (const c of castOf(state, live, 'raider')) {
    bus.emit('entity:killed', { id: c.id, killerId: state.playerId, pos: c.pos });
    c.alive = false;
  }
  sim.runTicks(90);
  assert.equal(live.outcome, 'line_held');
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'surge:line_held'));
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_free'));
});

test('rider_down: losing the courier resolves honestly', () => {
  const { sim, state, bus } = makeHarness();
  fireSurge(sim);
  const live = liveOf(state);
  const courier = castOf(state, live, 'hauler')[0];
  bus.emit('entity:killed', { id: courier.id, killerId: 'test', pos: courier.pos });
  courier.alive = false;
  sim.runTicks(90);
  assert.equal(live.outcome, 'rider_down');
});
