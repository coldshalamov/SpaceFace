// inf-closed-file-board — the contracts board names the last file you lost.
//
// missions.js is the single writer of the settled-file record: every failed, expired or abandoned
// contract leaves a receipt (newest first) carrying its reason, the forfeited stake, the standing
// it cost and — when the failure mutated into a live successor — the refiled leg's id. The toast
// and debrief fire once mid-flight and are gone; the board's "Yours" column then read "No active
// missions" as if nothing had happened. The board now reads that receipt through
// src/ui/station/closedFileRead.js and renders the loss on the empty column: why it closed, what
// it cost, and where the next try is — never a cause the receipt does not carry, never a next
// that is not really there, and nothing at all once the window lapses or a completion is newer.
//
// The read is pure and carries the behavior (asserted here); the wire is the screen's empty-Yours
// branch (pinned by source below, one import + one branch).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { closedFileRead, closedFileCost, CLOSED_FILE_WINDOW_S } from '../src/ui/station/closedFileRead.js';

const NOW = 12000;

function stateWith({ receipts = [], active = [], boardSlots = [], simTime = NOW } = {}) {
  return {
    simTime,
    missions: {
      active,
      receipts,
      boards: { 'station_ash_cache': { slots: boardSlots } },
    },
  };
}

const lostFile = (over = {}) => ({
  missionId: 'mission_run_1', outcome: 'failed', reason: 'escortee_lost',
  title: 'Quiet Harbor Run', at_s: NOW - 120, factionId: 'faction_reach',
  collateralLostCr: 400, collateralRefundCr: 0, repDelta: -5,
  ...over,
});

test('the board read names the lost file, its cause and its cost', () => {
  const read = closedFileRead(stateWith({ receipts: [lostFile()] }), 'station_ash_cache');
  assert.ok(read, 'the empty column has a file to name');
  assert.equal(read.title, 'Quiet Harbor Run');
  assert.equal(read.cause, 'The ship you were escorting was destroyed.');
  assert.equal(read.cost, 'It cost you a 400 cr stake and -5 REACH standing.');
  assert.equal(read.next, null, 'no next is invented when none is there');
});

test('a refiled successor names where the next try is; a same-house board offer counts too', () => {
  const refiled = closedFileRead(stateWith({
    receipts: [lostFile({ mutatedToMissionId: 'mission_run_2' })],
    active: [{ id: 'mission_run_2', status: 'active', title: 'Quiet Harbor Run, Again' }],
  }), 'station_ash_cache');
  assert.equal(refiled.next, 'The client refiled it as Quiet Harbor Run, Again. It is in Yours.');
  const board = closedFileRead(stateWith({
    receipts: [lostFile()],
    boardSlots: [{ factionId: 'faction_reach', title: 'Haul ore' }, { factionId: 'faction_vael', title: 'Other house' }],
  }), 'station_ash_cache');
  assert.equal(board.next, 'Reach has 1 more job on this board.');
});

test('a completion newer than the loss reads nothing, and an old loss is past the window', () => {
  const settled = stateWith({
    receipts: [
      { missionId: 'm2', outcome: 'completed', title: 'Paid Work', at_s: NOW - 30, reason: 'delivered' },
      lostFile(),
    ],
  });
  assert.equal(closedFileRead(settled, 'station_ash_cache'), null, 'the loss is history now');
  const stale = stateWith({ receipts: [lostFile({ at_s: NOW - CLOSED_FILE_WINDOW_S - 1 })] });
  assert.equal(closedFileRead(stale, 'station_ash_cache'), null, 'the board moves on');
});

test('a void says so instead of a charge; the cold-start receipt is not a loss the board mourns', () => {
  const voided = closedFileRead(stateWith({
    receipts: [lostFile({ reason: 'target_lost', collateralLostCr: 0, repDelta: 0 })],
  }), 'station_ash_cache');
  assert.ok(voided, 'a void still names the file');
  assert.equal(voided.voided, true);
  assert.equal(voided.cost, 'Voided, not your fault: no standing lost.');
  assert.equal(closedFileRead(stateWith({
    receipts: [lostFile({ missionId: 'contract_47a_b0_recovery', title: 'B0 Recovery' })],
  }), 'station_ash_cache'), null, 'the story-installed opening file stays off the board');
  assert.equal(closedFileCost({ reason: 'obligation_already_settled', collateralLostCr: 0, repDelta: 0 }),
    'It cost you nothing but the time.');
});

test('the contracts screen wires the read into its empty Yours column', () => {
  const source = readFileSync(new URL('../src/ui/station/screens/contracts.js', import.meta.url), 'utf8');
  assert.ok(source.includes("from '../closedFileRead.js'"), 'the screen imports the read');
  const branch = source.slice(source.indexOf('function renderActive(state)'));
  assert.ok(branch.includes('closedFileRead(state,'), 'renderActive reads the last file');
  assert.ok(branch.includes('No active missions'), 'the plain empty line stays when there is no loss');
});
