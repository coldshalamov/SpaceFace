import test from 'node:test';
import assert from 'node:assert/strict';

import { world } from '../src/systems/world.js';
import {
  explorationDiscoveryPlates,
  sectorExplorationProgress,
} from '../src/world/explorationJournal.js';

function harness() {
  const events = [];
  const state = {
    simTime: 20,
    entities: new Map(),
    world: {
      currentSectorId: 'sector_veil_nebula',
      sectors: {},
      discovery: {},
      activeSector: { id: 'sector_veil_nebula', pois: [] },
    },
  };
  world.state = state;
  world.bus = { emit: (name, payload) => events.push({ name, payload }) };
  return { state, events };
}

test('a triangulated fix does not count as a physical discovery', () => {
  const t = harness();
  world._onAnomalyTriangulated({
    sectorId: 'sector_veil_nebula',
    poiId: 'poi_anomaly',
    sampleCount: 3,
    completedAt: 20,
  });

  assert.deepEqual(sectorExplorationProgress(t.state, 'sector_veil_nebula'), {
    sectorId: 'sector_veil_nebula',
    found: 0,
    total: 3,
    remaining: 3,
    value: 0,
    percent: 0,
  });
  assert.deepEqual(explorationDiscoveryPlates(t.state), []);
});

test('flying down an anomaly source unlocks one durable find-story and sector progress', () => {
  const t = harness();
  world._onAnomalyTriangulated({
    sectorId: 'sector_veil_nebula',
    poiId: 'poi_anomaly',
    sampleCount: 3,
    completedAt: 20,
  });
  t.state.simTime = 26;
  assert.equal(world._onSignalInvestigated({
    sectorId: 'sector_veil_nebula',
    sourceKind: 'anomaly',
    sourceId: 'poi_anomaly',
    completedAt: 26,
  }), true);

  const progress = sectorExplorationProgress(t.state, 'sector_veil_nebula');
  assert.equal(progress.found, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.percent, 33);

  const plates = explorationDiscoveryPlates(t.state);
  assert.equal(plates.length, 1);
  assert.equal(plates[0].title, 'Anomaly Signal');
  assert.match(plates[0].body, /Veil Nebula/);
  assert.match(plates[0].body, /3 distinct bearings/);
  assert.match(plates[0].body, /nebula and radiation interference/);
  assert.match(plates[0].note, /1\/3 authored sites found · 33% sector exploration/);
  assert.equal(t.events.filter((event) => event.name === 'discovery:plateUnlocked').length, 1);

  const restored = {
    ...t.state,
    world: {
      ...t.state.world,
      discovery: JSON.parse(JSON.stringify(t.state.world.discovery)),
    },
  };
  assert.deepEqual(explorationDiscoveryPlates(restored), plates);

  world._onSignalInvestigated({
    sectorId: 'sector_veil_nebula',
    sourceKind: 'anomaly',
    sourceId: 'poi_anomaly',
    completedAt: 30,
  });
  assert.equal(t.events.filter((event) => event.name === 'discovery:plateUnlocked').length, 1,
    'duplicate receipts do not unlock duplicate plates');
});
