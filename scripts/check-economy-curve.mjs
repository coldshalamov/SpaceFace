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

const check = runEconomyCurveCheck({ seed: 15510 });
const report = formatEconomyCurveReport(check.result);
console.log(report);

if (!check.ok) {
  console.error('');
  console.error('check:economy:curve FAILED');
  for (const error of check.errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('check:economy:curve OK');
process.exit(0);
