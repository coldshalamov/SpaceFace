import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';
import {
  handlePayloadSectorTransition,
  spawnPayloadEntity,
} from '../src/combat/industrialBeam.js';

function createHarness() {
  const state = createGameState(7);
  const bus = createBus();
  const presentationJournal = createPresentationJournal(32);
  const helpers = {};
  core.init({ state, bus, helpers, presentationJournal });
  return { state, bus, helpers, presentationJournal };
}

function visitKinds(journal) {
  const records = [];
  const end = journal.getWriteSequence();
  if (end > 0) {
    journal.visitRange(0, end, {}, (record) => {
      records.push({ kind: record.kind, entityId: record.entityId });
    });
  }
  return records;
}

test('industrial payload spawn enters every canonical entity lifecycle surface', () => {
  const { state, bus, helpers, presentationJournal } = createHarness();
  const spawned = [];
  bus.on('entity:spawned', (payload) => spawned.push(payload));

  try {
    core.preStep(1 / 60, state);
    const payload = spawnPayloadEntity(state, { pos: { x: 20, z: 0 }, radius: 8 }, helpers);

    assert.equal(state.entities.get(payload.id), payload);
    assert.equal(state.entityList.includes(payload), true);
    assert.equal(state.entityIndex.payloads.includes(payload), true);
    assert.equal(state.entityIndex.collidables.includes(payload), true);
    assert.equal(helpers.queryRadius({ x: 20, z: 0 }, 30).includes(payload), true);
    assert.deepEqual(spawned.map(({ id, type }) => ({ id, type })), [
      { id: payload.id, type: 'payload' },
    ]);
    assert.deepEqual(visitKinds(presentationJournal), [
      { kind: 'spawn', entityId: payload.id },
    ]);
  } finally {
    core.destroy();
  }
});

test('industrial payload sector cleanup recycles and publishes exactly once', () => {
  const { state, bus, helpers, presentationJournal } = createHarness();
  const destroyed = [];
  bus.on('entity:destroyed', (payload) => destroyed.push(payload));

  try {
    core.preStep(1 / 60, state);
    const payload = spawnPayloadEntity(state, { pos: { x: 20, z: 0 }, radius: 8 }, helpers);
    const removed = handlePayloadSectorTransition(state, helpers);

    assert.equal(removed, 1);
    assert.equal(state.entities.has(payload.id), false);
    assert.equal(state.entityList.includes(payload), false);
    assert.equal(state.entityIndex.payloads.includes(payload), false);
    assert.equal(state.entityIndex.collidables.includes(payload), false);
    assert.equal(state.freeIds.includes(payload.id), true);

    bus.flush();
    assert.deepEqual(destroyed.map(({ id, type, reason }) => ({ id, type, reason })), [
      { id: payload.id, type: 'payload', reason: 'payload_sector_transition' },
    ]);
    assert.deepEqual(visitKinds(presentationJournal), [
      { kind: 'spawn', entityId: payload.id },
      { kind: 'destroy', entityId: payload.id },
    ]);
  } finally {
    core.destroy();
  }
});

test('industrial payload lifecycle refuses the compatibility fallback on canonical state', () => {
  const { state, bus, helpers, presentationJournal } = createHarness();
  const spawned = [];
  const destroyed = [];
  bus.on('entity:spawned', (payload) => spawned.push(payload));
  bus.on('entity:destroyed', (payload) => destroyed.push(payload));

  try {
    const nextIdBeforeSpawn = state.nextEntityId;
    assert.throws(
      () => spawnPayloadEntity(state, { pos: { x: 20, z: 0 } }),
      /industrial payload spawn requires canonical helpers\.spawnEntity/,
    );
    assert.equal(state.nextEntityId, nextIdBeforeSpawn);
    assert.equal(state.entities.size, 0);
    assert.equal(state.entityList.length, 0);
    assert.equal(state.entityIndex.payloads.length, 0);
    assert.equal(presentationJournal.getWriteSequence(), 0);
    assert.equal(spawned.length, 0);

    const payload = spawnPayloadEntity(state, { pos: { x: 20, z: 0 } }, helpers);
    const freeIdsBeforeCleanup = state.freeIds.slice();
    assert.throws(
      () => handlePayloadSectorTransition(state),
      /industrial payload cleanup requires canonical helpers\.removeEntity/,
    );
    assert.equal(payload.alive, true);
    assert.equal(state.entities.get(payload.id), payload);
    assert.equal(state.entityList.includes(payload), true);
    assert.equal(state.entityIndex.payloads.includes(payload), true);
    assert.deepEqual(state.freeIds, freeIdsBeforeCleanup);
    assert.equal(presentationJournal.getWriteSequence(), 1);
    assert.equal(destroyed.length, 0);
  } finally {
    core.destroy();
  }
});
