import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_HULL_LOSSES,
  createEmptyRecordsBag,
  normalizeRecordsBag,
  recordPlayerHullLoss,
  serializeRecordsBag,
} from '../src/world/worldRecords.js';

function stateFor() {
  const entity = { id: 1, rot: 0.25, data: { defId: 'ship_kestrel', shipName: 'Second Sunrise' } };
  return {
    meta: { seed: 77 },
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, entity]]),
    player: { ownedShips: [{ defId: 'ship_kestrel', name: 'Second Sunrise' }], activeShipIndex: 0 },
    world: { currentSectorId: 'sector_ceres_belt', records: createEmptyRecordsBag() },
  };
}

test('300 deaths keep only the newest 200 hull losses, oldest retired first', () => {
  const state = stateFor();
  for (let i = 1; i <= 300; i++) {
    state.simTime = i * 10;
    assert.ok(recordPlayerHullLoss(state), `death ${i} records a row`);
  }
  const rows = state.world.records.hullLosses;
  assert.equal(MAX_HULL_LOSSES, 200);
  assert.equal(rows.length, 200);
  // Existing ordering is append order: oldest kept row first, newest last.
  assert.equal(rows[0].lostAt, 101 * 10);
  assert.equal(rows.at(-1).lostAt, 300 * 10);
});

test('a re-recorded death inside the window is still deduped, not re-added', () => {
  const state = stateFor();
  state.simTime = 5;
  const first = recordPlayerHullLoss(state);
  const again = recordPlayerHullLoss(state);
  assert.equal(again.lossId, first.lossId);
  assert.equal(state.world.records.hullLosses.length, 1);
});

test('an oversized stored list (old save) is trimmed to the newest 200 on load and on save', () => {
  const state = stateFor();
  for (let i = 1; i <= 260; i++) {
    state.simTime = i;
    recordPlayerHullLoss(state);
  }
  // Rebuild an uncapped legacy list straight from the bag, then push it through load + save.
  const legacy = createEmptyRecordsBag();
  legacy.hullLosses = [];
  for (let i = 1; i <= 300; i++) {
    legacy.hullLosses.push({
      lossId: `loss_${i}`, name: 'Old Hull', shipDefId: 'ship_kestrel', shipClass: 'Kestrel',
      sectorId: 'sector_ceres_belt', sectorName: 'Ceres Belt', lostAt: i, rot: 0, radius: 14,
    });
  }
  const loaded = normalizeRecordsBag(legacy);
  assert.equal(loaded.hullLosses.length, 200);
  assert.equal(loaded.hullLosses[0].lossId, 'loss_101');
  assert.equal(loaded.hullLosses.at(-1).lossId, 'loss_300');
  const saved = serializeRecordsBag(legacy);
  assert.equal(saved.hullLosses.length, 200);
  assert.equal(saved.hullLosses.at(-1).lossId, 'loss_300');
});
