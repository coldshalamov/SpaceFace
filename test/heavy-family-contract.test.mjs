import assert from 'node:assert/strict';
import test from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  HEAVY_FAMILY_ENEMY_IDS,
  HEAVY_PART_RECIPES,
  IRON_MAW_ENEMY_ID,
  heavyPartRecipeForEnemy,
} from '../src/data/heavyFamily.js';
import { classifyKillRewardVictim, killRewardRecipeFor } from '../src/data/killRewards.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const EXPECTED_MASSES = new Map([
  ['heavy_gunship', 150],
  ['heavy_ramscoop', 90],
  ['heavy_carrier_lite', 120],
  ['heavy_foundry', 110],
]);

const BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
const KNOWN_SUBSYSTEM_IDS = new Set([
  'subsystem_drive',
  'subsystem_weapon',
  'subsystem_sensor',
  'subsystem_tether_spool',
  'subsystem_power',
]);

test('the heavy family owns four stable production ids and exact authored masses', () => {
  assert.deepEqual(HEAVY_FAMILY_ENEMY_IDS, [...EXPECTED_MASSES.keys()]);
  assert.equal(new Set(HEAVY_FAMILY_ENEMY_IDS).size, 4);

  for (const [enemyId, mass] of EXPECTED_MASSES) {
    const def = BY_ID.get(enemyId);
    assert.ok(def, `${enemyId} is admitted to the production enemy catalog`);
    assert.equal(def.mass, mass, `${enemyId} keeps its design mass`);
    assert.equal(def.fixedCombatStats, true);
    assert.equal(def.killRewardTier, 'heavy');
    assert.equal(def.heavyPartRecipeId, heavyPartRecipeForEnemy(enemyId)?.id);
  }
});

test('encounter level cannot inflate heavy health or weapon damage', () => {
  for (const enemyId of [...HEAVY_FAMILY_ENEMY_IDS, IRON_MAW_ENEMY_ID]) {
    const levelOne = makeEnemySpawnSpec(enemyId, 1, { x: 0, z: 0 });
    const levelFifteen = makeEnemySpawnSpec(enemyId, 15, { x: 0, z: 0 });

    assert.deepEqual(
      [levelFifteen.hull, levelFifteen.armorHp, levelFifteen.shield],
      [levelOne.hull, levelOne.armorHp, levelOne.shield],
      `${enemyId} difficulty comes from composition/phases rather than health inflation`,
    );
    assert.deepEqual(
      levelFifteen.data.weapons.map(({ defId, dmg }) => [defId, dmg]),
      levelOne.data.weapons.map(({ defId, dmg }) => [defId, dmg]),
      `${enemyId} weapon damage stays authored across encounter levels`,
    );
    assert.equal(levelFifteen.data.fixedCombatStats, true);
  }
});

test('heavy recipes bind unique stable physical parts to the existing combat vocabulary', () => {
  const recipeIds = HEAVY_PART_RECIPES.map((row) => row.id);
  const partIds = HEAVY_PART_RECIPES.flatMap((row) => row.parts.map((part) => part.id));
  assert.equal(new Set(recipeIds).size, recipeIds.length, 'recipe ids are globally unique');
  assert.equal(new Set(partIds).size, partIds.length, 'physical part ids are globally unique');

  const roles = new Set();
  for (const row of HEAVY_PART_RECIPES) {
    const def = BY_ID.get(row.enemyTypeId);
    const weaponCounts = new Map();
    const authoredWeaponKeys = [];
    for (const weapon of def.weapons || []) {
      const previous = weaponCounts.get(weapon.id) || 0;
      const count = Math.max(1, weapon.count || 1);
      weaponCounts.set(weapon.id, previous + count);
      for (let ordinal = previous; ordinal < previous + count; ordinal++) {
        authoredWeaponKeys.push(`${weapon.id}:${ordinal}`);
      }
    }
    assert.equal(row.combatProfileId, 'combat_profile_standard_ship');
    assert.equal(row.runtime, 'unwired');
    assert.equal(row.behavior.runtime, 'unwired');
    assert.ok(row.parts.length > 0, `${row.id} has first-class parts`);
    const boundWeaponKeys = [];
    for (const part of row.parts) {
      roles.add(part.partRole);
      assert.ok(KNOWN_SUBSYSTEM_IDS.has(part.subsystemId), `${part.id} reuses a real subsystem id`);
      assert.ok(part.binding?.kind, `${part.id} has an explicit physical binding`);
      assert.equal(part.behavior?.runtime, 'unwired', `${part.id} cannot imply live mechanics`);
      if (part.binding.kind === 'weapon') {
        assert.ok(part.binding.weaponId, `${part.id} binds a weapon definition`);
        assert.ok(Number.isInteger(part.binding.ordinal) && part.binding.ordinal >= 0);
        assert.ok(
          part.binding.ordinal < (weaponCounts.get(part.binding.weaponId) || 0),
          `${part.id} binds an authored weapon instance on ${row.enemyTypeId}`,
        );
        boundWeaponKeys.push(`${part.binding.weaponId}:${part.binding.ordinal}`);
      }
    }
    assert.deepEqual(
      boundWeaponKeys.sort(),
      authoredWeaponKeys.sort(),
      `${row.enemyTypeId} leaves no authored weapon outside the physical-part recipe`,
    );
  }

  for (const role of ['weapon', 'bay', 'prow', 'drive', 'cutter', 'rack']) {
    assert.ok(roles.has(role), `the recipe grammar owns a ${role} binding`);
  }
});

test('spawn propagation preserves immutable recipes while all future behavior stays unwired', () => {
  for (const enemyId of [...HEAVY_FAMILY_ENEMY_IDS, IRON_MAW_ENEMY_ID]) {
    const authored = heavyPartRecipeForEnemy(enemyId);
    const spec = makeEnemySpawnSpec(enemyId, 9, { x: 12, z: -4 });
    assert.ok(authored);
    assert.equal(spec.data.heavyPartRecipeId, authored.id);
    assert.strictEqual(spec.data.heavyPartRecipe, authored, 'spawn references the immutable authored recipe');
    assert.equal(Object.isFrozen(spec.data.heavyPartRecipe), true);
    assert.equal(spec.data.heavyPartRecipe.runtime, 'unwired');
    assert.equal(spec.data.heavyPartRecipe.behavior.runtime, 'unwired');
    for (const part of spec.data.heavyPartRecipe.parts) {
      assert.equal(part.behavior.runtime, 'unwired');
    }
    for (const phase of spec.data.heavyPartRecipe.phases) {
      assert.equal(phase.runtime, 'unwired');
    }
  }
});

test('Iron Maw has a capital part/phase recipe without claiming a phase runtime', () => {
  const ironMaw = BY_ID.get(IRON_MAW_ENEMY_ID);
  const recipe = heavyPartRecipeForEnemy(IRON_MAW_ENEMY_ID);
  assert.equal(ironMaw.fixedCombatStats, true);
  assert.equal(ironMaw.heavyPartRecipeId, 'capital_parts_iron_maw_v1');
  assert.equal(recipe.class, 'capital');
  assert.deepEqual(recipe.phases.map((row) => row.id), [
    'iron_maw_phase_pd_screen',
    'iron_maw_phase_drive_kill',
    'iron_maw_phase_hulk_decision',
  ]);
  assert.deepEqual(recipe.phases.at(-1).choices, ['board_lite', 'salvage', 'destroy']);
  assert.ok(recipe.phases.every((row) => row.runtime === 'unwired'));
});

test('heavy reward identity and authored loot survive the spawn boundary', () => {
  for (const enemyId of HEAVY_FAMILY_ENEMY_IDS) {
    const def = BY_ID.get(enemyId);
    const spec = makeEnemySpawnSpec(enemyId, 15, { x: 0, z: 0 });
    assert.equal(spec.data.lootTableId, enemyId);
    assert.strictEqual(spec.data.loot, def.loot, `${enemyId} keeps its authored loot table`);
    assert.ok(def.loot?.drops?.length > 0, `${enemyId} retains authored drops`);
    assert.equal(classifyKillRewardVictim(spec), 'heavy');
    assert.equal(killRewardRecipeFor(spec).id, 'heavy');
  }
});
