// FB-140 — a wreck the player saw is marked, and a decay clears it. Unseen wrecks stay off the chart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { buildClaimOwnershipMarkers } from '../src/ui/galaxyMap.js';

test('a witnessed wreck field is on the chart and a decay removes it', () => {
  const state = {
    simTime: 0,
    meta: { seed: 4242 },
    ui: {},
    world: { currentSectorId: 'sector_ceres_belt' },
    claims: { bodies: [] },
  };
  const bus = createBus();
  createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  bus.emit('wreckEcology:seeded', { fieldId: 'field-1', sectorId: 'sector_ceres_belt', x: 12, z: -4 });
  assert.equal(state.ui.marketNews.log.length, 0);
  bus.emit('wreckEcology:seeded', {
    fieldId: 'field-1', sectorId: 'sector_ceres_belt', x: 12, z: -4, seen: true, name: 'Seam wreck',
  });
  assert.equal(state.ui.marketNews.log.length, 1);
  const marks = buildClaimOwnershipMarkers(state, 'sector_ceres_belt');
  assert.ok(marks.some((row) => row.id === 'wreck:field-1'));
  bus.emit('wreckEcology:decayed', { fieldId: 'field-1' });
  const after = buildClaimOwnershipMarkers(state, 'sector_ceres_belt');
  assert.equal(after.some((row) => row.id === 'wreck:field-1'), false);
});
