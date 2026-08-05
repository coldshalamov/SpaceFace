import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worldSource = readFileSync(resolve(ROOT, 'src/systems/world.js'), 'utf8');
const coreDressingStart = worldSource.indexOf('  _spawnCoreDressing(');
const coreDressingEnd = worldSource.indexOf('  _spawnBeltDressing(', coreDressingStart);
const coreDressingSource = worldSource.slice(coreDressingStart, coreDressingEnd);

function allPoiUses(assetId) {
  return SECTORS.flatMap((sector) => (sector.pois || [])
    .filter((poi) => poi.landmarkGlb === assetId)
    .map((poi) => ({ sectorId: sector.id, poiId: poi.id })));
}

test('the Candle Fleet memorial has one dedicated authored identity', () => {
  assert.deepEqual(allPoiUses('place_memorial_array'), [
    { sectorId: 'sector_helios_prime', poiId: 'poi_memorial' },
  ]);
  const memorial = SECTORS.find((sector) => sector.id === 'sector_helios_prime')
    ?.pois.find((poi) => poi.id === 'poi_memorial');
  assert.equal(memorial?.visualRadius, 28);
  assert.equal(
    resolvePlaceFileForEntity({ type: 'fx', data: { landmarkGlb: 'place_memorial_array' } }),
    'places/place_memorial_array.glb',
  );
});

test('ordinary core stations retain the shared neutral billboard identity', () => {
  const ordinaryCoreBillboardCount = SECTORS
    .filter((sector) => sector.paletteClass === 'core'
      || sector.palette === SECTOR_PALETTE_CLASSES.core
      || (sector.palette?.nebulaTint === SECTOR_PALETTE_CLASSES.core.nebulaTint
        && sector.palette?.fog === SECTOR_PALETTE_CLASSES.core.fog))
    .reduce((count, sector) => count + Math.min(2, (sector.stations || []).length), 0);
  assert.equal(ordinaryCoreBillboardCount, 6);
  assert.ok(coreDressingStart >= 0 && coreDressingEnd > coreDressingStart);
  assert.match(coreDressingSource, /_spawnPlaceProp\(active, sector, 'place_station_billboard'/);
  assert.doesNotMatch(coreDressingSource, /place_memorial_array/);
  assert.equal(allPoiUses('place_station_billboard').length, 0);
  assert.equal(
    resolvePlaceFileForEntity({ type: 'fx', data: { placeId: 'place_station_billboard' } }),
    'places/place_station_billboard.glb',
  );
});

test('the broadly reused navigation buoy remains on its neutral shared identity', () => {
  assert.ok(allPoiUses('place_nav_buoy').length > 1);
  assert.equal(
    resolvePlaceFileForEntity({ type: 'fx', data: { placeId: 'place_nav_buoy' } }),
    'places/place_nav_buoy.glb',
  );
});
