import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { careerStats, installAchievements, resetAchievementsForTests } from '../src/systems/achievements.js';

test('the live career read includes time in the current sector without a save or exit', () => {
  resetAchievementsForTests();
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const state = { simTime: 0, playerId: 1 }, bus = createBus();
  const ledger = installAchievements({ bus, state, storage, shell: null, voice: false });
  try {
    bus.emit('sector:enter', { sectorId: 'sector_ceres' });
    state.simTime = 125.5;
    assert.equal(careerStats().timeBySector.sector_ceres, 125,
      'opening Statistics while still in a sector must show the residence already earned');
    assert.equal(careerStats().timeBySector.sector_ceres, 125, 'refreshing must not count time twice');
    state.simTime = 130;
    assert.equal(careerStats().timeBySector.sector_ceres, 130);
    bus.emit('sector:exit', { sectorId: 'sector_ceres' });
    state.simTime = 160;
    assert.equal(careerStats().timeBySector.sector_ceres, 130, 'leaving closes the residence clock');
  } finally { ledger.dispose({ flush: false }); resetAchievementsForTests(); }
});
