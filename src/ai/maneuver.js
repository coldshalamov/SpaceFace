import {
  ContactKind,
  ManeuverKind,
  TraceLayer,
  clamp,
  distance2,
  hashUnit,
  makeThrusterRequest,
  saturate,
  unit2,
  wrapAngle,
} from './contracts.js';

const DEFAULTS = Object.freeze({
  interceptHorizonTicks: 45,
  trajectoryHorizonTicks: 90,
  obstacleLookahead: 110,
  obstacleClearance: 55,
  stationarySpeed: 0.75,
  stationaryLimitTicks: 180,
  deadlockClearTicks: 45,
  arrivalRadius: 18,
  orbitRadius: 240,
  maxBoostHeatFraction: 0.82,
  minBoostEnergyFraction: 0.22,
  formationRejoinFraction: 0.62,
  formationPredictionTicks: 45,
  includeTrajectory: true,

  // SG-06 intentional flight shaping. These are not raw speed nerfs: they make the
  // physical request behave like a pilot with inertia, commitment, and a plan.
  inputSlewPerTick: 0.055,
  emergencyInputSlewPerTick: 0.12,
  torqueSlewPerTick: 0.065,
  emergencyTorqueSlewPerTick: 0.14,
  yawSoftAngle: 1.15,
  yawDeadband: 0.035,
  turnBeforeBurnAngle: 0.82,
  speedBrakeSlack: 8,
  closingBrakeSlack: 10,
  holdSpeed: 12,
  patrolSpeed: 32,
  formationSpeed: 48,
  screenSpeed: 58,
  orbitSpeed: 68,
  approachSpeed: 62,
  interceptSpeed: 92,
  retreatSpeed: 132,
  escapeSpeed: 150,
  clearDeadlockSpeed: 82,
  maxOrbitClosingSpeed: 24,
  maxApproachClosingSpeed: 34,
  friendlySeparationRadius: 118,
  friendlySeparationWeight: 0.82,
});
const EMPTY_TRAJECTORY = Object.freeze([]);

export class ManeuverPlanner {
  constructor({ seed = 1, trace = null, config = {} } = {}) {
    this.seed = seed >>> 0;
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.freeze = config.freezeResults === false ? identity : Object.freeze;
    this.includeTrajectory = config.includeTrajectory !== false;
    this.byEntity = new Map();
  }

  plan({ tick, entityId, perception, behavior, directive }) {
    const self = perception && perception.self;
    if (!self) throw new Error(`maneuver planner lacks self sensor frame for ${entityId}`);
    let runtime = this.byEntity.get(entityId);
    if (!runtime) {
      runtime = {
        stationaryTicks: 0,
        clearUntilTick: -1,
        lastKind: ManeuverKind.HOLD,
        lastRequest: null,
        lastTick: tick,
        smoothedForward: 0,
        smoothedRight: 0,
        smoothedTorqueYaw: 0,
      };
      this.byEntity.set(entityId, runtime);
    }

    const intent = behavior && behavior.maneuver ? behavior.maneuver : {
      kind: ManeuverKind.HOLD,
      targetId: null,
      formationSlot: directive.formation.slot,
      formationVelocity: directive.formation.velocity,
      formationBound: directive.formation.bound,
      breakFormation: directive.formation.breakFormation,
      reason: 'no_behavior_intent',
    };
    const target = intent.targetId == null ? null : perception.contacts.find((contact) => contact.id === intent.targetId);
    const formationDistance = distance2(self.pos, intent.formationSlot || self.pos);
    const formationBound = Math.max(1, intent.formationBound || 0);
    const rejoinDistance = formationBound * this.config.formationRejoinFraction;
    const mustRejoin = !intent.breakFormation && formationDistance > rejoinDistance;
    const predictedFormationSlot = predictFormationSlot(intent, this.config.formationPredictionTicks);
    let desired = mustRejoin
      ? seekPoint(self, predictedFormationSlot, 1)
      : desiredForIntent(intent, self, target, perception.contacts, this.seed, entityId, this.config);

    desired = applyFriendlySeparation(desired, self, perception.contacts, this.config);
    desired = applyObstacleAvoidance(desired, self, perception.contacts, this.config);
    const speed = Math.hypot(self.vel.x, self.vel.z);
    const commanded = Math.hypot(desired.x, desired.z);
    const intentionalHold = intent.kind === ManeuverKind.HOLD && formationDistance <= this.config.arrivalRadius;
    if (!intentionalHold && commanded > 0.2 && speed < this.config.stationarySpeed) runtime.stationaryTicks++;
    else runtime.stationaryTicks = 0;

    let kind = mustRejoin ? ManeuverKind.FORMATION : intent.kind;
    let reason = mustRejoin ? 'formation_bound_exceeded' : intent.reason || 'action_intent';
    if (runtime.stationaryTicks >= this.config.stationaryLimitTicks || runtime.clearUntilTick >= tick) {
      if (runtime.clearUntilTick < tick) runtime.clearUntilTick = tick + this.config.deadlockClearTicks;
      const side = hashUnit(this.seed, entityId, 'deadlock') < 0.5 ? -1 : 1;
      desired = unit2(Math.cos(self.rot) - Math.sin(self.rot) * side * 0.8, Math.sin(self.rot) + Math.cos(self.rot) * side * 0.8);
      kind = ManeuverKind.CLEAR_DEADLOCK;
      reason = 'stationary_watchdog';
      runtime.stationaryTicks = 0;
    }

    const desiredUnit = unit2(desired.x, desired.z, Math.cos(self.rot), Math.sin(self.rot));
    const heading = Math.atan2(desiredUnit.z, desiredUnit.x);
    const angleError = wrapAngle(heading - self.rot);
    const forwardDot = Math.cos(self.rot) * desiredUnit.x + Math.sin(self.rot) * desiredUnit.z;
    const rightDot = -Math.sin(self.rot) * desiredUnit.x + Math.cos(self.rot) * desiredUnit.z;
    const arrival = desired.arrivalDistance == null ? Infinity : desired.arrivalDistance;
    const slowRadius = approachSlowRadius(kind, formationBound, this.config);
    const envelope = motionEnvelope(kind, intent, arrival, formationDistance, formationBound, this.config);
    const closing = target ? closingSpeed(self, target) : 0;
    const velocityAlongDesired = self.vel.x * desiredUnit.x + self.vel.z * desiredUnit.z;
    const speedLimited = speed > envelope.maxSpeed + this.config.speedBrakeSlack;
    const closingLimited = target && closing > envelope.maxClosingSpeed + this.config.closingBrakeSlack;
    let throttle = arrival < slowRadius ? saturate(arrival / slowRadius) : 1;

    if (envelope.maxSpeed > 0 && speed > envelope.maxSpeed) {
      const over = speed - envelope.maxSpeed;
      throttle *= clamp(1 - over / Math.max(envelope.maxSpeed, 1), 0, 1);
    }
    if (Math.abs(angleError) > this.config.turnBeforeBurnAngle) throttle *= 0.35;
    if (velocityAlongDesired > envelope.maxSpeed) throttle *= 0.25;

    const allowReverse = kind === ManeuverKind.HOLD || kind === ManeuverKind.FORMATION || speedLimited;
    let rawForward = (allowReverse ? forwardDot : Math.max(0, forwardDot)) * throttle;
    let rawRight = rightDot * throttle * strafeAuthorityForKind(kind);
    if (speedLimited || closingLimited) {
      rawForward = Math.min(rawForward, speedLimited ? 0.04 : 0.18);
      rawRight *= 0.35;
    }
    if (intentionalHold) {
      rawForward = 0;
      rawRight = 0;
    }

    const rawTorqueYaw = yawRequestFor(angleError, kind, this.config);
    const emergencyManeuver = kind === ManeuverKind.RETREAT || kind === ManeuverKind.ESCAPE_TETHER;
    const smooth = smoothControls(runtime, tick, {
      forward: rawForward,
      right: rawRight,
      torqueYaw: rawTorqueYaw,
    }, this.config, { emergency: emergencyManeuver });

    const boostWanted = (kind === ManeuverKind.RETREAT || kind === ManeuverKind.ESCAPE_TETHER || kind === ManeuverKind.CLEAR_DEADLOCK) &&
      speed < envelope.maxSpeed * 0.85 && Math.abs(angleError) < 0.78;
    const boost = boostWanted && self.energyFraction >= this.config.minBoostEnergyFraction && self.heatFraction <= this.config.maxBoostHeatFraction;
    const brake = speedLimited || closingLimited || ((kind === ManeuverKind.HOLD || kind === ManeuverKind.FORMATION) &&
      arrival < slowRadius && speed > Math.max(4, arrival / 2));
    const trajectory = this.includeTrajectory
      ? buildTrajectory(self, desiredUnit, speed, tick, this.config.trajectoryHorizonTicks, envelope.maxSpeed)
      : EMPTY_TRAJECTORY;
    const request = makeThrusterRequest(entityId, tick, {
      kind,
      forceLocal: { forward: smooth.forward, right: smooth.right },
      torqueYaw: smooth.torqueYaw,
      boost,
      brake,
      targetHeading: heading,
      horizonTicks: this.includeTrajectory ? this.config.trajectoryHorizonTicks : 1,
      trajectory,
      reason,
    }, { freeze: this.freeze });
    runtime.lastKind = kind;
    runtime.lastRequest = request;

    if (this.trace) {
      this.trace.emit({
        tick,
        layer: TraceLayer.MANEUVER,
        entityId,
        squadId: directive && directive.squadId,
        decision: 'plan_trajectory_and_thrusters',
        selected: request,
        candidates: [
          { kind: intent.kind, reason: intent.reason, formationDistance },
          { kind: ManeuverKind.FORMATION, eligible: mustRejoin, bound: formationBound, rejoinDistance },
          { kind: ManeuverKind.CLEAR_DEADLOCK, stationaryTicks: runtime.stationaryTicks },
        ],
        context: {
          targetId: target && target.id,
          speed,
          speedBudget: envelope.maxSpeed,
          closingSpeed: closing,
          speedLimited,
          closingLimited,
          angleError,
          rawForward,
          rawRight,
          rawTorqueYaw,
          energyFraction: self.energyFraction,
          heatFraction: self.heatFraction,
          breakFormation: intent.breakFormation,
        },
      });
    }
    return request;
  }

  forget(entityId) {
    this.byEntity.delete(entityId);
  }

  inspect(entityId = null) {
    if (entityId != null) return freezeRuntime(this.byEntity.get(entityId));
    const out = {};
    for (const [id, state] of this.byEntity) out[String(id)] = freezeRuntime(state);
    return Object.freeze(out);
  }
}

function approachSlowRadius(kind, formationBound, config) {
  if (kind === ManeuverKind.FORMATION) return Math.max(config.arrivalRadius * 2, formationBound * 0.85);
  if (kind === ManeuverKind.HOLD) return Math.max(config.arrivalRadius * 1.5, formationBound * 0.35);
  if (kind === ManeuverKind.ORBIT) return Math.max(config.arrivalRadius * 3, config.orbitRadius * 0.35);
  if (kind === ManeuverKind.INTERCEPT || kind === ManeuverKind.APPROACH_SOCKET || kind === ManeuverKind.CUT_TETHER) return Math.max(config.arrivalRadius * 3, formationBound * 0.55);
  return config.arrivalRadius;
}

function predictFormationSlot(intent, predictionTicks) {
  const slot = intent.formationSlot || { x: 0, z: 0 };
  const velocity = intent.formationVelocity || { x: 0, z: 0 };
  const seconds = Math.max(0, predictionTicks) / 60;
  return {
    x: slot.x + velocity.x * seconds,
    z: slot.z + velocity.z * seconds,
  };
}

function desiredForIntent(intent, self, target, contacts, seed, entityId, config) {
  switch (intent.kind) {
    case ManeuverKind.INTERCEPT:
      return target ? intercept(self, target, config.interceptHorizonTicks) : seekPoint(self, intent.formationSlot, 0.7);
    case ManeuverKind.ORBIT: {
      const orbitRadius = Math.max(1, Number.isFinite(intent.preferredRange) ? intent.preferredRange : config.orbitRadius);
      return target ? orbit(self, target, orbitRadius, seed, entityId) : seekPoint(self, intent.formationSlot, 0.7);
    }
    case ManeuverKind.SCREEN:
      return screen(self, target, intent.formationSlot);
    case ManeuverKind.APPROACH_SOCKET:
    case ManeuverKind.CUT_TETHER:
      return target ? seekPoint(self, target.pos, 1) : seekPoint(self, intent.formationSlot, 0.8);
    case ManeuverKind.ESCAPE_TETHER:
      return escapeTether(self, target || nearestTether(contacts, self), seed, entityId);
    case ManeuverKind.RETREAT:
      return retreat(self, contacts, intent.formationSlot);
    case ManeuverKind.FORMATION:
      return seekPoint(self, intent.formationSlot, 0.8);
    case ManeuverKind.HOLD:
    default:
      return seekPoint(self, intent.formationSlot || self.pos, 0.4);
  }
}

function intercept(self, target, horizonTicks) {
  const distance = distance2(self.pos, target.pos);
  const horizon = clamp(distance / 12, 6, horizonTicks);
  const point = { x: target.pos.x + target.vel.x * horizon / 60, z: target.pos.z + target.vel.z * horizon / 60 };
  return seekPoint(self, point, 1);
}

function orbit(self, target, radius, seed, entityId) {
  const dx = target.pos.x - self.pos.x, dz = target.pos.z - self.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const radial = (dist - radius) / Math.max(40, radius);
  const side = hashUnit(seed, entityId, 'orbit') < 0.5 ? -1 : 1;
  const tangentX = -dz / dist * side, tangentZ = dx / dist * side;
  const radialX = dx / dist * clamp(radial, -1, 1), radialZ = dz / dist * clamp(radial, -1, 1);
  return { x: tangentX + radialX * 1.15, z: tangentZ + radialZ * 1.15, arrivalDistance: Math.abs(dist - radius) };
}

function screen(self, target, formationSlot) {
  if (!target) return seekPoint(self, formationSlot, 0.8);
  const point = {
    x: formationSlot.x * 0.65 + target.pos.x * 0.35,
    z: formationSlot.z * 0.65 + target.pos.z * 0.35,
  };
  return seekPoint(self, point, 0.85);
}

function escapeTether(self, tether, _seed, _entityId) {
  if (!tether) return { x: Math.cos(self.rot), z: Math.sin(self.rot), arrivalDistance: Infinity };
  const away = unit2(self.pos.x - tether.pos.x, self.pos.z - tether.pos.z, Math.cos(self.rot), Math.sin(self.rot));
  return { x: away.x, z: away.z, arrivalDistance: distance2(self.pos, tether.pos) };
}

function retreat(self, contacts, fallback) {
  let x = 0, z = 0, weight = 0;
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.SHIP || contact.team === self.team) continue;
    const dx = self.pos.x - contact.pos.x, dz = self.pos.z - contact.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const w = (0.2 + contact.threat * contact.confidence) / Math.max(1, dist / 100);
    x += dx / dist * w;
    z += dz / dist * w;
    weight += w;
  }
  if (weight <= 0 && fallback) return seekPoint(self, fallback, 1);
  return { x, z, arrivalDistance: Infinity };
}

function seekPoint(self, point, throttle) {
  const target = point || self.pos;
  const dx = target.x - self.pos.x, dz = target.z - self.pos.z;
  const distance = Math.hypot(dx, dz);
  return { x: dx * throttle, z: dz * throttle, arrivalDistance: distance };
}

function nearestTether(contacts, self) {
  let best = null, bestDistance = Infinity;
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.TETHER) continue;
    const distance = distance2(self.pos, contact.pos);
    if (distance < bestDistance) { best = contact; bestDistance = distance; }
  }
  return best;
}

function applyFriendlySeparation(desired, self, contacts, config) {
  let x = desired.x, z = desired.z;
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.SHIP || contact.team !== self.team || contact.id === self.id) continue;
    const dx = self.pos.x - contact.pos.x;
    const dz = self.pos.z - contact.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const clearance = config.friendlySeparationRadius + self.radius + contact.radius;
    if (dist >= clearance) continue;
    const strength = saturate(1 - dist / clearance) * config.friendlySeparationWeight;
    x += dx / dist * strength;
    z += dz / dist * strength;
  }
  return { x, z, arrivalDistance: desired.arrivalDistance };
}

function applyObstacleAvoidance(desired, self, contacts, config) {
  let x = desired.x, z = desired.z;
  const dir = unit2(x, z, Math.cos(self.rot), Math.sin(self.rot));
  const look = { x: self.pos.x + dir.x * config.obstacleLookahead, z: self.pos.z + dir.z * config.obstacleLookahead };
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.HAZARD && !contact.tags.includes('solid')) continue;
    const clearance = config.obstacleClearance + self.radius + contact.radius;
    const d = distance2(look, contact.pos);
    if (d >= clearance) continue;
    const away = unit2(look.x - contact.pos.x, look.z - contact.pos.z, -dir.z, dir.x);
    const strength = saturate(1 - d / clearance) * 2.2;
    x += away.x * strength;
    z += away.z * strength;
  }
  return { x, z, arrivalDistance: desired.arrivalDistance };
}

function motionEnvelope(kind, intent, arrival, formationDistance, formationBound, config) {
  switch (kind) {
    case ManeuverKind.HOLD:
      return { maxSpeed: arrival <= config.arrivalRadius ? 0 : config.holdSpeed, maxClosingSpeed: config.maxApproachClosingSpeed };
    case ManeuverKind.FORMATION:
      return { maxSpeed: clamp(Math.max(config.patrolSpeed, formationDistance * 0.42), config.patrolSpeed, config.formationSpeed), maxClosingSpeed: config.maxApproachClosingSpeed };
    case ManeuverKind.SCREEN:
      return { maxSpeed: config.screenSpeed, maxClosingSpeed: config.maxApproachClosingSpeed };
    case ManeuverKind.ORBIT:
      return { maxSpeed: config.orbitSpeed, maxClosingSpeed: config.maxOrbitClosingSpeed };
    case ManeuverKind.APPROACH_SOCKET:
    case ManeuverKind.CUT_TETHER:
      return { maxSpeed: Math.min(config.approachSpeed, Math.max(config.patrolSpeed, arrival * 0.45)), maxClosingSpeed: config.maxApproachClosingSpeed };
    case ManeuverKind.INTERCEPT:
      return { maxSpeed: config.interceptSpeed, maxClosingSpeed: Math.max(config.maxApproachClosingSpeed, (intent.preferredRange || formationBound) * 0.12) };
    case ManeuverKind.RETREAT:
      return { maxSpeed: config.retreatSpeed, maxClosingSpeed: Infinity };
    case ManeuverKind.ESCAPE_TETHER:
      return { maxSpeed: config.escapeSpeed, maxClosingSpeed: Infinity };
    case ManeuverKind.CLEAR_DEADLOCK:
      return { maxSpeed: config.clearDeadlockSpeed, maxClosingSpeed: Infinity };
    default:
      return { maxSpeed: config.patrolSpeed, maxClosingSpeed: config.maxApproachClosingSpeed };
  }
}

function strafeAuthorityForKind(kind) {
  switch (kind) {
    case ManeuverKind.ORBIT: return 0.48;
    case ManeuverKind.FORMATION: return 0.42;
    case ManeuverKind.HOLD: return 0.32;
    case ManeuverKind.SCREEN: return 0.36;
    case ManeuverKind.APPROACH_SOCKET:
    case ManeuverKind.CUT_TETHER: return 0.3;
    case ManeuverKind.INTERCEPT: return 0.24;
    case ManeuverKind.RETREAT:
    case ManeuverKind.ESCAPE_TETHER:
    case ManeuverKind.CLEAR_DEADLOCK: return 0.22;
    default: return 0.3;
  }
}

function yawRequestFor(angleError, kind, config) {
  if (Math.abs(angleError) < config.yawDeadband) return 0;
  return clamp(angleError / config.yawSoftAngle, -yawLimitForKind(kind), yawLimitForKind(kind));
}

function yawLimitForKind(kind) {
  switch (kind) {
    case ManeuverKind.HOLD: return 0.32;
    case ManeuverKind.FORMATION: return 0.42;
    case ManeuverKind.ORBIT: return 0.52;
    case ManeuverKind.SCREEN: return 0.46;
    case ManeuverKind.APPROACH_SOCKET:
    case ManeuverKind.CUT_TETHER: return 0.5;
    case ManeuverKind.INTERCEPT: return 0.56;
    case ManeuverKind.RETREAT:
    case ManeuverKind.ESCAPE_TETHER:
    case ManeuverKind.CLEAR_DEADLOCK: return 0.82;
    default: return 0.5;
  }
}

function smoothControls(runtime, tick, raw, config, options = {}) {
  const ticks = Math.max(1, Number.isInteger(runtime.lastTick) ? tick - runtime.lastTick : 1);
  const inputStep = (options.emergency ? config.emergencyInputSlewPerTick : config.inputSlewPerTick) * ticks;
  const torqueStep = (options.emergency ? config.emergencyTorqueSlewPerTick : config.torqueSlewPerTick) * ticks;
  const forward = approach(runtime.smoothedForward || 0, raw.forward, inputStep);
  const right = approach(runtime.smoothedRight || 0, raw.right, inputStep);
  const torqueYaw = approach(runtime.smoothedTorqueYaw || 0, raw.torqueYaw, torqueStep);
  runtime.lastTick = tick;
  runtime.smoothedForward = forward;
  runtime.smoothedRight = right;
  runtime.smoothedTorqueYaw = torqueYaw;
  return { forward, right, torqueYaw };
}

function closingSpeed(self, target) {
  const dx = target.pos.x - self.pos.x;
  const dz = target.pos.z - self.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  return ((self.vel.x - target.vel.x) * dx + (self.vel.z - target.vel.z) * dz) / dist;
}

function buildTrajectory(self, direction, speed, tick, horizonTicks, speedBudget = Infinity) {
  const out = [];
  const projectedSpeed = Math.max(8, Math.min(speed + 14, Number.isFinite(speedBudget) ? Math.max(8, speedBudget) : speed + 14));
  for (const fraction of [0.25, 0.5, 1]) {
    const ticks = Math.round(horizonTicks * fraction);
    const seconds = ticks / 60;
    out.push({
      x: self.pos.x + direction.x * projectedSpeed * seconds,
      z: self.pos.z + direction.z * projectedSpeed * seconds,
      tick: tick + ticks,
    });
  }
  return out;
}

function approach(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

function freezeRuntime(runtime) {
  return runtime ? Object.freeze({ ...runtime }) : null;
}

function identity(value) {
  return value;
}
