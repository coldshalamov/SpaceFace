// PULSE-08 — "Faction barks vary by situation": every faction × situation cell
// carries at least 12 distinct speakable lines. Situations are the union of the
// wav-index contract (BARK_SITUATIONS) and event situations (BARK_EVENT_SITUATIONS);
// both are guaranteed coverage per faction.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARKS,
  BARK_EVENT_SITUATIONS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
} from '../src/data/barks.js';

const ALL_SITUATIONS = [...BARK_SITUATIONS, ...BARK_EVENT_SITUATIONS];
const MIN_VARIANTS = 12;

test('PULSE-08: every faction × situation cell has ≥12 distinct lines', () => {
  assert.ok(BARK_FACTIONS.length > 0);
  assert.ok(ALL_SITUATIONS.length > 0);
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    assert.ok(pack, `BARKS missing faction ${factionId}`);
    for (const situation of ALL_SITUATIONS) {
      const cell = pack[situation];
      assert.ok(
        Array.isArray(cell),
        `${factionId}.${situation} is not an array`,
      );
      assert.ok(
        cell.length >= MIN_VARIANTS,
        `${factionId}.${situation} has ${cell.length} lines (<${MIN_VARIANTS})`,
      );
      const seen = new Set();
      for (const line of cell) {
        assert.equal(typeof line, 'string', `${factionId}.${situation} non-string line`);
        assert.ok(line.length > 0, `${factionId}.${situation} empty line`);
        assert.ok(!seen.has(line), `${factionId}.${situation} duplicate line: ${line}`);
        seen.add(line);
      }
    }
  }
});
