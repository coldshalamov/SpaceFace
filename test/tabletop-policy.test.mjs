import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldSubmitEntityMesh,
} from '../src/render/entityMeshVisibility.js';
import {
  shouldInstanceChunkCastShadow,
} from '../src/render/instanceChunkSubmitPolicy.js';
import {
  opaqueBatchLane,
} from '../src/render/opaqueMaterialBatch.js';
import {
  allowRealtimeShadowCast,
  shadowCastAxisDistance,
} from '../src/render/shadowCasterPolicy.js';
import {
  TABLE_BAND,
  TABLE_HEARING_FAR_WU,
  TABLE_REFERENCE_SPEED_WU,
  authoredImmediateRadius,
  authoredPrefetchRadius,
  glassCornerWu,
  censusTableBands,
  classifyTableBand,
  glassHalfExtents,
  isCriticalStartingHub,
  residencyEvictRadius,
  residencyPrefetchRadius,
  shouldKeepPersistentLandmarkResident,
  submitCullHalfExtents,
  submitRunwayWu,
  shouldDrawTableVfx,
  tableShadowCastRadius,
  tableShadowCasterRadius,
  tableSimAuthorityWuFromState,
  tableTravelSpeed,
  tableVfxDrawWuFromState,
} from '../src/render/tabletopPolicy.js';
import {
  isEntityAuthoredUpgradeRelevant,
  isEntityRenderRelevant,
} from '../src/render/renderer.js';

test('default glass is a table, not a thousand-unit fake-visible box', () => {
  const glass = glassHalfExtents(144, 50, 16 / 9, 60);
  assert.ok(glass.halfX < 280, `default halfX ${glass.halfX} should stay table-sized`);
  assert.ok(glass.halfZ < 220, `default halfZ ${glass.halfZ} should stay table-sized`);
  const submit = submitCullHalfExtents(144, 50, 16 / 9);
  assert.ok(submit.runway <= TABLE_REFERENCE_SPEED_WU,
    'submit runway is one second of travel or less');
  assert.ok(submit.halfX < 420, `submit halfX ${submit.halfX} must beat the old 900 WU margin`);
  assert.ok(submit.halfZ < 360, `submit halfZ ${submit.halfZ} must beat the old 900 WU margin`);
  assert.ok(residencyPrefetchRadius() < 700);
  assert.ok(residencyEvictRadius() < 800);
  assert.ok(residencyEvictRadius() > residencyPrefetchRadius());
  assert.ok(residencyPrefetchRadius() > glassCornerWu(144, 50, 16 / 9, 60));
  assert.ok(authoredPrefetchRadius() < 800);
  assert.ok(authoredImmediateRadius() < 300);
  const maxZoom = submitCullHalfExtents(330, 50, 16 / 9);
  assert.ok(maxZoom.halfX < 700, `max-zoom submit ${maxZoom.halfX} is still a table`);
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

test('a planet filling the glass stays meshed at the skim band', () => {
  const state = {
    playerId: 1,
    camera: { zoom: 144, tilt: 60 },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 160 }]]),
  };
  const planet = {
    id: 'planet_tethys_anvil',
    type: 'planet',
    alive: true,
    pos: { x: 960, z: 0 },
    radius: 700,
  };
  assert.equal(
    isEntityRenderRelevant(planet, state),
    true,
    'The Anvil at the 960 WU skim band must keep its mesh — the limb is already on the glass',
  );
  const farSpeck = {
    id: 'planet_far',
    type: 'planet',
    alive: true,
    pos: { x: 9000, z: 0 },
    radius: 700,
  };
  assert.equal(isEntityRenderRelevant(farSpeck, state), false,
    'a planet across the belt is still a map fact');
});

test('residency grows with live camera zoom so director-zoom objects stay meshed', () => {
  const player = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 160 };
  const ship = { id: 2, type: 'ship', alive: true, pos: { x: 700, z: 0 }, radius: 8 };
  const tight = {
    playerId: 1,
    camera: { zoom: 144, tilt: 60 },
    entities: new Map([[1, player]]),
  };
  const wide = {
    playerId: 1,
    camera: { zoom: 330, tilt: 60 },
    entities: new Map([[1, player]]),
  };
  assert.equal(isEntityRenderRelevant(ship, tight), false,
    'at default zoom a ship 700 WU out is off the table');
  assert.equal(isEntityRenderRelevant(ship, wide), true,
    'at max legal zoom that same ship is on the glass and must stay meshed');
  const director = {
    playerId: 1,
    camera: { zoom: 45, liveZoom: 330, tilt: 60 },
    entities: new Map([[1, player]]),
  };
  assert.equal(isEntityRenderRelevant(ship, director), true,
    'director-owned live zoom, not the manual target, sizes residency');
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
  state.camera = { zoom: 330, tilt: 60 };
  const visibleStationary = {
    id: 7,
    type: 'station',
    alive: true,
    pos: { x: 300, z: 0 },
    radius: 40,
    vel: { x: 0, z: 0 },
  };
  assert.equal(isEntityAuthoredUpgradeRelevant(visibleStationary, state), true,
    'a stationary station already on the max-zoom glass must start authored decode');
  state.camera = { zoom: 330, tilt: 60, fov: 70 };
  const wideFovStation = {
    id: 8,
    type: 'station',
    alive: true,
    pos: { x: 520, z: 0 },
    radius: 40,
    vel: { x: 0, z: 0 },
  };
  assert.equal(isEntityAuthoredUpgradeRelevant(wideFovStation, state), true,
    'authored glass must honor the live FOV the player actually set');
  state.camera = { zoom: 144, tilt: 60, fov: 50, aspect: 32 / 9 };
  const ultrawideStation = {
    id: 9,
    type: 'station',
    alive: true,
    pos: { x: 300, z: 0 },
    radius: 40,
    vel: { x: 0, z: 0 },
  };
  assert.equal(isEntityAuthoredUpgradeRelevant(ultrawideStation, state), true,
    'authored glass must honor the live viewport aspect');
  state.camera = { zoom: 330, liveZoom: 144, tilt: 60, fov: 50 };
  const pendingZoomOut = {
    id: 10,
    type: 'station',
    alive: true,
    pos: { x: 300, z: 0 },
    radius: 40,
    vel: { x: 0, z: 0 },
  };
  assert.equal(isEntityAuthoredUpgradeRelevant(pendingZoomOut, state), true,
    'outward zoom must prefetch authored glass at the requested zoom, not only the easing live zoom');
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
  const maxSubmit = submitCullHalfExtents(330, 50, 16 / 9, 160, 60);
  const onGlassCorner = Math.hypot(maxSubmit.halfX, maxSubmit.halfZ);
  assert.ok(TABLE_HEARING_FAR_WU < 800, 'hearing is still a table, not the old 900 WU horizon');
  assert.ok(TABLE_HEARING_FAR_WU >= onGlassCorner - 1e-6,
    'max-zoom on-glass ships must still be audible');
});

test('shadow radius follows the table plus a short skirt', () => {
  const atDefault = tableShadowCastRadius(144, 50, 16 / 9);
  const atMax = tableShadowCastRadius(330, 50, 16 / 9);
  assert.ok(atDefault < 280, `default shadow ${atDefault} must beat the old 280 WU box`);
  assert.ok(atMax < 700);
  assert.ok(atMax > atDefault);
  const leftover = (atDefault + 280) * 0.5;
  const leftoverSq = leftover * leftover;
  const nearSq = (atDefault * 0.5) * (atDefault * 0.5);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    distanceSq: leftoverSq,
    castRadius: atDefault,
  }), false);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    distanceSq: leftoverSq,
  }), true);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    distanceSq: nearSq,
    castRadius: atDefault,
  }), true);
  assert.equal(shouldInstanceChunkCastShadow({
    opaque: true,
    submittedCount: 1,
    nearestDistanceSq: leftoverSq,
    castRadiusSq: atDefault * atDefault,
  }), false);
  assert.equal(opaqueBatchLane(leftoverSq, atDefault * atDefault), 'nocast');
  assert.equal(opaqueBatchLane(nearSq, atDefault * atDefault), 'cast');
});

test('max-zoom casters cannot sit outside the key-light box', () => {
  const uncapped = tableShadowCastRadius(330, 50, 16 / 9);
  const capped = tableShadowCasterRadius(330, 50, 16 / 9, 60, 300);
  assert.ok(uncapped > 300, `uncapped max-zoom radius ${uncapped} outgrows the 300 WU ortho`);
  assert.equal(capped, 300);
  const outsideBox = 320 * 320;
  const insideBox = 200 * 200;
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    distanceSq: outsideBox,
    castRadius: capped,
  }), false);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    distanceSq: insideBox,
    castRadius: capped,
  }), true);
  assert.equal(shouldInstanceChunkCastShadow({
    opaque: true,
    submittedCount: 1,
    nearestDistanceSq: outsideBox,
    castRadiusSq: capped * capped,
  }), false);
  assert.equal(opaqueBatchLane(outsideBox, capped * capped), 'nocast');
});

test('a hull inside the square light box still casts on the diagonal', () => {
  const extent = 300;
  const corner = { x: 250, y: 0, z: 250 };
  const hypot = Math.hypot(250, 250);
  assert.ok(hypot > extent, 'the old circle would drop this on-box hull');
  assert.equal(shadowCastAxisDistance(corner, 0, 0), 250);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    axisDistance: shadowCastAxisDistance(corner, 0, 0),
    castRadius: extent,
  }), true);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    axisDistance: 320,
    castRadius: extent,
  }), false);
  assert.equal(tableShadowCasterRadius(330, 50, 16 / 9, 60, 300), 300);
  assert.equal(shouldInstanceChunkCastShadow({
    opaque: true,
    submittedCount: 1,
    nearestAxisDistance: 250,
    castRadius: extent,
  }), true);
  assert.equal(opaqueBatchLane(hypot * hypot, extent * extent, 250, extent), 'cast');
});

test('cosmetic VFX follow the live table, not a 1500 WU horizon', () => {
  const defaultDraw = tableVfxDrawWuFromState({
    camera: { zoom: 144, fov: 50, aspect: 16 / 9 },
  });
  assert.ok(defaultDraw < 800, `default VFX ${defaultDraw} stays on the table`);
  assert.equal(shouldDrawTableVfx(200, 0, defaultDraw), true);
  assert.equal(shouldDrawTableVfx(1500, 0, defaultDraw), false);
  const wide = tableVfxDrawWuFromState({
    camera: { zoom: 330, fov: 90, aspect: 16 / 9 },
  });
  assert.ok(wide > 1500, `wide-lens VFX ${wide} still covers the live glass`);
  assert.equal(shouldDrawTableVfx(800, 0, wide), true);
  const closeShot = tableVfxDrawWuFromState({
    camera: { zoom: 330, liveZoom: 58, fov: 50, aspect: 16 / 9 },
  });
  assert.ok(closeShot < 400, `live close-up VFX ${closeShot} follows the actual table, not the pending zoom-out`);
  const sim = tableSimAuthorityWuFromState({
    camera: { zoom: 144, liveZoom: 330, fov: 90, aspect: 16 / 9 },
    settings: { video: { fov: 50 } },
  });
  assert.ok(sim > 400 && sim < 1100,
    'sim cadence uses a conservative 48:9 table, not the render camera');
});

test('VFX station-side and seam ranges use the table helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(source, /tableVfxDrawWuFromState/);
  assert.match(source, /shouldDrawTableVfx/);
  assert.match(source, /frame\.x - player\.pos\.x/);
  assert.match(source, /_updateNpcJobSignatures/);
  assert.doesNotMatch(source, /NPC_JOB_SIGNATURE_DRAW_RANGE \* NPC_JOB_SIGNATURE_DRAW_RANGE/);
  assert.doesNotMatch(source, /VFX_STATION_SIDE_EVENT_DRAW_RANGE = 1500/);
});

test('station side-events anchor on the sim table, not a 1400 WU horizon', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/systems/stationSideEventDirector.js', import.meta.url), 'utf8');
  assert.match(source, /tableSimAuthorityWuFromState/);
  assert.match(source, /stationSideEventReachWu/);
  assert.doesNotMatch(source, /ANCHOR_RANGE = 1400/);

  const { stationSideEventDirector, stationSideEventReachWu } = await import(
    '../src/systems/stationSideEventDirector.js'
  );
  const mid = {
    type: 'station',
    alive: true,
    pos: { x: 700, z: 0 },
    data: { dockRadius: 72, size: 'M' },
  };
  const far = {
    type: 'station',
    alive: true,
    pos: { x: 2200, z: 0 },
    data: { dockRadius: 72, size: 'M' },
  };
  const state = {
    playerId: 1,
    entities: { get: () => ({ pos: { x: 0, z: 0 } }) },
    entityList: [mid, far],
    camera: { zoom: 144 },
    settings: { video: { fov: 50 } },
  };
  assert.ok(stationSideEventReachWu(mid) > 400, 'outbound path is hundreds of units past the pin');
  assert.equal(stationSideEventDirector._resolveAnchor(state), mid,
    'an M station 700 WU away still anchors because its path can enter the table');
  assert.equal(stationSideEventDirector._resolveAnchor({ ...state, entityList: [far] }), null,
    'a station whose path cannot reach the table stays a map fact');
});
