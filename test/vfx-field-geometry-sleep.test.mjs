import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';

import { vfx } from '../src/render/vfx.js';

const FIELD_MESH_KEYS = [
  'vaneMesh',
  'pipMesh',
  'knotMesh',
  'domeMesh',
  'ribMesh',
  'bermMesh',
  'chevronMesh',
  'bankMesh',
];

const KIND_EXPECTATIONS = {
  well: {
    counts: { vaneMesh: 6, pipMesh: 12, knotMesh: 1 },
    matrixUploads: new Set(['vaneMesh', 'pipMesh', 'knotMesh']),
    colorUploads: new Set(['vaneMesh', 'pipMesh']),
  },
  repulsor: {
    counts: { domeMesh: 1, ribMesh: 8, bermMesh: 14 },
    matrixUploads: new Set(['domeMesh', 'ribMesh', 'bermMesh']),
    colorUploads: new Set(['ribMesh', 'bermMesh']),
  },
  cone: {
    counts: { chevronMesh: 20, bankMesh: 10 },
    matrixUploads: new Set(['chevronMesh', 'bankMesh']),
    colorUploads: new Set(['chevronMesh', 'bankMesh']),
  },
};

function makeField(kind) {
  return {
    id: `field-${kind}`,
    kind,
    center: { x: 40, z: -25 },
    radius: 80,
    dir: { x: Math.SQRT1_2, z: Math.SQRT1_2 },
    halfAngleRad: 0.45,
    engaged: true,
  };
}

function makeHarness(active = []) {
  const system = Object.create(vfx);
  system._scene = new THREE.Scene();
  system._fieldGeomInitialized = false;
  system._fieldGeom = null;
  system._t = 2;
  system.state = {
    simTime: 2,
    fields: { active },
    settings: {
      video: { motionReduce: false, flashReduce: false },
      accessibility: { flashReduce: false },
    },
  };
  return system;
}

function attributeVersions(fieldGeom) {
  const versions = {};
  for (const key of FIELD_MESH_KEYS) {
    const mesh = fieldGeom[key];
    versions[key] = {
      matrix: mesh.instanceMatrix.version,
      color: mesh.instanceColor ? mesh.instanceColor.version : null,
    };
  }
  return versions;
}

function assertAllCounts(fieldGeom, expected = {}) {
  for (const key of FIELD_MESH_KEYS) {
    assert.equal(fieldGeom[key].count, expected[key] || 0, `${key} count`);
  }
}

function assertKindSpecificUploads(before, after, expectation, kind) {
  for (const key of FIELD_MESH_KEYS) {
    const matrixDelta = expectation.matrixUploads.has(key) ? 1 : 0;
    assert.equal(
      after[key].matrix,
      before[key].matrix + matrixDelta,
      `${kind} ${key} matrix upload`,
    );

    if (before[key].color === null) {
      assert.equal(after[key].color, null, `${kind} ${key} has no color attribute`);
      continue;
    }
    const colorDelta = expectation.colorUploads.has(key) ? 1 : 0;
    assert.equal(
      after[key].color,
      before[key].color + colorDelta,
      `${kind} ${key} color upload`,
    );
  }
}

test('inactive field geometry initializes lazily and repeats without attribute uploads', () => {
  const system = makeHarness();

  system._updateFieldGeometry(1 / 60);
  const fieldGeom = system._fieldGeom;
  const versions = attributeVersions(fieldGeom);
  const activeIds = system._fieldActiveIds;
  const secondaryColor = system._fieldColor2;
  const leanQuaternion = system._fieldLeanQuat;

  assert.ok(fieldGeom, 'the first update keeps lazy geometry initialization');
  assert.ok(activeIds instanceof Set, 'active field ids use retained Set scratch');
  assert.ok(secondaryColor instanceof THREE.Color, 'rib blending uses retained Color scratch');
  assert.ok(leanQuaternion instanceof THREE.Quaternion, 'engaged pip lean uses retained Quaternion scratch');
  assertAllCounts(fieldGeom);
  assert.ok(fieldGeom.coreVols.every((volume) => volume.visible === false));

  system._updateFieldGeometry(1 / 60);
  system._updateFieldGeometry(1 / 60);

  assert.strictEqual(system._fieldGeom, fieldGeom);
  assert.strictEqual(system._fieldActiveIds, activeIds);
  assert.strictEqual(system._fieldColor2, secondaryColor);
  assert.strictEqual(system._fieldLeanQuat, leanQuaternion);
  assert.deepEqual(attributeVersions(fieldGeom), versions);
  assertAllCounts(fieldGeom);
});

test('each active field kind uploads only the instance families it writes', () => {
  const system = makeHarness();
  system._initFieldGeometry();

  for (const [kind, expectation] of Object.entries(KIND_EXPECTATIONS)) {
    const before = attributeVersions(system._fieldGeom);
    system.state.simTime += 1 / 60;
    system._t += 1 / 60;
    system.state.fields.active = [makeField(kind)];

    system._updateFieldGeometry(1 / 60);

    const after = attributeVersions(system._fieldGeom);
    assertAllCounts(system._fieldGeom, expectation.counts);
    assertKindSpecificUploads(before, after, expectation, kind);
    assert.equal(system._fieldGeom.coreVols.filter((volume) => volume.visible).length, 1);
  }
});

test('transition to sleep clears field visuals without publishing untouched buffers', () => {
  const system = makeHarness([makeField('repulsor')]);

  system._updateFieldGeometry(1 / 60);
  const fieldGeom = system._fieldGeom;
  const activeVersions = attributeVersions(fieldGeom);

  assertAllCounts(fieldGeom, KIND_EXPECTATIONS.repulsor.counts);
  assert.equal(fieldGeom.deployStart.size, 1);
  assert.equal(fieldGeom.coreVols.filter((volume) => volume.visible).length, 1);

  system.state.fields.active = [];
  system.state.simTime += 1 / 60;
  system._t += 1 / 60;
  system._updateFieldGeometry(1 / 60);

  assertAllCounts(fieldGeom);
  assert.equal(fieldGeom.deployStart.size, 0);
  assert.equal(system._fieldActiveIds.size, 0);
  assert.ok(fieldGeom.coreVols.every((volume) => volume.visible === false));
  assert.deepEqual(attributeVersions(fieldGeom), activeVersions);

  system._updateFieldGeometry(1 / 60);
  assert.deepEqual(attributeVersions(fieldGeom), activeVersions);
  assertAllCounts(fieldGeom);
});
