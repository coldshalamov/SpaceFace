import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  collectContextLossRoots,
  CONTEXT_LOSS_TIME_EFFECT_SOURCE,
  createWebGlDisposeListenerProvenance,
  deferWebGlContextRestore,
  describeWebGlDisposeListenerProvenance,
  detachStaleWebGlDisposeListeners,
  detachStashedStaleWebGlDisposeListeners,
  isWebGlContextUnavailable,
  pauseSimForContextLoss,
  resumeSimAfterContextRestore,
  stashStaleWebGlDisposeProvenance,
} from '../src/render/contextResourceLifecycle.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  receiptReportsContextLost,
  runWebGlContextRestoreRebuild,
} from '../src/render/renderer.js';

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

test('context loss detaches BatchedMesh-owned matrix and indirect textures', () => {
  const provenance = completeProvenance();
  const exactTexture = [...provenance.textures][0];
  const matrices = resource({ isTexture: true }, [exactTexture]);
  const indirect = resource({ isTexture: true }, [exactTexture]);
  const colors = resource({ isTexture: true }, [exactTexture]);
  const geometry = resource({ isBufferGeometry: true }, []);
  const material = resource({ isMaterial: true }, []);
  const batch = {
    isBatchedMesh: true,
    geometry,
    material,
    _matricesTexture: matrices,
    _indirectTexture: indirect,
    _colorsTexture: colors,
  };
  const root = { traverse(visitor) { visitor(batch); } };

  const receipt = detachStaleWebGlDisposeListeners(root, provenance);

  assert.equal(receipt.objects, 1);
  assert.equal(receipt.batchedMeshes, 1);
  assert.equal(receipt.instancedMeshes, 0);
  assert.equal(receipt.textures, 3);
  assert.equal(receipt.listenersDetached, 3);
  assert.deepEqual(matrices._listeners.dispose, []);
  assert.deepEqual(indirect._listeners.dispose, []);
  assert.deepEqual(colors._listeners.dispose, []);
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

  const contextLostReceipt = await runWebGlContextRestoreRebuild(owner, recovery, async () => ([
    { skipped: false },
    { contextLost: true, reason: 'driver reset during restored pipeline compile' },
  ]));
  assert.equal(contextLostReceipt.ok, false);
  assert.equal(owner._contextLost, true,
    'a fulfilled context-lost compile receipt must not reopen rendering');
  assert.equal(recovery.pending, true);
  assert.match(recovery.lastError, /driver reset during restored pipeline compile/);
  assert.equal(recovery.restores, 3);
  assert.equal(recovery.generation, 8);
});

test('a failed restore with scheduleRetry does not stay pending without another attempt', async () => {
  const owner = { _contextLost: true };
  let retries = 0;
  const recovery = {
    restores: 0,
    generation: 0,
    pending: true,
    lastError: null,
    retryCount: 0,
    scheduleRetry() { retries += 1; },
  };
  const failure = await runWebGlContextRestoreRebuild(owner, recovery, async () => {
    throw new Error('transient rebuild');
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.retryScheduled, true);
  assert.equal(retries, 1);
  assert.equal(recovery.pending, true);
  assert.equal(recovery.retryCount, 1);
});

test('sliced compile receipts still count as context-lost', () => {
  assert.equal(receiptReportsContextLost(null), false);
  assert.equal(receiptReportsContextLost({ skipped: false }), false);
  assert.equal(receiptReportsContextLost({ contextLost: true, reason: 'driver' }), true);
  assert.equal(receiptReportsContextLost([
    { skipped: false },
    { contextLost: true, reason: 'lost mid-slice' },
  ]), true);
});

test('successful restore clears the force-new-context latch for a later loss', async () => {
  const owner = { _contextLost: true };
  const recovery = {
    restores: 0,
    generation: 0,
    pending: true,
    lastError: null,
    retryCount: 0,
    forcedNewContext: true,
  };
  const success = await runWebGlContextRestoreRebuild(owner, recovery, async () => ({ ok: true }));
  assert.equal(success.ok, true);
  assert.equal(recovery.forcedNewContext, false);
});

test('exhausted restore retries force a new context instead of staying dead', async () => {
  let forced = 0;
  const owner = { _contextLost: true };
  const recovery = {
    restores: 0,
    generation: 0,
    pending: true,
    lastError: null,
    retryCount: 8,
    scheduleRetry() {},
    forceNewContext() { forced += 1; },
  };
  const failure = await runWebGlContextRestoreRebuild(owner, recovery, async () => {
    throw new Error('still broken after retries');
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.forcedNewContext, true);
  assert.equal(forced, 1);
  assert.equal(recovery.retryCount, 0);
  assert.equal(recovery.pending, true);
  assert.equal(owner._contextLost, true);
});

test('a second exhausted restore after a forced context is a named terminal park', async () => {
  const owner = { _contextLost: true };
  const recovery = {
    restores: 0,
    generation: 0,
    pending: true,
    lastError: null,
    retryCount: 8,
    forcedNewContext: true,
    scheduleRetry() {},
    forceNewContext() { throw new Error('must not force twice'); },
  };
  const failure = await runWebGlContextRestoreRebuild(owner, recovery, async () => {
    throw new Error('forced context also dead');
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.retryScheduled, false);
  assert.equal(failure.terminal, true);
  assert.equal(recovery.terminal, true);
  assert.equal(recovery.pending, true);
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

test('context loss halts the sim through the time-effects ledger, never a direct write', () => {
  const state = { timeScale: 1, render: { contextRecovery: {} } };
  const prior = pauseSimForContextLoss(state);
  assert.equal(prior, 1);
  assert.equal(state.timeScale, 0);
  assert.equal(state.render.contextRecovery.simPaused, true);
  // A repeated loss is idempotent — one ledger source, still halted.
  pauseSimForContextLoss(state);
  assert.equal(state.timeScale, 0);
  assert.equal(CONTEXT_LOSS_TIME_EFFECT_SOURCE, 'webgl-context-loss');
});

test('context loss never erases a surviving menu pause, and recovery never clears it', () => {
  const state = { timeScale: 1, render: { contextRecovery: {} } };
  createTimeEffects(state).set('menu', { scale: 0 });
  pauseSimForContextLoss(state);
  assert.equal(state.timeScale, 0);
  const after = resumeSimAfterContextRestore(state);
  assert.equal(after, 0, 'the menu hold must survive context recovery');
  assert.equal(state.timeScale, 0);
  assert.equal(state.render.contextRecovery.simPaused, false);
  createTimeEffects(state).clear('menu');
  assert.equal(state.timeScale, 1);
});

test('successful restore resumes the sim; failed states stay halted without a resume call', () => {
  const state = { timeScale: 1, render: { contextRecovery: {} } };
  pauseSimForContextLoss(state);
  assert.equal(state.timeScale, 0);
  const after = resumeSimAfterContextRestore(state);
  assert.equal(after, 1);
  assert.equal(state.timeScale, 1);
  assert.equal(state.render.contextRecovery.simPaused, false);
  // A second resume with no hold is a harmless no-op, never a timeScale write race.
  assert.equal(resumeSimAfterContextRestore(state), 1);
  assert.equal(resumeSimAfterContextRestore(null), 1);
  assert.equal(pauseSimForContextLoss(null), 0);
});

// The v6 Electron storm's residual: parked trees (procedural world-site fixtures on detached
// structures) kept the dying generation's dispose callbacks, and their later teardown fired
// them against dead handles — every delete logged as `object does not belong to this context`.
// The renderer stashes the dying generation's provenance at loss; the boundary-teardown
// chokepoint strips those exact identities before any dispose fires.
test('the loss stash is a no-op until a provenance is stashed, then strips only stashed identities from a parked tree', () => {
  // No loss has stashed anything yet: the teardown strip must touch nothing at all.
  assert.equal(detachStashedStaleWebGlDisposeListeners([]), null);

  const staleGeometryListener = opaqueListener('stale-onGeometryDispose');
  const staleMaterialListener = opaqueListener('stale-onMaterialDispose');
  const foreignListener = opaqueListener('app-owned-dispose');
  const unstashedGeometryListener = opaqueListener('unrelated-generation');

  const fixtureGeometry = resource({ isBufferGeometry: true }, [staleGeometryListener, unstashedGeometryListener]);
  const fixtureMaterial = resource({ isMaterial: true }, [staleMaterialListener, foreignListener]);
  // A parked world-site-shaped tree: root -> fixture mount -> fixture mesh (geometry + material).
  const fixtureMesh = resource({ geometry: fixtureGeometry, material: fixtureMaterial }, []);
  const parkedRoot = { traverse: (visitor) => visitor(fixtureMesh) };

  assert.equal(stashStaleWebGlDisposeProvenance({
    geometries: new Set([staleGeometryListener]),
    materials: new Set([staleMaterialListener]),
  }), true);

  const receipt = detachStashedStaleWebGlDisposeListeners([parkedRoot]);
  assert.ok(receipt, 'a stashed provenance must arm the strip');
  assert.equal(receipt.geometries, 1);
  assert.equal(receipt.materials, 1);
  assert.equal(receipt.listenersDetached, 2);
  // The stale identities are gone; every listener the stash does not name survives.
  assert.deepEqual(fixtureGeometry._listeners.dispose, [unstashedGeometryListener]);
  assert.deepEqual(fixtureMaterial._listeners.dispose, [foreignListener]);
  assert.equal(fixtureGeometry.hasEventListener('dispose', staleGeometryListener), false);
  assert.equal(fixtureMaterial.hasEventListener('dispose', staleMaterialListener), false);
});

test('repeated losses merge provenance into one stash; empty stashes are rejected without disturbance', () => {
  const firstLossListener = opaqueListener('gen1-onGeometryDispose');
  const secondLossListener = opaqueListener('gen2-onGeometryDispose');
  assert.equal(stashStaleWebGlDisposeProvenance({ geometries: new Set([firstLossListener]) }), true);
  assert.equal(stashStaleWebGlDisposeProvenance({ geometries: new Set([secondLossListener]) }), true);
  assert.equal(stashStaleWebGlDisposeProvenance(null), false);
  assert.equal(stashStaleWebGlDisposeProvenance({}), false);

  const geometry = resource({ isBufferGeometry: true }, [firstLossListener, secondLossListener]);
  // Residency hands raw resources as roots, so the strip sees the geometry itself.
  const receipt = detachStashedStaleWebGlDisposeListeners([geometry]);
  assert.equal(receipt.listenersDetached, 2);
  assert.deepEqual(geometry._listeners.dispose, []);
});

test('renderer wiring: the loss handler stashes the consumed provenance and teardown strips before any dispose fires', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const lostAt = source.indexOf("lifecycle.listen(canvas, 'webglcontextlost'");
  const lostEnd = source.indexOf("lifecycle.listen(canvas, 'webglcontextrestored'", lostAt);
  const lostHandler = source.slice(lostAt, lostEnd);
  assert.ok(lostAt >= 0 && lostEnd > lostAt, 'the webglcontextlost listener must be inspectable');
  assert.match(
    lostHandler,
    /stashStaleWebGlDisposeProvenance\(preparedPoolResources\.provenance\);/,
    'the loss handler must stash the provenance the detach pass consumed',
  );

  const disposeAt = source.indexOf('function disposeObject(obj)');
  assert.ok(disposeAt >= 0, 'disposeObject must be inspectable');
  const disposeBody = source.slice(disposeAt, source.indexOf('\nfunction ', disposeAt + 10));
  const stripAt = disposeBody.indexOf('detachStashedStaleWebGlDisposeListeners([obj]);');
  const traverseAt = disposeBody.indexOf('obj.traverse((c) => {');
  assert.ok(stripAt >= 0, 'teardown must strip stashed stale listeners from the tree');
  assert.ok(traverseAt > stripAt, 'the strip must run before the disposal traversal — any later and the world-site controller disposes fixture geometries through stale callbacks before their strip');
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
