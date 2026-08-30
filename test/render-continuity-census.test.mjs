import assert from 'node:assert/strict';
import test from 'node:test';

import { runRenderUpdatePhase } from '../src/core/renderUpdatePhase.js';
import { installDiagnostics } from '../src/render/diagnostics.js';
import {
  createRenderContinuityCensus,
  inspectRenderContinuityObject,
  shouldReportRenderDisappearance,
} from '../src/render/renderContinuityCensus.js';

function sceneHarness({ drawableVisible = true, rootVisible = true } = {}) {
  const scene = { type: 'Scene', visible: true, children: [] };
  const parent = { type: 'Group', name: 'WorldRoot', visible: true, parent: scene, children: [] };
  const leaf = {
    isMesh: true,
    name: 'HullLeaf',
    visible: drawableVisible,
    material: { visible: true },
    children: [],
  };
  const root = {
    type: 'Group',
    name: 'EntityRoot',
    uuid: 'root-1',
    visible: rootVisible,
    parent,
    children: [leaf],
    userData: {
      assetId: 'wholeship/test.glb',
      authoredAssetState: 'authored',
      lod: { level: 'lod0', lastPx: 180 },
      flightRenderPackage: {
        packageId: 'pkg-test',
        contentHash: 'hash-test',
        residency: { key: 'asset:test', generation: 4, state: 'resident' },
      },
    },
  };
  scene.children.push(parent);
  return { scene, parent, root, leaf };
}

function contextFor(entity, harness, overrides = {}) {
  return {
    state: {
      mode: 'flight',
      world: {
        currentSectorId: 'sector_test',
        frameOrigin: { x: 40, z: -12 },
        frameOriginSeq: 7,
      },
      render: { assetResidency: { generation: 4, sectors: ['sector_test'] } },
    },
    entities: [entity],
    meshes: new Map([[entity.id, harness.root]]),
    scene: harness.scene,
    snapshot: {
      count: 1,
      sequence: 8,
      indexByEntityId: new Map([[entity.id, 0]]),
    },
    inCamera: new Map([[entity.id, true]]),
    entityFrame: { frameId: 12, byId: new Map([[entity.id, { viewCulled: false }]]) },
    activityFrame: { complete: true, renderGlassIds: new Set([entity.id]), renderRunwayIds: new Set() },
    lifecycle: { lifecycleState: 'presenting', lifecycleGeneration: 2 },
    ...overrides,
  };
}

test('render continuity rows expose the entity-to-error chain', () => {
  const h = sceneHarness();
  const entity = {
    id: 9,
    type: 'ship',
    alive: true,
    pos: { x: 3, y: 0, z: -4 },
    data: { defId: 'ship_test', assetRef: 'wholeship/test.glb' },
    activity: { presentationTier: 'R0_GLASS', simTier: 'S0_EXACT' },
    mesh: h.root,
  };
  const row = inspectRenderContinuityObject(entity, contextFor(entity, h, {
    lastRenderError: { stage: 'render.draw', message: 'draw exploded' },
  }));

  assert.equal(row.continuity.renderable, true);
  assert.equal(row.snapshot.present, true);
  assert.equal(row.asset.authoredState, 'authored');
  assert.equal(row.mesh.rootUuid, 'root-1');
  assert.equal(row.scene.attachedToScene, true);
  assert.equal(row.scene.visibleLeafCount, 1);
  assert.equal(row.lod.level, 'lod0');
  assert.equal(row.cull.inCamera, true);
  assert.equal(row.frame.presentationTier, 'R0_GLASS');
  assert.equal(row.pipeline.pending, false);
  assert.equal(row.residency.currentSectorId, 'sector_test');
  assert.equal(row.origin.sequence, 7);
  assert.equal(row.lifecycle.state, 'presenting');
  assert.equal(row.lastRenderError.stage, 'render.draw');
});

test('a missing visible leaf reports only after the bounded multi-sample threshold', () => {
  const h = sceneHarness();
  const entity = {
    id: 3,
    type: 'ship',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    activity: { presentationTier: 'R0_GLASS' },
    mesh: h.root,
  };
  const census = createRenderContinuityCensus({ enabled: true, sampleEvery: 1, missSamples: 3 });
  const context = contextFor(entity, h);
  assert.equal(census.sample(context).alerts.length, 0);
  h.leaf.visible = false;
  assert.equal(census.sample(context).alerts.length, 0);
  assert.equal(census.sample(context).alerts.length, 0);
  const third = census.sample(context);
  assert.equal(third.alerts.length, 1);
  assert.equal(third.alerts[0].id, 3);
  assert.deepEqual(third.alerts[0].missing, ['visible-leaves']);
  assert.equal(third.rows[0].continuity.disappearance.reason, 'unexplained-render-loss');
  assert.equal(census.sample(context).alerts.length, 1,
    'one sustained disappearance produces one alert rather than per-frame spam');

  h.leaf.visible = true;
  assert.equal(census.sample(context).alerts.length, 1, 'history remains bounded and queryable');
  assert.equal(census.getReport().rows[0].continuity.disappearance, null,
    'recovery clears the active disappearance on the next sample');
});

test('authorized cull, sector, LOD, and context transitions do not become disappearance alerts', () => {
  const h = sceneHarness();
  const entity = {
    id: 4,
    type: 'ship',
    alive: true,
    activity: { presentationTier: 'R0_GLASS' },
    mesh: h.root,
  };
  const census = createRenderContinuityCensus({ enabled: true, sampleEvery: 1, missSamples: 2 });
  const context = contextFor(entity, h);
  census.sample(context);

  const culled = { ...context, inCamera: new Map([[4, false]]), activityFrame: {
    complete: true,
    renderGlassIds: new Set(),
    renderRunwayIds: new Set(),
  } };
  census.sample(culled);
  census.sample(culled);
  assert.equal(census.getReport().alerts.length, 0);
  assert.equal(census.getReport().rows[0].cull.reason, 'view-cull');

  const contextLost = {
    ...context,
    contextRecovery: { pending: true, generation: 3 },
    inCamera: new Map([[4, true]]),
  };
  h.leaf.visible = false;
  census.sample(contextLost);
  census.sample(contextLost);
  assert.equal(census.getReport().alerts.length, 0);
  assert.equal(census.getReport().rows[0].lifecycle.authorizedTransition.reason, 'context-loss');

  const explicitlyUnclassified = inspectRenderContinuityObject(entity, {
    ...context,
    authorizedTransition: { reason: 'origin-rebase' },
  });
  assert.equal(explicitlyUnclassified.lifecycle.authorizedTransition.authorized, false,
    'an unclassified transition must not suppress a disappearance alert');
  assert.equal(explicitlyUnclassified.cull.reason, null);
});

test('instance submission can keep a hidden source leaf renderable', () => {
  const h = sceneHarness({ drawableVisible: false });
  const entity = {
    id: 6,
    type: 'asteroid',
    alive: true,
    activity: { presentationTier: 'R0_GLASS' },
    mesh: h.root,
  };
  const row = inspectRenderContinuityObject(entity, contextFor(entity, h, {
    asteroidInstancePool: {
      byEntity: new Map([[6, {
        record: { leaf: { userData: { asteroidInstanceAdopted: true } } },
        bucket: { entityIds: [6], mesh: { uuid: 'pool-1', count: 1 } },
      }]]),
    },
  }));
  assert.equal(row.instance.submitted, true);
  assert.equal(row.scene.visibleLeafCount, 0);
  assert.equal(row.continuity.renderable, true);
});

test('disabled continuity has no sample work and the aggregate probe remains queryable', () => {
  const disabled = createRenderContinuityCensus({ enabled: false });
  assert.equal(disabled.observe({}), null);
  assert.equal(disabled.getReport().enabled, false);

  const previousWindow = globalThis.window;
  globalThis.window = {};
  const renderer = {
    info: {
      autoReset: true,
      render: { calls: 2, triangles: 6, points: 0, lines: 0 },
      memory: { geometries: 3, textures: 4 },
      programs: [],
      reset() {},
    },
  };
  const diagnostics = installDiagnostics(renderer, {
    continuity: () => ({ schema: 'spaceface.renderContinuity.v1', enabled: true }),
    renderError: () => ({ stage: 'render.draw', message: 'draw exploded' }),
    renderErrorCount: () => 1,
  });
  diagnostics.update(1 / 60);
  const report = diagnostics.getReport();
  assert.equal(report.continuity.enabled, true);
  assert.equal(report.lastRenderError.stage, 'render.draw');
  assert.equal(report.renderErrorCount, 1);
  diagnostics.dispose();
  globalThis.window = previousWindow;
});

test('render-stage failure reporting preserves containment and identifies the failing phase', () => {
  const calls = [];
  let reported = null;
  const error = new Error('draw exploded');
  const render = {
    prepareFrame() { calls.push('prepare'); return true; },
    drawPreparedFrame() { calls.push('draw'); throw error; },
    recordRenderError(stage, cause) { reported = { stage, cause }; },
  };
  const ctx = {
    state: { ui: { docked: false } },
    render,
    vfx: { update() { calls.push('vfx'); } },
    feel: { frame() { calls.push('feel'); } },
    ui: { frame() { calls.push('ui'); } },
  };
  assert.throws(() => runRenderUpdatePhase({ ...ctx, alpha: 1, frameDt: 1 / 60 }), error);
  assert.deepEqual(calls, ['prepare', 'vfx', 'draw', 'feel', 'ui']);
  assert.equal(reported.stage, 'render.draw');
  assert.equal(reported.cause, error);
  assert.match(error.message, /^\[render\.draw\]/);
  assert.equal(shouldReportRenderDisappearance({
    previouslyVisibleInCamera: true,
    inCamera: true,
    renderable: false,
    missSamples: 3,
    threshold: 3,
  }), true);
});
