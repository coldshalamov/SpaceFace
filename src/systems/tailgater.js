// PL-06 Tailgater — Cut off a loaded hauler and it follows you for twenty seconds with its horn down.
//
// A fast pass directly across the bow of a loaded hauler (hauler, ore carrier, tanker, freighter)
// cuts it off. The hauler answers physically:
// 1. It turns directly toward the player and pursues them for 20 seconds of sim time.
// 2. Throughout the pursuit, it holds its heavy horn down (sfx_hauler_blast_lean triggered periodically).
// 3. If the player outruns it (distance > outrunDistanceWu), or 20 seconds elapse, the pursuit ends.
// 4. If the hauler is attacked or led into danger, normal civilian violence reactions interrupt it.
// 5. Cooldown prevents immediate re-trigger on the same hauler.
//
// Deterministic: uses state.simTime only. No wall time or ambient randomness.
// Preserves single intent writer: mixed into traffic.js as tailgaterOps.

import { occupantGenerationOf } from '../core/entity.js';
import { requestTrafficReaction, releaseTrafficReaction } from './trafficReactionLease.js';

export const TAILGATER_START_EVENT = 'traffic:tailgaterStart';
export const TAILGATER_HORN_EVENT = 'traffic:tailgaterHorn';
export const TAILGATER_END_EVENT = 'traffic:tailgaterEnd';

export const TAILGATER_TUNING = Object.freeze({
  durationS: 20,              // follows you for twenty seconds
  hornIntervalS: 1.5,         // re-trigger the sustained horn blast every 1.5 s
  cooldownS: 60,              // cooldown before the same hauler can tailgate again
  outrunDistanceWu: 350,      // outrunning the hauler breaks pursuit early
  minPlayerSpeedWu: 80,       // player must be moving at speed to cut someone off
  minRelSpeedWu: 60,          // closing/crossing speed
  cutOffMaxAheadWu: 70,       // crossing within 70 wu ahead of hauler bow
  cutOffMinAheadWu: 8,        // clearance ahead (greater than hull radii sum)
  cutOffMaxLateralWu: 26,     // within the hauler's forward path corridor
  lookBackS: 0.35,            // trajectory lookback
  lookAheadS: 0.8,            // trajectory lookahead
  maxRangeWu: 160,            // max current distance to evaluate pass
  memoryCap: 64,              // bounded memory entries
});

export const LOADED_HAULER_ROLES = Object.freeze([
  'hauler',
  'ore_carrier',
  'tanker',
  'freighter',
  'arclight',
]);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * "Loaded" as the traffic/job owners record it: a cargo map of commodity quantities, a causal
 * manifest, a carrying flag, or the traffic record's manifest. An empty hauler is not cut off.
 */
export function isHaulerLoaded(entity, rec = null) {
  const data = entity && entity.data;
  if (!data) return false;
  if (data.loaded === true || data.carrying || (rec && rec.carrying)) return true;
  const manifest = data.cargoManifest || (rec && rec.manifest) || null;
  if (manifest && (Number(manifest.totalQty) > 0 || (Array.isArray(manifest.lines) && manifest.lines.length > 0))) return true;
  const cargo = data.cargo;
  if (typeof cargo === 'number') return cargo > 0;
  if (cargo && typeof cargo === 'object') {
    if (Number(cargo.amount) > 0 || Number(cargo.units) > 0) return true;
    if (Array.isArray(cargo.items) && cargo.items.length > 0) return true;
    for (const k in cargo) { if (Number(cargo[k]) > 0) return true; }
  }
  return Number(data.cargoUnits) > 0 || Number(data.cargoAmount) > 0;
}

function isEntityDisabled(entity) {
  if (!entity || entity.alive === false) return true;
  const data = entity.data || {};
  if (data.disabled || data.derelict || data.engineDead || data.deadInWater || data.surrendered) return true;
  if (entity.flags && (entity.flags.disabled || entity.flags.derelict)) return true;
  if (data.hp != null && data.maxHp && data.hp <= data.maxHp * 0.25) return true;
  if (entity.hull != null && entity.hullMax && entity.hull <= entity.hullMax * 0.25) return true;
  return false;
}

/**
 * Returns true if the entity is a valid civilian loaded hauler eligible to tailgate.
 */
export function isLoadedHauler(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship') return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.surrendered) return false;
  if (data.tethered || (entity.flags && entity.flags.tethered) || data.npcTowedByJobId != null) return false;
  if (data.ai && (data.ai.pirate === true || data.ai.lawful === true)) return false;
  if (data.runCohort === 'survival') return false;
  if (isEntityDisabled(entity)) return false;
  if (!isHaulerLoaded(entity, rec)) return false;

  const role = String(
    (rec && rec.role)
    || data.trafficRole
    || data.jobKind
    || data.role
    || (data.ai && (data.ai.role || data.ai.archetype))
    || ''
  ).toLowerCase();

  for (const haulerRole of LOADED_HAULER_ROLES) {
    if (role.includes(haulerRole)) return true;
  }
  return false;
}

/**
 * Predicts whether the player is cutting off the hauler directly across its bow.
 * Pure pose calculation. Returns pass geometry or null.
 */
export function predictPlayerCutOff(player, hauler, tuning = TAILGATER_TUNING) {
  if (!player || !hauler || !player.pos || !hauler.pos) return null;
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);
  const playerSpeed = Math.hypot(pvx, pvz);
  if (!(playerSpeed >= tuning.minPlayerSpeedWu)) return null;

  const rx = finite(player.pos.x) - finite(hauler.pos.x);
  const rz = finite(player.pos.z) - finite(hauler.pos.z);
  const dist = Math.hypot(rx, rz);
  if (!(dist <= tuning.maxRangeWu)) return null;

  const hvx = finite(hauler.vel && hauler.vel.x);
  const hvz = finite(hauler.vel && hauler.vel.z);
  const vx = pvx - hvx;
  const vz = pvz - hvz;
  const rel2 = vx * vx + vz * vz;
  const relSpeed = Math.sqrt(rel2);
  if (!(relSpeed >= tuning.minRelSpeedWu)) return null;

  // Closest approach time:
  const tca = -(rx * vx + rz * vz) / rel2;
  if (!(tca >= -tuning.lookBackS && tca <= tuning.lookAheadS)) return null;

  const cx = rx + vx * tca;
  const cz = rz + vz * tca;

  // Hauler forward/lateral frame based on rot:
  const hrot = finite(hauler.rot, 0);
  const fwdX = Math.cos(hrot);
  const fwdZ = Math.sin(hrot);
  const latX = -Math.sin(hrot);
  const latZ = Math.cos(hrot);

  // Offset at closest approach projected into hauler frame:
  const fwdAtCa = cx * fwdX + cz * fwdZ;
  const latAtCa = Math.abs(cx * latX + cz * latZ);

  const minAhead = Math.max(tuning.cutOffMinAheadWu, (finite(hauler.radius, 6) + finite(player.radius, 6)));
  if (!(fwdAtCa >= minAhead && fwdAtCa <= tuning.cutOffMaxAheadWu)) return null;
  if (!(latAtCa <= tuning.cutOffMaxLateralWu)) return null;

  return {
    tca,
    relSpeed,
    playerSpeed,
    fwdAtCa,
    latAtCa,
    cx,
    cz,
    dist,
  };
}

export function getOrCreateTailgaterRow(memory, entity, now = 0) {
  if (!memory || !entity) return null;
  const generation = occupantGenerationOf(entity);
  let row = memory.get(entity.id);
  if (row && (row.generation !== generation || !(now >= row.lastAt))) {
    row = null;
  }
  if (!row) {
    if (memory.size >= TAILGATER_TUNING.memoryCap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || (now >= old.cooldownUntil && !old.tailgating)) {
          memory.delete(id);
        }
      }
      while (memory.size >= TAILGATER_TUNING.memoryCap) {
        memory.delete(memory.keys().next().value);
      }
    }
    row = {
      generation,
      tailgating: false,
      startedAt: -Infinity,
      expiresAt: -Infinity,
      lastHornAt: -Infinity,
      cooldownUntil: -Infinity,
      lastAt: now,
    };
    memory.set(entity.id, row);
  }
  return row;
}

export const tailgaterOps = {
  _initTailgater(ctx = {}) {
    this._tailgaterMemory = new Map();
  },

  _getTailgaterMemory() {
    if (!(this._tailgaterMemory instanceof Map)) {
      this._tailgaterMemory = new Map();
    }
    return this._tailgaterMemory;
  },

  _tailgaterMemoryFor(e, now) {
    const memory = this._getTailgaterMemory();
    return getOrCreateTailgaterRow(memory, e, now);
  },

  /**
   * One hauler's tailgater check and step.
   * Returns true while this hauler is actively tailgating the player, claiming intent.
   */
  _reactTailgater(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!isLoadedHauler(e, rec, state)) return false;

    const now = finite(state.simTime, 0);
    const row = this._tailgaterMemoryFor(e, now);
    if (!row) return false;
    row.lastAt = now;

    // 1. If currently tailgating:
    if (row.tailgating) {
      // Check timeout:
      if (now >= row.expiresAt) {
        row.tailgating = false;
        row.cooldownUntil = now + TAILGATER_TUNING.cooldownS;
        if (e.data && e.data.civilianReaction === 'tailgating') delete e.data.civilianReaction;
        releaseTrafficReaction(this, e);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(TAILGATER_END_EVENT, {
            entityId: e.id,
            reason: 'timeout',
            t: now,
          });
        }
        return false;
      }

      // Check if player is gone or outrun:
      if (!player || player.alive === false || !player.pos) {
        row.tailgating = false;
        row.cooldownUntil = now + TAILGATER_TUNING.cooldownS;
        if (e.data && e.data.civilianReaction === 'tailgating') delete e.data.civilianReaction;
        releaseTrafficReaction(this, e);
        return false;
      }

      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);

      // Player outran the hauler:
      if (dist > TAILGATER_TUNING.outrunDistanceWu) {
        row.tailgating = false;
        row.cooldownUntil = now + TAILGATER_TUNING.cooldownS;
        if (e.data && e.data.civilianReaction === 'tailgating') delete e.data.civilianReaction;
        releaseTrafficReaction(this, e);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(TAILGATER_END_EVENT, {
            entityId: e.id,
            reason: 'outrun',
            dist: Math.round(dist * 10) / 10,
            t: now,
          });
        }
        return false;
      }

      // Steer directly toward player and drive forward:
      const aim = Math.atan2(dz, dx);
      const owned = requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
      }, row.expiresAt - now);
      if (!owned) {
        // The job owner will not lease this hull: the chase ends, the job keeps its intent.
        row.tailgating = false;
        row.cooldownUntil = now + TAILGATER_TUNING.cooldownS;
        if (e.data && e.data.civilianReaction === 'tailgating') delete e.data.civilianReaction;
        releaseTrafficReaction(this, e);
        return false;
      }

      // Sound horn continuously / periodically throughout the 20 seconds:
      if (now - row.lastHornAt >= TAILGATER_TUNING.hornIntervalS) {
        row.lastHornAt = now;
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('audio:cue', {
            id: 'sfx_hauler_blast_lean',
            position: { x: e.pos.x, z: e.pos.z },
            gain: 0.95,
            rate: 1,
          });
          this.bus.emit(TAILGATER_HORN_EVENT, {
            entityId: e.id,
            durationRemaining: Math.round((row.expiresAt - now) * 10) / 10,
            t: now,
          });
        }
      }
      return true;
    }

    // 2. Not currently tailgating: check trigger:
    if (!player || player.alive === false || !player.pos) return false;
    if (now < row.cooldownUntil) return false;

    const cutOff = predictPlayerCutOff(player, e, TAILGATER_TUNING);
    if (!cutOff) return false;

    const dx = player.pos.x - e.pos.x;
    const dz = player.pos.z - e.pos.z;
    const aim = Math.atan2(dz, dx);
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, TAILGATER_TUNING.durationS);
    // A job hull whose owner will not lease does not chase.
    if (!owned) return false;

    // Trigger engaged!
    row.tailgating = true;
    row.startedAt = now;
    row.expiresAt = now + TAILGATER_TUNING.durationS;
    row.lastHornAt = now;
    if (e.data) e.data.civilianReaction = 'tailgating';

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('audio:cue', {
        id: 'sfx_hauler_blast_lean',
        position: { x: e.pos.x, z: e.pos.z },
        gain: 0.95,
        rate: 1,
      });
      this.bus.emit(TAILGATER_START_EVENT, {
        entityId: e.id,
        role: (rec && rec.role) || e.data?.trafficRole || 'hauler',
        playerSpeed: Math.round(cutOff.playerSpeed),
        relSpeed: Math.round(cutOff.relSpeed),
        fwdAtCa: Math.round(cutOff.fwdAtCa * 10) / 10,
        latAtCa: Math.round(cutOff.latAtCa * 10) / 10,
        durationS: TAILGATER_TUNING.durationS,
        t: now,
      });
    }
    return true;
  },
};
