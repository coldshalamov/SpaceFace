import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluatePq020CeresTopology } from './lib/pq020CeresTopology.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receipt = await evaluatePq020CeresTopology();

if (process.argv.includes('--write')) {
  const outDir = path.join(rootDir, '.devshots', 'pq020-ceres-topology');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'headless-evidence.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8',
  );
}

if (!receipt.pass) {
  console.error(JSON.stringify({
    check: 'pq020-ceres-topology',
    status: 'FAIL',
    ...receipt,
  }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    check: 'pq020-ceres-topology',
    status: 'PASS',
    schema: receipt.schema,
    sectorId: receipt.sectorId,
    cathedral: receipt.cathedral,
    route: receipt.route,
    structuralCost: receipt.structuralCost,
    additiveWorldSites: receipt.additiveWorldSites,
    additiveDressing: receipt.additiveDressing,
    requiresHeaded: receipt.requiresHeaded,
    naturalJobs: receipt.naturalJobs,
    offscreenProjection: receipt.offscreenProjection,
    mechanicalCondition: receipt.mechanicalCondition,
    reentryIdempotence: receipt.reentryIdempotence,
    exactAgreement: receipt.exactAgreement,
    routing: receipt.routing,
    matchedBaseline: receipt.matchedBaseline,
    structuralCostDigest: receipt.structuralCostDigest,
    receiptDigest: receipt.receiptDigest,
  }));

  // Human-readable summary. The JSON above is the artifact; these lines are the rows a reviewer
  // reads first, including the ones that are deliberately NOT a pass.
  const jobs = receipt.naturalJobs;
  const condition = receipt.mechanicalCondition;
  const routing = receipt.routing;
  const additiveSiteSummary = (receipt.additiveWorldSites?.sites || []).map((site) => (
    `${site.siteId}: live == planned ${site.live.entities} entities`
    + ` (${site.live.byType.fx || 0} fx + ${site.live.byType.wreck || 0} wreck),`
    + ` ${site.live.collidable} collidable / ${site.live.colliders} colliders`
  )).join('; ');
  const additiveDressingSummary = (receipt.additiveDressing?.groups || []).map((group) => (
    `${group.id}: ${group.live.entities} entities`
    + ` (${group.live.byType.fx || 0} fx), ${group.live.collidable} collidable`
  )).join('; ');
  const lines = [
    `PQ-020 Ceres topology PASS — ${receipt.route.siteId} route ${receipt.route.totalDistance} WU`,
    `  additive World Sites: ${additiveSiteSummary}`,
    `  additive dressing: ${additiveDressingSummary}`,
    `  natural jobs (held-out seeds ${jobs.heldOutSeeds.join(', ')}, no injection):`,
    ...jobs.perSeed.map((row) => (
      `    seed ${row.seed}: roles ${JSON.stringify(row.withMetadata.trafficRoles)}`
      + ` -> jobs ${JSON.stringify(row.withMetadata.jobKinds)}`
      + ` (industrial share ${row.withMetadata.industrialShare};`
      + ` counterfactual without industries ${row.withoutMetadata.industrialShare})`
    )),
    `    aggregate jobs ${JSON.stringify(jobs.aggregateJobKinds)};`
      + ` ${jobs.seedsWithIndustrialJob}/${jobs.seedCount} seeds produced an industrial job`,
    `    lifecycle advancement NOT claimed here — owner: ${jobs.advancementClaim.owner}`,
    `  offscreen projection: deterministic=${receipt.offscreenProjection.allStable},`
      + ` metadata-sensitive=${receipt.offscreenProjection.allChangedByIndustries} (projected intent, not visible traffic)`,
    `  mechanical condition: ${condition.conditionType} bound=${condition.bound}`
      + ` observable=${condition.changesObservablePlayerDecision}`
      + ` counterplay=[${condition.counterplay.join('|')}]`
      + ` pocketDensityRatio=${condition.routeExposure.density.ratio}x`,
    `    lane-danger consumer fires at Ceres: ${condition.laneDangerConsumer.fires}`
      + ` (gate ${condition.laneDangerConsumer.gate}; sector security`
      + ` ${condition.laneDangerConsumer.sectorSecurity}/tier ${condition.laneDangerConsumer.sectorTier})`,
    `  idempotence: beacon materializes once=${receipt.reentryIdempotence.staticContentMaterializesExactlyOnce},`
      + ` save v${receipt.reentryIdempotence.envelopeVersion} Continue stable=${receipt.reentryIdempotence.topologyStableAcrossReentryAndContinue}`,
    `  exact agreement (dual-frame): allAgree=${receipt.exactAgreement.allAgree}`
      + ` over ${receipt.exactAgreement.rows.length} rows`,
    `  routing: generic Helios->Tethys = ${routing.generic.heliosToTethys.join(' -> ')}`
      + ` | traversesCeres=${routing.generic.traversesCeres}`,
    `    ${routing.generic.verdict}`,
    `    selected through-Ceres itinerary ${routing.throughCeresItinerary.totalDistanceWu} WU:`,
    ...routing.throughCeresItinerary.legs.map(
      (leg) => `      ${leg.fromLabel} -> ${leg.toLabel}: ${leg.distanceWu} WU`,
    ),
    `  matched baseline digest ${receipt.matchedBaseline.digest}`,
    '  headed rows (frame p95/p99/hitches, admission/residency, draw/program, close/default/far/'
      + 'motion/LOD) are null + requiresHeaded: blocked on the PQ-034 lease',
  ];
  console.log(lines.join('\n'));
}
