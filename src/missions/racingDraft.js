// Physical slipstreams belong to the current race pack. Ghosts and scenery never lead a wake.
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { witnessLineOfSight, segmentHitsProxy } from '../combat/lineOfSight.js';
import { queryAsteroidField } from '../world/asteroidField.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';

export const RACING_DRAFT = Object.freeze({ minSpeed: 70, length: 300, widthNear: 34,
  widthFar: 54, alignment: 0.94, buildS: 0.65, acceleration: 18, speedAdvantage: 28 });
const runtimes = new WeakMap();
const clamp = value => Math.max(0, Math.min(1, value));

function fieldBlocksWake(state, follower, leader, rt) {
  const a = follower.pos, b = leader.pos, dx = b.x - a.x, dz = b.z - a.z;
  const squared = dx * dx + dz * dz;
  rt.middle.x = (a.x + b.x) / 2; rt.middle.z = (a.z + b.z) / 2;
  queryAsteroidField(state, rt.middle, Math.sqrt(squared) / 2, rt.rocks);
  for (const rock of rt.rocks) {
    const fraction = clamp(((rock.pos.x - a.x) * dx + (rock.pos.z - a.z) * dz) / squared);
    const radius = asteroidColliderRadius(rock.data?.typeId, rock.radius);
    if (Math.hypot(rock.pos.x - a.x - dx * fraction, rock.pos.z - a.z - dz * fraction) < radius) return true;
  }
  // Compact physical dressing is intentionally outside state.entities.
  for (const row of state.world?.dressing?.rows || []) {
    if (row.collides && row.alive !== false && segmentHitsProxy(row, a, b)) return true;
  }
  return false;
}

/** Wake geometry and gain, shared with its wireframe presentation. No authority here. */
export function racingWake(follower, leader, out = {}) {
  if (!follower?.pos || !leader?.pos || follower === leader || follower.alive === false
      || leader.alive === false) return null;
  const speed = Math.hypot(leader.vel?.x || 0, leader.vel?.z || 0);
  const followingSpeed = Math.hypot(follower.vel?.x || 0, follower.vel?.z || 0);
  if (speed < RACING_DRAFT.minSpeed || followingSpeed < RACING_DRAFT.minSpeed) return null;
  const nx = leader.vel.x / speed, nz = leader.vel.z / speed;
  const dx = leader.pos.x - follower.pos.x, dz = leader.pos.z - follower.pos.z;
  const gap = dx * nx + dz * nz, side = Math.abs(dx * nz - dz * nx);
  const near = Math.max(35, (leader.radius || 16) + (follower.radius || 16) + 20);
  const far = near + RACING_DRAFT.length;
  const fraction = (gap - near) / RACING_DRAFT.length;
  const width = RACING_DRAFT.widthNear + clamp(fraction) * (RACING_DRAFT.widthFar - RACING_DRAFT.widthNear);
  const alignment = (follower.vel.x * nx + follower.vel.z * nz) / followingSpeed;
  const heading = Math.cos(follower.rot || 0) * nx + Math.sin(follower.rot || 0) * nz;
  const inside = gap > near && gap < far && side < width
    && alignment >= RACING_DRAFT.alignment && heading >= RACING_DRAFT.alignment;
  const edge = Math.min(clamp((gap - near) / 25), clamp((far - gap) / 45));
  const gain = inside ? edge * clamp(1 - side / width) * clamp((speed + RACING_DRAFT.speedAdvantage - followingSpeed) / 20) : 0;
  Object.assign(out, { nx, nz, near, far, widthNear: RACING_DRAFT.widthNear,
    widthFar: RACING_DRAFT.widthFar, gain });
  return out;
}

/** Called once per fixed tick by the mission's real pack owner, after gate/finish arbitration. */
export function stepRacingDraft(state, mission, entrants, dt) {
  const p = mission?.params;
  if (!p) return;
  let rt = runtimes.get(p);
  if (!rt) {
    rt = { time: -Infinity, recipients: new Map(), sample: {}, best: {}, ignored: [],
      wakes: [], wakePool: [], player: {}, middle: {}, rocks: [] };
    runtimes.set(p, rt);
  }
  const now = state.simTime;
  if (rt.time === now) return; // Never stack a duplicated observer call.
  rt.time = now;
  p.raceDraft = rt.player; p.raceDraftWakes = rt.wakes;
  rt.player.strength = 0; rt.player.leaderId = null; rt.wakes.length = 0;
  if (mission.status !== 'active' || !['race', 'cup'].includes(p.raceMode)
      || !Number.isFinite(p.raceStartSimS) || now < p.raceStartSimS || state.mode !== 'flight'
      || state.ui?.docked || state.world?.currentSectorId !== p.courseSectorId || !(dt > 0) || dt > 0.1) {
    rt.recipients.clear(); return;
  }
  const player = state.entities?.get(state.playerId);
  for (const entry of entrants) {
    const follower = entry.entity;
    if (entry.status !== 'racing' || !follower || follower.alive === false) continue;
    const isPlayer = follower === player;
    const input = state.input;
    const braking = isPlayer ? input?.actions?.brake || input?.brake || input?.fullStop || input?.flipBurn
      || (!input?.drawFlight?.active && (input?.moveZ ?? input?.throttle ?? 0) < -0.55)
      : follower.data?.intent?.brake || (follower.data?.intent?.moveZ ?? 0) < -0.1;
    let bestLeader = null, bestGain = 0;
    for (const candidate of entrants) {
      const leader = candidate.entity;
      if (candidate.status !== 'racing' || !leader || leader === follower) continue;
      const wake = racingWake(follower, leader, rt.sample);
      if (!wake) continue;
      if (isPlayer) {
        const cue = rt.wakePool[rt.wakes.length] ||= {};
        cue.leaderId = leader.id; cue.x = leader.pos.x; cue.z = leader.pos.z;
        cue.nx = wake.nx; cue.nz = wake.nz; cue.near = wake.near; cue.far = wake.far;
        cue.widthNear = wake.widthNear; cue.widthFar = wake.widthFar;
        rt.wakes.push(cue);
      }
      if (braking || wake.gain <= bestGain) continue;
      rt.ignored[0] = leader.id;
      if (!witnessLineOfSight(state, follower, leader.pos, rt.ignored) || fieldBlocksWake(state, follower, leader, rt)) continue;
      bestLeader = leader; bestGain = wake.gain; Object.assign(rt.best, wake);
    }
    let recipient = rt.recipients.get(follower.id);
    if (!recipient) { recipient = { leaderId: null, charge: 0 }; rt.recipients.set(follower.id, recipient); }
    if (!bestLeader) { recipient.leaderId = null; recipient.charge = 0; continue; }
    if (recipient.leaderId !== bestLeader.id) recipient.charge = 0;
    recipient.leaderId = bestLeader.id;
    recipient.charge = Math.min(1, recipient.charge + dt / RACING_DRAFT.buildS);
    const strength = bestGain * recipient.charge;
    // This is voluntary racing propulsion, not an environmental attack. Use the physics port
    // directly so the player's hostile-force attenuation cannot give NPCs a stronger draft.
    const mass = resolvePhysicsBodySpec(follower).mass;
    const impulse = mass * dt * RACING_DRAFT.acceleration * strength;
    const delivered = queuePhysicsImpulse(follower, { x: rt.best.nx * impulse, z: rt.best.nz * impulse },
      { source: 'racing-draft', leaderId: bestLeader.id });
    if (isPlayer && delivered) {
      Object.assign(rt.player, { leaderId: bestLeader.id, leaderName: bestLeader.data?.name || 'Rival', strength });
      p.raceDraftSeconds = (p.raceDraftSeconds || 0) + dt;
    }
  }
}
