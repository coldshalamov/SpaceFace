import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldSubmitEntityMesh,
} from '../src/render/entityMeshVisibility.js';
import {
  TABLE_BAND,
  TABLE_HEARING_FAR_WU,
  TABLE_REFERENCE_SPEED_WU,
  authoredImmediateRadius,
  authoredPrefetchRadius,
  censusTableBands,
  classifyTableBand,
  glassHalfExtents,
  isCriticalStartingHub,
  residencyEvictRadius,
  residencyPrefetchRadius,
  shouldKeepPersistentLandmarkResident,
  submitCullHalfExtents,
  submitRunwayWu,
  tableShadowCastRadius,
  tableTravelSpeed,
} from '../src/render/tabletopPolicy.js';
import {
  isEntityAuthoredUpgradeRelevant,
  isEntityRenderRelevant,
} from '../src/render/renderer.js';

test('default glass is a table, not a thousand-unit fake-visible box', () => {
  const glass = glassHalfExtents(144, 50, 16 / 9);
  assert.ok(glass.halfX < 120, `default halfX ${glass.halfX} should stay table-sized`);
  assert.ok(glass.halfZ < 70, `default halfZ ${glass.halfZ} should stay table-sized`);
  const submit = submitCullHalfExtents(144, 50, 16 / 9);
  assert.ok(submit.runway <= TABLE_REFERENCE_SPEED_WU,
    'submit runway is one second of travel or less');
  assert.ok(submit.halfX < 280, `submit halfX ${submit.halfX} must beat the old 900 WU margin`);
  assert.ok(submit.halfZ < 220, `submit halfZ ${submit.halfZ} must beat the old 900 WU margin`);
  assert.ok(residencyPrefetchRadius() < 500);
  assert.ok(residencyEvictRadius() < 600);
  assert.ok(residencyEvictRadius() > residencyPrefetchRadius());
  assert.ok(authoredPrefetchRadius() < 800);
  assert.ok(authoredImmediateRadius() < 300);
  const maxZoom = submitCullHalfExtents(330, 50, 16 / 9);
  assert.ok(maxZoom.halfX < 400, `max-zoom submit ${maxZoom.halfX} is still a table`);
});

test('table bands keep on-glass ships submitted and drop true off-table roots', () => {
  const glass = glassHalfExtents(144, 50, 16 / 9);
  const runway = submitRunwayWu();
  assert.equal(classifyTableBand({
    dx: glass.halfX * 0.5,
    dz: 0,
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: runway,
  }), TABLE_BAND.GLASS);
  assert.equal(classifyTableBand({
    dx: glass.halfX + runway * 0.5,
    dz: 0,
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: runway,
  }), TABLE_BAND.RUNWAY);
  assert.equal(classifyTableBand({
    dx: glass.halfX + runway + 40,
    dz: 0,
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: runway,
  }), TABLE_BAND.BEYOND);
  assert.equal(shouldSubmitEntityMesh({ hidden: false }), true);
  assert.equal(shouldSubmitEntityMesh({ hidden: true }), false);
  assert.equal(shouldSubmitEntityMesh({ isPlayer: true, hidden: true }), true);
});

test('far current-sector landmarks are map facts until they can enter the table', () => {
  const state = {
    playerId: 1,
    player: { targetId: 9 },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 160, z: 0 }, maxSpeed: 160 }]]),
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const player = { id: 1, type: 'ship', pos: { x: 0, z: 0 } };
  const nearbyStation = {
    id: 11, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 200, z: 0 },
  };
  const currentFar = {
    id: 2, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 9000, z: 0 },
  };
  const neighborNear = {
    id: 3, type: 'station', homeSectorId: 'sector_ceres_belt', pos: { x: 4900, z: 0 },
  };
  const neighborFar = {
    id: 4, type: 'station', homeSectorId: 'sector_ceres_belt', pos: { x: 14000, z: 0 },
  };
  const targetedFar = {
    id: 9, type: 'ship', homeSectorId: 'sector_ceres_belt', pos: { x: 14000, z: 0 },
  };
  const helios = {
    id: 'station_helios',
    type: 'station',
    data: { stationId: 'station_helios', sectorId: 'sector_helios_prime' },
    pos: { x: 9000, z: 0 },
  };

  assert.equal(tableTravelSpeed(state), 160);
  assert.equal(isEntityRenderRelevant(player, state), true);
  assert.equal(isEntityRenderRelevant(nearbyStation, state), true,
    'a station on the approach runway stays meshed');
  assert.equal(isEntityRenderRelevant(currentFar, state), false,
    'a station across the belt is not a live 3D resident');
  assert.equal(isEntityRenderRelevant(neighborNear, state), false,
    'thirty seconds of travel is not an approach runway');
  assert.equal(isEntityRenderRelevant(neighborFar, state), false);
  assert.equal(isEntityRenderRelevant(targetedFar, state), true);
  assert.equal(isCriticalStartingHub(helios), true);
  assert.equal(shouldKeepPersistentLandmarkResident(helios, { mode: 'flight' }), false);
  assert.equal(shouldKeepPersistentLandmarkResident(helios, { mode: 'loading' }), true);
});

test('authored decode follows the table, not a 2400-unit horizon', () => {
  const state = {
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 160, z: 0 } }]]),
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const immediate = { id: 2, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 150, z: 0 } };
  const approaching = { id: 3, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 500, z: 0 } };
  const offAxis = { id: 4, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 0, z: 500 } };
  const far = { id: 5, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 2100, z: 0 } };
  const inboundTraffic = {
    id: 6,
    type: 'ship',
    homeSectorId: 'sector_helios_prime',
    pos: { x: 500, z: 0 },
    vel: { x: -160, z: 0 },
  };
  assert.equal(isEntityAuthoredUpgradeRelevant(immediate, state), true);
  assert.equal(isEntityAuthoredUpgradeRelevant(approaching, state), true);
  assert.equal(isEntityAuthoredUpgradeRelevant(offAxis, state), false);
  assert.equal(isEntityAuthoredUpgradeRelevant(far, state), false);
  state.entities.get(1).vel.x = 0;
  assert.equal(isEntityAuthoredUpgradeRelevant(inboundTraffic, state), true);
});

test('census splits glass, runway, and beyond without collapsing the table', () => {
  const glass = glassHalfExtents(144, 50, 16 / 9);
  const runway = submitRunwayWu();
  const entities = [
    { id: 1, type: 'ship', pos: { x: 0, z: 0 }, radius: 6 },
    { id: 2, type: 'ship', pos: { x: glass.halfX * 0.2, z: 0 }, radius: 6 },
    { id: 3, type: 'ship', pos: { x: glass.halfX + runway * 0.4, z: 0 }, radius: 6 },
    { id: 4, type: 'station', pos: { x: 4000, z: 0 }, radius: 40 },
  ];
  const census = censusTableBands(entities, {
    glassHalfX: glass.halfX,
    glassHalfZ: glass.halfZ,
    runwayWu: runway,
    originX: 0,
    originZ: 0,
    playerId: 1,
    residentIds: new Set([1, 2, 3]),
  });
  assert.equal(census.glass, 2);
  assert.equal(census.runway, 1);
  assert.equal(census.beyond, 1);
  assert.equal(census.submitted, 3);
  assert.equal(census.resident, 3);
  assert.equal(census.landmarks, 1);
});

test('audio hearing follows the table, not a 900 WU horizon', () => {
  assert.ok(TABLE_HEARING_FAR_WU < 400);
  assert.ok(TABLE_HEARING_FAR_WU > submitRunwayWu());
});

test('shadow radius follows the table plus a short skirt', () => {
  const atDefault = tableShadowCastRadius(144, 50, 16 / 9);
  const atMax = tableShadowCastRadius(330, 50, 16 / 9);
  assert.ok(atDefault < 220);
  assert.ok(atMax < 320);
  assert.ok(atMax > atDefault);
});
