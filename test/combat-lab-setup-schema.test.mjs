import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_LAB_SETUP_SCHEMA,
  validateCombatLabSetup,
  normalizeCombatLabSetup,
  combatLabSetupDigestInput,
} from '../src/contracts/combatLabSetupSchema.js';
import {
  COMBAT_LAB_STARTER_PACKAGES,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_ARENAS,
} from '../src/data/combatLabSetups.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { buildSlotList, fits } from '../src/systems/ships.js';

const SHIP_IDS = new Set(SHIPS.map((ship) => ship.id));
const DEF_IDS = new Set([...WEAPONS, ...MODULES].map((def) => def.id));
const ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
// DEFAULT_MAX is 24 at src/systems/spawnBudget.js:26 — do not import the private constant.
const SPAWN_BUDGET_DEFAULT_MAX = 24;

function starterById(id) {
  return COMBAT_LAB_STARTER_PACKAGES.find((pkg) => pkg.id === id);
}

function minimalSetup(overrides = {}) {
  const starter = starterById('energy_baseline');
  const enemy = COMBAT_LAB_ENEMY_PACKAGES[0];
  const arena = COMBAT_LAB_ARENAS[0];
  return {
    schema: COMBAT_LAB_SETUP_SCHEMA,
    hullId: starter.hullId,
    loadout: starter.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })),
    enemyPackageId: enemy.id,
    arenaId: arena.id,
    seed: 47,
    wave: 1,
    ...overrides,
  };
}

function issuePaths(result) {
  return (result.issues || []).map((issue) => issue && issue.path);
}

function assertIssuePath(result, path) {
  assert.equal(result.ok, false, `expected rejection for ${path}`);
  assert.ok(
    issuePaths(result).includes(path),
    `expected issue path ${path}, got ${JSON.stringify(result.issues)}`,
  );
}

test('validateCombatLabSetup accepts a minimal legal setup', () => {
  const result = validateCombatLabSetup(minimalSetup());
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.value.schema, COMBAT_LAB_SETUP_SCHEMA);
  assert.equal(result.value.hullId, 'ship_kestrel');
  assert.equal(result.value.seed, 47);
  assert.equal(result.value.wave, 1);
  assert.deepEqual(Object.keys(result.value), [
    'schema', 'hullId', 'loadout', 'enemyPackageId', 'arenaId', 'seed', 'wave',
  ]);
});

test('validateCombatLabSetup rejects unknown schema, hull, enemy package, and arena', () => {
  assertIssuePath(validateCombatLabSetup(minimalSetup({ schema: 'spaceface.combatLabSetup.v0' })), 'schema');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ hullId: 'ship_does_not_exist' })), 'hullId');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ enemyPackageId: 'pkg_does_not_exist' })), 'enemyPackageId');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ arenaId: 'arena_does_not_exist' })), 'arenaId');
});

test('validateCombatLabSetup rejects illegal seeds and waves', () => {
  assertIssuePath(validateCombatLabSetup(minimalSetup({ seed: -1 })), 'seed');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ seed: 1.5 })), 'seed');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ seed: 0x1_0000_0000 })), 'seed');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ seed: Number.NaN })), 'seed');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ wave: 0 })), 'wave');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ wave: -3 })), 'wave');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ wave: 1.2 })), 'wave');
});

test('validateCombatLabSetup accepts wave 1..999 so every valid setup is build-code encodable', () => {
  const low = validateCombatLabSetup(minimalSetup({ wave: 1 }));
  assert.equal(low.ok, true);
  assert.equal(low.value.wave, 1);
  const high = validateCombatLabSetup(minimalSetup({ wave: 999 }));
  assert.equal(high.ok, true);
  assert.equal(high.value.wave, 999);
  assertIssuePath(validateCombatLabSetup(minimalSetup({ wave: 1000 })), 'wave');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ wave: 1e21 })), 'wave');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ wave: 0 })), 'wave');
  assertIssuePath(validateCombatLabSetup(minimalSetup({ wave: 1.2 })), 'wave');
});

test('validateCombatLabSetup rejects seed 0 and accepts the 1..0xffffffff bounds', () => {
  assertIssuePath(validateCombatLabSetup(minimalSetup({ seed: 0 })), 'seed');
  const low = validateCombatLabSetup(minimalSetup({ seed: 1 }));
  assert.equal(low.ok, true);
  assert.equal(low.value.seed, 1);
  const high = validateCombatLabSetup(minimalSetup({ seed: 0xffffffff }));
  assert.equal(high.ok, true);
  assert.equal(high.value.seed, 0xffffffff);
  assertIssuePath(validateCombatLabSetup(minimalSetup({ seed: 0x100000000 })), 'seed');
});

test('validateCombatLabSetup rejects illegal loadout entries', () => {
  assertIssuePath(
    validateCombatLabSetup(minimalSetup({
      loadout: [{ slotIndex: 0, defId: 'wpn_does_not_exist' }],
    })),
    'loadout[0].defId',
  );
  assertIssuePath(
    validateCombatLabSetup(minimalSetup({
      loadout: [
        { slotIndex: 0, defId: 'wpn_pulse_laser_s' },
        { slotIndex: 0, defId: 'wpn_autocannon_s' },
      ],
    })),
    'loadout[1].slotIndex',
  );

  const illegalFit = validateCombatLabSetup(minimalSetup({
    hullId: 'ship_kestrel',
    loadout: [{ slotIndex: 0, defId: 'wpn_autocannon_m' }],
  }));
  assertIssuePath(illegalFit, 'loadout[0].defId');
  const hitch = SHIPS.find((ship) => ship.id === 'ship_kestrel');
  const slot = buildSlotList(hitch)[0];
  const heavy = WEAPONS.find((wpn) => wpn.id === 'wpn_autocannon_m');
  assert.equal(fits(slot, heavy), false);

  const tooMany = [];
  const hitchSlots = buildSlotList(hitch);
  for (let i = 0; i < hitchSlots.length + 1; i++) {
    tooMany.push({ slotIndex: i, defId: 'wpn_pulse_laser_s' });
  }
  assertIssuePath(
    validateCombatLabSetup(minimalSetup({ hullId: 'ship_kestrel', loadout: tooMany })),
    'loadout',
  );
});

test('validateCombatLabSetup never throws', () => {
  for (const input of [undefined, null, 7, 'nope', [], Number.NaN]) {
    const result = validateCombatLabSetup(input);
    assert.equal(result.ok, false);
    assert.ok(Array.isArray(result.issues));
  }
});

test('normalizeCombatLabSetup is idempotent and drops unknown keys', () => {
  const input = minimalSetup({ extra: 'drop-me', loadout: [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }] });
  const once = normalizeCombatLabSetup(input);
  const twice = normalizeCombatLabSetup(once);
  assert.deepEqual(twice, once);
  assert.equal(Object.hasOwn(once, 'extra'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(once)), once);
});

test('normalization is order-independent for loadout permutations', () => {
  const toolkit = starterById('physics_toolkit');
  const forward = toolkit.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId }));
  const reverse = forward.slice().reverse();
  const a = normalizeCombatLabSetup(minimalSetup({
    hullId: toolkit.hullId,
    loadout: forward,
  }));
  const b = normalizeCombatLabSetup(minimalSetup({
    hullId: toolkit.hullId,
    loadout: reverse,
  }));
  assert.deepEqual(a, b);
  assert.deepEqual(a.loadout.map((entry) => entry.slotIndex), [...a.loadout.map((entry) => entry.slotIndex)].sort((x, y) => x - y));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);

  const dupForward = [
    { slotIndex: 1, defId: 'wpn_gravity_marker_s' },
    { slotIndex: 1, defId: 'wpn_momentum_sink_s' },
  ];
  const dupReverse = dupForward.slice().reverse();
  const c = normalizeCombatLabSetup(minimalSetup({
    hullId: 'ship_hornet',
    loadout: dupForward,
  }));
  const d = normalizeCombatLabSetup(minimalSetup({
    hullId: 'ship_hornet',
    loadout: dupReverse,
  }));
  assert.deepEqual(c, d);
  assert.equal(c.loadout.filter((entry) => entry.slotIndex === 1).length, 1);
  assert.equal(c.loadout.find((entry) => entry.slotIndex === 1).defId, 'wpn_gravity_marker_s');
});

test('combatLabSetupDigestInput is stable across key insertion order', () => {
  const toolkit = starterById('physics_toolkit');
  const a = {};
  a.schema = COMBAT_LAB_SETUP_SCHEMA;
  a.hullId = toolkit.hullId;
  a.loadout = toolkit.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId }));
  a.enemyPackageId = COMBAT_LAB_ENEMY_PACKAGES[0].id;
  a.arenaId = COMBAT_LAB_ARENAS[0].id;
  a.seed = 1864401122;
  a.wave = 3;

  const b = {};
  b.wave = 3;
  b.seed = 1864401122;
  b.arenaId = COMBAT_LAB_ARENAS[0].id;
  b.enemyPackageId = COMBAT_LAB_ENEMY_PACKAGES[0].id;
  b.loadout = toolkit.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })).reverse();
  b.hullId = toolkit.hullId;
  b.schema = COMBAT_LAB_SETUP_SCHEMA;

  assert.deepEqual(combatLabSetupDigestInput(a), combatLabSetupDigestInput(b));
});

function assertDeepFrozen(value, label) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), `${label} is frozen`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeepFrozen(item, `${label}[${index}]`));
    return;
  }
  for (const key of Object.keys(value)) {
    assertDeepFrozen(value[key], `${label}.${key}`);
  }
}

test('Combat Lab catalogs are frozen, unique, and cite only live ids', () => {
  for (const [label, list] of [
    ['starters', COMBAT_LAB_STARTER_PACKAGES],
    ['enemies', COMBAT_LAB_ENEMY_PACKAGES],
    ['arenas', COMBAT_LAB_ARENAS],
  ]) {
    assertDeepFrozen(list, label);
    const ids = list.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, `${label} ids are unique`);
  }

  for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
    assert.ok(SHIP_IDS.has(starter.hullId), `starter ${starter.id} hull ${starter.hullId}`);
    const shipDef = SHIPS.find((ship) => ship.id === starter.hullId);
    const slots = buildSlotList(shipDef);
    for (const entry of starter.loadout) {
      assert.ok(DEF_IDS.has(entry.defId), `starter ${starter.id} def ${entry.defId}`);
      const def = [...WEAPONS, ...MODULES].find((item) => item.id === entry.defId);
      assert.equal(fits(slots[entry.slotIndex], def), true, `${entry.defId} fits slot ${entry.slotIndex}`);
    }
  }

  for (const pkg of COMBAT_LAB_ENEMY_PACKAGES) {
    let total = 0;
    for (const entry of pkg.entries) {
      assert.ok(ENEMY_IDS.has(entry.enemyId), `package ${pkg.id} enemy ${entry.enemyId}`);
      total += entry.count;
    }
    assert.ok(total <= 20, `package ${pkg.id} total ${total} <= 20`);
    assert.ok(
      pkg.maxConcurrent <= SPAWN_BUDGET_DEFAULT_MAX,
      `package ${pkg.id} maxConcurrent ${pkg.maxConcurrent} <= 24`,
    );
  }

  for (const arena of COMBAT_LAB_ARENAS) {
    const zones = SECTOR_ZONES[arena.sectorId];
    assert.ok(Array.isArray(zones) && zones.length > 0, `arena ${arena.id} sector ${arena.sectorId}`);
    assert.ok(Number.isFinite(arena.spawnPos.x), `arena ${arena.id} has finite spawnPos.x`);
    assert.ok(Number.isFinite(arena.spawnPos.z), `arena ${arena.id} has finite spawnPos.z`);
  }
});
