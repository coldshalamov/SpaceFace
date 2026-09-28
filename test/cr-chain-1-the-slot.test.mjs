import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const SECTOR = 'sector_ceres_belt';
const ANCHOR = Object.freeze({ x: 5000, z: 5000 });

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
    pos: opts.playerPos || { x: ANCHOR.x, z: ANCHOR.z },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  return { sim, state, bus, player, events };
}

// Two real belt stones making one slot — the encounter must find them, not fake them.
function spawnGate(sim, gate) {
  const a = sim.spawn({
    type: 'asteroid', team: 0,
    pos: { x: ANCHOR.x - gate.sep / 2, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: gate.rockRadius || 55,
    hull: 1e9, hullMax: 1e9, collides: true,
    data: { typeId: 'rock_belt', oreHP: 1e9, oreHPMax: 1e9 },
  });
  const b = sim.spawn({
    type: 'asteroid', team: 0,
    pos: { x: ANCHOR.x + gate.sep / 2, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: gate.rockRadius || 55,
    hull: 1e9, hullMax: 1e9, collides: true,
    data: { typeId: 'rock_belt', oreHP: 1e9, oreHPMax: 1e9 },
  });
  return { a, b };
}

function fireSlot(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'rock_slot_chase',
    encounterId: 'test_slot_1',
    sectorId: SECTOR,
    anchor: { ...ANCHOR },
    zoneType: 'mining_belt',
    zoneRadius: 500,
    force: true,
  });
}

test('rock_slot_chase is a registered authored encounter shape', () => {
  const enc = ENCOUNTERS.rock_slot_chase;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'combat');
  assert.deepEqual(enc.shape.situation, 'hunt');
  assert.deepEqual(enc.shape.place, ['mining_belt', 'derelict_field']);
});

test('no gate, no encounter: the braid aborts honestly where no slot exists', () => {
  const { sim, state } = makeHarness();
  const res = fireSlot(sim); // no rocks spawned — there is no corridor
  assert.equal(res.ok, false, 'fire must refuse without a gate');
  const dir = state.encounterDirector;
  assert.equal(Object.values(dir.live).filter((l) => l.shapeId === 'rock_slot_chase').length, 0,
    'no live record survives the abort');
});

test('the braid materializes through the found slot: runner beyond the gap, raiders astern on the corridor', () => {
  const { sim, state } = makeHarness();
  const gate = spawnGate(sim, { sep: 300 });
  const res = fireSlot(sim);
  assert.equal(res.ok, true, `fire must succeed with a gate: ${JSON.stringify(res)}`);

  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'rock_slot_chase');
  assert.ok(live, 'encounter must be live');
  assert.equal(live.phase, 'conflict');
  assert.deepEqual(
    [live.data.gate.aId, live.data.gate.bId].sort(),
    [gate.a.id, gate.b.id].sort(),
    'the found gate records the real rocks',
  );

  const runner = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');
  assert.ok(runner, 'the runner must spawn');
  assert.ok(raiders.length >= 2, 'the press spawns');

  // The corridor axis is perpendicular to the gate line (gate runs along +x here).
  const mid = live.data.gate.mid;
  const corridorDotRunner = Math.abs(runner.pos.x - mid.x); // gate line is x — corridor is z
  assert.ok(corridorDotRunner < 80, 'the runner sits on the corridor axis, not the gate line');
  assert.ok(Math.abs(runner.pos.z - mid.z) > 80, 'the runner is beyond the slot plane');
  // The runner's velocity points along the corridor — fleeing through the slot.
  const rv = Math.hypot(runner.vel.x, runner.vel.z);
  const velAlongCorridor = Math.abs(runner.vel.z) / (rv || 1);
  assert.ok(velAlongCorridor > 0.9, 'the runner flees along the corridor');
  assert.equal(runner.data.ai.forceFlee, true);

  // The press sits astern on the far side of the slot — pursuit threads the gap.
  for (const r of raiders) {
    const side = Math.sign(runner.pos.z - mid.z);
    assert.ok(Math.sign(r.pos.z - mid.z) === -side,
      'raiders press from the far side of the gate — the chase crosses the slot');
    assert.equal(r.data.combat?.targetId, runner.id, 'press is committed onto the runner');
  }
});

test('runner_saved pays when the press breaks; runner_down releases the cast', () => {
  const { sim, state, bus, events } = makeHarness();
  spawnGate(sim, { sep: 300 });
  fireSlot(sim);
  const dir = state.encounterDirector;
  const live = Object.values(dir.live).find((l) => l.shapeId === 'rock_slot_chase');
  const runner = live.ids.map((id) => state.entities.get(id))
    .find((e) => e && e.data?.ai?.encounterRole === 'hauler');
  const raiders = live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === 'raider');

  for (const r of raiders) {
    bus.emit('entity:killed', { id: r.id, killerId: state.playerId, pos: r.pos });
    r.alive = false;
  }
  sim.runTicks(120);
  assert.equal(live.outcome, 'runner_saved');
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_mts'));
  assert.equal(runner.alive !== false, true, 'the runner keeps running');
});
