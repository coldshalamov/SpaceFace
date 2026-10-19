import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  isRigidOpaqueShipCohortRoot,
  isRigidOpaqueDefaultCohortSource,
  RIGID_OPAQUE_SHIP_COHORT_MAX_ROOTS,
  render as renderSystem,
} from '../src/render/renderer.js';
import {
  RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES,
  clearRigidOpaqueBatchWarmedKeys,
  mintRigidOpaqueBatchSpecimen,
  mountRigidOpaqueBatchSpecimenTwins,
  planRigidOpaqueBatchSpecimenGroups,
  settleRigidOpaqueBatchSpecimenTwins,
} from '../src/render/rigidOpaqueBatch.js';
import { preloadRockSurfaceLibrary } from '../src/render/rockSurfaceLibrary.js';

// Decode stand-ins so the asteroid material matrix builds without a real image pipeline.
await preloadRockSurfaceLibrary(null, { loadTexture: async () => new THREE.Texture() });
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
  }),
};

// A generic authored hull: four rigid opaque leaves sharing one material and one geometry
// (one batch group), plus the leaves the policy battery must keep on their authored draws.
function makeRoot(id, { generation = 4, shown = true, defId = 'ship_freighter' } = {}) {
  const root = new THREE.Group();
  root.name = `traffic-${id}`;
  root.visible = shown;
  root.userData = {
    presentationEntityId: id,
    presentationEntityType: 'ship',
    presentationShipDefId: defId,
    presentationOccupantGeneration: generation,
    authoredAssetState: 'authored',
    authoredSlots: { hull: [`assets/ships/release/parts/wholeships/${defId}.glb`] },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.6 });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const batched = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `LOD0_HULL_${i}`;
    root.add(mesh);
    batched.push(mesh);
  }
  // A MOTION_-group-tagged leaf is transform-only motion — the batch copies its world
  // matrix every submit, so it belongs inside the cohort like the GLB hull groups.
  const motionLeaf = new THREE.Mesh(geometry, material);
  motionLeaf.name = 'LOD0_MOTION_PANEL';
  motionLeaf.userData.spacefaceTags = { motionGroup: 'hull_swing' };
  root.add(motionLeaf);
  const excluded = [];
  const animated = new THREE.Mesh(geometry, material);
  animated.name = 'ANIMATED_GIMBAL';
  animated.userData.spacefaceTags = { animated: true };
  root.add(animated);
  excluded.push(animated);
  const unowned = new THREE.Mesh(geometry, material);
  unowned.name = 'UNATTESTED_PIVOT';
  unowned.userData.animated = true;
  root.add(unowned);
  excluded.push(unowned);
  const glass = new THREE.Mesh(geometry,
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 }));
  glass.name = 'CANOPY_GLASS';
  root.add(glass);
  excluded.push(glass);
  const hooked = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  hooked.name = 'CUSTOM_SHADER_PLATE';
  hooked.material.onBeforeCompile = () => {};
  root.add(hooked);
  excluded.push(hooked);
  root.updateMatrixWorld(true);
  return { root, batched: [...batched, motionLeaf], excluded };
}

function makeOwner(records, {
  compile = () => ({ pipelines: {}, gpuResidency: {} }),
  shipAux = records.map(({ root }) => ({
    mesh: root, visible: root.visible !== false, viewCulled: root.visible === false,
  })),
  defId = 'ship_freighter',
} = {}) {
  const scene = new THREE.Scene();
  const entities = new Map();
  const meshes = new Map();
  for (const { root } of records) {
    const id = root.userData.presentationEntityId;
    scene.add(root);
    meshes.set(id, root);
    entities.set(id, {
      id, type: 'ship', alive: true, occupantGeneration: root.userData.presentationOccupantGeneration,
      data: { defId },
    });
  }
  // A live player entity whose root is elsewhere — the cohort must never claim it.
  entities.set('player-1', {
    id: 'player-1', type: 'ship', alive: true, occupantGeneration: 1,
    data: { defId: 'ship_kestrel' },
  });
  scene.updateMatrixWorld(true);
  const state = {
    mode: 'running', playerId: 'player-1', entities,
    render: { compileObjectPipelines: compile, admissionRunGeneration: 1 },
    world: { enterSerial: 1, currentSectorId: 'test' }, contextRestoreSeq: 0,
  };
  const owner = Object.assign(Object.create(renderSystem), {
    scene, state, _meshes: meshes, _opaqueBatchSupported: true,
    _shadowSettingOn: false,
    _entityFrame: { authored: [], shipAux },
    _authoredInstanceSyncOptions: {},
  });
  owner._enableRigidOpaqueBatch(true);
  return { owner, scene, state, records, dispose() {
    owner._rigidOpaqueBatchController?.dispose();
    for (const { root } of records) root.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose?.();
    });
    for (const object of scene.children) if (object.userData?.spacefaceRigidOpaqueBatch) {
      object.geometry?.dispose?.();
      object.material?.dispose?.();
    }
  } };
}

test('generic ship selector binds authored traffic roots and rejects player, wasp, and stale lives', () => {
  const record = makeRoot(41), fixture = makeOwner([record]);
  try {
    const { owner } = fixture;
    assert.equal(isRigidOpaqueShipCohortRoot(owner, record.root), true);
    assert.ok(record.batched.every((source) => isRigidOpaqueDefaultCohortSource(owner, source)));

    const replacements = [
      (candidateOwner) => { candidateOwner.state.playerId = 41; },
      (candidateOwner) => { candidateOwner._meshes.set(41, new THREE.Group()); },
      (candidateOwner) => { candidateOwner.state.entities.get(41).alive = false; },
      (candidateOwner) => { candidateOwner.state.entities.get(41).type = 'asteroid'; },
      (candidateOwner) => { candidateOwner.state.entities.get(41).data.defId = 'ship_other'; },
      (_candidateOwner, candidate) => { candidate.root.userData.presentationOccupantGeneration++; },
      (_candidateOwner, candidate) => { candidate.root.userData.authoredAssetState = 'procedural-fallback'; },
      // The exact wasp swarmer resolves to the Ashline cohort with its own name/package pins.
      (candidateOwner) => {
        const entity = candidateOwner.state.entities.get(41);
        entity.data.defId = 'ship_wasp';
        entity.data.lootTableId = 'wasp_swarmer';
        candidateOwner.state.entities.get(41).data = entity.data;
      },
    ];
    for (const invalidate of replacements) {
      const clean = makeRoot(41), isolated = makeOwner([clean]);
      try {
        invalidate(isolated.owner, clean);
        assert.equal(isRigidOpaqueShipCohortRoot(isolated.owner, clean.root), false);
      } finally { isolated.dispose(); }
    }
  } finally { fixture.dispose(); }
});

test('visible authored ship roots fill the cohort cap before hidden entries', async () => {
  assert.equal(RIGID_OPAQUE_SHIP_COHORT_MAX_ROOTS, 24);
  const hidden = makeRoot(1, { shown: false });
  const visible = Array.from({ length: 25 }, (_, index) => makeRoot(index + 2));
  const fixture = makeOwner([hidden, ...visible], { shipAux: [] });
  try {
    fixture.owner._entityFrame.shipAux = [];
    await fixture.owner._syncRigidOpaqueBatchProbe();
    assert.equal(fixture.owner._rigidOpaqueBatchShipLifetimes.size, 0,
      'an absent presented list admits no new roots');
    fixture.owner._entityFrame.shipAux = [hidden, ...visible].map(({ root }) => ({
      mesh: root, visible: root.visible !== false, viewCulled: root.visible === false,
    }));
    await fixture.owner._syncRigidOpaqueBatchProbe();
    const diagnostics = fixture.owner.getRigidOpaqueBatchDiagnosticsForBench();
    assert.equal(diagnostics.status, 'active');
    assert.equal(diagnostics.instances, 24 * 5);
    assert.equal(fixture.owner._rigidOpaqueBatchShipLifetimes.size, 24);
    assert.ok(hidden.batched.every((source) => source.layers.mask === 1),
      'hidden roots do not occupy slots or lose their direct draws');
    assert.ok(visible.slice(0, 24).every(({ batched }) => batched.every((source) => source.layers.mask === 0)));
    assert.ok(visible[24].batched.every((source) => source.layers.mask === 1),
      'the twenty-fifth shown root stays on the direct path at the cap');
  } finally { fixture.dispose(); }
});

test('policy keeps animated, transparent, and custom-hook leaves direct inside an admitted root', async () => {
  const record = makeRoot(73), fixture = makeOwner([record]);
  try {
    await fixture.owner._syncRigidOpaqueBatchProbe();
    const diagnostics = fixture.owner.getRigidOpaqueBatchDiagnosticsForBench();
    assert.equal(diagnostics.status, 'active');
    assert.equal(diagnostics.instances, 5);
    assert.ok(record.batched.every((source) => source.layers.mask === 0),
      'rigid leaves and the motion-group leaf are submitted by the retained batch');
    assert.ok(record.excluded.every((source) => source.layers.mask === 1),
      'tagged-animated, unattested-pivot, transparent, and custom-hook leaves stay direct');
  } finally { fixture.dispose(); }
});

test('a rebound same-id ship root preserves life identity across preparation', async () => {
  let release;
  const pendingPreparation = new Promise((resolve) => { release = resolve; });
  const record = makeRoot(89), fixture = makeOwner([record], {
    compile: async () => { await pendingPreparation; return { pipelines: {}, gpuResidency: {} }; },
  });
  try {
    const pending = fixture.owner._syncRigidOpaqueBatchProbe();
    assert.ok(record.batched.every((source) => source.layers.mask === 1),
      'sources remain direct until preparation has succeeded');
    fixture.state.entities.get(89).alive = false;
    release();
    await pending;
    assert.ok(record.batched.every((source) => source.layers.mask === 1),
      'death during preparation cannot hide the old life');
    assert.equal(fixture.owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'idle');

    const entity = fixture.state.entities.get(89);
    entity.alive = true;
    entity.occupantGeneration++;
    await fixture.owner._syncRigidOpaqueBatchProbe();
    assert.ok(record.batched.every((source) => source.layers.mask === 1));
    record.root.userData.presentationOccupantGeneration = entity.occupantGeneration;
    await fixture.owner._syncRigidOpaqueBatchProbe();
    assert.equal(fixture.owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'active');
    assert.ok(record.batched.every((source) => source.layers.mask === 0));
  } finally { fixture.dispose(); }
});

test('the family-decode rewarm compiles the rebuilt matrix then detaches its pin root', async () => {
  const scene = new THREE.Scene();
  const compiled = [];
  const notes = [];
  const state = {
    render: {
      compileObjectPipelines: (root) => { compiled.push(root); return {}; },
    },
  };
  const owner = Object.assign(Object.create(renderSystem), {
    scene, state, _meshes: new Map(), renderer: {},
    _asteroidInstancePool: {},
    _keyLight: null, cam: null, _shadowSettingOn: false,
    _depthCollectLightSig: () => 'sig',
    _noteShadowMeshAdded: (root) => notes.push(`add:${root.name}`),
    _noteShadowMeshRemoved: (root) => notes.push(`remove:${root.name}`),
  });
  await owner._runRockFamilyDecodeRewarm(scene);
  const warm = compiled.find((root) => root && root.name === 'SF_AsteroidLeafPrewarm');
  assert.ok(warm, 'the rebuilt leaf matrix is compiled once here');
  assert.equal(warm.parent, null, 'the compile-only pin leaves the scene afterwards');
  assert.ok(notes.includes('add:SF_AsteroidLeafPrewarm'));
  assert.ok(notes.includes('remove:SF_AsteroidLeafPrewarm'));

  compiled.length = 0;
  notes.length = 0;
  await owner._runRockFamilyDecodeRewarm(new THREE.Scene());
  assert.equal(compiled.length, 0, 'a dead scene owner never rebuilds the matrix');
});

test('the batch specimen warm mints one keyed batch specimen per group then detaches', async () => {
  // The warm registry is session-wide now — sibling tests warm identical fixture keys.
  clearRigidOpaqueBatchWarmedKeys();
  const record = makeRoot(101);
  const scene = new THREE.Scene();
  scene.add(record.root);
  scene.updateMatrixWorld(true);
  const compiled = [];
  const owner = Object.assign(Object.create(renderSystem), {
    scene,
    state: {
      mode: 'loading',
      render: {
        compileObjectPipelines: (root) => { compiled.push(root); return { skipped: true }; },
      },
    },
    _meshes: new Map(), renderer: {},
    _opaqueBatchSupported: true,
    _keyLight: null, cam: null, _shadowSettingOn: false,
    _depthCollectLightSig: () => 'sig',
  });
  try {
    await owner._runRigidOpaqueBatchSpecimenWarm([record.root]);
    const warm = compiled.find((root) => root && root.name === 'SF_RigidOpaqueBatchSpecimenWarm');
    assert.ok(warm, 'the specimen warm root is compiled once here');
    assert.equal(warm.parent, null, 'the specimen pin leaves the scene afterwards');
    const specimens = warm.children.filter((child) => child.isBatchedMesh === true);
    // The four plain leaves plus the motion-group leaf share one material and one
    // geometry: one (material, geometry, lane) group → one batch program specimen.
    assert.equal(specimens.length, 1);
    const specimen = specimens[0];
    assert.equal(specimen.name, 'SF_RigidOpaqueBatchSpecimen_nocast|noreceive');
    assert.ok(specimen._colorsTexture == null,
      'the warm disposes its pin specimens once their programs are linked');
    assert.notEqual(specimen.material, record.batched[0].material,
      'the specimen carries the cloned batch material, not the authored source');
    assert.ok(record.batched.every((source) => source.layers.mask === 1),
      'specimen minting never suppresses the direct source draws');

    compiled.length = 0;
    await owner._runRigidOpaqueBatchSpecimenWarm([record.root]);
    assert.equal(compiled.length, 0, 'minted group keys dedupe across re-warms');

    owner._meshes = null;
    await owner._runRigidOpaqueBatchSpecimenWarm([makeRoot(103).root]);
    assert.equal(compiled.length, 0, 'a dead scene owner never re-mints specimens');
  } finally {
    record.root.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose?.();
    });
  }
});

test('the specimen planner keeps singleton groups — canon specimens are unique signatures', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const roots = [false, true].map((vertexColors, i) => {
    const root = new THREE.Group();
    root.name = `specimen-${i}`;
    const leaf = new THREE.Mesh(geometry,
      new THREE.MeshStandardMaterial({ color: 0x778899, vertexColors }));
    leaf.name = 'LOD0_HULL_0';
    root.add(leaf);
    root.updateMatrixWorld(true);
    return root;
  });
  try {
    const plan = planRigidOpaqueBatchSpecimenGroups(roots, {
      isTransformOnlySource: () => true,
    });
    // Each root carries one surface with its own material: two distinct
    // (material, geometry, lane) keys with one member each. The live planner drops
    // below-minimum groups; the specimen planner must keep each singleton — an
    // unwarmed key still pays a mid-flight USE_BATCHING link when a real cohort forms.
    assert.equal(plan.groups.length, 2,
      'every unique (material, geometry, lane) key earns one specimen, singletons included');
    const keyed = new Set(plan.groups.map((group) => group.key));
    assert.equal(keyed.size, 2);
  } finally {
    for (const root of roots) {
      root.traverse((object) => {
        object.geometry?.dispose?.();
        object.material?.dispose?.();
      });
    }
    geometry.dispose();
  }
});

test('per-admission batch twins ride the admission root then detach and dispose', () => {
  clearRigidOpaqueBatchWarmedKeys();
  const record = makeRoot(301);
  try {
    const holder = mountRigidOpaqueBatchSpecimenTwins(record.root, {});
    assert.ok(holder, 'a ship root with a batchable group mints twins');
    assert.equal(holder.name, 'SF_RigidOpaqueBatchTwinHolder');
    assert.equal(holder.parent, record.root, 'twins mount under the admission root for its compile');
    const twins = holder.children.filter((child) => child.isBatchedMesh === true);
    // Four plain leaves plus the motion-group leaf share one material and one geometry:
    // one (material, geometry, lane) group → one twin.
    assert.equal(twins.length, 1);
    assert.equal(twins[0].name, 'SF_RigidOpaqueBatchSpecimen_nocast|noreceive');
    assert.notEqual(twins[0].material, record.batched[0].material,
      'the twin carries the cloned batch material, not the authored source');
    assert.ok(record.batched.every((source) => source.layers.mask === 1),
      'twin minting never suppresses the direct source draws');

    // Once a family's twin has linked its program, a later same-family admission must not
    // pay the mint again — the session registry keeps the key warm across admissions.
    const repeat = mountRigidOpaqueBatchSpecimenTwins(record.root, {});
    assert.equal(repeat, null, 'a warmed family key never re-mints a twin on readmission');

    settleRigidOpaqueBatchSpecimenTwins(record.root, holder);
    assert.equal(holder.parent, null, 'the twin pin detaches on settle');
    assert.ok(twins[0]._colorsTexture == null, 'settle disposes the twin and its color texture');

    assert.equal(mountRigidOpaqueBatchSpecimenTwins(null, {}), null);
    const empty = new THREE.Group();
    assert.equal(mountRigidOpaqueBatchSpecimenTwins(empty, {}), null,
      'a root with no batchable leaves mounts no twins');
  } finally {
    record.root.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose?.();
    });
  }
});

test('the specimen mint carries the batch clone and color texture a live batch would', () => {
  const record = makeRoot(102);
  const plan = planRigidOpaqueBatchSpecimenGroups([record.root], {
    isTransformOnlySource: () => true,
  });
  try {
    assert.equal(plan.groups.length, 1);
    const specimen = mintRigidOpaqueBatchSpecimen(plan.groups[0]);
    assert.ok(specimen && specimen.isBatchedMesh === true);
    assert.ok(specimen._colorsTexture != null);
    assert.equal(specimen.visible, false);
    assert.equal(specimen.frustumCulled, false);
    assert.notEqual(specimen.material, record.batched[0].material);
    assert.equal(mintRigidOpaqueBatchSpecimen(null), null);
    assert.equal(mintRigidOpaqueBatchSpecimen({ surfaces: [] }), null);
    specimen.dispose?.();
    specimen.material?.dispose?.();
  } finally {
    record.root.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose?.();
    });
  }
});
