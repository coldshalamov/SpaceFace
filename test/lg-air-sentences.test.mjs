// VERB-32 — a module on the fit screen says what the sim already does with it.
//
// The sentences are the words airSentenceForId prints. The numbers under them are the
// live module record and the live ping law, not a copy of the sentence table.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { effectiveAnomalyRequiredPings } from '../src/systems/scanner.js';
import { airSentenceForId } from '../src/ui/ship/fitReadout.js';

function mod(id) {
  return MODULES.find((row) => row.id === id);
}

test('seed 4242 every module says what it already does', () => {
  const missing = MODULES.filter((row) => typeof row.sentence !== 'string' || !row.sentence.trim() || row.sentence.includes('\n'));
  assert.deepEqual(missing.map((row) => row.id), []);

  const small = mod('mod_filter_stack_s');
  const heavy = mod('mod_filter_stack_m');
  assert.equal(small.mods.bioFilterMult, 0.35);
  assert.equal(heavy.mods.bioFilterMult, 0.20);
  assert.match(airSentenceForId(small.id), /fouls the hull more slowly/);
  assert.match(airSentenceForId(heavy.id), /much more slowly/);

  const notch = mod('unique_first_notch_marker');
  const suite = mod('mod_triangulation_suite_s');
  assert.equal(notch.mods.anomalyPingReduction, 2);
  assert.equal(suite.mods.anomalyPingReduction, 1);
  assert.equal(effectiveAnomalyRequiredPings(undefined, notch.mods.anomalyPingReduction), 2);
  assert.equal(
    effectiveAnomalyRequiredPings(undefined, notch.mods.anomalyPingReduction),
    effectiveAnomalyRequiredPings(undefined, suite.mods.anomalyPingReduction),
  );
  const notchLine = airSentenceForId(notch.id);
  assert.match(notchLine, /two scans/);
  assert.equal(/one scan/i.test(notchLine), false);

  const mask = mod('unique_double_entry_mask');
  const scrambler = mod('mod_sensor_scrambler_m');
  assert.ok(mask.mods.scannerCloak > scrambler.mods.scannerCloak);
  assert.ok(mask.mods.scanRangeMult > 1);
  assert.match(airSentenceForId(mask.id), /quieter than a stock scrambler/);

  assert.equal(mod('mod_quarantine_locker_s').mods.quarantineLocker, true);
  assert.match(airSentenceForId('mod_quarantine_locker_s'), /does not foul the hull/);
  assert.equal(mod('mod_precursor_handshake_s').mods.precursorHandshake, true);
  assert.match(airSentenceForId('mod_precursor_handshake_s'), /half the time/);
});
