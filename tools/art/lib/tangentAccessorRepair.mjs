import { createHash } from 'node:crypto';

const FLOAT_COMPONENT_TYPE = 5126;
const COMPONENT_BYTES = new Map([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);
const TYPE_SHAPES = new Map([
  ['SCALAR', { columns: 1, rows: 1 }],
  ['VEC2', { columns: 1, rows: 2 }],
  ['VEC3', { columns: 1, rows: 3 }],
  ['VEC4', { columns: 1, rows: 4 }],
  ['MAT2', { columns: 2, rows: 2 }],
  ['MAT3', { columns: 3, rows: 3 }],
  ['MAT4', { columns: 4, rows: 4 }],
]);
const ZERO_LENGTH_EPSILON = 1e-12;
const UNIT_LENGTH_EPSILON = 1e-6;
const ORTHOGONAL_DOT_EPSILON = 1e-6;

/**
 * Repairs the existing float32 TANGENT accessors used by normal-mapped primitives.
 *
 * The input JSON and BIN bytes are never mutated. Only logical TANGENT components can differ in
 * the returned binary. Missing, sparse, external, unsupported, or out-of-range tangent/normal
 * storage fails closed instead of manufacturing an accessor or silently skipping a primitive.
 */
export function repairNormalMappedTangents(gltf, binary, label = 'GLB') {
  requireRoot(gltf, binary, label);
  const output = Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength);
  const repairedBinary = Buffer.from(output);
  const accessorPairs = collectNormalMappedAccessorPairs(gltf, label);
  const repairedAccessorIndexes = [];
  const tangentAccessorIndexes = [];
  const normalAccessorIndexes = [];

  let tangentElementCount = 0;
  let normalizedTangentCount = 0;
  let orthogonalizedTangentCount = 0;
  let replacedTangentCount = 0;
  let canonicalizedHandednessCount = 0;
  let changedTangentCount = 0;

  for (const { tangentAccessorIndex, normalAccessorIndex } of accessorPairs.values()) {
    const tangentStorage = resolveDenseAccessor(
      gltf,
      output,
      tangentAccessorIndex,
      { componentType: FLOAT_COMPONENT_TYPE, type: 'VEC4', positiveCount: true },
      `${label}: TANGENT accessor ${tangentAccessorIndex}`,
    );
    const normalStorage = resolveDenseAccessor(
      gltf,
      output,
      normalAccessorIndex,
      { componentType: FLOAT_COMPONENT_TYPE, type: 'VEC3', positiveCount: true },
      `${label}: NORMAL accessor ${normalAccessorIndex}`,
    );
    if (tangentStorage.count !== normalStorage.count) {
      throw new Error(
        `${label}: TANGENT accessor ${tangentAccessorIndex} count ${tangentStorage.count} `
        + `does not match NORMAL accessor ${normalAccessorIndex} count ${normalStorage.count}`,
      );
    }

    tangentAccessorIndexes.push(tangentAccessorIndex);
    normalAccessorIndexes.push(normalAccessorIndex);
    tangentElementCount += tangentStorage.count;
    let accessorChanged = false;

    for (let elementIndex = 0; elementIndex < tangentStorage.count; elementIndex++) {
      const normal = readFloatElement(output, normalStorage, elementIndex);
      const normalLength = Math.hypot(normal[0], normal[1], normal[2]);
      if (!normal.every(Number.isFinite) || !Number.isFinite(normalLength) || normalLength <= ZERO_LENGTH_EPSILON) {
        throw new Error(
          `${label}: NORMAL accessor ${normalAccessorIndex} element ${elementIndex} `
          + 'must contain a finite, nonzero normal',
        );
      }
      const unitNormal = normal.slice(0, 3).map((component) => component / normalLength);

      const tangent = readFloatElement(output, tangentStorage, elementIndex);
      const tangentLength = Math.hypot(tangent[0], tangent[1], tangent[2]);
      let xyz;
      let normalized = false;
      let orthogonalized = false;
      let replaced = false;
      if (!tangent.slice(0, 3).every(Number.isFinite)
        || !Number.isFinite(tangentLength)
        || tangentLength <= ZERO_LENGTH_EPSILON) {
        xyz = stableOrthogonal(normal);
        replaced = true;
      } else {
        const dot = tangent[0] * unitNormal[0]
          + tangent[1] * unitNormal[1]
          + tangent[2] * unitNormal[2];
        const residual = tangent.slice(0, 3).map(
          (component, index) => component - dot * unitNormal[index],
        );
        const residualLength = Math.hypot(residual[0], residual[1], residual[2]);
        if (!Number.isFinite(residualLength) || residualLength <= ZERO_LENGTH_EPSILON) {
          xyz = stableOrthogonal(normal);
          replaced = true;
        } else {
          xyz = residual.map((component) => component / residualLength);
          normalized = Math.abs(tangentLength - 1) > UNIT_LENGTH_EPSILON;
          orthogonalized = Math.abs(dot / tangentLength) > ORTHOGONAL_DOT_EPSILON;
          if (!normalized && !orthogonalized) xyz = tangent.slice(0, 3);
        }
      }

      const handedness = Number.isFinite(tangent[3]) && tangent[3] < 0 ? -1 : 1;
      const handednessChanged = !Object.is(tangent[3], handedness);
      const xyzChanged = replaced || normalized || orthogonalized;
      if (xyzChanged || handednessChanged) {
        writeFloatElement(
          repairedBinary,
          tangentStorage,
          elementIndex,
          [xyz[0], xyz[1], xyz[2], handedness],
        );
        accessorChanged = true;
        changedTangentCount++;
      }
      if (normalized) normalizedTangentCount++;
      if (orthogonalized) orthogonalizedTangentCount++;
      if (replaced) replacedTangentCount++;
      if (handednessChanged) canonicalizedHandednessCount++;
    }
    if (accessorChanged) repairedAccessorIndexes.push(tangentAccessorIndex);
  }

  const sortedUnique = (indexes) => [...new Set(indexes)].sort((left, right) => left - right);
  return {
    binary: repairedBinary,
    primitiveCount: [...accessorPairs.values()].reduce(
      (total, pair) => total + pair.primitiveCount,
      0,
    ),
    tangentAccessorCount: accessorPairs.size,
    tangentElementCount,
    changedTangentCount,
    normalizedTangentCount,
    orthogonalizedTangentCount,
    replacedTangentCount,
    canonicalizedHandednessCount,
    tangentAccessorIndexes: sortedUnique(tangentAccessorIndexes),
    normalAccessorIndexes: sortedUnique(normalAccessorIndexes),
    repairedAccessorIndexes: sortedUnique(repairedAccessorIndexes),
  };
}

/**
 * Hashes logical accessor component bytes in accessor order.
 *
 * Physical bufferView indexes, byte offsets, strides, and padding are deliberately omitted, so the
 * signature remains stable when identical accessor payloads are repacked. Sparse accessors fail
 * closed: accepting them without materializing their override values would make the proof unsound.
 */
export function accessorContentSignature(
  gltf,
  binary,
  { excludeAccessorIndices = [] } = {},
) {
  requireRoot(gltf, binary, 'accessor signature');
  if (!Array.isArray(gltf.accessors)) {
    throw new Error('accessor signature: accessors must be an array');
  }
  const excluded = normalizeExcludedAccessorIndexes(excludeAccessorIndices, gltf.accessors.length);
  const source = Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength);
  const hash = createHash('sha256');
  hash.update('spaceface-accessor-content-v1\0');

  for (let accessorIndex = 0; accessorIndex < gltf.accessors.length; accessorIndex++) {
    if (excluded.has(accessorIndex)) continue;
    const accessor = gltf.accessors[accessorIndex];
    const layout = accessorLayout(accessor, `accessor signature: accessor ${accessorIndex}`);
    const metadata = JSON.stringify({
      accessorIndex,
      componentType: accessor.componentType,
      type: accessor.type,
      count: accessor.count,
      normalized: accessor.normalized === true,
    });
    hash.update(`${Buffer.byteLength(metadata)}:${metadata}\0`);

    if (accessor.sparse !== undefined) {
      throw new Error(`accessor signature: accessor ${accessorIndex} uses unsupported sparse storage`);
    }
    if (accessor.bufferView === undefined) {
      const zeroComponent = Buffer.alloc(layout.componentBytes);
      for (let elementIndex = 0; elementIndex < accessor.count; elementIndex++) {
        for (let componentIndex = 0; componentIndex < layout.componentOffsets.length; componentIndex++) {
          hash.update(zeroComponent);
        }
      }
      continue;
    }

    const storage = resolveDenseAccessor(
      gltf,
      source,
      accessorIndex,
      {},
      `accessor signature: accessor ${accessorIndex}`,
    );
    for (let elementIndex = 0; elementIndex < storage.count; elementIndex++) {
      const elementStart = storage.start + elementIndex * storage.stride;
      for (const componentOffset of storage.layout.componentOffsets) {
        hash.update(source.subarray(
          elementStart + componentOffset,
          elementStart + componentOffset + storage.layout.componentBytes,
        ));
      }
    }
  }
  return hash.digest('hex');
}

export const deterministicAccessorContentSignature = accessorContentSignature;

function collectNormalMappedAccessorPairs(gltf, label) {
  if (!Array.isArray(gltf.meshes)) throw new Error(`${label}: meshes must be an array`);
  const pairs = new Map();
  gltf.meshes.forEach((mesh, meshIndex) => {
    if (!mesh || typeof mesh !== 'object' || !Array.isArray(mesh.primitives)) {
      throw new Error(`${label}: mesh ${meshIndex} must contain a primitives array`);
    }
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      if (!primitive || typeof primitive !== 'object') {
        throw new Error(`${label}: mesh ${meshIndex} primitive ${primitiveIndex} is malformed`);
      }
      if (primitive.material === undefined) return;
      if (!Number.isInteger(primitive.material) || primitive.material < 0) {
        throw new Error(`${label}: mesh ${meshIndex} primitive ${primitiveIndex} has an invalid material index`);
      }
      const material = gltf.materials?.[primitive.material];
      if (!material || typeof material !== 'object') {
        throw new Error(
          `${label}: mesh ${meshIndex} primitive ${primitiveIndex} references missing material ${primitive.material}`,
        );
      }
      if (material.normalTexture === undefined) return;
      if (!material.normalTexture
        || typeof material.normalTexture !== 'object'
        || !Number.isInteger(material.normalTexture.index)
        || material.normalTexture.index < 0
        || !gltf.textures?.[material.normalTexture.index]) {
        throw new Error(
          `${label}: mesh ${meshIndex} primitive ${primitiveIndex} material ${primitive.material} `
          + 'has an invalid normalTexture binding',
        );
      }
      const tangentAccessorIndex = primitive.attributes?.TANGENT;
      const normalAccessorIndex = primitive.attributes?.NORMAL;
      if (!Number.isInteger(tangentAccessorIndex) || tangentAccessorIndex < 0) {
        throw new Error(
          `${label}: mesh ${meshIndex} primitive ${primitiveIndex} with normalTexture `
          + 'is missing a valid TANGENT accessor index',
        );
      }
      if (!Number.isInteger(normalAccessorIndex) || normalAccessorIndex < 0) {
        throw new Error(
          `${label}: mesh ${meshIndex} primitive ${primitiveIndex} with normalTexture `
          + 'is missing a valid NORMAL accessor index',
        );
      }
      const existing = pairs.get(tangentAccessorIndex);
      if (existing && existing.normalAccessorIndex !== normalAccessorIndex) {
        throw new Error(
          `${label}: TANGENT accessor ${tangentAccessorIndex} is paired with multiple NORMAL accessors `
          + `(${existing.normalAccessorIndex} and ${normalAccessorIndex})`,
        );
      }
      if (existing) {
        existing.primitiveCount++;
      } else {
        pairs.set(tangentAccessorIndex, {
          tangentAccessorIndex,
          normalAccessorIndex,
          primitiveCount: 1,
        });
      }
    });
  });
  return pairs;
}

function resolveDenseAccessor(gltf, binary, accessorIndex, expected, label) {
  if (!Number.isInteger(accessorIndex) || accessorIndex < 0) {
    throw new Error(`${label}: accessor index must be a nonnegative integer`);
  }
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor || typeof accessor !== 'object' || Array.isArray(accessor)) {
    throw new Error(`${label}: accessor is missing or malformed`);
  }
  if (accessor.sparse !== undefined) throw new Error(`${label}: sparse accessors are unsupported`);
  if (expected.componentType !== undefined && accessor.componentType !== expected.componentType) {
    throw new Error(`${label}: requires float32 componentType 5126`);
  }
  if (expected.type !== undefined && accessor.type !== expected.type) {
    throw new Error(`${label}: requires ${expected.type} storage`);
  }
  if (expected.componentType === FLOAT_COMPONENT_TYPE && accessor.normalized === true) {
    throw new Error(`${label}: normalized float32 storage is unsupported`);
  }
  const layout = accessorLayout(accessor, label);
  if (expected.positiveCount && accessor.count <= 0) {
    throw new Error(`${label}: count must be positive`);
  }
  if (!Number.isInteger(accessor.bufferView) || accessor.bufferView < 0) {
    throw new Error(`${label}: missing a valid embedded bufferView`);
  }
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view || typeof view !== 'object' || Array.isArray(view)) {
    throw new Error(`${label}: bufferView ${accessor.bufferView} is missing or malformed`);
  }
  if (view.buffer !== 0) {
    throw new Error(`${label}: bufferView ${accessor.bufferView} must reference embedded buffer 0`);
  }
  const buffer = gltf.buffers?.[0];
  if (!buffer || typeof buffer !== 'object' || Array.isArray(buffer) || buffer.uri !== undefined) {
    throw new Error(`${label}: embedded buffer 0 is missing, malformed, or external`);
  }
  if (!Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0) {
    throw new Error(`${label}: embedded buffer 0 has an invalid byteLength`);
  }

  const viewOffset = nonNegativeInteger(view.byteOffset, 0);
  const accessorOffset = nonNegativeInteger(accessor.byteOffset, 0);
  if (viewOffset === null || accessorOffset === null) {
    throw new Error(`${label}: bufferView/accessor byteOffset must be a nonnegative integer`);
  }
  if (!Number.isSafeInteger(view.byteLength) || view.byteLength <= 0) {
    throw new Error(`${label}: bufferView ${accessor.bufferView} has an invalid byteLength`);
  }
  if (viewOffset % 4 !== 0) {
    throw new Error(`${label}: bufferView ${accessor.bufferView} byteOffset must be 4-byte aligned`);
  }
  if (accessorOffset % layout.componentBytes !== 0
    || (viewOffset + accessorOffset) % layout.componentBytes !== 0) {
    throw new Error(`${label}: accessor storage is not component-aligned`);
  }

  let stride = layout.elementSpan;
  if (view.byteStride !== undefined) {
    if (!Number.isInteger(view.byteStride)
      || view.byteStride < layout.elementSpan
      || view.byteStride > 252
      || view.byteStride % 4 !== 0
      || view.byteStride % layout.componentBytes !== 0) {
      throw new Error(`${label}: bufferView ${accessor.bufferView} has unsupported byteStride ${view.byteStride}`);
    }
    stride = view.byteStride;
  }
  const requiredInView = accessorOffset
    + (accessor.count > 0 ? stride * (accessor.count - 1) + layout.elementSpan : 0);
  if (!Number.isSafeInteger(requiredInView) || requiredInView > view.byteLength) {
    throw new Error(
      `${label}: accessor range requires ${requiredInView} bytes but bufferView `
      + `${accessor.bufferView} provides ${view.byteLength}`,
    );
  }
  const viewEnd = viewOffset + view.byteLength;
  if (!Number.isSafeInteger(viewEnd)
    || viewEnd > buffer.byteLength
    || viewEnd > binary.byteLength) {
    throw new Error(
      `${label}: bufferView ${accessor.bufferView} range ends outside embedded buffer/BIN storage`,
    );
  }
  if (buffer.byteLength > binary.byteLength || binary.byteLength - buffer.byteLength > 3) {
    throw new Error(`${label}: embedded buffer byteLength does not match physical BIN storage`);
  }

  return {
    accessorIndex,
    count: accessor.count,
    start: viewOffset + accessorOffset,
    stride,
    layout,
  };
}

function accessorLayout(accessor, label) {
  if (!accessor || typeof accessor !== 'object' || Array.isArray(accessor)) {
    throw new Error(`${label}: accessor is malformed`);
  }
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType);
  const shape = TYPE_SHAPES.get(accessor.type);
  if (!componentBytes || !shape) {
    throw new Error(`${label}: unsupported componentType/type`);
  }
  if (!Number.isSafeInteger(accessor.count) || accessor.count < 0) {
    throw new Error(`${label}: count must be a nonnegative safe integer`);
  }

  const columnBytes = shape.rows * componentBytes;
  const columnStride = shape.columns > 1 ? align4(columnBytes) : columnBytes;
  const componentOffsets = [];
  for (let column = 0; column < shape.columns; column++) {
    for (let row = 0; row < shape.rows; row++) {
      componentOffsets.push(column * columnStride + row * componentBytes);
    }
  }
  return {
    componentBytes,
    componentOffsets,
    elementSpan: shape.columns * columnStride,
  };
}

function readFloatElement(binary, storage, elementIndex) {
  const start = storage.start + elementIndex * storage.stride;
  return storage.layout.componentOffsets.map((componentOffset) => (
    binary.readFloatLE(start + componentOffset)
  ));
}

function writeFloatElement(binary, storage, elementIndex, values) {
  const start = storage.start + elementIndex * storage.stride;
  values.forEach((value, componentIndex) => {
    binary.writeFloatLE(
      value,
      start + storage.layout.componentOffsets[componentIndex],
    );
  });
}

function stableOrthogonal([sourceX, sourceY, sourceZ]) {
  const normalLength = Math.hypot(sourceX, sourceY, sourceZ);
  const nx = sourceX / normalLength;
  const ny = sourceY / normalLength;
  const nz = sourceZ / normalLength;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  if (Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)) rx = 1;
  else if (Math.abs(ny) <= Math.abs(nz)) ry = 1;
  else rz = 1;
  const fx = ry * nz - rz * ny;
  const fy = rz * nx - rx * nz;
  const fz = rx * ny - ry * nx;
  const length = Math.hypot(fx, fy, fz);
  return [fx / length, fy / length, fz / length];
}

function requireRoot(gltf, binary, label) {
  if (!gltf || typeof gltf !== 'object' || Array.isArray(gltf)) {
    throw new TypeError(`${label}: glTF root must be an object`);
  }
  if (!(binary instanceof Uint8Array)) {
    throw new TypeError(`${label}: actual embedded BIN bytes must be a Uint8Array`);
  }
}

function normalizeExcludedAccessorIndexes(value, accessorCount) {
  const values = value instanceof Set ? [...value] : value;
  if (!Array.isArray(values)) {
    throw new TypeError('accessor signature: excludeAccessorIndices must be an array or Set');
  }
  const excluded = new Set();
  for (const index of values) {
    if (!Number.isInteger(index) || index < 0 || index >= accessorCount) {
      throw new Error(`accessor signature: excluded accessor index ${index} is out of range`);
    }
    excluded.add(index);
  }
  return excluded;
}

function nonNegativeInteger(value, fallback) {
  if (value === undefined) return fallback;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function align4(value) {
  return (value + 3) & ~3;
}
