import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENEMY_DOCTRINE_OVERRIDES } from '../src/data/combatDefs.js';
import { normalizeCombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { stampManeuverIdentities } from '../src/systems/tacticalAI.js';

// FIGHT-01 — the mine-layer jackal's one doctrine lives on its enemy row, not in the
// override table. The override used to patch a row mis-filed as `ranged_disengager`;
// now the row declares `mine_layer_wake` and a spawned jackal needs no stamp.

const jackal = ENEMY_TYPES.find((row) => row.id === 'mine_layer_jackal');

test('FIGHT-01: the jackal row declares the wake doctrine and the override table is silent', () => {
  assert.ok(jackal, 'jackal row exists');
  assert.equal(jackal.combatDoctrineId, 'mine_layer_wake',
    'the enemy row names the doctrine the override used to patch in');
  assert.equal(ENEMY_DOCTRINE_OVERRIDES.mine_layer_jackal, undefined,
    'no override entry — the row is the single statement of identity');
});

test('FIGHT-01: a stock jackal resolves mine_layer_wake with zero override stamps', () => {
  const entity = {
    alive: true,
    data: {
      lootTableId: 'mine_layer_jackal',
      ai: { combatDoctrineId: normalizeCombatDoctrineId(jackal.combatDoctrineId) },
    },
  };
  const stamped = stampManeuverIdentities({}, [entity]);
  assert.equal(stamped, 0, 'nothing to stamp — the spawn path already carries the row doctrine');
  assert.equal(entity.data.ai.combatDoctrineId, 'mine_layer_wake');
});

test('FIGHT-01: an authored jackal doctrine still outranks the stock row', () => {
  const entity = {
    alive: true,
    data: {
      lootTableId: 'mine_layer_jackal',
      // An encounter script / ACE loadout that deliberately re-files the hull keeps its call.
      ai: { combatDoctrineId: 'brawler_commit' },
    },
  };
  const stamped = stampManeuverIdentities({}, [entity]);
  assert.equal(stamped, 0);
  assert.equal(entity.data.ai.combatDoctrineId, 'brawler_commit');
});

test('FIGHT-01: sibling overrides still stamp — only the jackal entry retired', () => {
  const wasp = {
    alive: true,
    data: {
      lootTableId: 'wasp_swarmer',
      ai: { combatDoctrineId: 'interceptor_flyby' },
    },
  };
  const stamped = stampManeuverIdentities({}, [wasp]);
  assert.equal(stamped, 1, 'the override mechanism itself is untouched');
  assert.equal(wasp.data.ai.combatDoctrineId, 'swarm_pack');
});
