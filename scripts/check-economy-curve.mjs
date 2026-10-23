#!/usr/bin/env node
// PQ-155.01 — headless ten-hour economy curve gate.
//
// Prints net worth, verbs unlocked, and sinks per hour for hunter / trader / miner.
// Asserts the committed ladder in src/data/techVerbLadder.js. Seed 15510.
// Economy-time accounting, not a Rapier sim. No headed Chromium.

import {
  formatEconomyCurveReport,
  runEconomyCurveCheck,
} from '../src/systems/economy.js';
import {
  hourVerbCurveGaps,
  LATE_HOUR_VERBS,
} from '../src/data/techVerbLadder.js';

const check = runEconomyCurveCheck({ seed: 15510 });
const report = formatEconomyCurveReport(check.result);
console.log(report);

// AL-LG-12. The economy sim above stays the ten-hour seed-15510 gate.
// Hours 11–15 are authored (seed 4242 does not reshuffle them).
const verbGaps = hourVerbCurveGaps();
if (verbGaps.length) {
  console.error('');
  console.error('hour verb curve through 15 FAILED');
  for (const gap of verbGaps) console.error(`  - ${gap}`);
}
console.log(`hour verb curve 11-15: ${LATE_HOUR_VERBS.map((row) => `${row.hour} ${row.label}`).join(' · ')}`);

if (!check.ok || verbGaps.length) {
  console.error('');
  console.error('check:economy:curve FAILED');
  for (const error of check.errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('check:economy:curve OK');
process.exit(0);
