// D54 — hero landmarks at the shipping camera.
// _spawnPOIs must carry a POI record's authored placeScale / placeTargetRadius onto the
// spawned marker's data, and the three undersized wonders declare radii inside the
// proposed bands so their authored GLBs draw as wonders, not ship-sized props.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { world as worldProto } from '../src/systems/world.js';
import { modelTruthRow, modelTruthPlaceDrawScale } from '../src/data/modelTruth.js';
import { resolvePlaceDrawScale } from '../src/render/partsLibrary.js';

const LANDMARKS = [
  {
    poiId: 'poi_memorial',
    sectorId: 'sector_helios_prime',
    placeId: 'place_landmark_candle_fleet',
    band: [90, 110],
  },
  {
    poiId: 'poi_vesta_resonant_cathedral',
    sectorId: 'sector_vesta_forge',
    placeId: 'place_landmark_resonant_cathedral',
    band: [100, 120],
  },
  {
    poiId: 'poi_sker_throne',
    sectorId: 'sector_sker_haven',
    placeId: 'place_landmark_skerris_throne',
    band: [140, 160],
  },
];

function spawnSectorPois(sectorId) {
  const spawned = [];
  const state = { world: {}, entities: new Map(), nextEntityId: 1 };
  const system = Object.assign({}, worldProto, {
    helpers: {
      spawnEntity(spec) {
        const entity = { id: spawned.length + 1, alive: true, ...spec };
        spawned.push(entity);
        return entity;
      },
    },
    _toGlobal: (point) => ({ ...point }),
    _stampHomeSector: () => {},
    state,
  });
  const active = { id: sectorId, pois: [] };
  system._spawnPOIs(
    SECTORS.find((sector) => sector.id === sectorId),
    active,
    { pois: {} },
    () => 0.5,
  );
  return { spawned, active };
}

for (const { poiId, sectorId, placeId, band } of LANDMARKS) {
  test(`${poiId} declares a placeTargetRadius inside the D54 band`, () => {
    const sector = SECTORS.find((s) => s.id === sectorId);
    assert.ok(sector, `${sectorId} exists`);
    const poi = sector.pois.find((p) => p.id === poiId);
    assert.ok(poi, `${poiId} present after anchor merge`);
    assert.equal(poi.landmarkGlb, placeId);
    assert.ok(
      Number.isFinite(poi.placeTargetRadius)
        && poi.placeTargetRadius >= band[0]
        && poi.placeTargetRadius <= band[1],
      `${poiId} placeTargetRadius ${poi.placeTargetRadius} outside ${band[0]}-${band[1]}`,
    );
  });

  test(`${poiId} spawned marker carries the authored draw radius`, () => {
    const { spawned } = spawnSectorPois(sectorId);
    const marker = spawned.find((entity) => entity.data?.poiId === poiId);
    assert.ok(marker, `${poiId} spawned a live marker`);
    const target = marker.data.placeTargetRadius;
    assert.ok(
      Number.isFinite(target) && target >= band[0] && target <= band[1],
      `spawned marker placeTargetRadius ${target} outside ${band[0]}-${band[1]}`,
    );

    // The renderer resolves scale = 2*targetRadius / authoredEnvelope, so the drawn
    // span is exactly 2*targetRadius regardless of the census entityRadius ratio.
    const row = modelTruthRow(placeId);
    assert.ok(row, `${placeId} census row exists`);
    const envelope = Math.max(...row.bounds.size);
    const drawnSpan = 2 * target;
    assert.ok(
      drawnSpan > envelope * (marker.data.visualRadius / row.gameplay.entityRadius),
      `${poiId} drawn span ${drawnSpan} should exceed the old census-scaled ${envelope}`,
    );
    assert.ok(
      marker.radius >= 20 && marker.radius <= 60,
      `${poiId} gameplay footprint ${marker.radius} stays in its authored band`,
    );
  });
}

test('POIs without a declared draw size keep the census-scaled default', () => {
  const { spawned } = spawnSectorPois('sector_ceres_belt');
  const driller = spawned.find((entity) => entity.data?.poiId === 'poi_driller');
  assert.ok(driller, 'poi_driller spawned a live marker');
  assert.equal(driller.data.placeTargetRadius, undefined);
  assert.equal(driller.data.placeScale, undefined);
});

test('Wreck Cathedral world-site root draws at authored scale, not the census radius ratio', () => {
  const row = modelTruthRow('place_landmark_wreck_cathedral');
  assert.ok(row, 'cathedral census row exists');
  const envelope = Math.max(...row.bounds.size);
  // The world-site root entity as spawned by worldSiteRuntime: entity.radius is the site's
  // visualRadius gameplay footprint (360) while placeScale is the manifest's initialScale (1).
  const siteEntity = { type: 'fx', radius: 360, data: { placeId: row.id } };
  const censusScale = modelTruthPlaceDrawScale(siteEntity);
  assert.ok(
    censusScale > 10,
    `census ratio should still be the ~30x regression input (entityRadius ${row.gameplay.entityRadius}), got ${censusScale}`,
  );
  const scale = resolvePlaceDrawScale(
    {
      role: 'world_site_root',
      placeId: row.id,
      placeScale: 1,
      worldSitePresentation: {},
    },
    { targetRadius: null, authoredEnvelope: envelope, censusScale },
  );
  assert.equal(scale, 1, 'declared placeScale wins over the census ratio for a world-site root');
  assert.ok(
    Math.abs(envelope * scale - envelope) < 1e-3,
    `drawn span ${envelope * scale} must equal the authored envelope ${envelope}`,
  );
});

test('ordinary places keep the census ratio ahead of a declared placeScale', () => {
  const scale = resolvePlaceDrawScale(
    { placeScale: 1 },
    { targetRadius: null, authoredEnvelope: 100, censusScale: 2 },
  );
  assert.equal(scale, 2, 'non-site, non-POI places still draw by the census radius ratio');
});

test('POI declared draw size still outranks placeScale and the census ratio', () => {
  const scale = resolvePlaceDrawScale(
    { poi: true, placeScale: 1 },
    { targetRadius: 75, authoredEnvelope: 100, censusScale: 30 },
  );
  assert.equal(scale, 1.5, 'placeTargetRadius maps to 2*radius/envelope for POIs');
});
