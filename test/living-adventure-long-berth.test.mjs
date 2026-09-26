import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { world } from '../src/systems/world.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';

function harness() {
  const entities = new Map();
  const entityList = [];
  let nextId = 1;
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextId++,
        alive: true,
        pos: { ...spec.pos },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
        physicsBody: spec.physicsBody && { ...spec.physicsBody },
      };
      entities.set(entity.id, entity);
      entityList.push(entity);
      return entity;
    },
  };
  system.state = {
    entities,
    entityList,
    tick: 30,
    simTime: 10,
    meta: { seed: 47 },
    world: {
      records: { byId: {} },
      residentSectors: {},
    },
  };
  return { system, entities, entityList };
}

test('The Long Berth is a live, rendered wreck body the existing Massline can attach to', () => {
  const { system, entities } = harness();
  const sector = SECTORS.find((row) => row.id === 'sector_ceres_belt');
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(sector, active);

  const tugRecord = WORLD_ONE_OFFS.find((row) => row.id === 'oneoff_abandoned_tug');
  const tug = [...entities.values()].find((entity) => entity.data.oneOffId === tugRecord.id);
  assert.ok(tug, 'the named tug is created through the live entity spawn path');
  assert.equal(tug.type, 'wreck');
  assert.equal(tug.collides, true);
  assert.equal(tug.physicsBody.radius, tugRecord.radius);
  assert.equal(tug.physicsBody.mass, tugRecord.physicalBody.mass);
  assert.equal(tug.data.masslineTetherable, true);
  assert.equal(isAttachable(tug, -1, system.state), true,
    'the existing tether eligibility accepts the tug without a new system');
  assert.ok(resolvePlaceFileForEntity(tug), 'the existing packaged dead-hulk place art resolves');
  assert.equal(active.dressing.find((row) => row.id === tug.id).placeId, tugRecord.placeId);

  assert.equal(active.dressing.length, 11, 'the six authored placements and cluster stay unchanged');
  assert.equal(entities.size, 1, 'only the tug joins the live entity population');
});

test('the tug keeps its durable identity and moved pose through sector rematerialization', () => {
  const { system, entities, entityList } = harness();
  const sector = SECTORS.find((row) => row.id === 'sector_ceres_belt');
  const firstActive = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(sector, firstActive);
  const tug = [...entities.values()].find((entity) => entity.data.oneOffId === 'oneoff_abandoned_tug');
  tug.pos = { x: 2400, z: -3100 };
  tug.vel = { x: 13, z: -7 };
  tug.rot = 3.4;
  tug.angVel = 0.14;
  const identity = tug.data.worldRecordId;

  system._captureSectorDurableRecords(sector.id, { reason: 'strip_full' });
  entities.delete(tug.id);
  entityList.splice(entityList.indexOf(tug), 1);
  const secondActive = { pois: [], stations: [], gates: [], dressing: [] };
  system._rematerializeSectorRecords(sector.id, secondActive, 'FULL', { restoreDurableRecords: true });
  system._spawnWorldOneOffs(sector, secondActive);

  const restored = [...entities.values()].find((entity) => entity.data.oneOffId === 'oneoff_abandoned_tug');
  assert.ok(restored, 'the durable record rematerializes the same authored object');
  assert.equal(restored.data.worldRecordId, identity);
  assert.deepEqual(restored.pos, { x: 2400, z: -3100 });
  assert.deepEqual(restored.vel, { x: 13, z: -7 });
  assert.equal(restored.rot, 3.4);
  assert.equal(restored.angVel, 0.14);
  assert.equal(restored.collides, true);
  assert.equal(restored.physicsBody.mass, 180);
  assert.ok(resolvePlaceFileForEntity(restored), 'the packaged tug art is restored with the body');
  assert.equal(secondActive.dressing.filter((row) => row.placeId === 'place_dead_hulk').length, 1,
    'the authored body is registered exactly once in active sector dressing');
});
