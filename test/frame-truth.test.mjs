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

test('frame truth measures the presented rate, carries 1 Hz probes and classifies the first frame', async () => {
  const { ensureFrameTruth } = await import('../src/core/frameTruth.js');
  const recorder = ensureFrameTruth({ mode: 'flight', world: { currentSectorId: 'ceres' } });

  // First frame: speed is high but there is no previous pose. It must not be a held frame
  // and the streak must stay zero (the old ingest counted the first sample as held).
  recorder.ingestFrame({
    frameDtMs: 16.7, rawFrameDtMs: 16.7, simTimeS: 0, tick: 0,
    playerRow: { pos: { x: 0, z: 0 }, vx: 100, vz: 0 },
  });
  assert.equal(recorder.lastFrame.heldPoseFrames, 0, 'no previous pose cannot be a held frame');
  assert.equal(recorder.heldStreak, 0);

  // A repeat pose at speed is held; dropping below the speed threshold resets the streak.
  recorder.ingestFrame({
    frameDtMs: 16.7, rawFrameDtMs: 16.7, simTimeS: 1 / 60, tick: 1,
    playerRow: { pos: { x: 0, z: 0 }, vx: 100, vz: 0 },
  });
  assert.equal(recorder.lastFrame.heldPoseFrames, 1);
  assert.equal(recorder.heldStreak, 1);
  recorder.ingestFrame({
    frameDtMs: 16.7, rawFrameDtMs: 16.7, simTimeS: 2 / 60, tick: 2,
    playerRow: { pos: { x: 0, z: 0 }, vx: 2, vz: 0 },
  });
  assert.equal(recorder.heldStreak, 0, 'below the speed threshold a still pose is not a freeze');

  // A docked/paused body can retain velocity while the world is frozen. `timeScale === 0`
  // (or the docked flag) must end the streak, not record a fake freeze.
  recorder.ingestFrame({
    frameDtMs: 16.7, rawFrameDtMs: 16.7, simTimeS: 2 / 60, tick: 2,
    timeScale: 0, docked: true,
    playerRow: { pos: { x: 0, z: 0 }, vx: 100, vz: 0 },
  });
  assert.equal(recorder.lastFrame.heldPoseFrames, 0, 'a paused body is not a held frame');
  assert.equal(recorder.heldStreak, 0);
  assert.equal(recorder.lastFrame.heldMs, 0);

  // Wall-time truth: one 2.6 s callback is one held FRAME but 2600 ms of frozen picture.
  recorder.ingestFrame({
    frameDtMs: 250, rawFrameDtMs: 2600, playbackRate: 1, timeScale: 1,
    playerRow: { pos: { x: 0, z: 0 }, vx: 100, vz: 0 },
  });
  assert.equal(recorder.lastFrame.heldPoseFrames, 1);
  assert.ok(recorder.lastFrame.heldMs >= 2600,
    `held wall time records the real callback: ${recorder.lastFrame.heldMs}`);
  assert.ok(recorder.exportJSON({ download: false }).summary.maxHeldMs >= 2600,
    'the summary carries maxHeldMs');
  // The jump bar uses the PRESENTED (clamped) frame dt, not the raw 2.6 s callback.
  assert.ok(Math.abs(recorder.lastFrame.jumpBarWu - 2 * 100 * 0.25) < 1e-9,
    `jump bar uses the clamped presented dt: ${recorder.lastFrame.jumpBarWu}`);

  // The jump bar uses the PRESENTED rate: 100 wu/s body at 0.1x playback is 10 wu/s drawn.
  recorder.ingestFrame({
    frameDtMs: 16.7, rawFrameDtMs: 16.7, playbackRate: 0.1, timeScale: 1,
    playerRow: { pos: { x: 1, z: 0 }, vx: 100, vz: 0 },
  });
  const frame = recorder.lastFrame;
  assert.ok(Math.abs(frame.presentedSpeed - (1 / (16.7 / 1000))) < 1e-6,
    `presented speed is measured from the drawn pose: ${frame.presentedSpeed}`);
  const expectedBar = 2 * 100 * 0.1 * (16.7 / 1000);
  assert.ok(Math.abs(frame.jumpBarWu - expectedBar) < 1e-9,
    `jump bar is 2*speed*playbackRate*dt: ${frame.jumpBarWu} vs ${expectedBar}`);
  assert.ok(Math.abs(frame.jumpRatio - 1 / expectedBar) < 1e-9,
    `jump ratio uses the presented bar: ${frame.jumpRatio}`);

  // A raw 2.6 s rAF gap is clamped by the loop, but the FPS summary must still report it.
  recorder.ingestFrame({ frameDtMs: 250, rawFrameDtMs: 2600, playerRow: null });
  const summary = recorder.exportJSON({ download: false }).summary;
  assert.ok(summary.rawFrame.max >= 2600, 'the raw frame delta survives the loop clamp');
  assert.ok(summary.fps < 1, `the last-frame FPS uses the raw delta: ${summary.fps}`);

  // 1 Hz heap samples are carried across the frames that do not sample it.
  recorder.ingestFrame({ frameDtMs: 16.7, rawFrameDtMs: 16.7, heapMB: 120, playerRow: null });
  recorder.ingestFrame({ frameDtMs: 16.7, rawFrameDtMs: 16.7, heapMB: null, playerRow: null });
  assert.equal(recorder.lastFrame.heapMB, 120, 'the last heap sample carries to the next frame');
  assert.ok(recorder.exportJSON({ download: false }).summary.heapMB.start > 0,
    'the heap start is the first nonzero sample');
});

test('frame truth export carries provenance, timeline events and the live fence', async () => {
  const { ensureFrameTruth } = await import('../src/core/frameTruth.js');
  const state = {
    mode: 'flight',
    world: { currentSectorId: 'helios' },
    meta: { seed: 4242 },
    save: { currentSlot: 'slot-2' },
    settings: {
      graphicsPreset: 'high',
      video: { quality: 'high', motionReduce: true },
      accessibility: { flashReduce: true, reducedMotion: false },
    },
  };
  const recorder = ensureFrameTruth(state);
  const fakeFence = { getPlayoutDiagnostics: () => ({ leadMs: 42, poseEpoch: 9 }) };
  recorder.fenceProvider = () => fakeFence;
  recorder.note = 'simStall=60,60,60,400 simGap=400@0';
  recorder.noteEvent('poseEpoch', { from: 0, to: 9 });
  recorder.ingestFrame({
    frameDtMs: 16.7, rawFrameDtMs: 16.7, playbackRate: 0.5, timeScale: 1,
    poseEpoch: 9, poseSource: 'presented', lane: 'worker', transport: 'worker-local',
    sector: 'helios', simGapApplications: 3, simGapHeldFrames: 12,
    playerRow: { pos: { x: 0, z: 0 }, vx: 100, vz: 0 },
  });
  const trace = recorder.exportJSON({ download: false });
  assert.ok(trace.startedAtEpochMs > 1_000_000_000_000, 'the start carries a real wall-clock epoch');
  assert.ok(trace.exportedAtEpochMs >= trace.startedAtEpochMs);
  assert.equal(trace.note, 'simStall=60,60,60,400 simGap=400@0');
  assert.equal(trace.mode, 'flight');
  assert.equal(trace.sector, 'helios');
  assert.deepEqual(trace.fence, { leadMs: 42, poseEpoch: 9 },
    'the hotkey/default export reads the live fence diagnostics');
  // The fence is honestly nullable before the first fence exists.
  assert.equal(recorder.exportJSON({ download: false, fence: null }).fence, null,
    'trace.fence is null when no fence exists');
  assert.equal(trace.playbackRate, 0.5);
  assert.equal(trace.timeScale, 1);
  assert.equal(trace.poseEpoch, 9);
  assert.equal(trace.poseSource, 'presented');
  // Provenance: a real app version (not the unproduced __SF_BUILD__ claim), seed, slot and
  // the small settings summary, plus the E1 gap-harness counters.
  assert.equal(typeof trace.appVersion, 'string');
  assert.equal(trace.seed, 4242);
  assert.equal(trace.saveSlot, 'slot-2');
  assert.equal(trace.settings.graphicsPreset, 'high');
  assert.equal(trace.settings.motionReduce, true);
  assert.equal(Object.hasOwn(trace, 'build'), false, 'the unproduced build claim is gone');
  assert.equal(trace.buildStamp, null);
  assert.deepEqual(trace.simGap, { applications: 3, heldFrames: 12 });
  assert.ok(trace.events.some((event) => event.kind === 'poseEpoch'
    && event.from === 0 && event.to === 9), 'the timeline carries the epoch change');
  for (const field of ['rawFrameDtMs', 'wallEpochMs', 'playbackRate', 'timeScale',
    'presentedSpeed', 'jumpBarWu', 'jumpRatio', 'allocBytesPerSec', 'popIn', 'poseEpoch',
    'heldMs', 'poseSourceCode', 'laneCode', 'transportCode', 'sectorCode']) {
    assert.ok(Object.hasOwn(trace.columns, field), `column ${field} exists`);
  }
  // Per-frame provenance columns carry the last frame's values and a legend.
  assert.equal(trace.columns.poseSourceCode.at(-1), 2);
  assert.equal(trace.columns.laneCode.at(-1), 2);
  assert.equal(trace.columns.transportCode.at(-1), 2);
  const sectorCode = trace.columns.sectorCode.at(-1);
  assert.equal(trace.provenanceLegend.sector[sectorCode], 'helios');
  // No document in Node: {download:false} must bypass the download path without throwing.
  assert.doesNotThrow(() => recorder.exportJSON({ download: false }));
});

test('frame truth records injected worker stalls on the reply row', async () => {
  const { ensureFrameTruth } = await import('../src/core/frameTruth.js');
  const recorder = ensureFrameTruth({});
  recorder.noteWorkerReply({ wallMs: 100, workMs: 8, stallMs: 400, steps: 1 });
  recorder.noteWorkerReply({ wallMs: 900, workMs: 9, stallMs: 0, steps: 1 });
  const trace = recorder.exportJSON({ download: false });
  assert.deepEqual(trace.replies.stallMs, [400, 0],
    'the injected stall rides the reply row instead of being folded into step work');
  assert.equal(trace.summary.replyStall.max, 400);
});

test('E1 simGap harness withholds completed packs on a wall-clock schedule', async () => {
  const { resolveSimGapSchedule, createSimGapGate } = await import('../src/core/frameTruth.js');
  const schedule = resolveSimGapSchedule('?simGap=400@2000');
  assert.equal(schedule.ms, 400);
  assert.equal(schedule.atMs, 2000);
  const gate = createSimGapGate(schedule, 0);
  assert.equal(gate.shouldHold(1000), false, 'not before the scheduled start');
  assert.equal(gate.shouldHold(2000), true, 'the hold starts on the scheduled frame');
  assert.equal(gate.shouldHold(2399), true);
  assert.equal(gate.shouldHold(2400), false, 'the hold ends after the requested wall time');
  assert.equal(gate.applications, 1);
  assert.equal(gate.heldFrames, 2);
  // Periodic schedule.
  const periodic = createSimGapGate(resolveSimGapSchedule('?simGap=100@0@500'), 0);
  assert.equal(periodic.shouldHold(0), true);
  assert.equal(periodic.shouldHold(100), false);
  assert.equal(periodic.shouldHold(500), true);
  assert.equal(periodic.shouldHold(600), false);
  // Invalid values are warned, never silently used.
  assert.match(resolveSimGapSchedule('?simGap=99999').warning, /ignored/);
  assert.equal(resolveSimGapSchedule('?simLane=worker'), null);
});
