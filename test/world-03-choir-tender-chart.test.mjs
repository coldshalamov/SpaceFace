// WORLD-03 — the Choir-Tender wreck is a wreck on the Helios chart, not another
// derelict beacon. Done: Helios POIs include type:'wreck' bound to wreck_choir_tender.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';

const SECTOR_ID = 'sector_helios_prime';

function minimalState() {
  return {
    simTime: 0,
    tick: 0,
    entities: new Map(),
    world: {
      currentSectorId: SECTOR_ID,
      sectors: {},
      discovery: {},
      activeSector: { id: SECTOR_ID, pois: [] },
    },
    player: { flags: {}, uniqueWrecks: { bearings: {} } },
  };
}

const sectorById = (id) => SECTORS.find((s) => s && s.id === id) || null;

test('Helios POIs include a wreck row bound to wreck_choir_tender', () => {
  const sector = sectorById(SECTOR_ID);
  assert.ok(sector, 'Helios sector record must exist');
  const poi = (sector.pois || []).find((p) => p && p.uniqueWreckId === 'wreck_choir_tender');
  assert.ok(poi, 'a Helios POI must bind uniqueWreckId wreck_choir_tender');
  assert.equal(poi.type, 'wreck', 'the bound POI reads as a wreck, not a beacon or derelict');
  assert.equal(poi.runtimeOwner, 'uniqueWrecks',
    'the unique-wreck program owns the body — the chart row must not mint a decoy marker');
  assert.equal(poi.pos, undefined,
    'no static pos: the seeded bearing/exactPos is the wreck\'s true location');
  assert.ok(uniqueWreckById('wreck_choir_tender'),
    'the bound id resolves to a real unique wreck definition');
});

test('the Helios chart lists the bound row as a wreck point', () => {
  const model = buildSystemModel(minimalState(), SECTOR_ID);
  const point = (model.points || []).find((p) => p.id === 'poi_helios_choir_tender');
  assert.ok(point, 'the system chart must list the Choir-Tender POI');
  assert.equal(point.poiType, 'wreck');
  assert.equal(point.name, 'Relief-Freighter Choir-Tender');
});

test('no other Helios POI still stands in as the wreck', () => {
  const sector = sectorById(SECTOR_ID);
  const bound = (sector.pois || []).filter((p) => p && p.uniqueWreckId === 'wreck_choir_tender');
  assert.equal(bound.length, 1, 'exactly one POI binds the Choir-Tender');
});
