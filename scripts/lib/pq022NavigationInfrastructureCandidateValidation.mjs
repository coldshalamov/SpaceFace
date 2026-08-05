import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Box3,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';

const LOD_LEVELS = Object.freeze(['LOD0', 'LOD1', 'LOD2']);
const SHARED_CLAIMS = Object.freeze({
  candidateOnly: true,
  promoted: false,
  routeEvidence: false,
  performanceEvidence: false,
});
const SHARED_PROCESS_CHAIN = Object.freeze([
  'blender-5.1-python',
  'glb-source-candidate',
  'exact-source-validation',
  'hash-binding',
]);

const BILLBOARD_COLLISION = Object.freeze({
  node: 'COLLISION_HULL',
  translation: Object.freeze([5.900000095367432, 0.32499998807907104, 0]),
  rotation: Object.freeze([0, 0, 0, 1]),
  scale: Object.freeze([1, 1, 1]),
  triangleCount: 0,
  localBounds: Object.freeze({
    min: Object.freeze([-0.9079999923706055, -1.3799999952316284, -1.0780000686645508]),
    max: Object.freeze([12.708000183105469, 1.3799999952316284, 1.7280001640319824]),
    size: Object.freeze([13.616000175476074, 2.759999990463257, 2.806000232696533]),
  }),
  runtimeBounds: Object.freeze({
    min: Object.freeze([-6.808000087738037, -1.4030001163482666, -1.3799999952316284]),
    max: Object.freeze([6.808000087738037, 1.4030001163482666, 1.3799999952316284]),
    size: Object.freeze([13.616000175476074, 2.806000232696533, 2.759999990463257]),
    center: Object.freeze([0, 0, 0]),
  }),
  coverage: Object.freeze({
    perAxis: Object.freeze([0.92, 0.9200000547190169, 0.9199999968210856]),
    min: 0.9199999968210856,
    mean: 0.9200000171800342,
  }),
  contractDigestSha256: 'f9602e2004fd84494e4ab55890a3b9f9eaed88982172311b393f4fe3c70d9dd2',
});

const BUOY_COLLISION = Object.freeze({
  node: 'COLLISION_HULL',
  translation: Object.freeze([0.08749997615814209, 2.6500000953674316, 0]),
  rotation: Object.freeze([0, 0, 0, 1]),
  scale: Object.freeze([1, 1, 1]),
  triangleCount: 0,
  localBounds: Object.freeze({
    min: Object.freeze([-1.281000018119812, -1.2879999876022339, -4.388000011444092]),
    max: Object.freeze([1.4559999704360962, 1.2879999876022339, 9.687999725341797]),
    size: Object.freeze([2.736999988555908, 2.5759999752044678, 14.075999736785889]),
  }),
  runtimeBounds: Object.freeze({
    min: Object.freeze([-1.368499994277954, -7.038000106811523, -1.2879999876022339]),
    max: Object.freeze([1.368499994277954, 7.038000106811523, 1.2879999876022339]),
    size: Object.freeze([2.736999988555908, 14.076000213623047, 2.5759999752044678]),
    center: Object.freeze([0, 0, 0]),
  }),
  coverage: Object.freeze({
    perAxis: Object.freeze([0.9200000256450245, 0.9200000024932662, 0.9200000068119595]),
    min: 0.9200000024932662,
    mean: 0.9200000116500834,
  }),
  contractDigestSha256: '0d0e0455be674c98915f10f8ec2e70eed67adf48e703e5bb363ddb3ec0fc972d',
});

const SHARED_ROOT = 'assets/ships/m5_navigation_infrastructure';
const REPORT_ROOT = `${SHARED_ROOT}/reports/material_truth_v2`;

function assetContract({
  key,
  partId,
  assetId,
  rootNode,
  candidateId,
  role,
  title,
  kind,
  materials,
  envelope,
  collision,
  baseline,
  renderNames,
}) {
  const partFile = `places/${partId}.glb`;
  return Object.freeze({
    key,
    partId,
    assetId,
    rootNode,
    candidateId,
    role,
    title,
    kind,
    unit: 'metre',
    partFile,
    materials: Object.freeze(materials),
    textureSize: 256,
    envelope: Object.freeze({
      min: Object.freeze(envelope.min),
      max: Object.freeze(envelope.max),
      size: Object.freeze(envelope.size),
      manifestSize: Object.freeze(envelope.size),
    }),
    collision,
    budgets: Object.freeze({
      candidateBytes: baseline?.sourceBytes || 4_486_260,
      lodTriangles: Object.freeze({ LOD0: 3000, LOD1: 1000, LOD2: 300 }),
    }),
    baseline: Object.freeze(baseline),
    paths: Object.freeze({
      candidate: `${SHARED_ROOT}/source_candidates/material_truth_v2/places/${partId}.glb`,
      releaseMirror: `${SHARED_ROOT}/release_candidates/material_truth_v2/places/${partId}.glb`,
      blender: `${SHARED_ROOT}/blender/source/material_truth_v2/${partId}.blend`,
      validatorReport: `${REPORT_ROOT}/source/${partId}.report.json`,
      liveSource: `assets/ships/parts/places/${partId}.glb`,
      liveRelease: `assets/ships/release/parts/places/${partId}.glb`,
      liveBlend: `assets/ships/parts/blender/${partId}_authored.blend`,
    }),
    renderViews: Object.freeze(renderNames.map((name) => (
      `${REPORT_ROOT}/renders/${partId}/${name}.png`
    ))),
    wiring: Object.freeze({
      partId,
      slot: 'place',
      rootNode,
      sockets: Object.freeze(['SOCKET_Structure_Core']),
    }),
  });
}

const ASSETS = Object.freeze([
  assetContract({
    key: 'billboard',
    partId: 'place_station_billboard',
    assetId: 'SF_PLACE_HELIOS_SUPPORT_DOCK_ARM',
    rootNode: 'SF_M4_HELIOS_DOCK_ARM_ROOT',
    candidateId: 'pq022-station-billboard-material-truth-v2',
    role: 'core_station_information_display',
    title: 'Core Station Information Display',
    kind: 'station_infrastructure',
    materials: [
      'Display_Frame_Coat',
      'Display_Screen_Glass',
      'Display_Service_Alloy',
      'Display_Backplate',
      'Display_Safety_Marking',
    ],
    envelope: {
      min: [-1.5, -1.2000000476837158, -1.5],
      max: [13.300000190734863, 1.850000023841858, 1.5],
      size: [14.800000190734863, 3.0500000715255737, 3],
    },
    collision: BILLBOARD_COLLISION,
    baseline: {
      sourceSha256: '557d5065d0435e3dc8128b4623135addf0b372d282ecb9f331e6a289b0d9ff7a',
      sourceBytes: 4486260,
      releaseSha256: '598b130176e2e1b4b0bf89ec57cec7993e411ca548b28ac858dd04473f2c3098',
      releaseBytes: 6658368,
      blendSha256: '1b4b97b6fdfc4b4a8cac9eeceaff3c45dff82edf6524f23dc905b0b2a62d9b3b',
      blendBytes: 253158,
      lodTriangles: Object.freeze({ LOD0: 976, LOD1: 413, LOD2: 180 }),
    },
    renderNames: [
      'front_three_quarter',
      'rear_three_quarter',
      'front_three_quarter_emissive_off',
      'material_id',
      'grazing_light',
      'lod1_26_5m',
      'lod2_far',
    ],
  }),
  assetContract({
    key: 'memorial',
    partId: 'place_memorial_array',
    assetId: 'SF_PLACE_MEMORIAL_ARRAY',
    rootNode: 'SF_PLACE_MEMORIAL_ARRAY_ROOT',
    candidateId: 'pq022-memorial-array-material-truth-v2',
    role: 'helios_candle_fleet_memorial',
    title: 'The Candle Fleet Memorial Array',
    kind: 'hero_landmark',
    materials: [
      'Memorial_Frame_Coat',
      'Memorial_Recovered_Hull',
      'Memorial_Candle_Optic',
      'Memorial_Service_Alloy',
      'Memorial_Inscribed_Bronze',
    ],
    envelope: {
      min: [-1.5, -1.2000000476837158, -1.5],
      max: [13.300000190734863, 1.850000023841858, 1.5],
      size: [14.800000190734863, 3.0500000715255737, 3],
    },
    collision: BILLBOARD_COLLISION,
    baseline: {
      sourceSha256: null,
      sourceBytes: null,
      releaseSha256: null,
      releaseBytes: null,
      blendSha256: null,
      blendBytes: null,
      predecessorSourceSha256: '557d5065d0435e3dc8128b4623135addf0b372d282ecb9f331e6a289b0d9ff7a',
      predecessorLodTriangles: Object.freeze({ LOD0: 976, LOD1: 413, LOD2: 180 }),
    },
    renderNames: [
      'face_count',
      'front_three_quarter',
      'rear_service_three_quarter',
      'end_load_path',
      'top',
      'front_three_quarter_emissive_off',
      'material_id',
      'grazing_light',
      'lod1_26_5m',
      'lod2_far',
    ],
  }),
  assetContract({
    key: 'buoy',
    partId: 'place_nav_buoy',
    assetId: 'SF_PLACE_HELIOS_NAV_SPIRE',
    rootNode: 'SF_M4_HELIOS_NAV_SPIRE_ROOT',
    candidateId: 'pq022-nav-buoy-material-truth-v2',
    role: 'faction_neutral_navigation_buoy',
    title: 'Standard Navigation Buoy',
    kind: 'navigation_infrastructure',
    materials: [
      'Buoy_Pressure_Shell',
      'Buoy_Stabilizer_Frame',
      'Buoy_Nav_Optic',
      'Buoy_Solar_Cell',
      'Buoy_Service_Marking',
    ],
    envelope: {
      min: [-1.399999976158142, -5, -1.399999976158142],
      max: [1.5749999284744263, 10.300000190734863, 1.399999976158142],
      size: [2.9749999046325684, 15.300000190734863, 2.799999952316284],
    },
    collision: BUOY_COLLISION,
    baseline: {
      sourceSha256: 'f1599e2f5ff47aca1bff2ff311f111bee9ce3ae076123b36eb71e32343ab7b4d',
      sourceBytes: 3775832,
      releaseSha256: 'c227ec86343f3105d312c4127daf4e2516ca45ac4a26e7fb27368ae308a02c20',
      releaseBytes: 5570068,
      blendSha256: 'd82ad8797f93194d17420ef5f0dd22202d3c621f10186a057e92da53a5e6782b',
      blendBytes: 595607,
      lodTriangles: Object.freeze({ LOD0: 1284, LOD1: 520, LOD2: 222 }),
    },
    renderNames: [
      'full_three_quarter',
      'service_side',
      'top_head',
      'head_azimuth_contact_sheet',
      'stabilization_close',
      'full_three_quarter_emissive_off',
      'material_id',
      'grazing_light',
      'lod1_27_2m',
      'lod2_far',
    ],
  }),
]);

export const PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT = Object.freeze({
  schema: 'spaceface.pq022NavigationInfrastructureCandidateBinding.v1',
  reportSchema: 'spaceface.pq022NavigationInfrastructureCandidateValidation.v1',
  buildReportSchema: 'spaceface.pq022NavigationInfrastructureBuildReport.v1',
  validatorReportSchema: 'spaceface.navigationInfrastructureExactSourceReport.v1',
  renderManifestSchema: 'spaceface.navigationInfrastructureExactSourceRenderManifest.v1',
  promotionReviewSchema: 'spaceface.pq022NavigationInfrastructurePromotionReview.v1',
  packet: 'PQ-022',
  dispatchUnit: 'PQ-022.billboard-buoy-reauthor',
  candidateSetId: 'pq022-navigation-infrastructure-material-truth-v2',
  candidateState: 'candidate_only',
  claims: SHARED_CLAIMS,
  processChain: SHARED_PROCESS_CHAIN,
  assets: ASSETS,
  paths: Object.freeze({
    binding: `${REPORT_ROOT}/validation_binding.json`,
    buildReport: `${REPORT_ROOT}/build_report.json`,
    renderManifest: `${REPORT_ROOT}/render_manifest.json`,
    promotionReview: `${REPORT_ROOT}/promotion_review.json`,
    materialTruthPreflight: `${REPORT_ROOT}/MATERIAL_TRUTH_PREFLIGHT.md`,
    visualReview: `${REPORT_ROOT}/VISUAL_REVIEW.md`,
    sourceGenerator: 'tools/blender/build_navigation_infrastructure_material_truth_v2.py',
    partsManifest: 'assets/ships/parts/parts_manifest.json',
    releaseManifest: 'assets/ships/release/release_manifest.json',
  }),
  baselineManifests: Object.freeze({
    partsSha256: '8bc37fce5ae05eb7c9315ad5d19066d3c13fe1904115dde82292a71d1593149a',
    partsBytes: 116185,
    releaseSha256: '26ce452ff40b673bc2b7fd6c8cd5f56d3653f70730dd2f835b18598cbf23bbcc',
    releaseBytes: 52392,
  }),
});

const COMPONENT = Object.freeze({
  5120: Object.freeze({ bytes: 1, read: 'readInt8' }),
  5121: Object.freeze({ bytes: 1, read: 'readUInt8' }),
  5122: Object.freeze({ bytes: 2, read: 'readInt16LE' }),
  5123: Object.freeze({ bytes: 2, read: 'readUInt16LE' }),
  5125: Object.freeze({ bytes: 4, read: 'readUInt32LE' }),
  5126: Object.freeze({ bytes: 4, read: 'readFloatLE' }),
});
const COMPONENTS = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 });

function absolute(rootDir, file) {
  return path.resolve(rootDir, file);
}

function sha256(bytes) {
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

function vectorNear(actual, expected, epsilon = 1e-5) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => Math.abs(Number(value) - expected[index]) <= epsilon);
}

function publicIdentity(identity) {
  return identity ? { path: identity.path, sha256: identity.sha256, bytes: identity.bytes } : null;
}

function issue(failures, code, detail, assetId = null) {
  failures.push({ code, detail, ...(assetId ? { assetId } : {}) });
}

function indexOrderedAssetRows(value, { failures, code, label }) {
  const expectedIds = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT.assets.map((asset) => asset.partId);
  const rows = Array.isArray(value) ? value : [];
  const actualIds = rows.map((row) => row?.partId);
  const uniqueIds = new Set(actualIds);
  if (!Array.isArray(value)
      || !jsonEqual(actualIds, expectedIds)
      || uniqueIds.size !== expectedIds.length) {
    issue(failures, code, `${label} must be an exact ordered three-row array without duplicate partIds`);
  }
  return Object.fromEntries(rows
    .filter((row) => row && typeof row.partId === 'string')
    .map((row) => [row.partId, row]));
}

export function fileIdentity(rootDir, file) {
  const contents = readFileSync(absolute(rootDir, file));
  return { path: file, sha256: sha256(contents), bytes: contents.length, contents };
}

export function readNavigationInfrastructureGlb(file, { rootDir = process.cwd() } = {}) {
  const identity = fileIdentity(rootDir, file);
  const bytes = identity.contents;
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${file}: invalid GLB magic or truncated two-chunk payload`);
  }
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error(`${file}: invalid GLB v2 length`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  if (jsonLength === 0 || jsonLength % 4 !== 0
      || bytes.readUInt32LE(16) !== 0x4e4f534a
      || jsonEnd + 8 > bytes.length) {
    throw new Error(`${file}: expected one aligned JSON chunk followed by BIN`);
  }
  const binaryLength = bytes.readUInt32LE(jsonEnd);
  const binaryStart = jsonEnd + 8;
  const binaryEnd = binaryStart + binaryLength;
  if (binaryLength === 0 || binaryLength % 4 !== 0
      || bytes.readUInt32LE(jsonEnd + 4) !== 0x004e4942
      || binaryEnd !== bytes.length) {
    throw new Error(`${file}: expected one aligned terminal BIN chunk with no trailing data`);
  }
  const json = JSON.parse(bytes.subarray(20, jsonEnd).toString('utf8').trim());
  return {
    ...identity,
    json,
    binary: bytes.subarray(binaryStart, binaryEnd),
    binarySuffix: bytes.subarray(jsonEnd),
  };
}

export function accessorValues(glb, accessorIndex) {
  const accessor = glb.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`missing accessor ${accessorIndex}`);
  if (accessor.sparse != null) throw new Error(`accessor ${accessorIndex}: sparse accessors are unsupported`);
  const component = COMPONENT[accessor.componentType];
  const components = COMPONENTS[accessor.type];
  if (!component || !components) throw new Error(`accessor ${accessorIndex}: unsupported representation`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view || (view.buffer ?? 0) !== 0) throw new Error(`accessor ${accessorIndex}: invalid embedded bufferView`);
  if (view.extensions?.EXT_meshopt_compression) {
    throw new Error(`accessor ${accessorIndex}: source candidate must precede Meshopt compression`);
  }
  const packedStride = component.bytes * components;
  const stride = view.byteStride ?? packedStride;
  const start = Number(view.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  const end = start + Math.max(0, accessor.count - 1) * stride + packedStride;
  if (start < 0 || end > glb.binary.length) throw new Error(`accessor ${accessorIndex}: exceeds BIN chunk`);
  return Array.from({ length: accessor.count }, (_unused, index) => {
    const row = Array.from({ length: components }, (_axisUnused, axis) => (
      glb.binary[component.read](start + index * stride + axis * component.bytes)
    ));
    return components === 1 ? row[0] : row;
  });
}

function localMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3().fromArray(node.translation || [0, 0, 0]),
    new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale || [1, 1, 1]),
  );
}

function defaultSceneGraph(json) {
  const matrices = new Map();
  const visits = new Map();
  const cycles = [];
  const invalidChildren = [];
  const active = new Set();
  const visit = (index, parent) => {
    if (!Number.isInteger(index) || !json.nodes?.[index]) {
      invalidChildren.push(index);
      return;
    }
    visits.set(index, (visits.get(index) || 0) + 1);
    if (active.has(index)) {
      cycles.push(index);
      return;
    }
    if (visits.get(index) > 1) return;
    active.add(index);
    const matrix = parent.clone().multiply(localMatrix(json.nodes[index]));
    matrices.set(index, matrix);
    for (const child of json.nodes[index].children || []) visit(child, matrix);
    active.delete(index);
  };
  for (const root of json.scenes?.[json.scene ?? 0]?.nodes || []) visit(root, new Matrix4());
  return { matrices, visits, cycles, invalidChildren };
}

function primitiveTriangles(json, primitive) {
  if ((primitive.mode ?? 4) !== 4) return 0;
  const count = json.accessors?.[primitive.indices]?.count
    ?? json.accessors?.[primitive.attributes?.POSITION]?.count
    ?? 0;
  return Math.floor(count / 3);
}

function stableNumber(value) {
  return Number(Number(value).toFixed(6));
}

function geometryHash(glb, nodeIndex, primitive, matrices) {
  const positions = accessorValues(glb, primitive.attributes.POSITION);
  const indices = primitive.indices == null
    ? Array.from({ length: positions.length }, (_unused, index) => index)
    : accessorValues(glb, primitive.indices);
  const matrix = matrices.get(nodeIndex);
  if (!matrix) throw new Error(`node ${nodeIndex} is unreachable from the default scene`);
  const transformed = positions.map((position) => (
    new Vector3().fromArray(position).applyMatrix4(matrix).toArray().map(stableNumber)
  ));
  const triangles = [];
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    triangles.push(indices.slice(offset, offset + 3)
      .map((index) => transformed[index].join(','))
      .sort()
      .join('|'));
  }
  triangles.sort();
  return sha256(Buffer.from(JSON.stringify(triangles)));
}

function lodEnvelope(glb, level, matrices) {
  const box = new Box3();
  for (const [nodeIndex, node] of (glb.json.nodes || []).entries()) {
    if (!node.name?.startsWith(`${level}_`) || node.mesh == null) continue;
    const matrix = matrices.get(nodeIndex);
    if (!matrix) throw new Error(`${node.name} is unreachable from the default scene`);
    for (const primitive of glb.json.meshes?.[node.mesh]?.primitives || []) {
      for (const position of accessorValues(glb, primitive.attributes?.POSITION)) {
        box.expandByPoint(new Vector3().fromArray(position).applyMatrix4(matrix));
      }
    }
  }
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: box.getSize(new Vector3()).toArray(),
  };
}

function collisionDescriptor(node, stamp) {
  return {
    node: 'COLLISION_HULL',
    translation: node?.translation ?? [0, 0, 0],
    rotation: node?.rotation ?? [0, 0, 0, 1],
    scale: node?.scale ?? [1, 1, 1],
    triangleCount: node?.mesh == null ? 0 : -1,
    localBounds: node?.extras?.spaceface?.bounds,
    runtimeBounds: stamp?.collision?.runtimeBounds ?? stamp?.collisionBounds,
    coverage: stamp?.collision?.coverageRatio ?? stamp?.collisionCoverageRatio,
  };
}

export function assessNavigationInfrastructureAssetGlb(glb, asset) {
  const contract = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
  const failures = [];
  const facts = {
    path: glb?.path,
    sha256: glb?.sha256,
    bytes: glb?.bytes,
    lodTriangles: {},
    lodGeometrySha256: {},
    materials: [],
    textureBindings: [],
    imageDimensions: [],
    textureSize: null,
    envelope: null,
    collision: null,
  };
  if (!asset || !contract.assets.includes(asset)) {
    issue(failures, 'asset-contract', 'assessment requires one exact navigation-infrastructure asset contract');
    return { pass: false, failures, facts };
  }
  if (!glb?.json || !Buffer.isBuffer(glb?.binary)) {
    issue(failures, 'candidate-glb', 'candidate GLB document and BIN payload are required', asset.partId);
    return { pass: false, failures, facts };
  }
  const json = glb.json;
  const stamp = json.asset?.extras?.spacefaceAsset;
  const scene = json.scenes?.[json.scene ?? 0];
  const rootEntry = (json.nodes || []).find((node) => node.name === asset.rootNode);
  const lifecycle = [stamp, scene?.extras?.spacefaceAsset, rootEntry?.extras?.spacefaceAsset];
  if (lifecycle.some((entry) => !entry) || lifecycle.some((entry) => !jsonEqual(entry, stamp))) {
    issue(failures, 'candidate-lifecycle-copies', 'asset, default-scene, and canonical-root lifecycle copies must be present and byte-semantically identical', asset.partId);
  }
  if (!jsonEqual(stamp?.claims, contract.claims) || stamp?.wiringStatus !== 'isolated_candidate') {
    issue(failures, 'candidate-lifecycle-boundary', 'candidate claims must remain isolated and unpromoted', asset.partId);
  }
  for (const [field, expected] of Object.entries({
    contractVersion: 1,
    candidateId: asset.candidateId,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    state: contract.candidateState,
    assetId: asset.assetId,
    partId: asset.partId,
    liveId: asset.partId,
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: asset.unit,
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    textureSize: asset.textureSize,
    role: asset.role,
    title: asset.title,
    kind: asset.kind,
    deliverableRole: 'production_multi_lod',
    sourceGenerator: contract.paths.sourceGenerator,
    triBudget: 3000,
  })) {
    if (stamp?.[field] !== expected) {
      issue(failures, 'asset-stamp', `${field}: expected ${expected}, got ${stamp?.[field]}`, asset.partId);
    }
  }
  const stampedMaterialNames = Object.keys(stamp?.materialRoles || {});
  if (!jsonEqual(stampedMaterialNames, asset.materials)
      || stampedMaterialNames.some((name) => typeof stamp.materialRoles[name] !== 'string'
        || stamp.materialRoles[name].length === 0)) {
    issue(failures, 'candidate-material-stamp', 'candidate stamp does not bind the exact ordered semantic material roles', asset.partId);
  }
  if (stamp?.collision?.representation !== 'non_mesh_helper'
      || stamp?.collision?.triangles !== 0
      || !vectorNear(stamp?.collision?.translation, asset.collision.translation)
      || !jsonEqual(stamp?.collision?.nodeBounds, asset.collision.localBounds)
      || !jsonEqual(stamp?.collision?.runtimeBounds, asset.collision.runtimeBounds)
      || !jsonEqual(stamp?.collision?.coverageRatio, asset.collision.coverage)) {
    issue(failures, 'candidate-interface-stamp', 'candidate stamp does not preserve the exact non-mesh collision metadata', asset.partId);
  }

  const sceneRoots = (scene?.nodes || []).map((index) => json.nodes?.[index]?.name);
  if (sceneRoots.length !== 1 || sceneRoots[0] !== asset.rootNode) {
    issue(failures, 'root', `expected sole scene root ${asset.rootNode}`, asset.partId);
  }
  const nodes = new Map((json.nodes || []).map((node, index) => [node.name, { node, index }]));
  const visibleNames = [];
  for (const level of LOD_LEVELS) {
    const groups = (json.nodes || []).filter((node) => node.name?.startsWith(`${level}_`) && node.mesh != null);
    visibleNames.push(...groups.map((node) => node.name));
  }
  const expectedCount = 3 + asset.materials.length * LOD_LEVELS.length;
  if (nodes.size !== (json.nodes || []).length
      || nodes.size !== expectedCount
      || visibleNames.length !== asset.materials.length * LOD_LEVELS.length
      || (json.nodes || []).some((node) => (
        ![asset.rootNode, asset.collision.node, 'SOCKET_Structure_Core'].includes(node.name)
        && !/^LOD[012]_/.test(node.name || '')
      ))) {
    issue(failures, 'node-set', `candidate must contain exactly root/collision/socket plus ${asset.materials.length} visible groups per LOD`, asset.partId);
  }
  const graph = defaultSceneGraph(json);
  if (graph.cycles.length || graph.invalidChildren.length) {
    issue(failures, 'scene-graph', 'default scene contains a cycle or invalid child reference', asset.partId);
  }
  for (const [name, entry] of nodes) {
    if ((graph.visits.get(entry.index) || 0) !== 1) {
      issue(failures, 'scene-reachability', `${name} must be reachable exactly once`, asset.partId);
    }
  }
  const root = nodes.get(asset.rootNode)?.node;
  if (!root
      || !vectorNear(root.translation ?? [0, 0, 0], [0, 0, 0])
      || !vectorNear(root.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1])
      || !vectorNear(root.scale ?? [1, 1, 1], [1, 1, 1])) {
    issue(failures, 'root-transform', 'canonical root must remain identity', asset.partId);
  }
  const socket = nodes.get('SOCKET_Structure_Core')?.node;
  if (!socket || socket.mesh != null
      || !vectorNear(socket.translation ?? [0, 0, 0], [0, 0, 0])
      || !vectorNear(socket.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1])
      || !vectorNear(socket.scale ?? [1, 1, 1], [1, 1, 1])
      || !vectorNear(socket.extras?.spaceface?.forward, [1, 0, 0])
      || socket.extras?.spaceface?.socket !== true) {
    issue(failures, 'socket-contract', 'SOCKET_Structure_Core must remain an identity +X marker', asset.partId);
  }

  const collision = nodes.get(asset.collision.node)?.node;
  facts.collision = collisionDescriptor(collision, stamp);
  const collisionDigest = sha256(Buffer.from(JSON.stringify(canonicalJson(facts.collision))));
  facts.collision.contractDigestSha256 = collisionDigest;
  if (!collision
      || collision.mesh != null
      || collision.extras?.spaceface?.collision !== true
      || collision.extras?.spaceface?.helper !== true
      || collision.extras?.spaceface?.nonRender !== true
      || collision.extras?.spaceface?.role !== 'collision'
      || !jsonEqual(collision.extras?.bounds, asset.collision.localBounds)
      || collision.extras?.sf_collision !== true
      || collision.extras?.sf_non_render !== true
      || collision.extras?.collision !== true
      || collision.extras?.nonRender !== true
      || collisionDigest !== asset.collision.contractDigestSha256) {
    issue(failures, 'collision-contract', 'COLLISION_HULL must remain the exact frozen non-mesh helper with zero triangles', asset.partId);
  }

  const materialNames = (json.materials || []).map((material) => material.name);
  facts.materials = materialNames;
  if (!jsonEqual([...materialNames].sort(), [...asset.materials].sort())
      || new Set(materialNames).size !== asset.materials.length) {
    issue(failures, 'materials', 'candidate material set differs from the exact five-role contract', asset.partId);
  }
  const boundTextures = new Set();
  const boundImages = new Set();
  for (const material of json.materials || []) {
    const pbr = material.pbrMetallicRoughness;
    const roles = [
      ['baseColorTexture', pbr?.baseColorTexture?.index],
      ['normalTexture', material.normalTexture?.index],
      ['ormTexture', pbr?.metallicRoughnessTexture?.index],
    ];
    if (pbr?.metallicRoughnessTexture?.index == null
        || material.occlusionTexture?.index !== pbr.metallicRoughnessTexture.index
        || roles.some(([, index]) => !Number.isInteger(index))
        || new Set(roles.map(([, index]) => index)).size !== 3) {
      issue(failures, 'pbr-texture-roles', `${material.name}: requires distinct base/normal/ORM with AO sharing ORM`, asset.partId);
    }
    for (const [role, textureIndex] of roles) {
      const texture = json.textures?.[textureIndex];
      if (!texture || !Number.isInteger(texture.source) || texture.extensions?.KHR_texture_basisu) {
        issue(failures, 'pbr-texture-source', `${material.name}/${role}: expected direct embedded PNG source`, asset.partId);
        continue;
      }
      boundTextures.add(textureIndex);
      boundImages.add(texture.source);
      facts.textureBindings.push({ material: material.name, role, textureIndex, imageIndex: texture.source });
    }
  }
  const expectedImageCount = asset.materials.length * 3;
  if ((json.textures || []).length !== expectedImageCount
      || (json.images || []).length !== expectedImageCount
      || boundTextures.size !== expectedImageCount
      || boundImages.size !== expectedImageCount) {
    issue(failures, 'pbr-role-coverage', `candidate requires exactly ${expectedImageCount} uniquely bound embedded texture/image roles`, asset.partId);
  }
  const imageViews = new Set();
  for (const [imageIndex, image] of (json.images || []).entries()) {
    if (image.uri != null || image.mimeType !== 'image/png' || !Number.isInteger(image.bufferView)) {
      issue(failures, 'embedded-png', `image ${imageIndex}: expected bufferView-backed image/png`, asset.partId);
      continue;
    }
    imageViews.add(image.bufferView);
    const view = json.bufferViews?.[image.bufferView];
    const start = Number(view?.byteOffset ?? 0);
    const length = Number(view?.byteLength ?? 0);
    if (!view || (view.buffer ?? 0) !== 0 || length < 24 || start < 0 || start + length > glb.binary.length) {
      issue(failures, 'embedded-png-buffer', `image ${imageIndex}: invalid PNG bufferView`, asset.partId);
      continue;
    }
    const png = glb.binary.subarray(start, start + length);
    if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || png.readUInt32BE(8) !== 13
        || png.subarray(12, 16).toString('ascii') !== 'IHDR') {
      issue(failures, 'embedded-png-ihdr', `image ${imageIndex}: invalid canonical PNG header`, asset.partId);
      continue;
    }
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    facts.imageDimensions.push({ imageIndex, width, height });
    if (width !== asset.textureSize || height !== asset.textureSize) {
      issue(failures, 'embedded-png-dimensions', `image ${imageIndex}: expected ${asset.textureSize}x${asset.textureSize}`, asset.partId);
    }
  }
  if (imageViews.size !== expectedImageCount || facts.imageDimensions.length !== expectedImageCount) {
    issue(failures, 'embedded-png-unique', 'every material role requires its own embedded PNG bufferView', asset.partId);
  } else {
    facts.textureSize = asset.textureSize;
  }

  for (const level of LOD_LEVELS) {
    const groups = (json.nodes || []).map((node, index) => ({ node, index }))
      .filter(({ node }) => node.name?.startsWith(`${level}_`) && node.mesh != null);
    const usedMaterials = [];
    const geometryRecords = [];
    let triangles = 0;
    if (groups.length !== asset.materials.length) {
      issue(failures, 'lod-groups', `${level}: expected ${asset.materials.length} visible groups`, asset.partId);
    }
    for (const { node, index } of groups) {
      const primitives = json.meshes?.[node.mesh]?.primitives || [];
      if (primitives.length !== 1) issue(failures, 'draw-group', `${node.name}: expected one primitive`, asset.partId);
      for (const primitive of primitives) {
        if ((primitive.mode ?? 4) !== 4) issue(failures, 'primitive-mode', `${node.name}: expected TRIANGLES`, asset.partId);
        for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
          if (primitive.attributes?.[attribute] == null) {
            issue(failures, 'visible-attributes', `${node.name}: missing ${attribute}`, asset.partId);
          }
        }
        const material = json.materials?.[primitive.material]?.name;
        usedMaterials.push(material);
        triangles += primitiveTriangles(json, primitive);
        try {
          geometryRecords.push({ material, sha256: geometryHash(glb, index, primitive, graph.matrices) });
        } catch (error) {
          issue(failures, 'visible-geometry-read', `${node.name}: ${error.message}`, asset.partId);
        }
      }
    }
    facts.lodTriangles[level] = triangles;
    facts.lodGeometrySha256[level] = sha256(Buffer.from(JSON.stringify(
      geometryRecords.sort((left, right) => String(left.material).localeCompare(String(right.material))),
    )));
    if (!jsonEqual([...usedMaterials].sort(), [...asset.materials].sort())) {
      issue(failures, 'lod-material-coverage', `${level}: must use all five semantic materials exactly once`, asset.partId);
    }
    if (!Number.isInteger(triangles) || triangles <= 0 || triangles > asset.budgets.lodTriangles[level]) {
      issue(failures, 'triangle-budget', `${level}: ${triangles} is outside 1..${asset.budgets.lodTriangles[level]}`, asset.partId);
    }
  }
  if (!(facts.lodTriangles.LOD0 > facts.lodTriangles.LOD1
    && facts.lodTriangles.LOD1 > facts.lodTriangles.LOD2)
      || new Set(Object.values(facts.lodGeometrySha256)).size !== LOD_LEVELS.length) {
    issue(failures, 'lod-reduction', 'LOD0 > LOD1 > LOD2 must be three distinct real geometry levels', asset.partId);
  }
  const rejectedBaseline = asset.baseline.lodTriangles || asset.baseline.predecessorLodTriangles;
  if (jsonEqual(facts.lodTriangles, rejectedBaseline)) {
    issue(failures, 'lod-novelty', 'candidate still has the exact rejected/predecessor render-geometry totals', asset.partId);
  }
  if (glb.bytes > asset.budgets.candidateBytes) {
    issue(failures, 'byte-budget', `${glb.bytes} exceeds ${asset.budgets.candidateBytes}`, asset.partId);
  }
  try {
    facts.envelope = lodEnvelope(glb, 'LOD0', graph.matrices);
    if (!vectorNear(facts.envelope.min, asset.envelope.min)
        || !vectorNear(facts.envelope.max, asset.envelope.max)
        || !vectorNear(facts.envelope.size, asset.envelope.size)) {
      issue(failures, 'envelope', 'LOD0 min/max/size drifted from the frozen runtime envelope', asset.partId);
    }
  } catch (error) {
    issue(failures, 'envelope-read', error.message, asset.partId);
  }
  if (stamp?.triangleCount !== facts.lodTriangles.LOD0) {
    issue(failures, 'triangle-stamp', 'candidate triangleCount must equal measured LOD0 render triangles', asset.partId);
  }
  return { pass: failures.length === 0, failures, facts };
}

function identityOrMissing(rootDir, file) {
  return existsSync(absolute(rootDir, file)) ? fileIdentity(rootDir, file) : null;
}

function checkIdentity(failures, identity, expected, label) {
  if (expected.sha256 == null) {
    if (identity !== null) issue(failures, 'baseline-present', `${label} must remain absent before first promotion`);
    return;
  }
  if (!identity || identity.sha256 !== expected.sha256 || identity.bytes !== expected.bytes) {
    issue(failures, 'baseline-identity', `${label} changed from the pinned recovery baseline`);
  }
}

export function validateNavigationInfrastructureBaselineIdentity({ rootDir = process.cwd() } = {}) {
  const contract = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
  const failures = [];
  const facts = { assets: {}, partsManifest: null, releaseManifest: null };
  for (const asset of contract.assets) {
    const source = identityOrMissing(rootDir, asset.paths.liveSource);
    const release = identityOrMissing(rootDir, asset.paths.liveRelease);
    const blender = identityOrMissing(rootDir, asset.paths.liveBlend);
    checkIdentity(failures, source, {
      sha256: asset.baseline.sourceSha256, bytes: asset.baseline.sourceBytes,
    }, `${asset.partId} live source`);
    checkIdentity(failures, release, {
      sha256: asset.baseline.releaseSha256, bytes: asset.baseline.releaseBytes,
    }, `${asset.partId} live release`);
    checkIdentity(failures, blender, {
      sha256: asset.baseline.blendSha256, bytes: asset.baseline.blendBytes,
    }, `${asset.partId} live Blender source`);
    facts.assets[asset.key] = {
      source: publicIdentity(source),
      release: publicIdentity(release),
      blender: publicIdentity(blender),
    };
  }
  try {
    const parts = fileIdentity(rootDir, contract.paths.partsManifest);
    facts.partsManifest = publicIdentity(parts);
    if (parts.sha256 !== contract.baselineManifests.partsSha256
        || parts.bytes !== contract.baselineManifests.partsBytes) {
      issue(failures, 'baseline-manifest', 'parts manifest changed from the pinned recovery baseline');
    }
    const parsed = JSON.parse(parts.contents.toString('utf8'));
    for (const asset of contract.assets) {
      const count = (parsed.parts || []).filter((row) => row?.id === asset.partId).length;
      const expected = asset.baseline.sourceSha256 == null ? 0 : 1;
      if (count !== expected) issue(failures, 'baseline-membership', `parts manifest ${asset.partId}: expected ${expected} rows, got ${count}`);
      const runtimeCount = (parsed.runtimeSlots?.place || []).filter((file) => file === asset.partFile).length;
      if (runtimeCount !== expected) {
        issue(failures, 'baseline-runtime-slot', `runtimeSlots.place ${asset.partFile}: expected ${expected}, got ${runtimeCount}`);
      }
    }
  } catch (error) {
    issue(failures, 'parts-manifest-read', error.message);
  }
  try {
    const release = fileIdentity(rootDir, contract.paths.releaseManifest);
    facts.releaseManifest = publicIdentity(release);
    if (release.sha256 !== contract.baselineManifests.releaseSha256
        || release.bytes !== contract.baselineManifests.releaseBytes) {
      issue(failures, 'baseline-manifest', 'release manifest changed from the pinned recovery baseline');
    }
    const parsed = JSON.parse(release.contents.toString('utf8'));
    for (const asset of contract.assets) {
      const rows = (parsed.assets || []).filter((row) => row?.id === asset.partId);
      const expected = asset.baseline.sourceSha256 == null ? 0 : 1;
      if (rows.length !== expected) issue(failures, 'baseline-membership', `release manifest ${asset.partId}: expected ${expected} rows, got ${rows.length}`);
      if (expected === 1 && (rows[0]?.sourceSha256 !== asset.baseline.sourceSha256
          || rows[0]?.releaseSha256 !== asset.baseline.releaseSha256)) {
        issue(failures, 'baseline-release-row', `${asset.partId} release row does not bind the pinned live pair`);
      }
    }
  } catch (error) {
    issue(failures, 'release-manifest-read', error.message);
  }
  return { pass: failures.length === 0, failures, facts };
}

function validateBoundFile({
  rootDir,
  failures,
  label,
  expectedPath,
  record,
  hashKey = 'sha256',
  bytesKey = 'bytes',
}) {
  if (record?.path !== expectedPath) {
    issue(failures, 'binding-path', `${label}: expected ${expectedPath}, got ${record?.path}`);
    return null;
  }
  try {
    const identity = fileIdentity(rootDir, expectedPath);
    if (record?.[hashKey] !== identity.sha256) issue(failures, 'binding-hash', `${label}: recorded hash is stale`);
    if (bytesKey && record?.[bytesKey] !== identity.bytes) issue(failures, 'binding-bytes', `${label}: recorded byte count is stale`);
    return identity;
  } catch (error) {
    issue(failures, 'binding-read', `${label}: ${error.message}`);
    return null;
  }
}

export function assessNavigationInfrastructureBuildReport({
  report,
  assets,
  generator,
  renderManifest,
} = {}) {
  const contract = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
  const failures = [];
  for (const [field, expected] of Object.entries({
    schema: contract.buildReportSchema,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    candidateSetId: contract.candidateSetId,
    state: contract.candidateState,
  })) {
    if (report?.[field] !== expected) issue(failures, 'build-report-header', `${field}: expected ${expected}`);
  }
  if (!jsonEqual(report?.claims, contract.claims)
      || !jsonEqual(report?.builder, publicIdentity(generator))
      || !jsonEqual(report?.generator, publicIdentity(generator))
      || (renderManifest && !jsonEqual(report?.renderManifest, publicIdentity(renderManifest)))) {
    issue(failures, 'build-report-binding', 'build report must bind the exact generator and candidate-only claims');
  }
  const rows = indexOrderedAssetRows(report?.assets, {
    failures,
    code: 'build-report-set',
    label: 'build report assets',
  });
  const details = report?.assetDetails
      && typeof report.assetDetails === 'object'
      && !Array.isArray(report.assetDetails)
    ? report.assetDetails
    : {};
  if (!jsonEqual(Object.keys(details), contract.assets.map((asset) => asset.partId))) {
    issue(failures, 'build-report-detail-set', 'build report assetDetails must contain the exact three keyed detail records');
  }
  for (const asset of contract.assets) {
    const admitted = assets?.[asset.key];
    const summary = rows[asset.partId];
    const row = details[asset.partId];
    const reportedLods = {
      LOD0: row?.export?.lodTriangles?.lod0,
      LOD1: row?.export?.lodTriangles?.lod1,
      LOD2: row?.export?.lodTriangles?.lod2,
    };
    if (!summary
        || summary.partId !== asset.partId
        || summary.candidateId !== asset.candidateId
        || !jsonEqual(summary.candidate, admitted?.candidate)
        || !jsonEqual(summary.releaseMirror, admitted?.releaseMirror)
        || !jsonEqual(summary.blender, admitted?.blender)
        || !jsonEqual(summary.validatorReport, admitted?.validatorReport)
        || !jsonEqual(summary.lodTriangles, admitted?.glb?.lodTriangles)
        || summary.textureSize !== asset.textureSize
        || summary.collisionTriangleCount !== 0
        || !jsonEqual(summary.materials, asset.materials)
        || summary.pass !== true) {
      issue(failures, 'build-report-summary', `${asset.partId}: ordered build summary is stale or incomplete`, asset.partId);
    }
    if (!row
        || row.assetId !== asset.partId
        || row.spacefaceAssetId !== asset.assetId
        || row.candidateId !== asset.candidateId
        || !jsonEqual(row.candidate, admitted?.candidate)
        || !jsonEqual(row.releaseMirror, admitted?.releaseMirror)
        || !jsonEqual(row.blender, admitted?.blender)
        || !jsonEqual(row.sourceReport, admitted?.validatorReport)
        || !jsonEqual(reportedLods, admitted?.glb?.lodTriangles)
        || row.export?.collision?.representation !== 'non_mesh_helper'
        || row.export?.collision?.triangles !== 0
        || row.export?.collision?.geometrySha256 !== null
        || row.export?.materialCount !== asset.materials.length
        || row.export?.imageCount !== asset.materials.length * 3
        || row.export?.textureCount !== asset.materials.length * 3
        || !jsonEqual(row.materials, asset.materials)
        || !jsonEqual(row.render?.source, admitted?.candidate)
        || row.render?.sourceSha256 !== admitted?.candidate?.sha256
        || row.render?.exactSourceReimport !== true) {
      issue(failures, 'build-report-asset', `${asset.partId}: build report facts are stale or incomplete`);
    }
  }
  if (!Number.isSafeInteger(report?.buildAttempts)
      || report.buildAttempts < 1
      || report?.candidateAssetCount !== contract.assets.length
      || report?.canonicalAssetsModified !== false
      || report?.liveRuntimeWiringModified !== false
      || report?.browserOrElectronRun !== false
      || report?.performanceClaim !== false
      || report?.promotionAuthorized !== false
      || report?.pass !== true
      || !jsonEqual(report?.failures, [])) {
    issue(failures, 'build-report-outcome', 'build report must describe one bounded candidate-only build epoch with no live/route/performance claim');
  }
  return { pass: failures.length === 0, failures };
}

export function assessNavigationInfrastructureValidatorReport({
  report,
  asset,
  candidate,
  releaseMirror,
  blender,
  generator,
  glbFacts,
} = {}) {
  const contract = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
  const failures = [];
  for (const [field, expected] of Object.entries({
    schema: contract.validatorReportSchema,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    candidateId: asset?.candidateId,
    assetId: asset?.partId,
    spacefaceAssetId: asset?.assetId,
    state: contract.candidateState,
  })) {
    if (report?.[field] !== expected) issue(failures, 'validator-report-header', `${field}: expected ${expected}`, asset?.partId);
  }
  if (!jsonEqual(report?.claims, contract.claims)
      || !jsonEqual(report?.candidate, candidate)
      || !jsonEqual(report?.releaseMirror, releaseMirror)
      || !jsonEqual(report?.blender, blender)
      || !jsonEqual(report?.generator, generator)
      || report?.renders?.exactSourceReimport !== true) {
    issue(failures, 'validator-report-outcome', 'validator must pass cleanly against the exact candidate identity', asset?.partId);
  }
  const reportedLods = {
    LOD0: report?.export?.lodTriangles?.lod0,
    LOD1: report?.export?.lodTriangles?.lod1,
    LOD2: report?.export?.lodTriangles?.lod2,
  };
  const collision = report?.export?.collision;
  const envelope = report?.export?.gltfEnvelope;
  const textures = Array.isArray(report?.textures) ? report.textures : [];
  if (!jsonEqual(reportedLods, glbFacts?.lodTriangles)
      || !jsonEqual(report?.materials, asset?.materials)
      || textures.length !== asset?.materials?.length * 3
      || new Set(textures.map((entry) => `${entry?.material}:${entry?.map}`)).size !== textures.length
      || textures.some((entry) => !asset.materials.includes(entry?.material)
        || !['basecolor', 'normal', 'orm'].includes(entry?.map)
        || !jsonEqual(entry?.resolution, [asset.textureSize, asset.textureSize])
        || !/^[0-9a-f]{64}$/.test(entry?.sha256 || '')
        || !Number.isInteger(entry?.bytes) || entry.bytes <= 0)
      || collision?.representation !== 'non_mesh_helper'
      || collision?.triangles !== 0
      || collision?.geometrySha256 !== null
      || !vectorNear(collision?.translation, asset?.collision?.translation)
      || !jsonEqual(collision?.nodeBounds, asset?.collision?.localBounds)
      || !jsonEqual(collision?.runtimeBounds, asset?.collision?.runtimeBounds)
      || !jsonEqual(collision?.coverageRatio, asset?.collision?.coverage)
      || !vectorNear(envelope?.min, glbFacts?.envelope?.min)
      || !vectorNear(envelope?.max, glbFacts?.envelope?.max)
      || !vectorNear(envelope?.size, glbFacts?.envelope?.size)
      || report?.gateBoundary?.candidateSideG0 !== true
      || report?.gateBoundary?.candidateSideG1G2G4Evidence !== true
      || report?.gateBoundary?.g3DeterministicMaterialSources !== true
      || report?.gateBoundary?.g6RouteOrBrowserEvidence !== false
      || report?.gateBoundary?.promotionAuthorized !== false) {
    issue(failures, 'validator-report-facts', 'validator report does not repeat the independently measured structural facts', asset?.partId);
  }
  return { pass: failures.length === 0, failures };
}

function readPngDimensions(bytes, label) {
  const payload = Buffer.from(bytes || []);
  if (payload.length < 24
      || payload.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || payload.readUInt32BE(8) !== 13
      || payload.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`${label}: missing canonical PNG IHDR`);
  }
  return { width: payload.readUInt32BE(16), height: payload.readUInt32BE(20) };
}

export function assessNavigationInfrastructureRenderManifest({ manifest, assets } = {}) {
  const contract = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
  const failures = [];
  if (manifest?.schema !== contract.renderManifestSchema
      || manifest?.packet !== contract.packet
      || manifest?.dispatchUnit !== contract.dispatchUnit
      || manifest?.candidateSetId !== contract.candidateSetId
      || manifest?.oneBoundedBuildEpoch !== true
      || manifest?.exactSourceReimport !== true
      || manifest?.renderer !== 'BLENDER_EEVEE'
      || !jsonEqual(manifest?.resolution, [1600, 900])
      || !jsonEqual(manifest?.claims, contract.claims)) {
    issue(failures, 'render-manifest-header', 'render manifest header does not bind the exact-source 1600x900 epoch');
  }
  const rows = indexOrderedAssetRows(manifest?.assets, {
    failures,
    code: 'render-manifest-set',
    label: 'render manifest assets',
  });
  for (const asset of contract.assets) {
    const row = rows[asset.partId];
    const candidate = assets?.[asset.key]?.candidate;
    const images = Array.isArray(row?.images) ? row.images : [];
    const emissivePath = asset.renderViews.find((view) => view.includes('emissive_off'));
    if (!row
        || row.assetId !== asset.partId
        || row.partId !== asset.partId
        || row.spacefaceAssetId !== asset.assetId
        || row.candidateId !== asset.candidateId
        || !jsonEqual(row.source, candidate)
        || row.sourceSha256 !== candidate?.sha256
        || row.exactSourceReimport !== true
        || row.renderer !== 'BLENDER_EEVEE'
        || !jsonEqual(row.resolution, [1600, 900])
        || !jsonEqual(images.map((entry) => entry?.path), asset.renderViews)
        || !images.some((entry) => entry.path === emissivePath)
        || row.emissiveOffChangesEmissionStrengthOnly !== true
        || row.materialIdOverrideIsDiagnosticOnly !== true
        || row.grazingLightChangesLightingOnly !== true) {
      issue(failures, 'render-manifest-asset', `${asset.partId}: render epoch is incomplete or stale`, asset.partId);
    }
  }
  return { pass: failures.length === 0, failures };
}

export function assessNavigationInfrastructureBindingShape({ binding } = {}) {
  const contract = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
  const failures = [];
  for (const [field, expected] of Object.entries({
    schema: contract.schema,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    candidateSetId: contract.candidateSetId,
    state: contract.candidateState,
  })) {
    if (binding?.[field] !== expected) issue(failures, 'binding-header', `${field}: expected ${expected}`);
  }
  if (!jsonEqual(binding?.claims, contract.claims)) {
    issue(failures, 'binding-claims', 'binding must remain candidate-only with route/performance false');
  }
  const assets = indexOrderedAssetRows(binding?.assets, {
    failures,
    code: 'binding-asset-set',
    label: 'candidate binding assets',
  });
  for (const asset of contract.assets) {
    const record = assets[asset.partId];
    if (record?.partId !== asset.partId
        || record?.candidateId !== asset.candidateId
        || record?.spacefaceAssetId !== asset.assetId
        || record?.collisionRepresentation !== 'non_mesh_helper'
        || record?.collisionTriangles !== 0
        || record?.candidateMirrorByteIdentical !== true
        || !/^[0-9a-f]{64}$/.test(record?.visibleGeometrySha256 || '')) {
      issue(failures, 'binding-asset-header', `${asset.partId}: binding identity/geometry boundary is incomplete`, asset.partId);
    }
  }
  if (binding?.allCandidateMirrorsByteIdentical !== true
      || binding?.gateBoundary?.candidateEvidenceBound !== true
      || binding?.gateBoundary?.livePromotion !== false
      || binding?.gateBoundary?.routeAcceptance !== false
      || binding?.gateBoundary?.performanceAcceptance !== false
      || binding?.gateBoundary?.independentVisualAcceptance !== false) {
    issue(failures, 'binding-gate-boundary', 'binding must remain isolated evidence with no inherited live/route/performance/review claim');
  }
  return { pass: failures.length === 0, failures, assets };
}

export function validateNavigationInfrastructureCandidate({ rootDir = process.cwd(), bindingPath } = {}) {
  const contract = PQ022_NAVIGATION_INFRASTRUCTURE_CONTRACT;
  const selectedBinding = bindingPath || contract.paths.binding;
  const failures = [];
  const baseline = validateNavigationInfrastructureBaselineIdentity({ rootDir });
  failures.push(...baseline.failures);

  let binding;
  let bindingIdentity;
  try {
    bindingIdentity = fileIdentity(rootDir, selectedBinding);
    binding = JSON.parse(bindingIdentity.contents.toString('utf8'));
  } catch (error) {
    issue(failures, 'binding-read', `${selectedBinding}: ${error.message}`);
    return { schema: contract.reportSchema, pass: false, failures, facts: null };
  }
  const bindingAssessment = assessNavigationInfrastructureBindingShape({ binding });
  failures.push(...bindingAssessment.failures);
  const generatorIdentity = validateBoundFile({
    rootDir,
    failures,
    label: 'source generator',
    expectedPath: contract.paths.sourceGenerator,
    record: binding?.generator,
  });
  const preflightIdentity = validateBoundFile({
    rootDir,
    failures,
    label: 'material-truth preflight',
    expectedPath: contract.paths.materialTruthPreflight,
    record: binding?.preflight,
  });
  const assetBindings = bindingAssessment.assets;
  const assets = {};
  for (const asset of contract.assets) {
    const record = assetBindings[asset.partId];
    const candidate = validateBoundFile({
      rootDir, failures, label: `${asset.partId} candidate`, expectedPath: asset.paths.candidate, record: record?.candidate,
    });
    const releaseMirror = validateBoundFile({
      rootDir, failures, label: `${asset.partId} release mirror`, expectedPath: asset.paths.releaseMirror, record: record?.releaseMirror,
    });
    const blender = validateBoundFile({
      rootDir, failures, label: `${asset.partId} Blender source`, expectedPath: asset.paths.blender, record: record?.blender,
    });
    if (candidate && releaseMirror
        && (candidate.sha256 !== releaseMirror.sha256 || candidate.bytes !== releaseMirror.bytes)) {
      issue(failures, 'candidate-mirror', `${asset.partId}: source and mirror must be byte-identical`, asset.partId);
    }
    const rejectedSource = asset.baseline.sourceSha256 || asset.baseline.predecessorSourceSha256;
    if (candidate?.sha256 === rejectedSource) {
      issue(failures, 'candidate-novelty', `${asset.partId}: candidate still equals the rejected/predecessor live source`, asset.partId);
    }
    if (asset.baseline.blendSha256 && blender?.sha256 === asset.baseline.blendSha256) {
      issue(failures, 'blender-novelty', `${asset.partId}: Blender source still equals the rejected live authoring file`, asset.partId);
    }
    let glb = null;
    let glbAssessment = null;
    if (candidate) {
      try {
        glb = readNavigationInfrastructureGlb(asset.paths.candidate, { rootDir });
        if (glb.sha256 !== candidate.sha256 || glb.bytes !== candidate.bytes) {
          issue(failures, 'candidate-raced', `${asset.partId}: candidate changed during admission`, asset.partId);
        }
        glbAssessment = assessNavigationInfrastructureAssetGlb(glb, asset);
        failures.push(...glbAssessment.failures);
        if (!jsonEqual(record?.lodTriangles, {
          lod0: glbAssessment.facts.lodTriangles.LOD0,
          lod1: glbAssessment.facts.lodTriangles.LOD1,
          lod2: glbAssessment.facts.lodTriangles.LOD2,
        })) {
          issue(failures, 'binding-lod-facts', `${asset.partId}: binding LOD facts are stale`, asset.partId);
        }
        const stamp = glb.json.asset?.extras?.spacefaceAsset;
        if (!generatorIdentity
            || stamp?.sourceGeneratorSha256 !== generatorIdentity.sha256
            || stamp?.sourceGeneratorBytes !== generatorIdentity.bytes) {
          issue(failures, 'candidate-generator-binding', `${asset.partId}: candidate does not bind the admitted generator`, asset.partId);
        }
      } catch (error) {
        issue(failures, 'candidate-glb', `${asset.partId}: ${error.message}`, asset.partId);
      }
    }
    const validatorIdentity = validateBoundFile({
      rootDir,
      failures,
      label: `${asset.partId} exact-source validator report`,
      expectedPath: asset.paths.validatorReport,
      record: record?.validatorReport,
    });
    let validatorReport = null;
    if (validatorIdentity) {
      try {
        validatorReport = JSON.parse(validatorIdentity.contents.toString('utf8'));
        failures.push(...assessNavigationInfrastructureValidatorReport({
          report: validatorReport,
          asset,
          candidate: publicIdentity(candidate),
          releaseMirror: publicIdentity(releaseMirror),
          blender: publicIdentity(blender),
          generator: publicIdentity(generatorIdentity),
          glbFacts: glbAssessment?.facts,
        }).failures);
      } catch (error) {
        issue(failures, 'validator-report-json', `${asset.partId}: ${error.message}`, asset.partId);
      }
    }
    assets[asset.key] = {
      candidate: publicIdentity(candidate),
      releaseMirror: publicIdentity(releaseMirror),
      blender: publicIdentity(blender),
      validatorReport: publicIdentity(validatorIdentity),
      glb: glbAssessment?.facts || null,
    };
  }
  const blendHashes = contract.assets.map((asset) => assets[asset.key]?.blender?.sha256).filter(Boolean);
  const candidateHashes = contract.assets.map((asset) => assets[asset.key]?.candidate?.sha256).filter(Boolean);
  if (new Set(blendHashes).size !== contract.assets.length
      || new Set(candidateHashes).size !== contract.assets.length) {
    issue(failures, 'candidate-set-distinct', 'all three candidate GLBs and Blender sources must be distinct identities');
  }
  const buildReportIdentity = validateBoundFile({
    rootDir,
    failures,
    label: 'build report',
    expectedPath: contract.paths.buildReport,
    record: binding?.buildReport,
  });
  let buildReport = null;
  if (buildReportIdentity) {
    try {
      buildReport = JSON.parse(buildReportIdentity.contents.toString('utf8'));
      failures.push(...assessNavigationInfrastructureBuildReport({
        report: buildReport,
        assets,
        generator: generatorIdentity,
      }).failures);
    } catch (error) {
      issue(failures, 'build-report-json', error.message);
    }
  }

  const renderManifestIdentity = validateBoundFile({
    rootDir,
    failures,
    label: 'render manifest',
    expectedPath: contract.paths.renderManifest,
    record: binding?.renderManifest,
  });
  let renderManifest = null;
  const renderFiles = [];
  if (renderManifestIdentity) {
    try {
      renderManifest = JSON.parse(renderManifestIdentity.contents.toString('utf8'));
      failures.push(...assessNavigationInfrastructureRenderManifest({ manifest: renderManifest, assets }).failures);
      const renderRows = indexOrderedAssetRows(renderManifest.assets, {
        failures,
        code: 'render-manifest-set',
        label: 'render manifest assets',
      });
      for (const asset of contract.assets) {
        const row = renderRows[asset.partId];
        const boundImages = assetBindings[asset.partId]?.renderImages;
        if (!jsonEqual(boundImages, row?.images)) {
          issue(failures, 'render-binding', `${asset.partId}: binding render identities differ from the exact render manifest`, asset.partId);
        }
        for (const [index, expectedPath] of asset.renderViews.entries()) {
          const identity = validateBoundFile({
            rootDir,
            failures,
            label: `${asset.partId} render ${index + 1}`,
            expectedPath,
            record: row?.images?.[index],
          });
          if (!identity) continue;
          renderFiles.push(publicIdentity(identity));
          try {
            const dimensions = readPngDimensions(identity.contents, expectedPath);
            if (!jsonEqual([dimensions.width, dimensions.height], [1600, 900])) {
              issue(failures, 'render-view-dimensions', `${expectedPath}: expected 1600x900`, asset.partId);
            }
          } catch (error) {
            issue(failures, 'render-view-png', error.message, asset.partId);
          }
        }
      }
    } catch (error) {
      issue(failures, 'render-manifest-json', error.message);
    }
  }
  const expectedRenderCount = contract.assets.reduce((sum, asset) => sum + asset.renderViews.length, 0);
  if (renderFiles.length !== expectedRenderCount) {
    issue(failures, 'render-evidence-count', `render epoch must bind exactly ${expectedRenderCount} original-resolution files`);
  }
  if (buildReport && renderManifestIdentity
      && !jsonEqual(buildReport.renderManifest, publicIdentity(renderManifestIdentity))) {
    issue(failures, 'build-render-binding', 'build report is bound to a stale render manifest identity');
  }

  return {
    schema: contract.reportSchema,
    pass: failures.length === 0,
    failures,
    facts: {
      binding: publicIdentity(bindingIdentity),
      baseline: baseline.facts,
      generator: publicIdentity(generatorIdentity),
      preflight: publicIdentity(preflightIdentity),
      buildReport: publicIdentity(buildReportIdentity),
      renderManifest: publicIdentity(renderManifestIdentity),
      renderFiles,
      assets,
    },
  };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

if (process.argv[1]
    && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const result = validateNavigationInfrastructureCandidate({ rootDir: ROOT });
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}
