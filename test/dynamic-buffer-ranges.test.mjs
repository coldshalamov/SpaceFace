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
  replaceDynamicBufferAttribute,
  unregisterDynamicBufferOwner,
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
import {
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';
import {
  KESTREL_MAIN_PLUME_RECIPE,
  KESTREL_RCS_RECIPE,
} from '../src/render/thruster/recipes/kestrelRecipes.js';
import { ContinuousPlumeSystem } from '../src/render/thruster/systems/continuousPlume.js';
import { RcsImpulseSystem } from '../src/render/thruster/systems/rcsImpulse.js';
import { vfx } from '../src/render/vfx.js';
import { createShardStreakCloud } from '../src/render/particleShards.js';
import * as partsLibrary from '../src/render/partsLibrary.js';

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

function makeInterleavedOwnerFixture(capacity = 4) {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const backing = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * 18), 18);
  const views = [
    new THREE.InterleavedBufferAttribute(backing, 3, 0),
    new THREE.InterleavedBufferAttribute(backing, 4, 3),
    new THREE.InterleavedBufferAttribute(backing, 4, 7),
    new THREE.InterleavedBufferAttribute(backing, 4, 11),
    new THREE.InterleavedBufferAttribute(backing, 3, 15),
  ];
  for (let index = 0; index < views.length; index++) {
    geometry.setAttribute(`packed${index}`, views[index]);
  }
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const owner = registerDynamicBufferOwner(scene, {
    id: 'interleaved-fixture',
    mesh,
    attributes: [{ name: 'packed', attribute: backing }],
  });
  return {
    scene,
    coordinator,
    backing,
    views,
    geometry,
    material,
    mesh,
    owner,
    camera: new THREE.PerspectiveCamera(),
  };
}

function makeParticleVfxFixture(capacity = 3000) {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const cloud = createShardStreakCloud(scene, capacity);
  const material = cloud.material;
  const mesh = cloud.mesh;

  const fixture = Object.create(vfx);
  fixture.state = { settings: { video: { particleQuality: 'medium' } } };
  fixture._scene = scene;
  fixture._shardMesh = mesh;
  fixture._cloud = cloud;
  fixture._pGeo = cloud.geometry;
  fixture._cap = capacity;
  fixture._pPos = cloud.position.array;
  fixture._pCol = cloud.color.array;
  fixture._pSize = cloud.size.array;
  fixture._pAlpha = cloud.alpha.array;
  fixture._pTrailAxis = cloud.trailAxis.array;
  fixture._pTrailStretch = cloud.trailStretch.array;
  fixture._particleTrailAxis = new Float32Array(capacity);
  fixture._particleTrailStretch = new Float32Array(capacity);
  fixture._pPackedParticleSlots = new Int32Array(capacity);
  fixture._pPackedParticleSlots.fill(-1);
  for (const field of [
    '_px', '_py', '_pz', '_vx', '_vy', '_vz', '_age', '_life', '_drag',
    '_size0', '_size1', '_cr0', '_cg0', '_cb0', '_cr1', '_cg1', '_cb1',
  ]) fixture[field] = new Float32Array(capacity);
  fixture._alive = new Uint8Array(capacity);
  fixture._activeParticles = new Int32Array(capacity);
  fixture._activeParticlePos = new Int32Array(capacity);
  fixture._activeParticlePos.fill(-1);
  fixture._freeParticles = new Int32Array(capacity);
  for (let index = 0; index < capacity - 2; index++) fixture._freeParticles[index] = capacity - 1 - index;
  fixture._freeParticleCount = capacity - 2;
  fixture._liveCount = 2;
  fixture._pDrawMax = 2;
  fixture._head = 2;
  for (let index = 0; index < 2; index++) {
    fixture._alive[index] = 1;
    fixture._activeParticles[index] = index;
    fixture._activeParticlePos[index] = index;
    fixture._life[index] = 2;
    fixture._size0[index] = 1;
    fixture._size1[index] = 0.25;
    fixture._cr0[index] = 1;
    fixture._cg0[index] = 0.5;
    fixture._cb0[index] = 0.2;
    fixture._cr1[index] = 0.2;
    fixture._cg1[index] = 0.5;
    fixture._cb1[index] = 1;
    fixture._pTrailAxis[index] = index * 0.25;
    fixture._pTrailStretch[index] = 2 + index;
    fixture._particleTrailAxis[index] = index * 0.25;
    fixture._particleTrailStretch[index] = 2 + index;
  }
  fixture._bindParticleDynamicBuffers();
  return { fixture, scene, coordinator, camera, material, mesh };
}

test('component spans retain one bounded union in component indexes', () => {
  const span = createDynamicComponentSpan(32);
  markDynamicComponentRange(span, 12, 4);
  markDynamicComponentRange(span, 3, 6);
  markDynamicComponentRange(span, 20, 3);
  assert.deepEqual(span, { capacity: 32, start: 3, end: 23, logicalComponents: 13 });
  assert.throws(() => markDynamicComponentRange(span, 31, 2), /exceeds capacity/);
});

test('owner registration leaves every attribute untouched when a later attribute is rejected', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const geometry = new THREE.BufferGeometry();
  const accepted = new THREE.BufferAttribute(new Float32Array(12), 3);
  const rejected = new THREE.BufferAttribute(new Float32Array(12), 3);
  rejected.onUpload(() => {});
  geometry.setAttribute('accepted', accepted);
  geometry.setAttribute('rejected', rejected);
  const mesh = new THREE.Points(geometry, new THREE.PointsMaterial());
  mesh.frustumCulled = false;
  scene.add(mesh);

  assert.throws(
    () => registerDynamicBufferOwner(scene, {
      id: 'partial-owner',
      mesh,
      attributes: [
        { name: 'accepted', attribute: accepted },
        { name: 'rejected', attribute: rejected },
      ],
    }),
    /rejected already owns an upload callback/,
  );

  assert.equal(Object.hasOwn(accepted, 'onUploadCallback'), false,
    'a failed owner must not leave its earlier callback installed');
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  assert.equal(coordinator.getDiagnostics().updateRangeAllocations, 0);
  assert.doesNotThrow(() => registerDynamicBufferOwner(scene, {
    id: 'recovered-owner',
    mesh,
    attributes: [{ name: 'accepted', attribute: accepted }],
  }), 'the untouched attribute remains admissible after the rejected transaction');
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
  const retainedRangeRecord = fixture.attribute.updateRanges[0];
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
  assert.equal(fixture.attribute.updateRanges[0], retainedRangeRecord,
    'renderer generations reuse one owner-held update-range record');
  assert.equal(fixture.attribute.version, versionBeforeSkip + 1);
  acknowledgeUpdate(fixture.attribute);
  fixture.coordinator.disarm(epoch);

  assert.equal(fixture.owner.diagnostics.partialUploads, 1);
  assert.equal(fixture.owner.diagnostics.drawEligibilitySkips, 1);
  assert.equal(fixture.coordinator.getDiagnostics().updateRangeAllocations, 1,
    'one registration-time record replaces per-upload range allocations');
  assert.equal(fixture.coordinator.getDiagnostics().updateRangeRecordReuses, 1);
});

test('one interleaved backing owns ranged publication, replacement, and context recovery', () => {
  const fixture = makeInterleavedOwnerFixture();
  assert.equal(fixture.owner.bindings.length, 1);
  assert.equal(fixture.owner.capacity, 4);
  assert.deepEqual(fixture.views.map((attribute) => attribute.data), Array(5).fill(fixture.backing));
  assert.deepEqual(fixture.views.map((attribute) => attribute.offset), [0, 3, 7, 11, 15]);

  let epoch = beginSceneRender(fixture);
  assert.deepEqual(fixture.backing.updateRanges, [{ start: 0, count: 4 * 18 }]);
  acknowledgeInitial(fixture.backing);
  fixture.coordinator.disarm(epoch);

  markDynamicBufferItems(fixture.owner, 0, 1, 2);
  fixture.backing.array[18] = 7;
  fixture.backing.array[53] = 9;
  commitDynamicBufferOwner(fixture.owner, 3);
  epoch = beginSceneRender(fixture);
  assert.deepEqual(fixture.backing.updateRanges, [{ start: 18, count: 2 * 18 }]);
  acknowledgeUpdate(fixture.backing);
  fixture.coordinator.disarm(epoch);
  assert.equal(fixture.owner.diagnostics.requestedUploadBytes, (4 + 2) * 18 * 4);
  assert.equal(fixture.owner.diagnostics.uploadRangeCount, 2);

  const originalBacking = fixture.backing;
  const replacement = new THREE.InstancedInterleavedBuffer(new Float32Array(4 * 18), 18);
  replaceDynamicBufferAttribute(fixture.owner, 0, replacement, 'test-replacement');
  fixture.backing = replacement;
  for (const attribute of fixture.views) attribute.data = replacement;
  assert.equal(Object.hasOwn(originalBacking, 'onUploadCallback'), false,
    'replacement retires the old GPU-buffer callback');
  epoch = beginSceneRender(fixture);
  assert.deepEqual(replacement.updateRanges, [{ start: 0, count: replacement.array.length }]);
  acknowledgeInitial(replacement);
  fixture.coordinator.disarm(epoch);

  const versionBeforeRestore = replacement.version;
  fixture.coordinator.handleContextLost();
  fixture.coordinator.handleContextRestored();
  assert.doesNotThrow(() => replacement.onUploadCallback(),
    'the restored driver may acknowledge the one interleaved backing directly');
  assert.equal(replacement.version, versionBeforeRestore);
  epoch = beginSceneRender(fixture);
  assert.deepEqual(replacement.updateRanges, []);
  fixture.coordinator.disarm(epoch);

  assert.equal(unregisterDynamicBufferOwner(fixture.owner), true);
  assert.equal(Object.hasOwn(replacement, 'onUploadCallback'), false);
  fixture.geometry.dispose();
  fixture.material.dispose();
});

test('probe-only full-span control changes requested bytes without changing logical writes', () => {
  const ranged = makeOwnerFixture(8);
  let epoch = beginSceneRender(ranged);
  acknowledgeInitial(ranged.attribute);
  ranged.coordinator.disarm(epoch);

  markDynamicBufferItems(ranged.owner, 0, 2);
  commitDynamicBufferOwner(ranged.owner, 8);
  epoch = beginSceneRender(ranged);
  assert.deepEqual(ranged.attribute.updateRanges, [{ start: 6, count: 3 }]);
  acknowledgeUpdate(ranged.attribute);
  ranged.coordinator.disarm(epoch);

  const diagnostics = ranged.coordinator.getDiagnostics();
  assert.equal(typeof diagnostics.setProbeForceFullUploads, 'function');
  assert.equal(diagnostics.probeForceFullUploads, false);
  assert.equal(diagnostics.setProbeForceFullUploads(true), true);

  markDynamicBufferItems(ranged.owner, 0, 2);
  commitDynamicBufferOwner(ranged.owner, 8);
  epoch = beginSceneRender(ranged);
  assert.deepEqual(ranged.attribute.updateRanges, [{ start: 0, count: 24 }]);
  acknowledgeUpdate(ranged.attribute);
  ranged.coordinator.disarm(epoch);

  assert.equal(ranged.owner.diagnostics.logicalBytesChanged, 24,
    'both windows report the same three changed float components');
  assert.equal(ranged.owner.diagnostics.requestedUploadBytes, 204,
    'initial residency (96 bytes), one ranged write (12), and one probe full-span write (96) are explicit');
  assert.equal(ranged.owner.diagnostics.probeFullUploads, 1);
  assert.equal(diagnostics.setProbeForceFullUploads(false), false);
  assert.equal(diagnostics.probeForceFullUploads, false);
});

test('probe-only full-span control cannot change during an armed renderer epoch', () => {
  const fixture = makeOwnerFixture();
  const diagnostics = fixture.coordinator.getDiagnostics();
  const epoch = fixture.coordinator.arm();
  assert.throws(
    () => diagnostics.setProbeForceFullUploads(true),
    /renderer epoch is active/,
  );
  fixture.coordinator.disarm(epoch);
  assert.equal(diagnostics.probeForceFullUploads, false);
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
  assert.doesNotThrow(
    () => fixture.attribute.onUploadCallback(),
    'a later unsolicited callback must not throw out of Three\'s upload path',
  );
  assert.equal(fixture.owner.invalid, true);
  assert.match(fixture.owner.diagnostics.lastError, /received an unsolicited upload callback/);
});

test('Three first bufferData does not retire the owner or abort later frames', () => {
  const fixture = makeOwnerFixture();
  assert.doesNotThrow(() => fixture.attribute.onUploadCallback());
  assert.equal(fixture.owner.invalid, false);
  assert.equal(fixture.owner.diagnostics.initialDriverAcknowledgements, 1);

  const epoch = beginSceneRender(fixture);
  assert.equal(fixture.attribute.updateRanges.length, 1);
  acknowledgeInitial(fixture.attribute);
  fixture.coordinator.disarm(epoch);

  const next = beginSceneRender(fixture);
  fixture.coordinator.disarm(next);
  assert.equal(fixture.coordinator.getDiagnostics().epochs, 2);
  assert.equal(fixture.coordinator.getDiagnostics().invalid, false);
});

test('an invalid owner can still release its callback and coordinator ownership', () => {
  const fixture = makeOwnerFixture();
  assert.doesNotThrow(() => fixture.attribute.onUploadCallback());
  assert.equal(fixture.owner.invalid, false, 'Three\'s first bufferData is expected, not a trap');
  assert.doesNotThrow(() => fixture.attribute.onUploadCallback());
  assert.equal(fixture.owner.invalid, true);
  assert.match(fixture.owner.diagnostics.lastError, /received an unsolicited upload callback/);

  assert.equal(unregisterDynamicBufferOwner(fixture.owner), true);
  assert.equal(Object.hasOwn(fixture.attribute, 'onUploadCallback'), false);
  assert.equal(fixture.coordinator.getDiagnostics().registeredOwners, 0);
  assert.equal(fixture.coordinator.getDiagnostics().owners.length, 0);
  assert.equal(unregisterDynamicBufferOwner(fixture.owner), false);
});

test('one owner trap cannot latch the coordinator dead for later frames', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();

  function addOwner(id) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(12), 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aFixture', attribute);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, 4);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    const owner = registerDynamicBufferOwner(scene, {
      id,
      mesh,
      attributes: [{ name: 'fixture', attribute }],
    });
    return { geometry, attribute, material, mesh, owner };
  }

  const trapped = addOwner('trapped');
  const healthy = addOwner('healthy');

  assert.doesNotThrow(() => trapped.attribute.onUploadCallback());
  assert.doesNotThrow(() => trapped.attribute.onUploadCallback());
  assert.equal(trapped.owner.invalid, true);
  assert.equal(coordinator.getDiagnostics().retiredOwners, 1);
  assert.doesNotThrow(
    () => assertDynamicBufferOwnerWritable(trapped.owner),
    'a retired owner must not keep throwing on the prepare path',
  );

  const epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  assert.equal(trapped.attribute.updateRanges.length, 0, 'retired owner is skipped');
  assert.deepEqual(healthy.attribute.updateRanges, [{ start: 0, count: 12 }]);
  acknowledgeInitial(healthy.attribute);
  coordinator.disarm(epoch);

  const next = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  coordinator.disarm(next);
  assert.equal(coordinator.getDiagnostics().epochs, 2);
});

test('a nested scene render during publication does not freeze later frames', () => {
  const fixture = makeOwnerFixture();
  let nested = 0;
  fixture.scene.onBeforeRender = function reenter(renderer, scene, camera, target) {
    nested += 1;
    if (nested === 1) scene.onBeforeRender(renderer, scene, camera, target);
  };
  const epoch = beginSceneRender(fixture);
  assert.equal(nested, 1);
  acknowledgeInitial(fixture.attribute);
  fixture.coordinator.disarm(epoch);

  const next = beginSceneRender(fixture);
  fixture.coordinator.disarm(next);
  assert.equal(fixture.coordinator.getDiagnostics().invalid, false);
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

test('dense one-times and five-times fanout stays at 23 ranges and charges packed bytes', () => {
  const capacity = 96;
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const texture = new THREE.Texture();
  const sprites = createInstancedSpriteBuckets(scene, capacity, texture, texture, texture, texture);
  const trails = initTrailStreakPool(scene, capacity);
  const buckets = [sprites.glow, sprites.ring, sprites.smoke, sprites.combustion];
  const allAttributes = [
    ...buckets.flatMap((bucket) => [
      bucket.position,
      bucket.scale,
      bucket.roll,
      bucket.color,
      bucket.opacity,
    ]),
    trails.mesh.instanceMatrix,
    trails.colorAttribute,
    trails.opacityAttribute,
  ];

  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const attribute of allAttributes) acknowledgeInitial(attribute);
  coordinator.disarm(epoch);

  const requestedBytes = () => coordinator.getDiagnostics().owners.reduce(
    (sum, owner) => sum + owner.requestedUploadBytes,
    0,
  );

  for (const population of [18, 90]) {
    const allocationsBefore = coordinator.getDiagnostics().updateRangeAllocations;
    const publicationsBefore = coordinator.getDiagnostics().updateRangePublications;
    const requestedBefore = requestedBytes();
    resetInstancedSpriteBuckets(sprites);
    for (const kind of [false, true, 'smoke', 'combustion']) {
      assert.equal(writeInstancedSpriteFields(
        sprites, kind, 1, 2, 3, 4, 5, 1, 0, 1, 0.5, 0.25, 0.8,
      ), true);
    }
    commitInstancedSpriteBuckets(sprites);

    // The live VFX path commits after each spawn. Publication must remain one packed range per
    // attribute regardless of this logical-commit fanout.
    for (let index = 0; index < population; index++) {
      updateTrailStreakInstance(trails, index, {
        x: index, y: 0.4, z: index * 0.5, vx: 1, vz: 0,
        width: 0.5, length: 4, opacity: 0.7,
        color: { r: 1, g: 0.5, b: 0.2 },
      });
      commitTrailStreakInstances(trails, index + 1, { scroll: 0.2, time: 1.5 });
    }
    assert.equal(allAttributes.reduce((sum, attribute) => sum + attribute.updateRanges.length, 0), 0,
      'logical commits must not allocate public Three.js ranges before renderer publication');

    epoch = coordinator.arm();
    scene.onBeforeRender({}, scene, camera, null);
    assert.equal(
      coordinator.getDiagnostics().updateRangeAllocations - allocationsBefore,
      0,
      'renderer publication reuses registration-time range records without allocating',
    );
    assert.equal(
      coordinator.getDiagnostics().updateRangePublications - publicationsBefore,
      23,
      'four five-attribute sprite buckets plus one three-attribute trail pool still publish once each',
    );
    assert.equal(allAttributes.reduce((sum, attribute) => sum + attribute.updateRanges.length, 0), 23);

    const expectedBytes = (4 * (3 + 2 + 1 + 3 + 1) + population * (16 + 3 + 1))
      * Float32Array.BYTES_PER_ELEMENT;
    assert.equal(requestedBytes() - requestedBefore, expectedBytes,
      'requested upload bytes must follow the packed active prefix, not allocated capacity');
    assert.ok(expectedBytes < capacity * (4 * 10 + 20) * Float32Array.BYTES_PER_ELEMENT,
      'the fixture must distinguish dirty bytes from a complete-capacity upload');
    assert.equal(trails.mesh.count, population, 'active draw count stays independent of capacity');

    for (const attribute of allAttributes) acknowledgeUpdate(attribute);
    coordinator.disarm(epoch);
  }
});

test('common-rock matrices publish only the changed compacted slot after residency', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial();
  const pool = createAsteroidInstancePool(scene);
  const roots = [];

  for (let index = 0; index < 10; index++) {
    const root = new THREE.Group();
    root.position.set(index * 4, 0, -index * 3);
    const leaf = new THREE.Mesh(geometry, material);
    leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
    leaf.userData.asteroidInstanceVariant = 0;
    root.userData.asteroidInstanceBody = leaf;
    root.add(leaf);
    scene.add(root);
    roots.push(root);
    assert.equal(registerAsteroidBaseLeaf(pool, { id: index + 1, type: 'asteroid' }, root), true);
  }

  syncAsteroidInstancePool(pool);
  const bucket = pool.variants[0];
  const attribute = bucket.mesh.instanceMatrix;
  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  assert.deepEqual(attribute.updateRanges, [{ start: 0, count: attribute.array.length }],
    'the first renderer-owned admission retains the complete bounded upload');
  acknowledgeUpdate(attribute);
  coordinator.disarm(epoch);

  const requestedBefore = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  roots[9].position.x += 1.25;
  const moved = syncAsteroidInstancePool(pool);
  assert.equal(moved.matrixUploads, 1);
  assert.equal(attribute.updateRanges.length, 0,
    'matrix writes stay private until the renderer publication point');

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  assert.deepEqual(attribute.updateRanges, [{ start: 9 * 16, count: 16 }]);
  const requestedAfter = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  assert.equal(requestedAfter - requestedBefore, 16 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal((requestedAfter - requestedBefore) / attribute.array.byteLength, 1 / 64,
    'one transform in the default 64-slot bucket requests 98.4375% fewer bytes');
  acknowledgeUpdate(attribute);
  coordinator.disarm(epoch);

  disposeAsteroidInstancePool(pool);
  geometry.dispose();
  material.dispose();
});

test('ordinary-flight plume layers publish one packed socket prefix per layer', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const plume = new ContinuousPlumeSystem(THREE, KESTREL_MAIN_PLUME_RECIPE, {
    distortionEnabled: false,
    maxSockets: 20,
    scene,
  });
  scene.add(plume.group);
  const sockets = [
    { x: -1, y: 0, z: -0.5, ax: -1, ay: 0, az: 0 },
    { x: -1, y: 0, z: 0.5, ax: -1, ay: 0, az: 0 },
  ];
  const attributesFor = (batch) => [
    [batch.attrs.instOffset, 3, 0],
    [batch.attrs.instAxis, 4, 3],
    [batch.attrs.instParams, 4, 7],
    [batch.attrs.instDynamics, 4, 11],
    [batch.attrs.instColor, 3, 15],
    [batch.attrs.instSpin, 2, 18],
  ];
  const assertPackedParity = (batch) => {
    const sourceSlots = plume.pool.slots
      .slice(0, plume.pool.activeCount)
      .filter((slot) => slot.layerIndex === batch.layerIndex);
    assert.equal(sourceSlots.length, batch.writeCount);
    for (let index = 0; index < batch.writeCount; index++) {
      const slot = sourceSlots[index];
      const packedStart = index * 20;
      const offsetStart = index * 3;
      const fourStart = index * 4;
      const packed = Array.from(batch.backing.array.slice(packedStart, packedStart + 20));
      const expectedFromSource = Array.from(Float32Array.from([
        ...slot.offset,
        ...slot.axis,
        slot.length,
        slot.width,
        slot.throttle,
        slot.phase,
        slot.boostBlend ?? 0,
        slot.flowSpeed ?? 1,
        slot.turbulence ?? 0.5,
        slot.coreSheath ?? 0.8,
        slot.dissipation ?? 1,
        ...slot.color,
        slot.spinAmp ?? 0,
        slot.spinPhase ?? 0,
      ]));
      assert.deepEqual(packed, expectedFromSource,
        `${batch.role} packs the exact 20 authored instance scalars from the live slot`);
      assert.deepEqual(packed, [
          ...batch.offset.slice(offsetStart, offsetStart + 3),
          ...batch.axisScale.slice(fourStart, fourStart + 4),
          ...batch.params.slice(fourStart, fourStart + 4),
          ...batch.dynamics.slice(fourStart, fourStart + 4),
          ...batch.color.slice(offsetStart, offsetStart + 3),
          ...batch.spin.slice(index * 2, index * 2 + 2),
        ], `${batch.role} keeps its existing CPU readback contract`);
    }
  };

  plume.update(1 / 60, 0.72, sockets, { a11y: {} });
  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  const activeBatches = plume.layerBatches.filter((batch) => batch.writeCount > 0 && batch.mesh.visible);
  assert.ok(activeBatches.length >= 2, 'accepted Kestrel feedback keeps multiple authored layers');
  for (const batch of activeBatches) {
    assert.equal(batch.dynamicBufferOwner.bindings.length, 1,
      'one backing store replaces five per-layer publication owners');
    assert.equal(batch.dynamicBufferOwner.bindings[0].attribute, batch.backing);
    assert.equal(batch.backing.stride, 20);
    assert.equal(batch.backing.isInstancedInterleavedBuffer, true);
    for (const [attribute, itemSize, offset] of attributesFor(batch)) {
      assert.equal(attribute.isInterleavedBufferAttribute, true);
      assert.equal(attribute.data, batch.backing);
      assert.equal(attribute.itemSize, itemSize);
      assert.equal(attribute.offset, offset);
    }
    assert.deepEqual(batch.backing.updateRanges, [{ start: 0, count: batch.backing.array.length }]);
    assertPackedParity(batch);
    acknowledgeInitial(batch.backing);
  }
  coordinator.disarm(epoch);

  const publicationsBefore = coordinator.getDiagnostics().updateRangePublications;
  const requestedBefore = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  plume.update(1 / 60, 0.72, sockets, { a11y: {} });
  assert.equal(activeBatches.reduce((sum, batch) => sum + batch.backing.updateRanges.length, 0), 0,
  'plume writes stay private until the renderer publication point');

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  let expectedBytes = 0;
  let fullBytes = 0;
  for (const batch of activeBatches) {
    assert.deepEqual(batch.backing.updateRanges, [{
      start: 0,
      count: batch.writeCount * 20,
    }]);
    expectedBytes += batch.writeCount * 20 * Float32Array.BYTES_PER_ELEMENT;
    fullBytes += batch.backing.array.byteLength;
    assertPackedParity(batch);
    acknowledgeUpdate(batch.backing);
  }
  const requestedAfter = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  assert.equal(requestedAfter - requestedBefore, expectedBytes);
  assert.equal(expectedBytes / fullBytes, sockets.length / 20,
    'two ordinary-flight sockets request 90% fewer bytes than the allocated family buffers');
  assert.equal(
    coordinator.getDiagnostics().updateRangePublications - publicationsBefore,
    activeBatches.length,
    'each active authored layer publishes one range instead of five',
  );
  coordinator.disarm(epoch);

  const priorBackings = activeBatches.map((batch) => batch.backing);
  assert.equal(plume.setQualityTier('low'), 'low');
  for (let index = 0; index < activeBatches.length; index++) {
    const batch = activeBatches[index];
    assert.notEqual(batch.backing, priorBackings[index]);
    assert.equal(Object.hasOwn(priorBackings[index], 'onUploadCallback'), false,
      'quality replacement retires the old backing callback');
    assert.equal(batch.mesh.geometry, batch.tierBuffers.low.geo);
    assert.equal(batch.dynamicBufferOwner.bindings.length, 1);
    assert.equal(batch.dynamicBufferOwner.bindings[0].attribute, batch.backing);
    for (const [attribute, itemSize, offset] of attributesFor(batch)) {
      assert.equal(attribute.data, batch.backing);
      assert.equal(attribute.itemSize, itemSize);
      assert.equal(attribute.offset, offset);
    }
  }
  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const batch of activeBatches) {
    assert.deepEqual(batch.backing.updateRanges, [{ start: 0, count: batch.backing.array.length }],
      'the replacement tier receives one complete backing-store upload');
    acknowledgeInitial(batch.backing);
  }
  coordinator.disarm(epoch);

  const currentBackings = activeBatches.map((batch) => batch.backing);
  plume.dispose();
  for (const backing of currentBackings) {
    assert.equal(Object.hasOwn(backing, 'onUploadCallback'), false,
      'plume teardown releases the backing callback exactly once');
  }
});

test('signed RCS layers publish only the live impulse prefix', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const rcs = new RcsImpulseSystem(THREE, KESTREL_RCS_RECIPE, {
    maxImpulses: 12,
    scene,
  });
  scene.add(rcs.group);
  const attributesFor = (batch) => [
    batch.attrs.instOffset,
    batch.attrs.instAxis,
    batch.attrs.instParams,
    batch.attrs.instDynamics,
    batch.attrs.instColor,
  ];

  assert.equal(rcs.fire([0, 0, 0], [0, 0, 1], 1), 0);
  rcs.update(1 / 60, {});
  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  const activeBatches = rcs.layerBatches.filter((batch) => batch.writeCount > 0 && batch.mesh.visible);
  assert.ok(activeBatches.length >= 2, 'one signed pulse retains layered RCS feedback');
  for (const batch of activeBatches) {
    for (const attribute of attributesFor(batch)) {
      assert.deepEqual(attribute.updateRanges, [{ start: 0, count: attribute.array.length }]);
      acknowledgeUpdate(attribute);
    }
  }
  coordinator.disarm(epoch);

  const requestedBefore = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  rcs.update(1 / 60, {});
  assert.equal(activeBatches.flatMap(attributesFor)
    .reduce((sum, attribute) => sum + attribute.updateRanges.length, 0), 0,
  'RCS writes stay private until the renderer publication point');

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  let expectedBytes = 0;
  let fullBytes = 0;
  for (const batch of activeBatches) {
    for (const attribute of attributesFor(batch)) {
      assert.deepEqual(attribute.updateRanges, [{
        start: 0,
        count: batch.writeCount * attribute.itemSize,
      }]);
      expectedBytes += batch.writeCount * attribute.itemSize * Float32Array.BYTES_PER_ELEMENT;
      fullBytes += attribute.array.byteLength;
      acknowledgeUpdate(attribute);
    }
  }
  const requestedAfter = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  assert.equal(requestedAfter - requestedBefore, expectedBytes);
  assert.equal(expectedBytes / fullBytes, 1 / 12,
    'one signed pulse requests 91.67% fewer bytes than the allocated RCS buffers');
  coordinator.disarm(epoch);
  rcs.dispose();
});

test('ordinary-flight shard particles publish only their live prefix and survive quality migration', () => {
  const { fixture, scene, coordinator, camera, material, mesh } = makeParticleVfxFixture();
  const attributes = () => [
    fixture._pGeo.attributes.aShardPos,
    fixture._pGeo.attributes.aColor,
    fixture._pGeo.attributes.aSize,
    fixture._pGeo.attributes.aAlpha,
    fixture._pGeo.attributes.aTrailAxis,
    fixture._pGeo.attributes.aTrailStretch,
  ];

  fixture._integrateParticles(1 / 60);
  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const attribute of attributes()) {
    assert.deepEqual(attribute.updateRanges, [{ start: 0, count: attribute.array.length }]);
    acknowledgeInitial(attribute);
  }
  coordinator.disarm(epoch);

  const requestedBefore = fixture._particleDynamicBufferOwner.diagnostics.requestedUploadBytes;
  fixture._integrateParticles(1 / 60);
  assert.equal(attributes().reduce((sum, attribute) => sum + attribute.updateRanges.length, 0), 0,
    'particle integration must stay private until the renderer publication point');

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  const expectedCounts = [6, 6, 2, 2, 0, 0];
  for (const [index, attribute] of attributes().entries()) {
    if (expectedCounts[index] > 0) {
      assert.deepEqual(attribute.updateRanges, [{ start: 0, count: expectedCounts[index] }]);
      acknowledgeUpdate(attribute);
    } else {
      assert.deepEqual(attribute.updateRanges, [],
        'unchanged trail-shape channels remain resident between particle spawns');
    }
  }
  coordinator.disarm(epoch);

  const requestedAfter = fixture._particleDynamicBufferOwner.diagnostics.requestedUploadBytes;
  const expectedBytes = expectedCounts.reduce((sum, count) => sum + count, 0)
    * Float32Array.BYTES_PER_ELEMENT;
  const fullBytes = attributes().reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
  assert.equal(requestedAfter - requestedBefore, expectedBytes);
  assert.equal(expectedBytes, 64);
  assert.equal(expectedBytes / fullBytes, 64 / 120000,
    'two ordinary-flight particles request 99.95% fewer bytes than the medium pool capacity');

  const oldAttributes = attributes();
  fixture.state.settings.video.particleQuality = 'low';
  assert.equal(fixture._syncParticleQuality(), true);
  assert.equal(fixture._particleDynamicBufferOwner.diagnostics.capacity, 1500);
  assert.equal(mesh.geometry, fixture._pGeo);
  assert.equal(mesh.count, 2);
  for (const attribute of oldAttributes) {
    assert.equal(Object.hasOwn(attribute, 'onUploadCallback'), false,
      'quality migration releases callbacks from disposed attributes');
  }

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const attribute of attributes()) {
    assert.deepEqual(attribute.updateRanges, [{ start: 0, count: attribute.array.length }],
      'replacement buffers receive one complete residency upload');
    acknowledgeInitial(attribute);
  }
  coordinator.disarm(epoch);
  material.dispose();
  fixture._pGeo.dispose();
});

test('shard particles pack fragmented CPU slots into the live GPU prefix', () => {
  const capacity = 3000;
  const { fixture, scene, coordinator, camera, material } = makeParticleVfxFixture(capacity);
  const attributes = [
    fixture._pGeo.attributes.aShardPos,
    fixture._pGeo.attributes.aColor,
    fixture._pGeo.attributes.aSize,
    fixture._pGeo.attributes.aAlpha,
    fixture._pGeo.attributes.aTrailAxis,
    fixture._pGeo.attributes.aTrailStretch,
  ];

  fixture._integrateParticles(1 / 60);
  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const attribute of attributes) acknowledgeInitial(attribute);
  coordinator.disarm(epoch);

  const highSlot = capacity - 1;
  fixture._alive[1] = 0;
  fixture._activeParticlePos[1] = -1;
  fixture._alive[highSlot] = 1;
  fixture._activeParticles[1] = highSlot;
  fixture._activeParticlePos[highSlot] = 1;
  fixture._life[highSlot] = 4;
  fixture._px[highSlot] = 91;
  fixture._py[highSlot] = 7;
  fixture._pz[highSlot] = -43;
  fixture._size0[highSlot] = 5;
  fixture._size1[highSlot] = 3;
  fixture._cr0[highSlot] = 0.1;
  fixture._cg0[highSlot] = 0.2;
  fixture._cb0[highSlot] = 0.3;
  fixture._cr1[highSlot] = 0.5;
  fixture._cg1[highSlot] = 0.6;
  fixture._cb1[highSlot] = 0.7;
  fixture._particleTrailAxis[highSlot] = 0.75;
  fixture._particleTrailStretch[highSlot] = 4.5;
  fixture._pPackedParticleSlots[1] = -1;

  const requestedBefore = fixture._particleDynamicBufferOwner.diagnostics.requestedUploadBytes;
  fixture._integrateParticles(1 / 60);
  assert.equal(fixture._shardMesh.count, 2,
    'fragmented CPU storage must not leave invisible holes in the live instance count');
  assert.deepEqual(Array.from(fixture._pPos.slice(3, 6)), [91, 7, -43]);
  assert.equal(fixture._pTrailAxis[1], 0.75);
  assert.equal(fixture._pTrailStretch[1], 4.5);

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  const expectedRanges = [
    { start: 0, count: 6 },
    { start: 0, count: 6 },
    { start: 0, count: 2 },
    { start: 0, count: 2 },
    { start: 1, count: 1 },
    { start: 1, count: 1 },
  ];
  for (let index = 0; index < attributes.length; index++) {
    assert.deepEqual(attributes[index].updateRanges, [expectedRanges[index]]);
    acknowledgeUpdate(attributes[index]);
  }
  coordinator.disarm(epoch);

  const requestedBytes = fixture._particleDynamicBufferOwner.diagnostics.requestedUploadBytes
    - requestedBefore;
  assert.equal(requestedBytes, 72,
    'two live particles request 72 bytes regardless of how far apart their CPU slots are');
  assert.equal(requestedBytes / 96000, 0.00075,
    'packing avoids 99.925% of the four moving-attribute bytes forced by the medium-pool span');

  fixture._activeParticles[0] = highSlot;
  fixture._activeParticlePos[highSlot] = 0;
  fixture._activeParticles[1] = 0;
  fixture._activeParticlePos[0] = 1;
  fixture._pPackedParticleSlots[0] = -1;
  fixture._pPackedParticleSlots[1] = -1;
  fixture._age[0] = fixture._life[0];
  fixture._integrateParticles(1 / 60);
  assert.equal(fixture._liveCount, 1);
  assert.equal(fixture._shardMesh.count, 1);
  assert.ok(fixture._pAlpha[0] > 0,
    'retiring a later CPU slot must not erase the already-packed live GPU record at that index');
  assert.deepEqual(Array.from(fixture._pPos.slice(0, 3)), [91, 7, -43]);
  material.dispose();
  fixture._pGeo.dispose();
});

test('nearby asteroid seam markers publish only their live matrix and color prefix', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const asteroid = {
    id: 2,
    type: 'asteroid',
    alive: true,
    pos: { x: 40, z: -25 },
    rot: 0.2,
    radius: 12,
    data: {
      seams: [
        { localOffset: { x: 2, z: -1 } },
        { localOffset: { x: -3, z: 4 } },
      ],
    },
  };
  const fixture = Object.create(vfx);
  fixture._scene = scene;
  fixture.state = { playerId: player.id, simTime: 1, entityList: [asteroid] };
  fixture.helpers = { player: () => player };
  fixture._spawnLocalXZ = { x: 0, z: 0 };
  fixture._toLocalXZ = (x, z, out) => { out.x = x; out.z = z; return out; };
  fixture._ctmp = new THREE.Color();
  fixture._t = 1;
  fixture._initSeamMarkers();
  fixture._updateSeamMarkers(1 / 15);

  const pool = fixture._seamMarkers;
  const attributes = [pool.mesh.instanceMatrix, pool.mesh.instanceColor];
  assert.ok(pool.dynamicBufferOwner, 'the production seam-marker pool must register for ranged publication');
  assert.equal(pool.mesh.count, 2);

  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const attribute of attributes) {
    assert.deepEqual(attribute.updateRanges, [{ start: 0, count: attribute.array.length }]);
    acknowledgeInitial(attribute);
  }
  coordinator.disarm(epoch);

  const requestedBefore = pool.dynamicBufferOwner.diagnostics.requestedUploadBytes;
  fixture._t += 1 / 15;
  fixture._updateSeamMarkers(1 / 15);
  assert.equal(attributes.reduce((sum, attribute) => sum + attribute.updateRanges.length, 0), 0,
    'seam-marker writes must stay private until renderer publication');

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  assert.deepEqual(pool.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 2 * 16 }]);
  assert.deepEqual(pool.mesh.instanceColor.updateRanges, [{ start: 0, count: 2 * 3 }]);
  for (const attribute of attributes) acknowledgeUpdate(attribute);
  coordinator.disarm(epoch);

  const requestedBytes = pool.dynamicBufferOwner.diagnostics.requestedUploadBytes - requestedBefore;
  const fullBytes = attributes.reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
  assert.equal(requestedBytes, 2 * (16 + 3) * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(requestedBytes / fullBytes, 2 / 96,
    'two nearby seams request 97.92% fewer bytes than the allocated marker buffers');
  pool.mesh.geometry.dispose();
  pool.mesh.material.dispose();
});

test('active field-device geometry publishes each visible instance prefix', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const fixture = Object.create(vfx);
  fixture._scene = scene;
  fixture._t = 2;
  fixture.state = {
    simTime: 2,
    settings: { video: {}, accessibility: {} },
    fields: {
      active: [
        { id: 'well', kind: 'well', center: { x: 0, z: 0 }, radius: 24, engaged: true },
        { id: 'repulsor', kind: 'repulsor', center: { x: 80, z: 0 }, radius: 28, engaged: true },
        {
          id: 'cone', kind: 'cone', center: { x: -80, z: 0 }, radius: 36, engaged: true,
          dir: { x: 1, z: 0 }, halfAngleRad: 0.5,
        },
      ],
    },
  };
  fixture._initFieldGeometry();

  const fg = fixture._fieldGeom;
  const expected = [
    ['vane', fg.vaneMesh, 6],
    ['pip', fg.pipMesh, 12],
    ['knot', fg.knotMesh, 1],
    ['dome', fg.domeMesh, 1],
    ['rib', fg.ribMesh, 8],
    ['berm', fg.bermMesh, 14],
    ['chevron', fg.chevronMesh, 20],
    ['bank', fg.bankMesh, 10],
  ];
  for (const [name] of expected) {
    assert.ok(fg.dynamicBufferOwners?.[name], `${name} field geometry must register for ranged publication`);
  }

  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const [, mesh] of expected) {
    const attributes = [mesh.instanceMatrix, mesh.instanceColor].filter(Boolean);
    for (const attribute of attributes) {
      assert.deepEqual(attribute.updateRanges, [{ start: 0, count: attribute.array.length }]);
      acknowledgeInitial(attribute);
    }
  }
  coordinator.disarm(epoch);

  const requestedBefore = expected.reduce((sum, [name]) => (
    sum + fg.dynamicBufferOwners[name].diagnostics.requestedUploadBytes
  ), 0);
  fixture._updateFieldGeometry(1 / 60);
  for (const [, mesh, count] of expected) assert.equal(mesh.count, count);

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  let expectedBytes = 0;
  let fullBytes = 0;
  for (const [, mesh, count] of expected) {
    const attributes = [mesh.instanceMatrix, mesh.instanceColor].filter(Boolean);
    for (const attribute of attributes) {
      assert.deepEqual(attribute.updateRanges, [{ start: 0, count: count * attribute.itemSize }]);
      expectedBytes += count * attribute.itemSize * Float32Array.BYTES_PER_ELEMENT;
      fullBytes += attribute.array.byteLength;
      acknowledgeUpdate(attribute);
    }
  }
  coordinator.disarm(epoch);

  const requestedAfter = expected.reduce((sum, [name]) => (
    sum + fg.dynamicBufferOwners[name].diagnostics.requestedUploadBytes
  ), 0);
  assert.equal(requestedAfter - requestedBefore, expectedBytes);
  assert.equal(expectedBytes, 5_448);
  assert.equal(fullBytes, 33_760);
  assert.ok(expectedBytes / fullBytes < 0.162,
    'one active field of each kind requests more than 83.8% fewer geometry bytes');

  for (const [, mesh] of expected) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test('tether topology coordinates stay resident while the rope positions move', () => {
  const scene = new THREE.Scene();
  const fixture = Object.create(vfx);
  fixture._scene = scene;
  fixture._initTetherCable();

  const cable = fixture._tetherCable;
  const topologyAttributes = [
    cable.mesh.geometry.attributes.aAlong,
    cable.mesh.geometry.attributes.aSide,
    cable.glow.geometry.attributes.aAlong,
    cable.glow.geometry.attributes.aSide,
  ];
  const expectedAlong = [];
  const expectedSide = [];
  for (let index = 0; index <= cable.SEG; index++) {
    expectedAlong.push(Math.fround(index / cable.SEG), Math.fround(index / cable.SEG));
    expectedSide.push(-1, 1);
  }
  assert.deepEqual(Array.from(topologyAttributes[0].array), expectedAlong);
  assert.deepEqual(Array.from(topologyAttributes[1].array), expectedSide);
  assert.deepEqual(Array.from(topologyAttributes[2].array), expectedAlong);
  assert.deepEqual(Array.from(topologyAttributes[3].array), expectedSide);
  for (const attribute of topologyAttributes) assert.equal(attribute.usage, THREE.StaticDrawUsage);

  const player = {
    id: 1, alive: true, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  const target = {
    id: 2, type: 'asteroid', alive: true, radius: 8,
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  };
  fixture.state = {
    playerId: player.id,
    player: {
      tether: {
        active: true, targetId: target.id, restLength: 44,
        strain: 0, load: 0, phase: 'slack',
      },
    },
    settings: { video: { bloom: true, bloomStrength: 1 } },
    simTime: 1,
  };
  fixture.helpers = { player: () => player };
  fixture._ent = (id) => (id === target.id ? target : null);
  fixture._spawnLocalXZ = { x: 0, z: 0 };
  fixture._entityLocalXZ = { x: 0, z: 0 };
  fixture._toLocalXZ = (x, z, out) => { out.x = x; out.z = z; return out; };
  fixture._ctmp = new THREE.Color();
  fixture._c0 = new THREE.Color();
  fixture._c1 = new THREE.Color();
  fixture._spawnParticle = () => {};
  fixture._t = 1;

  const topologyVersions = topologyAttributes.map((attribute) => attribute.version);
  const positionVersion = cable.mesh.geometry.attributes.position.version;
  fixture._updateTetherCable(1 / 60);
  assert.equal(cable.mesh.geometry.attributes.position.version, positionVersion + 1,
    'the moving rope position buffer must still publish each active frame');
  assert.deepEqual(topologyAttributes.map((attribute) => attribute.version), topologyVersions,
    'fixed tether coordinates must not republish during a rope update');
  assert.equal(topologyAttributes.reduce((sum, attribute) => sum + attribute.array.byteLength, 0), 800,
    'one active tether frame avoids four full uploads totaling 800 bytes');

  cable.mesh.geometry.dispose();
  cable.glow.geometry.dispose();
  cable.band.geometry.dispose();
  cable.mesh.material.dispose();
  cable.glow.material.dispose();
  cable.band.material.dispose();
});

test('authored instance chunks publish only moved, hidden, released, and reused matrix slots', () => {
  assert.equal(typeof partsLibrary.runAuthoredInstanceRangeContractProbe, 'function',
    'parts library exposes its real private allocator through a bounded range contract probe');
  const result = partsLibrary.runAuthoredInstanceRangeContractProbe();

  assert.deepEqual(result.initialRange, { start: 0, count: 64 * 16 },
    'the first processing-eligible traversal retains one complete residency upload');
  assert.deepEqual(result.movedRange, { start: 16, count: 16 });
  assert.deepEqual(result.hiddenRange, { start: 0, count: 16 });
  assert.deepEqual(result.reusedRange, { start: 0, count: 16 });
  assert.equal(result.movedRequestedBytes, 16 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(result.movedRequestedBytes / result.allocatedBytes, 1 / 64,
    'one moved authored slot requests 98.4375% fewer bytes than its 64-matrix chunk');
  assert.equal(result.visibleAfterHide, 1);
  assert.equal(result.visibleAfterReuse, 2);
  assert.equal(result.invalid, false);
});
