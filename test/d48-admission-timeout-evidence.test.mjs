// D48 instrumentation (DEMO_READINESS §6): when the authored admission deadline trips, the
// timeout diagnostic must retain the row's evidence contract — the in-flight prepare phase,
// asset/root identity, renderer generation, elapsed wall time, and graphics-context state — so
// a recurrence can be told apart from a native main-thread stall without a live reproduction.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  describeAuthoredUpgradeQueue,
  enqueueBoundaryUpgrade,
  resumeAuthoredUpgradeQueueAfterOpening,
} from '../src/render/partsLibrary.js';

test('D48: admission timeout stamps prepare phase, root identity, generation, elapsed, GL state', async (t) => {
  const scheduled = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  const previousNow = performance.now.bind(performance);
  let fakeNow = 0;
  t.mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  globalThis.requestAnimationFrame = (callback) => scheduled.push(callback);
  globalThis.window = { SF: { state: {
    mode: 'flight', playerId: 'player',
    entities: new Map([['player', { pos: { x: 0, z: 0 } }]]),
    render: {
      firstPlayableFrameAt: 1,
      sectorShellAdmission: false,
      admissionRunGeneration: 7,
      contextLost: false,
    },
  } } };
  performance.now = () => fakeNow;
  const scene = new THREE.Scene();
  let finishStation;
  const station = new THREE.Group();
  station.name = 'critical-hub:2';
  station.userData.authoredAssetState = 'loading';
  scene.add(station);
  const stationEntity = { id: 'station', type: 'station', alive: true, mesh: station };
  try {
    enqueueBoundaryUpgrade(scene, {
      boundary: station, entity: stationEntity, options: {},
      run: () => new Promise((resolve) => { finishStation = resolve; }),
    });
    scheduled.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(describeAuthoredUpgradeQueue(scene).inFlight, 1);
    // Drive the job past the 120 s authored-admission deadline: mock timer clock for the
    // admission setTimeout, fakeNow for the monotonic evidence elapsed.
    fakeNow += 121_000;
    t.mock.timers.tick(121_000);
    for (let i = 0; i < 8 && scheduled.length; i++) {
      scheduled.shift()(0);
      await new Promise((resolve) => setImmediate(resolve));
    }
    await new Promise((resolve) => setImmediate(resolve));
    const diagnostics = scene.userData.authoredUpgradeDiagnostics;
    const record = diagnostics.jobs.find((j) => j.entityId === 'station');
    assert.ok(record, 'the timed-out job leaves a diagnostic record');
    const evidence = record.timeoutEvidence;
    assert.ok(evidence, 'the admission timeout stamps the D48 evidence block');
    // A custom run never entered upgradeBoundary, so the honest phase is pre-decode.
    assert.equal(evidence.preparePhase, 'pre-decode');
    // The stall watchdog may re-mark the boundary 'awaiting-authored-admission' before the
    // late deadline rejection stamps evidence — the recorded state is whichever was live then.
    assert.ok(typeof evidence.authoredAssetState === 'string' && evidence.authoredAssetState.length > 0);
    assert.deepEqual(evidence.assetUrls, record.assetUrls);
    assert.equal(evidence.root.uuid, station.uuid);
    assert.equal(evidence.root.name, 'critical-hub:2');
    assert.equal(evidence.rendererGeneration, 7);
    assert.ok(evidence.elapsedMs >= 120_000,
      `elapsed ${evidence.elapsedMs}ms must cover the admission deadline`);
    assert.equal(evidence.graphicsContext.glContextLost, null,
      'a job with no renderer reports unknown rather than fabricating GL state');
    assert.equal(evidence.graphicsContext.renderContextLost, false);
    assert.equal(evidence.graphicsContext.contextRecoveryPending, false);

    // The field is a live read of the published renderer flag, not a constant: a second job
    // timed out while state.render.contextLost is set must stamp true.
    const station2 = new THREE.Group();
    station2.name = 'aux-hub:9';
    scene.add(station2);
    let finishStation2;
    enqueueBoundaryUpgrade(scene, {
      boundary: station2,
      entity: { id: 'station2', type: 'station', alive: true, mesh: station2 },
      options: {},
      run: () => new Promise((resolve) => { finishStation2 = resolve; }),
    });
    globalThis.window.SF.state.render.contextLost = true;
    scheduled.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    fakeNow += 121_000;
    t.mock.timers.tick(121_000);
    for (let i = 0; i < 8 && scheduled.length; i++) {
      scheduled.shift()(0);
      await new Promise((resolve) => setImmediate(resolve));
    }
    await new Promise((resolve) => setImmediate(resolve));
    const record2 = diagnostics.jobs.find((j) => j.entityId === 'station2');
    assert.ok(record2 && record2.timeoutEvidence,
      'the second timed-out job leaves its own evidence block');
    assert.equal(record2.timeoutEvidence.graphicsContext.renderContextLost, true,
      'a stamp while the published flag is set reports lost, never a fabricated false');
    globalThis.window.SF.state.render.contextLost = false;
    finishStation2?.();
  } finally {
    finishStation?.();
    resumeAuthoredUpgradeQueueAfterOpening(scene);
    performance.now = previousNow;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
