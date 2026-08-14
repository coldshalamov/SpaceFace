import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectContextLossRoots,
  createWebGlDisposeListenerProvenance,
  deferWebGlContextRestore,
  describeWebGlDisposeListenerProvenance,
  detachStaleWebGlDisposeListeners,
  isWebGlContextUnavailable,
} from '../src/render/contextResourceLifecycle.js';
import { runWebGlContextRestoreRebuild } from '../src/render/renderer.js';

test('context loss detaches only exact opaque renderer-generation callbacks by resource kind', () => {
  const provenance = createWebGlDisposeListenerProvenance();
  const exactObject = opaqueListener('a');
  const exactGeometry = opaqueListener('b');
  const exactMaterial = opaqueListener('c');
  const exactShadowMaterial = opaqueListener('d');
  const exactTexture = opaqueListener('e');
  const exactRenderTarget = opaqueListener('f');
  provenance.instancedMeshes.add(exactObject);
  provenance.geometries.add(exactGeometry);
  provenance.materials.add(exactMaterial);
  provenance.materials.add(exactShadowMaterial);
  provenance.textures.add(exactTexture);
  provenance.renderTargets.add(exactRenderTarget);

  const appDisposeListener = opaqueListener('c');
  const texture = resource({ isTexture: true }, [exactTexture, appDisposeListener]);
  const material = resource({
    isMaterial: true,
    map: texture,
    uniforms: { glowMap: { value: texture } },
  }, [exactMaterial, exactShadowMaterial, appDisposeListener]);
  const geometry = resource({ isBufferGeometry: true }, [exactGeometry, appDisposeListener]);
  const mesh = resource({
    isInstancedMesh: true,
    geometry,
    material,
    skeleton: { boneTexture: texture },
  }, [exactObject, appDisposeListener]);
  const root = { traverse(visitor) { visitor(mesh); visitor(mesh); } };

  const receipt = detachStaleWebGlDisposeListeners([root, material], provenance);

  assert.equal(receipt.provenanceComplete, true);
  assert.deepEqual(receipt.provenanceMissingKinds, []);
  assert.equal(receipt.objects, 1);
  assert.equal(receipt.instancedMeshes, 1);
  assert.equal(receipt.geometries, 1);
  assert.equal(receipt.materials, 1);
  assert.equal(receipt.textures, 1);
  assert.equal(receipt.renderTargets, 0);
  assert.equal(receipt.listenersDetached, 5);
  assert.deepEqual(mesh._listeners.dispose, [appDisposeListener]);
  assert.deepEqual(geometry._listeners.dispose, [appDisposeListener]);
  assert.deepEqual(material._listeners.dispose, [appDisposeListener]);
  assert.deepEqual(texture._listeners.dispose, [appDisposeListener]);
});

test('context loss covers render-target attachments once and ignores unrelated objects', () => {
  const provenance = completeProvenance();
  const textureListener = [...provenance.textures][0];
  const targetListener = [...provenance.renderTargets][0];
  const color = resource({ isTexture: true }, [textureListener]);
  const depth = resource({ isTexture: true }, [textureListener]);
  const target = resource({ isWebGLRenderTarget: true, texture: color, textures: [color], depthTexture: depth }, [targetListener]);

  const receipt = detachStaleWebGlDisposeListeners([target, {}, null], provenance);

  assert.equal(receipt.renderTargets, 1);
  assert.equal(receipt.textures, 2);
  assert.equal(receipt.listenersDetached, 3);
});

test('incomplete provenance fails closed without name or source-text fallback', () => {
  const namedButUnproven = function onGeometryDispose() {};
  const sameNameForeign = function onGeometryDispose() {};
  const geometry = resource({ isBufferGeometry: true }, [namedButUnproven, sameNameForeign]);
  const provenance = createWebGlDisposeListenerProvenance();
  provenance.materials.add(opaqueListener('m'));

  const status = describeWebGlDisposeListenerProvenance(provenance);
  assert.equal(status.complete, false);
  assert.ok(status.missingKinds.includes('materials'),
    'one material callback cannot stand in for both renderer and shadow ownership');

  const receipt = detachStaleWebGlDisposeListeners([geometry], provenance);
  assert.equal(receipt.provenanceComplete, false);
  assert.equal(receipt.listenersDetached, 0);
  assert.deepEqual(geometry._listeners.dispose, [namedButUnproven, sameNameForeign]);
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

test('context restore stays draw-gated through rebuild and remains gated after a rebuild failure', async () => {
  const owner = { _contextLost: true };
  const recovery = { restores: 2, generation: 7, pending: true, lastError: null };
  const success = await runWebGlContextRestoreRebuild(owner, recovery, async () => {
    assert.equal(owner._contextLost, true, 'draw remains gated during every rebuild step');
    assert.equal(recovery.pending, true, 'readiness remains pending during every rebuild step');
    await Promise.resolve();
    assert.equal(owner._contextLost, true, 'async pipeline rebuild also remains draw-gated');
    assert.equal(recovery.pending, true);
  });

  assert.equal(success.ok, true);
  assert.equal(owner._contextLost, false);
  assert.equal(recovery.pending, false);
  assert.equal(recovery.restores, 3);
  assert.equal(recovery.generation, 8);

  owner._contextLost = true;
  recovery.pending = true;
  const failure = await runWebGlContextRestoreRebuild(owner, recovery, async () => {
    assert.equal(owner._contextLost, true);
    assert.equal(recovery.pending, true);
    await Promise.resolve();
    throw new Error('rebuild exploded');
  });

  assert.equal(failure.ok, false);
  assert.match(String(failure.error?.message), /rebuild exploded/);
  assert.equal(owner._contextLost, true,
    'a failed rebuild must not reopen rendering onto half-restored resources');
  assert.equal(recovery.pending, true,
    'a failed rebuild remains unavailable to startup/readiness gates');
  assert.equal(recovery.lastError, 'rebuild exploded');
  assert.equal(recovery.restores, 3, 'failed rebuilds do not advance restore receipts');
  assert.equal(recovery.generation, 8, 'failed rebuilds do not publish a fresh generation');

  const contextLostReceipt = await runWebGlContextRestoreRebuild(owner, recovery, async () => ({
    contextLost: true,
    reason: 'driver reset during restored pipeline compile',
  }));
  assert.equal(contextLostReceipt.ok, false);
  assert.equal(owner._contextLost, true,
    'a fulfilled context-lost compile receipt must not reopen rendering');
  assert.equal(recovery.pending, true);
  assert.match(recovery.lastError, /driver reset during restored pipeline compile/);
  assert.equal(recovery.restores, 3);
  assert.equal(recovery.generation, 8);
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
    hasEventListener(type, listener) {
      return this._listeners[type]?.includes(listener) === true;
    },
    removeEventListener(type, listener) {
      this._listeners[type] = this._listeners[type].filter((candidate) => candidate !== listener);
    },
  };
}

function opaqueListener(name = '') {
  const listener = () => {};
  Object.defineProperty(listener, 'name', { configurable: true, value: name });
  return listener;
}

function completeProvenance() {
  const provenance = createWebGlDisposeListenerProvenance();
  provenance.instancedMeshes.add(opaqueListener('a'));
  provenance.geometries.add(opaqueListener('b'));
  provenance.materials.add(opaqueListener('c'));
  provenance.materials.add(opaqueListener('d'));
  provenance.textures.add(opaqueListener('e'));
  provenance.renderTargets.add(opaqueListener('f'));
  return provenance;
}
