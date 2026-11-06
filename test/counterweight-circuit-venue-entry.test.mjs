import test from 'node:test';
import assert from 'node:assert/strict';
import { getCounterweightCircuitMapMarkers, counterweightDiscovered } from '../src/features/counterweightCircuit/readModel.js';
import { VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';

test('a visited Pallas chart exposes the advertised venue before physical discovery', () => {
  const row = { discovered: false, records: {}, attempt: null };
  const state = { world: { currentSectorId: VENUE_SECTOR_ID, discovery: {}, counterweightCircuit: row }, entities: new Map() };
  const marker = getCounterweightCircuitMapMarkers(state, VENUE_SECTOR_ID)[0];
  assert.ok(marker, 'the chart can lead the pilot to the venue');
  assert.match(marker.label, /Counterweight Circuit/);
  assert.match(marker.label, /approach.*registrar/i);
  assert.equal(marker.discovered, false);
  assert.equal(counterweightDiscovered(state), false, 'chart availability does not discover the physical site');
  const point = buildSystemModel(state, VENUE_SECTOR_ID).points.find(p => p.id === marker.id);
  assert.ok(point, 'the ordinary system chart receives the target');
  assert.match(point.searchText, /Counterweight Circuit/);
  assert.equal(point.x, marker.pos.x); assert.equal(point.z, marker.pos.z);
  assert.deepEqual(row, { discovered:false, records:{}, attempt:null });
});

test('venue remains charted after a real visit, but an unvisited other sector does not reveal it', () => {
  const world = { currentSectorId:'sector_helios_prime', discovery:{}, counterweightCircuit:{discovered:false} };
  assert.deepEqual(getCounterweightCircuitMapMarkers({world}, VENUE_SECTOR_ID), []);
  world.discovery[VENUE_SECTOR_ID] = { visitedCount:1 };
  assert.equal(getCounterweightCircuitMapMarkers({world}, VENUE_SECTOR_ID).length,1);
  assert.deepEqual(getCounterweightCircuitMapMarkers({world}, 'sector_helios_prime'),[]);
  world.counterweightCircuit.discovered=true;
  const [site]=getCounterweightCircuitMapMarkers({world},VENUE_SECTOR_ID);
  assert.equal(site.discovered,true);
  assert.equal(site.label,'Counterweight Circuit');
});
