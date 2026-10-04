// MACH-09 — the packed presentation snapshot reports its bytes per frame in the witness.
// A render that cannot say how much it packs per frame cannot say what a population spike costs;
// the fence now publishes bytes-per-commit and the witness reduces the window to p50/p95.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSnapshotFence,
  packPresentationWorldToFence,
  PACKED_BYTES_PER_ENTITY,
  PACKED_BYTES_PER_JOURNAL_EVENT,
} from '../src/render/snapshotFence.js';
import {
  collectRuntimeWitnessSample,
  formatRuntimeWitnessReport,
} from '../src/core/runtimeWitness.js';

function fakeWorld(count) {
  return {
    activeSlots: Uint32Array.from({ length: count }, (_, i) => i),
    alive: new Uint8Array(count).fill(1),
    entityIds: Uint32Array.from({ length: count }, (_, i) => i + 1),
    typeCodes: new Uint32Array(count),
    x: new Float32Array(count).map((_, i) => i * 3),
    y: new Float32Array(count),
    z: new Float32Array(count).map((_, i) => i * 7),
    rot: new Float32Array(count),
    flags: new Uint32Array(count),
    getDiagnostics: () => ({ active: count }),
  };
}

test('the fence publishes bytes packed per commit', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  assert.equal(fence.lastBytesPacked, 0, 'no pack yet reports zero, not a guess');
  const packed = packPresentationWorldToFence(fakeWorld(5), fence, 1.5, 1);
  assert.equal(packed, 5);
  assert.equal(
    fence.lastBytesPacked,
    5 * PACKED_BYTES_PER_ENTITY,
    'five entities at the 72-byte column width',
  );
  // A journal event adds its 12-byte triple.
  const snapshot = fence.beginPack(2, 2.0, 1);
  snapshot.write(9, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0);
  snapshot.record(1, 0, 7);
  fence.commit();
  assert.equal(
    fence.lastBytesPacked,
    1 * PACKED_BYTES_PER_ENTITY + 1 * PACKED_BYTES_PER_JOURNAL_EVENT,
  );
});

test('bytes-packed stats reduce the retained commit ring to p50/p95/max', () => {
  const fence = createSnapshotFence({ capacity: 64 });
  const counts = [4, 8, 16, 32, 4, 8, 16, 32];
  for (const n of counts) packPresentationWorldToFence(fakeWorld(n), fence, n, 1);
  const stats = fence.bytesPackedStats();
  assert.equal(stats.samples, counts.length);
  assert.equal(stats.last, 32 * PACKED_BYTES_PER_ENTITY);
  assert.equal(stats.max, 32 * PACKED_BYTES_PER_ENTITY);
  assert.equal(stats.p50, 8 * PACKED_BYTES_PER_ENTITY, 'median of the alternating small/large packs');
  assert.equal(stats.p95, 32 * PACKED_BYTES_PER_ENTITY);
  assert.ok(stats.mean > stats.p50 && stats.mean < stats.max);
});

test('seed-4242 Ceres fight-sized pack records its numbers', () => {
  // Deterministic reference pack for a Ceres belt fight: 212 visible bodies recorded on the
  // seed-4242 scenario. 212 * 72 = 15264 bytes/frame at the current column width — the number
  // the witness must be able to say when someone asks what the fight costs the present.
  const fence = createSnapshotFence({ capacity: 256 });
  const packed = packPresentationWorldToFence(fakeWorld(212), fence, 4242, 1);
  assert.equal(packed, 212);
  assert.equal(fence.lastBytesPacked, 212 * PACKED_BYTES_PER_ENTITY); // 15264
  const stats = fence.bytesPackedStats();
  assert.equal(stats.p50, 15264);
  assert.equal(stats.p95, 15264);
});

test('the witness sample carries fence bytes and the report prints p50/p95', () => {
  const state = {
    simTime: 12,
    tick: 720,
    mode: 'flight',
    entities: new Map(),
    render: { snapshotFence: { sequence: 41, packed: 212, bytes: 15264 } },
  };
  const sample = collectRuntimeWitnessSample(state, {}, 1_000);
  assert.equal(sample.fenceBytesPacked, 15264);

  const report = formatRuntimeWitnessReport({
    verdict: { kind: 'presenting', headline: '', next: '' },
    samples: [
      { fenceBytesPacked: 12000 },
      { fenceBytesPacked: 15264 },
      { fenceBytesPacked: 15264 },
      { fenceBytesPacked: 30000 },
    ],
  });
  assert.match(report, /packed snapshot bytes\/frame: p50 15264 \/ p95 30000 \/ last 30000/);
});

test('a window with no packs reads n/a rather than zero', () => {
  const report = formatRuntimeWitnessReport({
    verdict: { kind: 'loading-stuck', headline: '', next: '' },
    samples: [{ fenceBytesPacked: 0 }, { fenceBytesPacked: 0 }],
  });
  assert.match(report, /packed snapshot bytes\/frame: n\/a/);
});
