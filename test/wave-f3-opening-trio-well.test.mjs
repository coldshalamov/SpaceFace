import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { FIELD_DEFS } from '../src/data/fields.js';

const STARTER_WELL_DIAMETER_WU = FIELD_DEFS.well.radius * 2; // 240 WU
const HULL_LENGTH_FLOOR_WU = 12; // Minimum distance strictly above a single hull length

function makeHarness(seed = 101) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 180, z: 330 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  return { sim, state, bus, player };
}

test('Wave F3: opening trio spawns 3 raiders inside one well diameter and separated by > hull length', () => {
  for (const seed of [42, 101, 4242, 8008]) {
    const zones = zonesForSector('sector_helios_prime');
    const plan = planEncounters(seed, 'sector_helios_prime', 0, zones);
    const raidPlan = plan.find((it) => it.shapeId === 'opening_hauler_raid');
    assert.ok(raidPlan, `opening_hauler_raid must be planned for seed ${seed}`);

    const raiderShipsInPlan = raidPlan.ships.filter((s) => s.role === 'raider');
    assert.equal(raiderShipsInPlan.length, 3, `opening raid plan must specify 3 raiders (trio), got ${raiderShipsInPlan.length}`);

    // Verify pairwise distances in the plan
    for (let i = 0; i < raiderShipsInPlan.length; i++) {
      for (let j = i + 1; j < raiderShipsInPlan.length; j++) {
        const p1 = raiderShipsInPlan[i].pos;
        const p2 = raiderShipsInPlan[j].pos;
        const dist = Math.hypot(p1.x - p2.x, p1.z - p2.z);
        assert.ok(
          dist < STARTER_WELL_DIAMETER_WU,
          `seed ${seed}: raider pair (${i}, ${j}) distance ${dist.toFixed(1)} WU must be < starter well diameter (${STARTER_WELL_DIAMETER_WU} WU)`,
        );
        assert.ok(
          dist > HULL_LENGTH_FLOOR_WU,
          `seed ${seed}: raider pair (${i}, ${j}) distance ${dist.toFixed(1)} WU must be > hull length (${HULL_LENGTH_FLOOR_WU} WU)`,
        );
      }
    }

    // Now spawn in simulation and assert live entity positions match the trio geometry
    const { sim, state } = makeHarness(seed);
    const dir = state.encounterDirector;
    dir.pending = [{ ...raidPlan, dueAt: 0, defers: 0 }];
    dir.pressure.combat = 30;

    sim.runTicks(60);

    const live = Object.values(dir.live).find((l) => l.shapeId === 'opening_hauler_raid');
    assert.ok(live, `encounter must be live on seed ${seed}`);

    const raiderEnts = live.ids
      .map((id) => state.entities.get(id))
      .filter((e) => e && e.data?.ai?.encounterRole === 'raider');

    assert.equal(raiderEnts.length, 3, `3 live raider entities must spawn on seed ${seed}`);

    for (let i = 0; i < raiderEnts.length; i++) {
      for (let j = i + 1; j < raiderEnts.length; j++) {
        const p1 = raiderEnts[i].pos;
        const p2 = raiderEnts[j].pos;
        const dist = Math.hypot(p1.x - p2.x, p1.z - p2.z);
        assert.ok(
          dist < STARTER_WELL_DIAMETER_WU,
          `live seed ${seed}: raider pair (${i}, ${j}) distance ${dist.toFixed(1)} WU must be < ${STARTER_WELL_DIAMETER_WU} WU`,
        );
        assert.ok(
          dist > HULL_LENGTH_FLOOR_WU,
          `live seed ${seed}: raider pair (${i}, ${j}) distance ${dist.toFixed(1)} WU must be > ${HULL_LENGTH_FLOOR_WU} WU`,
        );
      }
    }
  }
});
