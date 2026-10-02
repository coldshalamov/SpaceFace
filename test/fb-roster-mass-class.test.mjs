import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { THROW_CLASS_MAX_MASS } from '../src/data/survivalWaves.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { scanner } from '../src/systems/scanner.js';
import { targetPhysicalClassLabel } from '../src/ui/targetPanel.js';

// FB-121 — every roster row declares its physical class so the scan answer is one word:
//   ammunition — light enough that a tether line throws it (mass <= THROW_CLASS_MAX_MASS)
//   terrain    — a moving obstacle you route around or shove
//   specialist — an explicit override for hulls whose identity is functional (mines, screens,
//                stealth locks, field anchors), not a statement about mass
// Derivation is pinned so a class can never drift away from the hull's real throw weight.

const VALID_CLASSES = new Set(['ammunition', 'terrain', 'specialist']);

test('FB-121: every roster row declares a physical class', () => {
  assert.equal(ENEMY_TYPES.length, 19);
  for (const def of ENEMY_TYPES) {
    assert.ok(VALID_CLASSES.has(def.physicalClass),
      `${def.id} physicalClass '${def.physicalClass}' — must be ammunition|terrain|specialist`);
  }
});

test('FB-121: mass derives the class; specialist is the only declared override', () => {
  for (const def of ENEMY_TYPES) {
    const derived = def.mass <= THROW_CLASS_MAX_MASS ? 'ammunition' : 'terrain';
    if (def.physicalClass === 'specialist') {
      continue; // declared functional override — pinned by the roster in the next test
    }
    assert.equal(def.physicalClass, derived,
      `${def.id} mass ${def.mass} derives '${derived}' but declares '${def.physicalClass}' — ` +
      `either the class is wrong or the row needs an explicit specialist identity`);
  }
});

test('FB-121: the specialist set is exactly the functional-identity rows', () => {
  const specialists = ENEMY_TYPES.filter((d) => d.physicalClass === 'specialist').map((d) => d.id).sort();
  assert.deepEqual(specialists, [
    'customs_cutter',
    'field_anchor_controller',
    'forge_regent',
    'mine_layer_jackal',
    'mirrorjaw_foreman',
    'pd_screen_escort',
    'tether_control_raider',
    'warden_escort',
  ], 'specialist is the role-identity override, not a stat tier — the set is deliberately closed');
  // Throw-weight hulls never wear the override — ammunition is a property of the body.
  for (const def of ENEMY_TYPES) {
    if (def.mass <= THROW_CLASS_MAX_MASS) {
      assert.notEqual(def.physicalClass, 'specialist',
        `${def.id} is inside throw class (mass ${def.mass}) — its body IS ammunition`);
    }
  }
});

test('FB-121: combat.js copies the class onto the spawned entity', () => {
  for (const def of ENEMY_TYPES) {
    const spec = makeEnemySpawnSpec(def.id, 3, { x: 0, z: 0 });
    assert.equal(spec.data.physicalClass, def.physicalClass,
      `${def.id} spawn spec drops physicalClass`);
  }
});

test('FB-121: the target panel prints the class only after a scan pulse resolves the hull', () => {
  // A spawned hostile mid-field, inside pulse range but never scanned: no class word.
  const hostiles = [
    { archetype: 'wasp_swarmer', expected: 'AMMUNITION' },
    { archetype: 'dreadnought_boss', expected: 'TERRAIN' },
    { archetype: 'mine_layer_jackal', expected: 'SPECIALIST' },
  ].map((row, index) => {
    const spec = makeEnemySpawnSpec(row.archetype, 3, { x: 60 + index * 40, z: 30 });
    const entity = {
      id: 200 + index,
      type: 'ship',
      alive: true,
      pos: spec.pos,
      radius: spec.radius || 12,
      data: spec.data,
      _expected: row.expected,
    };
    return entity;
  });
  for (const entity of hostiles) {
    assert.equal(targetPhysicalClassLabel(entity), null,
      `unscanned ${entity.data.enemyId || entity.id} must not overclaim its class`);
  }

  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { fittings: [] } };
  const state = {
    meta: { seed: 4242 },
    playerId: player.id,
    entities: new Map([[player.id, player], ...hostiles.map((h) => [h.id, h])]),
    entityList: [player, ...hostiles],
    simTime: 12,
    mode: 'flight',
    world: { currentSectorId: 'sector_helios_prime', activeSector: { pois: [] } },
  };
  const priorBus = scanner.bus;
  const priorScratch = scanner._scratch;
  scanner.bus = { emit() {} };
  scanner._scratch = [];
  try {
    scanner._pulse(state, player, state.simTime);
  } finally {
    scanner.bus = priorBus;
    scanner._scratch = priorScratch;
  }

  for (const entity of hostiles) {
    assert.equal(entity.data.scanned, true, `pulse must resolve the hull's class flag`);
    assert.equal(targetPhysicalClassLabel(entity), entity._expected,
      `${entity._expected} prints on the panel after the scan`);
  }
});
