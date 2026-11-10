// Causal tags on live projectile:hit receipts (PQ-134 follow-on).
// Annotation only: the event says how the hit arrived. Damage numbers must not move.

import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage, resetLineageIds } from '../src/combat/attackLineage.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  causalKindsFromAttackSpec,
  classifyCausalVfxFamily,
} from '../src/presentation/causalVfxGrammar.js';
import { causalKindsFromSpec } from '../src/systems/adventureMigration.js';
import { weapons } from '../src/systems/weapons.js';

const PULSE = 'wpn_pulse_laser_s';

function compile(weaponId, modifiers = []) {
  const result = compileAttackSpec({ weaponId, modifiers });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function ship(id, pos, extra = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 'foe',
    pos,
    ...extra,
  };
}

function emitHit({ spec, runtime = null, hopTargets = [] }) {
  const bus = createBus();
  const first = ship('t0', { x: 0, z: 0 });
  const projectile = {
    id: 'bolt-1',
    type: 'projectile',
    alive: true,
    ownerId: 'player',
    team: 'player',
    pos: { x: 0, z: 0 },
    vel: { x: 12, z: 0 },
    data: {},
  };
  const entities = new Map([
    [projectile.id, projectile],
    [first.id, first],
  ]);
  for (const hop of hopTargets) entities.set(hop.id, hop);
  const state = {
    mode: 'flight',
    tick: 20,
    meta: { seed: 1 },
    entities,
    entityList: [projectile, first, ...hopTargets],
    player: {},
  };
  const system = Object.create(weapons);
  system.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      getEntity: (id) => entities.get(id) || null,
      spawnEntity: () => null,
    },
  });
  system._attackLive.set(projectile.id, { spec, runtime });
  const payload = {
    ownerId: 'player',
    targetId: first.id,
    damage: 12,
    pos: { x: 0, z: 0 },
  };
  bus.emit('projectile:hit', payload);
  return payload;
}

test('ordinary projectile:hit still classifies as null', () => {
  assert.equal(classifyCausalVfxFamily('projectile:hit', { pos: { x: 1, z: 1 }, damage: 4 }), null);
});

test('NEGATIVE: spec CHAIN tags without hops do not classify as chain', () => {
  assert.equal(
    classifyCausalVfxFamily('projectile:hit', { causalTags: ['CHAIN'], damage: 4 }),
    null,
  );
});

test('NEGATIVE: spec STATUS tags without family do not classify as reaction or field', () => {
  assert.equal(
    classifyCausalVfxFamily('projectile:hit', { causalTags: ['STATUS'], damage: 4 }),
    null,
  );
});

test('chain hop stamps CHAIN tags and routes the emitted projectile:hit to chain', () => {
  resetLineageIds(1);
  const spec = compile(PULSE, [['mod_relay_arc', 1]]);
  assert.deepEqual(causalKindsFromSpec(spec), ['CHAIN']);
  assert.deepEqual(causalKindsFromAttackSpec(spec), ['CHAIN']);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const payload = emitHit({
    spec,
    runtime,
    hopTargets: [ship('t1', { x: 40, z: 0 }, { score: 1 })],
  });
  assert.equal(payload.damage, 12, 'stamping must not change damage');
  assert.equal(classifyCausalVfxFamily('projectile:hit', payload), 'chain');
  assert.deepEqual(payload.causalTags, ['CHAIN']);
  assert.ok(Object.isFrozen(payload.causalTags));
  assert.ok(payload.hops > 0, `expected hops on chained hit, got ${payload.hops}`);
  assert.equal(payload.chain, true);
});

test('gravity-mark hit stamps STATUS tags and routes the emitted projectile:hit to field', () => {
  const spec = compile(PULSE, [['mod_gravity_tag', 1]]);
  assert.deepEqual(causalKindsFromSpec(spec), ['STATUS']);
  const payload = emitHit({ spec });
  assert.equal(payload.damage, 12);
  assert.equal(classifyCausalVfxFamily('projectile:hit', payload), 'field');
  assert.deepEqual(payload.causalTags, ['STATUS']);
  assert.equal(payload.family, 'field');
});

test('ion hit stamps STATUS tags and routes the emitted projectile:hit to reaction', () => {
  const spec = compile(PULSE, [['mod_ion_payload', 1]]);
  assert.deepEqual(causalKindsFromSpec(spec), ['STATUS']);
  const payload = emitHit({ spec });
  assert.equal(payload.damage, 12);
  assert.equal(classifyCausalVfxFamily('projectile:hit', payload), 'reaction');
  assert.deepEqual(payload.causalTags, ['STATUS']);
  assert.equal(payload.family, 'reaction');
});

test('two hits of the same spec reuse one frozen causalTags array', () => {
  const spec = compile(PULSE, [['mod_ion_payload', 1]]);
  const a = emitHit({ spec });
  const b = emitHit({ spec });
  assert.ok(Array.isArray(a.causalTags) && a.causalTags.length > 0);
  assert.equal(a.causalTags, b.causalTags);
  assert.ok(Object.isFrozen(a.causalTags));
});
