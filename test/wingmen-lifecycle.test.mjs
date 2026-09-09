import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { createPresentationJournal } from '../src/core/presentationJournal.js';
import { wingmen } from '../src/systems/wingmen.js';

function createHarness() {
  const state = createGameState(23);
  const bus = createBus();
  const presentationJournal = createPresentationJournal(32);
  const helpers = {};
  core.init({ state, bus, helpers, presentationJournal });

  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 12,
    mass: 100,
    data: {},
  });
  state.playerId = player.id;
  const wingman = helpers.spawnEntity({
    type: 'ship',
    team: 0,
    pos: { x: 40, z: 0 },
    radius: 8,
    mass: 30,
    data: { isWingman: true },
  });
  state.automation.fleet = [{
    id: 'fleet-wing-1',
    shipDefId: 'ship_wasp',
    order: 'escort',
    _liveId: wingman.id,
  }];

  wingmen.init({ state, bus, helpers });
  return { state, bus, helpers, wingman, presentationJournal };
}

function journalKinds(journal) {
  const records = [];
  journal.visitRange(0, journal.getWriteSequence(), {}, (record) => {
    records.push({ kind: record.kind, entityId: record.entityId });
  });
  return records;
}

test('wingman hard sector exit leaves one canonical destroy receipt to core sweep', () => {
  const { state, bus, helpers, wingman, presentationJournal } = createHarness();
  const destroyed = [];
  bus.on('entity:destroyed', (payload) => destroyed.push(payload));

  try {
    bus.emit('sector:exit', { continuous: false, noTeleport: false });
    assert.equal(wingman.alive, false);
    assert.equal(state.automation.fleet[0]._liveId, null);
    assert.equal(destroyed.length, 0, 'wingmen are not the entity lifecycle owner');
    assert.equal(state.entities.get(wingman.id), wingman);
    assert.equal(state.entityList.includes(wingman), true);
    assert.equal(state.entityIndex.shipLike.includes(wingman), true);

    core.lifetimeSweep(1 / 60, state);
    assert.equal(destroyed.length, 1, 'core sweep must publish exactly one queued receipt');
    assert.equal(state.entities.has(wingman.id), false);
    assert.equal(state.entityList.includes(wingman), false);
    assert.equal(state.entityIndex.shipLike.includes(wingman), false);
    assert.equal(state.entityIndex.collidables.includes(wingman), false);
    assert.equal(helpers.queryRadius({ x: 40, z: 0 }, 12).includes(wingman), false);
    assert.equal(state.freeIds.includes(wingman.id), true);
    assert.deepEqual(destroyed.map(({ id, type }) => ({ id, type })), [
      { id: wingman.id, type: 'ship' },
    ]);
    assert.deepEqual(journalKinds(presentationJournal), [
      { kind: 'spawn', entityId: state.playerId },
      { kind: 'spawn', entityId: wingman.id },
      { kind: 'destroy', entityId: wingman.id },
    ]);

    bus.flush();
    assert.equal(destroyed.length, 1, 'a later flush must not create a duplicate opportunity');
  } finally {
    wingmen.destroy?.();
    core.destroy();
  }
});
