import assert from 'node:assert/strict';
import test from 'node:test';

import { SpatialHash } from '../src/core/spatialHash.js';
import {
  createNearestEntityQueryService,
  findNearestEntityIdFullScan,
} from '../src/core/spatialQuery.js';
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

function createHostileService(state, options = {}) {
  return createNearestEntityQueryService(state, {
    entityType: 'ship',
    team: 1,
    fallbackIndex: 'ships',
    ...options,
  });
}

function activeHostile(entity) {
  const ai = entity && entity.data && entity.data.ai;
  return !(ai && (ai.passive === true || ai.roe === 'hold_fire'));
}

test('eligibility is identical across spatial, fallback, spawn, shadow, and stable ties', () => {
  const owner = entity(100, 0, 0);
  const passiveNear = entity(1, 2, 0, { team: 1 });
  passiveNear.data.ai = { passive: true, roe: 'hold_fire' };
  const holdFireNear = entity(2, 3, 0, { team: 1 });
  holdFireNear.data.ai = { passive: false, roe: 'hold_fire' };
  const highTie = entity(9, 8, 0, { team: 1 });
  highTie.data.ai = { passive: false, roe: 'weapons_free' };
  const lowTie = entity(3, -8, 0, { team: 1 });
  lowTie.data.ai = { passive: false, roe: 'weapons_free' };
  const state = stateFor([owner, passiveNear, holdFireNear, highTie, lowTie]);
  const service = createHostileService(state, { eligible: activeHostile, shadow: true });

  service.begin();
  const spatial = service.request('spatial', owner.id, 0, 0, 20);
  service.execute();
  assert.equal(spatial.resultId, lowTie.id,
    'ineligible nearer hulls do not hide the lower-id active hostile in a stable tie');
  assert.equal(findNearestEntityIdFullScan(state, spatial, {
    entityType: 'ship', team: 1, eligible: activeHostile,
  }), lowTie.id, 'the shadow oracle applies the same eligibility predicate');

  state.spatialHash.deactivate();
  service.begin();
  const fallback = service.request('fallback', owner.id, 0, 0, 20);
  service.execute();
  assert.equal(fallback.resultId, lowTie.id, 'inactive-hash fallback applies eligibility identically');

  state.spatialHash.rebuildLayers([], [owner], 2);
  const spawnedPassive = entity(4, 1, 0, { team: 1 });
  spawnedPassive.data.ai = { passive: true, roe: 'hold_fire' };
  const spawnedActive = entity(5, 4, 0, { team: 1 });
  spawnedActive.data.ai = { passive: false, roe: 'weapons_free' };
  for (const candidate of [spawnedPassive, spawnedActive]) {
    state.entityList.push(candidate);
    state.entities.set(candidate.id, candidate);
    service.recordSpawn({ id: candidate.id, entity: candidate });
  }
  service.begin();
  const spawned = service.request('spawned', owner.id, 0, 0, 20);
  service.execute();
  assert.equal(spawned.resultId, spawnedActive.id,
    'same-tick spawn supplements reject passive hulls and retain the active one');
  assert.equal(service.getDiagnostics().shadowMismatches, 0);

  state.spatialHash.rebuildLayers([], state.entityList.filter((value) => value.collides), 3);
  const unfiltered = createHostileService(state);
  unfiltered.begin();
  const legacy = unfiltered.request('legacy-default', owner.id, 0, 0, 20);
  unfiltered.execute();
  assert.equal(legacy.resultId, spawnedPassive.id,
    'omitting eligibility preserves the prior nearest-team-member behavior');

  const diagnosticsState = stateFor([owner, passiveNear, holdFireNear, highTie, lowTie]);
  const diagnosticsFiltered = createHostileService(diagnosticsState, { eligible: activeHostile, shadow: true });
  diagnosticsFiltered.begin();
  diagnosticsFiltered.request('diagnostics-filtered', owner.id, 0, 0, 20);
  diagnosticsFiltered.execute();
  const diagnosticsDefault = createHostileService(diagnosticsState, { shadow: true });
  diagnosticsDefault.begin();
  diagnosticsDefault.request('diagnostics-default', owner.id, 0, 0, 20);
  diagnosticsDefault.execute();
  assert.deepEqual(diagnosticsFiltered.getDiagnostics(), diagnosticsDefault.getDiagnostics(),
    'eligibility changes selection, not default candidate-visit diagnostics or scratch shape');
});

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

test('batched hostile results match the full-scan oracle in stable request order across churn', () => {
  const firstOwner = entity(100, 0, 0);
  const secondOwner = entity(101, 100, 0);
  const highTie = entity(9, 5, 0, { team: 1 });
  const lowTie = entity(3, -5, 0, { team: 1 });
  const wrongTeam = entity(4, 1, 0, { team: 2 });
  const wrongType = entity(5, 2, 0, { type: 'asteroid', team: 1 });
  const exactBoundary = entity(7, 120, 0, { team: 1 });
  const stale = entity(8, 1, 0, { team: 1 });
  const state = stateFor([
    firstOwner,
    secondOwner,
    highTie,
    lowTie,
    wrongTeam,
    wrongType,
    exactBoundary,
    stale,
  ]);
  state.entities.delete(stale.id);
  stale.alive = false;

  const service = createHostileService(state, { shadow: true });
  service.begin();
  const first = service.request('job:zeta', firstOwner.id, 0, 0, 6);
  const second = service.request('job:alpha', secondOwner.id, 100, 0, 20);
  assert.deepEqual(
    service.getRequests().map((request) => request.requestId),
    ['job:zeta', 'job:alpha'],
    'batch output order follows stable owner request order rather than spatial bucket order',
  );
  service.execute();

  assert.equal(first.resultId, findNearestEntityIdFullScan(state, first, {
    entityType: 'ship',
    team: 1,
  }));
  assert.equal(first.resultId, lowTie.id, 'equal-distance ties select the lower stable id');
  assert.equal(second.resultId, null, 'empty and exact-radius cases remain empty');

  lowTie.alive = false;
  state.entities.delete(lowTie.id);
  service.recordDestroy({ id: lowTie.id });
  const spawned = entity(2, 2, 0, { team: 1 });
  state.entityList.push(spawned);
  state.entities.set(spawned.id, spawned);
  state.entityIndex.ships.push(spawned);
  service.recordSpawn({ id: spawned.id, entity: spawned });

  service.begin();
  const churned = service.request('job:zeta', firstOwner.id, 0, 0, 6);
  service.execute();
  assert.equal(churned.resultId, findNearestEntityIdFullScan(state, churned, {
    entityType: 'ship',
    team: 1,
  }));
  assert.equal(churned.resultId, spawned.id, 'same-tick spawn replaces a destroyed tie candidate');
  assert.deepEqual(
    {
      checks: service.getDiagnostics().shadowChecks,
      mismatches: service.getDiagnostics().shadowMismatches,
    },
    { checks: 3, mismatches: 0 },
    'the full-scan shadow oracle observes every accepted request without a mismatch',
  );
});

test('hostile-query candidate curve is flat when total population grows from 1x to 5x remotely', () => {
  function sample(totalPopulation) {
    const owner = entity(100, 0, 0);
    const localHostile = entity(1, 10, 0, { team: 1 });
    const remote = [];
    for (let index = 0; index < totalPopulation - 2; index++) {
      remote.push(entity(1000 + index, 10000 + index * 128, 10000, { team: 1 }));
    }
    const state = stateFor([owner, localHostile, ...remote]);
    const service = createHostileService(state, { shadow: true });
    service.begin();
    const request = service.request('job:scale', owner.id, 0, 0, 32);
    service.execute();
    const diagnostics = service.getDiagnostics();
    return {
      population: state.entityList.length,
      resultId: request.resultId,
      requests: diagnostics.lastBatchRequests,
      candidates: diagnostics.lastBatchCandidates,
      scratchGrowth: diagnostics.queryScratchGrowth,
      shadowMismatches: diagnostics.shadowMismatches,
    };
  }

  const current = sample(100);
  const fiveTimes = sample(500);
  assert.equal(fiveTimes.population, current.population * 5);
  assert.equal(fiveTimes.resultId, current.resultId);
  assert.deepEqual(
    { current: current.candidates, fiveTimes: fiveTimes.candidates },
    { current: 1, fiveTimes: 1 },
    'remote population does not increase the one nearby broadphase candidate visit',
  );
  assert.deepEqual(
    { requests: fiveTimes.requests, scratchGrowth: fiveTimes.scratchGrowth },
    { requests: 1, scratchGrowth: 1 },
  );
  assert.equal(current.shadowMismatches + fiveTimes.shadowMismatches, 0);
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

test('npcJobsRuntime batches eligible hostile queries and excludes controlled hulls', () => {
  const firstOwner = entity(100, 0, 0);
  const secondOwner = entity(101, 20, 0);
  const controlledOwner = entity(102, 40, 0);
  const hostile = entity(1, 10, 0, { team: 1 });
  // The hash represents the earlier physics publication; the hostile is a later same-tick spawn.
  const state = stateFor(
    [firstOwner, secondOwner, controlledOwner, hostile],
    [firstOwner, secondOwner, controlledOwner],
  );
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
    'job:controlled': {
      job: { phase: NPC_JOB_PHASE.TRANSIT, corrupt: false },
      entityId: controlledOwner.id,
      lastAdvanceSimT: 0,
      threatId: null,
      control: { claimId: 'heist:test' },
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
  assert.equal(state.npcJobs.byId['job:controlled'].job.phase, NPC_JOB_PHASE.TRANSIT);
  assert.equal(state.npcJobs.byId['job:controlled'].threatId, null);

  const ownerFacts = runtime.threatQueryDiagnostics();
  assert.equal(ownerFacts.schema, 'spaceface.npcJobsThreatQueryDiagnostics.v1');
  assert.equal(ownerFacts.available, true);
  assert.equal(ownerFacts.queryBatches, 1);
  assert.equal(ownerFacts.queryRequests, 2);
  assert.equal(ownerFacts.queryResults, 2);
  assert.equal(ownerFacts.lastBatchRequests, 2);
  ownerFacts.queryBatches = 999;
  assert.equal(runtime.threatQueryDiagnostics().queryBatches, 1,
    'the owner publishes a detached snapshot rather than mutable retained counters');
});

test('npcJobsRuntime ignores nearer passive and hold-fire team-1 hulls for flee', () => {
  const owner = entity(100, 0, 0);
  const passiveNear = entity(1, 2, 0, { team: 1 });
  passiveNear.data.ai = { passive: true, roe: 'hold_fire' };
  const holdFireNear = entity(2, 3, 0, { team: 1 });
  holdFireNear.data.ai = { passive: false, roe: 'hold_fire' };
  const activeFar = entity(5, 5, 0, { team: 1 });
  activeFar.data.ai = { passive: false, roe: 'weapons_free' };
  const state = stateFor([owner, passiveNear, holdFireNear, activeFar]);
  state.npcJobs.byId = {
    'job:owner': {
      job: { phase: NPC_JOB_PHASE.TRANSIT, corrupt: false },
      entityId: owner.id,
      lastAdvanceSimT: 0,
      threatId: null,
    },
  };
  const bus = { on() {}, emit() {} };
  const runtime = Object.create(npcJobsRuntime);
  runtime.init({ state, bus, helpers: {}, registry: {} });
  runtime._sink = () => {};
  runtime._drive = () => {};

  runtime.update(0, state);

  assert.equal(state.npcJobs.byId['job:owner'].job.phase, NPC_JOB_PHASE.FLEE);
  assert.equal(state.npcJobs.byId['job:owner'].threatId, activeFar.id,
    'the farther active hostile remains visible behind nearer ineligible hulls');
});
