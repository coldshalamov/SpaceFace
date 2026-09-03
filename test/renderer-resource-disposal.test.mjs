import assert from 'node:assert/strict';
import test from 'node:test';

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
