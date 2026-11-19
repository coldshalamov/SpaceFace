import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  BASELINE_PATH,
  DEFAULT_SEEDS,
  TUNED_PATH,
  buildDisplacementTtkBaseline,
  stableStringify,
} from '../scripts/bench-displacement-ttk.mjs';
import { WEAPONS } from '../src/data/weapons.js';

// The checked-in tuned artifact was generated against the starter gun as it stood then (dmg 5, heat 8/12).
// R5 (2026-11-18) retuned the live gun, so the historical fixture carries its own explicit weapon profile
// instead of reading the live one. Applied in memory for the build only, then restored.
const HISTORICAL_STARTER_PROFILE = Object.freeze({ dmg: 5, dps: 27.5, heatPerShot: 8, heatDissip: 12 });
function withHistoricalStarterGun(fn) {
  const gun = WEAPONS.find((entry) => entry.id === 'wpn_pulse_laser_s');
  const saved = {};
  for (const key of Object.keys(HISTORICAL_STARTER_PROFILE)) saved[key] = gun[key];
  Object.assign(gun, HISTORICAL_STARTER_PROFILE);
  try { return fn(); } finally { Object.assign(gun, saved); }
}

function assertPinnedSchema(pinned, packet) {
  assert.equal(pinned.schemaVersion, 1);
  assert.equal(pinned.packet, packet);
  assert.deepEqual(pinned.environment.seedList, DEFAULT_SEEDS);
  assert.ok(pinned.environment.seedList.length >= 20);
  assert.equal(pinned.rows.length, DEFAULT_SEEDS.length * 2 * 2);
  assert.deepEqual(
    pinned.aggregates.map((row) => `${row.hullClass}:${row.tactic}`),
    ['light:GUNFIRE', 'light:DISPLACEMENT', 'medium:GUNFIRE', 'medium:DISPLACEMENT'],
  );
  assert.ok(pinned.baselineTable['light:GUNFIRE']);
  assert.ok(pinned.baselineTable['light:DISPLACEMENT']);
  assert.ok(pinned.baselineTable['medium:GUNFIRE']);
  assert.ok(pinned.baselineTable['medium:DISPLACEMENT']);
}

test('U11 control displacement-vs-TTK baseline is pinned historical control', () => {
  // Control is the pre-tuning artifact at the phase-1 pin. It is NOT regenerated against current
  // combat constants (tuning intentionally moves the harness numbers). Byte-stability is the
  // checked-in file itself; re-parse must round-trip through stableStringify of the parsed object
  // only for structural fields we care about via assertPinnedSchema.
  const pinnedText = readFileSync(BASELINE_PATH, 'utf8');
  const pinned = JSON.parse(pinnedText);
  assertPinnedSchema(pinned, 'U11-BASELINE');
  assert.equal(pinned.environment.generatedBy, 'scripts/bench-displacement-ttk.mjs');
  assert.equal(
    pinnedText,
    stableStringify(pinned),
    'control artifact must remain byte-stable under stableStringify round-trip',
  );
  // Directional pin: control light displacement is the slow non-competitive read this packet fixed.
  assert.ok(
    pinned.baselineTable['light:DISPLACEMENT'].medianTtkS
      > pinned.baselineTable['light:GUNFIRE'].medianTtkS * 1.5,
    'control light displacement remains the slow pre-tuning reference',
  );
});

test('U11 tuned displacement-vs-TTK artifact is pinned and regenerable', () => {
  const pinnedText = readFileSync(TUNED_PATH, 'utf8');
  const pinned = JSON.parse(pinnedText);
  assertPinnedSchema(pinned, 'U11-TUNED');

  const options = {
    sourceCommit: pinned.environment.sourceCommit,
    packet: 'U11-TUNED',
    title: pinned.title,
  };
  const first = stableStringify(withHistoricalStarterGun(() => buildDisplacementTtkBaseline(options)));
  const second = stableStringify(withHistoricalStarterGun(() => buildDisplacementTtkBaseline(options)));
  assert.equal(first, second, 'two generated tuned runs must be byte-identical');
  assert.equal(first, pinnedText, 'checked-in tuned artifact must match the deterministic harness output');
});
