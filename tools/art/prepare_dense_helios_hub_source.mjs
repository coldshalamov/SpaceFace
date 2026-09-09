#!/usr/bin/env node
/**
 * Promote the accepted dense Helios macro into the canonical hub-family source slot.
 *
 * The visual build intentionally stays isolated. This step adds the live place contract without
 * changing its accepted render geometry or texture resolution: exact asset identity, authored LOD
 * tags, the structure socket, and a non-render collision helper derived from the LOD0 bounds.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Accessor, Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const input = resolve(ROOT, process.argv[2]
  || 'assets/ships/m4_helios_dense_candidate/source/helios_dense_macro_candidate_release.glb');
const output = resolve(ROOT, process.argv[3]
  || 'assets/ships/m4_helios_hub/source/places/helios_hub_station.glb');
const reportPath = resolve(ROOT, 'assets/ships/m4_helios_dense_candidate/evidence/source_contract.json');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const rel = (path) => path.replaceAll('\\', '/').replace(`${ROOT.replaceAll('\\', '/')}/`, '');

function ensureNamedChild(document, parent, name, extras) {
  const existing = document.getRoot().listNodes().find((node) => node.getName() === name);
  const node = existing || document.createNode(name);
  node.setExtras(extras);
  if (!parent.listChildren().includes(node)) parent.addChild(node);
  return node;
}

function walkNodes(node, visit) {
  visit(node);
  for (const child of node.listChildren()) walkNodes(child, visit);
}

function measureLod(node) {
  let triangles = 0;
  let drawGroups = 0;
  const seenMeshes = new Set();
  walkNodes(node, (current) => {
    const mesh = current.getMesh();
    if (!mesh || seenMeshes.has(mesh)) return;
    seenMeshes.add(mesh);
    drawGroups += mesh.listPrimitives().length;
    for (const primitive of mesh.listPrimitives()) {
      const accessor = primitive.getIndices() || primitive.getAttribute('POSITION');
      triangles += Math.floor((accessor?.getCount() || 0) / 3);
    }
  });
  return { triangles, drawGroups };
}

function createCollisionHull(document, parent, min, max) {
  const existing = document.getRoot().listNodes().find((node) => node.getName() === 'COLLISION_HULL');
  if (existing) existing.dispose();

  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ]);
  // GLB permits exactly one binary buffer. Reuse the imported asset's buffer so the contract-only
  // collision helper remains a valid single-container GLB.
  const buffer = document.getRoot().listBuffers()[0]
    || document.createBuffer('SF_HeliosHubContractBuffer');
  const positionAccessor = document.createAccessor('COLLISION_HULL_POSITION')
    .setType(Accessor.Type.VEC3).setArray(positions).setBuffer(buffer);
  const indexAccessor = document.createAccessor('COLLISION_HULL_INDICES')
    .setType(Accessor.Type.SCALAR).setArray(indices).setBuffer(buffer);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', positionAccessor)
    .setIndices(indexAccessor);
  const mesh = document.createMesh('COLLISION_HULL_Mesh').addPrimitive(primitive);
  const bounds = { min, max, size: max.map((value, i) => value - min[i]) };
  const node = document.createNode('COLLISION_HULL').setMesh(mesh).setExtras({
    collision: true,
    nonRender: true,
    bounds,
    spaceface: {
      collision: true,
      helper: true,
      nonRender: true,
      keep: true,
      role: 'collision',
      bounds,
    },
  });
  parent.addChild(node);
  return bounds;
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

async function writeAtomic(target, sourceDocument) {
  const temporary = `${target}.tmp.${process.pid}.${Date.now()}.glb`;
  await io.write(temporary, sourceDocument);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      if (existsSync(target)) unlinkSync(target);
      renameSync(temporary, target);
      return;
    } catch (error) {
      if (attempt === 19) {
        try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* best effort */ }
        throw error;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100 * (attempt + 1)));
    }
  }
}

const document = await io.read(input);
const root = document.getRoot();
const textureTransformExtension = document.createExtension(KHRTextureTransform);
for (const material of root.listMaterials()) {
  const packedOrm = material.getMetallicRoughnessTexture();
  if (!packedOrm || material.getOcclusionTexture()) continue;
  material.setOcclusionTexture(packedOrm);
  const sourceInfo = material.getMetallicRoughnessTextureInfo();
  const targetInfo = material.getOcclusionTextureInfo();
  targetInfo.setTexCoord(sourceInfo.getTexCoord());
  const sourceTransform = sourceInfo.getExtension('KHR_texture_transform');
  if (sourceTransform) {
    const targetTransform = textureTransformExtension.createTransform()
      .setOffset(sourceTransform.getOffset())
      .setRotation(sourceTransform.getRotation())
      .setScale(sourceTransform.getScale())
      .setTexCoord(sourceTransform.getTexCoord());
    targetInfo.setExtension('KHR_texture_transform', targetTransform);
  }
}
const lodNodes = new Map();
for (const levelIndex of ['0', '1', '2']) {
  const expectedName = `LOD${levelIndex}_HeliosDenseMacro`;
  const node = root.listNodes().find((candidate) => candidate.getName() === expectedName);
  if (!node) continue;
  const level = `lod${levelIndex}`;
  node.setExtras({
    ...(node.getExtras() || {}),
    spacefaceLod: level,
    spaceface: { ...((node.getExtras() || {}).spaceface || {}), lod: level, keep: true },
  });
  walkNodes(node, (current) => {
    if (!current.getMesh()) return;
    const extras = current.getExtras() || {};
    current.setExtras({
      ...extras,
      spaceface: { ...(extras.spaceface || {}), lod: level, chamfered: true },
    });
  });
  lodNodes.set(levelIndex, node);
}
if (![0, 1, 2].every((level) => lodNodes.has(String(level)))) {
  throw new Error(`dense hub must expose LOD0/1/2 roots; got ${[...lodNodes.keys()].join(',')}`);
}

const lod0 = lodNodes.get('0');
const measuredLods = Object.fromEntries(
  [...lodNodes.entries()].map(([index, node]) => [`lod${index}`, measureLod(node)]),
);
const lod0Bounds = getBounds(lod0);
const min = lod0Bounds.min.map(Number);
const max = lod0Bounds.max.map(Number);
const collisionBounds = createCollisionHull(document, lod0, min, max);
ensureNamedChild(document, lod0, 'SOCKET_Structure_Core', {
  socket: true,
  spaceface: { socket: true, keep: true, role: 'structure_core' },
});

const sf = {
  contractVersion: 1,
  assetId: 'SF_PLACE_STATION_TRADE_HUB',
  partId: 'place_station_trade_hub',
  liveId: 'place_station_trade_hub',
  slot: 'place',
  forward: '+X',
  up: '+Y',
  starboard: '+Z',
  unit: 'metre',
  normalConvention: 'OpenGL',
  ormChannels: 'R=AO,G=Roughness,B=Metallic',
  textureCompression: 'KTX2/BasisU',
  textureSize: 4096,
  chamfered: true,
  bevelRadiusM: 0.05,
  family: 'helios_dense_macro',
  packet: 'M4-HELIOS-HUB-ENV-VISUAL-FAMILY-001',
  role: 'hub_station_focal',
  title: 'Helios Dense Trade Hub',
  kind: 'landmark',
  deliverableRole: 'production_multi_lod',
  lods: ['lod0', 'lod1', 'lod2'],
  triangleCount: measuredLods.lod0.triangles,
  lodTriangles: Object.fromEntries(
    Object.entries(measuredLods).map(([level, metrics]) => [level, metrics.triangles]),
  ),
  drawGroupsPerLod: Object.fromEntries(
    Object.entries(measuredLods).map(([level, metrics]) => [level, metrics.drawGroups]),
  ),
  factorOnlyMaterials: ['SF_AmberEmission', 'SF_CyanEmission', 'SF_Window', 'SF_Radiator'],
  wiringStatus: 'candidate_pending_promote',
  lod0AabbSize: collisionBounds.size,
  collisionBounds,
};
const asset = root.getAsset();
asset.extras = { ...(asset.extras || {}), assetId: sf.assetId, partId: sf.partId, spacefaceAsset: sf };
for (const scene of root.listScenes()) {
  scene.setExtras({ ...(scene.getExtras() || {}), assetId: sf.assetId, partId: sf.partId, spacefaceAsset: sf });
}

mkdirSync(dirname(output), { recursive: true });
await writeAtomic(output, document);
const report = {
  input: rel(input),
  output: rel(output),
  inputSha256: sha256(input),
  outputSha256: sha256(output),
  outputBytes: readFileSync(output).length,
  assetId: sf.assetId,
  lodRoots: [...lodNodes.values()].map((node) => node.getName()),
  socket: 'SOCKET_Structure_Core',
  collision: collisionBounds,
  lodTriangles: sf.lodTriangles,
  drawGroupsPerLod: sf.drawGroupsPerLod,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`SF_DENSE_SOURCE_CONTRACT ${JSON.stringify(report)}`);
