const DRIVE_ROLES = ['core', 'fan', 'plume'];
const VALID_TEXCOORD_COMPONENT_TYPES = new Set([5121, 5123, 5126]);

export function validateEngineDriveSurface(gltf, partId, declaredHooks = []) {
  const surface = collectEngineDriveSurface(gltf);
  const errors = [];
  const twinLayout = DRIVE_ROLES.every((role) => {
    const upper = role.toUpperCase();
    return declaredHooks.includes(`HOOK_DRIVE_${upper}_P`)
      && declaredHooks.includes(`HOOK_DRIVE_${upper}_S`);
  });

  for (const role of DRIVE_ROLES) {
    const count = surface.driveRenderableCounts[role] || 0;
    const expectedCount = twinLayout ? 2 : 1;
    if (count !== expectedCount) {
      errors.push(`expected exactly ${expectedCount} renderable HOOK_DRIVE_${role.toUpperCase()} surface${expectedCount === 1 ? '' : 's'}, found ${count}`);
    }
  }
  if (surface.staticRenderableCount < 1) {
    errors.push('expected at least one LOD0_* static engine render mesh backed by an existing mesh, primitive, and valid POSITION accessor');
  }

  for (const role of DRIVE_ROLES) {
    const upper = role.toUpperCase();
    const requiredNames = twinLayout
      ? [`HOOK_DRIVE_${upper}_P`, `HOOK_DRIVE_${upper}_S`]
      : [`HOOK_DRIVE_${upper}`];
    for (const requiredName of requiredNames) {
      const record = surface.driveRenderableRecords.find((entry) => entry.normalizedName === requiredName);
      if (!record) {
        errors.push(`required drive node ${requiredName} is missing or is not mesh-bearing`);
        continue;
      }
      validateDriveNodeUv0(gltf, record, requiredName, errors);
    }
  }

  if (errors.length) {
    throw new Error(`engine '${partId}' drive-surface contract failed:\n- ${errors.join('\n- ')}\nDrive nodes: ${surface.driveRenderableNodes.join(',') || '<none>'}`);
  }
  return surface;
}

function validateDriveNodeUv0(gltf, record, requiredName, errors) {
  const mesh = gltf.meshes?.[record.node.mesh];
  const primitives = mesh?.primitives;
  if (!Array.isArray(primitives) || primitives.length === 0) {
    errors.push(`${requiredName} node "${record.displayName}" references a mesh without primitives`);
    return;
  }
  primitives.forEach((primitive, primitiveIndex) => {
    const accessorIndex = primitive?.attributes?.TEXCOORD_0;
    const accessor = Number.isInteger(accessorIndex) ? gltf.accessors?.[accessorIndex] : null;
    const positionAccessorIndex = primitive?.attributes?.POSITION;
    const positionAccessor = Number.isInteger(positionAccessorIndex)
      ? gltf.accessors?.[positionAccessorIndex]
      : null;
    const integerComponent = accessor?.componentType === 5121 || accessor?.componentType === 5123;
    const valid = accessor
      && accessor.type === 'VEC2'
      && Number.isInteger(accessor.count)
      && accessor.count > 0
      && VALID_TEXCOORD_COMPONENT_TYPES.has(accessor.componentType)
      && (!integerComponent || accessor.normalized === true);
    if (!valid) {
      errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} is missing a valid TEXCOORD_0 accessor`);
    } else if (!positionAccessor || !Number.isInteger(positionAccessor.count) || positionAccessor.count <= 0) {
      errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} cannot validate TEXCOORD_0 cardinality because POSITION is invalid`);
    } else if (accessor.count !== positionAccessor.count) {
      errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} has TEXCOORD_0 count ${accessor.count} but POSITION count ${positionAccessor.count}`);
    }
  });
}

export function collectEngineDriveSurface(gltf) {
  const driveRenderableCounts = { core: 0, fan: 0, plume: 0 };
  const driveRenderableNodes = [];
  const driveRenderableRecords = [];
  let staticRenderableCount = 0;
  for (const node of gltf.nodes || []) {
    if (node.mesh == null) continue;
    const normalizedName = normalizeNodeName(node.name);
    const role = driveRoleFromName(normalizedName);
    if (role) {
      const displayName = node.name || '<unnamed>';
      driveRenderableCounts[role]++;
      driveRenderableNodes.push(displayName);
      driveRenderableRecords.push({ role, normalizedName, displayName, node });
    } else if (normalizedName.startsWith('LOD0_') && hasRenderablePositionGeometry(gltf, node.mesh)) {
      staticRenderableCount++;
    }
  }
  return {
    driveRenderableCounts,
    driveRenderableNodes,
    driveRenderableRecords,
    staticRenderableCount,
  };
}

function hasRenderablePositionGeometry(gltf, meshIndex) {
  if (!Number.isInteger(meshIndex)) return false;
  const primitives = gltf.meshes?.[meshIndex]?.primitives;
  if (!Array.isArray(primitives) || primitives.length === 0) return false;
  return primitives.some((primitive) => {
    const accessorIndex = primitive?.attributes?.POSITION;
    const accessor = Number.isInteger(accessorIndex) ? gltf.accessors?.[accessorIndex] : null;
    return accessor?.type === 'VEC3'
      && accessor.componentType === 5126
      && Number.isInteger(accessor.count)
      && accessor.count > 0;
  });
}

function driveRoleFromName(name) {
  if (name === 'HOOK_DRIVE_CORE' || name.startsWith('HOOK_DRIVE_CORE_')) return 'core';
  if (name === 'HOOK_DRIVE_FAN' || name.startsWith('HOOK_DRIVE_FAN_')) return 'fan';
  if (name === 'HOOK_DRIVE_PLUME' || name.startsWith('HOOK_DRIVE_PLUME_')) return 'plume';
  return null;
}

function normalizeNodeName(name) {
  return String(name || '').toUpperCase().replace(/[\s-]+/g, '_');
}
