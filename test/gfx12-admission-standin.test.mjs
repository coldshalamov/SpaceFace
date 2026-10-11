import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  installVisualOverrides,
  resolvingMarkerFallbackCount,
  upgradeAdmissionStandIn,
} from '../src/render/visualOverrides.js';
import { AUTHORED_ADMISSION_RETRY_MAX, disposeDetachedObject } from '../src/render/partsLibrary.js';
import { syncResolvingMarker } from '../src/render/renderer.js';

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
