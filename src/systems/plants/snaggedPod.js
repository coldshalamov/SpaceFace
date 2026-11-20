// PL-177 The slow emergency — A snagged cargo pod hangs off an oblivious civilian hull; what you do with it is the story.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: A civilian's cargo hatch swings open and one pod hangs there, snagged, not
//   falling. They have not noticed
//   What the player can do: Bump it back in and take a flash of thanks; take it, and they never
//   knew; or bump it loose, and everyone knows
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via SNAGGED_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; this plant spawns a
//   pod and classifies player bumps — it never steers a hull.
// - Cooldowns per pod key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';

export const PLANTS_SNAGGED_POD_EVENT = 'plants:snaggedPodHung';
export const PLANTS_SNAGGED_RETURNED_EVENT = 'plants:snaggedPodReturned';
export const PLANTS_SNAGGED_TAKEN_EVENT = 'plants:snaggedPodTaken';
export const PLANTS_SNAGGED_LOOSE_EVENT = 'plants:snaggedPodLoose';

export const SNAGGED_TUNING = Object.freeze({
  spawnIntervalS: 40,         // one snagged pod may hang per this many seconds
  hatchOffsetWu: 18,          // the pod hangs this far off the hull edge
  activePodCap: 2,            // bounded live snagged pods
  podRadius: 3,
  podMass: 25,
  podHull: 20,
  hatchRadiusWu: 22,          // pod within this of the hull edge counts as "bumped back in"
  returnRelSpeedMaxWu: 60,    // a gentle bump returns it; harder knocks it loose
  knockClosingSpeedMinWu: 80, // hard impact speed (WU/s), above the gentle return band
  thanksCooldownS: 30,        // per-owner thanks cooldown
  memoryCap: 12,              // bounded pod rows
});

export const SNAGGED_THANKS_LINE = 'Good catch. Thanks.';
export const SNAGGED_ALARM_LINE = 'My pod! Stop!';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a loaded civilian hull that can drop a snagged pod (oblivious, not hostile).
 */
export function isSnaggedHostEligible(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict || data.surrendered) return false;
  if (data.ai && (data.ai.pirate === true || data.ai.hostile === true)) return false;
  const cargo = data.cargo;
  const loaded = data.loaded === true
    || (typeof cargo === 'number' && cargo > 0)
    || (cargo && typeof cargo === 'object' && Object.keys(cargo).length > 0)
    || Number(data.cargoUnits) > 0;
  return loaded;
}

/**
 * Memory-row builder (pure): snagged-pod bookkeeping keyed by pod id, FIFO + stale eviction.
 */
export function snaggedRowFor(memory, podId, now, cap = SNAGGED_TUNING.memoryCap) {
  if (!memory || !podId) return null;
  let row = memory.get(podId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || old.phase !== 'hung') memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { hostId: null, phase: 'hung', lastBumpAt: -Infinity, lastAt: now };
    memory.set(podId, row);
  }
  return row;
}

/**
 * Decision helper (pure): classify a player-pod impact — 'returned' when the pod ends up at
 * the host's hatch gently, 'loose' when the hit was hard, null otherwise.
 */
export function classifySnagBump(pod, host, closingSpeed, tuning = SNAGGED_TUNING) {
  if (!pod || !host || !pod.pos || !host.pos) return null;
  const d = Math.hypot(finite(pod.pos.x) - finite(host.pos.x), finite(pod.pos.z) - finite(host.pos.z));
  const reach = tuning.hatchRadiusWu + finite(host.radius, 8) + finite(pod.radius, 3);
  if (closingSpeed >= tuning.knockClosingSpeedMinWu) return 'loose';
  if (d <= reach && closingSpeed <= tuning.returnRelSpeedMaxWu) return 'returned';
  return null;
}

/**
 * Standalone plant: hangs a pod off an oblivious civilian's hatch now and then, and reacts to
 * what the player does with it.
 */
export const snaggedPodPlant = {
  name: 'plantsPl177',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._snaggedMemory = new Map();
    this._snaggedHostCooldown = new Map();
    this._snaggedNextSpawnAt = 0;
    if (this.bus && typeof this.bus.on === 'function') {
      this._snaggedOff = [
        this.bus.on('physics:impact', (p) => this._onSnaggedImpact(p)),
        this.bus.on('pickup:collected', (p) => this._onSnaggedPickup(p)),
        this.bus.on('entity:destroyed', (p) => this._onSnaggedDestroyed(p)),
        this.bus.on('sector:exit', () => this._snaggedReset()),
        this.bus.on('save:loaded', () => this._snaggedReset()),
      ];
    }
  },

  _snaggedReset() {
    this._snaggedMemory = new Map();
    this._snaggedHostCooldown = new Map();
    this._snaggedNextSpawnAt = 0;
  },

  _snaggedEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  _snaggedEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _snaggedSpawnPod(host, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const side = (hash32(now | 0, 'snagSide', String(host.id)) & 1) ? 1 : -1;
    const hx = finite(host.vel && host.vel.x);
    const hz = finite(host.vel && host.vel.z);
    const hSpeed = Math.hypot(hx, hz) || 1;
    const pod = spawnEntity({
      type: 'cargo',
      pos: {
        x: finite(host.pos.x) + (hx / hSpeed) * SNAGGED_TUNING.hatchOffsetWu + side * 4,
        z: finite(host.pos.z) + (hz / hSpeed) * SNAGGED_TUNING.hatchOffsetWu,
      },
      vel: { x: hx, z: hz }, // snagged: riding along with the host, not falling
      radius: SNAGGED_TUNING.podRadius,
      mass: SNAGGED_TUNING.podMass,
      physicsBody: { mass: SNAGGED_TUNING.podMass },
      hull: SNAGGED_TUNING.podHull,
      hullMax: SNAGGED_TUNING.podHull,
      data: {
        snaggedTo: host.id,
        snaggedPod: true,
        masslineTetherable: true,
        tetherable: true,
        scanLabel: 'Snagged pod',
      },
    });
    if (pod && pod.id != null) {
      const row = snaggedRowFor(this._snaggedMemory, pod.id, now);
      if (row) {
        row.hostId = host.id;
        row.phase = 'hung';
        row.lastAt = now;
      }
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SNAGGED_POD_EVENT, { podId: pod && pod.id, hostId: host.id, t: now });
    }
    return pod;
  },

  update() {
    if (!this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const now = finite(this.state.simTime, 0);
    if (now < this._snaggedNextSpawnAt) return;
    this._snaggedNextSpawnAt = now + SNAGGED_TUNING.spawnIntervalS;

    let live = 0;
    for (const row of this._snaggedMemory.values()) {
      if (row.phase === 'hung') live += 1;
    }
    if (live >= SNAGGED_TUNING.activePodCap) return;

    for (const ent of this._snaggedEntities()) {
      if (!isSnaggedHostEligible(ent, null, this.state)) continue;
      const last = this._snaggedHostCooldown.get(ent.id);
      if (Number.isFinite(last) && now - last < SNAGGED_TUNING.thanksCooldownS * 2) continue;
      this._snaggedHostCooldown.set(ent.id, now);
      this._snaggedSpawnPod(ent, now);
      return; // one per window
    }
  },

  /** physics:impact receipt: the player bumping a snagged pod. */
  _onSnaggedImpact(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.causalActorId !== this.state.playerId) return;
    const pod = this._snaggedEntityById(payload.aId) && payload.aId != null && this._snaggedMemory.has(payload.aId)
      ? this._snaggedEntityById(payload.aId)
      : this._snaggedEntityById(payload.bId);
    if (!pod) return;
    const row = this._snaggedMemory.get(pod.id);
    if (!row || row.phase !== 'hung') return;
    const host = this._snaggedEntityById(row.hostId);
    if (!host || host.alive === false) return;

    const now = finite(this.state.simTime, 0);
    row.lastBumpAt = now;
    row.lastAt = now;
    // Physics measures speed before the solver; camera trauma is zero on player contacts.
    // A missing measurement cannot classify a gentle return or a hard knock.
    if (!Number.isFinite(payload.preSolveClosingSpeed)) return;
    const verdict = classifySnagBump(pod, host, Math.max(0, payload.preSolveClosingSpeed));
    if (!verdict) return;

    const data = host.data || (host.data = {});
    if (verdict === 'returned') {
      row.phase = 'returned';
      data.lampsFlashing = true;
      data.lampFlashUntil = now + 1.2;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_SNAGGED_RETURNED_EVENT, { podId: pod.id, hostId: host.id, t: now });
        this.bus.emit('audio:cue', { id: 'confirm', position: { x: host.pos.x, z: host.pos.z }, gain: 0.6, rate: 1.1 });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'bark',
            id: 'plants:pl177:thanks',
            text: SNAGGED_THANKS_LINE,
            kind: 'traffic',
            ttl: 4,
          });
        }
      }
    } else {
      row.phase = 'loose';
      data.lampsFlashing = true;
      data.lampFlashUntil = now + 2.5;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_SNAGGED_LOOSE_EVENT, { podId: pod.id, hostId: host.id, t: now });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'bark',
            id: 'plants:pl177:alarm',
            text: SNAGGED_ALARM_LINE,
            kind: 'traffic',
            ttl: 4,
          });
        }
      }
    }
  },

  /** pickup:collected receipt: take it, and they never knew. */
  _onSnaggedPickup(payload) {
    if (!payload || !this.state) return;
    if (payload.collectorId !== this.state.playerId) return;
    const row = this._snaggedMemory.get(payload.pickupId);
    if (!row || row.phase !== 'hung') return;
    const now = finite(this.state.simTime, 0);
    row.phase = 'taken';
    row.lastAt = now;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SNAGGED_TAKEN_EVENT, { podId: payload.pickupId, hostId: row.hostId, t: now });
    }
  },

  /** entity:destroyed receipt: a snagged pod that dies (shot, despawned, collected elsewhere) frees its row. */
  _onSnaggedDestroyed(payload) {
    if (!payload || payload.id == null) return;
    if (!this._snaggedMemory || !this._snaggedMemory.has(payload.id)) return;
    // entity:destroyed queues after the map delete: a recycled pod id's memory row
    // belongs to the live snag — the dead pod's receipt must not free it.
    const live = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(payload.id) : null;
    if (payload.entity && live && live !== payload.entity) return;
    this._snaggedMemory.delete(payload.id);
  },

  destroy() {
    if (this._snaggedOff) {
      for (const off of this._snaggedOff) {
        if (typeof off === 'function') off();
      }
      this._snaggedOff = null;
    }
  },
};
