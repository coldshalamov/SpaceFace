import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SIM_WORKER_TRANSPORT,
  createCommandRing,
  createEventRing,
  createSharedSimWorkerBuffers,
  selectSimWorkerTransport,
} from '../src/core/simWorkerProtocol.js';
import {
  applyAbstractCatchupToEntities,
  createSimWorkerHost,
  ensureSimWorker,
} from '../src/core/simWorkerHost.js';
import {
  acknowledgeSaveSnapshotBoundary,
  captureSaveSnapshotBoundary,
  createSaveDirtyJournal,
} from '../src/save/saveDirtyJournal.js';
import {
  clearHudSignatures,
  hudFieldsUnchanged,
  hudSignatureUnchanged,
} from '../src/ui/hudSkipUnchanged.js';
import { masslineHudInputsUnchanged } from '../src/ui/masslineHud.js';
import { entityNeedsAudioUpdate, entityNeedsExactAudio } from '../src/audio/audioActiveSet.js';
import { PRESENTATION_TIER } from '../src/world/activityClassification.js';

test('simulation worker remains production-disabled without an explicit phase-14 opt-in', () => {
  assert.equal(ensureSimWorker({}), null);
  const host = createSimWorkerHost();
  assert.equal(host.transport, SIM_WORKER_TRANSPORT.MAIN_THREAD);
  assert.deepEqual(host.submitAbstract([
    { id: 'remote_1', pos: { x: 0, z: 0 }, vel: { x: 3, z: 0 }, rot: 0, angVel: 0 },
  ], 0, 2), [{
    id: 'remote_1',
    pos: { x: 6, z: 0 },
    vel: { x: 3, z: 0 },
    rot: 0,
    angVel: 0,
    lastExactT: 2,
  }]);
});

test('worker protocol exposes SAB triple-buffer and ordered command/event rings', () => {
  const buffers = createSharedSimWorkerBuffers(32);
  assert.equal(buffers.buffers.length, 3);
  assert.equal(selectSimWorkerTransport({ force: true }), SIM_WORKER_TRANSPORT.MAIN_THREAD);
  assert.equal(
    selectSimWorkerTransport({ force: true, sharedArrayBuffer: true }),
    SIM_WORKER_TRANSPORT.SHARED_ARRAY_BUFFER,
  );
  for (const makeRing of [createCommandRing, createEventRing]) {
    const ring = makeRing(8);
    assert.equal(ring.push(4, 9), true);
    assert.deepEqual(ring.pop(), { kind: 4, payload: 9, sequence: 1 });
    assert.equal(ring.lastPoppedSequence, 1);
  }
});

test('late abstract worker results cannot mutate a body that became exact', () => {
  const entity = {
    id: 'remote_1',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    activity: { simTier: 'S0_EXACT' },
  };
  const state = { simTime: 2, entities: new Map([[entity.id, entity]]) };
  assert.equal(applyAbstractCatchupToEntities(state, [{
    id: entity.id,
    pos: { x: 10, z: 0 },
    vel: { x: 2, z: 0 },
    rot: 0,
    angVel: 0,
    lastExactT: 1,
  }]), 0);
  assert.equal(entity.pos.x, 0);
});

test('abstract catchup rejects stale, dead, unclassified, and future results', () => {
  const stale = {
    id: 'stale',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    activity: { simTier: 'S2_ABSTRACT', lastExactT: 2 },
  };
  const dead = {
    id: 'dead',
    alive: false,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    activity: { simTier: 'S2_ABSTRACT', lastExactT: 1 },
  };
  const unclassified = {
    id: 'unclassified',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    activity: {},
  };
  const future = {
    id: 'future',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    activity: { simTier: 'S2_ABSTRACT', lastExactT: 1 },
  };
  const state = {
    simTime: 2,
    entities: new Map([stale, dead, unclassified, future].map((entity) => [entity.id, entity])),
  };
  const update = (id, lastExactT) => ({
    id,
    pos: { x: 10, z: 0 },
    vel: { x: 2, z: 0 },
    lastExactT,
  });

  assert.equal(applyAbstractCatchupToEntities(state, [
    update(stale.id, 1),
    update(dead.id, 2),
    update(unclassified.id, 2),
    update(future.id, 2.001),
  ]), 0);
  assert.equal(stale.pos.x, 0);
  assert.equal(dead.pos.x, 0);
  assert.equal(unclassified.pos.x, 0);
  assert.equal(future.pos.x, 0);
  assert.equal(stale.activity.lastExactT, 2);
});

test('abstract catchup rejects updates when the authoritative current time is not finite', () => {
  const entity = {
    id: 'remote_invalid_clock',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    activity: { simTier: 'S2_ABSTRACT', lastExactT: 1 },
  };
  const state = { simTime: Number.NaN, entities: new Map([[entity.id, entity]]) };
  assert.equal(applyAbstractCatchupToEntities(state, [{
    id: entity.id,
    pos: { x: 10, z: 0 },
    vel: { x: 2, z: 0 },
    lastExactT: 1,
  }]), 0);
  assert.equal(entity.pos.x, 0);
});

test('save journal snapshots dirty facts at a boundary without serializing during present', () => {
  const journal = createSaveDirtyJournal(16);
  const payload = { id: 'record_1', nested: { value: 1 } };
  journal.record(1, payload);
  payload.nested.value = 9;
  const boundary = captureSaveSnapshotBoundary(journal, { tick: 8, simTime: 2.5 });
  assert.equal(boundary.tick, 8);
  assert.equal(boundary.simTime, 2.5);
  assert.equal(boundary.entries[0].payload.nested.value, 1);
  assert.equal(journal.pending, 1, 'failed saves must retain the captured dirty facts');
  journal.record(2, { id: 'record_2' });
  assert.equal(acknowledgeSaveSnapshotBoundary(journal, boundary), 1);
  assert.equal(journal.pending, 1, 'facts recorded after the boundary stay queued');
});

test('HUD signature cache skips only equivalent inputs and does not pollute saves', () => {
  const state = {};
  assert.equal(hudSignatureUnchanged(state, 'massline', 'idle'), false);
  assert.equal(hudSignatureUnchanged(state, 'massline', 'idle'), true);
  assert.equal(hudSignatureUnchanged(state, 'massline', 'changed'), false);
  assert.equal(Object.hasOwn(state, '_hudSignatures'), false);
  clearHudSignatures(state);
});

test('Massline HUD compares a reusable scalar block and notices movement', () => {
  const state = {
    simTime: 0,
    entities: new Map(),
    massline2: {},
    player: {},
    settings: { video: {}, accessibility: {} },
  };
  const player = { pos: { x: 0, z: 0 } };
  assert.equal(masslineHudInputsUnchanged(state, player), false);
  assert.equal(masslineHudInputsUnchanged(state, player), true);
  player.pos.x = 1;
  assert.equal(masslineHudInputsUnchanged(state, player), false);
  assert.equal(masslineHudInputsUnchanged(state, player), true);
  let value = 1;
  assert.equal(hudFieldsUnchanged(state, 'scalar-test', (fields) => { fields[0] = value; return 1; }), false);
  assert.equal(hudFieldsUnchanged(state, 'scalar-test', (fields) => { fields[0] = value; return 1; }), true);
  value = 2;
  assert.equal(hudFieldsUnchanged(state, 'scalar-test', (fields) => { fields[0] = value; return 1; }), false);
  clearHudSignatures(state);
});

test('audio active set keeps player/glass/combat voices and drops remote metadata updates', () => {
  const player = { id: 1, alive: true, isPlayer: true };
  const glass = { id: 2, alive: true, activity: { presentationTier: PRESENTATION_TIER.R0_GLASS } };
  const remote = { id: 3, alive: true, activity: { presentationTier: PRESENTATION_TIER.R3_UNLOADED } };
  assert.equal(entityNeedsExactAudio(player, { playerId: 1 }), true);
  assert.equal(entityNeedsAudioUpdate(glass), true);
  assert.equal(entityNeedsAudioUpdate(remote), false);
  assert.equal(entityNeedsExactAudio(remote, { combatId: 3 }), true);
});
