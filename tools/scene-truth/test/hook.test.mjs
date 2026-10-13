import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { installDiagnostics } from '../../../src/render/diagnostics.js';
import { runRenderUpdatePhase } from '../../../src/core/renderUpdatePhase.js';
import { frameIsGpuPayload, hookInstallsOverlay, publishSceneTruthFrame, sceneTruthFrameFromSamples } from '../lib/hook.mjs';
import { repoPath } from '../lib/root.mjs';

test('the scene-truth hook does not draw and does not install an overlay', () => {
  const frame = sceneTruthFrameFromSamples([
    { objectId: 'entity:1', visible: true, packageKey: 'kestrel', lodLevel: 'lod0', renderOrder: 22 },
  ], { tick: 4, seed: 47, zoom: 144, qualityTier: 'medium' });
  assert.equal(frame.overlay, false);
  assert.equal(frame.draws, false);
  assert.equal(frame.gpuFrame, false);
  assert.equal(frameIsGpuPayload({ captureKind: 'gpu-frame', frameCapture: { format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' } }), false);
  const png = { format: 'png', bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) };
  assert.equal(frameIsGpuPayload({ captureKind: 'gpu-frame', frameCapture: png }), true);
  const built = sceneTruthFrameFromSamples([{ objectId: 'entity:1', visible: true }], {
    captureKind: 'gpu-frame',
    frameCapture: png,
    tick: 3,
  });
  assert.equal(built.gpuFrame, true);
  assert.equal(built.captureKind, 'gpu-frame');
  globalThis.__SF_SCENE_TRUTH_WITNESS__ = true;
  const published = publishSceneTruthFrame([{ objectId: 'entity:1', shieldGeometryRadius: 14 }], {
    captureKind: 'gpu-frame',
    frameCapture: png,
    tick: 4,
  });
  assert.equal(published.gpuFrame, true);
  assert.equal(globalThis.__SF_SCENE_TRUTH_FRAME__.gpuFrame, true);
  globalThis.__SF_SCENE_TRUTH_WITNESS__ = false;
  assert.equal(publishSceneTruthFrame([], { frameCapture: png, captureKind: 'gpu-frame' }), null);
  assert.equal(frame.objectCount, 1);
  assert.equal(hookInstallsOverlay(), false);
  const source = fs.readFileSync(repoPath('tools/scene-truth/lib/hook.mjs'), 'utf8');
  assert.equal(source.includes('document.createElement'), false);
  assert.equal(source.includes('innerHTML'), false);
  const cli = fs.readFileSync(repoPath('tools/scene-truth/cli.mjs'), 'utf8');
  assert.equal(cli.includes('check-visual-regression'), false);
  const renderer = fs.readFileSync(repoPath('src/render/renderer.js'), 'utf8');
  assert.match(renderer, /if \(this\.drawPreparedFrame\(\) === true\) publishSceneTruthPlayStep\(this\);/);
  const phase = fs.readFileSync(repoPath('src/core/renderUpdatePhase.js'), 'utf8');
  assert.match(phase, /const submitted = render\.drawPreparedFrame\(\);\s*if \(submitted === true\) publishSceneTruthPlayStep\(render\);/);
});

test('the play update publishes after a submitted draw and skips a draw that returns early', () => {
  globalThis.__SF_SCENE_TRUTH_WITNESS__ = true;
  delete globalThis.__SF_SCENE_TRUTH_FRAME__;
  const state = {
    mode: 'flight',
    tick: 8,
    meta: { seed: 3 },
    render: { sceneTruthFrameCapture: { format: 'png', bytes: new Uint8Array([137, 80, 78, 71]) } },
    entityList: [{ id: 1, alive: true, pos: { x: 1, z: 2 }, radius: 14, shieldMax: 55, data: {} }],
  };
  const render = {
    state,
    prepareFrame() { return true; },
    drawPreparedFrame() { return true; },
  };
  const submitted = runRenderUpdatePhase({ state, render, alpha: 1, frameDt: 1 / 60 });
  assert.equal(submitted, true);
  assert.equal(globalThis.__SF_SCENE_TRUTH_FRAME__.gpuFrame, true);
  assert.equal(globalThis.__SF_SCENE_TRUTH_FRAME__.objects[0].shieldGeometryRadius, 14);

  delete globalThis.__SF_SCENE_TRUTH_FRAME__;
  render.drawPreparedFrame = () => false;
  runRenderUpdatePhase({ state, render, alpha: 1, frameDt: 1 / 60 });
  assert.equal(globalThis.__SF_SCENE_TRUTH_FRAME__, undefined);

  delete globalThis.__SF_SCENE_TRUTH_FRAME__;
  state.render.sceneTruthFrameCapture = { format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
  render.drawPreparedFrame = () => true;
  runRenderUpdatePhase({ state, render, alpha: 1, frameDt: 1 / 60 });
  assert.equal(globalThis.__SF_SCENE_TRUTH_FRAME__.gpuFrame, false);
  globalThis.__SF_SCENE_TRUTH_WITNESS__ = false;
  delete globalThis.__SF_SCENE_TRUTH_FRAME__;
});

test('existing diagnostics expose counters and not object ids', () => {
  const renderer = {
    info: {
      autoReset: true,
      render: { calls: 3, triangles: 9, points: 0, lines: 0 },
      memory: { geometries: 1, textures: 1 },
      programs: [],
      reset() {
        this.render.calls = 0;
      },
    },
  };
  const diag = installDiagnostics(renderer);
  diag.update(0.016);
  const report = diag.getReport();
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'objects'), false);
  assert.equal(typeof report.render.calls, 'number');
  diag.dispose();
});
