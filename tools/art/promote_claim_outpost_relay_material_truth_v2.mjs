#!/usr/bin/env node
/**
 * Promote the reviewed material-truth V2 relay source into the canonical source paths.
 *
 * This is deliberately source-only. The selected place release builder remains the sole owner of
 * KTX2/Meshopt release publication and release_manifest.json. The candidate, visual review, and
 * current destinations are hash-guarded while the canonical source pair, parts manifest, authored
 * evidence record, and build report publish as one recoverable transaction.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishFileSetTransaction } from './lib/multiFileTransaction.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSET_ID = 'place_claim_outpost_relay';
const LIVE_ASSET_ID = 'SF_PLACE_CLAIM_OUTPOST_RELAY';
const ROOT_NODE = 'SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT';
const CANDIDATE = resolve(
  ROOT,
  'assets/ships/m5_claim_outposts/source_candidates/material_truth_v2/places/place_claim_outpost_relay.glb',
);
const PACKET_SOURCE = resolve(
  ROOT,
  'assets/ships/m5_claim_outposts/source/places/place_claim_outpost_relay.glb',
);
const LIVE_SOURCE = resolve(ROOT, 'assets/ships/parts/places/place_claim_outpost_relay.glb');
const PARTS_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const EVIDENCE = resolve(
  ROOT,
  'assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay.json',
);
const BUILD_REPORT = resolve(
  ROOT,
  'assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay_material_truth_v2/build_report.json',
);
const VISUAL_REVIEW = resolve(
  ROOT,
  'assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay_material_truth_v2/visual_review.json',
);
const VALIDATION_BINDING = resolve(
  ROOT,
  'assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay_material_truth_v2/validation/validation_binding.json',
);
const PROMOTER = 'tools/art/promote_claim_outpost_relay_material_truth_v2.mjs';
const JSON_CHUNK = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const REQUIRED_NODES = Object.freeze([
  ROOT_NODE,
  'COLLISION_HULL',
  'SOCKET_Structure_Core',
  'SOCKET_Dock_Approach',
  'SOCKET_Emissive',
  'SOCKET_Module_Depot',
  'SOCKET_Module_Refinery',
  'SOCKET_Module_Defense',
  'SOCKET_Module_Teleporter',
]);
const SOCKET_TRANSLATIONS = Object.freeze({
  SOCKET_Structure_Core: Object.freeze([0, 0, 0]),
  SOCKET_Dock_Approach: Object.freeze([48, 0, -2]),
  SOCKET_Emissive: Object.freeze([0, 0, -24.472501754760742]),
  SOCKET_Module_Depot: Object.freeze([-20, -20, -1]),
  SOCKET_Module_Refinery: Object.freeze([-20, 20, -1]),
  SOCKET_Module_Defense: Object.freeze([20, -20, -1]),
  SOCKET_Module_Teleporter: Object.freeze([20, 20, -1]),
});

const candidateBytes = readFileSync(CANDIDATE);
const candidateSha256 = sha256(candidateBytes);
const buildReportBytes = readFileSync(BUILD_REPORT);
const buildReport = JSON.parse(buildReportBytes.toString('utf8'));
const visualReviewBytes = readFileSync(VISUAL_REVIEW);
const visualReview = JSON.parse(visualReviewBytes.toString('utf8'));
const validationBindingBytes = readFileSync(VALIDATION_BINDING);
const validationBinding = JSON.parse(validationBindingBytes.toString('utf8'));

if (buildReport.schema !== 'spaceface.claimOutpostRelayMaterialTruthBuild.v1'
  || buildReport.assetId !== ASSET_ID
  || buildReport.candidateId !== 'material_truth_v2') {
  throw new Error('build report schema/asset/candidate identity is not the relay material-truth V2 contract');
}
if (visualReview.schema !== 'spaceface.claimOutpostRelayMaterialTruthVisualReview.v1'
  || visualReview.assetId !== ASSET_ID
  || visualReview.dispatchUnit !== 'PQ-022.relay-reauthor') {
  throw new Error('visual review schema/asset/dispatch identity is not the relay re-author contract');
}
if (buildReport.sourceCandidate !== relative(CANDIDATE)
  || visualReview.technicalCandidate?.sourcePath !== relative(CANDIDATE)
  || Number(buildReport.bytes?.source) !== candidateBytes.length
  || Number(visualReview.technicalCandidate?.sourceBytes) !== candidateBytes.length) {
  throw new Error('candidate path/byte provenance does not match the build and review records');
}
if (visualReview.technicalCandidate?.constructionOrMaterialAuthoringChangedAfterReview !== false) {
  throw new Error('visual review must explicitly classify the post-review change as technical-only');
}
const candidateBlend = repoPath(buildReport.candidateBlend);
if (visualReview.technicalCandidate?.blendPath !== buildReport.candidateBlend) {
  throw new Error('visual review and build report disagree on the final technical Blend path');
}
const candidateBlendSha256 = sha256(readFileSync(candidateBlend));
assertEqualIgnoreCase(
  candidateBlendSha256,
  buildReport.candidateBlendSha256,
  'candidate Blend hash does not match build report',
);
assertEqualIgnoreCase(
  candidateBlendSha256,
  visualReview.technicalCandidate?.blendSha256,
  'candidate Blend hash does not match visual-review technical lineage',
);

assertEqualIgnoreCase(
  candidateSha256,
  buildReport.sourceCandidateSha256,
  'candidate hash does not match build report',
);
assertEqualIgnoreCase(
  candidateSha256,
  visualReview.technicalCandidate?.sourceSha256,
  'candidate hash does not match the final technical candidate binding',
);
assertEqualIgnoreCase(
  candidateSha256,
  visualReview.technicalCandidate?.validatedArtifactSha256,
  'candidate hash does not match the artifact named by the validator evidence',
);
validateDeclaredValidatorOutcomes(visualReview);
for (const gate of ['G1', 'G2', 'G4']) {
  if (visualReview.verdict?.[gate] !== 'KEEP') {
    throw new Error(`visual review ${gate} must be KEEP before promotion`);
  }
}
if (visualReview.reviewedCandidateEvidenceSufficient !== true) {
  throw new Error('visual review must mark its lineage-bound matched evidence sufficient');
}
if (visualReview.exactFinalVisualBinding !== false
  || visualReview.implementationDisposition !== 'integration_candidate') {
  throw new Error(
    'source promotion requires an honest integration-candidate review boundary; '
    + 'exact final visual acceptance belongs to downstream live-route review',
  );
}
if (buildReport.frozenContract?.verifiedUnchanged !== true) {
  throw new Error('candidate build report does not preserve the frozen root/socket/collision contract');
}
const expectedBounds = {
  min: [-48.8364, -17.6696, -47.9295],
  max: [55.5, 37.65, 47.9295],
  size: [104.3364, 55.3196, 95.859],
};
for (const key of Object.keys(expectedBounds)) {
  if (!exactNumberArray(buildReport.bounds?.[key], expectedBounds[key])) {
    throw new Error(`build-report frozen ${key} bounds drifted`);
  }
}
const releaseCandidate = repoPath(buildReport.releaseCandidate);
const releaseCandidateSha256 = sha256(readFileSync(releaseCandidate));
if (visualReview.technicalCandidate?.releaseCandidatePath !== buildReport.releaseCandidate) {
  throw new Error('visual review and build report disagree on the release-candidate path');
}
assertEqualIgnoreCase(
  releaseCandidateSha256,
  buildReport.releaseCandidateSha256,
  'release-candidate hash does not match build report',
);
assertEqualIgnoreCase(
  releaseCandidateSha256,
  visualReview.technicalCandidate?.releaseCandidateSha256,
  'release-candidate hash does not match visual-review technical lineage',
);
const canonicalBlend = repoPath(buildReport.canonicalBlend);
const canonicalBlendSha256 = sha256(readFileSync(canonicalBlend));
assertEqualIgnoreCase(
  canonicalBlendSha256,
  buildReport.canonicalBlendSha256,
  'canonical contract-source Blend hash does not match build report',
);

const candidateJson = parseGlb(candidateBytes, 'reviewed relay candidate').json;
assertCandidateStructure(candidateJson, buildReport);
if (buildReport.promotion?.stage === 'canonical_source_and_release_published') {
  validateFinalizedPublication(buildReport, candidateSha256);
  console.log(JSON.stringify({
    schema: 'spaceface.claimOutpostRelayMaterialTruthPromotion.v1',
    assetId: ASSET_ID,
    acceptedCandidateSha256: candidateSha256,
    liveSourceSha256: buildReport.promotion.liveSourceSha256,
    liveReleaseSha256: buildReport.promotion.liveReleaseSha256,
    alreadyFinalized: true,
    transactionallyPublished: [],
  }, null, 2));
  process.exit(0);
}
const liveMetadata = productionMetadata(candidateJson, buildReport, visualReview, candidateSha256);
const liveSourceBytes = rewriteGlbJson(candidateBytes, (json) => {
  json.asset ??= { version: '2.0' };
  json.asset.generator = appendGeneratorStep(
    appendGeneratorStep(json.asset.generator, buildReport.builder),
    PROMOTER,
  );
  json.asset.extras = {
    ...(json.asset.extras || {}),
    assetId: LIVE_ASSET_ID,
    partId: ASSET_ID,
    category: 'places',
    priority: 'P0',
    triangleCount: Number(buildReport.lod.lod0.triangles),
    textureSize: 1024,
    forwardAxis: '+X',
    upAxis: '+Y',
    starboardAxis: '+Z',
    unit: 'metre',
    boundsDimensionsM: [...buildReport.bounds.size],
    spacefaceAsset: liveMetadata,
  };

  const scene = json.scenes?.[json.scene || 0];
  if (!scene) throw new Error('reviewed relay candidate has no active scene');
  scene.extras = {
    ...(scene.extras || {}),
    assetId: LIVE_ASSET_ID,
    partId: ASSET_ID,
    spacefaceAsset: liveMetadata,
    spacefaceAssetJson: JSON.stringify(liveMetadata),
    'spaceface.sourceBlendSha256': buildReport.candidateBlendSha256,
  };

  const root = (json.nodes || []).find((node) => node.name === ROOT_NODE);
  if (!root) throw new Error(`reviewed relay candidate is missing ${ROOT_NODE}`);
  root.extras = {
    ...(root.extras || {}),
    'spaceface.assetId': LIVE_ASSET_ID,
    'spaceface.partId': ASSET_ID,
    spacefaceAsset: liveMetadata,
    'spacefaceAssetJson': JSON.stringify(liveMetadata),
    'spaceface.acceptedCandidateId': buildReport.candidateId,
    'spaceface.acceptedCandidateSha256': candidateSha256,
    'spaceface.builder': buildReport.builder,
    'spaceface.promoter': PROMOTER,
  };
  delete root.extras['spaceface.candidateId'];
});
const liveSourceSha256 = sha256(liveSourceBytes);
validateLiveSource(liveSourceBytes, buildReport, candidateSha256);

const previousManifestBytes = readFileSync(PARTS_MANIFEST);
const manifest = JSON.parse(previousManifestBytes.toString('utf8'));
const part = manifest.parts?.find((entry) => entry.id === ASSET_ID);
if (!part) throw new Error(`parts manifest is missing ${ASSET_ID}`);
part.tris = Number(buildReport.lod.lod0.triangles);
part.bytes = liveSourceBytes.length;
part.bounds = {
  min: [...buildReport.bounds.min],
  max: [...buildReport.bounds.max],
  dimensionsM: [...buildReport.bounds.size],
};
part.note = 'Trade Relay Claim material-truth V2; asteroid-gripping recovery/communications relay, '
  + 'PBR, explicit LOD0/1/2. '
  + `LOD0 ${part.tris} tris / ${buildReport.lod.lod0.drawGroups} draw groups.`;
const nextManifestBytes = jsonBytes(manifest);

const previousEvidenceBytes = readFileSync(EVIDENCE);
const evidence = JSON.parse(previousEvidenceBytes.toString('utf8'));
evidence.title = 'Trade Relay Claim — material-truth V2';
evidence.blend = buildReport.candidateBlend;
evidence.bytes = liveSourceBytes.length;
evidence.lod = structuredClone(buildReport.lod);
evidence.aabb = structuredClone(buildReport.bounds);
evidence.metadata = liveMetadata;
evidence.builtAt = buildReport.builtAt;
evidence.sha256 = liveSourceSha256;
evidence.canonical = 'assets/ships/parts/places/place_claim_outpost_relay.glb';
evidence.acceptedCandidate = {
  path: buildReport.sourceCandidate,
  sha256: candidateSha256,
  visualReview: relative(VISUAL_REVIEW),
  visualReviewSha256: sha256(visualReviewBytes),
};
const nextEvidenceBytes = jsonBytes(evidence);

const nextBuildReport = structuredClone(buildReport);
nextBuildReport.canonicalAssetsModified = true;
nextBuildReport.promotion = {
  stage: 'canonical_source_published',
  acceptedCandidateSha256: candidateSha256,
  liveSource: relative(LIVE_SOURCE),
  liveSourceSha256,
  liveSourceBytes: liveSourceBytes.length,
  packetSource: relative(PACKET_SOURCE),
  visualReview: relative(VISUAL_REVIEW),
  visualReviewSha256: sha256(visualReviewBytes),
  releaseBuilder: 'scripts/build-place-release-assets.mjs --ids place_claim_outpost_relay',
};
const nextBuildReportBytes = jsonBytes(nextBuildReport);

await publishFileSetTransaction({
  files: [
    sourceDescriptor(LIVE_SOURCE, liveSourceBytes, buildReport, candidateSha256),
    sourceDescriptor(PACKET_SOURCE, liveSourceBytes, buildReport, candidateSha256),
    {
      path: PARTS_MANIFEST,
      bytes: nextManifestBytes,
      expectedCurrentSha256: sha256(previousManifestBytes),
      validate: async (_path, bytes) => validateManifest(bytes, liveSourceBytes.length, buildReport),
    },
    {
      path: EVIDENCE,
      bytes: nextEvidenceBytes,
      expectedCurrentSha256: sha256(previousEvidenceBytes),
      validate: async (_path, bytes) => validateEvidence(bytes, liveSourceSha256, candidateSha256),
    },
    {
      path: BUILD_REPORT,
      bytes: nextBuildReportBytes,
      expectedCurrentSha256: sha256(buildReportBytes),
      validate: async (_path, bytes) => validatePromotionReport(bytes, liveSourceSha256),
    },
  ],
  guards: [
    { path: CANDIDATE, expectedCurrentSha256: candidateSha256 },
    { path: VISUAL_REVIEW, expectedCurrentSha256: sha256(visualReviewBytes) },
    { path: VALIDATION_BINDING, expectedCurrentSha256: sha256(validationBindingBytes) },
    { path: candidateBlend, expectedCurrentSha256: candidateBlendSha256 },
    { path: releaseCandidate, expectedCurrentSha256: releaseCandidateSha256 },
    { path: canonicalBlend, expectedCurrentSha256: canonicalBlendSha256 },
    ...reviewArtifactGuards(visualReview),
  ],
});

console.log(JSON.stringify({
  schema: 'spaceface.claimOutpostRelayMaterialTruthPromotion.v1',
  assetId: ASSET_ID,
  acceptedCandidateSha256: candidateSha256,
  liveSourceSha256,
  liveSourceBytes: liveSourceBytes.length,
  lodTriangles: Object.fromEntries(
    Object.entries(buildReport.lod).map(([lod, value]) => [lod, value.triangles]),
  ),
  transactionallyPublished: [
    relative(LIVE_SOURCE),
    relative(PACKET_SOURCE),
    relative(PARTS_MANIFEST),
    relative(EVIDENCE),
    relative(BUILD_REPORT),
  ],
  releasePending: true,
}, null, 2));

function sourceDescriptor(path, bytes, report, acceptedCandidateSha256) {
  return {
    path,
    bytes,
    expectedCurrentSha256: sha256(readFileSync(path)),
    validate: async (_stagedPath, stagedBytes) => {
      validateLiveSource(stagedBytes, report, acceptedCandidateSha256);
    },
  };
}

function productionMetadata(json, report, review, acceptedCandidateSha256) {
  const scene = json.scenes?.[json.scene || 0];
  const root = (json.nodes || []).find((node) => node.name === ROOT_NODE);
  const encoded = root?.extras?.spacefaceAssetJson || scene?.extras?.spacefaceAssetJson;
  if (typeof encoded !== 'string') throw new Error('candidate has no serialized SpaceFace metadata');
  const metadata = JSON.parse(encoded);
  delete metadata.candidateId;
  return {
    ...metadata,
    assetId: LIVE_ASSET_ID,
    partId: ASSET_ID,
    liveId: ASSET_ID,
    category: 'places',
    priority: 'P0',
    triangleCount: Number(report.lod.lod0.triangles),
    lodTriangles: Object.fromEntries(
      Object.entries(report.lod).map(([lod, value]) => [lod, Number(value.triangles)]),
    ),
    drawGroupsPerLod: Object.fromEntries(
      Object.entries(report.lod).map(([lod, value]) => [lod, Number(value.drawGroups)]),
    ),
    lod0AabbSize: [...report.bounds.size],
    wiringStatus: 'production_source',
    acceptedCandidateId: report.candidateId,
    acceptedCandidateSha256,
    sourceBlend: report.candidateBlend,
    sourceBlendSha256: report.candidateBlendSha256,
    builder: report.builder,
    promoter: PROMOTER,
    visualReview: relative(VISUAL_REVIEW),
    visualReviewSha256: sha256(visualReviewBytes),
    visualVerdict: {
      G1: review.verdict.G1,
      G2: review.verdict.G2,
      G4: review.verdict.G4,
      scope: 'lineage_bound_authoring_review',
      reviewedSourceSha256: review.reviewedCandidate.sourceSha256,
      exactFinalVisualBinding: false,
      nextGate: review.nextGate,
    },
  };
}

function validateLiveSource(bytes, report, acceptedCandidateSha256) {
  const { json } = parseGlb(Buffer.from(bytes), 'staged canonical relay source');
  assertCandidateStructure(json, report);
  const metadata = json.asset?.extras?.spacefaceAsset;
  const rootMetadata = (json.nodes || []).find((node) => node.name === ROOT_NODE)
    ?.extras?.spacefaceAsset;
  if (!metadata || metadata.wiringStatus !== 'production_source') {
    throw new Error('staged source lacks production_source metadata');
  }
  if (!rootMetadata || JSON.stringify(rootMetadata) !== JSON.stringify(metadata)) {
    throw new Error('staged source canonical root lacks the exact structured spacefaceAsset contract');
  }
  assertEqualIgnoreCase(
    metadata.acceptedCandidateSha256,
    acceptedCandidateSha256,
    'staged source accepted-candidate binding drifted',
  );
  if (json.asset.extras.triangleCount !== Number(report.lod.lod0.triangles)) {
    throw new Error('staged source flat triangle count does not match LOD0');
  }
  if (json.asset.extras.textureSize !== 1024 || json.asset.extras.category !== 'places') {
    throw new Error('staged source flat manifest metadata is incomplete');
  }
}

function validateManifest(bytes, expectedBytes, report) {
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  const row = parsed.parts?.find((entry) => entry.id === ASSET_ID);
  if (!row || row.bytes !== expectedBytes || row.tris !== Number(report.lod.lod0.triangles)) {
    throw new Error('staged parts-manifest relay row does not match the promoted source');
  }
  if (JSON.stringify(row.bounds?.dimensionsM) !== JSON.stringify(report.bounds.size)) {
    throw new Error('staged parts-manifest relay bounds do not match the frozen envelope');
  }
}

function validateEvidence(bytes, liveSourceSha256, candidateSha256) {
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  assertEqualIgnoreCase(parsed.sha256, liveSourceSha256, 'staged evidence live-source hash drifted');
  assertEqualIgnoreCase(
    parsed.acceptedCandidate?.sha256,
    candidateSha256,
    'staged evidence candidate hash drifted',
  );
}

function validatePromotionReport(bytes, liveSourceSha256) {
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (parsed.canonicalAssetsModified !== true
    || parsed.promotion?.stage !== 'canonical_source_published') {
    throw new Error('staged build report does not record canonical source publication');
  }
  assertEqualIgnoreCase(
    parsed.promotion.liveSourceSha256,
    liveSourceSha256,
    'staged build-report live-source hash drifted',
  );
}

function assertCandidateStructure(json, report) {
  const nodes = json.nodes || [];
  const names = new Set(nodes.map((node) => node.name));
  if (names.size !== nodes.length || nodes.some((node) => typeof node.name !== 'string')) {
    throw new Error('candidate node names must be present and unique');
  }
  for (const name of REQUIRED_NODES) {
    if (!names.has(name)) throw new Error(`candidate is missing required node ${name}`);
  }
  const rootIndex = nodes.findIndex((node) => node.name === ROOT_NODE);
  const rootNode = nodes[rootIndex];
  const sceneRoots = json.scenes?.[json.scene || 0]?.nodes || [];
  if (sceneRoots.length !== 1 || sceneRoots[0] !== rootIndex
    || !identityTransform(rootNode)
    || nodes.some((node) => (node.children || []).includes(rootIndex))) {
    throw new Error('candidate must have one unparented identity-transform canonical root');
  }
  const rootChildren = rootNode.children || [];
  if (rootChildren.length !== nodes.length - 1
    || new Set(rootChildren).size !== rootChildren.length
    || rootChildren.some((index) => index === rootIndex || !nodes[index])) {
    throw new Error('canonical root must directly own every contract and presentation node exactly once');
  }
  for (const [name, expectedTranslation] of Object.entries(SOCKET_TRANSLATIONS)) {
    const socketNode = nodes.find((node) => node.name === name);
    if (socketNode.mesh != null
      || !identityRotationScale(socketNode)
      || !exactNumberArray(socketNode.translation || [0, 0, 0], expectedTranslation)
      || !rootChildren.includes(nodes.indexOf(socketNode))) {
      throw new Error(`${name} mesh/transform/root-parent contract drifted`);
    }
  }
  const collisionNode = nodes.find((node) => node.name === 'COLLISION_HULL');
  const collisionPrimitives = json.meshes?.[collisionNode.mesh]?.primitives || [];
  if (collisionPrimitives.length !== 1
    || primitiveTriangles(json, collisionPrimitives[0]) !== 44
    || !identityTransform(collisionNode)
    || collisionNode.extras?.['spaceface.collision'] !== 'broadphase_only'
    || collisionNode.extras?.['spaceface.structureRole'] !== 'COLLISION_HULL') {
    throw new Error('collision proxy geometry or broadphase-only semantic contract drifted');
  }
  const meshNodes = nodes.filter((node) => node.mesh != null);
  if (meshNodes.length !== 16) {
    throw new Error(`candidate must contain fifteen LOD draw groups plus collision; got ${meshNodes.length}`);
  }
  const primitives = meshNodes.flatMap((node) => json.meshes[node.mesh].primitives || []);
  const incompleteVertexContracts = primitives.filter((primitive) => (
    primitive.attributes?.POSITION == null
    || primitive.attributes?.NORMAL == null
    || primitive.attributes?.TANGENT == null
    || primitive.attributes?.TEXCOORD_0 == null
  ));
  if (incompleteVertexContracts.length) {
    throw new Error(
      `${incompleteVertexContracts.length}/${primitives.length} mesh primitives lack `
      + 'POSITION/NORMAL/TANGENT/TEXCOORD_0',
    );
  }
  const materialNames = (json.materials || []).map((material) => material.name).sort();
  const expectedMaterials = [
    'Material_Accent',
    'Material_Glass',
    'Material_Hull',
    'Material_Mechanical',
    'Material_Warm',
  ];
  if (JSON.stringify(materialNames) !== JSON.stringify(expectedMaterials)) {
    throw new Error(`candidate material-role set drifted: ${materialNames.join(', ')}`);
  }
  for (const lod of ['lod0', 'lod1', 'lod2']) {
    const prefix = lod.toUpperCase();
    const groups = (json.nodes || []).filter(
      (node) => typeof node.name === 'string' && node.name.startsWith(`${prefix}_`) && node.mesh != null,
    );
    if (groups.length !== Number(report.lod[lod].drawGroups)) {
      throw new Error(`${prefix} draw-group count drift: ${groups.length}`);
    }
    const groupRoles = groups.map((group) => group.extras?.['spaceface.materialRole']).sort();
    if (JSON.stringify(groupRoles) !== JSON.stringify(expectedMaterials)) {
      throw new Error(`${prefix} must contain the exact five semantic material roles`);
    }
    for (const group of groups) {
      const groupPrimitives = json.meshes[group.mesh].primitives || [];
      const role = group.extras?.['spaceface.materialRole'];
      const assignedMaterial = groupPrimitives.length === 1
        ? json.materials?.[groupPrimitives[0].material]?.name
        : null;
      if (groupPrimitives.length !== 1
        || !expectedMaterials.includes(role)
        || assignedMaterial !== role
        || !group.name.endsWith(role)) {
        throw new Error(`${group.name} does not preserve one exact semantic material draw group`);
      }
    }
    const triangleCount = groups.reduce((sum, node) => sum + (json.meshes[node.mesh].primitives || [])
      .reduce((meshSum, primitive) => meshSum + primitiveTriangles(json, primitive), 0), 0);
    if (triangleCount !== Number(report.lod[lod].triangles)) {
      throw new Error(`${prefix} triangle count drift: ${triangleCount}`);
    }
  }
}

function identityTransform(node) {
  return !node.matrix
    && exactNumberArray(node.translation || [0, 0, 0], [0, 0, 0])
    && identityRotationScale(node);
}

function identityRotationScale(node) {
  return exactNumberArray(node.rotation || [0, 0, 0, 1], [0, 0, 0, 1])
    && exactNumberArray(node.scale || [1, 1, 1], [1, 1, 1]);
}

function exactNumberArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => Number(value) === Number(expected[index]));
}

function primitiveTriangles(json, primitive) {
  if ((primitive.mode ?? 4) !== 4) return 0;
  const count = json.accessors?.[primitive.indices]?.count
    ?? json.accessors?.[primitive.attributes?.POSITION]?.count
    ?? 0;
  return Math.floor(count / 3);
}

function parseGlb(bytes, label) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error(`${label} is not GLB v2`);
  }
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`${label} length mismatch`);
  let json = null;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) throw new Error(`${label} chunk overrun`);
    if (type === JSON_CHUNK) {
      json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').trim());
    }
    offset += 8 + length;
  }
  if (!json) throw new Error(`${label} has no JSON chunk`);
  return { json };
}

function rewriteGlbJson(bytes, mutate) {
  const chunks = [];
  let offset = 12;
  let patched = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset + 8 + length > bytes.length) throw new Error('candidate GLB chunk overrun');
    if (type === JSON_CHUNK) {
      const json = JSON.parse(data.toString('utf8').trim());
      mutate(json);
      const encoded = Buffer.from(JSON.stringify(json), 'utf8');
      const padding = (4 - (encoded.length % 4)) % 4;
      chunks.push({ type, data: Buffer.concat([encoded, Buffer.alloc(padding, 0x20)]) });
      patched = true;
    } else {
      chunks.push({ type, data: Buffer.from(data) });
    }
    offset += 8 + length;
  }
  if (!patched) throw new Error('candidate GLB has no JSON chunk');
  const total = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const out = Buffer.allocUnsafe(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(GLB_VERSION, 4);
  out.writeUInt32LE(total, 8);
  offset = 12;
  for (const chunk of chunks) {
    out.writeUInt32LE(chunk.data.length, offset);
    out.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(out, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return out;
}

function appendGeneratorStep(generator, step) {
  const values = String(generator || 'Khronos glTF Blender I/O')
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.includes(step)) values.push(step);
  return values.join(' | ');
}

function assertEqualIgnoreCase(left, right, message) {
  if (String(left || '').toLowerCase() !== String(right || '').toLowerCase()) {
    throw new Error(`${message}: ${left || '<missing>'} != ${right || '<missing>'}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function reviewArtifactGuards(review) {
  if (!Array.isArray(review.evidence) || review.evidence.length !== 12) {
    throw new Error('visual review must bind all twelve matched baseline/candidate images');
  }
  const declared = [
    ...review.evidence.map(({ path, sha256: expectedCurrentSha256 }) => ({
      path: repoPath(path),
      expectedCurrentSha256,
    })),
    {
      path: repoPath(review.renderProvenance?.path),
      expectedCurrentSha256: review.renderProvenance?.sha256,
    },
    ...['foundry', 'khronos'].map((validator) => ({
      path: repoPath(review.technicalCandidate?.validatorReports?.[validator]?.path),
      expectedCurrentSha256: review.technicalCandidate?.validatorReports?.[validator]?.sha256,
    })),
  ];
  const unique = new Set(declared.map(({ path }) => path.toLowerCase()));
  if (unique.size !== declared.length) throw new Error('visual-review guarded artifact paths repeat');
  for (const record of declared) {
    if (!/^[0-9a-f]{64}$/i.test(String(record.expectedCurrentSha256 || ''))) {
      throw new Error(`visual-review artifact lacks a SHA-256 binding: ${relative(record.path)}`);
    }
  }
  return declared;
}

function validateDeclaredValidatorOutcomes(review) {
  const foundryRecord = review.technicalCandidate?.validatorReports?.foundry;
  const khronosRecord = review.technicalCandidate?.validatorReports?.khronos;
  const foundry = JSON.parse(readFileSync(repoPath(foundryRecord?.path), 'utf8'));
  const khronos = JSON.parse(readFileSync(repoPath(khronosRecord?.path), 'utf8'));
  if (validationBinding.schema !== 'spaceface.claimOutpostRelayValidationBinding.v1'
    || validationBinding.assetId !== ASSET_ID
    || validationBinding.candidate?.path !== relative(CANDIDATE)
    || Number(validationBinding.candidate?.bytes) !== candidateBytes.length) {
    throw new Error('validator binding identity/path/byte contract does not match the candidate');
  }
  assertEqualIgnoreCase(
    validationBinding.candidate?.sha256,
    candidateSha256,
    'validator binding candidate hash drifted',
  );
  if (buildReport.validation?.binding !== relative(VALIDATION_BINDING)
    || Number(buildReport.validation?.candidateBytes) !== candidateBytes.length) {
    throw new Error('build report does not name the exact validator binding/candidate bytes');
  }
  assertEqualIgnoreCase(
    buildReport.validation?.bindingSha256,
    sha256(validationBindingBytes),
    'build-report validator-binding hash drifted',
  );
  assertEqualIgnoreCase(
    buildReport.validation?.candidateSha256,
    candidateSha256,
    'build-report validated-candidate hash drifted',
  );
  for (const [name, record] of Object.entries({ foundry: foundryRecord, khronos: khronosRecord })) {
    const binding = validationBinding.validators?.[name];
    if (binding?.report !== record?.path) {
      throw new Error(`${name} validator binding report path drifted`);
    }
    assertEqualIgnoreCase(
      binding?.reportSha256,
      record?.sha256,
      `${name} validator binding/report hash drifted`,
    );
    assertEqualIgnoreCase(
      binding?.reportSha256,
      sha256(readFileSync(repoPath(binding?.report))),
      `${name} validator binding does not match report bytes`,
    );
  }
  if (foundry.verdict?.pass !== true
    || (foundry.verdict?.failures || []).length !== 0
    || (foundry.verdict?.warnings || []).length !== 0
    || review.technicalCandidate?.foundry?.pass !== true
    || review.technicalCandidate?.foundry?.failures !== 0
    || review.technicalCandidate?.foundry?.warnings !== 0) {
    throw new Error('Foundry validator report/review outcome is not an exact zero-issue PASS');
  }
  const issues = khronos.issues || {};
  for (const key of ['numErrors', 'numWarnings', 'numInfos', 'numHints']) {
    if (Number(issues[key]) !== 0) throw new Error(`Khronos validator ${key} is not zero`);
  }
  if (review.technicalCandidate?.khronos?.errors !== 0
    || review.technicalCandidate?.khronos?.warnings !== 0
    || review.technicalCandidate?.khronos?.infos !== 0
    || review.technicalCandidate?.khronos?.hints !== 0) {
    throw new Error('visual review does not preserve the exact zero-issue Khronos outcome');
  }
}

function validateFinalizedPublication(report, candidateSha256) {
  const promotion = report.promotion;
  assertEqualIgnoreCase(
    promotion.acceptedCandidateSha256,
    candidateSha256,
    'finalized promotion candidate binding drifted',
  );
  const sourceBytes = readFileSync(repoPath(promotion.liveSource));
  const packetBytes = readFileSync(repoPath(promotion.packetSource));
  const releaseBytes = readFileSync(repoPath(promotion.liveRelease));
  assertEqualIgnoreCase(sha256(sourceBytes), promotion.liveSourceSha256, 'finalized live-source hash drifted');
  assertEqualIgnoreCase(sha256(packetBytes), promotion.liveSourceSha256, 'finalized packet-source hash drifted');
  assertEqualIgnoreCase(sha256(releaseBytes), promotion.liveReleaseSha256, 'finalized release hash drifted');
  if (sourceBytes.length !== Number(promotion.liveSourceBytes)
    || packetBytes.length !== Number(promotion.liveSourceBytes)
    || releaseBytes.length !== Number(promotion.liveReleaseBytes)) {
    throw new Error('finalized source/release byte counts drifted');
  }
  const releaseManifest = JSON.parse(readFileSync(repoPath(promotion.releaseManifest), 'utf8'));
  const row = releaseManifest.assets?.find((entry) => entry.id === ASSET_ID);
  if (!row
    || row.source !== promotion.liveSource
    || row.release !== promotion.liveRelease
    || Number(row.sourceBytes) !== Number(promotion.liveSourceBytes)
    || Number(row.releaseBytes) !== Number(promotion.liveReleaseBytes)) {
    throw new Error('finalized release-manifest row path/byte contract drifted');
  }
  assertEqualIgnoreCase(row.sourceSha256, promotion.liveSourceSha256, 'finalized manifest source hash drifted');
  assertEqualIgnoreCase(row.releaseSha256, promotion.liveReleaseSha256, 'finalized manifest release hash drifted');
}

function repoPath(path) {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new Error('review provenance path must be a non-empty repository-relative string');
  }
  const absolute = resolve(ROOT, path);
  const rootPrefix = `${ROOT.toLowerCase()}\\`;
  if (!absolute.toLowerCase().startsWith(rootPrefix)) {
    throw new Error(`review provenance path escapes repository root: ${path}`);
  }
  return absolute;
}

function relative(path) {
  return path.slice(ROOT.length + 1).replace(/\\/g, '/');
}
