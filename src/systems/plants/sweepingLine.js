// PL-217 The sweeping line — After a spill a civilian walks the debris into a pile with a Rig wedge; join and it halves the time.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: After a spill, a civilian holds a Rig wedge down the lane and walks the
//   debris into a pile. Join with yours and it takes half the time, and the owner's thanks goes
//   out on open radio
//   What the player can do: Sweep it clean; or sweep the pile your own way — everyone saw which
//   way the wedge went
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via SWEEP_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the sweeper's walk is
//   a leased beat, aborted when refused. Pod nudges are physical pushes on spilled pods.
// - Cooldowns per spill key. All session state lives on `this`, never module-level.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_SWEEP_START_EVENT = 'plants:sweepStart';
export const PLANTS_SWEEP_DONE_EVENT = 'plants:sweepDone';
export const PLANTS_SWEEP_STRAY_EVENT = 'plants:sweepStray';

export const SWEEP_TUNING = Object.freeze({
  sweeperSpawnDistWu: 140,    // the sweeper arrives this far off the spill
  sweeperRadius: 7,
  sweeperHull: 55,
  sweeperLiveCap: 1,          // one sweeper hull in the world at a time
  pileRadiusWu: 26,           // pods inside this of the pile point count as piled
  pileTarget: 2,              // piled pods needed (or the clock) to call it clean
  sweepDurationS: 24,         // solo sweep time; joined, it takes half
  joinRadiusWu: 130,          // player bumping spilled pods inside this = joined
  wedgeRadiusWu: 90,          // pods within this of the sweeper feel the wedge
  nudgePerTickWu: 1.6,        // pod velocity increment per tick toward the pile
  strayRadiusWu: 300,         // a joined pod dragged beyond this = swept your own way
  tickS: 1 / 60,              // sim tick, for deterministic nudge math
  memoryCap: 8,               // one sweep at a time; rows bounded anyway
});

export const SWEEP_THANKS_LINE = 'Swept clean. Thank you.';
export const SWEEP_STRAY_LINE = 'Everyone saw where that went.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): pod push direction toward the pile, unit length, or null.
 */
export function sweepNudge(podPos, pilePos, pileRadius) {
  if (!podPos || !pilePos) return null;
  const dx = finite(pilePos.x) - finite(podPos.x);
  const dz = finite(pilePos.z) - finite(podPos.z);
  const d = Math.hypot(dx, dz);
  if (!(d > pileRadius)) return null;
  return { x: dx / d, z: dz / d, dist: d };
}

/**
 * Memory-row builder (pure): the single active sweep row (or null).
 */
export function sweepRowFor(memory, key, now, cap = SWEEP_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      sweeperId: null,
      podIds: [],
      pileX: 0,
      pileZ: 0,
      startedAt: -Infinity,
      joined: false,
      strayed: false,
      done: false,
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

export const sweepingLineOps = {
  _initSweepingLine(ctx = {}) {
    this._sweepMemory = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._sweepInstalled) {
      this._sweepInstalled = true;
      this.bus.on('freight:cargoSpilled', (p) => this._onSweepSpill(p));
      this.bus.on('physics:impact', (p) => this._onSweepImpact(p));
      this.bus.on('sector:exit', () => this._sweepReset());
      this.bus.on('save:loaded', () => this._sweepReset());
    }
  },

  _sweepReset() {
    // Sweeper hulls never outlive the sector (they are not traffic census hulls).
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const row of this._sweepMemoryMap().values()) {
        if (row.sweeperId != null) removeEntity(row.sweeperId);
      }
    }
    this._sweepMemory = new Map();
  },

  _sweepDespawnSweeper(row) {
    if (row.sweeperId == null) return;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') removeEntity(row.sweeperId);
    row.sweeperId = null;
  },

  _sweepMemoryMap() {
    if (!(this._sweepMemory instanceof Map)) this._sweepMemory = new Map();
    return this._sweepMemory;
  },

  _sweepEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  /** freight:cargoSpilled receipt: the sweeper arrives and starts the pile. */
  _onSweepSpill(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const spilled = this._sweepEntityById(payload.entityId);
    const pos = payload.pos || spilled?.pos || null;
    if (!pos) return;
    const now = finite(this.state.simTime, 0);
    const memory = this._sweepMemoryMap();
    // Cap live sweeper hulls, not just rows: the oldest sweeper's shift ends now.
    let live = 0;
    for (const existing of memory.values()) {
      if (existing.sweeperId != null && !existing.done) live += 1;
    }
    if (live >= SWEEP_TUNING.sweeperLiveCap) {
      for (const existing of memory.values()) {
        if (existing.sweeperId != null) {
          this._sweepDespawnSweeper(existing);
          existing.done = true;
          break;
        }
      }
    }
    if (memory.size >= SWEEP_TUNING.memoryCap) memory.delete(memory.keys().next().value);
    this._sweepSeq = (this._sweepSeq || 0) + 1;

    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const sweeper = typeof spawnEntity === 'function'
      ? spawnEntity({
        type: 'ship',
        pos: { x: pos.x + SWEEP_TUNING.sweeperSpawnDistWu, z: pos.z },
        vel: { x: 0, z: 0 },
        radius: SWEEP_TUNING.sweeperRadius,
        hull: SWEEP_TUNING.sweeperHull,
        hullMax: SWEEP_TUNING.sweeperHull,
        team: 2,
        data: {
          trafficRole: 'tug',
          plantsSweepSquad: true,
          masslineTetherable: true,
          tetherable: true,
        },
      })
      : null;

    const row = sweepRowFor(memory, `sweep:${this._sweepSeq}`, now);
    if (!row) return;
    row.lastAt = now;
    row.sweeperId = sweeper && sweeper.id != null ? sweeper.id : null;
    row.pileX = pos.x;
    row.pileZ = pos.z;
    row.startedAt = now;
    row.podIds = Array.isArray(payload.podIds) ? payload.podIds.slice(0, 12) : [];
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SWEEP_START_EVENT, {
        sweeperId: row.sweeperId,
        podIds: row.podIds,
        pileX: row.pileX,
        pileZ: row.pileZ,
        t: now,
      });
    }
  },

  /** physics:impact receipt: the player bumps a spilled pod — joining, or sweeping their own way. */
  _onSweepImpact(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.causalActorId !== this.state.playerId) return;
    const now = finite(this.state.simTime, 0);
    const player = this._sweepEntityById(this.state.playerId);
    for (const row of this._sweepMemoryMap().values()) {
      if (row.done || !Array.isArray(row.podIds)) continue;
      const podHit = row.podIds.includes(payload.aId) ? payload.aId
        : row.podIds.includes(payload.bId) ? payload.bId : null;
      if (podHit == null) continue;
      if (!player || !player.pos) return;
      const d = Math.hypot(finite(player.pos.x) - row.pileX, finite(player.pos.z) - row.pileZ);
      if (d <= SWEEP_TUNING.joinRadiusWu) {
        row.joined = true;
        row.lastAt = now;
      } else {
        // Dragging a spill pod away from the pile zone = sweeping it your own way.
        const pod = this._sweepEntityById(podHit);
        if (pod && pod.pos) {
          const pd = Math.hypot(finite(pod.pos.x) - row.pileX, finite(pod.pos.z) - row.pileZ);
          if (pd > SWEEP_TUNING.strayRadiusWu && !row.strayed) {
            row.strayed = true;
            row.lastAt = now;
            if (this.bus && typeof this.bus.emit === 'function') {
              this.bus.emit(PLANTS_SWEEP_STRAY_EVENT, { podId: podHit, t: now });
              if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
                this.helpers.voice.say({
                  channel: 'comms',
                  id: 'plants:pl217:stray',
                  text: SWEEP_STRAY_LINE,
                  kind: 'traffic',
                  ttl: 4,
                });
              }
            }
          }
        }
      }
    }
  },

  // Plant-owned actors have no freighter record, so the census dispatch cannot tick them.
  _stepSweepingLine(state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    for (const row of this._sweepMemoryMap().values()) {
      if (row.done || row.sweeperId == null) continue;
      const sweeper = this._sweepEntityById(row.sweeperId);
      if (!sweeper || sweeper.alive === false) {
        row.sweeperId = null;
        row.done = true;
        continue;
      }
      this._reactSweepingLine(sweeper, null, [], state, null);
    }
  },

  /**
   * Per-hull hook for the plant-owned sweeper (the sweeper hull): holds the wedge down the lane
   * and walks spilled pods into the pile. Returns true while the sweep beat is leased.
   */
  _reactSweepingLine(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    const data = e && e.data;
    if (!data || data.plantsSweepSquad !== true) return false;

    const now = finite(state.simTime, 0);
    let row = null;
    for (const candidate of this._sweepMemoryMap().values()) {
      if (candidate.sweeperId === e.id) { row = candidate; break; }
    }
    if (!row || row.done) {
      releaseTrafficReaction(this, e);
      return false;
    }
    row.lastAt = now;

    // Walk the wedge: lease a slow advance on the pile head.
    const aim = Math.atan2(row.pileZ - finite(e.pos.z), row.pileX - finite(e.pos.x));
    const elapsed = now - row.startedAt;
    const budget = row.joined ? SWEEP_TUNING.sweepDurationS / 2 : SWEEP_TUNING.sweepDurationS;
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, Math.max(0.5, budget - elapsed));
    if (!owned) return false; // refused: no second intent writer, the sweep stands down

    // The wedge gathers pods within reach; joined, the wedge pushes at double rate.
    const rate = SWEEP_TUNING.nudgePerTickWu * (row.joined ? 2 : 1);
    let piled = 0;
    for (const podId of row.podIds) {
      const pod = this._sweepEntityById(podId);
      if (!pod || pod.alive === false || !pod.pos) continue;
      const pd = Math.hypot(finite(pod.pos.x) - row.pileX, finite(pod.pos.z) - row.pileZ);
      if (pd <= SWEEP_TUNING.pileRadiusWu) { piled += 1; continue; }
      // Only pods inside the wedge reach feel the push.
      const wd = Math.hypot(finite(pod.pos.x) - finite(e.pos.x), finite(pod.pos.z) - finite(e.pos.z));
      if (wd > SWEEP_TUNING.wedgeRadiusWu) continue;
      const nudge = sweepNudge(pod.pos, { x: row.pileX, z: row.pileZ }, SWEEP_TUNING.pileRadiusWu * 0.5);
      if (!nudge) { piled += 1; continue; }
      pod.vel = pod.vel || { x: 0, z: 0 };
      pod.vel.x += nudge.x * rate;
      pod.vel.z += nudge.z * rate;
    }

    if (piled >= SWEEP_TUNING.pileTarget || elapsed >= budget) {
      row.done = true;
      releaseTrafficReaction(this, e);
      // The shift is over: the sweeper hull leaves the lane (no leak).
      this._sweepDespawnSweeper(row);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_SWEEP_DONE_EVENT, {
          sweeperId: e.id,
          piled,
          joined: row.joined,
          strayed: row.strayed,
          t: now,
        });
        if (!row.strayed) {
          this.bus.emit('comms:popup', {
            id: 'plants:pl217:thanks',
            sender: 'CARGO OWNER',
            category: 'traffic',
            text: SWEEP_THANKS_LINE,
            ttl: 6,
          });
          this.bus.emit('audio:cue', { id: 'confirm', position: { x: e.pos.x, z: e.pos.z }, gain: 0.6, rate: 1 });
        }
      }
      return false;
    }
    return true;
  },
};
