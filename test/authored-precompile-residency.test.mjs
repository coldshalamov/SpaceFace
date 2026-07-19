import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { precompilePipelines } from '../src/render/precompile.js';
import { getAuthoredUpgradeQueueStats } from '../src/render/partsLibrary.js';

test('deferred sector shader precompile admits one archetype per browser yield', async () => {
  const preparedSubjects = [];
  let browserYields = 0;
  const renderer = {
    compileAsync: async () => {},
    info: { programs: [] },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  const result = await precompilePipelines(renderer, scene, camera, {
    sector: {
      id: 'sector_incremental_probe',
      trafficPerMin: 4,
      enemyDensity: 0,
      security: 1,
      tier: 1,
      pois: [],
    },
    incremental: true,
    preparePipelines: async (subject) => {
      preparedSubjects.push(subject);
      assert.notEqual(subject.name, 'SF_Precompile_Staging');
      assert.equal(subject.parent?.name, 'SF_Precompile_Staging');
      assert.equal(subject.parent?.parent, scene);
    },
    yieldToMain: async () => { browserYields++; },
  });

  assert.equal(result.skipped, false);
  assert.equal(result.shipArchetypes, preparedSubjects.length);
  assert.ok(preparedSubjects.length > 1, 'the fixture must exercise multiple archetypes');
  assert.equal(browserYields, preparedSubjects.length + 1, 'yield once before work and after each admitted archetype');
  assert.equal(scene.getObjectByName('SF_Precompile_Staging'), undefined);
});

test('synthetic shader precompile creates zero authored asset residency demand', async () => {
  const source = readFileSync(new URL('../src/render/precompile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /preloadAuthoredPartLibrary/);

  let legacyCompileCalls = 0;
  let exactTargetPrepareCalls = 0;
  const renderer = {
    compileAsync: async () => { legacyCompileCalls++; },
    info: { programs: [] },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  const result = await precompilePipelines(renderer, scene, camera, {
    includeGlobalPipelines: true,
    video: { particleQuality: 'medium' },
    preparePipelines: async (subject) => {
      exactTargetPrepareCalls++;
      assert.equal(subject.name, 'SF_Precompile_Staging');
      assert.equal(subject.parent, scene);
    },
  });

  assert.equal(result.skipped, false);
  assert.equal(exactTargetPrepareCalls, 1);
  assert.equal(legacyCompileCalls, 0);
  assert.deepEqual(getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
  assert.equal(scene.getObjectByName('SF_Precompile_Staging'), undefined);
});
