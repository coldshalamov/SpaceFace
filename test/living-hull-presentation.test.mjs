import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  LIVING_HULL_HEAT_SCORCH_MAX,
  LIVING_HULL_KILL_TALLY_MAX,
  LIVING_HULL_REPAIR_PATCH_MAX,
} from '../src/core/livingHull.js';
import { createLivingHullPresentation } from '../src/render/livingHullPresentation.js';

function player(overrides = {}) {
  return { id: 1, radius: 12, bank: 0.08, pitch: -0.03, ...overrides };
}

function record(overrides = {}) {
  return {
    killTally: 7,
    repairPatches: 2,
    heatScorch: 1,
    lastWashAtT: 0,
    graffitiLine: 'NO GODS IN VACUUM',
    ...overrides,
  };
}

test('Living Hull presentation mutates counts in place without runtime buffer or resource churn', () => {
  const controller = createLivingHullPresentation();
  const root = new THREE.Group();
  root.userData.authoredAssetState = 'authored';
  const entity = player();
  const input = record();
  const untouched = structuredClone(input);

  assert.equal(controller.attach(root), true);
  assert.equal(controller.sync(input, 2400, entity), true);
  const initial = controller.diagnostics();
  assert.equal(initial.visible, true);
  assert.equal(initial.tallies, 7);
  assert.equal(initial.patches, 2);
  assert.equal(initial.scorch, 1);
  assert.equal(initial.grimeInstances, 3);
  assert.equal(initial.grime, 0.36);
  assert.equal(initial.graffitiLine, input.graffitiLine);
  assert.deepEqual(input, untouched, 'the render adapter must not write simulation state');

  for (let i = 0; i < 1000; i += 1) {
    assert.equal(controller.sync(input, 2400, entity), false);
  }
  const steady = controller.diagnostics();
  assert.deepEqual(steady.resourceIds, initial.resourceIds);
  assert.deepEqual(steady.instanceMatrixVersions, initial.instanceMatrixVersions,
    'steady/event updates change InstancedMesh.count only; matrices never upload again');
  assert.equal(steady.graffitiTextureUpdates, initial.graffitiTextureUpdates);
  assert.equal(steady.mutations, initial.mutations);

  const next = record({ killTally: 8, graffitiLine: 'SHE STILL BITES' });
  assert.equal(controller.sync(next, 2400, entity), true);
  const changed = controller.diagnostics();
  assert.equal(changed.tallies, 8);
  assert.equal(changed.graffitiLine, next.graffitiLine);
  assert.equal(changed.graffitiTextureUpdates, initial.graffitiTextureUpdates + 1);
  assert.deepEqual(changed.resourceIds, initial.resourceIds);
  assert.deepEqual(changed.instanceMatrixVersions, initial.instanceMatrixVersions);

  const restore = controller.beginGpuWarmup();
  const warming = controller.diagnostics();
  assert.equal(warming.warming, true);
  assert.equal(warming.tallies, LIVING_HULL_KILL_TALLY_MAX);
  assert.equal(warming.patches, LIVING_HULL_REPAIR_PATCH_MAX);
  assert.equal(warming.scorch, LIVING_HULL_HEAT_SCORCH_MAX);
  assert.equal(warming.visible, true);
  restore();
  const restored = controller.diagnostics();
  assert.equal(restored.warming, false);
  assert.equal(restored.tallies, changed.tallies);
  assert.equal(restored.patches, changed.patches);
  assert.equal(restored.scorch, changed.scorch);
  assert.equal(restored.graffitiVisible, changed.graffitiVisible);
  assert.deepEqual(restored.resourceIds, initial.resourceIds);

  controller.dispose();
  assert.equal(controller.diagnostics().disposed, true);
});

test('one controller reparents across player roots and stays hidden until authored admission', () => {
  const controller = createLivingHullPresentation();
  const pending = new THREE.Group();
  pending.userData.authoredAssetState = 'awaiting-authored-admission';
  controller.attach(pending);
  controller.sync(record(), 2400, player());
  assert.equal(controller.diagnostics().visible, false);

  pending.userData.authoredAssetState = 'authored';
  controller.sync(record(), 2400, player());
  const admitted = controller.diagnostics();
  assert.equal(admitted.visible, true);
  const stableIds = admitted.resourceIds;

  const replacement = new THREE.Group();
  replacement.userData.authoredAssetState = 'procedural-settled';
  controller.attach(replacement);
  controller.sync(record({ repairPatches: 3 }), 2400, player({ radius: 15 }));
  assert.equal(pending.children.includes(controller.root), false);
  assert.equal(replacement.children.includes(controller.root), true);
  assert.deepEqual(controller.diagnostics().resourceIds, stableIds);

  controller.detach(replacement);
  assert.equal(controller.root.parent, null);
  controller.dispose();
});

test('renderer binds Living Hull changes to the retained adapter, not the ship rebuild route', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = source.indexOf("bus.on('ship:livingHullChanged'");
  assert.ok(start >= 0, 'renderer must consume the rare Living Hull event');
  const block = source.slice(start, start + 900);
  assert.match(block, /_livingHullPresentation\.attach\(mesh\)/);
  assert.match(block, /_livingHullPresentation\.sync\(/);
  assert.doesNotMatch(block, /rebuildShipMesh/);
  assert.match(source, /beginGpuWarmup\(\)/,
    'all latent material programs must warm behind the loading shell');
});
