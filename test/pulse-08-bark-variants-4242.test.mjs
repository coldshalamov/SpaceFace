// PULSE-08 — every faction × situation cell has at least 12 lines the live selector can say.
// Seed 4242. Index 0 of Concord scan stays the line that already shipped.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARKS,
  BARK_EVENT_SITUATIONS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
  barkFor,
} from '../src/data/barks.js';
import { makeStream } from '../src/core/rng.js';

const CONCORD_SCAN_0 = 'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.';

test('seed 4242: barkFor speaks from a pack of at least 12 lines in every cell', () => {
  assert.equal(BARKS.faction_scn.scan[0], CONCORD_SCAN_0);
  assert.equal(barkFor('faction_scn', 'scan', 0), CONCORD_SCAN_0);
  assert.equal(BARK_SITUATIONS.length, 8, 'situations stay the wav index contract');
  const situations = [...BARK_SITUATIONS, ...BARK_EVENT_SITUATIONS];
  for (const factionId of BARK_FACTIONS) {
    for (const situation of situations) {
      const cell = BARKS[factionId][situation];
      assert.ok(Array.isArray(cell) && cell.length >= 12,
        `${factionId} ${situation} has ${cell ? cell.length : 0} lines`);
      const heard = new Set();
      for (let i = 0; i < 12; i++) {
        const line = barkFor(factionId, situation, i);
        assert.equal(line, cell[i], `${factionId} ${situation} index ${i} left the pack`);
        assert.ok(line.length > 0);
        heard.add(line);
      }
      assert.equal(heard.size, 12, `${factionId} ${situation} repeats inside the first 12`);
      const rng = makeStream(4242, `pulse-08:${factionId}:${situation}`);
      const spoken = barkFor(factionId, situation, rng);
      assert.ok(cell.includes(spoken), `${factionId} ${situation} seed 4242 left the pack: ${spoken}`);
    }
  }
});
