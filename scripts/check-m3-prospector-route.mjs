#!/usr/bin/env node
// M3 Prospector public-route timing gate.
// Proves authored origin + freestyle mine/sell continuation advance real route time through
// live missions/economy/cargo/fieldDepletion/careerOrigins/ships/save authorities, with
// repair + retry economics, Pelican 15k purchase timing, Beam M research gate, and 30/60/90 floors.

import {
  blockNondeterminism,
  restoreNondeterminism,
  measureProspectorPublicRouteHorizons,
  PROSPECTOR_HEALTHY_CR_PER_MIN,
  PROSPECTOR_ORIGIN_CLEAN_GROSS_ENVELOPE_CR,
  PROSPECTOR_PUBLIC_ROUTE_SCHEMA,
  CLAIMED_PELICAN_PURCHASE_MIN,
  PELICAN_PRICE_CR,
} from '../src/balance/prospectorPublicRoute.js';

blockNondeterminism();
let report;
try {
  report = measureProspectorPublicRouteHorizons({ includeRetryDelta: true });
} catch (err) {
  restoreNondeterminism();
  console.error('[check-m3-prospector-route] FAIL thrown:', err && err.stack || err);
  process.exit(1);
}
restoreNondeterminism();

console.log(`[check-m3-prospector-route] schema=${report.schema || PROSPECTOR_PUBLIC_ROUTE_SCHEMA}`);
console.log(`[check-m3-prospector-route] healthy floor ${PROSPECTOR_HEALTHY_CR_PER_MIN} cr/min; clean origin envelope ${PROSPECTOR_ORIGIN_CLEAN_GROSS_ENVELOPE_CR} cr; Pelican ${PELICAN_PRICE_CR} cr claimed@${CLAIMED_PELICAN_PURCHASE_MIN}m`);
console.log('minutes  simS  credits  earned  cr/min  contracts  loops  failed  repair  sales  pelicanMin  phase  origin  ok');
for (const row of report.table) {
  const pad = (v, n) => String(v).padStart(n);
  console.log(
    `${pad(row.minutes, 7)}  ${pad(row.simS, 4)}  ${pad(row.credits, 7)}  ${pad(row.earnedValue, 6)}  ${pad(row.creditsPerMin, 6)}  ${pad(row.completedContracts, 9)}  ${pad(row.completedLoops, 5)}  ${pad(row.failedContracts, 6)}  ${pad(row.repairCost, 6)}  ${pad(row.saleProceeds, 6)}  ${pad(row.pelicanAtMin == null ? '-' : row.pelicanAtMin, 10)}  ${pad(row.activePhase, 7)}  ${pad(row.originStatus, 9)}  ${row.ok}`,
  );
  if (!row.ok) {
    console.log('  fails:', (row.assertionFails || []).join('; '));
  }
  if (row.assertionWarns && row.assertionWarns.length) {
    console.log('  warns:', row.assertionWarns.join('; '));
  }
}

const cell30 = report.cells[30];
const cell90 = report.cells[90];
if (cell30) {
  console.log('[check-m3-prospector-route] origin haircuts:', JSON.stringify(cell30.origin.attemptHaircuts));
  console.log('[check-m3-prospector-route] save proof:', cell30.saveProof && cell30.saveProof.ok
    ? 'ok'
    : JSON.stringify(cell30.saveProof && { ok: cell30.saveProof.ok, error: cell30.saveProof.error }));
  console.log('[check-m3-prospector-route] authority sample:',
    (cell30.authorityReceipts || []).slice(0, 8).map((a) => a.kind).join(', '));
  console.log('[check-m3-prospector-route] missionProceeds:', cell30.missionProceeds,
    'saleProceeds:', cell30.saleProceeds,
    'cargoEvents:', cell30.cargoAuthorityEvents,
    'depletionEvents:', cell30.fieldDepletionEvents,
    'tollCost:', cell30.tollCost,
    'repairCost:', cell30.repairCost);
}
if (cell90) {
  console.log('[check-m3-prospector-route] pelican:', JSON.stringify(cell90.pelicanPurchase));
  console.log('[check-m3-prospector-route] beamM gate:', JSON.stringify(cell90.equipment.beamM));
  console.log('[check-m3-prospector-route] field rotations:', cell90.fieldRotations?.length || 0,
    'fieldFinal:', cell90.fieldFinal && cell90.fieldFinal.band);
  console.log('[check-m3-prospector-route] claimed parity:', JSON.stringify(cell90.claimedParity));
}
if (report.retryDelta) {
  console.log('[check-m3-prospector-route] retry delta:', JSON.stringify(report.retryDelta));
}

console.log(JSON.stringify({
  gate: 'check-m3-prospector-route',
  schema: report.schema,
  ok: report.ok,
  healthyFloorCrPerMin: report.healthyFloorCrPerMin,
  cleanGrossEnvelopeCr: report.cleanGrossEnvelopeCr,
  claimedPelicanPurchaseMin: report.claimedPelicanPurchaseMin,
  pelicanPriceCr: report.pelicanPriceCr,
  retryDelta: report.retryDelta,
  table: report.table,
}, null, 2));

if (!report.ok) {
  console.error('[check-m3-prospector-route] FAIL');
  process.exit(1);
}
console.log('[check-m3-prospector-route] PASS');
