import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import sharp from 'sharp';

import {
  ASHLINE_ELIGIBLE_ARTIFACT_COUNTS,
  ASHLINE_ELIGIBLE_ARTIFACT_TOTAL,
  buildAshlineEvidenceEpoch,
  validateAshlineEvidenceEpoch,
} from '../tools/art/lib/ashlineEvidenceEpoch.mjs';
import {
  assertRigTextureContractPreserved,
  assembleAshlineFinalizationTransaction,
  buildAshlineEpochInputGuards,
  buildCurrentFinalizedRows,
  canonicalizeEvidenceEpoch,
  evidenceEpochDigest,
  inspectRigAuthoredTextureContract,
  inspectRigCompressedTextureContract,
  inspectKtx2Payload,
  inspectKtx2TextureGraph,
  parseGlbBytes,
  planAshlineEvidenceRefresh,
  reconcileAshlineBuildSummary,
  selectEligibleArtifactsForEpoch,
  sha256Bytes,
  validateEvidenceEpochAgainstFinalized,
} from '../tools/art/lib/ashlineFinalizeWorkflow.mjs';
import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';
import {
  finalizeAshlinePairToMemory,
} from '../tools/art/finalize_m4_ashline_v2_candidate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RIG_SOURCE = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_rig.glb',
);
const SHIPS = Object.freeze({
  dart: Object.freeze({
    id: 'ashline_v2_dart',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_DART',
  }),
  lode: Object.freeze({
    id: 'ashline_v2_lode',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_LODE',
  }),
  rig: Object.freeze({
    id: 'ashline_v2_rig',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_RIG',
  }),
});

function pad4(buffer, byte) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, byte)]) : buffer;
}

function packGlb(json, binary = Buffer.alloc(0)) {
  const jsonBytes = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const binaryBytes = pad4(Buffer.from(binary), 0);
  const totalLength = 12 + 8 + jsonBytes.length + 8 + binaryBytes.length;
  const out = Buffer.alloc(totalLength);
  out.write('glTF', 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);
  out.writeUInt32LE(jsonBytes.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(out, 20);
  const binaryHeader = 20 + jsonBytes.length;
  out.writeUInt32LE(binaryBytes.length, binaryHeader);
  out.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binaryBytes.copy(out, binaryHeader + 8);
  return out;
}

function syntheticKtx2(width = 4, height = 4) {
  const levelIndexEnd = 104;
  const dfdOffset = levelIndexEnd;
  const dfdLength = 4;
  const levelOffset = dfdOffset + dfdLength;
  const levelLength = 4;
  const out = Buffer.alloc(levelOffset + levelLength);
  Buffer.from([
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
  ]).copy(out, 0);
  out.writeUInt32LE(0, 12);
  out.writeUInt32LE(1, 16);
  out.writeUInt32LE(width, 20);
  out.writeUInt32LE(height, 24);
  out.writeUInt32LE(0, 28);
  out.writeUInt32LE(0, 32);
  out.writeUInt32LE(1, 36);
  out.writeUInt32LE(1, 40);
  out.writeUInt32LE(0, 44);
  out.writeUInt32LE(dfdOffset, 48);
  out.writeUInt32LE(dfdLength, 52);
  out.writeBigUInt64LE(BigInt(levelOffset), 80);
  out.writeBigUInt64LE(BigInt(levelLength), 88);
  out.writeBigUInt64LE(BigInt(levelLength), 96);
  out.writeUInt32LE(dfdLength, dfdOffset);
  out.writeUInt32LE(0x01020304, levelOffset);
  return out;
}

function syntheticGlb({ assetId, compressed, material }) {
  const ktx2Bytes = compressed ? syntheticKtx2() : null;
  const json = {
    asset: {
      version: '2.0',
      extras: { spacefaceAsset: { assetId } },
    },
    images: compressed
      ? [{ name: `${material}_ktx2`, mimeType: 'image/ktx2', bufferView: 0 }]
      : [{ name: `${material}_png`, mimeType: 'image/png' }],
    textures: compressed
      ? [{ extensions: { KHR_texture_basisu: { source: 0 } } }]
      : [{ source: 0 }],
    materials: [{ name: material }],
    bufferViews: compressed
      ? [
        { buffer: 0, byteOffset: 0, byteLength: ktx2Bytes.length },
        {
          buffer: 0,
          byteOffset: ktx2Bytes.length,
          byteLength: 4,
          extensions: { EXT_meshopt_compression: {} },
        },
      ]
      : [{ buffer: 0, byteLength: 4 }],
    buffers: [{ byteLength: compressed ? ktx2Bytes.length + 4 : 4 }],
    extensionsUsed: compressed
      ? ['KHR_texture_basisu', 'EXT_meshopt_compression']
      : [],
    extensionsRequired: compressed
      ? ['KHR_texture_basisu', 'EXT_meshopt_compression']
      : [],
  };
  const binary = compressed
    ? Buffer.concat([ktx2Bytes, Buffer.alloc(4)])
    : Buffer.alloc(4);
  return packGlb(json, binary);
}

function makeFamilyFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'ashline-finalize-workflow-'));
  const family = resolve(root, 'assets/ships/m4_ashline_v2');
  for (const spec of Object.values(SHIPS)) {
    const sourcePath = resolve(family, 'source/wholeships', `${spec.id}.glb`);
    const candidatePath = resolve(
      family,
      'release_candidates/wholeships',
      `${spec.id}.glb`,
    );
    mkdirSync(dirname(sourcePath), { recursive: true });
    mkdirSync(dirname(candidatePath), { recursive: true });
    writeFileSync(sourcePath, syntheticGlb({
      assetId: spec.assetId,
      compressed: false,
      material: `${spec.id}_source_material`,
    }));
    writeFileSync(candidatePath, syntheticGlb({
      assetId: spec.assetId,
      compressed: spec.id !== 'ashline_v2_rig',
      material: `${spec.id}_candidate_material`,
    }));
  }
  return { root, family };
}

test('dry-run refresh derives live rows and performs zero fixture writes', () => {
  const fixture = makeFamilyFixture();
  try {
    const paths = Object.values(SHIPS).flatMap((spec) => [
      resolve(fixture.family, 'source/wholeships', `${spec.id}.glb`),
      resolve(fixture.family, 'release_candidates/wholeships', `${spec.id}.glb`),
    ]);
    const existingReportPath = resolve(
      fixture.family,
      'evidence/family/finalize_report.json',
    );
    mkdirSync(dirname(existingReportPath), { recursive: true });
    const staleReport = {
      finalized: Object.keys(SHIPS).map((key) => ({
        key,
        sourceSha256: 'STALE-SOURCE',
        candidateSha256: 'STALE-CANDIDATE',
      })),
    };
    writeFileSync(existingReportPath, `${JSON.stringify(staleReport, null, 2)}\n`);
    paths.push(existingReportPath);
    const before = new Map(paths.map((path) => [path, sha256Bytes(readFileSync(path))]));
    const finalized = buildCurrentFinalizedRows({
      root: fixture.root,
      family: fixture.family,
      ships: SHIPS,
    });
    const evidenceEpoch = {
      sourceCandidatePairs: finalized.map((row) => ({
        key: row.key,
        source: row.source,
        sourceSha256: row.sourceSha256,
        sourceBytes: row.sourceBytes,
        candidate: row.candidate,
        candidateSha256: row.candidateSha256,
        candidateBytes: row.candidateBytes,
      })),
      currentAcceptance: {
        perShip: { dart: true, lode: true, rig: false },
        requiresCurrentRender: true,
      },
    };
    evidenceEpoch.epochDigest = evidenceEpochDigest(evidenceEpoch);
    const plan = planAshlineEvidenceRefresh({
      root: fixture.root,
      family: fixture.family,
      ships: SHIPS,
      existing: JSON.parse(readFileSync(existingReportPath, 'utf8')),
      finalized,
      evidenceEpoch,
      packet: 'PACKET',
      isolation: { defaultPlayWired: false },
    });
    const { report } = plan;

    assert.deepEqual(plan.writes, []);
    assert.equal(plan.mode, 'dry-run-refresh-evidence-epoch');
    assert.deepEqual(report.finalized, finalized);
    assert.equal(report.finalized.some((row) => row.sourceSha256 === 'STALE-SOURCE'), false);
    const rig = report.finalized.find((row) => row.key === 'rig');
    assert.equal(rig.meshopt, 'none');
    assert.equal(rig.ktx2, 'none');
    assert.equal(rig.meshoptBufferViewCount, 0);
    assert.equal(rig.ktx2ImageCount, 0);
    const dart = report.finalized.find((row) => row.key === 'dart');
    assert.equal(dart.meshopt, 'EXT_meshopt_compression');
    assert.equal(dart.ktx2, 'KHR_texture_basisu/KTX2');
    assert.equal(dart.meshoptBufferViewCount, 1);
    assert.equal(dart.ktx2ImageCount, 1);
    for (const path of paths) {
      assert.equal(sha256Bytes(readFileSync(path)), before.get(path), `${path} was mutated`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('selected stale evidence is excluded with an exact rerender diagnostic', () => {
  const currentRig = 'A'.repeat(64);
  const staleRig = 'B'.repeat(64);
  const currentDart = 'C'.repeat(64);
  const result = selectEligibleArtifactsForEpoch({
    receipts: [
      {
        shipKey: 'dart',
        path: 'eligible_artifacts.json',
        receipt: {
          schema: 'spaceface.ashlineMaterialTruthArtifacts.v1',
          shipKey: 'dart',
          sourceSha256: currentDart,
          artifacts: [{
            path: 'dart/current.png',
            inputBindings: [{ shipKey: 'dart', sourceSha256: currentDart }],
          }],
        },
      },
      {
        shipKey: 'rig',
        path: 'eligible_artifacts_rig.json',
        receipt: {
          schema: 'spaceface.ashlineMaterialTruthArtifacts.v1',
          shipKey: 'rig',
          sourceSha256: staleRig,
          artifacts: [{
            path: 'rig/stale.png',
            inputBindings: [{ shipKey: 'rig', sourceSha256: staleRig }],
          }],
        },
      },
    ],
    selectedShipKeys: ['rig'],
    expectedArtifactCounts: { dart: 1, rig: 1 },
    currentSourceSha256ByKey: new Map([
      ['dart', currentDart],
      ['rig', currentRig],
    ]),
  });

  assert.deepEqual(result.eligibleArtifacts.map((artifact) => artifact.path), ['dart/current.png']);
  assert.deepEqual(result.diagnostics, [{
    shipKey: 'rig',
    receiptPath: 'eligible_artifacts_rig.json',
    eligible: false,
    artifactCount: 1,
    receiptSourceSha256: staleRig,
    boundSourceSha256: [staleRig],
    currentSourceSha256: currentRig,
    reason: 'selected-ship-source-changed-requires-complete-exact-source-rerender',
    action: 'rerender-all-eligible-artifacts-from-finalized-source',
  }]);
});

test('stale evidence is excluded even when its ship is not selected', () => {
  const currentRig = 'A'.repeat(64);
  const staleRig = 'B'.repeat(64);
  const result = selectEligibleArtifactsForEpoch({
    receipts: [{
      shipKey: 'rig',
      path: 'eligible_artifacts_rig.json',
      receipt: {
        schema: 'spaceface.ashlineMaterialTruthArtifacts.v1',
        shipKey: 'rig',
        sourceSha256: staleRig,
        artifacts: [{
          path: 'rig/stale.png',
          inputBindings: [{ shipKey: 'rig', sourceSha256: staleRig }],
        }],
      },
    }],
    selectedShipKeys: ['dart'],
    expectedArtifactCounts: { rig: 1 },
    currentSourceSha256ByKey: new Map([['rig', currentRig]]),
  });

  assert.deepEqual(result.eligibleArtifacts, []);
  assert.equal(
    result.diagnostics[0].reason,
    'receipt-source-mismatch-requires-complete-exact-source-rerender',
  );
  assert.equal(result.diagnostics[0].currentSourceSha256, currentRig);
});

test('stale visual bindings are not relabeled to the current source hash', () => {
  const oldHash = 'A'.repeat(64);
  const currentHash = 'B'.repeat(64);
  const summary = reconcileAshlineBuildSummary({
    summary: {
      sourceSha256: oldHash,
      sourceBytes: 10,
      materialTruth: {
        sourceSha256: oldHash,
        sourceHashBinding: { sourceSha256: oldHash },
      },
    },
    row: {
      key: 'rig',
      sourceSha256: currentHash,
      sourceBytes: 20,
    },
    evidenceEpoch: {
      epochDigest: 'EPOCH',
      currentAcceptance: { perShip: { rig: false } },
    },
    invalidation: {
      reason: 'selected-ship-source-changed-requires-complete-exact-source-rerender',
      action: 'rerender-all-eligible-artifacts-from-finalized-source',
    },
  });

  assert.equal(summary.sourceSha256, currentHash);
  assert.equal(summary.sourceBytes, 20);
  assert.equal(summary.materialTruth.sourceSha256, oldHash);
  assert.equal(summary.materialTruth.sourceHashBinding.sourceSha256, oldHash);
  assert.equal(summary.evidenceEpoch.visualEvidence, 'requires-current-versioned-render');
});

test('Rig acceptance requires 11 artifacts and the complete family requires 29', () => {
  assert.deepEqual(ASHLINE_ELIGIBLE_ARTIFACT_COUNTS, {
    dart: 8,
    lode: 10,
    rig: 11,
  });
  assert.equal(ASHLINE_ELIGIBLE_ARTIFACT_TOTAL, 29);
  const currentHash = 'C'.repeat(64);
  const result = selectEligibleArtifactsForEpoch({
    receipts: [{
      shipKey: 'rig',
      path: 'eligible_artifacts_rig.json',
      receipt: {
        schema: 'spaceface.ashlineMaterialTruthArtifacts.v1',
        shipKey: 'rig',
        sourceSha256: currentHash,
        artifacts: Array.from({ length: 10 }, (_, index) => ({
          path: `rig/view-${index}.png`,
          inputBindings: [{ shipKey: 'rig', sourceSha256: currentHash }],
        })),
      },
    }],
    selectedShipKeys: ['rig'],
    currentSourceSha256ByKey: new Map([['rig', currentHash]]),
  });

  assert.deepEqual(result.eligibleArtifacts, []);
  assert.deepEqual(result.diagnostics.map((diagnostic) => ({
    shipKey: diagnostic.shipKey,
    expectedArtifactCount: diagnostic.expectedArtifactCount,
    actualArtifactCount: diagnostic.actualArtifactCount,
    reason: diagnostic.reason,
  })), [{
    shipKey: 'rig',
    expectedArtifactCount: 11,
    actualArtifactCount: 10,
    reason: 'eligible-artifact-count-mismatch-requires-complete-exact-source-rerender',
  }]);
});

test('family refresh excludes every stale ship receipt instead of crashing epoch validation', () => {
  const current = Object.fromEntries(
    Object.keys(SHIPS).map((key, index) => [key, String(index + 1).repeat(64)]),
  );
  const receipts = Object.keys(SHIPS).map((shipKey) => {
    const sourceSha256 = shipKey === 'lode' ? 'F'.repeat(64) : current[shipKey];
    return {
      shipKey,
      path: `${shipKey}.json`,
      receipt: {
        schema: 'spaceface.ashlineMaterialTruthArtifacts.v1',
        shipKey,
        sourceSha256,
        artifacts: [{
          path: `${shipKey}/view.png`,
          inputBindings: [{ shipKey, sourceSha256 }],
        }],
      },
    };
  });
  const result = selectEligibleArtifactsForEpoch({
    receipts,
    selectedShipKeys: Object.keys(SHIPS),
    expectedArtifactCounts: { dart: 1, lode: 1, rig: 1 },
    currentSourceSha256ByKey: new Map(Object.entries(current)),
  });

  assert.deepEqual(
    result.eligibleArtifacts.map((artifact) => artifact.path),
    ['dart/view.png', 'rig/view.png'],
  );
  assert.deepEqual(result.diagnostics.map((row) => row.shipKey), ['lode']);
  assert.equal(
    result.diagnostics[0].reason,
    'selected-ship-source-changed-requires-complete-exact-source-rerender',
  );
});

test('prospective epoch paths canonicalize to the in-memory rows before one transaction', async () => {
  const fixture = makeFamilyFixture();
  try {
    const finalized = buildCurrentFinalizedRows({
      root: fixture.root,
      family: fixture.family,
      ships: SHIPS,
    });
    const prospective = await buildAshlineEvidenceEpoch({
      root: ROOT,
      family: fixture.family,
      ships: Object.entries(SHIPS).map(([key, spec]) => ({ key, id: spec.id })),
      toolPaths: [],
      eligibleArtifacts: [],
      legacyArtifacts: [],
    });
    assert.equal(
      (await validateAshlineEvidenceEpoch(prospective, { root: ROOT })).pass,
      true,
      'the scratch pair epoch must validate before its paths are canonicalized',
    );
    assert.deepEqual(prospective.currentAcceptance.perShip, {
      dart: false,
      lode: false,
      rig: false,
    });
    assert.equal(prospective.currentAcceptance.visualEvidenceEligible, false);
    assert.equal(prospective.currentAcceptance.requiresCurrentRender, true);
    assert.equal(prospective.epochDigest, evidenceEpochDigest(prospective));
    const canonical = canonicalizeEvidenceEpoch(prospective, finalized);
    assert.equal(
      validateEvidenceEpochAgainstFinalized(canonical, finalized).pass,
      true,
    );
    assert.deepEqual(
      canonical.sourceCandidatePairs.map((pair) => pair.source),
      finalized.map((row) => row.source),
    );
    const pairGuards = buildAshlineEpochInputGuards({
      root: fixture.root,
      evidenceEpoch: canonical,
      outputShipKeys: ['rig'],
    }).filter((guard) => guard.kind.startsWith('pair:'));
    assert.deepEqual(
      pairGuards.map((guard) => guard.kind).sort(),
      [
        'pair:dart:candidate',
        'pair:dart:source',
        'pair:lode:candidate',
        'pair:lode:source',
      ],
    );
    const duplicateKeyEpoch = structuredClone(canonical);
    duplicateKeyEpoch.sourceCandidatePairs[2] = structuredClone(
      duplicateKeyEpoch.sourceCandidatePairs[0],
    );
    duplicateKeyEpoch.currentAcceptance.perShip = {
      dart: false,
      lode: false,
    };
    duplicateKeyEpoch.currentAcceptance.visualEvidenceEligible = false;
    duplicateKeyEpoch.currentAcceptance.requiresCurrentRender = true;
    duplicateKeyEpoch.epochDigest = evidenceEpochDigest(duplicateKeyEpoch);
    const duplicateReceiptValidation = await validateAshlineEvidenceEpoch(
      duplicateKeyEpoch,
      { root: fixture.root },
    );
    assert.ok(
      duplicateReceiptValidation.failures.includes('pairs:duplicate-key:dart:2'),
      duplicateReceiptValidation.failures.join('\n'),
    );
    assert.ok(
      duplicateReceiptValidation.failures.includes('pairs:missing-key:rig'),
      duplicateReceiptValidation.failures.join('\n'),
    );
    const duplicateFinalizedValidation = validateEvidenceEpochAgainstFinalized(
      duplicateKeyEpoch,
      finalized,
    );
    assert.ok(
      duplicateFinalizedValidation.failures.includes('pairs:duplicate-key:dart:2'),
      duplicateFinalizedValidation.failures.join('\n'),
    );
    assert.ok(
      duplicateFinalizedValidation.failures.includes('pairs:missing-key:rig'),
      duplicateFinalizedValidation.failures.join('\n'),
    );

    const sourceBinary = { path: 'source.glb', bytes: Buffer.from('source') };
    const candidateBinary = { path: 'candidate.glb', bytes: Buffer.from('candidate') };
    const report = { path: 'finalize_report.json', bytes: Buffer.from('{}') };
    const summary = { path: 'build_summary.json', bytes: Buffer.from('{}') };
    assert.deepEqual(
      assembleAshlineFinalizationTransaction(
        [sourceBinary, candidateBinary],
        [report, summary],
      ),
      [sourceBinary, candidateBinary, report, summary],
    );
    assert.throws(
      () => assembleAshlineFinalizationTransaction([sourceBinary], [sourceBinary]),
      /distinct binary and receipt files/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('epoch input guards prevent a mixed receipt epoch and roll back promoted files', async () => {
  const fixture = makeFamilyFixture();
  try {
    const toolPath = resolve(fixture.root, 'tools/render-rig.mjs');
    const relativeArtifacts = Array.from(
      { length: ASHLINE_ELIGIBLE_ARTIFACT_COUNTS.dart },
      (_, index) => (
        `assets/ships/m4_ashline_v2/evidence/material_truth_v2/dart/view-${index}.png`
      ),
    );
    const artifactPaths = relativeArtifacts.map((path) => resolve(fixture.root, path));
    const receiptPath = resolve(
      fixture.root,
      'assets/ships/m4_ashline_v2/evidence/material_truth_v2/eligible_artifacts.json',
    );
    const absentReceiptPath = resolve(
      fixture.root,
      'assets/ships/m4_ashline_v2/evidence/material_truth_v2/eligible_artifacts_lode.json',
    );
    const legacyArtifactPath = resolve(
      fixture.root,
      'assets/ships/m4_ashline_v2/evidence/family/legacy-view.png',
    );
    mkdirSync(dirname(toolPath), { recursive: true });
    mkdirSync(dirname(artifactPaths[0]), { recursive: true });
    writeFileSync(toolPath, 'export const renderer = "fixture";\n');
    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 16, g: 32, b: 48, alpha: 1 },
      },
    }).png().toFile(artifactPaths[0]);
    for (const artifactPath of artifactPaths.slice(1)) {
      writeFileSync(artifactPath, readFileSync(artifactPaths[0]));
    }
    mkdirSync(dirname(legacyArtifactPath), { recursive: true });
    writeFileSync(legacyArtifactPath, readFileSync(artifactPaths[0]));

    const finalized = buildCurrentFinalizedRows({
      root: fixture.root,
      family: fixture.family,
      ships: SHIPS,
    });
    const dartSourceHash = finalized.find((row) => row.key === 'dart').sourceSha256;
    const relativeTool = 'tools/render-rig.mjs';
    const artifactDescriptors = relativeArtifacts.map((path) => ({
      path,
      inputBindings: [{ shipKey: 'dart', sourceSha256: dartSourceHash }],
      producer: {
        path: relativeTool,
        sha256: sha256Bytes(readFileSync(toolPath)),
      },
    }));
    writeFileSync(receiptPath, `${JSON.stringify({
      schema: 'spaceface.ashlineMaterialTruthArtifacts.v1',
      shipKey: 'dart',
      sourceSha256: dartSourceHash,
      artifacts: artifactDescriptors,
    }, null, 2)}\n`);

    const epoch = await buildAshlineEvidenceEpoch({
      root: fixture.root,
      family: fixture.family,
      ships: Object.entries(SHIPS).map(([key, spec]) => ({ key, id: spec.id })),
      toolPaths: [relativeTool],
      eligibleArtifacts: artifactDescriptors,
      legacyArtifacts: [
        'assets/ships/m4_ashline_v2/evidence/family/legacy-view.png',
      ],
    });
    assert.equal(
      (await validateAshlineEvidenceEpoch(epoch, { root: fixture.root })).pass,
      true,
    );
    const partialEpoch = structuredClone(epoch);
    partialEpoch.eligibleArtifacts.pop();
    partialEpoch.currentAcceptance.perShip.dart = false;
    partialEpoch.currentAcceptance.visualEvidenceEligible = false;
    partialEpoch.currentAcceptance.requiresCurrentRender = true;
    partialEpoch.epochDigest = evidenceEpochDigest(partialEpoch);
    const partialValidation = await validateAshlineEvidenceEpoch(
      partialEpoch,
      { root: fixture.root },
    );
    assert.ok(
      partialValidation.failures.includes('eligibleArtifactContract:dart:7!=8'),
      partialValidation.failures.join('\n'),
    );
    const guards = buildAshlineEpochInputGuards({
      root: fixture.root,
      evidenceEpoch: epoch,
      receiptSnapshots: [{
        absolutePath: receiptPath,
        expectedCurrentSha256: sha256Bytes(readFileSync(receiptPath)),
      }, {
        absolutePath: absentReceiptPath,
        expectedCurrentSha256: null,
      }],
      outputShipKeys: [],
    });
    assert.equal(guards.filter((guard) => guard.kind.startsWith('pair:')).length, 6);
    assert.deepEqual(
      [...new Set(guards.map((guard) => guard.kind))].sort(),
      [
        'artifact-receipt',
        'eligible-artifact',
        'legacy-artifact',
        'pair:dart:candidate',
        'pair:dart:source',
        'pair:lode:candidate',
        'pair:lode:source',
        'pair:rig:candidate',
        'pair:rig:source',
        'producer-tool',
      ],
    );
    assert.equal(
      guards.find((guard) => guard.path === absentReceiptPath)?.expectedCurrentSha256,
      null,
    );

    const outputPaths = [
      resolve(fixture.root, 'finalize_report.json'),
      resolve(fixture.root, 'build_summary.json'),
    ];
    for (const path of outputPaths) writeFileSync(path, '{"epoch":"old"}\n');
    const guardedDartSource = resolve(
      fixture.family,
      'source/wholeships/ashline_v2_dart.glb',
    );
    let injectedDrift = false;
    await assert.rejects(
      () => publishFileSetTransaction({
        files: outputPaths.map((path) => ({
          path,
          bytes: Buffer.from(`${JSON.stringify({ epoch: epoch.epochDigest })}\n`),
          expectedCurrentSha256: sha256Bytes(readFileSync(path)),
          validate: async (_stagedPath, bytes) => JSON.parse(bytes.toString('utf8')),
        })),
        guards,
        fileOps: {
          link: async (from, to) => {
            const { link, writeFile } = await import('node:fs/promises');
            await link(from, to);
            if (to === outputPaths[0] && !injectedDrift) {
              injectedDrift = true;
              await writeFile(guardedDartSource, 'concurrent-source-epoch');
            }
          },
        },
      }),
      /promoting.*current SHA-256 changed.*original destinations restored/s,
    );

    assert.deepEqual(
      outputPaths.map((path) => readFileSync(path, 'utf8')),
      ['{"epoch":"old"}\n', '{"epoch":"old"}\n'],
    );
    assert.equal(readFileSync(guardedDartSource, 'utf8'), 'concurrent-source-epoch');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Rig authored texture contract covers six physical roles and eighteen 256px images', () => {
  const contract = inspectRigAuthoredTextureContract(readFileSync(RIG_SOURCE));
  assert.equal(contract.materialCount, 6);
  assert.equal(contract.imageCount, 18);
  assert.equal(contract.textureSize, 256);
  assert.deepEqual(
    [...new Set(contract.images.map((image) => image.role))].sort(),
    ['baseColor', 'normal', 'orm'],
  );
  assert.equal(
    new Set(contract.images.map((image) => image.sha256)).size,
    18,
    'each authored material role must retain its own image payload',
  );
  assert.doesNotThrow(() => assertRigTextureContractPreserved(
    contract,
    structuredClone(contract),
  ));
  const changed = structuredClone(contract);
  changed.images[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => assertRigTextureContractPreserved(contract, changed),
    /builder-authored base\/ORM\/normal images changed/u,
  );
});

test('Rig source contract rejects extra graph entries and non-ORM occlusion bindings', () => {
  const { json, binary } = parseGlbBytes(readFileSync(RIG_SOURCE));
  const mutations = [
    {
      label: 'extra material',
      pattern: /material count 7 != 6/u,
      apply: (gltf) => gltf.materials.push({
        ...structuredClone(gltf.materials[0]),
        name: 'Material_Unexpected',
      }),
    },
    {
      label: 'extra texture',
      pattern: /expected exactly 18 textures\/images, got 19\/18/u,
      apply: (gltf) => gltf.textures.push(structuredClone(gltf.textures[0])),
    },
    {
      label: 'extra image',
      pattern: /expected exactly 18 textures\/images, got 18\/19/u,
      apply: (gltf) => gltf.images.push(structuredClone(gltf.images[0])),
    },
    {
      label: 'non-ORM occlusion binding',
      pattern: /occlusion texture must be the authored ORM texture/u,
      apply: (gltf) => {
        gltf.materials[0].occlusionTexture.index =
          gltf.materials[0].pbrMetallicRoughness.baseColorTexture.index;
      },
    },
  ];
  for (const mutation of mutations) {
    const changed = structuredClone(json);
    mutation.apply(changed);
    assert.throws(
      () => inspectRigAuthoredTextureContract(
        packGlb(changed, binary),
        mutation.label,
      ),
      mutation.pattern,
    );
  }
});

test('shared KTX2 validation rejects truncation, bad level bounds, and direct-source graphs', () => {
  const truncated = Buffer.alloc(28);
  Buffer.from([
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
  ]).copy(truncated);
  assert.throws(
    () => inspectKtx2Payload(truncated, '28-byte MIME-only fake'),
    /truncated KTX2 header 28\/80/u,
  );

  const badLevelBounds = syntheticKtx2();
  badLevelBounds.writeBigUInt64LE(BigInt(badLevelBounds.length + 64), 80);
  assert.throws(
    () => inspectKtx2Payload(badLevelBounds, 'bad level bounds'),
    /level 0 range is out of bounds/u,
  );

  const validDart = syntheticGlb({
    assetId: SHIPS.dart.assetId,
    compressed: true,
    material: 'Dart_Material',
  });
  assert.equal(
    inspectKtx2TextureGraph(validDart, 'valid Dart', {
      expectedWidth: 4,
    }).imageCount,
    1,
  );
  const parsedDart = parseGlbBytes(validDart);
  const mimeOnlyDart = structuredClone(parsedDart.json);
  mimeOnlyDart.textures[0] = { source: 0 };
  assert.throws(
    () => inspectKtx2TextureGraph(
      packGlb(mimeOnlyDart, parsedDart.binary),
      'Dart MIME-only direct source',
    ),
    /texture 0 is not bound through KHR_texture_basisu/u,
  );

  const parsedLode = parseGlbBytes(syntheticGlb({
    assetId: SHIPS.lode.assetId,
    compressed: true,
    material: 'Lode_Material',
  }));
  const fallbackLode = structuredClone(parsedLode.json);
  fallbackLode.textures[0].source = 0;
  assert.throws(
    () => inspectKtx2TextureGraph(
      packGlb(fallbackLode, parsedLode.binary),
      'Lode direct-source fallback',
    ),
    /texture 0 retains a direct-source fallback binding/u,
  );
});

test('actual Rig source finalizes in memory to an exact KTX2 and Meshopt candidate', async () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'ashline-rig-finalize-'));
  try {
    const sourceFile = resolve(tempRoot, 'source/ashline_v2_rig.glb');
    const candidateFile = resolve(tempRoot, 'candidate/ashline_v2_rig.glb');
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, readFileSync(RIG_SOURCE));
    const tempBefore = sha256Bytes(readFileSync(sourceFile));

    const result = await finalizeAshlinePairToMemory({
      key: 'rig',
      spec: {
        id: 'ashline_v2_rig',
        assetId: 'SF_WHOLESHIP_ASHLINE_V2_RIG',
        partId: 'wholeship_ashline_v2_rig',
        role: 'tether_control_raider',
      },
      sourceFile,
      candidateFile,
    });
    const sourceOutput = result.files.find((file) => file.path === sourceFile);
    const candidateOutput = result.files.find((file) => file.path === candidateFile);
    assert.ok(sourceOutput);
    assert.ok(candidateOutput);
    assert.equal(sha256Bytes(readFileSync(sourceFile)), tempBefore);
    assert.equal(existsSync(candidateFile), false);

    const sourceContract = inspectRigAuthoredTextureContract(sourceOutput.bytes);
    const candidateContract = inspectRigCompressedTextureContract(candidateOutput.bytes);
    assert.equal(sourceContract.materialCount, 6);
    assert.equal(sourceContract.imageCount, 18);
    assert.equal(candidateContract.materialCount, 6);
    assert.equal(candidateContract.imageCount, 18);
    assert.equal(new Set(candidateContract.images.map((image) => image.sha256)).size, 18);
    const parsedCandidate = parseGlbBytes(candidateOutput.bytes);
    const candidateFacts = parsedCandidate.json;
    assert.ok(candidateFacts.extensionsUsed.includes('EXT_meshopt_compression'));
    assert.ok(candidateFacts.extensionsUsed.includes('KHR_texture_basisu'));
    assert.equal(
      candidateFacts.bufferViews.filter(
        (view) => view.extensions?.EXT_meshopt_compression,
      ).length > 0,
      true,
    );
    const reusedCandidateImage = structuredClone(candidateFacts);
    const firstMaterial = reusedCandidateImage.materials[0];
    const baseTexture = firstMaterial.pbrMetallicRoughness.baseColorTexture.index;
    const normalTexture = firstMaterial.normalTexture.index;
    reusedCandidateImage.textures[baseTexture].extensions.KHR_texture_basisu.source =
      reusedCandidateImage.textures[normalTexture].extensions.KHR_texture_basisu.source;
    assert.throws(
      () => inspectRigCompressedTextureContract(
        packGlb(reusedCandidateImage, parsedCandidate.binary),
        'candidate reused image',
      ),
      /image .* !=|compressed image .* is reused|KTX2 image .* is unreferenced/u,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
