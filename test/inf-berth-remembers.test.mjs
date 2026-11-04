// inf-berth-remembers — the berth keeper remembers your last visit.
//
// The stamps live on the persisted market-memory station row, written by economy only for a
// physical dock (null-source observation). Surveys and uplink refreshes are knowledge, never
// presence. Re-stamps inside one sim day are the same berthing and must not mint a phantom
// prior visit. The dock card words the memory through berthVisitLine.
import assert from 'node:assert/strict';
import test from 'node:test';

import { berthVisitLine } from '../src/ui/dockArrival.js';
import { economy } from '../src/systems/economy.js';

const DAY = 600; // one sim day, same window economy stamps against

function dockState(simTime, stations = {}) {
  return {
    player: {},
    simTime,
    economy: { markets: stations },
  };
}

function recordAt(state, stationId, snapshot, options) {
  return economy.recordMarketMemory.call({ state }, stationId, snapshot, options);
}

test('a physical dock stamps the visit; a second visit keeps the prior stamp', () => {
  const state = dockState(100, { 'st-1': { ore: { buy: 10, sell: 4 } } });
  recordAt(state, 'st-1');
  const memory = state.player.marketMemory['st-1'];
  assert.equal(memory.visitedAt, 100, 'the first berthing stamps the arrival');
  assert.equal(memory.priorVisitAt, undefined, 'a first visit has no prior visit to remember');

  recordAt(state, 'st-1'); // re-opened market screen, same berthing
  assert.equal(state.player.marketMemory['st-1'].visitedAt, 100, 'the arrival stamp holds');
  assert.equal(state.player.marketMemory['st-1'].priorVisitAt, undefined);

  state.simTime = 100 + 2 * DAY; // fly away, come back two days later
  recordAt(state, 'st-1');
  const returned = state.player.marketMemory['st-1'];
  assert.equal(returned.priorVisitAt, 100, 'the keeper kept the prior visit');
  assert.equal(returned.visitedAt, 100 + 2 * DAY, 'the new visit is stamped');
});

test('survey packets and uplink refreshes are knowledge, never presence', () => {
  const state = dockState(50, { 'st-2': { ore: { buy: 9, sell: 3 } } });
  recordAt(state, 'st-2', null, { source: 'survey' });
  recordAt(state, 'st-2', null, { source: 'uplink' });
  const memory = state.player.marketMemory['st-2'];
  assert.equal(memory.visitedAt, undefined, 'no hull ever berthed here');
  assert.equal(memory.priorVisitAt, undefined);
  assert.ok(memory.ore, 'the quote knowledge itself is still recorded');
});

test('the same-visit window keeps the arrival stamp through a docked day-tick', () => {
  const state = dockState(DAY * 0.9, { 'st-3': { ore: { buy: 8, sell: 2 } } });
  recordAt(state, 'st-3');
  state.simTime = DAY * 0.95; // still the same berthing, later snapshot
  recordAt(state, 'st-3');
  const memory = state.player.marketMemory['st-3'];
  assert.equal(memory.visitedAt, DAY * 0.9);
  assert.equal(memory.priorVisitAt, undefined, 'no phantom prior visit inside one visit');
});

test('the dock card names the gap in days; quiet berths stay quiet', () => {
  const at = (prior, now) => berthVisitLine({ player: { marketMemory: { s: { priorVisitAt: prior } } }, simTime: now }, 's');
  assert.equal(at(100, 100 + 3 * DAY + 10), 'The berth keeper nods — 3 days since your last visit.');
  assert.equal(at(100, 100 + DAY + 5), 'The berth keeper nods — you were here yesterday.');
  assert.equal(at(100, 100 + DAY - 30), null, 'a same-day return is not an event');
  assert.equal(at(undefined, 100 + 9 * DAY), null, 'never visited before: nothing to remember');
  assert.equal(berthVisitLine({ player: {}, simTime: 100 }, 's'), null);
  assert.equal(berthVisitLine(null, 's'), null);
});

test('the memory survives a save round-trip as plain persisted keys', () => {
  const state = dockState(10, { 'st-4': { ore: { buy: 7, sell: 1 } } });
  recordAt(state, 'st-4');
  state.simTime = 10 + 2 * DAY;
  recordAt(state, 'st-4');
  const reloaded = JSON.parse(JSON.stringify(state.player)); // the save's whole-object round-trip
  const memory = reloaded.marketMemory['st-4'];
  assert.equal(memory.visitedAt, 10 + 2 * DAY);
  assert.equal(memory.priorVisitAt, 10);
  assert.equal(
    berthVisitLine({ player: reloaded, simTime: 10 + 2 * DAY }, 'st-4'),
    'The berth keeper nods — 2 days since your last visit.',
    'a reload keeps the recognition at the arrival moment',
  );
});
