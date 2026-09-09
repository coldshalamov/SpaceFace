#!/usr/bin/env node

// Fail-closed refinery promotion. Candidate/review evidence stays immutable, release generation
// happens in a disposable root, and exactly five live files publish in one hash-guarded transaction.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';
import { buildSelectedPlaceReleaseAssets } from './build-place-release-assets.mjs';
import {
  PQ022_REFINERY_CANDIDATE_CONTRACT,
  validateRefineryCandidate,
} from './lib/pq022RefineryCandidateValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = PQ022_REFINERY_CANDIDATE_CONTRACT;
const APPLY = process.argv.includes('--apply');

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function jsonEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function publicIdentity(identity) {
  return identity ? { path: identity.path, sha256: identity.sha256, bytes: identity.bytes } : null;
}

function assertRelativeContractPath(value, label) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.replace(/\\/g, '/').includes('../')) {
    throw new Error(`${label} must be a repository-relative contract path`);
  }
}

function resolveUnder(rootDir, relativePath, label = 'contract path') {
  assertRelativeContractPath(relativePath, label);
  const root = resolve(rootDir);
  const target = resolve(root, relativePath);
  const delta = relative(root, target);
  if (!delta || delta === '..' || delta.startsWith(`..${sep}`) || isAbsolute(delta)) {
    throw new Error(`${label} escapes or aliases its verified root: ${relativePath}`);
  }
  return target;
}

function identityAtRoot(rootDir, relativePath) {
  const contents = readFileSync(resolveUnder(rootDir, relativePath));
  return {
    path: relativePath,
    sha256: sha256(contents),
    bytes: contents.length,
    contents,
  };
}

export function parseGlbDocument(bytes, label = 'GLB') {
  const payload = Buffer.from(bytes || []);
  if (payload.length < 28 || payload.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${label}: invalid GLB magic or truncated two-chunk payload`);
  }
  if (payload.readUInt32LE(4) !== 2 || payload.readUInt32LE(8) !== payload.length) {
    throw new Error(`${label}: invalid GLB v2 length`);
  }
  const jsonLength = payload.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  if (jsonLength === 0 || jsonLength % 4 !== 0
      || payload.readUInt32LE(16) !== 0x4e4f534a
      || jsonEnd + 8 > payload.length) {
    throw new Error(`${label}: expected one aligned JSON chunk followed by BIN`);
  }
  const binaryLength = payload.readUInt32LE(jsonEnd);
  const binaryStart = jsonEnd + 8;
  const binaryEnd = binaryStart + binaryLength;
  if (binaryLength === 0 || binaryLength % 4 !== 0
      || payload.readUInt32LE(jsonEnd + 4) !== 0x004e4942
      || binaryEnd !== payload.length) {
    throw new Error(`${label}: expected one aligned terminal BIN chunk with no trailing data`);
  }
  const document = JSON.parse(payload.subarray(20, jsonEnd).toString('utf8').trim());
  return {
    bytes: payload,
    document,
    jsonLength,
    binaryLength,
    binaryPayload: payload.subarray(binaryStart, binaryEnd),
    binarySuffix: payload.subarray(jsonEnd),
  };
}

function lifecycleCopies(document, label) {
  const scene = document.scenes?.[document.scene ?? 0];
  const root = (document.nodes || []).find((node) => node.name === CONTRACT.rootNode);
  const copies = [
    ['asset', document.asset?.extras?.spacefaceAsset],
    ['default scene', scene?.extras?.spacefaceAsset],
    ['canonical root', root?.extras?.spacefaceAsset],
  ];
  if (copies.some(([, stamp]) => !stamp)
      || copies.some(([, stamp]) => !jsonEqual(stamp, copies[0][1]))) {
    throw new Error(`${label}: asset, default-scene, and canonical-root lifecycle copies are not identical`);
  }
  return copies;
}

function assertCandidateLifecycle(stamp) {
  if (stamp?.candidateId !== CONTRACT.candidateId
      || stamp?.dispatchUnit !== CONTRACT.dispatchUnit
      || stamp?.state !== CONTRACT.candidateState
      || stamp?.wiringStatus !== 'isolated_candidate'
      || !jsonEqual(stamp?.claims, CONTRACT.claims)) {
    throw new Error('refinery candidate lifecycle stamp is not the admitted candidate-only boundary');
  }
}

function promoteLifecycleStamp(stamp, candidateSha256) {
  stamp.state = 'integration_candidate';
  stamp.wiringStatus = 'live_station_archetype';
  stamp.promotedFromCandidateSha256 = candidateSha256;
  stamp.promotionDispatchUnit = CONTRACT.dispatchUnit;
  stamp.claims = {
    candidateOnly: false,
    promoted: true,
    routeEvidence: false,
    performanceEvidence: false,
  };
}

export function promoteRefinerySourceBytes(candidateBytes, candidateSha256) {
  if (!/^[0-9a-f]{64}$/.test(candidateSha256 || '')) {
    throw new Error('refinery promotion requires the exact lowercase candidate SHA-256');
  }
  const parsed = parseGlbDocument(candidateBytes, 'refinery candidate');
  if (sha256(parsed.bytes) !== candidateSha256) {
    throw new Error('refinery candidate bytes do not match the admitted SHA-256');
  }
  const copies = lifecycleCopies(parsed.document, 'refinery candidate');
  assertCandidateLifecycle(copies[0][1]);
  for (const [, stamp] of copies) promoteLifecycleStamp(stamp, candidateSha256);
  if (copies.some(([, stamp]) => !jsonEqual(stamp, copies[0][1]))) {
    throw new Error('refinery lifecycle promotion diverged across contract copies');
  }

  const json = Buffer.from(JSON.stringify(parsed.document));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const output = Buffer.alloc(20 + paddedLength + parsed.binarySuffix.length, 0x20);
  parsed.bytes.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  parsed.binarySuffix.copy(output, 20 + paddedLength);

  const promoted = parseGlbDocument(output, 'promoted refinery source');
  const promotedCopies = lifecycleCopies(promoted.document, 'promoted refinery source');
  if (!promoted.binaryPayload.equals(parsed.binaryPayload)
      || promotedCopies.some(([, stamp]) => stamp.state !== 'integration_candidate'
        || stamp.wiringStatus !== 'live_station_archetype'
        || stamp.promotedFromCandidateSha256 !== candidateSha256
        || stamp.claims?.routeEvidence !== false
        || stamp.claims?.performanceEvidence !== false)) {
    throw new Error('refinery promotion changed BIN bytes or failed its lifecycle transform');
  }
  return {
    bytes: output,
    candidateSha256,
    sourceSha256: sha256(output),
    binaryPayloadSha256: sha256(promoted.binaryPayload),
    binaryPayloadBytes: promoted.binaryPayload.length,
    binarySuffixSha256: sha256(promoted.binarySuffix),
    document: promoted.document,
  };
}

export function buildRefineryPartsManifest(partsManifest, {
  sourceBytes,
  sourceSha256,
  candidateSha256,
  lodTriangles,
  textureSize,
} = {}) {
  if (!partsManifest || !Array.isArray(partsManifest.parts)) {
    throw new TypeError('refinery promotion requires a parts manifest');
  }
  if (!Number.isInteger(sourceBytes) || sourceBytes <= 0
      || !/^[0-9a-f]{64}$/.test(sourceSha256 || '')
      || !/^[0-9a-f]{64}$/.test(candidateSha256 || '')
      || !Number.isInteger(textureSize) || textureSize <= 0) {
    throw new Error('refinery promotion identities and measured textureSize are incomplete');
  }
  for (const level of ['LOD0', 'LOD1', 'LOD2']) {
    if (!Number.isInteger(lodTriangles?.[level]) || lodTriangles[level] <= 0) {
      throw new Error(`refinery promotion is missing ${level} triangles`);
    }
  }
  if (!(lodTriangles.LOD0 > lodTriangles.LOD1 && lodTriangles.LOD1 > lodTriangles.LOD2)) {
    throw new Error('refinery promotion LOD triangle counts must reduce strictly');
  }

  const next = structuredClone(partsManifest);
  const matches = next.parts.filter((row) => row?.id === CONTRACT.partId);
  if (matches.length !== 1) {
    throw new Error(`parts manifest must contain exactly one ${CONTRACT.partId} row`);
  }
  const row = matches[0];
  if (row.category !== 'places'
      || row.file !== CONTRACT.partFile
      || row.mount !== 'origin'
      || JSON.stringify([...(row.sockets || [])].sort())
        !== JSON.stringify(Object.keys(CONTRACT.sockets).sort())
      || JSON.stringify(row.bounds?.dimensionsM) !== JSON.stringify(CONTRACT.envelope.manifestSize)) {
    throw new Error('refinery parts-manifest identity, sockets, mount, or envelope drifted');
  }
  row.tris = lodTriangles.LOD0;
  row.bytes = sourceBytes;
  row.textureSize = textureSize;
  row.note = `Refinery Process Crown material-truth V2 integration candidate — admitted candidate ${candidateSha256.slice(0, 12)}, promoted source ${sourceSha256.slice(0, 12)}; connected feed, crusher/transfer, differentiated separation, thermal/recovery, storage and dock/control construction; LOD0/1/2 ${lodTriangles.LOD0}/${lodTriangles.LOD1}/${lodTriangles.LOD2} tris across 5 semantic PBR groups. Browser/Electron route and performance remain separate gates.`;
  return next;
}

function exactSingleRow(rows, id, label, failures) {
  const matches = (rows || []).filter((row) => row?.id === id);
  if (matches.length !== 1) failures.push(`${label} must contain exactly one ${id} row`);
  return matches[0] || null;
}

function unchangedExceptRow(before, next, collection, id) {
  const normalized = structuredClone(next);
  const beforeIndex = (before[collection] || []).findIndex((row) => row?.id === id);
  const nextIndex = (normalized[collection] || []).findIndex((row) => row?.id === id);
  if (beforeIndex < 0 || nextIndex < 0 || beforeIndex !== nextIndex) return false;
  normalized[collection][nextIndex] = structuredClone(before[collection][beforeIndex]);
  return jsonEqual(normalized, before);
}

export function assessRefineryManifestPlan({
  beforeParts,
  nextParts,
  beforeRelease,
  nextRelease,
  expected,
} = {}) {
  const failures = [];
  if (!Array.isArray(beforeParts?.parts) || !Array.isArray(nextParts?.parts)
      || !Array.isArray(beforeRelease?.assets) || !Array.isArray(nextRelease?.assets)) {
    return { pass: false, failures: ['promotion requires complete parts and release manifests'] };
  }
  const beforePartIds = beforeParts.parts.map((row) => row?.id);
  const nextPartIds = nextParts.parts.map((row) => row?.id);
  const beforeReleaseIds = beforeRelease.assets.map((row) => row?.id);
  const nextReleaseIds = nextRelease.assets.map((row) => row?.id);
  if (new Set(nextPartIds).size !== nextPartIds.length || !jsonEqual(nextPartIds, beforePartIds)
      || !unchangedExceptRow(beforeParts, nextParts, 'parts', CONTRACT.partId)) {
    failures.push('parts manifest membership, order, or untouched bytes changed');
  }
  if (new Set(nextReleaseIds).size !== nextReleaseIds.length || !jsonEqual(nextReleaseIds, beforeReleaseIds)
      || !unchangedExceptRow(beforeRelease, nextRelease, 'assets', CONTRACT.partId)) {
    failures.push('release manifest membership, order, or untouched bytes changed');
  }
  const partsRow = exactSingleRow(nextParts.parts, CONTRACT.partId, 'parts manifest', failures);
  const releaseRow = exactSingleRow(nextRelease.assets, CONTRACT.partId, 'release manifest', failures);
  if (!partsRow
      || partsRow.category !== 'places'
      || partsRow.file !== CONTRACT.partFile
      || partsRow.mount !== 'origin'
      || partsRow.tris !== expected?.lodTriangles?.LOD0
      || partsRow.bytes !== expected?.sourceBytes
      || partsRow.textureSize !== expected?.textureSize
      || !jsonEqual([...(partsRow.sockets || [])].sort(), Object.keys(CONTRACT.sockets).sort())
      || !jsonEqual(partsRow.bounds?.dimensionsM, CONTRACT.envelope.manifestSize)) {
    failures.push('parts manifest refinery row does not match the exact promoted contract');
  }
  if (!releaseRow
      || releaseRow.kind !== 'part:places'
      || releaseRow.source !== CONTRACT.paths.liveSource
      || releaseRow.release !== CONTRACT.paths.liveRelease
      || releaseRow.sourceSha256 !== expected?.sourceSha256
      || releaseRow.sourceBytes !== expected?.sourceBytes
      || releaseRow.releaseSha256 !== expected?.releaseSha256
      || releaseRow.releaseBytes !== expected?.releaseBytes
      || releaseRow.textures !== 15
      || releaseRow.ktx2Textures !== 15
      || !Number.isInteger(releaseRow.meshoptBufferViews)
      || releaseRow.meshoptBufferViews <= 0
      || !Number.isInteger(releaseRow.contractNodeCount)
      || releaseRow.contractNodeCount <= 0) {
    failures.push('release manifest refinery row does not match the exact prepared release');
  }
  return { pass: failures.length === 0, failures, partsRow, releaseRow };
}

export function assertRefineryPromotionResult({
  sourceIdentity,
  blenderIdentity,
  releaseIdentity,
  partsRow,
  releaseRow,
  expected,
} = {}) {
  const failures = [];
  if (sourceIdentity?.sha256 !== expected?.sourceSha256
      || sourceIdentity?.bytes !== expected?.sourceBytes) failures.push('canonical source identity');
  if (blenderIdentity?.sha256 !== expected?.blenderSha256
      || blenderIdentity?.bytes !== expected?.blenderBytes) failures.push('canonical Blender identity');
  if (partsRow?.file !== CONTRACT.partFile
      || partsRow?.category !== 'places'
      || partsRow?.mount !== 'origin'
      || partsRow?.tris !== expected?.lodTriangles?.LOD0
      || partsRow?.bytes !== expected?.sourceBytes
      || partsRow?.textureSize !== expected?.textureSize) failures.push('parts manifest row');
  if (releaseRow?.kind !== 'part:places'
      || releaseRow?.source !== CONTRACT.paths.liveSource
      || releaseRow?.release !== CONTRACT.paths.liveRelease
      || releaseRow?.sourceSha256 !== expected?.sourceSha256
      || releaseRow?.sourceBytes !== expected?.sourceBytes
      || releaseRow?.releaseSha256 !== releaseIdentity?.sha256
      || releaseRow?.releaseBytes !== releaseIdentity?.bytes
      || releaseRow?.textures !== 15
      || releaseRow?.ktx2Textures !== 15
      || !(releaseRow?.meshoptBufferViews > 0)) failures.push('release manifest row');
  return { pass: failures.length === 0, failures };
}

export function requiredAdmissionIdentities(admission) {
  const facts = admission?.facts;
  const identities = [
    facts?.candidate,
    facts?.releaseMirror,
    facts?.blender,
    facts?.generator,
    facts?.binding,
    facts?.buildReport,
    facts?.foundryReport,
    facts?.khronosReport,
    facts?.blenderGate,
    facts?.renderManifest,
    ...(facts?.renderFiles || []),
  ];
  if (identities.some((entry) => !entry?.path || !/^[0-9a-f]{64}$/.test(entry?.sha256 || '')
      || !Number.isInteger(entry?.bytes) || entry.bytes <= 0)) {
    throw new Error('refinery admission does not expose every immutable producer/evidence identity');
  }
  if (new Set(identities.map((entry) => entry.path.toLowerCase())).size !== identities.length) {
    throw new Error('refinery admission contains duplicate immutable evidence paths');
  }
  return identities;
}

export function assessAdmissionSnapshot({ admission, currentIdentities } = {}) {
  const failures = [];
  let expected;
  try {
    expected = requiredAdmissionIdentities(admission);
  } catch (error) {
    return { pass: false, failures: [error.message] };
  }
  const current = new Map((currentIdentities || []).map((entry) => [entry?.path, entry]));
  for (const identity of expected) {
    const actual = current.get(identity.path);
    if (!actual || actual.sha256 !== identity.sha256 || actual.bytes !== identity.bytes) {
      failures.push(`admitted identity changed: ${identity.path}`);
    }
  }
  if (current.size !== expected.length) failures.push('current admission snapshot has missing or extra paths');
  return { pass: failures.length === 0, failures };
}

function readExactSnapshot(rootDir, expectedIdentities) {
  return expectedIdentities.map((expected) => {
    const current = identityAtRoot(rootDir, expected.path);
    if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) {
      throw new Error(`admitted identity changed: ${expected.path}`);
    }
    return current;
  });
}

export function assessRefineryPromotionReview({ review, admission } = {}) {
  const failures = [];
  const facts = admission?.facts;
  const expectedViews = facts?.renderFiles || [];
  for (const [field, expected] of Object.entries({
    schema: CONTRACT.promotionReviewSchema,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateId: CONTRACT.candidateId,
    assetId: CONTRACT.partId,
    decision: 'KEEP',
  })) {
    if (review?.[field] !== expected) failures.push(`promotion review ${field} must equal ${expected}`);
  }
  if (!jsonEqual(review?.candidate, facts?.candidate)) {
    failures.push('promotion review candidate identity is stale');
  }
  if (!jsonEqual(review?.renderManifest, facts?.renderManifest)) {
    failures.push('promotion review render-manifest identity is stale');
  }
  if (!jsonEqual(review?.reviewer, {
    kind: 'solo_integrator',
    id: 'codex-primary',
    evidenceBound: true,
  })) {
    failures.push('promotion review must identify the evidence-bound solo integrator');
  }
  const expectedReviewViews = expectedViews.map((identity) => ({ ...identity, decision: 'KEEP' }));
  if (expectedReviewViews.length !== CONTRACT.renderViews.length
      || !jsonEqual(review?.views, expectedReviewViews)) {
    failures.push('promotion review must bind KEEP to the exact five admitted render files');
  }
  if (!jsonEqual(review?.gates, { G1: 'KEEP', G2: 'KEEP', G4: 'KEEP', emissive: 'KEEP' })) {
    failures.push('promotion review must record G1/G2/G4/emissive KEEP');
  }
  if (!jsonEqual(review?.claims, { routeEvidence: false, performanceEvidence: false })) {
    failures.push('promotion review must leave route and performance evidence false');
  }
  return { pass: failures.length === 0, failures };
}

function readPromotionReview(rootDir, admission) {
  const identity = identityAtRoot(rootDir, CONTRACT.paths.promotionReview);
  let review;
  try {
    review = JSON.parse(identity.contents.toString('utf8'));
  } catch (error) {
    throw new Error(`promotion review is not valid JSON: ${error.message}`);
  }
  const assessment = assessRefineryPromotionReview({ review, admission });
  if (!assessment.pass) {
    throw new Error(`refinery promotion review failed: ${assessment.failures.join('; ')}`);
  }
  return { identity, review };
}

function assertVerifiedDisposableRoot(parent, root) {
  const resolvedParent = resolve(parent);
  const resolvedRoot = resolve(root);
  const delta = relative(resolvedParent, resolvedRoot);
  if (!delta || delta === '..' || delta.startsWith(`..${sep}`) || isAbsolute(delta)
      || !delta.startsWith('spaceface-pq022-refinery-')) {
    throw new Error(`refusing unverified refinery temporary root: ${resolvedRoot}`);
  }
  return resolvedRoot;
}

export async function prepareRefineryRelease({
  promoted,
  nextPartsBytes,
  releaseManifestBytes,
  beforeParts,
  beforeRelease,
  lodTriangles,
  textureSize,
  temporaryParent = tmpdir(),
  buildRelease = buildSelectedPlaceReleaseAssets,
} = {}) {
  const parent = resolve(temporaryParent);
  const tempRoot = assertVerifiedDisposableRoot(
    parent,
    await mkdtemp(join(parent, 'spaceface-pq022-refinery-')),
  );
  try {
    const sourcePath = resolveUnder(tempRoot, CONTRACT.paths.liveSource, 'temporary refinery source');
    const releasePath = resolveUnder(tempRoot, CONTRACT.paths.liveRelease, 'temporary refinery release');
    const partsPath = resolveUnder(tempRoot, CONTRACT.paths.partsManifest, 'temporary parts manifest');
    const releaseManifestPath = resolveUnder(
      tempRoot,
      CONTRACT.paths.releaseManifest,
      'temporary release manifest',
    );
    await Promise.all([
      mkdir(dirname(sourcePath), { recursive: true }),
      mkdir(dirname(releasePath), { recursive: true }),
      mkdir(dirname(partsPath), { recursive: true }),
      mkdir(dirname(releaseManifestPath), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(sourcePath, promoted.bytes),
      writeFile(partsPath, nextPartsBytes),
      writeFile(releaseManifestPath, releaseManifestBytes),
    ]);

    const build = await buildRelease([CONTRACT.partId], { root: tempRoot });
    const stagedSource = identityAtRoot(tempRoot, CONTRACT.paths.liveSource);
    const stagedParts = identityAtRoot(tempRoot, CONTRACT.paths.partsManifest);
    const stagedRelease = identityAtRoot(tempRoot, CONTRACT.paths.liveRelease);
    const stagedReleaseManifest = identityAtRoot(tempRoot, CONTRACT.paths.releaseManifest);
    if (stagedSource.sha256 !== promoted.sourceSha256
        || stagedSource.bytes !== promoted.bytes.length
        || stagedParts.sha256 !== sha256(nextPartsBytes)
        || build?.built?.length !== 1
        || build.built[0].id !== CONTRACT.partId
        || build.built[0].sourceSha256 !== promoted.sourceSha256
        || build.built[0].releaseSha256 !== stagedRelease.sha256
        || build.built[0].releaseBytes !== stagedRelease.bytes) {
      throw new Error('temporary refinery release build identities do not match the promoted source');
    }
    const nextParts = JSON.parse(stagedParts.contents.toString('utf8'));
    const nextRelease = JSON.parse(stagedReleaseManifest.contents.toString('utf8'));
    const manifestAssessment = assessRefineryManifestPlan({
      beforeParts,
      nextParts,
      beforeRelease,
      nextRelease,
      expected: {
        sourceSha256: promoted.sourceSha256,
        sourceBytes: promoted.bytes.length,
        releaseSha256: stagedRelease.sha256,
        releaseBytes: stagedRelease.bytes,
        lodTriangles,
        textureSize,
      },
    });
    if (!manifestAssessment.pass) {
      throw new Error(`temporary refinery manifest validation failed: ${manifestAssessment.failures.join('; ')}`);
    }
    return {
      release: stagedRelease,
      releaseManifest: stagedReleaseManifest,
      partsManifest: stagedParts,
      build,
      manifestAssessment,
    };
  } finally {
    const verified = assertVerifiedDisposableRoot(parent, tempRoot);
    await rm(verified, { recursive: true, force: true });
  }
}

function stagedHashValidator(expectedSha256, label, additionalValidation) {
  return async (_path, stagedBytes) => {
    if (sha256(stagedBytes) !== expectedSha256) throw new Error(`${label} staged hash mismatch`);
    if (additionalValidation) await additionalValidation(stagedBytes);
  };
}

export function buildRefineryPublicationTransaction({
  rootDir = ROOT,
  baseline,
  admission,
  reviewIdentity,
  promoted,
  admittedBlend,
  nextPartsBytes,
  prepared,
} = {}) {
  const nextPartsSha256 = sha256(nextPartsBytes);
  const nextReleaseManifestSha256 = prepared.releaseManifest.sha256;
  const files = [
    {
      path: resolveUnder(rootDir, CONTRACT.paths.liveSource),
      bytes: promoted.bytes,
      expectedCurrentSha256: baseline.source.sha256,
      validate: stagedHashValidator(promoted.sourceSha256, 'refinery source', (bytes) => {
        const parsed = parseGlbDocument(bytes, 'staged refinery source');
        if (sha256(parsed.binaryPayload) !== promoted.binaryPayloadSha256) {
          throw new Error('staged refinery source BIN payload changed');
        }
        lifecycleCopies(parsed.document, 'staged refinery source');
      }),
    },
    {
      path: resolveUnder(rootDir, CONTRACT.paths.liveBlend),
      bytes: admittedBlend.contents,
      expectedCurrentSha256: baseline.blender.sha256,
      validate: stagedHashValidator(admittedBlend.sha256, 'refinery Blender source'),
    },
    {
      path: resolveUnder(rootDir, CONTRACT.paths.partsManifest),
      bytes: nextPartsBytes,
      expectedCurrentSha256: baseline.partsManifest.sha256,
      validate: stagedHashValidator(nextPartsSha256, 'parts manifest', (bytes) => {
        const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
        if ((parsed.parts || []).filter((row) => row?.id === CONTRACT.partId).length !== 1) {
          throw new Error('staged parts manifest lost exact refinery membership');
        }
      }),
    },
    {
      path: resolveUnder(rootDir, CONTRACT.paths.liveRelease),
      bytes: prepared.release.contents,
      expectedCurrentSha256: baseline.release.sha256,
      validate: stagedHashValidator(prepared.release.sha256, 'refinery release', (bytes) => {
        parseGlbDocument(bytes, 'staged refinery release');
      }),
    },
    {
      path: resolveUnder(rootDir, CONTRACT.paths.releaseManifest),
      bytes: prepared.releaseManifest.contents,
      expectedCurrentSha256: baseline.releaseManifest.sha256,
      validate: stagedHashValidator(nextReleaseManifestSha256, 'release manifest', (bytes) => {
        const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
        if ((parsed.assets || []).filter((row) => row?.id === CONTRACT.partId).length !== 1) {
          throw new Error('staged release manifest lost exact refinery membership');
        }
      }),
    },
  ];
  const guards = [
    ...requiredAdmissionIdentities(admission),
    publicIdentity(reviewIdentity),
  ].map((identity) => ({
    path: resolveUnder(rootDir, identity.path, 'immutable promotion guard'),
    expectedCurrentSha256: identity.sha256,
  }));
  if (files.length !== 5 || new Set(files.map((file) => file.path.toLowerCase())).size !== 5) {
    throw new Error('refinery promotion must publish exactly five distinct live files');
  }
  return { files, guards };
}

function readBaselineSnapshot(rootDir, admission) {
  const expected = admission?.facts?.baseline;
  const keys = ['source', 'release', 'blender', 'partsManifest', 'releaseManifest'];
  if (keys.some((key) => !expected?.[key])) {
    throw new Error('refinery admission does not expose the exact five live baseline identities');
  }
  return Object.fromEntries(keys.map((key) => {
    const current = identityAtRoot(rootDir, expected[key].path);
    if (current.sha256 !== expected[key].sha256 || current.bytes !== expected[key].bytes) {
      throw new Error(`live baseline changed after admission: ${expected[key].path}`);
    }
    return [key, current];
  }));
}

async function main() {
  const admission = validateRefineryCandidate({ rootDir: ROOT });
  if (!admission.pass) {
    throw new Error(`refinery candidate admission failed: ${JSON.stringify(admission.failures)}`);
  }
  const admittedExpected = requiredAdmissionIdentities(admission);
  const admittedCurrent = readExactSnapshot(ROOT, admittedExpected);
  const snapshotAssessment = assessAdmissionSnapshot({
    admission,
    currentIdentities: admittedCurrent.map(publicIdentity),
  });
  if (!snapshotAssessment.pass) {
    throw new Error(`refinery admission snapshot changed: ${snapshotAssessment.failures.join('; ')}`);
  }
  const admittedByPath = new Map(admittedCurrent.map((entry) => [entry.path, entry]));
  const baseline = readBaselineSnapshot(ROOT, admission);
  const review = readPromotionReview(ROOT, admission);
  const candidate = admittedByPath.get(CONTRACT.paths.candidate);
  const admittedBlend = admittedByPath.get(CONTRACT.paths.blender);
  const promoted = promoteRefinerySourceBytes(candidate.contents, admission.facts.candidate.sha256);
  const beforeParts = JSON.parse(baseline.partsManifest.contents.toString('utf8'));
  const beforeRelease = JSON.parse(baseline.releaseManifest.contents.toString('utf8'));
  const nextParts = buildRefineryPartsManifest(beforeParts, {
    sourceBytes: promoted.bytes.length,
    sourceSha256: promoted.sourceSha256,
    candidateSha256: admission.facts.candidate.sha256,
    lodTriangles: admission.facts.glb.lodTriangles,
    textureSize: admission.facts.glb.textureSize,
  });
  const nextPartsBytes = jsonBytes(nextParts);
  const prepared = await prepareRefineryRelease({
    promoted,
    nextPartsBytes,
    releaseManifestBytes: baseline.releaseManifest.contents,
    beforeParts,
    beforeRelease,
    lodTriangles: admission.facts.glb.lodTriangles,
    textureSize: admission.facts.glb.textureSize,
  });
  const transaction = buildRefineryPublicationTransaction({
    rootDir: ROOT,
    baseline,
    admission,
    reviewIdentity: review.identity,
    promoted,
    admittedBlend,
    nextPartsBytes,
    prepared,
  });
  const planned = {
    schema: 'spaceface.pq022RefineryPromotionPlan.v2',
    applied: false,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidate: admission.facts.candidate,
    review: publicIdentity(review.identity),
    promotedSource: {
      path: CONTRACT.paths.liveSource,
      sha256: promoted.sourceSha256,
      bytes: promoted.bytes.length,
      binaryPayloadSha256: promoted.binaryPayloadSha256,
      binaryPayloadBytes: promoted.binaryPayloadBytes,
    },
    release: publicIdentity(prepared.release),
    blender: publicIdentity(admittedBlend),
    lodTriangles: admission.facts.glb.lodTriangles,
    textureSize: admission.facts.glb.textureSize,
    publicationFiles: transaction.files.map((file) => file.path),
    next: 'rerun with --apply only while every admitted and review hash remains unchanged',
  };
  if (!APPLY) {
    console.log(JSON.stringify(planned, null, 2));
    return;
  }

  await publishFileSetTransaction(transaction);
  const expectedFinal = new Map(transaction.files.map((file) => [
    file.path,
    { sha256: sha256(file.bytes), bytes: Buffer.byteLength(file.bytes) },
  ]));
  for (const file of transaction.files) {
    const contents = readFileSync(file.path);
    const expected = expectedFinal.get(file.path);
    if (sha256(contents) !== expected.sha256 || contents.length !== expected.bytes) {
      throw new Error(`refinery final identity mismatch after atomic publication: ${file.path}`);
    }
  }
  console.log(JSON.stringify({
    ...planned,
    applied: true,
    next: 'run focused live asset checks, then claim PQ-022.refinery-reauthor-h1 separately',
  }, null, 2));
}

if (process.argv[1]
    && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error) => {
    console.error(`[pq022-refinery-promotion] FAIL: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}
