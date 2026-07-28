import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const SOURCE_GLB = new URL(
  '../assets/ships/parts/places/place_dock_interior.glb',
  import.meta.url,
);
const PARTS_MANIFEST = new URL(
  '../assets/ships/parts/parts_manifest.json',
  import.meta.url,
);

const REQUIRED_MATERIALS = [
  'Material_Hull',
  'Material_Structure',
  'Material_Floor',
  'Material_Mechanical',
  'Material_Radiator',
  'Material_Safety',
  'Material_Glass',
  'Material_Accent',
  'Material_Decal',
  'Material_Rubber',
];

function parseGlbJson(filePath) {
  const bytes = readFileSync(filePath);
  assert.ok(bytes.length >= 20, `GLB too small: ${filePath}`);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `not GLB2: ${filePath}`);
  assert.equal(bytes.readUInt32LE(4), 2, `unsupported GLB version: ${filePath}`);
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) {
      return JSON.parse(payload.toString('utf8').replace(/[\u0000 ]+$/u, ''));
    }
    offset += 8 + length;
  }
  throw new Error(`GLB has no JSON chunk: ${filePath}`);
}

function manifestRow() {
  const manifest = JSON.parse(readFileSync(PARTS_MANIFEST, 'utf8'));
  const row = manifest.parts.find((part) => part.id === 'place_dock_interior');
  assert.ok(row, 'missing place_dock_interior parts-manifest row');
  return row;
}

function measuredTriangles(gltf) {
  return (gltf.meshes || []).reduce(
    (total, mesh) => total + (mesh.primitives || []).reduce((meshTotal, primitive) => {
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const count = gltf.accessors?.[accessorIndex]?.count;
      assert.ok(Number.isInteger(count) && count > 0, `${mesh.name} has invalid geometry`);
      return meshTotal + Math.floor(count / 3);
    }, 0),
    0,
  );
}

function textureImage(gltf, textureInfo, label) {
  assert.ok(textureInfo, `${label} is missing`);
  const texture = gltf.textures?.[textureInfo.index];
  assert.ok(texture, `${label} references missing texture ${textureInfo.index}`);
  const image = gltf.images?.[texture.source];
  assert.ok(image, `${label} references missing image ${texture.source}`);
  return image;
}

test('dock canonical source matches its manifest and source-checkpoint contract', () => {
  const gltf = parseGlbJson(SOURCE_GLB);
  const row = manifestRow();
  const extras = gltf.asset?.extras;
  const contract = extras?.spacefaceAsset;

  assert.ok(contract, 'missing asset-level SpaceFace contract');
  assert.equal(extras.assetId, row.id);
  assert.equal(extras.partId, row.id);
  assert.equal(extras.category, row.category);
  assert.equal(extras.priority, row.priority);
  assert.equal(extras.triangleCount, row.tris);
  assert.equal(extras.textureSize, row.textureSize);
  assert.deepEqual(extras.boundsDimensionsM, row.bounds.dimensionsM);
  assert.equal(statSync(SOURCE_GLB).size, row.bytes, 'source byte count drifted from manifest');
  assert.equal(measuredTriangles(gltf), row.tris, 'measured triangles drifted from manifest');
  assert.equal(extras.forwardAxis, '+X');
  assert.equal(extras.upAxis, '+Y');
  assert.equal(extras.starboardAxis, '+Z');
  assert.equal(extras.unit, 'metre');
  assert.deepEqual(extras.sourceProvenance, {
    textureRoleContractVersion: 1,
    textureRoleMode: 'bound-base-normal-orm',
    sourceBlend: 'assets/ships/parts/blender/place_dock_interior_authored.blend',
    geometryPipeline: 'tools/blender/remaster_opening_dock_interior_v2.py',
    texturePipeline: 'tools/art/build_dock_interior_maps.py',
    packedEditableTextures: true,
  });

  assert.equal(contract.contractVersion, 1);
  assert.equal(contract.assetId, row.id);
  assert.equal(contract.partId, row.id);
  assert.equal(contract.liveId, row.id);
  assert.equal(contract.slot, 'place');
  assert.equal(contract.sourceRole, 'shipworks_preview_backdrop');
  assert.equal(contract.role, 'neutral_reusable_shipworks_backdrop');
  assert.equal(contract.family, 'opening_route_neutral_shipworks_v1');
  assert.equal(contract.registration, 'H-04 SHIPWORKS');
  assert.equal(contract.triangleCount, row.tris);
  assert.equal(contract.textureSize, row.textureSize);
  assert.deepEqual(contract.boundsDimensionsM, row.bounds.dimensionsM);
  assert.deepEqual(contract.sourceProvenance, extras.sourceProvenance);
  assert.equal(contract.deliverableRole, 'production_single_lod_preview');
  assert.equal(contract.wiringStatus, 'source_checkpoint_release_pending');
  assert.equal(contract.mountAtOrigin, true);
  assert.deepEqual(contract.previewMount, {
    floorLocalY: -3.44,
    referenceShipSpan: 24.08,
    minimumScale: 0.8,
    maximumScale: 12.5,
    minimumFloorClearance: 0.45,
    maximumFloorClearance: 2,
    floorClearanceHeightRatio: 0.12,
  });
  assert.deepEqual(contract.clearApertureMetres, {
    width: 28,
    depth: 28,
    heightAboveFloor: 13,
  });
  assert.deepEqual(contract.authoringLods, ['lod0', 'lod1', 'lod2']);
  assert.deepEqual(contract.exportedLods, ['lod0']);
  assert.match(contract.exportSelectionReason, /has no place-asset LOD selection/);

  assert.deepEqual(row.hooks, [], 'unsupported historical hooks remain in the manifest');
  assert.deepEqual(row.sockets, ['SOCKET_Structure_Core']);
});

test('dock canonical source exports one rooted LOD0 and its structure socket only', () => {
  const gltf = parseGlbJson(SOURCE_GLB);
  const nodes = gltf.nodes || [];
  const rootIndex = nodes.findIndex((node) => node.name === 'place_dock_interior');
  const lod0Index = nodes.findIndex((node) => node.name === 'LOD0_Dock_ROOT');
  const socketIndex = nodes.findIndex((node) => node.name === 'SOCKET_Structure_Core');

  assert.ok(rootIndex >= 0, 'missing canonical place_dock_interior root');
  assert.ok(lod0Index >= 0, 'missing LOD0_Dock_ROOT');
  assert.ok(socketIndex >= 0, 'missing SOCKET_Structure_Core');
  const root = nodes[rootIndex];
  const sceneRoots = gltf.scenes?.[gltf.scene || 0]?.nodes || [];
  assert.ok(sceneRoots.includes(rootIndex), 'canonical dock root is not a scene root');
  assert.equal(
    nodes.some((node) => (node.children || []).includes(rootIndex)),
    false,
    'canonical dock root must remain unparented',
  );
  for (const property of ['matrix', 'translation', 'rotation', 'scale']) {
    assert.equal(root[property], undefined, `canonical dock root has non-identity ${property}`);
  }
  assert.ok(root.children?.includes(lod0Index), 'LOD0 root must be a direct dock-root child');
  assert.ok(root.children?.includes(socketIndex), 'structure socket must be a direct root child');
  assert.deepEqual(nodes[socketIndex].translation ?? [0, 0, 0], [0, 0, 0]);
  assert.equal(nodes[socketIndex].extras?.role, 'structure');
  assert.deepEqual(nodes[socketIndex].extras?.forward, [1, 0, 0]);
  assert.equal(nodes[lod0Index].extras?.['spaceface.lod'], 'lod0');
  assert.equal(nodes[lod0Index].extras?.['spaceface.lodLevel'], 0);
  assert.equal(
    nodes.some((node) => node.name === 'HOOK_Emissive'),
    false,
    'unsupported historical HOOK_Emissive was exported',
  );
  assert.equal(
    nodes.some((node) => /^(?:LOD1|LOD2)_/.test(node.name || '')),
    false,
    'canonical preview source must export LOD0 only',
  );

  assert.deepEqual(
    root.extras?.spacefaceAsset,
    gltf.asset?.extras?.spacefaceAsset,
    'root and asset contracts diverged',
  );
  assert.deepEqual(
    gltf.scenes?.[gltf.scene || 0]?.extras?.spacefaceAsset,
    gltf.asset?.extras?.spacefaceAsset,
    'scene and asset contracts diverged',
  );
});

test('dock canonical source binds complete semantic PBR maps with UVs and tangents', () => {
  const gltf = parseGlbJson(SOURCE_GLB);
  const materialsByName = new Map(
    (gltf.materials || []).map((material, index) => [material.name, { material, index }]),
  );
  const boundImages = new Set();

  assert.equal(materialsByName.size, REQUIRED_MATERIALS.length);
  for (const name of REQUIRED_MATERIALS) {
    const entry = materialsByName.get(name);
    assert.ok(entry, `missing semantic material ${name}`);
    const { material } = entry;
    assert.equal(material.extras?.['spaceface.semantic'], name);
    assert.equal(material.extras?.['spaceface.ormChannels'], 'R=AO,G=Roughness,B=Metallic');
    assert.equal(
      material.extras?.['spaceface.normalConvention'],
      'OpenGL tangent space',
    );
    for (const [label, info] of [
      ['base color', material.pbrMetallicRoughness?.baseColorTexture],
      ['normal', material.normalTexture],
      ['packed ORM', material.pbrMetallicRoughness?.metallicRoughnessTexture],
      ['occlusion', material.occlusionTexture],
    ]) {
      const image = textureImage(gltf, info, `${name} ${label}`);
      boundImages.add(image.name);
      assert.equal(image.mimeType, 'image/png', `${image.name} is not editable PNG source`);
      assert.ok(Number.isInteger(image.bufferView), `${image.name} is not embedded`);
    }
  }

  const accent = materialsByName.get('Material_Accent').material;
  boundImages.add(textureImage(gltf, accent.emissiveTexture, 'Material_Accent emissive').name);
  assert.equal((gltf.images || []).length, 31);
  assert.equal((gltf.textures || []).length, 31);
  assert.equal(boundImages.size, 31, 'not every embedded source image is bound');

  const lod0Meshes = (gltf.nodes || [])
    .filter((node) => node.name?.startsWith('LOD0_Dock_Material_') && node.mesh != null);
  assert.equal(lod0Meshes.length, REQUIRED_MATERIALS.length);
  for (const node of lod0Meshes) {
    assert.equal(node.extras?.['spaceface.lod'], 'lod0', `${node.name} LOD tag drifted`);
    assert.equal(node.extras?.['spaceface.authoredConstruction'], true);
    for (const primitive of gltf.meshes?.[node.mesh]?.primitives || []) {
      assert.ok(primitive.attributes?.TEXCOORD_0 != null, `${node.name} lacks UV0`);
      assert.ok(primitive.attributes?.TANGENT != null, `${node.name} lacks tangents`);
      assert.ok(
        REQUIRED_MATERIALS.includes(gltf.materials?.[primitive.material]?.name),
        `${node.name} uses a non-semantic material`,
      );
    }
  }
});
