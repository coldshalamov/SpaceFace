// Row 471 (RC-RECORDS): the Records Wall surfaces witnessed deeds with place and time, the
// Crucible corner lists today's local board, and the Range Licence medals a cleared rung.
// Pure readers — no bus, no RNG, no writes to the evidence they summarize.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { flightClock, recordsWall, todayRankedRuns } from '../src/chronicler/recordsWall.js';
import {
  awardRangeLicence,
  normalizeRangeLicence,
  rangeMedalLabel,
  RANGE_LICENCE_MEDALS,
} from '../src/ui/rangeLicence.js';

test('flightClock renders h:mm:ss and clamps junk to zero', () => {
  assert.equal(flightClock(0), '0:00:00');
  assert.equal(flightClock(65), '0:01:05');
  assert.equal(flightClock(3725), '1:02:05');
  assert.equal(flightClock(-4), '0:00:00');
  assert.equal(flightClock('junk'), '0:00:00');
});

test('recordsWall lists only witnessed stories, newest first, bounded at 24', () => {
  const story = (id, t, place = {}) => ({
    id,
    nodes: [{ t, actor: { key: 'player' }, subject: null, details: null, parent: null, ...place }],
    edges: [],
  });
  const state = {
    chronicler: {
      stories: [
        story('old', 10, { sectorId: 'helios' }),
        story('new', 99, { stationName: 'The Pound' }),
        { id: 'empty', nodes: [] },          // never witnessed: no nodes
        { id: 'shapeless' },                  // no nodes at all
      ],
    },
  };
  const wall = recordsWall(state);
  assert.deepEqual(wall.map((r) => r.id), ['new', 'old'], 'newest deed first, empty stories dropped');
  assert.equal(wall[0].place, 'The Pound');
  assert.equal(wall[0].time, '0:01:39');
  assert.equal(wall[1].place.length > 0, true, 'a sector id resolves to a name, not an id leak');

  const many = { chronicler: { stories: Array.from({ length: 40 }, (_, i) => story(`s${i}`, i)) } };
  assert.equal(recordsWall(many).length, 24, 'the wall is bounded');
  assert.deepEqual(recordsWall(null), []);
  assert.deepEqual(recordsWall({}), []);
});

test('todayRankedRuns ranks by score then wave, skips practice, keeps the top five', () => {
  const run = (score, wave, extra = {}) => ({ score, deepestWave: wave, seed: 4242, dailyDateKey: '2026-10-23', ...extra });
  const profile = {
    history: [
      run(100, 4), run(300, 2), run(200, 9), run(300, 7),
      run(999, 20, { practice: true }),       // a practice run is not a board entry
      run(50, 1, { dailyDateKey: '2026-10-22' }), // yesterday is not today
      run(150, 3), run(120, 3),
    ],
  };
  const board = todayRankedRuns(profile, '2026-10-23');
  assert.deepEqual(board.map((r) => r.score), [300, 300, 200, 150, 120],
    'score order; the 300s tie-break on deepest wave');
  assert.equal(board[0].wave, 7, 'same score: deeper wave ranks higher');
  assert.deepEqual(board.map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.equal(todayRankedRuns(null, '2026-10-23').length, 0);
});

test('the Range Licence normalizes junk, medals on the 30s gold line, and keeps the best', () => {
  const dirty = normalizeRangeLicence({
    rungs: {
      good: { bestS: 21.5, medal: 2 },
      'bad id!!': { bestS: 5, medal: 3 },
      nowave: { bestS: -3, medal: 3 },
      nomedal: { bestS: 12 },
    },
  });
  assert.deepEqual(Object.keys(dirty.rungs).sort(), ['good', 'nomedal'],
    'invalid ids and non-positive times drop; a missing medal defaults to Bronze');
  assert.equal(dirty.rungs.good.medal, 2);
  assert.equal(dirty.rungs.nomedal.medal, 1);

  let licence = normalizeRangeLicence(null);
  licence = awardRangeLicence(licence, 'slalom', 24.0);
  assert.equal(licence.rungs.slalom.medal, 3, 'inside 30s is Gold');
  licence = awardRangeLicence(licence, 'slalom', 45.0);
  assert.equal(licence.rungs.slalom.medal, 3, 'a slower clear never strips the medal');
  assert.equal(licence.rungs.slalom.bestS, 24.0, 'the best time stands');
  licence = awardRangeLicence(licence, 'gauntlet', 55.0);
  assert.equal(licence.rungs.gauntlet.medal, 2, 'inside 60s is Silver');
  licence = awardRangeLicence(licence, 'maw', 90.0);
  assert.equal(licence.rungs.maw.medal, 1, 'a clear past the bands is Bronze');

  assert.equal(rangeMedalLabel(licence, 'slalom'), RANGE_LICENCE_MEDALS[3]);
  assert.equal(rangeMedalLabel(normalizeRangeLicence(null), 'slalom'), RANGE_LICENCE_MEDALS[0]);
});
