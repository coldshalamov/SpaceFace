import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  enqueueBoundaryUpgrade,
  prepareFirstQueuedAuthoredBoundaryForOpening,
  resumeAuthoredUpgradeQueueAfterOpening,
} from '../src/render/partsLibrary.js';
import {
  prepareStartupGpuResidency,
} from '../src/render/startupGpuResidency.js';

const RENDERER_SOURCE = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

function geometryRenderer(timeline) {
  let target = null;
  return {
    autoClear: true,
    xr: { enabled: false },
    shadowMap: { autoUpdate: true, needsUpdate: false },
    info: { memory: { geometries: 0 } },
    initTexture() {},
    getRenderTarget() { return target; },
    setRenderTarget(next) { target = next; },
    render(scene) {
      timeline.push('geometry-cohort');
      this.info.memory.geometries += scene.children.length;
    },
  };
}

test('Continue drains one queued heavy root through geometry residency before first present', async () => {
  const priorWindow = globalThis.window;
  const priorRaf = globalThis.requestAnimationFrame;
  const scheduledFrames = [];
  const timeline = [];
  const scene = new THREE.Scene();
  const renderer = geometryRenderer(timeline);
  const firstBoundary = new THREE.Group();
  const secondBoundary = new THREE.Group();
  scene.add(firstBoundary, secondBoundary);
  const firstRoot = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

  try {
    globalThis.window = {
      SF: {
        state: {
          mode: 'loading',
          render: {
            scene,
            firstPlayableFrameAt: null,
            deferNoncriticalMeshStreaming: true,
          },
        },
      },
    };
    globalThis.requestAnimationFrame = (callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    };

    const first = enqueueBoundaryUpgrade(scene, {
      boundary: firstBoundary,
      entity: { id: 1, type: 'ship', isPlayer: false },
      run: async () => {
        timeline.push('compose:first');
        await prepareStartupGpuResidency(renderer, firstRoot, {
          includeGeometry: true,
          yieldToMain: async () => { timeline.push('yield'); },
        });
        timeline.push('admitted:first');
        return true;
      },
    });
    const second = enqueueBoundaryUpgrade(scene, {
      boundary: secondBoundary,
      entity: { id: 2, type: 'ship', isPlayer: false },
      run: async () => {
        timeline.push('compose:second');
        return true;
      },
    });

    const cohort = await prepareFirstQueuedAuthoredBoundaryForOpening(scene);
    assert.equal(cohort.prepared, true);
    await first;
    timeline.push('first-present');
    assert.ok(timeline.indexOf('geometry-cohort') > timeline.indexOf('compose:first'));
    assert.ok(timeline.indexOf('geometry-cohort') < timeline.indexOf('first-present'));
    assert.ok(timeline.indexOf('admitted:first') < timeline.indexOf('first-present'));
    assert.equal(timeline.includes('compose:second'), false,
      'the handoff cohort is bounded to one heavy queued composition');

    globalThis.window.SF.state.mode = 'flight';
    const staleFrame = scheduledFrames.shift();
    staleFrame();
    await Promise.resolve();
    assert.equal(timeline.includes('compose:second'), false,
      'a callback scheduled during loading cannot race the handoff latch');

    resumeAuthoredUpgradeQueueAfterOpening(scene);
    const resumedFrame = scheduledFrames.shift();
    resumedFrame();
    await second;
    assert.equal(timeline.includes('compose:second'), true);
  } finally {
    firstRoot.geometry.dispose();
    firstRoot.material.dispose();
    globalThis.window = priorWindow;
    globalThis.requestAnimationFrame = priorRaf;
  }

  assert.match(
    RENDERER_SOURCE,
    /prepareFirstQueuedAuthoredBoundaryForOpening\(this\.scene\)/,
    'the real New Game/Continue first-picture barrier must drain the bounded cohort',
  );
  assert.match(
    RENDERER_SOURCE,
    /resumeAuthoredUpgradeQueueAfterOpening\(scene\)/,
    'the ordinary authored queue must resume only after first-paint release',
  );
});
