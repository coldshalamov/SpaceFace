import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  isRigidOpaqueAshlineCohortRoot,
  isRigidOpaqueDefaultCohortSource,
  RIGID_OPAQUE_ASHLINE_COHORT_MAX_ROOTS,
  render as renderSystem,
} from '../src/render/renderer.js';
import { RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES } from '../src/render/rigidOpaqueBatch.js';

const HULL = 'assets/ships/release/parts/wholeships/ashline_dart.glb';
const RETRO_NAMES = [
  'Retro_Shell_Port', 'Retro_Shell_Starboard',
  'Retro_Body_Port', 'Retro_Body_Starboard',
  'Retro_Trim_Port', 'Retro_Trim_Starboard',
];
const EXCLUDED_NAMES = ['Retro_Iris_Port', 'Retro_Throat_Port', 'LOD0_MOTION_HULL_CORE'];

function makeRoot(id, { generation = 4, shown = true, rootName = `ashline-${id}` } = {}) {
  const root = new THREE.Group();
  root.name = rootName;
  root.visible = shown;
  root.userData = {
    presentationEntityId: id,
    presentationEntityType: 'ship',
    presentationShipDefId: 'ship_wasp',
    presentationOccupantGeneration: generation,
    authoredAssetState: 'authored',
    authoredSlots: { hull: [HULL] },
  };
  const leaves = RETRO_NAMES.map((name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.5 }));
    mesh.name = name;
    root.add(mesh);
    return mesh;
  });
  for (const name of EXCLUDED_NAMES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = name;
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  return { root, leaves };
}

function makeOwner(records, {
  compile = () => ({ pipelines: {}, gpuResidency: {} }),
  shipAux = records.map(({ root }) => ({
    mesh: root, visible: root.visible !== false, viewCulled: root.visible === false,
  })),
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
      data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
    });
  }
  scene.updateMatrixWorld(true);
  const state = {
    mode: 'running', entities, render: { compileObjectPipelines: compile, admissionRunGeneration: 1 },
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

test('Ashline selector binds the six cold retro leaves to the actual live hostile root', () => {
  const record = makeRoot(41), fixture = makeOwner([record]);
  try {
    const { owner } = fixture;
    assert.equal(isRigidOpaqueAshlineCohortRoot(owner, record.root), true);
    assert.deepEqual(record.leaves.map((source) => isRigidOpaqueDefaultCohortSource(owner, source)),
      [true, true, true, true, true, true]);
    const excluded = record.root.children.filter((child) => EXCLUDED_NAMES.includes(child.name));
    assert.deepEqual(excluded.map((source) => isRigidOpaqueDefaultCohortSource(owner, source)),
      [false, false, false]);

    const replacements = [
      (candidateOwner) => { candidateOwner._meshes.set(41, new THREE.Group()); },
      (candidateOwner) => { candidateOwner.state.entities.get(41).alive = false; },
      (candidateOwner) => { candidateOwner.state.entities.get(41).data.lootTableId = 'lancer_sniper'; },
      (_candidateOwner, candidate) => { candidate.root.userData.presentationOccupantGeneration++; },
      (_candidateOwner, candidate) => { candidate.root.userData.authoredSlots.hull = ['assets/ships/release/parts/wholeships/wasp_production_v1.glb']; },
      (_candidateOwner, candidate) => { candidate.root.userData.authoredAssetState = 'procedural-fallback'; },
      (candidateOwner) => { candidateOwner.state.entities.get(41).data.authoredAssetId = 'special-body'; },
    ];
    for (const invalidate of replacements) {
      const clean = makeRoot(41), isolated = makeOwner([clean]);
      try {
        invalidate(isolated.owner, clean);
        assert.equal(isRigidOpaqueAshlineCohortRoot(isolated.owner, clean.root), false);
        assert.equal(isRigidOpaqueDefaultCohortSource(isolated.owner, clean.leaves[0]), false);
      } finally { isolated.dispose(); }
    }
  } finally { fixture.dispose(); }
});

test('visible hostile roots fill the sixteen-root cap before hidden map entries', async () => {
  assert.equal(RIGID_OPAQUE_ASHLINE_COHORT_MAX_ROOTS, 16);
  const hidden = makeRoot(1, { shown: false });
  const visible = Array.from({ length: 17 }, (_, index) => makeRoot(index + 2));
  const fixture = makeOwner([hidden, ...visible], { shipAux: [] });
  try {
    fixture.owner._entityFrame.shipAux = [];
    await fixture.owner._syncRigidOpaqueBatchProbe();
    assert.equal(fixture.owner._rigidOpaqueBatchAshlineLifetimes.size, 0,
      'an absent current presented list admits no new roots');
    assert.ok(visible[0].leaves.every((source) => source.layers.mask === 1));
    fixture.owner._entityFrame.shipAux = [hidden, ...visible].map(({ root }) => ({
      mesh: root, visible: root.visible !== false, viewCulled: root.visible === false,
    }));
    await fixture.owner._syncRigidOpaqueBatchProbe();
    const diagnostics = fixture.owner.getRigidOpaqueBatchDiagnosticsForBench();
    assert.equal(diagnostics.status, 'active');
    assert.equal(diagnostics.instances, 16 * RETRO_NAMES.length);
    assert.equal(fixture.owner._rigidOpaqueBatchAshlineLifetimes.size, 16);
    assert.ok(hidden.leaves.every((source) => source.layers.mask === 1),
      'hidden roots do not occupy slots or lose their direct draws');
    assert.ok(visible.slice(0, 16).every(({ leaves }) => leaves.every((source) => source.layers.mask === 0)));
    assert.ok(visible[16].leaves.every((source) => source.layers.mask === 1),
      'the seventeenth shown root stays on the direct path at the cap');
  } finally { fixture.dispose(); }
});

test('unchanged batch policy keeps animated, custom-hook, and non-retro leaves direct', async () => {
  const record = makeRoot(73);
  const { root, leaves } = record;
  const animated = leaves[2];
  animated.userData.spacefaceTags = { animated: true };
  const objectHook = leaves[4];
  objectHook.onBeforeRender = () => {};
  const shaderHook = leaves[5];
  shaderHook.material.onBeforeCompile = () => {};
  const iris = root.children.find((child) => child.name === 'Retro_Iris_Port');
  const fixture = makeOwner([record]);
  try {
    await fixture.owner._syncRigidOpaqueBatchProbe();
    const diagnostics = fixture.owner.getRigidOpaqueBatchDiagnosticsForBench();
    assert.equal(diagnostics.status, 'active');
    assert.equal(diagnostics.instances, 3);
    assert.equal(leaves[0].layers.mask, 0);
    assert.equal(leaves[1].layers.mask, 0);
    assert.equal(leaves[3].layers.mask, 0);
    assert.equal(animated.layers.mask, 1, 'an animated body is not admitted despite its name');
    assert.equal(objectHook.layers.mask, 1, 'a source render hook stays on its direct path');
    assert.equal(shaderHook.layers.mask, 1, 'an arbitrary shader hook stays on its direct path');
    assert.equal(iris.layers.mask, 1, 'the live iris remains outside the six-leaf cohort');
  } finally { fixture.dispose(); }
});

test('retained preparation and same-root rebinding preserve life identity and direct fallback', async () => {
  let release;
  const pendingPreparation = new Promise((resolve) => { release = resolve; });
  const record = makeRoot(89), fixture = makeOwner([record], {
    compile: async () => { await pendingPreparation; return { pipelines: {}, gpuResidency: {} }; },
  });
  try {
    const pending = fixture.owner._syncRigidOpaqueBatchProbe();
    assert.ok(record.leaves.every((source) => source.layers.mask === 1),
      'sources remain direct until preparation has succeeded');
    fixture.state.entities.get(89).alive = false;
    release();
    await pending;
    assert.ok(record.leaves.every((source) => source.layers.mask === 1),
      'death during preparation cannot hide the old life');
    assert.equal(fixture.owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'idle');

    const entity = fixture.state.entities.get(89);
    entity.alive = true;
    entity.occupantGeneration++;
    await fixture.owner._syncRigidOpaqueBatchProbe(); // old root generation is retired, direct draw restored
    assert.ok(record.leaves.every((source) => source.layers.mask === 1));
    record.root.userData.presentationOccupantGeneration = entity.occupantGeneration;
    await fixture.owner._syncRigidOpaqueBatchProbe(); // the same root is now admitted as the new life
    assert.equal(fixture.owner.getRigidOpaqueBatchDiagnosticsForBench().status, 'active');
    assert.ok(record.leaves.every((source) => source.layers.mask === 0));

    const replacement = makeRoot(89, { generation: entity.occupantGeneration + 1, rootName: 'replacement-root' });
    fixture.scene.add(replacement.root);
    fixture.state.entities.set(89, { ...entity, occupantGeneration: replacement.root.userData.presentationOccupantGeneration });
    fixture.owner._meshes.set(89, replacement.root);
    fixture.owner._entityFrame.shipAux = [{ mesh: replacement.root, visible: true, viewCulled: false }];
    await fixture.owner._syncRigidOpaqueBatchProbe();
    assert.ok(record.leaves.every((source) => source.layers.mask === 1), 'the replaced root restores direct draws');
    for (let i = 0; i < RETAINED_BATCH_MEMBERSHIP_QUIET_FRAMES; i++) {
      await fixture.owner._syncRigidOpaqueBatchProbe();
    }
    assert.ok(replacement.leaves.every((source) => source.layers.mask === 0), 'the new root receives its own life');
    fixture.records.push(replacement);
  } finally { fixture.dispose(); }
});
