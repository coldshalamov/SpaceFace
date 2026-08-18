import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  render,
  serviceRenderMeshResidency,
} from '../src/render/renderer.js';

function entity(id, {
  type = 'asteroid',
  sectorId = 'sector_neighbor',
  x = 0,
  z = 0,
} = {}) {
  return {
    id,
    type,
    alive: true,
    pos: { x, z },
    prevPos: { x, z },
    radius: 8,
    rot: 0,
    homeSectorId: sectorId,
    data: { homeSectorId: sectorId },
  };
}

function mesh(name) {
  const root = new THREE.Group();
  root.name = name;
  return root;
}

test('ordinary residency poll keeps exact runway semantics in two retained collection passes', () => {
  const player = entity(1, { type: 'ship', sectorId: 'sector_current' });
  player.isPlayer = true;
  const currentFar = entity(2, { sectorId: 'sector_current', x: 9000 });
  const nearShip = entity(3, { type: 'ship', x: 5100 });
  const nearWorld = entity(4, { x: 5000 });
  const outsideAdmission = entity(5, { x: 5300 });
  const retainedHysteresis = entity(6, { x: 6300 });
  const evictedBeyondHysteresis = entity(7, { x: 6500 });
  const authoredNear = entity(8, { x: 100 });
  const entities = [
    player,
    currentFar,
    nearShip,
    nearWorld,
    outsideAdmission,
    retainedHysteresis,
    evictedBeyondHysteresis,
    authoredNear,
  ];
  const byId = new Map(entities.map((value) => [value.id, value]));
  const roots = new Map([
    [1, mesh('player')],
    [6, mesh('retained-hysteresis')],
    [7, mesh('evicted-beyond-hysteresis')],
    [8, mesh('authored-near')],
    [999, mesh('orphan')],
  ]);
  let authoredRequests = 0;
  roots.get(8).userData.requestAuthoredUpgrade = () => { authoredRequests++; };
  const removed = [];
  const unbound = [];
  let published = 0;
  let drainBudget = null;
  const context = {
    state: {
      mode: 'flight',
      playerId: 1,
      player: { targetId: null },
      entities: byId,
      entityList: entities,
      world: { currentSectorId: 'sector_current' },
    },
    renderer: {},
    scene: { remove: (root) => removed.push(root.name) },
    _meshes: roots,
    _asteroidInstancePool: null,
    _authoredSectorPrewarmPendingId: null,
    _meshBuildQueue: [],
    _meshBuildQueueHead: 0,
    _meshBuildQueuedIds: new Set(),
    _meshResidencyShipCandidates: [],
    _meshResidencyOtherCandidates: [],
    _meshResidencySweep: {
      meshVisits: 0,
      entityVisits: 0,
      queuedShips: 0,
      queuedOther: 0,
      evicted: 0,
      built: 0,
    },
    _shadowReceiversDirty: false,
    _unbindPresentationMesh: (id) => unbound.push(id),
    _drainMeshBuildQueue: (budget) => { drainBudget = budget; return 0; },
    _publishAssetResidencyDiagnostics: () => { published++; },
  };

  const result = render.reconcileMeshResidency.call(context);

  assert.deepEqual(removed.sort(), ['evicted-beyond-hysteresis', 'orphan']);
  assert.deepEqual(unbound.sort((a, b) => a - b), [7, 999]);
  assert.equal(roots.has(6), true, 'existing neighbour mesh keeps the 6,400-unit eviction runway');
  assert.equal(roots.has(7), false, 'existing neighbour mesh evicts beyond the same hysteresis');
  assert.equal(roots.has(999), false, 'ownership pass keeps missed destroy-event self healing');
  assert.equal(authoredRequests, 1, 'near authored boundary keeps the existing prefetch request');
  assert.deepEqual(
    context._meshBuildQueue,
    [3, 2, 4],
    'ship-first order is retained, current-sector content stays relevant, and 5,200-unit admission is exact',
  );
  assert.equal(context._meshBuildQueue.includes(5), false);
  assert.equal(drainBudget, 2, 'runtime admission still builds at most two boundaries per frame');
  assert.equal(result.meshVisits, 5);
  assert.equal(result.entityVisits, entities.length);
  assert.equal(result.queuedShips, 1);
  assert.equal(result.queuedOther, 2);
  assert.equal(result.evicted, 2);
  assert.equal(published, 1);
  assert.deepEqual(context._meshResidencyShipCandidates, []);
  assert.deepEqual(context._meshResidencyOtherCandidates, []);
});

test('residency service runs full recovery once, then drains without repeating scans', () => {
  const calls = [];
  const owner = {
    _deferNoncriticalMeshStreaming: false,
    _renderResidencyPollS: 0,
    _meshReconcileDirty: true,
    _meshBuildQueue: [11, 12, 13],
    _meshBuildQueueHead: 0,
    reconcileMeshes() {
      calls.push('full');
      this._meshReconcileDirty = false;
      this._meshBuildQueueHead = 1;
    },
    reconcileMeshResidency() { calls.push('poll'); },
    _drainPendingMeshBuilds() {
      calls.push('drain');
      this._meshBuildQueueHead++;
    },
  };

  assert.equal(serviceRenderMeshResidency(owner, 1 / 60), 'full');
  assert.deepEqual(calls, ['full']);
  assert.equal(owner._renderResidencyPollS, 0.25);
  assert.equal(serviceRenderMeshResidency(owner, 1 / 60), 'drain');
  assert.deepEqual(calls, ['full', 'drain']);
  assert.equal(serviceRenderMeshResidency(owner, 1 / 60), 'drain');
  assert.deepEqual(calls, ['full', 'drain', 'drain']);

  owner._renderResidencyPollS = 0;
  assert.equal(serviceRenderMeshResidency(owner, 1 / 60), 'poll');
  assert.deepEqual(calls, ['full', 'drain', 'drain', 'poll']);
});

test('continuous sector handoff defers the seam recovery scan through the visual blend', () => {
  const calls = [];
  const owner = {
    _deferNoncriticalMeshStreaming: false,
    _renderResidencyPollS: 0,
    _meshReconcileDirty: true,
    _sectorHandoffStreamHoldS: 1.5,
    _sectorHandoffSectorId: 'sector_ceres_belt',
    _authoredSectorPrewarmPendingId: 'sector_ceres_belt',
    _authoredSectorPrewarmPending: { active: true },
    _meshBuildQueue: [],
    _meshBuildQueueHead: 0,
    reconcileMeshes() { calls.push('full'); },
    reconcileMeshResidency() { calls.push('poll'); },
    _drainPendingMeshBuilds() { calls.push('drain'); },
  };

  assert.equal(serviceRenderMeshResidency(owner, 0.75), 'deferred');
  assert.equal(owner._meshReconcileDirty, true);
  assert.deepEqual(calls, []);

  assert.equal(serviceRenderMeshResidency(owner, 0.75), 'deferred');
  assert.equal(owner._meshReconcileDirty, false);
  assert.equal(owner._sectorHandoffSectorId, null);
  assert.equal(owner._authoredSectorPrewarmPendingId, null);
  assert.equal(owner._authoredSectorPrewarmPending, null);
  assert.deepEqual(calls, []);

  assert.equal(serviceRenderMeshResidency(owner, 1 / 60), 'poll');
  assert.deepEqual(calls, ['poll']);
});

test('stable 400-entity poll halves collection visits and removes all redundant rebinds', () => {
  const player = entity(1, { type: 'ship', sectorId: 'sector_current' });
  player.isPlayer = true;
  const entities = [player];
  const roots = new Map();
  for (let id = 1; id <= 400; id++) {
    const value = id === 1
      ? player
      : entity(id, { sectorId: 'sector_current', x: id * 2 });
    if (id !== 1) entities.push(value);
    roots.set(id, mesh(`root-${id}`));
  }
  const context = {
    state: {
      mode: 'flight',
      playerId: 1,
      player: { targetId: null },
      entities: new Map(entities.map((value) => [value.id, value])),
      entityList: entities,
      world: { currentSectorId: 'sector_current' },
    },
    renderer: {},
    scene: { remove() {} },
    _meshes: roots,
    _asteroidInstancePool: null,
    _authoredSectorPrewarmPendingId: 'sector_current',
    _meshBuildQueue: [],
    _meshBuildQueueHead: 0,
    _meshBuildQueuedIds: new Set(),
    _meshResidencyShipCandidates: [],
    _meshResidencyOtherCandidates: [],
    _meshResidencySweep: {
      meshVisits: 0,
      entityVisits: 0,
      queuedShips: 0,
      queuedOther: 0,
      evicted: 0,
      built: 0,
    },
    _shadowReceiversDirty: false,
    _unbindPresentationMesh() { throw new Error('stable roots must not unbind'); },
    _drainMeshBuildQueue: () => 0,
    _publishAssetResidencyDiagnostics() {},
  };

  const result = render.reconcileMeshResidency.call(context);
  const priorCollectionVisits = roots.size * 2 + entities.length * 2;
  const currentCollectionVisits = result.meshVisits + result.entityVisits;
  assert.equal(priorCollectionVisits, 1600);
  assert.equal(currentCollectionVisits, 800);
  assert.equal(currentCollectionVisits / priorCollectionVisits, 0.5);
  assert.equal(context._meshBuildQueue.length, 0);
});
