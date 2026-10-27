// W2-C / O13: a combat:damage listener that routes another hit (a thermal hit rupturing a volatile
// pod) must not rewrite the record the OUTER emit is still handing to its remaining listeners.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';

function boot() {
  const bus = createBus();
  const state = {
    tick: 1,
    playerId: 1,
    combat: { traces: [] },
    entities: new Map(),
    settings: { gameplay: { difficulty: 'veteran' } },
  };
  const ship = (id, team, x) => ({
    id, type: 'ship', alive: true, team,
    hull: 400, hullMax: 400, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    radius: 10, pos: { x, z: 0 },
  });
  // Attackers 2 and 4 fly team 1; victims 3 and 5 fly team 2 (same-team fire is refused upstream).
  for (const e of [ship(1, 0, 0), ship(2, 1, 20), ship(3, 2, 60), ship(4, 1, 100), ship(5, 2, 140)]) state.entities.set(e.id, e);
  const router = createDamageRouter({
    state,
    catalog: createCombatCatalog(),
    bus,
    helpers: {},
  }, { schedule: () => {} });
  return { bus, router };
}

const hit = (attackerId, targetId, kinetic) => ({
  attackerId,
  targetId,
  packet: { channels: { kinetic }, penetration: 0, shieldBypass: 0 },
  origin: { kind: 'weapon', id: 'wpn_pulse_laser_s', weaponId: 'wpn_pulse_laser_s' },
});

test('a rupture routed from inside combat:damage leaves the outer listeners seeing the outer hit', () => {
  const { bus, router } = boot();
  const seen = [];
  let rupturedOnce = false;
  // First listener plays the volatile pod: on the OUTER hit it routes the rupture synchronously.
  bus.on('combat:damage', (p) => {
    seen.push(['pod', p.attackerId, p.targetId, p.rawTotal]);
    if (!rupturedOnce && p.targetId === 3) {
      rupturedOnce = true;
      router(hit(4, 5, 7));
    }
  });
  // Second listener is the "remaining" outer listener: it must read the outer hit, not the rupture.
  bus.on('combat:damage', (p) => {
    seen.push(['after', p.attackerId, p.targetId, p.rawTotal, p.amount, p.hullDamage > 0]);
  });
  router(hit(2, 3, 25));

  const outerAfter = seen.filter((row) => row[0] === 'after' && row[2] === 3);
  assert.equal(outerAfter.length, 1, 'outer hit reaches its second listener once');
  assert.equal(outerAfter[0][1], 2, 'outer attacker survives the nested route');
  assert.equal(outerAfter[0][3], 25, 'outer raw total survives the nested route');
  assert.equal(outerAfter[0][4], 25, 'outer amount survives the nested route');
  const nestedAfter = seen.filter((row) => row[0] === 'after' && row[2] === 5);
  assert.equal(nestedAfter.length, 1);
  assert.equal(nestedAfter[0][1], 4, 'the rupture is its own record');
  assert.equal(nestedAfter[0][3], 7);
});

test('the common non-nested path keeps one stable record (no per-hit allocation)', () => {
  const { bus, router } = boot();
  const records = new Set();
  bus.on('combat:damage', (p) => records.add(p));
  router(hit(2, 3, 5));
  router(hit(2, 5, 6));
  router(hit(4, 3, 7));
  assert.equal(records.size, 1, 'sequential hits reuse the depth-0 record');
});

test('a throwing listener cannot strand the dispatch depth', () => {
  const { bus, router } = boot();
  const records = new Set();
  let boom = true;
  bus.on('combat:damage', (p) => {
    records.add(p);
    if (boom) { boom = false; throw new Error('listener failure'); }
  });
  const quiet = console.error;
  console.error = () => {}; // the bus logs a swallowed listener failure
  try { router(hit(2, 3, 5)); } catch { /* the bus may rethrow or swallow; either is fine */ } finally { console.error = quiet; }
  router(hit(2, 5, 6));
  router(hit(4, 3, 7));
  assert.equal(records.size, 1, 'depth was released, later hits reuse the depth-0 record');
});
