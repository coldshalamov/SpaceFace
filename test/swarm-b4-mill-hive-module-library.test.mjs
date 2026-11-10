// SWARM-07 B4 — the Asteroid Mill and the Hive fold into ARENA_MODULE_LIBRARY.
//
// The two law arenas shipped with ten authored waves each but no library row, so
// previewArenaModule refused them and simulateAuthoredRecipe estimated their recipes
// against a null install. Done when: both preview truthfully, mill + hive recipes
// simulate through the full factory path, the four original modules are unchanged,
// and a law-less arena still resolves through the documented fallback.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARENA_MODULE_BY_ID,
  ARENA_MODULE_LIBRARY,
  ARENA_TOY_MIN,
  HIVE_BOSS_ROLE,
  MILL_BOSS_ROLE,
  previewArenaModule,
  validateArenaModuleLibrary,
} from '../src/data/arenaModuleLibrary.js';
import { FACTORY_WAVE_RECIPE } from '../src/data/contentFactoryExamples.js';
import { simulateAuthoredRecipe } from '../src/data/waveRecipeSimulator.js';
import { MILL_ARENA_ID, planMillInstall } from '../src/systems/asteroidMillArena.js';
import { CINDER_ARENA_ID } from '../src/systems/cinderSluiceArena.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { LAGRANGE_ARENA_ID } from '../src/systems/lagrangeCrucible.js';
import { STORM_ARENA_ID } from '../src/systems/stormLatticeArena.js';
import { HIVE_ARENA_ID, planHiveInstall } from '../src/systems/theHiveArena.js';

const TOY_ARENAS = [LAGRANGE_ARENA_ID, CINDER_ARENA_ID, CRYO_ARENA_ID, STORM_ARENA_ID];
const LAW_BY_ID = Object.freeze({
  [LAGRANGE_ARENA_ID]: 'pull',
  [CINDER_ARENA_ID]: 'current',
  [CRYO_ARENA_ID]: 'freeze',
  [STORM_ARENA_ID]: 'conduct',
  [MILL_ARENA_ID]: 'current',
  [HIVE_ARENA_ID]: 'pull',
});

function factoryRecipe(arenaId, arenaPhase) {
  return {
    ...FACTORY_WAVE_RECIPE,
    id: `factory_probe_${arenaId}_${arenaPhase}`,
    arenaId,
    arenaPhase,
  };
}

test('the library validates with six law arenas: the four originals plus mill and hive', () => {
  const check = validateArenaModuleLibrary();
  assert.equal(check.ok, true, JSON.stringify(check.issues));
  assert.equal(ARENA_MODULE_LIBRARY.length, 6);
  assert.equal(ARENA_MODULE_BY_ID[MILL_ARENA_ID].planInstall, planMillInstall);
  assert.equal(ARENA_MODULE_BY_ID[HIVE_ARENA_ID].planInstall, planHiveInstall);
});

test('previewArenaModule accepts the mill and returns its real grind pair and cover', () => {
  const preview = previewArenaModule(MILL_ARENA_ID, 'idle');
  assert.equal(preview.ok, true, JSON.stringify(preview.issues));
  assert.equal(preview.id, MILL_ARENA_ID);
  // The contract's law enum names the field mechanism: the grind IS a pair of opposed
  // carrying currents, the fiction name 'grind' stays in ARENA_LAWS.
  assert.equal(preview.law, 'current');
  assert.equal(preview.phase, 'idle');
  assert.match(preview.note, /seam/);
  assert.equal(preview.fieldCount, 2);
  const [near, far] = preview.install.fields;
  assert.equal(near.kind, 'cone');
  assert.equal(far.kind, 'cone');
  assert.ok(near.center.z > 0 && far.center.z < 0, 'the pair stands on opposite flanks');
  assert.ok(near.dir.x > 0 && far.dir.x < 0, 'the pair pushes opposite tangential directions');
  assert.equal(near.strength, 55);
  assert.equal(far.strength, 55);
  assert.equal(preview.mineCount, 0);
  assert.equal(preview.cover, true, 'the seam rides every phase');
  // The Mill's machinery is ambient — the grind never sleeps and the seam is the debris
  // layout — so the honest preview authors zero install.toys.
  assert.equal(preview.toyCount, 0);
});

test('previewArenaModule accepts the hive and returns its breath', () => {
  const preview = previewArenaModule(HIVE_ARENA_ID, 'idle');
  assert.equal(preview.ok, true, JSON.stringify(preview.issues));
  assert.equal(preview.id, HIVE_ARENA_ID);
  assert.equal(preview.law, 'pull');
  assert.match(preview.note, /breathe|breath/);
  assert.equal(preview.fieldCount, 1);
  assert.equal(preview.install.fields[0].kind, 'well');
  assert.equal(preview.install.fields[0].strength, 58);
  assert.equal(preview.mineCount, 0);
  assert.equal(preview.cover, false);
  // Living walls and sacs spawn swarm-side, so the install itself declares no toys.
  assert.equal(preview.toyCount, 0);
});

test('mill and hive boss phases preview the authored room upgrades', () => {
  const mill = previewArenaModule(MILL_ARENA_ID, 'boss');
  assert.equal(mill.ok, true);
  assert.equal(mill.cover, true);
  assert.equal(mill.fieldCount, 2, 'grind flank plus the crusher well');
  assert.equal(mill.mineCount, 4, 'the seeded ring');
  const hive = previewArenaModule(HIVE_ARENA_ID, 'boss');
  assert.equal(hive.ok, true);
  assert.equal(hive.cover, true);
  assert.equal(hive.fieldCount, 2, 'deep breath plus the repulsor berm');
  assert.equal(hive.mineCount, 4);
});

test('mill and hive boss roles reuse the dreadnought hull like the other law arenas', () => {
  for (const role of [MILL_BOSS_ROLE, HIVE_BOSS_ROLE]) {
    assert.equal(role.hullId, 'dreadnought_boss');
    assert.equal(role.role, 'elite');
    assert.equal(role.invulnerable, false);
    assert.equal(role.hp, undefined);
    assert.equal(role.hull, undefined);
  }
  assert.equal(MILL_BOSS_ROLE.id, 'seam_crusher');
  assert.equal(MILL_BOSS_ROLE.law, MILL_ARENA_ID);
  assert.equal(MILL_BOSS_ROLE.method, 'thrown_mass');
  assert.equal(HIVE_BOSS_ROLE.id, 'queen_warden');
  assert.equal(HIVE_BOSS_ROLE.law, HIVE_ARENA_ID);
  assert.equal(HIVE_BOSS_ROLE.method, 'machinery');
  assert.equal(ARENA_MODULE_BY_ID[MILL_ARENA_ID].bossRole, MILL_BOSS_ROLE);
  assert.equal(ARENA_MODULE_BY_ID[HIVE_ARENA_ID].bossRole, HIVE_BOSS_ROLE);
});

test('the recipe simulator plans a mill recipe and estimates its real install', () => {
  const idle = simulateAuthoredRecipe(factoryRecipe(MILL_ARENA_ID, 'idle'), { seed: 47 });
  assert.equal(idle.ok, true, JSON.stringify(idle.validation && idle.validation.issues));
  assert.equal(idle.arena.ok, true);
  assert.equal(idle.estimate.fieldCount, 2);
  assert.equal(idle.estimate.cover, true);
  const laneClose = simulateAuthoredRecipe(factoryRecipe(MILL_ARENA_ID, 'shutter_lane_close'), { seed: 47 });
  assert.equal(laneClose.ok, true);
  assert.equal(laneClose.arena.ok, true);
  assert.equal(laneClose.estimate.fieldCount, 1, 'the flooded arrival cone');
  assert.equal(laneClose.estimate.mineCount, 4, 'the mined mouth');
});

test('the recipe simulator plans a hive recipe and estimates its real install', () => {
  const idle = simulateAuthoredRecipe(factoryRecipe(HIVE_ARENA_ID, 'idle'), { seed: 47 });
  assert.equal(idle.ok, true, JSON.stringify(idle.validation && idle.validation.issues));
  assert.equal(idle.arena.ok, true);
  assert.equal(idle.estimate.fieldCount, 1, 'the breath');
  assert.equal(idle.estimate.cover, false);
  const boss = simulateAuthoredRecipe(factoryRecipe(HIVE_ARENA_ID, 'boss'), { seed: 47 });
  assert.equal(boss.ok, true);
  assert.equal(boss.arena.ok, true);
  assert.equal(boss.estimate.fieldCount, 2, 'deep breath plus repulsor berm');
  assert.equal(boss.estimate.mineCount, 4);
  assert.equal(boss.estimate.cover, true);
});

test('the four original modules preview unchanged: laws, field budget, authored toys', () => {
  for (const arenaId of TOY_ARENAS) {
    const preview = previewArenaModule(arenaId, 'idle');
    assert.equal(preview.ok, true, arenaId);
    assert.equal(preview.law, LAW_BY_ID[arenaId], arenaId);
    assert.ok(preview.fieldCount <= 2, `${arenaId} field budget`);
    assert.ok(preview.toyCount >= ARENA_TOY_MIN, `${arenaId} keeps its authored toys`);
  }
  const laws = ARENA_MODULE_LIBRARY.map((mod) => mod.law).sort();
  assert.deepEqual(laws, ['conduct', 'current', 'current', 'freeze', 'pull', 'pull']);
});

test('a law-less arena resolves through the documented fallback', () => {
  // ceres_belt has no named installer — it runs the generic Helios phase table. The
  // library stays law-arenas-only on purpose: the preview refuses honestly and the
  // simulator still plans the wave, estimating against a null install.
  const preview = previewArenaModule('ceres_belt', 'idle');
  assert.equal(preview.ok, false);
  assert.equal(preview.issues[0].rule, 'unknown');
  const sim = simulateAuthoredRecipe(factoryRecipe('ceres_belt', 'idle'), { seed: 47 });
  assert.equal(sim.ok, true);
  assert.equal(sim.arena.ok, false);
  assert.equal(sim.estimate.fieldCount, 0);
  assert.equal(sim.estimate.cover, false);
});
