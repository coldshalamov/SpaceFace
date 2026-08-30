import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPq020CeresTopologySnapshot,
  evaluatePq020CeresTopology,
  validatePq020CeresTopologySnapshot,
} from '../scripts/lib/pq020CeresTopology.mjs';

const SITE_ID = 'world_site_wreck_cathedral';
const PLACE_ID = 'place_landmark_wreck_cathedral';
const EXPECTED_STRUCTURAL_COST_DIGEST =
  'b54ce38b7ee7e37cd08a81a9de2fe15499dd8833b545be618263a1ac8d9b120d';

function pocket(receipt, id) {
  const value = receipt.topology.pockets.find((candidate) => candidate.id === id);
  assert.ok(value, `missing ${id} pocket`);
  return value;
}

test('PQ-020 authors four separated Ceres pockets around the immutable Cathedral reservation', async () => {
  const receipt = await evaluatePq020CeresTopology();

  assert.equal(receipt.pass, true, receipt.failures.join('\n'));
  assert.equal(receipt.sectorId, 'sector_ceres_belt');
  assert.equal(receipt.cathedral.siteId, SITE_ID);
  assert.equal(receipt.cathedral.placeId, PLACE_ID);
  assert.deepEqual(receipt.cathedral.local, { x: 300, z: 2700 });
  assert.deepEqual(receipt.cathedral.global, { x: -11988, z: 10892 });
  assert.equal(receipt.cathedral.reservationRadius, 620);
  assert.equal(receipt.cathedral.coordinateReservation.pass, true);

  assert.deepEqual(pocket(receipt, 'civic'), {
    id: 'civic',
    sourceId: 'station_ceres',
    center: { x: -1100, z: 620 },
    radius: 720,
  });
  assert.deepEqual(pocket(receipt, 'production'), {
    id: 'production',
    sourceId: 'zone_ceres_belt',
    center: { x: 500, z: -700 },
    radius: 850,
  });
  assert.deepEqual(pocket(receipt, 'transit'), {
    id: 'transit',
    sourceId: 'zone_ceres_throughline',
    center: { x: 3155, z: -955 },
    radius: 500,
  });
  assert.deepEqual(pocket(receipt, 'cathedral'), {
    id: 'cathedral',
    sourceId: SITE_ID,
    center: { x: 300, z: 2700 },
    radius: 620,
  });

  assert.equal(receipt.topology.overlaps.length, 6);
  for (const row of receipt.topology.overlaps) {
    assert.ok(Number.isFinite(row.clearance), `${row.pair} clearance must be finite`);
    assert.ok(row.clearance >= 0, `${row.pair} overlaps by ${-row.clearance} WU`);
  }
  assert.ok(receipt.topology.minimumBoundaryClearance >= 0);

  assert.equal(receipt.route.siteId, SITE_ID);
  assert.equal(receipt.route.legs.length, 3);
  for (const leg of receipt.route.legs) {
    assert.notDeepEqual(leg.start, leg.end, `${leg.id} must not collapse`);
    assert.ok(Number.isFinite(leg.distance) && leg.distance > 0, `${leg.id} distance`);
  }
  assert.ok(Number.isFinite(receipt.route.totalDistance) && receipt.route.totalDistance > 0);

  assert.deepEqual(receipt.transit.beacon.local, { x: 3040, z: -920 });
  assert.deepEqual(receipt.transit.beacon.global, { x: -9248, z: 7272 });
  assert.deepEqual(receipt.transit.beacon.physicalGlobal, { x: -9248, z: 7272 });
  assert.equal(receipt.transit.beacon.physicalPlaceId, 'place_lane_beacon');
  assert.deepEqual(receipt.transit.beacon.systemMapDrawPos, { x: 3040, z: -920 });
  assert.deepEqual(receipt.transit.beacon.courseGlobal, { x: -9248, z: 7272 });
  assert.equal(receipt.transit.beacon.courseAutopilot, true);
  assert.equal(receipt.transit.beacon.positionAliasesCanonicalPos, true);
  assert.equal(receipt.transit.beacon.insideTransitPocket, true);
  assert.equal(receipt.transit.noPresenceBudget, true);
  assert.deepEqual(receipt.transit.approachMidpoint, { x: 3155, z: -955 });
  assert.equal(receipt.transit.zoneCenteredOnApproachMidpoint, true);

  assert.equal(receipt.production.mechanicalCondition.type, 'dense_asteroid');
  assert.equal(receipt.production.mechanicalCondition.owner, 'world.hazards');
  assert.equal(receipt.production.mechanicalCondition.centerInsideProduction, true);
  assert.equal(receipt.production.primaryFieldInsideProduction, true);
  assert.equal(receipt.production.civicZoneCenteredOnStation, true);
  assert.equal(receipt.production.beltOutpostInsideProduction, true);
  assert.deepEqual(receipt.deterministicEffects.offscreenEmbodiment, {
    intentCount: 3,
    digest: 2416862514,
    roleMixBias: {
      hauler: 1.4,
      miner: 2.2,
      courier: 1,
      escort: 1.4,
      patrol: 1.8,
      pirate: 1,
      smuggler: 1,
      rescue: 1,
    },
  });

  assert.equal(receipt.rejectedStaleProposal.local.x, -720);
  assert.equal(receipt.rejectedStaleProposal.local.z, -2120);
  assert.equal(receipt.rejectedStaleProposal.accepted, false);
  assert.ok(receipt.rejectedStaleProposal.minimumLaneClearance < 0);
});

test('PQ-020 structural-cost fingerprint is deterministic and headed-only fields stay honest', async () => {
  const first = await evaluatePq020CeresTopology();
  const second = await evaluatePq020CeresTopology();

  assert.equal(first.pass, true, first.failures.join('\n'));
  assert.equal(second.pass, true, second.failures.join('\n'));
  assert.equal(first.structuralCostDigest, EXPECTED_STRUCTURAL_COST_DIGEST);
  assert.equal(second.structuralCostDigest, EXPECTED_STRUCTURAL_COST_DIGEST);
  assert.equal(first.receiptDigest, second.receiptDigest);

  assert.equal(first.structuralCost.scope, 'sector_ceres_belt:seed47:one-fixed-tick');
  assert.deepEqual(first.structuralCost.authored, {
    stations: 2,
    gates: 4,
    fields: 3,
    hazards: 1,
    pois: 5,
    zones: 6,
  });
  assert.deepEqual(first.structuralCost.entities, {
    total: 124,
    byType: { asteroid: 90, fx: 12, ship: 2, station: 6, wreck: 14 },
    collidable: 105,
  });
  assert.equal(first.structuralCost.colliders, 105);
  assert.equal(first.structuralCost.worldSite.siteId, SITE_ID);
  assert.equal(first.structuralCost.worldSite.materializedEntities, 15);
  assert.equal(first.structuralCost.residencyTier, 'FULL');
  assert.equal(first.structuralCost.presentationAdmission, 'headless');
  assert.ok(Number.isInteger(first.structuralCost.spatial.queries));
  assert.ok(Number.isInteger(first.structuralCost.spatial.candidates));

  assert.deepEqual(first.additiveWorldSites, second.additiveWorldSites);
  assert.equal(
    first.additiveWorldSites.schema,
    'spaceface.pq020-ceres-additive-world-sites.v1',
  );
  assert.equal(first.additiveWorldSites.coreWorldSiteId, SITE_ID);
  assert.equal(
    first.additiveWorldSites.exclusionPolicy,
    'manifest_identified_non_cathedral_world_records',
  );
  assert.deepEqual(first.additiveWorldSites.siteIds, ['world_site_ceres_cinder_sluice']);
  assert.equal(first.additiveWorldSites.allMaterializedExactlyAsPlanned, true);
  assert.deepEqual(first.additiveWorldSites.totals, {
    live: { entities: 5, byType: { fx: 1, wreck: 4 }, collidable: 2, colliders: 2 },
    planned: { entities: 5, byType: { fx: 1, wreck: 4 }, collidable: 2, colliders: 2 },
  });
  const cinder = first.additiveWorldSites.sites[0];
  assert.equal(cinder.siteId, 'world_site_ceres_cinder_sluice');
  assert.equal(cinder.exactAgreement, true);
  assert.deepEqual(cinder.live, cinder.planned);

  assert.deepEqual(first.additiveDressing, second.additiveDressing);
  assert.equal(
    first.additiveDressing.schema,
    'spaceface.pq020-ceres-additive-dressing.v1',
  );
  assert.equal(
    first.additiveDressing.exclusionPolicy,
    'explicit_world_dressing_data_flags',
  );
  assert.deepEqual(first.additiveDressing.groupIds, ['everydaySpaceKit', 'wreckAftermath']);
  assert.deepEqual(first.additiveDressing.totals, {
    entities: 10,
    byType: { fx: 10 },
    collidable: 0,
    colliders: 0,
  });
  assert.equal(first.additiveDressing.ambiguousEntities, 0);
  assert.deepEqual(first.additiveDressing.groups, [
    {
      id: 'everydaySpaceKit',
      dataFlag: 'everydaySpaceKit',
      live: { entities: 6, byType: { fx: 6 }, collidable: 0, colliders: 0 },
    },
    {
      id: 'wreckAftermath',
      dataFlag: 'wreckAftermath',
      live: { entities: 4, byType: { fx: 4 }, collidable: 0, colliders: 0 },
    },
  ]);

  for (const group of Object.values(first.requiresHeaded)) {
    assert.equal(group.requiresHeaded, true);
    for (const value of Object.values(group.fields)) assert.equal(value, null);
  }
});

test('PQ-020 validator fails closed on topology, structural, map, and evidence-schema drift', async () => {
  const snapshot = await buildPq020CeresTopologySnapshot();

  const cathedralDrift = structuredClone(snapshot);
  cathedralDrift.cathedral.local.x += 1;
  assert.equal(validatePq020CeresTopologySnapshot(cathedralDrift).pass, false);

  const overlap = structuredClone(snapshot);
  overlap.topology.pockets.find((candidate) => candidate.id === 'transit').center =
    { ...overlap.topology.pockets.find((candidate) => candidate.id === 'production').center };
  assert.equal(validatePq020CeresTopologySnapshot(overlap).pass, false);

  const structuralDrift = structuredClone(snapshot);
  structuralDrift.structuralCost.entities.total += 1;
  const changed = validatePq020CeresTopologySnapshot(structuralDrift);
  assert.equal(changed.pass, false);
  assert.ok(changed.failures.some((failure) => failure.startsWith('structuralCostDigest:')));

  for (const type of ['asteroid', 'fx', 'wreck']) {
    const ordinaryCeresDrift = structuredClone(snapshot);
    ordinaryCeresDrift.structuralCost.entities.total += 1;
    ordinaryCeresDrift.structuralCost.entities.byType[type] += 1;
    const result = validatePq020CeresTopologySnapshot(ordinaryCeresDrift);
    assert.equal(result.pass, false, `${type} growth must remain inside the pinned core gate`);
    assert.ok(result.failures.some((failure) => failure.startsWith('structuralCostDigest:')));
  }

  const cinderLiveDrift = structuredClone(snapshot);
  cinderLiveDrift.additiveWorldSites.sites[0].live.entities += 1;
  const cinderLiveResult = validatePq020CeresTopologySnapshot(cinderLiveDrift);
  assert.equal(cinderLiveResult.pass, false);
  assert.ok(cinderLiveResult.failures.some((failure) => (
    failure.startsWith('additiveWorldSites.world_site_ceres_cinder_sluice.live:')
  )));

  const cinderPlannedDrift = structuredClone(snapshot);
  cinderPlannedDrift.additiveWorldSites.sites[0].planned.collidable += 1;
  const cinderPlannedResult = validatePq020CeresTopologySnapshot(cinderPlannedDrift);
  assert.equal(cinderPlannedResult.pass, false);
  assert.ok(cinderPlannedResult.failures.some((failure) => (
    failure.startsWith('additiveWorldSites.world_site_ceres_cinder_sluice.planned:')
  )));

  const additiveDressingDrift = structuredClone(snapshot);
  additiveDressingDrift.additiveDressing.groups[0].live.entities -= 1;
  const additiveDressingResult = validatePq020CeresTopologySnapshot(additiveDressingDrift);
  assert.equal(additiveDressingResult.pass, false);
  assert.ok(additiveDressingResult.failures.some((failure) => (
    failure.startsWith('additiveDressing.everydaySpaceKit.live:')
  )));

  const ambiguousDressing = structuredClone(snapshot);
  ambiguousDressing.additiveDressing.ambiguousEntities = 1;
  const ambiguousDressingResult = validatePq020CeresTopologySnapshot(ambiguousDressing);
  assert.equal(ambiguousDressingResult.pass, false);
  assert.ok(ambiguousDressingResult.failures.includes(
    'additiveDressing.ambiguousEntities:1!=0',
  ));

  const mapDrift = structuredClone(snapshot);
  mapDrift.transit.beacon.systemMapDrawPos.x += 1;
  assert.equal(validatePq020CeresTopologySnapshot(mapDrift).pass, false);

  const missingGroup = structuredClone(snapshot);
  delete missingGroup.requiresHeaded.routePerformance;
  const missingGroupReceipt = validatePq020CeresTopologySnapshot(missingGroup);
  assert.equal(missingGroupReceipt.pass, false);
  assert.ok(missingGroupReceipt.failures.includes('requiresHeaded:routePerformance:marker'));

  const missingField = structuredClone(snapshot);
  delete missingField.requiresHeaded.visualStates.fields.appliedLod;
  const missingFieldReceipt = validatePq020CeresTopologySnapshot(missingField);
  assert.equal(missingFieldReceipt.pass, false);
  assert.ok(missingFieldReceipt.failures.includes('requiresHeaded:visualStates.appliedLod:missing'));

  const extraGroup = structuredClone(snapshot);
  extraGroup.requiresHeaded.fabricatedAcceptance = {
    requiresHeaded: true,
    fields: { passed: true },
  };
  assert.equal(validatePq020CeresTopologySnapshot(extraGroup).pass, false);

  const extraField = structuredClone(snapshot);
  extraField.requiresHeaded.routePerformance.fields.fabricatedGpuPass = 16.7;
  assert.equal(validatePq020CeresTopologySnapshot(extraField).pass, false);
});

test('PQ-020 matched baseline is a SIBLING of the pinned structural cost, not a re-pin of it', async () => {
  const receipt = await evaluatePq020CeresTopology();

  assert.equal(receipt.pass, true, receipt.failures.join('\n'));
  // The load-bearing invariant: adding the matched-baseline record must not move the pinned digest.
  assert.equal(receipt.structuralCostDigest, EXPECTED_STRUCTURAL_COST_DIGEST);

  const baseline = receipt.matchedBaseline;
  assert.equal(baseline.schema, 'spaceface.pq020-ceres-matched-baseline.v1');
  assert.ok(baseline.digest);
  assert.notEqual(baseline.digest, receipt.structuralCostDigest);

  // Headless rows carry real numbers …
  assert.equal(baseline.headless.structural.entities, receipt.structuralCost.entities.total);
  assert.equal(baseline.headless.structural.colliders, receipt.structuralCost.colliders);
  assert.equal(baseline.headless.structural.worldSiteEntities, 15);
  assert.ok(baseline.headless.mapLayout.digest);
  assert.equal(baseline.headless.naturalJobCensus.perSeed.length, 3);
  assert.equal(baseline.headless.offscreenRoleMix.perSeed.length, 3);
  assert.ok(baseline.headless.routeLegs.throughCeresItinerary.totalDistanceWu > 0);

  // … and every headed row stays null and marked, because PQ-034 holds those leases.
  for (const group of Object.values(baseline.requiresHeaded)) {
    assert.equal(group.requiresHeaded, true);
    assert.match(group.blockedBy, /PQ-034/);
    for (const value of Object.values(group.fields)) assert.equal(value, null);
  }
});

test('PQ-020 receipt carries the continuation proofs and reports routing honestly', async () => {
  const receipt = await evaluatePq020CeresTopology();

  assert.equal(receipt.pass, true, receipt.failures.join('\n'));
  assert.equal(receipt.naturalJobs.seedsWithIndustrialJob, 3);
  assert.deepEqual(receipt.naturalJobs.heldOutSeeds, [90731, 90737, 90743]);
  assert.equal(receipt.naturalJobs.advancementClaim.claimed, false);
  assert.equal(receipt.offscreenProjection.allStable, true);
  assert.equal(receipt.mechanicalCondition.bound, true);
  assert.equal(receipt.mechanicalCondition.changesObservablePlayerDecision, true);
  assert.equal(receipt.mechanicalCondition.laneDangerConsumer.fires, false);
  assert.equal(receipt.reentryIdempotence.staticContentMaterializesExactlyOnce, true);
  assert.equal(receipt.exactAgreement.allAgree, true);
  // The generic router bypasses Ceres. The receipt must say so rather than imply a through-route.
  assert.equal(receipt.routing.generic.traversesCeres, false);
  assert.match(receipt.routing.generic.verdict, /BYPASSES Ceres/);
});

test('PQ-020 validator fails closed on continuation-proof drift', async () => {
  const snapshot = await buildPq020CeresTopologySnapshot();

  // A fabricated headed row is the exact failure this packet exists to prevent.
  const fabricatedHeaded = structuredClone(snapshot);
  fabricatedHeaded.matchedBaseline.requiresHeaded.frame.fields.p95Ms = 16.7;
  const fabricatedReceipt = validatePq020CeresTopologySnapshot(fabricatedHeaded);
  assert.equal(fabricatedReceipt.pass, false);
  assert.ok(fabricatedReceipt.failures.includes('matchedBaseline:frame.p95Ms:fabricated'));

  // A seed that produced no natural job must fail, not be quietly dropped.
  const noJobs = structuredClone(snapshot);
  noJobs.naturalJobs.perSeed[0].withMetadata.jobKinds = {};
  assert.equal(validatePq020CeresTopologySnapshot(noJobs).pass, false);

  // Claiming lifecycle advancement this harness did not observe must fail.
  const overclaim = structuredClone(snapshot);
  overclaim.naturalJobs.advancementClaim.claimed = true;
  const overclaimReceipt = validatePq020CeresTopologySnapshot(overclaim);
  assert.equal(overclaimReceipt.pass, false);
  assert.ok(overclaimReceipt.failures.includes('naturalJobs:advancement-overclaim'));

  // A mechanical condition that stopped changing anything observable must fail.
  const inertCondition = structuredClone(snapshot);
  inertCondition.mechanicalCondition.changesObservablePlayerDecision = false;
  assert.equal(validatePq020CeresTopologySnapshot(inertCondition).pass, false);

  // Duplicated static content after Continue must fail.
  const duplicated = structuredClone(snapshot);
  duplicated.reentryIdempotence.afterContinue.beaconEntities = 2;
  assert.equal(validatePq020CeresTopologySnapshot(duplicated).pass, false);

  // A coordinate consumer that silently went missing must fail, not pass vacuously.
  const missingConsumer = structuredClone(snapshot);
  missingConsumer.exactAgreement.rows[0].missing = ['courseGlobal'];
  missingConsumer.exactAgreement.allAgree = false;
  assert.equal(validatePq020CeresTopologySnapshot(missingConsumer).pass, false);

  // Cathedral navigation deliberately targets the manifest-authored safe course rather than the
  // wreck centre. The validator must recompute that binding instead of trusting the row's cached
  // mismatch metadata.
  const baselineCathedralRow = snapshot.exactAgreement.rows
    .find((row) => row.id === 'cathedral');
  assert.notDeepEqual(baselineCathedralRow.courseGlobal, baselineCathedralRow.expectedGlobal);
  assert.deepEqual(baselineCathedralRow.courseGlobal, baselineCathedralRow.expectedCourseGlobal);
  assert.equal(baselineCathedralRow.courseLabel, 'Wreck Cathedral');
  assert.equal(baselineCathedralRow.courseArrivalRadius, 48);
  assert.deepEqual(baselineCathedralRow.courseIntent, {
    type: 'poi', reason: 'Wreck Cathedral', waypointKind: 'local', autopilot: true,
  });
  for (const [label, failureLabel, mutate] of [
    ['target', 'courseTarget', (row) => { row.courseGlobal.x += 1; }],
    ['label', 'courseLabel', (row) => { row.courseLabel = 'Unsafe Cathedral centre'; }],
    ['radius', 'courseRadius', (row) => { row.courseArrivalRadius += 1; }],
    ['intent', 'courseIntent', (row) => { row.courseIntent.autopilot = false; }],
  ]) {
    const courseDrift = structuredClone(snapshot);
    const cathedralRow = courseDrift.exactAgreement.rows
      .find((row) => row.id === 'cathedral');
    mutate(cathedralRow);
    const courseDriftReceipt = validatePq020CeresTopologySnapshot(courseDrift);
    assert.equal(courseDriftReceipt.pass, false, `Cathedral course ${label} drift must fail`);
    assert.ok(courseDriftReceipt.failures.some((failure) => (
      failure.startsWith(`exactAgreement:cathedral:${failureLabel}`)
    )), `Cathedral course ${label} drift must identify the recomputed binding`);
  }

  // An itinerary waypoint drifting off its authored anchor must fail.
  const itineraryDrift = structuredClone(snapshot);
  itineraryDrift.routing.throughCeresItinerary.allWaypointsMatchAuthored = false;
  assert.equal(validatePq020CeresTopologySnapshot(itineraryDrift).pass, false);

  // Offscreen projection losing determinism must fail.
  const unstableProjection = structuredClone(snapshot);
  unstableProjection.offscreenProjection.allStable = false;
  assert.equal(validatePq020CeresTopologySnapshot(unstableProjection).pass, false);

  // If the counterfactual arm stopped actually reaching the producer, the A/B would be theatre —
  // the arms would be identical and the census would still look green. That must fail.
  const brokenAb = structuredClone(snapshot);
  brokenAb.naturalJobs.perSeed[0].withoutMetadata.observedIndustriesMining = true;
  const brokenAbReceipt = validatePq020CeresTopologySnapshot(brokenAb);
  assert.equal(brokenAbReceipt.pass, false);
  assert.ok(brokenAbReceipt.failures.some(
    (failure) => failure.includes('counterfactualIndustriesMining'),
  ));

  // Likewise if the WITH arm's metadata never reached the producer.
  const unseenMetadata = structuredClone(snapshot);
  unseenMetadata.naturalJobs.perSeed[0].withMetadata.observedIndustriesMining = false;
  assert.equal(validatePq020CeresTopologySnapshot(unseenMetadata).pass, false);

  // Re-labelling the recomputed projection as a survived-save claim must fail.
  const projectionOverclaim = structuredClone(snapshot);
  projectionOverclaim.reentryIdempotence.offscreenProjectionPersistence.claimed = true;
  const projectionReceipt = validatePq020CeresTopologySnapshot(projectionOverclaim);
  assert.equal(projectionReceipt.pass, false);
  assert.ok(projectionReceipt.failures.includes('reentryIdempotence:projection-persistence-overclaim'));
});
