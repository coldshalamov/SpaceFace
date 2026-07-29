import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER = resolve(ROOT, 'tools/blender/build_m4_ashline_v2.py');
const SOURCE = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_rig.glb',
);
const CANDIDATE = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/release_candidates/wholeships/ashline_v2_rig.glb',
);
const SUMMARY = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/evidence/rig/build_summary.json',
);

const SOCKETS = {
  SOCKET_Camera_Focus: { translation: [0.15, 0.35, 0], role: 'camera', forward: [1, 0, 0] },
  SOCKET_Cargo_Ventral: { translation: [0.55, -2.05, 0], role: 'cargo', forward: [0, -1, 0] },
  SOCKET_Engine_Main: { translation: [-8.55, 0, 0.2], role: 'engine', forward: [-1, 0, 0] },
  SOCKET_Mining_Front: { translation: [8.55, -0.75, -1.9], role: 'mining', forward: [1, 0, 0] },
  SOCKET_RCS_Port: { translation: [1.35, 0.25, -3.4], role: 'vfx', forward: [0, 0, -1] },
  SOCKET_RCS_Starboard: { translation: [1.35, 0.25, 2.7], role: 'vfx', forward: [0, 0, 1] },
  SOCKET_Trail_Main: { translation: [-8.9, 0, 0.2], role: 'vfx', forward: [-1, 0, 0] },
  SOCKET_Utility_Dorsal: { translation: [-0.25, 3.05, 0], role: 'utility', forward: [0, 1, 0] },
  SOCKET_Weapon_Front: { translation: [6.9, 0.45, 0.7], role: 'weapon', forward: [1, 0, 0] },
};
const RIG_BOUNDS = [18.5, 6.601560115814209, 11.493575096130371];
const COMPONENT_COUNTS = {
  boomChord: 4,
  boomWeb: 6,
  captureRootDoubler: 2,
  jawClevis: 4,
  jawArm: 2,
  jawKeeper: 2,
  jawPad: 6,
  tetherDrum: 1,
  drumCableWrap: 1,
  tetherFairlead: 1,
  braidedCable: 1,
  drumBearing: 2,
  drumBrake: 1,
  drumGuard: 2,
  hydraulicCylinder: 2,
  drivePressureCase: 2,
  driveBell: 2,
  driveRefractoryThroat: 2,
  driveSaddle: 2,
  driveValvePack: 2,
};
const COLLISION_CONTRACT = {
  schema: 'spaceface.rigCompoundCollision.v1',
  helpers: [
    {
      name: 'COLLISION_HULL_00', compoundIndex: 0, translation: [-6.166666507720947, 0, 0],
      bounds: { min: [-3.3299999237060547, -2.7726552486419678, -4.827301502227783], max: [3.3299999237060547, 2.7726552486419678, 4.827301502227783] },
    },
    {
      name: 'COLLISION_HULL_01', compoundIndex: 1, translation: [0, 0, 0],
      bounds: { min: [-3.3299999237060547, -3.036717653274536, -5.287044525146484], max: [3.3299999237060547, 3.036717653274536, 5.287044525146484] },
    },
    {
      name: 'COLLISION_HULL_02', compoundIndex: 2, translation: [6.166666507720947, 0, 0],
      bounds: { min: [-3.3299999237060547, -2.7726552486419678, -4.827301502227783], max: [3.3299999237060547, 2.7726552486419678, 4.827301502227783] },
    },
  ],
};
const SEMANTIC_BOUNDS_SCHEMA = 'spaceface.m4-ashline-v2.rig-semantic-bounds.v1';
const SEMANTIC_GROUPS = {
  capture: ['Hook_BoomChord_', 'Hook_BoomWeb_', 'Hook_BoomRootDoubler_', 'Hook_ClevisEar_'],
  jaw: ['Hook_ClevisEar_', 'Hook_JawArm_', 'Hook_JawHydraulicCase_'],
  winch: ['Hook_TetherDrum_Grooved', 'Hook_TetherFairlead_', 'Hook_TetherGuard_'],
  drives: ['Hook_DrivePressureCase_', 'Hook_DriveBell_', 'Hook_DriveTrussWeb_', 'Hook_DriveThrustSaddle_'],
};

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').toUpperCase();
}

function glbDocument(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  let offset = 12;
  let json;
  let binary = Buffer.alloc(0);
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'JSON') json = JSON.parse(data.toString('utf8').replace(/\0+$/u, '').trim());
    if (type === 'BIN\0') binary = data;
    offset += 8 + length;
  }
  return { json, binary };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function identity(value) {
  return value ?? [1, 1, 1];
}

function rotateQuaternion([x, y, z], [qx, qy, qz, qw]) {
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function transformPoint(point, node) {
  if (node.matrix) {
    const m = node.matrix;
    return [
      m[0] * point[0] + m[4] * point[1] + m[8] * point[2] + m[12],
      m[1] * point[0] + m[5] * point[1] + m[9] * point[2] + m[13],
      m[2] * point[0] + m[6] * point[1] + m[10] * point[2] + m[14],
    ];
  }
  const scale = node.scale ?? [1, 1, 1];
  const scaled = point.map((value, index) => value * scale[index]);
  const rotated = rotateQuaternion(scaled, node.rotation ?? [0, 0, 0, 1]);
  return rotated.map((value, index) => value + (node.translation?.[index] ?? 0));
}

function accessorPositions(gltf, binary, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  assert.equal(accessor.type, 'VEC3');
  assert.equal(accessor.componentType, 5126, 'POSITION must remain float32');
  const view = gltf.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? 12;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const at = start + index * stride;
    values.push([binary.readFloatLE(at), binary.readFloatLE(at + 4), binary.readFloatLE(at + 8)]);
  }
  return values;
}

function accessorValues(gltf, binary, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const components = {
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4,
  }[accessor.type];
  assert.ok(components, `unsupported accessor type ${accessor.type}`);
  const component = {
    5120: { bytes: 1, read: (at) => binary.readInt8(at) },
    5121: { bytes: 1, read: (at) => binary.readUInt8(at) },
    5122: { bytes: 2, read: (at) => binary.readInt16LE(at) },
    5123: { bytes: 2, read: (at) => binary.readUInt16LE(at) },
    5125: { bytes: 4, read: (at) => binary.readUInt32LE(at) },
    5126: { bytes: 4, read: (at) => binary.readFloatLE(at) },
  }[accessor.componentType];
  assert.ok(component, `unsupported component type ${accessor.componentType}`);
  const view = gltf.bufferViews[accessor.bufferView];
  const packedStride = component.bytes * components;
  const stride = view.byteStride ?? packedStride;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const rows = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const row = [];
    for (let axis = 0; axis < components; axis += 1) {
      row.push(component.read(start + index * stride + axis * component.bytes));
    }
    rows.push(components === 1 ? row[0] : row);
  }
  return rows;
}

function collisionUnion(gltf, binary, collisionNodes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of collisionNodes) {
    for (const primitive of gltf.meshes[node.mesh].primitives ?? []) {
      for (const point of accessorPositions(gltf, binary, primitive.attributes.POSITION)) {
        const transformed = transformPoint(point, node);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], transformed[axis]);
          max[axis] = Math.max(max[axis], transformed[axis]);
        }
      }
    }
  }
  return {
    basis: 'root-local-aabb',
    min,
    max,
    helpers: collisionNodes.map((node) => node.name).sort(),
    size: max.map((value, axis) => value - min[axis]),
  };
}

function visibleLod0Contract(gltf, binary, authoredComponents) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visualNodes = [];
  for (const node of gltf.nodes ?? []) {
    const sf = node.extras?.spaceface ?? {};
    if (node.mesh === undefined || sf.lod !== 'lod0' || sf.nonRender === true || sf.collision === true) {
      continue;
    }
    const materials = new Set();
    for (const primitive of gltf.meshes[node.mesh].primitives ?? []) {
      materials.add(gltf.materials[primitive.material]?.name);
      for (const point of accessorPositions(gltf, binary, primitive.attributes.POSITION)) {
        const transformed = transformPoint(point, node);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], transformed[axis]);
          max[axis] = Math.max(max[axis], transformed[axis]);
        }
      }
    }
    visualNodes.push({
      name: node.name,
      materials: [...materials].filter(Boolean).sort(),
    });
  }
  visualNodes.sort((left, right) => left.name.localeCompare(right.name));
  assert.ok(visualNodes.length > 0, 'visible LOD0 contract has no contributing nodes');
  return {
    visualNodes,
    min: { x: min[0], y: min[1], z: min[2] },
    max: { x: max[0], y: max[1], z: max[2] },
    center: {
      x: (min[0] + max[0]) * 0.5,
      y: (min[1] + max[1]) * 0.5,
      z: (min[2] + max[2]) * 0.5,
    },
    size: {
      x: max[0] - min[0],
      y: max[1] - min[1],
      z: max[2] - min[2],
    },
    components: authoredComponents,
  };
}

function assertNoDegenerateExportPrimitives(gltf, binary) {
  let triangleCount = 0;
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const primitive of gltf.meshes[node.mesh].primitives ?? []) {
      assert.equal(primitive.mode ?? 4, 4, `${node.name} must export triangles`);
      const positions = accessorValues(gltf, binary, primitive.attributes.POSITION);
      const normals = accessorValues(gltf, binary, primitive.attributes.NORMAL);
      const tangents = accessorValues(gltf, binary, primitive.attributes.TANGENT);
      const uvs = accessorValues(gltf, binary, primitive.attributes.TEXCOORD_0);
      for (const [attribute, rows] of Object.entries({ positions, normals, tangents, uvs })) {
        for (const row of rows) {
          const values = Array.isArray(row) ? row : [row];
          assert.ok(values.every(Number.isFinite), `${node.name} has non-finite ${attribute}`);
        }
      }
      const indices = accessorValues(gltf, binary, primitive.indices);
      assert.equal(indices.length % 3, 0, `${node.name} index count is not triangular`);
      for (let index = 0; index < indices.length; index += 3) {
        const [a, b, c] = indices.slice(index, index + 3).map((vertex) => positions[vertex]);
        const ab = b.map((value, axis) => value - a[axis]);
        const ac = c.map((value, axis) => value - a[axis]);
        const cross = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const doubledArea = Math.hypot(...cross);
        assert.ok(doubledArea > 1e-12, `${node.name} triangle ${index / 3} has zero area`);
        triangleCount += 1;
      }
    }
  }
  return triangleCount;
}

function lodAabbExtents(gltf, binary, lod) {
  const points = [];
  for (const node of gltf.nodes ?? []) {
    if (!node.name?.startsWith(`${lod}_`) || node.mesh === undefined) continue;
    for (const primitive of gltf.meshes[node.mesh].primitives ?? []) {
      for (const point of accessorPositions(gltf, binary, primitive.attributes.POSITION)) {
        points.push(transformPoint(point, node));
      }
    }
  }
  assert.ok(points.length > 0, `${lod} has no render positions`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

function lodAabb(gltf, binary, lod) {
  return lodAabbExtents(gltf, binary, lod).size;
}

function assertSemanticBounds(bounds, lod0Extents) {
  assert.equal(bounds?.schema, SEMANTIC_BOUNDS_SCHEMA);
  assert.equal(bounds?.basis, 'rig-root-local-aabb');
  const groups = bounds.groups;
  assert.deepEqual(
    Object.keys(groups).sort(),
    ['authoredRig', 'capture', 'drives', 'fullRig', 'jaw', 'winch'],
  );
  const tolerance = 1e-5;
  const uniqueMembers = new Set();
  for (const [groupId, requiredPrefixes] of Object.entries(SEMANTIC_GROUPS)) {
    const group = groups[groupId];
    assert.ok(Array.isArray(group?.components) && group.components.length > 0, `${groupId} components`);
    assert.deepEqual(group.components, [...new Set(group.components)].sort(), `${groupId} components must be sorted and unique`);
    for (const prefix of requiredPrefixes) {
      assert.ok(group.components.some((name) => name.startsWith(prefix)), `${groupId} misses ${prefix}`);
    }
    for (const name of group.components) {
      assert.ok(name.startsWith('Hook_'), `${groupId} contributor must remain authored Hook_*: ${name}`);
      uniqueMembers.add(name);
    }
    for (const axis of ['x', 'y', 'z']) {
      const min = group.min?.[axis];
      const max = group.max?.[axis];
      const center = group.center?.[axis];
      const size = group.size?.[axis];
      assert.ok(Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(center) && Number.isFinite(size),
        `${groupId}.${axis} must be finite`);
      assert.ok(max > min && size > 0, `${groupId}.${axis} must be nondegenerate`);
      assert.ok(Math.abs(center - (min + max) * 0.5) <= tolerance, `${groupId}.${axis} center drifted`);
      assert.ok(Math.abs(size - (max - min)) <= tolerance, `${groupId}.${axis} size drifted`);
      const axisIndex = ['x', 'y', 'z'].indexOf(axis);
      assert.ok(min >= lod0Extents.min[axisIndex] - tolerance, `${groupId}.${axis} lies before LOD0`);
      assert.ok(max <= lod0Extents.max[axisIndex] + tolerance, `${groupId}.${axis} lies beyond LOD0`);
    }
  }
  assert.deepEqual(groups.authoredRig.components, [...uniqueMembers].sort(), 'authored Rig must union the four subjects');
  for (const axis of ['x', 'y', 'z']) {
    const authored = groups.authoredRig;
    assert.ok(Number.isFinite(authored.min?.[axis]) && Number.isFinite(authored.max?.[axis]));
    assert.ok(authored.max[axis] > authored.min[axis], `authored Rig ${axis} is degenerate`);
    assert.ok(
      authored.min[axis] >= groups.fullRig.min[axis]
      && authored.max[axis] <= groups.fullRig.max[axis],
      `fullRig does not contain authoredRig on ${axis}`,
    );
  }
}

function materialBindings(gltf, lod) {
  const names = new Set();
  for (const node of gltf.nodes ?? []) {
    if (!node.name?.startsWith(`${lod}_`) || node.mesh === undefined) continue;
    for (const primitive of gltf.meshes[node.mesh].primitives ?? []) {
      names.add(gltf.materials[primitive.material]?.name);
    }
  }
  return names;
}

function embeddedImage(gltf, binary, name) {
  const image = (gltf.images ?? []).find((candidate) => candidate.name === name);
  assert.ok(image, `${name} embedded image missing`);
  assert.ok(Number.isInteger(image.bufferView), `${name} must remain embedded`);
  const view = gltf.bufferViews[image.bufferView];
  const start = view.byteOffset ?? 0;
  return binary.subarray(start, start + view.byteLength);
}

function averageBoundaryDelta(data, width, height, channel, axis, boundaries) {
  let total = 0;
  let samples = 0;
  if (axis === 'x') {
    for (const x of boundaries) {
      for (let y = 0; y < height; y += 1) {
        const left = (y * width + x - 1) * 4 + channel;
        const right = (y * width + x) * 4 + channel;
        total += Math.abs(data[left] - data[right]);
        samples += 1;
      }
    }
  } else {
    for (const y of boundaries) {
      for (let x = 0; x < width; x += 1) {
        const above = ((y - 1) * width + x) * 4 + channel;
        const below = (y * width + x) * 4 + channel;
        total += Math.abs(data[above] - data[below]);
        samples += 1;
      }
    }
  }
  return total / samples;
}

function averageAdjacentDelta(data, width, height, channel, axis) {
  let total = 0;
  let samples = 0;
  if (axis === 'x') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 1; x < width; x += 1) {
        total += Math.abs(
          data[(y * width + x - 1) * 4 + channel]
          - data[(y * width + x) * 4 + channel],
        );
        samples += 1;
      }
    }
  } else {
    for (let y = 1; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        total += Math.abs(
          data[((y - 1) * width + x) * 4 + channel]
          - data[(y * width + x) * 4 + channel],
        );
        samples += 1;
      }
    }
  }
  return total / samples;
}

function averageChannel(data, channel) {
  let total = 0;
  for (let index = channel; index < data.length; index += 4) total += data[index];
  return total / (data.length / 4);
}

test('Rig builder retires primitive blockout vocabulary and keeps manufactured source seams', () => {
  const source = readFileSync(BUILDER, 'utf8');
  for (const retired of [
    'Hook_CaptureBoom', 'Hook_CaptureJaw', 'HOOK_TETHER_SPOOL',
    'Hook_Engine_', 'Hook_Core_', 'Hook_ThreatRail',
  ]) {
    assert.equal(source.includes(retired), false, `${retired} primitive must stay retired`);
  }
  for (const component of [
    'Hook_BoomChord_', 'Hook_BoomWeb_', 'Hook_JawArm_', 'Hook_JawPad_',
    'Hook_TetherDrum_', 'Hook_TetherFairlead_BraidedRun', 'Hook_DrivePressureCase_',
    'Hook_DriveBell_', 'Hook_DriveRefractoryThroat_', 'Hook_ServiceTag_',
    'Hook_DriveTrussWeb_', 'Hook_DriveThrustSaddle_',
    'Hook_TetherDrum_CableWrap', 'Hook_TetherGuard_', 'Hook_DriveValvePack_',
    'Hook_JawForging_',
    'make_braided_tether_x', 'MANUFACTURED_NORMAL_POLICY',
  ]) {
    assert.equal(source.includes(component), true, `${component} assembly missing`);
  }
});

test('Rig GLB preserves exact roots, sockets, collision, physical material bindings, and computed donor envelope', async () => {
  const { json: gltf, binary } = glbDocument(SOURCE);
  const nodesByName = new Map((gltf.nodes ?? []).map((node) => [node.name, node]));
  const root = nodesByName.get('SF_M4_ASHLINE_V2_RIG_ROOT');
  assert.ok(root, 'rig root missing');
  assert.equal(root.matrix, undefined, 'root matrix must not hide a transform');
  assert.deepEqual(root.translation ?? [0, 0, 0], [0, 0, 0]);
  assert.deepEqual(root.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1]);
  assert.deepEqual(identity(root.scale), [1, 1, 1]);
  assert.equal(root.extras?.spacefaceAsset?.assetId, 'SF_WHOLESHIP_ASHLINE_V2_RIG');
  assert.equal(root.extras?.spacefaceAsset?.forward, '+X');
  assert.deepEqual(root.extras?.spacefaceAsset?.manufacturedNormalPolicy, {
    method: 'smooth_by_angle', angleDegrees: 28, keepSharpEdges: true,
  });

  const socketNodes = [...nodesByName.values()].filter((node) => node.name?.startsWith('SOCKET_'));
  assert.deepEqual(socketNodes.map((node) => node.name).sort(), Object.keys(SOCKETS).sort());
  for (const [name, expected] of Object.entries(SOCKETS)) {
    const node = nodesByName.get(name);
    assert.equal(node.matrix, undefined, `${name} must not hide a matrix transform`);
    assert.deepEqual(node.translation, expected.translation, `${name} moved`);
    assert.deepEqual(node.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1], `${name} rotated`);
    assert.deepEqual(identity(node.scale), [1, 1, 1], `${name} scaled`);
    assert.ok(root.children.includes(gltf.nodes.indexOf(node)), `${name} parent drifted`);
    assert.equal(node.extras?.spaceface?.role, expected.role, `${name} role drifted`);
    assert.deepEqual(node.extras?.spaceface?.forward, expected.forward, `${name} forward drifted`);
  }
  assert.equal(nodesByName.has('SOCKET_Tether_Front'), false);

  const collision = [...nodesByName.values()]
    .filter((node) => node.extras?.spaceface?.collision === true)
    .sort((left, right) => left.name.localeCompare(right.name));
  assert.equal(collision.length, 3, 'compound collision helper count drifted');
  assert.deepEqual(
    collision.map((node) => ({
      name: node.name,
      compoundIndex: node.extras.spaceface.compoundIndex,
      translation: node.translation ?? [0, 0, 0],
      bounds: {
        min: node.extras.spaceface.bounds.min,
        max: node.extras.spaceface.bounds.max,
      },
    })),
    COLLISION_CONTRACT.helpers,
  );
  for (const node of collision) {
    assert.equal(node.extras.spaceface.lod, 'helper', `${node.name} leaked into a render LOD`);
    assert.equal(node.extras.spaceface.nonRender, true, `${node.name} lost nonRender classification`);
  }
  const expectedCollisionUnion = collisionUnion(gltf, binary, collision);
  assert.deepEqual(
    gltf.asset?.extras?.spacefaceAsset?.collisionBounds,
    expectedCollisionUnion,
    'asset collision bounds must union every transformed compound helper',
  );
  const rootTruth = root.extras?.spaceface?.materialTruth;
  assert.equal(rootTruth?.collisionContractDigest, digest(COLLISION_CONTRACT));
  assert.deepEqual(rootTruth?.collisionContract, COLLISION_CONTRACT);
  const lod0Extents = lodAabbExtents(gltf, binary, 'LOD0');
  assertSemanticBounds(rootTruth?.semanticBounds, lod0Extents);
  assert.deepEqual(
    rootTruth.semanticBounds.groups.fullRig,
    visibleLod0Contract(
      gltf,
      binary,
      rootTruth.semanticBounds.groups.authoredRig.components,
    ),
    'fullRig must be the exact transformed visible LOD0 subject',
  );
  const { json: candidateGltf } = glbDocument(CANDIDATE);
  const candidateRoot = (candidateGltf.nodes ?? []).find(
    (node) => node.name === 'SF_M4_ASHLINE_V2_RIG_ROOT',
  );
  assert.deepEqual(
    candidateRoot?.extras?.spaceface?.materialTruth?.semanticBounds,
    rootTruth.semanticBounds,
    'candidate must preserve source semantic subjects without component draw nodes',
  );

  const materialByName = new Map((gltf.materials ?? []).map((material) => [material.name, material]));
  const requiredMaterials = [
    'Material_Hull', 'Material_Mechanical', 'Material_Red_Paint',
    'Material_Cyan', 'Material_HeatMetal', 'Material_Refractory',
  ];
  const lod0Materials = materialBindings(gltf, 'LOD0');
  for (const material of requiredMaterials) {
    assert.equal(lod0Materials.has(material), true, `${material} is not primitive-bound in LOD0`);
    const exported = materialByName.get(material);
    const orm = exported?.pbrMetallicRoughness?.metallicRoughnessTexture;
    assert.ok(orm, `${material} lacks ORM binding`);
    assert.equal(exported?.occlusionTexture?.index, orm.index,
      `${material} must share its packed ORM image with occlusion`);
    assert.ok(Number.isFinite(exported?.occlusionTexture?.strength), `${material} occlusion strength missing`);
  }
  assert.equal(materialByName.has('Material_Warm'), false, 'legacy warm spool material leaked into Rig');
  const expectedPbr = {
    Material_Hull: { roughness: 0.72, metallic: 0.08, emissive: false },
    Material_Mechanical: { roughness: 0.31, metallic: 0.88, emissive: false },
    Material_Red_Paint: { roughness: 0.78, metallic: 0, emissive: false },
    Material_Cyan: { roughness: 0.52, metallic: 0.02, emissive: true },
    Material_HeatMetal: { roughness: 0.30, metallic: 0.94, emissive: false },
    Material_Refractory: { roughness: 0.97, metallic: 0, emissive: false },
  };
  for (const [name, expected] of Object.entries(expectedPbr)) {
    assert.deepEqual(materialByName.get(name)?.extras?.spacefaceMaterial, {
      surfaceClass: materialByName.get(name).extras.spacefaceMaterial.surfaceClass,
      ...expected,
    }, `${name} PBR classification drifted`);
    const orm = embeddedImage(gltf, binary, `${name}_orm`);
    const decoded = await sharp(orm).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const roughness = averageChannel(decoded.data, 1) / 255;
    const metallic = averageChannel(decoded.data, 2) / 255;
    assert.ok(Math.abs(roughness - expected.roughness) < 0.12,
      `${name} ORM roughness drifted: ${roughness}`);
    assert.ok(Math.abs(metallic - expected.metallic) < 0.08,
      `${name} ORM metallic drifted: ${metallic}`);
  }
  for (const lod of ['LOD0', 'LOD1']) {
    const bindings = materialBindings(gltf, lod);
    for (const material of ['Material_HeatMetal', 'Material_Refractory']) {
      assert.equal(bindings.has(material), true, `${lod} drops ${material}`);
    }
  }
  assert.equal(materialBindings(gltf, 'LOD2').has('Material_HeatMetal'), false);
  assert.equal(materialBindings(gltf, 'LOD2').has('Material_Refractory'), false);

  const actualAabb = lod0Extents.size;
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(Math.abs(actualAabb[axis] - RIG_BOUNDS[axis]) < 1e-5, `LOD0 AABB axis ${axis} drifted`);
  }
  assert.deepEqual(gltf.asset?.extras?.spacefaceAsset?.lod0AabbSize, RIG_BOUNDS);
  assert.equal(
    assertNoDegenerateExportPrimitives(gltf, binary),
    gltf.asset?.extras?.spacefaceAsset?.triangleCount,
    'all exported triangles must be finite, attributed, and nondegenerate',
  );
});

test('Rig pre-finalize mirror is exact and Hull native normal pixels contain no 64px quilt grid', async () => {
  assert.deepEqual(readFileSync(CANDIDATE), readFileSync(SOURCE));
  const { json: gltf, binary } = glbDocument(SOURCE);
  const normal = embeddedImage(gltf, binary, 'Material_Hull_normal');
  const decoded = await sharp(normal).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 256);
  assert.equal(decoded.info.height, 256);

  const boundaries = [64, 128, 192];
  const periodicX = averageBoundaryDelta(
    decoded.data, decoded.info.width, decoded.info.height, 0, 'x', boundaries,
  );
  const periodicY = averageBoundaryDelta(
    decoded.data, decoded.info.width, decoded.info.height, 1, 'y', boundaries,
  );
  const averageX = averageAdjacentDelta(
    decoded.data, decoded.info.width, decoded.info.height, 0, 'x',
  );
  const averageY = averageAdjacentDelta(
    decoded.data, decoded.info.width, decoded.info.height, 1, 'y',
  );
  assert.ok(periodicX <= averageX * 3 + 1, `Hull normal repeats an X grid: ${periodicX}/${averageX}`);
  assert.ok(periodicY <= averageY * 3 + 1, `Hull normal repeats a Y grid: ${periodicY}/${averageY}`);
});

test('Rig root inventory and receipt bind the exact candidate, builder, materials, and unresolved promotion contracts', () => {
  const { json: gltf } = glbDocument(SOURCE);
  const root = (gltf.nodes ?? []).find((node) => node.name === 'SF_M4_ASHLINE_V2_RIG_ROOT');
  const rootTruth = root.extras?.spaceface?.materialTruth;
  const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
  const actualSourceSha256 = sha256(SOURCE);
  assert.equal(summary.gateOk, true, summary.gateErrors?.join('\n'));
  assert.equal(summary.sourceSha256, actualSourceSha256);
  assert.equal(summary.materialTruth?.sourceSha256, actualSourceSha256);
  assert.deepEqual(summary.materialTruth?.sourceHashBinding, {
    sourceSha256: actualSourceSha256,
    componentInventoryDigest: rootTruth.componentInventoryDigest,
    collisionContractDigest: rootTruth.collisionContractDigest,
  });
  assert.equal(summary.materialTruth?.revision, 'rig-material-truth-2026-07-28-v1');
  assert.equal(summary.materialTruth?.producer?.path, 'tools/blender/build_m4_ashline_v2.py');
  assert.equal(summary.materialTruth?.producer?.sha256, sha256(BUILDER));
  assert.deepEqual(summary.materialTruth?.componentInventory, rootTruth.componentInventory);
  assert.equal(summary.materialTruth?.componentInventoryDigest, rootTruth.componentInventoryDigest);
  const inventoryWithoutDigest = structuredClone(rootTruth.componentInventory);
  delete inventoryWithoutDigest.digest;
  assert.equal(rootTruth.componentInventory.digest, digest(inventoryWithoutDigest));
  assert.deepEqual(
    Object.fromEntries(rootTruth.componentInventory.roles.map((row) => [row.role, row.count])),
    COMPONENT_COUNTS,
  );
  assert.deepEqual(rootTruth.manufacturedNormalPolicy, {
    method: 'smooth_by_angle', angleDegrees: 28, keepSharpEdges: true,
  });
  assert.deepEqual(rootTruth.materialMapPolicy, {
    mode: 'role-specific-deterministic-base-orm-normal',
    resolution: 256,
    universalRecipe: false,
    plateFastenersEmbeddedInMaps: false,
    roleMicrostructure: {
      Material_Hull: 'phosphate-coated-plate-without-global-grid',
      Material_Mechanical: 'directional-machining',
      Material_Red_Paint: 'dielectric-coating-with-localized-steel-chips',
      Material_HeatMetal: 'axial-heat-and-machining-bands',
      Material_Refractory: 'dry-granular-ceramic-with-sparse-cracks',
      Material_Cyan: 'smooth-protected-indicator',
    },
  });
  assert.ok(Array.isArray(summary.materialTruth?.authoredComponentRoles));
  assert.equal(summary.materialTruth?.acceptedComponentRoles, undefined);
  assert.deepEqual(summary.materialTruth?.lodPolicy, {
    lod0: 'full-capture-machinery-and-drive-construction',
    lod1: 'capture-load-path-drive-cases-and-material-boundaries',
    lod2: 'donor-macro-hull-only',
  });
  for (const blocker of [
    'reaver-pirate-and-corsair-raider-share-one-rig-needs-accepted-variant-decision',
    'v2-has-no-socket-tether-front-needs-runtime-tool-and-vfx-contract-decision',
    'single-central-engine-trail-sockets-versus-two-visible-drive-bells-needs-runtime-vfx-proof',
  ]) {
    assert.ok(summary.materialTruth?.promotionBlockers?.includes(blocker), blocker);
  }
  assert.deepEqual(summary.lod0AabbSize, RIG_BOUNDS);
  assert.deepEqual(
    summary.collisionBounds,
    COLLISION_CONTRACT.helpers.reduce((union, helper) => {
      const translation = helper.translation;
      for (let axis = 0; axis < 3; axis += 1) {
        union.min[axis] = Math.min(union.min[axis], helper.bounds.min[axis] + translation[axis]);
        union.max[axis] = Math.max(union.max[axis], helper.bounds.max[axis] + translation[axis]);
      }
      union.helpers.push(helper.name);
      union.size = union.max.map((value, axis) => value - union.min[axis]);
      return union;
    }, {
      basis: 'root-local-aabb',
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
      helpers: [],
      size: [0, 0, 0],
    }),
  );
  assert.equal(summary.totalTriangles, 30065, 'zero-area triangle cleanup drifted');
  assert.equal(summary.lodTriangles.lod0, 19154, 'collision helpers or zero-area faces inflated LOD0 tris');
  assert.equal(summary.lodTriangles.lod1, 9488, 'zero-area LOD1 hull face returned');
  assert.equal(summary.drawEstimates.lod0, 6, 'collision helpers inflated rendered LOD0 draws');
  assert.deepEqual(summary.helperBreakdown, {
    triangles: 36,
    primitives: 3,
    drawEstimate: 3,
    nodes: [
      { name: 'COLLISION_HULL_00', tris: 12 },
      { name: 'COLLISION_HULL_01', tris: 12 },
      { name: 'COLLISION_HULL_02', tris: 12 },
    ],
  });
  assert.equal(summary.lodTriangles.lod0 > summary.lodTriangles.lod1, true);
  assert.equal(summary.lodTriangles.lod1 > summary.lodTriangles.lod2, true);
});
