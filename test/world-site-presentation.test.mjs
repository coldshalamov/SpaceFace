import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { createWorldSiteRecord, planWorldSiteMaterialization } from '../src/systems/worldSiteKernel.js';
import { installWorldSitePresentation } from '../src/render/worldSitePresentation.js';

const SITE_ID = 'world_site_helios_relay';

function socketRoot(names) {
  const root = new THREE.Group();
  for (const name of names) {
    const socket = new THREE.Object3D();
    socket.name = name;
    socket.userData.spacefaceSocket = true;
    root.add(socket);
  }
  return root;
}

test('every authored stage projects bounded visible fixtures and animation bindings', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  for (const stage of manifest.stages) {
    assert.ok(stage.presentation);
    assert.ok(stage.presentation.fixtures.some((entry) => entry.kind === 'status-light'));
    assert.ok(stage.presentation.fixtures.some((entry) => entry.kind === 'ring' || entry.kind === 'bar'));
    assert.ok(stage.presentation.animations.length > 0);
    assert.ok(stage.presentation.fixtures.length <= 12);
    assert.ok(stage.presentation.animations.length <= 12);
  }
  const plan = planWorldSiteMaterialization(manifest, createWorldSiteRecord(manifest, { tick: 0 }));
  assert.equal(plan.root.presentation.stageId, 'damaged');
  assert.equal(plan.root.presentation.fixtures, manifest.stages[0].presentation.fixtures);
  assert.equal(plan.root.presentation.componentStatuses.relay_core, 'damaged');
});

test('render controller attaches to verified sockets, animates render-only, honors a11y, and disposes once', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const presentation = planWorldSiteMaterialization(
    manifest, createWorldSiteRecord(manifest, { tick: 0 }),
  ).root.presentation;
  const socketNames = [...new Set(presentation.fixtures.map((entry) => entry.socketId))];
  const root = socketRoot(socketNames);
  const entity = { data: { worldSitePresentation: presentation } };
  const before = structuredClone(entity.data.worldSitePresentation);
  const controller = installWorldSitePresentation(root, entity);
  assert.ok(controller);
  assert.equal(controller.diagnostics().missingSockets.length, 0);

  const meshes = [];
  root.traverse((object) => { if (object.userData.worldSitePresentationFixtureId) meshes.push(object); });
  assert.equal(meshes.length, presentation.fixtures.length);
  for (const mesh of meshes) assert.equal(mesh.parent.parent.name, presentation.fixtures.find(
    (entry) => entry.id === mesh.userData.worldSitePresentationFixtureId,
  ).socketId);

  const animated = meshes.find((mesh) => mesh.userData.worldSitePresentationFixtureId === 'relay_status');
  controller.update(entity, 0.0, { reducedMotion: false, reducedFlash: false });
  const fullA = animated.parent.scale.x;
  controller.update(entity, 0.25, { reducedMotion: false, reducedFlash: false });
  const fullB = animated.parent.scale.x;
  assert.notEqual(fullA, fullB, 'full presentation animates from simulation time');

  controller.update(entity, 0.0, { reducedMotion: true, reducedFlash: true });
  const reducedA = { scale: animated.parent.scale.x, opacity: animated.material.opacity };
  controller.update(entity, 12.0, { reducedMotion: true, reducedFlash: true });
  assert.deepEqual({ scale: animated.parent.scale.x, opacity: animated.material.opacity }, reducedA,
    'reduced motion/flash uses a stable readable canonical pose');

  const objectCount = meshes.length;
  for (let i = 0; i < 1000; i += 1) controller.update(entity, i / 60, {
    reducedMotion: false, reducedFlash: false,
  });
  const afterMeshes = [];
  root.traverse((object) => { if (object.userData.worldSitePresentationFixtureId) afterMeshes.push(object); });
  assert.equal(afterMeshes.length, objectCount, 'steady-state update allocates no scene objects');
  assert.deepEqual(entity.data.worldSitePresentation, before, 'renderer never mutates simulation projection');

  let geometryDisposals = 0;
  let materialDisposals = 0;
  for (const mesh of meshes) {
    const disposeGeometry = mesh.geometry.dispose.bind(mesh.geometry);
    const disposeMaterial = mesh.material.dispose.bind(mesh.material);
    mesh.geometry.dispose = () => { geometryDisposals += 1; disposeGeometry(); };
    mesh.material.dispose = () => { materialDisposals += 1; disposeMaterial(); };
  }
  controller.dispose();
  controller.dispose();
  assert.equal(geometryDisposals, meshes.length);
  assert.equal(materialDisposals, meshes.length);
  assert.equal(root.children.some((object) => object.userData.worldSitePresentationOwned), false);
});

test('missing authored sockets fail closed with bounded diagnostics', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const presentation = planWorldSiteMaterialization(
    manifest, createWorldSiteRecord(manifest, { tick: 0 }),
  ).root.presentation;
  const controller = installWorldSitePresentation(new THREE.Group(), {
    data: { worldSitePresentation: presentation },
  });
  assert.ok(controller);
  assert.equal(controller.diagnostics().installed, 0);
  assert.ok(controller.diagnostics().missingSockets.length > 0);
  controller.dispose();
});
