// The southern front has a thing to find — a Vael dead drop under the customs scan line,
// off the Dione relay, in the ore field's shadow. Active-scan verb, authored plate, real
// placed body (the same card→anchor merge every frontier cache rides).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SOUTH_SECTORS, SOUTH_ANCHORS } from '../src/data/frontierRegions/south.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';

const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));

function mergedDione() {
  const dione = SOUTH_SECTORS.find((s) => s.id === 'sector_dione_lane');
  assert.ok(dione, 'Dione Lane exists');
  return applySectorAnchors(dione);
}

test('the toll-lane dead drop is a hidden, active-scan cache with an authored plate', () => {
  const drop = mergedDione().pois.find((p) => p.id === 'poi_dione_deaddrop');
  assert.ok(drop, 'the dead drop exists after the card/anchor merge');
  assert.equal(drop.type, 'cache');
  assert.equal(drop.hidden, true, 'the drop stays off proximity discovery');
  assert.equal(drop.requiresActiveScan, true, 'an active pulse finds it, not a proximity freebie');
  assert.equal(drop.factionId, 'faction_vael');
  assert.ok(drop.discoveryPlate && drop.discoveryPlate.title && drop.discoveryPlate.body,
    'the find has its plate');
});

test('the drop is placed inside the field shadow, clear of the relay and both stations', () => {
  const merged = mergedDione();
  const drop = merged.pois.find((p) => p.id === 'poi_dione_deaddrop');
  const relay = merged.pois.find((p) => p.id === 'poi_dione_relay');
  const relayDist = Math.hypot(relay.pos.x - drop.pos.x, relay.pos.z - drop.pos.z);
  assert.ok(relayDist > 100, `off the relay: ${relayDist.toFixed(0)} WU`);
  const field = merged.fields[0];
  const fieldDist = Math.hypot(field.center.x - drop.pos.x, field.center.z - drop.pos.z);
  assert.ok(fieldDist <= field.clusterRadius, 'the drop rides the field shadow');
  for (const station of merged.stations) {
    const d = Math.hypot(station.pos.x - drop.pos.x, station.pos.z - drop.pos.z);
    assert.ok(d > 500, `clear of ${station.id}: ${d.toFixed(0)} WU`);
  }
  assert.ok(SOUTH_ANCHORS.sector_dione_lane.pois.some((p) => p.id === 'poi_dione_deaddrop'),
    'the drop has an anchor row');
});

test('the placed body is packaged art', () => {
  const anchor = SOUTH_ANCHORS.sector_dione_lane.pois.find((p) => p.id === 'poi_dione_deaddrop');
  assert.ok(existsSync(`${PLACES_DIR}${anchor.landmarkGlb}.glb`),
    `${anchor.landmarkGlb}.glb must be packaged`);
});
