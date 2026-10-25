import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  installVisualOverrides,
  resolvingMarkerFallbackCount,
  upgradeAdmissionStandIn,
} from '../src/render/visualOverrides.js';
import { AUTHORED_ADMISSION_RETRY_MAX, disposeDetachedObject } from '../src/render/partsLibrary.js';
import { consumeTerminalProceduralFallback, syncResolvingMarker } from '../src/render/renderer.js';

const ENTITY = {
  id: 501,
  type: 'ship',
  isPlayer: true,
  alive: true,
  radius: 10,
  data: { defId: 'ship_kestrel' },
};

const REQUIRED_ENTITY = {
  id: 601,
  type: 'ship',
  isPlayer: false,
  alive: true,
  radius: 10,
  data: { defId: 'ship_wasp' },
};

function terminalAdmission(boundary) {
  boundary.userData.authoredAssetState = 'unavailable';
  boundary.userData.authoredAdmissionRetryCount = AUTHORED_ADMISSION_RETRY_MAX;
}

function stubRecord() {
  const hullGeo = new THREE.BoxGeometry(2, 1, 1);
  const glowGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.9 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x202830, emissive: 0x22aacc });
  const m = new THREE.Matrix4();
  return {
    url: 'assets/ships/release/parts/wholeships/kestrel_lod2.glb',
    assetId: 'SF_TEST_LOD2',
    bounds: { min: [-1, -0.5, -0.5], max: [1, 0.5, 0.5], size: [2, 1, 1], center: [0, 0, 0] },
    residency: { state: 'resident' },
    primitives: [
      { key: 'a', name: 'LOD2_Hull', geometry: hullGeo, material: hullMat, matrix: m.clone(), tags: Object.freeze({ lod: 'lod2' }) },
      { key: 'b', name: 'LOD2_Beacon', geometry: glowGeo, material: glowMat, matrix: m.clone().setPosition(0, 0.4, 0), tags: Object.freeze({ lod: 'lod2' }) },
    ],
  };
}

function buildFactory(resolver) {
  const factory = { procedural: 0, build() { this.procedural++; return new THREE.Group(); } };
  installVisualOverrides(factory, {
    releaseMode: true,
    directAuthoredMount: true,
    admissionStandInRecord: resolver,
  });
  return factory;
}

function substrateOf(boundary) {
  return boundary.children.find((child) => child.userData && child.userData.authoredAdmissionSubstrate === true);
}

test('a resident record substitutes the ship\'s own lod2 silhouette for the octahedron', () => {
  const record = stubRecord();
  const factory = buildFactory(() => record);
  const boundary = factory.build({ ...ENTITY });
  const substrate = substrateOf(boundary);
  assert.ok(substrate, 'boundary still wraps the admission substrate');

  const standIn = substrate.userData.resolvingMarker;
  assert.equal(standIn.name, 'AuthoredResolvingStandIn');

  const meshes = [];
  standIn.traverse((object) => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 2);
  assert.equal(meshes[0].geometry, record.primitives[0].geometry,
    'stand-in shares record geometry — no buffer clone');
  for (const mesh of meshes) {
    assert.equal(mesh.material.isMeshStandardMaterial, true, 'plain warm Standard family');
    assert.equal(mesh.material.transparent, false, 'opaque — no blending variant');
    assert.equal(mesh.material.map, null, 'no maps — same program key as the marker family');
    assert.equal(mesh.material.vertexColors, false);
    assert.equal(mesh.userData.authoredResolvingMarker, true);
    assert.equal(mesh.userData.spacefaceSharedAsset, true);
    assert.equal(mesh.material.userData.spacefaceSharedAsset, true);
  }
  // The glow-finished primitive keys its stand-in material on its emissive colour.
  const glowMesh = meshes[1];
  assert.equal(glowMesh.material.emissive.getHex(), 0x22aacc);

  // Exact whole-ship normalisation: hull length 1.72 x entity scale (radius), identical to the
  // composed body's targetLength / sourceLength * hull radius scale.
  assert.ok(Math.abs(standIn.scale.x - (1.72 * ENTITY.radius) / record.bounds.size[0]) < 1e-9);

  // Same paint key must hand the same cached material to the next substrate.
  const boundary2 = factory.build({ ...ENTITY, id: 502 });
  const meshes2 = [];
  substrateOf(boundary2).userData.resolvingMarker
    .traverse((object) => { if (object.isMesh) meshes2.push(object); });
  assert.equal(meshes2[0].material, meshes[0].material, 'stand-in materials are cached per colour');
});

test('no resident record keeps the shared octahedron and counts the fallback', () => {
  const before = resolvingMarkerFallbackCount();
  const factory = buildFactory(() => null);
  const boundary = factory.build({ ...ENTITY, id: 503 });
  const marker = substrateOf(boundary).userData.resolvingMarker;
  assert.equal(marker.name, 'AuthoredResolvingMarker');
  assert.equal(marker.geometry.type, 'OctahedronGeometry');
  assert.equal(resolvingMarkerFallbackCount(), before + 1);
});

test('disposing the substrate leaves record geometry and cached materials intact', () => {
  const record = stubRecord();
  const factory = buildFactory(() => record);
  const boundary = factory.build({ ...ENTITY, id: 504 });
  const substrate = substrateOf(boundary);
  const standIn = substrate.userData.resolvingMarker;
  const meshes = [];
  standIn.traverse((object) => { if (object.isMesh) meshes.push(object); });

  let geometryDisposed = 0;
  let materialDisposed = 0;
  for (const mesh of meshes) {
    mesh.geometry.addEventListener('dispose', () => { geometryDisposed++; });
    mesh.material.addEventListener('dispose', () => { materialDisposed++; });
  }

  // The authored-commit path removes the substrate root and runs exactly this disposer.
  boundary.remove(substrate);
  disposeDetachedObject(substrate);

  assert.equal(geometryDisposed, 0, 'shared record geometry is never disposed by teardown');
  assert.equal(materialDisposed, 0, 'cached stand-in materials are never disposed by teardown');
});

test('a substrate built before the record was resident upgrades while still pending', () => {
  const record = stubRecord();
  // First lookup misses (library not yet resolved), then the record lands — the cold-boot case.
  let lookups = 0;
  const factory = buildFactory(() => (++lookups > 1 ? record : null));
  const boundary = factory.build({ ...ENTITY, id: 506 });
  const substrate = substrateOf(boundary);
  const before = resolvingMarkerFallbackCount();
  assert.equal(substrate.userData.resolvingMarker.name, 'AuthoredResolvingMarker');
  assert.equal(boundary.userData.admissionStandInPending, true);

  assert.equal(upgradeAdmissionStandIn(boundary), true, 'the pending retry swaps the marker');
  const standIn = boundary.userData.resolvingMarker;
  assert.equal(standIn.name, 'AuthoredResolvingStandIn');
  assert.equal(standIn.parent, substrate);
  assert.equal(boundary.userData.admissionStandInPending, false);
  const meshes = [];
  standIn.traverse((object) => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes[0].geometry, record.primitives[0].geometry);
  assert.equal(resolvingMarkerFallbackCount(), before - 1,
    'a landed stand-in releases the outstanding octahedron count');
});

test('the stand-in rides the existing pending-visibility lifecycle', () => {
  const record = stubRecord();
  const factory = buildFactory(() => record);
  const boundary = factory.build({ ...ENTITY, id: 505 });
  const substrate = substrateOf(boundary);
  assert.equal(substrate.userData.authoredResolvingMarker, true);
  const standIn = substrate.userData.resolvingMarker;
  assert.equal(standIn.visible, true,
    'the wrap step unhides a substrate carrying a resolving marker');
  // Commit detaches the substrate wholesale — the stand-in leaves with it.
  boundary.remove(substrate);
  assert.equal(substrate.parent, null);
});

test('release through the copied boundary userData counts the octahedron exactly once', async () => {
  const { releaseAdmissionStandInFallback } = await import('../src/render/visualOverrides.js');
  const factory = buildFactory(() => null);
  const boundary = factory.build({ ...ENTITY, id: 507 });
  const substrate = substrateOf(boundary);
  const before = resolvingMarkerFallbackCount();

  // wrapShipWithAuthoredParts Object.assign()s the substrate userData onto the boundary, so both
  // nodes pass the pending gate — the settle must still decrement the gauge exactly once.
  assert.equal(boundary.userData.admissionStandInPending, true);
  assert.equal(substrate.userData.admissionStandInPending, true);

  releaseAdmissionStandInFallback(substrate);
  releaseAdmissionStandInFallback(boundary);
  substrate.userData.admissionStandInRelease && substrate.userData.admissionStandInRelease();
  boundary.userData.admissionStandInRelease && boundary.userData.admissionStandInRelease();
  assert.equal(resolvingMarkerFallbackCount(), before - 1,
    'every settle path combined decrements the gauge once per octahedron');
});

test('a mission-critical required hull consumes its mission-only procedural body at terminal', () => {
  const factory = buildFactory(() => null); // no resident record — the abstract octahedron
  const entity = { ...REQUIRED_ENTITY, data: { defId: 'ship_wasp', missionTag: 'wanted_warrant' } };
  const boundary = factory.build(entity);
  const substrate = substrateOf(boundary);
  assert.equal(typeof substrate.userData.admissionProceduralFallback, 'function',
    'a required hull arms a procedural thunk');
  assert.equal(substrate.userData.admissionProceduralFallbackMissionOnly, true,
    'the thunk is flagged mission-only');
  assert.equal(substrate.userData.resolvingMarker.geometry.type, 'OctahedronGeometry');

  terminalAdmission(boundary);
  const proceduralBefore = factory.procedural;
  syncResolvingMarker(boundary, { missions: { active: [] }, render: { scene: {} } });

  assert.equal(substrate.userData.admissionProceduralFallback, undefined, 'the thunk is consumed');
  assert.equal(factory.procedural, proceduralBefore + 1, 'the procedural body was built once');
  assert.equal(substrate.userData.authoredReadableFallbackRetained, true);
  assert.equal(entity.presentationFallbackVisible, true,
    'the terminal sync republished the flag from the drawn procedural body');
  assert.equal(substrate.userData.resolvingMarker.visible, false,
    'the octahedron yields to the procedural hull');
});

test('an untagged required hull keeps the mission-only thunk armed at terminal', () => {
  const factory = buildFactory(() => null);
  const entity = { ...REQUIRED_ENTITY, data: { defId: 'ship_wasp' } };
  const boundary = factory.build(entity);
  const substrate = substrateOf(boundary);

  terminalAdmission(boundary);
  const proceduralBefore = factory.procedural;
  const state = { missions: { active: [] }, render: { scene: {} } };
  syncResolvingMarker(boundary, state);

  assert.equal(factory.procedural, proceduralBefore,
    'a plain hostile on a required hull gets no procedural body');
  assert.equal(typeof substrate.userData.admissionProceduralFallback, 'function',
    'the thunk stays armed — mission identity may be stamped later');
  assert.equal(entity.presentationFallbackVisible, false,
    'only the octahedron drew — still empty air for the lock gate');

  // The mission stamp can arrive after the terminal verdict; the retained thunk still answers it.
  entity.data.missionTag = 'wanted_warrant';
  syncResolvingMarker(boundary, state);
  assert.equal(factory.procedural, proceduralBefore + 1,
    'a later mission stamp still unlocks the procedural body');
  assert.equal(entity.presentationFallbackVisible, true);
});

test('mission membership in an active target list consumes the mission-only thunk', () => {
  const factory = buildFactory(() => null);
  const entity = { ...REQUIRED_ENTITY, id: 603, data: { defId: 'ship_wasp' } };
  const boundary = factory.build(entity);
  const substrate = substrateOf(boundary);

  terminalAdmission(boundary);
  const proceduralBefore = factory.procedural;
  syncResolvingMarker(boundary, {
    missions: { active: [{ id: 'm-hunt', targetEntityIds: [603] }] },
    render: { scene: {} },
  });

  assert.equal(factory.procedural, proceduralBefore + 1);
  assert.equal(entity.presentationFallbackVisible, true);
});

test('a throwing terminal fallback thunk stays armed behind a bounded backoff', () => {
  let calls = 0;
  const parentData = {
    admissionProceduralFallback: () => { calls += 1; throw new Error('decode broke'); },
    admissionProceduralFallbackMissionOnly: true,
  };
  // First failure: the thunk survives, the failure count and backoff are stamped.
  assert.equal(consumeTerminalProceduralFallback(parentData, 1000), null);
  assert.equal(typeof parentData.admissionProceduralFallback, 'function',
    'a throwing build does not lose the thunk — the softlock hole');
  assert.equal(parentData.admissionProceduralFallbackFailures, 1);
  assert.equal(parentData.admissionProceduralFallbackRetryAt, 3000);
  // Inside the backoff window the thunk is not re-invoked.
  assert.equal(consumeTerminalProceduralFallback(parentData, 2000), null);
  assert.equal(calls, 1, 'the retry waits out its backoff');
  assert.equal(parentData.admissionProceduralFallbackFailures, 1);
  // Past the window it retries; the third failure consumes the keys (bounded).
  assert.equal(consumeTerminalProceduralFallback(parentData, 3000), null);
  assert.equal(parentData.admissionProceduralFallbackFailures, 2);
  assert.equal(consumeTerminalProceduralFallback(parentData, 6000), null);
  assert.equal(calls, 3);
  assert.equal(parentData.admissionProceduralFallback, undefined,
    'a permanently broken build still settles terminal');
  assert.equal(parentData.admissionProceduralFallbackMissionOnly, undefined);
});

test('a successful terminal fallback consumes the thunk once it returns an Object3D', () => {
  const body = new THREE.Group();
  const parentData = { admissionProceduralFallback: () => body };
  assert.equal(consumeTerminalProceduralFallback(parentData, 0), body);
  assert.equal(parentData.admissionProceduralFallback, undefined, 'the thunk is consumed');
  // A non-Object3D result also counts as a failure, not a consumption.
  const bad = { admissionProceduralFallback: () => null };
  assert.equal(consumeTerminalProceduralFallback(bad, 0), null);
  assert.equal(typeof bad.admissionProceduralFallback, 'function');
  assert.equal(bad.admissionProceduralFallbackFailures, 1);
});

test('a throwing procedural build keeps the terminal marker sync armed', () => {
  let broken = true;
  const factory = {
    procedural: 0,
    build() { this.procedural += 1; if (broken) throw new Error('decode broke'); return new THREE.Group(); },
  };
  installVisualOverrides(factory, {
    releaseMode: true,
    directAuthoredMount: true,
    admissionStandInRecord: () => null,
  });
  const entity = { ...REQUIRED_ENTITY, id: 605, data: { defId: 'ship_wasp', missionTag: 'wanted_warrant' } };
  const boundary = factory.build(entity);
  const substrate = substrateOf(boundary);

  terminalAdmission(boundary);
  const proceduralBefore = factory.procedural;
  const state = { missions: { active: [] }, render: { scene: {} } };
  syncResolvingMarker(boundary, state);

  assert.equal(factory.procedural, proceduralBefore + 1, 'the thunk fired');
  assert.equal(typeof substrate.userData.admissionProceduralFallback, 'function',
    'the throwing thunk stays armed — the entity is not stranded un-lockable');
  assert.equal(substrate.userData.admissionProceduralFallbackFailures, 1);
  assert.ok(Number.isFinite(substrate.userData.admissionProceduralFallbackRetryAt));
  assert.equal(entity.presentationFallbackVisible, false, 'still only the abstract marker');

  // A recovered build on a later sync (backoff elapsed) consumes the thunk.
  broken = false;
  substrate.userData.admissionProceduralFallbackRetryAt = 0;
  syncResolvingMarker(boundary, state);
  assert.equal(factory.procedural, proceduralBefore + 2, 'the retry rebuilt the body');
  assert.equal(substrate.userData.admissionProceduralFallback, undefined);
  assert.equal(entity.presentationFallbackVisible, true);
});

test('a mounted terminal fallback latches geometryPending and compiles through the subject pipeline', () => {
  const factory = {
    procedural: 0,
    build() {
      this.procedural += 1;
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return group;
    },
  };
  installVisualOverrides(factory, {
    releaseMode: true,
    directAuthoredMount: true,
    admissionStandInRecord: () => null,
  });
  const entity = { ...REQUIRED_ENTITY, id: 606, data: { defId: 'ship_wasp', missionTag: 'wanted_warrant' } };
  const boundary = factory.build(entity);
  const substrate = substrateOf(boundary);

  terminalAdmission(boundary);
  const compiled = [];
  const state = {
    mode: 'flight',
    missions: { active: [] },
    render: {
      scene: {},
      compileObjectPipelines: (subject, options) => {
        compiled.push({ subject, options });
        return Promise.resolve();
      },
    },
  };
  syncResolvingMarker(boundary, state);

  assert.equal(boundary.userData.geometryPending, true,
    'un-uploaded fallback buffers hold the boundary behind the residency latch');
  assert.equal(compiled.length, 1, 'the root compiles through the normal subject pipeline');
  assert.equal(compiled[0].subject, boundary,
    'the latch subject is the bound root the visibility gate reads');
  assert.equal(compiled[0].options.debugBy, 'terminal-procedural-fallback');
  assert.equal(substrate.userData.authoredReadableFallbackRetained, true);
});

test('a drawn stand-in hull keeps the mission-only thunk unused and stays lockable', () => {
  const record = stubRecord();
  const factory = buildFactory(() => record);
  const entity = { ...REQUIRED_ENTITY, id: 604, data: { defId: 'ship_wasp', missionTag: 'wanted_warrant' } };
  const boundary = factory.build(entity);
  const substrate = substrateOf(boundary);
  const standIn = substrate.userData.resolvingMarker;
  assert.equal(standIn.userData.admissionStandInHull, true,
    'the stand-in is tagged as a real hull, distinct from the octahedron');

  terminalAdmission(boundary);
  const proceduralBefore = factory.procedural;
  syncResolvingMarker(boundary, { missions: { active: [] }, render: { scene: {} } });

  assert.equal(factory.procedural, proceduralBefore,
    'no procedural body is built over the ship\'s own stand-in');
  assert.equal(typeof substrate.userData.admissionProceduralFallback, 'function',
    'the mission-only thunk stays armed behind the authored stand-in');
  assert.equal(standIn.visible, true, 'the stand-in hull keeps drawing at terminal');
  assert.equal(entity.presentationFallbackVisible, true,
    'the stand-in is a real hull to aim at');
});
