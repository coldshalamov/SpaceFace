// The opening's resource census generators must pace by WORK, not by the frames they wait.
//
// Each generator yields every `sliceEvery` nodes or once 2 ms of work has passed, and the async admission
// driver awaits a present (a whole frame) per yield. The stride clock used to be stamped BEFORE the yield, so
// after the frame-long wait it read >= 2 ms over on the very next node and every node afterwards yielded too:
// 595 cheap leaf subjects cost 680 frame-waits (11.5 s of the 2026-10-13 warm launch) for zero decodes.
//
// A fake clock stands in for the frame wait: the driver advances it 1000/60 ms per yield, the nodes cost
// nothing, so any yield beyond the node-count stride is pure pacing waste.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  collectStartupGeometries,
  collectStartupGeometriesSteps,
  collectStartupGeometryDrawables,
  collectStartupGeometryDrawablesSteps,
  collectStartupTextures,
  collectStartupTexturesSteps,
  collectUnresidentInstancedDrawablesSteps,
} from '../src/render/startupGpuResidency.js';

const FRAME_MS = 1000 / 60;
const SUBJECTS = 595;
const STRIDE = 256;
const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');

function withFakeClock(run) {
  const clock = { now: 0 };
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock.now } });
  try {
    return run(clock);
  } finally {
    Object.defineProperty(globalThis, 'performance', originalPerformance);
  }
}

/** Drive a generator the way the async admission driver does: one present-wait (a frame) per yield. */
function drive(iterator, clock, nodeCostMs = 0) {
  let yields = 0;
  let maxSliceWorkMs = 0;
  let resumedAt = clock.now;
  for (;;) {
    const step = iterator.next();
    maxSliceWorkMs = Math.max(maxSliceWorkMs, clock.now - resumedAt);
    if (step.done) return { value: step.value, yields, maxSliceWorkMs };
    yields += 1;
    clock.now += FRAME_MS; // the awaited present
    resumedAt = clock.now;
  }
}

function cohort(nodeCost = 0, clock = null) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const texture = new THREE.DataTexture(new Uint8Array(16), 2, 2, THREE.RGBAFormat);
  const material = new THREE.MeshStandardMaterial({ map: texture });
  return Array.from({ length: SUBJECTS }, () => {
    const mesh = new THREE.Mesh(geometry, material);
    if (nodeCost > 0 && clock) {
      // Reading a node's children is where the walk spends CPU; charge the fake clock for it.
      Object.defineProperty(mesh, 'children', { get() { clock.now += nodeCost; return []; } });
    }
    return mesh;
  });
}

const GENERATORS = [
  ['textures', (subjects) => collectStartupTexturesSteps(subjects), (s) => collectStartupTextures(s)],
  ['geometry drawables', (subjects) => collectStartupGeometryDrawablesSteps(subjects), (s) => collectStartupGeometryDrawables(s)],
  ['geometries', (subjects) => collectStartupGeometriesSteps(subjects), (s) => collectStartupGeometries(s)],
  ['unresident instanced', (subjects) => collectUnresidentInstancedDrawablesSteps(subjects), null],
];

for (const [name, steps, sync] of GENERATORS) {
  test(`${name}: cheap nodes yield once per stride, not once per node after the first wait`, () => {
    withFakeClock((clock) => {
      const subjects = cohort();
      const { value, yields } = drive(steps(subjects), clock);
      const strideYields = Math.floor(SUBJECTS / STRIDE);
      assert.ok(yields <= strideYields + 1,
        `${yields} yields for ${SUBJECTS} free nodes (stride allows ${strideYields}); the old pacing gave ${SUBJECTS - STRIDE + 1}`);
      if (sync) assert.deepEqual(value, sync(subjects), 'pacing changes when the walk yields, never what it finds');
    });
  });

  test(`${name}: expensive nodes still yield inside the 2 ms work bound`, () => {
    withFakeClock((clock) => {
      const subjects = cohort(0.25, clock); // 8 nodes per 2 ms slice
      const { yields, maxSliceWorkMs } = drive(steps(subjects), clock, 0);
      assert.ok(yields >= SUBJECTS / 12, `a CPU-heavy walk must keep yielding (${yields})`);
      assert.ok(maxSliceWorkMs <= 2.5, `no slice runs past the bound (${maxSliceWorkMs} ms)`);
    });
  });
}
