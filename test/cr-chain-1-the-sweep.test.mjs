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
    pos: opts.playerPos || { x: ANCHOR.x, z: ANCHOR.z + 900 },
    vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  return { sim, state, bus, player, events };
}

function fireSweep(sim) {
  return sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'sweep_wreck_tow',
    encounterId: 'test_sweep_1',
    sectorId: SECTOR,
    anchor: { ...ANCHOR },
    zoneType: 'border_checkpoint',
    zoneRadius: 500,
    force: true,
  });
}

function castOf(state, live, role) {
  return live.ids.map((id) => state.entities.get(id))
    .filter((e) => e && e.data?.ai?.encounterRole === role);
}

function sideOf(corridor, p) {
  return (p.x - corridor.x) * corridor.n.x + (p.z - corridor.z) * corridor.n.z;
}

test('sweep_wreck_tow is a registered authored encounter shape', () => {
  const enc = ENCOUNTERS.sweep_wreck_tow;
  assert.ok(enc, 'shape must be in the shipped catalog');
  assert.equal(enc.deck, 'patrol');
  assert.deepEqual(enc.shape.situation, 'patrol');
  assert.equal(enc.factionId, 'faction_scn');
});

test('the braid materializes: cutters sweeping the corridor, the marked hull on the far side', () => {
  const { sim, state, player } = makeHarness();
  const res = fireSweep(sim);
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);

  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'sweep_wreck_tow');
  assert.ok(live && live.phase === 'conflict');
  const sweep = live.data.sweep;
  const corridor = sweep.corridor;

  const cutters = castOf(state, live, 'squad');
  assert.equal(cutters.length, 2, 'a cutter pair works the sweep');
  for (const c of cutters) {
    assert.equal(c.data.ai.passive, true, 'sweeping cutters hold passive');
    // Sweep velocity runs along the corridor axis, not across it.
    const v = Math.hypot(c.vel.x, c.vel.z);
    const along = Math.abs(c.vel.x * corridor.axis.x + c.vel.z * corridor.axis.z) / (v || 1);
    assert.ok(along > 0.95, 'cutters shuttle along the corridor line');
  }

  // The marked hull is on the side opposite the player's approach — across the band.
  const wreck = state.entities.get(sweep.wreckId);
  assert.ok(wreck, 'the prize wreck spawned');
  const playerSide = Math.sign(sideOf(corridor, player.pos)) || 1;
  const wreckSide = sideOf(corridor, wreck.pos);
  assert.ok(Math.sign(wreckSide) === -playerSide, 'the prize is across the sweep, not beside the player');
  assert.ok(Math.abs(wreckSide) > 210, 'the prize sits past the band edge');
  assert.equal(wreck.data.salvagePool.cmdty_ore_einsteinium, 3, 'the marked hull is worth the run');
});

test('detection: the marked hull inside scan reach burns the tow and drops the sweepers hostile', () => {
  const { sim, state, player, events } = makeHarness();
  fireSweep(sim);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'sweep_wreck_tow');
  const sweep = live.data.sweep;
  const wreck = state.entities.get(sweep.wreckId);
  const cutters = castOf(state, live, 'squad');

  // Tow it straight into a sweeper's reach.
  const c0 = cutters[0];
  wreck.pos.x = c0.pos.x + 120; wreck.pos.z = c0.pos.z;
  sim.runTicks(90);

  assert.equal(sweep.burned, true, 'the marked hull in scan reach burns the run');
  for (const c of cutters) {
    assert.equal(c.data.ai.passive, false, 'burned cutters drop inspection');
    assert.equal(c.data.combat?.targetId, player.id, 'the tow line traces to the player');
  }
  assert.ok(events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_scn' && e.payload.delta < 0),
    'a burned tow costs lawful rep');
});

test('lifted: the hull dragged through to the near side pays the fence and resolves clean', () => {
  const { sim, state, events } = makeHarness();
  fireSweep(sim);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'sweep_wreck_tow');
  const sweep = live.data.sweep;
  const wreck = state.entities.get(sweep.wreckId);
  const corridor = sweep.corridor;

  // Drag the prize to the player's side, clear of the band.
  const nearSide = -Math.sign(sweep.wreckSide || 1);
  wreck.pos.x = corridor.x + corridor.n.x * nearSide * (210 + 300 + 50);
  wreck.pos.z = corridor.z + corridor.n.z * nearSide * (210 + 300 + 50);
  sim.runTicks(90);

  assert.equal(live.outcome, 'lifted');
  assert.equal(sweep.burned, false, 'a clean lift never burned');
  assert.ok(events.some((e) => e.name === 'grant' && e.payload.reason === 'sweep:lifted'));
  // The sweep cast is released unstamped — the cutters keep being customs.
  for (const c of castOf(state, live, 'squad')) {
    assert.ok(!c.data?.encounter?.despawnAt, 'cutters released without a despawn stamp');
  }
});

test('sweep_ends: the deadline ships the patrol out', () => {
  const { sim, state } = makeHarness();
  fireSweep(sim);
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === 'sweep_wreck_tow');
  sim.runTicks(60 * 160);
  assert.equal(live.outcome, 'sweep_ends');
});
