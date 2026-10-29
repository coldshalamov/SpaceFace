import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { swarmFortifyCorridorForGate } from '../src/data/swarmFortify.js';

test('an entirely obstructed swarm gate defers rather than teleporting far beyond the fight', () => {
  const rock = { id: 9, type: 'asteroid', alive: true, radius: 1500, pos: { x: 0, z: 0 } };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player], [9, rock]]);
  const spawned = [];
  const ctx = {
    state: { playerId: 1, entities, simTime: 0, tick: 0 },
    helpers: {
      spawnBudget: { request: (n) => n, bindEntity: () => true },
      spawnEntity: (spec) => { spawned.push(spec); return { id: 100 + spawned.length }; },
    },
  };
  const receipt = materializeWaveBatch(ctx, { count: 6, enemyId: 'detonator_dart', wave: 1, seed: 4242, swarm: true });
  assert.equal(spawned.length, 0, 'unsafe admissions are deferred');
  assert.equal(receipt.deferred, 6);
  assert.equal(receipt.admitted, 0);
  player.pos = { x: 5000, z: 5000 };
  ctx.registry = { get: name => name === 'swarmFortify' ? {
    getIngressPolicy: () => ({ gateGroupPolicy: 'fortify-three-corridor-v1', anchor: { x: 0, z: 0, rotation: 0 } }),
  } : null };
  const fortified = materializeWaveBatch(ctx, { count: 1, enemyId: 'detonator_dart',
    wave: 2, seed: 4242, swarm: true, distance: 600, gateGroup: 'front' });
  assert.equal(fortified.admitted, 0, 'a blocked fixed approach cannot relocate arrivals around a distant pilot');
  assert.equal(fortified.deferred, 1);
  assert.equal(spawned.length, 0);
});

test('hulls of one batch are born apart, never stacked inside each other', () => {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player]]);
  const spawned = [];
  const ctx = {
    state: { playerId: 1, entities, simTime: 0, tick: 0 },
    helpers: {
      spawnBudget: { request: (n) => n, bindEntity: () => true },
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
      assert.ok(d >= spawned[i].radius + spawned[j].radius + 8, `hulls ${i} and ${j} are ${d.toFixed(1)} wu apart`);
    }
  }
});

test('Fortify Swarm ingress uses three mapped corridors from the fixed arena origin', () => {
  const arenaAnchor = { x: 24, z: -18, rotation: 0 };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 2400, z: -1800 } };
  const entities = new Map([[player.id, player]]);
  const spawned = [];
  const ctx = {
    state: { playerId: player.id, entities, simTime: 0, tick: 0 },
    registry: { get: (name) => name === 'swarmFortify' ? {
      getIngressPolicy: () => ({ gateGroupPolicy: 'fortify-three-corridor-v1', anchor: { ...arenaAnchor } }),
    } : null },
    helpers: {
      spawnBudget: { request: (n) => n, bindEntity: () => true },
      spawnEntity: (spec) => { spawned.push(spec); return { id: 100 + spawned.length }; },
    },
  };
  const gates = ['front', 'ne', 'diagonal_b', 'se', 'rear', 'sw', 'diagonal_a', 'nw'];
  const directions = new Map();
  for (let i = 0; i < gates.length; i++) {
    const gateGroup = gates[i];
    const receipt = materializeWaveBatch(ctx, {
      count: 1, enemyId: 'detonator_dart', wave: 2, seed: 4242,
      packageIndex: i, batchIndex: i, gateGroup, swarm: true, distance: 600,
    });
    const spec = spawned.at(-1);
    const corridor = swarmFortifyCorridorForGate(gateGroup, 2);
    assert.equal(spec.data.swarmGateGroup, corridor, 'AI sees the physical Fortify ingress corridor');
    assert.equal(spec.data.swarmSourceGateGroup, gateGroup, 'the authored source label remains available for provenance');
    assert.equal(receipt.gateGroup, corridor);
    assert.equal(receipt.sourceGateGroup, gateGroup);
    assert.equal(receipt.ingressPose.origin.x, arenaAnchor.x);
    assert.equal(receipt.ingressPose.origin.z, arenaAnchor.z);
    assert.equal(spec.data.swarmIngressPose.x, receipt.ingressPose.x);
    assert.equal(spec.data.swarmIngressPose.z, receipt.ingressPose.z);
    assert.equal(spec.data.swarmIngressPose.heading, receipt.ingressPose.heading);
    directions.set(corridor, directions.get(corridor) || []);
    directions.get(corridor).push(spec.pos);
    const expected = corridor === 'front' ? { x: 0, z: -1 }
      : corridor === 'diagonal_a' ? { x: -1, z: 0 } : { x: 1, z: 0 };
    const dx = spec.pos.x - arenaAnchor.x;
    const dz = spec.pos.z - arenaAnchor.z;
    const distance = Math.hypot(dx, dz);
    assert.ok(distance > 490 && distance < 710, `arrival remains in the authored 600 WU band: ${distance}`);
    assert.ok((dx * expected.x + dz * expected.z) / distance > 0.98,
      `${gateGroup} arrives on its ${corridor} Fortify approach`);
  }
  assert.equal(directions.size, 3, 'the eight authored labels resolve to three physical ingress corridors');
  for (const points of directions.values()) assert.ok(points.length >= 2);
});

test('ordinary Swarm keeps its authored gate label and follows the player without Fortify construction', () => {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 1200, z: -900 } };
  const entities = new Map([[player.id, player]]);
  const spawned = [];
  const ctx = {
    state: { playerId: player.id, entities, simTime: 0, tick: 0 },
    helpers: {
      spawnBudget: { request: (n) => n, bindEntity: () => true },
      spawnEntity: (spec) => { spawned.push(spec); return { id: 200 + spawned.length }; },
    },
  };
  const receipt = materializeWaveBatch(ctx, {
    count: 1, enemyId: 'detonator_dart', wave: 1, seed: 11,
    gateGroup: 'ne', swarm: true, distance: 600,
  });
  assert.equal(receipt.admitted, 1);
  const spec = spawned[0];
  assert.equal(spec.data.swarmGateGroup, 'ne');
  assert.equal(spec.data.swarmSourceGateGroup, undefined);
  assert.equal(receipt.gateGroup, undefined, 'legacy materialization receipts keep their existing shape');
  assert.ok(Math.hypot(spec.pos.x - player.pos.x, spec.pos.z - player.pos.z) > 100,
    'the arrival remains outside the player body');
  assert.ok(Math.hypot(spec.pos.x, spec.pos.z) > 800,
    'unfortified Swarm still tracks the current player origin instead of a Fortify anchor');
});
