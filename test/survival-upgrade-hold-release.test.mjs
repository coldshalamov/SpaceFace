// A Crucible cook warms the whole roster and drains the authored upgrade queue to idle before the
// shell releases, so the first-flight queue hold only parked mid-round spawns: a wasp reinforcement
// drew its procedural stand-in for ~16 s before the hold's 20 s window let its authored hull compose
// (seed 4242, 2026-09-22). The open route keeps the hold: its leftover compiles are what it defers.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  describeAuthoredUpgradeQueue,
  enqueueBoundaryUpgrade,
  holdAuthoredUpgradeQueueForFirstFlight,
} from '../src/render/partsLibrary.js';
import { applyFirstPlayablePaintRelease } from '../src/render/renderer.js';

function heldScene() {
  const scene = new THREE.Scene();
  // A detached boundary is refused before queueing, but the refusal still creates the queue state
  // the hold lives on.
  void enqueueBoundaryUpgrade(scene, { boundary: new THREE.Group() });
  assert.equal(holdAuthoredUpgradeQueueForFirstFlight(scene), true);
  assert.equal(describeAuthoredUpgradeQueue(scene).held, true);
  return scene;
}

function owner(scene, run) {
  return {
    scene,
    state: {
      mode: 'flight',
      simTime: 0.1,
      run,
      render: { resumeDeferredPipelineAdmissions: () => ({ skipped: true }) },
    },
    _deferNoncriticalMeshStreaming: true,
    _openingFirstPicturePrepared: true,
  };
}

test('a survival run releases the first-flight upgrade hold at the first paint', () => {
  const scene = heldScene();
  applyFirstPlayablePaintRelease(owner(scene, { kind: 'survival', phase: 'wave' }));
  assert.equal(describeAuthoredUpgradeQueue(scene).held, false,
    'mid-round spawns must compose their authored hull without waiting out the 20 s window');
});

test('the open route keeps the first-flight upgrade hold through the first paint', () => {
  const scene = heldScene();
  applyFirstPlayablePaintRelease(owner(scene, null));
  assert.equal(describeAuthoredUpgradeQueue(scene).held, true,
    'leftover opening compiles stay deferred through the first-flight window');
});
