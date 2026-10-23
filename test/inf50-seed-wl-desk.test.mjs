// Standing clients: progress on the board, a numbered relief run, tow/bulk/salvage,
// one varied axis after the third cycle, and a display name that leaves the desk id alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32 } from '../src/core/rng.js';
import {
  noteStandingOrderCompletion, syncCaptainStandingOrders, standingOrderProgressLines,
  reliefOfferShape, deskClientName, STANDING_CLIENT_TYPES,
} from '../src/systems/captainStandingOrders.js';
import { contractAcceptHoldNote } from '../src/ui/station/screens/contracts.js';
import { stampDestinationRail, STATION_HELP } from '../src/ui/station/stationApp.js';

const SEED = 4242;
const STATION = 'station_helios';

function host(extra = {}) {
  return {
    state: {
      simTime: 0,
      rng: { seed: SEED },
      traffic: { captainRoster: [] },
      missions: { standingOrders: [], captainOrderCycles: {}, active: [], receipts: [] },
      ...extra,
    },
  };
}

function finish(state, type, n, start = 0) {
  for (let i = 0; i < n; i++) {
    noteStandingOrderCompletion(state, {
      id: `${type}-${start + i}`, stationId: STATION, type, source: 'economyContract',
      reward_cr: 200, factionId: 'faction_mts', params: { taskTime: 10 },
    });
  }
}

test('seed 4242: tow, bulk and salvage each pin a standing client at three, and not before', () => {
  assert.equal(STANDING_CLIENT_TYPES.includes('tow_recovery'), true);
  assert.equal(STANDING_CLIENT_TYPES.includes('bulk_trade'), true);
  assert.equal(STANDING_CLIENT_TYPES.includes('salvage_retrieval'), true);
  for (const type of ['tow_recovery', 'bulk_trade', 'salvage_retrieval']) {
    const h = host();
    finish(h.state, type, 2);
    assert.deepEqual(standingOrderProgressLines(h.state, STATION), [`2 of 3 ${type.replaceAll('_', ' ')}`]);
    const early = { slots: [] };
    syncCaptainStandingOrders(h, { id: STATION, name: 'Helios', factionId: 'faction_mts' }, early);
    assert.equal(early.slots.length, 0);
    finish(h.state, type, 1, 2);
    assert.deepEqual(standingOrderProgressLines(h.state, STATION), []);
    const board = { slots: [] };
    assert.equal(syncCaptainStandingOrders(h, { id: STATION, name: 'Helios', factionId: 'faction_mts' }, board), true);
    const offer = board.slots.find((row) => row.type === type);
    assert.ok(offer);
    assert.equal(offer.giverId, `desk:${STATION}:${type}`);
    assert.equal(offer.clientId, offer.giverId);
    assert.equal(offer.title.includes(deskClientName(STATION, type)), true);
    assert.equal(offer.cause.tag, 'standing_client');
  }
});

test('seed 4242: a rescued captain counts the run, then changes exactly one axis', () => {
  const captain = {
    id: 'cap-4242', name: 'Mira Holt', alive: true,
    outcomes: { rescued: 1 }, homeStationId: STATION,
  };
  function offerAt(cycle) {
    const h = host();
    h.state.traffic.captainRoster = [captain];
    h.state.missions.captainOrderCycles = { [captain.id]: { cycle, dueAtS: 0 } };
    const board = { slots: [] };
    syncCaptainStandingOrders(h, { id: STATION, name: 'Helios', factionId: 'faction_mts' }, board);
    return board.slots.find((row) => row.giverId === captain.id);
  }
  const first = offerAt(0);
  const second = offerAt(1);
  assert.equal(first.title, 'Mira Holt — standing relief run');
  assert.equal(second.title, first.title);
  assert.equal(first.params.cmdtyId, 'cmdty_food');
  assert.equal(first.reward_cr, 360);
  assert.equal(second.params.cmdtyId, first.params.cmdtyId);
  assert.equal(second.reward_cr, first.reward_cr);
  assert.equal(second.destStationId, first.destStationId);
  const numbered = offerAt(2);
  assert.equal(numbered.title, 'Mira Holt — standing relief run #2');
  assert.equal(numbered.params.cmdtyId, 'cmdty_food');
  assert.equal(numbered.reward_cr, 360);
  assert.equal(numbered.destStationId, first.destStationId);
  const later = offerAt(4);
  assert.match(later.title, /#4$/);
  const shape = reliefOfferShape(captain.id, 4, STATION);
  const diffs = [
    later.params.cmdtyId !== first.params.cmdtyId,
    later.reward_cr !== first.reward_cr,
    later.destStationId !== first.destStationId,
  ].filter(Boolean);
  assert.equal(diffs.length, 1);
  assert.equal(later.params.cmdtyId, shape.cmdtyId);
  assert.equal(later.reward_cr, shape.reward_cr);
  assert.equal(later.destStationId, shape.dest.id);
  assert.equal(hash32(captain.id, 4) % 3 >= 0, true);
});

test('seed 4242: the accept key says hold before the first trade, and the rail speaks every help line', () => {
  const fresh = { missions: { active: [], receipts: [] } };
  assert.equal(contractAcceptHoldNote(fresh, 0), 'hold');
  assert.equal(contractAcceptHoldNote(fresh, 40), 'hold');
  const cold = { missions: { active: [{ id: 'c', storyTag: 'campaign47a:b0:recovery' }], receipts: [] } };
  assert.equal(contractAcceptHoldNote(cold, 0), 'hold');
  const coldDone = { missions: { active: [], receipts: [{ storyTag: 'campaign47a:b0:recovery' }] } };
  assert.equal(contractAcceptHoldNote(coldDone, 0), 'hold');
  const flown = { missions: { active: [{ id: 'm' }], receipts: [] } };
  assert.equal(contractAcceptHoldNote(flown, 0), '');
  assert.equal(contractAcceptHoldNote(flown, 40), 'hold');
  const ids = Object.keys(STATION_HELP);
  assert.equal(ids.length, 7);
  const tiles = new Map();
  const dock = {
    querySelector(sel) {
      const id = /data-nav="([^"]+)"/.exec(sel)?.[1];
      return tiles.get(id) || null;
    },
  };
  for (const id of ids) {
    const tile = {
      attrs: {},
      children: [],
      ownerDocument: { createElement: () => ({ className: '', textContent: '' }) },
      getAttribute(name) { return this.attrs[name] ?? null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      querySelector() { return this.children[0] || null; },
      appendChild(child) { this.children.push(child); return child; },
    };
    tiles.set(id, tile);
  }
  const stamped = stampDestinationRail(dock);
  assert.equal(stamped.length, 7);
  for (const row of stamped) {
    const tile = tiles.get(row.id);
    assert.equal(row.line, STATION_HELP[row.id][1]);
    assert.equal(tile.getAttribute('aria-label').includes(row.line), true);
    assert.equal(tile.children[0].textContent, row.line);
  }
});
