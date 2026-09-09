import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  PQ022_REFINERY_CANDIDATE_CONTRACT as contract,
  readGlb,
  validateRefineryCandidate,
} from '../scripts/lib/pq022RefineryCandidateValidation.mjs';
import {
  assessAdmissionSnapshot,
  assessRefineryPromotionReview,
  assertRefineryPromotionResult,
  buildRefineryPartsManifest,
  buildRefineryPublicationTransaction,
  parseGlbDocument,
  prepareRefineryRelease,
  promoteRefinerySourceBytes,
  requiredAdmissionIdentities,
  sha256,
} from '../scripts/promote-pq022-refinery.mjs';

function identity(path, digit, bytes = 100) {
  return { path, sha256: digit.repeat(64), bytes };
}

function fakeAdmission() {
  return {
    pass: true,
    facts: {
      candidate: identity(contract.paths.candidate, '1', 101),
      releaseMirror: identity(contract.paths.releaseMirror, '1', 101),
      blender: identity(contract.paths.blender, '2', 202),
      generator: identity(contract.paths.sourceGenerator, '3', 303),
      binding: identity(contract.paths.binding, '4', 404),
      buildReport: identity(contract.paths.buildReport, '5', 505),
      foundryReport: identity(contract.paths.foundryReport, '6', 606),
      khronosReport: identity(contract.paths.khronosReport, '7', 707),
      blenderGate: identity(contract.paths.blenderGate, '8', 808),
      renderManifest: identity(contract.paths.renderManifest, '9', 909),
      renderFiles: contract.renderViews.map((path, index) => (
        identity(path, ['a', 'b', 'c', 'd', 'e'][index], 1000 + index)
      )),
    },
  };
}

function validReview(admission) {
  return {
    schema: contract.promotionReviewSchema,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    candidateId: contract.candidateId,
    assetId: contract.partId,
    decision: 'KEEP',
    candidate: structuredClone(admission.facts.candidate),
    renderManifest: structuredClone(admission.facts.renderManifest),
    reviewer: { kind: 'solo_integrator', id: 'codex-primary', evidenceBound: true },
    views: admission.facts.renderFiles.map((entry) => ({ ...entry, decision: 'KEEP' })),
    gates: { G1: 'KEEP', G2: 'KEEP', G4: 'KEEP', emissive: 'KEEP' },
    claims: { routeEvidence: false, performanceEvidence: false },
  };
}

test('refinery promotion changes all lifecycle copies without changing exact BIN bytes', () => {
  const admission = validateRefineryCandidate();
  assert.equal(admission.pass, true, JSON.stringify(admission.failures));
  const candidate = readGlb(contract.paths.candidate);
  const candidateParsed = parseGlbDocument(candidate.contents, 'candidate refinery');
  const promoted = promoteRefinerySourceBytes(candidate.contents, candidate.sha256);
  const parsed = parseGlbDocument(promoted.bytes, 'promoted refinery');
  const scene = parsed.document.scenes[parsed.document.scene ?? 0];
  const root = parsed.document.nodes.find((node) => node.name === contract.rootNode);
  const copies = [
    parsed.document.asset.extras.spacefaceAsset,
    scene.extras.spacefaceAsset,
    root.extras.spacefaceAsset,
  ];

  assert.ok(copies.every((stamp) => stamp.state === 'integration_candidate'));
  assert.ok(copies.every((stamp) => stamp.wiringStatus === 'live_station_archetype'));
  assert.ok(copies.every((stamp) => stamp.promotedFromCandidateSha256 === candidate.sha256));
  assert.deepEqual(copies[0], copies[1]);
  assert.deepEqual(copies[0], copies[2]);
  assert.deepEqual(copies[0].claims, {
    candidateOnly: false,
    promoted: true,
    routeEvidence: false,
    performanceEvidence: false,
  });
  assert.ok(parsed.binaryPayload.equals(candidateParsed.binaryPayload));
  assert.equal(promoted.binaryPayloadSha256, sha256(candidateParsed.binaryPayload));
  assert.notEqual(promoted.sourceSha256, candidate.sha256);
});

test('strict promotion GLB parsing rejects unaligned or trailing chunks', () => {
  const candidate = readFileSync(contract.paths.candidate);
  const parsed = parseGlbDocument(candidate, 'candidate refinery');
  assert.ok(parsed.binaryPayload.length > 0);

  const trailing = Buffer.concat([candidate, Buffer.alloc(4)]);
  trailing.writeUInt32LE(trailing.length, 8);
  assert.throws(() => parseGlbDocument(trailing, 'trailing refinery'), /terminal BIN chunk/);

  const unaligned = Buffer.from(candidate);
  unaligned.writeUInt32LE(parsed.jsonLength - 1, 12);
  assert.throws(() => parseGlbDocument(unaligned, 'unaligned refinery'), /aligned JSON chunk/);
});

test('admission snapshots and promotion reviews reject stale or REVISE evidence', () => {
  const admission = fakeAdmission();
  const current = requiredAdmissionIdentities(admission).map((entry) => ({ ...entry }));
  assert.deepEqual(assessAdmissionSnapshot({ admission, currentIdentities: current }).failures, []);
  current[0].sha256 = 'f'.repeat(64);
  assert.match(
    assessAdmissionSnapshot({ admission, currentIdentities: current }).failures.join('\n'),
    /admitted identity changed/,
  );

  const review = validReview(admission);
  assert.deepEqual(assessRefineryPromotionReview({ review, admission }).failures, []);
  review.decision = 'REVISE';
  assert.match(
    assessRefineryPromotionReview({ review, admission }).failures.join('\n'),
    /decision must equal KEEP/,
  );
  review.decision = 'KEEP';
  review.reviewer.id = 'producer';
  assert.match(
    assessRefineryPromotionReview({ review, admission }).failures.join('\n'),
    /evidence-bound solo integrator/,
  );
  review.reviewer.id = 'codex-primary';
  review.views[0].sha256 = 'f'.repeat(64);
  assert.match(
    assessRefineryPromotionReview({ review, admission }).failures.join('\n'),
    /exact five admitted render files/,
  );
});

test('refinery parts promotion uses measured texture size and preserves frozen identity', () => {
  const manifest = JSON.parse(readFileSync(contract.paths.partsManifest, 'utf8'));
  const beforeRows = manifest.parts.filter((row) => row.id !== contract.partId);
  const next = buildRefineryPartsManifest(manifest, {
    sourceBytes: 12_345_678,
    sourceSha256: 'a'.repeat(64),
    candidateSha256: 'b'.repeat(64),
    lodTriangles: { LOD0: 60_000, LOD1: 22_000, LOD2: 5_000 },
    textureSize: 512,
  });
  const row = next.parts.find((item) => item.id === contract.partId);
  assert.equal(row.bytes, 12_345_678);
  assert.equal(row.tris, 60_000);
  assert.equal(row.textureSize, 512);
  assert.deepEqual(row.sockets, [
    'SOCKET_Structure_Core',
    'SOCKET_Emissive',
    'SOCKET_Dock_Approach',
  ]);
  assert.deepEqual(row.bounds.dimensionsM, contract.envelope.manifestSize);
  assert.deepEqual(next.parts.filter((item) => item.id !== contract.partId), beforeRows);
  assert.throws(() => buildRefineryPartsManifest(manifest, {
    sourceBytes: 1,
    sourceSha256: 'a'.repeat(64),
    candidateSha256: 'b'.repeat(64),
    lodTriangles: { LOD0: 3, LOD1: 2, LOD2: 1 },
  }), /textureSize/);
});

test('a temporary release-builder failure cannot mutate an arbitrary live sentinel', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'spaceface-pq022-test-parent-'));
  const sentinel = join(parent, 'live-sentinel.txt');
  writeFileSync(sentinel, 'unchanged');
  try {
    await assert.rejects(prepareRefineryRelease({
      promoted: {
        bytes: Buffer.from('candidate'),
        sourceSha256: sha256(Buffer.from('candidate')),
      },
      nextPartsBytes: Buffer.from('{}\n'),
      releaseManifestBytes: Buffer.from('{}\n'),
      beforeParts: { parts: [] },
      beforeRelease: { assets: [] },
      lodTriangles: { LOD0: 3, LOD1: 2, LOD2: 1 },
      textureSize: 1,
      temporaryParent: parent,
      buildRelease: async () => { throw new Error('injected builder failure'); },
    }), /injected builder failure/);
    assert.equal(readFileSync(sentinel, 'utf8'), 'unchanged');
    assert.deepEqual(readdirSync(parent), ['live-sentinel.txt']);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('publication is one exact five-file transaction guarded by all admitted evidence', () => {
  const admission = fakeAdmission();
  const rootDir = resolve('C:/spaceface-pq022-publication-shape');
  const baseline = {
    source: identity(contract.paths.liveSource, '1'),
    release: identity(contract.paths.liveRelease, '2'),
    blender: identity(contract.paths.liveBlend, '3'),
    partsManifest: identity(contract.paths.partsManifest, '4'),
    releaseManifest: identity(contract.paths.releaseManifest, '5'),
  };
  const promotedBytes = Buffer.from('promoted-source');
  const blendBytes = Buffer.from('admitted-blend');
  const partsBytes = Buffer.from('{"parts":[]}\n');
  const releaseBytes = Buffer.from('prepared-release');
  const releaseManifestBytes = Buffer.from('{"assets":[]}\n');
  const transaction = buildRefineryPublicationTransaction({
    rootDir,
    baseline,
    admission,
    reviewIdentity: identity(contract.paths.promotionReview, 'f'),
    promoted: {
      bytes: promotedBytes,
      sourceSha256: sha256(promotedBytes),
      binaryPayloadSha256: 'a'.repeat(64),
    },
    admittedBlend: {
      ...identity(contract.paths.blender, '2', blendBytes.length),
      sha256: sha256(blendBytes),
      contents: blendBytes,
    },
    nextPartsBytes: partsBytes,
    prepared: {
      release: {
        ...identity(contract.paths.liveRelease, '3', releaseBytes.length),
        sha256: sha256(releaseBytes),
        contents: releaseBytes,
      },
      releaseManifest: {
        ...identity(contract.paths.releaseManifest, '4', releaseManifestBytes.length),
        sha256: sha256(releaseManifestBytes),
        contents: releaseManifestBytes,
      },
    },
  });
  assert.equal(transaction.files.length, 5);
  assert.equal(new Set(transaction.files.map((file) => file.path)).size, 5);
  assert.deepEqual(transaction.files.map((file) => file.path), [
    contract.paths.liveSource,
    contract.paths.liveBlend,
    contract.paths.partsManifest,
    contract.paths.liveRelease,
    contract.paths.releaseManifest,
  ].map((path) => resolve(rootDir, path)));
  assert.equal(transaction.guards.length, requiredAdmissionIdentities(admission).length + 1);
});

test('refinery promotion result fails closed on stale source, Blend, release, or row identities', () => {
  const expected = {
    sourceSha256: 'a'.repeat(64), sourceBytes: 100,
    blenderSha256: 'b'.repeat(64), blenderBytes: 200,
    lodTriangles: { LOD0: 60_000, LOD1: 22_000, LOD2: 5_000 },
    textureSize: 512,
  };
  const valid = {
    sourceIdentity: { sha256: expected.sourceSha256, bytes: expected.sourceBytes },
    blenderIdentity: { sha256: expected.blenderSha256, bytes: expected.blenderBytes },
    releaseIdentity: { sha256: 'c'.repeat(64), bytes: 80 },
    partsRow: {
      file: contract.partFile,
      category: 'places',
      mount: 'origin',
      tris: expected.lodTriangles.LOD0,
      bytes: expected.sourceBytes,
      textureSize: expected.textureSize,
    },
    releaseRow: {
      kind: 'part:places',
      source: contract.paths.liveSource,
      release: contract.paths.liveRelease,
      sourceSha256: expected.sourceSha256,
      sourceBytes: expected.sourceBytes,
      releaseSha256: 'c'.repeat(64),
      releaseBytes: 80,
      textures: 15,
      ktx2Textures: 15,
      meshoptBufferViews: 20,
    },
    expected,
  };
  assert.deepEqual(assertRefineryPromotionResult(valid).failures, []);
  valid.releaseRow.sourceSha256 = 'd'.repeat(64);
  valid.partsRow.tris += 1;
  assert.deepEqual(assertRefineryPromotionResult(valid).failures, [
    'parts manifest row',
    'release manifest row',
  ]);
});
