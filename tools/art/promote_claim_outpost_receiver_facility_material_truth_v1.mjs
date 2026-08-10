#!/usr/bin/env node
/**
 * Promote the independently reviewed PQ-019 receiver-facility candidates.
 *
 * This is intentionally a source-only transaction. It publishes exactly the two reviewed Blender
 * files, their packet/canonical source GLBs, their legacy evidence rows, and the two corresponding
 * parts-manifest rows. Release generation and the complete 81-package render rebuild remain
 * separate, explicitly named steps.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishFileSetTransaction } from './lib/multiFileTransaction.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const PROMOTER = 'tools/art/promote_claim_outpost_receiver_facility_material_truth_v1.mjs';
const BUILDER = 'tools/blender/build_claim_outpost_receiver_facility_material_truth_v1.py';
const RENDERER = 'tools/blender/render_claim_outpost_receiver_facility_material_truth_v1.py';
const STATION_VISUAL_FAMILY = 'tools/blender/build_station_visual_family.py';
const CANDIDATE_ID = 'receiver_facility_material_truth_v1';
const DISPATCH_UNIT = 'PQ-019.receiver-facility-reauthor';
const EVIDENCE_ROOT = 'assets/ships/m5_claim_outposts/evidence/pq019-receivers-material-truth-v1';
const PREFLIGHT = `${EVIDENCE_ROOT}/MATERIAL_TRUTH_PREFLIGHT.md`;
const BUILD_REPORT = `${EVIDENCE_ROOT}/build-report.json`;
const RENDER_REPORT = `${EVIDENCE_ROOT}/render-report.json`;
const PACKAGE_LIST_SERIALIZATION = 'git ls-files result normalized to forward-slash repo-relative paths, '
  + 'ordinal sorted, joined as UTF-8 LF with no trailing LF';
const MATERIALS = Object.freeze([
  'Material_Accent',
  'Material_Glass',
  'Material_Hull',
  'Material_Mechanical',
  'Material_Warm',
]);
const COMMON_SOCKETS = Object.freeze({
  SOCKET_Structure_Core: Object.freeze([0, 0, 0]),
  SOCKET_Dock_Approach: Object.freeze([48, 0, -2]),
  SOCKET_Module_Depot: Object.freeze([-20, -20, -1]),
  SOCKET_Module_Refinery: Object.freeze([-20, 20, -1]),
  SOCKET_Module_Defense: Object.freeze([20, -20, -1]),
  SOCKET_Module_Teleporter: Object.freeze([20, 20, -1]),
});
const SURFACE_VIEWS = Object.freeze([
  'front_three_quarter',
  'rear_three_quarter',
  'service_side',
  'top_load_path',
  'role_close',
  'dock_axis',
]);
const VIEWS = Object.freeze([
  ...SURFACE_VIEWS.map((view) => `surface_${view}.png`),
  ...SURFACE_VIEWS.map((view) => `clay_${view}.png`),
  'hard_grazing.png',
  'material_id.png',
  'emissive_off.png',
  'lod1_front_three_quarter.png',
  'lod2_front_three_quarter.png',
  'runtime_close.png',
  'runtime_default.png',
  'runtime_far.png',
]);
const SHARED_FILE_PATHS = Object.freeze({
  partsManifest: 'assets/ships/parts/parts_manifest.json',
  releaseManifest: 'assets/ships/release/release_manifest.json',
  worldSiteAssetBindings: 'src/data/worldSiteAssetBindings.js',
  pilots: 'assets/ships/render-packages/pilots.json',
  renderPackageManifest: 'src/render/renderPackageManifest.js',
  familySummary: 'assets/ships/m5_claim_outposts/evidence/family_summary.json',
});
const SIBLING_PATHS = Object.freeze({
  place_claim_outpost_relay: Object.freeze({
    packetSource: 'assets/ships/m5_claim_outposts/source/places/place_claim_outpost_relay.glb',
    canonicalSource: 'assets/ships/parts/places/place_claim_outpost_relay.glb',
    release: 'assets/ships/release/parts/places/place_claim_outpost_relay.glb',
    acceptedBlend: 'assets/ships/m5_claim_outposts/blender/place_claim_outpost_relay_material_truth_v2.blend',
    renderGlb: 'assets/ships/release/render-packages/claim-outpost-relay/render.glb',
    renderPackage: 'assets/ships/release/render-packages/claim-outpost-relay/render-package.json',
  }),
  place_claim_outpost_bastion: Object.freeze({
    packetSource: 'assets/ships/m5_claim_outposts/source/places/place_claim_outpost_bastion.glb',
    canonicalSource: 'assets/ships/parts/places/place_claim_outpost_bastion.glb',
    release: 'assets/ships/release/parts/places/place_claim_outpost_bastion.glb',
    blend: 'assets/ships/m5_claim_outposts/blender/place_claim_outpost_bastion.blend',
    renderGlb: 'assets/ships/release/render-packages/outpost-bastion/render.glb',
    renderPackage: 'assets/ships/release/render-packages/outpost-bastion/render-package.json',
  }),
});

function assetContract(id, key, emissive) {
  const evidenceRoot = `${EVIDENCE_ROOT}/${id}`;
  return Object.freeze({
    key,
    id,
    liveAssetId: `SF_${id.toUpperCase()}`,
    rootNode: `SF_${id.toUpperCase()}_ROOT`,
    paths: Object.freeze({
      candidateBlend: `assets/ships/m5_claim_outposts/blender/${id}_${CANDIDATE_ID}.blend`,
      canonicalBlend: `assets/ships/m5_claim_outposts/blender/${id}.blend`,
      sourceCandidate: `assets/ships/m5_claim_outposts/source_candidates/${CANDIDATE_ID}/places/${id}.glb`,
      releaseCandidate: `assets/ships/m5_claim_outposts/release_candidates/${CANDIDATE_ID}/places/${id}.glb`,
      packetSource: `assets/ships/m5_claim_outposts/source/places/${id}.glb`,
      canonicalSource: `assets/ships/parts/places/${id}.glb`,
      legacyEvidence: `assets/ships/m5_claim_outposts/evidence/${id}.json`,
      visualReview: `${evidenceRoot}/visual-review.json`,
      validationBinding: `${evidenceRoot}/validation/validation-binding.json`,
      foundryReport: `${evidenceRoot}/validation/foundry/${id}.glb.report.json`,
      khronosReport: `${evidenceRoot}/validation/khronos/${id}.glb.report.json`,
      evidenceRoot,
    }),
    sockets: Object.freeze({
      ...COMMON_SOCKETS,
      SOCKET_Emissive: Object.freeze(emissive),
    }),
  });
}

export const RECEIVER_FACILITY_PROMOTION_CONTRACT = Object.freeze({
  schema: 'spaceface.claimOutpostReceiverFacilityMaterialTruthPromotion.v1',
  buildSchema: 'spaceface.claimOutpostReceiverFacilityMaterialTruthBuild.v1',
  visualReviewSchema: 'spaceface.claimOutpostReceiverFacilityMaterialTruthVisualReview.v1',
  renderSchema: 'spaceface.claimOutpostReceiverFacilityMaterialTruthRender.v1',
  validationBindingSchema: 'spaceface.claimOutpostReceiverFacilityValidationBinding.v1',
  baselineSchema: 'spaceface.pq019ReceiverFacilityBaseline.v1',
  dispatchUnit: DISPATCH_UNIT,
  candidateId: CANDIDATE_ID,
  evidenceRoot: EVIDENCE_ROOT,
  preflight: PREFLIGHT,
  baselineManifest: `${EVIDENCE_ROOT}/baseline-manifest.json`,
  buildReport: BUILD_REPORT,
  renderReport: RENDER_REPORT,
  partsManifest: 'assets/ships/parts/parts_manifest.json',
  builder: BUILDER,
  renderer: RENDERER,
  stationVisualFamily: STATION_VISUAL_FAMILY,
  attributeStabilization: Object.freeze({
    texcoordGridDenominator: 32768,
    maxTexelDisplacementAt1024: 0.015625,
    timing: 'post_triangulation_pre_save_fresh_process_export',
    derivedTangents: 'exporter_recomputed_from_stabilized_texcoords',
    sceneNormalization: 'save_then_fresh_blender_process_export',
  }),
  releaseCandidateSemantics: 'isolated_source_mirror_not_release_proof',
  materials: MATERIALS,
  views: VIEWS,
  assets: Object.freeze([
    assetContract('place_claim_outpost_base', 'base', [0, 0, -8.125]),
    assetContract('place_claim_outpost_refinery', 'refinery', [0, 0, -20.10449981689453]),
  ]),
  externalNextSteps: Object.freeze([
    'node scripts/build-place-release-assets.mjs --ids place_claim_outpost_base,place_claim_outpost_refinery',
    'synchronize the two source/release rows in src/data/worldSiteAssetBindings.js and assets/ships/render-packages/pilots.json',
    'npm run build:render-package-pilots (full tracked 81-package rebuild)',
  ]),
});

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function jsonEqual(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function assertSha256(value, label) {
  if (!/^[0-9a-f]{64}$/i.test(String(value || ''))) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
}

function assertIdentity(identity, label) {
  if (!identity || typeof identity.path !== 'string' || identity.path.length === 0
      || !Number.isInteger(identity.bytes) || identity.bytes <= 0) {
    throw new Error(`${label} identity is incomplete`);
  }
  assertSha256(identity.sha256, `${label} hash`);
}

function assertRelativePath(path, label) {
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path)
      || path.replaceAll('\\', '/').split('/').includes('..')) {
    throw new Error(`${label} must be a repository-relative path`);
  }
}

function resolveUnder(rootDir, path, label = 'contract path') {
  assertRelativePath(path, label);
  const root = resolve(rootDir);
  const target = resolve(root, path);
  const delta = relative(root, target);
  if (!delta || delta === '..' || delta.startsWith(`..${sep}`) || isAbsolute(delta)) {
    throw new Error(`${label} escapes or aliases its root: ${path}`);
  }
  return target;
}

function identityAtRoot(rootDir, path) {
  const contents = readFileSync(resolveUnder(rootDir, path));
  return { path, sha256: sha256(contents), bytes: contents.length, contents };
}

function assertIdentityAtRoot(rootDir, expected, label) {
  assertIdentity(expected, label);
  const actual = identityAtRoot(rootDir, expected.path);
  if (actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()
      || actual.bytes !== expected.bytes) {
    throw new Error(`${label} changed: ${expected.path}`);
  }
  return actual;
}

export function validateReceiverFacilityBaselineManifest(baseline) {
  if (baseline?.schema !== RECEIVER_FACILITY_PROMOTION_CONTRACT.baselineSchema
      || baseline?.status !== 'frozen_pre_authoring') {
    throw new Error('receiver-facility baseline is not the frozen pre-authoring contract');
  }
  const ids = RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.map(({ id }) => id);
  if (!jsonEqual(Object.keys(baseline.targets || {}), ids)) {
    throw new Error('receiver-facility baseline target allowlist must be exactly base and refinery');
  }
  if (baseline.genericFamilyTools?.mustNotRun !== true
      || !jsonEqual(baseline.genericFamilyTools?.mustRemainUnchanged, [
        'tools/blender/build_claim_outpost_family.py',
        'tools/art/finalize_claim_outpost_family.mjs',
      ])) {
    throw new Error('receiver-facility baseline must prohibit both generic four-family tools');
  }
  if (baseline.renderPackageClosure?.trackedPackageJsonCount !== 81
      || baseline.renderPackageClosure?.trackedPackageJsonPathListSerialization !== PACKAGE_LIST_SERIALIZATION
      || !/^[0-9a-f]{64}$/i.test(baseline.renderPackageClosure?.trackedPackageJsonPathListSha256 || '')
      || !String(baseline.renderPackageClosure?.rule || '').includes('all 81')) {
    throw new Error('receiver-facility baseline lost the full 81-package closure');
  }
  for (const [key, path] of Object.entries(SHARED_FILE_PATHS)) {
    assertIdentity(baseline.sharedFiles?.[key], `baseline shared ${key}`);
    if (baseline.sharedFiles[key].path !== path) {
      throw new Error(`baseline shared ${key} path drifted`);
    }
  }
  for (const [sibling, fields] of Object.entries(SIBLING_PATHS)) {
    const row = baseline.protectedSiblings?.[sibling];
    if (!row || !jsonEqual(Object.keys(row).sort(), Object.keys(fields).sort())) {
      throw new Error(`${sibling} preservation record is incomplete`);
    }
    for (const [key, path] of Object.entries(fields)) {
      assertIdentity(row[key], `${sibling} ${key}`);
      if (row[key].path !== path) throw new Error(`${sibling} ${key} path drifted`);
    }
  }
  for (const [key, path] of Object.entries({
    builder: 'tools/blender/build_claim_outpost_family.py',
    finalizer: 'tools/art/finalize_claim_outpost_family.mjs',
  })) {
    assertIdentity(baseline.genericFamilyTools?.identities?.[key], `generic family ${key}`);
    if (baseline.genericFamilyTools.identities[key].path !== path) {
      throw new Error(`generic family ${key} identity path drifted`);
    }
  }
  assertIdentity(baseline.candidateToolchain?.stationVisualFamily, 'candidate station visual-family helper');
  if (baseline.candidateToolchain.stationVisualFamily.path !== STATION_VISUAL_FAMILY) {
    throw new Error('candidate station visual-family helper path drifted');
  }
  if (!jsonEqual(baseline.frozenSockets, COMMON_SOCKETS)) {
    throw new Error('receiver-facility baseline common socket contract drifted');
  }
  for (const asset of RECEIVER_FACILITY_PROMOTION_CONTRACT.assets) {
    const row = baseline.targets[asset.id];
    for (const [key, path] of Object.entries({
      blend: asset.paths.canonicalBlend,
      packetSource: asset.paths.packetSource,
      canonicalSource: asset.paths.canonicalSource,
      evidence: asset.paths.legacyEvidence,
    })) {
      assertIdentity(row?.[key], `${asset.id} baseline ${key}`);
      if (row[key].path !== path) throw new Error(`${asset.id} baseline ${key} path drifted`);
    }
    if (!exactNumberArray(row.emissiveSocket, asset.sockets.SOCKET_Emissive)
        || !numberVector(row.aabb?.min) || !numberVector(row.aabb?.max)
        || !numberVector(row.aabb?.size) || !numberVector(row.collisionDccSize)
        || !Array.isArray(row.lodTriangles) || row.lodTriangles.length !== 3) {
      throw new Error(`${asset.id} frozen geometry contract is incomplete`);
    }
  }
  assertIdentity(baseline.sharedFiles?.partsManifest, 'baseline parts manifest');
  if (baseline.sharedFiles.partsManifest.path !== RECEIVER_FACILITY_PROMOTION_CONTRACT.partsManifest) {
    throw new Error('baseline parts-manifest path drifted');
  }
  const runtime = baseline.runtimeContract;
  assertIdentity(runtime?.source, 'receiver runtime source');
  if (runtime.source.path !== 'src/data/heistFacilities.js'
      || runtime.lawfulCatcher?.facilityId !== 'lawful_catcher'
      || runtime.lawfulCatcher?.assetId !== ids[0]
      || runtime.fenceReceiver?.facilityId !== 'fence_receiver'
      || runtime.fenceReceiver?.assetId !== ids[1]
      || ![runtime.lawfulCatcher, runtime.fenceReceiver].every((record) => (
        Number.isFinite(record?.sectorLocalPos?.x)
        && Number.isFinite(record?.sectorLocalPos?.z)
        && Number.isFinite(record?.rotation)
        && Number.isFinite(record?.visualScale)
        && Number.isFinite(record?.placeRadius)
        && Number.isFinite(record?.custodyHeadSectorLocal?.x)
        && Number.isFinite(record?.custodyHeadSectorLocal?.z)
        && Number.isFinite(record?.custodyRadius)
      ))
      || !Array.isArray(runtime.routeLegs) || runtime.routeLegs.length !== 2
      || !runtime.routeLegs.every(Number.isFinite)
      || runtime.custodyHead?.noMesh !== true || runtime.custodyHead?.collides !== true
      || runtime.custodyHead?.collisionMaskOwner !== 'Masks.PAYLOAD'
      || runtime.custodyHead?.payloadCustodyOnly !== true) {
    throw new Error('receiver-facility runtime contract is incomplete or changes target identity');
  }
  return baseline;
}

export function parseGlbDocument(bytes, label = 'GLB') {
  const payload = Buffer.from(bytes || []);
  if (payload.length < 20 || payload.readUInt32LE(0) !== GLB_MAGIC
      || payload.readUInt32LE(4) !== GLB_VERSION || payload.readUInt32LE(8) !== payload.length) {
    throw new Error(`${label} is not a complete GLB v2 payload`);
  }
  const chunks = [];
  let json = null;
  let offset = 12;
  while (offset < payload.length) {
    if (offset + 8 > payload.length) throw new Error(`${label} has a truncated chunk header`);
    const length = payload.readUInt32LE(offset);
    const type = payload.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (length % 4 !== 0 || end > payload.length) throw new Error(`${label} has an invalid chunk`);
    const data = payload.subarray(offset + 8, end);
    if (type === JSON_CHUNK) {
      if (json) throw new Error(`${label} has more than one JSON chunk`);
      json = JSON.parse(data.toString('utf8').trim());
    }
    chunks.push({ type, data: Buffer.from(data) });
    offset = end;
  }
  if (!json || offset !== payload.length) throw new Error(`${label} has no valid JSON chunk`);
  return { bytes: payload, json, chunks };
}

function rewriteGlbJson(bytes, mutate) {
  const parsed = parseGlbDocument(bytes, 'candidate GLB');
  const chunks = parsed.chunks.map((chunk) => {
    if (chunk.type !== JSON_CHUNK) return chunk;
    const json = structuredClone(parsed.json);
    mutate(json);
    const encoded = Buffer.from(JSON.stringify(json), 'utf8');
    const padding = (4 - (encoded.length % 4)) % 4;
    return { type: JSON_CHUNK, data: Buffer.concat([encoded, Buffer.alloc(padding, 0x20)]) };
  });
  const total = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.allocUnsafe(total);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(total, 8);
  let offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

function nonJsonPayloadSha256(parsed) {
  return sha256(Buffer.concat(parsed.chunks.filter(({ type }) => type !== JSON_CHUNK)
    .flatMap(({ type, data }) => {
      const header = Buffer.allocUnsafe(8);
      header.writeUInt32LE(data.length, 0);
      header.writeUInt32LE(type, 4);
      return [header, data];
    })));
}

function primitiveTriangles(json, primitive) {
  if ((primitive.mode ?? 4) !== 4) return 0;
  const count = json.accessors?.[primitive.indices]?.count
    ?? json.accessors?.[primitive.attributes?.POSITION]?.count
    ?? 0;
  return Math.floor(Number(count) / 3);
}

function identityRotationScale(node) {
  return !node.matrix
    && exactNumberArray(node.rotation || [0, 0, 0, 1], [0, 0, 0, 1])
    && exactNumberArray(node.scale || [1, 1, 1], [1, 1, 1]);
}

function identityTransform(node) {
  return identityRotationScale(node)
    && exactNumberArray(node.translation || [0, 0, 0], [0, 0, 0]);
}

function exactNumberArray(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length
    && actual.every((value, index) => Number(value) === Number(expected[index]));
}

function numberVector(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function nearNumberArray(actual, expected, tolerance = 0.0005) {
  return numberVector(actual) && numberVector(expected)
    && actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
}

function accessorBounds(json, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  return accessor && numberVector(accessor.min) && numberVector(accessor.max)
    ? { min: accessor.min.map(Number), max: accessor.max.map(Number) }
    : null;
}

function unionBounds(bounds) {
  if (!bounds.length || bounds.some((entry) => !entry)) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const entry of bounds) {
    for (let index = 0; index < 3; index++) {
      min[index] = Math.min(min[index], entry.min[index]);
      max[index] = Math.max(max[index], entry.max[index]);
    }
  }
  return { min, max, size: max.map((value, index) => value - min[index]) };
}

function transformPoint(point, node) {
  const scale = node.scale || [1, 1, 1];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const translation = node.translation || [0, 0, 0];
  const x = point[0] * scale[0];
  const y = point[1] * scale[1];
  const z = point[2] * scale[2];
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy + translation[0],
    iy * qw + iw * -qy + iz * -qx - ix * -qz + translation[1],
    iz * qw + iw * -qz + ix * -qy - iy * -qx + translation[2],
  ];
}

function transformedAccessorBounds(json, primitive, node) {
  const local = accessorBounds(json, primitive.attributes?.POSITION);
  if (!local || node.matrix) return null;
  const points = [];
  for (const x of [local.min[0], local.max[0]]) {
    for (const y of [local.min[1], local.max[1]]) {
      for (const z of [local.min[2], local.max[2]]) points.push(transformPoint([x, y, z], node));
    }
  }
  return {
    min: [0, 1, 2].map((index) => Math.min(...points.map((point) => point[index]))),
    max: [0, 1, 2].map((index) => Math.max(...points.map((point) => point[index]))),
  };
}

function normalizedLodReport(report, asset) {
  const lod = report?.lod;
  const result = {};
  for (const level of ['lod0', 'lod1', 'lod2']) {
    const row = lod?.[level];
    if (!Number.isInteger(row?.triangles) || row.triangles <= 0 || row.drawGroups !== 5
        || (row.materials && !jsonEqual([...row.materials].sort(), [...MATERIALS].sort()))) {
      throw new Error(`${asset.id} build report ${level} contract is invalid`);
    }
    result[level] = { triangles: row.triangles, drawGroups: row.drawGroups };
  }
  if (!(result.lod0.triangles > result.lod1.triangles
    && result.lod1.triangles > result.lod2.triangles)) {
    throw new Error(`${asset.id} build report LODs must reduce strictly`);
  }
  return result;
}

export function validateReceiverFacilityCandidateStructure(bytes, asset, report, baselineTarget) {
  if (!RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.includes(asset)) {
    throw new Error('candidate structure validation requires one fixed receiver-facility asset');
  }
  const { json } = parseGlbDocument(bytes, `${asset.id} candidate`);
  const nodes = json.nodes || [];
  const names = nodes.map((node) => node.name);
  if (nodes.length !== 24 || names.some((name) => typeof name !== 'string')
      || new Set(names).size !== names.length) {
    throw new Error(`${asset.id} must have 24 uniquely named nodes`);
  }
  const rootIndex = nodes.findIndex(({ name }) => name === asset.rootNode);
  const root = nodes[rootIndex];
  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes || [];
  if (!root || !identityTransform(root) || sceneRoots.length !== 1 || sceneRoots[0] !== rootIndex
      || (root.children || []).length !== nodes.length - 1
      || new Set(root.children || []).size !== nodes.length - 1) {
    throw new Error(`${asset.id} canonical root hierarchy or identity transform drifted`);
  }
  for (const [name, translation] of Object.entries(asset.sockets)) {
    const socket = nodes.find((node) => node.name === name);
    if (!socket || socket.mesh != null || !identityRotationScale(socket)
        || !exactNumberArray(socket.translation || [0, 0, 0], translation)
        || !root.children.includes(nodes.indexOf(socket))
        || socket.extras?.['spaceface.socketRole'] !== name.replace('SOCKET_', '').toLowerCase()) {
      throw new Error(`${asset.id} ${name} transform/property contract drifted`);
    }
  }
  const collision = nodes.find((node) => node.name === 'COLLISION_HULL');
  const collisionPrimitives = json.meshes?.[collision?.mesh]?.primitives || [];
  const collisionPrimitive = collisionPrimitives[0];
  const collisionBounds = accessorBounds(json, collisionPrimitive?.attributes?.POSITION);
  const expectedCollisionGlbSize = [
    baselineTarget.collisionDccSize[0],
    baselineTarget.collisionDccSize[2],
    baselineTarget.collisionDccSize[1],
  ];
  const actualCollisionSize = collisionBounds?.max.map(
    (value, index) => value - collisionBounds.min[index],
  );
  if (!collision || !identityTransform(collision) || collisionPrimitives.length !== 1
      || primitiveTriangles(json, collisionPrimitive) !== 44
      || collision.extras?.['spaceface.collision'] !== 'broadphase_only'
      || collision.extras?.['spaceface.structureRole'] !== 'COLLISION_HULL'
      || !nearNumberArray(actualCollisionSize, expectedCollisionGlbSize)) {
    throw new Error(`${asset.id} frozen collision proxy contract drifted`);
  }
  const materialNames = (json.materials || []).map(({ name }) => name).sort();
  if (!jsonEqual(materialNames, [...MATERIALS].sort())) {
    throw new Error(`${asset.id} semantic material-role set drifted`);
  }
  const lod = normalizedLodReport(report, asset);
  for (const level of ['lod0', 'lod1', 'lod2']) {
    const prefix = level.toUpperCase();
    const groups = nodes.filter((node) => node.mesh != null && node.name.startsWith(`${prefix}_`));
    const roles = groups.map((node) => node.extras?.['spaceface.materialRole']).sort();
    if (groups.length !== 5 || !jsonEqual(roles, [...MATERIALS].sort())) {
      throw new Error(`${asset.id} ${prefix} must contain the exact five semantic draw groups`);
    }
    let triangles = 0;
    for (const group of groups) {
      const primitives = json.meshes?.[group.mesh]?.primitives || [];
      const role = group.extras?.['spaceface.materialRole'];
      const material = primitives.length === 1 ? json.materials?.[primitives[0].material]?.name : null;
      if (primitives.length !== 1 || material !== role || !group.name.endsWith(role)) {
        throw new Error(`${asset.id} ${group.name} material binding drifted`);
      }
      const attributes = primitives[0].attributes || {};
      if (['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0'].some((name) => attributes[name] == null)) {
        throw new Error(`${asset.id} ${group.name} lacks a runtime vertex contract`);
      }
      triangles += primitiveTriangles(json, primitives[0]);
    }
    if (triangles !== lod[level].triangles) {
      throw new Error(`${asset.id} ${prefix} triangle count does not match the build report`);
    }
  }
  const lod0Groups = nodes.filter((node) => node.mesh != null && node.name.startsWith('LOD0_'));
  const glbBounds = unionBounds(lod0Groups.flatMap((node) => (
    json.meshes[node.mesh].primitives.map((primitive) => transformedAccessorBounds(json, primitive, node))
  )));
  const bounds = glbBounds ? {
    min: [glbBounds.min[0], -glbBounds.max[2], glbBounds.min[1]],
    max: [glbBounds.max[0], -glbBounds.min[2], glbBounds.max[1]],
    size: [glbBounds.size[0], glbBounds.size[2], glbBounds.size[1]],
  } : null;
  if (!bounds || !nearNumberArray(bounds.min, baselineTarget.aabb.min)
      || !nearNumberArray(bounds.max, baselineTarget.aabb.max)
      || !nearNumberArray(bounds.size, baselineTarget.aabb.size)
      || !exactNumberArray(report.bounds?.min, baselineTarget.aabb.min)
      || !exactNumberArray(report.bounds?.max, baselineTarget.aabb.max)
      || !exactNumberArray(report.bounds?.size, baselineTarget.aabb.size)) {
    throw new Error(`${asset.id} frozen LOD0 AABB contract drifted`);
  }
  const meshNodes = nodes.filter((node) => node.mesh != null);
  if (meshNodes.length !== 16) throw new Error(`${asset.id} must have 15 LOD groups plus collision`);
  return { json, lod, bounds };
}

function validateFoundry(foundry, asset) {
  if (foundry?.verdict?.pass !== true || (foundry.verdict.failures || []).length !== 0
      || (foundry.verdict.warnings || []).length !== 0) {
    throw new Error(`${asset.id} Foundry validator is not a zero-issue PASS`);
  }
}

function validateKhronos(khronos, asset) {
  for (const key of ['numErrors', 'numWarnings', 'numInfos', 'numHints']) {
    if (Number(khronos?.issues?.[key]) !== 0) {
      throw new Error(`${asset.id} Khronos validator ${key} is not zero`);
    }
  }
}

function assertRecordIdentity(record, identity, label) {
  if (record?.path !== identity.path || Number(record?.bytes) !== identity.bytes
      || String(record?.sha256 || '').toLowerCase() !== identity.sha256) {
    throw new Error(`${label} identity does not match current bytes`);
  }
}

function assertHashRecordIdentity(record, identity, label) {
  if (record?.path !== identity.path
      || String(record?.sha256 || '').toLowerCase() !== identity.sha256) {
    throw new Error(`${label} identity does not match current bytes`);
  }
}

function expectedEvidencePaths(asset) {
  return ['baseline', 'candidate'].flatMap((band) => VIEWS.map(
    (view) => `${asset.paths.evidenceRoot}/${band}/${view}`,
  ));
}

function exactIdentityListAtRoot(rootDir, records, paths, label) {
  if (!Array.isArray(records) || records.length !== paths.length
      || !jsonEqual(records.map(({ path }) => path).sort(), [...paths].sort())) {
    throw new Error(`${label} must bind the exact ${paths.length}-file evidence allowlist`);
  }
  return records.map((record) => {
    const current = identityAtRoot(rootDir, record.path);
    assertRecordIdentity(record, current, label);
    return current;
  });
}

function expectedImageContract(filename) {
  const name = filename.slice(0, -4);
  if (name.startsWith('surface_')) return { name, look: 'surface', view: name.slice(8), lod: 0, runtimeZoom: null };
  if (name.startsWith('clay_')) return { name, look: 'clay', view: name.slice(5), lod: 0, runtimeZoom: null };
  if (name === 'hard_grazing') return { name, look: name, view: 'service_side', lod: 0, runtimeZoom: null };
  if (name === 'material_id') return { name, look: name, view: 'front_three_quarter', lod: 0, runtimeZoom: null };
  if (name === 'emissive_off') return { name, look: name, view: 'role_close', lod: 0, runtimeZoom: null };
  if (name === 'lod1_front_three_quarter') return { name, look: 'surface', view: 'front_three_quarter', lod: 1, runtimeZoom: null };
  if (name === 'lod2_front_three_quarter') return { name, look: 'surface', view: 'front_three_quarter', lod: 2, runtimeZoom: null };
  const runtime = { runtime_close: 72, runtime_default: 132, runtime_far: 264 }[name];
  return { name, look: 'surface', view: 'runtime_equivalent', lod: 0, runtimeZoom: runtime };
}

export function admitReceiverFacilityCandidate({
  rootDir = ROOT,
  asset,
  baseline,
  baselineTarget,
  baselineIdentity,
} = {}) {
  if (!RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.includes(asset)) {
    throw new Error('candidate admission requires one exact receiver-facility asset');
  }
  const identities = {
    candidateBlend: identityAtRoot(rootDir, asset.paths.candidateBlend),
    sourceCandidate: identityAtRoot(rootDir, asset.paths.sourceCandidate),
    releaseCandidate: identityAtRoot(rootDir, asset.paths.releaseCandidate),
    buildReport: identityAtRoot(rootDir, BUILD_REPORT),
    renderReport: identityAtRoot(rootDir, RENDER_REPORT),
    visualReview: identityAtRoot(rootDir, asset.paths.visualReview),
    validationBinding: identityAtRoot(rootDir, asset.paths.validationBinding),
    foundryReport: identityAtRoot(rootDir, asset.paths.foundryReport),
    khronosReport: identityAtRoot(rootDir, asset.paths.khronosReport),
    builder: identityAtRoot(rootDir, BUILDER),
    renderer: identityAtRoot(rootDir, RENDERER),
    stationVisualFamily: identityAtRoot(rootDir, STATION_VISUAL_FAMILY),
  };
  const buildReport = JSON.parse(identities.buildReport.contents.toString('utf8'));
  const build = buildReport.targets?.[asset.id];
  const renderReport = JSON.parse(identities.renderReport.contents.toString('utf8'));
  const review = JSON.parse(identities.visualReview.contents.toString('utf8'));
  const binding = JSON.parse(identities.validationBinding.contents.toString('utf8'));
  const foundry = JSON.parse(identities.foundryReport.contents.toString('utf8'));
  const khronos = JSON.parse(identities.khronosReport.contents.toString('utf8'));
  const targetIds = RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.map(({ id }) => id);
  if (buildReport.schema !== RECEIVER_FACILITY_PROMOTION_CONTRACT.buildSchema
      || buildReport.dispatchUnit !== DISPATCH_UNIT || buildReport.candidateId !== CANDIDATE_ID
      || buildReport.builder !== BUILDER || !jsonEqual(buildReport.targetOrder, targetIds)
      || !jsonEqual(
        buildReport.attributeStabilization,
        RECEIVER_FACILITY_PROMOTION_CONTRACT.attributeStabilization,
      )
      || buildReport.releaseCandidateSemantics
        !== RECEIVER_FACILITY_PROMOTION_CONTRACT.releaseCandidateSemantics
      || !jsonEqual(Object.keys(buildReport.targets || {}), targetIds)
      || buildReport.exactTwoTargetPipeline !== true
      || buildReport.canonicalAssetsModified !== false
      || buildReport.liveManifestsModified !== false
      || buildReport.protectedSiblingEnumeration !== false
      || build?.assetId !== asset.id || build?.runtimeAssetId !== asset.liveAssetId) {
    throw new Error(`${asset.id} shared build-report identity is not the fixed PQ-019 two-target contract`);
  }
  assertRecordIdentity(buildReport.evidenceBinding?.baselineManifest, baselineIdentity, 'frozen baseline manifest');
  const preflightIdentity = identityAtRoot(rootDir, PREFLIGHT);
  assertRecordIdentity(buildReport.evidenceBinding?.preflight, preflightIdentity, 'material-truth preflight');
  assertRecordIdentity(buildReport.toolchain?.builder, identities.builder, 'receiver candidate builder');
  assertRecordIdentity(
    buildReport.toolchain?.stationVisualFamily,
    identities.stationVisualFamily,
    'receiver candidate station visual-family helper',
  );
  assertRecordIdentity(
    baseline.candidateToolchain.stationVisualFamily,
    identities.stationVisualFamily,
    'frozen station visual-family helper',
  );
  if (build.canonicalBlend !== asset.paths.canonicalBlend
      || build.canonicalBlendSha256?.toLowerCase() !== baselineTarget.blend.sha256
      || build.candidateBlend !== asset.paths.candidateBlend
      || build.sourceCandidate !== asset.paths.sourceCandidate
      || build.releaseCandidate !== asset.paths.releaseCandidate) {
    throw new Error(`${asset.id} build-report producer or path lineage drifted`);
  }
  assertRecordIdentity({
    path: build.candidateBlend,
    sha256: build.candidateBlendSha256,
    bytes: build.bytes?.candidateBlend,
  }, identities.candidateBlend, `${asset.id} candidate Blend`);
  assertRecordIdentity({
    path: build.sourceCandidate,
    sha256: build.sourceCandidateSha256,
    bytes: build.bytes?.source,
  }, identities.sourceCandidate, `${asset.id} source candidate`);
  assertRecordIdentity({
    path: build.releaseCandidate,
    sha256: build.releaseCandidateSha256,
    bytes: build.bytes?.release,
  }, identities.releaseCandidate, `${asset.id} release candidate`);
  if (!identities.sourceCandidate.contents.equals(identities.releaseCandidate.contents)) {
    throw new Error(`${asset.id} source and release candidates must be byte-identical before release build`);
  }
  if (!jsonEqual([...(build.materials || [])].sort(), [...MATERIALS].sort())
      || build.frozenContract?.verifiedUnchanged !== true
      || build.frozenContract?.root !== asset.rootNode
      || build.frozenContract?.collision !== 'COLLISION_HULL'
      || !jsonEqual([...(build.frozenContract?.sockets || [])].sort(), Object.keys(asset.sockets).sort())) {
    throw new Error(`${asset.id} build report lost the frozen root/socket/collision/material contract`);
  }
  validateReceiverFacilityCandidateStructure(
    identities.sourceCandidate.contents,
    asset,
    build,
    baselineTarget,
  );
  if (binding.schema !== RECEIVER_FACILITY_PROMOTION_CONTRACT.validationBindingSchema
      || binding.dispatchUnit !== DISPATCH_UNIT || binding.assetId !== asset.id
      || binding.candidateId !== CANDIDATE_ID || binding.status !== 'pass') {
    throw new Error(`${asset.id} validator binding identity drifted`);
  }
  assertRecordIdentity(binding.buildReport, identities.buildReport, `${asset.id} validation build report`);
  assertRecordIdentity(binding.candidate, identities.sourceCandidate, `${asset.id} validation candidate`);
  assertRecordIdentity(binding.validators?.foundry, identities.foundryReport, `${asset.id} Foundry report`);
  assertRecordIdentity(binding.validators?.khronos, identities.khronosReport, `${asset.id} Khronos report`);
  validateFoundry(foundry, asset);
  validateKhronos(khronos, asset);
  if (renderReport.schema !== RECEIVER_FACILITY_PROMOTION_CONTRACT.renderSchema
      || renderReport.dispatchUnit !== DISPATCH_UNIT || renderReport.candidateId !== CANDIDATE_ID
      || renderReport.renderer !== RENDERER
      || renderReport.rendererSha256?.toLowerCase() !== identities.renderer.sha256
      || !jsonEqual(renderReport.targetOrder, targetIds)
      || !jsonEqual(Object.keys(renderReport.targets || {}), targetIds)
      || !jsonEqual(renderReport.resolution, { width: 1920, height: 1080 })
      || renderReport.renderEngine !== 'BLENDER_EEVEE'
      || renderReport.imageCount !== 80 || renderReport.exactAllowlistComplete !== true
      || !jsonEqual(renderReport.runtimeEquivalentAuthority?.viewport, { width: 1440, height: 900 })
      || renderReport.runtimeEquivalentAuthority?.subjectRadius !== 24
      || renderReport.runtimeEquivalentAuthority?.fovDeg !== 50
      || renderReport.runtimeEquivalentAuthority?.distanceScale !== 0.72
      || !jsonEqual(renderReport.runtimeEquivalentAuthority?.outputResolution, { width: 1920, height: 1080 })
      || (renderReport.runtimeEquivalentAuthority?.framings || []).some(
        ({ projectedRadiusFraction }) => !Number.isFinite(projectedRadiusFraction) || projectedRadiusFraction <= 0,
      )
      || !jsonEqual((renderReport.runtimeEquivalentAuthority?.framings || []).map(
        ({ name, zoom, zoomRadii }) => ({ name, zoom, zoomRadii }),
      ), [
        { name: 'close', zoom: 72, zoomRadii: 3 },
        { name: 'default', zoom: 132, zoomRadii: 5.5 },
        { name: 'far', zoom: 264, zoomRadii: 11 },
      ])) {
    throw new Error(`${asset.id} shared render report lost its exact source-review authority`);
  }
  assertRecordIdentity(renderReport.buildReport, identities.buildReport, 'rendered build report');
  assertRecordIdentity(renderReport.baselineManifest, baselineIdentity, 'rendered baseline manifest');
  const renderTarget = renderReport.targets[asset.id];
  if (!jsonEqual(renderTarget?.expectedBounds, baselineTarget.aabb)
      || renderTarget?.runtimeScale !== (asset.key === 'base'
        ? baseline.runtimeContract.lawfulCatcher.visualScale
        : baseline.runtimeContract.fenceReceiver.visualScale)) {
    throw new Error(`${asset.id} render report target bounds/runtime scale are incomplete`);
  }
  assertRecordIdentity(renderTarget.epochs?.baseline?.source, baselineTarget.packetSource,
    `${asset.id} baseline render source`);
  assertRecordIdentity(renderTarget.epochs?.candidate?.source, identities.sourceCandidate,
    `${asset.id} candidate render source`);
  const expectedPaths = expectedEvidencePaths(asset);
  const renderEvidenceRecords = ['baseline', 'candidate'].flatMap(
    (epoch) => renderTarget.epochs?.[epoch]?.images || [],
  );
  const renderEvidence = exactIdentityListAtRoot(
    rootDir,
    renderEvidenceRecords,
    expectedPaths,
    `${asset.id} render report evidence`,
  );
  for (const epoch of ['baseline', 'candidate']) {
    const epochRecord = renderTarget.epochs[epoch];
    const images = epochRecord.images;
    if (images.length !== VIEWS.length
        || !jsonEqual(images.map(({ name }) => `${name}.png`), VIEWS)
        || !jsonEqual(epochRecord.bounds, baselineTarget.aabb)
        || images.some((record, index) => (
          record.width !== 1920 || record.height !== 1080
          || !jsonEqual({
            name: record.name,
            look: record.look,
            view: record.view,
            lod: record.lod,
            runtimeZoom: record.runtimeZoom,
          }, expectedImageContract(VIEWS[index]))
          || !numberVector(record.camera?.position) || !numberVector(record.camera?.target)
        ))) {
      throw new Error(`${asset.id} ${epoch} render epoch must contain the exact twenty diagnostics`);
    }
    const cameras = epochRecord.runtimeCameras;
    const framings = renderReport.runtimeEquivalentAuthority.framings;
    if (!Array.isArray(cameras) || cameras.length !== 3
        || cameras.some((camera, index) => (
          camera.name !== framings[index].name || camera.zoom !== framings[index].zoom
          || camera.fovDeg !== 50 || camera.runtimeScale !== renderTarget.runtimeScale
          || camera.projectedRadiusFraction !== framings[index].projectedRadiusFraction
          || !Number.isFinite(camera.sourceDistance) || !Number.isFinite(camera.runtimeHalfVerticalWu)
          || !numberVector(camera.position) || !numberVector(camera.target)
        ))) {
      throw new Error(`${asset.id} ${epoch} runtime-equivalent cameras are not hash-bound to the authority`);
    }
  }
  if (review.schema !== RECEIVER_FACILITY_PROMOTION_CONTRACT.visualReviewSchema
      || review.dispatchUnit !== DISPATCH_UNIT || review.assetId !== asset.id
      || review.candidateId !== CANDIDATE_ID || review.scope !== 'whole_asset'
      || review.exactFinalVisualBinding !== true
      || review.reviewedCandidateEvidenceSufficient !== true
      || review.implementationDisposition !== 'integration_candidate'
      || (review.openP0P1Defects || []).length !== 0
      || ['G1', 'G2', 'G4'].some((gate) => review.verdict?.[gate] !== 'KEEP')) {
    throw new Error(`${asset.id} exact-final whole-asset visual KEEP is incomplete`);
  }
  assertRecordIdentity(review.buildReport, identities.buildReport, `${asset.id} reviewed build report`);
  assertRecordIdentity(review.renderReport, identities.renderReport, `${asset.id} reviewed render report`);
  assertRecordIdentity(review.validationBinding, identities.validationBinding, `${asset.id} reviewed validation binding`);
  assertRecordIdentity(review.renderProvenance, identities.renderer, `${asset.id} render provenance`);
  for (const field of ['reviewedCandidate', 'technicalCandidate']) {
    const record = review[field];
    assertRecordIdentity(record?.blend, identities.candidateBlend, `${asset.id} ${field} Blend`);
    assertRecordIdentity(record?.source, identities.sourceCandidate, `${asset.id} ${field} source`);
    assertRecordIdentity(record?.releaseCandidate, identities.releaseCandidate, `${asset.id} ${field} release mirror`);
  }
  const evidence = exactIdentityListAtRoot(
    rootDir,
    review.evidence,
    expectedPaths,
    `${asset.id} visual-review evidence`,
  );
  return {
    asset,
    build,
    buildReport,
    renderReport,
    review,
    binding,
    foundry,
    khronos,
    identities,
    immutable: [...Object.values(identities), preflightIdentity, ...renderEvidence, ...evidence],
  };
}

function candidateMetadata(json, asset) {
  const scene = json.scenes?.[json.scene ?? 0];
  const root = (json.nodes || []).find(({ name }) => name === asset.rootNode);
  const encoded = root?.extras?.spacefaceAssetJson || scene?.extras?.spacefaceAssetJson;
  const metadata = json.asset?.extras?.spacefaceAsset
    || scene?.extras?.spacefaceAsset
    || root?.extras?.spacefaceAsset
    || (typeof encoded === 'string' ? JSON.parse(encoded) : null);
  if (!metadata || metadata.partId !== asset.id || metadata.assetId !== asset.liveAssetId
      || metadata.candidateId !== CANDIDATE_ID || metadata.wiringStatus !== 'isolated_candidate') {
    throw new Error(`${asset.id} candidate lifecycle metadata is not isolated and exact`);
  }
  return { metadata, scene, root };
}

function appendGeneratorStep(generator, step) {
  const values = String(generator || 'Khronos glTF Blender I/O')
    .split('|').map((value) => value.trim()).filter(Boolean);
  if (!values.includes(step)) values.push(step);
  return values.join(' | ');
}

export function promoteReceiverFacilitySourceBytes(candidateBytes, admission) {
  const { asset, build, identities } = admission;
  const candidateSha256 = identities.sourceCandidate.sha256;
  if (sha256(candidateBytes) !== candidateSha256) {
    throw new Error(`${asset.id} candidate bytes changed after admission`);
  }
  const parsed = parseGlbDocument(candidateBytes, `${asset.id} candidate`);
  const { metadata } = candidateMetadata(parsed.json, asset);
  const production = {
    ...metadata,
    state: 'integration_candidate',
    wiringStatus: 'production_source',
    acceptedCandidateId: CANDIDATE_ID,
    acceptedCandidateSha256: candidateSha256,
    sourceBlend: asset.paths.canonicalBlend,
    sourceBlendSha256: identities.candidateBlend.sha256,
    builder: BUILDER,
    promoter: PROMOTER,
    visualReview: asset.paths.visualReview,
    visualReviewSha256: identities.visualReview.sha256,
    claims: { candidateOnly: false, promoted: true, routeEvidence: false, performanceEvidence: false },
  };
  delete production.candidateId;
  const output = rewriteGlbJson(candidateBytes, (json) => {
    const scene = json.scenes?.[json.scene ?? 0];
    const root = (json.nodes || []).find(({ name }) => name === asset.rootNode);
    json.asset ??= { version: '2.0' };
    json.asset.generator = appendGeneratorStep(
      appendGeneratorStep(json.asset.generator, BUILDER),
      PROMOTER,
    );
    json.asset.extras = {
      ...(json.asset.extras || {}),
      assetId: asset.liveAssetId,
      partId: asset.id,
      category: 'places',
      priority: 'P0',
      triangleCount: build.lod.lod0.triangles,
      textureSize: Number(metadata.textureSize || 1024),
      boundsDimensionsM: [...build.bounds.size],
      spacefaceAsset: production,
    };
    scene.extras = {
      ...(scene.extras || {}),
      assetId: asset.liveAssetId,
      partId: asset.id,
      spacefaceAsset: production,
      spacefaceAssetJson: JSON.stringify(production),
    };
    root.extras = {
      ...(root.extras || {}),
      'spaceface.assetId': asset.liveAssetId,
      'spaceface.partId': asset.id,
      spacefaceAsset: production,
      spacefaceAssetJson: JSON.stringify(production),
      'spaceface.acceptedCandidateId': CANDIDATE_ID,
      'spaceface.acceptedCandidateSha256': candidateSha256,
      'spaceface.builder': BUILDER,
      'spaceface.promoter': PROMOTER,
    };
    delete root.extras['spaceface.candidateId'];
  });
  const promoted = parseGlbDocument(output, `${asset.id} promoted source`);
  if (nonJsonPayloadSha256(promoted) !== nonJsonPayloadSha256(parsed)) {
    throw new Error(`${asset.id} source promotion changed a non-JSON GLB chunk`);
  }
  const promotedMetadata = promoted.json.asset?.extras?.spacefaceAsset;
  if (promotedMetadata?.wiringStatus !== 'production_source'
      || promotedMetadata?.acceptedCandidateSha256 !== candidateSha256
      || promotedMetadata?.claims?.routeEvidence !== false) {
    throw new Error(`${asset.id} production-source lifecycle stamp is incomplete`);
  }
  return {
    asset,
    bytes: output,
    sha256: sha256(output),
    candidateSha256,
    nonJsonPayloadSha256: nonJsonPayloadSha256(promoted),
    metadata: promotedMetadata,
  };
}

export function buildReceiverFacilityPartsManifest(before, promotedById, admissionsById) {
  if (!Array.isArray(before?.parts)) throw new TypeError('parts manifest requires a parts array');
  const next = structuredClone(before);
  const owned = new Set(RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.map(({ id }) => id));
  if (!jsonEqual(Object.keys(promotedById || {}).sort(), [...owned].sort())
      || !jsonEqual(Object.keys(admissionsById || {}).sort(), [...owned].sort())) {
    throw new Error('parts-manifest promotion must contain exactly base and refinery');
  }
  for (const asset of RECEIVER_FACILITY_PROMOTION_CONTRACT.assets) {
    const matches = next.parts.filter(({ id }) => id === asset.id);
    if (matches.length !== 1) throw new Error(`parts manifest requires exactly one ${asset.id} row`);
    const row = matches[0];
    const promoted = promotedById[asset.id];
    const report = admissionsById[asset.id].build;
    if (row.category !== 'places' || row.file !== `places/${asset.id}.glb`
        || row.mount !== 'origin'
        || !jsonEqual([...(row.sockets || [])].sort(), Object.keys(asset.sockets).sort())) {
      throw new Error(`${asset.id} parts-manifest identity contract drifted`);
    }
    row.tris = report.lod.lod0.triangles;
    row.bytes = promoted.bytes.length;
    row.bounds = {
      min: [...report.bounds.min],
      max: [...report.bounds.max],
      dimensionsM: [...report.bounds.size],
    };
    row.note = `${report.title}; PQ-019 receiver-facility material-truth V1 integration candidate, PBR, `
      + `explicit LOD0/1/2 ${report.lod.lod0.triangles}/${report.lod.lod1.triangles}/`
      + `${report.lod.lod2.triangles} tris across five semantic draw groups. `
      + 'Release, render-package, Browser/Electron route, and performance evidence remain separate gates.';
  }
  const beforeOther = before.parts.filter(({ id }) => !owned.has(id));
  const nextOther = next.parts.filter(({ id }) => !owned.has(id));
  const beforeShell = structuredClone(before);
  const nextShell = structuredClone(next);
  beforeShell.parts = [];
  nextShell.parts = [];
  if (!jsonEqual(beforeOther, nextOther) || !jsonEqual(beforeShell, nextShell)) {
    throw new Error('parts-manifest promotion changed a non-target row or manifest shell');
  }
  return next;
}

export function buildReceiverFacilityEvidenceRow(before, admission, promoted) {
  const { asset, build, identities } = admission;
  const next = structuredClone(before);
  next.title = build.title;
  next.source = asset.paths.packetSource;
  next.blend = asset.paths.canonicalBlend;
  next.bytes = promoted.bytes.length;
  next.lod = structuredClone(build.lod);
  next.aabb = structuredClone(build.bounds);
  next.materials = [...MATERIALS];
  next.metadata = structuredClone(promoted.metadata);
  next.builtAt = build.builtAt;
  next.sha256 = promoted.sha256;
  next.canonical = asset.paths.canonicalSource;
  next.acceptedCandidate = {
    candidateId: CANDIDATE_ID,
    blend: publicIdentity(identities.candidateBlend),
    source: publicIdentity(identities.sourceCandidate),
    releaseCandidate: publicIdentity(identities.releaseCandidate),
    buildReport: publicIdentity(identities.buildReport),
    renderReport: publicIdentity(identities.renderReport),
    visualReview: publicIdentity(identities.visualReview),
    validationBinding: publicIdentity(identities.validationBinding),
    validators: {
      foundry: publicIdentity(identities.foundryReport),
      khronos: publicIdentity(identities.khronosReport),
    },
  };
  next.promotion = {
    stage: 'canonical_source_published',
    promoter: PROMOTER,
    releasePending: true,
    renderPackageRebuildPending: true,
    routeEvidence: false,
    performanceEvidence: false,
  };
  return next;
}

function publicIdentity(identity) {
  return { path: identity.path, sha256: identity.sha256, bytes: identity.bytes };
}

function stagedHashValidator(expectedHash, label, validate) {
  return async (_path, bytes) => {
    if (sha256(bytes) !== expectedHash) throw new Error(`${label} staged hash mismatch`);
    if (validate) await validate(Buffer.from(bytes));
  };
}

function dedupeGuards(identities, rootDir) {
  const byPath = new Map();
  for (const identity of identities) {
    const current = byPath.get(identity.path.toLowerCase());
    if (current && current.sha256 !== identity.sha256) {
      throw new Error(`immutable guard identity conflicts: ${identity.path}`);
    }
    byPath.set(identity.path.toLowerCase(), identity);
  }
  return [...byPath.values()].map((identity) => ({
    path: resolveUnder(rootDir, identity.path, 'immutable evidence guard'),
    expectedCurrentSha256: identity.sha256,
  }));
}

export function buildReceiverFacilityPublicationTransaction({
  rootDir = ROOT,
  baseline,
  baselineIdentity,
  admissionsById,
  promotedById,
  evidenceBytesById,
  partsManifestBytes,
  immutableGuards = [],
} = {}) {
  const files = [];
  for (const asset of RECEIVER_FACILITY_PROMOTION_CONTRACT.assets) {
    const target = baseline.targets[asset.id];
    const admission = admissionsById[asset.id];
    const promoted = promotedById[asset.id];
    const evidenceBytes = evidenceBytesById[asset.id];
    files.push({
      path: resolveUnder(rootDir, asset.paths.canonicalBlend),
      bytes: admission.identities.candidateBlend.contents,
      expectedCurrentSha256: target.blend.sha256,
      validate: stagedHashValidator(admission.identities.candidateBlend.sha256, `${asset.id} canonical Blend`),
    });
    for (const [label, path, expected] of [
      ['packet source', asset.paths.packetSource, target.packetSource],
      ['canonical source', asset.paths.canonicalSource, target.canonicalSource],
    ]) {
      files.push({
        path: resolveUnder(rootDir, path),
        bytes: promoted.bytes,
        expectedCurrentSha256: expected.sha256,
        validate: stagedHashValidator(promoted.sha256, `${asset.id} ${label}`, (bytes) => {
          const parsed = parseGlbDocument(bytes, `${asset.id} staged ${label}`);
          if (nonJsonPayloadSha256(parsed) !== promoted.nonJsonPayloadSha256
              || parsed.json.asset?.extras?.spacefaceAsset?.wiringStatus !== 'production_source') {
            throw new Error(`${asset.id} staged ${label} source contract drifted`);
          }
        }),
      });
    }
    files.push({
      path: resolveUnder(rootDir, asset.paths.legacyEvidence),
      bytes: evidenceBytes,
      expectedCurrentSha256: target.evidence.sha256,
      validate: stagedHashValidator(sha256(evidenceBytes), `${asset.id} evidence`, (bytes) => {
        const row = JSON.parse(bytes.toString('utf8'));
        if (row.sha256 !== promoted.sha256 || row.promotion?.stage !== 'canonical_source_published'
            || row.promotion?.releasePending !== true || row.promotion?.renderPackageRebuildPending !== true) {
          throw new Error(`${asset.id} staged evidence row is incomplete`);
        }
      }),
    });
  }
  files.push({
    path: resolveUnder(rootDir, RECEIVER_FACILITY_PROMOTION_CONTRACT.partsManifest),
    bytes: partsManifestBytes,
    expectedCurrentSha256: baseline.sharedFiles.partsManifest.sha256,
    validate: stagedHashValidator(sha256(partsManifestBytes), 'parts manifest', (bytes) => {
      const parsed = JSON.parse(bytes.toString('utf8'));
      for (const asset of RECEIVER_FACILITY_PROMOTION_CONTRACT.assets) {
        if ((parsed.parts || []).filter(({ id }) => id === asset.id).length !== 1) {
          throw new Error(`staged parts manifest lost exact ${asset.id} membership`);
        }
      }
    }),
  });
  const expected = RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.flatMap((asset) => [
    asset.paths.canonicalBlend,
    asset.paths.packetSource,
    asset.paths.canonicalSource,
    asset.paths.legacyEvidence,
  ]).concat(RECEIVER_FACILITY_PROMOTION_CONTRACT.partsManifest)
    .map((path) => resolveUnder(rootDir, path));
  if (files.length !== 9 || !jsonEqual(files.map(({ path }) => path), expected)
      || new Set(files.map(({ path }) => path.toLowerCase())).size !== 9) {
    throw new Error('receiver-facility promotion must publish exactly the fixed nine source files');
  }
  const forbidden = ['release_manifest', 'pilots.json', 'worldSiteAssetBindings', 'render-packages',
    'family_summary', 'place_claim_outpost_relay', 'place_claim_outpost_bastion',
    'build_claim_outpost_family', 'finalize_claim_outpost_family'];
  if (files.some(({ path }) => forbidden.some((token) => path.includes(token)))) {
    throw new Error('receiver-facility source transaction contains a forbidden downstream/sibling path');
  }
  const destinations = new Set(files.map(({ path }) => path.toLowerCase()));
  const guards = dedupeGuards([baselineIdentity, ...immutableGuards], rootDir).filter(
    ({ path }) => !destinations.has(path.toLowerCase()),
  );
  return { files, guards };
}

function baselineSnapshot(rootDir, baseline) {
  const targets = {};
  const immutable = [];
  for (const asset of RECEIVER_FACILITY_PROMOTION_CONTRACT.assets) {
    const row = baseline.targets[asset.id];
    targets[asset.id] = {
      blend: assertIdentityAtRoot(rootDir, row.blend, `${asset.id} canonical Blend baseline`),
      packetSource: assertIdentityAtRoot(rootDir, row.packetSource, `${asset.id} packet-source baseline`),
      canonicalSource: assertIdentityAtRoot(rootDir, row.canonicalSource, `${asset.id} canonical-source baseline`),
      evidence: assertIdentityAtRoot(rootDir, row.evidence, `${asset.id} evidence baseline`),
    };
    immutable.push(...Object.values(targets[asset.id]));
  }
  const shared = Object.fromEntries(Object.keys(SHARED_FILE_PATHS).map((key) => [
    key,
    assertIdentityAtRoot(rootDir, baseline.sharedFiles[key], `baseline shared ${key}`),
  ]));
  immutable.push(...Object.values(shared));
  for (const [sibling, fields] of Object.entries(SIBLING_PATHS)) {
    for (const key of Object.keys(fields)) {
      immutable.push(assertIdentityAtRoot(
        rootDir,
        baseline.protectedSiblings[sibling][key],
        `${sibling} ${key}`,
      ));
    }
  }
  for (const key of ['builder', 'finalizer']) {
    immutable.push(assertIdentityAtRoot(
      rootDir,
      baseline.genericFamilyTools.identities[key],
      `generic family ${key}`,
    ));
  }
  immutable.push(assertIdentityAtRoot(
    rootDir,
    baseline.candidateToolchain.stationVisualFamily,
    'candidate station visual-family helper',
  ));
  immutable.push(assertIdentityAtRoot(rootDir, baseline.runtimeContract.source, 'receiver runtime source'));
  return {
    targets,
    partsManifest: shared.partsManifest,
    immutable,
  };
}

function assertPackageClosureOnDisk(rootDir, baseline) {
  const packageRoot = resolveUnder(rootDir, 'assets/ships/release/render-packages');
  const paths = readdirSync(packageRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  ).filter((entry) => {
    try {
      readFileSync(resolve(packageRoot, entry.name, 'render-package.json'));
      return true;
    } catch {
      return false;
    }
  }).map((entry) => `assets/ships/release/render-packages/${entry.name}/render-package.json`)
    .sort();
  const serialized = paths.join('\n');
  if (paths.length !== baseline.renderPackageClosure.trackedPackageJsonCount
      || sha256(Buffer.from(serialized, 'utf8')).toLowerCase()
        !== baseline.renderPackageClosure.trackedPackageJsonPathListSha256.toLowerCase()) {
    throw new Error(`render-package closure changed: expected the exact frozen 81-path list, got ${paths.length}`);
  }
  return paths;
}

export function buildReceiverFacilityPromotionPlan({ rootDir = ROOT } = {}) {
  const baselineIdentity = identityAtRoot(
    rootDir,
    RECEIVER_FACILITY_PROMOTION_CONTRACT.baselineManifest,
  );
  const baseline = validateReceiverFacilityBaselineManifest(
    JSON.parse(baselineIdentity.contents.toString('utf8')),
  );
  const baselineState = baselineSnapshot(rootDir, baseline);
  const packagePaths = assertPackageClosureOnDisk(rootDir, baseline);
  const partsBeforeIdentity = identityAtRoot(rootDir, RECEIVER_FACILITY_PROMOTION_CONTRACT.partsManifest);
  const partsBefore = JSON.parse(partsBeforeIdentity.contents.toString('utf8'));
  const admissionsById = {};
  const promotedById = {};
  const evidenceBytesById = {};
  const immutable = [baselineIdentity, ...baselineState.immutable];
  for (const asset of RECEIVER_FACILITY_PROMOTION_CONTRACT.assets) {
    const admission = admitReceiverFacilityCandidate({
      rootDir,
      asset,
      baseline,
      baselineTarget: baseline.targets[asset.id],
      baselineIdentity,
    });
    const promoted = promoteReceiverFacilitySourceBytes(
      admission.identities.sourceCandidate.contents,
      admission,
    );
    const evidenceBefore = JSON.parse(readFileSync(
      resolveUnder(rootDir, asset.paths.legacyEvidence),
      'utf8',
    ));
    admissionsById[asset.id] = admission;
    promotedById[asset.id] = promoted;
    evidenceBytesById[asset.id] = jsonBytes(
      buildReceiverFacilityEvidenceRow(evidenceBefore, admission, promoted),
    );
    immutable.push(...admission.immutable);
  }
  const partsAfter = buildReceiverFacilityPartsManifest(partsBefore, promotedById, admissionsById);
  const partsManifestBytes = jsonBytes(partsAfter);
  const transaction = buildReceiverFacilityPublicationTransaction({
    rootDir,
    baseline,
    baselineIdentity,
    admissionsById,
    promotedById,
    evidenceBytesById,
    partsManifestBytes,
    immutableGuards: immutable,
  });
  return {
    schema: RECEIVER_FACILITY_PROMOTION_CONTRACT.schema,
    applied: false,
    dispatchUnit: DISPATCH_UNIT,
    candidateId: CANDIDATE_ID,
    targetIds: RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.map(({ id }) => id),
    baseline: publicIdentity(baselineIdentity),
    assets: Object.fromEntries(RECEIVER_FACILITY_PROMOTION_CONTRACT.assets.map((asset) => [
      asset.id,
      {
        candidate: publicIdentity(admissionsById[asset.id].identities.sourceCandidate),
        candidateBlend: publicIdentity(admissionsById[asset.id].identities.candidateBlend),
        promotedSource: {
          path: asset.paths.canonicalSource,
          sha256: promotedById[asset.id].sha256,
          bytes: promotedById[asset.id].bytes.length,
        },
      },
    ])),
    publicationPaths: transaction.files.map(({ path }) => relative(resolve(rootDir), path).replaceAll('\\', '/')),
    releasePending: true,
    renderPackageRebuildPending: true,
    renderPackageClosure: structuredClone(baseline.renderPackageClosure),
    guardedRenderPackagePaths: packagePaths,
    externalNextSteps: [...RECEIVER_FACILITY_PROMOTION_CONTRACT.externalNextSteps],
    transaction,
  };
}

export async function applyReceiverFacilityPromotion({ rootDir = ROOT, fileOps = {} } = {}) {
  const plan = buildReceiverFacilityPromotionPlan({ rootDir });
  await publishFileSetTransaction({ ...plan.transaction, fileOps });
  for (const descriptor of plan.transaction.files) {
    const current = readFileSync(descriptor.path);
    if (sha256(current) !== sha256(descriptor.bytes)) {
      throw new Error(`post-publication identity mismatch: ${descriptor.path}`);
    }
  }
  return { ...plan, applied: true, transaction: undefined };
}

function printablePlan(plan) {
  const { transaction: _transaction, ...printable } = plan;
  return printable;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.some((arg) => arg !== '--apply') || argv.filter((arg) => arg === '--apply').length > 1) {
    throw new Error('usage: node tools/art/promote_claim_outpost_receiver_facility_material_truth_v1.mjs [--apply]');
  }
  const apply = argv.includes('--apply');
  const result = apply
    ? await applyReceiverFacilityPromotion({ rootDir: ROOT })
    : buildReceiverFacilityPromotionPlan({ rootDir: ROOT });
  console.log(JSON.stringify(printablePlan(result), null, 2));
}

if (process.argv[1]
    && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error) => {
    console.error(`[pq019-receiver-facility-promotion] FAIL: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}
