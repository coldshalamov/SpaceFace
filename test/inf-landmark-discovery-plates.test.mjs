// INF-5 (WF-10): every landmark anomaly has something to say when you find it. First contact
// reads discoveryPlate title/body for the plate and the exploration journal; a landmark POI with no
// plate produces a titled-but-empty record. Every frontier-region landmark POI (and every anomaly
// that points at a flavor source) must carry authored prose.
import assert from 'node:assert/strict';
import test from 'node:test';

import { westSectorCards } from '../src/data/frontierRegions/west.js';
import { NORTH_SECTORS } from '../src/data/frontierRegions/north.js';
import { EAST_SECTORS } from '../src/data/frontierRegions/east.js';
import { SOUTH_SECTORS } from '../src/data/frontierRegions/south.js';

const SECTORS = [...westSectorCards(), ...NORTH_SECTORS, ...EAST_SECTORS, ...SOUTH_SECTORS];

// A landmark POI, and every anomaly (flavor-sourced or not), is something the pilot is told about
// when found. Beacons, caches and ordinary wrecks are finds, not plates.
function needsPlate(poi) {
  return poi.landmark === true
    || poi.type === 'anomaly'
    || poi.flavorSourceId != null
    || poi.flavorTargetRef != null;
}

const flagged = [];
let checked = 0;
for (const sector of SECTORS) {
  for (const poi of sector.pois || []) {
    if (!needsPlate(poi)) continue;
    checked += 1;
    const plate = poi.discoveryPlate;
    const title = plate && typeof plate.title === 'string' ? plate.title.trim() : '';
    const body = plate && typeof plate.body === 'string' ? plate.body.trim() : '';
    if (!title || !body) flagged.push(`${sector.id}/${poi.id}`);
  }
}

test('the frontier regions are readable (the check is not vacuous)', () => {
  assert.ok(SECTORS.length >= 10, `read ${SECTORS.length} frontier sectors`);
  assert.ok(checked >= 10, `checked ${checked} landmark POIs`);
});

test('every landmark or flavored anomaly POI has a discovery plate with a title and a body', () => {
  assert.deepEqual(flagged, [], 'first contact must not produce a titled-but-empty plate');
});

test('plate prose is a short read, not a stub and not a wall', () => {
  for (const sector of SECTORS) {
    for (const poi of sector.pois || []) {
      if (!needsPlate(poi) || !poi.discoveryPlate) continue;
      const { title, body } = poi.discoveryPlate;
      assert.ok(body.length >= 60 && body.length <= 420, `${poi.id} body is ${body.length} chars`);
      assert.ok(title.length >= 3 && title.length <= 48, `${poi.id} title is ${title.length} chars`);
    }
  }
});
