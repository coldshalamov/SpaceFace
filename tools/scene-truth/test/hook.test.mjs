import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { installDiagnostics } from '../../../src/render/diagnostics.js';
import { createShieldBubble } from '../../../src/render/ships/shipKit.js';
import { createShipAuxPool, syncShipAuxPools } from '../../../src/render/renderer.js';
import { runRenderUpdatePhase } from '../../../src/core/renderUpdatePhase.js';
import { liveShieldGeometryRadius } from '../lib/shieldShell.mjs';
import {
  frameIsGpuPayload,
  hookInstallsOverlay,
  publishSceneTruthFrame,
  publishSceneTruthPlayStep,
  sceneTruthFrameFromSamples,
  sceneTruthSamplesFromRenderer,
  sceneTruthSamplesFromState,
} from '../lib/hook.mjs';
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
  const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const xmlBytes = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>');
  assert.equal(frameIsGpuPayload({ captureKind: 'gpu-frame', frameCapture: { bytes: svgBytes } }), false);
  assert.equal(frameIsGpuPayload({ captureKind: 'gpu-frame', frameCapture: { bytes: xmlBytes } }), false);
  assert.equal(frameIsGpuPayload({
    captureKind: 'gpu-frame',
    frameCapture: { bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) },
  }), true);
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
    entityList: [{
      id: 1, alive: true, pos: { x: 1, z: 2 }, radius: 14, shield: 40, shieldMax: 55, data: {},
    }],
  };
  const render = {
    state,
    _meshes: new Map([[1, {
      visible: true, material: { depthTest: true }, userData: { shieldBubble: {
        visible: true, matrixWorld: { elements: [14, 0, 0, 0, 0, 14, 0, 0, 0, 0, 14, 0, 0, 0, 0, 1] },
      } },
    }]]),
    prepareFrame() { return true; },
    drawPreparedFrame() { return true; },
  };
  const submitted = runRenderUpdatePhase({ state, render, alpha: 1, frameDt: 1 / 60 });
  assert.equal(submitted, true);
  assert.equal(globalThis.__SF_SCENE_TRUTH_FRAME__.gpuFrame, true);
  assert.equal(globalThis.__SF_SCENE_TRUTH_FRAME__.sampleSource, 'render-roots');
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

test('an unarmed shipping hook does not read state or enumerate entities', () => {
  globalThis.__SF_SCENE_TRUTH_WITNESS__ = false;
  const renderer = { get state() { throw new Error('unarmed state read'); } };
  assert.equal(publishSceneTruthPlayStep(renderer), null);
});

test('armed samples follow visible roots and submitted pooled shell scale', () => {
  globalThis.__SF_SCENE_TRUTH_WITNESS__ = true;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const bubble = createShieldBubble('#5fd0ff', 5.88);
  root.add(bubble); scene.add(root); root.userData.shieldBubble = bubble;
  const entity = { id: 1, type: 'ship', alive: true, radius: 14, shield: 40 };
  const meshes = new Map([[entity.id, root]]);
  const pool = createShipAuxPool(scene);
  const renderer = { _meshes: meshes, _shipAuxPool: pool };
  try {
    syncShipAuxPools(pool, [entity], meshes);
    assert.equal(sceneTruthSamplesFromRenderer(renderer)[0].shieldGeometryRadius, null, 'quiet shield HP is not a visible shell');
    bubble.material.uniforms.uFlash.value = 1;
    syncShipAuxPools(pool, [entity], meshes);
    const [sample] = sceneTruthSamplesFromRenderer(renderer);
    const frame = sceneTruthFrameFromSamples([sample], { sampleSource: 'render-roots' });
    assert.equal(frame.objects[0].depthTest, null, 'a group has no material depth measurement');
    assert.equal(bubble.visible, false, 'pooled shells hide the fallback mesh');
    assert.ok(Math.abs(sample.shieldGeometryRadius - 5.88) < 1e-5, 'read actual survival shell matrix, not entity radius');
    root.visible = false;
    const [hidden] = sceneTruthSamplesFromRenderer(renderer);
    assert.equal(hidden.visible, false);
    assert.equal(hidden.shieldGeometryRadius, null);
    root.visible = true;
    entity.shield = 0;
    bubble.visible = true;
    bubble.updateWorldMatrix(true, false);
    bubble.userData.sceneTruthShieldInstance = -1;
    assert.ok(Math.abs(sceneTruthSamplesFromRenderer(renderer)[0].shieldGeometryRadius - 5.88) < 1e-5, 'visible collapse fallback outlives shield HP');
  } finally {
    bubble.material.dispose();
    pool.shield.mesh.geometry.dispose(); pool.shield.material.dispose(); pool.nav.material.dispose();
    scene.clear();
    globalThis.__SF_SCENE_TRUTH_WITNESS__ = false;
  }
});

test('a current shield of 0 does not keep the raised shell radius', () => {
  const entity = {
    id: 4,
    alive: true,
    radius: 14,
    shield: 0,
    shieldMax: 55,
    pos: { x: 0, z: 0 },
    data: {},
  };
  assert.equal(liveShieldGeometryRadius(entity), null);
  const [sample] = sceneTruthSamplesFromState({ entityList: [entity] });
  assert.equal(sample.shieldGeometryRadius, null);
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
