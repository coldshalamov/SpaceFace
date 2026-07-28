// PQ-020 continuation proofs — the acceptance rows the landed topology slice could not give.
//
// These fixtures assert against LIVE headless simulation through the shipped owners. They contain
// no createJob / npcJobs.assign call site, move no authored content, and author no new system.
//
// Held-out seeds 90731 / 90737 / 90743 were fixed BEFORE any run and are never swapped; a seed that
// produced no industrial role would be reported, not replaced.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExactAgreementReport,
  buildMatchedBaselineRecord,
  buildMechanicalConditionReport,
  buildNaturalJobCensusReport,
  buildOffscreenProjectionReport,
  buildReentryIdempotenceReport,
  buildRoutingHonestyReport,
  PQ020_HELD_OUT_SEEDS,
  runCeresJobCensus,
} from '../scripts/lib/pq020CeresProofs.mjs';

const SITE_ID = 'world_site_wreck_cathedral';

test('PQ-020 natural miner/hauler jobs arise from the live producer on every held-out seed', () => {
  const report = buildNaturalJobCensusReport();

  assert.deepEqual(report.heldOutSeeds, [90731, 90737, 90743]);
  assert.equal(report.perSeed.length, 3);
  assert.equal(report.seedsWithIndustrialJob, 3, JSON.stringify(report.perSeed));

  for (const row of report.perSeed) {
    const census = row.withMetadata;
    const jobCount = Object.values(census.jobKinds).reduce((sum, count) => sum + count, 0);
    assert.ok(jobCount > 0, `seed ${row.seed}: traffic produced at least one natural job`);

    // The A/B actually reached the producer: this reads the live `sector:enter` payload traffic.js
    // consumes, rather than re-deriving the weights from the same record we supplied.
    assert.equal(census.observedSectorEnterEvents, 1, `seed ${row.seed}: one sector:enter`);
    assert.equal(census.observedIndustriesMining, true, `seed ${row.seed}: producer saw mining`);
    assert.equal(census.observedIndustriesRefinery, true, `seed ${row.seed}: producer saw refinery`);
    assert.equal(row.withoutMetadata.observedIndustriesMining, false,
      `seed ${row.seed}: counterfactual producer must NOT see mining`);
    assert.equal(row.withoutMetadata.observedIndustriesRefinery, false,
      `seed ${row.seed}: counterfactual producer must NOT see refinery`);

    // At least one INDUSTRIAL job (miner or hauler) on every held-out seed.
    const industrial = (census.jobKinds.miner || 0) + (census.jobKinds.hauler || 0);
    assert.ok(
      industrial > 0,
      `seed ${row.seed}: expected a natural miner or hauler job, got ${JSON.stringify(census.jobKinds)}`,
    );

    // Owner-function characterization, reported rather than treated as independent evidence: the
    // harness derives both arms' weights itself, so this only documents the shipped weighting rule.
    assert.ok(row.minerWeightDelta > 0, `seed ${row.seed}: miner weight delta ${row.minerWeightDelta}`);
    assert.ok(row.haulerWeightDelta > 0, `seed ${row.seed}: hauler weight delta ${row.haulerWeightDelta}`);
  }

  // Both industrial kinds appear naturally somewhere across the held-out set.
  assert.ok(report.aggregateJobKinds.miner > 0, 'a natural miner job arose');
  assert.ok(report.aggregateJobKinds.hauler > 0, 'a natural hauler job arose');

  // The honest negative row must stay honest: this harness never claims lifecycle advancement.
  assert.equal(report.advancementClaim.claimed, false);
  assert.match(report.advancementClaim.owner, /check:npc-jobs/);
});

test('PQ-020 natural census is deterministic per seed and the A/B arms differ only in metadata', () => {
  for (const seed of PQ020_HELD_OUT_SEEDS) {
    const first = runCeresJobCensus(seed, { industries: true });
    const second = runCeresJobCensus(seed, { industries: true });
    assert.deepEqual(second, first, `seed ${seed}: census must be reproducible`);

    const counterfactual = runCeresJobCensus(seed, { industries: false });
    assert.equal(counterfactual.industries, false);
    // The counterfactual removes ONLY the metadata; the weight rows must move and nothing else may
    // silently vanish (both arms still populate the sector with ambient traffic).
    assert.notDeepEqual(counterfactual.roleWeights, first.roleWeights);
    assert.ok(first.totalTrafficHulls > 0 && counterfactual.totalTrafficHulls > 0);
  }
});

test('PQ-020 offscreen projection is deterministic and metadata-sensitive on the same held-out seeds', () => {
  const report = buildOffscreenProjectionReport();
  assert.equal(report.allStable, true);
  assert.equal(report.allChangedByIndustries, true);
  assert.equal(report.perSeed.length, 3);
  for (const row of report.perSeed) {
    assert.equal(row.digest, row.repeatDigest, `seed ${row.seed}: projection digest must be stable`);
    assert.notEqual(
      row.digest, row.counterfactualDigest,
      `seed ${row.seed}: removing industries must change the projection`,
    );
    assert.equal(row.roleMixBias.miner, 2.2);
    assert.equal(row.roleMixBias.hauler, 1.4);
    assert.equal(row.counterfactualRoleMixBias.miner, 1);
    assert.equal(row.counterfactualRoleMixBias.hauler, 1);
  }
  // This is projected intent. It is not a claim about visible traffic and must not read as one.
  assert.match(report.claim, /not a claim of visible traffic/);
});

test('PQ-020 binds one bounded mechanical condition to the production pocket through its existing owner', () => {
  const report = buildMechanicalConditionReport();

  assert.equal(report.bound, true, report.blocker || 'condition must be bound');
  assert.equal(report.conditionType, 'dense_asteroid');
  // Existing owner, not a new system, and no authored content was relocated to make it fit.
  assert.equal(report.authoredNewCondition, false);
  assert.equal(report.movedExistingContent, false);
  assert.match(report.owner, /world\.js/);
  assert.match(report.presenter, /hazardLanguage\.js/);

  // Bounded, and bound to the production pocket.
  assert.equal(report.geometry.bounded, true);
  assert.equal(report.geometry.centerInsideProductionPocket, true);
  assert.equal(report.pocket.zoneId, 'zone_ceres_belt');

  // Observable player decision: entering raises the counterplay readout, leaving clears it.
  assert.equal(report.readout.beforeEntry, null);
  assert.equal(report.readout.insideRead.type, 'dense_asteroid');
  assert.deepEqual(report.readout.insideRead.counterplay, ['avoid', 'time', 'tether']);
  assert.deepEqual(report.readout.insideRead.damages, ['hull on collision']);
  assert.equal(report.readout.afterExit, null);
  assert.equal(report.changesObservablePlayerDecision, true);
  assert.deepEqual(report.observedEvents, [
    { event: 'hazard:enter', zoneType: 'dense_asteroid', intensity: 0.5 },
    { event: 'hazard:exit', zoneType: 'dense_asteroid', intensity: 0.5 },
  ]);

  // Accessible: a glyph plus literal verbs, never colour alone.
  assert.equal(report.accessibility.nonColorSemantics, true);
  assert.ok(report.accessibility.glyph);

  // The pocket really is a denser crossing — measured, not asserted by label.
  assert.equal(report.routeExposure.density.pocketIsDenser, true);
  assert.ok(report.routeExposure.density.ratio > 1);
  assert.equal(report.routeExposure.direct.crossesHazardDisc, true);
  // Both bypass sides are reported so the comparison cannot be cherry-picked.
  assert.equal(report.routeExposure.bypass.length, 2);
  assert.equal(typeof report.routeExposure.bypassReducesRockExposure, 'boolean');

  // Honest negative: the other live consumer of active.hazards is gated off at Ceres.
  assert.equal(report.laneDangerConsumer.fires, false);
  assert.equal(report.laneDangerConsumer.sectorSecurity, 0.72);
  assert.equal(report.laneDangerConsumer.sectorTier, 1);
});

test('PQ-020 static content materializes exactly once across re-entry and save -> Continue', () => {
  const report = buildReentryIdempotenceReport();

  assert.equal(report.saveAvailable, true);
  assert.equal(report.envelopeVersion, 12);
  assert.equal(report.continueAccepted, true);
  assert.equal(report.secondContinueAccepted, true);

  // Repeated enterSector must not duplicate the beacon or the Cathedral World Site.
  for (const snapshot of [report.afterFirstEnter, report.afterSecondEnter, report.afterThirdEnter]) {
    assert.equal(snapshot.beaconEntities, 1, 'the beacon must materialize exactly once');
    assert.equal(snapshot.beaconEntityIds.length, 1);
    assert.equal(snapshot.cathedralEntities, 15);
    assert.equal(snapshot.zoneCount, 5);
  }
  assert.equal(report.staticContentMaterializesExactlyOnce, true);

  // Continue preserves topology, zone set and map identity.
  assert.deepEqual(report.afterContinue, report.afterFirstEnter);
  assert.deepEqual(report.afterSecondContinue, report.afterFirstEnter);
  assert.equal(report.topologyStableAcrossReentryAndContinue, true);

  // The offscreen projection row must NOT be dressed up as a survived-save claim. It is a pure
  // function of authored data, so its stability is invariance by construction; no projection state
  // is serialized in this system subset. The report has to keep saying so.
  assert.equal(report.offscreenProjectionPersistence.claimed, false);
  assert.equal(report.offscreenProjectionPersistence.invariance, 'by-construction');
  assert.match(report.offscreenProjectionPersistence.owner, /check:m2:sector-embodiment/);
  assert.equal(report.afterContinue.offscreenProjectionRecomputedDigest, 2416862514);
  assert.equal(report.afterContinue.offscreenIntentCount, 3);
});

test('PQ-020 every coordinate consumer agrees exactly, with the dual map frames kept apart', () => {
  const report = buildExactAgreementReport();

  assert.equal(report.allAgree, true, JSON.stringify(report.rows.filter((row) => !row.agrees)));
  assert.deepEqual(
    report.rows.map((row) => row.id).sort(),
    ['beacon', 'cathedral', 'pocket:civic', 'pocket:production', 'pocket:transit'],
  );

  // No row may pass vacuously: every consumer it declares required must be present.
  for (const row of report.rows) {
    assert.ok(row.required.length > 0, `${row.id} must declare required consumers`);
    assert.deepEqual(row.missing, [], `${row.id} missing consumers`);
    assert.deepEqual(row.mismatches, [], `${row.id} mismatches`);
  }

  const beacon = report.rows.find((row) => row.id === 'beacon');
  assert.deepEqual(beacon.authoredLocal, { x: 3040, z: -920 });
  assert.deepEqual(beacon.expectedGlobal, { x: -9248, z: 7272 });
  assert.deepEqual(beacon.atlasGlobal, { x: -9248, z: 7272 });
  assert.deepEqual(beacon.mapPointGlobal, { x: -9248, z: 7272 });
  assert.deepEqual(beacon.courseGlobal, { x: -9248, z: 7272 });
  assert.deepEqual(beacon.physicalGlobal, { x: -9248, z: 7272 });
  // DUAL FRAME: drawPos is sector-local and must NOT equal the global point.
  assert.deepEqual(beacon.mapDrawLocal, { x: 3040, z: -920 });
  assert.notDeepEqual(beacon.mapDrawLocal, beacon.mapPointGlobal);

  const cathedral = report.rows.find((row) => row.id === 'cathedral');
  assert.deepEqual(cathedral.authoredLocal, { x: 300, z: 2700 });
  assert.deepEqual(cathedral.expectedGlobal, { x: -11988, z: 10892 });
  assert.deepEqual(cathedral.manifestGlobal, { x: -11988, z: 10892 });
  assert.deepEqual(cathedral.physicalGlobal, { x: -11988, z: 10892 });
  assert.deepEqual(cathedral.mapDrawLocal, { x: 300, z: 2700 });

  const civic = report.rows.find((row) => row.id === 'pocket:civic');
  assert.deepEqual(civic.authoredLocal, { x: -1100, z: 620 });
  assert.deepEqual(civic.mapZoneLocal, { x: -1100, z: 620 });

  // Zone pockets carry SECTOR-LOCAL x/z in the map model and are not course targets; the absence is
  // recorded with its reason rather than faked.
  for (const id of ['pocket:production', 'pocket:transit']) {
    const row = report.rows.find((candidate) => candidate.id === id);
    assert.deepEqual(row.mapZoneLocal, row.authoredLocal);
    assert.equal(row.mapZoneRadius, row.authoredRadius);
    assert.equal(row.mapPointGlobal, null);
    assert.ok(row.absent.courseGlobal);
  }
});

test('PQ-020 reports generic routing honestly and produces a deliberate through-Ceres itinerary', () => {
  const report = buildRoutingHonestyReport();

  assert.match(report.routeOwner, /computePreviewRoute/);
  assert.ok(report.generic.heliosToTethys.length > 0);
  // The truth as the real router returns it: a direct authored edge, so Ceres is NOT traversed.
  assert.equal(report.generic.traversesCeres, false);
  assert.deepEqual(report.generic.heliosToTethys, ['sector_helios_prime', 'sector_tethys_junction']);
  assert.match(report.generic.verdict, /BYPASSES Ceres/);
  assert.equal(report.generic.ceresIsReachableInOneHopFromBoth, true);

  const itinerary = report.throughCeresItinerary;
  assert.match(itinerary.selection, /NOT produced by the generic router/);
  assert.equal(itinerary.siteId, SITE_ID);
  assert.deepEqual(
    itinerary.waypoints.map((stop) => stop.id),
    ['station_ceres', 'station_beltout', 'poi_ceres_throughline', SITE_ID],
  );
  // Every waypoint is pinned to the live authored record, so the itinerary cannot silently drift.
  assert.equal(itinerary.allWaypointsMatchAuthored, true);
  assert.equal(itinerary.legs.length, 3);
  assert.deepEqual(
    itinerary.legs.map((leg) => leg.distanceWu),
    [2442.949, 2260.088, 4540.044],
  );
  assert.equal(itinerary.totalDistanceWu, 9243.081);
});

test('PQ-020 matched baseline carries headless rows and refuses to fabricate headed ones', () => {
  const structuralCost = {
    entities: { total: 124, byType: { asteroid: 90 }, collidable: 105 },
    colliders: 105,
    spatial: { queries: 0, candidates: 0 },
    worldSite: { materializedEntities: 15 },
    residencyTier: 'FULL',
    presentationAdmission: 'headless',
  };
  const record = buildMatchedBaselineRecord({
    structuralCost,
    route: { id: 'r', legs: [] },
    mapLayout: { zones: [], points: [], digest: 'layout' },
    naturalJobs: { heldOutSeeds: [...PQ020_HELD_OUT_SEEDS], perSeed: [] },
    offscreen: { perSeed: [], allStable: true },
    routing: { generic: {}, throughCeresItinerary: {} },
  });

  assert.equal(record.schema, 'spaceface.pq020-ceres-matched-baseline.v1');
  assert.equal(record.evidenceClass, 'headless-structural');
  assert.equal(record.headless.structural.entities, 124);
  assert.equal(record.headless.structural.colliders, 105);
  assert.equal(record.headless.structural.worldSiteEntities, 15);
  assert.ok(record.digest);

  // Every headed row is null and marked blocked — PQ-034 holds those leases.
  assert.deepEqual(
    Object.keys(record.requiresHeaded).sort(),
    ['admission', 'frame', 'renderer', 'visualStates'],
  );
  for (const group of Object.values(record.requiresHeaded)) {
    assert.equal(group.requiresHeaded, true);
    assert.match(group.blockedBy, /PQ-034/);
    for (const value of Object.values(group.fields)) assert.equal(value, null);
  }
  assert.deepEqual(
    Object.keys(record.requiresHeaded.frame.fields).sort(),
    ['hitchCount', 'p95Ms', 'p99Ms'],
  );
  assert.deepEqual(
    Object.keys(record.requiresHeaded.visualStates.fields).sort(),
    ['appliedLod', 'close', 'default', 'far', 'motion'],
  );

  // The record is a digestible artifact: same inputs, same digest.
  const repeat = buildMatchedBaselineRecord({
    structuralCost,
    route: { id: 'r', legs: [] },
    mapLayout: { zones: [], points: [], digest: 'layout' },
    naturalJobs: { heldOutSeeds: [...PQ020_HELD_OUT_SEEDS], perSeed: [] },
    offscreen: { perSeed: [], allStable: true },
    routing: { generic: {}, throughCeresItinerary: {} },
  });
  assert.equal(repeat.digest, record.digest);
});
