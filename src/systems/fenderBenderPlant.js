// PL-02 Fender bender plant — Bump a parked ship: an alarm lamp strobes
// and the owner undocks to look at the dent.
// What the player can do: Stay and get shouted at, or leave and be described to the dock.
//
// Invariants:
// - Deterministic: uses state.simTime only; no Math.random() or Date.now().
// - Preserves single intent writer: mixed into traffic.js as fenderBenderPlantOps
//   and leases motion via trafficReactionLease (requestTrafficReaction / releaseTrafficReaction).
// - Physical: parked/docked civilian ship undocks on bump and maneuvers to inspect the dent.
// - Alarm lamp strobes: sets lampsFlashing and lampFlashUntil on entity data and emits
//   traffic:fenderBenderAlarm.
// - Voice / dialogue bounds: 8 words or fewer per plant rule (§0.0):
//   Stay: "Look what you did to my paint!" (7 words)
//   Leave: "Dock control, hit-and-run pilot fled the berth." (8 words)
// - Clean resolution:
//   If the player stays close (<= stayDistanceWu) for shoutDelayS, owner shouts.
//   If the player flees (> leaveDistanceWu), owner describes the hit-and-run to the dock.

import { occupantGenerationOf } from '../core/entity.js';
import { requestTrafficReaction, releaseTrafficReaction } from './trafficReactionLease.js';
import { isShipDisabled, setIntent } from './traffic.js';

export const FENDER_BENDER_PLANT_EVENT = 'plants:fenderBender';
export const FENDER_BENDER_ALARM_EVENT = 'traffic:fenderBenderAlarm';
export const FENDER_BENDER_UNDOCKED_EVENT = 'traffic:fenderBenderUndocked';
export const FENDER_BENDER_SHOUT_EVENT = 'traffic:fenderBenderShout';
export const FENDER_BENDER_REPORT_EVENT = 'traffic:fenderBenderReport';
export const FENDER_BENDER_RESOLVED_EVENT = 'plants:fenderBenderResolved';

export const FENDER_BENDER_TUNING = Object.freeze({
  maxParkedSpeedWu: 4,        // ship moving at or below 4 wu/s qualifies as parked/moored
  flashDurationS: 2.0,        // alarm lamp strobe duration (s)
  inspectDurationS: 5.0,      // owner undocks and looks at dent (s)
  shoutDelayS: 1.5,           // minimum seconds staying before owner shouts (s)
  stayDistanceWu: 70,         // player staying within this radius is "staying" (wu)
  leaveDistanceWu: 95,        // player beyond this radius is considered to have "left" (wu)
  cooldownS: 60,              // per-ship cooldown before another fender bender can trigger (s)
  memoryCap: 64,              // bounded memory cap
});

export const FENDER_BENDER_SHOUT_BARK = 'Look what you did to my paint!';
export const FENDER_BENDER_DOCK_REPORT = 'Dock control, hit-and-run pilot fled the berth.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Returns true if the entity is an eligible parked civilian ship that can experience a fender bender.
 */
export function isFenderBenderPlantEligible(entity, state = null, tuning = FENDER_BENDER_TUNING) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;

  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.surrendered) return false;
  if (data.tethered || (entity.flags && entity.flags.tethered)) return false;

  const ai = data.ai || {};
  if (ai.pirate === true || ai.lawful === true || ai.hostile === true) return false;
  if (entity.team === 1 || data.isHostile === true) return false;

  const role = String(
    data.trafficRole
    || data.jobKind
    || data.role
    || ai.role
    || ai.archetype
    || ''
  ).toLowerCase();

  if (role.includes('patrol') || role.includes('police') || role.includes('security') || role.includes('customs')) {
    return false;
  }

  if (isShipDisabled(entity, state)) return false;

  // Parked or docked condition:
  const speed = Math.hypot(finite(entity.vel && entity.vel.x), finite(entity.vel && entity.vel.z));
  const isParked = (
    data.parked === true
    || data.docked === true
    || (entity.flags && entity.flags.docked === true)
    || data.moored === true
    || speed <= tuning.maxParkedSpeedWu
  );

  return isParked;
}

/**
 * Evaluates a physics:impact payload to determine if a fender bender reaction should occur.
 * Returns the civilian entity and dent position if triggered, or null.
 */
export function evaluateFenderBenderImpact(state, payload, tuning = FENDER_BENDER_TUNING) {
  if (!state || !payload) return null;
  const playerId = state.playerId;
  if (!playerId) return null;

  const aId = payload.aId;
  const bId = payload.bId;
  const playerInvolved = payload.playerInvolved === true || aId === playerId || bId === playerId;
  if (!playerInvolved) return null;

  const civId = (aId === playerId ? bId : aId);
  if (civId == null || civId === playerId) return null;

  const civ = state.entities?.get ? state.entities.get(civId) : null;
  if (!civ || !isFenderBenderPlantEligible(civ, state, tuning)) return null;

  // Check that the impact had real physical impulse/closing velocity
  const impulse = finite(payload.impulse, finite(payload.dp, finite(payload.preSolveClosingSpeed, 0)));
  const normalImpulse = finite(payload.normalImpulse, 0);
  if (impulse <= 0 && normalImpulse <= 0) return null;

  const dentPos = payload.pos
    ? { x: finite(payload.pos.x, civ.pos.x), z: finite(payload.pos.z, civ.pos.z) }
    : { x: civ.pos.x, z: civ.pos.z };

  return { civ, dentPos };
}

/**
 * Mixin operations for traffic.js.
 */
export const fenderBenderPlantOps = {
  _initFenderBenderPlant(ctx = {}) {
    this._fenderBenderPlantMemory = new Map();
    if (ctx && ctx.bus && typeof ctx.bus.on === 'function') {
      ctx.bus.on('physics:impact', (p) => this._onFenderBenderImpact(p || {}));
    }
  },

  _getFenderBenderPlantMemory() {
    if (!(this._fenderBenderPlantMemory instanceof Map)) {
      this._fenderBenderPlantMemory = new Map();
    }
    return this._fenderBenderPlantMemory;
  },

  _fenderBenderPlantMemoryFor(e, now) {
    const memory = this._getFenderBenderPlantMemory();
    const generation = occupantGenerationOf(e);
    let row = memory.get(e.id);
    if (row && (row.generation !== generation || !(now >= row.lastAt))) {
      row = null;
    }
    if (!row) {
      if (memory.size >= FENDER_BENDER_TUNING.memoryCap) {
        for (const [id, old] of memory) {
          if (!(now >= old.lastAt) || (now - old.lastAt > FENDER_BENDER_TUNING.cooldownS && !old.reactionState)) {
            memory.delete(id);
          }
        }
        while (memory.size >= FENDER_BENDER_TUNING.memoryCap) {
          memory.delete(memory.keys().next().value);
        }
      }
      row = {
        generation,
        lastAt: -Infinity,
        cooldownUntil: -Infinity,
        reactionState: null, // null | 'inspecting' | 'resolved'
        resolution: null,    // null | 'stay' | 'leave'
        bumpTime: -Infinity,
        inspectUntil: -Infinity,
        lampFlashUntil: -Infinity,
        dentPos: null,
        wasDocked: false,
      };
      memory.set(e.id, row);
    }
    return row;
  },

  _onFenderBenderImpact(payload) {
    const state = this.state;
    if (!state) return;

    const evaluation = evaluateFenderBenderImpact(state, payload);
    if (!evaluation) return;

    const { civ, dentPos } = evaluation;
    const now = finite(state.simTime, 0);
    const row = this._fenderBenderPlantMemoryFor(civ, now);

    // Cooldown check or already reacting
    if (now < row.cooldownUntil || row.reactionState) return;

    // Trigger Fender Bender reaction
    row.lastAt = now;
    row.bumpTime = now;
    row.reactionState = 'inspecting';
    row.inspectUntil = now + FENDER_BENDER_TUNING.inspectDurationS;
    row.dentPos = dentPos;

    // 1. Alarm lamp strobes
    const flashUntil = now + FENDER_BENDER_TUNING.flashDurationS;
    row.lampFlashUntil = flashUntil;
    if (!civ.data) civ.data = {};
    civ.data.lampsFlashing = true;
    civ.data.lampFlashUntil = flashUntil;
    civ.data.alarmStrobe = true;

    // 2. Owner undocks to look at the dent
    const wasDocked = !!(civ.flags?.docked || civ.data?.docked);
    row.wasDocked = wasDocked;
    if (civ.flags) civ.flags.docked = false;
    civ.data.docked = false;
    civ.data.parked = false;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(FENDER_BENDER_PLANT_EVENT, {
        entityId: civ.id,
        playerId: state.playerId,
        pos: { x: civ.pos.x, z: civ.pos.z },
        dentPos: { x: dentPos.x, z: dentPos.z },
        wasDocked,
        t: now,
      });

      this.bus.emit(FENDER_BENDER_ALARM_EVENT, {
        entityId: civ.id,
        pos: { x: civ.pos.x, z: civ.pos.z },
        duration: FENDER_BENDER_TUNING.flashDurationS,
        until: flashUntil,
        t: now,
      });

      if (wasDocked) {
        // Not dock:undocked: ~20 owners (save, economy, cargo, audio) read that as the PLAYER undocking.
        this.bus.emit(FENDER_BENDER_UNDOCKED_EVENT, {
          entityId: civ.id,
          stationId: civ.data?.dockedStationId || null,
          dentPos: { x: dentPos.x, z: dentPos.z },
          t: now,
        });
      }
    }
  },

  _resolveFenderBenderPlant(row, e, rec, state, player, resolution, now) {
    row.reactionState = 'resolved';
    row.resolution = resolution;
    row.cooldownUntil = now + FENDER_BENDER_TUNING.cooldownS;

    const playerId = state?.playerId;

    if (resolution === 'stay') {
      // Stay and get shouted at
      if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
        this.helpers.voice.say({
          channel: 'bark',
          text: FENDER_BENDER_SHOUT_BARK,
          kind: 'traffic',
          ttl: 4,
          id: `fenderBender:${e.id}:${now}`,
        });
      }

      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('bark:triggered', {
          entityId: e.id,
          text: FENDER_BENDER_SHOUT_BARK,
          situation: 'fender-bender-shout',
          reason: 'plant:PL-02',
          t: now,
        });

        this.bus.emit(FENDER_BENDER_SHOUT_EVENT, {
          entityId: e.id,
          targetEntityId: playerId,
          text: FENDER_BENDER_SHOUT_BARK,
          resolution: 'stay',
          t: now,
        });

        this.bus.emit(FENDER_BENDER_RESOLVED_EVENT, {
          entityId: e.id,
          playerId,
          resolution: 'stay',
          text: FENDER_BENDER_SHOUT_BARK,
          t: now,
        });
      }
    } else {
      // Leave and be described to the dock
      if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
        this.helpers.voice.say({
          channel: 'radio',
          text: FENDER_BENDER_DOCK_REPORT,
          kind: 'traffic',
          ttl: 5,
          id: `fenderBenderReport:${e.id}:${now}`,
        });
      }

      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('comms:log', {
          from: e.data?.name || 'Berth Traffic',
          text: FENDER_BENDER_DOCK_REPORT,
          kind: 'traffic',
        });

        this.bus.emit(FENDER_BENDER_REPORT_EVENT, {
          reportingEntityId: e.id,
          targetEntityId: playerId,
          text: FENDER_BENDER_DOCK_REPORT,
          resolution: 'leave',
          t: now,
        });

        this.bus.emit(FENDER_BENDER_RESOLVED_EVENT, {
          entityId: e.id,
          playerId,
          resolution: 'leave',
          text: FENDER_BENDER_DOCK_REPORT,
          t: now,
        });
      }
    }

    this._endFenderBenderPlant(row, e, rec);
  },

  _endFenderBenderPlant(row, e, rec) {
    row.reactionState = null;
    if (rec) rec.civilianReaction = null;
    if (e.data) {
      e.data.civilianReaction = null;
      e.data.alarmStrobe = false;
    }
    releaseTrafficReaction(this, e);
  },

  /**
   * Main per-tick reaction hook for PL-02.
   * Returns true while traffic is actively handling the fender bender inspection/resolution.
   */
  _reactFenderBenderPlant(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;

    const now = finite(state.simTime, 0);
    const memory = this._fenderBenderPlantMemory instanceof Map ? this._fenderBenderPlantMemory.get(e && e.id) : null;
    if (!memory || !memory.reactionState) return false;

    // Clean up lamp flashing flag if duration expired
    if (e && e.data && e.data.lampsFlashing && now >= (e.data.lampFlashUntil || 0)) {
      e.data.lampsFlashing = false;
    }

    if (e.alive === false) {
      this._endFenderBenderPlant(memory, e, rec);
      return false;
    }

    if (memory.reactionState === 'inspecting') {
      // Maneuver to inspect the dent: face the dent/contact point at low speed
      const targetPos = memory.dentPos || (player && player.pos) || e.pos;
      const toX = finite(targetPos.x) - finite(e.pos.x);
      const toZ = finite(targetPos.z) - finite(e.pos.z);
      const aim = Math.atan2(toZ, toX);

      const leased = requestTrafficReaction(
        this,
        e,
        { moveX: 0, moveZ: 0.1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false },
        memory.inspectUntil - now,
      );

      if (leased) {
        if (rec) rec.civilianReaction = 'fender_bender_inspect';
        if (e.data) e.data.civilianReaction = 'fender_bender_inspect';
      }

      // Check player distance to decide between Stay and Leave
      if (!player || player.alive === false) {
        this._resolveFenderBenderPlant(memory, e, rec, state, null, 'leave', now);
        return true;
      }

      const dist = Math.hypot(finite(player.pos.x) - finite(e.pos.x), finite(player.pos.z) - finite(e.pos.z));

      // Leave branch: player moved away beyond leaveDistanceWu
      if (dist >= FENDER_BENDER_TUNING.leaveDistanceWu) {
        this._resolveFenderBenderPlant(memory, e, rec, state, player, 'leave', now);
        return true;
      }

      // Stay branch: player stayed close (<= stayDistanceWu) for shoutDelayS
      if (now >= memory.bumpTime + FENDER_BENDER_TUNING.shoutDelayS) {
        if (dist <= FENDER_BENDER_TUNING.stayDistanceWu) {
          this._resolveFenderBenderPlant(memory, e, rec, state, player, 'stay', now);
          return true;
        }
      }

      // Inspection timer expired: resolve based on current distance
      if (now >= memory.inspectUntil) {
        const resolution = dist <= FENDER_BENDER_TUNING.stayDistanceWu ? 'stay' : 'leave';
        this._resolveFenderBenderPlant(memory, e, rec, state, player, resolution, now);
        return true;
      }

      return true;
    }

    return false;
  },
};

/** Standalone system implementation for testing or modular lifecycle registration. */
export const fenderBenderPlant = {
  id: 'fenderBenderPlant',
  name: 'fenderBenderPlant',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._fenderBenderPlantMemory = new Map();
    this._initFenderBenderPlant(ctx);
  },

  ...fenderBenderPlantOps,

  update(dt, state) {
    if (!state || state.mode !== 'flight') return;
    const player = state.playerId ? state.entities?.get?.(state.playerId) : null;
    for (const [id, row] of this._fenderBenderPlantMemory) {
      if (!row || !row.reactionState) continue;
      const entity = state.entities?.get?.(id);
      if (!entity || entity.alive === false) {
        row.reactionState = null;
        continue;
      }
      this._reactFenderBenderPlant(entity, null, null, state, player);
    }
  },
};
