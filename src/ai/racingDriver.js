// A race pilot publishes ordinary flight inputs. Flight V3 and the physics owner
// remain the only propulsion and motion writers; no catch-up speed or pose edits.
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { gateApproach } from '../systems/racingGeometry.js';

export const RACING_PERSONALITIES = Object.freeze([
  Object.freeze({ id: 'mira', name: 'Mira Vale', hullId: 'ship_kestrel', style: 'Clean lines', pace: 0.94, corner: 0.82, lane: -1 }),
  Object.freeze({ id: 'rook', name: 'Rook Six', hullId: 'ship_wasp', style: 'Late apexes', pace: 1, corner: 1, lane: 1 }),
  Object.freeze({ id: 'sable', name: 'Sable Reed', hullId: 'ship_drifter', style: 'Patient overtakes', pace: 0.9, corner: 0.74, lane: -1 }),
]);
export const RACING_DIFFICULTIES = Object.freeze({ rookie: 0.68, club: 0.86, expert: 1 });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const angle = x => Math.atan2(Math.sin(x), Math.cos(x));
const idle = () => ({ moveX: 0, moveZ: 0, turnIntent: 0, brake: true, boost: false, fire: false, assistMode: 'newtonian' });

export function createRacingDriver(personality, difficulty = 'club') {
  return { personality, difficulty: RACING_DIFFICULTIES[difficulty] ? difficulty : 'club',
    recovering: false, recoveries: 0, laneWU: 0, lastGate: -1, lastLap: -1 };
}

/** Curvature sets the crossing speed; finite reverse thrust sets the braking distance. */
export function racingCornerSpeed(gates, index, aperture, profile, personality) {
  const from = gateApproach(gates, index), gate = gates[index];
  const next = gates[index + 1] || gates[1];
  if (!from || !next) return 30;
  const dx = next.x - gate.x, dz = next.z - gate.z, length = Math.hypot(dx, dz) || 1;
  const turn = Math.acos(clamp((dx * from.nx + dz * from.nz) / length, -1, 1));
  if (turn < 0.1) return Number(profile.combatSpeed || profile.maxSpeed) || 180;
  const lateral = Number(profile.strafeAccel || profile.maxAccel) || 60;
  const radius = Math.max(18, aperture * 0.65) / Math.max(0.2, Math.tan(Math.min(2.8, turn) / 2));
  return Math.max(26, Math.sqrt(lateral * radius) * personality.corner);
}

/** `nearby` contains actual bodies, never a scripted leader or a pace beacon. */
export function racingDriverIntent(driver, { entity, params, gates, nearby = [], dt = 1 / 60, held = false }) {
  if (!entity?.pos || held || !gates?.length || params.nextGate >= gates.length) return idle();
  const next = Math.max(0, params.nextGate | 0), lap = params.lap | 0;
  const gate = gates[next], from = gateApproach(gates, next);
  if (!from) return idle();
  const profile = resolvePropulsionProfile(entity);
  const personality = driver.personality || RACING_PERSONALITIES[0];
  const aperture = Number(params.gateRadiusWU) || 80;
  const radius = Number(entity.radius) || 18;
  const plane = (entity.pos.x - gate.x) * from.nx + (entity.pos.z - gate.z) * from.nz;
  if (driver.lastGate !== next || driver.lastLap !== lap) {
    driver.lastGate = next; driver.lastLap = lap; driver.recovering = false;
  }
  // A missed aperture is approached again from its legal side. The craft must fly
  // the recovery under its own power and still cross the same ordered gate.
  if (plane > 24 && !driver.recovering) { driver.recovering = true; driver.recoveries++; }
  if (driver.recovering && plane < -Math.max(80, radius * 4)) driver.recovering = false;
  let targetLane = personality.lane * Math.min(14, aperture * 0.15);
  let trafficSpeed = Infinity;
  let escapeX = 0, escapeZ = 0;
  const velocity = entity.vel || { x: 0, z: 0 };
  const speed = Math.hypot(velocity.x, velocity.z);
  for (const other of nearby) {
    if (!other || other === entity || other.id === entity.id || other.alive === false || other.collides === false || !other.pos) continue;
    const dx = other.pos.x - entity.pos.x, dz = other.pos.z - entity.pos.z;
    const ahead = dx * from.nx + dz * from.nz;
    const lateral = dx * -from.nz + dz * from.nx;
    const clearance = radius + (Number(other.radius) || 18) + 14;
    if (ahead < -clearance || ahead > Math.max(130, speed * 1.5) || Math.abs(lateral) > clearance + 35) continue;
    const side = lateral === 0 ? personality.lane : -Math.sign(lateral);
    const laneLimit = Math.max(0, aperture - radius - 18);
    targetLane = side * Math.min(laneLimit, clearance + 8);
    const gap = Math.hypot(dx, dz);
    if (gap < clearance + 20 && gap > 0.01) {
      // A stopped leader must not also cancel the sideways room needed to pass.
      // Opposing hulls separate under finite strafe/reverse thrust, then rejoin.
      const escape = Math.min(42, (clearance + 20 - gap) * 1.5);
      escapeX -= dx / gap * escape; escapeZ -= dz / gap * escape;
    }
    if (Math.abs(lateral) < clearance && ahead > 0) {
      // Slow for the actual closing gap, then pass on a bounded aperture lane.
      const leaderSpeed = Math.max(0, (other.vel?.x || 0) * from.nx + (other.vel?.z || 0) * from.nz);
      trafficSpeed = Math.min(trafficSpeed, Math.max(12, leaderSpeed + Math.max(0, ahead - clearance) * 0.7));
    }
  }
  const laneStep = 42 * Math.max(0, dt);
  driver.laneWU += clamp(targetLane - driver.laneWU, -laneStep, laneStep);
  const approachOffset = driver.recovering ? -Math.max(125, radius * 5) : 30;
  const target = { x: gate.x + from.nx * approachOffset - from.nz * driver.laneWU,
    z: gate.z + from.nz * approachOffset + from.nx * driver.laneWU };
  const dx = target.x - entity.pos.x, dz = target.z - entity.pos.z;
  const distance = Math.hypot(dx, dz) || 1;
  const top = (Number(profile.combatSpeed || profile.maxSpeed) || 180)
    * RACING_DIFFICULTIES[driver.difficulty] * personality.pace;
  const brake = Math.min(Number(profile.reverseAccel || profile.maxBrakeAccel) || 60,
    Number(profile.strafeAccel || profile.maxAccel) || 60) * 0.58;
  const corner = racingCornerSpeed(gates, next, aperture, profile, personality);
  const approachSpeed = Math.sqrt(corner * corner + 2 * brake * Math.max(0, -plane - 35));
  const targetSpeed = Math.min(top, approachSpeed, driver.recovering ? 70 : Infinity,
    trafficSpeed, Math.max(30, distance * 1.6));
  let vx = dx / distance * targetSpeed + escapeX, vz = dz / distance * targetSpeed + escapeZ;
  const requestedSpeed = Math.hypot(vx, vz);
  if (requestedSpeed > top) { vx *= top / requestedSpeed; vz *= top / requestedSpeed; }
  const responseS = 0.65;
  const ax = (vx - velocity.x) / responseS, az = (vz - velocity.z) / responseS;
  const rot = Number(entity.rot) || 0, fx = Math.cos(rot), fz = Math.sin(rot);
  const forward = ax * fx + az * fz, lateral = ax * -fz + az * fx;
  const main = Number(profile.mainAccel || profile.maxAccel) || 100;
  const reverse = Number(profile.reverseAccel || profile.maxBrakeAccel) || 78;
  const strafe = Number(profile.strafeAccel || profile.maxAccel) || 68;
  const heading = Math.atan2(dz, dx);
  return { moveZ: clamp(forward / (forward >= 0 ? main : reverse), -1, 1),
    moveX: clamp(lateral / strafe, -1, 1),
    turnIntent: clamp(angle(heading - rot) * 1.8 - (Number(entity.angVel) || 0) * 0.35, -1, 1),
    brake: false, boost: false, fire: false, assistMode: 'newtonian' };
}
