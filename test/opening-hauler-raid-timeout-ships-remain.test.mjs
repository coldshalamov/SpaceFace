import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';

function makeHarness(opts = {}) {
  const sectorId = opts.sectorId || 'sector_helios_prime';
  const sim = createSimulation({ seed: opts.seed || 101, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: opts.playerPos || { x: 180, z: 330 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  return { sim, state, bus, player };
}

test('opening raid timeout: raid_over leaves the hauler and raiders as ordinary entities (seed 4242)', () => {
  const seed = 4242;
  const { sim, state } = makeHarness({ seed, playerPos: { x: 0, z: 0 } });
  const zones = zonesForSector('sector_helios_prime');
  const plan = planEncounters(seed, 'sector_helios_prime', 0, zones);
  const raidPlan = plan.find((it) => it.shapeId === 'opening_hauler_raid');
  assert.ok(raidPlan, 'day-0 plan must include the opening hauler raid');

  const dir = state.encounterDirector;
  dir.pending = [{ ...raidPlan, dueAt: raidPlan.delay, defers: 0 }];
  dir.pressure.combat = 30; // satisfies pressureCost 20
  state.simTime = raidPlan.delay + 1;
  sim.runTicks(120); // pump + fire + spawn ticks

  const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
  assert.ok(live, 'the raid must fire while the player is in reach of the lane');
  assert.equal(live.phase, 'conflict');

  const squad = live.ids.map((id) => state.entities.get(id)).filter((e) => e && e.alive !== false);
  const hauler = squad.find((e) => e.data?.ai?.encounterRole === 'hauler');
  const raiders = squad.filter((e) => e.data?.ai?.encounterRole === 'raider');
  assert.ok(hauler, 'a hauler must be spawned');
  assert.ok(raiders.length >= 1, 'raiders must be spawned');
  for (const e of squad) {
    assert.equal(e.data.despawnAt ?? null, null, 'no ship carries a despawn timer mid-raid');
  }
  const squadIds = squad.map((e) => e.id);

  // Let the scripted raid time out with no player intervention.
  state.simTime = live.deadlineAt + 1;
  sim.runTicks(120);

  assert.equal(live.phase, 'done', 'the encounter must close at the deadline');
  assert.equal(live.outcome, 'raid_over', 'the timeout resolves as raid_over');
  assert.ok(!Object.values(dir.live).some((l) => l.shapeId === 'opening_hauler_raid'),
    'the encounter must leave the live set');

  // Past both the old +8s despawnAll stagger and the director's +45s resolve straggler stamp:
  // every ship is still a live, ordinary entity — present, alive, and carrying no despawn timer.
  state.simTime = live.deadlineAt + 50;
  sim.runTicks(120);
  for (const id of squadIds) {
    const e = state.entities.get(id);
    assert.ok(e, `ship ${id} must still exist in the world after the raid times out`);
    assert.notEqual(e.alive, false, `ship ${id} must still be alive after the raid times out`);
    assert.equal(e.data.despawnAt ?? null, null,
      `ship ${id} must not be scheduled for despawn by raid_over`);
  }
  assert.ok(state.entities.get(hauler.id), 'the hauler is still there');
  for (const r of raiders) {
    assert.ok(state.entities.get(r.id), 'a raider is still there');
  }
  // Ordinary entities: no live encounter row owns any of them any more.
  for (const row of Object.values(dir.live)) {
    for (const id of squadIds) {
      assert.ok(!row.ids.includes(id), `ship ${id} must not stay owned by a resolved encounter`);
    }
  }
});
