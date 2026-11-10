import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_GLB = path.join(
  ROOT,
  'assets',
  'ships',
  'parts',
  'places',
  'place_debris_chunk.glb',
);
const PARTS_MANIFEST = path.join(ROOT, 'assets', 'ships', 'parts', 'parts_manifest.json');
const ROOT_NAME = 'SF_PLACE_DEBRIS_CHUNK_ROOT';

function parseGlbJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.length >= 20, `GLB too small: ${filePath}`);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `not GLB2: ${filePath}`);
  assert.equal(bytes.readUInt32LE(4), 2, `unsupported GLB version: ${filePath}`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `missing GLB JSON chunk: ${filePath}`);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

function triangleCount(json, node) {
  const mesh = json.meshes?.[node.mesh];
  assert.ok(mesh, `${node.name} references a missing mesh`);
  return (mesh.primitives || []).reduce((sum, primitive) => {
    const count = primitive.indices != null
      ? json.accessors?.[primitive.indices]?.count
      : json.accessors?.[primitive.attributes?.POSITION]?.count;
    return sum + Math.floor(Number(count || 0) / 3);
  }, 0);
}

test('debris source checkpoint preserves canonical root, tether socket, and metadata', () => {
  const json = parseGlbJson(SOURCE_GLB);
  const nodes = json.nodes || [];
  // Forge-remastered places carry an SF_<NAME>_ROOT canonical root (verified convention across
  // place_ceres_bait_wreck, place_cargo_pod_standard, place_charon_colony_service_barge).
  const rootIndex = nodes.findIndex((node) => node.name === ROOT_NAME);
  const socketIndex = nodes.findIndex((node) => node.name === 'SOCKET_Tether_Massline');
  assert.ok(rootIndex >= 0, `missing canonical ${ROOT_NAME} root`);
  assert.ok(socketIndex >= 0, 'missing SOCKET_Tether_Massline');

  const root = nodes[rootIndex];
  const socket = nodes[socketIndex];
  const sceneRoots = json.scenes?.[json.scene || 0]?.nodes || [];
  assert.ok(sceneRoots.includes(rootIndex), 'canonical debris root is not a scene root');
  assert.equal(
    nodes.some((node) => (node.children || []).includes(rootIndex)),
    false,
    'canonical debris root must remain unparented',
  );
  for (const property of ['matrix', 'translation', 'rotation', 'scale']) {
    assert.equal(root[property], undefined, `canonical debris root has non-identity ${property}`);
  }
  assert.ok(root.children?.includes(socketIndex), 'tether socket must be a direct root child');
  assert.deepEqual(socket.translation, [2, 1, 0], 'canonical tether position drifted');
  assert.equal(socket.extras?.role, 'tether');
  assert.equal(socket.extras?.spacefaceSocket, true);
  assert.deepEqual(socket.extras?.forward, [1, 0, 0]);

  const asset = json.asset?.extras?.spacefaceAsset;
  assert.ok(asset, 'missing asset-level SpaceFace contract');
  assert.deepEqual(root.extras?.spacefaceAsset, asset, 'root and asset contracts diverged');
  assert.equal(asset.assetId, 'place_debris_chunk');
  assert.equal(asset.partId, 'place_debris_chunk');
  assert.equal(asset.liveId, 'place_debris_chunk');
  assert.equal(asset.role, 'salvageable_manufactured_wreck');
  assert.equal(asset.family, 'opening_route_manufactured_wreckage_v1');
  assert.equal(asset.slot, 'place');
  assert.equal(asset.textureCompression, 'PNG-source');
  assert.equal(asset.forge?.version, 1);
  assert.equal(asset.integratedHardpoints, true);
  assert.ok(asset.factorOnlyMaterials?.includes('Material_Emissive_Amber'),
    'emissive amber stays declared factor-only (no texture bindings)');

  const manifest = JSON.parse(fs.readFileSync(PARTS_MANIFEST, 'utf8'));
  const manifestRow = manifest.parts.find((part) => part.id === 'place_debris_chunk');
  assert.ok(manifestRow, 'missing place_debris_chunk parts-manifest row');
  assert.equal(asset.category, manifestRow.category);
  assert.equal(asset.forward, '+X');
  assert.equal(asset.up, '+Y');
  assert.equal(asset.starboard, '+Z');
  assert.equal(asset.unit, 'metre');
  assert.equal(manifestRow.category, 'places');
  assert.equal(manifestRow.priority, 'P1');
  assert.equal(manifestRow.tris, 7476);
  assert.equal(manifestRow.textureSize, 512);
  assert.deepEqual(manifestRow.bounds.dimensionsM, [23.300000190734863, 9.764999866485596, 11.09958267211914]);
});

test('debris source checkpoint has monotonic authored LODs matching its contract', () => {
  const json = parseGlbJson(SOURCE_GLB);
  const rootIndex = json.nodes.findIndex((node) => node.name === ROOT_NAME);
  const rootChildren = new Set(json.nodes[rootIndex].children || []);
  const measuredTriangles = {};
  const measuredDrawGroups = {};

  for (const [level, prefix] of [
    ['lod0', 'LOD0_'],
    ['lod1', 'LOD1_'],
    ['lod2', 'LOD2_'],
  ]) {
    const levelNodes = json.nodes
      .map((node, index) => ({ ...node, index }))
      .filter((node) => node.name?.startsWith(prefix) && node.mesh != null);
    assert.ok(levelNodes.length > 0, `${level} has no render nodes`);
    // Forge naming: each LOD carries the full authored material vocabulary — hull, patch and
    // mechanical families must appear at every level so no tier drops the wreck's read.
    for (const family of ['Hull', 'Mechanical']) {
      assert.ok(
        levelNodes.some((node) => node.name.includes(family)),
        `${level} lacks a ${family} render node`,
      );
    }
    for (const node of levelNodes) {
      assert.ok(rootChildren.has(node.index), `${node.name} must be a direct debris-root child`);
      for (const primitive of json.meshes[node.mesh].primitives || []) {
        assert.ok(primitive.attributes?.TEXCOORD_0 != null, `${node.name} lacks UV0`);
        assert.ok(primitive.attributes?.TANGENT != null, `${node.name} lacks tangents`);
      }
    }
    measuredTriangles[level] = levelNodes.reduce(
      (sum, node) => sum + triangleCount(json, node),
      0,
    );
    measuredDrawGroups[level] = levelNodes.length;
  }

  assert.ok(measuredTriangles.lod0 > measuredTriangles.lod1);
  assert.ok(measuredTriangles.lod1 > measuredTriangles.lod2);
  // Measured on the Forge-remastered source (2026-10-27): 4592 / 1836 / 800 tris, nine draw
  // groups at every level.
  assert.deepEqual(measuredTriangles, { lod0: 4592, lod1: 1836, lod2: 800 });
  assert.deepEqual(measuredDrawGroups, { lod0: 9, lod1: 9, lod2: 9 });
});

test('debris source checkpoint binds complete semantic PBR material roles', () => {
  const json = parseGlbJson(SOURCE_GLB);
  const materials = json.materials || [];
  const names = new Set(materials.map((material) => material.name));
  // The Forge remaster's authored vocabulary — the deadmetal wreck reads through these roles.
  for (const required of [
    'Material_Hull',
    'Material_Hull_faded',
    'Material_Hull_patch',
    'Material_Mechanical',
    'Material_Accent',
    'Material_Armor',
    'Material_BrushedMetal',
    'Material_Warning',
    'Material_Emissive_Amber',
  ]) {
    assert.ok(names.has(required), `missing semantic material ${required}`);
  }
  const factorOnly = new Set(json.asset?.extras?.spacefaceAsset?.factorOnlyMaterials || []);
  for (const material of materials) {
    if (factorOnly.has(material.name)) {
      // Declared factor-only: flat emissive, no texture channels required.
      continue;
    }
    assert.ok(material.pbrMetallicRoughness?.baseColorTexture, `${material.name} missing base color`);
    assert.ok(material.normalTexture, `${material.name} missing tangent normal`);
    assert.ok(
      material.pbrMetallicRoughness?.metallicRoughnessTexture,
      `${material.name} missing packed ORM`,
    );
    assert.ok(material.occlusionTexture, `${material.name} missing AO binding`);
  }
  assert.equal(factorOnly.has('Material_Emissive_Amber'), true);
  assert.equal((json.images || []).length, 6);
  assert.equal((json.textures || []).length, 24);
});
