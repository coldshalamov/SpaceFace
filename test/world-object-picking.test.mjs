import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createWorldObjectPicker,
  collectPresentedBodyLeaves,
  isSelectableWorldObject,
} from '../src/render/worldObjectPicking.js';
import { presentationAllowsTargetLock } from '../src/core/presentationAdmission.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { resolveWorldPresentationEntity } from '../src/world/presentationSources.js';

const VP = { width: 1000, height: 800, left: 0, top: 0 };

function makeCamera() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
  camera.position.set(0, 100, 0.0001);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function bodyRoot(x, z, size = 10) {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  mesh.position.set(x, 0, z);
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, mesh };
}

function makePicker(entities, extraMeshes) {
  const state = { entities, entityList: [...entities.values()], nextEntityId: 1000 };
  const meshes = extraMeshes || new Map();
  const picker = createWorldObjectPicker({
    state,
    getCamera: () => makeCamera(),
    getMeshes: () => meshes,
    getViewport: () => VP,
  });
  return { state, meshes, picker };
}

test('exact cursor ray picks the body entity under it', () => {
  const rock = { id: 42, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[rock.id, rock]]);
  const { root } = bodyRoot(0, 0);
  const meshes = new Map([[rock.id, root]]);
  const { picker } = makePicker(entities, meshes);

  const hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.ok(hit, 'expected a pick at screen center over the rock');
  assert.equal(hit.entity.id, rock.id);
  assert.equal(hit.approx, false, 'a real surface hit is not the forgiveness path');
});

test('overlapping surfaces resolve to the nearest hit, not the nearest entity center', () => {
  const near = { id: 1, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const far = { id: 2, type: 'station', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[near.id, near], [far.id, far]]);
  const nearRoot = new THREE.Group();
  const nearMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  nearMesh.position.set(0, 40, 0);
  nearRoot.add(nearMesh);
  const farRoot = new THREE.Group();
  const farMesh = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 30), new THREE.MeshBasicMaterial());
  farMesh.position.set(0, 0, 0);
  farRoot.add(farMesh);
  nearRoot.updateMatrixWorld(true);
  farRoot.updateMatrixWorld(true);
  const meshes = new Map([[near.id, nearRoot], [far.id, farRoot]]);
  const { picker } = makePicker(entities, meshes);

  const hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.ok(hit);
  assert.equal(hit.entity.id, near.id, 'the surface the ray strikes first wins');
});

test('hidden, pending, body-less and transient subjects are never picked', () => {
  const hidden = { id: 1, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const pending = { id: 2, type: 'asteroid', alive: true, pending: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[hidden.id, hidden], [pending.id, pending]]);
  const hiddenRoot = bodyRoot(0, 0).root;
  hiddenRoot.visible = false;
  const pendingRoot = bodyRoot(0, 0).root;
  const emptyRoot = new THREE.Group();
  const meshes = new Map([
    [hidden.id, hiddenRoot],
    [pending.id, pendingRoot],
    [3, emptyRoot],
  ]);
  const { picker } = makePicker(entities, meshes);
  assert.equal(picker.pick(VP.width / 2, VP.height / 2), null);
  assert.equal(isSelectableWorldObject({ id: 9, type: 'projectile', alive: true, data: {} }), false);
  assert.equal(isSelectableWorldObject({ id: 9, type: 'vfx', alive: true, data: {} }), false);
});

test('a pooled isMesh=false proxy leaf picks its owning entity', () => {
  const ship = { id: 7, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[ship.id, ship]]);
  const root = new THREE.Group();
  const proxy = new THREE.Object3D();
  proxy.geometry = new THREE.BoxGeometry(10, 10, 10);
  proxy.material = new THREE.MeshBasicMaterial();
  proxy.userData.spacefaceInstanceProxy = true;
  proxy.userData.spacefaceRenderPackagePooled = true;
  proxy.visible = false;
  proxy.userData.poolLeafVisible = true;
  root.add(proxy);
  root.updateMatrixWorld(true);
  const meshes = new Map([[ship.id, root]]);
  const { picker } = makePicker(entities, meshes);

  const hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.ok(hit, 'proxy leaf must pick');
  assert.equal(hit.entity.id, ship.id);
});

test('an adopted invisible instanced leaf is still a presented body', () => {
  const rock = { id: 5, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[rock.id, rock]]);
  const root = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  leaf.visible = false;
  leaf.userData.asteroidInstanceAdopted = true;
  root.add(leaf);
  root.updateMatrixWorld(true);
  const meshes = new Map([[rock.id, root]]);
  const { picker } = makePicker(entities, meshes);

  const hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.ok(hit);
  assert.equal(hit.entity.id, rock.id);
});

test('nav lights, plumes and VFX leaves are not body geometry', () => {
  const ship = { id: 8, type: 'ship', alive: true, pos: { x: 30, z: 0 }, data: {} };
  const entities = new Map([[ship.id, ship]]);
  const root = new THREE.Group();
  const plume = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial());
  plume.name = 'engine_plume';
  root.add(plume);
  const nav = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial());
  nav.userData.navLight = true;
  root.add(nav);
  root.position.set(30, 0, 0);
  root.updateMatrixWorld(true);
  assert.equal(collectPresentedBodyLeaves(root).length, 0, 'no body leaves means no pick');
});

test('a cursor ray behind the camera never picks', () => {
  const rock = { id: 1, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[rock.id, rock]]);
  const { root } = bodyRoot(0, 0);
  const meshes = new Map([[rock.id, root]]);
  const camera = makeCamera();
  camera.position.set(0, -100, 0.0001);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, -200, 0);
  camera.updateMatrixWorld(true);
  const picker = createWorldObjectPicker({
    state: { entities, entityList: [rock] },
    getCamera: () => camera,
    getMeshes: () => meshes,
    getViewport: () => VP,
  });
  assert.equal(picker.pick(VP.width / 2, VP.height / 2), null);
});

test('tiny bodies get bounded forgiveness but never off-cursor lock', () => {
  const mote = { id: 3, type: 'mine', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[mote.id, mote]]);
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial());
  root.add(mesh);
  root.updateMatrixWorld(true);
  const meshes = new Map([[mote.id, root]]);
  const { picker } = makePicker(entities, meshes);

  const near = picker.pick(VP.width / 2 + 3, VP.height / 2);
  assert.ok(near, 'a few px off a tiny body still finds it');
  assert.equal(near.entity.id, mote.id);
  const far = picker.pick(VP.width / 2 + 60, VP.height / 2);
  assert.equal(far, null, 'forgiveness is bounded — no off-cursor lock');
});

test('the same screen point re-picks when the subject moves', () => {
  const rock = { id: 4, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[rock.id, rock]]);
  const { root } = bodyRoot(0, 0);
  const meshes = new Map([[rock.id, root]]);
  const { picker } = makePicker(entities, meshes);

  assert.ok(picker.pick(VP.width / 2, VP.height / 2));
  root.position.set(200, 0, 0);
  root.updateMatrixWorld(true);
  assert.equal(picker.pick(VP.width / 2, VP.height / 2), null, 'stale leaves must not ghost-pick');
});

test('a pending authored body picks while its real body is on screen; marker and empty roots never do', () => {
  const scene = new THREE.Scene();
  const pendingShip = {
    id: 11, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {},
    presentationAdmission: 'pending',
  };
  const pendingMarker = {
    id: 21, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {},
    presentationAdmission: 'pending',
  };
  const pendingHidden = {
    id: 22, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {},
    presentationAdmission: 'pending',
  };
  const entities = new Map([[pendingShip.id, pendingShip], [pendingMarker.id, pendingMarker],
    [pendingHidden.id, pendingHidden]]);
  const state = { entities, entityList: [...entities.values()], render: { scene } };
  const markerRoot = new THREE.Group();
  const marker = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  marker.userData.authoredResolvingMarker = true;
  markerRoot.add(marker);
  markerRoot.updateMatrixWorld(true);
  const hiddenRoot = bodyRoot(0, 0).root;
  hiddenRoot.visible = false;
  // The live pending hull: a resident stand-in body — flagged leaves under an
  // AuthoredResolvingStandIn group — is presented geometry, not the abstract marker.
  const shipRoot = new THREE.Group();
  const standIn = new THREE.Group();
  standIn.name = 'AuthoredResolvingStandIn';
  const standInLeaf = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  standInLeaf.name = 'StandIn_LOD0_Armor';
  standInLeaf.userData.authoredResolvingMarker = true;
  standIn.add(standInLeaf);
  shipRoot.add(standIn);
  shipRoot.updateMatrixWorld(true);
  const meshes = new Map([
    [pendingShip.id, shipRoot],
    [pendingMarker.id, markerRoot],
    [pendingHidden.id, hiddenRoot],
    [23, new THREE.Group()],
  ]);
  for (const root of meshes.values()) scene.add(root);
  scene.updateMatrixWorld(true);
  const picker = createWorldObjectPicker({
    state, getCamera: () => makeCamera(), getMeshes: () => meshes, getViewport: () => VP,
  });
  const hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.equal(hit && hit.entity.id, pendingShip.id,
    'a visible pending hull is the object on screen — it inspects and selects');
  assert.equal(presentationAllowsTargetLock(pendingShip, state), false,
    'the shared combat gate still denies the pending ship — inspection does not grant lockability');
  assert.equal(pendingShip.presentationAdmission, 'pending',
    'inspection never mutates the readiness receipt');
  meshes.delete(pendingShip.id);
  assert.equal(picker.pick(VP.width / 2, VP.height / 2), null,
    'resolving markers, body-less and hidden pending roots still never pick');
});

test('a detached root is never picked even when a scene exists', () => {
  const scene = new THREE.Scene();
  const rock = { id: 13, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[rock.id, rock]]);
  const state = { entities, entityList: [rock], render: { scene } };
  const { root } = bodyRoot(0, 0);
  const meshes = new Map([[rock.id, root]]);
  const picker = createWorldObjectPicker({
    state, getCamera: () => makeCamera(), getMeshes: () => meshes, getViewport: () => VP,
  });
  assert.equal(picker.pick(VP.width / 2, VP.height / 2), null,
    'a root whose chain never reaches the scene is not presented');
  scene.add(root);
  scene.updateMatrixWorld(true);
  assert.ok(picker.pick(VP.width / 2, VP.height / 2), 'attaching the same root makes it pickable');
});

test('meaningful fx pick; a named transient particle does not', () => {
  assert.equal(isSelectableWorldObject({ id: 1, type: 'fx', alive: true, data: { name: 'sparkle_plume' } }), false);
  assert.equal(isSelectableWorldObject({ id: 1, type: 'fx', alive: true, data: {} }), false);
  assert.equal(isSelectableWorldObject({ id: 1, type: 'fx', alive: true, data: { placeId: 'ceres_dock' } }), true);
  assert.equal(isSelectableWorldObject({ id: 1, type: 'fx', alive: true, data: { landmarkGlb: 'landmark' } }), true);
  assert.equal(isSelectableWorldObject({ id: 1, type: 'fx', alive: true, data: { claimSpecId: 'claim_a' } }), true);
  assert.equal(isSelectableWorldObject({ id: 1, type: 'fx', alive: true, data: { worldSiteTargetable: true } }), true);
});

test('LOD visibility flips re-present immediately; swapped same-count children are re-read', () => {
  const rock = { id: 14, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[rock.id, rock]]);
  const root = new THREE.Group();
  const lodNear = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  lodNear.position.set(0, 5, 0);
  const lodFar = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  lodFar.position.set(0, -5, 0);
  lodFar.visible = false;
  root.add(lodNear);
  root.add(lodFar);
  root.updateMatrixWorld(true);
  const meshes = new Map([[rock.id, root]]);
  const { picker } = makePicker(entities, meshes);

  let hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.equal(hit && hit.leaf, lodNear, 'the live LOD leaf wins');

  lodNear.visible = false;
  lodFar.visible = true;
  root.updateMatrixWorld(true);
  hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.equal(hit && hit.leaf, lodFar, 'the hidden LOD stops ghosting on the very next pick');

  root.remove(lodFar);
  const lodSwap = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  lodSwap.position.set(0, -5, 0);
  root.add(lodSwap);
  root.updateMatrixWorld(true);
  hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.equal(hit && hit.leaf, lodSwap, 'a same-count child swap is not served from a stale leaf');
});

test('depth-only and zero-opacity leaves are not bodies; translucent ones are', () => {
  const rock = { id: 15, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[rock.id, rock]]);
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  const rootA = new THREE.Group();
  rootA.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), depthOnly));
  rootA.updateMatrixWorld(true);
  const meshes = new Map([[rock.id, rootA]]);
  const { picker } = makePicker(entities, meshes);
  assert.equal(picker.pick(VP.width / 2, VP.height / 2), null, 'a colorWrite:false leaf draws nothing');

  const faded = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  rootA.children[0].material = faded;
  assert.equal(picker.pick(VP.width / 2, VP.height / 2), null, 'a fully transparent leaf draws nothing');

  const glass = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 });
  rootA.children[0].material = glass;
  assert.ok(picker.pick(VP.width / 2, VP.height / 2), 'a genuinely translucent body still picks');
});

test('orthographic cameras get the same tiny-body forgiveness bound', () => {
  const mote = { id: 16, type: 'mine', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[mote.id, mote]]);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial()));
  root.updateMatrixWorld(true);
  const meshes = new Map([[mote.id, root]]);
  const camera = new THREE.OrthographicCamera(-500, 500, 400, -400, 0.1, 4000);
  camera.position.set(0, 100, 0.0001);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const picker = createWorldObjectPicker({
    state: { entities, entityList: [mote] },
    getCamera: () => camera,
    getMeshes: () => meshes,
    getViewport: () => VP,
  });
  const near = picker.pick(VP.width / 2 + 3, VP.height / 2);
  assert.ok(near && near.entity.id === mote.id, 'a few px off a tiny body still finds it under ortho');
  assert.equal(picker.pick(VP.width / 2 + 60, VP.height / 2), null,
    'the forgiveness bound does not grow under ortho');
});

test('a presented static batch owns the pick; its suppressed proxies never double-pick', () => {
  const ship = { id: 17, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const entities = new Map([[ship.id, ship]]);
  const root = new THREE.Group();
  const lodA = new THREE.Group();
  const batch = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  batch.userData.spacefaceStaticBatch = true;
  lodA.add(batch);
  const lodB = new THREE.Group();
  const proxy = new THREE.Object3D();
  proxy.geometry = new THREE.BoxGeometry(10, 10, 10);
  proxy.material = new THREE.MeshBasicMaterial();
  proxy.userData.spacefaceStaticBatchProxy = true;
  proxy.visible = false;
  proxy.userData.poolLeafVisible = true;
  lodB.add(proxy);
  root.add(lodA);
  root.add(lodB);
  root.updateMatrixWorld(true);
  const meshes = new Map([[ship.id, root]]);
  const { picker } = makePicker(entities, meshes);

  assert.equal(collectPresentedBodyLeaves(root).length, 1,
    'the drawn batch suppresses its proxy — a hover pass must not paint twice');
  const hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.ok(hit && hit.entity.id === ship.id);

  lodA.visible = false;
  proxy.visible = true;
  root.updateMatrixWorld(true);
  const leaves = collectPresentedBodyLeaves(root);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0], proxy, 'a hidden batch releases the live LOD proxy to the pick');
});

test('a field-only rock is inspectable through presentation resolution', () => {
  const entities = new Map();
  const state = { entities, entityList: [], nextEntityId: 500 };
  const rec = insertAsteroidFieldRock(state, { pos: { x: 0, z: 0 }, radius: 8 });
  assert.equal(rec.liveEntityId, null, 'a shelved field rock has no entity row');
  const resolved = resolveWorldPresentationEntity(state, rec.id);
  assert.ok(resolved);
  assert.equal(resolved.type, 'asteroid');
  assert.equal(isSelectableWorldObject(resolved), true);

  const { root } = bodyRoot(0, 0);
  const meshes = new Map([[rec.id, root]]);
  const picker = createWorldObjectPicker({
    state,
    getCamera: () => makeCamera(),
    getMeshes: () => meshes,
    getViewport: () => VP,
  });
  const hit = picker.pick(VP.width / 2, VP.height / 2);
  assert.ok(hit);
  assert.equal(hit.entity.id, rec.id);
});
