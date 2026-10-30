// The berth stage is prepared during the docking approach, not under the station screen (D67).
//
// Before this contract the first docked frame built the berth — three props and the player's hull
// decoded, compiled, uploaded and shadow-baked on the main thread while the station screen was
// opening — and on the owner's Intel iGPU the first click after docking waited seconds behind it.
// These tests drive the real module with a stub renderer and a stub part loader and prove the
// ORDER: compile, upload and the warm-up draw all happen while `state.ui.dockInRange` is true and
// the game is still in flight; the docked request then adopts the warm stage and reports it live
// on its very first frame with no compile, no upload and no warm-up of its own.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EnergyBoltPool } from '../src/render/weapons/energyBoltPool.js';

import {
  presentUiStage,
  releaseUiStage,
  releaseUiStagePrewarm,
  retireUiStageForContextLoss,
  resumeUiStageAfterContextRestore,
  setUiStagePartLoaderForTest,
  tickUiStagePrewarm,
  uiStageReport,
  uiStageResident,
  warmUiStagePrewarm,
} from '../src/render/uiStage.js';
import { runRenderUpdatePhase } from '../src/core/renderUpdatePhase.js';

function stubRenderer(log) {
  let target = null;
  const clear = new THREE.Color(0, 0, 0);
  return {
    log,
    domElement: { isConnected: false },
    autoClear: true,
    shadowMap: { enabled: false },
    info: { programs: [] },
    render(scene) { log.push({ op: 'render', scene: scene.name || 'scene' }); },
    async compileAsync(scene) {
      log.push({ op: 'compile', scene: scene.name || 'scene' });
      // Three's own wait resolves on a later turn; keep that shape so ordering is real.
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    initTexture(texture) { log.push({ op: 'initTexture', name: texture.name }); },
    getSize(v) { return v.set(1280, 720); },
    getRenderTarget() { return target; },
    setRenderTarget(next) { target = next; },
    getClearColor(out) { return out.copy(clear); },
    getClearAlpha() { return 1; },
    setClearColor(color) { clear.set(color); },
  };
}

function stubPartLoader(log) {
  return async (url, options = {}) => {
    log.push({ op: 'load', url, slot: options.slot || null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.name = `map:${url}`;
    const material = new THREE.MeshStandardMaterial({ map: texture });
    return {
      primitives: [{
        name: `${url}#0`,
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material,
        matrix: new THREE.Matrix4(),
      }],
    };
  };
}

function flightState(log) {
  return {
    mode: 'flight',
    simTime: 0,
    ui: { dockInRange: true, docked: false, screenStack: [] },
    player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }] },
    settings: { video: { motionReduce: true } },
    render: {
      firstPlayableFrameAt: 1,
      // The renderer's present-sliced residency lane, as `state.render.prepareAuthoredGpuResidency`
      // publishes it: the prewarm must ride it instead of bursting initTexture on a timer.
      prepareAuthoredGpuResidency(subject) {
        const roots = Array.isArray(subject) ? subject : [subject];
        log.push({ op: 'residency', roots: roots.map((root) => root.name) });
        return Promise.resolve({ skipped: false, textures: roots.length });
      },
    },
  };
}

function ops(log, op) { return log.filter((entry) => entry.op === op); }

async function settle(predicate, label, tries = 400) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(uiStageReport())}`);
}

function reset() {
  releaseUiStage('test-reset');
  releaseUiStagePrewarm('test-reset');
  setUiStagePartLoaderForTest(null);
}

test('a title that finishes preparing under New Game defers its warm draw until Back', async (t) => {
  reset(); t.after(reset);
  const log = [];
  setUiStagePartLoaderForTest(stubPartLoader(log));
  const renderer = stubRenderer(log);
  let finishCompile;
  const compiling = new Promise(resolve => { finishCompile = resolve; });
  renderer.compileAsync = async scene => {
    log.push({ op: 'compile', scene: scene.name || 'scene' });
    await compiling;
  };
  const state = flightState(log);
  state.mode = 'menu';
  state.ui.stageRequest = { scene: 'title-field', hullDefId: 'ship_kestrel' };
  const render = { renderer };
  presentUiStage({ render, state });
  await settle(() => ops(log, 'compile').length === 1, 'title compile to start');

  // The player opens New Game while the title's async preparation is still linking.
  state.ui.stageRequest = null;
  state.ui.screenStack = ['mainMenu', 'newGame'];
  const drawsBefore = ops(log, 'render').length;
  finishCompile();
  await settle(() => uiStageReport().phase === 'live', 'covered title preparation');
  assert.equal(ops(log, 'render').length, drawsBefore,
    'a covered title must not submit its potentially blocking first-use draw');
  assert.equal(uiStageReport().marks.warmup, 0);

  state.ui.screenStack = ['mainMenu'];
  state.ui.stageRequest = { scene: 'title-field', hullDefId: 'ship_kestrel' };
  presentUiStage({ render, state });
  assert.equal(ops(log, 'compile').length, 1, 'Back reuses the prepared authored stage');
  assert.equal(ops(log, 'render').length, drawsBefore + 2, 'Back warms once then presents the title');
  assert.equal(uiStageReport().prepared.warm, true);
  presentUiStage({ render, state });
  assert.equal(ops(log, 'render').length, drawsBefore + 3, 'later frames need only the presented draw');
});

test('releasing a stage during prop admission does not start its hull load afterward', async (t) => {
  t.after(reset);
  const calls = [];
  const pending = [];
  setUiStagePartLoaderForTest((url, options) => {
    calls.push({ url, slot: options.slot });
    return new Promise((resolve) => pending.push(resolve));
  });
  const renderer = stubRenderer([]);
  const state = flightState([]);
  state.mode = 'menu';
  state.ui.stageRequest = { scene: 'berth', hullDefId: 'ship_kestrel' };
  presentUiStage({ render: { renderer }, state });
  await settle(() => calls.length === 3, 'the berth prop requests');

  releaseUiStage('test-release-during-props');
  for (const resolve of pending) resolve(null);
  for (let i = 0; i < 6; i++) await Promise.resolve();

  assert.equal(calls.length, 3, 'no hull request starts after the stage owner is released');
  assert.ok(calls.every((call) => call.slot === 'place'));
  assert.equal(uiStageResident(), false);
});

test('the berth is compiled, uploaded and warmed during the approach; the dock adopts it live on frame one', async (t) => {
  t.after(reset);
  const log = [];
  setUiStagePartLoaderForTest(stubPartLoader(log));
  const renderer = stubRenderer(log);
  const render = { renderer };
  const state = flightState(log);

  // Approach: the dock is in range, the game is in flight, nothing is docked.
  assert.equal(tickUiStagePrewarm({ render, state }), true, 'an in-range dock starts the prewarm');
  assert.equal(uiStageResident(), false, 'a prewarm is never a resident stage (flight would release it)');
  let report = uiStageReport();
  assert.equal(report.prewarm && report.prewarm.scene, 'berth');
  assert.equal(report.scene, null);

  await settle(() => uiStageReport().prewarm?.warmupPending === true, 'the prewarm to finish preparing');
  report = uiStageReport();
  assert.equal(report.prewarm.phase, 'live', 'props and hull are admitted whole before any dock');
  assert.equal(report.prewarm.prepared.lane, 'residency', 'uploads rode the renderer\'s present-sliced lane');
  assert.equal(ops(log, 'load').length, 4, 'three berth props and the hull were loaded on approach');
  assert.equal(ops(log, 'compile').length, 1, 'the stage compiled as one lit scene on approach');
  assert.equal(ops(log, 'residency').length, 1, 'one residency pass carried every admitted root');
  assert.equal(ops(log, 'initTexture').length, 0, 'no timer-burst uploads while flying');
  assert.equal(ops(log, 'render').length, 0, 'nothing is drawn until a flight frame asks for the warm-up');

  // A flight frame takes the warm-up draw; the world draw follows it in the same task.
  assert.equal(warmUiStagePrewarm({ render, state }), true);
  assert.equal(ops(log, 'render').length, 1, 'the warm-up is exactly one draw');
  assert.equal(uiStageReport().prewarm.warmupPending, false);
  assert.equal(uiStageReport().prewarm.prepared.warm, true);
  assert.equal(renderer.shadowMap.enabled, false, 'the warm-up hands the shadow flag back to flight');
  assert.equal(renderer.getRenderTarget(), null);
  assert.equal(warmUiStagePrewarm({ render, state }), false, 'a warm prewarm is not drawn again');

  // The dock. The station screen requests the berth for the ship the player flies.
  const marks = { compile: ops(log, 'compile').length, load: ops(log, 'load').length, render: ops(log, 'render').length };
  const statuses = [];
  state.ui.docked = true;
  state.ui.stageRequest = { scene: 'berth', hullDefId: 'ship_kestrel', onStatus: (status) => statuses.push(status) };
  assert.equal(presentUiStage({ render, state, frameDt: 1 / 60 }), true);

  report = uiStageReport();
  assert.equal(report.adopted, true, 'the docked request adopted the approach\'s stage');
  assert.equal(report.prewarm, null, 'the prewarm slot is handed over, not copied');
  assert.equal(uiStageResident(), true);
  assert.equal(report.hullDrawn, true, 'the hull is on the first docked frame');
  assert.deepEqual(statuses, ['live'], 'the screen is live on its first frame, never "loading"');
  assert.equal(ops(log, 'compile').length, marks.compile, 'no compile after dock:docked');
  assert.equal(ops(log, 'load').length, marks.load, 'no decode after dock:docked');
  assert.equal(ops(log, 'render').length, marks.render + 1, 'the docked frame is one draw: the picture, no warm-up');
  assert.ok(report.marks.adopted >= report.marks.warmup, 'the warm-up finished before the dock adopted the stage');
});

test('a docked request the prewarm cannot satisfy releases it and builds as before', async (t) => {
  t.after(reset);
  const log = [];
  setUiStagePartLoaderForTest(stubPartLoader(log));
  const renderer = stubRenderer(log);
  const render = { renderer };
  const state = flightState(log);

  tickUiStagePrewarm({ render, state });
  await settle(() => uiStageReport().prewarm?.warmupPending === true, 'the prewarm to finish preparing');
  warmUiStagePrewarm({ render, state });

  const statuses = [];
  state.ui.docked = true;
  // Shipworks borrows the bay for a hull the player does not fly.
  state.ui.stageRequest = { scene: 'berth', hullFile: 'wholeships/other_hull.glb', onStatus: (status) => statuses.push(status) };
  assert.equal(presentUiStage({ render, state, frameDt: 1 / 60 }), true);
  const report = uiStageReport();
  assert.equal(report.adopted, false);
  assert.equal(report.prewarm, null, 'a mismatched prewarm is released, not kept beside the stage');
  assert.equal(report.hullFile, 'wholeships/other_hull.glb');
  assert.deepEqual(statuses, ['loading'], 'the fresh build is honest about not being ready');
  await settle(() => uiStageReport().phase === 'live', 'the fresh berth to build');
  assert.equal(ops(log, 'load').filter((entry) => entry.url.endsWith('other_hull.glb')).length, 1);
});

test('the prewarm follows the approach: it starts in range, survives a brief drift out, and never outlives flight', async (t) => {
  t.after(reset);
  const log = [];
  setUiStagePartLoaderForTest(stubPartLoader(log));
  const renderer = stubRenderer(log);
  const render = { renderer };
  const state = flightState(log);

  state.ui.dockInRange = false;
  assert.equal(tickUiStagePrewarm({ render, state }), false, 'no dock near, no prewarm');
  assert.equal(uiStageReport().prewarm, null);

  state.ui.dockInRange = true;
  assert.equal(tickUiStagePrewarm({ render, state }), true);
  assert.equal(tickUiStagePrewarm({ render, state }), false, 'a live prewarm is kept, not rebuilt');
  await settle(() => uiStageReport().prewarm?.warmupPending === true, 'the prewarm to finish preparing');

  state.ui.dockInRange = false;
  for (let i = 0; i < 60; i++) tickUiStagePrewarm({ render, state });
  assert.ok(uiStageReport().prewarm, 'a one-second drift out of the gate keeps the warm stage');
  for (let i = 0; i < 700; i++) tickUiStagePrewarm({ render, state });
  assert.equal(uiStageReport().prewarm, null, 'an abandoned approach releases the stage after its grace');

  state.ui.dockInRange = true;
  assert.equal(tickUiStagePrewarm({ render, state }), true, 'coming back rebuilds from the caches');
  state.mode = 'loading';
  assert.equal(tickUiStagePrewarm({ render, state }), false);
  assert.equal(uiStageReport().prewarm, null, 'leaving flight (new game, sector load) drops the prewarm');
});

test('context loss abandons a pending berth prewarm without post-restore disposal', async (t) => {
  t.after(reset);
  let resolveLoad;
  const delayedLoad = new Promise(resolve => { resolveLoad = resolve; });
  const log = [];
  let disposeCalls = 0;
  const originalDispose = THREE.BufferGeometry.prototype.dispose;
  t.mock.method(THREE.BufferGeometry.prototype, 'dispose', function (...args) {
    disposeCalls++;
    return originalDispose.apply(this, args);
  });
  setUiStagePartLoaderForTest(async (url, options = {}) => {
    log.push({ op: 'load', url, slot: options.slot || null });
    return delayedLoad;
  });
  const renderer = stubRenderer(log);
  const render = { renderer };
  const state = flightState(log);

  assert.equal(tickUiStagePrewarm({ render, state }), true);
  await settle(() => ops(log, 'load').length > 0, 'prewarm package loads to start');
  const disposalsBeforeLoss = disposeCalls;

  assert.equal(retireUiStageForContextLoss(renderer), 1, 'the pending prewarm is retired by its owner');
  assert.equal(uiStageReport().prewarm, null);
  assert.equal(disposeCalls, disposalsBeforeLoss,
    'context loss abandons old-context stage geometry instead of dispatching dispose callbacks');
  assert.equal(tickUiStagePrewarm({ render, state }), false,
    'the flight frame cannot recreate prewarm work while restore is pending');

  resolveLoad({ primitives: [{
    name: 'late-prop', geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial(), matrix: new THREE.Matrix4(),
  }] });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(ops(log, 'load').some(entry => entry.slot === 'hull'), false,
    'retired pending props do not start the hull leg after their await settles');
  assert.equal(uiStageReport().prewarm, null);

  resumeUiStageAfterContextRestore(renderer);
  assert.equal(tickUiStagePrewarm({ render, state }), true,
    'the owner accepts new prewarm work after complete context recovery');
});

test('loss of a replaced renderer does not suspend or retire the replacement renderer stage', async (t) => {
  t.after(reset);
  let resolveLoad;
  const delayedLoad = new Promise(resolve => { resolveLoad = resolve; });
  const log = [];
  setUiStagePartLoaderForTest(async (url, options = {}) => {
    log.push({ op: 'load', url, slot: options.slot || null });
    return options.slot === 'place' ? delayedLoad : null;
  });
  const oldRenderer = stubRenderer(log);
  const newRenderer = stubRenderer(log);
  const oldRender = { renderer: oldRenderer };
  const newRender = { renderer: newRenderer };
  const state = flightState(log);

  assert.equal(tickUiStagePrewarm({ render: oldRender, state }), true);
  await settle(() => ops(log, 'load').length > 0, 'old renderer prewarm load to start');
  assert.equal(retireUiStageForContextLoss(oldRenderer), 1);

  assert.equal(tickUiStagePrewarm({ render: newRender, state }), true,
    'replacement renderer can start its own prewarm while the old context remains lost');
  await settle(() => ops(log, 'load').filter(entry => entry.slot === 'place').length >= 2,
    'replacement renderer props load to start');

  assert.equal(retireUiStageForContextLoss(oldRenderer), 0,
    'a late old-renderer loss cannot retire replacement-owned stage data');
  assert.ok(uiStageReport().prewarm, 'replacement stage remains cached');
  assert.equal(tickUiStagePrewarm({ render: oldRender, state }), false,
    'the old renderer remains suspended until its own successful restore');
  assert.ok(uiStageReport().prewarm, 'an old-renderer flight frame leaves replacement cache intact');

  resolveLoad({ primitives: [{
    name: 'replacement-prop', geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial(), matrix: new THREE.Matrix4(),
  }] });
  await settle(() => ops(log, 'load').filter(entry => entry.slot === 'hull').length >= 1,
    'only the active replacement owner advances to its hull load');
  assert.ok(uiStageReport().prewarm, 'replacement stage survives completion of old async work');
  resumeUiStageAfterContextRestore(oldRenderer);
});

test('late live-stage completion releases its CPU owners without old-context dispose events', async (t) => {
  t.after(reset);
  let lost = false;
  const pending = [];
  const poolDisposals = [];
  const gpuDisposeEvents = [];
  const originalPoolDispose = EnergyBoltPool.prototype.dispose;
  const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
  const originalMaterialDispose = THREE.Material.prototype.dispose;
  t.mock.method(EnergyBoltPool.prototype, 'dispose', function (options) {
    poolDisposals.push(options);
    return originalPoolDispose.call(this, options);
  });
  t.mock.method(THREE.BufferGeometry.prototype, 'dispose', function (...args) {
    if (lost) gpuDisposeEvents.push(new Error('geometry dispose').stack);
    return originalGeometryDispose.apply(this, args);
  });
  t.mock.method(THREE.Material.prototype, 'dispose', function (...args) {
    if (lost) gpuDisposeEvents.push(new Error('material dispose').stack);
    return originalMaterialDispose.apply(this, args);
  });
  setUiStagePartLoaderForTest(async () => {
    if (lost) return null;
    return new Promise(resolve => pending.push(resolve));
  });
  const log = [];
  const renderer = stubRenderer(log);
  const state = flightState(log);
  state.mode = 'menu';
  state.ui.stageRequest = { scene: 'title-attract' };

  assert.equal(presentUiStage({ render: { renderer }, state }), true);
  await settle(() => pending.length > 0, 'the live title hull decode to begin');
  lost = true;
  assert.equal(retireUiStageForContextLoss(renderer), 1);
  resumeUiStageAfterContextRestore(renderer);
  for (const resolve of pending.splice(0)) resolve(null);

  await settle(() => poolDisposals.length === 1, 'late title content CPU disposal');
  assert.equal(poolDisposals[0]?.disposeGpu, false,
    'late live owners still run their disposer with GPU teardown disabled');
  assert.equal(gpuDisposeEvents.length, 0, `no old-context resource dispatches dispose after restore boundary: ${gpuDisposeEvents.slice(0, 2).join('\n---\n')}`);
});

test('the presentation frame warms the prewarm directly ahead of the world draw, in the same task', async (t) => {
  t.after(reset);
  t.mock.method(console, 'error', () => {});
  const log = [];
  setUiStagePartLoaderForTest(stubPartLoader(log));
  const renderer = stubRenderer(log);
  const calls = [];
  const render = {
    renderer,
    prepareFrame() { calls.push('prepare'); return true; },
    drawPreparedFrame() { calls.push('draw'); },
  };
  renderer.render = (scene) => { calls.push(`stage-warmup:${scene.name || 'scene'}`); log.push({ op: 'render' }); };
  const state = flightState(log);
  const frame = () => runRenderUpdatePhase({
    state, render, vfx: { update() { calls.push('vfx'); } }, feel: null, ui: null, alpha: 1, frameDt: 1 / 60,
  });

  frame(); // the approach frame starts the prewarm
  assert.ok(uiStageReport().prewarm, 'the flight branch started the prewarm');
  assert.deepEqual(calls, ['prepare', 'vfx', 'draw'], 'starting the prewarm draws nothing');
  await settle(() => uiStageReport().prewarm?.warmupPending === true, 'the prewarm to finish preparing');

  calls.length = 0;
  frame();
  assert.deepEqual(calls, ['prepare', 'vfx', 'stage-warmup:scene', 'draw'],
    'the warm-up draw is taken right before the world draw, which overwrites it before any present');
  calls.length = 0;
  frame();
  assert.deepEqual(calls, ['prepare', 'vfx', 'draw'], 'one warm-up, then flight frames are untouched');

  // The docked frame adopts it: the frozen branch draws the stage once, no warm-up.
  state.ui.docked = true;
  const statuses = [];
  state.ui.stageRequest = { scene: 'berth', hullDefId: 'ship_kestrel', onStatus: (status) => statuses.push(status) };
  calls.length = 0;
  assert.equal(frame(), false, 'docked presentation does not acknowledge a world frame');
  assert.deepEqual(calls, ['stage-warmup:scene'], 'exactly one stage draw on the docked frame');
  assert.deepEqual(statuses, ['live']);
  assert.equal(uiStageReport().adopted, true);
});
