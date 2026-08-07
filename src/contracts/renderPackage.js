// Versioned contract for deterministic, generated render packages.
// Authored GLBs and semantic manifests remain source truth; this schema describes derived runtime data.

export const RENDER_PACKAGE_SCHEMA = 'spaceface.renderPackage.v1';
export const RENDER_PACKAGE_SOURCE_SCHEMA = 'spaceface.renderPackageSource.v1';
export const RENDER_PACKAGE_VALIDATION_RESULT_SCHEMA = 'spaceface.renderPackageValidationResult.v1';
export const RENDER_PACKAGE_COMPILER_NAME = 'spaceface-render-package-compiler';
export const RENDER_PACKAGE_COMPILER_VERSION = '1.0.0';
export const RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY = 'spacefaceRenderPackageSemantic';
export const RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA = 'spaceface.renderPackageSemantic.v1';

const ID_RE = /^[a-z][a-z0-9_.:-]*$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ASSET_KINDS = new Set(['ship', 'place', 'part', 'prop', 'fixture']);
const NODE_ROLES = new Set(['immutable', 'dynamic']);
const TRANSPARENCY_MODES = new Set(['opaque', 'mask', 'blend']);
const ANCHOR_KINDS = new Set([
  'socket', 'hardpoint', 'docking', 'trail', 'light', 'effect', 'shadow', 'canopy', 'custom',
]);
const DYNAMIC_GROUP_KINDS = new Set(['moving-part', 'dynamic-surface', 'auxiliary-surface', 'custom']);

const PACKAGE_KEYS = new Set([
  'schema', 'assetId', 'kind', 'compiler', 'contentHash', 'render', 'provenance',
  'nodes', 'anchors', 'dynamicGroups', 'geometry', 'materials', 'lods', 'hlods',
  'collisions', 'spatialClusters',
  // Optional v2 runtime table: the precompiled blueprint the shipping loader binds instead of
  // recompiling from the decoded graph. Deliberately outside renderPackageContentIdentity, so a
  // package gains it without disturbing contentHash or any expectedContentHash binding.
  'runtime',
]);
const COMPILER_KEYS = new Set(['name', 'version']);
const RENDER_KEYS = new Set(['uri', 'sha256', 'bytes']);
const PROVENANCE_KEYS = new Set(['sourceGlb', 'sourceManifest', 'semantics']);
const PROVENANCE_FILE_KEYS = new Set(['uri', 'sha256', 'bytes']);
const PROVENANCE_SEMANTICS_KEYS = new Set(['sha256']);
const NODE_KEYS = new Set([
  'id', 'nodeName', 'nodePath', 'role', 'parentId', 'localTransform', 'worldTransform',
  'materialPipelineKey', 'spatialClusterId', 'mergeBoundary',
]);
const ANCHOR_KEYS = new Set([
  'id', 'nodeName', 'nodePath', 'kind', 'parentNodeId', 'localTransform', 'worldTransform',
]);
const DYNAMIC_GROUP_KEYS = new Set(['id', 'nodeId', 'kind']);
const GEOMETRY_KEYS = new Set([
  'id', 'nodeId', 'meshName', 'primitiveIndex', 'indexed', 'vertexCount', 'indexCount',
  'drawMode', 'geometryHash', 'materialHash', 'materialPipelineKey', 'bounds',
]);
const MATERIAL_KEYS = new Set(['id', 'name', 'hash', 'pipelineKey', 'textures']);
const TEXTURE_KEYS = new Set(['slot', 'name', 'uri', 'colorSpace']);
const DISTANCE_RECORD_KEYS = new Set(['id', 'nodeId', 'distance']);
const COLLISION_KEYS = new Set(['id', 'nodeId', 'reference']);
const SPATIAL_CLUSTER_KEYS = new Set(['id', 'nodeIds', 'bounds']);
const BOUNDS_KEYS = new Set(['min', 'max']);

const SOURCE_KEYS = new Set([
  'schema', 'assetId', 'kind', 'semanticNodes', 'anchors', 'dynamicGroups', 'mergeGroups',
  'lods', 'hlods', 'collisions',
]);
const SOURCE_NODE_KEYS = new Set([
  'id', 'node', 'role', 'parentId', 'mergeBoundary', 'pipelineKey', 'transparency',
  'cullingGroup', 'independentlyCulled', 'spatialClusterId',
]);
const SOURCE_ANCHOR_KEYS = new Set(['id', 'node', 'kind', 'parentNodeId']);
const SOURCE_DYNAMIC_GROUP_KEYS = new Set(['id', 'nodeId', 'kind']);
const SOURCE_MERGE_GROUP_KEYS = new Set(['id', 'nodeIds']);
const SOURCE_DISTANCE_KEYS = new Set(['id', 'nodeId', 'distance']);
const SOURCE_COLLISION_KEYS = new Set(['id', 'nodeId', 'reference']);

export function validateRenderPackage(value, options = {}) {
  const issues = [];
  const file = options.file || null;
  const issue = (path, rule, message) => issues.push({ path, rule, message, ...(file ? { file } : {}) });

  if (!isPlainObject(value)) {
    issue('$', 'type', 'render package must be a plain object');
    return validationResult(issues);
  }

  rejectUnknownKeys(value, PACKAGE_KEYS, '$', issue);
  if (value.schema !== RENDER_PACKAGE_SCHEMA) issue('$.schema', 'schema', `expected ${RENDER_PACKAGE_SCHEMA}`);
  validateId(value.assetId, '$.assetId', issue);
  if (!ASSET_KINDS.has(value.kind)) issue('$.kind', 'enum', `kind must be one of: ${[...ASSET_KINDS].join(', ')}`);
  validateCompiler(value.compiler, '$.compiler', issue);
  validateSha256(value.contentHash, '$.contentHash', issue);
  validateRenderFile(value.render, '$.render', issue);
  validateProvenance(value.provenance, '$.provenance', issue);

  const nodes = validateArray(value.nodes, '$.nodes', issue);
  const anchors = validateArray(value.anchors, '$.anchors', issue);
  const dynamicGroups = validateArray(value.dynamicGroups, '$.dynamicGroups', issue);
  const geometry = validateArray(value.geometry, '$.geometry', issue);
  const materials = validateArray(value.materials, '$.materials', issue);
  const lods = validateArray(value.lods, '$.lods', issue);
  const hlods = validateArray(value.hlods, '$.hlods', issue);
  const collisions = validateArray(value.collisions, '$.collisions', issue);
  const spatialClusters = validateArray(value.spatialClusters, '$.spatialClusters', issue);

  const nodeIds = validateRecords(nodes, '$.nodes', NODE_KEYS, validateNode, issue);
  const anchorIds = validateRecords(anchors, '$.anchors', ANCHOR_KEYS, validateAnchor, issue);
  const dynamicGroupIds = validateRecords(dynamicGroups, '$.dynamicGroups', DYNAMIC_GROUP_KEYS, validateDynamicGroup, issue);
  const geometryIds = validateRecords(geometry, '$.geometry', GEOMETRY_KEYS, validateGeometry, issue);
  const materialIds = validateRecords(materials, '$.materials', MATERIAL_KEYS, validateMaterial, issue);
  const lodIds = validateRecords(lods, '$.lods', DISTANCE_RECORD_KEYS, validateDistanceRecord, issue);
  const hlodIds = validateRecords(hlods, '$.hlods', DISTANCE_RECORD_KEYS, validateDistanceRecord, issue);
  const collisionIds = validateRecords(collisions, '$.collisions', COLLISION_KEYS, validateCollision, issue);
  const clusterIds = validateRecords(spatialClusters, '$.spatialClusters', SPATIAL_CLUSTER_KEYS, validateSpatialCluster, issue);

  const globalIds = new Set();
  for (const [path, ids] of [
    ['$.nodes', nodeIds], ['$.anchors', anchorIds], ['$.dynamicGroups', dynamicGroupIds],
    ['$.geometry', geometryIds], ['$.materials', materialIds], ['$.lods', lodIds],
    ['$.hlods', hlodIds], ['$.collisions', collisionIds], ['$.spatialClusters', clusterIds],
  ]) {
    for (const id of ids) {
      if (globalIds.has(id)) issue(path, 'duplicate-id', `id ${id} must be globally unique`);
      globalIds.add(id);
    }
  }

  const nodeIdSet = new Set(nodeIds);
  const clusterIdSet = new Set(clusterIds);
  for (const [index, node] of nodes.entries()) {
    if (!isPlainObject(node)) continue;
    if (node.parentId != null && !nodeIdSet.has(node.parentId)) {
      issue(`$.nodes[${index}].parentId`, 'reference', `unknown node ${node.parentId}`);
    }
    if (typeof node.spatialClusterId === 'string' && !clusterIdSet.has(node.spatialClusterId)) {
      issue(`$.nodes[${index}].spatialClusterId`, 'reference', `unknown spatial cluster ${node.spatialClusterId}`);
    }
  }
  for (const [index, anchor] of anchors.entries()) {
    if (isPlainObject(anchor) && !nodeIdSet.has(anchor.parentNodeId)) {
      issue(`$.anchors[${index}].parentNodeId`, 'reference', `unknown node ${anchor.parentNodeId}`);
    }
  }
  for (const [index, group] of dynamicGroups.entries()) {
    if (isPlainObject(group) && !nodeIdSet.has(group.nodeId)) {
      issue(`$.dynamicGroups[${index}].nodeId`, 'reference', `unknown node ${group.nodeId}`);
    }
  }
  for (const [collectionName, records] of [
    ['geometry', geometry], ['lods', lods], ['hlods', hlods], ['collisions', collisions],
  ]) {
    for (const [index, record] of records.entries()) {
      if (isPlainObject(record) && !nodeIdSet.has(record.nodeId)) {
        issue(`$.${collectionName}[${index}].nodeId`, 'reference', `unknown node ${record.nodeId}`);
      }
    }
  }
  for (const [index, cluster] of spatialClusters.entries()) {
    if (!isPlainObject(cluster) || !Array.isArray(cluster.nodeIds)) continue;
    for (const [nodeIndex, nodeId] of cluster.nodeIds.entries()) {
      if (!nodeIdSet.has(nodeId)) {
        issue(`$.spatialClusters[${index}].nodeIds[${nodeIndex}]`, 'reference', `unknown node ${nodeId}`);
      }
    }
  }

  return validationResult(issues);
}

export function assertValidRenderPackage(value, options = {}) {
  const result = validateRenderPackage(value, options);
  if (result.ok) return value;
  const summary = [...new Set(result.issues.map((entry) => entry.rule))].join(', ');
  const error = new Error(`Render package validation failed: ${summary}`);
  error.name = 'RenderPackageValidationError';
  error.issues = result.issues;
  throw error;
}

export function validateRenderPackageSource(value, options = {}) {
  const issues = [];
  const file = options.file || null;
  const issue = (path, rule, message) => issues.push({ path, rule, message, ...(file ? { file } : {}) });
  if (!isPlainObject(value)) {
    issue('$', 'type', 'render package source manifest must be a plain object');
    return validationResult(issues);
  }
  rejectUnknownKeys(value, SOURCE_KEYS, '$', issue);
  if (value.schema !== RENDER_PACKAGE_SOURCE_SCHEMA) issue('$.schema', 'schema', `expected ${RENDER_PACKAGE_SOURCE_SCHEMA}`);
  validateId(value.assetId, '$.assetId', issue);
  if (!ASSET_KINDS.has(value.kind)) issue('$.kind', 'enum', `kind must be one of: ${[...ASSET_KINDS].join(', ')}`);

  const semanticNodes = validateArray(value.semanticNodes, '$.semanticNodes', issue);
  const anchors = validateArray(value.anchors, '$.anchors', issue);
  const dynamicGroups = validateArray(value.dynamicGroups, '$.dynamicGroups', issue);
  const mergeGroups = validateArray(value.mergeGroups, '$.mergeGroups', issue);
  const lods = validateArray(value.lods, '$.lods', issue);
  const hlods = validateArray(value.hlods, '$.hlods', issue);
  const collisions = validateArray(value.collisions, '$.collisions', issue);

  const nodeIds = validateRecords(semanticNodes, '$.semanticNodes', SOURCE_NODE_KEYS, validateSourceNode, issue);
  const nodeSet = new Set(nodeIds);
  const allIds = new Set(nodeIds);
  for (const [path, records, keys, validator] of [
    ['$.anchors', anchors, SOURCE_ANCHOR_KEYS, validateSourceAnchor],
    ['$.dynamicGroups', dynamicGroups, SOURCE_DYNAMIC_GROUP_KEYS, validateSourceDynamicGroup],
    ['$.mergeGroups', mergeGroups, SOURCE_MERGE_GROUP_KEYS, validateSourceMergeGroup],
    ['$.lods', lods, SOURCE_DISTANCE_KEYS, validateDistanceRecord],
    ['$.hlods', hlods, SOURCE_DISTANCE_KEYS, validateDistanceRecord],
    ['$.collisions', collisions, SOURCE_COLLISION_KEYS, validateCollision],
  ]) {
    const ids = validateRecords(records, path, keys, validator, issue);
    for (const id of ids) {
      if (allIds.has(id)) issue(path, 'duplicate-id', `id ${id} must be globally unique`);
      allIds.add(id);
    }
  }

  for (const [index, node] of semanticNodes.entries()) {
    if (isPlainObject(node) && node.parentId != null && !nodeSet.has(node.parentId)) {
      issue(`$.semanticNodes[${index}].parentId`, 'reference', `unknown node ${node.parentId}`);
    }
  }
  for (const [index, anchor] of anchors.entries()) {
    if (isPlainObject(anchor) && !nodeSet.has(anchor.parentNodeId)) {
      issue(`$.anchors[${index}].parentNodeId`, 'reference', `unknown node ${anchor.parentNodeId}`);
    }
  }
  for (const [collection, records] of [
    ['dynamicGroups', dynamicGroups], ['lods', lods], ['hlods', hlods], ['collisions', collisions],
  ]) {
    for (const [index, record] of records.entries()) {
      if (isPlainObject(record) && !nodeSet.has(record.nodeId)) {
        issue(`$.${collection}[${index}].nodeId`, 'reference', `unknown node ${record.nodeId}`);
      }
    }
  }
  for (const [index, group] of mergeGroups.entries()) {
    if (!isPlainObject(group) || !Array.isArray(group.nodeIds)) continue;
    for (const [nodeIndex, nodeId] of group.nodeIds.entries()) {
      if (!nodeSet.has(nodeId)) {
        issue(`$.mergeGroups[${index}].nodeIds[${nodeIndex}]`, 'reference', `unknown node ${nodeId}`);
      }
    }
  }
  return validationResult(issues);
}

export function assertValidRenderPackageSource(value, options = {}) {
  const result = validateRenderPackageSource(value, options);
  if (result.ok) return value;
  const summary = [...new Set(result.issues.map((entry) => entry.rule))].join(', ');
  const error = new Error(`Render package source validation failed: ${summary}`);
  error.name = 'RenderPackageSourceValidationError';
  error.issues = result.issues;
  throw error;
}

export function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isPlainObject(value)) return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = stableJsonValue(value[key]);
  return output;
}

export function stableJsonStringify(value, space = 0) {
  return JSON.stringify(stableJsonValue(value), null, space);
}

export function renderPackageContentIdentity(value) {
  if (!isPlainObject(value)) throw new TypeError('Render package content identity requires a plain object.');
  const render = isPlainObject(value.render) ? value.render : {};
  const provenance = isPlainObject(value.provenance) ? value.provenance : {};
  const sourceGlb = isPlainObject(provenance.sourceGlb) ? provenance.sourceGlb : {};
  const sourceManifest = isPlainObject(provenance.sourceManifest) ? provenance.sourceManifest : null;
  const semantics = isPlainObject(provenance.semantics) ? provenance.semantics : {};
  return stableJsonValue({
    schema: value.schema,
    assetId: value.assetId,
    kind: value.kind,
    compiler: value.compiler,
    render: {
      sha256: render.sha256,
      bytes: render.bytes,
    },
    provenance: {
      sourceGlb: {
        sha256: sourceGlb.sha256,
        bytes: sourceGlb.bytes,
      },
      sourceManifest: sourceManifest ? {
        sha256: sourceManifest.sha256,
        bytes: sourceManifest.bytes,
      } : null,
      semantics: { sha256: semantics.sha256 },
    },
    nodes: value.nodes,
    anchors: value.anchors,
    dynamicGroups: value.dynamicGroups,
    geometry: value.geometry,
    materials: value.materials,
    lods: value.lods,
    hlods: value.hlods,
    collisions: value.collisions,
    spatialClusters: value.spatialClusters,
  });
}

export async function computeRenderPackageContentHash(value, options = {}) {
  const encoded = new TextEncoder().encode(stableJsonStringify(renderPackageContentIdentity(value)));
  const digestImpl = typeof options.digest === 'function' ? options.digest : null;
  let digest;
  if (digestImpl) {
    digest = await digestImpl(encoded);
  } else {
    const cryptoImpl = options.crypto || globalThis.crypto;
    if (!cryptoImpl?.subtle) throw new Error('Web Crypto SHA-256 is required to verify render packages.');
    digest = await cryptoImpl.subtle.digest('SHA-256', encoded);
  }
  if (typeof digest === 'string') {
    if (!SHA256_RE.test(digest)) throw new Error('Render package digest callback returned an invalid SHA-256 value.');
    return digest;
  }
  const bytes = ArrayBuffer.isView(digest)
    ? new Uint8Array(digest.buffer, digest.byteOffset, digest.byteLength)
    : digest instanceof ArrayBuffer
      ? new Uint8Array(digest)
      : null;
  if (!bytes || bytes.byteLength !== 32) {
    throw new Error('Render package digest callback must return SHA-256 hex or 32 digest bytes.');
  }
  return [...bytes].map((entry) => entry.toString(16).padStart(2, '0')).join('');
}

function validateCompiler(value, path, issue) {
  if (!isPlainObject(value)) return issue(path, 'type', 'compiler must be a plain object');
  rejectUnknownKeys(value, COMPILER_KEYS, path, issue);
  if (value.name !== RENDER_PACKAGE_COMPILER_NAME) issue(`${path}.name`, 'compiler', `expected ${RENDER_PACKAGE_COMPILER_NAME}`);
  if (typeof value.version !== 'string' || !value.version) issue(`${path}.version`, 'type', 'compiler version must be a non-empty string');
}

function validateRenderFile(value, path, issue) {
  if (!isPlainObject(value)) return issue(path, 'type', 'render must be a plain object');
  rejectUnknownKeys(value, RENDER_KEYS, path, issue);
  validateUri(value.uri, `${path}.uri`, issue);
  validateSha256(value.sha256, `${path}.sha256`, issue);
  validateByteCount(value.bytes, `${path}.bytes`, issue);
}

function validateProvenance(value, path, issue) {
  if (!isPlainObject(value)) return issue(path, 'type', 'provenance must be a plain object');
  rejectUnknownKeys(value, PROVENANCE_KEYS, path, issue);
  validateProvenanceFile(value.sourceGlb, `${path}.sourceGlb`, issue);
  if (value.sourceManifest != null) validateProvenanceFile(value.sourceManifest, `${path}.sourceManifest`, issue);
  if (!isPlainObject(value.semantics)) issue(`${path}.semantics`, 'type', 'semantics provenance must be a plain object');
  else {
    rejectUnknownKeys(value.semantics, PROVENANCE_SEMANTICS_KEYS, `${path}.semantics`, issue);
    validateSha256(value.semantics.sha256, `${path}.semantics.sha256`, issue);
  }
}

function validateProvenanceFile(value, path, issue) {
  if (!isPlainObject(value)) return issue(path, 'type', 'provenance file must be a plain object');
  rejectUnknownKeys(value, PROVENANCE_FILE_KEYS, path, issue);
  validateUri(value.uri, `${path}.uri`, issue);
  validateSha256(value.sha256, `${path}.sha256`, issue);
  validateByteCount(value.bytes, `${path}.bytes`, issue);
}

function validateNode(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateName(value.nodeName, `${path}.nodeName`, issue);
  validateNodePath(value.nodePath, `${path}.nodePath`, issue);
  if (!NODE_ROLES.has(value.role)) issue(`${path}.role`, 'enum', 'node role must be immutable or dynamic');
  if (value.parentId != null) validateId(value.parentId, `${path}.parentId`, issue);
  validateMatrix(value.localTransform, `${path}.localTransform`, issue);
  validateMatrix(value.worldTransform, `${path}.worldTransform`, issue);
  validateName(value.materialPipelineKey, `${path}.materialPipelineKey`, issue);
  validateId(value.spatialClusterId, `${path}.spatialClusterId`, issue);
  validateName(value.mergeBoundary, `${path}.mergeBoundary`, issue);
}

function validateAnchor(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateName(value.nodeName, `${path}.nodeName`, issue);
  validateNodePath(value.nodePath, `${path}.nodePath`, issue);
  if (!ANCHOR_KINDS.has(value.kind)) issue(`${path}.kind`, 'enum', `anchor kind must be one of: ${[...ANCHOR_KINDS].join(', ')}`);
  validateId(value.parentNodeId, `${path}.parentNodeId`, issue);
  validateMatrix(value.localTransform, `${path}.localTransform`, issue);
  validateMatrix(value.worldTransform, `${path}.worldTransform`, issue);
}

function validateDynamicGroup(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateId(value.nodeId, `${path}.nodeId`, issue);
  if (!DYNAMIC_GROUP_KINDS.has(value.kind)) issue(`${path}.kind`, 'enum', `dynamic group kind must be one of: ${[...DYNAMIC_GROUP_KINDS].join(', ')}`);
}

function validateGeometry(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateId(value.nodeId, `${path}.nodeId`, issue);
  validateName(value.meshName, `${path}.meshName`, issue);
  validateNonNegativeInteger(value.primitiveIndex, `${path}.primitiveIndex`, issue);
  if (typeof value.indexed !== 'boolean') issue(`${path}.indexed`, 'type', 'indexed must be boolean');
  validateNonNegativeInteger(value.vertexCount, `${path}.vertexCount`, issue);
  validateNonNegativeInteger(value.indexCount, `${path}.indexCount`, issue);
  validateNonNegativeInteger(value.drawMode, `${path}.drawMode`, issue);
  validateSha256(value.geometryHash, `${path}.geometryHash`, issue);
  if (value.materialHash != null) validateSha256(value.materialHash, `${path}.materialHash`, issue);
  validateName(value.materialPipelineKey, `${path}.materialPipelineKey`, issue);
  validateBounds(value.bounds, `${path}.bounds`, issue, false);
}

function validateMaterial(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateName(value.name, `${path}.name`, issue, true);
  validateSha256(value.hash, `${path}.hash`, issue);
  validateName(value.pipelineKey, `${path}.pipelineKey`, issue);
  const textures = validateArray(value.textures, `${path}.textures`, issue);
  for (const [index, texture] of textures.entries()) {
    const texturePath = `${path}.textures[${index}]`;
    if (!isPlainObject(texture)) {
      issue(texturePath, 'type', 'texture reference must be a plain object');
      continue;
    }
    rejectUnknownKeys(texture, TEXTURE_KEYS, texturePath, issue);
    validateName(texture.slot, `${texturePath}.slot`, issue);
    validateName(texture.name, `${texturePath}.name`, issue, true);
    if (texture.uri != null) validateUri(texture.uri, `${texturePath}.uri`, issue);
    if (texture.colorSpace != null && typeof texture.colorSpace !== 'string') issue(`${texturePath}.colorSpace`, 'type', 'colorSpace must be a string or null');
  }
}

function validateDistanceRecord(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateId(value.nodeId, `${path}.nodeId`, issue);
  if (typeof value.distance !== 'number' || !Number.isFinite(value.distance) || value.distance < 0) {
    issue(`${path}.distance`, 'type', 'distance must be a finite non-negative number');
  }
}

function validateCollision(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateId(value.nodeId, `${path}.nodeId`, issue);
  validateName(value.reference, `${path}.reference`, issue);
}

function validateSpatialCluster(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  const nodeIds = validateArray(value.nodeIds, `${path}.nodeIds`, issue);
  for (const [index, nodeId] of nodeIds.entries()) validateId(nodeId, `${path}.nodeIds[${index}]`, issue);
  validateBounds(value.bounds, `${path}.bounds`, issue, true);
}

function validateSourceNode(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateName(value.node, `${path}.node`, issue);
  if (!NODE_ROLES.has(value.role)) issue(`${path}.role`, 'enum', 'node role must be immutable or dynamic');
  if (value.parentId != null) validateId(value.parentId, `${path}.parentId`, issue);
  validateName(value.mergeBoundary, `${path}.mergeBoundary`, issue);
  validateName(value.pipelineKey, `${path}.pipelineKey`, issue);
  if (!TRANSPARENCY_MODES.has(value.transparency)) issue(`${path}.transparency`, 'enum', 'transparency must be opaque, mask, or blend');
  validateName(value.cullingGroup, `${path}.cullingGroup`, issue);
  if (value.independentlyCulled != null && typeof value.independentlyCulled !== 'boolean') issue(`${path}.independentlyCulled`, 'type', 'independentlyCulled must be boolean');
  validateId(value.spatialClusterId, `${path}.spatialClusterId`, issue);
}

function validateSourceAnchor(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateName(value.node, `${path}.node`, issue);
  if (!ANCHOR_KINDS.has(value.kind)) issue(`${path}.kind`, 'enum', `anchor kind must be one of: ${[...ANCHOR_KINDS].join(', ')}`);
  validateId(value.parentNodeId, `${path}.parentNodeId`, issue);
}

function validateSourceDynamicGroup(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  validateId(value.nodeId, `${path}.nodeId`, issue);
  if (!DYNAMIC_GROUP_KINDS.has(value.kind)) issue(`${path}.kind`, 'enum', `dynamic group kind must be one of: ${[...DYNAMIC_GROUP_KINDS].join(', ')}`);
}

function validateSourceMergeGroup(value, path, issue) {
  validateId(value.id, `${path}.id`, issue);
  const nodeIds = validateArray(value.nodeIds, `${path}.nodeIds`, issue);
  if (nodeIds.length < 1) issue(`${path}.nodeIds`, 'min-items', 'merge group must name at least one node');
  for (const [index, nodeId] of nodeIds.entries()) validateId(nodeId, `${path}.nodeIds[${index}]`, issue);
}

function validateRecords(records, path, keys, validator, issue) {
  const ids = [];
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    const recordPath = `${path}[${index}]`;
    if (!isPlainObject(record)) {
      issue(recordPath, 'type', 'record must be a plain object');
      continue;
    }
    rejectUnknownKeys(record, keys, recordPath, issue);
    validator(record, recordPath, issue);
    if (typeof record.id === 'string') {
      if (seen.has(record.id)) issue(`${recordPath}.id`, 'duplicate-id', `duplicate id ${record.id}`);
      seen.add(record.id);
      ids.push(record.id);
    }
  }
  return ids;
}

function validateArray(value, path, issue) {
  if (!Array.isArray(value)) {
    issue(path, 'type', 'expected array');
    return [];
  }
  return value;
}

function validateBounds(value, path, issue, nullable) {
  if (nullable && value == null) return;
  if (!isPlainObject(value)) return issue(path, 'type', 'bounds must be a plain object');
  rejectUnknownKeys(value, BOUNDS_KEYS, path, issue);
  validateVector(value.min, `${path}.min`, issue);
  validateVector(value.max, `${path}.max`, issue);
}

function validateVector(value, path, issue) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    issue(path, 'type', 'expected three finite numbers');
  }
}

function validateMatrix(value, path, issue) {
  if (!Array.isArray(value) || value.length !== 16 || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    issue(path, 'type', 'expected 16 finite matrix elements');
  }
}

function validateNodePath(value, path, issue) {
  if (!Array.isArray(value) || value.some((entry) => !Number.isInteger(entry) || entry < 0)) {
    issue(path, 'type', 'nodePath must contain non-negative integer child indices');
  }
}

function validateId(value, path, issue) {
  if (typeof value !== 'string' || !ID_RE.test(value)) issue(path, 'id', 'id must match [a-z][a-z0-9_.:-]*');
}

function validateName(value, path, issue, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) issue(path, 'type', allowEmpty ? 'must be a string' : 'must be a non-empty string');
}

function validateUri(value, path, issue) {
  if (typeof value !== 'string' || !value || value.includes('\\')) issue(path, 'uri', 'uri must be a non-empty forward-slash path or URL');
}

function validateSha256(value, path, issue) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) issue(path, 'sha256', 'expected lowercase SHA-256 hex');
}

function validateByteCount(value, path, issue) {
  validateNonNegativeInteger(value, path, issue);
}

function validateNonNegativeInteger(value, path, issue) {
  if (!Number.isSafeInteger(value) || value < 0) issue(path, 'type', 'expected a non-negative safe integer');
}

function rejectUnknownKeys(value, allowed, path, issue) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issue(`${path}.${key}`, 'unknown-key', `unknown field ${key}`);
  }
}

function validationResult(issues) {
  return {
    schema: RENDER_PACKAGE_VALIDATION_RESULT_SCHEMA,
    ok: issues.length === 0,
    issues,
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
