/**
 * A site courier's body stays up until the pod it pictures actually arrives.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { asteroidSites } from '../src/systems/asteroidSites.js';

function harness() {
  const spawned = [];
  const sites = Object.create(asteroidSites);
  sites.ctx = {
    helpers: {
      spawnEntity(spec) {
        spawned.push(spec);
        return spec;
      },
    },
  };
  const rock = { id: 'rock1', pos: { x: 10, z: 20 }, radius: 12 };
  const state = {
    simTime: 1000,
    world: { currentSectorId: 'sector_test' },
    entities: new Map([['rock1', rock]]),
  };
  const site = {
    id: 'site_a',
    sectorId: 'sector_test',
    asteroidId: 'rock1',
    fleet: { launches: 3, inFlight: [] },
  };
  return { sites, state, site, spawned };
}

test('the courier body lasts until the matching pod arrives', () => {
  const { sites, state, site, spawned } = harness();
  const arriveT = state.simTime + 80;
  const worldRecordId = 'site:site_a:pod:3';
  site.fleet.inFlight.push({ worldRecordId, arriveT, cargo: { ore: 4 } });

  sites._spawnCourierVisual(site, state, worldRecordId);

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].type, 'drone');
  assert.equal(spawned[0].data.kind, 'site_courier');
  assert.equal(spawned[0].data.worldRecordId, worldRecordId);
  assert.equal(spawned[0].data.despawnAt, arriveT);
  assert.ok(arriveT > state.simTime + 15);
  assert.equal(spawned[0].drag, 0);
  assert.equal(spawned[0].collides, false);
  assert.equal(spawned[0].maxSpeed, 90);
});

test('a pod with no finite arrival keeps the short picture', () => {
  const { sites, state, site, spawned } = harness();
  site.fleet.inFlight.push({ worldRecordId: 'site:site_a:pod:9', arriveT: NaN });

  sites._spawnCourierVisual(site, state, 'site:site_a:pod:missing');

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].data.kind, 'site_courier');
  assert.equal(spawned[0].data.despawnAt, state.simTime + 14);
});
