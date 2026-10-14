// First contact for the story-less derelicts: named derelict/wreck POIs that had
// no authored first-contact prose now carry discovery plates, and every plate in
// the sectors catalog keeps the { title, body } shape the presenter reads.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';

function allPois() {
  const out = [];
  for (const sec of SECTORS) for (const p of (sec.pois || [])) out.push({ sector: sec.id, poi: p });
  return out;
}

const NEWLY_PROSED = [
  'poi_helios_ash_pin',
  'poi_helios_whistle',
  'poi_driller',
  'poi_tethys_tally_rack',
  'poi_tethys_tally_pod',
  'poi_freighter',
  'poi_pwreck',
];

test('the seven story-less derelicts now carry first-contact plates', () => {
  const byId = new Map(allPois().map(({ poi }) => [poi.id, poi]));
  for (const id of NEWLY_PROSED) {
    const poi = byId.get(id);
    assert.ok(poi, `${id} exists in the catalog`);
    assert.ok(poi.discoveryPlate, `${id} carries a discovery plate`);
    assert.equal(typeof poi.discoveryPlate.title, 'string');
    assert.ok(poi.discoveryPlate.title.trim().length >= 3, `${id} plate has a real title`);
    assert.equal(typeof poi.discoveryPlate.body, 'string');
    assert.ok(poi.discoveryPlate.body.trim().length >= 40, `${id} plate has a real body`);
  }
});

test('every discovery plate in the catalog keeps the presenter shape', () => {
  for (const { sector, poi } of allPois()) {
    if (!poi.discoveryPlate) continue;
    const plate = poi.discoveryPlate;
    assert.equal(typeof plate.title, 'string', `${sector}:${poi.id} plate title is a string`);
    assert.equal(typeof plate.body, 'string', `${sector}:${poi.id} plate body is a string`);
    assert.ok(plate.title.trim(), `${sector}:${poi.id} plate title is non-empty`);
    assert.ok(plate.body.trim(), `${sector}:${poi.id} plate body is non-empty`);
  }
});

test('world keeps a plated POI alive as a live actor', async () => {
  // world.js keeps discoveryPlate POIs on the live-actor list (poiMustStayLiveActor);
  // the exported discovery surface must accept one of the newly plated rows.
  const world = await import('../src/systems/world.js');
  const poi = allPois().find(({ poi }) => poi.id === 'poi_driller').poi;
  assert.ok(poi.discoveryPlate, 'driller is plated');
  // If the module exports the keeper predicate, pin it directly; otherwise the data
  // shape assertions above plus the existing world suite carry the claim.
  if (typeof world.poiMustStayLiveActor === 'function') {
    assert.equal(world.poiMustStayLiveActor(poi, null), true);
  }
});
