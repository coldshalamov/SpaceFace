import {
  deriveEnemyMotionScale,
  ENEMY_MOTION_IDENTITY_SCALE,
} from '../data/flightFeelEnvelopes.js';
import {
  ContactKind,
  ManeuverKind,
  TraceLayer,
  clamp,
  distance2,
  finite,
  hashUnit,
  makeThrusterRequest,
  saturate,
  unit2,
  wrapAngle,
} from './contracts.js';
import { createSquadFrameDirector } from './squadFrame.js';
import { temperamentFor } from './temperament.js';
import {
  emptyReflexState,
  evaluateReflexes,
  reflexAllowedForIntent,
} from './reflexes.js';

function bodyRadius(body) {
  const measured = Number(body && body.planarRadius);
  if (measured > 0) return measured;
  return Number(body && body.radius) || 0;
}

const GAP_QUEUE_PAD = 4;

/**
 * Waiting points behind a narrow gap. Centers are separated by each hull's own
 * clearance (body radius, not collisionRadius) in stable id order. Returns null
 * when fewer than two hulls are waiting or the gap is wide enough to pass abreast.
 * Does not write radius or collisionRadius.
 */
export function gapWaitingPositions(anchor, members, obstacles) {
  const roster = [];
  for (const member of members || []) {
    if (!member || !member.pos) continue;
    if (!Number.isFinite(member.pos.x) || !Number.isFinite(member.pos.z)) continue;
    roster.push(member);
  }
  if (roster.length < 2 || !anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) return null;
  const gap = narrowWaitingGap(obstacles, roster);
  if (!gap) return null;
  const near = Math.hypot(anchor.x - gap.mouth.x, anchor.z - gap.mouth.z);
  let largest = 0;
  for (const member of roster) largest = Math.max(largest, bodyRadius(member));
  if (near > largest * 2 + gap.width + 40) return null;
  const ordered = roster.slice().sort((a, b) => {
    const as = String(a.id);
    const bs = String(b.id);
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  });
  let cx = 0;
  let cz = 0;
  for (const member of ordered) {
    cx += member.pos.x;
    cz += member.pos.z;
  }
  cx /= ordered.length;
  cz /= ordered.length;
  let bx = cx - gap.mouth.x;
  let bz = cz - gap.mouth.z;
  const bl = Math.hypot(bx, bz);
  if (bl < 1e-4) {
    bx = -gap.axis.x;
    bz = -gap.axis.z;
  } else {
    bx /= bl;
    bz /= bl;
  }
  const points = new Map();
  let cursor = 0;
  for (const member of ordered) {
    const radius = bodyRadius(member);
    cursor += radius;
    points.set(member.id, {
      x: gap.mouth.x + bx * cursor,
      z: gap.mouth.z + bz * cursor,
    });
    cursor += radius + GAP_QUEUE_PAD;
  }
  return points;
}

function narrowWaitingGap(obstacles, members) {
  const solids = [];
  for (const contact of obstacles || []) {
    if (!contact || !contact.pos) continue;
    if (contact.kind === ContactKind.SHIP && contact.alive !== false) continue;
    const tags = contact.tags;
    const solid = contact.kind === ContactKind.HAZARD || (Array.isArray(tags) && tags.includes('solid'));
    if (!solid) continue;
    solids.push(contact);
  }
  if (solids.length < 2) return null;
  const radii = members.map((member) => bodyRadius(member)).sort((a, b) => b - a);
  const abreast = (radii[0] || 0) + (radii[1] || 0);
  let best = null;
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i];
      const b = solids[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      if (!(dist > 1e-4)) continue;
      const width = dist - bodyRadius(a) - bodyRadius(b);
      if (!(width > 0) || width >= abreast) continue;
      const mouthT = (bodyRadius(a) + width * 0.5) / dist;
      const mouth = { x: a.pos.x + dx * mouthT, z: a.pos.z + dz * mouthT };
      const candidate = { width, mouth, axis: { x: dx / dist, z: dz / dist } };
      if (!best || width < best.width) best = candidate;
    }
  }
  return best;
}

function queuedGapSlot(self, anchor, ships, obstacles) {
  const members = [];
  if (self && self.pos) members.push(self);
  for (const contact of ships || []) {
    if (!contact || contact.kind !== ContactKind.SHIP || !contact.pos) continue;
    if (self && contact.id === self.id) continue;
    if (self && self.team != null && contact.team !== self.team) continue;
    if (contact.alive === false) continue;
    members.push(contact);
  }
  const points = gapWaitingPositions(anchor, members, obstacles);
  if (!points || !self) return null;
  return points.get(self.id) || null;
}

export const MANEUVER_SPEED_CAPS = Object.freeze({
  interceptSpeed: 72,
  approachSpeed: 62,
  orbitSpeed: 68,
  retreatSpeed: 120,
  escapeSpeed: 140,
});

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

  // SG-06 intentional flight shaping. These are not raw speed nerfs:
  // they make physical requests behave like pilots with inertia and plans.
  inputSlewPerTick: 0.055,
  emergencyInputSlewPerTick: 0.12,
  torqueSlewPerTick: 0.065,
  emergencyTorqueSlewPerTick: 0.14,
  yawSoftAngle: 0.55,
  yawDeadband: 0.035,

  // Turns command a yaw RATE, not raw angle-proportional torque. A P-on-angle torque loop
  // whirlpools across the ±π wrap: once the hull overshoots the target heading past π the
  // short-way sign flips and every cycle re-pumps the spin (measured: the custody raider held
  // ±5 rad/s for 10+ s, burned only strafe, and never crossed its own escape leash). The rate
  // target bounds the slew; the rate error makes the torque channel pure damping near the goal.
  yawRateTarget: 2.4,
  yawRateGain: 0.7,
  turnBeforeBurnAngle: 0.82,
  speedBrakeSlack: 8,
  closingBrakeSlack: 10,
  holdSpeed: 12,
  patrolSpeed: 32,
  formationSpeed: 48,
  screenSpeed: 58,
  orbitSpeed: MANEUVER_SPEED_CAPS.orbitSpeed,
  approachSpeed: MANEUVER_SPEED_CAPS.approachSpeed,
  // STRICT overnight: calmer intercept so hostiles read as intentional pilots, not zip-delete.
  interceptSpeed: MANEUVER_SPEED_CAPS.interceptSpeed,
  retreatSpeed: MANEUVER_SPEED_CAPS.retreatSpeed,
  escapeSpeed: MANEUVER_SPEED_CAPS.escapeSpeed,
  clearDeadlockSpeed: 82,
  maxOrbitClosingSpeed: 24,
  maxApproachClosingSpeed: 34,
  friendlySeparationRadius: 118,
  friendlySeparationWeight: 0.82,
  shipCollisionLookahead: 180,
  shipCollisionClearance: 34,
  shipCollisionWeight: 0.72,
  heavyTargetClearance: 24,
  // The one-second hostile telegraph floor still leaves an interceptor carrying closing momentum.
  // Preserve eight units of braking reserve beyond the 132-unit geometric envelope so ordinary
  // attack runs do not spend that player response window by skimming a capital hull.
  capitalTargetClearance: 60,
  heavyTargetClosingSpeed: 22,
  capitalTargetClosingSpeed: 16,
  massApproachRangeMult: 2.8,

  // Desired-state tracking (§21A.7). Gains are identity-hull seeds; hull scale then
  // makes a Wasp snap onto a slot and an Atlas commit without twitching.
  desiredKp: 0.085,
  desiredKv: 0.55,
  desiredMaxForwardAccel: 96,
  desiredMaxLateralAccel: 52,
});

const ZERO_VEL = Object.freeze({ x: 0, z: 0 });
const EMPTY_TRAJECTORY = Object.freeze([]);

export class ManeuverPlanner {
  constructor({ seed = 1, trace = null, config = {} } = {}) {
    this.seed = seed >>> 0;
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.freeze = config.freezeResults === false ? identity : Object.freeze;
    this.includeTrajectory = config.includeTrajectory !== false;
    this.byEntity = new Map();
    // A live perception snapshot is reused until that member's sensor batch refreshes. Keep one
    // stable, ordered contact index per snapshot so the maneuver pass does not rescan the same
    // contacts independently for target lookup, tether/retreat selection, and each avoidance lane.
    // The WeakMap keeps this cache bounded by the existing perception lifetime.
    this.contactIndexes = new WeakMap();
    this.contactIndexing = config.contactIndex !== false;
    this.workCounters = config.workCounters === true
      ? { contactIndexBuilds: 0, indexedContactVisits: 0, legacyContactVisits: 0 }
      : null;
    this.resolveHull = typeof config.resolveHull === 'function' ? config.resolveHull : null;
    this.squadFrames = config.squadFrames === false
      ? null
      : (config.squadFrames || createSquadFrameDirector({ seed: this.seed }));
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
        collisionPasses: new Map(),
        reflex: emptyReflexState(),
        lastReflex: null,
        retreatDeadlockTicks: 0,
        invalidRetreatUntil: -1,
        blockedRetreatX: 0,
        blockedRetreatZ: 0,
        lastRetreatSampleTick: null,
      };
      this.byEntity.set(entityId, runtime);
    }
    // INF-021: a decontrolled ship relents — no drive, no torque, no boost, no brake.
    // The hull keeps whatever velocity the yank gave it, so the tumble reads as drift;
    // when the status clears, ordinary planning resumes off current truth and the ship
    // re-engages cleanly. Deterministic: status plus tick only, never wall time.
    if (self.tumbling === true) {
      runtime.stationaryTicks = 0;
      runtime.lastRot = self.rot;
      runtime.lastRotTick = tick;
      const held = makeThrusterRequest(entityId, tick, {
        kind: ManeuverKind.HOLD,
        forceLocal: { forward: 0, right: 0 },
        torqueYaw: 0,
        boost: false,
        brake: false,
        targetHeading: self.rot,
        horizonTicks: 1,
        trajectory: EMPTY_TRAJECTORY,
        reason: 'decontrolled_tumble',
      }, { freeze: this.freeze });
      runtime.lastKind = ManeuverKind.HOLD;
      runtime.lastRequest = held;
      return held;
    }

    // Tactical Enemy Mind waypoints take locomotion ownership explicitly. Authored formations
    // remain in charge for unmodified pilots and ordinary hull-doctrine PRESS behavior.
    const mindOwned = behavior && behavior.maneuver && behavior.maneuver.enemyMindOwned === true;
    const choreo = !mindOwned && this.squadFrames ? this.squadFrames.planFor(entityId) : null;
    const selfPose = choreo && choreo.live ? overlaySelf(self, choreo.live) : self;
    const baseIntent = behavior && behavior.maneuver ? behavior.maneuver : {
      kind: ManeuverKind.HOLD,
      targetId: null,
      formationSlot: directive.formation.slot,
      formationVelocity: directive.formation.velocity,
      formationBound: directive.formation.bound,
      breakFormation: directive.formation.breakFormation,
      reason: 'no_behavior_intent',
    };
    let intent = choreo ? applyChoreographyIntent(baseIntent, choreo, selfPose) : baseIntent;
    const contacts = Array.isArray(perception.contacts) ? perception.contacts : [];
    const contactIndex = this.contactIndexing ? this._contactIndexFor(perception) : null;
    const target = intent.targetId == null
      ? null
      : contactIndex
        ? contactIndex.byId.get(intent.targetId) || null
        : findContactById(contacts, intent.targetId, this.workCounters);
    const contactSource = contactIndex || { ships: contacts, tethers: contacts, obstacles: contacts };
    // Two unequal hulls holding one slot behind a narrow gap queue by hull clearance.
    // A wide gap or a solo hull keeps the shared slot. collisionRadius is never written.
    if (!choreo && intent.breakFormation !== true
      && (intent.kind === ManeuverKind.HOLD || intent.kind === ManeuverKind.FORMATION)) {
      const queued = queuedGapSlot(
        selfPose,
        intent.formationSlot || selfPose.pos,
        contactSource.ships,
        contactSource.obstacles,
      );
      if (queued) intent = { ...intent, formationSlot: { x: queued.x, z: queued.z } };
    }
    // The sensor frame carries no angular-velocity channel, so differentiate the wrapped
    // heading between plan calls; the yaw request below closes on this measured rate
    // (see yawRateTorqueFor).
    const rotGapTicks = Number.isInteger(runtime.lastRotTick) ? Math.max(1, tick - runtime.lastRotTick) : 1;
    const measuredWy = Number.isFinite(runtime.lastRot)
      ? wrapAngle(selfPose.rot - runtime.lastRot) / (rotGapTicks / 60)
      : 0;
    runtime.lastRot = selfPose.rot;
    runtime.lastRotTick = tick;
    const formationDistance = distance2(selfPose.pos, intent.formationSlot || selfPose.pos);
    const formationBound = Math.max(1, intent.formationBound || 0);
    const rejoinDistance = formationBound * this.config.formationRejoinFraction;
    const mustRejoin = !intent.breakFormation && !choreo && formationDistance > rejoinDistance;
    const hullScale = hullScaleFor(selfPose, entityId, this.resolveHull);
    // Per-pilot flight character (§21A variety): verve/poise/weave/dash/aim, deterministic
    // per entity + doctrine. Every hull feels like its own pilot instead of the same
    // steering gain cloned N times.
    const temperament = temperamentFor(entityId, {
      seed: this.seed,
      doctrineId: selfPose.combatDoctrineId,
      massBand: selfPose.operationalMassBand,
    });
    let desired;
    if (choreo && choreo.coast) {
      desired = coastHold(selfPose);
    } else if (choreo) {
      const cap = this.config.interceptSpeed * (Number.isFinite(choreo.speedFraction) ? choreo.speedFraction : 0.8);
      desired = commitPoint(selfPose, intent.formationSlot, cap, intent.formationVelocity);
      desired = separateDesiredFromFriends(desired, selfPose, contactSource.ships, 72);
    } else if (mustRejoin) {
      desired = trackPoint(selfPose, predictFormationSlot(intent, this.config.formationPredictionTicks), intent.formationVelocity, 1);
    } else {
      desired = desiredForIntent(intent, selfPose, target, contactSource, this.seed, entityId, this.config, this.workCounters, hullScale);
    }

    // Pilot reflexes (bounded trigger→impulse reactions: volley jink, hit weave, marked
    // weave, brake-check, pounce, scatter, heat management). Choreographed and
    // enemy-mind-owned hulls are already speaking with intent; emergency kinds already
    // ARE the reaction. Reflexes shape the desired point, never write the thruster
    // request directly, and never bypass ROE or fire authority.
    let reflex = null;
    if (!choreo && !mindOwned && reflexAllowedForIntent(intent.kind)) {
      reflex = evaluateReflexes(this.seed, {
        entityId,
        tick,
        self: selfPose,
        contacts,
        events: perception && perception.events,
        target,
        intent,
        temperament,
        reflexState: runtime.reflex || (runtime.reflex = emptyReflexState()),
      });
      if (reflex && reflex.lateral) desired = applyReflexToDesired(desired, selfPose, reflex);
      runtime.lastReflex = reflex ? reflex.kind : null;
    }
    if (desired.obstacleAvoidance === true) reflex = null; // a rock in the dodge cone owns the hull

    if (!(choreo && choreo.coast)) {
      desired = applyFriendlySeparation(desired, selfPose, contactSource.ships, this.config, this.workCounters, contactIndex ? 'indexed' : 'legacy');
      if (!choreo) {
        desired = applyShipCollisionAvoidance(desired, selfPose, contactSource.ships, intent, this.seed, entityId, tick, runtime, this.config, this.workCounters, contactIndex ? 'indexed' : 'legacy', target);
      }
    }
    desired = applyObstacleAvoidance(desired, selfPose, contactSource.obstacles, intent, this.config, this.workCounters, contactIndex ? 'indexed' : 'legacy');
    const speed = Math.hypot(selfPose.vel.x, selfPose.vel.z);
    const commanded = Math.hypot(desired.x, desired.z);
    const intentionalHold = intent.kind === ManeuverKind.HOLD && formationDistance <= this.config.arrivalRadius;
    if (!intentionalHold && !choreo && commanded > 0.2 && speed < this.config.stationarySpeed) runtime.stationaryTicks++;
    else runtime.stationaryTicks = 0;

    // NXI-050: a retreat pinned on one blocked corridor must pick a different legal heading
    // inside the deadlock horizon. Retreat speed is not raised to tunnel the obstacle.
    const retreatPinned = !choreo
      && intent.kind === ManeuverKind.RETREAT
      && desired.obstacleAvoidance === true
      && commanded > 0.2
      && speed < this.config.stationarySpeed;
    const retreatGap = Number.isInteger(runtime.lastRetreatSampleTick)
      ? Math.max(1, tick - runtime.lastRetreatSampleTick)
      : 1;
    runtime.lastRetreatSampleTick = tick;
    if (runtime.invalidRetreatUntil >= tick) {
      // The alternate choice is already committed; do not re-arm the same corridor.
    } else if (retreatPinned) {
      runtime.retreatDeadlockTicks = (runtime.retreatDeadlockTicks || 0) + retreatGap;
    } else {
      runtime.retreatDeadlockTicks = 0;
    }
    const retreatHorizon = !choreo
      && intent.kind === ManeuverKind.RETREAT
      && ((runtime.retreatDeadlockTicks || 0) >= this.config.deadlockClearTicks
        || runtime.invalidRetreatUntil >= tick);
    if (retreatHorizon && !(runtime.invalidRetreatUntil >= tick)) {
      runtime.blockedRetreatX = desired.x;
      runtime.blockedRetreatZ = desired.z;
      runtime.invalidRetreatUntil = tick + this.config.deadlockClearTicks;
      runtime.retreatDeadlockTicks = 0;
    }
    if (retreatHorizon) {
      const bx = runtime.blockedRetreatX || desired.x || 1;
      const bz = runtime.blockedRetreatZ || desired.z || 0;
      const mag = Math.hypot(bx, bz) || 1;
      desired = unit2(-bz / mag, bx / mag);
      desired.obstacleAvoidance = false;
    }

    let kind = mustRejoin ? ManeuverKind.FORMATION : intent.kind;
    let reason = mustRejoin ? 'formation_bound_exceeded' : intent.reason || 'action_intent';
    if (!choreo && (retreatHorizon || runtime.stationaryTicks >= this.config.stationaryLimitTicks || runtime.clearUntilTick >= tick)) {
      if (!retreatHorizon && runtime.clearUntilTick < tick) runtime.clearUntilTick = tick + this.config.deadlockClearTicks;
      if (!retreatHorizon) {
        const side = hashUnit(this.seed, entityId, 'deadlock') < 0.5 ? -1 : 1;
        desired = unit2(Math.cos(selfPose.rot) - Math.sin(selfPose.rot) * side * 0.8, Math.sin(selfPose.rot) + Math.cos(selfPose.rot) * side * 0.8);
        reason = 'stationary_watchdog';
      } else {
        reason = 'retreat_corridor_invalid';
      }
      kind = ManeuverKind.CLEAR_DEADLOCK;
      runtime.stationaryTicks = 0;
    }

    const desiredUnit = unit2(desired.x, desired.z, Math.cos(selfPose.rot), Math.sin(selfPose.rot));
    // Some combat phases hold or return to a formation point while charging a fixed gun. Keep the
    // translational request pointed at that slot, but let the authored intent explicitly aim the
    // ship's nose at its target so HOLD does not turn a firing window into deterministic misses.
    // An obstacle dodge is translational — the tracked route drives the forward/strafe channels
    // whatever the nose points at, so a rock in the dodge cone must not steal the firing face.
    // Vetoing it made every ring pass through arena cover a firing blackout: the nose chased the
    // whipping dodge route and fixed mounts sprayed past a stationary target (D38).
    // A dodging pilot sacrifices the firing face during the jink; a gunner keeps the nose
    // on target through everything short of an obstacle dodge.
    // A doctrine that commits a firing corridor or a mass-committed charge publishes an absolute
    // faceAngle: the nose rides that bearing through the window, so a dodged target cannot pull
    // the line back onto itself. A reflex dodge still drops the override — hull integrity beats
    // commitment.
    const facingUnit = !(reflex && reflex.dropAim) && Number.isFinite(intent.faceAngle)
      ? { x: Math.cos(intent.faceAngle), z: Math.sin(intent.faceAngle) }
      : intent.faceTarget === true && target && !(reflex && reflex.dropAim)
        ? unit2(target.pos.x - selfPose.pos.x, target.pos.z - selfPose.pos.z, desiredUnit.x, desiredUnit.z)
        : desiredUnit;
    const heading = Math.atan2(facingUnit.z, facingUnit.x);
    const angleError = wrapAngle(heading - selfPose.rot);
    // The commanded heading itself moves (a target bearing rotates as both ships fly). A
    // rate-only loop can only match that motion by holding a constant lag — measured: a wasp
    // on a strike run parked ~28 deg off the player through the whole fire window and missed.
    // Differentiate the commanded heading between plan calls and feed it forward so the rate
    // channel tracks the bearing instead of lagging it.
    const headingGapTicks = Number.isInteger(runtime.lastHeadingTick) ? Math.max(1, tick - runtime.lastHeadingTick) : 1;
    const headingRate = Number.isFinite(runtime.lastHeading)
      ? wrapAngle(heading - runtime.lastHeading) / (headingGapTicks / 60)
      : 0;
    runtime.lastHeading = heading;
    runtime.lastHeadingTick = tick;
    const forwardDot = Math.cos(selfPose.rot) * desiredUnit.x + Math.sin(selfPose.rot) * desiredUnit.z;
    const rightDot = -Math.sin(selfPose.rot) * desiredUnit.x + Math.cos(selfPose.rot) * desiredUnit.z;
    const arrival = desired.arrivalDistance == null ? Infinity : desired.arrivalDistance;
    const slowRadius = choreo && !choreo.coast
      ? this.config.arrivalRadius
      : approachSlowRadius(kind, formationBound, this.config, intent);
    const envelope = motionEnvelope(kind, intent, arrival, formationDistance, formationBound, this.config, hullScale);
    if (choreo && !choreo.coast) {
      const frac = Number.isFinite(choreo.speedFraction) ? choreo.speedFraction : 0.8;
      envelope.maxSpeed = this.config.interceptSpeed * (hullScale && hullScale.speed > 0 ? hullScale.speed : 1) * frac;
    }
    if (!choreo) {
      // Verve is the pilot's speed appetite; reflex bursts and hot plates gate it further.
      envelope.maxSpeed *= 0.88 + 0.24 * temperament.verve;
      if (reflex) {
        envelope.maxSpeed = Math.max(6, envelope.maxSpeed * reflex.speedScale);
        if (Number.isFinite(envelope.maxClosingSpeed)) {
          envelope.maxClosingSpeed *= Math.min(1, reflex.speedScale);
        }
      }
    }
    const closing = target ? closingSpeed(selfPose, target) : 0;
    const localClosingLimit = target
      ? closeApproachLimit(kind, intent, selfPose, target, this.config, envelope.maxClosingSpeed)
      : envelope.maxClosingSpeed;
    const velocityAlongDesired = selfPose.vel.x * desiredUnit.x + selfPose.vel.z * desiredUnit.z;
    const speedLimited = speed > envelope.maxSpeed + this.config.speedBrakeSlack;
    const closingLimited = target && closing > localClosingLimit + this.config.closingBrakeSlack;
    let throttle = arrival < slowRadius ? saturate(arrival / slowRadius) : 1;

    if (envelope.maxSpeed > 0 && speed > envelope.maxSpeed) {
      const over = speed - envelope.maxSpeed;
      throttle *= clamp(1 - over / Math.max(envelope.maxSpeed, 1), 0, 1);
    }
    const turnGate = this.config.turnBeforeBurnAngle * hullScale.turnBeforeBurn;
    if (Math.abs(angleError) > turnGate) throttle *= 0.35;
    if (velocityAlongDesired > envelope.maxSpeed) throttle *= 0.25;

    const allowReverse = kind === ManeuverKind.HOLD || kind === ManeuverKind.FORMATION || speedLimited;
    const tracked = desired.control === 'track' && desired.desiredPos && kind !== ManeuverKind.CLEAR_DEADLOCK;
    let rawForward;
    let rawRight;
    if (tracked) {
      const axes = desiredAxes(selfPose, desired, desiredUnit, hullScale, this.config);
      rawForward = allowReverse ? axes.forward : Math.max(0, axes.forward);
      rawRight = axes.right * strafeAuthorityForKind(kind);
      if (Math.abs(angleError) > turnGate) rawForward *= 0.35;
      if (envelope.maxSpeed > 0 && speed > envelope.maxSpeed) rawForward *= throttle;
    } else {
      rawForward = (allowReverse ? forwardDot : Math.max(0, forwardDot)) * throttle;
      rawRight = rightDot * throttle * strafeAuthorityForKind(kind);
    }
    if (speedLimited || (!intent.crossingLane && closingLimited)) {
      rawForward = Math.min(rawForward, speedLimited ? 0.04 : 0.18);
      if (!intent.crossingLane) {
        rawRight *= 0.35;
      }
    }
    if (intentionalHold) {
      rawForward = 0;
      rawRight = 0;
    }
    if (choreo && choreo.coast && !desired.obstacleAvoidance) {
      rawForward = 0;
      rawRight = 0;
    }

    const emergencyManeuver = desired.obstacleAvoidance || kind === ManeuverKind.RETREAT || kind === ManeuverKind.ESCAPE_TETHER;
    const rawTorqueYaw = choreo && choreo.coast && !desired.obstacleAvoidance
      ? 0
      : yawRateTorqueFor(angleError, measuredWy, headingRate, kind, this.config, hullScale);
    // Poise scales control slew: a calm pilot leans into inputs, a twitchy one snaps.
    const poiseSlew = 1.18 - 0.7 * temperament.poise;
    const smooth = smoothControls(runtime, tick, {
      forward: rawForward,
      right: rawRight,
      torqueYaw: rawTorqueYaw,
    }, this.config, { emergency: emergencyManeuver, slew: hullScale.slew * poiseSlew });

    const boostWanted = ((kind === ManeuverKind.RETREAT || kind === ManeuverKind.ESCAPE_TETHER || kind === ManeuverKind.CLEAR_DEADLOCK) &&
      speed < envelope.maxSpeed * 0.85 && Math.abs(angleError) < 0.78)
      || (reflex != null && reflex.boost === true && Math.abs(angleError) < 0.9);
    const boost = boostWanted && !desired.obstacleAvoidance && !(reflex && reflex.simmer)
      && selfPose.energyFraction >= this.config.minBoostEnergyFraction && selfPose.heatFraction <= this.config.maxBoostHeatFraction;
    const slotSpeed = choreo && choreo.slotVel
      ? Math.hypot(choreo.slotVel.x || 0, choreo.slotVel.z || 0)
      : 0;
    // crossingLane strips the arrival brake (a committed charge/flyby pass must not slow into
    // its own run point), but defensive reflexes still beat commitment: reflex.brake fires only
    // on an imminent closing contact, the same exception dropAim takes against faceAngle.
    const brake = desired.obstacleBrake || (choreo && choreo.coast
      ? false
      : (intent.crossingLane ? speedLimited : (speedLimited || closingLimited)) || (reflex != null && reflex.brake === true) || (!desired.contactSeek && !(choreo && slotSpeed > 12) && (kind === ManeuverKind.HOLD || kind === ManeuverKind.FORMATION) &&
        arrival < slowRadius && speed > Math.max(4, arrival / 2)));
    const trajectory = this.includeTrajectory
      ? buildTrajectory(selfPose, desiredUnit, speed, tick, this.config.trajectoryHorizonTicks, envelope.maxSpeed)
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
          closingLimit: localClosingLimit,
          speedLimited,
          closingLimited,
          angleError,
          rawForward,
          rawRight,
          rawTorqueYaw,
          energyFraction: selfPose.energyFraction,
          heatFraction: selfPose.heatFraction,
          breakFormation: intent.breakFormation,
          faceTarget: intent.faceTarget === true && !!target,
          obstacleAvoidance: desired.obstacleAvoidance === true,
          heading,
          reflex: reflex ? reflex.kind : null,
          temperament: temperament.id,
        },
      });
    }
    return request;
  }

  forget(entityId) {
    this.byEntity.delete(entityId);
    if (this.squadFrames && typeof this.squadFrames.forget === 'function') this.squadFrames.forget(entityId);
  }

  getWorkCounters() {
    return this.workCounters ? { ...this.workCounters } : null;
  }

  _contactIndexFor(perception) {
    const contacts = perception && Array.isArray(perception.contacts) ? perception.contacts : [];
    // PerceptionMemory owns this monotonic revision. It is the only reliable way to notice a
    // same-array, same-tick update (including contact replacement/reclassification) without
    // rescanning every contact just to fingerprint the snapshot. Unversioned/ad-hoc perceptions
    // fail closed to a per-call index, so callers never receive a stale cached classification.
    const revision = perception && Number.isInteger(perception.revision) ? perception.revision : null;
    const cacheable = revision !== null && perception && typeof perception === 'object';
    let index = cacheable ? this.contactIndexes.get(perception) : null;
    if (index && index.contacts === contacts && index.tick === perception.tick && index.self === perception.self && index.revision === revision) {
      return index;
    }
    if (!index) {
      index = {
        contacts: null,
        tick: null,
        self: null,
        revision: null,
        byId: new Map(),
        ships: [],
        tethers: [],
        obstacles: [],
      };
      if (cacheable) this.contactIndexes.set(perception, index);
    }
    index.contacts = contacts;
    index.tick = perception && perception.tick;
    index.self = perception && perception.self;
    index.revision = revision;
    index.byId.clear();
    index.ships.length = 0;
    index.tethers.length = 0;
    index.obstacles.length = 0;
    if (this.workCounters) this.workCounters.contactIndexBuilds++;
    for (const contact of contacts) {
      if (this.workCounters) {
        this.workCounters.indexedContactVisits++;
      }
      if (!index.byId.has(contact.id)) index.byId.set(contact.id, contact);
      if (contact.kind === ContactKind.SHIP) index.ships.push(contact);
      if (contact.kind === ContactKind.TETHER) index.tethers.push(contact);
      if (contact.kind === ContactKind.HAZARD || contact.tags.includes('solid')) index.obstacles.push(contact);
    }
    return index;
  }

  inspect(entityId = null) {
    if (entityId != null) return freezeRuntime(this.byEntity.get(entityId));
    const out = {};
    for (const [id, state] of this.byEntity) out[String(id)] = freezeRuntime(state);
    return Object.freeze(out);
  }
}

function approachSlowRadius(kind, formationBound, config, intent = null) {
  if (kind === ManeuverKind.INTERCEPT && intent && intent.crossingLane === true) {
    // Attack intercepts commit speed through the crossing pass and must not throttle to a halt.
    return 0;
  }
  if (kind === ManeuverKind.FORMATION) return Math.max(config.arrivalRadius * 2, formationBound * 0.85);
  if (kind === ManeuverKind.HOLD) return Math.max(config.arrivalRadius * 1.5, formationBound * 0.35);
  if (kind === ManeuverKind.ORBIT) return Math.max(config.arrivalRadius * 3, config.orbitRadius * 0.35);
  if (kind === ManeuverKind.APPROACH_SOCKET || kind === ManeuverKind.CUT_TETHER) {
    return Math.max(config.arrivalRadius * 3, formationBound * 0.55);
  }
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

function desiredForIntent(intent, self, target, contactIndex, seed, entityId, config, counters, hullScale) {
  if (intent.flightPoint && Number.isFinite(intent.flightPoint.x) && Number.isFinite(intent.flightPoint.z)) {
    const speed = intent.enemyMindOwned && intent.kind === ManeuverKind.RETREAT
      ? config.retreatSpeed : config.interceptSpeed;
    return commitPoint(self, intent.flightPoint, speed * (hullScale && hullScale.speed || 1));
  }
  switch (intent.kind) {
    case ManeuverKind.INTERCEPT:
      return target
        ? intercept(self, target, config.interceptHorizonTicks, intent.lateralSign, config.interceptSpeed * (hullScale && hullScale.speed || 1), config, intent)
        : trackPoint(self, intent.formationSlot, intent.formationVelocity, 0.7);
    case ManeuverKind.ORBIT: {
      const orbitRadius = Math.max(1, Number.isFinite(intent.preferredRange) ? intent.preferredRange : config.orbitRadius);
      if (target) return orbit(self, target, orbitRadius, seed, entityId, intent.lateralSign,
        contactIndex.obstacles, config, counters,
        contactIndex.ships === contactIndex.obstacles ? 'legacy' : 'indexed');
      // An orbit that names a world point (the witness holder's live-tracked body anchor, when
      // the body itself is not a perception contact) holds that point instead of the squad slot.
      const orbitCenter = intent.orbitCenter && Number.isFinite(intent.orbitCenter.x) && Number.isFinite(intent.orbitCenter.z)
        ? intent.orbitCenter
        : intent.formationSlot;
      return trackPoint(self, orbitCenter, intent.formationVelocity, 0.7);
    }
    case ManeuverKind.SCREEN:
      return screen(self, target, intent.formationSlot, intent.formationVelocity, intent.formationBound);
    case ManeuverKind.APPROACH_SOCKET:
    case ManeuverKind.CUT_TETHER:
      return target ? seekPoint(self, target.pos, 1) : trackPoint(self, intent.formationSlot, intent.formationVelocity, 0.8);
    case ManeuverKind.ESCAPE_TETHER:
      return escapeTether(self, target || nearestTether(contactIndex.tethers, self, counters, contactIndex.tethers === contactIndex.ships ? 'legacy' : 'indexed'), seed, entityId);
    case ManeuverKind.RETREAT:
      return retreat(self, contactIndex.ships, intent.formationSlot, counters, contactIndex.ships === contactIndex.tethers ? 'legacy' : 'indexed');
    case ManeuverKind.FORMATION: {
      // A broken-off formation seek (transit to a named body: freight pod recovery, rendezvous)
      // exists to TOUCH the drifting contact, not to hold its frame. A pure velocity match paces
      // the pickup at standoff (~45 s of orbiting measured on the custody raider), while a raw
      // commit overshoots into buzzing loops. Feed the tracker the contact velocity plus a
      // distance-scaled closing term: fast closure far out, zero relative velocity at contact.
      if (intent.breakFormation === true && target) {
        const slot = intent.formationSlot || target.pos;
        const dx = slot.x - self.pos.x, dz = slot.z - self.pos.z;
        const dist = Math.hypot(dx, dz);
        const inv = dist > 1e-6 ? 1 / dist : 0;
        const closing = Math.min(config.approachSpeed, Math.max(8, dist * 0.8)) * (hullScale && hullScale.speed > 0 ? hullScale.speed : 1);
        const tvx = target.vel && Number.isFinite(target.vel.x) ? target.vel.x : 0;
        const tvz = target.vel && Number.isFinite(target.vel.z) ? target.vel.z : 0;
        return {
          x: dx * 0.8,
          z: dz * 0.8,
          arrivalDistance: dist,
          desiredPos: { x: slot.x, z: slot.z },
          desiredVel: { x: tvx + dx * inv * closing, z: tvz + dz * inv * closing },
          control: 'track',
          contactSeek: true,
        };
      }
      return trackPoint(self, intent.formationSlot, intent.formationVelocity, 0.8);
    }
    case ManeuverKind.HOLD:
    default:
      return trackPoint(self, intent.formationSlot || self.pos, intent.formationVelocity, 0.4);
  }
}

function findContactById(contacts, targetId, counters) {
  for (const contact of contacts) {
    if (counters) counters.legacyContactVisits++;
    if (contact.id === targetId) return contact;
  }
  return null;
}

function intercept(self, target, horizonTicks, lateralSign = 0, commitSpeed = 72, config = null, intent = null) {
  const distance = distance2(self.pos, target.pos);
  const horizon = clamp(distance / 12, 6, horizonTicks);
  const tvx = target.vel && Number.isFinite(target.vel.x) ? target.vel.x : 0;
  const tvz = target.vel && Number.isFinite(target.vel.z) ? target.vel.z : 0;
  const point = { x: target.pos.x + tvx * horizon / 60, z: target.pos.z + tvz * horizon / 60 };
  if (lateralSign) {
    const dx = target.pos.x - self.pos.x, dz = target.pos.z - self.pos.z;
    const length = Math.hypot(dx, dz);
    let nx, nz;
    if (length > 1e-6) {
      nx = dx / length;
      nz = dz / length;
    } else {
      nx = Math.cos(self.rot || 0);
      nz = Math.sin(self.rot || 0);
    }
    // Authored crossing lane: preserves a readable passing corridor tangent to the target.
    // The corridor offset maintains clearance so the interceptor cuts cleanly past
    // the target at gun-envelope range rather than steering nose-in to ram or stall.
    // Ensure corridor offset also clears the target's physical and mass clearance envelope (e.g. capitals).
    const targetClearance = (target.radius || 14) + (config ? massClearanceFor(target, intent, self, config) : 0);
    const minCorridor = target.operationalMassBand === 'capital'
      ? Math.max(200, targetClearance + 105)
      : Math.max(55, targetClearance + 20);
    const maxCorridor = Math.max(120, minCorridor + 40);
    const corridorOffset = clamp(distance * 0.28, minCorridor, maxCorridor) * (lateralSign < 0 ? -1 : 1);
    point.x += -nz * corridorOffset;
    point.z += nx * corridorOffset;

    // Project through-velocity along the crossing lane vector so commit momentum carries
    // through and past the intercept point without decaying into a hover.
    const laneDirX = point.x - self.pos.x;
    const laneDirZ = point.z - self.pos.z;
    const laneLen = Math.hypot(laneDirX, laneDirZ) || 1;
    const throughSpeed = Math.max(commitSpeed, 72);
    const feedVel = {
      x: tvx * 0.35 + (laneDirX / laneLen) * throughSpeed * 0.65,
      z: tvz * 0.35 + (laneDirZ / laneLen) * throughSpeed * 0.65,
    };
    return commitPoint(self, point, commitSpeed, feedVel);
  }
  return commitPoint(self, point, commitSpeed, target.vel || ZERO_VEL);
}

// SF-059: when the ring's tangent carries the hull into solid terrain the reactive dodge cone
// alone pinballs — orbit pulls back in, dodge kicks out, repeat. Sample a small fixed fan of
// rotations off the desired direction instead: each ray is corridor-swept against the perceived
// obstacle set and the pick prefers the widest contiguous clear arc, then alignment with the
// hull's present velocity (a sliding hull keeps sliding rather than re-selecting the blocked
// ring tangent each tick), then the smallest rotation. Rotation stays under half a turn, so the
// authored orbit side never flips, and the pick re-computes every plan so the moment the ring
// ahead is clear the raw tangent wins again — no mode to forget to exit.
const ORBIT_TERRAIN_FAN = Object.freeze([-1.35, -0.95, -0.62, -0.34, 0, 0.34, 0.62, 0.95, 1.35]);

function orbitObstacleFreeRun(self, dir, obstacles, lookahead, margin, skipId, counters, counterMode = 'legacy') {
  let free = lookahead;
  for (const contact of obstacles) {
    countContactVisit(counters, counterMode);
    if (contact.kind !== ContactKind.HAZARD && !contact.tags.includes('solid')) continue;
    // Mirrors applyObstacleAvoidance: live ships are moving contacts handled by the ship
    // pass-around; dead hulks and terrain are cover the ring must respect.
    if (contact.kind === ContactKind.SHIP && contact.alive !== false) continue;
    if (contact.id === skipId) continue;
    const dx = contact.pos.x - self.pos.x, dz = contact.pos.z - self.pos.z;
    const ahead = dx * dir.x + dz * dir.z;
    const across = -dx * dir.z + dz * dir.x;
    const clearance = margin + bodyRadius(contact);
    if (ahead < 0 || ahead > lookahead + clearance || Math.abs(across) >= clearance) continue;
    const entry = ahead - Math.sqrt(Math.max(0, clearance * clearance - across * across));
    if (entry < free) free = Math.max(0, entry);
  }
  return free;
}

function orbit(self, target, radius, seed, entityId, lateralSign = 0, obstacles = null, config = null, counters = null, counterMode = 'legacy') {
  const dx = target.pos.x - self.pos.x, dz = target.pos.z - self.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const radial = (dist - radius) / Math.max(40, radius);
  const side = lateralSign ? (lateralSign < 0 ? -1 : 1) : (hashUnit(seed, entityId, 'orbit') < 0.5 ? -1 : 1);
  const tangentX = -dz / dist * side, tangentZ = dx / dist * side;
  const radialX = dx / dist * clamp(radial, -1, 1), radialZ = dz / dist * clamp(radial, -1, 1);
  const base = { x: tangentX + radialX * 1.15, z: tangentZ + radialZ * 1.15, arrivalDistance: Math.abs(dist - radius) };
  if (!obstacles || obstacles.length === 0) return base;
  const vx = self.vel && Number.isFinite(self.vel.x) ? self.vel.x : 0;
  const vz = self.vel && Number.isFinite(self.vel.z) ? self.vel.z : 0;
  const speed = Math.hypot(vx, vz);
  const lookahead = Math.max(config && config.obstacleLookahead || 110, speed * 1.25);
  const selfRadius = bodyRadius(self);
  const margin = Math.min(config && config.obstacleClearance || 55, Math.max(6, selfRadius * 0.6)) + selfRadius;
  const dir = unit2(base.x, base.z, tangentX, tangentZ);
  if (orbitObstacleFreeRun(self, dir, obstacles, lookahead, margin, target.id, counters, counterMode) >= lookahead) return base;

  const fans = ORBIT_TERRAIN_FAN.map((offset) => {
    const c = Math.cos(offset), s = Math.sin(offset);
    const cand = { x: dir.x * c - dir.z * s, z: dir.x * s + dir.z * c };
    return { offset, dir: cand, free: orbitObstacleFreeRun(self, cand, obstacles, lookahead, margin, target.id, counters, counterMode) };
  });
  let best = fans[0], bestScore = -Infinity;
  for (let i = 0; i < fans.length; i++) {
    const entry = fans[i];
    const feasible = entry.free >= lookahead;
    // A wider safe arc means the pick sits inside a contiguous run of feasible directions —
    // a single threading ray between two bodies is not a lane to hold an orbit on.
    let arc = 0;
    if (feasible) {
      arc = 1;
      for (let j = i - 1; j >= 0 && fans[j].free >= lookahead; j--) arc++;
      for (let j = i + 1; j < fans.length && fans[j].free >= lookahead; j++) arc++;
    }
    const continuity = speed > 1 ? (entry.dir.x * vx + entry.dir.z * vz) / speed : 0;
    const score = (feasible ? 10000 : 0) + arc * 300 + continuity * 60
      - Math.abs(entry.offset) * 25 + Math.min(entry.free, lookahead) * 0.5;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  if (!best || best.offset === 0) return base;
  const mag = Math.hypot(base.x, base.z) || 1;
  return { x: best.dir.x * mag, z: best.dir.z * mag, arrivalDistance: base.arrivalDistance };
}

// INF-024: a screen holds station — it leans toward the threat but never farther than it
// can go without tripping its own formation-rejoin (bound × rejoin fraction). The old
// 35%-of-the-way point put a distant threat hundreds of wu off the slot, so the ship
// lunged out, got yanked home by rejoin, and lunged again: a heroic-chase yo-yo with no
// readable station. The leash keeps the excursion inside the rejoin radius with margin,
// so the screen reads as a held line between protectee and threat.
export const SCREEN_THREAT_LEASH_FRACTION = 0.55;
export const SCREEN_THREAT_LEASH_MAX = 120;
export function screenPoint(slot, targetPos, bound) {
  const sx = finite(slot && slot.x, 0), sz = finite(slot && slot.z, 0);
  const tx = finite(targetPos && targetPos.x, NaN), tz = finite(targetPos && targetPos.z, NaN);
  if (!Number.isFinite(tx) || !Number.isFinite(tz)) return { x: sx, z: sz };
  const dx = tx - sx, dz = tz - sz;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 1)) return { x: sx, z: sz };
  const saneBound = Number.isFinite(bound) && bound > 0 ? bound : 170;
  const leash = Math.min(SCREEN_THREAT_LEASH_MAX, SCREEN_THREAT_LEASH_FRACTION * saneBound);
  const reach = Math.min(dist * 0.35, leash);
  return { x: sx + (dx / dist) * reach, z: sz + (dz / dist) * reach };
}

function screen(self, target, formationSlot, formationVelocity, formationBound) {
  if (!target) return trackPoint(self, formationSlot, formationVelocity, 0.8);
  const point = screenPoint(formationSlot, target.pos, formationBound);
  const vel = formationVelocity || ZERO_VEL;
  const blended = {
    x: (vel.x || 0) * 0.65 + (target.vel && target.vel.x || 0) * 0.35,
    z: (vel.z || 0) * 0.65 + (target.vel && target.vel.z || 0) * 0.35,
  };
  return trackPoint(self, point, blended, 0.85);
}

function escapeTether(self, tether, _seed, _entityId) {
  if (!tether) return { x: Math.cos(self.rot), z: Math.sin(self.rot), arrivalDistance: Infinity };
  const away = unit2(self.pos.x - tether.pos.x, self.pos.z - tether.pos.z, Math.cos(self.rot), Math.sin(self.rot));
  return { x: away.x, z: away.z, arrivalDistance: distance2(self.pos, tether.pos) };
}

function retreat(self, contacts, fallback, counters, counterMode = 'legacy') {
  let x = 0, z = 0, weight = 0;
  for (const contact of contacts) {
    countContactVisit(counters, counterMode);
    if (contact.kind !== ContactKind.SHIP || contact.hostile !== true) continue;
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

function trackPoint(self, point, velocity, throttle) {
  const target = point || self.pos;
  const dx = target.x - self.pos.x, dz = target.z - self.pos.z;
  const distance = Math.hypot(dx, dz);
  const vel = velocity || ZERO_VEL;
  return {
    x: dx * throttle,
    z: dz * throttle,
    arrivalDistance: distance,
    desiredPos: target,
    desiredVel: vel,
    control: 'track',
  };
}

function commitPoint(self, point, commitSpeed, feedVel = ZERO_VEL) {
  const target = point || self.pos;
  const dx = target.x - self.pos.x, dz = target.z - self.pos.z;
  const distance = Math.hypot(dx, dz);
  const inv = distance > 1e-9 ? 1 / distance : 0;
  const speed = Math.max(8, commitSpeed || 0);
  const feed = feedVel || ZERO_VEL;
  return {
    x: dx,
    z: dz,
    arrivalDistance: distance,
    desiredPos: target,
    desiredVel: {
      x: (feed.x || 0) * 0.35 + dx * inv * speed,
      z: (feed.z || 0) * 0.35 + dz * inv * speed,
    },
    control: 'track',
  };
}

function nearestTether(contacts, self, counters, counterMode = 'legacy') {
  let best = null, bestDistance = Infinity;
  for (const contact of contacts) {
    countContactVisit(counters, counterMode);
    if (contact.kind !== ContactKind.TETHER) continue;
    const distance = distance2(self.pos, contact.pos);
    if (distance < bestDistance) { best = contact; bestDistance = distance; }
  }
  return best;
}

function applyFriendlySeparation(desired, self, contacts, config, counters, counterMode = 'legacy') {
  let x = desired.x, z = desired.z;
  for (const contact of contacts) {
    countContactVisit(counters, counterMode);
    if (contact.kind !== ContactKind.SHIP || contact.team !== self.team || contact.id === self.id) continue;
    const dx = self.pos.x - contact.pos.x;
    const dz = self.pos.z - contact.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const clearance = config.friendlySeparationRadius + bodyRadius(self) + bodyRadius(contact);
    if (dist >= clearance) continue;
    const strength = saturate(1 - dist / clearance) * config.friendlySeparationWeight;
    x += dx / dist * strength;
    z += dz / dist * strength;
  }
  return stampDesired(desired, { x, z, arrivalDistance: desired.arrivalDistance });
}

function applyShipCollisionAvoidance(desired, self, contacts, intent, seed, entityId, tick, runtime, config, counters, counterMode = 'legacy', target = null) {
  const dir = unit2(desired.x, desired.z, Math.cos(self.rot), Math.sin(self.rot));
  let x = dir.x, z = dir.z;
  const rightX = -dir.z;
  const rightZ = dir.x;
  const passes = runtime.collisionPasses || (runtime.collisionPasses = new Map());
  // A broken-off contact seek cannot honor a blocker's halo when the destination itself sits
  // inside it (the freight pod spilled 33 WU off the dead carrier, inside its ~72 WU keep-out —
  // the raider slalomed the shoulder for 40 s and never touched the cargo). The seek wins;
  // the solver resolves the scrape physically.
  const seekDest = target && intent && intent.breakFormation === true && maneuverSeeksContact(intent.kind)
    ? target.pos : null;
  for (const contact of contacts) {
    countContactVisit(counters, counterMode);
    if (!contact || contact.kind !== ContactKind.SHIP || contact.id === self.id || contact.alive === false) continue;
    if (contact.id === intent.targetId && explicitRamApproach(intent, self)) continue;
    const dx = contact.pos.x - self.pos.x;
    const dz = contact.pos.z - self.pos.z;
    const distance = Math.hypot(dx, dz);
    const ahead = dx * dir.x + dz * dir.z;
    const lateral = dx * rightX + dz * rightZ;
    const clearance = config.shipCollisionClearance + bodyRadius(self) + bodyRadius(contact)
      + massClearanceFor(contact, intent, self, config);
    if (seekDest && contact.id !== target.id
      && distance2(contact.pos, seekDest) < clearance) continue;
    let pass = passes.get(contact.id) || null;
    const passed = pass && ((self.pos.x - contact.pos.x) * pass.forwardX +
      (self.pos.z - contact.pos.z) * pass.forwardZ > clearance * 1.5);
    if (pass && (passed || tick > pass.untilTick || distance > config.shipCollisionLookahead * 2.4)) {
      passes.delete(contact.id);
      pass = null;
    }
    if (!pass && ahead > 0 && ahead <= config.shipCollisionLookahead && Math.abs(lateral) < clearance) {
      const deterministicSide = hashUnit(seed, entityId, contact.id, 'ship_collision_pass') < 0.5 ? -1 : 1;
      const side = Math.abs(lateral) <= clearance * 0.15 ? deterministicSide : (lateral < 0 ? 1 : -1);
      pass = {
        forwardX: dir.x,
        forwardZ: dir.z,
        pointX: contact.pos.x + dir.x * clearance * 3 + rightX * side * clearance * 1.85,
        pointZ: contact.pos.z + dir.z * clearance * 3 + rightZ * side * clearance * 1.85,
        untilTick: tick + 240,
      };
      passes.set(contact.id, pass);
    }
    if (!pass) continue;
    const passDirection = unit2(pass.pointX - self.pos.x, pass.pointZ - self.pos.z, dir.x, dir.z);
    const proximity = saturate(1 - distance / (config.shipCollisionLookahead * 1.5));
    const blend = clamp(0.65 + proximity * config.shipCollisionWeight, 0, 1);
    x = x * (1 - blend) + passDirection.x * blend;
    z = z * (1 - blend) + passDirection.z * blend;
  }
  return stampDesired(desired, { x, z, arrivalDistance: desired.arrivalDistance });
}

function closeApproachLimit(kind, intent, self, target, config, fallback) {
  if (explicitRamApproach(intent, self) || tetherApproach(kind)) return fallback;
  const clearance = config.shipCollisionClearance + bodyRadius(self) + bodyRadius(target)
    + massClearanceFor(target, intent, self, config);
  const distance = distance2(self.pos, target.pos);
  if (distance > clearance * config.massApproachRangeMult) return fallback;
  if (target.operationalMassBand === 'capital') return Math.min(fallback, config.capitalTargetClosingSpeed);
  if (target.operationalMassBand === 'heavy') return Math.min(fallback, config.heavyTargetClosingSpeed);
  return fallback;
}

function massClearanceFor(contact, intent, self, config) {
  if (intent && contact.id === intent.targetId && (explicitRamApproach(intent, self) || tetherApproach(intent.kind))) return 0;
  if (contact.operationalMassBand === 'capital') return config.capitalTargetClearance;
  if (contact.operationalMassBand === 'heavy') return config.heavyTargetClearance;
  return 0;
}

function explicitRamApproach(intent, self) {
  if (!intent || intent.ramAuthorized !== true || !self) return false;
  if (self.operationalMassBand !== 'heavy' && self.operationalMassBand !== 'capital') return false;
  const activity = self.activity;
  if (!activity || activity.kind !== 'attack_run') return false;
  return !String(activity.reason || '').includes('station_jurisdiction');
}

function tetherApproach(kind) {
  return kind === ManeuverKind.APPROACH_SOCKET || kind === ManeuverKind.CUT_TETHER;
}

// Kinds whose named targetId is a destination to reach or touch (pod recovery transit, tether
// work, an intercept run's commit point) rather than a body to orbit or hold range against.
function maneuverSeeksContact(kind) {
  return kind === ManeuverKind.FORMATION || kind === ManeuverKind.INTERCEPT || tetherApproach(kind);
}

function applyObstacleAvoidance(desired, self, contacts, intent, config, counters, counterMode = 'legacy') {
  const dir = unit2(desired.x, desired.z, Math.cos(self.rot), Math.sin(self.rot));
  const speed = Math.hypot(self.vel.x, self.vel.z);
  const lookahead = Math.max(config.obstacleLookahead, speed * 1.25);
  // Self hull radius is loop-invariant; it was re-derived twice per contact inside the margin.
  const selfRadius = bodyRadius(self);
  const selfMarginBase = Math.min(config.obstacleClearance, Math.max(6, selfRadius * 0.6)) + selfRadius;
  let obstacle = null, nearest = Infinity, clearance = 0, lateral = 0, along = 0;
  for (const contact of contacts) {
    countContactVisit(counters, counterMode);
    if (contact.kind !== ContactKind.HAZARD && !contact.tags.includes('solid')) continue;
    // A live ship is a moving contact, not cover: applyShipCollisionAvoidance already plans the
    // pass-around with memory, and it never vetoes faceTarget. Letting the obstacle sweep claim
    // ships too made a packed orbit ring read as an obstacle every tick — the firing face was
    // stolen ~9 out of 10 plans, the nose chased a whipping dodge route, and fixed mounts sprayed
    // past the target (D38). Dead hulks still count as cover.
    if (contact.kind === ContactKind.SHIP && contact.alive !== false) continue;
    // The maneuver's own objective is never its obstacle: a contact-seeking intent (transit to a
    // pod, tether approach) exists to reach that body, so steering to its shoulder would hold the
    // ship ~1.25 clearances off the target forever (measured: the custody raider parked 49 WU out
    // and never touched the drifting freight pod).
    if (contact.id === intent.targetId && maneuverSeeksContact(intent.kind)) continue;
    const dx = contact.pos.x - self.pos.x, dz = contact.pos.z - self.pos.z;
    const ahead = dx * dir.x + dz * dir.z;
    const across = -dx * dir.z + dz * dir.x;
    // Leave real hull clearance without sealing every authored choke with a 55-WU halo.
    const margin = selfMarginBase + bodyRadius(contact);
    if (ahead < 0 || ahead > lookahead + margin || Math.abs(across) >= margin) continue;
    const entry = ahead - Math.sqrt(Math.max(0, margin * margin - across * across));
    if (entry >= nearest) continue;
    obstacle = contact; nearest = entry; clearance = margin; lateral = across; along = ahead;
  }
  if (!obstacle) return desired;
  // A two-unit nudge cannot alter a 600-unit seek vector. More importantly, tracked
  // maneuvers use desiredPos/desiredVel, so changing only x/z never changed their thrust.
  // Route the physical controller toward the near shoulder of the blocking collider.
  const side = Math.abs(lateral) > 1 ? -Math.sign(lateral)
    : (hashUnit(0, self.id, obstacle.id, 'rock_pass') < 0.5 ? -1 : 1);
  const point = {
    x: obstacle.pos.x - dir.x * clearance * 0.4 - dir.z * side * clearance * 1.25,
    z: obstacle.pos.z - dir.z * clearance * 0.4 + dir.x * side * clearance * 1.25,
  };
  const route = unit2(point.x - self.pos.x, point.z - self.pos.z);
  const routeSpeed = Math.min(config.interceptSpeed, Math.max(25, speed * 0.75));
  return {
    ...desired, x: route.x, z: route.z, control: 'track', desiredPos: point,
    desiredVel: { x: route.x * routeSpeed, z: route.z * routeSpeed },
    obstacleAvoidance: true,
    obstacleBrake: speed > 20 && along < clearance + speed * 0.75,
  };
}

function motionEnvelope(kind, intent, arrival, formationDistance, formationBound, config, hullScale = ENEMY_MOTION_IDENTITY_SCALE) {
  const speed = hullScale && hullScale.speed > 0 ? hullScale.speed : 1;
  const closing = hullScale && hullScale.closing > 0 ? hullScale.closing : 1;
  let maxSpeed;
  let maxClosingSpeed;
  switch (kind) {
    case ManeuverKind.HOLD:
      maxSpeed = arrival <= config.arrivalRadius ? 0 : config.holdSpeed;
      maxClosingSpeed = config.maxApproachClosingSpeed;
      break;
    case ManeuverKind.FORMATION:
      // Tactical waypoints are combat maneuvers, not slow formation rejoin. Reuse the existing
      // intercept envelope; never invent extra speed or alter the hull-relative physics scale.
      maxSpeed = intent.enemyMindOwned === true && intent.flightPoint
        ? config.interceptSpeed
        : clamp(Math.max(config.patrolSpeed, formationDistance * 0.42), config.patrolSpeed, config.formationSpeed);
      maxClosingSpeed = config.maxApproachClosingSpeed;
      break;
    case ManeuverKind.SCREEN:
      maxSpeed = config.screenSpeed;
      maxClosingSpeed = config.maxApproachClosingSpeed;
      break;
    case ManeuverKind.ORBIT:
      maxSpeed = config.orbitSpeed;
      maxClosingSpeed = config.maxOrbitClosingSpeed;
      break;
    case ManeuverKind.APPROACH_SOCKET:
    case ManeuverKind.CUT_TETHER:
      maxSpeed = Math.min(config.approachSpeed, Math.max(config.patrolSpeed, arrival * 0.45));
      maxClosingSpeed = config.maxApproachClosingSpeed;
      break;
    case ManeuverKind.INTERCEPT:
      maxSpeed = config.interceptSpeed;
      maxClosingSpeed = config.interceptSpeed * 1.5;
      break;
    case ManeuverKind.RETREAT:
      maxSpeed = config.retreatSpeed;
      maxClosingSpeed = Infinity;
      break;
    case ManeuverKind.ESCAPE_TETHER:
      maxSpeed = config.escapeSpeed;
      maxClosingSpeed = Infinity;
      break;
    case ManeuverKind.CLEAR_DEADLOCK:
      maxSpeed = config.clearDeadlockSpeed;
      maxClosingSpeed = Infinity;
      break;
    default:
      maxSpeed = config.patrolSpeed;
      maxClosingSpeed = config.maxApproachClosingSpeed;
  }
  return {
    maxSpeed: maxSpeed * speed,
    maxClosingSpeed: Number.isFinite(maxClosingSpeed) ? maxClosingSpeed * closing : maxClosingSpeed,
  };
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

function yawRateTorqueFor(angleError, measuredWy, headingRate, kind, config, hullScale = ENEMY_MOTION_IDENTITY_SCALE) {
  if (Math.abs(angleError) < config.yawDeadband && Math.abs(measuredWy) < 0.08) return 0;
  const yaw = hullScale && hullScale.yaw > 0 ? hullScale.yaw : 1;
  const limit = yawLimitForKind(kind) * yaw;
  // Feedforward is capped at the same slew bound as the proportional channel: tracking a racing
  // bearing may spend the full rate budget, but it cannot re-pump a whirlpool — the commanded
  // rate still collapses to the proportional term the moment the heading stops moving.
  const track = clamp(Number.isFinite(headingRate) ? headingRate : 0, -config.yawRateTarget, config.yawRateTarget);
  const desiredWy = track + clamp(angleError / config.yawSoftAngle, -1, 1) * config.yawRateTarget;
  return clamp((desiredWy - measuredWy) * config.yawRateGain, -limit, limit);
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
  const slew = options.slew > 0 ? options.slew : 1;
  const inputStep = (options.emergency ? config.emergencyInputSlewPerTick : config.inputSlewPerTick) * ticks * slew;
  const torqueStep = (options.emergency ? config.emergencyTorqueSlewPerTick : config.torqueSlewPerTick) * ticks * slew;
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
  if (!target || !target.pos || !self || !self.pos) return 0;
  const dx = target.pos.x - self.pos.x;
  const dz = target.pos.z - self.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const svx = self.vel && Number.isFinite(self.vel.x) ? self.vel.x : 0;
  const svz = self.vel && Number.isFinite(self.vel.z) ? self.vel.z : 0;
  const tvx = target.vel && Number.isFinite(target.vel.x) ? target.vel.x : 0;
  const tvz = target.vel && Number.isFinite(target.vel.z) ? target.vel.z : 0;
  return ((svx - tvx) * dx + (svz - tvz) * dz) / dist;
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

function countContactVisit(counters, mode) {
  if (!counters) return;
  if (mode === 'indexed') counters.indexedContactVisits++;
  else counters.legacyContactVisits++;
}

function identity(value) {
  return value;
}

function hullScaleFor(self, entityId, resolveHull) {
  const hint = typeof resolveHull === 'function' ? resolveHull(entityId) : null;
  const hullId = (self && (self.hullId || self.defId))
    || (hint && hint.hullId)
    || null;
  const flightClass = (self && self.flightClass)
    || (hint && hint.flightClass)
    || null;
  return deriveEnemyMotionScale(hullId, flightClass);
}

function desiredAxes(self, desired, desiredUnit, hullScale, config) {
  const pos = desired.desiredPos;
  const vel = desired.desiredVel || ZERO_VEL;
  const kp = config.desiredKp * (hullScale && hullScale.track > 0 ? hullScale.track : 1);
  const kv = config.desiredKv * (hullScale && hullScale.damp > 0 ? hullScale.damp : 1);
  const rightX = -desiredUnit.z;
  const rightZ = desiredUnit.x;
  const epx = pos.x - self.pos.x;
  const epz = pos.z - self.pos.z;
  const evx = (vel.x || 0) - (self.vel.x || 0);
  const evz = (vel.z || 0) - (self.vel.z || 0);
  const alongA = kp * (epx * desiredUnit.x + epz * desiredUnit.z) + kv * (evx * desiredUnit.x + evz * desiredUnit.z);
  const latA = kp * (epx * rightX + epz * rightZ) + kv * (evx * rightX + evz * rightZ);
  const wx = desiredUnit.x * alongA + rightX * latA;
  const wz = desiredUnit.z * alongA + rightZ * latA;
  const c = Math.cos(self.rot || 0);
  const s = Math.sin(self.rot || 0);
  const maxFwd = Math.max(1, config.desiredMaxForwardAccel * (hullScale && hullScale.accel > 0 ? hullScale.accel : 1));
  const maxLat = Math.max(1, config.desiredMaxLateralAccel * (hullScale && hullScale.strafe > 0 ? hullScale.strafe : 1));
  return {
    forward: clamp((wx * c + wz * s) / maxFwd, -1, 1),
    right: clamp((-wx * s + wz * c) / maxLat, -1, 1),
  };
}

function stampDesired(source, next) {
  if (!source || source.control !== 'track') return next;
  next.control = 'track';
  next.desiredPos = source.desiredPos;
  next.desiredVel = source.desiredVel;
  next.contactSeek = source.contactSeek;
  return next;
}

/**
 * Displace the desired state sideways by the reflex's signed lateral offset (world units).
 * Tracked desireds shift the setpoint and feed a lateral velocity term so the PD solver
 * actually flies the weave instead of just bending the heading; direction-only desireds
 * rotate by the offset angle.
 */
function applyReflexToDesired(desired, self, reflex) {
  if (!desired || !reflex || !Number.isFinite(reflex.lateral) || Math.abs(reflex.lateral) < 0.5) {
    return desired;
  }
  const dir = unit2(desired.x, desired.z, Math.cos(self.rot), Math.sin(self.rot));
  const perpX = -dir.z;
  const perpZ = dir.x;
  const lat = reflex.lateral;
  // desired.x/z is a distance-scaled vector (the solver re-normalizes it), so adding the
  // full lateral term rotates the commanded direction by ~atan(lat / dist) — the jink.
  const out = { ...desired, x: desired.x + perpX * lat, z: desired.z + perpZ * lat };
  if (desired.desiredPos) {
    out.control = 'track';
    out.desiredPos = {
      x: desired.desiredPos.x + perpX * lat,
      z: desired.desiredPos.z + perpZ * lat,
    };
    const vel = desired.desiredVel || ZERO_VEL;
    out.desiredVel = {
      x: vel.x + perpX * lat * 1.1,
      z: vel.z + perpZ * lat * 1.1,
    };
    out.contactSeek = desired.contactSeek;
  }
  return out;
}

function overlaySelf(self, live) {
  const pos = live.pos || self.pos;
  const vel = live.vel || self.vel;
  return {
    ...self,
    pos: { x: Number.isFinite(pos.x) ? pos.x : 0, z: Number.isFinite(pos.z) ? pos.z : 0 },
    vel: { x: Number.isFinite(vel.x) ? vel.x : 0, z: Number.isFinite(vel.z) ? vel.z : 0 },
    rot: Number.isFinite(live.rot) ? live.rot : self.rot,
    radius: Number.isFinite(live.radius) ? live.radius : self.radius,
    hullFraction: Number.isFinite(live.hullFraction) ? live.hullFraction : self.hullFraction,
  };
}

function applyChoreographyIntent(intent, choreo, self) {
  const slot = choreo.slot || self.pos;
  const vel = choreo.slotVel || ZERO_VEL;
  const faceTarget = choreo.faceTarget === true || intent.faceTarget === true;
  if (choreo.coast) {
    return {
      ...intent,
      kind: ManeuverKind.HOLD,
      targetId: faceTarget ? (intent.targetId || choreo.targetId) : null,
      formationSlot: { x: self.pos.x, z: self.pos.z },
      formationVelocity: { x: self.vel.x, z: self.vel.z },
      formationBound: choreo.bound || intent.formationBound,
      breakFormation: true,
      flightPoint: null,
      faceTarget,
      reason: choreo.reason || intent.reason,
    };
  }
  return {
    ...intent,
    kind: ManeuverKind.FORMATION,
    targetId: faceTarget ? (intent.targetId || choreo.targetId) : intent.targetId,
    formationSlot: { x: slot.x, z: slot.z },
    formationVelocity: { x: vel.x || 0, z: vel.z || 0 },
    formationBound: choreo.bound || intent.formationBound || 120,
    breakFormation: false,
    flightPoint: null,
    faceTarget,
    reason: choreo.reason || intent.reason,
  };
}

function coastHold(self) {
  return {
    x: 0,
    z: 0,
    arrivalDistance: 0,
    desiredPos: self.pos,
    desiredVel: self.vel || ZERO_VEL,
    control: 'track',
  };
}

function separateDesiredFromFriends(desired, self, ships, minDist) {
  if (!desired || !desired.desiredPos || !self) return desired;
  let x = desired.desiredPos.x;
  let z = desired.desiredPos.z;
  for (const contact of ships || []) {
    if (!contact || contact.kind !== ContactKind.SHIP) continue;
    if (contact.id === self.id || contact.team !== self.team) continue;
    const dx = x - (contact.pos.x || 0);
    const dz = z - (contact.pos.z || 0);
    const dist = Math.hypot(dx, dz) || 1e-6;
    const clearance = minDist + bodyRadius(self) + bodyRadius(contact) * 0.25;
    if (dist >= clearance) continue;
    const push = (clearance - dist) * 0.65;
    x += dx / dist * push;
    z += dz / dist * push;
  }
  desired.desiredPos = { x, z };
  desired.arrivalDistance = Math.hypot(x - self.pos.x, z - self.pos.z);
  return desired;
}
