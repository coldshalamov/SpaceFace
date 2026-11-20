import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createDamageRouter, normalizeDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { validateDamagePacket } from '../src/combat/validate.js';

// penetration + shieldBypass > 1 would drive the shield-routed share negative: the shield
// gains hull out of nothing and the packet delivers more than its raw total.

test('normalizeDamagePacket caps penetration so penetration + shieldBypass stays <= 1', () => {
  const p = normalizeDamagePacket({ channels: { kinetic: 100 }, penetration: 0.5, shieldBypass: 1 });
  assert.equal(p.shieldBypass, 1);
  assert.equal(p.penetration, 0, 'penetration yields to bypass so the routed share cannot go negative');
  const q = normalizeDamagePacket({ channels: { kinetic: 100 }, penetration: 0.3, shieldBypass: 0.5 });
  assert.equal(q.penetration, 0.3, 'a packet already under the cap is untouched');
});

test('validateDamagePacket rejects a packet whose pen + bypass exceeds 1', () => {
  const bad = validateDamagePacket({ channels: { kinetic: 10 }, penetration: 0.5, shieldBypass: 1 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /shieldBypass/);
  const good = validateDamagePacket({ channels: { kinetic: 10 }, penetration: 0.4, shieldBypass: 0.6 });
  assert.equal(good.ok, true);
});

test('routeDamage never heals the shield or over-delivers on an over-capped packet', () => {
  const bus = createBus();
  const state = {
    tick: 1, playerId: 1,
    combat: { traces: [] },
    entities: new Map(),
    settings: { gameplay: { difficulty: 'veteran' } },
  };
  const target = {
    id: 2, type: 'ship', alive: true, team: 1,
    hull: 200, hullMax: 200, shield: 50, shieldMax: 50, armorHp: 40, armorMax: 40,
    radius: 8, pos: { x: 20, z: 0 },
  };
  const attacker = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, radius: 10 };
  state.entities.set(1, attacker);
  state.entities.set(2, target);
  const router = createDamageRouter({ state, bus, catalog: createCombatCatalog(), helpers: {} });
  const shieldBefore = target.shield;
  const hpBefore = target.hull + target.armorHp + target.shield;
  router({
    attackerId: 1, targetId: 2,
    packet: {
      channels: { kinetic: 100 },
      penetration: 0.5, shieldBypass: 1,   // would produce a negative routed share unclamped
    },
  });
  assert.ok(target.shield <= shieldBefore, 'shield cannot be healed by a damage packet');
  assert.ok(target.hull + target.armorHp + target.shield <= hpBefore, 'applied damage cannot exceed the packet raw total');
});
