import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createOpaqueStateSort, createTransparentStateSort } from '../src/render/opaqueStateSort.js';
import {
  createOpeningStandInWarmSubject,
  installVisualOverrides,
  syncStandInMergeSwitch,
} from '../src/render/visualOverrides.js';
import {
  poolStandInLeaves,
  unpoolStandInLeaves,
  poolStaticPropLeaves,
  unpoolStaticPropLeaves,
  syncHostileRetroIdleHotPool,
  syncAuthoredInstancePools,
} from '../src/render/partsLibrary.js';
import { createFoundrySet } from '../src/render/arenaSets/foundrySet.js';

function withRfx(overrides, fn) {
  const prev = globalThis.__sfRfx;
  globalThis.__sfRfx = { ...(prev || {}), ...overrides };
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.__sfRfx;
    else globalThis.__sfRfx = prev;
  }
}

function rendererWith(programs) {
  return { properties: { get: (m) => (programs.has(m) ? { currentProgram: { id: programs.get(m) } } : undefined) } };
}

test('drawBatchOpt toggles opaque and additive-transparent state sorting live', () => {
  let id = 10;
  const opMat = () => ({ id: id++, colorWrite: true, depthTest: true, depthWrite: true, stencilWrite: false, depthFunc: THREE.LessEqualDepth });
  const a = opMat(); const b = opMat();
  const opSort = createOpaqueStateSort(rendererWith(new Map([[a, 9], [b, 2]])));

  withRfx({ sort: true, drawBatchOpt: false }, () => {
    const list = [{ name: 'a', material: a, z: 5, renderOrder: 0 }, { name: 'b', material: b, z: 1, renderOrder: 0 }];
    opSort(list);
    assert.deepEqual(list.map((i) => i.name), ['a', 'b'], 'drawBatchOpt=false preserves raw traversal order');
  });
  withRfx({ sort: true, drawBatchOpt: true }, () => {
    const list = [{ name: 'a', material: a, z: 5, renderOrder: 0 }, { name: 'b', material: b, z: 1, renderOrder: 0 }];
    opSort(list);
    assert.deepEqual(list.map((i) => i.name), ['b', 'a'], 'drawBatchOpt=true groups opaque draws by program');
  });

  const alphaFar = { id: id++, blending: THREE.NormalBlending, depthWrite: false };
  const alphaNear = { id: id++, blending: THREE.NormalBlending, depthWrite: false };
  const addP1a = { id: id++, blending: THREE.AdditiveBlending, depthWrite: false };
  const addP2 = { id: id++, blending: THREE.AdditiveBlending, depthWrite: false };
  const addP1b = { id: id++, blending: THREE.AdditiveBlending, depthWrite: false };
  const trSort = createTransparentStateSort(rendererWith(new Map([
    [alphaFar, 10], [alphaNear, 11], [addP1a, 5], [addP2, 8], [addP1b, 5],
  ])));
  const mk = (name, material, z) => ({ id: id++, name, material, z, groupOrder: 0, renderOrder: 0 });

  withRfx({ sort: true, drawBatchOpt: true }, () => {
    const list = [
      mk('addP2-far', addP2, 90),
      mk('alpha-near', alphaNear, 10),
      mk('addP1b', addP1b, 50),
      mk('alpha-far', alphaFar, 80),
      mk('addP1a', addP1a, 20),
    ];
    list.sort(trSort);
    assert.deepEqual(list.map((i) => i.name), ['alpha-far', 'alpha-near', 'addP1a', 'addP1b', 'addP2-far'],
      'alpha stays strictly back-to-front while commutative additive draws coalesce by program');
  });

  withRfx({ sort: true, drawBatchOpt: false }, () => {
    const list = [
      mk('addP2-far', addP2, 90),
      mk('alpha-near', alphaNear, 10),
      mk('addP1b', addP1b, 50),
      mk('alpha-far', alphaFar, 80),
      mk('addP1a', addP1a, 20),
    ];
    list.sort(trSort);
    assert.deepEqual(list.map((i) => i.name), ['addP2-far', 'alpha-far', 'addP1b', 'addP1a', 'alpha-near'],
      'drawBatchOpt=false restores plain back-to-front order');
  });
});

test('stand-in merge recomputes normals when CPU normals were detached and toggles live for A/B', () => {
  const geo1 = new THREE.BoxGeometry(2, 1, 1);
  const geo2 = new THREE.BoxGeometry(1, 1, 1);
  // Simulate packageCpuDetach: position and index stay resident; normal.array is emptied.
  geo1.getAttribute('normal').array = new Float32Array(0);
  geo2.getAttribute('normal').array = new Float32Array(0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.9 });
  const record = {
    url: 'assets/ships/release/parts/wholeships/detached_wasp.glb',
    assetId: 'SF_DETACHED_WASP',
    bounds: { min: [-1, -0.5, -0.5], max: [1, 0.5, 0.5], size: [2, 1, 1], center: [0, 0, 0] },
    residency: { state: 'resident' },
    primitives: [
      { key: 'a', name: 'LOD0_Hull', geometry: geo1, material: mat, matrix: new THREE.Matrix4(), tags: Object.freeze({ lod: 'lod0' }) },
      { key: 'b', name: 'LOD0_Wing', geometry: geo2, material: mat, matrix: new THREE.Matrix4().makeScale(-1, 1, 1).setPosition(0, 0, 1.5), tags: Object.freeze({ lod: 'lod0' }) },
    ],
  };

  const factory = { build() { return new THREE.Group(); } };
  installVisualOverrides(factory, {
    releaseMode: true,
    directAuthoredMount: true,
    admissionStandInRecord: () => record,
  });

  const boundary = factory.build({ id: 901, type: 'ship', alive: true, radius: 10, data: { defId: 'ship_wasp' } });
  const substrate = boundary.children.find((c) => c.userData?.authoredAdmissionSubstrate);
  const standIn = substrate.userData.resolvingMarker;
  assert.ok(standIn.userData.standInMergedGroup, 'merged even when source normals were CPU-detached');
  const mergedMeshes = standIn.userData.standInMergedGroup.children.filter((c) => c.isMesh);
  assert.equal(mergedMeshes.length, 1, 'same-material primitives merged into one draw');
  const normalAttr = mergedMeshes[0].geometry.getAttribute('normal');
  assert.ok(normalAttr && normalAttr.count === mergedMeshes[0].geometry.getAttribute('position').count,
    'recomputed vertex normals match merged vertex count');
  // Every recomputed normal is finite and unit-length.
  const v = new THREE.Vector3();
  for (let i = 0; i < normalAttr.count; i++) {
    v.fromBufferAttribute(normalAttr, i);
    assert.ok(Math.abs(v.length() - 1) < 1e-3, `normal ${i} is unit-length`);
  }

  // Even when built before __sfRfx existed, flipping drawBatchOpt OFF lazily materializes direct leaves.
  withRfx({ drawBatchOpt: false }, () => {
    assert.equal(syncStandInMergeSwitch(standIn), false);
    assert.ok(standIn.userData.standInSets, 'lazy direct leaf set created on OFF toggle');
    assert.equal(standIn.userData.standInSets.merged.visible, false);
    assert.equal(standIn.userData.standInSets.direct.visible, true);
    assert.equal(standIn.userData.standInSets.direct.children.length, 2);
  });
  withRfx({ drawBatchOpt: true }, () => {
    assert.equal(syncStandInMergeSwitch(standIn), true);
    assert.equal(standIn.userData.standInSets.merged.visible, true);
    assert.equal(standIn.userData.standInSets.direct.visible, false);
  });
});

test('opening stand-in warm subject warms both direct and instanced stand-in shader variants', () => {
  const warm = createOpeningStandInWarmSubject();
  const hasDirect = warm.children.some((c) => c.isMesh && !c.isInstancedMesh && c.name === 'StandIn_OpeningWarm');
  const hasInstanced = warm.children.some((c) => c.isInstancedMesh && c.name === 'StandIn_OpeningWarmInstanced');
  assert.equal(hasDirect, true);
  assert.equal(hasInstanced, true);
  warm.userData.disposeOpeningWarm();
});

test('poolStandInLeaves and poolStaticPropLeaves instance repeated owners and unpool cleanly', () => {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x667788 });

  // Two ship stand-in boundaries sharing the same merged geometry + material.
  const makeStandInBoundary = (x) => {
    const boundary = new THREE.Group();
    boundary.position.set(x, 0, 0);
    const substrate = new THREE.Group();
    const marker = new THREE.Group();
    const mergedGroup = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mat);
    mergedGroup.add(mesh);
    marker.add(mergedGroup);
    marker.userData.standInMergedGroup = mergedGroup;
    marker.userData.standInAssetId = 'SF_WASP';
    substrate.add(marker);
    boundary.add(substrate);
    scene.add(boundary);
    return { boundary, marker, mesh };
  };
  const s1 = makeStandInBoundary(0);
  const s2 = makeStandInBoundary(20);
  assert.equal(poolStandInLeaves(scene, s1.boundary, s1.marker), 1);
  assert.equal(poolStandInLeaves(scene, s2.boundary, s2.marker), 1);
  assert.equal(s1.marker.userData.standInPooled, true);
  assert.equal(s2.marker.userData.standInPooled, true);
  assert.equal(unpoolStandInLeaves(scene, s1.boundary, s1.marker), true);
  assert.equal(unpoolStandInLeaves(scene, s2.boundary, s2.marker), true);
  assert.equal(s1.mesh.isMesh, true, 'unpool restores direct stand-in mesh');
  assert.equal(s2.mesh.isMesh, true, 'unpool restores direct stand-in mesh');

  // Two static PlaceProp boundaries sharing the same geometry + material.
  const propGeo = new THREE.BoxGeometry(3, 3, 3);
  const propMat = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const makeProp = (x) => {
    const boundary = new THREE.Group();
    boundary.position.set(x, 0, 0);
    boundary.userData.authoredAssetState = 'authored';
    const propRoot = new THREE.Group();
    propRoot.userData.staticPropPoolEligible = true;
    propRoot.userData.placeId = 'place_rock_reef_metal_monolith';
    const mesh = new THREE.Mesh(propGeo, propMat);
    propRoot.add(mesh);
    boundary.add(propRoot);
    scene.add(boundary);
    return { boundary, mesh };
  };
  const p1 = makeProp(50);
  const p2 = makeProp(90);
  assert.equal(poolStaticPropLeaves(scene, p1.boundary), 1);
  assert.equal(poolStaticPropLeaves(scene, p2.boundary), 1);
  assert.equal(p1.boundary.userData.staticPropPooled, true);
  assert.equal(p2.boundary.userData.staticPropPooled, true);
  assert.equal(unpoolStaticPropLeaves(scene, p1.boundary), true);
  assert.equal(unpoolStaticPropLeaves(scene, p2.boundary), true);
  assert.equal(p1.mesh.isMesh, true, 'unpool restores direct static prop mesh');
  assert.equal(p2.mesh.isMesh, true, 'unpool restores direct static prop mesh');

  // BroodRemain debris roots share geometry + material across repeated arena debris.
  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const makeDebris = (x) => {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    g.userData.broodRemainKind = 'husk_shards';
    const m = new THREE.Mesh(debrisGeo, debrisMat);
    g.add(m);
    scene.add(g);
    return { g, m };
  };
  const d1 = makeDebris(10);
  const d2 = makeDebris(20);
  assert.equal(poolStaticPropLeaves(scene, d1.g), 1);
  assert.equal(poolStaticPropLeaves(scene, d2.g), 1);
  assert.equal(d1.g.userData.staticPropPooled, true);
  assert.equal(unpoolStaticPropLeaves(scene, d1.g), true);
  assert.equal(unpoolStaticPropLeaves(scene, d2.g), true);
  assert.equal(d1.m.isMesh, true, 'unpool restores direct brood-remain debris mesh');

  // Hostile retro idle throat/iris toggle swaps between shared idle pooled material and private material.
  const retroGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const idleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const makeHostile = (x) => {
    const ship = new THREE.Group();
    ship.position.set(x, 0, 0);
    const privMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const throat = new THREE.Mesh(retroGeo, privMat);
    throat.name = 'Retro_Throat_Port';
    ship.add(throat);
    ship.userData.retroIdleHotItems = [{ object: throat, idleMat, privateMat: privMat }];
    ship.userData.retroIdleHotPooled = false;
    scene.add(ship);
    return { ship, throat, privMat };
  };
  const h1 = makeHostile(30);
  const h2 = makeHostile(40);
  assert.equal(syncHostileRetroIdleHotPool(scene, h1.ship, true), true);
  assert.equal(syncHostileRetroIdleHotPool(scene, h2.ship, true), true);
  assert.equal(h1.throat.material, idleMat);
  assert.equal(h2.throat.material, idleMat);
  assert.equal(syncHostileRetroIdleHotPool(scene, h1.ship, false), true);
  assert.equal(syncHostileRetroIdleHotPool(scene, h2.ship, false), true);
  assert.equal(h1.throat.material, h1.privMat);
  assert.equal(h1.throat.isMesh, true);
});

test('syncAuthoredInstancePools bypasses drawBatchOpt chunks cleanly without retiring them', () => {
  const prevWin = globalThis.window;
  globalThis.window = { SF: { state: { render: { liveSectorGpuAdmission: true } } } };
  try {
    const scene = new THREE.Scene();
    const propGeo = new THREE.BoxGeometry(2, 2, 2);
    const propMat = new THREE.MeshStandardMaterial({ color: 0x334455 });
    const makeDebris = (x) => {
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      g.userData.broodRemainKind = 'husk_shards';
      const m = new THREE.Mesh(propGeo, propMat);
      g.add(m);
      scene.add(g);
      return { g, m };
    };
    const a = makeDebris(0);
    const b = makeDebris(15);
    withRfx({ drawBatchOpt: true }, () => {
      poolStaticPropLeaves(scene, a.g);
      poolStaticPropLeaves(scene, b.g);
      syncAuthoredInstancePools(scene, {});
    });
    const chunkMesh = scene.children.find((c) => c.isInstancedMesh && c.name.includes('PlaceProp_BroodRemain_husk_shards'));
    assert.ok(chunkMesh, 'instanced chunk created for repeated debris');
    assert.equal(chunkMesh.visible, true);
    assert.equal(a.m.isMesh, false, 'pooled proxy suppressed while drawBatchOpt is ON');

    withRfx({ drawBatchOpt: false }, () => {
      syncAuthoredInstancePools(scene, {});
      assert.equal(chunkMesh.visible, false, 'chunk hidden without retiring while drawBatchOpt is OFF');
      assert.equal(a.m.isMesh, true, 'direct mesh restored while drawBatchOpt is OFF');
      assert.equal(b.m.isMesh, true);
    });

    withRfx({ drawBatchOpt: true }, () => {
      syncAuthoredInstancePools(scene, {});
      assert.equal(chunkMesh.parent, scene, 'same chunk stayed resident with zero re-admission');
      assert.equal(chunkMesh.visible, true, 'chunk immediately visible again on ON toggle');
      assert.equal(a.m.isMesh, false);
      assert.equal(b.m.isMesh, false);
    });
  } finally {
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
  }
});

test('Foundry deck shares one Lambert program when shadows are off on integrated GPUs', () => {
  const scene = new THREE.Scene();
  const set = createFoundrySet(scene, { gpu: { tier: 'integrated' }, shadows: false });
  const plating = set.root.getObjectByName('Foundry steel plating');
  const trim = set.root.getObjectByName('Foundry deck trim and rollers');
  const foundation = set.root.getObjectByName('Foundry deck foundation');
  assert.ok(plating && trim && foundation);
  assert.equal(plating.material, trim.material, 'floor plating and steel trim share one Lambert material when shadows are off');
  assert.equal(plating.material.isMeshLambertMaterial, true);
  assert.equal(typeof foundation.material.customProgramCacheKey, 'function');
  assert.equal(
    foundation.material.customProgramCacheKey(),
    trim.material.customProgramCacheKey(),
    'grout shares the plain Lambert program key with steel/floor when shadows are off',
  );
  set.dispose();
});
