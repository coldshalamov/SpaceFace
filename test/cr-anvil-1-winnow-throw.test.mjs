import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { VESTA_ORE_WINNOW, vestaWinnowPhase } from '../src/data/environmentalMachinery.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';

const SECTOR = 'sector_vesta_forge';
const MOUTH = VESTA_ORE_WINNOW.globalPos;

function makeHarness(opts = {}) {
  const sim = createSimulation({
    seed: opts.seed || 61,
    systems: [spawnBudget, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: opts.playerPos || { x: MOUTH.x + 400, z: MOUTH.z + 400 },
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

function fireWinnow(sim, opts = {}) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'winnow_throw',
    encounterId: opts.id || 'test_winnow_1',
    sectorId: SECTOR,
    anchor: opts.anchor || { x: MOUTH.x, z: MOUTH.z },
    zoneType: 'mining_belt',
    zoneRadius: 500,
    force: true,
  });
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role);
}

function killAll(state, bus, ents) {
  for (const e of ents) {
    bus.emit('entity:killed', { id: e.id, killerId: state.playerId, pos: e.pos });
    e.alive = false;
  }
}

test('winnow_throw is a registered authored encounter shape pinned to Vesta Forge', () => {
  const enc = ENCOUNTERS.winnow_throw;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.deck, 'combat');
  assert.equal(enc.shape.situation, 'claim');
  assert.deepEqual(enc.gates.sectorIds, ['sector_vesta_forge'],
    'the braid exists only where the winnow exists');
});

test('the braid materializes on the machine, not the marker: loaders loiter on the throat', () => {
  const { sim, state } = makeHarness();
  // The planner anchor sits at the belt-zone center — the machine is ~700 WU south of it.
  const res = fireWinnow(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'winnow_throw');
  assert.ok(live && live.phase === 'conflict');

  const loaders = castOf(state, live, 'hauler');
  assert.equal(loaders.length, 2, 'a longshore pair works the throat');
  for (const l of loaders) {
    assert.equal(l.data.ai.activity?.kind, 'loiter', 'loaders hold on the batch');
    assert.equal(l.data.ai.roe, 'hold_fire', 'working crew does not open the fight');
    // Anchored on the machine, not the zone center.
    const d = Math.hypot(l.pos.x - MOUTH.x, l.pos.z - MOUTH.z);
    assert.ok(d < 260, `loader holds at the throat (d=${d.toFixed(0)})`);
  }

  const jumpers = castOf(state, live, 'raider');
  assert.ok(jumpers.length >= 2, 'claim-jumpers inbound on the lane');
  for (const j of jumpers) {
    assert.ok(j.pos.x < MOUTH.x - 600, 'jumpers stage up the discharge lane');
    assert.ok(j.vel.x > 20, 'jumpers run inbound on the throw');
  }

  // The batch is real pods inside the gather well, not decoration.
  const pods = (live.data.pods || []).map((id) => state.entities.get(id)).filter(Boolean);
  assert.equal(pods.length, 5, 'the gathering batch is five real pods');
  for (const p of pods) {
    assert.equal(p.data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE);
    assert.equal(p.data.commodityId, 'cmdty_ore_copper');
    const d = Math.hypot(p.pos.x - MOUTH.x, p.pos.z - MOUTH.z);
    assert.ok(d < 190, 'pods start inside the gather well');
  }
});

test('the cycle narrates itself: warning and discharge barks land on phase transitions', () => {
  const { sim, state, events } = makeHarness();
  fireWinnow(sim);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'winnow_throw');
  assert.equal(live.data.lastPhase, vestaWinnowPhase(0).phase, 'fire reads the live cycle');

  // Cycle: gather 5s → warning 2s → discharge 3s → calm 6s. Cross into discharge.
  sim.runTicks(60 * 8);
  const texts = events.filter((e) => e.name === 'comms').map((e) => e.payload.text).join(' | ');
  assert.ok(/Throat\u2019s live/.test(texts), 'the warning beat lands on the phase edge');
  assert.ok(/THERE GOES THE BATCH/.test(texts), 'the throw lands on the discharge edge');
  assert.equal(live.data.thrown, true);
});

test('claim_broken: the jumpers die, the shift pays out, the cast releases', () => {
  const { sim, state, bus, events } = makeHarness();
  fireWinnow(sim);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'winnow_throw');
  killAll(state, bus, castOf(state, live, 'raider'));
  sim.runTicks(90);
  assert.equal(live.outcome, 'claim_broken');
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'winnow:claim_broken'));
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_dmc'));
  for (const l of castOf(state, live, 'hauler')) {
    assert.ok(!l.data?.encounter?.despawnAt, 'loaders release unstamped — still on shift');
  }
});

test('crew_down: the shift dies, the machine keeps its cycle', () => {
  const { sim, state, bus } = makeHarness();
  fireWinnow(sim);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'winnow_throw');
  killAll(state, bus, castOf(state, live, 'hauler'));
  sim.runTicks(90);
  assert.equal(live.outcome, 'crew_down');
  // The batch stays physical — thrown or gathered, it is never despawned with the cast.
  const pods = (live.data.pods || []).map((id) => state.entities.get(id)).filter(Boolean);
  assert.ok(pods.length > 0, 'the batch is world cargo, not cast');
});

test('shift_ended: the deadline releases the site', () => {
  const { sim, state } = makeHarness();
  fireWinnow(sim);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'winnow_throw');
  sim.runTicks(60 * 145);
  assert.equal(live.outcome, 'shift_ended');
});

test('honest abort: a relocated anchor cannot pretend to be the winnow', () => {
  const { sim, state } = makeHarness();
  const res = fireWinnow(sim, { anchor: { x: MOUTH.x + 5000, z: MOUTH.z } });
  // requestAuthoredEncounter reports the abort through the live record's resolution receipt.
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'winnow_throw');
  assert.equal(res.ok, false, 'fire should refuse when the site moved');
  assert.ok(res.reason === 'resolved_on_fire' || !live || live.outcome, `abort path: ${JSON.stringify(res)}`);
});
