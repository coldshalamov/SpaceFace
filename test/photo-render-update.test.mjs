import assert from 'node:assert/strict';
import test from 'node:test';

import { runRenderUpdatePhase } from '../src/core/renderUpdatePhase.js';
import { shouldFreezeFlightSubmit, shouldSkipFullTickSystems } from '../src/core/presentationFreeze.js';
import { createChaseCamera } from '../src/render/camera.js';
import { enterPhotoMode, exitPhotoMode } from '../src/ui/screens/pause.js';
import { POST_PROCESS_ROUTE, render as renderer } from '../src/render/renderer.js';

function pausedPhoto() {
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 7, mass: 20, maxSpeed: 120, flags: {}, data: {},
  };
  const state = {
    mode: 'paused', tick: 42, simTime: 0.7, timeScale: 0,
    playerId: 1, entities: new Map([[1, player]]), player: {},
    settings: { video: { fov: 50, bloom: true } },
    camera: { zoom: 144, tilt: 60, trauma: 0, focus: { x: 0, z: 0 } },
    input: { axes: { x: 0, z: 0 } },
    ui: { screenStack: ['pause'], docked: false },
    render: { renderer: { toneMappingExposure: 0.93 } },
  };
  const camera = createChaseCamera(state, { innerWidth: 1600, innerHeight: 900 });
  camera.snapToPlayer();
  let filter = null;
  state.render.renderGraph = { setPhotoFilters(next) { filter = next; } };
  const photo = enterPhotoMode(state);
  photo.inputX = 1;
  photo.exposure = 1.4;
  photo.filters = true;
  photo.filterLook = 'warm';
  const calls = [];
  let worldElapsed = 0;
  let ready = true;
  const render = {
    // The renderer seam receives a frozen world delta and separately follows its real camera.
    prepareFrame(alpha, worldDt, frame, cameraDt = worldDt) {
      calls.push(['prepare', worldDt, cameraDt, frame]);
      if (!ready) return false;
      worldElapsed += worldDt;
      camera.follow(cameraDt, alpha);
      return true;
    },
    drawPreparedFrame() { calls.push(['draw']); return true; },
  };
  const args = {
    state, render, alpha: 1, frameDt: 1 / 60, presentationFrame: { sequence: 1 },
    vfx: { update(dt) { calls.push(['vfx', dt]); } },
    feel: { frame(dt) { calls.push(['feel', dt]); } },
    ui: { frame(dt) { calls.push(['ui', dt]); } },
  };
  return { state, photo, camera, calls, args,
    get filter() { return filter; }, get worldElapsed() { return worldElapsed; },
    refusePrepare() { ready = false; } };
}

test('Pause → Photo presents camera controls through the render phase while the world holds', () => {
  const ctx = pausedPhoto();
  const before = ctx.camera.obj.position.clone();
  for (let i = 0; i < 3; i++) runRenderUpdatePhase(ctx.args);
  assert.ok(ctx.camera.obj.position.x > before.x, 'the production phase must reach the free camera');
  assert.equal(ctx.state.render.renderer.toneMappingExposure, 1.4);
  assert.deepEqual(ctx.filter, { enabled: true, look: 'warm' });
  assert.equal(ctx.calls.filter(([name]) => name === 'draw').length, 3);
  assert.equal(ctx.calls.filter(([name]) => name === 'vfx').length, 0);
  assert.deepEqual(ctx.calls.filter(([name]) => name === 'feel').map(([, dt]) => dt), [0, 0, 0]);
  assert.deepEqual(ctx.calls.filter(([name]) => name === 'ui').map(([, dt]) => dt),
    [ctx.args.frameDt, ctx.args.frameDt, ctx.args.frameDt]);
  for (const [name, worldDt, cameraDt, frame] of ctx.calls.filter(([name]) => name === 'prepare')) {
    assert.equal(worldDt, 0, name);
    assert.equal(cameraDt, ctx.args.frameDt);
    assert.equal(frame, ctx.args.presentationFrame);
  }
  assert.equal(ctx.worldElapsed, 0);
  assert.deepEqual([ctx.state.tick, ctx.state.simTime, ctx.state.timeScale], [42, 0.7, 0]);
  assert.equal(shouldFreezeFlightSubmit(ctx.state), true, 'Photo does not release the world freeze');
  assert.equal(shouldSkipFullTickSystems(ctx.state), true, 'Photo retains the simulation/input pause');

  exitPhotoMode(ctx.state);
  ctx.calls.length = 0;
  runRenderUpdatePhase(ctx.args);
  assert.deepEqual(ctx.calls.map(([name]) => name), ['feel', 'ui'], 'returning to Pause holds the last photo');
});

test('Photo cannot bypass a refused prepared frame or loading/sector/dock/modal ownership', () => {
  const refused = pausedPhoto();
  refused.refusePrepare();
  runRenderUpdatePhase(refused.args);
  assert.equal(refused.calls.some(([name]) => name === 'prepare'), true);
  assert.equal(refused.calls.some(([name]) => name === 'draw'), false);
  assert.equal(refused.state.camera.focus.x, 0);

  for (const configure of [
    state => { state.render.sectorShellAdmission = true; },
    state => { state.mode = 'loading'; state.render.sectorShellAdmission = true; },
    state => { state.ui.docked = true; },
    state => { state.ui.screenStack = ['galaxyMap']; },
    state => { state.ui.screenStack = ['station']; },
    state => { state.render.photoMode.active = false; },
  ]) {
    const ctx = pausedPhoto();
    configure(ctx.state);
    runRenderUpdatePhase(ctx.args);
    assert.deepEqual(ctx.calls.map(([name]) => name), ['feel', 'ui']);
  }

  const legacy = pausedPhoto();
  legacy.args.render = { renderFrame() { throw Error('Photo must use guarded prepare/draw'); } };
  runRenderUpdatePhase(legacy.args);
  assert.deepEqual(legacy.calls.map(([name]) => name), ['feel', 'ui']);
});

test('Photo exposure reaches the final post owners after held Nocturne exposure', () => {
  const writes = [];
  const scene = { updateMatrixWorld() {} };
  const photoMode = { active: true, exposure: 1.85 };
  const owner = {
    scene, state: { render: { photoMode } }, renderer: { toneMappingExposure: 0.93 },
    _postFrameOptions: { time: 0 },
    _nocturne: { exposure: 0.93, flush() { writes.push(['nocturne']); } },
    bloom: { setOptions(options) { writes.push(['bloom', options.exposure]); }, render() { return true; } },
    _renderGraph: { setOptions(options) { writes.push(['graph', options.exposure]); }, render() { return true; } },
    _unreadyDrawableGuard: { hide() { writes.push(['guard']); }, restore() { writes.push(['restore']); } },
  };
  const bag = owner._postFrameOptions;
  renderer._renderPostRoute.call(owner, POST_PROCESS_ROUTE.GRAPH, scene, {});
  assert.equal(owner.renderer.toneMappingExposure, 1.85);
  assert.deepEqual(writes, [['nocturne'], ['bloom', 1.85], ['graph', 1.85], ['guard'], ['restore']]);
  assert.equal(owner._nocturne.exposure, 0.93, 'Photo leaves held adaptation untouched');
  assert.equal(owner._postFrameOptions, bag, 'the existing frame options bag is reused');

  for (const [requested, expected] of [[99, 2.2], [-1, 0.35]]) {
    photoMode.exposure = requested;
    renderer._renderPostRoute.call(owner, POST_PROCESS_ROUTE.BLOOM, scene, {});
    assert.equal(owner.renderer.toneMappingExposure, expected);
  }

  for (const overrides of [{ exposure: NaN }, { active: false, exposure: 1.85 }]) {
    Object.assign(photoMode, { active: true }, overrides);
    // The next ordinary prepare keeps its existing world exposure authority after Photo exits.
    owner.renderer.toneMappingExposure = 0.93;
    writes.length = 0;
    renderer._renderPostRoute.call(owner, POST_PROCESS_ROUTE.GRAPH, scene, {});
    assert.equal(owner.renderer.toneMappingExposure, 0.93);
    assert.deepEqual(writes, [['nocturne'], ['guard'], ['restore']]);
  }
});
