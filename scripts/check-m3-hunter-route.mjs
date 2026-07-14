#!/usr/bin/env node
// M3 Hunter public-route timing gate.
// Proves authored origin + board continuation advance real route time through live
// missions/economy/careerOrigins/save authorities, with repair + retry economics,
// and healthy 30/60/90 cr/min floors.

import {
  blockNondeterminism,
  restoreNondeterminism,
  measureHunterPublicRouteHorizons,
  HUNTER_HEALTHY_CR_PER_MIN,
  HUNTER_PUBLIC_ROUTE_SCHEMA,
} from '../src/balance/hunterPublicRoute.js';
import { HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR } from '../src/careers/origins/careerOriginContracts.js';

blockNondeterminism();
let report;
try {
  report = measureHunterPublicRouteHorizons();
} catch (err) {
  restoreNondeterminism();
  console.error('[check-m3-hunter-route] FAIL thrown:', err && err.stack || err);
  process.exit(1);
}
restoreNondeterminism();

console.log(`[check-m3-hunter-route] schema=${report.schema || HUNTER_PUBLIC_ROUTE_SCHEMA}`);
console.log(`[check-m3-hunter-route] healthy floor ${HUNTER_HEALTHY_CR_PER_MIN} cr/min; clean origin envelope ${HUNTER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR} cr`);
console.log('minutes  simS  credits  mission  earned  cr/min  contracts  failed  repair  toll  origin  ok');
for (const row of report.table) {
  const pad = (v, n) => String(v).padStart(n);
  console.log(
    `${pad(row.minutes, 7)}  ${pad(row.simS, 4)}  ${pad(row.credits, 7)}  ${pad(row.missionProceeds, 7)}  ${pad(row.earnedValue, 6)}  ${pad(row.creditsPerMin, 6)}  ${pad(row.completedContracts, 9)}  ${pad(row.failedContracts, 6)}  ${pad(row.repairCost, 6)}  ${pad(row.tollCost, 5)}  ${pad(row.originStatus, 9)}  ${row.ok}`,
  );
  if (!row.ok) {
    console.log('  fails:', (row.assertionFails || []).join('; '));
  }
}

const cell30 = report.cells[30];
if (cell30) {
  console.log('[check-m3-hunter-route] origin haircuts:', JSON.stringify(cell30.origin.attemptHaircuts));
  console.log('[check-m3-hunter-route] save proof:', cell30.saveProof && cell30.saveProof.ok
    ? 'ok'
    : JSON.stringify(cell30.saveProof && { ok: cell30.saveProof.ok, error: cell30.saveProof.error }));
  console.log('[check-m3-hunter-route] authority sample:',
    (cell30.authorityReceipts || []).slice(0, 4).map((a) => a.kind).join(', '));
}

console.log(JSON.stringify({
  gate: 'check-m3-hunter-route',
  schema: report.schema,
  ok: report.ok,
  healthyFloorCrPerMin: report.healthyFloorCrPerMin,
  table: report.table,
}, null, 2));

if (!report.ok) {
  console.error('[check-m3-hunter-route] FAIL');
  process.exit(1);
}
console.log('[check-m3-hunter-route] PASS');
