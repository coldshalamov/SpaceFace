import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { volatileClassOf } from '../src/data/commodityVolatileClasses.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const SECTOR = 'sector_tethys_junction';
// Stand-in for The Anvil's global centre — requestAuthoredEncounter anchors the plan here.
const ANVIL = Object.freeze({ x: 5000, z: 5000 });

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
    pos: opts.playerPos || { x: ANVIL.x + 1600, z: ANVIL.z },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  return { sim, state, bus, player, events };
}

function fireChord(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'sling_chord',
    encounterId: 'test_chord_1',
    sectorId: SECTOR,
    anchor: { ...ANVIL },
    zoneType: 'planetary_mass',
    zoneRadius: 1000,
    force: true,
  });
}

function trainPods(state, live) {
  return (live.data.trainIds || []).map((id) => state.entities.get(id)).filter(Boolean);
}

test('sling_chord is a registered authored encounter shape', () => {
  const enc = ENCOUNTERS.sling_chord;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'combat');
  assert.deepEqual(enc.shape.situation, 'salvage');
  assert.deepEqual(enc.shape.place, ['planetary_mass']);
});

test('the braid materializes: a helium-3 train on the sling band, skiff at the head, raiders on the chord', () => {
  const { sim, state } = makeHarness();
  const res = fireChord(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);

  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'sling_chord');
  assert.ok(live, 'encounter must be live after fire');
  assert.equal(live.phase, 'conflict');

  const skiff = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');
  assert.ok(skiff, 'the gas skiff must spawn');
  assert.equal(raiders.length, 2, 'a raider pair cuts the chord');

  // The train: physical persistent pods of the Anvil's rich skim yield, riding the band.
  // The director may slide the anchor toward the player — measure from the recorded centre.
  const center = live.data.chord.center;
  const pods = trainPods(state, live);
  assert.equal(pods.length, 7, 'seven pods string the arc');
  for (const pod of pods) {
    assert.equal(pod.data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE);
    assert.equal(pod.data.commodityId, 'cmdty_gas_helium3');
    assert.equal(volatileClassOf(pod.data)?.id, 'cryogenic',
      'the train is the Anvil skim yield — cryogenic, not another fuel-cell minefield');
    const r = Math.hypot(pod.pos.x - center.x, pod.pos.z - center.z);
    assert.ok(r > 1040 && r < 1450, `pod rides the sling band (r=${r.toFixed(0)})`);
    // Velocity is tangential: perpendicular to the radial. dot(radial, vel) ≈ 0.
    const radial = { x: (pod.pos.x - center.x) / r, z: (pod.pos.z - center.z) / r };
    const dot = radial.x * pod.vel.x + radial.z * pod.vel.z;
    const speed = Math.hypot(pod.vel.x, pod.vel.z);
    assert.ok(Math.abs(dot) < speed * 0.15, 'pods move tangentially — they ride the curve, not across it');
  }

  // The skiff rides the train head tangentially — gathering, not fleeing.
  assert.ok(Math.hypot(skiff.vel.x, skiff.vel.z) > 20, 'skiff is moving with the train');
  assert.equal(skiff.data.ai.moraleImmune, true);

  // The raiders' velocity carries a strong inward component — a chord, not an orbit.
  for (const r of raiders) {
    const rr = Math.hypot(r.pos.x - center.x, r.pos.z - center.z);
    const radial = { x: (r.pos.x - center.x) / rr, z: (r.pos.z - center.z) / rr };
    const inward = -(radial.x * r.vel.x + radial.z * r.vel.z);
    assert.ok(inward > 30, `raider cuts inward across the arc (inward=${inward.toFixed(0)})`);
    assert.equal(r.data.combat?.targetId, skiff.id, 'raiders are committed onto the skiff');
  }
});

test('chord_cut: raiders down pays MTS rep and scales the grant by pods still riding', () => {
  const { sim, state, bus, events } = makeHarness();
  fireChord(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'sling_chord');
  const skiff = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');

  for (const r of raiders) {
    bus.emit('entity:killed', { id: r.id, killerId: state.playerId, pos: r.pos });
    r.alive = false;
  }
  sim.runTicks(120);

  assert.equal(live.outcome, 'chord_cut');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_mts'));
  const grant = events.find((e) => e.name === 'grant' && e.payload.reason === 'curve:train_recovered');
  assert.ok(grant, 'the skiff pays for its train');
  assert.equal(grant.payload.amount, 90 + 30 * 7, 'all seven pods intact pays the full thanks');
  assert.equal(skiff.alive !== false, true, 'the skiff keeps gathering');
});

test('skiff_down releases the cast; the train stays physical', () => {
  const { sim, state, bus } = makeHarness();
  fireChord(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'sling_chord');
  const skiff = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');

  bus.emit('entity:killed', { id: skiff.id, killerId: raiders[0].id, pos: skiff.pos });
  skiff.alive = false;
  sim.runTicks(120);

  assert.equal(live.outcome, 'skiff_down');
  for (const r of raiders) {
    assert.equal(r.alive !== false, true, 'raiders are released, not stamped');
    assert.ok(!r.data?.encounter?.despawnAt, 'no despawnAt stamp');
  }
  // The train outlives the fight as loose world bodies.
  const pods = trainPods(state, live);
  assert.equal(pods.length, 7, 'the train stays physical after the resolve');
});
