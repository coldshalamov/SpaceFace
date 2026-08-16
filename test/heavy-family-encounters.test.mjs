import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ENCOUNTERS, ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { planEncounters, planEncounterShape } from '../src/systems/encounterDirector.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CASES = Object.freeze([
  Object.freeze({ id: 'heavy_gunship_turret_boat', order: 342, enemyId: 'heavy_gunship' }),
  Object.freeze({ id: 'heavy_ramscoop_charge', order: 343, enemyId: 'heavy_ramscoop' }),
  Object.freeze({ id: 'heavy_carrier_lite_screen', order: 344, enemyId: 'heavy_carrier_lite' }),
  Object.freeze({ id: 'heavy_foundry_mine_line', order: 345, enemyId: 'heavy_foundry' }),
]);
const HEAVY_IDS = new Set(['heavy_gunship', 'heavy_ramscoop', 'heavy_carrier_lite', 'heavy_foundry']);

test('each heavy fight shape is a guaranteed single anchor with only ordinary sampled companions', () => {
  const zones = [
    ...zonesForSector('sector_pallas_drift'),
    ...zonesForSector('sector_sker_haven'),
  ];
  for (const row of CASES) {
    const shape = ENCOUNTERS[row.id];
    const module = ENCOUNTER_MODULES.find((candidate) => candidate.encounterOrder === row.order);
    assert.equal(module?.default, shape, `${row.id} is registered at its reserved order`);
    assert.ok(shape.weight > 0);
    assert.notEqual(shape.gates?.externalOnly, true);
    assert.equal(shape.squad.anchorArchetype, row.enemyId);
    assert.ok(shape.squad.archetypes.length > 0);
    assert.ok(shape.squad.archetypes.every((id) => !HEAVY_IDS.has(id)),
      `${row.id} cannot quietly sample a second heavy`);

    const zone = zones.find((candidate) => shape.zoneTypes.includes(candidate.type));
    assert.ok(zone, `${row.id} has an ordinary production zone`);
    for (const rngValue of [0, 0.999999]) {
      const planned = planEncounterShape(shape, zone, zone.sectorId, 0, row.order, () => rngValue);
      assert.equal(planned.ships.filter((ship) => ship.archetype === row.enemyId).length, 1);
      assert.equal(planned.ships[0].compositionRole, 'identity_anchor');
      assert.ok(planned.ships.slice(1).every((ship) => ship.compositionRole === 'light'));
      const canonical = makeEnemySpawnSpec(row.enemyId, 99, { x: 0, z: 0 });
      assert.equal(canonical.data.fixedCombatStats, true);
    }
  }
});

test('all landed heavy fight shapes naturally win weighted planner slots and the generated index is fresh', () => {
  const reached = new Set();
  for (let seed = 1; seed <= 512 && reached.size < CASES.length; seed++) {
    for (const sectorId of ['sector_pallas_drift', 'sector_sker_haven']) {
      for (const item of planEncounters(seed, sectorId, 0, zonesForSector(sectorId))) {
        if (CASES.some((row) => row.id === item.shapeId)) reached.add(item.shapeId);
      }
    }
  }
  assert.deepEqual(CASES.filter((row) => !reached.has(row.id)), [],
    'every anchor enters ordinary schedules without a forced request');

  const freshness = spawnSync(process.execPath, ['scripts/build-encounter-index.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(freshness.status, 0, `${freshness.stdout}\n${freshness.stderr}`);
});
