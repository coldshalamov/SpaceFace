// FB-023 — the lawful archetypes join the Crucible roster as ARENA combatants.
//
// warden_escort, customs_cutter and patrol_lawman patrol lawful space under
// `lawful_wanted_only`: in open space they hold fire unless the pilot is WANTED. The Crucible
// has no WANTED axis, so a cohort body carrying that latch would stand inert on the field and
// stall the round's clear accounting. The wave materializer restamps the COHORT copy into an
// arena contract — the adventure def keeps policing by wanted status, and the authority gate
// still validates motive, trigger, telegraph and response window end to end.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { SWARM_RULESET, swarmRosterFor } from '../src/data/swarmMode.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

const ENEMY = new Map(ENEMY_TYPES.map((e) => [e.id, e]));

function boot() {
  const state = createGameState(4242);
  const bus = createBus();
  const budget = makeBudgetApi(state);
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  return { state, bus, helpers, player };
}

function spawnOne(h, enemyId, wave, extra = {}) {
  const receipt = materializeWaveBatch(
    { state: h.state, bus: h.bus, helpers: h.helpers },
    {
      ownerId: `survival-wave:${wave}`, enemyId, wave,
      count: 1, gateGroup: 'front', seed: 99, level: 6,
      packageIndex: 0, batchIndex: 0, role: 'support',
      ...extra,
    },
  );
  assert.equal(receipt.admitted, 1, `${enemyId} must be admitted`);
  return h.state.entities.get(receipt.spawnedIds[0]);
}

test('the three lawful archetypes unlock on the roster clock — and the trader stays out', () => {
  const idsAt = (wave) => new Set(swarmRosterFor(wave).map((e) => e.enemyId));
  assert.ok(!idsAt(8).has('warden_escort'));
  assert.ok(idsAt(9).has('warden_escort'), 'warden unlocks at wave 9');
  assert.ok(!idsAt(12).has('customs_cutter'));
  assert.ok(idsAt(13).has('customs_cutter'), 'cutter unlocks at wave 13 — the ghost owns 12');
  assert.ok(!idsAt(14).has('patrol_lawman'));
  assert.ok(idsAt(15).has('patrol_lawman'), 'lawman unlocks at wave 15');
  for (let wave = 1; wave <= 90; wave++) {
    assert.ok(!idsAt(wave).has('mule_trader'),
      `wave ${wave}: the fleeing trader is never arena ammunition`);
  }
});

test('a lawful hull under the arena contract is hostile to a clean pilot', () => {
  for (const enemyId of ['patrol_lawman', 'customs_cutter']) {
    const h = boot();
    const entity = spawnOne(h, enemyId, 16, { swarm: true });
    const ai = entity.data.ai;
    assert.equal(ai.lawful, false, `${enemyId}: the cohort copy is not lawful`);
    assert.equal(ai.roe, 'weapons_free');
    assert.equal(ai.motive, 'arena_contract');
    assert.equal(ai.engagementTrigger, 'authorized_hostile_spawn');
    assert.equal(ai.moraleImmune, true);
    assert.equal(ai.surrenderImmune, true);
    assert.ok(isHostileForAI(h.state, entity, h.player),
      `${enemyId}: restamped cohort is hostile with no WANTED heat`);
  }
});

test('the same hull outside the swarm stamp keeps its lawful latch — adventure is untouched', () => {
  const h = boot();
  const entity = spawnOne(h, 'patrol_lawman', 16, { swarm: false });
  assert.equal(entity.data.ai.lawful, true, 'the open-space copy still patrols lawfully');
  assert.equal(entity.data.ai.roe, 'lawful_wanted_only');
  assert.equal(isHostileForAI(h.state, entity, h.player), false,
    'a lawful patrol holds fire on a clean pilot — only the swarm copy fights');
  assert.equal(ENEMY.get('patrol_lawman').factionLawful, true,
    'the DEF is unchanged — the restamp lives on the cohort copy, never the archetype');
});

test('the warden keeps its escort doctrine — the arena restamp does not flatten it into a raider', () => {
  const h = boot();
  const entity = spawnOne(h, 'warden_escort', 16, { swarm: true });
  assert.equal(entity.data.ai.combatDoctrineId, 'escort_screen',
    'warden flies escort_screen — it screens the pack instead of diving like fodder');
  assert.ok(isHostileForAI(h.state, entity, h.player),
    'the warden was never wanted-gated (weapons_free) — it fights without a restamp');
});

test('a non-swarmer with lawful stamped stays inert inside a cohort only if flagged — control case', () => {
  // The restamp is keyed on `req.swarm` — the same materializer serving a non-swarm ruleset
  // leaves lawful identity alone even when the request happens inside a run.
  const h = boot();
  const entity = spawnOne(h, 'customs_cutter', 20, { swarm: false });
  assert.equal(entity.data.ai.lawful, true);
  assert.equal(isHostileForAI(h.state, entity, h.player), false);
  assert.equal(SWARM_RULESET, 'swarm', 'sanity: this file tests the swarm ruleset');
});
