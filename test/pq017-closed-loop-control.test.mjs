import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as pq017Route from '../scripts/lib/pq017WorldSitePublicRoute.mjs';
import {
  PQ017_PRECISION_BRAKE_KEY,
  pq017PrecisionBrakeTargetProjection,
  pq017PublicKeysForDecision,
  predictPq017PrecisionBrakeStopTrajectory,
  projectPq017PilotKeyState,
} from '../scripts/lib/pq017PublicControlTrajectory.mjs';
import {
  DEFAULTS as INPUT_DEFAULTS,
  input,
  projectPilotFlightControls,
  transitionFlightKeyState,
} from '../src/systems/input.js';

test('PQ-017 exact key tape exhaustively shares the production Pilot projection', () => {
  const codes = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'Digit0'];
  for (let mask = 0; mask < (1 << codes.length); mask += 1) {
    const keys = Object.fromEntries(codes.map((code, bit) => [code, (mask & (1 << bit)) !== 0]));
    const expected = projectPilotFlightControls({
      forward: keys.KeyW,
      reverse: keys.KeyS,
      brakeHeld: keys.Digit0,
      yawLeft: keys.KeyA,
      yawRight: keys.KeyD,
      strafeLeft: keys.KeyQ,
      strafeRight: keys.KeyE,
      boost: keys.ShiftLeft,
    });
    const actual = projectPq017PilotKeyState(keys);
    assert.deepEqual(
      {
        moveX: actual.moveX,
        moveZ: actual.moveZ,
        turnIntent: actual.turnIntent,
        boost: actual.boost,
        brake: actual.brake,
      },
      {
        moveX: expected.moveX,
        moveZ: expected.moveZ,
        turnIntent: expected.turnIntent,
        boost: expected.boost,
        brake: expected.brake,
      },
      `Pilot projection drifted for key mask ${mask}`,
    );
  }
});

test('PQ-017 ordinary brake remains the public Pilot S input', () => {
  const keys = pq017PublicKeysForDecision({ action: 'brake' });
  const projected = projectPq017PilotKeyState(keys);
  assert.equal(keys.KeyW, false);
  assert.equal(keys.KeyS, true);
  assert.equal(projected.moveZ, -1);
  assert.equal(projected.brake, true);
  assert.equal(pq017PrecisionBrakeTargetProjection(0.31), 0.5,
    'ordinary S-only braking must retain the pre-chord 0.5 release floor');
});

test('PQ-017 released local precision brake is the production zero-translation Digit0 action', () => {
  for (const scheme of ['pilot', 'helm-assist', 'classic']) {
    assert.deepEqual(INPUT_DEFAULTS.SCHEMES[scheme].brake, ['Digit0'],
      `${scheme} must expose the same rebindable dedicated brake`);
  }
  const keys = pq017PublicKeysForDecision({ action: 'precision-brake' });
  const projected = projectPq017PilotKeyState(keys);
  assert.equal(PQ017_PRECISION_BRAKE_KEY, 'Digit0');
  assert.equal(keys.KeyW, false);
  assert.equal(keys.KeyS, false);
  assert.equal(keys.Digit0, true);
  assert.equal(projected.moveX, 0);
  assert.equal(projected.moveZ, 0);
  assert.equal(projected.brake, true);
});

test('PQ-017 dedicated brake is reachable through live transitions and rebinds while opposing axes remain last-input-wins', async () => {
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    settings: {
      gameplay: { controlScheme: 'pilot' },
      controls: { bindings: null },
    },
    nav: {},
    ui: { screenStack: [] },
    player: { tether: { active: false, targetId: null } },
    entities: { get: () => null },
    input: {
      actions: {},
      aimWorld: { x: 0, z: 0 },
      mouseNdc: { x: 0, y: 0 },
      pointerScreen: { x: 0, y: 0, active: false },
    },
  };
  const host = Object.assign(Object.create(input), {
    _keys: Object.create(null),
    _ndc: { x: 0, y: 0 },
    _screen: { x: 0, y: 0, active: false },
    _m0: false,
    _m1: false,
    _m2: false,
    _lastKbmMs: 0,
    helpers: { raycastToPlane: () => ({ x: 0, z: 0 }) },
    bus: { emit() {} },
    gamepad: null,
    touch: null,
  });

  host._keys = transitionFlightKeyState(state, host._keys, {
    code: 'KeyW',
    pressed: true,
  });
  host._keys = transitionFlightKeyState(state, host._keys, {
    code: 'KeyS',
    pressed: true,
  });
  assert.equal(host._keys.KeyW, false);
  assert.equal(host._keys.KeyS, true);
  host.update(1 / 60, state);
  assert.equal(state.input.moveZ, -1);
  assert.equal(state.input.brake, true);

  host._keys = transitionFlightKeyState(state, host._keys, {
    code: 'KeyS',
    pressed: false,
  });
  host._keys = transitionFlightKeyState(state, host._keys, {
    code: 'Digit0',
    pressed: true,
  });
  host.update(1 / 60, state);
  assert.equal(state.input.moveZ, 0);
  assert.equal(state.input.brake, true);

  const rebound = {
    ...state,
    settings: {
      ...state.settings,
      controls: {
        bindings: {
          forward: ['KeyI'],
          reverse: ['KeyK'],
          yawLeft: ['KeyJ'],
          yawRight: ['KeyL'],
          brake: ['Digit9'],
        },
      },
    },
  };
  let reboundKeys = transitionFlightKeyState(rebound, {}, { code: 'KeyI', pressed: true });
  reboundKeys = transitionFlightKeyState(rebound, reboundKeys, {
    code: 'KeyK',
    pressed: true,
  });
  assert.equal(reboundKeys.KeyI, false);
  assert.equal(reboundKeys.KeyK, true);
  reboundKeys = transitionFlightKeyState(rebound, reboundKeys, {
    code: 'KeyK',
    pressed: false,
  });
  assert.equal(reboundKeys.KeyI, false);
  assert.equal(reboundKeys.KeyK, false);
  reboundKeys = transitionFlightKeyState(rebound, reboundKeys, {
    code: 'Digit9',
    pressed: true,
  });
  assert.equal(reboundKeys.Digit9, true);
  const reboundProjection = projectPilotFlightControls({
    brakeHeld: reboundKeys.Digit9,
  });
  assert.equal(reboundProjection.moveZ, 0);
  assert.equal(reboundProjection.brake, true);

  let lateral = transitionFlightKeyState(rebound, {}, { code: 'KeyJ', pressed: true });
  lateral = transitionFlightKeyState(rebound, lateral, { code: 'KeyL', pressed: true });
  assert.equal(lateral.KeyJ, false, 'A/D-style opposing input remains last-input-wins');
  assert.equal(lateral.KeyL, true);

  const blocked = transitionFlightKeyState(state, { KeyW: true }, {
    code: 'KeyS',
    pressed: true,
    blocked: true,
  });
  assert.equal(blocked.KeyW, true);
  assert.equal(blocked.KeyS, false, 'modal/text fences cannot introduce a reverse command');

  const classic = {
    ...state,
    settings: {
      ...state.settings,
      gameplay: { controlScheme: 'classic' },
    },
  };
  let classicKeys = transitionFlightKeyState(classic, {}, { code: 'KeyW', pressed: true });
  classicKeys = transitionFlightKeyState(classic, classicKeys, { code: 'KeyS', pressed: true });
  assert.equal(classicKeys.KeyW, false);
  assert.equal(classicKeys.KeyS, true,
    'the dedicated brake must not broaden Classic or Helm conflict semantics');

  const { PilotKeyTape } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const tape = new PilotKeyTape(state);
  const reverseFrame = tape.hold(0, { KeyW: true, KeyS: true });
  assert.equal(reverseFrame.keys.KeyW, false);
  assert.equal(reverseFrame.keys.KeyS, true);
  const brakeFrame = tape.hold(1, { Digit0: true });
  assert.equal(brakeFrame.keys.KeyW, false);
  assert.equal(brakeFrame.keys.KeyS, false);
  assert.equal(brakeFrame.keys.Digit0, true);
  const lateralFrame = tape.hold(1, { KeyA: true, KeyD: true });
  assert.equal(lateralFrame.keys.KeyA, false);
  assert.equal(lateralFrame.keys.KeyD, true,
    'the harness must inherit the live event reducer instead of writing impossible key states');
});

test('PQ-017 precision-brake stop proof reaches launch speed monotonically without reversal', () => {
  for (const rotation of [-Math.PI, -Math.PI / 2, -1.361, 0, Math.PI / 2]) {
    const prediction = predictPq017PrecisionBrakeStopTrajectory({
      position: { x: 798.9737548828125, z: -605.9647216796875 },
      velocity: { x: -1.2448176145553589, z: -5.457627296447754 },
      rotation,
      angularVelocity: 0,
    }, pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED);
    assert.equal(prediction.safe, true);
    assert(prediction.end.speed <= pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED);
    assert.equal(prediction.monotonicSpeedReduction, true);
    assert.equal(prediction.signedVelocityPreserved, true);
    assert(prediction.ticks < 600);
  }
});

test('PQ-017 captured Digit0 level hold admits nine ticks only inside its finite full-stop proof', async () => {
  assert.equal(typeof pq017Route.evaluatePq017ReleasedLaunchAppliedBatch, 'function');
  const {
    runPq017CapturedPrecisionBrakeLevelHoldHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const run = await runPq017CapturedPrecisionBrakeLevelHoldHarness();

  assert.equal(run.source, '.tmp-browser-37336-1784838966643-f1408d23');
  assert.equal(run.startTick, 0);
  assert.equal(run.exactBatch.tickDelta, 9);
  assert.equal(run.exactBatch.acceptance.safe, true);
  assert.equal(run.exactBatch.acceptance.accepted, true);
  assert.equal(run.exactBatch.acceptance.reason, 'precision-brake-level-hold-proven');
  assert.equal(run.exactBatch.sweptSegment.safe, true);
  assert(run.exactBatch.sweptSegment.closestConstraint.clearance > 26.74);
  assert(run.exactBatch.endSpeed < run.start.speed);
  assert.equal(run.fullStop.safe, true);
  assert.equal(run.fullStop.monotonicSpeedReduction, true);
  assert.equal(run.fullStop.signedVelocityPreserved, true);
  assert.equal(run.fullStop.corridorSafe, true);
  assert.equal(run.fullStop.ticks, 131);
  assert(run.fullStop.endSpeed <= pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED);
  assert(run.localPlan.precisionBrakeStop.maximumDisplacement > 3.32
    && run.localPlan.precisionBrakeStop.maximumDisplacement < 3.34,
  'the production full-stop predictor must retain the captured 3.329-WU finite budget');
  assert(run.fullStop.maximumDisplacement > 3.35
    && run.fullStop.maximumDisplacement < 3.36,
  'the real Rapier authority path must remain tightly contained around the predictor');
  assert.equal(run.continuedHold.ticks, 120);
  assert.equal(run.continuedHold.speedNonIncreasing, true);
  assert.equal(run.continuedHold.signedVelocityPreserved, true);
  assert.equal(run.continuedHold.reverseObserved, false);
  assert.equal(run.continuedHold.corridorSafe, true);
  assert(run.trajectory.every((sample, index, trajectory) => (
    index === 0 || sample.speed <= trajectory[index - 1].speed + 1e-9
  )), 'the real FlightV3/Rapier Digit0 trajectory must never add speed');
  assert(run.sweeps.every((sweep) => sweep.safe),
    'every authority-owned fixed-tick segment must remain inside the captured corridor');

  const overBudget = pq017Route.evaluatePq017ReleasedLaunchAppliedBatch({
    ...run.exactBatch.proofInput,
    tickDelta: run.localPlan.precisionBrakeHold.maximumSafeHoldTicks + 1,
    endPosition: run.localPlan.precisionBrakeHold.boundary.position,
  });
  assert.equal(overBudget.accepted, false);
  assert.equal(overBudget.reason, 'released-launch-precision-brake-hold-budget-exceeded');

  const corridorMismatch = pq017Route.evaluatePq017ReleasedLaunchAppliedBatch({
    ...run.exactBatch.proofInput,
    precisionBrakeCorridor: {
      ...run.exactBatch.proofInput.precisionBrakeCorridor,
      profiles: [{
        ...run.exactBatch.proofInput.precisionBrakeCorridor.profiles[0],
        trajectory: run.exactBatch.proofInput.precisionBrakeCorridor
          .profiles[0].trajectory.slice(0, -1),
      }],
    },
    tickDelta: 9,
  });
  assert.equal(corridorMismatch.accepted, false);
  assert.equal(corridorMismatch.reason, 'released-launch-precision-brake-proof-invalid');

  const ordinaryDelayed = pq017Route.evaluatePq017ReleasedLaunchAppliedBatch({
    ...run.exactBatch.proofInput,
    decision: { action: 'nudge' },
    keys: { KeyW: true },
    tickDelta: 9,
  });
  assert.equal(ordinaryDelayed.accepted, false);
  assert.equal(ordinaryDelayed.reason, 'released-launch-batch-unbounded');
});

test('PQ-017 captured twenty-tick Digit0 hold uses the finite collision and launch envelope', async () => {
  const {
    runPq017CapturedPrecisionBrakeEnvelopeHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  assert.equal(typeof runPq017CapturedPrecisionBrakeEnvelopeHarness, 'function');
  const run = await runPq017CapturedPrecisionBrakeEnvelopeHarness();

  assert.equal(run.source, '.tmp-browser-18644-1784839684690-72f99d33');
  assert.equal(run.start.speed, 0.3517498389034423);
  assert.equal(run.localPlan.precisionBrakeStop.ticks, 10);
  assert.equal(run.exactBatch.tickDelta, 20);
  assert.equal(run.exactBatch.acceptance.accepted, true);
  assert.equal(run.exactBatch.acceptance.reason, 'precision-brake-level-hold-proven');
  assert.equal(run.exactBatch.sweptSegment.safe, true);
  assert(run.exactBatch.sweptSegment.closestConstraint.clearance > 21.18);
  assert(run.exactBatch.end.speed <= pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED);
  assert(Math.abs(run.exactBatch.end.speed - 0.2603579514406662) < 1e-12);
  assert(Math.abs(run.exactBatch.end.crossTrack - 3.1870867625915857) < 1e-12);
  assert(Math.abs(Math.hypot(
    run.exactBatch.end.position.x - run.start.position.x,
    run.exactBatch.end.position.z - run.start.position.z,
  ) - 0.09980920307373098) < 1e-12);
  assert(run.exactBatch.end.distance <= run.holdProof.envelopeLimit);
  assert.equal(run.holdProof.safe, true);
  assert.equal(run.holdProof.maximumSafeHoldTicks, 393);
  assert.equal(run.holdProof.boundary.reason, 'local-launch-envelope-exceeded');
  assert.equal(run.holdProof.boundary.tick, 394);
  assert(Math.abs(run.holdProof.maximumSafeDisplacement - 1.7595319282201585) < 1e-12);
  assert(Math.abs(run.holdProof.safeEnd.crossTrack - 4.490818182684022) < 1e-12);
  assert(Math.abs(run.holdProof.safeEnd.speed - 0.26707041842208296) < 1e-12);
  assert.equal(run.realHold.monotonicSpeedReduction, true);
  assert.equal(run.realHold.signedVelocityPreserved, true);
  assert.equal(run.realHold.reverseObserved, false);
  assert.equal(run.realHold.corridorSafeThroughBudget, true);
  assert.equal(run.realHold.maximumSafeHoldTicks, 430,
    'the pure 393-tick envelope must remain conservative of the real Rapier boundary');

  const beyondGeometry = pq017Route.evaluatePq017ReleasedLaunchAppliedBatch({
    ...run.exactBatch.proofInput,
    tickDelta: run.holdProof.maximumSafeHoldTicks + 1,
    endPosition: run.predictedBoundary.position,
  });
  assert.equal(beyondGeometry.accepted, false);
  assert.equal(beyondGeometry.reason, 'released-launch-precision-brake-hold-budget-exceeded');

  const observedOutsideEnvelope = pq017Route.evaluatePq017ReleasedLaunchAppliedBatch({
    ...run.exactBatch.proofInput,
    tickDelta: run.exactBatch.tickDelta,
    endPosition: run.predictedBoundary.position,
  });
  assert.equal(observedOutsideEnvelope.accepted, false);
  assert.equal(
    observedOutsideEnvelope.reason,
    'released-launch-precision-brake-observed-envelope-exceeded',
  );
});

test('PQ-017 captured released-detour handoff uses the shared 0.3 launch controller', async () => {
  assert.equal(pq017Route.PQ017_RELEASED_DETOUR_SETTLED_SPEED, 0.5);
  assert.equal(pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED, 0.3);
  const {
    runPq017CapturedReleasedDetourLaunchHarness,
    runPq017ElectronTerminalRegressionHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const handoff = await runPq017CapturedReleasedDetourLaunchHarness();
  assert.deepEqual(handoff.start.velocity, {
    x: -1.2448176145553589,
    z: -5.457627296447754,
  });
  assert(Math.abs(handoff.start.speed - 5.597791225156483) < 1e-12);
  assert.deepEqual(handoff.rotationMatrix, [-Math.PI, -Math.PI / 2, -1.361, 0, Math.PI / 2]);
  assert.equal(handoff.crossingPlan.safe, true);
  assert(handoff.runs.every((run) => (
    run.converged
    && run.finalGate.distance <= handoff.crossingPlan.launchGate.arrivalRadius
    && run.finalGate.crossTrack <= handoff.crossingPlan.launchGate.maxPlayerCrossTrack
    && run.finalGate.speed <= pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED
    && run.unsafeAppliedSegments === 0
    && run.collision === false
    && run.precisionBrakeBatchesMonotonic === true
    && run.publicBrakeEventProven === true
    && run.sweptBatches.length < 1200
    && run.sweptBatches.every((batch) => [1, 2, 4].includes(batch.ticks))
  )), 'the captured inside-gate handoff must converge safely for every heading and tick schedule');

  const launch = await runPq017ElectronTerminalRegressionHarness();
  assert(launch.scheduleRuns.every((run) => (
    run.converged
    && run.finalGate.speed <= pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED
  )), 'the separate local launch controller must retain exact 0.3 readiness');
});

function releasedLaunchFixture({
  position = { x: 7, z: 0 },
  velocity = { x: 0, z: 0 },
  rotation = Math.PI,
  angularVelocity = 0,
} = {}) {
  return {
    navigation: { position, velocity, rotation, angularVelocity },
    crossingPlan: {
      safe: true,
      releasedDetour: true,
      stoppingDistance: 4,
      launchGate: {
        center: { x: 0, z: 0 },
        direction: { x: 1, z: 0 },
        farSideOrigin: { x: -20, z: 0 },
        arrivalRadius: 6,
        maxServiceSpeed: 6,
        maxPlayerCrossTrack: 1,
      },
      routeSafety: { obstacles: [], playerRadius: 14 },
    },
  };
}

test('PQ-017 released launch controller uses precision brake down to launch readiness', () => {
  for (const speed of [4, 1.2, 0.607, 0.301]) {
    const fixture = releasedLaunchFixture({
      position: { x: 5, z: 0 },
      velocity: { x: speed, z: 0 },
      rotation: 0,
    });
    const control = pq017Route.decidePq017ReleasedLaunchGateControl(fixture);
    assert.equal(control.action, 'precision-brake');
    assert.equal(pq017PublicKeysForDecision(control).KeyW, false);
    assert.equal(pq017PublicKeysForDecision(control).KeyS, false);
    assert.equal(pq017PublicKeysForDecision(control).Digit0, true);
  }
});

test('PQ-017 released launch controller admits precision brake only when 1/2/4 ticks are monotonic', () => {
  const safe = pq017Route.decidePq017ReleasedLaunchGateControl(releasedLaunchFixture({
    position: { x: 5, z: 0 },
    velocity: { x: 4, z: 0 },
    rotation: 0,
  }));
  assert.equal(safe.action, 'precision-brake');
  assert.equal(safe.brakeAudit.admissible, true);
  assert.deepEqual(safe.brakeAudit.tickCounts, [1, 2, 4]);
  assert(safe.brakeAudit.profiles.every((profile) => (
    profile.monotonicSpeedReduction
    && profile.signedVelocityPreserved
    && profile.speedReduced
  )));

  assert.deepEqual(pq017PublicKeysForDecision(safe), {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    KeyQ: false,
    KeyE: false,
    ShiftLeft: false,
    Digit0: true,
  });
});

test('PQ-017 released launch yaw coasts inside its angular stopping angle', () => {
  const control = pq017Route.decidePq017ReleasedLaunchGateControl(releasedLaunchFixture({
    position: { x: 7, z: 0 },
    velocity: { x: 0.2, z: 0 },
    rotation: Math.PI - 0.05,
    angularVelocity: 0.5,
  }));
  assert.equal(control.action, 'coast');
  assert.equal(control.reason, 'target-yaw-damping');
  assert.equal(control.appliedTurnDirection, 0);
});

test('PQ-017 released launch controller inserts neutral observation before a second W nudge', () => {
  const fixture = releasedLaunchFixture({
    position: { x: 7, z: 0 },
    velocity: { x: 0.2, z: 0 },
    rotation: Math.PI,
  });
  const first = pq017Route.decidePq017ReleasedLaunchGateControl(fixture);
  assert.equal(first.action, 'nudge');
  assert.equal(pq017PublicKeysForDecision(first).KeyW, true);

  const second = pq017Route.decidePq017ReleasedLaunchGateControl({
    ...fixture,
    controllerState: first.nextState,
  });
  assert.equal(second.action, 'coast');
  assert.equal(second.reason, 'nudge-neutral-observation');
  assert.equal(pq017PublicKeysForDecision(second).KeyW, false);
});

test('PQ-017 real Hitch control loop contains captured run38-run41 trajectories', async () => {
  const {
    PQ017_CAPTURED_CONTROL_SEEDS,
    runPq017ClosedLoopControlHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const result = await runPq017ClosedLoopControlHarness();
  const repeat = await runPq017ClosedLoopControlHarness();

  assert.deepEqual(
    result.captureIds,
    PQ017_CAPTURED_CONTROL_SEEDS.map((entry) => entry.id),
    'the fast harness must keep every captured run38-run41 control failure in the sweep',
  );
  assert.deepEqual(result.profileIds, ['single-tick', 'nominal-catchup', 'loaded-catchup']);
  assert(result.systems.includes('flight'), 'the harness must execute Flight V3');
  assert(result.systems.includes('physics'), 'the harness must execute Rapier through physics authority');
  assert.equal(result.sg02Ready, true);
  assert.equal(result.runs.length, result.captureIds.length * result.profileIds.length);
  assert(result.runs.every((run) => (
    run.trace.length === run.fixedTicks + 1
    && (run.fixedTicks > 0 || run.replanCount > 0)
  )), 'a blocked first batch must fail closed without manufacturing a simulation tick');
  assert(result.runs.every((run) => run.tickBatches.every((ticks) => (
    Number.isInteger(ticks) && ticks >= 1 && ticks <= 4
  ))), 'every public-key hold must be expressed as bounded exact fixed-tick batches');
  assert(result.runs.every((run) => run.unsafeAppliedSegments === 0),
    'the route planner must never apply a public-control batch after its sweep becomes unsafe');
  assert(
    result.runs
      .filter((run) => run.captureId === 'run38-stalled-forward-hold')
      .every((run) => run.playerDisplacement > 0.01),
    'a real W tape must move the Hitch; stale received-key state cannot count as progress',
  );
  assert.equal(result.defect.captureId, 'run41-loaded-released-payload-sweep');
  assert.equal(result.defect.plannerAction, 'replan');
  assert.equal(result.defect.unprotectedUnsafe, true,
    'the actual Rapier replay must expose the loaded-batch crossing hidden by the old 2-WU brake ray');
  assert(result.defect.trajectory.length > 2);
  assert.match(result.deterministicDigest, /^[a-f0-9]{64}$/);
  assert.equal(repeat.deterministicDigest, result.deterministicDigest,
    'fixed seeds, keys, batch jitter, and Rapier ticks must produce the same semantic trace');
});

test('PQ-017 Electron terminal state finishes by a local safe leg instead of restarting the ring', async () => {
  const {
    PQ017_ELECTRON_TERMINAL_SEED,
    runPq017ElectronTerminalRegressionHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const result = await runPq017ElectronTerminalRegressionHarness();

  assert.equal(result.source, '.tmp-electron-27932-1784827183938-d08203cf');
  assert.deepEqual(result.observed, {
    position: { x: 799.0679931640625, z: -613.1228637695312 },
    velocity: {
      x: -0.0028143932577222586,
      z: -0.28386110067367554,
    },
    rotation: 2.246090170258179,
  });
  assert.deepEqual(PQ017_ELECTRON_TERMINAL_SEED.target, {
    x: 802.5508593689617,
    z: -607.028041301013,
  });
  assert.equal(result.sg02Ready, true);
  assert(result.systems.includes('flight'));
  assert(result.systems.includes('physics'));
  assert(Math.abs(result.arrival.distance - 7.01977335275036) < 1e-12);
  assert(Math.abs(result.arrival.excessDistance - 1.01977335275036) < 1e-12);
  assert(result.arrival.speed < result.arrival.maxSettledSpeed);
  assert(result.arrival.distance
    <= result.arrival.settledRadius + result.arrival.stoppingDistance,
  'the terminal state is inside the crossing plan local stopping envelope');
  assert.equal(result.decision.action, 'approach');
  assert.equal(result.controlPlan.safe, true,
    'the next public-control batch is collision-safe from the captured terminal state');
  assert.equal(result.directSweep.safe, true,
    'the complete local leg to the launch target is collision-safe');
  assert.equal(result.crossingPlan.safe, true);
  assert.deepEqual(result.crossingPlan.launchGate, result.expectedLaunchGate,
    'the crossing plan must name the canonical launch gate without claiming runtime control safety');
  assert.equal(result.localLeg.converged, true,
    `the real fixed-tick Pilot loop must converge from ${result.arrival.excessDistance.toFixed(3)} `
      + 'WU outside the canonical gate');
  assert(result.localLeg.fixedTicks > 0, 'local convergence must execute real simulation ticks');
  assert.equal(result.localLeg.planningBudget.cycle3Local.action, 'local-convergence',
    'cycle three must retain the separately bounded local correction');
  assert.equal(result.localLeg.planningBudget.cycle3Ring.action, 'blocked',
    'cycle three must not authorize another full-ring restart');
  assert.equal(result.localLeg.unsafeAppliedSegments, 0);
  assert.equal(result.localLeg.collision, false);
  assert(result.localLeg.sweptBatches.length > 0);
  assert(result.localLeg.sweptBatches.every((batch) => (
    batch.controlPlanSafe === true
    && batch.sweeps.length === batch.ticks
    && batch.sweeps.every((sweep) => sweep.safe === true)
  )), 'every applied public-control batch and authority-owned fixed-tick segment must remain safe');
  assert(result.localLeg.finalGate.distance <= result.crossingPlan.launchGate.arrivalRadius);
  assert(result.localLeg.finalGate.speed <= pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED,
    'the real Flight V3/Rapier replay must reach production preparation speed, not stop at 6 WU/s');
  assert(result.localLeg.finalGate.crossTrack
    <= result.crossingPlan.launchGate.maxPlayerCrossTrack);
  assert(result.localLeg.braking.authorizedPlans > 0,
    'every real terminal brake/coast batch must carry production planner authorization');
  assert(result.localLeg.braking.batches.every((batch) => (
    [1, 2, 4].includes(batch.ticks)
    && batch.controlPlanSafe === true
    && batch.sweeps.length === batch.ticks
    && batch.sweeps.every((sweep) => sweep.safe === true)
  )), 'terminal braking must remain safe across exact fixed-tick public Pilot batches');
  assert.deepEqual(result.scheduleRuns.map((run) => run.schedule), [[1], [2], [4], [1, 2, 4]]);
  assert(result.scheduleRuns.every((run) => (
    run.converged
    && run.finalGate.distance <= result.crossingPlan.launchGate.arrivalRadius
    && run.finalGate.crossTrack <= result.crossingPlan.launchGate.maxPlayerCrossTrack
    && run.finalGate.speed <= pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED
    && run.unsafeAppliedSegments === 0
    && run.collision === false
    && run.sweptBatches.every((batch) => [1, 2, 4].includes(batch.ticks))
  )), 'every deterministic 1/2/4 fixed-tick schedule must converge through the shared FSM');
  assert(result.scheduleRuns.every((run) => run.noSecondNudgeBeforeSettled === true),
    'the shared FSM must not apply a second W nudge before observing <=0.3 wu/s');
});

test('PQ-017 launch gate is inclusive only at the exact distance, speed, and cross-track contract', async () => {
  const {
    runPq017ElectronTerminalRegressionHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const result = await runPq017ElectronTerminalRegressionHarness();
  const gate = result.expectedLaunchGate;
  const d = gate.direction;
  const perpendicular = { x: d.z, z: -d.x };
  const point = (along, cross) => ({
    x: gate.center.x + d.x * along + perpendicular.x * cross,
    z: gate.center.z + d.z * along + perpendicular.z * cross,
  });
  const evaluate = (position, speed) => pq017Route.evaluatePq017LaunchGate({
    position,
    velocity: { x: d.x * speed, z: d.z * speed },
  }, gate);

  assert.equal(typeof pq017Route.evaluatePq017LaunchGate, 'function');
  assert.equal(typeof pq017Route.projectPq017LaunchGateAim, 'function');
  assert.equal(typeof pq017Route.planPq017ReleasedLaunchGateConvergence, 'function');
  assert.equal(evaluate(point(-6, 0), 6).accepted, true);
  assert.equal(evaluate(point(0, 1), 6).accepted, true);
  assert.equal(evaluate(point(-6.01, 0), 0).accepted, false);
  assert.equal(evaluate(point(0, 1.01), 0).accepted, false);
  assert.equal(evaluate(point(0, 0), 6.01).accepted, false);

  const projection = pq017Route.projectPq017LaunchGateAim(
    result.observed.position,
    gate,
  );
  assert.equal(projection.safe, true);
  assert.equal(projection.waypoint.phase, 'local-launch-gate');
  assert.equal(projection.waypoint.arrivalRadius, gate.maxPlayerCrossTrack);
  assert.equal(projection.waypoint.maxApproachSpeed, gate.maxServiceSpeed);
  assert.equal(
    projection.waypoint.maxSettledSpeed,
    pq017Route.PQ017_RELEASED_LAUNCH_READY_SPEED,
    'the local approach must settle to explicit preparation readiness before gate completion',
  );
  assert(Math.abs(projection.waypoint.x - 797.9739957848575) < 1e-6);
  assert(Math.abs(projection.waypoint.z - (-609.424888075565)) < 1e-6);
  assert(projection.farSideLead > 0);
});

test('PQ-017 launch gate rejects coerced and contradictory telemetry fail-closed', async () => {
  const {
    runPq017ElectronTerminalRegressionHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const result = await runPq017ElectronTerminalRegressionHarness();
  const gate = result.expectedLaunchGate;
  const stationary = {
    position: { ...gate.center },
    velocity: { x: 0, z: 0 },
  };
  const contradictory = pq017Route.evaluatePq017LaunchGate({
    ...stationary,
    velocity: { x: 100, z: 0 },
    speed: 0,
  }, gate);
  assert.equal(contradictory.accepted, false);
  assert.equal(contradictory.reason, 'launch-gate-observation-invalid');
  assert(contradictory.failures.includes('speed-velocity-disagreement'));

  for (const invalid of [
    { observation: stationary, gate: { ...gate, arrivalRadius: true } },
    {
      observation: { ...stationary, position: { ...gate.center, x: `${gate.center.x}` } },
      gate,
    },
    {
      observation: { ...stationary, velocity: { x: true, z: 0 } },
      gate,
    },
  ]) {
    const evaluation = pq017Route.evaluatePq017LaunchGate(
      invalid.observation,
      invalid.gate,
    );
    assert.equal(evaluation.accepted, false);
    assert.equal(evaluation.reason, 'launch-gate-observation-invalid');
  }

  const contradictoryPlan = pq017Route.planPq017ReleasedLaunchGateConvergence({
    navigation: {
      position: { ...gate.center },
      velocity: { x: 100, z: 0 },
      speed: 0,
      rotation: 0,
      angularVelocity: 0,
    },
    payloadSettled: true,
    tetherActive: false,
    crossingPlan: result.crossingPlan,
  });
  assert.equal(contradictoryPlan.safe, false);
  assert.notEqual(contradictoryPlan.action, 'complete');
  assert.equal(contradictoryPlan.reason, 'local-launch-telemetry-invalid');
});

test('PQ-017 released local convergence requires the near envelope and fixed-tick proofs', async () => {
  assert.equal(typeof pq017Route.planPq017ReleasedLaunchGateConvergence, 'function');
  const {
    runPq017ElectronTerminalRegressionHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const result = await runPq017ElectronTerminalRegressionHarness();
  const crossingPlan = result.crossingPlan;
  const base = {
    navigation: {
      position: result.observed.position,
      velocity: result.observed.velocity,
      rotation: result.observed.rotation,
      angularVelocity: 0,
    },
    payloadSettled: true,
    tetherActive: false,
    crossingPlan,
  };
  const local = pq017Route.planPq017ReleasedLaunchGateConvergence(base);
  assert.equal(local.safe, true);
  assert.equal(local.action, 'local-convergence');
  assert.equal(local.canonicalSweep.safe, true);
  assert.equal(local.controlPlan.safe, true);
  assert.equal(local.controlPlan.envelopeSafe, true);
  assert.equal(local.controlPlan.nudgeProgress, true);
  assert.deepEqual(
    { x: local.waypoint.x, z: local.waypoint.z },
    crossingPlan.launchGate.center,
    'the route-only FSM must converge on the stable gate center, not a moving projected aim',
  );

  const d = result.expectedLaunchGate.direction;
  const outside = pq017Route.planPq017ReleasedLaunchGateConvergence({
    ...base,
    navigation: {
      ...base.navigation,
      position: {
        x: result.expectedLaunchGate.center.x - d.x * 7.5001,
        z: result.expectedLaunchGate.center.z - d.z * 7.5001,
      },
      velocity: { x: 0, z: 0 },
    },
  });
  assert.equal(outside.safe, false);
  assert.equal(outside.reason, 'outside-local-stopping-envelope');

  const tooFast = pq017Route.planPq017ReleasedLaunchGateConvergence({
    ...base,
    navigation: {
      ...base.navigation,
      velocity: { x: d.x * 6.01, z: d.z * 6.01 },
    },
  });
  assert.equal(tooFast.safe, false);
  assert.equal(tooFast.reason, 'local-launch-speed-exceeded');

  const canonicalSweepBlocked = pq017Route.planPq017ReleasedLaunchGateConvergence({
    ...base,
    crossingPlan: {
      ...crossingPlan,
      routeSafety: {
        playerRadius: 0,
        obstacles: [{
          x: (result.observed.position.x + crossingPlan.launchGate.center.x) / 2,
          z: (result.observed.position.z + crossingPlan.launchGate.center.z) / 2,
          radius: 0.1,
        }],
      },
    },
  });
  assert.equal(canonicalSweepBlocked.safe, false);
  assert.equal(canonicalSweepBlocked.reason, 'local-launch-canonical-sweep-blocked');

  const payload = {
    entityId: 'released-payload',
    type: 'world_site_payload',
    x: 757.0526123046875,
    z: -620.4880981445312,
    radius: 24,
    allowEscapeFromOverlap: true,
  };
  const sweptCurrent = { x: 792.9730834960938, z: -608.4256591796875 };
  const start = { x: 793.3658447265625, z: -608.3382568359375 };
  const sweptLength = Math.hypot(sweptCurrent.x - start.x, sweptCurrent.z - start.z);
  const batchUnsafe = pq017Route.planPq017ReleasedLaunchGateConvergence({
    navigation: {
      position: start,
      velocity: {
        x: (sweptCurrent.x - start.x) / sweptLength * 1.2811530535486186,
        z: (sweptCurrent.z - start.z) / sweptLength * 1.2811530535486186,
      },
      rotation: -0.3554351576947674,
      angularVelocity: 0,
    },
    payloadSettled: true,
    tetherActive: false,
    crossingPlan: {
      ...crossingPlan,
      target: { x: 801.298461041391, z: -607.3985468428217 },
      launchGate: {
        ...result.expectedLaunchGate,
        center: { x: 801.298461041391, z: -607.3985468428217 },
      },
      stoppingDistance: 2,
      routeSafety: { obstacles: [payload], playerRadius: 14 },
    },
  });
  assert.equal(batchUnsafe.canonicalSweep.safe, true,
    'the adversary must isolate the public-control trajectory from the full direct sweep');
  assert.equal(batchUnsafe.safe, false);
  assert.equal(batchUnsafe.reason, 'local-launch-precision-stop-corridor-blocked');
  assert.equal(batchUnsafe.precisionBrakeCorridor.safe, false,
    'the complete precision-brake trajectory may not cross the payload exclusion');
});

test('PQ-017 fresh payload settlement blocks a correction before local input', async () => {
  assert.equal(typeof pq017Route.planPq017ReleasedLaunchGateCorrection, 'function');
  const {
    runPq017ElectronTerminalRegressionHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const result = await runPq017ElectronTerminalRegressionHarness();
  const correction = pq017Route.planPq017ReleasedLaunchGateCorrection({
    geometry: {
      tick: 11,
      player: {
        x: result.observed.position.x,
        z: result.observed.position.z,
        vx: result.observed.velocity.x,
        vz: result.observed.velocity.z,
        rot: result.observed.rotation,
        angVel: 0,
      },
      payload: { x: 757.0526123046875, z: -620.4880981445312, vx: 2, vz: 0 },
      payloadAlive: true,
      tether: { active: false },
    },
    settlementRuntime: {
      origin: { x: 757.0526123046875, z: -620.4880981445312 },
      position: { x: 757.0526123046875, z: -620.4880981445312 },
      stableSamples: 4,
      lastTick: 10,
    },
    crossingPlan: result.crossingPlan,
  });
  assert.equal(correction.safe, false);
  assert.equal(correction.reason, 'released-payload-not-settled');
  assert.equal(correction.settlement.action, 'wait');
  assert.equal(correction.inputAuthorized, false);
  assert.equal(correction.localPlan, null,
    'an unsettled fresh payload sample must stop before local-control planning');
});

test('PQ-017 preparation budget keeps cycle-three local correction but forbids another ring', () => {
  assert.equal(typeof pq017Route.decidePq017ReleasedPreparationStep, 'function');
  const local = pq017Route.decidePq017ReleasedPreparationStep({
    planningCycle: 3,
    launchAccepted: false,
    crossingPlan: { safe: true, shipRoute: { direct: false } },
    localPlan: { safe: true, action: 'local-convergence' },
  });
  assert.equal(local.action, 'local-convergence');
  assert.equal(local.ringAuthorized, false);

  const ring = pq017Route.decidePq017ReleasedPreparationStep({
    planningCycle: 3,
    launchAccepted: false,
    crossingPlan: { safe: true, shipRoute: { direct: false } },
    localPlan: { safe: false, action: 'replan' },
  });
  assert.equal(ring.action, 'blocked');
  assert.equal(ring.reason, 'released-ring-planning-budget-exhausted');
  assert.equal(ring.ringAuthorized, false);
});

test('ordinary real Massline survives thrust, boost, and slack snaps until the pilot cuts it', async () => {
  const {
    runPq017OrdinaryMasslineDurabilityHarness,
  } = await import('../scripts/lib/pq017ClosedLoopControlHarness.mjs');
  const result = await runPq017OrdinaryMasslineDurabilityHarness();

  assert.equal(result.sg02Ready, true);
  assert(result.systems.includes('flight'));
  assert(result.systems.includes('physics'));
  assert(result.systems.includes('tetherGameplay'));
  assert.equal(result.ordinaryEndpoint, true);
  assert.equal(result.automaticBreakAllowed, false);
  assert.equal(result.attachmentActiveBeforeCut, true,
    'ordinary thrust and slack-snap loads must leave the live attachment active');
  assert.deepEqual(result.automaticBreakEvents, [],
    'neither physical nor gameplay break authority may sever an ordinary line');
  assert(result.phases.some((phase) => phase.id === 'slack-approach' && phase.sawSlack));
  assert(result.phases.some((phase) => (
    phase.id === 'slack-snap'
    && phase.sawTaut
    && phase.maxTension > 0
    && phase.maxStretch > 0
  )), 'the snap phase must prove a physically loaded line, not only an active attachment record');
  assert(result.phases.some((phase) => (
    phase.id === 'sustained-taut-thrust' && phase.boost && phase.maxTension > 0
  )), 'sustained boosted thrust must remain physically loaded without severing the line');
  assert.equal(result.manualCut.reason, 'tether_cut');
  assert.equal(result.manualCut.releasedEvents, 1);
  assert.equal(result.manualCut.attachmentActive, false);
});

test('PQ-017 route preflights complete public-control displacement instead of a fixed brake ray', () => {
  assert.equal(
    typeof pq017Route.planPq017RouteSafeDisplacement,
    'function',
    'the route needs one structural all-control displacement planner',
  );

  const payload = {
    entityId: 'released-payload',
    type: 'world_site_payload',
    x: 757.0526123046875,
    z: -620.4880981445312,
    radius: 24,
    allowEscapeFromOverlap: true,
  };
  const sweptCurrent = { x: 792.9730834960938, z: -608.4256591796875 };
  const sweptDx = sweptCurrent.x - 793.3658447265625;
  const sweptDz = sweptCurrent.z - (-608.3382568359375);
  const sweptLength = Math.hypot(sweptDx, sweptDz);
  const navigation = {
    position: { x: 793.3658447265625, z: -608.3382568359375 },
    // The failure report gives both endpoints of the unobserved batch. Seed the planner with that
    // measured travel direction at the captured 1.281153 WU/s, rather than pretending the final
    // post-turn velocity describes the complete swept segment.
    velocity: {
      x: sweptDx / sweptLength * 1.2811530535486186,
      z: sweptDz / sweptLength * 1.2811530535486186,
    },
    rotation: -0.3554351576947674,
    angularVelocity: 0,
  };
  const decision = {
    action: 'approach',
    reason: 'within-speed-envelope',
    thrust: false,
    appliedTurnDirection: 1,
    brakePulseMs: 0,
  };

  const fixedBrakeRay = pq017Route.planPq017RouteSafeBrakePulse(
    navigation.position,
    navigation.velocity,
    [payload],
    14,
  );
  assert.equal(fixedBrakeRay.safe, true,
    'the former opposite-velocity 2-WU ray misses this captured loaded-turn trajectory');

  const structural = pq017Route.planPq017RouteSafeDisplacement(
    navigation,
    decision,
    [payload],
    14,
  );
  assert.equal(structural.safe, false);
  assert.equal(structural.action, 'replan');
  assert.equal(structural.reason, 'public-control-displacement-blocked');
  assert(structural.profiles.some((profile) => profile.sweep.safe === false),
    'at least one deterministic fixed-tick batching profile must expose the full-radius crossing');
  assert(structural.profiles.every((profile) => profile.trajectory.length > 1),
    'the planner must audit trajectories, not isolated endpoints');
  assert.equal(structural.closestConstraint.exclusionRadius, 38,
    'the payload plus Hitch exclusion remains fully enforced');
});

test('PQ-017 exact keyup receipt isolates active hold ticks from collection latency', () => {
  assert.equal(typeof pq017Route.selectPq017LocalControlKeyBatch, 'function');
  const player = {
    x: 795.2,
    z: -609.55,
    vx: -0.25,
    vz: -0.04,
    rot: 2.5,
    angVel: -0.17,
  };
  const receipts = [
    {
      sequence: 9,
      token: 'KeyA:old:9',
      code: 'KeyA',
      edge: 'keydown',
      tick: 5259,
      player,
    },
    {
      sequence: 10,
      token: 'KeyA:old:9',
      code: 'KeyA',
      edge: 'keyup',
      tick: 5260,
      player,
    },
    {
      sequence: 11,
      token: 'KeyA:2:11',
      code: 'KeyA',
      edge: 'keydown',
      tick: 5260,
      player,
    },
    {
      sequence: 12,
      token: 'KeyA:2:11',
      code: 'KeyA',
      edge: 'keyup',
      tick: 5262,
      player,
    },
    {
      sequence: 13,
      token: 'KeyD:3:13',
      code: 'KeyD',
      edge: 'keydown',
      tick: 5262,
      player,
    },
  ];
  const batch = pq017Route.selectPq017LocalControlKeyBatch(
    receipts,
    'KeyA',
    10,
  );
  assert.equal(batch.code, 'KeyA');
  assert.equal(batch.keydown.sequence, 11);
  assert.equal(batch.keydown.edge, 'keydown');
  assert.equal(batch.keyup.sequence, 12);
  assert.equal(batch.keyup.edge, 'keyup');
  assert.equal(batch.activeHoldTicks, 2,
    'the active hold spans matching keydown to keyup, not plan or collection latency');
  assert.equal(pq017Route.pq017LocalControlKeydownMatchesAuthorization(
    batch.keydown,
    5260,
    player,
  ), true);
  assert.equal(pq017Route.pq017LocalControlKeydownMatchesAuthorization(
    {
      ...batch.keydown,
      tick: 5261,
      player: { ...player, x: player.x + 0.001 },
    },
    5260,
    player,
  ), false, 'neutral drift before keydown must invalidate the stale pre-action proof');
  assert.equal(5272 - 5260, 12,
    'the captured twelve-tick collection delta remains explicitly distinct');
  assert.equal(pq017Route.selectPq017LocalControlKeyBatch(
    [...receipts, { ...batch.keyup, sequence: 14, tick: 5263 }],
    'KeyA',
    10,
  ), null, 'multiple matching edges after the baseline must fail closed');
  assert.equal(pq017Route.selectPq017LocalControlKeyBatch(
    receipts,
    'Digit0',
    10,
  ), null, 'a missing exact-code batch must fail closed');
  assert.equal(pq017Route.selectPq017LocalControlKeyBatch(
    [
      { ...batch.keydown, token: 'KeyA:mismatch' },
      batch.keyup,
    ],
    'KeyA',
    10,
  ), null, 'a mismatched batch token must fail closed');
  assert.equal(pq017Route.selectPq017LocalControlKeyBatch(
    [
      batch.keydown,
      { ...batch.keyup, player: { ...player, x: NaN } },
    ],
    'KeyA',
    10,
  ), null, 'nonfinite receipt geometry must fail closed');
});

test('PQ-017 released detour honors the crossing plan arrival contract and replans unsafe control', async () => {
  const source = await readFile(
    new URL('../scripts/lib/pq017WorldSitePublicRoute.mjs', import.meta.url),
    'utf8',
  );
  const detour = source.match(
    /async function flyPq017ReleasedReceiverDetour[\s\S]*?\n}\r?\n\r?\nasync function flyPq017ReleasedLaunchGateConvergence/,
  )?.[0] || '';
  const preparation = source.match(
    /async function preparePq017ReleasedReceiverCrossing[\s\S]*?\n}\r?\n\r?\nasync function deliverPayloadToSelectedReceiver/,
  )?.[0] || '';

  assert.match(
    detour,
    /waypoint\.phase === 'launch'\s*\?\s*crossingPlan\.arrivalRadius/,
    'the executor must use the geometry plan arrival radius instead of inventing 0.75 WU',
  );
  assert.match(
    detour,
    /waypoint\.phase === 'launch'\s*\?\s*crossingPlan\.maxServiceSpeed/,
    'the executor must use the geometry plan service-speed contract instead of inventing 2 WU/s',
  );
  assert.match(
    detour,
    /replanOnUnsafeControl:\s*true/,
    'a control trajectory that would leave the proven corridor must return to the bounded replanner',
  );
  assert.doesNotMatch(detour, /waypoint\.phase === 'launch'\s*\?\s*0\.75/);
  assert.doesNotMatch(detour, /maxSettledSpeed:\s*waypoint\.phase === 'launch'\s*\?\s*2/);
  assert.match(
    preparation,
    /planPq017ReleasedLaunchGateConvergence[\s\S]*flyPq017ReleasedLaunchGateConvergence/,
    'released preparation must execute the separately bounded local correction when it is safe',
  );
  assert.match(
    preparation,
    /flyPq017ReleasedLaunchGateConvergence[\s\S]*evaluatePq017LaunchGate[\s\S]*return diagnostic/,
    'preparation may return only after the post-brake live state still satisfies the launch gate',
  );
  const localRunner = source.match(
    /async function flyPq017ReleasedLaunchGateConvergence[\s\S]*?\n}\r?\n\r?\nasync function preparePq017ReleasedReceiverCrossing/,
  )?.[0] || '';
  assert.doesNotMatch(localRunner, /payloadSettled:\s*true/,
    'each correction must consume a fresh deterministic payload settlement decision');
  assert.match(localRunner,
    /planPq017ReleasedLaunchGateCorrection[\s\S]*inputAuthorized/,
    'fresh payload settlement must gate every local input batch');
  assert.match(localRunner,
    /installPq017LocalControlKeyupObserver\(page\)[\s\S]*await releaseFlightKeys\(page,\s*\{ preserveSiteAction: true \}\);\s*await waitForFixedTicks\(page,\s*1\);\s*for \(let correction/,
    'the persistent receipt observer and neutral input must precede the first planning sample');
  assert.doesNotMatch(localRunner, /flyToPoint|brakePq017ReleasedLaunchGateSafely|pulsePq017Brake/,
    'the route-only fixed-tick FSM must not delegate to legacy convergence or pulse helpers');
  const authorizedTransition = localRunner.match(
    /const keys = pq017PublicKeysForDecision[\s\S]*?let activeEndpoint = null/,
  )?.[0] || '';
  assert.doesNotMatch(authorizedTransition, /releaseFlightKeys/,
    'no awaited key-up sweep may run between an observed plan and its requested control event');
  assert.doesNotMatch(authorizedTransition,
    /armPq017LocalControlKeyupReceipt|readPq017LocalControlKeyBatch/,
    'receipt observation must be persistent, with no awaited arming call after the plan');
  assert.match(authorizedTransition,
    /requestedCodes\.length > 1[\s\S]*if \(requestedCode\) await page\.keyboard\.down\(requestedCode\)/,
    'each authorized plan must fail closed unless it maps to zero or one public key-down event');
  assert.match(localRunner,
    /finally\s*\{\s*if \(requestedCode\) await page\.keyboard\.up\(requestedCode\)\.catch\(\(\) => \{\}\);\s*\}/,
    'the authorized transition must release only the exact requested code');
  assert.match(localRunner,
    /readPq017LocalControlKeyBatch[\s\S]*released-launch-key-batch-receipt-invalid/,
    'one token-bound exact-code keydown/keyup batch must be present or fail closed');
  assert.match(localRunner,
    /activeHoldTicks = requestedCode[\s\S]*keyBatch\.activeHoldTicks[\s\S]*collectionTickDelta = Number\(observed\?\.tick\) - startTick/,
    'active hold duration must use keyup minus keydown and remain distinct from collection latency');
  assert.match(localRunner,
    /preKeydownSweptSegment[\s\S]*activeSweptSegment[\s\S]*neutralSweptSegment/,
    'pre-keydown, active-hold, and post-keyup movement must be audited separately');
  assert.match(localRunner,
    /pq017LocalControlKeydownMatchesAuthorization[\s\S]*released-launch-keydown-state-stale/,
    'the active proof must fail closed unless keydown tick and state equal its authorization');
  assert.match(localRunner,
    /evaluatePq017ReleasedLaunchAppliedBatch\(\{[\s\S]*tickDelta:\s*activeHoldTicks[\s\S]*precisionBrakeStop:\s*localPlan\.precisionBrakeStop[\s\S]*precisionBrakeCorridor:\s*localPlan\.precisionBrakeCorridor[\s\S]*precisionBrakeHold:\s*localPlan\.precisionBrakeHold/,
    'only the measured active segment may be admitted against the restored bounded control proof');
});
