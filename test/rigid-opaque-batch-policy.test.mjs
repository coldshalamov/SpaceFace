import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  canBatchRenderPackageOwner,
  countBatchableOpaqueSurfaces,
  isRigidOpaqueBatchableSurface,
  planRigidOpaqueBatchGroups,
} from '../src/render/rigidOpaqueBatchPolicy.js';
import { installIllustratedSurface, ILLUSTRATED_SURFACE_KEY } from '../src/render/illustratedSurface.js';
import { installRoughnessBreakup } from '../src/render/authoredMaterialProfiles.js';

function mesh(overrides = {}, tags = {}) {
  const geometry = overrides.geometry || new THREE.BoxGeometry(1, 1, 1);
  const material = overrides.material || new THREE.MeshStandardMaterial({ color: 0x808080 });
  const object = new THREE.Mesh(geometry, material);
  object.userData.spacefaceTags = tags;
  Object.assign(object, overrides);
  return object;
}

test('ships stations and places may enter the rigid opaque package pool', () => {
  assert.equal(canBatchRenderPackageOwner('ship'), true);
  assert.equal(canBatchRenderPackageOwner('station'), true);
  assert.equal(canBatchRenderPackageOwner('place'), true);
  assert.equal(canBatchRenderPackageOwner('asteroid'), false);
  assert.equal(canBatchRenderPackageOwner('fx'), false);
});

test('rigid opaque hulls batch; canopies plumes and damage stay out', () => {
  const hull = mesh();
  assert.equal(isRigidOpaqueBatchableSurface(hull, {}), true);

  const canopy = mesh({
    material: new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.4, transmission: 0.8 }),
  }, { canopy: true });
  assert.equal(isRigidOpaqueBatchableSurface(canopy, { canopy: true }), false);

  const plume = mesh({
    material: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending }),
  }, { plume: true });
  assert.equal(isRigidOpaqueBatchableSurface(plume, { plume: true }), false);

  const damaged = mesh({}, { damageRole: 'scorch' });
  assert.equal(isRigidOpaqueBatchableSurface(damaged, { damageRole: 'scorch' }), false);
});

test('a mixed ship group reports only the opaque rigid subset', () => {
  const root = new THREE.Group();
  root.add(mesh());
  root.add(mesh({
    material: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
  }, { canopy: true }));
  const counts = countBatchableOpaqueSurfaces(root);
  assert.equal(counts.total, 2);
  assert.equal(counts.batchable, 1);
});

test('nested fan and turret descendants stay direct while static siblings remain eligible', () => {
  const root = new THREE.Group();

  const engine = new THREE.Group();
  const fan = new THREE.Group();
  const fanMergedChild = mesh();
  fanMergedChild.userData.staticMerge = true;
  const staticEngineSibling = mesh();
  engine.userData.fan = fan;
  engine.add(fan, staticEngineSibling);
  fan.add(fanMergedChild);

  const turret = new THREE.Group();
  const turretHead = new THREE.Group();
  const turretMergedChild = mesh();
  turretMergedChild.userData.staticMerge = true;
  turret.userData.isTurret = true;
  turret.userData.turretHead = turretHead;
  turretHead.userData.animated = true;
  turret.add(turretHead);
  turretHead.add(turretMergedChild);

  const staticHullA = mesh();
  const staticHullB = mesh();
  root.add(engine, turret, staticHullA, staticHullB);

  assert.equal(isRigidOpaqueBatchableSurface(fanMergedChild), false,
    'a merged child below the engine fan pivot must retain its animated parent');
  assert.equal(isRigidOpaqueBatchableSurface(turretMergedChild), false,
    'a merged child below the turret head must retain its animated parent');
  assert.equal(isRigidOpaqueBatchableSurface(staticEngineSibling), true,
    'an unrelated engine sibling must not inherit the fan pivot marker');

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.totalMeshes, 5);
  assert.equal(plan.eligibleMeshes, 3);
  assert.equal(plan.groups.length, 1);
  assert.deepEqual(plan.groups[0].surfaces, [staticEngineSibling, staticHullA, staticHullB]);
  assert.deepEqual(plan.directFallbackMeshes, [fanMergedChild, turretMergedChild]);
});

test('mirrored and singular world transforms stay direct for front-face correctness', () => {
  const root = new THREE.Group();
  const mirroredParent = new THREE.Group();
  mirroredParent.scale.x = -1;
  const mirrored = mesh();
  mirroredParent.add(mirrored);

  const singularParent = new THREE.Group();
  singularParent.scale.y = 0;
  const singular = mesh();
  singularParent.add(singular);

  const ordinaryA = mesh();
  const ordinaryB = mesh();
  root.add(mirroredParent, singularParent, ordinaryA, ordinaryB);
  root.updateMatrixWorld(true);

  assert.ok(mirrored.matrixWorld.determinant() < 0);
  assert.equal(singular.matrixWorld.determinant(), 0);
  assert.equal(isRigidOpaqueBatchableSurface(mirrored), false);
  assert.equal(isRigidOpaqueBatchableSurface(singular), false);
  assert.equal(isRigidOpaqueBatchableSurface(ordinaryA), true);

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.totalMeshes, 4);
  assert.equal(plan.eligibleMeshes, 2);
  assert.deepEqual(plan.groups[0].surfaces, [ordinaryA, ordinaryB]);
  assert.deepEqual(plan.directFallbackMeshes, [mirrored, singular]);
});

test('opt-in rigid batch plan groups same-program hulls and preserves direct fallbacks', () => {
  const root = new THREE.Group();
  const hullA = mesh({ material: new THREE.MeshStandardMaterial({ color: 0x26384c }) });
  const hullB = mesh({ material: new THREE.MeshStandardMaterial({ color: 0x26384c }) });
  const canopy = mesh({
    material: new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.4, transmission: 0.8 }),
  }, { canopy: true });
  const animated = mesh({}, { motionGroup: 'thruster-pivot' });
  root.add(hullA, hullB, canopy, animated);

  const plan = planRigidOpaqueBatchGroups(root, {
    // The real admission path must provide this predicate because a custom hook is per-object.
    isRenderHookSafe: (object) => object.onBeforeRender === THREE.Object3D.prototype.onBeforeRender
      && object.onAfterRender === THREE.Object3D.prototype.onAfterRender,
  });

  assert.equal(plan.totalMeshes, 4);
  assert.equal(plan.eligibleMeshes, 2);
  assert.equal(plan.groups.length, 1);
  assert.deepEqual(plan.groups[0].surfaces, [hullA, hullB]);
  assert.equal(plan.groups[0].lane, 'nocast');
  assert.equal(plan.potentialDrawReduction, 1);
  assert.deepEqual(plan.directFallbackMeshes, [canopy, animated]);
  assert.equal(hullA.visible, true, 'planning must not hide the authored source');
  assert.equal(hullB.visible, true, 'planning must not hide the authored source');
});

test('opt-in rigid batch plan keeps custom render hooks on direct fallback', () => {
  const root = new THREE.Group();
  const hooked = mesh();
  const ordinary = mesh({ material: hooked.material.clone() });
  hooked.onBeforeRender = () => {};
  root.add(hooked, ordinary);

  const plan = planRigidOpaqueBatchGroups(root, {
    isRenderHookSafe: (object) => object.onBeforeRender === THREE.Object3D.prototype.onBeforeRender
      && object.onAfterRender === THREE.Object3D.prototype.onAfterRender,
  });

  assert.equal(plan.eligibleMeshes, 1);
  assert.equal(plan.groups.length, 0);
  assert.deepEqual(plan.directFallbackMeshes, [hooked, ordinary]);
});

test('illustrated surface payloads stay exact while sanctioned shared hooks remain batchable', () => {
  const root = new THREE.Group();
  const makeIllustrated = (pigment) => {
    const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
    installIllustratedSurface(material);
    material.userData.spacefaceIllustratedPigment = pigment;
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  };
  const sameA = makeIllustrated({ color: '#356b87', strength: 0.86 });
  const sameB = makeIllustrated({ color: '#356b87', strength: 0.86 });
  const different = makeIllustrated({ color: '#c18a36', strength: 0.86 });
  root.add(sameA, sameB, different);

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(sameA.material.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY);
  assert.equal(plan.eligibleMeshes, 3);
  assert.equal(plan.groups.length, 1, 'same illustrated payloads can share one retained batch');
  assert.deepEqual(plan.groups[0].surfaces, [sameA, sameB]);
  assert.deepEqual(plan.directFallbackMeshes, [different],
    'a different pigment remains direct instead of compiling the first pigment into every instance');

  for (const mesh of [sameA, sameB, different]) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test('illustrated batches separate incompatible chained shader families', () => {
  const root = new THREE.Group();
  const make = (withBreakup) => {
    const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
    if (withBreakup) installRoughnessBreakup(material);
    installIllustratedSurface(material);
    material.userData.spacefaceIllustratedPigment = { color: '#356b87', strength: 0.86 };
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  };
  const plainA = make(false);
  const plainB = make(false);
  const breakupA = make(true);
  const breakupB = make(true);
  root.add(plainA, plainB, breakupA, breakupB);

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.eligibleMeshes, 4);
  assert.equal(plan.groups.length, 2,
    'the retained material must preserve the full canonical shader hook chain');
  assert.deepEqual(plan.groups.map((group) => group.surfaces), [[plainA, plainB], [breakupA, breakupB]]);

  for (const object of [plainA, plainB, breakupA, breakupB]) {
    object.geometry.dispose();
    object.material.dispose();
  }
});

test('illustrated rock and hull roles do not share one retained shader material', () => {
  const root = new THREE.Group();
  const makeRole = (role) => {
    const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
    installIllustratedSurface(material);
    material.userData.spacefaceIllustratedPigment = { color: '#356b87', strength: 0.86 };
    material.userData.spacefaceSharedMaterialRole = role;
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  };
  const hull = makeRole('hull');
  const rock = makeRole('rock');
  root.add(hull, rock);

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.eligibleMeshes, 2);
  assert.equal(plan.groups.length, 0,
    'the rock floor shader branch is material-wide and must not cross a retained batch');
  assert.deepEqual(plan.directFallbackMeshes, [hull, rock]);
  hull.geometry.dispose();
  hull.material.dispose();
  rock.geometry.dispose();
  rock.material.dispose();
});

test('material camera hooks stay on the direct path', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  material.onBeforeRender = () => {};
  const hooked = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const ordinary = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material.clone());
  root.add(hooked, ordinary);

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.eligibleMeshes, 1);
  assert.equal(plan.groups.length, 0, 'a single ordinary sibling cannot form a retained group');
  assert.deepEqual(plan.directFallbackMeshes, [hooked, ordinary]);
  hooked.geometry.dispose();
  hooked.material.dispose();
  ordinary.geometry.dispose();
  ordinary.material.dispose();
});

test('unknown material shader hooks stay direct until they publish a retained ABI', () => {
  const root = new THREE.Group();
  const hookedMaterial = new THREE.MeshStandardMaterial();
  hookedMaterial.onBeforeCompile = () => {};
  const hooked = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hookedMaterial);
  const ordinary = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  root.add(hooked, ordinary);

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.eligibleMeshes, 1);
  assert.equal(plan.groups.length, 0);
  assert.deepEqual(plan.directFallbackMeshes, [hooked, ordinary]);
  hooked.geometry.dispose();
  hooked.material.dispose();
  ordinary.geometry.dispose();
  ordinary.material.dispose();
});

test('material shader and uniform state differences stay on direct draws', () => {
  const root = new THREE.Group();
  const vertexColorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
  vertexColorMaterial.vertexColors = true;
  const emissiveMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
  emissiveMaterial.emissive.setHex(0x223344);
  emissiveMaterial.emissiveIntensity = 0.6;
  const ordinary = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x808080 }));
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), vertexColorMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), emissiveMaterial),
    ordinary,
  );

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.eligibleMeshes, 3);
  assert.equal(plan.groups.length, 0,
    'a retained material cannot preserve vertex-color defines or emissive uniforms from every source');
  assert.equal(plan.directFallbackMeshes.length, 3);
  for (const object of root.children) {
    object.geometry.dispose();
    object.material.dispose();
  }
});

test('non-vertex material albedos stay separate because batching color is not a fragment input', () => {
  const root = new THREE.Group();
  const red = 0x8f2f36;
  const blue = 0x2f628f;
  const meshes = [
    mesh({ material: new THREE.MeshStandardMaterial({ color: red }) }),
    mesh({ material: new THREE.MeshStandardMaterial({ color: red }) }),
    mesh({ material: new THREE.MeshStandardMaterial({ color: blue }) }),
    mesh({ material: new THREE.MeshStandardMaterial({ color: blue }) }),
  ];
  root.add(...meshes);

  const plan = planRigidOpaqueBatchGroups(root);
  assert.equal(plan.eligibleMeshes, 4);
  assert.equal(plan.groups.length, 2,
    'different material colors cannot share a batch when vertexColors is disabled');
  assert.deepEqual(plan.groups.map((group) => group.surfaces), [
    [meshes[0], meshes[1]],
    [meshes[2], meshes[3]],
  ]);
  assert.equal(plan.potentialDrawReduction, 2);

  for (const object of meshes) {
    object.geometry.dispose();
    object.material.dispose();
  }
});
