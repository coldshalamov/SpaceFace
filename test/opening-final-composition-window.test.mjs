import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import * as THREE from 'three';
import { render, releaseOpeningGraphPublication } from '../src/render/renderer.js';
import { createOpeningLoadingAdmission } from '../src/render/pipelineReadiness.js';
import { waitForOpeningCompositionSettled, buildAuthoredStationArchetype, enqueueBoundaryUpgrade,
  pumpAuthoredUpgradeQueue, cancelAuthoredUpgradeQueue, describeAuthoredUpgradeQueue,
  isInitialAuthoredCompositionEntity } from '../src/render/partsLibrary.js';
import { openingLoadPolicy } from '../src/render/openingLoadPolicy.js';
import { prepareStartupGpuResidency as prepareRealStartupGpuResidency } from '../src/render/startupGpuResidency.js';

// Execute the actual final composition handoff without constructing a GPU. The broad cook
// has spent its work allowance; a completed boundary still needs two fresh observations.
const source = readFileSync(process.env.ENTRY_SOURCE_RENDERER || new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const start = source.indexOf('let finalOpening = opening;');
const result = 'return { skipped: false, resumed, opening: finalOpening, upgrades, pending, cook, leftover };';
const end = source.indexOf(result, start);
assert.ok(start > 0 && end > start);
const body = source.slice(start, end + result.length);

function fixture({ status = 'authored', supersede = false, overrides = {} } = {}) {
  const player = { id: 1, isPlayer: true, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, mesh: { userData: { authoredAssetState: status } } };
  const state = { mode: 'loading', playerId: 1, entities: new Map([[1, player]]),
    entityList: [player], render: {}, world: { currentSectorId: 'test' } };
  const owner = {}, observations = [];
  let stale = false, yields = 0;
  const values = {
    state, opening: { settled: false, reason: 'timeout', pending: 1 }, recook: false,
    cookStale: () => stale, cookSuperseded: { skipped: true, reason: 'sector-superseded' },
    prepareNow: () => 30000, remainingMs: () => 400,
    loadPolicy: openingLoadPolicy({ shouldAwaitGpuCook: true, mode: 'loading' }),
    waitForOpeningCompositionSettled: (live, options) => waitForOpeningCompositionSettled(live, {
      ...options, request: () => { observations.push(status); return { requested: 0, ids: [] }; },
      pump() {},
    }),
    yieldAndFlushLiveSectorGpu: async () => {
      yields++;
      await delay(500); // A slow presented loading frame, not unfinished authored work.
      if (supersede) stale = true;
    },
    renderer: {}, scene: {}, meshes: new Map(), sectorId: 'test',
    recordOpeningCookStep() {}, console: { info() {}, warn() {} },
    resumed: true, upgrades: {}, pending: {}, cook: {}, leftover: {},
  };
  // Renderer methods access their captured state through this.
  Object.assign(values, {
    survivalRunHoldsArena: () => false, openingGateBudgetMs: () => 20000,
    prepareStartupGpuResidency: async () => ({ skipped: false }),
    residencyPolicy: () => ({}), createSlicedYield: fn => fn,
    yieldToBrowser: values.yieldAndFlushLiveSectorGpu,
    pacedFrameSpend: () => 0, PACED_FRAME_BUDGET_MS: 8,
    notePacedFrameSpend() {}, recordAuthoredAdmissionBlockingSlice() {},
  });
  Object.assign(values, overrides);
  owner.prepareOpeningFirstPicture = async () => true;
  owner._parkBoundedWarmRoots = () => ({ roots: 0, nodes: 0 });
  owner._meshes = values.meshes;
  const run = new Function(...Object.keys(values), `return async function() { ${body} };`)(...Object.values(values)).bind(owner);
  return { run, owner, state, observations, get yields() { return yields; } };
}

test('a completed opening gets both final observations after the broad cook allowance is spent', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.opening.settled, true, JSON.stringify(result.opening));
  assert.equal(f.observations.length, 2, 'a slow frame cannot replace the second fresh observation');
  assert.equal(f.yields, 1);
  assert.equal(f.state.render.sessionLiveSectorCookedId, 'test');
});

test('a missing boundary remains refused instead of turning a larger final window into admission', async () => {
  const f = fixture({ status: 'missing' });
  const result = await f.run();
  assert.equal(result.opening.settled, false);
  assert.equal(result.opening.pending, 1);
  assert.equal(f.state.render.sessionLiveSectorCookedId, undefined);
});

test('replacement during the final observation cannot stamp the new run', async () => {
  const f = fixture({ supersede: true });
  const result = await f.run();
  assert.equal(result.reason, 'sector-superseded');
  assert.equal(f.owner._sessionLiveSectorCookedId, undefined);
  assert.equal(f.state.render.openingCompositionSettle, undefined);
});


function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

// Real queue, real authored station publication, real first-picture owner and composition wait.
// GPU work is inert here: the test addresses the ordering of a late decode and its actual gate.
function queuedPublicationFixture() {
  const priorWindow = globalThis.window;
  const scene = new THREE.Scene(), renderer = {};
  const player = { id: 1, isPlayer: true, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, mesh: new THREE.Group() };
  player.mesh.userData.authoredAssetState = 'authored'; scene.add(player.mesh);
  const entity = { id: 2, type: 'station', alive: true, radius: 34, pos: { x: 200, z: 0 },
    data: { stationId: 'station_ceres', placeId: 'place_station_trade_hub', dockRadius: 72 } };
  const state = { mode: 'loading', playerId: 1, entities: new Map([[1, player], [2, entity]]),
    entityList: [player, entity], world: { enterSerial: 1, currentSectorId: 'test' },
    render: { renderer, admissionRunGeneration: 1, openingSubmissionReceipt: { prior: true } },
    camera: { zoom: 144 } };
  globalThis.window = { SF: { state } };
  const cohort = createOpeningLoadingAdmission({ entities: state.entityList,
    isRequired: e => isInitialAuthoredCompositionEntity(e, state) });
  state.render.isRequiredOpeningEntity = e => cohort.owns(e);
  state.render.trackOpeningLoadingWork = (_e, work) => cohort.track(work);
  const lateDecode = deferred(), firstDecode = deferred();
  const record = { url: 'assets/ships/release/parts/places/place_station_trade_hub.glb',
    assetId: 'place_station_trade_hub', slot: 'place', bounds: { size: [28, 18, 28], center: [0, 0, 0] },
    primitives: [{ key: 'lod0:station', name: 'LOD0_Station', geometry: new THREE.BoxGeometry(28, 18, 28),
      material: new THREE.MeshStandardMaterial(), matrix: new THREE.Matrix4(), tags: { lod: 'lod0' } }], markers: [] };
  const boundary = buildAuthoredStationArchetype(entity, { releaseMode: true,
    loadAuthoredPart: () => lateDecode.promise.then(() => record) });
  entity.mesh = boundary; boundary.position.set(200, 0, 0);
  // Pending zero-draw roots are not part of the exact visible-picture promise set.
  boundary.visible = false; scene.add(boundary);
  const firstBoundary = new THREE.Group(); scene.add(firstBoundary);
  const optional = { id: 99, type: 'ship', alive: true, pos: { x: 10000, z: 0 } };
  state.entities.set(99, optional);
  const first = enqueueBoundaryUpgrade(scene, { key: 'first-cohort-member', boundary: firstBoundary,
    entity: optional, renderer, options: { overlapAuthoredPipelineCompile: true },
    run: () => firstDecode.promise.then(() => true) });
  const second = boundary.userData.requestAuthoredUpgrade(renderer, scene);
  pumpAuthoredUpgradeQueue(scene);
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 1000);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const owner = Object.create(render);
  Object.assign(owner, { state, renderer, scene, cam: { obj: camera },
    _meshes: new Map([[1, player.mesh], [2, boundary]]), _shipAuxPool: { pendingGrowth: null },
    _openingLoadingAdmission: cohort, _envMap: {}, _envMapSource: 'reflection-cards',
    _foundryEnvTexture: null, _rendererGeneration: 1, _contextRecovery: { generation: 1 } });
  const captures = [];
  owner._publishOpeningFirstPictureSteps = function* () {
    captures.push(boundary.userData.hull?.uuid); return true;
  };
  owner._parkBoundedWarmRoots = () => ({ roots: 0, nodes: 0 });
  owner._selectPostRoute = () => null;
  const events = [];
  const values = { state, opening: { settled: false, reason: 'timeout', pending: 1 }, recook: false,
    cookStale: () => false, cookSuperseded: { skipped: true, reason: 'sector-superseded' },
    prepareNow: () => performance.now(), remainingMs: () => 400,
    loadPolicy: { ...openingLoadPolicy({ shouldAwaitGpuCook: true, mode: 'loading' }), compositionSettleMs: 500 },
    waitForOpeningCompositionSettled, yieldAndFlushLiveSectorGpu: () => delay(2),
    renderer, scene, sectorId: 'test', recordOpeningCookStep() {},
    console: { info() {}, warn() {} }, resumed: true, upgrades: {}, pending: {}, cook: {}, leftover: {},
    survivalRunHoldsArena: () => false, openingGateBudgetMs: () => 1000,
    releaseOpeningGraphPublication, ownsFirstPictureBarrier: true,
    prepareStartupGpuResidency: async () => { events.push(['residency', boundary.userData.hull.uuid]); return { skipped: false }; },
    residencyPolicy: () => ({}), createSlicedYield: fn => fn, yieldToBrowser: () => delay(2),
    pacedFrameSpend: () => 0, PACED_FRAME_BUDGET_MS: 8,
    notePacedFrameSpend() {}, recordAuthoredAdmissionBlockingSlice() {},
    *buildOpeningSubmissionPlanSteps() {
      const leaf = boundary.userData.hull.uuid;
      events.push(['plan', leaf]); return { complete: true, leaf };
    },
    stampProducerReceipt() {}, POST_PROCESS_ROUTE: { BLOOM: 'bloom', GRAPH: 'graph' },
    *createOpeningSubmissionReceiptSteps(_renderer, plan) { events.push(['receipt', plan.leaf]); return { leaf: plan.leaf }; },
  };
  const evaluate = code => new Function(...Object.keys(values), `return async function() { ${code} };`)(...Object.values(values)).bind(owner);
  const provisionalStart = source.indexOf('if (ownsFirstPictureBarrier) {');
  const provisionalEnd = source.indexOf('if (this._rosterPrewarmPending', provisionalStart);
  assert.ok(provisionalStart > 0 && provisionalEnd > provisionalStart);
  const provisional = evaluate('let firstPictureError = null;' + source.slice(provisionalStart, provisionalEnd)
    + 'if (firstPictureError) throw new Error(firstPictureError);');
  return { owner, state, entity, boundary, first, second, firstDecode, lateDecode, captures, events,
    provisional, final: evaluate(body),
    close() {
      releaseOpeningGraphPublication(owner); lateDecode.resolve(); firstDecode.resolve();
      cancelAuthoredUpgradeQueue(scene); globalThis.window = priorWindow;
    } };
}

test('late required publication settles before exact picture reseal and plan recapture', async () => {
  const f = queuedPublicationFixture();
  try {
    await flush();
    assert.equal(isInitialAuthoredCompositionEntity(f.entity, f.state), true);
    assert.equal(f.owner._openingFirstPictureUpgradePromises().length, 0);
    const provisional = f.provisional(); await flush();
    f.firstDecode.resolve(); await f.first; await provisional;
    assert.equal(f.state.render.openingGraphPublicationFrozen, false,
      'a provisional census cannot freeze the broader composition it still waits for');
    const before = f.boundary.userData.hull.uuid;
    f.lateDecode.resolve();
    const result = await f.final();
    assert.equal(result.opening.settled, true);
    assert.equal((await f.second).result, true);
    assert.equal(f.boundary.userData.authoredAssetState, 'authored');
    assert.equal(describeAuthoredUpgradeQueue(f.owner.scene).compiling, 0);
    const finalLeaf = f.boundary.userData.hull.uuid;
    assert.notEqual(finalLeaf, before, 'the real authored subtree replaced its pending root');
    assert.equal(f.captures.at(-1), finalLeaf, 'exact picture was republished after that replacement');
    assert.equal(f.state.render.openingGraphPublicationFrozen, true, 'final graph remains protected until reveal');
    assert.deepEqual(f.events, [['residency', finalLeaf], ['plan', finalLeaf], ['receipt', finalLeaf]]);
    assert.equal(f.state.render.openingSubmissionReceipt.leaf, finalLeaf);
  } finally { f.close(); }
});


// Use the real residency helper with a GPU-free renderer. The actual final-seal branch
// supplies the guards; initTexture/render record the native work that was allowed to run.
function residencyRenderer() {
  const previousTarget = { name: 'prior-target' };
  let target = previousTarget;
  const calls = { textures: 0, draws: 0 };
  const renderer = {
    autoClear: true, xr: { enabled: true }, shadowMap: { autoUpdate: true, needsUpdate: true },
    info: { memory: { geometries: 0 } },
    initTexture() { calls.textures++; },
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    render() { calls.draws++; },
  };
  return { renderer, calls, previousTarget, currentTarget: () => target };
}
function residencyScene({ textures = 0, geometries = 1 } = {}) {
  const scene = new THREE.Scene();
  for (let index = 0; index < geometries; index++) {
    const material = new THREE.MeshBasicMaterial();
    if (textures > 0) material.map = new THREE.Texture();
    if (textures > 1) material.alphaMap = new THREE.Texture();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  }
  return scene;
}
function finalResidencyFixture(overrides) {
  const rows = [];
  const f = fixture({ overrides: {
    yieldAndFlushLiveSectorGpu: async () => {}, yieldToBrowser: async () => {},
    prepareStartupGpuResidency: prepareRealStartupGpuResidency,
    recordOpeningCookStep: (...row) => rows.push(row), ...overrides,
  } });
  return { ...f, rows };
}
function assertNoFinalAcceptance(f) {
  assert.equal(f.owner._sessionLiveSectorCookedId, undefined);
  assert.equal(f.state.render.sessionLiveSectorCookedId, undefined);
  assert.equal(f.state.render.openingSubmissionPlan, undefined);
  assert.equal(f.rows.some(row => row[1] === 'live.finalPictureSeal' && row[3] === 'resolved'), false);
}

test('final residency cancellation at its yield stops the real helper before any upload', async () => {
  const h = residencyRenderer(); let cancelled = false;
  const f = finalResidencyFixture({ renderer: h.renderer, scene: residencyScene({ textures: 1 }),
    cookStale: () => cancelled, yieldToBrowser: async () => { cancelled = true; } });
  const result = await f.run();
  assert.equal(result.reason, 'sector-superseded');
  assert.deepEqual(h.calls, { textures: 0, draws: 0 });
  assertNoFinalAcceptance(f);
});

test('replacement between textures in one final-residency batch cannot submit the second upload', async () => {
  const h = residencyRenderer(), replacement = { token: 'replacement-render-owner' };
  let f, originalRender;
  h.renderer.initTexture = () => { h.calls.textures++; f.state.render = replacement; };
  f = finalResidencyFixture({ renderer: h.renderer, scene: residencyScene({ textures: 2 }),
    cookStale: () => f.state.render !== originalRender,
    residencyPolicy: () => ({ textureBatch: { textureBatchCount: 2 } }) });
  originalRender = f.state.render;
  const result = await f.run();
  assert.equal(result.reason, 'sector-superseded');
  assert.equal(h.calls.textures, 1, 'beforeSubmit fences each upload even inside a shared batch');
  assert.equal(h.calls.draws, 0);
  assert.deepEqual(replacement, { token: 'replacement-render-owner' });
  assertNoFinalAcceptance(f);
});

test('final geometry cancellation stops later real batches and restores renderer state', async () => {
  const h = residencyRenderer(); let cancelled = false, guardedOptions;
  h.renderer.render = () => { h.calls.draws++; cancelled = true; };
  const f = finalResidencyFixture({ renderer: h.renderer, scene: residencyScene({ geometries: 2 }),
    cookStale: () => cancelled, residencyPolicy: () => ({ geometryBatchDrawables: 1 }),
    prepareStartupGpuResidency: (renderer, scene, options) => {
      guardedOptions = options;
      return prepareRealStartupGpuResidency(renderer, scene, options);
    } });
  const result = await f.run();
  assert.equal(result.reason, 'sector-superseded');
  assert.equal(h.calls.draws, 1);
  assert.equal(typeof guardedOptions.isActive, 'function');
  assert.equal(guardedOptions.isActive(), false);
  assert.strictEqual(h.currentTarget(), h.previousTarget);
  assert.equal(h.renderer.autoClear, true);
  assert.equal(h.renderer.xr.enabled, true);
  assert.deepEqual(h.renderer.shadowMap, { autoUpdate: true, needsUpdate: true });
  assertNoFinalAcceptance(f);
});

for (const kind of ['partial', 'context-lost', 'geometry-context-lost', 'unsupported-geometry', 'geometry-partial']) {
  test(`the actual final residency branch refuses ${kind} without a success stamp`, async () => {
    const h = residencyRenderer(); let actual;
    const scene = residencyScene({ textures: kind === 'partial' || kind.includes('context-lost') ? 1 : 0 });
    let contextLost = kind === 'context-lost';
    if (kind.includes('context-lost')) {
      h.renderer.getContext = () => ({ getExtension: () => null, isContextLost: () => contextLost, finish() {} });
      if (kind === 'geometry-context-lost') h.renderer.initTexture = () => { h.calls.textures++; contextLost = true; };
    }
    if (kind === 'unsupported-geometry') delete h.renderer.render;
    const f = finalResidencyFixture({ renderer: h.renderer, scene,
      prepareStartupGpuResidency: async (renderer, root, options) => {
        actual = kind === 'geometry-partial' ? { skipped: false, geometryResidency: { partial: true } }
          : await prepareRealStartupGpuResidency(renderer, root,
            kind === 'partial' ? { ...options, deadlineMs: 0 } : options);
        return actual;
      } });
    await assert.rejects(f.run(), /Required final opening GPU residency did not complete/);
    if (kind === 'partial') assert.equal(actual.partial, true, 'real deadline result is partial');
    if (kind === 'context-lost') assert.equal(actual.contextLost, true, 'real texture submit reports lost context');
    if (kind === 'geometry-context-lost') assert.equal(actual.geometryResidency.contextLost, true);
    if (kind === 'unsupported-geometry') assert.equal(actual.geometryResidency.reason, 'render-target render unavailable');
    assert.equal(f.rows.some(row => row[1] === 'live.finalPictureSeal' && row[3] === 'error'), true);
    assertNoFinalAcceptance(f);
  });
}

test('final residency accepts the real no-drawable result as the exact admission owner does', async () => {
  const h = residencyRenderer(); let actual;
  const f = finalResidencyFixture({ renderer: h.renderer, scene: new THREE.Scene(),
    prepareStartupGpuResidency: async (...args) => { actual = await prepareRealStartupGpuResidency(...args); return actual; } });
  assert.equal((await f.run()).opening.settled, true);
  assert.equal(actual.geometryResidency.skipped, true);
  assert.equal(actual.geometryResidency.reason, 'no drawable geometry');
  assert.deepEqual(h.calls, { textures: 0, draws: 0 });
  assert.equal(f.owner._sessionLiveSectorCookedId, 'test');
});
