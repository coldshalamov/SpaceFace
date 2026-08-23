// PQ-133.04 / CRU-025..027 — surface-contact receipt, reflection, Bank Shot + Smart Bank.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACK_TRAIT_BY_ID,
  validateAttackTraitCatalog,
} from '../src/data/attackTraits.js';
import {
  compileAttackSpec,
  describeAttackMetrics,
  digestAttackSpec,
} from '../src/combat/attackSpec.js';
import {
  PROC_COSTS,
  createLineage,
} from '../src/combat/attackLineage.js';
import {
  SURFACE_RESPONSE,
  applyReflectedVelocity,
  createSurfaceContactReceipt,
  isSurfaceContactReceipt,
  reflectVelocity,
  surfaceResponseFor,
} from '../src/core/surfaceContact.js';
import { resolveRicochet } from '../src/combat/surfaceReflection.js';

function compile(weaponId, modifiers = []) {
  const result = compileAttackSpec({ weaponId, modifiers });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function lineageFor(spec, overrides = {}) {
  return createLineage({ spec, createdTick: 10, sourceEntityId: 'player', ...overrides });
}

function plateReceipt(overrides = {}) {
  return createSurfaceContactReceipt({
    point: { x: 10, z: 0 },
    normal: { x: -1, z: 0 },
    material: 'reflective',
    velocity: { x: 12, z: 0 },
    tick: 40,
    projectileId: 'bolt-1',
    surfaceId: 'plate-a',
    ...overrides,
  });
}

test('Smart Bank is a valid catalog trait', () => {
  const catalog = validateAttackTraitCatalog();
  assert.equal(catalog.ok, true, JSON.stringify(catalog.issues));
  assert.ok(ATTACK_TRAIT_BY_ID.mod_smart_bank);
  assert.equal(ATTACK_TRAIT_BY_ID.mod_smart_bank.family, 'ricochet');
});

test('materials reflect, absorb, or do neither', () => {
  assert.equal(surfaceResponseFor('reflective'), SURFACE_RESPONSE.reflect);
  assert.equal(surfaceResponseFor('mirror'), SURFACE_RESPONSE.reflect);
  assert.equal(surfaceResponseFor('plate'), SURFACE_RESPONSE.reflect);
  assert.equal(surfaceResponseFor('absorbent'), SURFACE_RESPONSE.absorb);
  assert.equal(surfaceResponseFor('furnace'), SURFACE_RESPONSE.absorb);
  assert.equal(surfaceResponseFor('rock'), SURFACE_RESPONSE.absorb);
  assert.equal(surfaceResponseFor('ship'), SURFACE_RESPONSE.none);
  assert.equal(surfaceResponseFor('station'), SURFACE_RESPONSE.none);
  assert.equal(surfaceResponseFor('projectile'), SURFACE_RESPONSE.none);
  assert.equal(surfaceResponseFor('unknown_paint'), SURFACE_RESPONSE.none);
});

test('physics receipt is frozen and clones are not receipts', () => {
  const receipt = plateReceipt();
  assert.equal(isSurfaceContactReceipt(receipt), true);
  assert.ok(Object.isFrozen(receipt));
  assert.equal(receipt.source, 'physics');
  assert.equal(receipt.material, 'reflective');
  assert.equal(receipt.response, SURFACE_RESPONSE.reflect);
  assert.equal(receipt.point.x, 10);
  assert.equal(receipt.normal.x, -1);
  const clone = { ...receipt, point: { ...receipt.point } };
  assert.equal(isSurfaceContactReceipt(clone), false);
});

test('exit gate: Pulse Laser direct / bank / smart-bank have distinct stable digests', () => {
  const direct = compile('wpn_pulse_laser_s');
  const bank = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1]]);
  const smart = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1], ['mod_smart_bank', 1]]);

  assert.equal(direct.trajectory.bounces, 0);
  assert.equal(direct.trajectory.afterBounceSteer, null);
  assert.equal(bank.trajectory.bounces, 1);
  assert.equal(bank.trajectory.afterBounceSteer, null);
  assert.equal(smart.trajectory.bounces, 1);
  assert.equal(smart.trajectory.afterBounceSteer.coneDeg, 50);
  assert.equal(smart.trajectory.afterBounceSteer.maxTurnDeg, 35);
  assert.ok(smart.triggers.some((row) => row.event === 'surface_contact' && row.action === 'ricochet'));

  const again = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1], ['mod_smart_bank', 1]]);
  assert.equal(again.digest, smart.digest);
  assert.equal(digestAttackSpec(smart), smart.digest);
  assert.notEqual(direct.digest, bank.digest);
  assert.notEqual(bank.digest, smart.digest);
  assert.notEqual(direct.digest, smart.digest);
  assert.throws(() => { smart.trajectory.bounces = 9; });

  console.log('PQ-133.04 Pulse Laser forms:');
  for (const spec of [direct, bank, smart]) {
    const metrics = describeAttackMetrics(spec);
    console.log(
      `  ${metrics.family} ${metrics.digest} bounces=${metrics.bounces} steer=${JSON.stringify(metrics.afterBounceSteer)}`,
    );
  }
});

test('bounce cause is deterministic: same receipt, same outgoing velocity', () => {
  const a = reflectVelocity({ x: 12, z: 3 }, { x: -1, z: 0 });
  const b = reflectVelocity({ x: 12, z: 3 }, { x: -1, z: 0 });
  assert.deepEqual(a, b);
  assert.equal(a.x, -12);
  assert.equal(a.z, 3);
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1]]);
  const runtimeA = lineageFor(spec);
  const runtimeB = lineageFor(spec);
  const bodyA = { id: 'bolt-1', vel: { x: 12, z: 3 }, rot: 0 };
  const bodyB = { id: 'bolt-2', vel: { x: 12, z: 3 }, rot: 0 };
  const first = resolveRicochet(runtimeA, spec, plateReceipt({ velocity: { x: 12, z: 3 } }), bodyA);
  const second = resolveRicochet(runtimeB, spec, plateReceipt({ velocity: { x: 12, z: 3 } }), bodyB);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, true);
  assert.deepEqual(first.velocity, second.velocity);
  assert.deepEqual(bodyA.vel, bodyB.vel);
});

test('bounce spends one lineage proc and cannot bounce forever', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1]]);
  const runtime = lineageFor(spec);
  const before = runtime.budget.remaining;
  const body = { id: 'bolt-1', vel: { x: 12, z: 0 }, rot: 0 };
  const first = resolveRicochet(runtime, spec, plateReceipt(), body);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(runtime.budget.remaining, before - PROC_COSTS.bounce);
  assert.equal(runtime.remaining.bounces, 0);
  assert.equal(first.body, body);
  assert.equal(body.id, 'bolt-1');
  assert.equal(body.vel.x, -12);
  const second = resolveRicochet(runtime, spec, plateReceipt({ tick: 41 }), body);
  assert.equal(second.ok, false);
  assert.equal(second.consume, true);
  assert.equal(runtime.budget.remaining, before - PROC_COSTS.bounce);
});

test('absorbent surfaces consume without spending bounce budget', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1]]);
  const runtime = lineageFor(spec);
  const before = runtime.budget.remaining;
  const body = { id: 'bolt-1', vel: { x: 12, z: 0 } };
  const result = resolveRicochet(runtime, spec, plateReceipt({ material: 'furnace' }), body);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'absorbed');
  assert.equal(runtime.budget.remaining, before);
  assert.equal(runtime.remaining.bounces, 1);
  assert.equal(body.vel.x, 12);
});

test('ordinary shots without Bank Shot do not bounce', () => {
  const spec = compile('wpn_pulse_laser_s');
  const runtime = lineageFor(spec);
  const body = { id: 'bolt-1', vel: { x: 12, z: 0 } };
  const result = resolveRicochet(runtime, spec, plateReceipt(), body);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_inherited');
  assert.equal(body.vel.x, 12);
});

test('a renderer-shaped contact cannot invent a bounce', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1]]);
  const runtime = lineageFor(spec);
  const fake = {
    source: 'physics',
    point: { x: 10, z: 0 },
    normal: { x: -1, z: 0 },
    material: 'reflective',
    response: 'reflect',
    velocity: { x: 12, z: 0 },
  };
  const body = { id: 'bolt-1', vel: { x: 12, z: 0 } };
  const result = resolveRicochet(runtime, spec, fake, body);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_physics_receipt');
  assert.equal(runtime.remaining.bounces, 1);
});

test('Smart Bank steers deterministically inside the cone, ignoring insertion order', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1], ['mod_smart_bank', 1]]);
  const hostiles = [
    { id: 'far', score: 0, pos: { x: -40, z: 2 } },
    { id: 'near', score: 0, pos: { x: -8, z: 1 } },
    { id: 'side', score: 0, pos: { x: 0, z: 40 } },
  ];
  const bodyA = { id: 'bolt-a', vel: { x: 10, z: 0 }, rot: 0 };
  const bodyB = { id: 'bolt-b', vel: { x: 10, z: 0 }, rot: 0 };
  const first = resolveRicochet(
    lineageFor(spec),
    spec,
    plateReceipt({ velocity: { x: 10, z: 0 } }),
    bodyA,
    { hostiles },
  );
  const second = resolveRicochet(
    lineageFor(spec),
    spec,
    plateReceipt({ velocity: { x: 10, z: 0 } }),
    bodyB,
    { hostiles: hostiles.slice().reverse() },
  );
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, true);
  assert.equal(first.steered, true);
  assert.deepEqual(first.velocity, second.velocity);
  assert.ok(first.velocity.z > 0);
});

test('continuing the same body does not allocate a replacement projectile', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1]]);
  const body = { id: 'bolt-keep', vel: { x: 4, z: 1 }, rot: 0 };
  const identity = body;
  applyReflectedVelocity(body, { x: -4, z: 1 });
  assert.equal(body, identity);
  const result = resolveRicochet(
    lineageFor(spec),
    spec,
    plateReceipt({ velocity: { x: 4, z: 1 } }),
    body,
  );
  assert.equal(result.ok, true);
  assert.equal(result.body, identity);
  assert.equal(result.body.id, 'bolt-keep');
});
