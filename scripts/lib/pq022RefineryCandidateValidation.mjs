import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Box3,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';

const MATERIAL_NAMES = Object.freeze([
  'Material_Accent',
  'Material_Glass',
  'Material_Hull',
  'Material_Mechanical',
  'Material_Warm',
]);

const LOD_LEVELS = Object.freeze(['LOD0', 'LOD1', 'LOD2']);

export const PQ022_REFINERY_CANDIDATE_CONTRACT = Object.freeze({
  schema: 'spaceface.pq022RefineryCandidateBinding.v1',
  reportSchema: 'spaceface.pq022RefineryCandidateValidation.v1',
  buildReportSchema: 'spaceface.pq022RefineryBuildReport.v1',
  packet: 'PQ-022',
  dispatchUnit: 'PQ-022.refinery-reauthor',
  candidateId: 'pq022-refinery-material-truth-v2',
  candidateState: 'candidate_only',
  unit: 'metre',
  partId: 'place_station_refinery',
  assetId: 'SF_PLACE_STATION_REFINERY',
  role: 'industrial_refinery',
  rootNode: 'SF_PLACE_STATION_REFINERY_ROOT',
  partFile: 'places/place_station_refinery.glb',
  paths: Object.freeze({
    candidate: 'assets/ships/m5_station_refinery/source_candidates/material_truth_v2/places/place_station_refinery.glb',
    releaseMirror: 'assets/ships/m5_station_refinery/release_candidates/material_truth_v2/places/place_station_refinery.glb',
    blender: 'assets/ships/m5_station_refinery/blender/source/material_truth_v2/place_station_refinery.blend',
    binding: 'assets/ships/m5_station_refinery/reports/material_truth_v2/validation_binding.json',
    buildReport: 'assets/ships/m5_station_refinery/reports/material_truth_v2/build_report.json',
    foundryReport: 'assets/ships/m5_station_refinery/reports/material_truth_v2/validation/foundry/place_station_refinery.glb.report.json',
    khronosReport: 'assets/ships/m5_station_refinery/reports/material_truth_v2/validation/khronos/place_station_refinery.glb.report.json',
    blenderGate: 'assets/ships/m5_station_refinery/reports/material_truth_v2/validation/blender/spaceface_export.report.json',
    renderManifest: 'assets/ships/m5_station_refinery/reports/material_truth_v2/render_manifest.json',
    promotionReview: 'assets/ships/m5_station_refinery/reports/material_truth_v2/promotion_review.json',
    liveSource: 'assets/ships/parts/places/place_station_refinery.glb',
    liveRelease: 'assets/ships/release/parts/places/place_station_refinery.glb',
    liveBlend: 'assets/ships/parts/blender/place_station_refinery_authored.blend',
    partsManifest: 'assets/ships/parts/parts_manifest.json',
    releaseManifest: 'assets/ships/release/release_manifest.json',
    sourceGenerator: 'tools/blender/build_station_refinery_material_truth_v2.py',
  }),
  renderManifestSchema: 'spaceface.refineryExactSourceRenderManifest.v1',
  promotionReviewSchema: 'spaceface.pq022RefineryPromotionReview.v1',
  renderViews: Object.freeze([
    'assets/ships/m5_station_refinery/reports/material_truth_v2/renders/process_three_quarter.png',
    'assets/ships/m5_station_refinery/reports/material_truth_v2/renders/feed_three_quarter.png',
    'assets/ships/m5_station_refinery/reports/material_truth_v2/renders/side_process.png',
    'assets/ships/m5_station_refinery/reports/material_truth_v2/renders/top_flow.png',
    'assets/ships/m5_station_refinery/reports/material_truth_v2/renders/process_three_quarter_emissive_off.png',
  ]),
  processChain: Object.freeze([
    'blender-5.1-python',
    'glb-source-candidate',
    'foundry-validation',
    'khronos-validation',
    'hash-binding',
  ]),
  claims: Object.freeze({
    candidateOnly: true,
    promoted: false,
    routeEvidence: false,
    performanceEvidence: false,
  }),
  baseline: Object.freeze({
    sourceSha256: '93fce6a0401a3375cad4269cc59dbf1ad5ba3eafb822a4a6f6d464410d9093a9',
    sourceBytes: 23431088,
    releaseSha256: '52653b6b9fd0859c076bbd5912feb827a099c1f3220bfea99c4881281a5d5f57',
    releaseBytes: 9885532,
    blendSha256: '6dc22f8d950bf848970f660a318070f278abae7636ce73d485b2e86cf11a00fe',
    blendBytes: 6402227,
    visibleGeometrySha256: '7a45639e9c952510282dc3674e232a7d160ad08720fab9214905c7d01fca9701',
  }),
  budgets: Object.freeze({
    // These ceilings preserve the already-shipped cast-scale cost envelope. They are not an
    // aesthetic geometry target: the causal visual review still decides whether the authored
    // construction is good enough.
    candidateBytes: 23431088,
    lodTriangles: Object.freeze({ LOD0: 141740, LOD1: 35056, LOD2: 5440 }),
    collisionTriangles: 44,
  }),
  materials: MATERIAL_NAMES,
  sockets: Object.freeze({
    SOCKET_Dock_Approach: Object.freeze({
      translation: Object.freeze([42.47999954223633, 0, 0]),
      rotation: Object.freeze([0, 0, 0, 1]),
      scale: Object.freeze([1, 1, 1]),
    }),
    SOCKET_Emissive: Object.freeze({
      translation: Object.freeze([0, 0, -31.954999923706055]),
      rotation: Object.freeze([0, 0, 0, 1]),
      scale: Object.freeze([1, 1, 1]),
    }),
    SOCKET_Structure_Core: Object.freeze({
      translation: Object.freeze([0, 0, 0]),
      rotation: Object.freeze([0, 0, 0, 1]),
      scale: Object.freeze([1, 1, 1]),
    }),
  }),
  envelope: Object.freeze({
    // Runtime GLB coordinates. The historical parts-manifest row carries the same magnitudes in
    // Blender authoring-axis order: [98, 63.85, 55.5].
    min: Object.freeze([-39, -25, -58.1]),
    max: Object.freeze([59, 30.5, 5.75]),
    size: Object.freeze([98, 55.5, 63.85]),
    manifestSize: Object.freeze([98, 63.85, 55.5]),
  }),
  collision: Object.freeze({
    node: 'COLLISION_HULL',
    geometrySha256: 'f6ec9016ce93cc03179c1d8a09ba80aa7c253f798d91cfe8d3d87b6aed26bb7d',
  }),
  wiring: Object.freeze({
    partId: 'place_station_refinery',
    slot: 'place',
    rootNode: 'SF_PLACE_STATION_REFINERY_ROOT',
    sockets: Object.freeze([
      'SOCKET_Dock_Approach',
      'SOCKET_Emissive',
      'SOCKET_Structure_Core',
    ]),
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

function stableNumber(value) {
  return Number(Number(value).toFixed(6));
}

function vectorNear(actual, expected, epsilon = 1e-5) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => Math.abs(Number(value) - expected[index]) <= epsilon);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function jsonEqual(actual, expected) {
  return JSON.stringify(canonicalJson(actual)) === JSON.stringify(canonicalJson(expected));
}

function publicIdentity(identity) {
  return identity ? {
    path: identity.path,
    sha256: identity.sha256,
    bytes: identity.bytes,
  } : null;
}

function issue(failures, code, detail) {
  failures.push({ code, detail });
}

function fileIdentity(rootDir, file) {
  const bytes = readFileSync(absolute(rootDir, file));
  return { path: file, bytes: bytes.length, sha256: sha256(bytes), contents: bytes };
}

export function readGlb(file, { rootDir = process.cwd() } = {}) {
  const identity = fileIdentity(rootDir, file);
  const bytes = identity.contents;
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${file}: invalid GLB magic`);
  }
  if (bytes.readUInt32LE(4) !== 2) throw new Error(`${file}: expected GLB version 2`);
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`${file}: declared GLB length is stale`);

  let json = null;
  let binary = null;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error(`${file}: truncated GLB chunk header`);
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > bytes.length) throw new Error(`${file}: GLB chunk exceeds file bounds`);
    const chunk = bytes.subarray(offset + 8, end);
    if (type === 0x4e4f534a) {
      json = JSON.parse(chunk.toString('utf8').replace(/\0+$/, '').trim());
    } else if (type === 0x004e4942) {
      binary = chunk;
    }
    offset = end;
  }
  if (!json || !binary) throw new Error(`${file}: expected JSON and BIN chunks`);
  return { ...identity, json, binary };
}

export function accessorValues(glb, accessorIndex) {
  const accessor = glb.json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`missing accessor ${accessorIndex}`);
  if (accessor.sparse != null) throw new Error(`accessor ${accessorIndex}: sparse accessors are unsupported`);
  const components = COMPONENTS[accessor.type];
  const component = COMPONENT[accessor.componentType];
  if (!components || !component) throw new Error(`accessor ${accessorIndex}: unsupported representation`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`accessor ${accessorIndex}: missing bufferView`);
  if ((view.buffer ?? 0) !== 0) throw new Error(`accessor ${accessorIndex}: expected embedded BIN buffer`);
  if (view.extensions?.EXT_meshopt_compression) {
    throw new Error(`accessor ${accessorIndex}: source candidate must be inspected before Meshopt release compression`);
  }
  const packedStride = component.bytes * components;
  const stride = view.byteStride ?? packedStride;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = start + Math.max(0, accessor.count - 1) * stride + packedStride;
  if (end > glb.binary.length) throw new Error(`accessor ${accessorIndex}: exceeds BIN chunk`);
  return Array.from({ length: accessor.count }, (_, index) => {
    const row = Array.from({ length: components }, (_unused, axis) => (
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
    const matrix = parent.clone().multiply(localMatrix(json.nodes[index] || {}));
    matrices.set(index, matrix);
    for (const child of json.nodes[index]?.children || []) visit(child, matrix);
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

function topology(glb, primitive) {
  if ((primitive.mode ?? 4) !== 4) return { triangles: 0, degenerateTriangles: 0, nonManifoldEdges: 1 };
  const positions = accessorValues(glb, primitive.attributes.POSITION);
  const indices = primitive.indices == null
    ? Array.from({ length: positions.length }, (_, index) => index)
    : accessorValues(glb, primitive.indices);
  const welded = new Map();
  const weldedByVertex = positions.map((position) => {
    const key = position.map(stableNumber).join(':');
    if (!welded.has(key)) welded.set(key, welded.size);
    return welded.get(key);
  });
  const edges = new Map();
  let degenerateTriangles = 0;
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const triangle = indices.slice(offset, offset + 3).map((index) => weldedByVertex[index]);
    if (new Set(triangle).size !== 3) degenerateTriangles += 1;
    for (const [left, right] of [
      [triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]],
    ]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return {
    triangles: Math.floor(indices.length / 3),
    weldedVertices: welded.size,
    degenerateTriangles,
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
  };
}

function geometryHash(glb, nodeIndex, primitive, matrices = defaultSceneGraph(glb.json).matrices) {
  const positions = accessorValues(glb, primitive.attributes.POSITION);
  const indices = primitive.indices == null
    ? Array.from({ length: positions.length }, (_, index) => index)
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

function lodEnvelope(glb, level, matrices = defaultSceneGraph(glb.json).matrices) {
  const box = new Box3();
  for (const [nodeIndex, node] of (glb.json.nodes || []).entries()) {
    if (!node.name?.startsWith(`${level}_`) || node.mesh == null) continue;
    const matrix = matrices.get(nodeIndex);
    if (!matrix) throw new Error(`${node.name} is unreachable from the default scene`);
    for (const primitive of glb.json.meshes?.[node.mesh]?.primitives || []) {
      for (const position of accessorValues(glb, primitive.attributes.POSITION)) {
        box.expandByPoint(new Vector3().fromArray(position).applyMatrix4(matrix));
      }
    }
  }
  const size = box.getSize(new Vector3()).toArray();
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size,
  };
}

function visibleGeometryHash(glb, matrices) {
  const records = [];
  for (const [nodeIndex, node] of (glb.json.nodes || []).entries()) {
    const match = /^(LOD[012])_Station_(Material_.+)$/.exec(node.name || '');
    if (!match || node.mesh == null) continue;
    for (const primitive of glb.json.meshes?.[node.mesh]?.primitives || []) {
      records.push({
        level: match[1],
        material: glb.json.materials?.[primitive.material]?.name || null,
        geometrySha256: geometryHash(glb, nodeIndex, primitive, matrices),
      });
    }
  }
  records.sort((left, right) => `${left.level}:${left.material}`.localeCompare(`${right.level}:${right.material}`));
  return sha256(Buffer.from(JSON.stringify(records)));
}

function expectedNodeNames() {
  return [
    PQ022_REFINERY_CANDIDATE_CONTRACT.collision.node,
    ...LOD_LEVELS.flatMap((level) => MATERIAL_NAMES.map((material) => `${level}_Station_${material}`)),
    ...Object.keys(PQ022_REFINERY_CANDIDATE_CONTRACT.sockets),
    PQ022_REFINERY_CANDIDATE_CONTRACT.rootNode,
  ].sort();
}

export function assessRefineryCandidateGlb(glb) {
  const contract = PQ022_REFINERY_CANDIDATE_CONTRACT;
  const failures = [];
  const facts = {
    path: glb.path,
    sha256: glb.sha256,
    bytes: glb.bytes,
    lodTriangles: {},
    visibleGroups: [],
    visibleGeometrySha256: null,
    textureBindings: [],
    imageDimensions: [],
    textureSize: null,
    envelope: null,
    collision: null,
  };
  const json = glb.json;
  const stamp = json.asset?.extras?.spacefaceAsset;
  const defaultScene = json.scenes?.[json.scene ?? 0];
  const canonicalRoot = (json.nodes || []).find((node) => node.name === contract.rootNode);
  const lifecycleCopies = [
    ['asset', stamp],
    ['default scene', defaultScene?.extras?.spacefaceAsset],
    ['canonical root', canonicalRoot?.extras?.spacefaceAsset],
  ];
  if (lifecycleCopies.some(([, value]) => !value)
      || lifecycleCopies.some(([, value]) => !jsonEqual(value, stamp))) {
    issue(
      failures,
      'candidate-lifecycle-copies',
      'asset, default-scene, and canonical-root spacefaceAsset lifecycle stamps must exist and be identical',
    );
  }
  if (!jsonEqual(stamp?.claims, contract.claims) || stamp?.wiringStatus !== 'isolated_candidate') {
    issue(
      failures,
      'candidate-lifecycle-boundary',
      'all candidate lifecycle copies must retain candidate-only claims and isolated_candidate wiring',
    );
  }
  for (const [field, expected] of Object.entries({
    contractVersion: 1,
    candidateId: contract.candidateId,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    state: contract.candidateState,
    assetId: contract.assetId,
    partId: contract.partId,
    liveId: contract.partId,
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: contract.unit,
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    role: contract.role,
    kind: 'station_landmark',
    deliverableRole: 'production_multi_lod',
    sourceGenerator: contract.paths.sourceGenerator,
  })) {
    if (stamp?.[field] !== expected) issue(failures, 'asset-stamp', `${field}: expected ${expected}, got ${stamp?.[field]}`);
  }
  if (!jsonEqual(stamp?.processChain, contract.processChain)) {
    issue(failures, 'candidate-process-chain', 'spacefaceAsset.processChain does not bind the deterministic producer/validator chain');
  }
  if (!jsonEqual(stamp?.wiring, contract.wiring)) {
    issue(failures, 'candidate-wiring', 'spacefaceAsset.wiring does not preserve the exact refinery runtime identity');
  }

  const sceneRoots = (json.scenes?.[json.scene ?? 0]?.nodes || []).map((index) => json.nodes[index]?.name);
  if (sceneRoots.length !== 1 || sceneRoots[0] !== contract.rootNode) {
    issue(failures, 'root', `expected sole scene root ${contract.rootNode}, got ${JSON.stringify(sceneRoots)}`);
  }
  const nodes = new Map((json.nodes || []).map((node, index) => [node.name, { node, index }]));
  const actualNodeNames = [...nodes.keys()].sort();
  if (nodes.size !== (json.nodes || []).length
    || JSON.stringify(actualNodeNames) !== JSON.stringify(expectedNodeNames())) {
    issue(failures, 'node-set', 'candidate must contain only the frozen root, collision, sockets, and 5 material groups per LOD');
  }
  const graph = defaultSceneGraph(json);
  if (graph.cycles.length > 0) {
    issue(failures, 'scene-cycle', `default scene contains a node cycle at indices ${graph.cycles.join(', ')}`);
  }
  if (graph.invalidChildren.length > 0) {
    issue(failures, 'scene-child', `default scene references invalid node indices ${graph.invalidChildren.join(', ')}`);
  }
  for (const name of expectedNodeNames()) {
    const entry = nodes.get(name);
    const count = entry ? graph.visits.get(entry.index) || 0 : 0;
    if (count !== 1) {
      issue(failures, 'scene-reachability', `${name}: expected exactly one path from the default root, got ${count}`);
    }
  }
  const root = nodes.get(contract.rootNode)?.node;
  if (!root
    || !vectorNear(root.translation ?? [0, 0, 0], [0, 0, 0])
    || !vectorNear(root.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1])
    || !vectorNear(root.scale ?? [1, 1, 1], [1, 1, 1])) {
    issue(failures, 'root-transform', 'refinery root must remain identity');
  }

  for (const [name, expected] of Object.entries(contract.sockets)) {
    const socket = nodes.get(name)?.node;
    if (!socket) {
      issue(failures, 'socket-missing', `${name} is missing`);
      continue;
    }
    if (socket.mesh != null) issue(failures, 'socket-mesh', `${name} must stay a marker`);
    if (!vectorNear(socket.translation ?? [0, 0, 0], expected.translation)
      || !vectorNear(socket.rotation ?? [0, 0, 0, 1], expected.rotation)
      || !vectorNear(socket.scale ?? [1, 1, 1], expected.scale)) {
      issue(failures, 'socket-transform', `${name} transform drifted`);
    }
  }

  const materialNames = (json.materials || []).map((material) => material.name).sort();
  if (JSON.stringify(materialNames) !== JSON.stringify([...MATERIAL_NAMES].sort())) {
    issue(failures, 'materials', `expected exact semantic material set ${MATERIAL_NAMES.join(', ')}`);
  }
  const boundTextureIndices = new Set();
  const boundImageIndices = new Set();
  for (const material of json.materials || []) {
    const pbr = material.pbrMetallicRoughness;
    if (pbr?.baseColorTexture?.index == null
      || pbr?.metallicRoughnessTexture?.index == null
      || material.normalTexture?.index == null
      || material.occlusionTexture?.index == null) {
      issue(failures, 'pbr-texture-roles', `${material.name}: base color, normal, ORM and AO bindings are required`);
    } else if (pbr.metallicRoughnessTexture.index !== material.occlusionTexture.index) {
      issue(failures, 'pbr-orm', `${material.name}: occlusion and metallic-roughness must share the packed ORM texture`);
    }
    const roles = [
      ['baseColorTexture', pbr?.baseColorTexture?.index],
      ['normalTexture', material.normalTexture?.index],
      ['ormTexture', pbr?.metallicRoughnessTexture?.index],
    ];
    const materialTextureIndices = roles.map(([, textureIndex]) => textureIndex);
    if (new Set(materialTextureIndices).size !== 3) {
      issue(failures, 'pbr-role-alias', `${material.name}: base color, normal and ORM must use three distinct textures`);
    }
    for (const [role, textureIndex] of roles) {
      const texture = json.textures?.[textureIndex];
      if (!texture || !Number.isInteger(texture.source) || texture.extensions?.KHR_texture_basisu) {
        issue(failures, 'pbr-texture-source', `${material.name}/${role}: expected one direct source-image binding`);
        continue;
      }
      boundTextureIndices.add(textureIndex);
      boundImageIndices.add(texture.source);
      facts.textureBindings.push({ material: material.name, role, textureIndex, imageIndex: texture.source });
    }
  }
  if ((json.images || []).length !== 15 || (json.textures || []).length !== 15) {
    issue(failures, 'pbr-texture-count', 'five semantic materials require 15 embedded source textures');
  }
  if (boundTextureIndices.size !== 15 || boundImageIndices.size !== 15
    || boundTextureIndices.size !== (json.textures || []).length
    || boundImageIndices.size !== (json.images || []).length) {
    issue(failures, 'pbr-role-coverage', 'the 15 material roles must bind 15 unique textures and 15 unique images exactly once');
  }
  const pngMagic = '89504e470d0a1a0a';
  const embeddedImageBufferViews = new Set();
  for (const [imageIndex, image] of (json.images || []).entries()) {
    if (image.uri != null || !Number.isInteger(image.bufferView) || image.mimeType !== 'image/png') {
      issue(failures, 'embedded-png', `image ${imageIndex}: expected bufferView-backed image/png with no uri`);
      continue;
    }
    embeddedImageBufferViews.add(image.bufferView);
    const view = json.bufferViews?.[image.bufferView];
    const start = Number(view?.byteOffset ?? 0);
    const length = Number(view?.byteLength ?? 0);
    if (!view || (view.buffer ?? 0) !== 0 || length < 24 || start < 0 || start + length > glb.binary.length) {
      issue(failures, 'embedded-png-buffer', `image ${imageIndex}: invalid embedded PNG bufferView`);
      continue;
    }
    const png = glb.binary.subarray(start, start + length);
    if (png.subarray(0, 8).toString('hex') !== pngMagic) {
      issue(failures, 'embedded-png-magic', `image ${imageIndex}: bufferView does not contain PNG bytes`);
      continue;
    }
    if (png.readUInt32BE(8) !== 13 || png.subarray(12, 16).toString('ascii') !== 'IHDR') {
      issue(failures, 'embedded-png-ihdr', `image ${imageIndex}: PNG is missing the canonical IHDR header`);
      continue;
    }
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      issue(failures, 'embedded-png-dimensions', `image ${imageIndex}: PNG dimensions are invalid`);
      continue;
    }
    facts.imageDimensions.push({ imageIndex, width, height });
  }
  if (embeddedImageBufferViews.size !== MATERIAL_NAMES.length * 3) {
    issue(failures, 'embedded-png-unique', 'the 15 PBR image roles must use 15 distinct embedded PNG bufferViews');
  }
  const exactTextureSizes = new Set(facts.imageDimensions.map(({ width, height }) => `${width}x${height}`));
  if (facts.imageDimensions.length !== MATERIAL_NAMES.length * 3
      || exactTextureSizes.size !== 1
      || facts.imageDimensions.some(({ width, height }) => width !== height)) {
    issue(
      failures,
      'embedded-png-dimensions',
      'all 15 embedded PBR images must use one exact uniform square texture size',
    );
  } else {
    facts.textureSize = facts.imageDimensions[0].width;
  }
  facts.textureBindings.sort((left, right) => (
    `${left.material}:${left.role}`.localeCompare(`${right.material}:${right.role}`)
  ));

  for (const level of LOD_LEVELS) {
    const groups = (json.nodes || []).filter((node) => node.name?.startsWith(`${level}_`) && node.mesh != null);
    if (groups.length !== MATERIAL_NAMES.length) {
      issue(failures, 'lod-groups', `${level}: expected 5 visible material groups, got ${groups.length}`);
    }
    const usedMaterials = [];
    let triangles = 0;
    for (const node of groups) {
      const primitives = json.meshes?.[node.mesh]?.primitives || [];
      if (primitives.length !== 1) issue(failures, 'draw-group', `${node.name}: expected exactly one primitive`);
      for (const [primitiveIndex, primitive] of primitives.entries()) {
        triangles += primitiveTriangles(json, primitive);
        const material = json.materials?.[primitive.material]?.name;
        usedMaterials.push(material);
        const expectedMaterial = node.name.slice(`${level}_Station_`.length);
        if (material !== expectedMaterial) {
          issue(failures, 'material-slot', `${node.name}: primitive material is ${material}`);
        }
        for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
          if (primitive.attributes?.[attribute] == null) {
            issue(failures, 'visible-attributes', `${node.name}/${primitiveIndex}: missing ${attribute}`);
          }
        }
        try {
          const meshTopology = topology(glb, primitive);
          facts.visibleGroups.push({ level, node: node.name, material, ...meshTopology });
          if (meshTopology.degenerateTriangles !== 0 || meshTopology.nonManifoldEdges !== 0) {
            issue(failures, 'visible-topology', `${node.name}: ${meshTopology.degenerateTriangles} degenerate triangles, ${meshTopology.nonManifoldEdges} non-manifold/open edges`);
          }
        } catch (error) {
          issue(failures, 'visible-topology-read', `${node.name}: ${error.message}`);
        }
      }
    }
    facts.lodTriangles[level] = triangles;
    if (triangles > contract.budgets.lodTriangles[level]) {
      issue(failures, 'triangle-budget', `${level}: ${triangles} exceeds ${contract.budgets.lodTriangles[level]}`);
    }
    if (JSON.stringify(usedMaterials.sort()) !== JSON.stringify([...MATERIAL_NAMES].sort())) {
      issue(failures, 'lod-material-coverage', `${level}: must use every semantic material exactly once`);
    }
  }
  if (!(facts.lodTriangles.LOD0 > facts.lodTriangles.LOD1
    && facts.lodTriangles.LOD1 > facts.lodTriangles.LOD2)) {
    issue(failures, 'lod-reduction', 'LOD0 > LOD1 > LOD2 must be a strict geometric reduction');
  }
  try {
    facts.visibleGeometrySha256 = visibleGeometryHash(glb, graph.matrices);
    if (facts.visibleGeometrySha256 === contract.baseline.visibleGeometrySha256) {
      issue(failures, 'visible-geometry-novelty', 'candidate visible geometry is still the rejected refinery geometry');
    }
  } catch (error) {
    issue(failures, 'visible-geometry-read', error.message);
  }
  if (glb.bytes > contract.budgets.candidateBytes) {
    issue(failures, 'byte-budget', `${glb.bytes} exceeds ${contract.budgets.candidateBytes}`);
  }

  try {
    facts.envelope = lodEnvelope(glb, 'LOD0', graph.matrices);
    if (!vectorNear(facts.envelope.min, contract.envelope.min, 1e-3)
      || !vectorNear(facts.envelope.max, contract.envelope.max, 1e-3)
      || !vectorNear(facts.envelope.size, contract.envelope.size, 1e-3)) {
      issue(failures, 'envelope', `LOD0 envelope drifted: ${JSON.stringify(facts.envelope)}`);
    }
  } catch (error) {
    issue(failures, 'envelope-read', error.message);
  }
  if (!vectorNear(stamp?.lod0AabbSize, contract.envelope.manifestSize, 1e-3)) {
    issue(failures, 'stamped-envelope', `spacefaceAsset.lod0AabbSize must remain ${contract.envelope.manifestSize.join(' x ')}`);
  }
  for (const level of LOD_LEVELS) {
    if (Number(stamp?.lodTriangles?.[level.toLowerCase()]) !== facts.lodTriangles[level]) {
      issue(failures, 'stamped-triangles', `${level}: metadata does not match candidate geometry`);
    }
    if (Number(stamp?.drawGroupsPerLod?.[level.toLowerCase()]) !== MATERIAL_NAMES.length) {
      issue(failures, 'stamped-groups', `${level}: metadata must record five draw groups`);
    }
  }
  if (Number(stamp?.triangleCount) !== facts.lodTriangles.LOD0) {
    issue(failures, 'stamped-triangles', 'triangleCount must equal measured LOD0 triangles');
  }

  const collisionEntry = nodes.get(contract.collision.node);
  if (!collisionEntry?.node || collisionEntry.node.mesh == null) {
    issue(failures, 'collision', `${contract.collision.node} is missing`);
  } else {
    const primitives = json.meshes?.[collisionEntry.node.mesh]?.primitives || [];
    const triangles = primitives.reduce((sum, primitive) => sum + primitiveTriangles(json, primitive), 0);
    let geometrySha256 = null;
    if (primitives.length === 1) {
      try {
        geometrySha256 = geometryHash(glb, collisionEntry.index, primitives[0], graph.matrices);
      } catch (error) {
        issue(failures, 'collision-geometry-read', error.message);
      }
    }
    facts.collision = { triangles, primitiveCount: primitives.length, geometrySha256 };
    if (triangles !== contract.budgets.collisionTriangles || primitives.length !== 1) {
      issue(failures, 'collision-budget', `collision must remain one ${contract.budgets.collisionTriangles}-triangle primitive`);
    }
    if (geometrySha256 !== contract.collision.geometrySha256) {
      issue(failures, 'collision-geometry', `collision geometry drifted: ${geometrySha256}`);
    }
  }

  return { pass: failures.length === 0, failures, facts };
}

export function assessRefineryBudget({ bytes, lodTriangles }) {
  const failures = [];
  const budget = PQ022_REFINERY_CANDIDATE_CONTRACT.budgets;
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > budget.candidateBytes) {
    failures.push(`candidate bytes ${bytes} exceed the positive <= ${budget.candidateBytes} contract`);
  }
  for (const level of LOD_LEVELS) {
    const count = Number(lodTriangles?.[level]);
    if (!Number.isInteger(count) || count <= 0 || count > budget.lodTriangles[level]) {
      failures.push(`${level} triangles ${count} exceed the positive <= ${budget.lodTriangles[level]} contract`);
    }
  }
  if (!(lodTriangles?.LOD0 > lodTriangles?.LOD1 && lodTriangles?.LOD1 > lodTriangles?.LOD2)) {
    failures.push('LOD triangle counts must reduce strictly');
  }
  return { pass: failures.length === 0, failures };
}

export function assessRefineryBuildReport({
  report,
  candidate,
  releaseMirror,
  blender,
  generator,
  glbFacts,
}) {
  const contract = PQ022_REFINERY_CANDIDATE_CONTRACT;
  const failures = [];
  for (const [field, expected] of Object.entries({
    schema: contract.buildReportSchema,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    candidateId: contract.candidateId,
    assetId: contract.partId,
    spacefaceAssetId: contract.assetId,
    unit: contract.unit,
    state: contract.candidateState,
  })) {
    if (report?.[field] !== expected) issue(failures, 'build-report-header', `${field}: expected ${expected}, got ${report?.[field]}`);
  }
  if (!jsonEqual(report?.claims, contract.claims)) {
    issue(failures, 'build-report-claims', 'build report must remain candidate-only with no promotion, route, or performance claim');
  }
  const expectedIdentities = {
    candidate: candidate ? { path: candidate.path, sha256: candidate.sha256, bytes: candidate.bytes } : null,
    releaseMirror: releaseMirror
      ? { path: releaseMirror.path, sha256: releaseMirror.sha256, bytes: releaseMirror.bytes }
      : null,
    blender: blender ? { path: blender.path, sha256: blender.sha256, bytes: blender.bytes } : null,
    generator: generator ? { path: generator.path, sha256: generator.sha256, bytes: generator.bytes } : null,
  };
  for (const [label, expected] of Object.entries(expectedIdentities)) {
    if (!expected || !jsonEqual(report?.[label], expected)) {
      issue(failures, 'build-report-identity', `${label}: build report is not bound to the admitted bytes`);
    }
  }
  if (!jsonEqual(report?.producer, {
    sourceGenerator: expectedIdentities.generator,
    processChain: contract.processChain,
  })) {
    issue(failures, 'build-report-producer', 'build report does not bind the deterministic Blender/validator process chain');
  }
  const expectedFrozenContract = glbFacts ? {
    rootNode: contract.rootNode,
    sockets: contract.sockets,
    materials: contract.materials,
    envelope: {
      min: contract.envelope.min,
      max: contract.envelope.max,
      size: contract.envelope.size,
    },
    collision: {
      node: contract.collision.node,
      triangles: contract.budgets.collisionTriangles,
      geometrySha256: contract.collision.geometrySha256,
    },
    lodTriangles: glbFacts.lodTriangles,
    visibleGroups: glbFacts.visibleGroups.length,
    visibleGeometrySha256: glbFacts.visibleGeometrySha256,
    textureRoleBindings: glbFacts.textureBindings.length,
    embeddedPngImages: 15,
  } : null;
  if (!expectedFrozenContract || !jsonEqual(report?.frozenContract, expectedFrozenContract)) {
    issue(failures, 'build-report-contract', 'build report frozenContract does not match the measured candidate');
  }
  return { pass: failures.length === 0, failures };
}

export function validateRefineryBaselineIdentity({ rootDir = process.cwd() } = {}) {
  const contract = PQ022_REFINERY_CANDIDATE_CONTRACT;
  const failures = [];
  const facts = {};
  for (const [key, label, file, expectedSha, expectedBytes] of [
    ['source', 'source', contract.paths.liveSource, contract.baseline.sourceSha256, contract.baseline.sourceBytes],
    ['release', 'release', contract.paths.liveRelease, contract.baseline.releaseSha256, contract.baseline.releaseBytes],
    ['blender', 'Blender source', contract.paths.liveBlend, contract.baseline.blendSha256, contract.baseline.blendBytes],
  ]) {
    try {
      const identity = fileIdentity(rootDir, file);
      facts[key] = publicIdentity(identity);
      if (identity.sha256 !== expectedSha || identity.bytes !== expectedBytes) {
        issue(failures, 'baseline-identity', `${label} changed before candidate admission`);
      }
    } catch (error) {
      issue(failures, 'baseline-read', `${label}: ${error.message}`);
    }
  }
  try {
    const partsManifestIdentity = fileIdentity(rootDir, contract.paths.partsManifest);
    facts.partsManifest = publicIdentity(partsManifestIdentity);
    const parts = JSON.parse(partsManifestIdentity.contents.toString('utf8'));
    const row = (parts.parts || []).find((entry) => entry.id === contract.partId);
    if (!row
      || row.file !== contract.partFile
      || row.category !== 'places'
      || row.mount !== 'origin'
      || row.bytes !== contract.baseline.sourceBytes
      || row.tris !== contract.budgets.lodTriangles.LOD0
      || JSON.stringify([...(row.sockets || [])].sort()) !== JSON.stringify(Object.keys(contract.sockets).sort())
      || !vectorNear(row.bounds?.dimensionsM, contract.envelope.manifestSize, 1e-3)) {
      issue(failures, 'parts-manifest', 'current refinery parts-manifest identity/envelope contract drifted');
    }
    if (!(parts.runtimeSlots?.place || []).includes(contract.partFile)) {
      issue(failures, 'runtime-slot', 'current refinery is absent from runtimeSlots.place');
    }
  } catch (error) {
    issue(failures, 'parts-manifest-read', error.message);
  }
  try {
    const releaseManifestIdentity = fileIdentity(rootDir, contract.paths.releaseManifest);
    facts.releaseManifest = publicIdentity(releaseManifestIdentity);
    const release = JSON.parse(releaseManifestIdentity.contents.toString('utf8'));
    const row = (release.assets || []).find((entry) => entry.id === contract.partId);
    if (!row
      || row.source !== contract.paths.liveSource
      || row.release !== contract.paths.liveRelease
      || row.sourceSha256 !== contract.baseline.sourceSha256
      || row.releaseSha256 !== contract.baseline.releaseSha256
      || row.sourceBytes !== contract.baseline.sourceBytes
      || row.releaseBytes !== contract.baseline.releaseBytes) {
      issue(failures, 'release-manifest', 'current refinery release-manifest identity drifted before promotion');
    }
  } catch (error) {
    issue(failures, 'release-manifest-read', error.message);
  }
  return { pass: failures.length === 0, failures, facts };
}

function validateBoundFile({ rootDir, failures, label, expectedPath, record, hashKey = 'sha256', bytesKey = 'bytes' }) {
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

export function assessValidatorCandidateBinding({ kind, record, candidate }) {
  const failures = [];
  if (!candidate?.sha256 || !Number.isInteger(candidate?.bytes)) {
    issue(failures, 'validator-candidate-identity', `${kind}: bound candidate identity is unavailable`);
    return { pass: false, failures };
  }
  if (record?.candidateSha256 !== candidate.sha256) {
    issue(failures, 'validator-candidate-hash', `${kind}: validator record is bound to a stale candidate hash`);
  }
  if (record?.candidateBytes !== candidate.bytes) {
    issue(failures, 'validator-candidate-bytes', `${kind}: validator record is bound to a stale candidate byte count`);
  }
  return { pass: failures.length === 0, failures };
}

export function assessValidatorReportCandidateIdentity({ kind, report, candidate }) {
  const failures = [];
  const expected = candidate ? {
    path: PQ022_REFINERY_CANDIDATE_CONTRACT.paths.candidate,
    sha256: candidate.sha256,
    bytes: candidate.bytes,
  } : null;
  if (!expected || !jsonEqual(report?.spacefaceCandidate, expected)) {
    issue(
      failures,
      'validator-report-candidate-identity',
      `${kind}: validator report does not internally identify the admitted candidate bytes`,
    );
  }
  return { pass: failures.length === 0, failures };
}

export function assessFoundryTextureReport(report) {
  const failures = [];
  const textures = Array.isArray(report?.textures) ? report.textures : [];
  const roleCounts = { baseColor: 0, normal: 0, orm: 0 };
  let invalidTextureRole = false;
  for (const texture of textures) {
    const slots = [...(Array.isArray(texture?.slots) ? texture.slots : [])].sort();
    let role = null;
    let expectedColorSpace = null;
    if (jsonEqual(slots, ['baseColorTexture'])) {
      role = 'baseColor';
      expectedColorSpace = 'sRGB';
    } else if (jsonEqual(slots, ['normalTexture'])) {
      role = 'normal';
      expectedColorSpace = 'linear';
    } else if (jsonEqual(slots, ['metallicRoughnessTexture', 'occlusionTexture'])) {
      role = 'orm';
      expectedColorSpace = 'linear';
    }
    if (!role
      || texture?.mimeType !== 'image/png'
      || texture?.colorSpaceRole !== expectedColorSpace) {
      invalidTextureRole = true;
      continue;
    }
    roleCounts[role] += 1;
  }
  if (textures.length !== MATERIAL_NAMES.length * 3
    || new Set(textures.map((texture) => texture?.name)).size !== textures.length
    || invalidTextureRole
    || !Object.values(roleCounts).every((count) => count === MATERIAL_NAMES.length)) {
    issue(failures, 'foundry-texture-facts', 'Foundry must report five unique embedded PNGs for each exact base-color, normal, and packed-ORM role');
  }
  return { pass: failures.length === 0, failures };
}

export function assessKhronosImageResources({ report, candidateGlb }) {
  const failures = [];
  const resources = Array.isArray(report?.info?.resources) ? report.info.resources : [];
  const imageResources = resources.filter((resource) => /^\/images\/\d+$/.test(resource?.pointer || ''));
  const expectedImagePointers = (candidateGlb?.json?.images || []).map((_image, index) => `/images/${index}`).sort();
  const actualImagePointers = imageResources.map((resource) => resource.pointer).sort();
  if (expectedImagePointers.length !== MATERIAL_NAMES.length * 3
    || !jsonEqual(actualImagePointers, expectedImagePointers)
    || imageResources.some((resource) => (
      resource.storage !== 'buffer-view' || resource.mimeType !== 'image/png'
    ))) {
    issue(failures, 'khronos-image-resources', 'Khronos must report the exact 15 candidate images as buffer-view-backed image/png resources');
  }
  return { pass: failures.length === 0, failures };
}

function portablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function reportedUriMatchesCandidate({ rootDir, uri, expectedPath }) {
  if (typeof uri !== 'string' || uri.length === 0) return false;
  const expectedAbsolute = portablePath(absolute(rootDir, expectedPath));
  let reported = uri;
  try {
    if (/^file:/i.test(reported)) reported = fileURLToPath(reported);
  } catch {
    return false;
  }
  const portableReported = portablePath(reported);
  if (portableReported === expectedAbsolute) return true;
  if (!path.isAbsolute(reported) && !/^[a-z]:[\\/]/i.test(reported)) {
    if (portablePath(absolute(rootDir, reported)) === expectedAbsolute) return true;
  }
  // Validator reports are retained across worktrees and machines. An absolute URI from the
  // producer remains valid when its repository-relative suffix is the exact expected candidate.
  return portableReported.endsWith(`/${portablePath(expectedPath)}`);
}

function validateValidatorReport({
  rootDir,
  failures,
  kind,
  record,
  expectedPath,
  candidateIdentity,
  candidateGlb,
  glbFacts,
}) {
  const candidateBinding = assessValidatorCandidateBinding({
    kind,
    record,
    candidate: candidateIdentity,
  });
  failures.push(...candidateBinding.failures);
  const identity = validateBoundFile({
    rootDir,
    failures,
    label: `${kind} report`,
    expectedPath,
    record: record ? { path: record.report, reportSha256: record.reportSha256 } : null,
    hashKey: 'reportSha256',
    bytesKey: null,
  });
  if (!identity) return { report: null, identity: null };
  let report;
  try {
    report = JSON.parse(identity.contents.toString('utf8'));
  } catch (error) {
    issue(failures, 'validator-json', `${kind}: ${error.message}`);
    return { report: null, identity };
  }
  failures.push(...assessValidatorReportCandidateIdentity({
    kind,
    report,
    candidate: candidateIdentity,
  }).failures);
  if (kind === 'foundry') {
    if (report.verdict?.pass !== true
      || (report.verdict?.failures || []).length !== 0
      || (report.verdict?.warnings || []).length !== 0
      || record?.outcome?.pass !== true
      || record?.outcome?.failures !== 0
      || record?.outcome?.warnings !== 0) {
      issue(failures, 'foundry-outcome', 'Foundry report and binding must record PASS with zero failures/warnings');
    }
    const totalTriangles = Object.values(glbFacts?.lodTriangles || {}).reduce((sum, value) => sum + value, 0)
      + Number(glbFacts?.collision?.triangles || 0);
    if (report.file !== path.basename(PQ022_REFINERY_CANDIDATE_CONTRACT.paths.candidate)) {
      issue(failures, 'foundry-file', `Foundry report file must name ${path.basename(PQ022_REFINERY_CANDIDATE_CONTRACT.paths.candidate)}`);
    }
    if (report.tris !== totalTriangles
      || report.materials?.count !== MATERIAL_NAMES.length
      || report.geometry?.primitives !== MATERIAL_NAMES.length * LOD_LEVELS.length + 1
      || report.geometry?.tangentPrimitives !== report.geometry?.primitives
      || report.geometry?.tangentsPresent !== true
      || !(report.geometry?.uvSets || []).includes(0)) {
      issue(failures, 'foundry-facts', 'Foundry structural facts do not match the candidate GLB');
    }
    failures.push(...assessFoundryTextureReport(report).failures);
  } else {
    const issues = report.issues;
    if (issues?.numErrors !== 0
      || issues?.numWarnings !== 0
      || issues?.numInfos !== 0
      || issues?.numHints !== 0
      || issues?.truncated !== false
      || record?.outcome?.errors !== 0
      || record?.outcome?.warnings !== 0
      || record?.outcome?.infos !== 0
      || record?.outcome?.hints !== 0) {
      issue(failures, 'khronos-outcome', 'Khronos report and binding must record zero issues without truncation');
    }
    if (!reportedUriMatchesCandidate({
      rootDir,
      uri: report.uri,
      expectedPath: PQ022_REFINERY_CANDIDATE_CONTRACT.paths.candidate,
    })) {
      issue(failures, 'khronos-uri', 'Khronos report URI does not resolve to the expected refinery candidate');
    }
    const embeddedBuffer = (report.info?.resources || []).find((resource) => (
      resource.pointer === '/buffers/0' && resource.storage === 'glb'
    ));
    if (!candidateGlb
      || !embeddedBuffer
      || embeddedBuffer.byteLength !== candidateGlb.binary.length) {
      issue(failures, 'khronos-buffer-bytes', `Khronos embedded buffer bytes ${embeddedBuffer?.byteLength} do not match candidate BIN bytes ${candidateGlb?.binary?.length}`);
    }
    failures.push(...assessKhronosImageResources({ report, candidateGlb }).failures);
  }
  return { report, identity };
}

function validateBlenderGate({ rootDir, failures, record, candidateIdentity }) {
  const contract = PQ022_REFINERY_CANDIDATE_CONTRACT;
  const identity = validateBoundFile({
    rootDir,
    failures,
    label: 'Blender export gate',
    expectedPath: contract.paths.blenderGate,
    record: record ? { path: record.report, reportSha256: record.reportSha256 } : null,
    hashKey: 'reportSha256',
    bytesKey: null,
  });
  if (!identity) return { report: null, identity: null };
  let report;
  try {
    report = JSON.parse(identity.contents.toString('utf8'));
  } catch (error) {
    issue(failures, 'blender-gate-json', error.message);
    return { report: null, identity };
  }
  const expectedCandidate = publicIdentity(candidateIdentity);
  if (report.schema !== 'spaceface.export.v1'
      || !jsonEqual(report.spacefaceCandidate, expectedCandidate)
      || report.ok !== true
      || !Array.isArray(report.errors)
      || report.errors.length !== 0
      || record?.outcome?.pass !== true
      || record?.outcome?.errors !== 0
      || record?.outcome?.diagnostics !== (report.diagnostics || []).length) {
    issue(
      failures,
      'blender-gate-outcome',
      'Blender export gate must identify the exact candidate and pass with zero errors',
    );
  }
  return { report, identity };
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

function validateRenderEvidence({ rootDir, failures, record, candidateIdentity }) {
  const contract = PQ022_REFINERY_CANDIDATE_CONTRACT;
  const identity = validateBoundFile({
    rootDir,
    failures,
    label: 'exact-source render manifest',
    expectedPath: contract.paths.renderManifest,
    record: record ? { path: record.manifest, manifestSha256: record.manifestSha256 } : null,
    hashKey: 'manifestSha256',
    bytesKey: null,
  });
  if (!identity) return { manifest: null, identity: null, files: [] };
  let manifest;
  try {
    manifest = JSON.parse(identity.contents.toString('utf8'));
  } catch (error) {
    issue(failures, 'render-manifest-json', error.message);
    return { manifest: null, identity, files: [] };
  }
  if (manifest.schema !== contract.renderManifestSchema
      || manifest.assetId !== contract.partId
      || manifest.candidateId !== contract.candidateId
      || manifest.source !== contract.paths.candidate
      || manifest.sourceSha256 !== candidateIdentity?.sha256
      || manifest.exactSourceReimport !== true
      || !jsonEqual(manifest.resolution, [1600, 900])
      || record?.exactSourceReimport !== true
      || record?.viewCount !== contract.renderViews.length) {
    issue(
      failures,
      'render-manifest-header',
      'render manifest must bind five original-resolution views to the exact admitted candidate',
    );
  }
  if (manifest.emissiveOff?.path !== contract.renderViews.at(-1)
      || manifest.emissiveOff?.onlyEmissionStrengthChanged !== true) {
    issue(failures, 'render-emissive-off', 'render manifest must bind the exact emissive-off comparison');
  }
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  if (images.length !== contract.renderViews.length
      || !jsonEqual(images.map((entry) => entry?.path), contract.renderViews)) {
    issue(failures, 'render-view-set', 'render manifest must contain the exact five ordered review views');
  }
  const files = contract.renderViews.map((expectedPath, index) => validateBoundFile({
    rootDir,
    failures,
    label: `render view ${index + 1}`,
    expectedPath,
    record: images[index],
  })).filter(Boolean);
  for (const file of files) {
    try {
      const dimensions = readPngDimensions(file.contents, file.path);
      if (!jsonEqual([dimensions.width, dimensions.height], [1600, 900])) {
        issue(failures, 'render-view-dimensions', `${file.path}: expected original 1600x900 pixels`);
      }
    } catch (error) {
      issue(failures, 'render-view-png', error.message);
    }
  }
  return { manifest, identity, files };
}

export function validateRefineryCandidate({ rootDir = process.cwd(), bindingPath } = {}) {
  const contract = PQ022_REFINERY_CANDIDATE_CONTRACT;
  const selectedBinding = bindingPath || contract.paths.binding;
  const failures = [];
  const baseline = validateRefineryBaselineIdentity({ rootDir });
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
  for (const [field, expected] of Object.entries({
    schema: contract.schema,
    packet: contract.packet,
    dispatchUnit: contract.dispatchUnit,
    candidateId: contract.candidateId,
    assetId: contract.partId,
    state: contract.candidateState,
  })) {
    if (binding?.[field] !== expected) issue(failures, 'binding-header', `${field}: expected ${expected}, got ${binding?.[field]}`);
  }
  if (!jsonEqual(binding?.claims, contract.claims)) {
    issue(failures, 'binding-claims', 'binding must remain candidate-only with no promotion, route, or performance claim');
  }

  const candidateIdentity = validateBoundFile({
    rootDir, failures, label: 'source candidate', expectedPath: contract.paths.candidate, record: binding.candidate,
  });
  const releaseMirrorIdentity = validateBoundFile({
    rootDir,
    failures,
    label: 'release candidate mirror',
    expectedPath: contract.paths.releaseMirror,
    record: binding.candidate ? {
      path: binding.candidate.releaseMirrorPath,
      sha256: binding.candidate.releaseMirrorSha256,
      bytes: binding.candidate.releaseMirrorBytes,
    } : null,
  });
  const blenderIdentity = validateBoundFile({
    rootDir, failures, label: 'Blender source', expectedPath: contract.paths.blender, record: binding.blender,
  });
  const generatorIdentity = validateBoundFile({
    rootDir,
    failures,
    label: 'source generator',
    expectedPath: contract.paths.sourceGenerator,
    record: binding.generator,
  });
  const buildReportIdentity = validateBoundFile({
    rootDir,
    failures,
    label: 'build report',
    expectedPath: contract.paths.buildReport,
    record: binding.buildReport,
    hashKey: 'reportSha256',
    bytesKey: null,
  });

  if (candidateIdentity && releaseMirrorIdentity
    && (candidateIdentity.sha256 !== releaseMirrorIdentity.sha256
      || candidateIdentity.bytes !== releaseMirrorIdentity.bytes)) {
    issue(failures, 'candidate-mirror', 'source and release candidate mirrors must be byte-identical before promotion');
  }
  if (candidateIdentity?.sha256 === contract.baseline.sourceSha256) {
    issue(failures, 'candidate-novelty', 'candidate is still the rejected live source bytes');
  }
  if (blenderIdentity?.sha256 === contract.baseline.blendSha256) {
    issue(failures, 'blender-novelty', 'Blender source is still the rejected live authoring file');
  }

  let candidateGlb = null;
  let glbAssessment = null;
  if (candidateIdentity) {
    try {
      candidateGlb = readGlb(contract.paths.candidate, { rootDir });
      if (candidateGlb.sha256 !== candidateIdentity.sha256
          || candidateGlb.bytes !== candidateIdentity.bytes) {
        issue(failures, 'candidate-raced', 'candidate changed while its admission was being measured');
      }
      glbAssessment = assessRefineryCandidateGlb(candidateGlb);
      failures.push(...glbAssessment.failures);
      const stamp = candidateGlb.json.asset?.extras?.spacefaceAsset;
      if (!generatorIdentity
        || stamp?.sourceGeneratorSha256 !== generatorIdentity.sha256
        || stamp?.sourceGeneratorBytes !== generatorIdentity.bytes) {
        issue(failures, 'candidate-generator-binding', 'candidate stamp is not bound to the admitted source-generator bytes');
      }
    } catch (error) {
      issue(failures, 'candidate-glb', error.message);
    }
  }
  const budget = assessRefineryBudget({
    bytes: candidateIdentity?.bytes,
    lodTriangles: glbAssessment?.facts?.lodTriangles,
  });
  for (const detail of budget.failures) issue(failures, 'budget', detail);

  let buildReport = null;
  let buildReportPass = false;
  if (buildReportIdentity) {
    try {
      buildReport = JSON.parse(buildReportIdentity.contents.toString('utf8'));
      const buildAssessment = assessRefineryBuildReport({
        report: buildReport,
        candidate: candidateIdentity,
        releaseMirror: releaseMirrorIdentity,
        blender: blenderIdentity,
        generator: generatorIdentity,
        glbFacts: glbAssessment?.facts,
      });
      failures.push(...buildAssessment.failures);
      buildReportPass = buildAssessment.pass;
    } catch (error) {
      issue(failures, 'build-report-json', error.message);
    }
  }

  const foundry = validateValidatorReport({
    rootDir,
    failures,
    kind: 'foundry',
    record: binding.validators?.foundry,
    expectedPath: contract.paths.foundryReport,
    candidateIdentity,
    candidateGlb,
    glbFacts: glbAssessment?.facts,
  });
  const khronos = validateValidatorReport({
    rootDir,
    failures,
    kind: 'khronos',
    record: binding.validators?.khronos,
    expectedPath: contract.paths.khronosReport,
    candidateIdentity,
    candidateGlb,
    glbFacts: glbAssessment?.facts,
  });
  const blenderGate = validateBlenderGate({
    rootDir,
    failures,
    record: binding.blenderGate,
    candidateIdentity,
  });
  const renderEvidence = validateRenderEvidence({
    rootDir,
    failures,
    record: binding.renderEvidence,
    candidateIdentity,
  });

  return {
    schema: contract.reportSchema,
    pass: failures.length === 0,
    failures,
    facts: {
      bindingPath: selectedBinding,
      baseline: baseline.facts,
      binding: publicIdentity(bindingIdentity),
      candidate: publicIdentity(candidateIdentity),
      releaseMirror: publicIdentity(releaseMirrorIdentity),
      blender: publicIdentity(blenderIdentity),
      generator: publicIdentity(generatorIdentity),
      buildReport: publicIdentity(buildReportIdentity),
      foundryReport: publicIdentity(foundry.identity),
      khronosReport: publicIdentity(khronos.identity),
      blenderGate: publicIdentity(blenderGate.identity),
      renderManifest: publicIdentity(renderEvidence.identity),
      renderFiles: renderEvidence.files.map(publicIdentity),
      glb: glbAssessment?.facts || null,
      buildReportPass,
      foundryPass: foundry.report?.verdict?.pass === true,
      khronosIssues: khronos.report?.issues || null,
    },
  };
}
