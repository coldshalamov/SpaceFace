import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { Accessor, Logger, NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  compactPrimitive,
  joinPrimitives,
  prune,
  reorder,
  transformPrimitive,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

import {
  RENDER_PACKAGE_COMPILER_NAME,
  RENDER_PACKAGE_COMPILER_VERSION,
  RENDER_PACKAGE_SCHEMA,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
  assertValidRenderPackage,
  assertValidRenderPackageSource,
  computeRenderPackageContentHash,
  stableJsonStringify,
  stableJsonValue,
} from '../../src/contracts/renderPackage.js';

const RENDER_FILE_NAME = 'render.glb';
const METADATA_FILE_NAME = 'render-package.json';
const IDENTITY_MATRIX = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const JOIN_SAFE_PRIMITIVE_MODES = new Set([0, 1, 4]);
const BAKE_POSITION_COMPONENT_TYPES = new Set([
  Accessor.ComponentType.BYTE,
  Accessor.ComponentType.UNSIGNED_BYTE,
  Accessor.ComponentType.SHORT,
  Accessor.ComponentType.UNSIGNED_SHORT,
  Accessor.ComponentType.FLOAT,
]);

let toolchainReady = null;

export async function compileRenderPackage(options = {}) {
  const assetId = String(options.assetId || '');
  const sourceGlbPath = resolveRequiredPath(options.sourceGlbPath, 'sourceGlbPath');
  const outputDir = resolveRequiredPath(options.outputDir, 'outputDir');
  const sourceManifestPath = options.sourceManifestPath ? resolve(options.sourceManifestPath) : null;
  const semanticManifest = normalizeSemanticManifest(options.semanticManifest);

  if (assetId !== semanticManifest.assetId) {
    throw new Error(`Render package assetId mismatch: ${assetId || '(missing)'} != ${semanticManifest.assetId}`);
  }
  assertSafeMergeBoundaries(semanticManifest);

  const renderPath = resolve(outputDir, RENDER_FILE_NAME);
  const metadataPath = resolve(outputDir, METADATA_FILE_NAME);
  if (renderPath === sourceGlbPath || metadataPath === sourceGlbPath) {
    throw new Error('Render package output must not overwrite the authored source GLB.');
  }

  const [sourceBytes, legacySourceManifestBytes] = await Promise.all([
    readFile(sourceGlbPath),
    sourceManifestPath ? readFile(sourceManifestPath) : Promise.resolve(null),
  ]);
  const sourceManifestProvenance = resolveSourceManifestProvenance(
    options.sourceProvenance,
    sourceManifestPath,
    legacySourceManifestBytes,
    options.sourceManifestUri,
  );
  const io = await createIo();
  const document = await io.readBinary(new Uint8Array(sourceBytes));
  document.setLogger(new Logger(Logger.Verbosity.SILENT));
  const resolvedNodes = resolveSourceNodes(document, semanticManifest);
  await prepareRenderDocument(document, semanticManifest, resolvedNodes);

  await document.transform(
    weld({ overwrite: true }),
    reorder({ encoder: MeshoptEncoder, target: 'performance', cleanup: true }),
  );
  stampSemanticLocators(semanticManifest, resolvedNodes);

  const renderBytes = Buffer.from(await io.writeBinary(document));
  const renderHash = sha256(renderBytes);
  const sourceHash = sha256(sourceBytes);
  const semanticsHash = sha256(Buffer.from(stableJsonStringify(semanticManifest)));
  const compiled = compileMetadataRecords(semanticManifest, resolvedNodes);

  const metadataWithoutHash = stableJsonValue({
    schema: RENDER_PACKAGE_SCHEMA,
    assetId,
    kind: semanticManifest.kind,
    compiler: {
      name: RENDER_PACKAGE_COMPILER_NAME,
      version: RENDER_PACKAGE_COMPILER_VERSION,
    },
    render: {
      uri: RENDER_FILE_NAME,
      sha256: renderHash,
      bytes: renderBytes.length,
    },
    provenance: {
      sourceGlb: {
        uri: normalizeUri(options.sourceUri || basename(sourceGlbPath)),
        sha256: sourceHash,
        bytes: sourceBytes.length,
      },
      // Package-pilot builds provide a canonical row-local binding here. Generic compiler callers
      // may retain a file-level source manifest, but the package builder must never fingerprint its
      // global index as the provenance of every unrelated package.
      sourceManifest: sourceManifestProvenance,
      semantics: { sha256: semanticsHash },
    },
    ...compiled,
  });
  const contentHash = await computeRenderPackageContentHash(metadataWithoutHash, {
    digest: (bytes) => sha256(Buffer.from(bytes)),
  });
  const metadata = stableJsonValue({
    ...metadataWithoutHash,
    contentHash,
  });
  assertValidRenderPackage(metadata, { file: metadataPath });

  const metadataBytes = Buffer.from(`${stableJsonStringify(metadata, 2)}\n`);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(renderPath, renderBytes),
    writeFile(metadataPath, metadataBytes),
  ]);

  return Object.freeze({
    package: metadata,
    renderPath,
    metadataPath,
    renderBytes: renderBytes.length,
    metadataBytes: metadataBytes.length,
  });
}

export function normalizeSemanticManifest(value) {
  assertValidRenderPackageSource(value);
  const normalized = {
    schema: value.schema,
    assetId: value.assetId,
    kind: value.kind,
    semanticNodes: value.semanticNodes.map((entry) => ({
      id: entry.id,
      node: entry.node,
      role: entry.role,
      parentId: entry.parentId ?? null,
      mergeBoundary: entry.mergeBoundary,
      pipelineKey: entry.pipelineKey,
      transparency: entry.transparency,
      cullingGroup: entry.cullingGroup,
      independentlyCulled: entry.independentlyCulled === true,
      spatialClusterId: entry.spatialClusterId,
    })).sort(compareId),
    anchors: value.anchors.map((entry) => ({ ...entry })).sort(compareId),
    dynamicGroups: value.dynamicGroups.map((entry) => ({ ...entry })).sort(compareId),
    mergeGroups: value.mergeGroups.map((entry) => ({
      id: entry.id,
      nodeIds: [...entry.nodeIds].sort(compareString),
    })).sort(compareId),
    lods: value.lods.map((entry) => ({ ...entry })).sort(compareId),
    hlods: value.hlods.map((entry) => ({ ...entry })).sort(compareId),
    collisions: value.collisions.map((entry) => ({ ...entry })).sort(compareId),
  };
  return stableJsonValue(normalized);
}

export function assertSafeMergeBoundaries(semanticManifest) {
  const byId = new Map(semanticManifest.semanticNodes.map((entry) => [entry.id, entry]));
  const mergedNodeIds = new Set();
  for (const group of semanticManifest.mergeGroups) {
    const uniqueNodeIds = new Set(group.nodeIds);
    if (uniqueNodeIds.size !== group.nodeIds.length) {
      throw new Error(`Unsafe merge group ${group.id}: duplicate node IDs are not allowed.`);
    }
    if (group.nodeIds.length < 2) continue;
    const nodes = group.nodeIds.map((id) => byId.get(id));
    if (nodes.some((node) => node.role === 'dynamic')) {
      throw new Error(`Unsafe merge group ${group.id}: dynamic nodes must remain separate.`);
    }
    if (nodes.some((node) => node.independentlyCulled)) {
      throw new Error(`Unsafe merge group ${group.id}: independently culled nodes must remain separate.`);
    }
    for (const node of nodes) {
      if (mergedNodeIds.has(node.id)) {
        throw new Error(`Unsafe merge group ${group.id}: node ${node.id} belongs to multiple merge groups.`);
      }
      mergedNodeIds.add(node.id);
    }
    for (const property of ['parentId', 'mergeBoundary', 'pipelineKey', 'transparency', 'cullingGroup', 'spatialClusterId']) {
      const values = new Set(nodes.map((node) => node[property]));
      if (values.size > 1) {
        throw new Error(`Unsafe merge group ${group.id}: crosses ${property} boundary.`);
      }
    }
  }
  return true;
}

async function prepareRenderDocument(document, semanticManifest, resolved) {
  const { immutableNodes } = preflightRenderDocument(document, semanticManifest, resolved);

  for (const { entry, node } of immutableNodes) {
    const sourceMesh = node.getMesh();
    if (!sourceMesh) continue;

    const localMatrix = Array.from(node.getMatrix());
    const originalChildren = [...node.listChildren()];
    const isolatedMesh = isolateMesh(sourceMesh);
    node.setMesh(isolatedMesh);

    if (!isIdentityMatrix(localMatrix)) {
      for (const primitive of isolatedMesh.listPrimitives()) {
        promoteDirectionalBakeStreams(primitive);
        transformPrimitive(primitive, localMatrix);
      }
      if (originalChildren.length > 0) {
        const carrier = document.createNode(`render:${entry.id}:transform`)
          .setTranslation([...node.getTranslation()])
          .setRotation([...node.getRotation()])
          .setScale([...node.getScale()]);
        node.addChild(carrier);
        for (const child of originalChildren) carrier.addChild(child);
      }
      node
        .setTranslation([0, 0, 0])
        .setRotation([0, 0, 0, 1])
        .setScale([1, 1, 1]);
    }
  }

  applyMergeGroups(document, semanticManifest, resolved);
  await document.transform(prune({
    propertyTypes: [
      PropertyType.MESH,
      PropertyType.PRIMITIVE,
      PropertyType.PRIMITIVE_TARGET,
      PropertyType.ACCESSOR,
      PropertyType.BUFFER,
    ],
    keepAttributes: true,
    keepIndices: true,
    keepExtras: false,
  }));
}

function preflightRenderDocument(document, semanticManifest, resolved) {
  if (document.hasExtension('KHR_mesh_primitive_restart')) {
    throw new Error('Render package compiler does not support KHR_mesh_primitive_restart.');
  }

  const root = document.getRoot();
  const animatedTransformNodes = new Set();
  const weightAnimatedNodes = new Set();
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const targetNode = channel.getTargetNode();
      if (!targetNode) continue;
      if (channel.getTargetPath() === 'weights') weightAnimatedNodes.add(targetNode);
      else animatedTransformNodes.add(targetNode);
    }
  }

  const skinJointNodes = new Set();
  for (const skin of root.listSkins()) {
    for (const joint of skin.listJoints()) skinJointNodes.add(joint);
    if (skin.getSkeleton()) skinJointNodes.add(skin.getSkeleton());
  }

  for (const node of root.listNodes()) {
    if (Object.prototype.hasOwnProperty.call(node.getExtras(), RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY)) {
      throw new Error(
        `Source node ${node.getName() || '(unnamed)'} uses reserved extras key ${RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY}.`,
      );
    }
  }
  assertGeometryAccessorMetadataSupported(root);

  const immutableNodes = semanticManifest.semanticNodes
    .filter((entry) => entry.role === 'immutable')
    .map((entry) => ({ entry, node: resolved.semanticNodes.get(entry.id).node }))
    .sort((left, right) => nodeDepth(left.node) - nodeDepth(right.node) || compareString(left.entry.id, right.entry.id));

  for (const { entry, node } of immutableNodes) {
    const sourceMesh = node.getMesh();
    if (!sourceMesh) continue;
    if ((typeof node.getSkin === 'function' && node.getSkin()) || skinJointNodes.has(node)) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake a skinned mesh or skin joint.`);
    }
    if (typeof node.getCamera === 'function' && node.getCamera()) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake a camera attachment.`);
    }
    if (typeof node.listExtensions === 'function' && node.listExtensions().length > 0) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake node extensions.`);
    }
    for (const animatedNode of animatedTransformNodes) {
      if (isDescendantOrSelf(animatedNode, node)) {
        throw new Error(`Immutable semantic node ${entry.id} cannot bake across transform animation.`);
      }
    }

    const localMatrix = Array.from(node.getMatrix());
    if (!isIdentityMatrix(localMatrix)) {
      assertBakeStreamsSupported(entry, sourceMesh, localMatrix);
    }
  }

  assertMergeInputsSupported(semanticManifest, resolved, weightAnimatedNodes);
  return { immutableNodes };
}

function assertGeometryAccessorMetadataSupported(root) {
  for (const mesh of root.listMeshes()) {
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      const accessors = [
        ...primitive.listSemantics().map((semantic) => [semantic, primitive.getAttribute(semantic)]),
        ...(primitive.getIndices() ? [['INDICES', primitive.getIndices()]] : []),
      ];
      for (const [targetIndex, target] of primitive.listTargets().entries()) {
        for (const semantic of target.listSemantics()) {
          accessors.push([`TARGET_${targetIndex}_${semantic}`, target.getAttribute(semantic)]);
        }
      }
      for (const [semantic, accessor] of accessors) {
        if (!accessor) continue;
        const hasExtras = Object.keys(accessor.getExtras()).length > 0;
        const hasExtensions = accessor.listExtensions().length > 0;
        if (hasExtras || hasExtensions) {
          throw new Error(
            `Render package compiler cannot rewrite accessor metadata on ${mesh.getName() || '(unnamed mesh)'} primitive ${primitiveIndex} ${semantic}.`,
          );
        }
      }
    }
  }
}

function assertBakeStreamsSupported(entry, mesh, localMatrix) {
  const determinant = linearDeterminant(localMatrix);
  if (Math.abs(determinant) <= 1e-12) {
    throw new Error(`Immutable semantic node ${entry.id} cannot bake a non-invertible transform.`);
  }
  if (determinant < 0) {
    throw new Error(`Immutable semantic node ${entry.id} cannot bake a negative-determinant transform.`);
  }

  for (const primitive of mesh.listPrimitives()) {
    if (primitive.listTargets().length > 0) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake morph target streams.`);
    }
    const position = primitive.getAttribute('POSITION');
    if (position && !BAKE_POSITION_COMPONENT_TYPES.has(position.getComponentType())) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake this POSITION component type.`);
    }
    const normal = primitive.getAttribute('NORMAL');
    if (normal && normal.getType() !== Accessor.Type.VEC3) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake non-VEC3 NORMAL streams.`);
    }
    if (normal && normal.getComponentType() !== Accessor.ComponentType.FLOAT && !normal.getNormalized()) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake non-FLOAT NORMAL streams.`);
    }
    const tangent = primitive.getAttribute('TANGENT');
    if (tangent && tangent.getType() !== Accessor.Type.VEC4) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake non-VEC4 TANGENT streams.`);
    }
    if (tangent && tangent.getComponentType() !== Accessor.ComponentType.FLOAT && !tangent.getNormalized()) {
      throw new Error(`Immutable semantic node ${entry.id} cannot bake non-FLOAT TANGENT streams.`);
    }
  }
}

function promoteDirectionalBakeStreams(primitive) {
  for (const semantic of ['NORMAL', 'TANGENT']) {
    const accessor = primitive.getAttribute(semantic);
    if (!accessor || accessor.getComponentType() === Accessor.ComponentType.FLOAT) continue;

    const element = [];
    const values = new Float32Array(accessor.getCount() * accessor.getElementSize());
    for (let index = 0; index < accessor.getCount(); index++) {
      accessor.getElement(index, element);
      values.set(element, index * accessor.getElementSize());
    }
    primitive.setAttribute(semantic, accessor.clone()
      .setArray(values)
      .setNormalized(false));
  }
}

function assertMergeInputsSupported(semanticManifest, resolved, weightAnimatedNodes) {
  const distanceNodeIds = new Set([
    ...semanticManifest.lods.map((entry) => entry.nodeId),
    ...semanticManifest.hlods.map((entry) => entry.nodeId),
  ]);

  for (const group of semanticManifest.mergeGroups) {
    if (group.nodeIds.length < 2) continue;
    const nodes = group.nodeIds.map((nodeId) => resolved.semanticNodes.get(nodeId).node);
    const parent = nodes[0].getParentNode();
    if (nodes.some((node) => node.getParentNode() !== parent)) {
      throw new Error(`Unsafe merge group ${group.id}: nodes must share one scene parent.`);
    }
    for (const [index, node] of nodes.entries()) {
      const nodeId = group.nodeIds[index];
      const mesh = node.getMesh();
      if (!mesh) throw new Error(`Merge group ${group.id} node ${nodeId} has no immutable mesh.`);
      if (node.getWeights().length > 0 || mesh.getWeights().length > 0) {
        throw new Error(`Merge group ${group.id} cannot combine node or mesh weights.`);
      }
      if (weightAnimatedNodes.has(node)) {
        throw new Error(`Merge group ${group.id} cannot move a weights animation target.`);
      }
      if (distanceNodeIds.has(nodeId)) {
        throw new Error(`Merge group ${group.id} cannot combine node-scoped LOD or HLOD records.`);
      }
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.listTargets().length > 0) {
          throw new Error(`Merge group ${group.id} cannot combine morph targets.`);
        }
      }
      if (Object.keys(mesh.getExtras()).length > 0 || mesh.listExtensions().length > 0) {
        throw new Error(`Merge group ${group.id} cannot combine mesh extras or extensions.`);
      }
      for (const primitive of mesh.listPrimitives()) {
        if (Object.keys(primitive.getExtras()).length > 0 || primitive.listExtensions().length > 0) {
          throw new Error(`Merge group ${group.id} cannot combine primitive extras or extensions.`);
        }
      }
    }
  }
}

function isolateMesh(sourceMesh) {
  const isolatedMesh = sourceMesh.clone();
  for (const sourcePrimitive of [...isolatedMesh.listPrimitives()]) {
    const isolatedPrimitive = sourcePrimitive.clone();
    for (const sourceTarget of [...isolatedPrimitive.listTargets()]) {
      isolatedPrimitive.removeTarget(sourceTarget).addTarget(sourceTarget.clone());
    }
    isolatedMesh.removePrimitive(sourcePrimitive).addPrimitive(isolatedPrimitive);
    compactPrimitive(isolatedPrimitive);
  }
  return isolatedMesh;
}

function stampSemanticLocators(semanticManifest, resolved) {
  const recordIdsByNode = new Map();
  const addRecord = (node, recordId) => {
    if (!recordIdsByNode.has(node)) recordIdsByNode.set(node, []);
    recordIdsByNode.get(node).push(recordId);
  };
  for (const entry of semanticManifest.semanticNodes) {
    addRecord(resolved.semanticNodes.get(entry.id).node, entry.id);
  }
  for (const entry of semanticManifest.anchors) {
    addRecord(resolved.anchors.get(entry.id).node, entry.id);
  }

  for (const [node, recordIds] of recordIdsByNode) {
    node.setExtras(stableJsonValue({
      ...node.getExtras(),
      [RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY]: {
        schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
        recordIds: [...new Set(recordIds)].sort(compareString),
        rawNodeName: node.getName(),
      },
    }));
  }
}

function applyMergeGroups(document, semanticManifest, resolved) {
  for (const group of semanticManifest.mergeGroups) {
    if (group.nodeIds.length < 2) continue;
    const nodes = group.nodeIds.map((nodeId) => resolved.semanticNodes.get(nodeId).node);
    const parent = nodes[0].getParentNode();
    if (nodes.some((node) => node.getParentNode() !== parent)) {
      throw new Error(`Unsafe merge group ${group.id}: nodes must share one scene parent.`);
    }
    const meshes = nodes.map((node, index) => {
      const mesh = node.getMesh();
      if (!mesh) throw new Error(`Merge group ${group.id} node ${group.nodeIds[index]} has no immutable mesh.`);
      if (mesh.getWeights().length > 0) {
        throw new Error(`Merge group ${group.id} cannot combine mesh-weighted primitives.`);
      }
      return mesh;
    });

    const materialIds = new WeakMap();
    let nextMaterialId = 0;
    let uniquePrimitive = 0;
    const buckets = new Map();
    for (const mesh of meshes) {
      for (const primitive of mesh.listPrimitives()) {
        const key = primitiveCompatibilityKey(primitive, materialIds, () => ++nextMaterialId, () => ++uniquePrimitive);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(primitive);
      }
    }

    const mergedMesh = document.createMesh(`render:${group.id}`);
    for (const primitives of buckets.values()) {
      mergedMesh.addPrimitive(primitives.length > 1 ? joinPrimitives(primitives) : primitives[0]);
    }
    for (const node of nodes) node.setMesh(null);
    nodes[0].setMesh(mergedMesh);
    for (const mesh of meshes) mesh.dispose();
  }
}

function primitiveCompatibilityKey(primitive, materialIds, allocateMaterialId, allocateUniqueId) {
  if (
    primitive.listTargets().length > 0
    || !JOIN_SAFE_PRIMITIVE_MODES.has(primitive.getMode())
  ) return `unique:${allocateUniqueId()}`;
  const position = primitive.getAttribute('POSITION');
  if (!position) return `unique:${allocateUniqueId()}`;
  const material = primitive.getMaterial();
  let materialId = 'none';
  if (material) {
    materialId = materialIds.get(material);
    if (!materialId) {
      materialId = `material:${allocateMaterialId()}`;
      materialIds.set(material, materialId);
    }
  }
  const attributes = primitive.listSemantics().map((semantic) => {
    const accessor = primitive.getAttribute(semantic);
    return `${semantic}:${accessor.getType()}:${accessor.getComponentType()}:${accessor.getNormalized() ? 1 : 0}`;
  }).sort(compareString);
  const indices = primitive.getIndices();
  return stableJsonStringify({
    materialId,
    mode: primitive.getMode(),
    attributes,
    indices: indices ? `${indices.getComponentType()}:${indices.getNormalized() ? 1 : 0}` : 'none',
  });
}

function nodeDepth(node) {
  let depth = 0;
  let current = node;
  while (current && current.getParentNode()) {
    depth++;
    current = current.getParentNode();
  }
  return depth;
}

function isIdentityMatrix(matrix) {
  return matrix.every((value, index) => Math.abs(value - IDENTITY_MATRIX[index]) <= 1e-12);
}

function linearDeterminant(matrix) {
  return matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9])
    - matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9])
    + matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
}

async function createIo() {
  if (!toolchainReady) {
    toolchainReady = Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  }
  await toolchainReady;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
}

function resolveSourceNodes(document, semanticManifest) {
  const scene = document.getRoot().getDefaultScene() || document.getRoot().listScenes()[0];
  if (!scene) throw new Error('Source GLB must contain a scene.');
  const paths = indexScenePaths(scene);
  const byName = new Map();
  for (const [node, path] of paths.entries()) {
    const name = node.getName();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ node, path });
  }

  const resolveUnique = (name, label) => {
    const matches = byName.get(name) || [];
    if (matches.length === 0) throw new Error(`${label} references missing source node ${name}.`);
    if (matches.length > 1) throw new Error(`${label} references non-unique source node ${name}.`);
    return matches[0];
  };

  const semanticNodes = new Map();
  for (const entry of semanticManifest.semanticNodes) {
    semanticNodes.set(entry.id, resolveUnique(entry.node, `semantic node ${entry.id}`));
  }
  const anchors = new Map();
  for (const entry of semanticManifest.anchors) {
    const resolved = resolveUnique(entry.node, `anchor ${entry.id}`);
    const parent = semanticNodes.get(entry.parentNodeId).node;
    if (!isDescendantOrSelf(resolved.node, parent)) {
      throw new Error(`Anchor ${entry.id} must be attached below semantic parent ${entry.parentNodeId}.`);
    }
    anchors.set(entry.id, resolved);
  }
  return { scene, semanticNodes, anchors };
}

function compileMetadataRecords(semanticManifest, resolved) {
  const currentPaths = indexScenePaths(resolved.scene);
  const nodes = semanticManifest.semanticNodes.map((entry) => {
    const source = resolved.semanticNodes.get(entry.id);
    return {
      id: entry.id,
      nodeName: source.node.getName(),
      nodePath: [...currentPaths.get(source.node)],
      role: entry.role,
      parentId: entry.parentId,
      localTransform: matrixArray(source.node.getMatrix()),
      worldTransform: matrixArray(source.node.getWorldMatrix()),
      materialPipelineKey: entry.pipelineKey,
      spatialClusterId: entry.spatialClusterId,
      mergeBoundary: entry.mergeBoundary,
    };
  }).sort(compareId);

  const anchors = semanticManifest.anchors.map((entry) => {
    const source = resolved.anchors.get(entry.id);
    return {
      id: entry.id,
      nodeName: source.node.getName(),
      nodePath: [...currentPaths.get(source.node)],
      kind: entry.kind,
      parentNodeId: entry.parentNodeId,
      localTransform: matrixArray(source.node.getMatrix()),
      worldTransform: matrixArray(source.node.getWorldMatrix()),
    };
  }).sort(compareId);

  const dynamicGroups = semanticManifest.dynamicGroups.map((entry) => ({
    id: entry.id,
    nodeId: entry.nodeId,
    kind: entry.kind,
  })).sort(compareId);

  const materialsByHash = new Map();
  const geometry = [];
  for (const semanticNode of semanticManifest.semanticNodes) {
    const sourceNode = resolved.semanticNodes.get(semanticNode.id).node;
    const mesh = sourceNode.getMesh();
    if (!mesh) continue;
    const primitives = mesh.listPrimitives();
    for (const [primitiveIndex, primitive] of primitives.entries()) {
      const material = primitive.getMaterial();
      const materialRecord = material ? createMaterialRecord(material) : null;
      if (materialRecord) materialsByHash.set(materialRecord.hash, materialRecord);
      const position = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      geometry.push({
        id: `${semanticNode.id}.primitive.${primitiveIndex}`,
        nodeId: semanticNode.id,
        meshName: mesh.getName() || semanticNode.node,
        primitiveIndex,
        indexed: !!indices,
        vertexCount: position ? position.getCount() : 0,
        indexCount: indices ? indices.getCount() : 0,
        drawMode: primitive.getMode(),
        geometryHash: hashPrimitive(primitive),
        materialHash: materialRecord ? materialRecord.hash : null,
        materialPipelineKey: semanticNode.pipelineKey,
        bounds: primitiveBounds(primitive, sourceNode.getWorldMatrix()),
      });
    }
  }
  geometry.sort(compareId);
  const materials = [...materialsByHash.values()].sort(compareId);

  const lods = semanticManifest.lods.map((entry) => ({ ...entry })).sort(compareId);
  const hlods = semanticManifest.hlods.map((entry) => ({ ...entry })).sort(compareId);
  const collisions = semanticManifest.collisions.map((entry) => ({ ...entry })).sort(compareId);
  const geometryByNode = groupBy(geometry, (entry) => entry.nodeId);
  const spatialClusters = [...groupBy(nodes, (entry) => entry.spatialClusterId).entries()]
    .map(([id, clusterNodes]) => ({
      id,
      nodeIds: clusterNodes.map((entry) => entry.id).sort(compareString),
      bounds: unionBounds(clusterNodes.flatMap((entry) => geometryByNode.get(entry.id) || []).map((entry) => entry.bounds)),
    }))
    .sort(compareId);

  return { nodes, anchors, dynamicGroups, geometry, materials, lods, hlods, collisions, spatialClusters };
}

function createMaterialRecord(material) {
  const textureSlots = [
    ['baseColor', 'getBaseColorTexture'],
    ['metallicRoughness', 'getMetallicRoughnessTexture'],
    ['normal', 'getNormalTexture'],
    ['occlusion', 'getOcclusionTexture'],
    ['emissive', 'getEmissiveTexture'],
  ];
  const textures = [];
  const textureDigest = [];
  for (const [slot, getter] of textureSlots) {
    const texture = typeof material[getter] === 'function' ? material[getter]() : null;
    if (!texture) continue;
    const image = typeof texture.getImage === 'function' ? texture.getImage() : null;
    const imageHash = image && ArrayBuffer.isView(image) ? sha256(typedArrayBytes(image)) : null;
    const record = {
      slot,
      name: texture.getName ? texture.getName() : '',
      uri: texture.getURI ? texture.getURI() || null : null,
      colorSpace: slot === 'baseColor' || slot === 'emissive' ? 'srgb' : 'linear',
    };
    textures.push(record);
    textureDigest.push({ ...record, imageHash, mimeType: texture.getMimeType ? texture.getMimeType() || null : null });
  }
  textures.sort((a, b) => compareString(a.slot, b.slot));
  textureDigest.sort((a, b) => compareString(a.slot, b.slot));
  const descriptor = {
    name: material.getName ? material.getName() : '',
    alphaMode: call(material, 'getAlphaMode', 'OPAQUE'),
    alphaCutoff: call(material, 'getAlphaCutoff', 0.5),
    doubleSided: call(material, 'getDoubleSided', false),
    baseColorFactor: call(material, 'getBaseColorFactor', [1, 1, 1, 1]),
    metallicFactor: call(material, 'getMetallicFactor', 1),
    roughnessFactor: call(material, 'getRoughnessFactor', 1),
    emissiveFactor: call(material, 'getEmissiveFactor', [0, 0, 0]),
    normalScale: call(material, 'getNormalScale', 1),
    occlusionStrength: call(material, 'getOcclusionStrength', 1),
    textures: textureDigest,
  };
  const hash = sha256(Buffer.from(stableJsonStringify(descriptor)));
  const pipelineKey = `${String(descriptor.alphaMode).toLowerCase()}:${descriptor.doubleSided ? 'double' : 'front'}`;
  return {
    id: `material:${hash.slice(0, 24)}`,
    name: descriptor.name,
    hash,
    pipelineKey,
    textures,
  };
}

function hashPrimitive(primitive) {
  const hash = createHash('sha256');
  hash.update(`mode:${primitive.getMode()}\n`);
  const semantics = primitive.listSemantics();
  const attributes = primitive.listAttributes();
  const pairs = semantics.map((semantic, index) => [semantic, attributes[index]])
    .sort((a, b) => compareString(a[0], b[0]));
  for (const [semantic, accessor] of pairs) hashAccessor(hash, semantic, accessor);
  const indices = primitive.getIndices();
  if (indices) hashAccessor(hash, 'INDICES', indices);
  for (const [targetIndex, target] of primitive.listTargets().entries()) {
    const targetPairs = target.listSemantics().map((semantic, index) => [semantic, target.listAttributes()[index]])
      .sort((a, b) => compareString(a[0], b[0]));
    for (const [semantic, accessor] of targetPairs) hashAccessor(hash, `TARGET_${targetIndex}_${semantic}`, accessor);
  }
  return hash.digest('hex');
}

function hashAccessor(hash, semantic, accessor) {
  hash.update(`${semantic}:${accessor.getType()}:${accessor.getComponentType()}:${accessor.getNormalized() ? 1 : 0}:${accessor.getCount()}\n`);
  const array = accessor.getArray();
  if (array) hash.update(typedArrayBytes(array));
}

function primitiveBounds(primitive, worldMatrix) {
  const position = primitive.getAttribute('POSITION');
  if (!position || position.getCount() === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const value = [0, 0, 0];
  for (let index = 0; index < position.getCount(); index++) {
    position.getElement(index, value);
    const point = transformPoint(value, worldMatrix);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min: min.map(normalizeNumber), max: max.map(normalizeNumber) };
}

function unionBounds(boundsList) {
  if (boundsList.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const bounds of boundsList) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return { min: min.map(normalizeNumber), max: max.map(normalizeNumber) };
}

function indexScenePaths(scene) {
  const paths = new Map();
  const visit = (node, path) => {
    paths.set(node, path);
    for (const [index, child] of node.listChildren().entries()) visit(child, [...path, index]);
  };
  for (const [index, child] of scene.listChildren().entries()) visit(child, [index]);
  return paths;
}

function isDescendantOrSelf(node, ancestor) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.getParentNode ? current.getParentNode() : null;
  }
  return false;
}

function transformPoint(point, matrix) {
  const [x, y, z] = point;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const inverseW = w && w !== 1 ? 1 / w : 1;
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * inverseW,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * inverseW,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * inverseW,
  ];
}

function matrixArray(matrix) {
  return Array.from(matrix, normalizeNumber);
}

function normalizeNumber(value) {
  return Object.is(value, -0) ? 0 : value;
}

function typedArrayBytes(array) {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeUri(value) {
  return String(value).replace(/\\/g, '/');
}

function resolveSourceManifestProvenance(sourceProvenance, sourceManifestPath, legacyBytes, legacyUri) {
  if (sourceProvenance != null) {
    if (!sourceProvenance || typeof sourceProvenance !== 'object') {
      throw new Error('compileRenderPackage sourceProvenance must be an object.');
    }
    const uri = normalizeUri(sourceProvenance.uri || '');
    const bytes = sourceProvenance.bytes;
    if (!uri || !bytes || typeof bytes.length !== 'number') {
      throw new Error('compileRenderPackage sourceProvenance requires uri and bytes.');
    }
    const buffer = Buffer.from(bytes);
    return {
      uri,
      sha256: sha256(buffer),
      bytes: buffer.length,
    };
  }
  if (!legacyBytes) return null;
  return {
    uri: normalizeUri(legacyUri || basename(sourceManifestPath)),
    sha256: sha256(legacyBytes),
    bytes: legacyBytes.length,
  };
}

function resolveRequiredPath(value, name) {
  if (typeof value !== 'string' || !value) throw new Error(`compileRenderPackage requires ${name}.`);
  return resolve(value);
}

function compareId(a, b) {
  return compareString(a.id, b.id);
}

function compareString(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function call(target, method, fallback) {
  return target && typeof target[method] === 'function' ? target[method]() : fallback;
}
