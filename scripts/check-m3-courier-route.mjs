#!/usr/bin/env node
// M3 Courier public-route timing gate.
// Proves authored hauler/courier origin + board/freight continuation advance real route time
// through live missions/economy/cargo/careerOrigins/save authorities, with repair + retry
// economics, market causality, and healthy 30/60/90 cr/min floors.

import {
  blockNondeterminism,
  restoreNondeterminism,
  measureCourierPublicRouteHorizons,
  COURIER_HEALTHY_CR_PER_MIN,
  COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
  COURIER_PUBLIC_ROUTE_SCHEMA,
} from '../src/balance/courierPublicRoute.js';

blockNondeterminism();
let report;
try {
  report = measureCourierPublicRouteHorizons();
} catch (err) {
  restoreNondeterminism();
  console.error('[check-m3-courier-route] FAIL thrown:', err && err.stack || err);
  process.exit(1);
}
restoreNondeterminism();

console.log(`[check-m3-courier-route] schema=${report.schema || COURIER_PUBLIC_ROUTE_SCHEMA}`);
console.log(`[check-m3-courier-route] healthy floor ${COURIER_HEALTHY_CR_PER_MIN} cr/min; clean origin envelope ${COURIER_ORIGIN_CLEAN_GROSS_ENVELOPE_CR} cr`);
console.log('minutes  credits  earned  cr/min  cohortx  shipReady  simS  contracts  failed  repair  origin  ok');
for (const row of report.table) {
  const pad = (v, n) => String(v).padStart(n);
  console.log(
    `${pad(row.minutes, 7)}  ${pad(row.credits, 7)}  ${pad(row.earnedValue, 6)}  ${pad(row.creditsPerMin, 6)}  ${pad(row.cohortRatio, 7)}  ${pad(row.firstShipReadyMin ?? '-', 9)}  ${pad(row.simS, 4)}  ${pad(row.completedContracts, 9)}  ${pad(row.failedContracts, 6)}  ${pad(row.repairCost, 6)}  ${pad(row.originStatus, 9)}  ${row.ok}`,
  );
  if (!row.ok) {
    console.log('  fails:', (row.assertionFails || []).join('; '));
  }
  if (row.assertionWarns && row.assertionWarns.length) console.log('  warns:', row.assertionWarns.join('; '));
}
console.log('[check-m3-courier-route] deterministic receipt:', report.determinism.ok
  ? 'ok'
  : report.determinism.mismatch);

const cell30 = report.cells[30];
if (cell30) {
  console.log('[check-m3-courier-route] origin haircuts:', JSON.stringify(cell30.origin.attemptHaircuts));
  console.log('[check-m3-courier-route] save proof:', cell30.saveProof && cell30.saveProof.ok
    ? 'ok'
    : JSON.stringify(cell30.saveProof && { ok: cell30.saveProof.ok, error: cell30.saveProof.error }));
  console.log('[check-m3-courier-route] authority sample:',
    (cell30.authorityReceipts || []).slice(0, 6).map((a) => a.kind).join(', '));
  console.log('[check-m3-courier-route] missionProceeds:', cell30.missionProceeds,
    'saleProceeds:', cell30.saleProceeds,
    'cargoEvents:', cell30.cargoAuthorityEvents,
    'tollCost:', cell30.tollCost);
}
if (report.retryDelta) {
  console.log('[check-m3-courier-route] retry delta:', JSON.stringify(report.retryDelta));
}

console.log(JSON.stringify({
  gate: 'check-m3-courier-route',
  schema: report.schema,
  ok: report.ok,
  healthyFloorCrPerMin: report.healthyFloorCrPerMin,
  cleanGrossEnvelopeCr: report.cleanGrossEnvelopeCr,
  retryDelta: report.retryDelta,
  determinism: report.determinism,
  table: report.table,
}, null, 2));

if (!report.ok) {
  console.error('[check-m3-courier-route] FAIL');
  process.exit(1);
}
console.log('[check-m3-courier-route] PASS');
