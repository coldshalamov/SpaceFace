import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { livingHullWithScar } from '../src/core/livingHull.js';

import {
  createRendererLifecycleBindings,
  disposeRendererOwnedResources,
  render,
} from '../src/render/renderer.js';

function disposable(name, order) {
  return {
    dispose() {
      order.push(name);
    },
  };
}

function makeOwner(order, { contextLost = false } = {}) {
  const camera = {};
  const cameraController = { obj: camera };
  const helpers = { worldToScreen() {} };
  const entityMesh = {
    traverse(callback) {
      callback({
        userData: {},
        geometry: disposable('entity-geometry', order),
        material: disposable('entity-material', order),
      });
    },
  };
  const owner = {
    _contextRestoreReceipt: { cancel: () => order.push('cancel') },
    _sectorBoundaryPreparations: { abortAll: () => { order.push('abort'); return Promise.resolve([]); } },
    _assetResidency: {
      releaseOwner: () => { order.push('release-residency'); },
    },
    _adaptive: { setEnabled: (enabled) => order.push(`adaptive:${enabled}`) },
    _dynamicBuffers: {
      epoch: 4,
      disarm: () => order.push('dynamic-disarm'),
      dispose: () => order.push('dynamic-coordinator'),
    },
    _livingHullPresentation: {
      dispose: () => order.push('living-hull'),
      detach: () => order.push('living-hull-detach'),
    },
    _meshes: new Map([[7, entityMesh]]),
    _hazardVisuals: [],
    _presentationWorld: { dispose: () => order.push('presentation-world') },
    _contextLost: contextLost,
    _rendererResourcesDisposed: false,
    _helperBindings: {
      target: helpers,
      values: { worldToScreen: helpers.worldToScreen },
    },
    cam: cameraController,
    state: {
      camera: { obj: camera },
      entities: new Map([[7, { id: 7, mesh: entityMesh }]]),
      render: {
        perfEntityIsolation: { restore: () => order.push('entity-isolation-restore') },
        perfMaterialIsolation: { restore: () => order.push('material-isolation-restore') },
        renderer: { dead: true },
      },
    },
    scene: {
      remove(root) { order.push(root === entityMesh ? 'remove-entity-root' : 'remove-root'); },
      environment: {},
      background: {},
    },
    spaceBg: disposable('space-background', order),
    collisionDebug: disposable('collision-debug', order),
    bloom: disposable('bloom', order),
    _renderGraph: disposable('render-graph', order),
    _envMap: disposable('environment-map', order),
    _gpuTimers: disposable('gpu-timers', order),
    _pmremGenerator: disposable('pmrem-generator', order),
    _pmremContextSeq: 0,
    diag: disposable('diagnostics', order),
    _glInstrumentation: { uninstall: () => order.push('gl-uninstall') },
    _domInstrumentation: { uninstall: () => order.push('dom-uninstall') },
    renderer: disposable('webgl-renderer', order),
  };
  owner._unbindPresentationMesh = () => { order.push('unbind-presentation'); };
  owner._parallax = disposable('parallax', order);
  return { owner, camera, helpers, entityMesh, state: owner.state };
}

test('renderer resource disposal is ordered, exact-once, and clears generation references', () => {
  const order = [];
  const { owner, camera, helpers, state } = makeOwner(order);
  const result = disposeRendererOwnedResources(owner, {
    parallaxLayers: disposable('parallax', order),
  });

  assert.equal(result, true);
  assert.deepEqual(order, [
    'cancel',
    'abort',
    'adaptive:false',
    'entity-isolation-restore',
    'material-isolation-restore',
    'dynamic-disarm',
    'living-hull',
    'unbind-presentation',
    'remove-entity-root',
    'entity-geometry',
    'entity-material',
    'presentation-world',
    'space-background',
    'parallax',
    'collision-debug',
    'bloom',
    'render-graph',
    'environment-map',
    'gpu-timers',
    'pmrem-generator',
    'dynamic-coordinator',
    'diagnostics',
    'gl-uninstall',
    'dom-uninstall',
    'webgl-renderer',
  ]);
  assert.equal(disposeRendererOwnedResources(owner), false, 'destroy is idempotent');
  assert.equal(owner.renderer, null);
  assert.equal(owner.scene, null);
  assert.equal(owner._meshes, null);
  assert.equal(owner.state, null);
  assert.equal(owner._helperBindings, null);
  assert.equal(helpers.worldToScreen, null, 'old helpers cannot target a dead generation');
  assert.equal(owner.cam, null, 'camera reference is cleared');
  assert.equal(state.camera.obj, null, 'state does not retain the dead camera');
  assert.equal(state.render.renderer, null, 'state render references are cleared');
});

test('context-loss disposal abandons old-context GPU resources while still clearing ownership', () => {
  const order = [];
  const { owner } = makeOwner(order, { contextLost: true });
  disposeRendererOwnedResources(owner, {
    parallaxLayers: disposable('parallax', order),
  });

  assert.deepEqual(order, [
    'cancel',
    'abort',
    'adaptive:false',
    'entity-isolation-restore',
    'material-isolation-restore',
    'dynamic-disarm',
    'living-hull-detach',
    'unbind-presentation',
    'remove-entity-root',
    'presentation-world',
    'dynamic-coordinator',
    'diagnostics',
    'gl-uninstall',
    'dom-uninstall',
    'webgl-renderer',
  ]);
  assert.equal(owner.renderer, null);
  assert.equal(owner._gpuTimers, null);
  assert.equal(owner._renderGraph, null);
});

test('hazards and Bolus roots retire before their renderer and abandon lost-context GPU objects', () => {
  for (const contextLost of [false, true]) {
    const order = [];
    const { owner } = makeOwner(order, { contextLost });
    const hazard = { traverse(fn) { fn({ userData: {}, geometry: disposable('hazard-geometry', order) }); } };
    owner._hazardVisuals.push(hazard);
    owner._bolusView = {
      group: {
        removeFromParent() { order.push('bolus-detach'); },
        traverse(fn) { fn({ geometry: disposable('bolus-geometry', order) }); },
      },
    };
    owner._marrowSpot = {
      removeFromParent() { order.push('spot-detach'); },
      target: { removeFromParent() { order.push('spot-target-detach'); } },
      ...disposable('spot-dispose', order),
    };
    assert.equal(disposeRendererOwnedResources(owner), true);
    for (const label of ['bolus-detach', 'spot-detach', 'spot-target-detach']) {
      assert.ok(order.indexOf(label) >= 0 && order.indexOf(label) < order.indexOf('webgl-renderer'));
    }
    for (const label of ['hazard-geometry', 'bolus-geometry', 'spot-dispose']) {
      assert.equal(order.filter((value) => value === label).length, contextLost ? 0 : 1);
    }
    assert.equal(owner._bolusView, null);
    assert.equal(owner._marrowSpot, null);
  }
});

test('a fresh renderer generation can be destroyed after the prior one without stale references', () => {
  const fields = [
    '_rendererLifecycle', '_rendererResourcesDisposed', '_contextRestoreReceipt', '_meshes',
    '_hazardVisuals', '_dynamicBuffers', '_contextLost', 'state', 'scene', 'renderer', 'cam',
    'spaceBg', 'collisionDebug', 'bloom', '_renderGraph', '_envMap', '_gpuTimers', 'diag',
    '_glInstrumentation', '_domInstrumentation', '_helperBindings',
  ];
  const saved = new Map(fields.map((key) => [key, {
    present: Object.prototype.hasOwnProperty.call(render, key),
    value: render[key],
  }]));
  const order = [];
  try {
    const firstLifecycle = createRendererLifecycleBindings();
    render._rendererLifecycle = firstLifecycle;
    render._rendererResourcesDisposed = false;
    render._contextLost = false;
    render._meshes = new Map();
    render._hazardVisuals = [];
    render.renderer = disposable('first-renderer', order);
    render.scene = { remove() {}, environment: null, background: null };
    render.state = { render: {} };
    assert.equal(render.destroy(), true);
    assert.equal(render.destroy(), false);

    const secondLifecycle = createRendererLifecycleBindings();
    render._rendererLifecycle = secondLifecycle;
    render._rendererResourcesDisposed = false;
    render._contextLost = false;
    render._meshes = new Map();
    render._hazardVisuals = [];
    render.renderer = disposable('second-renderer', order);
    render.scene = { remove() {}, environment: null, background: null };
    render.state = { render: {} };
    assert.equal(render.destroy(), true);
    assert.deepEqual(order, ['first-renderer', 'second-renderer']);
  } finally {
    for (const [key, snapshot] of saved) {
      if (snapshot.present) render[key] = snapshot.value;
      else delete render[key];
    }
  }
});


test('retiring a scarred rival releases every instance buffer across repeated presentation rebinds', () => {
  const owner = Object.create(render);
  owner.state = { playerId: 1, simTime: 10 };
  owner._nemesisHullPresentations = new Map();
  const entity = {
    id: 7, type: 'ship', radius: 12,
    data: { nemesis: true, livingHull: livingHullWithScar(null, {
      id: 'weapon:8:bow', cause: 'weapon', surface: 'weapon',
      band: 'hard', facing: 'bow', tick: 8,
    }, 8) },
  };
  const mesh = new THREE.Group();
  mesh.userData.authoredAssetState = 'authored';
  const retired = new Set();
  for (let rebind = 0; rebind < 3; rebind++) {
    owner._syncNemesisHullPresentation(entity, mesh);
    const controller = owner._nemesisHullPresentations.get(mesh).presentation;
    assert.equal(controller.diagnostics().scarMarks, 1);
    const instances = controller.root.children.filter((child) => child.isInstancedMesh);
    assert.equal(instances.length, 4, 'the hull owns tally, patch, scorch, and grime instances');
    const released = new Map();
    const geometries = new Set(instances.map((child) => child.geometry));
    for (const resource of [...instances, ...geometries]) {
      assert.equal(retired.has(resource), false, 'a rebound presentation owns fresh resources');
      released.set(resource, 0);
      resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
      retired.add(resource);
    }
    owner._releaseNemesisHullPresentation(mesh, entity.id);
    owner._releaseNemesisHullPresentation(mesh, entity.id);
    controller.dispose();
    assert.equal(owner._nemesisHullPresentations.size, 0);
    assert.equal(controller.root.parent, null);
    assert.equal(controller.root.children.length, 0);
    for (const resource of [...instances, ...geometries]) {
      assert.equal(released.get(resource), 1,
        `${resource.name || resource.type} releases its GPU resources exactly once on retirement`);
    }
  }
});
