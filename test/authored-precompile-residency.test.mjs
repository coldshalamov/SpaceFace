import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { precompilePipelines } from '../src/render/precompile.js';
import { getAuthoredUpgradeQueueStats } from '../src/render/partsLibrary.js';

test('synthetic shader precompile creates zero authored asset residency demand', async () => {
  const source = readFileSync(new URL('../src/render/precompile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /preloadAuthoredPartLibrary/);

  const renderer = {
    compileAsync: async () => {},
    info: { programs: [] },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  const result = await precompilePipelines(renderer, scene, camera, {
    includeGlobalPipelines: true,
    video: { particleQuality: 'medium' },
  });

  assert.equal(result.skipped, false);
  assert.deepEqual(getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
  assert.equal(scene.getObjectByName('SF_Precompile_Staging'), undefined);
});
