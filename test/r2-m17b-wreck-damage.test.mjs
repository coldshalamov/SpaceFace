import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { combat } from '../src/systems/combat.js';

async function strikeWreck({ speed = 100, hull = 1000, machineType = 'asteroid', gap = 40 } = {}) {
  const host = await bootRealPath({
    seed: 4242,
    systems: ['physics', 'collisionConsequences', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: -200, z: 100 }, isPlayer: true }],
  });
  try {
    const machine = host.runtime.spawn({
      type: machineType, name: 'Crusher head',
      pos: { x: 0, z: 0 }, vel: { x: speed, z: 0 },
      radius: 12, mass: 240, hull: 10000, hullMax: 10000, collides: true,
      physicsBody: {
        schemaVersion: 1, radius: 12, mass: 240, inertiaY: 200,
        dynamic: true, material: machineType === 'wreck' ? 'debris' : 'asteroid', revision: 0,
      },
    });
    const wreck = host.runtime.spawn({
      type: 'wreck', name: 'Broken tower',
      pos: { x: gap, z: 0 }, vel: { x: 0, z: 0 },
      radius: 12, mass: 20, hull, hullMax: hull, collides: true,
      physicsBody: {
        schemaVersion: 1, radius: 12, mass: 20, inertiaY: 200,
        dynamic: true, material: 'debris', revision: 0,
      },
    });
    const impacts = [], damage = [], deaths = [], hitstun = [];
    host.bus.on('physics:impact', p => {
      if ([p.aId, p.bId].includes(wreck.id)) impacts.push({ ...p });
    });
    host.bus.on('combat:damage', p => {
      if (p.targetId === wreck.id) damage.push({ ...p });
    });
    host.bus.on('entity:killed', p => {
      if (p.id === wreck.id) deaths.push(p);
    });
    host.bus.on('combat:hitstunImpulse', p => {
      if (p.victimId === wreck.id) hitstun.push(p);
    });
    host.step(1);
    host.assertBodies([machine, wreck], 'crusher and wreck are native bodies');
    host.step(119);
    return {
      before: hull, hull: wreck.hull, alive: wreck.alive, impacts, damage, deaths, hitstun,
      backend: host.proof().backend,
    };
  } finally {
    host.dispose();
  }
}

test('a moving crusher body damages a wreck through real Rapier contacts and the combat owner', async t => {
  const result = await strikeWreck();
  t.diagnostic(`seed 4242: wreck hull ${result.before} -> ${result.hull}; `
    + `${result.impacts.length} native receipts, ${result.damage.length} damage packet`);
  assert.equal(result.backend, 'rapier-dynamic');
  assert.ok(result.impacts.length > 0, 'the native solver publishes the machine strike');
  assert.ok(result.hull < result.before, 'the machine strike must reduce wreck hull');
  assert.ok(result.hull > 0, 'a sturdy wreck survives the first strike');
  assert.equal(result.alive, true);
  assert.equal(result.damage.length, 1, 'one strike routes one damage packet');
  assert.equal(result.damage[0].origin.kind, 'collision');
  assert.equal(result.deaths.length, 0);
  assert.equal(result.hitstun.length, 0, 'wreck damage does not apply ship helm effects');
});

test('a wreck-bodied machine breaks a fragile wreck once, deterministically', async () => {
  const first = await strikeWreck({ hull: 1, machineType: 'wreck' });
  const replay = await strikeWreck({ hull: 1, machineType: 'wreck' });
  for (const result of [first, replay]) {
    assert.ok(result.impacts.length > 0, 'wreck bodies really collide');
    assert.equal(result.hull, 0, 'the strike breaks the fragile wreck');
    assert.equal(result.alive, false);
    assert.equal(result.damage.length, 1);
    assert.equal(result.deaths.length, 1, 'the combat death owner publishes one wreck death');
    assert.equal(result.deaths[0].type, 'wreck');
  }
  assert.deepEqual(replay, first, 'seed 4242 replays the same contacts and damage');
});

test('no contact and a gentle machine touch leave wreck health unchanged', async () => {
  const quiet = await strikeWreck({ speed: 0 });
  const gentle = await strikeWreck({ speed: 2, gap: 25 });
  assert.equal(quiet.impacts.length, 0);
  assert.ok(gentle.impacts.length > 0, 'the quiet branch includes a real low-speed touch');
  for (const result of [quiet, gentle]) {
    assert.equal(result.hull, result.before);
    assert.equal(result.alive, true);
    assert.equal(result.damage.length, 0);
    assert.equal(result.deaths.length, 0);
  }
});
