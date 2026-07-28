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
  'b2232d1d891f6d65b2e4420387a23223e0325a0e14971d046bd86ef61ddafc2d';

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
  assert.ok(first.structuralCost.entities.total > 0);
  assert.ok(first.structuralCost.entities.byType.fx > 0);
  assert.ok(first.structuralCost.entities.collidable > 0);
  assert.ok(first.structuralCost.colliders > 0);
  assert.equal(first.structuralCost.worldSite.siteId, SITE_ID);
  assert.equal(first.structuralCost.worldSite.materializedEntities, 15);
  assert.equal(first.structuralCost.residencyTier, 'FULL');
  assert.equal(first.structuralCost.presentationAdmission, 'headless');
  assert.ok(Number.isInteger(first.structuralCost.spatial.queries));
  assert.ok(Number.isInteger(first.structuralCost.spatial.candidates));

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
