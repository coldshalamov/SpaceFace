import test from 'node:test';
import assert from 'node:assert/strict';

import { world } from '../src/systems/world.js';
import {
  explorationDiscoveryPlates,
  sectorExplorationProgress,
} from '../src/world/explorationJournal.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';

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
  assert.equal(plates[0].title, 'The Resonance Obelisk');
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

test('defeating Iron Maw records a durable exploration trophy', () => {
  const t = harness();
  t.state.simTime = 90;
  t.state.world.currentSectorId = 'sector_ashfall_reach';
  t.state.world.activeSector = {
    id: 'sector_ashfall_reach',
    pois: [{ id: 100, poiId: 'poi_vault', type: 'cache', hidden: true }],
    boss: { entityId: 99, poiId: 'poi_boss' },
  };
  t.state.entities.set(99, {
    id: 99,
    type: 'ship',
    alive: false,
    pos: { x: 240, z: 1180 },
    data: {
      isBoss: true,
      bossSectorId: 'sector_ashfall_reach',
      bossPoiId: 'poi_boss',
    },
  });
  t.state.entities.set(100, {
    id: 100,
    type: 'fx',
    alive: true,
    pos: { x: -1480, z: 320 },
    data: { poi: true, poiId: 'poi_vault', hidden: true, name: 'Ancient Vault' },
  });

  assert.equal(
    buildSystemModel(t.state, 'sector_ashfall_reach').points.some((point) => point.id === 'poi_vault'),
    false,
    'the hidden vault is not a navigable map point before the boss falls',
  );

  world._onBossKilled({ id: 99, killerId: 1 });

  const record = t.state.world.discovery.sector_ashfall_reach.pois.poi_boss;
  assert.equal(record.bossDefeated, true);
  assert.equal(record.defeated, true);
  assert.equal(record.defeatedAt, 90);
  assert.equal(t.state.world.activeSector.boss, undefined);
  const vault = t.state.world.discovery.sector_ashfall_reach.pois.poi_vault;
  assert.equal(vault.discovered, true);
  assert.equal(vault.identified, false, 'coordinates reveal the destination without claiming the visit');
  assert.equal(vault.revealedByBossDefeat, true);
  assert.equal(vault.revealedAt, 90);
  assert.equal(t.state.world.activeSector.pois[0].hidden, false);
  assert.equal(t.state.entities.get(100).data.hidden, false);
  const vaultPoint = buildSystemModel(t.state, 'sector_ashfall_reach').points
    .find((point) => point.id === 'poi_vault');
  assert.ok(vaultPoint, 'the recovered coordinates become a navigable system-map point');
  assert.deepEqual(vaultPoint.drawPos, { x: -1480, z: 320 });
  assert.equal(
    t.events.filter((event) => event.name === 'poi:discovered' && event.payload.poiId === 'poi_vault').length,
    1,
  );
  assert.equal(
    t.events.filter((event) => event.name === 'toast' && /Ancient Vault coordinates recovered/.test(event.payload.text)).length,
    1,
  );

  const progress = sectorExplorationProgress(t.state, 'sector_ashfall_reach');
  assert.equal(progress.found, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.percent, 33);

  const plate = explorationDiscoveryPlates(t.state)
    .find((entry) => entry.poiId === 'poi_boss');
  assert.ok(plate);
  assert.equal(plate.title, 'Iron Maw Defeated');
  assert.match(plate.meta, /SITE RESOLVED/);
  assert.match(plate.body, /Vael-grown Deep-Mother/);
  assert.match(plate.note, /1\/3 authored sites found · 33% sector exploration/);
  assert.equal(t.events.filter((event) => event.name === 'discovery:plateUnlocked').length, 1);

  const restored = {
    ...t.state,
    world: {
      ...t.state.world,
      discovery: JSON.parse(JSON.stringify(t.state.world.discovery)),
    },
  };
  assert.deepEqual(
    explorationDiscoveryPlates(restored).find((entry) => entry.poiId === 'poi_boss'),
    plate,
  );

  t.state.simTime = 120;
  world._onBossKilled({ id: 99, killerId: 1 });
  assert.equal(record.defeatedAt, 90, 'the first defeat remains the durable completion time');
  assert.equal(t.events.filter((event) => event.name === 'discovery:plateUnlocked').length, 1,
    'duplicate kill receipts do not unlock duplicate plates');
  assert.equal(
    t.events.filter((event) => event.name === 'poi:discovered' && event.payload.poiId === 'poi_vault').length,
    1,
    'duplicate kill receipts do not repeat the coordinate reveal',
  );
});

test('a recovered hidden POI rematerializes as a visible destination', () => {
  const t = harness();
  t.state.world.currentSectorId = 'sector_ashfall_reach';
  const active = { id: 'sector_ashfall_reach', pois: [] };
  t.state.world.activeSector = active;
  const discovery = {
    pois: {
      poi_vault: { discovered: true, identified: false, revealedByBossDefeat: true },
    },
  };
  let nextId = 200;
  world.helpers = {
    spawnEntity(definition) {
      const entity = { id: nextId++, alive: true, ...definition };
      t.state.entities.set(entity.id, entity);
      return entity;
    },
  };

  world._spawnPOIs({
    id: 'sector_ashfall_reach',
    worldRadius: 5500,
    pois: [{ id: 'poi_vault', type: 'cache', name: 'Ancient Vault', hidden: true, pos: { x: -1480, z: 320 } }],
  }, active, discovery, () => 0.5);

  assert.equal(active.pois.length, 1);
  assert.equal(active.pois[0].hidden, false);
  assert.equal(t.state.entities.get(active.pois[0].id).data.hidden, false);
});
