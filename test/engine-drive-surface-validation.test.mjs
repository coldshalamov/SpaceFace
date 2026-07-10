import assert from 'node:assert/strict';

let validateEngineDriveSurface = () => undefined;
try {
  ({ validateEngineDriveSurface } = await import('../tools/art/lib/engineDriveSurfaceValidation.mjs'));
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
    { componentType: 5126, count: 3, type: 'VEC3' },
    { componentType: 5126, count: 3, type: 'VEC2' },
  ];
  const meshes = [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }];
  const nodes = [{ name: 'LOD0_ENGINE_FIXTURE', mesh: 0 }];
  for (const hook of hooks) {
    const attributes = { POSITION: 0 };
    if (hook !== missingUvNode) attributes.TEXCOORD_0 = 1;
    nodes.push({ name: hook, mesh: meshes.length });
    meshes.push({ primitives: [{ attributes }] });
  }
  return { accessors, meshes, nodes };
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

console.log('PASS engine drive surface validation: UV0, static geometry, standard, and twin layouts');
