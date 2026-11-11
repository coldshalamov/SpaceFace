// PL-01 Near miss plant — Pass a civilian within a ship-length at speed:
// they swerve, flash their lamps and say "Lane's not yours, pal!".
// Do it again; the third time they report you.
//
// Invariants:
// - Deterministic: uses state.simTime only; no Math.random() or Date.now().
// - Preserves single intent writer: mixed into traffic.js as nearMissPlantOps.
// - Physical: civilian jinks/swerves off the player's approach vector.
// - Lamps flash: sets lampFlashUntil on entity data and emits traffic:nearMissFlash.
// - Exact authored dialogue: "Lane's not yours, pal!"
// - Escalation: repeat passes inside the memory window (45 s) count up; the 3rd pass reports you.
//
// Clean separation:
// - Near miss plant evaluates passes within a ship length (clearance <= 24 wu) at speed.
// - General horn ladder (trafficNearMiss) handles wider passes (up to 42 wu).

import { hash32 } from '../core/rng.js';
import { occupantGenerationOf } from '../core/entity.js';
import { isShipDisabled, setIntent, isSurvivalCohort, stationIdentity } from './traffic.js';

export const NEAR_MISS_PLANT_EVENT = 'traffic:nearMissPlant';
export const NEAR_MISS_FLASH_EVENT = 'traffic:nearMissFlash';
export const NEAR_MISS_REPORT_EVENT = 'traffic:nearMissReported';

export const NEAR_MISS_PLANT_TUNING = Object.freeze({
  minPlayerSpeedWu: 80,   // player must be moving at speed
  minRelSpeedWu: 110,     // closing / crossing speed
  shipLengthWu: 24,       // clearance within one ship-length (~24 wu)
  lookAheadS: 0.9,        // approach trajectory lookahead
  lookBackS: 0.25,        // approach trajectory lookback
  maxRangeWu: 260,        // maximum evaluation range
  swerveS: 1.2,           // swerve duration
  swerveYawRad: 0.75,     // swerve nose turn angle clamp
  flashDurationS: 2.0,    // how long the lamps flash
  hullCooldownS: 3.5,     // cooldown between passes on the same hull
  memoryS: 45,            // memory window for repeat passes to escalate
  reportThreshold: 3,     // the third pass triggers the report
  memoryCap: 64,          // bounded memory cap
});

export const NEAR_MISS_PLANT_BARK = "Lane's not yours, pal!";
export const NEAR_MISS_REPORT_BARK = 'Reporting reckless pilot to Control!';
export const NEAR_MISS_CONTROL_LOG = 'CONTROL: reckless flight report logged.';

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
 * Returns true if the entity is an eligible civilian ship that can react to a near miss.
 */
export function isNearMissPlantEligible(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;

  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.surrendered) return false;
  if (data.tethered || (entity.flags && entity.flags.tethered) || data.npcTowedByJobId != null) return false;

  const ai = data.ai || {};
  if (ai.pirate === true || ai.lawful === true || ai.hostile === true) return false;
  if (entity.team === 1 || data.isHostile === true) return false;

  const role = String(
    (rec && rec.role)
    || data.trafficRole
    || data.jobKind
    || data.role
    || ai.role
    || ai.archetype
    || ''
  ).toLowerCase();

  if (role.includes('patrol') || role.includes('police') || role.includes('security') || role.includes('customs')) {
    return false;
  }

  if (isSurvivalCohort(entity)) return false;
  if (isShipDisabled(entity, state)) return false;

  return true;
}

/**
 * Pure trajectory prediction: evaluates whether the player passes a civilian within a ship length at speed.
 * Returns pass geometry or null.
 */
export function predictNearMissPlantPass(player, hull, tuning = NEAR_MISS_PLANT_TUNING) {
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
  const clearanceWu = missWu - reach;

  // Must pass within a ship-length
  if (!(clearanceWu <= tuning.shipLengthWu)) return null;

  return { relSpeed, playerSpeed, tca, missWu, clearanceWu, cx, cz, vx, vz, dist };
}

/**
 * Calculates evasive jink intent away from the approaching player pass line.
 */
export function swerveForNearMissPlant(hull, pass, seed, tuning = NEAR_MISS_PLANT_TUNING) {
  const heading = finite(hull && hull.rot, 0);
  let ex = -finite(pass && pass.cx);
  let ez = -finite(pass && pass.cz);
  let len = Math.hypot(ex, ez);
  if (!(len > 1e-3)) {
    const vx = finite(pass && pass.vx);
    const vz = finite(pass && pass.vz);
    const vlen = Math.hypot(vx, vz) || 1;
    const side = (hash32(seed == null ? 0 : seed, 'nearMissSide', String(hull && hull.id)) & 1) ? 1 : -1;
    ex = (-vz / vlen) * side;
    ez = (vx / vlen) * side;
    len = 1;
  }
  ex /= len;
  ez /= len;
  const escape = Math.atan2(ez, ex);
  const turn = Math.max(-tuning.swerveYawRad, Math.min(tuning.swerveYawRad, wrapAngle(escape - heading)));
  const lateral = ex * -Math.sin(heading) + ez * Math.cos(heading);
  return { aim: heading + turn, strafe: lateral >= 0 ? 1 : -1 };
}

export const nearMissPlantOps = {
  _initNearMissPlant(ctx = {}) {
    this._nearMissPlantMemory = new Map();
  },

  _getNearMissPlantMemory() {
    if (!(this._nearMissPlantMemory instanceof Map)) {
      this._nearMissPlantMemory = new Map();
    }
    return this._nearMissPlantMemory;
  },

  _nearMissPlantMemoryFor(e, now) {
    const memory = this._getNearMissPlantMemory();
    const generation = occupantGenerationOf(e);
    let row = memory.get(e.id);
    if (row && (row.generation !== generation || !(now >= row.lastAt))) {
      row = null;
    }
    if (!row) {
      if (memory.size >= NEAR_MISS_PLANT_TUNING.memoryCap) {
        for (const [id, old] of memory) {
          if (!(now >= old.lastAt) || now - old.lastAt > NEAR_MISS_PLANT_TUNING.memoryS) {
            memory.delete(id);
          }
        }
        while (memory.size >= NEAR_MISS_PLANT_TUNING.memoryCap) {
          memory.delete(memory.keys().next().value);
        }
      }
      row = {
        generation,
        count: 0,
        lastAt: -Infinity,
        swerveUntil: -Infinity,
        lampFlashUntil: -Infinity,
        aim: 0,
        strafe: 0,
      };
      memory.set(e.id, row);
    }
    return row;
  },

  /**
   * Main per-tick reaction hook for PL-01.
   * Returns true while traffic is actively flying the swerve intent for an ambient hull.
   */
  _reactNearMissPlant(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;

    const now = finite(state.simTime, 0);
    const memory = this._nearMissPlantMemory instanceof Map ? this._nearMissPlantMemory.get(e && e.id) : null;
    const jobId = e && e.data && e.data.jobId;

    // Clean up lamp flashing flag if duration expired
    if (e && e.data && e.data.lampsFlashing && now >= (e.data.lampFlashUntil || 0)) {
      e.data.lampsFlashing = false;
    }

    // If already actively swerving, continue flying the jink beat
    if (memory && !jobId && memory.generation === occupantGenerationOf(e)
        && now < memory.swerveUntil && now >= memory.lastAt && isNearMissPlantEligible(e, rec, state)) {
      setIntent(e, memory.strafe, 1, false, false, null, memory.aim);
      if (e.data && e.data.intent) e.data.intent.brake = false;
      return true;
    }

    if (!player || player.alive === false || !isNearMissPlantEligible(e, rec, state)) {
      return false;
    }

    const pass = predictNearMissPlantPass(player, e);
    if (!pass) return false;

    const row = this._nearMissPlantMemoryFor(e, now);
    if (now - row.lastAt < NEAR_MISS_PLANT_TUNING.hullCooldownS) {
      return false;
    }

    // Memory window: reset count if past memory window
    const fresh = now - row.lastAt > NEAR_MISS_PLANT_TUNING.memoryS;
    row.count = fresh ? 1 : row.count + 1;
    row.lastAt = now;

    // 1. Swerve
    const seed = state.meta && state.meta.seed;
    const jink = swerveForNearMissPlant(e, pass, seed);
    const swerveUntil = now + NEAR_MISS_PLANT_TUNING.swerveS;

    if (jobId) {
      const jobs = this.helpers && this.helpers.npcJobs;
      if (jobs && typeof jobs.swerve === 'function') {
        jobs.swerve(jobId, { aim: jink.aim, strafe: jink.strafe, untilSimT: swerveUntil });
      }
    } else {
      row.aim = jink.aim;
      row.strafe = jink.strafe;
      row.swerveUntil = swerveUntil;
      setIntent(e, jink.strafe, 1, false, false, null, jink.aim);
      if (e.data && e.data.intent) e.data.intent.brake = false;
    }

    // 2. Flash their lamps
    const flashUntil = now + NEAR_MISS_PLANT_TUNING.flashDurationS;
    row.lampFlashUntil = flashUntil;
    if (!e.data) e.data = {};
    e.data.lampsFlashing = true;
    e.data.lampFlashUntil = flashUntil;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(NEAR_MISS_FLASH_EVENT, {
        entityId: e.id,
        pos: { x: e.pos.x, z: e.pos.z },
        duration: NEAR_MISS_PLANT_TUNING.flashDurationS,
        until: flashUntil,
        t: now,
      });
    }

    // 3. Dialogue & Reporting
    const isReport = row.count >= NEAR_MISS_PLANT_TUNING.reportThreshold;
    const barkText = isReport ? NEAR_MISS_REPORT_BARK : NEAR_MISS_PLANT_BARK;

    // Spoken bark / caption
    if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({
        channel: 'bark',
        text: barkText,
        kind: 'traffic',
        ttl: 4,
        id: `nearMissPlant:${e.id}:${row.count}`,
      });
    }

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(NEAR_MISS_PLANT_EVENT, {
        entityId: e.id,
        count: row.count,
        barkText,
        reported: isReport,
        pos: { x: e.pos.x, z: e.pos.z },
        missWu: Math.round(pass.missWu * 10) / 10,
        clearanceWu: Math.round(pass.clearanceWu * 10) / 10,
        relSpeed: Math.round(pass.relSpeed),
        t: now,
      });

      this.bus.emit('bark:triggered', {
        entityId: e.id,
        situation: isReport ? 'near-miss-report' : 'near-miss-pal',
        text: barkText,
        reason: 'plant:PL-01',
        t: now,
      });

      // 4. On third pass: report you to Control / Patrol
      if (isReport) {
        this.bus.emit(NEAR_MISS_REPORT_EVENT, {
          reportingEntityId: e.id,
          targetEntityId: player.id,
          count: row.count,
          role: e.data?.trafficRole || e.data?.role || 'civilian',
          sectorId: state.world?.currentSectorId || null,
          t: now,
        });

        this.bus.emit('law:distressRaised', {
          cause: 'reckless_flying',
          victimId: e.id,
          attackerId: player.id,
          sectorId: state.world?.currentSectorId || null,
          t: now,
        });

        // Control logs and acknowledges the reckless report
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'bark',
            text: NEAR_MISS_CONTROL_LOG,
            kind: 'traffic',
            ttl: 4,
            id: `controlRecklessLog:${e.id}:${Math.floor(now)}`,
          });
        }

        this.bus.emit('bark:triggered', {
          entityId: 'control',
          situation: 'reckless-flight-logged',
          text: NEAR_MISS_CONTROL_LOG,
          reason: 'plant:PL-01',
          t: now,
        });
      }
    }

    return !jobId;
  },
};
