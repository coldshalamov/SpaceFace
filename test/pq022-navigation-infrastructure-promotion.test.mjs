import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT as CONTRACT } from '../scripts/lib/pq022NavigationInfrastructureCandidateValidation.mjs';
import {
  assessAdmissionSnapshot,
  assessNavigationInfrastructureManifestPlan,
  assessNavigationInfrastructurePromotionReview,
  buildNavigationInfrastructurePartsManifest,
  buildNavigationInfrastructurePublicationTransaction,
  parseGlbDocument,
  prepareNavigationInfrastructureRelease,
  promoteNavigationInfrastructureSourceBytes,
  requiredAdmissionIdentities,
  seedNavigationInfrastructureReleaseManifest,
  sha256,
} from '../scripts/promote-pq022-navigation-infrastructure.mjs';

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function identity(path, bytes = 100) {
  return { path, sha256: digest(path), bytes };
}

function fakeAdmission() {
  const renderFiles = CONTRACT.assets.flatMap((asset) => asset.renderViews.map((path) => identity(path, 1000)));
  return {
    pass: true,
    facts: {
      binding: identity(CONTRACT.paths.binding),
      generator: identity(CONTRACT.paths.sourceGenerator),
      preflight: identity(CONTRACT.paths.materialTruthPreflight),
      buildReport: identity(CONTRACT.paths.buildReport),
      renderManifest: identity(CONTRACT.paths.renderManifest),
      renderFiles,
      assets: Object.fromEntries(CONTRACT.assets.map((asset) => [asset.key, {
        candidate: identity(asset.paths.candidate, 200),
        releaseMirror: identity(asset.paths.releaseMirror, 200),
        blender: identity(asset.paths.blender, 300),
        validatorReport: identity(asset.paths.validatorReport, 400),
        glb: {
          lodTriangles: { LOD0: 100, LOD1: 50, LOD2: 20 },
          textureSize: asset.textureSize,
        },
      }])),
    },
  };
}

function validReview(admission) {
  return {
    schema: CONTRACT.promotionReviewSchema,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateSetId: CONTRACT.candidateSetId,
    decision: 'KEEP',
    reviewer: { kind: 'solo_integrator', id: 'codex-primary', evidenceBound: true },
    renderManifest: admission.facts.renderManifest,
    buildReport: admission.facts.buildReport,
    claims: { routeEvidence: false, performanceEvidence: false },
    assets: CONTRACT.assets.map((asset) => ({
      partId: asset.partId,
      candidateId: asset.candidateId,
      candidate: admission.facts.assets[asset.key].candidate,
      blender: admission.facts.assets[asset.key].blender,
      validatorReport: admission.facts.assets[asset.key].validatorReport,
      views: asset.renderViews.map((path) => ({
        ...admission.facts.renderFiles.find((entry) => entry.path === path),
        decision: 'KEEP',
      })),
      gates: { G1: 'KEEP', G2: 'KEEP', G4: 'KEEP', emissive: 'KEEP' },
      decision: 'KEEP',
    })),
  };
}

function glbBytes(document, binary = Buffer.from([1, 2, 3, 4])) {
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const binaryLength = Math.ceil(binary.length / 4) * 4;
  const bytes = Buffer.alloc(20 + jsonLength + 8 + binaryLength, 0x20);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  const binaryHeader = 20 + jsonLength;
  bytes.writeUInt32LE(binaryLength, binaryHeader);
  bytes.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(bytes, binaryHeader + 8);
  return bytes;
}

function candidateDocument(asset) {
  const stamp = {
    candidateId: asset.candidateId,
    dispatchUnit: CONTRACT.dispatchUnit,
    state: CONTRACT.candidateState,
    partId: asset.partId,
    assetId: asset.assetId,
    wiringStatus: 'isolated_candidate',
    claims: structuredClone(CONTRACT.claims),
    wiring: structuredClone(asset.wiring),
  };
  return {
    asset: { version: '2.0', extras: { spacefaceAsset: structuredClone(stamp) } },
    scene: 0,
    scenes: [{ nodes: [0], extras: { spacefaceAsset: structuredClone(stamp) } }],
    nodes: [{ name: asset.rootNode, extras: { spacefaceAsset: structuredClone(stamp) } }],
  };
}

function manifestFixtures() {
  const beforeParts = {
    schema: 'parts-fixture',
    runtimeSlots: {
      place: [
        'places/unrelated_before.glb',
        'places/place_station_billboard.glb',
        'places/unrelated_middle.glb',
        'places/place_nav_buoy.glb',
        'places/unrelated_after.glb',
      ],
      hull: ['hulls/untouched.glb'],
    },
    parts: [
      { id: 'unrelated_before', value: 1 },
      { id: 'place_station_billboard', old: true },
      { id: 'unrelated_middle', value: 2 },
      { id: 'place_nav_buoy', old: true },
      { id: 'unrelated_after', value: 3 },
    ],
  };
  const beforeRelease = {
    schema: 'release-fixture',
    assets: [
      { id: 'unrelated_before', value: 1 },
      { id: 'place_station_billboard', old: true },
      { id: 'unrelated_middle', value: 2 },
      { id: 'place_nav_buoy', old: true },
      { id: 'unrelated_after', value: 3 },
    ],
  };
  const promotedByKey = {};
  const factsByKey = {};
  const expectedByKey = {};
  for (const asset of CONTRACT.assets) {
    const bytes = Buffer.from(`promoted-${asset.partId}`);
    promotedByKey[asset.key] = {
      asset,
      bytes,
      candidateSha256: digest(`candidate-${asset.partId}`),
      sourceSha256: sha256(bytes),
      binaryPayloadSha256: digest(`bin-${asset.partId}`),
    };
    factsByKey[asset.key] = {
      lodTriangles: { LOD0: 100, LOD1: 50, LOD2: 20 },
      textureSize: asset.textureSize,
    };
    expectedByKey[asset.key] = {
      sourceSha256: sha256(bytes),
      sourceBytes: bytes.length,
      releaseSha256: digest(`release-${asset.partId}`),
      releaseBytes: 500,
      lodTriangles: factsByKey[asset.key].lodTriangles,
    };
  }
  const nextParts = buildNavigationInfrastructurePartsManifest(beforeParts, {
    promotedByKey,
    factsByKey,
  });
  const nextRelease = seedNavigationInfrastructureReleaseManifest(beforeRelease);
  for (const asset of CONTRACT.assets) {
    const index = nextRelease.assets.findIndex((row) => row.id === asset.partId);
    const expected = expectedByKey[asset.key];
    nextRelease.assets[index] = {
      id: asset.partId,
      kind: 'part:places',
      source: asset.paths.liveSource,
      release: asset.paths.liveRelease,
      sourceSha256: expected.sourceSha256,
      releaseSha256: expected.releaseSha256,
      sourceBytes: expected.sourceBytes,
      releaseBytes: expected.releaseBytes,
      textures: 15,
      ktx2Textures: 15,
      meshoptBufferViews: 5,
      contractNodeCount: 18,
    };
  }
  return {
    beforeParts,
    beforeRelease,
    promotedByKey,
    factsByKey,
    expectedByKey,
    nextParts,
    nextRelease,
  };
}

test('source promotion changes only the three identical lifecycle copies and preserves BIN', () => {
  for (const asset of CONTRACT.assets) {
    const candidate = glbBytes(candidateDocument(asset));
    const promoted = promoteNavigationInfrastructureSourceBytes(candidate, sha256(candidate), asset);
    const before = parseGlbDocument(candidate);
    const after = parseGlbDocument(promoted.bytes);
    assert.equal(after.binaryPayload.equals(before.binaryPayload), true);
    const stamps = [
      after.document.asset.extras.spacefaceAsset,
      after.document.scenes[0].extras.spacefaceAsset,
      after.document.nodes[0].extras.spacefaceAsset,
    ];
    assert.equal(stamps.every((stamp) => stamp.state === 'integration_candidate'), true);
    assert.equal(stamps.every((stamp) => stamp.claims.routeEvidence === false), true);
    assert.deepEqual(stamps[0], stamps[1]);
    assert.deepEqual(stamps[1], stamps[2]);
  }
});

test('strict GLB parser rejects trailing chunks/data before lifecycle mutation', () => {
  const asset = CONTRACT.assets[0];
  const candidate = glbBytes(candidateDocument(asset));
  const trailing = Buffer.concat([candidate, Buffer.from([0, 0, 0, 0])]);
  trailing.writeUInt32LE(trailing.length, 8);
  assert.throws(() => parseGlbDocument(trailing), /terminal BIN chunk with no trailing data/);
});

test('immutable admission snapshot includes every candidate, mirror, Blend, validator, and render', () => {
  const admission = fakeAdmission();
  const identities = requiredAdmissionIdentities(admission);
  assert.equal(identities.length, 44);
  assert.equal(assessAdmissionSnapshot({ admission, currentIdentities: identities }).pass, true);
  const changed = identities.map((entry) => ({ ...entry }));
  changed.find((entry) => entry.path.includes('place_memorial_array.glb')).sha256 = 'f'.repeat(64);
  const stale = assessAdmissionSnapshot({ admission, currentIdentities: changed });
  assert.equal(stale.pass, false);
  assert.match(stale.failures.join('\n'), /admitted identity changed/);
});

test('solo-integrator KEEP review must bind all three assets and all 27 exact views', () => {
  const admission = fakeAdmission();
  const review = validReview(admission);
  assert.equal(assessNavigationInfrastructurePromotionReview({ review, admission }).pass, true);
  review.assets[1].decision = 'REVISE';
  const revised = assessNavigationInfrastructurePromotionReview({ review, admission });
  assert.equal(revised.pass, false);
  assert.match(revised.failures.join('\n'), /place_memorial_array/);
  review.assets[1].decision = 'KEEP';
  review.reviewer = { kind: 'human', id: 'nobody', evidenceBound: false };
  assert.match(
    assessNavigationInfrastructurePromotionReview({ review, admission }).failures.join('\n'),
    /solo integrator/,
  );
});

test('manifest plan changes exactly two existing rows plus one anchored insertion', () => {
  const fixture = manifestFixtures();
  const assessment = assessNavigationInfrastructureManifestPlan(fixture);
  assert.equal(assessment.pass, true, assessment.failures.join('\n'));
  assert.deepEqual(
    fixture.nextParts.parts.map((row) => row.id),
    [
      'unrelated_before',
      'place_station_billboard',
      'place_memorial_array',
      'unrelated_middle',
      'place_nav_buoy',
      'unrelated_after',
    ],
  );
  assert.deepEqual(
    fixture.nextParts.runtimeSlots.place,
    [
      'places/unrelated_before.glb',
      'places/place_station_billboard.glb',
      'places/place_memorial_array.glb',
      'places/unrelated_middle.glb',
      'places/place_nav_buoy.glb',
      'places/unrelated_after.glb',
    ],
  );

  const partial = structuredClone(fixture.nextRelease);
  partial.assets = partial.assets.filter((row) => row.id !== 'place_memorial_array');
  const partialResult = assessNavigationInfrastructureManifestPlan({ ...fixture, nextRelease: partial });
  assert.equal(partialResult.pass, false);
  assert.match(partialResult.failures.join('\n'), /release manifest insertion/);

  const collateral = structuredClone(fixture.nextParts);
  collateral.parts.find((row) => row.id === 'unrelated_middle').value = 999;
  const collateralResult = assessNavigationInfrastructureManifestPlan({ ...fixture, nextParts: collateral });
  assert.equal(collateralResult.pass, false);
  assert.match(collateralResult.failures.join('\n'), /untouched rows/);

  const slotCollateral = structuredClone(fixture.nextParts);
  slotCollateral.runtimeSlots.place.push('places/collateral.glb');
  const slotCollateralResult = assessNavigationInfrastructureManifestPlan({
    ...fixture,
    nextParts: slotCollateral,
  });
  assert.equal(slotCollateralResult.pass, false);
  assert.match(slotCollateralResult.failures.join('\n'), /parts manifest insertion/);
});

test('publication transaction is exactly 11 files and treats the new trio as absent', () => {
  const fixture = manifestFixtures();
  const admission = fakeAdmission();
  const rootDir = resolve('C:/synthetic-spaceface-root');
  const baseline = {
    assets: Object.fromEntries(CONTRACT.assets.map((asset) => [asset.key, {
      source: asset.partId === 'place_memorial_array' ? null : identity(asset.paths.liveSource),
      release: asset.partId === 'place_memorial_array' ? null : identity(asset.paths.liveRelease),
      blender: asset.partId === 'place_memorial_array' ? null : identity(asset.paths.liveBlend),
    }])),
    partsManifest: identity(CONTRACT.paths.partsManifest),
    releaseManifest: identity(CONTRACT.paths.releaseManifest),
  };
  const admittedBlendByKey = Object.fromEntries(CONTRACT.assets.map((asset) => [asset.key, {
    ...admission.facts.assets[asset.key].blender,
    contents: Buffer.from(`blend-${asset.partId}`),
  }]));
  const releases = Object.fromEntries(CONTRACT.assets.map((asset) => [asset.key, {
    ...identity(asset.paths.liveRelease, 500),
    sha256: fixture.expectedByKey[asset.key].releaseSha256,
    contents: Buffer.from(`release-${asset.partId}`),
  }]));
  // The descriptor builders are pure; payload validators intentionally run only inside the
  // publisher after every file has staged.
  const transaction = buildNavigationInfrastructurePublicationTransaction({
    rootDir,
    baseline,
    admission,
    reviewIdentity: identity(CONTRACT.paths.promotionReview),
    promotedByKey: fixture.promotedByKey,
    admittedBlendByKey,
    nextPartsBytes: Buffer.from(JSON.stringify(fixture.nextParts)),
    prepared: {
      releases,
      releaseManifest: {
        ...identity(CONTRACT.paths.releaseManifest),
        sha256: sha256(Buffer.from(JSON.stringify(fixture.nextRelease))),
        contents: Buffer.from(JSON.stringify(fixture.nextRelease)),
      },
    },
  });
  assert.equal(transaction.files.length, 11);
  assert.equal(new Set(transaction.files.map((file) => file.path.toLowerCase())).size, 11);
  const memorialPaths = CONTRACT.assets.find((asset) => asset.key === 'memorial').paths;
  for (const path of [memorialPaths.liveSource, memorialPaths.liveBlend, memorialPaths.liveRelease]) {
    const descriptor = transaction.files.find((file) => file.path.endsWith(path.replaceAll('/', '\\')));
    assert.ok(descriptor, `missing ${path}`);
    assert.equal(descriptor.expectedCurrentSha256, null);
  }
  const omitted = { ...fixture.promotedByKey };
  delete omitted.memorial;
  assert.throws(() => buildNavigationInfrastructurePublicationTransaction({
    rootDir,
    baseline,
    admission,
    reviewIdentity: identity(CONTRACT.paths.promotionReview),
    promotedByKey: omitted,
    admittedBlendByKey,
    nextPartsBytes: Buffer.from('{}'),
    prepared: { releases, releaseManifest: { contents: Buffer.from('{}'), sha256: digest('x') } },
  }), /must contain exactly/);
});

test('disposable-root build failure cleans its candidate files and never touches live paths', async () => {
  const fixture = manifestFixtures();
  const parent = await mkdtemp(join(tmpdir(), 'spaceface-pq022-promotion-test-'));
  const sentinel = join(parent, 'live-sentinel.txt');
  await mkdir(sentinel);
  try {
    await assert.rejects(() => prepareNavigationInfrastructureRelease({
      promotedByKey: fixture.promotedByKey,
      nextPartsBytes: Buffer.from(JSON.stringify(fixture.nextParts)),
      seededReleaseManifestBytes: Buffer.from(JSON.stringify(
        seedNavigationInfrastructureReleaseManifest(fixture.beforeRelease),
      )),
      beforeParts: fixture.beforeParts,
      beforeRelease: fixture.beforeRelease,
      factsByKey: fixture.factsByKey,
      temporaryParent: parent,
      buildRelease: async () => { throw new Error('synthetic release builder failure'); },
    }), /synthetic release builder failure/);
    assert.deepEqual((await readdir(parent)).sort(), ['live-sentinel.txt']);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
