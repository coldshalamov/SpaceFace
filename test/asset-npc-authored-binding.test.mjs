import assert from 'node:assert/strict';
import test from 'node:test';

import * as rendererModule from '../src/render/renderer.js';

const enqueueMissingMeshBuilds = rendererModule.enqueueMissingMeshBuilds;

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
