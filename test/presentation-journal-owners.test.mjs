import assert from 'node:assert/strict';
import test from 'node:test';

import { core } from '../src/core/coreSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  createPresentationJournal,
  createPresentationJournalRecord,
  PRESENTATION_JOURNAL_KINDS,
} from '../src/core/presentationJournal.js';
import { LOOP_FIXED_DT } from '../src/core/simulationRunner.js';

function recordAt(journal, sequence) {
  const record = createPresentationJournalRecord();
  assert.equal(journal.copySequence(sequence, record), true);
  return { ...record };
}

test('core publishes presentation identity, visual, transform, destroy, and run boundaries', () => {
  const state = createGameState(12345);
  const bus = createBus();
  const presentationJournal = createPresentationJournal(8);
  const helpers = {};
  core.init({ state, bus, helpers, presentationJournal });

  try {
    const ship = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 10, z: -4 },
      ttl: Infinity,
      data: {},
    });
    assert.equal(presentationJournal.getWriteSequence(), 1);

    core.preStep(LOOP_FIXED_DT, state);
    ship.pos.x = 14;
    ship.rot = 0.5;
    bus.emit('ship:appearanceChanged', { id: ship.id });
    core.lifetimeSweep(LOOP_FIXED_DT, state);

    core.preStep(LOOP_FIXED_DT, state);
    ship.alive = false;
    core.lifetimeSweep(LOOP_FIXED_DT, state);

    assert.deepEqual([
      recordAt(presentationJournal, 1).kind,
      recordAt(presentationJournal, 2).kind,
      recordAt(presentationJournal, 3).kind,
      recordAt(presentationJournal, 4).kind,
    ], [
      PRESENTATION_JOURNAL_KINDS.SPAWN,
      PRESENTATION_JOURNAL_KINDS.VISUAL,
      PRESENTATION_JOURNAL_KINDS.TRANSFORM,
      PRESENTATION_JOURNAL_KINDS.DESTROY,
    ]);
    assert.equal(recordAt(presentationJournal, 1).tick, 0);
    assert.equal(recordAt(presentationJournal, 2).tick, 1);
    assert.equal(recordAt(presentationJournal, 2).x, 14);
    assert.equal(recordAt(presentationJournal, 3).x, 14);
    assert.equal(recordAt(presentationJournal, 4).tick, 2);
    assert.equal(state.entities.has(ship.id), false);

    bus.emit('game:new', {});
    assert.equal(presentationJournal.needsRebuild(), true);
    assert.equal(presentationJournal.getPendingCount(), 0);
    assert.equal(presentationJournal.getDiagnostics().rebuildReason, 'game-new');
  } finally {
    core.destroy();
  }
});
