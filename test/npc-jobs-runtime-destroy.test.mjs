import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import { heliosSharedCutRead } from '../src/systems/heliosSharedCut.js';

// init() installs the two Helios helper subscription sets (_cuttingCourtesyCleanup,
// _sharedCutCleanup); destroy() must release them so a retired owner stops answering events
// on a retained bus. The shared-cut helper's live seam is observable through the real
// mining:tick -> holds -> heliosSharedCutRead path.

function fixture() {
  const player = { id: 'player', type: 'ship', team: 1, alive: true, occupantGeneration: 1,
    pos: { x: 0, y: 0, z: 40 }, rot: 0, data: {} };
  const worker = { id: 'w1', type: 'ship', team: 2, alive: true, occupantGeneration: 1,
    pos: { x: 0, y: 0, z: 30 }, rot: 0, radius: 4,
    data: { activityActorSlotId: 'helios_seam_miner', worldRecordId: 'rec1', jobId: 'job:rec1',
      minerShiftRockId: 'r1', miningBeam: { range: 240 } } };
  const rock = { id: 'r1', type: 'asteroid', team: 0, alive: true, occupantGeneration: 1,
    pos: { x: 0, y: 0, z: 0 }, radius: 10, data: { oreHP: 50 } };
  const entities = [player, worker, rock];
  const spatialHash = new SpatialHash(64);
  const job = { id: 'job:rec1', kind: 'miner', phase: 'work', materialized: true, corrupt: false,
    route: [] };
  const entry = { worldRecordId: 'rec1', entityId: 'w1', job };
  const state = {
    mode: 'flight', simTime: 10, playerId: 'player',
    world: { currentSectorId: 'sector_helios_prime', enterSerial: 1 },
    ui: {}, player: { flags: {} }, save: {}, physicsVenue: { active: false },
    run: { kind: 'adventure' }, input: { fireGroup: 2 },
    entityList: entities,
    entities: new Map(entities.map((value) => [value.id, value])),
    entityIndex: { __spacefaceEntityIndexV1: true, ships: entities.filter((e) => e.type === 'ship') },
    spatialHash,
    npcJobs: { byId: { 'job:rec1': entry } },
  };
  const bus = createBus();
  const mining = { _beaming: true, _activeVerb: 'extract', _lockTargetId: 'r1' };
  const ctx = () => ({ state, bus, helpers: {}, registry: { get: (name) => name === 'mining' ? mining : null } });
  const liveCut = () => bus.emit('mining:tick', { sourceEntityId: 'player', targetId: 'r1' });
  const listenerCount = (event) => bus._listeners.get(event)?.size ?? 0;
  return { state, bus, ctx, liveCut, listenerCount, worker, rock };
}

test('destroy releases both Helios helper subscriptions on a retained bus', () => {
  const f = fixture();
  const retired = Object.create(npcJobsRuntime);
  retired.init(f.ctx());
  retired._heliosStarterMinerRecordId = 'rec1';
  assert.equal(f.listenerCount('voice:surface'), 2, 'both helpers listen for the voice receipt');
  assert.equal(f.listenerCount('sim:pause'), 2, 'both helpers listen for pause');
  assert.equal(f.listenerCount('mining:tick'), 1, 'shared cut listens for the live beam receipt');

  retired.destroy();
  assert.equal(retired._cuttingCourtesyCleanup, null, 'courtesy helper cleanup released');
  assert.equal(retired._sharedCutCleanup, null, 'shared-cut helper cleanup released');
  assert.equal(f.listenerCount('voice:surface'), 0, 'retired helpers must not stay subscribed');
  assert.equal(f.listenerCount('sim:pause'), 0);
  assert.equal(f.listenerCount('mining:tick'), 0);

  // With no live owner a real beam receipt must install no hold: the retired subscription
  // is gone, so nothing converts the tick into shared-cut state.
  f.liveCut();
  assert.equal(heliosSharedCutRead(f.state, f.worker), null, 'retired helper fired nothing');

  const replacement = Object.create(npcJobsRuntime);
  replacement.init(f.ctx());
  replacement._heliosStarterMinerRecordId = 'rec1';
  assert.equal(f.listenerCount('voice:surface'), 2, 'replacement installs one fresh set');
  assert.equal(f.listenerCount('mining:tick'), 1);
  f.liveCut();
  assert.deepEqual(heliosSharedCutRead(f.state, f.worker), { rockId: 'r1' },
    'the replacement owner still reserves the shared cut');
  replacement.destroy();
});
