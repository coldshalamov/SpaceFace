import test from 'node:test';
import assert from 'node:assert/strict';
import { BARKS, BARK_FACTIONS, BARK_SITUATIONS, BARK_EVENT_SITUATIONS, barkFor } from '../src/data/barks.js';
import { BARK_SITUATION_FILL, BARK_CELL_MIN, topUpBarkSituationCells } from '../src/data/barkSituationFill.js';

// D254: the fill reservoir used to be capped at BARK_CELL_MIN=12 appends, leaving ~55 authored
// tail lines unreachable. The cap is gone — every line in BARK_SITUATION_FILL must land in the
// live merged cell, and no touched cell may end under the floor.

const SITUATION_KEYS = [...BARK_SITUATIONS, ...BARK_EVENT_SITUATIONS];

test('the fill table holds no dead keys — every faction id and situation key is live', () => {
  // A fill cell under a misspelled faction or a non-live situation key is dead space of the
  // exact D254 class: authored, iterated by nobody, caught by no reachability count.
  for (const factionId of Object.keys(BARK_SITUATION_FILL)) {
    assert.ok(BARK_FACTIONS.includes(factionId), `fill faction '${factionId}' is not a live BARK_FACTIONS id`);
    for (const situation of Object.keys(BARK_SITUATION_FILL[factionId])) {
      assert.ok(SITUATION_KEYS.includes(situation), `fill key ${factionId}/${situation} is not a live situation`);
    }
  }
});

test('every fill line is reachable in the merged BARKS cell', () => {
  const unreachable = [];
  let fillLineCount = 0;
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    const fill = BARK_SITUATION_FILL[factionId];
    if (!pack || !fill) continue;
    for (const situation of SITUATION_KEYS) {
      const extra = fill[situation];
      const cell = pack[situation];
      if (!Array.isArray(extra) || extra.length === 0) continue;
      assert.ok(Array.isArray(cell), `${factionId}/${situation}: fill exists but no live cell`);
      for (const line of extra) {
        fillLineCount += 1;
        if (!cell.includes(line)) unreachable.push(`${factionId}/${situation}: ${line.slice(0, 40)}`);
      }
    }
  }
  assert.ok(fillLineCount > 0, 'fill corpus is non-empty (test is measuring real lines)');
  assert.deepEqual(unreachable, []);
});

test('no touched cell ends under the BARK_CELL_MIN floor', () => {
  // topUp is idempotent on the already-merged corpus — a second run appends nothing and
  // reports only cells that remain under the floor after all fill is consumed.
  const underFloor = topUpBarkSituationCells(BARKS, BARK_FACTIONS, BARK_SITUATIONS, BARK_EVENT_SITUATIONS);
  assert.deepEqual(underFloor, []);
});

test('every live cell meets the floor directly — not just via the mutator report', () => {
  // The floor contract belongs to the corpus itself, so assert it straight off BARKS for
  // every faction × situation rather than trusting the mutator's own report.
  const under = [];
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    assert.ok(pack, `${factionId} missing from BARKS`);
    for (const situation of SITUATION_KEYS) {
      const cell = pack[situation];
      if (Array.isArray(cell) && cell.length > 0 && cell.length < BARK_CELL_MIN) {
        under.push(`${factionId}/${situation} (${cell.length})`);
      }
    }
  }
  assert.deepEqual(under, []);
});

test('deep cell indices past the old cap resolve to authored lines', () => {
  // A cell longer than the old 12-cap proves its tail is live; barkFor must return the exact
  // line at every index, including the former dead zone.
  let deepCells = 0;
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    const fill = BARK_SITUATION_FILL[factionId];
    if (!pack || !fill) continue;
    for (const situation of SITUATION_KEYS) {
      const cell = pack[situation];
      if (!Array.isArray(fill[situation]) || !Array.isArray(cell) || cell.length <= BARK_CELL_MIN) continue;
      deepCells += 1;
      for (let i = 0; i < cell.length; i += 1) {
        assert.equal(barkFor(factionId, situation, i), cell[i], `${factionId}/${situation}[${i}] not selectable`);
      }
    }
  }
  assert.ok(deepCells > 0, 'expected merged cells deeper than the old cap');
});
