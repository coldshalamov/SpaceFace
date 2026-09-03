import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';
import {
  CAUSAL_SURVIVOR_PAYLOAD_TYPE,
  MAX_CAUSAL_SURVIVOR_PODS,
  enforceCausalSurvivorPodCap,
  isCausalSurvivorPod,
} from '../src/systems/survivorPod.js';

function createHarness() {
  const state = createGameState(19);
  const bus = createBus();
  const presentationJournal = createPresentationJournal(32);
  const helpers = {};
  core.init({ state, bus, helpers, presentationJournal });
  core.preStep(1 / 60, state);
  return { state, bus, helpers, presentationJournal };
}

function spawnPod(helpers, index) {
  return helpers.spawnEntity({
    type: 'payload',
    collides: true,
    radius: 5,
    mass: 24,
    pos: { x: 20 + index * 12, z: 0 },
    data: {
      kind: 'payload',
      payloadType: CAUSAL_SURVIVOR_PAYLOAD_TYPE,
      transientSector: false,
    },
  });
}

function journalKinds(journal) {
  const records = [];
  const end = journal.getWriteSequence();
  journal.visitRange(0, end, {}, (record) => {
    records.push({ kind: record.kind, entityId: record.entityId });
  });
  return records;
}

test('survivor-pod cap disposal uses canonical lifecycle bookkeeping', () => {
  const { state, bus, helpers, presentationJournal } = createHarness();
  const destroyed = [];
  bus.on('entity:destroyed', (payload) => destroyed.push(payload));

  try {
    const pods = Array.from(
      { length: MAX_CAUSAL_SURVIVOR_PODS + 2 },
      (_, index) => spawnPod(helpers, index),
    );
    const removed = enforceCausalSurvivorPodCap(
      state,
      bus,
      MAX_CAUSAL_SURVIVOR_PODS,
      helpers,
    );

    assert.equal(removed, 2);
    assert.equal(state.entityList.filter(isCausalSurvivorPod).length, MAX_CAUSAL_SURVIVOR_PODS);
    assert.equal(state.entities.has(pods[0].id), false);
    assert.equal(state.entities.has(pods[1].id), false);
    assert.equal(state.entityList.includes(pods[0]), false);
    assert.equal(state.entityList.includes(pods[1]), false);
    assert.equal(state.entityIndex.payloads.includes(pods[0]), false);
    assert.equal(state.entityIndex.payloads.includes(pods[1]), false);
    assert.equal(state.entityIndex.collidables.includes(pods[0]), false);
    assert.equal(state.entityIndex.collidables.includes(pods[1]), false);
    assert.equal(helpers.queryRadius({ x: 20, z: 0 }, 8).includes(pods[0]), false);
    assert.equal(helpers.queryRadius({ x: 32, z: 0 }, 8).includes(pods[1]), false);
    assert.deepEqual(state.freeIds, [pods[0].id, pods[1].id]);
    assert.equal(destroyed.length, 0, 'canonical entity destruction is queued until bus.flush');

    bus.flush();
    assert.deepEqual(
      destroyed.map(({ id, type, reason }) => ({ id, type, reason })),
      [
        { id: pods[0].id, type: 'payload', reason: 'survivor_pod_cap' },
        { id: pods[1].id, type: 'payload', reason: 'survivor_pod_cap' },
      ],
    );
    assert.deepEqual(journalKinds(presentationJournal), [
      ...pods.map((pod) => ({ kind: 'spawn', entityId: pod.id })),
      { kind: 'destroy', entityId: pods[0].id },
      { kind: 'destroy', entityId: pods[1].id },
    ]);
  } finally {
    core.destroy();
  }
});
