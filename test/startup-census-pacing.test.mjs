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

// The async texture scan of an already-resident set (recook, F9, context-restore re-verify, a second New Game) had the same
// defect in its await form: it stamped the stride clock BEFORE `await yieldToMain()`, so after the frame-long wait the next
// resident row read >= 2 ms over and yielded again, one frame per texture. 600 resident textures cost ~600 frame waits.
test('re-verifying an already-resident texture set yields on the stride, not once per texture', async () => {
  const { prepareStartupGpuResidency } = await import('../src/render/startupGpuResidency.js');
  const textures = Array.from({ length: SUBJECTS }, (_, index) => {
    const texture = new THREE.Texture();
    texture.name = `resident-${index}`;
    texture.version = 1;
    return texture;
  });
  const subject = { isObject3D: true };
  const renderer = { initTexture() {}, info: { memory: { textures: 0 } } };
  {
    const clock = { now: 0 };
    let yields = 0;
    const options = {
      textures,
      now: () => clock.now,
      paceQueue: async () => {},
      yieldToMain: async () => { yields += 1; clock.now += FRAME_MS; },
    };
    await prepareStartupGpuResidency(renderer, [subject], options); // first pass uploads and stamps every texture
    const firstPassYields = yields;
    yields = 0;
    const second = await prepareStartupGpuResidency(renderer, [subject], options);
    assert.ok(firstPassYields >= SUBJECTS, `the first pass waits per upload (${firstPassYields})`);
    assert.equal(second.textures ?? SUBJECTS, SUBJECTS);
    assert.ok(yields <= Math.ceil(SUBJECTS / STRIDE) + 2,
      `a resident re-verify yields on the ${STRIDE}-row stride, not per texture: ${yields} yields for ${SUBJECTS} textures`);
  }
});

// The renderer's stepped census/sweep generators (census, reattach, rebind, spawned, view sweep, upgrade) carry the same
// stride clock. Each stamp must sit directly after its `yield;` for the reason above; a stamp before it, or none, brings
// the per-node frame wait back. 9 stamps today; the source shape is uniform, so the pin reads it.
test('renderer.js stamps every stride clock directly after its yield', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const stamp = /^\s*(\w+StrideAt) = \w+Now\(\);$/;
  const stamped = [];
  source.forEach((line, index) => {
    const match = line.match(stamp);
    if (!match) return;
    stamped.push(match[1]);
    assert.match(source[index - 1], /^\s*yield;$/, `${match[1]} (renderer.js:${index + 1}) must follow a bare yield, found: ${source[index - 1].trim()}`);
  });
  assert.equal(stamped.length, 9, `the nine stepped sites: ${stamped.join(', ')}`);
  assert.deepEqual([...new Set(stamped)].sort(),
    ['censusStrideAt', 'rebindStrideAt', 'reattachStrideAt', 'spawnedStrideAt', 'upgradeStrideAt', 'viewSweepStrideAt'].sort());
});
