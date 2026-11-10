import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as THREE from 'three';

import { ensurePerfRuntime } from '../src/core/perfRuntime.js';
import {
  bindAuthoredAssetPerfCounters,
  prepareRenderPackageBlueprint,
} from '../src/render/assetLoader.js';

const rendererSource = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

function packageFixture(renderer) {
  const scene = new THREE.Group();
  scene.name = 'fixture_scene';
  scene.userData.spacefaceAsset = {
    contractVersion: 2,
    assetId: 'fixture_perf_owner',
    slot: 'hull',
  };
  return prepareRenderPackageBlueprint({
    assetId: 'sf.render.fixture-perf-owner',
    runtimeAssetId: 'fixture_perf_owner',
    sourceUrl: 'fixture_perf_owner.glb',
    slot: 'hull',
  }, { scene }, {
    runtime: {
      primitives: [],
      markers: [],
      hidden: [],
      materialProfiles: [],
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 1],
        size: [1, 1, 1],
        center: [0.5, 0.5, 0.5],
      },
    },
  }, {
    renderer,
    plan: { entries: [{ source: scene, parentIndex: -1 }] },
  });
}

test('authored asset admission counts through the explicitly bound GameState sink', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = Object.create(null);
    const gameState = { entityList: [], settings: { video: {} } };
    const perf = ensurePerfRuntime(gameState);
    perf.tier1.setEnabled(true);
    const publicPerfOwner = globalThis.window.__SPACEFACE_PERF__;

    const threeInternalState = Object.create(null);
    const renderer = { state: threeInternalState };
    assert.equal(bindAuthoredAssetPerfCounters(renderer, perf.tier1), perf.tier1);
    assert.equal(packageFixture(renderer).assetId, 'fixture_perf_owner');

    assert.equal(perf.tier1.snapshot().totals.runtimeSemanticCompiles, 1);
    assert.equal(threeInternalState.perfRuntime, undefined,
      "Three's internal renderer state must never acquire a SpaceFace perf runtime");
    assert.equal(globalThis.window.__SPACEFACE_PERF__, publicPerfOwner,
      'authored admission must preserve the public GameState-owned performance handle');

    const unboundRenderer = { state: Object.create(null) };
    assert.equal(packageFixture(unboundRenderer).assetId, 'fixture_perf_owner');
    assert.equal(perf.tier1.snapshot().totals.runtimeSemanticCompiles, 1,
      'an unbound renderer stays uninstrumented rather than manufacturing another sink');
    assert.equal(unboundRenderer.state.perfRuntime, undefined);
    assert.equal(globalThis.window.__SPACEFACE_PERF__, publicPerfOwner);

    const otherPerf = ensurePerfRuntime({ entityList: [], settings: { video: {} } }).tier1;
    assert.throws(
      () => bindAuthoredAssetPerfCounters(renderer, otherPerf),
      /owner cannot change/,
      'one renderer cannot split authored counters across GameState owners',
    );
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('renderer publishes the GameState counter owner before enabling instrumentation', () => {
  const bindIndex = rendererSource.indexOf('bindAuthoredAssetPerfCounters(renderer, perfCounters);');
  const enableIndex = rendererSource.indexOf('perfCounters.setEnabled(true);', bindIndex);
  assert.ok(bindIndex >= 0, 'renderer must explicitly bind authored counters to its GameState sink');
  assert.ok(enableIndex > bindIndex, 'the single counter owner is published before instrumentation is enabled');
  assert.doesNotMatch(rendererSource, /ensurePerfRuntime\(renderer\.state\)/,
    "renderer.state is Three's internal WebGL cache, never SpaceFace GameState");
});
