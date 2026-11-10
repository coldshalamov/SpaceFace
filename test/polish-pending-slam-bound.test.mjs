import test from 'node:test';
import assert from 'node:assert/strict';

import {
  notePendingSlam,
  peekPendingSlam,
  consumePendingSlamIfFresh,
  resetPendingSlams,
  PENDING_SLAM_KEY_CAP,
  PENDING_SLAM_MAX_AGE_TICKS,
} from '../src/systems/hullFracture.js';

// The pending-slam map is keyed by victim id and only drains on consume — a slammed ship that
// despawns before its kill lands never consumes, so the map used to grow without bound and
// stale notes kept suppressing the arena shard. It now carries the sibling lethal-blow map's
// cap (evict-oldest on insert) and prunes notes past the freshness window on insert.

function victim(id) {
  return {
    id, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, angVel: 0, mass: 24, radius: 7,
  };
}

function note(id, tick = 10) {
  return notePendingSlam(victim(id), { closingSpeed: 60, tick });
}

test('the pending-slam map evicts its oldest key past the cap', () => {
  resetPendingSlams();
  const firstIds = [];
  for (let i = 0; i < PENDING_SLAM_KEY_CAP + 25; i++) {
    if (i < 5) firstIds.push(1000 + i);
    assert.equal(note(1000 + i, 10), true, `note ${i} accepted`);
  }
  for (const id of firstIds) {
    assert.equal(peekPendingSlam(id), null, `oldest note ${id} was evicted`);
  }
  assert.ok(peekPendingSlam(1000 + PENDING_SLAM_KEY_CAP + 24), 'the newest note survives');
});

test('a stale slam note ages out at insert time instead of lingering forever', () => {
  resetPendingSlams();
  assert.equal(note(11, 0), true, 'victim 11 slammed at tick 0');
  assert.ok(peekPendingSlam(11), 'the fresh note is present');

  // A much later slam elsewhere in the sector prunes the note whose window closed long ago.
  assert.equal(note(12, 100), true, 'victim 12 slammed at tick 100');
  assert.equal(peekPendingSlam(11), null, 'the stale note was pruned on insert');
  assert.ok(peekPendingSlam(12), 'the new note survives its own insert prune');

  // A note inside the window is never pruned by a neighbor's insert.
  assert.equal(note(13, 100 + PENDING_SLAM_MAX_AGE_TICKS), true, 'victim 13 slammed 12 ticks later');
  assert.ok(peekPendingSlam(12), 'the 12-tick-old note is exactly at the window edge and stays');
});

test('freshness semantics at consume are unchanged', () => {
  resetPendingSlams();
  assert.equal(note(21, 10), true);
  assert.ok(consumePendingSlamIfFresh(21, 15), '5 ticks later the note is fresh');
  assert.equal(note(21, 10), true);
  assert.equal(consumePendingSlamIfFresh(21, 30), null, '20 ticks later the note is stale');
});

// D168: the shard-suppression peek must apply the same freshness window as the consume — a
// note whose kill never landed in-window is dead weight that used to read as a live slam.
test('a ticked peek reads stale notes as absent without consuming them', () => {
  resetPendingSlams();
  assert.equal(note(31, 10), true);
  assert.ok(peekPendingSlam(31, 10 + PENDING_SLAM_MAX_AGE_TICKS), 'window-edge peek still sees the note');
  assert.equal(peekPendingSlam(31, 10 + PENDING_SLAM_MAX_AGE_TICKS + 1), null,
    'one tick past the window the peek reads the note as absent');
  assert.ok(peekPendingSlam(31), 'the unticked peek still sees it — read-only, nothing consumed');
  assert.ok(consumePendingSlamIfFresh(31, 10), 'the note remains consumable inside its window');
});
