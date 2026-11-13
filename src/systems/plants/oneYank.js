// PL-219 One yank — A loader drops a crate stack at a market; a practiced hauler yanks it back into a stack.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: A loader drops a crate stack at a market and a passing hauler Pulls it back
//   into a stack, mid-air, one practiced yank. The lane applauds
//   What the player can do: Try it yourself: misjudge the well, and the whole pile lands on you
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via ONE_YANK_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the yanking hauler is
//   leased toward the stack, aborted when refused. Pod pulls are physical velocity writes on
//   the falling pods this plant spawned.
// - Cooldowns per hauler key. All session state lives on `this`, never module-level.
//
// The well is real: falling pods land on a deterministic beat (fallTimeS after the drop). If
// the player is standing inside the well (playerPullRadiusWu of the stack point) at landing,
// the pile lands on them — a real impulse through the physics authority
// (queuePhysicsImpulse, src/core/physicsAuthority.js) plus the deny beat.

import { hash32 } from '../../core/rng.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { requestTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_ONE_YANK_DROP_EVENT = 'plants:oneYankDrop';
export const PLANTS_ONE_YANK_PULL_EVENT = 'plants:oneYankPull';
export const PLANTS_ONE_YANK_APPLAUSE_EVENT = 'plants:oneYankApplause';
export const PLANTS_ONE_YANK_LANDED_EVENT = 'plants:oneYankLandedOnYou';

export const ONE_YANK_TUNING = Object.freeze({
  dropDelayS: 30,             // the loader drops a stack this long after sector entry
  stackPods: 3,               // crates in the dropped stack
  podRadius: 4,
  podMass: 30,
  podHull: 24,
  dropSpreadWu: 45,           // the crates tumble apart onto a ring of this radius
  yankRangeWu: 200,           // a hauler within this of the falling stack may yank it
  pullRadiusWu: 60,           // the yank reaches pods within this of the stack point
  pullSpeedWu: 30,            // the practiced yank's pull speed toward the stack point
  stackRadiusWu: 24,          // pods within this of the stack point count as stacked
  fallTimeS: 6,               // the loader's crates land this long after the drop
  wellImpulseWu: 260,         // the pile landing shoves the player this hard (physics budget)
  yankDurationS: 6,           // the leased yank beat
  haulerCooldownS: 10,        // per-hauler yank cooldown
  playerPullRadiusWu: 70,     // the "well": standing inside this at landing means the pile lands on you
  pileClosingSpeedMinWu: 10, // measured pre-solve closing speed (WU/s) for the pile landing
  applauseLampS: 0.9,         // the lane's dock lamps flash twice worth
  memoryCap: 8,               // one drop at a time; bounded anyway
});

export const ONE_YANK_LANDED_LINE = 'The whole pile. Smooth.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: an ambient hauler able to make the practiced yank.
 */
export function isYankHauler(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict || data.plantsSweepSquad || data.plantsWreckTug) return false;
  if (data.ai && data.ai.pirate === true) return false;
  const role = String(
    (rec && rec.role)
    || data.trafficRole
    || data.role
    || (data.ai && (data.ai.role || data.ai.archetype))
    || '',
  ).toLowerCase();
  return role.includes('hauler') || role.includes('freighter') || role.includes('tug');
}

/**
 * Decision helper (pure): pull direction toward the stack point, unit length, or null.
 */
export function yankPull(podPos, stackPos, stackRadius) {
  if (!podPos || !stackPos) return null;
  const dx = finite(stackPos.x) - finite(podPos.x);
  const dz = finite(stackPos.z) - finite(podPos.z);
  const d = Math.hypot(dx, dz);
  if (!(d > stackRadius)) return null;
  return { x: dx / d, z: dz / d, dist: d };
}

/**
 * Memory-row builder (pure): the single active drop row, FIFO + stale eviction at the cap.
 */
export function oneYankRowFor(memory, key, now, cap = ONE_YANK_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      podIds: [],
      stackX: 0,
      stackZ: 0,
      stationId: null,
      droppedAt: -Infinity,
      landAt: -Infinity,
      landed: false,
      yanked: false,
      playerTried: false,
      landedOnPlayer: false,
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

export const oneYankOps = {
  _initOneYank(ctx = {}) {
    this._oneYankMemory = new Map();
    this._oneYankHulls = new Map();
    this._oneYankDropAt = -1;
    this._oneYankScheduled = false;
    if (this.bus && typeof this.bus.on === 'function' && !this._oneYankInstalled) {
      this._oneYankInstalled = true;
      this.bus.on('physics:impact', (p) => this._onOneYankImpact(p));
      this.bus.on('sector:exit', () => this._oneYankReset());
      this.bus.on('save:loaded', () => this._oneYankReset());
    }
  },

  _oneYankReset() {
    this._oneYankMemory = new Map();
    this._oneYankHulls = new Map();
    this._oneYankDropAt = -1;
    this._oneYankScheduled = false;
  },

  _oneYankMemoryMap() {
    if (!(this._oneYankMemory instanceof Map)) this._oneYankMemory = new Map();
    return this._oneYankMemory;
  },

  _oneYankEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _oneYankEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  _oneYankDrop(state, now) {
    const stations = Array.isArray(state.stations) ? state.stations : [];
    const market = stations.find((s) => s && s.alive !== false && s.type === 'station' && s.pos
      && !(s.data && (s.data.isGate || s.data.isWormhole)));
    if (!market) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const sectorId = (state.world && state.world.currentSectorId) || 's';
    const ang = (hash32(sectorId, 'oneYankAngle', 'a') % 6283) / 1000;
    const cx = finite(market.pos.x) + Math.cos(ang) * ONE_YANK_TUNING.dropSpreadWu;
    const cz = finite(market.pos.z) + Math.sin(ang) * ONE_YANK_TUNING.dropSpreadWu;

    const row = oneYankRowFor(this._oneYankMemoryMap(), 'drop', now);
    if (!row) return;
    row.lastAt = now;
    row.stackX = cx;
    row.stackZ = cz;
    row.stationId = (market.data && market.data.stationId) || market.id;
    row.droppedAt = now;
    row.landAt = now + ONE_YANK_TUNING.fallTimeS;
    row.podIds = [];
    for (let i = 0; i < ONE_YANK_TUNING.stackPods; i += 1) {
      const podAng = ang + (i * Math.PI * 2) / ONE_YANK_TUNING.stackPods;
      const pod = spawnEntity({
        type: 'cargo',
        pos: {
          x: cx + Math.cos(podAng) * ONE_YANK_TUNING.dropSpreadWu,
          z: cz + Math.sin(podAng) * ONE_YANK_TUNING.dropSpreadWu,
        },
        vel: { x: Math.cos(ang + i) * 8, z: Math.sin(ang + i) * 8 },
        radius: ONE_YANK_TUNING.podRadius,
        mass: ONE_YANK_TUNING.podMass,
        physicsBody: { mass: ONE_YANK_TUNING.podMass },
        hull: ONE_YANK_TUNING.podHull,
        hullMax: ONE_YANK_TUNING.podHull,
        data: {
          oneYankFalling: true,
          masslineTetherable: true,
          tetherable: true,
          scanLabel: 'Market crate',
        },
      });
      if (pod && pod.id != null) row.podIds.push(pod.id);
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_ONE_YANK_DROP_EVENT, {
        stationId: row.stationId,
        podIds: row.podIds,
        stackX: cx,
        stackZ: cz,
        t: now,
      });
    }
  },

  /**
   * Per-hull hook from the traffic dispatch: a passing hauler makes the practiced yank —
   * leased toward the stack point, pulling falling pods in as it goes. Returns true while the
   * yank beat is being flown.
   */
  _reactOneYank(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!isYankHauler(e, rec, state)) return false;
    const now = finite(state.simTime, 0);

    // Schedule the drop once per sector.
    if (!this._oneYankScheduled) {
      this._oneYankScheduled = true;
      this._oneYankDropAt = now + ONE_YANK_TUNING.dropDelayS;
    }
    const row = oneYankRowFor(this._oneYankMemoryMap(), 'drop', now);
    if (!row) return false;
    row.lastAt = now;
    if (!row.podIds.length && row.droppedAt < 0 && now >= this._oneYankDropAt) {
      this._oneYankDrop(state, now);
    }
    if (!row.podIds.length || row.yanked) return false;

    // The well: when the crates land, a player standing inside the well takes the pile.
    if (!row.landed && row.landAt >= 0 && now >= row.landAt) {
      row.landed = true;
      const wellSq = ONE_YANK_TUNING.playerPullRadiusWu * ONE_YANK_TUNING.playerPullRadiusWu;
      const inWell = player && player.pos
        && (finite(player.pos.x) - row.stackX) ** 2 + (finite(player.pos.z) - row.stackZ) ** 2 <= wellSq;
      if (inWell) {
        row.landedOnPlayer = true;
        // The whole pile lands on you: a real impulse through the physics authority.
        const dx = finite(player.pos.x) - row.stackX;
        const dz = finite(player.pos.z) - row.stackZ;
        const d = Math.hypot(dx, dz) || 1;
        queuePhysicsImpulse(player, {
          x: (dx / d) * ONE_YANK_TUNING.wellImpulseWu,
          y: 0,
          z: (dz / d) * ONE_YANK_TUNING.wellImpulseWu,
        }, { externalEffect: true, isPlayerTarget: true, tick: Number.isInteger(state.tick) ? state.tick : 0 });
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_ONE_YANK_LANDED_EVENT, {
            playerId: player.id,
            stackX: row.stackX,
            stackZ: row.stackZ,
            impulse: ONE_YANK_TUNING.wellImpulseWu,
            t: now,
          });
          this.bus.emit('audio:cue', { id: 'ui_deny', position: { x: player.pos.x, z: player.pos.z }, gain: 0.8, rate: 0.9 });
          if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
            this.helpers.voice.say({
              channel: 'comms',
              id: 'plants:pl219:well',
              text: ONE_YANK_LANDED_LINE,
              kind: 'traffic',
              ttl: 4,
            });
          }
        }
      }
    }

    // All down and stacked: the lane applauds (checked every tick — pods settle by physics).
    let stackedEarly = 0;
    for (const podId of row.podIds) {
      const pod = this._oneYankEntityById(podId);
      if (!pod || !pod.pos) continue;
      const sd = Math.hypot(finite(pod.pos.x) - row.stackX, finite(pod.pos.z) - row.stackZ);
      if (sd <= ONE_YANK_TUNING.stackRadiusWu) stackedEarly += 1;
    }
    if (stackedEarly >= row.podIds.length) {
      row.yanked = true;
      const station = stations && Array.isArray(stations)
        ? stations.find((s) => s && ((s.data && s.data.stationId) || s.id) === row.stationId)
        : null;
      if (station) {
        const sdata = station.data || (station.data = {});
        sdata.dockLampsFlashing = true;
        sdata.dockLampFlashUntil = now + ONE_YANK_TUNING.applauseLampS;
      }
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_ONE_YANK_APPLAUSE_EVENT, { haulerId: e.id, stacked: stackedEarly, t: now });
        this.bus.emit('audio:cue', {
          id: 'sfx_hauler_blast_lean',
          position: { x: row.stackX, z: row.stackZ },
          gain: 0.7,
          rate: 1.2,
        });
        this.bus.emit('audio:cue', { id: 'confirm', position: { x: row.stackX, z: row.stackZ }, gain: 0.6, rate: 1 });
      }
      return false;
    }

    // A hauler near the falling stack.
    const d = Math.hypot(finite(e.pos.x) - row.stackX, finite(e.pos.z) - row.stackZ);
    if (d > ONE_YANK_TUNING.yankRangeWu) return false;

    let hullRow = this._oneYankHulls.get(e.id);
    if (!hullRow || !(now >= hullRow.lastAt)) {
      if (this._oneYankHulls.size >= ONE_YANK_TUNING.memoryCap) {
        while (this._oneYankHulls.size >= ONE_YANK_TUNING.memoryCap) this._oneYankHulls.delete(this._oneYankHulls.keys().next().value);
      }
      hullRow = { lastYankAt: -Infinity, lastAt: now };
      this._oneYankHulls.set(e.id, hullRow);
    }
    hullRow.lastAt = now;
    if (now - hullRow.lastYankAt < ONE_YANK_TUNING.haulerCooldownS) return false;

    const aim = Math.atan2(row.stackZ - finite(e.pos.z), row.stackX - finite(e.pos.x));
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, ONE_YANK_TUNING.yankDurationS);
    if (!owned) return false; // refused: abort, the job keeps its course
    hullRow.lastYankAt = now;

    // One practiced yank: pods within reach of the stack point snap toward it.
    for (const podId of row.podIds) {
      const pod = this._oneYankEntityById(podId);
      if (!pod || pod.alive === false || !pod.pos || !(pod.data && pod.data.oneYankFalling)) continue;
      const pd = Math.hypot(finite(pod.pos.x) - row.stackX, finite(pod.pos.z) - row.stackZ);
      if (pd > ONE_YANK_TUNING.pullRadiusWu) continue;
      const pull = yankPull(pod.pos, { x: row.stackX, z: row.stackZ }, ONE_YANK_TUNING.stackRadiusWu * 0.5);
      if (!pull) continue;
      pod.vel = pod.vel || { x: 0, z: 0 };
      pod.vel.x = pull.x * ONE_YANK_TUNING.pullSpeedWu;
      pod.vel.z = pull.z * ONE_YANK_TUNING.pullSpeedWu;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_ONE_YANK_PULL_EVENT, { haulerId: e.id, podId, t: now });
      }
    }
    return true;
  },

  /** physics:impact receipt: the player tries it themselves — or the pile lands on them. */
  _onOneYankImpact(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const now = finite(this.state.simTime, 0);
    const row = this._oneYankMemoryMap().get('drop');
    if (!row || !row.podIds.length) return;
    const playerId = this.state.playerId;

    const podId = row.podIds.includes(payload.aId) ? payload.aId
      : row.podIds.includes(payload.bId) ? payload.bId : null;
    const playerInvolved = payload.aId === playerId || payload.bId === playerId;
    if (podId == null || !playerInvolved) return;

    // Misjudged the well: the whole pile lands on you.
    if (finite(payload.preSolveClosingSpeed, 0) >= ONE_YANK_TUNING.pileClosingSpeedMinWu && !row.landed) {
      row.landed = true;
      row.lastAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_ONE_YANK_LANDED_EVENT, { podId, playerId, closingSpeed: payload.preSolveClosingSpeed, t: now });
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.8, rate: 0.9 });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'comms',
            id: 'plants:pl219:landed',
            text: ONE_YANK_LANDED_LINE,
            kind: 'traffic',
            ttl: 4,
          });
        }
      }
      return;
    }

    // First touch counts as trying it yourself.
    if (!row.playerTried) {
      row.playerTried = true;
      row.lastAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_ONE_YANK_PULL_EVENT, { haulerId: playerId, podId, t: now });
      }
    }
  },
};
