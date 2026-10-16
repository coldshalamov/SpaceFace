// STORY-08 — a week with new history ends in one dockside digest line citing its biggest fact.
//
// Contract (deterministic, seed 4242, sim-time only):
//   1. Docking after seven-plus sim days (simTime >= 4200) with fresh chronicler facts raises
//      exactly one cited digest line naming the biggest fact (highest-score public story).
//   2. The same week docks once: after noteWeeklyDigestDocked the line goes silent.
//   3. A quiet week (no fresh facts) stays silent; old facts never replay — the next week with
//      new history cites the NEW fact id, never the old one.
//   4. No digest screen: buildDockArrival carries the line as `digest`/`digestLine` + one entry
//      in `lines`; early docks (< 7 days) stay silent.
//
// Run: node --test test/infer-story-08-digest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';
import { buildDockArrival, weeklyDigestLine, weeklyDigestSelection, noteWeeklyDigestDocked } from '../src/ui/dockArrival.js';

const SEED = 4242;
const WEEK_S = 4200;
const STATION = { id: 'station_helios', name: 'Helios Station', services: ['trade', 'repair', 'refuel'] };

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [chronicler] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  return { sim, state: sim.state, bus: sim.bus };
}

function setTime(state, t) {
  state.simTime = t;
  state.tick = Math.round(t * 60);
}

function step(t, ticks = 2) {
  for (let i = 0; i < ticks; i++) t.sim.step();
}

function freshFacts(state) {
  return state.chronicler.stories.flatMap((s) => s.nodes);
}

test('early dock before seven days stays silent even with fresh facts', () => {
  const t = boot();
  setTime(t.state, 100);
  t.bus.emit('distress:rescued', { distressId: 'pod_early', targetId: 'ship_early', name: 'Early Hauler' });
  step(t);
  assert.ok(freshFacts(t.state).length >= 1, 'the early fact lands in the ledger');
  const view = buildDockArrival(t.state, STATION);
  assert.equal(view.digest, null, 'no digest before seven-plus sim days');
  assert.equal(view.digestLine, null);
  assert.equal(weeklyDigestLine(t.state), null);
});

test('a week with new history ends in one cited digest line for the biggest fact, once per week', () => {
  const t = boot();
  setTime(t.state, WEEK_S + 100);
  // Small deed (trade, score ~8) and big deed (player rescue, score 48): biggest wins.
  t.bus.emit('economy:tradeCompleted', {
    side: 'sell', commodityId: 'cmdty_food', stationId: 'station_helios',
    qty: 5, total: 500, receiptId: 'trade_week1_small',
  });
  t.bus.emit('distress:rescued', { distressId: 'pod_week1_big', targetId: 'ship_week1_big', name: 'Weekone Hauler' });
  step(t);

  const selection = weeklyDigestSelection(t.state);
  assert.ok(selection, 'a selection exists for the fresh week');
  assert.ok(selection.factId, 'the selection cites a fact id');
  assert.equal(selection.week, 1, 'simTime 4300 is week index 1');

  const view = buildDockArrival(t.state, STATION);
  assert.ok(view.digest, 'docking raises one digest line');
  assert.equal(view.digest, view.digestLine, 'digest and digestLine agree');
  assert.match(view.digest, /^WEEKLY DIGEST: /, 'the line is a single digest line, not a screen');
  assert.ok(view.digest.includes(`[${selection.factId}]`), `the line cites the biggest fact: ${view.digest}`);
  assert.ok(view.digest.includes('Weekone Hauler'), `the line names the rescue, not the small sale: ${view.digest}`);
  assert.ok(view.lines.includes(view.digest), 'the line rides the dock lines');
  assert.equal(view.lines.filter((line) => String(line).startsWith('WEEKLY DIGEST:')).length, 1,
    'exactly one digest line per dock');
  // Deterministic repeat before consuming: the same dock reads the same line.
  assert.equal(buildDockArrival(t.state, STATION).digest, view.digest, 'the line is stable until consumed');

  const cited = noteWeeklyDigestDocked(t.state, selection);
  assert.equal(cited, selection.factId, 'consuming returns the cited fact id');
  assert.equal(weeklyDigestLine(t.state), null, 'the same week stays silent after the dock');
  assert.equal(buildDockArrival(t.state, STATION).digest, null, 'once per week: the second dock is silent');
});

test('a quiet week stays silent and the next week with history cites the new fact, never the old', () => {
  const t = boot();
  setTime(t.state, WEEK_S + 100);
  t.bus.emit('distress:rescued', { distressId: 'pod_w1', targetId: 'ship_w1', name: 'Firstweek Hauler' });
  step(t);
  const first = weeklyDigestSelection(t.state);
  assert.ok(first, 'week one has a digest');
  noteWeeklyDigestDocked(t.state, first);

  // Quiet week: advance past the week boundary with no new facts.
  setTime(t.state, 2 * WEEK_S + 300);
  step(t);
  assert.equal(weeklyDigestLine(t.state), null, 'silence on a quiet week');
  assert.equal(buildDockArrival(t.state, STATION).digest, null, 'the dock stays silent with no fresh facts');

  // New history next week: the digest returns citing the NEW fact only.
  t.bus.emit('distress:rescued', { distressId: 'pod_w2', targetId: 'ship_w2', name: 'Secondweek Hauler' });
  step(t);
  const second = weeklyDigestSelection(t.state);
  assert.ok(second, 'new history raises a digest again');
  assert.notEqual(second.factId, first.factId, 'old facts never replay: the citation is the new fact');
  const view = buildDockArrival(t.state, STATION);
  assert.ok(view.digest.includes(`[${second.factId}]`), `the line cites the new fact: ${view.digest}`);
  assert.ok(!view.digest.includes(`[${first.factId}]`), 'the old citation does not return');
  assert.ok(view.digest.includes('Secondweek Hauler'), `the line names the new deed: ${view.digest}`);
});
