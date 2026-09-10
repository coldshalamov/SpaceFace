#!/usr/bin/env node

// Fail-closed buoy-repair promotion for the reopened PQ-022.billboard-buoy-reauthor unit.
// The 2026-09-10 causal review returned ONLY the navigation buoy; the station billboard and the
// memorial array are accepted and must not be touched. This transaction therefore publishes the
// exact buoy set (source, authored Blend, release, both manifests) as one guarded atomic write,
// hash-guards the two accepted assets' live files, and re-proves their rebuilt candidates remain
// BIN-payload identical to what is live before anything is published.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
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
  PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT,
  validateNavigationInfrastructureCandidate,
} from './lib/pq022NavigationInfrastructureCandidateValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
const APPLY = process.argv.includes('--apply');
const PUBLISH_KEYS = Object.freeze([...CONTRACT.promotion.publishAssetKeys]);
const GUARD_KEYS = Object.freeze([...CONTRACT.promotion.guardAssetKeys]);
const PUBLISH_IDS = Object.freeze(PUBLISH_KEYS.map((key) => contractAsset(key).partId));
const OWNED_IDS = PUBLISH_IDS;
const PUBLISH_RUNTIME_FILE = 'places/place_nav_buoy.glb';

function contractAsset(key) {
  const asset = CONTRACT.assets.find((entry) => entry.key === key);
  if (!asset) throw new Error(`unknown navigation-infrastructure asset key: ${key}`);
  return asset;
}

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
  return { path: relativePath, sha256: sha256(contents), bytes: contents.length, contents };
}

function identityOrMissing(rootDir, relativePath) {
  const target = resolveUnder(rootDir, relativePath);
  return existsSync(target) ? identityAtRoot(rootDir, relativePath) : null;
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
    binaryPayload: payload.subarray(binaryStart, binaryEnd),
    binarySuffix: payload.subarray(jsonEnd),
  };
}

function lifecycleCopies(document, asset, label) {
  const scene = document.scenes?.[document.scene ?? 0];
  const root = (document.nodes || []).find((node) => node.name === asset.rootNode);
  const copies = [
    ['asset', document.asset?.extras?.spacefaceAsset],
    ['default scene', scene?.extras?.spacefaceAsset],
    ['canonical root', root?.extras?.spacefaceAsset],
  ];
  if (copies.some(([, stamp]) => !stamp)
      || copies.some(([, stamp]) => !jsonEqual(stamp, copies[0][1]))) {
    throw new Error(`${label}: lifecycle copies are missing or divergent`);
  }
  return copies;
}

function assertCandidateLifecycle(stamp, asset) {
  if (stamp?.candidateId !== asset.candidateId
      || stamp?.dispatchUnit !== CONTRACT.dispatchUnit
      || stamp?.state !== CONTRACT.candidateState
      || stamp?.partId !== asset.partId
      || stamp?.assetId !== asset.assetId
      || stamp?.wiringStatus !== 'isolated_candidate'
      || !jsonEqual(stamp?.claims, CONTRACT.claims)) {
    throw new Error(`${asset.partId}: lifecycle stamp is not the admitted candidate-only boundary`);
  }
}

function promoteLifecycleStamp(stamp, candidateSha256) {
  stamp.state = 'integration_candidate';
  stamp.wiringStatus = 'live_place_asset';
  stamp.promotedFromCandidateSha256 = candidateSha256;
  stamp.promotionDispatchUnit = CONTRACT.dispatchUnit;
  stamp.claims = {
    candidateOnly: false,
    promoted: true,
    routeEvidence: false,
    performanceEvidence: false,
  };
}

export function promoteNavigationInfrastructureSourceBytes(candidateBytes, candidateSha256, asset) {
  if (!CONTRACT.assets.includes(asset)) throw new Error('promotion requires one exact owned asset contract');
  if (!/^[0-9a-f]{64}$/.test(candidateSha256 || '')) {
    throw new Error(`${asset.partId}: promotion requires the exact lowercase candidate SHA-256`);
  }
  const parsed = parseGlbDocument(candidateBytes, `${asset.partId} candidate`);
  if (sha256(parsed.bytes) !== candidateSha256) {
    throw new Error(`${asset.partId}: candidate bytes do not match the admitted SHA-256`);
  }
  const copies = lifecycleCopies(parsed.document, asset, `${asset.partId} candidate`);
  assertCandidateLifecycle(copies[0][1], asset);
  for (const [, stamp] of copies) promoteLifecycleStamp(stamp, candidateSha256);
  if (copies.some(([, stamp]) => !jsonEqual(stamp, copies[0][1]))) {
    throw new Error(`${asset.partId}: lifecycle promotion diverged across contract copies`);
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

  const promoted = parseGlbDocument(output, `${asset.partId} promoted source`);
  const promotedCopies = lifecycleCopies(promoted.document, asset, `${asset.partId} promoted source`);
  if (!promoted.binaryPayload.equals(parsed.binaryPayload)
      || promotedCopies.some(([, stamp]) => (
        stamp.state !== 'integration_candidate'
        || stamp.wiringStatus !== 'live_place_asset'
        || stamp.promotedFromCandidateSha256 !== candidateSha256
        || stamp.claims?.candidateOnly !== false
        || stamp.claims?.promoted !== true
        || stamp.claims?.routeEvidence !== false
        || stamp.claims?.performanceEvidence !== false
      ))) {
    throw new Error(`${asset.partId}: promotion changed BIN bytes or failed lifecycle transform`);
  }
  return {
    asset,
    bytes: output,
    candidateSha256,
    sourceSha256: sha256(output),
    binaryPayloadSha256: sha256(promoted.binaryPayload),
    binaryPayloadBytes: promoted.binaryPayload.length,
    document: promoted.document,
  };
}

export function assertGuardCandidateBinPayloadIdentity({ candidateBytes, referenceBytes, asset }) {
  const candidate = parseGlbDocument(candidateBytes, `${asset.partId} guard candidate`);
  const reference = parseGlbDocument(referenceBytes, `${asset.partId} promoted-era candidate`);
  if (!candidate.binaryPayload.equals(reference.binaryPayload)) {
    throw new Error(
      `${asset.partId}: guard candidate BIN payload diverged from the promoted-era candidate content; `
      + `this unit must not modify accepted billboard/memorial candidate geometry`,
    );
  }
  return { binaryPayloadSha256: sha256(reference.binaryPayload), binaryPayloadBytes: reference.binaryPayload.length };
}

function assertExactAssetPayloads(byKey, label) {
  if (!byKey || typeof byKey !== 'object') throw new TypeError(`${label} requires an asset map`);
  const keys = Object.keys(byKey).sort();
  const expected = CONTRACT.assets.map((asset) => asset.key).sort();
  if (!jsonEqual(keys, expected)) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`);
  }
}

function assertMeasuredAssetFacts(asset, promoted, facts) {
  if (!promoted || promoted.asset !== asset
      || !Number.isInteger(facts?.textureSize)
      || facts.textureSize !== asset.textureSize) {
    throw new Error(`${asset.partId}: promoted source or measured texture facts are incomplete`);
  }
  for (const level of ['LOD0', 'LOD1', 'LOD2']) {
    const value = facts?.lodTriangles?.[level];
    if (!Number.isInteger(value) || value <= 0 || value > asset.budgets.lodTriangles[level]) {
      throw new Error(`${asset.partId}: ${level} triangle facts are outside the exact ceiling`);
    }
  }
  if (!(facts.lodTriangles.LOD0 > facts.lodTriangles.LOD1
    && facts.lodTriangles.LOD1 > facts.lodTriangles.LOD2)) {
    throw new Error(`${asset.partId}: LOD triangle facts do not reduce strictly`);
  }
}

function partsRow(asset, promoted, facts) {
  return {
    id: asset.partId,
    category: 'places',
    priority: 'P1',
    file: asset.partFile,
    tris: facts.lodTriangles.LOD0,
    bytes: promoted.bytes.length,
    textureSize: facts.textureSize,
    note: `PQ-022 navigation-infrastructure material-truth V2 buoy repair — admitted candidate ${promoted.candidateSha256.slice(0, 12)}, promoted source ${promoted.sourceSha256.slice(0, 12)}; LOD0/1/2 ${facts.lodTriangles.LOD0}/${facts.lodTriangles.LOD1}/${facts.lodTriangles.LOD2} render tris across five semantic PBR groups. Billboard and memorial rows are accepted and untouched by this transaction. Browser/Electron route and performance remain separate gates.`,
    hooks: [],
    sockets: ['SOCKET_Structure_Core'],
    mount: 'origin',
    bounds: {
      min: [...asset.envelope.min],
      max: [...asset.envelope.max],
      dimensionsM: [...asset.envelope.manifestSize],
    },
  };
}

function replaceExistingRow(rows, id, row, label) {
  const indices = rows.map((entry, index) => (entry?.id === id ? index : -1)).filter((index) => index >= 0);
  if (indices.length !== 1) throw new Error(`${label} must contain exactly one ${id} row`);
  rows[indices[0]] = row;
}

export function buildNavigationInfrastructurePartsManifest(partsManifest, {
  promotedByKey,
  factsByKey,
} = {}) {
  if (!partsManifest || !Array.isArray(partsManifest.parts)) {
    throw new TypeError('navigation-infrastructure promotion requires a parts manifest');
  }
  assertExactAssetPayloads(promotedByKey, 'parts-manifest promotion');
  assertExactAssetPayloads(factsByKey, 'parts-manifest facts');
  const next = structuredClone(partsManifest);
  for (const key of PUBLISH_KEYS) {
    const asset = contractAsset(key);
    const promoted = promotedByKey[key];
    const facts = factsByKey[key];
    assertMeasuredAssetFacts(asset, promoted, facts);
    const row = partsRow(asset, promoted, facts);
    replaceExistingRow(next.parts, asset.partId, row, 'parts manifest');
  }
  return next;
}

function exactSingleRow(rows, id, label, failures) {
  const matches = (rows || []).filter((row) => row?.id === id);
  if (matches.length !== 1) failures.push(`${label} must contain exactly one ${id} row`);
  return matches[0] || null;
}

function untouchedRowsEqual(before, next, collection) {
  const published = new Set(OWNED_IDS);
  const beforeRows = (before[collection] || []).filter((row) => !published.has(row?.id));
  const nextRows = (next[collection] || []).filter((row) => !published.has(row?.id));
  const beforeShell = structuredClone({ ...before, [collection]: [] });
  const nextShell = structuredClone({ ...next, [collection]: [] });
  return jsonEqual(beforeRows, nextRows) && jsonEqual(beforeShell, nextShell);
}

export function assessNavigationInfrastructureManifestPlan({
  beforeParts,
  nextParts,
  beforeRelease,
  nextRelease,
  expectedByKey,
} = {}) {
  const failures = [];
  if (!Array.isArray(beforeParts?.parts) || !Array.isArray(nextParts?.parts)
      || !Array.isArray(beforeRelease?.assets) || !Array.isArray(nextRelease?.assets)) {
    return { pass: false, failures: ['promotion requires complete parts and release manifests'] };
  }
  const beforePartIds = beforeParts.parts.map((row) => row?.id);
  const beforeReleaseIds = beforeRelease.assets.map((row) => row?.id);
  const nextPartIds = nextParts.parts.map((row) => row?.id);
  const nextReleaseIds = nextRelease.assets.map((row) => row?.id);
  // Buoy-only transaction: no insertion or reorder anywhere; only the published row may change,
  // and the accepted billboard/memorial rows plus every unrelated row must survive untouched.
  if (new Set(nextPartIds).size !== nextPartIds.length
      || !jsonEqual(nextPartIds, beforePartIds)
      || !untouchedRowsEqual(beforeParts, nextParts, 'parts')) {
    failures.push('parts manifest changed outside the exact buoy-row replacement transaction');
  }
  if (new Set(nextReleaseIds).size !== nextReleaseIds.length
      || !jsonEqual(nextReleaseIds, beforeReleaseIds)
      || !untouchedRowsEqual(beforeRelease, nextRelease, 'assets')) {
    failures.push('release manifest changed outside the exact buoy-row replacement transaction');
  }
  if (!jsonEqual(nextParts.runtimeSlots?.place || [], beforeParts.runtimeSlots?.place || [])) {
    failures.push('runtimeSlots.place must remain byte-identical in a buoy-row transaction');
  }
  const partsRows = {};
  const releaseRows = {};
  for (const key of PUBLISH_KEYS) {
    const asset = contractAsset(key);
    const expected = expectedByKey?.[key];
    const part = exactSingleRow(nextParts.parts, asset.partId, 'parts manifest', failures);
    const release = exactSingleRow(nextRelease.assets, asset.partId, 'release manifest', failures);
    partsRows[key] = part;
    releaseRows[key] = release;
    if (!part
        || part.category !== 'places'
        || part.priority !== 'P1'
        || part.file !== asset.partFile
        || part.mount !== 'origin'
        || part.tris !== expected?.lodTriangles?.LOD0
        || part.bytes !== expected?.sourceBytes
        || part.textureSize !== asset.textureSize
        || !jsonEqual(part.hooks, [])
        || !jsonEqual(part.sockets, ['SOCKET_Structure_Core'])
        || !jsonEqual(part.bounds, {
          min: asset.envelope.min,
          max: asset.envelope.max,
          dimensionsM: asset.envelope.manifestSize,
        })) {
      failures.push(`${asset.partId} parts row does not match the exact promoted contract`);
    }
    if (!release
        || release.kind !== 'part:places'
        || release.source !== asset.paths.liveSource
        || release.release !== asset.paths.liveRelease
        || release.sourceSha256 !== expected?.sourceSha256
        || release.sourceBytes !== expected?.sourceBytes
        || release.releaseSha256 !== expected?.releaseSha256
        || release.releaseBytes !== expected?.releaseBytes
        || release.textures !== asset.materials.length * 3
        || release.ktx2Textures !== asset.materials.length * 3
        || !Number.isInteger(release.meshoptBufferViews)
        || release.meshoptBufferViews <= 0
        || !Number.isInteger(release.contractNodeCount)
        || release.contractNodeCount <= 0) {
      failures.push(`${asset.partId} release row does not match the exact prepared release`);
    }
  }
  return { pass: failures.length === 0, failures, partsRows, releaseRows };
}

export function requiredAdmissionIdentities(admission) {
  const facts = admission?.facts;
  const identities = [
    facts?.binding,
    facts?.generator,
    facts?.preflight,
    facts?.buildReport,
    facts?.renderManifest,
    ...CONTRACT.assets.flatMap((asset) => {
      const row = facts?.assets?.[asset.key];
      return [row?.candidate, row?.releaseMirror, row?.blender, row?.validatorReport];
    }),
    ...(facts?.renderFiles || []),
  ];
  if (identities.some((entry) => (
    !entry?.path
    || !/^[0-9a-f]{64}$/.test(entry?.sha256 || '')
    || !Number.isInteger(entry?.bytes)
    || entry.bytes <= 0
  ))) {
    throw new Error('navigation-infrastructure admission does not expose every immutable producer/evidence identity');
  }
  const paths = identities.map((entry) => entry.path.toLowerCase());
  if (new Set(paths).size !== identities.length) {
    throw new Error('navigation-infrastructure admission contains duplicate immutable evidence paths');
  }
  return identities;
}

export function assessAdmissionSnapshot({ admission, currentIdentities } = {}) {
  let expected;
  try {
    expected = requiredAdmissionIdentities(admission);
  } catch (error) {
    return { pass: false, failures: [error.message] };
  }
  const failures = [];
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

export function assessNavigationInfrastructurePromotionReview({ review, admission } = {}) {
  const failures = [];
  const facts = admission?.facts;
  for (const [field, expected] of Object.entries({
    schema: CONTRACT.promotionReviewSchema,
    packet: CONTRACT.packet,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateSetId: CONTRACT.candidateSetId,
    decision: 'KEEP',
  })) {
    if (review?.[field] !== expected) failures.push(`promotion review ${field} must equal ${expected}`);
  }
  if (!jsonEqual(review?.reviewer, {
    kind: 'solo_integrator',
    id: 'codex-primary',
    evidenceBound: true,
  })) {
    failures.push('promotion review must identify the evidence-bound solo integrator');
  }
  if (!jsonEqual(review?.renderManifest, facts?.renderManifest)
      || !jsonEqual(review?.buildReport, facts?.buildReport)) {
    failures.push('promotion review build/render identities are stale');
  }
  const publishAssets = PUBLISH_KEYS.map((key) => contractAsset(key));
  const rows = Array.isArray(review?.assets) ? review.assets : [];
  if (rows.length !== publishAssets.length
      || !jsonEqual(rows.map((row) => row?.partId), OWNED_IDS)) {
    failures.push('promotion review must cover the exact ordered published-asset set');
  }
  for (const asset of publishAssets) {
    const admitted = facts?.assets?.[asset.key];
    const row = rows.find((entry) => entry?.partId === asset.partId);
    const expectedViews = asset.renderViews.map((path) => {
      const identity = (facts?.renderFiles || []).find((entry) => entry.path === path);
      return { ...identity, decision: 'KEEP' };
    });
    if (!row
        || row.candidateId !== asset.candidateId
        || !jsonEqual(row.candidate, admitted?.candidate)
        || !jsonEqual(row.blender, admitted?.blender)
        || !jsonEqual(row.validatorReport, admitted?.validatorReport)
        || !jsonEqual(row.views, expectedViews)
        || !jsonEqual(row.gates, { G1: 'KEEP', G2: 'KEEP', G4: 'KEEP', emissive: 'KEEP' })
        || row.decision !== 'KEEP') {
      failures.push(`${asset.partId} review does not bind exact evidence to KEEP`);
    }
  }
  const guardAssets = GUARD_KEYS.map((key) => contractAsset(key));
  const guardRows = Array.isArray(review?.guardAssets) ? review.guardAssets : [];
  if (guardRows.length !== guardAssets.length
      || !jsonEqual(guardRows.map((row) => row?.partId), guardAssets.map((asset) => asset.partId))) {
    failures.push('promotion review must re-affirm the exact ordered accepted-asset guard set');
  }
  for (const asset of guardAssets) {
    const admitted = facts?.assets?.[asset.key];
    const row = guardRows.find((entry) => entry?.partId === asset.partId);
    if (!row
        || row.candidateId !== asset.candidateId
        || !jsonEqual(row.candidate, admitted?.candidate)
        || !jsonEqual(row.blender, admitted?.blender)
        || row.decision !== 'UNCHANGED_KEEP'
        || row.candidateBinUnchangedReproven !== true) {
      failures.push(`${asset.partId} guard re-affirmation is incomplete`);
    }
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
  const assessment = assessNavigationInfrastructurePromotionReview({ review, admission });
  if (!assessment.pass) {
    throw new Error(`navigation-infrastructure promotion review failed: ${assessment.failures.join('; ')}`);
  }
  return { identity, review };
}

function assertVerifiedDisposableRoot(parent, root) {
  const resolvedParent = resolve(parent);
  const resolvedRoot = resolve(root);
  const delta = relative(resolvedParent, resolvedRoot);
  if (!delta || delta === '..' || delta.startsWith(`..${sep}`) || isAbsolute(delta)
      || !delta.startsWith('spaceface-pq022-navigation-infrastructure-')) {
    throw new Error(`refusing unverified navigation-infrastructure temporary root: ${resolvedRoot}`);
  }
  return resolvedRoot;
}

function builtEntryMap(build) {
  const entries = Array.isArray(build?.built) ? build.built : [];
  const ids = entries.map((entry) => entry?.id);
  if (entries.length !== PUBLISH_KEYS.length
      || new Set(ids).size !== PUBLISH_KEYS.length
      || !OWNED_IDS.every((id) => ids.includes(id))) {
    throw new Error('temporary release build omitted or duplicated a published asset');
  }
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export async function prepareNavigationInfrastructureRelease({
  promotedByKey,
  nextPartsBytes,
  seededReleaseManifestBytes,
  beforeParts,
  beforeRelease,
  factsByKey,
  temporaryParent = tmpdir(),
  buildRelease = buildSelectedPlaceReleaseAssets,
} = {}) {
  assertExactAssetPayloads(promotedByKey, 'temporary release preparation');
  assertExactAssetPayloads(factsByKey, 'temporary release facts');
  const parent = resolve(temporaryParent);
  const tempRoot = assertVerifiedDisposableRoot(
    parent,
    await mkdtemp(join(parent, 'spaceface-pq022-navigation-infrastructure-')),
  );
  try {
    const writes = [];
    for (const key of PUBLISH_KEYS) {
      const asset = contractAsset(key);
      const promoted = promotedByKey[key];
      const sourcePath = resolveUnder(tempRoot, asset.paths.liveSource, `${asset.partId} temporary source`);
      const releasePath = resolveUnder(tempRoot, asset.paths.liveRelease, `${asset.partId} temporary release`);
      await Promise.all([
        mkdir(dirname(sourcePath), { recursive: true }),
        mkdir(dirname(releasePath), { recursive: true }),
      ]);
      writes.push(writeFile(sourcePath, promoted.bytes));
    }
    const partsPath = resolveUnder(tempRoot, CONTRACT.paths.partsManifest, 'temporary parts manifest');
    const releaseManifestPath = resolveUnder(tempRoot, CONTRACT.paths.releaseManifest, 'temporary release manifest');
    await Promise.all([
      mkdir(dirname(partsPath), { recursive: true }),
      mkdir(dirname(releaseManifestPath), { recursive: true }),
    ]);
    writes.push(writeFile(partsPath, nextPartsBytes));
    writes.push(writeFile(releaseManifestPath, seededReleaseManifestBytes));
    await Promise.all(writes);

    const build = await buildRelease(OWNED_IDS, { root: tempRoot });
    const built = builtEntryMap(build);
    const releases = {};
    const expectedByKey = {};
    for (const key of PUBLISH_KEYS) {
      const asset = contractAsset(key);
      const promoted = promotedByKey[key];
      const entry = built.get(asset.partId);
      const stagedSource = identityAtRoot(tempRoot, asset.paths.liveSource);
      const stagedRelease = identityAtRoot(tempRoot, asset.paths.liveRelease);
      if (stagedSource.sha256 !== promoted.sourceSha256
          || stagedSource.bytes !== promoted.bytes.length
          || entry.sourceSha256 !== promoted.sourceSha256
          || entry.releaseSha256 !== stagedRelease.sha256
          || entry.releaseBytes !== stagedRelease.bytes) {
        throw new Error(`${asset.partId}: temporary release identities do not match promoted source`);
      }
      releases[key] = stagedRelease;
      expectedByKey[key] = {
        sourceSha256: promoted.sourceSha256,
        sourceBytes: promoted.bytes.length,
        releaseSha256: stagedRelease.sha256,
        releaseBytes: stagedRelease.bytes,
        lodTriangles: factsByKey[key].lodTriangles,
      };
    }
    const stagedParts = identityAtRoot(tempRoot, CONTRACT.paths.partsManifest);
    const stagedReleaseManifest = identityAtRoot(tempRoot, CONTRACT.paths.releaseManifest);
    if (stagedParts.sha256 !== sha256(nextPartsBytes)) {
      throw new Error('temporary release builder changed the planned parts manifest');
    }
    const nextParts = JSON.parse(stagedParts.contents.toString('utf8'));
    const nextRelease = JSON.parse(stagedReleaseManifest.contents.toString('utf8'));
    const manifestAssessment = assessNavigationInfrastructureManifestPlan({
      beforeParts,
      nextParts,
      beforeRelease,
      nextRelease,
      expectedByKey,
    });
    if (!manifestAssessment.pass) {
      throw new Error(`temporary manifest validation failed: ${manifestAssessment.failures.join('; ')}`);
    }
    return {
      releases,
      releaseManifest: stagedReleaseManifest,
      partsManifest: stagedParts,
      build,
      manifestAssessment,
      expectedByKey,
    };
  } finally {
    const verified = assertVerifiedDisposableRoot(parent, tempRoot);
    await rm(verified, { recursive: true, force: true });
  }
}

function stagedHashValidator(expectedSha256, label, additionalValidation) {
  return async (_path, stagedBytes) => {
    if (sha256(stagedBytes) !== expectedSha256) throw new Error(`${label} staged hash mismatch`);
    if (additionalValidation) await additionalValidation(Buffer.from(stagedBytes));
  };
}

export function buildNavigationInfrastructurePublicationTransaction({
  rootDir = ROOT,
  baseline,
  admission,
  reviewIdentity,
  promotedByKey,
  admittedBlendByKey,
  nextPartsBytes,
  prepared,
} = {}) {
  assertExactAssetPayloads(promotedByKey, 'publication promoted set');
  assertExactAssetPayloads(admittedBlendByKey, 'publication Blender set');
  const files = [];
  for (const key of PUBLISH_KEYS) {
    const asset = contractAsset(key);
    const promoted = promotedByKey[key];
    const blend = admittedBlendByKey[key];
    const assetBaseline = baseline.assets[key];
    files.push({
      path: resolveUnder(rootDir, asset.paths.liveSource),
      bytes: promoted.bytes,
      expectedCurrentSha256: assetBaseline.source?.sha256 ?? null,
      validate: stagedHashValidator(promoted.sourceSha256, `${asset.partId} source`, (bytes) => {
        const parsed = parseGlbDocument(bytes, `${asset.partId} staged source`);
        if (sha256(parsed.binaryPayload) !== promoted.binaryPayloadSha256) {
          throw new Error(`${asset.partId}: staged source BIN payload changed`);
        }
        lifecycleCopies(parsed.document, asset, `${asset.partId} staged source`);
      }),
    });
    files.push({
      path: resolveUnder(rootDir, asset.paths.liveBlend),
      bytes: blend.contents,
      expectedCurrentSha256: assetBaseline.blender?.sha256 ?? null,
      validate: stagedHashValidator(blend.sha256, `${asset.partId} Blender source`),
    });
  }
  files.push({
    path: resolveUnder(rootDir, CONTRACT.paths.partsManifest),
    bytes: nextPartsBytes,
    expectedCurrentSha256: baseline.partsManifest.sha256,
    validate: stagedHashValidator(sha256(nextPartsBytes), 'parts manifest', (bytes) => {
      const parsed = JSON.parse(bytes.toString('utf8'));
      for (const id of OWNED_IDS) {
        if ((parsed.parts || []).filter((row) => row?.id === id).length !== 1) {
          throw new Error(`staged parts manifest lost exact ${id} membership`);
        }
      }
      if ((parsed.runtimeSlots?.place || []).filter((entry) => entry === PUBLISH_RUNTIME_FILE).length !== 1) {
        throw new Error('staged parts manifest lost exact buoy runtime-slot membership');
      }
    }),
  });
  for (const key of PUBLISH_KEYS) {
    const asset = contractAsset(key);
    const release = prepared.releases[key];
    files.push({
      path: resolveUnder(rootDir, asset.paths.liveRelease),
      bytes: release.contents,
      expectedCurrentSha256: baseline.assets[key].release?.sha256 ?? null,
      validate: stagedHashValidator(release.sha256, `${asset.partId} release`, (bytes) => {
        parseGlbDocument(bytes, `${asset.partId} staged release`);
      }),
    });
  }
  files.push({
    path: resolveUnder(rootDir, CONTRACT.paths.releaseManifest),
    bytes: prepared.releaseManifest.contents,
    expectedCurrentSha256: baseline.releaseManifest.sha256,
    validate: stagedHashValidator(prepared.releaseManifest.sha256, 'release manifest', (bytes) => {
      const parsed = JSON.parse(bytes.toString('utf8'));
      for (const id of OWNED_IDS) {
        if ((parsed.assets || []).filter((row) => row?.id === id).length !== 1) {
          throw new Error(`staged release manifest lost exact ${id} membership`);
        }
      }
    }),
  });
  // Accepted-asset guards: the billboard and memorial live files are hash-pinned; any drift
  // aborts the transaction instead of overwriting accepted art.
  const guardLiveFiles = [];
  for (const key of GUARD_KEYS) {
    const asset = contractAsset(key);
    const assetBaseline = baseline.assets[key];
    for (const [kind, identity] of [['source', assetBaseline.source], ['release', assetBaseline.release], ['blender', assetBaseline.blender]]) {
      if (!identity) throw new Error(`${asset.partId} accepted live ${kind} is missing from the baseline snapshot`);
      guardLiveFiles.push({
        path: resolveUnder(rootDir, identity.path, 'accepted-asset guard'),
        expectedCurrentSha256: identity.sha256,
      });
    }
  }
  const guards = [
    ...requiredAdmissionIdentities(admission),
    publicIdentity(reviewIdentity),
  ].map((identity) => ({
    path: resolveUnder(rootDir, identity.path, 'immutable promotion guard'),
    expectedCurrentSha256: identity.sha256,
  }));
  const expectedPaths = [
    ...PUBLISH_KEYS.flatMap((key) => {
      const asset = contractAsset(key);
      return [asset.paths.liveSource, asset.paths.liveBlend];
    }),
    CONTRACT.paths.partsManifest,
    ...PUBLISH_KEYS.map((key) => contractAsset(key).paths.liveRelease),
    CONTRACT.paths.releaseManifest,
  ].map((entry) => resolveUnder(rootDir, entry));
  if (files.length !== 2 + PUBLISH_KEYS.length * 3
      || !jsonEqual(files.map((file) => file.path), expectedPaths)
      || new Set(files.map((file) => file.path.toLowerCase())).size !== files.length) {
    throw new Error(`navigation-infrastructure promotion must publish the exact ${PUBLISH_KEYS.length * 3 + 2}-file buoy-repair set`);
  }
  return { files, guards: [...guards, ...guardLiveFiles] };
}

function readBaselineSnapshot(rootDir, admission) {
  const expected = admission?.facts?.baseline;
  if (!expected?.assets || !expected?.partsManifest || !expected?.releaseManifest) {
    throw new Error('admission does not expose the exact live baseline set');
  }
  const assets = {};
  for (const asset of CONTRACT.assets) {
    const expectedAsset = expected.assets[asset.key];
    if (!expectedAsset || !Object.hasOwn(expectedAsset, 'source')
        || !Object.hasOwn(expectedAsset, 'release')
        || !Object.hasOwn(expectedAsset, 'blender')) {
      throw new Error(`${asset.partId}: admission baseline is incomplete`);
    }
    const current = {
      source: identityOrMissing(rootDir, asset.paths.liveSource),
      release: identityOrMissing(rootDir, asset.paths.liveRelease),
      blender: identityOrMissing(rootDir, asset.paths.liveBlend),
    };
    for (const kind of ['source', 'release', 'blender']) {
      if (!jsonEqual(publicIdentity(current[kind]), expectedAsset[kind])) {
        throw new Error(`${asset.partId}: live ${kind} changed after admission`);
      }
    }
    assets[asset.key] = current;
  }
  const partsManifest = identityAtRoot(rootDir, CONTRACT.paths.partsManifest);
  const releaseManifest = identityAtRoot(rootDir, CONTRACT.paths.releaseManifest);
  if (!jsonEqual(publicIdentity(partsManifest), expected.partsManifest)
      || !jsonEqual(publicIdentity(releaseManifest), expected.releaseManifest)) {
    throw new Error('live manifest identity changed after admission');
  }
  return { assets, partsManifest, releaseManifest };
}

async function main() {
  const admission = validateNavigationInfrastructureCandidate({ rootDir: ROOT });
  if (!admission.pass) {
    throw new Error(`navigation-infrastructure candidate admission failed: ${JSON.stringify(admission.failures)}`);
  }
  const expectedIdentities = requiredAdmissionIdentities(admission);
  const currentIdentities = readExactSnapshot(ROOT, expectedIdentities);
  const snapshot = assessAdmissionSnapshot({
    admission,
    currentIdentities: currentIdentities.map(publicIdentity),
  });
  if (!snapshot.pass) throw new Error(`admission snapshot changed: ${snapshot.failures.join('; ')}`);
  const admitted = new Map(currentIdentities.map((identity) => [identity.path, identity]));
  const baseline = readBaselineSnapshot(ROOT, admission);
  const review = readPromotionReview(ROOT, admission);
  const promotedByKey = {};
  const admittedBlendByKey = {};
  const factsByKey = {};
  for (const asset of CONTRACT.assets) {
    const facts = admission.facts.assets[asset.key];
    if (PUBLISH_KEYS.includes(asset.key)) {
      const candidate = admitted.get(asset.paths.candidate);
      promotedByKey[asset.key] = promoteNavigationInfrastructureSourceBytes(
        candidate.contents,
        facts.candidate.sha256,
        asset,
      );
      factsByKey[asset.key] = facts.glb;
    } else {
      // Accepted asset: re-prove the rebuilt candidate still carries the exact promoted-era BIN
      // payload (the committed candidate content) before pinning its live files into the guards.
      // The live billboard may legitimately be a later accepted re-author; hash guards cover it.
      const headCandidateBytes = execFileSync('git', [
        'show', `HEAD:${asset.paths.candidate}`,
      ], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
      const guardProof = assertGuardCandidateBinPayloadIdentity({
        candidateBytes: admitted.get(asset.paths.candidate).contents,
        referenceBytes: headCandidateBytes,
        asset,
      });
      promotedByKey[asset.key] = {
        asset,
        bytes: baseline.assets[asset.key].source.contents,
        candidateSha256: facts.candidate.sha256,
        sourceSha256: baseline.assets[asset.key].source.sha256,
        binaryPayloadSha256: guardProof.binaryPayloadSha256,
        binaryPayloadBytes: guardProof.binaryPayloadBytes,
        guardOnly: true,
      };
      factsByKey[asset.key] = facts.glb;
    }
    admittedBlendByKey[asset.key] = admitted.get(asset.paths.blender);
  }
  const beforeParts = JSON.parse(baseline.partsManifest.contents.toString('utf8'));
  const beforeRelease = JSON.parse(baseline.releaseManifest.contents.toString('utf8'));
  const nextParts = buildNavigationInfrastructurePartsManifest(beforeParts, {
    promotedByKey,
    factsByKey,
  });
  const seededRelease = beforeRelease;
  const nextPartsBytes = jsonBytes(nextParts);
  const prepared = await prepareNavigationInfrastructureRelease({
    promotedByKey,
    nextPartsBytes,
    seededReleaseManifestBytes: jsonBytes(seededRelease),
    beforeParts,
    beforeRelease,
    factsByKey,
  });
  const transaction = buildNavigationInfrastructurePublicationTransaction({
    rootDir: ROOT,
    baseline,
    admission,
    reviewIdentity: review.identity,
    promotedByKey,
    admittedBlendByKey,
    nextPartsBytes,
    prepared,
  });
  const planned = {
    schema: 'spaceface.pq022NavigationInfrastructurePromotionPlan.v1',
    applied: false,
    dispatchUnit: CONTRACT.dispatchUnit,
    candidateSetId: CONTRACT.candidateSetId,
    publishedAssets: OWNED_IDS,
    guardedAssets: GUARD_KEYS.map((key) => contractAsset(key).partId),
    review: publicIdentity(review.identity),
    assets: CONTRACT.assets.map((asset) => ({
      partId: asset.partId,
      role: PUBLISH_KEYS.includes(asset.key) ? 'published' : 'guarded_unchanged',
      candidate: admission.facts.assets[asset.key].candidate,
      promotedSource: PUBLISH_KEYS.includes(asset.key) ? {
        path: asset.paths.liveSource,
        sha256: promotedByKey[asset.key].sourceSha256,
        bytes: promotedByKey[asset.key].bytes.length,
        binaryPayloadSha256: promotedByKey[asset.key].binaryPayloadSha256,
      } : {
        path: asset.paths.liveSource,
        sha256: baseline.assets[asset.key].source.sha256,
        bytes: baseline.assets[asset.key].source.bytes,
        binaryPayloadSha256: promotedByKey[asset.key].binaryPayloadSha256,
      },
      blender: publicIdentity(admittedBlendByKey[asset.key]),
      release: publicIdentity(prepared.releases[asset.key] ?? baseline.assets[asset.key].release),
      lodTriangles: factsByKey[asset.key].lodTriangles,
    })),
    publicationFiles: transaction.files.map((file) => file.path),
    next: 'rerun with --apply only while every admitted/review/live-baseline identity remains unchanged',
  };
  if (!APPLY) {
    console.log(JSON.stringify(planned, null, 2));
    return;
  }
  await publishFileSetTransaction(transaction);
  for (const file of transaction.files) {
    const contents = readFileSync(file.path);
    if (sha256(contents) !== sha256(file.bytes) || contents.length !== Buffer.byteLength(file.bytes)) {
      throw new Error(`final identity mismatch after atomic publication: ${file.path}`);
    }
  }
  console.log(JSON.stringify({
    ...planned,
    applied: true,
    next: 'run focused live asset checks; route ordinary/diagnostic-close captures and causal re-review remain separate exact units',
  }, null, 2));
}

if (process.argv[1]
    && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error) => {
    console.error(`[pq022-navigation-infrastructure-promotion] FAIL: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}
