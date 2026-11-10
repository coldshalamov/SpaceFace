import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accessorContentSignature,
  repairNormalMappedTangents,
} from '../tools/art/lib/tangentAccessorRepair.mjs';

function makeFixture() {
  const binary = Buffer.alloc(256, 0x5a);
  const normalViewOffset = 16;
  const normalAccessorOffset = 4;
  const normalStride = 20;
  const tangentViewOffset = 112;
  const tangentAccessorOffset = 8;
  const tangentStride = 24;
  const normals = [
    [0, 0, 1],
    [0, 0, 2],
    [0, 1, 0],
    [1, 0, 0],
  ];
  const tangents = [
    [2, 0, 0, 0.25],
    [0, 0, 0, -0],
    [Number.NaN, 1, 0, -2],
    [0, 1, 0, -1],
  ];
  normals.forEach((normal, index) => writeVec(
    binary,
    normalViewOffset + normalAccessorOffset + index * normalStride,
    normal,
  ));
  tangents.forEach((tangent, index) => writeVec(
    binary,
    tangentViewOffset + tangentAccessorOffset + index * tangentStride,
    tangent,
  ));

  return {
    binary,
    gltf: {
      accessors: [
        {
          bufferView: 0,
          byteOffset: normalAccessorOffset,
          componentType: 5126,
          count: normals.length,
          type: 'VEC3',
        },
        {
          bufferView: 1,
          byteOffset: tangentAccessorOffset,
          componentType: 5126,
          count: tangents.length,
          type: 'VEC4',
        },
      ],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: normalViewOffset,
          byteLength: normalAccessorOffset + normalStride * (normals.length - 1) + 12,
          byteStride: normalStride,
        },
        {
          buffer: 0,
          byteOffset: tangentViewOffset,
          byteLength: tangentAccessorOffset + tangentStride * (tangents.length - 1) + 16,
          byteStride: tangentStride,
        },
      ],
      materials: [{ normalTexture: { index: 0 } }],
      meshes: [{
        primitives: [{
          attributes: { NORMAL: 0, TANGENT: 1 },
          material: 0,
        }],
      }],
      textures: [{}],
    },
    offsets: {
      normalViewOffset,
      normalAccessorOffset,
      normalStride,
      tangentViewOffset,
      tangentAccessorOffset,
      tangentStride,
    },
  };
}

test('repairs strided/offset float tangents without mutating input or unrelated bytes', () => {
  const fixture = makeFixture();
  const before = Buffer.from(fixture.binary);
  const result = repairNormalMappedTangents(fixture.gltf, fixture.binary, 'fixture');

  assert.deepEqual(result, {
    ...result,
    primitiveCount: 1,
    tangentAccessorCount: 1,
    tangentElementCount: 4,
    changedTangentCount: 3,
    normalizedTangentCount: 1,
    orthogonalizedTangentCount: 0,
    replacedTangentCount: 2,
    canonicalizedHandednessCount: 3,
    tangentAccessorIndexes: [1],
    normalAccessorIndexes: [0],
    repairedAccessorIndexes: [1],
  });
  assert.deepEqual(fixture.binary, before, 'the caller-owned BIN bytes are immutable');
  assert.notStrictEqual(result.binary, fixture.binary);

  const { tangentViewOffset, tangentAccessorOffset, tangentStride } = fixture.offsets;
  assertVecClose(readVec(result.binary, tangentViewOffset + tangentAccessorOffset, 4), [1, 0, 0, 1]);
  assertVecClose(readVec(result.binary, tangentViewOffset + tangentAccessorOffset + tangentStride, 4), [0, -1, 0, 1]);
  assertVecClose(readVec(result.binary, tangentViewOffset + tangentAccessorOffset + tangentStride * 2, 4), [0, 0, 1, -1]);
  assertVecClose(readVec(result.binary, tangentViewOffset + tangentAccessorOffset + tangentStride * 3, 4), [0, 1, 0, -1]);

  const tangentComponentBytes = new Set();
  for (let elementIndex = 0; elementIndex < 4; elementIndex++) {
    const start = tangentViewOffset + tangentAccessorOffset + elementIndex * tangentStride;
    for (let offset = start; offset < start + 16; offset++) tangentComponentBytes.add(offset);
  }
  for (let offset = 0; offset < before.length; offset++) {
    if (!tangentComponentBytes.has(offset)) {
      assert.equal(result.binary[offset], before[offset], `unrelated BIN byte ${offset} changed`);
    }
  }
});

test('orthogonalizes skew tangents and replaces tangents parallel to their normals', () => {
  const fixture = makeFixture();
  const {
    tangentViewOffset,
    tangentAccessorOffset,
    tangentStride,
    normalViewOffset,
    normalAccessorOffset,
    normalStride,
  } = fixture.offsets;
  writeVec(
    fixture.binary,
    tangentViewOffset + tangentAccessorOffset,
    [1, 0, 1, 1],
  );
  writeVec(
    fixture.binary,
    tangentViewOffset + tangentAccessorOffset + tangentStride,
    [0, 0, 1, -1],
  );

  const result = repairNormalMappedTangents(fixture.gltf, fixture.binary, 'basis fixture');
  assert.equal(result.orthogonalizedTangentCount, 1);
  assert.equal(result.replacedTangentCount, 2);

  for (let index = 0; index < 4; index++) {
    const normal = readVec(
      fixture.binary,
      normalViewOffset + normalAccessorOffset + index * normalStride,
      3,
    );
    const tangent = readVec(
      result.binary,
      tangentViewOffset + tangentAccessorOffset + index * tangentStride,
      4,
    );
    const normalLength = Math.hypot(...normal);
    const tangentLength = Math.hypot(...tangent.slice(0, 3));
    const dot = normal.reduce(
      (sum, component, componentIndex) => (
        sum + (component / normalLength) * tangent[componentIndex]
      ),
      0,
    );
    assert.ok(Math.abs(tangentLength - 1) <= 1e-6, `tangent ${index} is unit length`);
    assert.ok(Math.abs(dot) <= 1e-6, `tangent ${index} is orthogonal to its normal`);
  }
});

test('logical accessor signatures ignore repacking and can exclude repaired tangent payloads', () => {
  const fixture = makeFixture();
  const result = repairNormalMappedTangents(fixture.gltf, fixture.binary, 'signature fixture');

  assert.equal(
    accessorContentSignature(fixture.gltf, fixture.binary, { excludeAccessorIndices: [1] }),
    accessorContentSignature(fixture.gltf, result.binary, { excludeAccessorIndices: new Set([1]) }),
    'excluding TANGENT proves every other logical accessor payload is unchanged',
  );
  assert.notEqual(
    accessorContentSignature(fixture.gltf, fixture.binary),
    accessorContentSignature(fixture.gltf, result.binary),
    'the full signature detects the tangent repair',
  );

  const repacked = repackFixture(fixture.gltf, fixture.binary);
  assert.equal(
    accessorContentSignature(fixture.gltf, fixture.binary),
    accessorContentSignature(repacked.gltf, repacked.binary),
    'bufferView offsets, accessor offsets, strides, and padding are not content',
  );
  repacked.binary.writeFloatLE(
    0.5,
    repacked.gltf.bufferViews[0].byteOffset + repacked.gltf.accessors[0].byteOffset,
  );
  assert.notEqual(
    accessorContentSignature(fixture.gltf, fixture.binary, { excludeAccessorIndices: [1] }),
    accessorContentSignature(repacked.gltf, repacked.binary, { excludeAccessorIndices: [1] }),
    'an unrelated accessor mutation remains visible when tangents are excluded',
  );
});

test('a shared tangent accessor is repaired once and reports every bound primitive', () => {
  const fixture = makeFixture();
  fixture.gltf.meshes[0].primitives.push(structuredClone(fixture.gltf.meshes[0].primitives[0]));
  const result = repairNormalMappedTangents(fixture.gltf, fixture.binary, 'shared');
  assert.equal(result.primitiveCount, 2);
  assert.equal(result.tangentAccessorCount, 1);
  assert.equal(result.tangentElementCount, 4);
});

test('normal-mapped primitives fail closed on missing or unsupported accessors', () => {
  const cases = [
    {
      name: 'missing tangent',
      mutate(gltf) {
        delete gltf.meshes[0].primitives[0].attributes.TANGENT;
      },
      expected: /missing a valid TANGENT accessor index/,
    },
    {
      name: 'missing normal',
      mutate(gltf) {
        delete gltf.meshes[0].primitives[0].attributes.NORMAL;
      },
      expected: /missing a valid NORMAL accessor index/,
    },
    {
      name: 'integer tangent',
      mutate(gltf) {
        gltf.accessors[1].componentType = 5123;
      },
      expected: /requires float32 componentType 5126/,
    },
    {
      name: 'sparse tangent',
      mutate(gltf) {
        gltf.accessors[1].sparse = {
          count: 1,
          indices: { bufferView: 1, componentType: 5121 },
          values: { bufferView: 1 },
        };
      },
      expected: /sparse accessors are unsupported/,
    },
    {
      name: 'out of bounds',
      mutate(gltf) {
        gltf.bufferViews[1].byteLength -= 1;
      },
      expected: /accessor range requires .* provides/,
    },
    {
      name: 'external normal',
      mutate(gltf) {
        gltf.buffers[0].uri = 'normal.bin';
      },
      expected: /embedded buffer 0 is missing, malformed, or external/,
    },
    {
      name: 'nonfinite normal',
      mutate(gltf, binary, offsets) {
        binary.writeFloatLE(
          Number.NaN,
          offsets.normalViewOffset + offsets.normalAccessorOffset,
        );
      },
      expected: /must contain a finite, nonzero normal/,
    },
  ];

  for (const { name, mutate, expected } of cases) {
    const fixture = makeFixture();
    mutate(fixture.gltf, fixture.binary, fixture.offsets);
    assert.throws(
      () => repairNormalMappedTangents(fixture.gltf, fixture.binary, name),
      expected,
      name,
    );
  }
});

test('accessor signatures reject sparse payloads instead of producing an incomplete proof', () => {
  const fixture = makeFixture();
  fixture.gltf.accessors[0].sparse = {
    count: 1,
    indices: { bufferView: 0, componentType: 5121 },
    values: { bufferView: 0 },
  };
  assert.throws(
    () => accessorContentSignature(fixture.gltf, fixture.binary),
    /unsupported sparse storage/,
  );
});

function repackFixture(sourceGltf, sourceBinary) {
  const gltf = structuredClone(sourceGltf);
  const binary = Buffer.alloc(320, 0xa7);
  gltf.buffers[0].byteLength = binary.length;
  gltf.bufferViews[0] = {
    buffer: 0,
    byteOffset: 32,
    byteLength: 8 + 28 * 3 + 12,
    byteStride: 28,
  };
  gltf.accessors[0].byteOffset = 8;
  gltf.bufferViews[1] = {
    buffer: 0,
    byteOffset: 160,
    byteLength: 4 + 20 * 3 + 16,
    byteStride: 20,
  };
  gltf.accessors[1].byteOffset = 4;

  copyAccessor(sourceGltf, sourceBinary, 0, gltf, binary);
  copyAccessor(sourceGltf, sourceBinary, 1, gltf, binary);
  return { gltf, binary };
}

function copyAccessor(sourceGltf, sourceBinary, accessorIndex, targetGltf, targetBinary) {
  const sourceAccessor = sourceGltf.accessors[accessorIndex];
  const sourceView = sourceGltf.bufferViews[sourceAccessor.bufferView];
  const targetAccessor = targetGltf.accessors[accessorIndex];
  const targetView = targetGltf.bufferViews[targetAccessor.bufferView];
  const components = sourceAccessor.type === 'VEC3' ? 3 : 4;
  const sourceStride = sourceView.byteStride || components * 4;
  const targetStride = targetView.byteStride || components * 4;
  for (let elementIndex = 0; elementIndex < sourceAccessor.count; elementIndex++) {
    const sourceStart = (sourceView.byteOffset || 0)
      + (sourceAccessor.byteOffset || 0)
      + elementIndex * sourceStride;
    const targetStart = (targetView.byteOffset || 0)
      + (targetAccessor.byteOffset || 0)
      + elementIndex * targetStride;
    sourceBinary.copy(targetBinary, targetStart, sourceStart, sourceStart + components * 4);
  }
}

function writeVec(binary, offset, values) {
  values.forEach((value, index) => binary.writeFloatLE(value, offset + index * 4));
}

function readVec(binary, offset, componentCount) {
  return Array.from(
    { length: componentCount },
    (_, index) => binary.readFloatLE(offset + index * 4),
  );
}

function assertVecClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= 1e-6,
      `component ${index}: expected ${expected[index]}, received ${value}`,
    );
  });
}
