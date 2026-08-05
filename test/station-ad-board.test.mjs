import test from 'node:test';
import assert from 'node:assert/strict';

import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import {
  AD_BOARD_PACK_ID,
  AD_BOARD_ROTATION_SECONDS,
  adBoardDeckSize,
  renderAdBoardNotice,
  selectAdBoardNotice,
} from '../src/ui/station/adBoard.js';

test('dockside selector consumes the authored deck deterministically without a berth fallback', () => {
  assert.equal(AD_BOARD_PACK_ID, 'ad_board');
  assert.equal(AD_BOARD_ROTATION_SECONDS, 90);
  assert.ok(adBoardDeckSize() >= 20);
  assert.equal(selectAdBoardNotice({ seed: 47, stationId: null, simTime: 0 }), null);

  const input = { seed: 0x56324c49, stationId: 'station_helios', simTime: 12 };
  const a = selectAdBoardNotice(input);
  const b = selectAdBoardNotice(input);
  assert.deepEqual(a, b);
  assert.ok(FLAVOR_PACKS.ad_board.entries.some((entry) => (
    entry.id === a.id && entry.sponsor === a.sponsor && entry.text === a.text
  )), 'selection must return an exact generated-corpus row');

  const ids = new Set();
  for (let i = 0; i < 12; i += 1) {
    ids.add(selectAdBoardNotice({ ...input, stationId: `station_probe_${i}` }).id);
  }
  assert.ok(ids.size >= 2, 'berth identity must diversify the authored deck');
});

test('Market ad-board renderer is quiet when undocked and avoids unchanged DOM writes', () => {
  const element = trackedElement();
  assert.equal(renderAdBoardNotice(element, { meta: { seed: 47 }, ui: {}, simTime: 0 }), null);
  assert.equal(element.hidden, true);
  assert.equal(element.writes, 3,
    'first empty render records its signature, hides the surface, and clears stale copy');

  const state = {
    meta: { seed: 47 },
    ui: { dockedStationId: 'station_helios' },
    simTime: 12,
  };
  const notice = renderAdBoardNotice(element, state);
  assert.ok(notice);
  assert.equal(element.hidden, false);
  assert.equal(element.dataset.adId, notice.id);
  assert.match(element.innerHTML, /Dockside notice/);
  assert.match(element.innerHTML, new RegExp(escapeRegExp(notice.sponsor)));
  assert.match(element.innerHTML, new RegExp(escapeRegExp(notice.text)));

  const writesAfterFirstNotice = element.writes;
  assert.deepEqual(renderAdBoardNotice(element, { ...state, simTime: 89 }), notice,
    'the same simulation-time bucket must retain the same notice');
  assert.equal(element.writes, writesAfterFirstNotice,
    'an unchanged station refresh may not mutate the ad-board DOM');

  const later = renderAdBoardNotice(element, { ...state, simTime: 90 });
  assert.equal(later.cycle, 1);
  assert.ok(element.writes > writesAfterFirstNotice,
    'crossing the documented simulation-time cadence must refresh the notice surface');
});

function trackedElement() {
  let hidden = false;
  let innerHTML = 'stale';
  let writes = 0;
  const datasetTarget = {};
  const dataset = new Proxy(datasetTarget, {
    set(target, property, value) {
      writes += 1;
      target[property] = value;
      return true;
    },
  });
  return {
    dataset,
    get hidden() { return hidden; },
    set hidden(value) { writes += 1; hidden = value; },
    get innerHTML() { return innerHTML; },
    set innerHTML(value) { writes += 1; innerHTML = value; },
    get writes() { return writes; },
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
