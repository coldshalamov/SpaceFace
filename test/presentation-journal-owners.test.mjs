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

test('docked flight stops transform publication and rebuilds on undock', () => {
  const state = createGameState(22222);
  const bus = createBus();
  const presentationJournal = createPresentationJournal(16);
  const helpers = {};
  core.init({ state, bus, helpers, presentationJournal });

  try {
    const ship = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 0, z: 0 },
      ttl: Infinity,
      data: {},
    });
    const afterSpawn = presentationJournal.getWriteSequence();
    state.ui.docked = true;
    core.preStep(LOOP_FIXED_DT, state);
    ship.pos.x = 40;
    core.lifetimeSweep(LOOP_FIXED_DT, state);
    assert.equal(presentationJournal.getWriteSequence(), afterSpawn);
    assert.equal(presentationJournal.needsRebuild(), false);

    state.ui.docked = false;
    core.preStep(LOOP_FIXED_DT, state);
    core.lifetimeSweep(LOOP_FIXED_DT, state);
    assert.equal(presentationJournal.needsRebuild(), true);
    assert.equal(presentationJournal.getDiagnostics().rebuildReason, 'undock-resume');
  } finally {
    core.destroy();
  }
});

test('a same-sector player relocation re-seeds presentation instead of vanishing', () => {
  // world.relocatePlayerInSector writes pos and prevPos together; the per-tick transform gate
  // therefore never publishes the teleport. The relocation event must rebuild the mirror, the same
  // re-seed a sector entry gets, or the hull and camera stay at the old spot until the pilot moves.
  const state = createGameState(33333);
  const bus = createBus();
  const presentationJournal = createPresentationJournal(16);
  const helpers = {};
  core.init({ state, bus, helpers, presentationJournal });

  try {
    const player = helpers.spawnEntity({
      type: 'ship', isPlayer: true, pos: { x: 0, z: 0 }, ttl: Infinity, data: {},
    });
    state.playerId = player.id;
    core.preStep(LOOP_FIXED_DT, state);
    core.lifetimeSweep(LOOP_FIXED_DT, state);
    const afterSettle = presentationJournal.getWriteSequence();

    // The relocation seam's exact write: pos and prevPos both land on the new spot.
    player.pos.x = 1680; player.pos.z = -920;
    player.prevPos.x = 1680; player.prevPos.z = -920;
    core.preStep(LOOP_FIXED_DT, state);
    core.lifetimeSweep(LOOP_FIXED_DT, state);
    assert.equal(presentationJournal.getWriteSequence(), afterSettle,
      'precondition: the transform gate cannot see a pos+prevPos teleport');

    bus.emit('world:playerRelocated', { sectorId: 'sector_helios_prime', pos: { x: 1680, z: -920 } });
    assert.equal(presentationJournal.needsRebuild(), true);
    assert.equal(presentationJournal.getDiagnostics().rebuildReason, 'player-relocated');
  } finally {
    core.destroy();
  }
});

test('core detaches every journal producer before terminal close', () => {
  const state = createGameState(54321);
  const bus = createBus();
  const presentationJournal = createPresentationJournal(8);
  const helpers = {};
  core.init({ state, bus, helpers, presentationJournal });

  const ship = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    ttl: Infinity,
    data: {},
  });
  core.destroy();
  presentationJournal.close();

  assert.doesNotThrow(() => bus.emit('ship:appearanceChanged', { id: ship.id }));
  assert.doesNotThrow(() => bus.emit('game:new', {}));
  assert.equal(presentationJournal.getDiagnostics().closed, true);
  assert.equal(presentationJournal.getDiagnostics().pending, 0);
  assert.throws(
    () => presentationJournal.recordVisual(state.tick, ship),
    /PresentationJournal is closed/,
    'direct late publication must fail even after producer detachment',
  );
});
