// PL-102 Mistaken — Park dead-still in a lane, lamps off, and a patrol mistakes you for a wreck.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Park dead-still in a lane for a minute, lamps off. A patrol sweeps you with
//   its lamp and taps your hull twice. Play dead through it and the recovery tug clamps on and
//   tows you in as a wreck
//   What the player can do: Wave a lamp and be on your way; or ride the tow in and explain
//   yourself at the dock
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via MISTAKEN_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; abort when refused.
//   (The patrol only sweeps and taps; the tug spawns as its own hull.)
// - Cooldowns per patrol key. All session state lives on `this`, never module-level.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_MISTAKEN_SWEEP_EVENT = 'plants:mistakenSweep';
export const PLANTS_MISTAKEN_WAVE_OFF_EVENT = 'plants:mistakenWaveOff';
export const PLANTS_MISTAKEN_TOW_EVENT = 'plants:mistakenTow';

export const MISTAKEN_TUNING = Object.freeze({
  stillSpeedWu: 6,            // player is "dead-still" below this speed
  stillForS: 60,              // park dead-still for a minute
  sweepRangeWu: 260,          // patrol must be within this of the player to sweep
  tapGapS: 1.2,               // the two hull taps are this far apart
  graceAfterTapsS: 8,         // play dead through the taps for this long and the tug comes
  waveOffLampsS: 1.2,         // patrol lamp sweep duration
  waveOffS: 6,                // waving a lamp clears the mistake for this long afterwards
  towCooldownS: 90,           // after a tow, the same patrol will not re-sweep for this long
  towTugAheadWu: 26,          // the recovery tug clamps on this close
  tugRadius: 7,
  tugHull: 60,
  memoryCap: 16,              // bounded per-patrol + player-stillness rows
});

export const MISTAKEN_WAVE_OFF_LINE = 'On your way, then.';
export const MISTAKEN_TOW_LINE = 'Clamping on. Wreck protocol.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a live lawful patrol hull (role patrol/police/security/customs or ai.lawful).
 */
export function isMistakenPatrol(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict || data.surrendered) return false;
  const role = String(
    (rec && rec.role)
    || data.trafficRole
    || data.jobKind
    || data.role
    || (data.ai && (data.ai.role || data.ai.archetype))
    || '',
  ).toLowerCase();
  const lawful = (data.ai && data.ai.lawful === true) || entity.team === 1;
  return lawful || role.includes('patrol') || role.includes('police') || role.includes('security');
}

/**
 * Decision helper (pure): is the player playing dead — dead-still with lamps off?
 */
export function playerPlayingDead(player, now, row, tuning = MISTAKEN_TUNING) {
  if (!player || !player.pos) return false;
  const vx = finite(player.vel && player.vel.x);
  const vz = finite(player.vel && player.vel.z);
  const still = Math.hypot(vx, vz) <= tuning.stillSpeedWu;
  const lampsOff = !player.data || (player.data.lampsOn !== true && player.data.lampsFlashing !== true);
  if (still && lampsOff) {
    if (!(Number.isFinite(row.stillSince) && row.stillSince >= 0)) row.stillSince = now;
  } else {
    row.stillSince = -1;
  }
  return Number.isFinite(row.stillSince) && row.stillSince >= 0 && now - row.stillSince >= tuning.stillForS;
}

/**
 * Memory-row builder (pure): per-patrol sweep bookkeeping, FIFO + stale eviction at the cap.
 */
export function mistakenRowFor(memory, key, now, cap = MISTAKEN_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > MISTAKEN_TUNING.towCooldownS * 2) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      stillSince: -1,
      phase: 'idle', // idle | sweeping | grace | towed
      phaseAt: -Infinity,
      tapsDone: 0,
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

export const mistakenOps = {
  _initMistaken(ctx = {}) {
    this._mistakenMemory = new Map();
    this._mistakenPlayerRow = null;
  },

  _mistakenMemoryMap() {
    if (!(this._mistakenMemory instanceof Map)) this._mistakenMemory = new Map();
    return this._mistakenMemory;
  },

  /**
   * Per-hull hook from the traffic dispatch (patrol hulls). Runs the sweep → taps → tow
   * ladder and the wave-off escape. Returns true only while a tow/tap beat actively claims
   * the patrol's intent beat this tick (it holds nose-on to you), false otherwise.
   */
  _reactMistaken(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!isMistakenPatrol(e, rec, state)) return false;
    if (!player || player.alive === false || !player.pos) return false;

    const now = finite(state.simTime, 0);
    const memory = this._mistakenMemoryMap();
    const row = mistakenRowFor(memory, e.id, now);
    if (!row) return false;
    row.lastAt = now;

    // Shared player-stillness tracking lives on the first patrol's row key.
    const playerRow = row;
    const dead = playerPlayingDead(player, now, playerRow);
    const dist = Math.hypot(finite(player.pos.x) - finite(e.pos.x), finite(player.pos.z) - finite(e.pos.z));
    const lampsOnNow = !!player.data && (player.data.lampsOn === true || player.data.lampsFlashing === true);
    const moving = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z)) > MISTAKEN_TUNING.stillSpeedWu * 2;

    // Wave-off: the player waved a lamp or moved off — the mistake clears.
    if (row.phase !== 'idle' && row.phase !== 'towed' && (lampsOnNow || moving || !dead)) {
      const wasSwept = row.phase !== 'idle';
      row.phase = 'idle';
      row.tapsDone = 0;
      row.stillSince = -1;
      releaseTrafficReaction(this, e);
      if (wasSwept && this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_MISTAKEN_WAVE_OFF_EVENT, { patrolId: e.id, playerId: player.id, t: now });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'bark',
            id: 'plants:pl102:waveoff',
            text: MISTAKEN_WAVE_OFF_LINE,
            kind: 'traffic',
            ttl: 4,
          });
        }
      }
      return false;
    }

    if (row.phase === 'towed') {
      if (now - row.phaseAt >= MISTAKEN_TUNING.towCooldownS) {
        row.phase = 'idle';
        row.tapsDone = 0;
      }
      return false;
    }

    if (dist > MISTAKEN_TUNING.sweepRangeWu) return false;

    // Sweep: lamp sweep + two taps spaced by tapGapS.
    if (row.phase === 'idle' && dead) {
      row.phase = 'sweeping';
      row.phaseAt = now;
      row.tapsDone = 1;
      const pdata = e.data || (e.data = {});
      pdata.lampsFlashing = true;
      pdata.lampFlashUntil = now + MISTAKEN_TUNING.waveOffLampsS;
      this._mistakenTap(e, now);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_MISTAKEN_SWEEP_EVENT, { patrolId: e.id, playerId: player.id, taps: 1, t: now });
      }
      return false;
    }

    if (row.phase === 'sweeping' && now - row.phaseAt >= MISTAKEN_TUNING.tapGapS && row.tapsDone < 2) {
      row.tapsDone = 2;
      row.phase = 'grace';
      row.phaseAt = now;
      this._mistakenTap(e, now);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_MISTAKEN_SWEEP_EVENT, { patrolId: e.id, playerId: player.id, taps: 2, t: now });
      }
      return false;
    }

    // Grace elapsed while still playing dead: the recovery tug clamps on and tows you in.
    if (row.phase === 'grace' && now - row.phaseAt >= MISTAKEN_TUNING.graceAfterTapsS) {
      row.phase = 'towed';
      row.phaseAt = now;
      this._mistakenSpawnTug(e, state, player, now);
      return false;
    }

    return false;
  },

  _mistakenTap(e, now) {
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('audio:cue', {
        id: 'ui_deny',
        position: { x: e.pos.x, z: e.pos.z },
        gain: 0.7,
        rate: 1.3,
      });
    }
  },

  _mistakenSpawnTug(patrol, state, player, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const tug = typeof spawnEntity === 'function'
      ? spawnEntity({
        type: 'ship',
        pos: {
          x: finite(player.pos.x) + finite(player.vel && player.vel.x) * 0.2,
          z: finite(player.pos.z) + finite(player.vel && player.vel.z) * 0.2,
        },
        vel: { x: 0, z: 0 },
        radius: MISTAKEN_TUNING.tugRadius,
        hull: MISTAKEN_TUNING.tugHull,
        hullMax: MISTAKEN_TUNING.tugHull,
        team: 1,
        data: {
          trafficRole: 'tug',
          plantsWreckTug: true,
          towTargetId: player.id,
          masslineTetherable: true,
          tetherable: true,
        },
      })
      : null;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_MISTAKEN_TOW_EVENT, {
        patrolId: patrol.id,
        playerId: player.id,
        tugId: tug && tug.id != null ? tug.id : null,
        t: now,
      });
      this.bus.emit('comms:popup', {
        id: 'plants:pl102:tow',
        sender: 'TUG',
        category: 'traffic',
        text: MISTAKEN_TOW_LINE,
        ttl: 6,
      });
    }
  },
};
