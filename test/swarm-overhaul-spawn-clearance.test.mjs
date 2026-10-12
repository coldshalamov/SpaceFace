import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';

test('a swarm clump that lands on a rock arrives outside it, not inside it', () => {
  const rock = { id: 9, type: 'asteroid', alive: true, radius: 1500, pos: { x: 0, z: 0 } };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player], [9, rock]]);
  const spawned = [];
  const ctx = {
    state: { playerId: 1, entities, simTime: 0, tick: 0 },
    helpers: {
      spawnBudget: { request: (n) => n },
      spawnEntity: (spec) => { spawned.push(spec); return { id: 100 + spawned.length }; },
    },
  };
  materializeWaveBatch(ctx, { count: 6, enemyId: 'detonator_dart', wave: 1, seed: 4242, swarm: true });
  assert.ok(spawned.length > 0, 'the batch spawned');
  for (const spec of spawned) {
    const d = Math.hypot(spec.pos.x - rock.pos.x, spec.pos.z - rock.pos.z);
    assert.ok(d >= rock.radius, `arrival at ${d.toFixed(1)} wu is clear of the rock`);
  }
});

test('hulls of one batch are born apart, never stacked inside each other', () => {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player]]);
  const spawned = [];
  const ctx = {
    state: { playerId: 1, entities, simTime: 0, tick: 0 },
    helpers: {
      spawnBudget: { request: (n) => n },
      spawnEntity: (spec) => {
        const id = 100 + spawned.length;
        spawned.push(spec);
        entities.set(id, { ...spec, id, type: 'ship', alive: true, pos: { ...spec.pos } });
        return { id };
      },
    },
  };
  materializeWaveBatch(ctx, { count: 8, enemyId: 'wasp_swarmer', wave: 1, seed: 4242, swarm: true });
  assert.ok(spawned.length > 1, 'the batch spawned');
  for (let i = 0; i < spawned.length; i++) {
    for (let j = i + 1; j < spawned.length; j++) {
      const d = Math.hypot(spawned[i].pos.x - spawned[j].pos.x, spawned[i].pos.z - spawned[j].pos.z);
      assert.ok(d >= 14, `hulls ${i} and ${j} are ${d.toFixed(1)} wu apart`);
    }
  }
});
