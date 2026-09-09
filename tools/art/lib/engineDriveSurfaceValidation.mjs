const DRIVE_ROLES = ['core', 'fan', 'plume'];
const VALID_TEXCOORD_COMPONENT_TYPES = new Set([5121, 5123, 5126]);
const VALID_POSITION_COMPONENT_TYPES = new Set([5120, 5121, 5122, 5123, 5126]);
const SPARSE_INDEX_COMPONENT_TYPES = new Set([5121, 5123, 5125]);
const COMPONENT_BYTES = new Map([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);
const TYPE_COMPONENTS = new Map([
  ['SCALAR', 1],
  ['VEC2', 2],
  ['VEC3', 3],
  ['VEC4', 4],
  ['MAT2', 4],
  ['MAT3', 9],
  ['MAT4', 16],
]);

export function validateEngineDriveSurface(gltf, binary, partId, declaredHooks = []) {
  const surface = collectEngineDriveSurface(gltf, binary);
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
    errors.push('expected at least one LOD0_* static engine render mesh backed by an existing mesh, primitive, and valid POSITION accessor with real buffer storage');
  }

  for (const role of DRIVE_ROLES) {
    const upper = role.toUpperCase();
    const requiredNames = twinLayout
      ? [`HOOK_DRIVE_${upper}_P`, `HOOK_DRIVE_${upper}_S`]
      : [`HOOK_DRIVE_${upper}`];
    for (const requiredName of requiredNames) {
      const record = surface.driveNodeRecords.find((entry) => entry.normalizedName === requiredName);
      if (!record) {
        errors.push(`required drive node ${requiredName} is missing or is not mesh-bearing`);
        continue;
      }
      validateDriveNodeUv0(gltf, binary, record, requiredName, errors);
    }
  }

  if (errors.length) {
    throw new Error(`engine '${partId}' drive-surface contract failed:\n- ${errors.join('\n- ')}\nDrive nodes: ${surface.driveRenderableNodes.join(',') || '<none>'}`);
  }
  return surface;
}

function validateDriveNodeUv0(gltf, binary, record, requiredName, errors) {
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
    const integerPositionComponent = positionAccessor
      && positionAccessor.componentType !== 5126;
    const valid = accessor
      && accessor.type === 'VEC2'
      && Number.isInteger(accessor.count)
      && accessor.count > 0
      && VALID_TEXCOORD_COMPONENT_TYPES.has(accessor.componentType)
      && (!integerComponent || accessor.normalized === true);
    const validPosition = positionAccessor
      && positionAccessor.type === 'VEC3'
      && Number.isInteger(positionAccessor.count)
      && positionAccessor.count > 0
      && VALID_POSITION_COMPONENT_TYPES.has(positionAccessor.componentType)
      && (!integerPositionComponent || positionAccessor.normalized === true);
    if (!valid) {
      errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} is missing a valid TEXCOORD_0 accessor`);
    } else if (!validPosition) {
      errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} cannot validate TEXCOORD_0 cardinality because POSITION is invalid`);
    } else {
      const uvStorage = validateAccessorStorage(gltf, binary, accessor, `TEXCOORD_0 accessor`);
      if (!uvStorage.ok) {
        errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} TEXCOORD_0 accessor has invalid storage: ${uvStorage.reason}`);
        return;
      }
      const positionStorage = validateAccessorStorage(gltf, binary, positionAccessor, 'POSITION accessor');
      if (!positionStorage.ok) {
        errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} POSITION accessor has invalid storage: ${positionStorage.reason}`);
        return;
      }
      if (accessor.count !== positionAccessor.count) {
        errors.push(`${requiredName} node "${record.displayName}" primitive ${primitiveIndex} has TEXCOORD_0 count ${accessor.count} but POSITION count ${positionAccessor.count}`);
      }
    }
  });
}

export function collectEngineDriveSurface(gltf, binary) {
  requireActualBinary(binary);
  const driveRenderableCounts = { core: 0, fan: 0, plume: 0 };
  const driveRenderableNodes = [];
  const driveRenderableRecords = [];
  const driveNodeRecords = [];
  let staticRenderableCount = 0;
  for (const node of gltf.nodes || []) {
    if (node.mesh == null) continue;
    const normalizedName = normalizeNodeName(node.name);
    const role = driveRoleFromName(normalizedName);
    if (role) {
      const displayName = node.name || '<unnamed>';
      const record = { role, normalizedName, displayName, node };
      driveNodeRecords.push(record);
      if (hasRenderablePositionGeometry(gltf, binary, node.mesh)) {
        driveRenderableCounts[role]++;
        driveRenderableNodes.push(displayName);
        driveRenderableRecords.push(record);
      }
    } else if (normalizedName.startsWith('LOD0_') && hasRenderablePositionGeometry(gltf, binary, node.mesh)) {
      staticRenderableCount++;
    }
  }
  return {
    driveRenderableCounts,
    driveRenderableNodes,
    driveRenderableRecords,
    driveNodeRecords,
    staticRenderableCount,
  };
}

function hasRenderablePositionGeometry(gltf, binary, meshIndex) {
  if (!Number.isInteger(meshIndex)) return false;
  const primitives = gltf.meshes?.[meshIndex]?.primitives;
  if (!Array.isArray(primitives) || primitives.length === 0) return false;
  return primitives.every((primitive) => {
    const accessorIndex = primitive?.attributes?.POSITION;
    const accessor = Number.isInteger(accessorIndex) ? gltf.accessors?.[accessorIndex] : null;
    return accessor?.type === 'VEC3'
      && accessor.componentType === 5126
      && Number.isInteger(accessor.count)
      && accessor.count > 0
      && validateAccessorStorage(gltf, binary, accessor, 'POSITION accessor').ok;
  });
}

function validateAccessorStorage(gltf, binary, accessor, label) {
  const elementBytes = accessorElementBytes(accessor);
  if (!elementBytes) {
    return { ok: false, reason: `${label} has unsupported componentType/type storage width` };
  }
  const hasBase = accessor.bufferView !== undefined;
  const hasSparse = accessor.sparse !== undefined;
  if (!hasBase && !hasSparse) {
    return { ok: false, reason: `${label} has neither a base bufferView nor sparse storage` };
  }
  if (!hasBase && accessor.byteOffset !== undefined && accessor.byteOffset !== 0) {
    return { ok: false, reason: `${label} byteOffset requires a base bufferView` };
  }
  if (hasBase) {
    const byteOffset = nonNegativeInteger(accessor.byteOffset, 0);
    if (byteOffset === null) {
      return { ok: false, reason: `${label} byteOffset must be a nonnegative integer` };
    }
    const base = validateBufferViewStorage(gltf, binary, accessor.bufferView, `${label} base`, {
      byteOffset,
      count: accessor.count,
      elementBytes,
      componentBytes: COMPONENT_BYTES.get(accessor.componentType),
      allowStride: true,
    });
    if (!base.ok) return base;
  }
  if (hasSparse) {
    const sparse = validateSparseStorage(gltf, binary, accessor, label, elementBytes);
    if (!sparse.ok) return sparse;
  }
  return { ok: true };
}

function validateSparseStorage(gltf, binary, accessor, label, elementBytes) {
  const sparse = accessor.sparse;
  if (!sparse || typeof sparse !== 'object') {
    return { ok: false, reason: `${label} sparse storage must be an object` };
  }
  if (!Number.isInteger(sparse.count) || sparse.count <= 0 || sparse.count > accessor.count) {
    return { ok: false, reason: `${label} sparse count must be positive and no greater than accessor count` };
  }
  const indices = sparse.indices;
  if (!indices || typeof indices !== 'object' || !SPARSE_INDEX_COMPONENT_TYPES.has(indices.componentType)) {
    return { ok: false, reason: `${label} sparse indices require an unsigned byte/short/int component type` };
  }
  const indexOffset = nonNegativeInteger(indices.byteOffset, 0);
  if (indexOffset === null) {
    return { ok: false, reason: `${label} sparse indices byteOffset must be a nonnegative integer` };
  }
  const indexStorage = validateBufferViewStorage(gltf, binary, indices.bufferView, `${label} sparse indices`, {
    byteOffset: indexOffset,
    count: sparse.count,
    elementBytes: COMPONENT_BYTES.get(indices.componentType),
    componentBytes: COMPONENT_BYTES.get(indices.componentType),
    allowStride: false,
  });
  if (!indexStorage.ok) return indexStorage;

  const values = sparse.values;
  if (!values || typeof values !== 'object') {
    return { ok: false, reason: `${label} sparse values storage must be an object` };
  }
  const valuesOffset = nonNegativeInteger(values.byteOffset, 0);
  if (valuesOffset === null) {
    return { ok: false, reason: `${label} sparse values byteOffset must be a nonnegative integer` };
  }
  return validateBufferViewStorage(gltf, binary, values.bufferView, `${label} sparse values`, {
    byteOffset: valuesOffset,
    count: sparse.count,
    elementBytes,
    componentBytes: COMPONENT_BYTES.get(accessor.componentType),
    allowStride: false,
  });
}

function validateBufferViewStorage(gltf, binary, bufferViewIndex, label, sizing) {
  if (!Number.isInteger(bufferViewIndex) || bufferViewIndex < 0) {
    return { ok: false, reason: `${label} bufferView index must be a nonnegative integer` };
  }
  const view = gltf.bufferViews?.[bufferViewIndex];
  if (!view || typeof view !== 'object') {
    return { ok: false, reason: `${label} bufferView ${bufferViewIndex} is missing` };
  }
  if (!Number.isInteger(view.buffer) || view.buffer < 0) {
    return { ok: false, reason: `${label} bufferView ${bufferViewIndex} has an invalid buffer index` };
  }
  const buffer = gltf.buffers?.[view.buffer];
  if (!buffer || typeof buffer !== 'object') {
    return { ok: false, reason: `${label} bufferView ${bufferViewIndex} references missing buffer ${view.buffer}` };
  }
  if (view.buffer !== 0) {
    return { ok: false, reason: `${label} bufferView ${bufferViewIndex} references buffer ${view.buffer}, but a canonical GLB BIN chunk backs only buffer 0` };
  }
  if (!Number.isSafeInteger(buffer.byteLength) || buffer.byteLength <= 0) {
    return { ok: false, reason: `${label} buffer ${view.buffer} must declare a positive byteLength` };
  }
  if (buffer.uri !== undefined) {
    return { ok: false, reason: `${label} buffer ${view.buffer} uses external buffer URI ${JSON.stringify(buffer.uri)}` };
  }
  const viewOffset = nonNegativeInteger(view.byteOffset, 0);
  if (viewOffset === null) {
    return { ok: false, reason: `${label} bufferView ${bufferViewIndex} byteOffset must be a nonnegative integer` };
  }
  if (!Number.isInteger(view.byteLength) || view.byteLength <= 0) {
    return { ok: false, reason: `${label} bufferView ${bufferViewIndex} must declare a positive byteLength` };
  }
  if (viewOffset % 4 !== 0) {
    return { ok: false, reason: `${label} bufferView ${bufferViewIndex} byteOffset ${viewOffset} must be 4-byte aligned` };
  }
  if (viewOffset + view.byteLength > buffer.byteLength) {
    return {
      ok: false,
      reason: `${label} bufferView ${bufferViewIndex} range ${viewOffset + view.byteLength} exceeds buffer ${view.buffer} byteLength ${buffer.byteLength}`,
    };
  }
  if (viewOffset + view.byteLength > binary.byteLength) {
    return {
      ok: false,
      reason: `${label} bufferView ${bufferViewIndex} range ${viewOffset + view.byteLength} exceeds actual BIN length ${binary.byteLength}`,
    };
  }
  if (buffer.byteLength > binary.byteLength) {
    return { ok: false, reason: `${label} buffer 0 declared byteLength ${buffer.byteLength} exceeds actual BIN length ${binary.byteLength}` };
  }
  if (binary.byteLength - buffer.byteLength > 3) {
    return { ok: false, reason: `${label} actual BIN length ${binary.byteLength} exceeds declared buffer byteLength ${buffer.byteLength} by more than GLB padding` };
  }
  if (sizing.byteOffset % sizing.componentBytes !== 0
    || (viewOffset + sizing.byteOffset) % sizing.componentBytes !== 0) {
    return {
      ok: false,
      reason: `${label} accessor byteOffset ${sizing.byteOffset} is not aligned to ${sizing.componentBytes}-byte components`,
    };
  }
  let stride = sizing.elementBytes;
  if (view.byteStride !== undefined) {
    if (!sizing.allowStride) {
      return { ok: false, reason: `${label} bufferView ${bufferViewIndex} must not use byteStride` };
    }
    if (!Number.isInteger(view.byteStride)
      || view.byteStride < sizing.elementBytes
      || view.byteStride % sizing.componentBytes !== 0
      || view.byteStride % 4 !== 0) {
      return { ok: false, reason: `${label} bufferView ${bufferViewIndex} has invalid byteStride ${view.byteStride}` };
    }
    stride = view.byteStride;
  }
  const requiredBytes = sizing.byteOffset
    + (sizing.count > 0 ? stride * (sizing.count - 1) + sizing.elementBytes : 0);
  if (requiredBytes > view.byteLength) {
    return {
      ok: false,
      reason: `${label} bufferView ${bufferViewIndex} requires ${requiredBytes} bytes but provides ${view.byteLength}`,
    };
  }
  return { ok: true };
}

function requireActualBinary(binary) {
  if (!(binary instanceof Uint8Array)) {
    throw new TypeError('actual GLB BIN bytes are required for engine drive-surface validation');
  }
  if (binary.byteLength <= 0) {
    throw new Error(`actual GLB BIN length ${binary.byteLength}; BIN chunk is empty`);
  }
}

function accessorElementBytes(accessor) {
  const componentBytes = COMPONENT_BYTES.get(accessor?.componentType);
  const componentCount = TYPE_COMPONENTS.get(accessor?.type);
  return componentBytes && componentCount ? componentBytes * componentCount : 0;
}

function nonNegativeInteger(value, fallback) {
  if (value === undefined) return fallback;
  return Number.isInteger(value) && value >= 0 ? value : null;
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
