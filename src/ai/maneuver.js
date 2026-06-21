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
});

export class ManeuverPlanner {
  constructor({ seed = 1, trace = null, config = {} } = {}) {
    this.seed = seed >>> 0;
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.byEntity = new Map();
  }

  plan({ tick, entityId, perception, behavior, directive }) {
    const self = perception && perception.self;
    if (!self) throw new Error(`maneuver planner lacks self sensor frame for ${entityId}`);
    let runtime = this.byEntity.get(entityId);
    if (!runtime) {
      runtime = { stationaryTicks: 0, clearUntilTick: -1, lastKind: ManeuverKind.HOLD, lastRequest: null };
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
    const forward = Math.cos(self.rot) * desiredUnit.x + Math.sin(self.rot) * desiredUnit.z;
    const right = -Math.sin(self.rot) * desiredUnit.x + Math.cos(self.rot) * desiredUnit.z;
    const arrival = desired.arrivalDistance == null ? Infinity : desired.arrivalDistance;
    const throttle = arrival < this.config.arrivalRadius ? saturate(arrival / this.config.arrivalRadius) : 1;
    const boostWanted = kind === ManeuverKind.RETREAT || kind === ManeuverKind.ESCAPE_TETHER || kind === ManeuverKind.CLEAR_DEADLOCK ||
      (kind === ManeuverKind.INTERCEPT && arrival > 500) ||
      (kind === ManeuverKind.FORMATION && formationDistance > formationBound * 0.78);
    const boost = boostWanted && self.energyFraction >= this.config.minBoostEnergyFraction && self.heatFraction <= this.config.maxBoostHeatFraction;
    const brake = (kind === ManeuverKind.HOLD || kind === ManeuverKind.FORMATION) && arrival < this.config.arrivalRadius * 1.5 && speed > 4;
    const trajectory = buildTrajectory(self, desiredUnit, speed, tick, this.config.trajectoryHorizonTicks);
    const request = makeThrusterRequest(entityId, tick, {
      kind,
      forceLocal: { forward: forward * throttle, right: right * throttle },
      torqueYaw: clamp(angleError / 0.65, -1, 1),
      boost,
      brake,
      targetHeading: heading,
      horizonTicks: this.config.trajectoryHorizonTicks,
      trajectory,
      reason,
    });
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
          angleError,
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
    case ManeuverKind.ORBIT:
      return target ? orbit(self, target, intent.preferredRange || config.orbitRadius, seed, entityId) : seekPoint(self, intent.formationSlot, 0.7);
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

function buildTrajectory(self, direction, speed, tick, horizonTicks) {
  const out = [];
  const projectedSpeed = Math.max(12, speed + 18);
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

function freezeRuntime(runtime) {
  return runtime ? Object.freeze({ ...runtime }) : null;
}
