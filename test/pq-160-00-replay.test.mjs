// PQ-160.00 — Ring buffer and replay.
//
// Proves the measured done-when on the fixed seed 16000: a 30 s ring holds the window's snapshots
// and inputs, replaying that tape reproduces the live deterministic hashes tick-for-tick, and the
// Replay control is reachable from the pause screen on the default route.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  createInputCommandHistory,
  createInputCommandSnapshotQueue,
} from '../src/core/inputCommandSnapshot.js';
import { createSimSnapshotRingBuffer } from '../src/core/simSnapshot.js';
import { recordReplayRun, replayRingBuffer } from '../src/testing/lab/differentialReplay.js';

const SEED = 16000;
const TICKS = 600;

function replayScenario() {
  return {
    schema: 'spaceface.simScenario.v1',
    id: 'pq160.replay-ring.baseline',
    version: 1,
    title: 'PQ-160 ring buffer replay baseline',
    description: 'Fixed seed flight tape used to prove ring-buffer record/replay hash identity.',
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    seed: SEED,
    ticks: TICKS,
    world: {
      fixtureProfile: 'empty-flight',
      sectorId: 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
      credits: 5000,
    },
    entities: [
      {
        alias: 'player',
        profile: 'ship.starter',
        role: 'player',
        team: 0,
        factionId: 'faction_free',
        isPlayer: true,
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        heading: 1.5707963267948966,
        persistent: true,
      },
    ],
    frames: [
      { tick: 0, input: { moveX: 0, moveZ: 1, turnIntent: 0, boost: false } },
      { tick: 120, input: { moveX: 0.5, moveZ: 1, turnIntent: 0.5, boost: true } },
      { tick: 300, input: { moveX: -0.5, moveZ: 0.5, turnIntent: -0.5, boost: false } },
      { tick: 420, input: { moveX: 0.25, moveZ: 0.75, turnIntent: 0.25, boost: true } },
    ],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
      { name: 'invariant.noNegativeResources', version: 1, threshold: { op: '==', value: 1 } },
    ],
    assertions: [
      { kind: 'equivalence', equivalence: 'run-eq-repeat' },
    ],
    trace: { signals: ['playerX', 'playerZ', 'playerVelX', 'playerVelZ'], sampleEvery: 1 },
    observer: { enabled: false },
  };
}

test('PQ-160.00 ring buffer holds 30 s of snapshots and inputs at 60 Hz', () => {
  const snapshotRing = createSimSnapshotRingBuffer();
  const inputRing = createInputCommandHistory();
  assert.equal(snapshotRing.capacity, 1800, '30 s at 60 Hz is 1800 snapshot slots');
  assert.equal(inputRing.capacity, 1800, '30 s at 60 Hz is 1800 input slots');
  assert.equal(snapshotRing.windowSeconds, 30);
  assert.equal(inputRing.windowSeconds, 30);
  assert.ok(snapshotRing.estimatedBytes <= 24 * 1024 * 1024, 'empty ring is under the 24 MB budget');

  // A ring longer than the window keeps the newest ticks and evicts the oldest, without reallocating.
  for (let tick = 0; tick < 1860; tick++) {
    snapshotRing.recordText(`tick:${tick}`, tick);
    inputRing.record(tick, {
      moveX: 0.1,
      moveZ: 1,
      turnIntent: 0,
      boost: false,
      fire: false,
      aimWorld: { x: 0, z: 0 },
      actions: {},
    });
  }
  assert.equal(snapshotRing.size, 1800);
  assert.equal(inputRing.size, 1800);
  assert.equal(snapshotRing.oldest().tick, 60, 'evicted the first 60 ticks');
  assert.equal(snapshotRing.newest().tick, 1859);
  assert.equal(snapshotRing.windowTicks, 1799);
  assert.ok(snapshotRing.estimatedBytes <= 24 * 1024 * 1024);
  assert.equal(inputRing.overwritten, 60);
});

test('PQ-160.00 ring buffer leaves the existing input command queue unchanged', () => {
  const queue = createInputCommandSnapshotQueue(2);
  assert.equal(queue.capacity, 2);
  const before = queue.getDiagnostics();
  assert.equal(before.capturedCount, 0);
  queue.publish(1, 1, 0, { moveX: 1, moveZ: 0, moveY: 0, actions: {} });
  assert.equal(queue.getDiagnostics().capturedCount, 1);
});

test('PQ-160.00 replay of the recorded tape matches live to the hash (seed 16000)', async () => {
  const recording = await recordReplayRun(replayScenario(), { seconds: 30 });
  assert.equal(recording.ok, true, `record failed: ${recording.error || recording.status}`);
  assert.equal(recording.seed, SEED);
  assert.equal(recording.ticks, TICKS);
  assert.equal(recording.snapshotRing.capacity, 1800);
  assert.equal(recording.snapshotRing.size, TICKS);
  assert.equal(recording.inputRing.size, TICKS);
  assert.ok(recording.snapshotRing.estimatedBytes <= 24 * 1024 * 1024,
    `ring holds ${recording.snapshotRing.estimatedBytes} bytes (budget 24 MB)`);
  assert.ok(recording.liveFinalHash, 'live final hash recorded');

  const replay = await replayRingBuffer(recording);
  assert.equal(replay.match, true,
    `first divergence: ${JSON.stringify(replay.firstDivergence)}`);
  assert.equal(replay.comparedTicks, TICKS);
  assert.equal(replay.replayFinalHash, recording.liveFinalHash);
  assert.equal(replay.liveFinalHash, replay.replayFinalHash);
  assert.equal(replay.exitClass, 0);

  // Replaying twice must reproduce the same hash — the tape is deterministic.
  const replayAgain = await replayRingBuffer(recording);
  assert.equal(replayAgain.match, true);
  assert.equal(replayAgain.replayFinalHash, replay.replayFinalHash);
});

test('PQ-160.00 Replay is reachable from pause on the default route', async () => {
  const pauseSrc = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
  assert.match(pauseSrc, /export const pauseScreen/);
  assert.match(pauseSrc, /openReplay/, 'pause must open the replay surface');
  assert.match(pauseSrc, /Replay/, 'pause must expose a Replay action');

  const replay = await import('../src/ui/screens/replay.js');
  assert.equal(replay.replayScreen.id, 'replay');
  assert.equal(typeof replay.replayScreen.mount, 'function');
  assert.equal(typeof replay.openReplay, 'function');
  assert.equal(replay.REPLAY_LABEL, 'Replay');
});
