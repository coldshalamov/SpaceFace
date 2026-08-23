// PQ-133 live wiring — Bank Shot bounce, chain hops, payload statuses, untraited null case.
import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage, lineageMetrics, resetLineageIds } from '../src/combat/attackLineage.js';
import { resolvePayload } from '../src/combat/attackPayload.js';
import { createSurfaceContactReceipt } from '../src/core/surfaceContact.js';
import { armAttackContinue, resolveLiveAttackHit } from '../src/combat/attackHit.js';
import { buildWeaponDamagePacket } from '../src/systems/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';

function compile(weaponId, modifiers = []) {
  const result = compileAttackSpec({ weaponId, modifiers });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function pulseDef() {
  return WEAPONS.find((row) => row.id === 'wpn_pulse_laser_s');
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

test('Bank Shot reflects the SAME body off a physics receipt and keeps travelling', () => {
  resetLineageIds(1);
  const spec = compile('wpn_pulse_laser_s', [['mod_bank_shot', 1]]);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const body = {
    id: 'bolt-1',
    alive: true,
    pos: { x: 10, z: 0 },
    vel: { x: 12, z: 0 },
    rot: 0,
    radius: 0.7,
  };
  armAttackContinue(body);
  const plate = {
    id: 'plate-a',
    type: 'station',
    surfaceMaterial: 'reflective',
    pos: { x: 12, z: 0 },
  };
  const before = body;
  const result = resolveLiveAttackHit({
    spec,
    runtime,
    projectile: body,
    target: plate,
    payload: { receipt: plateReceipt({ velocity: { x: 12, z: 0 } }) },
    tick: 40,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.consume, false);
  assert.equal(result.projectile, before);
  assert.equal(body.vel.x, -12);
  assert.equal(body.vel.z, 0);
  body.alive = false;
  assert.equal(body.alive, true, 'physics death of a bounced shot is swallowed so the same body continues');
  const metrics = lineageMetrics(runtime);
  assert.ok(metrics.consumed >= 1, 'bounce spends the shared proc budget');
});

test('chain hops eligible targets in score/distance/id order and spends the budget', () => {
  resetLineageIds(1);
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1]]);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const projectile = {
    id: 'bolt-chain',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 10, z: 0 },
    ownerId: 'player',
  };
  const first = { id: 'a', type: 'ship', pos: { x: 0, z: 0 }, alive: true };
  const field = [
    { id: 'c', pos: { x: 90, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'b', pos: { x: 20, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'e', pos: { x: 30, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'd', pos: { x: 40, z: 0 }, score: 1, statuses: [], valid: true },
  ];
  const result = resolveLiveAttackHit({
    spec,
    runtime,
    projectile,
    target: first,
    payload: { pos: first.pos },
    tick: 10,
    candidates: field,
    applyHopDamage: () => {},
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.hops.length, 2, JSON.stringify(result.hops));
  assert.equal(result.hops[0], 'd', 'highest score wins the first hop');
  const metrics = lineageMetrics(runtime);
  assert.ok(metrics.consumed > 0, 'chain hops spend the shared proc budget');
  assert.ok(metrics.remaining < metrics.initial);

  resetLineageIds(1);
  const runtime2 = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const shuffled = [
    { id: 'e', pos: { x: 30, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'd', pos: { x: 40, z: 0 }, score: 1, statuses: [], valid: true },
    { id: 'b', pos: { x: 20, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'c', pos: { x: 90, z: 0 }, score: 0, statuses: [], valid: true },
  ];
  const again = resolveLiveAttackHit({
    spec,
    runtime: runtime2,
    projectile: { ...projectile },
    target: first,
    payload: { pos: first.pos },
    tick: 10,
    candidates: shuffled,
    applyHopDamage: () => {},
  });
  assert.deepEqual(again.hops, result.hops, 'insertion order must not change hop order');
});

test('Ion Payload writes statuses onto the existing damage packet without replacing it', () => {
  const def = pulseDef();
  const spec = compile('wpn_pulse_laser_s', [['mod_ion_payload', 1]]);
  const w = { defId: def.id, dmg: def.dmg, damageType: def.damageType };
  const packet = buildWeaponDamagePacket(w, def, def.dmg, def.damageType);
  const beforeKeys = Object.keys(packet).sort();
  const resolved = resolvePayload(spec, { generation: 0, hasBounced: false });
  assert.ok(resolved.statuses.some((row) => row.id === 'status_ionized' || row.statusId === 'status_ionized'));
  packet.statuses.push({
    id: resolved.statuses[0].id || resolved.statuses[0].statusId,
    stacks: resolved.statuses[0].stacks,
  });
  assert.deepEqual(Object.keys(packet).sort(), beforeKeys);
});

test('untraited Pulse Laser projectile data is identical with or without the live hit path', () => {
  const def = pulseDef();
  const w = { defId: def.id, dmg: def.dmg, damageType: def.damageType, projSpeed: def.projSpeed };
  const a = buildWeaponDamagePacket(w, def, def.dmg, def.damageType);
  const b = buildWeaponDamagePacket(w, def, def.dmg, def.damageType);
  const spec = compile('wpn_pulse_laser_s');
  assert.equal(spec.trajectory.bounces, 0);
  assert.equal(spec.propagation.chain, null);
  assert.deepEqual(a, b);
  assert.ok(!('attackRuntime' in a));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('NEGATIVE: chain order is not insertion order', () => {
  resetLineageIds(1);
  const spec = compile('wpn_pulse_laser_s', [['mod_relay_arc', 1]]);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const first = { id: 'a', type: 'ship', pos: { x: 0, z: 0 }, alive: true };
  const insertion = ['c', 'b', 'e', 'd'];
  const field = [
    { id: 'c', pos: { x: 90, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'b', pos: { x: 20, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'e', pos: { x: 30, z: 0 }, score: 0, statuses: [], valid: true },
    { id: 'd', pos: { x: 40, z: 0 }, score: 1, statuses: [], valid: true },
  ];
  const result = resolveLiveAttackHit({
    spec,
    runtime,
    projectile: { id: 'bolt', pos: { x: 0, z: 0 }, vel: { x: 8, z: 0 }, ownerId: 'player' },
    target: first,
    payload: { pos: first.pos },
    tick: 10,
    candidates: field,
    applyHopDamage: () => {},
  });
  assert.notDeepEqual(result.hops, insertion.slice(0, result.hops.length));
});

test('NEGATIVE: untraited packet must not grow live-attack fields', () => {
  const def = pulseDef();
  const packet = buildWeaponDamagePacket(
    { defId: def.id, dmg: def.dmg, damageType: def.damageType },
    def,
    def.dmg,
    def.damageType,
  );
  assert.equal(packet.attackRuntime, undefined);
  assert.equal(JSON.stringify(packet).includes('attackRuntime'), false);
});
