import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_LAB_SETUP_SCHEMA,
  validateCombatLabSetup,
} from '../src/contracts/combatLabSetupSchema.js';
import {
  COMBAT_LAB_STARTER_PACKAGES,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_ARENAS,
} from '../src/data/combatLabSetups.js';
import {
  COMBAT_LAB_SURFACE,
  COMBAT_LAB_SURFACE_HULLS,
  COMBAT_LAB_SURFACE_STARTERS,
  COMBAT_LAB_SURFACE_ENEMIES,
  COMBAT_LAB_SURFACE_ARENAS,
  combatLabHullsForStarter,
  combatLabResolveHullId,
} from '../src/data/combatLab.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSandboxLaunchConfig } from '../src/ui/sandbox/sandboxSetup.js';
import {
  readCombatLabForm,
  rollCombatLabSeed,
  combatLabRelaunchConfig,
  nextCombatLabStoredSetup,
  emitCombatLabLaunch,
} from '../src/ui/screens/sandbox.js';

const SHIP_IDS = new Set(SHIPS.map((ship) => ship.id));
const STARTER_IDS = new Set(COMBAT_LAB_STARTER_PACKAGES.map((pkg) => pkg.id));
const ENEMY_IDS = new Set(COMBAT_LAB_ENEMY_PACKAGES.map((pkg) => pkg.id));
const ARENA_IDS = new Set(COMBAT_LAB_ARENAS.map((arena) => arena.id));

function starterById(id) {
  return COMBAT_LAB_STARTER_PACKAGES.find((pkg) => pkg.id === id);
}

function validValues(overrides = {}) {
  const starter = COMBAT_LAB_STARTER_PACKAGES[0];
  return {
    hullId: starter.hullId,
    starterPackageId: starter.id,
    enemyPackageId: COMBAT_LAB_ENEMY_PACKAGES[0].id,
    arenaId: COMBAT_LAB_ARENAS[0].id,
    seed: '42',
    wave: '1',
    ...overrides,
  };
}

function issuePaths(result) {
  return (result.issues || []).map((issue) => issue && issue.path);
}

function assertOffered(list, label) {
  assert.ok(Array.isArray(list) && list.length > 0, `${label} must offer at least one option`);
  const ids = list.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `${label} ids must be unique`);
}

function loadoutOf(starterId) {
  const pkg = starterById(starterId);
  return (pkg && pkg.loadout || []).map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId }));
}

test('readCombatLabForm maps a legal form to a schema-valid setup', () => {
  const result = readCombatLabForm(validValues());
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.value.schema, COMBAT_LAB_SETUP_SCHEMA);
  assert.equal(result.value.seed, 42);
  assert.equal(result.value.wave, 1);
  const validated = validateCombatLabSetup(result.value);
  assert.equal(validated.ok, true);
  assert.deepEqual(validated.value, result.value);
});

test('readCombatLabForm rolls an empty seed only when a roll source is passed', () => {
  const rolled = readCombatLabForm(validValues({ seed: '' }), () => 7);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.value.seed, 7);

  const again = readCombatLabForm(validValues({ seed: '' }), () => 7);
  assert.deepEqual(again.value, rolled.value);

  const unrolled = readCombatLabForm(validValues({ seed: '' }));
  assert.equal(unrolled.ok, false);
  assert.ok(issuePaths(unrolled).includes('seed'));
});

test('readCombatLabForm keeps typed seed 42 and rejects illegal seed strings', () => {
  const typed = readCombatLabForm(validValues({ seed: '42' }));
  assert.equal(typed.ok, true);
  assert.equal(typed.value.seed, 42);

  for (const seed of ['abc', '-1', '0', '99999999999']) {
    const result = readCombatLabForm(validValues({ seed }));
    assert.equal(result.ok, false, `seed ${JSON.stringify(seed)} should be invalid`);
    assert.ok(issuePaths(result).includes('seed'), `seed ${JSON.stringify(seed)} should report path seed`);
  }
});

test('readCombatLabForm defaults an empty wave to 1', () => {
  const result = readCombatLabForm(validValues({ wave: '' }));
  assert.equal(result.ok, true);
  assert.equal(result.value.wave, 1);
});

test('rollCombatLabSeed never yields 0 even when the source returns 0 or 1', () => {
  const fromZero = rollCombatLabSeed(() => 0);
  const fromOne = rollCombatLabSeed(() => 1);
  assert.ok(fromZero >= 1 && fromZero <= 0xffffffff);
  assert.ok(fromOne >= 1 && fromOne <= 0xffffffff);

  const zeroSetup = readCombatLabForm(validValues({ seed: '' }), () => 0);
  assert.equal(zeroSetup.ok, true);
  assert.ok(zeroSetup.value.seed >= 1);
  assert.equal(validateCombatLabSetup(zeroSetup.value).ok, true);

  const oneSetup = readCombatLabForm(validValues({ seed: '' }), () => 1);
  assert.equal(oneSetup.ok, true);
  assert.equal(oneSetup.value.seed, 1);
  assert.equal(validateCombatLabSetup(oneSetup.value).ok, true);
});

test('combatLabHullsForStarter only offers hulls that validate with the starter loadout', () => {
  for (const starter of COMBAT_LAB_SURFACE_STARTERS) {
    const hulls = combatLabHullsForStarter(starter.id);
    assertOffered(hulls, `hulls for ${starter.id}`);
    const pkg = starterById(starter.id);
    assert.ok(hulls.some((hull) => hull.id === pkg.hullId), `${starter.id} must include its own hull`);
    for (const hull of hulls) {
      const result = readCombatLabForm(validValues({
        starterPackageId: starter.id,
        hullId: hull.id,
      }));
      assert.equal(result.ok, true, `${starter.id} + ${hull.id}: ${JSON.stringify(result.issues)}`);
    }
  }

  const kineticHulls = combatLabHullsForStarter('kinetic_baseline');
  assert.equal(kineticHulls.some((hull) => hull.id === 'ship_kestrel'), false);
  const illegal = readCombatLabForm(validValues({
    starterPackageId: 'kinetic_baseline',
    hullId: 'ship_kestrel',
  }));
  assert.equal(illegal.ok, false);
  assert.equal(combatLabHullsForStarter('starter_does_not_exist').length, 0);
});

test('combatLabResolveHullId keeps a legal hull and falls back to the package hull', () => {
  assert.equal(combatLabResolveHullId('kinetic_baseline', 'ship_kestrel'), 'ship_hornet');
  assert.equal(combatLabResolveHullId('kinetic_baseline', 'ship_hornet'), 'ship_hornet');
  const energyHulls = combatLabHullsForStarter('energy_baseline');
  const otherEnergy = energyHulls.find((hull) => hull.id !== 'ship_kestrel');
  if (otherEnergy) {
    assert.equal(combatLabResolveHullId('energy_baseline', otherEnergy.id), otherEnergy.id);
  }
  assert.equal(combatLabResolveHullId('starter_does_not_exist', 'ship_kestrel'), '');
});

test('successful launch stores the setup; form edits and failed launches do not', () => {
  const payloads = [];
  const bus = { emit(type, payload) { payloads.push({ type, payload }); } };

  let stored = null;
  assert.equal(emitCombatLabLaunch(bus, stored), false);
  assert.equal(payloads.length, 0);

  const launched = readCombatLabForm(validValues({ seed: '1864401122', wave: '2' }));
  assert.equal(launched.ok, true);
  stored = nextCombatLabStoredSetup(stored, launched);
  assert.deepEqual(stored, launched.value);
  assert.equal(validateCombatLabSetup(stored).ok, true);
  assert.equal(emitCombatLabLaunch(bus, stored), true);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].type, 'game:new');
  assert.equal(payloads[0].payload.seed, 1864401122);

  const edited = readCombatLabForm(validValues({ seed: '99', wave: '8' }));
  assert.equal(edited.ok, true);
  assert.equal(edited.value.seed, 99);
  assert.equal(stored.seed, 1864401122);
  assert.deepEqual(stored, launched.value);

  const failed = readCombatLabForm(validValues({ hullId: 'ship_does_not_exist', seed: '7' }));
  assert.equal(failed.ok, false);
  const afterFail = nextCombatLabStoredSetup(stored, failed);
  assert.deepEqual(afterFail, stored);
  assert.equal(payloads.length, 1);

  stored = afterFail;
  assert.equal(emitCombatLabLaunch(bus, stored), true);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[1].type, 'game:new');
  assert.equal(payloads[1].payload.seed, 1864401122);
  assert.deepEqual(payloads[1].payload, payloads[0].payload);
});

test('combatLabRelaunchConfig matches the original launch config for the same setup', () => {
  const result = readCombatLabForm(validValues({ seed: '1864401122', wave: '2' }));
  assert.equal(result.ok, true);
  const launched = buildSandboxLaunchConfig({}, { combatLabSetup: result.value });
  const relaunch = combatLabRelaunchConfig(result.value);
  assert.deepEqual(relaunch, launched);
  assert.deepEqual(relaunch.combatLabSetup, result.value);
  assert.equal(relaunch.seed, result.value.seed);
  assert.equal(relaunch.shipId, result.value.hullId);

  const messy = { ...result.value, extra: 'drop-me' };
  const relaunchMessy = combatLabRelaunchConfig(messy);
  assert.deepEqual(relaunchMessy, launched);
  assert.equal(Object.hasOwn(relaunchMessy.combatLabSetup, 'extra'), false);
});

test('every offered Combat Lab option produces a schema-valid setup', () => {
  assert.ok(COMBAT_LAB_SURFACE.fields.length > 0);
  assert.deepEqual(
    COMBAT_LAB_SURFACE.fieldOrder,
    COMBAT_LAB_SURFACE.fields.map((field) => field.key),
  );

  assertOffered(COMBAT_LAB_SURFACE_HULLS, 'COMBAT_LAB_SURFACE_HULLS');
  assertOffered(COMBAT_LAB_SURFACE_STARTERS, 'COMBAT_LAB_SURFACE_STARTERS');
  assertOffered(COMBAT_LAB_SURFACE_ENEMIES, 'COMBAT_LAB_SURFACE_ENEMIES');
  assertOffered(COMBAT_LAB_SURFACE_ARENAS, 'COMBAT_LAB_SURFACE_ARENAS');

  for (const starter of COMBAT_LAB_SURFACE_STARTERS) {
    assert.ok(STARTER_IDS.has(starter.id), `offered starter ${starter.id}`);
    const pkg = starterById(starter.id);
    const hulls = combatLabHullsForStarter(starter.id);
    assertOffered(hulls, `offered hulls for ${starter.id}`);
    for (const hull of hulls) {
      assert.ok(SHIP_IDS.has(hull.id), `offered hull ${hull.id} exists in ships.js`);
      const result = readCombatLabForm(validValues({
        starterPackageId: starter.id,
        hullId: hull.id,
      }));
      assert.equal(result.ok, true, `${starter.id} + ${hull.id}: ${JSON.stringify(result.issues)}`);
      assert.equal(result.value.hullId, hull.id);
      assert.deepEqual(result.value.loadout, loadoutOf(starter.id));
      assert.equal(validateCombatLabSetup(result.value).ok, true);
    }
    const starterResult = readCombatLabForm(validValues({
      starterPackageId: starter.id,
      hullId: pkg.hullId,
    }));
    assert.equal(starterResult.ok, true, `starter ${starter.id}: ${JSON.stringify(starterResult.issues)}`);
    assert.equal(starterResult.value.hullId, pkg.hullId);
    assert.deepEqual(starterResult.value.loadout, loadoutOf(starter.id));
  }

  for (const enemy of COMBAT_LAB_SURFACE_ENEMIES) {
    assert.ok(ENEMY_IDS.has(enemy.id), `offered enemy package ${enemy.id}`);
    const result = readCombatLabForm(validValues({ enemyPackageId: enemy.id }));
    assert.equal(result.ok, true, `enemy ${enemy.id}: ${JSON.stringify(result.issues)}`);
    assert.equal(result.value.enemyPackageId, enemy.id);
    assert.equal(validateCombatLabSetup(result.value).ok, true);
  }

  for (const arena of COMBAT_LAB_SURFACE_ARENAS) {
    assert.ok(ARENA_IDS.has(arena.id), `offered arena ${arena.id}`);
    const result = readCombatLabForm(validValues({ arenaId: arena.id }));
    assert.equal(result.ok, true, `arena ${arena.id}: ${JSON.stringify(result.issues)}`);
    assert.equal(result.value.arenaId, arena.id);
    assert.equal(validateCombatLabSetup(result.value).ok, true);
  }
});

test('readCombatLabForm reports an unknown hull via issues rather than throwing', () => {
  let result;
  assert.doesNotThrow(() => {
    result = readCombatLabForm(validValues({ hullId: 'ship_does_not_exist' }));
  });
  assert.equal(result.ok, false);
  assert.equal(result.value, null);
  assert.ok(Array.isArray(result.issues));
  assert.ok(issuePaths(result).includes('hullId'));
});
