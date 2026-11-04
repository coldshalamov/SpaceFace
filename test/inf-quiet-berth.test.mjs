// inf-quiet-berth — the empty state tells its tiny story.
//
// A berth with no news, no traffic, no deed and no rumor carries one true quiet line: whether
// the boards have moved since you last read them, and how long ago that was. The predicate is
// the persisted market memory against the docked station's own quotes — never invented
// movement, and a station you have never priced stays wordless.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDockArrival, quietBerthLine } from '../src/ui/dockArrival.js';

const DAY = 600; // one sim day, same window the dock card speaks in

function stateAt(simTime, memory, live) {
  return {
    player: { heat: 0, cargo: { usedVolume: 0, items: {} }, marketMemory: memory },
    missions: { active: [] },
    simTime,
    economy: { markets: live },
  };
}

const HELIOS = { id: 'station_helios', name: 'Helios Station', services: ['trade', 'repair', 'refuel'] };

test('a quiet revisited berth says whether the boards moved, and how long ago', () => {
  const memory = { 'station_helios': { ore: { buy: 10, sell: 4, seenAt: DAY } } };
  const live = { 'station_helios': { ore: { buy: 10, sell: 4 } } };
  const still = quietBerthLine(stateAt(DAY * 4, memory, live), 'station_helios');
  assert.equal(still, 'Quiet berth — the boards have not moved since you last read them, 3 days ago.');
  const creeped = quietBerthLine(
    stateAt(DAY * 4, memory, { 'station_helios': { ore: { buy: 12, sell: 4 } } }),
    'station_helios',
  );
  assert.equal(creeped, 'Quiet berth — prices have crept since you last read these boards, 3 days ago.');
});

test('a same-day quiet berth stays day-quiet in its wording', () => {
  const memory = { 'station_helios': { ore: { buy: 10, sell: 4, seenAt: 2 * DAY } } };
  const live = { 'station_helios': { ore: { buy: 11, sell: 5 } } };
  const line = quietBerthLine(stateAt(2 * DAY + 90, memory, live), 'station_helios');
  assert.equal(line, 'Quiet berth — prices have crept since you last read these boards.');
});

test('a station you have never priced stays wordless, and a busy berth never speaks it', () => {
  assert.equal(quietBerthLine(stateAt(DAY, {}, { 'station_helios': { ore: { buy: 1, sell: 1 } } }), 'station_helios'), null);
  const state = stateAt(DAY, { 'station_helios': { ore: { buy: 10, sell: 4, seenAt: 0 } } }, { 'station_helios': { ore: { buy: 10, sell: 4 } } });
  const quiet = buildDockArrival(state, HELIOS);
  assert.equal(quiet.news, null, 'no news: the berth is genuinely quiet');
  assert.match(quiet.quietLine, /Quiet berth/);
  assert.ok(quiet.lines.some((line) => line.startsWith('Quiet berth')), 'the story rides the card');

  const loud = stateAt(DAY, { 'station_helios': { ore: { buy: 10, sell: 4, seenAt: 0 } } }, { 'station_helios': { ore: { buy: 10, sell: 4 } } });
  loud.ui = { marketNews: { log: [{ stationId: 'station_helios', text: 'Helios fuel deliveries are late.' }], lastCard: null } };
  const busy = buildDockArrival(loud, HELIOS);
  assert.equal(busy.quietLine, null, 'a berth with news does not speak the quiet line');
  assert.ok(!busy.lines.some((line) => line.startsWith('Quiet berth')));
});

test('the quiet read is pure and survives a save round-trip', () => {
  const memory = { 'station_helios': { ore: { buy: 10, sell: 4, seenAt: DAY } } };
  const live = { 'station_helios': { ore: { buy: 10, sell: 4 } } };
  const state = stateAt(DAY * 2, memory, live);
  const before = structuredClone(state);
  const first = quietBerthLine(state, 'station_helios');
  assert.deepEqual(state, before);
  assert.deepEqual(first, buildDockArrival(state, HELIOS).quietLine);
  const reloaded = JSON.parse(JSON.stringify(state.player));
  assert.equal(
    quietBerthLine({ ...state, player: reloaded }, 'station_helios'),
    first,
    'the persisted memory words the same story after a reload',
  );
});
