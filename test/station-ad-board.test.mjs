import test from 'node:test';
import assert from 'node:assert/strict';

import { adBoardNoticesForStation } from '../src/ui/station/adBoard.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import { SECTORS } from '../src/data/sectors.js';

const AUTHORED_IDS = new Set(FLAVOR_PACKS.ad_board.entries.map((entry) => entry.id));

test('ad-board binds only authored pack rows and is deterministic per berth', () => {
  const first = adBoardNoticesForStation('station_helios');
  const second = adBoardNoticesForStation('station_helios');
  assert.deepEqual(first, second, 'the same berth must post the same wall on every render');
  assert.ok(first.length >= 3, 'a real berth posts a board, not a single notice');
  for (const notice of first) {
    assert.ok(AUTHORED_IDS.has(notice.id), 'notice rows must come from the authored pack verbatim');
  }
});

test('house sponsors lead at their own berth without flooding the board', () => {
  const notices = adBoardNoticesForStation('station_helios');
  const house = notices.filter((notice) => notice.sponsor.startsWith('Helios '));
  assert.ok(house.length >= 1, 'Helios berth should post Helios house notices');
  assert.ok(house.length <= 2, 'house ads lead but may not flood the wall');
});

test('ad-board fails closed without a real docked berth and honors its limit', () => {
  assert.deepEqual(adBoardNoticesForStation(null), []);
  assert.deepEqual(adBoardNoticesForStation(''), []);
  assert.deepEqual(adBoardNoticesForStation('station_nowhere'), []);
  assert.equal(adBoardNoticesForStation('station_helios', { limit: 2 }).length, 2);
  assert.deepEqual(adBoardNoticesForStation('station_helios', { limit: 0 }), []);
});

test('the board is station-scoped: distinct berths post distinct mixes', () => {
  const boards = new Set();
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      boards.add(adBoardNoticesForStation(station.id).map((notice) => notice.id).join('|'));
    }
  }
  assert.ok(boards.size > 1, 'stations must not all show the same ad wall');
});
