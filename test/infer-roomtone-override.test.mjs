// Test verifying roomTone profile resolution with string overrides and safe non-object mix handling
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRoomProfile, ROOM_PROFILES } from '../src/audio/roomTone.js';

test('resolveRoomProfile resolves default and sector room profiles', () => {
  assert.equal(resolveRoomProfile(null), ROOM_PROFILES.void);
  assert.equal(resolveRoomProfile({ phase: 'dock' }), ROOM_PROFILES.berth);
  assert.equal(resolveRoomProfile({ sectorId: 'sector_ceres_belt' }), ROOM_PROFILES.belt);
  assert.equal(resolveRoomProfile({ sectorId: 'sector_vesta_forge' }), ROOM_PROFILES.forge);
});

test('resolveRoomProfile respects explicit room string override', () => {
  // A localized anomaly or interior zone within Ceres belt can specify room: 'deep'
  const frameWithRoomStr = { sectorId: 'sector_ceres_belt', room: 'deep' };
  assert.equal(resolveRoomProfile(frameWithRoomStr), ROOM_PROFILES.deep);

  // roomKind or roomProfile property
  const frameWithKind = { sectorId: 'sector_ceres_belt', roomKind: 'ash' };
  assert.equal(resolveRoomProfile(frameWithKind), ROOM_PROFILES.ash);
});

test('resolveRoomProfile ignores unknown room string and falls back to sector identity', () => {
  const frameUnknown = { sectorId: 'sector_ceres_belt', room: 'nonexistent_room' };
  assert.equal(resolveRoomProfile(frameUnknown), ROOM_PROFILES.belt);
});
