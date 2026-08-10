import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  BASELINE_PATH,
  DEFAULT_SEEDS,
  buildDisplacementTtkBaseline,
  stableStringify,
} from '../scripts/bench-displacement-ttk.mjs';

test('U11 displacement-vs-TTK baseline is pinned and deterministic', () => {
  const pinnedText = readFileSync(BASELINE_PATH, 'utf8');
  const pinned = JSON.parse(pinnedText);

  assert.equal(pinned.schemaVersion, 1);
  assert.equal(pinned.packet, 'U11-BASELINE');
  assert.deepEqual(pinned.environment.seedList, DEFAULT_SEEDS);
  assert.ok(pinned.environment.seedList.length >= 20);
  assert.equal(pinned.rows.length, DEFAULT_SEEDS.length * 2 * 2);
  assert.deepEqual(
    pinned.aggregates.map((row) => `${row.hullClass}:${row.tactic}`),
    ['light:GUNFIRE', 'light:DISPLACEMENT', 'medium:GUNFIRE', 'medium:DISPLACEMENT'],
  );

  const options = { sourceCommit: pinned.environment.sourceCommit };
  const first = stableStringify(buildDisplacementTtkBaseline(options));
  const second = stableStringify(buildDisplacementTtkBaseline(options));
  assert.equal(first, second, 'two generated runs must be byte-identical');
  assert.equal(first, pinnedText, 'checked-in baseline must match the deterministic harness output');
});
