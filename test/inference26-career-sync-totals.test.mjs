import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { emptyAchievementBag, installAchievements, resetAchievementsForTests,
  saveAchievementBag } from '../src/systems/achievements.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('shared career sync becomes the floor for the next flight and residence samples', () => {
  resetAchievementsForTests();
  const store = storage(), first = emptyAchievementBag();
  first.counters.distanceFlownWu = 100;
  first.counters['sectorTime:sector_helios_prime'] = 10;
  saveAchievementBag(first, store, { push: false });
  const ship = { id: 1, pos: { x: 0, z: 0 } };
  const state = { simTime: 0, playerId: 1, entities: new Map([[1, ship]]) };
  const bus = createBus(), ledger = installAchievements({ bus, state, storage: store, shell: null, voice: false });
  try {
    bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    bus.emit('economy:tick', { t: 0 });
    const newer = emptyAchievementBag();
    newer.counters.distanceFlownWu = 1000;
    newer.counters['sectorTime:sector_helios_prime'] = 100;
    saveAchievementBag(newer, store, { push: false });
    bus.emit('save:store-synced', {});
    ship.pos.x = 20; state.simTime = 1;
    bus.emit('economy:tick', { t: 1 });
    bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    const counters = ledger.snapshot().counters;
    assert.deepEqual([counters.distanceFlownWu, counters['sectorTime:sector_helios_prime']], [1020, 101],
      'new progress must extend synced career totals, never overwrite them with stale local samplers');
  } finally { ledger.dispose({ flush: false }); resetAchievementsForTests(); }
});
