import assert from 'node:assert/strict';

let validateEngineDriveSurfaceContract = () => undefined;
let collectEngineDriveSurface = () => undefined;
try {
  ({ validateEngineDriveSurface: validateEngineDriveSurfaceContract, collectEngineDriveSurface } = await import('../tools/art/lib/engineDriveSurfaceValidation.mjs'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

const STANDARD_HOOKS = [
  'HOOK_DRIVE_CORE',
  'HOOK_DRIVE_FAN',
  'HOOK_DRIVE_PLUME',
];
const TWIN_HOOKS = [
  'HOOK_DRIVE_CORE_P',
  'HOOK_DRIVE_CORE_S',
  'HOOK_DRIVE_FAN_P',
  'HOOK_DRIVE_FAN_S',
  'HOOK_DRIVE_PLUME_P',
  'HOOK_DRIVE_PLUME_S',
];

function fixture(hooks, missingUvNode = null) {
  const accessors = [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
    { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
  ];
  const meshes = [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }];
  const nodes = [{ name: 'LOD0_ENGINE_FIXTURE', mesh: 0 }];
  for (const hook of hooks) {
    const attributes = { POSITION: 0 };
    if (hook !== missingUvNode) attributes.TEXCOORD_0 = 1;
    nodes.push({ name: hook, mesh: meshes.length });
    meshes.push({ primitives: [{ attributes }] });
  }
  return {
    accessors,
    buffers: [{ byteLength: 60 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
    ],
    meshes,
    nodes,
  };
}

function validateEngineDriveSurface(gltf, partIdOrBinary, hooksOrPartId, binaryOrHooks) {
  if (partIdOrBinary instanceof Uint8Array) {
    return validateEngineDriveSurfaceContract(gltf, partIdOrBinary, hooksOrPartId, binaryOrHooks);
  }
  const declaredBytes = gltf.buffers?.[0]?.byteLength || 0;
  return validateEngineDriveSurfaceContract(
    gltf,
    Buffer.alloc(declaredBytes),
    partIdOrBinary,
    hooksOrPartId,
  );
}

assert.throws(
  () => validateEngineDriveSurface(
    fixture(STANDARD_HOOKS, 'HOOK_DRIVE_FAN'),
    'fixture_standard_missing_uv',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_FAN.*primitive 0.*TEXCOORD_0/,
  'a mesh-bearing standard drive surface without UV0 must hard-fail with its node and primitive',
);

const mismatchedUvCount = fixture(STANDARD_HOOKS);
mismatchedUvCount.accessors[1].count = 2;
assert.throws(
  () => validateEngineDriveSurface(
    mismatchedUvCount,
    'fixture_standard_mismatched_uv_count',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*primitive 0.*TEXCOORD_0 count 2.*POSITION count 3/,
  'drive-surface UV0 cardinality must match the primitive POSITION accessor',
);

assert.doesNotThrow(
  () => validateEngineDriveSurface(fixture(STANDARD_HOOKS), 'fixture_standard_valid', STANDARD_HOOKS),
  'a valid standard CORE/FAN/PLUME drive layout should pass',
);

const binaryTruthFixture = fixture(STANDARD_HOOKS);
assert.throws(
  () => validateEngineDriveSurface(
    binaryTruthFixture,
    Buffer.alloc(0),
    'fixture_zero_bin',
    STANDARD_HOOKS,
  ),
  /BIN chunk.*empty|actual BIN length 0/,
  'declared buffer byteLength cannot substitute for actual GLB BIN bytes',
);

const externalBufferFixture = fixture(STANDARD_HOOKS);
externalBufferFixture.buffers[0].uri = 'external-engine.bin';
assert.throws(
  () => validateEngineDriveSurface(
    externalBufferFixture,
    Buffer.alloc(60),
    'fixture_external_buffer',
    STANDARD_HOOKS,
  ),
  /external buffer URI.*external-engine\.bin/,
  'canonical GLB engine surfaces may not claim storage in an external buffer URI',
);

const outOfChunkFixture = fixture(STANDARD_HOOKS);
outOfChunkFixture.buffers[0].byteLength = 64;
outOfChunkFixture.bufferViews[1].byteLength = 28;
assert.throws(
  () => validateEngineDriveSurface(
    outOfChunkFixture,
    Buffer.alloc(60),
    'fixture_out_of_chunk',
    STANDARD_HOOKS,
  ),
  /bufferView 1 range 64 exceeds actual BIN length 60/,
  'bufferView ranges must be checked against actual GLB BIN bytes, not only JSON metadata',
);

const misalignedViewFixture = fixture(STANDARD_HOOKS);
misalignedViewFixture.bufferViews[0].byteOffset = 2;
assert.throws(
  () => validateEngineDriveSurface(
    misalignedViewFixture,
    Buffer.alloc(60),
    'fixture_misaligned_view',
    STANDARD_HOOKS,
  ),
  /bufferView 0 byteOffset 2.*4-byte aligned/,
  'engine vertex bufferViews must be aligned inside the BIN chunk',
);

assert.throws(
  () => collectEngineDriveSurface(fixture(STANDARD_HOOKS)),
  /actual GLB BIN bytes are required/,
  'reporting callers may not count renderable engine surfaces without binary truth',
);

const countOnlyStaticPosition = fixture(STANDARD_HOOKS);
delete countOnlyStaticPosition.accessors[0].bufferView;
assert.throws(
  () => validateEngineDriveSurface(
    countOnlyStaticPosition,
    'fixture_static_count_only_position',
    STANDARD_HOOKS,
  ),
  /LOD0_\* static engine render mesh.*POSITION accessor.*storage/,
  'a count-only POSITION accessor without base or sparse storage must not satisfy the static surface contract',
);

const countOnlyDriveUv = fixture(STANDARD_HOOKS);
delete countOnlyDriveUv.accessors[1].bufferView;
assert.throws(
  () => validateEngineDriveSurface(
    countOnlyDriveUv,
    'fixture_drive_count_only_uv',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*primitive 0.*TEXCOORD_0 accessor.*storage/,
  'a count-only TEXCOORD_0 accessor without base or sparse storage must fail',
);

const undersizedBaseUv = fixture(STANDARD_HOOKS);
undersizedBaseUv.bufferViews[1].byteLength = 23;
assert.throws(
  () => validateEngineDriveSurface(
    undersizedBaseUv,
    'fixture_drive_undersized_base_uv',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*TEXCOORD_0 accessor.*base bufferView 1.*requires 24 bytes.*provides 23/,
  'base accessor storage must be sized from component width, accessor type, count, offsets, and stride',
);

const viewOutsideBuffer = fixture(STANDARD_HOOKS);
viewOutsideBuffer.buffers[0].byteLength = 59;
assert.throws(
  () => validateEngineDriveSurface(
    viewOutsideBuffer,
    'fixture_drive_view_outside_buffer',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*TEXCOORD_0 accessor.*bufferView 1 range 60 exceeds buffer 0 byteLength 59/,
  'a bufferView must remain within its referenced buffer byteLength',
);

const missingPositionView = fixture(STANDARD_HOOKS);
missingPositionView.accessors[0].bufferView = 99;
assert.throws(
  () => validateEngineDriveSurface(
    missingPositionView,
    'fixture_drive_missing_position_view',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*primitive 0.*POSITION accessor.*bufferView 99.*missing/,
  'a POSITION accessor that references a missing bufferView must fail',
);

const invalidPositionShape = fixture(STANDARD_HOOKS);
invalidPositionShape.accessors[0].type = 'SCALAR';
assert.throws(
  () => validateEngineDriveSurface(
    invalidPositionShape,
    'fixture_drive_invalid_position_shape',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*primitive 0.*POSITION is invalid/,
  'drive POSITION storage must still use a valid vertex-position type and component encoding',
);

const validSparseUv = fixture(STANDARD_HOOKS);
validSparseUv.buffers[0].byteLength = 92;
validSparseUv.bufferViews.push(
  { buffer: 0, byteOffset: 60, byteLength: 6 },
  { buffer: 0, byteOffset: 68, byteLength: 24 },
);
validSparseUv.accessors[1] = {
  componentType: 5126,
  count: 3,
  type: 'VEC2',
  sparse: {
    count: 3,
    indices: { bufferView: 2, componentType: 5123 },
    values: { bufferView: 3 },
  },
};
assert.doesNotThrow(
  () => validateEngineDriveSurface(validSparseUv, 'fixture_sparse_uv_valid', STANDARD_HOOKS),
  'a drive UV accessor with complete sparse storage should pass without a base bufferView',
);

const undersizedSparseValues = structuredClone(validSparseUv);
undersizedSparseValues.bufferViews[3].byteLength = 23;
assert.throws(
  () => validateEngineDriveSurface(
    undersizedSparseValues,
    'fixture_sparse_uv_undersized_values',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*TEXCOORD_0 accessor.*sparse values bufferView 3.*requires 24 bytes.*provides 23/,
  'sparse values storage must be large enough for accessor component width, type, and sparse count',
);

const missingSparseValuesView = structuredClone(validSparseUv);
missingSparseValuesView.accessors[1].sparse.values.bufferView = 999;
assert.throws(
  () => validateEngineDriveSurface(
    missingSparseValuesView,
    'fixture_sparse_uv_missing_values',
    STANDARD_HOOKS,
  ),
  /HOOK_DRIVE_CORE.*TEXCOORD_0 accessor.*sparse values bufferView 999.*missing/,
  'sparse storage must resolve both indices and values bufferViews',
);

const missingStaticMesh = fixture(STANDARD_HOOKS);
missingStaticMesh.nodes[0].mesh = 999;
assert.throws(
  () => validateEngineDriveSurface(
    missingStaticMesh,
    'fixture_static_missing_mesh',
    STANDARD_HOOKS,
  ),
  /LOD0_\* static engine render mesh.*existing mesh.*primitive.*POSITION/,
  'a numeric LOD0 mesh reference must not count unless it resolves to renderable POSITION geometry',
);

const emptyStaticMesh = fixture(STANDARD_HOOKS);
emptyStaticMesh.meshes[0] = { primitives: [] };
assert.throws(
  () => validateEngineDriveSurface(
    emptyStaticMesh,
    'fixture_static_empty_mesh',
    STANDARD_HOOKS,
  ),
  /LOD0_\* static engine render mesh.*existing mesh.*primitive.*POSITION/,
  'an LOD0 mesh with no primitives must not satisfy the static render-surface contract',
);

assert.throws(
  () => validateEngineDriveSurface(
    fixture(TWIN_HOOKS, 'HOOK_DRIVE_PLUME_S'),
    'fixture_twin_missing_uv',
    TWIN_HOOKS,
  ),
  /HOOK_DRIVE_PLUME_S.*primitive 0.*TEXCOORD_0/,
  'either P/S surface in a paired drive layout must hard-fail when UV0 is absent',
);

assert.doesNotThrow(
  () => validateEngineDriveSurface(fixture(TWIN_HOOKS), 'fixture_twin_valid', TWIN_HOOKS),
  'a valid paired P/S CORE/FAN/PLUME drive layout should pass',
);

console.log('PASS engine drive surface validation: real storage, sparse storage, UV0, static geometry, standard, and twin layouts');
