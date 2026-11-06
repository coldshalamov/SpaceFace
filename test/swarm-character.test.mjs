// S7 task 1 — the character sheet as data. Pins the plan's contract: every roster ship and
// every Brood family has a row on the wave it debuts; no two ships share a hue + silhouette
// pair (the whole point is name-by-shape-and-colour); a heavy hull is heavy enough to be
// terrain; AUDIT C4 layers stay honest (fodder hull only, supports carry the shield).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SWARM_ROSTER } from '../src/data/swarmMode.js';
import { SWARM_BROOD_FAMILIES } from '../src/data/swarmBrood.js';
import { HEAVY_AS_TERRAIN_MASS } from '../src/combat/impulseKernel.js';
import {
  SWARM_BROOD_CHARACTER,
  SWARM_CHARACTER_SHEET,
  SWARM_PROTECTION_LAYERS,
  swarmBroodCharacterFor,
  swarmCharacterFor,
} from '../src/data/swarmCharacter.js';
import { SWARM_FEEL_PROFILE } from '../src/data/swarmFeelProfile.js';

test('every roster ship has a row, on the wave the roster clock debuts it', () => {
  assert.equal(SWARM_CHARACTER_SHEET.length, SWARM_ROSTER.length, 'one row per roster ship');
  const seen = new Set();
  for (const roster of SWARM_ROSTER) {
    const row = swarmCharacterFor(roster.enemyId);
    assert.ok(row, `no sheet row for ${roster.enemyId}`);
    assert.equal(row.debutWave, roster.fromWave, `${roster.enemyId} debut wave matches the roster`);
    assert.equal(row.name, roster.name, `${roster.enemyId} display name matches`);
    seen.add(row.enemyId);
  }
  assert.equal(seen.size, SWARM_CHARACTER_SHEET.length, 'no stray or duplicate enemyId rows');
});

test('no two ships share a hue + silhouette pair — each archetype names itself by look', () => {
  const pairs = new Set();
  const hues = new Set();
  const silhouettes = new Set();
  for (const row of SWARM_CHARACTER_SHEET) {
    const pair = `${row.silhouette}|${row.hue}`;
    assert.ok(!pairs.has(pair), `duplicate look: ${row.enemyId} shares ${pair}`);
    pairs.add(pair);
    // Stronger than the letter of the plan: each archetype gets its own hue (PLANS line 362)
    // and its own silhouette key, so the lineup test is winnable by shape or colour alone.
    assert.ok(!hues.has(row.hue), `${row.enemyId} reuses hue ${row.hue.toString(16)}`);
    hues.add(row.hue);
    assert.ok(!silhouettes.has(row.silhouette), `${row.enemyId} reuses silhouette ${row.silhouette}`);
    silhouettes.add(row.silhouette);
  }
});

test('heavy ids are heavy enough to be terrain; every body number is a real positive', () => {
  for (const row of SWARM_CHARACTER_SHEET) {
    assert.ok(row.radius > 0 && row.mass > 0 && row.speed > 0 && row.scale > 0,
      `${row.enemyId} has a live body`);
    if (row.tier === 'heavy') {
      assert.ok(row.mass >= HEAVY_AS_TERRAIN_MASS,
        `${row.enemyId} is heavy but only ${row.mass}t (< ${HEAVY_AS_TERRAIN_MASS}t terrain)`);
    } else {
      assert.ok(row.mass < HEAVY_AS_TERRAIN_MASS,
        `${row.enemyId} tier ${row.tier} but mass ${row.mass}t is already terrain`);
    }
  }
});

test('C4 protection: fodder is hull only, supports carry the shield, layers are known', () => {
  const known = new Set(SWARM_PROTECTION_LAYERS);
  for (const row of SWARM_CHARACTER_SHEET) {
    assert.ok(row.protection.length >= 1, `${row.enemyId} has no layer at all`);
    for (const layer of row.protection) assert.ok(known.has(layer), `${row.enemyId}: unknown layer ${layer}`);
    assert.equal(row.protection[0], 'hull', `${row.enemyId}: hull is always the base layer`);
    assert.equal(new Set(row.protection).size, row.protection.length, `${row.enemyId}: repeated layer`);
    if (row.tier === 'fodder') {
      assert.deepEqual([...row.protection], ['hull'], `${row.enemyId}: fodder is hull only`);
    }
    if (row.enemyId === 'warden_escort' || row.enemyId === 'pd_screen_escort') {
      assert.ok(row.protection.includes('shield'), `${row.enemyId}: a support shows its shield layer`);
    }
  }
});

test('the S1 fodder band and the sheet agree — fodder rows are exactly the profile list', () => {
  const sheetFodder = SWARM_CHARACTER_SHEET.filter((r) => r.tier === 'fodder').map((r) => r.enemyId).sort();
  assert.deepEqual(sheetFodder, [...SWARM_FEEL_PROFILE.fodder.ids].sort());
});

test('every threatened ability row carries a tell; only fodder and the duelist stand silent', () => {
  const silent = SWARM_CHARACTER_SHEET.filter((r) => r.tellId == null).map((r) => r.enemyId).sort();
  assert.deepEqual(silent, ['patrol_lawman', 'wasp_swarmer'].sort(),
    'a dangerous ability without a tell is the plan\'s named failure mode');
  for (const row of SWARM_CHARACTER_SHEET) {
    if (row.abilityId == null) continue;
    assert.equal(typeof row.counter, 'string', `${row.enemyId} has an ability but no counter line`);
  }
});

test('every Brood family has a surface row on its unlock wave', () => {
  assert.equal(SWARM_BROOD_CHARACTER.length, SWARM_BROOD_FAMILIES.length, 'one row per family');
  for (const family of SWARM_BROOD_FAMILIES) {
    const row = swarmBroodCharacterFor(family.id);
    assert.ok(row, `no surface row for brood ${family.id}`);
    assert.equal(row.debutWave, family.fromWave, `${family.id} surface wave matches the brood clock`);
    assert.ok(row.drawScale >= 1.5, `${family.id}: E1 says the horde reads at 1.5x draw scale`);
    assert.equal(typeof row.signature, 'string', `${family.id} has no attack-language line`);
  }
});
