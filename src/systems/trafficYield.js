// Read-only guidance for ambient civilian motors. V3 remains the propulsion-command owner;
// the native solver remains the sole body writer, including when there is too little room to yield.
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isRecovering, isTumbling } from '../combat/tumbleStatus.js';
import { hullEnvelopeWu, proxyOuterRadiusWu, resolveCollisionProxyManifest } from '../data/collisionProxyManifests.js';

export const TRAFFIC_YIELD_TUNING = Object.freeze({
  lookaheadS: 2, clearanceWu: 4, queryRadiusWu: 1000, maximumSpeedCorrectionFraction: 0.35,
});
const AMBIENT_ROLES = new Set(['hauler', 'courier', 'ore_carrier', 'shuttle', 'tanker',
  'arclight', 'tourist', 'miner', 'prospector', 'surveyor', 'tender', 'salvor', 'tug', 'rescue']);
const CRUISE_ACTIVITIES = new Set(['travel', 'transit', 'drift', 'idle', 'cruise']);
const BODY_TYPES = new Set(['ship', 'drone', 'station', 'asteroid', 'obstacle', 'wreck', 'payload', 'debris']);
const QUERY = [];
const CONTACTS = [];
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const positive = v => Number.isFinite(v) && v > 0 ? v : 0;
const scale = v => Math.max(0, Math.min(1, finite(v, 1)));
const positionFinite = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

function reach(entity) {
  const proxy = resolveCollisionProxyManifest(entity);
  return Math.max(positive(entity.radius), positive(entity.physicsBody?.radius),
    hullEnvelopeWu(entity), proxy ? proxyOuterRadiusWu(proxy, entity) : 0);
}

function activeCivilianMotor(state, entity, raw) {
  const data = entity?.data, ai = data?.ai, flags = entity?.flags;
  // Being unarmed, team 2, or ai:null is not a movement lease. Require the existing ambient
  // traffic role AND its passive pilot, then decline every independent choreography owner.
  if (state.mode !== 'flight' || !entity || entity.alive === false || entity.type !== 'ship'
    || entity.isPlayer || entity.id === state.playerId || state.entities?.get(entity.id) !== entity
    || entity.team !== 2 || !AMBIENT_ROLES.has(data?.trafficRole) || ai?.passive !== true
    || data.intent !== raw || !raw || entity.collides === false || entity.physicsBody === false
    || entity.physicsBody?.dynamic === false || entity.disabled === true
    || data.disabled || data.derelict || data.engineDead || data.deadInWater || data.surrendered
    || flags?.disabled || flags?.derelict || flags?.tethered || data.tethered
    || raw.fire || raw.boost || raw.brake || raw.fullStop || raw.flipBurn
    || raw.flightPoint || raw.faceTarget || raw.drawFlight?.active
    || data.jobId != null || data.towTargetId != null || data.wakeHaulerOf != null
    || data.npcTowedByJobId != null || data.runCohort != null || state.run?.kind === 'survival'
    || data.missionId != null || data.missionTag != null || data.missionPinned || flags?.missionPinned
    || data.contractId != null || data.scenarioActorId != null || data.scenarioRole != null
    || data.activityActorSlotId != null || data.ceresActivityCast || data.authoredActivityCast
    || data.worldSiteTrafficHookId != null || data.claimTravelTrafficHookId != null || data.claimDepotId != null
    || data.namedLaneContactId != null || data.itinerary != null || data.encounter != null
    || data.playerOwned || data.wingman || data.isBoss || data.encounterBoss
    || data.predationRole != null || data.predationIdentityKey != null || data.freightCustody != null
    || data.heatChallenge != null || ai.encounterId != null || ai.securityTargetId != null
    || ai.retaliationTargetId != null || ai.predationTargetId != null || ai.witnessRole != null
    || data.combat?.targetId != null || data.combat?.lockTarget != null) return false;
  if (isTumbling(state, entity) || isRecovering(state, entity)) return false;
  if (ai.activity?.kind && !CRUISE_ACTIVITIES.has(ai.activity.kind)) return false;
  if (Math.abs(finite(raw.turnIntent)) > 0.05 && !Number.isFinite(raw.aimAngle)) return false;
  const home = data.sectorId || data.homeSectorId;
  if (home && state.world?.currentSectorId && home !== state.world.currentSectorId) return false;
  return positionFinite(entity.pos) && positionFinite(entity.vel);
}

function weakestAcceleration(profile, authority) {
  let forward, reverse, side;
  if (profile.family === 'gravimetric') {
    forward = side = positive(profile.maxAccel);
    reverse = positive(profile.maxBrakeAccel) || forward;
  } else if (profile.family === 'pulse_plate') {
    forward = positive(profile.rcsForwardAccel); reverse = positive(profile.rcsReverseAccel);
    side = positive(profile.rcsStrafeAccel);
  } else if (profile.family === 'sail') {
    forward = reverse = side = positive(profile.trimAccel);
  } else {
    forward = positive(profile.mainAccel); reverse = positive(profile.reverseAccel);
    side = positive(profile.strafeAccel);
  }
  return Math.min(forward * scale(authority?.forward), reverse * scale(authority?.reverse),
    side * scale(authority?.strafe));
}

/** Swept circles in a shared moving frame. Overlap is reported, never treated as a safe path. */
export function predictTrafficContact(self, other, velocity, horizon = TRAFFIC_YIELD_TUNING.lookaheadS) {
  const x = other.pos.x - self.pos.x, z = other.pos.z - self.pos.z;
  const vx = other.vel.x - velocity.x, vz = other.vel.z - velocity.z;
  const radius = self.radius + other.radius + TRAFFIC_YIELD_TUNING.clearanceWu;
  const distanceSq = x * x + z * z;
  if (distanceSq <= radius * radius) return { overlap: true, time: 0 };
  const speedSq = vx * vx + vz * vz, dot = x * vx + z * vz;
  if (!(speedSq > 1e-6) || dot >= 0) return null;
  const discriminant = dot * dot - speedSq * (distanceSq - radius * radius);
  if (discriminant < 0) return null;
  const time = (-dot - Math.sqrt(discriminant)) / speedSq;
  if (!(time >= 0) || time > horizon) return null;
  const closestTime = Math.min(horizon, -dot / speedSq);
  const closestX = x + vx * closestTime, closestZ = z + vz * closestTime;
  return { overlap: false, time, closestTime, closestX, closestZ, radius };
}

function stableBefore(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a < b;
  return String(a) < String(b);
}

function missClearance(self, other, velocity) {
  const x = other.pos.x - self.pos.x, z = other.pos.z - self.pos.z;
  const vx = other.vel.x - velocity.x, vz = other.vel.z - velocity.z;
  const speedSq = vx * vx + vz * vz;
  const time = speedSq > 1e-6
    ? Math.max(0, Math.min(TRAFFIC_YIELD_TUNING.lookaheadS, -(x * vx + z * vz) / speedSq)) : 0;
  return Math.hypot(x + vx * time, z + vz * time) - self.radius - other.radius - TRAFFIC_YIELD_TUNING.clearanceWu;
}

/** An optional velocity target for the existing bounded rendezvous servo, derived anew each tick.
 * No saved latch or hidden motor state: reloading, replacing a life, or changing owner cannot
 * inherit a previous lane-change command. The route owner keeps its intent object untouched.
 */
export function planCivilianTrafficYield(state, entity, raw, input, profile, authority) {
  const inactive = reason => ({ active: false, reason });
  if (!activeCivilianMotor(state, entity, raw)) return inactive('movement-owned');
  const acceleration = weakestAcceleration(profile, authority);
  if (!(acceleration > 0)) return inactive('no-authority');
  const speed = positive(profile.combatSpeed) || positive(profile.maxSpeed);
  if (!(speed > 0)) return inactive('unknown-drive');
  const yaw = finite(entity.rot), cf = Math.cos(yaw), sf = Math.sin(yaw);
  const throttle = finite(input.throttle), strafe = finite(input.strafe);
  const inputLength = Math.max(1, Math.hypot(throttle, strafe));
  const velocity = input.rendezvous?.velocity || {
    x: speed * (throttle * cf - strafe * sf) / inputLength,
    z: speed * (throttle * sf + strafe * cf) / inputLength,
  };
  if (!positionFinite(velocity)) return inactive('invalid-intent');
  const heading = input.rendezvous?.heading ?? (Number.isFinite(raw.aimAngle) ? raw.aimAngle : yaw);
  if (!Number.isFinite(heading)) return inactive('invalid-intent');
  const self = { pos: entity.pos, vel: entity.vel, radius: reach(entity) };
  const list = queryNearbyEntities(state, entity.pos, TRAFFIC_YIELD_TUNING.queryRadiusWu, QUERY);
  CONTACTS.length = 0;
  for (const other of list) {
    if (!other || other === entity || other.alive === false || other.collides === false
      || other.physicsBody === false || other.physicsBody?.sensor === true || state.entities?.get(other.id) !== other
      || !BODY_TYPES.has(other.type) || !positionFinite(other.pos) || !positionFinite(other.vel)) continue;
    const home = other.data?.sectorId || other.data?.homeSectorId;
    if (home && state.world?.currentSectorId && home !== state.world.currentSectorId) continue;
    const rx = other.pos.x - entity.pos.x, rz = other.pos.z - entity.pos.z;
    if (rx * rx + rz * rz > TRAFFIC_YIELD_TUNING.queryRadiusWu ** 2) continue;
    CONTACTS.push({ entity: other, pos: other.pos, vel: other.vel, radius: reach(other) });
  }
  let threat = null, encounter = null;
  for (const other of CONTACTS) {
    // The route owner already handles terrain and berths. Static scenery constrains a lane
    // change below but does not replace an existing approach/arrival controller.
    if (other.entity.type !== 'ship' && other.entity.type !== 'drone') continue;
    // Only another eligible civilian participates in the tie-break. A scripted hull, disabled
    // vessel or manual player never acquires an obligation to yield because of its numeric ID.
    if (activeCivilianMotor(state, other.entity, other.entity.data?.intent)
      && stableBefore(entity.id, other.entity.id)) continue;
    const actual = predictTrafficContact(self, other, entity.vel);
    const intended = predictTrafficContact(self, other, velocity);
    if (actual?.overlap || intended?.overlap) continue;
    const predicted = !actual ? intended : !intended ? actual : actual.time < intended.time ? actual : intended;
    if (!predicted) continue;
    if (!encounter || predicted.time < encounter.time
      || (predicted.time === encounter.time && stableBefore(other.entity.id, threat.entity.id))) {
      threat = other; encounter = predicted;
    }
  }
  if (!threat) {
    const overlapping = CONTACTS.some(other => predictTrafficContact(self, other, entity.vel)?.overlap);
    return inactive(overlapping ? 'existing-overlap' : 'clear');
  }
  const distance = Math.hypot(encounter.closestX, encounter.closestZ);
  // Head-on traffic takes its starboard side; otherwise prefer the existing miss side.
  const nx = distance > 1e-5 ? -encounter.closestX / distance : -sf;
  const nz = distance > 1e-5 ? -encounter.closestZ / distance : cf;
  const time = Math.max(1 / 60, encounter.closestTime);
  const available = Math.min(speed * TRAFFIC_YIELD_TUNING.maximumSpeedCorrectionFraction, acceleration * time * 0.5);
  const required = 2 * (encounter.radius - distance) / time;
  const side = Math.min(required, available), opposite = Math.min(2 * (encounter.radius + distance) / time, available);
  const nominalSpeed = Math.hypot(velocity.x, velocity.z);
  const brakeFraction = nominalSpeed > 1e-6 ? Math.min(1, available / nominalSpeed) : 0;
  const candidates = [
    { x: velocity.x + nx * side, z: velocity.z + nz * side },
    { x: velocity.x - nx * opposite, z: velocity.z - nz * opposite },
    { x: velocity.x * (1 - brakeFraction), z: velocity.z * (1 - brakeFraction) },
  ];
  let chosen = null, bestClearance = missClearance(self, threat, velocity);
  for (const candidate of candidates) {
    const candidateSpeed = Math.hypot(candidate.x, candidate.z);
    const cap = Math.max(speed, nominalSpeed);
    if (candidateSpeed > cap) { candidate.x *= cap / candidateSpeed; candidate.z *= cap / candidateSpeed; }
    // Never buy clearance from one ship by steering into a previously clear neighbour/rock.
    // This is a conservative circular preview, not a guarantee that finite thrust can avoid
    // every encounter. Native collision response remains intact for unavoidable contacts.
    if (CONTACTS.some(other => other !== threat && missClearance(self, other, velocity) >= 0
      && missClearance(self, other, candidate) < 0)) continue;
    const clearance = missClearance(self, threat, candidate);
    if (clearance > bestClearance + 1e-6) { chosen = candidate; bestClearance = clearance; }
    if (chosen && bestClearance >= 0) break;
  }
  if (!chosen) return inactive('blocked');
  return { active: true, reason: required > available || bestClearance < 0 ? 'authority-limited' : 'yielding',
    otherId: threat.entity.id, heading, velocity: chosen };
}
