import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { volatileClassOf } from '../src/data/commodityVolatileClasses.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const SECTOR = 'sector_tethys_junction';

function makeHarness(opts = {}) {
  const sim = createSimulation({
    seed: opts.seed || 77,
    systems: [spawnBudget, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: opts.playerPos || { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('comms:log', (p) => events.push({ name: 'comms', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  return { sim, state, bus, player, events };
}

function fireTail(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'volatile_tail',
    encounterId: 'test_tail_1',
    sectorId: SECTOR,
    force: true,
  });
}

function podsIn(state) {
  const out = [];
  for (const e of state.entityList || []) {
    if (e && e.data && e.data.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE) out.push(e);
  }
  return out;
}

test('volatile_tail is a registered authored encounter shape', () => {
  const enc = ENCOUNTERS.volatile_tail;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'combat');
  assert.deepEqual(enc.shape.situation, 'convoy');
  assert.deepEqual(enc.shape.actor, 'mule_trader');
});

test('the braid materializes: fleeing volatile courier, committed raiders, a live pod tail', () => {
  const { sim, state } = makeHarness();
  const res = fireTail(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);

  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'volatile_tail');
  assert.ok(live, 'encounter must be live after fire');
  assert.equal(live.phase, 'conflict');

  const courier = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');
  assert.ok(courier, 'courier must spawn');
  assert.ok(raiders.length >= 1, 'raiders must spawn');

  // The courier is mid-run: fleeing, mauled, hauling the volatile lot.
  assert.equal(courier.data.ai.forceFlee, true, 'courier must be fleeing');
  assert.ok(Math.hypot(courier.vel.x, courier.vel.z) > 20, 'courier is already moving');
  assert.equal(courier.data.cargo.cmdty_fuel_cells > 0, true, 'courier holds the volatile lot');

  // Raiders are committed onto the courier — the pursuit threads the tail.
  for (const r of raiders) {
    assert.equal(r.data.combat?.targetId, courier.id, 'raider must be committed onto the courier');
  }

  // The tail: real colliding volatile fuel-cell pods already drifting the lane.
  const pods = podsIn(state);
  assert.ok(pods.length >= 5, `seeded tail pods must exist (got ${pods.length})`);
  for (const pod of pods) {
    assert.equal(pod.data.commodityId, 'cmdty_fuel_cells');
    const klass = volatileClassOf(pod.data);
    assert.equal(klass && klass.id, 'explosive', 'tail pods must be the explosive volatile class');
    assert.ok(Math.hypot(pod.vel.x, pod.vel.z) > 5, 'tail pods are moving mines, not static');
  }

  // The tail lies between courier and raiders — the pursuit corridor is the minefield.
  const dir_ = live.data.tailDir;
  for (const pod of pods) {
    const behind = (courier.pos.x - pod.pos.x) * dir_.x + (courier.pos.z - pod.pos.z) * dir_.z;
    assert.ok(behind > 0, 'pods sit astern of the courier along its flee line');
  }
});

test('the courier keeps shedding the tail while it runs', () => {
  const { sim, state } = makeHarness();
  fireTail(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'volatile_tail');
  const seeded = podsIn(state).length;
  assert.ok(seeded >= 5);

  sim.runTicks(60 * 8); // ~8 s — past two shed periods
  const grown = podsIn(state).length;
  assert.ok(grown > seeded, `tail must keep shedding (${seeded} -> ${grown})`);
});

test('resolution: raiders down defends the courier', () => {
  const { sim, state, bus, events } = makeHarness();
  fireTail(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'volatile_tail');
  const courier = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');

  for (const r of raiders) {
    bus.emit('entity:killed', { id: r.id, killerId: state.playerId, pos: r.pos });
    r.alive = false;
  }
  sim.runTicks(120);

  assert.equal(live.outcome, 'defended');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_mts'),
    'defending the tender pays MTS rep');
  // The courier survives as a world entity — no despawn stamp from the resolve.
  assert.equal(courier.alive !== false, true, 'courier survives the defense');
});

test('resolution: courier down releases the raiders as world entities', () => {
  const { sim, state, bus } = makeHarness();
  fireTail(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'volatile_tail');
  const courier = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');
  assert.ok(raiders.length >= 1);

  bus.emit('entity:killed', { id: courier.id, killerId: raiders[0].id, pos: courier.pos });
  courier.alive = false;
  sim.runTicks(120);

  assert.equal(live.outcome, 'courier_down');
  // Kill-done releases the cast: raiders keep living in the world, no despawn stamp.
  for (const r of raiders) {
    assert.equal(r.alive !== false, true, 'raiders are not stamped for despawn on courier_down');
    assert.ok(!r.data?.encounter?.despawnAt, 'no despawnAt stamp');
  }
});
