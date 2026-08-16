import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENCOUNTERS, ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { classifyKillRewardVictim, killRewardRecipeFor } from '../src/data/killRewards.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  SPECIALIST_ENEMY_IDS,
  SPECIALIST_FAMILY,
  validateSpecialistFamily,
} from '../src/data/specialistFamily.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { planEncounters, planEncounterShape } from '../src/systems/encounterDirector.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
const SPECIALIST_SET = new Set(SPECIALIST_ENEMY_IDS);

const ROLE_ROUTES = Object.freeze([
  Object.freeze({ key: 'tether_cutter', enemyId: 'tether_control_raider', encounterId: 'tether_control_raider_wake', order: 335 }),
  Object.freeze({ key: 'pd_screen', enemyId: 'pd_screen_escort', encounterId: 'pd_screen_wall', order: 331 }),
  Object.freeze({ key: 'jammer', enemyId: 'jammer_specialist', encounterId: 'specialist_jammer_wing', order: 350 }),
  Object.freeze({ key: 'shield_projector', enemyId: 'bulwark_escort', encounterId: 'medium_bulwark_wing', order: 348 }),
  Object.freeze({ key: 'tender', enemyId: 'hostile_repair_tender', encounterId: 'specialist_repair_tender', order: 351 }),
  Object.freeze({ key: 'minelayer', enemyId: 'mine_layer_jackal', encounterId: 'minefield_wake', order: 325 }),
  Object.freeze({ key: 'anchor', enemyId: 'field_anchor_controller', encounterId: 'field_anchor_controller', order: 333 }),
  Object.freeze({ key: 'kiter', enemyId: 'harrier_kiter', encounterId: 'specialist_harrier_kite', order: 352 }),
]);

const NEW_IDENTITIES = Object.freeze(new Map([
  ['jammer_specialist', 42],
  ['hostile_repair_tender', 55],
  ['harrier_kiter', 28],
]));

test('eight specialist roles bind one-to-one to stable production enemy ids', () => {
  assert.deepEqual(validateSpecialistFamily(), []);
  assert.deepEqual(SPECIALIST_ENEMY_IDS, ROLE_ROUTES.map((row) => row.enemyId));
  assert.equal(SPECIALIST_FAMILY.length, 8);
  assert.equal(new Set(SPECIALIST_ENEMY_IDS).size, 8);

  for (const row of ROLE_ROUTES) {
    const contract = SPECIALIST_FAMILY.find((candidate) => candidate.key === row.key);
    assert.ok(contract, `${row.key} has a specialist contract`);
    assert.equal(contract.enemyId, row.enemyId);
    assert.ok(BY_ID.has(row.enemyId), `${row.enemyId} remains a production catalog id`);
    assert.ok(Object.isFrozen(contract));
    assert.ok(Object.isFrozen(contract.behavior));
    assert.ok(Object.isFrozen(contract.worldTell));
  }
});

test('missing identities are fixed-stat medium rewards with exact authored masses at every level', () => {
  for (const [enemyId, mass] of NEW_IDENTITIES) {
    const def = BY_ID.get(enemyId);
    assert.ok(def, `${enemyId} is admitted to the enemy catalog`);
    assert.equal(def.mass, mass);
    assert.ok(def.mass > 20 && def.mass <= 60, `${enemyId} sits in the Plan 11 medium band`);
    assert.equal(def.fixedCombatStats, true);
    assert.equal(def.killRewardTier, 'medium');
    const expectedRuntime = enemyId === 'jammer_specialist' || enemyId === 'harrier_kiter'
      ? 'existing'
      : 'unwired';
    assert.equal(def.specialistBehavior?.runtime, expectedRuntime);
    assert.equal(def.specialistWorldTell?.runtime, expectedRuntime);

    const low = makeEnemySpawnSpec(enemyId, 1, { x: 0, z: 0 });
    const high = makeEnemySpawnSpec(enemyId, 12, { x: 0, z: 0 });
    assert.deepEqual(
      [high.mass, high.hull, high.armorHp, high.shield],
      [low.mass, low.hull, low.armorHp, low.shield],
      `${enemyId} health and mass cannot inflate with encounter level`,
    );
    assert.deepEqual(
      high.data.weapons.map(({ dmg, rof, range }) => [dmg, rof, range]),
      low.data.weapons.map(({ dmg, rof, range }) => [dmg, rof, range]),
      `${enemyId} weapon budget cannot inflate with encounter level`,
    );
    assert.equal(classifyKillRewardVictim(high), 'medium');
    assert.equal(killRewardRecipeFor(high).id, 'medium');
  }
});

test('contracts claim only specialist mechanics with landed production owners', () => {
  const existingBehavior = SPECIALIST_FAMILY
    .filter((row) => row.behavior.runtime === 'existing')
    .map((row) => row.key);
  const existingWorldTell = SPECIALIST_FAMILY
    .filter((row) => row.worldTell.runtime === 'existing')
    .map((row) => row.key);

  assert.deepEqual(existingBehavior, ['tether_cutter', 'pd_screen', 'jammer', 'shield_projector', 'anchor', 'kiter']);
  assert.deepEqual(existingWorldTell, ['tether_cutter', 'jammer', 'anchor', 'kiter']);
  const pdScreen = SPECIALIST_FAMILY.find((candidate) => candidate.key === 'pd_screen');
  assert.equal(pdScreen.behavior.owner, 'physics_owned_pd_interception_v1');
  assert.equal(pdScreen.worldTell.runtime, 'unwired', 'pd_screen world tell stays an honest handoff');
  for (const key of ['tender', 'minelayer']) {
    const row = SPECIALIST_FAMILY.find((candidate) => candidate.key === key);
    assert.equal(row.behavior.runtime, 'unwired', `${key} behavior stays an honest handoff`);
    assert.equal(row.worldTell.runtime, 'unwired', `${key} world tell stays an honest handoff`);
  }
});

test('each ordinary specialist shape guarantees exactly one anchor and only ordinary companions', () => {
  const zones = [
    ...zonesForSector('sector_pallas_drift'),
    ...zonesForSector('sector_sker_haven'),
  ];

  for (const row of ROLE_ROUTES) {
    const shape = ENCOUNTERS[row.encounterId];
    const module = ENCOUNTER_MODULES.find((candidate) => candidate.encounterOrder === row.order);
    assert.ok(shape, `${row.encounterId} is in the production catalog`);
    assert.equal(module?.default, shape, `${row.encounterId} is registered at order ${row.order}`);
    assert.ok(shape.weight > 0, `${row.encounterId} has nonzero planner weight`);
    assert.notEqual(shape.gates?.externalOnly, true, `${row.encounterId} is not request-only`);
    assert.equal(shape.squad.anchorArchetype, row.enemyId);
    assert.ok(shape.squad.archetypes.length > 0);
    assert.ok(
      shape.squad.archetypes.every((enemyId) => !SPECIALIST_SET.has(enemyId)),
      `${row.encounterId} does not hide a second specialist in the sampled escort pool`,
    );

    const zone = zones.find((candidate) => shape.zoneTypes.includes(candidate.type));
    assert.ok(zone, `${row.encounterId} has a production zone for composition resolution`);
    for (const rngValue of [0, 0.999999]) {
      const planned = planEncounterShape(shape, zone, zone.sectorId, 0, row.order, () => rngValue);
      assert.equal(
        planned.ships.filter((ship) => ship.archetype === row.enemyId).length,
        1,
        `${row.encounterId} realizes one guaranteed specialist at rng ${rngValue}`,
      );
      assert.equal(planned.ships[0].compositionRole, 'identity_anchor');
      assert.ok(planned.ships.slice(1).every((ship) => ship.compositionRole === 'light'));
    }
  }
});

test('all eight specialist roles naturally enter the ordinary weighted planner', () => {
  const sectors = ['sector_pallas_drift', 'sector_sker_haven'];
  const target = new Set(ROLE_ROUTES.map((row) => row.encounterId));
  const reached = new Set();
  for (let seed = 1; seed <= 256 && reached.size < ROLE_ROUTES.length; seed++) {
    for (const sectorId of sectors) {
      const schedule = planEncounters(seed, sectorId, 0, zonesForSector(sectorId));
      for (const item of schedule) {
        if (target.has(item.shapeId)) reached.add(item.shapeId);
      }
    }
  }
  assert.deepEqual(
    ROLE_ROUTES.filter((row) => !reached.has(row.encounterId)),
    [],
    'every specialist anchor must win a normal weighted slot without a forced encounter request',
  );
});

test('generated encounter index is fresh after specialist reachability admission', () => {
  const freshness = spawnSync(process.execPath, ['scripts/build-encounter-index.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(freshness.status, 0, `${freshness.stdout}\n${freshness.stderr}`);
});
