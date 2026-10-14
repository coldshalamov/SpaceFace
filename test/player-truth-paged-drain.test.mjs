import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installPlayerTruthReader } from '../src/testing/playerTruth/reader.js';

test('a delayed dense reader transfer pages every frame in original order without drops', () => {
  let callback, time = 0;
  const win = {
    SF: { THREE, state: { tick: 0, simTime: 0, mode: 'flight', render: {},
      entityList: Array.from({ length: 500 }, (_, id) => ({ id, alive: true,
        type: 'asteroid', pos: { x: id, z: 0 }, vel: { x: 0, z: 0 } })), playerId: -1 } },
    performance: { now: () => time }, innerWidth: 1280, innerHeight: 720,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
  };
  const reader = installPlayerTruthReader(win, { pxEvery: 0 });
  reader.start();
  for (let i = 0; i < 97; i++) { time += 16; win.SF.state.tick++; callback(); }
  reader.stop();
  const frames = [], sizes = [], pending = [];
  do {
    const batch = reader.drain();
    frames.push(...batch.samples); sizes.push(batch.samples.length); pending.push(batch.pendingSamples);
  } while (pending.at(-1));
  assert.deepEqual(sizes, [32, 32, 32, 1]);
  assert.deepEqual(pending, [65, 33, 1, 0]);
  assert.deepEqual(frames.map(f => f.tick), Array.from({ length: 97 }, (_, i) => i + 1));
  assert.ok(frames.every(f => f.e.length === 500));
  assert.equal(reader.drain().samples.length, 0);
  reader.dispose();
});
