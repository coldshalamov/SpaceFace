import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';

function boot() {
  const bus = createBus();
  const events = [];
  bus.on('combat:emp', (p) => events.push(['emp', p]));
  bus.on('combat:damage', (p) => events.push(['damage', p]));
  const state = {
    tick: 1,
    playerId: 1,
    combat: { traces: [] },
    entities: new Map(),
    settings: { gameplay: { difficulty: 'veteran' } },
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    hull: 200, hullMax: 200, shield: 80, shieldMax: 80, armorHp: 40, armorMax: 40,
    radius: 10, pos: { x: 0, z: 0 },
  };
  const attacker = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 20, z: 0 }, radius: 8 };
  state.entities.set(1, player);
  state.entities.set(2, attacker);
  const router = createDamageRouter({
    state,
    catalog: createCombatCatalog(),
    bus,
    helpers: {},
  }, { schedule: () => {} });
  return { router, events, player };
}

test('EMP packets emit combat:emp and mark combat:damage so the HUD glitch can fire', () => {
  const { router, events } = boot();
  const result = router({
    attackerId: 2,
    targetId: 1,
    packet: {
      channels: { ion: 45 },
      penetration: 0,
      shieldBypass: 1,
      subsystemShare: 1,
      source: { kind: 'weapon', weaponId: 'wpn_emp_disruptor_m' },
    },
    origin: { kind: 'weapon', id: 'wpn_emp_disruptor_m', weaponId: 'wpn_emp_disruptor_m' },
  });
  assert.equal(result.ok, true);
  const damage = events.find((row) => row[0] === 'damage');
  const emp = events.find((row) => row[0] === 'emp');
  assert.ok(damage, 'combat:damage still publishes');
  assert.equal(damage[1].emp, true);
  assert.equal(damage[1].damageType, 'emp');
  assert.ok(emp, 'combat:emp is the HUD electronic-disruption receipt');
  assert.equal(emp[1].targetId, 1);
  assert.equal(emp[1].attackerId, 2);
});

test('ordinary kinetic hits do not mint an EMP receipt', () => {
  const { router, events } = boot();
  router({
    attackerId: 2,
    targetId: 1,
    packet: { channels: { kinetic: 12 }, penetration: 0, shieldBypass: 0 },
    origin: { kind: 'weapon', id: 'wpn_pulse_laser_s', weaponId: 'wpn_pulse_laser_s' },
  });
  assert.equal(events.some((row) => row[0] === 'emp'), false);
  const damage = events.find((row) => row[0] === 'damage');
  assert.equal(damage[1].emp, false);
});

test('emp id match is token-scoped: a tempest-like id is not an EMP receipt', () => {
  const { router, events } = boot();
  router({
    attackerId: 2,
    targetId: 1,
    packet: { channels: { kinetic: 12 }, penetration: 0, shieldBypass: 0 },
    origin: { kind: 'weapon', id: 'wpn_tempest_launcher', weaponId: 'wpn_tempest_launcher' },
  });
  assert.equal(events.some((row) => row[0] === 'emp'), false, "'temp' contains 'emp' but is not EMP");
  const damage = events.find((row) => row[0] === 'damage');
  assert.equal(damage[1].emp, false);
  assert.notEqual(damage[1].damageType, 'emp');
});
