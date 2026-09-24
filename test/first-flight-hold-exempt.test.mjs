import assert from 'node:assert/strict';
import test from 'node:test';

import { serviceRenderMeshResidency } from '../src/render/renderer.js';

test('first-flight hold enqueues the rescue set and on-glass rows instead of starving them', () => {
  // Live-confirmed: the rescue rock spawned at flight start sat meshless until the hold
  // released at +20 s, because reconcile/poll never run under the hold and the build queue
  // stayed empty, so the protected drain no-opped. The hold must queue its exempt set first.
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  };
  const rescueRock = {
    id: 2, type: 'asteroid', alive: true,
    pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 }, radius: 18,
    data: { rescue: true, typeId: 'ast_rescue_rock' },
  };
  const glassShip = {
    id: 3, type: 'ship', alive: true,
    pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    data: { defId: 'ship_wasp' },
  };
  const farShip = {
    id: 4, type: 'ship', alive: true,
    pos: { x: 3000, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    data: { defId: 'ship_wasp' },
  };
  const entities = new Map([[1, player], [2, rescueRock], [3, glassShip], [4, farShip]]);
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 5,
    tick: 300,
    entities,
    entityList: [player, rescueRock, glassShip, farShip],
    camera: { zoom: 144 },
    settings: { video: { fov: 50 } },
    player: {},
    world: {},
    render: {},
  };
  let drained = 0;
  const owner = {
    state,
    _activityFrame: { renderGlassIds: [3], renderRunwayIds: [] },
    _meshes: new Map(),
    _meshBuildQueuedIds: new Set(),
    _meshBuildQueue: [],
    _meshBuildQueueHead: 0,
    _renderResidencyPollS: 0,
    _sectorHandoffStreamHoldS: 0,
    _meshReconcileDirty: true,
    _deferNoncriticalMeshStreaming: false,
    _drainProtectedFirstFlightBuilds() { drained += 1; return 0; },
  };
  assert.equal(serviceRenderMeshResidency(owner, 0.5), 'held-first-flight');
  assert.equal(owner._meshReconcileDirty, false);
  assert.equal(drained, 1);
  assert.ok(owner._meshBuildQueuedIds.has(2), 'rescue rock queued under the hold');
  assert.ok(owner._meshBuildQueuedIds.has(3), 'on-glass ship queued under the hold');
  assert.equal(owner._meshBuildQueuedIds.has(4), false, 'distant ship keeps the hold');
});

test('protected first-flight drain caps to the ordinary runtime mesh budget', async () => {
  const { readFile } = await import('node:fs/promises');
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(
    renderer,
    /_drainMeshBuildQueue\(Math\.min\(moved, RUNTIME_MESH_BUILD_BUDGET\)\)/,
    'hold-exempt drain must not build an unbounded exempt cohort in one frame',
  );
});
