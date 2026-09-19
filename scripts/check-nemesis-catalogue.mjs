#!/usr/bin/env node
// Run AFTER installation in the full SpaceFace checkout. Not part of standalone evidence.
import assert from 'node:assert/strict';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { buildNemesisSpawnSpecs } from '../src/nemesis/encounterHost.js';
import { NEMESIS_KITS } from '../src/data/nemesisRival.js';
import { normalizePlan } from '../src/nemesis/model.js';
const catalogue = new Map(ENEMY_TYPES.map((entry) => [entry.id, entry]));
const state = { tick: 123, playerId: 1, entities: new Map([[1, { id: 1, alive: true,
  hull: 100, hullMax: 100, pos: { x: 0, z: 0 }, rot: 0 }]]) };
let ships = 0;
for (const kit of Object.values(NEMESIS_KITS)) {
  for (const id of [kit.bossArchetype, kit.escortArchetype]) {
    assert.ok(catalogue.has(id), `Unknown catalogue archetype ${id}; combat's fallback is NOT acceptable`);
  }
  const request = { requestId: `catalogue:${kit.id}`, plan: normalizePlan({ primary: kit.id, chapter: 3 }) };
  const specs = buildNemesisSpawnSpecs(request, state, makeEnemySpawnSpec);
  assert.equal(specs.length, 3);
  for (const [slot, spec] of specs.entries()) {
    const id = slot ? kit.escortArchetype : kit.bossArchetype;
    const raw = makeEnemySpawnSpec(id, slot ? 7 : 8, spec.pos, { factionId: 'faction_quiet', startedTick: state.tick });
    assert.equal(spec.hullMax, raw.hullMax, `${id}: unauthorized hull multiplier`);
    assert.deepEqual(spec.data.weapons, raw.data.weapons, `${id}: unauthorized fit change`);
    assert.equal(spec.data.nemesis.encounterId, request.requestId);
    ships++;
  }
  assert.equal(specs[0].data.ai.combatDoctrineId, kit.doctrineId);
  console.log(`PASS ${kit.id}: ${kit.bossArchetype} / ${kit.escortArchetype}`);
}
console.log(`Validated ${ships} production-built ship specs. This is catalogue integration, not a full gameplay acceptance run.`);
