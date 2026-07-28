import assert from 'node:assert/strict';
import test from 'node:test';

import { SpatialHash } from '../src/core/spatialHash.js';
import { createNearestEntityQueryService } from '../src/core/spatialQuery.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';

function entity(id, x, z, {
  type = 'ship',
  team = 2,
  alive = true,
  collides = true,
  radius = 4,
} = {}) {
  return {
    id,
    type,
    team,
    alive,
    collides,
    radius,
    pos: { x, y: 0, z },
    rot: 0,
    data: {},
  };
}

function stateFor(entities, hashEntities = entities) {
  const spatialHash = new SpatialHash(64);
  spatialHash.rebuildLayers(
    [],
    hashEntities.filter((value) => value && value.alive && value.collides),
    1,
  );
  return {
    mode: 'flight',
    simTime: 0,
    world: { currentSectorId: 'test-sector' },
    entityList: entities,
    entities: new Map(entities.map((value) => [value.id, value])),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: entities.filter((value) => value.type === 'ship'),
    },
    spatialHash,
    npcJobs: { byId: {} },
  };
}

function createHostileService(state) {
  return createNearestEntityQueryService(state, {
    entityType: 'ship',
    team: 1,
    fallbackIndex: 'ships',
  });
}

test('nearest hostile batch preserves strict radius, live identity, and stable-id ties', () => {
  const owner = entity(100, 0, 0);
  const highTie = entity(9, 5, 0, { team: 1 });
  const lowTie = entity(3, -5, 0, { team: 1 });
  const stale = entity(1, 1, 0, { team: 1 });
  const wrongType = entity(2, 0.5, 0, { type: 'asteroid', team: 1 });
  const boundary = entity(7, 110, 0, { team: 1 });
  const state = stateFor([owner, highTie, lowTie, stale, wrongType, boundary]);
  state.entities.delete(stale.id);
  stale.alive = false;

  const service = createHostileService(state);
  service.begin();
  const nearest = service.request('near', owner.id, 0, 0, 6);
  const strictBoundary = service.request('boundary', owner.id, 100, 0, 10);
  service.execute();

  assert.equal(nearest.resultId, lowTie.id, 'equal distances use the lower stable entity id');
  assert.equal(strictBoundary.resultId, null, 'an entity exactly on the radius is excluded');
  assert.equal(service.getDiagnostics().spatialBatches, 1);
  assert.equal(service.getDiagnostics().queryRequests, 2);
});

test('nearest hostile service covers unindexed hulls, same-tick spawns, and inactive-hash fallback', () => {
  const owner = entity(100, 0, 0);
  const unindexed = entity(7, 4, 0, { team: 1, collides: false });
  const state = stateFor([owner, unindexed]);
  const service = createHostileService(state);

  service.begin();
  const exceptional = service.request('exceptional', owner.id, 0, 0, 20);
  service.execute();
  assert.equal(exceptional.resultId, unindexed.id, 'non-colliding hostiles supplement the collider hash');

  state.entities.delete(unindexed.id);
  unindexed.alive = false;
  service.recordDestroy({ id: unindexed.id });
  const spawned = entity(5, 3, 0, { team: 1 });
  state.entityList.push(spawned);
  state.entities.set(spawned.id, spawned);
  state.entityIndex.ships.push(spawned);
  service.recordSpawn({ id: spawned.id, entity: spawned });

  service.begin();
  const sameTick = service.request('same-tick', owner.id, 0, 0, 20);
  service.execute();
  assert.equal(sameTick.resultId, spawned.id, 'spawn ids bridge the pre-NPC-jobs hash publication gap');

  state.spatialHash.deactivate();
  service.begin();
  const fallback = service.request('fallback', owner.id, 0, 0, 20);
  service.execute();
  assert.equal(fallback.resultId, spawned.id, 'inactive hashes use the indexed ship domain');
  assert.equal(service.getDiagnostics().fallbackBatches, 1);
});

test('nearest hostile requests and SpatialHash batch scratch reuse their high-water storage', () => {
  const owner = entity(100, 0, 0);
  const near = entity(1, 10, 0, { team: 1 });
  const remote = [];
  for (let index = 0; index < 400; index++) {
    remote.push(entity(1000 + index, 10000 + index * 100, 10000, { team: 1 }));
  }
  const state = stateFor([owner, near, ...remote]);
  const service = createHostileService(state);

  service.begin();
  const first = service.request('density', owner.id, 0, 0, 32);
  service.execute();
  const firstOut = first.out;
  const firstSeen = first.seenIds;
  const firstFootprint = state.spatialHash._batchFootprints[0];
  const firstMeta = state.spatialHash._batchMetas[0];

  service.begin();
  const second = service.request('density', owner.id, 0, 0, 32);
  service.execute();

  assert.equal(second, first, 'request records reuse the service high-water pool');
  assert.equal(second.out, firstOut, 'candidate arrays are retained');
  assert.equal(second.seenIds, firstSeen, 'dedupe storage is retained');
  assert.equal(state.spatialHash._batchFootprints[0], firstFootprint, 'footprint scratch is retained');
  assert.equal(state.spatialHash._batchMetas[0], firstMeta, 'batch metadata scratch is retained');
  assert.equal(second.resultId, near.id);
  assert.ok(
    service.getDiagnostics().lastBatchCandidates <= 4,
    'candidate work follows nearby density rather than 400 remote hostiles',
  );
  assert.equal(service.getDiagnostics().queryScratchGrowth, 1);
});

test('npcJobsRuntime issues one hostile-query batch for all eligible materialized jobs', () => {
  const firstOwner = entity(100, 0, 0);
  const secondOwner = entity(101, 20, 0);
  const hostile = entity(1, 10, 0, { team: 1 });
  // The hash represents the earlier physics publication; the hostile is a later same-tick spawn.
  const state = stateFor([firstOwner, secondOwner, hostile], [firstOwner, secondOwner]);
  state.npcJobs.byId = {
    'job:first': {
      job: { phase: NPC_JOB_PHASE.TRANSIT, corrupt: false },
      entityId: firstOwner.id,
      lastAdvanceSimT: 0,
      threatId: null,
    },
    'job:second': {
      job: { phase: NPC_JOB_PHASE.TRANSIT, corrupt: false },
      entityId: secondOwner.id,
      lastAdvanceSimT: 0,
      threatId: null,
    },
  };

  let batchCalls = 0;
  let batchRequests = 0;
  const queryRadiusBatch = state.spatialHash.queryRadiusBatch.bind(state.spatialHash);
  state.spatialHash.queryRadiusBatch = (requests, options) => {
    batchCalls++;
    batchRequests = requests.length;
    return queryRadiusBatch(requests, options);
  };

  const runtime = Object.create(npcJobsRuntime);
  runtime.state = state;
  runtime._sink = () => {};
  runtime._drive = () => {};
  runtime._threatQueries = createHostileService(state);
  runtime._threatQueries.recordSpawn({ id: hostile.id, entity: hostile });

  runtime.update(0, state);

  assert.equal(batchCalls, 1);
  assert.equal(batchRequests, 2);
  assert.equal(state.npcJobs.byId['job:first'].job.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(state.npcJobs.byId['job:second'].job.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(state.npcJobs.byId['job:first'].threatId, hostile.id);
  assert.equal(state.npcJobs.byId['job:second'].threatId, hostile.id);
});
