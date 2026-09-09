import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECORD_KIND,
  bindEntityToRecord,
  normalizeRecord,
  spawnSpecFromRecord,
} from '../src/world/worldRecords.js';

test('legacy missionTag-only records retain mission identity when rematerialized', () => {
  const record = normalizeRecord({
    recordId: 'wr_legacy_mission_target',
    kind: RECORD_KIND.MISSION_TARGET,
    sectorId: 'sector_helios_prime',
    pos: { x: 120, z: -40 },
    missionTag: 'mission_legacy_rescue',
  });

  assert.equal(record.missionId, 'mission_legacy_rescue');
  assert.equal(record.missionTag, 'mission_legacy_rescue');

  const spec = spawnSpecFromRecord(record);
  assert.equal(spec.data.missionId, 'mission_legacy_rescue');
  assert.equal(spec.data.missionTag, 'mission_legacy_rescue');

  const entity = { data: {}, flags: {} };
  bindEntityToRecord(entity, record);
  assert.equal(entity.data.missionId, 'mission_legacy_rescue');
  assert.equal(entity.data.missionTag, 'mission_legacy_rescue');
});
