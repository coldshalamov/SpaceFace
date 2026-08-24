import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { collectInstancePoolCompileRoots, collectLateAdmittedCompileRoots } from '../src/render/latePipelineAdmission.js';

test('late admission collects entity roots whose drawables were not in the opening leaf set', () => {
  const openingHull = { isMesh: true, name: 'player-hull' };
  const extraPanel = { isMesh: true, name: 'npc-panel' };
  const player = {
    name: 'player',
    traverse(fn) { fn(this); fn(openingHull); },
  };
  const npc = {
    name: 'npc',
    traverse(fn) { fn(this); fn(extraPanel); },
  };
  const meshes = new Map([
    [1, player],
    [2, npc],
  ]);
  const late = collectLateAdmittedCompileRoots(meshes, [openingHull]);
  assert.deepEqual(late.map((root) => root.name), ['npc']);
});

test('a root with extra uncompiled leaves is still admitted even if some leaves were opening', () => {
  const openingHull = { isMesh: true, name: 'hull' };
  const extra = { isMesh: true, name: 'hardpoint' };
  const player = {
    name: 'player',
    traverse(fn) { fn(this); fn(openingHull); fn(extra); },
  };
  const late = collectLateAdmittedCompileRoots(new Map([[1, player]]), [openingHull]);
  assert.deepEqual(late.map((root) => root.name), ['player']);
});

test('instance pool compile roots include zero-count pending chunks', () => {
  const pending = {
    userData: { spacefaceInstancePool: true },
    name: 'pool-pending',
    count: 0,
  };
  const live = {
    userData: { spacefaceInstancePool: true },
    name: 'pool-live',
    count: 3,
  };
  const scene = {
    traverse(fn) {
      fn(this);
      fn(pending);
      fn(live);
    },
  };
  assert.deepEqual(collectInstancePoolCompileRoots(scene).map((item) => item.name), [
    'pool-pending',
    'pool-live',
  ]);
});

test('admission compile path includes shadow depth and post-opening drain', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const readiness = await readFile(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  assert.match(renderer, /compileShadowDepthPipelines/);
  assert.match(renderer, /armAdmissionShadows/);
  assert.match(renderer, /collectLateAdmittedCompileRoots/);
  assert.match(renderer, /collectInstancePoolCompileRoots/);
  assert.match(renderer, /preparePostOpeningPipelines/);
  assert.match(renderer, /pipelineAdmissions\.compile\(subject\)/);
  assert.match(renderer, /compileForCurrentTarget\(lateEntities\)/);
  assert.match(readiness, /preparePostOpeningPipelines/);
  assert.match(
    renderer,
    /state\.mode === 'loading'[\s\S]{0,700}?opening-submission-plan-owns-first-picture/,
    'loading still bypasses the broad authored-root watermark',
  );
  assert.doesNotMatch(renderer, /scheduleUpgradeFrame/, 'must not relitigate upgrade-frame scheduling');
});
