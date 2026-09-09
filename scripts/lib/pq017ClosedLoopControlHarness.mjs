// Fast, deterministic PQ-017 control acceptance.
//
// This is not a kinematic stand-in. Every replay runs the shipped NEW_GAME Hitch through
// createSimulation -> Flight V3 -> rapier-dynamic physics at SIM_DT. Decisions become an
// exact-tick W/S/A/D/Q/E/Shift tape, then every authority-owned movement segment is audited.
// The pure predictor used by the public route is therefore checked at the seam it is meant to
// protect: the displacement produced before a loaded browser callback can observe and release keys.

import { createHash } from 'node:crypto';

import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import { automaticMasslineBreakAllowed } from '../../src/combat/attachments.js';
import { actions } from '../../src/systems/actions.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { physics } from '../../src/core/physics.js';
import { tetherGameplay } from '../../src/systems/tetherGameplay.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../src/systems/ships.js';
import { ATTACHMENT_DEFS } from '../../src/data/combatDefs.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';
import { transitionFlightKeyState } from '../../src/systems/input.js';
import {
  PQ017_PRECISION_BRAKE_KEY,
  pq017PublicKeysForDecision,
  projectPq017PilotKeyState,
} from './pq017PublicControlTrajectory.mjs';
import {
  auditPq017RouteSweep,
  decidePq017SettledArrivalControl,
  decidePq017ReleasedPreparationStep,
  evaluatePq017ReleasedLaunchAppliedBatch,
  evaluatePq017LaunchGate,
  PQ017_RELEASED_DETOUR_SETTLED_SPEED,
  PQ017_RELEASED_LAUNCH_READY_SPEED,
  planPq017ReleasedLaunchGateConvergence,
  planPq017ReceiverCrossingPull,
  planPq017RouteSafeDisplacement,
} from './pq017WorldSitePublicRoute.mjs';

const HITCH_RADIUS = 14;
const RELEASED_PAYLOAD = Object.freeze({
  entityId: 'released-payload',
  type: 'world_site_payload',
  x: 757.0526123046875,
  z: -620.4880981445312,
  radius: 24,
  allowEscapeFromOverlap: true,
});
const RELEASED_RECEIVER_TARGET = Object.freeze({
  x: 801.298461041391,
  z: -607.3985468428217,
});
export const PQ017_ELECTRON_TERMINAL_SEED = capturedSeed({
  id: 'electron-terminal-near-launch',
  source: '.tmp-electron-27932-1784827183938-d08203cf',
  position: { x: 799.0679931640625, z: -613.1228637695312 },
  velocity: {
    x: -0.0028143932577222586,
    z: -0.28386110067367554,
  },
  target: { x: 802.5508593689617, z: -607.028041301013 },
  rotation: 2.246090170258179,
  angularVelocity: 1.401298464324817e-45,
  settledRadius: 6,
  maxSettledSpeed: 6,
  obstacles: [{
    entityId: 'released-payload',
    type: 'world_site_payload',
    x: 757.0526123046875,
    z: -620.4880981445312,
    radius: 6,
    allowEscapeFromOverlap: true,
  }],
});
const PQ017_BROWSER_RELEASED_DETOUR_LAUNCH_SEED = capturedSeed({
  id: 'browser-released-detour-launch-998d6c65',
  source: '.tmp-browser-25776-1784833459720-c1acf32d',
  position: { x: 798.9737548828125, z: -605.9647216796875 },
  velocity: {
    x: -1.2448176145553589,
    z: -5.457627296447754,
  },
  target: { x: 801.298461041391, z: -607.3985468428217 },
  // The failed run did not serialize rotation. This reconstructed heading remains in the matrix
  // below, but the shared controller must converge from every cardinal heading as well.
  rotation: -1.361,
  angularVelocity: 0,
  settledRadius: 6,
  maxSettledSpeed: 6,
  obstacles: [
    {
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: 757.0526123046875,
      z: -620.4880981445312,
      radius: 6,
    },
  ],
});
const PQ017_BROWSER_PRECISION_BRAKE_LEVEL_HOLD_SEED = capturedSeed({
  id: 'browser-precision-brake-level-hold-f1408d23',
  source: '.tmp-browser-37336-1784838966643-f1408d23',
  position: { x: 802.4789428710938, z: -607.401123046875 },
  velocity: {
    x: -1.1771762371063232,
    z: 4.791933059692383,
  },
  target: { x: 806.9452567981592, z: -605.728016728496 },
  rotation: 2.0775045219418096,
  angularVelocity: 2.802596928649634e-45,
  settledRadius: 6,
  maxSettledSpeed: 6,
  obstacles: [
    {
      entityId: 293,
      type: 'wreck',
      x: 759.2914604576528,
      z: -620.2829997068661,
      radius: 2.16,
      collides: true,
    },
    {
      entityId: 322,
      type: 'wreck',
      x: 762.367099561415,
      z: -619.2483770203719,
      radius: 1.08,
      collides: true,
    },
    {
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: 757.0526123046875,
      z: -620.4880981445312,
      radius: 6,
      allowEscapeFromOverlap: true,
    },
  ],
});
const PQ017_BROWSER_PRECISION_BRAKE_ENVELOPE_SEED = capturedSeed({
  id: 'browser-precision-brake-envelope-72f99d33',
  source: '.tmp-browser-18644-1784839684690-72f99d33',
  position: { x: 796.0784301757812, z: -605.6943359375 },
  velocity: {
    x: -0.32173478603363037,
    z: 0.14217832684516907,
  },
  target: { x: 801.6683295863331, z: -607.2891261077199 },
  rotation: -3.026616251693223,
  angularVelocity: 0,
  settledRadius: 6,
  maxSettledSpeed: 6,
  obstacles: [
    {
      entityId: 293,
      type: 'wreck',
      x: 759.2914604576528,
      z: -620.2829997068661,
      radius: 2.16,
      collides: true,
    },
    {
      entityId: 322,
      type: 'wreck',
      x: 762.367099561415,
      z: -619.2483770203719,
      radius: 1.08,
      collides: true,
    },
    {
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: 757.0526123046875,
      z: -620.4880981445312,
      radius: 6,
      allowEscapeFromOverlap: true,
    },
  ],
});
const PQ017_BROWSER_ATOMIC_YAW_PREFIX_SEED = capturedSeed({
  id: 'browser-atomic-yaw-prefix-06c19f64',
  source: '.tmp-browser-30516-1784840917352-06c19f64',
  position: { x: 795.2009887695312, z: -609.5535278320312 },
  velocity: {
    x: -0.25072264671325684,
    z: -0.041174858808517456,
  },
  target: { x: 801.2984610413906, z: -607.3985468428203 },
  rotation: 2.518728284892141,
  angularVelocity: -1.401298464324817e-45,
  settledRadius: 6,
  maxSettledSpeed: 6,
  obstacles: [
    {
      entityId: 292,
      type: 'wreck',
      x: 759.2914604576528,
      z: -620.2829997068661,
      radius: 2.16,
      collides: true,
    },
    {
      entityId: 321,
      type: 'wreck',
      x: 762.367099561415,
      z: -619.2483770203719,
      radius: 1.08,
      collides: true,
    },
    {
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: 757.0526123046875,
      z: -620.4880981445312,
      radius: 6,
      collides: false,
    },
  ],
});
const CONTROL_WINDOW_TICKS = 24;
const STANDARD_TETHER = ATTACHMENT_DEFS.find((entry) => entry.id === 'tether_standard');

export const PQ017_CONTROL_BATCH_SWEEP = Object.freeze([
  Object.freeze({ id: 'single-tick', tickBatches: Object.freeze([1]) }),
  Object.freeze({ id: 'nominal-catchup', tickBatches: Object.freeze([2, 1, 2, 3]) }),
  Object.freeze({ id: 'loaded-catchup', tickBatches: Object.freeze([4, 4, 1, 3, 4, 2]) }),
]);

export const PQ017_CAPTURED_CONTROL_SEEDS = Object.freeze([
  capturedSeed({
    id: 'run38-stalled-forward-hold',
    source: '.tmp-electron-31016-1784820028991-b053906b',
    position: { x: 851.93310546875, z: -415.6114196777344 },
    velocity: { x: -0.0004247400793246925, z: -0.00037538434844464064 },
    target: { x: 760, z: -620 },
    headingError: 0.3203312999524779,
    settledRadius: 100,
    maxSettledSpeed: 4,
    obstacles: [],
  }),
  capturedSeed({
    id: 'run39-moving-away-launch',
    source: '.tmp-electron-35992-1784821159607-cc811c89',
    position: { x: 801.7833862304688, z: -609.545166015625 },
    target: RELEASED_RECEIVER_TARGET,
    speed: 4.567797998321677,
    headingError: 2.335511963652996,
    velocityHeadingError: -0.5758210750711121,
    settledRadius: 6,
    maxSettledSpeed: 6,
    obstacles: [RELEASED_PAYLOAD],
  }),
  capturedSeed({
    id: 'run40-tight-launch-approach',
    source: '.tmp-electron-5772-1784821843438-2ce996de',
    position: { x: 797.4763793945312, z: -612.8828735351562 },
    target: RELEASED_RECEIVER_TARGET,
    speed: 3.741453951323158,
    headingError: -0.07765505680949958,
    velocityHeadingError: -0.9082513864259145,
    settledRadius: 6,
    maxSettledSpeed: 6,
    obstacles: [RELEASED_PAYLOAD],
  }),
  capturedSeed({
    id: 'run41-loaded-released-payload-sweep',
    source: '.tmp-electron-37868-1784823824931-c65ac242',
    // This is the last safe endpoint in the captured unobserved browser batch. Its measured
    // previous->current travel direction, at the captured speed, reconstructs the authority-owned
    // motion that the final post-turn velocity alone cannot describe.
    position: { x: 793.3658447265625, z: -608.3382568359375 },
    target: RELEASED_RECEIVER_TARGET,
    velocity: measuredVelocity(
      { x: 793.3658447265625, z: -608.3382568359375 },
      { x: 792.9730834960938, z: -608.4256591796875 },
      1.2811530535486186,
    ),
    headingError: 0.4733471941433418,
    settledRadius: 6,
    maxSettledSpeed: 6,
    obstacles: [RELEASED_PAYLOAD],
  }),
]);

export class PilotKeyTape {
  constructor(bindingState = null) {
    this.frames = [];
    this.currentKeys = Object.create(null);
    this.bindingState = bindingState || {
      settings: {
        gameplay: { controlScheme: 'pilot' },
        controls: { bindings: null },
      },
    };
  }

  hold(startTick, keys = {}) {
    const requested = normalizeKeys(keys);
    const releaseOrder = [
      'KeyW',
      'KeyA',
      'KeyD',
      'KeyS',
      'KeyQ',
      'KeyE',
      'ShiftLeft',
      PQ017_PRECISION_BRAKE_KEY,
    ];
    for (const code of releaseOrder) {
      if (this.currentKeys[code] === true && requested[code] !== true) {
        this.transition(startTick, code, false);
      }
    }
    for (const [code, held] of Object.entries(requested)) {
      if (held && this.currentKeys[code] !== true) {
        this.transition(startTick, code, true);
      }
    }
    if (this.frames.length === 0) this._record(startTick);
    return this.frames.at(-1);
  }

  transition(startTick, code, pressed) {
    this.currentKeys = transitionFlightKeyState(
      this.bindingState,
      this.currentKeys,
      { code, pressed },
    );
    return this._record(startTick);
  }

  _record(startTick) {
    const frame = Object.freeze({
      tick: Math.max(0, Math.trunc(Number(startTick) || 0)),
      keys: normalizeKeys(this.currentKeys),
    });
    const previous = this.frames.at(-1);
    if (!previous || !sameKeys(previous.keys, frame.keys)) this.frames.push(frame);
    return this.frames.at(-1);
  }

  keysAt(tick) {
    let keys = normalizeKeys({});
    for (const frame of this.frames) {
      if (frame.tick > tick) break;
      keys = frame.keys;
    }
    return keys;
  }

  apply(state, tick, { massline = null } = {}) {
    const keys = this.keysAt(tick);
    const projected = projectPq017PilotKeyState(keys);
    state.input.moveX = projected.moveX;
    state.input.moveZ = projected.moveZ;
    state.input.turnIntent = projected.turnIntent;
    state.input.boost = projected.boost;
    state.input.brake = projected.brake;
    state.input.actions = state.input.actions || {};
    state.input.actions.tetherFire = false;
    state.input.actions.tetherCut = false;
    state.input.actions.reelDelta = 0;
    state.input.actions.massline = massline;
    return keys;
  }
}

export async function runPq017ClosedLoopControlHarness() {
  const runs = [];
  let systems = [];
  let sg02Ready = true;

  for (const capture of PQ017_CAPTURED_CONTROL_SEEDS) {
    for (const profile of PQ017_CONTROL_BATCH_SWEEP) {
      const result = await runProtectedControlReplay(capture, profile);
      systems = result.systems;
      sg02Ready = sg02Ready && result.sg02Ready;
      runs.push(result);
    }
  }

  const defect = await runUnprotectedDefectReplay(
    PQ017_CAPTURED_CONTROL_SEEDS.find((entry) => (
      entry.id === 'run41-loaded-released-payload-sweep'
    )),
    PQ017_CONTROL_BATCH_SWEEP.find((entry) => entry.id === 'loaded-catchup'),
  );

  const semanticResult = {
    captureIds: PQ017_CAPTURED_CONTROL_SEEDS.map((entry) => entry.id),
    profileIds: PQ017_CONTROL_BATCH_SWEEP.map((entry) => entry.id),
    systems,
    sg02Ready,
    runs,
    defect,
  };
  return {
    ...semanticResult,
    deterministicDigest: createHash('sha256')
      .update(JSON.stringify(semanticResult))
      .digest('hex'),
  };
}

export async function runPq017ElectronTerminalRegressionHarness() {
  const capture = PQ017_ELECTRON_TERMINAL_SEED;
  const fixture = await createRealControlFixture(capture);
  const {
    sim,
    state,
    player,
    physicsSystem,
  } = fixture;
  try {
    const navigation = navigationFor(player, capture.target);
    const decision = decidePq017SettledArrivalControl(navigation, {
      settledRadius: capture.settledRadius,
      maxSettledSpeed: capture.maxSettledSpeed,
      maxApproachSpeed: capture.maxSettledSpeed,
    });
    const controlPlan = planPq017RouteSafeDisplacement(
      {
        position: { x: player.pos.x, z: player.pos.z },
        velocity: { x: player.vel.x, z: player.vel.z },
        rotation: player.rot,
        angularVelocity: player.angVel,
      },
      decision,
      capture.obstacles,
      HITCH_RADIUS,
    );
    const directSweep = auditPq017RouteSweep(
      capture.position,
      capture.target,
      capture.obstacles,
      HITCH_RADIUS,
    );
    const crossingPlan = planPq017ReceiverCrossingPull({
      playerPosition: capture.position,
      payloadPosition: {
        x: 757.0526123046875,
        z: -620.4880981445312,
      },
      payloadCollides: false,
      receiverPosition: {
        x: 767.4486542780224,
        z: -617.4125661199455,
      },
      rootPosition: { x: 760, z: -620 },
      rootCollides: false,
      tetherRestLength: 42.65605356988638,
      maxTetherLength: 390,
      payloadRadius: 6,
      receiverRadius: 1.7999999999999998,
      playerRadius: HITCH_RADIUS,
      obstacles: [],
      shipObstacles: capture.obstacles,
      maxServiceSpeed: capture.maxSettledSpeed,
      releasedDetour: true,
    });
    const expectedLaunchGate = {
      center: crossingPlan?.target,
      direction: crossingPlan?.direction,
      farSideOrigin: {
        x: 767.4486542780224,
        z: -617.4125661199455,
      },
      arrivalRadius: crossingPlan?.arrivalRadius,
      maxServiceSpeed: crossingPlan?.maxServiceSpeed,
      maxPlayerCrossTrack: crossingPlan?.maxPayloadCrossTrack,
    };
    const observed = {
      position: { x: player.pos.x, z: player.pos.z },
      velocity: { x: player.vel.x, z: player.vel.z },
      rotation: player.rot,
    };
    const localLeg = runExpectedLaunchGateLeg({
      sim,
      state,
      player,
      capture,
      launchGate: crossingPlan?.launchGate,
      crossingPlan,
    });
    const scheduleRuns = [];
    for (const schedule of [[1], [2], [4]]) {
      const scheduleFixture = await createRealControlFixture(capture);
      try {
        scheduleRuns.push({
          ...runExpectedLaunchGateLeg({
            sim: scheduleFixture.sim,
            state: scheduleFixture.state,
            player: scheduleFixture.player,
            capture,
            launchGate: crossingPlan?.launchGate,
            crossingPlan,
            tickBatches: schedule,
          }),
          schedule,
        });
      } finally {
        disposeRealSim(scheduleFixture.sim, scheduleFixture.physicsSystem);
      }
    }
    scheduleRuns.push({ ...localLeg, schedule: [1, 2, 4] });

    return {
      source: capture.source,
      systems: fixture.systems,
      sg02Ready: fixture.sg02Ready,
      observed,
      arrival: {
        distance: navigation.distance,
        excessDistance: navigation.distance - capture.settledRadius,
        speed: navigation.speed,
        settledRadius: capture.settledRadius,
        maxSettledSpeed: capture.maxSettledSpeed,
        stoppingDistance: crossingPlan?.stoppingDistance ?? null,
      },
      decision,
      controlPlan,
      directSweep,
      crossingPlan,
      expectedLaunchGate,
      localLeg,
      scheduleRuns,
    };
  } finally {
    disposeRealSim(sim, physicsSystem);
  }
}

export async function runPq017CapturedReleasedDetourLaunchHarness() {
  const capture = PQ017_BROWSER_RELEASED_DETOUR_LAUNCH_SEED;
  const schedules = [[1], [2], [4], [1, 2, 4]];
  const rotationMatrix = [-Math.PI, -Math.PI / 2, -1.361, 0, Math.PI / 2];
  const crossingPlan = planPq017ReceiverCrossingPull({
    playerPosition: capture.position,
    payloadPosition: {
      x: 757.0526123046875,
      z: -620.4880981445312,
    },
    payloadCollides: false,
    receiverPosition: {
      x: 767.4486542780224,
      z: -617.4125661199455,
    },
    rootPosition: { x: 760, z: -620 },
    rootCollides: false,
    tetherRestLength: 42.65605356988638,
    maxTetherLength: 390,
    payloadRadius: 6,
    receiverRadius: 1.7999999999999998,
    playerRadius: HITCH_RADIUS,
    obstacles: [],
    shipObstacles: capture.obstacles,
    maxServiceSpeed: 6,
    releasedDetour: true,
  });
  const runs = [];
  for (const rotation of rotationMatrix) {
    for (const schedule of schedules) {
      const rotatedCapture = { ...capture, rotation };
      const fixture = await createRealControlFixture(rotatedCapture);
      try {
        runs.push({
          ...runExpectedLaunchGateLeg({
            sim: fixture.sim,
            state: fixture.state,
            player: fixture.player,
            capture: rotatedCapture,
            launchGate: crossingPlan?.launchGate,
            crossingPlan,
            tickBatches: schedule,
          }),
          rotation,
          schedule,
        });
      } finally {
        disposeRealSim(fixture.sim, fixture.physicsSystem);
      }
    }
  }
  return {
    source: capture.source,
    fingerprint: '998d6c65',
    start: {
      position: { ...capture.position },
      velocity: { ...capture.velocity },
      speed: Math.hypot(capture.velocity.x, capture.velocity.z),
    },
    rotationMatrix,
    crossingPlan,
    launchReadySpeed: PQ017_RELEASED_LAUNCH_READY_SPEED,
    runs,
  };
}

export async function runPq017CapturedPrecisionBrakeLevelHoldHarness() {
  const capture = PQ017_BROWSER_PRECISION_BRAKE_LEVEL_HOLD_SEED;
  const crossingPlan = {
    safe: true,
    releasedDetour: true,
    stoppingDistance: 1.5,
    launchGate: {
      center: { ...capture.target },
      direction: {
        x: 0.958918038622328,
        z: 0.28368326564093904,
      },
      farSideOrigin: {
        x: 767.4486542780224,
        z: -617.4125661199455,
      },
      arrivalRadius: 6,
      maxServiceSpeed: 6,
      maxPlayerCrossTrack: 1,
    },
    routeSafety: {
      obstacles: capture.obstacles,
      playerRadius: HITCH_RADIUS,
    },
  };
  const fixture = await createRealControlFixture(capture);
  const {
    sim,
    state,
    player,
    physicsSystem,
  } = fixture;
  try {
    const navigation = {
      position: { x: player.pos.x, z: player.pos.z },
      velocity: { x: player.vel.x, z: player.vel.z },
      rotation: player.rot,
      angularVelocity: player.angVel,
    };
    const localPlan = planPq017ReleasedLaunchGateConvergence({
      navigation,
      payloadSettled: true,
      tetherActive: false,
      crossingPlan,
    });
    const stopTicks = Number(localPlan?.precisionBrakeStop?.ticks);
    if (!localPlan?.safe || localPlan?.decision?.action !== 'precision-brake'
        || !Number.isInteger(stopTicks) || stopTicks < 9) {
      throw new Error(`PQ-017 captured precision-brake plan invalid: ${JSON.stringify({
        safe: localPlan?.safe,
        action: localPlan?.decision?.action,
        reason: localPlan?.reason,
        stopTicks,
      })}`);
    }

    const continuedHoldTicks = 120;
    const totalTicks = stopTicks + continuedHoldTicks;
    const tape = new PilotKeyTape(state);
    const keys = pq017PublicKeysForDecision(localPlan.decision);
    tape.hold(state.tick, keys);
    const startTick = state.tick;
    const startPosition = { x: player.pos.x, z: player.pos.z };
    const startVelocity = { x: player.vel.x, z: player.vel.z };
    const startSpeed = Math.hypot(startVelocity.x, startVelocity.z);
    const startUnit = {
      x: startVelocity.x / startSpeed,
      z: startVelocity.z / startSpeed,
    };
    const trajectory = [{
      tick: 0,
      position: startPosition,
      velocity: startVelocity,
      speed: startSpeed,
      signedVelocity: startSpeed,
    }];
    const sweeps = [];
    let monotonicSpeedReduction = true;
    let signedVelocityPreserved = true;

    for (let tick = 1; tick <= totalTicks; tick += 1) {
      const previous = { x: player.pos.x, z: player.pos.z };
      const previousSpeed = Math.hypot(player.vel.x, player.vel.z);
      tape.apply(state, state.tick);
      sim.step(SIM_DT);
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const signedVelocity = player.vel.x * startUnit.x + player.vel.z * startUnit.z;
      monotonicSpeedReduction = monotonicSpeedReduction && speed <= previousSpeed + 1e-9;
      signedVelocityPreserved = signedVelocityPreserved && signedVelocity > 0;
      sweeps.push(auditPq017RouteSweep(
        previous,
        player.pos,
        capture.obstacles,
        HITCH_RADIUS,
      ));
      trajectory.push({
        tick,
        position: { x: player.pos.x, z: player.pos.z },
        velocity: { x: player.vel.x, z: player.vel.z },
        speed,
        signedVelocity,
      });
    }

    const exactBatchEnd = trajectory[9];
    const sweptSegment = auditPq017RouteSweep(
      startPosition,
      exactBatchEnd.position,
      capture.obstacles,
      HITCH_RADIUS,
    );
    const proofInput = {
      decision: localPlan.decision,
      keys,
      sweptSegment,
      endPosition: exactBatchEnd.position,
      precisionBrakeStop: localPlan.precisionBrakeStop,
      precisionBrakeCorridor: localPlan.precisionBrakeCorridor,
      precisionBrakeHold: localPlan.precisionBrakeHold,
    };
    const acceptance = evaluatePq017ReleasedLaunchAppliedBatch({
      ...proofInput,
      tickDelta: 9,
    });
    const fullStopEnd = trajectory[stopTicks];
    const fullStopSweeps = sweeps.slice(0, stopTicks);
    const continuedTrajectory = trajectory.slice(stopTicks);
    const continuedSweeps = sweeps.slice(stopTicks);
    const maximumDisplacement = trajectory
      .slice(0, stopTicks + 1)
      .reduce((maximum, sample) => Math.max(
        maximum,
        Math.hypot(
          sample.position.x - startPosition.x,
          sample.position.z - startPosition.z,
        ),
      ), 0);

    return {
      source: capture.source,
      systems: fixture.systems,
      sg02Ready: fixture.sg02Ready,
      startTick,
      start: {
        position: startPosition,
        velocity: startVelocity,
        speed: startSpeed,
      },
      localPlan,
      exactBatch: {
        tickDelta: 9,
        endSpeed: exactBatchEnd.speed,
        sweptSegment,
        acceptance,
        proofInput,
      },
      fullStop: {
        safe: monotonicSpeedReduction
          && signedVelocityPreserved
          && fullStopEnd.speed <= PQ017_RELEASED_LAUNCH_READY_SPEED
          && fullStopSweeps.every((sweep) => sweep.safe),
        ticks: stopTicks,
        endSpeed: fullStopEnd.speed,
        maximumDisplacement,
        monotonicSpeedReduction: trajectory
          .slice(0, stopTicks + 1)
          .every((sample, index, samples) => (
            index === 0 || sample.speed <= samples[index - 1].speed + 1e-9
          )),
        signedVelocityPreserved: trajectory
          .slice(0, stopTicks + 1)
          .every((sample) => sample.signedVelocity > 0),
        corridorSafe: localPlan.precisionBrakeCorridor?.safe === true
          && fullStopSweeps.every((sweep) => sweep.safe),
      },
      continuedHold: {
        ticks: continuedHoldTicks,
        speedNonIncreasing: continuedTrajectory.every((sample, index, samples) => (
          index === 0 || sample.speed <= samples[index - 1].speed + 1e-9
        )),
        signedVelocityPreserved: continuedTrajectory.every(
          (sample) => sample.signedVelocity > 0,
        ),
        reverseObserved: continuedTrajectory.some((sample) => sample.signedVelocity <= 0),
        corridorSafe: continuedSweeps.every((sweep) => sweep.safe),
      },
      trajectory,
      sweeps,
      keyFrames: tape.frames,
    };
  } finally {
    disposeRealSim(sim, physicsSystem);
  }
}

export async function runPq017CapturedPrecisionBrakeEnvelopeHarness() {
  const capture = PQ017_BROWSER_PRECISION_BRAKE_ENVELOPE_SEED;
  const crossingPlan = {
    safe: true,
    releasedDetour: true,
    stoppingDistance: 1.5,
    launchGate: {
      center: { ...capture.target },
      direction: {
        x: 0.958918038622328,
        z: 0.28368326564093904,
      },
      farSideOrigin: {
        x: 767.4486542780224,
        z: -617.4125661199455,
      },
      arrivalRadius: 6,
      maxServiceSpeed: 6,
      maxPlayerCrossTrack: 1,
    },
    routeSafety: {
      obstacles: capture.obstacles,
      playerRadius: HITCH_RADIUS,
    },
  };
  const fixture = await createRealControlFixture(capture);
  const {
    sim,
    state,
    player,
    physicsSystem,
  } = fixture;
  try {
    const navigation = {
      position: { x: player.pos.x, z: player.pos.z },
      velocity: { x: player.vel.x, z: player.vel.z },
      rotation: player.rot,
      angularVelocity: player.angVel,
    };
    const localPlan = planPq017ReleasedLaunchGateConvergence({
      navigation,
      payloadSettled: true,
      tetherActive: false,
      crossingPlan,
    });
    const holdProof = localPlan?.precisionBrakeHold;
    const maximumSafeHoldTicks = Number(holdProof?.maximumSafeHoldTicks);
    if (!localPlan?.safe || localPlan?.decision?.action !== 'precision-brake'
        || holdProof?.safe !== true
        || !Number.isInteger(maximumSafeHoldTicks)
        || maximumSafeHoldTicks < 20) {
      throw new Error(`PQ-017 captured precision-brake envelope invalid: ${JSON.stringify({
        safe: localPlan?.safe,
        action: localPlan?.decision?.action,
        reason: localPlan?.reason,
        holdProof,
      })}`);
    }

    const longHoldTicks = maximumSafeHoldTicks + 120;
    const tape = new PilotKeyTape(state);
    const keys = pq017PublicKeysForDecision(localPlan.decision);
    tape.hold(state.tick, keys);
    const startPosition = { x: player.pos.x, z: player.pos.z };
    const startVelocity = { x: player.vel.x, z: player.vel.z };
    const startSpeed = Math.hypot(startVelocity.x, startVelocity.z);
    const startUnit = {
      x: startVelocity.x / startSpeed,
      z: startVelocity.z / startSpeed,
    };
    const trajectory = [{
      tick: 0,
      position: startPosition,
      velocity: startVelocity,
      speed: startSpeed,
      signedVelocity: startSpeed,
      distance: localPlan.gateEvaluation.distance,
      crossTrack: localPlan.gateEvaluation.crossTrack,
      envelopeSafe: localPlan.gateEvaluation.distance <= holdProof.envelopeLimit,
      sweepSafe: true,
    }];
    const sweeps = [];
    let maximumRealSafeHoldTicks = 0;
    let contiguousSafe = true;
    for (let tick = 1; tick <= longHoldTicks; tick += 1) {
      const previous = { x: player.pos.x, z: player.pos.z };
      tape.apply(state, state.tick);
      sim.step(SIM_DT);
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const signedVelocity = player.vel.x * startUnit.x + player.vel.z * startUnit.z;
      const gate = evaluatePq017LaunchGate({
        position: player.pos,
        velocity: player.vel,
      }, crossingPlan.launchGate);
      const sweep = auditPq017RouteSweep(
        previous,
        player.pos,
        capture.obstacles,
        HITCH_RADIUS,
      );
      const envelopeSafe = gate.distance <= holdProof.envelopeLimit + 1e-9;
      contiguousSafe = contiguousSafe && sweep.safe && envelopeSafe;
      if (contiguousSafe) maximumRealSafeHoldTicks = tick;
      sweeps.push(sweep);
      trajectory.push({
        tick,
        position: { x: player.pos.x, z: player.pos.z },
        velocity: { x: player.vel.x, z: player.vel.z },
        speed,
        signedVelocity,
        distance: gate.distance,
        crossTrack: gate.crossTrack,
        envelopeSafe,
        sweepSafe: sweep.safe,
      });
    }

    const exactBatchEnd = trajectory[20];
    const sweptSegment = auditPq017RouteSweep(
      startPosition,
      exactBatchEnd.position,
      capture.obstacles,
      HITCH_RADIUS,
    );
    const proofInput = {
      decision: localPlan.decision,
      keys,
      sweptSegment,
      endPosition: exactBatchEnd.position,
      precisionBrakeStop: localPlan.precisionBrakeStop,
      precisionBrakeCorridor: localPlan.precisionBrakeCorridor,
      precisionBrakeHold: holdProof,
    };
    const acceptance = evaluatePq017ReleasedLaunchAppliedBatch({
      ...proofInput,
      tickDelta: 20,
    });
    return {
      source: capture.source,
      systems: fixture.systems,
      sg02Ready: fixture.sg02Ready,
      start: {
        position: startPosition,
        velocity: startVelocity,
        speed: startSpeed,
      },
      localPlan,
      holdProof,
      exactBatch: {
        tickDelta: 20,
        end: exactBatchEnd,
        sweptSegment,
        acceptance,
        proofInput,
      },
      predictedBoundary: holdProof.boundary,
      realHold: {
        ticks: longHoldTicks,
        maximumSafeHoldTicks: maximumRealSafeHoldTicks,
        monotonicSpeedReduction: trajectory.every((sample, index, samples) => (
          index === 0 || sample.speed <= samples[index - 1].speed + 1e-9
        )),
        signedVelocityPreserved: trajectory.every(
          (sample) => sample.signedVelocity > 0,
        ),
        reverseObserved: trajectory.some((sample) => sample.signedVelocity <= 0),
        corridorSafeThroughBudget: trajectory
          .slice(0, maximumSafeHoldTicks + 1)
          .every((sample) => sample.sweepSafe && sample.envelopeSafe),
        safeEnd: trajectory[maximumRealSafeHoldTicks],
        firstUnsafe: trajectory[maximumRealSafeHoldTicks + 1] || null,
      },
      trajectory,
      sweeps,
      keyFrames: tape.frames,
    };
  } finally {
    disposeRealSim(sim, physicsSystem);
  }
}

export async function runPq017CapturedAtomicActionPrefixHarness() {
  const capture = PQ017_BROWSER_ATOMIC_YAW_PREFIX_SEED;
  const crossingPlan = {
    safe: true,
    releasedDetour: true,
    stoppingDistance: 1.5,
    launchGate: {
      center: { ...capture.target },
      direction: {
        x: 0.958918038622328,
        z: 0.28368326564093904,
      },
      farSideOrigin: {
        x: 767.4486542780224,
        z: -617.4125661199455,
      },
      arrivalRadius: 6,
      maxServiceSpeed: 6,
      maxPlayerCrossTrack: 1,
    },
    routeSafety: {
      obstacles: capture.obstacles,
      playerRadius: HITCH_RADIUS,
    },
  };
  const fixture = await createRealControlFixture(capture);
  const {
    sim,
    state,
    player,
    physicsSystem,
  } = fixture;
  try {
    const snapshot = () => ({
      x: player.pos.x,
      z: player.pos.z,
      vx: player.vel.x,
      vz: player.vel.z,
      rot: player.rot,
      angVel: player.angVel,
    });
    const startState = snapshot();
    const localPlan = planPq017ReleasedLaunchGateConvergence({
      navigation: {
        position: { x: startState.x, z: startState.z },
        velocity: { x: startState.vx, z: startState.vz },
        rotation: startState.rot,
        angularVelocity: startState.angVel,
      },
      payloadSettled: true,
      tetherActive: false,
      crossingPlan,
    });
    const proof = localPlan?.actionSafePrefix;
    if (!localPlan?.safe || localPlan?.decision?.action !== 'yaw'
        || proof?.safe !== true || proof.maximumSafeTicks < 12) {
      throw new Error(`PQ-017 captured atomic yaw prefix invalid: ${JSON.stringify({
        safe: localPlan?.safe,
        action: localPlan?.decision?.action,
        reason: localPlan?.reason,
        proof,
      })}`);
    }

    const keys = pq017PublicKeysForDecision(localPlan.decision);
    const tape = new PilotKeyTape(state);
    tape.hold(state.tick, keys);
    const states = [startState];
    const sweeps = [];
    for (let tick = 1; tick <= 20; tick += 1) {
      const previous = { x: player.pos.x, z: player.pos.z };
      tape.apply(state, state.tick);
      sim.step(SIM_DT);
      const current = snapshot();
      states.push(current);
      sweeps.push(auditPq017RouteSweep(
        previous,
        current,
        capture.obstacles,
        HITCH_RADIUS,
      ));
    }

    const evaluateTick = (tickDelta) => {
      const endState = states[tickDelta];
      const sweptSegment = auditPq017RouteSweep(
        startState,
        endState,
        capture.obstacles,
        HITCH_RADIUS,
      );
      const acceptance = evaluatePq017ReleasedLaunchAppliedBatch({
        decision: localPlan.decision,
        keys,
        tickDelta,
        sweptSegment,
        startState,
        endPosition: endState,
        launchGate: crossingPlan.launchGate,
        actionSafePrefix: proof,
      });
      const gate = evaluatePq017LaunchGate({
        position: endState,
        velocity: { x: endState.vx, z: endState.vz },
      }, crossingPlan.launchGate);
      let endError = Math.atan2(
        crossingPlan.launchGate.center.z - endState.z,
        crossingPlan.launchGate.center.x - endState.x,
      ) - endState.rot;
      while (endError > Math.PI) endError -= Math.PI * 2;
      while (endError < -Math.PI) endError += Math.PI * 2;
      return {
        tickDelta,
        accepted: acceptance.accepted,
        acceptance,
        sweptSegment,
        collision: sweeps.slice(0, tickDelta).some((sweep) => !sweep.safe),
        envelopeSafe: gate.distance <= proof.envelopeLimit + 1e-9,
        objectiveProgress: Math.abs(endError) <= Math.abs(proof.start.headingError) + 1e-9
          && Math.sign(endError) === Math.sign(proof.start.headingError),
        endState,
      };
    };
    const variableSchedules = Array.from(
      { length: 20 },
      (_, index) => evaluateTick(index + 1),
    );
    const captureResult = variableSchedules[11];
    const maximum = evaluateTick(proof.maximumSafeTicks);
    const boundary = proof.maximumSafeTicks < states.length - 1
      ? evaluateTick(proof.maximumSafeTicks + 1)
      : null;

    const mixedFixture = await createRealControlFixture(capture);
    let mixedSchedule;
    try {
      mixedSchedule = runExpectedLaunchGateLeg({
        sim: mixedFixture.sim,
        state: mixedFixture.state,
        player: mixedFixture.player,
        capture,
        launchGate: crossingPlan.launchGate,
        crossingPlan,
        tickBatches: [1, 15, 2, 14, 3, 13, 4, 12, 5, 11, 6, 10, 7, 9, 8],
      });
    } finally {
      disposeRealSim(mixedFixture.sim, mixedFixture.physicsSystem);
    }

    return {
      source: capture.source,
      localPlan,
      capture: {
        action: localPlan.decision.action,
        keys,
        tickDelta: 12,
        proof,
        acceptance: captureResult.acceptance,
        sweptSegment: captureResult.sweptSegment,
        endState: captureResult.endState,
      },
      variableSchedules,
      mixedSchedule: {
        ...mixedSchedule,
        envelopeEscape: mixedSchedule.trace.some((sample) => {
          const gate = evaluatePq017LaunchGate({
            position: sample.position,
            velocity: sample.velocity,
          }, crossingPlan.launchGate);
          return gate.distance > proof.envelopeLimit + 1e-9;
        }),
      },
      boundarySchedules: [{
        maximumAccepted: maximum.accepted,
        firstBoundaryRejected: boundary ? !boundary.accepted : true,
        maximum,
        boundary,
      }],
      minimumSafePrefixHeadroom: proof.maximumSafeTicks - 12,
      states,
      sweeps,
    };
  } finally {
    disposeRealSim(sim, physicsSystem);
  }
}

function runExpectedLaunchGateLeg({
  sim,
  state,
  player,
  capture,
  launchGate,
  crossingPlan,
  tickBatches = [1, 2, 4],
}) {
  const planningBudget = {
    cycle3Local: decidePq017ReleasedPreparationStep({
      planningCycle: 3,
      crossingPlan,
      localPlan: { safe: true, action: 'local-convergence' },
    }),
    cycle3Ring: decidePq017ReleasedPreparationStep({
      planningCycle: 3,
      crossingPlan: {
        ...crossingPlan,
        shipRoute: { ...crossingPlan?.shipRoute, direct: false },
      },
      localPlan: { safe: false, action: 'replan' },
    }),
  };
  const waypoint = launchGate?.center
    ? {
      ...launchGate.center,
      phase: 'local-launch-gate',
      arrivalRadius: launchGate.arrivalRadius,
      maxApproachSpeed: launchGate.maxServiceSpeed,
      maxSettledSpeed: PQ017_RELEASED_LAUNCH_READY_SPEED,
    }
    : null;
  if (!waypoint) {
    return {
      converged: false,
      reason: 'launch-gate-projection-invalid',
      waypoint: null,
      trace: [],
      sweptBatches: [],
      unsafeAppliedSegments: 0,
      collision: false,
      planningBudget,
    };
  }

  const tape = new PilotKeyTape(state);
  const trace = [tracePoint(state, player, normalizeKeys({}))];
  const sweptBatches = [];
  const braking = {
    authorizedPlans: 0,
    correctionPlans: 0,
    batches: [],
    reason: null,
  };
  let unsafeAppliedSegments = 0;
  let collision = false;
  let converged = false;
  let controllerState = null;
  let nudgeIssued = false;
  let noSecondNudgeBeforeSettled = true;
  let finalGate = evaluatePq017LaunchGate({
    position: player.pos,
    velocity: player.vel,
  }, launchGate);

  const executeBatch = (batch, ticks, { precisionMonotonic = false } = {}) => {
    for (let tick = 0; tick < ticks; tick += 1) {
      const previous = { x: player.pos.x, z: player.pos.z };
      const previousSpeed = Math.hypot(player.vel.x, player.vel.z);
      const appliedKeys = tape.apply(state, state.tick);
      sim.step(SIM_DT);
      const currentSpeed = Math.hypot(player.vel.x, player.vel.z);
      if (precisionMonotonic) {
        batch.monotonicSpeedReduction = batch.monotonicSpeedReduction
          && currentSpeed <= previousSpeed + 1e-9;
        batch.signedVelocityPreserved = batch.signedVelocityPreserved
          && (batch.startUnit == null
            || player.vel.x * batch.startUnit.x + player.vel.z * batch.startUnit.z > 0);
      }
      const sweep = auditPq017RouteSweep(
        previous,
        player.pos,
        capture.obstacles,
        HITCH_RADIUS,
      );
      batch.sweeps.push(sweep);
      if (!sweep.safe) {
        unsafeAppliedSegments += 1;
        collision = true;
      }
      trace.push(tracePoint(state, player, appliedKeys, sweep));
    }
    batch.endSpeed = Math.hypot(player.vel.x, player.vel.z);
    sweptBatches.push(batch);
  };

  for (let batchIndex = 0; batchIndex < 1200 && !converged; batchIndex += 1) {
    const batchTicks = tickBatches[batchIndex % tickBatches.length];
    finalGate = evaluatePq017LaunchGate({
      position: player.pos,
      velocity: player.vel,
    }, launchGate);
    if (finalGate.accepted
        && finalGate.speed <= PQ017_RELEASED_LAUNCH_READY_SPEED) {
      converged = true;
      braking.reason = 'preparation-ready';
      break;
    }
    const localPlan = planPq017ReleasedLaunchGateConvergence({
      navigation: {
        position: { x: player.pos.x, z: player.pos.z },
        velocity: { x: player.vel.x, z: player.vel.z },
        rotation: player.rot,
        angularVelocity: player.angVel,
      },
      payloadSettled: true,
      tetherActive: false,
      crossingPlan,
      controllerState,
    });
    if (localPlan.action === 'complete') {
      converged = true;
      braking.reason = 'preparation-ready';
      break;
    }
    if (!localPlan.safe || !localPlan.inputAuthorized
        || localPlan.action !== 'local-convergence') {
      braking.reason = localPlan.reason;
      break;
    }
    braking.correctionPlans += 1;
    const {
      decision,
      controlPlan,
    } = localPlan;
    controllerState = localPlan.nextState;
    if (decision.action === 'nudge') {
      if (nudgeIssued && finalGate.speed > PQ017_RELEASED_LAUNCH_READY_SPEED) {
        noSecondNudgeBeforeSettled = false;
      }
      nudgeIssued = true;
    }

    const keys = pq017PublicKeysForDecision(decision);
    tape.hold(state.tick, keys);
    const batchStartVelocity = { x: player.vel.x, z: player.vel.z };
    const batchStartSpeed = Math.hypot(batchStartVelocity.x, batchStartVelocity.z);
    const batchStartUnit = batchStartSpeed > 1e-9
      ? {
        x: batchStartVelocity.x / batchStartSpeed,
        z: batchStartVelocity.z / batchStartSpeed,
      }
      : null;
    const batch = {
      ticks: batchTicks,
      decision: decision.action,
      decisionReason: decision.reason,
      phase: `local:${decision.action}`,
      controlPlanSafe: controlPlan.safe,
      startSpeed: batchStartSpeed,
      startUnit: batchStartUnit,
      monotonicSpeedReduction: true,
      signedVelocityPreserved: true,
      sweeps: [],
    };
    executeBatch(batch, batchTicks, {
      precisionMonotonic: decision.action === 'precision-brake',
    });
    if (decision.action === 'precision-brake'
        || decision.action === 'brake'
        || decision.action === 'coast') {
      braking.authorizedPlans += 1;
      braking.batches.push(batch);
    }
  }

  finalGate = evaluatePq017LaunchGate({
    position: player.pos,
    velocity: player.vel,
  }, launchGate);
  converged = converged && finalGate.accepted
    && finalGate.speed <= PQ017_RELEASED_LAUNCH_READY_SPEED;
  return {
    converged,
    reason: converged ? null : 'launch-gate-did-not-converge',
    waypoint,
    finalGate,
    fixedTicks: trace.length - 1,
    trace,
    sweptBatches,
    unsafeAppliedSegments,
    collision,
    planningBudget,
    braking,
    noSecondNudgeBeforeSettled,
    precisionBrakeBatchesMonotonic: sweptBatches
      .filter((batch) => batch.decision === 'precision-brake')
      .every((batch) => (
        batch.monotonicSpeedReduction
        && batch.signedVelocityPreserved
        && batch.endSpeed < batch.startSpeed
      )),
    publicBrakeEventProven: sweptBatches
      .filter((batch) => batch.decision === 'precision-brake')
      .every((batch) => (
        [1, 2, 4].includes(batch.ticks)
        && batch.controlPlanSafe === true
        && batch.sweeps.length === batch.ticks
        && batch.sweeps.every((sweep) => sweep.safe)
      ))
      && tape.frames.some((frame) => (
        frame.keys[PQ017_PRECISION_BRAKE_KEY] === true
        && frame.keys.KeyW === false
        && frame.keys.KeyS === false
      )),
    keyFrames: tape.frames,
  };
}

export async function runPq017OrdinaryMasslineDurabilityHarness() {
  const sim = createSimulation({
    seed: 0x5017,
    systems: [actions, flightV3, physics, tetherGameplay],
  });
  const {
    state,
    registry,
    bus,
    helpers,
  } = sim;
  configureRealFlightState(state);

  const player = spawnHitch(sim, {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: Math.PI,
  });
  state.playerId = player.id;
  const endpoint = spawnHitch(sim, {
    isPlayer: false,
    pos: { x: 60, z: 0 },
    rot: 0,
  });
  endpoint.data = { ...endpoint.data, scenarioRole: 'ordinary-massline-ship' };

  const physicsSystem = registry.get('physics');
  const events = {
    broke: [],
    broken: [],
    released: [],
  };
  bus.on('tether:broke', (payload) => events.broke.push(payload));
  bus.on('tether:broken', (payload) => events.broken.push(payload));
  bus.on('tether:released', (payload) => events.released.push(payload));

  try {
    const sg02Ready = await physicsSystem.prepareBackend(state, {});
    if (sg02Ready !== true) throw new Error('PQ-017 Massline harness could not initialize SG-02');
    const attachmentService = registry.get('actions')?.kernel?.attachments;
    if (!attachmentService) throw new Error('PQ-017 Massline harness lost attachment authority');
    const created = attachmentService.create({
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: endpoint.id,
      sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
      targetWorld: { x: endpoint.pos.x, y: 0, z: endpoint.pos.z },
    });
    if (!created?.ok || !created.attachment) {
      throw new Error(`PQ-017 Massline harness could not attach (${created?.reason || 'unknown'})`);
    }

    // First neutral tick lets tetherGameplay adopt the real attachment and publish its phase.
    const tape = new PilotKeyTape(state);
    tape.hold(state.tick, {});
    tape.apply(state, state.tick);
    sim.step(SIM_DT);

    const phases = [];
    const phaseSpecs = [
      // Facing away from the target, reverse thrust moves the Hitch toward it and creates slack.
      { id: 'slack-approach', ticks: 45, keys: { KeyS: true }, boost: false },
      // Full forward thrust reverses that motion and catches the slack at ordinary starter mass.
      { id: 'slack-snap', ticks: 75, keys: { KeyW: true, ShiftLeft: true }, boost: true },
      { id: 'sustained-taut-thrust', ticks: 120, keys: { KeyW: true, ShiftLeft: true }, boost: true },
      { id: 'reverse-to-slack', ticks: 60, keys: { KeyS: true }, boost: false },
      { id: 'second-slack-snap', ticks: 75, keys: { KeyW: true, ShiftLeft: true }, boost: true },
    ];

    for (const phase of phaseSpecs) {
      tape.hold(state.tick, phase.keys);
      let sawSlack = false;
      let sawTaut = false;
      let maxDistance = 0;
      let maxTension = 0;
      let maxStretch = 0;
      for (let index = 0; index < phase.ticks; index += 1) {
        tape.apply(state, state.tick);
        sim.step(SIM_DT);
        const active = attachmentService.get(created.attachment.id);
        const telemetry = helpers.combatPhysics?.getAttachmentTelemetry?.({
          attachmentId: created.attachment.id,
          physicsHandle: created.attachment.physicsHandle,
          tick: state.tick,
        }) || null;
        const distance = Math.hypot(
          (endpoint.pos?.x || 0) - (player.pos?.x || 0),
          (endpoint.pos?.z || 0) - (player.pos?.z || 0),
        );
        const physicalPhase = telemetry?.phase || active?.physicsSpringState?.phase;
        const gameplayPhase = state.player?.tether?.phase;
        sawSlack = sawSlack || physicalPhase === 'slack' || gameplayPhase === 'slack';
        sawTaut = sawTaut || ['capture', 'loaded', 'overload'].includes(physicalPhase)
          || ['capture', 'loaded', 'overload'].includes(gameplayPhase);
        maxDistance = Math.max(maxDistance, distance);
        maxTension = Math.max(
          maxTension,
          Number(telemetry?.tension) || 0,
          Number(active?.lastTension) || 0,
        );
        maxStretch = Math.max(maxStretch, Number(telemetry?.stretch) || 0);
      }
      phases.push({
        id: phase.id,
        ticks: phase.ticks,
        boost: phase.boost,
        sawSlack,
        sawTaut,
        maxDistance: round(maxDistance),
        maxTension: round(maxTension),
        maxStretch: round(maxStretch),
      });
    }

    const activeBeforeCut = attachmentService.get(created.attachment.id);
    const attachmentActiveBeforeCut = activeBeforeCut?.state === 'active';
    const automaticBreakEvents = [
      ...events.broke.map((payload) => ({ channel: 'tether:broke', ...payload })),
      ...events.broken
        .filter((payload) => payload?.reason !== 'tether_cut')
        .map((payload) => ({ channel: 'tether:broken', ...payload })),
    ];

    tape.hold(state.tick, {});
    tape.apply(state, state.tick, {
      massline: {
        phase: 'cut',
        latch: false,
        cut: true,
        lineControl: false,
        lineLength: 0,
        reelIn: 0,
        payOut: 0,
        orbitDirection: 0,
        pump: false,
        buffered: false,
        source: 'pq017-public-key-tape',
      },
    });
    sim.step(SIM_DT);
    const afterCut = attachmentService.get(created.attachment.id);

    return {
      systems: registry.systems.map((system) => system.name),
      sg02Ready: state.physicsRuntime?.diagnostics?.sg02Ready === true,
      ordinaryEndpoint: endpoint.data?.masslineExtremeLoad !== true
        && endpoint.data?.masslineBreakPolicy !== 'extreme_overload',
      automaticBreakAllowed: automaticMasslineBreakAllowed(STANDARD_TETHER, player, endpoint),
      phases,
      automaticBreakEvents,
      attachmentActiveBeforeCut,
      manualCut: {
        reason: afterCut?.breakReason || null,
        releasedEvents: events.released.length,
        attachmentActive: afterCut?.state === 'active',
      },
    };
  } finally {
    disposeRealSim(sim, physicsSystem);
  }
}

async function runProtectedControlReplay(capture, profile) {
  const fixture = await createRealControlFixture(capture);
  const { sim, state, player, physicsSystem } = fixture;
  const tape = new PilotKeyTape(state);
  const trace = [tracePoint(state, player, normalizeKeys({}))];
  const tickBatches = [];
  let unsafeAppliedSegments = 0;
  let replanCount = 0;
  let batchIndex = 0;

  try {
    while (trace.length - 1 < CONTROL_WINDOW_TICKS) {
      const navigation = navigationFor(player, capture.target);
      const decision = decidePq017SettledArrivalControl(navigation, {
        settledRadius: capture.settledRadius,
        maxSettledSpeed: capture.maxSettledSpeed,
        maxApproachSpeed: capture.maxSettledSpeed,
      });
      const controlPlan = planPq017RouteSafeDisplacement(
        {
          position: { x: player.pos.x, z: player.pos.z },
          velocity: { x: player.vel.x, z: player.vel.z },
          rotation: player.rot,
          angularVelocity: player.angVel,
        },
        decision,
        capture.obstacles,
        HITCH_RADIUS,
      );
      if (!controlPlan.safe) {
        replanCount += 1;
        break;
      }

      const requested = profile.tickBatches[batchIndex % profile.tickBatches.length];
      const batchTicks = Math.min(requested, CONTROL_WINDOW_TICKS - (trace.length - 1));
      const keys = pq017PublicKeysForDecision(decision);
      tape.hold(state.tick, keys);
      tickBatches.push(batchTicks);
      for (let tick = 0; tick < batchTicks; tick += 1) {
        const previous = { x: player.pos.x, z: player.pos.z };
        const appliedKeys = tape.apply(state, state.tick);
        sim.step(SIM_DT);
        const sweep = auditPq017RouteSweep(
          previous,
          player.pos,
          capture.obstacles,
          HITCH_RADIUS,
        );
        if (!sweep.safe) unsafeAppliedSegments += 1;
        trace.push(tracePoint(state, player, appliedKeys, sweep));
      }
      batchIndex += 1;
    }

    return {
      captureId: capture.id,
      profileId: profile.id,
      systems: fixture.systems,
      sg02Ready: fixture.sg02Ready,
      fixedTicks: trace.length - 1,
      tickBatches,
      trace,
      replanCount,
      unsafeAppliedSegments,
      playerDisplacement: round(Math.hypot(
        trace.at(-1).position.x - trace[0].position.x,
        trace.at(-1).position.z - trace[0].position.z,
      )),
      keyFrames: tape.frames,
    };
  } finally {
    disposeRealSim(sim, physicsSystem);
  }
}

async function runUnprotectedDefectReplay(capture, profile) {
  const fixture = await createRealControlFixture(capture);
  const { sim, state, player, physicsSystem } = fixture;
  const tape = new PilotKeyTape(state);
  const trace = [tracePoint(state, player, normalizeKeys({}))];
  let firstUnsafeSweep = null;

  try {
    const navigation = navigationFor(player, capture.target);
    const decision = decidePq017SettledArrivalControl(navigation, {
      settledRadius: capture.settledRadius,
      maxSettledSpeed: capture.maxSettledSpeed,
      maxApproachSpeed: capture.maxSettledSpeed,
    });
    const plan = planPq017RouteSafeDisplacement(
      {
        position: { x: player.pos.x, z: player.pos.z },
        velocity: { x: player.vel.x, z: player.vel.z },
        rotation: player.rot,
        angularVelocity: player.angVel,
      },
      decision,
      capture.obstacles,
      HITCH_RADIUS,
    );
    tape.hold(state.tick, pq017PublicKeysForDecision(decision));

    const replayTicks = 15;
    let elapsed = 0;
    let batchIndex = 0;
    while (elapsed < replayTicks) {
      const batchTicks = Math.min(
        profile.tickBatches[batchIndex % profile.tickBatches.length],
        replayTicks - elapsed,
      );
      for (let tick = 0; tick < batchTicks; tick += 1) {
        const previous = { x: player.pos.x, z: player.pos.z };
        const appliedKeys = tape.apply(state, state.tick);
        sim.step(SIM_DT);
        const sweep = auditPq017RouteSweep(
          previous,
          player.pos,
          capture.obstacles,
          HITCH_RADIUS,
        );
        if (!sweep.safe && !firstUnsafeSweep) firstUnsafeSweep = sweep;
        trace.push(tracePoint(state, player, appliedKeys, sweep));
        elapsed += 1;
      }
      batchIndex += 1;
    }

    return {
      captureId: capture.id,
      plannerAction: plan.action,
      unprotectedUnsafe: firstUnsafeSweep != null,
      closestConstraint: firstUnsafeSweep?.closestConstraint || null,
      trajectory: trace,
      keys: tape.frames,
    };
  } finally {
    disposeRealSim(sim, physicsSystem);
  }
}

async function createRealControlFixture(capture) {
  const sim = createSimulation({
    seed: 0x5017,
    systems: [actions, flightV3, physics],
  });
  const { state, registry } = sim;
  configureRealFlightState(state);
  const player = spawnHitch(sim, {
    isPlayer: true,
    pos: capture.position,
    rot: capture.rotation,
  });
  state.playerId = player.id;
  player.vel.x = capture.velocity.x;
  player.vel.z = capture.velocity.z;
  player.angVel = capture.angularVelocity;

  const physicsSystem = registry.get('physics');
  const ready = await physicsSystem.prepareBackend(state, {});
  if (ready !== true) {
    disposeRealSim(sim, physicsSystem);
    throw new Error(`PQ-017 real control fixture could not initialize SG-02 for ${capture.id}`);
  }
  return {
    sim,
    state,
    player,
    physicsSystem,
    sg02Ready: state.physicsRuntime?.diagnostics?.sg02Ready === true,
    systems: registry.systems.map((system) => system.name),
  };
}

function configureRealFlightState(state) {
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.controls.flightMode = 'assisted';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;
  state.freeIds.length = 0;
}

function spawnHitch(sim, {
  isPlayer,
  pos,
  rot,
}) {
  return sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer,
    player: isPlayer ? sim.state.player : null,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: pos.x, z: pos.z },
    rot,
  }));
}

function navigationFor(player, target) {
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const distance = Math.hypot(dx, dz);
  const vx = Number(player.vel?.x) || 0;
  const vz = Number(player.vel?.z) || 0;
  const speed = Math.hypot(vx, vz);
  return {
    distance,
    speed,
    closingSpeed: distance > 1e-9 ? (vx * dx + vz * dz) / distance : 0,
    headingError: wrapAngle(Math.atan2(dz, dx) - (Number(player.rot) || 0)),
    velocityHeadingError: speed > 1e-9
      ? wrapAngle(Math.atan2(-vz, -vx) - (Number(player.rot) || 0))
      : 0,
    directStoppingDistance: null,
  };
}

function tracePoint(state, player, keys, sweep = null) {
  return Object.freeze({
    tick: state.tick,
    position: Object.freeze({
      x: round(player.pos.x),
      z: round(player.pos.z),
    }),
    velocity: Object.freeze({
      x: round(player.vel.x),
      z: round(player.vel.z),
    }),
    rotation: round(player.rot),
    angularVelocity: round(player.angVel),
    keys,
    sweepSafe: sweep?.safe !== false,
    clearance: round(sweep?.closestConstraint?.clearance),
  });
}

function capturedSeed(input) {
  const targetAngle = Math.atan2(
    input.target.z - input.position.z,
    input.target.x - input.position.x,
  );
  const rotation = Number.isFinite(input.rotation)
    ? input.rotation
    : wrapAngle(targetAngle - input.headingError);
  const velocity = input.velocity || velocityFromHeading(
    input.speed,
    rotation,
    input.velocityHeadingError,
  );
  return Object.freeze({
    id: input.id,
    source: input.source,
    position: Object.freeze({ ...input.position }),
    velocity: Object.freeze({ ...velocity }),
    target: Object.freeze({ ...input.target }),
    rotation,
    angularVelocity: Number(input.angularVelocity) || 0,
    settledRadius: input.settledRadius,
    maxSettledSpeed: input.maxSettledSpeed,
    obstacles: Object.freeze((input.obstacles || []).map((entry) => Object.freeze({ ...entry }))),
  });
}

function velocityFromHeading(speed, rotation, velocityHeadingError) {
  const velocityAngle = wrapAngle(rotation + velocityHeadingError + Math.PI);
  return {
    x: Math.cos(velocityAngle) * speed,
    z: Math.sin(velocityAngle) * speed,
  };
}

function measuredVelocity(start, end, speed) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: dx / length * speed,
    z: dz / length * speed,
  };
}

function normalizeKeys(keys) {
  return Object.freeze({
    KeyW: keys.KeyW === true,
    KeyS: keys.KeyS === true,
    KeyA: keys.KeyA === true,
    KeyD: keys.KeyD === true,
    KeyQ: keys.KeyQ === true,
    KeyE: keys.KeyE === true,
    ShiftLeft: keys.ShiftLeft === true,
    [PQ017_PRECISION_BRAKE_KEY]: keys[PQ017_PRECISION_BRAKE_KEY] === true,
  });
}

function sameKeys(a, b) {
  return a.KeyW === b.KeyW
    && a.KeyS === b.KeyS
    && a.KeyA === b.KeyA
    && a.KeyD === b.KeyD
    && a.KeyQ === b.KeyQ
    && a.KeyE === b.KeyE
    && a.ShiftLeft === b.ShiftLeft
    && a[PQ017_PRECISION_BRAKE_KEY] === b[PQ017_PRECISION_BRAKE_KEY];
}

function wrapAngle(value) {
  let angle = Number(value) || 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1e6) / 1e6 : null;
}

function disposeRealSim(sim, physicsSystem) {
  try {
    sim.dispose();
  } catch {
    // Bus disposal is best-effort; the Rapier world below is the material resource.
  }
  if (typeof physicsSystem?._disableSg02DynamicAuthority === 'function') {
    try {
      physicsSystem._disableSg02DynamicAuthority();
    } catch {
      // Tests are already complete; disposal must not replace their evidence.
    }
  }
}
