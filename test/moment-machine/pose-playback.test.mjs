import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPoseReader, poseAt, playRecordedPoses, verifyRecordedPoses,
  planShot, createOfflineCameraLease,
} from '../../src/presentation/momentMachine/shotPlan.js';

const pose = (tick, id = 'pilot', generation = 0, x = tick) => ({ tick, id, generation, x, z: -tick, heading: tick / 60 });

test('indexed playback preserves unsorted, interleaved actor/generation rows', () => {
  const rows = [pose(12), pose(2, 'other'), pose(6), pose(6, 'pilot', 1), pose(1)];
  assert.deepEqual(playRecordedPoses(rows), rows);
  const reader = createPoseReader(rows);
  assert.equal(poseAt(reader, rows[0], 0), null);
  assert.equal(poseAt(reader, rows[0], 9).tick, 6);
  assert.equal(poseAt(reader, { id: 'pilot', generation: 1 }, 5), null);
  assert.equal(poseAt(reader, { id: 'missing', generation: 0 }, 12), null);
  assert.equal(verifyRecordedPoses(rows).verified, true);
});

test('numeric ids, string ids and delimiter-containing identities do not alias', () => {
  const rows = [pose(1, 1), pose(1, '1', 0, 90), pose(1, '1:0', 0, 20)];
  assert.deepEqual(playRecordedPoses(rows), rows);
});

test('an immutable reader owns snapshots, while a new reader sees tape edits', () => {
  const rows = [pose(6)];
  const reader = createPoseReader(rows);
  rows[0].x = 999;
  rows.push(pose(12));
  assert.equal(poseAt(reader, rows[0], 12).x, 6);
  assert.equal(poseAt(createPoseReader(rows), rows[0], 12).tick, 12);
  assert.throws(() => { poseAt(reader, rows[0], 6).x = 77; }, TypeError);
});

test('duplicate ticks keep the legacy first-row lookup but never verify ambiguity', () => {
  const rows = [pose(6), pose(6, 'pilot', 0, 99)];
  assert.equal(poseAt(rows, rows[0], 6).x, 6);
  assert.equal(poseAt(createPoseReader(rows), rows[0], 6).x, 6);
  const report = verifyRecordedPoses(rows);
  assert.equal(report.verified, false);
  assert.equal(report.duplicateSamples, 1);
  assert.equal(report.reason, 'duplicate-recorded-pose');
  assert.equal(verifyRecordedPoses([pose(6), pose(6)]).verified, false);
});

test('empty, sparse, null-containing and malformed tapes stay unverified without throwing', () => {
  assert.equal(verifyRecordedPoses([]).reason, 'tape-positions-unrecorded');
  assert.equal(verifyRecordedPoses(null).verified, false);
  const rows = [null, pose(6), , { ...pose(12), x: NaN }];
  assert.deepEqual(playRecordedPoses(rows), [null, pose(6), null, null]);
  const report = verifyRecordedPoses(rows);
  assert.equal(report.invalidSamples, 3);
  assert.equal(report.reason, 'invalid-recorded-pose');
});

test('every pose field, including occupant generation, is part of verification', () => {
  for (const field of ['tick', 'id', 'generation', 'x', 'z', 'heading']) {
    const rows = [pose(6)];
    const played = playRecordedPoses(rows);
    played[0][field] = field === 'id' ? 'someone-else' : played[0][field] + 1;
    assert.equal(verifyRecordedPoses(rows, played).reason, 'pose-readback-mismatch', field);
  }
  assert.equal(verifyRecordedPoses([pose(6)], []).verified, false);
  assert.equal(verifyRecordedPoses([pose(6)], [pose(6), pose(12)]).verified, false);
});

test('non-finite and invalid identity/time fields cannot be self-verified', () => {
  for (const [key, value] of [['x', Infinity], ['z', NaN], ['heading', undefined],
    ['generation', -1], ['generation', 0.5], ['tick', -1], ['tick', 1.5], ['id', '']]) {
    const rows = [{ ...pose(6), [key]: value }];
    assert.equal(verifyRecordedPoses(rows, rows).verified, false, `${key}=${value}`);
  }
  assert.equal(poseAt(createPoseReader([pose(6)]), pose(6), NaN), null);
});

test('readback is neither a simulation claim nor a video verification', () => {
  const report = verifyRecordedPoses([pose(6)]);
  assert.equal(report.kind, 'recorded-pose-readback');
  assert.equal('videoVerified' in report, false);
  assert.equal('simulationVerified' in report, false);
});

test('indexed floor lookup agrees with the scan over many deterministic seeks', () => {
  const rows = Array.from({ length: 1500 }, (_, i) => pose(i * 3, `ship-${i % 7}`, i % 3));
  rows.reverse();
  const reader = createPoseReader(rows);
  for (let i = 0; i < 1500; i += 11) {
    assert.deepEqual(poseAt(reader, rows[i], i * 4.5), poseAt(rows, rows[i], i * 4.5));
  }
});

test('playback reads input rows linearly, not once per every other sample', () => {
  let idReads = 0;
  const rows = Array.from({ length: 3000 }, (_, i) => ({
    ...pose(i), get id() { idReads += 1; return 'pilot'; },
  }));
  assert.equal(playRecordedPoses(rows).length, rows.length);
  // Count operations instead of making a host-speed-dependent timing assertion.
  assert.ok(idReads < rows.length * 12, `input id reads: ${idReads}`);
});

function shot(samples) {
  return planShot({ samples }, {
    id: 'clip', subject: { id: 'pilot', generation: 0 }, secondary: null,
    inTick: 0, outTick: 300, payoffTick: 60,
  });
}

test('camera and shot beats do not hold the last pose past the recording end', () => {
  const plan = shot([pose(30), pose(60)]);
  const lease = createOfflineCameraLease(plan);
  assert.equal(plan.lastSampleTick, 60);
  assert.equal(lease.frameAt(29).recorded, false);
  assert.equal(lease.frameAt(30).recorded, true);
  assert.equal(lease.frameAt(60).recorded, true);
  assert.equal(lease.frameAt(61).recorded, false);
  assert.equal(lease.frameAt(61).focus, null);
  assert.equal(plan.beats.find((beat) => beat.name === 'hold').recorded, false);
  assert.equal(lease.frameAt(NaN).recorded, false);
  lease.release();
  assert.equal(lease.frameAt(60), null);
});

test('empty or invalid pose lists cannot turn camera beats into recorded footage', () => {
  for (const samples of [[], [null], [{ ...pose(60), x: Infinity }]]) {
    const plan = shot(samples);
    assert.equal(plan.firstSampleTick, null);
    assert.ok(plan.beats.every((beat) => beat.recorded === false));
    assert.equal(createOfflineCameraLease(plan).frameAt(60).recorded, false);
  }
});
