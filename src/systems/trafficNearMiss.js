// inf-lane-horn — the traffic half of CH-12 "horns and near-misses".
//
// Before this, a player could rip past a hauler at three hundred units a second, close enough to
// read its hull plates, and the lane did nothing: no swerve, no horn, no word. The only close-call
// answer anywhere was SF-081's toast for a crew parked at a working bench.
//
// Now a fast close pass by the PLAYER is a stimulus every civilian on the lane answers:
//   * motion — the hull jinks off the player's line for a beat (ambient hulls through traffic's own
//     intent; job hulls through npcJobsRuntime's swerve lease, so each hull keeps one intent writer);
//   * sound and bark — `traffic:nearMiss` carries the class horn and the escalation step; the bark
//     director plays the horn at the hull and, on a repeat, speaks the crew's line;
//   * memory — repeats inside the memory window climb tap → double → held lean, and the third pass
//     inside a station's traffic shell brings dock control onto the band.
//
// Bounded: one O(1) predicted-pass test per traffic hull already in the owner loop (no all-pairs
// scan), one reaction per hull per pass, a sector-wide horn gap, and a capped transient memory
// that never enters the save. Deterministic: side choice and line index come from hash32.
// A slow drift, a parked player, a hull already fleeing violence, a disabled or towed hull and the
// law's own hulls never react. A pass is not a crime: nothing here touches heat, standing or hostility.
import { hash32 } from '../core/rng.js';
import { occupantGenerationOf } from '../core/entity.js';
import { bubblesFor } from '../data/stationBubbles.js';
import { laneHornClassForRole, laneHornCueFor, clampLaneHornStep } from '../data/laneHorns.js';
import { isShipDisabled, setIntent, isSurvivalCohort, stationIdentity } from './traffic.js';

export const NEAR_MISS_EVENT = 'traffic:nearMiss';

export const NEAR_MISS_TUNING = Object.freeze({
  minRelSpeedWu: 110,   // closing speed that reads as a buzz, not a careful pass
  minPlayerSpeedWu: 80, // the player must be the one moving — a parked pilot buzzes nobody
  marginWu: 42,         // clearance beyond both hulls that still reads as a close pass
  lookAheadS: 0.9,      // react to a pass about to happen...
  lookBackS: 0.25,      // ...or one that just did, so the owner's cadence cannot miss it
  maxRangeWu: 260,      // never consider a hull farther than this right now
  scrapeWu: 14,         // a first pass this close earns a word, not just the horn
  swerveS: 1.2,         // the jink lasts a beat, then the route takes the hull back
  swerveYawRad: 0.75,   // nose turned off the route toward the open side
  hullCooldownS: 3.5,   // one pass, one reaction
  memoryS: 45,          // repeats inside this window escalate
  sectorGapS: 0.35,     // horns across the sector never stack into a wall
  memoryCap: 48,
});

// A hull whose whole momentum is a timetable leans on the horn but does not jink off its lane.
const NO_SWERVE_ROLES = new Set(['express']);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function reachOf(entity) {
  return Math.max(0, finite(entity && entity.radius, 0));
}

function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * The player's predicted pass of a hull, or null when it is not a buzz. Pure: reads only the two
 * poses. `cx/cz` is the player's offset from the hull at the closest approach.
 */
export function predictPlayerPass(player, hull, tuning = NEAR_MISS_TUNING) {
  if (!player || !hull || !player.pos || !hull.pos) return null;
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);
  const playerSpeed = Math.hypot(pvx, pvz);
  if (!(playerSpeed >= tuning.minPlayerSpeedWu)) return null;
  const rx = finite(player.pos.x) - finite(hull.pos.x);
  const rz = finite(player.pos.z) - finite(hull.pos.z);
  const dist = Math.hypot(rx, rz);
  if (!(dist <= tuning.maxRangeWu)) return null;
  const vx = pvx - finite(hull.vel && hull.vel.x);
  const vz = pvz - finite(hull.vel && hull.vel.z);
  const rel2 = vx * vx + vz * vz;
  const relSpeed = Math.sqrt(rel2);
  if (!(relSpeed >= tuning.minRelSpeedWu)) return null;
  const tca = -(rx * vx + rz * vz) / rel2;
  if (!(tca >= -tuning.lookBackS && tca <= tuning.lookAheadS)) return null;
  const cx = rx + vx * tca;
  const cz = rz + vz * tca;
  const missWu = Math.hypot(cx, cz);
  const reach = reachOf(hull) + reachOf(player);
  if (!(missWu <= reach + tuning.marginWu)) return null;
  return { relSpeed, playerSpeed, tca, missWu, clearanceWu: missWu - reach, cx, cz, vx, vz, dist };
}

/**
 * The jink a hull takes away from a predicted pass: nose turned toward the open side by at most
 * `swerveYawRad`, full lateral kick away from the player's line. Dead-center passes pick a side
 * from the hull's identity, never from a random stream.
 */
export function swerveForPass(hull, pass, seed, tuning = NEAR_MISS_TUNING) {
  const heading = finite(hull && hull.rot, 0);
  let ex = -finite(pass && pass.cx);
  let ez = -finite(pass && pass.cz);
  let len = Math.hypot(ex, ez);
  if (!(len > 1e-3)) {
    // Head-on: break perpendicular to the closing line, side fixed by the hull's identity.
    const vx = finite(pass && pass.vx);
    const vz = finite(pass && pass.vz);
    const vlen = Math.hypot(vx, vz) || 1;
    const side = (hash32(seed == null ? 0 : seed, 'laneHornSide', String(hull && hull.id)) & 1) ? 1 : -1;
    ex = (-vz / vlen) * side;
    ez = (vx / vlen) * side;
    len = 1;
  }
  ex /= len;
  ez /= len;
  const escape = Math.atan2(ez, ex);
  const turn = Math.max(-tuning.swerveYawRad, Math.min(tuning.swerveYawRad, wrapAngle(escape - heading)));
  // Ship-local lateral axis: positive strafe runs along (-sin h, cos h).
  const lateral = ex * -Math.sin(heading) + ez * Math.cos(heading);
  return { aim: heading + turn, strafe: lateral >= 0 ? 1 : -1 };
}

function hullRole(e, rec) {
  return String((rec && rec.role)
    || (e && e.data && (e.data.trafficRole || e.data.jobKind || e.data.role))
    || '').toLowerCase();
}

/** True when this hull may answer a buzz at all. */
export function laneHornEligible(e, rec, state) {
  if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
  if (state && e.id === state.playerId) return false;
  const data = e.data || {};
  if (!laneHornClassForRole(hullRole(e, rec))) return false;
  if (data.ai && data.ai.pirate === true) return false;
  if (data.playerOwned || data.wingman || data.surrendered) return false;
  if (data.tethered || (e.flags && e.flags.tethered) || data.npcTowedByJobId != null) return false;
  // Already running from violence: that reaction owns the hull and its voice.
  if ((rec && rec.violenceAlarmed) || data.violenceAlarmed) return false;
  if (isSurvivalCohort(e)) return false;
  if (isShipDisabled(e, state)) return false;
  return true;
}

function nearestTrafficShell(stations, pos) {
  if (!Array.isArray(stations) || !pos) return null;
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    if (!station || station.alive === false || !station.pos) continue;
    const d = Math.hypot(finite(station.pos.x) - pos.x, finite(station.pos.z) - pos.z);
    const shell = bubblesFor(station).traffic.radius;
    if (d <= shell && d < bestD) { best = station; bestD = d; }
  }
  return best;
}

export const trafficNearMissOps = {
  _laneHornMemory() {
    if (!(this._nearMissMemory instanceof Map)) this._nearMissMemory = new Map();
    return this._nearMissMemory;
  },

  _laneHornMemoryFor(e, now) {
    const memory = this._laneHornMemory();
    const generation = occupantGenerationOf(e);
    let row = memory.get(e.id);
    // A recycled id or a rewound clock (Continue / New Game) is a stranger, not the same crew.
    if (row && (row.generation !== generation || !(now >= row.lastAt))) row = null;
    if (!row) {
      if (memory.size >= NEAR_MISS_TUNING.memoryCap) {
        for (const [id, old] of memory) {
          if (!(now >= old.lastAt) || now - old.lastAt > NEAR_MISS_TUNING.memoryS) memory.delete(id);
        }
        while (memory.size >= NEAR_MISS_TUNING.memoryCap) memory.delete(memory.keys().next().value);
      }
      row = { generation, count: 0, lastAt: -Infinity, swerveUntil: -Infinity, aim: 0, strafe: 0 };
      memory.set(e.id, row);
    }
    return row;
  },

  /**
   * One hull's answer to the player's pass. Returns true only while traffic itself is flying the
   * hull's jink this tick (ambient hulls); a job hull's jink is leased to npcJobsRuntime, so this
   * returns false for it and the job owner keeps writing its intent.
   */
  _reactPlayerNearMiss(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    const now = finite(state.simTime, 0);
    const memory = this._nearMissMemory instanceof Map ? this._nearMissMemory.get(e && e.id) : null;
    const jobId = e && e.data && e.data.jobId;
    const role = hullRole(e, rec);
    // An ambient hull keeps flying its jink until the beat ends, whatever the player does next.
    if (memory && !jobId && memory.generation === occupantGenerationOf(e)
        && now < memory.swerveUntil && now >= memory.lastAt && laneHornEligible(e, rec, state)) {
      setIntent(e, memory.strafe, 1, false, false, null, memory.aim);
      if (e.data && e.data.intent) e.data.intent.brake = false;
      return true;
    }
    if (!player || player.alive === false || !laneHornEligible(e, rec, state)) return false;
    const pass = predictPlayerPass(player, e);
    if (!pass) return false;
    const row = this._laneHornMemoryFor(e, now);
    if (now - row.lastAt < NEAR_MISS_TUNING.hullCooldownS) return false;
    // The sector gap holds a horn back without spending the hull's pass: the next tick retries.
    if (Number.isFinite(this._nearMissSectorAt) && now >= this._nearMissSectorAt
        && now - this._nearMissSectorAt < NEAR_MISS_TUNING.sectorGapS) return false;
    const fresh = now - row.lastAt > NEAR_MISS_TUNING.memoryS;
    row.count = fresh ? 1 : row.count + 1;
    row.lastAt = now;
    this._nearMissSectorAt = now;
    const step = clampLaneHornStep(row.count);
    const horn = laneHornCueFor(role, step);
    if (!horn) return false;
    const seed = state.meta && state.meta.seed;
    let swerved = false;
    if (!NO_SWERVE_ROLES.has(role)) {
      const jink = swerveForPass(e, pass, seed);
      const untilSimT = now + NEAR_MISS_TUNING.swerveS;
      if (jobId) {
        const jobs = this.helpers && this.helpers.npcJobs;
        swerved = !!(jobs && typeof jobs.swerve === 'function'
          && jobs.swerve(jobId, { aim: jink.aim, strafe: jink.strafe, untilSimT }));
      } else {
        row.aim = jink.aim;
        row.strafe = jink.strafe;
        row.swerveUntil = untilSimT;
        setIntent(e, jink.strafe, 1, false, false, null, jink.aim);
        if (e.data && e.data.intent) e.data.intent.brake = false;
        swerved = true;
      }
    }
    const shell = nearestTrafficShell(stations, e.pos);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(NEAR_MISS_EVENT, {
        entityId: e.id,
        role,
        hornClass: horn.hornClass,
        step,
        count: row.count,
        horn: { id: horn.id, rate: horn.rate, gain: horn.gain },
        scrape: pass.clearanceWu <= NEAR_MISS_TUNING.scrapeWu,
        missWu: Math.round(pass.missWu * 10) / 10,
        relSpeed: Math.round(pass.relSpeed),
        swerved,
        pos: { x: e.pos.x, z: e.pos.z },
        stationEntityId: shell ? shell.id : null,
        stationId: shell ? (stationIdentity(shell) || null) : null,
        sectorId: (state.world && state.world.currentSectorId) || null,
        lineIndex: hash32(seed == null ? 0 : seed, 'laneHornLine', String(e.id), row.count) >>> 0,
        t: now,
      });
    }
    return swerved && !jobId;
  },
};
