import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  createDynamicBufferCoordinator,
  createDynamicComponentSpan,
  markDynamicBufferItems,
  markDynamicComponentRange,
  registerDynamicBufferOwner,
} from '../src/render/dynamicBufferRanges.js';
import {
  commitInstancedSpriteBuckets,
  createInstancedSpriteBuckets,
  resetInstancedSpriteBuckets,
  writeInstancedSpriteFields,
} from '../src/render/combat/instancedSpritePool.js';
import {
  commitTrailStreakInstances,
  initTrailStreakPool,
  updateTrailStreakInstance,
} from '../src/render/engineTrailSurfaces.js';

function acknowledgeInitial(attribute) {
  attribute.onUploadCallback();
  assert.equal(attribute.updateRanges.length, 0);
}

function acknowledgeUpdate(attribute) {
  attribute.clearUpdateRanges();
  attribute.onUploadCallback();
}

function makeOwnerFixture(capacity = 4) {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aFixture', attribute);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const owner = registerDynamicBufferOwner(scene, {
    id: 'fixture',
    mesh,
    attributes: [{ name: 'fixture', attribute }],
  });
  return { scene, coordinator, attribute, material, mesh, owner, camera: new THREE.PerspectiveCamera() };
}

function beginSceneRender(fixture) {
  const epoch = fixture.coordinator.arm();
  fixture.scene.onBeforeRender({}, fixture.scene, fixture.camera, null);
  return epoch;
}

test('component spans retain one bounded union in component indexes', () => {
  const span = createDynamicComponentSpan(32);
  markDynamicComponentRange(span, 12, 4);
  markDynamicComponentRange(span, 3, 6);
  markDynamicComponentRange(span, 20, 3);
  assert.deepEqual(span, { capacity: 32, start: 3, end: 23, logicalComponents: 13 });
  assert.throws(() => markDynamicComponentRange(span, 31, 2), /exceeds capacity/);
});

test('scene-owned publication forces the initial buffer and restores the prior hook', () => {
  const fixture = makeOwnerFixture();
  const prior = function priorSceneHook(renderer, scene, camera, target) {
    assert.equal(this, fixture.scene);
    assert.equal(scene, fixture.scene);
    assert.equal(camera, fixture.camera);
    assert.equal(target, null);
    fixture.priorCalls = (fixture.priorCalls || 0) + 1;
  };
  fixture.scene.onBeforeRender = prior;
  fixture.material.visible = false;

  const epoch = beginSceneRender(fixture);
  assert.equal(fixture.priorCalls, 1);
  assert.deepEqual(fixture.attribute.updateRanges, [{ start: 0, count: 12 }]);
  assert.equal(fixture.attribute.version, 1);
  assert.throws(() => assertDynamicBufferOwnerWritable(fixture.owner), /after publication/);
  acknowledgeInitial(fixture.attribute);
  assert.throws(() => assertDynamicBufferOwnerWritable(fixture.owner), /after publication/);
  fixture.coordinator.disarm(epoch);

  assert.equal(fixture.scene.onBeforeRender, prior);
  assert.equal(fixture.owner.diagnostics.forceFullUploads, 1);
  assert.equal(fixture.owner.diagnostics.acknowledgements, 1);
});

test('ordinary dirty spans survive skipped draws and publish once on eligibility', () => {
  const fixture = makeOwnerFixture();
  let epoch = beginSceneRender(fixture);
  acknowledgeInitial(fixture.attribute);
  fixture.coordinator.disarm(epoch);

  markDynamicBufferItems(fixture.owner, 0, 1);
  markDynamicBufferItems(fixture.owner, 0, 3);
  commitDynamicBufferOwner(fixture.owner, 4);
  fixture.material.visible = false;
  const versionBeforeSkip = fixture.attribute.version;

  epoch = beginSceneRender(fixture);
  assert.equal(fixture.attribute.version, versionBeforeSkip);
  assert.equal(fixture.attribute.updateRanges.length, 0);
  fixture.coordinator.disarm(epoch);

  fixture.material.visible = true;
  epoch = beginSceneRender(fixture);
  assert.deepEqual(fixture.attribute.updateRanges, [{ start: 3, count: 9 }]);
  assert.equal(fixture.attribute.version, versionBeforeSkip + 1);
  acknowledgeUpdate(fixture.attribute);
  fixture.coordinator.disarm(epoch);

  assert.equal(fixture.owner.diagnostics.partialUploads, 1);
  assert.equal(fixture.owner.diagnostics.drawEligibilitySkips, 1);
});

test('context loss supersedes an unacknowledged generation and restore forces a full replacement', () => {
  const fixture = makeOwnerFixture();
  let epoch = beginSceneRender(fixture);
  assert.equal(fixture.attribute.updateRanges.length, 1);
  fixture.coordinator.handleContextLost();
  assert.equal(fixture.attribute.updateRanges.length, 0);
  fixture.coordinator.disarm(epoch);

  fixture.coordinator.handleContextRestored();
  epoch = beginSceneRender(fixture);
  assert.deepEqual(fixture.attribute.updateRanges, [{ start: 0, count: 12 }]);
  acknowledgeInitial(fixture.attribute);
  fixture.coordinator.disarm(epoch);

  assert.equal(fixture.owner.diagnostics.supersededGenerations, 1);
  assert.equal(fixture.coordinator.getDiagnostics().contextLosses, 1);
  assert.equal(fixture.coordinator.getDiagnostics().contextRestores, 1);
});

test('context restoration accepts Three driver re-upload without weakening unsolicited callback detection', () => {
  const fixture = makeOwnerFixture();
  let epoch = beginSceneRender(fixture);
  acknowledgeInitial(fixture.attribute);
  fixture.coordinator.disarm(epoch);

  const versionBeforeRestore = fixture.attribute.version;
  fixture.coordinator.handleContextLost();
  fixture.coordinator.handleContextRestored();

  // Three recreates WebGLAttributes after a restored context and invokes the
  // attribute callback for its full bufferData upload without incrementing the
  // CPU-side BufferAttribute version or entering our renderer epoch.
  assert.doesNotThrow(() => fixture.attribute.onUploadCallback());
  assert.equal(fixture.attribute.version, versionBeforeRestore);

  epoch = beginSceneRender(fixture);
  assert.equal(fixture.attribute.updateRanges.length, 0,
    'the acknowledged restored-context buffer must not be uploaded a second time');
  fixture.coordinator.disarm(epoch);

  assert.equal(fixture.coordinator.getDiagnostics().contextRestoreAcknowledgements, 1);
  assert.throws(
    () => fixture.attribute.onUploadCallback(),
    /received an unsolicited upload callback/,
    'only the one explicitly armed restored-context upload is accepted',
  );
});

test('live sprite and trail owners publish only their packed prefixes after initial residency', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const texture = new THREE.Texture();
  const sprites = createInstancedSpriteBuckets(scene, 8, texture, texture, texture, texture);
  const trails = initTrailStreakPool(scene, 8);

  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const bucket of [sprites.glow, sprites.ring, sprites.smoke, sprites.combustion]) {
    for (const attribute of [bucket.position, bucket.scale, bucket.roll, bucket.color, bucket.opacity]) {
      acknowledgeInitial(attribute);
    }
  }
  for (const attribute of [trails.mesh.instanceMatrix, trails.colorAttribute, trails.opacityAttribute]) {
    acknowledgeInitial(attribute);
  }
  coordinator.disarm(epoch);

  resetInstancedSpriteBuckets(sprites);
  writeInstancedSpriteFields(sprites, 'combustion', 1, 2, 3, 4, 8, 2, 0.2, 1, 0.5, 0.25, 0.8);
  writeInstancedSpriteFields(sprites, 'combustion', 5, 6, 7, 3, 6, 2, 0.4, 0.2, 0.6, 1, 0.5);
  commitInstancedSpriteBuckets(sprites);
  updateTrailStreakInstance(trails, 0, {
    x: 2, y: 0.4, z: 3, vx: 1, vz: 0, width: 0.5, length: 4, opacity: 0.7,
    color: { r: 1, g: 0.5, b: 0.2 },
  });
  updateTrailStreakInstance(trails, 1, {
    x: 4, y: 0.4, z: 5, vx: 0, vz: 1, width: 0.8, length: 6, opacity: 0.4,
    color: { r: 0.2, g: 0.5, b: 1 },
  });
  commitTrailStreakInstances(trails, 2, { scroll: 0.2, time: 1.5 });

  assert.equal(sprites.combustion.position.updateRanges.length, 0);
  assert.equal(trails.mesh.instanceMatrix.updateRanges.length, 0);
  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);

  assert.deepEqual(sprites.combustion.position.updateRanges, [{ start: 0, count: 6 }]);
  assert.deepEqual(sprites.combustion.scale.updateRanges, [{ start: 0, count: 4 }]);
  assert.deepEqual(sprites.combustion.roll.updateRanges, [{ start: 0, count: 2 }]);
  assert.deepEqual(sprites.combustion.color.updateRanges, [{ start: 0, count: 6 }]);
  assert.deepEqual(sprites.combustion.opacity.updateRanges, [{ start: 0, count: 2 }]);
  assert.deepEqual(trails.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 32 }]);
  assert.deepEqual(trails.colorAttribute.updateRanges, [{ start: 0, count: 6 }]);
  assert.deepEqual(trails.opacityAttribute.updateRanges, [{ start: 0, count: 2 }]);
  assert.equal(sprites.glow.position.updateRanges.length, 0);

  for (const attribute of [
    sprites.combustion.position,
    sprites.combustion.scale,
    sprites.combustion.roll,
    sprites.combustion.color,
    sprites.combustion.opacity,
    trails.mesh.instanceMatrix,
    trails.colorAttribute,
    trails.opacityAttribute,
  ]) acknowledgeUpdate(attribute);
  coordinator.disarm(epoch);
});
