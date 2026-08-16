import assert from 'node:assert/strict';
import test from 'node:test';

import { ENEMY_TYPES, MEDIUM_FAMILY_ENEMY_IDS } from '../src/data/enemies.js';
import { classifyKillRewardVictim, killRewardRecipeFor } from '../src/data/killRewards.js';
import { makeEnemySpawnSpec, scaleCombatant } from '../src/systems/combat.js';

const EXPECTED_MASSES = new Map([
  ['marauder_brawler', 40],
  ['lancer_sniper', 35],
  ['hostile_interceptor', 25],
  ['bulwark_escort', 55],
  ['corsair_raider', 45],
  ['torcher_denial', 38],
]);

const BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));

test('the medium family owns six stable production ids and exact authored masses', () => {
  assert.deepEqual(MEDIUM_FAMILY_ENEMY_IDS, [...EXPECTED_MASSES.keys()]);
  assert.equal(new Set(MEDIUM_FAMILY_ENEMY_IDS).size, 6);

  for (const [enemyId, mass] of EXPECTED_MASSES) {
    const def = BY_ID.get(enemyId);
    assert.ok(def, `${enemyId} is admitted to the production enemy catalog`);
    assert.equal(def.mass, mass, `${enemyId} keeps its design mass`);
    assert.equal(def.fixedCombatStats, true);
    assert.equal(def.killRewardTier, 'medium');
  }
});

test('encounter level cannot inflate medium health or weapon damage', () => {
  for (const enemyId of MEDIUM_FAMILY_ENEMY_IDS) {
    const levelOne = makeEnemySpawnSpec(enemyId, 1, { x: 0, z: 0 });
    const levelTwelve = makeEnemySpawnSpec(enemyId, 12, { x: 0, z: 0 });

    assert.deepEqual(
      [levelTwelve.hull, levelTwelve.armorHp, levelTwelve.shield],
      [levelOne.hull, levelOne.armorHp, levelOne.shield],
      `${enemyId} difficulty comes from composition rather than health inflation`,
    );
    assert.deepEqual(
      levelTwelve.data.weapons.map(({ dmg }) => dmg),
      levelOne.data.weapons.map(({ dmg }) => dmg),
      `${enemyId} damage stays authored across encounter levels`,
    );
    assert.equal(levelTwelve.data.fixedCombatStats, true);
  }
});

test('each medium spawn carries an explicit but honestly unwired setup and visible retreat handoff', () => {
  for (const enemyId of MEDIUM_FAMILY_ENEMY_IDS) {
    const spec = makeEnemySpawnSpec(enemyId, 12, { x: 0, z: 0 });
    assert.equal(spec.data.mediumSetup.runtime, 'unwired');
    assert.ok(spec.data.mediumSetup.capability);
    assert.ok(spec.data.mediumSetup.counterVerb);
    assert.equal(spec.data.visibleRetreat.hullFraction, 0.3);
    assert.equal(spec.data.visibleRetreat.runtime, 'unwired');
    for (const cue of ['smokeCue', 'dumpCue', 'bark']) {
      assert.ok(spec.data.visibleRetreat[cue], `${enemyId} retreat metadata includes ${cue}`);
    }
  }
});

test('all six resolve to the medium burst while authored per-entry drops remain attached', () => {
  for (const enemyId of MEDIUM_FAMILY_ENEMY_IDS) {
    const def = BY_ID.get(enemyId);
    const spec = makeEnemySpawnSpec(enemyId, 6, { x: 0, z: 0 });
    assert.equal(classifyKillRewardVictim(spec), 'medium');
    assert.equal(killRewardRecipeFor(spec).id, 'medium');
    assert.strictEqual(spec.data.loot, def.loot, `${enemyId} keeps its authored loot table`);
    assert.ok(def.loot?.drops?.length > 0, `${enemyId} retains an authored per-entry drop`);
  }
});

test('global fixed-stat policy and non-family reward classification are explicit', () => {
  assert.deepEqual(scaleCombatant({ hull: 100, armor: 10, shield: 20 }, 3), {
    hull: 100, armor: 10, shield: 20, dmgMult: 1,
  });
  assert.equal(classifyKillRewardVictim({ mass: 12, data: { shipClass: 'fighter' } }), 'light');
  assert.equal(classifyKillRewardVictim({ mass: 70, data: { shipClass: 'gunship' } }), 'heavy');
  assert.equal(classifyKillRewardVictim({ mass: 40, data: {} }), 'medium');
  assert.equal(classifyKillRewardVictim({
    mass: 45,
    data: { lootTableId: 'corsair_raider', killRewardTier: 'medium', namedAceId: 'ace-red-wake' },
  }), 'ace', 'named-ace identity still outranks its returning medium hull');
});
