import test from 'node:test';
import assert from 'node:assert/strict';

// E10 — the frame-truth recorder: preallocated rings wrap without allocation growth,
// ingest survives missing probes, per-reply arrival intervals are derived, and the
// exported trace carries the columns E1's before/after verification reads.
test('frame truth recorder ingests frames, replies and exports a complete trace', async () => {
  const { ensureFrameTruth } = await import('../src/core/frameTruth.js');
  const state = {};
  const recorder = ensureFrameTruth(state);
  assert.equal(recorder, state.frameTruth);
  assert.equal(ensureFrameTruth(state), recorder, 'singleton per state');

  // Frames: hold-then-jump signature is classified per frame from the player row.
  recorder.ingestFrame({ frameDtMs: 16.7, callbackMs: 5, presentMs: 4, steps: 1,
    simTimeS: 1.0, tick: 60,
    playerRow: { pos: { x: 0, z: 0 }, vx: 10, vz: 0 } });
  recorder.ingestFrame({ frameDtMs: 16.7, callbackMs: 5, presentMs: 4, steps: 0,
    simTimeS: 1.0, tick: 60,
    playerRow: { pos: { x: 0, z: 0 }, vx: 10, vz: 0 } });
  recorder.ingestFrame({ frameDtMs: 16.7, callbackMs: 5, presentMs: 4, steps: 0,
    simTimeS: 1.167, tick: 70,
    playerRow: { pos: { x: 2.8, z: 0 }, vx: 10, vz: 0 } });
  assert.equal(recorder.lastFrame.heldPoseFrames, 0, 'the jump frame is not a held frame');
  assert.ok(recorder.lastFrame.poseJumpWu > 2.7, 'the reply-boundary jump is recorded');

  // Replies: arrival interval derived from consecutive wall stamps.
  recorder.noteWorkerReply({ wallMs: 100, workMs: 8, stepsMs: 6, packMs: 0.02,
    applyMs: 1.2, steps: 1, journalRecords: 40, events: 3 });
  recorder.noteWorkerReply({ wallMs: 250, workMs: 58, stepsMs: 55, packMs: 0.02,
    applyMs: 3.4, steps: 4, journalRecords: 160, events: 12 });
  const intervals = recorder.exportJSON({ download: false }).replies.intervalMs;
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0], 150);

  // Export: every frame field present as a columnar array of the right length.
  const trace = recorder.exportJSON({ download: false });
  assert.equal(trace.schema, 'spaceface.frameTruth.v1');
  assert.equal(trace.frameCount, 3);
  for (const field of Object.keys(trace.columns)) {
    assert.equal(trace.columns[field].length, 3, `${field} column complete`);
  }
  assert.equal(trace.summary.workerWork.max, 58);
  assert.ok(trace.summary.poseJump.max > 2.7);

  // Ring wrap: capacity is bounded and the oldest rows fall off.
  for (let i = 0; i < 2100; i++) {
    recorder.ingestFrame({ frameDtMs: 16.7, playerRow: { pos: { x: i, z: 0 }, vx: 0, vz: 0 } });
  }
  const wrapped = recorder.exportJSON({ download: false });
  assert.equal(wrapped.frameCount, 1800);

  // Robustness: null/missing probes never throw and record as 0.
  recorder.ingestFrame({ frameDtMs: 16.7 });
  recorder.noteWorkerReply(null);
});

test('frame truth query-param gate and hotkey-free node import', async () => {
  const { frameTruthRequestedByParam } = await import('../src/core/frameTruth.js');
  assert.equal(frameTruthRequestedByParam('?frameTruth=1'), true);
  assert.equal(frameTruthRequestedByParam('?frameTruth=0'), false);
  assert.equal(frameTruthRequestedByParam(''), false);
  assert.equal(frameTruthRequestedByParam('not-a-url'), false);
});

test('E1 stall harness flag: cycle parsed, bounded, invalid entries warned', async () => {
  const { resolveSimLaneFlags } = await import('../src/core/simLaneMain.js');
  const cycle = resolveSimLaneFlags('?simStall=60,60,60,400');
  assert.deepEqual(cycle.simStall, [60, 60, 60, 400]);
  assert.equal(cycle.warnings.length, 0);
  const constant = resolveSimLaneFlags('?simStall=400');
  assert.deepEqual(constant.simStall, [400]);
  const absent = resolveSimLaneFlags('?simLane=worker');
  assert.equal(absent.simStall, null);
  const mixed = resolveSimLaneFlags('?simStall=100,bogus,3000,50');
  assert.deepEqual(mixed.simStall, [100, 50], 'invalid entries skipped');
  assert.equal(mixed.warnings.length, 2);
  // Entries beyond 16 are dropped, never unbounded.
  const long = resolveSimLaneFlags(`?simStall=${Array.from({ length: 40 }, (_, i) => i % 200).join(',')}`);
  assert.equal(long.simStall.length, 16);
});
