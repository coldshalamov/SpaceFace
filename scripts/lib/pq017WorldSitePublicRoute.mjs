// PQ-017 Persistent World Site public-route acceptance shared by Browser and Electron.
//
// The route drives only shipped player surfaces: title/New Game/Launch, keyboard flight and target
// cycling, contextual B (the keyboard equivalent of LT), Massline, F5, title Continue, and the map.
// page.evaluate is observation-only apart from probe-local event listeners. Any unavailable player
// route throws NORMAL_ROUTE_BLOCKED instead of substituting an internal event or state write.

import assert from 'node:assert/strict';
import { readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  bootToAuthoredFlight,
  TRAVEL_PUBLIC_HELPERS,
} from './professionalTravelPublicRoute.mjs';
import {
  PQ017_CONTROL_BATCH_PROFILES,
  PQ017_CONTROL_RESPONSE_TICKS,
  PQ017_PRECISION_BRAKE_KEY,
  PQ017_RELEASED_LOCAL_BATCH_PROFILES,
  pq017PrecisionBrakeTargetProjection,
  pq017PublicKeysForDecision,
  predictPq017PrecisionBrakeStopTrajectory,
  predictPq017PublicControlTrajectory,
} from './pq017PublicControlTrajectory.mjs';
import { ATTACHMENT_DEFS } from '../../src/data/combatDefs.js';
import { worldSiteManifestById } from '../../src/data/worldSiteManifests.js';
import { worldSiteOperationReadiness } from '../../src/systems/worldSiteKernel.js';

export const PQ017_ROUTE_SCHEMA = 'spaceface.pq017WorldSitePublicRoute.v3';
export const PQ017_SITE_ID = 'world_site_helios_relay';
export const PQ017_ROOT_WORLD_ID = `${PQ017_SITE_ID}/root`;
export const PQ017_PAYLOAD_WORLD_ID = `${PQ017_SITE_ID}/payload/relay_field_coil`;
const PQ017_RELAY_CORE_WORLD_ID = `${PQ017_SITE_ID}/component/relay_core`;
export const PQ017_HISTORY_RETENTION = 3;

export const PQ017_ROUTE_LIMITS = Object.freeze({
  frameSamples: 900,
  minimumFrameSamples: 30,
  hitchThresholdMs: 32,
  // Browser frame timestamps quantize a 30 Hz floor to 33.3-33.4 ms. Use the representable
  // boundary while still rejecting any p95 cadence below the authored 30 fps floor.
  floorP95BudgetMs: 34,
  siteEntities: 16,
  siteRenderRoots: 16,
  presentationFixtures: 12,
});

export const PQ017_SCREENSHOTS = Object.freeze({
  title: '01-title.png',
  newGame: '02-new-game.png',
  launch: '03-authored-flight.png',
  arrival: '04-site-arrival.png',
  powered: '05-site-powered.png',
  opened: '06-payload-opened.png',
  recovered: '07-site-recovered.png',
  continueTitle: '08-title-continue.png',
  continued: '09-continued-site.png',
  awaySector: '10-site-absent-away-sector.png',
  returned: '11-site-rematerialized-return-sector.png',
  impact: '12-impact-rollback.png',
  history: '13-map-history.png',
});

const SOCKETS = Object.freeze([
  'SOCKET_Structure_Core',
  'SOCKET_Dock_Approach',
  'SOCKET_Emissive',
  'SOCKET_Module_Depot',
  'SOCKET_Module_Refinery',
  'SOCKET_Module_Defense',
]);

const OPERATIONS = Object.freeze([
  ['relay_core', 'repair_relay_core'],
  ['safety_coupler', 'recover_safety_coupler'],
  ['cargo_brace', 'cut_cargo_brace'],
  ['payload_cradle', 'unseal_payload_cradle'],
]);
const ACTIVE_PERFORMANCE_PHASES = Object.freeze([
  ...OPERATIONS.map(([, operationId]) => `operation:${operationId}`),
  ...OPERATIONS.map(([, operationId]) => `wait:${operationId}`),
  'finalization:opened',
]);

const SITE_OPERATION_APPROACH_TIMEOUT_MS = 45_000;
const SITE_ROOT_SETTLE_TIMEOUT_MS = 120_000;
// At 4 u/s, even a full 15-second fail-closed operation wait can drift at most 60 units without
// further damping. Settling inside 100 still leaves over 80 units of margin against the shipped Mk1
// beam's observed 240-unit range before any component radius is added.
const SITE_OPERATION_SETTLED_WITHIN = 100;
const SITE_OPERATION_MAX_SETTLED_SPEED = 4;
const SITE_OPERATION_SETTLED_SAMPLES = 4;
// This is the lowest reverse acceleration in the shipped propulsion catalog. Using it for the
// route envelope deliberately predicts a longer stop than the starting ship should need.
const SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL = 12;
const SITE_ARRIVAL_YAW_RELEASE_DEADBAND = 0.12;
const SITE_ARRIVAL_THRUST_HEADING_WINDOW = 0.4;
const SITE_ARRIVAL_SAMPLE_MS = 50;
const PQ017_ORDINARY_BRAKE_MIN_SPEED = 0.5;
export const PQ017_RELEASED_DETOUR_SETTLED_SPEED = PQ017_ORDINARY_BRAKE_MIN_SPEED;
export const PQ017_RELEASED_LAUNCH_READY_SPEED = 0.3;
const PQ017_ORDINARY_BRAKE_RECOVERY_TICKS = 12;
const SITE_AUTOPILOT_RECOVERY_SAMPLES = 20;
const SITE_AUTOPILOT_MIN_RETREAT_DISTANCE = 4;
const PQ017_AUTOPILOT_ENGAGEMENT_ATTEMPT_LIMIT = 3;
const SITE_TETHER_MAX_LENGTH = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard')?.maxLength || 0;
const PQ017_ROUTE_PLANNER_MARGIN = 18;
const PQ017_RING_PASS_THROUGH_BASE_RADIUS = 16;
const PQ017_RING_PASS_THROUGH_MAX_RADIUS = 48;
const PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN = 2;
const PQ017_RELEASED_ESCAPE_SOLID_RESERVE = 0.1;
const PQ017_TOW_PASS_THROUGH_SPEED_CAP = 16;
const PQ017_RECEIVER_SHORT_CROSSING_MAX_ROUTE = 96;
const PQ017_RECEIVER_UNTETHERED_DETOUR_LIMIT = 2;
const PQ017_RECEIVER_LOCAL_CONVERGENCE_LIMIT = 3;
const PQ017_RECEIVER_RELATCH_ATTEMPT_LIMIT = 2;
const PQ017_RELEASED_LOCAL_YAW_BRAKE = 14;
const PQ017_RELEASED_LOCAL_YAW_DEADBAND = 0.06;
const PQ017_RELEASED_LOCAL_YAW_RATE_DEADBAND = 0.08;
const PQ017_RELEASED_LOCAL_FIXED_DT = 1 / 60;
const PQ017_RELEASED_LOCAL_ORDINARY_BATCH_TICKS = 4;
const PQ017_RELEASED_PRECISION_BRAKE_HOLD_TICK_LIMIT = 600;
const PQ017_RELEASED_PAYLOAD_SETTLED_SPEED = 1;
const PQ017_RELEASED_PAYLOAD_MAX_DRIFT = 12;
const PQ017_RELEASED_PAYLOAD_STABLE_SAMPLES = 4;
const PQ017_IMPACT_CAPTURE_SAMPLE_LIMIT = 600;
// A 95 wu/s contact is comfortably above the safety coupler's 160 dp trigger even at the
// player's lightest shipped mass. Boost is intentionally excluded: it is a 160 wu/s dash impulse,
// so one sample can overshoot this bounded contact envelope before the controller can coast.
const PQ017_IMPACT_SPEED_CAP = 95;

const { searchAndSelect, clickPersistentButton, shot, waitBootOverlayGone } = TRAVEL_PUBLIC_HELPERS;

function pq017WaypointTrajectoryProgressing(navigation = {}, decision = {}) {
  const speed = Number(navigation.speed);
  const closingSpeed = Number(navigation.closingSpeed);
  const headingError = Number(navigation.headingError);
  return [speed, closingSpeed, headingError].every(Number.isFinite)
    && decision.action === 'approach'
    && decision.thrust === true
    && closingSpeed >= Math.max(1, speed * 0.5)
    && Math.abs(headingError) < SITE_ARRIVAL_THRUST_HEADING_WINDOW;
}

export function updatePq017WaypointProgressEpoch(
  navigation = {},
  decision = {},
  progress = {},
  {
    now = Date.now(),
    retreatDistance = 4,
    recentProgress = 2,
  } = {},
) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const distance = finite(navigation.distance);
  const tick = finite(navigation.tick);
  const timestamp = finite(now);
  if (distance == null || timestamp == null) return { ...progress };
  const lastSampleTick = finite(progress.lastSampleTick);
  if (tick != null && lastSampleTick != null && tick <= lastSampleTick) {
    return { ...progress };
  }
  const startDistance = finite(progress.startDistance) ?? distance;
  const bestDistance = Math.min(finite(progress.bestDistance) ?? distance, distance);
  let epochStartDistance = finite(progress.epochStartDistance);
  let epochBestDistance = finite(progress.epochBestDistance);
  let epochProgressAnchorDistance = finite(progress.epochProgressAnchorDistance);
  let lastProgressAt = finite(progress.lastProgressAt) ?? timestamp;
  let epochId = Math.max(0, Math.trunc(Number(progress.epochId) || 0));
  let epochStartedTick = finite(progress.epochStartedTick);
  let freshEpochPending = progress.freshEpochPending === true;
  const retreatThreshold = Math.max(0, Number(retreatDistance) || 0);
  const recentThreshold = Math.max(0, Number(recentProgress) || 0);
  if (epochBestDistance != null
      && distance - epochBestDistance >= retreatThreshold) {
    freshEpochPending = true;
  }
  const strictTrajectory = pq017WaypointTrajectoryProgressing(navigation, decision);
  if (epochStartDistance == null || freshEpochPending) {
    if (strictTrajectory) {
      epochId += 1;
      epochStartDistance = distance;
      epochBestDistance = distance;
      epochProgressAnchorDistance = distance;
      lastProgressAt = timestamp;
      epochStartedTick = tick;
      freshEpochPending = false;
    }
  } else if (distance < epochBestDistance) {
    epochBestDistance = distance;
    if (epochProgressAnchorDistance == null
        || epochProgressAnchorDistance - distance >= recentThreshold) {
      epochProgressAnchorDistance = distance;
      lastProgressAt = timestamp;
    }
  }
  return {
    ...progress,
    startDistance,
    bestDistance,
    epochId,
    epochStartDistance,
    epochBestDistance,
    epochProgressAnchorDistance,
    epochStartedTick,
    freshEpochPending,
    lastProgressAt,
    lastSampleTick: tick ?? lastSampleTick,
  };
}

export function decidePq017WaypointProgressExtension(
  navigation = {},
  decision = {},
  progress = {},
  {
    extensionMs = 15_000,
    maxExtensions = 2,
    staleAfterMs = 5_000,
    minimumProgress = 4,
  } = {},
) {
  const distance = Number(navigation.distance);
  const speed = Number(navigation.speed);
  const closingSpeed = Number(navigation.closingSpeed);
  const headingError = Number(navigation.headingError);
  const startDistance = Number(
    progress.epochStartDistance ?? progress.startDistance,
  );
  const bestDistance = Number(
    progress.epochBestDistance ?? progress.bestDistance,
  );
  const lastProgressAt = Number(progress.lastProgressAt);
  const now = Number(progress.now);
  const extensions = Math.max(0, Math.trunc(Number(progress.extensions) || 0));
  const duration = Math.max(0, Math.trunc(Number(extensionMs) || 0));
  const limit = Math.max(0, Math.trunc(Number(maxExtensions) || 0));
  const staleWindow = Math.max(0, Number(staleAfterMs) || 0);
  const requiredProgress = Math.max(0, Number(minimumProgress) || 0);
  const invalid = ![
    distance, speed, closingSpeed, headingError, startDistance, bestDistance,
    lastProgressAt, now,
  ].every(Number.isFinite);
  if (invalid || duration <= 0 || extensions >= limit) {
    return { extend: false, reason: invalid ? 'progress-invalid' : 'extension-cap', extensionMs: 0 };
  }
  if (!pq017WaypointTrajectoryProgressing(navigation, decision)) {
    return { extend: false, reason: 'trajectory-not-progressing', extensionMs: 0 };
  }
  if (startDistance - bestDistance < requiredProgress
      || distance > bestDistance + 1
      || now - lastProgressAt > staleWindow) {
    return { extend: false, reason: 'material-progress-stale', extensionMs: 0 };
  }
  return { extend: true, reason: 'healthy-material-progress', extensionMs: duration };
}

export function decidePq017SettledArrivalControl(navigation = {}, {
  settledRadius = SITE_OPERATION_SETTLED_WITHIN,
  maxSettledSpeed = SITE_OPERATION_MAX_SETTLED_SPEED,
  brakeAccel = SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
  maxApproachSpeed = 70,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const round = (value) => value == null ? null : Math.round(value * 1000) / 1000;
  const distance = finite(navigation.distance);
  const speed = finite(navigation.speed);
  const closingSpeed = finite(navigation.closingSpeed);
  const headingError = finite(navigation.headingError);
  const velocityHeadingError = finite(navigation.velocityHeadingError);
  const directStoppingDistance = finite(navigation.directStoppingDistance);
  const radius = Math.max(0, finite(settledRadius) ?? SITE_OPERATION_SETTLED_WITHIN);
  const settledSpeed = Math.max(0, finite(maxSettledSpeed) ?? SITE_OPERATION_MAX_SETTLED_SPEED);
  const conservativeBrakeAccel = Math.max(1, finite(brakeAccel)
    ?? SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL);
  if ([distance, speed, closingSpeed, headingError].some((value) => value == null)) {
    return {
      action: 'invalid', reason: 'navigation-missing', thrust: false, turnDirection: 0,
      distance: round(distance), speed: round(speed), closingSpeed: round(closingSpeed),
      headingError: round(headingError), stoppingDistance: null, closingStoppingDistance: null,
      approachSpeedCap: null, stoppingDistanceSource: null, brakePulseMs: 0,
    };
  }

  const remainingDistance = Math.max(0, distance - radius);
  const lateralSpeed = Math.sqrt(Math.max(0, speed * speed - closingSpeed * closingSpeed));
  // Full speed, rather than only radial closing speed, is the conservative stop envelope: lateral
  // momentum must also be killed before the ship can hold a component in beam range.
  const conservativeStoppingDistance = (speed * speed) / (2 * conservativeBrakeAccel);
  const stoppingDistance = directStoppingDistance != null && directStoppingDistance >= 0
    ? directStoppingDistance
    : conservativeStoppingDistance;
  const stoppingDistanceSource = directStoppingDistance != null && directStoppingDistance >= 0
    ? 'flight-telemetry-direct'
    : 'conservative-fallback';
  const closingStoppingDistance = closingSpeed > 0
    ? (closingSpeed * closingSpeed) / (2 * conservativeBrakeAccel)
    : 0;
  // Scale sampling margin with actual motion. A fixed 24-WU floor was larger than the entire
  // remaining corridor at tight collision-clear waypoints, so low-speed guidance could brake
  // forever even when live braking telemetry proved ample room. Four WU remains a conservative
  // fixed-step floor; speed and lateral drift expand it when the ship is actually moving fast.
  const brakeBuffer = Math.max(4, speed * 0.35 + lateralSpeed * 0.6);
  const speedEnvelopeDistance = Math.max(0, remainingDistance - brakeBuffer);
  const configuredApproachSpeed = Math.max(
    settledSpeed,
    finite(maxApproachSpeed) ?? 70,
  );
  const approachSpeedCap = Math.max(
    settledSpeed,
    Math.min(configuredApproachSpeed,
      Math.sqrt(2 * conservativeBrakeAccel * speedEnvelopeDistance) * 0.62),
  );
  const movingAway = closingSpeed < -Math.max(1, settledSpeed * 0.5);
  const lateralCapture = lateralSpeed > Math.max(8, Math.max(0, closingSpeed) * 0.75)
    && speed > settledSpeed + 2;
  const headingCapture = Math.abs(headingError) > 0.72
    && speed > Math.max(8, approachSpeedCap * 0.35);
  const tightWaypoint = radius <= PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN;
  const tightWaypointCapture = tightWaypoint
    && speed > settledSpeed
    && distance <= radius + brakeBuffer;
  const nearTargetOvershoot = movingAway
    && speed > settledSpeed
    && distance <= radius + brakeBuffer;
  const common = {
    distance: round(distance),
    speed: round(speed),
    closingSpeed: round(closingSpeed),
    lateralSpeed: round(lateralSpeed),
    headingError: round(headingError),
    velocityHeadingError: round(velocityHeadingError),
    remainingDistance: round(remainingDistance),
    stoppingDistance: round(stoppingDistance),
    stoppingDistanceSource,
    closingStoppingDistance: round(closingStoppingDistance),
    brakeBuffer: round(brakeBuffer),
    approachSpeedCap: round(approachSpeedCap),
    brakeAccel: round(conservativeBrakeAccel),
    lateralCapture,
    tightWaypointCapture,
    nearTargetOvershoot,
    // Pilot A/D yaws while coasting and becomes a lower-authority carve/strafe once W is held.
    // Release yaw inside the stable deadband, but allow useful forward progress through the wider
    // thrust window so 50 ms samples cannot starve W by skipping across a narrow yaw boundary.
    turnDirection: headingError > SITE_ARRIVAL_YAW_RELEASE_DEADBAND
      ? 1
      : headingError < -SITE_ARRIVAL_YAW_RELEASE_DEADBAND ? -1 : 0,
  };
  const brake = (reason) => {
    // Pilot KeyS projects both reverse intent and the shipped assisted-brake flag. Flight V3 then
    // opposes the live velocity vector and suppresses the manual reverse component while it would
    // reinforce meaningful motion. Yawing first is therefore not a prerequisite for braking; at a
    // tight waypoint it merely spends corridor while the ship keeps drifting.
    return {
      ...common,
      action: 'brake',
      reason,
      thrust: false,
      appliedTurnDirection: 0,
      brakePulseMs: speed > 30 ? 60 : speed > 10 ? 35 : 20,
    };
  };

  // A low-speed sample already inside the requested position gate is complete regardless of radial
  // sign. Reacquiring first would accelerate a valid close flyby into another pass.
  if (distance <= radius && speed <= settledSpeed) {
    return {
      ...common, action: 'settled', reason: 'position-and-speed-settled', thrust: false,
      appliedTurnDirection: 0, brakePulseMs: 0,
    };
  }
  if ((movingAway && lateralCapture) || nearTargetOvershoot) {
    // KeyS is nose-relative reverse thrust, not an omnidirectional brake. First coast/yaw the nose
    // onto the live velocity vector with W/S released; only then can a bounded KeyS pulse oppose
    // that vector. The bounded near-target pocket retains this capture after a sub-radius flyby,
    // while farther radial retreats still use the ordinary target-facing W path below.
    if (velocityHeadingError == null) {
      return {
        ...common,
        action: 'invalid',
        reason: 'velocity-heading-missing',
        thrust: false,
        appliedTurnDirection: 0,
        brakePulseMs: 0,
      };
    }
    if (Math.abs(velocityHeadingError) > SITE_ARRIVAL_YAW_RELEASE_DEADBAND) {
      return {
        ...common,
        action: 'velocity-align',
        reason: nearTargetOvershoot
          ? 'near-target-overshoot-align'
          : 'lateral-velocity-align',
        thrust: false,
        appliedTurnDirection: velocityHeadingError > 0 ? 1 : -1,
        brakePulseMs: 0,
      };
    }
    return brake(nearTargetOvershoot
      ? 'near-target-overshoot-capture'
      : 'lateral-velocity-capture');
  }
  if (tightWaypointCapture) {
    return brake('tight-waypoint-speed-capture');
  }
  if (movingAway) {
    // S is reverse thrust, not an omnidirectional velocity brake. When the ship is drifting away
    // while its nose points at the destination, S reinforces the bad velocity. Turn toward the
    // target, then use W to cancel the retreat through the same Pilot controls a player has.
    const thrust = Math.abs(headingError) < SITE_ARRIVAL_THRUST_HEADING_WINDOW;
    return {
      ...common,
      action: 'approach',
      reason: 'moving-away-reacquire',
      thrust,
      appliedTurnDirection: thrust ? 0 : common.turnDirection,
      brakePulseMs: 0,
    };
  }
  if (distance <= radius) {
    return brake('inside-moving');
  }
  if (lateralCapture) {
    return brake('lateral-velocity-capture');
  }
  if (headingCapture) {
    return brake('heading-capture');
  }
  // The fixed buffer absorbs sampling latency at meaningful closing speed. Once radial closure is
  // already within the requested settled-speed bound, applying that buffer alone can pin a ship
  // with harmless lateral drift outside a tight waypoint forever. Keep capturing until radial
  // closure exceeds the bound; the same stop envelope then protects the remaining distance.
  if (closingSpeed > settledSpeed && stoppingDistance + brakeBuffer >= remainingDistance) {
    return brake('stopping-envelope');
  }
  if (speed > approachSpeedCap) {
    return brake('dynamic-speed-cap');
  }
  const thrust = Math.abs(headingError) < SITE_ARRIVAL_THRUST_HEADING_WINDOW
    && speed < approachSpeedCap;
  return {
    ...common,
    action: 'approach',
    reason: 'within-speed-envelope',
    thrust,
    // Under the default Pilot scheme, A/D becomes strafe-plus-carve while W is held. Alternate
    // turn-only and thrust-only samples so guidance does not build an orbiting lateral velocity.
    appliedTurnDirection: thrust ? 0 : common.turnDirection,
    brakePulseMs: 0,
  };
}

export function decidePq017BrakeBelow(speed, maxSpeed, {
  attempt = 0,
  maxAttempts = Infinity,
  minimumBrakeSpeed = PQ017_ORDINARY_BRAKE_MIN_SPEED,
  forceCoast = false,
} = {}) {
  const currentSpeed = Number(speed);
  const requestedMaxSpeed = Number(maxSpeed);
  const currentAttempt = Math.max(0, Math.trunc(Number(attempt) || 0));
  const attemptLimit = maxAttempts === Infinity
    ? Infinity
    : Math.max(0, Math.trunc(Number(maxAttempts) || 0));
  const brakeFloor = Number(minimumBrakeSpeed);
  if (!Number.isFinite(currentSpeed) || currentSpeed < 0
      || !Number.isFinite(requestedMaxSpeed) || requestedMaxSpeed < 0
      || !Number.isFinite(brakeFloor) || brakeFloor < 0) {
    return {
      action: 'invalid',
      speed: Number.isFinite(currentSpeed) ? currentSpeed : null,
      maxSpeed: Number.isFinite(requestedMaxSpeed) ? requestedMaxSpeed : null,
      pressKeyS: false,
      waitFixedTicks: 0,
    };
  }
  if (currentSpeed <= requestedMaxSpeed) {
    return {
      action: 'settled',
      speed: currentSpeed,
      maxSpeed: requestedMaxSpeed,
      pressKeyS: false,
      waitFixedTicks: 0,
    };
  }
  if (currentAttempt >= attemptLimit) {
    return {
      action: 'failed',
      reason: 'attempt-budget-exhausted',
      speed: currentSpeed,
      maxSpeed: requestedMaxSpeed,
      pressKeyS: false,
      waitFixedTicks: 0,
    };
  }
  const coast = forceCoast === true
    || currentSpeed <= Math.max(requestedMaxSpeed, brakeFloor);
  return {
    action: coast ? 'coast' : 'brake',
    speed: currentSpeed,
    maxSpeed: requestedMaxSpeed,
    pressKeyS: !coast,
    waitFixedTicks: coast
      ? forceCoast === true ? PQ017_ORDINARY_BRAKE_RECOVERY_TICKS : 1
      : 0,
  };
}

export function decidePq017BrakePulseProgress({
  startVelocity,
  currentVelocity,
  startTick,
  currentTick,
  targetProjection,
  maxTicks = 12,
} = {}) {
  const startVx = Number(startVelocity?.x);
  const startVz = Number(startVelocity?.z);
  const currentVx = Number(currentVelocity?.x);
  const currentVz = Number(currentVelocity?.z);
  const firstTick = Number(startTick);
  const observedTick = Number(currentTick);
  const target = Number(targetProjection);
  const tickLimit = Math.max(1, Math.trunc(Number(maxTicks) || 0));
  const startSpeed = Math.hypot(startVx, startVz);
  if (![startVx, startVz, currentVx, currentVz, firstTick, observedTick, target]
    .every(Number.isFinite) || startSpeed <= 0 || target < 0) {
    return {
      release: true,
      reason: 'pulse-observation-invalid',
      projection: null,
      reversed: false,
      tickDelta: null,
    };
  }
  const projection = currentVx * (startVx / startSpeed)
    + currentVz * (startVz / startSpeed);
  const tickDelta = Math.max(0, observedTick - firstTick);
  const reversed = projection <= 0;
  const reason = reversed
    ? 'signed-reversal'
    : projection <= target
      ? 'signed-reduction-reached'
      : tickDelta >= tickLimit
        ? 'fixed-tick-cap'
        : 'braking-progress';
  return {
    release: reason !== 'braking-progress',
    reason,
    projection,
    reversed,
    tickDelta,
  };
}

export function decidePq017AttachedRadialBrakeProgress({
  startTick,
  currentTick,
  startRadialSpeed,
  currentRadialSpeed,
  targetRadialSpeed,
  maxTicks = 12,
} = {}) {
  const firstTick = Number(startTick);
  const observedTick = Number(currentTick);
  const before = Number(startRadialSpeed);
  const current = Number(currentRadialSpeed);
  const target = Number(targetRadialSpeed);
  const tickLimit = Math.max(1, Math.trunc(Number(maxTicks) || 0));
  if (![firstTick, observedTick, before, current, target].every(Number.isFinite)
      || before <= 0 || target < 0 || observedTick < firstTick) {
    return {
      release: true,
      reason: 'attached-radial-brake-observation-invalid',
      startRadialSpeed: Number.isFinite(before) ? before : null,
      currentRadialSpeed: Number.isFinite(current) ? current : null,
      signedProgress: false,
      reversed: false,
      tickDelta: null,
      neutralLatch: true,
    };
  }
  const tickDelta = observedTick - firstTick;
  const reversed = current <= 0;
  const signedProgress = current < before - 1e-4;
  const targetReached = current <= target;
  const capped = tickDelta >= tickLimit;
  const noProgress = capped && !signedProgress;
  const reason = reversed
    ? 'attached-radial-brake-reversed'
    : targetReached
      ? 'attached-radial-brake-settled'
      : noProgress
        ? 'attached-radial-brake-no-progress'
        : capped
          ? 'attached-radial-brake-tick-cap'
          : 'attached-radial-brake-progressing';
  return {
    release: reversed || targetReached || capped,
    reason,
    startRadialSpeed: before,
    currentRadialSpeed: current,
    signedProgress,
    reversed,
    tickDelta,
    neutralLatch: reversed || noProgress,
  };
}

export function decidePq017BrakePulseRecovery({
  startSpeed,
  endSpeed,
  progress,
} = {}) {
  const before = Number(startSpeed);
  const after = Number(endSpeed);
  const projection = Number(progress?.projection);
  if (![before, after, projection].every(Number.isFinite)
      || before <= 0 || after < 0) {
    return { forceCoast: true, reason: 'pulse-recovery-invalid' };
  }
  if (progress?.reversed === true || projection <= 0) {
    return { forceCoast: true, reason: 'signed-reversal' };
  }
  if (before - projection <= 0.001) {
    return { forceCoast: true, reason: 'no-signed-progress' };
  }
  if (after >= before) {
    return { forceCoast: true, reason: 'speed-not-reduced' };
  }
  return { forceCoast: false, reason: 'signed-braking-progress' };
}

export function planPq017RouteSafeBrakePulse(
  position,
  velocity,
  obstacles = [],
  playerRadius = 0,
  {
    reverseDistance = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
    escapeContexts = null,
  } = {},
) {
  const px = Number(position?.x);
  const pz = Number(position?.z);
  const vx = Number(velocity?.x);
  const vz = Number(velocity?.z);
  const shipRadius = Number(playerRadius);
  const predictedReverseDistance = Number(reverseDistance);
  const speed = Math.hypot(vx, vz);
  if (![px, pz, vx, vz, shipRadius, predictedReverseDistance].every(Number.isFinite)
      || speed <= 0 || shipRadius < 0 || predictedReverseDistance < 0) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'reverse-pulse-route-observation-invalid',
      reverseDistance: Number.isFinite(predictedReverseDistance)
        ? predictedReverseDistance
        : null,
      reverseEndpoint: null,
      sweep: null,
    };
  }
  const reverseEndpoint = {
    x: px - (vx / speed) * predictedReverseDistance,
    z: pz - (vz / speed) * predictedReverseDistance,
  };
  const sweep = auditPq017RouteSweep(
    { x: px, z: pz },
    reverseEndpoint,
    obstacles,
    shipRadius,
    {
      requiredClearance: 0,
      escapeContexts,
      escapePropulsionNeutral: false,
    },
  );
  return {
    safe: sweep.safe,
    action: sweep.safe ? 'brake' : 'coast',
    reason: sweep.safe ? null : 'reverse-pulse-route-blocked',
    reverseDistance: predictedReverseDistance,
    reverseEndpoint,
    sweep,
  };
}

export function planPq017RouteSafeDisplacement(
  navigation,
  decision,
  obstacles = [],
  playerRadius = 0,
  {
    escapeContexts = null,
    batchProfiles = PQ017_CONTROL_BATCH_PROFILES,
  } = {},
) {
  const shipRadius = Number(playerRadius);
  const profiles = [];
  if (!Array.isArray(batchProfiles) || batchProfiles.length === 0
      || !Number.isFinite(shipRadius) || shipRadius < 0) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'public-control-displacement-input-invalid',
      profiles,
      closestConstraint: null,
    };
  }
  let closestConstraint = null;
  let invalid = false;
  for (const batchProfile of batchProfiles) {
    const prediction = predictPq017PublicControlTrajectory(
      navigation,
      decision,
      batchProfile,
    );
    if (!prediction.safe || prediction.trajectory.length < 2) {
      invalid = true;
      profiles.push({
        id: batchProfile?.id || null,
        trajectory: prediction.trajectory,
        displacement: prediction.displacement ?? null,
        ticks: prediction.ticks ?? null,
        sweep: {
          safe: false,
          reason: prediction.reason || 'public-control-trajectory-invalid',
          closestConstraint: null,
        },
      });
      continue;
    }
    let sweep = { safe: true, reason: null, closestConstraint: null };
    for (let index = 1; index < prediction.trajectory.length; index += 1) {
      const previous = prediction.trajectory[index - 1];
      const current = prediction.trajectory[index];
      const keys = current.keys || {};
      const propulsionNeutral = keys.KeyW !== true
        && keys.KeyS !== true
        && keys.KeyQ !== true
        && keys.KeyE !== true
        && keys.ShiftLeft !== true;
      const segment = auditPq017RouteSweep(
        previous.position,
        current.position,
        obstacles,
        shipRadius,
        {
          requiredClearance: 0,
          escapeContexts,
          escapePropulsionNeutral: propulsionNeutral,
        },
      );
      if (!segment.safe) {
        sweep = segment;
        const clearance = Number(segment.closestConstraint?.clearance);
        const closestClearance = Number(closestConstraint?.clearance);
        if (!closestConstraint
            || (Number.isFinite(clearance)
              && (!Number.isFinite(closestClearance) || clearance < closestClearance))) {
          closestConstraint = segment.closestConstraint;
        }
        break;
      }
    }
    profiles.push({
      id: batchProfile?.id || null,
      trajectory: prediction.trajectory,
      displacement: prediction.displacement,
      ticks: prediction.ticks,
      sweep,
    });
  }
  if (invalid) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'public-control-displacement-input-invalid',
      profiles,
      closestConstraint,
    };
  }
  const safe = profiles.every((profile) => profile.sweep.safe);
  return {
    safe,
    action: safe ? 'proceed' : 'replan',
    reason: safe ? null : 'public-control-displacement-blocked',
    profiles,
    closestConstraint,
  };
}

export function evaluatePq017ReleasedDetourBrakeDisplacement(
  startPosition,
  endPosition,
  maximumDisplacement = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
) {
  const startX = Number(startPosition?.x);
  const startZ = Number(startPosition?.z);
  const endX = Number(endPosition?.x);
  const endZ = Number(endPosition?.z);
  const limit = Number(maximumDisplacement);
  if (![startX, startZ, endX, endZ, limit].every(Number.isFinite) || limit < 0) {
    return {
      safe: false,
      replanRequired: true,
      reason: 'brake-displacement-invalid',
      displacement: null,
      maximumDisplacement: Number.isFinite(limit) ? limit : null,
    };
  }
  const displacement = Math.hypot(endX - startX, endZ - startZ);
  const replanRequired = displacement > limit;
  return {
    safe: !replanRequired,
    replanRequired,
    reason: replanRequired ? 'braking-left-route-origin' : null,
    displacement,
    maximumDisplacement: limit,
  };
}

export function planPq017AutopilotAvoidanceRecovery(navigation = {}, recovery = {}, {
  within = SITE_OPERATION_SETTLED_WITHIN,
  maxSettledSpeed = SITE_OPERATION_MAX_SETTLED_SPEED,
  expectedTargetEntityId = null,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const tick = finite(navigation.tick);
  const distance = finite(navigation.distance);
  const speed = finite(navigation.speed);
  const closingSpeed = finite(navigation.closingSpeed);
  const settledRadius = Math.max(0, finite(within) ?? SITE_OPERATION_SETTLED_WITHIN);
  const settledSpeed = Math.max(
    0,
    finite(maxSettledSpeed) ?? SITE_OPERATION_MAX_SETTLED_SPEED,
  );
  const priorStallSamples = Math.max(0, Math.trunc(Number(recovery.stallSamples) || 0));
  const priorDivergenceSamples = Math.max(
    0,
    Math.trunc(Number(recovery.divergenceSamples) || 0),
  );
  const recoveries = Math.max(0, Math.trunc(Number(recovery.recoveries) || 0));
  const priorTick = finite(recovery.lastTick);
  const priorAnchorDistance = finite(recovery.divergenceAnchorDistance);
  const priorBestDistance = finite(recovery.bestDistance);
  const priorLastDistance = finite(recovery.lastDistance);
  const result = (action, reason, {
    stallSamples = priorStallSamples,
    divergenceSamples = priorDivergenceSamples,
    lastTick = priorTick,
    divergenceAnchorDistance = priorAnchorDistance,
    bestDistance = priorBestDistance,
    lastDistance = priorLastDistance,
  } = {}) => ({
    action,
    reason,
    stallSamples,
    divergenceSamples,
    recoveries,
    lastTick,
    divergenceAnchorDistance,
    bestDistance,
    lastDistance,
  });
  if (expectedTargetEntityId != null
    && navigation.autopilot?.active === true
    && navigation.autopilot?.targetEntityId !== expectedTargetEntityId) {
    return result('manual-recovery', 'unrelated-autopilot-lease');
  }
  if (tick == null) {
    return result('manual-recovery', 'simulation-tick-missing');
  }
  if (priorTick != null && tick <= priorTick) {
    return result(
      'wait',
      tick === priorTick ? 'duplicate-simulation-tick' : 'stale-simulation-tick',
    );
  }
  const activeAvoidance = navigation.autopilot?.active === true
    && navigation.autopilot?.status === 'avoiding'
    && distance != null
    && distance > settledRadius;
  const stalled = activeAvoidance && speed != null && speed < 0.5;
  // Avoidance may briefly route away from its target. Only a sustained, materially fast retreat
  // releases the lease: otherwise the public route retains the shipped collision-aware guidance.
  const retreatSpeedFloor = Math.max(8, settledSpeed * 2);
  const diverging = activeAvoidance
    && speed != null
    && closingSpeed != null
    && speed > Math.max(16, settledSpeed * 4)
    && closingSpeed < -retreatSpeedFloor;
  const stallSamples = stalled ? priorStallSamples + 1 : 0;
  let divergenceSamples = 0;
  let divergenceAnchorDistance = null;
  let bestDistance = distance;
  if (diverging) {
    divergenceAnchorDistance = priorAnchorDistance ?? priorLastDistance ?? distance;
    bestDistance = Math.min(
      priorBestDistance ?? divergenceAnchorDistance,
      divergenceAnchorDistance,
      distance,
    );
    const measuredStepGrowth = priorLastDistance != null
      && distance > priorLastDistance + 0.01;
    const measuredTotalGrowth = distance - bestDistance >= SITE_AUTOPILOT_MIN_RETREAT_DISTANCE;
    divergenceSamples = measuredStepGrowth && measuredTotalGrowth
      ? priorDivergenceSamples + 1
      : 0;
  }
  const sampledState = {
    stallSamples,
    divergenceSamples,
    lastTick: tick,
    divergenceAnchorDistance,
    bestDistance,
    lastDistance: distance,
  };

  if (divergenceSamples >= SITE_AUTOPILOT_RECOVERY_SAMPLES) {
    return result('manual-recovery', 'sustained-moving-away-divergence', sampledState);
  }
  if (stallSamples >= SITE_AUTOPILOT_RECOVERY_SAMPLES) {
    return result(
      recoveries < 2 ? 'reverse-restage' : 'manual-recovery',
      recoveries < 2
        ? 'zero-speed-avoidance-deadlock'
        : 'avoidance-recovery-budget-exhausted',
      sampledState,
    );
  }
  return result(
    'wait',
    activeAvoidance ? 'avoidance-progress-bounded' : 'not-avoidance-divergence',
    sampledState,
  );
}

export function planPq017AutopilotEngagementReceipt(observation = {}, receipt = {}, {
  expectedTargetEntityId = null,
  expectedWorldRecordId = null,
  maxAttempts = PQ017_AUTOPILOT_ENGAGEMENT_ATTEMPT_LIMIT,
  requestExpired = false,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const tick = finite(observation.tick);
  const attempts = Math.max(0, Math.trunc(Number(receipt.attempts) || 0));
  const requestTick = finite(receipt.requestTick);
  const lastTick = finite(receipt.lastTick);
  const boundedAttempts = Math.max(1, Math.trunc(Number(maxAttempts) || 0));
  const selected = observation.selected;
  const autopilot = observation.autopilot;
  const result = (action, reason, overrides = {}) => ({
    action,
    reason,
    attempts,
    requestTick,
    lastTick,
    ...overrides,
  });

  if (tick == null || expectedTargetEntityId == null || !expectedWorldRecordId) {
    return result('blocked', 'autopilot-engagement-observation-invalid');
  }
  if (autopilot?.active === true
    && autopilot.targetEntityId !== expectedTargetEntityId) {
    return result('refuse', 'foreign-active-autopilot-lease', { lastTick: tick });
  }
  const exactReceipt = autopilot?.targetEntityId === expectedTargetEntityId
    && (autopilot.active === true || autopilot.status === 'arrived');
  if (exactReceipt) {
    return result('received', 'exact-autopilot-receipt', { lastTick: tick });
  }

  const exactSelection = selected?.entityId === expectedTargetEntityId
    && selected.worldRecordId === expectedWorldRecordId
    && selected.targetable === true
    && selected.presentationAdmitted === true;
  if (requestTick != null) {
    if (!exactSelection) {
      if (attempts >= boundedAttempts) {
        return result('blocked', 'autopilot-engagement-budget-exhausted', {
          requestTick: null,
          lastTick: tick,
        });
      }
      return result('retry', 'autopilot-selection-lost-during-request', {
        requestTick: null,
        lastTick: tick,
      });
    }
    if (!requestExpired) {
      return result('hold', 'awaiting-exact-autopilot-receipt', { lastTick: tick });
    }
    if (attempts >= boundedAttempts) {
      return result('blocked', 'autopilot-engagement-budget-exhausted', {
        requestTick: null,
        lastTick: tick,
      });
    }
    return result('retry', 'autopilot-receipt-window-expired', {
      requestTick: null,
      lastTick: tick,
    });
  }

  if (lastTick != null && tick <= lastTick) {
    return result('wait', 'awaiting-neutral-distinct-tick');
  }
  if (!exactSelection) {
    return result('reselect', 'stable-world-site-selection-required', { lastTick: tick });
  }
  if (attempts >= boundedAttempts) {
    return result('blocked', 'autopilot-engagement-budget-exhausted', { lastTick: tick });
  }
  return result('request', 'request-middle-mouse-autopilot', {
    attempts: attempts + 1,
    requestTick: tick,
    lastTick: tick,
  });
}

export function planPq017ManualThrustReceiptRecovery(navigation = {}, recovery = {}, {
  expectedTargetEntityId = null,
  settledRadius = SITE_OPERATION_SETTLED_WITHIN,
  maxReedges = 2,
  minimumNeutralSamples = 2,
  minimumStalledInputSamples = 2,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const tick = finite(navigation.tick);
  const distance = finite(navigation.distance);
  const speed = finite(navigation.speed);
  const moveZ = finite(navigation.input?.moveZ);
  const requestedTick = finite(recovery.requestedTick);
  const lastTick = finite(recovery.lastTick);
  const attempts = Math.max(0, Math.trunc(Number(recovery.attempts) || 0));
  const priorNeutralSamples = Math.max(
    0,
    Math.trunc(Number(recovery.neutralSamples) || 0),
  );
  const priorStalledInputSamples = Math.max(
    0,
    Math.trunc(Number(recovery.stalledInputSamples) || 0),
  );
  const lastDistance = finite(recovery.lastDistance);
  const lastSpeed = finite(recovery.lastSpeed);
  const attemptLimit = Math.max(0, Math.trunc(Number(maxReedges) || 0));
  const neutralSampleFloor = Math.max(1, Math.trunc(Number(minimumNeutralSamples) || 0));
  const stalledInputSampleFloor = Math.max(
    1,
    Math.trunc(Number(minimumStalledInputSamples) || 0),
  );
  const result = (action, reason, overrides = {}) => ({
    action,
    reason,
    attempts,
    neutralSamples: priorNeutralSamples,
    stalledInputSamples: priorStalledInputSamples,
    requestedTick,
    lastTick,
    lastDistance,
    lastSpeed,
    ...overrides,
  });
  if ([tick, distance, speed, moveZ].some((value) => value == null)) {
    return result('blocked', 'manual-thrust-observation-missing');
  }
  const autopilot = navigation.autopilot || null;
  const foreignActiveLease = autopilot?.active === true
    && expectedTargetEntityId != null
    && autopilot.targetEntityId !== expectedTargetEntityId;
  if (foreignActiveLease) {
    return result('refuse', 'foreign-active-autopilot-lease', {
      lastTick: tick,
      neutralSamples: 0,
    });
  }
  if (requestedTick == null) {
    return result('request', 'manual-thrust-not-yet-sampled', {
      requestedTick: tick,
      lastTick: tick,
      neutralSamples: 0,
      stalledInputSamples: 0,
      lastDistance: distance,
      lastSpeed: speed,
    });
  }
  if (lastTick != null && tick <= lastTick) {
    return result('wait', tick === lastTick
      ? 'duplicate-simulation-tick'
      : 'stale-simulation-tick');
  }
  const expectedExpiredLease = autopilot?.active === false
    && autopilot?.status === 'manual'
    && (expectedTargetEntityId == null
      || autopilot.targetEntityId === expectedTargetEntityId);
  const stalledOutside = distance > Math.max(0, Number(settledRadius) || 0)
    && speed < 0.5;
  if (moveZ > 0.08) {
    const measuredProgress = (lastSpeed != null && speed > lastSpeed + 0.1)
      || (lastDistance != null && distance < lastDistance - 0.1);
    if (!expectedExpiredLease || !stalledOutside || measuredProgress) {
      return result('received', 'manual-thrust-received', {
        lastTick: tick,
        neutralSamples: 0,
        stalledInputSamples: 0,
        lastDistance: distance,
        lastSpeed: speed,
      });
    }
    const stalledInputSamples = priorStalledInputSamples + 1;
    if (stalledInputSamples < stalledInputSampleFloor) {
      return result('wait', 'manual-thrust-input-without-progress', {
        lastTick: tick,
        neutralSamples: 0,
        stalledInputSamples,
        lastDistance: distance,
        lastSpeed: speed,
      });
    }
    if (attempts >= attemptLimit) {
      return result('blocked', 'manual-thrust-reedge-budget-exhausted', {
        lastTick: tick,
        neutralSamples: 0,
        stalledInputSamples,
        lastDistance: distance,
        lastSpeed: speed,
      });
    }
    return result('reedge', 'manual-thrust-held-state-desynchronized', {
      attempts: attempts + 1,
      requestedTick: tick,
      lastTick: tick,
      neutralSamples: 0,
      stalledInputSamples: 0,
      lastDistance: distance,
      lastSpeed: speed,
    });
  }
  if (!expectedExpiredLease || !stalledOutside) {
    return result('wait', !expectedExpiredLease
      ? 'manual-thrust-lease-not-eligible'
      : 'manual-thrust-neutral-but-moving', {
      lastTick: tick,
      neutralSamples: 0,
      stalledInputSamples: 0,
      lastDistance: distance,
      lastSpeed: speed,
    });
  }
  const neutralSamples = priorNeutralSamples + 1;
  if (neutralSamples < neutralSampleFloor) {
    return result('wait', 'manual-thrust-neutral-stall-sampling', {
      lastTick: tick,
      neutralSamples,
      stalledInputSamples: 0,
      lastDistance: distance,
      lastSpeed: speed,
    });
  }
  if (attempts >= attemptLimit) {
    return result('blocked', 'manual-thrust-reedge-budget-exhausted', {
      lastTick: tick,
      neutralSamples,
      stalledInputSamples: 0,
      lastDistance: distance,
      lastSpeed: speed,
    });
  }
  return result('reedge', 'manual-thrust-held-state-desynchronized', {
    attempts: attempts + 1,
    requestedTick: tick,
    lastTick: tick,
    neutralSamples: 0,
    stalledInputSamples: 0,
    lastDistance: distance,
    lastSpeed: speed,
  });
}

export function computePq017OutwardStagingPoint(playerPosition, targetPosition, standOff) {
  const px = Number(playerPosition?.x);
  const pz = Number(playerPosition?.z);
  const tx = Number(targetPosition?.x);
  const tz = Number(targetPosition?.z);
  const distance = Number(standOff);
  if (![px, pz, tx, tz, distance].every(Number.isFinite) || distance < 0) return null;
  const dx = px - tx;
  const dz = pz - tz;
  const length = Math.hypot(dx, dz);
  const nx = length > 1 ? dx / length : 1;
  const nz = length > 1 ? dz / length : 0;
  return { x: tx + nx * distance, z: tz + nz * distance };
}

export function choosePq017ImpactStagingReference(playerPosition, targetPosition, rootPosition) {
  const px = Number(playerPosition?.x);
  const pz = Number(playerPosition?.z);
  const tx = Number(targetPosition?.x);
  const tz = Number(targetPosition?.z);
  const rx = Number(rootPosition?.x);
  const rz = Number(rootPosition?.z);
  if (![px, pz, tx, tz].every(Number.isFinite)) return null;
  if (![rx, rz].every(Number.isFinite)) return { x: px, z: pz, source: 'player-radial' };
  const dx = tx - rx;
  const dz = tz - rz;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return { x: px, z: pz, source: 'player-radial' };
  return {
    x: tx + dx / length,
    z: tz + dz / length,
    source: 'site-outward-radial',
  };
}

export function planPq017ReceiverOutwardTarget(receiverPosition, rootPosition, lead = 80) {
  const rx = Number(receiverPosition?.x);
  const rz = Number(receiverPosition?.z);
  const sx = Number(rootPosition?.x);
  const sz = Number(rootPosition?.z);
  const distance = Number(lead);
  if (![rx, rz, sx, sz, distance].every(Number.isFinite) || distance <= 0) return null;
  const dx = rx - sx;
  const dz = rz - sz;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return null;
  return {
    x: rx + dx / length * distance,
    z: rz + dz / length * distance,
    lead: distance,
  };
}

export function planPq017ReceiverServiceTarget({
  playerPosition,
  receiverPosition,
  rootPosition,
  stageLead = 80,
  stageArrivalRadius = 6,
  tetherRestLength,
  payloadRadius,
  receiverRadius,
  playerRadius,
  obstacles = [],
  maxServiceSpeed = 6,
  brakeAccel = SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
  clearanceMargin = 1,
  overlapMargin = 0.5,
} = {}) {
  const px = Number(playerPosition?.x);
  const pz = Number(playerPosition?.z);
  const rx = Number(receiverPosition?.x);
  const rz = Number(receiverPosition?.z);
  const sx = Number(rootPosition?.x);
  const sz = Number(rootPosition?.z);
  const stagedDistance = Number(stageLead);
  const stageEnvelope = Number(stageArrivalRadius);
  const restLength = Number(tetherRestLength);
  const payloadR = Number(payloadRadius);
  const receiverR = Number(receiverRadius);
  const shipR = Number(playerRadius);
  const serviceSpeed = Number(maxServiceSpeed);
  const deceleration = Number(brakeAccel);
  const clearance = Number(clearanceMargin);
  const overlapInset = Number(overlapMargin);
  if (![px, pz, rx, rz, sx, sz, stagedDistance, stageEnvelope,
    restLength, payloadR, receiverR, shipR,
    serviceSpeed, deceleration, clearance, overlapInset].every(Number.isFinite)
      || stagedDistance <= 0 || stageEnvelope < 0
      || restLength <= 0 || payloadR < 0 || receiverR < 0
      || shipR < 0 || serviceSpeed <= 0 || deceleration <= 0
      || clearance < 0 || overlapInset < 0) return null;
  const radialX = rx - sx;
  const radialZ = rz - sz;
  const radialLength = Math.hypot(radialX, radialZ);
  if (radialLength <= 0.001) return null;
  const outwardX = radialX / radialLength;
  const outwardZ = radialZ / radialLength;
  const playerRelativeX = px - rx;
  const playerRelativeZ = pz - rz;
  const liveStageLead = playerRelativeX * outwardX + playerRelativeZ * outwardZ;
  const liveStageLateralOffset = Math.abs(
    playerRelativeX * outwardZ - playerRelativeZ * outwardX
  );
  const nominalStageX = rx + outwardX * stagedDistance;
  const nominalStageZ = rz + outwardZ * stagedDistance;
  const liveStageError = Math.hypot(px - nominalStageX, pz - nominalStageZ);
  const stageEpsilon = 0.001;
  const liveStageEnvelopeValid = liveStageLead > 0
    && liveStageLead >= stagedDistance - stageEnvelope - stageEpsilon
    && liveStageLead <= stagedDistance + stageEnvelope + stageEpsilon
    && liveStageLateralOffset <= stageEnvelope + stageEpsilon
    && liveStageError <= stageEnvelope + stageEpsilon;
  if (!liveStageEnvelopeValid) {
    return {
      safe: false,
      reason: 'live-stage-envelope-invalid',
      target: null,
      arrivalRadius: 0,
      nominalStageLead: stagedDistance,
      liveStageLead,
      liveStageLateralOffset,
      liveStageError,
      stageArrivalRadius: stageEnvelope,
      liveStageEnvelopeValid,
    };
  }
  const deliveryRadius = payloadR + receiverR - overlapInset;
  if (deliveryRadius <= 0) return {
    safe: false,
    reason: 'delivery-overlap-empty',
    target: null,
    arrivalRadius: 0,
  };

  const stoppingDistance = serviceSpeed * serviceSpeed / (2 * deceleration);
  const deliveryLeadMin = Math.max(0, restLength - deliveryRadius);
  // The exact target remains the nominal stageLead. Settlement legitimately ends anywhere inside
  // its six-unit envelope, though, and a forgiving Massline may pay out while braking. Bound the
  // physical-delivery interval by the proven live outward projection so a small outward settlement
  // is usable without inventing distance from the nominal target or accepting an off-ray ship.
  const deliveryLeadMax = Math.min(liveStageLead, restLength + deliveryRadius);
  let collisionExitLead = shipR + receiverR + clearance;
  let closestConstraint = {
    entityId: null,
    worldRecordId: `${PQ017_SITE_ID}/component/receiver_collar`,
    type: 'receiver',
    exitLead: collisionExitLead,
  };
  for (const obstacle of Array.isArray(obstacles) ? obstacles : []) {
    const ox = Number(obstacle?.x);
    const oz = Number(obstacle?.z);
    const obstacleRadius = Number(obstacle?.radius);
    if (![ox, oz, obstacleRadius].every(Number.isFinite) || obstacleRadius < 0) continue;
    const relativeX = ox - rx;
    const relativeZ = oz - rz;
    const along = relativeX * outwardX + relativeZ * outwardZ;
    const perpendicularSquared = Math.max(
      0,
      relativeX * relativeX + relativeZ * relativeZ - along * along,
    );
    const exclusionRadius = shipR + obstacleRadius + clearance;
    if (perpendicularSquared >= exclusionRadius * exclusionRadius) continue;
    const halfChord = Math.sqrt(exclusionRadius * exclusionRadius - perpendicularSquared);
    const entryLead = along - halfChord;
    const exitLead = along + halfChord;
    // Only collision intervals that touch the actual inward traversal from the bounded live staging
    // point can constrain service. A distant body wholly beyond that start is unrelated geometry.
    if (exitLead < 0 || entryLead > liveStageLead) continue;
    if (exitLead <= collisionExitLead) continue;
    collisionExitLead = exitLead;
    closestConstraint = {
      entityId: obstacle.entityId ?? null,
      worldRecordId: obstacle.worldRecordId || null,
      type: obstacle.type || null,
      exitLead,
    };
  }

  const collisionSafeLeadMin = Math.max(0, collisionExitLead + stoppingDistance);
  const feasibleLeadMin = Math.max(deliveryLeadMin, collisionSafeLeadMin);
  const feasibleLeadMax = deliveryLeadMax;
  const feasibleWidth = feasibleLeadMax - feasibleLeadMin;
  // Stay strictly inside both proofs rather than accepting a floating-point tangent. The midpoint
  // then maximizes the shared collision/overlap margin on this live radial.
  const edgeInset = feasibleWidth > 0 ? Math.min(0.25, feasibleWidth * 0.25) : 0;
  const corridorLeadMin = feasibleLeadMin + edgeInset;
  const corridorLeadMax = feasibleLeadMax - edgeInset;
  const safe = corridorLeadMax > corridorLeadMin;
  if (!safe) {
    return {
      safe: false,
      reason: 'collision-delivery-interval-empty',
      target: null,
      arrivalRadius: 0,
      maxServiceSpeed: serviceSpeed,
      stoppingDistance,
      deliveryLeadMin,
      deliveryLeadMax,
      collisionSafeLeadMin,
      closestConstraint,
      nominalStageLead: stagedDistance,
      liveStageLead,
      liveStageLateralOffset,
      liveStageError,
      stageArrivalRadius: stageEnvelope,
      liveStageEnvelopeValid,
    };
  }
  const serviceLead = (corridorLeadMin + corridorLeadMax) * 0.5;
  const target = {
    x: rx + outwardX * serviceLead,
    z: rz + outwardZ * serviceLead,
    lead: serviceLead,
  };
  const takeUpArrivalRadius = edgeInset * 0.25;
  const takeUpLead = corridorLeadMax - takeUpArrivalRadius * 2;
  const takeUpTarget = {
    x: rx + outwardX * takeUpLead,
    z: rz + outwardZ * takeUpLead,
    lead: takeUpLead,
  };
  const serviceBodies = [{
    entityId: null,
    worldRecordId: `${PQ017_SITE_ID}/component/receiver_collar`,
    type: 'receiver',
    x: rx,
    z: rz,
    radius: receiverR,
  }, ...(Array.isArray(obstacles) ? obstacles : [])];
  const auditServiceChord = (candidate) => {
    const segmentX = candidate.x - px;
    const segmentZ = candidate.z - pz;
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    let blockingConstraint = null;
    for (const body of serviceBodies) {
      const bx = Number(body?.x);
      const bz = Number(body?.z);
      const bodyRadius = Number(body?.radius);
      if (![bx, bz, bodyRadius].every(Number.isFinite) || bodyRadius < 0) continue;
      const t = segmentLengthSquared > 0
        ? Math.max(0, Math.min(1,
          ((bx - px) * segmentX + (bz - pz) * segmentZ) / segmentLengthSquared))
        : 0;
      const closestX = px + segmentX * t;
      const closestZ = pz + segmentZ * t;
      const centerDistance = Math.hypot(bx - closestX, bz - closestZ);
      const exclusionRadius = shipR + bodyRadius + clearance;
      if (centerDistance > exclusionRadius) continue;
      blockingConstraint = {
        entityId: body.entityId ?? null,
        worldRecordId: body.worldRecordId || null,
        type: body.type || null,
        centerDistance,
        exclusionRadius,
        segmentT: t,
      };
      break;
    }
    return {
      safe: blockingConstraint == null,
      targetLead: candidate.lead,
      blockingConstraint,
    };
  };
  const serviceChord = auditServiceChord(target);
  const takeUpChord = auditServiceChord(takeUpTarget);
  if (!serviceChord.safe || !takeUpChord.safe) {
    const blockedChord = !serviceChord.safe ? serviceChord : takeUpChord;
    return {
      safe: false,
      reason: !serviceChord.safe
        ? 'actual-service-segment-blocked'
        : 'actual-take-up-segment-blocked',
      target,
      takeUpTarget,
      arrivalRadius: 0,
      takeUpArrivalRadius: 0,
      maxServiceSpeed: serviceSpeed,
      stoppingDistance,
      deliveryLeadMin,
      deliveryLeadMax,
      collisionSafeLeadMin,
      closestConstraint,
      serviceChord,
      takeUpChord,
      blockingConstraint: blockedChord.blockingConstraint,
      nominalStageLead: stagedDistance,
      liveStageLead,
      liveStageLateralOffset,
      liveStageError,
      stageArrivalRadius: stageEnvelope,
      liveStageEnvelopeValid,
    };
  }
  return {
    safe: true,
    reason: null,
    target,
    takeUpTarget,
    arrivalRadius: (corridorLeadMax - corridorLeadMin) * 0.5,
    takeUpArrivalRadius,
    maxServiceSpeed: serviceSpeed,
    stoppingDistance,
    deliveryRadius,
    deliveryLeadMin,
    deliveryLeadMax,
    collisionSafeLeadMin,
    corridorLeadMin,
    corridorLeadMax,
    closestConstraint,
    serviceChord,
    takeUpChord,
    nominalStageLead: stagedDistance,
    liveStageLead,
    liveStageLateralOffset,
    liveStageError,
    stageArrivalRadius: stageEnvelope,
    liveStageEnvelopeValid,
  };
}

export function derivePq017TowTimeoutContract({
  idealTravelSeconds,
  wallMsPerSimSecond = 2_000,
  fixedOverheadMs = 30_000,
  minimumTimeoutMs = 60_000,
  progressExtensionQuantumMs = 15_000,
  maximumTimeoutMs = 210_000,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const idealSeconds = finite(idealTravelSeconds);
  const wallScale = finite(wallMsPerSimSecond);
  const overhead = finite(fixedOverheadMs);
  const timeoutFloor = finite(minimumTimeoutMs);
  const extensionQuantum = finite(progressExtensionQuantumMs);
  const timeoutMaximum = finite(maximumTimeoutMs);
  if ([idealSeconds, wallScale, overhead, timeoutFloor, extensionQuantum, timeoutMaximum]
    .some((value) => value == null)
      || idealSeconds < 0 || wallScale <= 0 || overhead < 0 || timeoutFloor <= 0
      || extensionQuantum <= 0 || timeoutMaximum < timeoutFloor) {
    return { pass: false, reason: 'far-side-timeout-contract-invalid' };
  }
  const minimumTowTimeoutMs = Math.max(
    timeoutFloor,
    Math.ceil(idealSeconds * wallScale + overhead),
  );
  const executionTowTimeoutMs = Math.ceil(
    minimumTowTimeoutMs / extensionQuantum,
  ) * extensionQuantum;
  const pass = minimumTowTimeoutMs <= timeoutMaximum
    && executionTowTimeoutMs <= timeoutMaximum;
  return {
    pass,
    reason: pass ? null : 'far-side-route-time-budget-exceeded',
    idealTravelSeconds: idealSeconds,
    wallMsPerSimSecond: wallScale,
    fixedOverheadMs: overhead,
    progressExtensionQuantumMs: extensionQuantum,
    minimumTowTimeoutMs,
    executionTowTimeoutMs,
    maximumTowTimeoutMs: timeoutMaximum,
  };
}

export function planPq017ReceiverCrossingPull({
  playerPosition,
  payloadPosition,
  payloadCollides = true,
  receiverPosition,
  rootPosition,
  rootCollides = true,
  tetherRestLength,
  maxTetherLength = SITE_TETHER_MAX_LENGTH,
  payloadRadius,
  receiverRadius,
  playerRadius,
  obstacles = [],
  shipObstacles = [],
  maxServiceSpeed = 6,
  brakeAccel = SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
  clearanceMargin = 1,
  overlapMargin = 0.5,
  maximumRouteLength = null,
  releasedDetour = false,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const px = finite(playerPosition?.x);
  const pz = finite(playerPosition?.z);
  const payloadX = finite(payloadPosition?.x);
  const payloadZ = finite(payloadPosition?.z);
  const receiverX = finite(receiverPosition?.x);
  const receiverZ = finite(receiverPosition?.z);
  const rootX = finite(rootPosition?.x);
  const rootZ = finite(rootPosition?.z);
  const restLength = finite(tetherRestLength);
  const tetherLimit = finite(maxTetherLength);
  const payloadR = finite(payloadRadius);
  const receiverR = finite(receiverRadius);
  const shipR = finite(playerRadius);
  const serviceSpeed = finite(maxServiceSpeed);
  const deceleration = finite(brakeAccel);
  const clearance = finite(clearanceMargin);
  const overlapInset = finite(overlapMargin);
  const routeLengthLimit = maximumRouteLength == null ? null : finite(maximumRouteLength);
  const invalid = [
    px, pz, payloadX, payloadZ, receiverX, receiverZ, rootX, rootZ,
    restLength, tetherLimit, payloadR, receiverR, shipR, serviceSpeed,
    deceleration, clearance, overlapInset,
  ].some((value) => value == null)
    || restLength <= 0 || tetherLimit <= 0
    || payloadR < 0 || receiverR < 0 || shipR < 0
    || serviceSpeed <= 0 || deceleration <= 0
    || clearance < 0 || overlapInset < 0
    || (maximumRouteLength != null && (!(routeLengthLimit > 0)));
  if (invalid) return null;

  const payloadDx = receiverX - payloadX;
  const payloadDz = receiverZ - payloadZ;
  const payloadDistance = Math.hypot(payloadDx, payloadDz);
  if (payloadDistance <= 0.001) {
    return { safe: false, reason: 'payload-receiver-vector-invalid', target: null };
  }
  const deliveryRadius = payloadR + receiverR - overlapInset;
  if (deliveryRadius <= 0) {
    return { safe: false, reason: 'delivery-overlap-empty', target: null };
  }
  if (payloadDistance <= deliveryRadius) {
    return {
      safe: false,
      reason: 'payload-already-within-delivery',
      target: null,
      payloadDistance,
      deliveryRadius,
    };
  }

  const directionX = payloadDx / payloadDistance;
  const directionZ = payloadDz / payloadDistance;
  const rootRelativeX = rootX - payloadX;
  const rootRelativeZ = rootZ - payloadZ;
  const rootAlongPull = rootRelativeX * directionX + rootRelativeZ * directionZ;
  const rootLateralToPull = Math.abs(
    rootRelativeX * directionZ - rootRelativeZ * directionX
  );
  if (payloadCollides === true && rootCollides === true
      && rootAlongPull > 0 && rootAlongPull < payloadDistance
      && rootLateralToPull <= payloadR + clearance) {
    return {
      safe: false,
      reason: 'payload-receiver-order-blocked',
      target: null,
      payloadDistance,
      rootAlongPull,
      rootLateralToPull,
    };
  }
  const stoppingDistance = serviceSpeed * serviceSpeed / (2 * deceleration);
  const collisionBodies = (Array.isArray(obstacles) ? obstacles : [])
    .map((obstacle) => ({
      ...obstacle,
      x: finite(obstacle?.x),
      z: finite(obstacle?.z),
      radius: finite(obstacle?.radius),
    }))
    .filter((obstacle) => obstacle.x != null && obstacle.z != null
      && obstacle.radius != null && obstacle.radius >= 0);

  // Prove the payload can reach a point strictly inside receiver acceptance before authorizing a
  // ship route. A chord obstacle has contact authority only when both the payload and obstacle
  // collide; shipped Site payloads are no-contact Massline sensors because they spawn inside the
  // assembly. The receiver remains a sensor and is absent from this physical chord audit.
  const strictDeliveryRadius = Math.max(0, deliveryRadius - 0.25);
  const acceptanceTravel = payloadDistance - strictDeliveryRadius;
  const acceptancePoint = {
    x: payloadX + directionX * acceptanceTravel,
    z: payloadZ + directionZ * acceptanceTravel,
  };
  const payloadBodies = payloadCollides === true
    ? collisionBodies.filter((obstacle) => obstacle.collides === true)
    : [];
  const payloadSweep = auditPq017RouteSweep(
    { x: payloadX, z: payloadZ },
    acceptancePoint,
    payloadBodies,
    payloadR,
    { requiredClearance: clearance },
  );
  if (!payloadSweep.safe) {
    return {
      safe: false,
      reason: 'payload-acceptance-chord-blocked',
      target: null,
      payloadDistance,
      deliveryRadius,
      acceptancePoint,
      payloadChord: {
        safe: false,
        receiverMissDistance: strictDeliveryRadius,
        sweep: payloadSweep,
      },
    };
  }

  // Continue the live payload->receiver ray until the ship clears every inflated Site body. The
  // planner margin protects the authored route; the stopping distance protects the final approach.
  const receiverClearLead = shipR + receiverR
    + PQ017_ROUTE_PLANNER_MARGIN + stoppingDistance;
  // At a freshly latched far-side hold the rest length already spans payload→receiver→ship.
  // Stretching that line by only one unit leaves the payload at its old distance. Instead choose a
  // lead whose taut equilibrium puts the payload strictly inside receiver acceptance.
  let pullLead = Math.max(receiverClearLead, restLength - strictDeliveryRadius + 1);
  const solidCollisionBodies = collisionBodies.filter((obstacle) => obstacle.collides !== false);
  const rayIntervals = [];
  for (const obstacle of solidCollisionBodies) {
    const relativeX = obstacle.x - receiverX;
    const relativeZ = obstacle.z - receiverZ;
    const along = relativeX * directionX + relativeZ * directionZ;
    const perpendicularSquared = Math.max(
      0,
      relativeX * relativeX + relativeZ * relativeZ - along * along,
    );
    const exclusion = shipR + obstacle.radius
      + PQ017_ROUTE_PLANNER_MARGIN + stoppingDistance;
    if (perpendicularSquared >= exclusion * exclusion) continue;
    const halfChord = Math.sqrt(exclusion * exclusion - perpendicularSquared);
    const entryLead = along - halfChord;
    const exitLead = along + halfChord;
    if (exitLead < 0) continue;
    rayIntervals.push({ entryLead, exitLead, obstacle });
  }
  rayIntervals.sort((a, b) => a.entryLead - b.entryLead || a.exitLead - b.exitLead);
  // Leave the first safe gap after the receiver/Site cluster. A distant asteroid on the infinite
  // ray must not force the ship to tow hundreds of extra units through otherwise empty space.
  for (const interval of rayIntervals) {
    if (interval.exitLead < pullLead) continue;
    if (interval.entryLead > pullLead + 0.001) break;
    pullLead = Math.max(pullLead, interval.exitLead + 0.25);
  }
  const target = {
    x: receiverX + directionX * pullLead,
    z: receiverZ + directionZ * pullLead,
  };
  const targetLineLength = payloadDistance + pullLead;
  const predictedReceiverMissAtRest = restLength - pullLead;
  if (!releasedDetour
      && !(Math.abs(predictedReceiverMissAtRest) < strictDeliveryRadius)) {
    return {
      safe: false,
      reason: 'far-side-equilibrium-misses-receiver',
      target: null,
      pullLead,
      predictedReceiverMissAtRest,
      strictDeliveryRadius,
      tetherRestLength: restLength,
    };
  }
  if (!(targetLineLength > restLength) || targetLineLength > tetherLimit) {
    return {
      safe: false,
      reason: 'far-side-target-exceeds-tether',
      target: null,
      pullLead,
      targetLineLength,
      tetherRestLength: restLength,
      maxTetherLength: tetherLimit,
    };
  }

  const additionalShipBodies = (Array.isArray(shipObstacles) ? shipObstacles : [])
    .map((obstacle) => ({
      ...obstacle,
      x: finite(obstacle?.x),
      z: finite(obstacle?.z),
      radius: finite(obstacle?.radius),
    }))
    .filter((obstacle) => obstacle.x != null && obstacle.z != null
      && obstacle.radius != null && obstacle.radius >= 0);
  const shipCollisionBodies = [...solidCollisionBodies, ...additionalShipBodies]
    .filter((obstacle) => (
      obstacle.collides !== false || obstacle.allowEscapeFromOverlap === true
    ));
  const playerReceiverX = px - receiverX;
  const playerReceiverZ = pz - receiverZ;
  const playerFarSideLead = playerReceiverX * directionX + playerReceiverZ * directionZ;
  const playerCrossTrack = Math.abs(
    playerReceiverX * directionZ - playerReceiverZ * directionX,
  );
  const directSweep = auditPq017RouteSweep(
    { x: px, z: pz },
    target,
    shipCollisionBodies,
    shipR,
    { requiredClearance: 0 },
  );
  const directShortPull = playerFarSideLead > 0
    && playerCrossTrack <= 1
    && directSweep.safe;
  if (!releasedDetour && !directShortPull) {
    return {
      safe: false,
      reason: 'far-side-direct-pull-unavailable',
      target,
      pullLead,
      playerFarSideLead,
      playerCrossTrack,
      directSweep,
      predictedReceiverMissAtRest,
      strictDeliveryRadius,
    };
  }
  const shipRoute = directShortPull
    ? {
      reference: { x: payloadX, z: payloadZ },
      target,
      waypoints: [{ ...target, phase: 'launch' }],
      blockedSegments: 0,
      direct: true,
      directSweep,
    }
    : planPq017ImpactStaging(
      { x: px, z: pz },
      { x: receiverX, z: receiverZ },
      { x: payloadX, z: payloadZ },
      pullLead,
      shipCollisionBodies,
      shipR,
    );
  const routeTarget = shipRoute?.waypoints?.at(-1);
  const exactTarget = routeTarget
    && Math.hypot(routeTarget.x - target.x, routeTarget.z - target.z) <= 0.001;
  if (!shipRoute?.waypoints?.length || shipRoute.blockedSegments > 0 || !exactTarget) {
    return {
      safe: false,
      reason: 'far-side-ship-route-blocked',
      target,
      pullLead,
      shipRoute,
    };
  }
  // While B is held the Massline remains attached for the whole maneuver, not only at the final
  // pull point. Distance to the fixed payload is a convex function along each straight segment, so
  // checking the start and every waypoint proves the entire polyline stays inside the line limit.
  const routeTetherDistances = [
    {
      phase: 'start',
      distance: Math.hypot(px - payloadX, pz - payloadZ),
    },
    ...shipRoute.waypoints.map((waypoint) => ({
      phase: waypoint.phase || null,
      distance: Math.hypot(waypoint.x - payloadX, waypoint.z - payloadZ),
    })),
  ];
  const maxRouteTetherDistance = Math.max(
    ...routeTetherDistances.map(({ distance }) => distance),
  );
  if (maxRouteTetherDistance > tetherLimit + 0.001) {
    return {
      safe: false,
      reason: 'far-side-route-exceeds-tether',
      target,
      pullLead,
      targetLineLength,
      shipRoute,
      routeTetherDistances,
      maxRouteTetherDistance,
      maxTetherLength: tetherLimit,
    };
  }
  const routeSegments = [];
  let routeLength = 0;
  let idealTravelSeconds = 0;
  let segmentStart = { x: px, z: pz };
  for (const waypoint of shipRoute.waypoints) {
    const length = Math.hypot(waypoint.x - segmentStart.x, waypoint.z - segmentStart.z);
    const speedCap = waypoint.phase === 'launch'
      ? serviceSpeed
      : PQ017_TOW_PASS_THROUGH_SPEED_CAP;
    routeSegments.push({ phase: waypoint.phase, length, speedCap });
    routeLength += length;
    idealTravelSeconds += length / speedCap;
    segmentStart = waypoint;
  }
  if (routeLengthLimit != null && routeLength > routeLengthLimit + 0.001) {
    return {
      safe: false,
      reason: 'far-side-route-not-short',
      target,
      pullLead,
      shipRoute,
      routeTetherDistances,
      maxRouteTetherDistance,
      routeSegments,
      routeLength,
      maximumRouteLength: routeLengthLimit,
    };
  }
  // Loaded headed runs have repeatedly delivered about two wall seconds per simulation second.
  // Round the measured minimum to the same 15-second progress-extension quantum used in flight,
  // while retaining one explicit finite ceiling for the complete authored crossing.
  const timeoutContract = derivePq017TowTimeoutContract({
    idealTravelSeconds,
  });
  if (!timeoutContract.pass) {
    return {
      safe: false,
      reason: timeoutContract.reason,
      target,
      pullLead,
      shipRoute,
      routeLength,
      idealTravelSeconds,
      minimumTowTimeoutMs: timeoutContract.minimumTowTimeoutMs,
      executionTowTimeoutMs: timeoutContract.executionTowTimeoutMs,
      maximumTowTimeoutMs: timeoutContract.maximumTowTimeoutMs,
      maximumRouteLength: routeLengthLimit,
    };
  }
  const {
    minimumTowTimeoutMs,
    executionTowTimeoutMs,
    maximumTowTimeoutMs,
  } = timeoutContract;

  return {
    safe: true,
    reason: null,
    target,
    pullLead,
    rayIntervals: rayIntervals.map(({ entryLead, exitLead, obstacle }) => ({
      entryLead,
      exitLead,
      entityId: obstacle.entityId ?? null,
      worldRecordId: obstacle.worldRecordId || null,
      type: obstacle.type || null,
    })),
    direction: { x: directionX, z: directionZ },
    arrivalRadius: 6,
    maxServiceSpeed: serviceSpeed,
    stoppingDistance,
    launchGate: {
      center: { ...target },
      direction: { x: directionX, z: directionZ },
      farSideOrigin: { x: receiverX, z: receiverZ },
      arrivalRadius: 6,
      maxServiceSpeed: serviceSpeed,
      maxPlayerCrossTrack: 1,
    },
    payloadDistance,
    payloadStart: { x: payloadX, z: payloadZ },
    payloadCollides: payloadCollides === true,
    rootCollides: rootCollides === true,
    maxPayloadCrossTrack: 1,
    rootAlongPull,
    rootLateralToPull,
    playerFarSideLead,
    playerCrossTrack,
    deliveryRadius,
    strictDeliveryRadius,
    acceptancePoint,
    payloadChord: {
      safe: true,
      receiverMissDistance: Math.hypot(
        acceptancePoint.x - receiverX,
        acceptancePoint.z - receiverZ,
      ),
      sweep: payloadSweep,
    },
    shipRoute,
    routeTetherDistances,
    maxRouteTetherDistance,
    routeSegments,
    routeLength,
    idealTravelSeconds,
    minimumTowTimeoutMs,
    executionTowTimeoutMs,
    maximumTowTimeoutMs,
    ringApproachSpeed: PQ017_TOW_PASS_THROUGH_SPEED_CAP,
    startPosition: { x: px, z: pz },
    routeSafety: {
      obstacles: shipCollisionBodies,
      playerRadius: shipR,
    },
    targetLineLength,
    predictedReceiverMissAtRest,
    tetherRestLength: restLength,
    maxTetherLength: tetherLimit,
    maximumRouteLength: routeLengthLimit,
    releasedDetour,
    requireNonBreakingMassline: true,
  };
}

function pq017FinitePrimitive(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizePq017LaunchGate(launchGate) {
  const centerX = pq017FinitePrimitive(launchGate?.center?.x);
  const centerZ = pq017FinitePrimitive(launchGate?.center?.z);
  const directionX = pq017FinitePrimitive(launchGate?.direction?.x);
  const directionZ = pq017FinitePrimitive(launchGate?.direction?.z);
  const originX = pq017FinitePrimitive(launchGate?.farSideOrigin?.x);
  const originZ = pq017FinitePrimitive(launchGate?.farSideOrigin?.z);
  const arrivalRadius = pq017FinitePrimitive(launchGate?.arrivalRadius);
  const maxServiceSpeed = pq017FinitePrimitive(launchGate?.maxServiceSpeed);
  const maxPlayerCrossTrack = pq017FinitePrimitive(launchGate?.maxPlayerCrossTrack);
  const directionLength = Math.hypot(directionX ?? 0, directionZ ?? 0);
  if ([centerX, centerZ, directionX, directionZ, originX, originZ,
    arrivalRadius, maxServiceSpeed, maxPlayerCrossTrack].some((value) => value == null)
      || !(directionLength > 0)
      || !(arrivalRadius > 0)
      || !(maxServiceSpeed > 0)
      || !(maxPlayerCrossTrack > 0)
      || maxPlayerCrossTrack > arrivalRadius) {
    return null;
  }
  return {
    center: { x: centerX, z: centerZ },
    direction: {
      x: directionX / directionLength,
      z: directionZ / directionLength,
    },
    farSideOrigin: { x: originX, z: originZ },
    arrivalRadius,
    maxServiceSpeed,
    maxPlayerCrossTrack,
  };
}

function pq017LaunchGateFrame(position, launchGate) {
  const gate = normalizePq017LaunchGate(launchGate);
  const x = pq017FinitePrimitive(position?.x);
  const z = pq017FinitePrimitive(position?.z);
  if (!gate || x == null || z == null) return null;
  const dx = x - gate.center.x;
  const dz = z - gate.center.z;
  return {
    gate,
    along: dx * gate.direction.x + dz * gate.direction.z,
    cross: dx * gate.direction.z - dz * gate.direction.x,
  };
}

function pq017AtOrBelowBoundary(value, limit) {
  const numericSlack = Number.EPSILON * Math.max(1, Math.abs(limit)) * 32;
  return value <= limit + numericSlack;
}

export function evaluatePq017LaunchGate(observation = {}, launchGate = null) {
  const position = observation?.position || observation;
  const frame = pq017LaunchGateFrame(position, launchGate);
  const explicitSpeedSupplied = observation?.speed != null;
  const explicitSpeed = explicitSpeedSupplied
    ? pq017FinitePrimitive(observation.speed)
    : null;
  const velocitySupplied = observation?.velocity != null;
  const vx = velocitySupplied
    ? pq017FinitePrimitive(observation.velocity?.x)
    : null;
  const vz = velocitySupplied
    ? pq017FinitePrimitive(observation.velocity?.z)
    : null;
  const velocitySpeed = vx != null && vz != null ? Math.hypot(vx, vz) : null;
  const speedDisagrees = explicitSpeed != null && velocitySpeed != null
    && !pq017AtOrBelowBoundary(
      Math.abs(explicitSpeed - velocitySpeed),
      Number.EPSILON * Math.max(1, explicitSpeed, velocitySpeed) * 32,
    );
  const speed = velocitySupplied ? velocitySpeed : explicitSpeed;
  const invalidFailures = [];
  if (!frame
      || (explicitSpeedSupplied && explicitSpeed == null)
      || (velocitySupplied && (vx == null || vz == null))
      || speed == null
      || speed < 0) {
    invalidFailures.push('observation-invalid');
  }
  if (speedDisagrees) invalidFailures.push('speed-velocity-disagreement');
  if (invalidFailures.length > 0) {
    return {
      safe: false,
      accepted: false,
      reason: 'launch-gate-observation-invalid',
      failures: invalidFailures,
      distance: null,
      crossTrack: null,
      speed,
      farSideLead: null,
    };
  }
  const distance = Math.hypot(frame.along, frame.cross);
  const crossTrack = Math.abs(frame.cross);
  const farSideLead = (
    (position.x - frame.gate.farSideOrigin.x) * frame.gate.direction.x
    + (position.z - frame.gate.farSideOrigin.z) * frame.gate.direction.z
  );
  const failures = [];
  if (!pq017AtOrBelowBoundary(distance, frame.gate.arrivalRadius)) {
    failures.push('canonical-target-distance');
  }
  if (!pq017AtOrBelowBoundary(crossTrack, frame.gate.maxPlayerCrossTrack)) {
    failures.push('player-cross-track');
  }
  if (!pq017AtOrBelowBoundary(speed, frame.gate.maxServiceSpeed)) {
    failures.push('service-speed');
  }
  return {
    safe: failures.length === 0,
    accepted: failures.length === 0,
    reason: failures.length === 0 ? null : 'launch-gate-not-accepted',
    failures,
    distance,
    crossTrack,
    speed,
    farSideLead,
  };
}

export function projectPq017LaunchGateAim(position, launchGate = null) {
  const frame = pq017LaunchGateFrame(position, launchGate);
  if (!frame) {
    return {
      safe: false,
      reason: 'launch-gate-projection-invalid',
      waypoint: null,
    };
  }
  const {
    gate,
  } = frame;
  let along = frame.along;
  let cross = frame.cross;
  const distance = Math.hypot(along, cross);
  if (distance > gate.arrivalRadius) {
    const scale = gate.arrivalRadius / distance;
    const radialAlong = along * scale;
    const radialCross = cross * scale;
    if (Math.abs(radialCross) <= gate.maxPlayerCrossTrack) {
      along = radialAlong;
      cross = radialCross;
    } else {
      cross = Math.sign(cross || 1) * gate.maxPlayerCrossTrack;
      const alongLimit = Math.sqrt(Math.max(
        0,
        gate.arrivalRadius * gate.arrivalRadius - cross * cross,
      ));
      along = Math.max(-alongLimit, Math.min(alongLimit, along));
    }
  } else {
    cross = Math.max(
      -gate.maxPlayerCrossTrack,
      Math.min(gate.maxPlayerCrossTrack, cross),
    );
  }
  const waypoint = {
    x: gate.center.x + gate.direction.x * along + gate.direction.z * cross,
    z: gate.center.z + gate.direction.z * along - gate.direction.x * cross,
    phase: 'local-launch-gate',
    arrivalRadius: gate.maxPlayerCrossTrack,
    maxApproachSpeed: gate.maxServiceSpeed,
    maxSettledSpeed: PQ017_RELEASED_LAUNCH_READY_SPEED,
  };
  const farSideLead = (
    (waypoint.x - gate.farSideOrigin.x) * gate.direction.x
    + (waypoint.z - gate.farSideOrigin.z) * gate.direction.z
  );
  if (!(farSideLead > 0)) {
    return {
      safe: false,
      reason: 'launch-gate-projection-not-far-side',
      waypoint: null,
      farSideLead,
    };
  }
  return {
    safe: true,
    reason: null,
    waypoint,
    farSideLead,
    distance: Math.hypot(waypoint.x - gate.center.x, waypoint.z - gate.center.z),
    crossTrack: Math.abs(cross),
  };
}

function navigationToPq017Point(navigation, point) {
  const position = navigation?.position;
  const velocity = navigation?.velocity;
  const rotation = pq017FinitePrimitive(navigation?.rotation);
  const x = pq017FinitePrimitive(position?.x);
  const z = pq017FinitePrimitive(position?.z);
  const vx = pq017FinitePrimitive(velocity?.x);
  const vz = pq017FinitePrimitive(velocity?.z);
  const pointX = pq017FinitePrimitive(point?.x);
  const pointZ = pq017FinitePrimitive(point?.z);
  if ([x, z, vx, vz, rotation, pointX, pointZ].some((value) => value == null)) {
    return null;
  }
  const dx = pointX - x;
  const dz = pointZ - z;
  const distance = Math.hypot(dx, dz);
  const speed = Math.hypot(vx, vz);
  const wrap = (value) => {
    let result = value;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result < -Math.PI) result += Math.PI * 2;
    return result;
  };
  return {
    ...navigation,
    position: { x, z },
    velocity: { x: vx, z: vz },
    rotation,
    distance,
    speed,
    closingSpeed: distance > 0.0001 ? (vx * dx + vz * dz) / distance : 0,
    headingError: wrap(Math.atan2(dz, dx) - rotation),
    velocityHeadingError: speed > 0.001
      ? wrap(Math.atan2(vz, vx) - rotation)
      : 0,
  };
}

function pq017ReleasedLocalYawControl(navigation, targetAngle, reasonPrefix) {
  const rotation = pq017FinitePrimitive(navigation?.rotation);
  const angularVelocity = pq017FinitePrimitive(navigation?.angularVelocity);
  if (rotation == null || angularVelocity == null || !Number.isFinite(targetAngle)) {
    return { safe: false, action: 'replan', reason: 'local-launch-yaw-invalid' };
  }
  let error = targetAngle - rotation;
  while (error > Math.PI) error -= Math.PI * 2;
  while (error < -Math.PI) error += Math.PI * 2;
  const movingToward = Math.sign(error) !== 0
    && Math.sign(angularVelocity) === Math.sign(error);
  const stoppingAngle = (angularVelocity * angularVelocity)
    / (2 * PQ017_RELEASED_LOCAL_YAW_BRAKE)
    + Math.abs(angularVelocity) * PQ017_RELEASED_LOCAL_FIXED_DT * 4;
  const shouldDamp = Math.abs(angularVelocity) > PQ017_RELEASED_LOCAL_YAW_RATE_DEADBAND
    && (Math.abs(error) <= PQ017_RELEASED_LOCAL_YAW_DEADBAND
      || (movingToward
        && Math.abs(error) <= stoppingAngle + PQ017_RELEASED_LOCAL_YAW_DEADBAND));
  if (shouldDamp) {
    return {
      safe: true,
      action: 'coast',
      reason: `${reasonPrefix}-yaw-damping`,
      appliedTurnDirection: 0,
      headingError: error,
      angularStoppingAngle: stoppingAngle,
    };
  }
  if (Math.abs(error) <= PQ017_RELEASED_LOCAL_YAW_DEADBAND
      && Math.abs(angularVelocity) <= PQ017_RELEASED_LOCAL_YAW_RATE_DEADBAND) {
    return {
      safe: true,
      action: 'aligned',
      reason: `${reasonPrefix}-yaw-aligned`,
      appliedTurnDirection: 0,
      headingError: error,
      angularStoppingAngle: stoppingAngle,
    };
  }
  return {
    safe: true,
    action: 'yaw',
    reason: `${reasonPrefix}-yaw-pulse`,
    appliedTurnDirection: error > 0 ? 1 : -1,
    headingError: error,
    angularStoppingAngle: stoppingAngle,
  };
}

function auditPq017ReleasedLocalBrake(navigation) {
  const initialSpeed = Math.hypot(
    pq017FinitePrimitive(navigation?.velocity?.x) ?? NaN,
    pq017FinitePrimitive(navigation?.velocity?.z) ?? NaN,
  );
  const startUnit = Number.isFinite(initialSpeed) && initialSpeed > 1e-9
    ? {
      x: navigation.velocity.x / initialSpeed,
      z: navigation.velocity.z / initialSpeed,
    }
    : null;
  const profiles = PQ017_RELEASED_LOCAL_BATCH_PROFILES.map((batchProfile) => {
    const prediction = predictPq017PublicControlTrajectory(
      navigation,
      { action: 'precision-brake', appliedTurnDirection: 0 },
      batchProfile,
    );
    const monotonicSpeedReduction = prediction.trajectory.every((sample, index, trajectory) => (
      index === 0 || sample.speed <= trajectory[index - 1].speed + 1e-9
    ));
    const signedVelocityPreserved = startUnit != null
      && prediction.trajectory.every((sample) => (
        sample.velocity.x * startUnit.x + sample.velocity.z * startUnit.z > 0
    ));
    const endSpeed = prediction.end?.speed;
    return {
      id: batchProfile.id,
      ticks: batchProfile.sampleTicks,
      safe: prediction.safe,
      monotonicSpeedReduction,
      signedVelocityPreserved,
      speedReduced: Number.isFinite(endSpeed) && endSpeed < initialSpeed,
      endSpeed,
    };
  });
  return {
    admissible: Number.isFinite(initialSpeed)
      && initialSpeed > PQ017_RELEASED_LAUNCH_READY_SPEED
      && profiles.every((profile) => (
        profile.safe
        && profile.monotonicSpeedReduction
        && profile.signedVelocityPreserved
        && profile.speedReduced
      )),
    tickCounts: profiles.map((profile) => profile.ticks),
    profiles,
  };
}

export function decidePq017ReleasedLaunchGateControl({
  navigation = null,
  crossingPlan = null,
  controllerState = null,
} = {}) {
  const gate = normalizePq017LaunchGate(crossingPlan?.launchGate);
  const evaluation = evaluatePq017LaunchGate(navigation, gate);
  const speed = evaluation.speed;
  const state = {
    nudgeCooldown: controllerState?.nudgeCooldown === true,
  };
  if (crossingPlan?.safe !== true || crossingPlan?.releasedDetour !== true
      || !gate || evaluation.reason === 'launch-gate-observation-invalid'
      || pq017FinitePrimitive(navigation?.rotation) == null
      || pq017FinitePrimitive(navigation?.angularVelocity) == null) {
    return {
      safe: false,
      action: 'replan',
      reason: 'local-launch-control-invalid',
      inputAuthorized: false,
      nextState: state,
      gateEvaluation: evaluation,
    };
  }
  if (evaluation.accepted
      && pq017AtOrBelowBoundary(speed, PQ017_RELEASED_LAUNCH_READY_SPEED)) {
    return {
      safe: true,
      action: 'complete',
      reason: null,
      inputAuthorized: false,
      appliedTurnDirection: 0,
      nextState: state,
      gateEvaluation: evaluation,
    };
  }

  const brakeAudit = auditPq017ReleasedLocalBrake(navigation);
  if (speed > PQ017_RELEASED_LAUNCH_READY_SPEED) {
    if (brakeAudit.admissible) {
      return {
        safe: true,
        action: 'precision-brake',
        reason: 'launch-speed-force-brake',
        inputAuthorized: true,
        appliedTurnDirection: 0,
        nextState: state,
        gateEvaluation: evaluation,
        brakeAudit,
      };
    }
    return {
      safe: false,
      action: 'replan',
      reason: 'precision-brake-preflight-rejected',
      inputAuthorized: false,
      appliedTurnDirection: 0,
      nextState: state,
      gateEvaluation: evaluation,
      brakeAudit,
    };
  }

  if (state.nudgeCooldown) {
    return {
      safe: true,
      action: 'coast',
      reason: 'nudge-neutral-observation',
      inputAuthorized: true,
      appliedTurnDirection: 0,
      nextState: { nudgeCooldown: false },
      gateEvaluation: evaluation,
      brakeAudit,
    };
  }

  const targetAngle = Math.atan2(
    gate.center.z - navigation.position.z,
    gate.center.x - navigation.position.x,
  );
  const yaw = pq017ReleasedLocalYawControl(navigation, targetAngle, 'target');
  if (yaw.action !== 'aligned') {
    return {
      ...yaw,
      inputAuthorized: yaw.safe,
      nextState: state,
      gateEvaluation: evaluation,
      brakeAudit,
    };
  }
  return {
    safe: true,
    action: 'nudge',
    reason: 'target-aligned-nudge',
    inputAuthorized: true,
    appliedTurnDirection: 0,
    nextState: { nudgeCooldown: true },
    gateEvaluation: evaluation,
    brakeAudit,
  };
}

export function planPq017ReleasedLaunchGateConvergence({
  navigation = null,
  payloadSettled = false,
  tetherActive = null,
  crossingPlan = null,
  controllerState = null,
} = {}) {
  const gate = normalizePq017LaunchGate(crossingPlan?.launchGate);
  const gateEvaluation = evaluatePq017LaunchGate(navigation, gate);
  const speed = gateEvaluation.speed;
  const routeStoppingDistance = pq017FinitePrimitive(crossingPlan?.stoppingDistance);
  const precisionBrakeStop = gate
    ? predictPq017PrecisionBrakeStopTrajectory(
      navigation || {},
      PQ017_RELEASED_LAUNCH_READY_SPEED,
    )
    : null;
  if (crossingPlan?.safe !== true || crossingPlan?.releasedDetour !== true || !gate
      || !navigation?.position || !navigation?.velocity
      || gateEvaluation.reason === 'launch-gate-observation-invalid'
      || routeStoppingDistance == null || routeStoppingDistance < 0
      || precisionBrakeStop?.safe !== true) {
    return {
      safe: false,
      action: 'replan',
      reason: gateEvaluation.reason === 'launch-gate-observation-invalid'
        ? 'local-launch-telemetry-invalid'
        : 'local-launch-plan-invalid',
      gateEvaluation,
      precisionBrakeStop,
    };
  }
  if (pq017FinitePrimitive(navigation.rotation) == null
      || pq017FinitePrimitive(navigation.angularVelocity) == null) {
    return { safe: false, action: 'replan', reason: 'local-launch-plan-invalid' };
  }
  const settlementAccepted = payloadSettled === true
    || (payloadSettled?.safe === true && payloadSettled?.action === 'settled');
  if (!settlementAccepted || tetherActive !== false) {
    return { safe: false, action: 'replan', reason: 'released-payload-not-settled' };
  }
  if (!pq017AtOrBelowBoundary(speed, gate.maxServiceSpeed)) {
    return {
      safe: false,
      action: 'replan',
      reason: 'local-launch-speed-exceeded',
      inputAuthorized: false,
      gateEvaluation,
    };
  }
  const stoppingEnvelope = Math.max(
    routeStoppingDistance,
    precisionBrakeStop.maximumDisplacement,
  );
  const envelopeLimit = gate.arrivalRadius + stoppingEnvelope;
  if (!pq017AtOrBelowBoundary(gateEvaluation.distance, envelopeLimit)) {
    return {
      safe: false,
      action: 'replan',
      reason: 'outside-local-stopping-envelope',
      inputAuthorized: false,
      gateEvaluation,
      precisionBrakeStop,
    };
  }
  const {
    obstacles,
    playerRadius,
  } = crossingPlan.routeSafety || {};
  const canonicalSweep = auditPq017RouteSweep(
    navigation.position,
    gate.center,
    obstacles,
    playerRadius,
    { requiredClearance: 0 },
  );
  if (!canonicalSweep.safe) {
    return {
      safe: false,
      action: 'replan',
      reason: 'local-launch-canonical-sweep-blocked',
      inputAuthorized: false,
      gateEvaluation,
      canonicalSweep,
      precisionBrakeStop,
    };
  }
  const decision = decidePq017ReleasedLaunchGateControl({
    navigation,
    crossingPlan,
    controllerState,
  });
  if (!decision.safe || decision.action === 'replan') {
    return {
      safe: false,
      action: 'replan',
      reason: decision.reason,
      inputAuthorized: false,
      gateEvaluation,
      canonicalSweep,
      decision,
      precisionBrakeStop,
    };
  }
  const precisionBrakeCorridor = decision.action === 'precision-brake'
    ? planPq017RouteSafeDisplacement(
      navigation,
      decision,
      obstacles,
      playerRadius,
      {
        batchProfiles: [{
          id: 'released-local-precision-stop',
          observationBatchTicks: 1,
          sampleTicks: precisionBrakeStop.ticks,
          releaseJitterTicks: 0,
          exactControlTicks: true,
        }],
      },
    )
    : null;
  if (precisionBrakeCorridor && !precisionBrakeCorridor.safe) {
    return {
      safe: false,
      action: 'replan',
      reason: 'local-launch-precision-stop-corridor-blocked',
      inputAuthorized: false,
      gateEvaluation,
      canonicalSweep,
      decision,
      precisionBrakeStop,
      precisionBrakeCorridor,
    };
  }
  const precisionBrakeHold = decision.action === 'precision-brake'
    ? planPq017PrecisionBrakeLevelHold({
      navigation,
      launchGate: gate,
      obstacles,
      playerRadius,
      envelopeLimit,
      precisionBrakeStop,
    })
    : null;
  if (precisionBrakeHold && !precisionBrakeHold.safe) {
    return {
      safe: false,
      action: 'replan',
      reason: 'local-launch-precision-hold-proof-invalid',
      inputAuthorized: false,
      gateEvaluation,
      canonicalSweep,
      decision,
      precisionBrakeStop,
      precisionBrakeCorridor,
      precisionBrakeHold,
    };
  }
  if (decision.action === 'complete') {
    return {
      safe: true,
      action: 'complete',
      reason: null,
      inputAuthorized: false,
      gateEvaluation,
      canonicalSweep,
      decision,
      nextState: decision.nextState,
      precisionBrakeStop,
      precisionBrakeCorridor,
      precisionBrakeHold,
    };
  }
  const controlPlan = planPq017RouteSafeDisplacement(
    navigation,
    decision,
    obstacles,
    playerRadius,
    { batchProfiles: PQ017_RELEASED_LOCAL_BATCH_PROFILES },
  );
  const envelopeSafe = controlPlan.profiles.every((profile) => (
    profile.trajectory.every((sample) => {
      const frame = pq017LaunchGateFrame(sample.position, gate);
      return frame && Math.hypot(frame.along, frame.cross) <= envelopeLimit + 1e-9;
    })
  ));
  const startCenterDistance = gateEvaluation.distance;
  const nudgeProgress = decision.action !== 'nudge' || controlPlan.profiles.every((profile) => {
    const end = profile.trajectory.at(-1);
    const frame = pq017LaunchGateFrame(end?.position, gate);
    return frame
      && Math.hypot(frame.along, frame.cross) < startCenterDistance;
  });
  if (!controlPlan.safe || !envelopeSafe || !nudgeProgress) {
    return {
      safe: false,
      action: 'replan',
      reason: !controlPlan.safe
        ? 'local-launch-public-control-blocked'
        : !envelopeSafe
          ? 'local-launch-stopping-envelope-blocked'
          : 'local-launch-nudge-not-progressing',
      inputAuthorized: false,
      gateEvaluation,
      canonicalSweep,
      decision,
      controlPlan: { ...controlPlan, envelopeSafe, nudgeProgress },
      precisionBrakeStop,
      precisionBrakeCorridor,
      precisionBrakeHold,
    };
  }
  const waypoint = {
    x: gate.center.x,
    z: gate.center.z,
    phase: 'local-launch-gate',
    arrivalRadius: gate.arrivalRadius,
    maxApproachSpeed: gate.maxServiceSpeed,
    maxSettledSpeed: PQ017_RELEASED_LAUNCH_READY_SPEED,
  };
  return {
    safe: true,
    action: 'local-convergence',
    reason: null,
    inputAuthorized: true,
    gateEvaluation,
    envelopeLimit,
    waypoint,
    canonicalSweep,
    decision,
    controlPlan: { ...controlPlan, envelopeSafe, nudgeProgress },
    nextState: decision.nextState,
    precisionBrakeStop,
    precisionBrakeCorridor,
    precisionBrakeHold,
  };
}

function pq017WrapLocalActionAngle(value) {
  let angle = Number(value);
  if (!Number.isFinite(angle)) return null;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function pq017ReleasedLocalActionDecisionBinding(decision = {}) {
  const action = typeof decision?.action === 'string' ? decision.action : null;
  if (!['yaw', 'nudge', 'coast', 'precision-brake'].includes(action)) return null;
  return {
    action,
    reason: typeof decision?.reason === 'string' ? decision.reason : null,
    appliedTurnDirection: Number(decision?.appliedTurnDirection) > 0
      ? 1
      : Number(decision?.appliedTurnDirection) < 0 ? -1 : 0,
  };
}

function pq017ReleasedLocalActionObjective(decisionBinding) {
  if (decisionBinding?.action === 'precision-brake') return 'brake';
  if (decisionBinding?.action === 'yaw'
      || (decisionBinding?.action === 'coast'
        && decisionBinding?.reason?.includes('yaw'))) {
    return 'yaw-alignment';
  }
  if (decisionBinding?.action === 'nudge') return 'nudge-distance';
  if (decisionBinding?.action === 'coast') return 'coast-distance';
  return null;
}

function pq017ReleasedLocalHeadingError(sample, gate) {
  const x = Number(sample?.position?.x);
  const z = Number(sample?.position?.z);
  const rotation = Number(sample?.rotation);
  if (![x, z, rotation].every(Number.isFinite)) return null;
  return pq017WrapLocalActionAngle(
    Math.atan2(gate.center.z - z, gate.center.x - x) - rotation,
  );
}

function pq017ReleasedLocalSampleFinite(sample) {
  return [
    sample?.position?.x,
    sample?.position?.z,
    sample?.velocity?.x,
    sample?.velocity?.z,
    sample?.rotation,
    sample?.angularVelocity,
    sample?.speed,
  ].every((value) => Number.isFinite(Number(value)));
}

function auditPq017NudgeBrakeRecovery({
  sample,
  gate,
  obstacles,
  playerRadius,
  envelopeLimit,
  initialTargetUnit,
} = {}) {
  const recovery = predictPq017PrecisionBrakeStopTrajectory(
    {
      position: sample?.position,
      velocity: sample?.velocity,
      rotation: sample?.rotation,
      angularVelocity: sample?.angularVelocity,
    },
    PQ017_RELEASED_LAUNCH_READY_SPEED,
  );
  if (recovery?.safe !== true || !Array.isArray(recovery.trajectory)
      || recovery.trajectory.length < 1) {
    return {
      safe: false,
      reason: 'nudge-brake-recovery-invalid',
      recovery,
    };
  }
  let minimumClearance = Infinity;
  let maximumEnvelopeDistance = 0;
  let previousDistance = Math.hypot(
    gate.center.x - Number(sample.position.x),
    gate.center.z - Number(sample.position.z),
  );
  for (let index = 0; index < recovery.trajectory.length; index += 1) {
    const point = recovery.trajectory[index];
    if (!pq017ReleasedLocalSampleFinite(point)) {
      return {
        safe: false,
        reason: 'nudge-brake-recovery-nonfinite',
        recovery,
      };
    }
    const frame = pq017LaunchGateFrame(point.position, gate);
    const envelopeDistance = frame ? Math.hypot(frame.along, frame.cross) : Infinity;
    maximumEnvelopeDistance = Math.max(maximumEnvelopeDistance, envelopeDistance);
    const remainingX = gate.center.x - point.position.x;
    const remainingZ = gate.center.z - point.position.z;
    const remainingAlong = remainingX * initialTargetUnit.x
      + remainingZ * initialTargetUnit.z;
    const distance = Math.hypot(remainingX, remainingZ);
    if (!Number.isFinite(envelopeDistance)
        || envelopeDistance > envelopeLimit + 1e-9
        || remainingAlong < -1e-9
        || distance > previousDistance + 1e-9) {
      return {
        safe: false,
        reason: envelopeDistance > envelopeLimit + 1e-9
          ? 'nudge-brake-recovery-envelope-exceeded'
          : remainingAlong < -1e-9
            ? 'nudge-brake-recovery-passed-target'
            : 'nudge-brake-recovery-not-progressing',
        recovery,
        maximumEnvelopeDistance,
      };
    }
    if (index > 0) {
      const segment = auditPq017RouteSweep(
        recovery.trajectory[index - 1].position,
        point.position,
        obstacles,
        playerRadius,
        { requiredClearance: 0 },
      );
      const clearance = Number(segment?.closestConstraint?.clearance);
      if (Number.isFinite(clearance)) minimumClearance = Math.min(minimumClearance, clearance);
      if (!segment.safe) {
        return {
          safe: false,
          reason: 'nudge-brake-recovery-collision',
          recovery,
          sweep: segment,
          minimumClearance,
          maximumEnvelopeDistance,
        };
      }
    }
    previousDistance = distance;
  }
  return {
    safe: true,
    reason: null,
    ticks: recovery.ticks,
    end: recovery.end,
    minimumClearance: Number.isFinite(minimumClearance) ? minimumClearance : null,
    maximumEnvelopeDistance,
  };
}

export function planPq017ReleasedLocalActionSafePrefix({
  navigation = null,
  decision = null,
  launchGate = null,
  obstacles = [],
  playerRadius = 0,
  envelopeLimit = null,
  maximumProofTicks = null,
} = {}) {
  const gate = normalizePq017LaunchGate(launchGate);
  const binding = pq017ReleasedLocalActionDecisionBinding(decision);
  const objective = pq017ReleasedLocalActionObjective(binding);
  const keys = binding ? pq017PublicKeysForDecision(decision) : null;
  const shipRadius = Number(playerRadius);
  const limit = Number(envelopeLimit);
  const ordinaryProofTicks = Math.min(
    PQ017_CONTROL_RESPONSE_TICKS,
    PQ017_RELEASED_LOCAL_ACTION_PROOF_TICK_LIMIT,
  );
  const proofTickLimit = binding?.action === 'precision-brake'
    ? PQ017_RELEASED_LOCAL_ACTION_PROOF_TICK_LIMIT
    : ordinaryProofTicks;
  const proofTicks = maximumProofTicks == null
    ? proofTickLimit
    : Math.trunc(Number(maximumProofTicks));
  const startX = Number(navigation?.position?.x);
  const startZ = Number(navigation?.position?.z);
  const startVx = Number(navigation?.velocity?.x);
  const startVz = Number(navigation?.velocity?.z);
  const startRotation = Number(navigation?.rotation);
  const startAngularVelocity = Number(navigation?.angularVelocity);
  if (!gate || !binding || !objective
      || ![startX, startZ, startVx, startVz, startRotation, startAngularVelocity]
        .every(Number.isFinite)
      || !Number.isFinite(shipRadius) || shipRadius < 0
      || !Number.isFinite(limit) || limit <= 0
      || !Number.isInteger(proofTicks) || proofTicks < 1
      || proofTicks > proofTickLimit) {
    return {
      safe: false,
      reason: 'released-local-action-prefix-input-invalid',
      action: binding?.action || null,
      objective,
      maximumSafeTicks: 0,
      proofHorizonTicks: proofTicks,
      boundary: null,
    };
  }

  const startPosition = { x: startX, z: startZ };
  const startVelocity = { x: startVx, z: startVz };
  const startSpeed = Math.hypot(startVx, startVz);
  const startDistance = Math.hypot(gate.center.x - startX, gate.center.z - startZ);
  const initialTargetUnit = startDistance > 1e-9
    ? {
      x: (gate.center.x - startX) / startDistance,
      z: (gate.center.z - startZ) / startDistance,
    }
    : null;
  const initialHeadingError = pq017ReleasedLocalHeadingError({
    position: startPosition,
    rotation: startRotation,
  }, gate);
  const initialHeadingSign = Math.sign(initialHeadingError || 0);
  const initialVelocityUnit = startSpeed > 1e-9
    ? { x: startVx / startSpeed, z: startVz / startSpeed }
    : null;
  const directionAuthorized = binding.action !== 'yaw'
    || (initialHeadingSign !== 0
      && binding.appliedTurnDirection === initialHeadingSign);
  if (!directionAuthorized
      || ((objective === 'nudge-distance' || objective === 'coast-distance')
        && !initialTargetUnit)
      || (objective === 'brake' && !initialVelocityUnit)) {
    return {
      safe: false,
      reason: 'released-local-action-objective-invalid',
      action: binding.action,
      objective,
      decisionBinding: binding,
      keys,
      maximumSafeTicks: 0,
      proofHorizonTicks: proofTicks,
      boundary: null,
    };
  }

  let maximumSafeTicks = 0;
  let boundary = null;
  let safeEnd = null;
  let objectiveProgress = true;
  let minimumRecoveryHeadroom = Infinity;
  const continueWhile = (previous, sample) => {
    const finite = pq017ReleasedLocalSampleFinite(previous)
      && pq017ReleasedLocalSampleFinite(sample)
      && isDeepStrictEqual(sample.keys, keys);
    const sweep = finite
      ? auditPq017RouteSweep(
        previous.position,
        sample.position,
        obstacles,
        shipRadius,
        { requiredClearance: 0 },
      )
      : { safe: false, reason: 'segment-invalid', closestConstraint: null };
    const frame = finite ? pq017LaunchGateFrame(sample.position, gate) : null;
    const envelopeDistance = frame ? Math.hypot(frame.along, frame.cross) : Infinity;
    const envelopeSafe = envelopeDistance <= limit + 1e-9;
    let objectiveSafe = false;
    let objectiveMetric = null;
    let recovery = null;
    if (finite && objective === 'yaw-alignment') {
      const previousError = pq017ReleasedLocalHeadingError(previous, gate);
      const sampleError = pq017ReleasedLocalHeadingError(sample, gate);
      const noOvershoot = Math.abs(sampleError) <= 1e-9
        || Math.sign(sampleError) === initialHeadingSign;
      objectiveSafe = previousError != null && sampleError != null
        && Math.abs(sampleError) <= Math.abs(previousError) + 1e-9
        && noOvershoot;
      objectiveMetric = sampleError;
    } else if (finite
        && (objective === 'nudge-distance' || objective === 'coast-distance')) {
      const previousDistance = Math.hypot(
        gate.center.x - previous.position.x,
        gate.center.z - previous.position.z,
      );
      const remainingX = gate.center.x - sample.position.x;
      const remainingZ = gate.center.z - sample.position.z;
      const distance = Math.hypot(remainingX, remainingZ);
      const remainingAlong = remainingX * initialTargetUnit.x
        + remainingZ * initialTargetUnit.z;
      objectiveSafe = distance <= previousDistance + 1e-9
        && remainingAlong >= -1e-9;
      objectiveMetric = distance;
      if (objectiveSafe && objective === 'nudge-distance') {
        recovery = auditPq017NudgeBrakeRecovery({
          sample,
          gate,
          obstacles,
          playerRadius: shipRadius,
          envelopeLimit: limit,
          initialTargetUnit,
        });
        objectiveSafe = recovery.safe;
        if (Number.isFinite(recovery.minimumClearance)) {
          minimumRecoveryHeadroom = Math.min(
            minimumRecoveryHeadroom,
            recovery.minimumClearance,
          );
        }
      }
    } else if (finite && objective === 'brake') {
      const signedVelocity = sample.velocity.x * initialVelocityUnit.x
        + sample.velocity.z * initialVelocityUnit.z;
      objectiveSafe = sample.speed <= previous.speed + 1e-9
        && signedVelocity > 0;
      objectiveMetric = signedVelocity;
    }
    objectiveProgress = objectiveProgress && objectiveSafe;
    if (!finite || !sweep.safe || !envelopeSafe || !objectiveSafe) {
      boundary = {
        tick: sample?.tick ?? maximumSafeTicks + 1,
        reason: !finite
          ? 'released-local-action-sample-invalid'
          : !sweep.safe
            ? 'released-local-action-collision'
            : !envelopeSafe
              ? 'local-launch-envelope-exceeded'
              : recovery?.reason || 'released-local-action-objective-ended',
        position: sample?.position ? { ...sample.position } : null,
        velocity: sample?.velocity ? { ...sample.velocity } : null,
        rotation: Number.isFinite(Number(sample?.rotation)) ? sample.rotation : null,
        angularVelocity: Number.isFinite(Number(sample?.angularVelocity))
          ? sample.angularVelocity
          : null,
        speed: Number.isFinite(Number(sample?.speed)) ? sample.speed : null,
        distance: Number.isFinite(envelopeDistance) ? envelopeDistance : null,
        crossTrack: frame ? Math.abs(frame.cross) : null,
        objectiveMetric,
        sweptSegment: sweep,
        recovery,
      };
      return false;
    }
    maximumSafeTicks = sample.tick;
    safeEnd = {
      ...sample,
      distance: envelopeDistance,
      crossTrack: Math.abs(frame.cross),
      objectiveMetric,
      recovery,
    };
    return true;
  };
  const prediction = predictPq017PublicControlTrajectory(
    navigation,
    decision,
    {
      id: `released-local-${binding.action}-safe-prefix`,
      observationBatchTicks: 1,
      sampleTicks: proofTicks,
      releaseJitterTicks: 0,
      exactControlTicks: true,
      continueWhile,
    },
  );
  if (objective === 'yaw-alignment'
      && boundary?.reason === 'released-local-action-objective-ended'
      && maximumSafeTicks >= 2) {
    const predictedObjectiveBoundary = boundary;
    const reservedSample = prediction.trajectory[maximumSafeTicks];
    maximumSafeTicks -= 1;
    safeEnd = prediction.trajectory[maximumSafeTicks];
    boundary = {
      tick: maximumSafeTicks + 1,
      reason: 'released-local-action-real-authority-reserve',
      position: reservedSample?.position ? { ...reservedSample.position } : null,
      velocity: reservedSample?.velocity ? { ...reservedSample.velocity } : null,
      rotation: reservedSample?.rotation ?? null,
      angularVelocity: reservedSample?.angularVelocity ?? null,
      speed: reservedSample?.speed ?? null,
      distance: null,
      crossTrack: null,
      objectiveMetric: null,
      sweptSegment: null,
      recovery: null,
      predictedObjectiveBoundary,
    };
  }
  if (!boundary && maximumSafeTicks === proofTicks) {
    boundary = {
      tick: proofTicks + 1,
      reason: 'released-local-action-proof-horizon-reached',
      position: null,
      velocity: null,
      rotation: null,
      angularVelocity: null,
      speed: null,
      distance: null,
      crossTrack: null,
      objectiveMetric: null,
      sweptSegment: null,
      recovery: null,
    };
  }
  const safe = prediction.safe
    && maximumSafeTicks >= 1
    && Number(boundary?.tick) === maximumSafeTicks + 1;
  return {
    safe,
    reason: safe ? null : 'released-local-action-prefix-invalid',
    action: binding.action,
    objective,
    decisionBinding: binding,
    keys,
    launchGate: gate,
    envelopeLimit: limit,
    proofHorizonTicks: proofTicks,
    maximumSafeTicks,
    minimumRecoveryHeadroom: Number.isFinite(minimumRecoveryHeadroom)
      ? minimumRecoveryHeadroom
      : null,
    start: {
      position: startPosition,
      velocity: startVelocity,
      rotation: startRotation,
      angularVelocity: startAngularVelocity,
      speed: startSpeed,
      distance: startDistance,
      headingError: initialHeadingError,
      targetUnit: initialTargetUnit,
      velocityUnit: initialVelocityUnit,
    },
    objectiveProgress,
    trajectory: prediction.trajectory,
    safeEnd,
    boundary,
  };
}

export function planPq017PrecisionBrakeLevelHold({
  navigation = null,
  launchGate = null,
  obstacles = [],
  playerRadius = 0,
  envelopeLimit = null,
  precisionBrakeStop = null,
  maximumProofTicks = PQ017_RELEASED_PRECISION_BRAKE_HOLD_TICK_LIMIT,
} = {}) {
  const gate = normalizePq017LaunchGate(launchGate);
  const shipRadius = Number(playerRadius);
  const limit = Number(envelopeLimit);
  const proofTicks = Math.trunc(Number(maximumProofTicks));
  const stopTicks = Number(precisionBrakeStop?.ticks);
  const stopTrajectory = precisionBrakeStop?.trajectory;
  if (!gate || !Number.isFinite(shipRadius) || shipRadius < 0
      || !Number.isFinite(limit) || limit <= 0
      || !Number.isInteger(proofTicks) || proofTicks < 1
      || proofTicks > PQ017_RELEASED_PRECISION_BRAKE_HOLD_TICK_LIMIT
      || precisionBrakeStop?.safe !== true
      || !Number.isInteger(stopTicks) || stopTicks < 1 || stopTicks > proofTicks
      || !Array.isArray(stopTrajectory) || stopTrajectory.length !== stopTicks + 1) {
    return {
      safe: false,
      reason: 'precision-brake-level-hold-input-invalid',
      maximumSafeHoldTicks: 0,
      proofHorizonTicks: proofTicks,
      envelopeLimit: limit,
      boundary: null,
    };
  }

  const initial = stopTrajectory[0];
  const initialSpeed = Number(initial?.speed);
  const startUnit = Number.isFinite(initialSpeed) && initialSpeed > 1e-9
    ? {
      x: initial.velocity.x / initialSpeed,
      z: initial.velocity.z / initialSpeed,
    }
    : null;
  let maximumSafeHoldTicks = 0;
  let maximumSafeDisplacement = 0;
  let monotonicSpeedReduction = true;
  let signedVelocityPreserved = startUnit != null;
  let boundary = null;
  let safeEnd = initial || null;
  const continueWhile = (previous, sample) => {
    const speedMonotonic = sample.speed <= previous.speed + 1e-9;
    const signedVelocity = startUnit == null
      ? null
      : sample.velocity.x * startUnit.x + sample.velocity.z * startUnit.z;
    const signedPreserved = signedVelocity != null && signedVelocity > 0;
    monotonicSpeedReduction = monotonicSpeedReduction && speedMonotonic;
    signedVelocityPreserved = signedVelocityPreserved && signedPreserved;
    const sweep = auditPq017RouteSweep(
      previous.position,
      sample.position,
      obstacles,
      shipRadius,
      { requiredClearance: 0 },
    );
    const frame = pq017LaunchGateFrame(sample.position, gate);
    const centerDistance = frame ? Math.hypot(frame.along, frame.cross) : Infinity;
    const envelopeSafe = centerDistance <= limit + 1e-9;
    if (!speedMonotonic || !signedPreserved || !sweep.safe || !envelopeSafe) {
      boundary = {
        tick: sample.tick,
        reason: !speedMonotonic
          ? 'precision-brake-speed-not-monotonic'
          : !signedPreserved
            ? 'precision-brake-signed-velocity-reversed'
            : !sweep.safe
              ? 'precision-brake-collision-corridor-blocked'
              : 'local-launch-envelope-exceeded',
        position: { ...sample.position },
        velocity: { ...sample.velocity },
        speed: sample.speed,
        distance: centerDistance,
        crossTrack: frame ? Math.abs(frame.cross) : null,
        sweptSegment: sweep,
      };
      return false;
    }
    maximumSafeHoldTicks = sample.tick;
    maximumSafeDisplacement = Math.max(
      maximumSafeDisplacement,
      Math.hypot(
        sample.position.x - initial.position.x,
        sample.position.z - initial.position.z,
      ),
    );
    safeEnd = sample;
    return true;
  };
  const prediction = predictPq017PublicControlTrajectory(
    navigation,
    { action: 'precision-brake', appliedTurnDirection: 0 },
    {
      id: 'released-local-precision-level-hold',
      observationBatchTicks: 1,
      sampleTicks: proofTicks,
      releaseJitterTicks: 0,
      exactControlTicks: true,
      continueWhile,
    },
  );
  const trajectory = prediction.trajectory;
  const stopProofMatches = Array.isArray(trajectory)
    && isDeepStrictEqual(trajectory.slice(0, stopTicks + 1), stopTrajectory);
  if (!boundary && maximumSafeHoldTicks === proofTicks) {
    boundary = {
      tick: proofTicks + 1,
      reason: 'precision-brake-proof-horizon-reached',
      position: null,
      velocity: null,
      speed: null,
      distance: null,
      crossTrack: null,
      sweptSegment: null,
    };
  }
  const safeFrame = safeEnd ? pq017LaunchGateFrame(safeEnd.position, gate) : null;
  const safe = prediction.safe
    && stopProofMatches
    && monotonicSpeedReduction
    && signedVelocityPreserved
    && maximumSafeHoldTicks >= stopTicks;
  return {
    safe,
    reason: safe ? null : 'precision-brake-level-hold-proof-invalid',
    keys: prediction.keys,
    stopTicks,
    stopProofMatches,
    proofHorizonTicks: proofTicks,
    maximumSafeHoldTicks,
    maximumSafeDisplacement,
    monotonicSpeedReduction,
    signedVelocityPreserved,
    corridorSafe: maximumSafeHoldTicks >= stopTicks,
    envelopeSafe: maximumSafeHoldTicks >= stopTicks,
    envelopeLimit: limit,
    launchGate: gate,
    safeEnd: safeEnd ? {
      tick: safeEnd.tick,
      position: { ...safeEnd.position },
      velocity: { ...safeEnd.velocity },
      speed: safeEnd.speed,
      distance: safeFrame ? Math.hypot(safeFrame.along, safeFrame.cross) : null,
      crossTrack: safeFrame ? Math.abs(safeFrame.cross) : null,
    } : null,
    boundary,
  };
}

export function auditPq017ReleasedLaunchNeutralTail({
  startState = null,
  endState = null,
  tickDelta = null,
  sweptSegment = null,
  launchGate = null,
  obstacles = [],
  playerRadius = 0,
  envelopeLimit = null,
} = {}) {
  const ticks = Number(tickDelta);
  const gate = normalizePq017LaunchGate(launchGate);
  const limit = Number(envelopeLimit);
  const shipRadius = Number(playerRadius);
  const normalizeState = (value) => ({
    position: {
      x: Number(value?.position?.x ?? value?.x),
      z: Number(value?.position?.z ?? value?.z),
    },
    velocity: {
      x: Number(value?.velocity?.x ?? value?.vx),
      z: Number(value?.velocity?.z ?? value?.vz),
    },
    rotation: Number(value?.rotation ?? value?.rot),
    angularVelocity: Number(value?.angularVelocity ?? value?.angVel),
  });
  const start = normalizeState(startState);
  const end = normalizeState(endState);
  const finite = [
    start.position.x,
    start.position.z,
    start.velocity.x,
    start.velocity.z,
    start.rotation,
    start.angularVelocity,
    end.position.x,
    end.position.z,
    end.velocity.x,
    end.velocity.z,
    end.rotation,
    end.angularVelocity,
  ].every(Number.isFinite);
  if (!finite || !gate || !Number.isInteger(ticks) || ticks < 0
      || ticks > PQ017_CONTROL_RESPONSE_TICKS
      || !Number.isFinite(limit) || limit <= 0
      || !Number.isFinite(shipRadius) || shipRadius < 0
      || sweptSegment?.safe !== true) {
    return {
      safe: false,
      reason: 'released-launch-neutral-tail-input-invalid',
      ticks,
      proofHorizonTicks: PQ017_CONTROL_RESPONSE_TICKS,
    };
  }
  const prediction = ticks === 0
    ? {
      safe: true,
      trajectory: [{
        tick: 0,
        position: start.position,
        velocity: start.velocity,
        rotation: start.rotation,
        angularVelocity: start.angularVelocity,
        speed: Math.hypot(start.velocity.x, start.velocity.z),
        keys: pq017PublicKeysForDecision({ action: 'coast' }),
      }],
    }
    : predictPq017PublicControlTrajectory(
      start,
      { action: 'coast', reason: 'post-release-neutral-tail', appliedTurnDirection: 0 },
      {
        id: 'released-local-post-release-neutral-tail',
        observationBatchTicks: 1,
        sampleTicks: ticks,
        releaseJitterTicks: 0,
        exactControlTicks: true,
      },
    );
  let predictedSafe = prediction.safe === true
    && prediction.trajectory.length === ticks + 1;
  let minimumClearance = Infinity;
  let maximumEnvelopeDistance = 0;
  for (let index = 0; index < prediction.trajectory.length; index += 1) {
    const sample = prediction.trajectory[index];
    const sampleFinite = pq017ReleasedLocalSampleFinite(sample);
    const frame = sampleFinite ? pq017LaunchGateFrame(sample.position, gate) : null;
    const distance = frame ? Math.hypot(frame.along, frame.cross) : Infinity;
    maximumEnvelopeDistance = Math.max(maximumEnvelopeDistance, distance);
    predictedSafe = predictedSafe
      && sampleFinite
      && distance <= limit + 1e-9;
    if (index > 0) {
      const segment = auditPq017RouteSweep(
        prediction.trajectory[index - 1].position,
        sample.position,
        obstacles,
        shipRadius,
        { requiredClearance: 0 },
      );
      const clearance = Number(segment?.closestConstraint?.clearance);
      if (Number.isFinite(clearance)) minimumClearance = Math.min(minimumClearance, clearance);
      predictedSafe = predictedSafe && segment.safe === true;
    }
  }
  const actualFrame = pq017LaunchGateFrame(end.position, gate);
  const actualEnvelopeDistance = actualFrame
    ? Math.hypot(actualFrame.along, actualFrame.cross)
    : Infinity;
  const actualSafe = sweptSegment.safe === true
    && Number.isFinite(actualEnvelopeDistance)
    && actualEnvelopeDistance <= limit + 1e-9;
  return {
    safe: predictedSafe && actualSafe,
    reason: predictedSafe && actualSafe
      ? null
      : !predictedSafe
        ? 'released-launch-neutral-tail-prediction-unsafe'
        : 'released-launch-neutral-tail-observation-unsafe',
    ticks,
    proofHorizonTicks: PQ017_CONTROL_RESPONSE_TICKS,
    trajectory: prediction.trajectory,
    perTickSegmentsAudited: Math.max(0, prediction.trajectory.length - 1),
    minimumClearance: Number.isFinite(minimumClearance) ? minimumClearance : null,
    maximumEnvelopeDistance,
    actualEnvelopeDistance,
    sweptSegment,
  };
}

export function evaluatePq017ReleasedLaunchAppliedBatch({
  decision = null,
  keys = null,
  tickDelta = null,
  sweptSegment = null,
  endPosition = null,
  precisionBrakeStop = null,
  precisionBrakeCorridor = null,
  precisionBrakeHold = null,
} = {}) {
  const observedTicks = Number(tickDelta);
  if (sweptSegment?.safe !== true) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-applied-segment-unsafe',
      tickDelta: observedTicks,
      maximumSafeTicks: null,
    };
  }
  if (!Number.isInteger(observedTicks) || observedTicks < 1) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-batch-unbounded',
      tickDelta: observedTicks,
      maximumSafeTicks: PQ017_RELEASED_LOCAL_ORDINARY_BATCH_TICKS,
    };
  }

  const heldCodes = Object.entries(keys || {})
    .filter(([, held]) => held === true)
    .map(([code]) => code);
  const precisionBrakeRequested = decision?.action === 'precision-brake';
  const exactPrecisionBrakeLevel = precisionBrakeRequested
    && heldCodes.length === 1
    && heldCodes[0] === PQ017_PRECISION_BRAKE_KEY;
  if (!precisionBrakeRequested) {
    const accepted = observedTicks <= PQ017_RELEASED_LOCAL_ORDINARY_BATCH_TICKS;
    return {
      safe: accepted,
      accepted,
      reason: accepted ? null : 'released-launch-batch-unbounded',
      tickDelta: observedTicks,
      maximumSafeTicks: PQ017_RELEASED_LOCAL_ORDINARY_BATCH_TICKS,
    };
  }

  const stopTicks = Number(precisionBrakeStop?.ticks);
  const stopTrajectory = precisionBrakeStop?.trajectory;
  const corridorProfile = precisionBrakeCorridor?.profiles?.length === 1
    ? precisionBrakeCorridor.profiles[0]
    : null;
  const maximumSafeHoldTicks = Number(precisionBrakeHold?.maximumSafeHoldTicks);
  const observedFrame = pq017LaunchGateFrame(
    endPosition,
    precisionBrakeHold?.launchGate,
  );
  const observedEnvelopeDistance = observedFrame
    ? Math.hypot(observedFrame.along, observedFrame.cross)
    : null;
  const proofValid = exactPrecisionBrakeLevel
    && precisionBrakeStop?.safe === true
    && precisionBrakeStop?.monotonicSpeedReduction === true
    && precisionBrakeStop?.signedVelocityPreserved === true
    && Number.isInteger(stopTicks)
    && stopTicks >= 1
    && stopTicks <= PQ017_RELEASED_PRECISION_BRAKE_HOLD_TICK_LIMIT
    && Array.isArray(stopTrajectory)
    && stopTrajectory.length === stopTicks + 1
    && pq017AtOrBelowBoundary(
      precisionBrakeStop?.end?.speed,
      PQ017_RELEASED_LAUNCH_READY_SPEED,
    )
    && Number.isFinite(Number(precisionBrakeStop?.maximumDisplacement))
    && Number(precisionBrakeStop.maximumDisplacement) >= 0
    && precisionBrakeCorridor?.safe === true
    && corridorProfile?.id === 'released-local-precision-stop'
    && corridorProfile?.sweep?.safe === true
    && corridorProfile?.ticks === stopTicks
    && corridorProfile?.trajectory?.length === stopTicks + 1
    && isDeepStrictEqual(corridorProfile.trajectory, stopTrajectory)
    && precisionBrakeHold?.safe === true
    && precisionBrakeHold?.stopTicks === stopTicks
    && precisionBrakeHold?.stopProofMatches === true
    && precisionBrakeHold?.monotonicSpeedReduction === true
    && precisionBrakeHold?.signedVelocityPreserved === true
    && precisionBrakeHold?.corridorSafe === true
    && precisionBrakeHold?.envelopeSafe === true
    && Number.isInteger(maximumSafeHoldTicks)
    && maximumSafeHoldTicks >= stopTicks
    && maximumSafeHoldTicks <= PQ017_RELEASED_PRECISION_BRAKE_HOLD_TICK_LIMIT
    && Number(precisionBrakeHold?.boundary?.tick) === maximumSafeHoldTicks + 1;
  if (!proofValid) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-precision-brake-proof-invalid',
      tickDelta: observedTicks,
      maximumSafeTicks: null,
    };
  }
  if (observedTicks > maximumSafeHoldTicks) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-precision-brake-hold-budget-exceeded',
      tickDelta: observedTicks,
      maximumSafeTicks: maximumSafeHoldTicks,
      observedEnvelopeDistance,
      envelopeLimit: precisionBrakeHold.envelopeLimit,
    };
  }
  if (!observedFrame || !Number.isFinite(observedEnvelopeDistance)) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-precision-brake-proof-invalid',
      tickDelta: observedTicks,
      maximumSafeTicks: maximumSafeHoldTicks,
    };
  }
  if (!pq017AtOrBelowBoundary(
    observedEnvelopeDistance,
    precisionBrakeHold.envelopeLimit,
  )) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-precision-brake-observed-envelope-exceeded',
      tickDelta: observedTicks,
      maximumSafeTicks: maximumSafeHoldTicks,
      observedEnvelopeDistance,
      envelopeLimit: precisionBrakeHold.envelopeLimit,
    };
  }
  return {
    safe: true,
    accepted: true,
    reason: 'precision-brake-level-hold-proven',
    tickDelta: observedTicks,
    maximumSafeTicks: maximumSafeHoldTicks,
    observedEnvelopeDistance,
    envelopeLimit: precisionBrakeHold.envelopeLimit,
  };
}

function evaluatePq017ReleasedLaunchAppliedBatchGeneric({
  decision = null,
  keys = null,
  tickDelta = null,
  sweptSegment = null,
  startState = null,
  endPosition = null,
  launchGate = null,
  actionSafePrefix = null,
} = {}) {
  const observedTicks = Number(tickDelta);
  if (sweptSegment?.safe !== true) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-applied-segment-unsafe',
      tickDelta: observedTicks,
      maximumSafeTicks: null,
    };
  }
  if (!Number.isInteger(observedTicks) || observedTicks < 1) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-batch-unbounded',
      tickDelta: observedTicks,
      maximumSafeTicks: null,
    };
  }

  const binding = pq017ReleasedLocalActionDecisionBinding(decision);
  const expectedKeys = binding ? pq017PublicKeysForDecision(decision) : null;
  const gate = normalizePq017LaunchGate(launchGate);
  const proofMaximumTicks = Number(actionSafePrefix?.maximumSafeTicks);
  const normalizeObservedState = (value) => {
    const position = value?.position || value;
    const velocity = value?.velocity || {
      x: value?.vx,
      z: value?.vz,
    };
    const rotation = value?.rotation ?? value?.rot;
    const angularVelocity = value?.angularVelocity ?? value?.angVel;
    const normalized = {
      position: {
        x: Number(position?.x),
        z: Number(position?.z),
      },
      velocity: {
        x: Number(velocity?.x),
        z: Number(velocity?.z),
      },
      rotation: Number(rotation),
      angularVelocity: Number(angularVelocity),
    };
    normalized.speed = Math.hypot(normalized.velocity.x, normalized.velocity.z);
    return normalized;
  };
  const observedStart = normalizeObservedState(startState);
  const observedEnd = normalizeObservedState(endPosition);
  const observedFrame = gate
    ? pq017LaunchGateFrame(observedEnd.position, gate)
    : null;
  const observedEnvelopeDistance = observedFrame
    ? Math.hypot(observedFrame.along, observedFrame.cross)
    : null;
  const observedStatesFinite = [
    observedStart.position.x,
    observedStart.position.z,
    observedStart.velocity.x,
    observedStart.velocity.z,
    observedStart.rotation,
    observedStart.angularVelocity,
    observedEnd.position.x,
    observedEnd.position.z,
    observedEnd.velocity.x,
    observedEnd.velocity.z,
    observedEnd.rotation,
    observedEnd.angularVelocity,
  ].every(Number.isFinite);
  const proofStart = actionSafePrefix?.start;
  const startMatches = observedStatesFinite
    && isDeepStrictEqual(observedStart.position, proofStart?.position)
    && isDeepStrictEqual(observedStart.velocity, proofStart?.velocity)
    && observedStart.rotation === proofStart?.rotation
    && observedStart.angularVelocity === proofStart?.angularVelocity;
  const proofValid = binding != null
    && gate != null
    && actionSafePrefix?.safe === true
    && isDeepStrictEqual(binding, actionSafePrefix.decisionBinding)
    && isDeepStrictEqual(keys, expectedKeys)
    && isDeepStrictEqual(keys, actionSafePrefix.keys)
    && isDeepStrictEqual(gate, actionSafePrefix.launchGate)
    && startMatches
    && Number.isInteger(proofMaximumTicks)
    && proofMaximumTicks >= 1
    && proofMaximumTicks <= Number(actionSafePrefix.proofHorizonTicks)
    && Number(actionSafePrefix?.boundary?.tick) === proofMaximumTicks + 1;
  if (!proofValid) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-action-prefix-proof-invalid',
      tickDelta: observedTicks,
      maximumSafeTicks: null,
    };
  }
  if (observedTicks > proofMaximumTicks) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-action-prefix-budget-exceeded',
      tickDelta: observedTicks,
      maximumSafeTicks: proofMaximumTicks,
      observedEnvelopeDistance,
      envelopeLimit: actionSafePrefix.envelopeLimit,
    };
  }
  const predictedSample = Array.isArray(actionSafePrefix?.trajectory)
    ? actionSafePrefix.trajectory[observedTicks]
    : null;
  if (predictedSample?.tick !== observedTicks) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-action-prefix-proof-invalid',
      tickDelta: observedTicks,
      maximumSafeTicks: proofMaximumTicks,
    };
  }
  if (!observedFrame || !Number.isFinite(observedEnvelopeDistance)) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-action-prefix-observation-invalid',
      tickDelta: observedTicks,
      maximumSafeTicks: proofMaximumTicks,
    };
  }
  if (!pq017AtOrBelowBoundary(
    observedEnvelopeDistance,
    actionSafePrefix.envelopeLimit,
  )) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-action-prefix-observed-envelope-exceeded',
      tickDelta: observedTicks,
      maximumSafeTicks: proofMaximumTicks,
      observedEnvelopeDistance,
      envelopeLimit: actionSafePrefix.envelopeLimit,
    };
  }

  let observedObjectiveProgress = false;
  if (actionSafePrefix.objective === 'yaw-alignment') {
    const initialError = Number(actionSafePrefix.start.headingError);
    const endError = pq017ReleasedLocalHeadingError(observedEnd, gate);
    observedObjectiveProgress = Number.isFinite(initialError)
      && endError != null
      && Math.abs(endError) <= Math.abs(initialError) + 1e-9
      && (Math.abs(endError) <= 1e-9 || Math.sign(endError) === Math.sign(initialError));
  } else if (actionSafePrefix.objective === 'nudge-distance'
      || actionSafePrefix.objective === 'coast-distance') {
    const targetUnit = actionSafePrefix.start.targetUnit;
    const remainingX = gate.center.x - observedEnd.position.x;
    const remainingZ = gate.center.z - observedEnd.position.z;
    const remainingAlong = remainingX * Number(targetUnit?.x)
      + remainingZ * Number(targetUnit?.z);
    const endDistance = Math.hypot(remainingX, remainingZ);
    observedObjectiveProgress = Number.isFinite(remainingAlong)
      && endDistance <= Number(actionSafePrefix.start.distance) + 1e-9
      && remainingAlong >= -1e-9;
  } else if (actionSafePrefix.objective === 'brake') {
    const velocityUnit = actionSafePrefix.start.velocityUnit;
    const signedVelocity = observedEnd.velocity.x * Number(velocityUnit?.x)
      + observedEnd.velocity.z * Number(velocityUnit?.z);
    observedObjectiveProgress = Number.isFinite(signedVelocity)
      && observedEnd.speed <= Number(actionSafePrefix.start.speed) + 1e-9
      && signedVelocity > 0;
  }
  if (!observedObjectiveProgress) {
    return {
      safe: false,
      accepted: false,
      reason: 'released-launch-action-prefix-objective-not-observed',
      tickDelta: observedTicks,
      maximumSafeTicks: proofMaximumTicks,
      observedEnvelopeDistance,
      envelopeLimit: actionSafePrefix.envelopeLimit,
    };
  }
  return {
    safe: true,
    accepted: true,
    reason: 'released-launch-atomic-action-prefix-proven',
    tickDelta: observedTicks,
    maximumSafeTicks: proofMaximumTicks,
    objective: actionSafePrefix.objective,
    observedObjectiveProgress,
    observedEnvelopeDistance,
    envelopeLimit: actionSafePrefix.envelopeLimit,
  };
}

export function planPq017ReleasedLaunchGateCorrection({
  geometry = null,
  settlementRuntime = {},
  crossingPlan = null,
  controllerState = null,
} = {}) {
  const settlement = decidePq017ReleasedPayloadSettlement({
    tick: geometry?.tick,
    payload: geometry?.payload,
    payloadAlive: geometry?.payloadAlive === true,
    tetherActive: geometry?.tether?.active === true,
  }, settlementRuntime);
  if (!settlement.safe || settlement.action !== 'settled') {
    return {
      safe: false,
      action: settlement.safe ? 'wait' : 'replan',
      reason: 'released-payload-not-settled',
      inputAuthorized: false,
      settlement,
      localPlan: null,
    };
  }
  const localPlan = planPq017ReleasedLaunchGateConvergence({
    navigation: {
      position: { x: geometry.player.x, z: geometry.player.z },
      velocity: { x: geometry.player.vx, z: geometry.player.vz },
      rotation: geometry.player.rot,
      angularVelocity: geometry.player.angVel,
    },
    payloadSettled: settlement,
    tetherActive: geometry.tether.active,
    crossingPlan,
    controllerState,
  });
  return {
    ...localPlan,
    inputAuthorized: (localPlan.safe
      && ['complete', 'local-convergence'].includes(localPlan.action))
      || (localPlan.action === 'brake'
        && localPlan.reason === 'local-launch-speed-exceeded'),
    settlement,
    localPlan,
  };
}

export function decidePq017ReleasedPreparationStep({
  planningCycle,
  launchAccepted = false,
  crossingPlan = null,
  localPlan = null,
} = {}) {
  const cycle = Math.trunc(Number(planningCycle));
  if (!Number.isInteger(cycle) || cycle < 1
      || crossingPlan?.safe !== true) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'released-preparation-plan-invalid',
      ringAuthorized: false,
    };
  }
  if (launchAccepted === true) {
    return {
      safe: true,
      action: 'complete',
      reason: null,
      ringAuthorized: false,
    };
  }
  if (localPlan?.safe === true && localPlan.action === 'local-convergence') {
    return {
      safe: true,
      action: 'local-convergence',
      reason: null,
      ringAuthorized: false,
    };
  }
  if (crossingPlan.shipRoute?.direct === true) {
    return {
      safe: true,
      action: 'direct-detour',
      reason: null,
      ringAuthorized: false,
    };
  }
  if (cycle <= PQ017_RECEIVER_UNTETHERED_DETOUR_LIMIT) {
    return {
      safe: true,
      action: 'ring-detour',
      reason: null,
      ringAuthorized: true,
    };
  }
  return {
    safe: false,
    action: 'blocked',
    reason: 'released-ring-planning-budget-exhausted',
    ringAuthorized: false,
  };
}

export function decidePq017ReleasedPayloadSettlement(observation = {}, runtime = {}, {
  maxSettledSpeed = PQ017_RELEASED_PAYLOAD_SETTLED_SPEED,
  maxTotalDrift = PQ017_RELEASED_PAYLOAD_MAX_DRIFT,
  requiredStableSamples = PQ017_RELEASED_PAYLOAD_STABLE_SAMPLES,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const tick = finite(observation.tick);
  const x = finite(observation.payload?.x);
  const z = finite(observation.payload?.z);
  const vx = finite(observation.payload?.vx);
  const vz = finite(observation.payload?.vz);
  const speedLimit = finite(maxSettledSpeed);
  const driftLimit = finite(maxTotalDrift);
  const stableLimit = Math.max(1, Math.trunc(Number(requiredStableSamples) || 0));
  if ([tick, x, z, vx, vz, speedLimit, driftLimit].some((value) => value == null)
      || observation.payloadAlive !== true
      || observation.tetherActive !== false
      || speedLimit < 0 || driftLimit <= 0) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'released-payload-observation-invalid',
    };
  }
  const priorTick = finite(runtime.lastTick);
  if (priorTick != null && tick <= priorTick) {
    return {
      ...runtime,
      safe: true,
      action: 'wait',
      reason: 'duplicate-simulation-tick',
    };
  }
  const origin = runtime.origin && Number.isFinite(Number(runtime.origin.x))
    && Number.isFinite(Number(runtime.origin.z))
    ? { x: Number(runtime.origin.x), z: Number(runtime.origin.z) }
    : { x, z };
  const previous = runtime.position && Number.isFinite(Number(runtime.position.x))
    && Number.isFinite(Number(runtime.position.z))
    ? { x: Number(runtime.position.x), z: Number(runtime.position.z) }
    : { x, z };
  const speed = Math.hypot(vx, vz);
  const totalDrift = Math.hypot(x - origin.x, z - origin.z);
  const sampleDrift = Math.hypot(x - previous.x, z - previous.z);
  if (totalDrift > driftLimit + 0.001) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'released-payload-drift-budget-exceeded',
      origin,
      position: { x, z },
      speed,
      totalDrift,
      sampleDrift,
      lastTick: tick,
    };
  }
  const stable = speed <= speedLimit && sampleDrift <= Math.max(0.05, speedLimit * 0.25);
  const stableSamples = stable ? Math.max(0, Math.trunc(runtime.stableSamples || 0)) + 1 : 0;
  return {
    safe: true,
    action: stableSamples >= stableLimit ? 'settled' : 'wait',
    reason: stableSamples >= stableLimit
      ? 'released-payload-physically-settled'
      : 'released-payload-still-moving',
    origin,
    position: { x, z },
    velocity: { x: vx, z: vz },
    speed,
    totalDrift,
    sampleDrift,
    stableSamples,
    lastTick: tick,
  };
}

export function auditPq017ReleasedRouteImpactReceipt(
  observation = {},
  baselineImpactEvents = null,
) {
  const observed = Number(observation?.impactEvents);
  const baseline = Number(baselineImpactEvents);
  if (!Number.isFinite(observed) || !Number.isFinite(baseline)
      || observed < 0 || baseline < 0 || observed < baseline) {
    return {
      safe: false,
      reason: 'released-route-impact-observation-invalid',
      baselineImpactEvents: Number.isFinite(baseline) ? baseline : null,
      observedImpactEvents: Number.isFinite(observed) ? observed : null,
      impactEvents: null,
    };
  }
  const impactEvents = observed - baseline;
  return {
    safe: impactEvents === 0,
    reason: impactEvents === 0
      ? 'released-route-no-world-site-impact'
      : 'released-route-observed-world-site-impact',
    baselineImpactEvents: baseline,
    observedImpactEvents: observed,
    impactEvents,
  };
}

export function evaluatePq017FarSideRelatch({
  serviceGeometry = null,
  settlementPosition = null,
  crossingPlan = null,
  latchTick = null,
} = {}, {
  maximumRestLengthDelta = 1,
  maximumPayloadDrift = 4,
  maximumPayloadSpeed = 4,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const tick = finite(serviceGeometry?.tick);
  const receiptTick = finite(latchTick);
  const restLength = finite(serviceGeometry?.tether?.restLength);
  const lineDistance = finite(serviceGeometry?.lineDistance);
  const payloadX = finite(serviceGeometry?.payload?.x);
  const payloadZ = finite(serviceGeometry?.payload?.z);
  const payloadVx = finite(serviceGeometry?.payload?.vx);
  const payloadVz = finite(serviceGeometry?.payload?.vz);
  const settledX = finite(settlementPosition?.x);
  const settledZ = finite(settlementPosition?.z);
  const restLimit = finite(maximumRestLengthDelta);
  const driftLimit = finite(maximumPayloadDrift);
  const speedLimit = finite(maximumPayloadSpeed);
  const crossLimit = finite(crossingPlan?.launchGate?.maxPlayerCrossTrack);
  const playerCrossTrack = finite(crossingPlan?.playerCrossTrack);
  const predictedMiss = finite(crossingPlan?.predictedReceiverMissAtRest);
  const strictDeliveryRadius = finite(crossingPlan?.strictDeliveryRadius);
  const payloadDrift = [payloadX, payloadZ, settledX, settledZ].every((value) => value != null)
    ? Math.hypot(payloadX - settledX, payloadZ - settledZ)
    : null;
  const payloadSpeed = [payloadVx, payloadVz].every((value) => value != null)
    ? Math.hypot(payloadVx, payloadVz)
    : null;
  const restLengthDelta = restLength == null || lineDistance == null
    ? null
    : Math.abs(restLength - lineDistance);
  const failures = [];
  if (tick == null || receiptTick == null || tick <= receiptTick) {
    failures.push('post-latch-distinct-tick');
  }
  if (serviceGeometry?.selectedComponentId !== 'receiver_collar') {
    failures.push('receiver-selection');
  }
  if (serviceGeometry?.tether?.active !== true
      || serviceGeometry?.tether?.targetMatches !== true) {
    failures.push('payload-tether-ownership');
  }
  if (serviceGeometry?.tether?.automaticBreakAllowed === true) {
    failures.push('nonbreaking-massline');
  }
  if (restLengthDelta == null || restLimit == null || restLengthDelta > restLimit + 1e-6) {
    failures.push('rest-length-match');
  }
  if (payloadDrift == null || driftLimit == null || payloadDrift > driftLimit + 1e-6) {
    failures.push('payload-drift');
  }
  if (payloadSpeed == null || speedLimit == null || payloadSpeed > speedLimit + 1e-6) {
    failures.push('payload-speed');
  }
  if (crossingPlan?.safe !== true) failures.push('crossing-plan-safe');
  if (crossingPlan?.shipRoute?.direct !== true
      || crossingPlan?.shipRoute?.waypoints?.length !== 1) {
    failures.push('short-direct-route');
  }
  if (playerCrossTrack == null || crossLimit == null
      || playerCrossTrack > crossLimit + 1e-6) {
    failures.push('player-cross-track');
  }
  if (predictedMiss == null || strictDeliveryRadius == null
      || Math.abs(predictedMiss) >= strictDeliveryRadius) {
    failures.push('receiver-miss-at-rest');
  }
  return {
    safe: failures.length === 0,
    failures,
    tick,
    latchTick: receiptTick,
    restLengthDelta,
    payloadDrift,
    payloadSpeed,
    playerCrossTrack,
    predictedReceiverMissAtRest: predictedMiss,
    strictDeliveryRadius,
    crossingPlanReason: crossingPlan?.reason || null,
  };
}

export function decidePq017PreReleaseStandoff(observation = {}, runtime = {}, {
  minimumPhysicalMargin = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
  maxTetherLength = SITE_TETHER_MAX_LENGTH,
  maxSettledSpeed = PQ017_RELEASED_DETOUR_SETTLED_SPEED,
  maxPayloadDrift = 1,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const player = observation.player || {};
  const payload = observation.payload || {};
  const playerX = finite(player.x);
  const playerZ = finite(player.z);
  const playerVx = finite(player.vx);
  const playerVz = finite(player.vz);
  const payloadX = finite(payload.x);
  const payloadZ = finite(payload.z);
  const payloadVx = finite(payload.vx);
  const payloadVz = finite(payload.vz);
  const playerRadius = finite(observation.playerRadius);
  const payloadRadius = finite(observation.payloadRadius);
  const restLength = finite(observation.tether?.restLength);
  const margin = finite(minimumPhysicalMargin);
  const tetherLimit = finite(maxTetherLength);
  const speedLimit = finite(maxSettledSpeed);
  const driftLimit = finite(maxPayloadDrift);
  const breakEvents = finite(observation.breakEvents);
  const impactEvents = finite(observation.impactEvents);
  const invalid = [
    playerX, playerZ, playerVx, playerVz,
    payloadX, payloadZ, payloadVx, payloadVz,
    playerRadius, payloadRadius, restLength,
    margin, tetherLimit, speedLimit, driftLimit, breakEvents, impactEvents,
  ].some((value) => value == null)
    || observation.payloadAlive !== true
    || playerRadius < 0 || payloadRadius < 0
    || restLength < 0 || margin <= 0 || tetherLimit <= 0
    || speedLimit < 0 || driftLimit < 0;
  if (invalid) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-observation-invalid',
      releaseAuthorized: false,
    };
  }
  if (observation.tether?.active !== true
      || observation.tether?.targetMatches !== true) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-tether-mismatch',
      releaseAuthorized: false,
    };
  }
  if (observation.tether?.automaticBreakAllowed === true) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-requires-nonbreaking-massline',
      releaseAuthorized: false,
    };
  }
  if (breakEvents !== 0) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-observed-break',
      releaseAuthorized: false,
    };
  }
  if (impactEvents !== 0) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-observed-world-site-impact',
      releaseAuthorized: false,
    };
  }
  const dx = playerX - payloadX;
  const dz = playerZ - payloadZ;
  const lineDistance = Math.hypot(dx, dz);
  if (!(lineDistance > 1e-6)) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-radial-invalid',
      releaseAuthorized: false,
    };
  }
  const physicalExclusion = playerRadius + payloadRadius;
  const minimumReleaseDistance = physicalExclusion + margin;
  const targetDistance = physicalExclusion + margin * 2;
  const payoutRestLength = targetDistance + margin;
  if (lineDistance + 1e-6 < minimumReleaseDistance
      && payoutRestLength > tetherLimit + 1e-6) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-exceeds-massline-length',
      releaseAuthorized: false,
      physicalExclusion,
      minimumReleaseDistance,
      targetDistance,
      payoutRestLength,
      maxTetherLength: tetherLimit,
    };
  }
  if (restLength > tetherLimit + 1e-6) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-rest-length-invalid',
      releaseAuthorized: false,
    };
  }
  const payloadAnchor = runtime.payloadAnchor
    && finite(runtime.payloadAnchor.x) != null
    && finite(runtime.payloadAnchor.z) != null
    ? { x: finite(runtime.payloadAnchor.x), z: finite(runtime.payloadAnchor.z) }
    : { x: payloadX, z: payloadZ };
  const payloadDrift = Math.hypot(payloadX - payloadAnchor.x, payloadZ - payloadAnchor.z);
  const playerSpeed = Math.hypot(playerVx, playerVz);
  const payloadSpeed = Math.hypot(payloadVx, payloadVz);
  const retainedSlack = restLength - lineDistance;
  const minimumRetainedSlack = margin * 0.5;
  const target = {
    x: payloadX + dx / lineDistance * targetDistance,
    z: payloadZ + dz / lineDistance * targetDistance,
  };
  const common = {
    safe: true,
    releaseAuthorized: false,
    physicalExclusion,
    minimumReleaseDistance,
    targetDistance,
    payoutRestLength,
    lineDistance,
    retainedSlack,
    minimumRetainedSlack,
    playerSpeed,
    payloadSpeed,
    payloadAnchor,
    payloadDrift,
    target,
  };
  if (payloadDrift > driftLimit + 1e-6) {
    return {
      ...common,
      safe: false,
      action: 'blocked',
      reason: 'pre-release-standoff-payload-drifted',
    };
  }
  if (lineDistance + 1e-6 < minimumReleaseDistance) {
    if (restLength + 1e-6 < payoutRestLength) {
      return { ...common, action: 'pay-out', reason: 'pre-release-standoff-needs-slack' };
    }
    if (retainedSlack + 1e-6 < minimumRetainedSlack) {
      return {
        ...common,
        safe: false,
        action: 'blocked',
        reason: 'pre-release-standoff-slack-reserve-lost',
      };
    }
    return { ...common, action: 'stage-outward', reason: 'pre-release-standoff-needs-distance' };
  }
  if (playerSpeed > speedLimit + 1e-6 || payloadSpeed > speedLimit + 1e-6) {
    return { ...common, action: 'settle', reason: 'pre-release-standoff-still-moving' };
  }
  return {
    ...common,
    action: 'ready-release',
    reason: 'pre-release-standoff-ready',
    releaseAuthorized: true,
  };
}

export function decidePq017AttachedStandoffRadialControl(
  observation = {},
  plan = {},
  runtime = {},
  {
    maxSettledSpeed = PQ017_RELEASED_DETOUR_SETTLED_SPEED,
    maxOutwardSpeed = 1,
    headingTolerance = 0.04,
    maxSettledYawRate = 0.1,
    requiredStableYawSamples = 2,
    maxPayloadDrift = 1,
    maxOutwardPulses = 120,
  } = {},
) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const player = observation.player || {};
  const payload = observation.payload || {};
  const tick = finite(observation.tick);
  const playerX = finite(player.x);
  const playerZ = finite(player.z);
  const playerVx = finite(player.vx);
  const playerVz = finite(player.vz);
  const playerRot = finite(player.rot);
  const playerAngVel = finite(player.angVel);
  const payloadX = finite(payload.x);
  const payloadZ = finite(payload.z);
  const directionX = finite(plan.direction?.x);
  const directionZ = finite(plan.direction?.z);
  const anchorX = finite(plan.payloadAnchor?.x);
  const anchorZ = finite(plan.payloadAnchor?.z);
  const targetX = finite(plan.target?.x);
  const targetZ = finite(plan.target?.z);
  const targetDistance = finite(plan.targetDistance);
  const minimumReleaseDistance = finite(plan.minimumReleaseDistance);
  const payoutRestLength = finite(plan.payoutRestLength);
  const corridorHalfWidth = finite(plan.corridorHalfWidth);
  const initialRadialDistance = finite(plan.initialRadialDistance);
  const maximumRadialRetreat = finite(plan.maximumRadialRetreat);
  const minimumRetainedSlack = finite(plan.minimumRetainedSlack);
  const maximumRadialDistance = finite(plan.maximumRadialDistance);
  const restLength = finite(observation.tether?.restLength);
  const breakEvents = finite(observation.breakEvents);
  const impactEvents = finite(observation.impactEvents);
  const speedLimit = finite(maxSettledSpeed);
  const outwardSpeedLimit = finite(maxOutwardSpeed);
  const baseYawTolerance = finite(headingTolerance);
  const yawRateLimit = finite(maxSettledYawRate);
  const stableYawSampleRequirement = Math.trunc(Number(requiredStableYawSamples));
  const payloadDriftLimit = finite(maxPayloadDrift);
  const pulseLimit = Math.max(1, Math.trunc(Number(maxOutwardPulses) || 0));
  const directionLength = directionX == null || directionZ == null
    ? null
    : Math.hypot(directionX, directionZ);
  const invalid = [
    tick, playerX, playerZ, playerVx, playerVz, playerRot, playerAngVel,
    payloadX, payloadZ, directionX, directionZ, anchorX, anchorZ,
    targetX, targetZ, targetDistance, minimumReleaseDistance,
    payoutRestLength, corridorHalfWidth, initialRadialDistance,
    maximumRadialRetreat, minimumRetainedSlack,
    maximumRadialDistance, restLength,
    breakEvents, impactEvents, speedLimit, outwardSpeedLimit,
    baseYawTolerance, yawRateLimit, payloadDriftLimit, directionLength,
  ].some((value) => value == null)
    || observation.payloadAlive !== true
    || targetDistance <= 0 || minimumReleaseDistance <= 0
    || payoutRestLength <= targetDistance || corridorHalfWidth <= 0
    || initialRadialDistance <= 0 || maximumRadialRetreat < 0
    || minimumRetainedSlack <= 0
    || maximumRadialDistance < targetDistance
    || maximumRadialDistance > payoutRestLength - minimumRetainedSlack + 1e-6
    || restLength < 0 || speedLimit < 0 || outwardSpeedLimit <= speedLimit
    || baseYawTolerance <= 0 || yawRateLimit <= 0
    || !Number.isFinite(stableYawSampleRequirement) || stableYawSampleRequirement < 1
    || payloadDriftLimit < 0
    || Math.abs(directionLength - 1) > 1e-6
    || Math.hypot(
      targetX - (anchorX + directionX * targetDistance),
      targetZ - (anchorZ + directionZ * targetDistance),
    ) > 1e-4;
  const blocked = (reason, extra = {}) => ({
    ...extra,
    safe: false,
    action: 'blocked',
    reason,
    releaseAuthorized: false,
    forward: false,
    reverse: false,
    turnDirection: 0,
    waitFixedTicks: 0,
  });
  if (invalid) return blocked('attached-standoff-observation-invalid');
  if (observation.tether?.active !== true
      || observation.tether?.targetMatches !== true) {
    return blocked('attached-standoff-tether-mismatch');
  }
  if (observation.tether?.automaticBreakAllowed === true) {
    return blocked('attached-standoff-requires-nonbreaking-massline');
  }
  if (breakEvents !== 0) return blocked('attached-standoff-observed-break');
  if (impactEvents !== 0) {
    return blocked('attached-standoff-observed-world-site-impact');
  }
  if (restLength + 1e-6 < payoutRestLength) {
    return blocked('attached-standoff-slack-not-prepared');
  }
  const lastTick = finite(runtime.lastTick);
  if (lastTick != null && tick <= lastTick) {
    return {
      ...runtime,
      safe: true,
      action: 'wait',
      reason: tick === lastTick
        ? 'duplicate-simulation-tick'
        : 'stale-simulation-tick',
      releaseAuthorized: false,
      forward: false,
      reverse: false,
      turnDirection: 0,
      waitFixedTicks: 1,
    };
  }
  const relativeX = playerX - anchorX;
  const relativeZ = playerZ - anchorZ;
  const radialDistance = relativeX * directionX + relativeZ * directionZ;
  const signedCrossTrack = relativeX * directionZ - relativeZ * directionX;
  const crossTrack = Math.abs(signedCrossTrack);
  const lineDistance = Math.hypot(playerX - payloadX, playerZ - payloadZ);
  const retainedSlack = restLength - lineDistance;
  const payloadDrift = Math.hypot(payloadX - anchorX, payloadZ - anchorZ);
  const speed = Math.hypot(playerVx, playerVz);
  const radialSpeed = playerVx * directionX + playerVz * directionZ;
  const crossSpeed = Math.abs(playerVx * directionZ - playerVz * directionX);
  const liveHeadingGeometry = derivePq017StandoffHeadingTolerance({
    targetDistance,
    radialDistance,
    corridorHalfWidth,
    usableCorridor: corridorHalfWidth * 0.75,
    crossTrack,
    minimumTolerance: baseYawTolerance,
    maximumTolerance: 0.2,
  });
  if (!liveHeadingGeometry) {
    return blocked('attached-standoff-heading-geometry-invalid');
  }
  const yawTolerance = liveHeadingGeometry.headingTolerance;
  let headingError = Math.atan2(directionZ, directionX) - playerRot;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;
  const lastPlayerRot = finite(runtime.lastPlayerRot);
  const tickDelta = lastTick == null ? null : tick - lastTick;
  let yawDelta = lastPlayerRot == null || tickDelta == null || tickDelta <= 0
    ? null
    : playerRot - lastPlayerRot;
  if (yawDelta != null) {
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  }
  const sampledYawRate = yawDelta == null
    ? null
    : yawDelta / (tickDelta / 60);
  const measuredYawRate = sampledYawRate != null
      && Math.abs(sampledYawRate) > Math.abs(playerAngVel)
    ? sampledYawRate
    : playerAngVel;
  const liveYawRateStable = Math.abs(playerAngVel) <= yawRateLimit + 1e-6;
  const sampledYawRateStable = sampledYawRate == null
    || Math.abs(sampledYawRate) <= yawRateLimit + 1e-6;
  const yawRateStable = liveYawRateStable && sampledYawRateStable;
  const absoluteHeadingError = Math.abs(headingError);
  const projectedLateralBurn = crossTrack
    + liveHeadingGeometry.remainingDistance * Math.tan(absoluteHeadingError);
  const headingStable = absoluteHeadingError <= yawTolerance
    && projectedLateralBurn <= corridorHalfWidth * 0.75 + 1e-6;
  const priorYawNeutralArmed = runtime.yawNeutralArmed === true;
  const priorStableYawSamples = Math.max(
    0,
    Math.trunc(Number(runtime.stableYawSamples) || 0),
  );
  const yawNeutralArmed = headingStable && yawRateStable;
  const stableYawSamples = yawNeutralArmed && priorYawNeutralArmed
    ? priorStableYawSamples + 1
    : 0;
  const outwardPulses = Math.max(0, Math.trunc(Number(runtime.outwardPulses) || 0));
  const attachedRadialBrakePulses = Math.max(
    0,
    Math.trunc(Number(runtime.attachedRadialBrakePulses) || 0),
  );
  const attachedRadialBrakeNeutralLatched = runtime.attachedRadialBrakeNeutralLatched === true
    || attachedRadialBrakePulses >= 1;
  const lastPulseRadialDistance = finite(runtime.lastPulseRadialDistance);
  const awaitingOutwardProgress = runtime.awaitingOutwardProgress === true;
  const measuredOutwardProgress = awaitingOutwardProgress
    && lastPulseRadialDistance != null
    && (radialDistance > lastPulseRadialDistance + 1e-4 || radialSpeed > 1e-4);
  const outwardProgressObserved = runtime.outwardProgressObserved === true
    || measuredOutwardProgress;
  const farthestRadialDistance = Math.max(
    initialRadialDistance,
    finite(runtime.farthestRadialDistance) ?? initialRadialDistance,
    radialDistance,
  );
  const common = {
    safe: true,
    releaseAuthorized: false,
    forward: false,
    reverse: false,
    turnDirection: 0,
    waitFixedTicks: 1,
    lastTick: tick,
    lastPlayerRot: playerRot,
    playerAngVel,
    yawDelta,
    sampledYawRate,
    measuredYawRate,
    liveYawRateStable,
    sampledYawRateStable,
    yawRateStable,
    yawNeutralArmed,
    stableYawSamples,
    outwardPulses,
    attachedRadialBrakePulses,
    attachedRadialBrakeNeutralLatched,
    lastPulseRadialDistance,
    awaitingOutwardProgress: awaitingOutwardProgress && !measuredOutwardProgress,
    outwardProgressObserved,
    farthestRadialDistance,
    radialDistance,
    signedCrossTrack,
    crossTrack,
    lineDistance,
    retainedSlack,
    payloadDrift,
    speed,
    radialSpeed,
    crossSpeed,
    headingError,
    absoluteHeadingError,
    headingTolerance: yawTolerance,
    remainingDistance: liveHeadingGeometry.remainingDistance,
    projectedLateralBurn,
  };
  if (crossTrack > corridorHalfWidth + 1e-6) {
    return blocked('attached-standoff-left-radial-corridor', common);
  }
  if (payloadDrift > payloadDriftLimit + 1e-6) {
    return blocked('attached-standoff-payload-drifted', common);
  }
  if (radialDistance > maximumRadialDistance + 1e-6) {
    return blocked('attached-standoff-left-proven-radial-endpoint', common);
  }
  if (radialDistance < initialRadialDistance - maximumRadialRetreat - 1e-6) {
    return blocked('attached-standoff-retreated-inside-corridor-origin', common);
  }
  if (radialDistance < farthestRadialDistance - maximumRadialRetreat - 1e-6) {
    return blocked('attached-standoff-reversed-radial-progress', common);
  }
  if (retainedSlack + 1e-6 < minimumRetainedSlack) {
    return blocked('attached-standoff-slack-lost', common);
  }
  if (awaitingOutwardProgress && !measuredOutwardProgress) {
    return blocked('attached-standoff-outward-pulse-made-no-progress', common);
  }
  if (outwardPulses > 0
      && outwardProgressObserved
      && radialSpeed > speedLimit + 1e-6
      && headingStable
      && yawRateStable
      && attachedRadialBrakePulses < 1
      && !attachedRadialBrakeNeutralLatched) {
    return {
      ...common,
      action: 'brake-outward',
      reason: 'attached-standoff-batched-outward-speed-brake',
      reverse: true,
      waitFixedTicks: 0,
    };
  }
  if (radialDistance >= targetDistance) {
    if (speed <= speedLimit + 1e-6
        && lineDistance + 1e-6 >= minimumReleaseDistance) {
      return {
        ...common,
        action: 'ready-release',
        reason: 'attached-standoff-ready',
        releaseAuthorized: true,
        waitFixedTicks: 0,
      };
    }
    return { ...common, action: 'coast', reason: 'attached-standoff-final-coast' };
  }
  const finalApproachDistance = targetDistance - Math.max(0.25, speedLimit);
  if (radialDistance >= finalApproachDistance && speed > speedLimit + 1e-6) {
    return { ...common, action: 'coast', reason: 'attached-standoff-final-coast' };
  }
  if (speed > speedLimit + 1e-6
      || radialSpeed > outwardSpeedLimit + 1e-6
      || crossSpeed > speedLimit + 1e-6) {
    return { ...common, action: 'coast', reason: 'attached-standoff-neutral-settle' };
  }
  if (!liveYawRateStable) {
    return {
      ...common,
      action: 'settle-yaw',
      reason: 'attached-standoff-yaw-rate-settle',
      yawNeutralArmed: false,
      stableYawSamples: 0,
    };
  }
  if (absoluteHeadingError > yawTolerance
      || projectedLateralBurn > corridorHalfWidth * 0.75 + 1e-6) {
    return {
      ...common,
      action: 'align',
      reason: 'attached-standoff-yaw-only-align',
      turnDirection: headingError > 0 ? 1 : -1,
      yawNeutralArmed: false,
      stableYawSamples: 0,
    };
  }
  if (!sampledYawRateStable) {
    return {
      ...common,
      action: 'settle-yaw',
      reason: 'attached-standoff-yaw-history-settle',
      yawNeutralArmed: false,
      stableYawSamples: 0,
    };
  }
  if (!priorYawNeutralArmed) {
    return {
      ...common,
      action: 'settle-yaw',
      reason: 'attached-standoff-yaw-neutral-arming',
    };
  }
  if (stableYawSamples < stableYawSampleRequirement) {
    return {
      ...common,
      action: 'settle-yaw',
      reason: 'attached-standoff-yaw-stability-confirming',
    };
  }
  if (outwardPulses >= pulseLimit) {
    return blocked('attached-standoff-pulse-budget-exhausted', common);
  }
  return {
    ...common,
    action: 'pulse-outward',
    reason: 'attached-standoff-low-speed-outward-pulse',
    forward: true,
    outwardPulses: outwardPulses + 1,
    lastPulseRadialDistance: radialDistance,
    awaitingOutwardProgress: true,
  };
}

export function decidePq017AttachedStandoffReplan(
  control = {},
  plan = {},
  runtime = {},
  {
    maximumReplans = 3,
    replanThreshold = Number(plan.maximumRadialRetreat) * 0.75,
    projectedTickCap = 30,
  } = {},
) {
  if (control.safe !== true || control.action === 'blocked') {
    return {
      action: 'defer-to-hard-gate',
      reason: 'attached-standoff-hard-gate-has-priority',
    };
  }
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const radialDistance = finite(control.radialDistance);
  const farthestRadialDistance = finite(control.farthestRadialDistance);
  const radialSpeed = finite(control.radialSpeed);
  const currentTick = finite(control.lastTick);
  const previousTick = finite(runtime.lastTick);
  const maximumRadialRetreat = finite(plan.maximumRadialRetreat);
  const threshold = finite(replanThreshold);
  const replanLimit = Math.max(1, Math.trunc(Number(maximumReplans) || 0));
  const radialReplans = Math.max(0, Math.trunc(Number(runtime.radialReplans) || 0));
  const tickCap = Math.max(1, Math.trunc(Number(projectedTickCap) || 0));
  if ([radialDistance, farthestRadialDistance, radialSpeed, currentTick,
    maximumRadialRetreat, threshold].some((value) => value == null)
      || maximumRadialRetreat <= 0 || threshold <= 0
      || threshold >= maximumRadialRetreat) {
    return {
      action: 'blocked',
      reason: 'attached-standoff-replan-observation-invalid',
      radialReplans,
    };
  }
  const recentTickDelta = previousTick == null
    ? 1
    : Math.max(1, Math.min(tickCap, Math.trunc(currentTick - previousTick)));
  const radialRetreat = Math.max(0, farthestRadialDistance - radialDistance);
  const projectedRadialRetreat = radialRetreat
    + Math.max(0, -radialSpeed) * (recentTickDelta / 60);
  const common = {
    radialReplans,
    maximumReplans: replanLimit,
    radialRetreat,
    projectedRadialRetreat,
    replanThreshold: threshold,
    maximumRadialRetreat,
    recentTickDelta,
  };
  if (Math.max(0, Math.trunc(Number(control.outwardPulses) || 0)) > 0
      || control.action === 'ready-release'
      || projectedRadialRetreat < threshold - 1e-6) {
    return {
      ...common,
      action: 'proceed',
      reason: 'attached-standoff-replan-not-required',
    };
  }
  if (radialReplans >= replanLimit) {
    return {
      ...common,
      action: 'blocked',
      reason: 'attached-standoff-replan-budget-exhausted',
    };
  }
  return {
    ...common,
    action: 'replan',
    reason: 'attached-standoff-pre-w-retreat-forecast',
    nextRadialReplans: radialReplans + 1,
  };
}

export function decidePq017ReceiverTowTarget(observation = {}, servicePlan = {}, runtime = {}, {
  maxTakeUpCycles = 6,
  settledSlackSamples = 2,
} = {}) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const tick = finite(observation.tick);
  const payloadDistance = finite(observation.payloadDistance);
  const lineDistance = finite(observation.lineDistance);
  const playerSpeed = finite(observation.playerSpeed);
  const tether = observation.tether || null;
  const restLength = finite(tether?.restLength);
  const serviceTarget = servicePlan.target || null;
  const takeUpTarget = servicePlan.takeUpTarget || null;
  const arrivalRadius = finite(servicePlan.arrivalRadius);
  const takeUpArrivalRadius = finite(servicePlan.takeUpArrivalRadius);
  const deliveryRadius = finite(servicePlan.deliveryRadius);
  const takeUpDistance = Number.isFinite(Number(observation.takeUpDistance))
    ? Number(observation.takeUpDistance)
    : null;
  const cycles = Math.max(0, Math.trunc(Number(runtime.takeUpCycles) || 0));
  const priorSettledSamples = Math.max(
    0,
    Math.trunc(Number(runtime.settledSlackSamples) || 0),
  );
  const lastTick = finite(runtime.lastTick);
  const cycleLimit = Math.max(0, Math.trunc(Number(maxTakeUpCycles) || 0));
  const settledSampleLimit = Math.max(1, Math.trunc(Number(settledSlackSamples) || 0));
  const invalid = [tick, payloadDistance, lineDistance, playerSpeed, restLength,
    arrivalRadius, takeUpArrivalRadius, deliveryRadius, takeUpDistance]
    .some((value) => value == null)
    || !serviceTarget || !takeUpTarget
    || servicePlan.safe !== true
    || servicePlan.serviceChord?.safe !== true
    || servicePlan.takeUpChord?.safe !== true
    || tether?.active !== true
    || observation.tetherTargetMatches !== true;
  if (invalid) {
    return {
      safe: false,
      reason: 'adaptive-tow-observation-invalid',
      target: null,
      arrivalRadius: 0,
      takeUpActive: false,
      takeUpCycles: cycles,
      settledSlackSamples: priorSettledSamples,
      lastTick,
    };
  }
  const distinctTick = lastTick == null || tick > lastTick;
  if (!distinctTick) {
    const takeUpActive = runtime.takeUpActive === true;
    return {
      safe: true,
      reason: tick === lastTick ? 'duplicate-simulation-tick' : 'stale-simulation-tick',
      target: takeUpActive ? takeUpTarget : serviceTarget,
      arrivalRadius: takeUpActive ? takeUpArrivalRadius : arrivalRadius,
      takeUpActive,
      takeUpCycles: cycles,
      settledSlackSamples: priorSettledSamples,
      lastTick,
      payloadAccepted: runtime.payloadAccepted === true,
      slack: runtime.slack === true,
      lineDistance,
      restLength,
    };
  }
  const payloadAccepted = payloadDistance <= deliveryRadius;
  const phaseSlack = tether.phase === 'slack'
    && (finite(tether.strain) ?? 0) <= 0.001
    && (finite(tether.load) ?? 0) <= 0.001;
  const geometrySlack = lineDistance < restLength - 0.1;
  const slack = phaseSlack || geometrySlack;
  let takeUpActive = runtime.takeUpActive === true;
  let takeUpCycles = cycles;
  let slackSettled = priorSettledSamples;
  let reason = null;
  if (payloadAccepted) {
    takeUpActive = false;
    slackSettled = 0;
    reason = 'payload-within-delivery-acceptance';
  } else if (!slack) {
    takeUpActive = false;
    slackSettled = 0;
    reason = 'tether-taut-service-convergence';
  } else {
    if (!takeUpActive) {
      takeUpCycles += 1;
      if (takeUpCycles > cycleLimit) {
        return {
          safe: false,
          reason: 'adaptive-tow-cycle-budget-exhausted',
          target: null,
          arrivalRadius: 0,
          takeUpActive: false,
          takeUpCycles,
          settledSlackSamples: 0,
          lastTick: tick,
        };
      }
      takeUpActive = true;
      slackSettled = 0;
    }
    const settledAtTakeUp = takeUpDistance <= takeUpArrivalRadius
      && playerSpeed <= 4;
    slackSettled = settledAtTakeUp && distinctTick ? slackSettled + 1 : 0;
    if (slackSettled >= settledSampleLimit) {
      return {
        safe: false,
        reason: 'adaptive-tow-take-up-envelope-still-slack',
        target: null,
        arrivalRadius: 0,
        takeUpActive: true,
        takeUpCycles,
        settledSlackSamples: slackSettled,
        lastTick: tick,
      };
    }
    reason = 'tether-slack-take-up';
  }
  return {
    safe: true,
    reason,
    target: takeUpActive ? takeUpTarget : serviceTarget,
    arrivalRadius: takeUpActive ? takeUpArrivalRadius : arrivalRadius,
    takeUpActive,
    takeUpCycles,
    settledSlackSamples: slackSettled,
    lastTick: tick,
    payloadAccepted,
    slack,
    lineDistance,
    restLength,
  };
}

export function derivePq017RingPassThroughProof(outgoingSegmentClearance, {
  baseRadius = PQ017_RING_PASS_THROUGH_BASE_RADIUS,
  maxRadius = PQ017_RING_PASS_THROUGH_MAX_RADIUS,
  plannerMargin = PQ017_ROUTE_PLANNER_MARGIN,
  minimumPhysicalMargin = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
  maxPassThroughSpeed = PQ017_TOW_PASS_THROUGH_SPEED_CAP,
  brakeAccel = SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
  sampleMs = SITE_ARRIVAL_SAMPLE_MS,
} = {}) {
  const clearance = Number(outgoingSegmentClearance);
  const unbounded = outgoingSegmentClearance === Infinity;
  const baseline = Math.max(0, Number(baseRadius) || 0);
  const cap = Math.max(baseline, Number(maxRadius) || 0);
  const plannedMargin = Math.max(0, Number(plannerMargin) || 0);
  const requiredMargin = Math.max(0, Number(minimumPhysicalMargin) || 0);
  const speedCap = Math.max(0, Number(maxPassThroughSpeed) || 0);
  const conservativeBrakeAccel = Math.max(1, Number(brakeAccel) || 0);
  const sampleSeconds = Math.max(0, Number(sampleMs) || 0) / 1000;
  const stoppingDistance = (speedCap * speedCap) / (2 * conservativeBrakeAccel);
  const samplingDistance = speedCap * sampleSeconds;
  const requiredDynamicClearance = requiredMargin + stoppingDistance + samplingDistance;
  if ((!Number.isFinite(clearance) && !unbounded) || (!unbounded && clearance <= 0)) {
    return {
      safe: false,
      reason: 'outgoing-segment-not-clear',
      radius: 0,
      outgoingSegmentClearance: Number.isFinite(clearance) ? clearance : null,
      residualPhysicalClearance: null,
      minimumPhysicalMargin: requiredMargin,
      requiredDynamicClearance,
    };
  }
  const maximumSafeRadius = unbounded
    ? cap
    : plannedMargin + clearance - requiredDynamicClearance;
  const radius = Math.min(cap, maximumSafeRadius);
  const residualPhysicalClearance = unbounded
    ? Infinity
    : plannedMargin + clearance - radius;
  const safe = radius >= baseline
    && (unbounded || residualPhysicalClearance >= requiredDynamicClearance - 1e-9);
  return {
    safe,
    reason: safe ? null : 'insufficient-residual-clearance',
    radius: safe ? radius : 0,
    outgoingSegmentClearance: unbounded ? null : clearance,
    residualPhysicalClearance: unbounded ? null : residualPhysicalClearance,
    minimumPhysicalMargin: requiredMargin,
    requiredDynamicClearance,
  };
}

function pq017EffectiveRouteObstacleRadius(obstacle) {
  const radius = Math.max(0, Number(obstacle?.radius) || 0);
  if (obstacle?.allowEscapeFromOverlap === true) return radius;
  return obstacle?.collides === false ? 0 : radius;
}

export function auditPq017RouteSweep(startPosition, endPosition, obstacles = [], playerRadius = 0, {
  requiredClearance = 0,
  escapeContexts = null,
  escapeWobble = 0.1,
  escapePropulsionNeutral = false,
  allowAdvisoryMarginEgress = false,
} = {}) {
  const ax = Number(startPosition?.x);
  const az = Number(startPosition?.z);
  const bx = Number(endPosition?.x);
  const bz = Number(endPosition?.z);
  if (![ax, az, bx, bz].every(Number.isFinite)) {
    return { safe: false, reason: 'segment-invalid', closestConstraint: null };
  }
  const shipRadius = Math.max(0, Number(playerRadius) || 0);
  const margin = Math.max(0, Number(requiredClearance) || 0);
  const wobble = Math.max(0, Number(escapeWobble) || 0);
  let closestConstraint = null;
  const advisoryEgresses = [];
  const escapeProgress = [];
  for (const obstacle of Array.isArray(obstacles) ? obstacles : []) {
    if (obstacle?.collides === false && obstacle?.allowEscapeFromOverlap !== true) continue;
    const ox = Number(obstacle?.x);
    const oz = Number(obstacle?.z);
    if (!Number.isFinite(ox) || !Number.isFinite(oz)) continue;
    const obstacleRadius = pq017EffectiveRouteObstacleRadius(obstacle);
    const obstacleKey = pq017EscapeObstacleKey(obstacle);
    const scopedContext = escapeContexts && obstacleKey != null
      ? escapeContexts[obstacleKey]
      : null;
    const armedCorridorRadius = scopedContext?.corridorArmed === true
      ? Math.max(0, Number(scopedContext.corridorRadius) || 0)
      : 0;
    const exclusionRadius = Math.max(
      obstacleRadius + shipRadius + margin,
      armedCorridorRadius,
    );
    const physicalExclusionRadius = obstacleRadius + shipRadius;
    const advisoryExclusionRadius = physicalExclusionRadius + margin;
    const startDistance = Math.hypot(ax - ox, az - oz);
    const endDistance = Math.hypot(bx - ox, bz - oz);
    const segmentX = bx - ax;
    const segmentZ = bz - az;
    const localEscapeVector = (ax - ox) * segmentX + (az - oz) * segmentZ;
    const localOutwardProgress = localEscapeVector / Math.max(startDistance, 1e-9);
    const locallyOutward = endDistance > startDistance + 1e-6
      && localOutwardProgress > 1e-6;
    const advisoryOutwardProgress = (
      (ax - ox) * segmentX + (az - oz) * segmentZ
    ) / Math.max(startDistance, 1e-9);
    const advisoryMarginOnly = armedCorridorRadius <= advisoryExclusionRadius + 1e-9;
    const advisoryMarginEgress = allowAdvisoryMarginEgress === true
      && margin > 0
      && advisoryMarginOnly
      && startDistance > physicalExclusionRadius
      && startDistance <= advisoryExclusionRadius
      && endDistance > advisoryExclusionRadius
      && endDistance > startDistance
      && advisoryOutwardProgress > 1e-6;
    if (advisoryMarginEgress) {
      advisoryEgresses.push({
        entityId: obstacle?.entityId ?? null,
        type: obstacle?.type || null,
        fieldId: obstacle?.fieldId || null,
        physicalExclusionRadius,
        advisoryExclusionRadius,
        startDistance,
        endDistance,
        outwardProgress: advisoryOutwardProgress,
        physicalClearance: startDistance - physicalExclusionRadius,
        advisoryClearance: startDistance - advisoryExclusionRadius,
      });
      continue;
    }
    const scopedOriginX = Number(scopedContext?.origin?.x);
    const scopedOriginZ = Number(scopedContext?.origin?.z);
    const scopedOriginValid = scopedContext?.active === true
      && Number.isFinite(scopedOriginX) && Number.isFinite(scopedOriginZ);
    const escapeOriginX = scopedOriginValid ? scopedOriginX : ax;
    const escapeOriginZ = scopedOriginValid ? scopedOriginZ : az;
    const escapeOriginDistance = Math.hypot(escapeOriginX - ox, escapeOriginZ - oz);
    const startOriginDisplacement = Math.hypot(ax - escapeOriginX, az - escapeOriginZ);
    const endOriginDisplacement = Math.hypot(bx - escapeOriginX, bz - escapeOriginZ);
    const escapeVector = (escapeOriginX - ox) * (bx - escapeOriginX)
      + (escapeOriginZ - oz) * (bz - escapeOriginZ);
    const outwardProgress = escapeVector / Math.max(escapeOriginDistance, 1e-9);
    const scopedProgress = !scopedOriginValid
      || endDistance + wobble >= Math.max(
        escapeOriginDistance,
        Number(scopedContext.farthestDistance) || escapeOriginDistance,
      );
    const escapeAuthorized = obstacle?.allowEscapeFromOverlap === true
      && scopedOriginValid;
    const contextPhase = scopedContext?.phase || null;
    const neutralTurnPocketRadius = Math.max(
      0,
      Number(scopedContext?.neutralTurnPocketRadius) || 0,
    );
    const neutralTurnEscape = escapeAuthorized
      && contextPhase === 'neutral-turn'
      && escapePropulsionNeutral === true
      && escapeOriginDistance <= exclusionRadius
      && startOriginDisplacement <= neutralTurnPocketRadius + 1e-9
      && endOriginDisplacement <= neutralTurnPocketRadius + 1e-9;
    const outwardRecoveryStart = escapeAuthorized
      && contextPhase === 'neutral-turn'
      && escapePropulsionNeutral !== true
      && escapeOriginDistance <= exclusionRadius
      && locallyOutward;
    const outwardRecovery = escapeAuthorized
      && contextPhase === 'outward-recovery'
      && escapeOriginDistance <= exclusionRadius
      && locallyOutward;
    const outwardEscape = escapeAuthorized && contextPhase == null
      && escapeOriginDistance <= exclusionRadius
      && endDistance > escapeOriginDistance && outwardProgress > 1e-6 && scopedProgress;
    const neutralOriginWobble = escapeAuthorized
      && contextPhase == null
      && escapePropulsionNeutral === true
      && escapeOriginDistance <= exclusionRadius
      && startOriginDisplacement <= wobble
      && endOriginDisplacement <= wobble
      && endDistance + wobble >= escapeOriginDistance
      && scopedProgress;
    if (neutralTurnEscape || outwardRecoveryStart || outwardRecovery
        || outwardEscape || neutralOriginWobble) {
      if (outwardRecoveryStart) {
        escapeProgress.push({
          obstacleKey,
          action: 'enter-outward-recovery',
        });
      }
      continue;
    }
    const clearance = pointSegmentDistance(ox, oz, ax, az, bx, bz) - exclusionRadius;
    if (!closestConstraint || clearance < closestConstraint.clearance) {
      closestConstraint = {
        entityId: obstacle?.entityId ?? null,
        type: obstacle?.type || null,
        fieldId: obstacle?.fieldId || null,
        clearance,
        exclusionRadius,
      };
    }
  }
  if (closestConstraint && closestConstraint.clearance <= 0) {
    const result = {
      safe: false,
      reason: 'segment-blocked',
      closestConstraint,
    };
    if (allowAdvisoryMarginEgress === true) result.advisoryEgresses = advisoryEgresses;
    if (escapeProgress.length) result.escapeProgress = escapeProgress;
    return result;
  }
  const result = { safe: true, reason: null, closestConstraint };
  if (allowAdvisoryMarginEgress === true) result.advisoryEgresses = advisoryEgresses;
  if (escapeProgress.length) result.escapeProgress = escapeProgress;
  return result;
}

export function evaluatePq017StandoffPreflight(
  plan = {},
  obstacles = [],
  playerRadius = 0,
  {
    requiredClearance = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
  } = {},
) {
  const collidingObstacles = (Array.isArray(obstacles) ? obstacles : [])
    .filter((obstacle) => obstacle?.collides !== false);
  const staticObstacles = collidingObstacles.filter((obstacle) => obstacle?.type !== 'ship');
  const trafficObstacles = collidingObstacles.filter((obstacle) => obstacle?.type === 'ship');
  const staticPhysicalSweep = auditPq017RouteSweep(
    plan.start,
    plan.proofEndpoint,
    staticObstacles,
    playerRadius,
    { requiredClearance: 0 },
  );
  if (!staticPhysicalSweep.safe) {
    return {
      ...staticPhysicalSweep,
      action: 'blocked-static',
      reason: 'standoff-static-route-blocked',
      staticPhysicalSweep,
      staticSweep: null,
      trafficSweep: null,
    };
  }
  const staticSweep = auditPq017RouteSweep(
    plan.start,
    plan.proofEndpoint,
    staticObstacles,
    playerRadius,
    { requiredClearance, allowAdvisoryMarginEgress: true },
  );
  if (!staticSweep.safe) {
    return {
      ...staticSweep,
      action: 'blocked-static',
      reason: 'standoff-static-route-blocked',
      staticPhysicalSweep,
      staticSweep,
      trafficSweep: null,
    };
  }
  const trafficSweep = auditPq017RouteSweep(
    plan.start,
    plan.proofEndpoint,
    trafficObstacles,
    playerRadius,
    { requiredClearance },
  );
  if (!trafficSweep.safe) {
    return {
      ...trafficSweep,
      action: 'wait-traffic',
      reason: 'standoff-moving-traffic-blocked',
      staticPhysicalSweep,
      staticSweep,
      trafficSweep,
    };
  }
  return {
    safe: true,
    action: 'clear',
    reason: 'standoff-route-clear',
    closestConstraint: trafficSweep.closestConstraint || staticSweep.closestConstraint,
    staticPhysicalSweep,
    staticSweep,
    trafficSweep,
  };
}

export function decidePq017StandoffTrafficWait(
  preflight = {},
  runtime = {},
  {
    currentTick = null,
    maxTrafficTicks = 360,
    requiredClearSamples = 3,
  } = {},
) {
  const tick = Number(currentTick);
  const previousTick = Number(runtime.lastTick);
  const startedTick = Number.isFinite(Number(runtime.startedTick))
    ? Number(runtime.startedTick)
    : tick;
  const elapsedTicks = Number.isFinite(tick) && Number.isFinite(startedTick)
    ? Math.max(0, tick - startedTick)
    : null;
  const clearSamples = Math.max(0, Math.trunc(Number(runtime.clearSamples) || 0));
  const trafficLimit = Math.max(0, Math.trunc(Number(maxTrafficTicks) || 0));
  const clearLimit = Math.max(1, Math.trunc(Number(requiredClearSamples) || 0));
  if (!Number.isFinite(tick) || !Number.isFinite(startedTick) || elapsedTicks == null) {
    return {
      safe: false,
      action: 'blocked',
      reason: 'standoff-traffic-observation-invalid',
      startedTick: Number.isFinite(startedTick) ? startedTick : null,
      lastTick: Number.isFinite(previousTick) ? previousTick : null,
      elapsedTicks,
      clearSamples: 0,
    };
  }
  if (Number.isFinite(previousTick) && tick <= previousTick) {
    return {
      ...runtime,
      safe: true,
      action: 'wait',
      reason: tick === previousTick
        ? 'duplicate-simulation-tick'
        : 'stale-simulation-tick',
    };
  }
  const common = {
    startedTick,
    lastTick: tick,
    elapsedTicks,
  };
  if (preflight?.action === 'blocked-static') {
    return {
      ...common,
      safe: false,
      action: 'blocked',
      reason: 'standoff-static-route-blocked',
      clearSamples: 0,
    };
  }
  if (elapsedTicks > trafficLimit) {
    return {
      ...common,
      safe: false,
      action: 'blocked',
      reason: 'standoff-traffic-clearance-timeout',
      clearSamples: 0,
    };
  }
  if (preflight?.action === 'wait-traffic') {
    if (elapsedTicks >= trafficLimit) {
      return {
        ...common,
        safe: false,
        action: 'blocked',
        reason: 'standoff-traffic-clearance-timeout',
        clearSamples: 0,
      };
    }
    return {
      ...common,
      safe: true,
      action: 'wait',
      reason: 'standoff-moving-traffic-blocked',
      clearSamples: 0,
    };
  }
  if (preflight?.safe === true && preflight?.action === 'clear') {
    const nextClearSamples = clearSamples + 1;
    return {
      ...common,
      safe: true,
      action: nextClearSamples >= clearLimit ? 'proceed' : 'confirm-clear',
      reason: nextClearSamples >= clearLimit
        ? 'standoff-traffic-corridor-confirmed-clear'
        : 'standoff-traffic-corridor-clear-sample',
      clearSamples: nextClearSamples,
    };
  }
  return {
    ...common,
    safe: false,
    action: 'blocked',
    reason: 'standoff-preflight-invalid',
    clearSamples: 0,
  };
}

export function decidePq017StandoffNeutralSettlement(
  observation = {},
  runtime = {},
  {
    payloadAnchor = null,
    maxDistinctTicks = 120,
    requiredStableSamples = 2,
    maxSettledSpeed = PQ017_RELEASED_DETOUR_SETTLED_SPEED,
    minimumRetainedSlack = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN * 0.5,
    minimumAnchorLineDistance = 0,
    maxPlayerDrift = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
    maxPayloadDrift = 1,
  } = {},
) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const tick = finite(observation.tick);
  const playerX = finite(observation.player?.x);
  const playerZ = finite(observation.player?.z);
  const playerVx = finite(observation.player?.vx);
  const playerVz = finite(observation.player?.vz);
  const payloadX = finite(observation.payload?.x);
  const payloadZ = finite(observation.payload?.z);
  const payloadVx = finite(observation.payload?.vx);
  const payloadVz = finite(observation.payload?.vz);
  const restLength = finite(observation.tether?.restLength);
  const breakEvents = finite(observation.breakEvents);
  const impactEvents = finite(observation.impactEvents);
  const playerOrigin = runtime.playerOrigin
    && finite(runtime.playerOrigin.x) != null
    && finite(runtime.playerOrigin.z) != null
    ? { x: finite(runtime.playerOrigin.x), z: finite(runtime.playerOrigin.z) }
    : { x: playerX, z: playerZ };
  const fixedPayloadAnchor = payloadAnchor
    && finite(payloadAnchor.x) != null
    && finite(payloadAnchor.z) != null
    ? { x: finite(payloadAnchor.x), z: finite(payloadAnchor.z) }
    : runtime.payloadAnchor
      && finite(runtime.payloadAnchor.x) != null
      && finite(runtime.payloadAnchor.z) != null
      ? { x: finite(runtime.payloadAnchor.x), z: finite(runtime.payloadAnchor.z) }
      : { x: payloadX, z: payloadZ };
  const tickLimit = Math.max(1, Math.trunc(Number(maxDistinctTicks) || 0));
  const stableLimit = Math.max(1, Math.trunc(Number(requiredStableSamples) || 0));
  const speedLimit = finite(maxSettledSpeed);
  const slackLimit = finite(minimumRetainedSlack);
  const anchorLineDistanceLimit = finite(minimumAnchorLineDistance);
  const playerDriftLimit = finite(maxPlayerDrift);
  const payloadDriftLimit = finite(maxPayloadDrift);
  const invalid = [
    tick, playerX, playerZ, playerVx, playerVz,
    payloadX, payloadZ, payloadVx, payloadVz,
    restLength, breakEvents, impactEvents,
    playerOrigin.x, playerOrigin.z,
    fixedPayloadAnchor.x, fixedPayloadAnchor.z,
    speedLimit, slackLimit, anchorLineDistanceLimit, playerDriftLimit, payloadDriftLimit,
  ].some((value) => value == null)
    || observation.payloadAlive !== true
    || restLength < 0 || speedLimit < 0 || slackLimit < 0
    || anchorLineDistanceLimit < 0
    || playerDriftLimit < 0 || payloadDriftLimit < 0;
  const blockedDecision = (reason, extra = {}) => ({
    ...extra,
    safe: false,
    action: 'blocked',
    reason,
    playerOrigin,
    payloadAnchor: fixedPayloadAnchor,
    stableSamples: Math.max(0, Math.trunc(Number(runtime.stableSamples) || 0)),
    distinctTicks: Math.max(0, Math.trunc(Number(runtime.distinctTicks) || 0)),
    lastTick: tick,
  });
  if (invalid) return blockedDecision('standoff-neutral-observation-invalid');
  if (observation.tether?.active !== true
      || observation.tether?.targetMatches !== true) {
    return blockedDecision('standoff-neutral-tether-mismatch');
  }
  if (observation.tether?.automaticBreakAllowed === true) {
    return blockedDecision('standoff-neutral-requires-nonbreaking-massline');
  }
  if (breakEvents !== 0) return blockedDecision('standoff-neutral-observed-break');
  if (impactEvents !== 0) return blockedDecision('standoff-neutral-observed-world-site-impact');
  const previousTick = finite(runtime.lastTick);
  if (previousTick != null && tick <= previousTick) {
    return {
      ...runtime,
      safe: true,
      action: 'wait',
      reason: tick === previousTick
        ? 'duplicate-simulation-tick'
        : 'stale-simulation-tick',
    };
  }
  const playerDrift = Math.hypot(playerX - playerOrigin.x, playerZ - playerOrigin.z);
  const payloadDrift = Math.hypot(
    payloadX - fixedPayloadAnchor.x,
    payloadZ - fixedPayloadAnchor.z,
  );
  const lineDistance = Math.hypot(playerX - payloadX, playerZ - payloadZ);
  const anchorLineDistance = Math.hypot(
    playerX - fixedPayloadAnchor.x,
    playerZ - fixedPayloadAnchor.z,
  );
  const retainedSlack = restLength - lineDistance;
  const playerSpeed = Math.hypot(playerVx, playerVz);
  const payloadSpeed = Math.hypot(payloadVx, payloadVz);
  const distinctTicks = Math.max(0, Math.trunc(Number(runtime.distinctTicks) || 0))
    + (previousTick == null ? 0 : 1);
  const common = {
    playerOrigin,
    payloadAnchor: fixedPayloadAnchor,
    playerDrift,
    payloadDrift,
    lineDistance,
    anchorLineDistance,
    retainedSlack,
    playerSpeed,
    payloadSpeed,
    distinctTicks,
    lastTick: tick,
  };
  if (playerDrift > playerDriftLimit + 1e-6) {
    return blockedDecision('standoff-neutral-player-drift-exceeded', common);
  }
  if (payloadDrift > payloadDriftLimit + 1e-6) {
    return blockedDecision('standoff-neutral-payload-drift-exceeded', common);
  }
  if (anchorLineDistance + 1e-6 < anchorLineDistanceLimit) {
    return blockedDecision('standoff-neutral-anchor-retreat-exceeded', common);
  }
  if (retainedSlack + 1e-6 < slackLimit) {
    return blockedDecision('standoff-neutral-slack-lost', common);
  }
  const stable = playerSpeed <= speedLimit + 1e-6
    && payloadSpeed <= speedLimit + 1e-6;
  const stableSamples = previousTick == null
    ? 0
    : stable
      ? Math.max(0, Math.trunc(Number(runtime.stableSamples) || 0)) + 1
      : 0;
  if (stableSamples >= stableLimit) {
    return {
      ...common,
      safe: true,
      action: 'settled',
      reason: 'standoff-neutral-settled',
      stableSamples,
    };
  }
  if (distinctTicks >= tickLimit) {
    return blockedDecision('standoff-neutral-settlement-timeout', {
      ...common,
      stableSamples,
    });
  }
  return {
    ...common,
    safe: true,
    action: 'wait',
    reason: stable ? 'standoff-neutral-confirming-settlement' : 'standoff-neutral-still-moving',
    stableSamples,
  };
}

export function derivePq017StandoffHeadingTolerance({
  targetDistance,
  radialDistance,
  corridorHalfWidth = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN * 0.5,
  usableCorridor = 0.75,
  crossTrack = 0,
  minimumTolerance = 0.04,
  maximumTolerance = 0.2,
} = {}) {
  const target = Number(targetDistance);
  const radial = Number(radialDistance);
  const corridor = Number(corridorHalfWidth);
  const usable = Number(usableCorridor);
  const crossTrackDistance = Math.abs(Number(crossTrack));
  const minimum = Number(minimumTolerance);
  const maximum = Number(maximumTolerance);
  if (![target, radial, corridor, usable, crossTrackDistance, minimum, maximum]
    .every(Number.isFinite)
      || target <= 0 || radial <= 0 || corridor <= 0 || usable <= 0
      || minimum <= 0 || maximum < minimum) {
    return null;
  }
  const remainingDistance = Math.max(0, target - radial);
  const reservedLateralDistance = Math.max(
    0,
    Math.min(corridor, usable) - crossTrackDistance,
  );
  const geometryTolerance = remainingDistance > 1e-6
    ? Math.atan2(reservedLateralDistance, remainingDistance)
    : maximum;
  return {
    headingTolerance: Math.max(minimum, Math.min(maximum, geometryTolerance)),
    remainingDistance,
    reservedLateralDistance,
    corridorHalfWidth: corridor,
    crossTrack: crossTrackDistance,
  };
}

export function decidePq017StandoffYawAlignment(
  observation = {},
  runtime = {},
  {
    payloadAnchor = null,
    headingTolerance = 0.04,
    targetDistance = null,
    corridorHalfWidth = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN * 0.5,
    usableCorridor = 0.75,
    maximumHeadingTolerance = 0.2,
    minimumHeadingImprovement = 0.002,
    maxDistinctTicks = 120,
    maxStagnantTicks = 20,
    maxSettledSpeed = PQ017_RELEASED_DETOUR_SETTLED_SPEED,
    maxSettledYawRate = 0.1,
    minimumRetainedSlack = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN * 0.5,
    maxPlayerDrift = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
    maxPayloadDrift = 1,
  } = {},
) {
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const tick = finite(observation.tick);
  const playerX = finite(observation.player?.x);
  const playerZ = finite(observation.player?.z);
  const playerVx = finite(observation.player?.vx);
  const playerVz = finite(observation.player?.vz);
  const playerRot = finite(observation.player?.rot);
  const playerAngVel = finite(observation.player?.angVel);
  const payloadX = finite(observation.payload?.x);
  const payloadZ = finite(observation.payload?.z);
  const payloadVx = finite(observation.payload?.vx);
  const payloadVz = finite(observation.payload?.vz);
  const restLength = finite(observation.tether?.restLength);
  const breakEvents = finite(observation.breakEvents);
  const impactEvents = finite(observation.impactEvents);
  const fixedPayloadAnchor = payloadAnchor
    && finite(payloadAnchor.x) != null
    && finite(payloadAnchor.z) != null
    ? { x: finite(payloadAnchor.x), z: finite(payloadAnchor.z) }
    : runtime.payloadAnchor
      && finite(runtime.payloadAnchor.x) != null
      && finite(runtime.payloadAnchor.z) != null
      ? { x: finite(runtime.payloadAnchor.x), z: finite(runtime.payloadAnchor.z) }
      : { x: payloadX, z: payloadZ };
  const playerOrigin = runtime.playerOrigin
    && finite(runtime.playerOrigin.x) != null
    && finite(runtime.playerOrigin.z) != null
    ? { x: finite(runtime.playerOrigin.x), z: finite(runtime.playerOrigin.z) }
    : { x: playerX, z: playerZ };
  const yawTolerance = finite(headingTolerance);
  const targetDistanceValue = finite(targetDistance);
  const corridorHalfWidthValue = finite(corridorHalfWidth);
  const usableCorridorValue = finite(usableCorridor);
  const maximumYawTolerance = finite(maximumHeadingTolerance);
  const improvementThreshold = finite(minimumHeadingImprovement);
  const speedLimit = finite(maxSettledSpeed);
  const yawRateLimit = finite(maxSettledYawRate);
  const slackLimit = finite(minimumRetainedSlack);
  const playerDriftLimit = finite(maxPlayerDrift);
  const payloadDriftLimit = finite(maxPayloadDrift);
  const tickLimit = Math.max(1, Math.trunc(Number(maxDistinctTicks) || 0));
  const stagnationLimit = Math.max(1, Math.trunc(Number(maxStagnantTicks) || 0));
  const invalid = [
    tick, playerX, playerZ, playerVx, playerVz, playerRot, playerAngVel,
    payloadX, payloadZ, payloadVx, payloadVz,
    restLength, breakEvents, impactEvents,
    fixedPayloadAnchor.x, fixedPayloadAnchor.z,
    playerOrigin.x, playerOrigin.z,
    yawTolerance, improvementThreshold, speedLimit, yawRateLimit,
    slackLimit, playerDriftLimit, payloadDriftLimit,
  ].some((value) => value == null)
    || observation.payloadAlive !== true
    || restLength < 0 || yawTolerance <= 0 || improvementThreshold < 0
    || speedLimit < 0 || yawRateLimit <= 0 || slackLimit < 0
    || playerDriftLimit < 0 || payloadDriftLimit < 0
    || (targetDistanceValue != null && (
      corridorHalfWidthValue == null || usableCorridorValue == null
      || maximumYawTolerance == null || targetDistanceValue <= 0
      || corridorHalfWidthValue <= 0 || usableCorridorValue <= 0
      || maximumYawTolerance < yawTolerance
    ));
  const blockedDecision = (reason, extra = {}) => ({
    ...runtime,
    ...extra,
    safe: false,
    action: 'blocked',
    reason,
    turnDirection: 0,
    waitFixedTicks: 0,
    payloadAnchor: fixedPayloadAnchor,
    playerOrigin,
    lastTick: tick,
  });
  if (invalid) return blockedDecision('standoff-yaw-observation-invalid');
  if (observation.tether?.active !== true
      || observation.tether?.targetMatches !== true) {
    return blockedDecision('standoff-yaw-tether-mismatch');
  }
  if (observation.tether?.automaticBreakAllowed === true) {
    return blockedDecision('standoff-yaw-requires-nonbreaking-massline');
  }
  if (breakEvents !== 0) return blockedDecision('standoff-yaw-observed-break');
  if (impactEvents !== 0) return blockedDecision('standoff-yaw-observed-world-site-impact');
  const previousTick = finite(runtime.lastTick);
  if (previousTick != null && tick <= previousTick) {
    return {
      ...runtime,
      safe: true,
      action: 'wait',
      reason: tick === previousTick
        ? 'duplicate-simulation-tick'
        : 'stale-simulation-tick',
      turnDirection: 0,
      waitFixedTicks: 1,
    };
  }
  const outwardX = playerX - fixedPayloadAnchor.x;
  const outwardZ = playerZ - fixedPayloadAnchor.z;
  const anchorLineDistance = Math.hypot(outwardX, outwardZ);
  if (!(anchorLineDistance > 1e-6)) {
    return blockedDecision('standoff-yaw-radial-invalid');
  }
  const desiredHeading = Math.atan2(outwardZ, outwardX);
  let headingError = desiredHeading - playerRot;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;
  const absoluteHeadingError = Math.abs(headingError);
  const toleranceGeometry = targetDistanceValue == null
    ? null
    : derivePq017StandoffHeadingTolerance({
      targetDistance: targetDistanceValue,
      radialDistance: anchorLineDistance,
      corridorHalfWidth: corridorHalfWidthValue,
      usableCorridor: usableCorridorValue,
      minimumTolerance: yawTolerance,
      maximumTolerance: maximumYawTolerance,
    });
  if (targetDistanceValue != null && !toleranceGeometry) {
    return blockedDecision('standoff-yaw-tolerance-geometry-invalid');
  }
  const liveHeadingTolerance = toleranceGeometry?.headingTolerance ?? yawTolerance;
  const remainingDistance = toleranceGeometry?.remainingDistance ?? null;
  const projectedLateralBurn = remainingDistance == null
    ? null
    : remainingDistance * Math.tan(absoluteHeadingError);
  const lineDistance = Math.hypot(playerX - payloadX, playerZ - payloadZ);
  const retainedSlack = restLength - lineDistance;
  const playerSpeed = Math.hypot(playerVx, playerVz);
  const payloadSpeed = Math.hypot(payloadVx, payloadVz);
  const playerDrift = Math.hypot(playerX - playerOrigin.x, playerZ - playerOrigin.z);
  const payloadDrift = Math.hypot(
    payloadX - fixedPayloadAnchor.x,
    payloadZ - fixedPayloadAnchor.z,
  );
  const previousBest = finite(runtime.bestAbsoluteHeadingError);
  const improved = previousBest == null
    || absoluteHeadingError <= previousBest - improvementThreshold;
  const bestAbsoluteHeadingError = previousBest == null
    ? absoluteHeadingError
    : Math.min(previousBest, absoluteHeadingError);
  const distinctTicks = Math.max(0, Math.trunc(Number(runtime.distinctTicks) || 0))
    + (previousTick == null ? 0 : 1);
  const stagnantTicks = previousTick == null || improved
    ? 0
    : Math.max(0, Math.trunc(Number(runtime.stagnantTicks) || 0)) + 1;
  const common = {
    safe: true,
    payloadAnchor: fixedPayloadAnchor,
    playerOrigin,
    desiredHeading,
    headingError,
    absoluteHeadingError,
    headingTolerance: liveHeadingTolerance,
    remainingDistance,
    projectedLateralBurn,
    bestAbsoluteHeadingError,
    distinctTicks,
    stagnantTicks,
    anchorLineDistance,
    lineDistance,
    retainedSlack,
    playerSpeed,
    playerAngVel,
    liveYawRateStable: Math.abs(playerAngVel) <= yawRateLimit + 1e-6,
    payloadSpeed,
    playerDrift,
    maxPlayerDrift: playerDriftLimit,
    payloadDrift,
    lastTick: tick,
    waitFixedTicks: 1,
  };
  if (playerDrift > playerDriftLimit + 1e-6) {
    return blockedDecision('standoff-yaw-player-drift-exceeded', common);
  }
  if (payloadDrift > payloadDriftLimit + 1e-6) {
    return blockedDecision('standoff-yaw-payload-drift-exceeded', common);
  }
  if (retainedSlack + 1e-6 < slackLimit) {
    return blockedDecision('standoff-yaw-slack-lost', common);
  }
  if (playerSpeed > speedLimit + 1e-6 || payloadSpeed > speedLimit + 1e-6) {
    return blockedDecision('standoff-yaw-speed-exceeded', common);
  }
  if (!common.liveYawRateStable) {
    return {
      ...common,
      action: 'settle-yaw',
      reason: 'standoff-yaw-neutral-brake',
      turnDirection: 0,
    };
  }
  const lateralBurnWithinReserve = toleranceGeometry == null
    || projectedLateralBurn <= toleranceGeometry.reservedLateralDistance + 1e-6;
  if (absoluteHeadingError <= liveHeadingTolerance + 1e-6
      && lateralBurnWithinReserve) {
    return {
      ...common,
      action: 'aligned',
      reason: 'standoff-yaw-aligned',
      turnDirection: 0,
      waitFixedTicks: 0,
    };
  }
  if (distinctTicks >= tickLimit) {
    return blockedDecision('standoff-yaw-alignment-timeout', common);
  }
  if (stagnantTicks >= stagnationLimit) {
    return blockedDecision('standoff-yaw-alignment-stagnated', common);
  }
  return {
    ...common,
    action: 'align',
    reason: improved ? 'standoff-yaw-improving' : 'standoff-yaw-awaiting-progress',
    turnDirection: headingError > 0 ? 1 : -1,
  };
}

export function decidePq017PrePlanYawReanchor(
  alignment = {},
  preflight = {},
  runtime = {},
  {
    maximumReanchors = 1,
    reanchorThreshold = Number(alignment.maxPlayerDrift) * 0.75,
    projectedTickCap = 30,
  } = {},
) {
  if (alignment.safe !== true || alignment.action === 'blocked') {
    return {
      action: 'defer-to-hard-gate',
      reason: 'standoff-yaw-hard-gate-has-priority',
      turnDirection: 0,
    };
  }
  const finite = (value) => value != null && Number.isFinite(Number(value))
    ? Number(value)
    : null;
  const playerDrift = finite(alignment.playerDrift);
  const playerSpeed = finite(alignment.playerSpeed);
  const maxPlayerDrift = finite(alignment.maxPlayerDrift);
  const currentTick = finite(alignment.lastTick);
  const previousTick = finite(runtime.lastTick);
  const threshold = finite(reanchorThreshold);
  const reanchorLimit = Math.max(1, Math.trunc(Number(maximumReanchors) || 0));
  const yawReanchors = Math.max(0, Math.trunc(Number(runtime.yawReanchors) || 0));
  const tickCap = Math.max(1, Math.trunc(Number(projectedTickCap) || 0));
  if ([playerDrift, playerSpeed, maxPlayerDrift, currentTick, threshold]
    .some((value) => value == null)
      || playerDrift < 0 || playerSpeed < 0 || maxPlayerDrift <= 0
      || threshold <= 0 || threshold >= maxPlayerDrift) {
    return {
      action: 'blocked',
      reason: 'standoff-yaw-reanchor-observation-invalid',
      yawReanchors,
      turnDirection: 0,
    };
  }
  const recentTickDelta = previousTick == null
    ? 1
    : Math.max(1, Math.min(tickCap, Math.trunc(currentTick - previousTick)));
  const projectedPlayerDrift = playerDrift + playerSpeed * (recentTickDelta / 60);
  const common = {
    yawReanchors,
    maximumReanchors: reanchorLimit,
    playerDrift,
    projectedPlayerDrift,
    reanchorThreshold: threshold,
    maxPlayerDrift,
    recentTickDelta,
  };
  if (alignment.action === 'aligned'
      || preflight.safe !== true
      || preflight.action !== 'clear'
      || projectedPlayerDrift < threshold - 1e-6) {
    return {
      ...common,
      action: 'proceed',
      reason: 'standoff-yaw-reanchor-not-required',
      turnDirection: 0,
    };
  }
  if (yawReanchors >= reanchorLimit) {
    return {
      ...common,
      action: 'blocked',
      reason: 'standoff-yaw-reanchor-budget-exhausted',
      turnDirection: 0,
    };
  }
  return {
    ...common,
    action: 'reanchor',
    reason: 'standoff-yaw-pre-gate-drift-forecast',
    nextYawReanchors: yawReanchors + 1,
    turnDirection: 0,
  };
}

function pq017EscapeObstacleKey(obstacle) {
  if (obstacle?.worldRecordId) return `world:${obstacle.worldRecordId}`;
  if (obstacle?.entityId != null) return `entity:${obstacle.entityId}`;
  return null;
}

export function createPq017ScopedEscapeContexts(
  origin,
  endpoint,
  obstacles = [],
  playerRadius = 0,
) {
  const ox = Number(origin?.x);
  const oz = Number(origin?.z);
  const ex = Number(endpoint?.x);
  const ez = Number(endpoint?.z);
  if (![ox, oz, ex, ez].every(Number.isFinite)) return {};
  const shipRadius = Math.max(0, Number(playerRadius) || 0);
  const contexts = {};
  for (const obstacle of Array.isArray(obstacles) ? obstacles : []) {
    if (obstacle?.allowEscapeFromOverlap !== true) continue;
    const key = pq017EscapeObstacleKey(obstacle);
    const bx = Number(obstacle?.x);
    const bz = Number(obstacle?.z);
    if (key == null || !Number.isFinite(bx) || !Number.isFinite(bz)) continue;
    const exclusionRadius = shipRadius + pq017EffectiveRouteObstacleRadius(obstacle);
    const originDistance = Math.hypot(ox - bx, oz - bz);
    const endpointDistance = Math.hypot(ex - bx, ez - bz);
    const outwardDot = (ox - bx) * (ex - ox) + (oz - bz) * (ez - oz);
    if (originDistance <= exclusionRadius
        && endpointDistance > originDistance
        && outwardDot > 0) {
      contexts[key] = {
        active: true,
        phase: 'neutral-turn',
        origin: { x: ox, z: oz },
        exclusionRadius,
        corridorRadius: exclusionRadius + PQ017_ROUTE_PLANNER_MARGIN,
        corridorArmed: false,
        farthestDistance: originDistance,
        neutralTurnPocketRadius: Math.min(
          PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
          ...(Array.isArray(obstacles) ? obstacles : [])
            .filter((candidate) => candidate !== obstacle && candidate?.collides !== false)
            .map((candidate) => {
              const cx = Number(candidate?.x);
              const cz = Number(candidate?.z);
              if (!Number.isFinite(cx) || !Number.isFinite(cz)) return Infinity;
              return Math.max(
                0,
                Math.hypot(ox - cx, oz - cz)
                  - shipRadius
                  - pq017EffectiveRouteObstacleRadius(candidate)
                  - PQ017_RELEASED_ESCAPE_SOLID_RESERVE,
              );
            }),
        ),
      };
    }
  }
  return contexts;
}

export function advancePq017ScopedEscapeContexts(
  contexts,
  position,
  obstacles = [],
  { escapeProgress = [] } = {},
) {
  const px = Number(position?.x);
  const pz = Number(position?.z);
  if (!contexts || !Number.isFinite(px) || !Number.isFinite(pz)) return;
  const progressByObstacle = new Map(
    (Array.isArray(escapeProgress) ? escapeProgress : [])
      .map((entry) => [entry?.obstacleKey, entry?.action]),
  );
  for (const obstacle of Array.isArray(obstacles) ? obstacles : []) {
    const key = pq017EscapeObstacleKey(obstacle);
    const context = key != null ? contexts[key] : null;
    const ox = Number(obstacle?.x);
    const oz = Number(obstacle?.z);
    if (!context || !Number.isFinite(ox) || !Number.isFinite(oz)) continue;
    const distance = Math.hypot(px - ox, pz - oz);
    if (context.active) {
      if (context.phase === 'neutral-turn'
          && progressByObstacle.get(key) === 'enter-outward-recovery') {
        context.phase = 'outward-recovery';
      }
      context.farthestDistance = Math.max(context.farthestDistance, distance);
      if (distance > context.exclusionRadius) {
        context.active = false;
        context.phase = 'escaped';
      }
    }
    if (distance > context.corridorRadius) context.corridorArmed = true;
  }
}

export function evaluatePq017RingPassThrough(position, waypoint, passThrough = {}, routeSafety = {}) {
  const px = Number(position?.x);
  const pz = Number(position?.z);
  const wx = Number(waypoint?.x);
  const wz = Number(waypoint?.z);
  const nextX = Number(passThrough?.outgoingEnd?.x);
  const nextZ = Number(passThrough?.outgoingEnd?.z);
  const radius = Number(passThrough?.radius);
  if (passThrough?.safe !== true
      || ![px, pz, wx, wz, nextX, nextZ, radius].every(Number.isFinite)
      || radius <= 0) {
    return { advance: false, reason: 'pass-through-proof-invalid', distance: null, connector: null };
  }
  const distance = Math.hypot(px - wx, pz - wz);
  if (distance > radius) {
    return { advance: false, reason: 'outside-proven-gate', distance, connector: null };
  }
  const connector = auditPq017RouteSweep(
    { x: px, z: pz },
    { x: nextX, z: nextZ },
    routeSafety?.obstacles,
    routeSafety?.playerRadius,
    {
      requiredClearance: passThrough.requiredDynamicClearance
        ?? passThrough.minimumPhysicalMargin
        ?? PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN,
      escapeContexts: routeSafety?.escapeContexts || null,
    },
  );
  return {
    advance: connector.safe,
    reason: connector.safe ? 'inside-proven-gate' : 'outgoing-connector-blocked',
    distance,
    connector,
  };
}

export function planPq017ImpactStaging(playerPosition, targetPosition, rootPosition, minimumStandOff,
  obstacles = [], playerRadius = 0) {
  const px = Number(playerPosition?.x);
  const pz = Number(playerPosition?.z);
  const tx = Number(targetPosition?.x);
  const tz = Number(targetPosition?.z);
  const standOff = Number(minimumStandOff);
  if (![px, pz, tx, tz, standOff].every(Number.isFinite) || standOff < 0) return null;
  const reference = choosePq017ImpactStagingReference(
    playerPosition, targetPosition, rootPosition,
  );
  if (!reference) return null;
  const currentDx = px - tx;
  const currentDz = pz - tz;
  const currentDistance = Math.hypot(currentDx, currentDz);
  const referenceDx = reference.x - tx;
  const referenceDz = reference.z - tz;
  const referenceDistance = Math.hypot(referenceDx, referenceDz);
  if (referenceDistance <= 0.001) return null;
  const outwardAngle = Math.atan2(referenceDz, referenceDx);
  const currentAngle = currentDistance > 0.001
    ? Math.atan2(currentDz, currentDx)
    : outwardAngle;
  const minimumOuterRadius = Math.max(
    standOff + 130,
    standOff * 1.5,
    currentDistance + 64,
  );
  const collisionCircles = (Array.isArray(obstacles) ? obstacles : [])
    .map((obstacle) => ({
      entityId: obstacle?.entityId ?? null,
      type: obstacle?.type || null,
      fieldId: obstacle?.fieldId || null,
      collides: obstacle?.collides,
      allowEscapeFromOverlap: obstacle?.allowEscapeFromOverlap === true,
      x: Number(obstacle?.x),
      z: Number(obstacle?.z),
      radius: Math.max(0, Number(obstacle?.radius) || 0),
    }))
    .filter((obstacle) => Number.isFinite(obstacle.x) && Number.isFinite(obstacle.z)
      && (obstacle.collides !== false || obstacle.allowEscapeFromOverlap === true));
  const shipRadius = Math.max(0, Number(playerRadius) || 0);
  const entryOffsets = [0];
  for (let step = 1; step <= 4; step += 1) {
    entryOffsets.push(step * Math.PI / 8, -step * Math.PI / 8);
  }
  // The exact root-outward launch point is immutable, but a large body can occupy that same radial
  // farther out. Search a small, symmetric set of outer-ring approach bearings so the final leg can
  // enter the launch point laterally instead of routing through the body. Zero remains preferred
  // whenever the direct radial is collision-clear.
  const approachOffsets = [0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4];
  const radiusOffsets = [0, 96, 192];
  let best = null;
  for (const radiusOffset of radiusOffsets) {
    const candidateRadius = minimumOuterRadius + radiusOffset;
    for (const entryOffset of entryOffsets) {
      const entryAngle = currentAngle + entryOffset;
      for (const approachOffset of approachOffsets) {
        const approachAngle = outwardAngle + approachOffset;
        let shortestDelta = approachAngle - entryAngle;
        while (shortestDelta > Math.PI) shortestDelta -= Math.PI * 2;
        while (shortestDelta <= -Math.PI) shortestDelta += Math.PI * 2;
        const deltas = Math.abs(shortestDelta) <= 1e-9
          ? [0]
          : [shortestDelta, shortestDelta > 0
            ? shortestDelta - Math.PI * 2
            : shortestDelta + Math.PI * 2];
        for (const ringDelta of deltas) {
          const ringSteps = Math.ceil(Math.abs(ringDelta) / (Math.PI / 4));
          const waypoints = [{
            x: tx + Math.cos(entryAngle) * candidateRadius,
            z: tz + Math.sin(entryAngle) * candidateRadius,
            phase: 'ring-entry',
          }];
          for (let step = 1; step <= ringSteps; step += 1) {
            const angle = entryAngle + ringDelta * (step / ringSteps);
            waypoints.push({
              x: tx + Math.cos(angle) * candidateRadius,
              z: tz + Math.sin(angle) * candidateRadius,
              phase: 'ring',
            });
          }
          waypoints.push({
            x: tx + Math.cos(outwardAngle) * standOff,
            z: tz + Math.sin(outwardAngle) * standOff,
            phase: 'launch',
          });
          const route = [{ x: px, z: pz }, ...waypoints];
          let clearance = Infinity;
          let blockedSegments = 0;
          let length = 0;
          let closestObstacle = null;
          const segmentClearances = [];
          for (let segmentIndex = 1; segmentIndex < route.length; segmentIndex += 1) {
            const a = route[segmentIndex - 1];
            const b = route[segmentIndex];
            length += Math.hypot(b.x - a.x, b.z - a.z);
            let routeSegmentClearance = Infinity;
            for (const obstacle of collisionCircles) {
              const physicalExclusion = pq017EffectiveRouteObstacleRadius(obstacle) + shipRadius;
              const exclusion = physicalExclusion + PQ017_ROUTE_PLANNER_MARGIN;
              const startDistance = Math.hypot(a.x - obstacle.x, a.z - obstacle.z);
              const endDistance = Math.hypot(b.x - obstacle.x, b.z - obstacle.z);
              const escapeVector = (a.x - obstacle.x) * (b.x - a.x)
                + (a.z - obstacle.z) * (b.z - a.z);
              // A physically clear start may leave the planner's advisory margin on the first leg.
              // True collision overlap is stricter: only the synthetic released payload can grant
              // that one-way escape. Root/component overlap and every later re-entry stay blocked.
              const outwardFirstLeg = segmentIndex === 1
                && startDistance <= exclusion
                && endDistance > exclusion
                && endDistance > startDistance
                && escapeVector > 0;
              const marginEgress = outwardFirstLeg
                && startDistance > physicalExclusion;
              const releasedPayloadEscape = outwardFirstLeg
                && startDistance <= physicalExclusion
                && obstacle.allowEscapeFromOverlap === true;
              if (marginEgress || releasedPayloadEscape) {
                continue;
              }
              const segmentClearance = pointSegmentDistance(
                obstacle.x, obstacle.z, a.x, a.z, b.x, b.z,
              ) - exclusion;
              routeSegmentClearance = Math.min(routeSegmentClearance, segmentClearance);
              if (segmentClearance < clearance) {
                clearance = segmentClearance;
                closestObstacle = {
                  entityId: obstacle.entityId,
                  type: obstacle.type,
                  fieldId: obstacle.fieldId,
                  clearance: Math.round(segmentClearance * 1000) / 1000,
                };
              }
              if (segmentClearance <= 0) blockedSegments += 1;
            }
            segmentClearances.push(routeSegmentClearance);
          }
          const candidate = {
            outerRadius: candidateRadius,
            radiusOffset,
            approachOffset,
            approachOffsetMagnitude: Math.abs(approachOffset),
            entryOffsetMagnitude: Math.abs(entryOffset),
            waypoints,
            clearance,
            closestObstacle,
            blockedSegments,
            segmentClearances,
            length,
          };
          const betterBlocked = !best || candidate.blockedSegments < best.blockedSegments;
          const equalBlocked = best && candidate.blockedSegments === best.blockedSegments;
          const routesClear = equalBlocked && candidate.blockedSegments === 0;
          // Collision authority is the hard gate. Once two routes are both proven clear, prefer
          // the shorter executable polyline; a cosmetically straighter final bearing must not
          // select a route that exceeds the bounded tow window. Bearings and radius remain stable
          // deterministic tie-breakers only.
          const betterLength = routesClear && candidate.length < best.length - 1e-9;
          const equalLength = routesClear
            && Math.abs(candidate.length - best.length) <= 1e-9;
          const betterApproach = equalLength
            && candidate.approachOffsetMagnitude < best.approachOffsetMagnitude - 1e-9;
          const equalApproach = equalLength
            && Math.abs(candidate.approachOffsetMagnitude
              - best.approachOffsetMagnitude) <= 1e-9;
          const betterClearance = equalBlocked && !routesClear
            && candidate.clearance > best.clearance + 1e-9;
          const equalClearance = equalBlocked && !routesClear
            && (candidate.clearance === best.clearance
              || Math.abs(candidate.clearance - best.clearance) <= 1e-9);
          const tiedForGeometry = equalApproach || equalClearance;
          const betterRadius = tiedForGeometry
            && candidate.radiusOffset < best.radiusOffset;
          const equalRadius = tiedForGeometry
            && candidate.radiusOffset === best.radiusOffset;
          const betterEntry = equalRadius
            && candidate.entryOffsetMagnitude < best.entryOffsetMagnitude - 1e-9;
          if (betterBlocked || betterLength || betterApproach || betterClearance
            || betterRadius || betterEntry) {
            best = candidate;
          }
        }
      }
    }
  }
  const provenWaypoints = best?.waypoints?.map((waypoint, index) => {
    if (waypoint.phase === 'launch') return waypoint;
    // Segment zero is player -> first waypoint. Each intermediate waypoint's proof belongs to the
    // following segment, so waypoint index N reads segment N + 1.
    const passThrough = derivePq017RingPassThroughProof(best.segmentClearances[index + 1]);
    return { ...waypoint, passThrough };
  });
  return best ? {
    reference,
    standOff,
    outerRadius: best.outerRadius,
    approachOffset: best.approachOffset,
    waypoints: provenWaypoints,
    segmentClearances: best.segmentClearances.map((value) => (
      Number.isFinite(value) ? value : null
    )),
    obstacleClearance: Number.isFinite(best.clearance) ? best.clearance : null,
    closestObstacle: best.closestObstacle,
    blockedSegments: best.blockedSegments,
  } : null;
}

export function choosePq017ClearStagingPoint(playerPosition, targetPosition, standOff,
  obstacles = [], playerRadius = 0) {
  const direct = computePq017OutwardStagingPoint(playerPosition, targetPosition, standOff);
  if (!direct) return null;
  const tx = Number(targetPosition.x);
  const tz = Number(targetPosition.z);
  const baseAngle = Math.atan2(direct.z - tz, direct.x - tx);
  const radius = Math.max(0, Number(playerRadius) || 0);
  const angleOffsets = [0];
  for (let step = 1; step <= 8; step += 1) {
    angleOffsets.push(step);
    if (step < 8) angleOffsets.push(-step);
  }
  let best = null;
  for (let index = 0; index < angleOffsets.length; index += 1) {
    const angle = baseAngle + angleOffsets[index] * Math.PI / 8;
    const point = {
      x: tx + Math.cos(angle) * standOff,
      z: tz + Math.sin(angle) * standOff,
    };
    let clearance = Infinity;
    for (const obstacle of Array.isArray(obstacles) ? obstacles : []) {
      const ox = Number(obstacle?.x);
      const oz = Number(obstacle?.z);
      if (!Number.isFinite(ox) || !Number.isFinite(oz)) continue;
      const exclusion = Math.max(0, Number(obstacle?.radius) || 0) + radius + 18;
      const departure = pointSegmentDistance(ox, oz,
        Number(playerPosition.x), Number(playerPosition.z), point.x, point.z) - exclusion;
      const impact = pointSegmentDistance(ox, oz, point.x, point.z, tx, tz) - exclusion;
      clearance = Math.min(clearance, departure, impact);
    }
    if (!best || clearance > best.clearance + 1e-9) {
      best = { point, clearance, angleOffset: angleOffsets[index] };
    }
  }
  return best;
}

export function decidePq017ImpactControl(navigation = {}) {
  const error = Number(navigation.error);
  const speed = Number(navigation.speed);
  const closingSpeed = Number(navigation.closingSpeed);
  if (![error, speed, closingSpeed].every(Number.isFinite)) {
    return { action: 'invalid', thrust: false, boost: false, turnDirection: 0 };
  }
  const lateralSpeed = Number(navigation.lateralSpeed);
  const missed = (speed > 5 && closingSpeed < -0.5)
    || (Number.isFinite(lateralSpeed) && speed > 25
      && lateralSpeed > Math.max(18, Math.abs(closingSpeed) * 0.6));
  const captureActive = navigation.captureActive === true;
  const captureSettled = captureActive
    && speed <= 5
    && (!Number.isFinite(lateralSpeed) || lateralSpeed <= 3);
  if (captureSettled) {
    return {
      action: 'capture-complete',
      thrust: false,
      boost: false,
      turnDirection: 0,
    };
  }
  if (missed || captureActive) {
    const velocityCancelError = Number(navigation.velocityCancelError);
    if (!Number.isFinite(velocityCancelError)) {
      return { action: 'missed', thrust: false, boost: false, turnDirection: 0 };
    }
    // A glancing approach is recoverable while ordinary Pilot controls still have time to act.
    // With W released, A/D is pure yaw: point the nose opposite the live velocity vector first.
    // Only then press W so forward thrust cancels lateral momentum instead of adding another orbit.
    if (Math.abs(velocityCancelError) > SITE_ARRIVAL_YAW_RELEASE_DEADBAND) {
      return {
        action: 'velocity-align',
        thrust: false,
        boost: false,
        turnDirection: velocityCancelError > 0 ? 1 : -1,
      };
    }
    return {
      action: 'velocity-cancel',
      thrust: true,
      boost: false,
      turnDirection: 0,
    };
  }
  const distance = Number(navigation.distance);
  // At contact range the ship's collision radius can overlap the component while its centerline
  // still carries a small angular error. Continue the capped ordinary thrust for that last few WU
  // instead of starving W and timing out just outside the physical collider. Keep the wider window
  // both range- and angle-bounded so it cannot turn a missed approach into an uncapped orbit.
  const nearContactAligned = Number.isFinite(distance)
    && distance <= 40
    && Math.abs(error) <= 0.3;
  const aligned = Math.abs(error) <= 0.06 || nearContactAligned;
  if (aligned && speed >= PQ017_IMPACT_SPEED_CAP) {
    return { action: 'coast', thrust: false, boost: false, turnDirection: 0 };
  }
  return {
    action: aligned ? 'thrust' : 'turn',
    thrust: aligned,
    // Ordinary W thrust can be sampled and released at the cap. ShiftLeft is a discrete dash
    // impulse and therefore cannot provide a real speed ceiling on this deliberately narrow run.
    boost: false,
    turnDirection: aligned ? 0 : error > 0 ? 1 : error < 0 ? -1 : 0,
  };
}

export function decidePq017ReverseStagingControl(navigation = {}, standOff = 0) {
  const distance = Number(navigation.distance);
  const speed = Number(navigation.speed);
  const closingSpeed = Number(navigation.closingSpeed);
  const error = Number(navigation.error);
  const requiredDistance = Number(standOff);
  if (![distance, speed, closingSpeed, error, requiredDistance].every(Number.isFinite)
    || requiredDistance < 0) {
    return { action: 'invalid', forward: false, reverse: false, turnDirection: 0 };
  }
  const aligned = Math.abs(error) <= 0.08;
  if (distance >= requiredDistance && speed <= 2) {
    return { action: 'settled', forward: false, reverse: false, turnDirection: 0 };
  }
  if (!aligned) {
    return {
      action: 'turn', forward: false, reverse: false,
      turnDirection: error > 0 ? 1 : error < 0 ? -1 : 0,
    };
  }
  if (distance < requiredDistance) {
    return { action: 'depart', forward: false, reverse: true, turnDirection: 0 };
  }
  return closingSpeed < 0
    ? { action: 'counter', forward: true, reverse: false, turnDirection: 0 }
    : { action: 'counter', forward: false, reverse: true, turnDirection: 0 };
}

export function auditPq017ImpactRestage({ stageId = null, failureCount = 0 } = {}) {
  const failures = [];
  if (stageId !== 'recovered') failures.push(`stage:${stageId || 'missing'}`);
  if (!Number.isInteger(failureCount) || failureCount !== 0) {
    failures.push(`failure_receipts:${failureCount}`);
  }
  return { pass: failures.length === 0, failures };
}

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-12
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared))
    : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function summarizePq017OperationRouteDiagnostic(observation = {}, {
  componentId,
  operationId,
  maxSettledDistance = SITE_OPERATION_SETTLED_WITHIN,
  maxSettledSpeed = SITE_OPERATION_MAX_SETTLED_SPEED,
} = {}) {
  const record = observation.record || null;
  const selected = observation.selected || null;
  const player = observation.player || null;
  const beam = observation.beam || null;
  const manifest = record?.manifestId ? worldSiteManifestById(record.manifestId) : null;
  const operationReadiness = manifest && record && componentId
    ? worldSiteOperationReadiness(manifest, record, componentId)
    : { operation: null, reason: 'record-or-manifest-missing', candidates: [] };
  const finite = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const round = (value) => value == null ? null : Math.round(value * 1000) / 1000;
  const playerX = finite(player?.x);
  const playerZ = finite(player?.z);
  const targetX = finite(selected?.x);
  const targetZ = finite(selected?.z);
  const velocityX = finite(player?.vx);
  const velocityZ = finite(player?.vz);
  const distance = playerX == null || playerZ == null || targetX == null || targetZ == null
    ? null
    : Math.hypot(targetX - playerX, targetZ - playerZ);
  const beamRange = finite(beam?.range);
  const targetRadius = finite(selected?.radius) ?? 0;
  const allowedDistance = beamRange == null ? null : beamRange + targetRadius;
  const speed = velocityX == null || velocityZ == null ? null : Math.hypot(velocityX, velocityZ);
  const settledDistanceLimit = Math.max(0, finite(maxSettledDistance) ?? SITE_OPERATION_SETTLED_WITHIN);
  const settledSpeedLimit = Math.max(0, finite(maxSettledSpeed) ?? SITE_OPERATION_MAX_SETTLED_SPEED);
  const expectedWorldRecordId = componentId
    ? `${PQ017_SITE_ID}/component/${componentId}`
    : null;
  const readyOperationId = operationReadiness.operation?.id || null;
  const componentMatches = selected?.componentId === componentId;
  const worldRecordMatches = selected?.worldRecordId === expectedWorldRecordId;
  const inRange = distance != null && allowedDistance != null && distance <= allowedDistance;
  const comfortablyInRange = inRange && distance <= settledDistanceLimit;
  const expectedOperationReady = readyOperationId === operationId;
  const targetable = selected?.targetable === true;
  const presentationAdmitted = selected?.presentationAdmitted === true;
  const speedSettled = speed != null && speed <= settledSpeedLimit;
  const operationDefinition = manifest?.operations?.find((operation) => operation.id === operationId) || null;
  const componentRecord = record?.components?.[componentId] || null;
  const operationProgress = finite(componentRecord?.progress?.[operationId]);
  const input = observation.input || {};
  const mining = observation.mining || {};
  const lockedTargetId = mining.lockedTargetId ?? null;

  return {
    expected: { componentId: componentId || null, operationId: operationId || null, worldRecordId: expectedWorldRecordId },
    selected: {
      entityId: selected?.entityId ?? null,
      componentId: selected?.componentId || null,
      worldRecordId: selected?.worldRecordId || null,
      componentMatches,
      worldRecordMatches,
      targetable,
      presentationAdmitted,
      componentStatus: record?.components?.[componentId]?.status || null,
    },
    range: {
      distance: round(distance),
      beamRange: round(beamRange),
      targetRadius: round(targetRadius),
      allowedDistance: round(allowedDistance),
      inRange,
      maxSettledDistance: round(settledDistanceLimit),
      comfortablyInRange,
    },
    motion: {
      velocityX: round(velocityX),
      velocityZ: round(velocityZ),
      speed: round(speed),
      maxSettledSpeed: round(settledSpeedLimit),
      settled: speedSettled,
    },
    input: {
      moveX: round(finite(input.moveX)),
      moveZ: round(finite(input.moveZ)),
      turnIntent: round(finite(input.turnIntent)),
      brake: input.brake === true,
      boost: input.boost === true,
      fireGroup: finite(input.fireGroup),
      siteBeam: input.siteBeam === true,
    },
    mining: {
      beaming: mining.beaming === true,
      lockedTargetId,
      lockedToSelected: lockedTargetId != null && lockedTargetId === selected?.entityId,
      activeVerb: mining.activeVerb || null,
    },
    operation: {
      progress: round(operationProgress),
      threshold: round(finite(operationDefinition?.threshold)),
      completed: !!record?.completedOperations?.[operationId],
    },
    readiness: {
      readyOperationId,
      expectedOperationReady,
      reason: operationReadiness.reason || null,
      candidates: (operationReadiness.candidates || []).map((operation) => operation.id),
    },
    routeReady: componentMatches && worldRecordMatches && targetable && presentationAdmitted
      && comfortablyInRange && speedSettled && expectedOperationReady,
  };
}

export function selectPq017EvidenceHistory(names, {
  runtimeKind,
  retain = PQ017_HISTORY_RETENTION,
} = {}) {
  if (runtimeKind !== 'browser' && runtimeKind !== 'electron') {
    throw new TypeError('PQ-017 history runtime must be browser or electron');
  }
  const keepCount = Math.max(0, Math.trunc(Number(retain) || 0));
  const pattern = new RegExp(`^${runtimeKind}-history-(\\d+)$`);
  const matching = (Array.isArray(names) ? names : [])
    .filter((name) => typeof name === 'string' && pattern.test(name))
    .map((name) => ({ name, timestamp: BigInt(name.match(pattern)[1]) }))
    .sort((a, b) => (a.timestamp === b.timestamp
      ? a.name.localeCompare(b.name)
      : (a.timestamp > b.timestamp ? -1 : 1)))
    .map((entry) => entry.name);
  return {
    matching,
    keep: matching.slice(0, keepCount),
    // Delete oldest first so an interrupted cleanup preserves the newest evidence.
    prune: matching.slice(keepCount).reverse(),
  };
}

export async function prunePq017EvidenceHistory({
  outputRoot,
  runtimeKind,
  retain = PQ017_HISTORY_RETENTION,
} = {}) {
  assert(outputRoot, 'PQ-017 history pruning requires its owned output root');
  const resolvedRoot = path.resolve(outputRoot);
  const canonicalRoot = await realpath(resolvedRoot);
  const entries = await readdir(resolvedRoot, { withFileTypes: true });
  const ownedDirectoryNames = entries
    // Include directory aliases in selection so a history-shaped junction/symlink is explicitly
    // refused by canonical identity checks instead of silently bypassing the safety audit.
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name);
  const selection = selectPq017EvidenceHistory(ownedDirectoryNames, { runtimeKind, retain });
  const pruned = [];
  for (const name of selection.prune) {
    const target = path.resolve(resolvedRoot, name);
    const canonicalTarget = await realpath(target);
    const expectedCanonicalTarget = path.resolve(canonicalRoot, name);
    const comparablePath = (value) => {
      const normalized = path.normalize(value);
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    };
    const insideOwnedRoot = canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`)
      && path.dirname(canonicalTarget) === canonicalRoot;
    const exactOwnedName = new RegExp(`^${runtimeKind}-history-\\d+$`).test(path.basename(target));
    const exactCanonicalIdentity = comparablePath(canonicalTarget) === comparablePath(expectedCanonicalTarget);
    if (!insideOwnedRoot || !exactOwnedName || !exactCanonicalIdentity) {
      throw new Error(`refusing unsafe PQ-017 history prune target: ${canonicalTarget}`);
    }
    await rm(canonicalTarget, { recursive: true, force: false, maxRetries: 2 });
    pruned.push(name);
  }
  return {
    runtimeKind,
    retain: Math.max(0, Math.trunc(Number(retain) || 0)),
    kept: selection.keep,
    pruned,
  };
}

export function summarizeBoundedFrameTimes(frameTimes, {
  sampleLimit = PQ017_ROUTE_LIMITS.frameSamples,
  hitchThresholdMs = PQ017_ROUTE_LIMITS.hitchThresholdMs,
  floorP95BudgetMs = PQ017_ROUTE_LIMITS.floorP95BudgetMs,
} = {}) {
  const limit = Math.max(1, Math.trunc(Number(sampleLimit) || PQ017_ROUTE_LIMITS.frameSamples));
  const samples = (Array.isArray(frameTimes) ? frameTimes : [])
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-limit);
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (ratio) => sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(ratio * (sorted.length - 1)))]
    : 0;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const round = (value) => Math.round(value * 1000) / 1000;
  const p95 = percentile(0.95);
  return {
    samples: sorted.length,
    sampleLimit: limit,
    distributionMs: {
      min: round(sorted[0] || 0),
      p50: round(percentile(0.5)),
      p95: round(p95),
      p99: round(percentile(0.99)),
      max: round(sorted[sorted.length - 1] || 0),
      avg: round(sorted.length ? sum / sorted.length : 0),
    },
    hitchThresholdMs,
    hitchesOverThreshold: sorted.filter((value) => value > hitchThresholdMs).length,
    floorP95BudgetMs,
    floorP95BudgetMet: sorted.length > 0 && p95 <= floorP95BudgetMs,
  };
}

export function summarizeBoundedFramePhases(frameTimes, phaseTags, {
  sampleLimit = PQ017_ROUTE_LIMITS.frameSamples,
  phaseLimit = 16,
  hitchThresholdMs = PQ017_ROUTE_LIMITS.hitchThresholdMs,
} = {}) {
  const limit = Math.max(1, Math.trunc(Number(sampleLimit) || PQ017_ROUTE_LIMITS.frameSamples));
  const boundedPhaseLimit = Math.max(1, Math.trunc(Number(phaseLimit) || 16));
  const values = Array.isArray(frameTimes) ? frameTimes : [];
  const tags = Array.isArray(phaseTags) ? phaseTags : [];
  const paired = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!(Number.isFinite(value) && value > 0)) continue;
    const rawPhase = typeof tags[index] === 'string' ? tags[index].trim() : '';
    paired.push({
      value,
      phase: rawPhase ? rawPhase.slice(0, 80) : 'whole-window',
    });
  }
  const bounded = paired.slice(-limit);
  const byPhase = new Map();
  for (const sample of bounded) {
    let phase = sample.phase;
    if (!byPhase.has(phase) && byPhase.size >= boundedPhaseLimit - 1) phase = 'other';
    let samples = byPhase.get(phase);
    if (!samples) {
      samples = [];
      byPhase.set(phase, samples);
    }
    samples.push(sample.value);
  }
  const round = (value) => Math.round(value * 1000) / 1000;
  const phases = [...byPhase.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phase, samples]) => {
      const sorted = [...samples].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * (sorted.length - 1)))] || 0;
      return {
        phase,
        samples: sorted.length,
        p95Ms: round(p95),
        hitchesOverThreshold: sorted.filter((value) => value > hitchThresholdMs).length,
      };
    });
  return {
    taggedSamples: bounded.length,
    sampleLimit: limit,
    phaseLimit: boundedPhaseLimit,
    hitchThresholdMs,
    phases,
  };
}

export function evaluatePq017PrimaryPerformanceInstrumentation(performance = {}) {
  const windows = [
    ['active-site-operations', performance.activeOperation],
    ['ordinary-outbound-gate-travel', performance.travel?.outbound],
    ['ordinary-inbound-gate-and-site-approach', performance.travel?.inbound],
  ];
  const failures = [];
  for (const [label, window] of windows) {
    const systemTimingEnabled = window?.diagnostics?.perf?.systemTimingEnabled;
    if (systemTimingEnabled === true) {
      failures.push(`${label}-system-timing-enabled`);
    } else if (systemTimingEnabled !== false) {
      failures.push(`${label}-system-timing-state-missing`);
    }
  }
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    requiredSystemTimingEnabled: false,
  });
}

export function classifyPq017PerformanceRun({ captureSystemTiming = false } = {}) {
  const instrumented = captureSystemTiming === true;
  return Object.freeze({
    artifactKind: instrumented ? 'diagnostic' : 'primary',
    captureSystemTiming: instrumented,
    primaryAcceptance: !instrumented,
    promoteAcceptedArtifact: !instrumented,
  });
}

export function evaluatePq017PerformanceComparison(performance = {}, {
  ratioBudget = 1.25,
  absoluteFloorMs = PQ017_ROUTE_LIMITS.floorP95BudgetMs,
} = {}) {
  const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;
  const active = performance.activeOperation || null;
  const baseline = performance.travel && performance.travel.inbound || null;
  const activeFrameP95 = finitePositive(active?.frameTimes?.distributionMs?.p95);
  const baselineFrameP95 = finitePositive(baseline?.frameTimes?.distributionMs?.p95);
  const activeWorkP95 = finitePositive(active?.diagnostics?.perf?.frameCallback?.p95);
  const baselineWorkP95 = finitePositive(baseline?.diagnostics?.perf?.frameCallback?.p95);
  const ratio = Math.max(1, Number(ratioBudget) || 1.25);
  const floor = Math.max(1, Number(absoluteFloorMs) || PQ017_ROUTE_LIMITS.floorP95BudgetMs);
  const failures = [];
  if (activeFrameP95 == null || baselineFrameP95 == null) {
    failures.push('feature-frame-comparison-missing');
  }
  if (activeWorkP95 == null || baselineWorkP95 == null) {
    failures.push('feature-work-comparison-missing');
  }
  const allowedFrameP95 = baselineFrameP95 == null ? null : Math.max(floor, baselineFrameP95 * ratio);
  const allowedWorkP95 = baselineWorkP95 == null ? null : Math.max(floor, baselineWorkP95 * ratio);
  if (activeFrameP95 != null && allowedFrameP95 != null && activeFrameP95 > allowedFrameP95) {
    failures.push('active-site-frame-p95-regressed');
  }
  if (activeWorkP95 != null && allowedWorkP95 != null && activeWorkP95 > allowedWorkP95) {
    failures.push('active-site-work-p95-regressed');
  }
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    baseline: 'ordinary-inbound-gate-and-site-approach',
    ratioBudget: ratio,
    absoluteFloorMs: floor,
    activeFrameP95,
    baselineFrameP95,
    allowedFrameP95,
    activeWorkP95,
    baselineWorkP95,
    allowedWorkP95,
  });
}

export function evaluateSiteResidencyLifecycle({ before, away, after, limits = PQ017_ROUTE_LIMITS } = {}) {
  const failures = [];
  if (!before || !away || !after) return { pass: false, failures: ['residency-snapshot-missing'] };
  const beforeFixtureIds = stableIdentitySet(before.presentationFixtureIds);
  const awayFixtureIds = stableIdentitySet(away.presentationFixtureIds);
  const afterFixtureIds = stableIdentitySet(after.presentationFixtureIds);
  if (!(before.siteEntityCount > 0)) failures.push('before-site-entities-missing');
  if (!(before.siteRenderRootCount > 0)) failures.push('before-site-render-roots-missing');
  if (!(before.presentationFixtureCount > 0) || beforeFixtureIds.length === 0) {
    failures.push('before-presentation-fixtures-missing');
  }
  if (before.presentationFixtureCount !== beforeFixtureIds.length) {
    failures.push('before-presentation-fixture-count-identity-mismatch');
  }
  if (before.siteEntityCount > limits.siteEntities) failures.push('before-site-entity-ceiling');
  if (before.siteRenderRootCount > limits.siteRenderRoots) failures.push('before-site-render-root-ceiling');
  if (before.presentationFixtureCount > limits.presentationFixtures) failures.push('before-presentation-fixture-ceiling');
  if (away.siteEntityCount !== 0) failures.push('away-site-entities-not-clean');
  if (away.siteRenderRootCount !== 0) failures.push('away-site-render-roots-not-clean');
  if (away.presentationFixtureCount !== 0) failures.push('away-presentation-fixtures-not-clean');
  if (awayFixtureIds.length !== 0) failures.push('away-presentation-fixture-identities-not-clean');
  if (away.siteRenderObjectCount !== 0) failures.push('away-site-render-objects-not-clean');
  if (away.trackedRenderRootCount !== 0) failures.push('away-tracked-render-roots-not-clean');
  for (const [field, code] of [
    ['siteEntityCount', 'return-site-entities-not-baseline'],
    ['siteRenderRootCount', 'return-site-render-roots-not-baseline'],
    ['presentationFixtureCount', 'return-presentation-fixtures-not-baseline'],
    ['siteRenderObjectCount', 'return-site-render-objects-not-baseline'],
  ]) {
    if (after[field] !== before[field]) failures.push(code);
  }
  if (after.siteEntityCount > limits.siteEntities) failures.push('return-site-entity-ceiling');
  if (after.siteRenderRootCount > limits.siteRenderRoots) failures.push('return-site-render-root-ceiling');
  if (after.presentationFixtureCount > limits.presentationFixtures) failures.push('return-presentation-fixture-ceiling');
  if (after.presentationFixtureCount !== afterFixtureIds.length) {
    failures.push('return-presentation-fixture-count-identity-mismatch');
  }
  if (!isDeepStrictEqual(afterFixtureIds, beforeFixtureIds)) {
    failures.push('return-presentation-fixture-identities-not-baseline');
  }
  return {
    pass: failures.length === 0,
    failures,
    awayCleanupPass: failures.every((entry) => !entry.startsWith('away-')),
    returnedToBaselinePass: failures.every((entry) => !entry.startsWith('return-')),
  };
}

export function auditSafetyCouplerImpact(before, after) {
  const failures = [];
  const beforeRecord = before && before.record || {};
  const afterRecord = after && after.record || {};
  const matchesFailure = (entry) => entry && entry.failureId === 'safety_coupler_impact'
    && entry.componentId === 'safety_coupler';
  const events = (after && after.events || []).filter((event) => event?.name === 'worldSite:failureReceipt'
    && event.payload?.siteId === PQ017_SITE_ID
    && event.payload?.componentId === 'safety_coupler'
    && event.payload?.triggerId === 'safety_coupler_impact');
  const durableFailures = (afterRecord.failures || []).filter(matchesFailure);
  const durableReceipts = (afterRecord.receipts || []).filter((entry) => matchesFailure(entry)
    && entry.kind === 'failure' && entry.complete === true);
  const beforeCycle = Number(beforeRecord.components?.safety_coupler?.cycle);
  const afterCycle = Number(afterRecord.components?.safety_coupler?.cycle);
  const expectedReceiptId = `${PQ017_SITE_ID}/failure/safety_coupler/${afterCycle}`;
  const beforeCompleted = beforeRecord.completedOperations || {};
  const afterCompleted = afterRecord.completedOperations || {};
  const removedOperations = Object.keys(beforeCompleted)
    .filter((operationId) => !Object.prototype.hasOwnProperty.call(afterCompleted, operationId))
    .sort();
  if (events.length !== 1) failures.push(`failure-event-count:${events.length}`);
  if (durableFailures.length !== 1) failures.push(`durable-failure-count:${durableFailures.length}`);
  if (durableReceipts.length !== 1) failures.push(`durable-failure-receipt-count:${durableReceipts.length}`);
  if (!beforeRecord.completedOperations?.recover_safety_coupler) failures.push('pre-impact-recovery-missing');
  if (afterRecord.completedOperations?.recover_safety_coupler) failures.push('operation-rollback-missing');
  if (!isDeepStrictEqual(removedOperations, ['recover_safety_coupler'])) {
    failures.push(`completed-operation-removals:${removedOperations.join(',') || 'none'}`);
  }
  const operationIds = [...new Set([...Object.keys(beforeCompleted), ...Object.keys(afterCompleted)])].sort();
  for (const operationId of operationIds) {
    if (operationId === 'recover_safety_coupler') continue;
    if (!isDeepStrictEqual(beforeCompleted[operationId], afterCompleted[operationId])) {
      failures.push(`completed-operation-collateral:${operationId}`);
    }
  }
  const beforeComponents = beforeRecord.components || {};
  const afterComponents = afterRecord.components || {};
  const componentIds = [...new Set([...Object.keys(beforeComponents), ...Object.keys(afterComponents)])].sort();
  for (const componentId of componentIds) {
    if (componentId === 'safety_coupler') continue;
    if (!isDeepStrictEqual(beforeComponents[componentId], afterComponents[componentId])) {
      failures.push(`component-collateral:${componentId}`);
    }
  }
  if (afterRecord.components?.safety_coupler?.status !== 'failed') failures.push('coupler-not-failed');
  if (afterRecord.stageId !== 'damaged') failures.push('site-not-damaged');
  if (!Number.isFinite(beforeCycle) || afterCycle !== beforeCycle + 1) failures.push('failure-cycle-not-incremented-once');
  if (events[0]?.payload?.stageId !== 'damaged') failures.push('failure-event-stage-mismatch');
  if (!events[0]?.payload?.receipt) failures.push('failure-event-receipt-missing');
  if (events[0]?.payload?.receipt?.receiptId !== expectedReceiptId) {
    failures.push('failure-event-receipt-id-mismatch');
  }
  for (const receipt of [events[0]?.payload?.receipt, durableFailures[0], durableReceipts[0]]) {
    if (receipt && receipt.receiptId !== expectedReceiptId) failures.push('failure-receipt-id-mismatch');
  }
  return {
    pass: failures.length === 0,
    failures: [...new Set(failures)],
    receiptId: expectedReceiptId,
    cycle: afterCycle,
    eventCount: events.length,
    durableFailureCount: durableFailures.length,
    durableReceiptCount: durableReceipts.length,
  };
}

function stableIdentitySet(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((entry) => typeof entry === 'string' && entry.length > 0))].sort();
}

export async function runPq017WorldSitePublicRoute({
  page,
  outputDir,
  expectedRootUrl,
  log = () => {},
  flightTimeoutMs = 150_000,
  timeBudgetScale = 1,
  captureSystemTiming = false,
  primaryAcceptance = true,
} = {}) {
  assert(page, 'PQ-017 route requires a Playwright page');
  assert(outputDir, 'PQ-017 route requires an output directory');
  assert(expectedRootUrl, 'PQ-017 route requires the canonical root URL');
  const timeoutScale = Math.max(1, Math.min(4, Number(timeBudgetScale) || 1));
  const routeTimeout = (milliseconds) => Math.trunc(milliseconds * timeoutScale);

  const steps = [];
  const screenshots = [];
  const performance = {
    sampleLimit: PQ017_ROUTE_LIMITS.frameSamples,
    minimumFrameSamples: PQ017_ROUTE_LIMITS.minimumFrameSamples,
    hitchThresholdMs: PQ017_ROUTE_LIMITS.hitchThresholdMs,
    floorP95BudgetMs: PQ017_ROUTE_LIMITS.floorP95BudgetMs,
    activeOperation: null,
    travel: { outbound: null, inbound: null },
    comparison: null,
    primaryInstrumentation: null,
    failures: [],
    warnings: [],
  };
  const lifecycle = {
    limits: {
      siteEntities: PQ017_ROUTE_LIMITS.siteEntities,
      siteRenderRoots: PQ017_ROUTE_LIMITS.siteRenderRoots,
      presentationFixtures: PQ017_ROUTE_LIMITS.presentationFixtures,
    },
    beforeLeave: null,
    away: null,
    afterReturn: null,
    audit: null,
    impactFailure: null,
  };
  let phase = 'boot';
  const mark = (name, detail = {}) => {
    const entry = { name, at: new Date().toISOString(), ...detail };
    steps.push(entry);
    log(`[pq017-route] ${name}`);
    return entry;
  };
  const capture = async (key) => {
    const name = PQ017_SCREENSHOTS[key];
    assert(name, `unknown PQ-017 screenshot key: ${key}`);
    screenshots.push(await shot(page, outputDir, name));
  };

  try {
    const launchSnapshot = await bootToAuthoredFlight({
      page,
      flightTimeoutMs,
      onMilestone: async (name, detail) => {
        if (name === 'main-menu-visible') {
          phase = 'title';
          await capture('title');
        } else if (name === 'new-game-visible') {
          phase = 'new-game';
          await capture('newGame');
        } else if (name === 'authored-flight-ready') {
          phase = 'launch';
          await capture('launch');
        }
        mark(name, detail);
      },
    });
    assert.equal(new URL(page.url()).origin, new URL(expectedRootUrl).origin,
      'public route left the canonical origin during boot');

    phase = 'site-admission';
    await installObservers(page, { captureSystemTiming });
    await waitForSite(page, 'damaged');
    await waitForAdmittedRoot(page);
    await page.waitForFunction(() => (
      window.SF?.state?.traffic?.freighters || []
    ).filter((record) => record?.worldSiteRoute?.hookId === 'helios_recovery_service').length === 1,
    null, { timeout: 20_000 });
    const admissionSnapshot = await snapshot(page);
    assert.equal(admissionSnapshot.entities.rootCount, 1, 'one admitted runtime root is required');
    assert.equal(admissionSnapshot.entities.inertCount, 0,
      'ready presentation must not leave inert component proxies');
    assert(SOCKETS.every((socketId) => admissionSnapshot.socketWorldPoses[socketId]),
      'every declared World Site socket must have a live render pose');
    assert.equal(admissionSnapshot.presentation?.stageId, 'damaged');
    assert.equal(admissionSnapshot.traffic.routes.length, 1,
      'World Site traffic must reserve exactly one ambient slot before NPC jobs');
    mark('admission-and-sockets-ready', {
      admission: admissionSnapshot.entities.rootAdmission,
      sockets: Object.keys(admissionSnapshot.socketWorldPoses),
    });

    phase = 'site-operations';
    await cycleToComponent(page, 'relay_core');
    await settleAtWorldRecord(page, PQ017_ROOT_WORLD_ID,
      SITE_OPERATION_SETTLED_WITHIN, SITE_OPERATION_MAX_SETTLED_SPEED,
      routeTimeout(SITE_ROOT_SETTLE_TIMEOUT_MS), {
        autopilotWorldRecordId: PQ017_RELAY_CORE_WORLD_ID,
      });
    await capture('arrival');
    mark('site-arrival');
    await startPerformanceWindow(page, 'active-site-operations', 'operation:repair_relay_core');
    for (const [componentId, operationId] of OPERATIONS) {
      await setPerformanceWindowPhase(page, `operation:${operationId}`);
      await completeWorldSiteOperation(page, componentId, operationId,
        routeTimeout(SITE_OPERATION_APPROACH_TIMEOUT_MS));
      mark('operation-completed', {
        componentId,
        operationId,
        input: 'B',
        ltEquivalent: true,
      });
      // Let the fixed-step physics loop publish any consequence of materializing an operation's
      // payload, then attribute an unintended rollback to its causal operation. The route's
      // deliberate safety-coupler impact happens in a separate phase below.
      await setPerformanceWindowPhase(page, `wait:${operationId}`);
      await page.waitForTimeout(80);
      await assertNoUnexpectedWorldSiteFailure(page, operationId);
    }
    await setPerformanceWindowPhase(page, 'finalization:opened');
    await waitForSite(page, 'opened');
    performance.activeOperation = await finishPerformanceWindow(page);
    auditPerformanceWindow(performance, performance.activeOperation);
    mark('active-operation-performance-captured', performance.activeOperation.frameTimes);
    await capture('powered');
    await capture('opened');

    phase = 'massline-delivery';
    await deliverPayloadToSelectedReceiver(
      page,
      'settle_field_coil',
      routeTimeout(60_000),
      {
        onPayloadLatched: ({ attempt }) => mark('massline-payload-latched', {
          attempt,
          input: 'Tab -> Space',
          route: 'collision-proven-far-side-relatch',
        }),
      },
    );
    await assertNoUnexpectedWorldSiteFailure(page, 'settle_field_coil');
    await completeWorldSiteOperation(page, 'beacon_array', 'repair_beacon_array',
      routeTimeout(SITE_OPERATION_APPROACH_TIMEOUT_MS));
    await waitForSite(page, 'recovered');
    await capture('recovered');
    const recoveredBeforeSave = await snapshot(page);
    assert.equal(recoveredBeforeSave.record.stageId, 'recovered');
    assert.equal(Object.keys(recoveredBeforeSave.record.completedOperations || {}).length, 6);
    assert.equal(countEvents(recoveredBeforeSave.events, 'economy:grantCredits'), 1);
    assert.equal(countEvents(recoveredBeforeSave.events, 'faction:repDelta'), 1);
    mark('site-recovered');

    phase = 'save-continue';
    await leaveTextEntryFocus(page);
    await page.keyboard.press('F5');
    await page.waitForFunction(() => window.__PQ017_ROUTE__?.saved === true
      && !!localStorage.getItem('sf.save.quick'), null, { timeout: 20_000 });
    mark('quick-save-written');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 60_000 });
    await installObservers(page, { captureSystemTiming });
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    await waitBootOverlayGone(page);
    const menu = page.locator('[data-screen="mainMenu"]');
    await menu.waitFor({ state: 'visible', timeout: 30_000 });
    await capture('continueTitle');
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
    assert.equal(await continueButton.isEnabled(), true, 'title Continue must be enabled after F5');
    await continueButton.click({ timeout: 20_000 });
    await page.waitForFunction(() => window.SF?.state?.mode === 'flight'
      && window.SF?.state?.sites?.worldById?.world_site_helios_relay?.stageId === 'recovered',
    null, { timeout: flightTimeoutMs });
    await waitForAdmittedRoot(page);
    await waitForSiteRenderResidency(page);
    const continued = await snapshot(page);
    assert.deepEqual(continued.record, recoveredBeforeSave.record,
      'title Continue must restore the exact durable World Site record');
    await capture('continued');
    mark('title-continue-restored');

    lifecycle.beforeLeave = await collectSiteResidency(page);
    assert(lifecycle.beforeLeave.siteEntityCount <= lifecycle.limits.siteEntities,
      'World Site entity residency exceeds the declared ceiling before travel');
    assert(lifecycle.beforeLeave.siteRenderRootCount <= lifecycle.limits.siteRenderRoots,
      'World Site render-root residency exceeds the declared ceiling before travel');
    assert(lifecycle.beforeLeave.presentationFixtureCount <= lifecycle.limits.presentationFixtures,
      'World Site presentation fixture residency exceeds the declared ceiling before travel');

    // True lifecycle proof: ordinary chart selection and gate travel out of Helios, followed by
    // the reciprocal ordinary gate route home. No distance-only surrogate, sector event injection,
    // or teleport is accepted.
    phase = 'leave-return';
    const homeSectorId = continued.record.sectorId;
    // Clear the compact component cluster along the player's current outward radial before asking
    // long-range navigation to turn toward a gate. This is still ordinary flight, and prevents a
    // legitimate departure from accidentally becoming the later, explicitly audited crash test.
    await stageAwayFromWorldRecord(page, PQ017_ROOT_WORLD_ID, 420, routeTimeout(120_000));
    await assertNoUnexpectedWorldSiteFailure(page, 'departure-standoff');
    await startPerformanceWindow(page, 'ordinary-outbound-gate-travel');
    const outbound = await travelThroughOrdinaryGate(page, {
      fromSectorId: homeSectorId,
      timeoutMs: routeTimeout(360_000),
    });
    await page.waitForFunction(([siteId, awaySectorId]) => {
      const state = window.SF?.state;
      if (state?.world?.currentSectorId !== awaySectorId) return false;
      return ![...(state?.entities?.values?.() || [])]
        .some((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId);
    }, [PQ017_SITE_ID, outbound.toSectorId], { timeout: 30_000 }).catch(() => blocked(
      'World Site remained materialized after an ordinary sector exit',
    ));
    await assertLifecycleEvent(page, 'sector:exit', homeSectorId);
    await assertLifecycleEvent(page, 'sector:enter', outbound.toSectorId);
    await waitForSiteCleanup(page, lifecycle.beforeLeave.entityIds);
    lifecycle.away = await collectSiteResidency(page, lifecycle.beforeLeave.entityIds);
    performance.travel.outbound = await finishPerformanceWindow(page);
    auditPerformanceWindow(performance, performance.travel.outbound);
    await capture('awaySector');
    mark('site-absent-away', {
      sectorId: outbound.toSectorId,
      residency: lifecycle.away,
      performance: performance.travel.outbound.frameTimes,
    });

    await startPerformanceWindow(page, 'ordinary-inbound-gate-and-site-approach');
    const inbound = await travelThroughOrdinaryGate(page, {
      fromSectorId: outbound.toSectorId,
      toSectorId: homeSectorId,
      timeoutMs: routeTimeout(360_000),
    });
    assert.equal(inbound.toSectorId, homeSectorId, 'reciprocal gate must return to the World Site sector');
    await waitForWorldRecord(page, PQ017_ROOT_WORLD_ID);
    // Return gates place the ship at the sector boundary, outside render admission. Fly the
    // ordinary in-sector leg until the authored root is admitted before asking Tab to expose its
    // component contacts; pending proxies correctly stay non-interactive at long range.
    await flyToPoint(page, await worldPosition(page, PQ017_ROOT_WORLD_ID), 600,
      routeTimeout(180_000));
    await waitForAdmittedRoot(page);
    await waitForSiteRenderResidency(page);
    const rematerialized = await snapshot(page);
    assert.equal(rematerialized.entities.rootCount, 1, 'World Site root must rematerialize exactly once');
    assert.deepEqual(rematerialized.entities.duplicateWorldRecordIds, []);
    assert.deepEqual(rematerialized.record, recoveredBeforeSave.record,
      'ordinary gate round trip must preserve the durable site record');
    await assertLifecycleEvent(page, 'sector:exit', outbound.toSectorId);
    await assertLifecycleEvent(page, 'sector:enter', homeSectorId);
    lifecycle.afterReturn = await collectSiteResidency(page);
    lifecycle.audit = evaluateSiteResidencyLifecycle({
      before: lifecycle.beforeLeave,
      away: lifecycle.away,
      after: lifecycle.afterReturn,
    });
    assert.deepEqual(lifecycle.audit.failures, [],
      'ordinary leave/return must clean and exactly restore site-scoped render residency');
    performance.travel.inbound = await finishPerformanceWindow(page);
    auditPerformanceWindow(performance, performance.travel.inbound);
    await capture('returned');
    mark('site-rematerialized-on-return', {
      sectorId: homeSectorId,
      rootCount: 1,
      residency: lifecycle.afterReturn,
      performance: performance.travel.inbound.frameTimes,
    });

    phase = 'impact-recovery';
    await stageImpactRun(page, `${PQ017_SITE_ID}/component/safety_coupler`, 190,
      routeTimeout(45_000));
    await cycleToComponent(page, 'safety_coupler');
    const stagedImpactState = await page.evaluate((siteId) => ({
      stageId: window.SF?.state?.sites?.worldById?.[siteId]?.stageId || null,
      failureCount: (window.__PQ017_ROUTE__?.events || []).filter((event) => (
        event.name === 'worldSite:failureReceipt' && event.payload?.siteId === siteId
      )).length,
    }), PQ017_SITE_ID);
    assert.deepEqual(auditPq017ImpactRestage(stagedImpactState).failures, [],
      'ordinary impact staging must not damage the recovered World Site or emit a failure receipt');
    // The collision remains a bounded, ordinary-control maneuver, but allow enough simulated
    // flight time for the controller to cancel a worst-case tangential deflection from another
    // solid proxy before it reacquires this small component collider.
    const beforeImpact = await snapshot(page);
    await ramWorldRecord(page, `${PQ017_SITE_ID}/component/safety_coupler`, routeTimeout(45_000));
    await waitForSite(page, 'damaged').catch(() => blocked(
      'capped-speed collision did not reach the authored safety-coupler impact threshold',
    ));
    const afterImpact = await snapshot(page);
    lifecycle.impactFailure = auditSafetyCouplerImpact(beforeImpact, afterImpact);
    assert.deepEqual(lifecycle.impactFailure.failures, [],
      'physical impact must produce exactly one safety-coupler rollback and matching failure receipt');
    await capture('impact');
    mark('physical-impact-rollback', lifecycle.impactFailure);
    await completeWorldSiteOperation(page, 'safety_coupler', 'recover_safety_coupler',
      routeTimeout(SITE_OPERATION_APPROACH_TIMEOUT_MS));
    await waitForSite(page, 'recovered');
    mark('impact-recovered');

    phase = 'map-history';
    await page.keyboard.press('KeyN');
    await page.locator('[data-screen="galaxyMap"]').waitFor({ state: 'visible', timeout: 20_000 });
    await searchAndSelect(page, 'Helios Recovery Relay', /world site|recovery relay/i);
    const historyTab = page.getByRole('tab', { name: 'History', exact: true });
    await historyTab.waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal(await historyTab.isEnabled(), true, 'selected World Site must enable History');
    await historyTab.click();
    const historyList = page.locator('.gm-history-list[aria-label="Recent World Site activity"]');
    await historyList.waitFor({ state: 'visible', timeout: 10_000 });
    assert.match(await page.locator('#gm-tabpanel').innerText(), /RECOVERY RELAY ONLINE/i);
    assert.match(await page.locator('#gm-tabpanel').innerText(), /failure/i);
    await capture('history');
    mark('map-history-visible', { rows: await historyList.locator('li').count() });

    const finalSnapshot = await snapshot(page);
    assert.equal(finalSnapshot.record.stageId, 'recovered');
    assert.equal(finalSnapshot.entities.rootCount, 1);
    assert.deepEqual(finalSnapshot.entities.duplicateWorldRecordIds, []);
    assert((finalSnapshot.record.receipts || []).length <= 64, 'receipt audit must remain bounded');
    assert(Object.keys(finalSnapshot.record.operationCursors || {}).length <= 6,
      'request cursors must remain bounded');
    assert(finalSnapshot.projection?.map?.kind === 'world-site');
    assert((finalSnapshot.projection?.ledger?.recentReceipts || []).length <= 5);
    assert.equal(finalSnapshot.traffic.routes.length, 1,
      'World Site traffic hook must reassign exactly one ambient slot');
    performance.primaryInstrumentation = evaluatePq017PrimaryPerformanceInstrumentation(performance);
    if (primaryAcceptance === true) {
      performance.failures.push(...performance.primaryInstrumentation.failures);
    }
    performance.comparison = evaluatePq017PerformanceComparison(performance);
    performance.failures.push(...performance.comparison.failures);
    assert.deepEqual(performance.failures, [],
      `representative performance windows failed: ${performance.failures.join('; ')}`);

    return {
      pass: true,
      schema: PQ017_ROUTE_SCHEMA,
      primaryAcceptance: primaryAcceptance === true,
      inputSource: 'visible title/map controls and ordinary keyboard-mouse flight',
      injectedGameState: false,
      launchSnapshot,
      admissionSnapshot,
      recoveredBeforeSave,
      continueSnapshot: continued,
      finalSnapshot,
      performance,
      lifecycle,
      steps,
      screenshots,
    };
  } catch (error) {
    error.routePhase = phase;
    error.routeProgress = steps;
    error.routePerformance = performance;
    error.routeLifecycle = lifecycle;
    try {
      const failureSnapshot = await snapshot(page);
      error.routeFailureSnapshot = {
        phase,
        expectedStageId: error.expectedSiteStage || null,
        observedStageId: failureSnapshot.record?.stageId || null,
        ...failureSnapshot,
      };
    } catch (snapshotError) {
      error.routeFailureSnapshot = {
        phase,
        expectedStageId: error.expectedSiteStage || null,
        captureError: snapshotError?.message || String(snapshotError),
      };
    }
    throw error;
  } finally {
    await stopObservers(page).catch(() => {});
    await releaseFlightKeys(page).catch(() => {});
  }
}

async function installObservers(page, { captureSystemTiming = false } = {}) {
  await page.evaluate(({ siteId, systemTiming }) => {
    window.__PQ017_ROUTE__?.stop?.();
    window.__PQ017_ROUTE__ = {
      events: [],
      saved: false,
      frameWindow: null,
      frameRequestId: 0,
      captureSystemTiming: systemTiming === true,
      unsubscribers: [],
    };
    const sink = window.__PQ017_ROUTE__;
    for (const name of [
      'worldSite:operationReceipt',
      'worldSite:failureReceipt',
      'economy:grantCredits',
      'faction:repDelta',
      'save:completed',
      'save:loaded',
      'sector:exit',
      'sector:enter',
      'tether:released',
      'tether:releaseRated',
      'tether:broke',
    ]) {
      sink.unsubscribers.push(window.SF.bus.on(name, (payload) => {
        sink.events.push({ name, payload });
        if (sink.events.length > 256) sink.events.splice(0, sink.events.length - 256);
        if (name === 'save:completed') sink.saved = true;
      }));
    }
    sink.unsubscribers.push(window.SF.bus.on('physics:impact', (payload = {}) => {
      const state = window.SF?.state;
      const a = state?.entities?.get?.(payload.aId);
      const b = state?.entities?.get?.(payload.bId);
      const participant = (entity, fallbackId) => ({
        id: entity?.id ?? fallbackId ?? null,
        alive: entity?.alive !== false,
        type: entity?.type || null,
        role: entity?.data?.role || null,
        kind: entity?.data?.kind || null,
        name: entity?.data?.name || null,
        team: entity?.team ?? null,
        factionId: entity?.factionId || null,
        worldSiteId: entity?.data?.worldSiteId || null,
        worldRecordId: entity?.data?.worldRecordId || null,
        componentId: entity?.data?.worldSiteComponentId || null,
        payloadId: entity?.data?.worldSitePayloadId || null,
        collides: entity?.collides === true,
        physicsMaterial: entity?.physicsBody?.material || null,
      });
      const component = [a, b].find((entity) => entity?.data?.worldSiteId === siteId
        && entity?.data?.worldSiteComponentId);
      if (!component) return;
      sink.events.push({
        name: 'physics:impact',
        payload: {
          tick: payload.tick ?? state?.tick ?? null,
          aId: payload.aId ?? null,
          bId: payload.bId ?? null,
          dp: payload.dp ?? null,
          componentId: component.data.worldSiteComponentId,
          componentWorldRecordId: component.data.worldRecordId || null,
          participants: {
            a: participant(a, payload.aId),
            b: participant(b, payload.bId),
          },
        },
      });
      if (sink.events.length > 256) sink.events.splice(0, sink.events.length - 256);
    }));
    const sampleFrame = (now) => {
      if (window.__PQ017_ROUTE__ !== sink) return;
      const frameWindow = sink.frameWindow;
      if (frameWindow?.active) {
        if (Number.isFinite(frameWindow.lastAt)) {
          frameWindow.samples[frameWindow.head] = now - frameWindow.lastAt;
          frameWindow.phaseTags[frameWindow.head] = frameWindow.currentPhase;
          frameWindow.head = (frameWindow.head + 1) % frameWindow.sampleLimit;
          if (frameWindow.count < frameWindow.sampleLimit) frameWindow.count += 1;
        }
        frameWindow.lastAt = now;
      }
      sink.frameRequestId = requestAnimationFrame(sampleFrame);
    };
    sink.stop = () => {
      if (sink.frameRequestId) cancelAnimationFrame(sink.frameRequestId);
      for (const unsubscribe of sink.unsubscribers.splice(0)) {
        try { unsubscribe(); } catch (_) { /* probe cleanup remains best-effort */ }
      }
      if (sink.frameWindow) sink.frameWindow.active = false;
    };
    sink.frameRequestId = requestAnimationFrame(sampleFrame);
  }, { siteId: PQ017_SITE_ID, systemTiming: captureSystemTiming });
}

async function stopObservers(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => window.__PQ017_ROUTE__?.stop?.());
}

async function startPerformanceWindow(page, label, initialPhase = 'whole-window') {
  await page.evaluate(({ name, sampleLimit, phase }) => {
    const sink = window.__PQ017_ROUTE__;
    if (!sink) throw new Error('PQ-017 observers are not installed');
    sink.frameWindow = {
      label: name,
      sampleLimit,
      samples: new Array(sampleLimit),
      phaseTags: new Array(sampleLimit),
      head: 0,
      count: 0,
      lastAt: null,
      currentPhase: phase,
      active: true,
    };
    window.__SPACEFACE_PERF__?.reset?.();
    window.__SPACEFACE_PERF__?.setSystemTimingEnabled?.(sink.captureSystemTiming === true);
    window.__THREE_GAME_DIAGNOSTICS__?.reset?.();
  }, {
    name: label,
    sampleLimit: PQ017_ROUTE_LIMITS.frameSamples,
    phase: String(initialPhase || 'whole-window').slice(0, 80),
  });
}

async function setPerformanceWindowPhase(page, phase) {
  if (!ACTIVE_PERFORMANCE_PHASES.includes(phase)) {
    blocked(`unsupported active performance phase: ${phase}`);
  }
  await page.evaluate((nextPhase) => {
    const frameWindow = window.__PQ017_ROUTE__?.frameWindow;
    if (!frameWindow?.active) throw new Error('PQ-017 performance window is not active');
    frameWindow.currentPhase = nextPhase;
  }, phase);
}

async function finishPerformanceWindow(page) {
  const raw = await page.evaluate(() => {
    const sink = window.__PQ017_ROUTE__;
    const frameWindow = sink?.frameWindow;
    if (!frameWindow) return null;
    frameWindow.active = false;
    const renderSystem = window.SF?.registry?.get?.('render');
    const renderer = renderSystem?.renderer || null;
    const info = renderer?.info || null;
    const diagnostics = window.__THREE_GAME_DIAGNOSTICS__?.getReport?.() || null;
    const heap = performance?.memory && Number.isFinite(performance.memory.usedJSHeapSize)
      ? {
          status: 'supported',
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        }
      : { status: 'unavailable', reason: 'performance.memory is unavailable in this runtime' };
    const samples = [];
    const phaseTags = [];
    for (let index = 0; index < frameWindow.count; index += 1) {
      const slot = frameWindow.count < frameWindow.sampleLimit
        ? index
        : (frameWindow.head + index) % frameWindow.sampleLimit;
      samples.push(frameWindow.samples[slot]);
      phaseTags.push(frameWindow.phaseTags[slot]);
    }
    const result = {
      label: frameWindow.label,
      samples,
      phaseTags,
      threeWebgl: info ? {
        status: 'supported',
        memory: {
          geometries: Number(diagnostics?.memory?.geometries ?? info.memory?.geometries) || 0,
          textures: Number(diagnostics?.memory?.textures ?? info.memory?.textures) || 0,
          programs: Number(diagnostics?.memory?.programs
            ?? (Array.isArray(info.programs) ? info.programs.length : 0)) || 0,
        },
        render: {
          calls: Number(diagnostics?.render?.calls ?? info.render?.calls) || 0,
          triangles: Number(diagnostics?.render?.triangles ?? info.render?.triangles) || 0,
          points: Number(diagnostics?.render?.points ?? info.render?.points) || 0,
          lines: Number(diagnostics?.render?.lines ?? info.render?.lines) || 0,
        },
      } : { status: 'unavailable', reason: 'live Three WebGLRenderer info is unavailable' },
      diagnostics,
      heap,
    };
    window.__SPACEFACE_PERF__?.setSystemTimingEnabled?.(false);
    return result;
  });
  if (!raw) blocked('performance window disappeared before it could be collected');
  const frameTimes = summarizeBoundedFrameTimes(raw.samples);
  return {
    label: raw.label,
    frameTimes,
    phaseAttribution: summarizeBoundedFramePhases(raw.samples, raw.phaseTags),
    threeWebgl: raw.threeWebgl,
    diagnostics: raw.diagnostics,
    heap: raw.heap,
  };
}

function assertPerformanceWindow(window) {
  assert(window, 'representative performance window is required');
  assert(window.frameTimes.samples >= PQ017_ROUTE_LIMITS.minimumFrameSamples,
    `${window.label} must retain at least ${PQ017_ROUTE_LIMITS.minimumFrameSamples} current frames`);
  assert(window.frameTimes.samples <= PQ017_ROUTE_LIMITS.frameSamples,
    `${window.label} exceeded the bounded frame-sample limit`);
  assert.equal(window.phaseAttribution?.taggedSamples, window.frameTimes.samples,
    `${window.label} phase attribution did not account for every retained frame`);
  assert(window.phaseAttribution.phases.length <= window.phaseAttribution.phaseLimit,
    `${window.label} phase attribution exceeded its bounded label limit`);
  assert.equal(window.frameTimes.floorP95BudgetMet, true,
    `${window.label} exceeded the ${window.frameTimes.floorP95BudgetMs} ms floor-profile p95 budget`);
  assert.equal(window.threeWebgl.status, 'supported',
    `${window.label} did not expose live Three/WebGL counters`);
  assert(['supported', 'unavailable'].includes(window.heap.status),
    `${window.label} did not label JS heap support`);
}

function auditPerformanceWindow(performance, window) {
  try {
    assertPerformanceWindow(window);
  } catch (error) {
    performance.failures.push(`${window?.label || 'unknown'}: ${error.message || error}`);
  }
}

async function travelThroughOrdinaryGate(page, {
  fromSectorId,
  toSectorId = null,
  timeoutMs = 360_000,
} = {}) {
  const currentSectorId = await page.evaluate(() => window.SF?.state?.world?.currentSectorId || null);
  if (currentSectorId !== fromSectorId) {
    blocked(`ordinary gate route expected ${fromSectorId}, found ${currentSectorId || 'no active sector'}`);
  }
  const gate = await nearestGate(page, toSectorId);
  if (!gate || !gate.gateTo || !gate.name) {
    blocked(toSectorId
      ? `no ordinary reciprocal gate from ${fromSectorId} to ${toSectorId}`
      : `no ordinary outbound gate in ${fromSectorId}`);
  }
  if (toSectorId && gate.gateTo !== toSectorId) {
    blocked(`nearest return gate targets ${gate.gateTo}, not ${toSectorId}`);
  }

  await page.keyboard.press('KeyN');
  const map = page.locator('[data-screen="galaxyMap"]');
  await map.waitFor({ state: 'visible', timeout: 20_000 });
  await searchAndSelect(page, gate.name, /gate/i);
  const waypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await waypoint.waitFor({ state: 'visible', timeout: 10_000 });
  await clickPersistentButton(page, waypoint);
  await page.waitForFunction((gateId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const target = state?.entities?.get(gateId);
    if (!player?.pos || !target?.pos || target.alive === false || !target.data?.isGate) return false;
    const range = ((target.data.dockRadius || target.radius || 70) + (player.radius || 0)) * 1.5 + 28;
    return Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) <= range;
  }, gate.entityId, { timeout: timeoutMs }).catch(() => blocked(
    `Set Waypoint autopilot did not reach gate ${gate.name}`,
  ));

  await page.keyboard.press('KeyM');
  await map.waitFor({ state: 'visible', timeout: 20_000 });
  await searchAndSelect(page, gate.gateToName || gate.gateTo, /sector/i);
  const jump = page.getByRole('button', { name: /Set Course & Jump|^Jump$/i }).first();
  await jump.waitFor({ state: 'visible', timeout: 10_000 });
  await clickPersistentButton(page, jump);
  await page.waitForFunction((destinationId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const jumpState = state?.jump?.state || state?.jump?.phase || 'IDLE';
    return state?.world?.currentSectorId === destinationId
      && player?.alive !== false
      && ['IDLE', 'COOLDOWN', 'idle', 'cooldown'].includes(jumpState);
  }, gate.gateTo, { timeout: 90_000 }).catch(() => blocked(
    `ordinary Set Course & Jump did not arrive in ${gate.gateTo}`,
  ));
  return { fromSectorId, toSectorId: gate.gateTo, gate };
}

async function nearestGate(page, desiredSectorId = null) {
  return page.evaluate((wanted) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!player?.pos || !Array.isArray(state?.entityList)) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const entity of state.entityList) {
      if (!entity || entity.alive === false || entity.type !== 'station'
        || !entity.data?.isGate || !entity.pos) continue;
      if (wanted && entity.data.gateTo !== wanted) continue;
      const distance = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
      if (distance >= bestDistance) continue;
      const destinationId = entity.data.gateTo || null;
      const destination = destinationId && state.world?.sectors
        ? state.world.sectors[destinationId]
        : null;
      bestDistance = distance;
      best = {
        entityId: entity.id,
        name: entity.data.name || 'Gate',
        gateTo: destinationId,
        gateToName: destination?.name || destinationId,
        distance,
      };
    }
    return best;
  }, desiredSectorId);
}

async function assertLifecycleEvent(page, name, sectorId) {
  const seen = await page.evaluate(([eventName, expectedSector]) => (
    window.__PQ017_ROUTE__?.events || []
  ).some((event) => event.name === eventName && event.payload?.sectorId === expectedSector), [name, sectorId]);
  if (!seen) blocked(`missing ${name} receipt for ${sectorId}`);
}

async function assertNoUnexpectedWorldSiteFailure(page, operationId) {
  const failure = await page.evaluate((siteId) => (
    window.__PQ017_ROUTE__?.events || []
  ).find((event) => event.name === 'worldSite:failureReceipt'
    && event.payload?.siteId === siteId) || null, PQ017_SITE_ID);
  if (failure) {
    blocked(`unexpected World Site failure after ${operationId}: ${JSON.stringify(failure.payload)}`);
  }
}

async function waitForSite(page, stageId) {
  try {
    await page.waitForFunction(([siteId, expected]) => (
      window.SF?.state?.sites?.worldById?.[siteId]?.stageId === expected
    ), [PQ017_SITE_ID, stageId], { timeout: 20_000 });
  } catch (cause) {
    const error = new Error(`WORLD_SITE_STAGE_TIMEOUT: expected ${stageId}`);
    error.cause = cause;
    error.expectedSiteStage = stageId;
    throw error;
  }
}

async function waitForAdmittedRoot(page) {
  await page.waitForFunction((worldId) => [...(window.SF?.state?.entities?.values?.() || [])]
    .some((entity) => entity?.alive !== false
      && entity?.data?.worldRecordId === worldId
      && entity.presentationAdmission === 'ready'), PQ017_ROOT_WORLD_ID, { timeout: 60_000 });
}

async function waitForWorldRecord(page, worldRecordId) {
  await page.waitForFunction((id) => [...(window.SF?.state?.entities?.values?.() || [])]
    .some((entity) => entity?.alive !== false && entity?.data?.worldRecordId === id),
  worldRecordId, { timeout: 30_000 }).catch(() => blocked(`live world identity did not rematerialize: ${worldRecordId}`));
}

async function waitForSiteRenderResidency(page) {
  await page.waitForFunction((siteId) => {
    const state = window.SF?.state;
    const meshes = window.SF?.registry?.get?.('render')?._meshes;
    if (!state?.entities || !meshes) return false;
    const entities = [...state.entities.values()]
      .filter((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId);
    return entities.length > 0 && entities.every((entity) => meshes.has(entity.id));
  }, PQ017_SITE_ID, { timeout: 60_000 }).catch(() => blocked(
    'World Site entities did not reach bounded render residency',
  ));
}

async function waitForSiteCleanup(page, trackedEntityIds) {
  await page.waitForFunction(([siteId, trackedIds]) => {
    const state = window.SF?.state;
    const meshes = window.SF?.registry?.get?.('render')?._meshes;
    if (!state?.entities || !meshes) return false;
    const currentCount = [...state.entities.values()]
      .filter((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId).length;
    return currentCount === 0 && trackedIds.every((entityId) => !meshes.has(entityId));
  }, [PQ017_SITE_ID, trackedEntityIds], { timeout: 30_000 }).catch(() => blocked(
    'World Site entity/render residency did not clean up after sector exit',
  ));
}

async function collectSiteResidency(page, trackedEntityIds = []) {
  return page.evaluate(({ siteId, trackedIds }) => {
    const state = window.SF?.state;
    const render = window.SF?.registry?.get?.('render');
    const meshes = render?._meshes;
    const entities = [...(state?.entities?.values?.() || [])]
      .filter((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId);
    const entityIds = entities.map((entity) => entity.id).sort((a, b) => Number(a) - Number(b));
    let siteRenderRootCount = 0;
    let siteRenderObjectCount = 0;
    let presentationFixtureCount = 0;
    const presentationFixtureIds = new Set();
    if (meshes) {
      for (const entityId of entityIds) {
        const root = meshes.get(entityId);
        if (!root) continue;
        siteRenderRootCount += 1;
        root.traverse((object) => {
          siteRenderObjectCount += 1;
          const fixtureId = object?.userData?.worldSitePresentationFixtureId;
          if (fixtureId) {
            presentationFixtureCount += 1;
            presentationFixtureIds.add(fixtureId);
          }
        });
      }
    }
    return {
      sectorId: state?.world?.currentSectorId || null,
      entityIds,
      siteEntityCount: entities.length,
      siteRenderRootCount,
      siteRenderObjectCount,
      presentationFixtureCount,
      presentationFixtureIds: [...presentationFixtureIds].sort(),
      trackedRenderRootCount: meshes
        ? trackedIds.filter((entityId) => meshes.has(entityId)).length
        : 0,
      totalLiveEntityCount: [...(state?.entities?.values?.() || [])]
        .filter((entity) => entity?.alive !== false).length,
      totalRenderRootCount: meshes?.size || 0,
    };
  }, { siteId: PQ017_SITE_ID, trackedIds: trackedEntityIds });
}

async function cycleToComponent(page, componentId) {
  for (let press = 0; press < 80; press += 1) {
    const selected = await page.evaluate(() => {
      const state = window.SF?.state;
      const target = state?.player?.targetId != null ? state.entities.get(state.player.targetId) : null;
      return target?.data?.worldSiteComponentId || null;
    });
    if (selected === componentId) return;
    await page.keyboard.press('Tab');
    await page.waitForTimeout(45);
  }
  blocked(`Tab/X target cycle could not select ${componentId}`);
}

async function cycleToWorldRecord(page, worldRecordId, { stableTicks = 0 } = {}) {
  for (let press = 0; press < 240; press += 1) {
    const selected = await page.evaluate(() => {
      const state = window.SF?.state;
      const target = state?.player?.targetId != null ? state.entities.get(state.player.targetId) : null;
      return target ? {
        entityId: target.id,
        worldRecordId: target.data?.worldRecordId || null,
        targetable: target.data?.worldSiteTargetable === true,
        presentationAdmitted: target.data?.worldSitePresentationAdmitted === true,
      } : null;
    });
    if (selected?.worldRecordId === worldRecordId
      && selected.targetable
      && selected.presentationAdmitted) {
      if (!(stableTicks > 0)) return selected;
      const startTick = await page.evaluate(() => Number(window.SF?.state?.tick) || 0);
      await page.waitForFunction(({ id, entityId, tick, delta }) => {
        const state = window.SF?.state;
        const target = state?.player?.targetId != null
          ? state.entities?.get?.(state.player.targetId)
          : null;
        const stillSelected = target?.id === entityId
          && target?.data?.worldRecordId === id
          && target?.data?.worldSiteTargetable === true
          && target?.data?.worldSitePresentationAdmitted === true;
        return !stillSelected || (Number(state?.tick) || 0) >= tick + delta;
      }, {
        id: worldRecordId,
        entityId: selected.entityId,
        tick: startTick,
        delta: stableTicks,
      }, { timeout: 5_000 });
      const stable = await page.evaluate(({ id, entityId }) => {
        const state = window.SF?.state;
        const target = state?.player?.targetId != null
          ? state.entities?.get?.(state.player.targetId)
          : null;
        return target?.id === entityId
          && target?.data?.worldRecordId === id
          && target?.data?.worldSiteTargetable === true
          && target?.data?.worldSitePresentationAdmitted === true;
      }, { id: worldRecordId, entityId: selected.entityId });
      if (stable) return selected;
    }
    await page.keyboard.press('Tab');
    await waitForFixedTicks(page, 1);
  }
  blocked(`Tab target cycle could not select ${worldRecordId}`);
}

async function latchWorldRecord(page, worldRecordId) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForMasslineAcquisitionWorldRecord(page, worldRecordId);
    const startTick = await page.evaluate(() => Number(window.SF?.state?.tick) || 0);
    await page.keyboard.down('Space');
    try {
      await page.waitForFunction(({ id, tick }) => {
        const state = window.SF?.state;
        const tether = state?.player?.tether;
        const target = tether?.targetId != null ? state?.entities?.get?.(tether.targetId) : null;
        return (tether?.active && target?.data?.worldRecordId === id)
          || (Number(state?.tick) || 0) >= tick + 10;
      }, { id: worldRecordId, tick: startTick }, { timeout: 5_000 }).catch(() => {});
    } finally {
      await page.keyboard.up('Space');
    }
    // Publish the release before either accepting the latch or beginning a corrective cut. Without
    // this fixed tick, a second down can merge with the original press in the input grammar.
    await waitForFixedTicks(page, 1);
    const result = await page.evaluate((id) => {
      const state = window.SF?.state;
      const tether = state?.player?.tether;
      const target = tether?.targetId != null ? state?.entities?.get?.(tether.targetId) : null;
      return {
        matched: !!(tether?.active && target?.data?.worldRecordId === id),
        active: !!tether?.active,
        targetWorldRecordId: target?.data?.worldRecordId || null,
      };
    }, worldRecordId);
    if (result.matched) return;
    if (result.active) {
      // A Playwright press can complete entirely between rendered frames when a loaded browser
      // batches several fixed ticks. Hold the cut input across one observed fixed tick so the
      // production tap grammar receives both the down and release transitions.
      await page.keyboard.down('Space');
      await waitForFixedTicks(page, 1);
      await page.keyboard.up('Space');
      await waitForFixedTicks(page, 1);
      await page.waitForFunction(() => !window.SF?.state?.player?.tether?.active,
        null, { timeout: 4_000 }).catch(() => {});
    }
    await waitForFixedTicks(page, 4);
  }
  blocked(`Massline did not latch the selected World Site payload ${worldRecordId}`);
}

// Massline acquisition no longer publishes a pre-latch receipt. Commit 4d00867e replaced
// _consumeAcquisitionReceipt with _acquireCommandTarget, which resolves the target at press time and
// prefers state.player.targetId outright. state.masslineAcquisition is never populated now, so the
// old precondition could never be satisfied. The truthful precondition for the current design is
// that the payload is the selected target and is inside tether reach; the latch itself is still
// verified after the press, against the attached tether's worldRecordId.
async function waitForMasslineAcquisitionWorldRecord(page, worldRecordId) {
  try {
    await page.waitForFunction((id) => {
      const state = window.SF?.state;
      const player = state?.playerId != null ? state.entities?.get?.(state.playerId) : null;
      const selectedEntity = state?.player?.targetId != null
        ? state.entities?.get?.(state.player.targetId)
        : null;
      if (!player?.pos || !selectedEntity?.pos) return false;
      if (selectedEntity.data?.worldRecordId !== id) return false;
      if (selectedEntity.alive === false) return false;
      const surfaceDistance = Math.hypot(
        selectedEntity.pos.x - player.pos.x,
        selectedEntity.pos.z - player.pos.z,
      ) - Math.max(0, Number(selectedEntity.radius) || 0);
      return surfaceDistance <= 390; // tether def maxLength default
    }, worldRecordId, { timeout: 5_000 });
  } catch (_) {
    const diagnostic = await page.evaluate((id) => {
      const state = window.SF?.state;
      const player = state?.playerId != null ? state.entities?.get?.(state.playerId) : null;
      const selectedEntity = state?.player?.targetId != null
        ? state.entities?.get?.(state.player.targetId)
        : null;
      return {
        expectedWorldRecordId: id,
        selectedEntityId: selectedEntity?.id ?? null,
        selectedWorldRecordId: selectedEntity?.data?.worldRecordId || null,
        alive: selectedEntity?.alive ?? null,
        surfaceDistance: player?.pos && selectedEntity?.pos
          ? Math.hypot(
            selectedEntity.pos.x - player.pos.x,
            selectedEntity.pos.z - player.pos.z,
          ) - Math.max(0, Number(selectedEntity.radius) || 0)
          : null,
      };
    }, worldRecordId);
    blocked(`Massline could not reach the selected World Site payload: ${JSON.stringify(diagnostic)}`);
  }
}

async function collectPq017ReceiverDeliveryGeometry(page, { requireTether = null } = {}) {
  return page.evaluate(({ payloadId, receiverId, rootId, siteId, tetherRequirement }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const selected = state?.player?.targetId != null
      ? state.entities?.get?.(state.player.targetId)
      : null;
    const entities = [...(state?.entities?.values?.() || [])];
    const payload = entities.find((entity) => (
      entity?.alive !== false && entity?.data?.worldRecordId === payloadId
    ));
    const receiver = entities.find((entity) => (
      entity?.alive !== false && entity?.data?.worldRecordId === receiverId
    ));
    const root = entities.find((entity) => (
      entity?.alive !== false && entity?.data?.worldRecordId === rootId
    ));
    const tether = state?.player?.tether || null;
    const tetherMatches = !!(tether?.active && payload && tether.targetId === payload.id);
    const masslineInput = state?.input?.actions?.massline || null;
    const breakEvents = (window.__PQ017_ROUTE__?.events || []).filter(
      (event) => event.name === 'tether:broke' && event.payload?.targetId === payload?.id,
    ).length;
    const impactEvents = (window.__PQ017_ROUTE__?.events || []).filter((event) => {
      if (event.name !== 'physics:impact') return false;
      const participants = event.payload?.participants || {};
      const playerIsA = event.payload?.aId === player?.id;
      const playerIsB = event.payload?.bId === player?.id;
      const other = playerIsA ? participants.b : playerIsB ? participants.a : null;
      return !!(other && other.worldSiteId === siteId);
    }).length;
    if (!player?.pos || !player?.vel || !payload?.pos || !payload?.vel
        || !receiver?.pos || !root?.pos
        || (tetherRequirement === true && !tetherMatches)
        || (tetherRequirement === false && tether?.active === true)) return null;
    const obstacles = entities
      .filter((entity) => {
        const radius = Number(entity?.radius);
        if (entity === player || entity === receiver || entity === payload
          || entity?.alive === false || !entity?.pos
          || !Number.isFinite(radius) || radius < 0.5
          || entity?.type === 'fx' || entity?.type === 'projectile') return false;
        return Math.hypot(entity.pos.x - receiver.pos.x, entity.pos.z - receiver.pos.z) <= 700;
      })
      .map((entity) => ({
        entityId: entity.id ?? null,
        worldRecordId: entity.data?.worldRecordId || null,
        worldSiteId: entity.data?.worldSiteId || null,
        type: entity.type || entity.data?.kind || null,
        role: entity.data?.role || entity.role || null,
        x: entity.pos.x,
        z: entity.pos.z,
        vx: Number(entity.vel?.x) || 0,
        vz: Number(entity.vel?.z) || 0,
        radius: Number(entity.radius),
        collides: entity.collides === true,
      }));
    return {
      tick: Number(state?.tick) || 0,
      localControlKeyupSequence: Number(
        window.__PQ017_ROUTE__?.localControlKeyupObserver?.sequence,
      ) || 0,
      player: {
        x: player.pos.x,
        z: player.pos.z,
        vx: Number(player.vel.x) || 0,
        vz: Number(player.vel.z) || 0,
        rot: Number(player.rot) || 0,
        angVel: Number(player.angVel) || 0,
      },
      playerRadius: Math.max(0, Number(player.radius) || 0),
      payload: {
        x: payload.pos.x,
        z: payload.pos.z,
        vx: Number(payload.vel.x) || 0,
        vz: Number(payload.vel.z) || 0,
      },
      payloadAlive: payload.alive !== false,
      payloadCollides: payload.collides === true,
      payloadRadius: Math.max(0, Number(payload.radius) || 0),
      receiver: { x: receiver.pos.x, z: receiver.pos.z },
      receiverRadius: Math.max(0, Number(receiver.radius) || 0),
      root: { x: root.pos.x, z: root.pos.z },
      rootCollides: root.collides === true,
      breakEvents,
      impactEvents,
      masslineInput: {
        lineControl: masslineInput?.lineControl === true,
        lineLength: Number(masslineInput?.lineLength) || 0,
      },
      selectedWorldRecordId: selected?.data?.worldRecordId || null,
      selectedComponentId: selected?.data?.worldSiteComponentId || null,
      lineDistance: Math.hypot(player.pos.x - payload.pos.x, player.pos.z - payload.pos.z),
      tether: tether ? {
        active: tether.active === true,
        targetId: tether.targetId ?? null,
        targetMatches: tetherMatches,
        restLength: Number(tether.restLength) || 0,
        automaticBreakAllowed: tether.automaticBreakAllowed === true,
      } : {
        active: false,
        targetId: null,
        targetMatches: false,
        restLength: 0,
        automaticBreakAllowed: false,
      },
      obstacles,
    };
  }, {
    payloadId: PQ017_PAYLOAD_WORLD_ID,
    receiverId: `${PQ017_SITE_ID}/component/receiver_collar`,
    rootId: PQ017_ROOT_WORLD_ID,
    siteId: PQ017_SITE_ID,
    tetherRequirement: requireTether,
  });
}

function createPq017CrossingPlan(geometry, {
  maximumRouteLength = null,
  includePayloadAsShipObstacle = false,
} = {}) {
  if (!geometry) return null;
  const inferredRestLength = geometry.tether?.active === true
    ? geometry.tether.restLength
    : Math.max(1, geometry.lineDistance);
  return planPq017ReceiverCrossingPull({
    playerPosition: geometry.player,
    payloadPosition: geometry.payload,
    payloadCollides: geometry.payloadCollides === true,
    receiverPosition: geometry.receiver,
    rootPosition: geometry.root,
    rootCollides: geometry.rootCollides === true,
    tetherRestLength: inferredRestLength,
    maxTetherLength: SITE_TETHER_MAX_LENGTH,
    payloadRadius: geometry.payloadRadius,
    receiverRadius: geometry.receiverRadius,
    playerRadius: geometry.playerRadius,
    obstacles: geometry.obstacles,
    shipObstacles: includePayloadAsShipObstacle ? [{
      entityId: 'released-payload',
      worldRecordId: PQ017_PAYLOAD_WORLD_ID,
      type: 'world_site_payload',
      x: geometry.payload.x,
      z: geometry.payload.z,
      radius: geometry.payloadRadius,
      allowEscapeFromOverlap: true,
    }] : [],
    maxServiceSpeed: 6,
    brakeAccel: SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
    clearanceMargin: 1,
    overlapMargin: 0.5,
    maximumRouteLength,
    releasedDetour: includePayloadAsShipObstacle,
  });
}

function createPq017AttachedStandoffPlan(geometry, decision) {
  const anchorX = Number(decision?.payloadAnchor?.x);
  const anchorZ = Number(decision?.payloadAnchor?.z);
  const playerX = Number(geometry?.player?.x);
  const playerZ = Number(geometry?.player?.z);
  const targetDistance = Number(decision?.targetDistance);
  const minimumReleaseDistance = Number(decision?.minimumReleaseDistance);
  const payoutRestLength = Number(decision?.payoutRestLength);
  if (![anchorX, anchorZ, playerX, playerZ, targetDistance,
    minimumReleaseDistance, payoutRestLength].every(Number.isFinite)) return null;
  const dx = playerX - anchorX;
  const dz = playerZ - anchorZ;
  const initialRadialDistance = Math.hypot(dx, dz);
  if (!(initialRadialDistance > 1e-6)) return null;
  const direction = {
    x: dx / initialRadialDistance,
    z: dz / initialRadialDistance,
  };
  const minimumRetainedSlack = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN * 0.5;
  const maximumRadialDistance = payoutRestLength - minimumRetainedSlack;
  const corridorHalfWidth = PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN * 0.5;
  const headingGeometry = derivePq017StandoffHeadingTolerance({
    targetDistance,
    radialDistance: initialRadialDistance,
    corridorHalfWidth,
  });
  if (!headingGeometry) return null;
  return {
    start: { x: playerX, z: playerZ },
    payloadAnchor: { x: anchorX, z: anchorZ },
    direction,
    target: {
      x: anchorX + direction.x * targetDistance,
      z: anchorZ + direction.z * targetDistance,
    },
    targetDistance,
    minimumReleaseDistance,
    payoutRestLength,
    initialRadialDistance,
    corridorHalfWidth,
    headingTolerance: headingGeometry.headingTolerance,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack,
    maximumRadialDistance,
    proofEndpoint: {
      x: anchorX + direction.x * maximumRadialDistance,
      z: anchorZ + direction.z * maximumRadialDistance,
    },
  };
}

function pq017StandoffRealSolidObstacles(geometry) {
  return (Array.isArray(geometry?.obstacles) ? geometry.obstacles : []).filter(
    (obstacle) => obstacle.worldRecordId !== PQ017_PAYLOAD_WORLD_ID
      && obstacle.collides !== false,
  );
}

function pq017StandoffObservation(geometry, baselineBreakEvents, baselineImpactEvents) {
  return {
    ...geometry,
    breakEvents: geometry ? geometry.breakEvents - baselineBreakEvents : null,
    impactEvents: geometry ? geometry.impactEvents - baselineImpactEvents : null,
  };
}

async function tapPq017PublicYaw(page, turnDirection) {
  if (turnDirection !== -1 && turnDirection !== 1) {
    blocked(`public yaw tap received invalid direction: ${turnDirection}`);
  }
  await releaseFlightKeys(page);
  const turnKey = turnDirection > 0 ? 'KeyD' : 'KeyA';
  const startedTick = await page.evaluate(() => Number(window.SF?.state?.tick) || 0);
  await page.keyboard.down(turnKey);
  try {
    await waitForFixedTicks(page, 1);
  } finally {
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyD');
  }
  const releasedTick = await page.evaluate(() => Number(window.SF?.state?.tick) || 0);
  await waitForFixedTicks(page, 1);
  const neutralTick = await page.evaluate(() => Number(window.SF?.state?.tick) || 0);
  if (releasedTick <= startedTick || neutralTick <= releasedTick) {
    blocked(`public yaw tap did not publish distinct tap and neutral receipts: ${JSON.stringify({
      turnKey,
      startedTick,
      releasedTick,
      neutralTick,
    })}`);
  }
  return {
    turnKey,
    turnDirection,
    startedTick,
    releasedTick,
    neutralTick,
    tapTickDelta: releasedTick - startedTick,
    neutralTickDelta: neutralTick - releasedTick,
  };
}

async function waitForPq017StandoffNeutralSettlement(
  page,
  observeDecision,
  initialGeometry,
  initialDecision,
  {
    baselineBreakEvents,
    baselineImpactEvents,
    maxDistinctTicks = 120,
  },
) {
  await releaseFlightKeys(page);
  let geometry = initialGeometry;
  let decision = initialDecision;
  let previousGeometry = initialGeometry;
  let settlement = {};
  let diagnostic = null;
  const payloadAnchor = decision?.payloadAnchor;
  const initialAnchorLineDistance = Math.hypot(
    Number(initialGeometry?.player?.x) - Number(payloadAnchor?.x),
    Number(initialGeometry?.player?.z) - Number(payloadAnchor?.z),
  );
  const minimumAnchorLineDistance = Math.max(0, initialAnchorLineDistance - 0.25);
  for (let sample = 0; sample <= maxDistinctTicks; sample += 1) {
    if (!geometry) {
      blocked('neutral standoff settlement lost its live tether geometry');
    }
    decision = observeDecision(geometry, decision);
    if (!decision.safe) {
      blocked(`neutral standoff settlement lost its nonbreaking Massline: ${JSON.stringify({
        decision,
        settlement,
      })}`);
    }
    const realSolidObstacles = pq017StandoffRealSolidObstacles(geometry);
    const sweptSegment = previousGeometry === geometry
      ? { safe: true, reason: 'neutral-origin-sample', closestConstraint: null }
      : auditPq017RouteSweep(
        previousGeometry.player,
        geometry.player,
        realSolidObstacles,
        geometry.playerRadius,
      );
    settlement = decidePq017StandoffNeutralSettlement(
      pq017StandoffObservation(geometry, baselineBreakEvents, baselineImpactEvents),
      settlement,
      {
        payloadAnchor,
        minimumAnchorLineDistance,
        maxDistinctTicks: 120,
      },
    );
    diagnostic = {
      sample,
      geometry,
      decision,
      settlement,
      sweptSegment,
      realSolidObstacles,
    };
    if (!sweptSegment.safe) {
      blocked(`neutral standoff settlement crossed a real solid: ${JSON.stringify(diagnostic)}`);
    }
    if (!settlement.safe) {
      blocked(`neutral standoff settlement refused live drift: ${JSON.stringify(diagnostic)}`);
    }
    if (settlement.action === 'settled') {
      return { geometry, decision, settlement };
    }
    previousGeometry = geometry;
    await waitForFixedTicks(page, 1);
    geometry = await collectPq017ReceiverDeliveryGeometry(
      page,
      { requireTether: true },
    );
  }
  blocked(`neutral standoff settlement exhausted its bounded ticks: ${JSON.stringify(diagnostic)}`);
}

async function waitForPq017StandoffYawAlignment(
  page,
  observeDecision,
  initialGeometry,
  initialDecision,
  {
    baselineBreakEvents,
    baselineImpactEvents,
    yawReanchors = 0,
  },
) {
  await releaseFlightKeys(page);
  let geometry = initialGeometry;
  let decision = initialDecision;
  let previousGeometry = initialGeometry;
  let alignment = {};
  const alignmentTrace = [];
  const yawTapReceipts = [];
  let yawTapCount = 0;
  const payloadAnchor = decision?.payloadAnchor;
  let diagnostic = null;
  try {
    for (let sample = 0; sample <= 120; sample += 1) {
      if (!geometry) {
        blocked('pre-plan yaw alignment lost its live tether geometry');
      }
      decision = observeDecision(geometry, decision);
      if (!decision.safe) {
        blocked(`pre-plan yaw alignment lost its nonbreaking Massline: ${JSON.stringify({
          decision,
          alignment,
          alignmentTrace,
        })}`);
      }
      const realSolidObstacles = pq017StandoffRealSolidObstacles(geometry);
      const sweptSegment = previousGeometry === geometry
        ? { safe: true, reason: 'yaw-origin-sample', closestConstraint: null }
        : auditPq017RouteSweep(
          previousGeometry.player,
          geometry.player,
          realSolidObstacles,
          geometry.playerRadius,
        );
      const prospectivePlan = createPq017AttachedStandoffPlan(geometry, decision);
      if (!prospectivePlan) {
        blocked(`pre-plan yaw alignment could not derive its prospective radial: ${JSON.stringify({
          geometry,
          decision,
          alignmentTrace,
        })}`);
      }
      const preflight = evaluatePq017StandoffPreflight(
        prospectivePlan,
        realSolidObstacles,
        geometry.playerRadius,
      );
      const priorAlignment = alignment;
      alignment = decidePq017StandoffYawAlignment(
        pq017StandoffObservation(geometry, baselineBreakEvents, baselineImpactEvents),
        alignment,
        {
          payloadAnchor,
          targetDistance: decision.targetDistance,
          corridorHalfWidth: PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN * 0.5,
          usableCorridor: 0.75,
          maxDistinctTicks: 120,
          maxStagnantTicks: 20,
        },
      );
      const reanchorDecision = decidePq017PrePlanYawReanchor(
        alignment,
        preflight,
        {
          lastTick: priorAlignment.lastTick,
          yawReanchors,
        },
        {
          maximumReanchors: 1,
          reanchorThreshold: alignment.maxPlayerDrift * 0.75,
        },
      );
      alignmentTrace.push({
        tick: geometry.tick,
        rot: geometry.player.rot,
        desiredHeading: alignment.desiredHeading,
        headingError: alignment.headingError,
        absoluteHeadingError: alignment.absoluteHeadingError,
        action: alignment.action,
        turnDirection: alignment.turnDirection,
        anchorLineDistance: alignment.anchorLineDistance,
        playerDrift: alignment.playerDrift,
        reanchorDecision,
      });
      if (alignmentTrace.length > 32) alignmentTrace.shift();
      diagnostic = {
        sample,
        geometry,
        decision,
        alignment,
        sweptSegment,
        preflight,
        alignmentTrace,
        yawTapCount,
        yawTapReceipts,
        yawReanchors,
        reanchorDecision,
      };
      if (!sweptSegment.safe) {
        blocked(`pre-plan yaw alignment crossed a real solid: ${JSON.stringify(diagnostic)}`);
      }
      if (!alignment.safe || alignment.action === 'blocked') {
        blocked(`pre-plan yaw alignment refused live motion: ${JSON.stringify(diagnostic)}`);
      }
      if (preflight.action === 'blocked-static') {
        blocked(`pre-plan yaw alignment radial met a static solid: ${JSON.stringify(diagnostic)}`);
      }
      if (preflight.action === 'wait-traffic') {
        return {
          geometry,
          decision,
          trafficReentered: true,
          alignment,
          alignmentTrace,
          yawReanchors,
        };
      }
      if (reanchorDecision.action === 'blocked') {
        blocked(`pre-plan yaw re-anchor budget exhausted: ${JSON.stringify(diagnostic)}`);
      }
      if (reanchorDecision.action === 'reanchor') {
        await releaseFlightKeys(page);
        return {
          geometry,
          decision,
          trafficReentered: false,
          reanchorRequired: true,
          yawReanchors: reanchorDecision.nextYawReanchors,
          reanchorReceipt: {
            yawReanchors: reanchorDecision.nextYawReanchors,
            reason: reanchorDecision.reason,
            playerDrift: reanchorDecision.playerDrift,
            projectedPlayerDrift: reanchorDecision.projectedPlayerDrift,
            playerOrigin: alignment.playerOrigin,
            reanchorPosition: { x: geometry.player.x, z: geometry.player.z },
          },
          alignment,
          alignmentTrace,
          yawTapCount,
          yawTapReceipts,
        };
      }
      if (alignment.action === 'aligned') {
        await releaseFlightKeys(page);
        if (previousGeometry !== geometry) {
          return {
            geometry,
            decision,
            trafficReentered: false,
            alignment,
            alignmentTrace,
            yawTapCount,
            yawTapReceipts,
          };
        }
        previousGeometry = geometry;
        await waitForFixedTicks(page, 1);
        geometry = await collectPq017ReceiverDeliveryGeometry(
          page,
          { requireTether: true },
        );
        continue;
      }
      if (alignment.action === 'settle-yaw') {
        await releaseFlightKeys(page);
        previousGeometry = geometry;
        await waitForFixedTicks(page, 1);
        geometry = await collectPq017ReceiverDeliveryGeometry(
          page,
          { requireTether: true },
        );
        continue;
      }
      if (yawTapCount >= 120) {
        blocked(`pre-plan yaw tap budget exhausted: ${JSON.stringify(diagnostic)}`);
      }
      previousGeometry = geometry;
      const tapReceipt = await tapPq017PublicYaw(page, alignment.turnDirection);
      yawTapCount += 1;
      yawTapReceipts.push(tapReceipt);
      if (yawTapReceipts.length > 32) yawTapReceipts.shift();
      geometry = await collectPq017ReceiverDeliveryGeometry(
        page,
        { requireTether: true },
      );
    }
  } finally {
    await releaseFlightKeys(page);
  }
  blocked(`pre-plan yaw alignment exhausted its bounded ticks: ${JSON.stringify(diagnostic)}`);
}

async function waitForPq017StandoffTrafficClear(
  page,
  observeDecision,
  initialGeometry,
  initialDecision,
  {
    baselineBreakEvents,
    baselineImpactEvents,
    initiallySettled = false,
  },
) {
  let geometry = initialGeometry;
  let decision = initialDecision;
  if (!initiallySettled) {
    const resettled = await waitForPq017StandoffNeutralSettlement(
      page,
      observeDecision,
      geometry,
      decision,
      {
        baselineBreakEvents,
        baselineImpactEvents,
        maxDistinctTicks: 120,
      },
    );
    geometry = resettled.geometry;
    decision = resettled.decision;
  }
  let previousGeometry = geometry;
  const waitOrigin = { x: geometry.player.x, z: geometry.player.z };
  let trafficRuntime = {};
  let trafficObserved = false;
  let diagnostic = null;
  while (true) {
    const radialPlan = createPq017AttachedStandoffPlan(geometry, decision);
    if (!radialPlan) {
      blocked(`traffic wait could not derive a live outward radial: ${JSON.stringify({
        geometry,
        decision,
      })}`);
    }
    const realSolidObstacles = pq017StandoffRealSolidObstacles(geometry);
    const preflight = evaluatePq017StandoffPreflight(
      radialPlan,
      realSolidObstacles,
      geometry.playerRadius,
    );
    if (preflight.action === 'wait-traffic') trafficObserved = true;
    if (preflight.safe && preflight.action === 'clear' && !trafficObserved) {
      return {
        geometry,
        decision,
        trafficRuntime: {
          safe: true,
          action: 'proceed',
          reason: 'standoff-no-moving-traffic-observed',
          startedTick: geometry.tick,
          lastTick: geometry.tick,
          elapsedTicks: 0,
          clearSamples: 0,
        },
      };
    }
    trafficRuntime = decidePq017StandoffTrafficWait(preflight, trafficRuntime, {
      currentTick: geometry.tick,
      maxTrafficTicks: 360,
      requiredClearSamples: 3,
    });
    const neutralDrift = Math.hypot(
      geometry.player.x - waitOrigin.x,
      geometry.player.z - waitOrigin.z,
    );
    diagnostic = {
      geometry,
      decision,
      radialPlan,
      preflight,
      trafficRuntime,
      neutralDrift,
      realSolidObstacles,
    };
    if (neutralDrift > PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN + 1e-6) {
      blocked(`traffic wait exceeded its neutral drift corridor: ${JSON.stringify(diagnostic)}`);
    }
    if (!trafficRuntime.safe || trafficRuntime.action === 'blocked') {
      blocked(`traffic wait could not prove the outward radial: ${JSON.stringify(diagnostic)}`);
    }
    if (trafficRuntime.action === 'proceed') {
      return { geometry, decision, trafficRuntime };
    }
    await releaseFlightKeys(page);
    await waitForFixedTicks(page, 6);
    const nextGeometry = await collectPq017ReceiverDeliveryGeometry(
      page,
      { requireTether: true },
    );
    if (!nextGeometry || nextGeometry.tick <= geometry.tick) {
      blocked(`traffic wait did not advance six distinct fixed ticks: ${JSON.stringify({
        beforeTick: geometry?.tick ?? null,
        afterTick: nextGeometry?.tick ?? null,
        trafficRuntime,
      })}`);
    }
    decision = observeDecision(nextGeometry, decision);
    if (!decision.safe) {
      blocked(`traffic wait lost its nonbreaking Massline: ${JSON.stringify({
        decision,
        trafficRuntime,
      })}`);
    }
    const nextRealSolidObstacles = pq017StandoffRealSolidObstacles(nextGeometry);
    const sweptSegment = auditPq017RouteSweep(
      previousGeometry.player,
      nextGeometry.player,
      nextRealSolidObstacles,
      nextGeometry.playerRadius,
    );
    if (!sweptSegment.safe) {
      blocked(`traffic wait neutral drift crossed a real solid: ${JSON.stringify({
        sweptSegment,
        geometry: nextGeometry,
        trafficRuntime,
      })}`);
    }
    const playerSpeed = Math.hypot(nextGeometry.player.vx, nextGeometry.player.vz);
    const payloadSpeed = Math.hypot(nextGeometry.payload.vx, nextGeometry.payload.vz);
    previousGeometry = nextGeometry;
    geometry = nextGeometry;
    if (playerSpeed > PQ017_RELEASED_DETOUR_SETTLED_SPEED + 1e-6
        || payloadSpeed > PQ017_RELEASED_DETOUR_SETTLED_SPEED + 1e-6) {
      const resettled = await waitForPq017StandoffNeutralSettlement(
        page,
        observeDecision,
        geometry,
        decision,
        {
          baselineBreakEvents,
          baselineImpactEvents,
          maxDistinctTicks: 120,
        },
      );
      geometry = resettled.geometry;
      decision = resettled.decision;
      previousGeometry = geometry;
      trafficRuntime = {
        startedTick: trafficRuntime.startedTick,
        clearSamples: 0,
      };
    }
  }
}

async function preparePq017AlignedStandoffPlan(
  page,
  observeDecision,
  initialGeometry,
  initialDecision,
  {
    baselineBreakEvents,
    baselineImpactEvents,
    initiallySettled = false,
  },
) {
  let geometry = initialGeometry;
  let decision = initialDecision;
  let settledAtEntry = initiallySettled;
  let yawReanchors = 0;
  const reanchorTrace = [];
  let diagnostic = null;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const cleared = await waitForPq017StandoffTrafficClear(
      page,
      observeDecision,
      geometry,
      decision,
      {
        baselineBreakEvents,
        baselineImpactEvents,
        initiallySettled: settledAtEntry,
      },
    );
    geometry = cleared.geometry;
    decision = cleared.decision;
    const aligned = await waitForPq017StandoffYawAlignment(
      page,
      observeDecision,
      geometry,
      decision,
      {
        baselineBreakEvents,
        baselineImpactEvents,
        yawReanchors,
      },
    );
    geometry = aligned.geometry;
    decision = aligned.decision;
    if (aligned.trafficReentered) {
      settledAtEntry = false;
      diagnostic = { cycle, cleared, aligned };
      continue;
    }
    if (aligned.reanchorRequired) {
      yawReanchors = aligned.yawReanchors;
      reanchorTrace.push(aligned.reanchorReceipt);
      settledAtEntry = false;
      diagnostic = {
        cycle,
        cleared,
        aligned,
        yawReanchors,
        reanchorTrace,
      };
      continue;
    }
    const plan = createPq017AttachedStandoffPlan(geometry, decision);
    if (!plan) {
      blocked(`aligned standoff plan is invalid: ${JSON.stringify({
        cycle,
        geometry,
        decision,
        aligned,
      })}`);
    }
    const realSolidObstacles = pq017StandoffRealSolidObstacles(geometry);
    const preflight = evaluatePq017StandoffPreflight(
      plan,
      realSolidObstacles,
      geometry.playerRadius,
    );
    diagnostic = {
      cycle,
      geometry,
      decision,
      aligned,
      yawReanchors,
      reanchorTrace,
      plan,
      preflight,
    };
    if (preflight.action === 'blocked-static') {
      blocked(`aligned standoff radial met a static solid: ${JSON.stringify(diagnostic)}`);
    }
    if (preflight.action === 'wait-traffic') {
      settledAtEntry = false;
      continue;
    }
    if (!preflight.safe || preflight.action !== 'clear') {
      blocked(`aligned standoff radial preflight was invalid: ${JSON.stringify(diagnostic)}`);
    }
    return {
      geometry,
      decision,
      plan,
      preflight,
      aligned,
      yawReanchors,
      reanchorTrace,
    };
  }
  blocked(`aligned standoff plan exhausted bounded traffic/yaw cycles: ${JSON.stringify(diagnostic)}`);
}

async function pulsePq017AttachedRadialBrake(
  page,
  plan,
  startGeometry,
  {
    baselineBreakEvents,
    baselineImpactEvents,
    targetRadialSpeed = PQ017_RELEASED_DETOUR_SETTLED_SPEED,
  },
) {
  const directionX = Number(plan?.direction?.x);
  const directionZ = Number(plan?.direction?.z);
  const startTick = Number(startGeometry?.tick);
  const startRadialSpeed = (Number(startGeometry?.player?.vx) || 0) * directionX
    + (Number(startGeometry?.player?.vz) || 0) * directionZ;
  await releaseFlightKeys(page);
  await page.keyboard.down('KeyS');
  try {
    await page.waitForFunction(({
      startTick,
      directionX,
      directionZ,
      targetRadialSpeed,
    }) => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId);
      const radialSpeed = (Number(player?.vel?.x) || 0) * directionX
        + (Number(player?.vel?.z) || 0) * directionZ;
      const tickDelta = (Number(state?.tick) || 0) - startTick;
      return radialSpeed <= targetRadialSpeed || radialSpeed <= 0 || tickDelta >= 12;
    }, {
      startTick,
      directionX,
      directionZ,
      targetRadialSpeed,
    }, { timeout: 5_000 }).catch(() => {});
  } finally {
    await page.keyboard.up('KeyS');
  }
  const end = await collectPq017ReceiverDeliveryGeometry(page);
  const currentRadialSpeed = end
    ? end.player.vx * directionX + end.player.vz * directionZ
    : Number.NaN;
  const progress = decidePq017AttachedRadialBrakeProgress({
    startTick,
    currentTick: end?.tick,
    startRadialSpeed,
    currentRadialSpeed,
    targetRadialSpeed,
    maxTicks: 12,
  });
  const breakEvents = end ? end.breakEvents - baselineBreakEvents : null;
  const impactEvents = end ? end.impactEvents - baselineImpactEvents : null;
  const targetMatches = end?.tether?.targetMatches === true;
  const automaticBreakAllowed = end?.tether?.automaticBreakAllowed === true;
  const distinctTick = Number(end?.tick) > startTick;
  const tetherSafe = end?.tether?.active === true
    && targetMatches
    && !automaticBreakAllowed;
  const safe = tetherSafe
    && breakEvents === 0
    && impactEvents === 0
    && distinctTick
    && progress.signedProgress;
  const reason = !end
    ? 'attached-radial-brake-lost-geometry'
    : !tetherSafe
      ? 'attached-radial-brake-lost-nonbreaking-massline'
      : breakEvents !== 0
        ? 'attached-radial-brake-observed-break'
        : impactEvents !== 0
          ? 'attached-radial-brake-observed-world-site-impact'
          : !distinctTick
            ? 'attached-radial-brake-missing-distinct-tick'
            : !progress.signedProgress
              ? 'attached-radial-brake-made-no-signed-progress'
              : null;
  return {
    safe,
    reason,
    start: {
      tick: startTick,
      radialSpeed: startRadialSpeed,
    },
    end,
    currentRadialSpeed,
    progress,
    breakEvents,
    impactEvents,
    targetMatches,
    automaticBreakAllowed,
    distinctTick,
  };
}

async function flyPq017AttachedStandoffRadial(
  page,
  initialPlan,
  observeDecision,
  initialDecision,
  {
    baselineBreakEvents,
    baselineImpactEvents,
    timeoutMs = 45_000,
  },
) {
  const deadline = Date.now() + Math.max(5_000, Math.trunc(Number(timeoutMs) || 0));
  const sampleLimit = 600;
  let samples = 0;
  let runtime = {};
  let previousPosition = null;
  let plan = initialPlan;
  let decision = initialDecision;
  const controlTrace = [];
  const yawTapReceipts = [];
  const radialBrakeReceipts = [];
  const replanTrace = [];
  let yawTapCount = 0;
  let radialReplans = 0;
  let diagnostic = null;
  try {
    while (Date.now() < deadline && samples < sampleLimit) {
      const geometry = await collectPq017ReceiverDeliveryGeometry(
        page,
        { requireTether: true },
      );
      if (!geometry) {
        blocked('attached standoff lost its live tether geometry');
      }
      decision = observeDecision(geometry, decision);
      if (!decision.safe) {
        blocked(`attached standoff lost its nonbreaking Massline: ${JSON.stringify(decision)}`);
      }
      const realSolidObstacles = geometry.obstacles.filter(
        (obstacle) => obstacle.worldRecordId !== PQ017_PAYLOAD_WORLD_ID
          && obstacle.collides !== false,
      );
      const control = decidePq017AttachedStandoffRadialControl({
        ...geometry,
        breakEvents: geometry.breakEvents - baselineBreakEvents,
        impactEvents: geometry.impactEvents - baselineImpactEvents,
      }, plan, runtime);
      const sweptSegment = previousPosition
        ? auditPq017RouteSweep(
          previousPosition,
          geometry.player,
          realSolidObstacles,
          geometry.playerRadius,
        )
        : { safe: true, reason: 'radial-origin-sample', closestConstraint: null };
      const remainingPlan = {
        ...plan,
        start: { x: geometry.player.x, z: geometry.player.z },
      };
      const preflight = evaluatePq017StandoffPreflight(
        remainingPlan,
        realSolidObstacles,
        geometry.playerRadius,
      );
      const replanDecision = decidePq017AttachedStandoffReplan(
        control,
        plan,
        {
          ...runtime,
          radialReplans,
        },
        {
          maximumReplans: 3,
          replanThreshold: plan.maximumRadialRetreat * 0.75,
        },
      );
      controlTrace.push({
        tick: geometry.tick,
        rot: geometry.player.rot,
        angVel: geometry.player.angVel,
        sampledYawRate: control.sampledYawRate,
        stableYawSamples: control.stableYawSamples,
        yawNeutralArmed: control.yawNeutralArmed,
        radialDistance: control.radialDistance,
        radialSpeed: control.radialSpeed,
        headingError: control.headingError,
        action: control.action,
        turnDirection: control.turnDirection,
        outwardPulses: control.outwardPulses,
      });
      if (controlTrace.length > 32) controlTrace.shift();
      diagnostic = {
        samples,
        geometry,
        decision,
        control,
        sweptSegment,
        preflight,
        plan,
        realSolidObstacles,
        controlTrace,
        yawTapCount,
        yawTapReceipts,
        radialBrakeReceipts,
        radialReplans,
        replanDecision,
        replanTrace,
      };
      if (!sweptSegment.safe) {
        blocked(`attached standoff crossed a real solid: ${JSON.stringify(diagnostic)}`);
      }
      if (!control.safe || control.action === 'blocked') {
        blocked(`attached standoff radial control refused live motion: ${JSON.stringify(diagnostic)}`);
      }
      if (preflight.action === 'blocked-static') {
        blocked(`attached standoff remaining radial met a static solid: ${JSON.stringify(diagnostic)}`);
      }
      if (replanDecision.action === 'blocked') {
        blocked(`attached standoff exhausted bounded pre-W replans: ${JSON.stringify(diagnostic)}`);
      }
      if (replanDecision.action === 'replan') {
        await releaseFlightKeys(page);
        const oldPlan = plan;
        const replanned = await preparePq017AlignedStandoffPlan(
          page,
          observeDecision,
          geometry,
          decision,
          {
            baselineBreakEvents,
            baselineImpactEvents,
            initiallySettled: false,
          },
        );
        radialReplans = replanDecision.nextRadialReplans;
        replanTrace.push({
          radialReplans,
          reason: replanDecision.reason,
          radialRetreat: replanDecision.radialRetreat,
          projectedRadialRetreat: replanDecision.projectedRadialRetreat,
          oldOrigin: oldPlan.start,
          newOrigin: replanned.plan.start,
        });
        if (replanTrace.length > 3) replanTrace.shift();
        plan = replanned.plan;
        decision = replanned.decision;
        runtime = {};
        previousPosition = {
          x: replanned.geometry.player.x,
          z: replanned.geometry.player.z,
        };
        continue;
      }
      if (preflight.action === 'wait-traffic') {
        await releaseFlightKeys(page);
        const cleared = await preparePq017AlignedStandoffPlan(
          page,
          observeDecision,
          geometry,
          decision,
          {
            baselineBreakEvents,
            baselineImpactEvents,
            initiallySettled: false,
          },
        );
        plan = cleared.plan;
        decision = cleared.decision;
        runtime = {};
        previousPosition = {
          x: cleared.geometry.player.x,
          z: cleared.geometry.player.z,
        };
        continue;
      }
      previousPosition = { x: geometry.player.x, z: geometry.player.z };
      runtime = control;
      samples += 1;
      if (control.action === 'ready-release') {
        await releaseFlightKeys(page);
        return { ...control, samples, plan };
      }
      if (control.action === 'align') {
        if (yawTapCount >= 120) {
          blocked(`attached standoff yaw tap budget exhausted: ${JSON.stringify(diagnostic)}`);
        }
        const tapReceipt = await tapPq017PublicYaw(page, control.turnDirection);
        yawTapCount += 1;
        yawTapReceipts.push(tapReceipt);
        if (yawTapReceipts.length > 32) yawTapReceipts.shift();
        continue;
      }
      if (control.action === 'brake-outward') {
        const brakeReceipt = await pulsePq017AttachedRadialBrake(
          page,
          plan,
          geometry,
          {
            baselineBreakEvents,
            baselineImpactEvents,
          },
        );
        radialBrakeReceipts.push(brakeReceipt);
        if (radialBrakeReceipts.length > 4) radialBrakeReceipts.shift();
        runtime = {
          ...control,
          attachedRadialBrakePulses: control.attachedRadialBrakePulses + 1,
          attachedRadialBrakeNeutralLatched: true,
        };
        if (!brakeReceipt.safe) {
          blocked(`attached standoff signed radial brake failed: ${JSON.stringify({
            ...diagnostic,
            brakeReceipt,
          })}`);
        }
        continue;
      }
      if (control.action === 'pulse-outward') {
        await page.keyboard.up('KeyA');
        await page.keyboard.up('KeyD');
        await page.keyboard.up('KeyS');
        await page.keyboard.down('KeyW');
        await waitForFixedTicks(page, control.waitFixedTicks);
        await page.keyboard.up('KeyW');
        continue;
      }
      await releaseFlightKeys(page);
      await waitForFixedTicks(page, control.waitFixedTicks);
    }
  } finally {
    await releaseFlightKeys(page);
  }
  blocked(`attached standoff radial control exhausted its bounded samples: ${JSON.stringify({
    ...diagnostic,
    samples,
    sampleLimit,
  })}`);
}

async function waitForPq017AlreadyFarReleaseSettlement(
  page,
  observeDecision,
  initialGeometry,
  initialDecision,
  {
    baselineBreakEvents,
    baselineImpactEvents,
    maxDistinctTicks = 120,
  },
) {
  await releaseFlightKeys(page);
  let geometry = initialGeometry;
  let decision = initialDecision;
  let previousGeometry = initialGeometry;
  let braking = null;
  let diagnostic = null;
  const startTick = Number(initialGeometry?.tick);
  const minimumReleaseDistance = Number(initialDecision?.minimumReleaseDistance);
  const sampleLimit = Math.max(1, Math.trunc(Number(maxDistinctTicks) || 0));
  for (let sample = 0; sample <= sampleLimit; sample += 1) {
    if (!geometry) {
      blocked('already-far release settlement lost its live tether geometry');
    }
    decision = observeDecision(geometry, decision);
    const realSolidObstacles = pq017StandoffRealSolidObstacles(geometry);
    const sweptSegment = previousGeometry === geometry
      ? { safe: true, reason: 'already-far-release-origin-sample', closestConstraint: null }
      : auditPq017RouteSweep(
        previousGeometry.player,
        geometry.player,
        realSolidObstacles,
        geometry.playerRadius,
      );
    diagnostic = {
      sample,
      geometry,
      decision,
      braking,
      sweptSegment,
      realSolidObstacles,
      baselineBreakEvents,
      baselineImpactEvents,
    };
    if (!decision.safe) {
      blocked(`already-far release settlement lost its nonbreaking Massline: ${JSON.stringify(diagnostic)}`);
    }
    if (!sweptSegment.safe) {
      blocked(`already-far release settlement crossed a real solid: ${JSON.stringify(diagnostic)}`);
    }
    if (!Number.isFinite(startTick) || geometry.tick <= startTick) {
      if (sample > 0) {
        blocked(`already-far release settlement did not advance a distinct fixed tick: ${JSON.stringify(diagnostic)}`);
      }
    } else if (decision.action === 'ready-release'
        && decision.releaseAuthorized === true
        && decision.lineDistance + 1e-6 >= minimumReleaseDistance) {
      return { geometry, decision, braking, samples: sample };
    }
    if (decision.action !== 'settle') {
      blocked(`already-far release settlement left its proven release radius: ${JSON.stringify(diagnostic)}`);
    }
    previousGeometry = geometry;
    const playerSpeed = Math.hypot(geometry.player.vx, geometry.player.vz);
    if (playerSpeed > PQ017_RELEASED_DETOUR_SETTLED_SPEED + 1e-6) {
      braking = await brakePlayerBelow(
        page,
        PQ017_RELEASED_DETOUR_SETTLED_SPEED,
        sampleLimit,
      );
    } else {
      await releaseFlightKeys(page);
      await waitForFixedTicks(page, 1);
    }
    geometry = await collectPq017ReceiverDeliveryGeometry(
      page,
      { requireTether: true },
    );
  }
  blocked(`already-far release settlement exhausted its bounded ticks: ${JSON.stringify(diagnostic)}`);
}

async function preparePq017SafeReleaseStandoff(page, timeoutMs = 45_000) {
  await page.keyboard.up('KeyB');
  await releaseFlightKeys(page);
  const initial = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: true });
  if (!initial) {
    blocked('pre-release standoff requires the live attached payload geometry');
  }
  const baselineBreakEvents = initial.breakEvents;
  const baselineImpactEvents = initial.impactEvents;
  const observeDecision = (geometry, runtime = {}) => decidePq017PreReleaseStandoff({
    ...geometry,
    breakEvents: geometry ? geometry.breakEvents - baselineBreakEvents : null,
    impactEvents: geometry ? geometry.impactEvents - baselineImpactEvents : null,
  }, runtime);
  let decision = observeDecision(initial);
  if (!decision.safe) {
    blocked(`pre-release standoff refused its initial geometry: ${JSON.stringify(decision)}`);
  }

  if (decision.action === 'pay-out') {
    let lineControlObserved = false;
    let payoutObserved = false;
    await page.keyboard.down('Space');
    try {
      // Until the hold grammar is live, S is ordinary reverse thrust. Cross the 0.16 s grammar
      // threshold on distinct fixed ticks with Space alone, then and only then ask S to pay out.
      for (let sample = 0; sample < 30; sample += 1) {
        await waitForFixedTicks(page, 1);
        const geometry = await collectPq017ReceiverDeliveryGeometry(
          page,
          { requireTether: true },
        );
        decision = observeDecision(geometry, decision);
        if (!decision.safe) {
          blocked(`pre-release standoff lost its nonbreaking Massline: ${JSON.stringify(decision)}`);
        }
        if (geometry?.masslineInput?.lineControl === true) {
          lineControlObserved = true;
          break;
        }
      }
      if (!lineControlObserved) {
        blocked('pre-release standoff did not observe the Space hold line-control grammar');
      }
      await page.keyboard.down('KeyS');
      const payoutDeadline = Date.now() + Math.max(
        5_000,
        Math.min(20_000, Math.trunc(Number(timeoutMs) || 0)),
      );
      while (Date.now() < payoutDeadline) {
        await waitForFixedTicks(page, 1);
        const geometry = await collectPq017ReceiverDeliveryGeometry(
          page,
          { requireTether: true },
        );
        decision = observeDecision(geometry, decision);
        if (!decision.safe) {
          blocked(`pre-release payout lost its nonbreaking Massline: ${JSON.stringify(decision)}`);
        }
        if (geometry?.masslineInput?.lineControl !== true) {
          blocked('pre-release payout lost the live line-control grammar');
        }
        if (geometry.tether.restLength + 1e-6 >= decision.payoutRestLength) {
          payoutObserved = true;
          break;
        }
      }
      if (!payoutObserved) {
        blocked(`pre-release payout did not reach its radius-derived slack: ${JSON.stringify(decision)}`);
      }
    } finally {
      // Lift S first so the held Massline still owns the axis, then lift Space immediately. No
      // fixed tick may expose S as reverse thrust or allow remembered pay-out intent to run on.
      await page.keyboard.up('KeyS');
      await page.keyboard.up('Space');
    }
    await waitForFixedTicks(page, 1);
    const neutral = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: true });
    decision = observeDecision(neutral, decision);
    if (!decision.safe || neutral?.masslineInput?.lineControl === true
        || Math.abs(neutral?.masslineInput?.lineLength || 0) > 1e-6) {
      blocked(`pre-release line controls did not return neutral without a cut: ${JSON.stringify({
        decision,
        masslineInput: neutral?.masslineInput || null,
      })}`);
    }
  }

  if (decision.action === 'settle') {
    const settleGeometry = await collectPq017ReceiverDeliveryGeometry(
      page,
      { requireTether: true },
    );
    decision = observeDecision(settleGeometry, decision);
    if (!decision.safe || decision.action !== 'settle') {
      blocked(`already-far release settlement lost its live entry proof: ${JSON.stringify(decision)}`);
    }
    const settled = await waitForPq017AlreadyFarReleaseSettlement(
      page,
      observeDecision,
      settleGeometry,
      decision,
      {
        baselineBreakEvents,
        baselineImpactEvents,
        maxDistinctTicks: 120,
      },
    );
    decision = settled.decision;
  }

  if (decision.action === 'stage-outward') {
    const initialGeometry = await collectPq017ReceiverDeliveryGeometry(
      page,
      { requireTether: true },
    );
    decision = observeDecision(initialGeometry, decision);
    if (!decision.safe || initialGeometry?.payloadCollides === true) {
      blocked(`pre-release standoff cannot exclude a colliding payload: ${JSON.stringify(decision)}`);
    }
    const settled = await waitForPq017StandoffNeutralSettlement(
      page,
      observeDecision,
      initialGeometry,
      decision,
      {
        baselineBreakEvents,
        baselineImpactEvents,
        maxDistinctTicks: 120,
      },
    );
    const geometry = settled.geometry;
    decision = settled.decision;
    const cleared = await preparePq017AlignedStandoffPlan(
      page,
      observeDecision,
      geometry,
      decision,
      {
        baselineBreakEvents,
        baselineImpactEvents,
        initiallySettled: true,
      },
    );
    await flyPq017AttachedStandoffRadial(
      page,
      cleared.plan,
      observeDecision,
      cleared.decision,
      {
        baselineBreakEvents,
        baselineImpactEvents,
        timeoutMs,
      },
    );
  }

  const finalGeometry = await collectPq017ReceiverDeliveryGeometry(
    page,
    { requireTether: true },
  );
  decision = observeDecision(finalGeometry, decision);
  if (decision.releaseAuthorized !== true) {
    blocked(`pre-release standoff did not authorize manual release: ${JSON.stringify(decision)}`);
  }
  return decision;
}

async function releaseMasslineWorldRecord(page, worldRecordId) {
  const before = await page.evaluate((id) => {
    const state = window.SF?.state;
    const tether = state?.player?.tether;
    const target = tether?.targetId != null ? state?.entities?.get?.(tether.targetId) : null;
    const eventCount = (name) => (window.__PQ017_ROUTE__?.events || []).filter(
      (event) => event.name === name && event.payload?.targetId === tether?.targetId,
    ).length;
    return {
      active: tether?.active === true,
      targetMatches: target?.alive !== false && target?.data?.worldRecordId === id,
      automaticBreakAllowed: tether?.automaticBreakAllowed === true,
      targetId: tether?.targetId ?? null,
      releaseEvents: eventCount('tether:released'),
      releaseRatedEvents: eventCount('tether:releaseRated'),
      breakEvents: eventCount('tether:broke'),
    };
  }, worldRecordId);
  if (!before.active || !before.targetMatches || before.automaticBreakAllowed) {
    blocked(`manual Massline release requires the live nonbreaking payload tether: ${JSON.stringify(before)}`);
  }
  await page.keyboard.down('Space');
  try {
    await waitForFixedTicks(page, 1);
  } finally {
    await page.keyboard.up('Space');
  }
  await waitForFixedTicks(page, 1);
  await page.waitForFunction(() => !window.SF?.state?.player?.tether?.active,
    null, { timeout: 4_000 }).catch(() => {});
  const after = await page.evaluate(({ id, targetId, baseline }) => {
    const state = window.SF?.state;
    const payload = [...(state?.entities?.values?.() || [])].find(
      (entity) => entity?.data?.worldRecordId === id,
    );
    const eventCount = (name) => (window.__PQ017_ROUTE__?.events || []).filter(
      (event) => event.name === name && event.payload?.targetId === targetId,
    ).length;
    return {
      tetherActive: state?.player?.tether?.active === true,
      payloadAlive: payload?.alive !== false && !!payload?.pos,
      releaseEvents: eventCount('tether:released') - baseline.releaseEvents,
      releaseRatedEvents: eventCount('tether:releaseRated') - baseline.releaseRatedEvents,
      breakEvents: eventCount('tether:broke') - baseline.breakEvents,
    };
  }, {
    id: worldRecordId,
    targetId: before.targetId,
    baseline: before,
  });
  if (after.tetherActive || !after.payloadAlive
      || after.releaseEvents !== 1 || after.releaseRatedEvents !== 1
      || after.breakEvents !== 0) {
    blocked(`manual Massline release did not leave a live free payload: ${JSON.stringify(after)}`);
  }
}

async function waitForPq017ReleasedPayloadSettlement(
  page,
  timeoutMs = 30_000,
  { baselineImpactEvents = null } = {},
) {
  const deadline = Date.now() + Math.max(1_000, Math.trunc(Number(timeoutMs) || 0));
  let settlement = {};
  while (Date.now() < deadline) {
    const observation = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
    const impactAudit = auditPq017ReleasedRouteImpactReceipt(
      observation,
      baselineImpactEvents,
    );
    if (!impactAudit.safe) {
      blocked(`released payload settlement observed a World Site impact: ${JSON.stringify({
        impactAudit,
        observation,
      })}`);
    }
    settlement = decidePq017ReleasedPayloadSettlement({
      tick: observation?.tick,
      payload: observation?.payload,
      payloadAlive: observation?.payloadAlive === true,
      tetherActive: observation?.tether?.active === true,
    }, settlement);
    if (!settlement.safe) {
      blocked(`released payload could not settle safely: ${JSON.stringify(settlement)}`);
    }
    if (settlement.action === 'settled') return settlement;
    await waitForFixedTicks(page, 4);
  }
  blocked(`released payload did not settle within its bounded drift window: ${JSON.stringify(settlement)}`);
}

async function flyPq017ReleasedReceiverDetour(
  page,
  crossingPlan,
  timeoutMs,
  { baselineImpactEvents = null } = {},
) {
  if (!crossingPlan?.safe || !crossingPlan.shipRoute?.waypoints?.length) {
    blocked(`released receiver detour requires a collision-proven route: ${JSON.stringify(crossingPlan)}`);
  }
  // Bound residual drift before beginning an escape-authorized payload-overlap segment. At the
  // 50 ms guidance cadence, 0.5 wu/s moves at most 0.025 WU per sample. The live post-brake origin
  // derives a fixed neutral-turn pocket from nearby solids before any outward recovery begins,
  // without asking discrete nose-relative reverse thrust to chase sub-tick zero.
  const braking = await brakePlayerBelow(
    page,
    PQ017_RELEASED_DETOUR_SETTLED_SPEED,
    120,
  );
  const deadline = Date.now() + Math.min(
    crossingPlan.maximumTowTimeoutMs,
    Math.max(timeoutMs, crossingPlan.executionTowTimeoutMs),
  );
  const initial = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
  if (!initial?.payloadAlive) {
    blocked('released receiver detour requires a live free payload drift anchor');
  }
  const initialImpactAudit = auditPq017ReleasedRouteImpactReceipt(
    initial,
    baselineImpactEvents,
  );
  if (!initialImpactAudit.safe) {
    blocked(`released receiver detour observed a World Site impact while braking: ${JSON.stringify({
      impactAudit: initialImpactAudit,
      initial,
    })}`);
  }
  const brakeDisplacement = evaluatePq017ReleasedDetourBrakeDisplacement(
    crossingPlan.startPosition,
    initial.player,
  );
  if (brakeDisplacement.replanRequired) {
    return {
      replanRequired: true,
      reason: brakeDisplacement.reason,
      braking,
      brakeDisplacement,
    };
  }
  let sweepStart = initial.player;
  const payloadAnchor = { x: initial.payload.x, z: initial.payload.z };
  const driftLimit = PQ017_ROUTE_PLANNER_MARGIN - PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN;
  const escapeContexts = createPq017ScopedEscapeContexts(
    initial.player,
    crossingPlan.shipRoute.waypoints[0],
    crossingPlan.routeSafety.obstacles,
    crossingPlan.routeSafety.playerRadius,
  );
  const initialLegPreflight = auditPq017RouteSweep(
    initial.player,
    crossingPlan.shipRoute.waypoints[0],
    crossingPlan.routeSafety.obstacles,
    crossingPlan.routeSafety.playerRadius,
    {
      requiredClearance: PQ017_ROUTE_PLANNER_MARGIN,
      escapeContexts,
      allowAdvisoryMarginEgress: true,
    },
  );
  if (!initialLegPreflight.safe) {
    return {
      replanRequired: true,
      reason: 'post-brake-first-leg-preflight-blocked',
      braking,
      brakeDisplacement,
      initialLegPreflight,
    };
  }
  for (let index = 0; index < crossingPlan.shipRoute.waypoints.length; index += 1) {
    const released = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
    if (!released?.payloadAlive) {
      blocked('released receiver detour lost the free payload or acquired an unexpected tether');
    }
    const beforeImpactAudit = auditPq017ReleasedRouteImpactReceipt(
      released,
      baselineImpactEvents,
    );
    if (!beforeImpactAudit.safe) {
      blocked(`released receiver detour observed a pre-leg World Site impact: ${JSON.stringify({
        index,
        impactAudit: beforeImpactAudit,
        released,
      })}`);
    }
    const beforeDrift = Math.hypot(
      released.payload.x - payloadAnchor.x,
      released.payload.z - payloadAnchor.z,
    );
    if (beforeDrift > driftLimit) {
      return { replanRequired: true, reason: 'released-payload-left-route-proof', beforeDrift };
    }
    const waypoint = crossingPlan.shipRoute.waypoints[index];
    const outgoingEnd = crossingPlan.shipRoute.waypoints[index + 1] || null;
    const arrival = await flyToPoint(
      page,
      waypoint,
      waypoint.phase === 'launch' ? crossingPlan.arrivalRadius : 16,
      Math.max(30_000, deadline - Date.now()),
      {
        maxApproachSpeed: waypoint.phase === 'launch'
          ? crossingPlan.maxServiceSpeed
          : 16,
        maxSettledSpeed: waypoint.phase === 'launch'
          ? crossingPlan.maxServiceSpeed
          : 6,
        progressExtensionMs: 15_000,
        maxProgressExtensions: waypoint.phase === 'launch' ? 2 : 1,
        routeSafety: {
          obstacles: crossingPlan.routeSafety.obstacles,
          playerRadius: crossingPlan.routeSafety.playerRadius,
          sweepStart,
          escapeContexts,
          replanOnUnsafeControl: true,
        },
        passThrough: waypoint.passThrough?.safe === true && outgoingEnd
          ? { ...waypoint.passThrough, outgoingEnd }
          : null,
      },
    );
    if (arrival.replanRequired) {
      return {
        replanRequired: true,
        reason: arrival.reason,
        index,
        controlPlan: arrival.controlPlan,
      };
    }
    sweepStart = arrival.position;
    await assertNoUnexpectedWorldSiteFailure(page, 'released_receiver_detour');
    const after = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
    if (!after?.payloadAlive) {
      blocked('released receiver detour lost the free payload after a route leg');
    }
    const afterImpactAudit = auditPq017ReleasedRouteImpactReceipt(
      after,
      baselineImpactEvents,
    );
    if (!afterImpactAudit.safe) {
      blocked(`released receiver detour observed a post-leg World Site impact: ${JSON.stringify({
        index,
        impactAudit: afterImpactAudit,
        after,
      })}`);
    }
    const afterDrift = Math.hypot(
      after.payload.x - payloadAnchor.x,
      after.payload.z - payloadAnchor.z,
    );
    if (afterDrift > driftLimit) {
      return { replanRequired: true, reason: 'released-payload-left-route-proof', afterDrift };
    }
  }
  const released = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
  if (!released?.payloadAlive) {
    blocked('released receiver detour ended with an unexpected tether or missing payload');
  }
  const finalImpactAudit = auditPq017ReleasedRouteImpactReceipt(
    released,
    baselineImpactEvents,
  );
  if (!finalImpactAudit.safe) {
    blocked(`released receiver detour final verification observed a World Site impact: ${JSON.stringify({
      impactAudit: finalImpactAudit,
      released,
    })}`);
  }
  return {
    replanRequired: false,
    payloadDrift: Math.hypot(
      released.payload.x - payloadAnchor.x,
      released.payload.z - payloadAnchor.z,
    ),
  };
}

async function snapshotPq017LocalControlPlayer(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    if (!player?.pos || !player?.vel) return null;
    return {
      tick: Number(state?.tick) || 0,
      player: {
        x: player.pos.x,
        z: player.pos.z,
        vx: Number(player.vel.x) || 0,
        vz: Number(player.vel.z) || 0,
        rot: Number(player.rot) || 0,
        angVel: Number(player.angVel) || 0,
      },
    };
  });
}

async function installPq017LocalControlKeyupObserver(page) {
  return page.evaluate(() => {
    const route = window.__PQ017_ROUTE__ || (window.__PQ017_ROUTE__ = {});
    const prior = route.localControlKeyupObserver;
    if (prior?.listener) {
      window.removeEventListener('keydown', prior.listener, true);
      window.removeEventListener('keyup', prior.listener, true);
    }
    const observer = {
      sequence: 0,
      batchSequence: 0,
      activeTokens: Object.create(null),
      receipts: [],
      listener: null,
    };
    observer.listener = (event) => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId);
      if (!event?.code || !['keydown', 'keyup'].includes(event.type)
          || !player?.pos || !player?.vel) return;
      observer.sequence += 1;
      let token = observer.activeTokens[event.code] || null;
      if (event.type === 'keydown') {
        observer.batchSequence += 1;
        token = `${event.code}:${observer.batchSequence}:${observer.sequence}`;
        observer.activeTokens[event.code] = token;
      } else {
        delete observer.activeTokens[event.code];
      }
      observer.receipts.push({
        sequence: observer.sequence,
        token,
        code: event.code,
        edge: event.type,
        tick: Number(state?.tick) || 0,
        player: {
          x: player.pos.x,
          z: player.pos.z,
          vx: Number(player.vel.x) || 0,
          vz: Number(player.vel.z) || 0,
          rot: Number(player.rot) || 0,
          angVel: Number(player.angVel) || 0,
        },
      });
      if (observer.receipts.length > 64) observer.receipts.shift();
    };
    route.localControlKeyupObserver = observer;
    window.addEventListener('keydown', observer.listener, true);
    window.addEventListener('keyup', observer.listener, true);
    return { sequence: observer.sequence, armed: true };
  });
}

export function selectPq017LocalControlKeyupReceipt(
  receipts,
  expectedCode,
  baselineSequence,
) {
  const baseline = Number(baselineSequence);
  if (!Array.isArray(receipts) || typeof expectedCode !== 'string'
      || expectedCode.length === 0 || !Number.isInteger(baseline) || baseline < 0) {
    return null;
  }
  const matches = receipts.filter((receipt) => (
    Number.isInteger(Number(receipt?.sequence))
    && Number(receipt.sequence) > baseline
    && receipt?.code === expectedCode
    && receipt?.edge === 'keyup'
    && Number.isInteger(Number(receipt?.tick))
    && Number(receipt.tick) >= 0
    && [
      receipt?.player?.x,
      receipt?.player?.z,
      receipt?.player?.vx,
      receipt?.player?.vz,
      receipt?.player?.rot,
      receipt?.player?.angVel,
    ].every((value) => Number.isFinite(Number(value)))
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function selectPq017LocalControlKeyBatch(
  receipts,
  expectedCode,
  baselineSequence,
) {
  const baseline = Number(baselineSequence);
  if (!Array.isArray(receipts) || typeof expectedCode !== 'string'
      || expectedCode.length === 0 || !Number.isInteger(baseline) || baseline < 0) {
    return null;
  }
  const matches = receipts.filter((receipt) => (
    Number(receipt?.sequence) > baseline
    && receipt?.code === expectedCode
  ));
  if (matches.length !== 2) return null;
  const [keydown, keyup] = matches;
  const receiptFinite = (receipt) => (
    Number.isInteger(Number(receipt?.sequence))
    && Number.isInteger(Number(receipt?.tick))
    && Number(receipt.tick) >= 0
    && typeof receipt?.token === 'string'
    && receipt.token.length > 0
    && [
      receipt?.player?.x,
      receipt?.player?.z,
      receipt?.player?.vx,
      receipt?.player?.vz,
      receipt?.player?.rot,
      receipt?.player?.angVel,
    ].every((value) => Number.isFinite(Number(value)))
  );
  if (keydown?.edge !== 'keydown' || keyup?.edge !== 'keyup'
      || !receiptFinite(keydown) || !receiptFinite(keyup)
      || keydown.token !== keyup.token
      || Number(keyup.sequence) <= Number(keydown.sequence)
      || Number(keyup.tick) < Number(keydown.tick)) return null;
  return {
    code: expectedCode,
    token: keydown.token,
    keydown,
    keyup,
    activeHoldTicks: Number(keyup.tick) - Number(keydown.tick),
  };
}

export function pq017LocalControlKeydownMatchesAuthorization(
  keydownReceipt,
  authorizedTick,
  authorizedPlayer,
) {
  const receiptPlayer = keydownReceipt?.player;
  const tick = Number(authorizedTick);
  return Number.isInteger(Number(keydownReceipt?.tick))
    && Number(keydownReceipt.tick) === tick
    && [
      receiptPlayer?.x,
      receiptPlayer?.z,
      receiptPlayer?.vx,
      receiptPlayer?.vz,
      receiptPlayer?.rot,
      receiptPlayer?.angVel,
      authorizedPlayer?.x,
      authorizedPlayer?.z,
      authorizedPlayer?.vx,
      authorizedPlayer?.vz,
      authorizedPlayer?.rot,
      authorizedPlayer?.angVel,
    ].every((value) => Number.isFinite(Number(value)))
    && receiptPlayer.x === authorizedPlayer.x
    && receiptPlayer.z === authorizedPlayer.z
    && receiptPlayer.vx === authorizedPlayer.vx
    && receiptPlayer.vz === authorizedPlayer.vz
    && receiptPlayer.rot === authorizedPlayer.rot
    && receiptPlayer.angVel === authorizedPlayer.angVel;
}

async function readPq017LocalControlKeyBatch(page, code, baselineSequence) {
  const receipts = await page.evaluate(() => (
    window.__PQ017_ROUTE__?.localControlKeyupObserver?.receipts || []
  ));
  return selectPq017LocalControlKeyBatch(
    receipts,
    code,
    baselineSequence,
  );
}

async function removePq017LocalControlKeyupObserver(page) {
  return page.evaluate(() => {
    const route = window.__PQ017_ROUTE__;
    const observer = route?.localControlKeyupObserver;
    if (observer?.listener) {
      window.removeEventListener('keydown', observer.listener, true);
      window.removeEventListener('keyup', observer.listener, true);
    }
    if (route) delete route.localControlKeyupObserver;
    return true;
  }).catch(() => false);
}

async function flyPq017ReleasedLaunchGateConvergence(
  page,
  initialCrossingPlan,
  timeoutMs,
  {
    baselineImpactEvents = null,
    settlementRuntime: initialSettlementRuntime = {},
  } = {},
) {
  const deadline = Date.now() + Math.min(
    initialCrossingPlan.maximumTowTimeoutMs,
    Math.max(30_000, timeoutMs),
  );
  let diagnostic = null;
  let crossingPlan = initialCrossingPlan;
  let settlementRuntime = initialSettlementRuntime;
  let controllerState = null;
  let inputBatches = 0;
  const keyupObserver = await installPq017LocalControlKeyupObserver(page);
  if (keyupObserver?.armed !== true) {
    return {
      replanRequired: true,
      reason: 'released-launch-keyup-observer-not-installed',
      inputBatches,
      settlementRuntime,
      diagnostic,
    };
  }
  try {
  // Establish a neutral public-control state before the first observation. From this point every
  // planned batch starts at an observed neutral state, then applies at most one requested key.
  // Do not insert a sweep of awaited key-up protocol events between observation and authorization.
  await releaseFlightKeys(page, { preserveSiteAction: true });
  await waitForFixedTicks(page, 1);
  for (let correction = 1; correction <= 1200 && Date.now() < deadline; correction += 1) {
    const geometry = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
    const impactAudit = auditPq017ReleasedRouteImpactReceipt(
      geometry,
      baselineImpactEvents,
    );
    if (!geometry?.payloadAlive || !impactAudit.safe) {
      blocked(`released launch-gate correction lost its safe free payload: ${JSON.stringify({
        correction,
        geometry,
        impactAudit,
      })}`);
    }
    crossingPlan = createPq017CrossingPlan(geometry, {
      includePayloadAsShipObstacle: true,
    });
    const correctionPlan = planPq017ReleasedLaunchGateCorrection({
      geometry,
      settlementRuntime,
      crossingPlan,
      controllerState,
    });
    settlementRuntime = correctionPlan.settlement;
    const localPlan = correctionPlan.localPlan;
    diagnostic = {
      correction,
      geometry,
      impactAudit,
      crossingPlan,
      correctionPlan,
      localPlan,
      controllerState,
      inputBatches,
    };
    if (localPlan?.action === 'complete') {
      const finalGate = evaluatePq017LaunchGate({
        position: geometry.player,
        velocity: { x: geometry.player.vx, z: geometry.player.vz },
      }, crossingPlan.launchGate);
      const finalSpeed = Math.hypot(geometry.player.vx, geometry.player.vz);
      if (finalGate.accepted
          && pq017AtOrBelowBoundary(finalSpeed, PQ017_RELEASED_LAUNCH_READY_SPEED)) {
        await releaseFlightKeys(page, { preserveSiteAction: true });
        return {
          replanRequired: false,
          crossingPlan,
          geometry,
          gate: finalGate,
          corrections: correction,
          inputBatches,
          settlementRuntime,
          diagnostic,
        };
      }
    }
    if (!correctionPlan.inputAuthorized
        || localPlan?.action !== 'local-convergence'
        || !localPlan?.decision) {
      await releaseFlightKeys(page, { preserveSiteAction: true });
      return {
        replanRequired: true,
        reason: correctionPlan.reason,
        inputBatches,
        settlementRuntime,
        diagnostic,
      };
    }

    const keys = pq017PublicKeysForDecision(localPlan.decision);
    const requestedCodes = Object.entries(keys)
      .filter(([, held]) => held)
      .map(([code]) => code);
    if (requestedCodes.length > 1) {
      return {
        replanRequired: true,
        reason: 'released-launch-control-not-atomic',
        inputBatches,
        settlementRuntime,
        diagnostic,
      };
    }
    const startTick = Number(geometry.tick);
    const requestedCode = requestedCodes[0] || null;
    const keyupBaselineSequence = Number(geometry.localControlKeyupSequence);
    if (requestedCode) await page.keyboard.down(requestedCode);
    let activeEndpoint = null;
    let activeStart = {
      tick: startTick,
      player: geometry.player,
      code: requestedCode,
      edge: requestedCode ? 'pre-keydown' : 'neutral-start',
    };
    let keyBatch = null;
    try {
      await waitForFixedTicks(page, 1);
    } finally {
      if (requestedCode) await page.keyboard.up(requestedCode).catch(() => {});
    }
    if (requestedCode) {
      keyBatch = await readPq017LocalControlKeyBatch(
        page,
        requestedCode,
        keyupBaselineSequence,
      );
      if (!keyBatch) {
        return {
          replanRequired: true,
          reason: 'released-launch-key-batch-receipt-invalid',
          inputBatches,
          settlementRuntime,
          diagnostic,
        };
      }
      activeStart = keyBatch.keydown;
      activeEndpoint = keyBatch.keyup;
    } else {
      const neutralEndpoint = await snapshotPq017LocalControlPlayer(page);
      activeEndpoint = neutralEndpoint ? {
        ...neutralEndpoint,
        token: null,
        code: null,
        edge: 'neutral-sample',
      } : null;
      if (!activeEndpoint) {
        return {
          replanRequired: true,
          reason: 'released-launch-neutral-receipt-missing',
          inputBatches,
          settlementRuntime,
          diagnostic,
        };
      }
    }
    const keydownMatchesAuthorization = !requestedCode
      || pq017LocalControlKeydownMatchesAuthorization(
        activeStart,
        startTick,
        geometry.player,
      );
    const observed = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
    const activeHoldTicks = requestedCode
      ? keyBatch.activeHoldTicks
      : Number(activeEndpoint.tick) - startTick;
    const collectionTickDelta = Number(observed?.tick) - startTick;
    const preKeydownSweptSegment = auditPq017RouteSweep(
      geometry.player,
      activeStart.player,
      crossingPlan.routeSafety.obstacles,
      crossingPlan.routeSafety.playerRadius,
      { requiredClearance: 0 },
    );
    const preKeydown = auditPq017ReleasedLaunchNeutralTail({
      startState: geometry.player,
      endState: activeStart.player,
      tickDelta: Number(activeStart.tick) - startTick,
      sweptSegment: preKeydownSweptSegment,
      launchGate: crossingPlan.launchGate,
      obstacles: crossingPlan.routeSafety.obstacles,
      playerRadius: crossingPlan.routeSafety.playerRadius,
      envelopeLimit: localPlan.envelopeLimit,
    });
    const activeSweptSegment = auditPq017RouteSweep(
      activeStart.player,
      activeEndpoint.player,
      crossingPlan.routeSafety.obstacles,
      crossingPlan.routeSafety.playerRadius,
      { requiredClearance: 0 },
    );
    const neutralSweptSegment = auditPq017RouteSweep(
      activeEndpoint.player,
      observed?.player,
      crossingPlan.routeSafety.obstacles,
      crossingPlan.routeSafety.playerRadius,
      { requiredClearance: 0 },
    );
    const neutralTail = auditPq017ReleasedLaunchNeutralTail({
      startState: activeEndpoint.player,
      endState: observed?.player,
      tickDelta: Number(observed?.tick) - Number(activeEndpoint.tick),
      sweptSegment: neutralSweptSegment,
      launchGate: crossingPlan.launchGate,
      obstacles: crossingPlan.routeSafety.obstacles,
      playerRadius: crossingPlan.routeSafety.playerRadius,
      envelopeLimit: localPlan.envelopeLimit,
    });
    diagnostic.appliedBatch = {
      decision: localPlan.decision,
      keys,
      startTick,
      requestedCode,
      keyupBaselineSequence,
      keyBatch,
      keydownReceipt: requestedCode ? keyBatch.keydown : null,
      keyupReceipt: requestedCode ? keyBatch.keyup : null,
      keydownMatchesAuthorization,
      preKeydown,
      activeStartTick: activeStart.tick,
      activeEndTick: activeEndpoint.tick,
      endTick: observed?.tick,
      activeHoldTicks,
      collectionTickDelta,
      activeSweptSegment,
      neutralTail,
    };
    const appliedBatchAcceptance = keydownMatchesAuthorization
      ? evaluatePq017ReleasedLaunchAppliedBatch({
        decision: localPlan.decision,
        keys,
        tickDelta: activeHoldTicks,
        sweptSegment: activeSweptSegment,
        endPosition: activeEndpoint.player,
        precisionBrakeStop: localPlan.precisionBrakeStop,
        precisionBrakeCorridor: localPlan.precisionBrakeCorridor,
        precisionBrakeHold: localPlan.precisionBrakeHold,
      })
      : {
        safe: false,
        accepted: false,
        reason: 'released-launch-keydown-state-stale',
        tickDelta: activeHoldTicks,
        maximumSafeTicks: localPlan.precisionBrakeHold?.maximumSafeHoldTicks ?? 4,
      };
    diagnostic.appliedBatch.acceptance = appliedBatchAcceptance;
    if (!preKeydown.safe || !appliedBatchAcceptance.accepted || !neutralTail.safe) {
      return {
        replanRequired: true,
        reason: !preKeydown.safe
          ? preKeydown.reason
          : !appliedBatchAcceptance.accepted
            ? appliedBatchAcceptance.reason
            : neutralTail.reason,
        inputBatches,
        settlementRuntime,
        diagnostic,
      };
    }
    controllerState = localPlan.nextState;
    inputBatches += 1;
  }
  await releaseFlightKeys(page, { preserveSiteAction: true });
  return {
    replanRequired: true,
    reason: 'released-launch-gate-did-not-converge',
    inputBatches,
    settlementRuntime,
    diagnostic,
  };
  } finally {
    await removePq017LocalControlKeyupObserver(page);
  }
}

async function preparePq017ReleasedReceiverCrossing(page, timeoutMs) {
  await page.keyboard.up('KeyB');
  const preparationOrigin = await collectPq017ReceiverDeliveryGeometry(
    page,
    { requireTether: false },
  );
  if (!preparationOrigin?.payloadAlive) {
    blocked('released receiver preparation requires a live free payload');
  }
  const baselineImpactEvents = preparationOrigin.impactEvents;
  let diagnostic = null;
  for (let planningCycle = 1;
    planningCycle <= PQ017_RECEIVER_UNTETHERED_DETOUR_LIMIT + 1;
    planningCycle += 1) {
    const settlement = await waitForPq017ReleasedPayloadSettlement(
      page,
      30_000,
      { baselineImpactEvents },
    );
    const geometry = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: false });
    const impactAudit = auditPq017ReleasedRouteImpactReceipt(
      geometry,
      baselineImpactEvents,
    );
    if (!impactAudit.safe) {
      blocked(`released receiver preparation observed a World Site impact: ${JSON.stringify({
        planningCycle,
        impactAudit,
        geometry,
      })}`);
    }
    const crossingPlan = createPq017CrossingPlan(geometry, {
      includePayloadAsShipObstacle: true,
    });
    diagnostic = {
      planningCycle,
      settlement,
      geometry,
      impactAudit,
      baselineImpactEvents,
      crossingPlan,
    };
    if (!crossingPlan?.safe) {
      blocked(`released payload has no collision-safe far-side plan: ${JSON.stringify(diagnostic)}`);
    }
    const playerSpeed = geometry
      ? Math.hypot(geometry.player.vx, geometry.player.vz)
      : Infinity;
    const payloadSpeed = geometry
      ? Math.hypot(geometry.payload.vx, geometry.payload.vz)
      : Infinity;
    const localPlan = planPq017ReleasedLaunchGateConvergence({
      navigation: {
        position: { x: geometry.player.x, z: geometry.player.z },
        velocity: { x: geometry.player.vx, z: geometry.player.vz },
        rotation: geometry.player.rot,
        angularVelocity: geometry.player.angVel,
      },
      payloadSettled: settlement.action === 'settled',
      tetherActive: geometry.tether.active,
      crossingPlan,
    });
    diagnostic.localPlan = localPlan;
    const launchGate = evaluatePq017LaunchGate({
      position: geometry.player,
      velocity: { x: geometry.player.vx, z: geometry.player.vz },
    }, crossingPlan.launchGate);
    const launchReady = launchGate.accepted
      && playerSpeed <= PQ017_RELEASED_LAUNCH_READY_SPEED
      && payloadSpeed <= PQ017_RELEASED_PAYLOAD_SETTLED_SPEED;
    const preparationStep = decidePq017ReleasedPreparationStep({
      planningCycle,
      launchAccepted: launchReady,
      crossingPlan,
      localPlan,
    });
    diagnostic.preparationStep = preparationStep;
    if (preparationStep.action === 'complete') {
      diagnostic.launchGate = launchGate;
      return diagnostic;
    }
    if (preparationStep.action === 'local-convergence') {
      diagnostic.localConvergence = await flyPq017ReleasedLaunchGateConvergence(
        page,
        crossingPlan,
        timeoutMs,
        { baselineImpactEvents, settlementRuntime: settlement },
      );
      const converged = diagnostic.localConvergence;
      if (!converged.replanRequired) {
        const finalPlayerSpeed = Math.hypot(
          converged.geometry.player.vx,
          converged.geometry.player.vz,
        );
        const finalPayloadSpeed = Math.hypot(
          converged.geometry.payload.vx,
          converged.geometry.payload.vz,
        );
        const finalGate = evaluatePq017LaunchGate({
          position: converged.geometry.player,
          velocity: {
            x: converged.geometry.player.vx,
            z: converged.geometry.player.vz,
          },
        }, converged.crossingPlan.launchGate);
        diagnostic.geometry = converged.geometry;
        diagnostic.crossingPlan = converged.crossingPlan;
        diagnostic.launchGate = finalGate;
        if (finalGate.accepted
            && finalPlayerSpeed <= PQ017_RELEASED_LAUNCH_READY_SPEED
            && finalPayloadSpeed <= PQ017_RELEASED_PAYLOAD_SETTLED_SPEED) {
          return diagnostic;
        }
      }
      continue;
    }
    if (preparationStep.action === 'blocked') break;
    diagnostic.detour = await flyPq017ReleasedReceiverDetour(
      page,
      crossingPlan,
      timeoutMs,
      { baselineImpactEvents },
    );
  }
  blocked(`released receiver detour did not converge to a short live crossing: ${JSON.stringify(diagnostic)}`);
}

async function deliverPayloadToSelectedReceiver(
  page,
  operationId,
  timeoutMs,
  { onPayloadLatched = null } = {},
) {
  let attached = null;
  let releaseStandoff = null;
  for (let attempt = 1; attempt <= PQ017_RECEIVER_RELATCH_ATTEMPT_LIMIT; attempt += 1) {
    const prepared = await preparePq017ReleasedReceiverCrossing(page, timeoutMs);
    await cycleToWorldRecord(page, PQ017_PAYLOAD_WORLD_ID, { stableTicks: 2 });
    await latchWorldRecord(page, PQ017_PAYLOAD_WORLD_ID);
    const latchReceipt = await collectPq017ReceiverDeliveryGeometry(
      page,
      { requireTether: true },
    );
    if (typeof onPayloadLatched === 'function') {
      onPayloadLatched({ attempt, prepared, latchReceipt });
    }
    await cycleToComponent(page, 'receiver_collar');
    await waitForFixedTicks(page, 1);
    const serviceGeometry = await collectPq017ReceiverDeliveryGeometry(page, { requireTether: true });
    const crossingPlan = createPq017CrossingPlan(serviceGeometry, {
      maximumRouteLength: PQ017_RECEIVER_SHORT_CROSSING_MAX_ROUTE,
    });
    const relatchValidation = evaluatePq017FarSideRelatch({
      serviceGeometry,
      settlementPosition: prepared.settlement.position,
      crossingPlan,
      latchTick: latchReceipt?.tick,
    });
    const valid = relatchValidation.safe;
    if (valid) {
      attached = {
        attempt,
        releaseStandoff,
        prepared,
        latchReceipt,
        serviceGeometry,
        crossingPlan,
        relatchValidation,
      };
      break;
    }
    if (attempt >= PQ017_RECEIVER_RELATCH_ATTEMPT_LIMIT) {
      blocked(`live relatch did not preserve a short settled receiver crossing: ${JSON.stringify({
        attempt, prepared, latchReceipt, serviceGeometry, crossingPlan, relatchValidation,
      })}`);
    }
    releaseStandoff = await preparePq017SafeReleaseStandoff(page, timeoutMs);
    if (releaseStandoff.releaseAuthorized !== true) {
      blocked('pre-release standoff did not authorize manual release');
    }
    await releaseMasslineWorldRecord(page, PQ017_PAYLOAD_WORLD_ID);
  }
  if (!attached) blocked('receiver crossing relatch exhausted without a live plan');
  const { crossingPlan } = attached;
  await page.keyboard.down('KeyB');
  try {
    // Only this freshly recomputed short crossing is tethered. The long collision detour happened
    // with the payload physically released, so it cannot invalidate the audited acceptance chord.
    await towToPointUntilOperation(
      page,
      crossingPlan.target,
      operationId,
      Math.min(
        crossingPlan.maximumTowTimeoutMs,
        Math.max(timeoutMs, crossingPlan.executionTowTimeoutMs),
      ),
      {
        payloadWorldRecordId: PQ017_PAYLOAD_WORLD_ID,
        receiverWorldRecordId: `${PQ017_SITE_ID}/component/receiver_collar`,
        settledRadius: crossingPlan.arrivalRadius,
        maxSettledSpeed: 4,
        maxApproachSpeed: crossingPlan.maxServiceSpeed,
        crossingPlan,
      },
    );
  } catch (error) {
    const diagnostic = await page.evaluate(({ payloadId, receiverId, siteId }) => {
      const state = window.SF?.state;
      const entities = [...(state?.entities?.values?.() || [])];
      const payload = entities.find((entity) => entity?.data?.worldRecordId === payloadId);
      const receiver = entities.find((entity) => entity?.data?.worldRecordId === receiverId);
      return {
        autopilot: state?.nav?.autopilot || null,
        tether: state?.player?.tether || null,
        payload: payload?.pos ? { x: payload.pos.x, z: payload.pos.z, radius: payload.radius } : null,
        receiver: receiver?.pos ? { x: receiver.pos.x, z: receiver.pos.z, radius: receiver.radius } : null,
        distance: payload?.pos && receiver?.pos
          ? Math.hypot(payload.pos.x - receiver.pos.x, payload.pos.z - receiver.pos.z)
          : null,
        failureReceipt: (window.__PQ017_ROUTE__?.events || []).find((event) => (
          event.name === 'worldSite:failureReceipt' && event.payload?.siteId === siteId
        )) || null,
      };
    }, {
      payloadId: PQ017_PAYLOAD_WORLD_ID,
      receiverId: `${PQ017_SITE_ID}/component/receiver_collar`,
      siteId: PQ017_SITE_ID,
    });
    const reason = diagnostic.failureReceipt
      ? 'receiver tow caused a collateral World Site failure'
      : 'selected-target receiver tow did not settle the payload';
    blocked(`${reason}: ${JSON.stringify({
      cause: error?.message || String(error),
      ...diagnostic,
    })}`);
  } finally {
    await page.keyboard.up('KeyB');
  }
  await page.waitForFunction(() => !window.SF?.state?.player?.tether?.active,
    null, { timeout: 7_500 }).catch(() => blocked('settled payload did not release the Massline'));
}

async function waitForFixedTicks(page, count) {
  const startTick = await page.evaluate(() => Number(window.SF?.state?.tick) || 0);
  await page.waitForFunction(({ tick, delta }) => (Number(window.SF?.state?.tick) || 0) >= tick + delta,
    { tick: startTick, delta: Math.max(1, Math.trunc(Number(count) || 0)) }, { timeout: 5_000 });
}

async function collectOperationRouteDiagnostic(page, componentId, operationId) {
  const observation = await page.evaluate((siteId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state?.playerId);
    const mining = window.SF?.registry?.get?.('mining');
    const selected = state?.player?.targetId != null
      ? state.entities.get(state.player.targetId)
      : null;
    const beam = player?.data?.miningBeam || state?.player?.miningBeam || null;
    const record = state?.sites?.worldById?.[siteId] || null;
    return {
      record: record ? JSON.parse(JSON.stringify(record)) : null,
      player: player?.pos ? {
        x: player.pos.x,
        z: player.pos.z,
        vx: player.vel?.x,
        vz: player.vel?.z,
      } : null,
      selected: selected ? {
        entityId: selected.id,
        componentId: selected.data?.worldSiteComponentId || null,
        worldRecordId: selected.data?.worldRecordId || null,
        x: selected.pos?.x,
        z: selected.pos?.z,
        radius: selected.radius || 0,
        targetable: selected.data?.worldSiteTargetable === true,
        presentationAdmitted: selected.data?.worldSitePresentationAdmitted === true,
      } : null,
      beam: beam ? { tierId: beam.tierId || null, range: beam.range } : null,
      input: state?.input ? {
        moveX: state.input.moveX,
        moveZ: state.input.moveZ,
        turnIntent: state.input.turnIntent,
        brake: state.input.brake,
        boost: state.input.boost,
        fireGroup: state.input.fireGroup,
        siteBeam: state.input.actions?.siteBeam,
      } : null,
      mining: mining ? {
        beaming: mining._beaming,
        lockedTargetId: mining._lockTargetId,
        activeVerb: mining._activeVerb,
      } : null,
    };
  }, PQ017_SITE_ID);
  return summarizePq017OperationRouteDiagnostic(observation, { componentId, operationId });
}

async function completeWorldSiteOperation(page, componentId, operationId,
  approachTimeoutMs = SITE_OPERATION_APPROACH_TIMEOUT_MS) {
  const componentWorldRecordId = `${PQ017_SITE_ID}/component/${componentId}`;
  await cycleToComponent(page, componentId);
  await settleAtWorldRecord(page, componentWorldRecordId,
    SITE_OPERATION_SETTLED_WITHIN, SITE_OPERATION_MAX_SETTLED_SPEED,
    approachTimeoutMs, { useAutopilot: false });
  const diagnostic = await collectOperationRouteDiagnostic(page, componentId, operationId);
  if (!diagnostic.routeReady) {
    blocked(`selected World Site operation is not route-ready: ${JSON.stringify(diagnostic)}`);
  }
  await holdUntilOperation(page, componentId, operationId,
    Math.max(15_000, Math.trunc(approachTimeoutMs / 3)));
}

async function holdUntilOperation(page, componentId, operationId, timeoutMs = 15_000) {
  await page.keyboard.down('KeyB');
  try {
    await page.waitForFunction(([siteId, operation]) => !!(
      window.SF?.state?.sites?.worldById?.[siteId]?.completedOperations?.[operation]
    ), [PQ017_SITE_ID, operationId], { timeout: timeoutMs });
  } catch {
    const diagnostic = await collectOperationRouteDiagnostic(page, componentId, operationId);
    blocked(`contextual B/LT-emulated site action did not complete ${operationId}: ${JSON.stringify(diagnostic)}`);
  } finally {
    await page.keyboard.up('KeyB');
  }
}

async function worldPosition(page, worldRecordId) {
  const result = await page.evaluate((id) => {
    const entity = [...(window.SF?.state?.entities?.values?.() || [])]
      .find((candidate) => candidate?.alive !== false && candidate?.data?.worldRecordId === id);
    return entity?.pos ? { x: entity.pos.x, z: entity.pos.z } : null;
  }, worldRecordId);
  if (!result) blocked(`live world identity missing: ${worldRecordId}`);
  return result;
}

async function worldRecordRangeDiagnostic(page, worldRecordId, maxRange) {
  return page.evaluate(({ id, range }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const target = [...(state?.entities?.values?.() || [])]
      .find((candidate) => candidate?.alive !== false && candidate?.data?.worldRecordId === id);
    const distance = player?.pos && target?.pos
      ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z)
      : null;
    const maxCenterDistance = Math.max(0, Number(range) || 0)
      + Math.max(0, Number(target?.radius) || 0);
    return {
      worldRecordId: id,
      distance,
      maxCenterDistance,
      within: distance != null && maxCenterDistance > 0 && distance <= maxCenterDistance,
    };
  }, { id: worldRecordId, range: maxRange });
}

async function settleAtWorldRecord(page, worldRecordId, within, maxSpeed, timeoutMs, {
  useAutopilot = true,
  autopilotWorldRecordId = null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let settledSamples = 0;
  let settledArrivalDiagnostic = null;
  let autopilotStallSamples = 0;
  let autopilotDivergenceSamples = 0;
  let autopilotLastSampleTick = null;
  let autopilotDivergenceAnchorDistance = null;
  let autopilotBestDistance = null;
  let autopilotLastDistance = null;
  let autopilotRecoveries = 0;
  let autopilotEnabled = useAutopilot;
  let manualThrustReceipt = {
    attempts: 0,
    neutralSamples: 0,
    requestedTick: null,
    lastTick: null,
  };
  const engageAutopilot = () => autopilotWorldRecordId
    ? engageWorldRecordAutopilot(
      page, autopilotWorldRecordId, Math.max(1, deadline - Date.now()),
    )
    : engageSelectedTargetAutopilot(page, Math.max(1, deadline - Date.now()));
  try {
    await releaseFlightKeys(page);
    await page.bringToFront().catch(() => {});
    let autopilot = autopilotEnabled
      ? await engageAutopilot()
      : { engaged: false, reason: 'short-tethered-delivery' };
    while (Date.now() < deadline) {
      const nav = await page.evaluate((id) => {
        const state = window.SF?.state;
        const player = state?.entities?.get(state?.playerId);
        const target = [...(state?.entities?.values?.() || [])]
          .find((candidate) => candidate?.alive !== false && candidate?.data?.worldRecordId === id);
        if (!player?.pos || !player?.vel || !target?.pos) return null;
        const dx = target.pos.x - player.pos.x;
        const dz = target.pos.z - player.pos.z;
        const distance = Math.hypot(dx, dz);
        let error = Math.atan2(dz, dx) - player.rot;
        while (error > Math.PI) error -= Math.PI * 2;
        while (error < -Math.PI) error += Math.PI * 2;
        const speed = Math.hypot(player.vel.x, player.vel.z);
        let velocityError = speed > 0.001
          ? Math.atan2(player.vel.z, player.vel.x) - player.rot
          : 0;
        while (velocityError > Math.PI) velocityError -= Math.PI * 2;
        while (velocityError < -Math.PI) velocityError += Math.PI * 2;
        const closingSpeed = distance > 0.0001
          ? (player.vel.x * dx + player.vel.z * dz) / distance
          : 0;
        const directStoppingDistance = state?.flightRuntime?.telemetry?.braking?.directDistance;
        return {
          tick: Number(state?.tick),
          player: { x: player.pos.x, z: player.pos.z, vx: player.vel.x, vz: player.vel.z },
          target: { entityId: target.id, x: target.pos.x, z: target.pos.z },
          autopilot: state?.nav?.autopilot ? {
            active: state.nav.autopilot.active === true,
            status: state.nav.autopilot.status || null,
            targetEntityId: state.nav.autopilot.targetEntityId ?? null,
          } : null,
          input: {
            moveZ: Number(state?.input?.moveZ) || 0,
          },
          distance,
          speed,
          closingSpeed,
          headingError: error,
          velocityHeadingError: velocityError,
          directStoppingDistance,
        };
      }, worldRecordId);
      if (!nav) blocked(`settled arrival lost player or live world identity: ${worldRecordId}`);
      if (autopilotEnabled && nav.autopilot?.active === true) {
        // Preserve the obstacle-aware shipped route while it is active. The sampled manual
        // controller below is a fallback/settling authority, not a reason to cancel MMB one frame
        // after proving engagement and drive straight into an intervening collision island.
        const recoveryPlan = planPq017AutopilotAvoidanceRecovery(nav, {
          stallSamples: autopilotStallSamples,
          divergenceSamples: autopilotDivergenceSamples,
          recoveries: autopilotRecoveries,
          lastTick: autopilotLastSampleTick,
          divergenceAnchorDistance: autopilotDivergenceAnchorDistance,
          bestDistance: autopilotBestDistance,
          lastDistance: autopilotLastDistance,
        }, {
          within,
          maxSettledSpeed: maxSpeed,
          expectedTargetEntityId: autopilot.entityId,
        });
        autopilotStallSamples = recoveryPlan.stallSamples;
        autopilotDivergenceSamples = recoveryPlan.divergenceSamples;
        autopilotLastSampleTick = recoveryPlan.lastTick;
        autopilotDivergenceAnchorDistance = recoveryPlan.divergenceAnchorDistance;
        autopilotBestDistance = recoveryPlan.bestDistance;
        autopilotLastDistance = recoveryPlan.lastDistance;
        settledArrivalDiagnostic = {
          worldRecordId, autopilot, navigation: nav, decision: 'autopilot-active', settledSamples,
          autopilotStallSamples, autopilotDivergenceSamples, autopilotRecoveries, recoveryPlan,
        };
        if (recoveryPlan.action === 'reverse-restage') {
          // Collision avoidance can reach a zero-speed contact equilibrium against an irregular
          // asteroid. Back away through the shipped manual brake/reverse control, which also
          // releases the current autopilot lease, then give obstacle-aware guidance one fresh pass.
          // After two bounded attempts, fall through to the ordinary sampled manual controller.
          await releaseFlightKeys(page);
          await page.keyboard.down('KeyS');
          try {
            await waitForFixedTicks(page, 30);
          } finally {
            await page.keyboard.up('KeyS');
          }
          autopilotRecoveries += 1;
          autopilotStallSamples = 0;
          autopilotDivergenceSamples = 0;
          autopilotLastSampleTick = null;
          autopilotDivergenceAnchorDistance = null;
          autopilotBestDistance = null;
          autopilotLastDistance = null;
          if (autopilotRecoveries <= 2) {
            autopilot = await engageAutopilot();
          } else {
            autopilotEnabled = false;
          }
          continue;
        }
        if (recoveryPlan.action === 'manual-recovery') {
          // A high-speed retreat is not a contact equilibrium: reverse thrust could add momentum
          // in the wrong direction. Release the MMB lease and immediately fall through to the
          // sampled Pilot controller, which turns toward the target before applying forward thrust.
          await releaseFlightKeys(page);
          autopilotEnabled = false;
        } else {
          await page.waitForTimeout(SITE_ARRIVAL_SAMPLE_MS);
          continue;
        }
      }
      const decision = decidePq017SettledArrivalControl(nav, {
        settledRadius: within,
        maxSettledSpeed: maxSpeed,
        brakeAccel: SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
      });
      settledArrivalDiagnostic = { worldRecordId, autopilot, navigation: nav, decision, settledSamples };

      if (decision.action === 'settled') {
        await releaseFlightKeys(page);
        settledSamples += 1;
        if (settledSamples >= SITE_OPERATION_SETTLED_SAMPLES) return;
        await page.waitForTimeout(SITE_ARRIVAL_SAMPLE_MS);
        continue;
      }
      settledSamples = 0;
      if (decision.action === 'invalid') break;
      if (decision.action === 'brake') {
        manualThrustReceipt = {
          ...manualThrustReceipt,
          neutralSamples: 0,
          requestedTick: null,
          lastTick: nav.tick,
        };
        await pulsePq017Brake(page, decision.brakePulseMs);
        continue;
      } else {
        if (decision.thrust && autopilot?.engaged === true) {
          const receiptPlan = planPq017ManualThrustReceiptRecovery(
            nav,
            manualThrustReceipt,
            {
              expectedTargetEntityId: autopilot.entityId,
              settledRadius: within,
              maxReedges: 2,
              minimumNeutralSamples: 2,
            },
          );
          manualThrustReceipt = receiptPlan;
          settledArrivalDiagnostic = {
            ...settledArrivalDiagnostic,
            manualThrustReceipt: receiptPlan,
          };
          if (receiptPlan.action === 'blocked' || receiptPlan.action === 'refuse') break;
          if (receiptPlan.action === 'reedge') {
            const reedgeReceipt = await reedgePq017ManualThrust(page, {
              startTick: nav.tick,
              startSpeed: nav.speed,
            });
            settledArrivalDiagnostic = {
              ...settledArrivalDiagnostic,
              manualThrustReceipt: receiptPlan,
              reedgeReceipt,
            };
            continue;
          }
          if (!['request', 'wait', 'received'].includes(receiptPlan.action)) break;
        } else {
          manualThrustReceipt = {
            ...manualThrustReceipt,
            neutralSamples: 0,
            requestedTick: null,
            lastTick: nav.tick,
          };
        }
        await page.keyboard.up('KeyS');
        await page.keyboard[decision.appliedTurnDirection > 0 ? 'down' : 'up']('KeyD');
        await page.keyboard[decision.appliedTurnDirection < 0 ? 'down' : 'up']('KeyA');
        await page.keyboard[decision.thrust ? 'down' : 'up']('KeyW');
      }
      await page.waitForTimeout(SITE_ARRIVAL_SAMPLE_MS);
    }
  } finally {
    await releaseFlightKeys(page);
  }
  blocked(`normal guided arrival did not settle: ${JSON.stringify(settledArrivalDiagnostic)}`);
}

async function reedgePq017ManualThrust(page, { startTick, startSpeed }) {
  await page.keyboard.up('KeyW');
  await page.waitForFunction((tick) => {
    const state = window.SF?.state;
    return (Number(state?.tick) || 0) > tick
      && Math.abs(Number(state?.input?.moveZ) || 0) <= 0.08;
  }, startTick, { timeout: 5_000 }).catch(() => {});
  const neutral = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    return {
      tick: Number(state?.tick) || 0,
      moveZ: Number(state?.input?.moveZ) || 0,
      speed: Math.hypot(Number(player?.vel?.x) || 0, Number(player?.vel?.z) || 0),
    };
  });
  if (neutral.tick <= startTick || Math.abs(neutral.moveZ) > 0.08) {
    return { received: false, accelerated: false, reason: 'neutral-tick-not-observed', neutral };
  }
  await page.bringToFront().catch(() => {});
  await page.keyboard.down('KeyW');
  await page.waitForFunction(({ neutralTick, baselineSpeed }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const tick = Number(state?.tick) || 0;
    const moveZ = Number(state?.input?.moveZ) || 0;
    const speed = Math.hypot(Number(player?.vel?.x) || 0, Number(player?.vel?.z) || 0);
    return (tick > neutralTick && moveZ > 0.08 && speed > baselineSpeed + 0.1)
      || tick >= neutralTick + 12;
  }, {
    neutralTick: neutral.tick,
    baselineSpeed: Math.max(Number(startSpeed) || 0, neutral.speed),
  }, { timeout: 5_000 }).catch(() => {});
  const receipt = await page.evaluate(({ neutralTick, baselineSpeed }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const tick = Number(state?.tick) || 0;
    const moveZ = Number(state?.input?.moveZ) || 0;
    const speed = Math.hypot(Number(player?.vel?.x) || 0, Number(player?.vel?.z) || 0);
    return {
      tick,
      moveZ,
      speed,
      distinctTick: tick > neutralTick,
      received: tick > neutralTick && moveZ > 0.08,
      accelerated: tick > neutralTick && speed > baselineSpeed + 0.1,
    };
  }, {
    neutralTick: neutral.tick,
    baselineSpeed: Math.max(Number(startSpeed) || 0, neutral.speed),
  });
  if (!receipt.received || !receipt.accelerated) {
    await page.keyboard.up('KeyW');
    return {
      ...receipt,
      reason: !receipt.received ? 'manual-thrust-input-not-received' : 'manual-thrust-did-not-accelerate',
      neutral,
    };
  }
  return { ...receipt, reason: null, neutral };
}

async function pulsePq017Brake(page, durationMs) {
  const start = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const vx = Number(player?.vel?.x) || 0;
    const vz = Number(player?.vel?.z) || 0;
    return {
      tick: Number(state?.tick) || 0,
      velocity: { x: vx, z: vz },
      speed: Math.hypot(vx, vz),
    };
  });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyS');
  try {
    // A fixed wall-time tap can land entirely between fixed simulation steps when a concurrent
    // authoring workload slows the headed renderer. Hold through observed simulation progress and
    // release after a bounded speed reduction, before reverse thrust can build in the other direction.
    const targetProjection = pq017PrecisionBrakeTargetProjection(start.speed);
    await page.waitForFunction(({ startTick, unitX, unitZ, target }) => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId);
      const projection = (Number(player?.vel?.x) || 0) * unitX
        + (Number(player?.vel?.z) || 0) * unitZ;
      const tickDelta = (Number(state?.tick) || 0) - startTick;
      return projection <= target || tickDelta >= 12;
    }, {
      startTick: start.tick,
      unitX: start.velocity.x / start.speed,
      unitZ: start.velocity.z / start.speed,
      target: targetProjection,
    }, { timeout: Math.max(1_500, Math.trunc(Number(durationMs) || 20) * 80) }).catch(() => {});
  } finally {
    await page.keyboard.up('KeyS');
  }
  const end = await page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const vx = Number(player?.vel?.x) || 0;
    const vz = Number(player?.vel?.z) || 0;
    return {
      tick: Number(state?.tick) || 0,
      velocity: { x: vx, z: vz },
      speed: Math.hypot(vx, vz),
    };
  });
  const progress = decidePq017BrakePulseProgress({
    startVelocity: start.velocity,
    currentVelocity: end.velocity,
    startTick: start.tick,
    currentTick: end.tick,
    targetProjection: pq017PrecisionBrakeTargetProjection(start.speed),
    maxTicks: 12,
  });
  return { start, end, progress };
}

async function observePq017AutopilotEngagement(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const target = state?.player?.targetId != null ? state.entities?.get?.(state.player.targetId) : null;
    const autopilot = state?.nav?.autopilot;
    return {
      tick: Number(state?.tick) || 0,
      selected: target?.alive !== false ? {
        entityId: target?.id ?? null,
        worldRecordId: target?.data?.worldRecordId || null,
        targetable: target?.data?.worldSiteTargetable === true,
        presentationAdmitted: target?.data?.worldSitePresentationAdmitted === true,
      } : null,
      autopilot: autopilot ? {
        active: autopilot.active === true,
        status: autopilot.status || null,
        targetEntityId: autopilot.targetEntityId ?? null,
      } : null,
    };
  });
}

async function pressSelectedTargetAutopilot(page, selected, timeoutMs) {
  await page.bringToFront().catch(() => {});
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await canvas.boundingBox();
  if (!box || box.width < 100 || box.height < 100) blocked('flight canvas has no usable pointer surface');
  // Use the unobstructed flight reticle area. A locator click at a canvas corner can correctly be
  // rejected because the visible COMMS/HUD controls own that pointer location.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
  const before = await observePq017AutopilotEngagement(page);
  const pressTick = before.tick;
  const wallTimeout = Math.max(1, Math.min(Math.trunc(Number(timeoutMs) || 0), 5_000));
  let waitOutcome = 'wall-timeout';
  await page.mouse.down({ button: 'middle' });
  try {
    // Input edges can span many fixed ticks in one loaded render frame. Hold by wall time until the
    // exact active lease arrives. A selection loss ends the press early so Flyby Focus cannot turn
    // the still-held edge into an unrelated pursuit.
    await page.waitForFunction(({ targetId, worldRecordId }) => {
      const state = window.SF?.state;
      const autopilot = state?.nav?.autopilot;
      const target = state?.player?.targetId != null
        ? state.entities?.get?.(state.player.targetId)
        : null;
      const exactSelection = target?.id === targetId
        && target?.data?.worldRecordId === worldRecordId
        && target?.data?.worldSiteTargetable === true
        && target?.data?.worldSitePresentationAdmitted === true;
      const exactReceipt = autopilot?.targetEntityId === targetId
        && (autopilot.active === true || autopilot.status === 'arrived');
      return exactReceipt || !exactSelection;
    }, {
      targetId: selected.entityId,
      worldRecordId: selected.worldRecordId,
    }, { timeout: wallTimeout });
    const observed = await observePq017AutopilotEngagement(page);
    waitOutcome = observed.autopilot?.targetEntityId === selected.entityId
      && (observed.autopilot.active === true || observed.autopilot.status === 'arrived')
      ? 'exact-receipt'
      : 'selection-lost';
  } catch (error) {
    if (error?.name !== 'TimeoutError') throw error;
  } finally {
    await page.mouse.up({ button: 'middle' });
  }
  const released = await observePq017AutopilotEngagement(page);
  return {
    waitOutcome,
    pressTick,
    releaseTick: released.tick,
    selected: released.selected,
    lease: released.autopilot,
  };
}

async function engageSelectedTargetAutopilot(page, timeoutMs) {
  const initial = await observePq017AutopilotEngagement(page);
  if (!initial.selected?.worldRecordId
    || initial.selected.targetable !== true
    || initial.selected.presentationAdmitted !== true) {
    return { engaged: false, reason: 'no-selected-world-site-target' };
  }
  return engageWorldRecordAutopilot(page, initial.selected.worldRecordId, timeoutMs);
}

async function engageWorldRecordAutopilot(page, worldRecordId, timeoutMs) {
  const budget = Math.max(1_000, Math.min(Math.trunc(Number(timeoutMs) || 0), 15_000));
  const deadline = Date.now() + budget;
  const trace = [];
  let receipt = {
    attempts: 0,
    requestTick: null,
    lastTick: null,
  };
  for (let attempt = 1; attempt <= PQ017_AUTOPILOT_ENGAGEMENT_ATTEMPT_LIMIT; attempt += 1) {
    if (Date.now() >= deadline) break;
    const selected = await cycleToWorldRecord(page, worldRecordId, { stableTicks: 2 });
    const before = await observePq017AutopilotEngagement(page);
    const request = planPq017AutopilotEngagementReceipt(before, receipt, {
      expectedTargetEntityId: selected.entityId,
      expectedWorldRecordId: worldRecordId,
      maxAttempts: PQ017_AUTOPILOT_ENGAGEMENT_ATTEMPT_LIMIT,
    });
    if (request.action === 'received') {
      return {
        engaged: true,
        input: 'middle-mouse',
        entityId: selected.entityId,
        worldRecordId,
        trace,
      };
    }
    if (request.action !== 'request') {
      blocked(`MMB autopilot request refused ${worldRecordId}: ${JSON.stringify({ request, trace })}`);
    }

    const physical = await pressSelectedTargetAutopilot(
      page,
      selected,
      Math.max(1, deadline - Date.now()),
    );
    // The release is part of the public input grammar. Publish at least one distinct neutral fixed
    // tick, then accept a delayed exact receipt before ever issuing another MMB down edge.
    await waitForFixedTicks(page, 1);
    const delayed = await observePq017AutopilotEngagement(page);
    const outcome = planPq017AutopilotEngagementReceipt(delayed, request, {
      expectedTargetEntityId: selected.entityId,
      expectedWorldRecordId: worldRecordId,
      maxAttempts: PQ017_AUTOPILOT_ENGAGEMENT_ATTEMPT_LIMIT,
      requestExpired: true,
    });
    trace.push({
      attempt,
      pressTick: physical.pressTick,
      releaseTick: physical.releaseTick,
      neutralTick: delayed.tick,
      selected: delayed.selected,
      lease: delayed.autopilot,
      waitOutcome: physical.waitOutcome,
      outcome: outcome.reason,
    });
    if (outcome.action === 'received') {
      return {
        engaged: true,
        input: 'middle-mouse',
        entityId: selected.entityId,
        worldRecordId,
        trace,
      };
    }
    if (outcome.action !== 'retry') {
      blocked(`MMB autopilot did not engage ${worldRecordId}: ${JSON.stringify({ outcome, trace })}`);
    }
    receipt = outcome;
  }
  blocked(`MMB autopilot retry budget expired ${worldRecordId}: ${JSON.stringify(trace)}`);
  // Engagement proves the shipped MMB route. The caller's sampled settled-arrival controller owns
  // the remaining travel and braking through ordinary keys. Requiring autonomous arrival here made
  // the same physical route depend on renderer wall-clock speed in a cold Electron process, while
  // also duplicating the stricter position-and-speed acceptance immediately downstream.
}

async function flyToPoint(page, point, within, timeoutMs, {
  maxApproachSpeed = 55,
  maxSettledSpeed = 10,
  progressExtensionMs = 0,
  maxProgressExtensions = 0,
  routeSafety = null,
  passThrough = null,
} = {}) {
  let deadline = Date.now() + timeoutMs;
  const boundedExtensionMs = Math.max(0, Math.trunc(Number(progressExtensionMs) || 0));
  const boundedExtensions = Math.max(0, Math.trunc(Number(maxProgressExtensions) || 0));
  const hardDeadline = deadline + boundedExtensionMs * boundedExtensions;
  let progress = { extensions: 0 };
  let diagnostic = null;
  let previousPosition = routeSafety?.sweepStart || null;
  let brakeRecoveryLatched = false;
  let brakeRecovery = null;
  while (Date.now() < hardDeadline) {
    const nav = await page.evaluate((target) => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state?.playerId);
      if (!player?.pos || !player?.vel) return null;
      const dx = target.x - player.pos.x;
      const dz = target.z - player.pos.z;
      const distance = Math.hypot(dx, dz);
      let error = Math.atan2(dz, dx) - player.rot;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      const speed = Math.hypot(player.vel.x, player.vel.z);
      let velocityError = speed > 0.001
        ? Math.atan2(player.vel.z, player.vel.x) - player.rot
        : 0;
      while (velocityError > Math.PI) velocityError -= Math.PI * 2;
      while (velocityError < -Math.PI) velocityError += Math.PI * 2;
      const moveX = state?.input?.moveX;
      const moveZ = state?.input?.moveZ;
      const brake = state?.input?.brake;
      const boost = state?.input?.boost;
      return {
        tick: Number(state?.tick) || 0,
        position: { x: player.pos.x, z: player.pos.z },
        velocity: { x: player.vel.x, z: player.vel.z },
        rotation: player.rot,
        angularVelocity: Number(player.angVel) || 0,
        distance,
        speed,
        closingSpeed: distance > 0.0001
          ? (player.vel.x * dx + player.vel.z * dz) / distance
          : 0,
        headingError: error,
        velocityHeadingError: velocityError,
        directStoppingDistance: state?.flightRuntime?.telemetry?.braking?.directDistance,
        propulsionNeutral: Number.isFinite(moveX) && Number.isFinite(moveZ)
          && typeof brake === 'boolean' && typeof boost === 'boolean'
          && Math.abs(moveX) <= 0.08 && Math.abs(moveZ) <= 0.08
          && brake === false && boost === false
          && state?.nav?.autopilot?.active !== true,
      };
    }, point);
    if (!nav) blocked('player entity disappeared during ordinary flight');
    if (routeSafety && previousPosition) {
      const sweptSegment = auditPq017RouteSweep(
        previousPosition,
        nav.position,
        routeSafety.obstacles,
        routeSafety.playerRadius,
        {
          requiredClearance: 0,
          escapeContexts: routeSafety.escapeContexts || null,
          escapePropulsionNeutral: nav.propulsionNeutral === true,
        },
      );
      if (!sweptSegment.safe) {
        diagnostic = {
          point,
          within,
          navigation: nav,
          routeSafety: { sweptSegment, previousPosition },
        };
        break;
      }
      advancePq017ScopedEscapeContexts(
        routeSafety.escapeContexts,
        nav.position,
        routeSafety.obstacles,
        { escapeProgress: sweptSegment.escapeProgress || [] },
      );
    }
    previousPosition = nav.position;
    if (brakeRecoveryLatched) {
      await releaseFlightKeys(page);
      if (nav.speed <= PQ017_ORDINARY_BRAKE_MIN_SPEED) {
        brakeRecoveryLatched = false;
      } else {
        diagnostic = {
          point,
          within,
          navigation: nav,
          decision: {
            action: 'coast',
            reason: 'signed-brake-recovery',
            pressKeyS: false,
            waitFixedTicks: PQ017_ORDINARY_BRAKE_RECOVERY_TICKS,
          },
          brakeRecovery,
        };
        await waitForFixedTicks(page, PQ017_ORDINARY_BRAKE_RECOVERY_TICKS);
        continue;
      }
    }
    if (passThrough) {
      const gate = evaluatePq017RingPassThrough(
        nav.position,
        point,
        passThrough,
        routeSafety,
      );
      if (gate.advance) {
        await releaseFlightKeys(page);
        return { ...nav, passThrough: gate };
      }
      if (gate.reason === 'pass-through-proof-invalid'
          || gate.reason === 'outgoing-connector-blocked') {
        diagnostic = { point, within, navigation: nav, routeSafety: { gate } };
        break;
      }
    }
    const decision = decidePq017SettledArrivalControl(nav, {
      settledRadius: within,
      maxSettledSpeed,
      brakeAccel: SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
      maxApproachSpeed,
    });
    const now = Date.now();
    progress = updatePq017WaypointProgressEpoch(
      nav,
      decision,
      progress,
      { now, retreatDistance: 4, recentProgress: 2 },
    );
    if (now >= deadline) {
      const extension = decidePq017WaypointProgressExtension(
        nav,
        decision,
        { ...progress, now },
        {
          extensionMs: boundedExtensionMs,
          maxExtensions: boundedExtensions,
          staleAfterMs: 5_000,
        },
      );
      if (!extension.extend) {
        diagnostic = { point, within, navigation: nav, decision, progress, extension };
        break;
      }
      progress.extensions += 1;
      deadline = Math.min(hardDeadline, now + extension.extensionMs);
    }
    diagnostic = { point, within, navigation: nav, decision, progress };
    if (decision.action === 'settled') {
      await releaseFlightKeys(page);
      return nav;
    }
    const controlPlan = routeSafety && decision.action !== 'invalid'
      ? planPq017RouteSafeDisplacement(
        nav,
        decision,
        routeSafety.obstacles,
        routeSafety.playerRadius,
        { escapeContexts: routeSafety.escapeContexts || null },
      )
      : null;
    if (controlPlan && !controlPlan.safe) {
      await releaseFlightKeys(page);
      diagnostic = {
        point,
        within,
        navigation: nav,
        decision,
        progress,
        routeSafety: { controlPlan },
      };
      if (controlPlan.action === 'replan' && routeSafety.replanOnUnsafeControl === true) {
        return {
          ...nav,
          replanRequired: true,
          reason: controlPlan.reason,
          controlPlan,
        };
      }
      break;
    }
    if (decision.action === 'brake') {
      const pulse = await pulsePq017Brake(page, decision.brakePulseMs);
      brakeRecovery = decidePq017BrakePulseRecovery({
        startSpeed: pulse.start.speed,
        endSpeed: pulse.end.speed,
        progress: pulse.progress,
      });
      pulse.recovery = brakeRecovery;
      if (brakeRecovery.forceCoast) brakeRecoveryLatched = true;
      diagnostic = {
        point,
        within,
        navigation: nav,
        decision,
        progress,
        pulse,
      };
      continue;
    }
    if (decision.action === 'invalid') break;
    await page.keyboard.up('KeyS');
    await page.keyboard[decision.appliedTurnDirection > 0 ? 'down' : 'up']('KeyD');
    await page.keyboard[decision.appliedTurnDirection < 0 ? 'down' : 'up']('KeyA');
    await page.keyboard[decision.thrust ? 'down' : 'up']('KeyW');
    await page.waitForTimeout(SITE_ARRIVAL_SAMPLE_MS);
  }
  await releaseFlightKeys(page);
  blocked(`normal flight did not settle within ${timeoutMs}ms: ${JSON.stringify(diagnostic)}`);
}

async function towToPointUntilOperation(page, point, operationId, timeoutMs, {
  siteId = PQ017_SITE_ID,
  payloadWorldRecordId = null,
  receiverWorldRecordId = null,
  settledRadius = 12,
  maxSettledSpeed = 8,
  maxApproachSpeed = 12,
  servicePlan = null,
  maxTakeUpCycles = 6,
  crossingPlan = null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let diagnostic = null;
  let adaptiveRuntime = {};
  const crossingRoute = crossingPlan?.shipRoute?.waypoints || null;
  let crossingRouteIndex = 0;
  let previousCrossingPosition = crossingPlan?.startPosition || null;
  try {
    while (Date.now() < deadline) {
      const observation = await page.evaluate(({
        siteId, operation, payloadId, receiverId,
      }) => {
        const state = window.SF?.state;
        if (state?.sites?.worldById?.[siteId]?.completedOperations?.[operation]) {
          return { complete: true };
        }
        const player = state?.entities?.get?.(state?.playerId);
        if (!player?.pos) return null;
        let payload = null;
        let receiver = null;
        if (payloadId && receiverId) {
          const entities = [...(state?.entities?.values?.() || [])];
          payload = entities.find((entity) => entity?.alive !== false
            && entity?.data?.worldRecordId === payloadId);
          receiver = entities.find((entity) => entity?.alive !== false
            && entity?.data?.worldRecordId === receiverId);
          if (!payload?.pos || !receiver?.pos) return null;
        }
        const vx = Number(player.vel?.x) || 0;
        const vz = Number(player.vel?.z) || 0;
        const tether = state?.player?.tether || null;
        return {
          complete: false,
          tick: Number(state?.tick) || 0,
          player: {
            x: player.pos.x,
            z: player.pos.z,
            vx,
            vz,
            rot: player.rot,
          },
          playerSpeed: Math.hypot(vx, vz),
          directStoppingDistance: state?.flightRuntime?.telemetry?.braking?.directDistance,
          payloadDistance: payload?.pos && receiver?.pos
            ? Math.hypot(receiver.pos.x - payload.pos.x, receiver.pos.z - payload.pos.z)
            : null,
          payloadPosition: payload?.pos
            ? { x: payload.pos.x, z: payload.pos.z }
            : null,
          lineDistance: payload?.pos
            ? Math.hypot(player.pos.x - payload.pos.x, player.pos.z - payload.pos.z)
            : null,
          tetherTargetMatches: !!(tether?.active && payload && tether.targetId === payload.id),
          tether: tether ? {
            active: tether.active === true,
            restLength: Number(tether.restLength),
            phase: tether.phase || null,
            strain: Number(tether.strain) || 0,
            load: Number(tether.load) || 0,
            lineControl: tether.lineControl === true,
            automaticBreakAllowed: tether.automaticBreakAllowed === true,
          } : null,
        };
      }, {
        siteId,
        operation: operationId,
        payloadId: payloadWorldRecordId,
        receiverId: receiverWorldRecordId,
      });
      if (observation?.complete) return;
      if (!observation) blocked('player entity disappeared during receiver tow');
      if (crossingPlan) {
        if (observation.tetherTargetMatches !== true) {
          diagnostic = { observation, reason: 'crossing-pull-tether-target-mismatch' };
          break;
        }
        if (crossingPlan.requireNonBreakingMassline === true
            && observation.tether?.automaticBreakAllowed !== false) {
          diagnostic = { observation, reason: 'crossing-pull-requires-nonbreaking-massline' };
          break;
        }
        const payloadTravelX = observation.payloadPosition?.x - crossingPlan.payloadStart?.x;
        const payloadTravelZ = observation.payloadPosition?.z - crossingPlan.payloadStart?.z;
        const payloadCrossTrack = Number.isFinite(payloadTravelX)
          && Number.isFinite(payloadTravelZ)
          ? Math.abs(
            payloadTravelX * crossingPlan.direction.z
            - payloadTravelZ * crossingPlan.direction.x
          )
          : Infinity;
        if (payloadCrossTrack > crossingPlan.maxPayloadCrossTrack) {
          diagnostic = {
            observation,
            payloadCrossTrack,
            reason: 'crossing-pull-left-audited-payload-corridor',
          };
          break;
        }
      }
      if (crossingPlan && previousCrossingPosition) {
        const sweptSegment = auditPq017RouteSweep(
          previousCrossingPosition,
          observation.player,
          crossingPlan.routeSafety?.obstacles,
          crossingPlan.routeSafety?.playerRadius,
          { requiredClearance: 0 },
        );
        if (!sweptSegment.safe) {
          diagnostic = { observation, crossingRouteIndex, sweptSegment };
          break;
        }
      }
      if (crossingPlan) previousCrossingPosition = observation.player;
      const adaptiveObservation = servicePlan ? {
        ...observation,
        takeUpDistance: Math.hypot(
          servicePlan.takeUpTarget.x - observation.player.x,
          servicePlan.takeUpTarget.z - observation.player.z,
        ),
      } : observation;
      let adaptiveTarget = crossingPlan
        ? {
          safe: Array.isArray(crossingRoute)
            && crossingRouteIndex >= 0
            && crossingRouteIndex < crossingRoute.length,
          reason: 'far-side-crossing-pull',
          target: crossingRoute?.[crossingRouteIndex] || null,
          arrivalRadius: crossingRouteIndex === (crossingRoute?.length || 0) - 1
            ? crossingPlan.arrivalRadius
            : 16,
          routeIndex: crossingRouteIndex,
        }
        : servicePlan
        ? decidePq017ReceiverTowTarget(
          adaptiveObservation,
          servicePlan,
          adaptiveRuntime,
          { maxTakeUpCycles, settledSlackSamples: 2 },
        )
        : {
          safe: true,
          reason: 'fixed-service-target',
          target: point,
          arrivalRadius: settledRadius,
        };
      if (!adaptiveTarget.safe) {
        diagnostic = { observation, adaptiveTarget };
        break;
      }
      if (crossingPlan && crossingRouteIndex < crossingRoute.length - 1) {
        const waypoint = crossingRoute[crossingRouteIndex];
        const outgoingEnd = crossingRoute[crossingRouteIndex + 1];
        if (waypoint.passThrough?.safe === true) {
          const gate = evaluatePq017RingPassThrough(
            observation.player,
            waypoint,
            { ...waypoint.passThrough, outgoingEnd },
            crossingPlan.routeSafety,
          );
          if (gate.advance) {
            crossingRouteIndex += 1;
            await releaseFlightKeys(page, { preserveSiteAction: true });
            continue;
          }
          if (gate.reason === 'pass-through-proof-invalid'
              || gate.reason === 'outgoing-connector-blocked') {
            diagnostic = { observation, adaptiveTarget, crossingRouteIndex, gate };
            break;
          }
        }
      }
      if (servicePlan) adaptiveRuntime = adaptiveTarget;
      const navTarget = adaptiveTarget.target;
      const dx = navTarget.x - observation.player.x;
      const dz = navTarget.z - observation.player.z;
      const distance = Math.hypot(dx, dz);
      let error = Math.atan2(dz, dx) - observation.player.rot;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      const speed = observation.playerSpeed;
      let velocityError = speed > 0.001
        ? Math.atan2(observation.player.vz, observation.player.vx) - observation.player.rot
        : 0;
      while (velocityError > Math.PI) velocityError -= Math.PI * 2;
      while (velocityError < -Math.PI) velocityError += Math.PI * 2;
      const navigation = {
        error,
        distance,
        speed,
        closingSpeed: distance > 0.0001
          ? (observation.player.vx * dx + observation.player.vz * dz) / distance
          : 0,
        velocityHeadingError: velocityError,
        directStoppingDistance: observation.directStoppingDistance,
        target: navTarget,
        payloadDistance: observation.payloadDistance,
      };
      const decision = decidePq017SettledArrivalControl({
        distance: navigation.distance,
        speed: navigation.speed,
        closingSpeed: navigation.closingSpeed,
        headingError: navigation.error,
        velocityHeadingError: navigation.velocityHeadingError,
        directStoppingDistance: navigation.directStoppingDistance,
      }, {
        settledRadius: adaptiveTarget.arrivalRadius,
        maxSettledSpeed,
        brakeAccel: SITE_OPERATION_CONSERVATIVE_BRAKE_ACCEL,
        maxApproachSpeed: crossingPlan
          && adaptiveTarget.target?.phase !== 'launch'
          ? crossingPlan.ringApproachSpeed
          : maxApproachSpeed,
      });
      diagnostic = { observation, adaptiveTarget, navigation, decision };
      if (decision.action === 'brake') {
        await pulsePq017Brake(page, decision.brakePulseMs);
        continue;
      }
      if (decision.action === 'invalid') break;
      if (decision.action === 'settled') {
        await releaseFlightKeys(page, { preserveSiteAction: true });
        if (crossingPlan && crossingRouteIndex < crossingRoute.length - 1) {
          crossingRouteIndex += 1;
          continue;
        }
        await page.waitForTimeout(SITE_ARRIVAL_SAMPLE_MS);
        continue;
      }
      await page.keyboard.up('KeyS');
      await page.keyboard[decision.appliedTurnDirection > 0 ? 'down' : 'up']('KeyD');
      await page.keyboard[decision.appliedTurnDirection < 0 ? 'down' : 'up']('KeyA');
      await page.keyboard[decision.thrust ? 'down' : 'up']('KeyW');
      await page.waitForTimeout(SITE_ARRIVAL_SAMPLE_MS);
    }
  } finally {
    await releaseFlightKeys(page, { preserveSiteAction: true });
  }
  blocked(`ordinary receiver tow did not complete ${operationId} within ${timeoutMs}ms: ${JSON.stringify(diagnostic)}`);
}

async function brakePlayerBelow(page, maxSpeed, attempts) {
  let lastDecision = null;
  let initialObservation = null;
  let lastObservation = null;
  let lastPulse = null;
  let forceCoast = false;
  let brakePulses = 0;
  let coastTicks = 0;
  // Observe once at attempt==limit after the final allowed action. That terminal sample can accept
  // newly settled motion, but the pure decision forbids another coast tick or reverse pulse.
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const observation = await page.evaluate(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get?.(state?.playerId);
      const vx = Number(player?.vel?.x) || 0;
      const vz = Number(player?.vel?.z) || 0;
      return {
        tick: Number(state?.tick) || 0,
        position: {
          x: Number(player?.pos?.x),
          z: Number(player?.pos?.z),
        },
        velocity: { x: vx, z: vz },
        speed: Math.hypot(vx, vz),
      };
    });
    initialObservation ||= observation;
    lastObservation = observation;
    lastDecision = decidePq017BrakeBelow(observation.speed, maxSpeed, {
      attempt,
      maxAttempts: attempts,
      forceCoast,
    });
    if (lastDecision.action === 'settled') {
      return {
        ...lastDecision,
        start: initialObservation,
        end: lastObservation,
        brakePulses,
        coastTicks,
        coastLatched: forceCoast,
        displacement: evaluatePq017ReleasedDetourBrakeDisplacement(
          initialObservation.position,
          lastObservation.position,
        ).displacement,
      };
    }
    if (lastDecision.action === 'coast') {
      await releaseFlightKeys(page, { preserveSiteAction: true });
      await waitForFixedTicks(page, lastDecision.waitFixedTicks);
      coastTicks += lastDecision.waitFixedTicks;
      continue;
    }
    if (lastDecision.action !== 'brake' || lastDecision.pressKeyS !== true) break;
    lastPulse = await pulsePq017Brake(page, 60);
    brakePulses += 1;
    const recovery = decidePq017BrakePulseRecovery({
      startSpeed: lastPulse.start.speed,
      endSpeed: lastPulse.end.speed,
      progress: lastPulse.progress,
    });
    lastPulse.recovery = recovery;
    if (recovery.forceCoast) {
      forceCoast = true;
    }
  }
  blocked(`ordinary braking could not settle below ${maxSpeed} wu/s: ${JSON.stringify({
    ...lastDecision,
    start: initialObservation,
    end: lastObservation,
    brakePulses,
    coastTicks,
    coastLatched: forceCoast,
    lastPulse,
  })}`);
}

async function ramWorldRecord(page, worldRecordId, timeoutMs, {
  attempt = 0,
  siteId = PQ017_SITE_ID,
  componentId = 'safety_coupler',
  rootWorldRecordId = PQ017_ROOT_WORLD_ID,
  standOff = 190,
  expectedPreImpactStatus = 'operational',
} = {}) {
  const target = await worldPosition(page, worldRecordId);
  const deadline = Date.now() + timeoutMs;
  // Pilot A/D is yaw only while W is released. Align first; holding thrust during a large turn
  // converts the same keys to strafe-plus-carve and can orbit a small collision proxy forever.
  const alignDeadline = Math.min(deadline, Date.now() + 10_000);
  while (Date.now() < alignDeadline) {
    const error = await page.evaluate((point) => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state?.playerId);
      let value = Math.atan2(point.z - player.pos.z, point.x - player.pos.x) - player.rot;
      while (value > Math.PI) value -= Math.PI * 2;
      while (value < -Math.PI) value += Math.PI * 2;
      return value;
    }, target);
    if (Math.abs(error) <= 0.035) break;
    await page.keyboard.up('KeyW');
    await page.keyboard[error > 0 ? 'down' : 'up']('KeyD');
    await page.keyboard[error < 0 ? 'down' : 'up']('KeyA');
    await page.waitForTimeout(40);
  }
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
  let diagnostic = null;
  let impactCaptureSamples = 0;
  let impactCaptureActive = false;
  try {
    while (Date.now() < deadline) {
      const status = await page.evaluate(({ ownerId, targetComponentId }) => (
        window.SF?.state?.sites?.worldById?.[ownerId]?.components?.[targetComponentId]?.status
      ), { ownerId: siteId, targetComponentId: componentId });
      if (status === 'failed') return;
      const navigation = await page.evaluate((point) => {
        const state = window.SF?.state;
        const player = state?.entities?.get(state?.playerId);
        const dx = point.x - player.pos.x;
        const dz = point.z - player.pos.z;
        const distance = Math.hypot(dx, dz);
        let value = Math.atan2(dz, dx) - player.rot;
        while (value > Math.PI) value -= Math.PI * 2;
        while (value < -Math.PI) value += Math.PI * 2;
        const vx = Number(player.vel?.x) || 0;
        const vz = Number(player.vel?.z) || 0;
        const speed = Math.hypot(vx, vz);
        const closingSpeed = distance > 0.0001 ? (vx * dx + vz * dz) / distance : 0;
        let velocityCancelError = speed > 0.0001
          ? Math.atan2(-vz, -vx) - player.rot
          : 0;
        while (velocityCancelError > Math.PI) velocityCancelError -= Math.PI * 2;
        while (velocityCancelError < -Math.PI) velocityCancelError += Math.PI * 2;
        return {
          error: value,
          distance,
          speed,
          closingSpeed,
          lateralSpeed: Math.sqrt(Math.max(0, speed * speed - closingSpeed * closingSpeed)),
          velocityCancelError,
          tick: Number(state?.tick) || 0,
        };
      }, target);
      const control = decidePq017ImpactControl({
        ...navigation,
        captureActive: impactCaptureActive,
      });
      if (control.action === 'velocity-align' || control.action === 'velocity-cancel') {
        impactCaptureActive = true;
        impactCaptureSamples += 1;
      }
      diagnostic = {
        ...navigation,
        control,
        impactCaptureActive,
        impactCaptureSamples,
      };
      if (control.action === 'invalid'
          || control.action === 'missed'
          || control.action === 'capture-complete') break;
      if (impactCaptureSamples > PQ017_IMPACT_CAPTURE_SAMPLE_LIMIT) break;
      // ShiftLeft is a discrete 160 wu/s dash, so it cannot participate in a genuinely capped run.
      await page.keyboard.up('ShiftLeft');
      await page.keyboard[control.thrust ? 'down' : 'up']('KeyW');
      await page.keyboard[control.turnDirection > 0 ? 'down' : 'up']('KeyD');
      await page.keyboard[control.turnDirection < 0 ? 'down' : 'up']('KeyA');
      await waitForFixedTicks(
        page,
        control.action === 'velocity-align' || control.action === 'velocity-cancel' ? 1 : 2,
      );
    }
  } finally {
    await releaseFlightKeys(page);
  }
  if (attempt < 2) {
    // A glancing approach can leave the ship orbiting a small component after the one admitted
    // run-up. Recover exactly as a player would: back out through the same clear-corridor planner,
    // settle, then make one final bounded attempt. Neither retry moves state directly, and the
    // route still accepts only the authored physical-impact rollback receipt.
    await positionPq017ImpactRunup(page, worldRecordId, standOff,
      Math.max(60_000, Math.trunc(timeoutMs) * 2), {
        rootWorldRecordId,
        siteId,
      });
    const restaged = await page.evaluate(({ ownerId, targetComponentId }) => ({
      stageId: window.SF?.state?.sites?.worldById?.[ownerId]?.stageId || null,
      componentStatus: window.SF?.state?.sites?.worldById?.[ownerId]
        ?.components?.[targetComponentId]?.status || null,
      failureCount: (window.__PQ017_ROUTE__?.events || []).filter((event) => (
        event.name === 'worldSite:failureReceipt' && event.payload?.siteId === ownerId
      )).length,
    }), { ownerId: siteId, targetComponentId: componentId });
    const restageAudit = siteId === PQ017_SITE_ID
      ? auditPq017ImpactRestage(restaged)
      : {
        pass: restaged.componentStatus === expectedPreImpactStatus
          && restaged.failureCount === 0,
        ...restaged,
      };
    if (!restageAudit.pass) {
      blocked(`ordinary impact retry staging changed the recovered site: ${JSON.stringify(restageAudit)}`);
    }
    return ramWorldRecord(page, worldRecordId, timeoutMs, {
      attempt: attempt + 1,
      siteId,
      componentId,
      rootWorldRecordId,
      standOff,
      expectedPreImpactStatus,
    });
  }
  blocked(`ordinary capped-speed impact run did not reach ${worldRecordId}: ${JSON.stringify(diagnostic)}`);
}

async function stageImpactRun(page, worldRecordId, standOff, timeoutMs, {
  siteId = PQ017_SITE_ID,
  componentId = String(worldRecordId || '').split('/component/')[1],
  rootWorldRecordId = PQ017_ROOT_WORLD_ID,
} = {}) {
  if (!componentId) blocked(`impact staging requires a component identity: ${worldRecordId}`);
  // The preceding operation route has already proved the shipped target autopilot four times.
  // On a rematerialized, already-recovered site the component can sit behind a large collision
  // island from the return-gate approach. Asking obstacle avoidance to enter that island before
  // backing out made this destructive test depend on an impossible intermediate destination.
  // Instead, keep the component selected and move around a clear outer ring to the authored
  // root-to-component outward radial. The later capped-speed run still crosses the physical collider
  // and is accepted only when the authored impact rollback receipt is observed.
  await cycleToComponent(page, componentId);
  await positionPq017ImpactRunup(page, worldRecordId, standOff,
    Math.max(60_000, Math.trunc(timeoutMs) * 2), { rootWorldRecordId, siteId });
  // A small component collider cannot absorb much cross-track drift over the 190 wu run-up.
  // Settle almost completely before aligning so the capped-speed leg proves an intentional impact,
  // rather than depending on whichever residual vector the preceding return route left behind.
  await brakePlayerBelow(page, 2, 120);
}

async function positionPq017ImpactRunup(page, worldRecordId, standOff, timeoutMs, {
  rootWorldRecordId = PQ017_ROOT_WORLD_ID,
  siteId = PQ017_SITE_ID,
} = {}) {
  const geometry = await page.evaluate(({ targetId, rootId, siteId }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const entities = [...(state?.entities?.values?.() || [])];
    const target = entities.find((entity) => (
      entity?.alive !== false && entity?.data?.worldRecordId === targetId
    ));
    const root = entities.find((entity) => (
      entity?.alive !== false && entity?.data?.worldRecordId === rootId
    ));
    if (!player?.pos || !target?.pos || !root?.pos) return null;
    const obstacles = entities
      .filter((entity) => {
        const radius = Number(entity?.radius);
        const sameSite = entity?.data?.worldSiteId === siteId;
        const sameSiteCollision = sameSite
          && entity?.data?.role === 'world_site_collision'
          && entity?.collides !== false;
        if (entity === player || entity?.alive === false || !entity?.pos
          || !Number.isFinite(radius) || radius < 4
          || (sameSite && !sameSiteCollision)
          || entity?.type === 'fx' || entity?.type === 'projectile') return false;
        return Math.hypot(entity.pos.x - target.pos.x, entity.pos.z - target.pos.z) <= 1_400;
      })
      .map((entity) => ({
        entityId: entity.id ?? null,
        type: entity.type || entity.data?.kind || null,
        fieldId: entity.data?.fieldId || entity.data?.asteroidFieldId || null,
        collides: entity.collides !== false,
        x: entity.pos.x,
        z: entity.pos.z,
        radius: Number(entity.radius),
      }));
    return {
      player: { x: player.pos.x, z: player.pos.z },
      playerRadius: Math.max(0, Number(player.radius) || 0),
      target: { x: target.pos.x, z: target.pos.z },
      root: { x: root.pos.x, z: root.pos.z },
      obstacles,
    };
  }, { targetId: worldRecordId, rootId: rootWorldRecordId, siteId });
  if (!geometry) blocked(`impact run-up lost player, target, or site root: ${worldRecordId}`);
  const plan = planPq017ImpactStaging(
    geometry.player, geometry.target, geometry.root, standOff,
    geometry.obstacles, geometry.playerRadius,
  );
  if (!plan?.waypoints?.length) blocked(`impact run-up planning failed: ${worldRecordId}`);
  if (plan.blockedSegments > 0) {
    blocked(`impact run-up has no collision-clear route: ${JSON.stringify(plan)}`);
  }
  const deadline = Date.now() + timeoutMs;
  let sweepStart = geometry.player;
  for (let index = 0; index < plan.waypoints.length; index += 1) {
    const waypoint = plan.waypoints[index];
    const arrival = await flyToPoint(
      page,
      waypoint,
      waypoint.phase === 'launch' ? 6 : 16,
      Math.max(waypoint.phase === 'launch' ? 45_000 : 15_000, deadline - Date.now()),
      {
        maxSettledSpeed: waypoint.phase === 'launch' ? 6 : 10,
        routeSafety: {
          obstacles: geometry.obstacles,
          playerRadius: geometry.playerRadius,
          sweepStart,
        },
      },
    );
    sweepStart = arrival.position;
  }
  await brakePlayerBelow(page, 2, 120);
}

async function stageAwayFromWorldRecord(page, worldRecordId, standOff, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let diagnostic = null;
  try {
    while (Date.now() < deadline) {
      const navigation = await page.evaluate((id) => {
        const state = window.SF?.state;
        const player = state?.entities?.get?.(state?.playerId);
        const target = [...(state?.entities?.values?.() || [])]
          .find((entity) => entity?.alive !== false && entity?.data?.worldRecordId === id);
        if (!player?.pos || !player?.vel || !target?.pos) return null;
        const dx = target.pos.x - player.pos.x;
        const dz = target.pos.z - player.pos.z;
        const distance = Math.hypot(dx, dz);
        let error = Math.atan2(dz, dx) - player.rot;
        while (error > Math.PI) error -= Math.PI * 2;
        while (error < -Math.PI) error += Math.PI * 2;
        const vx = Number(player.vel.x) || 0;
        const vz = Number(player.vel.z) || 0;
        return {
          distance,
          speed: Math.hypot(vx, vz),
          closingSpeed: distance > 0.0001 ? (vx * dx + vz * dz) / distance : 0,
          error,
          tick: Number(state?.tick) || 0,
        };
      }, worldRecordId);
      if (!navigation) blocked(`departure staging lost ${worldRecordId}`);
      const control = decidePq017ReverseStagingControl(navigation, standOff);
      diagnostic = { navigation, standOff, control };
      if (control.action === 'settled') return;
      if (control.action === 'invalid') break;
      await page.keyboard.up('ShiftLeft');
      await page.keyboard[control.turnDirection > 0 ? 'down' : 'up']('KeyD');
      await page.keyboard[control.turnDirection < 0 ? 'down' : 'up']('KeyA');
      await page.keyboard[control.forward ? 'down' : 'up']('KeyW');
      await page.keyboard[control.reverse ? 'down' : 'up']('KeyS');
      await waitForFixedTicks(page, 2);
    }
  } finally {
    await releaseFlightKeys(page);
  }
  blocked(`ordinary reverse staging did not settle ${worldRecordId}: ${JSON.stringify(diagnostic)}`);
}

async function leaveTextEntryFocus(page) {
  const isTextEntry = await page.evaluate(() => {
    const el = document.activeElement;
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
  });
  if (isTextEntry) await page.keyboard.press('Escape');
  await page.locator('#gl-canvas').focus();
}

async function releaseFlightKeys(page, { preserveSiteAction = false } = {}) {
  for (const key of [
    'KeyW',
    'KeyA',
    'KeyD',
    'KeyS',
    'KeyQ',
    'KeyE',
    'ShiftLeft',
    'ControlLeft',
    PQ017_PRECISION_BRAKE_KEY,
    'KeyB',
  ]) {
    if (preserveSiteAction && key === 'KeyB') continue;
    await page.keyboard.up(key).catch(() => {});
  }
}

async function snapshot(page) {
  return page.evaluate(({ siteId, rootWorldId, sockets }) => {
    const state = window.SF?.state;
    const owner = window.SF?.registry?.get?.('asteroidSites');
    const render = window.SF?.registry?.get?.('render');
    const record = JSON.parse(JSON.stringify(state?.sites?.worldById?.[siteId] || null));
    const entities = [...(state?.entities?.values?.() || [])]
      .filter((entity) => entity?.alive !== false && entity?.data?.worldSiteId === siteId);
    const ids = entities.map((entity) => entity.data.worldRecordId).filter(Boolean);
    const root = entities.find((entity) => entity.data.worldRecordId === rootWorldId);
    const player = state?.entities?.get?.(state?.playerId);
    const selected = state?.player?.targetId != null
      ? state.entities.get(state.player.targetId)
      : null;
    const socketWorldPoses = {};
    for (const socketId of sockets) {
      socketWorldPoses[socketId] = root && render?.socketWorldPose?.(root.id, socketId) || null;
    }
    return {
      tick: state?.tick,
      record,
      projection: owner?.worldSiteProjection?.(siteId) || null,
      presentation: root?.data?.worldSitePresentation || null,
      entities: {
        count: entities.length,
        rootCount: entities.filter((entity) => entity.data.worldRecordId === rootWorldId).length,
        rootAdmission: root?.presentationAdmission || null,
        inertCount: entities.filter((entity) => entity.data.worldSiteComponentId
          && entity.data.worldSitePresentationAdmitted !== true).length,
        duplicateWorldRecordIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
        records: entities.map((entity) => ({
          entityId: entity.id,
          worldRecordId: entity.data.worldRecordId || null,
          componentId: entity.data.worldSiteComponentId || null,
          pos: entity.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
          vel: entity.vel ? { x: entity.vel.x, z: entity.vel.z } : null,
          radius: entity.radius ?? null,
          alive: entity.alive !== false,
        })),
      },
      player: player ? {
        entityId: player.id,
        pos: player.pos ? { x: player.pos.x, z: player.pos.z } : null,
        vel: player.vel ? { x: player.vel.x, z: player.vel.z } : null,
        selectedEntityId: selected?.id ?? null,
        selectedWorldRecordId: selected?.data?.worldRecordId || null,
        selectedComponentId: selected?.data?.worldSiteComponentId || null,
      } : null,
      socketWorldPoses,
      traffic: {
        routes: (state?.traffic?.freighters || [])
          .filter((entry) => entry.worldSiteRoute)
          .map((entry) => JSON.parse(JSON.stringify(entry.worldSiteRoute))),
        records: (state?.traffic?.freighters || []).map((entry) => {
          const entity = state?.entities?.get?.(entry?.id);
          return {
            id: entry?.id ?? null,
            role: entry?.role || null,
            alive: entity?.alive !== false,
            jobId: entity?.data?.jobId || null,
            hookId: entity?.data?.worldSiteTrafficHookId || null,
            routeHookId: entry?.worldSiteRoute?.hookId || null,
          };
        }),
      },
      events: JSON.parse(JSON.stringify(window.__PQ017_ROUTE__?.events || [])),
    };
  }, { siteId: PQ017_SITE_ID, rootWorldId: PQ017_ROOT_WORLD_ID, sockets: SOCKETS });
}

function countEvents(events, name) {
  return (events || []).filter((event) => event.name === name).length;
}

function blocked(reason) {
  throw new Error(`NORMAL_ROUTE_BLOCKED: ${reason}`);
}

export function repoRelative(root, absolutePath) {
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}

// Shared ordinary-control driver surface for later World Site packets. These helpers retain the
// battle-tested PQ-017 flight controller and chart semantics, but accept world/component identities
// from the caller. Site-specific state assertions remain in each packet's route.
export const WORLD_SITE_PUBLIC_ROUTE_DRIVER = Object.freeze({
  travelThroughOrdinaryGate,
  cycleToComponent,
  cycleToWorldRecord,
  latchWorldRecord,
  worldPosition,
  settleAtWorldRecord,
  flyToPoint,
  towToPointUntilOperation,
  waitForFixedTicks,
  stageImpactRun,
  ramWorldRecord,
  releaseFlightKeys,
  startPerformanceWindow,
  finishPerformanceWindow,
});
