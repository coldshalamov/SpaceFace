import assert from 'node:assert/strict';
import test from 'node:test';

import * as rendererModule from '../src/render/renderer.js';
import { shouldAutoTriggerAuthoredUpgrade } from '../src/render/partsLibrary.js';

const enqueueMissingMeshBuilds = rendererModule.enqueueMissingMeshBuilds;
const isEntityRenderRelevant = rendererModule.isEntityRenderRelevant;
const isEntityAuthoredUpgradeRelevant = rendererModule.isEntityAuthoredUpgradeRelevant;

test('cold-start mesh queue admits all ships before bulk world geometry', () => {
  assert.equal(
    typeof enqueueMissingMeshBuilds,
    'function',
    'renderer must expose the queue-order seam used by reconcileMeshes',
  );

  const player = { id: 1, type: 'ship', alive: true };
  const asteroids = Array.from({ length: 280 }, (_, index) => ({
    id: index + 2,
    type: 'asteroid',
    alive: true,
  }));
  const wasp = { id: 282, type: 'ship', alive: true };
  const mule = { id: 283, type: 'ship', alive: true };
  const station = { id: 284, type: 'station', alive: true };
  const entityList = [player, ...asteroids, wasp, mule, station];

  const queue = [];
  const queuedIds = new Set();
  const meshes = new Map();
  enqueueMissingMeshBuilds(entityList, meshes, queuedIds, queue);

  assert.deepEqual(
    queue.slice(0, 3),
    [player.id, wasp.id, mule.id],
    'late-spawned NPC ships must not sit behind hundreds of asteroid/place meshes',
  );
  assert.equal(queue[3], asteroids[0].id, 'non-ship order stays deterministic after ships');
  assert.equal(queue.at(-1), station.id, 'all renderable non-ships remain queued at full quality');
  assert.equal(new Set(queue).size, entityList.length, 'each entity queues exactly once');

  // The live runtime budget is two builds per frame. Ship-first ordering guarantees every
  // cold-start ship is admitted within two frames without raising the budget or dropping visuals.
  assert.deepEqual(queue.slice(0, 2), [player.id, wasp.id]);
  assert.equal(queue[2], mule.id);
});

test('queue seam preserves existing mesh, no-mesh, and idempotency rules', () => {
  assert.equal(typeof enqueueMissingMeshBuilds, 'function');
  const alreadyBuilt = { id: 1, type: 'ship', alive: true };
  const alreadyQueued = { id: 2, type: 'ship', alive: true };
  const noMesh = { id: 3, type: 'ship', alive: true, _noMesh: true };
  const dead = { id: 4, type: 'ship', alive: false };
  const pending = { id: 5, type: 'ship', alive: true };
  const rock = { id: 6, type: 'asteroid', alive: true };
  const queue = [alreadyQueued.id];
  const queuedIds = new Set([alreadyQueued.id]);
  const meshes = new Map([[alreadyBuilt.id, {}]]);

  enqueueMissingMeshBuilds(
    [alreadyBuilt, alreadyQueued, noMesh, dead, pending, rock],
    meshes,
    queuedIds,
    queue,
  );

  // Dead entries remain queued exactly as before and are discarded by _drainMeshBuildQueue.
  assert.deepEqual(queue, [alreadyQueued.id, dead.id, pending.id, rock.id]);
});

test('render residency keeps the active sector and a seam runway without building distant sectors', () => {
  assert.equal(typeof isEntityRenderRelevant, 'function');
  const state = {
    playerId: 1,
    player: { targetId: 9 },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 160, z: 0 } }]]),
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const player = { id: 1, type: 'ship', pos: { x: 0, z: 0 } };
  const currentFar = {
    id: 2, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 9000, z: 0 },
  };
  const neighborNear = {
    id: 3, type: 'station', homeSectorId: 'sector_ceres_belt', pos: { x: 4900, z: 0 },
  };
  const neighborFar = {
    id: 4, type: 'station', homeSectorId: 'sector_ceres_belt', pos: { x: 14000, z: 0 },
  };
  const targetedFar = {
    id: 9, type: 'ship', homeSectorId: 'sector_ceres_belt', pos: { x: 14000, z: 0 },
  };

  assert.equal(isEntityRenderRelevant(player, state), true, 'player is always resident');
  assert.equal(isEntityRenderRelevant(currentFar, state), true, 'the active sector stays complete');
  assert.equal(isEntityRenderRelevant(neighborNear, state), true, 'nearby corridor content gets a streaming runway');
  assert.equal(isEntityRenderRelevant(neighborFar, state), false, 'a distant reduced sector does not own live meshes');
  assert.equal(isEntityRenderRelevant(targetedFar, state), true, 'an explicit target remains renderable');

  const queue = [];
  enqueueMissingMeshBuilds(
    [player, currentFar, neighborNear, neighborFar, targetedFar],
    new Map(),
    new Set(),
    queue,
    (entity) => isEntityRenderRelevant(entity, state),
  );
  assert.deepEqual(queue, [player.id, targetedFar.id, currentFar.id, neighborNear.id]);
});

test('loading residency admits only the authored opening composition before flight', () => {
  const player = { id: 1, type: 'ship', isPlayer: true, pos: { x: 0, z: 0 } };
  const state = {
    mode: 'loading',
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player]]),
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const currentFar = {
    id: 2, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 9000, z: 0 },
  };

  assert.equal(isEntityRenderRelevant(player, state), true);
  assert.equal(isEntityRenderRelevant(currentFar, state), false,
    'noncritical active-sector roots stream after the opening frame instead of bloating it');
});

test('authored assets preload ahead of visibility without decoding the whole active sector', () => {
  assert.equal(typeof isEntityAuthoredUpgradeRelevant, 'function');
  const state = {
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 160, z: 0 } }]]),
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const immediate = { id: 2, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 900, z: 0 } };
  const approaching = { id: 3, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 2100, z: 0 } };
  const offAxis = { id: 4, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 0, z: 2100 } };
  const far = { id: 5, type: 'station', homeSectorId: 'sector_helios_prime', pos: { x: 2900, z: 0 } };
  assert.equal(isEntityAuthoredUpgradeRelevant(immediate, state), true, 'near content gets an immediate quality runway');
  assert.equal(isEntityAuthoredUpgradeRelevant(approaching, state), true, 'approaching content preloads before entry');
  assert.equal(isEntityAuthoredUpgradeRelevant(offAxis, state), false, 'stationary/off-axis content does not decode speculatively');
  assert.equal(isEntityAuthoredUpgradeRelevant(far, state), false, 'offscreen current-sector content stays dormant');
});

test('main-scene first renders do not decode every loading-screen entity', () => {
  assert.equal(typeof shouldAutoTriggerAuthoredUpgrade, 'function');
  const mainScene = {};
  const previewScene = {};
  const liveState = { mode: 'loading', render: { scene: mainScene } };
  const npc = { id: 7, type: 'ship', alive: true };
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true };
  const hub = {
    id: 2,
    type: 'station',
    alive: true,
    data: { stationId: 'station_helios', sectorId: 'sector_helios_prime' },
  };

  assert.equal(shouldAutoTriggerAuthoredUpgrade(npc, mainScene, liveState), false,
    'loading-screen traversal must not enqueue unrelated NPC assets');
  assert.equal(shouldAutoTriggerAuthoredUpgrade(player, mainScene, liveState), true,
    'the player remains a startup quality invariant');
  assert.equal(shouldAutoTriggerAuthoredUpgrade(hub, mainScene, liveState), true,
    'the starting landmark remains a startup quality invariant');
  assert.equal(shouldAutoTriggerAuthoredUpgrade(npc, previewScene, liveState), true,
    'isolated preview scenes retain their first-render upgrade trigger');
});
