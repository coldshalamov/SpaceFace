import test from 'node:test';
import assert from 'node:assert/strict';
import { BARKS, BARK_FACTIONS, BARK_SITUATIONS, BARK_EVENT_SITUATIONS, barkFor } from '../src/data/barks.js';
import { BARK_SITUATION_FILL, BARK_CELL_MIN, topUpBarkSituationCells } from '../src/data/barkSituationFill.js';

// D254: the fill reservoir used to be capped at BARK_CELL_MIN=12 appends, leaving ~55 authored
// tail lines unreachable. The cap is gone — every line in BARK_SITUATION_FILL must land in the
// live merged cell, and no touched cell may end under the floor.

const SITUATION_KEYS = [...BARK_SITUATIONS, ...BARK_EVENT_SITUATIONS];

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
