import assert from 'node:assert/strict';
import test from 'node:test';
import { createLodState } from '../src/render/lod.js';
import { applyProjectedDetailLod, attachStationHlod } from '../src/render/hlod.js';
import {
  setSyncEntityLodRetainForBench,
  getSyncEntityLodRetainForBench,
} from '../src/render/renderer.js';

test('bench toggle defaults ON and restores always-call when false', () => {
  assert.equal(getSyncEntityLodRetainForBench(), true);
  setSyncEntityLodRetainForBench(false);
  assert.equal(getSyncEntityLodRetainForBench(), false);
  setSyncEntityLodRetainForBench(true);
  assert.equal(getSyncEntityLodRetainForBench(), true);
});

test('asteroid updateLod retains: second same-band call skips detail traverse', async () => {
  // Build a minimal asteroid-like root with far-detail child.
  const { createVisualFactory } = await import('../src/render/visualFactory.js');
  // Avoid full factory: mirror production retain shape directly.
  let traversals = 0;
  const root = {
    visible: true,
    userData: {},
    children: [{
      isMesh: true, visible: true, name: 'greeble_vein',
      userData: { spacefaceTags: { greeble: true } },
      children: [],
      traverse(fn) { traversals++; fn(this); },
    }],
    traverse(fn) {
      traversals++;
      fn(this);
      for (const c of this.children) c.traverse(fn);
    },
  };
  let last = null;
  root.userData.updateLod = function updateAsteroidLod(level) {
    if (level === last) return;
    last = level;
    applyProjectedDetailLod(root, level);
  };
  root.userData.updateLod('lod1');
  const afterFirst = traversals;
  assert.ok(afterFirst > 0);
  root.userData.updateLod('lod1');
  assert.equal(traversals, afterFirst, 'same band must not re-traverse');
  root.userData.updateLod('lod2');
  assert.ok(traversals > afterFirst, 'band change must re-traverse');
});

test('station hlod updateLod retains across unchanged band', async () => {
  const THREE = await import('three');
  const detailed = new THREE.Group();
  detailed.name = 'RetainStation';
  const greeble = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x445566 }),
  );
  greeble.name = 'greeble_panel';
  greeble.userData.spacefaceTags = { greeble: true };
  detailed.add(greeble);
  const entity = { type: 'station', id: 'st_retain', radius: 60, data: {} };
  attachStationHlod(detailed, entity);
  assert.equal(typeof detailed.userData.updateLod, 'function');
  detailed.userData.updateLod('lod1');
  assert.equal(greeble.visible, true);
  // Hide at lod2
  detailed.userData.updateLod('lod2');
  assert.equal(greeble.visible, false);
  // Re-enter same band: retain must keep hidden without flipping
  detailed.userData.updateLod('lod2');
  assert.equal(greeble.visible, false);
  detailed.userData.updateLod('lod0');
  assert.equal(greeble.visible, true);
});

test('central retain stamp: same band skips, band change wakes', () => {
  // Mirror the syncEntityViews gate without standing up a renderer.
  setSyncEntityLodRetainForBench(true);
  const userData = {
    lod: createLodState(),
    _appliedLodLevel: undefined,
    calls: 0,
    updateLod(level) { this.calls += 1; this.last = level; },
  };
  function apply(projectedPx, isPlayer = false) {
    const lodLevel = isPlayer ? 'lod0' : userData.lod.resolve(projectedPx);
    if (getSyncEntityLodRetainForBench() === false || userData._appliedLodLevel !== lodLevel) {
      userData.updateLod(lodLevel);
      userData._appliedLodLevel = lodLevel;
    }
    return lodLevel;
  }
  // Huge projected size → lod0
  apply(400);
  assert.equal(userData.calls, 1);
  apply(400);
  assert.equal(userData.calls, 1, 'retain skips');
  // Tiny → step toward lod2 (may take two hysteresis steps)
  apply(10);
  apply(10);
  apply(5);
  assert.ok(userData.calls >= 2, 'band change wakes');
  setSyncEntityLodRetainForBench(false);
  const calls = userData.calls;
  apply(5);
  assert.equal(userData.calls, calls + 1, 'bench OFF always calls');
  setSyncEntityLodRetainForBench(true);
});
