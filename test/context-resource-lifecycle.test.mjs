import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectContextLossRoots,
  deferWebGlContextRestore,
  detachStaleWebGlDisposeListeners,
  isWebGlContextUnavailable,
} from '../src/render/contextResourceLifecycle.js';

test('context loss detaches only stale Three renderer GPU dispose listeners', () => {
  function onGeometryDispose() {}
  function onMaterialDispose() {}
  function onTextureDispose() {}
  function appDisposeListener() {}

  const texture = resource({ isTexture: true }, [onTextureDispose, appDisposeListener]);
  const material = resource({
    isMaterial: true,
    map: texture,
    uniforms: { glowMap: { value: texture } },
  }, [onMaterialDispose, appDisposeListener]);
  const geometry = resource({ isBufferGeometry: true }, [onGeometryDispose, appDisposeListener]);
  const mesh = { geometry, material, skeleton: { boneTexture: texture } };
  const root = { traverse(visitor) { visitor(mesh); visitor(mesh); } };

  const receipt = detachStaleWebGlDisposeListeners([root, material]);

  assert.deepEqual(receipt, {
    objects: 1,
    geometries: 1,
    materials: 1,
    textures: 1,
    renderTargets: 0,
    listenersDetached: 3,
  });
  assert.deepEqual(geometry._listeners.dispose, [appDisposeListener]);
  assert.deepEqual(material._listeners.dispose, [appDisposeListener]);
  assert.deepEqual(texture._listeners.dispose, [appDisposeListener]);
});

test('context loss covers render-target attachments once and ignores unrelated objects', () => {
  function onRenderTargetDispose() {}
  function onTextureDispose() {}
  const color = resource({ isTexture: true }, [onTextureDispose]);
  const depth = resource({ isTexture: true }, [onTextureDispose]);
  const target = resource({ isWebGLRenderTarget: true, texture: color, textures: [color], depthTexture: depth }, [onRenderTargetDispose]);

  const receipt = detachStaleWebGlDisposeListeners([target, {}, null]);

  assert.equal(receipt.renderTargets, 1);
  assert.equal(receipt.textures, 2);
  assert.equal(receipt.listenersDetached, 3);
});

test('context loss root collection includes scene, background, bloom, graph, and live entity resources', () => {
  const scene = { name: 'scene' };
  const environment = { name: 'environment' };
  const backgroundTarget = { name: 'background-target' };
  const bloomTarget = { name: 'bloom-target' };
  const graphTarget = { name: 'graph-target' };
  const entityMesh = { name: 'entity-mesh' };
  const roots = collectContextLossRoots({
    scene,
    environment,
    spaceBackground: { contextLossResources: () => [backgroundTarget] },
    bloom: { contextLossResources: () => [bloomTarget] },
    renderGraph: { contextLossResources: () => [graphTarget] },
    entities: [{ mesh: entityMesh }, null, {}],
  });

  assert.deepEqual(roots, [scene, environment, backgroundTarget, bloomTarget, graphTarget, entityMesh]);
});

test('context restore rebuild stays paused until every listener in the restore event has returned', () => {
  const order = [];
  let queued = null;

  const receipt = deferWebGlContextRestore(
    () => order.push('spaceface-rebuild'),
    (callback) => { queued = callback; },
  );
  order.push('three-context-cache-reset');

  assert.deepEqual(order, ['three-context-cache-reset']);
  assert.equal(receipt.pending, true);
  assert.equal(typeof queued, 'function');

  queued();
  assert.deepEqual(order, ['three-context-cache-reset', 'spaceface-rebuild']);
  assert.equal(receipt.pending, false);
});

test('draw boundary observes a lost GL context before its asynchronous event arrives', () => {
  assert.equal(isWebGlContextUnavailable(true, null), true);
  assert.equal(isWebGlContextUnavailable(false, {
    getContext: () => ({ isContextLost: () => true }),
  }), true);
  assert.equal(isWebGlContextUnavailable(false, {
    getContext: () => ({ isContextLost: () => false }),
  }), false);
  assert.equal(isWebGlContextUnavailable(false, {
    getContext() { throw new Error('driver unavailable'); },
  }), true);
});

function resource(fields, listeners) {
  return {
    ...fields,
    _listeners: { dispose: [...listeners] },
    removeEventListener(type, listener) {
      this._listeners[type] = this._listeners[type].filter((candidate) => candidate !== listener);
    },
  };
}
