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
  const rootIndex = nodes.findIndex((node) => node.name === 'place_debris_chunk');
  const socketIndex = nodes.findIndex((node) => node.name === 'SOCKET_Tether_Massline');
  assert.ok(rootIndex >= 0, 'missing canonical place_debris_chunk root');
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
  assert.deepEqual(socket.extras?.forward, [1, 0, 0]);

  const asset = json.asset?.extras?.spacefaceAsset;
  assert.ok(asset, 'missing asset-level SpaceFace contract');
  assert.deepEqual(root.extras?.spacefaceAsset, asset, 'root and asset contracts diverged');
  assert.equal(asset.assetId, 'place_debris_chunk');
  assert.equal(asset.partId, 'place_debris_chunk');
  assert.equal(asset.role, 'salvageable_manufactured_wreck');
  assert.equal(asset.donorClass, 'Meridian pressure/utility module');
  assert.equal(asset.textureCompression, 'PNG-source');
  assert.equal(asset.wiringStatus, 'source_checkpoint_release_pending');
  assert.deepEqual(asset.lods, ['lod0', 'lod1', 'lod2']);
});

test('debris source checkpoint has monotonic authored LODs matching its contract', () => {
  const json = parseGlbJson(SOURCE_GLB);
  const asset = json.asset.extras.spacefaceAsset;
  const rootIndex = json.nodes.findIndex((node) => node.name === 'place_debris_chunk');
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
    assert.ok(
      levelNodes.some((node) => json.meshes[node.mesh]?.name?.includes('PressureShell')),
      `${level} lacks the connected pressure shell`,
    );
    for (const node of levelNodes) {
      assert.ok(rootChildren.has(node.index), `${node.name} must be a direct debris-root child`);
      assert.equal(node.extras?.['spaceface.lod'], level, `${node.name} LOD tag drift`);
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
  assert.deepEqual(measuredTriangles, asset.lodTriangles, 'LOD triangle metadata drift');
  assert.deepEqual(measuredDrawGroups, asset.drawGroupsPerLod, 'LOD draw-group metadata drift');
});

test('debris source checkpoint binds complete semantic PBR material roles', () => {
  const json = parseGlbJson(SOURCE_GLB);
  const materials = json.materials || [];
  const names = new Set(materials.map((material) => material.name));
  for (const required of [
    'Material_Hull',
    'Material_Mechanical',
    'Material_Accent',
    'Material_Insulation',
    'Material_Radiator',
    'Material_Cable',
    'Material_Decal',
  ]) {
    assert.ok(names.has(required), `missing semantic material ${required}`);
  }
  for (const material of materials) {
    assert.ok(material.pbrMetallicRoughness?.baseColorTexture, `${material.name} missing base color`);
    assert.ok(material.normalTexture, `${material.name} missing tangent normal`);
    assert.ok(
      material.pbrMetallicRoughness?.metallicRoughnessTexture,
      `${material.name} missing packed ORM`,
    );
    assert.ok(material.occlusionTexture, `${material.name} missing AO binding`);
  }
  assert.equal((json.images || []).length, 21);
  assert.equal((json.textures || []).length, 21);
});
